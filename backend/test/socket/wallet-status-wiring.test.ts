import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { makeMessage } from '@crash/protocol';
import { Session } from '../../src/socket/session.js';
import { DeterministicProvider } from '../../src/agent/deterministic.js';
import { ensureWorkspace, resolveWorkspace } from '../../src/workspace/paths.js';
import type { PaidFetchResult } from '../../src/payments/buyer.js';

// The wallet badge is the ONE place the x402 commerce story becomes visible. These tests pin the
// two lifecycle moments the badge depends on:
//   1. ready() must emit an initial wallet.status (else the chip reads "-- USDC" forever).
//   2. a paid research run must re-emit wallet.status so the balance ticks DOWN per real payment.
// A SessionOptions.paidFetch seam lets us drive a deterministic settled/failed payment with no
// network and no chain -- the same code path a funded x402.wallet key exercises for real.

const SEED = 1_000_000; // 1 USDC starting balance (USDC minor units, 6 decimals)
const COST = 10_000; // 0.01 USDC per Tavily x402 search (RESEARCH_COST_MINOR)
const X402_URL = 'https://x402.tavily.com/search';

function baseOpts(onMsg: (m: any) => void, extra: Record<string, unknown>) {
  const workspace = ensureWorkspace(resolveWorkspace(path.join(os.tmpdir(), 'crash-wallet-status-test')));
  return {
    sessionId: 'sess_wallet',
    provider: new DeterministicProvider('claude-code'),
    workspace,
    engineVersion: '0.1.0',
    send: (raw: string) => onMsg(JSON.parse(raw)),
    ...extra,
  } as ConstructorParameters<typeof Session>[0];
}

// A fake buyer that resolves as a SETTLED on-chain payment: ok, real results, a txRef. This is the
// shape the real x402 buyer returns once a funded wallet signs the ERC-3009 transfer.
const settledFetch = async (): Promise<PaidFetchResult> => ({
  ok: true,
  status: 200,
  headers: { get: (k: string) => (k === 'x-payment-response' ? '0xtestref' : null) },
  json: async () => ({ results: [{ title: 'X402 Spec Live', url: 'https://x402.org', content: 'live result' }] }),
  txRef: '0xtestref',
});

// A fake buyer that fails closed exactly like the real buyer with no wallet key (throws at signing).
const failClosedFetch = async (): Promise<PaidFetchResult> => {
  throw new Error('wallet_not_configured');
};

async function submitResearch(session: Session, requestId: string, text: string): Promise<void> {
  await session.handleRaw(
    JSON.stringify(makeMessage('request.submit', session.id, 1, { requestId, text, agentId: 'research-agent' })),
  );
}

describe('wallet.status wiring', () => {
  it('ready() emits an initial wallet.status with the seeded balance and the research-agent cap', () => {
    const frames: any[] = [];
    const session = new Session(
      baseOpts((m) => frames.push(m), { walletBalanceMinor: SEED, caps: { 'research-agent': SEED } }),
    );
    session.ready();

    const ws = frames.filter((f) => f.type === 'wallet.status');
    expect(ws.length).toBe(1);
    expect(ws[0].payload.balanceMinor).toBe(SEED);
    expect(ws[0].payload.caps.some((c: any) => c.agentId === 'research-agent')).toBe(true);
  });

  it('a settled paid research search ticks the balance DOWN by the search cost', async () => {
    const frames: any[] = [];
    const session = new Session(
      baseOpts((m) => frames.push(m), {
        walletBalanceMinor: SEED,
        caps: { 'research-agent': SEED },
        tavilyX402Url: X402_URL,
        paidFetch: settledFetch,
      }),
    );
    await submitResearch(session, 'r1', 'find x402');

    // A real settlement fired (not a canned fallback): one settled beat, the real txRef, Base mainnet.
    const settled = frames.filter((f) => f.type === 'payment.activity' && f.payload.phase === 'settled');
    expect(settled.length).toBe(1);
    expect(settled[0].payload.txRef).toBe('0xtestref');
    expect(settled[0].payload.network).toBe('eip155:8453'); // Base mainnet

    // The badge balance reflects the spend: SEED - one search cost.
    const ws = frames.filter((f) => f.type === 'wallet.status');
    expect(ws.length).toBeGreaterThanOrEqual(1);
    expect(ws[ws.length - 1].payload.balanceMinor).toBe(SEED - COST);

    // The brief is built from the REAL hit (proves it did not silently fall back to the canned brief).
    const final = frames.find((f) => f.type === 'result.final');
    expect(final.payload.answer).toContain('X402 Spec Live');
  });

  it('an unfunded (fail-closed) research run emits wallet.status but does NOT decrement the balance', async () => {
    const frames: any[] = [];
    const session = new Session(
      baseOpts((m) => frames.push(m), {
        walletBalanceMinor: SEED,
        caps: { 'research-agent': SEED },
        tavilyX402Url: X402_URL,
        paidFetch: failClosedFetch,
      }),
    );
    await submitResearch(session, 'r2', 'find x402');

    // Never settled -> never charged.
    expect(frames.some((f) => f.type === 'payment.activity' && f.payload.phase === 'settled')).toBe(false);

    // The badge still refreshes, and the balance is honestly unchanged (no money moved).
    const ws = frames.filter((f) => f.type === 'wallet.status');
    expect(ws.length).toBeGreaterThanOrEqual(1);
    expect(ws[ws.length - 1].payload.balanceMinor).toBe(SEED);
  });
});
