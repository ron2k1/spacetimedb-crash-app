// marketplace-server/src/runtime/paidSearch.ts
//
// The fuse: ONE call = pay + search. Lifted from backend/src/connectors/paidSearch.ts (imports
// made local). A Tavily search performed THROUGH the x402 buyer, so a single HTTP round-trip is
// simultaneously the USDC micropayment and the web search. Cap-gated before any signing; canned
// fallback so the demo never flops on a dead network or an unfunded wallet.
//
// SECURITY: the response body is consumed only to extract hit title/url/content; never logged.
// All activity codes are synthetic. A failure never settles and never invents a txRef.

import type { PaidFetchResult } from "./buyer.js";
import type { SearchHit, ToolEvent } from "./search.js";
import { formatUsdc, type PaymentEvent } from "./x402.js";

/** Narrowed cap view: the caller binds the agentId so paidSearch stays decoupled from CapLedger's
 *  keying (a fake is trivially { canSpend: () => true, record: () => {} }). */
export interface CapView {
  canSpend(amountMinor: number): boolean;
  record(amountMinor: number): void;
}

export interface PaidSearchArgs {
  agentId: string;
  query: string;
  endpoint: string; // Tavily x402 endpoint URL (non-secret config)
  paidFetch: (url: string, init?: RequestInit) => Promise<PaidFetchResult>;
  ledger: CapView;
  amountMinor: number; // per-search USDC cost in minor units (10000 = 0.01 USDC for Tavily x402)
  network: string; // CAIP-2 chain id -> the PaymentEvent.network display string
  payTo?: string; // optional seller address for display
  tavilyKey?: string; // bearer for the key-auth FALLBACK only -- never sent to the keyless x402 endpoint
  keyAuthBaseUrl?: string; // api.tavily.com base -> a REAL key-auth search when the x402 leg can't settle
  fetchImpl?: typeof fetch; // test seam for the key-auth fallback request (defaults to global fetch)
  emit: (e: ToolEvent | PaymentEvent) => void;
  canned?: SearchHit[]; // flop-proof fallback
}

export async function runPaidSearch(args: PaidSearchArgs): Promise<{ results: SearchHit[] }> {
  const {
    agentId,
    query,
    endpoint,
    paidFetch,
    ledger,
    amountMinor,
    network,
    payTo,
    tavilyKey,
    keyAuthBaseUrl,
    fetchImpl,
    emit,
    canned,
  } = args;
  const amount = formatUsdc(amountMinor);

  // Shared degradation for any x402 FAILURE path: try a REAL key-auth Tavily search first (when a
  // CRASH_TAVILY_API_KEY is configured), else fall to the canned brief. This is what makes search
  // real even with NO funded wallet. Key-auth is account-billed, not paid onchain, so on success we
  // emit ONLY a tool 'ok' and NEVER a settled payment beat (we never dress up a non-payment as one).
  const keyAuthOrCanned = async (code: string): Promise<SearchHit[]> => {
    if (tavilyKey && keyAuthBaseUrl) {
      const viaKey = await keyAuthSearch({
        baseUrl: keyAuthBaseUrl,
        apiKey: tavilyKey,
        query,
        fetchImpl: fetchImpl ?? fetch,
      });
      if (viaKey && viaKey.length > 0) {
        emit({ agentId, tool: "search", phase: "ok" });
        return viaKey;
      }
    }
    emit({ agentId, tool: "search", phase: "error", code });
    return cannedOrEmpty(canned, agentId, emit);
  };

  // 1. Cap gate FIRST -- before any payment beat or signing. (A budget denial is policy, not a
  //    connector fault, so it does NOT fall back to key-auth -- that would bypass the spend cap.)
  if (!ledger.canSpend(amountMinor)) {
    emit({ agentId, tool: "search", phase: "error", code: "payment_cap_exceeded" });
    return { results: cannedOrEmpty(canned, agentId, emit) };
  }

  // 2. Payment + tool beats around the single paid round-trip.
  emit({ agentId, phase: "required", amount, asset: "USDC", network, payTo });
  emit({ agentId, tool: "search", phase: "start" });
  emit({ agentId, phase: "signing", amount, asset: "USDC", network, payTo });

  try {
    // The x402 endpoint is KEYLESS -- you authenticate by PAYING, not with a token. The Tavily key is
    // intentionally NOT attached here; it is reserved for the key-auth fallback (keyAuthOrCanned).
    const res = await paidFetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, max_results: 5 }),
    });
    if (!res.ok) {
      return { results: await keyAuthOrCanned("connector_http_error") };
    }
    const hits = parseHits(await res.json());
    ledger.record(amountMinor);
    emit({ agentId, phase: "settled", amount, asset: "USDC", network, payTo, txRef: res.txRef });
    emit({ agentId, tool: "search", phase: "ok" });
    return { results: hits };
  } catch (err) {
    // The buyer throws wallet_not_configured when fund-later has not yet happened.
    const code =
      err instanceof Error && err.message === "wallet_not_configured"
        ? "connector_payment_required"
        : "connector_http_error";
    return { results: await keyAuthOrCanned(code) };
  }
}

/**
 * REAL key-auth Tavily search against the classic REST API (api.tavily.com), used as a FALLBACK when
 * the x402 leg can't settle (no funded wallet, or the x402 endpoint is unreachable) but a Tavily key
 * is configured. Billed to the account, NOT paid onchain -> the caller emits no settled beat for it.
 * Returns null on any failure so the caller falls through to the canned brief.
 * SECURITY: the response body is consumed for hits only, never logged; the key never leaves the header.
 */
async function keyAuthSearch(args: {
  baseUrl: string;
  apiKey: string;
  query: string;
  fetchImpl: typeof fetch;
}): Promise<SearchHit[] | null> {
  const { baseUrl, apiKey, query, fetchImpl } = args;
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}/search`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, max_results: 5 }),
    });
    if (!res.ok) return null; // never retain the body
    return parseHits(await res.json());
  } catch {
    return null;
  }
}

function parseHits(body: unknown): SearchHit[] {
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results.slice(0, 5).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return {
      title: typeof o.title === "string" ? o.title : "",
      url: typeof o.url === "string" ? o.url : "",
      content: typeof o.content === "string" ? o.content : "",
    };
  });
}

// Falling back to canned hits still reads as success (tool 'ok') so the demo continues.
function cannedOrEmpty(
  canned: SearchHit[] | undefined,
  agentId: string,
  emit: (e: ToolEvent | PaymentEvent) => void,
): SearchHit[] {
  if (canned && canned.length > 0) {
    emit({ agentId, tool: "search", phase: "ok" });
    return canned;
  }
  return [];
}
