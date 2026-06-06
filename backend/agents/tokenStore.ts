// tokenStore.ts -- file-backed persistence of a bot's SpacetimeDB connection token.
//
// WHY this exists: the browser client caches its server-minted token in localStorage so a reload keeps
// the SAME anonymous Identity (its listings/bids stay attributed to it). A Node bot has no localStorage,
// so without this every `tsx agent-bot.ts` would mint a BRAND-NEW Identity -- "BotAlice" would be a
// different bidder each run and the agent table would fill with orphan registrations. Persisting the
// token to a per-bot file gives each bot a STABLE, DISTINCT Identity across runs: BotAlice is always the
// same #hex, BotBob always another. register_agent is keyed on that Identity, so re-running just refreshes
// the same agent row instead of spawning a new one.
//
// SECURITY: this token is a PUBLIC client token (the same class the browser caches), not a long-lived API
// key -- it only authenticates a connection back to the SpacetimeDB host that issued it. Even so it is
// treated as sensitive: stored under a gitignored `.tokens/` dir with 0600/0700 modes (POSIX), and NEVER
// logged. The path is resolved via fileURLToPath(import.meta.url) -- not url.pathname.slice(1), which is a
// Windows-only anti-pattern -- so the directory lands next to this file on every platform.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `.tokens/` sits beside this module (backend/agents/.tokens/), gitignored. One file per bot id.
const TOKENS_DIR = join(dirname(fileURLToPath(import.meta.url)), ".tokens");

/** Read the cached token for `botId`, or undefined if none exists / unreadable (-> a fresh Identity). */
export function readToken(botId: string): string | undefined {
  try {
    const file = join(TOKENS_DIR, `${botId}.token`);
    if (!existsSync(file)) return undefined;
    const token = readFileSync(file, "utf8").trim();
    return token.length > 0 ? token : undefined;
  } catch {
    // Unreadable token file is non-fatal: the bot connects fresh and saveToken rewrites it on connect.
    return undefined;
  }
}

/** Persist the server-minted token for `botId` so the next run reuses the same Identity. Best-effort. */
export function saveToken(botId: string, token: string): void {
  try {
    mkdirSync(TOKENS_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(join(TOKENS_DIR, `${botId}.token`), token, { mode: 0o600 });
  } catch {
    // Storage-disabled / read-only FS: a fresh Identity next run is an acceptable demo degradation.
  }
}
