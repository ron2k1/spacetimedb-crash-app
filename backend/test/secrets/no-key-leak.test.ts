import { describe, it, expect } from 'vitest';
import { EngineToRendererSchema, makeMessage } from '@crash/protocol';

// A representative secret value. If this string ever survives a safeParse of any
// Engine->Renderer event, a field is leaking it.
const SECRET = 'tvly-THIS-MUST-NEVER-SHIP';

describe('no key leaks through the egress filter', () => {
  it('strips any out-of-contract field carrying a secret before it ships', () => {
    // Representative E->R frames built with makeMessage (no dependency on the examples
    // export map). Pollute each payload with an apiKey field that is NOT in the schema.
    const frames = [
      makeMessage('payment.activity', 'sess', 1, { agentId: 'a', phase: 'settled', amount: '0.01', asset: 'USDC', network: 'eip155:84532' }),
      makeMessage('tool.activity', 'sess', 2, { agentId: 'a', tool: 'search', phase: 'ok' }),
      makeMessage('wallet.status', 'sess', 3, { balanceMinor: 100, caps: [] }),
    ];
    for (const frame of frames) {
      const polluted = { ...frame, payload: { ...(frame as { payload: object }).payload, apiKey: SECRET } };
      const parsed = EngineToRendererSchema.safeParse(polluted);
      expect(parsed.success).toBe(true); // the contracted fields are valid...
      if (parsed.success) {
        expect(JSON.stringify(parsed.data)).not.toContain(SECRET); // ...and the secret was stripped
      }
    }
  });
});
