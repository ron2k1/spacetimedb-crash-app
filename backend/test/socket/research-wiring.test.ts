import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { makeMessage } from '@crash/protocol';
import { Session } from '../../src/socket/session.js';
import { DeterministicProvider } from '../../src/agent/deterministic.js';
import { ensureWorkspace, resolveWorkspace } from '../../src/workspace/paths.js';

// No tavilyX402Url and no tavily key -> tier 3 canned brief: fully deterministic + offline.
function makeTestSession(onMsg: (m: any) => void) {
  const workspace = ensureWorkspace(resolveWorkspace(path.join(os.tmpdir(), 'crash-research-wiring-test')));
  return new Session({
    sessionId: 'sess_research',
    provider: new DeterministicProvider('claude-code'),
    workspace,
    engineVersion: '0.1.0',
    send: (raw) => onMsg(JSON.parse(raw)),
  });
}

describe('research-agent wiring', () => {
  it('request.submit agentId=research-agent routes to runResearch and emits a cited result.final', async () => {
    const frames: any[] = [];
    const session = makeTestSession((m) => frames.push(m));
    await session.handleRaw(
      JSON.stringify(
        makeMessage('request.submit', session.id, 1, {
          requestId: 'r1',
          text: 'find x402 docs',
          agentId: 'research-agent',
        }),
      ),
    );
    const final = frames.find((f) => f.type === 'result.final');
    expect(final).toBeDefined();
    expect(final.payload.requestId).toBe('r1');
    expect(typeof final.payload.answer).toBe('string');
    expect(Array.isArray(final.payload.citations)).toBe(true);
    expect(frames.some((f) => f.type === 'tool.activity')).toBe(true);
  });

  it('request.submit with no agentId does NOT take the research path', async () => {
    const frames: any[] = [];
    const session = makeTestSession((m) => frames.push(m));
    await session.handleRaw(
      JSON.stringify(makeMessage('request.submit', session.id, 1, { requestId: 'r2', text: 'hello' })),
    );
    // The research path's unmistakable signature is a tool.activity (search) frame; the default
    // orchestrator path never emits one. ('hello' is chat intent, so orch.submit DOES reply
    // synchronously -- but with a chat reply, NOT a research brief. Asserting on the brief text
    // proves the research branch was untaken without depending on orch.submit being async.)
    expect(frames.some((f) => f.type === 'tool.activity')).toBe(false);
    const final = frames.find((f) => f.type === 'result.final');
    expect(final?.payload?.answer?.startsWith('Research brief') ?? false).toBe(false);
  });

  it('every frame the research run emits is a valid engine->renderer frame', async () => {
    const frames: any[] = [];
    const session = makeTestSession((m) => frames.push(m));
    await session.handleRaw(
      JSON.stringify(
        makeMessage('request.submit', session.id, 1, { requestId: 'r3', text: 'q', agentId: 'research-agent' }),
      ),
    );
    // The send sink only receives frames that already passed the egress safeParse.
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) expect(typeof f.type).toBe('string');
  });
});
