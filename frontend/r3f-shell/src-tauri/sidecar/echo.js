// crash/src-tauri/sidecar/echo.js
// Phase 0 mock sidecar. Emits 5 paced JSONL events so the user sees them
// stream into the TaskPane in real time instead of arriving as a single batch.
//
// Contract:
//   stdin  : none.
//   argv[2]: user prompt string (Tauri's tauri_plugin_shell.command("node")
//            .args(["sidecar/echo.js", &prompt]) places the prompt at argv[2]).
//   stdout : one SidecarEvent per line, newline-terminated. Shape defined in
//            src/types/sidecar-events.ts.
//   stderr : human-readable, non-JSON. Forwarded by Rust as eprintln only.
//
// Phase 1 replaces this stub with @anthropic-ai/claude-agent-sdk integration.
// At that point: emit task_start, then stream sdk events through a translator,
// then task_end. Same wire shape -- frontend won't notice the swap.

const prompt = process.argv[2] || '';
const taskId = `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const startedAt = Date.now();

function emit(event) {
  process.stdout.write(JSON.stringify(event) + '\n');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  emit({
    type: 'task_start',
    data: {
      taskId,
      prompt,
      workspace: process.cwd(),
      timestamp: startedAt,
    },
  });

  await sleep(300);

  emit({
    type: 'tool_use',
    data: {
      taskId,
      tool: 'read_file',
      args: { path: 'README.md' },
      result: 'ok',
    },
  });

  await sleep(400);

  emit({
    type: 'file_change',
    data: {
      taskId,
      path: 'demo-output.txt',
      op: 'create',
    },
  });

  await sleep(400);

  emit({
    type: 'message_delta',
    data: {
      taskId,
      text: `echo: ${prompt}`,
    },
  });

  await sleep(300);

  emit({
    type: 'task_end',
    data: {
      taskId,
      summary: 'demo complete',
      durationMs: Date.now() - startedAt,
      filesChanged: 1,
    },
  });
}

main().catch((err) => {
  // Per THREAT-G: log err.code only, never err.message or raw payloads.
  const code = err && typeof err.code === 'string' ? err.code : 'UNKNOWN';
  emit({
    type: 'error',
    data: { taskId, code, retryable: false },
  });
  process.stderr.write(`[echo.js] fatal: ${code}\n`);
  process.exit(1);
});
