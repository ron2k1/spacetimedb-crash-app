// Normalized, provider-agnostic event stream.
//
// Every provider (Claude Code, Codex, or the offline deterministic one) emits THIS
// shape. The orchestrator is the ONLY thing that translates these into the frozen
// wire protocol (@crash/protocol). Adding a provider therefore never touches the
// protocol or the orchestrator's public surface — it just produces AgentEvents.
import type { RunState, Citation } from '@crash/protocol';

export type AgentEvent =
  | { kind: 'status'; state: RunState; detail?: string }
  | { kind: 'step_started'; stepId: string; label: string }
  | { kind: 'step_progress'; stepId: string; fraction: number }
  | { kind: 'text'; delta: string }
  | { kind: 'final'; answer: string; citations?: Citation[] }
  | { kind: 'error'; code: string; retryable: boolean }
  // The provider reports back the resumable session id it just created (Claude Code's
  // self-generated --session-id, or Codex's scanned-from-JSONL id). The orchestrator holds
  // it and feeds it back on the next ask so the CLI conversation resumes.
  | { kind: 'session'; sessionId: string }
  // One raw, VERBATIM line of CLI output. The orchestrator forwards it as a terminal.output
  // wire event for the read-only Technical tab. NEVER logged or persisted (it may contain
  // file contents / CLI internals by design).
  | { kind: 'raw'; stream: 'stdout' | 'stderr'; line: string };
