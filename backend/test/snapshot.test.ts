import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveWorkspace, ensureWorkspace } from '../src/workspace/paths.js';
import { snapshotWorkspace } from '../src/workspace/snapshot.js';

let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-snap-'));
  const ws = ensureWorkspace(resolveWorkspace(root));
  fs.writeFileSync(path.join(ws.docsDir, 'a.txt'), 'hello');
  fs.mkdirSync(path.join(ws.skillsDir, 's'), { recursive: true });
  fs.writeFileSync(path.join(ws.skillsDir, 's', 'SKILL.md'), '# s');
  fs.writeFileSync(path.join(ws.runtimeDir, 'socket.json'), '{"token":"SECRET"}');
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('snapshotWorkspace', () => {
  it('lists docs/skills/plugins entries', () => {
    const entries = snapshotWorkspace(resolveWorkspace(root));
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('docs/a.txt');
    expect(paths).toContain('skills/s/SKILL.md');
  });
  it('NEVER leaks .runtime (the token lives there)', () => {
    const entries = snapshotWorkspace(resolveWorkspace(root));
    expect(entries.every((e) => !e.path.includes('.runtime'))).toBe(true);
  });
});
