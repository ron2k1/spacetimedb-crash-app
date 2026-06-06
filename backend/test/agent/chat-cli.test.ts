// Full CLI chat fork (#13). A free-text question with NO file attached must talk STRAIGHT to the
// headless CLI: tools on, the provider does its own research. That path emits no plan.proposed, runs
// no local RAG (empty context handed to the provider), and offers no skill.save -- a conversation is
// not a saveable skill. The two other routes are unchanged and guarded here too: a canned greeting
// still answers instantly without a provider, and (in orchestrator-intent.test.ts) a pointed-at file
// still gets the read->find->answer plan + skill-save.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EngineToRendererSchema, PROTOCOL_VERSION } from '@crash/protocol';
import { Orchestrator } from '../../src/agent/orchestrator.js';
import type { AgentProvider, AgentRunInput } from '../../src/agent/provider.js';
import { ensureWorkspace, resolveWorkspace } from '../../src/workspace/paths.js';

function tmpWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-ws-'));
  return ensureWorkspace(resolveWorkspace(root));
}

// Streams a short answer and records the context it was handed. A direct chat turn must pass an
// EMPTY context (no local RAG) -- the CLI does its own lookups with tools.
function streamingProvider(seenContext: (c: string) => void): AgentProvider {
  return {
    id: 'claude-code',
    isAvailable: () => Promise.resolve(true),
    async *run(input: AgentRunInput) {
      seenContext(input.context);
      yield { kind: 'session' as const, sessionId: 'sess_chat_1' };
      yield { kind: 'text' as const, delta: 'NVIDIA ' };
      yield { kind: 'text' as const, delta: 'just reported earnings.' };
      yield { kind: 'final' as const, answer: 'NVIDIA just reported earnings.' };
    },
  };
}

// Blows up if run. A canned greeting must answer with no provider work at all.
function explodingProvider(): AgentProvider {
  return {
    id: 'claude-code',
    isAvailable: () => Promise.resolve(true),
    async *run(): AsyncGenerator<never> {
      throw new Error('provider.run must not be called for a canned chat turn');
    },
  };
}

describe('Full CLI chat: a no-file question talks straight to the CLI', () => {
  it('streams a real answer with NO plan and NO skill.save.offer, and hands the provider empty context', async () => {
    const ws = tmpWorkspace();
    const contexts: string[] = [];
    let seq = 0;
    const events: { type: string; payload: Record<string, unknown> }[] = [];
    const orch = new Orchestrator({
      provider: streamingProvider((c) => contexts.push(c)),
      workspace: ws,
      emit: (type, payload) => {
        // Every frame must be legal under the FROZEN wire contract -- exactly like the session layer.
        const envelope = { v: PROTOCOL_VERSION, type, sessionId: 'sess_c', seq: seq++, payload };
        expect(EngineToRendererSchema.safeParse(envelope).success).toBe(true);
        events.push({ type, payload });
      },
    });

    // Free text, no targetPath, NOT a canned greeting.
    orch.submit({ requestId: 'req_chat', text: 'research the latest NVIDIA news' });

    // runDirectChat is fire-and-forget; wait until it streams its final answer.
    await vi.waitFor(() => {
      expect(events.some((e) => e.type === 'result.final')).toBe(true);
    });

    const types = events.map((e) => e.type);
    expect(types).not.toContain('plan.proposed'); // no file-plan card for a chat turn
    expect(types).not.toContain('skill.save.offer'); // a chat turn is not a saveable skill
    expect(types).toContain('answer.partial'); // it streamed deltas
    const final = events.find((e) => e.type === 'result.final')!;
    expect(final.payload.answer).toBe('NVIDIA just reported earnings.');
    expect(final.payload.citations).toBeUndefined(); // no RAG => no citations
    expect(contexts).toEqual(['']); // provider got empty context (no local retrieval)
    expect(types).toContain('status'); // and a terminal status frame

    fs.rmSync(ws.root, { recursive: true, force: true });
  });

  it('still answers a canned greeting instantly without touching the provider', () => {
    const ws = tmpWorkspace();
    const events: { type: string; payload: Record<string, unknown> }[] = [];
    const orch = new Orchestrator({
      provider: explodingProvider(),
      workspace: ws,
      emit: (type, payload) => events.push({ type, payload }),
    });

    orch.submit({ requestId: 'req_hi', text: 'hello' });

    const types = events.map((e) => e.type);
    expect(types).toContain('result.final'); // warm canned answer
    expect(types).not.toContain('plan.proposed');
    expect(types).not.toContain('answer.partial'); // canned, not streamed from a provider

    fs.rmSync(ws.root, { recursive: true, force: true });
  });
});
