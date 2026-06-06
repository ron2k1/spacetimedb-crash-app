import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

import { createServer, type CreatedServer } from "./server.js";

let dir: string;
let server: CreatedServer;
let base: string;

function listen(srv: CreatedServer): Promise<string> {
  return new Promise((resolveListen) => {
    // Port 0 -> OS assigns a free ephemeral port, so tests never collide.
    srv.httpServer.listen(0, "127.0.0.1", () => {
      const addr = srv.httpServer.address() as AddressInfo;
      resolveListen(`http://127.0.0.1:${addr.port}`);
    });
  });
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "crash-mkt-srv-"));
  server = createServer({ dataFile: join(dir, "listings.json") });
  base = await listen(server);
});

afterEach(async () => {
  await new Promise<void>((res) => server.httpServer.close(() => res()));
  rmSync(dir, { recursive: true, force: true });
});

test("GET /api/health returns ok with the seeded listing count", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    ok: boolean;
    version: string;
    listingCount: number;
  };
  assert.equal(body.ok, true);
  assert.equal(body.version, "0.1.0");
  assert.equal(body.listingCount, 13);
});

test("GET /api/config reports inference + search tiers honestly by env presence", async () => {
  type ConfigBody = {
    version: string;
    inference: string;
    search: string;
    network: string;
    walletSeeded: boolean;
  };
  const getConfig = async (): Promise<ConfigBody> => {
    const res = await fetch(`${base}/api/config`);
    assert.equal(res.status, 200);
    return (await res.json()) as ConfigBody;
  };
  const saved = {
    wallet: process.env.CRASH_X402_WALLET,
    tavily: process.env.CRASH_TAVILY_API_KEY,
  };
  try {
    // No search credentials -> the canned offline brief tier; the rest of the descriptor is stable.
    delete process.env.CRASH_X402_WALLET;
    delete process.env.CRASH_TAVILY_API_KEY;
    const offline = await getConfig();
    assert.equal(offline.version, "0.1.0");
    assert.equal(offline.network, "eip155:84532");
    assert.equal(offline.walletSeeded, true);
    assert.equal(offline.search, "offline");
    assert.ok(offline.inference.length > 0); // some inference tier is always named

    // A Tavily key alone -> real key-auth search, no wallet needed.
    process.env.CRASH_TAVILY_API_KEY = "test-key-not-a-real-secret";
    assert.equal((await getConfig()).search, "tavily");

    // A configured x402 wallet outranks the key -> paid search tier (mirrors runPaidSearch order).
    process.env.CRASH_X402_WALLET = "test-wallet-not-a-real-secret";
    assert.equal((await getConfig()).search, "x402");
  } finally {
    if (saved.wallet === undefined) delete process.env.CRASH_X402_WALLET;
    else process.env.CRASH_X402_WALLET = saved.wallet;
    if (saved.tavily === undefined) delete process.env.CRASH_TAVILY_API_KEY;
    else process.env.CRASH_TAVILY_API_KEY = saved.tavily;
  }
});

test("GET /api/listings returns the 13 seeded listings", async () => {
  const res = await fetch(`${base}/api/listings`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { listings: unknown[] };
  assert.equal(body.listings.length, 13);
});

test("GET /api/listings/:id returns a listing, 404 for unknown", async () => {
  const ok = await fetch(`${base}/api/listings/research-agent`);
  assert.equal(ok.status, 200);
  const okBody = (await ok.json()) as { listing: { id: string } };
  assert.equal(okBody.listing.id, "research-agent");

  const missing = await fetch(`${base}/api/listings/nope`);
  assert.equal(missing.status, 404);
  const missBody = (await missing.json()) as { error: string };
  assert.equal(missBody.error, "not_found");
});

test("POST /api/listings creates a listing, then GET reflects it", async () => {
  const create = await fetch(`${base}/api/listings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Server Test Listing",
      blurb: "Created via POST in a test.",
      category: "workflow",
      price: "~0.10 USDC / run",
    }),
  });
  assert.equal(create.status, 201);
  const created = (await create.json()) as {
    listing: { id: string; glow: string; acquiredCount: number };
  };
  assert.equal(created.listing.acquiredCount, 0);
  assert.equal(created.listing.glow, "orange"); // workflow default

  const list = await fetch(`${base}/api/listings`);
  const body = (await list.json()) as { listings: { id: string }[] };
  assert.equal(body.listings.length, 14);
  assert.ok(body.listings.some((l) => l.id === created.listing.id));
});

test("POST /api/listings with an invalid body returns 400 with issues", async () => {
  const res = await fetch(`${base}/api/listings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "missing the rest" }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; issues: unknown[] };
  assert.equal(body.error, "invalid");
  assert.ok(Array.isArray(body.issues) && body.issues.length > 0);
});

test("POST /api/listings/:id/acquire bumps the count and returns a sale", async () => {
  const before = await (
    await fetch(`${base}/api/listings/research-agent`)
  ).json();
  const baseline = (before as { listing: { acquiredCount: number } }).listing
    .acquiredCount;

  const res = await fetch(`${base}/api/listings/research-agent/acquire`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ buyer: { kind: "agent", name: "Test Agent" } }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    listing: { acquiredCount: number };
    sale: { listingId: string; buyer: { name: string } };
  };
  assert.equal(body.listing.acquiredCount, baseline + 1);
  assert.equal(body.sale.listingId, "research-agent");
  assert.equal(body.sale.buyer.name, "Test Agent");
});

test("POST acquire on an unknown id returns 404", async () => {
  const res = await fetch(`${base}/api/listings/ghost/acquire`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 404);
});

test("GET /api/activity returns recent events after a mutation", async () => {
  await fetch(`${base}/api/listings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Activity Maker",
      blurb: "drives the feed",
      category: "tool",
      price: "Free",
    }),
  });
  const res = await fetch(`${base}/api/activity?limit=5`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    activity: { kind: string; listingName: string }[];
  };
  assert.ok(body.activity.length >= 1);
  assert.equal(body.activity[0].kind, "listed");
  assert.equal(body.activity[0].listingName, "Activity Maker");
});
