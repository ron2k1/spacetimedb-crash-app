import { describe, it, expect, vi } from 'vitest';
import { runPaidSearch } from '../../src/connectors/paidSearch.js';
import { CapLedger } from '../../src/payments/caps.js';
import { makeMessage, PaymentActivitySchema } from '@crash/protocol';
import { RESEARCH_COST_MINOR, BASE_MAINNET } from '../../src/socket/research.js';

const COST = RESEARCH_COST_MINOR; // 10000 = 0.01 USDC per Tavily x402 call
const base = {
  agentId: 'research-agent',
  query: 'q',
  endpoint: 'https://e',
  network: BASE_MAINNET,
  amountMinor: COST,
};

function paidOk() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ results: [] }),
    txRef: '0xT',
  } as any;
}

describe('paid search stress', () => {
  it('stops spending at the cap boundary across repeated runs', async () => {
    // cap = 2*COST + 1 fits EXACTLY two runs: a third needs 3*COST > cap. Robust to a
    // strict-vs-<= predicate (canSpend uses spent + amount <= cap).
    const ledger = new CapLedger({ 'research-agent': COST * 2 + 1 });
    const view = {
      canSpend: (m: number) => ledger.canSpend('research-agent', m),
      record: (m: number) => ledger.record('research-agent', m),
    };
    const paidFetch = vi.fn(async () => paidOk());
    let settled = 0;
    for (let i = 0; i < 4; i++) {
      await runPaidSearch({
        ...base,
        paidFetch,
        ledger: view,
        emit: (e: any) => {
          if ('asset' in e && e.phase === 'settled') settled++;
        },
        canned: [],
      });
    }
    expect(settled).toBe(2);
    expect(ledger.snapshot()[0].spentMinor).toBe(COST * 2);
    // The buyer was invoked ONLY for the two runs that passed the cap gate (gate is checked
    // BEFORE any payment beat or signing -> an over-budget run never even constructs a signature).
    expect(paidFetch).toHaveBeenCalledTimes(2);
  });

  it('PaymentActivitySchema strips an unknown key (egress safety)', () => {
    const dirty = {
      agentId: 'research-agent',
      phase: 'settled',
      amount: '0.01',
      asset: 'USDC',
      network: BASE_MAINNET,
      txRef: '0xT',
      SECRET: 'leak',
    };
    const parsed = PaymentActivitySchema.safeParse(makeMessage('payment.activity', 's', 0, dirty));
    expect(parsed.success).toBe(true);
    expect((parsed as any).data.payload.SECRET).toBeUndefined();
  });
});
