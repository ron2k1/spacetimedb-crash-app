// Phase 0 stub: emits a sequence of JSONL events to simulate the agent SDK.
// Replaced by index.js in Phase 1 with the real @anthropic-ai/claude-agent-sdk loop.

const args = process.argv.slice(2);
const prompt = args.join(' ') || 'no prompt';
const taskId = `task_${Date.now()}`;

function emit(type, data) {
  process.stdout.write(JSON.stringify({ type, data }) + '\n');
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  emit('task_start', { taskId, prompt, workspace: process.cwd(), timestamp: Date.now() });
  await sleep(300);
  emit('message_delta', { taskId, text: `Echo received: "${prompt}".` });
  await sleep(400);
  emit('tool_use', { taskId, tool: 'Glob', args: { pattern: '*' }, result: 'echo: 0 files' });
  await sleep(400);
  emit('message_delta', { taskId, text: ' Phase 0 stub -- no real SDK call.' });
  await sleep(300);
  emit('task_end', { taskId, summary: 'echo complete', durationMs: 1400, filesChanged: 0 });
}

main().catch((err) => {
  emit('error', { taskId, code: 'echo_failure', retryable: false });
  process.exit(1);
});
