import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EngineToRendererSchema, PROTOCOL_VERSION } from '@crash/protocol';
import { Orchestrator } from '../src/agent/orchestrator.js';
import { DeterministicProvider } from '../src/agent/deterministic.js';
import { ensureWorkspace, resolveWorkspace } from '../src/workspace/paths.js';

function tmpWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-ws-'));
  const ws = ensureWorkspace(resolveWorkspace(root));
  fs.writeFileSync(
    path.join(ws.docsDir, 'notes.md'),
    'Cedar sits highest up the valley and is the coldest of the three towns.',
  );
  return ws;
}

describe('the generic creation loop (offline provider)', () => {
  it('runs request -> answer -> a real saved skill, emitting only valid frames', async () => {
    const ws = tmpWorkspace();
    const events: { type: string; payload: Record<string, unknown> }[] = [];
    let seq = 0;

    const orch = new Orchestrator({
      provider: new DeterministicProvider('claude-code'),
      workspace: ws,
      emit: (type, payload) => {
        const envelope = { v: PROTOCOL_VERSION, type, sessionId: 'sess_t', seq: seq++, payload };
        expect(EngineToRendererSchema.safeParse(envelope).success).toBe(true);
        events.push({ type, payload });
      },
    });

    const requestId = 'req_t';
    // Point at the docs folder so this exercises the full FILE-task loop (plan -> confirm -> RAG ->
    // answer -> skill-save). Under Full CLI chat (#13) a no-targetPath message streams a direct
    // answer with no plan or skill-save, so this end-to-end skill test must attach a target.
    orch.submit({ requestId, text: 'which town is coldest', targetPath: ws.docsDir });
    const plan = events.find((e) => e.type === 'plan.proposed');
    expect(plan).toBeTruthy();
    await orch.confirmPlan(plan!.payload.planId as string);
    const offer = events.find((e) => e.type === 'skill.save.offer');
    expect(offer).toBeTruthy();
    orch.acceptSkillSave(requestId, offer!.payload.suggestedName as string);

    const types = events.map((e) => e.type);
    for (const need of [
      'plan.proposed',
      'status',
      'index.progress',
      'answer.partial',
      'result.final',
      'skill.save.offer',
      'skill.saved',
    ]) {
      expect(types).toContain(need);
    }

    const saved = events.find((e) => e.type === 'skill.saved');
    const abs = path.join(ws.root, saved!.payload.path as string);
    expect(fs.existsSync(abs)).toBe(true);
    expect(fs.readFileSync(abs, 'utf8')).toContain('# ');

    fs.rmSync(ws.root, { recursive: true, force: true });
  });
});
