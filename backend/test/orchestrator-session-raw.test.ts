// Session continuity (Feature B) + raw-output forwarding (Feature C), proven against the
// REAL protocol schema. One Orchestrator is 1:1 with one WebSocket Session, so the provider
// session id captured on the first ask must be fed back as resumeSessionId on the second --
// and each provider `raw` event must surface as a terminal.output wire frame.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EngineToRendererSchema, PROTOCOL_VERSION } from '@crash/protocol';
import { Orchestrator } from '../src/agent/orchestrator.js';
import type { AgentProvider, AgentRunInput } from '../src/agent/provider.js';
import { ensureWorkspace, resolveWorkspace } from '../src/workspace/paths.js';

function tmpWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-ws-'));
  const ws = ensureWorkspace(resolveWorkspace(root));
  fs.writeFileSync(path.join(ws.docsDir, 'notes.md'), 'Cedar is the coldest town in the valley.');
  return ws;
}

const FAKE_SID = 'sess_provider_turn1';

// Records the resumeSessionId of EVERY run() call, reports a session id + one raw line on the
// first turn, then finishes. Distinct from the offline DeterministicProvider so the test pins
// exactly the new session/raw plumbing without depending on real CLI output.
function recordingProvider(seenResume: (v: string | undefined) => void): AgentProvider {
  let turn = 0;
  return {
    id: 'claude-code',
    isAvailable: () => Promise.resolve(true),
    async *run(input: AgentRunInput) {
      seenResume(input.resumeSessionId);
      const first = turn++ === 0;
      yield { kind: 'status', state: 'running', detail: 'asking' };
      if (first) yield { kind: 'session', sessionId: FAKE_SID };
      yield { kind: 'raw', stream: 'stdout', line: '{"type":"raw-cli-line"}' };
      yield { kind: 'text', delta: 'Cedar.' };
      yield { kind: 'final', answer: 'Cedar.' };
    },
  };
}

describe('session continuity + raw forwarding', () => {
  it('threads the provider session id across asks and emits terminal.output for raw lines', async () => {
    const ws = tmpWorkspace();
    const target = path.join(ws.docsDir, 'notes.md'); // targetPath => always a task, never chat
    const resumeSeen: (string | undefined)[] = [];
    const events: { type: string; payload: Record<string, unknown> }[] = [];
    let seq = 0;

    const orch = new Orchestrator({
      provider: recordingProvider((v) => resumeSeen.push(v)),
      workspace: ws,
      emit: (type, payload) => {
        // Validate every frame against the FROZEN contract, exactly like the session layer.
        const envelope = { v: PROTOCOL_VERSION, type, sessionId: 'sess_t', seq: seq++, payload };
        expect(EngineToRendererSchema.safeParse(envelope).success).toBe(true);
        events.push({ type, payload });
      },
    });

    // --- ask 1: provider starts fresh and reports back its session id ---
    orch.submit({ requestId: 'req_1', text: 'which town is coldest', targetPath: target });
    const plan1 = events.find((e) => e.type === 'plan.proposed');
    expect(plan1).toBeTruthy();
    await orch.confirmPlan(plan1!.payload.planId as string);

    // (C) the raw line surfaced as a terminal.output frame with the exact payload shape.
    const term = events.find((e) => e.type === 'terminal.output');
    expect(term).toBeTruthy();
    expect(term!.payload).toMatchObject({
      requestId: 'req_1',
      stream: 'stdout',
      line: '{"type":"raw-cli-line"}',
      seq: 0,
    });
    expect(events.some((e) => e.type === 'provider.session' && e.payload.state === 'starting')).toBe(true);
    expect(events.some((e) => e.type === 'provider.session' && e.payload.state === 'ready')).toBe(true);
    expect(events.some((e) => e.type === 'provider.session' && e.payload.state === 'done')).toBe(true);

    // --- ask 2 (same orchestrator == same WS session): must resume turn 1's id ---
    events.length = 0;
    orch.submit({ requestId: 'req_2', text: 'and the warmest', targetPath: target });
    const plan2 = events.find((e) => e.type === 'plan.proposed');
    expect(plan2).toBeTruthy();
    await orch.confirmPlan(plan2!.payload.planId as string);

    // (B) turn 1 had no id to resume; turn 2 resumes the id the provider yielded on turn 1.
    expect(resumeSeen).toEqual([undefined, FAKE_SID]);

    fs.rmSync(ws.root, { recursive: true, force: true });
  });
});
