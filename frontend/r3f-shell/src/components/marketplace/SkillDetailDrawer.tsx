// SkillDetailDrawer -- the DEPTH view that opens when you SELECT a marketplace listing. This is the
// answer to "more depth into what the skills do when selected, no buy/sell": instead of clicking a card
// dropping it straight into a basket, clicking now opens this slide-over and explains what the thing
// actually does -- what it does, how it works step by step, what it calls under the hood, what you get
// back, and (honestly) how you're charged. There is intentionally no purchase here: the single action is
// to STAGE it to your basket, which is framed as "what you'd like Crash to be able to do", never a buy.
//
// GROUNDING: content comes from data/skillDetail.ts, whose `calls` entries mirror the engine's real
// capability registry (backend/src/connectors). So "uses the `search` capability over bearer auth" or
// "x402 is the HTTP-402 rail" are facts about the engine, not marketing copy.
//
// ACCESSIBILITY: it's a modal dialog -- role="dialog" + aria-modal, labelled by the listing name. Escape
// closes it, a click on the dim backdrop closes it, the close button is focused when it opens, and focus
// is restored to whatever opened it (the card) when it closes. Motion handles the slide/fade; the wrapper
// is unmounted between opens via AnimatePresence so there's no stray focus trap when nothing is selected.
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { MarketListing, MarketCategory } from "../../data/marketplace";
import { CATEGORY_SINGULAR } from "../../data/marketplace";
import { SKILL_DETAILS, fallbackSkillDetail } from "../../data/skillDetail";
import { useBasketStore } from "../../store/basketStore";
import { useDialogStore } from "../../store/dialogStore";
import { theme, FONT } from "../../theme";

// Per-category accent, matching the marketplace card pills so a drawer reads as "the same thing, bigger".
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

// A small uppercase section heading inside the drawer body.
function Heading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: FONT.body,
        fontSize: 11.5,
        fontWeight: 800,
        letterSpacing: 1.1,
        textTransform: "uppercase",
        color: theme.ui.inkFaint,
        margin: "22px 0 10px",
      }}
    >
      {children}
    </div>
  );
}

export function SkillDetailDrawer({
  selected,
  onClose,
  onRun,
}: {
  selected: MarketListing | null;
  onClose: () => void;
  // Open the REAL run overlay (TestRunModal) for this listing. Owned by the parent (Marketplace) so the
  // runner outlives this drawer's unmount. Optional so the drawer still renders without a runner wired.
  onRun?: (listing: MarketListing) => void;
}) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  // Remember what had focus before we opened so we can hand it back on close (the triggering card).
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const items = useBasketStore((s) => s.items);
  const toggle = useBasketStore((s) => s.toggle);
  const say = useDialogStore((s) => s.setPrompt);
  const setBubble = useDialogStore((s) => s.setOpen);

  const inBasket = selected ? items.some((i) => i.id === selected.id) : false;

  // Open/close lifecycle: capture+restore focus and wire Escape. Keyed on the selected id so re-opening
  // a different card re-runs it. When `selected` is null the effect's cleanup runs and nothing is bound.
  useEffect(() => {
    if (!selected) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    // Focus the close button on open so keyboard users land inside the dialog, not behind it.
    const id = window.setTimeout(() => closeBtnRef.current?.focus(), 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
      // Hand focus back to the card that opened the drawer.
      restoreFocusRef.current?.focus?.();
    };
  }, [selected, onClose]);

  // Bespoke depth if we hand-wrote one for this id; otherwise synthesize honest depth from the listing
  // itself, so user-listed agents (no compile-time entry) still open AND run instead of dead-ending here.
  const detail = selected
    ? (SKILL_DETAILS[selected.id] ?? fallbackSkillDetail(selected))
    : undefined;

  const onStage = () => {
    if (!selected) return;
    const nowIn = toggle(selected);
    say(
      nowIn
        ? `Added ${selected.icon} ${selected.name} to your basket -- it's staged, not bought. Nothing's connected or charged yet.`
        : `Took ${selected.icon} ${selected.name} back out of your basket.`,
    );
    setBubble(true);
  };

  // Run it for REAL. Hands the listing up to the parent, which closes this drawer and opens the live
  // TestRunModal -- the agent plans, pays for its tools over x402, runs a paid search, and streams a
  // cited answer. This replaces the old "open the Agent tab" bridge, which dead-ended on the web build
  // (the prompt bar that consumed it is desktop-only). Now the drawer leads from "understand what it
  // does" straight into "...then watch it actually execute against live endpoints."
  const onRunNow = () => {
    if (!selected || !onRun) return;
    onRun(selected);
  };

  return (
    <AnimatePresence>
      {selected && detail && (
        <>
          {/* Dim backdrop -- click anywhere off the panel to close. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              background: "rgba(6,4,14,0.55)",
              backdropFilter: "blur(2px)",
            }}
          />

          {/* The panel -- a right-anchored slide-over. */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="skill-detail-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 38 }}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              bottom: 0,
              zIndex: 201,
              width: "min(456px, 92vw)",
              display: "flex",
              flexDirection: "column",
              background: theme.ui.panel,
              backdropFilter: "blur(18px)",
              borderLeft: `1.5px solid ${theme.ui.line}`,
              boxShadow: "-24px 0 70px rgba(4,2,10,0.6)",
            }}
          >
            {/* Header: icon tile + category pill + name + blurb + close. */}
            <div
              style={{
                padding: "20px 22px 16px",
                borderBottom: `1px solid ${theme.ui.line}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                  <span
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 15,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 27,
                      background: "rgba(255,255,255,0.06)",
                      border: `1px solid ${CAT_TINT[selected.category].border}`,
                    }}
                  >
                    {selected.icon}
                  </span>
                  <span
                    style={{
                      fontFamily: FONT.body,
                      fontSize: 10.5,
                      fontWeight: 800,
                      letterSpacing: 0.5,
                      textTransform: "uppercase",
                      color: CAT_TINT[selected.category].fg,
                      background: CAT_TINT[selected.category].bg,
                      border: `1px solid ${CAT_TINT[selected.category].border}`,
                      borderRadius: 999,
                      padding: "4px 10px",
                    }}
                  >
                    {CATEGORY_SINGULAR[selected.category]}
                  </span>
                </div>
                <button
                  ref={closeBtnRef}
                  type="button"
                  onClick={onClose}
                  aria-label="Close details"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: `1px solid ${theme.ui.line}`,
                    background: "rgba(255,255,255,0.05)",
                    color: theme.ui.inkSoft,
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                    display: "grid",
                    placeItems: "center",
                    flex: "0 0 auto",
                  }}
                >
                  ✕
                </button>
              </div>
              <h2
                id="skill-detail-title"
                style={{
                  fontFamily: FONT.display,
                  fontWeight: 800,
                  fontSize: 23,
                  lineHeight: 1.12,
                  color: theme.ui.ink,
                  margin: "16px 0 8px",
                }}
              >
                {selected.name}
              </h2>
              <p
                style={{
                  fontFamily: FONT.body,
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: theme.ui.inkSoft,
                  margin: 0,
                }}
              >
                {selected.blurb}
              </p>
            </div>

            {/* Body: the depth. Scrolls independently of the sticky footer. */}
            <div
              style={{ flex: 1, overflowY: "auto", padding: "4px 22px 22px" }}
            >
              <Heading>What it does</Heading>
              <p
                style={{
                  fontFamily: FONT.body,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: theme.ui.ink,
                  margin: 0,
                }}
              >
                {detail.what}
              </p>

              <Heading>How it works</Heading>
              <ol
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {detail.steps.map((step, i) => (
                  <li
                    key={step.label}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        flex: "0 0 auto",
                        width: 24,
                        height: 24,
                        borderRadius: 999,
                        display: "grid",
                        placeItems: "center",
                        fontFamily: FONT.body,
                        fontSize: 12,
                        fontWeight: 800,
                        color: theme.ui.accent,
                        background: theme.ui.accentSoft,
                        border: `1px solid ${theme.ui.accent}3a`,
                        marginTop: 1,
                      }}
                    >
                      {i + 1}
                    </span>
                    <div>
                      <div
                        style={{
                          fontFamily: FONT.body,
                          fontSize: 13.5,
                          fontWeight: 800,
                          color: theme.ui.ink,
                        }}
                      >
                        {step.label}
                      </div>
                      <div
                        style={{
                          fontFamily: FONT.body,
                          fontSize: 13,
                          lineHeight: 1.45,
                          color: theme.ui.inkSoft,
                        }}
                      >
                        {step.detail}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>

              <Heading>What it calls</Heading>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {detail.calls.map((call) => (
                  <div
                    key={call.name}
                    style={{
                      borderRadius: 12,
                      border: `1px solid ${theme.ui.line}`,
                      background: "rgba(255,255,255,0.03)",
                      padding: "10px 12px",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: FONT.body,
                        fontSize: 13.5,
                        fontWeight: 800,
                        color: theme.ui.ink,
                      }}
                    >
                      {call.name}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT.body,
                        fontSize: 12.5,
                        lineHeight: 1.4,
                        color: theme.ui.inkSoft,
                      }}
                    >
                      {call.note}
                    </div>
                  </div>
                ))}
              </div>

              <Heading>What you get back</Heading>
              <p
                style={{
                  fontFamily: FONT.body,
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: theme.ui.ink,
                  margin: 0,
                }}
              >
                {detail.returns}
              </p>

              <Heading>How you're charged</Heading>
              <div
                style={{
                  borderRadius: 12,
                  border: `1px solid ${theme.ui.teal}33`,
                  background: theme.ui.tealSoft,
                  padding: "12px 13px",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                }}
              >
                <span aria-hidden style={{ fontSize: 16, lineHeight: 1.2 }}>
                  🔒
                </span>
                <p
                  style={{
                    fontFamily: FONT.body,
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: theme.ui.ink,
                    margin: 0,
                  }}
                >
                  {detail.charging}
                </p>
              </div>
            </div>

            {/* Sticky footer: the ONLY action is honest staging. No buy, no checkout, no quantity. */}
            <div
              style={{
                borderTop: `1px solid ${theme.ui.line}`,
                padding: "14px 22px 16px",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="button"
                  onClick={onStage}
                  aria-pressed={inBasket}
                  style={{
                    flex: 1,
                    fontFamily: FONT.body,
                    fontSize: 13.5,
                    fontWeight: 800,
                    cursor: "pointer",
                    padding: "12px 16px",
                    borderRadius: 12,
                    color: inBasket ? theme.ui.good : theme.ui.inkSoft,
                    background: "transparent",
                    border: inBasket
                      ? `1.5px solid ${theme.ui.good}77`
                      : `1.5px solid ${theme.ui.line}`,
                  }}
                >
                  {inBasket ? "✓ In basket" : "Add to basket"}
                </button>
                {onRun && (
                  <button
                    type="button"
                    onClick={onRunNow}
                    style={{
                      flex: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      fontFamily: FONT.body,
                      fontSize: 13.5,
                      fontWeight: 800,
                      cursor: "pointer",
                      padding: "12px 16px",
                      borderRadius: 12,
                      color: "#0b0a14",
                      background: theme.ui.accent,
                      border: "none",
                      boxShadow: `0 8px 22px ${theme.ui.accent}55`,
                    }}
                  >
                    <span aria-hidden>▶</span> Run it now
                  </button>
                )}
              </div>
              <p
                style={{
                  fontFamily: FONT.body,
                  fontSize: 11.5,
                  lineHeight: 1.45,
                  color: theme.ui.inkFaint,
                  margin: "10px 2px 0",
                  textAlign: "center",
                }}
              >
                Add to basket just stages it. Run it now executes it for real --
                live model and the x402 payment flow, streamed step by step.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
