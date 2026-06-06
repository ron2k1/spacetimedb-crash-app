import { describe, it, expect } from 'vitest';
import { CapLedger } from '../../src/payments/caps.js';

describe('CapLedger', () => {
  it('allows a charge within the cap', () => {
    const l = new CapLedger({ 'deep-research-pro': 50000 });
    expect(l.canSpend('deep-research-pro', 10000)).toBe(true);
  });

  it('rejects a charge that would exceed the cap (before signing)', () => {
    const l = new CapLedger({ 'deep-research-pro': 50000 });
    l.record('deep-research-pro', 45000);
    expect(l.canSpend('deep-research-pro', 10000)).toBe(false);
  });

  it('treats an agent with no configured cap as not allowed', () => {
    const l = new CapLedger({});
    expect(l.canSpend('unknown', 1)).toBe(false);
  });

  it('reports caps for wallet.status', () => {
    const l = new CapLedger({ a: 100 });
    l.record('a', 30);
    expect(l.snapshot()).toEqual([{ agentId: 'a', capMinor: 100, spentMinor: 30 }]);
  });
});
