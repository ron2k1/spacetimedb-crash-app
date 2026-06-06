import { describe, it, expect, vi } from 'vitest';
import { makePaidFetch, type X402HttpClientLike } from '../../src/payments/buyer.js';

// A deterministic fake x402 HTTP client: no real signing, no real chain, no real challenge.
function fakeClient(): X402HttpClientLike {
  return {
    getPaymentRequiredResponse: () => ({ accepts: [] }),
    createPaymentPayload: async () => ({ signed: true }),
    encodePaymentSignatureHeader: () => ({ 'X-PAYMENT': 'sig-abc' }),
  };
}

// Minimal Response-like fake; the buyer only touches ok/status/headers.get/json.
function res(status: number, headers: Record<string, string> = {}, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  } as any;
}

describe('makePaidFetch', () => {
  it('passes a non-402 response straight through without signing', async () => {
    const fetchImpl = vi.fn(async () => res(200, {}, { results: [] }));
    const factory = vi.fn(() => fakeClient());
    const paidFetch = makePaidFetch({ walletKeyProvider: () => '0xKEY', fetchImpl, httpClientFactory: factory });
    const r = await paidFetch('https://x', { method: 'POST' });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(factory).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('on 402 signs, attaches X-PAYMENT, retries, returns txRef from x-payment-response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(402))
      .mockResolvedValueOnce(res(200, { 'x-payment-response': '0xTX' }, { results: [] }));
    const paidFetch = makePaidFetch({ walletKeyProvider: () => '0xKEY', fetchImpl, httpClientFactory: () => fakeClient() });
    const r = await paidFetch('https://x', { method: 'POST', headers: { 'content-type': 'application/json' } });
    expect(r.ok).toBe(true);
    expect(r.txRef).toBe('0xTX');
    const secondInit = fetchImpl.mock.calls[1][1];
    expect(secondInit.headers['X-PAYMENT']).toBe('sig-abc');
    expect(secondInit.headers['content-type']).toBe('application/json');
  });

  it('fails closed with wallet_not_configured when no key, never signing, no retry', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(402));
    const factory = vi.fn(() => fakeClient());
    const paidFetch = makePaidFetch({ walletKeyProvider: () => undefined, fetchImpl, httpClientFactory: factory });
    await expect(paidFetch('https://x')).rejects.toThrow('wallet_not_configured');
    expect(factory).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps a malformed 402 challenge to payment_required_malformed', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(402));
    const bad: X402HttpClientLike = {
      getPaymentRequiredResponse: () => {
        throw new Error('boom');
      },
      createPaymentPayload: async () => ({}),
      encodePaymentSignatureHeader: () => ({}),
    };
    const paidFetch = makePaidFetch({ walletKeyProvider: () => '0xKEY', fetchImpl, httpClientFactory: () => bad });
    await expect(paidFetch('https://x')).rejects.toThrow('payment_required_malformed');
  });

  it('returns ok:false when the retried payment is rejected (no txRef invented)', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(402)).mockResolvedValueOnce(res(500, {}, {}));
    const paidFetch = makePaidFetch({ walletKeyProvider: () => '0xKEY', fetchImpl, httpClientFactory: () => fakeClient() });
    const r = await paidFetch('https://x');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    expect(r.txRef).toBeUndefined();
  });
});
