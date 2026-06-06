// narration.ts -- gives Crash (the fox) a voice during a run. taskStore is a read-only mirror of the
// Engine->Renderer event stream, but until now nothing translated those run transitions into the
// dialogStore lines that CrashSpeech renders -- so the bubble only ever spoke on manual triggers
// (hello / prompt echo) and stayed silent while a request actually ran.
//
// This is the missing bridge. We subscribe to taskStore ONCE at module init (mirroring the
// useTaskStore.subscribe pattern at the bottom of dashboardStore.ts) and, on each meaningful
// transition, push a short, warm, plain-language line into dialogStore via say(text, 'narration').
//
// FIRE-ONCE DISCIPLINE: zustand's vanilla subscribe hands us (state, prevState) on EVERY store write,
// and a single run emits many events (status, step.started, step.progress, answer.partial...). To
// avoid spamming the bubble we only speak on an actual EDGE -- i.e. when the thing we care about
// differs from its previous value. runState lines fire only when runState changed; step lines fire
// only when a step crossed from not-started to started. Progress ticks and answer deltas never speak.
import { useTaskStore } from '../store/taskStore';
import { useDialogStore } from '../store/dialogStore';
import type { PlanStepView } from '../store/taskStore';

// Plain, friendly, NOT-condescending commentary keyed to run state. Adult-simple: warm but never
// "for kids". One line per state we narrate.
const RUN_STATE_LINE: Partial<Record<string, string>> = {
  planning: 'Let me think about that...',
  indexing: 'Reading your files...',
  running: 'Writing your answer...',
  done: "Done. Here's what I found.",
  error: "That didn't go through. Want to try again?",
};

// Per-step lines, keyed by the engine's stable step ids (see backend orchestrator: st_read first,
// then st_find, then st_answer). These fire the instant a step crosses into `started`, so the bubble
// tracks the run at a finer grain than runState alone (e.g. st_find narrates mid-'indexing').
const STEP_LINE: Record<string, string> = {
  st_read: 'Reading your files...',
  st_find: 'Finding the parts that matter...',
  st_answer: 'Writing your answer...',
};

function findStep(steps: PlanStepView[] | undefined, id: string): PlanStepView | undefined {
  return steps?.find((st) => st.id === id);
}

// Did `id` transition from not-started (or absent) to started between prev and next?
function justStarted(
  nextSteps: PlanStepView[] | undefined,
  prevSteps: PlanStepView[] | undefined,
  id: string,
): boolean {
  const next = findStep(nextSteps, id);
  const prev = findStep(prevSteps, id);
  return !!next?.started && !prev?.started;
}

let installed = false;

/** Idempotent installer: wires the taskStore -> dialogStore narration bridge exactly once, even if
 *  imported from more than one place or re-run across a hot reload. */
export function installNarration(): void {
  if (installed) return;
  installed = true;

  useTaskStore.subscribe((state, prev) => {
    const say = useDialogStore.getState().say;

    // 1) Step-level edges first -- they're the most specific. A step crossing into `started` speaks
    //    its line. st_answer is intentionally also covered by the 'running' runState line below;
    //    whichever edge fires first wins, and the other is a no-op because its value didn't change.
    if (justStarted(state.plan?.steps, prev.plan?.steps, 'st_read')) {
      say(STEP_LINE.st_read, 'narration');
      return;
    }
    if (justStarted(state.plan?.steps, prev.plan?.steps, 'st_find')) {
      say(STEP_LINE.st_find, 'narration');
      return;
    }
    if (justStarted(state.plan?.steps, prev.plan?.steps, 'st_answer')) {
      say(STEP_LINE.st_answer, 'narration');
      return;
    }

    // 2) Run-state edges. Only speak when runState actually changed value (not on every write that
    //    happens to leave runState untouched), and only for states we have a line for.
    if (state.runState !== prev.runState) {
      const line = RUN_STATE_LINE[state.runState];
      if (line) say(line, 'narration');
    }
  });
}
