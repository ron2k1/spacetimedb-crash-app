# Crash -- "ABCmouse for AI" Design Spec

> Date: 2026-05-29
> Status: APPROVED (2026-05-29) -- proceeding to writing-plans. Rev 1: Windows-only; Unity 6 committed face; headless-first engine; Section 17.1 timetable + feasibility verdict. Rev 2: demo is laptop-only (cert off the critical path); added Section 22 (repo layout: frontend/backend/protocol + curriculum/installer/docs) + code-organization principles. Rev 3 (2026-05-30): multi-CLI BYO -- the engine is provider-agnostic (Claude Code OR OpenAI Codex) behind one provider interface, both demoable Monday; the renderer is a fox-navigated illustrated world whose tiles are capability dashboards (plugins / skills marketplace / skills creator / terminal chat), Monday ships the world hub + ONE live box (hybrid); the runtime target is a normal 16 GB laptop, and the ~100-agent fan-out + MCP tunnels are a build-time accelerator only, running Opus-4.8 agents on BOTH lanes (Unity frontend + TS backend) while a technical contributor works via his own Codex CLI; two-contributor parallel workflow on the frozen socket seam (new Section 23). Rev 4 (2026-05-30): build reality -- the monorepo + pnpm workspace is built and green; the 19-event `@crash/protocol` contract is frozen (`events.ts` canonical + `Protocol.cs` mirror + a drift-guard test); CI/CD is live (per-PR `quick-check`: typecheck+test on Ubuntu, `cargo test` for the Tauri shell on Windows; tag-gated `release.yml`); the provider-agnostic engine spine is proven on native Windows, including shim-aware spawning of the `claude` / `codex` npm shims; and the R3F shell has been rewired off the echo sidecar onto the real token-gated socket, rendering the rigged Khronos `Fox.glb` -- so the general engine-driven client exists today. This supersedes the Rev 1-3 "Unity 6 (primary) / R3F (insurance)" framing: both renderers are first-class socket clients, R3F is the proven-today client, and Unity is parity. (Section 3 diagram relabeled to match.) **Rev 5 (2026-05-30): DASHBOARD-WORLD PIVOT.** Voice/ElevenLabs/Whisper OUT; the free-roam world OUT; the R3F fallback as a Monday demo path OUT; the multi-lesson curriculum ladder OUT. IN: a Unity-only connected **dashboard-world** (a persistent bootstrap scene + a hub + additively-loaded dashboard scenes), **Skill Creator** as the one fully-live dashboard (the §4 loop), **Skills + Plugin marketplaces** (browse + install-by-copy over local catalogs), a live **File Activity tree+log** driven by new `file.activity` protocol-v2 events, a fake-**bandicoot-type** mascot (AI-gen + Mixamo, replacing the fox), and ONE base "set up skills + plugins" lesson pack. **Section 0 below is authoritative for Monday and supersedes any earlier section it conflicts with.**
> Supersedes: large parts of `2026-05-28-crash-3d-design.md` and `2026-05-28-crash-mvp-impl.md`
> (those remain valid background for the Tauri+R3F shell, the BYO-auth scaffolding, and Phase-0 task breakdown).
> Hackathon: PoC Fest 2026-06-01 (then 6/3, 6/7).

---

## 0. REV 5 -- Dashboard-World Pivot (2026-05-30) -- AUTHORITATIVE FOR MONDAY

This section is what the Monday build executes against. Where Rev 5 conflicts with an earlier section, **Rev 5 wins**. The fan-out agents read this section first.

### 0.1 What changed (and why)
- **Voice is OUT.** No Whisper STT, no ElevenLabs TTS, no push-to-talk. (Supersedes Section 6 entirely and every voice item in Sections 10.2 / 12 / 13 / 18.) Removes a vendor, a cold-start hang, and a live-stage failure mode; the product reads clearly without it. The mascot may still *animate* a talk/emote state -- that is animation, not audio.
- **The free-roam world is OUT.** Replaced by a **connected dashboard-world**: a small **hub** scene with **teleport portals** into discrete **dashboard** scenes. No continuous navigable terrain. (Supersedes the "illustrated world / walk-into tiles" framing in Section 3.3.)
- **No R3F fallback for Monday.** Unity 6 is THE deliverable -- not "hybrid, one live box," not "R3F insurance." (Supersedes the hybrid / break-glass framing in Sections 3.3, 16, 17.) The R3F shell stays in the repo as a dev test-harness but receives no dashboard-world work and is not a demo path.
- **Curriculum shrinks to ONE base lesson pack.** A single "set up skills + plugins" pack; everything else is user-driven. (Supersedes the 1-2 lessons + lesson-ladder framing in Section 8.)
- **Mascot replaces the fox.** A fake-**bandicoot-type** (non-IP) character: AI-generated model + Mixamo locomotion clips, NavMesh-driven movement between portals. (Supersedes the fox in Sections 1 / 3.3; reuses the glTFast import + AnimatorController infra already built on `feat/unity-fox`.)

### 0.2 The Monday product (definition of done)
A bundled Windows build that, launched on the demo laptop, opens into a 3D **hub** with the mascot and **three portals**. The judge walks the mascot to a portal; an **additive scene** loads (that load IS the teleport). The three dashboards:
1. **Skill Creator (the LIVE hero).** The full generic creation loop (Section 4) runs here against the real headless engine: name a goal -> plain-English plan -> confirm -> the engine builds + runs (local RAG / summarize) -> a **real skill file is written into the main folder** -> it appears on the shelf -> re-run. This is the moment that sells the product.
2. **Skills Marketplace.** Browse a **local catalog** of starter skills; "install" **copies** the skill folder into the main folder (a real, visible file-write the panel shows).
3. **Plugin Marketplace.** Same shape over a local plugin catalog.

A persistent **File Activity panel** (visible across all scenes) shows the **main working folder as a live tree** that highlights as files are created/edited, plus a running **activity log** ("created skills/ask-my-stuff/SKILL.md", "wrote 412 bytes"). This is the "watch the agent work cleanly" mechanic, driven by `file.activity` events (Section 0.4), NOT a renderer-side filesystem watcher -- the engine stays the single source of truth.

Depth is concentrated on **Skill Creator**; the marketplaces are real but shallow (browse + install-by-copy). Making all three equally deep is the failure mode -- do not.

### 0.3 Architecture: additive scenes (the teleport AND the parallelism unlock)
The world is NOT one scene:
- `Bootstrap.unity` -- **persistent, never unloaded**: owns `CrashWsClient` (the live socket) + the File Activity panel (UI canvas marked `DontDestroyOnLoad` or hosted in this scene). Loads first, then additively loads the hub.
- `Hub.unity` -- spawn point, mascot, three portals.
- `SkillCreator.unity`, `SkillsMarket.unity`, `PluginMarket.unity` -- one scene per dashboard.

Teleport = `SceneManager.LoadSceneAsync(target, LoadSceneMode.Additive)` + unload the previous dashboard scene. Two payoffs at once: (a) each room is an independent scene file, so different writers/agents own different rooms with **zero scene-merge conflicts** (a single `.unity` is single-writer YAML); (b) additive load/unload **is** the teleport. The socket and file panel survive every swap because they live in the never-unloaded bootstrap scene.

### 0.4 Protocol v2 -- additive `file.activity` events (contract-first; lands FIRST, blocks everything)
The frozen 19-event v1 contract stays. Rev 5 adds two events (v1->v2 bump; `events.ts` edited, `Protocol.cs` re-mirrored in the **same commit**, drift-guard test updated, one example payload committed per new event):
- **`file.activity`** (E->R): one event per workspace filesystem op the engine performs. Payload `{ op: "create" | "write" | "delete" | "mkdir", path: <workspace-relative string>, bytes?: number, seq: number }`. Paths are ALWAYS workspace-relative -- never absolute (no home-dir/user leak). **No file CONTENTS** in the event; the panel renders the tree + log purely from op/path/bytes.
- **`folder.snapshot`** (E->R, sent right after `session.ready`): the initial tree so the panel starts populated. Payload `{ entries: Array<{ path: string, kind: "file" | "dir", bytes?: number }> }`.

Both are additive (unknown events are ignored by older clients). The Section 3.1 invariants HOLD: no per-vertical event types, no per-provider branching.

### 0.5 The main working folder
The "main folder" the user watches IS the `Crash/` workspace (Section 3.4) -- specifically its visible subtree (`skills/`, `plugins/`, `docs/`). The engine already writes real skill files there; Rev 5 makes those writes VISIBLE via `file.activity`. Marketplace "install" = copy a catalog item into `skills/` or `plugins/`. Everything in the tree is a real on-disk artifact -- the transparency promise, now literally on screen.

### 0.6 Mascot pipeline (serial long-pole -- decouple from integration)
Target: a fake-bandicoot-type biped -- AI-generated (Meshy/Tripo) -> auto-rig + Mixamo idle/walk/run clips -> glTF export -> glTFast import -> AnimatorController (idle/walk/run, optional wave/emote) -> driven by a `NavMeshAgent`. **Decoupling rule (critical for the deadline):** wire the scenes, NavMesh, portals, camera, and animation **state machine against a PLACEHOLDER** (a capsule or a CC0 rig) FIRST, so the critical path never blocks on the asset; drop the final bandicoot model in once it exists. **Non-IP:** never use Activision's Crash Bandicoot character or assets -- generate an original Crash-Bandicoot-*style* mascot and carry on-screen CC-BY/CC0 attribution exactly as the fox did. If the asset pipeline hits an external login/credits wall, it is a MANUAL BLOCKER: keep the placeholder, ping, and continue everything else.

### 0.7 Scope delta vs Section 18 (authoritative)
**IN for Monday (Rev 5):** persistent bootstrap scene (socket + file panel) + hub + three additive dashboard scenes + portal teleport; **Skill Creator live** (full Section 4 loop, real skill file written); **Skills + Plugin marketplaces** (browse + install-by-copy over bundled local catalogs); the **File Activity tree+log** panel; **`file.activity` + `folder.snapshot`** protocol v2; the **mascot** (placeholder-decoupled, bandicoot-style, non-IP); ONE base "set up skills + plugins" lesson pack; a bundled **Windows** build run on the demo laptop; the workspace-jailed read-only-toward-system security posture (Section 10.1) holds.
**OUT (Rev 5):** all of Section 6 (voice / ElevenLabs / Whisper / PTT); the free-roam world; the R3F fallback as a demo path; the multi-lesson curriculum ladder; plus everything already DEFERRED in Section 18.

---

## 1. Summary

Crash is **"ABCmouse for AI"**: a guided learning platform where a non-technical person (the canonical user is a 65-year-old) learns to use AI by *building their own re-runnable skills* over the things they care about -- their documents, their tasks, their hobbies. A friendly 3D fox guides them through a short curriculum; each lesson ends with a real, saved, re-runnable skill on a "skills shelf." It is a platform, not an assistant: recurring engagement via a curriculum ladder, and long-term skill-sharing network effects.

The defining discipline is that **"general" means "do not hardcode the vertical," not "support more."** Crash is built as **one parameterized creation loop** -- point at something, the fox narrates what it will do in plain English, it builds a skill (RAG / summarize), it saves a real skill file, you re-run it -- and that loop does not care whether the input is recipes, tax PDFs, hobby research, or insurance documents. Writing the loop once is *less* engineering than building a bespoke vertical flow, so generality shrinks the build rather than growing it.

Economically, agents run **locally on the user's own Claude Code subscription (BYO)**, so token cost to the company is approximately zero and gross margin is clean. The buyer (a tech-savvy adult child) and the daily user (the elder) are different people, which shapes both onboarding and go-to-market.

**What 6/1 proves in ~90 seconds:** the fox teaches a judge to make their first AI skill -- live, on whatever the judge names -- and the judge keeps it. That single flow demonstrates the whole thesis: local RAG + voice + plain-English preview/confirm + a real saved skill file + the emotional "I made something" payoff.

---

## 2. Product framing

### 2.1 Category and thesis
- **Category:** guided AI-literacy platform ("ABCmouse for AI"). Guidance + progress + reward + scaffolding-from-zero, applied to learning AI.
- **One-sentence business thesis:** "Crash is a subscription AI-literacy platform -- the adult child pays monthly to give their parent a safe, guided way into AI; the same product expands into senior-living facilities, libraries, and AI-literacy programs as institutional seats, with a shared-skill marketplace as the long-term network effect."

### 2.2 Two actors (load-bearing for UX and GTM)
- **Setup / buyer actor:** the tech-savvy adult child. Does the one-time setup (confirm a Claude subscription exists, log in, pick the docs folder). Has money and motivation. **This is the first paying customer.**
- **Daily-use actor:** the elder. Uses a stripped, voice-first daily surface. Never sees configuration.
- Implication: two UX modes -- a one-time "set it up for someone" flow and a stripped daily surface. Buyer != user.

### 2.3 The cut-line (what keeps scope from exploding)
"ABCmouse + general + any use case" invites infinite scope. The cut-line that holds:
**one generic creation loop + one room + one or two lessons.** Every 6/1 decision serves that line. Generality lives in the *engine*; restraint lives in the *lesson count and the room count*.

---

## 3. Architecture: one engine, two faces

A renderer-agnostic **engine** sits behind a clean local socket. The fox **renderer** is a swappable client of that socket. This single seam is the most important architectural decision in the project: it de-risks the hackathon (two people build in parallel against a frozen contract) and it is the durable asset (the renderer can change without touching the engine).

```
+-------------------+        localhost socket         +--------------------------+
|   RENDERER        |  <--- JSON event protocol --->  |   ENGINE (local Node host)|
|  (the fox)        |   127.0.0.1 WS + session token   |  Claude Agent SDK runtime |
|  Unity 6 (parity) |                                  |  planner + bounded workers|
|  R3F/Tauri (live) |                                  |  local RAG (embed+index)  |
+-------------------+                                  |  skills/curriculum I/O    |
                                                       +--------------------------+
                                                                    |
                                              workspace-jailed FS writes; fixed first-party egress allowlist
                                                                    |
                                                       +--------------------------+
                                                       |  Crash/ workspace (spine)|
                                                       +--------------------------+
```

### 3.1 The socket contract (THE asset)
- **Transport:** localhost WebSocket bound to `127.0.0.1`, with a **per-session token** exchanged in the handshake. Loopback alone is necessary but not sufficient isolation -- the token prevents any other local process from driving the agent. (A named pipe is the post-hackathon hardening option.)
- **Schema ownership:** a shared `protocol/` directory in the repo is the single source of truth. `events.ts` is canonical; `Protocol.cs` is a hand-mirrored copy for the Unity client; exactly one example payload is committed per event. `request.submit` stays deliberately generic (free-text goal) -- **no per-vertical event types**, ever, or the loop stops being general. The `hello` / `session.ready` handshake carries a **`provider`** field (`"claude-code"` | `"codex"`) so the renderer can show which backend is live; the protocol is otherwise **provider-agnostic** and never branches per provider -- exactly as it never branches per vertical.

**Event set** (engine -> renderer unless marked R->E):

| Event | Dir | Purpose |
|---|---|---|
| `hello` / `version` | both | handshake + schema-version negotiation |
| `session.ready` | E->R | engine is up, token accepted |
| `request.submit` | R->E | the user's open-ended goal ("what do you want help with?") |
| `plan.proposed` | E->R | plain-English preview ("here's the skill I'll build") |
| `plan.confirm` / `plan.cancel` | R->E | user approves/declines the plan as a whole |
| `status` / `index.progress` | E->R | "reading your files...", rate-limit "doing these one at a time" |
| `step.started` / `step.progress` | E->R | execution narration |
| `confirm.required` | E->R | gate before any side-effect (write/send/spend) |
| `confirm.response` | R->E | user's answer to a confirm gate |
| `answer.partial` | E->R | streaming tokens (drives TTS) |
| `result.final` | E->R | final answer |
| `skill.save.offer` | E->R | "want me to save this?" |
| `skill.save.accept` | R->E | user accepts the save |
| `skill.saved` | E->R | a real skill file now exists on the shelf |
| `run.cancel` | R->E | the STOP button |
| `error` | E->R | failure, surfaced in-character (never a raw code) |

### 3.2 The engine
- A local Node host behind a **provider interface**: the engine speaks one internal contract, and **`ClaudeCodeProvider`** and **`CodexProvider`** are interchangeable implementations, each authenticated against the user's own subscription (BYO Claude Code OR OpenAI Codex). Both CLIs expose the same primitives the engine needs -- headless agent runs, MCP servers, skills, plugins -- so the abstraction factors out a backend rather than bridging two alien worlds. The renderer never learns which provider is underneath; provider differences are absorbed entirely here. (Adding a third provider later = one more adapter, no protocol change.)
- **Planner + shallow bounded fan-out:** a single fox-planner decomposes the goal in plain English, shows the steps, and dispatches a **bounded** set of headless workers. **No recursive self-spawning.** The planner owns every worker's lifecycle.
- **Build-time vs runtime fan-out (do not conflate).** During *development* we fan out a large pool of parallel Opus-4.8 coding agents (up to ~100) plus MCP tunnels across BOTH lanes -- agents on `frontend/unity/` (C#) and agents on `backend/` + `protocol/` (TS) -- purely to ship faster; this dev accelerator never ships. At *runtime* the product engine on the user's machine (target: a normal **16 GB** laptop) stays strictly bounded and structured-concurrent; the elder's fox never spawns 100 agents.
- **Structured concurrency is a hard requirement, not a nicety.** Even on the target **16 GB laptop**, a worker that finishes and is not torn down is leaked RAM, and the BYO plan still rate-limits under heavy parallel fan-out. Every subagent is parent-scoped and deterministically closed; visible fan-out is capped. Reuse the pattern from `github.com/ron2k1/claude-code-structured-concurrency` (parent-scoped lifecycle, kill-on-completion).
- **Job queue:** the BYO Pro/Max plan throttles under heavy parallel fan-out, so concurrency is capped and excess work is queued. The `status` event surfaces "doing these one at a time" rather than hanging.
- **Headless-first:** the engine runs as a standalone headless host; the renderer is an *optional* socket client, not a dependency. The same engine can run bounded agent sessions with no UI at all -- scripted, automated, or several concurrent sessions. This is what makes the enterprise/automation story and the multi-agent build-time orchestration (Section 17.1) real rather than aspirational: the product's brain does not require the game to be running.

### 3.3 The renderer
- **Committed 6/1 face:** **Unity 6** -- a real-time 3D game interface. The fox guides the user through a small, warm **illustrated world** (the ABCmouse-style classroom is the visual + interaction north-star): the fox moves around, and the world's **tiles are capability dashboards** you can walk into -- a **plugins** box, a **skills marketplace** box, a **skills creator** box, and a **terminal chat** box (the live creation loop). The game feel IS the product and the investor demo; this is a deliberate, committed choice, not a maybe.
- **Monday UI scope = hybrid (world hub + ONE live box).** The navigable world + fox + all tiles are visible and camera/navigation works; exactly **one** tile -- the creation-loop / terminal box -- is fully functional on stage, and the others render as charming "coming soon" states. This keeps the platform's surface area legible to a judge (you can SEE what Crash will become) without committing to build four dashboards by Monday. The single live box runs the full generic creation loop (Section 4); the ghosted tiles are the roadmap made visible.
- **Break-glass demo insurance (NOT a shipped face):** the existing Tauri + React Three Fiber shell is kept ONLY as the engine test-harness and a live-demo fallback. **Do not delete it until Unity has proven the full loop end-to-end.** Go/no-go is **Sunday night** (Section 17.1): if Unity proves the loop it is the Monday face; if it slips, demo the identical engine through R3F so the demo still happens. R3F is a safety net, not a deliverable -- the engine is renderer-agnostic precisely so this fallback costs nothing architecturally.
- **Deferred:** the Unity WebGL + companion-daemon web face is entirely out of scope until after the hackathon (two faces by 6/1 violates "do not split effort").

### 3.4 The `Crash/` workspace (the product spine)
One directory on the user's machine in their home dir:
```
Crash/
  CLAUDE.md         # instructions/memory for the headless agent
  skills/           # real CC skills, each its own subfolder with SKILL.md
  workflows/        # saved multi-step recipes
  plugins/          # MCP / plugin configs
  docs/             # the watched "drop your docs here" folder + the local RAG index
```
"Starter package to scaffold from" and "the skill the fox just saved for you" are the **same artifact** in `skills/`. A developer (or an enterprise admin) can open the folder and read exactly what their parent's Crash is doing -- this is both the transparency promise and the seed of the enterprise audit story.

---

## 4. The creation loop (the one generic thing)

This is the heart of the product. It is parameterized over the input and blind to the vertical:

1. **Point at something** -- drop files into `Crash/docs/`, or speak/type a goal.
2. **Narrate** -- the fox produces an explicit, plain-English plan ("Here's the skill I'm going to make for you: it'll read your files and answer questions about them. Make it?").
3. **Confirm** -- the user approves the plan as a whole (`plan.proposed` -> `plan.confirm`).
4. **Build + run** -- the engine executes (local RAG over the docs, or summarize), narrating via `status`/`step.*`, streaming the answer via `answer.partial`.
5. **Save** -- the fox offers to save (`skill.save.offer`); on accept, a real skill file is written to `Crash/skills/` (`skill.saved`).
6. **Re-run** -- clicking the card on the shelf replays the saved skill.

The same loop builds an "Ask My Stuff" skill or a "Summarize This" skill purely from the user's stated goal -- no branching per document type.

---

## 5. Documents and local RAG

- **Fully local embed + index:** a small on-device embedding model + a local store, with incremental indexing tuned for old CPUs. **Cloud RAG is off the table** -- it would break the privacy headline and the enterprise story.
- **One watched folder** for v1 (`Crash/docs/`), not arbitrary per-task locations. Simpler, safer, far easier to demo. Arbitrary locations come later.
- **The precise privacy promise (must not overclaim):** *"Your files are never uploaded; only the small relevant passage needed to answer your question is sent to Claude."* This is truthful -- local RAG still sends the retrieved snippet to Claude's API to generate the answer -- and it is a strong trust + enterprise line. Never say "nothing leaves your machine."

---

## 6. Voice

- **Speech in:** push-to-talk (tap the fox) + **Whisper.cpp local STT**. **Warm the model on launch** so the first transcription is not a cold-start hang.
- **Speech out:** **ElevenLabs** for the warm fox voice -- the character is the product. Ship an on-device OS-TTS "max privacy" toggle later, and use OS-TTS as a **silent fallback** so a voice-vendor hiccup never produces silence.
- **Privacy rationale:** the question's content already goes to Claude to be answered, so local STT does not shrink that boundary -- it removes a *second* vendor from the trust story. With an open-ended corpus (medical/financial/legal/personal), "even your voice stays on your machine" is more valuable, not less.
- **6/1 minimum:** PTT + Whisper + ElevenLabs. Cloud STT is the only acceptable fallback if Whisper lags on the demo hardware, and is flagged as hardening.

---

## 7. Skills and the shelf

### 7.1 One format for everything
Real Claude Code skill files on disk + a friendly shelf card (metadata pointing at the file). Starter/built-in skills use the **identical** on-disk format as user-saved skills: one format, dogfooded, portable, shareable, inspectable, planner-replayable.

### 7.2 The shelf IS the state
Because a lesson, a starter skill, and a user-made skill are the same artifact in `Crash/skills/`, **progress is a filesystem read, not a database.** Curriculum + user-generated content + progress collapse into one model. This is what makes the learning-platform features cheap to build.

### 7.3 Lesson vs skill
A **lesson** is a saved skill + a thin `lesson.json` that is **just the guided-narration script**. The "completed" state is **derived** ("did the output skill get produced?"), not a stored flag -- state lives in the filesystem.

### 7.4 The shelf UI
**One shelf, two card states:**
- Made skills = lit / full cards (the trophy case).
- Untried lessons = ghosted outline cards in the empty slots (the "what can I try next" menu).
The single shelf is both at once; the empty slots create the ABCmouse completion pull. **Do not split it** -- splitting re-introduces the two-subsystem separation that "the shelf is the state" just collapsed.

### 7.5 Sharing / versioning
**All deferred.** For 6/1, "sharing" = the file exists, is human-readable, and could be copied. Real share/import UX and versioning are post-hackathon. Constraint: the format must not *preclude* them -- a skill is a folder, so version metadata can be added later without a migration.

---

## 8. Curriculum

The starter skills package **is** the curriculum: fox-guided lessons, each producing a real skill file in the same format users create (learning-by-building).

- **6/1 ships 1-2 complete lessons:**
  - **Lesson 1 -- "Ask My Stuff"** (input-agnostic RAG over the docs folder).
  - **Lesson 2 -- "Summarize This"** (input -> distilled text, no mutation). Chosen over "Organize This" because Summarize is read-only and shows a different shape than Q&A, so the shelf reads as varied.
- **Lesson ordering axis = read-only vs side-effecting.**
  - **"Organize This" is the deliberate FIRST post-6/1 lesson.** Organize moves/renames the user's files = a write side-effect on their system, which breaks the read-only 6/1 posture and needs the deferred confirm-gate + write tools. It is the perfect bridge that introduces the side-effect/confirm machinery once the guardrails are real.
- **Generality of engine + restraint on lesson count** is the line not to cross.

---

## 9. Plan and confirm gates

- **Plan generation:** (a) an explicit **plan object** the fox renders and the user approves as a whole, then (b) friendly narration of the live stream. The plan object is the same structured thing that gets persisted as the saved skill.
- **Confirm granularity: side-effects only.** Reads / RAG / skill-building flow freely; the fox stops only before something that **writes to the system / sends / spends.** Per-step approval would make the fox exhausting and erode trust.
- **In the read-only 6/1 build, the only gate is the delightful `skill.save.offer`** -- zero scary prompts on stage.

---

## 10. Security and tool-safety model

### 10.1 6/1 posture: workspace-jailed writes only
- Read-only toward the user's **system**: the agent's tools can Write only inside the workspace, cannot run arbitrary Bash, and cannot reach the open web.
- **Two egress layers (this is what keeps the privacy promise honest -- do not conflate them):**
  - **Agent-tool egress (6/1: none).** The headless workers are given no web-fetch / arbitrary-network tool. There is no path for an agent to send data anywhere on its own.
  - **First-party app egress (a small, fixed allowlist).** The application itself makes a known set of trusted outbound calls and nothing else: the **active provider's inference API** (Claude or OpenAI/Codex -- receives only the retrieved passage plus the user's question), **ElevenLabs** (TTS -- receives the answer *text* to synthesize, never the user's voice and never their files), the **auth/OAuth endpoint** (sign-in), and the **update server** (Section 14). The "max privacy" OS-TTS toggle (Section 6) removes ElevenLabs from this list.
- One nuance on writes: the engine **does** write **inside** `Crash/` (it saves skill files to `Crash/skills/` and builds the local RAG index). So the precise posture is **"workspace-jailed writes only, zero side-effects on the user's system."**
- This keeps the installer free of scary permissions AND neutralizes prompt-injection from the user's own dropped documents: an instruction injected into a dropped file has no tool to exfiltrate through (no web-fetch) and nothing writable outside the jail to hijack.

### 10.2 Designed now, enabled post-hackathon
- Filesystem allowlist for writes.
- Denylist for destructive shell.
- Default-deny network egress (Claude API + explicitly approved MCP endpoints only).
- OS-enforced sandbox.
The write/send/spend platform vision is exactly why these tools stay locked until the sandbox is real.

### 10.3 The same system is the enterprise control plane
The consumer safety model and the enterprise audit model are **the same system seen from two ends.** The guardrails above (workspace jail / egress allowlist / sandbox) are precisely what an institutional buyer's control plane needs (admin-defined allowed skills/tools, IT-managed egress allowlists, central audit). Build once, sell twice. (See Section 15.)

---

## 11. Progress and retention

- **6/1 progress (build it):** the shelf visibly grows + **one** star/celebration per skill made, read straight off `Crash/skills/`. Polish exactly that one beat -- the card lighting up, the fox's delight, a small star. Near-free (the shelf is the state) and the emotional payoff of the whole demo. **Defer XP/levels/multi-room.**
- **Retention story (say it, do not build it for Monday):** "The curriculum is the retention engine -- like ABCmouse, there is always a next lesson, and the fox proactively proposes new skills from what is already in the user's docs folder and the day's AI news, so the shelf is never 'done.'" Lead with the curriculum ladder (you are shipping its first rungs). The proactive-suggestion loop (watch the folder -> "want me to learn to help with X?") is the credible second half -- the watched folder already exists. **Content-pull, not streaks/guilt** (streaks are the wrong instinct for elders).

---

## 12. Error handling and failure UX

**Principle:** the fox always stays in character, **never shows an error code**, and every failure is a calm spoken sentence + a retry affordance -- **never a dead end, never a hang.**

Hard-rehearse five cases on stage:
1. **No relevant results:** "I couldn't find anything about that in your files -- want to try asking differently?"
2. **API error:** calm in-character line + one-tap retry.
3. **Rate limit** (surfaced via `status` + the job queue): "I'm a little busy right now, give me a moment."
4. **Mishear:** "I didn't quite catch that -- tap me and say it again."
5. **Total connectivity loss (the real stage risk -- venue wifi dies):** worst because it manifests as a HANG. Mitigation: a **fast timeout** (not a 60-second spinner) -> "I can't reach my brain right now -- give me a moment and tap me to try again," with the recorded backup video cued.

Two extra states to get right:
- **Empty-folder** ("I don't see any files yet -- drop some in") is **distinct** from "found nothing."
- **Silent ElevenLabs -> OS-TTS fallback** so a voice-vendor hiccup never produces silence.

---

## 13. Auth and onboarding

- **BYO gate accepted -- Claude Code OR OpenAI Codex.** Crash detects which supported CLI the user already has (Claude Code or Codex), deep-links to subscribe to one if absent, then a one-button OAuth login signs in to whichever is present. **Both providers must work for the Monday demo** (the judge may bring either account); the provider interface (Section 3.2) makes this a two-adapter cost, not a fork.
- **Provider selection lives in the caregiver setup**, not the elder's daily surface -- the buyer picks/confirms the provider once during setup (the judge may bring either a Claude Code or a Codex account); the elder never sees the choice. The earlier demo-account workaround is dissolved.
- **Two-actor onboarding:** a one-time caregiver setup flow (subscribe + login + pick the docs folder), then the stripped voice-first daily surface for the elder.
- **Pre-implementation verification (OPEN):** the exact token mechanism must be verified via context7 **for BOTH providers** before any wiring -- Claude Code (setup-token / `CLAUDE_CODE_OAUTH_TOKEN` / interactive OAuth) and OpenAI Codex (its own CLI auth). Each provider adapter wires its own auth; the engine sees only "a provider is authenticated."

---

## 14. Distribution, signing, packaging

- **Bundle everything** -- Unity + the Node engine + a small Whisper model (~150 MB) + the starter curriculum -- in **one double-click installer.** No "downloading 500 MB..." first-run step (a scary hang on a caregiver's flaky home wifi, and a network dependency removed from the demo itself). Pay the size once on a known-good connection.
- **Windows-only for 6/1.** macOS is a post-hackathon target (Section 18). Ship a Windows installer and pursue an **OV Authenticode** cert (EV needs a shipped hardware token -- too slow for Monday).
- **The cert is OFF the Monday critical path -- CONFIRMED (2026-05-29).** The Monday demo runs **only on your own laptop**; it does not need to work on anyone else's machine. So Monday runs the dev-trusted (unsigned) build locally -- no SmartScreen prompt, because you are not installing a fresh unsigned `.exe` as a different user on unknown hardware. The OV cert is purely the **post-Monday** distributable story (investor follow-up, real users); order it this week for that, but it is no longer a Monday blocker.
- **Residual risk to still close (one machine is enough):** exercise the **installed** path on your laptop before the demo -- install to Program Files and launch from there, not from the dev tree -- so a bundling or hard-coded-path bug can't surprise you on stage. Cross-machine verification is a post-Monday task, not a Monday gate.
- **Auto-update invariant:** the app updates itself; the `Crash/` workspace (their skills + docs) is **never** touched by an update. Enforce by path: app binary in Program Files/Applications, workspace in the user's home dir. Updates may ADD new lesson folders to `skills/` but never modify user-created ones (lessons are identifiable by their `lesson.json`). "Updates can't eat your stuff" is both the right engineering boundary and a trust/enterprise line.

---

## 15. Business model and enterprise

- **Model = (d), sequenced, led by (a):**
  - **(a) Consumer subscription** to Crash (the world + curriculum + updates), bought by the adult child for the parent. **This is the first paying market** -- clear buyer, money + motivation, ~zero COGS (compute is BYO), clean margin.
  - **(c) Institutional seats** (senior-living facilities, libraries, AI-literacy programs) next.
  - **(b) Shared-skill marketplace** is long-term network-effect **upside, not a v1 revenue line** -- it needs sharing infra + creator critical mass. Name it; do not model it.
- **Enterprise audit -- readable folder is necessary but not sufficient.** The human-readable skill file is a genuine differentiator (most AI tools are black boxes; Crash is inspectable) and the opening line. Real institutional buyers also require the **control plane**: centralized policy (admin defines allowed skills/tools), IT-managed egress allowlists, SSO + central seat management, central audit-log export. That control plane is exactly the Section 10.2 guardrails -- already architected, just exposed to an admin. Post-v1 layer.

---

## 16. The 6/1 demo (definition of done)

**The wedge:** "the fox teaches you to make your first AI skill -- and you keep it." Generality is the on-stage flourish -- ask the judge "what do you want help with?" and take their input live. Keep ONE rehearsed concrete example loaded as the safe default in case they freeze; the machinery is generic.

**On-stage beats:** judge names a goal (or drops files) -> fox previews the plan in plain English -> builds the skill (local RAG / summarize), narrating -> answers out loud -> "want me to save this?" -> one-click skill appears on the shelf (card lights up, a star) -> click it again, it re-runs.

**Definition of done = judge-installable + polished:**
- A bundled **Windows** installer that installs and runs **on your laptop** (the demo machine), launched from the installed location, with a clean first-run sign-in to your own Claude account. Signing is post-Monday (Section 14).
- The full general wedge flawless.
- Verified by running the **installed** build (not the dev tree) on your laptop before 6/1. Cross-machine verification is post-Monday.
- A **recorded backup video** cued.

---

## 17. Hackathon execution plan (3 days, 2 people)

- **Contract-first, Day 1:** lock the socket schema + a **mock server** that replays the generic first-skill happy path (canned `plan.proposed`, a fake `answer.partial` stream, `skill.saved`).
- **Parallel split on the socket seam:**
  - **Partner:** the Unity renderer + socket integration, built against the mock.
  - **You:** the engine (planner + local RAG + skills I/O + structured concurrency) on the existing R3F/Tauri shell, built against a mock renderer.
- **Integrate last.** If Unity proves the full loop by Sunday night, it is the 6/1 face; otherwise demo via R3F and Unity becomes 6/3.
- **Order the Windows OV cert this week** (for the post-Monday signed build; per Section 14 it is *not* on the Monday critical path -- confirmed laptop-only demo).

### 17.1 Three-day timetable (Fri 2026-05-29 -> Mon 2026-06-01) + multi-agent plan

**Assumptions:** team = you + partner; demo must be ready **Sunday night** (Monday = showtime + buffer, no new features). Engine/code work fans out across multiple Claude Code CLI sessions and bounded parallel subagents; the Unity scene/feel is human creative work in the Editor that does NOT parallelize across agents. Every spawned agent is parent-scoped and torn down on completion (structured-concurrency); model routing follows the house rule (Opus for orchestration/architecture, Sonnet for synthesis/codegen).

**Where parallel agents help and where they do not** -- the load-bearing realism of this whole timetable:
- **COLLAPSES (fan out aggressively):** the engine internals -- socket server, Agent SDK wiring, local RAG (embed/index/retrieve), skills I/O + the shelf filesystem-reader, the R3F insurance renderer, and the test suites. These are independent modules behind the frozen socket contract, so roughly 2 serial days of engine work compress to about half a day of wall-clock once the protocol is frozen.
- **DOES NOT COLLAPSE (human long-poles):** the Unity room/fox/animation/game-feel, end-to-end integration debugging, voice-feel tuning, live-demo rehearsal, and the code-signing-cert clock. No number of agents shortens these.
- **The point of the parallelism** is precisely to buy the human time to make Unity good and to polish the one celebratory beat -- not to "finish everything at once."

**TODAY -- Fri 2026-05-29 -- unblock the clock + freeze the seam:**

| Owner | Task |
|---|---|
| You (now) | ORDER the Windows OV Authenticode cert -- longest external lead time (Section 14). |
| You (DONE) | Install model CONFIRMED: laptop-only demo on your own machine -> cert is OFF the critical path (Section 14). |
| You (AM) | FREEZE `protocol/events.ts` + one example payload per event + build the **mock server** (replays the happy path). Highest-leverage task -- everything parallelizes against it. |
| Agents (PM, after freeze) | Fan out: (A) socket server + Agent SDK auth wiring; (B) local RAG; (C) skills I/O + shelf reader; (D) R3F insurance renderer on the socket. |
| Partner (PM) | Start the Unity room: fox, build spot, shelf, docs drop + the socket-client skeleton. |

**SAT 2026-05-30 -- the loop works end-to-end, on R3F first (lower risk):**
- Integrate engine + RAG + skills I/O on the real socket; prove the full loop headless -> R3F: `request.submit` -> `plan.proposed` -> `plan.confirm` -> streamed RAG answer -> `skill.save` -> `skill.saved` -> shelf updates -> re-run. This is the "it works" milestone.
- Voice: Whisper.cpp local STT (warmed on launch) + ElevenLabs out (+ silent OS-TTS fallback).
- Lesson 1 "Ask My Stuff" complete; Lesson 2 "Summarize" if green.
- Unity catches up to R3F: fox in room, socket events rendering, basic shelf.

**SUN 2026-05-31 -- Unity becomes the face + harden + rehearse:**
- Unity reaches loop-parity with R3F. **GO/NO-GO (Sunday night): Unity proves the loop -> it is the Monday face; else demo on R3F.** This single gate is what makes Monday safe.
- Polish the ONE celebratory beat (card lights, star, fox delight).
- Harden the five failure paths (especially the connectivity-loss fast-timeout) + RECORD the backup video.
- Build the Windows installer (bundle Unity + Node engine + ~150 MB Whisper + starter curriculum); run it **dev-trusted on your laptop** (signing is post-Monday, Section 14).
- VERIFY the **installed** build launches from its installed path on your laptop (not the dev tree). Rehearse the live "judge names a goal" flow + the rehearsed safe-default example.

**MON 2026-06-01 -- showtime.** No new features. Final verification + rehearsal + buffer only.

**Feasibility verdict (honest):**
- **YES** -- the 6/1 DoD as scoped (one generic loop, one room, 1-2 read-only lessons, judge-installable on a controlled machine, one polished beat) is achievable in three days *if the cut-line holds and the Unity-or-R3F go/no-go is honored.* That is a winning PoC Fest demo and a strong investor hook.
- **NO** -- "enterprise-READY" (SSO + central audit export + admin policy control plane) is weeks of work, not three days. Monday delivers enterprise-**CREDIBLE**: the readable-folder + workspace-jail + headless engine that visibly make the control plane a *configuration layer*, not a rebuild.
- **PARTIAL** -- "polished UI / full game": a polished single room with a charming fox and one delightful beat is in scope; a feature-rich game is not. Polish the slice, not the surface area.
- **Cert issuance is no longer a Monday risk** -- the confirmed laptop-only demo runs dev-trusted; the OV cert is a post-Monday distributable task. The backup video remains the rehearsal safety net for any live-demo glitch.

---

## 18. Scope -- IN for 6/1 vs DEFERRED

> **Monday reality (read before the lists).** "Enterprise-ready," "investment-ready," and "fully polished" are the product's NORTH STAR, not Monday's deliverable. By Monday you build a *polished vertical slice* that proves the category + architecture and is enterprise-CREDIBLE (the readable-folder + workspace-jail + headless engine show how the enterprise control plane becomes a config layer, not a rebuild). You do NOT build the enterprise control plane, a feature-rich game, or a multi-OS signed product by Monday -- attempting all of that at once yields a broken demo. Polish the slice; tell the architecture story for the rest. The dated plan + the honest feasibility verdict are in Section 17.1.

> **REV 5 (authoritative -- read this too).** The lists below are the ORIGINAL 6/1 scope and now contain superseded items: voice, the one-live-box hybrid, the R3F fallback as a demo path, and the multi-lesson curriculum ladder are all OUT. **Section 0.7 is the authoritative Rev 5 scope.** Where 0.7 and the lists below disagree, **0.7 wins**. The dashboard-world (hub + 3 additive scenes + portal teleport), the File Activity panel, and the `file.activity`/`folder.snapshot` v2 events are IN and are NOT in the lists below -- see Section 0.

**IN (6/1):**
- One generic creation loop (build a skill from an open-ended goal).
- One cozy room with the fox.
- 1-2 read-only lessons: "Ask My Stuff" (RAG) + "Summarize This."
- Local RAG over one watched folder; the precise privacy promise.
- Voice: PTT + Whisper (warmed) + ElevenLabs (with OS-TTS silent fallback).
- The shelf (one shelf, two card states) + one celebratory beat.
- Explicit plan object + the single `skill.save.offer` gate.
- Workspace-jailed, read-only-toward-system security posture.
- Five rehearsed failure paths (incl. connectivity loss) + backup video.
- BYO OAuth onboarding; one bundled **Windows** installer (dev-trusted on your laptop for Monday; signing is post-Monday); auto-update invariant.
- **Multi-CLI BYO: Claude Code OR OpenAI Codex**, behind one provider interface; both demoable Monday.
- **The fox-navigated world UI (hybrid):** the illustrated world + fox + visible capability-dashboard tiles, with ONE live box (creation-loop / terminal) functional on stage.

**DEFERRED (post-6/1):**
- "Organize This" and all side-effecting (write/send/spend) skills + the full confirm-gate + sandbox/egress-allowlist enforcement.
- Skill sharing/import + versioning + the marketplace.
- XP/levels, multi-room, the proactive-suggestion retention loop.
- The Unity WebGL / companion-daemon web face.
- The macOS build + notarization (post-6/1 -- Windows-only for Monday).
- Arbitrary per-task document locations.
- The enterprise control plane (admin policy / SSO / central audit export).
- The full multi-dashboard surface (live plugins / skills-marketplace / skills-creator dashboards beyond the one Monday box).
- Additional CLI providers beyond Claude Code + Codex.
- Docker / developer self-host surface.

**Implementation note:** the plan derived from this spec targets ONLY the 6/1 IN-scope above, decomposed and sequenced per Section 17 (protocol + mock first, then engine and renderer in parallel against the mock). Deferred items are explicitly excluded from the first implementation plan.

---

## 19. Open questions / pre-implementation verification
1. **BYO auth token mechanism** -- verify via context7 (setup-token vs `CLAUDE_CODE_OAUTH_TOKEN` vs interactive OAuth) before wiring.
2. **Windows OV Authenticode cert** -- RESOLVED for Monday: laptop-only demo on your own machine -> cert is OFF the critical path, the dev-trusted build is fine. Order the cert this week for the post-Monday distributable only (Section 14).
3. **Small embedding model + local vector store choice** -- pick one that indexes incrementally on an old CPU; confirm bundle size budget alongside the ~150 MB Whisper model.
4. **Whisper model size** -- confirm the ~150 MB tier transcribes acceptably on the demo hardware.

---

## 20. Testing strategy
- **Socket contract:** the mock server doubles as a contract test fixture -- both clients (engine, renderer) run against the committed example payloads; a schema-version mismatch fails the handshake loudly.
- **The creation loop:** an end-to-end test that drives `request.submit` -> `skill.saved` against a fixed sample docs folder and asserts a real skill file lands in `Crash/skills/`.
- **Structured concurrency:** a test that spawns the bounded worker set and asserts every worker process is torn down on completion/cancel (no leaked PIDs) -- reuse the harness from the structured-concurrency repo.
- **Failure paths:** each of the five rehearsed failures has a forced-fault test (no-results, API error, rate-limit, mishear, connectivity loss) asserting an in-character message + a retry affordance and **no hang** (fast timeout fires).
- **Auto-update invariant:** a test that runs an update and asserts the `Crash/` workspace is byte-unchanged and user-created skills are untouched.

---

## 21. Relationship to existing code
- **Keep** the Tauri + R3F shell (engine harness + slip-insurance) until Unity proves the loop; under the target layout it relocates to `frontend/r3f-shell/` (Section 22).
- The Phase-0 echo-stub sidecar (`sidecar/echo.js`) moves into `backend/` and is replaced by the real Agent SDK engine in the first implementation step.
- **Target repo layout = Section 22.** The frontend/backend/protocol restructure is sequenced in the implementation plan, not done ad hoc.
- The earlier BYO-key/keyring design is superseded by BYO Claude-subscription OAuth (Section 13); since that auth was never built, the switch is free.
- Tauri capabilities stay at minimum; do not add `fs:scope` / `dialog:default` / `os:default` unless explicitly required by the engine wiring and approved.

---

## 22. Repository layout and code-organization principles

The GitHub repo is a **frontend / backend split** with a shared contract, structured so files stay small and an LLM (or a new contributor) can navigate by folder name alone.

```
crash/                      # repo root
  frontend/                 # the renderer(s) -- what the user sees
    unity/                  # Unity 6 project: the COMMITTED 6/1 face (room, fox, shelf)
    r3f-shell/              # Tauri + React Three Fiber: break-glass fallback + engine test-harness
  backend/                  # the headless engine -- the product's brain, no UI
    src/
      socket/               # WebSocket server: 127.0.0.1 bind, per-session-token handshake, (de)serialize
      agent/                # Claude Agent SDK host: fox-planner + bounded worker lifecycle
      rag/                  # local embed + index + retrieve over the watched docs folder
      skills/               # skills + curriculum I/O; the "shelf is the state" filesystem reader; lesson.json
      voice/                # Whisper.cpp STT wiring + ElevenLabs / OS-TTS out
      workspace/            # the Crash/ workspace jail: path enforcement + the auto-update invariant
    tests/                  # mirrors src/ one-to-one (socket/, agent/, rag/, ...)
  protocol/                 # THE shared contract. events.ts = source of truth;
                            #   Protocol.cs = hand-mirrored for Unity; examples/ = one payload per event
  curriculum/               # starter lessons bundled into the installer (SAME on-disk skill format)
    ask-my-stuff/           # Lesson 1 (RAG)
    summarize-this/         # Lesson 2 (read-only)
  installer/                # Windows packaging: bundles frontend build + backend + Whisper model + curriculum
  docs/                     # specs + plans (this file lives here)
```

- **Why frontend / backend / protocol as three top-level dirs:** the socket contract is consumed by BOTH sides, so it cannot live inside either -- it is the seam, promoted to its own dir. This is the physical expression of "the socket contract is the asset" (Section 3.1). `curriculum/`, `installer/`, and `docs/` are data / packaging / documentation, not a third code surface.
- **Repo `curriculum/` is the source; the runtime `Crash/` workspace (Section 3.4) is the destination.** The installer copies `curriculum/` into the user's `Crash/skills/` on first run. They share ONE on-disk skill format, but the repo folder is in git and the runtime workspace lives in the user's home dir and is never touched by an update.
- **Polyglot reality:** `frontend/unity/` is a C# Unity project; `backend/`, `frontend/r3f-shell/`, and `protocol/` are TypeScript. The TS side is a **pnpm workspace** (root `pnpm-workspace.yaml`) with `protocol` as a shared package both `backend` and `r3f-shell` import -- so event types are imported, never copy-pasted, on the TS side. Unity consumes the hand-mirrored `Protocol.cs` (the one unavoidable duplication, guarded by the schema-version handshake in Section 3.1).

**Code-organization principles (enforced from commit 1, not retrofitted):**
- **One concern per sub-folder, one feature per file.** A new capability is a new file in the right sub-folder, not a branch inside an existing file. Shallow, well-named folders beat deep nesting.
- **File-size discipline:** soft target ~300 LOC, soft cap 500; treat 1500 as a hard stop-and-refactor line. A file approaching the cap is the signal that a folder boundary is missing.
- **LLM-navigability is a design goal, not an afterthought:** every top-level folder gets a short `README.md` stating what it does, how to use it, and what it depends on (the same three questions Section 3 asks of every unit). Folder names describe the concern.
- **Tests mirror source** one-to-one so coverage gaps are visible by folder.
- **The contract is edited in one place:** change `protocol/events.ts`, re-mirror `Protocol.cs` in the same commit, bump the schema version. Never edit an event shape in a consumer.

---

## 23. Build velocity and the two-person workflow

### 23.1 Build-time fan-out covers BOTH lanes
The ~100-agent fan-out + MCP tunnels are a **build-time accelerator only** -- they exist to ship faster, and they parallelize across BOTH code surfaces:
- **Frontend agents (Unity / C#):** Opus-4.8 agents drive `frontend/unity/` -- `CrashWsClient.cs` (the NativeWebSocket client against the frozen protocol), the tile/box interaction logic, the camera + fox navigation controller, scene wiring via the Unity-MCP (IvanMurzak) bridge, and the shelf UI. The non-code art (fox model/rig, world illustration) is the one part agents do not produce -- it comes from asset packs / generated art / human creative.
- **Backend agents (TypeScript):** Opus-4.8 agents drive `backend/` + `protocol/` -- the socket server, the provider engine (Claude + Codex adapters), local RAG, skills I/O, structured concurrency, voice, and the test suites.
- **The seam is `protocol/`.** Both lanes consume the frozen contract; neither edits the other's code. Agents on either side build against the **mock server**, so neither blocks the other.

All build-time agents are Opus-4.8, parent-scoped, and torn down on completion -- the build pool is bounded the same way the runtime engine is.

### 23.2 The human contributor (technical, via his own Codex CLI)
The second contributor is a **technical peer**, not pinned to one lane:
- He works through **his own Codex CLI** (which has its own MCPs, skills, and plugins) -- which also dogfoods the multi-CLI thesis (Section 3.2): Crash is built using BOTH Claude Code and Codex.
- His role: **review** the agent-generated code, **debug** what the agents miss, and **implement his own ideas**. Reviewer + debugger + feature implementer across either lane.
- He works on **his own git branch** (`feat/...` / `fix/...`), opens a PR against protected `main`, and lands via green CI -- the same workflow as the agent-driven commits.

### 23.3 The unblock order (so no one waits)
1. **Phases A-D land on `main` first:** the monorepo restructure + frozen `protocol/events.ts` + `Protocol.cs` mirror + the mock server + CI. This is the foundation every parallel agent and the contributor build against.
2. **Once the foundation is on `main`,** frontend agents, backend agents, and the contributor all work in parallel against the frozen contract + mock.
3. **Integration is last** (Section 17): engine and renderer meet on the real socket once both pass the mock.

### 23.4 GitHub workflow
- **`main` is protected:** no direct pushes; every change lands via a PR with green CI.
- **Short-lived branches:** `feat/...`, `fix/...`, `chore/...`; one logical change per PR; atomic commits with vivid messages.
- **`CONTRIBUTING.md`** documents: clone, `pnpm install` at root, run the mock server, run the Unity project against it, the branch/PR convention, the "never edit an event shape in a consumer" rule (Section 22), and the Codex-CLI path so the contributor's environment is reproducible.
- **PR template** requires: what changed, which lane, how it was verified (renderer PRs: a screen capture against the mock; engine PRs: the gate output).
- **Issue labels:** `lane:frontend`, `lane:backend`, `area:protocol`, `good-first-task`, `needs-review`. The contributor pulls `needs-review` + whatever lane he wants to implement in; agents are dispatched per lane.
