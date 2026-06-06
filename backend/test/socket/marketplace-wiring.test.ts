import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { makeMessage } from '@crash/protocol';
import { Session } from '../../src/socket/session.js';
import { DeterministicProvider } from '../../src/agent/deterministic.js';
import { ensureWorkspace, resolveWorkspace } from '../../src/workspace/paths.js';

// The Session test seam is the existing `send` sink (there is no onEmit option): we wrap
// it so every shipped frame is delivered to `onMsg` as a parsed object.
function makeTestSession(onMsg: (m: any) => void, caps?: Record<string, number>) {
  const workspace = ensureWorkspace(
    resolveWorkspace(path.join(os.tmpdir(), 'crash-mkt-wiring-test')),
  );
  return new Session({
    sessionId: 'sess_test',
    provider: new DeterministicProvider('claude-code'),
    workspace,
    engineVersion: '0.1.0',
    send: (raw) => onMsg(JSON.parse(raw)),
    caps,
  });
}

describe('marketplace wiring', () => {
  it('permission.grant records the folder and re-emits wallet.status', async () => {
    const emitted: string[] = [];
    const session = makeTestSession((m) => emitted.push(m.type));
    await session.handleRaw(
      JSON.stringify(makeMessage('permission.grant', session.id, 1, { folder: path.join(os.tmpdir(), 'granted') })),
    );
    expect(emitted).toContain('wallet.status');
  });

  it('marketplace.purchase over cap emits payment.activity(required) then error(payment_cap_exceeded)', async () => {
    const frames: any[] = [];
    // No caps configured => deep-research-pro has no cap => canSpend() is false => denied
    // after the `required` beat, before any signing.
    const session = makeTestSession((m) => frames.push(m));
    await session.handleRaw(
      JSON.stringify(makeMessage('marketplace.purchase', session.id, 2, { listingId: 'deep-research-pro' })),
    );
    expect(frames.some((f) => f.type === 'payment.activity' && f.payload.phase === 'required')).toBe(true);
    expect(frames.some((f) => f.type === 'error' && f.payload.code === 'payment_cap_exceeded')).toBe(true);
  });
});
