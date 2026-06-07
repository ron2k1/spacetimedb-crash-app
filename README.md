<div align="center">

# Crash

**A desktop agent marketplace with a built-in agent engine. Hire an agent, watch it work in a 3D-rendered window, and let it pay for its own tools over a real micropayment rail -- in a live room you share with other people and their agents.**

[![CI](https://github.com/ron2k1/crash-app/actions/workflows/quick-check.yml/badge.svg)](https://github.com/ron2k1/crash-app/actions/workflows/quick-check.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2563eb.svg)](LICENSE)
![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![payments: x402](https://img.shields.io/badge/payments-x402%20(USDC)-0052FF)

<br/>

![Crash -- the agent marketplace](docs/screenshots/crash-auction-house.png)

<sub><i>The native Tauri desktop app. "Hire an agent. It pays for its own tools."</i></sub>

</div>

Crash is a desktop **agent marketplace** with two halves that share one app.

The first half is a **provider-agnostic agent engine**: you bring your own Claude Code or OpenAI Codex login, ask Crash to do something, and a headless Node engine drives the CLI for you -- streaming the plan, the tool calls, and the answer into a 3D-rendered desktop window with an interactive guide. The engine speaks a single typed protocol, so the same agent run renders the same way no matter which provider is behind it.

The second half is a **marketplace** of agents, skills, and tools that those agents can buy and sell. It carries a real **x402** micropayment rail: when an agent needs a paid resource (a web-search API, say), it pays per call in USDC over the x402 protocol, and a per-agent spend cap is checked before any signature is ever produced. And it is **multiplayer** -- the marketplace's auction house is a shared, real-time world where a human in the desktop app and headless agent bidders compete in the same live auction, which settles itself server-side when its clock runs out.

It is built as a real product, not a script: a pnpm + Cargo monorepo, a Zod-validated wire protocol with a drift-guard test, a test suite that gates every push in CI, and a Windows installer that bundles the engine as a single executable.

## See it run

A live auction: two autonomous agents and a human bidding in the same room, settled automatically when the clock runs out. The bidders are two headless agent bots (BotAlice, BotBob) and a person in the desktop app -- same marketplace, same auction, same wire. The full walkthrough -- with the commands to reproduce it against your own database -- is in [`docs/DEMO.md`](docs/DEMO.md).

![Live auction board -- three auctions running at once](docs/screenshots/crash-auction-board.png)

|   |   |
|---|---|
| ![Two agents bidding each other up](docs/screenshots/crash-p4-01-agent-war.png) | ![A human outbids the agents](docs/screenshots/crash-p4-03-human-wins-agent-capped.png) |
| **Agents compete.** BotAlice and BotBob alternate bids reactively -- each wakes on the other's bid as a live update, never a poll. The bid ledger is the source of truth. | **A human jumps in.** You bid from the desktop app and lead at 9.00 USDC; the agents hit their per-agent spend caps and stand down. People and agents share one auction. |
| ![The auction settles itself server-side](docs/screenshots/crash-p4-04-settled-won-by-you.png) | ![The agent home with the Crash guide](docs/screenshots/dashboard.png) |
| **It settles itself.** At the end time a scheduled job fires server-side with no client awake, picks the winner, and writes the sale -- the bid ledger stays as proof. | **The agent run.** Crash's other half: a provider-agnostic agent (Claude Code / Codex) with a 3D guide, driven over the engine's typed socket. |

## What works today

An honest snapshot -- Crash is a real working app with a few deliberately-marked edges.

| Area | State |
|------|-------|
| Provider-agnostic agent engine (Claude Code / Codex, with a deterministic offline fallback) | **Working** -- one provider interface, one orchestrator, typed `PROTOCOL_VERSION = 3` socket |
| Tauri 2 + React 19 + react-three-fiber desktop shell with a 3D interactive guide | **Working** -- renders the marketplace, the live activity, and the agent run |
| Fixed-price marketplace (Express + WebSocket storefront, seeded catalog, buy / acquire, activity feed) | **Working** -- has its own HTTP + WebSocket `node:test` suite, run separately from the CI vitest sweep |
| x402 micropayment rail (ERC-3009 gasless USDC, Base Sepolia testnet) | **Wired** -- fails closed without a funded wallet; never fabricates a settlement |
| Multiplayer auction house (real-time module: listings, auctions, bids, sales; scheduled server-side settlement) | **Working** -- the desktop renderer and headless bid bots subscribe to the module and bid in one shared room; the end-to-end human + agent run self-settles server-side, proven in [`docs/DEMO.md`](docs/DEMO.md). The renderer defaults to a hosted Maincloud module; reproduce against your own database. |
| Windows installer (Node SEA engine sidecar + NSIS, built in tag-gated CI) | **Builds** -- a version tag produces a draft release with the installer attached |
| Test suite -- the protocol, engine, and shell vitest suites + the Rust shell crate's `cargo test` | **Green in CI** -- runs on every push and PR to `main`; the storefront's `node:test` suite runs separately, outside the CI vitest sweep |

A few edges are deliberately honest rather than papered over: the x402 on-chain settlement path is wired against real `@x402` packages but is not exercised by the test suite (tests inject a fake payment fetch for determinism), and the agent-to-agent purchase leg is an explicit simulation (a `sim:` reference, no chain write). In the real-time module, the payment-finalization reducer is defined and identity-guarded but not yet called by live code, so a settled auction currently rests at `awaiting_payment`. Wallet balances are an in-memory demo ledger, not on-chain funds. None of these are faked -- they are the next things to wire, and the code refuses to pretend otherwise.

## Architecture

Crash is one engine with a swappable face, plus a shared real-time world.

A headless Node **engine** does all the agent thinking and speaks a single **35-event protocol** (`PROTOCOL_VERSION = 3`) over a token-gated `127.0.0.1` WebSocket. That socket carries the single-user agent run -- chat, plan confirmation, streamed answers, and tool + payment activity. It is renderer-agnostic by design: the shipped react-three-fiber + Tauri desktop client draws whatever the engine emits, and an earlier Unity 6 client (built against an earlier protocol revision) stands as a second-renderer proof that the engine is face-agnostic.

Two properties keep the engine general rather than a hardcoded demo:

- **Provider-agnostic.** A single `AgentProvider` interface is implemented by both the Claude Code and the Codex provider; one orchestrator turns a normalized event stream into wire events for either, never forking on provider. The provider name rides the handshake for display only.
- **Vertical-agnostic.** There is a single `request.submit` event and no per-feature message types; a marketplace agent is selected by an optional `agentId` on that one event.

| Component | What it is |
|-----------|------------|
| `backend/` (`@crash/engine`) | The headless Node + TypeScript orchestrator: token-gated WebSocket host, provider-agnostic agent loop, local retrieval, skills I/O, the **x402 buyer + spend-cap ledger**, and the Tavily connectors. |
| `protocol/` (`@crash/protocol`) | The wire contract: a Zod-validated **35-event** protocol. `events.ts` is canonical; `Protocol.cs` is a hand-mirrored C# copy kept honest by a drift-guard test. |
| `frontend/r3f-shell/` (`@crash/r3f-shell`) | The desktop client: Tauri 2 + React 19 + react-three-fiber + Spline + Tailwind v4 + zustand. Renders the marketplace, the activity feed, and the agent run with a 3D guide. |
| `marketplace-server/` | The fixed-price storefront: Express + WebSocket, a seeded catalog, and the real x402 payment rail. Holds no secrets and no keystore. |
| `spacetime-module/` | The **multiplayer auction house**: a [SpacetimeDB](https://spacetimedb.com) module (Rust -> WebAssembly) of tables + reducers that gives human and agent bidders one shared, real-time room with server-side scheduled settlement. This is the only place SpacetimeDB appears -- as the real-time backend for the live auctions. |

Payments are intentionally a side-channel rather than something the database tries to do itself: the real-time module's reducers are deterministic and sandboxed (no outbound HTTP or chain calls), so settlement runs in the engine, outside the database, and the result is written back as data. The database stays pure; the payment rail stays real.

## Tech stack

| Layer | Stack |
|-------|-------|
| Engine | Node 20 + TypeScript, `ws` WebSocket host, a provider-agnostic agent loop, local retrieval, skills I/O, the x402 buyer, and the Tavily connectors |
| Protocol | `@crash/protocol` -- a Zod-validated **35-event** contract (`PROTOCOL_VERSION = 3`); `events.ts` canonical, `Protocol.cs` a hand-mirrored C# copy, kept honest by a drift-guard test |
| Payments | `@x402/core`, `@x402/evm`, `@x402/express`, `viem` -- ERC-3009 gasless USDC on Base Sepolia; the engine signs and retries the HTTP-402 round trip and reads the settlement reference from the response |
| Desktop shell | `@crash/r3f-shell` -- Tauri 2 + React 19 + react-three-fiber + Spline + Tailwind v4 + zustand |
| Storefront | `@crash/marketplace-server` -- Express + `ws`, a seeded catalog, JSON-file persistence |
| Real-time auctions | a SpacetimeDB 1.3 module (Rust -> WASM) of tables + reducers; clients subscribe to SQL views and receive live row deltas |
| Tooling | pnpm 10.33 workspace on the TypeScript side; Cargo for the Tauri shell and the module |

## Repository layout

| Path | What lives here |
|------|-----------------|
| `backend/` | The headless engine (`@crash/engine`): token-gated WS server, the provider-agnostic agent loop (Claude Code / Codex / deterministic), local retrieval, skills I/O, the **x402 buyer + cap ledger** (`src/payments/`), and the Tavily connectors (`src/connectors/`). |
| `protocol/` | The agent-run contract: the canonical **35-event** socket protocol (`events.ts`), the C# mirror (`Protocol.cs`), one example per event, and a drift-guard test. |
| `frontend/r3f-shell/` | The desktop client (`@crash/r3f-shell`): Tauri 2 + React 19 + react-three-fiber. |
| `frontend/unity/` | An earlier Unity 6 parity client: a second renderer over the same socket contract, kept as proof the engine is face-agnostic. Source-only; not the shipped path. |
| `marketplace-server/` | The fixed-price storefront (`@crash/marketplace-server`): Express + WebSocket, the seeded catalog, and the real x402 rail. |
| `spacetime-module/` | The multiplayer auction backend: a SpacetimeDB module (Rust -> WASM) of marketplace + auction tables and reducers. |
| `curriculum/` | Source lessons, copied into the end-user workspace at first run. |
| `installer/` | Windows packaging: the engine-sidecar build script and the NSIS runbook. |
| `docs/` | Architecture notes, deployment, and contributor onboarding. |

## Run it

Prerequisites: **Node 20** and **pnpm 10.33** for the TypeScript workspace, and the **Rust toolchain** for the Tauri shell. The multiplayer auction module additionally needs the **`spacetime` CLI 1.3.0**.

### The app (web-shell dev path -- no native build needed)

```powershell
pnpm install                                        # install all workspace deps
pnpm run build                                       # build protocol + engine + shell + storefront
pnpm --filter @crash/marketplace-server run start    # storefront on :8787
pnpm --filter @crash/engine run start                # engine: binds 127.0.0.1 + a per-session token
pnpm --filter @crash/r3f-shell run dev               # web shell (Vite on :1420)
```

Then open <http://localhost:1420>. With no engine running, the renderer degrades gracefully (idle / "engine closed") rather than white-screening. For the full native window: `pnpm run shell:dev`.

### The multiplayer auction module (optional)

```powershell
cd spacetime-module
spacetime build                                      # compile the Rust module to WASM (offline)
spacetime login                                      # one-time: authenticate to Maincloud (interactive)
spacetime publish -s maincloud <your-db-name>        # publish the module to your own hosted database
spacetime generate --lang typescript --out-dir ../frontend/r3f-shell/src/stdb   # client bindings
```

`spacetime build` needs no running server, so module development is fully offline; only `publish` / `logs` need the Maincloud login. Pick your own `<your-db-name>` -- then point the shell at it with `VITE_STDB_MODULE=<your-db-name>` (it otherwise defaults to the project's own database). On Windows the crates.io CLI installs as `spacetimedb-cli.exe` -- alias or copy it to `spacetime.exe` on your PATH so the commands above match the docs verbatim.

## Workspace commands

```powershell
pnpm install            # install all workspace deps
pnpm run build          # build every package (protocol first, topological)
pnpm run typecheck      # type-check every package
pnpm run test           # run the protocol + engine + shell vitest suites once
pnpm run shell:dev      # launch the full Tauri desktop app in dev (native window)
pnpm run shell:build    # bundle the Tauri desktop app (Windows)
```

The storefront's tests use the Node test runner and run explicitly:

```powershell
pnpm --filter @crash/marketplace-server run test
```

## Security posture

- **Bring-your-own auth.** The user's own Claude or Codex login lives in the OS keychain via the provider's CLI, never in committed env vars or logs. Crash derives auth state from CLI exit codes and file existence only -- it never reads credential contents.
- **Agent providers run with full access by default.** Like running the CLI yourself, the Claude Code / Codex providers default to full system access (opt out per provider via `CRASH_*_FULL_ACCESS=0`). Crash does not sandbox the agent; it is your own CLI, driven for you. Treat an agent run with the same care you would treat running that CLI directly.
- **Loopback socket, per-session token.** The engine WebSocket binds to `127.0.0.1` only and is gated by a 24-byte token regenerated on every engine start; the first frame must present a matching token and protocol version or the socket is closed `1008 unauthorized`. The token is written to a `0o600` `socket.json` and is never logged or baked into a production build.
- **Wallet key.** Read from the engine keystore (`0o600` `keys.json`) or `CRASH_X402_WALLET` at call time, returned only to the buyer's signer. It never crosses the WebSocket, never enters a renderer store, and is never logged. With no funded wallet the buyer fails closed at signing rather than fabricating a settlement.
- **Spend caps.** Per-agent USDC caps are checked **before** signing; an over-budget run never even constructs a signature, and the buyer never invents a transaction reference.
- **Egress filter.** Every engine -> renderer frame passes a Zod `safeParse` that strips unknown keys, and error / activity events carry a synthetic `code` only -- never `err.message`, stacks, prompts, env values, or response bodies. (The one intentional exception is `terminal.output`, which forwards raw CLI lines verbatim to the renderer and is never logged or persisted.)
- **Real-time writes go through reducers only.** In the auction module, clients never write rows directly; every mutation is a transactional reducer call, so a client cannot corrupt or race shared state.

## Credits and licenses

Repository code is MIT-licensed (see [LICENSE](LICENSE)).

Crash's mascot is a fox -- kept as the app icon and the in-app mascot mark in homage to the project's original fox guide. The interactive guide is a 3D robot ("Crash"), rendered from a Spline scene loaded at runtime. The repository also bundles the Khronos **Fox** sample asset (`frontend/r3f-shell/public/models/Fox.glb`), consumed by the Unity parity client: its mesh is public domain (CC0 1.0, by PixelMannen) and its rig and animations are CC-BY 4.0 (by tomkranis), with attribution preserved in [`frontend/r3f-shell/public/models/CREDITS.md`](frontend/r3f-shell/public/models/CREDITS.md).

## A note on the name "Crash"

This project is not affiliated with Activision or Naughty Dog and is unrelated to the Crash Bandicoot franchise. The "Crash" wordmark here is original; Crash's mascot is a fox (its app icon, in homage to the original idea), and the interactive guide is an original Crash-style robot -- both built from openly licensed assets.

The end-user runtime workspace (their skills plus the watched folder) is also named `Crash/`, but it is created on the user's machine at first run -- it is not a directory in this repo.
