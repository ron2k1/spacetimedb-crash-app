# CodexProvider research

Date: 2026-05-30
Local probe: Windows 11, PowerShell, `codex-cli 0.135.0`

This note de-risks an OpenAI Codex-backed provider for Crash. It is docs-only research: no protocol, renderer, sidecar, or engine files were changed.

Repository note: the onboarding prompt referenced `docs/superpowers/specs/2026-05-29-crash-abcmouse-for-ai-design.md` and `docs/superpowers/plans/2026-05-29-crash-monorepo-and-protocol.md`; those files were not present on `main` at clone time. This research uses the current README, the 2026-05-28 spec/plan, and the existing sidecar event union as local context.

## Sources

Primary sources used:

- [Codex CLI overview](https://developers.openai.com/codex/cli)
- [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive)
- [Codex command line options](https://developers.openai.com/codex/cli/reference)
- [Codex config basics](https://developers.openai.com/codex/config-basic)
- [Codex configuration reference](https://developers.openai.com/codex/config-reference)
- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Codex authentication](https://developers.openai.com/codex/auth)
- [Codex agent skills](https://developers.openai.com/codex/skills)
- [Codex plugins](https://developers.openai.com/codex/plugins)
- [Build Codex plugins](https://developers.openai.com/codex/plugins/build)

Local observations are marked as observations and should be re-run on the contributor's machine before implementation.

## Summary

Codex can run headlessly today via `codex exec`. The CLI supports machine-readable JSONL with `--json`, so a parent process can stream and normalize events without scraping terminal UI text. Codex also has first-class MCP, skills, plugins, and BYO auth support.

The most important implementation wrinkle: Codex does not emit Crash's sidecar protocol directly. `CodexProvider` should translate Codex JSONL events into Crash's frozen sidecar event set (`task_start`, `tool_use`, `file_change`, `message_delta`, `task_end`, `error`). The renderer should never see Codex-native event names.

## Task 1: Headless run

Official behavior: non-interactive mode is `codex exec`. OpenAI documents it for scripts and CI, with final-message stdout by default and progress on stderr. With `--json`, stdout becomes a JSON Lines stream containing events such as `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.*`, and `error`.

Minimal command:

```powershell
codex exec --ephemeral --sandbox read-only "Reply with exactly HEADLESS_OK. Do not run shell commands or modify files."
```

Machine-readable command:

```powershell
codex exec --json --ephemeral --sandbox read-only "Reply with exactly HEADLESS_OK. Do not run shell commands or modify files."
```

Observed stdout from the JSONL probe:

```jsonl
{"type":"thread.started","thread_id":"019e778f-f5cd-7f40-bdf2-0d77c3d5293e"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"HEADLESS_CAPTURE_OK"}}
{"type":"turn.completed","usage":{"input_tokens":13056,"cached_input_tokens":3456,"output_tokens":26,"reasoning_output_tokens":16}}
```

Observed stderr contained startup/progress warnings, including PowerShell shell-snapshot warnings. Treat stderr as diagnostics only; do not parse it as provider state. In Node, use `child_process.spawn`, parse `stdout` line-by-line, and drain `stderr` continuously to avoid deadlocks.

Example parent-process capture:

```ts
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const child = spawn(
  "codex",
  [
    "exec",
    "--json",
    "--ephemeral",
    "--sandbox",
    "workspace-write",
    "-C",
    workspacePath,
    prompt,
  ],
  {
    cwd: workspacePath,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);

const stdout = createInterface({ input: child.stdout });
stdout.on("line", (line) => {
  const event = JSON.parse(line);
  // Translate Codex event into Crash sidecar event here.
});

child.stderr.on("data", (chunk) => {
  // Log redacted diagnostics only; never forward raw stderr to the renderer.
});
```

For CI-style output, `--output-last-message <file>` can save the final natural-language agent message while `--json` remains available for event streaming.

## Task 2: Capability spike

### 1. Headless agent runs

Mechanism: `codex exec`.

Useful flags:

- `--json`: stream machine-readable JSONL events on stdout.
- `--ephemeral`: avoid writing session rollout files for disposable runs.
- `--sandbox read-only|workspace-write|danger-full-access`: choose filesystem permissions.
- `--ignore-user-config`: skip `$CODEX_HOME/config.toml` for controlled automation. Auth still uses `CODEX_HOME`.
- `--ignore-rules`: skip user/project execpolicy rules.
- `-C, --cd <DIR>`: set working root.
- `-c, --config <key=value>`: apply per-run TOML config overrides.
- `-o, --output-last-message <FILE>`: save the final agent message.

Recommended Crash default for demo:

```powershell
codex exec --json --ephemeral --sandbox workspace-write -C "$env:USERPROFILE\Crash-Workspace" "<prompt>"
```

Use `read-only` for classification/explanation tasks and `workspace-write` for skill-building tasks that need to create files under the Crash workspace. Avoid `danger-full-access` for normal Crash runs.

### 2. MCP server registration

Codex supports MCP servers in CLI and IDE. Supported transports include stdio local processes and streamable HTTP servers. Config lives alongside normal Codex settings.

User-level config:

```text
~/.codex/config.toml
```

Project-scoped config:

```text
.codex/config.toml
```

Project config only loads for trusted projects. The CLI and IDE extension share these config layers.

CLI registration:

```powershell
codex mcp add context7 -- npx -y @upstash/context7-mcp
codex mcp add figma --url https://mcp.figma.com/mcp --bearer-token-env-var FIGMA_OAUTH_TOKEN
codex mcp list --json
codex mcp get context7 --json
codex mcp remove context7
```

Config shape for stdio:

```toml
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
env_vars = ["LOCAL_TOKEN"]

[mcp_servers.context7.env]
MY_ENV_VAR = "MY_ENV_VALUE"
```

Config shape for streamable HTTP:

```toml
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
bearer_token_env_var = "FIGMA_OAUTH_TOKEN"
```

Provider implication: avoid mutating the user's global `~/.codex/config.toml` during normal Crash tasks. Prefer either per-run `-c mcp_servers.<name>...` overrides or a Crash-owned, trusted project/workspace config. If an MCP server needs OAuth, hand off to `codex mcp login <server-name>` and surface only a high-level auth-required code in Crash.

### 3. Skills

Codex has a first-class "Agent Skills" concept. A skill is a directory containing `SKILL.md` plus optional scripts, references, assets, and agents metadata. `SKILL.md` must include `name` and `description` frontmatter.

Minimal skill:

```text
.agents/skills/downloads-cleanup/SKILL.md
```

```markdown
---
name: downloads-cleanup
description: Build or run a safe workflow for organizing a user's downloads folder.
---

Follow the Crash downloads-cleanup workflow...
```

Codex can activate skills explicitly through `$skill-name` or implicitly when the prompt matches the skill description. The CLI/IDE can also use `/skills` interactively. Codex scans repository, user, admin, and system locations:

- Repo/local: `$CWD/.agents/skills`, parents up to repo root, and `$REPO_ROOT/.agents/skills`
- User: `$HOME/.agents/skills`
- Admin: `/etc/codex/skills`
- System: bundled OpenAI skills

Provider implication: Crash can materialize generated skills into the Crash workspace under `.agents/skills/<skill-name>/SKILL.md`, then invoke them explicitly in future prompts with `$skill-name`. For shareable workflows, package skills as plugins instead of relying on local folders.

### 4. Plugins

Codex plugins bundle reusable workflows with skills, app integrations, and MCP servers. The CLI exposes an interactive plugin browser through `/plugins`. The non-interactive subcommands observed locally are:

```powershell
codex plugin list
codex plugin add sample@debug
codex plugin marketplace add ./path/to/marketplace
codex plugin marketplace list
codex plugin marketplace upgrade
codex plugin marketplace remove <marketplace>
```

Plugin authoring uses a required manifest:

```text
my-plugin/.codex-plugin/plugin.json
```

Minimal manifest:

```json
{
  "name": "my-first-plugin",
  "version": "1.0.0",
  "description": "Reusable greeting workflow",
  "skills": "./skills/"
}
```

Repo-scoped local marketplaces can live at:

```text
$REPO_ROOT/.agents/plugins/marketplace.json
```

User-scoped marketplaces can live at:

```text
~/.agents/plugins/marketplace.json
```

Provider implication: plugins are better treated as install/setup-time dependencies, not per-run payloads. For the v0.1 demo, use repo/workspace skills directly unless the demo specifically needs a bundled MCP/app integration. If Crash ever installs plugins for the user, it should present an explicit consent step because plugins can add MCP surface area and external-app auth flows.

### 5. Auth

Codex supports two OpenAI sign-in paths for CLI/IDE:

- ChatGPT sign-in for subscription access.
- API key sign-in for usage-based access.

First run prompts the user to sign in. The CLI can also read credentials from stdin:

```powershell
codex login
codex login --device-auth
$env:CODEX_ACCESS_TOKEN | codex login --with-access-token
$env:OPENAI_API_KEY | codex login --with-api-key
codex login status
codex logout
```

Local observation:

```text
codex login status
Logged in using ChatGPT
```

Local observation from `codex doctor --json` on `codex-cli 0.135.0`: credentials are stored in Codex's local auth store under `CODEX_HOME` (`auth storage mode: File`, auth file reported as `~/.codex/auth.json`). Do not read or copy this file. Crash should treat the installed Codex CLI as the auth boundary and check readiness with `codex login status`.

Crash security recommendation:

- BYO user secret belongs in the OS keychain, not in committed files, env vars, or logs.
- Prefer "user already authenticated with Codex" for v0.1: run `codex login status`, and if not logged in, ask the user to run `codex login` in a terminal or launch an explicit setup flow.
- If Crash must broker API-key login, read the key from OS keychain at setup time, pipe it to `codex login --with-api-key` over stdin, then discard the in-memory value. Never pass secrets as command-line args.
- Redact stderr and failures. Surface Crash error codes such as `codex_auth_required`, `codex_mcp_auth_required`, or `codex_run_failed`, not raw stacks or prompts.

## Capability matrix

| Primitive | Codex support | Concrete mechanism | Notes |
| --- | --- | --- | --- |
| Headless runs | Yes | `codex exec`, `--json` for JSONL | Local probe succeeded. Translate Codex events to Crash events. |
| Streaming | Yes | stdout JSONL under `--json`; stderr diagnostics | Parse stdout by line; drain stderr separately. |
| MCP servers | Yes | `codex mcp ...`; `[mcp_servers.<name>]` in `config.toml` | Prefer per-run overrides or Crash-owned config over global mutation. |
| Skills | Yes | `.agents/skills/<name>/SKILL.md`; `$skill-name` invocation | Materialize generated Crash skills into workspace and invoke explicitly. |
| Plugins | Yes | `/plugins`; `codex plugin ...`; `.codex-plugin/plugin.json` | Setup-time/install-time, not ideal as per-run payload. |
| Auth | Yes | `codex login`; ChatGPT, API key, access token stdin | Check via `codex login status`; do not inspect auth files. |

## Open questions for Plan 2

- Should Crash use the user's normal Codex home or launch with a Crash-specific `CODEX_HOME`? A separate home isolates config but also requires a separate login flow.
- Should MCP server definitions be passed with repeated `-c` overrides or written to a Crash-owned `.codex/config.toml` in a trusted workspace?
- Does the engine need plugin installation in v0.1, or can skills cover the v0.1 provider-agnostic demo?
- What is the shared normalized event envelope before conversion into the frozen Crash renderer events?
