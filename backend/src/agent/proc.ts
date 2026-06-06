// Thin child-process helper: spawn a CLI headless and stream its stdout as
// line-delimited JSON. This is the literal "spawn a terminal headlessly" mechanism
// the providers share. Honors an AbortSignal (the STOP button / run.cancel).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface ProcLine {
  json?: unknown;
  raw: string;
  stream: 'stdout' | 'stderr';
}

export interface ResolvedCommand {
  file: string;
  args: string[];
}

// --- Windows npm-shim resolution --------------------------------------------
// npm installs CLIs (claude, codex) on Windows as .cmd / .ps1 / bash shims, NOT as a
// native binary a bare spawn can find. Node's child_process.spawn WITHOUT a shell cannot
// launch a .cmd/.ps1 -- it emits an 'error' with code ENOENT (close code -4058) -- so
// commandExists() would report every npm-installed CLI as missing and resolveProvider()
// would silently fall back to the offline Deterministic provider (no real AI). Using
// shell:true to dodge that would re-parse the user's PROMPT through cmd.exe -> shell
// injection + breakage on any prompt containing & | " %. Instead we read the .cmd shim
// and spawn exactly what it launches, directly and shell-free:
//   claude.cmd -> "...\node_modules\@anthropic-ai\claude-code\bin\claude.exe"  (real .exe)
//   codex.cmd  -> node "...\node_modules\@openai\codex\bin\codex.js"           (node script)
// Args always travel as an array to a non-shell spawn, so the prompt is delivered as one
// literal argv entry and is never interpreted by a shell. On POSIX the shim IS the
// executable, so the command passes through untouched.

/**
 * Pure parser for an npm `.cmd` shim: given its text and the shim's own directory, return
 * the executable plus any leading args it actually launches, or null when no launcher line
 * is recognizable. A `.js` target runs through the provided real Node executable; an `.exe` target
 * launches directly. Pure (no fs / no platform branch) so it is unit-testable.
 */
export function parseShimLauncher(
  shimText: string,
  shimDir: string,
  nodeFile = process.execPath,
): ResolvedCommand | null {
  // The launcher line forwards user args (`%*`) and points into node_modules.
  const line = shimText.split(/\r?\n/).find((l) => l.includes('%*') && /node_modules/i.test(l));
  if (!line) return null;
  const quoted = [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const raw = quoted.find((q) => /node_modules/i.test(q) && /\.(exe|js)$/i.test(q));
  if (!raw) return null;
  // npm sets `dp0=%~dp0` (the shim's dir, trailing backslash). Re-root it on the real dir.
  // Use path.win32 explicitly: shim targets are ALWAYS Windows paths (npm .cmd shims exist
  // only on Windows and this function is reached only when platform === 'win32'), so the join
  // + normalize must emit backslashes regardless of which OS runs this code. Bare path.sep /
  // path.normalize are host-sensitive and produce a '/' seam on the Linux CI leg.
  const target = path.win32.normalize(raw.replace(/%dp0%\\?/gi, shimDir + path.win32.sep));
  return /\.js$/i.test(target) ? { file: nodeFile, args: [target] } : { file: target, args: [] };
}

export function buildPathSearchDirs(
  env: NodeJS.ProcessEnv = process.env,
  execPath = process.execPath,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const rawPath = env.PATH ?? env.Path ?? env.path ?? '';
  const delimiter = platform === 'win32' ? ';' : path.delimiter;
  const dirs = rawPath.split(delimiter).filter(Boolean);

  if (platform === 'win32') {
    if (env.APPDATA) dirs.push(path.win32.join(env.APPDATA, 'npm'));
    if (env.ProgramFiles) dirs.push(path.win32.join(env.ProgramFiles, 'nodejs'));
    if (env['ProgramFiles(x86)']) dirs.push(path.win32.join(env['ProgramFiles(x86)'], 'nodejs'));
    dirs.push(path.win32.dirname(execPath));
  }

  const seen = new Set<string>();
  return dirs
    .map((dir) => dir.trim())
    .filter(Boolean)
    .filter((dir) => {
      const key = platform === 'win32' ? dir.toLowerCase() : dir;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function findOnPath(file: string): string | null {
  const dirs = buildPathSearchDirs();
  for (const dir of dirs) {
    if (!dir) continue;
    try {
      const full = path.join(dir, file);
      if (fs.statSync(full).isFile()) return full;
    } catch {
      /* not in this dir */
    }
  }
  return null;
}

function isNodeExecutable(file: string): boolean {
  const base = path.basename(file).toLowerCase();
  return base === 'node.exe' || base === 'node';
}

function resolveNodeExecutable(preferredDir?: string): string {
  if (process.platform !== 'win32') return process.execPath;

  if (preferredDir) {
    const localNode = path.win32.join(preferredDir, 'node.exe');
    try {
      if (fs.statSync(localNode).isFile()) return localNode;
    } catch {
      /* not bundled beside the npm shim */
    }
  }

  if (isNodeExecutable(process.execPath)) return process.execPath;
  return findOnPath('node.exe') ?? findOnPath('node') ?? 'node.exe';
}

/**
 * Resolve a command name/path to a shell-free { file, args } the OS can spawn directly.
 * On Windows this transparently unwraps an npm `.cmd` shim to its real target so detection
 * (`commandExists`) and the real run (`spawnJsonLines`) resolve to the SAME binary -- they
 * can never disagree about which executable backs a provider.
 */
export function resolveCommand(cmd: string): ResolvedCommand {
  if (process.platform !== 'win32') return { file: cmd, args: [] };

  const lower = cmd.toLowerCase();
  if (lower.endsWith('.exe')) return { file: cmd, args: [] };
  if (lower.endsWith('.js')) return { file: resolveNodeExecutable(path.dirname(cmd)), args: [cmd] };

  let shimPath: string | null;
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
    shimPath = path.isAbsolute(cmd) ? cmd : findOnPath(cmd);
  } else {
    // bare name (e.g. "claude"): npm puts the launcher in <name>.cmd next to the shim
    shimPath = findOnPath(`${cmd}.cmd`) ?? findOnPath(`${cmd}.bat`);
  }

  if (shimPath) {
    try {
      const shimDir = path.dirname(shimPath);
      const parsed = parseShimLauncher(fs.readFileSync(shimPath, 'utf8'), shimDir, resolveNodeExecutable(shimDir));
      if (parsed) return parsed;
    } catch {
      /* unreadable shim -> fall through to the literal name */
    }
  }
  // Last resort: spawn the literal name. A bare shim name will ENOENT here, which the
  // providers translate into a clean `provider_unavailable` rather than a crash.
  return { file: cmd, args: [] };
}

/** True if `cmd --version` runs and exits 0 (i.e. the CLI is installed and launchable). */
export function commandExists(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: boolean) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const { file, args } = resolveCommand(cmd);
      const p = spawn(file, [...args, '--version'], { stdio: 'ignore', windowsHide: true });
      p.on('error', () => done(false));
      p.on('close', (code) => done(code === 0));
    } catch {
      done(false);
    }
  });
}

/** True if `<cmd> <args...>` runs and exits 0 within timeoutMs. Used for non-interactive auth probes
 *  (e.g. `codex login status`). stdio ignored — we read ONLY the exit code, never output. */
export function commandSucceeds(
  cmd: string,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: boolean) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    let timer: NodeJS.Timeout | undefined;
    try {
      const { file, args: prefix } = resolveCommand(cmd);
      const p = spawn(file, [...prefix, ...args], { stdio: 'ignore', windowsHide: true });
      timer = setTimeout(() => {
        try {
          p.kill('SIGTERM');
        } catch {
          /* gone */
        }
        done(false);
      }, opts.timeoutMs ?? 5000);
      p.on('error', () => {
        if (timer) clearTimeout(timer);
        done(false);
      });
      p.on('close', (code) => {
        if (timer) clearTimeout(timer);
        done(code === 0);
      });
    } catch {
      if (timer) clearTimeout(timer);
      done(false);
    }
  });
}

/**
 * Kill a spawned child AND every descendant it forked. On Windows a bare
 * child.kill('SIGTERM') is TerminateProcess on ONLY the direct PID -- but `claude.exe`
 * launches an internal Node worker and `codex.js` IS a Node process, so the real work
 * lives in a grandchild. Killing just the parent orphans that grandchild, and those
 * orphans are exactly the leaked node.exe processes that pile up "per request". We reap
 * the whole tree with `taskkill /PID <pid> /T /F`. It is targeted BY PID and never by
 * image name: `/IM node.exe` would also kill this engine (and Claude Code itself).
 * On POSIX a signal to our single-child CLI is sufficient.
 */
function killTree(child: ReturnType<typeof spawn>): void {
  const pid = child.pid;
  if (pid === undefined) return; // never spawned (e.g. ENOENT) -> nothing to reap
  try {
    if (process.platform === 'win32') {
      // Fire-and-forget; taskkill exits fast. windowsHide so no console flashes.
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    /* already gone */
  }
}

/** Spawn a process and yield each stdout line, parsed as JSON when possible. */
export async function* spawnJsonLines(
  cmd: string,
  args: string[],
  opts: { cwd: string; signal: AbortSignal },
): AsyncGenerator<ProcLine, { code: number | null; ok: boolean }, void> {
  const { file, args: prefix } = resolveCommand(cmd);
  const child = spawn(file, [...prefix, ...args], {
    cwd: opts.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const queue: ProcLine[] = [];
  let waiter: (() => void) | null = null;
  let finished = false;
  let spawnError: Error | null = null;
  let exitCode: number | null = null;

  const wake = () => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  };

  const onAbort = () => killTree(child); // STOP / run.cancel / renderer disconnect
  opts.signal.addEventListener('abort', onAbort, { once: true });

  // Idle-output watchdog: if the CLI emits NOTHING for CRASH_RUN_IDLE_TIMEOUT_MS (default
  // 120s; set 0 to disable), treat it as wedged, reap its whole tree, and surface a
  // synthetic failure. Re-armed on every chunk below, so a slow-but-streaming run is never
  // cut off -- this targets ONLY a hung child that would otherwise hold memory until the
  // engine exits. (A healthy stream-json run emits deltas continuously.)
  const idleMs = Number(process.env.CRASH_RUN_IDLE_TIMEOUT_MS ?? 120000);
  let idleTimer: NodeJS.Timeout | undefined;
  const clearIdle = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  };
  const armIdle = () => {
    if (!(idleMs > 0)) return;
    clearIdle();
    idleTimer = setTimeout(() => {
      const e = new Error('crash_run_idle_timeout') as NodeJS.ErrnoException;
      e.code = 'CRASH_IDLE_TIMEOUT'; // not ENOENT -> providers map this to provider_failed
      spawnError = e;
      killTree(child);
      finished = true;
      wake();
    }, idleMs);
  };
  armIdle();

  const push = (line: string, stream: 'stdout' | 'stderr') => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      json = undefined;
    }
    queue.push({ json, raw: trimmed, stream });
    wake();
  };

  let stdoutBuf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    armIdle(); // output => still alive => reset the wedge timer
    stdoutBuf += chunk;
    let nl: number;
    while ((nl = stdoutBuf.indexOf('\n')) >= 0) {
      push(stdoutBuf.slice(0, nl), 'stdout');
      stdoutBuf = stdoutBuf.slice(nl + 1);
    }
  });

  let stderrBuf = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    armIdle(); // stderr output also proves the child is alive and should be shown in Technical
    stderrBuf += chunk;
    let nl: number;
    while ((nl = stderrBuf.indexOf('\n')) >= 0) {
      push(stderrBuf.slice(0, nl), 'stderr');
      stderrBuf = stderrBuf.slice(nl + 1);
    }
  });
  child.on('error', (e) => {
    clearIdle();
    spawnError = e;
    finished = true;
    wake();
  });
  child.on('close', (code) => {
    clearIdle();
    if (stdoutBuf) push(stdoutBuf, 'stdout');
    if (stderrBuf) push(stderrBuf, 'stderr');
    exitCode = code;
    finished = true;
    wake();
  });

  try {
    while (true) {
      if (queue.length) {
        yield queue.shift() as ProcLine;
        continue;
      }
      if (spawnError) throw spawnError;
      if (finished) break;
      await new Promise<void>((res) => {
        waiter = res;
      });
    }
  } finally {
    clearIdle();
    opts.signal.removeEventListener('abort', onAbort);
    // Structured concurrency: never leak the child. If the consumer stopped early or
    // the CLI closed stdout while still alive, reap the whole tree. (Spec: every worker
    // torn down.) finished===true means the watchdog/close already reaped -> no double-kill.
    if (!finished) killTree(child);
  }
  return { code: exitCode, ok: exitCode === 0 };
}
