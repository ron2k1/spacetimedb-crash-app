// connection.ts -- the renderer's single connection facade.
//
// One process-wide CrashSocket lives behind this module. The UI never touches CrashSocket
// directly; it calls these functions and reads state from the zustand store. This keeps the
// socket lifecycle (and the one place we read the host-injected boot descriptor) in exactly
// one spot, and gives components a tiny, mock-free surface to call.
//
// SECURITY: the only thing this module logs on failure is a synthetic code. resolveBoot (in
// boot.ts) guarantees its thrown Error.message is itself a synthetic code -- never the token.

import type { Provider } from '@crash/protocol';
import { CrashSocket } from './CrashSocket';
import { readWindowBoot } from './boot';
import { useTaskStore } from '../store/taskStore';

let socket: CrashSocket | null = null;

/**
 * Open the engine connection. Idempotent: safe to call from main.tsx at module load AND under
 * React StrictMode's double-invoke. If no boot descriptor is present (engine not started yet),
 * we stay in a "waiting for engine" state instead of crashing -- the renderer can run first.
 */
export function initConnection(): void {
  if (socket) return;
  try {
    const boot = readWindowBoot();
    socket = new CrashSocket(
      boot,
      (e) => useTaskStore.getState().applyEvent(e),
      (s) => useTaskStore.getState().setConnState(s),
    );
    socket.connect();
  } catch (err) {
    // err.message is a synthetic code (crash_boot_missing | crash_boot_malformed) by contract.
    console.warn('crash_boot_unavailable', (err as Error).message);
    useTaskStore.getState().setConnState('closed');
  }
}

/**
 * Submit the user's request. Returns the requestId for correlation, or null if the socket
 * isn't ready (gated here as defense-in-depth; the input is also disabled until ready).
 * On success it primes the store for the new request so the UI clears the prior answer.
 */
export function submitRequest(
  text: string,
  targetPath?: string,
  agentId?: string,
): string | null {
  if (!socket || useTaskStore.getState().connState !== 'ready') return null;
  const requestId = socket.submitRequest(text, targetPath, agentId);
  useTaskStore.getState().beginRequest(requestId);
  return requestId;
}

export function confirmPlan(planId: string): void {
  socket?.confirmPlan(planId);
}

export function cancelPlan(planId: string): void {
  socket?.cancelPlan(planId);
}

export function respondConfirm(confirmId: string, approved: boolean): void {
  socket?.respondConfirm(confirmId, approved);
  // The decision is sent; clear the prompt so the UI doesn't re-ask.
  useTaskStore.getState().clearConfirm();
}

export function acceptSkillSave(requestId: string, name: string): void {
  socket?.acceptSkillSave(requestId, name);
}

export function cancelRun(requestId: string): void {
  socket?.cancelRun(requestId);
}

/** Ask the engine for current provider auth status (the login gate reads the result from the store). */
export function queryAuthStatus(): void {
  socket?.queryAuthStatus();
}

/** Ask the engine to spawn the interactive login terminal for a provider. */
export function startProviderLogin(provider: Provider): void {
  socket?.startProviderLogin(provider);
}

/** Escape hatch for advanced callers/tests; prefer the named functions above. */
export function getSocket(): CrashSocket | null {
  return socket;
}
