// ListListingModal.tsx -- the SELL side of the marketplace: a dialog that lists a new capability on the
// shared service via createListing() (POST /api/listings). This is what makes Crash a two-sided market
// instead of a read-only catalog: anyone connected -- a person OR an autonomous agent -- can put an
// agent, skill, workflow, or tool up for sale, and every other connected client sees it appear in real
// time (the listing.created WS broadcast lands in the grid).
//
// The "listed by" toggle is the agentic-commerce thesis made concrete: you can list as yourself, or list
// AS an agent (kind: "agent"), and that authorship shows up on the card + in the live feed. Pricing is an
// HONEST metering label, not a real quote -- the engine's x402 layer is the only thing that ever moves
// money, and this networked surface carries no wallet or keys at all.
//
// Built inline-from-theme (no Tailwind classes) to match the rest of components/marketplace, and made a
// real dialog: role="dialog" + aria-modal, Escape and backdrop-click close, autofocus the first field,
// and focus is restored to whatever opened it on close.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { NavTabs } from "../ui/nav-tabs";
import { theme, FONT, SHADOW } from "../../theme";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  type MarketCategory,
  type MarketListing,
  type MarketSeller,
} from "../../data/marketplace";
import type { NewListingInput } from "../../net/marketplaceClient";

// Sensible default glyph per category, used until the user picks one. Mirrors the seed catalog's feel.
const DEFAULT_ICON: Record<MarketCategory, string> = {
  agent: "🤖",
  skill: "🧠",
  workflow: "🧩",
  tool: "⚙️",
};

// A small palette of glyphs to pick from -- enough variety without an emoji picker dependency.
const ICON_CHOICES = [
  "🤖",
  "🧠",
  "🧩",
  "⚙️",
  "🔎",
  "🪙",
  "👛",
  "📁",
  "📊",
  "🔔",
  "📰",
  "🛰️",
  "🧭",
  "✨",
];

// Honest metering labels the user can one-tap instead of typing. These describe HOW a capability is
// charged; the engine's x402 layer is the source of truth for any actual cost.
const PRICE_PRESETS = [
  "Pay-per-call",
  "Free",
  "~0.05 USDC / run",
  "Built-in",
  "Protocol",
  "Local",
];

const fieldLabel = {
  fontFamily: FONT.body,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.3,
  textTransform: "uppercase" as const,
  color: theme.ui.inkFaint,
  marginBottom: 8,
  display: "block",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  fontFamily: FONT.body,
  fontSize: 14,
  fontWeight: 600,
  color: theme.ui.ink,
  background: "rgba(255,255,255,0.05)",
  border: `1px solid ${theme.ui.line}`,
  borderRadius: 12,
  padding: "11px 13px",
  outline: "none",
};

export function ListListingModal({
  open,
  online,
  onClose,
  onSubmit,
}: {
  open: boolean;
  online: boolean;
  onClose: () => void;
  onSubmit: (input: NewListingInput) => Promise<MarketListing | null>;
}) {
  const reduce = useReducedMotion();
  const [category, setCategory] = useState<MarketCategory>("agent");
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [price, setPrice] = useState("Pay-per-call");
  const [icon, setIcon] = useState<string>(DEFAULT_ICON.agent);
  const [iconTouched, setIconTouched] = useState(false);
  const [sellerKind, setSellerKind] = useState<"human" | "agent">("human");
  const [agentName, setAgentName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement | null>(null);
  // Remember what had focus before the dialog opened, so we can hand it back on close.
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Reset the form to a clean slate each time the dialog opens, and capture/restore focus.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setCategory("agent");
    setName("");
    setBlurb("");
    setPrice("Pay-per-call");
    setIcon(DEFAULT_ICON.agent);
    setIconTouched(false);
    setSellerKind("human");
    setAgentName("");
    setSubmitting(false);
    setError(null);
    // Focus the first field on the next frame (after the dialog paints).
    const t = setTimeout(() => nameRef.current?.focus(), 40);
    return () => {
      clearTimeout(t);
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  // Keep the icon in sync with the category until the user deliberately picks a glyph.
  useEffect(() => {
    if (!iconTouched) setIcon(DEFAULT_ICON[category]);
  }, [category, iconTouched]);

  // Escape closes the dialog (standard modal affordance).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function submit() {
    if (!online) {
      setError("Connect to the live market to list something.");
      return;
    }
    const n = name.trim();
    const b = blurb.trim();
    if (!n || !b) {
      setError("Add a name and a short description.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const seller: MarketSeller =
      sellerKind === "agent"
        ? { kind: "agent", name: agentName.trim() || "My Agent" }
        : { kind: "human", name: "You" };
    const created = await onSubmit({
      name: n,
      blurb: b,
      category,
      price: price.trim() || "Pay-per-call",
      icon,
      seller,
    });
    setSubmitting(false);
    if (created) {
      onClose();
    } else {
      setError("Could not list it right now. Check the live market and retry.");
    }
  }

  const canSubmit = online && !submitting && name.trim() && blurb.trim();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.18 }}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "rgba(6,4,14,0.62)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="list-modal-title"
            onClick={(e) => e.stopPropagation()}
            initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
            transition={
              reduce ? { duration: 0 } : { type: "spring", stiffness: 360, damping: 30 }
            }
            style={{
              width: "100%",
              maxWidth: 500,
              maxHeight: "calc(100vh - 48px)",
              overflowY: "auto",
              borderRadius: 22,
              border: `1px solid ${theme.ui.accent}3a`,
              background:
                "linear-gradient(180deg, rgba(24,20,38,0.96), rgba(14,12,22,0.97))",
              boxShadow: SHADOW.panel,
              padding: 24,
            }}
          >
            {/* Header */}
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <h2
                  id="list-modal-title"
                  style={{
                    fontFamily: FONT.display,
                    fontSize: 21,
                    fontWeight: 800,
                    color: theme.ui.ink,
                    margin: 0,
                  }}
                >
                  List on the marketplace
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  style={{
                    width: 32,
                    height: 32,
                    flexShrink: 0,
                    borderRadius: 999,
                    border: `1px solid ${theme.ui.line}`,
                    background: "rgba(255,255,255,0.05)",
                    color: theme.ui.inkSoft,
                    cursor: "pointer",
                    fontSize: 15,
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
              <p
                style={{
                  fontFamily: FONT.body,
                  fontSize: 13.5,
                  lineHeight: 1.5,
                  color: theme.ui.inkSoft,
                  margin: "8px 0 0",
                }}
              >
                Put an agent, skill, workflow, or tool up for sale. Anyone
                connected -- a person or an agent -- can acquire it in real time.
              </p>
            </div>

            {/* Category */}
            <div style={{ marginBottom: 18 }}>
              <span style={fieldLabel}>Category</span>
              <NavTabs
                ariaLabel="Listing category"
                items={CATEGORY_ORDER.map((c) => ({
                  value: c,
                  label: CATEGORY_LABEL[c],
                }))}
                value={category}
                onChange={setCategory}
              />
            </div>

            {/* Name + icon */}
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="list-name" style={fieldLabel}>
                Name
              </label>
              <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                <span
                  aria-hidden
                  style={{
                    width: 46,
                    flexShrink: 0,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 22,
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.05)",
                    border: `1px solid ${theme.ui.line}`,
                  }}
                >
                  {icon}
                </span>
                <input
                  id="list-name"
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Earnings Call Summarizer"
                  maxLength={60}
                  style={inputStyle}
                />
              </div>
              {/* Glyph picker */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 10,
                }}
              >
                {ICON_CHOICES.map((g) => {
                  const sel = g === icon;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => {
                        setIcon(g);
                        setIconTouched(true);
                      }}
                      aria-label={`Use ${g} as the icon`}
                      aria-pressed={sel}
                      style={{
                        width: 32,
                        height: 32,
                        fontSize: 16,
                        cursor: "pointer",
                        borderRadius: 9,
                        background: sel
                          ? theme.ui.accentSoft
                          : "rgba(255,255,255,0.04)",
                        border: `1px solid ${sel ? `${theme.ui.accent}88` : theme.ui.line}`,
                      }}
                    >
                      {g}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Blurb */}
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="list-blurb" style={fieldLabel}>
                What it does
              </label>
              <textarea
                id="list-blurb"
                value={blurb}
                onChange={(e) => setBlurb(e.target.value)}
                placeholder="One or two plain sentences: what it does, what it returns."
                rows={3}
                maxLength={200}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
              />
            </div>

            {/* Price */}
            <div style={{ marginBottom: 18 }}>
              <label htmlFor="list-price" style={fieldLabel}>
                Pricing label
              </label>
              <input
                id="list-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Pay-per-call"
                maxLength={40}
                style={inputStyle}
              />
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 10,
                }}
              >
                {PRICE_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrice(p)}
                    style={{
                      fontFamily: FONT.body,
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      color: price === p ? theme.ui.ink : theme.ui.inkSoft,
                      background:
                        price === p
                          ? theme.ui.accentSoft
                          : "rgba(255,255,255,0.04)",
                      border: `1px solid ${price === p ? `${theme.ui.accent}66` : theme.ui.line}`,
                      borderRadius: 999,
                      padding: "5px 11px",
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Listed by */}
            <div style={{ marginBottom: 20 }}>
              <span style={fieldLabel}>Listed by</span>
              <div style={{ display: "flex", gap: 8 }}>
                {(
                  [
                    { k: "human" as const, icon: "🧑", label: "You" },
                    { k: "agent" as const, icon: "🤖", label: "An agent" },
                  ]
                ).map((opt) => {
                  const sel = sellerKind === opt.k;
                  return (
                    <button
                      key={opt.k}
                      type="button"
                      onClick={() => setSellerKind(opt.k)}
                      aria-pressed={sel}
                      style={{
                        flex: 1,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        fontFamily: FONT.body,
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: "pointer",
                        color: sel ? theme.ui.ink : theme.ui.inkSoft,
                        background: sel
                          ? theme.ui.accentSoft
                          : "rgba(255,255,255,0.04)",
                        border: `1px solid ${sel ? `${theme.ui.accent}66` : theme.ui.line}`,
                        borderRadius: 12,
                        padding: "10px 12px",
                      }}
                    >
                      <span aria-hidden>{opt.icon}</span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {sellerKind === "agent" && (
                <input
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="Agent name (e.g. Scout v2)"
                  maxLength={40}
                  style={{ ...inputStyle, marginTop: 10 }}
                />
              )}
            </div>

            {/* Error / offline note */}
            {(error || !online) && (
              <div
                role="status"
                style={{
                  fontFamily: FONT.body,
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: error ? theme.ui.bad : theme.ui.warn,
                  background: error
                    ? "rgba(248,113,113,0.10)"
                    : "rgba(251,191,36,0.10)",
                  border: `1px solid ${(error ? theme.ui.bad : theme.ui.warn)}3a`,
                  borderRadius: 12,
                  padding: "9px 12px",
                  marginBottom: 14,
                }}
              >
                {error ??
                  "You are offline -- the saved catalog is showing. Listing needs the live market."}
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
              }}
            >
              <button
                type="button"
                onClick={onClose}
                style={{
                  fontFamily: FONT.body,
                  fontSize: 13.5,
                  fontWeight: 700,
                  cursor: "pointer",
                  color: theme.ui.inkSoft,
                  background: "transparent",
                  border: `1px solid ${theme.ui.line}`,
                  borderRadius: 999,
                  padding: "10px 18px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit}
                style={{
                  fontFamily: FONT.body,
                  fontSize: 13.5,
                  fontWeight: 800,
                  cursor: canSubmit ? "pointer" : "not-allowed",
                  color: "#0b0a14",
                  background: canSubmit
                    ? theme.ui.accent
                    : "rgba(167,139,250,0.4)",
                  border: "none",
                  borderRadius: 999,
                  padding: "10px 22px",
                  boxShadow: canSubmit ? `0 6px 18px ${theme.ui.accent}55` : "none",
                  opacity: canSubmit ? 1 : 0.7,
                }}
              >
                {submitting ? "Listing..." : "List it"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
