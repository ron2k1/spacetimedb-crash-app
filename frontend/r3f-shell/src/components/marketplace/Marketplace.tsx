import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { GenerativeArtScene } from "../ui/anomalous-matter-hero";
import { GlowCard } from "../ui/spotlight-card";
import { FeaturedSpotlight } from "../ui/feature-spotlight";
import { NavTabs } from "../ui/nav-tabs";
import { SkillDetailDrawer } from "./SkillDetailDrawer";
import { ListListingModal } from "./ListListingModal";
import { AuctionPanel } from "./AuctionPanel";
import { TestRunModal } from "../dashboard/TestRunModal";
import { useDialogStore } from "../../store/dialogStore";
import { useBasketStore } from "../../store/basketStore";
import {
  CATEGORY_LABEL,
  CATEGORY_SINGULAR,
  CATEGORY_ORDER,
  type MarketCategory,
  type MarketListing,
  type MarketSeller,
} from "../../data/marketplace";
import {
  type MarketStatus,
  type NewListingInput,
} from "../../net/marketplaceClient";
import { useMarketplaceContext } from "../../net/MarketplaceProvider";
import { CONTENT_TOP, CONTENT_BOTTOM, EDGE_INSET } from "../dashboard/layout";
import { theme, FONT } from "../../theme";

// Marketplace -- the spacious center storefront that REPLACES the old full-bleed robot stage. After the
// tabbed redesign it is the "home" view: a fixed, full-width scrollable surface (App renders it when
// home === true, swapping to DashboardView when a tab is active), layered at z40 (above the HeroBackdrop
// gradients, below the floating chrome). The brand in TopBar returns here via goHome.
//
// It is a LIVE, networked market, not a static list: all data comes from useMarketplace(), which prefers
// the shared Crash Marketplace service (the "eBay" surface) and falls back to the offline seed only when
// that service is unreachable. Commerce happens here on the GRID, the way a real two-sided market works:
//   - A status pill makes "this is connected to a live, shared market right now" visible.
//   - Each card carries an Acquire (buy) action + a "List something" button opens the sell modal.
//   - Both buy + sell are GATED on `online` -- you can't transact against a service that isn't there.
// Selecting a card still OPENS A DEPTH DRAWER (SkillDetailDrawer) that leads with what the listing does,
// how it works, what it calls, and how you're charged -- deliberately NO buy/sell button in the drawer:
// the drawer is for understanding, the grid is for transacting. A separate small footer chip quick-stages
// the listing to the skills basket (basketStore) -- an honest staging area, not a purchase; real spend
// still lives only in the engine's x402 layer, never on this networked surface.
//
// Composition uses the three integrated 21st.dev components: GenerativeArtScene (anomalous-matter-hero)
// as a network-free animated hero, FeaturedSpotlight (feature-spotlight) for the one featured agent, and
// GlowCard (spotlight-card) for the responsive listing grid.

type Filter = MarketCategory | "all";

// How the listing catalog is laid out. "grid" is the spacious storefront (3-up cards); "list" is a
// dense, full-width row per listing -- more text visible at once, so a person (or an agent reading the
// screen) can scan "what's on the market" faster. The choice is a UI preference, so it persists to
// localStorage and survives a reload, the way a real marketplace remembers the view you last used.
type ViewMode = "grid" | "list";
const VIEW_STORAGE_KEY = "crash.marketplace.view";
function readStoredView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

// Per-category accent for the small card pill, drawn from the shared UI palette so the marketplace
// matches the rest of the chrome exactly. One hue family per kind, matching each category's GlowCard
// glow: agent=violet, skill=cyan, workflow=orange, tool=green.
const CAT_TINT: Record<
  MarketCategory,
  { fg: string; bg: string; border: string }
> = {
  agent: {
    fg: theme.ui.accent,
    bg: theme.ui.accentSoft,
    border: `${theme.ui.accent}55`,
  },
  skill: {
    fg: theme.ui.teal,
    bg: theme.ui.tealSoft,
    border: `${theme.ui.teal}55`,
  },
  workflow: {
    fg: "#fdba74",
    bg: "rgba(251,146,60,0.15)",
    border: "rgba(251,146,60,0.5)",
  },
  tool: {
    fg: theme.ui.good,
    bg: "rgba(74,222,128,0.14)",
    border: "rgba(74,222,128,0.5)",
  },
};

// Thin violet scrollbar scoped to the marketplace scroll area. Static constant -> safe to inject.
const SCROLLBAR_CSS = `
  .crash-mp::-webkit-scrollbar { width: 10px; }
  .crash-mp::-webkit-scrollbar-track { background: transparent; }
  .crash-mp::-webkit-scrollbar-thumb {
    background: rgba(167,139,250,0.30);
    border-radius: 8px;
    border: 2px solid transparent;
    background-clip: content-box;
  }
  .crash-mp::-webkit-scrollbar-thumb:hover {
    background: rgba(167,139,250,0.55);
    background-clip: content-box;
  }
  .crash-mp [role="button"]:focus-visible {
    outline: 2px solid ${theme.ui.accent};
    outline-offset: 2px;
    border-radius: 14px;
  }
`;

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT.body,
        fontSize: 12.5,
        fontWeight: 800,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: theme.ui.inkFaint,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

// A compact connection indicator for the control row: green "Live" when the shared service is connected,
// amber "Connecting" during bootstrap, muted "Offline" when we've fallen back to the saved catalog. This
// is the at-a-glance chrome-level status for the storefront control row.
function StatusPill({ status }: { status: MarketStatus }) {
  const cfg =
    status === "live"
      ? { color: theme.ui.good, label: "Live", bg: "rgba(74,222,128,0.12)" }
      : status === "connecting"
        ? {
            color: theme.ui.warn,
            label: "Connecting",
            bg: "rgba(251,191,36,0.12)",
          }
        : {
            color: theme.ui.inkFaint,
            label: "Offline",
            bg: "rgba(255,255,255,0.05)",
          };
  const title =
    status === "live"
      ? "Connected to the live marketplace -- listings and sales update in real time."
      : status === "connecting"
        ? "Connecting to the live marketplace..."
        : "Showing the saved catalog. Reconnecting to the live marketplace...";
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontFamily: FONT.body,
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.3,
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.color}3a`,
        borderRadius: 999,
        padding: "5px 11px",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: cfg.color,
          boxShadow: status === "live" ? `0 0 8px ${cfg.color}` : "none",
        }}
      />
      {cfg.label}
    </span>
  );
}

// Shared Acquire (buy) action for BOTH the grid card and the list row, so the two views can never drift
// in buy behavior. Local busy/done state gives the button immediate feedback (click -> "Acquiring..." ->
// a brief "Acquired" flash) while the authoritative acquiredCount converges by id from the live service.
// The done flash is torn down on unmount to avoid a setState-after-unmount warning; stopPropagation so a
// buy never also opens the depth drawer behind it.
function useAcquireAction(
  item: MarketListing,
  online: boolean,
  onAcquire: (i: MarketListing) => Promise<boolean>,
) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    },
    [],
  );
  const acquireNow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy || !online) return;
    setBusy(true);
    const ok = await onAcquire(item);
    setBusy(false);
    if (ok) {
      setDone(true);
      if (doneTimer.current) clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => setDone(false), 1600);
    }
  };
  return { busy, done, acquireNow };
}

// A single marketplace tile: a GlowCard whose only in-flow child is a full-height button, so the
// content fills the fixed-height card (see the grid-row note in spotlight-card.tsx). Clicking the card
// body OPENS the depth drawer (learn what it does). The footer carries the commerce: a quick-add chip
// (stage to basket) and an Acquire (buy) action -- both stop propagation so they never also open the
// drawer. Acquire is gated on `online` (you can't buy against a service that isn't connected). A
// basketed card wears an accent ring + a check badge on its icon.
function ListingCard({
  item,
  online,
  onAdd,
  onAcquire,
  onOpen,
  inBasket,
}: {
  item: MarketListing;
  online: boolean;
  onAdd: (i: MarketListing) => void;
  onAcquire: (i: MarketListing) => Promise<boolean>;
  onOpen: (i: MarketListing) => void;
  inBasket: boolean;
}) {
  const tint = CAT_TINT[item.category];
  const sellerIcon = item.seller?.kind === "agent" ? "🤖" : "🧑";

  // Acquire (buy) lives on the CARD, not the depth drawer -- the shared hook gives the button immediate
  // busy/done feedback while the authoritative acquiredCount converges by id (idempotent upsert) from
  // the live service, so we never have to ++ a count locally.
  const { busy, done, acquireNow } = useAcquireAction(item, online, onAcquire);

  const body: CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    height: "100%",
    width: "100%",
    textAlign: "left",
    cursor: "pointer",
    color: theme.ui.ink,
    // Selection is shown by an OUTER ring (the wrapper below) using outline + outline-offset for
    // breathing room. GlowCard clips its overflow, so an inset ring would sit cramped against the
    // content edge -- pushing the ring outside the card reads as "selected" without feeling tight.
    borderRadius: 14,
  };

  return (
    // Outer selection ring: lives OUTSIDE the clipping GlowCard, with outline-offset so it sits a few
    // px clear of the card edge -- looser, not cramped. Transparent (reserving the same box) when not
    // basketed, so toggling selection never shifts layout.
    <div
      style={{
        borderRadius: 18,
        outline: inBasket
          ? `2px solid ${theme.ui.accent}`
          : "2px solid transparent",
        outlineOffset: 4,
        transition: "outline-color 160ms ease",
      }}
    >
      <GlowCard customSize glowColor={item.glow} className="w-full" height={296}>
        <div
          role="button"
          tabIndex={0}
          aria-label={`${item.name} -- open details`}
          style={body}
          onClick={() => onOpen(item)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onOpen(item);
            }
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span
              style={{
                position: "relative",
                width: 46,
                height: 46,
                borderRadius: 13,
                display: "grid",
                placeItems: "center",
                fontSize: 24,
                background: "rgba(255,255,255,0.06)",
                border: `1px solid ${inBasket ? `${theme.ui.accent}66` : theme.ui.line}`,
              }}
            >
              {item.icon}
              {/* A check badge over the icon when basketed -- the fastest "yes, added" tell. */}
              {inBasket && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    width: 19,
                    height: 19,
                    borderRadius: 999,
                    background: theme.ui.accent,
                    color: "#0b0a14",
                    fontSize: 11,
                    fontWeight: 900,
                    display: "grid",
                    placeItems: "center",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.45)",
                  }}
                >
                  ✓
                </span>
              )}
            </span>
            <span
              style={{
                fontFamily: FONT.body,
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: tint.fg,
                background: tint.bg,
                border: `1px solid ${tint.border}`,
                borderRadius: 999,
                padding: "4px 10px",
              }}
            >
              {CATEGORY_SINGULAR[item.category]}
            </span>
          </div>

          <div>
            <div
              style={{
                fontFamily: FONT.display,
                fontSize: 17,
                fontWeight: 800,
                lineHeight: 1.15,
                color: theme.ui.ink,
                marginBottom: 6,
              }}
            >
              {item.name}
            </div>
            <div
              style={{
                fontFamily: FONT.body,
                fontSize: 12.7,
                lineHeight: 1.45,
                color: theme.ui.inkSoft,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {item.blurb}
            </div>
          </div>

          {/* Bottom group pinned to the card base: a faint social-proof line (who listed it + how many
              acquired), then the commerce footer (price + quick-add + Acquire). */}
          <div
            style={{
              marginTop: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                fontFamily: FONT.body,
                fontSize: 11.5,
                fontWeight: 700,
                color: theme.ui.inkFaint,
              }}
            >
              {item.seller ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    minWidth: 0,
                  }}
                >
                  <span aria-hidden>{sellerIcon}</span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    by {item.seller.name}
                  </span>
                </span>
              ) : (
                <span />
              )}
              {typeof item.acquiredCount === "number" && (
                <span style={{ flexShrink: 0 }}>
                  {item.acquiredCount} acquired
                </span>
              )}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontFamily: FONT.body,
                  fontSize: 13,
                  fontWeight: 800,
                  color: theme.ui.ink,
                }}
              >
                {item.price}
              </span>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  flexShrink: 0,
                }}
              >
                {/* Quick-stage chip: a separate real <button> from the card body. stopPropagation so it
                    stages to the basket WITHOUT also opening the depth drawer. Compact icon form -- the
                    secondary action next to the primary Acquire. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAdd(item);
                  }}
                  aria-pressed={inBasket}
                  aria-label={
                    inBasket
                      ? `Remove ${item.name} from basket`
                      : `Add ${item.name} to your skills basket`
                  }
                  title={inBasket ? "In your basket" : "Add to your skills basket"}
                  style={{
                    width: 32,
                    height: 32,
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 14.5,
                    cursor: "pointer",
                    color: inBasket ? theme.ui.good : tint.fg,
                    background: inBasket ? "rgba(74,222,128,0.10)" : tint.bg,
                    border: `1px solid ${inBasket ? `${theme.ui.good}66` : tint.border}`,
                    borderRadius: 999,
                  }}
                >
                  {inBasket ? "✓" : "🧺"}
                </button>
                {/* Acquire (buy). Gated on `online`; offline shows a muted "Live only" so the affordance
                    is honest about needing the live service. */}
                {online ? (
                  <button
                    type="button"
                    onClick={acquireNow}
                    disabled={busy}
                    aria-label={`Acquire ${item.name}`}
                    style={{
                      fontFamily: FONT.body,
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: busy ? "default" : "pointer",
                      color: "#0b0a14",
                      background: done ? theme.ui.good : theme.ui.accent,
                      border: "none",
                      borderRadius: 999,
                      padding: "6px 13px",
                      boxShadow: done
                        ? `0 4px 12px ${theme.ui.good}55`
                        : `0 4px 12px ${theme.ui.accent}55`,
                      opacity: busy ? 0.75 : 1,
                      transition: "background 160ms ease",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {busy ? "Acquiring..." : done ? "✓ Acquired" : "Acquire"}
                  </button>
                ) : (
                  <span
                    title="Connect to the live marketplace to acquire."
                    style={{
                      fontFamily: FONT.body,
                      fontSize: 11.5,
                      fontWeight: 800,
                      color: theme.ui.inkFaint,
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${theme.ui.line}`,
                      borderRadius: 999,
                      padding: "6px 11px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Live only
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </GlowCard>
    </div>
  );
}

// Grid/List view toggle for the listing catalog -- a small segmented control that matches the pill
// language of the rest of the chrome. SVG glyphs (not font characters) so the icons render crisply on
// any platform regardless of its emoji/symbol font, and the markup stays plain ASCII.
function ViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const Btn = (v: ViewMode, label: string, icon: ReactNode) => {
    const active = value === v;
    return (
      <button
        type="button"
        onClick={() => onChange(v)}
        aria-pressed={active}
        aria-label={`${label} view`}
        title={`${label} view`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontFamily: FONT.body,
          fontSize: 12.5,
          fontWeight: 800,
          cursor: "pointer",
          color: active ? "#0b0a14" : theme.ui.inkSoft,
          background: active ? theme.ui.accent : "transparent",
          border: "none",
          borderRadius: 999,
          padding: "6px 12px",
          transition: "background 140ms ease, color 140ms ease",
        }}
      >
        {icon}
        {label}
      </button>
    );
  };
  const gridIcon = (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  );
  const listIcon = (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <rect x="1" y="2" width="14" height="3" rx="1.5" />
      <rect x="1" y="7" width="14" height="3" rx="1.5" />
      <rect x="1" y="12" width="14" height="3" rx="1.5" />
    </svg>
  );
  return (
    <div
      role="group"
      aria-label="Listing view"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        background: "rgba(255,255,255,0.05)",
        border: `1px solid ${theme.ui.line}`,
        borderRadius: 999,
        padding: 3,
      }}
    >
      {Btn("grid", "Grid", gridIcon)}
      {Btn("list", "List", listIcon)}
    </div>
  );
}

// A single listing as a full-width LIST ROW -- the "list view" alternative to the grid card. Same data,
// same actions, laid out horizontally so more is legible at a glance: icon, name + category, a longer
// blurb, the social-proof meta, price, quick-add, and Acquire all on one scannable line. Clicking the
// row body opens the depth drawer; the basket chip + Acquire stopPropagation exactly like the card.
function ListingRow({
  item,
  online,
  onAdd,
  onAcquire,
  onOpen,
  inBasket,
}: {
  item: MarketListing;
  online: boolean;
  onAdd: (i: MarketListing) => void;
  onAcquire: (i: MarketListing) => Promise<boolean>;
  onOpen: (i: MarketListing) => void;
  inBasket: boolean;
}) {
  const tint = CAT_TINT[item.category];
  const sellerIcon = item.seller?.kind === "agent" ? "🤖" : "🧑";
  const { busy, done, acquireNow } = useAcquireAction(item, online, onAcquire);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${item.name} -- open details`}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(item);
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "14px 18px",
        cursor: "pointer",
        textAlign: "left",
        color: theme.ui.ink,
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${inBasket ? `${theme.ui.accent}66` : theme.ui.line}`,
        outline: inBasket
          ? `2px solid ${theme.ui.accent}`
          : "2px solid transparent",
        outlineOffset: 2,
        borderRadius: 14,
        transition: "outline-color 160ms ease, border-color 160ms ease",
      }}
    >
      {/* Icon (with the same basketed check badge as the card). */}
      <span
        style={{
          position: "relative",
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          fontSize: 23,
          background: "rgba(255,255,255,0.06)",
          border: `1px solid ${inBasket ? `${theme.ui.accent}66` : theme.ui.line}`,
        }}
      >
        {item.icon}
        {inBasket && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              width: 18,
              height: 18,
              borderRadius: 999,
              background: theme.ui.accent,
              color: "#0b0a14",
              fontSize: 10.5,
              fontWeight: 900,
              display: "grid",
              placeItems: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.45)",
            }}
          >
            ✓
          </span>
        )}
      </span>

      {/* Name + category chip on one line, a 2-line blurb below -- the flexible middle that grows to
          fill the row, so the list view shows noticeably more of each description than the card. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            marginBottom: 3,
          }}
        >
          <span
            style={{
              fontFamily: FONT.display,
              fontSize: 15.5,
              fontWeight: 800,
              lineHeight: 1.15,
              color: theme.ui.ink,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.name}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontFamily: FONT.body,
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: tint.fg,
              background: tint.bg,
              border: `1px solid ${tint.border}`,
              borderRadius: 999,
              padding: "3px 8px",
            }}
          >
            {CATEGORY_SINGULAR[item.category]}
          </span>
        </div>
        <div
          style={{
            fontFamily: FONT.body,
            fontSize: 12.7,
            lineHeight: 1.4,
            color: theme.ui.inkSoft,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.blurb}
        </div>
      </div>

      {/* Social-proof meta: who listed it + how many acquired. */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 2,
          fontFamily: FONT.body,
          fontSize: 11.5,
          fontWeight: 700,
          color: theme.ui.inkFaint,
        }}
      >
        {item.seller && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              maxWidth: 160,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            <span aria-hidden>{sellerIcon}</span>
            by {item.seller.name}
          </span>
        )}
        {typeof item.acquiredCount === "number" && (
          <span>{item.acquiredCount} acquired</span>
        )}
      </div>

      {/* Price, right-aligned in a fixed column so prices line up vertically down the list. */}
      <span
        style={{
          flexShrink: 0,
          fontFamily: FONT.body,
          fontSize: 13,
          fontWeight: 800,
          color: theme.ui.ink,
          minWidth: 96,
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        {item.price}
      </span>

      {/* Actions: quick-add chip + Acquire -- identical behavior to the card via the shared hook. */}
      <div
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAdd(item);
          }}
          aria-pressed={inBasket}
          aria-label={
            inBasket
              ? `Remove ${item.name} from basket`
              : `Add ${item.name} to your skills basket`
          }
          title={inBasket ? "In your basket" : "Add to your skills basket"}
          style={{
            width: 32,
            height: 32,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            fontSize: 14.5,
            cursor: "pointer",
            color: inBasket ? theme.ui.good : tint.fg,
            background: inBasket ? "rgba(74,222,128,0.10)" : tint.bg,
            border: `1px solid ${inBasket ? `${theme.ui.good}66` : tint.border}`,
            borderRadius: 999,
          }}
        >
          {inBasket ? "✓" : "🧺"}
        </button>
        {online ? (
          <button
            type="button"
            onClick={acquireNow}
            disabled={busy}
            aria-label={`Acquire ${item.name}`}
            style={{
              fontFamily: FONT.body,
              fontSize: 12,
              fontWeight: 800,
              cursor: busy ? "default" : "pointer",
              color: "#0b0a14",
              background: done ? theme.ui.good : theme.ui.accent,
              border: "none",
              borderRadius: 999,
              padding: "7px 14px",
              boxShadow: done
                ? `0 4px 12px ${theme.ui.good}55`
                : `0 4px 12px ${theme.ui.accent}55`,
              opacity: busy ? 0.75 : 1,
              transition: "background 160ms ease",
              whiteSpace: "nowrap",
            }}
          >
            {busy ? "Acquiring..." : done ? "✓ Acquired" : "Acquire"}
          </button>
        ) : (
          <span
            title="Connect to the live marketplace to acquire."
            style={{
              fontFamily: FONT.body,
              fontSize: 11.5,
              fontWeight: 800,
              color: theme.ui.inkFaint,
              background: "rgba(255,255,255,0.04)",
              border: `1px solid ${theme.ui.line}`,
              borderRadius: 999,
              padding: "7px 12px",
              whiteSpace: "nowrap",
            }}
          >
            Live only
          </span>
        )}
      </div>
    </div>
  );
}

export function Marketplace() {
  // LIVE data: prefers the shared marketplace service, falls back to the offline seed. `online` is true
  // only while the WebSocket is connected -- it gates the buy/sell affordances.
  const { listings, status, online, createListing, acquire } =
    useMarketplaceContext();

  const [filter, setFilter] = useState<Filter>("all");
  // The listing currently selected for its depth drawer (null = drawer closed).
  const [detail, setDetail] = useState<MarketListing | null>(null);
  // Whether the "List something" sell modal is open.
  const [selling, setSelling] = useState(false);
  // The listing currently being RUN for real in the TestRunModal (null = closed). Owned here, not in the
  // detail drawer, so the live run overlay outlives the drawer that launches it (the drawer unmounts on
  // close via AnimatePresence; tearing it down must not abort an in-flight run).
  const [running, setRunning] = useState<MarketListing | null>(null);
  // Catalog layout: "grid" (3-up cards) or "list" (dense rows). Initialized from localStorage and
  // written back on change, so the view a user (or agent) prefers survives a reload.
  const [view, setView] = useState<ViewMode>(readStoredView);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* storage unavailable -- the view just won't persist across reloads this session */
    }
  }, [view]);

  const say = useDialogStore((s) => s.setPrompt);
  const setBubble = useDialogStore((s) => s.setOpen);
  const toggleBasket = useBasketStore((s) => s.toggle);
  const basketItems = useBasketStore((s) => s.items);
  const inBasketIds = useMemo(
    () => new Set(basketItems.map((i) => i.id)),
    [basketItems],
  );

  const filtered = useMemo(
    () =>
      filter === "all"
        ? listings
        : listings.filter((l) => l.category === filter),
    [filter, listings],
  );

  // Tab items with per-category counts, computed over the FULL live catalog so each badge reflects what
  // is actually on the market right now (a freshly listed item bumps its category's count live).
  const tabItems = useMemo(() => {
    const count = (c: MarketCategory) =>
      listings.filter((l) => l.category === c).length;
    return [
      { value: "all" as Filter, label: "All", count: listings.length },
      ...CATEGORY_ORDER.map((c) => ({
        value: c as Filter,
        label: CATEGORY_LABEL[c],
        count: count(c),
      })),
    ];
  }, [listings]);

  // Featured = the one listing flagged by the catalog/service. Resilience: if the live service ever omits
  // the flag, fall back to the most-acquired listing so the spotlight is never empty when there IS data.
  // Memoized into a local const so its `&&`/`!` narrowing survives the onClick closure below.
  const featured = useMemo<MarketListing | undefined>(() => {
    const flagged = listings.find((l) => l.featured);
    if (flagged) return flagged;
    if (listings.length === 0) return undefined;
    return listings.reduce((top, l) =>
      (l.acquiredCount ?? 0) > (top.acquiredCount ?? 0) ? l : top,
    );
  }, [listings]);

  const showFeatured = filter === "all" && !!featured;
  const gridListings = showFeatured
    ? filtered.filter((l) => l.id !== featured!.id)
    : filtered;

  // Quick add: toggle the listing in the skills basket and confirm in plain language. Honest -- the
  // basket only stages capabilities; nothing here spends. toggle() returns the new membership so we
  // can phrase the right confirmation line.
  const quickAdd = (item: MarketListing) => {
    const nowIn = toggleBasket(item);
    say(
      nowIn
        ? `Added ${item.icon} ${item.name} to your skills basket -- find it under Skills.`
        : `Took ${item.icon} ${item.name} out of your basket.`,
    );
    setBubble(true);
  };

  // Acquire (buy) on the live marketplace. The buyer is the human operator; the engine's x402 layer is
  // what would actually move money locally -- this networked call only records the sale + bumps the
  // public count, which the live feed reflects on every connected client. Returns success to the card.
  const handleAcquire = async (item: MarketListing): Promise<boolean> => {
    const buyer: MarketSeller = { kind: "human", name: "You" };
    const ok = await acquire(item.id, buyer);
    say(
      ok
        ? `You acquired ${item.icon} ${item.name}. It's live on the market now.`
        : `Couldn't acquire ${item.name} right now -- check the live market and retry.`,
    );
    setBubble(true);
    return ok;
  };

  // List a new capability on the shared service. On success the modal closes itself; we confirm in the
  // fox bubble and snap to "All" so the brand-new card (which prepends to the grid) is in view.
  const handleCreate = async (
    input: NewListingInput,
  ): Promise<MarketListing | null> => {
    const created = await createListing(input);
    if (created) {
      setFilter("all");
      say(
        `Listed ${created.icon} ${created.name} on the marketplace -- everyone connected can see it now.`,
      );
      setBubble(true);
    }
    return created;
  };

  return (
    <>
      <div
        className="crash-mp"
        style={{
          position: "fixed",
          top: CONTENT_TOP,
          left: EDGE_INSET,
          right: EDGE_INSET,
          bottom: CONTENT_BOTTOM,
          zIndex: 40,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: SCROLLBAR_CSS }} />
        <div
          style={{ maxWidth: 1180, margin: "0 auto", padding: "2px 28px 40px" }}
        >
          {/* Hero banner: GenerativeArtScene (local Three.js, no network) behind a legibility veil. */}
          <div
            style={{
              position: "relative",
              height: 224,
              borderRadius: 24,
              overflow: "hidden",
              border: `1px solid ${theme.ui.line}`,
              marginBottom: 30,
              boxShadow: "0 18px 50px rgba(6,4,14,0.55)",
            }}
          >
            <GenerativeArtScene color="#a78bfa" />
            {/* A LIGHT, even veil -- just enough edge/vignette to frame the banner while leaving the
                generative art visible behind the copy. Legibility comes from the text-shadows on the
                copy itself (see below), not from burying the graphic under a heavy veil. */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(130% 120% at 50% 42%, rgba(8,6,18,0.12) 0%, rgba(8,6,18,0.34) 58%, rgba(8,6,18,0.66) 100%)",
              }}
            />
            <div
              style={{
                position: "relative",
                zIndex: 2,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
                padding: "26px 30px",
              }}
            >
              <div
                style={{
                  fontFamily: FONT.body,
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 1.6,
                  textTransform: "uppercase",
                  color: "#d6c9ff",
                  textShadow: "0 1px 8px rgba(0,0,0,0.55)",
                }}
              >
                Agentic Marketplace
              </div>
              <h1
                style={{
                  fontFamily: FONT.display,
                  fontWeight: 800,
                  fontSize: 34,
                  lineHeight: 1.05,
                  color: theme.ui.ink,
                  margin: "8px 0 6px",
                  textShadow:
                    "0 2px 20px rgba(0,0,0,0.60), 0 1px 4px rgba(0,0,0,0.55)",
                }}
              >
                Hire an agent. It pays for its own tools.
              </h1>
              <p
                style={{
                  fontFamily: FONT.body,
                  fontSize: 14.5,
                  lineHeight: 1.5,
                  color: "#ded8ea",
                  maxWidth: 620,
                  margin: "0 auto",
                  textShadow: "0 1px 10px rgba(0,0,0,0.55)",
                }}
              >
                A live market for agents, skills, workflows, and tools -- where
                people and agents alike list, buy, and sell. Crash meters every
                call with x402, so an agent only ever spends what you allow.
              </p>
            </div>
          </div>

          {/* Control row: animated category tabs (sliding pill) on the left; live count + connection
              status + the "List something" sell action on the right. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            <NavTabs
              ariaLabel="Filter listings by category"
              items={tabItems}
              value={filter}
              onChange={setFilter}
            />
            <div
              style={{
                marginLeft: "auto",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <ViewToggle value={view} onChange={setView} />
              <span
                style={{
                  fontFamily: FONT.body,
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: theme.ui.inkFaint,
                }}
              >
                {filtered.length} listing{filtered.length === 1 ? "" : "s"}
              </span>
              <StatusPill status={status} />
              <button
                type="button"
                onClick={() => setSelling(true)}
                style={{
                  fontFamily: FONT.body,
                  fontSize: 12.5,
                  fontWeight: 800,
                  cursor: "pointer",
                  color: "#0b0a14",
                  background: theme.ui.accent,
                  border: "none",
                  borderRadius: 999,
                  padding: "8px 16px",
                  boxShadow: `0 6px 18px ${theme.ui.accent}55`,
                  whiteSpace: "nowrap",
                }}
              >
                + List something
              </button>
            </div>
          </div>

          {/* Featured agent (unfiltered view only). Selecting it opens the depth drawer (lead with what
              it does), consistent with the rest of the grid -- commerce stays on the cards. */}
          {showFeatured && featured && (
            <section style={{ marginBottom: 32 }}>
              <SectionLabel>Featured</SectionLabel>
              <FeaturedSpotlight
                label="Featured agent"
                titleTop={featured.name}
                titleBottom=""
                description={featured.blurb}
                ctaLabel="See what it does →"
                index="01"
                onClick={() => setDetail(featured)}
              />
            </section>
          )}

          {/* Live auction house (unfiltered view). Humans + agents bid into the same lots in real time
              and each lot self-settles server-side. AuctionPanel self-hides when there are no auctions,
              so this never leaves an empty band on the store. */}
          {filter === "all" && <AuctionPanel />}

          {/* The listing grid. */}
          <section>
            <SectionLabel>
              {filter === "all" ? "All listings" : CATEGORY_LABEL[filter]}
            </SectionLabel>
            {view === "grid" ? (
              // 3-up storefront. auto-fill + a 320px min lands on 3 columns at this width yet still
              // degrades to 2-then-1 as the window narrows, so it stays responsive (no hard repeat(3)).
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: 22,
                }}
              >
                {gridListings.map((item) => (
                  <ListingCard
                    key={item.id}
                    item={item}
                    online={online}
                    onAdd={quickAdd}
                    onAcquire={handleAcquire}
                    onOpen={setDetail}
                    inBasket={inBasketIds.has(item.id)}
                  />
                ))}
              </div>
            ) : (
              // Dense list: one full-width row per listing, for the most legible "what's on the market"
              // scan -- the view a user auditing the catalog, or an agent reading the screen, reaches for.
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {gridListings.map((item) => (
                  <ListingRow
                    key={item.id}
                    item={item}
                    online={online}
                    onAdd={quickAdd}
                    onAcquire={handleAcquire}
                    onOpen={setDetail}
                    inBasket={inBasketIds.has(item.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <SkillDetailDrawer
        selected={detail}
        onClose={() => setDetail(null)}
        onRun={(l) => {
          setDetail(null);
          setRunning(l);
        }}
      />
      <TestRunModal listing={running} onClose={() => setRunning(null)} />
      <ListListingModal
        open={selling}
        online={online}
        onClose={() => setSelling(false)}
        onSubmit={handleCreate}
      />
    </>
  );
}
