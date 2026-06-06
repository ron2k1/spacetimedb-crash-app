import { z } from "zod";

/**
 * Marketplace domain schemas.
 *
 * This is the SHARED, networked catalog -- the "eBay" surface where humans and
 * agents list/buy/sell capabilities. It is intentionally separate from the
 * local Crash event engine: nothing here touches the on-disk localhost-WS
 * runtime, and nothing here carries secrets. Every schema is field-level safe
 * to echo back to a client (zod issues included).
 */

export const MarketCategory = z.enum(["agent", "skill", "workflow", "tool"]);
export type MarketCategory = z.infer<typeof MarketCategory>;

export const MarketGlow = z.enum(["blue", "purple", "green", "red", "orange"]);
export type MarketGlow = z.infer<typeof MarketGlow>;

export const Seller = z.object({
  kind: z.enum(["human", "agent"]),
  name: z.string().min(1).max(60),
});
export type Seller = z.infer<typeof Seller>;

export const MarketListing = z.object({
  id: z.string(),
  name: z.string().min(1).max(80),
  blurb: z.string().min(1).max(240),
  category: MarketCategory,
  icon: z.string(),
  glow: MarketGlow,
  price: z.string(),
  tags: z.array(z.string()).max(6),
  seller: Seller,
  acquiredCount: z.number().int().min(0),
  createdAt: z.number(),
  /**
   * Whether this listing is the storefront's single featured spotlight. Optional
   * + server-owned: clients cannot self-feature (NewListingInput omits it), and
   * it MUST live in this schema or load() would strip it on reload (zod strips
   * unmodeled keys), silently dropping the Featured section after a restart.
   */
  featured: z.boolean().optional(),
  /**
   * For an orchestrator/workflow listing sold by an AGENT: the id of the sub-listing it
   * autonomously purchases and runs on the buyer's behalf. Drives the agent->agent commerce
   * demo (section 6). Server-owned + optional, so it survives reload like `featured`.
   */
  subListingId: z.string().optional(),
});
export type MarketListing = z.infer<typeof MarketListing>;

/**
 * POST body for creating a listing. The client never supplies server-owned
 * fields (id / createdAt / acquiredCount) -- the store assigns those. Optional
 * presentation fields default at the store layer (icon, glow-by-category,
 * seller). Required: name, blurb, category, price.
 */
export const NewListingInput = z.object({
  name: z.string().min(1).max(80),
  blurb: z.string().min(1).max(240),
  category: MarketCategory,
  price: z.string().min(1).max(60),
  icon: z.string().optional(),
  glow: MarketGlow.optional(),
  tags: z.array(z.string()).max(6).optional(),
  seller: Seller.optional(),
});
export type NewListingInput = z.infer<typeof NewListingInput>;

export const ActivityEvent = z.object({
  id: z.string(),
  kind: z.enum(["listed", "acquired"]),
  listingId: z.string(),
  listingName: z.string(),
  actor: Seller,
  at: z.number(),
});
export type ActivityEvent = z.infer<typeof ActivityEvent>;

export const Sale = z.object({
  id: z.string(),
  listingId: z.string(),
  buyer: Seller,
  at: z.number(),
});
export type Sale = z.infer<typeof Sale>;

/** Body for POST /api/listings/:id/acquire -- buyer is optional. */
export const AcquireInput = z.object({
  buyer: Seller.optional(),
});
export type AcquireInput = z.infer<typeof AcquireInput>;

// --- Wallet ---------------------------------------------------------------
//
// The agent runtime's spend wallet. Balances + amounts are in USDC MINOR units (6 decimals),
// the same unit the x402 rail uses, so no float math crosses module boundaries. Every field is
// safe to echo to a client: it is demo budget state, never a key or address secret.

/** A per-agent spend cap snapshot (USDC minor units). Mirrors the x402 CapLedger.snapshot shape. */
export const WalletCap = z.object({
  agentId: z.string(),
  capMinor: z.number().int().min(0),
  spentMinor: z.number().int().min(0),
});
export type WalletCap = z.infer<typeof WalletCap>;

/** One wallet ledger line: a spend (to a counterparty) or an earn (credited to a seller). */
export const LedgerEntry = z.object({
  id: z.string(),
  kind: z.enum(["spend", "earn"]),
  counterparty: z.string(),
  amountMinor: z.number().int().min(0),
  runId: z.string().optional(),
  at: z.number(),
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

/** Full wallet snapshot streamed on `wallet.status` and embedded in the WS hello frame. */
export const Wallet = z.object({
  balanceMinor: z.number().int(),
  currency: z.literal("USDC"),
  caps: z.array(WalletCap),
  ledger: z.array(LedgerEntry),
});
export type Wallet = z.infer<typeof Wallet>;

// --- Runs -----------------------------------------------------------------
//
// A Run is one end-to-end agent execution against a listing. The record is persisted so
// GET /api/runs/:id can serve a polling fallback for any client that missed the WS stream.

export const RunStepKind = z.enum([
  "plan",
  "payment",
  "search",
  "synthesize",
  "agent_purchase",
]);
export type RunStepKind = z.infer<typeof RunStepKind>;

export const RunStatus = z.enum(["running", "done", "error"]);
export type RunStatus = z.infer<typeof RunStatus>;

/** A single recorded step of a run (the persisted echo of the streamed `run.step` frames). */
export const RunStep = z.object({
  kind: RunStepKind,
  // Free-form fields per kind; all optional + field-level safe (no secrets ever land here).
  text: z.string().optional(),
  phase: z.string().optional(),
  amount: z.string().optional(),
  asset: z.string().optional(),
  network: z.string().optional(),
  payTo: z.string().optional(),
  txRef: z.string().optional(),
  at: z.number(),
});
export type RunStep = z.infer<typeof RunStep>;

export const Citation = z.object({
  source: z.string(),
  snippet: z.string(),
});
export type Citation = z.infer<typeof Citation>;

/** Persisted record of one agent run. */
export const Run = z.object({
  id: z.string(),
  listingId: z.string(),
  listingName: z.string(),
  input: z.string(),
  buyer: Seller,
  status: RunStatus,
  steps: z.array(RunStep),
  result: z.string().optional(),
  citations: z.array(Citation).optional(),
  costMinor: z.number().int().min(0),
  sellerEarnedMinor: z.number().int().min(0),
  errorCode: z.string().optional(),
  startedAt: z.number(),
  finishedAt: z.number().optional(),
});
export type Run = z.infer<typeof Run>;

/** POST /api/run body: which listing to run, the user goal, and an optional buyer identity. */
export const RunInput = z.object({
  listingId: z.string().min(1),
  input: z.string().min(1).max(2000),
  buyer: Seller.optional(),
});
export type RunInput = z.infer<typeof RunInput>;

/** Default glow per category when a listing does not specify one. */
export const DEFAULT_GLOW: Record<MarketCategory, MarketGlow> = {
  agent: "purple",
  skill: "blue",
  workflow: "orange",
  tool: "green",
};

/** Default seller for client-created listings / acquisitions. */
export const DEFAULT_SELLER: Seller = { kind: "human", name: "You" };

/** Default icon when a listing omits one. */
export const DEFAULT_ICON = "✨"; // sparkles
