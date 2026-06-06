# CodexProvider interface proposal

Date: 2026-05-30
Status: proposal for Plan 2 provider abstraction reconciliation

This proposes the Codex side of Crash's provider interface. It intentionally does not modify `src/types/sidecar-events.ts` or any future frozen protocol files. Codex-native events should be normalized inside the provider/engine boundary before the renderer sees them.

## Design goals

- Keep the renderer provider-agnostic.
- Treat Codex CLI as the auth and execution boundary.
- Stream progress as normalized provider events, then map those into Crash's frozen sidecar event union.
- Avoid mutating global user config during normal runs.
- Keep BYO secrets in OS keychain or Codex's own auth store; never in committed files, command args, renderer events, or raw logs.

## Proposed TypeScript contract

```ts
export type ProviderKind = "codex" | "claude-code";

export type ProviderCapability =
  | "headlessRun"
  | "jsonEventStream"
  | "mcpServers"
  | "skills"
  | "plugins"
  | "byoAuth";

export type ProviderErrorCode =
  | "provider_not_installed"
  | "provider_auth_required"
  | "provider_config_invalid"
  | "provider_mcp_auth_required"
  | "provider_run_failed"
  | "provider_cancelled";

export interface ProviderStatus {
  kind: ProviderKind;
  installed: boolean;
  authenticated: boolean;
  version?: string;
  authMode?: "chatgpt" | "api-key" | "access-token" | "unknown";
  capabilities: ProviderCapability[];
}

export interface ProviderMcpServer {
  name: string;
  transport:
    | {
        type: "stdio";
        command: string;
        args?: string[];
        env?: Record<string, string>;
        envVars?: string[];
        cwd?: string;
      }
    | {
        type: "streamable-http";
        url: string;
        bearerTokenEnvVar?: string;
        httpHeaders?: Record<string, string>;
        envHttpHeaders?: Record<string, string>;
      };
  required?: boolean;
  enabledTools?: string[];
  disabledTools?: string[];
}

export interface ProviderSkill {
  name: string;
  description: string;
  markdown: string;
}

export interface ProviderPlugin {
  name: string;
  marketplace?: string;
  required?: boolean;
}

export interface ProviderRunOptions {
  taskId: string;
  workspacePath: string;
  mcpServers?: ProviderMcpServer[];
  skills?: ProviderSkill[];
  plugins?: ProviderPlugin[];
  sandbox?: "read-only" | "workspace-write";
  signal?: AbortSignal;
}

export type ProviderEvent =
  | { type: "run_started"; taskId: string; provider: ProviderKind }
  | { type: "assistant_delta"; taskId: string; text: string }
  | { type: "tool_started"; taskId: string; tool: string; args?: unknown }
  | { type: "tool_completed"; taskId: string; tool: string; result?: string }
  | { type: "file_changed"; taskId: string; path: string; op: "create" | "move" | "edit" | "delete" }
  | { type: "run_completed"; taskId: string; summary: string; durationMs: number; filesChanged: number }
  | { type: "run_failed"; taskId: string; code: ProviderErrorCode; retryable: boolean };

export interface AgentProvider {
  readonly kind: ProviderKind;
  status(): Promise<ProviderStatus>;
  prepareRun(options: ProviderRunOptions): Promise<void>;
  run(prompt: string, options: ProviderRunOptions): AsyncIterable<ProviderEvent>;
  cancel(taskId: string): Promise<void>;
}
```

## CodexProvider method mapping

### `status()`

Maps to:

```powershell
codex --version
codex login status
codex mcp list --json
codex plugin marketplace list
```

Behavior:

- `codex --version` proves the CLI is installed and captures the version.
- `codex login status` exits successfully when credentials exist and prints the active auth mode.
- Do not inspect `~/.codex/auth.json`.
- Return `provider_auth_required` if the CLI is installed but not logged in.

### `prepareRun(options)`

Maps to local filesystem setup plus optional Codex config inputs.

Skills:

- Create or update Crash-owned skill folders under the run workspace:

```text
<workspacePath>/.agents/skills/<skill-name>/SKILL.md
```

- The generated `SKILL.md` uses the `name` and `description` from `ProviderSkill`.
- Future prompts should explicitly invoke generated skills by name, e.g. `$downloads-cleanup`.

MCP:

- Preferred v0.1 path: pass MCP definitions as per-run `-c` config overrides to avoid editing user config.
- Alternate path: write a Crash-owned `.codex/config.toml` under a trusted Crash workspace.
- Avoid writing to global `~/.codex/config.toml` unless the user explicitly opts into persistent setup.

Plugins:

- Treat plugins as setup-time dependencies. If `options.plugins` contains required plugins, check for installation and return `provider_config_invalid` with a setup action rather than installing silently.
- If plugin installation is later allowed, use:

```powershell
codex plugin marketplace add <source>
codex plugin add <plugin>@<marketplace>
```

### `run(prompt, options)`

Maps to:

```powershell
codex exec --json --ephemeral --sandbox <mode> -C <workspacePath> <prompt>
```

Recommended argument construction:

```ts
const args = [
  "exec",
  "--json",
  "--ephemeral",
  "--sandbox",
  options.sandbox ?? "workspace-write",
  "-C",
  options.workspacePath,
  ...toCodexConfigOverrides(options.mcpServers ?? []),
  buildPrompt(prompt, options.skills ?? []),
];
```

Where `toCodexConfigOverrides` emits repeated `-c key=value` argument pairs. When using `spawn` without a shell, pass these as separate argv entries:

```ts
[
  "-c",
  'mcp_servers.context7.command="npx"',
  "-c",
  'mcp_servers.context7.args=["-y","@upstash/context7-mcp"]',
]
```

Use `spawn("codex", args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true })`.

Abort handling:

- Wire `AbortSignal` to `child.kill()`.
- On cancellation, emit `run_failed` with `provider_cancelled` and `retryable: false`.

stderr handling:

- Drain continuously.
- Redact before logging.
- Never forward raw stderr, prompts, stacks, command lines containing secrets, or credentials to the renderer.

### `cancel(taskId)`

Maps to killing the tracked child process for that task.

Implementation note:

- Keep an in-memory `Map<string, ChildProcess>`.
- If no process exists, no-op.
- Prefer graceful termination first; hard-kill after a short timeout if needed.

## Codex JSONL to ProviderEvent mapping

Observed/official Codex JSONL event types include `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.*`, and `error`.

Proposed mapping:

| Codex JSONL | ProviderEvent | Notes |
| --- | --- | --- |
| `thread.started` or first `turn.started` | `run_started` | Emit once per Crash task. |
| `item.completed` with `item.type = "agent_message"` | `assistant_delta` | Codex may emit whole messages rather than token deltas; provider can forward complete text as a delta. |
| `item.started` with command/MCP/tool item | `tool_started` | Normalize tool name and args if present. |
| `item.completed` with command/MCP/tool item | `tool_completed` | Summarize result. Do not leak raw stdout if it may include secrets. |
| file-change item, if emitted | `file_changed` | Map Codex file operation to `create`, `move`, `edit`, or `delete`. |
| `turn.completed` | `run_completed` | Summary comes from final agent message or a provider-generated fallback summary. |
| `turn.failed` or `error` | `run_failed` | Convert to stable provider error code. |

The provider should track `filesChanged` by counting normalized `file_changed` events.

## ProviderEvent to Crash sidecar event mapping

Crash's current frozen renderer-facing event union:

```ts
export type SidecarEvent =
  | { type: "task_start"; data: { taskId: string; prompt: string; workspace: string; timestamp: number } }
  | { type: "tool_use"; data: { taskId: string; tool: string; args: unknown; result: string } }
  | { type: "file_change"; data: { taskId: string; path: string; op: "create" | "move" | "edit" | "delete" } }
  | { type: "message_delta"; data: { taskId: string; text: string } }
  | { type: "task_end"; data: { taskId: string; summary: string; durationMs: number; filesChanged: number } }
  | { type: "error"; data: { taskId: string; code: string; retryable: boolean } };
```

Mapping:

| ProviderEvent | Crash event |
| --- | --- |
| `run_started` | `task_start` |
| `assistant_delta` | `message_delta` |
| `tool_completed` | `tool_use` |
| `file_changed` | `file_change` |
| `run_completed` | `task_end` |
| `run_failed` | `error` |

For `tool_started`, either hold it until `tool_completed` or emit a `tool_use` with `result: "started"` only if the renderer can tolerate that. Prefer holding it to avoid inventing new protocol shapes.

## Auth policy for Crash

Recommended v0.1 flow:

1. On provider selection, run `codex --version`.
2. Run `codex login status`.
3. If authenticated, proceed.
4. If not authenticated, surface `provider_auth_required` and show setup instructions for `codex login`.

Optional brokered flow:

1. Store the user's API key/access token in OS keychain.
2. Pipe it over stdin to `codex login --with-api-key` or `codex login --with-access-token`.
3. Immediately clear in-memory references.
4. Re-run `codex login status`.

Never pass secrets through command-line args; process lists and logs can expose them.

## Implementation sketch

```ts
export class CodexProvider implements AgentProvider {
  readonly kind = "codex" as const;
  private children = new Map<string, ChildProcess>();

  async status(): Promise<ProviderStatus> {
    // codex --version; codex login status
  }

  async prepareRun(options: ProviderRunOptions): Promise<void> {
    // Materialize .agents/skills and validate plugin/setup requirements.
  }

  async *run(prompt: string, options: ProviderRunOptions): AsyncIterable<ProviderEvent> {
    // Spawn codex exec --json, parse stdout JSONL, yield normalized events.
  }

  async cancel(taskId: string): Promise<void> {
    this.children.get(taskId)?.kill();
  }
}
```

## Risks and recommendations

- `codex exec --json` is suitable for provider streaming, but event payload details should be locked by tests against real local runs before Plan 2 ships.
- Do not depend on local auth file paths. Use `codex login status`.
- Per-run MCP config via `-c` needs a Windows quoting test with stdio and HTTP examples.
- Skills are straightforward for workspace-scoped workflows; plugins should be explicit setup-time installs.
- Keep raw Codex stderr out of renderer events. Diagnostics should be redacted and attached only to developer logs.
