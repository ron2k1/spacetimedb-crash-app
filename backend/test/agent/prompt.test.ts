// Full CLI chat (Spec: chatbot-as-real-CLI). The conversational prompt USED to forbid tools
// ("do NOT browse the web, do NOT run any tool") as an anti-hang clamp. That clamp now lives in
// the idle-output watchdog (proc.ts), so the prompt is free to LET the agent use its tools when a
// question needs live info -- and to pass a slash command through verbatim so it actually runs.
import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../../src/agent/prompt.js';

describe('buildPrompt (full CLI chat: tools allowed, slash-commands pass through)', () => {
  it('no longer forbids tools or the web -- it permits them when the answer needs live info', () => {
    const p = buildPrompt('research the latest NVIDIA news', '');
    expect(p).not.toMatch(/do NOT browse the web/i);
    expect(p).not.toMatch(/do NOT run any tool/i);
    expect(p).not.toMatch(/do NOT inspect files/i);
    // It positively permits tools / web / search instead of banning them.
    expect(p).toMatch(/tool|web|search/i);
    // ...and still carries the user's actual message.
    expect(p).toContain('research the latest NVIDIA news');
  });

  it('includes optional shared context when present', () => {
    const p = buildPrompt('what does this say', 'CONTEXT_LINE_ABC');
    expect(p).toContain('CONTEXT_LINE_ABC');
    expect(p).toContain('what does this say');
  });

  it('passes a slash command through verbatim so the CLI actually runs it', () => {
    const p = buildPrompt('/research nvidia earnings', '');
    expect(p).toBe('/research nvidia earnings');
    // NOT wrapped in the conversational template -- a wrapped "/research" would be treated as text.
    expect(p).not.toMatch(/THEIR MESSAGE/);
    expect(p).not.toMatch(/You are Crash/);
  });
});
