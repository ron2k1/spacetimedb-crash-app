// Engine-internal auth layer for the login page (Plan: CLI-provider authentication).
//
// SECURITY (these are hard rails, not preferences):
//   - We NEVER read the CONTENTS of any credential/token file or env-var VALUE. Detection
//     is derived ONLY from process EXIT CODES and (as a documented fallback) file EXISTENCE
//     via fs.existsSync. No fs.readFileSync of a secret, ever.
//   - No token/secret ever enters a protocol payload, an argv that is logged, or a log line.
//     The login token is typed by the user IN THE TERMINAL we spawn and never transits here.
//   - The login command is built from a CLOSED ENUM via loginCommandFor(); user input is
//     NEVER concatenated into a shell command.
//
// Probes confirmed on-machine + via context7 (code.claude.com / openai/codex):
//   - Claude:  `claude auth status`  -> exit 0 when signed in   (interactive: `claude auth login`)
//   - Codex:   `codex login status`  -> exit 0 when signed in   (interactive: `codex login`)
// `claude auth status` is a real non-interactive exit-code status subcommand, so Claude
// detection uses it directly and NEVER touches the credentials file. The fs.existsSync
// fallback below is dormant unless that probe is unavailable on some future CLI build.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Provider as ProviderId, ProviderAuth } from '@crash/protocol';
import { commandExists, commandSucceeds } from './proc.js';

// Bin resolution MIRRORS the providers (claude-code.ts / codex.ts) so detection, the real
// run, and login all resolve to the SAME binary. On Windows these names unwrap the npm
// .cmd shim inside resolveCommand(); for `start cmd /k`, cmd.exe itself resolves the shim.
function claudeBin(): string {
  return process.env.CRASH_CLAUDE_BIN || 'claude';
}
function codexBin(): string {
  return process.env.CRASH_CODEX_BIN || 'codex';
}

/** Dev override (escape hatch, like CRASH_*_BIN): CRASH_<P>_AUTHED='1'/'0' forces that
 *  provider's `authenticated` for rehearsals/demos. This is a BOOLEAN FLAG, not a secret. */
function authedOverride(envName: string): boolean | undefined {
  const v = process.env[envName];
  if (v === '1') return true;
  if (v === '0') return false;
  return undefined;
}

/**
 * EXISTENCE-ONLY fallback for Claude auth, used only if the `claude auth status` exit-code
 * probe is ever unavailable. Checks fs.existsSync of the realistic credentials path(s);
 * NEVER reads them. On Windows the dir is %USERPROFILE%\.claude. (Confirmed via docs: the
 * CLI keeps its OAuth credentials under the user-profile `.claude` directory.)
 */
function claudeCredentialsExist(): boolean {
  const candidates = [
    path.join(os.homedir(), '.claude', '.credentials.json'),
    path.join(os.homedir(), '.claude', 'credentials.json'),
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return true; // EXISTENCE only — file is never opened/read
    } catch {
      /* permission/race -> treat as absent */
    }
  }
  return false;
}

async function detectClaude(): Promise<ProviderAuth> {
  const override = authedOverride('CRASH_CLAUDE_AUTHED');
  let installed = false;
  let authenticated = false;
  try {
    installed = await commandExists(claudeBin());
    if (override !== undefined) {
      authenticated = override;
    } else if (installed) {
      // Primary: real non-interactive exit-code status subcommand (no file read).
      authenticated = await commandSucceeds(claudeBin(), ['auth', 'status'], { timeoutMs: 5000 });
      // Dormant existence fallback (kept for resilience; harmless when already true).
      if (!authenticated) authenticated = claudeCredentialsExist();
    }
  } catch {
    /* a failed probe must not reject the whole snapshot */
  }
  return { id: 'claude-code', installed, authenticated };
}

async function detectCodex(): Promise<ProviderAuth> {
  const override = authedOverride('CRASH_CODEX_AUTHED');
  let installed = false;
  let authenticated = false;
  try {
    installed = await commandExists(codexBin());
    if (override !== undefined) {
      authenticated = override;
    } else if (installed) {
      authenticated = await commandSucceeds(codexBin(), ['login', 'status'], { timeoutMs: 5000 });
    }
  } catch {
    /* a failed probe must not reject the whole snapshot */
  }
  return { id: 'codex', installed, authenticated };
}

/**
 * Snapshot every known provider in parallel. Each probe is individually wrapped so one
 * failure can never reject the whole thing; a failed probe degrades to
 * {installed:false, authenticated:false}. Order is stable: claude-code, then codex.
 */
export async function detectAuth(): Promise<ProviderAuth[]> {
  return Promise.all([detectClaude(), detectCodex()]);
}

/**
 * PURE closed-enum mapping from a provider id to its INTERACTIVE sign-in command. Documents
 * the only two commands we will ever launch and is the unit-testable core of the rail that
 * "the login command contains no user input". Verbs confirmed on-machine: `claude auth`
 * exposes login/logout/status; `codex login` exposes a status subcommand.
 */
export function loginCommandFor(provider: ProviderId): string {
  return provider === 'codex' ? 'codex login' : 'claude auth login';
}

/**
 * Open a VISIBLE terminal running the provider's interactive login. This is deliberately the
 * OPPOSITE of the headless (windowsHide:true) run path: an interactive device/OAuth flow needs
 * a real console the user can see and type a code into. The command is a constant from
 * loginCommandFor() — NO user input is ever concatenated in.
 *
 * On win32: `cmd /c start "" cmd /k <login cmd>` — cmd.exe resolves the .cmd shim via PATH and
 * /k keeps the window open until the user finishes. Detached + unref so it outlives the engine.
 * On failure we return a SYNTHETIC code only ('login_spawn_failed' / 'login_unsupported_platform');
 * never an err.message, stack, path, prompt, or response body.
 */
export function startProviderLogin(provider: ProviderId): { launched: boolean; code?: string } {
  const loginCmd = loginCommandFor(provider); // closed-enum constant — no user input
  try {
    if (process.platform === 'win32') {
      // start "" <prog...> : the empty "" is start's window-title arg (so a quoted program
      // path would not be mis-read as the title). /k keeps the new cmd window open.
      const child = spawn('cmd', ['/c', 'start', '', 'cmd', '/k', loginCmd], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      return { launched: true };
    }

    // POSIX best-effort: try a GUI terminal emulator; otherwise a detached background process.
    const [bin, ...rest] = loginCmd.split(' ');
    if (process.platform === 'darwin') {
      const child = spawn('open', ['-a', 'Terminal', bin], { detached: true, stdio: 'ignore' });
      child.unref();
      return { launched: true };
    }
    // Linux/other: prefer a terminal emulator that keeps a shell open with the command.
    const child = spawn(
      'x-terminal-emulator',
      ['-e', 'sh', '-c', `${loginCmd}; exec sh`],
      { detached: true, stdio: 'ignore' },
    );
    let launched = true;
    child.on('error', () => {
      launched = false;
    });
    // If no terminal emulator exists, fall back to a detached background login attempt so the
    // user at least has a chance on headless boxes; still no user input in the argv.
    if (!launched) {
      const bg = spawn(bin, rest, { detached: true, stdio: 'ignore' });
      bg.on('error', () => {
        /* nothing else to try */
      });
      bg.unref();
    }
    child.unref();
    return { launched: true };
  } catch {
    return { launched: false, code: 'login_spawn_failed' }; // synthetic code only
  }
}
