#!/usr/bin/env node
// Headless full-loop harness — NO socket, NO UI. Proves "a terminal spawned headlessly"
// runs the entire creation loop and prints every protocol event:
//   node dist/cli.js --provider claude-code --workspace ~/Crash "summarize my notes"
// It auto-confirms the plan and auto-accepts the save, exactly as a renderer would.
import { resolveProvider } from './agent/detect.js';
import { Orchestrator } from './agent/orchestrator.js';
import { ensureWorkspace, resolveWorkspace } from './workspace/paths.js';
import type { Provider as ProviderId } from '@crash/protocol';

function takeFlag(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i >= 0 && i + 1 < args.length) {
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  }
  return undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const prefer = takeFlag(args, '--provider') as ProviderId | undefined;
  const workspaceDir = takeFlag(args, '--workspace');
  const offlineIdx = args.indexOf('--offline');
  const forceOffline = offlineIdx >= 0 || process.env.CRASH_PROVIDER === 'offline';
  if (offlineIdx >= 0) args.splice(offlineIdx, 1);
  const goal = args.join(' ').trim() || 'Summarize what is in my files';

  const provider = await resolveProvider({ prefer, allowOffline: true, forceOffline });
  const workspace = ensureWorkspace(resolveWorkspace(workspaceDir));
  const requestId = `req_${Date.now()}`;

  let resolveDone: () => void;
  const done = new Promise<void>((r) => {
    resolveDone = r;
  });

  const orch = new Orchestrator({
    provider,
    workspace,
    emit: (type, payload) => {
      process.stdout.write(JSON.stringify({ type, ...payload }) + '\n');
      if (type === 'plan.proposed') void orch.confirmPlan(payload.planId as string);
      else if (type === 'skill.save.offer') orch.acceptSkillSave(requestId, payload.suggestedName as string);
      else if (type === 'skill.saved') resolveDone();
      else if (type === 'error') resolveDone();
    },
  });

  process.stderr.write(`# crash engine: provider=${provider.id} workspace=${workspace.root}\n`);
  orch.submit({ requestId, text: goal });

  await Promise.race([done, new Promise<void>((r) => setTimeout(r, 30000))]);
}

main().catch(() => process.exit(1));
