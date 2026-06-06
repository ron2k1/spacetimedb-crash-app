import { createServer as createHttpServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import cors from "cors";
import express, { type Express, type Request, type Response } from "express";
import { WebSocketServer, type WebSocket } from "ws";

import { MarketStore, type MarketStoreOptions } from "./store.js";
import { RunStore, type RunStoreOptions } from "./runStore.js";
import { WalletStore, type WalletStoreOptions } from "./walletStore.js";
import { describeInference } from "./runtime/inference.js";
import { startRun, type RunFrame, type StartedRun } from "./runtime/run.js";
import { describeSearch, MARKET_NETWORK } from "./runtime/tavily.js";
import {
  AcquireInput,
  DEFAULT_SELLER,
  NewListingInput,
  RunInput,
  type ActivityEvent,
  type MarketListing,
  type Sale,
  type Wallet,
} from "./types.js";

const VERSION = "0.1.0";

export interface CreateServerOptions
  extends MarketStoreOptions,
    RunStoreOptions,
    WalletStoreOptions {
  /** Inject a pre-built store (tests reuse this); otherwise one is constructed. */
  store?: MarketStore;
  /** Inject a pre-built run store; otherwise one is constructed. */
  runs?: RunStore;
  /** Inject a pre-built wallet store; otherwise one is constructed. */
  wallet?: WalletStore;
  /**
   * Test seam: override how a run is started (tests inject fakes for inference + paidFetch so a run
   * is offline + deterministic). Defaults to the real `startRun`.
   */
  runStarter?: typeof startRun;
}

export interface CreatedServer {
  app: Express;
  httpServer: Server;
  store: MarketStore;
  runs: RunStore;
  wallet: WalletStore;
  /** Number of currently connected WebSocket clients (for tests/diagnostics). */
  clientCount(): number;
}

/** Outbound WebSocket frame shapes -- the real-time contract. */
type WsHello = {
  type: "hello";
  listings: MarketListing[];
  activity: ActivityEvent[];
  wallet: Wallet;
};
type WsListingCreated = { type: "listing.created"; listing: MarketListing };
type WsListingAcquired = {
  type: "listing.acquired";
  listingId: string;
  sale: Sale;
  listing: MarketListing;
};
type WsWalletStatus = { type: "wallet.status"; wallet: Wallet };
/** Per-run frames (started / step / done / error) emitted by the run pipeline, keyed by runId. */
type WsRunFrame = RunFrame;
type WsFrame =
  | WsHello
  | WsListingCreated
  | WsListingAcquired
  | WsWalletStatus
  | WsRunFrame;

/**
 * Build the marketplace HTTP + WebSocket service.
 *
 * Returns the Express app, the underlying http.Server (with the ws server
 * already attached on /ws), and the stores. The caller decides whether to
 * .listen() -- this keeps the module import-safe for tests.
 */
export function createServer(options: CreateServerOptions = {}): CreatedServer {
  const store = options.store ?? new MarketStore(options);
  const runs = options.runs ?? new RunStore(options);
  const wallet = options.wallet ?? new WalletStore(options);
  const runStarter = options.runStarter ?? startRun;

  const app = express();
  // Permissive CORS for the demo: the desktop shell (http://localhost:1420)
  // and any local origin must be able to call this. No credentials are used.
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, version: VERSION, listingCount: store.count() });
  });

  // Static, field-safe runtime descriptor for the frontend: which inference provider WOULD serve a
  // call right now (by env presence), the chain we present, and that the wallet is seeded. No keys.
  app.get("/api/config", (_req: Request, res: Response) => {
    res.json({
      version: VERSION,
      inference: describeInference(),
      search: describeSearch(),
      network: MARKET_NETWORK,
      walletSeeded: true,
    });
  });

  app.get("/api/wallet", (_req: Request, res: Response) => {
    res.json({ wallet: wallet.snapshot() });
  });

  app.get("/api/listings", (_req: Request, res: Response) => {
    res.json({ listings: store.list() });
  });

  app.get("/api/listings/:id", (req: Request, res: Response) => {
    const id = String(req.params.id);
    const listing = store.get(id);
    if (!listing) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ listing });
  });

  app.post("/api/listings", (req: Request, res: Response) => {
    const parsed = NewListingInput.safeParse(req.body);
    if (!parsed.success) {
      // zod issues are field-level (path + message + code) -- safe to echo.
      res.status(400).json({ error: "invalid", issues: parsed.error.issues });
      return;
    }
    const listing = store.add(parsed.data);
    res.status(201).json({ listing });
  });

  app.post("/api/listings/:id/acquire", (req: Request, res: Response) => {
    // body { buyer? } is optional; validate it if present, default otherwise.
    const parsed = AcquireInput.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid", issues: parsed.error.issues });
      return;
    }
    const buyer = parsed.data.buyer ?? DEFAULT_SELLER;
    const result = store.acquire(String(req.params.id), buyer);
    if (!result) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ listing: result.listing, sale: result.sale });
  });

  // --- Agent run: kick off async, stream over WS, answer 202 immediately ----
  app.post("/api/run", (req: Request, res: Response) => {
    const parsed = RunInput.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "invalid", issues: parsed.error.issues });
      return;
    }
    const listing = store.get(parsed.data.listingId);
    if (!listing) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    const buyer = parsed.data.buyer ?? DEFAULT_SELLER;
    // startRun mints the runId synchronously and runs the pipeline async, so we answer 202 with the
    // id immediately while the steps stream over WS. `.done` always resolves (failures are recorded
    // as a run.error frame + an 'error' run record), so the floating promise can never reject.
    const started: StartedRun = runStarter(
      { store, runs, wallet, emit: (frame: RunFrame) => broadcast(frame) },
      { listing, input: parsed.data.input, buyer },
    );
    void started.done;
    res.status(202).json({ runId: started.runId });
  });

  app.get("/api/runs/:id", (req: Request, res: Response) => {
    const run = runs.get(String(req.params.id));
    if (!run) {
      res.status(404).json({ error: "not_found" });
      return;
    }
    res.json({ run });
  });

  app.get("/api/activity", (req: Request, res: Response) => {
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) && raw > 0 ? raw : 30;
    res.json({ activity: store.activity(limit) });
  });

  // --- WebSocket real-time feed -------------------------------------------
  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const clients = new Set<WebSocket>();

  const send = (socket: WebSocket, frame: WsFrame): void => {
    // Guard each send so one dead socket cannot break the broadcast loop.
    try {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(frame));
      }
    } catch {
      // Drop a misbehaving socket silently; cleanup happens on 'close'.
      clients.delete(socket);
    }
  };

  const broadcast = (frame: WsFrame): void => {
    for (const socket of clients) send(socket, frame);
  };

  wss.on("connection", (socket: WebSocket) => {
    clients.add(socket);
    // Greet with a full snapshot so a fresh client renders immediately (now including the wallet).
    send(socket, {
      type: "hello",
      listings: store.list(),
      activity: store.activity(),
      wallet: wallet.snapshot(),
    });
    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
  });

  store.on("listing.created", (listing: MarketListing) => {
    broadcast({ type: "listing.created", listing });
  });
  store.on(
    "listing.acquired",
    (payload: { listingId: string; sale: Sale; listing: MarketListing }) => {
      broadcast({
        type: "listing.acquired",
        listingId: payload.listingId,
        sale: payload.sale,
        listing: payload.listing,
      });
    },
  );
  // Stream wallet changes (charges + credits) to every connected client.
  wallet.on("wallet.status", (snapshot: Wallet) => {
    broadcast({ type: "wallet.status", wallet: snapshot });
  });

  return {
    app,
    httpServer,
    store,
    runs,
    wallet,
    clientCount: () => clients.size,
  };
}

// --- Entrypoint: only listen when run directly, not when imported by tests --
const isMain = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === new URL(`file://${entry}`).href ||
      fileURLToPath(import.meta.url) === entry;
  } catch {
    return false;
  }
})();

if (isMain) {
  // Load marketplace-server/.env (gitignored) for a turn-key local launch -- a developer drops one
  // .env with their inference token + Tavily key and a single restart brings the whole pipeline live.
  // Gated to isMain so a test that imports createServer never picks up developer env. dotenv does NOT
  // override vars already present in the process environment, so an explicit launch-time export still
  // wins (additive, never clobbers the current live launch). The path resolves to ../.env from BOTH
  // src/server.ts (tsx dev) and dist/server.js (built) -- each sits exactly one level under pkg root.
  loadDotenv({ path: fileURLToPath(new URL("../.env", import.meta.url)) });
  const PORT = Number(process.env.PORT) || 8787;
  const { httpServer, store } = createServer();
  httpServer.listen(PORT, "0.0.0.0", () => {
    // Boot log ONLY: counts, never listing contents or request data.
    console.log(
      `marketplace-server listening on :${PORT} with ${store.count()} listings`,
    );
  });
}
