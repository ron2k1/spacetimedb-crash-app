import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GrantStore } from '../../src/workspace/grants.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'crash-grants-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('GrantStore', () => {
  it('adds and lists granted folders, de-duped', () => {
    const g = new GrantStore(join(dir, 'grants.json'));
    g.add('/tmp/a');
    g.add('/tmp/a');
    g.add('/tmp/b');
    expect(g.list().sort()).toEqual(['/tmp/a', '/tmp/b']);
  });

  it('persists across instances', () => {
    const file = join(dir, 'grants.json');
    new GrantStore(file).add('/tmp/c');
    expect(new GrantStore(file).list()).toContain('/tmp/c');
  });
});
