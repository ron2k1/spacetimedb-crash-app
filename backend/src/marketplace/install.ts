// Install-by-copy: the marketplace "installs" an item by copying its bundled folder
// into the workspace (skills/<id> or plugins/<id>). Every destination is jail-checked
// through assertInsideWorkspace before any write, and each dir/file emits one
// file.activity so the renderer's File Activity panel sees the install happen live.
import fs from 'node:fs';
import path from 'node:path';
import type { MarketplaceKind } from '@crash/protocol';
import { assertInsideWorkspace, type Workspace } from '../workspace/paths.js';
import type { ActivityEmitter } from '../workspace/activity.js';
import { findItem } from './catalog.js';

export interface InstallResult {
  kind: MarketplaceKind;
  itemId: string;
  path: string; // workspace-relative destination dir, POSIX
}

export function installItem(
  ws: Workspace,
  kind: MarketplaceKind,
  itemId: string,
  activity?: ActivityEmitter,
): InstallResult {
  const item = findItem(kind, itemId);
  if (!item) throw new Error('catalog_item_not_found');
  const destRel = path.posix.join(kind === 'skill' ? 'skills' : 'plugins', itemId);
  const destAbs = assertInsideWorkspace(ws, destRel); // throws workspace_jail_violation if escaped
  copyTree(item.dir, destAbs, activity);
  return { kind, itemId, path: destRel };
}

function copyTree(srcDir: string, destDir: string, activity?: ActivityEmitter): void {
  fs.mkdirSync(destDir, { recursive: true });
  activity?.emit('mkdir', destDir);
  for (const d of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const s = path.join(srcDir, d.name);
    const t = path.join(destDir, d.name);
    if (d.isDirectory()) {
      copyTree(s, t, activity);
    } else if (d.isFile()) {
      const buf = fs.readFileSync(s);
      fs.writeFileSync(t, buf);
      activity?.emit('create', t, buf.byteLength);
    }
  }
}
