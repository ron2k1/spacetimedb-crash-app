import { describe, it, expect } from 'vitest';
import { classifyIntent, chatReply } from '../src/agent/intent.js';

describe('intent classifier', () => {
  // The whole point of this module: a conversational turn must NOT become a task (and so
  // never gets offered as a skill). These are the inputs a confused first-time user types.
  it('routes greetings, thanks, identity, capability, and fillers to chat', () => {
    const chat = [
      'hi',
      'Hello!',
      'hey crash',
      'hi there',
      'good morning',
      'thanks',
      'thank you so much',
      'bye',
      'who are you?',
      "what's your name",
      'what can you do',
      'what can you help me with?',
      'how does this work',
      'what is this?',
      'help',
      'help me',
      'ok',
      'cool',
      'test',
      'just testing',
    ];
    for (const t of chat) expect(classifyIntent(t), `"${t}" should be chat`).toBe('chat');
  });

  it('routes real requests to task -- including a greeting that carries a real ask', () => {
    const task = [
      'summarize my notes',
      'find the coldest town in the valley',
      'explain what this file is about',
      'pull the key dates out of this contract',
      'hello, can you summarize my budget', // greeting + real ask -> still a task
      'help me write a resume', // "help" + content -> task, not the bare-"help" capability reply
      'what are the important points in the report',
      'turn this into a checklist',
    ];
    for (const t of task) expect(classifyIntent(t), `"${t}" should be task`).toBe('task');
  });

  it('is robust to punctuation and casing', () => {
    expect(classifyIntent('HELLO!!!')).toBe('chat');
    expect(classifyIntent('  Thank You.  ')).toBe('chat');
    expect(classifyIntent('Summarize This.')).toBe('task');
  });
});

describe('chatReply', () => {
  it('answers thanks with a "welcome" and points to a next task', () => {
    const r = chatReply('thanks');
    expect(r.toLowerCase()).toContain('welcome');
    expect(r.length).toBeGreaterThan(0);
  });

  it('answers a capability question with concrete examples and the Add a file hint', () => {
    const r = chatReply('what can you do');
    expect(r.toLowerCase()).toContain('summarize');
    expect(r).toContain('Add a file');
  });

  it('answers identity with who Crash is', () => {
    expect(chatReply('who are you')).toContain('Crash');
  });

  it('falls back to the greeting reply for a bare hello', () => {
    const r = chatReply('hi');
    expect(r).toContain('Crash');
    expect(r).toContain('Add a file');
  });
});
