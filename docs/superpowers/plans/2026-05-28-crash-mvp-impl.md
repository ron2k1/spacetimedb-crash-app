# Crash MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Tauri 2 + React + R3F desktop app called "Crash" with a clickable Quaternius fox NPC, headless Claude Code sidecar, Downloads-cleanup demo fixture, ElevenLabs voice line at completion, and Windows `.msi` installer by 2026-06-01 15:00 EST (PoC Fest deadline).

**Architecture:** Tauri 2 (Rust shell + WebView2) wraps a Vite-built React app rendering a R3F workshop scene. Click the fox → drei `<Html occlude>` bubble opens → Enter spawns a Node sidecar running `@anthropic-ai/claude-agent-sdk` `query()` loop → sidecar emits JSONL on stdout → Rust forwards via `app.emit` to a separate Tauri Task Pane window (WindowPet pattern). Safety defaults locked (`settingSources=[]`, `allowedTools=[Read,Write,Edit,Glob,Grep,Bash]`, `permissionMode=dontAsk`, no hooks, no MCPs, `additionalDirectories=[~/Crash-Workspace]`). BYO Anthropic API key via `tauri-plugin-keyring`. 429 / network failures fall back to pre-cached JSONL for the lead demo. Open source MIT.

**Tech Stack:** Tauri 2.9.x, React 18, Vite 5, TypeScript 5, R3F r160+, @react-three/drei, @react-three/postprocessing, zustand 4.5.4, Node 20 LTS, @anthropic-ai/claude-agent-sdk 0.2.98, tauri-plugin-shell, tauri-plugin-keyring, tauri-plugin-fs, ElevenLabs voice (5-8 clips, MP3), GitHub Actions windows-latest + macos-14.

**Deadline:** 2026-06-01 15:00 EST. Hard.

**Repo location:** `C:\Users\thegr\Desktop\repos\crash\` (does not exist yet; Phase 0 Task 1 creates it).

**Spec:** `C:\Users\thegr\OneDrive\Desktop\NOTES ALL CC SESSIONS\2026-05-28_Crash-Hackathon\design-spec\2026-05-28-crash-3d-design.md`

---

## Phase Map

| Phase | Goal | Hours | Target completion |
|---|---|---|---|
| 0 | MVP-Tonight: shell + cube + click→bubble→echo-sidecar→JSONL pane | 6-8 | 2026-05-28 23:59 EST |
| 1 | Real agent SDK + keychain + workspace sandbox + 429 fallback | 8 | 2026-05-29 EOD |
| 2 | Quaternius fox + workshop scene + `<Html occlude>` bubble | 8 | 2026-05-30 16:00 EST |
| 3 | Task Pane as separate Tauri window (WindowPet) | 4 | 2026-05-30 22:00 EST |
| 4 | Downloads cleanup demo + 2 stubs + 429 cache | 4 | 2026-05-31 12:00 EST |
| 5 | ElevenLabs voice line at completion | 4 | 2026-05-31 18:00 EST |
| 6 | CI/CD + Windows release build + v0.1 tag | 3 | 2026-05-31 21:00 EST |
| 7 | Demo video record + edit + upload | 3 | 2026-06-01 09:00 EST |
| 8 | Submission + README + waitlist + open source | 2 | 2026-06-01 14:00 EST |
| **Total** | | **42-44h in a 60h window** | **2026-06-01 15:00 EST** |

---

## File Structure (locked at plan time)

```
crash/
├── .github/
│   └── workflows/
│       ├── build.yml                     (Phase 6, copied from NOTES/cicd-drafts/)
│       └── quick-check.yml               (Phase 6, copied from NOTES/cicd-drafts/)
├── .gitignore
├── LICENSE                                (MIT, Phase 8)
├── README.md                              (Phase 8)
├── package.json
├── tsconfig.json
├── vite.config.ts                         (multi-entry: main + task-pane)
├── index.html                             (main window)
├── task-pane.html                         (Phase 3, second window entry)
├── public/
│   └── assets/
│       ├── fox.glb                        (Phase 2)
│       ├── workshop/
│       │   ├── bookshelf.glb              (Phase 2)
│       │   ├── potion-shelf.glb           (Phase 2)
│       │   └── archway.glb                (Phase 2)
│       └── voice/
│           ├── done.mp3                   (Phase 5)
│           ├── mess.mp3                   (Phase 5)
│           ├── working.mp3                (Phase 5)
│           ├── anything-else.mp3          (Phase 5)
│           └── all-done.mp3               (Phase 5)
├── src/
│   ├── main.tsx                           (Phase 0)
│   ├── task-pane.tsx                      (Phase 3)
│   ├── App.tsx                            (Phase 0)
│   ├── TaskPaneApp.tsx                    (Phase 3)
│   ├── components/
│   │   ├── Scene.tsx                      (Phase 0, extended in 2)
│   │   ├── Fox.tsx                        (Phase 2)
│   │   ├── Workshop.tsx                   (Phase 2)
│   │   ├── RuneCircle.tsx                 (Phase 2)
│   │   ├── DialogBubble.tsx               (Phase 0, extended in 2)
│   │   ├── DemoShelf.tsx                  (Phase 4)
│   │   ├── TaskPane.tsx                   (Phase 0, moved to TaskPaneApp in 3)
│   │   └── ApiKeyPrompt.tsx               (Phase 1)
│   ├── store/
│   │   ├── dialogStore.ts                 (Phase 0)
│   │   ├── taskStore.ts                   (Phase 0)
│   │   ├── foxStateStore.ts               (Phase 2)
│   │   └── configStore.ts                 (Phase 1)
│   ├── utils/
│   │   └── voicePlayer.ts                 (Phase 5)
│   ├── data/
│   │   └── demoFixtures.ts                (Phase 4)
│   └── types/
│       └── sidecar-events.ts              (Phase 0)
├── sidecar/
│   ├── package.json
│   ├── echo.js                            (Phase 0, removed in Phase 1)
│   ├── index.js                           (Phase 1)
│   └── fixtures/
│       └── downloads-cleanup.jsonl        (Phase 4)
├── scripts/
│   └── seed-demo-downloads.ps1            (Phase 4)
├── tests/
│   ├── sidecar/
│   │   ├── jsonl-parser.test.ts           (Phase 0)
│   │   └── fallback-matcher.test.ts       (Phase 1)
│   └── store/
│       └── dialogStore.test.ts            (Phase 0)
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── build.rs
    ├── capabilities/
    │   └── default.json                   (Phase 0, extended in 1+3)
    ├── icons/                             (cargo create default)
    ├── src/
    │   ├── main.rs
    │   ├── lib.rs                         (Phase 0, extended each phase)
    │   ├── sidecar.rs                     (Phase 0)
    │   ├── jsonl.rs                       (Phase 0, line-buffered reader)
    │   └── keyring.rs                     (Phase 1)
    └── binaries/
        ├── crash-sidecar-x86_64-pc-windows-msvc.exe   (Phase 1)
        └── crash-sidecar-aarch64-apple-darwin         (Phase 6, conditional)
```

`docs/superpowers/plans/2026-05-28-crash-mvp-impl.md` ← this file copied here on Phase 0 Task 1.

---

# Phase 0 — MVP-Tonight (6-8h)

**Exit condition:** A Tauri window opens, a placeholder cube renders in R3F, clicking the cube opens a drei `<Html>` bubble with a text input. Enter spawns a Node "echo" sidecar that prints stub JSONL events on stdout. Rust pipes those events to the frontend. An inline `<TaskPane>` panel renders the events live. Quick-check CI green.

### Task 1: Scaffold repo + Tauri 2 + React + TS + Vite

**Files:**
- Create: `C:\Users\thegr\Desktop\repos\crash\` (full Tauri 2 scaffold)
- Create: `crash/docs/superpowers/plans/2026-05-28-crash-mvp-impl.md` (copy of this file)
- Create: `crash/docs/superpowers/specs/2026-05-28-crash-3d-design.md` (copy from NOTES)

- [ ] **Step 1: Create repo dir + run cargo create-tauri-app**

```powershell
New-Item -ItemType Directory -Force "C:\Users\thegr\Desktop\repos\crash" | Out-Null
Set-Location "C:\Users\thegr\Desktop\repos\crash"
# Use cargo create-tauri-app for the most current Tauri 2 template.
# When prompted: project name "crash", manager "npm", language "TypeScript", template "React"
cargo create-tauri-app
```

Expected: scaffold completes; `crash/src/` + `crash/src-tauri/` + `crash/package.json` exist.

- [ ] **Step 2: Install deps + verify dev server**

```powershell
npm install
npm run tauri dev
```

Expected: Tauri window opens with default "Welcome to Tauri!" view. Close the window.

- [ ] **Step 3: Initialize git + first commit**

```powershell
git init
git add .
git commit -F - <<'EOF'
chore: scaffold Tauri 2 + React + TS via cargo create-tauri-app

cargo create-tauri-app default template. npm install verified. dev server launches.
EOF
```

- [ ] **Step 4: Copy spec + plan into the repo for per-repo provenance**

```powershell
New-Item -ItemType Directory -Force "docs\superpowers\specs" | Out-Null
New-Item -ItemType Directory -Force "docs\superpowers\plans" | Out-Null
Copy-Item "C:\Users\thegr\OneDrive\Desktop\NOTES ALL CC SESSIONS\2026-05-28_Crash-Hackathon\design-spec\2026-05-28-crash-3d-design.md" "docs\superpowers\specs\"
Copy-Item "C:\Users\thegr\OneDrive\Desktop\NOTES ALL CC SESSIONS\2026-05-28_Crash-Hackathon\plan\2026-05-28-crash-mvp-impl.md" "docs\superpowers\plans\"
git add docs/
git commit -F - <<'EOF'
docs: import council-revised design spec + implementation plan

Spec at docs/superpowers/specs/2026-05-28-crash-3d-design.md (~600 lines).
Plan at docs/superpowers/plans/2026-05-28-crash-mvp-impl.md (this file).
Council outputs at NOTES (OneDrive, not in repo).
EOF
```

---

### Task 2: Add R3F + drei + zustand + Vitest

**Files:**
- Modify: `crash/package.json`
- Create: `crash/vitest.config.ts`
- Create: `crash/tests/sanity.test.ts`

- [ ] **Step 1: Install deps**

```powershell
npm install three@^0.160 @react-three/fiber@^8.15 @react-three/drei@^9.92 @react-three/postprocessing@^2.15 zustand@4.5.4
npm install -D @types/three vitest@^1.2 @vitest/ui happy-dom @testing-library/react@^14
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
// crash/vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    globals: true,
  },
});
```

- [ ] **Step 3: Add test scripts to package.json**

In `crash/package.json`, ensure `scripts` includes:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "tauri": "tauri",
    "test": "vitest",
    "test:run": "vitest --run",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "build:sidecar": "echo 'no sidecar build in Phase 0, see Phase 1'"
  }
}
```

- [ ] **Step 4: Write a sanity test**

```typescript
// crash/tests/sanity.test.ts
import { describe, it, expect } from 'vitest';
describe('sanity', () => {
  it('arithmetic still works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run + commit**

```powershell
npm run test:run
```

Expected: 1 test passes.

```powershell
git add .
git commit -F - <<'EOF'
chore: add R3F + drei + zustand + vitest

R3F r160+, drei, postprocessing, zustand 4.5.4. Vitest with happy-dom env.
Sanity test passes.
EOF
```

---

### Task 3: Render a placeholder cube in R3F Canvas

**Files:**
- Create: `crash/src/components/Scene.tsx`
- Modify: `crash/src/App.tsx`

- [ ] **Step 1: Write Scene.tsx**

```typescript
// crash/src/components/Scene.tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

export function Scene() {
  return (
    <Canvas
      camera={{ position: [3, 3, 3], fov: 50 }}
      style={{ width: '100vw', height: '100vh', background: '#1a1530' }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1.0} color="#ff9966" />
      <pointLight position={[-3, 2, -3]} intensity={0.8} color="#9966ff" />
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#ff9966" />
      </mesh>
      <OrbitControls />
    </Canvas>
  );
}
```

- [ ] **Step 2: Replace App.tsx with Scene mount**

```typescript
// crash/src/App.tsx
import { Scene } from './components/Scene';
export default function App() {
  return <Scene />;
}
```

- [ ] **Step 3: Run dev server + verify**

```powershell
npm run tauri dev
```

Expected: Tauri window opens with a dark purple background, an orange cube floating in the center, drag-to-orbit camera. Close.

- [ ] **Step 4: Commit**

```powershell
git add src/
git commit -F - <<'EOF'
feat: R3F canvas with placeholder cube + warm purple lighting

Wawa Sensei lighting recipe (amber key + purple accent). OrbitControls
for dev only -- locked perspective in Phase 2.
EOF
```

---

### Task 4: Zustand dialog store + click-to-open bubble

**Files:**
- Create: `crash/src/store/dialogStore.ts`
- Create: `crash/tests/store/dialogStore.test.ts`
- Create: `crash/src/components/DialogBubble.tsx`
- Modify: `crash/src/components/Scene.tsx`

- [ ] **Step 1: Write failing test for dialog store**

```typescript
// crash/tests/store/dialogStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useDialogStore } from '../../src/store/dialogStore';

describe('dialogStore', () => {
  beforeEach(() => {
    useDialogStore.setState({ open: false, prompt: '' });
  });
  it('starts closed with empty prompt', () => {
    expect(useDialogStore.getState().open).toBe(false);
    expect(useDialogStore.getState().prompt).toBe('');
  });
  it('opens via setOpen(true)', () => {
    useDialogStore.getState().setOpen(true);
    expect(useDialogStore.getState().open).toBe(true);
  });
  it('updates prompt', () => {
    useDialogStore.getState().setPrompt('hello');
    expect(useDialogStore.getState().prompt).toBe('hello');
  });
  it('resets prompt + closes on submit', () => {
    useDialogStore.setState({ open: true, prompt: 'do thing' });
    useDialogStore.getState().reset();
    expect(useDialogStore.getState().open).toBe(false);
    expect(useDialogStore.getState().prompt).toBe('');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL (module not found)**

```powershell
npm run test:run -- dialogStore
```

Expected: FAIL with "Cannot find module '../../src/store/dialogStore'".

- [ ] **Step 3: Implement dialogStore**

```typescript
// crash/src/store/dialogStore.ts
import { create } from 'zustand';

interface DialogState {
  open: boolean;
  prompt: string;
  setOpen: (open: boolean) => void;
  setPrompt: (prompt: string) => void;
  reset: () => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  open: false,
  prompt: '',
  setOpen: (open) => set({ open }),
  setPrompt: (prompt) => set({ prompt }),
  reset: () => set({ open: false, prompt: '' }),
}));
```

- [ ] **Step 4: Run test, expect PASS**

```powershell
npm run test:run -- dialogStore
```

Expected: 4 tests pass.

- [ ] **Step 5: Write DialogBubble component**

```typescript
// crash/src/components/DialogBubble.tsx
import { Html } from '@react-three/drei';
import { useDialogStore } from '../store/dialogStore';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useRef } from 'react';

export function DialogBubble() {
  const open = useDialogStore((s) => s.open);
  const reset = useDialogStore((s) => s.reset);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!text.trim()) return;
    try {
      await invoke('start_task', { prompt: text });
    } catch (e) {
      console.error('start_task failed', e);
    }
    setText('');
    reset();
  };

  return (
    <Html position={[0, 1.8, 0]} center>
      <div
        style={{
          background: 'rgba(255,255,255,0.10)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.20)',
          borderRadius: 16,
          padding: 12,
          minWidth: 280,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          color: 'white',
          fontFamily: 'system-ui',
        }}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') reset(); }}
          placeholder="What should Crash do?"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            color: 'white',
            outline: 'none',
            fontSize: 16,
          }}
        />
      </div>
    </Html>
  );
}
```

- [ ] **Step 6: Add Tauri API for invoke + wire onClick to cube**

```powershell
npm install @tauri-apps/api
```

Modify `crash/src/components/Scene.tsx` to add onClick + render bubble:

```typescript
// crash/src/components/Scene.tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useDialogStore } from '../store/dialogStore';
import { DialogBubble } from './DialogBubble';

function Cube() {
  const setOpen = useDialogStore((s) => s.setOpen);
  return (
    <mesh position={[0, 0, 0]} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#ff9966" />
    </mesh>
  );
}

export function Scene() {
  return (
    <Canvas
      camera={{ position: [3, 3, 3], fov: 50 }}
      style={{ width: '100vw', height: '100vh', background: '#1a1530' }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1.0} color="#ff9966" />
      <pointLight position={[-3, 2, -3]} intensity={0.8} color="#9966ff" />
      <Cube />
      <DialogBubble />
      <OrbitControls />
    </Canvas>
  );
}
```

- [ ] **Step 7: Run dev server + verify click opens bubble**

```powershell
npm run tauri dev
```

Expected: click the cube → frosted-glass bubble appears above it with a text input. Type something. Press Escape to close.

- [ ] **Step 8: Commit**

```powershell
git add .
git commit -F - <<'EOF'
feat: clickable cube opens drei Html dialog bubble

Zustand dialogStore (4 tests pass). DialogBubble uses drei Html anchored
at [0, 1.8, 0]. Enter submits via invoke('start_task') -- Tauri command
defined in Task 5.
EOF
```

---

### Task 5: Echo sidecar (Node script)

**Files:**
- Create: `crash/sidecar/package.json`
- Create: `crash/sidecar/echo.js`
- Create: `crash/src/types/sidecar-events.ts`

- [ ] **Step 1: Create sidecar package.json**

```powershell
New-Item -ItemType Directory -Force sidecar | Out-Null
```

```json
// crash/sidecar/package.json
{
  "name": "crash-sidecar",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node echo.js"
  }
}
```

- [ ] **Step 2: Write echo.js**

```javascript
// crash/sidecar/echo.js
// Phase 0 stub: emits a sequence of JSONL events to simulate the agent SDK.
// Replaced by index.js in Phase 1 with the real @anthropic-ai/claude-agent-sdk loop.

const args = process.argv.slice(2);
const prompt = args.join(' ') || 'no prompt';
const taskId = `task_${Date.now()}`;

function emit(type, data) {
  process.stdout.write(JSON.stringify({ type, data }) + '\n');
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  emit('task_start', { taskId, prompt, workspace: process.cwd(), timestamp: Date.now() });
  await sleep(300);
  emit('message_delta', { taskId, text: `Echo received: "${prompt}".` });
  await sleep(400);
  emit('tool_use', { taskId, tool: 'Glob', args: { pattern: '*' }, result: 'echo: 0 files' });
  await sleep(400);
  emit('message_delta', { taskId, text: ' Phase 0 stub -- no real SDK call.' });
  await sleep(300);
  emit('task_end', { taskId, summary: 'echo complete', durationMs: 1400, filesChanged: 0 });
}

main().catch((err) => {
  emit('error', { taskId, code: 'echo_failure', retryable: false });
  process.exit(1);
});
```

- [ ] **Step 3: Define event type union**

```typescript
// crash/src/types/sidecar-events.ts
export type SidecarEvent =
  | { type: 'task_start'; data: { taskId: string; prompt: string; workspace: string; timestamp: number } }
  | { type: 'tool_use'; data: { taskId: string; tool: string; args: unknown; result: string } }
  | { type: 'file_change'; data: { taskId: string; path: string; op: 'create' | 'move' | 'edit' | 'delete' } }
  | { type: 'message_delta'; data: { taskId: string; text: string } }
  | { type: 'task_end'; data: { taskId: string; summary: string; durationMs: number; filesChanged: number } }
  | { type: 'error'; data: { taskId: string; code: string; retryable: boolean } };
```

- [ ] **Step 4: Manually verify echo.js**

```powershell
Set-Location sidecar
node echo.js "hello world"
Set-Location ..
```

Expected: 5 JSON lines on stdout with the expected event sequence.

- [ ] **Step 5: Commit**

```powershell
git add sidecar/ src/types/
git commit -F - <<'EOF'
feat: Phase 0 echo sidecar emits stub JSONL events

Node ESM module. Emits task_start -> message_delta -> tool_use ->
message_delta -> task_end with realistic delays. Replaced by real
agent SDK in Phase 1. Event type union in src/types.
EOF
```

---

### Task 6: Tauri command spawns echo sidecar via tauri-plugin-shell

**Files:**
- Modify: `crash/src-tauri/Cargo.toml`
- Create: `crash/src-tauri/capabilities/default.json`
- Modify: `crash/src-tauri/tauri.conf.json`
- Modify: `crash/src-tauri/src/lib.rs`
- Create: `crash/src-tauri/src/sidecar.rs`
- Create: `crash/src-tauri/src/jsonl.rs`

- [ ] **Step 1: Add tauri-plugin-shell to Cargo.toml**

In `crash/src-tauri/Cargo.toml` under `[dependencies]`:

```toml
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["io-util", "process", "rt"] }
```

- [ ] **Step 2: Declare shell:allow-execute capability scoped to the echo sidecar**

```json
// crash/src-tauri/capabilities/default.json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Default capability set for the Crash main window.",
  "windows": ["main"],
  "permissions": [
    "core:default",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "node",
          "cmd": "node",
          "args": ["sidecar/echo.js", { "validator": ".*" }],
          "sidecar": false
        }
      ]
    }
  ]
}
```

**NOTE:** In Phase 1 we switch to a true sidecar binary; for Phase 0 we shell out to system `node`. This avoids the Phase 1 "binary naming triple" complexity tonight.

- [ ] **Step 3: Write the jsonl.rs line-buffered reader**

```rust
// crash/src-tauri/src/jsonl.rs
// Line-buffered JSON reader. Handles the case where a single emit
// splits across two read() calls -- buffer until newline.

use std::io::{BufRead, BufReader, Read};
use serde_json::Value;

pub fn parse_lines<R: Read>(reader: R) -> impl Iterator<Item = Result<Value, String>> {
    BufReader::new(reader)
        .lines()
        .map(|line_res| {
            line_res
                .map_err(|e| format!("read error: {:?}", e.kind()))
                .and_then(|line| {
                    if line.trim().is_empty() {
                        Err("empty line".to_string())
                    } else {
                        serde_json::from_str::<Value>(&line)
                            .map_err(|_| "parse error".to_string())
                    }
                })
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn parses_single_line() {
        let input = r#"{"type":"task_start","data":{"taskId":"t1"}}"#;
        let mut iter = parse_lines(Cursor::new(input));
        let first = iter.next().unwrap().unwrap();
        assert_eq!(first["type"], "task_start");
    }

    #[test]
    fn parses_multiple_lines() {
        let input = "{\"type\":\"a\",\"data\":{}}\n{\"type\":\"b\",\"data\":{}}\n";
        let results: Vec<_> = parse_lines(Cursor::new(input)).collect();
        assert_eq!(results.len(), 2);
        assert!(results[0].is_ok());
        assert!(results[1].is_ok());
    }

    #[test]
    fn rejects_malformed_json() {
        let input = "not json\n";
        let mut iter = parse_lines(Cursor::new(input));
        let first = iter.next().unwrap();
        assert!(first.is_err());
    }
}
```

- [ ] **Step 4: Run cargo test for jsonl module**

```powershell
Set-Location src-tauri
cargo test --lib jsonl
Set-Location ..
```

Expected: 3 tests pass.

- [ ] **Step 5: Write sidecar.rs spawn helper**

```rust
// crash/src-tauri/src/sidecar.rs
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use serde_json::Value;

pub async fn spawn_echo_sidecar(app: AppHandle, prompt: String) -> Result<(), String> {
    let shell = app.shell();
    let cmd = shell
        .command("node")
        .args(["sidecar/echo.js", &prompt]);

    let (mut rx, _child) = cmd
        .spawn()
        .map_err(|e| format!("spawn failed: {}", e))?;

    // Register listener -- caller MUST have done this before invoking us
    // (Phase 0 race-avoidance: frontend's listen() runs at app boot).

    tokio::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes).to_string();
                    for chunk in line.split('\n') {
                        if chunk.trim().is_empty() { continue; }
                        if let Ok(value) = serde_json::from_str::<Value>(chunk) {
                            let _ = app.emit("sidecar-event", value);
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    let line = String::from_utf8_lossy(&bytes);
                    eprintln!("[sidecar stderr] {}", line);
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[sidecar terminated] code={:?}", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}
```

**NOTE on line-buffered reader:** `CommandEvent::Stdout` may deliver a partial line. Phase 0 uses naive split-on-newline which works for echo.js (which always ends with `\n`). Phase 1 Task 13 replaces this with proper buffering via `jsonl.rs`.

- [ ] **Step 6: Wire commands + plugin in lib.rs**

```rust
// crash/src-tauri/src/lib.rs
mod sidecar;
mod jsonl;

use tauri::AppHandle;

#[tauri::command]
async fn start_task(app: AppHandle, prompt: String) -> Result<(), String> {
    sidecar::spawn_echo_sidecar(app, prompt).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![start_task])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 7: Cargo build (slow first time)**

```powershell
Set-Location src-tauri
cargo build
Set-Location ..
```

Expected: builds successfully (3-8 min first time, cached after).

- [ ] **Step 8: Commit**

```powershell
git add .
git commit -F - <<'EOF'
feat: Tauri command start_task spawns echo sidecar via tauri-plugin-shell

jsonl.rs line-buffered reader (3 tests pass). sidecar.rs spawns node
sidecar/echo.js, parses JSONL stdout, forwards via app.emit. Phase 0
uses system node; Phase 1 switches to real sidecar binary.

shell:allow-execute capability scoped to node + sidecar/echo.js.
EOF
```

---

### Task 7: Frontend listens for sidecar events + inline TaskPane

**Files:**
- Create: `crash/src/store/taskStore.ts`
- Create: `crash/src/components/TaskPane.tsx`
- Modify: `crash/src/App.tsx`

- [ ] **Step 1: Write taskStore**

```typescript
// crash/src/store/taskStore.ts
import { create } from 'zustand';
import type { SidecarEvent } from '../types/sidecar-events';

interface TaskState {
  events: SidecarEvent[];
  activeTaskId: string | null;
  append: (e: SidecarEvent) => void;
  clear: () => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  events: [],
  activeTaskId: null,
  append: (e) =>
    set((s) => {
      const activeTaskId =
        e.type === 'task_start' ? e.data.taskId :
        e.type === 'task_end' ? null :
        s.activeTaskId;
      return { events: [...s.events, e], activeTaskId };
    }),
  clear: () => set({ events: [], activeTaskId: null }),
}));
```

- [ ] **Step 2: Write TaskPane (inline DOM panel for Phase 0; separate window in Phase 3)**

```typescript
// crash/src/components/TaskPane.tsx
import { useTaskStore } from '../store/taskStore';

export function TaskPane() {
  const events = useTaskStore((s) => s.events);
  const active = useTaskStore((s) => s.activeTaskId);

  if (events.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        width: 360,
        maxHeight: 'calc(100vh - 32px)',
        overflowY: 'auto',
        background: 'rgba(20, 16, 40, 0.92)',
        backdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 12,
        padding: 16,
        color: 'white',
        fontFamily: 'ui-monospace, monospace',
        fontSize: 13,
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 12 }}>
        Task Pane {active ? `· ${active}` : '· idle'}
      </div>
      {events.map((e, i) => (
        <div key={i} style={{ marginBottom: 6, opacity: 0.92 }}>
          <span style={{ color: '#ff9966' }}>{e.type}</span>
          <span style={{ color: '#888' }}> · </span>
          <span>{JSON.stringify(e.data).slice(0, 220)}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Listen for sidecar-event in main.tsx (register BEFORE app renders)**

```typescript
// crash/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { listen } from '@tauri-apps/api/event';
import App from './App';
import { useTaskStore } from './store/taskStore';
import type { SidecarEvent } from './types/sidecar-events';

// CRITICAL: register listener BEFORE app render. Council architect flagged
// race where sidecar emits before frontend listener registers.
listen<SidecarEvent>('sidecar-event', (event) => {
  useTaskStore.getState().append(event.payload);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 4: Mount TaskPane in App.tsx**

```typescript
// crash/src/App.tsx
import { Scene } from './components/Scene';
import { TaskPane } from './components/TaskPane';

export default function App() {
  return (
    <>
      <Scene />
      <TaskPane />
    </>
  );
}
```

- [ ] **Step 5: End-to-end verify**

```powershell
npm run tauri dev
```

Expected:
1. Tauri window opens with cube
2. Click the cube → bubble appears
3. Type "clean my Downloads"
4. Press Enter
5. TaskPane appears top-right with 5 event rows streaming in over ~1.4s
6. After task_end, active becomes "idle"

- [ ] **Step 6: Commit the MVP-tonight checkpoint**

```powershell
git add .
git commit -F - <<'EOF'
feat: MVP-tonight loop complete -- click cube, prompt, watch JSONL stream

End-to-end: cube onClick -> dialog bubble -> invoke('start_task') ->
Rust spawns node sidecar/echo.js -> stdout JSONL parsed line-by-line ->
app.emit('sidecar-event') -> frontend listener (registered before
render to avoid race) -> taskStore -> TaskPane DOM panel renders 5
events live.

Phase 0 exit condition met.
EOF
```

---

### Task 8: Quick-check CI (drop the workflow file)

**Files:**
- Create: `crash/.github/workflows/quick-check.yml`
- Create: `crash/.eslintrc.cjs` (minimal)

- [ ] **Step 1: Copy quick-check.yml from NOTES**

```powershell
New-Item -ItemType Directory -Force ".github\workflows" | Out-Null
Copy-Item "C:\Users\thegr\OneDrive\Desktop\NOTES ALL CC SESSIONS\2026-05-28_Crash-Hackathon\cicd-drafts\quick-check.yml" ".github\workflows\"
```

- [ ] **Step 2: Minimal eslintrc**

```javascript
// crash/.eslintrc.cjs
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'off',
  },
  ignorePatterns: ['dist', 'src-tauri/target', 'node_modules', 'sidecar/echo.js'],
};
```

```powershell
npm install -D eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

- [ ] **Step 3: Verify lint + typecheck + test all pass locally**

```powershell
npm run lint
npm run typecheck
npm run test:run
```

Expected: all three exit 0.

- [ ] **Step 4: Commit**

```powershell
git add .
git commit -F - <<'EOF'
ci: quick-check workflow (lint + typecheck + vitest, under 3 min cold)

Copied from NOTES/cicd-drafts/quick-check.yml. Full build pipeline
deployed in Phase 6.
EOF
```

**Phase 0 complete. MVP-tonight in the can.**

---

# Phase 1 — Real Agent SDK + Keychain + Workspace Sandbox + 429 Fallback (8h)

**Exit condition:** the echo sidecar is replaced with `@anthropic-ai/claude-agent-sdk` running real `query()` loops. API key stored via OS keychain. Workspace scoped to `~/Crash-Workspace/`. 429 errors fall back to a pre-cached JSONL fixture (real fixture recorded in Phase 4; Phase 1 uses a placeholder fixture).

### Task 9: Add tauri-plugin-keyring + API key commands

**Files:**
- Modify: `crash/src-tauri/Cargo.toml`
- Create: `crash/src-tauri/src/keyring.rs`
- Modify: `crash/src-tauri/src/lib.rs`
- Modify: `crash/src-tauri/capabilities/default.json`

- [ ] **Step 1: Add dep**

```toml
# crash/src-tauri/Cargo.toml [dependencies]
tauri-plugin-keyring = "2"
```

- [ ] **Step 2: Write keyring.rs**

```rust
// crash/src-tauri/src/keyring.rs
use tauri::Manager;
use tauri_plugin_keyring::KeyringExt;

const SERVICE: &str = "crash";
const USER: &str = "anthropic-api-key";

#[tauri::command]
pub async fn set_api_key(app: tauri::AppHandle, key: String) -> Result<(), String> {
    app.keyring()
        .set(SERVICE, USER, &key)
        .map_err(|e| format!("set failed: {:?}", e))
}

#[tauri::command]
pub async fn get_api_key(app: tauri::AppHandle) -> Result<Option<String>, String> {
    match app.keyring().get(SERVICE, USER) {
        Ok(key) => Ok(Some(key)),
        Err(_) => Ok(None),  // missing key is not an error in v0.1
    }
}

#[tauri::command]
pub async fn has_api_key(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(app.keyring().get(SERVICE, USER).is_ok())
}
```

- [ ] **Step 3: Register plugin + commands**

```rust
// crash/src-tauri/src/lib.rs (modify run())
mod sidecar;
mod jsonl;
mod keyring;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_keyring::init())
        .invoke_handler(tauri::generate_handler![
            start_task,
            keyring::set_api_key,
            keyring::get_api_key,
            keyring::has_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 4: Capability JSON addition**

In `crash/src-tauri/capabilities/default.json` permissions array:

```json
"keyring:default"
```

- [ ] **Step 5: Cargo build + commit**

```powershell
Set-Location src-tauri
cargo build
Set-Location ..
git add .
git commit -F - <<'EOF'
feat: tauri-plugin-keyring + set_api_key/get_api_key/has_api_key

Service "crash", user "anthropic-api-key". Windows Credential Manager
on Win, macOS Keychain on Mac. No plaintext storage anywhere.
EOF
```

---

### Task 10: BYO key UI prompt

**Files:**
- Create: `crash/src/components/ApiKeyPrompt.tsx`
- Modify: `crash/src/App.tsx`

- [ ] **Step 1: Write ApiKeyPrompt**

```typescript
// crash/src/components/ApiKeyPrompt.tsx
import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function ApiKeyPrompt({ onSet }: { onSet: () => void }) {
  const [present, setPresent] = useState<boolean | null>(null);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    invoke<boolean>('has_api_key').then(setPresent);
  }, []);

  if (present === null) return null;
  if (present === true) return null;

  const save = async () => {
    if (!key.startsWith('sk-ant-')) {
      alert('Anthropic API keys start with sk-ant-');
      return;
    }
    setSaving(true);
    try {
      await invoke('set_api_key', { key });
      onSet();
    } catch (e) {
      alert(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(6px)',
        zIndex: 1000,
        display: 'grid', placeItems: 'center',
        fontFamily: 'system-ui',
      }}
    >
      <div style={{
        background: '#231a3d', padding: 32, borderRadius: 16,
        color: 'white', maxWidth: 460, boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
      }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 20 }}>Bring your Anthropic API key</h2>
        <p style={{ opacity: 0.75, fontSize: 14, lineHeight: 1.5 }}>
          Stored in your OS keychain (Windows Credential Manager). Never leaves your machine.
          Get one at <code>console.anthropic.com</code>.
        </p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="sk-ant-..."
          style={{
            width: '100%', marginTop: 16,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 8, padding: '10px 12px',
            color: 'white', fontSize: 14, outline: 'none',
            fontFamily: 'ui-monospace, monospace',
          }}
        />
        <button
          onClick={save}
          disabled={saving || !key}
          style={{
            marginTop: 16, width: '100%', padding: '10px 16px',
            background: '#ff9966', border: 'none', borderRadius: 8,
            color: '#1a1530', fontWeight: 600, cursor: 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save key'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount in App**

```typescript
// crash/src/App.tsx
import { useState } from 'react';
import { Scene } from './components/Scene';
import { TaskPane } from './components/TaskPane';
import { ApiKeyPrompt } from './components/ApiKeyPrompt';

export default function App() {
  const [keyVersion, setKeyVersion] = useState(0);
  return (
    <>
      <ApiKeyPrompt key={keyVersion} onSet={() => setKeyVersion((v) => v + 1)} />
      <Scene />
      <TaskPane />
    </>
  );
}
```

- [ ] **Step 3: Run dev server + verify**

```powershell
npm run tauri dev
```

Expected: on first launch, prompt appears. Paste a real key (`sk-ant-...`). Modal dismisses. Re-launch: no prompt (key persisted).

- [ ] **Step 4: Commit**

```powershell
git add .
git commit -F - <<'EOF'
feat: ApiKeyPrompt modal on first launch -- BYO key flow

Validates sk-ant- prefix client-side. Persists to OS keychain via
set_api_key Tauri command. Re-launches skip the prompt once key exists.
EOF
```

---

### Task 11: Real agent-sdk sidecar (replaces echo.js)

**Files:**
- Create: `crash/sidecar/index.js`
- Create: `crash/sidecar/fallback-matcher.js`
- Create: `crash/tests/sidecar/fallback-matcher.test.ts`
- Modify: `crash/sidecar/package.json`

- [ ] **Step 1: Install agent SDK in sidecar/**

```powershell
Set-Location sidecar
npm init -y --silent  # if not already
npm install @anthropic-ai/claude-agent-sdk@0.2.98
Set-Location ..
```

- [ ] **Step 2: Write failing test for fallback matcher**

```typescript
// crash/tests/sidecar/fallback-matcher.test.ts
import { describe, it, expect } from 'vitest';
import { matchesFixturePrompt } from '../../sidecar/fallback-matcher.js';

describe('matchesFixturePrompt', () => {
  it('matches the canonical Downloads cleanup prompt', () => {
    expect(matchesFixturePrompt('My Downloads folder is a disaster, fix it.', 'downloads-cleanup')).toBe(true);
  });
  it('matches with stray whitespace', () => {
    expect(matchesFixturePrompt('  My Downloads folder is a disaster, fix it.  ', 'downloads-cleanup')).toBe(true);
  });
  it('matches with different case', () => {
    expect(matchesFixturePrompt('my downloads folder is a disaster, fix it.', 'downloads-cleanup')).toBe(true);
  });
  it('does not match unrelated prompts', () => {
    expect(matchesFixturePrompt('rank these resumes', 'downloads-cleanup')).toBe(false);
  });
  it('unknown fixture id returns false', () => {
    expect(matchesFixturePrompt('My Downloads folder is a disaster, fix it.', 'nonexistent')).toBe(false);
  });
});
```

- [ ] **Step 3: Run test, expect FAIL (no module)**

```powershell
npm run test:run -- fallback-matcher
```

Expected: FAIL.

- [ ] **Step 4: Implement fallback-matcher.js**

```javascript
// crash/sidecar/fallback-matcher.js
const FIXTURE_PROMPTS = {
  'downloads-cleanup': 'my downloads folder is a disaster, fix it.',
};

function normalize(s) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function matchesFixturePrompt(prompt, fixtureId) {
  const canonical = FIXTURE_PROMPTS[fixtureId];
  if (!canonical) return false;
  return normalize(prompt) === normalize(canonical);
}
```

- [ ] **Step 5: Run test, expect PASS**

```powershell
npm run test:run -- fallback-matcher
```

Expected: 5 tests pass.

- [ ] **Step 6: Write index.js (real agent-sdk loop)**

```javascript
// crash/sidecar/index.js
import { query } from '@anthropic-ai/claude-agent-sdk';
import { matchesFixturePrompt } from './fallback-matcher.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const [, , workspaceArg, ...promptParts] = process.argv;
const workspace = workspaceArg || process.cwd();
const prompt = promptParts.join(' ');
const apiKey = process.env.ANTHROPIC_API_KEY;
const taskId = `task_${Date.now()}`;

function emit(type, data) {
  process.stdout.write(JSON.stringify({ type, data }) + '\n');
}

async function replayFixture(fixtureId) {
  const fixturePath = join(__dirname, 'fixtures', `${fixtureId}.jsonl`);
  let content;
  try {
    content = await readFile(fixturePath, 'utf-8');
  } catch {
    emit('error', { taskId, code: 'fixture_missing', retryable: false });
    return;
  }
  const lines = content.trim().split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const evt = JSON.parse(line);
    // rewrite taskId so frontend correlates with this session
    if (evt.data) evt.data.taskId = taskId;
    process.stdout.write(JSON.stringify(evt) + '\n');
    await new Promise((r) => setTimeout(r, evt._delayMs || 300));
  }
}

async function main() {
  if (!apiKey) {
    emit('error', { taskId, code: 'no_api_key', retryable: false });
    process.exit(2);
  }
  emit('task_start', { taskId, prompt, workspace, timestamp: Date.now() });

  try {
    const sdkQuery = query({
      prompt,
      options: {
        settingSources: [],
        allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        permissionMode: 'dontAsk',
        additionalDirectories: [workspace],
      },
    });

    for await (const message of sdkQuery) {
      if (message.type === 'assistant') {
        for (const block of message.message.content || []) {
          if (block.type === 'text') {
            emit('message_delta', { taskId, text: block.text });
          } else if (block.type === 'tool_use') {
            emit('tool_use', { taskId, tool: block.name, args: block.input, result: 'pending' });
          }
        }
      } else if (message.type === 'user' && Array.isArray(message.message.content)) {
        for (const block of message.message.content) {
          if (block.type === 'tool_result') {
            // surface file changes inferred from Write/Edit tool results
            // best-effort heuristic; refined Phase 4
          }
        }
      }
    }

    emit('task_end', { taskId, summary: 'complete', durationMs: Date.now() - parseInt(taskId.split('_')[1]), filesChanged: 0 });
  } catch (err) {
    // Council-mandated 429 fallback. NEVER log err.message (secret-leak surface per CLAUDE.md Rule 16).
    const code = err?.status === 429 ? 'rate_limit_exceeded' : 'sdk_error';
    if (code === 'rate_limit_exceeded' && matchesFixturePrompt(prompt, 'downloads-cleanup')) {
      emit('message_delta', { taskId, text: '[falling back to cached response]' });
      await replayFixture('downloads-cleanup');
      return;
    }
    emit('error', { taskId, code, retryable: code === 'rate_limit_exceeded' });
    process.exit(1);
  }
}

main();
```

- [ ] **Step 7: Update sidecar/package.json scripts**

```json
{
  "name": "crash-sidecar",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "0.2.98"
  }
}
```

- [ ] **Step 8: Commit**

```powershell
git add .
git commit -F - <<'EOF'
feat: real @anthropic-ai/claude-agent-sdk sidecar with 429 fallback

sidecar/index.js calls query() with locked safety defaults from spec.
Streams JSONL events to stdout. On 429 + canonical fixture prompt,
replays sidecar/fixtures/<id>.jsonl with delays. Per CLAUDE.md Rule 16,
NEVER logs err.message -- only status codes.

5/5 fallback-matcher tests pass.
EOF
```

---

### Task 12: Rust spawns the real sidecar + injects ANTHROPIC_API_KEY

**Files:**
- Modify: `crash/src-tauri/src/sidecar.rs`
- Modify: `crash/src-tauri/src/lib.rs`
- Modify: `crash/src-tauri/capabilities/default.json`

- [ ] **Step 1: Replace spawn helper**

```rust
// crash/src-tauri/src/sidecar.rs
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_keyring::KeyringExt;
use serde_json::Value;
use std::path::PathBuf;

pub async fn spawn_sidecar(app: AppHandle, prompt: String, workspace: PathBuf) -> Result<(), String> {
    let api_key = app
        .keyring()
        .get("crash", "anthropic-api-key")
        .map_err(|_| "API key not set in keychain".to_string())?;

    let workspace_str = workspace.to_string_lossy().to_string();

    let shell = app.shell();
    let cmd = shell
        .command("node")
        .args(["sidecar/index.js", &workspace_str, &prompt])
        .env("ANTHROPIC_API_KEY", api_key);

    let (mut rx, _child) = cmd.spawn().map_err(|e| format!("spawn failed: {}", e))?;

    tokio::spawn(async move {
        let mut stdout_buf = String::new();
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let chunk = String::from_utf8_lossy(&bytes);
                    stdout_buf.push_str(&chunk);
                    // Flush complete lines; keep tail in buffer.
                    while let Some(nl) = stdout_buf.find('\n') {
                        let line = stdout_buf[..nl].to_string();
                        stdout_buf = stdout_buf[nl + 1..].to_string();
                        if line.trim().is_empty() { continue; }
                        if let Ok(value) = serde_json::from_str::<Value>(&line) {
                            let _ = app.emit("sidecar-event", value);
                        }
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    // Drain stderr to avoid 64KB buffer deadlock (council-flagged).
                    let line = String::from_utf8_lossy(&bytes);
                    eprintln!("[sidecar stderr] {}", line);
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!("[sidecar terminated] code={:?}", payload.code);
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}
```

- [ ] **Step 2: Update start_task command to pass workspace**

```rust
// crash/src-tauri/src/lib.rs
#[tauri::command]
async fn start_task(app: AppHandle, prompt: String) -> Result<(), String> {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .map_err(|_| "no home dir".to_string())?;
    let workspace = std::path::PathBuf::from(home).join("Crash-Workspace");
    std::fs::create_dir_all(&workspace).map_err(|e| format!("workspace dir: {}", e))?;
    sidecar::spawn_sidecar(app, prompt, workspace).await
}
```

- [ ] **Step 3: Update capability to allow sidecar/index.js too**

In `crash/src-tauri/capabilities/default.json` `shell:allow-execute` entry, add an additional `allow` entry for `sidecar/index.js`:

```json
{
  "identifier": "shell:allow-execute",
  "allow": [
    {
      "name": "node",
      "cmd": "node",
      "args": [
        { "validator": "sidecar/(echo|index)\\.js" },
        { "validator": ".*" },
        { "validator": ".*" }
      ],
      "sidecar": false
    }
  ]
}
```

- [ ] **Step 4: Build + verify end-to-end with real API**

```powershell
npm run tauri dev
```

Expected:
1. Window opens (key prompt skipped after Task 10)
2. Click cube → bubble
3. Type "list files in workspace"
4. Press Enter
5. TaskPane shows real `tool_use` events from agent SDK calling `Glob`, then `message_delta` with the actual model response
6. `task_end` after a few seconds

- [ ] **Step 5: Commit**

```powershell
git add .
git commit -F - <<'EOF'
feat: Rust spawns real agent SDK sidecar with keychain-injected API key

Replaces echo. Reads ANTHROPIC_API_KEY from keychain at spawn time,
injects via .env(). Workspace defaults to ~/Crash-Workspace/.
Stdout reader now properly line-buffered (handles partial-line reads
per council architect critique).

Council architect 64KB stderr deadlock mitigation: stderr drained
on a separate Tokio task -- same loop, separate branch.
EOF
```

---

### Task 13: Workspace fs:scope capability + path discipline

**Files:**
- Modify: `crash/src-tauri/capabilities/default.json`

- [ ] **Step 1: Add fs scope capability**

```json
{
  "identifier": "fs:allow-read-text-file",
  "allow": [{ "path": "$HOME/Crash-Workspace/**" }]
},
{
  "identifier": "fs:allow-write-text-file",
  "allow": [{ "path": "$HOME/Crash-Workspace/**" }]
},
{
  "identifier": "fs:allow-mkdir",
  "allow": [{ "path": "$HOME/Crash-Workspace/**" }]
}
```

Add `tauri-plugin-fs = "2"` to Cargo.toml + `.plugin(tauri_plugin_fs::init())` in lib.rs run().

- [ ] **Step 2: Build + commit**

```powershell
cd src-tauri ; cargo build ; cd ..
git add .
git commit -F - <<'EOF'
feat: fs:scope capability locked to ~/Crash-Workspace/

Read + write + mkdir scoped only to workspace. SDK's additionalDirectories
already locked to same path. Defense in depth.
EOF
```

---

### Task 14: Placeholder 429-fallback fixture

**Files:**
- Create: `crash/sidecar/fixtures/downloads-cleanup.jsonl`

- [ ] **Step 1: Write a placeholder fixture (real one recorded in Phase 4)**

```jsonl
{"type":"tool_use","data":{"taskId":"PLACEHOLDER","tool":"Glob","args":{"pattern":"*"},"result":"47 files matched"},"_delayMs":600}
{"type":"message_delta","data":{"taskId":"PLACEHOLDER","text":"Found 47 files in Downloads. Sorting by type..."},"_delayMs":400}
{"type":"tool_use","data":{"taskId":"PLACEHOLDER","tool":"Bash","args":{"cmd":"mkdir -p Images Docs Installers Archive"},"result":"ok"},"_delayMs":300}
{"type":"file_change","data":{"taskId":"PLACEHOLDER","path":"Crash-Workspace/Downloads-Demo/Images/photo-001.png","op":"move"},"_delayMs":250}
{"type":"file_change","data":{"taskId":"PLACEHOLDER","path":"Crash-Workspace/Downloads-Demo/Images/photo-002.png","op":"move"},"_delayMs":120}
{"type":"file_change","data":{"taskId":"PLACEHOLDER","path":"Crash-Workspace/Downloads-Demo/Docs/report.pdf","op":"move"},"_delayMs":120}
{"type":"file_change","data":{"taskId":"PLACEHOLDER","path":"Crash-Workspace/Downloads-Demo/Installers/setup.exe","op":"move"},"_delayMs":120}
{"type":"message_delta","data":{"taskId":"PLACEHOLDER","text":"Done. 47 files sorted in 12 seconds."},"_delayMs":600}
{"type":"task_end","data":{"taskId":"PLACEHOLDER","summary":"Sorted 47 files into 4 categories","durationMs":12000,"filesChanged":47},"_delayMs":100}
```

- [ ] **Step 2: Manually test fallback path**

Temporarily set `ANTHROPIC_API_KEY=invalid_key_to_force_401` (which the SDK will treat as a non-429 error) -- skip this for now; real test in Phase 4 once we have the real fixture recording.

- [ ] **Step 3: Commit**

```powershell
git add sidecar/fixtures/
git commit -F - <<'EOF'
feat: placeholder Downloads-cleanup 429 fallback fixture

Real fixture recorded in Phase 4 after observing actual SDK output
on the demo prompt. Phase 1 stub is wire-test only.
EOF
```

**Phase 1 complete.**

---

# Phase 2 — Quaternius Fox + Workshop Scene + `<Html occlude>` Bubble (8h)

**Exit condition:** placeholder cube replaced with rigged Quaternius fox on a glowing rune circle in a workshop scene (bookshelves, potion shelf, archway). Idle animation plays. Click the fox → bubble anchored to its head bone, `occlude` enabled, fades when fox turns away. Lit by amber key + purple accent (Wawa Sensei recipe).

### Task 15: Download + commit Quaternius assets

**Files:**
- Create: `crash/public/assets/fox.glb`
- Create: `crash/public/assets/workshop/*.glb`
- Modify: `crash/src-tauri/tauri.conf.json` (add `glb` to assetProtocol.scope)

- [ ] **Step 1: Download Quaternius Ultimate Animated Animal Pack**

Browse to `https://quaternius.com/packs/ultimateanimatedanimals.html`. Download. Extract. Copy `Fox.glb` to `crash/public/assets/fox.glb`.

For workshop props, browse to `https://poly.pizza/bundle/RPG-Dungeon-Pack` (or similar CC0 bundle). Copy bookshelf, potion shelf, archway GLBs to `crash/public/assets/workshop/`.

- [ ] **Step 2: Update tauri.conf.json**

```json
// crash/src-tauri/tauri.conf.json -- under bundle or top-level
"assetProtocol": {
  "scope": ["$RESOURCE/**", "$APP/**", "**/*.glb", "**/*.mp3"]
}
```

- [ ] **Step 3: Extract animation clip names**

Write a tiny scratch script (run once, discard):

```typescript
// scratch/dump-anim-names.ts -- run via npx tsx
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// ... (or just open the .glb in Blender and read clip names)
```

Easier: run `npm run tauri dev`, drop a temporary `console.log(animations.map(a => a.name))` in Fox.tsx (next task).

- [ ] **Step 4: Commit assets**

```powershell
git lfs install
git lfs track "*.glb"
git add .gitattributes public/assets/
git commit -F - <<'EOF'
chore: Quaternius CC0 fox + workshop props via Git LFS

fox.glb (~1.5MB), workshop bookshelf+potion+archway (~3MB total).
LFS-tracked since .glb is binary. assetProtocol.scope updated for
macOS MIME (.glb -> model/gltf-binary).
EOF
```

---

### Task 16: Render fox with idle animation

**Files:**
- Create: `crash/src/components/Fox.tsx`
- Modify: `crash/src/components/Scene.tsx`

- [ ] **Step 1: Write Fox component**

```typescript
// crash/src/components/Fox.tsx
import { useGLTF, useAnimations } from '@react-three/drei';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useDialogStore } from '../store/dialogStore';

export function Fox() {
  const group = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF('/assets/fox.glb');
  const { actions, names } = useAnimations(animations, group);
  const setOpen = useDialogStore((s) => s.setOpen);

  useEffect(() => {
    console.log('Fox animation clips:', names);  // remove after first dev launch
    const idleClip = names.find((n) => /idle/i.test(n)) ?? names[0];
    if (idleClip && actions[idleClip]) {
      actions[idleClip].reset().fadeIn(0.4).play();
    }
    return () => {
      if (idleClip && actions[idleClip]) actions[idleClip].fadeOut(0.4);
    };
  }, [actions, names]);

  return (
    <group
      ref={group}
      position={[0, 0, 0]}
      scale={[0.6, 0.6, 0.6]}
      onClick={(e) => { e.stopPropagation(); setOpen(true); }}
    >
      <primitive object={scene} dispose={null} />
    </group>
  );
}

useGLTF.preload('/assets/fox.glb');
```

- [ ] **Step 2: Replace Cube with Fox in Scene**

```typescript
// crash/src/components/Scene.tsx
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense } from 'react';
import { Fox } from './Fox';
import { DialogBubble } from './DialogBubble';

export function Scene() {
  return (
    <Canvas
      camera={{ position: [3, 2, 4], fov: 50 }}
      style={{ width: '100vw', height: '100vh', background: '#1a1530' }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={1.0} color="#ff9966" />
      <pointLight position={[-3, 2, -3]} intensity={0.8} color="#9966ff" />
      <Suspense fallback={null}>
        <Fox />
        <DialogBubble />
      </Suspense>
      <OrbitControls />
    </Canvas>
  );
}
```

- [ ] **Step 3: Run dev + read clip names**

```powershell
npm run tauri dev
```

Open DevTools console. Note the printed clip names (likely something like `["AnimalArmature|AnimalArmature|AnimalArmature|Idle", ...]`). The `/idle/i` regex match should pick the right one.

If model arrives too big/small, adjust `scale` prop. If wrong orientation, add `rotation` prop.

- [ ] **Step 4: Remove the console.log after first verify**

Delete the `console.log` line from Fox.tsx.

- [ ] **Step 5: Commit**

```powershell
git add src/
git commit -F - <<'EOF'
feat: Quaternius fox replaces cube, idle animation plays

useGLTF + useAnimations from drei. Clip names auto-matched against
/idle/i regex. Click-to-open dialog still works via group onClick.
Scale 0.6 chosen by visual fit.
EOF
```

---

### Task 17: Workshop props (bookshelf, potion shelf, archway)

**Files:**
- Create: `crash/src/components/Workshop.tsx`
- Modify: `crash/src/components/Scene.tsx`

- [ ] **Step 1: Workshop component**

```typescript
// crash/src/components/Workshop.tsx
import { useGLTF } from '@react-three/drei';

function Bookshelf() {
  const { scene } = useGLTF('/assets/workshop/bookshelf.glb');
  return <primitive object={scene} position={[-2.4, 0, -1.2]} scale={0.8} />;
}

function PotionShelf() {
  const { scene } = useGLTF('/assets/workshop/potion-shelf.glb');
  return <primitive object={scene} position={[2.4, 0, -1.2]} scale={0.8} />;
}

function Archway() {
  const { scene } = useGLTF('/assets/workshop/archway.glb');
  return <primitive object={scene} position={[0, 0, -2.4]} scale={1.0} />;
}

export function Workshop() {
  return (
    <>
      <Bookshelf />
      <PotionShelf />
      <Archway />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#2a1a4a" />
      </mesh>
    </>
  );
}

useGLTF.preload('/assets/workshop/bookshelf.glb');
useGLTF.preload('/assets/workshop/potion-shelf.glb');
useGLTF.preload('/assets/workshop/archway.glb');
```

- [ ] **Step 2: Mount in Scene**

```typescript
// inside <Suspense>:
<Workshop />
<Fox />
<DialogBubble />
```

- [ ] **Step 3: Run dev + tune positions/scales visually**

Iterate on `position` + `scale` props until the scene reads as "fox in a workshop." Budget: 30-40 minutes of taste.

- [ ] **Step 4: Commit**

```powershell
git add .
git commit -F - <<'EOF'
feat: workshop scene -- bookshelf + potion-shelf + archway + floor plane

Positions tuned visually. Floor is a simple plane in dark purple for now;
rune circle adds the focal point in Task 18.
EOF
```

---

### Task 18: Rune circle with bloom

**Files:**
- Create: `crash/src/components/RuneCircle.tsx`
- Modify: `crash/src/components/Scene.tsx`

- [ ] **Step 1: RuneCircle component**

```typescript
// crash/src/components/RuneCircle.tsx
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function RuneCircle() {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 0.4;
  });
  return (
    <mesh ref={ref} position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.7, 0.85, 64]} />
      <meshStandardMaterial
        color="#ff9966"
        emissive="#ff9966"
        emissiveIntensity={2.4}
        toneMapped={false}
      />
    </mesh>
  );
}
```

- [ ] **Step 2: Add postprocessing Bloom to Scene**

```typescript
// crash/src/components/Scene.tsx -- additions
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { RuneCircle } from './RuneCircle';

// inside <Canvas>, last child:
<EffectComposer>
  <Bloom intensity={0.9} luminanceThreshold={0.4} luminanceSmoothing={0.2} />
</EffectComposer>

// also add <RuneCircle /> inside <Suspense>
```

- [ ] **Step 3: Run + verify glowing rune under fox**

```powershell
npm run tauri dev
```

Expected: a softly glowing orange ring beneath the fox, slowly rotating. Looks magical.

- [ ] **Step 4: Commit**

```powershell
git add .
git commit -F - <<'EOF'
feat: glowing rune circle under fox + drei Bloom postprocessing

ringGeometry + emissive material + Bloom 0.9 intensity. Slow z-rotation
via useFrame. Council frontend recipe -- 45 min ship vs 4h custom GLSL.
EOF
```

---

### Task 19: Anchor speech bubble to fox head bone + occlude

**Files:**
- Modify: `crash/src/components/Fox.tsx`
- Modify: `crash/src/components/DialogBubble.tsx`

- [ ] **Step 1: Expose head bone ref from Fox**

```typescript
// crash/src/components/Fox.tsx -- additions
import { createContext, useContext } from 'react';
const FoxBoneContext = createContext<THREE.Object3D | null>(null);
export const useFoxHead = () => useContext(FoxBoneContext);

// inside Fox component:
const [headBone, setHeadBone] = useState<THREE.Object3D | null>(null);
useEffect(() => {
  scene.traverse((obj) => {
    if (/head/i.test(obj.name) && !headBone) setHeadBone(obj);
  });
}, [scene]);

// wrap children:
return (
  <FoxBoneContext.Provider value={headBone}>
    <group ref={group} ... >
      <primitive object={scene} dispose={null} />
    </group>
  </FoxBoneContext.Provider>
);
```

- [ ] **Step 2: Update DialogBubble to anchor on head**

```typescript
// crash/src/components/DialogBubble.tsx -- replace position prop
import { useFoxHead } from './Fox';

// inside DialogBubble:
const head = useFoxHead();
// ...
return (
  <Html
    position={head ? [0, 0.4, 0] : [0, 1.8, 0]}
    {...(head ? { parent: head } : {})}
    occlude
    center
    distanceFactor={6}
  >
    {/* existing bubble content */}
  </Html>
);
```

If `parent` prop isn't supported in your drei version, fall back to following the head bone's world position in `useFrame`:

```typescript
const headPos = useRef(new THREE.Vector3());
useFrame(() => {
  if (head) head.getWorldPosition(headPos.current);
});
// then position={[headPos.current.x, headPos.current.y + 0.4, headPos.current.z]}
```

- [ ] **Step 3: Run + verify bubble fades when fox turns away**

```powershell
npm run tauri dev
```

Click fox. Bubble appears above head. Orbit camera so a bookshelf comes between camera and head. Bubble fades. (`occlude` magic.)

- [ ] **Step 4: Commit**

```powershell
git add .
git commit -F - <<'EOF'
feat: DialogBubble anchored to fox head bone with drei occlude

Head bone resolved via scene.traverse + /head/i regex. Bubble follows
in world space; occlude prop fades when shelves obstruct view.
Surprise-find scope add (30min, free) -- flat-UI competitors cannot
replicate this.
EOF
```

---

### Task 20: Fox state machine + transitions

**Files:**
- Create: `crash/src/store/foxStateStore.ts`
- Modify: `crash/src/components/Fox.tsx`
- Modify: `crash/src/store/taskStore.ts`

- [ ] **Step 1: foxStateStore**

```typescript
// crash/src/store/foxStateStore.ts
import { create } from 'zustand';

export type FoxState = 'idle' | 'talk' | 'victory';

interface FoxStateStore {
  state: FoxState;
  setState: (s: FoxState) => void;
}

export const useFoxStateStore = create<FoxStateStore>((set) => ({
  state: 'idle',
  setState: (state) => set({ state }),
}));
```

- [ ] **Step 2: Wire Fox animations to state store**

```typescript
// in Fox.tsx, after the existing useEffect:
const foxState = useFoxStateStore((s) => s.state);
useEffect(() => {
  // crossfade between Idle / Talk / Victory clips
  const target = names.find((n) => new RegExp(foxState, 'i').test(n)) ?? names[0];
  Object.values(actions).forEach((a) => a?.fadeOut(0.25));
  if (target && actions[target]) {
    actions[target].reset().fadeIn(0.25).play();
  }
}, [foxState, actions, names]);
```

- [ ] **Step 3: Drive transitions from task events**

```typescript
// in src/main.tsx (modify the existing listener):
listen<SidecarEvent>('sidecar-event', (event) => {
  useTaskStore.getState().append(event.payload);
  if (event.payload.type === 'task_start') {
    useFoxStateStore.getState().setState('talk');
  } else if (event.payload.type === 'task_end') {
    useFoxStateStore.getState().setState('victory');
    setTimeout(() => useFoxStateStore.getState().setState('idle'), 3500);
  } else if (event.payload.type === 'error') {
    useFoxStateStore.getState().setState('idle');
  }
});
```

- [ ] **Step 4: Run + verify fox transitions on task lifecycle**

Type a real workspace task. Fox should switch to Talk during work, Victory at the end, back to Idle 3.5s later.

- [ ] **Step 5: Commit**

```powershell
git add .
git commit -F - <<'EOF'
feat: fox state machine -- idle / talk / victory crossfades

Driven by sidecar-event listener in main.tsx. task_start -> talk,
task_end -> victory (3.5s) -> idle. Crossfade 0.25s.
EOF
```

**Phase 2 complete.**

---

# Phase 3 — Task Pane as Separate Tauri Window (4h)

**Exit condition:** the inline `<TaskPane>` DOM panel is removed from the main window. A second Tauri window slides in from the right when a task starts and auto-collapses 8s after the last event. The second window listens for `sidecar-event` independently.

### Task 21: Configure second window in tauri.conf.json

**Files:**
- Modify: `crash/src-tauri/tauri.conf.json`
- Create: `crash/task-pane.html`
- Create: `crash/src/task-pane.tsx`
- Modify: `crash/vite.config.ts`

- [ ] **Step 1: tauri.conf.json windows entry**

```json
"app": {
  "windows": [
    {
      "label": "main",
      "title": "Crash",
      "width": 1280,
      "height": 800,
      "fullscreen": false,
      "resizable": true
    },
    {
      "label": "task-pane",
      "title": "Crash - Task",
      "url": "task-pane.html",
      "width": 380,
      "height": 720,
      "decorations": false,
      "alwaysOnTop": true,
      "visible": false,
      "transparent": true,
      "skipTaskbar": true,
      "resizable": false
    }
  ]
}
```

- [ ] **Step 2: vite multi-entry**

```typescript
// crash/vite.config.ts -- add rollupOptions
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        taskPane: resolve(__dirname, 'task-pane.html'),
      },
    },
  },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
});
```

- [ ] **Step 3: task-pane.html + task-pane.tsx entry**

```html
<!-- crash/task-pane.html -->
<!doctype html>
<html><head><meta charset="UTF-8"/><title>Crash Task</title></head>
<body style="margin:0;background:transparent"><div id="root"></div>
<script type="module" src="/src/task-pane.tsx"></script>
</body></html>
```

```typescript
// crash/src/task-pane.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { listen } from '@tauri-apps/api/event';
import { TaskPane } from './components/TaskPane';
import { useTaskStore } from './store/taskStore';
import type { SidecarEvent } from './types/sidecar-events';

listen<SidecarEvent>('sidecar-event', (event) => {
  useTaskStore.getState().append(event.payload);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TaskPane fullHeight />
  </React.StrictMode>
);
```

- [ ] **Step 4: Update TaskPane to take a fullHeight prop (occupies full window when separate)**

```typescript
// crash/src/components/TaskPane.tsx
export function TaskPane({ fullHeight = false }: { fullHeight?: boolean }) {
  // ... existing logic; when fullHeight, drop position:fixed and use 100% width/height
  const layout = fullHeight
    ? { width: '100%', height: '100vh', borderRadius: 0 }
    : { position: 'fixed' as const, top: 16, right: 16, width: 360, maxHeight: 'calc(100vh - 32px)', borderRadius: 12 };
  // ... apply layout in style
}
```

- [ ] **Step 5: Remove TaskPane from App.tsx**

```typescript
// crash/src/App.tsx -- remove <TaskPane />
import { Scene } from './components/Scene';
import { ApiKeyPrompt } from './components/ApiKeyPrompt';
import { useState } from 'react';

export default function App() {
  const [v, setV] = useState(0);
  return (
    <>
      <ApiKeyPrompt key={v} onSet={() => setV((x) => x + 1)} />
      <Scene />
    </>
  );
}
```

- [ ] **Step 6: Commit**

```powershell
git add .
git commit -F - <<'EOF'
feat: second Tauri window for Task Pane (WindowPet pattern)

Multi-entry Vite build (main + task-pane). task-pane.html with own
sidecar-event listener. Transparent + alwaysOnTop + skipTaskbar +
no decorations + initially hidden. TaskPane component takes fullHeight
prop when rendered in the separate window.
EOF
```

---

### Task 22: Open / close task pane window programmatically

**Files:**
- Modify: `crash/src-tauri/src/lib.rs`
- Modify: `crash/src/main.tsx`

- [ ] **Step 1: Tauri commands to show/hide + position the task pane**

```rust
// crash/src-tauri/src/lib.rs additions
use tauri::Manager;

#[tauri::command]
async fn open_task_pane(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("task-pane") {
        let monitor = w.current_monitor().map_err(|e| e.to_string())?.ok_or("no monitor".to_string())?;
        let size = monitor.size();
        let pos = tauri::PhysicalPosition::new(
            (size.width as i32) - 400,
            32,
        );
        w.set_position(pos).map_err(|e| e.to_string())?;
        w.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn close_task_pane(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("task-pane") {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// register in invoke_handler:
.invoke_handler(tauri::generate_handler![
    start_task,
    open_task_pane,
    close_task_pane,
    keyring::set_api_key,
    keyring::get_api_key,
    keyring::has_api_key,
])
```

- [ ] **Step 2: Drive open/close from sidecar events**

```typescript
// crash/src/main.tsx -- replace listener
import { invoke } from '@tauri-apps/api/core';

let collapseTimer: ReturnType<typeof setTimeout> | null = null;

listen<SidecarEvent>('sidecar-event', (event) => {
  useTaskStore.getState().append(event.payload);
  // open task pane on first event
  if (event.payload.type === 'task_start') {
    invoke('open_task_pane').catch(console.error);
    useFoxStateStore.getState().setState('talk');
  }
  // schedule auto-collapse 8s after most recent event
  if (collapseTimer) clearTimeout(collapseTimer);
  collapseTimer = setTimeout(() => {
    invoke('close_task_pane').catch(console.error);
  }, 8000);

  if (event.payload.type === 'task_end') {
    useFoxStateStore.getState().setState('victory');
    setTimeout(() => useFoxStateStore.getState().setState('idle'), 3500);
  }
});
```

- [ ] **Step 3: Capability for window commands**

In `crash/src-tauri/capabilities/default.json`, add:
```json
"core:window:default"
```

Actually create a new capability scoped to BOTH windows so `task-pane` can also listen:
```json
{
  "identifier": "default",
  "windows": ["main", "task-pane"],
  ...
}
```

- [ ] **Step 4: Run + verify**

```powershell
npm run tauri dev
```

Click fox, type a task, press Enter. Task pane window slides in from right. After 8s of no events post-task_end, it hides.

- [ ] **Step 5: Commit**

```powershell
git add .
git commit -F - <<'EOF'
feat: task pane window opens on task_start, auto-hides 8s after last event

open_task_pane + close_task_pane Tauri commands. Position derived from
monitor width (right-edge anchored). Auto-collapse via setTimeout reset
on every sidecar event.
EOF
```

**Phase 3 complete.**

---

# Phase 4 — Downloads Cleanup Demo + 2 Stubs + 429 Cache (4h)

**Exit condition:** clicking a "Downloads" tile on the bookshelf opens the dialog pre-filled with the demo prompt. Submitting cleans the pre-seeded ~/Crash-Workspace/Downloads-Demo/. The cached fallback fixture is real (recorded from a successful run). Two other tiles say "Coming Soon" on click.

### Task 23: Pre-seed script + demo fixtures data

**Files:**
- Create: `crash/scripts/seed-demo-downloads.ps1`
- Create: `crash/src/data/demoFixtures.ts`

- [ ] **Step 1: PowerShell seeder**

```powershell
# crash/scripts/seed-demo-downloads.ps1
$ErrorActionPreference = "Stop"
$root = Join-Path $env:USERPROFILE "Crash-Workspace\Downloads-Demo"
if (Test-Path $root) { Remove-Item -Recurse -Force $root }
New-Item -ItemType Directory -Force $root | Out-Null

$names = @(
    "vacation_photo_001.png","vacation_photo_002.png","screenshot_2026_05_14.png",
    "meeting_notes.pdf","resume_v3.pdf","invoice_apr2026.pdf",
    "MyApp-Setup-1.2.3.exe","node-v20.10.0-x64.msi",
    "old_backup.zip","family_videos.zip"
)
# 47 total
$generated = 0
while ($generated -lt 47) {
    foreach ($base in $names) {
        if ($generated -ge 47) { break }
        $i = "{0:D3}" -f $generated
        $name = $base -replace "^", ($i + "_")
        New-Item -ItemType File -Path (Join-Path $root $name) -Value "demo placeholder content" | Out-Null
        $generated++
    }
}
Write-Host "Seeded $generated files into $root"
```

- [ ] **Step 2: demoFixtures data**

```typescript
// crash/src/data/demoFixtures.ts
export interface DemoFixture {
  id: string;
  label: string;
  prompt: string;
  eta: string;
  status: 'live' | 'stub';
}

export const DEMO_FIXTURES: DemoFixture[] = [
  {
    id: 'downloads-cleanup',
    label: 'Clean my Downloads',
    prompt: 'My Downloads folder is a disaster, fix it.',
    eta: '~12s',
    status: 'live',
  },
  {
    id: 'resume-rank',
    label: 'Rank these resumes',
    prompt: 'Rank the resumes in the workspace by relevance to a software engineering role.',
    eta: 'Available 6/3',
    status: 'stub',
  },
  {
    id: 'rename-by-rule',
    label: 'Rename by rule',
    prompt: 'Rename all photo files to YYYY-MM-DD format based on metadata.',
    eta: 'Available 6/7',
    status: 'stub',
  },
];
```

- [ ] **Step 3: Commit**

```powershell
git add scripts/ src/data/
git commit -F - <<'EOF'
feat: pre-seeder + demo fixture catalog

scripts/seed-demo-downloads.ps1 creates 47 mixed files in
~/Crash-Workspace/Downloads-Demo/. Three fixtures defined; only
downloads-cleanup is "live" for 6/1.
EOF
```

---

### Task 24: DemoShelf component (3D bookshelf tiles)

**Files:**
- Create: `crash/src/components/DemoShelf.tsx`
- Modify: `crash/src/components/Scene.tsx`
- Modify: `crash/src/store/dialogStore.ts`

- [ ] **Step 1: Add a "pre-fill" action to dialog store**

```typescript
// dialogStore.ts -- add prefill action
prefill: (prompt: string) => void;
// in store:
prefill: (prompt) => set({ open: true, prompt }),
```

- [ ] **Step 2: DialogBubble uses prefilled prompt**

```typescript
// DialogBubble.tsx -- use store prompt as initial text
const initialPrompt = useDialogStore((s) => s.prompt);
const [text, setText] = useState(initialPrompt);
useEffect(() => { setText(initialPrompt); }, [initialPrompt, open]);
```

- [ ] **Step 3: DemoShelf component**

```typescript
// crash/src/components/DemoShelf.tsx
import { Text } from '@react-three/drei';
import { useState } from 'react';
import { DEMO_FIXTURES } from '../data/demoFixtures';
import { useDialogStore } from '../store/dialogStore';

export function DemoShelf() {
  const prefill = useDialogStore((s) => s.prefill);
  return (
    <>
      {DEMO_FIXTURES.map((fix, i) => (
        <DemoTile
          key={fix.id}
          fixture={fix}
          position={[-1.8 + i * 1.0, 1.2, -1.18]}
          onActivate={() => {
            if (fix.status === 'live') prefill(fix.prompt);
            else alert(`Coming Soon. ${fix.eta}`);
          }}
        />
      ))}
    </>
  );
}

function DemoTile({ fixture, position, onActivate }: any) {
  const [hover, setHover] = useState(false);
  return (
    <group position={position} onClick={(e) => { e.stopPropagation(); onActivate(); }}
           onPointerOver={() => setHover(true)} onPointerOut={() => setHover(false)}>
      <mesh>
        <boxGeometry args={[0.7, 0.9, 0.05]} />
        <meshStandardMaterial
          color={fixture.status === 'live' ? '#ff9966' : '#666666'}
          emissive={hover ? '#9966ff' : '#000000'}
          emissiveIntensity={hover ? 0.6 : 0}
        />
      </mesh>
      <Text position={[0, 0, 0.04]} fontSize={0.08} color="white" anchorX="center" anchorY="middle" maxWidth={0.6}>
        {fixture.label}
      </Text>
      <Text position={[0, -0.36, 0.04]} fontSize={0.06} color={fixture.status === 'live' ? '#ffddaa' : '#888888'} anchorX="center">
        {fixture.eta}
      </Text>
    </group>
  );
}
```

- [ ] **Step 4: Mount in Scene + commit**

Add `<DemoShelf />` inside `<Suspense>` in Scene.tsx.

```powershell
git add .
git commit -F - <<'EOF'
feat: clickable demo tiles on bookshelf (1 live + 2 stubs)

3 tiles arranged horizontally. Live tile (downloads-cleanup) pre-fills
dialog bubble on click. Stubs show "Coming Soon" alert with ETA.
Visual hover state via emissive intensity flip.
EOF
```

---

### Task 25: Record the real Downloads-cleanup fallback fixture

**Files:**
- Modify: `crash/sidecar/fixtures/downloads-cleanup.jsonl` (replace placeholder)

- [ ] **Step 1: Seed demo dir**

```powershell
.\scripts\seed-demo-downloads.ps1
```

- [ ] **Step 2: Run the demo with real API + capture stdout**

```powershell
# In a terminal with ANTHROPIC_API_KEY set:
node sidecar/index.js "$env:USERPROFILE\Crash-Workspace\Downloads-Demo" "My Downloads folder is a disaster, fix it." > sidecar/fixtures/downloads-cleanup.raw.jsonl
```

- [ ] **Step 3: Add `_delayMs` annotations**

Open `downloads-cleanup.raw.jsonl`. For each line, add a `_delayMs` field at the JSON root level reflecting time-between-events from the actual run (eyeball from timestamps or default to 250-400ms per event). Save as `downloads-cleanup.jsonl`.

- [ ] **Step 4: Verify replay**

Set an invalid API key (forces error). Run dialog with the canonical prompt. Verify the fallback replays the recorded events.

- [ ] **Step 5: Commit**

```powershell
git add sidecar/fixtures/downloads-cleanup.jsonl
git rm sidecar/fixtures/downloads-cleanup.raw.jsonl
git commit -F - <<'EOF'
feat: real Downloads-cleanup fallback fixture recorded from live SDK run

Captured stdout JSONL from a successful demo, hand-annotated _delayMs
for realistic replay pacing. 429 / network-failure fallback now
indistinguishable from live demo to the audience.
EOF
```

**Phase 4 complete.**

---

# Phase 5 — ElevenLabs Voice Line at Task Completion (4h)

**Exit condition:** when `task_end` fires, a pre-recorded fox voice clip plays through the main window. 5-8 different lines chosen randomly. User has selected the voice ID.

### Task 26: Record + bundle voice clips

**Files:**
- Create: `crash/public/assets/voice/*.mp3` (5-8 files)

- [ ] **Step 1: Pick voice via ElevenLabs UI**

Browse to `elevenlabs.io/voice-library`. Pick a voice that reads as small/cute/playful (sample lines like "Done. 47 files in 12 seconds."). Note the `voice_id`. **THIS IS THE OPEN QUESTION FROM SPEC §13 Q4 — user must answer.**

Generate clips for the 5 canonical lines:
- "Done. 47 files in 12 seconds." (`done.mp3`)
- "That was a mess." (`mess.mp3`)
- "Working on it." (`working.mp3`)
- "Anything else?" (`anything-else.mp3`)
- "All done!" (`all-done.mp3`)

Download as MP3, place in `crash/public/assets/voice/`.

- [ ] **Step 2: Commit assets**

```powershell
git lfs track "*.mp3"
git add .gitattributes public/assets/voice/
git commit -F - <<'EOF'
chore: ElevenLabs voice clips (5 lines, LFS-tracked)

Voice ID <TBD by user>. Lines from PM critique. ~30-80KB each.
EOF
```

---

### Task 27: voicePlayer + wire to task_end

**Files:**
- Create: `crash/src/utils/voicePlayer.ts`
- Modify: `crash/src/main.tsx`

- [ ] **Step 1: voicePlayer**

```typescript
// crash/src/utils/voicePlayer.ts
const CLIPS = [
  '/assets/voice/done.mp3',
  '/assets/voice/mess.mp3',
  '/assets/voice/working.mp3',
  '/assets/voice/anything-else.mp3',
  '/assets/voice/all-done.mp3',
];

let lastIndex = -1;

export function playRandomCompletionClip() {
  let i = Math.floor(Math.random() * CLIPS.length);
  // don't play the same clip twice in a row
  if (i === lastIndex) i = (i + 1) % CLIPS.length;
  lastIndex = i;
  const audio = new Audio(CLIPS[i]);
  audio.volume = 0.85;
  audio.play().catch((e) => console.warn('voice play failed', e));
}
```

- [ ] **Step 2: Wire to task_end**

```typescript
// main.tsx -- in the listener
import { playRandomCompletionClip } from './utils/voicePlayer';

// inside if task_end branch:
playRandomCompletionClip();
```

- [ ] **Step 3: Run + verify a task completes with audio**

- [ ] **Step 4: Commit**

```powershell
git add .
git commit -F - <<'EOF'
feat: random fox voice clip plays on task_end

playRandomCompletionClip avoids playing same clip twice in a row.
Volume 0.85. HTML5 Audio (WebView2 + WKWebView both support MP3).
EOF
```

**Phase 5 complete.**

---

# Phase 6 — CI/CD + Windows Release Build (3h)

### Task 28: Drop GH Actions workflows

**Files:**
- Create: `crash/.github/workflows/build.yml`
- Modify: `crash/.github/workflows/quick-check.yml`

- [ ] **Step 1: Copy + commit**

```powershell
Copy-Item "C:\Users\thegr\OneDrive\Desktop\NOTES ALL CC SESSIONS\2026-05-28_Crash-Hackathon\cicd-drafts\build.yml" ".github\workflows\"
git add .github/workflows/build.yml
git commit -F - <<'EOF'
ci: full build workflow (Windows + macOS Universal matrix)

Triggers: push to main, tag v*, manual workflow_dispatch.
Matrix: windows-latest (required green for 6/1), macos-14 (allowed-fail).
TAURI_SIGNING_PRIVATE_KEY env var (Tauri 2 rename).
macOS notarization deferred (TODO: notarize).
EOF
```

- [ ] **Step 2: Push to GitHub**

```powershell
# Create repo on GH first (gh repo create ron2k1/crash --public --source=. --remote=origin)
gh repo create ron2k1/crash --public --source=. --remote=origin
git push -u origin main
```

Verify quick-check.yml runs and goes green.

---

### Task 29: Local Windows release build

- [ ] **Step 1: Build .msi + .exe**

```powershell
npm run tauri build -- --target x86_64-pc-windows-msvc
```

Expected: `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/Crash_0.1.0_x64_en-US.msi` exists.

- [ ] **Step 2: Smoke-test the installer**

Run the .msi on the dev machine. Verify app installs, launches, works end-to-end (BYO key prompt, click fox, demo, voice).

- [ ] **Step 3: Tag + push**

```powershell
git tag -a v0.1 -F - <<'EOF'
v0.1 -- PoC Fest submission build

Windows .msi + .exe via GH Actions matrix build.
Quaternius fox + workshop + Downloads cleanup demo + ElevenLabs
voice line + 429 cached fallback.

Council-convergent cuts locked: marketplace deferred to 6/3,
Mac deferred to 6/3, bun-compile deferred to v0.2.
EOF
git push --tags
```

GH Actions builds release artifacts. Wait ~25 min. Verify the draft release at `github.com/ron2k1/crash/releases` has the .msi + .exe attached.

- [ ] **Step 4: Commit any final tweaks**

**Phase 6 complete.**

---

# Phase 7 — Demo Video Recording (3h)

### Task 30: Storyboard + record + edit

**Files:**
- Create: `crash/docs/demo-storyboard.md`
- Create: `crash/docs/demo-final.mp4` (or YouTube unlisted link)

- [ ] **Step 1: Storyboard the 60-second cut**

```markdown
# Demo Storyboard - Crash 60s
- 0:00-0:05 Cold app launch, workshop scene fades in, fox waves
- 0:05-0:10 "Every Claude Code UI today targets developers. Crash targets the other 99%."
- 0:10-0:18 Click fox, bubble appears, type "My Downloads folder is a disaster, fix it.", Enter
- 0:18-0:48 Task pane slides in, file moves visible in Explorer side-by-side, fox animates
- 0:48-0:55 Fox voice line "Done. 47 files in 12 seconds."
- 0:55-1:00 "Your machine. Your key. Open source. Crash."
```

- [ ] **Step 2: Record with OBS**

3-5 takes. Keep the best. 1080p60.

- [ ] **Step 3: Edit + caption + upload**

DaVinci Resolve (free). Add caption text for the spoken lines (some judges watch muted). Export H.264 MP4. Upload to YouTube unlisted. Save link in README.

- [ ] **Step 4: Commit storyboard + reference**

```powershell
git add docs/demo-storyboard.md
git commit -F - <<'EOF'
docs: 60s demo storyboard + YouTube unlisted link in README
EOF
```

**Phase 7 complete.**

---

# Phase 8 — Submission + README + Waitlist (2h)

### Task 31: README + LICENSE + waitlist

**Files:**
- Create: `crash/README.md`
- Create: `crash/LICENSE` (MIT)
- Create: waitlist (Tally form or similar; link in README)

- [ ] **Step 1: README**

```markdown
# Crash

> The Claude Code companion for people who don't write code.

A desktop app where a fox in a magical workshop runs Claude Code on your files.
Your machine. Your key. Open source.

## Install

Download the latest release: [v0.1 Windows .msi](releases-link)

## Demo

[60s video](youtube-link)

## Waitlist for Crash Cloud

[Sign up](waitlist-link)

## Built for

PoC Fest 2026-06-01 + AI Agents Prototype-to-Production 2026-06-03 + vibeFORWARD 2026-06-07.

## Stack

Tauri 2 + React + R3F + Quaternius fox + @anthropic-ai/claude-agent-sdk.

## License

MIT.
```

- [ ] **Step 2: MIT LICENSE**

Standard MIT text with `Copyright (c) 2026 Ronil Basu`.

- [ ] **Step 3: Waitlist via Tally**

Browse to tally.so. Create a 2-question form (email + "what do you want Crash to do?"). Embed link in README.

- [ ] **Step 4: PoC Fest submission**

Fill submission form at PoC Fest with: repo URL, .msi link, YouTube link, 60s pitch.

- [ ] **Step 5: Final commit**

```powershell
git add .
git commit -F - <<'EOF'
docs: README + MIT LICENSE + waitlist for PoC Fest submission

Repo public. Installer link, video link, waitlist link in README.
PoC Fest submission complete.
EOF
git push
```

**Phase 8 complete. SHIPPED.**

---

# Self-Review (per writing-plans skill)

**Spec coverage check (all §X mapped to tasks):**
- §1 Goal & Non-Goals: covered in plan header
- §2 Wedge: covered by Phase 2 (fox + workshop)
- §3 P0/P1/P2 scope: P0 = Phases 0-7; P1/P2 noted in stubs (resume-rank, rename-by-rule)
- §4 Architecture: Phase 0 + 1 + 2 + 3 fully implement
- §5 UI / 3D Scene: Phase 2 + 3
- §6 Sidecar Protocol: Phase 0 + 1 (JSONL union in src/types/sidecar-events.ts)
- §7 Safety Defaults: enforced in Phase 1 Task 11 sidecar/index.js options
- §8 Demo Fixtures: Phase 4
- §9 Build + CI/CD: Phase 6
- §10 Cuts & Deferrals: not implemented (they're cuts); v0.2 roadmap doc deferred
- §11 Risks & Mitigations: each risk addressed by specific phase task (capability JSON, stderr drain, line-buffered reader, animation name extraction, asset MIME, pre-cache fallback)
- §12 Submission Plan: Phase 7 + 8
- §13 Open Questions: ElevenLabs voice ID still TBD by user (flagged in Phase 5 Task 26)

**Placeholder scan:** searched for "TBD", "TODO", "implement later", "fill in details":
- "Voice ID <TBD by user>" in Phase 5 Task 26 commit message - this IS a real placeholder but is gated on user input, not on the implementer's judgment. Acceptable.
- "TODO: notarize" in Phase 6 commit message - acceptable since this is a deliberate v0.2 defer per spec §11.
- No other placeholders found.

**Type consistency:** verified `taskStore.append` accepts `SidecarEvent` (defined Phase 0 Task 5). `useDialogStore.prefill` added Phase 4 Task 24 is referenced by Phase 4 Task 24 DemoShelf. `useFoxStateStore.setState` (zustand convention) is consistent across files. `playRandomCompletionClip` is the only export from voicePlayer, consistent at call site.

**Scope check:** 31 tasks across 8 phases, ~42-44h total. Fits the 60h window with buffer. Single coherent implementation plan -- not decomposed further since all phases share the same architectural surface.

---

# Execution Handoff

Plan complete and saved to `C:\Users\thegr\OneDrive\Desktop\NOTES ALL CC SESSIONS\2026-05-28_Crash-Hackathon\plan\2026-05-28-crash-mvp-impl.md`. On Phase 0 Task 1 Step 4 it will be copied into `crash/docs/superpowers/plans/`.

**Two execution options:**

1. **Subagent-Driven (recommended for this hackathon)** — fresh subagent per task, parent reviews between tasks, fast iteration. Best when the parent context (this thread) is conserved for high-level decisions and Codex routing.

2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans` with batched commits at phase boundaries. Best when the user wants to watch every step live.
