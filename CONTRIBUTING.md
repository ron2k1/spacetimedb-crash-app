# Contributing to Crash

Thanks for your interest in Crash, a guided AI-literacy desktop app. This document covers
how to set up the repo, how the dual-renderer architecture is laid out, how to run and test
each piece, and the conventions we hold every change to. It is written for a new contributor
arriving cold, so it repeats a few things you may already know.

If you are working through the OpenAI Codex CLI as the second contributor, also read
`docs/contributor/codex-onboarding.md` for the Codex-specific onboarding prompt and the
provider-research task list. This file is the general contributor guide; that one is the
Codex paste-once kickoff.

## What Crash is (one paragraph)

Crash is a desktop app that lets a non-technical person point at something on their machine
and get a real, re-runnable skill built for them while a 3D guide character narrates. The
codebase is a dual-renderer system: a headless Node **engine** is the brain, and it speaks a
single shared **protocol** over a token-gated localhost WebSocket to two interchangeable
renderers (a Unity 6 client and a React-three-fiber web client). The engine is also
provider-agnostic: the AI CLI underneath is Claude Code or OpenAI Codex behind one interface,
and neither the protocol nor the renderers ever learn which is live.

## Prerequisites

| Tool | Version | Needed for |
|------|---------|------------|
| Node | 20 LTS | the engine, the protocol package, and the shell's web build/tests |
| pnpm | 10.33.0 | the TypeScript workspace (the repo pins this in `package.json` -> `packageManager`) |
| Rust (stable toolchain) | latest stable | building and testing the Tauri shell crate (`frontend/r3f-shell/src-tauri`) |

The fastest way to get the pinned pnpm is Corepack, which ships with Node 20:

```powershell
corepack enable
corepack prepare pnpm@10.33.0 --activate
```

You only need the Rust toolchain if you are touching the Tauri shell or running its
`cargo test`. Pure engine, protocol, and web-bundle work does not require Rust.

Windows is the primary target OS for the desktop build. The TypeScript side is cross-platform;
the shell's desktop bundle and the Unity client are exercised on Windows.

## Repository layout

This is a pnpm workspace on the TypeScript side, with a separate Cargo workspace for the
Tauri shell and a C# project for Unity.

| Path | What lives here |
|------|-----------------|
| `protocol/` | The contract: `@crash/protocol`. The canonical socket event set (`src/events.ts`), the hand-mirrored C# copy (`Protocol.cs`), one example per event, and a drift-guard test. Everything depends on this. |
| `backend/` | `@crash/engine`: the headless WebSocket host plus the provider-agnostic agent loop, local RAG, and skills I/O. |
| `frontend/r3f-shell/` | `@crash/r3f-shell`: the web renderer (Vite 7 + Tauri 2 + React 19 + react-three-fiber + Spline + Tailwind v4 + zustand). A real socket client, not a hardcoded demo. |
| `frontend/unity/` | The Unity 6 renderer (parity client). A C# project, not a pnpm member. |
| `curriculum/` | Source lessons copied into the end-user workspace at install. |
| `installer/` | Windows packaging (later phase). |
| `docs/` | Design specs, implementation plans, and contributor docs. |

## Setup

Clone, then install the whole workspace from the repo root:

```powershell
git clone https://github.com/ron2k1/crash-app.git
pnpm install
```

`pnpm install` wires every TypeScript workspace member at once. `@crash/protocol` is consumed
through its compiled output (it exports `dist/`), and `dist/` is gitignored, so a fresh
checkout must build the protocol package before downstream packages can resolve it. The
top-level build does this in topological order for you:

```powershell
pnpm run build
```

## Running it (engine first)

The renderer is a client of the engine, so the engine has to be up first. It writes the
socket descriptor the renderer reads, then the renderer connects.

```powershell
pnpm run build                            # 1. build protocol + engine + shell bundle
pnpm --filter @crash/engine run start     # 2. start the engine host (binds 127.0.0.1 + a
                                          #    per-session token; writes the socket descriptor)
pnpm run shell:dev                        # 3. launch the R3F shell (reads the descriptor, connects)
```

The R3F dev server runs at `http://localhost:1420` (Vite `strictPort`, so the port is fixed).
With no engine running, the renderer degrades gracefully (idle / "engine closed") instead of
white-screening.

For a renderer-free smoke test that drives one request straight through the engine on the
command line:

```powershell
pnpm --filter @crash/engine run run:headless
```

To point the Unity client at the same engine, open `frontend/unity` in Unity 6, aim its
socket client at the descriptor the engine wrote, and hit Play. The live Unity Editor Play is
an operator-driven step; the C# client compiles and builds headless in CI.

## Workspace commands

Run these from the repo root unless noted. The root scripts fan out across every workspace
member.

| Command | What it does |
|---------|--------------|
| `pnpm install` | Install all workspace deps. |
| `pnpm run build` | Build every package, protocol first (topological). |
| `pnpm run typecheck` | Type-check every package. |
| `pnpm run test` | Run every package's tests once. |
| `pnpm run shell:dev` | Launch the Tauri shell in dev (Vite on `http://localhost:1420`). |
| `pnpm run shell:build` | Bundle the Tauri desktop app (Windows). |

Per-package, when you want to scope work to one member:

| Command | What it does |
|---------|--------------|
| `pnpm --filter @crash/protocol run build` | Compile the protocol `dist/` (do this first on a fresh checkout). |
| `pnpm --filter @crash/engine run build` | Compile the engine (`tsc`). |
| `pnpm --filter @crash/engine run test:run` | Run the engine's unit tests once. |
| `pnpm --filter @crash/r3f-shell run build` | Type-check + Vite-build the web bundle. |
| `pnpm --filter @crash/r3f-shell run dev` | Vite dev server for the shell. |

## The gate: what has to be green before you open a PR

Every change must pass these from the repo root. Build the protocol first so downstream
packages can resolve its types and compiled output.

```powershell
pnpm --filter @crash/protocol run build   # protocol dist must exist for typecheck + tests
pnpm run typecheck                        # type-check every package
pnpm run test                             # run every package's tests once
```

If you touched the Tauri shell crate, also run its Rust tests. This needs the web bundle
present first, because `tauri-build` resolves the frontend at compile time:

```powershell
pnpm -r run build
cargo test --manifest-path frontend/r3f-shell/src-tauri/Cargo.toml --locked
```

This mirrors CI: a `quick-check` workflow runs the TypeScript typecheck + tests on Ubuntu and
the shell's `cargo test` on Windows for every PR to `main`. Running the gate locally first
keeps the pipeline green and your review fast.

If you add new files, run the formatter before committing so the next contributor's
`format:check` does not fail on your whitespace:

```powershell
pnpm exec prettier --write <the files you added>
```

## Branching and commits

We never push straight to `main`. Work on a topic branch and open a PR against `main`.

Branch naming uses a conventional prefix:

- `feat/<short-slug>` for a new capability
- `fix/<short-slug>` for a bug fix
- `chore/<short-slug>` for tooling, docs, formatting, or maintenance

Commits are atomic and conventional: one logical change per commit, with a short imperative
subject (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`) and a body that explains why when
the why is not obvious from the diff. Prefer several small, well-described commits over one
large mixed one; a reviewer should be able to read `git log --oneline` like a changelog.

Push your branch to origin once its gate is green, and open a PR. The PR template will prompt
you for a summary, the linked issue or spec, your test plan, screenshots for any UI change,
and a short security checklist.

## The protocol is the contract: treat `protocol/` as frozen

`protocol/src/events.ts` is the single source of truth for the socket. It currently defines
35 event types (12 renderer-to-engine and 23 engine-to-renderer) at `PROTOCOL_VERSION = 3`,
with a hand-mirrored C# copy in `protocol/Protocol.cs` kept in sync by a drift-guard test.

The engine and both renderers depend on this file, so do not change an event shape casually.
If you believe the contract is missing something, propose it in your PR description and let it
be reviewed before the shape changes. If you do change the protocol intentionally, update
`Protocol.cs`, the example for the affected event, and bump `PROTOCOL_VERSION` in the same
commit, and make sure the drift-guard test passes.

## Security rules (these are hard rules)

A violation here is treated as a real incident, not a style nit.

- **Never commit a secret, token, credential, or `.env` value.** The engine writes a
  per-session capability token to a runtime file outside the repo; never read, print, or paste
  its contents anywhere, and never bake any token into a committed file.
- **The socket is loopback plus a per-session token.** It binds `127.0.0.1` only and is gated
  by a token regenerated on every engine start. The token is the capability secret; loopback
  alone is not sufficient. Never log it and never bundle it into a production build.
- **Error paths emit codes, not messages.** Engine-to-renderer `error` events carry a synthetic
  `code` only, never `err.message`, a stack, a prompt, an environment value, a response body,
  or a credential. Do not add a free-text field to the error event.
- **Auth is bring-your-own.** A user's Claude or Codex login lives in their OS keychain, never
  in committed env vars or logs. Auth status is derived from CLI exit codes or file existence,
  never by reading credential contents.
- **ASCII only in source and docs you write.** No emoji, no box-drawing characters, no smart
  quotes, no ASCII-art banners. Use clean Markdown tables and lists.

## Intellectual-property note

The mascot is an original Crash-style character. This project is not affiliated with
Activision or Naughty Dog and is unrelated to Crash Bandicoot. The shipped R3F shell's
on-screen guide is an interactive Crash-style robot (a Spline scene loaded at runtime). The
repo also bundles the Khronos `Fox.glb` sample asset (consumed by the Unity parity client and
retained in the shell's model folder); its CC-BY 4.0 attribution lives in
`frontend/r3f-shell/public/models/CREDITS.md` and must keep shipping with any distributed
bundle. Only add third-party assets under permissive licenses (CC0 or CC-BY with attribution),
and record the attribution in that CREDITS file.

## License

By contributing, you agree that your contributions are licensed under the repository's MIT
license (see `LICENSE`). The MIT license governs the source code; bundled third-party art
such as the Fox asset is governed by its own license and documented in `CREDITS.md`.
