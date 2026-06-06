// auction.ts -- renderer view types for the live SpacetimeDB auction house. The wire truth lives in
// the generated `Auction`/`Bid` rows (bigint money, Identity bidder, Timestamp clock); these are the
// UI-friendly projections the AuctionPanel renders. Kept in /data next to marketplace.ts because,
// like MarketListing, they are pure shape with no connection logic.
//
// The auction is the clever-STDB centerpiece: the clock runs INSIDE the database (a scheduled reducer
// settles the lot at endsAt with no client or worker involved), and humans + headless agents bid into
// the same lot as the same kind of Identity-backed client. These types are what the countdown + bid
// button read.

export type AuctionStatus = string; // "open" while bidding, "settled" once the scheduled reducer closes it

export interface AuctionView {
  id: string;
  listingId: string;
  listingName: string;
  /** "open" while bidding; "settled" once the scheduled reducer has closed it server-side. */
  status: AuctionStatus;
  /** Current high bid in micro-USDC (bigint for exact comparison against the next-bid floor). */
  highBidMinor: bigint;
  /** Display string for the current high bid, e.g. "1.50 USDC". */
  highBidLabel: string;
  minIncrementMinor: bigint;
  /** The minimum a next bid must reach (highBid + increment), in micro-USDC. */
  nextBidMinor: bigint;
  nextBidLabel: string;
  /** Epoch ms the auction self-settles (drives the live countdown). */
  endsAtMs: number;
  /** Whether anyone has bid yet (false = only the opening price stands). */
  hasBidder: boolean;
  /** True when the viewing Identity currently holds the high bid ("you're winning"). */
  isHighBidder: boolean;
}

export interface BidView {
  id: string;
  auctionId: string;
  bidderName: string;
  amountMinor: bigint;
  amountLabel: string;
  atMs: number;
}
