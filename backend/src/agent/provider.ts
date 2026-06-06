// The provider interface. ClaudeCodeProvider and CodexProvider are interchangeable
// implementations; each spawns its own CLI headless against the user's OWN
// subscription (BYO). The engine speaks one internal contract; provider differences
// are absorbed entirely here. (Spec 3.2.)
import type { Provider as ProviderId } from '@crash/protocol';
import type { AgentEvent } from './events.js';

export interface AgentRunInput {
  /** The user's open-ended goal, verbatim. */
  goal: string;
  /** Retrieved passages from the user's files (may be empty). Read-only context. */
  context: string;
  /** The Crash/ workspace root. Providers run read-only toward the system. */
  workspaceDir: string;
  /** Cancellation for the STOP button / run.cancel. */
  signal: AbortSignal;
  /** Provider session id from a PRIOR turn in this same WebSocket session. When set, the
   *  provider RESUMES that CLI conversation instead of cold-starting a fresh one, so the
   *  CLI remembers earlier asks. Undefined on the first turn. (Spec: session continuity.) */
  resumeSessionId?: string;
}

export interface AgentProvider {
  /** Display-only id surfaced in session.ready. The renderer never branches on it. */
  readonly id: ProviderId;
  /** Whether this provider's CLI is present + usable on this machine. */
  isAvailable(): Promise<boolean>;
  /** Run ONE bounded, read-only agent turn. Yields normalized AgentEvents. */
  run(input: AgentRunInput): AsyncIterable<AgentEvent>;
}
