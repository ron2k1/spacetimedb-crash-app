// CrashLogin.tsx -- the app's front door. Crash runs on the user's OWN local AI CLI (Claude Code
// or Codex); this screen connects one of those providers before the dashboard opens. It is NOT an
// email/password sign-in -- there is no Crash account. The layout is a full-bleed branded stage:
// Crash (the Spline robot mascot) fills the ENTIRE viewport as the ambient background, and a single
// dark-glass sign-in card floats on top, left-anchored, holding the ordered connect flow
// (header -> provider choice -> connect -> Continue gate).
//
// SECURITY: the user authenticates IN A TERMINAL the engine spawns -- no token ever enters this UI
// or the protocol. We only ever read booleans (installed/authenticated) from auth.status, plus a
// SYNTHETIC code (never a message) from auth.login.result. "Continue" is ALWAYS enabled: provider
// status is informative, not a hard gate, so a false-negative detection can never strand the user.
//
// All chrome (spotlight, gradients, telemetry strip) is pure offline CSS -- no remote scripts,
// fonts, or images. The telemetry strip states only TRUE static facts plus the live connection
// state already in the store; it never invents metrics or fake live numbers.
import { useEffect } from 'react';
import { ArrowRight, Check, RefreshCw, Terminal } from 'lucide-react';
import type { Provider } from '@crash/protocol';
import { useTaskStore } from '../store/taskStore';
import { queryAuthStatus, startProviderLogin } from '../net/connection';
import { Button } from './ui/button';
import { InteractiveRobotSpline } from './blocks/interactive-3d-robot';
import { Spotlight } from './ui/spotlight';
import { Typewriter } from './ui/typewriter';
import { isTauri } from '../files/attach';

// Same scene the dashboard backdrop uses, so the mascot you meet at sign-in is the one who then
// lives in your workspace -- visual continuity, one asset, one download.
const CRASH_SCENE = 'https://prod.spline.design/PyzDhpQ9E5f1E3MT/scene.splinecode';

const PROVIDER_ORDER: Provider[] = ['claude-code', 'codex'];
const PROVIDER_META: Record<Provider, { name: string; cli: string; blurb: string }> = {
  'claude-code': { name: 'Claude Code', cli: 'claude', blurb: "Anthropic's agent CLI" },
  codex: { name: 'Codex', cli: 'codex', blurb: "OpenAI's agent CLI" },
};

// Plain, non-patronizing mascot lines. State what Crash is; don't perform enthusiasm. The desktop app
// runs on the user's local CLI; the web / Azure demo is the hosted marketplace (no local engine), so
// each build states only what is true for the deployment the visitor is actually looking at.
const AGENT_LINES = isTauri
  ? ["Hi, I'm Crash.", 'I run on your own Claude or Codex CLI.', "Connect a provider and we'll begin."]
  : [
      "Hi, I'm Crash.",
      'A marketplace for AI agents and the tools they use.',
      'Browse, hire, or sell -- agents pay their own way.',
    ];

// Static, TRUE facts about the running app -- never invented metrics. Rendered in the mono telemetry
// strip. Desktop names the local engine; web names the marketplace. The live connection state is
// appended separately (desktop only) so the strip stays honest about what is real-time vs. constant.
const TELEMETRY_FACTS = isTauri
  ? ['CRASH', 'localhost engine', 'protocol v3', 'renderer: web']
  : ['CRASH', 'agentic marketplace', 'x402 / USDC', 'renderer: web'];

/** Mono telemetry strip: TRUE static facts joined by a `//` separator, plus a live connection dot
 *  reflecting the real connState from the store (not an invented metric). Sits low on the stage,
 *  clear of the floating card. */
function TelemetryStrip({ connState }: { connState: string }) {
  // Desktop shows a live engine indicator -- the engine link is the real, local signal. On web there
  // is no local engine, and the marketplace link isn't established until past this gate, so we show the
  // static facts only (no live claim) rather than a permanent "linking" that can never resolve.
  const online = connState === 'ready';
  return (
    <div className="pointer-events-none absolute inset-x-6 bottom-5 z-20 flex items-center justify-end gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
      <span className="hidden truncate sm:inline">{TELEMETRY_FACTS.join('  //  ')}</span>
      {isTauri && (
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className={online ? 'size-1.5 rounded-full bg-emerald-400' : 'size-1.5 rounded-full bg-amber-400'}
          />
          {online ? 'engine: online' : 'engine: linking'}
        </span>
      )}
    </div>
  );
}

/** One step header: an ordinal chip + title + optional helper line. Gives the column a clear,
 *  ordered hierarchy (1 -> 2 -> 3) instead of a flat stack. */
function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-primary/40 bg-primary/10 font-mono text-xs font-semibold text-primary">
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold leading-none text-foreground">{title}</h2>
        {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

/** One provider row: name + live status, with a "Sign in" action when it's installed but not
 *  authenticated. All three display states come straight from the auth.status booleans. */
function ProviderCard({ id }: { id: Provider }) {
  const meta = PROVIDER_META[id];
  const status = useTaskStore((s) => s.providerAuth.find((p) => p.id === id));
  const launching = useTaskStore((s) => s.authLaunching === id);
  const setAuthLaunching = useTaskStore((s) => s.setAuthLaunching);
  const connState = useTaskStore((s) => s.connState);

  const known = status !== undefined; // false until the first auth.status arrives
  const installed = status?.installed ?? false;
  const authed = status?.authenticated ?? false;
  // Fail closed: auth.status only flows once the engine link is up, so when the socket is
  // closed/errored `known` can never become true. Showing "Checking..." forever reads as a hang;
  // "Engine offline" is the honest state and points the user at the Reconnect action in Step 2.
  const offline = connState === 'closed' || connState === 'error';

  const onSignIn = () => {
    // Mark this provider as launching so the button shows progress; the engine spawns the
    // interactive terminal, the user types their token THERE, and our 3s poll flips us to
    // "Connected" once `authenticated` turns true. We never see the token.
    setAuthLaunching(id);
    startProviderLogin(id);
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card/60 p-4 transition-colors hover:border-primary/30">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{meta.name}</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {meta.cli}
          </code>
        </div>
        <p className="mt-1 truncate text-sm text-muted-foreground">{meta.blurb}</p>
      </div>

      <div className="shrink-0">
        {authed ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400">
            <Check className="size-4" aria-hidden /> Connected
          </span>
        ) : !known ? (
          <span className="text-sm text-muted-foreground">{offline ? 'Engine offline' : 'Checking...'}</span>
        ) : !installed ? (
          <span className="text-sm text-amber-400">CLI not found</span>
        ) : (
          <Button variant="outline" size="sm" onClick={onSignIn} disabled={launching}>
            {launching ? (
              <>
                <Terminal className="size-4" aria-hidden /> Opening terminal...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

export function CrashLogin() {
  const connState = useTaskStore((s) => s.connState);
  const continuePastGate = useTaskStore((s) => s.continuePastGate);

  // Connect is side-effect-free server-side: the engine never pushes auth.status on its own.
  // Ask once we're ready, then poll lightly so a card flips to "Connected" the moment the user
  // finishes signing in inside the spawned terminal -- no manual refresh required. (The socket
  // also fires one query on session.ready; this covers remounts and keeps status fresh.)
  useEffect(() => {
    if (connState !== 'ready') return;
    queryAuthStatus();
    const t = setInterval(queryAuthStatus, 3000);
    return () => clearInterval(t);
  }, [connState]);

  // Three honest link states drive Step 2. `connecting` is the only "in progress" one; `closed`/
  // `error` are terminal-until-acted-on, so we surface them as "Engine offline" + a Reconnect.
  const connected = connState === 'ready';
  const linking = connState === 'connecting';

  // The ONLY real recovery from a stale/dead engine descriptor: a full reload re-runs the boot
  // injector (Vite's crash-boot-inject in dev / the Rust init script when packaged), which re-reads
  // socket.json and hands the renderer a FRESH host/port/token. queryAuthStatus is a no-op while the
  // socket is down, so polling can never reconnect -- only a reload can.
  const reconnect = () => window.location.reload();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* FULL-BLEED MASCOT BACKGROUND -- Crash fills the whole viewport as the ambient stage.
          Same interactive Spline scene the dashboard uses; mounted behind everything (z-0). The
          dark bg-background under it is the pre-paint fallback so there's never a white flash. */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-background">
        <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" fill="#a78bfa" />
        <InteractiveRobotSpline scene={CRASH_SCENE} className="absolute inset-0 h-full w-full" />
        {/* Legibility washes over the busy scene: a bottom-up fade plus a soft left-edge fade so
            the floating card's left side never fights the robot. pointer-events-none so drags
            still reach Crash. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background via-background/55 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[44rem] max-w-[60%] bg-gradient-to-r from-background/85 via-background/35 to-transparent lg:block" />
      </div>

      {/* FLOATING SIGN-IN CARD -- left-anchored on large screens, centered on small. Dark glass so
          the mascot reads THROUGH/behind it. Holds the full ordered connect flow unchanged. */}
      <div className="relative z-10 flex min-h-screen items-center justify-center p-6 md:p-10 lg:justify-start lg:px-16 xl:px-24">
        <div className="w-full max-w-md rounded-2xl border border-border bg-background/70 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          {/* Branded header: fox + wordmark + one-line tagline. Keep the fox mascot mark. */}
          <header className="border-b border-border pb-6">
            <div className="flex items-center gap-2">
              <span aria-hidden className="text-2xl leading-none">
                🦊
              </span>
              <span className="text-2xl font-semibold tracking-tight text-foreground">Crash</span>
              <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-primary">
                beta
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              The marketplace where you and your agents buy, sell, and run AI tools -- and only ever
              spend what you allow.
            </p>
          </header>

          {isTauri ? (
            <>
              {/* Step 1 -- choose a provider */}
              <section className="mt-6">
                <StepHeader
                  n={1}
                  title="Choose your AI provider"
                  hint="Crash runs on your own local CLI. Pick the one you have installed."
                />
                <div className="mt-4 flex flex-col gap-3">
                  {PROVIDER_ORDER.map((id) => (
                    <ProviderCard key={id} id={id} />
                  ))}
                </div>
              </section>

              {/* Step 2 -- connect / sign in (lives inside each card's action; this frames it) */}
              <section className="mt-6 border-t border-border pt-6">
                <StepHeader
                  n={2}
                  title="Connect the CLI"
                  hint='Use "Sign in" above to open a terminal and authenticate. Your token stays in that terminal -- Crash never sees it.'
                />
                <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-card/40 px-4 py-3">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className={
                        connected
                          ? 'size-2 rounded-full bg-emerald-400'
                          : linking
                            ? 'size-2 animate-pulse rounded-full bg-amber-400'
                            : 'size-2 rounded-full bg-rose-500'
                      }
                      aria-hidden
                    />
                    {connected
                      ? 'Connected to the local engine'
                      : linking
                        ? 'Waiting for the local engine...'
                        : 'Engine offline'}
                  </span>
                  {/* When connected, Refresh re-polls auth.status. When not, the only thing that can
                      help is a reload (Reconnect) -- it re-reads the engine descriptor and re-links. */}
                  <button
                    type="button"
                    onClick={connected ? queryAuthStatus : reconnect}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <RefreshCw className={linking ? 'size-3 animate-spin' : 'size-3'} aria-hidden />
                    {connected ? 'Refresh' : 'Reconnect'}
                  </button>
                </div>
                {!connected && !linking ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Make sure the engine is running, then choose Reconnect -- Crash reloads and re-links
                    to it.
                  </p>
                ) : null}
              </section>

              {/* Step 3 -- the Continue gate (ALWAYS allowed; de-risks the demo) */}
              <section className="mt-6 border-t border-border pt-6">
                <StepHeader n={3} title="Enter Crash" />
                <Button onClick={continuePastGate} size="lg" className="mt-4 w-full">
                  Continue <ArrowRight className="size-4" aria-hidden />
                </Button>
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  You can connect or switch providers later in settings.
                </p>
              </section>
            </>
          ) : (
            <>
              {/* WEB landing -- there is no local CLI to connect on the hosted demo, so we skip the
                  provider/engine steps entirely and frame what the marketplace is in plain terms, then
                  drop the visitor straight in. One action, no dead "Engine offline / Reconnect" path. */}
              <section className="mt-6">
                <ul className="flex flex-col gap-3">
                  {[
                    {
                      icon: '🛒',
                      title: 'Browse and hire agents',
                      body: 'Find an agent for the job and put it to work.',
                    },
                    {
                      icon: '🏷️',
                      title: 'Sell your own',
                      body: 'List an agent and set how it is priced.',
                    },
                    {
                      icon: '💳',
                      title: 'Agents pay their own way',
                      body: 'Per-use payments in USDC, capped to a limit you set.',
                    },
                  ].map((f) => (
                    <li
                      key={f.title}
                      className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3"
                    >
                      <span aria-hidden className="text-xl leading-none">
                        {f.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{f.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{f.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Enter gate -- the only action the web landing needs. */}
              <section className="mt-6 border-t border-border pt-6">
                <Button onClick={continuePastGate} size="lg" className="w-full">
                  Enter the marketplace <ArrowRight className="size-4" aria-hidden />
                </Button>
              </section>
            </>
          )}
        </div>
      </div>

      {/* Mascot voice, floating low over the stage (right side on large screens, clear of the
          card). Speaks as Crash. */}
      <div className="pointer-events-none absolute inset-x-6 bottom-16 z-20 hidden text-right lg:block">
        <Typewriter
          text={AGENT_LINES}
          loop
          speed={45}
          className="text-2xl font-medium text-foreground/90"
        />
      </div>

      {/* Mono telemetry footer -- TRUE static facts + live connection state only. */}
      <TelemetryStrip connState={connState} />
    </div>
  );
}
