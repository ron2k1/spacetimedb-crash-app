// taskStore.test.ts -- TDD spec for the EngineToRenderer reducer store.
//
// Every fixture is built with makeMessage() and then run through EngineToRendererSchema.parse,
// so each test also proves the fixture is a contract-valid frame. If the protocol changes
// shape, these fixtures fail to parse and the test turns red BEFORE the reducer is even
// exercised -- a free contract-conformance tripwire on top of the behavioral assertions.
import { describe, it, expect, beforeEach } from 'vitest';
import { EngineToRendererSchema, makeMessage } from '@crash/protocol';
import type { EngineToRenderer, EventType } from '@crash/protocol';
import { useTaskStore } from './taskStore';

let seq = 0;
/** Build a contract-valid Engine->Renderer event with the right TS type. */
function ev<P>(type: EventType, payload: P): EngineToRenderer {
  return EngineToRendererSchema.parse(makeMessage(type, 'sess-1', seq++, payload));
}

describe('useTaskStore reducer', () => {
  beforeEach(() => {
    useTaskStore.getState().reset();
    seq = 0;
  });

  it('starts idle, disconnected, and empty', () => {
    const s = useTaskStore.getState();
    expect(s.connState).toBe('connecting');
    expect(s.runState).toBe('idle');
    expect(s.answer).toBe('');
    expect(s.plan).toBeNull();
    expect(s.pendingConfirm).toBeNull();
    expect(s.events).toHaveLength(0);
  });

  it('setConnState updates only the connection state', () => {
    useTaskStore.getState().setConnState('ready');
    expect(useTaskStore.getState().connState).toBe('ready');
    expect(useTaskStore.getState().runState).toBe('idle');
  });

  it('session.ready captures sessionId, engineVersion, and provider', () => {
    useTaskStore.getState().applyEvent(
      ev('session.ready', {
        sessionId: 'sess-1',
        protocolVersion: 1,
        engineVersion: '0.1.0',
        provider: 'claude-code',
      }),
    );
    const s = useTaskStore.getState();
    expect(s.sessionId).toBe('sess-1');
    expect(s.engineVersion).toBe('0.1.0');
    expect(s.provider).toBe('claude-code');
  });

  it('beginRequest sets the active request + planning state and clears any prior answer', () => {
    useTaskStore.getState().applyEvent(ev('result.final', { requestId: 'r0', answer: 'stale answer' }));
    expect(useTaskStore.getState().answer).toBe('stale answer');

    useTaskStore.getState().beginRequest('r1');
    const s = useTaskStore.getState();
    expect(s.activeRequestId).toBe('r1');
    expect(s.runState).toBe('planning');
    expect(s.answer).toBe('');
    expect(s.citations).toHaveLength(0);
    expect(s.plan).toBeNull();
    expect(s.lastErrorCode).toBeNull();
  });

  it('plan.proposed stores the plan with steps seeded (fraction 0, not started)', () => {
    useTaskStore.getState().applyEvent(
      ev('plan.proposed', {
        requestId: 'r1',
        planId: 'p1',
        title: 'Summarize the folder',
        summary: 'Read each file, then write a summary.',
        steps: [
          { id: 's1', label: 'Read files' },
          { id: 's2', label: 'Write summary' },
        ],
      }),
    );
    const s = useTaskStore.getState();
    expect(s.activeRequestId).toBe('r1');
    expect(s.runState).toBe('planning');
    expect(s.plan?.planId).toBe('p1');
    expect(s.plan?.title).toBe('Summarize the folder');
    expect(s.plan?.steps).toHaveLength(2);
    expect(s.plan?.steps[0]).toMatchObject({ id: 's1', label: 'Read files', fraction: 0, started: false });
  });

  it('status updates runState and detail', () => {
    useTaskStore.getState().applyEvent(
      ev('status', { requestId: 'r1', state: 'indexing', detail: 'scanning workspace' }),
    );
    const s = useTaskStore.getState();
    expect(s.runState).toBe('indexing');
    expect(s.statusDetail).toBe('scanning workspace');
    expect(s.activeRequestId).toBe('r1');
  });

  it('index.progress records processed/total', () => {
    useTaskStore.getState().applyEvent(ev('index.progress', { requestId: 'r1', processed: 3, total: 10 }));
    expect(useTaskStore.getState().indexProgress).toEqual({ processed: 3, total: 10 });
  });

  it('step.started marks the step started; step.progress sets its fraction', () => {
    useTaskStore.getState().applyEvent(
      ev('plan.proposed', {
        requestId: 'r1',
        planId: 'p1',
        title: 't',
        summary: 's',
        steps: [{ id: 's1', label: 'Read' }],
      }),
    );
    useTaskStore.getState().applyEvent(ev('step.started', { planId: 'p1', stepId: 's1', label: 'Read files' }));
    expect(useTaskStore.getState().plan?.steps[0]).toMatchObject({ id: 's1', label: 'Read files', started: true });

    useTaskStore.getState().applyEvent(ev('step.progress', { planId: 'p1', stepId: 's1', fraction: 0.5 }));
    expect(useTaskStore.getState().plan?.steps[0].fraction).toBe(0.5);
  });

  it('a step event with no prior plan defensively upserts a plan shell (never drops the step)', () => {
    useTaskStore.getState().applyEvent(ev('step.started', { planId: 'pX', stepId: 'sX', label: 'Orphan step' }));
    const plan = useTaskStore.getState().plan;
    expect(plan?.planId).toBe('pX');
    expect(plan?.steps.some((st) => st.id === 'sX' && st.started)).toBe(true);
  });

  it('answer.partial appends deltas; result.final replaces with the final answer + citations', () => {
    useTaskStore.getState().beginRequest('r1');
    useTaskStore.getState().applyEvent(ev('answer.partial', { requestId: 'r1', textDelta: 'Hello ' }));
    useTaskStore.getState().applyEvent(ev('answer.partial', { requestId: 'r1', textDelta: 'world' }));
    expect(useTaskStore.getState().answer).toBe('Hello world');

    useTaskStore.getState().applyEvent(
      ev('result.final', {
        requestId: 'r1',
        answer: 'The final, authoritative answer.',
        citations: [{ source: 'taxes.csv', snippet: 'row 12' }],
      }),
    );
    const s = useTaskStore.getState();
    expect(s.answer).toBe('The final, authoritative answer.');
    expect(s.runState).toBe('done');
    expect(s.citations).toHaveLength(1);
    expect(s.citations[0]).toMatchObject({ source: 'taxes.csv', snippet: 'row 12' });
  });

  it('confirm.required sets pendingConfirm + awaiting_confirm; clearConfirm clears it', () => {
    useTaskStore.getState().applyEvent(
      ev('confirm.required', { confirmId: 'c1', planId: 'p1', action: 'write file', detail: 'summary.md' }),
    );
    const s = useTaskStore.getState();
    expect(s.pendingConfirm).toMatchObject({ confirmId: 'c1', action: 'write file', detail: 'summary.md' });
    expect(s.runState).toBe('awaiting_confirm');

    useTaskStore.getState().clearConfirm();
    expect(useTaskStore.getState().pendingConfirm).toBeNull();
  });

  it('skill.save.offer stores the offer; skill.saved records the skill and consumes the offer', () => {
    useTaskStore.getState().applyEvent(
      ev('skill.save.offer', { requestId: 'r1', suggestedName: 'summarize-folder', description: 'Summarize any folder' }),
    );
    expect(useTaskStore.getState().skillOffer?.suggestedName).toBe('summarize-folder');

    useTaskStore.getState().applyEvent(
      ev('skill.saved', { skillId: 'sk1', name: 'summarize-folder', path: '/skills/summarize-folder' }),
    );
    const s = useTaskStore.getState();
    expect(s.savedSkill).toMatchObject({ skillId: 'sk1', name: 'summarize-folder' });
    expect(s.skillOffer).toBeNull();
  });

  it('error records only the synthetic code and flips runState to error', () => {
    useTaskStore.getState().applyEvent(ev('error', { requestId: 'r1', code: 'crash_engine_timeout', retryable: true }));
    const s = useTaskStore.getState();
    expect(s.lastErrorCode).toBe('crash_engine_timeout');
    expect(s.runState).toBe('error');
  });

  it('folder.snapshot replaces the workspace tree wholesale', () => {
    useTaskStore.getState().applyEvent(
      ev('folder.snapshot', {
        entries: [
          { path: 'skills', kind: 'dir' },
          { path: 'CLAUDE.md', kind: 'file', bytes: 120 },
        ],
      }),
    );
    const s = useTaskStore.getState();
    expect(s.folderSnapshot).toHaveLength(2);
    expect(s.folderSnapshot[0]).toMatchObject({ path: 'skills', kind: 'dir' });
    expect(s.folderSnapshot[1]).toMatchObject({ path: 'CLAUDE.md', kind: 'file', bytes: 120 });
  });

  it('file.activity appends each op to the activity log in arrival order', () => {
    useTaskStore.getState().applyEvent(ev('file.activity', { op: 'mkdir', path: 'skills/notes', seq: 0 }));
    useTaskStore.getState().applyEvent(
      ev('file.activity', { op: 'create', path: 'skills/notes/SKILL.md', bytes: 200, seq: 1 }),
    );
    const a = useTaskStore.getState().fileActivity;
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ op: 'mkdir', path: 'skills/notes' });
    expect(a[1]).toMatchObject({ op: 'create', path: 'skills/notes/SKILL.md', bytes: 200 });
  });

  it('marketplace.installed appends the installed item', () => {
    useTaskStore.getState().applyEvent(
      ev('marketplace.installed', {
        installId: 'inst_1',
        kind: 'skill',
        itemId: 'meeting-notes',
        path: 'skills/meeting-notes',
      }),
    );
    const installed = useTaskStore.getState().installed;
    expect(installed).toHaveLength(1);
    expect(installed[0]).toMatchObject({ kind: 'skill', itemId: 'meeting-notes', path: 'skills/meeting-notes' });
  });

  it('provider.session records the visible headless worker lifecycle', () => {
    useTaskStore.getState().applyEvent(
      ev('provider.session', {
        requestId: 'r1',
        provider: 'codex',
        state: 'running',
        detail: 'asking Codex',
      }),
    );

    expect(useTaskStore.getState().providerWorker).toEqual({
      requestId: 'r1',
      provider: 'codex',
      state: 'running',
      detail: 'asking Codex',
    });
  });

  it('appends every applied event to the raw event log in order', () => {
    useTaskStore.getState().applyEvent(ev('status', { requestId: 'r1', state: 'planning' }));
    useTaskStore.getState().applyEvent(ev('answer.partial', { requestId: 'r1', textDelta: 'hi' }));
    const events = useTaskStore.getState().events;
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('status');
    expect(events[1].type).toBe('answer.partial');
  });

  it('reset returns the store to its initial state', () => {
    useTaskStore.getState().setConnState('ready');
    useTaskStore.getState().applyEvent(ev('answer.partial', { requestId: 'r1', textDelta: 'hi' }));
    useTaskStore.getState().applyEvent(ev('file.activity', { op: 'create', path: 'a.md', seq: 0 }));
    useTaskStore.getState().reset();
    const s = useTaskStore.getState();
    expect(s.connState).toBe('connecting');
    expect(s.answer).toBe('');
    expect(s.events).toHaveLength(0);
    expect(s.fileActivity).toHaveLength(0);
  });
});

describe('useTaskStore reducer: marketplace events', () => {
  beforeEach(() => {
    useTaskStore.getState().reset();
    seq = 0;
  });

  it('stores the catalog listings', () => {
    useTaskStore.getState().applyEvent(
      ev('marketplace.catalog', {
        listings: [{ id: 'a', name: 'A', description: 'd', category: 'c', accesses: ['Web search'], source: 'builtin' }],
      }),
    );
    expect(useTaskStore.getState().catalog?.[0].id).toBe('a');
  });

  it('appends tool activity', () => {
    useTaskStore.getState().applyEvent(ev('tool.activity', { agentId: 'r', tool: 'search', phase: 'ok' }));
    expect(useTaskStore.getState().toolActivity?.at(-1)?.tool).toBe('search');
  });

  it('records the latest payment phase', () => {
    useTaskStore.getState().applyEvent(
      ev('payment.activity', { agentId: 'r', phase: 'settled', amount: '0.01', asset: 'USDC', network: 'eip155:84532' }),
    );
    expect(useTaskStore.getState().payment?.phase).toBe('settled');
  });

  it('records wallet status', () => {
    useTaskStore.getState().applyEvent(ev('wallet.status', { balanceMinor: 100, caps: [] }));
    expect(useTaskStore.getState().wallet?.balanceMinor).toBe(100);
  });
});
