import { describe, it, expect, vi } from 'vitest';
import { purchase } from '../../src/payments/x402.js';
import { CapLedger } from '../../src/payments/caps.js';

const listing = { id: 'deep-research-pro', amountMinor: 10000, payTo: '0xabc', network: 'eip155:84532' };

describe('purchase', () => {
  it('rejects over-cap before signing and never calls the paid fetch', async () => {
    const ledger = new CapLedger({ 'deep-research-pro': 5000 }); // cap below price
    const paidFetch = vi.fn();
    const events: string[] = [];
    const res = await purchase({ listing, ledger, paidFetch, emit: (p) => events.push(p.phase) });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('payment_cap_exceeded');
    expect(paidFetch).not.toHaveBeenCalled();
  });

  it('emits required->signing->settled and records the charge on success', async () => {
    const ledger = new CapLedger({ 'deep-research-pro': 50000 });
    const paidFetch = vi.fn(async () => ({ ok: true, headers: { get: () => '0xtxref' } }) as any);
    const phases: string[] = [];
    const res = await purchase({ listing, ledger, paidFetch, emit: (p) => phases.push(p.phase) });
    expect(res.ok).toBe(true);
    expect(phases).toEqual(['required', 'signing', 'settled']);
    expect(ledger.snapshot()[0].spentMinor).toBe(10000);
  });

  it('maps a thrown paid fetch to payment_failed (retryable)', async () => {
    const ledger = new CapLedger({ 'deep-research-pro': 50000 });
    const paidFetch = vi.fn(async () => { throw new Error('network'); });
    const res = await purchase({ listing, ledger, paidFetch, emit: () => {} });
    expect(res).toMatchObject({ ok: false, code: 'payment_failed', retryable: true });
  });
});
