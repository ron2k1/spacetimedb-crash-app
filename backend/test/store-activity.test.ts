import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveWorkspace, ensureWorkspace } from '../src/workspace/paths.js';
import { makeActivityEmitter, type FileOp } from '../src/workspace/activity.js';
import { saveSkill } from '../src/skills/store.js';

let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-store-act-'));
  ensureWorkspace(resolveWorkspace(root));
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('saveSkill activity', () => {
  it('emits mkdir + a create for SKILL.md and skill.json, POSIX workspace-relative', () => {
    const ws = resolveWorkspace(root);
    const calls: { op: FileOp; p: string; bytes: number | undefined }[] = [];
    const activity = makeActivityEmitter(ws, (op, p, bytes) => calls.push({ op, p, bytes }));

    const saved = saveSkill(
      ws,
      {
        name: 'Summarize This',
        description: 'Reads your files and writes a short summary.',
        goal: 'summarize my notes',
        provider: 'claude-code',
      },
      activity,
    );

    // Every emitted path is workspace-relative + POSIX (no backslash, not absolute).
    for (const c of calls) {
      expect(c.p.includes('\\')).toBe(false);
      expect(path.isAbsolute(c.p)).toBe(false);
      expect(c.p.startsWith('skills/')).toBe(true);
    }

    const ops = calls.map((c) => c.op);
    expect(ops).toContain('mkdir');
    expect(ops).toContain('create');

    // The SKILL.md create carries an exact (non-zero) byte length.
    const skillMdCreate = calls.find((c) => c.op === 'create' && c.p.endsWith('SKILL.md'));
    expect(skillMdCreate).toBeTruthy();
    expect(skillMdCreate!.bytes).toBeGreaterThan(0);

    // A create for the skill.json sidecar is emitted too.
    expect(calls.some((c) => c.op === 'create' && c.p.endsWith('skill.json'))).toBe(true);

    // The dir mkdir matches the saved skill's directory.
    expect(calls.some((c) => c.op === 'mkdir' && c.p === path.posix.dirname(saved.path))).toBe(true);
  });
});
