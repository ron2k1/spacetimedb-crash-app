import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { assertWritable } from '../../src/workspace/paths.js';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'crash-jail-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('assertWritable (realpath jail)', () => {
  it('allows a write directly inside a granted folder', () => {
    const granted = join(root, 'granted');
    mkdirSync(granted, { recursive: true });
    expect(() => assertWritable([granted], join(granted, 'note.md'))).not.toThrow();
  });

  it('rejects a write outside every granted folder', () => {
    const granted = join(root, 'granted');
    mkdirSync(granted, { recursive: true });
    expect(() => assertWritable([granted], join(root, 'outside.md'))).toThrow(/permission_denied/);
  });

  it('rejects a symlink inside a granted folder that points outside it', () => {
    if (platform() === 'win32') return; // symlink creation needs privilege on Windows; covered on POSIX CI
    const granted = join(root, 'granted');
    const secret = join(root, 'secret');
    mkdirSync(granted, { recursive: true });
    mkdirSync(secret, { recursive: true });
    symlinkSync(secret, join(granted, 'escape')); // granted/escape -> ../secret
    writeFileSync(join(secret, 'x'), 'x');
    expect(() => assertWritable([granted], join(granted, 'escape', 'pwned.md'))).toThrow(/permission_denied/);
  });
});
