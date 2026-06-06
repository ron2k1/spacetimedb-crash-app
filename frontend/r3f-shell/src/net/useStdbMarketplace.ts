// useStdbMarketplace.ts -- the SpacetimeDB-backed marketplace hook. It is a DROP-IN for useMarketplace:
// it returns the exact same UseMarketplaceResult shape, so MarketplaceProvider can swap one for the other
// with no change to any consuming component.
//
// COMPOSITION over replacement: this hook calls useMarketplace() internally and keeps the pieces that are
// still served by the marketplace-server -- the agent RUNS stream (runListing/fetchRun/runs) and the demo
// WALLET. Those stay on the HTTP service because a SpacetimeDB reducer is sandboxed and cannot make the
// outbound Tavily/x402 calls a run requires. What this hook OVERRIDES is everything SpacetimeDB is now the
// source of truth for: the live listings, the activity feed, the connection status, and the createListing
// / acquire mutations (which become reducer calls instead of POSTs).
//
// MERGE catalog: the storefront should never look empty, even before anyone has listed anything live. So
// the curated MARKET_LISTINGS act as an always-present floor, and live SpacetimeDB rows OVERLAY them. The
// two id namespaces never collide -- curated ids are slugs ("research-agent"), live ids are numeric
// strings ("7") -- so the merge is a clean concat with a defensive de-dupe. Live rows render first.
//
// SECURITY: no secrets touch this surface. createListing/acquire send only the public listing fields and
// ids over the connection; the connection token is the only credential and it is a public client token
// (see stdbConnection.ts). Reducer failures surface to the UI as a boolean/null, never as an error string.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MARKET_LISTINGS,
  CATEGORY_GLOW,
  ICON_FALLBACK_BY_CATEGORY,
  type MarketListing,
  type MarketSeller,
} from "../data/marketplace";
import {
  useMarketplace,
  type ActivityEvent,
  type MarketStatus,
  type NewListingInput,
  type UseMarketplaceResult,
} from "./marketplaceClient";
import {
  ensureConnection,
  getConn,
  getConnState,
  subscribeConn,
  type StdbConnState,
} from "./stdbConnection";
import {
  activityToEvent,
  listingToMarket,
  parsePriceToMinor,
} from "./stdbAdapters";

// The StdbConnState and MarketStatus unions are identical ("connecting" | "live" | "offline"); this keeps
// the mapping explicit and type-checked in case either side ever diverges.
function toMarketStatus(state: StdbConnState): MarketStatus {
  return state;
}

// Cap the rendered activity feed, matching marketplaceClient's behaviour so the ticker can't grow forever.
const ACTIVITY_CAP = 40;

export function useStdbMarketplace(): UseMarketplaceResult {
  // Keep the marketplace-server hook for the run stream + wallet (the parts a sandboxed reducer can't do).
  const base = useMarketplace();

  const [stdbListings, setStdbListings] = useState<MarketListing[]>([]);
  const [stdbActivity, setStdbActivity] = useState<ActivityEvent[]>([]);
  const [connState, setConnState] = useState<StdbConnState>(() => getConnState());

  // Re-pull the whole projection from the client cache. Cheap (the cache is small) and idempotent, so it's
  // safe to call from every row callback and on the connection going live. Reads listings + agents first to
  // build the join maps the activity adapter needs (listing id -> name, agent identity -> "is an agent").
  const rebuild = useCallback(() => {
    const conn = getConn();
    if (!conn) return;

    const listingRows = Array.from(conn.db.listing.iter());
    const nameById = new Map<string, string>();
    for (const row of listingRows) nameById.set(row.id.toString(), row.name);

    const agentIds = new Set<string>();
    for (const agent of conn.db.agent.iter()) {
      agentIds.add(agent.identity.toHexString());
    }

    // Newest listings first, so a just-created live card surfaces at the top of its category.
    const mapped = listingRows
      .map(listingToMarket)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    setStdbListings(mapped);

    const events = Array.from(conn.db.activity.iter())
      .map((row) => activityToEvent(row, nameById, agentIds))
      .sort((a, b) => b.at - a.at)
      .slice(0, ACTIVITY_CAP);
    setStdbActivity(events);
  }, []);

  // Open the singleton connection and wire the live feed. rebuild is stable, so this runs once per mount;
  // the singleton guard means even StrictMode's double-mount yields exactly one connection.
  useEffect(() => {
    const conn = ensureConnection();

    // Sync whatever state already exists (e.g. a second hook mounting after the connection went live).
    setConnState(getConnState());
    rebuild();

    // Connection-state changes (open/applied/error/close) -> update status AND re-pull (onApplied is when
    // the initial subscription rows have populated the cache).
    const unsubscribe = subscribeConn(() => {
      setConnState(getConnState());
      rebuild();
    });

    // Row-level deltas on the public tables we project. Updates use a 3-arg callback; a no-arg rebuild is
    // assignable to all three, and using the SAME reference lets removeOn* detach cleanly on unmount.
    conn.db.listing.onInsert(rebuild);
    conn.db.listing.onUpdate(rebuild);
    conn.db.listing.onDelete(rebuild);
    conn.db.activity.onInsert(rebuild);
    conn.db.activity.onDelete(rebuild);
    conn.db.agent.onInsert(rebuild);
    conn.db.agent.onDelete(rebuild);

    return () => {
      unsubscribe();
      conn.db.listing.removeOnInsert(rebuild);
      conn.db.listing.removeOnUpdate(rebuild);
      conn.db.listing.removeOnDelete(rebuild);
      conn.db.activity.removeOnInsert(rebuild);
      conn.db.activity.removeOnDelete(rebuild);
      conn.db.agent.removeOnInsert(rebuild);
      conn.db.agent.removeOnDelete(rebuild);
    };
  }, [rebuild]);

  // MERGE: live rows first, then the curated floor minus any id a live row already occupies. Live ids are
  // numeric strings and curated ids are slugs, so a collision is effectively impossible -- the Set guard is
  // belt-and-suspenders, and keeps the result stable if a future seed ever reuses a numeric id.
  const listings = useMemo<MarketListing[]>(() => {
    const liveIds = new Set(stdbListings.map((l) => l.id));
    const floor = MARKET_LISTINGS.filter((l) => !liveIds.has(l.id));
    return [...stdbListings, ...floor];
  }, [stdbListings]);

  // List a capability live: a create_listing reducer call. Fire-and-forget -- the authoritative row (with
  // a server-assigned numeric id) lands via listing.onInsert -> rebuild. We return an optimistic projection
  // so the caller's confirmation toast has the right icon/name; it is NEVER inserted into the grid (rebuild
  // uses only real rows), so no duplicate or ghost card appears.
  const createListing = useCallback(
    async (input: NewListingInput): Promise<MarketListing | null> => {
      const conn = getConn();
      if (!conn || getConnState() !== "live") return null;
      const priceMinor = parsePriceToMinor(input.price);
      try {
        conn.reducers.createListing(
          input.name,
          input.blurb,
          input.category,
          priceMinor,
          input.tags ?? [],
        );
      } catch {
        return null;
      }
      const seller: MarketSeller = input.seller ?? { kind: "human", name: "You" };
      return {
        id: `pending-${input.name}`,
        name: input.name,
        blurb: input.blurb,
        category: input.category,
        icon: input.icon ?? ICON_FALLBACK_BY_CATEGORY[input.category],
        glow: input.glow ?? CATEGORY_GLOW[input.category],
        price: input.price,
        tags: input.tags ?? [],
        seller,
        acquiredCount: 0,
      };
    },
    [],
  );

  // Acquire (buy). Curated floor ids are slugs that only exist on the marketplace-server, so delegate those
  // to the base hook's HTTP acquire. Live numeric ids go to the buy_now reducer. The /^\d+$/ guard is what
  // prevents BigInt("research-agent") from throwing. The acquired listing's count bump echoes back via
  // listing.onUpdate -> rebuild on every connected client.
  const acquire = useCallback(
    async (id: string, buyer?: MarketSeller): Promise<boolean> => {
      if (!/^\d+$/.test(id)) {
        return base.acquire(id, buyer);
      }
      const conn = getConn();
      if (!conn || getConnState() !== "live") return false;
      try {
        conn.reducers.buyNow(BigInt(id));
        return true;
      } catch {
        return false;
      }
    },
    [base.acquire],
  );

  // Spread the base result, then override only what SpacetimeDB now owns. wallet/runs/runListing/fetchRun
  // pass through unchanged from the marketplace-server hook.
  return {
    ...base,
    listings,
    activity: stdbActivity,
    status: toMarketStatus(connState),
    online: connState === "live",
    createListing,
    acquire,
  };
}
