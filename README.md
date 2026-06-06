<div align="center">

# Crash

**A desktop agent marketplace with a real payment rail -- buy agents, and let them pay per call for the tools and data they use.**

[![quick-check](https://github.com/ron2k1/crash/actions/workflows/quick-check.yml/badge.svg?branch=main)](https://github.com/ron2k1/crash/actions/workflows/quick-check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2563eb.svg)](LICENSE)
![Platform: Windows](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white)
![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![payments: x402](https://img.shields.io/badge/payments-x402-0052FF)
![search: Tavily](https://img.shields.io/badge/search-Tavily-6E56CF)

<sub>Built for <b>Agentic Commerce Build Day</b> (2026-06-02, Microsoft SoHo) -- deep integration of the Coinbase <b>x402</b> payment rail and <b>Tavily</b> search, fronted by a local agent marketplace.</sub>

</div>

Crash is a desktop app and a local **agent marketplace**. You browse, buy, and publish AI
agents and skills, and the agents you run can **pay for premium tools and data on their own**
over the Coinbase **x402** micropayment rail. The headline capability is a **Research Agent**
that pays [Tavily](https://tavily.com) per search with x402 and returns a cited brief -- one
HTTP round-trip that is simultaneously a USDC micropayment and a live web search.

It grew out of a guided-AI desktop app: a headless engine, an interactive 3D guide, and a
loop that turns a run into a re-runnable skill saved to your workspace. The **marketplace and
the payment rail are the new surface** -- capabilities now have prices, and agents can transact.

## What it is

- **A local marketplace.** A secret-free storefront (`marketplace-server`, Express + WebSocket
  on `:8787`) serving real-time browse / buy / sell with live broadcast. Listings are agents,
  skills, and plugins; a "buy" records a sale and broadcasts it to every connected client.
- **A real x402 commerce rail.** A working Coinbase x402 buyer (ERC-3009 gasless USDC
  `TransferWithAuthorization`) wired into two live paths: **buying an agent**
  (`marketplace.purchase`) and **an agent paying for a tool** (the Research Agent's Tavily
  search). It fails closed without a funded wallet and never fabricates a settlement.
- **Tavily-backed research that pays per call.** The Research Agent calls Tavily's first-party
  x402 endpoint -- keyless, you pay USDC instead of authenticating -- and returns cited results,
  with a canned brief as a flop-proof fallback when the network or wallet is unavailable.

## Sponsor integrations (Agentic Commerce Build Day)

Every claim below is grounded in the code on this branch. The payment and search rails are
**wired end-to-end**; live settlement is gated on an operator-supplied funded wallet at run
time (build-now / fund-later), and the buyer fails closed until then -- it never fakes a result.

### Coinbase -- x402 payment rail (wired)

- **Real buyer.** `backend/src/payments/buyer.ts` performs the full 402 loop: on an HTTP `402`
  it parses the payment requirements, signs an ERC-3009 USDC `TransferWithAuthorization` (gasless)
  with `viem` + `@x402/evm`, retries with the `X-PAYMENT` header, and reads the on-chain `txRef`
  from the `x-payment-response` header. Built on `@x402/core`, `@x402/evm`, `@x402/express`,
  `@x402/paywall`, and `viem`.
- **Two live call sites.** Buying an agent (`marketplace.purchase`) settles against a configured
  seller resource on **Base Sepolia** testnet (`eip155:84532`); the Research Agent's paid search
  settles on **Base mainnet** (`eip155:8453`, Tavily's network -- see below).
- **Spend-capped and fail-closed.** Per-agent USDC caps (`CapLedger`) are enforced **before**
  signing -- an over-budget run never even constructs a signature. The wallet private key is read
  from the engine keystore (`0o600` `keys.json`) at call time, never crosses the WebSocket, and is
  never logged. With no funded wallet the buyer throws a synthetic code at signing rather than
  returning a fake `{ ok: true }`.

### Tavily -- paid web search (wired)

- **The fuse.** `backend/src/connectors/paidSearch.ts` runs a Tavily search **through** the x402
  buyer, so a single round-trip is both the payment and the search. The Research Agent points it
  at Tavily's first-party x402 endpoint `https://x402.tavily.com/search` -- **keyless**, settling
  **0.01 USDC on Base mainnet** per call.
- **Degradation ladder** (`backend/src/socket/session.ts` `runResearch`): paid x402 search when an
  endpoint + wallet are configured; a plain Bearer search (`backend/src/connectors/search.ts`) if
  only a Tavily API key is present; a canned brief otherwise. The search response body is parsed
  for hit title / url / content only and is never logged.

### Microsoft -- host and sponsor (roadmap, not integrated)

- Microsoft **hosts and sponsors** Agentic Commerce Build Day (Microsoft SoHo, 300 Lafayette).
- **Azure is not integrated.** There are no `@azure/*` imports in the engine; the only Azure
  packages in the lockfile are transitive dependencies of `viem` / `@x402/evm`. Azure AAD and a
  cloud agent runtime are on the **roadmap**, called out explicitly here so the claim stays honest.

## Architecture

Crash is one brain with a swappable face, plus a storefront. A headless Node **engine** does all
the thinking and speaks a single **35-event protocol** (`PROTOCOL_VERSION = 3`) over a token-gated
`127.0.0.1` WebSocket. A **renderer** connects to that socket and draws whatever the engine emits;
it holds no product logic. A separate **marketplace-server** is the storefront -- a secret-free
Express + WebSocket service that lists agents and brokers buy/sell. **All x402 signing lives in the
engine**, never in the storefront: the storefront holds no keystore, no wallet, and makes no
outbound paid calls.

The shipped renderer is the **react-three-fiber + Tauri desktop app** in this repo
(`@crash/r3f-shell`). Because the protocol is renderer-agnostic, a Unity 6 parity client in
`frontend/unity/` speaks the same 35-event contract over the same socket -- a proof that the brain
is not welded to one face, not the demo path.

Two properties keep the system general rather than a hardcoded demo:

- **Provider-agnostic.** The engine drives either Claude Code or OpenAI Codex behind one interface;
  the provider name rides the handshake for display only.
- **Vertical-agnostic.** There is a single `request.submit` event and no per-feature message types.
  A marketplace agent is selected by an optional `agentId` on that one event -- which is why wiring
  the Research Agent's paid search added **zero** new protocol events.

## Tech stack

| Layer | Stack |
|-------|-------|
| Engine | Node 20 + TypeScript, `ws` WebSocket host, provider-agnostic agent loop, local RAG, skills I/O, the x402 buyer, and the Tavily connectors |
| Protocol | `@crash/protocol` -- a Zod-validated **35-event** contract (`PROTOCOL_VERSION = 3`); `events.ts` is canonical, `Protocol.cs` is the hand-mirrored Unity copy, kept honest by a drift-guard test |
| Payments | `@x402/core`, `@x402/evm`, `@x402/express`, `@x402/paywall`, `viem` -- ERC-3009 gasless USDC on Base (Sepolia for purchases, mainnet for the Tavily call) |
| Marketplace storefront | `@crash/marketplace-server` -- Express + `ws`, REST browse/buy/sell + real-time broadcast, secret-free |
| Desktop shell (shipped) | `@crash/r3f-shell` -- Tauri 2 + React 19 + react-three-fiber + Spline + Tailwind v4 + zustand |
| Unity parity client | Unity 6 (6000.4.x) over the same socket and the same 35-event contract -- a renderer-agnostic proof, not the demo |
| Tooling | pnpm 10.33 workspace on the TypeScript side; Cargo for the Tauri shell |

## Repository layout

| Path | What lives here |
|------|-----------------|
| `protocol/` | The contract. Canonical **35-event** socket protocol (`events.ts`), the C# mirror (`Protocol.cs`), one example per event, and a drift-guard test. Everything else depends on this. |
| `backend/` | The headless engine (`@crash/engine`): token-gated WS server, provider-agnostic agent loop (Claude Code / Codex / deterministic), local RAG, skills I/O, the **x402 buyer + cap ledger** (`src/payments/`), and the **Tavily search + paid-search fuse** (`src/connectors/`). |
| `marketplace-server/` | The storefront (`@crash/marketplace-server`): an Express + WebSocket service (`:8787`) for real-time browse / buy / sell. Holds no secrets, no keystore, and does no x402 signing -- it is an advertisement, not an executor. |
| `frontend/r3f-shell/` | The shipped desktop client (`@crash/r3f-shell`): Tauri 2 + React 19 + react-three-fiber. Connects to the real socket and renders the marketplace, the activity trace, and the agent run. |
| `frontend/unity/` | The Unity 6 parity client: the same 35-event socket and contract, a second renderer that proves the engine is face-agnostic. Not the demo path. |
| `curriculum/` | Source lessons, copied into the end-user workspace at first run. |
| `installer/` | Windows packaging: the engine-sidecar build script (`build-engine-exe.mjs`) and the NSIS runbook. |
| `docs/` | Design specs, implementation plans, contributor onboarding. The agentic-marketplace and Tavily-x402 specs live in `docs/superpowers/`. |

## Run it in 60 seconds

Prerequisites: **Node 20** (the version CI builds and tests against) and **pnpm 10.33**; the Rust
toolchain is only needed for the Tauri shell. Building the full desktop app or the Windows installer
additionally needs the MSVC C++ build tools and the WebView2 runtime -- see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). The web-shell dev path below needs none of that. The
engine is the renderer's server, so it must be up before any renderer connects.

```powershell
pnpm install                                   # 1. install all workspace deps
pnpm run build                                 # 2. build protocol + engine + shell + storefront
pnpm --filter @crash/marketplace-server run start  # 3. start the storefront on :8787
pnpm --filter @crash/engine run start          # 4. start the engine: binds 127.0.0.1 + a
                                               #    per-session token, writes the socket descriptor
pnpm --filter @crash/r3f-shell run dev         # 5. launch the web shell (Vite on :1420)
```

Then open <http://localhost:1420>. With no engine running, the renderer degrades gracefully
(idle / "engine closed") rather than white-screening.

### Turning on the live agentic-commerce rails

The x402 rails are **off by default and fail closed**. Opt in by setting non-secret config on the
engine before step 4; the funded wallet key is supplied at run time and is never committed:

```powershell
$env:CRASH_TAVILY_X402_URL = "https://x402.tavily.com/search"  # Tavily x402 (keyless, Base mainnet)
$env:CRASH_X402_SELLER_URL = "<your x402 seller resource>"     # marketplace.purchase target (Base Sepolia)
# The wallet private key is read at call time from the engine keystore key 'x402.wallet'
# (preferred; entered via the Connections panel) or, for headless runs, $env:CRASH_X402_WALLET.
# It never crosses the socket and is never logged. With no key, the buyer fails closed at signing.
```

For a renderer-free smoke test, drive one request straight through the engine on the command line:

```powershell
pnpm --filter @crash/engine run run:headless
```

## Workspace commands

The pnpm workspace spans `protocol`, `backend`, `frontend/r3f-shell`, and `marketplace-server`.
`frontend/unity` is a C# project, not a pnpm member.

```powershell
pnpm install            # install all workspace deps
pnpm run build          # build every package (protocol first, topological)
pnpm run typecheck      # type-check every package
pnpm run test           # run every package's vitest suite once (pnpm -r run test:run)
pnpm run shell:dev      # launch the full Tauri desktop app in dev (native window; runs Vite on :1420 under it)
pnpm run shell:build    # bundle the Tauri desktop app (Windows)
```

The storefront's tests use the Node test runner, so they are not picked up by the workspace
`test:run` and run explicitly:

```powershell
pnpm --filter @crash/marketplace-server run test
```

## Download and install

A tag-gated release workflow (`release.yml`) runs on Windows whenever a `v*` tag is pushed. It
packages the headless engine into a single executable, bundles it into the Tauri app as a sidecar
(so the installed app spawns its own engine on launch -- no Node required on the user's machine),
builds the Windows **NSIS installer** (`Crash_<version>_x64-setup.exe`), and creates a draft GitHub
Release with that installer attached for a maintainer to review and publish. The agentic-marketplace
build on this branch has not been tagged yet -- run from source with the steps above until it is.
See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full pipeline.

## Project status

Honest snapshot as of 2026-06-02 (the `feat/crash-tavily-x402-fuse` branch -- the agentic-marketplace
build, not yet merged to `main`).

- **Foundation:** the pnpm workspace is green -- build, typecheck, and test pass across `protocol`,
  `backend`, `frontend/r3f-shell`, and `marketplace-server`.
- **Protocol:** the **35-event** contract is frozen at `PROTOCOL_VERSION = 3`; `events.ts` is
  canonical, `Protocol.cs` mirrors it, and a drift-guard test fails if the two diverge. The
  marketplace, payment, and tool-activity events are all part of v3.
- **Marketplace:** the storefront (`marketplace-server`, `:8787`) runs -- REST browse/buy/sell plus
  a real-time WebSocket broadcast, seeded with a local agent catalog, and holds zero secrets.
- **Payments + research (wired):** the x402 buyer is live at both call sites
  (`marketplace.purchase` and the Research Agent's Tavily search). It is build-now / fund-later:
  with no funded wallet it fails closed at signing and a canned brief keeps the research beat;
  dropping a funded key in flips it to real settlement with zero code change.
- **Desktop shell:** wired to the real token-gated socket, rendering the marketplace and the agent
  run. The sign-in -> request -> streamed-answer loop runs.
- **CI:** every push and PR to `main` runs `quick-check` -- typecheck + tests on Ubuntu (Node 20)
  and `cargo test` for the Tauri shell on Windows. A tag-gated `release.yml` bundles the Windows
  app on `v*`.

### Known gaps

- Live x402 settlement requires a funded wallet key supplied at run time; without it the rails fail
  closed (by design) and the Research Agent serves a canned brief.
- No `v*` tag has been cut for the marketplace build, so there is no published installer for it yet
  -- run from source.
- App icons are still the stock Tauri template art, and the installer is unsigned (SmartScreen warns
  until it is code-signed). Both are tracked in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Security posture

- **Socket:** bound to `127.0.0.1` only and gated by a per-session token regenerated on every engine
  start. The token is a capability secret: never logged, never baked into a production build (the
  dev-only Vite plugin that injects it is `apply: "serve"`).
- **Wallet key:** read from the engine keystore (`0o600` `keys.json`) or `CRASH_X402_WALLET` at call
  time, returned only to the buyer's signer. It never crosses the WebSocket, never enters a renderer
  store, and is never logged.
- **Spend caps:** per-agent USDC caps are checked **before** signing, so an over-budget or uncapped
  agent cannot spend; the buyer never fabricates a settlement or invents a `txRef`.
- **Egress filter:** every engine -> renderer frame passes a Zod `safeParse` that strips unknown
  keys before it is sent, so a coding mistake cannot leak an extra field across the wire. Error and
  activity events carry a synthetic `code` only -- never `err.message`, stacks, prompts, env values,
  or response bodies.
- **Outbound boundary:** agents invoke capabilities, not arbitrary URLs. The only outbound calls are
  to known connector base URLs (e.g. Tavily), the x402 endpoint/facilitator, and the configured
  seller resource -- the storefront itself makes no paid calls and holds no keys.
- **Auth is bring-your-own:** the user's own Claude or Codex login lives in the OS keychain via the
  CLI, never in committed env vars or logs. Authentication state is derived from CLI exit codes and
  file existence -- the engine never reads credential contents.

## Credits and licenses

Repository code is MIT-licensed (see [LICENSE](LICENSE)).

Crash's mascot is a fox -- kept as the app icon and the in-app mascot mark in homage to the
project's original fox guide. The interactive guide is a 3D robot ("Crash"), rendered from a Spline
scene loaded at runtime via `@splinetool/react-spline`. The repository also bundles the Khronos
**Fox** sample asset (`frontend/r3f-shell/public/models/Fox.glb`), consumed by the Unity parity
client: its mesh is public domain (CC0 1.0, by PixelMannen) and its rig and animations are CC-BY 4.0
(by tomkranis). Because that asset travels into distributed bundles, its CC-BY attribution is
preserved in [`frontend/r3f-shell/public/models/CREDITS.md`](frontend/r3f-shell/public/models/CREDITS.md).

## Contributing

Design specs and implementation plans live in `docs/superpowers/`; contributor onboarding (including
the adversarial review loop) is in
[`docs/contributor/codex-onboarding.md`](docs/contributor/codex-onboarding.md). The documentation
hub at [`docs/README.md`](docs/README.md) is the navigation map for the rest.

## A note on the name "Crash"

This project is not affiliated with Activision or Naughty Dog and is unrelated to the Crash Bandicoot
franchise. The "Crash" wordmark here is original; Crash's mascot is a fox (its app icon, in homage to
the original idea), and the interactive guide is an original Crash-style robot -- both built from
openly licensed assets.

The end-user runtime workspace (their skills plus the watched folder) is also named `Crash/`, but it
is created on the user's machine at first run -- it is not a directory in this repo.
