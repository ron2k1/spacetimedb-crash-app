import { existsSync, writeFileSync, statSync } from 'node:fs';
import { assertWritable } from '../workspace/paths.js';

export interface FileActivity { op: 'create' | 'write'; path: string; bytes: number; seq: number }

export type FsResult =
  | { ok: true }
  | { ok: false; code: 'permission_denied'; retryable: false };

let seq = 0;

/** Write `contents` to `target`, gated by the realpath jail. Emits file.activity with a
 *  workspace-relative path (never absolute -- no home-dir leak). */
export function writeToGranted(args: {
  grantedRoots: string[];
  target: string;
  contents: string;
  relativeTo?: string; // for the activity path display
  emit: (a: FileActivity) => void;
}): FsResult {
  try {
    assertWritable(args.grantedRoots, args.target);
  } catch {
    return { ok: false, code: 'permission_denied', retryable: false };
  }
  const existed = existsSync(args.target);
  writeFileSync(args.target, args.contents);
  const bytes = statSync(args.target).size;
  // Display path: basename only if no relativeTo given (never leak an absolute path).
  const path = args.relativeTo ? args.target.slice(args.relativeTo.length + 1) : args.target.split(/[\\/]/).pop()!;
  args.emit({ op: existed ? 'write' : 'create', path, bytes, seq: seq++ });
  return { ok: true };
}
