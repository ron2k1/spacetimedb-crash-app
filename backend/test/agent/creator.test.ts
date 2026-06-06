import { describe, it, expect } from 'vitest';
import { draftAgentOffline } from '../../src/agent/creator.js';
import { AgentManifestSchema } from '../../src/agent/agents.js';

describe('draftAgentOffline', () => {
  it('drafts a schema-valid manifest from a goal mentioning research', () => {
    const m = draftAgentOffline('research recent papers and save a summary', '2026-06-01T00:00:00Z');
    expect(AgentManifestSchema.safeParse(m).success).toBe(true);
    expect(m.requires.capabilities).toContain('search');
  });

  it('requests fs capability + a write folder when the goal mentions saving files', () => {
    const m = draftAgentOffline('save notes to my documents', '2026-06-01T00:00:00Z');
    expect(m.requires.capabilities).toContain('fs');
    expect(m.permissions.writeFolders.length).toBeGreaterThan(0);
  });
});
