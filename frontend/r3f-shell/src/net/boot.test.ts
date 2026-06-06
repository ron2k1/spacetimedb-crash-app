import { describe, it, expect } from 'vitest';
import { resolveBoot } from './boot';
import { PROTOCOL_VERSION } from '@crash/protocol';

describe('resolveBoot', () => {
  it('parses a well-formed boot descriptor', () => {
    const boot = resolveBoot({
      host: '127.0.0.1',
      port: 51234,
      token: 'cap-token',
      protocolVersion: 1,
      provider: 'claude-code',
    });
    expect(boot).toEqual({
      host: '127.0.0.1',
      port: 51234,
      token: 'cap-token',
      protocolVersion: 1,
      provider: 'claude-code',
    });
  });

  it('defaults protocolVersion and provider when absent', () => {
    const boot = resolveBoot({ host: '127.0.0.1', port: 9, token: 't' });
    expect(boot.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(boot.provider).toBe('claude-code');
  });

  it('throws a synthetic code when the descriptor is missing', () => {
    expect(() => resolveBoot(null)).toThrow('crash_boot_missing');
    expect(() => resolveBoot('not-an-object')).toThrow('crash_boot_missing');
  });

  it('throws a synthetic code when required fields are malformed', () => {
    expect(() => resolveBoot({ host: '127.0.0.1', port: 'nope', token: 't' })).toThrow(
      'crash_boot_malformed',
    );
    expect(() => resolveBoot({ host: '127.0.0.1', port: 1 })).toThrow('crash_boot_malformed');
  });

  it('never includes the token in the thrown error message', () => {
    try {
      resolveBoot({ host: '127.0.0.1', port: 'bad', token: 'SECRET_TOKEN_VALUE' });
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).not.toContain('SECRET_TOKEN_VALUE');
      expect((e as Error).message).toBe('crash_boot_malformed');
    }
  });
});
