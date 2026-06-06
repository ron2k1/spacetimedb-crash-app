import { describe, it, expect, beforeEach } from 'vitest';
import type { EngineToRenderer } from '@crash/protocol';
import { useTaskStore, isHookNoise } from '../../src/store/taskStore';

// Build a typed terminal.output event for the reducer-integration tests.
function term(line: string, stream: 'stdout' | 'stderr' = 'stdout', seq = 0): EngineToRenderer {
  return { type: 'terminal.output', payload: { requestId: 'req-1', stream, line, seq } } as EngineToRenderer;
}

const HOOK_STARTED = JSON.stringify({
  type: 'system',
  subtype: 'hook_started',
  hook_name: 'SessionStart:startup',
  session_id: 'sess-1',
});
const HOOK_COMPLETED = JSON.stringify({ type: 'system', subtype: 'hook_completed', hook_name: 'SessionStart:startup' });
const SYSTEM_INIT = JSON.stringify({ type: 'system', subtype: 'init', model: 'claude', cwd: '/x' });
const ASSISTANT = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } });
const STREAM_DELTA = JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { text: 'hi' } } });
const RESULT = JSON.stringify({ type: 'result', result: 'done' });

describe('isHookNoise', () => {
  it('flags system/hook_* stdout frames as noise', () => {
    expect(isHookNoise('stdout', HOOK_STARTED)).toBe(true);
    expect(isHookNoise('stdout', HOOK_COMPLETED)).toBe(true);
  });

  it('keeps the one-off system/init frame and all real output', () => {
    expect(isHookNoise('stdout', SYSTEM_INIT)).toBe(false);
    expect(isHookNoise('stdout', ASSISTANT)).toBe(false);
    expect(isHookNoise('stdout', STREAM_DELTA)).toBe(false);
    expect(isHookNoise('stdout', RESULT)).toBe(false);
  });

  it('never filters stderr, even a hook frame (errors must always surface)', () => {
    expect(isHookNoise('stderr', HOOK_STARTED)).toBe(false);
  });

  it('keeps anything it cannot classify (non-JSON, empty, array, null)', () => {
    expect(isHookNoise('stdout', 'plain CLI text, not json')).toBe(false);
    expect(isHookNoise('stdout', '')).toBe(false);
    expect(isHookNoise('stdout', '[1,2,3]')).toBe(false);
    expect(isHookNoise('stdout', 'null')).toBe(false);
  });

  it('does not over-match: subtype must literally start with hook_', () => {
    // A would-be impostor whose subtype merely CONTAINS "hook" is not bookkeeping.
    expect(isHookNoise('stdout', JSON.stringify({ type: 'system', subtype: 'webhook_event' }))).toBe(false);
    // Right subtype but not a system frame -> keep.
    expect(isHookNoise('stdout', JSON.stringify({ type: 'assistant', subtype: 'hook_started' }))).toBe(false);
  });
});

describe('taskStore terminal.output reducer', () => {
  beforeEach(() => {
    useTaskStore.setState({ terminalLines: [], events: [] });
  });

  it('withholds hook noise from the visible mirror but still records the event', () => {
    useTaskStore.getState().applyEvent(term(HOOK_STARTED));
    const s = useTaskStore.getState();
    expect(s.terminalLines).toHaveLength(0); // not shown
    expect(s.events).toHaveLength(1); // but audited
  });

  it('appends real output lines to the visible mirror', () => {
    useTaskStore.getState().applyEvent(term(ASSISTANT));
    useTaskStore.getState().applyEvent(term('boom', 'stderr', 1));
    const s = useTaskStore.getState();
    expect(s.terminalLines).toHaveLength(2);
    expect(s.terminalLines[0]?.line).toBe(ASSISTANT);
    expect(s.terminalLines[1]?.stream).toBe('stderr');
  });

  it('interleaved noise + output keeps only the real lines visible', () => {
    const apply = useTaskStore.getState().applyEvent;
    apply(term(HOOK_STARTED, 'stdout', 0));
    apply(term(STREAM_DELTA, 'stdout', 1));
    apply(term(HOOK_COMPLETED, 'stdout', 2));
    apply(term(RESULT, 'stdout', 3));
    const s = useTaskStore.getState();
    expect(s.terminalLines.map((l) => l.line)).toEqual([STREAM_DELTA, RESULT]);
    expect(s.events).toHaveLength(4); // every event still audited
  });
});
