// crash/src/App.tsx -- top-level layout. Before the dashboard, a one-time sign-in gate (CrashLogin)
// lets the user connect their AI provider CLI (Claude Code or Codex); it stays up until they click
// Continue (gateContinued in the store), which is always allowed so a provider-detection miss can't
// trap them. Past the gate: HeroBackdrop is the full-bleed dark ambient stage; the Marketplace is the
// spacious center storefront (the agentic-marketplace browse surface) that owns the middle of the
// screen. The Crash robot mascot now lives ONLY on the login stage (CrashLogin); it is no longer
// mounted on the dashboard. The dashboard chrome floats above all of it as fixed-position overlays:
// TopBar (a full-width app bar carrying the brand + the section tabs + live engine status) and PromptBar
// (the way to type to Crash). The body below the app bar is ONE full-area stage chosen by store.home:
// the Marketplace storefront on home, or DashboardView (the active tab's content) otherwise. The old
// left rail + right side panel are retired; the old low-poly Three.js island (Scene) is too.
// CrashSpeech is the mounted 2D reader for dialogStore (the prompt/fox lines had writers but no
// on-screen consumer once the old in-canvas DialogBubble was retired). The whole tree is wrapped in
// an ErrorBoundary whose fallback is the offline, dark-themed NotFound screen, so a render crash
// shows a friendly "this screen didn't load" page instead of a blank white void.
import './App.css';
import { CrashLogin } from './components/CrashLogin';
import { HeroBackdrop } from './components/HeroBackdrop';
import { Marketplace } from './components/marketplace/Marketplace';
import { MarketplaceProvider } from './net/MarketplaceProvider';
import { TopBar } from './components/dashboard/TopBar';
import { DashboardView } from './components/dashboard/DashboardView';
import { PromptBar } from './components/PromptBar';
import { CrashSpeech } from './components/CrashSpeech';
import { Tutorial } from './components/Tutorial';
import { ErrorBoundary } from './components/ErrorBoundary';
import NotFound from './components/ui/page-not-found';
import { useTaskStore } from './store/taskStore';
import { useTutorialStore } from './store/tutorialStore';
import { useDashboardStore } from './store/dashboardStore';
import { isTauri } from './files/attach';

export default function App() {
  const gateContinued = useTaskStore((s) => s.gateContinued);
  // Which body fills the stage: the Marketplace storefront (home) or the active tab's DashboardView.
  // Orthogonal to `section` so "which tab is lit" and "are we on the storefront" stay independent.
  const home = useDashboardStore((s) => s.home);
  // Tutorial visibility is the OR of two signals: `!seen` drives the first-run auto-show (persisted
  // "seen" flag in tutorialStore/localStorage, so returning users skip it), and `open` is the transient
  // replay flag set by the "How to use Crash" button in TopBar. Either one mounts the overlay; dismiss()
  // clears both paths (persists seen + resets open), so closing always sticks.
  const tutorialSeen = useTutorialStore((s) => s.seen);
  const tutorialOpen = useTutorialStore((s) => s.open);
  return (
    <ErrorBoundary fallback={<NotFound />}>
      {gateContinued ? (
        <MarketplaceProvider>
          <HeroBackdrop />
          {home ? <Marketplace /> : <DashboardView />}
          <TopBar />
          {/* The "Ask Crash" compose bar talks to the local engine over the socket; on web (no engine)
              it could never send. Mount it only in the desktop app, matching the engine-only nav tabs +
              status chips. CrashSpeech stays: the marketplace still drives the fox's dialog (e.g. the
              basket -> Skills nudge), so its reader has a live consumer even on the web. */}
          {isTauri && <PromptBar />}
          <CrashSpeech />
          {/* Welcome overlay, above the dashboard: auto on first run, and any time it's re-opened
              from the "How to use Crash" button in TopBar. */}
          {(tutorialOpen || !tutorialSeen) && <Tutorial />}
        </MarketplaceProvider>
      ) : (
        <CrashLogin />
      )}
    </ErrorBoundary>
  );
}
