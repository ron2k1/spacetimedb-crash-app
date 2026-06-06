// CrashSocket -- the R3F renderer's WebSocket client for the frozen Crash protocol.
//
// Lifecycle: connect() opens ws://host:port and sends `hello` on open. The engine replies
// with `session.ready`, which carries the engine-assigned sessionId we then stamp on every
// later outbound frame. Inbound frames are validated with EngineToRendererSchema.safeParse;
// a frame that fails validation is DROPPED (logged as a synthetic code), never thrown -- the
// engine is authoritative, the renderer stays defensive so a bad frame can't white-screen
// the user's session.
//
// SECURITY: the token is a localhost capability presented once in `hello`; it is never
// logged. Inbound `error` frames carry only { code, retryable } by contract -- we surface
// those, never a message/stack/prompt/credential.

import {
  EngineToRendererSchema,
  PROTOCOL_VERSION,
  type EngineToRenderer,
  type Provider,
} from '@crash/protocol';
import type { CrashBoot } from './boot';

export type ConnState = 'connecting' | 'ready' | 'closed' | 'error';

/** The slice of the WebSocket API CrashSocket needs; injectable so tests use a fake. */
export interface WsLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}
export type WsFactory = (url: string) => WsLike;

const WS_OPEN = 1;

export interface CrashSocketOptions {
  wsFactory?: WsFactory;
  idFactory?: () => string;
  renderer?: string;
}

export class CrashSocket {
  private ws: WsLike | null = null;
  private seq = 0;
  private sessionId = '';
  private state: ConnState = 'connecting';
  private readonly wsFactory: WsFactory;
  private readonly idFactory: () => string;
  private readonly renderer: string;

  constructor(
    private readonly boot: CrashBoot,
    private readonly sink: (e: EngineToRenderer) => void,
    private readonly onState: (s: ConnState) => void,
    opts: CrashSocketOptions = {},
  ) {
    this.wsFactory = opts.wsFactory ?? ((url) => new WebSocket(url) as unknown as WsLike);
    this.idFactory = opts.idFactory ?? defaultId;
    this.renderer = opts.renderer ?? 'r3f';
  }

  get connectionState(): ConnState {
    return this.state;
  }

  connect(): void {
    this.setState('connecting');
    const ws = this.wsFactory(`ws://${this.boot.host}:${this.boot.port}`);
    this.ws = ws;
    ws.onopen = () => this.sendHello();
    ws.onmessage = (ev) => this.handleFrame(ev.data);
    ws.onclose = () => this.setState('closed');
    ws.onerror = () => this.setState('error');
  }

  // ---- outbound (Renderer -> Engine) ----

  /** Submit the user's request. Returns the generated requestId for UI correlation.
   *  agentId (optional) targets a specific marketplace agent so the engine can run it as that
   *  persona/listing; absent = the default request flow. Built conditionally so an unused
   *  optional never serializes as a literal `undefined` key on the wire. */
  submitRequest(text: string, targetPath?: string, agentId?: string): string {
    const requestId = this.idFactory();
    const payload: {
      requestId: string;
      text: string;
      targetPath?: string;
      agentId?: string;
    } = { requestId, text };
    if (targetPath) payload.targetPath = targetPath;
    if (agentId) payload.agentId = agentId;
    this.send('request.submit', payload);
    return requestId;
  }
  confirmPlan(planId: string): void {
    this.send('plan.confirm', { planId });
  }
  cancelPlan(planId: string): void {
    this.send('plan.cancel', { planId });
  }
  respondConfirm(confirmId: string, approved: boolean): void {
    this.send('confirm.response', { confirmId, approved });
  }
  acceptSkillSave(requestId: string, name: string): void {
    this.send('skill.save.accept', { requestId, name });
  }
  cancelRun(requestId: string): void {
    this.send('run.cancel', { requestId });
  }

  // ---- auth (Renderer -> Engine) ----

  /** Ask the engine for the current per-provider auth snapshot. Connect is side-effect-free
   *  server-side: the engine never pushes auth.status on its own, so the renderer must ask. */
  queryAuthStatus(): void {
    this.send('auth.status.query', {});
  }
  /** Ask the engine to spawn the interactive login terminal for a provider. The token is typed
   *  by the user IN THAT TERMINAL -- it never transits this socket. */
  startProviderLogin(provider: Provider): void {
    this.send('auth.login.start', { provider });
  }

  close(): void {
    this.ws?.close();
  }

  // ---- internals ----

  private sendHello(): void {
    // provider is display-only but a zod ENUM server-side: an invalid literal fails
    // safeParse -> ws.close(1008). Coerce the descriptor's value to a valid member.
    const provider: Provider = this.boot.provider === 'codex' ? 'codex' : 'claude-code';
    // hello is the only frame with sessionId="" and MUST be first; bypasses the ready gate.
    this.rawSend('hello', '', {
      token: this.boot.token,
      protocolVersion: PROTOCOL_VERSION,
      renderer: this.renderer,
      provider,
    });
  }

  private send(type: string, payload: unknown): void {
    if (this.state !== 'ready') {
      // User-initiated frames before session.ready are dropped, not queued -- the UI gates
      // submit on connection state. Surface a synthetic code only.
      console.warn('crash_socket_not_ready', type);
      return;
    }
    this.rawSend(type, this.sessionId, payload);
  }

  private rawSend(type: string, sessionId: string, payload: unknown): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WS_OPEN) {
      console.warn('crash_socket_send_no_open', type);
      return;
    }
    const frame = { v: PROTOCOL_VERSION, type, sessionId, seq: this.seq++, payload };
    ws.send(JSON.stringify(frame));
  }

  private handleFrame(data: unknown): void {
    if (typeof data !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      console.warn('crash_bad_frame_json');
      return;
    }
    const result = EngineToRendererSchema.safeParse(parsed);
    if (!result.success) {
      // Never log the payload (it could echo content); log only a synthetic marker.
      console.warn('crash_bad_frame_schema');
      return;
    }
    const event = result.data;
    if (event.type === 'session.ready') {
      this.sessionId = event.payload.sessionId;
      this.setState('ready');
      // Contract: the engine does NOT push auth.status on connect -- ask for it now that the
      // session is live so the login gate can show real provider status without a user action.
      this.queryAuthStatus();
    } else if (event.type === 'plan.proposed') {
      // The shipped chat surface (ChatPanel) is a pure conversation with no "Start this plan"
      // button, but the engine's Spec-4 loop parks at awaiting_confirm after plan.proposed and
      // only reaches provider.run() once plan.confirm arrives. Auto-confirm here -- same shape as
      // the session.ready -> auth.status.query auto-response above: an inbound engine frame the
      // renderer must answer automatically to keep the protocol session flowing. Without it the
      // chat bubble streams ThinkingDots forever and the headless CLI never runs. The plan is
      // still forwarded to the store below; this renderer simply auto-approves it.
      this.confirmPlan(event.payload.planId);
    }
    this.sink(event);
  }

  private setState(s: ConnState): void {
    this.state = s;
    this.onState(s);
  }
}

function defaultId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Fallback id; uniqueness only needs to hold per low-volume session.
  return 'req-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
