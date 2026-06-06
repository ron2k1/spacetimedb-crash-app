// Makes the engine's REAL workspace writes visible to the renderer as file.activity
// events. The engine is the single source of truth — the renderer never watches the fs.
// Paths on the wire are ALWAYS workspace-relative + POSIX-separated (no absolute/home leak).
import path from 'node:path';
import type { Workspace } from './paths.js';

export type FileOp = 'create' | 'write' | 'delete' | 'mkdir';

export interface ActivityEmitter {
  emit(op: FileOp, target: string, bytes?: number): void;
}

/** Absolute-or-relative target inside the workspace -> POSIX workspace-relative string. */
export function toWorkspaceRel(ws: Workspace, target: string): string {
  const abs = path.resolve(ws.root, target);
  const rel = path.relative(ws.root, abs);
  return rel.split(path.sep).join('/');
}

/** Build an emitter that stamps a monotonic per-activity seq and POSIX-relativizes paths. */
export function makeActivityEmitter(
  ws: Workspace,
  sink: (op: FileOp, relPath: string, bytes: number | undefined, seq: number) => void,
): ActivityEmitter {
  let seq = 0;
  return {
    emit(op, target, bytes) {
      sink(op, toWorkspaceRel(ws, target), bytes, seq++);
    },
  };
}
