// One renderer connection. Owns the seq counter + sessionId, validates EVERY frame
// against the frozen contract (a bad outbound frame is replaced by a synthetic error,
// never shipped), and routes inbound renderer messages to the orchestrator.
// Transport-agnostic: it takes a `send(raw)` sink, so it is unit-testable with no socket.
import {
  EngineToRendererSchema,
  RendererToEngineSchema,
  makeMessage,
  PROTOCOL_VERSION,
  type EventType,
  type CatalogListing,
} from '@crash/protocol';
import path from 'node:path';
import { Orchestrator } from '../agent/orchestrator.js';
import type { AgentProvider } from '../agent/provider.js';
import type { Workspace } from '../workspace/paths.js';
import { makeActivityEmitter, type ActivityEmitter } from '../workspace/activity.js';
import { snapshotWorkspace } from '../workspace/snapshot.js';
import { installItem } from '../marketplace/install.js';
import { detectAuth, startProviderLogin } from '../agent/auth.js';
import { purchase } from '../payments/x402.js';
import { CapLedger } from '../payments/caps.js';
import { GrantStore } from '../workspace/grants.js';
import { Keystore } from '../secrets/keystore.js';
import { loadAgents } from '../agent/agents.js';
import { toListing } from '../marketplace/listings.js';
import { BUILTIN_AGENT_CATALOG } from '../marketplace/agentCatalog.js';
import { makePaidFetch as createPaidFetch, type PaidFetchResult } from '../payments/buyer.js';
import { runPaidSearch } from '../connectors/paidSearch.js';
import { runSearch, type SearchHit, type ToolEvent } from '../connectors/search.js';
import type { PaymentEvent } from '../payments/x402.js';
import {
  RESEARCH_AGENT_ID,
  RESEARCH_COST_MINOR,
  BASE_MAINNET,
  TAVILY_BASE_URL,
  RESEARCH_CANNED_HITS,
  isResearchAgent,
  briefFromHits,
  citationsFromHits,
} from './research.js';

export interface SessionOptions {
  sessionId: string;
  provider: AgentProvider;
  workspace: Workspace;
  engineVersion: string;
  send: (raw: string) => void;
  /** Per-agent spend caps in USDC minor units. Empty/omitted => no agent may spend
   *  (canSpend() denies an unconfigured agent). Seeded by the host for a funded demo. */
  caps?: Record<string, number>;
  /** Display-only starting wallet balance in USDC minor units (default 0). */
  walletBalanceMinor?: number;
  /** Tavily x402 endpoint URL (non-secret; env CRASH_TAVILY_X402_URL). Absent/empty => tier-3 fallback. */
  tavilyX402Url?: string;
  /** x402 resource URL the marketplace.purchase buyer round-trips (env CRASH_X402_SELLER_URL). */
  sellerUrl?: string;
  /** Test seam: the x402 buyer fetch used by BOTH the paid research path and marketplace.purchase.
   *  Defaults to the real keystore-late-binding buyer (createPaidFetch). A test injects a fake that
   *  resolves a deterministic settled/failed payment -- the SAME code path a funded x402.wallet key
   *  exercises for real, with no network and no chain. */
  paidFetch?: (url: string, init?: RequestInit) => Promise<PaidFetchResult>;
}

export class Session {
  private seq = 0;
  private readonly orch: Orchestrator;
  private readonly activity: ActivityEmitter;
  private readonly grants: GrantStore;
  private readonly caps: CapLedger;
  private readonly keystore: Keystore;
  private readonly walletBalanceMinor: number;
  private readonly catalog: CatalogListing[];
  private readonly tavilyX402Url?: string;
  private readonly sellerUrl?: string;
  private readonly paidFetch: (url: string, init?: RequestInit) => Promise<PaidFetchResult>;

  get id(): string {
    return this.opts.sessionId;
  }

  constructor(private readonly opts: SessionOptions) {
    // Build the activity emitter FIRST: it turns the engine's real workspace writes
    // into file.activity frames. The orchestrator (skill saves) and the marketplace
    // install path both share this single emitter.
    const activity = makeActivityEmitter(opts.workspace, (op, path, bytes, seq) =>
      this.emit('file.activity', { op, path, ...(bytes !== undefined ? { bytes } : {}), seq }),
    );
    this.orch = new Orchestrator({
      provider: opts.provider,
      workspace: opts.workspace,
      emit: (type, payload) => this.emit(type, payload),
      activity,
    });
    this.activity = activity; // stored for the marketplace install case
    this.grants = new GrantStore(path.join(opts.workspace.runtimeDir, 'grants.json'));
    this.caps = new CapLedger(opts.caps ?? {});
    this.keystore = new Keystore(path.join(opts.workspace.runtimeDir, 'keys.json'));
    this.walletBalanceMinor = opts.walletBalanceMinor ?? 0;
    this.tavilyX402Url = opts.tavilyX402Url;
    this.sellerUrl = opts.sellerUrl;
    // Default to the real buyer, which late-binds the wallet key at call time (walletKey()): drop a
    // funded x402.wallet key and the SAME buyer signs a real Base-mainnet USDC transfer, no code change.
    this.paidFetch = opts.paidFetch ?? createPaidFetch({ walletKeyProvider: () => this.walletKey() });
    this.catalog = this.loadedListings();
  }

  /** Send the authoritative session.ready (engine confirms the live provider). */
  ready(): void {
    this.emit('session.ready', {
      sessionId: this.opts.sessionId,
      protocolVersion: PROTOCOL_VERSION,
      engineVersion: this.opts.engineVersion,
      provider: this.opts.provider.id,
    });
    // The initial tree the File Activity panel renders on connect.
    this.emit('folder.snapshot', { entries: snapshotWorkspace(this.opts.workspace) });
    // The Browse grid's initial contents (builtin agents + any the user has published).
    this.emit('marketplace.catalog', { listings: this.catalog });
    // The wallet badge's initial face. Without this the chip reads "-- USDC" until the first payment
    // settles; emitting up front shows the seeded spending balance + caps the moment the app connects.
    this.emitWalletStatus();
  }

  /** Probe each provider's install + auth state and ship one auth.status frame. The
   *  `active` field is the provider the engine resolved for this session (display only). */
  private async emitAuthStatus(): Promise<void> {
    const providers = await detectAuth();
    this.emit('auth.status', { providers, active: this.opts.provider.id });
  }

  /** Builtin agents + the user's published agents, projected to wire listings. */
  private loadedListings(): CatalogListing[] {
    const userAgents = loadAgents(this.opts.workspace.root).map((m) => toListing(m, 'My Agents'));
    return [...BUILTIN_AGENT_CATALOG, ...userAgents];
  }

  private resolveListing(listingId: string): CatalogListing | undefined {
    return this.catalog.find((l) => l.id === listingId);
  }

  private emitWalletStatus(): void {
    const caps = this.caps.snapshot();
    const spent = caps.reduce((a, c) => a + c.spentMinor, 0);
    this.emit('wallet.status', { balanceMinor: Math.max(0, this.walletBalanceMinor - spent), caps });
  }

  /** The wallet private key for x402 signing. Primary source is the engine keystore (the
   *  Connections panel / a gitignored keys.json, 0o600); falls back to CRASH_X402_WALLET for
   *  headless engine runs. Read LATE (at call time) so dropping the key in flips to real
   *  settlement with zero code change. undefined => the buyer fails closed at signing. The value
   *  is returned ONLY to the buyer's signer -- it never crosses the wire and is never logged. */
  private walletKey(): string | undefined {
    return this.keystore.get('x402.wallet') ?? process.env.CRASH_X402_WALLET;
  }

  /** The paid-fetch thunk purchase() calls AFTER the cap gate passes. It builds the real x402
   *  buyer (which late-binds the wallet key) and round-trips the configured seller URL. With no
   *  wallet it fails closed at signing; with no seller URL it fails closed before the call. It
   *  NEVER fabricates a settlement (purchase maps a throw to payment_failed). */
  private makePaidFetch(_listingId: string) {
    const buyer = this.paidFetch;
    const sellerUrl = this.sellerUrl;
    return async (): Promise<{ ok: boolean; headers: { get: (k: string) => string | null } }> => {
      if (!sellerUrl) throw new Error('seller_url_not_configured');
      const r = await buyer(sellerUrl, { method: 'GET' });
      return { ok: r.ok, headers: r.headers };
    };
  }

  /** Run the research agent: a degradation ladder that fuses a Tavily search with an x402
   *  micropayment. Tier 1/2 (a paid endpoint is configured) pays Tavily THROUGH the x402 buyer --
   *  one round-trip is both the USDC payment and the search; the buyer fails closed at signing if
   *  no wallet (build-now/fund-later), and a canned brief keeps the demo beat. Tier 3 (no paid
   *  endpoint) falls back to a plain Bearer Tavily search if a key exists, else the canned brief. */
  private async runResearch(payload: { requestId: string; text: string; agentId?: string }): Promise<void> {
    const agentId = payload.agentId ?? RESEARCH_AGENT_ID;
    const finalize = (hits: SearchHit[]) => {
      this.emit('result.final', {
        requestId: payload.requestId,
        answer: briefFromHits(payload.text, hits),
        citations: citationsFromHits(hits),
      });
      // Reflect any USDC just spent on the paid path so the wallet badge ticks DOWN per real search.
      // Harmless on the tier-3 / fail-closed paths (no spend recorded -> balance unchanged), and it
      // keeps the badge fresh after every run.
      this.emitWalletStatus();
    };

    // Tier 3: no paid endpoint -> plain Bearer search if a Tavily key exists, else canned brief.
    if (!this.tavilyX402Url) {
      const tavilyKey = this.keystore.get('tavily');
      if (tavilyKey) {
        const r = await runSearch({
          agentId,
          query: payload.text,
          apiKey: tavilyKey,
          baseUrl: TAVILY_BASE_URL,
          emit: (e: ToolEvent) => this.emit('tool.activity', { ...e }),
          canned: RESEARCH_CANNED_HITS,
        });
        return finalize(r.results);
      }
      this.emit('tool.activity', { agentId, tool: 'search', phase: 'ok' });
      return finalize(RESEARCH_CANNED_HITS);
    }

    // Tier 1/2: paid path. The shared buyer fails closed at signing if no wallet key is present.
    const r = await runPaidSearch({
      agentId,
      query: payload.text,
      endpoint: this.tavilyX402Url,
      paidFetch: this.paidFetch,
      ledger: {
        canSpend: (m: number) => this.caps.canSpend(agentId, m),
        record: (m: number) => this.caps.record(agentId, m),
      },
      amountMinor: RESEARCH_COST_MINOR,
      network: BASE_MAINNET,
      tavilyKey: this.keystore.get('tavily') ?? undefined,
      emit: (e: ToolEvent | PaymentEvent) => {
        if ('tool' in e) this.emit('tool.activity', { ...e });
        else this.emit('payment.activity', { ...e });
      },
      canned: RESEARCH_CANNED_HITS,
    });
    return finalize(r.results);
  }

  private emit(type: string, payload: Record<string, unknown>): void {
    const msg = makeMessage(type as EventType, this.opts.sessionId, this.seq++, payload);
    const result = EngineToRendererSchema.safeParse(msg);
    if (!result.success) {
      const err = makeMessage('error', this.opts.sessionId, this.seq++, {
        code: 'engine_bad_frame',
        retryable: false,
      });
      this.opts.send(JSON.stringify(err));
      return;
    }
    // Ship the PARSED+STRIPPED frame, never the raw msg: zod object schemas drop
    // unknown keys, so emitting result.data makes the frozen contract a genuine
    // EGRESS FILTER -- no accidental extra field can ever ride out on a
    // security-critical frame, even if a future call site over-supplies a payload.
    this.opts.send(JSON.stringify(result.data));
  }

  async handleRaw(raw: string): Promise<void> {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      this.emit('error', { code: 'bad_json', retryable: false });
      return;
    }
    const parsed = RendererToEngineSchema.safeParse(data);
    if (!parsed.success) {
      this.emit('error', { code: 'bad_message', retryable: false });
      return;
    }
    const m = parsed.data;
    switch (m.type) {
      case 'request.submit':
        if (isResearchAgent(m.payload.agentId)) {
          await this.runResearch(m.payload);
        } else {
          this.orch.submit(m.payload);
        }
        break;
      case 'plan.confirm':
        void this.orch.confirmPlan(m.payload.planId);
        break;
      case 'plan.cancel':
        this.orch.cancelPlan(m.payload.planId);
        break;
      case 'skill.save.accept':
        this.orch.acceptSkillSave(m.payload.requestId, m.payload.name);
        break;
      case 'run.cancel':
        this.orch.cancelRun(m.payload.requestId);
        break;
      case 'marketplace.install': {
        try {
          const r = installItem(this.opts.workspace, m.payload.kind, m.payload.itemId, this.activity);
          this.emit('marketplace.installed', {
            installId: m.payload.installId,
            kind: r.kind,
            itemId: r.itemId,
            path: r.path,
          });
        } catch {
          this.emit('error', { code: 'install_failed', retryable: false }); // synthetic code only
        }
        break;
      }
      case 'permission.grant': {
        // Record the granted folder (the write-jail canonicalizes it lazily at write time).
        this.grants.add(m.payload.folder);
        this.emitWalletStatus();
        break;
      }
      case 'marketplace.purchase': {
        const listing = this.resolveListing(m.payload.listingId);
        if (!listing?.price) {
          this.emit('error', { code: 'connector_not_configured', retryable: false });
          break;
        }
        const result = await purchase({
          listing: { id: listing.id, amountMinor: listing.price.amountMinor, payTo: listing.price.payTo, network: 'eip155:84532' },
          ledger: this.caps,
          paidFetch: this.makePaidFetch(listing.id),
          emit: (e) => this.emit('payment.activity', { ...e }),
        });
        if (!result.ok) {
          this.emit('error', { code: result.code, retryable: result.retryable });
        } else {
          this.emitWalletStatus();
        }
        break;
      }
      case 'auth.status.query':
        void this.emitAuthStatus();
        break;
      case 'auth.login.start': {
        const r = startProviderLogin(m.payload.provider);
        this.emit('auth.login.result', {
          provider: m.payload.provider,
          launched: r.launched,
          ...(r.code ? { code: r.code } : {}),
        });
        break;
      }
      case 'confirm.response':
        // No side-effecting gates exist in the read-only 6/1 slice (Spec 9). Reserved.
        break;
      case 'hello':
        // Handshake-only; ignored mid-session.
        break;
    }
  }

  /** The transport closed/errored. Tear down any in-flight run so no headless provider
   *  CLI is left running without a consumer (a per-disconnect process + memory leak).
   *  Idempotent: the server may fire both 'close' and 'error'. */
  dispose(): void {
    this.orch.dispose();
  }
}
