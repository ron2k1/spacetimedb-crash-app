import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";

import { SEED_LISTINGS } from "./seed.js";
import {
  DEFAULT_GLOW,
  DEFAULT_ICON,
  DEFAULT_SELLER,
  MarketListing,
  type ActivityEvent,
  type NewListingInput,
  type Sale,
  type Seller,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default on-disk persistence path (marketplace-server/data/listings.json). */
export const DEFAULT_DATA_FILE = resolve(__dirname, "..", "data", "listings.json");

/** Keep the activity feed bounded so the JSON file does not grow forever. */
const ACTIVITY_CAP = 200;

interface PersistShape {
  listings: MarketListing[];
  activity: ActivityEvent[];
}

export interface MarketStoreOptions {
  /** Override the JSON persistence path (tests pass a tmp file). */
  dataFile?: string;
}

/**
 * In-memory marketplace store, persisted to a JSON file after every mutation.
 *
 * Emits domain events so the WebSocket layer can fan changes out to connected
 * clients without the store knowing anything about sockets:
 *   - "listing.created"  payload: MarketListing
 *   - "listing.acquired" payload: { listingId, sale, listing }
 *
 * Synchronous file writes are deliberate -- at demo scale a writeFileSync per
 * mutation is simpler and avoids torn-state races, and the data is tiny.
 */
export class MarketStore extends EventEmitter {
  private listings: MarketListing[] = [];
  private activityLog: ActivityEvent[] = [];
  private readonly dataFile: string;

  constructor(options: MarketStoreOptions = {}) {
    super();
    this.dataFile = options.dataFile ?? DEFAULT_DATA_FILE;
    this.load();
  }

  /** Load from disk if present, otherwise seed and persist a fresh catalog. */
  private load(): void {
    if (existsSync(this.dataFile)) {
      try {
        const raw = readFileSync(this.dataFile, "utf8");
        const parsed = JSON.parse(raw) as Partial<PersistShape>;
        // Validate each listing; drop anything malformed rather than crash boot.
        const listings: MarketListing[] = [];
        for (const candidate of parsed.listings ?? []) {
          const result = MarketListing.safeParse(candidate);
          if (result.success) listings.push(result.data);
        }
        this.listings = listings;
        this.activityLog = Array.isArray(parsed.activity)
          ? (parsed.activity as ActivityEvent[])
          : [];
        if (this.listings.length === 0) {
          // File existed but held nothing usable -- fall back to seed.
          this.seedFresh();
        }
        return;
      } catch {
        // Corrupt file: do not throw on boot, just reseed.
        this.seedFresh();
        return;
      }
    }
    this.seedFresh();
  }

  /** Populate the in-memory catalog from SEED_LISTINGS and persist it. */
  private seedFresh(): void {
    const now = Date.now();
    this.listings = SEED_LISTINGS.map((seed, i) => ({
      ...seed,
      // Space createdAt slightly so feed ordering is stable and deterministic
      // relative to seed array order (later in array = more recent).
      createdAt: seed.createdAt ?? now + i,
    }));
    this.activityLog = [];
    this.persist();
  }

  /** Atomically write current state to the JSON file (creates dir if needed). */
  private persist(): void {
    const dir = dirname(this.dataFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const payload: PersistShape = {
      listings: this.listings,
      activity: this.activityLog,
    };
    writeFileSync(this.dataFile, JSON.stringify(payload, null, 2), "utf8");
  }

  /** Append an activity event, capping the log to the most recent ACTIVITY_CAP. */
  private pushActivity(event: ActivityEvent): void {
    this.activityLog.push(event);
    if (this.activityLog.length > ACTIVITY_CAP) {
      this.activityLog = this.activityLog.slice(-ACTIVITY_CAP);
    }
  }

  /** All listings (defensive copy so callers cannot mutate internal state). */
  list(): MarketListing[] {
    return this.listings.map((l) => ({ ...l }));
  }

  /** One listing by id, or undefined. Returns a copy. */
  get(id: string): MarketListing | undefined {
    const found = this.listings.find((l) => l.id === id);
    return found ? { ...found } : undefined;
  }

  /**
   * Create a listing from client input. Server assigns id / createdAt and
   * resets acquiredCount to 0; presentation fields default if omitted. Emits
   * "listing.created" and records a "listed" activity event.
   */
  add(input: NewListingInput): MarketListing {
    const seller = input.seller ?? DEFAULT_SELLER;
    const listing: MarketListing = {
      id: nanoid(),
      name: input.name,
      blurb: input.blurb,
      category: input.category,
      icon: input.icon ?? DEFAULT_ICON,
      glow: input.glow ?? DEFAULT_GLOW[input.category],
      price: input.price,
      tags: input.tags ?? [],
      seller,
      acquiredCount: 0,
      createdAt: Date.now(),
    };
    this.listings.push(listing);

    const event: ActivityEvent = {
      id: nanoid(),
      kind: "listed",
      listingId: listing.id,
      listingName: listing.name,
      actor: seller,
      at: listing.createdAt,
    };
    this.pushActivity(event);
    this.persist();

    this.emit("listing.created", { ...listing });
    return { ...listing };
  }

  /**
   * Record an acquisition: bumps acquiredCount, appends a Sale + an "acquired"
   * activity event, emits "listing.acquired". Returns null if the id is unknown.
   */
  acquire(
    id: string,
    buyer: Seller = DEFAULT_SELLER,
  ): { listing: MarketListing; sale: Sale } | null {
    const idx = this.listings.findIndex((l) => l.id === id);
    if (idx === -1) return null;

    const listing = this.listings[idx]!;
    listing.acquiredCount += 1;
    const now = Date.now();

    const sale: Sale = {
      id: nanoid(),
      listingId: listing.id,
      buyer,
      at: now,
    };

    const event: ActivityEvent = {
      id: nanoid(),
      kind: "acquired",
      listingId: listing.id,
      listingName: listing.name,
      actor: buyer,
      at: now,
    };
    this.pushActivity(event);
    this.persist();

    const listingCopy = { ...listing };
    this.emit("listing.acquired", {
      listingId: listing.id,
      sale,
      listing: listingCopy,
    });
    return { listing: listingCopy, sale };
  }

  /** Most-recent-first slice of the activity feed (default 30). */
  activity(limit = 30): ActivityEvent[] {
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 30;
    return this.activityLog
      .slice()
      .reverse()
      .slice(0, safeLimit)
      .map((e) => ({ ...e }));
  }

  /** Listing count (used by the health endpoint). */
  count(): number {
    return this.listings.length;
  }
}
