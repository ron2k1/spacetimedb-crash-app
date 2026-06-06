// marketplaceClient.ts -- the renderer's link to the SHARED, networked Crash Marketplace service
// (the "eBay" surface: @crash/marketplace-server). This is what makes the storefront a real, live,
// multi-user market instead of a static list: humans and agents on any connected client list/buy/sell,
// and everyone sees it in real time.
//
// THREE-TIER DATA STRATEGY (in priority order):
//   1. WebSocket /ws  -- the authoritative, real-time feed. On connect the server sends a `hello` with
//      the full listings + activity snapshot (and the wallet); thereafter it pushes deltas to every
//      client: `listing.created` / `listing.acquired`, the `run.*` agent-run stream, and `wallet.status`.
//      This is the source of truth while connected.
//   2. REST bootstrap  -- GET /api/listings + /api/activity + /api/wallet on mount, so the grid + wallet
//      paint immediately without waiting for the socket handshake.
//   3. Static seed     -- if the service is unreachable, fall back to MARKET_LISTINGS so the app degrades
//      to a readable (read-only) catalog instead of a blank screen. status === "offline" tells the UI to
//      hide the sell/buy affordances (you can't transact against a service that isn't there).
//
// IDEMPOTENCY: the server echoes every mutation back to ALL sockets, including the client that triggered
// it. So a POST response AND its WS echo both arrive. All reducers here are idempotent -- upsert-by-id for
// listings, "set acquiredCount to the frame's authoritative value" (never ++), dedupe activity by id,
// merge runs by runId -- so the two paths (POST result + WS echo, or WS stream + GET poll) CONVERGE
// instead of double-counting.
//
// RUNS: a "run" is one end-to-end agent execution against a listing (POST /api/run -> 202 {runId}). The
// actual work -- a paid Tavily search settled over x402/USDC, then an LLM synthesis -- happens SERVER-SIDE
// (so the keys stay server-side secrets), and the server streams its progress back as run.started ->
// run.step* -> run.done frames keyed by runId. We accumulate each run's live state in a runs-by-id map so
// any surface (the run modal, the activity feed) can render it; GET /api/runs/:id is the polling fallback
// for a client that missed a frame.
//
// SECURITY: this service carries zero secrets -- no engine token, no API keys, no wallet private key. The
// wallet snapshot streamed here is demo BUDGET state (balances + a ledger in USDC minor units), never a
// key or address secret. The real x402 signing key lives only server-side (an ACA secret / engine
// keystore) and never crosses to this surface. `price` strings are catalog copy.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MARKET_LISTINGS,
  CATEGORY_GLOW,
  type MarketCategory,
  type MarketGlow,
  type MarketListing,
  type MarketSeller,
} from "../data/marketplace";

// Base URL of the marketplace service. Overridable for a deployed ("not localhost") service via the
// Vite env var VITE_MARKETPLACE_URL; defaults to the local dev service on :8787. Trailing slash trimmed.
const BASE = (
  (import.meta.env.VITE_MARKETPLACE_URL as string | undefined) ||
  "http://localhost:8787"
).replace(/\/+$/, "");

// ws:// from http://, wss:// from https:// -- same host, /ws path.
const WS_URL = BASE.replace(/^http/i, "ws") + "/ws";

/**
 * The marketplace service origin, exported so sibling surfaces (e.g. the run modal's GET /api/config
 * probe) hit the EXACT same host this hook talks to -- no second source of truth for the base URL.
 */
export const MARKETPLACE_BASE = BASE;

// ---- Wire types (mirror marketplace-server/src/types.ts 1:1) -------------------------------------

export interface ActivityEvent {
  id: string;
  kind: "listed" | "acquired";
  listingId: string;
  listingName: string;
  actor: MarketSeller;
  at: number;
}

export interface Sale {
  id: string;
  listingId: string;
  buyer: MarketSeller;
  at: number;
}

/** POST /api/listings body. Server assigns id/createdAt/acquiredCount and defaults icon/glow/seller. */
export interface NewListingInput {
  name: string;
  blurb: string;
  category: MarketCategory;
  price: string;
  icon?: string;
  glow?: MarketGlow;
  tags?: string[];
  seller?: MarketSeller;
}

// ---- Run + wallet wire types (mirror marketplace-server/src/types.ts) -----------------------------

/** Kinds of run step the server streams, in the order they typically occur. */
export type RunStepKind =
  | "plan"
  | "payment"
  | "search"
  | "synthesize"
  | "agent_purchase";

export type RunStatus = "running" | "done" | "error";

/** One streamed/persisted step of a run. All fields beyond kind+at are optional + field-level safe. */
export interface RunStepWire {
  kind: RunStepKind;
  text?: string;
  phase?: string;
  amount?: string;
  asset?: string;
  network?: string;
  payTo?: string;
  txRef?: string;
  at: number;
}

/** A source the synthesis cited (returned by the paid search). */
export interface CitationWire {
  source: string;
  snippet: string;
}

/** A per-agent spend cap snapshot (USDC minor units). */
export interface WalletCapWire {
  agentId: string;
  capMinor: number;
  spentMinor: number;
}

/** One wallet ledger line: a spend (to a counterparty) or an earn (credited to a seller). */
export interface LedgerEntryWire {
  id: string;
  kind: "spend" | "earn";
  counterparty: string;
  amountMinor: number;
  runId?: string;
  at: number;
}

/** Full wallet snapshot (USDC minor units). Demo budget state -- safe to echo to clients. */
export interface WalletWire {
  balanceMinor: number;
  currency: "USDC";
  caps: WalletCapWire[];
  ledger: LedgerEntryWire[];
}

/**
 * The renderer-side accumulation of one run's live state, built up from the run.* frames (or a
 * GET /api/runs/:id poll). Mirrors the server's persisted Run minus the fields a live view doesn't need.
 */
export interface LiveRun {
  id: string;
  listingId: string;
  listingName: string;
  input?: string;
  status: RunStatus;
  steps: RunStepWire[];
  result?: string;
  citations?: CitationWire[];
  costMinor?: number;
  sellerEarnedMinor?: number;
  errorCode?: string;
}

/** GET /api/runs/:id response -- the persisted run record (superset of LiveRun). */
interface RunRecordWire extends LiveRun {
  buyer?: MarketSeller;
  startedAt?: number;
  finishedAt?: number;
}

/** "connecting" = bootstrapping; "live" = WebSocket open; "offline" = service unreachable (seed shown). */
export type MarketStatus = "connecting" | "live" | "offline";

type WsFrame =
  | {
      type: "hello";
      listings: MarketListing[];
      activity: ActivityEvent[];
      wallet?: WalletWire;
    }
  | { type: "listing.created"; listing: MarketListing }
  | {
      type: "listing.acquired";
      listingId: string;
      sale: Sale;
      listing: MarketListing;
    }
  | {
      type: "run.started";
      runId: string;
      listingId: string;
      listingName: string;
      input?: string;
    }
  // The server FLATTENS the step fields onto the frame (kind/at/text/phase/...), rather than nesting
  // them under a `step` key -- so the frame is the step plus its envelope (type + runId).
  | ({ type: "run.step"; runId: string } & RunStepWire)
  | {
      type: "run.done";
      runId: string;
      result?: string;
      citations?: CitationWire[];
      costMinor?: number;
      sellerEarnedMinor?: number;
      status?: RunStatus;
      errorCode?: string;
    }
  | { type: "run.error"; runId: string; code: string }
  | { type: "wallet.status"; wallet: WalletWire };

export interface UseMarketplaceResult {
  listings: MarketListing[];
  activity: ActivityEvent[];
  status: MarketStatus;
  /** True only while connected to the live service -- gates the sell/buy affordances. */
  online: boolean;
  /** The authoritative agent wallet (USDC minor units), or null until the service answers. */
  wallet: WalletWire | null;
  /** Live runs by runId, accumulated from the run.* stream (and any GET poll). */
  runs: Record<string, LiveRun>;
  /** List a new capability for sale. Returns the created listing, or null on failure/offline. */
  createListing: (input: NewListingInput) => Promise<MarketListing | null>;
  /** Acquire (buy) a listing. Returns true on success. Optimistic + WS-echo converge by id. */
  acquire: (id: string, buyer?: MarketSeller) => Promise<boolean>;
  /**
   * Run an agent against a listing with a goal. Returns the runId (the server streams run.* frames keyed
   * by it), or null on failure. The real paid search + inference happen server-side.
   */
  runListing: (
    listingId: string,
    input: string,
    buyer?: MarketSeller,
  ) => Promise<string | null>;
  /** Polling fallback: fetch a run by id and merge it into the runs map. Returns the run, or null. */
  fetchRun: (runId: string) => Promise<LiveRun | null>;
}

// ---- Pure helpers ------------------------------------------------------------------------------

/** Insert-or-replace a listing by id (newest first when inserting). Idempotent. */
function upsertListing(
  list: MarketListing[],
  listing: MarketListing,
): MarketListing[] {
  const idx = list.findIndex((l) => l.id === listing.id);
  if (idx === -1) return [listing, ...list];
  const next = list.slice();
  next[idx] = listing;
  return next;
}

/** Prepend an activity event unless its id is already present. Caps the kept log so it can't grow forever. */
function addActivity(
  log: ActivityEvent[],
  event: ActivityEvent,
  cap = 40,
): ActivityEvent[] {
  if (log.some((e) => e.id === event.id)) return log;
  return [event, ...log].slice(0, cap);
}

/**
 * Existing clients receive `listing.acquired` WITHOUT an ActivityEvent (only the listing + sale). To keep
 * their ticker live, synthesize the exact event the server's store logged -- same id (sale.id) so it
 * dedupes against the authoritative `hello`/REST activity a reconnect would bring.
 */
function activityFromAcquire(listing: MarketListing, sale: Sale): ActivityEvent {
  return {
    id: sale.id,
    kind: "acquired",
    listingId: listing.id,
    listingName: listing.name,
    actor: sale.buyer,
    at: sale.at,
  };
}

/** Likewise synthesize the "listed" beat from a `listing.created` frame for already-connected clients. */
function activityFromCreate(listing: MarketListing): ActivityEvent {
  return {
    id: `listed-${listing.id}`,
    kind: "listed",
    listingId: listing.id,
    listingName: listing.name,
    actor: listing.seller ?? { kind: "human", name: "Someone" },
    at: listing.createdAt ?? listing.acquiredCount ?? 0,
  };
}

/** Append a step to a run unless an identical (kind+at) step is already present -- idempotent merge. */
function addStep(steps: RunStepWire[], step: RunStepWire): RunStepWire[] {
  if (steps.some((s) => s.kind === step.kind && s.at === step.at)) return steps;
  return [...steps, step];
}

// ---- The hook ----------------------------------------------------------------------------------

export function useMarketplace(): UseMarketplaceResult {
  // Seed immediately so the grid is never blank; live data replaces it on hello/REST.
  const [listings, setListings] = useState<MarketListing[]>(MARKET_LISTINGS);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [status, setStatus] = useState<MarketStatus>("connecting");
  const [wallet, setWallet] = useState<WalletWire | null>(null);
  const [runs, setRuns] = useState<Record<string, LiveRun>>({});

  // Whether the live service has ever answered. Until it does, we're showing the seed and must not let a
  // failed fetch overwrite good data with the seed again.
  const gotLiveRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // StrictMode (React 19 dev) double-mounts effects; this guards against acting on a torn-down instance.
  const aliveRef = useRef(true);

  // Idempotent run-frame reducers, shared by the WS stream and the GET poll fallback.
  const mergeRunStarted = useCallback(
    (runId: string, listingId: string, listingName: string, input?: string) => {
      setRuns((prev) => {
        const existing = prev[runId];
        return {
          ...prev,
          [runId]: {
            id: runId,
            listingId,
            listingName,
            input: input ?? existing?.input,
            status: existing?.status ?? "running",
            steps: existing?.steps ?? [],
            result: existing?.result,
            citations: existing?.citations,
            costMinor: existing?.costMinor,
            sellerEarnedMinor: existing?.sellerEarnedMinor,
            errorCode: existing?.errorCode,
          },
        };
      });
    },
    [],
  );

  const mergeRunStep = useCallback((runId: string, step: RunStepWire) => {
    setRuns((prev) => {
      const existing = prev[runId] ?? {
        id: runId,
        listingId: "",
        listingName: "",
        status: "running" as RunStatus,
        steps: [] as RunStepWire[],
      };
      return {
        ...prev,
        [runId]: { ...existing, steps: addStep(existing.steps, step) },
      };
    });
  }, []);

  const mergeRunDone = useCallback(
    (
      runId: string,
      patch: Partial<LiveRun> & { status?: RunStatus },
    ) => {
      setRuns((prev) => {
        const existing = prev[runId] ?? {
          id: runId,
          listingId: "",
          listingName: "",
          status: "running" as RunStatus,
          steps: [] as RunStepWire[],
        };
        return {
          ...prev,
          [runId]: {
            ...existing,
            ...patch,
            status: patch.status ?? (patch.errorCode ? "error" : "done"),
          },
        };
      });
    },
    [],
  );

  // REST bootstrap -- fast first paint before the socket completes its handshake. Wallet is best-effort:
  // if /api/wallet 404s (older server), it just stays null and the WS hello/wallet.status will fill it.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [lRes, aRes, wRes] = await Promise.all([
          fetch(`${BASE}/api/listings`),
          fetch(`${BASE}/api/activity`),
          fetch(`${BASE}/api/wallet`).catch(() => null),
        ]);
        if (cancelled) return;
        if (lRes.ok) {
          const data = (await lRes.json()) as { listings: MarketListing[] };
          if (!cancelled && Array.isArray(data.listings)) {
            gotLiveRef.current = true;
            setListings(data.listings);
          }
        }
        if (aRes.ok) {
          const data = (await aRes.json()) as { activity: ActivityEvent[] };
          if (!cancelled && Array.isArray(data.activity))
            setActivity(data.activity);
        }
        if (wRes && wRes.ok) {
          const data = (await wRes.json()) as { wallet: WalletWire };
          if (!cancelled && data.wallet) setWallet(data.wallet);
        }
      } catch {
        // Service unreachable -> stay on the seed. The WS effect will mark status "offline".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // WebSocket real-time feed with a light reconnect loop (resilient during a live demo).
  useEffect(() => {
    aliveRef.current = true;

    const connect = () => {
      if (!aliveRef.current) return;
      let socket: WebSocket;
      try {
        socket = new WebSocket(WS_URL);
      } catch {
        setStatus("offline");
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        if (!aliveRef.current) return;
        setStatus("live");
      };

      socket.onmessage = (ev) => {
        if (!aliveRef.current) return;
        let frame: WsFrame;
        try {
          frame = JSON.parse(ev.data as string) as WsFrame;
        } catch {
          return; // ignore unparseable frames
        }
        switch (frame.type) {
          case "hello":
            gotLiveRef.current = true;
            if (Array.isArray(frame.listings)) setListings(frame.listings);
            if (Array.isArray(frame.activity)) setActivity(frame.activity);
            if (frame.wallet) setWallet(frame.wallet);
            break;
          case "listing.created":
            setListings((prev) => upsertListing(prev, frame.listing));
            setActivity((prev) =>
              addActivity(prev, activityFromCreate(frame.listing)),
            );
            break;
          case "listing.acquired":
            setListings((prev) => upsertListing(prev, frame.listing));
            setActivity((prev) =>
              addActivity(prev, activityFromAcquire(frame.listing, frame.sale)),
            );
            break;
          case "run.started":
            mergeRunStarted(
              frame.runId,
              frame.listingId,
              frame.listingName,
              frame.input,
            );
            break;
          case "run.step": {
            // Rebuild the nested RunStep from the flattened frame fields, so the live stream and the
            // GET /api/runs/:id poll (which returns nested steps) feed the same idempotent reducer.
            const step: RunStepWire = {
              kind: frame.kind,
              at: frame.at,
              text: frame.text,
              phase: frame.phase,
              amount: frame.amount,
              asset: frame.asset,
              network: frame.network,
              payTo: frame.payTo,
              txRef: frame.txRef,
            };
            mergeRunStep(frame.runId, step);
            break;
          }
          case "run.done":
            mergeRunDone(frame.runId, {
              result: frame.result,
              citations: frame.citations,
              costMinor: frame.costMinor,
              sellerEarnedMinor: frame.sellerEarnedMinor,
              status: frame.status,
              errorCode: frame.errorCode,
            });
            break;
          case "run.error":
            mergeRunDone(frame.runId, {
              status: "error",
              errorCode: frame.code,
            });
            break;
          case "wallet.status":
            if (frame.wallet) setWallet(frame.wallet);
            break;
        }
      };

      socket.onerror = () => {
        // Surface offline only if we have no live data yet; otherwise keep showing what we have.
        if (!gotLiveRef.current) setStatus("offline");
      };

      socket.onclose = () => {
        if (!aliveRef.current) return;
        setStatus("offline");
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (!aliveRef.current || reconnectRef.current) return;
      reconnectRef.current = setTimeout(() => {
        reconnectRef.current = null;
        connect();
      }, 2500);
    };

    connect();

    return () => {
      aliveRef.current = false;
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      const s = socketRef.current;
      socketRef.current = null;
      if (s && (s.readyState === s.OPEN || s.readyState === s.CONNECTING)) {
        s.close();
      }
    };
    // mergeRun* are stable (useCallback []), so this still runs exactly once per mount.
  }, [mergeRunStarted, mergeRunStep, mergeRunDone]);

  const createListing = useCallback(
    async (input: NewListingInput): Promise<MarketListing | null> => {
      try {
        const res = await fetch(`${BASE}/api/listings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { listing: MarketListing };
        // Optimistic apply; the WS echo will converge by id (upsert is idempotent). Default the glow
        // from category if the server somehow omitted it, so the card colour is always right.
        const listing: MarketListing = {
          ...data.listing,
          glow: data.listing.glow ?? CATEGORY_GLOW[data.listing.category],
        };
        setListings((prev) => upsertListing(prev, listing));
        setActivity((prev) => addActivity(prev, activityFromCreate(listing)));
        return listing;
      } catch {
        return null;
      }
    },
    [],
  );

  const acquire = useCallback(
    async (id: string, buyer?: MarketSeller): Promise<boolean> => {
      try {
        const res = await fetch(`${BASE}/api/listings/${id}/acquire`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buyer ? { buyer } : {}),
        });
        if (!res.ok) return false;
        const data = (await res.json()) as {
          listing: MarketListing;
          sale: Sale;
        };
        // Optimistic apply; WS echo converges (acquiredCount comes from the authoritative listing, not ++).
        setListings((prev) => upsertListing(prev, data.listing));
        setActivity((prev) =>
          addActivity(prev, activityFromAcquire(data.listing, data.sale)),
        );
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const runListing = useCallback(
    async (
      listingId: string,
      input: string,
      buyer?: MarketSeller,
    ): Promise<string | null> => {
      try {
        const res = await fetch(`${BASE}/api/run`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buyer ? { listingId, input, buyer } : { listingId, input }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { runId: string };
        if (!data.runId) return null;
        // Seed a placeholder so a watcher can switch to the live run view immediately, even before the
        // run.started frame echoes back. mergeRunStarted is idempotent, so the echo just fills in details.
        const known = listings.find((l) => l.id === listingId);
        mergeRunStarted(data.runId, listingId, known?.name ?? "", input);
        return data.runId;
      } catch {
        return null;
      }
    },
    [listings, mergeRunStarted],
  );

  const fetchRun = useCallback(
    async (runId: string): Promise<LiveRun | null> => {
      try {
        const res = await fetch(`${BASE}/api/runs/${runId}`);
        if (!res.ok) return null;
        const data = (await res.json()) as { run: RunRecordWire };
        const run = data.run;
        if (!run || !run.id) return null;
        // Merge the authoritative record in wholesale -- it is the superset, and our by-id store makes
        // this converge with any frames that already arrived.
        setRuns((prev) => ({
          ...prev,
          [run.id]: {
            id: run.id,
            listingId: run.listingId,
            listingName: run.listingName,
            input: run.input,
            status: run.status,
            steps: Array.isArray(run.steps) ? run.steps : [],
            result: run.result,
            citations: run.citations,
            costMinor: run.costMinor,
            sellerEarnedMinor: run.sellerEarnedMinor,
            errorCode: run.errorCode,
          },
        }));
        return run;
      } catch {
        return null;
      }
    },
    [],
  );

  return {
    listings,
    activity,
    status,
    online: status === "live",
    wallet,
    runs,
    createListing,
    acquire,
    runListing,
    fetchRun,
  };
}
