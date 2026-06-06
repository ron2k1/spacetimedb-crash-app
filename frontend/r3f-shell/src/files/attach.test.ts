// Tests for the pure path helpers that decide how a user's input is routed to the engine. These are
// the load-bearing bits of the file-attach feature: basename() is what the chip shows (and must never
// leak a full path), and looksLikePath() is what decides whether a string is sent as targetPath (the
// engine reads the file) or left in the prose request (a topic/link). Both run without a DOM.
import { describe, it, expect } from 'vitest';
import { basename, looksLikePath } from './attach';

describe('basename', () => {
  it('takes the last segment of a Windows path', () => {
    expect(basename('C:\\Users\\you\\Crash\\docs\\trip.md')).toBe('trip.md');
  });

  it('takes the last segment of a POSIX path', () => {
    expect(basename('/home/you/notes/trip.md')).toBe('trip.md');
  });

  it('handles a trailing separator without yielding an empty string', () => {
    expect(basename('C:\\Users\\you\\docs\\')).toBe('docs');
  });

  it('returns a bare filename unchanged', () => {
    expect(basename('trip.md')).toBe('trip.md');
  });
});

describe('looksLikePath', () => {
  it('accepts a Windows drive path (both separators)', () => {
    expect(looksLikePath('C:\\Users\\you\\trip.md')).toBe(true);
    expect(looksLikePath('C:/Users/you/trip.md')).toBe(true);
  });

  it('accepts a UNC path', () => {
    expect(looksLikePath('\\\\server\\share\\trip.md')).toBe(true);
  });

  it('accepts a POSIX absolute path and a home path', () => {
    expect(looksLikePath('/home/you/trip.md')).toBe(true);
    expect(looksLikePath('~/Crash/docs/trip.md')).toBe(true);
  });

  it('rejects a topic or a sentence', () => {
    expect(looksLikePath('summarize my trip notes')).toBe(false);
    expect(looksLikePath('photosynthesis')).toBe(false);
  });

  it('rejects a URL (a link is not a local file)', () => {
    expect(looksLikePath('https://example.com/article')).toBe(false);
  });

  it('ignores surrounding whitespace', () => {
    expect(looksLikePath('   /home/you/trip.md   ')).toBe(true);
  });
});
