# Crash -- Documentation Hub

Single navigation map for the Crash project. The repo is a pnpm workspace on the TypeScript
side (`protocol/`, `backend/`, `frontend/r3f-shell/`, `marketplace-server/`) plus a Unity C#
project (`frontend/unity/`) and two Cargo crates: the Tauri shell and the **SpacetimeDB module**.

## Code
- `protocol/` -- the frozen 35-event socket contract (`src/events.ts`), its C# mirror
  (`Protocol.cs`), one example per event, and a drift-guard test. Carries the single-user agent run.
- `backend/` -- `@crash/engine`: the headless token-gated WebSocket host and the
  provider-agnostic agent loop (Claude Code / Codex / deterministic), local RAG, and skills I/O.
- `frontend/r3f-shell/` -- the shipped desktop client: Tauri 2 + React 19 + react-three-fiber.
  `src/` is the renderer (zustand stores, the dashboard surfaces, the interactive Crash robot);
  `src-tauri/` is the Rust shell (`lib.rs`, `sidecar.rs`, ...), which spawns the engine sidecar
  and injects the boot descriptor in a packaged build.
- `frontend/unity/` -- the Unity 6 parity client (C# project), a second renderer over the same
  contract.
- `marketplace-server/` -- the fixed-price storefront (`@crash/marketplace-server`): Express +
  WebSocket, a seeded catalog, and the real x402 micropayment rail.
- `spacetime-module/` -- the multiplayer auction backend (Rust -> WASM): the live-auction tables
  and reducers, published to a hosted SpacetimeDB (Maincloud) module that the renderer and headless
  bid bots subscribe to. Proven end-to-end in [`DEMO.md`](DEMO.md). See [`SPACETIMEDB.md`](SPACETIMEDB.md)
  for the data model and reducer contracts.

## Design docs (`docs/superpowers/`)
- `specs/` -- design specs. The current product shape supersedes the earliest 3D spec; read the
  most recent dated spec for the shipped design.
- `plans/` -- implementation plans (task breakdowns) that track the specs.

## Deployment
- `DEPLOYMENT.md` -- how the monorepo becomes a Windows installer, what the installer ships, and
  the end-user download / install / run flow.
- `contributor/codex-onboarding.md` -- the paste-once kickoff for a second contributor working
  through the OpenAI Codex CLI.

## Status
The app foundation is green (build, typecheck, and tests across the workspace), the protocol is
frozen at v3 (35 events), the engine's provider-agnostic spine is live, and the R3F + Tauri shell
renders the live dashboard-world.

The multiplayer auction house is built on a SpacetimeDB module
([`SPACETIMEDB.md`](SPACETIMEDB.md)) -- the real-time backbone for live auctions where humans and
agents bid in one shared room. It is wired end-to-end and proven in [`DEMO.md`](DEMO.md): the desktop
renderer and headless bid bots subscribe to the module and an auction self-settles server-side. The
Express + WebSocket `marketplace-server` carries the fixed-price storefront and the x402 payment
rail. See the repo root `README.md` for the honest "what works today" snapshot.
