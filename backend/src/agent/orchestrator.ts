// THE creation loop (Spec 4), as a state machine. It is parameterized over the goal
// and BLIND to the vertical. It is the ONLY place AgentEvents become wire events.
//
//   request.submit ->  status(planning) -> plan.proposed
//        (gate)    ->  plan.confirm
//                  ->  status(indexing) + index.progress   [local RAG]
//                  ->  step.* narration
//                  ->  status(running) + answer.partial...  [provider stream]
//                  ->  result.final
//                  ->  skill.save.offer   (the ONLY 6/1 gate, Spec 9)
//        (accept)  ->  skill.saved        (a real file now exists on the shelf)
import type { AgentProvider } from './provider.js';
import { classifyIntent, chatReply } from './intent.js';
import { retrieve, fileCount, type Passage } from '../rag/retriever.js';
import { saveSkill } from '../skills/store.js';
import type { Workspace } from '../workspace/paths.js';
import type { ActivityEmitter } from '../workspace/activity.js';

/** Emit a wire payload by type. The session wraps this in the envelope + validates. */
export type EngineEmit = (type: string, payload: Record<string, unknown>) => void;

export interface OrchestratorDeps {
  provider: AgentProvider;
  workspace: Workspace;
  emit: EngineEmit;
  activity?: ActivityEmitter;
}

interface PendingSave {
  name: string;
  description: string;
  goal: string;
}

function classify(goal: string): { name: string; description: string } {
  if (/summar|shorten|tl;?dr|digest/i.test(goal)) {
    return { name: 'Summarize This', description: 'Reads your files and writes a short summary.' };
  }
  return { name: 'Ask My Stuff', description: 'Reads your files and answers questions about them.' };
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

export class Orchestrator {
  private goal = '';
  private requestId = '';
  private planId = '';
  private state: 'idle' | 'awaiting_confirm' | 'running' = 'idle';
  private abort: AbortController | null = null;
  private pendingSave: PendingSave | null = null;
  private runToken = 0;
  private targetPath: string | undefined; // a file/folder the user pointed at, read in place
  // The provider session id from the FIRST ask in this connection. The provider reports it
  // back via a `session` AgentEvent; we hold it and feed it as resumeSessionId on later asks
  // so the underlying CLI conversation resumes. This Orchestrator is 1:1 with the WebSocket
  // Session, so the id is correctly scoped: persists across asks in one window, fresh on a
  // new connection. Deliberately NOT reset between asks. Never logged.
  private providerSessionId: string | null = null;

  constructor(private readonly deps: OrchestratorDeps) {}

  /** Cancellation-aware paced delay. Resolves after `ms` OR immediately the moment the
   *  run's AbortSignal fires (STOP / supersede / dispose), so a paced beat can never make a
   *  cancel feel laggy. Pass the run's captured signal (`ac.signal`); it defaults to the
   *  live controller for convenience. Adds NO events of its own. */
  private pace(ms: number, signal?: AbortSignal): Promise<void> {
    const sig = signal ?? this.abort?.signal;
    if (sig?.aborted) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        sig?.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      sig?.addEventListener('abort', done, { once: true });
    });
  }

  /** R->E: request.submit. Builds + proposes a plain-English plan; then waits. */
  submit(req: { requestId: string; text: string; targetPath?: string }): void {
    this.requestId = req.requestId;
    this.goal = req.text;
    this.targetPath = req.targetPath; // a chosen file/folder, read in place by confirmPlan
    this.planId = `plan_${Date.now()}`;
    this.pendingSave = null;
    this.abort = null;

    const { emit } = this.deps;

    // Intent gate (Spec 9 corollary): a conversational turn must NOT become a skill. A
    // pointed-at file/folder is always a real task; otherwise classify the words. A chat turn
    // answers warmly and STOPS here -- no plan, no file read, no skill.save.offer -- so "hello"
    // can never be offered as a saveable skill.
    const intent = req.targetPath ? 'task' : classifyIntent(req.text);
    if (intent === 'chat') {
      this.state = 'idle';
      emit('result.final', { requestId: req.requestId, answer: chatReply(req.text) });
      emit('status', { requestId: req.requestId, state: 'done' });
      return;
    }

    // Full CLI chat (#13): a free-text question with NO file attached talks STRAIGHT to the
    // headless CLI (its tools on, slash-commands honored) -- no plan card, no local RAG, no
    // skill.save. Reaching here without a targetPath means classifyIntent already ruled this a
    // real request (not a canned greeting), so we stream a direct answer instead of parking at
    // a plan gate. Only a pointed-at file earns the read->find->answer plan below.
    if (!req.targetPath) {
      void this.runDirectChat();
      return;
    }

    emit('status', { requestId: req.requestId, state: 'planning', detail: 'thinking about your request' });

    const meta = classify(req.text);
    this.state = 'awaiting_confirm';
    emit('plan.proposed', {
      requestId: req.requestId,
      planId: this.planId,
      title: meta.name,
      summary: `I'll read your files, find what's relevant to "${truncate(req.text, 80)}", and explain it in plain language. Then I can save this as a skill you can re-run.`,
      steps: [
        { id: 'st_read', label: 'Read the files in your folder' },
        { id: 'st_find', label: 'Find the parts that match your request' },
        { id: 'st_answer', label: 'Write you a plain-language answer' },
      ],
    });
  }

  /** R->E: plan.confirm. Runs RAG + the provider and streams the answer. */
  async confirmPlan(planId: string): Promise<void> {
    if (this.state !== 'awaiting_confirm' || planId !== this.planId) return;
    this.state = 'running';
    this.abort = new AbortController();
    const ac = this.abort; // capture OUR controller: dispose()/cancelRun()/submit() may
    const myToken = ++this.runToken; // reassign this.abort while we're awaiting the stream
    const { emit, workspace, provider } = this.deps;
    const requestId = this.requestId;

    // --- local RAG (read-only; nothing uploaded) ---
    // A brief "spinning up" beat so confirm -> first step feels like a session is starting
    // (not an instant snap). Like every paced beat below, it wakes early on cancel.
    emit('status', { requestId, state: 'indexing', detail: 'reading your files' });
    await this.pace(500, ac.signal);
    if (ac.signal.aborted || myToken !== this.runToken) {
      this.state = 'idle';
      return;
    }

    emit('step.started', { planId, stepId: 'st_read', label: 'Read the files in your folder' });
    // Honor a chosen file/folder (protocol targetPath); fall back to the watched docs folder.
    // The absolute path is NEVER logged or emitted -- citations carry the basename only.
    const readPath = this.targetPath ?? workspace.docsDir;
    const total = fileCount(readPath);
    let passages: Passage[] = [];
    if (total === 0) {
      emit('index.progress', { requestId, processed: 0, total: 0 });
    } else {
      passages = retrieve(readPath, this.goal, {
        topK: 3,
        onProgress: (processed, t) => emit('index.progress', { requestId, processed, total: t }),
      });
    }
    // Fill the read bar smoothly instead of snapping to 1. Real index.progress (above) and
    // these step fractions interleave naturally; the dwell reads as "scanning the folder".
    for (const fraction of [0.2, 0.5, 0.8, 1]) {
      await this.pace(230, ac.signal);
      if (ac.signal.aborted || myToken !== this.runToken) {
        this.state = 'idle';
        return;
      }
      emit('step.progress', { planId, stepId: 'st_read', fraction });
    }

    // --- match the relevant parts (paced, not an instant jump to 1) ---
    emit('step.started', { planId, stepId: 'st_find', label: 'Find the parts that match your request' });
    for (const fraction of [0.25, 0.6, 1]) {
      await this.pace(300, ac.signal);
      if (ac.signal.aborted || myToken !== this.runToken) {
        this.state = 'idle';
        return;
      }
      emit('step.progress', { planId, stepId: 'st_find', fraction });
    }

    // --- provider stream ---
    emit('status', { requestId, state: 'running', detail: 'writing your answer' });
    emit('step.started', { planId, stepId: 'st_answer', label: 'Write you a plain-language answer' });
    const context = passages.map((p) => `[${p.source}] ${p.text}`).join('\n\n');
    emit('provider.session', {
      requestId,
      provider: provider.id,
      state: 'starting',
      detail: `${provider.id === 'codex' ? 'Codex' : 'Claude Code'} headless worker starting`,
    });

    let answer = '';
    // Drive the st_answer bar FROM the stream: as deltas accumulate, advance the fraction
    // toward (but never past) 0.95, capped at 1 only on `final`. Estimate the final length
    // from the retrieved context so the bar tracks the answer that's actually being written;
    // fall back to a small floor when there's no context (the "drop some files" reply).
    const answerEstimate = Math.max(160, context.length);
    let lastProgressAt = 0; // ms timestamp of the last st_answer emit (throttle)
    let lastProgressChars = 0; // answer length at the last st_answer emit (throttle)
    let rawSeq = 0; // per-request line ordinal for terminal.output (distinct from envelope seq)
    try {
      for await (const ev of provider.run({
        goal: this.goal,
        context,
        workspaceDir: workspace.root,
        signal: ac.signal,
        // Resume the prior CLI conversation when we already hold an id from an earlier ask.
        resumeSessionId: this.providerSessionId ?? undefined,
      })) {
        switch (ev.kind) {
          case 'status':
            // Clamp: a provider may only report progress states, never drive the
            // renderer into a terminal state — the orchestrator owns those transitions.
            if (ev.state === 'running' || ev.state === 'indexing') {
              emit('status', { requestId, state: ev.state, ...(ev.detail ? { detail: ev.detail } : {}) });
              emit('provider.session', {
                requestId,
                provider: provider.id,
                state: 'running',
                ...(ev.detail ? { detail: ev.detail } : {}),
              });
            }
            break;
          case 'step_started':
            emit('step.started', { planId, stepId: ev.stepId, label: ev.label });
            break;
          case 'step_progress':
            emit('step.progress', { planId, stepId: ev.stepId, fraction: ev.fraction });
            break;
          case 'session':
            // Hold the provider's resumable id so the NEXT ask in this connection resumes the
            // same CLI conversation. Scoped to this Orchestrator (1:1 with the Session). Not logged.
            this.providerSessionId = ev.sessionId;
            emit('provider.session', {
              requestId,
              provider: provider.id,
              state: 'ready',
              detail: 'headless session linked',
            });
            break;
          case 'raw':
            // Mirror one raw CLI line to the read-only Technical tab. EPHEMERAL by design: it
            // may carry file contents / CLI internals, so it goes ONLY over the in-memory socket
            // and is NEVER logged or persisted. rawSeq is the per-request line ordinal.
            emit('terminal.output', { requestId, stream: ev.stream, line: ev.line, seq: rawSeq++ });
            break;
          case 'text': {
            answer += ev.delta;
            emit('answer.partial', { requestId, textDelta: ev.delta });
            // Throttle: advance st_answer at most ~every 150ms or ~every 24 chars, never on
            // every 4ms word. min(0.95, ...) keeps the final 5% for `final` to fill.
            const now = Date.now();
            if (now - lastProgressAt >= 150 || answer.length - lastProgressChars >= 24) {
              lastProgressAt = now;
              lastProgressChars = answer.length;
              const fraction = Math.min(0.95, answer.length / answerEstimate);
              emit('step.progress', { planId, stepId: 'st_answer', fraction });
            }
            break;
          }
          case 'final':
            if (ev.answer) answer = ev.answer;
            break;
          case 'error':
            emit('provider.session', {
              requestId,
              provider: provider.id,
              state: 'error',
              detail: ev.code,
            });
            emit('error', { requestId, code: ev.code, retryable: ev.retryable });
            this.state = 'idle';
            return;
        }
      }
    } catch {
      emit('provider.session', {
        requestId,
        provider: provider.id,
        state: 'error',
        detail: 'engine_failure',
      });
      emit('error', { requestId, code: 'engine_failure', retryable: true });
      this.state = 'idle';
      return;
    }

    if (ac.signal.aborted || myToken !== this.runToken) {
      this.state = 'idle';
      return; // cancelled / superseded — cancelRun already emitted the single terminal event
    }

    emit('step.progress', { planId, stepId: 'st_answer', fraction: 1 });
    emit('provider.session', {
      requestId,
      provider: provider.id,
      state: 'done',
      detail: 'headless worker finished',
    });
    const citations = passages.map((p) => ({ source: p.source, snippet: truncate(p.text, 240) }));
    emit('result.final', { requestId, answer, ...(citations.length ? { citations } : {}) });

    // --- the one delightful gate ---
    const meta = classify(this.goal);
    this.pendingSave = { ...meta, goal: this.goal };
    emit('skill.save.offer', { requestId, suggestedName: meta.name, description: meta.description });
    emit('status', { requestId, state: 'done' });
    this.state = 'idle';
  }

  /** A free-text chat turn with NO file attached (Full CLI chat, #13). Talks STRAIGHT to the
   *  provider -- the headless CLI with its tools on -- and streams the answer back. It mirrors
   *  confirmPlan's provider loop but deliberately drops everything the file task does: no plan
   *  card, no local RAG, no step narration, no citations, and -- crucially -- no skill.save.offer,
   *  because a conversation is not a saveable skill (Spec 9 corollary). The provider gets an EMPTY
   *  context: the CLI does its OWN lookups with its tools, rather than us pre-retrieving from a
   *  folder the user never pointed at. Fire-and-forget from submit(); there is no confirm gate. */
  async runDirectChat(): Promise<void> {
    this.state = 'running';
    this.abort = new AbortController();
    const ac = this.abort; // capture OUR controller: dispose()/cancelRun()/submit() may reassign
    const myToken = ++this.runToken; // this.abort while we await the stream
    const { emit, workspace, provider } = this.deps;
    const requestId = this.requestId;

    emit('status', { requestId, state: 'running', detail: 'thinking' });
    emit('provider.session', {
      requestId,
      provider: provider.id,
      state: 'starting',
      detail: `${provider.id === 'codex' ? 'Codex' : 'Claude Code'} headless worker starting`,
    });

    let answer = '';
    let rawSeq = 0; // per-request line ordinal for terminal.output (distinct from envelope seq)
    try {
      for await (const ev of provider.run({
        goal: this.goal,
        context: '', // no local RAG -- the CLI researches with its own tools when the answer needs it
        workspaceDir: workspace.root,
        signal: ac.signal,
        resumeSessionId: this.providerSessionId ?? undefined,
      })) {
        switch (ev.kind) {
          case 'status':
            // Clamp (same as confirmPlan): a provider may report progress states only, never
            // drive the renderer into a terminal state -- the orchestrator owns those.
            if (ev.state === 'running' || ev.state === 'indexing') {
              emit('status', { requestId, state: ev.state, ...(ev.detail ? { detail: ev.detail } : {}) });
              emit('provider.session', {
                requestId,
                provider: provider.id,
                state: 'running',
                ...(ev.detail ? { detail: ev.detail } : {}),
              });
            }
            break;
          case 'session':
            // Hold the resumable id so the NEXT ask in this connection continues the same CLI
            // conversation. Scoped to this Orchestrator (1:1 with the Session). Never logged.
            this.providerSessionId = ev.sessionId;
            emit('provider.session', {
              requestId,
              provider: provider.id,
              state: 'ready',
              detail: 'headless session linked',
            });
            break;
          case 'raw':
            // Mirror one raw CLI line to the read-only Technical tab. EPHEMERAL: in-memory socket
            // only, NEVER logged or persisted (it may carry file contents / CLI internals).
            emit('terminal.output', { requestId, stream: ev.stream, line: ev.line, seq: rawSeq++ });
            break;
          case 'text':
            answer += ev.delta;
            emit('answer.partial', { requestId, textDelta: ev.delta });
            break;
          case 'final':
            if (ev.answer) answer = ev.answer;
            break;
          case 'error':
            emit('provider.session', { requestId, provider: provider.id, state: 'error', detail: ev.code });
            emit('error', { requestId, code: ev.code, retryable: ev.retryable });
            this.state = 'idle';
            return;
          // step_started / step_progress are plan-mode concepts: a chat turn has no plan, so if a
          // provider emits them we intentionally ignore them (there is no planId to attach).
        }
      }
    } catch {
      emit('provider.session', { requestId, provider: provider.id, state: 'error', detail: 'engine_failure' });
      emit('error', { requestId, code: 'engine_failure', retryable: true });
      this.state = 'idle';
      return;
    }

    if (ac.signal.aborted || myToken !== this.runToken) {
      this.state = 'idle';
      return; // cancelled / superseded -- cancelRun already emitted the single terminal event
    }

    emit('provider.session', {
      requestId,
      provider: provider.id,
      state: 'done',
      detail: 'headless worker finished',
    });
    // NO citations (no RAG) and NO skill.save.offer (a chat turn is not a saveable skill).
    emit('result.final', { requestId, answer });
    emit('status', { requestId, state: 'done' });
    this.state = 'idle';
  }

  /** R->E: skill.save.accept. Writes a real, re-runnable skill file to the shelf. */
  acceptSkillSave(requestId: string, name: string): void {
    if (!this.pendingSave) return;
    const saved = saveSkill(
      this.deps.workspace,
      {
        name: name || this.pendingSave.name,
        description: this.pendingSave.description,
        goal: this.pendingSave.goal,
        provider: this.deps.provider.id,
      },
      this.deps.activity,
    );
    this.deps.emit('skill.saved', { skillId: saved.skillId, name: saved.name, path: saved.path });
    this.pendingSave = null;
  }

  /** R->E: plan.cancel. */
  cancelPlan(planId: string): void {
    if (planId !== this.planId) return;
    this.state = 'idle';
    this.deps.emit('status', { requestId: this.requestId, state: 'idle', detail: 'cancelled' });
  }

  /** R->E: run.cancel (the STOP button). Tears down the provider child process. */
  cancelRun(requestId: string): void {
    this.runToken++; // invalidate any in-flight confirmPlan so it won't emit a 2nd terminal event
    this.abort?.abort();
    this.state = 'idle';
    this.deps.emit('status', { requestId, state: 'idle', detail: 'stopped' });
  }

  /** The renderer disconnected (tab closed / reload / app quit). Abort any in-flight run
   *  so a dropped connection can never strand a headless CLI -- the abort flows through to
   *  spawnJsonLines -> killTree. Unlike cancelRun this emits NOTHING: the socket is already
   *  gone, so a wire send would be a no-op at best. Safe to call repeatedly (idempotent). */
  dispose(): void {
    this.runToken++; // invalidate any in-flight confirmPlan so it won't emit a terminal event
    this.abort?.abort();
    this.abort = null;
    this.state = 'idle';
  }
}
