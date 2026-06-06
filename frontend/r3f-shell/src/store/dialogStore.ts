import { create } from 'zustand';

// dialogStore -- what the on-screen guide (Crash, the fox) is currently "saying". Writers across the
// app (PromptBar, SkillCreatorPanel, LeftRail, and the run narration in net/narration.ts) push a line
// here; CrashSpeech is the single on-screen reader that renders it as a speech bubble over the robot.
//
// PUBLIC API CONTRACT (do not break -- external callers depend on it): { open, prompt, setOpen,
// setPrompt, reset }. Everything below `source` / `say` is ADDITIVE: existing callers keep working
// unchanged, while new callers get a one-shot convenience (`say`) and an optional provenance tag
// (`source`) the bubble can use to style or position itself.

/** Where the current line came from. Purely advisory -- lets the bubble tweak tone/anchoring if it
 *  wants. 'narration' = automatic run commentary; 'user' = a direct user-triggered line (hello,
 *  prompt echo). Optional everywhere; never required by an existing caller. */
export type DialogSource = 'narration' | 'user' | null;

interface DialogState {
  open: boolean;
  prompt: string;
  source: DialogSource; // additive
  setOpen: (open: boolean) => void;
  setPrompt: (prompt: string) => void;
  /** Additive convenience: set the line + open in one call, with an optional source tag. Equivalent
   *  to setPrompt(text) + setOpen(true), so it never changes the meaning of the existing actions. */
  say: (text: string, source?: DialogSource) => void;
  reset: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  open: false,
  prompt: '',
  source: null,
  // Existing setters keep their exact prior behavior. setPrompt clears the source tag so a plain
  // setPrompt(...) (the original API) never inherits a stale 'narration' provenance from an earlier
  // say(); callers that care set source explicitly via say().
  setOpen: (open) => set({ open }),
  setPrompt: (prompt) => set({ prompt, source: null }),
  say: (text, source = null) => set({ prompt: text, source, open: true }),
  reset: () => set({ open: false, prompt: '', source: null }),
}));
