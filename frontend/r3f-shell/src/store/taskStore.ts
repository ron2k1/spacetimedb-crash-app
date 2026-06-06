// taskStore.ts -- the single source of UI truth, derived from the Engine->Renderer event
// stream. CrashSocket validates each inbound frame against EngineToRendererSchema and hands
// the typed event here; applyEvent folds it into flat, render-ready state. The reducer is a
// PURE function of (state, event) so it is trivially unit-testable without a socket.
//
// Why a reducer and not ad-hoc setters: the protocol is a stream of 15 event kinds whose
// effects overlap (status, step.*, answer.* all mutate "what is the run doing now"). A single
// switch keeps that logic in one auditable place and the `never` exhaustiveness check makes
// adding a 16th event a COMPILE error here until it is handled -- the contract can't silently
// outgrow the UI.
import { create } from 'zustand';
import type {
  CatalogListing,
  Citation,
  EngineToRenderer,
  FileOp,
  FolderEntry,
  MarketplaceKind,
  Provider,
  ProviderAuth,
  ProviderSessionState,
  RunState,
} from '@crash/protocol';
import type { ConnState } from '../net/CrashSocket';

/** A plan step augmented with live progress folded in from step.started / step.progress. */
export interface PlanStepView {
  id: string;
  label: string;
  fraction: number; // 0..1
  started: boolean;
}

export interface PlanView {
  requestId: string;
  planId: string;
  title: string;
  summary: string;
  steps: PlanStepView[];
}

export interface PendingConfirm {
  confirmId: string;
  planId: string;
  action: string;
  detail: string;
}

export interface SkillOffer {
  requestId: string;
  suggestedName: string;
  description: string;
}

export interface SavedSkill {
  skillId: string;
  name: string;
  path: string;
}

export interface IndexProgress {
  processed: number;
  total: number;
}

/** One workspace file/dir op the engine reported (file.activity), newest appended last. */
export interface FileActivityEntry {
  op: FileOp;
  path: string; // workspace-relative, POSIX
  bytes?: number;
  seq: number; // per-activity ordinal from the engine
}

/** A marketplace item the engine copied into the workspace (marketplace.installed). */
export interface InstalledItem {
  installId: string;
  kind: MarketplaceKind;
  itemId: string;
  path: string; // workspace-relative dir
}

/**
 * One raw CLI output line mirrored from the engine (terminal.output), for the read-only Technical
 * view. EPHEMERAL + IN-MEMORY ONLY by design: a line can carry file contents / CLI internals, so this
 * is NEVER persisted to localStorage/disk/sessionStorage and is bounded to the last TERMINAL_MAX
 * entries (see reduce) so a long-running session can't grow it without limit.
 */
export type TerminalLine = {
  stream: 'stdout' | 'stderr';
  line: string;
  seq: number; // per-request line ordinal from the engine
  requestId: string;
};

export interface ProviderWorker {
  requestId: string;
  provider: Provider;
  state: ProviderSessionState;
  detail: string | null;
}

// Ring-buffer cap for terminalLines: keep only the most recent N lines so the mirror stays bounded.
const TERMINAL_MAX = 500;

/**
 * True when a raw CLI line is pure session BOOKKEEPING that should be kept OUT of the Technical
 * mirror -- specifically Claude Code's stream-json `{"type":"system","subtype":"hook_*"}` frames.
 * The CLI emits one such frame per hook that fires, so on a machine with many SessionStart hooks
 * they flood the view and bury real output. We hide ONLY these confidently-identified stdout
 * frames; the rule is deliberately conservative:
 *   - stderr is NEVER filtered (errors must always surface);
 *   - a line we can't parse as JSON is KEPT (never hide what we can't classify);
 *   - only `type:"system"` + `subtype` starting `hook_` is treated as noise -- the one-off
 *     `system`/`init` frame (model, cwd, tools) and all answer/tool/result frames pass through.
 * A dropped frame is still recorded in taskStore.events (the full audit trail); it is only
 * withheld from the VISIBLE buffer.
 */
export function isHookNoise(stream: 'stdout' | 'stderr', line: string): boolean {
  if (stream !== 'stdout') return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object') return false;
  const frame = parsed as { type?: unknown; subtype?: unknown };
  return frame.type === 'system' && typeof frame.subtype === 'string' && frame.subtype.startsWith('hook_');
}

/**
 * One turn in the Ask Crash chat transcript. A user turn is the question as typed; an assistant turn
 * streams in from answer.partial and finalizes on result.final. `provider` is stamped when the turn is
 * created so each reply names the CLI that actually answered (Claude Code / Codex).
 */
export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  provider?: string | null; // assistant turns: which CLI answered
  status: 'streaming' | 'done' | 'error';
}

export interface TaskState {
  // ---- connection (driven by CrashSocket via setConnState + session.ready) ----
  connState: ConnState;
  sessionId: string | null;
  provider: string | null;
  engineVersion: string | null;
  // ---- current run ----
  runState: RunState;
  statusDetail: string | null;
  activeRequestId: string | null;
  plan: PlanView | null;
  indexProgress: IndexProgress | null;
  // ---- interaction surfaces ----
  pendingConfirm: PendingConfirm | null;
  answer: string;
  /** Multi-turn chat transcript for the Ask Crash view -- your questions + the CLI's streamed replies. */
  transcript: ChatTurn[];
  citations: Citation[];
  skillOffer: SkillOffer | null;
  savedSkill: SavedSkill | null;
  // ---- workspace file view (dev harness; Unity owns the rich panel) ----
  folderSnapshot: FolderEntry[];
  fileActivity: FileActivityEntry[];
  installed: InstalledItem[];
  // ---- raw CLI mirror (Technical tab; read-only). In-memory + ephemeral + bounded; NEVER persisted. ----
  terminalLines: TerminalLine[];
  providerWorker: ProviderWorker | null;
  // ---- auth gate (provider sign-in; driven by auth.status / auth.login.result) ----
  providerAuth: ProviderAuth[]; // one entry per known provider; [] until auth.status arrives
  authActive: Provider | null; // provider the engine resolved for this session (display only)
  authLaunching: Provider | null; // provider whose login terminal we just spawned (transient)
  gateContinued: boolean; // user dismissed the sign-in gate (always allowed -- de-risks the demo)
  // ---- diagnostics ----
  lastErrorCode: string | null;
  events: EngineToRenderer[];
  // ---- marketplace pivot ----
  catalog?: CatalogListing[];
  toolActivity?: { agentId: string; tool: string; phase: 'start' | 'ok' | 'error'; code?: string }[];
  payment?: { agentId: string; phase: 'required' | 'signing' | 'settled'; amount: string; asset: 'USDC'; network: string; payTo?: string; txRef?: string };
  wallet?: { balanceMinor: number; caps: { agentId: string; capMinor: number; spentMinor: number }[] };
  // ---- actions ----
  setConnState: (s: ConnState) => void;
  applyEvent: (e: EngineToRenderer) => void;
  /** Client-side wallet draw-down for a Test run: subtract `minor` USDC units (6 decimals) from the
   *  balance (seeding a 1.00 USDC default the first time, since the engine doesn't push wallet.status
   *  in the demo) and bump that agent's spent cap. Makes every Test visibly cost money in WalletBadge. */
  chargeWallet: (minor: number, agentId?: string) => void;
  setAuthLaunching: (p: Provider | null) => void;
  continuePastGate: () => void;
  appendUserMessage: (text: string) => void;
  beginRequest: (requestId: string) => void;
  clearConfirm: () => void;
  reset: () => void;
}

/** Fresh data slice. A function (not a shared const) so reset() can't alias arrays. */
function initialData() {
  return {
    connState: 'connecting' as ConnState,
    sessionId: null,
    provider: null,
    engineVersion: null,
    runState: 'idle' as RunState,
    statusDetail: null,
    activeRequestId: null,
    plan: null,
    indexProgress: null,
    pendingConfirm: null,
    answer: '',
    transcript: [] as ChatTurn[],
    citations: [] as Citation[],
    skillOffer: null,
    savedSkill: null,
    folderSnapshot: [] as FolderEntry[],
    fileActivity: [] as FileActivityEntry[],
    installed: [] as InstalledItem[],
    terminalLines: [] as TerminalLine[],
    providerWorker: null as ProviderWorker | null,
    providerAuth: [] as ProviderAuth[],
    authActive: null,
    authLaunching: null,
    gateContinued: false,
    lastErrorCode: null,
    events: [] as EngineToRenderer[],
    toolActivity: [] as { agentId: string; tool: string; phase: 'start' | 'ok' | 'error'; code?: string }[],
  };
}

/**
 * Upsert a step into the plan, folding in step.started / step.progress patches. If no plan
 * exists yet (a step event arrived before plan.proposed -- out of order), build a minimal
 * shell so the step is never silently dropped. Defensive-by-default, same as CrashSocket.
 */
function upsertStep(
  plan: PlanView | null,
  planId: string,
  stepId: string,
  patch: Partial<PlanStepView>,
): PlanView {
  const base: PlanView = plan ?? { requestId: '', planId, title: '', summary: '', steps: [] };
  const idx = base.steps.findIndex((st) => st.id === stepId);
  const steps = [...base.steps];
  if (idx >= 0) {
    steps[idx] = { ...steps[idx], ...patch };
  } else {
    steps.push({ id: stepId, label: '', fraction: 0, started: false, ...patch });
  }
  return { ...base, steps };
}

/**
 * Patch the most-recent assistant turn in the transcript (the one currently streaming). Returns a new
 * array; a no-op if there is no assistant turn yet. Lets answer.partial / result.final / error fold
 * into the visible chat without threading a turn id through every protocol payload.
 */
function updateLastAssistant(transcript: ChatTurn[], fn: (t: ChatTurn) => ChatTurn): ChatTurn[] {
  for (let i = transcript.length - 1; i >= 0; i--) {
    if (transcript[i].role === 'assistant') {
      const next = [...transcript];
      next[i] = fn(next[i]);
      return next;
    }
  }
  return transcript;
}

/** Pure reducer: fold one Engine->Renderer event into a state patch. */
function reduce(s: TaskState, e: EngineToRenderer): Partial<TaskState> {
  const events = [...s.events, e];
  switch (e.type) {
    case 'session.ready':
      return {
        events,
        sessionId: e.payload.sessionId,
        provider: e.payload.provider,
        engineVersion: e.payload.engineVersion,
      };
    case 'plan.proposed':
      return {
        events,
        activeRequestId: e.payload.requestId,
        runState: 'planning',
        plan: {
          requestId: e.payload.requestId,
          planId: e.payload.planId,
          title: e.payload.title,
          summary: e.payload.summary,
          steps: e.payload.steps.map((st) => ({ id: st.id, label: st.label, fraction: 0, started: false })),
        },
      };
    case 'status':
      return {
        events,
        runState: e.payload.state,
        statusDetail: e.payload.detail ?? null,
        activeRequestId: e.payload.requestId,
      };
    case 'index.progress':
      return { events, indexProgress: { processed: e.payload.processed, total: e.payload.total } };
    case 'step.started':
      return { events, plan: upsertStep(s.plan, e.payload.planId, e.payload.stepId, { started: true, label: e.payload.label }) };
    case 'step.progress':
      return { events, plan: upsertStep(s.plan, e.payload.planId, e.payload.stepId, { fraction: e.payload.fraction }) };
    case 'confirm.required':
      return {
        events,
        pendingConfirm: {
          confirmId: e.payload.confirmId,
          planId: e.payload.planId,
          action: e.payload.action,
          detail: e.payload.detail,
        },
        runState: 'awaiting_confirm',
      };
    case 'answer.partial':
      return {
        events,
        answer: s.answer + e.payload.textDelta,
        transcript: updateLastAssistant(s.transcript, (t) => ({
          ...t,
          text: t.text + e.payload.textDelta,
          status: 'streaming',
        })),
      };
    case 'result.final':
      return {
        events,
        answer: e.payload.answer,
        citations: e.payload.citations ?? [],
        runState: 'done',
        transcript: updateLastAssistant(s.transcript, (t) => ({ ...t, text: e.payload.answer, status: 'done' })),
      };
    case 'skill.save.offer':
      return {
        events,
        skillOffer: {
          requestId: e.payload.requestId,
          suggestedName: e.payload.suggestedName,
          description: e.payload.description,
        },
      };
    case 'skill.saved':
      return {
        events,
        savedSkill: { skillId: e.payload.skillId, name: e.payload.name, path: e.payload.path },
        skillOffer: null,
      };
    case 'error':
      return {
        events,
        lastErrorCode: e.payload.code,
        runState: 'error',
        transcript: updateLastAssistant(s.transcript, (t) => ({ ...t, status: 'error' })),
      };
    case 'folder.snapshot':
      // Initial tree; replace wholesale (the engine sends one authoritative snapshot).
      return { events, folderSnapshot: e.payload.entries };
    case 'file.activity':
      return {
        events,
        fileActivity: [
          ...s.fileActivity,
          { op: e.payload.op, path: e.payload.path, bytes: e.payload.bytes, seq: e.payload.seq },
        ],
      };
    case 'terminal.output': {
      // Read-only CLI mirror for the Technical tab. First drop pure hook bookkeeping
      // (isHookNoise): on a machine with many SessionStart hooks the stream-json `system/hook_*`
      // frames flood the mirror and bury real output. The event is still recorded in `events`
      // above (full audit trail) -- we only withhold it from the VISIBLE buffer, and we keep the
      // ring-buffer filled with USEFUL lines rather than noise (so more real history survives).
      if (isHookNoise(e.payload.stream, e.payload.line)) {
        return { events };
      }
      // Append the line, then keep only the LAST TERMINAL_MAX (drop oldest) so the buffer is
      // bounded. slice(-N) of a >N array drops the head; of a <=N array it is a no-op, so this is
      // correct at every length. In-memory only: terminalLines is NEVER persisted (a line can
      // carry file contents by design).
      const next: TerminalLine = {
        stream: e.payload.stream,
        line: e.payload.line,
        seq: e.payload.seq,
        requestId: e.payload.requestId,
      };
      return { events, terminalLines: [...s.terminalLines, next].slice(-TERMINAL_MAX) };
    }
    case 'provider.session':
      return {
        events,
        providerWorker: {
          requestId: e.payload.requestId,
          provider: e.payload.provider,
          state: e.payload.state,
          detail: e.payload.detail ?? null,
        },
      };
    case 'marketplace.installed':
      return {
        events,
        installed: [
          ...s.installed,
          {
            installId: e.payload.installId,
            kind: e.payload.kind,
            itemId: e.payload.itemId,
            path: e.payload.path,
          },
        ],
      };
    case 'auth.status':
      // Fold the per-provider snapshot in wholesale; the engine sends one authoritative list.
      return { events, providerAuth: e.payload.providers, authActive: e.payload.active };
    case 'auth.login.result':
      // launched=true only means the terminal opened, NOT that auth succeeded -- the UI re-queries
      // status to learn the outcome. `code` (present on launch failure) is a SYNTHETIC code kept
      // for diagnostics only; it is never rendered as a message.
      return { events, authLaunching: null, lastErrorCode: e.payload.code ?? s.lastErrorCode };
    case 'marketplace.catalog':
      // Authoritative Browse grid; replace wholesale (same shape as folder.snapshot / auth.status).
      return { events, catalog: e.payload.listings };
    case 'tool.activity': {
      // Append the capability call, then keep only the LAST TOOL_ACTIVITY_MAX (ring buffer, same
      // bounding trick as terminal.output) so a long agent run can't grow it without limit. The
      // `code` field, when present, is a SYNTHETIC error code only -- never a message/body.
      const TOOL_ACTIVITY_MAX = 200;
      const next = [...(s.toolActivity ?? []), e.payload].slice(-TOOL_ACTIVITY_MAX);
      return { events, toolActivity: next };
    }
    case 'payment.activity':
      // Latest-wins: the UI shows the current x402 phase, not a history.
      return { events, payment: e.payload };
    case 'wallet.status':
      // Authoritative snapshot of balance + per-agent caps; replace wholesale.
      return { events, wallet: e.payload };
    default: {
      // Exhaustiveness guard: if a new EngineToRenderer variant is added to the protocol,
      // `e` is no longer `never` here and this line fails to compile until it is handled.
      const _never: never = e;
      void _never;
      return { events };
    }
  }
}

export const useTaskStore = create<TaskState>((set) => ({
  ...initialData(),
  setConnState: (connState) => set({ connState }),
  applyEvent: (e) => set((s) => reduce(s, e)),
  chargeWallet: (minor, agentId) =>
    set((s) => {
      // Seed a 1.00 USDC starting balance the first time (engine hasn't pushed wallet.status in the
      // demo), then draw down -- floored at 0 so the badge never shows a negative on stage.
      const prev = s.wallet ?? { balanceMinor: 1_000_000, caps: [] };
      const balanceMinor = Math.max(0, prev.balanceMinor - minor);
      let caps = prev.caps;
      if (agentId) {
        const idx = caps.findIndex((c) => c.agentId === agentId);
        if (idx >= 0) {
          caps = [...caps];
          caps[idx] = { ...caps[idx], spentMinor: caps[idx].spentMinor + minor };
        } else {
          caps = [...caps, { agentId, capMinor: 250_000, spentMinor: minor }];
        }
      }
      return { wallet: { balanceMinor, caps } };
    }),
  setAuthLaunching: (authLaunching) => set({ authLaunching }),
  continuePastGate: () => set({ gateContinued: true }),
  appendUserMessage: (text) =>
    set((s) => ({
      transcript: [
        ...s.transcript,
        { id: `u-${s.transcript.length}`, role: 'user' as const, text, status: 'done' as const },
      ],
    })),
  beginRequest: (requestId) =>
    set((s) => ({
      activeRequestId: requestId,
      runState: 'planning',
      statusDetail: null,
      plan: null,
      indexProgress: null,
      pendingConfirm: null,
      answer: '',
      citations: [],
      skillOffer: null,
      savedSkill: null,
      providerWorker: null,
      lastErrorCode: null,
      // Open a fresh assistant turn for this request, stamped with the CLI that will answer so the
      // chat bubble names the provider (Claude Code / Codex). It then streams via answer.partial.
      transcript: [
        ...s.transcript,
        {
          id: requestId,
          role: 'assistant' as const,
          text: '',
          provider: s.authActive ?? s.provider,
          status: 'streaming' as const,
        },
      ],
    })),
  clearConfirm: () => set({ pendingConfirm: null }),
  reset: () => set(initialData()),
}));
