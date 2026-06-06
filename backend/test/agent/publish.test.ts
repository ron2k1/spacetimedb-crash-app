import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishAgent } from '../../src/agent/publish.js';
import { loadAgents } from '../../src/agent/agents.js';
import { draftAgentOffline } from '../../src/agent/creator.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'crash-pub-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('publishAgent', () => {
  it('saves the pack and returns the new listing', () => {
    const m = draftAgentOffline('research the web and save notes', '2026-06-01T00:00:00Z');
    const listing = publishAgent(dir, m, 'Research/web');
    expect(listing.source).toBe('user');
    expect(loadAgents(dir).some((a) => a.id === m.id)).toBe(true);
  });
});
