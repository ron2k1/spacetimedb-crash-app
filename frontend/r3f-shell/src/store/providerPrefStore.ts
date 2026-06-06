// providerPrefStore -- remembers which AI CLI the caregiver chose to run Crash on NEXT start.
//
// This is deliberately a SEPARATE, persisted store from taskStore (which is an ephemeral mirror of
// the live event stream and is NOT persisted). The active provider is decided WHEN THE ENGINE BOOTS
// (see backend/src/host.ts reading CRASH_PROVIDER) -- the frozen protocol has no runtime hot-swap.
// So the UI cannot flip the live engine; it can only record a CHOICE that takes effect next launch.
//
// SECURITY: the only thing stored here is the provider ENUM STRING ('claude-code' | 'codex'). A
// token or credential NEVER touches this store -- sign-in happens in a terminal the engine spawns.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Provider } from '@crash/protocol';

interface ProviderPrefState {
  // The provider the user chose to run NEXT time Crash starts. null = no override (the engine
  // resolves its own default order). Enum string only -- never a token.
  preferred: Provider | null;
  setPreferred: (p: Provider) => void;
  clearPreferred: () => void;
}

export const useProviderPrefStore = create<ProviderPrefState>()(
  persist(
    (set) => ({
      preferred: null,
      setPreferred: (p) => set({ preferred: p }),
      clearPreferred: () => set({ preferred: null }),
    }),
    { name: 'crash-provider-preference' },
  ),
);
