// boot.ts -- resolves the engine connection descriptor the host injects before the app runs.
//
// The headless engine writes <workspace>/.runtime/socket.json (mode 0600) AND a host then
// surfaces it to the webview as `window.__CRASH_BOOT__`:
//   - in browser dev, the Vite plugin in vite.config.ts reads socket.json and injects it
//   - in a packaged Tauri build, Rust injects it (future; not in the v0.1 slice)
//
// This module is the renderer's single entry point for "where do I connect and with what
// token". It validates shape only and returns synthetic error CODES on failure -- it never
// echoes the token into an error message (the descriptor is a localhost capability).

import { PROTOCOL_VERSION } from '@crash/protocol';

export interface CrashBoot {
  host: string;
  port: number;
  token: string;
  protocolVersion: number;
  provider: string; // display-only; CrashSocket coerces to the protocol enum for `hello`
}

/**
 * Validate an arbitrary value into a CrashBoot. Throws an Error whose message is a
 * SYNTHETIC code (`crash_boot_missing` | `crash_boot_malformed`) -- never the token.
 * Takes the source explicitly so it is trivially testable; see {@link readWindowBoot}
 * for the runtime entry that reads `window.__CRASH_BOOT__`.
 */
export function resolveBoot(source: unknown): CrashBoot {
  if (!source || typeof source !== 'object') {
    throw new Error('crash_boot_missing');
  }
  const b = source as Record<string, unknown>;
  if (typeof b.host !== 'string' || typeof b.port !== 'number' || typeof b.token !== 'string') {
    throw new Error('crash_boot_malformed');
  }
  return {
    host: b.host,
    port: b.port,
    token: b.token,
    protocolVersion: typeof b.protocolVersion === 'number' ? b.protocolVersion : PROTOCOL_VERSION,
    provider: typeof b.provider === 'string' ? b.provider : 'claude-code',
  };
}

/** Runtime entry: read the host-injected descriptor off `window`. Throws like resolveBoot. */
export function readWindowBoot(): CrashBoot {
  const raw =
    typeof window !== 'undefined'
      ? (window as { __CRASH_BOOT__?: unknown }).__CRASH_BOOT__
      : undefined;
  return resolveBoot(raw);
}
