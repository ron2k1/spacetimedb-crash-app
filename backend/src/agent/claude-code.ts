// ClaudeCodeProvider: spawns the Claude Code CLI headless and maps its
// stream-json output onto the normalized AgentEvent stream. BYO subscription.
//
// Headless invocation:  claude -p "<prompt>" --output-format stream-json --verbose
//                              --include-partial-messages
// stream-json emits one JSON object per line. We handle the documented shapes and
// fall back tolerantly. Crash runs Claude Code with FULL ACCESS by default
// (--dangerously-skip-permissions) so the headless agent can actually carry out work for the
// user; set CRASH_CLAUDE_FULL_ACCESS=0 to restore interactive permission prompts. Extra flags
// can still be appended via CRASH_CLAUDE_ARGS.
import { randomUUID } from 'node:crypto';
import type { AgentProvider, AgentRunInput } from './provider.js';
import type { AgentEvent } from './events.js';
import { spawnJsonLines, commandExists } from './proc.js';
import { buildPrompt } from './prompt.js';

// On Windows the CLI may be `claude.cmd`; if auto-detection fails, point CRASH_CLAUDE_BIN
// at the full path. Detection and the real spawn use the SAME binary so they never disagree.
function claudeBin(): string {
  return process.env.CRASH_CLAUDE_BIN || 'claude';
}

// Full access is the NORMAL operating mode for Crash: the agent runs headless on the user's own
// machine to carry out tasks, so the interactive permission prompts (which would hang a
// non-interactive run) are skipped by default. Opt back into prompting with CRASH_CLAUDE_FULL_ACCESS=0.
function accessArgs(): string[] {
  return process.env.CRASH_CLAUDE_FULL_ACCESS === '0' ? [] : ['--dangerously-skip-permissions'];
}

function extraArgs(): string[] {
  const raw = process.env.CRASH_CLAUDE_ARGS;
  return raw ? raw.split(' ').filter(Boolean) : [];
}

// Optional model pin. With no CRASH_CLAUDE_MODEL the CLI uses its OWN default model (currently
// Opus), which it self-reports correctly -- so pinning is opt-in, not required. Set it to switch
// or pin the model (e.g. a faster one for quick chats) without touching code. A blank value counts
// as unset. Exported so it can be unit-tested as a pure env-reader, alongside accessArgs/extraArgs.
export function modelArgs(): string[] {
  const m = (process.env.CRASH_CLAUDE_MODEL ?? '').trim();
  return m ? ['--model', m] : [];
}

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) return '';
  let out = '';
  for (const block of content) {
    const b = block as { type?: string; text?: string };
    if (b && b.type === 'text' && typeof b.text === 'string') out += b.text;
  }
  return out;
}

export class ClaudeCodeProvider implements AgentProvider {
  readonly id = 'claude-code' as const;

  isAvailable(): Promise<boolean> {
    return commandExists(claudeBin());
  }

  async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    const prompt = buildPrompt(input.goal, input.context);
    // Session continuity. Turn 2+ resumes the prior conversation with `--resume <id>`.
    // Turn 1 generates its OWN session id (Claude Code 2.1.x persists sessions by default
    // when given one) and reports it back EARLY (below) so the orchestrator can resume even
    // if this very turn errors. The id is never logged.
    //
    // --strict-mcp-config is CRITICAL for Crash: without it the headless agent inherits the
    // USER's personal ~/.claude MCP fleet (Gmail, Obsidian, vault-vectors, ...). Cold-starting
    // a dozen MCP servers on every ask added tens of seconds of boot before the first token --
    // the "responses weren't coming" symptom -- and is also wrong (Crash's worker should not hold
    // the operator's personal credentials). With no paired --mcp-config it loads ZERO MCP servers,
    // giving a clean, fast sandbox (~5s to first answer). Opt back in with CRASH_CLAUDE_KEEP_MCP=1.
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
    if (process.env.CRASH_CLAUDE_KEEP_MCP !== '1') args.push('--strict-mcp-config');
    // Each ask is a FRESH session by default. The conversational prompt (see prompt.ts) answers
    // self-contained from general knowledge and does NOT depend on prior turns, so resuming the
    // persisted session was pure cost: turn 2+ re-loaded the whole prior transcript and re-explored
    // -- the "claude cli is stuck on turn 2" symptom. Opt into real multi-turn continuity with
    // CRASH_CLAUDE_RESUME=1 once the prompt is made context-aware.
    let createdSessionId: string | null = null;
    if (input.resumeSessionId && process.env.CRASH_CLAUDE_RESUME === '1') {
      args.push('--resume', input.resumeSessionId);
    } else {
      createdSessionId = randomUUID();
      args.push('--session-id', createdSessionId);
    }
    args.push(...accessArgs());
    args.push(...modelArgs());
    args.push(...extraArgs());

    yield { kind: 'status', state: 'running', detail: 'asking Claude' };
    // Emit the new id BEFORE consuming any output, so a turn that errors mid-stream still
    // leaves the orchestrator holding a resumable id for the next ask.
    if (createdSessionId) yield { kind: 'session', sessionId: createdSessionId };

    let streamedDelta = false;
    let finalText = '';
    try {
      const it = spawnJsonLines(claudeBin(), args, { cwd: input.workspaceDir, signal: input.signal });
      for await (const line of it) {
        // Forward the VERBATIM CLI line for the read-only Technical tab. Not parsed/prettified;
        // the orchestrator ships it as terminal.output and NEVER logs or persists it.
        yield { kind: 'raw', stream: line.stream, line: line.raw };
        const j = line.json as { type?: string; subtype?: string; result?: string; message?: { content?: unknown }; event?: { type?: string; delta?: { text?: string } } } | undefined;
        if (!j) continue;
        if (j.type === 'stream_event' && j.event?.type === 'content_block_delta' && j.event.delta?.text) {
          streamedDelta = true;
          yield { kind: 'text', delta: j.event.delta.text };
        } else if (j.type === 'assistant' && j.message) {
          const t = textFromContent(j.message.content);
          if (t && !streamedDelta) yield { kind: 'text', delta: t };
          if (t) finalText = t;
        } else if (j.type === 'result' && typeof j.result === 'string') {
          finalText = j.result;
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
