import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentManifestSchema, saveAgent, loadAgents, accessesSummary } from '../../src/agent/agents.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'crash-agents-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const manifest = {
  id: 'research-agent', name: 'Research Agent', goal: 'Research the web',
  systemPrompt: 'You are a careful researcher.',
  requires: { capabilities: ['search'] as const },
  permissions: { readBroad: true, writeFolders: ['Research'] },
  source: 'builtin' as const, createdAt: '2026-06-01T00:00:00Z',
};

describe('agents', () => {
  it('validates a manifest', () => {
    expect(AgentManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('saves a pack and reads it back', () => {
    saveAgent(dir, manifest);
    expect(existsSync(join(dir, 'agents', 'research-agent', 'manifest.json'))).toBe(true);
    expect(loadAgents(dir).find((a) => a.id === 'research-agent')?.name).toBe('Research Agent');
  });

  it('derives an access-forward summary', () => {
    expect(accessesSummary(manifest)).toContain('Web search');
    expect(accessesSummary(manifest).some((s) => s.startsWith('Write to:'))).toBe(true);
  });
});
