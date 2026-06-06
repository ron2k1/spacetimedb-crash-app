// fileAccessStore.ts -- the user's one-time consent to let Crash read files they point it at.
//
// Crash's engine runs locally and only reads a file the user explicitly chooses (read-only RAG; a
// write always goes through the confirm.required gate). But "reach into my computer" deserves an
// explicit, deliberate yes the FIRST time -- so this tiny persisted flag records that consent once
// and every later attach skips straight to the picker. It is intentionally its OWN store (not part
// of taskStore): it is durable local preference, not engine-driven run state, and it must survive a
// reload/relaunch the way taskStore (a live mirror of the event stream) must NOT.
//
// Persisted under 'crash-file-access' so the consent sticks across launches. reset() exists so a
// user can revoke it (and tests can start from a clean slate).
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface FileAccessState {
  granted: boolean;
  grant: () => void;
  reset: () => void;
}

export const useFileAccessStore = create<FileAccessState>()(
  persist(
    (set) => ({
      granted: false,
      grant: () => set({ granted: true }),
      reset: () => set({ granted: false }),
    }),
    { name: 'crash-file-access' },
  ),
);
