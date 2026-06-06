# Crash Tavily x402 Fuse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real engine-hosted x402 buyer and fuse it with Tavily search so one research run is a single HTTP 402 -> sign USDC (Base Sepolia) -> retry -> Tavily-results round-trip, exercising both sponsor rails in one beat, shipping fund-later (fails closed at signing until a funded `x402.wallet` key + endpoint arrive, then flips to real settlement with zero code change).

**Architecture:** A reusable `makePaidFetch` primitive (`backend/src/payments/buyer.ts`) wraps any fetch with the 402->sign->retry loop, late-binding the wallet key at call time. `runPaidSearch` (`backend/src/connectors/paidSearch.ts`) performs a cap-gated Tavily search THROUGH that buyer with a canned fallback. `Session` (`backend/src/socket/session.ts`) routes `request.submit { agentId:'research-agent' }` to a new `runResearch` sibling of the existing `marketplace.purchase` handler, leaving the RAG `Orchestrator` untouched, and replaces the `x402_client_not_wired` stub. Config (`tavilyX402Url`, `sellerUrl`) is env-sourced and read late. The renderer change is one backward-compatible param on `CrashSocket.submitRequest`. Zero protocol/contract change.

**Tech Stack:** TypeScript (NodeNext ESM), pnpm workspace, vitest, `@x402/core/client` + `@x402/evm/exact/client` + `viem` (buyer signer), zod protocol contract (`@crash/protocol`).

---

## Grounding deltas from the spec (read before starting)

These are deliberate, grounded refinements to the approved spec (`docs/superpowers/specs/2026-06-02-crash-tavily-x402-fuse-design.md`). Each is verified against live code:

1. **`viem` is NOT a backend dependency** (`backend/package.json` lists only `@x402/*`, `express`, `ws`, `zod`). Under pnpm's isolated `node_modules`, `@crash/engine` can only import packages it declares; `viem` lives transitively under `@x402/evm` and is not directly resolvable. Task 0 adds `viem@^2.48.11` (the exact range `@x402/evm` already uses, so pnpm dedupes to one copy).
2. **`MakePaidFetchOpts` drops `network` and `facilitatorUrl`** (spec 5.1 listed them). The x402 BUYER never talks to the facilitator (only the seller does), and the exact-EVM scheme registers an `eip155:*` wildcard when `networks` is omitted -- which covers Base Sepolia -- and the 402 challenge itself carries the network/asset. So the buyer is network-blind. The `network` display string moves to `runPaidSearch`'s args (it owns the `payment.activity` emit). Instead the opts gain an optional `httpClientFactory?` test seam (same philosophy as the spec's existing `fetchImpl?`) so the sign-path orchestration is deterministically unit-testable without a real x402 challenge.
3. **Protocol field names** (`protocol/src/events.ts`): `result.final` payload is `{ requestId, answer, citations? }` -- the field is **`answer`**, not `text`. A `Citation` is `{ source, snippet }` -- there is **no `url`** field (web URLs go in the free-text `answer`). `tool.activity.code` is "synthetic code only on error" -- the canned-fallback `ok` beat carries no code. Emitting a wrong shape makes the egress `safeParse` silently DROP the frame.
4. **`CrashSocket.submitRequest` stays backward-compatible.** It is currently `submitRequest(text, targetPath?)` called positionally; the spec sketched an opts-object refactor, but that would ripple into component callers (another CLI's live WIP -- off-limits). Add `agentId` as an optional THIRD positional param instead. One file, zero component churn.
5. **`CapLedger` is keyed by a string id** (`canSpend(id, minor)` / `record(id, minor)` / `snapshot()[i].spentMinor`, predicate `spent + amount <= cap`, confirmed by `backend/test/payments/x402.test.ts`). `runResearch` binds `agentId` into a narrowed `CapView` so `paidSearch` stays decoupled.

## File Structure

- **Create** `backend/src/payments/buyer.ts` -- the x402 buyer primitive (fetch wrapper). Depends on `@x402/core/client`, `@x402/evm/exact/client`, `viem/accounts`. No emit, no logging.
- **Create** `backend/src/connectors/paidSearch.ts` -- the fuse: cap-gated Tavily search over the buyer. Reuses `SearchHit`/`ToolEvent` (search.ts), `PaymentEvent`/`formatUsdc` (x402.ts), `PaidFetchResult` (buyer.ts).
- **Create** `backend/src/socket/research.ts` -- pure helpers + constants for the research run (kept out of `session.ts` so the Session class stays transport-focused).
- **Modify** `backend/src/socket/session.ts` -- replace `makePaidFetch` stub; add `runResearch`; branch `request.submit` on `agentId`; `SessionOptions += tavilyX402Url?, sellerUrl?`.
- **Modify** `backend/src/socket/server.ts` -- pass `process.env.CRASH_TAVILY_X402_URL` / `CRASH_X402_SELLER_URL` into `new Session(...)`.
- **Modify** `backend/src/payments/x402.ts` -- correct the stale `@x402/fetch` comment (line ~33) to `@x402/core/client`.
- **Modify** `frontend/r3f-shell/src/net/CrashSocket.ts` -- `submitRequest` gains an optional third `agentId` param.
- **Modify** `backend/package.json` -- add `viem`.
- **Tests** (mirror `src` under `backend/test/`): `test/payments/buyer.test.ts`, `test/connectors/paidSearch.test.ts`, `test/socket/research-wiring.test.ts`, `test/payments/paid-search-stress.test.ts`.

---

### Task 0: Add the `viem` dependency

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Add viem to backend dependencies**

In `backend/package.json`, in the `"dependencies"` block, add (keep alphabetical-ish, after `@x402/paywall`):

```json
    "express": "^4.22.2",
    "viem": "^2.48.11",
    "ws": "^8.21.0",
```

(Insert the `"viem": "^2.48.11",` line; leave the surrounding lines intact.)

- [ ] **Step 2: Install**

Run (repo root): `pnpm install`
Expected: lockfile updates; `backend/node_modules/viem` resolves (pnpm dedupes to the copy `@x402/evm` already pulled).

- [ ] **Step 3: Verify resolution**

Run (repo root): `pnpm --filter @crash/engine exec node --input-type=module -e "import('viem/accounts').then(m => { if (typeof m.privateKeyToAccount !== 'function') process.exit(1); })"`
Expected: exit 0 (no output). A non-zero exit means viem did not resolve from the engine package.

- [ ] **Step 4: Commit**

```bash
git add backend/package.json pnpm-lock.yaml
git commit -F - <<'MSG'
chore(engine): add viem dep for x402 buyer signing

The x402 buyer signs ERC-3009 TransferWithAuthorization payloads via a
viem account (privateKeyToAccount). viem is a transitive dep of @x402/evm
but pnpm's isolated node_modules makes it unresolvable from @crash/engine
unless declared. Pin to ^2.48.11 (the range @x402/evm uses) so pnpm
dedupes to a single installed copy.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG
```

---

### Task 1: The x402 buyer (`buyer.ts`)

**Files:**
- Create: `backend/src/payments/buyer.ts`
- Test: `backend/test/payments/buyer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/test/payments/buyer.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { makePaidFetch, type X402HttpClientLike } from '../../src/payments/buyer.js';

// A deterministic fake x402 HTTP client: no real signing, no real chain, no real challenge.
function fakeClient(): X402HttpClientLike {
  return {
    getPaymentRequiredResponse: () => ({ accepts: [] }),
    createPaymentPayload: async () => ({ signed: true }),
    encodePaymentSignatureHeader: () => ({ 'X-PAYMENT': 'sig-abc' }),
  };
}

// Minimal Response-like fake; the buyer only touches ok/status/headers.get/json.
function res(status: number, headers: Record<string, string> = {}, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  } as any;
}

describe('makePaidFetch', () => {
  it('passes a non-402 response straight through without signing', async () => {
    const fetchImpl = vi.fn(async () => res(200, {}, { results: [] }));
    const factory = vi.fn(() => fakeClient());
    const paidFetch = makePaidFetch({ walletKeyProvider: () => '0xKEY', fetchImpl, httpClientFactory: factory });
    const r = await paidFetch('https://x', { method: 'POST' });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(factory).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('on 402 signs, attaches X-PAYMENT, retries, returns txRef from x-payment-response', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(402))
      .mockResolvedValueOnce(res(200, { 'x-payment-response': '0xTX' }, { results: [] }));
    const paidFetch = makePaidFetch({ walletKeyProvider: () => '0xKEY', fetchImpl, httpClientFactory: () => fakeClient() });
    const r = await paidFetch('https://x', { method: 'POST', headers: { 'content-type': 'application/json' } });
    expect(r.ok).toBe(true);
    expect(r.txRef).toBe('0xTX');
    const secondInit = fetchImpl.mock.calls[1][1];
    expect(secondInit.headers['X-PAYMENT']).toBe('sig-abc');
    expect(secondInit.headers['content-type']).toBe('application/json');
  });

  it('fails closed with wallet_not_configured when no key, never signing, no retry', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(402));
    const factory = vi.fn(() => fakeClient());
    const paidFetch = makePaidFetch({ walletKeyProvider: () => undefined, fetchImpl, httpClientFactory: factory });
    await expect(paidFetch('https://x')).rejects.toThrow('wallet_not_configured');
    expect(factory).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps a malformed 402 challenge to payment_required_malformed', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(402));
    const bad: X402HttpClientLike = {
      getPaymentRequiredResponse: () => { throw new Error('boom'); },
      createPaymentPayload: async () => ({}),
      encodePaymentSignatureHeader: () => ({}),
    };
    const paidFetch = makePaidFetch({ walletKeyProvider: () => '0xKEY', fetchImpl, httpClientFactory: () => bad });
    await expect(paidFetch('https://x')).rejects.toThrow('payment_required_malformed');
  });

  it('returns ok:false when the retried payment is rejected (no txRef invented)', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(res(402)).mockResolvedValueOnce(res(500, {}, {}));
    const paidFetch = makePaidFetch({ walletKeyProvider: () => '0xKEY', fetchImpl, httpClientFactory: () => fakeClient() });
    const r = await paidFetch('https://x');
    expect(r.ok).toBe(false);
    expect(r.status).toBe(500);
    expect(r.txRef).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/payments/buyer.test.ts`
Expected: FAIL -- cannot resolve `../../src/payments/buyer.js`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/payments/buyer.ts`:

```ts
// backend/src/payments/buyer.ts
//
// The x402 buyer: a fetch WRAPPER that pays an HTTP 402 challenge and retries. x402 is modeled
// as orthogonal to the wrapped request's own auth, so any connector (e.g. the Tavily search
// POST) can be paid for without changing its descriptor.
//
// SECURITY: the wallet private key is read fresh from walletKeyProvider() on each call (late
// binding -> build-now/fund-later), never stored, never logged, never returned. The buyer emits
// nothing; callers own all activity events. On failure it throws a SYNTHETIC code or returns
// ok:false -- it never fabricates a settled result and never invents a txRef.

import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

export interface PaidFetchResult {
  ok: boolean;
  status: number;
  headers: { get(k: string): string | null };
  json(): Promise<unknown>;
  txRef?: string; // from the 'x-payment-response' header when the seller settled
}

/** The slice of @x402/core/client's x402HTTPClient the buyer drives. Narrowed to an interface
 *  so tests inject a deterministic fake (no real chain, no real challenge). */
export interface X402HttpClientLike {
  getPaymentRequiredResponse(getHeader: (k: string) => string | null, body?: unknown): unknown;
  createPaymentPayload(paymentRequired: unknown): Promise<unknown>;
  encodePaymentSignatureHeader(payload: unknown): Record<string, string>;
}

export interface MakePaidFetchOpts {
  /** Late-bind keystore read at CALL time -> undefined means "fail closed at signing". */
  walletKeyProvider: () => string | undefined;
  /** Test seam: defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam: defaults to the real @x402 exact-EVM client built from the wallet key. */
  httpClientFactory?: (walletKey: string) => X402HttpClientLike;
}

function defaultHttpClientFactory(walletKey: string): X402HttpClientLike {
  // A viem account IS the ClientEvmSigner the exact scheme needs. Omitting `networks` registers
  // the eip155:* wildcard (covers Base Sepolia eip155:84532). ERC-3009 TransferWithAuthorization
  // signing is a pure EIP-712 signature -> no RPC needed here; the seller+facilitator settle.
  const account = privateKeyToAccount(walletKey as `0x${string}`);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  return new x402HTTPClient(client);
}

export function makePaidFetch(
  opts: MakePaidFetchOpts,
): (url: string, init?: RequestInit) => Promise<PaidFetchResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const makeClient = opts.httpClientFactory ?? defaultHttpClientFactory;

  return async (url: string, init?: RequestInit): Promise<PaidFetchResult> => {
    const first = await doFetch(url, init);
    if (first.status !== 402) {
      return { ok: first.ok, status: first.status, headers: first.headers, json: () => first.json() };
    }

    // A 402 means payment is required. Fail closed BEFORE any signing if no wallet.
    const walletKey = opts.walletKeyProvider();
    if (!walletKey) throw new Error('wallet_not_configured');

    // The initial response is discarded after we read its challenge; no clone() (fakes lack it).
    let body: unknown;
    try {
      body = await first.json();
    } catch {
      body = undefined;
    }

    const client = makeClient(walletKey);
    let paymentRequired: unknown;
    try {
      paymentRequired = client.getPaymentRequiredResponse((k) => first.headers.get(k), body);
    } catch {
      throw new Error('payment_required_malformed');
    }

    const payload = await client.createPaymentPayload(paymentRequired);
    const payHeader = client.encodePaymentSignatureHeader(payload);
    const mergedHeaders = { ...(init?.headers as Record<string, string> | undefined), ...payHeader };

    const retried = await doFetch(url, { ...init, headers: mergedHeaders });
    return {
      ok: retried.ok,
      status: retried.status,
      headers: retried.headers,
      json: () => retried.json(),
      txRef: retried.headers.get('x-payment-response') ?? undefined,
    };
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @crash/engine exec vitest run test/payments/buyer.test.ts`
Expected: PASS (5 tests).
If `tsc` later complains that `x402HTTPClient` is not assignable to `X402HttpClientLike`, add `as X402HttpClientLike` to the `return new x402HTTPClient(client)` line (method-bivariance should make it pass without the cast).

- [ ] **Step 5: Commit**

```bash
git add backend/src/payments/buyer.ts backend/test/payments/buyer.test.ts
git commit -F - <<'MSG'
feat(payments): x402 buyer fetch-wrapper (402 -> sign -> retry)

makePaidFetch wraps any fetch with the x402 loop: on a 402 it reads the
wallet key LATE (build-now/fund-later), builds a viem-account exact-EVM
signer, signs the ERC-3009 payload, attaches X-PAYMENT, retries, and reads
the txRef from x-payment-response. No emit, no logging; fails closed with a
synthetic wallet_not_configured before any signing when no key. An injected
httpClientFactory seam makes the sign-path orchestration deterministically
testable without a real chain or challenge.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG
```

---

### Task 2: The fuse (`paidSearch.ts`)

**Files:**
- Create: `backend/src/connectors/paidSearch.ts`
- Test: `backend/test/connectors/paidSearch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/test/connectors/paidSearch.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { runPaidSearch } from '../../src/connectors/paidSearch.js';
import { makeMessage, PaymentActivitySchema, ToolActivitySchema } from '@crash/protocol';

function tag(e: any) {
  return 'tool' in e
    ? { kind: 'tool', phase: e.phase, code: e.code }
    : { kind: 'pay', phase: e.phase, txRef: e.txRef };
}
function paidRes(over: Partial<any> = {}) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ results: [{ title: 'T', url: 'https://u', content: 'c' }] }),
    txRef: '0xTX',
    ...over,
  } as any;
}
const base = {
  agentId: 'research-agent',
  query: 'q',
  endpoint: 'https://tavily.x402/search',
  amountMinor: 50000,
  network: 'eip155:84532',
};

describe('runPaidSearch', () => {
  it('happy path: required/signing/settled + start/ok, records cap, returns hits', async () => {
    const evs: any[] = [];
    const paidFetch = vi.fn(async () => paidRes());
    const ledger = { canSpend: () => true, record: vi.fn() };
    const r = await runPaidSearch({ ...base, paidFetch, ledger, emit: (e) => evs.push(tag(e)) });
    expect(r.results[0].title).toBe('T');
    expect(ledger.record).toHaveBeenCalledWith(50000);
    expect(evs).toEqual([
      { kind: 'pay', phase: 'required', txRef: undefined },
      { kind: 'tool', phase: 'start', code: undefined },
      { kind: 'pay', phase: 'signing', txRef: undefined },
      { kind: 'pay', phase: 'settled', txRef: '0xTX' },
      { kind: 'tool', phase: 'ok', code: undefined },
    ]);
  });

  it('cap exceeded: no fetch, no signing, canned fallback', async () => {
    const evs: any[] = [];
    const paidFetch = vi.fn();
    const ledger = { canSpend: () => false, record: vi.fn() };
    const r = await runPaidSearch({ ...base, paidFetch, ledger, emit: (e) => evs.push(tag(e)), canned: [{ title: 'C', url: 'u', content: 'c' }] });
    expect(paidFetch).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
    expect(r.results[0].title).toBe('C');
    expect(evs).toEqual([
      { kind: 'tool', phase: 'error', code: 'payment_cap_exceeded' },
      { kind: 'tool', phase: 'ok', code: undefined },
    ]);
  });

  it('no wallet: buyer throws wallet_not_configured -> connector_payment_required + canned', async () => {
    const evs: any[] = [];
    const paidFetch = vi.fn(async () => { throw new Error('wallet_not_configured'); });
    const ledger = { canSpend: () => true, record: vi.fn() };
    const r = await runPaidSearch({ ...base, paidFetch, ledger, emit: (e) => evs.push(tag(e)), canned: [{ title: 'C', url: 'u', content: 'c' }] });
    expect(r.results[0].title).toBe('C');
    expect(ledger.record).not.toHaveBeenCalled();
    expect(evs.some((e) => e.kind === 'tool' && e.phase === 'error' && e.code === 'connector_payment_required')).toBe(true);
    expect(evs.some((e) => e.kind === 'pay' && e.phase === 'settled')).toBe(false);
  });

  it('paid fetch not ok -> connector_http_error + canned, no settled, no record', async () => {
    const evs: any[] = [];
    const paidFetch = vi.fn(async () => paidRes({ ok: false, status: 502, txRef: undefined }));
    const ledger = { canSpend: () => true, record: vi.fn() };
    const r = await runPaidSearch({ ...base, paidFetch, ledger, emit: (e) => evs.push(tag(e)), canned: [{ title: 'C', url: 'u', content: 'c' }] });
    expect(r.results[0].title).toBe('C');
    expect(evs.some((e) => e.kind === 'pay' && e.phase === 'settled')).toBe(false);
    expect(ledger.record).not.toHaveBeenCalled();
  });

  it('attaches the Tavily bearer only when a key is present', async () => {
    const withKey = vi.fn(async () => paidRes());
    await runPaidSearch({ ...base, paidFetch: withKey, ledger: { canSpend: () => true, record: () => {} }, tavilyKey: 'tk', emit: () => {} });
    expect((withKey.mock.calls[0][1] as any).headers.authorization).toBe('Bearer tk');
    const noKey = vi.fn(async () => paidRes());
    await runPaidSearch({ ...base, paidFetch: noKey, ledger: { canSpend: () => true, record: () => {} }, emit: () => {} });
    expect((noKey.mock.calls[0][1] as any).headers.authorization).toBeUndefined();
  });

  it('every emitted event validates against its protocol schema', async () => {
    const raw: any[] = [];
    await runPaidSearch({ ...base, paidFetch: async () => paidRes(), ledger: { canSpend: () => true, record: () => {} }, emit: (e) => raw.push(e) });
    for (const e of raw) {
      const type = 'tool' in e ? 'tool.activity' : 'payment.activity';
      const schema = 'tool' in e ? ToolActivitySchema : PaymentActivitySchema;
      expect(schema.safeParse(makeMessage(type, 's', 0, e)).success).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/connectors/paidSearch.test.ts`
Expected: FAIL -- cannot resolve `../../src/connectors/paidSearch.js`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/connectors/paidSearch.ts`:

```ts
// backend/src/connectors/paidSearch.ts
//
// The fuse: ONE call = pay + search. A Tavily search performed THROUGH the x402 buyer, so a
// single HTTP round-trip is simultaneously the USDC micropayment (Base Sepolia) and the web
// search. Cap-gated before any signing; canned fallback so the demo never flops on a dead
// network or an unfunded wallet.
//
// SECURITY: the response body is consumed only to extract hit title/url/content; never logged.
// All activity codes are synthetic. A failure never settles and never invents a txRef.

import type { SearchHit, ToolEvent } from './search.js';
import type { PaymentEvent } from '../payments/x402.js';
import { formatUsdc } from '../payments/x402.js';
import type { PaidFetchResult } from '../payments/buyer.js';

/** Narrowed cap view: runResearch binds the agentId so paidSearch stays decoupled from
 *  CapLedger's keying (a fake is trivially { canSpend: () => true, record: () => {} }). */
export interface CapView {
  canSpend(amountMinor: number): boolean;
  record(amountMinor: number): void;
}

export interface PaidSearchArgs {
  agentId: string;
  query: string;
  endpoint: string; // Tavily x402 endpoint URL (non-secret config)
  paidFetch: (url: string, init?: RequestInit) => Promise<PaidFetchResult>;
  ledger: CapView;
  amountMinor: number; // per-search USDC cap unit (50000 = 0.05 USDC)
  network: string; // 'eip155:84532' -> the PaymentEvent.network display string
  payTo?: string; // optional seller address for display
  tavilyKey?: string; // optional bearer; attach only when present
  emit: (e: ToolEvent | PaymentEvent) => void;
  canned?: SearchHit[]; // flop-proof fallback
}

export async function runPaidSearch(args: PaidSearchArgs): Promise<{ results: SearchHit[] }> {
  const { agentId, query, endpoint, paidFetch, ledger, amountMinor, network, payTo, tavilyKey, emit, canned } = args;
  const amount = formatUsdc(amountMinor);

  // 1. Cap gate FIRST -- before any payment beat or signing.
  if (!ledger.canSpend(amountMinor)) {
    emit({ agentId, tool: 'search', phase: 'error', code: 'payment_cap_exceeded' });
    return { results: cannedOrEmpty(canned, agentId, emit) };
  }

  // 2. Payment + tool beats around the single paid round-trip.
  emit({ agentId, phase: 'required', amount, asset: 'USDC', network, payTo });
  emit({ agentId, tool: 'search', phase: 'start' });
  emit({ agentId, phase: 'signing', amount, asset: 'USDC', network, payTo });

  try {
    const res = await paidFetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(tavilyKey ? { authorization: `Bearer ${tavilyKey}` } : {}),
      },
      body: JSON.stringify({ query, max_results: 5 }),
    });
    if (!res.ok) {
      emit({ agentId, tool: 'search', phase: 'error', code: 'connector_http_error' });
      return { results: cannedOrEmpty(canned, agentId, emit) };
    }
    const hits = parseHits(await res.json());
    ledger.record(amountMinor);
    emit({ agentId, phase: 'settled', amount, asset: 'USDC', network, payTo, txRef: res.txRef });
    emit({ agentId, tool: 'search', phase: 'ok' });
    return { results: hits };
  } catch (err) {
    // The buyer throws wallet_not_configured when fund-later has not yet happened.
    const code =
      err instanceof Error && err.message === 'wallet_not_configured'
        ? 'connector_payment_required'
        : 'connector_http_error';
    emit({ agentId, tool: 'search', phase: 'error', code });
    return { results: cannedOrEmpty(canned, agentId, emit) };
  }
}

function parseHits(body: unknown): SearchHit[] {
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  return results
    .slice(0, 5)
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        title: typeof o.title === 'string' ? o.title : '',
        url: typeof o.url === 'string' ? o.url : '',
        content: typeof o.content === 'string' ? o.content : '',
      };
    });
}

// Falling back to canned hits still reads as success (tool 'ok') so the demo continues.
function cannedOrEmpty(
  canned: SearchHit[] | undefined,
  agentId: string,
  emit: (e: ToolEvent | PaymentEvent) => void,
): SearchHit[] {
  if (canned && canned.length > 0) {
    emit({ agentId, tool: 'search', phase: 'ok' });
    return canned;
  }
  return [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @crash/engine exec vitest run test/connectors/paidSearch.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/connectors/paidSearch.ts backend/test/connectors/paidSearch.test.ts
git commit -F - <<'MSG'
feat(connectors): fused paid Tavily search over the x402 buyer

runPaidSearch is the fuse: one call gates the cap, then performs a Tavily
search THROUGH makePaidFetch so a single round-trip is both the USDC
micropayment and the web search. Emits payment.activity required/signing/
settled around tool.activity start/ok; on cap-exceeded, no-wallet, or a
non-ok response it falls back to canned hits (still reads as 'ok') and never
settles or invents a txRef. Reuses SearchHit/ToolEvent + PaymentEvent/
formatUsdc; the bearer is attached only when a Tavily key is present.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG
```

---

### Task 3: Engine wiring + config seam (`research.ts`, `session.ts`, `server.ts`)

**Files:**
- Create: `backend/src/socket/research.ts`
- Modify: `backend/src/socket/session.ts` (imports; `SessionOptions`; constructor; `makePaidFetch` stub; `request.submit` case; add `runResearch`)
- Modify: `backend/src/socket/server.ts` (env -> `new Session(...)`)
- Test: `backend/test/socket/research-wiring.test.ts`

- [ ] **Step 1: Create the pure helpers file**

Create `backend/src/socket/research.ts`:

```ts
// backend/src/socket/research.ts
//
// Pure helpers + constants for the research-agent run. Kept out of session.ts so the Session
// class stays transport-focused; these are unit-testable in isolation.

import type { SearchHit } from '../connectors/search.js';
import type { Citation } from '@crash/protocol';

export const RESEARCH_AGENT_ID = 'research-agent';
export const RESEARCH_COST_MINOR = 50000; // 0.05 USDC per run
export const BASE_SEPOLIA = 'eip155:84532';
export const TAVILY_BASE_URL = 'https://api.tavily.com';

export const RESEARCH_CANNED_HITS: SearchHit[] = [
  {
    title: 'x402 + Tavily (offline brief)',
    url: 'https://x402.org',
    content:
      'Live search was unavailable, so this is a canned brief. With a funded Base Sepolia wallet and the Tavily x402 endpoint configured, this run pays a USDC micropayment and returns live cited results.',
  },
];

/** Is this the connector-backed research agent (vs the default RAG flow)? */
export function isResearchAgent(agentId: string | undefined): boolean {
  return agentId === RESEARCH_AGENT_ID;
}

export function briefFromHits(query: string, hits: SearchHit[]): string {
  if (hits.length === 0) return `No web results were found for "${query}".`;
  const lines = hits.slice(0, 5).map((h, i) => `${i + 1}. ${h.title} -- ${h.url}`);
  return `Research brief for "${query}":\n${lines.join('\n')}`;
}

export function citationsFromHits(hits: SearchHit[]): Citation[] {
  // Citation = { source, snippet }; there is NO url field -> the URL lives in `answer`.
  return hits.slice(0, 5).map((h) => ({ source: h.title || h.url, snippet: h.content.slice(0, 280) }));
}
```

- [ ] **Step 2: Write the failing wiring test**

Create `backend/test/socket/research-wiring.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { makeMessage } from '@crash/protocol';
import { Session } from '../../src/socket/session.js';
import { DeterministicProvider } from '../../src/agent/deterministic.js';
import { ensureWorkspace, resolveWorkspace } from '../../src/workspace/paths.js';

// No tavilyX402Url and no tavily key -> tier 3 canned brief: fully deterministic + offline.
function makeTestSession(onMsg: (m: any) => void) {
  const workspace = ensureWorkspace(resolveWorkspace(path.join(os.tmpdir(), 'crash-research-wiring-test')));
  return new Session({
    sessionId: 'sess_research',
    provider: new DeterministicProvider('claude-code'),
    workspace,
    engineVersion: '0.1.0',
    send: (raw) => onMsg(JSON.parse(raw)),
  });
}

describe('research-agent wiring', () => {
  it('request.submit agentId=research-agent routes to runResearch and emits a cited result.final', async () => {
    const frames: any[] = [];
    const session = makeTestSession((m) => frames.push(m));
    await session.handleRaw(
      JSON.stringify(makeMessage('request.submit', session.id, 1, { requestId: 'r1', text: 'find x402 docs', agentId: 'research-agent' })),
    );
    const final = frames.find((f) => f.type === 'result.final');
    expect(final).toBeDefined();
    expect(final.payload.requestId).toBe('r1');
    expect(typeof final.payload.answer).toBe('string');
    expect(Array.isArray(final.payload.citations)).toBe(true);
    expect(frames.some((f) => f.type === 'tool.activity')).toBe(true);
  });

  it('request.submit with no agentId does NOT take the research path', async () => {
    const frames: any[] = [];
    const session = makeTestSession((m) => frames.push(m));
    await session.handleRaw(
      JSON.stringify(makeMessage('request.submit', session.id, 1, { requestId: 'r2', text: 'hello' })),
    );
    // runResearch is awaited (its frames would be present); default orch.submit is fire-and-forget.
    expect(frames.some((f) => f.type === 'result.final')).toBe(false);
    expect(frames.some((f) => f.type === 'tool.activity')).toBe(false);
  });

  it('every frame the research run emits is a valid engine->renderer frame', async () => {
    const frames: any[] = [];
    const session = makeTestSession((m) => frames.push(m));
    await session.handleRaw(
      JSON.stringify(makeMessage('request.submit', session.id, 1, { requestId: 'r3', text: 'q', agentId: 'research-agent' })),
    );
    // The send sink only receives frames that already passed the egress safeParse.
    expect(frames.length).toBeGreaterThan(0);
    for (const f of frames) expect(typeof f.type).toBe('string');
  });
});
```

- [ ] **Step 3: Run the wiring test to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/socket/research-wiring.test.ts`
Expected: FAIL -- `agentId=research-agent` currently routes to `orch.submit` (no `result.final`/`tool.activity` synchronously); first test fails.

- [ ] **Step 4: Add imports to `session.ts`**

In `backend/src/socket/session.ts`, add to the import block (after the existing connector/payment imports):

```ts
import { makePaidFetch as createPaidFetch } from '../payments/buyer.js';
import { runPaidSearch } from '../connectors/paidSearch.js';
import { runSearch, type SearchHit, type ToolEvent } from '../connectors/search.js';
import type { PaymentEvent } from '../payments/x402.js';
import {
  RESEARCH_AGENT_ID,
  RESEARCH_COST_MINOR,
  BASE_SEPOLIA,
  TAVILY_BASE_URL,
  RESEARCH_CANNED_HITS,
  isResearchAgent,
  briefFromHits,
  citationsFromHits,
} from './research.js';
```

(If `runSearch`/`SearchHit`/`ToolEvent` are already imported from `../connectors/search.js`, merge rather than duplicate the import.)

- [ ] **Step 5: Extend `SessionOptions` and store the config**

In the `SessionOptions` interface, add two fields:

```ts
  tavilyX402Url?: string; // Tavily x402 endpoint URL (non-secret; env CRASH_TAVILY_X402_URL)
  sellerUrl?: string;     // x402 resource URL for marketplace.purchase (env CRASH_X402_SELLER_URL)
```

In the class field declarations add:

```ts
  private readonly tavilyX402Url?: string;
  private readonly sellerUrl?: string;
```

In the constructor, alongside the existing `this.caps = ...` / `this.keystore = ...` assignments:

```ts
    this.tavilyX402Url = opts.tavilyX402Url;
    this.sellerUrl = opts.sellerUrl;
```

- [ ] **Step 6: Replace the `makePaidFetch` stub**

Replace the existing stub:

```ts
  private makePaidFetch(_listingId: string) {
    return async (): Promise<{ ok: boolean; headers: { get(k: string): string | null } }> => {
      const walletKey = this.keystore.get('x402.wallet');
      if (!walletKey) throw new Error('wallet_not_configured');
      throw new Error('x402_client_not_wired');
    };
  }
```

with the buyer-backed adapter (same zero-arg `{ ok, headers }` contract `purchase()` expects):

```ts
  private makePaidFetch(_listingId: string) {
    // Build the real x402 buyer once; it late-binds the wallet key at call time. With no wallet
    // or no configured seller URL it still fails closed with a synthetic code -- same observable
    // behavior as the old hard-coded throw, minus the throw.
    const buyer = createPaidFetch({ walletKeyProvider: () => this.keystore.get('x402.wallet') });
    const sellerUrl = this.sellerUrl;
    return async (): Promise<{ ok: boolean; headers: { get(k: string): string | null } }> => {
      if (!sellerUrl) throw new Error('seller_url_not_configured');
      const r = await buyer(sellerUrl, { method: 'GET' });
      return { ok: r.ok, headers: r.headers };
    };
  }
```

- [ ] **Step 7: Branch the `request.submit` case**

Replace:

```ts
      case 'request.submit':
        this.orch.submit(m.payload);
        break;
```

with:

```ts
      case 'request.submit':
        if (isResearchAgent(m.payload.agentId)) {
          await this.runResearch(m.payload);
        } else {
          this.orch.submit(m.payload);
        }
        break;
```

(`handleRaw` is already `async`; if the switch is not inside an `async` method, confirm it is before adding `await`.)

- [ ] **Step 8: Add the `runResearch` method**

Add as a private method on `Session` (near the `marketplace.purchase` handler):

```ts
  private async runResearch(payload: { requestId: string; text: string; agentId?: string }): Promise<void> {
    const agentId = payload.agentId ?? RESEARCH_AGENT_ID;
    const finalize = (hits: SearchHit[]) =>
      this.emit('result.final', {
        requestId: payload.requestId,
        answer: briefFromHits(payload.text, hits),
        citations: citationsFromHits(hits),
      });

    // Tier 3: no paid endpoint -> plain Bearer search if a Tavily key exists, else canned brief.
    if (!this.tavilyX402Url) {
      const tavilyKey = this.keystore.get('tavily');
      if (tavilyKey) {
        const r = await runSearch({
          agentId,
          query: payload.text,
          apiKey: tavilyKey,
          baseUrl: TAVILY_BASE_URL,
          emit: (e: ToolEvent) => this.emit('tool.activity', e),
          canned: RESEARCH_CANNED_HITS,
        });
        return finalize(r.results);
      }
      this.emit('tool.activity', { agentId, tool: 'search', phase: 'ok' });
      return finalize(RESEARCH_CANNED_HITS);
    }

    // Tier 1/2: paid path. The buyer fails closed at signing if x402.wallet is absent.
    const buyer = createPaidFetch({ walletKeyProvider: () => this.keystore.get('x402.wallet') });
    const r = await runPaidSearch({
      agentId,
      query: payload.text,
      endpoint: this.tavilyX402Url,
      paidFetch: buyer,
      ledger: {
        canSpend: (m: number) => this.caps.canSpend(agentId, m),
        record: (m: number) => this.caps.record(agentId, m),
      },
      amountMinor: RESEARCH_COST_MINOR,
      network: BASE_SEPOLIA,
      tavilyKey: this.keystore.get('tavily') ?? undefined,
      emit: (e: ToolEvent | PaymentEvent) => {
        if ('tool' in e) this.emit('tool.activity', e);
        else this.emit('payment.activity', e);
      },
      canned: RESEARCH_CANNED_HITS,
    });
    return finalize(r.results);
  }
```

- [ ] **Step 9: Wire the config env in `server.ts`**

In `backend/src/socket/server.ts`, in the `new Session({ ... })` object (currently ending with the `send:` callback), add two fields after `send`:

```ts
          send: (s) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(s);
          },
          tavilyX402Url: process.env.CRASH_TAVILY_X402_URL,
          sellerUrl: process.env.CRASH_X402_SELLER_URL,
```

- [ ] **Step 10: Run the wiring test to verify it passes**

Run: `pnpm --filter @crash/engine exec vitest run test/socket/research-wiring.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 11: Run the full engine suite (no regressions)**

Run: `pnpm --filter @crash/engine run test:run`
Expected: PASS -- all prior tests (incl. `marketplace-wiring.test.ts`, `x402.test.ts`) still green; the `makePaidFetch` change is unreached by the over-cap purchase test (it denies before calling paidFetch).

- [ ] **Step 12: Commit**

```bash
git add backend/src/socket/research.ts backend/src/socket/session.ts backend/src/socket/server.ts backend/test/socket/research-wiring.test.ts
git commit -F - <<'MSG'
feat(engine): route research-agent submit -> runResearch; real makePaidFetch

request.submit { agentId:'research-agent' } now routes to a runResearch
sibling of the marketplace.purchase handler (the RAG Orchestrator is left
untouched). runResearch runs the degradation ladder: tier 1/2 pays Tavily
through the x402 buyer (cap-gated, fund-later), tier 3 falls back to a plain
Bearer search or a canned brief. The x402_client_not_wired stub is replaced
by the buyer adapter (late-bind wallet; synthetic fail-closed). Config
(tavilyX402Url, sellerUrl) is env-sourced into SessionOptions and read late.
result.final uses the contract's `answer` + {source,snippet} citations.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG
```

---

### Task 4: Comment fix + net-layer agentId

**Files:**
- Modify: `backend/src/payments/x402.ts` (comment at ~line 33)
- Modify: `frontend/r3f-shell/src/net/CrashSocket.ts` (`submitRequest`)

- [ ] **Step 1: Correct the stale x402.ts comment**

Read `backend/src/payments/x402.ts` lines 28-36. Change the comment referencing `@x402/fetch` to `@x402/core/client` (the buyer client actually used). Example:

```ts
// Buyer settlement is performed by the x402 client from @x402/core/client (see buyer.ts);
```

- [ ] **Step 2: Add the optional `agentId` param to `submitRequest`**

Replace:

```ts
  submitRequest(text: string, targetPath?: string): string {
    const requestId = this.idFactory();
    this.send(
      'request.submit',
      targetPath ? { requestId, text, targetPath } : { requestId, text },
    );
    return requestId;
  }
```

with (backward-compatible third positional param; existing 1-2 arg callers unaffected):

```ts
  submitRequest(text: string, targetPath?: string, agentId?: string): string {
    const requestId = this.idFactory();
    const payload: Record<string, unknown> = { requestId, text };
    if (targetPath) payload.targetPath = targetPath;
    if (agentId) payload.agentId = agentId;
    this.send('request.submit', payload);
    return requestId;
  }
```

- [ ] **Step 3: Typecheck the frontend**

Run: `pnpm --filter @crash/r3f-shell run typecheck` (or the frontend package's typecheck script; confirm the package name from `frontend/r3f-shell/package.json`).
Expected: PASS. (No component touched -> no caller breakage.)

- [ ] **Step 4: Commit (two atomic commits)**

```bash
git add backend/src/payments/x402.ts
git commit -F - <<'MSG'
fix(payments): correct stale @x402/fetch comment to @x402/core/client

@x402/fetch is not a dependency; the buyer settles via @x402/core/client
(see buyer.ts). Comment-only.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG
git add frontend/r3f-shell/src/net/CrashSocket.ts
git commit -F - <<'MSG'
feat(net): CrashSocket.submitRequest forwards an optional agentId

Adds agentId as an optional third positional param so the renderer can
trigger a specific marketplace agent (e.g. research-agent) via the existing
request.submit frame. Backward-compatible: 1-2 arg callers are unchanged, so
no component is touched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG
```

---

### Task 5: Stress tests + full gate + push

**Files:**
- Test: `backend/test/payments/paid-search-stress.test.ts`

- [ ] **Step 1: Write the stress test**

Create `backend/test/payments/paid-search-stress.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { runPaidSearch } from '../../src/connectors/paidSearch.js';
import { CapLedger } from '../../src/payments/caps.js';
import { makeMessage, PaymentActivitySchema } from '@crash/protocol';

const base = { agentId: 'research-agent', query: 'q', endpoint: 'https://e', network: 'eip155:84532', amountMinor: 50000 };
function paidOk() {
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ results: [] }), txRef: '0xT' } as any;
}

describe('paid search stress', () => {
  it('stops spending at the cap boundary across repeated runs', async () => {
    // cap 120000 fits exactly 2 runs (2*50000=100000; a 3rd would need 150000 > 120000).
    const ledger = new CapLedger({ 'research-agent': 120000 });
    const view = {
      canSpend: (m: number) => ledger.canSpend('research-agent', m),
      record: (m: number) => ledger.record('research-agent', m),
    };
    const paidFetch = vi.fn(async () => paidOk());
    let settled = 0;
    for (let i = 0; i < 4; i++) {
      await runPaidSearch({
        ...base,
        paidFetch,
        ledger: view,
        emit: (e: any) => { if ('asset' in e && e.phase === 'settled') settled++; },
        canned: [],
      });
    }
    expect(settled).toBe(2);
    expect(ledger.snapshot()[0].spentMinor).toBe(100000);
  });

  it('PaymentActivitySchema strips an unknown key (egress safety)', () => {
    const dirty = {
      agentId: 'research-agent', phase: 'settled', amount: '0.05', asset: 'USDC',
      network: 'eip155:84532', txRef: '0xT', SECRET: 'leak',
    };
    const parsed = PaymentActivitySchema.safeParse(makeMessage('payment.activity', 's', 0, dirty));
    expect(parsed.success).toBe(true);
    expect((parsed as any).data.payload.SECRET).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the stress test**

Run: `pnpm --filter @crash/engine exec vitest run test/payments/paid-search-stress.test.ts`
Expected: PASS (2 tests). If `settled` !== 2, the cap predicate differs from `spent + amount <= cap`; adjust the cap constant to disambiguate, do not weaken the assertion.

- [ ] **Step 3: Commit the stress test**

```bash
git add backend/test/payments/paid-search-stress.test.ts
git commit -F - <<'MSG'
test(payments): paid-search cap-accumulation + egress-strip stress

Proves repeated paid searches accumulate the real CapLedger and stop at the
boundary (no overspend past the cap), and that PaymentActivitySchema strips
an unknown key so a coding mistake cannot leak an extra field on the wire.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
MSG
```

- [ ] **Step 4: Format the new/changed files**

Run (repo root): `pnpm exec prettier --write backend/src/payments/buyer.ts backend/src/connectors/paidSearch.ts backend/src/socket/research.ts backend/src/socket/session.ts backend/src/socket/server.ts backend/src/payments/x402.ts frontend/r3f-shell/src/net/CrashSocket.ts "backend/test/payments/buyer.test.ts" "backend/test/connectors/paidSearch.test.ts" "backend/test/socket/research-wiring.test.ts" "backend/test/payments/paid-search-stress.test.ts"`
Then if anything changed: `git add -p` the formatting only and commit `chore(format): prettier-write x402 fuse files`.

- [ ] **Step 5: Full gate from repo root**

Run, in order, and require each to pass:
- `pnpm -r run typecheck`
- `pnpm -r run lint` (skip only if no package defines a `lint` script)
- `pnpm -r run test:run`
- `pnpm --filter @crash/marketplace-server run test`
- `pnpm -r run build`
- `pnpm exec prettier --check backend/src/payments/buyer.ts backend/src/connectors/paidSearch.ts backend/src/socket/research.ts`

Expected: all PASS. Self-heal any NodeNext `.js`-extension or format failures and re-run (log root cause + fix to the session-log).

- [ ] **Step 6: Push to origin**

```bash
git push
git status -sb   # confirm 'feat/agentic-marketplace-design' is in sync with origin/...
```

Branch-first (already on `feat/agentic-marketplace-design`). No force-push / main-push. NEVER push a secret -- the wallet key and Tavily key are operator-supplied at runtime, never committed.

---

## Self-Review

**1. Spec coverage** (every spec section -> a task):
- 5.1 buyer.ts -> Task 1 (with the documented `network`/`facilitatorUrl` drop + `httpClientFactory` seam).
- 5.2 paidSearch.ts -> Task 2.
- 5.3 session.ts (makePaidFetch real + agentId branch + runResearch) -> Task 3 (steps 4-8).
- 5.4 config seam (`tavilyX402Url`, `sellerUrl`, env) -> Task 3 (steps 5, 9).
- 5.5 CrashSocket one line -> Task 4 (step 2).
- 5.6 x402.ts:33 comment -> Task 4 (step 1).
- 6 degradation ladder (tiers 1/2/3) -> `runResearch` branch (Task 3 step 8) + buyer fail-closed (Task 1) + paidSearch canned (Task 2).
- 7 security (synthetic codes, egress strip, cap-before-sign, fail-closed, key never logged) -> buyer/paidSearch impls + the egress-strip stress (Task 5 step 1) + schema-validation test (Task 2).
- 8 testing/stress -> every task's TDD steps + Task 5.
- viem prerequisite -> Task 0.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to". Every code step shows complete code; every run step shows the exact command + expected result. The only intentionally-deferred items are operator-supplied runtime config (the funded wallet key, the exact Tavily x402 URL), which the spec (sec 9) defines as non-blocking and which the late-bind design absorbs with zero code change.

**3. Type consistency:**
- `makePaidFetch` returns `(url, init?) => Promise<PaidFetchResult>` everywhere (buyer.ts, paidSearch `PaidSearchArgs.paidFetch`, session `runResearch`).
- `X402HttpClientLike` methods (`getPaymentRequiredResponse`/`createPaymentPayload`/`encodePaymentSignatureHeader`) match the fake in the test and the real `x402HTTPClient`.
- `CapView` (`canSpend(minor)`/`record(minor)`) is the narrowed shape used in paidSearch args, session `runResearch`, and both test fakes -- distinct from the real `CapLedger.canSpend(id, minor)` which `runResearch` binds.
- Emitted shapes match `protocol/src/events.ts`: `tool.activity {agentId,tool,phase,code?}`, `payment.activity {agentId,phase,amount,asset:'USDC',network,payTo?,txRef?}`, `result.final {requestId,answer,citations?}`, `Citation {source,snippet}`.
- `formatUsdc`, `SearchHit`, `ToolEvent`, `PaymentEvent`, `runSearch`, `CapLedger` imported from their real modules (`x402.ts`, `search.ts`, `caps.ts`).
- `isResearchAgent`/`RESEARCH_*`/`briefFromHits`/`citationsFromHits` defined in `research.ts`, imported in `session.ts` and used consistently.

No gaps found.

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-06-02-crash-tavily-x402-fuse.md`. Per the operator's velocity directive ("finish rapidly then I'll stress test" + "stress test before I do as well"), execution proceeds INLINE (superpowers:executing-plans) in this session, task-by-task with the gate chain run before handing over a green build and the Claude-side stress results.
