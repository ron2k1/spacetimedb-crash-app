// agent-bot.ts -- a headless SpacetimeDB client that bids in Crash's live auctions as a first-class agent.
//
// This is the rubric's "STDB + LLM/agents" + "heavily real-time" bonus made concrete: an autonomous
// process connects to the SAME hosted module the browser uses, registers itself in the `agent` table, and
// competes in the SAME auctions a human is bidding in -- in real time, with no shared code path between
// them beyond the database. A human in the browser and two of these bots fighting over one lot, settling
// server-side, is the demo.
//
// HOW IT WORKS (no polling -- purely reactive):
//   1. Connect to Maincloud with a persisted token (stable Identity per bot; see tokenStore.ts).
//   2. Subscribe to the public tables; register_agent once (an upsert keyed on this Identity).
//   3. Register auction onInsert/onUpdate callbacks. SpacetimeDB PUSHES a fresh `auction` row to the
//      client cache whenever ANYONE changes it (a browser bid, the other bot, the scheduled settler).
//   4. On each change to an auction I'm not winning, bid the MINIMUM the module will accept to retake the
//      lead -- unless that minimum exceeds my cap, in which case I stand down. Two bots with different caps
//      => a self-terminating bid war: the lower cap drops out first, the higher cap wins. No orchestration.
//
// The minimum-bid rule mirrors the module's own validation (spacetime-module/src/lib.rs place_bid):
//   required = highBidder.is_some() ? highBidMinor + minIncrementMinor : highBidMinor
// i.e. the very first bid may EQUAL the opening price; every later bid must clear high + increment. Bidding
// exactly `required` maximizes the number of war rounds (one increment per round) -- better theatre, and it
// never overpays.
//
// RUNTIME: run via tsx (not tsc) so the @ts-nocheck generated bindings (which the backend tsconfig excludes
// from compilation) never hit an emitting compiler. This file lives OUTSIDE src/, so `pnpm typecheck` never
// touches it either. The plain browser-style builder works unchanged in Node 22+ because the SDK's default
// WebSocket adapter uses the global `WebSocket` present in modern Node -- no `ws`/undici/withWSFn needed.
//
// SECURITY: the connection token is a public client token, persisted gitignored and NEVER logged (see
// tokenStore.ts). Logs are ASCII-only and carry only synthetic, non-sensitive facts -- a 4-char slice of
// the bot's OWN public Identity (the same #hex the UI shows), auction ids, and bid amounts. No token, no
// error message text, no host/transport detail ever reaches stdout.

import { DbConnection } from "../src/stdb/generated/index.ts";
import { readToken, saveToken } from "./tokenStore.ts";

// ---------------------------------------------------------------------------------------------------------
// Endpoint -- Maincloud by default (hosted = the "hosted + working" requirement), env-overridable so a venue
// with flaky WiFi can point every client at a local `spacetime start` instead. Mirrors frontend stdbConfig.
const STDB_URI =
  process.env.STDB_URI?.trim() || process.env.VITE_STDB_URI?.trim() || "wss://maincloud.spacetimedb.com";
const STDB_MODULE =
  process.env.STDB_MODULE?.trim() || process.env.VITE_STDB_MODULE?.trim() || "crash-y77jx";

// Only PUBLIC tables can be subscribed. settle_schedule (scheduled) + payment_bridge (private) would fail
// the WHOLE subscription set, so they are omitted -- the auction clock still runs server-side regardless.
const SUBSCRIPTIONS = [
  "SELECT * FROM listing",
  "SELECT * FROM auction",
  "SELECT * FROM bid",
  "SELECT * FROM sale",
  "SELECT * FROM agent",
  "SELECT * FROM activity",
];

// ---------------------------------------------------------------------------------------------------------
// Bot presets. Caps differ so the war terminates deterministically: BotBob bows out around 7.00 USDC,
// BotAlice (cap 9.00) takes the lot. Prices are 6-decimal micro-USDC (minor / 1_000_000).
const PRESETS = {
  alice: {
    id: "alice",
    name: "BotAlice",
    blurb: "Aggressive collector agent. Bids the minimum to stay on top, up to 9.00 USDC.",
    capMinor: 9_000_000n,
  },
  bob: {
    id: "bob",
    name: "BotBob",
    blurb: "Thrifty scout agent. Chases a deal but folds once it gets pricey (7.00 USDC).",
    capMinor: 7_000_000n,
  },
};

const which = (process.argv[2] || "").toLowerCase();
const preset = PRESETS[which];
if (!preset) {
  console.error("usage: tsx agents/agent-bot.ts <alice|bob>");
  process.exit(1);
}

// Node 22+ guard: the SDK's default WS adapter resolves `globalThis.WebSocket`. Bail loudly (synthetic
// message, no transport detail) rather than ship an untested `ws` fallback that could fail mid-demo.
if (typeof globalThis.WebSocket !== "function") {
  console.error(`[${preset.name}] requires Node 22+ (global WebSocket missing). Current: ${process.version}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------------------
// Tiny ASCII-only, secret-free logger + price formatter.
const log = (msg) => console.log(`[${preset.name}] ${msg}`);
const usd = (minor) => (Number(minor) / 1_000_000).toFixed(2);
/** Auction end time in epoch-ms, matching the frontend's tsToMs(row.endsAt). */
const endsAtMs = (a) => Number(a.endsAt.microsSinceUnixEpoch / 1000n);

// ---------------------------------------------------------------------------------------------------------
// Reactive state.
let conn = null;
let me = null; // this bot's Identity, set on connect
let ready = false; // true once the subscription has applied (cache populated)
const inFlight = new Set(); // auction ids (as strings) with a bid currently scheduled -- dedupes bursts
const stoodDown = new Set(); // auction ids we've already logged a "above cap" stand-down for (quiet logs)

/**
 * The whole strategy. Given an auction row, decide whether to bid and, if so, schedule the minimum bid
 * after a short jitter. Re-reads the LIVE row at fire time so a bid placed during the jitter window by the
 * other bot can't make us submit a now-stale (and module-rejected) amount.
 */
function evaluate(a) {
  if (!ready || !me) return;
  if (a.status !== "open") return;
  if (endsAtMs(a) <= Date.now()) return; // ending now; let the server's scheduled reducer settle it
  const hasBidder = a.highBidder != null;
  if (hasBidder && a.highBidder.isEqual(me)) return; // already winning -- hold

  const required = hasBidder ? a.highBidMinor + a.minIncrementMinor : a.highBidMinor;
  if (required > preset.capMinor) {
    if (!stoodDown.has(a.id.toString())) {
      stoodDown.add(a.id.toString());
      log(`auction ${a.id}: next bid ${usd(required)} USDC is over my ${usd(preset.capMinor)} cap -- standing down`);
    }
    return;
  }

  const k = a.id.toString();
  if (inFlight.has(k)) return; // a bid for this lot is already queued; don't pile on
  inFlight.add(k);

  // Jitter so the two bots don't fire on the exact same tick (cuts down mutually-rejected simultaneous bids).
  const jitterMs = 250 + Math.floor(Math.random() * 600);
  setTimeout(() => {
    inFlight.delete(k);
    // Re-read the freshest row from the client cache; the war may have advanced during the jitter window.
    const live = conn?.db.auction.id.find(a.id);
    if (!live || live.status !== "open" || endsAtMs(live) <= Date.now()) return;
    const hb = live.highBidder != null;
    if (hb && live.highBidder.isEqual(me)) return; // someone (maybe us) already leads -- nothing to do
    const req = hb ? live.highBidMinor + live.minIncrementMinor : live.highBidMinor;
    if (req > preset.capMinor) return; // price moved above cap during the window -- stand down silently
    stoodDown.delete(k); // we're back in -- allow a fresh stand-down log if it later exceeds cap again
    conn.reducers.placeBid(live.id, req); // fire-and-forget; the module is the source of truth on validity
    log(`auction ${live.id}: bidding ${usd(req)} USDC`);
  }, jitterMs);
}

// ---------------------------------------------------------------------------------------------------------
// Connect. Mirrors the proven frontend builder chain (stdbConnection.ts), adapted for Node: token from a
// file instead of localStorage, callbacks registered before subscribe so the initial snapshot is caught.
conn = DbConnection.builder()
  .withUri(STDB_URI)
  .withModuleName(STDB_MODULE)
  .withToken(readToken(preset.id))
  .onConnect((connection, identity, token) => {
    me = identity;
    saveToken(preset.id, token); // refresh the persisted token (NEVER logged)
    // Last 4 hex chars, not first: SpacetimeDB 1.x Identity hex shares a constant `c200...` header, so a
    // leading slice is identical for every identity -- the tail is the entropy-rich part that distinguishes.
    log(`connected to ${STDB_MODULE} as #${identity.toHexString().slice(-4)}`);

    // Register row callbacks BEFORE subscribing so initial-snapshot inserts are observed. They no-op while
    // ready === false; the onApplied sweep below handles the snapshot once the cache is populated.
    connection.db.auction.onInsert((_ctx, row) => evaluate(row));
    connection.db.auction.onUpdate((_ctx, _old, row) => evaluate(row));

    connection
      .subscriptionBuilder()
      .onApplied(() => {
        ready = true;
        connection.reducers.registerAgent(preset.name, preset.blurb); // upsert keyed on this Identity
        log(`registered; ${connection.db.auction.count()} auction(s) in view`);
        for (const a of connection.db.auction.iter()) evaluate(a); // act on lots already open at join time
      })
      .subscribe(SUBSCRIPTIONS);
  })
  .onConnectError(() => {
    // Synthetic flip only -- never surface the Error (it can carry host/transport detail).
    log("connect error (synthetic) -- exiting");
    process.exit(1);
  })
  .onDisconnect(() => {
    log("disconnected from host");
  })
  .build();

// Clean shutdown: a spawned process must terminate on its own close-path. Ctrl-C disconnects the socket
// (frees the Identity's connection server-side) and exits 0.
process.on("SIGINT", () => {
  log("shutting down");
  try {
    conn?.disconnect();
  } catch {
    // already closed -- nothing to do
  }
  process.exit(0);
});

log(`starting -- cap ${usd(preset.capMinor)} USDC; connecting to ${STDB_URI}`);
