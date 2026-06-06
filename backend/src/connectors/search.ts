export interface SearchHit { title: string; url: string; content: string }
export interface ToolEvent { agentId: string; tool: 'search'; phase: 'start' | 'ok' | 'error'; code?: string }

/**
 * Tavily-backed search. `fetchImpl` is injected for testability. On failure, if `canned`
 * results are supplied the call degrades gracefully (flop-proof) and still reports 'ok';
 * with no canned fallback it reports 'error' with a synthetic code.
 */
export async function runSearch(args: {
  agentId: string;
  query: string;
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  emit: (e: ToolEvent) => void;
  canned?: SearchHit[];
}): Promise<{ results: SearchHit[] }> {
  const { agentId, query, apiKey, baseUrl, emit, canned } = args;
  const f = args.fetchImpl ?? fetch;
  emit({ agentId, tool: 'search', phase: 'start' });
  try {
    const res = await f(`${baseUrl}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, max_results: 5 }),
    });
    if (!res.ok) throw new Error('http'); // never retain the body
    const data = (await res.json()) as { results?: SearchHit[] };
    emit({ agentId, tool: 'search', phase: 'ok' });
    return { results: data.results ?? [] };
  } catch {
    if (canned && canned.length) {
      emit({ agentId, tool: 'search', phase: 'ok' });
      return { results: canned };
    }
    emit({ agentId, tool: 'search', phase: 'error', code: 'connector_http_error' });
    return { results: [] };
  }
}
