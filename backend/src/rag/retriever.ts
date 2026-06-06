// Local, on-device retrieval over the watched docs folder. NOTHING is uploaded; only
// the small relevant passage is later handed to the provider (Spec 5 privacy promise).
//
// This is the keyword/TF baseline retriever: zero external models, indexes incrementally
// on an old CPU, and is good enough for the 6/1 read-only slice. The Passage[] interface
// is the seam where an on-device embedding model drops in later WITHOUT touching the
// orchestrator. (Spec 5 / 19.3.)
import fs from 'node:fs';
import path from 'node:path';

export interface Passage {
  source: string; // human-facing label (basename) — never an absolute path
  text: string;
  score: number;
}

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.csv', '.json', '.log', '.rst']);

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 2);
}

function listTextFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (TEXT_EXT.has(path.extname(e.name).toLowerCase())) out.push(full);
    }
  };
  walk(dir);
  return out;
}

// Accept a target that may be a single FILE or a DIRECTORY. Pointing Crash at one file
// (via the protocol's targetPath) must read exactly that file; pointing at a folder walks
// it as before. A path that does not exist (or is not a text type) yields [] -- the caller
// then takes the honest "no files" path rather than crashing.
function listTextFilesFrom(target: string): string[] {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    return [];
  }
  if (stat.isFile()) {
    return TEXT_EXT.has(path.extname(target).toLowerCase()) ? [target] : [];
  }
  if (stat.isDirectory()) return listTextFiles(target);
  return [];
}

function splitPassages(text: string): string[] {
  return text
    .split(/\n\s*\n/) // paragraph blocks
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0);
}

export interface RetrieveOptions {
  topK?: number;
  onProgress?: (processed: number, total: number) => void;
}

// A "holistic" ask — summarize, overview, what's in here, tl;dr — is about the WHOLE
// folder, not a keyword lookup. Term-overlap scoring returns nothing for these because
// the request shares no words with the content ("summarize my notes" vs a doc about a
// plumber). For holistic asks we ground on a representative lead passage from each file
// so the flagship "summarize my notes" never dead-ends on a folder that plainly has notes.
// Leading \b only — the stems are PREFIXES (summar -> summarize/summary/summarise), so a
// trailing \b would (wrongly) demand the word END at the stem and miss "summarize".
const HOLISTIC_INTENT =
  /\b(summar|overview|tl;?dr|digest|gist|recap|what'?s? (in|on|here)|everything|all (of )?(my|the))/i;

/** Score passages by query-term frequency; return the top matches with citations. The
 *  `target` may be a single file OR a folder (see listTextFilesFrom). */
export function retrieve(target: string, query: string, opts: RetrieveOptions = {}): Passage[] {
  const topK = opts.topK ?? 3;
  const qTerms = new Set(tokenize(query));
  const files = listTextFilesFrom(target);
  const scored: Passage[] = [];
  const leads: Passage[] = []; // first substantive passage of each file (holistic fallback)

  files.forEach((file, i) => {
    opts.onProgress?.(i + 1, files.length);
    let raw = '';
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      return;
    }
    const source = path.basename(file);
    let leadTaken = false;
    for (const passage of splitPassages(raw)) {
      const terms = tokenize(passage);
      if (terms.length === 0) continue;
      if (!leadTaken) {
        leads.push({ source, text: passage, score: 0 });
        leadTaken = true;
      }
      let hits = 0;
      for (const t of terms) if (qTerms.has(t)) hits++;
      if (hits === 0) continue;
      scored.push({ source, text: passage, score: hits / Math.sqrt(terms.length) });
    }
  });

  const ranked = scored.sort((a, b) => b.score - a.score);
  // Keyword path is unchanged (including the honest empty result for a specific question
  // that matched nothing). Only a holistic, whole-folder ask falls back to lead passages.
  if (!HOLISTIC_INTENT.test(query)) return ranked.slice(0, topK);

  const merged: Passage[] = [...ranked];
  for (const lead of leads) {
    if (merged.length >= topK) break;
    if (!merged.some((p) => p.source === lead.source && p.text === lead.text)) merged.push(lead);
  }
  return merged.slice(0, topK);
}

export function fileCount(target: string): number {
  return listTextFilesFrom(target).length;
}
