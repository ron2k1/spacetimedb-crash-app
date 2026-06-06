# Crash -- Documentation Hub

Single navigation map for the Crash project. The repo is a pnpm workspace on the TypeScript
side (`protocol/`, `backend/`, `frontend/r3f-shell/`) plus a Unity C# project
(`frontend/unity/`) and a Cargo crate for the Tauri shell.

## Code
- `protocol/` -- the frozen 27-event socket contract (`src/events.ts`), its C# mirror
  (`Protocol.cs`), one example per event, and a drift-guard test. Everything depends on this.
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
The foundation is green (build, typecheck, and tests across the workspace), the protocol is
frozen at v3, the engine's provider-agnostic spine is live, and the R3F + Tauri shell renders
the live dashboard-world. See the repo root `README.md` for the honest current snapshot and the
known gaps.
