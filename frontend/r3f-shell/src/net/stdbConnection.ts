// stdbConnection.ts -- the ONE SpacetimeDB connection for the whole browser tab.
//
// WHY a module-scope singleton (not a hook-owned ref): React 19 StrictMode double-invokes effects in
// dev, and the renderer has more than one consumer of live data (the marketplace hook and, in P2, the
// auction panel). If each opened its own connection, the tab would hold several WebSockets and mint
// several anonymous Identities -- so the same human's listings and bids would be attributed to
// different identities. Building exactly once at module scope means one socket and one STABLE Identity,
// shared by every hook, with the token cached so a reload keeps that identity.
//
// React wants DECLARATIVE re-renders; a SpacetimeDB connection is IMPERATIVE (callbacks fire when the
// server pushes). The bridge is a tiny listener set: anything that changes connection state calls
// emit(), and each hook registers a listener that re-pulls from the client cache. (Per-table row
// callbacks are registered by the hooks themselves on conn.db.*, not here -- this module only owns the
// connection lifecycle and the SUBSCRIPTION set.)
//
// SECURITY: the only credential is the server-minted connection token, cached under STDB_TOKEN_KEY so
// the demo Identity survives a reload. It is a PUBLIC client token, not a secret, and never leaves the
// browser except back to the host that issued it. Connection errors are surfaced as a state flip only;
// we never log or render the underlying Error's message (it could carry host/transport detail).

import { DbConnection } from "../stdb";
import type { Identity } from "@clockworklabs/spacetimedb-sdk";
import { STDB_URI, STDB_MODULE, STDB_TOKEN_KEY } from "./stdbConfig";

/** "connecting" until the socket opens; "live" once subscriptions apply; "offline" on error/close. */
export type StdbConnState = "connecting" | "live" | "offline";

// Only the PUBLIC tables can be subscribed. settle_schedule (scheduled) and payment_bridge (private) are
// not readable by a client -- including either here would fail the ENTIRE subscription set, so they are
// deliberately omitted. The auction clock still runs server-side; we just watch its effects on `auction`.
const SUBSCRIPTIONS = [
  "SELECT * FROM listing",
  "SELECT * FROM auction",
  "SELECT * FROM bid",
  "SELECT * FROM sale",
  "SELECT * FROM agent",
  "SELECT * FROM activity",
];

// Module-scope singletons. `conn` is built exactly once; the rest track the live status the hooks read.
let conn: DbConnection | null = null;
let identity: Identity | null = null;
let state: StdbConnState = "connecting";

// Observers (hook listeners). Each is called on any connection-state change so the hook can re-render.
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Read the cached connection token (stable Identity across reloads), or undefined if none/unavailable. */
function readToken(): string | undefined {
  try {
    return localStorage.getItem(STDB_TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function saveToken(token: string): void {
  try {
    localStorage.setItem(STDB_TOKEN_KEY, token);
  } catch {
    // Private-mode / storage-disabled: a fresh Identity each reload is an acceptable demo degradation.
  }
}

/**
 * Build the connection once and return it; subsequent calls return the same instance. Safe to call from
 * every hook mount (including StrictMode's double-mount) -- the `conn` guard makes it idempotent.
 *
 * The returned DbConnection is usable immediately (state is "connecting"); reducer calls queue until the
 * socket opens. onConnect installs the subscription set and flips state to "live".
 */
export function ensureConnection(): DbConnection {
  if (conn) return conn;

  conn = DbConnection.builder()
    .withUri(STDB_URI)
    .withModuleName(STDB_MODULE)
    .withToken(readToken())
    .onConnect((connection, id, token) => {
      identity = id;
      saveToken(token);
      // Apply the public-table subscriptions; flip to "live" only once the server confirms them applied,
      // so the first render with data lines up with a populated client cache.
      connection
        .subscriptionBuilder()
        .onApplied(() => {
          state = "live";
          emit();
        })
        .subscribe(SUBSCRIPTIONS);
      // Emit now too so the UI can show "connected, syncing" between open and first apply.
      emit();
    })
    .onConnectError(() => {
      // Static flip only -- never surface the Error (it can carry host/transport detail).
      state = "offline";
      emit();
    })
    .onDisconnect(() => {
      state = "offline";
      emit();
    })
    .build();

  return conn;
}

/**
 * Register a listener fired on every connection-state change. Returns an unsubscribe fn. Used by hooks to
 * re-render when the connection goes live/offline (table-row changes are handled by the hooks' own
 * conn.db.* callbacks).
 */
export function subscribeConn(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The singleton connection if it has been built, else null. */
export function getConn(): DbConnection | null {
  return conn;
}

/** The connected Identity, or null until onConnect fires. */
export function getIdentity(): Identity | null {
  return identity;
}

/** Current connection state ("connecting" | "live" | "offline"). */
export function getConnState(): StdbConnState {
  return state;
}
