// Offline provider. NOT the shipped path and NOT a "fake loop": it runs the REAL
// orchestrator, RAG, skills I/O and socket end-to-end, and produces a grounded
// answer derived from the actual retrieved context. Two real uses:
//   1. CI / sandboxes with no CLI installed (so the full loop is testable).
//   2. The spec's offline rehearsal fallback when venue wifi dies (Section 12).
// When a real CLI is present, detect.ts selects ClaudeCodeProvider/CodexProvider.
import type { Provider as ProviderId } from '@crash/protocol';
import type { AgentProvider, AgentRunInput } from './provider.js';
import type { AgentEvent } from './events.js';

function* sentences(text: string): Generator<string> {
  for (const s of text.split(/(?<=[.!?])\s+/)) {
    const t = s.trim();
    if (t) yield t;
  }
}

export class DeterministicProvider implements AgentProvider {
  constructor(readonly id: ProviderId = 'claude-code') {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async *run(input: AgentRunInput): AsyncIterable<AgentEvent> {
    yield { kind: 'status', state: 'running', detail: 'thinking' };

    const hasContext = input.context.trim().length > 0;
    const lead = hasContext
      ? `Here's what I found in your files about "${input.goal}": `
      : `I couldn't find anything about "${input.goal}" in your files yet. `;

    const body = hasContext
      ? [...sentences(input.context)].slice(0, 3).join(' ')
      : 'Drop some files into your docs folder and ask me again.';

    const answer = lead + body;

    // Stream the answer the way a real model would (token-ish deltas).
    for (const word of answer.split(' ')) {
      if (input.signal.aborted) {
        yield { kind: 'error', code: 'cancelled', retryable: true };
        return;
      }
      yield { kind: 'text', delta: word + ' ' };
      await new Promise((r) => setTimeout(r, 4));
    }

    yield { kind: 'final', answer: answer.trim() };
  }
}
