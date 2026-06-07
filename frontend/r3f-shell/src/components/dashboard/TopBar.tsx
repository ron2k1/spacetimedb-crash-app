// TopBar -- the global app bar spanning the top of the window: identity, section nav, and live status. Left:
// the original "Crash" wordmark (friendly rounded type, original lettering -- not a copied logo) with
// the product tagline. Right: live status chips driven by the engine connection (taskStore). The
// connection dot is the honest signal of whether a real engine is attached; with none, it reads
// "Waking up" in warm amber rather than a scary red error, since running engine-less is a valid
// state for the shell. The provider chip is a button that opens the ProviderSwitcher popover so the
// user can see + manage which AI CLI Crash runs on.
import { useState } from 'react';
import { useTaskStore } from '../../store/taskStore';
import { useTutorialStore } from '../../store/tutorialStore';
import { useDashboardStore, type DashSection } from '../../store/dashboardStore';
import { useBasketStore } from '../../store/basketStore';
import { useDialogStore } from '../../store/dialogStore';
import { theme, FONT, SHADOW } from '../../theme';
import { ProviderSwitcher } from './ProviderSwitcher';
import { WalletBadge } from '../wallet/WalletBadge';
import { NavTabs, type NavTabItem } from '../ui/nav-tabs';
import { EDGE_INSET } from './layout';
import { isTauri } from '../../files/attach';

// The nav tabs. The leading "Home" tab is the storefront/marketplace destination (store.home); the
// rest each map to a DashSection. Making home a real, leading tab with an explicit house glyph (rather
// than a hidden sentinel or an ambiguous "Marketplace" label) gives the user an unmistakable Home
// button on the header, and lets the selection pill rest on it like any other tab. The union is
// widened to DashSection | 'home' so 'home' is a first-class value here.
type NavValue = DashSection | 'home';

// Every nav destination, in DESKTOP order. The web / Azure build shows a filtered subset (WEB_SAFE).
const ALL_TABS: NavTabItem<NavValue>[] = [
  { value: 'home', label: '🏠 Home' },
  { value: 'activity', label: '💬 Ask Crash' },
  { value: 'agent', label: 'My Agents' },
  { value: 'skills', label: 'Skills' },
  { value: 'creator', label: 'Create' },
  { value: 'connections', label: 'Connections' },
];

// The destinations that work with NO local engine -- the whole nav users see on the web demo.
// Home (the storefront), My Agents (manage + sell), and Skills (test/run) all run against the
// marketplace server or local client state, so they are fully live in a plain browser. The other three
// each REQUIRE the local desktop engine and would be dead ends on the web:
//   - Ask Crash   -> chat is delivered over the engine socket (connState is never 'ready' on web)
//   - Create      -> teaches a skill via the engine's submitRequest
//   - Connections -> hands keys to the engine over Tauri-native IPC
// So on web we show only the three; the desktop app keeps every surface. Same honesty rule the
// ProviderSwitcher follows -- never show a control that can't do what it implies.
const WEB_SAFE = new Set<NavValue>(['home', 'agent', 'skills']);

const TABS: NavTabItem<NavValue>[] = isTauri ? ALL_TABS : ALL_TABS.filter((t) => WEB_SAFE.has(t.value));

// Section values that actually have a visible tab in THIS build. Derived from TABS so it can never
// drift. Keeps the selection pill off a hidden section (only reachable if future code calls
// setSection() for a desktop-only section while on the web build).
const VISIBLE_SECTIONS = new Set<NavValue>(TABS.map((t) => t.value));

// Human-readable provider name for the chip. Falls back to a neutral label until the engine reports
// which provider it resolved (auth.status.active, mirrored to `provider` on session.ready).
const PROVIDER_LABEL: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
};

// HelpButton -- the always-visible way back into the welcome overlay. The Tutorial auto-shows once on
// first run; without this, a returning user has no way to bring it back. It's a plain pill button (same
// chip lockup as the status/provider chips) with a compass glyph + an explicit "How to use Crash" label
// so a non-technical user can spot it at a glance. Clicking it flips the transient `open` flag in
// tutorialStore, which re-mounts the overlay in App.
function HelpButton() {
  const show = useTutorialStore((s) => s.show);
  return (
    <button
      type="button"
      onClick={show}
      aria-label="How to use Crash -- open the welcome guide"
      title="How to use Crash"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        fontFamily: FONT.body,
        fontWeight: 800,
        fontSize: 12,
        color: theme.ui.ink,
        background: theme.ui.cardBg,
        border: `1.5px solid ${theme.ui.line}`,
        borderRadius: 999,
        padding: '6px 12px',
        cursor: 'pointer',
      }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>
        🧭
      </span>
      How to use Crash
    </button>
  );
}

// CartMenu -- the skills basket, relocated from the storefront body into a header dropdown so it is
// reachable from anywhere (the marketplace OR any dashboard tab). The basket STAGES capabilities; it
// never buys anything -- real spend only ever happens through the engine's x402 layer. The trigger
// carries a live count badge; the panel lists each staged item with a remove control, a Clear-all, and
// a primary "Review in Skills" action that jumps to the Skills shelf where the basket lives.
function CartMenu() {
  const items = useBasketStore((s) => s.items);
  const remove = useBasketStore((s) => s.remove);
  const clear = useBasketStore((s) => s.clear);
  const setSection = useDashboardStore((s) => s.setSection);
  const say = useDialogStore((s) => s.setPrompt);
  const setBubble = useDialogStore((s) => s.setOpen);
  const [open, setOpen] = useState(false);

  const openSkills = () => {
    setOpen(false);
    setSection('skills');
    say(`Here's your basket on the Skills shelf -- ${items.length} ready when you are.`);
    setBubble(true);
  };

  const trigger: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontFamily: FONT.body,
    fontWeight: 800,
    fontSize: 12,
    color: theme.ui.ink,
    background: theme.ui.cardBg,
    border: `1.5px solid ${open ? `${theme.ui.accent}88` : theme.ui.line}`,
    borderRadius: 999,
    padding: '6px 12px',
    cursor: 'pointer',
  };

  return (
    <span style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Your skills basket"
        style={trigger}
      >
        <span aria-hidden style={{ fontSize: 14 }}>
          🧺
        </span>
        Basket
        {items.length > 0 && (
          <span
            style={{
              fontFamily: FONT.body,
              fontSize: 11,
              fontWeight: 800,
              color: '#0b0a14',
              background: theme.ui.accent,
              borderRadius: 999,
              padding: '1px 7px',
              lineHeight: 1.6,
            }}
          >
            {items.length}
          </span>
        )}
        <span aria-hidden style={{ fontSize: 9, opacity: 0.8, marginLeft: 1 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <>
          {/* Click-away backdrop -- a transparent full-screen layer beneath the panel that closes the
              menu on any outside click, the same pattern a native popup uses. */}
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'transparent' }}
          />
          <div
            role="dialog"
            aria-label="Skills basket"
            style={{
              position: 'absolute',
              top: 'calc(100% + 10px)',
              right: 0,
              zIndex: 120,
              width: 300,
              maxHeight: 380,
              overflowY: 'auto',
              padding: 14,
              borderRadius: 18,
              background: theme.ui.panelSolid,
              border: `1.5px solid ${theme.ui.line}`,
              boxShadow: SHADOW.panel,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                marginBottom: 10,
              }}
            >
              <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 14, color: theme.ui.ink }}>
                Your skills basket
              </span>
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={clear}
                  style={{
                    fontFamily: FONT.body,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    color: theme.ui.inkSoft,
                    background: 'transparent',
                    border: `1px solid ${theme.ui.line}`,
                    borderRadius: 999,
                    padding: '5px 11px',
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {items.length === 0 ? (
              <p
                style={{
                  fontFamily: FONT.body,
                  fontSize: 12.5,
                  color: theme.ui.inkSoft,
                  margin: '4px 2px 2px',
                  lineHeight: 1.5,
                }}
              >
                Your basket is empty. Quick-add skills from the marketplace and they'll stage here.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {items.map((it) => (
                    <span
                      key={it.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontFamily: FONT.body,
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: theme.ui.ink,
                        background: theme.ui.cardBg,
                        border: `1px solid ${theme.ui.line}`,
                        borderRadius: 12,
                        padding: '7px 9px 7px 11px',
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{it.icon}</span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {it.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(it.id)}
                        aria-label={`Remove ${it.name} from basket`}
                        title={`Remove ${it.name}`}
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 999,
                          border: 'none',
                          cursor: 'pointer',
                          background: 'rgba(255,255,255,0.08)',
                          color: theme.ui.inkSoft,
                          fontSize: 11,
                          lineHeight: 1,
                          display: 'grid',
                          placeItems: 'center',
                          flex: '0 0 auto',
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={openSkills}
                  style={{
                    marginTop: 12,
                    width: '100%',
                    fontFamily: FONT.body,
                    fontSize: 12.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    color: '#0b0a14',
                    background: theme.ui.accent,
                    border: 'none',
                    borderRadius: 12,
                    padding: '9px 16px',
                    boxShadow: `0 6px 18px ${theme.ui.accent}55`,
                  }}
                >
                  Review in Skills &rarr;
                </button>
              </>
            )}
          </div>
        </>
      )}
    </span>
  );
}

function StatusChips() {
  const connState = useTaskStore((s) => s.connState);
  const provider = useTaskStore((s) => s.provider);
  const authActive = useTaskStore((s) => s.authActive);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const map = {
    ready: { dot: theme.ui.good, label: 'Connected' },
    connecting: { dot: theme.ui.warn, label: 'Waking up' },
    closed: { dot: theme.ui.inkFaint, label: 'Offline' },
    error: { dot: theme.ui.bad, label: 'Trouble' },
  } as const;
  const s = map[connState] ?? map.connecting;

  // Prefer the typed auth.status.active; fall back to the session.ready provider string.
  const providerKey = authActive ?? provider;
  const providerName = providerKey ? (PROVIDER_LABEL[providerKey] ?? providerKey) : 'Crash Engine';

  const chip: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    fontFamily: FONT.body,
    fontWeight: 800,
    fontSize: 12,
    color: theme.ui.ink,
    background: theme.ui.cardBg,
    border: `1.5px solid ${theme.ui.line}`,
    borderRadius: 999,
    padding: '6px 12px',
  };

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <span style={chip}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: s.dot, boxShadow: `0 0 8px ${s.dot}` }} />
        {s.label}
      </span>
      {/* Provider chip is the ProviderSwitcher trigger. position:relative anchors the popover under
          it. The wrapper holds both so the absolutely-positioned popover lines up with the chip. */}
      <span style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setSwitcherOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={switcherOpen}
          title="Manage AI provider"
          style={{
            ...chip,
            color: theme.ui.inkSoft,
            cursor: 'pointer',
            borderColor: switcherOpen ? `${theme.ui.accent}88` : theme.ui.line,
          }}
        >
          {providerName}
          <span aria-hidden style={{ fontSize: 9, opacity: 0.8, marginLeft: 1 }}>
            {switcherOpen ? '▲' : '▼'}
          </span>
        </button>
        <ProviderSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
      </span>
    </div>
  );
}

export function TopBar() {
  const section = useDashboardStore((s) => s.section);
  const home = useDashboardStore((s) => s.home);
  const setSection = useDashboardStore((s) => s.setSection);
  const goHome = useDashboardStore((s) => s.goHome);

  // On the storefront the pill rests on the leading "Home" tab; otherwise on the active section --
  // unless that section has no visible tab in this build (only possible for a desktop-only section in
  // the web build), in which case we fall back to Home so the nav never shows an empty selection.
  const navValue: NavValue = home || !VISIBLE_SECTIONS.has(section) ? 'home' : section;

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        left: EDGE_INSET,
        right: EDGE_INSET,
        zIndex: 95,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '8px 14px',
        borderRadius: 22,
        background: theme.ui.panel,
        backdropFilter: 'blur(10px)',
        border: `1.5px solid ${theme.ui.line}`,
        boxShadow: SHADOW.rail,
        pointerEvents: 'auto',
      }}
    >
      {/* Brand -- clicking it returns to the Marketplace storefront (goHome). Compact (icon + wordmark)
          so the bar stays a slim nav strip; the taglines that used to sit here moved to the storefront. */}
      <button
        type="button"
        onClick={goHome}
        aria-label="Crash home -- the marketplace storefront"
        title="Marketplace home"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          flex: '0 0 auto',
          border: 'none',
          background: 'transparent',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            display: 'grid',
            placeItems: 'center',
            fontSize: 23,
            background: `linear-gradient(135deg, ${theme.ui.accent}, ${theme.ui.accentDeep})`,
            boxShadow: `0 6px 14px ${theme.ui.accent}66`,
          }}
        >
          🦊
        </span>
        <span style={{ fontFamily: FONT.display, fontWeight: 800, fontSize: 22, color: theme.ui.ink, letterSpacing: 0.3 }}>
          Crash
        </span>
      </button>

      {/* Primary section nav -- centered, flexes to absorb slack between the brand and the status cluster. */}
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
        <NavTabs<NavValue>
          items={TABS}
          value={navValue}
          onChange={(v) => {
            // The "Home" tab returns to the storefront; every other tab selects its section.
            if (v === 'home') goHome();
            else setSection(v);
          }}
          ariaLabel="Dashboard sections"
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '0 0 auto' }}>
        <HelpButton />
        <WalletBadge />
        {/* Engine connection status + provider switcher: only meaningful where a local engine can
            exist (the desktop app). On the web demo there is no engine to report status for, so we omit
            it rather than show a permanent "Offline" chip and a provider switch that can't do anything.
            The WalletBadge stays -- it reads the marketplace wallet, which is live on the web. */}
        {isTauri && <StatusChips />}
        <CartMenu />
      </div>
    </div>
  );
}
