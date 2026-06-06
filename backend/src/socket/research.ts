// backend/src/socket/research.ts
//
// Pure helpers + constants for the research-agent run. Kept out of session.ts so the Session
// class stays transport-focused; these are unit-testable in isolation.
//
// Grounding (research a120ef85, 2026-06-02): Tavily's first-party x402 endpoint is
// POST https://x402.tavily.com/search -- KEYLESS (you pay USDC instead of authenticating),
// settling on Base MAINNET (eip155:8453) at 0.01 USDC (10000 minor units) per call.

import type { SearchHit } from '../connectors/search.js';
import type { Citation } from '@crash/protocol';

export const RESEARCH_AGENT_ID = 'research-agent';
export const RESEARCH_COST_MINOR = 10000; // 0.01 USDC per Tavily x402 call (6-decimal minor units)
// Host-seeded demo budget for research-agent (1 USDC = 100 paid calls). The CapLedger denies any
// agent with NO configured cap (caps.ts: cap===undefined -> false), so without this seed the live
// server would reject research-agent BEFORE the x402 `required`/`signing` beats ever fire -- the
// payment narrative would never show. Seeding an OPEN cap makes the *missing wallet* (not the cap)
// the fail-closed gate: build-now/fund-later still falls to a canned brief at signing, but now the
// payment beats are visible. Drop a funded x402.wallet key and the SAME path settles for real.
export const RESEARCH_DEMO_CAP_MINOR = RESEARCH_COST_MINOR * 100; // 1 USDC session budget
export const BASE_MAINNET = 'eip155:8453'; // Tavily x402 settles on Base mainnet (NOT Sepolia)
export const TAVILY_X402_URL = 'https://x402.tavily.com/search'; // first-party x402 endpoint (keyless)
export const TAVILY_BASE_URL = 'https://api.tavily.com'; // legacy key-auth REST API (tier-3 bearer fallback)

export const RESEARCH_CANNED_HITS: SearchHit[] = [
  {
    title: 'x402 + Tavily (offline brief)',
    url: 'https://x402.org',
    content:
      'Live search was unavailable, so this is a canned brief. With a funded Base mainnet USDC wallet, this run pays a 0.01 USDC micropayment to the Tavily x402 endpoint and returns live cited results.',
  },
];

/** Is this the connector-backed research agent (vs the default RAG flow)? */
export function isResearchAgent(agentId: string | undefined): boolean {
  return agentId === RESEARCH_AGENT_ID;
}

export function briefFromHits(query: string, hits: SearchHit[]): string {
  if (hits.length === 0) return `No web results were found for "${query}".`;
  const lines = hits.slice(0, 5).map((h, i) => `${i + 1}. ${h.title} -- ${h.url}`);
  return `Research brief for "${query}":\n${lines.join('\n')}`;
}

export function citationsFromHits(hits: SearchHit[]): Citation[] {
  // Citation = { source, snippet }; there is NO url field -> the URL lives in `answer`.
  return hits.slice(0, 5).map((h) => ({ source: h.title || h.url, snippet: h.content.slice(0, 280) }));
}
