# Crash - 3D AI Companion Hackathon Design Spec

- **Date:** 2026-05-28
- **Owner:** Ronil Basu (ron2k1) | ronilbasu@gmail.com
- **Status:** DRAFT v1 (post-council, awaiting user review)
- **Hackathon arc:** 6/1 PoC Fest (15:00 EST) → 6/3 AI Agents Prototype-to-Production → 6/7 vibeFORWARD
- **Source artifacts:** `C:\Users\thegr\Downloads\clawforge-spec.md` (original); `council/` (4 lenses); `design-refs/` (public references); `cicd-drafts/` (CI/CD)
- **Lock state:** Marketplace deferred to 6/3 browse-only (confirmed); Windows-only for 6/1; `node sidecar.js` not `bun --compile`; 1 demo + 2 stubs; Quaternius quadruped (no Mixamo reskin); Task Pane as separate Tauri window (WindowPet pattern); `<Html occlude>` ADD; custom GLSL CUT; voice line ADD; pre-cached 429 fallback ADD; demo VIDEO as primary submission

---

## 1. Goal & Non-Goals

**Goal:** Ship a desktop AI companion for non-developers. An anthropomorphic fox in a 3D magical workshop runs headless Claude Code on the user's files. Click the fox, type a task, watch it happen.

**Non-goals (out of scope, deliberately):**
- A developer IDE or terminal replacement (Claudia owns that)
- A cloud-hosted product (BYO key, your machine, your files)
- A general chat client (no chat history, no follow-up turns in v0.1)
- A plugin marketplace install flow (deferred to 6/7)
- A cross-platform .dmg for 6/1 (Windows-only; macOS at 6/3 conditional)
- A behind-the-scenes power-user mode (every UI surface speaks to a non-coder)

---

## 2. Target Audience & Wedge

**Audience:** the 99% of users who do not write code. The person whose Downloads folder has 800 files. The student who needs 30 resumes ranked. The parent renaming photos by date.

**Wedge:** the 3D fox character. "AI that does not feel like AI." Every other Claude Code UI in 2026 is a flat-2D Claudia-style dashboard. Strip the fox and Crash is a B-tier clone. Keep the fox and it is the only product in its category.

**Trust narrative:** open source MIT, your machine, your key, no cloud. The fox is the meme; the open-source repo is the credibility.

---

## 3. Scope Per Event

### P0 — 2026-06-01 15:00 EST (PoC Fest) — Windows-only

- Tauri 2 shell, React 18 + Vite 5, R3F + drei + @react-three/postprocessing
- Quaternius fox (quadruped, CC0), idle + one talk + one victory animation
- Speech bubble via drei `<Html occlude>` anchored to fox head bone
- Static workshop scene (books + potions + rune circle, `<Bloom>` postprocessing for the glow)
- Task Pane as **separate Tauri window** (WindowPet multi-window pattern), slides from right, auto-collapse 8s after last event
- Sidecar: `node sidecar.js` running `@anthropic-ai/claude-agent-sdk` query() loop, spawned via `tauri-plugin-shell`
- BYO Anthropic API key via `tauri-plugin-keyring`
- Sandboxing: SDK `additionalDirectories: [workspace]` + Tauri `fs:scope` capability
- **One polished demo fixture: Downloads cleanup**
- Two stub fixtures (clickable shelf tiles → "Coming Soon" toast): resume-rank, rename-by-rule
- Voice line at task completion (pre-recorded ElevenLabs clips)
- Pre-cached stream-JSON fallback for 429 / network failures (demo never relies on a live API call)
- Dry-run preview toggle (shows what would change; **no git undo for 6/1**)
- 60-second polished demo VIDEO as PRIMARY submission, live stage demo as bonus

### P1 — 2026-06-03 (AI Agents Prototype-to-Production)

- macOS `.dmg` build, conditional on Windows being green by 5/30 EOD
- **Marketplace: BROWSE-ONLY.** Read `~/.claude/plugins/`, render installed plugins in a 2D modal overlay (triggered by clicking the 3D bookshelves). No install/enable flow.
- One stub fixture made live (likely resume-rank with redacted sample resumes; LLM-bias caveat in the README)
- Polish + bugfix; no new architectural surface

### P2 — 2026-06-07 (vibeFORWARD)

- Curated allowlist marketplace install flow (ship a JSON of 5-10 vetted plugins; user toggles on/off; hooks still disabled by default)
- Third demo fixture made live (rename-by-rule)
- All three demos polished + recorded as separate video clips
- Real `git` snapshot+undo via `simple-git` Rust crate

---

## 4. Architecture

### Stack

| Layer | Tech | Version target |
|---|---|---|
| Shell | Tauri 2 | 2.9.x |
| Frontend | React 18 + Vite 5 + TypeScript | latest stable |
| 3D | React Three Fiber + drei + @react-three/postprocessing | r160+ |
| State | zustand | 4.5.4 |
| Sidecar runtime | Node.js 20 LTS | shipped as `node.exe` + `sidecar.js` in resources |
| Agent | `@anthropic-ai/claude-agent-sdk` | 0.2.98 |
| Secrets | `tauri-plugin-keyring` | latest |
| FS access | `tauri-plugin-fs` + capability JSON | latest |
| Process spawn | `tauri-plugin-shell` + capability JSON | latest |

### Data flow

1. User clicks the fox in the R3F canvas → R3F raycast onClick → zustand `dialogOpen = true`
2. drei `<Html occlude>` bubble renders with text input
3. User types task, hits Enter → Tauri command `start_task(prompt, workspace)` invoked
4. Rust spawns sidecar via `Command::sidecar('crash-sidecar').args([workspace, prompt]).spawn()`
5. Sidecar reads API key from keychain → calls `query({ prompt, options: {...locked safety defaults} })`
6. Sidecar emits JSONL on stdout: `{ "type": "tool_use" | "file_change" | "message_delta" | "task_end" | "error", "data": ... }`
7. Rust reads stdout line-buffered, parses JSON, emits `app.emit("sidecar-event", payload)`
8. Frontend Task Pane window (separate Tauri window) listens via `listen("sidecar-event")`, appends to zustand log, renders
9. On `task_end`, frontend plays a pre-recorded ElevenLabs voice clip + fox plays victory animation
10. On 429 error in step 5, sidecar checks if the current task matches a pre-cached fixture; if yes, replays cached events; if no, surfaces error

### Critical implementation discipline (council-flagged)

- `src-tauri/capabilities/default.json` MUST declare `shell:allow-execute` + `fs:allow-read-text-file` (scoped to workspace) + `fs:allow-write-text-file` (scoped to workspace). Otherwise plugin calls return vague "not allowed" errors.
- Sidecar binary file MUST be named exactly `crash-sidecar-x86_64-pc-windows-msvc.exe` for Windows (Tauri silently does not bundle if the suffix is wrong).
- Frontend event listener (`listen("sidecar-event")`) MUST register BEFORE sidecar spawn to avoid race-condition event loss.
- Rust stdout reader: line-buffered; must handle the case where a single JSON event splits across two `read()` calls (accumulate until newline).
- Rust MUST continuously drain stderr in a separate task; otherwise ~64KB buffer fills and the sidecar deadlocks.
- macOS asset MIME: list `glb` in `tauri.conf.json` `assetProtocol.scope` (only fails on macOS; Windows works without it).

---

## 5. UI / 3D Scene Composition

### Scene layout (single canvas)

- Camera: locked perspective, ~45° down, gentle orbit on idle (no user-controlled orbit in v0.1)
- Workshop: Quaternius archway + bookshelves + potion shelf + glowing rune circle on floor
- Fox: Quaternius CC0 quadruped, positioned on the rune circle
- Lighting: warm purple key light + amber accent (Wawa Sensei wizard-lesson recipe)
- Particles: wawa-vfx void-spell pulse on task start + task end (purple-to-white gradient)
- Rune circle: static `<ringGeometry>` + emissive material + `<EffectComposer><Bloom intensity={0.8} /></EffectComposer>`

### Interaction states

- **Idle:** fox plays Quaternius "Idle" animation clip; particles slow; bubble closed
- **Listening:** fox plays "Talk" clip; bubble open with text input; particle pulse on Enter
- **Working:** fox plays "Talk" clip again; Task Pane window opens (slides from right edge); particles intensify
- **Done:** fox plays "Victory" clip; voice line fires; Task Pane shows completion; auto-collapses after 8s

### Speech bubble

- drei `<Html position={[0, 1.8, 0]} center occlude>` anchored to fox head bone
- Tailwind frosted-glass styling (backdrop-blur + white/10 background + subtle shadow)
- Text input inside the `<Html>`, focused on open; Enter submits
- `occlude` prop fades the bubble when the fox turns away or a shelf comes between camera + anchor (30-minute add, flat-UI competitors cannot replicate)
- **NOT a custom GLSL bubble shader** (council CUT: drei `transform` + Tailwind gets 90% of the look at 0% of the shader-debug cost; push GLSL to v0.2)

### Task Pane (separate Tauri window)

- WindowPet pattern: separate native window, not a DOM panel inside the R3F canvas
- Rationale: cleaner z-order (no Three.js needs to repaint when the pane scrolls); no `<Html>` overlay flicker; can be dragged independently
- Slides in from right edge of screen (CSS transform on the window position)
- Auto-collapse 8 seconds after last sidecar event
- Content: scrolling list of `tool_use` + `file_change` events, plus a "Stop" button

---

## 6. Sidecar Protocol

### Event types (stdout JSONL, one event per line)

| `type` | `data` shape | When emitted |
|---|---|---|
| `task_start` | `{ taskId, prompt, workspace, timestamp }` | After `query()` invoked |
| `tool_use` | `{ taskId, tool: "Read"\|"Write"\|"Edit"\|..., args, result }` | After each SDK tool round-trip |
| `file_change` | `{ taskId, path, op: "create"\|"move"\|"edit"\|"delete" }` | Derived from `Write`/`Edit` tool results |
| `message_delta` | `{ taskId, text }` | Streaming text chunks from the model |
| `task_end` | `{ taskId, summary, durationMs, filesChanged: number }` | After `query()` resolves |
| `error` | `{ taskId, code, retryable: bool }` | On SDK errors (NEVER include `error.message` or response bodies — secret-leak surface per CLAUDE.md Rule 16) |

### 429 fallback

If `error.code === "rate_limit_exceeded"` AND the current task prompt matches the **1 polished fixture prompt** (Downloads cleanup) by string equality on normalized whitespace, the sidecar replays cached JSONL events from `resources/fixtures/downloads-cleanup.jsonl` with realistic timing delays. The two stub fixtures don't need a fallback because they're inert (toast-only). Audience never sees a failure.

---

## 7. Safety Defaults (LOCKED)

Per spec, non-negotiable:

```ts
const sdkOptions = {
  settingSources: [],                                    // no inherited settings
  allowedTools: ["Read","Write","Edit","Glob","Grep","Bash"],
  permissionMode: "dontAsk",                             // no permission prompts during demo
  hooks: undefined,                                      // hooks-disabled
  mcpServers: {},                                        // no third-party MCPs
  additionalDirectories: [workspace],                    // workspace-only file access
}
// workspace defaults to ~/Crash-Workspace/ in v0.1; user-overridable via settings in v0.2.
// Downloads-cleanup demo runs in a SHADOWED ~/Crash-Workspace/Downloads-Demo/ pre-seed dir
// so the SDK never actually touches the real ~/Downloads. UI fakes the "real Downloads" framing.
```

- API key stored in OS keychain (Windows Credential Manager) via `tauri-plugin-keyring`
- API key NEVER in plain files, env vars, or logs (CLAUDE.md Rule 16 invariant)
- Marketplace P1 (6/3): READ-ONLY (list installed plugins from `~/.claude/plugins/`; no enable/install)
- Marketplace P2 (6/7): curated allowlist install (ship JSON of vetted plugins; user toggles on/off; hooks STILL disabled by default; MCPs STILL blocked)

---

## 8. Demo Fixtures

### P0 lead: Downloads cleanup

- **Setup:** pre-seed `C:\Users\<demo>\Downloads\` with 47 files of mixed types (PDFs, PNGs, ZIPs, MP4s, installer .exes, random downloads)
- **Prompt:** "My Downloads folder is a disaster, fix it."
- **Behavior:** SDK calls Glob → Read filenames → group by mime type → Bash `mkdir Images Docs Installers Archive` → Bash `mv` calls
- **Visible:** files visibly fly out of Explorer/Finder window (which is open beside the app) into subfolders. Fox is animating on the rune. Task Pane shows `file_change` events streaming in.
- **Voice line at end:** "Done. 47 files in 12 seconds." (pre-recorded ElevenLabs)
- **Duration target:** 12-15 seconds from Enter to voice line
- **Pre-cached fallback ready** so a 429 mid-demo replays the exact same sequence

### P0 stubs (clickable but inert)

- **Resume-rank tile:** click → toast "Coming Soon. Available 6/3."
- **Rename-by-rule tile:** click → toast "Coming Soon. Available 6/7."

### P1+ (6/3, 6/7)

- One stub becomes live per event. Order TBD by 5/30 stability check.

---

## 9. Build + CI/CD

### Local build

```powershell
cargo tauri build --target x86_64-pc-windows-msvc
# produces: src-tauri/target/release/bundle/{msi,nsis}/
```

macOS Universal deferred to 6/3:
```bash
cargo tauri build --target universal-apple-darwin
# requires Mac or GHA macos-14 runner
```

### CI/CD (drafted, ready to deploy)

- `.github/workflows/build.yml`: full builds on push to `main` + tags `v*`, manual `workflow_dispatch`. Matrix: `windows-latest` (required green for 6/1), `macos-14` (allowed-fail for 6/1, required green for 6/3). Cold runtime 22-28 min wall-clock; warm 9-13 min.
- `.github/workflows/quick-check.yml`: typecheck + lint + test on PRs, sub-3-min, cancel-in-progress on new push.
- **Tauri 1 → Tauri 2 env-var deltas baked in:** `TAURI_SIGNING_PRIVATE_KEY` + `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (renamed from `TAURI_PRIVATE_KEY` / `TAURI_KEY_PASSWORD`).
- macOS notarization: deferred. Builds produce unsigned bundles; Gatekeeper will flag as "damaged" on first launch. `# TODO: notarize` in workflow comment. Acceptable risk for 6/3 if Windows is the primary demo.

Drafts at `NOTES ALL CC SESSIONS\2026-05-28_Crash-Hackathon\cicd-drafts\`.

---

## 10. Cuts & Deferrals (LOCKED)

### Cut from 6/1
| Item | Original estimate | Replacement | Saved |
|---|---|---|---|
| Marketplace install flow | 15-25h | Browse-only at 6/3 + curated install at 6/7 | 15-25h |
| `bun build --compile` sidecar | 4-8h | `node sidecar.js` shipped in `resources/` | 4-8h |
| Cross-platform `.dmg` | 8-12h | Windows-only for 6/1, conditional Mac for 6/3 | 8-12h |
| 3 polished demo fixtures | 6-9h | 1 polished + 2 stubs | 4-6h |
| Animated rune circle (custom GLSL) | 4-6h | Static + drei `<Bloom>` | 3-5h |
| Mixamo biped reskin | 15-25h | Ship Quaternius quadruped | 15-25h |
| Custom GLSL bubble shader | 4-6h | drei `transform` + Tailwind frosted-glass | 4-6h |
| `git reset --hard` undo | 4-6h | Dry-run preview toggle | 3-5h |
| **Total saved** | | | **~60-100h** |

### Adds (4-of-4 council convergence supported)
- Voice line from fox via ElevenLabs at task completion (+4h)
- Pre-cached stream-JSON fallback for 429 / network failures (+2-3h)
- `<Html occlude>` on speech bubble (+0.5h, "free")
- 60-second polished demo VIDEO as PRIMARY submission (+3-4h)
- GitHub Actions CI/CD Day 1 (+1h, mostly already drafted)
- **Total added: ~11h**

### Net effect
Original P0: ~80h. Trimmed P0 with adds: ~30-40h. Fits a 60h window with real buffer for the inevitable Tauri capability rabbit hole.

---

## 11. Risks & Mitigations

| Risk | Probability (council) | Mitigation |
|---|---|---|
| Tauri 2 capability JSON wrong → vague "not allowed" errors | High (first-timer) | Budget 6-10h for capability wiring, not 2h. Cargo rebuild every 90s; chunk in 30-min slices. |
| Sidecar stdout buffer deadlock on Windows | 65% (red-team) | Drain stderr in separate Rust task; use `kill_on_drop(true)`; line-buffered reader. |
| `bun --compile` ships broken on agent-SDK dynamic imports | 75% (red-team) | Ship `node sidecar.js`, not bun-compile. v0.2 problem. |
| Quaternius animation clip names mismatch | High (frontend) | Pre-extract: `console.log(gltf.animations.map(a => a.name))` on day 1. |
| API rate limit on stage | High (red-team) | Pre-cached fallback for the 3 fixture prompts; demo never relies on live API call. |
| macOS `.glb` 404 (asset MIME) | Medium (frontend) | Add `glb` to `tauri.conf.json` `assetProtocol.scope`. Only affects 6/3+. |
| Quaternius quadruped reads as "not Crash Bandicoot enough" | Low if framed as "cute fox companion" | Drop the "Crash Bandicoot biped" pitch; lean into "cute fox" framing. |
| Sidecar JSON event split across two reads | Medium | Accumulate buffer until newline; do not parse partial lines. |
| Event listener registered after sidecar starts → lost events | Medium | Register `listen("sidecar-event")` BEFORE `Command::sidecar().spawn()`. |
| Bundle size > 80MB ceiling | Low | Tree-shake drei imports per-component; `gltfpack` meshopt on GLB if needed. |

---

## 12. Submission Plan

- **Primary submission:** 60-second polished demo video, recorded 5/31 EOD. Hosts on GitHub + YouTube unlisted link.
- **Secondary:** live stage demo at PoC Fest (high failure-mode probability per red-team; treat as bonus).
- **Tertiary:** GitHub repo (MIT) + Twitter/X post + waitlist landing for "Crash Cloud" tier (PM-endorsed; captures non-developer email list competitors cannot reach).

---

## 13. Open Questions for User Review

1. **Demo length:** PM proposed 90 seconds; PoC Fest format may differ. Confirm?
2. **License:** MIT + public waitlist endorsed by PM. Confirm?
3. **claude.ai/design integration:** pending the unauth probe (background) + your intent clarification (study Anthropic's design language vs prompt-generate Crash mockups).
4. **Fox voice (ElevenLabs):** which voice ID? Sample lines to record: "Done. 47 files in 12 seconds." / "That was a mess." / "Anything else?" / "Working on it." / "All done!" (5-8 lines total).
5. **Workspace scope for safety:** confirm `additionalDirectories: [workspace]` where `workspace = ~/Crash-Workspace/` (a new dedicated folder) vs allowing the user to pick per-task. v0.1 should probably hard-default to `~/Crash-Workspace/`.
6. **Hackathon submission URLs + judging criteria:** still not provided. Need by 5/29 to align scope.
7. **MVP-tonight scope reconfirmation:** the smallest demoable loop (Tauri shell + R3F cube + click → bubble → hardcoded prompt → live API → render) takes ~6-8h. Confirm this is the right night-1 target given the council-revised plan above?

---

## Status

- [x] Council convergence captured
- [x] CI/CD drafts ready
- [x] Public UI references captured
- [x] Marketplace decision locked (6/3 browse-only)
- [ ] User reviews this spec
- [ ] claude.ai/design probe returns + user clarifies intent
- [ ] User answers Open Questions §13
- [ ] Invoke `superpowers:writing-plans` skill
- [ ] Scaffold repo at `C:\Users\thegr\Desktop\repos\crash\`
- [ ] CI/CD workflows dropped into `.github/workflows/`
- [ ] Smallest-MVP-tonight loop running

---

## Evidence Trail

- `council/architect-critique.md` (Backend Architect, Opus)
- `council/pm-critique.md` (Product Manager, Opus)
- `council/reality-check.md` (Reality Checker, Opus)
- `council/frontend-critique.md` (Frontend Developer, Opus)
- `council/council-report.md` (synthesizer)
- `design-refs/public-ui-references-iter1.md` (Frontend Developer, Opus)
- `design-refs/claude-ai-design-probe.md` (general-purpose, Sonnet — pending)
- `cicd-drafts/build.yml` + `quick-check.yml` + `README.md` (DevOps Automator, Opus)
- Spec author: Opus 4.7 main thread, 2026-05-28
