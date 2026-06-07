// The Crash/ workspace (the product spine, Spec 3.4) + the write-jail.
// The engine writes ONLY inside this root (skills + the runtime/ bootstrap). It never
// writes to the user's wider system. assertInsideWorkspace enforces that boundary.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { realpathSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';

export interface Workspace {
  root: string;
  docsDir: string;
  skillsDir: string;
  pluginsDir: string;
  runtimeDir: string;
  claudeMd: string;
}

export function resolveWorkspace(rootOverride?: string): Workspace {
  const root =
    rootOverride ?? process.env.CRASH_WORKSPACE ?? path.join(os.homedir(), 'Crash');
  return {
    root,
    docsDir: path.join(root, 'docs'),
    skillsDir: path.join(root, 'skills'),
    pluginsDir: path.join(root, 'plugins'),
    runtimeDir: path.join(root, '.runtime'),
    claudeMd: path.join(root, 'CLAUDE.md'),
  };
}

export function ensureWorkspace(ws: Workspace): Workspace {
  for (const dir of [ws.root, ws.docsDir, ws.skillsDir, ws.pluginsDir, ws.runtimeDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(ws.claudeMd)) {
    fs.writeFileSync(
      ws.claudeMd,
      '# Crash workspace\n\nThis folder holds your skills and the files you drop in.\nUpdates never touch it.\n',
    );
  }
  return ws;
}

// SECURITY NOTE (lexical-jail scope): this check is LEXICAL -- it resolves `..`
// and normalizes, then verifies string-ancestry under root. It does NOT call
// fs.realpathSync, so it does not defend against a pre-existing symlink/junction
// at an intermediate dir (e.g. a `skills/` reparse point planted outside root):
// the subsequent mkdir/write would follow it. This is acceptable for the
// single-user localhost desktop target (planting that symlink already requires
// local write to ~/Crash -- the very capability the bypass would grant). FUTURE
// HARDENING (tracked): realpath the root + verify destination ancestry before every
// write, and reject reparse-point components in install destinations.
/** Jail: resolve `target` and throw unless it is inside the workspace root. */
export function assertInsideWorkspace(ws: Workspace, target: string): string {
  const resolved = path.resolve(ws.root, target);
  const rootWithSep = ws.root.endsWith(path.sep) ? ws.root : ws.root + path.sep;
  if (resolved !== ws.root && !resolved.startsWith(rootWithSep)) {
    throw new Error('workspace_jail_violation');
  }
  return resolved;
}

/** Realpath the deepest existing ancestor of `p`, then re-append the non-existent tail.
 *  This canonicalizes through symlinks even when the target file does not exist yet. */
function realpathAncestor(p: string): string {
  let cur = resolve(p);
  const tail: string[] = [];
  // walk up until an existing path resolves
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const real = realpathSync(cur);
      return tail.length ? resolve(real, ...tail.reverse()) : real;
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return resolve(p); // reached the root; nothing existed
      tail.push(cur.slice(parent.length + 1));
      cur = parent;
    }
  }
}

/** True iff `child` is `ancestor` or strictly below it (after canonicalization). */
function isInside(ancestor: string, child: string): boolean {
  const rel = relative(realpathAncestor(ancestor), realpathAncestor(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/**
 * Gate a WRITE: throw 'permission_denied' unless `target` canonicalizes to a path inside
 * one of the `grantedRoots` (also canonicalized). Following symlinks defeats the
 * symlink-escape that the old lexical prefix check allowed.
 */
export function assertWritable(grantedRoots: string[], target: string): void {
  for (const root of grantedRoots) {
    if (isInside(root, target)) return;
  }
  throw new Error('permission_denied');
}
