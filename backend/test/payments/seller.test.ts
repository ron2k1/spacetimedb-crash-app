import { describe, it, expect, afterEach } from 'vitest';
import { startSeller } from '../../src/payments/seller.js';

let stop: (() => Promise<void>) | null = null;
afterEach(async () => { if (stop) await stop(); stop = null; });

describe('x402 seller stand-in', () => {
  it('answers 402 with a payment challenge when unpaid', async () => {
    const { port, close } = await startSeller({ priceMinor: 10000, payTo: '0xabc' });
    stop = close;
    const res = await fetch(`http://127.0.0.1:${port}/premium`);
    expect(res.status).toBe(402);
  });
});
