import { describe, it, expect } from 'vitest';
import { PROTOCOL_VERSION, ALL_EVENT_TYPES, ProtocolEventSchema, makeMessage } from '@crash/protocol';
import { SPEAKS_PROTOCOL, ENGINE_VERSION } from '../src/index.js';

describe('@crash/protocol is importable from @crash/engine', () => {
  it('exposes a numeric PROTOCOL_VERSION', () => {
    expect(typeof PROTOCOL_VERSION).toBe('number');
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('exposes all 35 event types', () => {
    expect(ALL_EVENT_TYPES).toHaveLength(35);
  });

  it('the engine reports the contract version it speaks', () => {
    expect(SPEAKS_PROTOCOL).toBe(PROTOCOL_VERSION);
    expect(typeof ENGINE_VERSION).toBe('string');
  });

  it('can build and validate a message using the shared contract', () => {
    const msg = makeMessage('session.ready', 'sess_1', 0, {
      sessionId: 'sess_1',
      protocolVersion: PROTOCOL_VERSION,
      engineVersion: ENGINE_VERSION,
      provider: 'claude-code',
    });
    expect(ProtocolEventSchema.safeParse(msg).success).toBe(true);
  });
});
