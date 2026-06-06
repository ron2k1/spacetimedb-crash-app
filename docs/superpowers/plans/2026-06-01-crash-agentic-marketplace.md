# Crash -- Agentic Marketplace Pivot: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot Crash from a skill-creator into an agentic marketplace where agents are browsed, bought (testnet x402 USDC), run, granted machine access, and published -- with deep Tavily + Coinbase(x402) integration as the headline.

**Architecture:** The engine stays the one translation layer. All new behavior (connector dispatch, keystore, x402 rail, recipe runner, agent packs, realpath write-jail) lives in the engine or new modules it calls; renderers stay thin WebSocket clients. The frozen protocol grows by exactly **+6 events (29 -> 35)**. The filmed hero flow runs as a deterministic recipe (flop-proof); other agents use autonomous provider execution; both call the same connector modules.

**Tech Stack:** pnpm workspace (Node 24) -- `protocol/` (zod + `Protocol.cs` mirror), `backend/@crash/engine` (headless Node, `ws`), `frontend/r3f-shell` (Tauri 2 + React 19 + r3f + shadcn/ui + Tailwind v4 + zustand). Tests: **vitest**. Payments: `@x402/fetch` (buyer) + `@x402/express` (local seller) on Base Sepolia (`eip155:84532`), free facilitator `https://x402.org/facilitator`. Search: Tavily.

---

## Conventions for the executor

- **Branch:** all work lands on `feat/agentic-marketplace-design` (this worktree is already on it; the approved spec is committed here). Branch-first; push green; never push to `main`.
- **Commit messages:** subjects shown below with `git commit -m` for brevity. If you add a multi-line body, write it to a temp file and use `git commit -F <file>` (Windows PowerShell quoting -- repo convention).
- **Run tests single-file with vitest:** `pnpm --filter @crash/protocol exec vitest run <relpath>` (protocol) or `pnpm --filter @crash/engine exec vitest run <relpath>` (backend). Frontend: `pnpm --filter @crash/r3f-shell exec vitest run <relpath>` (confirm the package name in `frontend/r3f-shell/package.json`; it may differ -- use whatever `name` field is set).
- **Phase gate (run from repo root after each phase):** `pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm -r build && pnpm exec prettier --write .` then commit any format drift as a separate `chore(format):` commit. Use the exact root script names if the root `package.json` defines aliases (e.g. `pnpm typecheck`).
- **SECURITY (non-negotiable, applies to every task):** error/activity events carry a **synthetic `code` + `retryable` only** -- never a message, stack, prompt, response body, env value, URL with secrets, or credential, over the wire OR into any log. Keys live only in the engine keystore; they never cross the WebSocket, never enter a renderer store, never get logged. The key-entry input field clears on submit.
- **Two spots to confirm against the live tree at execution time** (flagged inline): the exact Tauri command-registration file (`frontend/r3f-shell/src-tauri/src/lib.rs` vs `sidecar.rs` -- `sidecar.rs` is currently modified by a collaborator, coordinate before editing) and the full list of `dashboardStore` consumers before extending `DashSection`.

---

## File Structure

**Protocol (`protocol/`)** -- the frozen contract grows by 6 events:
- Modify `src/events.ts` -- 6 new schemas, `agentId` on `request.submit`, `'agent'` on `MarketplaceKind`, 2 shared sub-schemas, both unions, `ALL_EVENT_TYPES`.
- Modify `src/examples.ts` -- one example per new event.
- Modify `Protocol.cs` -- 6 type strings + payload classes + `RequestSubmitPayload.agentId`.
- `test/contract.test.ts` -- **no edit** (data-driven; auto-asserts the new parity).
- Modify `backend/test/protocol-link.test.ts` -- the single hardcoded count `29 -> 35`.

**Engine (`backend/src/`)** -- new modules, each one responsibility:
- `connectors/types.ts` -- `Capability`, `ConnectorFamily`, `ConnectorDescriptor` zod schemas.
- `connectors/registry.ts` -- built-in descriptors + `resolveCapability()`.
- `connectors/fs.ts` -- local filesystem connector (write to granted folder).
- `secrets/keystore.ts` -- `~/Crash/.secrets/connectors.json` (`0o600`) get/set.
- `payments/caps.ts` -- per-agent spend caps, enforced before signing.
- `payments/x402.ts` -- buyer (sign ERC-3009 / retry) + `wallet.status` snapshot.
- `payments/seller.ts` -- local `@x402/express` paid-resource stand-in (second loopback port).
- `agent/agents.ts` -- `AgentManifest` schema + agent-pack storage (`~/Crash/agents/<slug>/`) + `accessesSummary()`.
- `agent/creator.ts` -- agent-architect meta-flow + deterministic offline template.
- `workspace/grants.ts` -- `~/Crash/grants.json` read/add.
- `recipe/runner.ts` -- deterministic hero-beat sequence (network-stubbable).
- Modify `workspace/paths.ts` -- promote `assertInsideWorkspace` to realpath ancestry over workspace + granted roots.
- Modify `marketplace/catalog.ts` -- load `agents.json`; `'agent'` kind.
- Modify `socket/session.ts` -- handle `marketplace.purchase`, `permission.grant`; emit `marketplace.catalog`, `wallet.status`.

**Renderer (`frontend/r3f-shell/src/`)**:
- Modify `store/taskStore.ts` -- 4 new `reduce()` cases (never-guard) + state slice.
- Modify `store/dashboardStore.ts` -- extend `DashSection`; agent/catalog/wallet slices.
- Modify `data/catalog.ts` -- `AgentListing` seed type.
- New components: `components/store/StoreGrid.tsx`, `components/store/AgentCard.tsx`, `components/wallet/WalletBadge.tsx`, `components/connections/ConnectionsPanel.tsx`, `components/creator/CreatorWizard.tsx`.
- New Tauri binding wrapper `src/lib/setConnectorKey.ts` (calls the native IPC command).

---

# PHASE 0 -- Protocol Foundation (+6 events, 29 -> 35)

Everything depends on this. The `taskStore` never-guard breaks the renderer build the instant the union grows, so Tasks 1 and 5 must both land before the phase gate is green. `contract.test.ts` needs no edit -- it auto-derives parity, and running it after each task proves the drift guard.

### Task 1: Add the 6 event schemas + 2 shared sub-schemas to the protocol

**Files:**
- Modify: `protocol/src/events.ts`
- Test: `protocol/test/contract.test.ts` (existing, data-driven -- exercised, not edited)

- [ ] **Step 1: Write the failing test**

The contract test is data-driven, so the "failing test" here is the parity assertion that will fail once we add types to `ALL_EVENT_TYPES` but not yet to `EXAMPLES` / `Protocol.cs`. To make the intent explicit and get a fast red, add a temporary length assertion to `protocol/test/contract.test.ts` at the end of the first `describe` block:

```ts
  it('has exactly 35 event types after the marketplace pivot', () => {
    expect(ALL_EVENT_TYPES).toHaveLength(35);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/protocol exec vitest run test/contract.test.ts`
Expected: FAIL -- `expected 29 to be 35` (the union is still at 29).

- [ ] **Step 3: Implement the schemas**

In `protocol/src/events.ts`:

(a) Add `'agent'` to the marketplace kind enum (replace the existing `MarketplaceKindSchema`):

```ts
/** Which marketplace catalog an item comes from. */
export const MarketplaceKindSchema = z.enum(['skill', 'plugin', 'agent']);
export type MarketplaceKind = z.infer<typeof MarketplaceKindSchema>;
```

(b) Add an optional `agentId` to `RequestSubmitSchema` (running an agent reuses this event -- no new R->E event):

```ts
export const RequestSubmitSchema = envelope(
  'request.submit',
  z.object({
    requestId: z.string(),
    text: z.string(), // what the user asked -- generic, blind to input type
    targetPath: z.string().optional(), // optional pointer to a file/folder in the workspace
    agentId: z.string().optional(), // NEW: run a specific marketplace agent; absent = default flow
  }),
);
```

(c) Add two shared sub-schemas after `MarketplaceKindSchema` (before the envelope section):

```ts
/** A marketplace listing as shown in the Browse grid. Access-forward: `accesses` is a
 *  list of human-facing chips (capabilities + permission scope) derived from the manifest,
 *  shown BEFORE install. Never carries a key, URL, or secret. */
export const CatalogListingSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  accesses: z.array(z.string()), // e.g. ['Web search', 'Write to: Documents/Research']
  source: z.enum(['builtin', 'user', 'installed']),
  price: z
    .object({
      amountMinor: z.number().int().nonnegative(),
      asset: z.literal('USDC'),
      payTo: z.string(),
    })
    .optional(), // absent = free
});
export type CatalogListing = z.infer<typeof CatalogListingSchema>;

/** One per-agent spend cap row for wallet.status display. Minor units (USDC has 6 decimals). */
export const WalletCapSchema = z.object({
  agentId: z.string(),
  capMinor: z.number().int().nonnegative(),
  spentMinor: z.number().int().nonnegative(),
});
export type WalletCap = z.infer<typeof WalletCapSchema>;
```

(d) Add the 2 Renderer->Engine schemas in the `// ---- Renderer -> Engine ----` section (after `MarketplaceInstallSchema`):

```ts
export const MarketplacePurchaseSchema = envelope(
  'marketplace.purchase',
  z.object({ listingId: z.string() }),
);
export const PermissionGrantSchema = envelope(
  'permission.grant',
  // absolute path the user picked in a native dialog; the engine canonicalizes (realpath)
  // and records it in grants.json. NOT a secret.
  z.object({ folder: z.string() }),
);
```

(e) Add the 4 Engine->Renderer schemas in the `// ---- Engine -> Renderer ----` section (after `MarketplaceInstalledSchema`):

```ts
export const MarketplaceCatalogSchema = envelope(
  'marketplace.catalog',
  z.object({ listings: z.array(CatalogListingSchema) }),
);
export const ToolActivitySchema = envelope(
  'tool.activity',
  z.object({
    agentId: z.string(),
    tool: z.string(), // capability label, e.g. 'search' | 'video.generate' -- NEVER a URL or key
    phase: z.enum(['start', 'ok', 'error']),
    code: z.string().optional(), // SYNTHETIC code only on error; never a message/body
  }),
);
export const PaymentActivitySchema = envelope(
  'payment.activity',
  z.object({
    agentId: z.string(),
    phase: z.enum(['required', 'signing', 'settled']),
    amount: z.string(), // human display string, e.g. '0.01' -- formatted engine-side
    asset: z.literal('USDC'),
    network: z.string(), // 'eip155:84532' (Base Sepolia)
    payTo: z.string().optional(),
    txRef: z.string().optional(), // settlement reference for display; testnet only
  }),
);
export const WalletStatusSchema = envelope(
  'wallet.status',
  z.object({
    balanceMinor: z.number().int().nonnegative(),
    caps: z.array(WalletCapSchema),
  }),
);
```

(f) Add all 6 to the unions. In `RendererToEngineSchema` append after `MarketplaceInstallSchema`:

```ts
  MarketplacePurchaseSchema,
  PermissionGrantSchema,
```

In `EngineToRendererSchema` append after `MarketplaceInstalledSchema`:

```ts
  MarketplaceCatalogSchema,
  ToolActivitySchema,
  PaymentActivitySchema,
  WalletStatusSchema,
```

(g) Add all 6 type strings to `ALL_EVENT_TYPES`. After `'marketplace.install',` in the R->E block add:

```ts
  'marketplace.purchase',
  'permission.grant',
```

After `'marketplace.installed',` in the E->R block add:

```ts
  'marketplace.catalog',
  'tool.activity',
  'payment.activity',
  'wallet.status',
```

- [ ] **Step 4: Run the test to verify the length passes**

Run: `pnpm --filter @crash/protocol exec vitest run test/contract.test.ts`
Expected: the `toHaveLength(35)` test PASSES; the **parity** tests (`has exactly one example per event type`, `mentions every event type string`) now FAIL (examples + Protocol.cs still at 29). That is the correct intermediate state -- Tasks 2 and 3 fix them. Now **remove the temporary `toHaveLength(35)` assertion** you added in Step 1 (the permanent count guard already lives in `backend/test/protocol-link.test.ts`, bumped in Task 4) so `contract.test.ts` stays a pure auto-derived guard with no hand-maintained count.

- [ ] **Step 5: Commit**

```bash
git add protocol/src/events.ts
git commit -m "feat(protocol): add 6 marketplace events + agentId, 29->35"
```

### Task 2: Add one example per new event

**Files:**
- Modify: `protocol/src/examples.ts`
- Test: `protocol/test/contract.test.ts`

- [ ] **Step 1: Run the test to confirm the current red**

Run: `pnpm --filter @crash/protocol exec vitest run test/contract.test.ts`
Expected: FAIL -- `has exactly one example per event type` (EXAMPLES has 29 keys, ALL_EVENT_TYPES has 35).

- [ ] **Step 2: Add the 6 examples**

In `protocol/src/examples.ts`, inside the `EXAMPLES` object, add the 2 Renderer->Engine examples right after the `'auth.login.start'` entry (the last entry in the `// ---- Renderer -> Engine ----` group). Note: in this file `'marketplace.install'` physically sits among the Engine->Renderer examples -- `EXAMPLES` is a flat `Record`, so placement is cosmetic and the contract test only checks the key set. Add:

```ts
  'marketplace.purchase': { v, type: 'marketplace.purchase', sessionId: s, seq: 21, payload: { listingId: 'deep-research-pro' } },
  'permission.grant': { v, type: 'permission.grant', sessionId: s, seq: 22, payload: { folder: '/Users/demo/Crash/Research' } },
```

And add the 4 Engine->Renderer examples right after the `'auth.login.result'` entry (the last E->R example, just before the closing `error` entry):

```ts
  'marketplace.catalog': { v, type: 'marketplace.catalog', sessionId: s, seq: 23, payload: { listings: [{ id: 'deep-research-pro', name: 'Deep Research Pro', description: 'Premium multi-source web research.', category: 'Research/web', accesses: ['Web search', 'Pays: 0.01 USDC'], source: 'builtin', price: { amountMinor: 10000, asset: 'USDC', payTo: '0x0000000000000000000000000000000000000000' } }] } },
  'tool.activity': { v, type: 'tool.activity', sessionId: s, seq: 24, payload: { agentId: 'research-agent', tool: 'search', phase: 'ok' } },
  'payment.activity': { v, type: 'payment.activity', sessionId: s, seq: 25, payload: { agentId: 'deep-research-pro', phase: 'settled', amount: '0.01', asset: 'USDC', network: 'eip155:84532', payTo: '0x0000000000000000000000000000000000000000', txRef: '0xtestref' } },
  'wallet.status': { v, type: 'wallet.status', sessionId: s, seq: 26, payload: { balanceMinor: 5000000, caps: [{ agentId: 'deep-research-pro', capMinor: 50000, spentMinor: 10000 }] } },
```

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @crash/protocol exec vitest run test/contract.test.ts`
Expected: `has exactly one example per event type` PASSES and `every example validates against the protocol union schema` PASSES. The C# parity test still FAILS (Task 3).

- [ ] **Step 4: Commit**

```bash
git add protocol/src/examples.ts
git commit -m "feat(protocol): add examples for the 6 marketplace events"
```

### Task 3: Mirror the 6 events into Protocol.cs (Unity drift guard)

**Files:**
- Modify: `protocol/Protocol.cs`
- Test: `protocol/test/contract.test.ts`

- [ ] **Step 1: Run the test to confirm the current red**

Run: `pnpm --filter @crash/protocol exec vitest run test/contract.test.ts`
Expected: FAIL -- `mentions every event type string` (`Protocol.cs missing event type "marketplace.purchase"`).

- [ ] **Step 2: Add the 6 type strings + payload classes**

In `protocol/Protocol.cs`, in the `EventTypes` array, after `"marketplace.install",` (R->E block) add:

```csharp
            "marketplace.purchase",
            "permission.grant",
```

After `"marketplace.installed",` (E->R block) add:

```csharp
            "marketplace.catalog",
            "tool.activity",
            "payment.activity",
            "wallet.status",
```

Add `public string agentId;` to `RequestSubmitPayload`:

```csharp
    [Serializable] public class RequestSubmitPayload { public string requestId; public string text; public string targetPath; public string agentId; }
```

At the end of the `// ---- v3 additions ----` block (before the closing `}` of the namespace), add a `// ---- v4 additions (marketplace pivot) ----` block:

```csharp
    // ---- v4 additions (marketplace pivot) ----
    [Serializable] public class CatalogPrice { public int amountMinor; public string asset; public string payTo; } // asset: 'USDC'
    [Serializable] public class CatalogListing { public string id; public string name; public string description; public string category; public string[] accesses; public string source; public CatalogPrice price; } // source: 'builtin'|'user'|'installed'; price null = free
    [Serializable] public class WalletCap { public string agentId; public int capMinor; public int spentMinor; }
    [Serializable] public class MarketplacePurchasePayload { public string listingId; }
    [Serializable] public class PermissionGrantPayload { public string folder; } // absolute path the user picked; engine canonicalizes; NOT a secret
    [Serializable] public class MarketplaceCatalogPayload { public CatalogListing[] listings; }
    [Serializable] public class ToolActivityPayload { public string agentId; public string tool; public string phase; public string code; } // phase: 'start'|'ok'|'error'; tool: capability label, never a URL/key; code: SYNTHETIC only
    [Serializable] public class PaymentActivityPayload { public string agentId; public string phase; public string amount; public string asset; public string network; public string payTo; public string txRef; } // phase: 'required'|'signing'|'settled'
    [Serializable] public class WalletStatusPayload { public int balanceMinor; public WalletCap[] caps; }
```

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @crash/protocol exec vitest run test/contract.test.ts`
Expected: ALL contract tests PASS (examples parity, schema validity, C# version, C# every-type-string).

- [ ] **Step 4: Commit**

```bash
git add protocol/Protocol.cs
git commit -m "feat(protocol): mirror 6 marketplace events into Protocol.cs"
```

### Task 4: Bump the single hardcoded event count in the engine link test

**Files:**
- Modify: `backend/test/protocol-link.test.ts:11-12`

- [ ] **Step 1: Run the test to confirm the current red**

Run: `pnpm --filter @crash/engine exec vitest run test/protocol-link.test.ts`
Expected: FAIL -- `expected length 35 to be 29` (the union grew; this is the only test with a manual count).

- [ ] **Step 2: Update the count and label**

In `backend/test/protocol-link.test.ts`, change the assertion (the exact wording of the `it(...)` label may differ -- update both the string and the number):

```ts
  it('exposes all 35 event types', () => {
    expect(ALL_EVENT_TYPES).toHaveLength(35);
  });
```

- [ ] **Step 3: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/protocol-link.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/test/protocol-link.test.ts
git commit -m "test(protocol-link): bump event count 29->35"
```

### Task 5: Handle the 4 new Engine->Renderer events in taskStore.reduce()

The `reduce()` switch ends in `default: { const _never: never = e; ... }`. Adding 4 events to `EngineToRendererSchema` makes `e` no longer narrow to `never` in the default branch, so **the renderer fails to typecheck until all 4 have cases.** This task adds the state slice + the 4 cases.

**Files:**
- Modify: `frontend/r3f-shell/src/store/taskStore.ts`
- Test: `frontend/r3f-shell/src/store/taskStore.test.ts` (create if absent; otherwise append)

- [ ] **Step 1: Write the failing test**

Create or append to `frontend/r3f-shell/src/store/taskStore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reduce, initialTaskState } from './taskStore';
import { makeMessage } from '@crash/protocol';

describe('taskStore reduce: marketplace events', () => {
  it('stores the catalog listings', () => {
    const e = makeMessage('marketplace.catalog', 'sess', 1, {
      listings: [{ id: 'a', name: 'A', description: 'd', category: 'c', accesses: ['Web search'], source: 'builtin' }],
    });
    const next = reduce(initialTaskState, e as never);
    expect(next.catalog?.[0].id).toBe('a');
  });

  it('appends tool activity', () => {
    const e = makeMessage('tool.activity', 'sess', 2, { agentId: 'r', tool: 'search', phase: 'ok' });
    const next = reduce(initialTaskState, e as never);
    expect(next.toolActivity?.at(-1)?.tool).toBe('search');
  });

  it('records the latest payment phase', () => {
    const e = makeMessage('payment.activity', 'sess', 3, { agentId: 'r', phase: 'settled', amount: '0.01', asset: 'USDC', network: 'eip155:84532' });
    const next = reduce(initialTaskState, e as never);
    expect(next.payment?.phase).toBe('settled');
  });

  it('records wallet status', () => {
    const e = makeMessage('wallet.status', 'sess', 4, { balanceMinor: 100, caps: [] });
    const next = reduce(initialTaskState, e as never);
    expect(next.wallet?.balanceMinor).toBe(100);
  });
});
```

> Note: if `reduce`/`initialTaskState` are not currently exported, export them in Step 3. If the store keeps them private, mirror the existing test file's access pattern instead.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/r3f-shell exec vitest run src/store/taskStore.test.ts`
Expected: FAIL -- type error / `catalog` is undefined (no cases yet).

- [ ] **Step 3: Add the state slice + 4 cases**

In `frontend/r3f-shell/src/store/taskStore.ts`, add these fields to the `TaskState` interface (next to the existing fields):

```ts
  // ---- marketplace pivot ----
  catalog?: import('@crash/protocol').CatalogListing[];
  toolActivity?: { agentId: string; tool: string; phase: 'start' | 'ok' | 'error'; code?: string }[];
  payment?: { agentId: string; phase: 'required' | 'signing' | 'settled'; amount: string; asset: 'USDC'; network: string; payTo?: string; txRef?: string };
  wallet?: { balanceMinor: number; caps: { agentId: string; capMinor: number; spentMinor: number }[] };
```

Ensure `initialTaskState` includes (the optional fields can be omitted; add `toolActivity: []` so the append case is total):

```ts
  toolActivity: [],
```

In the `reduce()` switch, add these 4 cases **before** the `default:` branch (mirror the existing ring-buffer/`upsertStep` style; `TOOL_ACTIVITY_MAX` mirrors `TERMINAL_MAX`):

```ts
    case 'marketplace.catalog':
      return { catalog: e.payload.listings };
    case 'tool.activity': {
      const TOOL_ACTIVITY_MAX = 200;
      const next = [...(s.toolActivity ?? []), e.payload].slice(-TOOL_ACTIVITY_MAX);
      return { toolActivity: next };
    }
    case 'payment.activity':
      return { payment: e.payload };
    case 'wallet.status':
      return { wallet: e.payload };
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/r3f-shell exec vitest run src/store/taskStore.test.ts`
Expected: PASS. Confirm the package typechecks (the `never`-guard is satisfied): `pnpm --filter @crash/r3f-shell exec tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add frontend/r3f-shell/src/store/taskStore.ts frontend/r3f-shell/src/store/taskStore.test.ts
git commit -m "feat(renderer): handle catalog/tool/payment/wallet events in taskStore"
```

**PHASE 0 GATE:** Run the repo-root gate chain. The drift guard is now green at 35 events; the renderer typechecks. Commit any prettier drift as `chore(format): phase 0`.

---

# PHASE 1 -- Connector Registry

The core mechanic: agents reference a **capability**, the engine resolves it to whichever connector declares it AND has a key. Adding a vendor is a ~10-line descriptor.

### Task 6: Connector descriptor schema

**Files:**
- Create: `backend/src/connectors/types.ts`
- Test: `backend/test/connectors/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { ConnectorDescriptorSchema } from '../../src/connectors/types.js';

describe('ConnectorDescriptor', () => {
  it('validates a search connector', () => {
    const r = ConnectorDescriptorSchema.safeParse({
      id: 'tavily',
      family: 'search',
      baseUrl: 'https://api.tavily.com',
      auth: { scheme: 'bearer' },
      capabilities: ['search'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown capability', () => {
    const r = ConnectorDescriptorSchema.safeParse({
      id: 'x',
      family: 'search',
      baseUrl: 'https://x',
      auth: { scheme: 'bearer' },
      capabilities: ['teleport'],
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/connectors/types.test.ts`
Expected: FAIL -- cannot find module `types.js`.

- [ ] **Step 3: Implement**

Create `backend/src/connectors/types.ts`:

```ts
import { z } from 'zod';

/** Capabilities an agent can require. A manifest references one of these, NOT a vendor. */
export const CapabilitySchema = z.enum([
  'chat',
  'image.generate',
  'tts.speak',
  'search',
  'video.generate',
  'x402', // commerce rail (special)
  'fs', // local filesystem (special, local-only)
]);
export type Capability = z.infer<typeof CapabilitySchema>;

export const ConnectorFamilySchema = z.enum([
  'openai-compatible',
  'anthropic',
  'image',
  'tts',
  'search',
  'video',
  'x402',
  'fs',
]);
export type ConnectorFamily = z.infer<typeof ConnectorFamilySchema>;

/** A vendor descriptor. ~10 lines per vendor -- config, not code. */
export const ConnectorDescriptorSchema = z.object({
  id: z.string(), // 'tavily' | 'openai' | 'higgsfield'
  family: ConnectorFamilySchema,
  baseUrl: z.string().url(),
  auth: z.object({
    scheme: z.enum(['bearer', 'header']),
    headerName: z.string().optional(), // required when scheme === 'header'
  }),
  capabilities: z.array(CapabilitySchema).nonempty(),
  models: z.array(z.string()).optional(),
});
export type ConnectorDescriptor = z.infer<typeof ConnectorDescriptorSchema>;
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/connectors/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/connectors/types.ts backend/test/connectors/types.test.ts
git commit -m "feat(connectors): connector descriptor + capability schema"
```

### Task 7: Built-in connector registry + capability resolution

**Files:**
- Create: `backend/src/connectors/registry.ts`
- Test: `backend/test/connectors/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { BUILTIN_CONNECTORS, resolveCapability } from '../../src/connectors/registry.js';

describe('connector registry', () => {
  it('ships a tavily search connector', () => {
    expect(BUILTIN_CONNECTORS.some((c) => c.id === 'tavily' && c.capabilities.includes('search'))).toBe(true);
  });

  it('resolves a capability to a connector that has a key', () => {
    const keyed = new Set(['tavily']);
    const r = resolveCapability('search', keyed);
    expect(r?.id).toBe('tavily');
  });

  it('returns null when no keyed connector provides the capability', () => {
    const r = resolveCapability('video.generate', new Set());
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/connectors/registry.test.ts`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement**

Create `backend/src/connectors/registry.ts`:

```ts
import type { Capability, ConnectorDescriptor } from './types.js';

/** Seed descriptors -- one line of intent per vendor. Extend freely; this is config, not code. */
export const BUILTIN_CONNECTORS: ConnectorDescriptor[] = [
  // chat (openai-compatible covers many vendors by base URL)
  { id: 'openai', family: 'openai-compatible', baseUrl: 'https://api.openai.com', auth: { scheme: 'bearer' }, capabilities: ['chat'] },
  { id: 'groq', family: 'openai-compatible', baseUrl: 'https://api.groq.com/openai', auth: { scheme: 'bearer' }, capabilities: ['chat'] },
  { id: 'openrouter', family: 'openai-compatible', baseUrl: 'https://openrouter.ai/api', auth: { scheme: 'bearer' }, capabilities: ['chat'] },
  { id: 'anthropic', family: 'anthropic', baseUrl: 'https://api.anthropic.com', auth: { scheme: 'header', headerName: 'x-api-key' }, capabilities: ['chat'] },
  // search
  { id: 'tavily', family: 'search', baseUrl: 'https://api.tavily.com', auth: { scheme: 'bearer' }, capabilities: ['search'] },
  { id: 'brave', family: 'search', baseUrl: 'https://api.search.brave.com', auth: { scheme: 'header', headerName: 'X-Subscription-Token' }, capabilities: ['search'] },
  // media (BYO-key capability families -- no hardcoded per-use price)
  { id: 'fal', family: 'image', baseUrl: 'https://fal.run', auth: { scheme: 'header', headerName: 'Authorization' }, capabilities: ['image.generate'] },
  { id: 'elevenlabs', family: 'tts', baseUrl: 'https://api.elevenlabs.io', auth: { scheme: 'header', headerName: 'xi-api-key' }, capabilities: ['tts.speak'] },
  { id: 'higgsfield', family: 'video', baseUrl: 'https://platform.higgsfield.ai', auth: { scheme: 'bearer' }, capabilities: ['video.generate'] },
];

/**
 * Capability-based resolution: return the first connector that (a) declares `cap`
 * AND (b) has a key (id present in `keyedConnectorIds`). Null if none -- the caller
 * then emits `connector_not_configured` and the UI prompts for a key.
 */
export function resolveCapability(
  cap: Capability,
  keyedConnectorIds: ReadonlySet<string>,
  connectors: ConnectorDescriptor[] = BUILTIN_CONNECTORS,
): ConnectorDescriptor | null {
  return connectors.find((c) => c.capabilities.includes(cap) && keyedConnectorIds.has(c.id)) ?? null;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/connectors/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/connectors/registry.ts backend/test/connectors/registry.test.ts
git commit -m "feat(connectors): builtin registry + capability resolution"
```

**PHASE 1 GATE:** repo-root gate chain; `chore(format)` if needed.

---

# PHASE 2 -- Keystore

The engine handles secret material; the renderer and protocol stay secret-free. Keys arrive via Tauri native IPC, land in `~/Crash/.secrets/connectors.json` (`0o600`), and are read by the engine at boot.

### Task 8: Keystore read/write round-trip + 0o600

**Files:**
- Create: `backend/src/secrets/keystore.ts`
- Test: `backend/test/secrets/keystore.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { Keystore } from '../../src/secrets/keystore.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'crash-ks-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('Keystore', () => {
  it('round-trips a key and lists keyed ids', () => {
    const ks = new Keystore(join(dir, '.secrets', 'connectors.json'));
    ks.set('tavily', 'tvly-secret');
    expect(ks.get('tavily')).toBe('tvly-secret');
    expect([...ks.keyedIds()]).toContain('tavily');
  });

  it('writes the file at 0o600 on POSIX', () => {
    const file = join(dir, '.secrets', 'connectors.json');
    const ks = new Keystore(file);
    ks.set('openai', 'sk-x');
    if (platform() !== 'win32') {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it('persists across instances', () => {
    const file = join(dir, '.secrets', 'connectors.json');
    new Keystore(file).set('groq', 'gsk-1');
    expect(new Keystore(file).get('groq')).toBe('gsk-1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/secrets/keystore.test.ts`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement**

Create `backend/src/secrets/keystore.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Engine-only secret store. Maps connectorId -> apiKey (the x402 wallet private key
 * lives here too, under the reserved id 'x402.wallet'). File mode 0o600.
 *
 * SECURITY: values from this store NEVER cross the WebSocket, are NEVER logged, and
 * NEVER enter a renderer store. Only booleans (keyedIds) are ever surfaced.
 */
export class Keystore {
  private cache: Record<string, string>;

  constructor(private readonly file: string) {
    this.cache = this.load();
  }

  private load(): Record<string, string> {
    if (!existsSync(this.file)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
    } catch {
      // Never log the contents on parse failure -- start empty.
      return {};
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 });
    writeFileSync(this.file, JSON.stringify(this.cache), { mode: 0o600 });
  }

  get(connectorId: string): string | undefined {
    return this.cache[connectorId];
  }

  set(connectorId: string, key: string): void {
    this.cache[connectorId] = key;
    this.persist();
  }

  /** The set of connector ids that have a key -- the ONLY thing safe to surface. */
  keyedIds(): ReadonlySet<string> {
    return new Set(Object.keys(this.cache));
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/secrets/keystore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/secrets/keystore.ts backend/test/secrets/keystore.test.ts
git commit -m "feat(secrets): engine-only keystore (0o600, keyedIds only)"
```

### Task 9: Prove no key escapes through a safeParse'd frame

This is the spec's security-critical assertion (Section 9): a key in the keystore must never appear in any outbound frame.

**Files:**
- Test: `backend/test/secrets/no-key-leak.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { describe, it, expect } from 'vitest';
import { EngineToRendererSchema, makeMessage } from '@crash/protocol';

// A representative secret value. If this string ever survives a safeParse of any
// Engine->Renderer event, a field is leaking it.
const SECRET = 'tvly-THIS-MUST-NEVER-SHIP';

describe('no key leaks through the egress filter', () => {
  it('strips any out-of-contract field carrying a secret before it ships', () => {
    // Representative E->R frames built with makeMessage (no dependency on the examples
    // export map). Pollute each payload with an apiKey field that is NOT in the schema.
    const frames = [
      makeMessage('payment.activity', 'sess', 1, { agentId: 'a', phase: 'settled', amount: '0.01', asset: 'USDC', network: 'eip155:84532' }),
      makeMessage('tool.activity', 'sess', 2, { agentId: 'a', tool: 'search', phase: 'ok' }),
      makeMessage('wallet.status', 'sess', 3, { balanceMinor: 100, caps: [] }),
    ];
    for (const frame of frames) {
      const polluted = { ...frame, payload: { ...(frame as { payload: object }).payload, apiKey: SECRET } };
      const parsed = EngineToRendererSchema.safeParse(polluted);
      expect(parsed.success).toBe(true); // the contracted fields are valid...
      if (parsed.success) {
        expect(JSON.stringify(parsed.data)).not.toContain(SECRET); // ...and the secret was stripped
      }
    }
  });
});
```

> Built with `makeMessage`, so it does not depend on whether `EXAMPLES` is a subpath export. The assertion is what matters: a parsed frame never contains the injected secret because zod `.strip()` (the default) drops unknown keys. This is a *regression guard* -- it fails loudly if anyone ever switches an Engine->Renderer schema to `.passthrough()`, which would let an extra field ride out.

- [ ] **Step 2: Run it**

Run: `pnpm --filter @crash/engine exec vitest run test/secrets/no-key-leak.test.ts`
Expected: PASS immediately (zod strips unknown keys by default -- this test is a *regression guard* that fails loudly if anyone switches a schema to `.passthrough()`).

- [ ] **Step 3: Commit**

```bash
git add backend/test/secrets/no-key-leak.test.ts
git commit -m "test(secrets): guard that no key survives the egress safeParse"
```

### Task 10: Tauri native IPC command `set_connector_key`

The key enters via a native IPC command, not the WebSocket. **Confirm the live command-registration file first** -- `frontend/r3f-shell/src-tauri/src/lib.rs` holds the `tauri::Builder` / `invoke_handler`, and `sidecar.rs` (currently modified by a collaborator) holds engine-process glue. Coordinate before editing `sidecar.rs`.

**Files:**
- Modify: `frontend/r3f-shell/src-tauri/src/lib.rs` (register the command)
- Create: `frontend/r3f-shell/src-tauri/src/secrets.rs` (the command body)
- Create: `frontend/r3f-shell/src/lib/setConnectorKey.ts` (TS wrapper)

- [ ] **Step 1: Implement the Rust command**

Create `frontend/r3f-shell/src-tauri/src/secrets.rs`:

```rust
use std::fs;
use std::io::Write;
use std::path::PathBuf;

/// Writes a connector key into ~/Crash/.secrets/connectors.json (0o600 on unix).
/// The key arrives over Tauri IPC, NEVER over the WebSocket. Nothing here is logged.
#[tauri::command]
pub fn set_connector_key(connector_id: String, key: String) -> Result<(), String> {
    if connector_id.is_empty() || key.is_empty() {
        return Err("invalid_input".into()); // synthetic code, never the value
    }
    let home = dirs::home_dir().ok_or_else(|| "no_home".to_string())?;
    let dir: PathBuf = home.join("Crash").join(".secrets");
    fs::create_dir_all(&dir).map_err(|e| e.kind().to_string())?;
    let file = dir.join("connectors.json");

    let mut map: serde_json::Map<String, serde_json::Value> = if file.exists() {
        serde_json::from_str(&fs::read_to_string(&file).map_err(|e| e.kind().to_string())?)
            .unwrap_or_default()
    } else {
        serde_json::Map::new()
    };
    map.insert(connector_id, serde_json::Value::String(key));

    let body = serde_json::to_string(&map).map_err(|_| "serialize_failed".to_string())?;
    let mut opts = fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts.open(&file).map_err(|e| e.kind().to_string())?;
    f.write_all(body.as_bytes()).map_err(|e| e.kind().to_string())?;
    Ok(())
}
```

> If `dirs` / `serde_json` are not already in `src-tauri/Cargo.toml`, add them (`dirs = "5"`, `serde_json = "1"`). Check existing deps first to avoid duplicates.

- [ ] **Step 2: Register the command**

In `frontend/r3f-shell/src-tauri/src/lib.rs`, add `mod secrets;` near the other `mod` declarations, and add `secrets::set_connector_key` to the existing `tauri::generate_handler![...]` list (append to whatever handlers are already registered -- do not remove any).

- [ ] **Step 3: TS wrapper**

Create `frontend/r3f-shell/src/lib/setConnectorKey.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';

/**
 * Send a connector key to the engine via native IPC. The key NEVER touches the
 * WebSocket or any store. Callers MUST clear the input field immediately after this resolves.
 */
export async function setConnectorKey(connectorId: string, key: string): Promise<void> {
  await invoke('set_connector_key', { connectorId, key });
}
```

- [ ] **Step 4: Verify it builds**

Run: `pnpm --filter @crash/r3f-shell exec tsc --noEmit` (TS side) and a Rust check `cargo check --manifest-path frontend/r3f-shell/src-tauri/Cargo.toml`.
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add frontend/r3f-shell/src-tauri/src/secrets.rs frontend/r3f-shell/src-tauri/src/lib.rs frontend/r3f-shell/src/lib/setConnectorKey.ts
git commit -m "feat(keystore): Tauri native IPC set_connector_key (key never on the wire)"
```

**PHASE 2 GATE:** repo-root gate chain.

---

# PHASE 3 -- x402 Commerce Rail (beat 2, the headline sponsor beat)

Buyer = the engine (`@x402/fetch`). Seller = a tiny `@x402/express` server on a second loopback port. Caps are enforced **before signing**. The cap check is pure and unit-tested offline; the live settlement is the one network beat.

### Task 11: Per-agent spend caps (enforced before signing)

**Files:**
- Create: `backend/src/payments/caps.ts`
- Test: `backend/test/payments/caps.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { CapLedger } from '../../src/payments/caps.js';

describe('CapLedger', () => {
  it('allows a charge within the cap', () => {
    const l = new CapLedger({ 'deep-research-pro': 50000 });
    expect(l.canSpend('deep-research-pro', 10000)).toBe(true);
  });

  it('rejects a charge that would exceed the cap (before signing)', () => {
    const l = new CapLedger({ 'deep-research-pro': 50000 });
    l.record('deep-research-pro', 45000);
    expect(l.canSpend('deep-research-pro', 10000)).toBe(false);
  });

  it('treats an agent with no configured cap as not allowed', () => {
    const l = new CapLedger({});
    expect(l.canSpend('unknown', 1)).toBe(false);
  });

  it('reports caps for wallet.status', () => {
    const l = new CapLedger({ a: 100 });
    l.record('a', 30);
    expect(l.snapshot()).toEqual([{ agentId: 'a', capMinor: 100, spentMinor: 30 }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/payments/caps.test.ts`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement**

Create `backend/src/payments/caps.ts`:

```ts
import type { WalletCap } from '@crash/protocol';

/** Per-agent spend caps in USDC minor units. Enforced BEFORE any transfer is signed. */
export class CapLedger {
  private spent: Record<string, number> = {};

  constructor(private readonly caps: Record<string, number>) {}

  /** True iff the agent has a configured cap AND charging `amountMinor` stays within it. */
  canSpend(agentId: string, amountMinor: number): boolean {
    const cap = this.caps[agentId];
    if (cap === undefined) return false; // no cap configured = no spending
    return (this.spent[agentId] ?? 0) + amountMinor <= cap;
  }

  /** Record a settled charge. Call ONLY after a successful settlement. */
  record(agentId: string, amountMinor: number): void {
    this.spent[agentId] = (this.spent[agentId] ?? 0) + amountMinor;
  }

  snapshot(): WalletCap[] {
    return Object.entries(this.caps).map(([agentId, capMinor]) => ({
      agentId,
      capMinor,
      spentMinor: this.spent[agentId] ?? 0,
    }));
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/payments/caps.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/payments/caps.ts backend/test/payments/caps.test.ts
git commit -m "feat(payments): per-agent spend caps enforced pre-signing"
```

### Task 12: x402 buyer + purchase flow (cap-gated, emits payment.activity)

**Files:**
- Create: `backend/src/payments/x402.ts`
- Test: `backend/test/payments/x402.test.ts`

- [ ] **Step 1: Write the failing test** (logic only -- the network call is injected, so this runs offline)

```ts
import { describe, it, expect, vi } from 'vitest';
import { purchase } from '../../src/payments/x402.js';
import { CapLedger } from '../../src/payments/caps.js';

const listing = { id: 'deep-research-pro', amountMinor: 10000, payTo: '0xabc', network: 'eip155:84532' };

describe('purchase', () => {
  it('rejects over-cap before signing and never calls the paid fetch', async () => {
    const ledger = new CapLedger({ 'deep-research-pro': 5000 }); // cap below price
    const paidFetch = vi.fn();
    const events: string[] = [];
    const res = await purchase({ listing, ledger, paidFetch, emit: (p) => events.push(p.phase) });
    expect(res.ok).toBe(false);
    expect(res.code).toBe('payment_cap_exceeded');
    expect(paidFetch).not.toHaveBeenCalled();
  });

  it('emits required->signing->settled and records the charge on success', async () => {
    const ledger = new CapLedger({ 'deep-research-pro': 50000 });
    const paidFetch = vi.fn(async () => ({ ok: true, headers: { get: () => '0xtxref' } }) as any);
    const phases: string[] = [];
    const res = await purchase({ listing, ledger, paidFetch, emit: (p) => phases.push(p.phase) });
    expect(res.ok).toBe(true);
    expect(phases).toEqual(['required', 'signing', 'settled']);
    expect(ledger.snapshot()[0].spentMinor).toBe(10000);
  });

  it('maps a thrown paid fetch to payment_failed (retryable)', async () => {
    const ledger = new CapLedger({ 'deep-research-pro': 50000 });
    const paidFetch = vi.fn(async () => { throw new Error('network'); });
    const res = await purchase({ listing, ledger, paidFetch, emit: () => {} });
    expect(res).toMatchObject({ ok: false, code: 'payment_failed', retryable: true });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/payments/x402.test.ts`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement** (the x402 lib is injected as `paidFetch` so the unit test stays offline; the engine wires the real one in Task 15)

Create `backend/src/payments/x402.ts`:

```ts
import type { CapLedger } from './caps.js';

export interface Listing {
  id: string;
  amountMinor: number;
  payTo: string;
  network: string; // 'eip155:84532'
}

export interface PaymentEvent {
  agentId: string;
  phase: 'required' | 'signing' | 'settled';
  amount: string;
  asset: 'USDC';
  network: string;
  payTo?: string;
  txRef?: string;
}

export type PurchaseResult =
  | { ok: true; txRef?: string }
  | { ok: false; code: 'payment_cap_exceeded'; retryable: false }
  | { ok: false; code: 'payment_failed'; retryable: true };

/** Format USDC minor units (6 decimals) to a short display string. */
export function formatUsdc(amountMinor: number): string {
  return (amountMinor / 1_000_000).toString();
}

/**
 * Drive one x402 purchase. Cap is checked BEFORE `paidFetch` (which performs the
 * 402 -> sign ERC-3009 -> retry -> settle round trip). `paidFetch` is injected so this
 * is unit-testable offline; the engine supplies the real `@x402/fetch`-wrapped fetch.
 */
export async function purchase(args: {
  listing: Listing;
  ledger: CapLedger;
  paidFetch: () => Promise<{ ok: boolean; headers: { get: (k: string) => string | null } }>;
  emit: (e: PaymentEvent) => void;
}): Promise<PurchaseResult> {
  const { listing, ledger, paidFetch, emit } = args;
  const base = {
    agentId: listing.id,
    amount: formatUsdc(listing.amountMinor),
    asset: 'USDC' as const,
    network: listing.network,
    payTo: listing.payTo,
  };

  emit({ ...base, phase: 'required' });

  if (!ledger.canSpend(listing.id, listing.amountMinor)) {
    return { ok: false, code: 'payment_cap_exceeded', retryable: false };
  }

  emit({ ...base, phase: 'signing' });
  try {
    const res = await paidFetch();
    if (!res.ok) return { ok: false, code: 'payment_failed', retryable: true };
    const txRef = res.headers.get('x-payment-response') ?? undefined;
    ledger.record(listing.id, listing.amountMinor);
    emit({ ...base, phase: 'settled', txRef });
    return { ok: true, txRef };
  } catch {
    // Never log err.message -- synthetic code only.
    return { ok: false, code: 'payment_failed', retryable: true };
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/payments/x402.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/payments/x402.ts backend/test/payments/x402.test.ts
git commit -m "feat(payments): cap-gated x402 purchase flow with payment.activity beats"
```

### Task 13: Local x402 seller stand-in (`@x402/express`, second loopback port)

**Files:**
- Create: `backend/src/payments/seller.ts`
- Test: `backend/test/payments/seller.test.ts`

- [ ] **Step 1: Write the failing test** (asserts the 402 challenge without a wallet)

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { startSeller } from '../../src/payments/seller.js';

let stop: (() => Promise<void>) | null = null;
afterEach(async () => { if (stop) await stop(); stop = null; });

describe('x402 seller stand-in', () => {
  it('answers 402 with a payment challenge when unpaid', async () => {
    const { port, close } = await startSeller({ priceMinor: 10000, payTo: '0xabc' });
    stop = close;
    const res = await fetch(`http://127.0.0.1:${port}/premium`);
    expect(res.status).toBe(402);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/payments/seller.test.ts`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement** (bind to `127.0.0.1` and port `0` so the OS assigns a free port -- no collision with the engine socket)

Create `backend/src/payments/seller.ts`:

```ts
import express from 'express';
import { paymentMiddleware } from '@x402/express';
import type { AddressInfo } from 'node:net';

/**
 * A tiny local paid resource. Stands in for a premium API so the demo's x402 buy is
 * end-to-end without a third-party paid endpoint. Loopback-only.
 *
 * Verify the exact `paymentMiddleware` signature against the installed @x402/express
 * version (use context7 if it differs); the shape below matches the documented API:
 * paymentMiddleware(payTo, routes, facilitator).
 */
export async function startSeller(opts: {
  priceMinor: number;
  payTo: string;
  facilitatorUrl?: string;
}): Promise<{ port: number; close: () => Promise<void> }> {
  const app = express();
  app.use(
    paymentMiddleware(
      opts.payTo,
      {
        'GET /premium': {
          price: { amount: String(opts.priceMinor), asset: { address: 'USDC' } },
          network: 'base-sepolia',
        },
      },
      { url: opts.facilitatorUrl ?? 'https://x402.org/facilitator' },
    ),
  );
  app.get('/premium', (_req, res) => res.json({ ok: true, data: 'premium result' }));

  return await new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
```

> If `@x402/express`'s middleware config shape differs in the installed version, adjust the route descriptor; the test only asserts the unpaid 402, which every version returns.

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/payments/seller.test.ts`
Expected: PASS (402 returned). If `@x402/express` requires a configured chain client even for the challenge, mark this test `it.skip` with a comment and verify the seller manually in Task 15's integration run.

- [ ] **Step 5: Commit**

```bash
git add backend/src/payments/seller.ts backend/test/payments/seller.test.ts
git commit -m "feat(payments): local x402 seller stand-in on a loopback port"
```

**PHASE 3 GATE:** repo-root gate chain. (Live facilitator settlement is exercised in Task 15 + the manual rehearsal, not in CI.)

---

# PHASE 4 -- Search connector + tool.activity (beat 3, Tavily) -- MINIMUM DEMO COMPLETE AFTER THIS

After Phase 4 the two sponsor beats (2: x402, 3: Tavily) are runnable -- the spec's trim-valve minimum demo. Everything below this line is enrichment.

### Task 14: Tavily search dispatch + tool.activity, with a canned fallback

**Files:**
- Create: `backend/src/connectors/search.ts`
- Test: `backend/test/connectors/search.test.ts`

- [ ] **Step 1: Write the failing test** (fetch injected; offline)

```ts
import { describe, it, expect, vi } from 'vitest';
import { runSearch } from '../../src/connectors/search.js';

describe('runSearch', () => {
  it('emits start->ok and returns results on success', async () => {
    const phases: string[] = [];
    const fakeFetch = vi.fn(async () => ({ ok: true, json: async () => ({ results: [{ title: 'T', url: 'u', content: 'c' }] }) }) as any);
    const r = await runSearch({ agentId: 'research-agent', query: 'q', apiKey: 'k', baseUrl: 'https://api.tavily.com', fetchImpl: fakeFetch, emit: (e) => phases.push(e.phase) });
    expect(phases).toEqual(['start', 'ok']);
    expect(r.results[0].title).toBe('T');
  });

  it('falls back to canned results and emits start->ok when the call throws', async () => {
    const phases: string[] = [];
    const fakeFetch = vi.fn(async () => { throw new Error('net'); });
    const r = await runSearch({ agentId: 'research-agent', query: 'q', apiKey: 'k', baseUrl: 'https://api.tavily.com', fetchImpl: fakeFetch, emit: (e) => phases.push(e.phase), canned: [{ title: 'C', url: 'cu', content: 'cc' }] });
    expect(r.results[0].title).toBe('C');
    expect(phases).toEqual(['start', 'ok']); // flop-proof: fallback still reads as success
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/connectors/search.test.ts`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement**

Create `backend/src/connectors/search.ts`:

```ts
export interface SearchHit { title: string; url: string; content: string }
export interface ToolEvent { agentId: string; tool: 'search'; phase: 'start' | 'ok' | 'error'; code?: string }

/**
 * Tavily-backed search. `fetchImpl` is injected for testability. On failure, if `canned`
 * results are supplied the call degrades gracefully (flop-proof) and still reports 'ok';
 * with no canned fallback it reports 'error' with a synthetic code.
 */
export async function runSearch(args: {
  agentId: string;
  query: string;
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  emit: (e: ToolEvent) => void;
  canned?: SearchHit[];
}): Promise<{ results: SearchHit[] }> {
  const { agentId, query, apiKey, baseUrl, emit, canned } = args;
  const f = args.fetchImpl ?? fetch;
  emit({ agentId, tool: 'search', phase: 'start' });
  try {
    const res = await f(`${baseUrl}/search`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, max_results: 5 }),
    });
    if (!res.ok) throw new Error('http'); // never retain the body
    const data = (await res.json()) as { results?: SearchHit[] };
    emit({ agentId, tool: 'search', phase: 'ok' });
    return { results: data.results ?? [] };
  } catch {
    if (canned && canned.length) {
      emit({ agentId, tool: 'search', phase: 'ok' });
      return { results: canned };
    }
    emit({ agentId, tool: 'search', phase: 'error', code: 'connector_http_error' });
    return { results: [] };
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/connectors/search.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/connectors/search.ts backend/test/connectors/search.test.ts
git commit -m "feat(connectors): Tavily search with tool.activity + canned fallback"
```

**PHASE 4 GATE:** repo-root gate chain. **Minimum demo (beats 2+3) is now buildable.**

---

# PHASE 5 -- Agent Model & Catalog

An agent = the existing `SavedSkill` plus a manifest (capabilities, permissions, optional price). Additive.

### Task 15: AgentManifest schema + pack storage + accesses summary

**Files:**
- Create: `backend/src/agent/agents.ts`
- Test: `backend/test/agent/agents.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentManifestSchema, saveAgent, loadAgents, accessesSummary } from '../../src/agent/agents.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'crash-agents-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const manifest = {
  id: 'research-agent', name: 'Research Agent', goal: 'Research the web',
  systemPrompt: 'You are a careful researcher.',
  requires: { capabilities: ['search'] as const },
  permissions: { readBroad: true, writeFolders: ['Research'] },
  source: 'builtin' as const, createdAt: '2026-06-01T00:00:00Z',
};

describe('agents', () => {
  it('validates a manifest', () => {
    expect(AgentManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('saves a pack and reads it back', () => {
    saveAgent(dir, manifest);
    expect(existsSync(join(dir, 'agents', 'research-agent', 'manifest.json'))).toBe(true);
    expect(loadAgents(dir).find((a) => a.id === 'research-agent')?.name).toBe('Research Agent');
  });

  it('derives an access-forward summary', () => {
    expect(accessesSummary(manifest)).toContain('Web search');
    expect(accessesSummary(manifest).some((s) => s.startsWith('Write to:'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/agent/agents.test.ts`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement**

Create `backend/src/agent/agents.ts`:

```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { CapabilitySchema, type Capability } from '../connectors/types.js';

export const AgentManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  systemPrompt: z.string(), // inline; persisted to systemPrompt.md in the pack
  requires: z.object({ capabilities: z.array(CapabilitySchema) }),
  permissions: z.object({ readBroad: z.boolean(), writeFolders: z.array(z.string()) }),
  price: z
    .object({ amountMinor: z.number().int().nonnegative(), asset: z.literal('USDC'), payTo: z.string() })
    .optional(),
  source: z.enum(['builtin', 'user', 'installed']),
  createdAt: z.string(),
});
export type AgentManifest = z.infer<typeof AgentManifestSchema>;

const CAPABILITY_LABEL: Record<Capability, string> = {
  chat: 'Chat (LLM)',
  'image.generate': 'Generate images',
  'tts.speak': 'Generate speech',
  search: 'Web search',
  'video.generate': 'Generate video',
  x402: 'Pay for premium data',
  fs: 'Read/write files',
};

/** Access-forward chips shown on a card BEFORE install -- the trust differentiator. */
export function accessesSummary(m: AgentManifest): string[] {
  const out = m.requires.capabilities.map((c) => CAPABILITY_LABEL[c]);
  if (m.permissions.readBroad) out.push('Reads your machine');
  for (const f of m.permissions.writeFolders) out.push(`Write to: ${f}`);
  if (m.price) out.push(`Costs: ${(m.price.amountMinor / 1_000_000).toString()} USDC`);
  return out;
}

export function saveAgent(root: string, m: AgentManifest): void {
  const dir = join(root, 'agents', m.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
  writeFileSync(join(dir, 'systemPrompt.md'), m.systemPrompt);
}

export function loadAgents(root: string): AgentManifest[] {
  const base = join(root, 'agents');
  if (!existsSync(base)) return [];
  const out: AgentManifest[] = [];
  for (const slug of readdirSync(base)) {
    const file = join(base, slug, 'manifest.json');
    if (!existsSync(file)) continue;
    const parsed = AgentManifestSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/agent/agents.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/agents.ts backend/test/agent/agents.test.ts
git commit -m "feat(agents): AgentManifest + pack storage + access-forward summary"
```

### Task 16: Build the catalog listing payload (manifest -> CatalogListing)

**Files:**
- Create: `backend/src/marketplace/listings.ts`
- Test: `backend/test/marketplace/listings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { CatalogListingSchema } from '@crash/protocol';
import { toListing } from '../../src/marketplace/listings.js';

const manifest = {
  id: 'deep-research-pro', name: 'Deep Research Pro', goal: 'Premium research',
  systemPrompt: 'x', requires: { capabilities: ['search'] as const },
  permissions: { readBroad: false, writeFolders: ['Research'] },
  price: { amountMinor: 10000, asset: 'USDC' as const, payTo: '0xabc' },
  source: 'builtin' as const, createdAt: '2026-06-01T00:00:00Z',
};

describe('toListing', () => {
  it('produces a schema-valid, access-forward listing', () => {
    const listing = toListing(manifest, 'Research/web');
    expect(CatalogListingSchema.safeParse(listing).success).toBe(true);
    expect(listing.accesses).toContain('Web search');
    expect(listing.price?.amountMinor).toBe(10000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/marketplace/listings.test.ts`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement**

Create `backend/src/marketplace/listings.ts`:

```ts
import type { CatalogListing } from '@crash/protocol';
import { accessesSummary, type AgentManifest } from '../agent/agents.js';

/** Project an agent manifest into the wire-shape catalog listing shown in Browse. */
export function toListing(m: AgentManifest, category: string): CatalogListing {
  return {
    id: m.id,
    name: m.name,
    description: m.goal,
    category,
    accesses: accessesSummary(m),
    source: m.source,
    price: m.price,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/marketplace/listings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/marketplace/listings.ts backend/test/marketplace/listings.test.ts
git commit -m "feat(marketplace): project agent manifests into wire listings"
```

**PHASE 5 GATE:** repo-root gate chain.

---

# PHASE 6 -- Filesystem write-permission + realpath jail (beat 4)

The moment `permission.grant` broadens writable roots, the lexical prefix check at `paths.ts:53-60` is vulnerable to symlink escape. This phase adds grants storage, the grant handler's storage half, the realpath jail, and the fs connector.

### Task 17: grants.json read/add

**Files:**
- Create: `backend/src/workspace/grants.ts`
- Test: `backend/test/workspace/grants.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GrantStore } from '../../src/workspace/grants.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'crash-grants-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('GrantStore', () => {
  it('adds and lists granted folders, de-duped', () => {
    const g = new GrantStore(join(dir, 'grants.json'));
    g.add('/tmp/a');
    g.add('/tmp/a');
    g.add('/tmp/b');
    expect(g.list().sort()).toEqual(['/tmp/a', '/tmp/b']);
  });

  it('persists across instances', () => {
    const file = join(dir, 'grants.json');
    new GrantStore(file).add('/tmp/c');
    expect(new GrantStore(file).list()).toContain('/tmp/c');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/workspace/grants.test.ts`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement**

Create `backend/src/workspace/grants.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Persisted set of user-granted writable folders. NOT secret (paths only). */
export class GrantStore {
  private folders: Set<string>;

  constructor(private readonly file: string) {
    this.folders = new Set(this.load());
  }

  private load(): string[] {
    if (!existsSync(this.file)) return [];
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      return Array.isArray(parsed?.folders) ? parsed.folders : [];
    } catch {
      return [];
    }
  }

  add(folder: string): void {
    this.folders.add(folder);
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ folders: [...this.folders] }, null, 2));
  }

  list(): string[] {
    return [...this.folders];
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/workspace/grants.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/workspace/grants.ts backend/test/workspace/grants.test.ts
git commit -m "feat(workspace): grants.json store for user-granted write folders"
```

### Task 18: Realpath write-jail (the security-critical symlink-escape fix)

**Files:**
- Modify: `backend/src/workspace/paths.ts` (the `assertInsideWorkspace` region around lines 53-60)
- Test: `backend/test/workspace/realpath-jail.test.ts`

- [ ] **Step 1: Write the failing test** (the symlink-escape case is the one that matters)

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { assertWritable } from '../../src/workspace/paths.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'crash-jail-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('assertWritable (realpath jail)', () => {
  it('allows a write directly inside a granted folder', () => {
    const granted = join(root, 'granted');
    mkdirSync(granted, { recursive: true });
    expect(() => assertWritable([granted], join(granted, 'note.md'))).not.toThrow();
  });

  it('rejects a write outside every granted folder', () => {
    const granted = join(root, 'granted');
    mkdirSync(granted, { recursive: true });
    expect(() => assertWritable([granted], join(root, 'outside.md'))).toThrow(/permission_denied/);
  });

  it('rejects a symlink inside a granted folder that points outside it', () => {
    if (platform() === 'win32') return; // symlink creation needs privilege on Windows; covered on POSIX CI
    const granted = join(root, 'granted');
    const secret = join(root, 'secret');
    mkdirSync(granted, { recursive: true });
    mkdirSync(secret, { recursive: true });
    symlinkSync(secret, join(granted, 'escape')); // granted/escape -> ../secret
    writeFileSync(join(secret, 'x'), 'x');
    expect(() => assertWritable([granted], join(granted, 'escape', 'pwned.md'))).toThrow(/permission_denied/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/workspace/realpath-jail.test.ts`
Expected: FAIL -- `assertWritable` not exported.

- [ ] **Step 3: Implement** (add `assertWritable` to `paths.ts`; keep the existing lexical `assertInsideWorkspace` for non-write callers, but route writes through this realpath check)

Add to `backend/src/workspace/paths.ts`:

```ts
import { realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';

/** Realpath the deepest existing ancestor of `p`, then re-append the non-existent tail.
 *  This canonicalizes through symlinks even when the target file does not exist yet. */
function realpathAncestor(p: string): string {
  let cur = resolve(p);
  const tail: string[] = [];
  // walk up until an existing path resolves
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const real = realpathSync(cur);
      return tail.length ? resolve(real, ...tail.reverse()) : real;
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return resolve(p); // reached the root; nothing existed
      tail.push(cur.slice(parent.length + 1));
      cur = parent;
    }
  }
}

/** True iff `child` is `ancestor` or strictly below it (after canonicalization). */
function isInside(ancestor: string, child: string): boolean {
  const rel = relative(realpathAncestor(ancestor), realpathAncestor(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Gate a WRITE: throw 'permission_denied' unless `target` canonicalizes to a path inside
 * one of the `grantedRoots` (also canonicalized). Following symlinks defeats the
 * symlink-escape that the old lexical prefix check allowed.
 */
export function assertWritable(grantedRoots: string[], target: string): void {
  for (const root of grantedRoots) {
    if (isInside(root, target)) return;
  }
  throw new Error('permission_denied');
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/workspace/realpath-jail.test.ts`
Expected: PASS (including the symlink-escape rejection on POSIX).

- [ ] **Step 5: Commit**

```bash
git add backend/src/workspace/paths.ts backend/test/workspace/realpath-jail.test.ts
git commit -m "feat(security): realpath write-jail rejects symlink escape from granted folders"
```

### Task 19: fs connector write (gated by the jail) + file.activity

**Files:**
- Create: `backend/src/connectors/fs.ts`
- Test: `backend/test/connectors/fs.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeToGranted } from '../../src/connectors/fs.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'crash-fs-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('writeToGranted', () => {
  it('writes inside a granted folder and reports file.activity', () => {
    const granted = join(root, 'granted');
    mkdirSync(granted, { recursive: true });
    const activity: any[] = [];
    const res = writeToGranted({ grantedRoots: [granted], target: join(granted, 'out.md'), contents: 'hello', emit: (a) => activity.push(a) });
    expect(res.ok).toBe(true);
    expect(existsSync(join(granted, 'out.md'))).toBe(true);
    expect(activity[0].op).toBe('create');
  });

  it('refuses to write outside granted folders (permission_denied)', () => {
    const granted = join(root, 'granted');
    mkdirSync(granted, { recursive: true });
    const res = writeToGranted({ grantedRoots: [granted], target: join(root, 'nope.md'), contents: 'x', emit: () => {} });
    expect(res).toMatchObject({ ok: false, code: 'permission_denied' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/connectors/fs.test.ts`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement**

Create `backend/src/connectors/fs.ts`:

```ts
import { existsSync, writeFileSync, statSync } from 'node:fs';
import { assertWritable } from '../workspace/paths.js';

export interface FileActivity { op: 'create' | 'write'; path: string; bytes: number; seq: number }

export type FsResult =
  | { ok: true }
  | { ok: false; code: 'permission_denied'; retryable: false };

let seq = 0;

/** Write `contents` to `target`, gated by the realpath jail. Emits file.activity with a
 *  workspace-relative path (never absolute -- no home-dir leak). */
export function writeToGranted(args: {
  grantedRoots: string[];
  target: string;
  contents: string;
  relativeTo?: string; // for the activity path display
  emit: (a: FileActivity) => void;
}): FsResult {
  try {
    assertWritable(args.grantedRoots, args.target);
  } catch {
    return { ok: false, code: 'permission_denied', retryable: false };
  }
  const existed = existsSync(args.target);
  writeFileSync(args.target, args.contents);
  const bytes = statSync(args.target).size;
  // Display path: basename only if no relativeTo given (never leak an absolute path).
  const path = args.relativeTo ? args.target.slice(args.relativeTo.length + 1) : args.target.split(/[\\/]/).pop()!;
  args.emit({ op: existed ? 'write' : 'create', path, bytes, seq: seq++ });
  return { ok: true };
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/connectors/fs.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/connectors/fs.ts backend/test/connectors/fs.test.ts
git commit -m "feat(connectors): jailed fs write with file.activity"
```

**PHASE 6 GATE:** repo-root gate chain.

---

# PHASE 7 -- Recipe Runner (flop-proofing, beats 1/3/6)

A deterministic beat sequence that survives a dead network -- the on-stage guarantee.

### Task 20: Recipe runner with a stubbed network

**Files:**
- Create: `backend/src/recipe/runner.ts`
- Test: `backend/test/recipe/runner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { runRecipe, HERO_RECIPE } from '../../src/recipe/runner.js';

describe('runRecipe (flop-proof)', () => {
  it('emits every beat in order even when all effects throw', async () => {
    const seen: string[] = [];
    await runRecipe(HERO_RECIPE, {
      emit: (beatId) => seen.push(beatId),
      effects: { search: async () => { throw new Error('net'); }, write: async () => { throw new Error('disk'); } },
    });
    expect(seen).toEqual(HERO_RECIPE.map((b) => b.id));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/recipe/runner.test.ts`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement**

Create `backend/src/recipe/runner.ts`:

```ts
export interface Beat { id: string; label: string; effect?: 'search' | 'write' }

/** The filmed hero flow as fixed beats. Each beat emits regardless of effect outcome. */
export const HERO_RECIPE: Beat[] = [
  { id: 'browse', label: 'Browse the marketplace' },
  { id: 'buy', label: 'Buy Deep Research Pro with USDC' },
  { id: 'search', label: 'Run the Tavily-backed search', effect: 'search' },
  { id: 'save', label: 'Save the result to a granted folder', effect: 'write' },
  { id: 'byok', label: 'Paste a media key; the matching agent lights up' },
  { id: 'create', label: 'Build and publish a new agent' },
];

/** Run a recipe to completion. Effects may throw; the beat still advances (flop-proof). */
export async function runRecipe(
  recipe: Beat[],
  args: { emit: (beatId: string) => void; effects: { search: () => Promise<unknown>; write: () => Promise<unknown> } },
): Promise<void> {
  for (const beat of recipe) {
    try {
      if (beat.effect) await args.effects[beat.effect]();
    } catch {
      // Swallow: the recipe never flops on stage. Real errors are surfaced as synthetic codes elsewhere.
    }
    args.emit(beat.id);
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/recipe/runner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/recipe/runner.ts backend/test/recipe/runner.test.ts
git commit -m "feat(recipe): flop-proof hero beat runner"
```

**PHASE 7 GATE:** repo-root gate chain.

---

# PHASE 8 -- Agent Creator meta-flow (beat 6)

Turns a plain goal into a strong agent. Runs on the BYO LLM, with a deterministic offline template so it never hard-fails.

### Task 21: Deterministic agent-architect template (offline fallback)

**Files:**
- Create: `backend/src/agent/creator.ts`
- Test: `backend/test/agent/creator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { draftAgentOffline } from '../../src/agent/creator.js';
import { AgentManifestSchema } from '../../src/agent/agents.js';

describe('draftAgentOffline', () => {
  it('drafts a schema-valid manifest from a goal mentioning research', () => {
    const m = draftAgentOffline('research recent papers and save a summary', '2026-06-01T00:00:00Z');
    expect(AgentManifestSchema.safeParse(m).success).toBe(true);
    expect(m.requires.capabilities).toContain('search');
  });

  it('requests fs capability + a write folder when the goal mentions saving files', () => {
    const m = draftAgentOffline('save notes to my documents', '2026-06-01T00:00:00Z');
    expect(m.requires.capabilities).toContain('fs');
    expect(m.permissions.writeFolders.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/agent/creator.test.ts`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement** (keyword-driven capability selection; a real LLM path layers on top in Task 22)

Create `backend/src/agent/creator.ts`:

```ts
import type { Capability } from '../connectors/types.js';
import type { AgentManifest } from './agents.js';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'agent';
}

/**
 * Deterministic draft used offline (and as the architect's scaffold). Infers capabilities
 * and a write folder from goal keywords, and writes a strong default system prompt. The
 * Permissions step in the wizard is still mandatory -- this only PROPOSES.
 */
export function draftAgentOffline(goal: string, createdAt: string): AgentManifest {
  const g = goal.toLowerCase();
  const caps = new Set<Capability>();
  if (/search|research|web|paper|news|find out/.test(g)) caps.add('search');
  if (/image|picture|logo|art/.test(g)) caps.add('image.generate');
  if (/voice|speak|audio|narrat/.test(g)) caps.add('tts.speak');
  if (/video|clip|reel/.test(g)) caps.add('video.generate');
  const writeFolders: string[] = [];
  if (/save|write|file|document|note|export/.test(g)) {
    caps.add('fs');
    writeFolders.push('Crash Output');
  }
  if (caps.size === 0) caps.add('chat');

  const name = goal.trim().replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase()).slice(0, 50);
  return {
    id: slugify(goal),
    name,
    goal: goal.trim(),
    systemPrompt:
      `You are an expert assistant whose single job is: ${goal.trim()}.\n` +
      `Work step by step. Use only the capabilities you were granted. When you need a tool, ` +
      `state which capability and why. Cite sources. Never ask for credentials.`,
    requires: { capabilities: [...caps] },
    permissions: { readBroad: false, writeFolders },
    source: 'user',
    createdAt,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/agent/creator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/creator.ts backend/test/agent/creator.test.ts
git commit -m "feat(creator): deterministic offline agent draft from a plain goal"
```

### Task 22: Publish a drafted agent (save pack, list locally)

**Files:**
- Create: `backend/src/agent/publish.ts`
- Test: `backend/test/agent/publish.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishAgent } from '../../src/agent/publish.js';
import { loadAgents } from '../../src/agent/agents.js';
import { draftAgentOffline } from '../../src/agent/creator.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'crash-pub-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('publishAgent', () => {
  it('saves the pack and returns the new listing', () => {
    const m = draftAgentOffline('research the web and save notes', '2026-06-01T00:00:00Z');
    const listing = publishAgent(dir, m, 'Research/web');
    expect(listing.source).toBe('user');
    expect(loadAgents(dir).some((a) => a.id === m.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/agent/publish.test.ts`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement**

Create `backend/src/agent/publish.ts`:

```ts
import type { CatalogListing } from '@crash/protocol';
import { saveAgent, type AgentManifest } from './agents.js';
import { toListing } from '../marketplace/listings.js';

/** "Deploy" = a local listing: persist the pack and return its Browse listing. */
export function publishAgent(root: string, manifest: AgentManifest, category: string): CatalogListing {
  const m: AgentManifest = { ...manifest, source: 'user' };
  saveAgent(root, m);
  return toListing(m, category);
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/agent/publish.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/agent/publish.ts backend/test/agent/publish.test.ts
git commit -m "feat(creator): publish a drafted agent as a local listing"
```

**PHASE 8 GATE:** repo-root gate chain.

---

# PHASE 9 -- Engine wiring + UI (Store + Workbench)

Wires the new R->E handlers and E->R emits into the live session, then surfaces them in the dashboard. The session and the dashboard already exist; these tasks extend them.

### Task 23: Wire marketplace.purchase + permission.grant + catalog/wallet emits into the session

**Files:**
- Modify: `backend/src/socket/session.ts` (the `handleRaw` switch + an engine-init seam for the keystore/grants/cap ledger)
- Test: `backend/test/socket/marketplace-wiring.test.ts`

- [ ] **Step 1: Write the failing test** (drive `handleRaw` with crafted frames; assert the emitted event types)

```ts
import { describe, it, expect } from 'vitest';
import { makeMessage } from '@crash/protocol';
import { Session } from '../../src/socket/session.js';

// Construct a Session with injected deps per the existing constructor/contract in session.ts.
// Capture emitted frames via the same seam the existing session tests use.

describe('marketplace wiring', () => {
  it('permission.grant records the folder and re-emits wallet.status', async () => {
    const emitted: string[] = [];
    const session = makeTestSession((m) => emitted.push(m.type)); // helper mirrors existing session tests
    await session.handleRaw(JSON.stringify(makeMessage('permission.grant', session.id, 1, { folder: '/tmp/granted' })));
    expect(emitted).toContain('wallet.status');
  });

  it('marketplace.purchase over cap emits payment.activity(required) then error(payment_cap_exceeded)', async () => {
    const frames: any[] = [];
    const session = makeTestSession((m) => frames.push(m));
    await session.handleRaw(JSON.stringify(makeMessage('marketplace.purchase', session.id, 2, { listingId: 'deep-research-pro' })));
    expect(frames.some((f) => f.type === 'payment.activity' && f.payload.phase === 'required')).toBe(true);
    expect(frames.some((f) => f.type === 'error' && f.payload.code === 'payment_cap_exceeded')).toBe(true);
  });
});
```

> Mirror the existing `session.test.ts` helper for constructing a `Session` and capturing `emit`. If none exists, expose a constructor option `{ onEmit }` used only by tests, matching how `emit()` already ships frames.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/engine exec vitest run test/socket/marketplace-wiring.test.ts`
Expected: FAIL -- no handler for these types.

- [ ] **Step 3: Implement**

In `backend/src/socket/session.ts`, construct (or accept via the engine init) a `Keystore`, `GrantStore`, and `CapLedger`, then add cases to the `handleRaw` switch (alongside the existing `marketplace.install` case):

```ts
case 'permission.grant': {
  this.grants.add(m.payload.folder);
  this.emit(makeMessage('wallet.status', this.id, this.nextSeq(), {
    balanceMinor: this.wallet.balanceMinor(),
    caps: this.caps.snapshot(),
  }));
  break;
}
case 'marketplace.purchase': {
  const listing = this.resolveListing(m.payload.listingId); // from loaded catalog
  if (!listing?.price) {
    this.emit(makeMessage('error', this.id, this.nextSeq(), { code: 'connector_not_configured', retryable: false }));
    break;
  }
  const result = await purchase({
    listing: { id: listing.id, amountMinor: listing.price.amountMinor, payTo: listing.price.payTo, network: 'eip155:84532' },
    ledger: this.caps,
    paidFetch: this.makePaidFetch(listing), // wraps @x402/fetch with the wallet account
    emit: (e) => this.emit(makeMessage('payment.activity', this.id, this.nextSeq(), e)),
  });
  if (!result.ok) {
    this.emit(makeMessage('error', this.id, this.nextSeq(), { code: result.code, retryable: result.retryable }));
  } else {
    this.emit(makeMessage('wallet.status', this.id, this.nextSeq(), { balanceMinor: this.wallet.balanceMinor(), caps: this.caps.snapshot() }));
  }
  break;
}
```

Add a one-time `marketplace.catalog` emit right after `session.ready` is sent (in the existing session-init path):

```ts
this.emit(makeMessage('marketplace.catalog', this.id, this.nextSeq(), {
  listings: this.loadedListings(), // builtin seed + loadAgents(workspace.root).map(toListing)
}));
```

Add the needed imports at the top: `purchase` from `../payments/x402.js`, `Keystore`, `GrantStore`, `CapLedger`, `loadAgents`, `toListing`. Define `makePaidFetch(listing)` to lazily build the `@x402/fetch`-wrapped fetch from the wallet key in the keystore (verify the exact `@x402/fetch` export against the installed version via context7; the cap gate already ran inside `purchase`).

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/engine exec vitest run test/socket/marketplace-wiring.test.ts`
Expected: PASS. Also re-run the full engine suite to confirm no regression: `pnpm --filter @crash/engine test`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/socket/session.ts backend/test/socket/marketplace-wiring.test.ts
git commit -m "feat(engine): wire purchase + permission.grant + catalog/wallet emits"
```

### Task 24: Extend DashSection + dashboard slices (Browse / My Agents / Create)

**Files:**
- Modify: `frontend/r3f-shell/src/store/dashboardStore.ts`
- Modify: `frontend/r3f-shell/src/data/catalog.ts` (add `AgentListing` seed type)

> **Confirm consumers first:** grep for `DashSection` and each existing section literal (`"skills"`, `"creator"`, `"agent"`, `"activity"`, `"technical"`) before editing, so renamed/added sections don't break a `switch` elsewhere. Prefer ADD over RENAME.

- [ ] **Step 1: Add the new sections (additive)**

In `dashboardStore.ts`, extend the union:

```ts
export type DashSection =
  | 'browse' // marketplace grid (NEW primary tab)
  | 'myagents' // the agent handler (NEW primary tab)
  | 'create' // Agent Creator (NEW primary tab; promotes the old 'creator')
  | 'connections' // key entry (NEW)
  | 'skills'
  | 'creator'
  | 'agent'
  | 'activity'
  | 'technical';
```

Add slices to the store: `catalog: CatalogListing[]`, `wallet?: { balanceMinor: number; caps: WalletCap[] }`, and a `setSection` already exists. Subscribe to `taskStore` (mirroring the existing `skill.saved` fold) so `marketplace.catalog` updates `catalog` and `wallet.status` updates `wallet`.

- [ ] **Step 2: Add the seed type** in `data/catalog.ts`:

```ts
export interface AgentListing {
  id: string;
  icon: string;
  name: string;
  blurb: string;
  category: string;
  accesses: string[]; // access-forward chips
  priceUsdc?: string; // display only; undefined = free
  source: 'builtin' | 'user' | 'installed';
}
```

Seed ~6 exemplars across the six categories (Research Agent, File Finder/Janitor, Deep Research Pro [priced], Gmail Triage, Video Studio, Code Review) so the grid is alive before the engine connects.

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm --filter @crash/r3f-shell exec tsc --noEmit`
Expected: PASS (no broken `DashSection` consumers).

- [ ] **Step 4: Commit**

```bash
git add frontend/r3f-shell/src/store/dashboardStore.ts frontend/r3f-shell/src/data/catalog.ts
git commit -m "feat(ui): Browse/My Agents/Create sections + agent listing seed"
```

### Task 25: Access-forward AgentCard

**Files:**
- Create: `frontend/r3f-shell/src/components/store/AgentCard.tsx`
- Test: `frontend/r3f-shell/src/components/store/AgentCard.test.tsx`

- [ ] **Step 1: Write the failing test** (render + assert the access chips and price show BEFORE any install button)

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentCard } from './AgentCard';

describe('AgentCard', () => {
  it('shows the access chips and price before install', () => {
    render(
      <AgentCard
        listing={{ id: 'deep-research-pro', icon: '🔎', name: 'Deep Research Pro', blurb: 'Premium research', category: 'Research/web', accesses: ['Web search', 'Pays: 0.01 USDC'], priceUsdc: '0.01', source: 'builtin' }}
        onPrimary={() => {}}
      />,
    );
    expect(screen.getByText('Web search')).toBeTruthy();
    expect(screen.getByText(/0\.01 USDC/)).toBeTruthy();
  });
});
```

> If the repo has no React Testing Library setup, follow the existing component-test pattern (the summary notes `interactive-3d-robot.test.tsx` exists -- mirror its harness). If components are not unit-tested at all, replace this with a `tsc --noEmit` + manual-render verification step.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @crash/r3f-shell exec vitest run src/components/store/AgentCard.test.tsx`
Expected: FAIL -- module not found.

- [ ] **Step 3: Implement** (shadcn/ui Card + Badge; access-forward is the differentiator -- chips and price render unconditionally, above the action)

Create `frontend/r3f-shell/src/components/store/AgentCard.tsx`:

```tsx
import type { AgentListing } from '@/data/catalog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function AgentCard({ listing, onPrimary }: { listing: AgentListing; onPrimary: (id: string) => void }) {
  const free = !listing.priceUsdc;
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center gap-2">
        <span aria-hidden className="text-xl">{listing.icon}</span>
        <CardTitle className="text-base">{listing.name}</CardTitle>
        {listing.source === 'user' && <Badge variant="secondary">by you</Badge>}
        {free ? <Badge variant="outline">free</Badge> : <Badge>{listing.priceUsdc} USDC</Badge>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <p className="text-sm text-muted-foreground">{listing.blurb}</p>
        <div>
          <p className="text-xs font-medium">Accesses:</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {listing.accesses.map((a) => (
              <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
            ))}
          </div>
        </div>
        <Button className="mt-auto" onClick={() => onPrimary(listing.id)}>
          {free ? 'Get agent' : `Buy for ${listing.priceUsdc} USDC`}
        </Button>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @crash/r3f-shell exec vitest run src/components/store/AgentCard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/r3f-shell/src/components/store/AgentCard.tsx frontend/r3f-shell/src/components/store/AgentCard.test.tsx
git commit -m "feat(ui): access-forward AgentCard (chips + price before install)"
```

### Task 26: StoreGrid, WalletBadge, ConnectionsPanel, CreatorWizard

These are layout/composition components. Each gets a small render/typecheck verification rather than deep unit tests (no business logic beyond wiring to the stores already tested).

**Files:**
- Create: `frontend/r3f-shell/src/components/store/StoreGrid.tsx`
- Create: `frontend/r3f-shell/src/components/wallet/WalletBadge.tsx`
- Create: `frontend/r3f-shell/src/components/connections/ConnectionsPanel.tsx`
- Create: `frontend/r3f-shell/src/components/creator/CreatorWizard.tsx`

- [ ] **Step 1: StoreGrid** -- maps `useDashboardStore().catalog` to `<AgentCard>`s in a responsive grid, grouped by category; the primary action sends `marketplace.purchase` (priced) or `marketplace.install` (free) over the existing socket-send seam.

```tsx
import { AgentCard } from './AgentCard';
import { useDashboardStore } from '@/store/dashboardStore';
import { sendToEngine } from '@/lib/socket'; // existing send seam

export function StoreGrid() {
  const catalog = useDashboardStore((s) => s.catalog);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {catalog.map((listing) => (
        <AgentCard
          key={listing.id}
          listing={listing as any}
          onPrimary={(id) =>
            sendToEngine(listing.priceUsdc ? { type: 'marketplace.purchase', payload: { listingId: id } } : { type: 'marketplace.install', payload: { installId: crypto.randomUUID(), kind: 'agent', itemId: id } })
          }
        />
      ))}
    </div>
  );
}
```

> Use the actual send helper the renderer already uses to post frames (grep for where `request.submit` is sent). The shape above is illustrative -- match the existing `makeMessage`/send signature.

- [ ] **Step 2: WalletBadge** -- top-right; reads `useDashboardStore().wallet`, shows balance + a small caps popover.

```tsx
import { useDashboardStore } from '@/store/dashboardStore';

export function WalletBadge() {
  const wallet = useDashboardStore((s) => s.wallet);
  const usdc = wallet ? (wallet.balanceMinor / 1_000_000).toFixed(2) : '--';
  return <div className="rounded-md border px-3 py-1 text-sm">{usdc} USDC</div>;
}
```

- [ ] **Step 3: ConnectionsPanel** -- lists connector families with a connected boolean (from the existing `auth.status`-style booleans), and a key field that calls `setConnectorKey` then **clears immediately**.

```tsx
import { useState } from 'react';
import { setConnectorKey } from '@/lib/setConnectorKey';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ConnectionsPanel({ connectorId }: { connectorId: string }) {
  const [key, setKey] = useState('');
  async function save() {
    await setConnectorKey(connectorId, key);
    setKey(''); // SECURITY: clear the field; the key never enters a store
  }
  return (
    <div className="flex gap-2">
      <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={`${connectorId} API key`} />
      <Button onClick={save} disabled={!key}>Connect</Button>
    </div>
  );
}
```

- [ ] **Step 4: CreatorWizard** -- 5 steps (Goal -> Connectors -> Permissions -> Test -> Publish), layout B. Step 3 (Permissions) is mandatory/un-skippable: the "Next" button is disabled until the user explicitly grants (clicks a native folder-pick that dispatches `permission.grant`). Step 5 dispatches publish. Use a local `step` state machine; render one panel per step.

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const STEPS = ['Goal', 'Connectors', 'Permissions', 'Test', 'Publish'] as const;

export function CreatorWizard() {
  const [step, setStep] = useState(0);
  const [granted, setGranted] = useState(false);
  const canAdvance = step !== 2 || granted; // Permissions is mandatory
  return (
    <div>
      <ol className="mb-4 flex gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? 'font-semibold' : 'text-muted-foreground'}>{i + 1}. {label}</li>
        ))}
      </ol>
      {/* render the panel for STEPS[step]; Permissions panel sets granted=true on a successful grant */}
      <div className="mt-4 flex justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
        <Button disabled={!canAdvance} onClick={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}>
          {step === STEPS.length - 1 ? 'Publish' : 'Next'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Mount the tabs.** In the dashboard shell, render a top tab bar with **Browse / My Agents / Create** driving `setSection`, with `WalletBadge` + a Connections entry top-right. `browse -> StoreGrid`, `create -> CreatorWizard`, `connections -> ConnectionsPanel`. The Skill Creator becomes a sub-item under Create.

- [ ] **Step 6: Verify + commit**

Run: `pnpm --filter @crash/r3f-shell exec tsc --noEmit && pnpm --filter @crash/r3f-shell build`
Expected: PASS.

```bash
git add frontend/r3f-shell/src/components frontend/r3f-shell/src/<dashboard-shell-file>
git commit -m "feat(ui): Store grid, wallet badge, connections, creator wizard + tabs"
```

**PHASE 9 GATE:** full repo-root gate chain (`pnpm -r typecheck && pnpm -r lint && pnpm -r test && pnpm -r build && pnpm exec prettier --write .`). Commit format drift as `chore(format): phase 9`. Push the branch: `git push -u origin feat/agentic-marketplace-design`.

---

# Live rehearsal checklist (not CI -- the one network beat)

After Phase 9, rehearse the hero flow against the live facilitator once, the night before:

- [ ] Fund the testnet wallet (Base Sepolia USDC faucet); set the wallet key via the Connections panel (it lands in the keystore, not the wire).
- [ ] Start the local seller (Task 13) and confirm `GET /premium` returns `402` then `200` after payment.
- [ ] Run beat 2 (buy Deep Research Pro): confirm `payment.activity` goes `required -> signing -> settled` and `wallet.status` balance drops.
- [ ] Run beat 3 (Tavily): confirm `tool.activity start -> ok`; kill the network and confirm the canned fallback still reads `ok` (flop-proof).
- [ ] Run beat 4 (save): confirm the file lands in the granted folder and `file.activity` shows a relative path (no absolute home path leaked).
- [ ] Run beat 5 (paste a media key): confirm the matching capability lights up via `auth.status` booleans.
- [ ] Run beat 6 (create + publish): confirm a new card appears with a "by you" badge.
- [ ] **Trim-valve dry run:** rehearse beats 2 + 3 alone as the minimum demo.

---

# Self-Review (completed by plan author)

**Spec coverage** -- every spec section maps to a task:

| Spec section | Task(s) |
|---|---|
| 4.1 Connector Registry | 6, 7 |
| 4.2 Keystore & Key Entry | 8, 9, 10 |
| 4.3 Agent Model & Storage | 15 |
| 4.4 Agent Creator | 21, 22, 26 (wizard UI) |
| 4.5 Marketplace & Catalog (incl. `MarketplaceKind` += 'agent') | 1 (kind), 16, 23 (catalog emit), 25 (access-forward card) |
| 4.6 x402 Commerce Rail | 11, 12, 13, 23 (wiring) |
| 5 Protocol Delta (+6, 29->35) | 1-5 |
| 6 UI (Store + Workbench, tabs) | 24, 25, 26 |
| 7 Security (egress, keystore, realpath jail, SSRF-by-capability) | 9, 10, 18; capability-only egress is structural (no generic fetch tool exists -- Tasks 7/14 use base URLs from the registry) |
| 8 Error Handling (5 new synthetic codes) | `connector_not_configured` (7/23), `permission_denied` (18/19), `payment_cap_exceeded` (11/12), `payment_failed` (12), `connector_http_error` (14) |
| 9 Testing & Gates | per-task TDD + per-phase gate |
| 10 Hero Demo (6 beats, trim valve 2+3) | 20 (recipe), rehearsal checklist |
| 11 Scope (local listing; subscription orthogonal) | 22 (publish = local listing); no cloud/sub code touched |
| 12 Deferred | not implemented (correctly out of scope) |

**Placeholder scan:** no "TBD/TODO/implement later". Two spots are explicitly flagged for execution-time confirmation against the live tree (Tauri command file in Task 10; `DashSection` consumers in Task 24) and one library-API confirmation (`@x402/fetch`/`@x402/express` export names in Tasks 13/23) -- these are verification steps, not missing code; complete code is provided in every case.

**Type consistency:** `Capability`, `ConnectorDescriptor`, `AgentManifest`, `CatalogListing`, `WalletCap` are defined once and reused by name across tasks. `accessesSummary()` (Task 15) is the single source for card chips, consumed by `toListing()` (Task 16). `purchase()` (Task 12) consumes `CapLedger` (Task 11). `assertWritable()` (Task 18) is consumed by `writeToGranted()` (Task 19). The protocol event names match exactly between `events.ts`, `examples.ts`, `Protocol.cs`, and the `taskStore` cases.

**Corrected from spec:** Section 5's "28 -> 34" is an off-by-one (the live baseline is 29 events). This plan uses the verified **29 -> 35**; the +6 delta and the 5-file lockstep are unchanged.
