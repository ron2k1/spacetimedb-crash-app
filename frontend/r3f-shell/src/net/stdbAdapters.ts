// stdbAdapters.ts -- PURE mappers from SpacetimeDB rows to the renderer's existing view types. No
// connection, no React, no side effects: row in, view out. So they are trivially testable and shared
// by both the marketplace hook and the auction panel.
//
// WHY a mapping layer at all: the STDB row shapes are the WIRE truth (bigint ids, micro-USDC
// priceMinor, Identity objects, Timestamp), but the UI was built against a friendlier MarketListing
// (string id, "0.05 USDC" copy, emoji icon, glow hue). Keeping the translation in one pure module
// means the generated bindings can change shape and only this file moves.

import type { Identity } from "@clockworklabs/spacetimedb-sdk";
import type { Listing, Auction, Activity } from "../stdb";
import {
  CATEGORY_GLOW,
  ICON_FALLBACK_BY_CATEGORY,
  type MarketCategory,
  type MarketListing,
} from "../data/marketplace";
import type { ActivityEvent } from "./marketplaceClient";
import type { AuctionView } from "../data/auction";

// 6-decimal minor units, matching marketplace-server's formatUsdc and the renderer's usdc() helper.
const USDC_DECIMALS = 1_000_000;

/** A SpacetimeDB Timestamp -> epoch milliseconds (microsecond precision truncated to ms). */
export function tsToMs(ts: { microsSinceUnixEpoch: bigint }): number {
  return Number(ts.microsSinceUnixEpoch / 1000n);
}

/** Micro-USDC (bigint minor units) -> a short honest display string, e.g. 50000n -> "0.05 USDC". */
export function formatPriceMinor(minor: bigint): string {
  return `${(Number(minor) / USDC_DECIMALS).toFixed(2)} USDC`;
}

/** A freeform price string ("0.05", "~0.05 USDC / run", "Protocol") -> micro-USDC bigint (0 if none). */
export function parsePriceToMinor(price: string): bigint {
  const match = price.match(/\d+(?:\.\d+)?/);
  if (!match) return 0n;
  const dollars = Number(match[0]);
  if (!Number.isFinite(dollars) || dollars < 0) return 0n;
  return BigInt(Math.round(dollars * USDC_DECIMALS));
}

/** The module stores category as a free string; clamp it back to the renderer's 4-way union. */
export function toCategory(raw: string): MarketCategory {
  return raw === "agent" || raw === "skill" || raw === "workflow" || raw === "tool"
    ? raw
    : "tool";
}

/**
 * Listing row -> MarketListing card. The numeric id is stringified; its namespace never collides with
 * the curated seed's slug ids, so the two catalogs merge cleanly. Icon/glow are derived from category
 * (live rows carry no presentational fields), and the seller kind comes from the sellerIsAgent flag --
 * which is how agent-to-agent listings read as "by Scout v2 - agent" in the UI.
 */
export function listingToMarket(row: Listing): MarketListing {
  const category = toCategory(row.category);
  return {
    id: row.id.toString(),
    name: row.name,
    blurb: row.blurb,
    category,
    icon: ICON_FALLBACK_BY_CATEGORY[category],
    glow: CATEGORY_GLOW[category],
    price: formatPriceMinor(row.priceMinor),
    tags: row.tags,
    seller: {
      kind: row.sellerIsAgent ? "agent" : "human",
      name: row.sellerName,
    },
    acquiredCount: row.acquiredCount,
    createdAt: tsToMs(row.createdAt),
  };
}

/**
 * Activity row -> ActivityEvent ticker beat. The row carries only listingId + actor Identity, so the
 * caller supplies a listingId->name lookup (joined from the listing cache) and an agent-identity set
 * (to label the actor human/agent). The renderer's ActivityEvent kind union is just listed|acquired,
 * so every non-"listed" module kind ("acquired"/"won"/"paid") collapses to acquired.
 */
export function activityToEvent(
  row: Activity,
  listingNameById: Map<string, string>,
  agentIdentities: Set<string>,
): ActivityEvent {
  const listingId = row.listingId.toString();
  const kind: ActivityEvent["kind"] = row.kind === "listed" ? "listed" : "acquired";
  return {
    id: `stdb-${row.id.toString()}`,
    kind,
    listingId,
    listingName: listingNameById.get(listingId) ?? "a listing",
    actor: {
      kind: agentIdentities.has(row.actor.toHexString()) ? "agent" : "human",
      name: row.actorName,
    },
    at: tsToMs(row.at),
  };
}

/**
 * Auction row -> AuctionView. Keeps money/time as bigint/number for the panel's live math: nextBidMinor
 * is the floor a next bid must clear (highBid + increment), endsAtMs drives the countdown, and
 * isHighBidder marks the viewer as the current leader so the UI can say "you're winning".
 */
export function auctionToView(
  row: Auction,
  listingNameById: Map<string, string>,
  me: Identity | null,
): AuctionView {
  const listingId = row.listingId.toString();
  const nextBidMinor = row.highBidMinor + row.minIncrementMinor;
  return {
    id: row.id.toString(),
    listingId,
    listingName: listingNameById.get(listingId) ?? `Lot ${row.id.toString()}`,
    status: row.status,
    highBidMinor: row.highBidMinor,
    highBidLabel: formatPriceMinor(row.highBidMinor),
    minIncrementMinor: row.minIncrementMinor,
    nextBidMinor,
    nextBidLabel: formatPriceMinor(nextBidMinor),
    endsAtMs: tsToMs(row.endsAt),
    hasBidder: row.highBidder != null,
    isHighBidder: me != null && row.highBidder != null && row.highBidder.isEqual(me),
  };
}
