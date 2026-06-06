# Crash Dashboard-World Implementation Plan (Rev 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Rev 5 Unity-6 connected dashboard-world for PoC Fest (Mon 2026-06-01): a hub with a mascot + three teleport portals into additive dashboard scenes (Skill Creator = live hero, Skills + Plugin marketplaces = browse + install-by-copy), with a persistent File Activity tree+log panel driven by new protocol-v2 events.

**Architecture:** Contract-first. Protocol v2 (additive events) freezes FIRST and blocks everything. Then the engine and the Unity renderer build in parallel against that contract. The world is additive scenes: a persistent **Bootstrap** scene owns the one live socket + the File Activity panel; **Hub** + the three dashboard scenes load/unload additively (additive load IS the teleport). Each room is an independent `.unity` file so parallel writers never collide on single-writer scene YAML. The engine is the single source of truth for the file view (no renderer-side fs watcher).

**Tech Stack:** TS side = pnpm workspace (`@crash/protocol` zod contract, `@crash/engine` headless Node + `ws`), vitest. Unity side = Unity 6000.4.9f1 URP, NativeWebSocket, Newtonsoft JSON, glTFast 6.19, AI Navigation 2.0.12 (NavMesh), Input System. Mascot = AI-gen (Meshy/Tripo) + Mixamo, NavMeshAgent-driven, decoupled behind a placeholder.

**Authoritative scope:** Spec Section 0 (Rev 5) + 0.7 IN list. `docs/superpowers/specs/2026-05-29-crash-abcmouse-for-ai-design.md`.

**Authorization note (supersedes the old no-commit constraint):** the operator authorized autonomous commit + push on `feat/dashboard-world` per global Rule 17. Each task commits atomically (Windows: `git commit -F`) and pushes to origin when its gate is green. Hard rails intact: no force-push, no push to `main`, never push a secret. Merging `feat/dashboard-world` -> `main` is an operator decision (offer, don't do silently).

**Contract micro-amendment (Rev 5.1, recorded here + in the spec):** Spec 0.4 named the two file-view events. Implementing the §0.2/§0.7 marketplace "install = copy into the watched folder" mechanic requires an engine-side install trigger (only the engine writes to the workspace — jail + single-source-of-truth). v2 therefore also carries a minimal `marketplace.install` (R->E) / `marketplace.installed` (E->R) pair. Still additive, still no per-vertical/per-provider branching. Four new events total; v1's 19 -> v2's 23.

---

## File Structure

**Protocol (Phase 1 — frozen contract, code-complete below):**
- Modify: `protocol/src/events.ts` — bump version, add 4 event schemas + sub-schemas, extend unions + `ALL_EVENT_TYPES`.
- Modify: `protocol/src/examples.ts` — one example per new event.
- Modify: `protocol/Protocol.cs` — bump `Version`, add 4 type strings + 4 payload classes.
- Modify (tests that hardcode the version): `frontend/r3f-shell/src/net/CrashSocket.test.ts`, `frontend/r3f-shell/src/net/boot.test.ts`, `frontend/r3f-shell/src/store/taskStore.test.ts`.
- (No change needed: `protocol/test/contract.test.ts` reads `PROTOCOL_VERSION` + `ALL_EVENT_TYPES` dynamically — adding events auto-extends it.)

**Backend Slice A — file activity + snapshot:**
- Create: `backend/src/workspace/activity.ts` — `toWorkspaceRel`, `FileOp`, `ActivityEmitter`, `makeActivityEmitter`.
- Create: `backend/src/workspace/snapshot.ts` — `FolderEntry`, `snapshotWorkspace` (visible-roots allowlist; NEVER `.runtime/`).
- Modify: `backend/src/workspace/paths.ts` — add `pluginsDir`; `ensureWorkspace` creates it.
- Modify: `backend/src/skills/store.ts` — `saveSkill` accepts optional `activity?: ActivityEmitter`, emits per fs op.
- Modify: `backend/src/agent/orchestrator.ts` — accept `activity` in deps; pass to `saveSkill`.
- Modify: `backend/src/socket/session.ts` — build the activity emitter wired to `emit('file.activity', …)`; emit `folder.snapshot` right after `session.ready`.
- Create tests: `backend/test/activity.test.ts`, `backend/test/snapshot.test.ts`.

**Backend Slice B — marketplace:**
- Create: `backend/src/marketplace/catalog.ts` — `CatalogItem`, `loadCatalog(kind)`.
- Create: `backend/src/marketplace/install.ts` — `installItem(ws, kind, itemId, activity)` (copy-by-tree, jail-checked, emits file.activity).
- Modify: `backend/src/socket/session.ts` — handle `marketplace.install`; emit `marketplace.installed`.
- Create catalog content: `backend/catalog/skills/<id>/…`, `backend/catalog/plugins/<id>/…`, `backend/catalog/skills.json`, `backend/catalog/plugins.json`.
- Create tests: `backend/test/install.test.ts`.

**Unity Slice C — scripts (namespaces: `Crash.Net`, `Crash.World`, `Crash.Mascot`, `Crash.Dashboards`):**
- Modify: `frontend/unity/Assets/Scripts/Protocol/Protocol.cs` — mirror of Phase 1 (kept identical to `protocol/Protocol.cs`).
- Modify: `frontend/unity/Assets/Scripts/Net/CrashWsClient.cs` — add `file.activity`, `folder.snapshot`, `marketplace.installed` inbound handlers + events; add `SendMarketplaceInstall`.
- Create: `Assets/Scripts/World/CrashApp.cs` — persistent app root (DontDestroyOnLoad); holds the `CrashWsClient` ref + additive scene loader.
- Create: `Assets/Scripts/World/TeleportController.cs` — additive load target + unload previous.
- Create: `Assets/Scripts/World/PortalTrigger.cs` — trigger volume → `TeleportController.GoTo(sceneName)`.
- Create: `Assets/Scripts/Mascot/MascotController.cs` — NavMeshAgent move-to-click + Animator idle/walk; replaces `FoxController`.
- Create: `Assets/Scripts/UI/FileActivityPanel.cs` — subscribes to folder.snapshot + file.activity; renders tree + scrolling log.
- Create: `Assets/Scripts/Dashboards/SkillCreatorDashboard.cs` — drives the live §4 loop (submit → plan → confirm → stream → save → re-run).
- Create: `Assets/Scripts/Dashboards/MarketplaceDashboard.cs` — lists a bundled catalog JSON; Install → `SendMarketplaceInstall`; flips card on `marketplace.installed`.
- Keep (dev harness only): `FoxController.cs`, `CrashDemoUI.cs` (unused by the new scenes; do not delete this session).

**Unity Slice C — bundled catalog mirror (read by the renderer for browse):**
- Create: `frontend/unity/Assets/StreamingAssets/catalog/skills.json`, `…/plugins.json` (copies of the backend catalog index so the renderer can browse without a round-trip; install still goes through the engine).

**Content Slice D:**
- Create: `curriculum/lessons/setup-skills-and-plugins/` — the one base lesson pack (markdown + a `lesson.json`).
- Create: backend catalog seed content (shared with Slice B): 3 starter skills, 2 starter plugins.

**Phase 3 (human-eye, Unity Editor):**
- Create scenes: `Assets/Scenes/Bootstrap.unity`, `Hub.unity`, `SkillCreator.unity`, `SkillsMarket.unity`, `PluginMarket.unity`.
- Modify: `Assets/Scenes` build settings (scene list, Bootstrap index 0).

---

## PHASE 1 — Protocol v2 (SERIAL, BLOCKING). One implementer. Land fully before Phase 2.

> Everything downstream imports this. The version bump couples the handshake (`server.ts` rejects a mismatched `hello` with 1008), so all four artifacts (events.ts, examples.ts, Protocol.cs, the R3F test fixtures) move in ONE commit, and the Unity Editor must recompile `Protocol.cs` to `Version=2` before any handshake test against a v2 engine.

### Task 1.1: Extend the canonical contract (`protocol/src/events.ts`)

**Files:**
- Modify: `protocol/src/events.ts`

- [ ] **Step 1: Bump the version.** Change line 21:

```ts
export const PROTOCOL_VERSION = 2;
```

- [ ] **Step 2: Add the file-op + folder sub-schemas** (after `ProviderSchema`, ~line 49):

```ts
/** Filesystem op the engine performed inside the workspace (file.activity). */
export const FileOpSchema = z.enum(['create', 'write', 'delete', 'mkdir']);
export type FileOp = z.infer<typeof FileOpSchema>;

/** One node in the initial folder.snapshot tree. */
export const FolderEntrySchema = z.object({
  path: z.string(), // workspace-relative, POSIX separators — NEVER absolute
  kind: z.enum(['file', 'dir']),
  bytes: z.number().int().nonnegative().optional(),
});
export type FolderEntry = z.infer<typeof FolderEntrySchema>;

/** Which marketplace catalog an item comes from. */
export const MarketplaceKindSchema = z.enum(['skill', 'plugin']);
export type MarketplaceKind = z.infer<typeof MarketplaceKindSchema>;
```

- [ ] **Step 3: Add the new Renderer->Engine schema** (after `RunCancelSchema`, ~line 93):

```ts
export const MarketplaceInstallSchema = envelope(
  'marketplace.install',
  z.object({
    installId: z.string(),
    kind: MarketplaceKindSchema,
    itemId: z.string(), // catalog item id (a slug); engine resolves it to a bundled folder
  }),
);
```

- [ ] **Step 4: Add the three new Engine->Renderer schemas** (after `SkillSavedSchema`, ~line 167):

```ts
export const FileActivitySchema = envelope(
  'file.activity',
  z.object({
    op: FileOpSchema,
    path: z.string(), // workspace-relative, POSIX — never absolute, no home-dir leak
    bytes: z.number().int().nonnegative().optional(),
    seq: z.number().int().nonnegative(), // per-activity ordinal (distinct from envelope.seq)
  }),
);
export const FolderSnapshotSchema = envelope(
  'folder.snapshot',
  z.object({ entries: z.array(FolderEntrySchema) }),
);
export const MarketplaceInstalledSchema = envelope(
  'marketplace.installed',
  z.object({
    installId: z.string(),
    kind: MarketplaceKindSchema,
    itemId: z.string(),
    path: z.string(), // workspace-relative dir the item was copied to
  }),
);
```

- [ ] **Step 5: Extend the unions** (add to the arrays at ~line 178 and ~line 187):

```ts
// add to RendererToEngineSchema discriminatedUnion array:
  MarketplaceInstallSchema,
// add to EngineToRendererSchema discriminatedUnion array:
  FileActivitySchema,
  FolderSnapshotSchema,
  MarketplaceInstalledSchema,
```

- [ ] **Step 6: Extend `ALL_EVENT_TYPES`** (insert in logical position):

```ts
  // Renderer -> Engine … after 'run.cancel':
  'marketplace.install',
  // Engine -> Renderer … after 'skill.saved':
  'file.activity',
  'folder.snapshot',
  'marketplace.installed',
```

### Task 1.2: Add examples (`protocol/src/examples.ts`)

**Files:**
- Modify: `protocol/src/examples.ts`

- [ ] **Step 1: Add one example per new event** inside the `EXAMPLES` object (the `v` const now resolves to 2 automatically):

```ts
  'marketplace.install': { v, type: 'marketplace.install', sessionId: s, seq: 12, payload: { installId: 'inst_1', kind: 'skill', itemId: 'meeting-notes' } },
  'file.activity': { v, type: 'file.activity', sessionId: s, seq: 13, payload: { op: 'create', path: 'skills/ask-my-stuff/SKILL.md', bytes: 412, seq: 0 } },
  'folder.snapshot': { v, type: 'folder.snapshot', sessionId: s, seq: 0, payload: { entries: [{ path: 'skills', kind: 'dir' }, { path: 'docs', kind: 'dir' }, { path: 'plugins', kind: 'dir' }, { path: 'CLAUDE.md', kind: 'file', bytes: 120 }] } },
  'marketplace.installed': { v, type: 'marketplace.installed', sessionId: s, seq: 14, payload: { installId: 'inst_1', kind: 'skill', itemId: 'meeting-notes', path: 'skills/meeting-notes' } },
```

### Task 1.3: Mirror into Unity (`protocol/Protocol.cs`)

**Files:**
- Modify: `protocol/Protocol.cs`

- [ ] **Step 1: Bump the version** (line 18): `public const int Version = 2;`

- [ ] **Step 2: Add the 4 type strings** to `EventTypes` (after `"run.cancel"` and after `"skill.saved"` respectively):

```csharp
            // Renderer -> Engine … after "run.cancel":
            "marketplace.install",
            // Engine -> Renderer … after "skill.saved":
            "file.activity",
            "folder.snapshot",
            "marketplace.installed",
```

- [ ] **Step 3: Add the 4 payload classes** (after `ErrorPayload`, before the closing brace):

```csharp
    // ---- v2 additions ----
    [Serializable] public class MarketplaceInstallPayload { public string installId; public string kind; public string itemId; } // kind: 'skill' | 'plugin'
    [Serializable] public class FileActivityPayload { public string op; public string path; public int bytes; public int seq; } // op: 'create'|'write'|'delete'|'mkdir'; path workspace-relative POSIX
    [Serializable] public class FolderEntry { public string path; public string kind; public int bytes; } // kind: 'file' | 'dir'
    [Serializable] public class FolderSnapshotPayload { public FolderEntry[] entries; }
    [Serializable] public class MarketplaceInstalledPayload { public string installId; public string kind; public string itemId; public string path; }
```

> Note: `FileActivityPayload.bytes` is a plain `int` (Newtonsoft leaves it 0 when the optional field is absent — acceptable; the panel treats 0/absent the same). Keep this file BYTE-IDENTICAL to `frontend/unity/Assets/Scripts/Protocol/Protocol.cs` (Slice C Task 3.x re-syncs the Unity copy).

### Task 1.4: Fix the version-coupled R3F tests

**Files:**
- Modify: `frontend/r3f-shell/src/net/CrashSocket.test.ts` (line ~82: `expect(frame.payload.protocolVersion).toBe(2)`)
- Modify: `frontend/r3f-shell/src/net/boot.test.ts` (line ~24: the "defaults when absent" assertion → `toBe(2)`)
- Modify: `frontend/r3f-shell/src/store/taskStore.test.ts` (line ~44 fixture: bump input `protocolVersion: 2` only if an assertion downstream depends on equality with the live constant; otherwise leave the input fixture as-is)

- [ ] **Step 1:** Update the two ASSERTIONS that compare against the live constant to expect `2`. Leave pure input fixtures (`protocolVersion: 1` passed as test data where no assertion checks equality-with-constant) unless the test fails.

### Task 1.5: Verify + commit Phase 1

- [ ] **Step 1: Build + test the protocol package and dependents from the repo ROOT** (pnpm-workspace rule — never per-package):

```
pnpm --filter @crash/protocol build
pnpm -r test
```
Expected: protocol contract tests green (now 23 event types; "exactly one example per event type" passes), backend tests green, R3F tests green (the two bumped assertions pass).

- [ ] **Step 2: Commit (Windows-safe).** Subject: `feat(protocol): add v2 file-view + marketplace events (bump v1->v2)`. Body explains the 4 events, the additive nature, the handshake coupling, and the Rev 5.1 micro-amendment. Push to `origin/feat/dashboard-world`.

---

## PHASE 2 — Parallel slices (after Phase 1 lands + protocol is built). 4 disjoint trees.

> Slices A and B both touch `backend/src/socket/session.ts`. To keep them collision-free, ONE backend agent owns BOTH Slice A and Slice B (sequential within that agent). The Unity agent (Slice C) and content agent (Slice D) run truly in parallel with the backend agent. Agents WRITE + self-verify only; the orchestrator commits each slice sequentially after the agent returns (no agent runs git → no git race).

### SLICE A+B — Backend (one agent owns both)

#### Task A1: Workspace-relative path + activity emitter

**Files:**
- Create: `backend/src/workspace/activity.ts`
- Test: `backend/test/activity.test.ts`

- [ ] **Step 1: Write the failing test** (`backend/test/activity.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { toWorkspaceRel, makeActivityEmitter } from '../src/workspace/activity.js';
import path from 'node:path';

const ws = { root: path.join('C:', 'Users', 'x', 'Crash') } as any;

describe('toWorkspaceRel', () => {
  it('returns a POSIX workspace-relative path for an absolute target', () => {
    const abs = path.join(ws.root, 'skills', 'foo', 'SKILL.md');
    expect(toWorkspaceRel(ws, abs)).toBe('skills/foo/SKILL.md');
  });
  it('handles an already-relative target', () => {
    expect(toWorkspaceRel(ws, path.join('skills', 'foo'))).toBe('skills/foo');
  });
});

describe('makeActivityEmitter', () => {
  it('emits POSIX-relative paths with a monotonic per-activity seq', () => {
    const calls: any[] = [];
    const em = makeActivityEmitter(ws, (op, p, bytes, seq) => calls.push({ op, p, bytes, seq }));
    em.emit('mkdir', path.join(ws.root, 'skills', 'foo'));
    em.emit('create', path.join(ws.root, 'skills', 'foo', 'SKILL.md'), 412);
    expect(calls).toEqual([
      { op: 'mkdir', p: 'skills/foo', bytes: undefined, seq: 0 },
      { op: 'create', p: 'skills/foo/SKILL.md', bytes: 412, seq: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** (`pnpm --filter @crash/engine test` → module not found).

- [ ] **Step 3: Implement `backend/src/workspace/activity.ts`:**

```ts
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
```

- [ ] **Step 4: Run the test, confirm pass.**

#### Task A2: Folder snapshot (visible-roots allowlist; jail the token out)

**Files:**
- Modify: `backend/src/workspace/paths.ts` (add `pluginsDir`)
- Create: `backend/src/workspace/snapshot.ts`
- Test: `backend/test/snapshot.test.ts`

- [ ] **Step 1: Add `pluginsDir` to `paths.ts`.** In the `Workspace` interface add `pluginsDir: string;`; in `resolveWorkspace` add `pluginsDir: path.join(root, 'plugins'),`; in `ensureWorkspace` add `ws.pluginsDir` to the mkdir loop.

- [ ] **Step 2: Write the failing test** (`backend/test/snapshot.test.ts`): create a temp workspace, write `docs/a.txt`, `skills/s/SKILL.md`, and a `.runtime/socket.json`; assert `snapshotWorkspace` returns entries under `docs`/`skills`/`plugins` and **NEVER** any path containing `.runtime`.

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveWorkspace, ensureWorkspace } from '../src/workspace/paths.js';
import { snapshotWorkspace } from '../src/workspace/snapshot.js';

let root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'crash-snap-'));
  const ws = ensureWorkspace(resolveWorkspace(root));
  fs.writeFileSync(path.join(ws.docsDir, 'a.txt'), 'hello');
  fs.mkdirSync(path.join(ws.skillsDir, 's'), { recursive: true });
  fs.writeFileSync(path.join(ws.skillsDir, 's', 'SKILL.md'), '# s');
  fs.writeFileSync(path.join(ws.runtimeDir, 'socket.json'), '{"token":"SECRET"}');
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('snapshotWorkspace', () => {
  it('lists docs/skills/plugins entries', () => {
    const entries = snapshotWorkspace(resolveWorkspace(root));
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('docs/a.txt');
    expect(paths).toContain('skills/s/SKILL.md');
  });
  it('NEVER leaks .runtime (the token lives there)', () => {
    const entries = snapshotWorkspace(resolveWorkspace(root));
    expect(entries.every((e) => !e.path.includes('.runtime'))).toBe(true);
  });
});
```

- [ ] **Step 3: Implement `backend/src/workspace/snapshot.ts`:**

```ts
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
```

- [ ] **Step 4: Run both tests, confirm pass.**

#### Task A3: Instrument `saveSkill` + thread the emitter through the orchestrator + session

**Files:**
- Modify: `backend/src/skills/store.ts`, `backend/src/agent/orchestrator.ts`, `backend/src/socket/session.ts`
- Test: extend `backend/test/*` for skill-save activity (add to an existing orchestrator/store test or a new `store-activity.test.ts`).

- [ ] **Step 1:** `saveSkill(ws, input, activity?: ActivityEmitter)` — after the `mkdirSync`, call `activity?.emit('mkdir', dirAbs)`; after each `writeFileSync`, call `activity?.emit('create', <abs file>, Buffer.byteLength(<contents>))`. Compute contents into a const first so byte length is exact.

- [ ] **Step 2:** `OrchestratorDeps` gains `activity?: ActivityEmitter`; `acceptSkillSave` passes `this.deps.activity` into `saveSkill`.

- [ ] **Step 3:** In `Session`, construct the emitter and emit `folder.snapshot` after `ready()`:

```ts
// in imports
import { makeActivityEmitter } from '../workspace/activity.js';
import { snapshotWorkspace } from '../workspace/snapshot.js';

// in the constructor, before building the orchestrator:
const activity = makeActivityEmitter(opts.workspace, (op, path, bytes, seq) =>
  this.emit('file.activity', { op, path, ...(bytes !== undefined ? { bytes } : {}), seq }),
);
this.orch = new Orchestrator({
  provider: opts.provider,
  workspace: opts.workspace,
  emit: (type, payload) => this.emit(type, payload),
  activity,
});
this.activity = activity; // store for marketplace install (Slice B)

// extend ready():
ready(): void {
  this.emit('session.ready', { /* unchanged */ });
  this.emit('folder.snapshot', { entries: snapshotWorkspace(this.opts.workspace) });
}
```

- [ ] **Step 4:** Test that accepting a skill save emits `file.activity` frames (capture via the `send` sink), with workspace-relative POSIX paths and at least one `create` for `SKILL.md`. Verify build + tests green from root.

#### Task B1: Marketplace catalog + install-by-copy

**Files:**
- Create: `backend/src/marketplace/catalog.ts`, `backend/src/marketplace/install.ts`
- Create catalog content under `backend/catalog/` (see Slice D for the seed items)
- Modify: `backend/src/socket/session.ts` (handle `marketplace.install`)
- Test: `backend/test/install.test.ts`

- [ ] **Step 1: `catalog.ts`** — resolve the bundled catalog dir relative to the package (use `fileURLToPath(import.meta.url)`, NOT `.pathname.slice(1)` — Windows). Shape:

```ts
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

const here = path.dirname(fileURLToPath(import.meta.url));
// backend/src/marketplace -> backend/catalog
const CATALOG_ROOT = path.resolve(here, '..', '..', 'catalog');

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
```

- [ ] **Step 2: `install.ts`** — copy the item tree into `skills/<id>` or `plugins/<id>`, jail-checked, emitting one `file.activity` per dir/file:

```ts
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
```

- [ ] **Step 3: Handle `marketplace.install` in `Session.handleRaw`** (new case) and emit `marketplace.installed`:

```ts
case 'marketplace.install': {
  try {
    const r = installItem(this.opts.workspace, m.payload.kind, m.payload.itemId, this.activity);
    this.emit('marketplace.installed', {
      installId: m.payload.installId, kind: r.kind, itemId: r.itemId, path: r.path,
    });
  } catch {
    this.emit('error', { code: 'install_failed', retryable: false }); // synthetic code only
  }
  break;
}
```

- [ ] **Step 4: Test `install.test.ts`** — temp workspace + a tiny temp catalog (or the real seed); call `installItem`; assert the dest tree exists, the result path is POSIX workspace-relative, and the activity sink saw a `mkdir` + at least one `create`. Assert a bogus itemId throws `catalog_item_not_found`. Build + `pnpm -r test` green.

- [ ] **Step 5: Commit the backend slice** (atomic, may be 3-4 commits: activity+snapshot; store/orchestrator/session instrumentation; marketplace; catalog content). Push.

### SLICE C — Unity scripts (parallel; one agent)

> The Unity agent writes C# only — it does NOT open the Editor (that's Phase 3) and does NOT run git. Provide each script complete; the agent must keep `Assets/Scripts/Protocol/Protocol.cs` byte-identical to `protocol/Protocol.cs` (v2).

#### Task C1: Re-sync the Unity protocol mirror

- [ ] Copy the Phase-1 `protocol/Protocol.cs` over `frontend/unity/Assets/Scripts/Protocol/Protocol.cs` verbatim (Version=2 + the 4 new payload classes + 4 type strings).

#### Task C2: Extend `CrashWsClient.cs` with the v2 events

**Files:** Modify `frontend/unity/Assets/Scripts/Net/CrashWsClient.cs`

- [ ] **Step 1:** Add UnityEvent subclasses + public UnityEvents + C# events for `FileActivityPayload`, `FolderSnapshotPayload`, `MarketplaceInstalledPayload` (mirror the existing pattern at lines 40-100):

```csharp
[Serializable] public class FileActivityEvent : UnityEvent<FileActivityPayload> { }
[Serializable] public class FolderSnapshotEvent : UnityEvent<FolderSnapshotPayload> { }
[Serializable] public class MarketplaceInstalledEvent : UnityEvent<MarketplaceInstalledPayload> { }
// … public FileActivityEvent OnFileActivityUnity = new(); etc.
// … public event Action<FileActivityPayload> OnFileActivity; etc.
```

- [ ] **Step 2:** Add three `case` blocks in `HandleFrame` (mirror lines 243-327):

```csharp
case "file.activity": {
  var p = payload != null ? payload.ToObject<FileActivityPayload>() : null;
  if (p != null) { OnFileActivity?.Invoke(p); OnFileActivityUnity.Invoke(p); }
  break;
}
case "folder.snapshot": {
  var p = payload != null ? payload.ToObject<FolderSnapshotPayload>() : null;
  if (p != null) { OnFolderSnapshot?.Invoke(p); OnFolderSnapshotUnity.Invoke(p); }
  break;
}
case "marketplace.installed": {
  var p = payload != null ? payload.ToObject<MarketplaceInstalledPayload>() : null;
  if (p != null) { OnMarketplaceInstalled?.Invoke(p); OnMarketplaceInstalledUnity.Invoke(p); }
  break;
}
```

- [ ] **Step 3:** Add the outbound method (mirror `SubmitRequest`):

```csharp
public void SendMarketplaceInstall(string installId, string kind, string itemId) {
  SendEnvelope("marketplace.install",
    new MarketplaceInstallPayload { installId = installId, kind = kind, itemId = itemId });
}
```

#### Task C3: `CrashApp.cs` — persistent app root + additive loader

**Files:** Create `Assets/Scripts/World/CrashApp.cs`

Behavior contract (implementing agent writes the body):
- `MonoBehaviour` placed in `Bootstrap.unity`. `Awake()`: `DontDestroyOnLoad(gameObject)`; enforce a singleton (`Instance`); cache the `CrashWsClient` in the same scene.
- `public CrashWsClient Client { get; }` accessor.
- On `Start()`, additively load `Hub` via `TeleportController` (so the hub appears over the persistent bootstrap).
- Holds the name of the currently-loaded dashboard scene ("" when only Hub is loaded).

Acceptance: compiles; `Instance` survives an additive scene unload; `Client` is non-null after Bootstrap loads.

#### Task C4: `TeleportController.cs` + `PortalTrigger.cs`

**Files:** Create `Assets/Scripts/World/TeleportController.cs`, `Assets/Scripts/World/PortalTrigger.cs`

`TeleportController` contract:
- `public void GoTo(string sceneName)`: if a dashboard scene is loaded, `SceneManager.UnloadSceneAsync(current)`; then `SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Additive)`; set the loaded scene active on completion so its lighting applies; update `CrashApp` current-dashboard. Guard against double-loads (ignore if a load is in flight).
- `public void ReturnToHub()`: unload the current dashboard (Hub stays loaded the whole time).

`PortalTrigger` contract:
- `[SerializeField] string targetScene;` + `OnTriggerEnter(Collider other)`: if `other` is the mascot (tag `Player`), call `TeleportController.GoTo(targetScene)`. Debounce (one fire per entry).

Acceptance: both compile; GoTo with an already-loaded target is a no-op; entering a portal volume calls GoTo once.

#### Task C5: `MascotController.cs` (NavMeshAgent-driven; placeholder-first)

**Files:** Create `Assets/Scripts/Mascot/MascotController.cs`

Contract:
- Requires `NavMeshAgent` + `Animator`. Tag `Player`.
- Click-to-move: on primary click (Input System), raycast to the NavMesh and `agent.SetDestination(hit)`.
- Animator: set a float `Speed` = `agent.velocity.magnitude` each frame; the AnimatorController blends idle<->walk on `Speed`.
- `public void PlayEmote()` (optional wave) — sets a trigger; safe no-op if the param is absent.
- Decoupling: works with ANY rigged model under it (a capsule placeholder OR the bandicoot). No hard reference to a specific mesh.

Acceptance: compiles; with a baked NavMesh + a NavMeshAgent on a capsule, clicking moves the capsule and `Speed` drives the blend tree.

#### Task C6: `FileActivityPanel.cs` (tree + log; persistent in Bootstrap)

**Files:** Create `Assets/Scripts/UI/FileActivityPanel.cs`

Contract:
- Lives on a `DontDestroyOnLoad` Canvas in Bootstrap (visible across all scenes).
- Subscribes to `CrashWsClient.OnFolderSnapshot` (seed the tree) + `OnFileActivity` (mutate the tree + append to the log).
- Tree: a scrollable list of workspace-relative paths; on a `create`/`mkdir` for a new path, add a row and briefly highlight it; on `write`, highlight the existing row; on `delete`, strike/remove it.
- Log: a scrolling text list, newest at bottom, lines like `created skills/ask-my-stuff/SKILL.md (412 bytes)` / `wrote docs/notes.md (1.2 KB)`. Cap at N lines.
- SECURITY: render only `op`/`path`/`bytes`. Never any file contents (the event carries none anyway).
- Thread-safety: events arrive on the Unity main thread (dispatched in `CrashWsClient.Update`), so direct UI mutation is safe.

Acceptance: compiles; feeding a synthetic folder.snapshot populates the tree; feeding a file.activity create adds a row + a log line.

#### Task C7: `SkillCreatorDashboard.cs` (the live hero)

**Files:** Create `Assets/Scripts/Dashboards/SkillCreatorDashboard.cs`

Contract — drive the full §4 loop via `CrashApp.Instance.Client`:
- An input field + "Create" button → `Client.SubmitRequest(reqId, text)`.
- `OnPlanProposed` → show the plan card (title, summary, steps) + Confirm/Cancel → `Client.ConfirmPlan(planId)` / `CancelPlan`.
- `OnStatus`/`OnStepStarted`/`OnStepProgress`/`OnIndexProgress` → progress UI.
- `OnAnswerPartial` → append streaming text; `OnResultFinal` → show the answer + citations.
- `OnSkillSaveOffer` → "Save as skill?" → `Client.AcceptSkillSave(reqId, name)`; `OnSkillSaved` → confirmation + the new card appears (and the File Activity panel shows the real write).
- A STOP button → `Client.CancelRun(reqId)`.
- Re-run: clicking a saved-skill card re-submits its stored goal (a fresh request.submit).

Acceptance: compiles; with the engine running, a full create→confirm→stream→save cycle completes and a real `skills/<slug>/SKILL.md` is written (proven by the File Activity panel + on disk).

#### Task C8: `MarketplaceDashboard.cs` (skills + plugins; one script, parameterized)

**Files:** Create `Assets/Scripts/Dashboards/MarketplaceDashboard.cs`

Contract:
- `[SerializeField] string kind;` ("skill" | "plugin") — one prefab per market, same script.
- On enable, read the bundled catalog index from `StreamingAssets/catalog/<kind>s.json` (browse without a round-trip).
- Render a card per item (name, description, Install button).
- Install → `Client.SendMarketplaceInstall(installId, kind, itemId)`.
- `OnMarketplaceInstalled` (matching installId) → flip the card to "Installed" (and the File Activity panel shows the copied files).

Acceptance: compiles; reading a catalog JSON renders cards; Install sends the event; the installed callback flips the card.

### SLICE D — Content (parallel; one agent — pure files, no code)

#### Task D1: Catalog seed items (shared with Slice B)

**Files:** Create under `backend/catalog/`:
- `skills.json` — index: 3 items, e.g. `meeting-notes`, `study-buddy`, `inbox-triage` (id/name/description each).
- `skills/<id>/SKILL.md` for each (valid Claude-Code skill frontmatter + a short body; real, readable, non-IP).
- `plugins.json` — index: 2 items, e.g. `web-search`, `pdf-reader`.
- `plugins/<id>/plugin.json` + a short `README.md` for each.

- [ ] Mirror `skills.json` + `plugins.json` into `frontend/unity/Assets/StreamingAssets/catalog/` (the renderer browses these).

Acceptance: each `skills.json` entry has a matching folder with a non-empty `SKILL.md`; JSON parses; ASCII-only.

#### Task D2: Base lesson pack

**Files:** Create `curriculum/lessons/setup-skills-and-plugins/`:
- `lesson.json` — `{ id, title, summary, steps: [...] }` for "Set up skills and plugins".
- `01-what-is-a-skill.md`, `02-install-from-the-marketplace.md`, `03-make-your-own.md` — short, plain-language, points the user at the three dashboards.

Acceptance: `lesson.json` parses; the markdown reads cleanly; no other lessons (single base pack only, per §0.1).

---

## PHASE 3 — Unity Editor assembly + mascot pipeline (SERIAL, human-eye; controller does this via desktop-control, or the operator in-Editor)

> Decoupling rule: do ALL of 3.1-3.6 against a CAPSULE placeholder mascot first. Drop the bandicoot in at 3.7 only once it exists, so the critical path never blocks on the asset pipeline.

### Task 3.1: Bootstrap scene
- New scene `Bootstrap.unity`. Add an empty `CrashApp` GameObject with `CrashApp` + `CrashWsClient`. Add a `DontDestroyOnLoad` Canvas with the `FileActivityPanel` (tree ScrollView + log ScrollView). Wire `CrashWsClient.OnFolderSnapshotUnity`/`OnFileActivityUnity` → the panel in the Inspector. Set Bootstrap as build index 0.

### Task 3.2: Hub scene
- New scene `Hub.unity`. Floor plane (NavMesh Surface, bake). Mascot capsule (tag `Player`, NavMeshAgent, Animator with an idle/walk blend tree on `Speed`, `MascotController`). Three portal volumes (trigger colliders + `PortalTrigger`, `targetScene` = `SkillCreator`/`SkillsMarket`/`PluginMarket`), each with a label. A camera following the mascot. Add Hub + the 3 dashboard scenes to Build Settings.

### Task 3.3-3.5: The three dashboard scenes
- `SkillCreator.unity`: a Canvas with the `SkillCreatorDashboard` UI (input, Create, plan card, progress, answer, save offer, STOP, shelf list) + a "return to hub" portal. Wire to `CrashApp.Instance.Client` on Start.
- `SkillsMarket.unity`: a Canvas with `MarketplaceDashboard` (`kind="skill"`) + return portal.
- `PluginMarket.unity`: a Canvas with `MarketplaceDashboard` (`kind="plugin"`) + return portal.
- Bake a NavMesh in each scene that has mascot movement (or keep dashboards UI-only and teleport the mascot back to a fixed spawn).

### Task 3.6: Integration verify (placeholder mascot)
- Start the engine (`pnpm --filter @crash/engine build` then run host; it writes `~/Crash/.runtime/socket.json`). Open Bootstrap, Play. Expect: hub renders, File Activity panel seeds from folder.snapshot, walk the capsule into the Skill Creator portal → additive load → run a real creation loop → a skill file is written and BOTH the answer and the File Activity panel update. Visit each marketplace, Install one item → card flips + files appear in the panel. Screenshot the Unity Game view (scope to the Editor window title `6000.4.9f1`; crop out any engine terminal pane — the token must never be captured).

### Task 3.7: Mascot asset pipeline (the serial long-pole — browser-drive)
- Generate a fake-bandicoot-type model (Meshy/Tripo) → Mixamo auto-rig + idle/walk/run → glTF export → place under `Assets/Mascot/` → glTFast import → build the AnimatorController (idle/walk blend on `Speed`, optional wave) → swap the capsule for the rigged model under `MascotController`. Carry on-screen CC-BY/CC0 attribution (as the fox did). **Non-IP:** original Crash-Bandicoot-STYLE only, never Activision assets. If the pipeline hits an external login/credits wall → MANUAL BLOCKER: keep the capsule, Telegram-ping, continue.

### Task 3.8: Windows build
- `File > Build Settings > Windows`, scenes in order (Bootstrap 0, Hub, the 3 dashboards), build to `frontend/unity/Build/`. Smoke-launch the build with the engine running. This bundled build is the Monday deliverable.

---

## Self-Review

**Spec coverage (§0.7 IN list):**
- Persistent bootstrap (socket + file panel) → Task 3.1 + C3 + C6. ✓
- Hub + 3 additive dashboard scenes + portal teleport → C3/C4 + 3.2-3.5. ✓
- Skill Creator live (full §4 loop, real skill file) → C7 + A3. ✓
- Skills + Plugin marketplaces (browse + install-by-copy) → B1 + C8 + D1. ✓
- File Activity tree+log → C6 + A1/A2/A3. ✓
- file.activity + folder.snapshot v2 → Phase 1 + A1/A2/A3. ✓
- Mascot (placeholder-decoupled, bandicoot-style, non-IP) → C5 + 3.7. ✓
- One base lesson pack → D2. ✓
- Bundled Windows build → 3.8. ✓
- Workspace-jail/read-only-toward-system posture preserved → snapshot allowlist (no `.runtime`), install jail-checked, errors code-only. ✓

**Placeholder scan:** Phase 1 + the small backend/Unity-client pieces are code-complete. The larger Unity gameplay MonoBehaviours (C3-C8) are given as exact files + signatures + behavior contracts + acceptance criteria for the implementing Opus agent — a deliberate delegation for the fan-out, not a TBD. Each has a concrete acceptance test.

**Type consistency:** `FileActivityPayload`/`FolderSnapshotPayload`/`MarketplaceInstall(ed)Payload` names match across events.ts ↔ Protocol.cs ↔ CrashWsClient handlers. `ActivityEmitter.emit(op, target, bytes?)` signature is consistent across activity.ts ↔ store.ts ↔ install.ts. `kind` is the string `'skill'|'plugin'` everywhere (zod enum ↔ C# string).

**Scope:** single plan, single branch (`feat/dashboard-world`); Phase 1 serial, Phase 2 three disjoint trees (backend agent owns the two backend slices to avoid the shared-`session.ts` collision), Phase 3 human-eye. No DEFERRED items pulled in.

**Ordering gotcha recorded:** the v1→v2 bump couples the handshake (1008 on mismatch) — rebuild protocol → engine → recompile Unity Protocol.cs to Version=2 before any handshake test against a v2 engine.
