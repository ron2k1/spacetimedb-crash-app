// useStdbAuctions.ts -- the live auction-house hook. Reads the auction/bid/listing/agent rows from the
// SAME singleton SpacetimeDB connection the marketplace hook uses (ensureConnection is idempotent), and
// projects them into the AuctionView/BidView shapes the panel renders.
//
// WHY a SEPARATE hook (not fields on UseMarketplaceResult): the marketplace contract is consumed by a
// dozen components; widening it with auction data would recompile all of them against fields they never
// read. This hook keeps the auction concern self-contained -- the marketplace contract stays frozen.
//
// THE CLEVER-STDB CENTREPIECE this drives: the auction clock runs INSIDE the database. A scheduled
// reducer settles each lot at endsAt with no client or worker call -- so when the countdown here hits
// zero, the status flips to "settled" because the SERVER closed it, and that flip arrives as an
// auction.onUpdate on every connected client at once. Humans (this browser) and headless agents bid into
// the same lot as the same kind of Identity-backed client; placeBid is the only write.
//
// SECURITY: no secrets here. placeBid sends only the auction id + an amount; the connection token is the
// sole credential and is a public client token (see stdbConnection.ts). A rejected bid (someone bid
// first, or the lot just closed) is fire-and-forget -- the next onUpdate corrects the view; no error
// string is surfaced.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ensureConnection,
  getConn,
  getConnState,
  getIdentity,
  subscribeConn,
  type StdbConnState,
} from "./stdbConnection";
import { auctionToView, formatPriceMinor, tsToMs } from "./stdbAdapters";
import type { AuctionView, BidView } from "../data/auction";

// How long a settled lot lingers in the panel after it closes, so the "SOLD to BotAlice" beat is visible
// before the card drops off. The countdown tick re-renders the panel, so expiry is automatic.
const SETTLED_LINGER_MS = 90_000;
// Recent bids kept per auction for the live feed (newest first).
const BIDS_PER_AUCTION = 5;

export interface StdbAuctionsResult {
  status: StdbConnState;
  online: boolean;
  /** Open auctions first (soonest-ending first), then lots settled within the last SETTLED_LINGER_MS. */
  auctions: AuctionView[];
  /** Recent bids keyed by auction id (newest first), bidder names already resolved. */
  bidsByAuction: Map<string, BidView[]>;
  /** Place a bid of exactly amountMinor micro-USDC on an auction. Fire-and-forget; returns false if not
   *  connected or the call throws. The authoritative result echoes back via auction.onUpdate. */
  placeBid: (auctionId: string, amountMinor: bigint) => boolean;
}

export function useStdbAuctions(): StdbAuctionsResult {
  const [connState, setConnState] = useState<StdbConnState>(() => getConnState());
  const [auctions, setAuctions] = useState<AuctionView[]>([]);
  const [bidsByAuction, setBidsByAuction] = useState<Map<string, BidView[]>>(
    () => new Map(),
  );

  // Re-pull the auction projection from the client cache. Cheap and idempotent, so it is safe to fire on
  // every row delta. Builds the two join maps the adapters need: listingId -> name (for the lot title)
  // and agent-identity -> name (to label bidders human/agent in the feed).
  const rebuild = useCallback(() => {
    const conn = getConn();
    if (!conn) return;

    const nameById = new Map<string, string>();
    for (const listing of conn.db.listing.iter()) {
      nameById.set(listing.id.toString(), listing.name);
    }

    const agentNameByHex = new Map<string, string>();
    for (const agent of conn.db.agent.iter()) {
      agentNameByHex.set(agent.identity.toHexString(), agent.name);
    }

    const me = getIdentity();
    const myHex = me?.toHexString() ?? null;
    const now = tsToMs({ microsSinceUnixEpoch: BigInt(Date.now()) * 1000n });

    // Project + filter: keep open lots and recently-settled lots (so the resolution beat is visible).
    const views = Array.from(conn.db.auction.iter())
      .map((row) => auctionToView(row, nameById, me))
      .filter(
        (v) =>
          v.status === "open" ||
          (v.status === "settled" && now - v.endsAtMs < SETTLED_LINGER_MS),
      )
      .sort((a, b) => {
        // Open lots before settled; within a group, soonest-ending first.
        const aOpen = a.status === "open" ? 0 : 1;
        const bOpen = b.status === "open" ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        return a.endsAtMs - b.endsAtMs;
      });
    setAuctions(views);

    // Resolve each bidder Identity to a friendly name: "You" for self, the registered agent name for a
    // bot, else a short identity tag. Group newest-first and cap per auction.
    const resolveBidder = (bidderHex: string): string => {
      if (myHex && bidderHex === myHex) return "You";
      const agentName = agentNameByHex.get(bidderHex);
      if (agentName) return agentName;
      return `#${bidderHex.slice(0, 4)}`;
    };

    const grouped = new Map<string, BidView[]>();
    const sortedBids = Array.from(conn.db.bid.iter()).sort(
      (a, b) => tsToMs(b.at) - tsToMs(a.at),
    );
    for (const bid of sortedBids) {
      const auctionId = bid.auctionId.toString();
      const list = grouped.get(auctionId) ?? [];
      if (list.length >= BIDS_PER_AUCTION) continue;
      list.push({
        id: bid.id.toString(),
        auctionId,
        bidderName: resolveBidder(bid.bidder.toHexString()),
        amountMinor: bid.amountMinor,
        amountLabel: formatPriceMinor(bid.amountMinor),
        atMs: tsToMs(bid.at),
      });
      grouped.set(auctionId, list);
    }
    setBidsByAuction(grouped);
  }, []);

  // Attach to the singleton connection + wire the live feed for the auction-relevant tables. rebuild is
  // stable, so this runs once per mount; the singleton guard means StrictMode's double-mount is one conn.
  useEffect(() => {
    ensureConnection();
    setConnState(getConnState());
    rebuild();

    const unsubscribe = subscribeConn(() => {
      setConnState(getConnState());
      rebuild();
    });

    const conn = getConn();
    if (conn) {
      // auction.onUpdate is the heartbeat: every bid bumps highBid and every server settlement flips
      // status -- both arrive here. bid.onInsert drives the live feed; listing/agent feed the join maps.
      conn.db.auction.onInsert(rebuild);
      conn.db.auction.onUpdate(rebuild);
      conn.db.auction.onDelete(rebuild);
      conn.db.bid.onInsert(rebuild);
      conn.db.listing.onInsert(rebuild);
      conn.db.agent.onInsert(rebuild);
    }

    return () => {
      unsubscribe();
      const c = getConn();
      if (c) {
        c.db.auction.removeOnInsert(rebuild);
        c.db.auction.removeOnUpdate(rebuild);
        c.db.auction.removeOnDelete(rebuild);
        c.db.bid.removeOnInsert(rebuild);
        c.db.listing.removeOnInsert(rebuild);
        c.db.agent.removeOnInsert(rebuild);
      }
    };
  }, [rebuild]);

  const placeBid = useCallback(
    (auctionId: string, amountMinor: bigint): boolean => {
      const conn = getConn();
      if (!conn || getConnState() !== "live") return false;
      if (!/^\d+$/.test(auctionId)) return false;
      try {
        conn.reducers.placeBid(BigInt(auctionId), amountMinor);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const online = connState === "live";
  // Memoize the public result so the panel only re-renders when something it reads actually changed.
  return useMemo<StdbAuctionsResult>(
    () => ({ status: connState, online, auctions, bidsByAuction, placeBid }),
    [connState, online, auctions, bidsByAuction, placeBid],
  );
}
