import { describe, it, expect } from 'vitest';
import { CatalogListingSchema } from '@crash/protocol';
import { toListing } from '../../src/marketplace/listings.js';

const manifest = {
  id: 'deep-research-pro', name: 'Deep Research Pro', goal: 'Premium research',
  systemPrompt: 'x', requires: { capabilities: ['search'] as const },
  permissions: { readBroad: false, writeFolders: ['Research'] },
  price: { amountMinor: 10000, asset: 'USDC' as const, payTo: '0xabc' },
  source: 'builtin' as const, createdAt: '2026-06-01T00:00:00Z',
};

describe('toListing', () => {
  it('produces a schema-valid, access-forward listing', () => {
    const listing = toListing(manifest, 'Research/web');
    expect(CatalogListingSchema.safeParse(listing).success).toBe(true);
    expect(listing.accesses).toContain('Web search');
    expect(listing.price?.amountMinor).toBe(10000);
  });
});
