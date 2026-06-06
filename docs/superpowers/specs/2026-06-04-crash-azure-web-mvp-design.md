# Crash — Azure Web MVP (Agentic Commerce Marketplace)

> Spec for the GitHub Copilot + Microsoft Azure hackathon build (2026-06-04). Approved in chat.
> Build window: ~4 hours. Branch: `feat/azure-web-mvp`.

## Problem / Goal

Turn Crash (a Tauri **desktop** "eBay for AI agents") into a **judge-visitable web app deployed end-to-end on Azure**, where humans and AI agents **buy, sell, and run** AI capabilities and **pay per call in USDC over x402**. The demo must hit **real APIs** (Tavily, Azure OpenAI, Base Sepolia x402), let anyone **publish their own agent with their own price**, and present a **decluttered, polished** UI.

Winning narrative: *"Pick an agent — it runs for real (live web search + Azure OpenAI reasoning), pays its own way over x402, returns a cited result. Publish your own agent, set a price, earn. All on Azure."*

## Decisions (locked)

- **Demo surface:** Web app on Azure (desktop build stays buildable but is not the demo).
- **Frontend host:** Azure Static Web Apps (Vite/React build, new "web mode").
- **Backend host:** Azure Container Apps — one Node container = engine + marketplace service.
- **Inference:** Azure OpenAI primary (gpt-4o-mini / gpt-4o), GMI Llama fallback.
- **Payments:** Base Sepolia **testnet** USDC via real x402 (honestly labeled testnet).
- **State:** in-memory + periodic JSON snapshot (Cosmos DB is the "scale" talking point, not built tonight).

## Architecture

```
Judge browser
  | HTTPS
Azure Static Web Apps  -> Vite/React r3f-shell (web mode; no Tauri APIs)
  | HTTPS + WSS
Azure Container Apps    -> Node container (engine + marketplace service)
  ├─ Marketplace API: listings, publish, buy, activity, earnings
  ├─ Agent runtime (cloud provider): plan (Azure OpenAI) -> search (Tavily) -> pay (x402) -> synthesize (Azure OpenAI) -> cited answer
  ├─ x402 payments: Base Sepolia testnet USDC (real onchain settle)
  └─ State: in-memory + JSON snapshot
External real APIs: Tavily · Azure OpenAI · Base Sepolia RPC + x402 facilitator
```

### The one hard reframe — server-side "cloud" provider
The deployed engine cannot spawn the Claude CLI. Add an **HTTP-only `cloud` provider** implementing the existing provider interface, used by default when running on the server. The agent becomes a real pipeline:
1. **Plan** — Azure OpenAI turns the user goal into a search query + intent.
2. **Search** — Tavily real HTTP call.
3. **Pay** — x402 real testnet settlement, per call; wallet/cap decremented.
4. **Synthesize** — Azure OpenAI produces a cited answer.
5. **Stream** — emit the same WS step/result events the UI already renders.

The Tauri/CLI providers stay for the desktop build.

## Scope

### MUST (core loop that wins)
1. **Declutter** dashboard: 6 surfaces -> 4: **Marketplace** (home: Browse + Sell), **Ask Crash** (chat), **Studio** (publish + my agents + earnings), **Wallet**. Skills / Skill Creator / Connections fold in.
2. **Run an agent for real** — click -> x402 pay (testnet) -> live streamed steps -> cited result -> wallet ticks down by the real charge.
3. **Publish your own agent (seller flow)** — form: name, blurb, icon, behavior/system prompt, allowed skills (Tavily, inference), **price per run**. Publishing lists it live AND it actually runs via the cloud pipeline using the seller's prompt. Seller earns price per run (tracked).
4. **Wallet** — spend-capped USDC, balance, per-agent caps, real testnet settlement, ledger.
5. **Deployed on Azure**, judge-visitable URL.

### SHOULD (wow polish)
6. Live **activity ticker** — real "X bought / Y earned / Z listed" events from the service.
7. Seller **earnings** view.
8. Clean loading / empty / error states; mobile-passable.

### WON'T (this round — YAGNI)
- Multi-user auth/accounts (single shared demo wallet + ephemeral seller identity).
- Mainnet real money.
- Durable DB beyond JSON snapshot.
- Desktop parity for the new seller flow (web-first; desktop still builds).
- Claude-CLI provider on the web.

## Data model (marketplace service)

- **Listing**: `{ id, name, blurb, category, icon, glow, price (display), pricing: { model:'per_run', amountMinor, currency:'USDC' }, runtime: { systemPrompt, allowedSkills: ('tavily'|'inference')[] }, seller: { kind:'human'|'agent', id, name }, acquiredCount, createdAt, featured? }`
- **Run**: `{ id, listingId, buyer, costMinor, txHash, startedAt, steps[], result, citations[] }`
- **Activity**: `{ id, kind:'listed'|'bought'|'ran'|'earned', actor, listingName, amountMinor, ts }`
- **Wallet**: `{ balanceMinor, caps: { agentId, capMinor, spentMinor }[], ledger: {...}[] }`

USDC = 6 decimals, integer "minor" units (0.01 USDC = 10_000).

## API (REST + WS)

- `GET /api/health` — liveness for Container Apps.
- `GET /api/config` — public boot config for the web frontend (engine WS URL, network label, no secrets).
- `GET /api/listings` · `POST /api/listings` (publish) · `GET /api/activity` · `GET /api/wallet`.
- `POST /api/run` `{listingId, input}` — buy+run; streams over WS.
- **WS events:** `listing.created`, `run.step`, `run.done`, `wallet.status`, `activity`.

## Deploy plan (Azure)

1. **Provision early** (de-risk): Resource group; Azure OpenAI resource + a `gpt-4o-mini` deployment; Static Web App; Container Apps env + app; (optional) Container Registry.
2. **Skeleton deploy first**: empty web build to SWA + current Node server to Container Apps; confirm the URL is live and health is green.
3. **Iterate**: redeploy as features land. Frontend via SWA CLI / GitHub Action; backend via `az containerapp up` (source build) or image push.
4. **Secrets**: Tavily / Azure OpenAI / x402 keys as Container Apps secrets + app settings; SWA gets only the public WS URL. Nothing secret committed; `.env` stays gitignored.

## Demo script (3 min)

1. Land on the marketplace URL — agents/skills/workflows, live activity ticker scrolling real events.
2. Run **Autonomous Research Agent** on a live question -> watch it plan, pay x402 (testnet tx shown), search Tavily, reason on Azure OpenAI, return a cited brief. Wallet ticks down.
3. **Publish your own agent** — name it, give it a behavior + price, hit Publish. It appears live.
4. Run the just-published agent -> it executes for real. Seller earnings increment.
5. "All deployed on Azure: Static Web Apps + Container Apps + Azure OpenAI. Built today with GitHub Copilot."

## Risks & mitigations

- **Azure deploy is the long pole** -> skeleton-deploy first, iterate.
- **Azure OpenAI quota/provision delay** -> provision first thing; GMI fallback keeps inference real.
- **Testnet RPC/faucet flakiness** -> pre-fund demo wallet; honest "testnet" labels; simulated-but-labeled only if the rail is down.
- **Secrets in a public repo** -> all via Azure config + gitignored `.env`; never committed (hard rule).
- **Time** -> the core loop + deploy ship before any SHOULD polish.

## Execution machinery (requested)

Spec-driven (this doc) -> council pressure-test -> agent-team fan-out (frontend-declutter · marketplace-service · cloud-agent-runtime · x402/wallet · azure-deploy · browser-verify) -> save winning team as `/crash-ship` + Azure-deploy skill -> continuous OneDrive tasklist/notes/logs -> Playwright browser-verify the live URL -> push branch-first with green gates.
