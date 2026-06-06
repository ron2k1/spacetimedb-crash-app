// Builds the Crash engine into a single self-contained Windows .exe via Node SEA
// (Single Executable Applications). Invoked by BOTH the local build and the
// release.yml CI workflow so the packaging recipe never drifts between them.
//
// Pipeline:
//   1. esbuild  -- bundle the ESM engine (backend/dist/host.js + the @crash/protocol
//                  workspace dep + `ws`) into one CommonJS file. SEA requires CJS.
//   2. node --experimental-sea-config  -- turn that CJS file into a SEA blob.
//   3. copy the *running* node.exe as the base binary (no download; the blob is only
//      valid against the exact Node version that produced it -- so reuse this one).
//   4. postject  -- inject the blob into the copied exe under the SEA fuse.
//
// Output: frontend/r3f-shell/src-tauri/binaries/crash-engine-<triple>.exe -- the exact
// name Tauri's `externalBin: ["binaries/crash-engine"]` resolves to at build time.
//
// SECURITY: this script only packages code. It never reads, prints, or persists the
// engine's per-session auth token; that token is minted at runtime and written to
// ~/Crash/.runtime/socket.json (mode 0600), never here.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const backendDir = path.join(repoRoot, 'backend');
const buildDir = path.join(backendDir, '.sea-build');
const entry = path.join(backendDir, 'dist', 'host.js');
const bundleCjs = path.join(buildDir, 'crash-engine.cjs');
const seaConfig = path.join(buildDir, 'sea-config.json');
const blob = path.join(buildDir, 'sea-prep.blob');

// Tauri sidecars must carry the target-triple suffix + the host's exe extension.
const triple = process.env.CRASH_TARGET_TRIPLE || 'x86_64-pc-windows-msvc';
const exeExt = process.platform === 'win32' ? '.exe' : '';
const outDir = path.join(repoRoot, 'frontend', 'r3f-shell', 'src-tauri', 'binaries');
const outExe = path.join(outDir, `crash-engine-${triple}${exeExt}`);

// Pinned so a surprise upstream major can't silently change the packaging output.
const ESBUILD = 'esbuild@0.27.7';
const POSTJECT = 'postject@1.0.0-alpha.6';

const isWin = process.platform === 'win32';

// The SEA sentinel fuse is baked into each Node binary, and its hash rotates between Node
// majors (v20's "...2b0ff2" is NOT v24's). Read it straight from the running interpreter so
// this recipe never breaks on a Node upgrade -- the tutorials' hardcoded value goes stale.
function detectFuse(nodeExe) {
  const m = fs.readFileSync(nodeExe).toString('latin1').match(/NODE_SEA_FUSE_[0-9a-fA-F]+/);
  if (!m) {
    console.error('[build-engine] no NODE_SEA_FUSE sentinel in the Node binary -- SEA unsupported?');
    process.exit(1);
  }
  return m[0];
}
const SENTINEL = detectFuse(process.execPath);
console.log(`[build-engine] detected SEA fuse: ${SENTINEL}`);

function npx(args) {
  // On Windows `npx` is a .cmd shim; since the CVE-2024-27980 hardening, execFile
  // refuses .cmd without a shell. Paths here all live under repoRoot (no spaces),
  // so shell word-splitting is safe.
  const cmd = isWin ? 'npx.cmd' : 'npx';
  console.log(`[build-engine] npx ${args.join(' ')}`);
  execFileSync(cmd, ['--yes', ...args], { stdio: 'inherit', cwd: repoRoot, shell: isWin });
}

if (!fs.existsSync(entry)) {
  console.error(`[build-engine] missing ${entry} -- run \`pnpm --filter @crash/engine build\` first.`);
  process.exit(1);
}

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

// 1. ESM -> single CJS. The empty-import-meta warning is expected (catalog.ts guards it)
//    and silenced so it never reads as a CI failure.
npx([
  ESBUILD,
  entry,
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--target=node20',
  `--outfile=${bundleCjs}`,
  '--external:bufferutil',
  '--external:utf-8-validate',
  '--log-override:empty-import-meta=silent',
]);

// 2. SEA config -> blob, using the running interpreter.
fs.writeFileSync(
  seaConfig,
  JSON.stringify({ main: bundleCjs, output: blob, disableExperimentalSEAWarning: true }, null, 2),
);
console.log('[build-engine] node --experimental-sea-config');
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], {
  stdio: 'inherit',
  cwd: repoRoot,
});

// 3. Copy the running node.exe as the SEA base.
fs.copyFileSync(process.execPath, outExe);

// 4. Inject the blob. (Windows PE has no code signature to remove, so no --macho-* flags.)
npx([POSTJECT, outExe, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', SENTINEL]);

const sizeMb = (fs.statSync(outExe).size / (1024 * 1024)).toFixed(1);
console.log(`[build-engine] wrote ${outExe} (${sizeMb} MB)`);

// 5. Stage the marketplace catalog next to the Tauri config so `bundle.resources` ships it.
//    The packaged engine resolves it via CRASH_CATALOG_ROOT (set by the Rust shell at spawn);
//    in dev the engine finds backend/catalog directly, so this copy is packaging-only.
const catalogSrc = path.join(backendDir, 'catalog');
const catalogDst = path.join(repoRoot, 'frontend', 'r3f-shell', 'src-tauri', 'catalog');
fs.rmSync(catalogDst, { recursive: true, force: true });
fs.cpSync(catalogSrc, catalogDst, { recursive: true });
console.log(`[build-engine] staged catalog -> ${catalogDst}`);
