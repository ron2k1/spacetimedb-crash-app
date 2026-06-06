// ProviderSwitcher.tsx -- a small dark-violet glass popover, anchored under its TopBar trigger,
// that lets the user SEE and MANAGE which AI CLI Crash runs on. It answers the question "how do I
// swap to the Codex CLI or the Claude CLI?" -- HONESTLY.
//
// HONESTY CONTRACT (do not soften into a lie):
//   * The active engine provider is chosen WHEN CRASH STARTS. In the frozen protocol it is
//     DISPLAY-ONLY (auth.status.active) -- there is NO runtime hot-swap message, so this popover
//     MUST NOT pretend to switch the live engine. It can only (a) show status, (b) launch the real
//     interactive sign-in terminal for a provider so it is ready NEXT start, and (c) record which
//     signed-in CLI to run on NEXT start (persisted to <app_config_dir>/provider, which the packaged
//     sidecar reads into CRASH_PROVIDER before booting the engine -- still never a live swap).
//   * Every status badge is derived from real booleans on auth.status ({installed, authenticated})
//     plus which provider the engine reported as active. Nothing here is invented.
//
// SECURITY: the user authenticates inside a TERMINAL the engine spawns; no token ever enters this
// UI. "Sign in" only asks the engine to open that terminal, then re-queries status to learn the
// outcome from booleans. We never read or render a credential.
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Provider, ProviderAuth } from '@crash/protocol';
import { useTaskStore } from '../../store/taskStore';
import { useProviderPrefStore } from '../../store/providerPrefStore';
import { queryAuthStatus, startProviderLogin } from '../../net/connection';
import { persistProviderPreference, restartCrash } from '../../net/providerPref';
import { theme, FONT, SHADOW } from '../../theme';

// Stable display order + per-provider labels. cli is the literal command the engine launches.
const PROVIDER_ORDER: Provider[] = ['claude-code', 'codex'];
const PROVIDER_META: Record<Provider, { name: string; cli: string }> = {
  'claude-code': { name: 'Claude Code', cli: 'claude' },
  codex: { name: 'Codex', cli: 'codex' },
};

type BadgeTone = 'active' | 'ready' | 'idle' | 'missing';

const BADGE_COLOR: Record<BadgeTone, string> = {
  active: theme.ui.good,
  ready: theme.ui.teal,
  idle: theme.ui.inkSoft,
  missing: theme.ui.warn,
};

/** Resolve a provider's row state from the real auth booleans + which one is live. Order matters:
 *  "Active" wins over "Signed in" so the live provider is unambiguous. */
function rowState(status: ProviderAuth | undefined, isActive: boolean): { label: string; tone: BadgeTone } {
  if (!status) return { label: 'Checking', tone: 'idle' };
  if (!status.installed) return { label: 'Not installed', tone: 'missing' };
  if (isActive && status.authenticated) return { label: 'Active', tone: 'active' };
  if (status.authenticated) return { label: 'Signed in', tone: 'ready' };
  return { label: 'Not signed in', tone: 'idle' };
}

/** One provider row: name + cli + status badge, with a "Sign in" action only when the CLI is
 *  installed but not yet signed in. */
function ProviderRow({ id }: { id: Provider }) {
  const meta = PROVIDER_META[id];
  const status = useTaskStore((s) => s.providerAuth.find((p) => p.id === id));
  const active = useTaskStore((s) => s.authActive);
  const launching = useTaskStore((s) => s.authLaunching === id);
  const setAuthLaunching = useTaskStore((s) => s.setAuthLaunching);
  const preferred = useProviderPrefStore((s) => s.preferred);
  const setPreferred = useProviderPrefStore((s) => s.setPreferred);
  const [restarting, setRestarting] = useState(false);

  const isActive = active === id;
  const { label, tone } = rowState(status, isActive);
  const installed = status?.installed ?? false;
  const authed = status?.authenticated ?? false;
  const canSignIn = installed && !authed;
  // Signed in but not the live engine -> offer to make it the provider for the NEXT start.
  const canMakeActive = installed && authed && !isActive;
  const isPreferred = preferred === id;

  const onSignIn = () => {
    // Mark launching (drives the "Opening terminal..." state), ask the engine to spawn the real
    // interactive login terminal, then re-query so the badge flips once `authenticated` turns true.
    setAuthLaunching(id);
    startProviderLogin(id);
    queryAuthStatus();
  };

  // Record the choice (persisted) and, in the packaged app, write it where the sidecar reads it so
  // the engine boots on this provider next launch. Honest: this does NOT swap the running engine.
  const onMakeActive = () => {
    setPreferred(id);
    void persistProviderPreference(id);
  };

  const onRestartNow = async () => {
    setRestarting(true);
    setPreferred(id);
    try {
      await persistProviderPreference(id);
      await restartCrash();
    } catch {
      setRestarting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 14,
        background: isActive ? theme.ui.accentSoft : theme.ui.cardBg,
        border: `1.5px solid ${isActive ? theme.ui.accent + '55' : theme.ui.line}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: FONT.body, fontWeight: 800, fontSize: 14, color: theme.ui.ink }}>
            {meta.name}
          </span>
          <code
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 11,
              color: theme.ui.inkSoft,
              background: theme.ui.chipBg,
              border: `1px solid ${theme.ui.lineSoft}`,
              borderRadius: 6,
              padding: '1px 6px',
            }}
          >
            {meta.cli}
          </code>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 5,
            fontFamily: FONT.body,
            fontWeight: 700,
            fontSize: 12,
            color: BADGE_COLOR[tone],
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: BADGE_COLOR[tone],
              boxShadow: tone === 'active' ? `0 0 8px ${BADGE_COLOR[tone]}` : 'none',
            }}
          />
          {label}
        </div>
      </div>

      {canSignIn ? (
        <button
          type="button"
          onClick={onSignIn}
          disabled={launching}
          style={{
            flexShrink: 0,
            fontFamily: FONT.body,
            fontWeight: 800,
            fontSize: 12,
            color: theme.ui.ink,
            background: launching ? theme.ui.chipBg : theme.ui.accentSoft,
            border: `1.5px solid ${theme.ui.accent}55`,
            borderRadius: 999,
            padding: '6px 12px',
            cursor: launching ? 'default' : 'pointer',
            opacity: launching ? 0.7 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {launching ? 'Opening terminal...' : 'Sign in'}
        </button>
      ) : null}

      {canMakeActive ? (
        isPreferred ? (
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              title="Crash will start on this CLI next time you open it"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                fontFamily: FONT.body,
                fontWeight: 800,
                fontSize: 12,
                color: theme.ui.teal,
                background: theme.ui.chipBg,
                border: `1.5px solid ${theme.ui.teal}55`,
                borderRadius: 999,
                padding: '6px 12px',
                whiteSpace: 'nowrap',
              }}
            >
              Starts next launch
            </span>
            <button
              type="button"
              onClick={onRestartNow}
              disabled={restarting}
              title="Restart Crash on this provider"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                width: '100%',
                fontFamily: FONT.body,
                fontWeight: 800,
                fontSize: 12,
                color: theme.ui.ink,
                background: restarting ? theme.ui.chipBg : theme.ui.accentSoft,
                border: `1.5px solid ${theme.ui.accent}55`,
                borderRadius: 999,
                padding: '6px 12px',
                cursor: restarting ? 'default' : 'pointer',
                opacity: restarting ? 0.7 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              <RefreshCw size={13} aria-hidden />
              {restarting ? 'Restarting' : 'Restart'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onMakeActive}
            style={{
              flexShrink: 0,
              fontFamily: FONT.body,
              fontWeight: 800,
              fontSize: 12,
              color: theme.ui.ink,
              background: theme.ui.accentSoft,
              border: `1.5px solid ${theme.ui.accent}55`,
              borderRadius: 999,
              padding: '6px 12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Use next start
          </button>
        )
      ) : null}
    </div>
  );
}

/** Honest one-line summary of the active engine + what signing in elsewhere actually does. Plain
 *  and non-condescending: it never claims a live swap the protocol can't do. */
function ActiveSummary() {
  const active = useTaskStore((s) => s.authActive);
  const provider = useTaskStore((s) => s.provider);
  const preferred = useProviderPrefStore((s) => s.preferred);
  // Prefer the typed auth.status.active; fall back to the session.ready provider string only for
  // the human-readable name when active hasn't arrived yet.
  const activeName = active
    ? PROVIDER_META[active].name
    : provider && (provider === 'claude-code' || provider === 'codex')
      ? PROVIDER_META[provider].name
      : null;

  // A choice the user made that isn't live yet: it only takes effect when Crash restarts.
  const pendingName = preferred && preferred !== active ? PROVIDER_META[preferred].name : null;

  return (
    <p
      style={{
        margin: 0,
        fontFamily: FONT.body,
        fontWeight: 600,
        fontSize: 12,
        lineHeight: 1.5,
        color: theme.ui.inkSoft,
      }}
    >
      {pendingName ? (
        <>
          Next start: Crash runs on <span style={{ color: theme.ui.ink, fontWeight: 800 }}>{pendingName}</span>
          {activeName ? <> instead of {activeName}</> : null}. The active engine only changes when Crash restarts.
        </>
      ) : activeName ? (
        <>
          Active now: <span style={{ color: theme.ui.ink, fontWeight: 800 }}>{activeName}</span>. To switch, sign
          in to another CLI and choose "Use next start".
        </>
      ) : (
        <>The active provider is set when Crash starts. Sign in below so a CLI is ready next start.</>
      )}
    </p>
  );
}

/** Always-available "Restart Crash" control. The engine resolves its provider WHEN IT STARTS, so a
 *  restart is the ONLY honest way to apply a provider choice -- there is no live hot-swap. If the
 *  user picked a provider that differs from the active one, persist that choice FIRST so the sidecar
 *  boots on it, THEN re-launch the engine. With no pending change, the button still just restarts the
 *  engine. Copy never implies a mid-run swap. */
function FooterRestart() {
  const active = useTaskStore((s) => s.authActive);
  const preferred = useProviderPrefStore((s) => s.preferred);
  const [restarting, setRestarting] = useState(false);

  // A choice that isn't live yet: only a restart makes the engine boot on it.
  const pending = preferred && preferred !== active ? preferred : null;
  const pendingName = pending ? PROVIDER_META[pending].name : null;

  const onRestart = async () => {
    setRestarting(true);
    try {
      // Persist the pending provider (if any) BEFORE relaunch so the sidecar reads it on next boot.
      if (pending) await persistProviderPreference(pending);
      await restartCrash();
    } catch {
      setRestarting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onRestart}
      disabled={restarting}
      title={
        pendingName
          ? `Restart Crash so the engine starts on ${pendingName}`
          : 'Restart the Crash engine'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        width: '100%',
        marginTop: 10,
        fontFamily: FONT.body,
        fontWeight: 800,
        fontSize: 12,
        color: theme.ui.ink,
        background: restarting ? theme.ui.chipBg : theme.ui.accentSoft,
        border: `1.5px solid ${theme.ui.accent}55`,
        borderRadius: 999,
        padding: '8px 12px',
        cursor: restarting ? 'default' : 'pointer',
        opacity: restarting ? 0.7 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      <RefreshCw size={13} aria-hidden />
      {restarting ? 'Restarting Crash...' : pendingName ? `Restart Crash (starts on ${pendingName})` : 'Restart Crash'}
    </button>
  );
}

/** The popover. `open` + `onClose` are owned by the TopBar trigger; this positions itself
 *  absolutely under that trigger and closes on outside-click or Escape. */
export function ProviderSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Refresh status when the popover opens so badges reflect reality the moment it's shown.
  useEffect(() => {
    if (open) queryAuthStatus();
  }, [open]);

  // Click-outside + Escape to close. Listeners only exist while open. mousedown (not click) so a
  // press that starts outside closes before any inner control can swallow it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="AI provider"
      style={{
        position: 'absolute',
        top: 'calc(100% + 10px)',
        right: 0,
        zIndex: 120,
        width: 320,
        maxWidth: '90vw',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 14,
        borderRadius: 18,
        background: theme.ui.panel,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: `1.5px solid ${theme.ui.line}`,
        boxShadow: SHADOW.panel,
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 14, color: theme.ui.ink }}>
          AI provider
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            fontFamily: FONT.body,
            fontWeight: 800,
            fontSize: 16,
            lineHeight: 1,
            color: theme.ui.inkSoft,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
          }}
        >
          x
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PROVIDER_ORDER.map((id) => (
          <ProviderRow key={id} id={id} />
        ))}
      </div>

      <div
        style={{
          paddingTop: 10,
          borderTop: `1px solid ${theme.ui.lineSoft}`,
        }}
      >
        <ActiveSummary />
        <FooterRestart />
      </div>
    </div>
  );
}
