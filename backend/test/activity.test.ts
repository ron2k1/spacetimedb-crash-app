import { describe, it, expect } from 'vitest';
import { toWorkspaceRel, makeActivityEmitter } from '../src/workspace/activity.js';
import { resolveWorkspace } from '../src/workspace/paths.js';
import os from 'node:os';
import path from 'node:path';

// A native-absolute workspace root (mirrors production's os.homedir()/Crash) so the path
// math runs correctly on whatever OS executes CI. A hardcoded Windows literal such as
// path.join('C:', 'Users', ...) becomes 'C:/Users/...' on the Linux runner, which POSIX
// path.relative does NOT treat as absolute -- so the prefix never strips and toWorkspaceRel
// leaks the absolute path. resolveWorkspace does pure path joins (no fs), so this stays a
// fast unit test with no temp dir to create or clean up.
const ws = resolveWorkspace(path.join(os.tmpdir(), 'crash-unit-ws'));

describe('toWorkspaceRel', () => {
  it('returns a POSIX workspace-relative path for an absolute target', () => {
    const abs = path.join(ws.root, 'skills', 'foo', 'SKILL.md');
    expect(toWorkspaceRel(ws, abs)).toBe('skills/foo/SKILL.md');
  });
  it('handles an already-relative target', () => {
    expect(toWorkspaceRel(ws, path.join('skills', 'foo'))).toBe('skills/foo');
  });
});

describe('makeActivityEmitter', () => {
  it('emits POSIX-relative paths with a monotonic per-activity seq', () => {
    const calls: any[] = [];
    const em = makeActivityEmitter(ws, (op, p, bytes, seq) => calls.push({ op, p, bytes, seq }));
    em.emit('mkdir', path.join(ws.root, 'skills', 'foo'));
    em.emit('create', path.join(ws.root, 'skills', 'foo', 'SKILL.md'), 412);
    expect(calls).toEqual([
      { op: 'mkdir', p: 'skills/foo', bytes: undefined, seq: 0 },
      { op: 'create', p: 'skills/foo/SKILL.md', bytes: 412, seq: 1 },
    ]);
  });
});
