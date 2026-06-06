// The initial tree the File Activity panel renders on connect (folder.snapshot).
// SECURITY: only the VISIBLE roots are walked. .runtime/ is never included — the
// socket token lives there. Paths are workspace-relative + POSIX. Depth-bounded.
import fs from 'node:fs';
import path from 'node:path';
import type { Workspace } from './paths.js';

export interface FolderEntry {
  path: string;
  kind: 'file' | 'dir';
  bytes?: number;
}

const VISIBLE_ROOTS = ['docs', 'skills', 'plugins'] as const;
const MAX_DEPTH = 6;

export function snapshotWorkspace(ws: Workspace): FolderEntry[] {
  const out: FolderEntry[] = [];
  // top-level CLAUDE.md, if present
  try {
    const st = fs.statSync(ws.claudeMd);
    out.push({ path: 'CLAUDE.md', kind: 'file', bytes: st.size });
  } catch {
    /* fine */
  }
  for (const rootName of VISIBLE_ROOTS) {
    walk(path.join(ws.root, rootName), rootName, 0, out);
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function walk(absDir: string, relDir: string, depth: number, out: FolderEntry[]): void {
  if (depth > MAX_DEPTH) return;
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return; // root doesn't exist yet — skip
  }
  out.push({ path: relDir.split(path.sep).join('/'), kind: 'dir' });
  for (const d of dirents) {
    const childAbs = path.join(absDir, d.name);
    const childRel = `${relDir}/${d.name}`.split(path.sep).join('/');
    if (d.isDirectory()) {
      walk(childAbs, childRel, depth + 1, out);
    } else if (d.isFile()) {
      let bytes: number | undefined;
      try {
        bytes = fs.statSync(childAbs).size;
      } catch {
        /* ignore */
      }
      out.push({ path: childRel, kind: 'file', bytes });
    }
  }
}
