// marketplace-server/src/runtime/tavily.ts
//
// Constants + pure helpers for the paid web-search leg of an agent run. Lifted from the engine's
// backend/src/socket/research.ts so the marketplace-server is a self-contained agent runtime.
//
// Grounding (research a120ef85, 2026-06-02): Tavily's first-party x402 endpoint is
// POST https://x402.tavily.com/search -- KEYLESS (you pay USDC instead of authenticating).
// In the engine that endpoint settles on Base MAINNET; for THIS marketplace demo we present the
// whole storefront on Base Sepolia (eip155:84532) so the payment narrative reads as a single
// testnet network across both the real Tavily leg and the simulated agent->agent leg.

import type { SearchHit } from "./search.js";

/**
 * Inlined protocol types. The brief forbids adding @crash/protocol as a dep here, so the two
 * tiny shapes the runtime actually needs are reproduced verbatim (kept byte-identical to the
 * canonical zod-inferred types in packages/protocol so a future merge is trivial).
 */
/** A cited source. There is NO url field -> any URL lives inline in the answer text. */
export interface Citation {
  source: string;
  snippet: string;
}
/** A per-agent spend cap snapshot in USDC minor units (6 decimals). */
export interface WalletCap {
  agentId: string;
  capMinor: number;
  spentMinor: number;
}

/** Logical id used to key the research path's spend cap inside the CapLedger. */
export const RESEARCH_AGENT_ID = "research-agent";
/** 0.01 USDC per Tavily x402 call (6-decimal minor units). The single source of truth for cost. */
export const RESEARCH_COST_MINOR = 10000;
/**
 * Host-seeded demo budget for the research path (1 USDC = 100 paid calls). The CapLedger denies
 * any agent with NO configured cap (caps.ts: cap===undefined -> false), so without this seed the
 * server would reject the research path BEFORE the x402 required/signing beats ever fire -- the
 * payment narrative would never show. Seeding an OPEN cap makes the *missing wallet* (not the cap)
 * the fail-closed gate: build-now/fund-later still falls to a canned brief at signing, but now the
 * payment beats are visible. Drop a funded CRASH_X402_WALLET key and the SAME path settles for real.
 */
export const RESEARCH_DEMO_CAP_MINOR = RESEARCH_COST_MINOR * 100; // 1 USDC session budget
/** CAIP-2 chain id for the whole storefront demo: Base Sepolia testnet. */
export const MARKET_NETWORK = "eip155:84532";
export const TAVILY_X402_URL = "https://x402.tavily.com/search"; // first-party x402 endpoint (keyless)
export const TAVILY_BASE_URL = "https://api.tavily.com"; // legacy key-auth REST API (bearer fallback)

/** Flop-proof fallback so a run NEVER hard-fails on a dead network or an unfunded wallet. */
export const RESEARCH_CANNED_HITS: SearchHit[] = [
  {
    title: "x402 + Tavily (offline brief)",
    url: "https://x402.org",
    content:
      "Live search was unavailable, so this is a canned brief. With a funded Base USDC wallet, this run pays a 0.01 USDC micropayment to the Tavily x402 endpoint and returns live cited results.",
  },
];

/** Compose a short plain-text brief from hits (used by the offline inference stub). */
export function briefFromHits(query: string, hits: SearchHit[]): string {
  if (hits.length === 0) return `No web results were found for "${query}".`;
  const lines = hits.slice(0, 5).map((h, i) => `${i + 1}. ${h.title} -- ${h.url}`);
  return `Research brief for "${query}":\n${lines.join("\n")}`;
}

/** Project hits into citations. Citation = { source, snippet }; the URL lives in the answer. */
export function citationsFromHits(hits: SearchHit[]): Citation[] {
  return hits
    .slice(0, 5)
    .map((h) => ({ source: h.title || h.url, snippet: h.content.slice(0, 280) }));
}

/** The search tiers, highest-fidelity first. Mirrors the runPaidSearch fall-through in paidSearch.ts. */
export type SearchTier = "x402" | "tavily" | "offline";

/**
 * Which search tier WOULD serve a run right now, by env presence -- the search analogue of
 * describeInference(). Pure + side-effect-free, so it is safe to expose from /api/config.
 *
 * Order mirrors runPaidSearch EXACTLY: a configured x402 wallet is attempted first (a real onchain
 * USDC micropayment to the keyless Tavily x402 endpoint), else a key-auth Tavily search (billed to
 * the account, no onchain settle), else the canned offline brief. As with describeInference, this
 * reports the CONFIGURED top tier -- a present-but-UNFUNDED wallet or a bad key degrades to the next
 * tier at call time, and the run record (the settled payment beat / the citation text) is what
 * reflects the actual outcome of a given run. So config answers "what is configured" and the run
 * answers "what happened"; neither can overclaim on its own.
 */
export function describeSearch(): SearchTier {
  if (process.env.CRASH_X402_WALLET) return "x402";
  if (process.env.CRASH_TAVILY_API_KEY) return "tavily";
  return "offline";
}
