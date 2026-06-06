import { describe, it, expect, vi } from 'vitest';
import { runPaidSearch } from '../../src/connectors/paidSearch.js';
import { makeMessage, PaymentActivitySchema, ToolActivitySchema } from '@crash/protocol';

function tag(e: any) {
  return 'tool' in e
    ? { kind: 'tool', phase: e.phase, code: e.code }
    : { kind: 'pay', phase: e.phase, txRef: e.txRef };
}
function paidRes(over: Partial<any> = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ results: [{ title: 'T', url: 'https://u', content: 'c' }] }),
    txRef: '0xTX',
    ...over,
  } as any;
}
const base = {
  agentId: 'research-agent',
  query: 'q',
  endpoint: 'https://tavily.x402/search',
  amountMinor: 50000,
  network: 'eip155:84532',
};

describe('runPaidSearch', () => {
  it('happy path: required/signing/settled + start/ok, records cap, returns hits', async () => {
    const evs: any[] = [];
    const paidFetch = vi.fn(async () => paidRes());
    const ledger = { canSpend: () => true, record: vi.fn() };
    const r = await runPaidSearch({ ...base, paidFetch, ledger, emit: (e) => evs.push(tag(e)) });
    expect(r.results[0].title).toBe('T');
    expect(ledger.record).toHaveBeenCalledWith(50000);
    expect(evs).toEqual([
      { kind: 'pay', phase: 'required', txRef: undefined },
      { kind: 'tool', phase: 'start', code: undefined },
      { kind: 'pay', phase: 'signing', txRef: undefined },
      { kind: 'pay', phase: 'settled', txRef: '0xTX' },
      { kind: 'tool', phase: 'ok', code: undefined },
    ]);
  });

  it('cap exceeded: no fetch, no signing, canned fallback', async () => {
    const evs: any[] = [];
    const paidFetch = vi.fn();
    const ledger = { canSpend: () => false, record: vi.fn() };
    const r = await runPaidSearch({ ...base, paidFetch, ledger, emit: (e) => evs.push(tag(e)), canned: [{ title: 'C', url: 'u', content: 'c' }] });
    expect(paidFetch).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
    expect(r.results[0].title).toBe('C');
    expect(evs).toEqual([
      { kind: 'tool', phase: 'error', code: 'payment_cap_exceeded' },
      { kind: 'tool', phase: 'ok', code: undefined },
    ]);
  });

  it('no wallet: buyer throws wallet_not_configured -> connector_payment_required + canned', async () => {
    const evs: any[] = [];
    const paidFetch = vi.fn(async () => { throw new Error('wallet_not_configured'); });
    const ledger = { canSpend: () => true, record: vi.fn() };
    const r = await runPaidSearch({ ...base, paidFetch, ledger, emit: (e) => evs.push(tag(e)), canned: [{ title: 'C', url: 'u', content: 'c' }] });
    expect(r.results[0].title).toBe('C');
    expect(ledger.record).not.toHaveBeenCalled();
    expect(evs.some((e) => e.kind === 'tool' && e.phase === 'error' && e.code === 'connector_payment_required')).toBe(true);
    expect(evs.some((e) => e.kind === 'pay' && e.phase === 'settled')).toBe(false);
  });

  it('paid fetch not ok -> connector_http_error + canned, no settled, no record', async () => {
    const evs: any[] = [];
    const paidFetch = vi.fn(async () => paidRes({ ok: false, status: 502, txRef: undefined }));
    const ledger = { canSpend: () => true, record: vi.fn() };
    const r = await runPaidSearch({ ...base, paidFetch, ledger, emit: (e) => evs.push(tag(e)), canned: [{ title: 'C', url: 'u', content: 'c' }] });
    expect(r.results[0].title).toBe('C');
    expect(evs.some((e) => e.kind === 'pay' && e.phase === 'settled')).toBe(false);
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it('attaches the Tavily bearer only when a key is present', async () => {
    const withKey = vi.fn(async () => paidRes());
    await runPaidSearch({ ...base, paidFetch: withKey, ledger: { canSpend: () => true, record: () => {} }, tavilyKey: 'tk', emit: () => {} });
    expect((withKey.mock.calls[0][1] as any).headers.authorization).toBe('Bearer tk');
    const noKey = vi.fn(async () => paidRes());
    await runPaidSearch({ ...base, paidFetch: noKey, ledger: { canSpend: () => true, record: () => {} }, emit: () => {} });
    expect((noKey.mock.calls[0][1] as any).headers.authorization).toBeUndefined();
  });

  it('every emitted event validates against its protocol schema', async () => {
    const raw: any[] = [];
    await runPaidSearch({ ...base, paidFetch: async () => paidRes(), ledger: { canSpend: () => true, record: () => {} }, emit: (e) => raw.push(e) });
    for (const e of raw) {
      const type = 'tool' in e ? 'tool.activity' : 'payment.activity';
      const schema = 'tool' in e ? ToolActivitySchema : PaymentActivitySchema;
      expect(schema.safeParse(makeMessage(type, 's', 0, e)).success).toBe(true);
    }
  });
});
