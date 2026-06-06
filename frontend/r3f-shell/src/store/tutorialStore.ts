import { create } from 'zustand';

// tutorialStore -- whether the first-run tutorial overlay should show. It's persisted to localStorage
// so the welcome only appears the FIRST time someone opens Crash; after they dismiss it (Skip or Got
// it), it never auto-shows again. Kept tiny and separate from taskStore/dashboardStore: this is pure
// "have they seen the intro" UI state, not engine run state and not catalog state.
//
// localStorage is read defensively (wrapped in try/catch) so a privacy-mode browser, a sandbox, or
// any environment without storage degrades to "treat as not seen" rather than throwing on boot.

const STORAGE_KEY = 'crash.tutorial.seen';

function readSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false; // no storage -> show the intro this session, don't crash
  }
}

function writeSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Storage unavailable: the flag just won't persist across reloads. The overlay still dismisses
    // for THIS session via the in-memory `seen` below, so the user isn't stuck behind it.
  }
}

interface TutorialState {
  seen: boolean; // true once the user has dismissed the intro (persisted)
  open: boolean; // transient replay flag: true when re-opened from the help button (NOT persisted)
  show: () => void; // re-open the overlay on demand (How to use Crash button)
  dismiss: () => void; // mark seen + persist AND close a replay (Skip and Got it both call this)
}

export const useTutorialStore = create<TutorialState>((set) => ({
  seen: readSeen(),
  open: false, // first run is driven by `seen`; `open` only matters once the user re-opens it
  show: () => set({ open: true }),
  dismiss: () => {
    writeSeen();
    set({ seen: true, open: false });
  },
}));
