import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { Keystore } from '../../src/secrets/keystore.js';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'crash-ks-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('Keystore', () => {
  it('round-trips a key and lists keyed ids', () => {
    const ks = new Keystore(join(dir, '.secrets', 'connectors.json'));
    ks.set('tavily', 'tvly-secret');
    expect(ks.get('tavily')).toBe('tvly-secret');
    expect([...ks.keyedIds()]).toContain('tavily');
  });

  it('writes the file at 0o600 on POSIX', () => {
    const file = join(dir, '.secrets', 'connectors.json');
    const ks = new Keystore(file);
    ks.set('openai', 'sk-x');
    if (platform() !== 'win32') {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it('persists across instances', () => {
    const file = join(dir, '.secrets', 'connectors.json');
    new Keystore(file).set('groq', 'gsk-1');
    expect(new Keystore(file).get('groq')).toBe('gsk-1');
  });
});
