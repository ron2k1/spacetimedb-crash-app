// marketplace-server/src/runtime/x402.ts
//
// Lifted from backend/src/payments/x402.ts (imports made local). Format + purchase helpers for
// a single x402 round trip. `formatUsdc` and the PaymentEvent shape are reused by the run pipeline
// for both the real Tavily leg and the simulated agent->agent leg.

import type { CapLedger } from "./caps.js";

export interface Listing {
  id: string;
  amountMinor: number;
  payTo: string;
  network: string; // 'eip155:84532'
}

export interface PaymentEvent {
  agentId: string;
  phase: "required" | "signing" | "settled";
  amount: string;
  asset: "USDC";
  network: string;
  payTo?: string;
  txRef?: string;
}

export type PurchaseResult =
  | { ok: true; txRef?: string }
  | { ok: false; code: "payment_cap_exceeded"; retryable: false }
  | { ok: false; code: "payment_failed"; retryable: true };

/** Format USDC minor units (6 decimals) to a short display string. */
export function formatUsdc(amountMinor: number): string {
  return (amountMinor / 1_000_000).toString();
}

/**
 * Drive one x402 purchase. Cap is checked BEFORE `paidFetch` (which performs the
 * 402 -> sign ERC-3009 -> retry -> settle round trip). `paidFetch` is injected so this
 * is unit-testable offline; the runtime supplies the real `@x402`-wrapped fetch.
 */
export async function purchase(args: {
  listing: Listing;
  ledger: CapLedger;
  paidFetch: () => Promise<{ ok: boolean; headers: { get: (k: string) => string | null } }>;
  emit: (e: PaymentEvent) => void;
}): Promise<PurchaseResult> {
  const { listing, ledger, paidFetch, emit } = args;
  const base = {
    agentId: listing.id,
    amount: formatUsdc(listing.amountMinor),
    asset: "USDC" as const,
    network: listing.network,
    payTo: listing.payTo,
  };

  emit({ ...base, phase: "required" });

  if (!ledger.canSpend(listing.id, listing.amountMinor)) {
    return { ok: false, code: "payment_cap_exceeded", retryable: false };
  }

  emit({ ...base, phase: "signing" });
  try {
    const res = await paidFetch();
    if (!res.ok) return { ok: false, code: "payment_failed", retryable: true };
    const txRef = res.headers.get("x-payment-response") ?? undefined;
    ledger.record(listing.id, listing.amountMinor);
    emit({ ...base, phase: "settled", txRef });
    return { ok: true, txRef };
  } catch {
    // Never log err.message -- synthetic code only.
    return { ok: false, code: "payment_failed", retryable: true };
  }
}
