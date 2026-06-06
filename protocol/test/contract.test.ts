import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ALL_EVENT_TYPES, ProtocolEventSchema, PROTOCOL_VERSION } from '../src/events.js';
import { EXAMPLES } from '../src/examples.js';

// fileURLToPath (not import.meta.url.pathname.slice(1)) — the slice trick breaks on Windows.
const here = dirname(fileURLToPath(import.meta.url));
const protocolRoot = join(here, '..');

describe('contract: examples', () => {
  it('has exactly one example per event type', () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual([...ALL_EVENT_TYPES].sort());
  });

  it('every example validates against the protocol union schema', () => {
    for (const [type, msg] of Object.entries(EXAMPLES)) {
      const result = ProtocolEventSchema.safeParse(msg);
      expect(result.success, `example "${type}" failed schema validation`).toBe(true);
    }
  });
});

describe('contract: C# mirror parity (Protocol.cs)', () => {
  const cs = readFileSync(join(protocolRoot, 'Protocol.cs'), 'utf8');

  it('declares the same protocol version', () => {
    expect(cs).toContain(`Version = ${PROTOCOL_VERSION}`);
  });

  it('mentions every event type string', () => {
    for (const type of ALL_EVENT_TYPES) {
      expect(cs.includes(`"${type}"`), `Protocol.cs missing event type "${type}"`).toBe(true);
    }
  });
});
