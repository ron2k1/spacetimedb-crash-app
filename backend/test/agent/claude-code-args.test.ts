// Optional model pin (#14). claude-code.ts passes NO --model by default, so the CLI uses its own
// default model (currently Opus) and self-reports it correctly. Setting CRASH_CLAUDE_MODEL pins or
// switches it (e.g. a faster model for quick chats) without code changes. modelArgs() is the small,
// pure env-reader that turns that env var into argv, mirroring accessArgs()/extraArgs().
import { describe, it, expect, afterEach } from 'vitest';
import { modelArgs } from '../../src/agent/claude-code.js';

const saved = process.env.CRASH_CLAUDE_MODEL;
afterEach(() => {
  if (saved === undefined) delete process.env.CRASH_CLAUDE_MODEL;
  else process.env.CRASH_CLAUDE_MODEL = saved;
});

describe('modelArgs (optional --model pin)', () => {
  it('is empty when CRASH_CLAUDE_MODEL is unset (CLI uses its own default)', () => {
    delete process.env.CRASH_CLAUDE_MODEL;
    expect(modelArgs()).toEqual([]);
  });

  it('emits --model <value> when CRASH_CLAUDE_MODEL is set', () => {
    process.env.CRASH_CLAUDE_MODEL = 'claude-opus-4-8';
    expect(modelArgs()).toEqual(['--model', 'claude-opus-4-8']);
  });

  it('ignores a blank value (treats whitespace as unset)', () => {
    process.env.CRASH_CLAUDE_MODEL = '   ';
    expect(modelArgs()).toEqual([]);
  });
});
