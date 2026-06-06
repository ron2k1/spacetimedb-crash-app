# Crash -- Tavily x402 Fuse (real buyer + paid search)

- Date: 2026-06-02
- Status: Approved design (Approach A), ready for writing-plans
- Author: Claude (with Ronil)
- Builds on: docs/superpowers/specs/2026-06-01-crash-agentic-marketplace-design.md
- Branch: feat/agentic-marketplace-design

## 1. Summary

The Crash engine already advertises an "Autonomous Research Agent" that "searches the
live web with Tavily, pays per call with x402, and returns a cited brief" (marketplace
seed listing `research-agent`). The capability is NOT wired: `backend/src/socket/session.ts`
`makePaidFetch` still throws `x402_client_not_wired`, and the Tavily connector
(`backend/src/connectors/search.ts`) is only reached by its own unit tests.

This feature builds the real x402 buyer and fuses it with Tavily search so that ONE
research run performs a single HTTP round-trip that is simultaneously the payment and the
search: request the Tavily x402 endpoint -> HTTP 402 -> sign a USDC micropayment on Base
Sepolia -> retry with the `X-PAYMENT` header -> receive the search results. One run
exercises both sponsor rails (Tavily + Coinbase x402) in one demo beat.

It is built "fund-later": the complete buyer ships now and fails closed at the signing
step until a funded `x402.wallet` key and the Tavily x402 endpoint URL are supplied.
Dropping those in flips the run to real settlement with ZERO code change, because the
wallet key and the endpoint are read at call time (late binding), not at construction.

## 2. Goals / Non-goals

### Goals
- A real x402 buyer (`backend/src/payments/buyer.ts`) that performs the 402 -> sign ->
  retry loop against any URL, late-binding the wallet key from the keystore at call time.
- A fused paid-search path (`backend/src/connectors/paidSearch.ts`): Tavily search
  performed THROUGH the x402 buyer, cap-gated, with a canned fallback so the demo never
  flops on a dead network or an unfunded wallet.
- Engine wiring: a research run triggered via the EXISTING `request.submit` `agentId`
  field, handled at the Session layer, streaming `payment.activity` + `tool.activity` +
  a cited `result.final` to the renderer.
- Replace the `x402_client_not_wired` stub so the existing `marketplace.purchase` path
  also settles for real when a wallet + a seller resource URL are configured.
- Build-now / fund-later with a zero-code-change flip to real settlement.

### Non-goals
- No protocol/contract change. `request.submit.agentId`, `tool.activity`, and
  `payment.activity` already exist in protocol v3 (see Section 4). No `PROTOCOL_VERSION`
  bump, no `Protocol.cs` mirror edit, no drift-guard change.
- No new feature in `marketplace-server` (the secret-free storefront). It stays an
  advertisement; the capability executes only in `@crash/engine`.
- No frontend component work. The renderer change is one line in the net layer
  (`CrashSocket.submitRequest` gains an optional `agentId`). Components
  (`CrashWatcher.tsx`, `interactive-3d-robot.tsx`) are another CLI's live WIP -- do not touch.
- No on-chain wallet provisioning / faucet automation. The funded testnet key is supplied
  by the operator through the Connections panel (or a gitignored headless path), never typed
  into chat and never committed.

## 3. Grounding (facts that shaped this design)

These were verified against the live code, not the prior spec text:

1. **The recipe/search path is dead code.** `runSearch`, `runRecipe`, `HERO_RECIPE`, and
   `resolveCapability` are referenced ONLY by their own unit tests. The live
   `Orchestrator.confirmPlan` runs a fixed RAG + provider pipeline with no search effect and
   no recipe execution. So the fuse cannot "wire into the recipe beat"; it must add a live
   trigger.
2. **`marketplace-server` is a storefront, not an executor.** `POST /api/listings/:id/acquire`
   is symbolic (bumps a counter, records a Sale, broadcasts); `price` is a display string;
   it holds no keystore, no fetch, no x402, no Tavily. Its own types file states "nothing
   here carries secrets." The x402 signing MUST live in the engine.
3. **The protocol already has the hooks.** `RequestSubmitSchema` carries
   `agentId: z.string().optional()` ("run a specific marketplace agent; absent = default
   flow"). `ToolActivitySchema` = `{ agentId, tool, phase, code? }`. `PaymentActivitySchema`
   = `{ agentId, phase, amount, asset:'USDC', network, payTo?, txRef? }`. `result.final`
   carries optional `citations`. All present in v3.
4. **The installed buyer packages are verified.** `@x402/evm@2.14.0` exports `./exact/client`
   (buyer signer) alongside the already-used `./exact/server` (seller). `@x402/core@2.14.0`
   exports `./client` (the x402 HTTP client). `@x402/fetch` is NOT a dependency -- every
   `@x402/fetch` reference (old plan + the comment at `x402.ts:33`) is stale and will be
   corrected. Buyer = `@x402/core/client` + `@x402/evm/exact/client` (+ `viem`, already a
   transitive dep of `@x402/evm`).
5. **The keystore path is `path.join(workspace.runtimeDir, 'keys.json')`** (0o600), NOT the
   `~/Crash/.secrets/connectors.json` the prior spec text mentioned. `keystore.get('x402.wallet')`
   is the late-bind read seam; `keystore.get('tavily')` is the optional Tavily bearer key.

## 4. Architecture

Three new/changed units in the engine, plus a one-line net-layer touch:

```
request.submit { text, agentId:'research-agent' }   (renderer -> engine, EXISTING message)
        |
        v
Session.handleRaw  -- branch on payload.agentId
        |  agentId names a connector-backed agent?
        |---- yes --> Session.runResearch(payload)
        |                 |
        |                 v
        |            paidSearch({ query, cap, buyer, tavilyKey?, endpoint, emit, canned })
        |                 |  (connectors/paidSearch.ts)
        |                 |---- buyer.paidFetch(endpoint, { POST, body, bearer? })   (payments/buyer.ts)
        |                 |          initial fetch -> 402 -> sign USDC (Base Sepolia) -> retry -> results
        |                 |---- emit payment.activity: required -> signing -> settled
        |                 |---- emit tool.activity: start -> ok (or error/canned)
        |                 v
        |            result.final { text, citations:[from hits] }
        |
        |---- no  --> Orchestrator.submit(payload)   (UNCHANGED default RAG flow)
```

`Session` is the natural home because it already owns the keystore, the `CapLedger`, and
(today) the `makePaidFetch` stub. `marketplace.purchase` is already handled directly in
`Session`, so `runResearch` is a parallel sibling, leaving the RAG `Orchestrator` untouched.

Every outbound frame continues to pass through the existing `Session.emit` egress filter
(`EngineToRendererSchema.safeParse` -> ship `result.data`, the key-stripped copy).

## 5. Components

### 5.1 `backend/src/payments/buyer.ts` (new)

The reusable x402 primitive. Models x402 as a fetch WRAPPER (the 402 -> sign -> retry loop),
orthogonal to the wrapped request's own auth -- so the `tavily` connector descriptor is
untouched.

```ts
export interface PaidFetchResult {
  ok: boolean;
  status: number;
  headers: { get(k: string): string | null };
  json(): Promise<unknown>;
  txRef?: string; // from the 'x-payment-response' header when settled
}

export interface MakePaidFetchOpts {
  walletKeyProvider: () => string | undefined; // late-bind keystore read at CALL time
  network: string;                              // 'eip155:84532' (Base Sepolia)
  facilitatorUrl?: string;                      // default https://x402.org/facilitator
  fetchImpl?: typeof fetch;                     // test injection seam
}

// Returns a fetch-like fn that pays a 402 challenge if one is raised.
export function makePaidFetch(opts: MakePaidFetchOpts):
  (url: string, init?: RequestInit) => Promise<PaidFetchResult>;
```

Behavior:
1. `res = fetchImpl(url, init)`. If `res.status !== 402`, return it unchanged (non-paid path).
2. On 402: parse the payment requirements via the `@x402/core/client` HTTP client. If the
   body is malformed, throw a synthetic `payment_required_malformed` (never the raw body).
3. `key = walletKeyProvider()`. If undefined, throw synthetic `wallet_not_configured`
   BEFORE any signing attempt (fail closed; this is the build-now/fund-later seam).
4. Build a `viem` account from the key; build the exact-scheme signer
   (`@x402/evm/exact/client`); create + sign the ERC-3009 `TransferWithAuthorization`
   payload (gasless); encode the `X-PAYMENT` header.
5. Retry `fetchImpl(url, { ...init, headers: { ...init.headers, 'X-PAYMENT': header } })`.
6. Return the retried response as a `PaidFetchResult`, with `txRef` read from the
   `x-payment-response` header.

The private key never leaves this module, is never logged, and is read fresh on each call.

### 5.2 `backend/src/connectors/paidSearch.ts` (new)

The fuse. One call = pay + search.

```ts
export interface PaidSearchArgs {
  agentId: string;
  query: string;
  endpoint: string;                 // the Tavily x402 endpoint URL (non-secret config)
  paidFetch: ReturnType<typeof makePaidFetch>;
  ledger: { canSpend(minor: number): boolean; record(minor: number): void };
  amountMinor: number;              // per-search USDC cap unit (e.g. 50000 = 0.05 USDC)
  tavilyKey?: string;               // optional bearer; attach only if the keystore has it
  emit: (e: ToolEvent | PaymentEvent) => void;
  canned?: SearchHit[];             // flop-proof fallback
}
export function runPaidSearch(args: PaidSearchArgs): Promise<{ results: SearchHit[] }>;
```

Behavior (mirrors the existing `runSearch` shape, adds the payment gate):
1. Cap gate FIRST: `if (!ledger.canSpend(amountMinor))` -> emit `tool.activity error`
   (`payment_cap_exceeded`), return canned (or empty). No signing.
2. Emit `payment.activity required`, then `tool.activity start`, then `payment.activity
   signing` (emitted by paidSearch around the call -- the buyer stays a pure fetch-wrapper
   with no emit hook; the signing beat is cosmetic and emitting it at call-start is honest
   since a 402 + sign is about to happen).
3. `res = await paidFetch(endpoint, { method:'POST', headers: { 'content-type':'application/json',
   ...(tavilyKey ? { authorization: 'Bearer ' + tavilyKey } : {}) }, body: JSON.stringify({ query, max_results: 5 }) })`.
4. If `res.ok`: parse hits, `ledger.record(amountMinor)`, emit `payment.activity settled`
   (with `res.txRef`), emit `tool.activity ok`, return hits.
5. On any throw or `!res.ok`: emit `tool.activity error` with a synthetic code
   (`wallet_not_configured` -> `connector_payment_required`; otherwise `connector_http_error`),
   fall back to `canned` (emitting `tool.activity ok` for the canned beat) so the demo
   continues. Never settle on a failure; never fabricate a `txRef`.

The response BODY is consumed only to extract hit `title`/`url`/`content`; it is never logged.

### 5.3 `backend/src/socket/session.ts` (changed)

1. Replace the `makePaidFetch` stub: build the buyer once with
   `walletKeyProvider: () => this.keystore.get('x402.wallet')` and the network, and adapt it
   to the existing `purchase()` contract (`() => Promise<{ ok, headers }>`) by targeting a
   configured seller resource URL. If no wallet (or no seller URL), it still fails closed with
   a synthetic code -- same observable behavior as today, minus the hard-coded throw.
2. In the `request.submit` case of `handleRaw`, branch on `m.payload.agentId`:
   - If it names a connector-backed agent (initially `'research-agent'`), call
     `this.runResearch(m.payload)`; else `this.orch.submit(m.payload)` (unchanged).
3. `runResearch(payload)`: builds the per-search `CapLedger` view, calls `runPaidSearch`
   with the buyer + `tavilyX402Url` config + optional `keystore.get('tavily')`, maps each
   `ToolEvent`/`PaymentEvent` onto `this.emit('tool.activity', ...)` / `this.emit('payment.activity', ...)`,
   and emits a `result.final` whose `citations` are built from the returned hits. A small
   canned brief keeps the beat alive when the network/wallet is unavailable.

### 5.4 Config seam (changed: `SessionOptions` + host boot)

- `tavilyX402Url?: string` -- the Tavily x402 endpoint URL. NON-SECRET. Sourced from an env
  var (`CRASH_TAVILY_X402_URL`) at engine boot into `SessionOptions`, read late like the
  wallet. Absent -> the research run degrades (Section 6).
- Optional `CRASH_X402_SELLER_URL` for the `marketplace.purchase` resource (so that path can
  settle too). Absent -> purchase keeps failing closed (unchanged).
- The per-search USDC cap reuses the existing `CapLedger` (`backend/src/payments/caps.ts`).

### 5.5 `frontend/r3f-shell/src/net/CrashSocket.ts` (one line)

`submitRequest(text, opts?: { targetPath?: string; agentId?: string })` -- pass `agentId`
through on the `request.submit` frame. Net layer only; no component touched.

### 5.6 `backend/src/payments/x402.ts` (comment fix)

Correct the stale comment at line 33 from `@x402/fetch` to `@x402/core/client`.

## 6. Data flow + degradation ladder (build-now / fund-later made concrete)

| Tier | wallet key | x402 endpoint | Behavior |
|------|-----------|---------------|----------|
| 1 (hero) | present | present | Real x402 micropayment + real Tavily search in one round-trip. `payment.activity` required -> signing -> settled with a real `txRef`; `result.final` cites live hits. |
| 2 | absent | present | Cap passes; buyer fails closed at signing (synthetic `connector_payment_required`); canned brief keeps the beat. No fake settlement. |
| 3 | n/a | absent | Skip the paid path. If a plain `tavily` key exists, do a normal Bearer search (existing `runSearch`); else canned brief. |

Dropping a funded `x402.wallet` key into the keystore AND setting `CRASH_TAVILY_X402_URL`
moves tier 2/3 -> tier 1 with ZERO code change, because both are read at call time.

## 7. Security model

- The wallet private key and the Tavily key are read from the keystore at call time, never
  cross the WebSocket, never enter a renderer store, and are never logged.
- Error/activity events carry SYNTHETIC `code` + display strings only (an engine-formatted
  amount, the network string, a testnet `txRef`). Never `err.message`/stack, the prompt,
  env values, response bodies, or credentials -- on the wire AND in logs.
- Every emitted frame passes the existing `EngineToRendererSchema.safeParse` egress filter;
  unknown keys are stripped (`result.data`), so a coding mistake cannot leak an extra field.
- The cap (`CapLedger.canSpend`) is checked BEFORE signing; an unfunded or uncapped agent
  cannot spend.
- The Tavily x402 endpoint URL is non-secret config held in memory; it is not a keystore secret.
- The buyer fails closed: with no wallet it throws a synthetic code; it never returns a
  fabricated `{ ok: true }` and never invents a `txRef`.

## 8. Testing / stress plan

TDD; tests use injected `fetchImpl` and a fake signer/account so no real chain is touched.

- `buyer.test.ts`:
  - 200 first response -> returned unchanged, no signing.
  - 402 -> 200 -> signs, attaches `X-PAYMENT`, returns ok + `txRef` from `x-payment-response`.
  - 402 -> 402/500 -> not-ok result (caller maps to `payment_failed`); no raw error surfaced.
  - no wallet -> throws synthetic `wallet_not_configured`; never attempts signing.
  - malformed 402 body -> synthetic `payment_required_malformed`; no crash.
- `paidSearch.test.ts`:
  - happy 402 -> 200 with hits -> emits payment required/signing/settled + tool start/ok; returns hits.
  - cap exceeded -> `payment_cap_exceeded`, no signing, canned fallback.
  - no wallet -> `connector_payment_required` + canned fallback (tool ok via canned).
  - 402 -> fail -> canned fallback, no settled event, no `txRef`.
  - tavily key present vs absent -> bearer header attached only when present.
  - every emitted event validates against `ToolActivitySchema` / `PaymentActivitySchema`.
- `session.test.ts` (extends the existing harness):
  - `request.submit { agentId:'research-agent' }` routes to `runResearch`, not `orch.submit`.
  - `request.submit` with no `agentId` still routes to `orch.submit` (default unchanged).
  - every frame `runResearch` emits passes `EngineToRendererSchema`.
- Stress extras: repeated paid searches accumulate the cap correctly and stop at the boundary;
  the egress filter strips an injected unknown key; a settle failure on retry N does not
  corrupt the ledger.
- Gate (repo root): `pnpm -r run test:run` + `pnpm --filter @crash/marketplace-server run test`
  + typecheck + lint + build + `prettier --write`.

## 9. Out of scope / open config (operator-supplied, not build blockers)

- Exact Tavily x402 endpoint URL and whether it needs a Tavily bearer alongside the payment
  -- runtime config, late-bound. The design is robust to both shapes (endpoint = config,
  Tavily key = optional header).
- The funded Base Sepolia wallet key -- supplied via the Connections panel / a gitignored
  headless path, after the build lands. Never typed into chat, never committed.
- `marketplace-server` root-CI coverage (`test:run` alias) -- a separate hygiene improvement.

## 10. Commit discipline

Atomic commits by EXPLICIT path (never `git add -A` -- the worktree carries another CLI's
uncommitted component WIP). Branch-first on `feat/agentic-marketplace-design`; push to origin
on green. No force-push / main-push / secret-push without an explicit operator ask.
