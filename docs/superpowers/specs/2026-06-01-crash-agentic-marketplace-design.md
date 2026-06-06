# Crash -- Agentic Marketplace Pivot: Design Spec

- **Date:** 2026-06-01
- **Status:** Approved (brainstorming complete; pending implementation plan via writing-plans)
- **Event:** Agentic Commerce Build Day, 2026-06-02 (Microsoft SoHo, 300 Lafayette). Sponsors: Microsoft, Tavily, Coinbase (x402). Build partners: Tavily, x402, Lovable.
- **Paired trackers:** OneDrive `TASKLIST/NOTES/LOGS ALL CC SESSIONS/2026-06-01_Crash-Agentic-Marketplace-Pivot/`

---

## 1. Motivation & Context

Crash today is a Tauri desktop app whose dashboard is a **skill creator** ("ABCmouse for AI"). On Day 1 of the hackathon the team was **not** selected to demo, with the explicit reason that sponsor products were not used deeply enough. This pivot is therefore driven by **deep sponsor-API integration**.

The product pivots from "skill creator" to an **agentic marketplace**: agents are browsed, bought, sold, edited, uploaded, and published. The user keeps the existing **subscription** model (platform access + bring-your-own LLM), and gains:

- An **agent handler** ("My Agents") to manage agents they own while browsing others'.
- Agents that **automate real tasks** and can **read the whole machine and write to user-granted folders**, and search the filesystem autonomously.
- Support for **any AI vendor via any API key** -- not a fixed fal.ai/ElevenLabs whitelist. The user brings their own key and the agent is "already wired."
- An **Agent Creator** (promoted to flagship; the old Skill Creator is demoted to a sub-item) that turns a plain-language goal into an agent that is excellent at that goal.
- A **commerce rail** (Coinbase x402) for buying agents and for agents paying for premium tools/data.

This builds on the shipped v0.1.0 (github.com/ron2k1/crash). The pivot is **largely additive** to the existing engine + protocol.

## 2. Goals / Non-Goals

**Goals (tonight's spec):**

1. A vendor-agnostic **connector registry** so any AI company / any API key is pluggable by config, not code.
2. An **Agent Creator** wizard that drafts an excellent agent (system prompt + connectors + permissions) from a plain goal.
3. An **x402 commerce rail** (buy an agent with testnet USDC) wired end-to-end for one hero agent.
4. A **transparency-forward marketplace UI** (eBay-like, but honest about machine/key access).
5. A **flop-proof demo**: the filmed flow survives a dead network.

**Non-goals (explicitly out tonight):**

- Real **cloud hosting** of agents (a published agent runs locally; "deploy" = a local listing). 
- **Azure AAD / runtime** integration (Azure is pitch + architecture-diagram only).
- **Mainnet** payments (Base **Sepolia testnet** only, free-faucet USDC, $0 real).
- Streaming/conversational voice (TTS one-shot only).
- Multi-user / remote marketplace sync (catalog is local + seeded).

## 3. Architecture Overview

The monorepo is unchanged in shape: a pnpm workspace with `protocol/` (zod event contract, mirrored in `Protocol.cs`) -> `backend/` (`@crash/engine`, headless Node) -> `frontend/{r3f-shell (Tauri 2 + React 19 + react-three-fiber + shadcn/ui + Tailwind v4), unity}`.

The **engine remains the one translation layer.** The orchestrator translates an `AgentProvider`'s output (ClaudeCode / Codex / Deterministic) into a frozen localhost-WebSocket protocol; renderers stay thin WS clients. All new behavior (connector dispatch, recipe runner, payments) lives in the engine or new modules it calls -- never in a renderer.

**Execution model = Hybrid A+B** (decided in brainstorming):

- The engine **connector/tool layer + marketplace events** are built **once** and shared by all agents.
- The **filmed hero flow** runs as a **deterministic recipe** (a fixed beat sequence that cannot flop on stage).
- **Other catalog agents** use **autonomous provider execution** (the LLM drives tool calls).
- Both paths call the same engine connector modules, so the recipe is a thin scripted wrapper, not a parallel implementation.

## 4. Components

### 4.1 Connector Registry (replaces the fixed tool set)

A registry of **connector families**, each covering many vendors by configuration. A new vendor is a ~10-line descriptor, not new code.

Families:

| Family | Example vendors | Capabilities |
|---|---|---|
| `openai-compatible` | OpenAI, Azure-OpenAI, Groq, Mistral, OpenRouter, Perplexity, DeepSeek, Together, Ollama | `chat` |
| `anthropic` | Anthropic | `chat` |
| `image` | fal, replicate, stability, openai-images | `image.generate` |
| `tts` | elevenlabs, openai-tts | `tts.speak` |
| `search` | tavily, brave, serper | `search` |
| `video` | higgsfield, runway, luma, pika, kling, fal-video, replicate | `video.generate` |
| `x402` | (commerce rail) | special |
| `fs` | (local filesystem) | special, local-only |

Descriptor shape (zod-validated):

```
ConnectorDescriptor {
  id: string                 // "tavily", "openai", "higgsfield"
  family: ConnectorFamily
  baseUrl: string
  auth: { scheme: "bearer" | "header", headerName?: string }
  capabilities: Capability[] // ["search"], ["chat"], ["video.generate"], ...
  models?: string[]
}
```

**Capability-based resolution is the core mechanic.** An agent manifest references a **capability** (e.g. `video.generate`), not a vendor. At run time the engine resolves the capability to whichever connector (a) declares it AND (b) has a key in the keystore. So when a user pastes a Higgsfield key, every agent that needs `video.generate` is instantly wired -- "bring your own, already wired properly." If no keyed connector provides a required capability, the engine emits `connector_not_configured` and the UI prompts the user to add a key in Connections.

### 4.2 Keystore & Key Entry

- **Store:** `~/Crash/.secrets/connectors.json`, file mode `0o600`, read by the engine at boot. Maps `connectorId -> apiKey`. The **x402 wallet private key** lives in the same store.
- **Entry path:** a **Tauri native IPC** command `set_connector_key(connectorId, key)`. The key **never crosses the WebSocket**, is **never logged** (synthetic codes only), and is **never placed in a renderer store**. The input field clears on submit.
- **Renderer view:** the UI shows **connected booleans only**, reusing the existing `auth.status` event. This is why the protocol delta stays at +6 (no new "connector status" event).

This is the honest extension of Crash's existing BYO-auth posture (booleans derived from exit codes / file existence): the engine handles secret material; the renderer and the protocol stay secret-free.

### 4.3 Agent Model & Storage

An **agent** is the existing `SavedSkill` plus a tools/permissions manifest and optional price. Mostly additive + a rename.

```
AgentManifest {
  id, name, goal
  systemPrompt: string          // or a path ref under the pack
  requires: { capabilities: Capability[] }      // capabilities, not vendors
  permissions: { readBroad: boolean, writeFolders: string[] }
  price?: { amountMinor: number, asset: "USDC", payTo: string }   // x402 listing
  source: "builtin" | "user" | "installed"
  createdAt: string
}
```

Storage:

- `~/Crash/agents/<slug>/` -- agent packs (`manifest.json` + `systemPrompt.md`).
- `~/Crash/grants.json` -- granted write folders (NOT secret).
- `~/Crash/skills/<slug>/` -- existing skills, unchanged.

### 4.4 Agent Creator (flagship; guided wizard)

An **agent-architect** meta-flow that runs on the user's BYO LLM. UI = a **guided wizard** (decided: layout choice B) with five steps that map one-to-one onto demo beats:

1. **Goal** -- the user types a plain-language goal.
2. **Connectors** -- the architect proposes the capabilities needed; user confirms/edits.
3. **Permissions** -- the architect proposes read/write scope; user grants explicitly (mandatory, un-skippable step -- the strongest expression of access transparency).
4. **Test** -- run the drafted agent once, inline.
5. **Publish** -- save as an editable agent pack and list it locally (optionally x402-priced).

The architect drafts a strong system prompt + selects capabilities + suggests permissions. A **deterministic template fallback** produces a usable agent offline, so the Creator never hard-fails on a dead network.

### 4.5 Marketplace & Catalog

- **Catalog source:** a **local seeded catalog** bundled with the app, plus user-published and installed agents. The only on-stage network dependency is the one x402 testnet call.
- **Listings:** ~26 across six categories -- Research/web, Files/computer, Comms/inbox, Creative/media, Code/dev, Career/study.
  - **Featured + wired end-to-end (firm commitment):** **Research Agent** (search capability, e.g. Tavily), **File Finder / Janitor** (fs capability), and **one x402-paid agent** ("Deep Research Pro"). Named seed exemplars include `gmail-scraper` / Gmail Triage, `personalized-newsletter`, Video Studio, Deal Hunter, Code Review. The remaining seeds are real manifests runnable on the autonomous path; the exact final roster is finalized at build time.
  - **Media listings are BYO-key capability families** (image/tts/video) -- no hardcoded vendor, no per-use pricing.
- **Card design (decided: card choice B -- access-forward):** every listing card renders **connector chips** + a one-line **"Accesses:"** summary derived from its manifest, shown **before install**, plus price. Free agents show a subtle "free" tag; user-published agents get a "by you" badge. Rationale: an agent marketplace has a trust problem eBay does not -- you are granting software access to your machine and keys -- so access transparency is the differentiator.
- **`MarketplaceKind`** enum gains `'agent'` (currently `'skill' | 'plugin'`).

### 4.6 x402 Commerce Rail

- **Buyer = the engine** (`@x402/fetch`). **Seller = a tiny `@x402/express`** server on a **second loopback port** (a local stand-in for a paid resource).
- **Facilitator:** the free testnet facilitator `https://x402.org/facilitator` (no signup). **Network:** Base Sepolia (`eip155:84532`), **testnet USDC** via free faucet.
- **Flow:** `GET` -> `402 + X-PAYMENT-REQUIRED` -> engine signs an **ERC-3009 `TransferWithAuthorization`** (gasless USDC) -> retry with `X-PAYMENT` -> facilitator verifies + settles -> resource returned.
- **Wallet model:** a single **user wallet** + **per-agent spend caps**, enforced engine-side **before signing** any transfer. Over-cap -> `payment_cap_exceeded` (no signing occurs).

## 5. Protocol Delta (+6 events: 28 -> 34)

Minimized to cut the per-event lockstep cost. Each new event maps to a visible demo beat.

- **Reuse `request.submit`** with an **optional `agentId`** -- "run an agent" needs no new event.
- **Renderer -> Engine (+2):**
  - `marketplace.purchase { listingId }`
  - `permission.grant { folder }`
- **Engine -> Renderer (+4):**
  - `marketplace.catalog { listings[] }`
  - `tool.activity { agentId, tool, phase, code? }`
  - `payment.activity { agentId, phase: "required" | "signing" | "settled", amount, asset, network, payTo?, txRef? }`
  - `wallet.status { balanceMinor, caps[] }`

**Each new event requires a 5-file lockstep:** `protocol/src/events.ts` (schema) + `protocol/src/examples.ts` (example) + `protocol/Protocol.cs` (C# drift mirror) + `backend/test/protocol-link.test.ts` (the `toHaveLength` count, 28 -> 34) + `frontend/r3f-shell/src/store/taskStore.ts` `reduce()` never-guard, plus `protocol/test/contract.test.ts`. Missing one file fails the drift guard.

## 6. UI / Dashboard (Section 4 -- locked)

- **Information architecture (decided: layout B -- Store + Workbench split):** top tabs **Browse** (marketplace grid) / **My Agents** (the handler) / **Create** (Agent Creator). Wallet balance + a Connections entry live top-right. This bills "build your own" equal to "shop." The dashboard is resized larger to feel like a storefront. The Skill Creator becomes a sub-item.
- **Card:** access-forward (Section 4.5).
- **Agent Creator:** guided wizard (Section 4.4).

## 7. Security

**Preserved invariants (must not weaken):**

- Socket is **loopback-only bind** + **24-byte token**; `socket.json` at `0o600`.
- **Every outbound frame** passes `EngineToRendererSchema.safeParse`.
- **Error events carry synthetic `code` + `retryable` only** -- never `err.message`, response bodies, or stack traces, over the wire or into logs.
- BYO-auth stays booleans.

**New surface 1 -- secrets keystore:** engine-only `connectors.json` (`0o600`); keys via Tauri native IPC, never on the wire, never logged, never in a renderer store (Section 4.2).

**New surface 2 -- outbound HTTPS** (the engine made zero outbound calls before). Mitigation is structural: **agents invoke capabilities, not URLs.** There is no generic "fetch this URL" tool, so egress is implicitly allowlisted to the connector registry's known vendor base URLs + the x402 facilitator + the local seller port. The `fs` connector is local-only. This is the SSRF boundary.

**Hardening promoted into scope tonight -- realpath write-jail.** `assertInsideWorkspace` (`backend/src/workspace/paths.ts:53-60`) is currently a **lexical** prefix check. It gates writes only; broad reads are already allowed (`orchestrator.ts` `readPath = this.targetPath ?? workspace.docsDir`). The moment `permission.grant { folder }` broadens writable roots, the lexical check is vulnerable to **symlink escape** (a symlink inside a granted folder pointing outside it). Fix: **canonicalize with `realpath` (following symlinks), then verify ancestry** under a granted root before any write.

**x402 wallet safety:** single wallet + per-agent caps enforced **before signing**; testnet only (Section 4.6).

## 8. Error Handling

New synthetic codes extend the existing enum; all carry `code` + `retryable` only:

| Code | Trigger | retryable |
|---|---|---|
| `connector_not_configured` | a required capability has no keyed connector | false (user adds key) |
| `permission_denied` | write attempted outside a granted folder | false |
| `payment_cap_exceeded` | transfer would exceed the per-agent cap | false (rejected pre-signing) |
| `payment_failed` | facilitator verify/settle failed | true |
| `connector_http_error` | vendor returned non-2xx (no body retained) | depends on status class |

`payment_required` is **not** an error -- it is a beat surfaced via `payment.activity { phase: "required" }`. The Agent Creator and the hero recipe keep deterministic offline fallbacks, so a dead network degrades gracefully.

## 9. Testing & Gates

**Lockstep:** the +6-event 5-file lockstep (Section 5) -- known, budgeted cost.

**New unit tests:**

- Connector-descriptor zod validation + capability -> connector resolution (mocked fetch, no network).
- Keystore set/get round-trip + `0o600`; assertion that **no key ever appears in a safeParse'd frame**.
- **Security-critical:** a symlink inside a granted folder that points outside is **rejected** by the realpath write-jail.
- Payment cap: an over-cap transfer is rejected **before signing** (`payment_cap_exceeded`).
- Recipe runner: the hero beat sequence holds with the network stubbed (flop-proof guarantee).

**Gate chain (from the repo root -- pnpm workspace):** typecheck + lint + test + build + `prettier --write` (write, not just check, to avoid subagent format-drift). Branch-first; push green.

## 10. Hero Demo Flow (Section 3 -- locked, 6 beats)

1. **Browse** the marketplace grid. *(recipe)*
2. **Buy "Deep Research Pro" with USDC.** *(LIVE x402, Base Sepolia -- the only hard network dependency; pre-funded testnet wallet)*
3. **Run** the agent's Tavily-backed search. *(recipe-wrapped, with a canned fallback)*
4. **Save** the result to a user-granted folder. *(LIVE fs write)*
5. **BYO-key media wow:** paste a video/image/voice key (e.g. Higgsfield) and the matching agent lights up. *(LIVE, capability resolution)*
6. **Agent Creator:** build a new agent from a plain goal and **Publish** it to the grid. *(recipe)*

Flop-proofing: beats 1/3/6 are recipe-driven; beat 2 is the headline sponsor beat on a pre-funded testnet wallet; beats 4/5 are local / own-account. **Trim valve:** if time is short, beats 2 + 3 (Coinbase + Tavily) are the minimum demo.

## 11. Scope Boundaries (confirmed by user)

1. **"Deploy / publish an agent" = a local marketplace listing** (manifest + system prompt + connector/permission requirements), optionally x402-priced. Real cloud hosting (remote execution) is **out tonight**.
2. **Subscription vs x402 are orthogonal.** Subscription = platform access + the user's own BYO LLM/keys (unchanged). x402 = the commerce rail only (buying agents; agents paying for premium tools/data).

## 12. Deferred (post-Monday)

- Realpath ancestry check is in scope tonight; broader workspace-jail audit (all call sites) deferred.
- Mainnet payments, cloud agent hosting, Azure AAD runtime, multi-user catalog sync.
