# Crash -- Contributor Onboarding (OpenAI Codex CLI)

> Paste the block in "## The paste-ready prompt" into your Codex CLI as your first
> message. It is self-contained: it tells you what Crash is, what to build, and the rules.
> Authored by the lead (Claude Code) for the second contributor working via Codex.

## The paste-ready prompt

You are joining an open-source project called **Crash** as a technical contributor. You work
through your own **OpenAI Codex CLI**, authenticated against your own OpenAI/Codex
subscription. Your teammate (the lead) works through Claude Code. Read this whole message,
then start.

### What Crash is
Crash is a desktop **agent marketplace** with a built-in, provider-agnostic agent engine: a
user brings their own Claude Code or Codex login, asks Crash to do something, and a headless
engine drives the CLI while a 3D guide narrates -- and the marketplace lets agents and people
buy, sell, and bid on agents and skills, with a real x402 micropayment rail. It runs on the
user's own machine.

### The one architectural idea you most need to understand: the provider interface
Crash is **provider-agnostic**. The engine speaks ONE internal contract, and the actual AI
CLI underneath is swappable:
- `ClaudeCodeProvider` -- drives Claude Code (the lead owns this)
- `CodexProvider` -- drives OpenAI Codex (this is YOURS)

A user brings their OWN subscription: Claude Code OR OpenAI Codex. Both must be demoable.
This works because both CLIs expose the same four primitives the engine needs:
1. **Headless agent runs** -- run a prompt non-interactively and stream back results
2. **MCP servers** -- register Model Context Protocol tool servers
3. **Skills** -- save/load reusable skill definitions
4. **Plugins** -- extend the CLI

Adding a provider = writing one adapter that maps those four primitives onto a CLI. It
must NOT require any change to the wire protocol or the renderer. The renderer (the fox UI)
never learns which provider is underneath.

### Your repo + branch
1. Clone: `git clone https://github.com/ron2k1/crash-app.git`
2. Create your branch: `git checkout -b feat/codex-provider-research`
3. You have collaborator access. Work ONLY on your branch. Open a PR against `main`; never
   push to `main` directly.

### Read these first (in the repo)
- `docs/superpowers/specs/2026-05-29-crash-abcmouse-for-ai-design.md` -- the approved design
  spec (Rev 3). Focus on: Section 3.1 (the frozen socket event set), 3.2 (the provider
  interface + build-vs-runtime fan-out), 13 (BYO gate: Claude Code OR Codex), 18 (v0.1
  scope), 23 (the two-person workflow -- this section is about you).
- `docs/superpowers/plans/2026-05-29-crash-monorepo-and-protocol.md` -- the foundation plan
  the lead is executing now (monorepo + the frozen `protocol/` contract).

### Your tasks (research + docs only for now -- do NOT implement the engine yet)
The foundation (monorepo restructure + frozen protocol) is being built by the lead right
now. Your job is to **de-risk `CodexProvider`** so that when the engine plan (Plan 2)
starts, the Codex adapter is already designed. Three tasks, all output to `docs/research/`:

**Task 1 -- Onboard + prove headless Codex works.**
Confirm your Codex CLI runs a single prompt non-interactively (headless / one-shot mode)
and returns output you can capture programmatically. Write `docs/research/codex-provider.md`
with a "Headless run" section: the exact command/flags, how output is streamed, how you
capture it from a parent process.

**Task 2 -- CodexProvider capability spike.**
In the same doc, document -- with exact commands / config-file paths / citations to Codex
docs -- how Codex CLI does each of the four primitives:
- headless agent runs (single-shot + streaming)
- MCP server registration (where is the config? what format?)
- skills (does Codex have a skills concept? how are they defined/loaded?)
- plugins (extension mechanism?)
Plus **auth**: how does a user authenticate Codex against their own subscription
(interactive login? API key? token env var?), and where does the credential live? (We store
BYO tokens in the OS keychain -- never in committed files, env vars in git, or logs.)

**Task 3 -- Provider-interface contract, Codex side.**
Propose the TypeScript interface `CodexProvider` will implement. The engine will call
something like `provider.run(prompt, { mcpServers, skills, signal })` and consume a
normalized event stream. For EACH method you propose, map it to the concrete Codex CLI
mechanism from Task 2. Output to `docs/research/provider-interface-codex.md`. This becomes
the input to Plan 2's provider abstraction. (The lead is writing the Claude-Code side of the
same interface; the two will be reconciled into one shared interface.)

### Hard rules
- **Never edit `protocol/events.ts`, any event shape, or `protocol/Protocol.cs`.** That
  contract is FROZEN -- the engine and both renderers depend on it. If you believe the
  contract is missing something for Codex, write it in your PR description as a proposal; do
  not change the file.
- **Don't restructure the repo.** The lead is moving `src/` -> `frontend/r3f-shell/`, adding
  `backend/` + `protocol/`, etc. Your work is docs-only under `docs/research/`, unaffected by
  that move. Before opening your PR, run `git pull --rebase origin main` to pick up the
  restructure.
- **Atomic commits, vivid messages** (conventional commits: `docs(research): ...`). One
  logical change per commit.
- **Security:** BYO auth tokens -> OS keychain only. Error paths surface a code, never a
  message/stack/prompt/credential. Don't paste secrets into docs or commits.
- **When in doubt, open a draft PR early** and tag the lead for review rather than building
  a lot in the dark.

### What "done" looks like for this first pass
A PR against `main` adding `docs/research/codex-provider.md` (Tasks 1-2) and
`docs/research/provider-interface-codex.md` (Task 3), with a PR description summarizing: can
Codex run headless? does it have MCP/skills/plugins? what is the auth story? and your
proposed CodexProvider interface. That single PR unblocks the Codex adapter in Plan 2.

Start with Task 1. Go.
