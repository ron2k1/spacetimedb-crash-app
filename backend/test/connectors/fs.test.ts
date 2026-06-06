import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeToGranted } from '../../src/connectors/fs.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'crash-fs-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('writeToGranted', () => {
  it('writes inside a granted folder and reports file.activity', () => {
    const granted = join(root, 'granted');
    mkdirSync(granted, { recursive: true });
    const activity: any[] = [];
    const res = writeToGranted({ grantedRoots: [granted], target: join(granted, 'out.md'), contents: 'hello', emit: (a) => activity.push(a) });
    expect(res.ok).toBe(true);
    expect(existsSync(join(granted, 'out.md'))).toBe(true);
    expect(activity[0].op).toBe('create');
  });

  it('refuses to write outside granted folders (permission_denied)', () => {
    const granted = join(root, 'granted');
    mkdirSync(granted, { recursive: true });
    const res = writeToGranted({ grantedRoots: [granted], target: join(root, 'nope.md'), contents: 'x', emit: () => {} });
    expect(res).toMatchObject({ ok: false, code: 'permission_denied' });
  });
});
