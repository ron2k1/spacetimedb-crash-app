import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { MarketStore } from "./store.js";
import { NewListingInput } from "./types.js";

let dir: string;
let dataFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "crash-mkt-"));
  dataFile = join(dir, "listings.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("seeds 13 listings on a fresh boot (no data file)", () => {
  const store = new MarketStore({ dataFile });
  assert.equal(store.count(), 13);
  assert.equal(store.list().length, 13);
});

test("seed includes at least one agent-published listing", () => {
  const store = new MarketStore({ dataFile });
  const agentListed = store.list().filter((l) => l.seller.kind === "agent");
  assert.ok(
    agentListed.length >= 1,
    "expected at least one listing published by an agent seller",
  );
  // The Daily Market Brief is the seeded agent listing.
  const brief = store.get("market-brief");
  assert.ok(brief);
  assert.equal(brief.seller.kind, "agent");
  assert.equal(brief.seller.name, "Scout v2");
});

test("add() assigns id/createdAt/acquiredCount and defaults presentation fields", () => {
  const store = new MarketStore({ dataFile });
  const before = Date.now();
  const created = store.add({
    name: "Test Listing",
    blurb: "A listing made by a test.",
    category: "skill",
    price: "Free",
  });

  assert.ok(created.id.length > 0, "id assigned");
  assert.equal(created.acquiredCount, 0, "acquiredCount initialized to 0");
  assert.ok(created.createdAt >= before, "createdAt stamped at creation");
  // defaults: icon sparkles, glow-by-category (skill -> blue), seller You
  assert.equal(created.icon, "✨");
  assert.equal(created.glow, "blue");
  assert.deepEqual(created.seller, { kind: "human", name: "You" });
  assert.deepEqual(created.tags, []);

  // now 14 listings, and the new one is retrievable
  assert.equal(store.count(), 14);
  assert.ok(store.get(created.id));
});

test("add() respects category-specific default glow", () => {
  const store = new MarketStore({ dataFile });
  const agent = store.add({
    name: "An Agent",
    blurb: "x",
    category: "agent",
    price: "p",
  });
  const tool = store.add({
    name: "A Tool",
    blurb: "x",
    category: "tool",
    price: "p",
  });
  const workflow = store.add({
    name: "A Workflow",
    blurb: "x",
    category: "workflow",
    price: "p",
  });
  assert.equal(agent.glow, "purple");
  assert.equal(tool.glow, "green");
  assert.equal(workflow.glow, "orange");
});

test("add() appends a 'listed' activity event", () => {
  const store = new MarketStore({ dataFile });
  const created = store.add({
    name: "Activity Probe",
    blurb: "checks the feed",
    category: "tool",
    price: "Free",
  });
  const recent = store.activity(5);
  assert.ok(recent.length >= 1);
  const top = recent[0];
  assert.equal(top.kind, "listed");
  assert.equal(top.listingId, created.id);
  assert.equal(top.listingName, "Activity Probe");
});

test("add() emits 'listing.created'", () => {
  const store = new MarketStore({ dataFile });
  let emitted: { id: string } | undefined;
  store.on("listing.created", (l: { id: string }) => {
    emitted = l;
  });
  const created = store.add({
    name: "Emit Probe",
    blurb: "x",
    category: "skill",
    price: "Free",
  });
  assert.ok(emitted, "listing.created fired");
  assert.equal(emitted!.id, created.id);
});

test("acquire() bumps acquiredCount, returns a sale, appends an 'acquired' event", () => {
  const store = new MarketStore({ dataFile });
  const before = store.get("research-agent");
  assert.ok(before);
  const baseline = before.acquiredCount;

  const result = store.acquire("research-agent", {
    kind: "human",
    name: "Buyer Bob",
  });
  assert.ok(result, "acquire returned a result");
  assert.equal(result!.listing.acquiredCount, baseline + 1);
  assert.equal(result!.sale.listingId, "research-agent");
  assert.deepEqual(result!.sale.buyer, { kind: "human", name: "Buyer Bob" });

  const after = store.get("research-agent");
  assert.equal(after!.acquiredCount, baseline + 1);

  const recent = store.activity(5);
  assert.equal(recent[0].kind, "acquired");
  assert.equal(recent[0].listingId, "research-agent");
  assert.deepEqual(recent[0].actor, { kind: "human", name: "Buyer Bob" });
});

test("acquire() defaults the buyer when none is supplied", () => {
  const store = new MarketStore({ dataFile });
  const result = store.acquire("tavily");
  assert.ok(result);
  assert.deepEqual(result!.sale.buyer, { kind: "human", name: "You" });
});

test("acquire() emits 'listing.acquired'", () => {
  const store = new MarketStore({ dataFile });
  let payload: { listingId: string } | undefined;
  store.on("listing.acquired", (p: { listingId: string }) => {
    payload = p;
  });
  store.acquire("tavily");
  assert.ok(payload);
  assert.equal(payload!.listingId, "tavily");
});

test("acquire() returns null for an unknown id", () => {
  const store = new MarketStore({ dataFile });
  const result = store.acquire("does-not-exist");
  assert.equal(result, null);
});

test("activity() returns most-recent-first and respects the limit", () => {
  const store = new MarketStore({ dataFile });
  store.add({ name: "First", blurb: "x", category: "tool", price: "p" });
  store.add({ name: "Second", blurb: "x", category: "tool", price: "p" });
  store.add({ name: "Third", blurb: "x", category: "tool", price: "p" });
  const recent = store.activity(2);
  assert.equal(recent.length, 2);
  assert.equal(recent[0].listingName, "Third");
  assert.equal(recent[1].listingName, "Second");
});

test("state persists across store instances using the same data file", () => {
  const first = new MarketStore({ dataFile });
  const created = first.add({
    name: "Durable",
    blurb: "should survive a reload",
    category: "skill",
    price: "Free",
  });

  // A new store reading the same file must see the added listing.
  const second = new MarketStore({ dataFile });
  assert.equal(second.count(), 14);
  const reloaded = second.get(created.id);
  assert.ok(reloaded);
  assert.equal(reloaded!.name, "Durable");
});

test("NewListingInput rejects missing required fields", () => {
  const r = NewListingInput.safeParse({ name: "Only a name" });
  assert.equal(r.success, false);
});

test("NewListingInput rejects an overlong name", () => {
  const r = NewListingInput.safeParse({
    name: "x".repeat(81),
    blurb: "valid",
    category: "skill",
    price: "Free",
  });
  assert.equal(r.success, false);
});

test("NewListingInput rejects an invalid category", () => {
  const r = NewListingInput.safeParse({
    name: "valid",
    blurb: "valid",
    category: "not-a-category",
    price: "Free",
  });
  assert.equal(r.success, false);
});

test("NewListingInput rejects more than 6 tags", () => {
  const r = NewListingInput.safeParse({
    name: "valid",
    blurb: "valid",
    category: "skill",
    price: "Free",
    tags: ["1", "2", "3", "4", "5", "6", "7"],
  });
  assert.equal(r.success, false);
});

test("NewListingInput accepts a fully-specified valid body", () => {
  const r = NewListingInput.safeParse({
    name: "valid",
    blurb: "valid",
    category: "agent",
    price: "~0.05 USDC / run",
    icon: "🧭",
    glow: "purple",
    tags: ["a", "b"],
    seller: { kind: "agent", name: "Tester" },
  });
  assert.equal(r.success, true);
});
