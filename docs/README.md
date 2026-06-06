# Crash -- Documentation Hub

Single navigation map for the Crash project. The repo is a pnpm workspace on the TypeScript
side (`protocol/`, `backend/`, `frontend/r3f-shell/`, `marketplace-server/`) plus a Unity C#
project (`frontend/unity/`) and two Cargo crates: the Tauri shell and the **SpacetimeDB module**.

## Code
- `spacetime-module/` -- **the SpacetimeDB backend** (Rust -> WASM): the marketplace + live-auction
  tables and reducers, published into the hosted `crash-y77jx` database. See
  [`SPACETIMEDB.md`](SPACETIMEDB.md) for the data model, reducer contracts, and migration plan.
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

For the **SpacetimeDB hackathon**, the database becomes the real-time backbone for a multiplayer
marketplace + live auctions. The module is scaffolded and the schema is designed
([`SPACETIMEDB.md`](SPACETIMEDB.md)); the Express + WebSocket `marketplace-server` is the source of
truth being ported. See the repo root `README.md` for the honest "live today vs. in progress"
snapshot.
