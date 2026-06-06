// backend/src/connectors/paidSearch.ts
//
// The fuse: ONE call = pay + search. A Tavily search performed THROUGH the x402 buyer, so a
// single HTTP round-trip is simultaneously the USDC micropayment (Base mainnet, eip155:8453) and
// the web search. Cap-gated before any signing; canned fallback so the demo never flops on a dead
// network or an unfunded wallet.
//
// SECURITY: the response body is consumed only to extract hit title/url/content; never logged.
// All activity codes are synthetic. A failure never settles and never invents a txRef.

import type { SearchHit, ToolEvent } from './search.js';
import type { PaymentEvent } from '../payments/x402.js';
import { formatUsdc } from '../payments/x402.js';
import type { PaidFetchResult } from '../payments/buyer.js';

/** Narrowed cap view: runResearch binds the agentId so paidSearch stays decoupled from
 *  CapLedger's keying (a fake is trivially { canSpend: () => true, record: () => {} }). */
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
  network: string; // CAIP-2 chain id -> the PaymentEvent.network display string (e.g. 'eip155:8453' Base mainnet)
  payTo?: string; // optional seller address for display
  tavilyKey?: string; // optional bearer; attach only when present
  emit: (e: ToolEvent | PaymentEvent) => void;
  canned?: SearchHit[]; // flop-proof fallback
}

export async function runPaidSearch(args: PaidSearchArgs): Promise<{ results: SearchHit[] }> {
  const { agentId, query, endpoint, paidFetch, ledger, amountMinor, network, payTo, tavilyKey, emit, canned } = args;
  const amount = formatUsdc(amountMinor);

  // 1. Cap gate FIRST -- before any payment beat or signing.
  if (!ledger.canSpend(amountMinor)) {
    emit({ agentId, tool: 'search', phase: 'error', code: 'payment_cap_exceeded' });
    return { results: cannedOrEmpty(canned, agentId, emit) };
  }

  // 2. Payment + tool beats around the single paid round-trip.
  emit({ agentId, phase: 'required', amount, asset: 'USDC', network, payTo });
  emit({ agentId, tool: 'search', phase: 'start' });
  emit({ agentId, phase: 'signing', amount, asset: 'USDC', network, payTo });

  try {
    const res = await paidFetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(tavilyKey ? { authorization: `Bearer ${tavilyKey}` } : {}),
      },
      body: JSON.stringify({ query, max_results: 5 }),
    });
    if (!res.ok) {
      emit({ agentId, tool: 'search', phase: 'error', code: 'connector_http_error' });
      return { results: cannedOrEmpty(canned, agentId, emit) };
    }
    const hits = parseHits(await res.json());
    ledger.record(amountMinor);
    emit({ agentId, phase: 'settled', amount, asset: 'USDC', network, payTo, txRef: res.txRef });
    emit({ agentId, tool: 'search', phase: 'ok' });
    return { results: hits };
  } catch (err) {
    // The buyer throws wallet_not_configured when fund-later has not yet happened.
    const code =
      err instanceof Error && err.message === 'wallet_not_configured'
        ? 'connector_payment_required'
        : 'connector_http_error';
    emit({ agentId, tool: 'search', phase: 'error', code });
    return { results: cannedOrEmpty(canned, agentId, emit) };
  }
}

function parseHits(body: unknown): SearchHit[] {
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results.slice(0, 5).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return {
      title: typeof o.title === 'string' ? o.title : '',
      url: typeof o.url === 'string' ? o.url : '',
      content: typeof o.content === 'string' ? o.content : '',
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
    emit({ agentId, tool: 'search', phase: 'ok' });
    return canned;
  }
  return [];
}
