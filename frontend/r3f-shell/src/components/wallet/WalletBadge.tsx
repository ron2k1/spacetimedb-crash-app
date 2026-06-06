// WalletBadge -- the agent's USDC spending wallet, surfaced top-right in the TopBar. This is the ONE
// place the x402 commerce story becomes visible at a glance. It reads the AUTHORITATIVE marketplace
// wallet (streamed over wallet.status / the WS hello and accumulated in MarketplaceProvider), falling
// back to the local engine wallet (taskStore) only when no marketplace service is attached (desktop-
// only mode). At rest it's a quiet chip showing the USDC balance; the instant a run settles a payment
// the balance drops and the chip flashes the amount just spent, so a viewer watches an agent pay for
// its own work in real time. Clicking it opens a popover of per-agent spend caps (spent / cap) -- how
// the demo shows that spending is BOUNDED before any transfer is signed.
//
// Why a balance-DECREASE flash (not a payment-phase pulse): the live required->signing->settled beat
// only exists on the desktop engine path (taskStore.payment). On the web demo, payment beats arrive as
// run.step WS frames that update the RUN record (shown inside TestRunModal), never taskStore. The one
// signal that fires identically for BOTH deployments is the wallet balance going down -- so we key the
// flash off that and get a single, source-agnostic code path.
//
// SECURITY: reads ONLY display-safe state -- a balance and per-agent cap numbers in USDC minor units.
// No private key, no wallet address, nothing secret ever reaches this layer (the x402 signing key
// lives only server-side and never crosses the WebSocket).
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTaskStore } from "../../store/taskStore";
import { useMarketplaceContext } from "../../net/MarketplaceProvider";
import { theme, FONT, SHADOW } from "../../theme";

// USDC carries 6 decimals; balances + caps arrive as integer "minor" units. One helper keeps every
// display in this file consistent (and matches the engine-side formatUsdc).
function usdc(minor: number): string {
  return (minor / 1_000_000).toFixed(2);
}

// Shared chip lockup, matched to the TopBar status/help chips so the wallet sits in the same visual
// register (translucent card glass, hairline rim, fully rounded).
const CHIP: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontFamily: FONT.body,
  fontWeight: 800,
  fontSize: 12,
  color: theme.ui.ink,
  background: theme.ui.cardBg,
  border: `1.5px solid ${theme.ui.line}`,
  borderRadius: 999,
  padding: "6px 12px",
  cursor: "pointer",
};

export function WalletBadge() {
  // Authoritative agent wallet from the marketplace service; fall back to the local engine wallet so the
  // desktop build (no marketplace server) still shows a live balance.
  const mktWallet = useMarketplaceContext().wallet;
  const localWallet = useTaskStore((s) => s.wallet);
  const wallet = mktWallet ?? localWallet;
  const [open, setOpen] = useState(false);

  // Flash the amount just spent whenever the balance DROPS. Source-agnostic: a server run's
  // wallet.status tick and the local engine both move balanceMinor, so this one path lights up for
  // either. A ref holds the previous balance; another holds the clear timer so re-renders don't stack
  // timeouts.
  const [flashAmt, setFlashAmt] = useState<string | null>(null);
  const prevBal = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bal = wallet?.balanceMinor ?? null;
  useEffect(() => {
    if (bal != null && prevBal.current != null && bal < prevBal.current) {
      setFlashAmt(usdc(prevBal.current - bal));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setFlashAmt(null), 2600);
    }
    prevBal.current = bal;
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [bal]);

  const caps = wallet?.caps ?? [];
  const flashing = flashAmt != null;

  // Two chip faces: a just-spent flash (green, pulsing dot + the delta) or the resting wallet balance.
  let dot: string | null = null;
  let label: string;
  let amount: string;
  if (flashing) {
    dot = theme.ui.good;
    label = "Paid";
    amount = `-${flashAmt} USDC`;
  } else {
    label = "Agent wallet";
    amount = wallet ? `${usdc(wallet.balanceMinor)} USDC` : "-- USDC";
  }

  return (
    <span style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Agent wallet -- USDC balance and spend caps"
        title="Agent wallet (USDC on Base)"
        style={{
          ...CHIP,
          borderColor: dot ? `${dot}88` : open ? `${theme.ui.accent}88` : theme.ui.line,
        }}
      >
        {/* Left glyph: a green status dot that pulses briefly when a payment just settled, otherwise a
            wallet mark. */}
        {dot ? (
          <motion.span
            aria-hidden
            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
            transition={{ duration: 0.9, repeat: 2, ease: "easeInOut" }}
            style={{ width: 9, height: 9, borderRadius: 999, background: dot, boxShadow: `0 0 8px ${dot}` }}
          />
        ) : (
          <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>
            💳
          </span>
        )}
        <span style={{ color: dot ? dot : theme.ui.inkSoft }}>{label}</span>
        <span style={{ color: wallet || dot ? theme.ui.ink : theme.ui.inkFaint, fontVariantNumeric: "tabular-nums" }}>
          {amount}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Agent spend caps"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: 280,
              padding: 14,
              borderRadius: 16,
              background: theme.ui.panelSolid,
              border: `1.5px solid ${theme.ui.line}`,
              boxShadow: SHADOW.panel,
              zIndex: 200,
            }}
          >
            <div
              style={{
                fontFamily: FONT.display,
                fontWeight: 800,
                fontSize: 13,
                color: theme.ui.ink,
                marginBottom: 2,
              }}
            >
              Spending caps
            </div>
            {/* Honest, plain-language frame: caps are the guardrail, checked before any payment is
                signed. No jargon ("ERC-3009", "facilitator") -- just what it means for the user. */}
            <div
              style={{
                fontFamily: FONT.body,
                fontSize: 11.5,
                lineHeight: 1.45,
                color: theme.ui.inkSoft,
                marginBottom: caps.length > 0 ? 12 : 0,
              }}
            >
              Every agent has a spending limit. Crash checks it before it pays for anything, so an agent
              can never spend more than you allow.
            </div>

            {caps.length === 0 ? (
              <div
                style={{
                  fontFamily: FONT.body,
                  fontSize: 12,
                  color: theme.ui.inkFaint,
                  paddingTop: 10,
                }}
              >
                No agent has spent anything yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {caps.map((c) => {
                  const frac = c.capMinor > 0 ? Math.min(1, c.spentMinor / c.capMinor) : 0;
                  return (
                    <div key={c.agentId}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          marginBottom: 5,
                          fontFamily: FONT.body,
                          fontSize: 12,
                        }}
                      >
                        <span
                          style={{
                            color: theme.ui.ink,
                            fontWeight: 700,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {c.agentId}
                        </span>
                        <span style={{ color: theme.ui.inkSoft, fontVariantNumeric: "tabular-nums", flex: "0 0 auto" }}>
                          {usdc(c.spentMinor)} / {usdc(c.capMinor)}
                        </span>
                      </div>
                      {/* Spend bar: fills toward the cap; turns warm as it approaches the limit. */}
                      <div
                        style={{
                          height: 6,
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.08)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${frac * 100}%`,
                            height: "100%",
                            borderRadius: 999,
                            background: frac >= 0.85 ? theme.ui.warn : theme.ui.accent,
                            transition: "width 220ms ease",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
