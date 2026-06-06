import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveWorkspace, ensureWorkspace } from '../src/workspace/paths.js';
import { makeActivityEmitter, type FileOp } from '../src/workspace/activity.js';
import { findItem } from '../src/marketplace/catalog.js';
import { installItem } from '../src/marketplace/install.js';

let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-install-'));
  ensureWorkspace(resolveWorkspace(root));
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('marketplace catalog', () => {
  it('finds a real seed skill by id', () => {
    const item = findItem('skill', 'meeting-notes');
    expect(item).toBeTruthy();
    expect(item!.id).toBe('meeting-notes');
    expect(fs.existsSync(item!.dir)).toBe(true);
  });
  it('returns null for an unknown id', () => {
    expect(findItem('skill', 'does-not-exist')).toBeNull();
  });
});

describe('installItem', () => {
  it('copies the seed item into skills/<id> and reports a POSIX workspace-relative path', () => {
    const ws = resolveWorkspace(root);
    const calls: { op: FileOp; p: string; bytes: number | undefined }[] = [];
    const activity = makeActivityEmitter(ws, (op, p, bytes) => calls.push({ op, p, bytes }));

    const res = installItem(ws, 'skill', 'meeting-notes', activity);

    // result path is workspace-relative + POSIX (no backslash, not absolute)
    expect(res.path).toBe('skills/meeting-notes');
    expect(res.path.includes('\\')).toBe(false);
    expect(path.isAbsolute(res.path)).toBe(false);

    // the destination tree exists on disk with the seed's SKILL.md
    const destAbs = path.join(ws.root, 'skills', 'meeting-notes');
    expect(fs.existsSync(destAbs)).toBe(true);
    expect(fs.existsSync(path.join(destAbs, 'SKILL.md'))).toBe(true);

    // the activity sink saw a mkdir + at least one create, all POSIX workspace-relative
    const ops = calls.map((c) => c.op);
    expect(ops).toContain('mkdir');
    expect(calls.filter((c) => c.op === 'create').length).toBeGreaterThanOrEqual(1);
    for (const c of calls) {
      expect(c.p.includes('\\')).toBe(false);
      expect(path.isAbsolute(c.p)).toBe(false);
      expect(c.p.startsWith('skills/meeting-notes')).toBe(true);
    }
  });

  it('throws catalog_item_not_found for a bogus item id', () => {
    const ws = resolveWorkspace(root);
    expect(() => installItem(ws, 'skill', 'not-a-real-item')).toThrowError('catalog_item_not_found');
  });
});
