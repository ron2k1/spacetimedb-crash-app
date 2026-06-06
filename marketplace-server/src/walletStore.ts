import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";

import { CapLedger } from "./runtime/caps.js";
import { RESEARCH_AGENT_ID, RESEARCH_DEMO_CAP_MINOR } from "./runtime/tavily.js";
import { LedgerEntry, Wallet, type Seller } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default on-disk persistence path (marketplace-server/data/wallet.json). */
export const DEFAULT_WALLET_FILE = resolve(__dirname, "..", "data", "wallet.json");

/** Seed balance for a fresh wallet: 5 USDC in minor units (6 decimals). */
export const SEED_BALANCE_MINOR = 5_000_000;

/** Keep the ledger bounded so the JSON file does not grow without limit. */
const LEDGER_CAP = 500;

interface WalletPersistShape {
  balanceMinor: number;
  ledger: LedgerEntry[];
  /** Per-counterparty cumulative earnings (seller name -> minor units), for the seller-earned view. */
  earnings: Record<string, number>;
}

export interface WalletStoreOptions {
  /** Override the JSON persistence path (tests pass a tmp file). */
  walletFile?: string;
}

/**
 * In-memory spend wallet for the agent runtime, persisted to JSON after every mutation -- the same
 * synchronous-write, EventEmitter posture as MarketStore (simple, torn-state-free at demo scale).
 *
 * Holds:
 *   - balanceMinor: spendable USDC (minor units). Seeded to 5 USDC.
 *   - a CapLedger seeded with an OPEN cap for the research path so the x402 required/signing beats
 *     fire (an agent with NO configured cap is denied BEFORE any payment narrative -- see caps.ts).
 *   - a bounded ledger of spend/earn entries.
 *   - per-seller cumulative earnings.
 *
 * Emits "wallet.status" with a full Wallet snapshot after any balance/ledger change so the WS layer
 * can stream it without knowing about sockets.
 */
export class WalletStore extends EventEmitter {
  private balanceMinor = SEED_BALANCE_MINOR;
  private ledgerLog: LedgerEntry[] = [];
  private earnings: Record<string, number> = {};
  private readonly walletFile: string;
  /** Public so the run pipeline can cap-gate the research path through the shared rail. */
  readonly caps: CapLedger;

  constructor(options: WalletStoreOptions = {}) {
    super();
    this.walletFile = options.walletFile ?? DEFAULT_WALLET_FILE;
    // The CapLedger is in-memory only (spend is re-gated per process); the OPEN research cap makes
    // the MISSING wallet key -- not the cap -- the fail-closed gate, so payment beats stay visible.
    this.caps = new CapLedger({ [RESEARCH_AGENT_ID]: RESEARCH_DEMO_CAP_MINOR });
    this.load();
  }

  /** Load balance/ledger/earnings from disk if present, else seed a fresh wallet and persist. */
  private load(): void {
    if (existsSync(this.walletFile)) {
      try {
        const raw = readFileSync(this.walletFile, "utf8");
        const parsed = JSON.parse(raw) as Partial<WalletPersistShape>;
        this.balanceMinor =
          typeof parsed.balanceMinor === "number" ? parsed.balanceMinor : SEED_BALANCE_MINOR;
        // Validate each ledger line; drop anything malformed rather than crash boot.
        const ledger: LedgerEntry[] = [];
        for (const candidate of parsed.ledger ?? []) {
          const result = LedgerEntry.safeParse(candidate);
          if (result.success) ledger.push(result.data);
        }
        this.ledgerLog = ledger;
        this.earnings =
          parsed.earnings && typeof parsed.earnings === "object" ? { ...parsed.earnings } : {};
        return;
      } catch {
        // Corrupt file: do not throw on boot, just reseed a fresh wallet.
        this.seedFresh();
        return;
      }
    }
    this.seedFresh();
  }

  /** Reset to the seed balance with an empty ledger and persist. */
  private seedFresh(): void {
    this.balanceMinor = SEED_BALANCE_MINOR;
    this.ledgerLog = [];
    this.earnings = {};
    this.persist();
  }

  /** Synchronously write current wallet state to JSON (creates the dir if needed). */
  private persist(): void {
    const dir = dirname(this.walletFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const payload: WalletPersistShape = {
      balanceMinor: this.balanceMinor,
      ledger: this.ledgerLog,
      earnings: this.earnings,
    };
    writeFileSync(this.walletFile, JSON.stringify(payload, null, 2), "utf8");
  }

  /** Append a ledger line, capping the log to the most recent LEDGER_CAP entries. */
  private pushLedger(entry: LedgerEntry): void {
    this.ledgerLog.push(entry);
    if (this.ledgerLog.length > LEDGER_CAP) {
      this.ledgerLog = this.ledgerLog.slice(-LEDGER_CAP);
    }
  }

  /** Full snapshot (defensive copies so callers cannot mutate internal state). */
  snapshot(): Wallet {
    return {
      balanceMinor: this.balanceMinor,
      currency: "USDC",
      caps: this.caps.snapshot(),
      ledger: this.ledgerLog.map((e) => ({ ...e })),
    };
  }

  /**
   * Deduct `amountMinor` from the balance and append a 'spend' entry. The balance is allowed to go
   * negative only in pathological cases; callers gate real spend through the CapLedger first. Emits
   * "wallet.status". Returns the updated snapshot.
   */
  chargeBuyer(amountMinor: number, counterparty: string, runId?: string): Wallet {
    this.balanceMinor -= amountMinor;
    const entry: LedgerEntry = {
      id: nanoid(),
      kind: "spend",
      counterparty,
      amountMinor,
      runId,
      at: Date.now(),
    };
    this.pushLedger(entry);
    this.persist();
    const snap = this.snapshot();
    this.emit("wallet.status", snap);
    return snap;
  }

  /**
   * Credit a seller with `amountMinor` (tracked per-seller) and append an 'earn' entry. Emits
   * "wallet.status". Returns the updated snapshot.
   */
  creditSeller(seller: Seller, amountMinor: number, runId?: string): Wallet {
    this.earnings[seller.name] = (this.earnings[seller.name] ?? 0) + amountMinor;
    const entry: LedgerEntry = {
      id: nanoid(),
      kind: "earn",
      counterparty: seller.name,
      amountMinor,
      runId,
      at: Date.now(),
    };
    this.pushLedger(entry);
    this.persist();
    const snap = this.snapshot();
    this.emit("wallet.status", snap);
    return snap;
  }

  /** Cumulative earnings for one seller name (USDC minor units). */
  earningsFor(sellerName: string): number {
    return this.earnings[sellerName] ?? 0;
  }

  /** Current spendable balance (USDC minor units). */
  balance(): number {
    return this.balanceMinor;
  }
}
