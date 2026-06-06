// marketplace-server/src/runtime/run.ts
//
// The agent-execution pipeline -- what turns the marketplace-server from a catalog into an actual
// agent RUNTIME. Given a listing + a user goal it: plans a search, pays Tavily per call over x402,
// streams every step, synthesizes a cited answer, ticks the wallet, and credits the seller.
//
// For an orchestrator (a 'workflow' listing sold by an AGENT with a `subListingId`) it FIRST
// performs an autonomous agent->agent purchase of the sub-listing -- no human in the loop -- then
// runs the sub-listing's normal pipeline. That agent->agent leg is the demo headline.
//
// All side effects flow through injected seams (emit, inferImpl, paidFetch) so the whole pipeline
// runs offline + deterministic under test. SECURITY: never log secrets/keys/err.message/bodies.

import { nanoid } from "nanoid";

import type { RunStore } from "../runStore.js";
import type { WalletStore } from "../walletStore.js";
import { infer as defaultInfer } from "./inference.js";
import { makePaidFetch, type PaidFetchResult } from "./buyer.js";
import { runPaidSearch } from "./paidSearch.js";
import { priceToMinor } from "./pricing.js";
import type { SearchHit, ToolEvent } from "./search.js";
import { formatUsdc, type PaymentEvent } from "./x402.js";
import {
  citationsFromHits,
  MARKET_NETWORK,
  RESEARCH_AGENT_ID,
  RESEARCH_CANNED_HITS,
  RESEARCH_COST_MINOR,
  TAVILY_BASE_URL,
  TAVILY_X402_URL,
} from "./tavily.js";
import type { MarketListing, RunStep, Seller } from "../types.js";

/** A single broadcastable frame the pipeline emits. The WS layer fans these out keyed by runId. */
export type RunFrame =
  | { type: "run.started"; runId: string; listingId: string; listingName: string }
  | ({ type: "run.step"; runId: string } & RunStep)
  | {
      type: "run.done";
      runId: string;
      result: string;
      citations: { source: string; snippet: string }[];
      costMinor: number;
      sellerEarnedMinor: number;
    }
  | { type: "run.error"; runId: string; code: string };

export interface RunDeps {
  store: import("../store.js").MarketStore;
  runs: RunStore;
  wallet: WalletStore;
  /** Broadcast one frame to subscribers. */
  emit: (frame: RunFrame) => void;
  /** Test seam: inference. Defaults to the real provider-selecting `infer`. */
  inferImpl?: typeof defaultInfer;
  /** Test seam: the paid fetch. Defaults to the real @x402-wrapped fetch reading CRASH_X402_WALLET. */
  paidFetch?: (url: string, init?: RequestInit) => Promise<PaidFetchResult>;
}

export interface StartRunArgs {
  listing: MarketListing;
  input: string;
  buyer: Seller;
}

/** A started run: the synchronously-minted id (for an immediate 202) + the async pipeline promise. */
export interface StartedRun {
  runId: string;
  /** Resolves when the pipeline finishes (always resolves -- failures are recorded, not thrown). */
  done: Promise<void>;
}

/** Read the x402 wallet private key fresh from env at CALL time -- never stored, never logged. */
function walletKey(): string | undefined {
  return process.env.CRASH_X402_WALLET;
}

/**
 * Start one run. The Run record is created SYNCHRONOUSLY so the runId is available immediately
 * (the HTTP layer returns it in a 202 without waiting for the pipeline). The pipeline itself runs
 * async on `.done`, broadcasting frames keyed by runId. `.done` always resolves; on an internal
 * fault it records an 'error' run + emits run.error rather than rejecting.
 */
export function startRun(deps: RunDeps, args: StartRunArgs): StartedRun {
  const { runs } = deps;
  const { listing, input, buyer } = args;
  const run = runs.create({ listingId: listing.id, listingName: listing.name, input, buyer });
  const done = runPipeline(deps, args, run.id);
  return { runId: run.id, done };
}

/**
 * Execute one run end-to-end and resolve to its id. Convenience wrapper over startRun for callers
 * (and tests) that want to await the whole pipeline. Always resolves.
 */
export async function executeRun(deps: RunDeps, args: StartRunArgs): Promise<string> {
  const { runId, done } = startRun(deps, args);
  await done;
  return runId;
}

/** The async body of a run, operating on an already-created Run record (id minted by startRun). */
async function runPipeline(deps: RunDeps, args: StartRunArgs, runId: string): Promise<void> {
  const { store, runs, wallet, emit } = deps;
  const infer = deps.inferImpl ?? defaultInfer;
  const paidFetch =
    deps.paidFetch ?? makePaidFetch({ walletKeyProvider: () => walletKey() });

  const { listing, input, buyer } = args;

  // Helper: persist a step AND broadcast it as a run.step frame in one move.
  const step = (s: Omit<RunStep, "at">): void => {
    const recorded: RunStep = { ...s, at: Date.now() };
    runs.appendStep(runId, recorded);
    emit({ type: "run.step", runId, ...recorded });
  };

  try {
    emit({ type: "run.started", runId, listingId: listing.id, listingName: listing.name });

    let costMinor = 0;
    let sellerEarnedMinor = 0;

    // --- Agent->agent autonomous purchase (orchestrator listings only) ------------------------
    // A 'workflow' listing sold by an AGENT that links a sub-listing buys that sub-listing with NO
    // human first. The sub-listing's seller is credited and an `acquired` activity event is recorded
    // whose ACTOR is the buying agent -> the feed literally shows agent->agent commerce.
    let pipelineListing = listing;
    if (listing.category === "workflow" && listing.seller.kind === "agent" && listing.subListingId) {
      const sub = store.get(listing.subListingId);
      if (sub) {
        const a2aSpend = await autonomousPurchase({
          buyingAgent: listing.seller,
          sub,
          wallet,
          store,
          runId,
          step,
        });
        costMinor += a2aSpend.costMinor;
        sellerEarnedMinor += a2aSpend.sellerEarnedMinor;
        // From here the orchestrator runs the SUB-listing's normal pipeline on the buyer's behalf.
        pipelineListing = sub;
      }
    }

    // --- 1. PLAN -----------------------------------------------------------------------------
    const planSystem = "You plan a single web search for the user goal. Reply with ONLY the search query.";
    const rawQuery = await infer({ system: planSystem, user: input });
    const query = firstLine(rawQuery) || input;
    step({ kind: "plan", text: query });

    // --- 2. PAY + SEARCH (real x402 settle when CRASH_X402_WALLET is set) ---------------------
    const searchPrice = priceToMinor(pipelineListing.price);
    const hits = await payAndSearch({ query, paidFetch, wallet, step });

    // Charge the buyer for the run + credit the seller (the displayed listing price).
    wallet.chargeBuyer(searchPrice, pipelineListing.name, runId);
    wallet.creditSeller(pipelineListing.seller, searchPrice, runId);
    costMinor += searchPrice;
    sellerEarnedMinor += searchPrice;

    // --- 3. SYNTHESIZE -----------------------------------------------------------------------
    const sources = renderSources(hits);
    const synthSystem = "Answer the user using ONLY the provided sources. Cite source titles inline.";
    const answer = await infer({ system: synthSystem, user: `${input}\n\nSources:\n${sources}` });
    step({ kind: "synthesize", text: undefined });

    // --- 4. DONE -----------------------------------------------------------------------------
    const citations = citationsFromHits(hits);
    runs.finish(runId, { result: answer, citations, costMinor, sellerEarnedMinor });
    emit({ type: "run.done", runId, result: answer, citations, costMinor, sellerEarnedMinor });

    // Record the human's acquisition of the listing they ran (actor = buyer).
    store.acquire(listing.id, buyer);
  } catch {
    // Synthetic code only -- never surface err.message. The pipeline degrades rather than crashes,
    // so reaching here means an unexpected internal fault; record it and tell subscribers.
    runs.fail(runId, "run_internal_error");
    emit({ type: "run.error", runId, code: "run_internal_error" });
  }
}

/**
 * The pay+search leg. Maps the rail's ToolEvent/PaymentEvent emissions onto persisted+broadcast
 * run.step frames (kind 'payment' / 'search'). Returns the hits (canned fallback when the wallet
 * is unfunded or the network is unreachable, so a run NEVER hard-fails here).
 */
async function payAndSearch(args: {
  query: string;
  paidFetch: (url: string, init?: RequestInit) => Promise<PaidFetchResult>;
  wallet: WalletStore;
  step: (s: Omit<RunStep, "at">) => void;
}): Promise<SearchHit[]> {
  const { query, paidFetch, wallet, step } = args;
  const r = await runPaidSearch({
    agentId: RESEARCH_AGENT_ID,
    query,
    endpoint: TAVILY_X402_URL,
    paidFetch,
    ledger: {
      canSpend: (m: number) => wallet.caps.canSpend(RESEARCH_AGENT_ID, m),
      record: (m: number) => wallet.caps.record(RESEARCH_AGENT_ID, m),
    },
    amountMinor: RESEARCH_COST_MINOR,
    network: MARKET_NETWORK,
    tavilyKey: process.env.CRASH_TAVILY_API_KEY ?? undefined,
    keyAuthBaseUrl: TAVILY_BASE_URL, // real key-auth search when the x402 leg can't settle (no wallet)
    emit: (e: ToolEvent | PaymentEvent) => {
      if ("tool" in e) {
        step({ kind: "search", phase: e.phase });
      } else {
        step({
          kind: "payment",
          phase: e.phase,
          amount: e.amount,
          asset: e.asset,
          network: e.network,
          payTo: e.payTo,
          txRef: e.txRef,
        });
      }
    },
    canned: RESEARCH_CANNED_HITS,
  });
  return r.results;
}

/**
 * Autonomously buy a sub-listing on behalf of the buyer, with NO human. We emit the x402 message
 * BEATS (required -> signing -> settled) for the agent->agent leg, charge the wallet, credit the
 * sub-listing's seller, and record an `acquired` activity event whose ACTOR is the buying agent.
 *
 * The agent->agent leg is a faithful SIMULATION of the beats (we run no paywall seller of our own),
 * so the message shapes are real and the network is labeled Base Sepolia, but no chain settle
 * happens here -- the txRef is a synthetic local reference, never a fabricated onchain hash.
 */
async function autonomousPurchase(args: {
  buyingAgent: Seller;
  sub: MarketListing;
  wallet: WalletStore;
  store: import("../store.js").MarketStore;
  runId: string;
  step: (s: Omit<RunStep, "at">) => void;
}): Promise<{ costMinor: number; sellerEarnedMinor: number }> {
  const { buyingAgent, sub, wallet, store, runId, step } = args;
  const amountMinor = priceToMinor(sub.price);
  const amount = formatUsdc(amountMinor);
  const payTo = sub.seller.name;
  const base = { kind: "agent_purchase" as const, amount, asset: "USDC", network: MARKET_NETWORK, payTo };

  step({ ...base, phase: "required" });
  step({ ...base, phase: "signing" });
  // Synthetic local reference for the simulated leg -- NOT an onchain tx hash (we never fabricate one).
  const txRef = `sim:${nanoid(12)}`;
  step({ ...base, phase: "settled", txRef });

  // Move the money + record the agent->agent acquisition in the activity feed.
  wallet.chargeBuyer(amountMinor, `${buyingAgent.name} -> ${sub.name}`, runId);
  wallet.creditSeller(sub.seller, amountMinor, runId);
  store.acquire(sub.id, buyingAgent); // actor = the BUYING AGENT -> feed shows agent->agent commerce

  return { costMinor: amountMinor, sellerEarnedMinor: amountMinor };
}

/** First non-empty line of a model reply (the planner is asked for ONLY the query). */
function firstLine(text: string): string {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t) return t.slice(0, 240);
  }
  return "";
}

/** Render hits into a compact numbered sources block for the synthesize prompt. */
function renderSources(hits: SearchHit[]): string {
  if (hits.length === 0) return "(no sources found)";
  return hits
    .slice(0, 5)
    .map((h, i) => `${i + 1}. ${h.title} (${h.url})\n${h.content.slice(0, 400)}`)
    .join("\n\n");
}
