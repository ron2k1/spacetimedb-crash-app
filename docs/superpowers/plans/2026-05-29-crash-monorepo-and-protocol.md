# Crash Monorepo Foundation + Frozen Protocol Contract — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the existing repo into a clean `frontend/` + `backend/` + `protocol/` pnpm workspace (the layout the operator asked for), then freeze the Crash socket contract as a single runtime-checkable asset (`protocol/events.ts` canonical + hand-mirrored `Protocol.cs` + one example per event), proven importable by a second package.

**Architecture:** A pnpm workspace with three TypeScript members (`protocol`, `backend`, `frontend/r3f-shell`) plus a non-npm Unity 6 project at `frontend/unity`. The existing Tauri + React/R3F shell relocates wholesale into `frontend/r3f-shell` (relative paths preserved, so the security-locked Tauri capability and all Rust source move untouched). `@crash/protocol` is the single source of truth for the JSON event protocol: zod schemas are the runtime contract, TS types are inferred from them, `Protocol.cs` is a hand-mirror for Unity, and a drift-guard test fails CI if the three representations diverge. This plan stops at the frozen contract; the mock server and engine that *run* the contract are Plan 2.

**Tech Stack:** pnpm workspaces, TypeScript ~5.8, zod ^3.25 (runtime contract), Vitest ^1.6 (tests), Tauri 2 + React 19 + @react-three/fiber 9 (relocated shell, unchanged), Unity 6000.4.9f1 / URP 17.4.0 (relocated, unchanged), Rust/Cargo (Tauri sidecar bridge, unchanged).

---

## Scope

- **IN:** the Section 22 repo layout; the pnpm workspace; the relocation of the existing shell + Unity project; the frozen `@crash/protocol` package (events + version + examples + C# mirror + drift guard); a backend stub that proves the contract is importable across packages; **a CI/CD pipeline that survives the restructure** (Phase C — the existing `quick-check.yml` migrated from npm to the pnpm workspace and split into a cheap ubuntu TS gate + a Windows Rust gate, plus a tag-gated Tauri Windows release workflow); **the Unity 6 connection foundation** (Phase D — the IvanMurzak Unity-MCP dev-time bridge wired for Claude Code, the NativeWebSocket runtime dependency added to the Unity manifest, and the runtime client documented).
- **OUT (later plans):** the running mock WebSocket server + 127.0.0.1/token transport (Plan 2); the real Agent-SDK engine, RAG, skills, voice (Plan 2-3); wiring the R3F shell / Unity to the live socket, writing the actual `CrashWsClient.cs`, and swapping `src/types/sidecar-events.ts` for `@crash/protocol` (Plan 3); Unity-on-CI (the license-gated GameCI test/build — a Linux Docker image cannot cross-build a Windows IL2CPP player, and it needs the Unity license as GitHub secrets, so it is deferred; see the Phase C closing note) and code-signing (spec Section 14); the installer / OAuth onboarding / auto-update (Plan 4).
- Source spec: `docs/superpowers/specs/2026-05-29-crash-abcmouse-for-ai-design.md` (Sections 3.1 event set, 17 contract-first sequencing, 18 IN-for-6/1, 22 repo layout).

## Commit Policy (operator constraint — overrides the skill's auto-commit)

The operator's standing instruction is: **do not run `git commit` or `git push` without explicit per-batch go-ahead.** Each task below ends with a commit step for atomic-commit discipline (Rule 13) and to document the intended commit boundary, but the executor MUST stage the change, show `git status` + `git diff --stat`, and **wait for the operator's go-ahead** before actually committing. Use single-line conventional-commit subjects via `git commit -m "..."` (Windows-safe; no here-strings). The design spec itself remains untracked until the operator authorizes committing it.

## Subagent model (operator constraint — overrides the skill's "cheapest model" guidance)

Every subagent dispatched to implement OR review a task in this plan MUST use **Opus 4.8** (`model: "opus"`, i.e. `claude-opus-4-8`). This overrides both (a) the subagent-driven-development skill's "use the least powerful model that can handle the role" guidance and (b) the global model-routing rule that otherwise permits Sonnet/Haiku for mechanical work. No exceptions: implementer, spec-compliance reviewer, and code-quality reviewer subagents are all Opus 4.8. (Operator instruction, 2026-05-29: "make sure only using opus 4.8 subagents.")

## Naming reconciliation (read once — prevents confusion)

There are two distinct things both historically called `Crash/`:

1. **The repo's Unity project**, currently at `./Crash/` (untracked, a fresh URP template). This plan moves it to `frontend/unity/`. **After this plan the repo has no top-level `Crash/`.**
2. **The end-user runtime workspace**, named `Crash/`, described in spec Section 3.4. This is created on the *end-user's machine* at install/first-run by the engine (it holds their `skills/`, `CLAUDE.md`, watched folder). **It never exists in this repo.** Do not scaffold it here.

When a later plan needs the runtime-workspace path, it is an OS-user-profile path on the demo machine, not a repo directory.

---

## Target File Structure (what each unit is responsible for)

```
crash/                                  # repo root = pnpm workspace root (no app code here)
  package.json                          # workspace root: -r scripts only, no app deps
  pnpm-workspace.yaml                   # lists the 3 TS members
  .npmrc                                # pnpm peer-dep settings
  README.md                             # repo map for humans + LLM navigation
  .gitignore                            # + target/, gen/schemas/, pnpm/unity ignores
  .mcp.json.example                     # [Phase D] template: register the Unity-MCP dev bridge for Claude Code
  .github/
    workflows/
      quick-check.yml                   # [Phase C] CI: pnpm TS gate (ubuntu) + Rust gate (windows)
      release.yml                       # [Phase C] tag-gated (v*) Tauri Windows installer build

  protocol/                             # THE ASSET — frozen socket contract (@crash/protocol)
    package.json                        # builds to dist/, exports types+esm
    tsconfig.json
    vitest.config.ts
    Protocol.cs                         # hand-mirror for Unity (kept in sync by drift test)
    README.md
    src/
      events.ts                         # zod schemas + inferred types + ALL_EVENT_TYPES + makeMessage
      examples.ts                       # one valid example message per event type
      index.ts                          # public re-exports
    test/
      events.test.ts                    # schema accept/reject behavior
      contract.test.ts                  # drift guard: examples<->types<->Protocol.cs parity

  backend/                              # the engine host (@crash/engine) — STUB in this plan
    package.json                        # depends on @crash/protocol (workspace:*)
    tsconfig.json
    README.md
    src/index.ts                        # ENGINE_VERSION placeholder (real host = Plan 2)
    test/protocol-link.test.ts          # proves @crash/protocol imports across packages

  frontend/
    README.md
    r3f-shell/                          # relocated Tauri + React/R3F shell (@crash/r3f-shell)
      package.json                      # was the old root package.json (name changed)
      .npmrc                            # legacy-peer-deps for any local npm fallback
      index.html  vite.config.ts  vitest.config.ts  tsconfig.json  tsconfig.node.json
      src/        sidecar/              # moved as-is (sidecar kept for the echo demo)
      tests/
      src-tauri/                        # moved wholesale — capability + Rust source untouched
    unity/                              # relocated Unity 6 project (URP template)
      .gitignore                        # standard Unity ignores (Library/, Temp/, ...)
      README.md                         # [Phase D] how CC connects to Unity 6: dev-time MCP + runtime client
      Assets/ ProjectSettings/
      Packages/manifest.json            # [Phase D] + NativeWebSocket (runtime) + Unity-MCP (dev-time) deps

  curriculum/                           # repo SOURCE for lessons (copied into runtime workspace later)
    README.md
  installer/                            # packaging scripts (Plan 4)
    README.md
  docs/                                 # specs + plans (already present) + unity-mcp-setup.md [Phase D]
```

`@crash/protocol` has one responsibility: define and validate the message contract. `@crash/engine` (backend) will own the socket server + agent loop (Plan 2); here it only proves the cross-package import. `@crash/r3f-shell` is the relocated renderer/break-glass demo. `frontend/unity` is the committed 6/1 face (not a pnpm member — it is C#).

---

# Phase A — Restructure to the pnpm workspace

Phase A is a relocation, not a feature. You cannot TDD a directory move, so each task is **act → verify the app still builds/tests → commit**. Run every command from the repo root `C:\Users\thegr\Desktop\repos\crash` in PowerShell unless noted.

### Task A1: Pre-flight checks

**Files:** none (verification only)

- [ ] **Step 1: Confirm a clean tree and required tooling**

Run:
```powershell
git status --short
pnpm --version
node --version
cargo --version
```
Expected: `git status --short` shows only the known untracked entries (`Crash/`, `docs/README.md`, `docs/superpowers/specs/2026-05-29-...`, and this plan file). `pnpm` >= 8, `node` >= 18, `cargo` present. If `pnpm` is missing, install via `npm i -g pnpm` and re-check.

- [ ] **Step 2: Close the Unity Editor**

The Unity project move is a directory rename; it fails if the Editor holds file handles. Confirm no Unity Editor / Unity Hub process has `...\crash\Crash` open before proceeding. (No command — operator confirms.)

- [ ] **Step 3: Record a rollback anchor**

Run:
```powershell
git rev-parse HEAD
```
Expected: prints the current commit SHA. Note it — Phase A is reversible with `git reset --hard <sha>` plus moving `frontend/unity` back to `Crash` if needed (Unity move is filesystem, not git).

### Task A2: Create the workspace skeleton directories

**Files:**
- Create: `frontend/r3f-shell/` `backend/src/` `backend/test/` `protocol/src/` `protocol/test/` `curriculum/` `installer/`

- [ ] **Step 1: Make the target directories**

Run:
```powershell
New-Item -ItemType Directory -Force -Path frontend\r3f-shell, backend\src, backend\test, protocol\src, protocol\test, curriculum, installer | Out-Null
```
Expected: directories created (no output).

- [ ] **Step 2: Verify**

Run:
```powershell
Test-Path frontend\r3f-shell, backend\src, protocol\src, curriculum, installer
```
Expected: five `True` lines.

(No commit — empty dirs are not tracked by git; they become tracked when files land in Task A3/A9.)

### Task A3: Relocate the Tauri + React/R3F shell into `frontend/r3f-shell/`

**Files (git mv — all currently tracked):**
- Move: `src/` `src-tauri/` `sidecar/` `tests/` `index.html` `vite.config.ts` `vitest.config.ts` `tsconfig.json` `tsconfig.node.json` `package.json` `.npmrc` → under `frontend/r3f-shell/`
- Remove from tracking: `package-lock.json` (replaced by pnpm-lock.yaml)

- [ ] **Step 1: Move the tracked shell files (preserves history)**

Run:
```powershell
git mv src frontend/r3f-shell/src
git mv src-tauri frontend/r3f-shell/src-tauri
git mv sidecar frontend/r3f-shell/sidecar
git mv tests frontend/r3f-shell/tests
git mv index.html frontend/r3f-shell/index.html
git mv vite.config.ts frontend/r3f-shell/vite.config.ts
git mv vitest.config.ts frontend/r3f-shell/vitest.config.ts
git mv tsconfig.json frontend/r3f-shell/tsconfig.json
git mv tsconfig.node.json frontend/r3f-shell/tsconfig.node.json
git mv package.json frontend/r3f-shell/package.json
git mv .npmrc frontend/r3f-shell/.npmrc
```
Then handle `public/` only if it exists, and drop the npm lockfile:
```powershell
if (Test-Path public) { git mv public frontend/r3f-shell/public }
git rm --quiet package-lock.json
```
Expected: each `git mv` succeeds silently; `git rm` reports removal of `package-lock.json`. (`sidecar/` is moved as-is — the Tauri echo demo resolves `sidecar/echo.js` relative to its runtime CWD, and a copy also exists inside `src-tauri/sidecar/`; both move with the app, so the demo keeps working under either CWD interpretation. Deduping the two copies is deferred until the real backend replaces the echo sidecar.)

- [ ] **Step 2: Verify the move**

Run:
```powershell
git status --short
Test-Path frontend\r3f-shell\src-tauri\capabilities\default.json, frontend\r3f-shell\src\main.tsx, frontend\r3f-shell\package.json
```
Expected: `git status` shows the renames (R) plus the `package-lock.json` deletion; the three `Test-Path` checks print `True`. **Do not** edit `capabilities/default.json` — it must remain the locked `core:default` + single `shell:allow-execute` for `node sidecar/echo.js`.

- [ ] **Step 3: Stage and commit (await operator go-ahead)**

```powershell
git add -A
git commit -m "refactor: relocate Tauri/R3F shell into frontend/r3f-shell"
```

### Task A4: Relocate the Unity project into `frontend/unity/`

**Files:**
- Move (filesystem — `Crash/` is untracked): `Crash/` → `frontend/unity/`
- Create: `frontend/unity/.gitignore`

- [ ] **Step 1: Move the Unity project (atomic rename on the same volume)**

Run:
```powershell
Move-Item -Path Crash -Destination frontend\unity
```
Expected: completes quickly (same-volume rename, even with the multi-GB `Library/PackageCache/`). Verify:
```powershell
Test-Path frontend\unity\ProjectSettings\ProjectVersion.txt, frontend\unity\Assets\Scenes\SampleScene.unity
```
Expected: two `True` lines.

- [ ] **Step 2: Add the standard Unity .gitignore so regenerable caches are never tracked**

Create `frontend/unity/.gitignore`:
```gitignore
# Unity generated / regenerable
[Ll]ibrary/
[Tt]emp/
[Oo]bj/
[Bb]uild/
[Bb]uilds/
[Ll]ogs/
[Uu]ser[Ss]ettings/
[Mm]emoryCaptures/
[Rr]ecordings/

# IDE / solution files (regenerated by the IDE packages)
.vs/
.vsconfig
*.csproj
*.unityproj
*.sln
*.suo
*.user
*.userprefs
*.pidb
*.booproj
*.svd
*.mdb
*.opendb
*.VC.db

# OS / asset meta noise
.DS_Store
*.apk
*.aab
*.unitypackage
crashlytics-build.properties
```
This is the upstream Unity .gitignore subset relevant to a URP project. `Assets/`, `Packages/manifest.json`, `Packages/packages-lock.json`, and `ProjectSettings/` remain tracked (they define the project); `Library/` etc. are excluded.

- [ ] **Step 3: Verify only meaningful files are seen by git**

Run:
```powershell
git add frontend/unity/.gitignore
git status --short frontend/unity | Select-Object -First 20
```
Expected: git shows `frontend/unity/Assets/...`, `frontend/unity/Packages/...`, `frontend/unity/ProjectSettings/...`, and the `.gitignore` as untracked-to-be-added — and **does NOT** list anything under `frontend/unity/Library/` or `Temp/`.

- [ ] **Step 4: Stage and commit (await operator go-ahead)**

```powershell
git add frontend/unity
git commit -m "refactor: relocate Unity 6 project into frontend/unity with .gitignore"
```

### Task A5: Create the pnpm workspace root files

**Files:**
- Create: `pnpm-workspace.yaml` `package.json` (new root) `.npmrc` (new root) `README.md`

- [ ] **Step 1: Write `pnpm-workspace.yaml`**

Create `pnpm-workspace.yaml`:
```yaml
packages:
  - protocol
  - backend
  - frontend/r3f-shell
```
(`frontend/unity` is intentionally absent — it is a C# project, not a pnpm package.)

- [ ] **Step 2: Write the new root `package.json` (workspace root, no app deps)**

Create `package.json`:
```json
{
  "name": "crash-monorepo",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "build": "pnpm -r run build",
    "test": "pnpm -r run test:run",
    "typecheck": "pnpm -r run typecheck",
    "shell:dev": "pnpm --filter @crash/r3f-shell run tauri dev",
    "shell:build": "pnpm --filter @crash/r3f-shell run tauri build"
  }
}
```

- [ ] **Step 3: Write the root `.npmrc` (pnpm peer-dep behavior)**

Create `.npmrc`:
```ini
auto-install-peers=true
strict-peer-dependencies=false
```
(The relocated shell keeps its own `frontend/r3f-shell/.npmrc` with `legacy-peer-deps=true` for any local npm fallback; pnpm reads this root one.)

- [ ] **Step 4: Write the root `README.md` (repo map for humans + LLM navigation)**

Create `README.md`:
```markdown
# Crash

Guided AI-literacy learning platform ("ABCmouse for AI"): point at anything, a 3D fox
narrates while it builds you a real, re-runnable skill. Windows-only for the 6/1 demo.

## Repository layout

| Path | What lives here |
|------|-----------------|
| `protocol/` | **The contract.** Canonical socket event protocol (`events.ts`), C# mirror (`Protocol.cs`), examples. Everything else depends on this. |
| `backend/` | The headless engine host (`@crash/engine`): socket server + Claude Agent SDK loop + RAG + skills + voice. |
| `frontend/r3f-shell/` | Tauri + React/R3F desktop shell (break-glass demo + engine test-harness). |
| `frontend/unity/` | Unity 6 fox renderer — the committed 6/1 face. |
| `curriculum/` | Source lessons, copied into the end-user workspace at install. |
| `installer/` | Windows packaging (Plan 4). |
| `docs/superpowers/` | Design specs and implementation plans. |

## Workspace

pnpm workspace across the TypeScript members (`protocol`, `backend`, `frontend/r3f-shell`).
`frontend/unity` is a C# project, not a pnpm member.

```powershell
pnpm install            # install all workspace deps
pnpm run build          # build every package (protocol first)
pnpm run test           # run every package's tests once
pnpm run shell:dev      # launch the Tauri shell (dev)
```

## Note on the name "Crash"

The end-user *runtime workspace* (their skills + watched folder) is also named `Crash/`,
but it is created on the user's machine at first run — it is **not** a directory in this repo.
```

- [ ] **Step 5: Stage and commit (await operator go-ahead)**

```powershell
git add pnpm-workspace.yaml package.json .npmrc README.md
git commit -m "feat: add pnpm workspace root, scripts, and repo README"
```

### Task A6: Rename the shell package and switch Tauri hooks to pnpm

**Files:**
- Modify: `frontend/r3f-shell/package.json:2` (name)
- Modify: `frontend/r3f-shell/src-tauri/tauri.conf.json:7-9` (beforeDev/beforeBuild commands)

- [ ] **Step 1: Rename the shell package**

In `frontend/r3f-shell/package.json`, change the name field:
```json
  "name": "@crash/r3f-shell",
```
(Leave every other field — version, scripts, deps — exactly as moved. The Cargo crate name `crash`/`crash_lib`, Tauri `productName: "crash"`, and `identifier: "com.ronbas.crash"` are unchanged.)

- [ ] **Step 2: Point Tauri's build hooks at pnpm**

In `frontend/r3f-shell/src-tauri/tauri.conf.json`, change only these two lines inside `"build"`:
```json
    "beforeDevCommand": "pnpm run dev",
    "beforeBuildCommand": "pnpm run build",
```
Leave `devUrl`, `frontendDist: "../dist"`, and everything else unchanged (`../dist` is correct relative to `src-tauri/`, i.e. `frontend/r3f-shell/dist`).

- [ ] **Step 3: Verify no other `npm run` references remain in the shell config**

Run:
```powershell
Select-String -Path frontend\r3f-shell\src-tauri\tauri.conf.json -Pattern "npm run"
```
Expected: no matches.

- [ ] **Step 4: Stage and commit (await operator go-ahead)**

```powershell
git add frontend/r3f-shell/package.json frontend/r3f-shell/src-tauri/tauri.conf.json
git commit -m "chore: name shell @crash/r3f-shell and run Tauri hooks via pnpm"
```

### Task A7: Install the workspace and verify the relocated shell still builds + tests pass

**Files:**
- Modify: `.gitignore` (add Rust/pnpm/gen ignores)
- Create: `pnpm-lock.yaml` (generated)

- [ ] **Step 1: Harden `.gitignore` for the new layout**

Append to the root `.gitignore` (after the existing `node_modules` / `dist` lines):
```gitignore

# Rust / Tauri build output (now under frontend/r3f-shell/src-tauri)
target/
# Tauri generated schemas
gen/schemas/
# pnpm store debug
.pnpm-debug.log*
```
(The existing `node_modules` and `dist` patterns are unanchored, so they already match at any depth, including `frontend/r3f-shell/dist`.)

- [ ] **Step 2: Install the workspace**

Run:
```powershell
pnpm install
```
Expected: pnpm resolves three workspace projects (it will warn that `protocol`/`backend` have no install targets yet until Phase B adds their `package.json` — if you are executing strictly in order, expect pnpm to only see `@crash/r3f-shell` here; that is fine). The relocated shell's deps (react, three, @react-three/*, @tauri-apps/*) install. A `pnpm-lock.yaml` is created at root. If a peer-dep error stops the install, confirm the root `.npmrc` from Task A5 Step 3 is present (it sets `strict-peer-dependencies=false`).

- [ ] **Step 3: Typecheck, test, and build the relocated shell**

Run:
```powershell
pnpm --filter @crash/r3f-shell run typecheck
pnpm --filter @crash/r3f-shell run test:run
pnpm --filter @crash/r3f-shell run build
```
Expected: typecheck passes (`tsc --noEmit`, 0 errors); Vitest runs and the existing tests pass (`tests/sanity.test.ts`, `tests/store/dialogStore.test.ts`, `src/store/taskStore.test.ts` — happy-dom env from the moved `vitest.config.ts`); `vite build` emits `frontend/r3f-shell/dist/`.

- [ ] **Step 4: Verify the Rust/Tauri side still compiles + its unit tests pass**

Run:
```powershell
cargo test --manifest-path frontend/r3f-shell/src-tauri/Cargo.toml
cargo build --manifest-path frontend/r3f-shell/src-tauri/Cargo.toml
```
Expected: `cargo test` runs the `jsonl` module tests (`parses_single_line`, `parses_multiple_lines`, `rejects_malformed_json`) and they pass; `cargo build` compiles `crash_lib` + `crash`.

- [ ] **Step 5: (Manual, not a gate) Smoke the relocated app**

Optionally run `pnpm run shell:dev` from the repo root and confirm the window launches and the echo demo streams events, then close it. This is interactive — treat it as a confidence check, not an automated gate. (If the echo demo fails to find `sidecar/echo.js`, the file is present at both `frontend/r3f-shell/sidecar/echo.js` and `frontend/r3f-shell/src-tauri/sidecar/echo.js`; no path edit should be needed.)

- [ ] **Step 6: Stage and commit (await operator go-ahead)**

```powershell
git add .gitignore pnpm-lock.yaml
git commit -m "build: adopt pnpm workspace install; verify relocated shell green"
```

### Task A8: Create the `curriculum/` and `installer/` placeholder READMEs

**Files:**
- Create: `frontend/README.md` `curriculum/README.md` `installer/README.md`

- [ ] **Step 1: Write `frontend/README.md`**

Create `frontend/README.md`:
```markdown
# frontend/

User-facing renderers. Both are clients of the `@crash/protocol` socket contract.

- `r3f-shell/` — Tauri + React/React-Three-Fiber desktop shell. Break-glass live-demo
  fallback and the engine test-harness. pnpm workspace member `@crash/r3f-shell`.
- `unity/` — Unity 6 (6000.4.9f1, URP 17.4.0) fox renderer. The committed 6/1 face.
  Not a pnpm member (C# project); consumes the hand-mirrored `protocol/Protocol.cs`.
```

- [ ] **Step 2: Write `curriculum/README.md`**

Create `curriculum/README.md`:
```markdown
# curriculum/

Source-of-truth lesson content for the 6/1 slice. At install/first-run the engine copies
these into the end-user runtime workspace (`Crash/skills/`), where lesson, starter, and
user-authored skills are the same on-disk artifact (spec Section 3.4: "the shelf is the state").

Planned 6/1 lessons (built in a later plan): `ask-my-stuff/` (local RAG) and `summarize-this/`.
Nothing here is a runtime path — the runtime workspace lives on the user's machine, not in the repo.
```

- [ ] **Step 3: Write `installer/README.md`**

Create `installer/README.md`:
```markdown
# installer/

Windows packaging for the bundled demo build (Plan 4). For 6/1 the demo runs on the
operator's own laptop from the installed location; code-signing is post-Monday (spec Section 14).
Empty until the packaging plan.
```

- [ ] **Step 4: Stage and commit (await operator go-ahead)**

```powershell
git add frontend/README.md curriculum/README.md installer/README.md
git commit -m "docs: add per-directory READMEs for frontend, curriculum, installer"
```

---

# Phase B — Freeze the protocol contract (the asset)

Phase B is TDD-shaped: define the contract, write tests that pin its behavior, make them pass. The contract covers exactly the Section 3.1 frozen event set (19 types) — no more (YAGNI).

### Task B1: Scaffold the `@crash/protocol` package

**Files:**
- Create: `protocol/package.json` `protocol/tsconfig.json` `protocol/vitest.config.ts`

- [ ] **Step 1: Write `protocol/package.json`**

Create `protocol/package.json`:
```json
{
  "name": "@crash/protocol",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "Protocol.cs"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test:run": "vitest run"
  },
  "dependencies": {
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "typescript": "~5.8.3",
    "vitest": "^1.6.1"
  }
}
```

- [ ] **Step 2: Write `protocol/tsconfig.json`**

Create `protocol/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `protocol/vitest.config.ts`**

Create `protocol/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Install the new package's deps**

Run:
```powershell
pnpm install
```
Expected: pnpm now sees `@crash/protocol`, installs `zod` + `vitest` + `typescript` for it. No error.

- [ ] **Step 5: Stage and commit (await operator go-ahead)**

```powershell
git add protocol/package.json protocol/tsconfig.json protocol/vitest.config.ts pnpm-lock.yaml
git commit -m "feat(protocol): scaffold @crash/protocol package"
```

### Task B2: Define the frozen event schemas

**Files:**
- Create: `protocol/src/events.ts`
- Create: `protocol/src/index.ts`

- [ ] **Step 1: Write `protocol/src/events.ts` (zod schemas + inferred types + helpers)**

Create `protocol/src/events.ts`:
```ts
// CANONICAL Crash socket contract — single source of truth.
// Unity consumes a HAND-MIRRORED copy at protocol/Protocol.cs (kept in sync by the
// drift-guard test in protocol/test/contract.test.ts).
//
// SECURITY: `error` events carry a synthetic CODE only — never a message, stack,
// prompt, environment value, response body, or credential. Do NOT add a free-text
// field to ErrorSchema. (Spec Section: sidecar error events emit err.code only.)
//
// Transport (WebSocket on 127.0.0.1 + per-session token) is a runtime concern owned by
// the engine (Plan 2). This file defines message *shapes* and the handshake fields only.

import { z } from 'zod';

/** Bump on any backward-incompatible payload change. Mirrored in Protocol.cs (Version). */
export const PROTOCOL_VERSION = 1;

// ---- shared sub-schemas ----
export const PlanStepSchema = z.object({
  id: z.string(),
  label: z.string(),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const CitationSchema = z.object({
  source: z.string(), // human-facing label (e.g. a filename) — NOT an absolute path
  snippet: z.string(), // the small relevant passage shown to the user
});
export type Citation = z.infer<typeof CitationSchema>;

export const RunStateSchema = z.enum([
  'idle',
  'planning',
  'indexing',
  'running',
  'awaiting_confirm',
  'done',
  'error',
]);
export type RunState = z.infer<typeof RunStateSchema>;

// ---- envelope ----
// Every message is { v, type, sessionId, seq, payload }. `type` is the discriminant.
// `sessionId` is "" only for the pre-session `hello`; the engine assigns the real id in
// `session.ready`, and all later messages carry it.
function envelope<T extends string, P extends z.ZodTypeAny>(type: T, payload: P) {
  return z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal(type),
    sessionId: z.string(),
    seq: z.number().int().nonnegative(),
    payload,
  });
}

// ---- Renderer -> Engine ----
export const HelloSchema = envelope(
  'hello',
  z.object({
    token: z.string(), // per-session localhost token
    protocolVersion: z.number().int(),
    renderer: z.string(), // 'unity' | 'r3f' (free string; engine validates)
  }),
);
export const RequestSubmitSchema = envelope(
  'request.submit',
  z.object({
    requestId: z.string(),
    text: z.string(), // what the user asked — generic, blind to input type
    targetPath: z.string().optional(), // optional pointer to a file/folder in the workspace
  }),
);
export const PlanConfirmSchema = envelope('plan.confirm', z.object({ planId: z.string() }));
export const PlanCancelSchema = envelope('plan.cancel', z.object({ planId: z.string() }));
export const ConfirmResponseSchema = envelope(
  'confirm.response',
  z.object({ confirmId: z.string(), approved: z.boolean() }),
);
export const SkillSaveAcceptSchema = envelope(
  'skill.save.accept',
  z.object({ requestId: z.string(), name: z.string() }),
);
export const RunCancelSchema = envelope('run.cancel', z.object({ requestId: z.string() }));

// ---- Engine -> Renderer ----
export const SessionReadySchema = envelope(
  'session.ready',
  z.object({
    sessionId: z.string(),
    protocolVersion: z.number().int(),
    engineVersion: z.string(),
  }),
);
export const PlanProposedSchema = envelope(
  'plan.proposed',
  z.object({
    requestId: z.string(),
    planId: z.string(),
    title: z.string(),
    summary: z.string(),
    steps: z.array(PlanStepSchema),
  }),
);
export const StatusSchema = envelope(
  'status',
  z.object({
    requestId: z.string(),
    state: RunStateSchema,
    detail: z.string().optional(), // short non-sensitive label
  }),
);
export const IndexProgressSchema = envelope(
  'index.progress',
  z.object({
    requestId: z.string(),
    processed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
);
export const StepStartedSchema = envelope(
  'step.started',
  z.object({ planId: z.string(), stepId: z.string(), label: z.string() }),
);
export const StepProgressSchema = envelope(
  'step.progress',
  z.object({ planId: z.string(), stepId: z.string(), fraction: z.number().min(0).max(1) }),
);
export const ConfirmRequiredSchema = envelope(
  'confirm.required',
  z.object({
    confirmId: z.string(),
    planId: z.string(),
    action: z.string(), // short human label, e.g. 'write file'
    detail: z.string(), // short human label, e.g. 'summary.md in your workspace'
  }),
);
export const AnswerPartialSchema = envelope(
  'answer.partial',
  z.object({ requestId: z.string(), textDelta: z.string() }),
);
export const ResultFinalSchema = envelope(
  'result.final',
  z.object({
    requestId: z.string(),
    answer: z.string(),
    citations: z.array(CitationSchema).optional(),
  }),
);
export const SkillSaveOfferSchema = envelope(
  'skill.save.offer',
  z.object({ requestId: z.string(), suggestedName: z.string(), description: z.string() }),
);
export const SkillSavedSchema = envelope(
  'skill.saved',
  z.object({ skillId: z.string(), name: z.string(), path: z.string() }),
);
export const ErrorSchema = envelope(
  'error',
  z.object({
    requestId: z.string().optional(),
    code: z.string(), // SYNTHETIC code only — never a message/stack/prompt/credential
    retryable: z.boolean(),
  }),
);

// ---- unions ----
export const RendererToEngineSchema = z.discriminatedUnion('type', [
  HelloSchema,
  RequestSubmitSchema,
  PlanConfirmSchema,
  PlanCancelSchema,
  ConfirmResponseSchema,
  SkillSaveAcceptSchema,
  RunCancelSchema,
]);
export const EngineToRendererSchema = z.discriminatedUnion('type', [
  SessionReadySchema,
  PlanProposedSchema,
  StatusSchema,
  IndexProgressSchema,
  StepStartedSchema,
  StepProgressSchema,
  ConfirmRequiredSchema,
  AnswerPartialSchema,
  ResultFinalSchema,
  SkillSaveOfferSchema,
  SkillSavedSchema,
  ErrorSchema,
]);
export const ProtocolEventSchema = z.union([RendererToEngineSchema, EngineToRendererSchema]);

export type RendererToEngine = z.infer<typeof RendererToEngineSchema>;
export type EngineToRenderer = z.infer<typeof EngineToRendererSchema>;
export type ProtocolEvent = z.infer<typeof ProtocolEventSchema>;

// Canonical list of every event `type`. The drift-guard test asserts parity against
// protocol/examples and protocol/Protocol.cs.
export const ALL_EVENT_TYPES = [
  // Renderer -> Engine
  'hello',
  'request.submit',
  'plan.confirm',
  'plan.cancel',
  'confirm.response',
  'skill.save.accept',
  'run.cancel',
  // Engine -> Renderer
  'session.ready',
  'plan.proposed',
  'status',
  'index.progress',
  'step.started',
  'step.progress',
  'confirm.required',
  'answer.partial',
  'result.final',
  'skill.save.offer',
  'skill.saved',
  'error',
] as const;
export type EventType = (typeof ALL_EVENT_TYPES)[number];

/** Construct a well-formed message envelope. Used by the engine, renderers, and tests. */
export function makeMessage<T extends EventType, P>(
  type: T,
  sessionId: string,
  seq: number,
  payload: P,
) {
  return { v: PROTOCOL_VERSION, type, sessionId, seq, payload } as const;
}
```

- [ ] **Step 2: Write `protocol/src/index.ts`**

Create `protocol/src/index.ts`:
```ts
export * from './events';
export { EXAMPLES } from './examples';
```
(`examples.ts` is created in Task B4; if you build before then, `index.ts` will fail to resolve `./examples` — that is expected mid-plan. Build/verify happens in Task B5 after examples exist.)

- [ ] **Step 3: Stage and commit (await operator go-ahead)**

```powershell
git add protocol/src/events.ts protocol/src/index.ts
git commit -m "feat(protocol): freeze the 19-event socket contract as zod schemas"
```

### Task B3: Test schema accept/reject behavior

**Files:**
- Test: `protocol/test/events.test.ts`

- [ ] **Step 1: Write the failing test**

Create `protocol/test/events.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  ProtocolEventSchema,
  RequestSubmitSchema,
  ErrorSchema,
  ResultFinalSchema,
  makeMessage,
  PROTOCOL_VERSION,
} from '../src/events';

describe('envelope + discriminated union', () => {
  it('accepts a well-formed request.submit', () => {
    const msg = makeMessage('request.submit', 'sess_1', 1, {
      requestId: 'req_1',
      text: 'Summarize this',
    });
    expect(ProtocolEventSchema.safeParse(msg).success).toBe(true);
  });

  it('rejects an unknown event type', () => {
    const bad = { v: PROTOCOL_VERSION, type: 'totally.fake', sessionId: 's', seq: 0, payload: {} };
    expect(ProtocolEventSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a wrong protocol version', () => {
    const bad = makeMessage('run.cancel', 's', 0, { requestId: 'r' });
    const tampered = { ...bad, v: 999 };
    expect(ProtocolEventSchema.safeParse(tampered).success).toBe(false);
  });

  it('rejects a payload missing a required field', () => {
    const bad = { v: PROTOCOL_VERSION, type: 'request.submit', sessionId: 's', seq: 1, payload: {} };
    expect(RequestSubmitSchema.safeParse(bad).success).toBe(false);
  });

  it('allows optional fields to be omitted (result.final without citations)', () => {
    const msg = makeMessage('result.final', 's', 2, { requestId: 'r', answer: 'done' });
    expect(ResultFinalSchema.safeParse(msg).success).toBe(true);
  });

  it('error payload accepts code-only (no free-text leak surface)', () => {
    const msg = makeMessage('error', 's', 3, { code: 'index_unavailable', retryable: true });
    const parsed = ErrorSchema.safeParse(msg);
    expect(parsed.success).toBe(true);
    // Guard the security invariant: a stray `message` field must be stripped by zod,
    // never preserved on the parsed object.
    const withMessage = makeMessage('error', 's', 4, {
      code: 'x',
      retryable: false,
      message: 'secret stack trace',
    } as unknown as { code: string; retryable: boolean });
    const out = ErrorSchema.parse(withMessage);
    expect('message' in out.payload).toBe(false);
  });

  it('rejects step.progress fraction outside 0..1', () => {
    const bad = makeMessage('step.progress', 's', 5, { planId: 'p', stepId: 'st', fraction: 1.5 });
    expect(ProtocolEventSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails (no examples build needed — imports src directly)**

Run:
```powershell
pnpm --filter @crash/protocol exec vitest run test/events.test.ts
```
Expected: FAILS only if `events.ts` is wrong. If Task B2 was done correctly these should already PASS — that is acceptable for a pure-schema module (the test pins behavior rather than driving new code). If anything fails, fix `events.ts` until green. The meaningful check is the `message`-stripping assertion: zod's default object schema strips unknown keys, so `'message' in out.payload` must be `false`.

- [ ] **Step 3: Confirm green**

Run:
```powershell
pnpm --filter @crash/protocol exec vitest run test/events.test.ts
```
Expected: PASS (7 assertions across the cases).

- [ ] **Step 4: Stage and commit (await operator go-ahead)**

```powershell
git add protocol/test/events.test.ts
git commit -m "test(protocol): pin schema accept/reject + error code-only invariant"
```

### Task B4: Provide one example payload per event type

**Files:**
- Create: `protocol/src/examples.ts`

- [ ] **Step 1: Write `protocol/src/examples.ts`**

Create `protocol/src/examples.ts`:
```ts
import { PROTOCOL_VERSION, type EventType, type ProtocolEvent } from './events';

const v = PROTOCOL_VERSION;
const s = 'sess_demo';

// One valid example per event type. Doubles as documentation and as the drift-guard
// fixture (protocol/test/contract.test.ts validates each against ProtocolEventSchema).
export const EXAMPLES: Record<EventType, ProtocolEvent> = {
  // ---- Renderer -> Engine ----
  hello: { v, type: 'hello', sessionId: '', seq: 0, payload: { token: 'tok_demo', protocolVersion: v, renderer: 'unity' } },
  'request.submit': { v, type: 'request.submit', sessionId: s, seq: 1, payload: { requestId: 'req_1', text: 'Summarize this for me', targetPath: 'notes/towns.pdf' } },
  'plan.confirm': { v, type: 'plan.confirm', sessionId: s, seq: 2, payload: { planId: 'plan_1' } },
  'plan.cancel': { v, type: 'plan.cancel', sessionId: s, seq: 3, payload: { planId: 'plan_1' } },
  'confirm.response': { v, type: 'confirm.response', sessionId: s, seq: 4, payload: { confirmId: 'cf_1', approved: true } },
  'skill.save.accept': { v, type: 'skill.save.accept', sessionId: s, seq: 5, payload: { requestId: 'req_1', name: 'Summarize This' } },
  'run.cancel': { v, type: 'run.cancel', sessionId: s, seq: 6, payload: { requestId: 'req_1' } },
  // ---- Engine -> Renderer ----
  'session.ready': { v, type: 'session.ready', sessionId: s, seq: 0, payload: { sessionId: s, protocolVersion: v, engineVersion: '0.1.0' } },
  'plan.proposed': { v, type: 'plan.proposed', sessionId: s, seq: 1, payload: { requestId: 'req_1', planId: 'plan_1', title: 'Summarize your document', summary: 'I will read the file and write a short summary.', steps: [{ id: 'st_1', label: 'Read the document' }, { id: 'st_2', label: 'Write a summary' }] } },
  status: { v, type: 'status', sessionId: s, seq: 2, payload: { requestId: 'req_1', state: 'running', detail: 'reading' } },
  'index.progress': { v, type: 'index.progress', sessionId: s, seq: 3, payload: { requestId: 'req_1', processed: 3, total: 10 } },
  'step.started': { v, type: 'step.started', sessionId: s, seq: 4, payload: { planId: 'plan_1', stepId: 'st_1', label: 'Read the document' } },
  'step.progress': { v, type: 'step.progress', sessionId: s, seq: 5, payload: { planId: 'plan_1', stepId: 'st_1', fraction: 0.5 } },
  'confirm.required': { v, type: 'confirm.required', sessionId: s, seq: 6, payload: { confirmId: 'cf_1', planId: 'plan_1', action: 'write file', detail: 'summary.md in your workspace' } },
  'answer.partial': { v, type: 'answer.partial', sessionId: s, seq: 7, payload: { requestId: 'req_1', textDelta: 'Your document is about ' } },
  'result.final': { v, type: 'result.final', sessionId: s, seq: 8, payload: { requestId: 'req_1', answer: 'Your document is about three small towns.', citations: [{ source: 'towns.pdf', snippet: 'Three towns share a river.' }] } },
  'skill.save.offer': { v, type: 'skill.save.offer', sessionId: s, seq: 9, payload: { requestId: 'req_1', suggestedName: 'Summarize This', description: 'Reads a document and writes a short summary.' } },
  'skill.saved': { v, type: 'skill.saved', sessionId: s, seq: 10, payload: { skillId: 'sk_1', name: 'Summarize This', path: 'skills/summarize-this/SKILL.md' } },
  error: { v, type: 'error', sessionId: s, seq: 11, payload: { requestId: 'req_1', code: 'index_unavailable', retryable: true } },
};
```

- [ ] **Step 2: Typecheck (the `Record<EventType, ProtocolEvent>` type forces every example to be shape-valid at compile time)**

Run:
```powershell
pnpm --filter @crash/protocol run typecheck
```
Expected: PASS. A malformed example (wrong field, missing key, bad enum) is a compile error here — that is the point. Fix any flagged example.

- [ ] **Step 3: Stage and commit (await operator go-ahead)**

```powershell
git add protocol/src/examples.ts
git commit -m "feat(protocol): add one validated example payload per event type"
```

### Task B5: Hand-mirror the contract to `Protocol.cs` for Unity

**Files:**
- Create: `protocol/Protocol.cs`

- [ ] **Step 1: Write `protocol/Protocol.cs`**

Create `protocol/Protocol.cs`:
```csharp
// Crash socket contract — HAND-MIRROR of protocol/src/events.ts for Unity (C#).
// The TypeScript file is canonical. This file is kept in sync by the drift-guard test
// protocol/test/contract.test.ts, which asserts the Version and every event-type string
// below match events.ts. If you change events.ts, change this file in the SAME commit.
//
// SECURITY: ErrorPayload carries Code only — never a message/stack/prompt/credential.

using System;

namespace Crash.Protocol
{
    public static class CrashProtocol
    {
        // Mirrors PROTOCOL_VERSION in events.ts.
        public const int Version = 1;

        // Mirrors ALL_EVENT_TYPES in events.ts (order-independent; the drift test checks membership).
        public static readonly string[] EventTypes = new string[]
        {
            // Renderer -> Engine
            "hello",
            "request.submit",
            "plan.confirm",
            "plan.cancel",
            "confirm.response",
            "skill.save.accept",
            "run.cancel",
            // Engine -> Renderer
            "session.ready",
            "plan.proposed",
            "status",
            "index.progress",
            "step.started",
            "step.progress",
            "confirm.required",
            "answer.partial",
            "result.final",
            "skill.save.offer",
            "skill.saved",
            "error",
        };
    }

    // Envelope: { v, type, sessionId, seq, payload }. Unity deserializes `type` first to
    // pick the payload struct. (Concrete JSON wiring is added when Unity consumes this.)
    [Serializable]
    public class Envelope
    {
        public int v;
        public string type;
        public string sessionId;
        public int seq;
    }

    // ---- shared ----
    [Serializable] public class PlanStep { public string id; public string label; }
    [Serializable] public class Citation { public string source; public string snippet; }

    // ---- Renderer -> Engine payloads ----
    [Serializable] public class HelloPayload { public string token; public int protocolVersion; public string renderer; }
    [Serializable] public class RequestSubmitPayload { public string requestId; public string text; public string targetPath; }
    [Serializable] public class PlanConfirmPayload { public string planId; }
    [Serializable] public class PlanCancelPayload { public string planId; }
    [Serializable] public class ConfirmResponsePayload { public string confirmId; public bool approved; }
    [Serializable] public class SkillSaveAcceptPayload { public string requestId; public string name; }
    [Serializable] public class RunCancelPayload { public string requestId; }

    // ---- Engine -> Renderer payloads ----
    [Serializable] public class SessionReadyPayload { public string sessionId; public int protocolVersion; public string engineVersion; }
    [Serializable] public class PlanProposedPayload { public string requestId; public string planId; public string title; public string summary; public PlanStep[] steps; }
    [Serializable] public class StatusPayload { public string requestId; public string state; public string detail; }
    [Serializable] public class IndexProgressPayload { public string requestId; public int processed; public int total; }
    [Serializable] public class StepStartedPayload { public string planId; public string stepId; public string label; }
    [Serializable] public class StepProgressPayload { public string planId; public string stepId; public float fraction; }
    [Serializable] public class ConfirmRequiredPayload { public string confirmId; public string planId; public string action; public string detail; }
    [Serializable] public class AnswerPartialPayload { public string requestId; public string textDelta; }
    [Serializable] public class ResultFinalPayload { public string requestId; public string answer; public Citation[] citations; }
    [Serializable] public class SkillSaveOfferPayload { public string requestId; public string suggestedName; public string description; }
    [Serializable] public class SkillSavedPayload { public string skillId; public string name; public string path; }
    [Serializable] public class ErrorPayload { public string requestId; public string code; public bool retryable; }
}
```

- [ ] **Step 2: Stage and commit (await operator go-ahead)**

```powershell
git add protocol/Protocol.cs
git commit -m "feat(protocol): add hand-mirrored Protocol.cs for Unity"
```

### Task B6: Drift-guard test — examples ↔ types ↔ Protocol.cs parity

**Files:**
- Test: `protocol/test/contract.test.ts`

- [ ] **Step 1: Write the failing test**

Create `protocol/test/contract.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ALL_EVENT_TYPES, ProtocolEventSchema, PROTOCOL_VERSION } from '../src/events';
import { EXAMPLES } from '../src/examples';

// fileURLToPath (not import.meta.url.pathname.slice(1)) — the slice trick breaks on Windows.
const here = dirname(fileURLToPath(import.meta.url));
const protocolRoot = join(here, '..');

describe('contract: examples', () => {
  it('has exactly one example per event type', () => {
    expect(Object.keys(EXAMPLES).sort()).toEqual([...ALL_EVENT_TYPES].sort());
  });

  it('every example validates against the protocol union schema', () => {
    for (const [type, msg] of Object.entries(EXAMPLES)) {
      const result = ProtocolEventSchema.safeParse(msg);
      expect(result.success, `example "${type}" failed schema validation`).toBe(true);
    }
  });
});

describe('contract: C# mirror parity (Protocol.cs)', () => {
  const cs = readFileSync(join(protocolRoot, 'Protocol.cs'), 'utf8');

  it('declares the same protocol version', () => {
    expect(cs).toContain(`Version = ${PROTOCOL_VERSION}`);
  });

  it('mentions every event type string', () => {
    for (const type of ALL_EVENT_TYPES) {
      expect(cs.includes(`"${type}"`), `Protocol.cs missing event type "${type}"`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the full protocol test suite**

Run:
```powershell
pnpm --filter @crash/protocol run test:run
```
Expected: PASS — `events.test.ts` + `contract.test.ts`. The parity tests confirm `examples.ts`, `events.ts`, and `Protocol.cs` agree on the 19 event types and the version.

- [ ] **Step 3: Build the package and confirm the public entry resolves**

Run:
```powershell
pnpm --filter @crash/protocol run build
Test-Path protocol\dist\index.js, protocol\dist\index.d.ts
```
Expected: `tsc` emits `protocol/dist/`; both `Test-Path` checks print `True`.

- [ ] **Step 4: Stage and commit (await operator go-ahead)**

```powershell
git add protocol/test/contract.test.ts
git commit -m "test(protocol): drift-guard examples/types/Protocol.cs parity"
```

### Task B7: Backend stub — prove the contract imports across packages

**Files:**
- Create: `backend/package.json` `backend/tsconfig.json` `backend/src/index.ts` `backend/README.md`
- Test: `backend/test/protocol-link.test.ts`

- [ ] **Step 1: Write `backend/package.json` (depends on the workspace contract)**

Create `backend/package.json`:
```json
{
  "name": "@crash/engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test:run": "vitest run"
  },
  "dependencies": {
    "@crash/protocol": "workspace:*"
  },
  "devDependencies": {
    "typescript": "~5.8.3",
    "vitest": "^1.6.1"
  }
}
```

- [ ] **Step 2: Write `backend/tsconfig.json`**

Create `backend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `backend/src/index.ts` (placeholder entry — real host is Plan 2)**

Create `backend/src/index.ts`:
```ts
// Engine host entry point. The real socket server + Claude Agent SDK loop arrives in
// Plan 2. For now this only re-exports a version constant and re-validates that the
// frozen contract is importable from a second workspace package.
import { PROTOCOL_VERSION } from '@crash/protocol';

export const ENGINE_VERSION = '0.1.0';

/** The protocol version this engine build speaks (sourced from @crash/protocol). */
export const SPEAKS_PROTOCOL = PROTOCOL_VERSION;
```

- [ ] **Step 4: Write `backend/README.md`**

Create `backend/README.md`:
```markdown
# backend/ — @crash/engine

The headless engine host: localhost WebSocket server (127.0.0.1 + per-session token),
Claude Agent SDK loop, local RAG, skill save/load, and voice. Renderer-agnostic — it
speaks only the `@crash/protocol` contract, so Unity and the R3F shell are interchangeable
clients.

**Status:** stub. This package currently only proves `@crash/protocol` imports across the
workspace. The socket server + agent loop are Plan 2.
```

- [ ] **Step 5: Write the cross-package import test**

Create `backend/test/protocol-link.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PROTOCOL_VERSION, ALL_EVENT_TYPES, ProtocolEventSchema, makeMessage } from '@crash/protocol';
import { SPEAKS_PROTOCOL, ENGINE_VERSION } from '../src/index';

describe('@crash/protocol is importable from @crash/engine', () => {
  it('exposes a numeric PROTOCOL_VERSION', () => {
    expect(typeof PROTOCOL_VERSION).toBe('number');
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('exposes all 19 event types', () => {
    expect(ALL_EVENT_TYPES).toHaveLength(19);
  });

  it('the engine reports the contract version it speaks', () => {
    expect(SPEAKS_PROTOCOL).toBe(PROTOCOL_VERSION);
    expect(typeof ENGINE_VERSION).toBe('string');
  });

  it('can build and validate a message using the shared contract', () => {
    const msg = makeMessage('session.ready', 'sess_1', 0, {
      sessionId: 'sess_1',
      protocolVersion: PROTOCOL_VERSION,
      engineVersion: ENGINE_VERSION,
    });
    expect(ProtocolEventSchema.safeParse(msg).success).toBe(true);
  });
});
```

- [ ] **Step 6: Install, build the contract, then run the backend test**

The backend test imports the BUILT `@crash/protocol` (its `exports` point at `dist/`), so the contract must be built first.

Run:
```powershell
pnpm install
pnpm --filter @crash/protocol run build
pnpm --filter @crash/engine run typecheck
pnpm --filter @crash/engine run test:run
```
Expected: install links `@crash/protocol` into `backend/node_modules`; protocol builds; backend typecheck passes; the 4 link tests pass. If the test cannot resolve `@crash/protocol`, confirm Task B6 Step 3 built `protocol/dist/` and re-run.

- [ ] **Step 7: Full workspace green pass**

Run:
```powershell
pnpm run build
pnpm run test
pnpm run typecheck
```
Expected: every workspace member builds, all tests pass (protocol + backend + the relocated r3f-shell), every member typechecks. This is the Phase B definition-of-done.

- [ ] **Step 8: Stage and commit (await operator go-ahead)**

```powershell
git add backend/ pnpm-lock.yaml
git commit -m "feat(engine): stub @crash/engine; prove cross-package contract import"
```

---

# Phase C — CI/CD pipeline (survive the restructure)

Phase A deletes `package-lock.json` and moves the root `package.json` scripts into `frontend/r3f-shell/`, which **breaks the existing `quick-check.yml`** (it runs `npm ci` + `npm run typecheck` against scripts that no longer live at the root). Because the Commit Policy gates every push, CI does not actually execute until the operator authorizes a push — so this migration lands here and goes live on that first push. Two tasks: migrate the check workflow to the pnpm workspace (C1), add a tag-gated release workflow (C2). Run commands from the repo root in PowerShell.

Verification note for both tasks: the workflows are inert in normal operation — `quick-check.yml` runs on push/PR to `main` (gated by Commit Policy) and `release.yml` runs only on a `v*` tag. Local verification is therefore structural: the YAML references only scripts/paths that exist after Phases A–B, and the full-workspace green sequence it runs was already proven locally in Task B7 Step 7. The first *live* run is the first operator-authorized push (C1) / tag (C2).

### Task C1: Migrate the check workflow from npm to the pnpm workspace

**Files:**
- Modify (rewrite): `.github/workflows/quick-check.yml`
- Modify: `package.json` (root — add a `packageManager` field so CI and local agree on the pnpm version)

- [ ] **Step 1: Pin the pnpm version both sides will use**

Run:
```powershell
pnpm --version
```
Note the printed version (e.g. `9.12.0`). In the root `package.json` (created in Task A5), add a top-level `"packageManager"` field set to that exact version, placed right after `"version": "0.1.0",`:
```json
  "packageManager": "pnpm@9.12.0",
```
Use the literal string `pnpm@` + the output of `pnpm --version`. This makes `pnpm/action-setup@v4` auto-detect the pnpm version in CI and match the committed `pnpm-lock.yaml` format (a major-version mismatch is the most common pnpm CI failure).

- [ ] **Step 2: Rewrite `.github/workflows/quick-check.yml` for the pnpm workspace**

Replace the ENTIRE contents of `.github/workflows/quick-check.yml` with:
```yaml
name: quick-check

# Phase C: pnpm workspace CI. The TS gate runs on cheap ubuntu (protocol + backend + the
# r3f-shell's JS side are all platform-independent); the Rust gate runs on windows-latest
# because the Tauri crate builds against the Windows WebView2 toolchain. Unity-on-CI is
# intentionally absent (license-gated GameCI; see the Phase C closing note in the plan).

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: quick-check-${{ github.event.pull_request.number || github.sha }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  ts:
    name: build + typecheck + test (TS workspace)
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node 20 LTS
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install workspace deps
        run: pnpm install --frozen-lockfile

      # Build BEFORE typecheck: backend resolves @crash/protocol via its exports ->
      # dist/*.d.ts, which only exists after protocol is compiled. `pnpm -r` runs in
      # topological order (protocol -> backend -> shell), so protocol/dist is emitted first.
      - name: Build (topological)
        run: pnpm -r run build

      - name: Typecheck
        run: pnpm -r run typecheck

      - name: Test
        run: pnpm -r run test:run

  rust:
    name: cargo test (Tauri sidecar)
    runs-on: windows-latest
    timeout-minutes: 20
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Rust toolchain
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: frontend/r3f-shell/src-tauri

      - name: Cargo test
        run: cargo test --manifest-path frontend/r3f-shell/src-tauri/Cargo.toml --locked
```

- [ ] **Step 3: Confirm `Cargo.lock` is tracked (so `--locked` won't fail in CI)**

Run:
```powershell
git ls-files frontend/r3f-shell/src-tauri/Cargo.lock
```
Expected: prints `frontend/r3f-shell/src-tauri/Cargo.lock`. If it prints nothing, the lockfile is untracked — stage it now (`git add frontend/r3f-shell/src-tauri/Cargo.lock`) and include it in this task's commit, because `--locked` needs a committed lockfile. (A Tauri *app* commits its `Cargo.lock`; only libraries omit it.)

- [ ] **Step 4: Structural verification (CI is inert until an authorized push)**

Run:
```powershell
Test-Path frontend\r3f-shell\src-tauri\Cargo.toml
Select-String -Path .github\workflows\quick-check.yml -Pattern "pnpm install --frozen-lockfile", "pnpm -r run build", "pnpm -r run typecheck", "pnpm -r run test:run"
```
Expected: `Test-Path` prints `True`; all four pnpm command lines are found. The `build`/`typecheck`/`test:run` scripts are defined in all three members (shell via A6/A7, protocol via B1, backend via B7), and the full-workspace green pass was already proven locally in Task B7 Step 7 — CI just re-runs that proven sequence on clean ubuntu + windows runners. (If `actionlint` or `act` happen to be installed you may lint locally, but neither is required.)

- [ ] **Step 5: Stage and commit (await operator go-ahead)**

```powershell
git add .github/workflows/quick-check.yml package.json
git commit -m "ci: migrate quick-check to pnpm workspace; split TS (ubuntu) + Rust (windows) gates"
```

### Task C2: Add the tag-gated Tauri Windows release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write `.github/workflows/release.yml`**

Create `.github/workflows/release.yml`:
```yaml
name: release

# Phase C: build the Windows Tauri installer on a v* tag and attach it to a DRAFT GitHub
# Release (the operator publishes manually). Windows-only for 6/1. Code-signing is
# post-Monday (spec Section 14) — the env block marks where the signing secrets slot in.

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write   # create the GitHub Release and upload the installer artifacts

jobs:
  build-windows:
    name: Tauri Windows installer
    runs-on: windows-latest
    timeout-minutes: 30
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4

      - name: Setup Node 20 LTS
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Setup Rust toolchain
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: frontend/r3f-shell/src-tauri

      - name: Install workspace deps
        run: pnpm install --frozen-lockfile

      - name: Build, bundle, and draft the release
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Post-Monday code-signing slots in here (do NOT add before the operator asks):
          #   TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          #   TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          projectPath: frontend/r3f-shell
          tagName: ${{ github.ref_name }}
          releaseName: 'Crash ${{ github.ref_name }}'
          releaseDraft: true
          prerelease: false
```
How it works: `tauri-action` reads `projectPath: frontend/r3f-shell` to find `src-tauri/`, auto-detects pnpm from the root `pnpm-lock.yaml`, and runs the `beforeBuildCommand` (`pnpm run build` -> `vite build`, set in Task A6) before `tauri build`. The default `GITHUB_TOKEN` is sufficient to create the draft release; no extra secrets are needed for the unsigned 6/1 build.

- [ ] **Step 2: Structural verification (release is inert until a `v*` tag is pushed)**

Run:
```powershell
Test-Path frontend\r3f-shell\src-tauri\tauri.conf.json
Select-String -Path .github\workflows\release.yml -Pattern "projectPath: frontend/r3f-shell", "tauri-apps/tauri-action@v0", "releaseDraft: true"
```
Expected: `Test-Path` prints `True`; the three lines are found. This workflow triggers only on a `v*` tag push, which the operator controls — so it adds zero load to day-to-day commits and its first live run is whenever the operator tags a release.

- [ ] **Step 3: Stage and commit (await operator go-ahead)**

```powershell
git add .github/workflows/release.yml
git commit -m "ci: add tag-gated Tauri Windows release workflow (draft release, unsigned)"
```

**Closing note — why Unity is not on CI.** A GameCI job (`game-ci/unity-test-runner` / `unity-builder`) is deliberately OUT of this plan: (1) the Linux Docker images GameCI runs on cannot cross-build a Windows IL2CPP player, so a Windows build needs a windows-latest or self-hosted Unity install — slow and heavy; (2) it requires the Unity license injected as GitHub secrets (`UNITY_LICENSE` / `UNITY_EMAIL` / `UNITY_PASSWORD`); (3) the `Library/` cache is large and the cold build runs many minutes. For 6/1 the Unity build is verified on the operator's laptop (the only demo machine). When Unity-on-CI is wanted, it belongs in its own `paths`-filtered, `workflow_dispatch`, non-required workflow so it never blocks the fast TS/Rust gate.

---

# Phase D — Unity 6 connection (dev-time + runtime foundation)

"CC connects to Unity 6" is two distinct connections, and this phase lays the foundation for both:

1. **Dev-time (Task D2):** Claude Code drives the Unity *Editor* over an MCP stdio server (IvanMurzak/Unity-MCP) — design-time authoring (create/inspect GameObjects, run EditMode/PlayMode tests). Delivered as a working, documented setup now.
2. **Runtime (Task D1):** the *built game* talks to the headless engine over a `127.0.0.1` WebSocket using NativeWebSocket, consuming the hand-mirrored `Protocol.cs`. This phase adds the dependency and documents the client; the actual `CrashWsClient.cs` and live wiring are Plan 3.

NativeWebSocket is a standalone package with no transitive dependencies, so it is added directly to the manifest as an upstream-documented git-URL dependency (D1). The Unity-MCP package pulls several transitive dependencies, so it is added with the OpenUPM CLI, which writes the correct `scopedRegistries` block and every transitive scope (D2) — a hand-rolled `scopes: ["com.ivanmurzak"]` would silently miss them. Package *resolution and compilation* happen when the operator next opens the Editor (an interactive step, flagged where it occurs). Run commands from the repo root in PowerShell.

### Task D1: Add the NativeWebSocket runtime dependency and document the runtime client

**Files:**
- Modify: `frontend/unity/Packages/manifest.json` (add one git-URL dependency)
- Create: `frontend/unity/README.md`

- [ ] **Step 1: Add the NativeWebSocket dependency to the Unity manifest**

Open `frontend/unity/Packages/manifest.json`, find the `"dependencies": {` object, and add this as the first entry inside it (NativeWebSocket 2.x is the `#upm-2` branch; it has no transitive deps, so no scoped registry is needed):
```json
    "com.endel.nativewebsocket": "https://github.com/endel/NativeWebSocket.git#upm-2",
```
Keep the JSON valid — there must be a comma between this entry and the next one. (UPM resolves git-URL packages using the machine's `git`; this machine has Git on PATH. Do NOT hand-edit `Packages/packages-lock.json` — Unity regenerates it on open.)

- [ ] **Step 2: Verify the manifest is still valid JSON**

Run:
```powershell
node -e "JSON.parse(require('fs').readFileSync('frontend/unity/Packages/manifest.json','utf8')); console.log('manifest.json OK')"
```
Expected: prints `manifest.json OK`. A stray/missing comma here would break the whole Unity project, so this gate matters. (The package itself downloads + compiles when the operator opens the Editor; if the Package Manager shows the git dependency unresolved, confirm `git --version` works from the shell that launches Unity.)

- [ ] **Step 3: Create `frontend/unity/README.md` (documents BOTH connections)**

Create `frontend/unity/README.md`:
```markdown
# frontend/unity — Crash fox renderer (Unity 6)

Unity 6 (6000.4.9f1, URP 17.4.0). The committed 6/1 face. A *client* of the
`@crash/protocol` socket contract: it consumes the hand-mirrored C# types in
`../../protocol/Protocol.cs` (kept in sync with the canonical `protocol/src/events.ts`
by the drift-guard test).

## How Claude Code connects to Unity 6

Two distinct connections — do not conflate them:

### 1. Dev-time: Claude Code drives the Editor (MCP)
The IvanMurzak Unity-MCP package exposes the running Editor to Claude Code over an MCP
stdio server, so CC can create/inspect GameObjects and run EditMode/PlayMode tests at
design time. One-time setup (partly interactive): see `../../docs/unity-mcp-setup.md`.

### 2. Runtime: the built game talks to the engine (WebSocket)
At runtime the game connects to the headless engine on `127.0.0.1` and exchanges
`@crash/protocol` JSON events. Transport = [NativeWebSocket](https://github.com/endel/NativeWebSocket)
(`com.endel.nativewebsocket`, in `Packages/manifest.json`), chosen because it is IL2CPP-safe
on desktop standalone (the BCL `ClientWebSocket` forces manual main-thread marshalling and
`websocket-sharp` is broken under IL2CPP).

The actual `CrashWsClient.cs` is built in Plan 3. The intended shape:

- Build the URL with the per-session token in the query string:
  `ws://127.0.0.1:<port>/?token=<sessionToken>` (the engine assigns both).
- `OnOpen`: send the `hello` event (token + `protocolVersion` + `renderer: "unity"`).
- `OnMessage`: parse the `Envelope` first to read `type`, then deserialize the matching
  `*Payload` class from `Protocol.cs`.
- Pump the receive queue on the main thread so Unity API calls are legal:

  `​``csharp
  void Update()
  {
  #if !UNITY_WEBGL || UNITY_EDITOR
      _ws?.DispatchMessageQueue();
  #endif
  }
  `​``
- `OnDestroy`: `await _ws.Close();` to close the socket cleanly.
- A standalone Windows IL2CPP build must be smoke-tested before the demo — Editor Mono
  play mode does not exercise the IL2CPP code path.

## Not a pnpm member
This is a C# project, intentionally excluded from `pnpm-workspace.yaml`.
```

- [ ] **Step 4: Stage and commit (await operator go-ahead)**

```powershell
git add frontend/unity/Packages/manifest.json frontend/unity/README.md
git commit -m "feat(unity): add NativeWebSocket runtime dep plus connection docs"
```

### Task D2: Wire the IvanMurzak Unity-MCP dev-time bridge for Claude Code

**Files:**
- Modify: `frontend/unity/Packages/manifest.json` (via `openupm add`)
- Create: `.mcp.json.example` (repo root)
- Create: `docs/unity-mcp-setup.md`

- [ ] **Step 1: Install the OpenUPM CLI (once)**

Run:
```powershell
npm install -g openupm-cli
openupm --version
```
Expected: prints a version. (openupm-cli edits `Packages/manifest.json` directly; it does not need the Unity Editor.)

- [ ] **Step 2: Add the Unity-MCP package via OpenUPM (auto-resolves transitive scopes)**

Run:
```powershell
openupm add com.ivanmurzak.unity.mcp -c frontend/unity
```
Expected: openupm adds `com.ivanmurzak.unity.mcp` (current 0.76.2 as of 2026-05-30) and merges the `com.ivanmurzak` scope plus any transitive scopes into the `scopedRegistries` block of `frontend/unity/Packages/manifest.json`. (`-c frontend/unity` points the CLI at the Unity project. Using the CLI rather than a hand edit is deliberate: it pulls the transitive dependency scopes that a manual `scopes: ["com.ivanmurzak"]` would miss.)

- [ ] **Step 3: Verify the manifest is still valid JSON**

Run:
```powershell
node -e "JSON.parse(require('fs').readFileSync('frontend/unity/Packages/manifest.json','utf8')); console.log('manifest.json OK')"
```
Expected: prints `manifest.json OK`.

- [ ] **Step 4: Create the Claude Code MCP registration template**

Create `.mcp.json.example`:
```json
{
  "mcpServers": {
    "ai-game-developer": {
      "command": "frontend/unity/Library/mcp-server/win-x64/unity-mcp-server.exe",
      "args": ["port=8080", "client-transport=stdio"]
    }
  }
}
```
This is a committed template for reference. The live registration is done with `claude mcp add` in the setup doc, because the server binary lives under gitignored `Library/` and exists only after the Editor downloads it.

- [ ] **Step 5: Write `docs/unity-mcp-setup.md`**

Create `docs/unity-mcp-setup.md`:
```markdown
# Connecting Claude Code to the Unity 6 Editor (dev-time MCP)

This wires Claude Code to the running Unity Editor via the IvanMurzak Unity-MCP server, so
CC can drive the Editor (create/inspect objects, run EditMode/PlayMode tests) at design
time. This is the *dev-time* connection; the *runtime* game-to-engine socket is separate
(see `frontend/unity/README.md`).

## Prerequisites
- `com.ivanmurzak.unity.mcp` is in `frontend/unity/Packages/manifest.json` (added in
  Plan 1, Task D2 via `openupm add`).
- Claude Code CLI on PATH.

## One-time setup (some steps are interactive — they need the Editor open)

1. **Open `frontend/unity` in Unity 6.** The Package Manager resolves the Unity-MCP package
   and downloads the platform server binary to
   `frontend/unity/Library/mcp-server/win-x64/unity-mcp-server.exe`. (`Library/` is
   gitignored; the binary is machine-local.)

2. **Open the Editor window:** `Window > AI Game Developer`. Note the port (default `8080`).
   If prompted, click *Configure* / *Auto-generate skills*.

3. **Register the server with Claude Code** (run from the repo root so the relative path
   resolves, or substitute the absolute path). The `--` separates the command from
   `claude mcp add`'s own flags:
   `​``powershell
   claude mcp add ai-game-developer -- "frontend/unity/Library/mcp-server/win-x64/unity-mcp-server.exe" port=8080 client-transport=stdio
   `​``
   (The committed `.mcp.json.example` shows the equivalent JSON shape.)

4. **Restart Claude Code** so it spawns the new MCP server, then verify the
   `ai-game-developer` tools are listed (`/mcp`). With the Editor open and the server
   running, CC can now drive Unity.

## Verifying the connection
With Unity open and CC restarted, ask CC to list the scene hierarchy or run the EditMode
tests through the `ai-game-developer` tools. A response from the Editor confirms the
dev-time connection is live.

## Notes
- The binary path and the `Window > AI Game Developer` menu are from Unity-MCP 0.76.2
  (2026-05-30); confirm the exact path after the package downloads the server.
- This connection is development-only. It is not part of the shipped demo build.
- If `claude mcp add` reports the server fails to start, confirm the `.exe` exists (step 1
  must have completed with the Editor open) and that the port matches the Editor window.
```

- [ ] **Step 6: Stage and commit (await operator go-ahead)**

```powershell
git add frontend/unity/Packages/manifest.json .mcp.json.example docs/unity-mcp-setup.md
git commit -m "feat(unity): wire IvanMurzak Unity-MCP dev bridge for Claude Code"
```

**Acceptance note for Phase D.** The dev-time connection's final live check (open Editor -> server downloads -> `claude mcp add` -> restart CC -> Editor responds) is an interactive operator step, because it requires the Editor running and a CC restart; it is not an automated gate. Everything verifiable headlessly is gated in-task: the manifest stays valid JSON, `.mcp.json.example` is well-formed, the setup doc is exact. The runtime connection is foundation-only here (dependency + documented client); the live socket client is Plan 3.

---

## Self-Review (run by the author against the spec)

**1. Spec coverage (Section 22 layout + Section 17 contract-first + Section 18 IN-scope foundation):**
- `frontend/` (r3f-shell + unity) — Tasks A3, A4, A8. ✔
- `backend/` — Tasks A2, B7. ✔
- `protocol/` (events.ts canonical + Protocol.cs mirror + one example/event) — Tasks B1–B6. ✔
- `curriculum/`, `installer/`, `docs/` — Tasks A2, A8 (docs pre-exists). ✔
- pnpm workspace on the TS side, Unity excluded — Tasks A5, B1, B7. ✔
- Code-org principles (one concern per subfolder, README per top dir, focused files) — READMEs A5/A8/B7; package boundaries throughout. ✔
- Contract-first (freeze events.ts before engine/renderer) — Phase B precedes all engine/renderer plans; backend is a stub only. ✔
- Section 3.1 event set frozen (19 types incl. the generic `request.submit`, the single `skill.save.offer` gate, `confirm.required/response`) — Task B2. ✔
- Security: `error` is code-only (no free-text leak surface) — enforced in `ErrorSchema` + asserted in B3; Tauri capability left untouched by wholesale move (A3 Step 2). ✔
- CI/CD that survives the restructure (npm->pnpm migration of `quick-check.yml`, cheap ubuntu TS gate + windows Rust gate, build-before-typecheck order, tag-gated Tauri release) — Phase C (C1, C2). ✔
- Unity 6 connection foundation — dev-time IvanMurzak MCP bridge (`.mcp.json.example` + `docs/unity-mcp-setup.md`) + NativeWebSocket runtime dep + documented runtime client (`frontend/unity/README.md`) — Phase D (D1, D2). ✔
- Operator constraint: every implementer + spec-reviewer + code-quality-reviewer subagent pinned to Opus 4.8 — stated in the "Subagent model" section. ✔
- **Deferred (correctly OUT of this plan, into Plan 2+):** the running mock/transport (127.0.0.1 + token handshake at runtime), the agent loop, RAG, voice, packaging, and swapping `src/types/sidecar-events.ts` for `@crash/protocol`; the actual `CrashWsClient.cs` (Plan 3); Unity-on-CI (license-gated GameCI) and code-signing (post-Monday). Flagged in Scope + the Phase C closing note + the Phase D acceptance note.

**2. Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". Every code step shows complete content; every command shows expected output. The `backend/src/index.ts` and READMEs are intentionally stubs but contain their full real content (not placeholders) and are labeled as stubs with the follow-up plan named.

**3. Type consistency:** `ProtocolEvent`, `ProtocolEventSchema`, `ALL_EVENT_TYPES`, `EventType`, `makeMessage`, `PROTOCOL_VERSION`, `EXAMPLES`, `SPEAKS_PROTOCOL`, `ENGINE_VERSION` are used with identical names across B2/B3/B4/B6/B7. `Record<EventType, ProtocolEvent>` in `examples.ts` ties examples to the inferred union. `Protocol.cs` `Version`/`EventTypes` names match what `contract.test.ts` greps for. Package names `@crash/protocol`, `@crash/engine`, `@crash/r3f-shell` are consistent across `pnpm-workspace.yaml`, root scripts, and each `package.json`.

**4. Known risk flagged, not hidden:** the relocated `tauri dev` echo demo is verified manually (A7 Step 5), not by an automated gate, because it is interactive. The dual `sidecar/echo.js` copies are preserved (not deduped) precisely to keep that demo working regardless of runtime CWD.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-29-crash-monorepo-and-protocol.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**2. Inline Execution** — execute tasks in this session using superpowers:executing-plans, batch execution with checkpoints for review.

**Note on commits:** per the operator's standing constraint, the executor stages each change and waits for explicit go-ahead before running any `git commit`/`git push`. Phase A (restructure), Phase B (contract), Phase C (CI/CD), and Phase D (Unity connection) are natural review checkpoints. Every implementer and reviewer subagent runs on Opus 4.8 (operator instruction; see the "Subagent model" section).

**Next plans in the series (not started):** Plan 2 — mock server + 127.0.0.1/token transport + the real engine host (agent loop) against the frozen contract. Plan 3 — wire a renderer (Unity primary, R3F fallback) to the live socket, write the actual `CrashWsClient.cs` against `Protocol.cs`, and retire `src/types/sidecar-events.ts`. Plan 4 — installer + BYO-OAuth onboarding + auto-update. (Optional, any time post-Monday: a `paths`-filtered, `workflow_dispatch` Unity-on-CI workflow — kept off the required fast gate.)
