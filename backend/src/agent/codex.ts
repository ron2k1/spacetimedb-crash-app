// CodexProvider: spawns the OpenAI Codex CLI headless behind the SAME interface.
// Non-interactive invocation:  codex exec --json "<prompt>"
// Codex emits JSONL events; shapes vary by version, so extraction is tolerant:
// any assistant/message/item text becomes a delta, and the last such text is the
// final answer. (Confirm the exact event schema on-machine; the contract above does
// not change either way.)
import type { AgentProvider, AgentRunInput } from './provider.js';
import type { AgentEvent } from './events.js';
import { spawnJsonLines, commandExists } from './proc.js';
import { buildPrompt } from './prompt.js';

function extractText(j: Record<string, unknown>): { delta?: string; isFinal?: boolean } {
  // streaming delta
  const delta = j.delta as { text?: string } | string | undefined;
  if (typeof delta === 'string') return { delta };
  if (delta && typeof delta.text === 'string') return { delta: delta.text };
  // item / message completion shapes
  const item = j.item as { type?: string; text?: string } | undefined;
  if (item && typeof item.text === 'string') {
    return { delta: item.text, isFinal: item.type?.includes('message') ?? false };
  }
  const msg = j.message as { content?: { text?: string }[]; text?: string } | undefined;
  if (msg) {
    if (typeof msg.text === 'string') return { delta: msg.text, isFinal: true };
    if (Array.isArray(msg.content)) {
      const t = msg.content.map((c) => c?.text ?? '').join('');
      if (t) return { delta: t, isFinal: true };
    }
  }
  if (typeof j.text === 'string') return { delta: j.text };
  return {};
}

function codexBin(): string {
  return process.env.CRASH_CODEX_BIN || 'codex';
}

// Full access is the NORMAL operating mode for Crash: the agent runs headless on the user's own
// machine to carry out tasks, so it must be able to write files and run tools (a read-only sandbox
// left this worker inert for execute + deploy). --dangerously-bypass-approvals-and-sandbox grants
// that AND is the one mechanism valid on BOTH `codex exec` and `codex exec resume` -- resume has no
// --sandbox flag, so a sandbox MODE could not be carried across turns. Set CRASH_CODEX_FULL_ACCESS=0
// to fall back to Codex's own default sandbox.
function codexAccessArgs(): string[] {
  return process.env.CRASH_CODEX_FULL_ACCESS === '0' ? [] : ['--dangerously-bypass-approvals-and-sandbox'];
}

function codexExecArgs(prompt: string, resumeSessionId?: string): string[] {
  // Codex must run fully non-interactively inside Crash. The workspace is the user's Crash folder,
  // not necessarily a Git checkout, so --skip-git-repo-check is required. Access flags go before the
  // positional session id + prompt.
  const access = codexAccessArgs();
  return resumeSessionId
    ? ['exec', 'resume', '--json', '--skip-git-repo-check', ...access, resumeSessionId, prompt]
    : ['exec', '--json', '--skip-git-repo-check', ...access, prompt];
}

// Tolerantly pull a resumable conversation id out of a parsed Codex JSONL object. Codex's
// JSON shapes vary by version, so scan for the FIRST present key among these. Returns null
// when none is present (the caller then falls back to `resume --last`). The id is never logged.
function extractSessionId(j: Record<string, unknown>): string | null {
  for (const key of ['session_id', 'thread_id', 'conversation_id', 'id'] as const) {
    const v = j[key];
    if (typeof v === 'string' && v) return v;
  }
  return null;
}

export class CodexProvider implements AgentProvider {
  readonly id = 'codex' as const;

  isAvailable(): Promise<boolean> {
    return commandExists(codexBin());
  }

  async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    const prompt = buildPrompt(input.goal, input.context);
    // Session continuity. Turn 2+ resumes the captured conversation; turn 1 starts fresh and
    // we scan the JSONL for its id (reported back once, below) for the NEXT ask to resume.
    const args = codexExecArgs(prompt, input.resumeSessionId);

    yield { kind: 'status', state: 'running', detail: 'asking Codex' };
    yield { kind: 'raw', stream: 'stdout', line: '[Crash] starting Codex headless worker: codex exec --json' };

    let finalText = '';
    let sessionReported = false; // fire the `session` event at most once per turn
    try {
      const it = spawnJsonLines(codexBin(), args, { cwd: input.workspaceDir, signal: input.signal });
      for await (const line of it) {
        // Forward the VERBATIM CLI line for the read-only Technical tab (never logged/persisted).
        yield { kind: 'raw', stream: line.stream, line: line.raw };
        if (!line.json || typeof line.json !== 'object') continue;
        const obj = line.json as Record<string, unknown>;
        // Capture the resumable id the first time it appears (only when starting fresh).
        if (!sessionReported && !input.resumeSessionId) {
          const sid = extractSessionId(obj);
          if (sid) {
            sessionReported = true;
            yield { kind: 'session', sessionId: sid };
          }
        }
        const { delta, isFinal } = extractText(obj);
        if (delta) {
          yield { kind: 'text', delta };
          if (isFinal) finalText = delta;
          else finalText += delta;
        }
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code === 'ENOENT' ? 'provider_unavailable' : 'provider_failed';
      yield { kind: 'error', code, retryable: true };
      return;
    }

    if (input.signal.aborted) {
      yield { kind: 'error', code: 'cancelled', retryable: true };
      return;
    }
    yield { kind: 'final', answer: finalText.trim() };
  }
}
