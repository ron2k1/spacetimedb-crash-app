import { describe, it, expect } from 'vitest';
import { ConnectorDescriptorSchema } from '../../src/connectors/types.js';

describe('ConnectorDescriptor', () => {
  it('validates a search connector', () => {
    const r = ConnectorDescriptorSchema.safeParse({
      id: 'tavily',
      family: 'search',
      baseUrl: 'https://api.tavily.com',
      auth: { scheme: 'bearer' },
      capabilities: ['search'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown capability', () => {
    const r = ConnectorDescriptorSchema.safeParse({
      id: 'x',
      family: 'search',
      baseUrl: 'https://x',
      auth: { scheme: 'bearer' },
      capabilities: ['teleport'],
    });
    expect(r.success).toBe(false);
  });
});
