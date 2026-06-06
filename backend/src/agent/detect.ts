// Provider selection. Prefers the caregiver-chosen provider, falls back to the other,
// and (when allowed) to the offline DeterministicProvider so the loop always runs.
import type { Provider as ProviderId } from '@crash/protocol';
import type { AgentProvider } from './provider.js';
import { ClaudeCodeProvider } from './claude-code.js';
import { CodexProvider } from './codex.js';
import { DeterministicProvider } from './deterministic.js';

export function makeProvider(id: ProviderId): AgentProvider {
  return id === 'codex' ? new CodexProvider() : new ClaudeCodeProvider();
}

export interface ResolveOptions {
  prefer?: ProviderId;
  allowOffline?: boolean;
  /** Force the offline DeterministicProvider regardless of installed CLIs (rehearsal fallback). */
  forceOffline?: boolean;
}

export async function resolveProvider(opts: ResolveOptions = {}): Promise<AgentProvider> {
  if (opts.forceOffline) return new DeterministicProvider(opts.prefer ?? 'claude-code');
  const order: ProviderId[] = opts.prefer === 'codex' ? ['codex', 'claude-code'] : ['claude-code', 'codex'];
  for (const id of order) {
    const p = makeProvider(id);
    if (await p.isAvailable()) return p;
  }
  if (opts.allowOffline ?? true) return new DeterministicProvider(opts.prefer ?? 'claude-code');
  throw new Error('no_provider_available');
}
