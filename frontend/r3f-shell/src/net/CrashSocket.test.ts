import { describe, it, expect } from 'vitest';
import { CrashSocket, type WsLike } from './CrashSocket';
import { RendererToEngineSchema, HelloSchema, makeMessage, PROTOCOL_VERSION } from '@crash/protocol';
import type { EngineToRenderer } from '@crash/protocol';
import type { CrashBoot } from './boot';

const BOOT: CrashBoot = {
  host: '127.0.0.1',
  port: 50505,
  token: 'cap-token-abc',
  protocolVersion: 1,
  provider: 'claude-code',
};

/** In-memory WebSocket double: records outbound frames, lets the test drive inbound ones. */
class FakeWs implements WsLike {
  sent: string[] = [];
  readyState = WsLikeOpen;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.onclose?.({ code: 1000, reason: '' });
  }
  // test drivers
  open(): void {
    this.onopen?.({});
  }
  deliver(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
  deliverRaw(s: unknown): void {
    this.onmessage?.({ data: s });
  }
}
const WsLikeOpen = 1;

function setup() {
  const fake = new FakeWs();
  const events: EngineToRenderer[] = [];
  const states: string[] = [];
  const sock = new CrashSocket(
    BOOT,
    (e) => events.push(e),
    (s) => states.push(s),
    { wsFactory: () => fake, idFactory: () => 'fixed-req-id' },
  );
  sock.connect();
  return { fake, events, states, sock };
}

/** setup() + open + a valid session.ready so the socket is in the READY state. */
function ready() {
  const h = setup();
  h.fake.open();
  h.fake.deliver(
    makeMessage('session.ready', 'sess-42', 0, {
      sessionId: 'sess-42',
      protocolVersion: 1,
      engineVersion: '0.1.0',
      provider: 'claude-code',
    }),
  );
  return h;
}

describe('CrashSocket hello handshake', () => {
  it('sends a schema-valid hello as the first frame on open', () => {
    const { fake } = setup();
    fake.open();
    expect(fake.sent).toHaveLength(1);
    const frame = JSON.parse(fake.sent[0]!);
    expect(HelloSchema.safeParse(frame).success).toBe(true);
    expect(frame.type).toBe('hello');
    expect(frame.sessionId).toBe('');
    expect(frame.seq).toBe(0);
    expect(frame.payload.token).toBe('cap-token-abc');
    expect(frame.payload.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(frame.payload.renderer).toBe('r3f');
    expect(frame.payload.provider).toBe('claude-code');
  });
});

describe('CrashSocket session lifecycle', () => {
  it('captures sessionId from session.ready and reports the ready state', () => {
    const { events, states } = ready();
    expect(states).toContain('ready');
    expect(events.at(-1)?.type).toBe('session.ready');
  });

  it('stamps the captured sessionId on a later request.submit', () => {
    const { fake, sock } = ready();
    const before = fake.sent.length;
    const reqId = sock.submitRequest('summarize my taxes folder', '/Users/me/Crash/taxes');
    expect(reqId).toBe('fixed-req-id');
    const frame = JSON.parse(fake.sent[before]!);
    expect(RendererToEngineSchema.safeParse(frame).success).toBe(true);
    expect(frame.type).toBe('request.submit');
    expect(frame.sessionId).toBe('sess-42');
    expect(frame.payload.requestId).toBe('fixed-req-id');
    expect(frame.payload.text).toBe('summarize my taxes folder');
    expect(frame.payload.targetPath).toBe('/Users/me/Crash/taxes');
  });

  it('drops user frames before session.ready (gated, not queued)', () => {
    const { fake, sock } = setup();
    fake.open(); // hello goes out, but no session.ready yet
    const before = fake.sent.length;
    sock.submitRequest('too early');
    expect(fake.sent.length).toBe(before);
  });
});

describe('CrashSocket robustness', () => {
  it('tolerates malformed inbound frames without throwing or dispatching', () => {
    const { fake, events } = ready();
    const before = events.length;
    expect(() => fake.deliverRaw('{ not json')).not.toThrow();
    expect(() => fake.deliver({ garbage: true })).not.toThrow();
    expect(() => fake.deliver(makeMessage('error', 'sess-42', 9, { code: 'x' }))).not.toThrow(); // missing retryable
    expect(events.length).toBe(before);
  });

  it('every outbound method produces a schema-valid RendererToEngine frame', () => {
    const { fake, sock } = ready();
    sock.confirmPlan('plan-1');
    sock.cancelPlan('plan-1');
    sock.respondConfirm('confirm-1', true);
    sock.acceptSkillSave('fixed-req-id', 'summarize-folder');
    sock.cancelRun('fixed-req-id');
    const frames = fake.sent.slice(1); // skip hello
    // 6, not 5: session.ready auto-fires one auth.status.query (CrashSocket.queryAuthStatus),
    // then the 5 explicit calls above. All must be schema-valid RendererToEngine frames.
    expect(frames.length).toBe(6);
    for (const raw of frames) {
      expect(RendererToEngineSchema.safeParse(JSON.parse(raw)).success).toBe(true);
    }
  });
});

describe('CrashSocket plan auto-confirm', () => {
  // The shipped dashboard surface (ChatPanel) is a pure conversation: it has no "Start this plan"
  // button. But the engine's Spec-4 loop parks at awaiting_confirm after plan.proposed and only
  // reaches provider.run() once plan.confirm arrives. Without an auto-response the chat bubble
  // streams ThinkingDots forever and the headless CLI never runs. This mirrors the existing
  // session.ready -> auth.status.query auto-response: an inbound engine frame the renderer must
  // answer automatically to keep the protocol session flowing.
  it('auto-sends plan.confirm with the matching planId when a plan is proposed', () => {
    const { fake } = ready();
    const before = fake.sent.length;
    fake.deliver(
      makeMessage('plan.proposed', 'sess-42', 1, {
        requestId: 'req-1',
        planId: 'plan-9',
        title: 'Answer your question',
        summary: 'Read the relevant context, then answer.',
        steps: [{ id: 'st_1', label: 'Read context' }],
      }),
    );
    const out = fake.sent.slice(before).map((s) => JSON.parse(s));
    const confirm = out.find((f) => f.type === 'plan.confirm');
    expect(confirm).toBeTruthy();
    expect(confirm.payload.planId).toBe('plan-9');
    expect(RendererToEngineSchema.safeParse(confirm).success).toBe(true);
  });

  it('still forwards the plan.proposed event to the store sink (plan is not swallowed)', () => {
    const { fake, events } = ready();
    fake.deliver(
      makeMessage('plan.proposed', 'sess-42', 1, {
        requestId: 'req-1',
        planId: 'plan-9',
        title: 'Answer your question',
        summary: 'Read the relevant context, then answer.',
        steps: [{ id: 'st_1', label: 'Read context' }],
      }),
    );
    expect(events.at(-1)?.type).toBe('plan.proposed');
  });
});
