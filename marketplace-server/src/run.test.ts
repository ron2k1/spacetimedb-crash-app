import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { MarketStore } from "./store.js";
import { RunStore } from "./runStore.js";
import { WalletStore, SEED_BALANCE_MINOR } from "./walletStore.js";
import { executeRun, type RunFrame } from "./runtime/run.js";
import type { PaidFetchResult } from "./runtime/buyer.js";
import { infer, describeInference } from "./runtime/inference.js";
import { priceToMinor } from "./runtime/pricing.js";
import { runPaidSearch } from "./runtime/paidSearch.js";
import { describeSearch } from "./runtime/tavily.js";

// --- Fakes ---------------------------------------------------------------
//
// All seams injected so the pipeline runs offline + deterministic: a fake inference impl (no
// network), and a fake paidFetch that returns a settled Tavily-shaped response without any chain.

/** A deterministic inference stub: plan -> a fixed query; synthesize -> a fixed cited answer. */
const fakeInfer: typeof infer = async ({ system }) => {
  if (system.startsWith("You plan")) return "fake search query";
  return "Synthesized answer citing Result One.";
};

/** A fake paidFetch that always settles with one Tavily-shaped hit + an x-payment-response txRef. */
const fakePaidFetch = async (): Promise<PaidFetchResult> => ({
  ok: true,
  status: 200,
  headers: { get: (k: string) => (k === "x-payment-response" ? "0xFAKETX" : null) },
  json: async () => ({
    results: [{ title: "Result One", url: "https://example.com/1", content: "Body of result one." }],
  }),
  txRef: "0xFAKETX",
});

// --- Harness -------------------------------------------------------------

let dir: string;
let store: MarketStore;
let runs: RunStore;
let wallet: WalletStore;
let frames: RunFrame[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "crash-run-"));
  store = new MarketStore({ dataFile: join(dir, "listings.json") });
  runs = new RunStore({ runsFile: join(dir, "runs.json") });
  wallet = new WalletStore({ walletFile: join(dir, "wallet.json") });
  frames = [];
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function deps() {
  return {
    store,
    runs,
    wallet,
    emit: (f: RunFrame) => frames.push(f),
    inferImpl: fakeInfer,
    paidFetch: fakePaidFetch,
  };
}

/** The kinds, in order, of every run.step frame emitted. */
function stepKinds(): string[] {
  return frames
    .filter((f): f is Extract<RunFrame, { type: "run.step" }> => f.type === "run.step")
    .map((f) => f.kind);
}

// --- Tests ---------------------------------------------------------------

test("a normal run emits started -> plan -> payment -> search -> synthesize -> done", async () => {
  const listing = store.get("research-agent");
  assert.ok(listing);

  const runId = await executeRun(deps(), {
    listing,
    input: "What is x402?",
    buyer: { kind: "human", name: "Tester" },
  });

  // First frame is run.started for this listing.
  const started = frames[0];
  assert.equal(started.type, "run.started");
  assert.equal((started as Extract<RunFrame, { type: "run.started" }>).listingId, "research-agent");

  // Step order: plan, then the payment/search interleaving from the rail, then synthesize.
  const kinds = stepKinds();
  assert.equal(kinds[0], "plan");
  assert.ok(kinds.includes("payment"), "emitted a payment step");
  assert.ok(kinds.includes("search"), "emitted a search step");
  assert.equal(kinds[kinds.length - 1], "synthesize");

  // The plan step text is the fake planner's query.
  const planStep = frames.find(
    (f): f is Extract<RunFrame, { type: "run.step" }> => f.type === "run.step" && f.kind === "plan",
  );
  assert.equal(planStep?.text, "fake search query");

  // A payment step carries the x402 message shape (amount/asset/network), and a settled txRef.
  const settled = frames.find(
    (f): f is Extract<RunFrame, { type: "run.step" }> =>
      f.type === "run.step" && f.kind === "payment" && f.phase === "settled",
  );
  assert.ok(settled, "emitted a settled payment step");
  assert.equal(settled.asset, "USDC");
  assert.equal(settled.network, "eip155:84532");
  assert.equal(settled.txRef, "0xFAKETX");

  // Final frame is run.done with the synthesized result + citations + costs.
  const done = frames[frames.length - 1];
  assert.equal(done.type, "run.done");
  const d = done as Extract<RunFrame, { type: "run.done" }>;
  assert.equal(d.runId, runId);
  assert.match(d.result, /Synthesized answer/);
  assert.ok(d.citations.length >= 1, "carried at least one citation");
  assert.ok(d.costMinor > 0, "charged a non-zero cost");
  assert.equal(d.sellerEarnedMinor, d.costMinor);
});

test("a normal run ticks the wallet down and records spend + earn ledger entries", async () => {
  const listing = store.get("research-agent");
  assert.ok(listing);

  await executeRun(deps(), {
    listing,
    input: "What is x402?",
    buyer: { kind: "human", name: "Tester" },
  });

  const snap = wallet.snapshot();
  // research-agent price "~0.05 USDC / run" -> 50000 minor; balance dropped by exactly that.
  assert.equal(snap.balanceMinor, SEED_BALANCE_MINOR - 50000);
  assert.ok(snap.ledger.some((e) => e.kind === "spend"), "recorded a spend entry");
  assert.ok(snap.ledger.some((e) => e.kind === "earn"), "recorded an earn entry");
  // The seller (Crash Labs) was credited.
  assert.equal(wallet.earningsFor("Crash Labs"), 50000);
});

test("the agent-to-agent run emits an agent_purchase step and records an agent-actor activity", async () => {
  const scout = store.get("market-scout");
  assert.ok(scout);
  assert.equal(scout.seller.kind, "agent");
  assert.equal(scout.subListingId, "research-agent");

  await executeRun(deps(), {
    listing: scout,
    input: "Scout the market for x402 adoption.",
    buyer: { kind: "human", name: "Tester" },
  });

  // An agent_purchase step ran, with the full required -> signing -> settled beat sequence.
  const a2aPhases = frames
    .filter(
      (f): f is Extract<RunFrame, { type: "run.step" }> =>
        f.type === "run.step" && f.kind === "agent_purchase",
    )
    .map((f) => f.phase);
  assert.deepEqual(a2aPhases, ["required", "signing", "settled"]);

  // The agent_purchase is labeled on Base Sepolia and pays the sub-listing's seller.
  const a2aSettled = frames.find(
    (f): f is Extract<RunFrame, { type: "run.step" }> =>
      f.type === "run.step" && f.kind === "agent_purchase" && f.phase === "settled",
  );
  assert.equal(a2aSettled?.network, "eip155:84532");
  assert.equal(a2aSettled?.payTo, "Crash Labs"); // research-agent's seller
  assert.ok(a2aSettled?.txRef?.startsWith("sim:"), "agent->agent leg uses a synthetic local ref");

  // The activity feed shows an acquisition of the SUB-listing whose ACTOR is the buying agent.
  const feed = store.activity(20);
  const agentAcq = feed.find(
    (e) =>
      e.kind === "acquired" &&
      e.listingId === "research-agent" &&
      e.actor.kind === "agent" &&
      e.actor.name === "Market Scout",
  );
  assert.ok(agentAcq, "feed contains an agent->agent acquisition (actor = Market Scout)");
});

test("the a2a run charges for BOTH legs (agent purchase + the research run)", async () => {
  const scout = store.get("market-scout");
  assert.ok(scout);

  await executeRun(deps(), {
    listing: scout,
    input: "Scout x402.",
    buyer: { kind: "human", name: "Tester" },
  });

  // Leg 1: agent buys research-agent (50000). Leg 2: the research pipeline charges research-agent's
  // price too (50000). Both credit Crash Labs -> 100000 total earned, balance down 100000.
  const snap = wallet.snapshot();
  assert.equal(snap.balanceMinor, SEED_BALANCE_MINOR - 100000);
  assert.equal(wallet.earningsFor("Crash Labs"), 100000);
});

test("inference falls back to the offline stub when no provider env is set", async () => {
  // Ensure no provider env leaks in from the host.
  const saved = {
    az: process.env.CRASH_AZURE_OPENAI_ENDPOINT,
    azk: process.env.CRASH_AZURE_OPENAI_KEY,
    azd: process.env.CRASH_AZURE_OPENAI_DEPLOYMENT,
    gh: process.env.CRASH_GITHUB_MODELS_TOKEN,
    gmi: process.env.CRASH_GMI_API_KEY,
  };
  delete process.env.CRASH_AZURE_OPENAI_ENDPOINT;
  delete process.env.CRASH_AZURE_OPENAI_KEY;
  delete process.env.CRASH_AZURE_OPENAI_DEPLOYMENT;
  delete process.env.CRASH_GITHUB_MODELS_TOKEN;
  delete process.env.CRASH_GMI_API_KEY;
  try {
    assert.equal(describeInference(), "offline");
    // A fetch that would THROW if ever called -> proves the offline path never hits the network.
    const explodingFetch = (async () => {
      throw new Error("network should not be touched in offline mode");
    }) as unknown as typeof fetch;
    const out = await infer({
      system: "Answer the user.",
      user: "goal\n\nSources:\n1. Some Source",
      fetchImpl: explodingFetch,
    });
    assert.match(out, /offline synthesis/);
    assert.match(out, /Some Source/);
  } finally {
    if (saved.az !== undefined) process.env.CRASH_AZURE_OPENAI_ENDPOINT = saved.az;
    if (saved.azk !== undefined) process.env.CRASH_AZURE_OPENAI_KEY = saved.azk;
    if (saved.azd !== undefined) process.env.CRASH_AZURE_OPENAI_DEPLOYMENT = saved.azd;
    if (saved.gh !== undefined) process.env.CRASH_GITHUB_MODELS_TOKEN = saved.gh;
    if (saved.gmi !== undefined) process.env.CRASH_GMI_API_KEY = saved.gmi;
  }
});

test("inference selects + uses GitHub Models when its token is set (above GMI)", async () => {
  const saved = {
    az: process.env.CRASH_AZURE_OPENAI_ENDPOINT,
    gh: process.env.CRASH_GITHUB_MODELS_TOKEN,
    gmi: process.env.CRASH_GMI_API_KEY,
  };
  // Azure unset, GitHub Models token set, GMI also set -> GitHub Models must win the precedence.
  delete process.env.CRASH_AZURE_OPENAI_ENDPOINT;
  process.env.CRASH_GITHUB_MODELS_TOKEN = "test-token-not-a-real-secret";
  process.env.CRASH_GMI_API_KEY = "test-gmi-not-a-real-secret";
  try {
    assert.equal(describeInference(), "github-models");
    // Capture the URL the call targets to PROVE the GitHub Models endpoint served it, not GMI.
    let calledUrl = "";
    const okFetch = (async (url: string) => {
      calledUrl = url;
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "github models answer" } }] }),
      } as unknown as Response;
    }) as unknown as typeof fetch;
    const out = await infer({ system: "Answer.", user: "goal", fetchImpl: okFetch });
    assert.equal(out, "github models answer");
    assert.match(calledUrl, /models\.github\.ai/);
  } finally {
    if (saved.az !== undefined) process.env.CRASH_AZURE_OPENAI_ENDPOINT = saved.az;
    if (saved.gh === undefined) delete process.env.CRASH_GITHUB_MODELS_TOKEN;
    else process.env.CRASH_GITHUB_MODELS_TOKEN = saved.gh;
    if (saved.gmi === undefined) delete process.env.CRASH_GMI_API_KEY;
    else process.env.CRASH_GMI_API_KEY = saved.gmi;
  }
});

test("inference degrades to offline when a configured provider errors", async () => {
  const savedGmi = process.env.CRASH_GMI_API_KEY;
  process.env.CRASH_GMI_API_KEY = "test-key-not-a-real-secret";
  try {
    // GMI is "configured" but the fetch returns a 500 -> infer must swallow and fall to the stub.
    const failingFetch = (async () =>
      ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response) as typeof fetch;
    const out = await infer({
      system: "Answer the user.",
      user: "goal\n\nSources:\n1. X",
      fetchImpl: failingFetch,
    });
    assert.match(out, /offline synthesis/);
  } finally {
    if (savedGmi === undefined) delete process.env.CRASH_GMI_API_KEY;
    else process.env.CRASH_GMI_API_KEY = savedGmi;
  }
});

test("inference uses a configured provider's reply when the call succeeds", async () => {
  const savedGmi = process.env.CRASH_GMI_API_KEY;
  process.env.CRASH_GMI_API_KEY = "test-key-not-a-real-secret";
  try {
    const okFetch = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "live model answer" } }] }),
      }) as unknown as Response) as typeof fetch;
    const out = await infer({ system: "Answer.", user: "goal", fetchImpl: okFetch });
    assert.equal(out, "live model answer");
  } finally {
    if (savedGmi === undefined) delete process.env.CRASH_GMI_API_KEY;
    else process.env.CRASH_GMI_API_KEY = savedGmi;
  }
});

test("describeSearch reports the configured search tier by env presence (x402 > tavily > offline)", () => {
  const saved = {
    wallet: process.env.CRASH_X402_WALLET,
    tavily: process.env.CRASH_TAVILY_API_KEY,
  };
  try {
    // Nothing configured -> the canned offline brief tier.
    delete process.env.CRASH_X402_WALLET;
    delete process.env.CRASH_TAVILY_API_KEY;
    assert.equal(describeSearch(), "offline");

    // A Tavily key alone -> real key-auth search (no wallet/funding needed).
    process.env.CRASH_TAVILY_API_KEY = "test-key-not-a-real-secret";
    assert.equal(describeSearch(), "tavily");

    // A configured x402 wallet outranks the key -> paid search is attempted first (mirrors runPaidSearch).
    process.env.CRASH_X402_WALLET = "test-wallet-not-a-real-secret";
    assert.equal(describeSearch(), "x402");
  } finally {
    if (saved.wallet === undefined) delete process.env.CRASH_X402_WALLET;
    else process.env.CRASH_X402_WALLET = saved.wallet;
    if (saved.tavily === undefined) delete process.env.CRASH_TAVILY_API_KEY;
    else process.env.CRASH_TAVILY_API_KEY = saved.tavily;
  }
});

test("priceToMinor parses USDC display strings to 6-decimal minor units", () => {
  assert.equal(priceToMinor("$0.05"), 50000);
  assert.equal(priceToMinor("0.05 USDC"), 50000);
  assert.equal(priceToMinor("~0.12 USDC / run"), 120000);
  assert.equal(priceToMinor("0.10"), 100000);
  assert.equal(priceToMinor("~0.01 USDC / check"), 10000);
});

test("priceToMinor defaults to RESEARCH_COST_MINOR for unparseable prices", () => {
  // "Free", "Pay-per-call", "Built-in", "Protocol", "Connect", "Local" carry no number.
  assert.equal(priceToMinor("Free"), 10000);
  assert.equal(priceToMinor("Pay-per-call"), 10000);
  assert.equal(priceToMinor("Built-in"), 10000);
  assert.equal(priceToMinor(""), 10000);
});

test("a failed run records run.error and an 'error' run instead of throwing", async () => {
  const listing = store.get("research-agent");
  assert.ok(listing);

  // An inference impl that throws on the FIRST call (plan) forces the pipeline's catch. (infer
  // itself never throws in production; this fake bypasses that to exercise the guard.)
  const throwingInfer: typeof infer = async () => {
    throw new Error("boom");
  };

  const runId = await executeRun(
    { store, runs, wallet, emit: (f) => frames.push(f), inferImpl: throwingInfer, paidFetch: fakePaidFetch },
    { listing, input: "q", buyer: { kind: "human", name: "Tester" } },
  );

  const errFrame = frames.find((f) => f.type === "run.error");
  assert.ok(errFrame, "emitted a run.error frame");
  assert.equal((errFrame as Extract<RunFrame, { type: "run.error" }>).code, "run_internal_error");

  const rec = runs.get(runId);
  assert.equal(rec?.status, "error");
  assert.equal(rec?.errorCode, "run_internal_error");
});

test("paid search falls back to a REAL key-auth Tavily search when x402 cannot settle", async () => {
  // The x402 leg throws wallet_not_configured (no funded wallet), but a Tavily key + key-auth base
  // are present -> runPaidSearch must perform a REAL key-auth search and return THOSE hits (not the
  // canned brief), and must NOT emit a settled payment beat (nothing settled onchain).
  const events: Array<Record<string, unknown>> = [];
  let keyAuthUrl = "";
  const explodingPaidFetch = async (): Promise<PaidFetchResult> => {
    throw new Error("wallet_not_configured");
  };
  const keyAuthFetch = (async (url: string) => {
    keyAuthUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ title: "Live Hit", url: "https://live.example/1", content: "Real body." }],
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;

  const r = await runPaidSearch({
    agentId: "research-agent",
    query: "x402",
    endpoint: "https://x402.tavily.com/search",
    paidFetch: explodingPaidFetch,
    ledger: { canSpend: () => true, record: () => {} },
    amountMinor: 10000,
    network: "eip155:84532",
    tavilyKey: "test-tavily-not-a-real-secret",
    keyAuthBaseUrl: "https://api.tavily.com",
    fetchImpl: keyAuthFetch,
    emit: (e) => events.push(e as unknown as Record<string, unknown>),
    canned: [{ title: "CANNED", url: "https://x402.org", content: "canned" }],
  });

  // Returned the REAL key-auth hit, not the canned one.
  assert.equal(r.results.length, 1);
  assert.equal(r.results[0].title, "Live Hit");
  // Hit the key-auth REST endpoint (api.tavily.com), not the x402 one.
  assert.match(keyAuthUrl, /api\.tavily\.com\/search/);
  // A tool 'ok' was emitted, but NO settled payment beat (key-auth is account-billed, not onchain).
  assert.ok(
    events.some((e) => e.tool === "search" && e.phase === "ok"),
    "emitted a search ok beat",
  );
  assert.ok(
    !events.some((e) => e.phase === "settled"),
    "no settled payment beat -- key-auth never settles onchain",
  );
});

test("paid search falls back to the canned brief when neither x402 nor a key is available", async () => {
  // No wallet (x402 throws) and no Tavily key -> the canned brief keeps the run flop-proof, and a
  // search 'error' beat precedes the canned 'ok' so the transcript is honest about the degradation.
  const events: Array<Record<string, unknown>> = [];
  const explodingPaidFetch = async (): Promise<PaidFetchResult> => {
    throw new Error("wallet_not_configured");
  };
  const r = await runPaidSearch({
    agentId: "research-agent",
    query: "x402",
    endpoint: "https://x402.tavily.com/search",
    paidFetch: explodingPaidFetch,
    ledger: { canSpend: () => true, record: () => {} },
    amountMinor: 10000,
    network: "eip155:84532",
    emit: (e) => events.push(e as unknown as Record<string, unknown>),
    canned: [{ title: "CANNED", url: "https://x402.org", content: "canned" }],
  });

  assert.equal(r.results[0].title, "CANNED");
  assert.ok(
    events.some((e) => e.tool === "search" && e.phase === "error"),
    "emitted a search error before the canned fallback",
  );
});
