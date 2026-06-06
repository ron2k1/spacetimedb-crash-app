import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";

import { Run, type Citation, type RunStep, type Seller } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Default on-disk persistence path (marketplace-server/data/runs.json). */
export const DEFAULT_RUNS_FILE = resolve(__dirname, "..", "data", "runs.json");

/** Keep the persisted run history bounded so the JSON file does not grow forever. */
const RUNS_CAP = 200;

interface RunsPersistShape {
  runs: Run[];
}

export interface RunStoreOptions {
  /** Override the JSON persistence path (tests pass a tmp file). */
  runsFile?: string;
}

/**
 * In-memory store of agent Run records, persisted to JSON after every mutation (same posture as
 * MarketStore / WalletStore). Pure data: GET /api/runs/:id reads from here as a polling fallback
 * for any client that missed the live WS stream. Holds no secrets -- run steps are field-filtered.
 */
export class RunStore {
  private runs: Run[] = [];
  private readonly runsFile: string;

  constructor(options: RunStoreOptions = {}) {
    this.runsFile = options.runsFile ?? DEFAULT_RUNS_FILE;
    this.load();
  }

  private load(): void {
    if (existsSync(this.runsFile)) {
      try {
        const raw = readFileSync(this.runsFile, "utf8");
        const parsed = JSON.parse(raw) as Partial<RunsPersistShape>;
        const runs: Run[] = [];
        for (const candidate of parsed.runs ?? []) {
          const result = Run.safeParse(candidate);
          if (result.success) runs.push(result.data);
        }
        this.runs = runs;
        return;
      } catch {
        // Corrupt file: start empty rather than crash boot.
        this.runs = [];
      }
    }
  }

  private persist(): void {
    const dir = dirname(this.runsFile);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const payload: RunsPersistShape = { runs: this.runs };
    writeFileSync(this.runsFile, JSON.stringify(payload, null, 2), "utf8");
  }

  /** Find the live record by id (internal mutation target -- not a copy). */
  private find(id: string): Run | undefined {
    return this.runs.find((r) => r.id === id);
  }

  /** Create a fresh 'running' record, cap the history, persist, and return a copy. */
  create(args: { listingId: string; listingName: string; input: string; buyer: Seller }): Run {
    const run: Run = {
      id: nanoid(),
      listingId: args.listingId,
      listingName: args.listingName,
      input: args.input,
      buyer: args.buyer,
      status: "running",
      steps: [],
      costMinor: 0,
      sellerEarnedMinor: 0,
      startedAt: Date.now(),
    };
    this.runs.push(run);
    if (this.runs.length > RUNS_CAP) this.runs = this.runs.slice(-RUNS_CAP);
    this.persist();
    return { ...run };
  }

  /** Append a step to a live run and persist. No-op if the id is unknown. */
  appendStep(id: string, step: RunStep): void {
    const run = this.find(id);
    if (!run) return;
    run.steps.push(step);
    this.persist();
  }

  /** Mark a run done with its result/citations/costs. No-op if the id is unknown. */
  finish(
    id: string,
    args: { result: string; citations: Citation[]; costMinor: number; sellerEarnedMinor: number },
  ): void {
    const run = this.find(id);
    if (!run) return;
    run.status = "done";
    run.result = args.result;
    run.citations = args.citations;
    run.costMinor = args.costMinor;
    run.sellerEarnedMinor = args.sellerEarnedMinor;
    run.finishedAt = Date.now();
    this.persist();
  }

  /** Mark a run failed with a synthetic code. No-op if the id is unknown. */
  fail(id: string, code: string): void {
    const run = this.find(id);
    if (!run) return;
    run.status = "error";
    run.errorCode = code;
    run.finishedAt = Date.now();
    this.persist();
  }

  /** One run by id, or undefined. Returns a defensive copy. */
  get(id: string): Run | undefined {
    const found = this.find(id);
    return found ? structuredClone(found) : undefined;
  }

  /** Run count (diagnostics/tests). */
  count(): number {
    return this.runs.length;
  }
}
