import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Orchestrator } from '../src/agent/orchestrator.js';
import type { AgentProvider } from '../src/agent/provider.js';
import { ensureWorkspace, resolveWorkspace } from '../src/workspace/paths.js';

function tmpWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-ws-'));
  return ensureWorkspace(resolveWorkspace(root));
}

// A provider that BLOWS UP if run. Chat turns must answer without ever touching a provider,
// so wiring this in proves the chat path returns before any agent work begins.
function explodingProvider(): AgentProvider {
  return {
    id: 'claude-code',
    isAvailable: () => Promise.resolve(true),
    async *run(): AsyncGenerator<never> {
      throw new Error('provider.run must not be called for a chat turn');
    },
  };
}

// A trivial provider that completes a turn so confirmPlan reaches result.final. Citations
// are built by the orchestrator from the RETRIEVED passages, not by the provider -- so this
// stub is enough to prove which file was read.
function echoProvider(): AgentProvider {
  return {
    id: 'claude-code',
    isAvailable: () => Promise.resolve(true),
    async *run() {
      yield { kind: 'text' as const, delta: 'Here is what I found.' };
      yield { kind: 'final' as const, answer: 'Here is what I found.' };
    },
  };
}

describe('Orchestrator intent routing (gap B: a greeting is not a skill)', () => {
  it('answers "hello" with a plain reply and emits NO plan and NO skill.save.offer', () => {
    const ws = tmpWorkspace();
    const emitted: { type: string; payload: Record<string, unknown> }[] = [];
    const orch = new Orchestrator({
      provider: explodingProvider(),
      workspace: ws,
      emit: (type, payload) => emitted.push({ type, payload }),
    });

    orch.submit({ requestId: 'req_hi', text: 'hello' });

    const types = emitted.map((e) => e.type);
    expect(types).toContain('result.final'); // a real, warm answer came back
    expect(types).not.toContain('plan.proposed'); // ...but no plan was proposed
    expect(types).not.toContain('skill.save.offer'); // ...and it was never offered as a skill
    const final = emitted.find((e) => e.type === 'result.final')!;
    expect((final.payload.answer as string).length).toBeGreaterThan(0);
    expect(final.payload.citations).toBeUndefined(); // a chat reply cites nothing

    fs.rmSync(ws.root, { recursive: true, force: true });
  });
});

describe('Orchestrator targetPath (gap A: read the file the user pointed at)', () => {
  it('reads the chosen file -- not the docs folder -- and cites it by basename', async () => {
    const ws = tmpWorkspace();
    // A decoy sits in the watched docs folder. If targetPath were ignored, THIS would be
    // read and cited. The user instead pointed at a file outside the docs folder.
    fs.writeFileSync(path.join(ws.docsDir, 'decoy.md'), 'A festival decoy that must never be read.');
    const picked = path.join(ws.root, 'picked-note.md');
    fs.writeFileSync(picked, 'The festival starts at noon on Saturday.\n\nBring sunscreen.');

    const emitted: { type: string; payload: Record<string, unknown> }[] = [];
    const orch = new Orchestrator({
      provider: echoProvider(),
      workspace: ws,
      emit: (type, payload) => emitted.push({ type, payload }),
    });

    orch.submit({ requestId: 'req_f', text: 'what does it say about the festival', targetPath: picked });

    // A pointed-at file is always a task -> a plan is proposed (never the chat shortcut).
    const proposed = emitted.find((e) => e.type === 'plan.proposed');
    expect(proposed).toBeTruthy();

    await orch.confirmPlan(proposed!.payload.planId as string);

    const final = emitted.find((e) => e.type === 'result.final');
    expect(final).toBeTruthy();
    const citations = (final!.payload.citations ?? []) as { source: string; snippet: string }[];
    expect(citations.length).toBeGreaterThan(0);
    expect(citations.every((c) => c.source === 'picked-note.md')).toBe(true); // decoy never read
    // A real task still offers to save itself as a skill (the chat branch is what suppresses it).
    expect(emitted.map((e) => e.type)).toContain('skill.save.offer');

    fs.rmSync(ws.root, { recursive: true, force: true });
  });
});
