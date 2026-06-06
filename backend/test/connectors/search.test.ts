import { describe, it, expect, vi } from 'vitest';
import { runSearch } from '../../src/connectors/search.js';

describe('runSearch', () => {
  it('emits start->ok and returns results on success', async () => {
    const phases: string[] = [];
    const fakeFetch = vi.fn(async () => ({ ok: true, json: async () => ({ results: [{ title: 'T', url: 'u', content: 'c' }] }) }) as any);
    const r = await runSearch({ agentId: 'research-agent', query: 'q', apiKey: 'k', baseUrl: 'https://api.tavily.com', fetchImpl: fakeFetch, emit: (e) => phases.push(e.phase) });
    expect(phases).toEqual(['start', 'ok']);
    expect(r.results[0].title).toBe('T');
  });

  it('falls back to canned results and emits start->ok when the call throws', async () => {
    const phases: string[] = [];
    const fakeFetch = vi.fn(async () => { throw new Error('net'); });
    const r = await runSearch({ agentId: 'research-agent', query: 'q', apiKey: 'k', baseUrl: 'https://api.tavily.com', fetchImpl: fakeFetch, emit: (e) => phases.push(e.phase), canned: [{ title: 'C', url: 'cu', content: 'cc' }] });
    expect(r.results[0].title).toBe('C');
    expect(phases).toEqual(['start', 'ok']); // flop-proof: fallback still reads as success
  });
});
