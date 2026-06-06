# Crash -- Deployment and Packaging Runbook

How to turn the Crash monorepo into a downloadable Windows installer, what the
installer ships, and how an end user installs and runs it. This is the operator
runbook for the dual-renderer R3F + Tauri shell; the headless engine is bundled
inside the app as a sidecar.

Audience: the operator building the release on a Windows machine with the build
toolchain. The end-user flow (download, install, run) is in the last section.

## What ships

The product is a Tauri 2 desktop app (`@crash/r3f-shell`) that hosts a web
renderer (Vite 7 + React 19 + react-three-fiber + Spline). The renderer is a
skin; the brain is the headless Node engine (`@crash/engine`), which runs as a
bundled sidecar process and speaks `@crash/protocol` (PROTOCOL_VERSION = 3) over
a token-gated `127.0.0.1` WebSocket.

The installer is a single NSIS `setup.exe`. It carries:

| Component        | Source                                | How it is bundled                         |
| ---------------- | ------------------------------------- | ----------------------------------------- |
| Tauri shell      | `frontend/r3f-shell/src-tauri`        | The app executable (Rust release build)   |
| Web renderer     | `frontend/r3f-shell` (Vite build)     | `frontendDist` baked into the app         |
| Crash engine     | `backend/` (`@crash/engine`)          | A single-exe sidecar (`externalBin`)      |
| Curriculum seed  | `curriculum/`                         | A bundled resource, copied on first run   |

Voice is OUT of scope under the current spec revision, so no Whisper / audio
runtime ships.

## Prerequisites (build machine)

The build runs on Windows (the 6/1 demo target OS). Install once:

| Tool                  | Why                                                | Notes                                                       |
| --------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| Rust (stable) + Cargo | Compiles the Tauri shell                           | `rustup` default toolchain; `x86_64-pc-windows-msvc`        |
| MSVC build tools      | Rust's Windows linker                              | "Desktop development with C++" workload, or the Build Tools |
| WebView2 runtime      | Tauri's webview on Windows                         | Preinstalled on Windows 11; Evergreen on Windows 10         |
| Node 20 LTS           | Runs pnpm, tsc, and the engine sidecar packager    | The engine targets Node 20                                  |
| pnpm 10               | Workspace package manager                          | Pinned via root `package.json` `packageManager`            |
| Tauri CLI 2           | Drives `tauri build`                               | Already a devDependency of `@crash/r3f-shell`; no global    |

The Tauri CLI is invoked through the workspace (`pnpm --filter @crash/r3f-shell run tauri ...`)
so no global install is required. To verify the toolchain without a global CLI:
`pnpm --filter @crash/r3f-shell exec tauri info`.

## How the engine ships as a sidecar

Tauri's `bundle.externalBin` mechanism bundles an external executable next to the
app and lets the shell spawn it through the shell plugin's sidecar API. The config
entry is:

```
"bundle": { "externalBin": ["binaries/crash-engine"] }
```

Tauri resolves that to a target-triple-suffixed file at bundle time. On the
Windows demo target it expects, relative to `frontend/r3f-shell/src-tauri/`:

```
binaries/crash-engine-x86_64-pc-windows-msvc.exe
```

The engine is well suited to a single-exe: it is pure Node plus one dependency
(`ws`) with no native addons. Its `bin.crash-engine` entry point is `dist/host.js`.
The exe is produced by exactly one script -- `installer/build-engine-exe.mjs` --
invoked by BOTH the local build and `release.yml`, so the CI and local recipes can never
drift. It uses Node Single Executable Applications (SEA): esbuild bundles the ESM engine
plus `ws` into one CommonJS file, `node --experimental-sea-config` turns that into a blob,
the running `node` binary is copied as the base, and `postject` injects the blob under the
SEA fuse (auto-detected from the binary, so a Node-major bump can't break it). The script
also stages `backend/catalog/` to `src-tauri/catalog/` for the `bundle.resources` glob.
Output is the triple-suffixed exe `bundle.externalBin` resolves at bundle time:

```
frontend/r3f-shell/src-tauri/binaries/crash-engine-x86_64-pc-windows-msvc.exe
```

This SEA recipe replaced an earlier `@yao-pkg/pkg` attempt: the deploy audit flagged
ESM-in-single-exe plus bundling `ws` as the gating packaging risk, and SEA is the recipe
that resolved it -- proven locally end to end (the exe boots, prints one `engine.ready`
JSON line, and writes a valid `~/Crash/.runtime/socket.json`).

## How the shell launches the engine (packaged build)

In a packaged build there is no Vite serve step, so the Rust shell owns engine launch
and boot injection. This is implemented in `frontend/r3f-shell/src-tauri/src/`
(`lib.rs` setup hook + `sidecar.rs`) and the capability file; here is what it does.

1. Spawn the engine sidecar and inject the boot descriptor. On a release build the
   setup hook calls `sidecar::spawn_engine_and_resolve_boot` on a worker thread (so the
   main thread is never blocked). It spawns the `binaries/crash-engine` sidecar, waits for
   the engine to write `socket.json` itself (mode 0600), reads ONLY the five connection
   fields (`host`, `port`, `token`, `protocolVersion`, `provider`), and injects them as
   `window.__CRASH_BOOT__` via an initialization script that runs before the renderer's
   boot resolver (`src/net/boot.ts`). The token is never logged or persisted; the engine's
   `engine.ready` stdout line (which carries it) is drained, not displayed. In dev
   (`tauri dev`, a debug build) this is skipped: the Vite plugin `crashBootInject`
   (`apply: "serve"`) supplies `window.__CRASH_BOOT__` and the operator launches the engine
   manually.

2. The capability is scoped to exactly that sidecar. `capabilities/default.json` grants
   `shell:allow-execute` for the `binaries/crash-engine` sidecar (and `dialog:allow-open`
   for the native file picker), nothing broader:

   ```
   { "identifier": "shell:allow-execute",
     "allow": [ { "name": "binaries/crash-engine", "sidecar": true } ] }
   ```

   Because the engine is reached over the WebSocket transport (not over the sidecar's
   stdio), the capability surface stays minimal.

The end user's provider preference (Claude Code vs Codex) reaches the packaged engine
through a `set_provider_preference` command that forwards the enum string only -- never a
token -- and takes effect on the next packaged launch.

## Local build command (exact)

From the repo root, on the Windows build machine:

```
pnpm install
pnpm --filter @crash/protocol run build
pnpm --filter @crash/engine run build
```

Produce the engine sidecar exe with the one canonical packaging script (run from the
repo root):

```
node installer/build-engine-exe.mjs
```

(It emits `frontend/r3f-shell/src-tauri/binaries/crash-engine-x86_64-pc-windows-msvc.exe`
with the Windows target triple Tauri expects and stages the catalog beside the Tauri
config. It is the same script `release.yml` runs, so local and CI output are identical,
and it needs no global install -- `esbuild` and `postject` are fetched on demand.)

Then build the installer (restrict to the NSIS target):

```
pnpm --filter @crash/r3f-shell run tauri build -- --bundles nsis
```

`tauri build` runs its `beforeBuildCommand` (`pnpm run build` = `tsc && vite
build`) to emit the web bundle into `frontend/r3f-shell/dist`, compiles the Rust
shell in release, bundles the sidecar exe, and emits the NSIS installer. The
trailing `-- --bundles nsis` forwards `--bundles nsis` to the Tauri CLI so only
the one-click installer is produced (drop it to also build the MSI).

## Where the installer artifact lands

```
frontend/r3f-shell/src-tauri/target/release/bundle/nsis/Crash_0.1.0_x64-setup.exe
```

The file name is `<productName>_<version>_x64-setup.exe` (productName is now
`Crash`, version comes from `tauri.conf.json`). That `setup.exe` is the single
artifact you hand to a user or attach to a GitHub Release.

## Releasing via GitHub Actions

`.github/workflows/release.yml` is tag-gated: pushing a tag matching `v*` (for
example `v0.1.0`) runs the full build on `windows-latest` and publishes a GitHub
Release with the installer attached. It uses the maintained `tauri-apps/tauri-action@v0`,
which runs the Tauri build, creates the Release, and uploads the NSIS installer
as a release asset. The Release is created as a draft so you can review and edit
notes before publishing.

To cut a release: bump `version` in `tauri.conf.json` (and keep package versions
in step if desired), commit, then push a matching `v*` tag. The fast pre-merge
loop (`quick-check.yml`) is unaffected -- it never runs on tags.

The workflow never reads or persists the per-session capability token; that token
is minted at runtime on the end user's machine and does not exist at build time.

## End-user flow (download, install, run)

1. Download `Crash_<version>_x64-setup.exe` from the GitHub Release assets.
2. Run it. The installer is configured `perUser` (NSIS `installMode: "perUser"`),
   so it installs under the user profile and needs no administrator elevation --
   ideal for a locked-down demo laptop. SmartScreen may warn because the build is
   not yet code-signed (see Known gaps); choose "More info" then "Run anyway".
3. Launch Crash from the Start menu. On first run the engine starts, the
   workspace at `~/Crash` is created (`docs/`, `skills/`, `plugins/`, `.runtime/`
   plus a starter `CLAUDE.md`), and the bundled curriculum is seeded into
   `~/Crash/skills/` (see the first-run seed follow-up). The 3D scene then walks
   the user through building their first skill.

The end user does NOT need Node, Rust, or any developer toolchain installed; the
engine ships inside the app.

## Known gaps (must read before a real release)

| Gap                                                | State                | Where                                            |
| -------------------------------------------------- | -------------------- | ------------------------------------------------ |
| Engine spawn + boot injection in packaged build    | DONE                 | `src-tauri/src/lib.rs` + `sidecar.rs`            |
| Capability scoped to the `crash-engine` sidecar    | DONE                 | `src-tauri/capabilities/default.json`            |
| Single-exe packaging of the ESM + `ws` engine       | RESOLVED (Node SEA)  | `installer/build-engine-exe.mjs` (local + CI)    |
| First-run curriculum seed into `~/Crash/skills/`    | NOT yet implemented  | Engine first-run (`ensureWorkspace` makes dirs)  |
| App icons are stock Tauri template art              | PLACEHOLDER          | `src-tauri/icons/` (regenerate from a 1024 PNG)  |
| Cargo manifest metadata is template default         | COSMETIC             | `src-tauri/Cargo.toml` (`description`, `authors`)|
| Code signing                                        | NOT done             | Post-Monday; SmartScreen warns until then        |
| CSP is tightened but not yet verified in a build    | NEEDS VERIFICATION   | `tauri.conf.json` `app.security.csp`             |

Notes on the last items:

- Icons: the current set is the stock Tauri logo. Regenerate from a single
  1024x1024 PNG of the Crash fox mascot (the app icon) with `pnpm --filter
  @crash/r3f-shell exec tauri icon path/to/icon.png`. IP hygiene: the mascot must
  be an original CC0 / CC-BY character, never Activision's Crash Bandicoot.
- CSP: `app.security.csp` was raised from `null` to a baseline that allows the
  app's own assets, the localhost engine WebSocket (`ws://127.0.0.1:*`), and the
  Spline runtime hosts, plus `blob:` workers and `data:`/`blob:` images that
  three.js and Spline need. Verify the 3D scene and Spline still render in a
  packaged build; loosen a single directive if something is blocked rather than
  reverting to `null`.
- Code signing: an unsigned installer triggers SmartScreen. For the 6/1 demo on
  the operator's own laptop this is acceptable; sign before any public download.
