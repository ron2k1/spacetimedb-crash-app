import { describe, it, expect } from 'vitest';
import { BUILTIN_CONNECTORS, resolveCapability } from '../../src/connectors/registry.js';

describe('connector registry', () => {
  it('ships a tavily search connector', () => {
    expect(BUILTIN_CONNECTORS.some((c) => c.id === 'tavily' && c.capabilities.includes('search'))).toBe(true);
  });

  it('resolves a capability to a connector that has a key', () => {
    const keyed = new Set(['tavily']);
    const r = resolveCapability('search', keyed);
    expect(r?.id).toBe('tavily');
  });

  it('returns null when no keyed connector provides the capability', () => {
    const r = resolveCapability('video.generate', new Set());
    expect(r).toBeNull();
  });
});
