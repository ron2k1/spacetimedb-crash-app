// The bundled marketplace catalog: a tiny, read-only set of curated skills + plugins
// that ship with the engine. Install copies an item's folder into the workspace.
// CATALOG_ROOT resolves to backend/catalog from BOTH src (vitest) and dist (runtime):
// this file lives at <src|dist>/marketplace, and ../../catalog hops up to backend/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MarketplaceKind } from '@crash/protocol';

export interface CatalogItem {
  id: string;
  name: string;
  description: string;
  dir: string; // absolute path to the bundled source folder
}

// Resolve the catalog root across all three runtime contexts:
//   1. Packaged single-exe (Tauri): the Rust shell ships backend/catalog as a bundled
//      resource and sets CRASH_CATALOG_ROOT to its on-disk path before spawning the engine.
//   2. Dev / vitest (ESM): import.meta.url is a real file URL -> resolve relative to this
//      module (<src|dist>/marketplace -> backend/catalog).
//   3. esbuild CJS bundle without the env set: import.meta.url is empty, so guard the
//      fileURLToPath call (it would throw) and fall back to <cwd>/catalog.
function resolveCatalogRoot(): string {
  const fromEnv = process.env.CRASH_CATALOG_ROOT;
  if (fromEnv) return path.resolve(fromEnv);
  const metaUrl = import.meta.url;
  if (typeof metaUrl === 'string' && metaUrl.length > 0) {
    return path.resolve(path.dirname(fileURLToPath(metaUrl)), '..', '..', 'catalog');
  }
  return path.resolve(process.cwd(), 'catalog');
}
const CATALOG_ROOT = resolveCatalogRoot();

export function loadCatalog(kind: MarketplaceKind): CatalogItem[] {
  const indexPath = path.join(CATALOG_ROOT, `${kind}s.json`);
  let index: Array<{ id: string; name: string; description: string }>;
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch {
    return [];
  }
  return index.map((it) => ({ ...it, dir: path.join(CATALOG_ROOT, `${kind}s`, it.id) }));
}

export function findItem(kind: MarketplaceKind, itemId: string): CatalogItem | null {
  return loadCatalog(kind).find((it) => it.id === itemId) ?? null;
}
