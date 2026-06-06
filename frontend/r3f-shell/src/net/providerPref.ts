// providerPref -- the one bridge that carries the caregiver's provider choice from the UI down to
// the engine that launches NEXT start. In the PACKAGED app the Rust sidecar reads this file
// (<app_config_dir>/provider) before spawning the engine and exports it as CRASH_PROVIDER, so the
// engine boots on the chosen CLI (see src-tauri/src/sidecar.rs). In the plain browser dev preview
// there is no Rust side, so this is a no-op there -- the zustand preference still drives the UI, but
// the dev engine keeps whatever provider it was launched with. That is honest: we never pretend a
// live engine swapped CLIs mid-run, which the protocol cannot do.
//
// SECURITY: the argument is the provider ENUM STRING only ('claude-code' | 'codex'). No token ever
// flows through here -- the Rust command re-validates the value against the same enum before writing.
import { invoke } from '@tauri-apps/api/core';
import type { Provider } from '@crash/protocol';
import { isTauri } from '../files/attach';

export async function persistProviderPreference(provider: Provider): Promise<void> {
  if (!isTauri) return; // browser dev preview: localStorage preference is the only record (honest no-op)
  try {
    await invoke('set_provider_preference', { provider });
  } catch {
    // Non-fatal: the UI preference (zustand persist) still records the choice; the engine simply
    // keeps its current provider until the file can be written on a later attempt.
  }
}

export async function restartCrash(): Promise<void> {
  if (!isTauri) {
    window.location.reload();
    return;
  }
  await invoke('restart_app');
}
