import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Orchestrator } from '../src/agent/orchestrator.js';
import type { AgentProvider } from '../src/agent/provider.js';
import { ensureWorkspace, resolveWorkspace } from '../src/workspace/paths.js';

function tmpWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-ws-'));
  return ensureWorkspace(resolveWorkspace(root));
}

/** Poll a predicate on the macrotask queue until it holds (or a generous deadline trips).
 *  Used instead of a single fixed tick because the creation loop now paces its steps, so
 *  the moment confirmPlan enters the provider stream is no longer a fixed delay away. */
async function waitFor(pred: () => boolean, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > deadline) throw new Error('waitFor: predicate never became true');
    await new Promise((r) => setTimeout(r, 10));
  }
}

// A provider that begins a run and then HANGS until its AbortSignal fires -- it models a
// real CLI mid-stream at the moment the renderer disconnects. We record whether the signal
// reached it so the test can prove dispose() actually tore the run down.
function hangingProvider(onAbort: () => void): AgentProvider {
  return {
    id: 'claude-code',
    isAvailable: () => Promise.resolve(true),
    async *run(input) {
      yield { kind: 'status', state: 'running', detail: 'asking' };
      await new Promise<void>((resolve) => {
        if (input.signal.aborted) return resolve();
        input.signal.addEventListener(
          'abort',
          () => {
            onAbort();
            resolve();
          },
          { once: true },
        );
      });
      // After abort we simply stop -- no 'final'. The orchestrator's post-loop guard must
      // suppress result.final / skill.save.offer once the run was disposed.
    },
  };
}

describe('Orchestrator.dispose() (renderer-disconnect teardown)', () => {
  it('aborts the in-flight run and emits no terminal frame onto the dead socket', async () => {
    const ws = tmpWorkspace();
    const emitted: { type: string; payload: Record<string, unknown> }[] = [];
    let providerAborted = false;

    const orch = new Orchestrator({
      provider: hangingProvider(() => {
        providerAborted = true;
      }),
      workspace: ws,
      emit: (type, payload) => emitted.push({ type, payload }),
    });

    // targetPath routes to the FILE-task path (plan -> confirm -> provider stream), which is what
    // this dispose test drives. The chat path's teardown is structurally identical (same post-loop
    // abort guard in runDirectChat), so testing dispose against confirmPlan covers both.
    orch.submit({ requestId: 'req_t', text: 'anything', targetPath: ws.docsDir });
    const proposed = emitted.find((e) => e.type === 'plan.proposed');
    expect(proposed).toBeTruthy();
    const planId = proposed!.payload.planId as string;

    // Kick off the run but DO NOT await -- the provider hangs until we dispose().
    const running = orch.confirmPlan(planId);
    // Wait until confirmPlan has actually entered the provider stream (its first status
    // carries detail:'asking' from hangingProvider). The creation loop now PACES the
    // st_read/st_find steps (Spec 12 rehearsal feel), so a single fixed tick no longer
    // lands inside the stream -- poll for the marker instead. This keeps the test pinned to
    // the BEHAVIOR (dispose tears down a live provider child) rather than to pacing constants.
    await waitFor(() => emitted.some((e) => e.type === 'status' && e.payload.detail === 'asking'));
    const beforeCount = emitted.length;

    orch.dispose(); // simulate the WebSocket 'close' handler firing mid-run
    await running; // confirmPlan must now unwind cleanly rather than hang forever

    expect(providerAborted).toBe(true); // the abort signal really reached the provider child
    const afterTypes = emitted.slice(beforeCount).map((e) => e.type);
    expect(afterTypes).not.toContain('result.final'); // no answer shipped after disconnect
    expect(afterTypes).not.toContain('skill.save.offer'); // no gate offered after disconnect
    expect(afterTypes).not.toContain('error'); // dispose() is silent -- the socket is gone

    fs.rmSync(ws.root, { recursive: true, force: true });
  });
});
