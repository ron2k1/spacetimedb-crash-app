// AuctionPanel.tsx -- the live auction house band on the storefront. This is the heavily-real-time,
// clever-STDB centrepiece: humans (this browser) and headless agents bid into the same lots as the same
// kind of Identity-backed client, the price ticks up live across every connected client, and each lot
// SELF-SETTLES server-side at its deadline -- no client or worker closes it.
//
// Two clocks, on purpose. The countdown ticks CLIENT-side (setInterval) so the urgency feels smooth
// without spamming the network. But the authoritative close is SERVER-side: when our local countdown
// hits zero we show "Settling...", and a lot only reads "SOLD"/"Closed" once the database's scheduled
// reducer flips its status and that update echoes back over the subscription. That gap is the honest
// seam where the in-database auction clock shows through.
//
// Styling matches the storefront idiom exactly: inline styles, colors from theme.ui.*, fonts from FONT.
// The panel owns its own visibility -- it renders nothing when there are no auctions, so it never leaves
// an empty header on the store.

import { useEffect, useRef, useState } from "react";
import { theme, FONT, SHADOW } from "../../theme";
import { useStdbAuctions } from "../../net/useStdbAuctions";
import type { AuctionView, BidView } from "../../data/auction";

// Small uppercase section heading, matching Marketplace.tsx's SectionLabel.
function SectionLabel({ children }: { children: React.ReactNode }) {
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

// A monotonic "now" that re-renders the panel on a fixed cadence so countdowns are smooth. Only ticks
// while `active` (i.e. at least one lot is still open), so a store with no live auctions runs no timer.
function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return now;
}

// remaining ms -> "M:SS" (ceil so it reads 0:01 right up until the deadline, never 0:00 early).
function fmtCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// The live "LIVE" / "SETTLED" indicator -- mirrors the storefront StatusPill dot treatment.
function LotState({ open }: { open: boolean }) {
  const color = open ? theme.ui.good : theme.ui.inkFaint;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: FONT.body,
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: color,
          boxShadow: open ? `0 0 8px ${color}` : "none",
          animation: open ? "crash-auction-pulse 1.4s ease-in-out infinite" : "none",
        }}
      />
      {open ? "Live" : "Settled"}
    </span>
  );
}

// The compact live bid feed: newest bid first, the leader highlighted. Watching this stream in while the
// bots fight is the heavy-real-time proof.
function BidFeed({ bids }: { bids: BidView[] }) {
  if (bids.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 12 }}>
      {bids.map((b, i) => (
        <div
          key={b.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontFamily: FONT.body,
            fontSize: 11.5,
            color: i === 0 ? theme.ui.ink : theme.ui.inkFaint,
            fontWeight: i === 0 ? 700 : 500,
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {b.bidderName}
          </span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{b.amountLabel}</span>
        </div>
      ))}
    </div>
  );
}

interface LotProps {
  auction: AuctionView;
  bids: BidView[];
  now: number;
  online: boolean;
  onBid: (auctionId: string, amountMinor: bigint) => boolean;
}

function AuctionLot({ auction, bids, now, online, onBid }: LotProps) {
  const [busy, setBusy] = useState(false);
  // Clear the brief "Bidding..." flash if the lot settles or unmounts mid-flash.
  const busyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (busyTimer.current) clearTimeout(busyTimer.current); }, []);

  const open = auction.status === "open";
  const remaining = auction.endsAtMs - now;
  const settling = open && remaining <= 0; // local clock expired, awaiting the server's settle reducer
  const urgent = open && remaining > 0 && remaining <= 10_000;

  // The current leader's name is simply the top of the bid feed (highest = most recent valid bid in an
  // ascending auction). Falls back through isHighBidder for the viewer's own lead.
  const leaderName = bids[0]?.bidderName ?? (auction.isHighBidder ? "You" : null);

  let leaderLine: { text: string; color: string };
  if (!open) {
    leaderLine = auction.hasBidder
      ? { text: `Won by ${leaderName ?? "a bidder"}`, color: theme.ui.good }
      : { text: "No bids -- unsold", color: theme.ui.inkFaint };
  } else if (auction.isHighBidder) {
    leaderLine = { text: "You're winning", color: theme.ui.good };
  } else if (auction.hasBidder) {
    leaderLine = { text: `${leaderName ?? "Someone"} leads`, color: theme.ui.accent };
  } else {
    leaderLine = { text: "No bids yet -- be first", color: theme.ui.inkFaint };
  }

  const canBid = open && !settling && online && !busy;

  const handleBid = () => {
    if (!canBid) return;
    const ok = onBid(auction.id, auction.nextBidMinor);
    if (ok) {
      setBusy(true);
      busyTimer.current = setTimeout(() => setBusy(false), 700);
    }
  };

  return (
    <div
      style={{
        flex: "1 1 280px",
        minWidth: 260,
        maxWidth: 360,
        background: theme.ui.panel,
        border: `1px solid ${open ? `${theme.ui.accent}3a` : theme.ui.line}`,
        borderRadius: 18,
        padding: 18,
        boxShadow: open ? `${SHADOW.card}, 0 0 0 1px ${theme.ui.accentSoft}` : SHADOW.card,
        opacity: open ? 1 : 0.82,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Row 1: lot title + live/settled state */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span
          style={{
            fontFamily: FONT.display,
            fontSize: 15,
            fontWeight: 800,
            color: theme.ui.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {auction.listingName}
        </span>
        <LotState open={open} />
      </div>

      {/* Row 2: the hero countdown / settling / closed */}
      <div style={{ marginTop: 14, minHeight: 40 }}>
        {open ? (
          settling ? (
            <span style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 800, color: theme.ui.warn }}>
              Settling<span style={{ animation: "crash-auction-blink 1s steps(3) infinite" }}>...</span>
            </span>
          ) : (
            <span
              style={{
                fontFamily: FONT.display,
                fontSize: 34,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: 0.5,
                color: urgent ? theme.ui.bad : theme.ui.ink,
                fontVariantNumeric: "tabular-nums",
                animation: urgent ? "crash-auction-pulse 0.9s ease-in-out infinite" : "none",
              }}
            >
              {fmtCountdown(remaining)}
            </span>
          )
        ) : (
          <span style={{ fontFamily: FONT.display, fontSize: 22, fontWeight: 800, color: theme.ui.inkFaint }}>
            Closed
          </span>
        )}
      </div>

      {/* Row 3: the money + leader line */}
      <div style={{ marginTop: 14 }}>
        <div
          style={{
            fontFamily: FONT.body,
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: theme.ui.inkFaint,
          }}
        >
          {open ? (auction.hasBidder ? "Current bid" : "Opening bid") : "Sold for"}
        </div>
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: 24,
            fontWeight: 800,
            color: theme.ui.ink,
            fontVariantNumeric: "tabular-nums",
            marginTop: 2,
          }}
        >
          {auction.highBidLabel}
        </div>
        <div style={{ fontFamily: FONT.body, fontSize: 12, fontWeight: 700, color: leaderLine.color, marginTop: 4 }}>
          {leaderLine.text}
        </div>
      </div>

      {/* Row 4: the human bid affordance (open lots only) */}
      {open && (
        <button
          type="button"
          onClick={handleBid}
          disabled={!canBid}
          aria-label={`Bid ${auction.nextBidLabel} on ${auction.listingName}`}
          style={{
            marginTop: 14,
            width: "100%",
            fontFamily: FONT.body,
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: 0.3,
            color: canBid ? "#1a1626" : theme.ui.inkFaint,
            background: canBid ? theme.ui.accent : theme.ui.chipBg,
            border: "none",
            borderRadius: 12,
            padding: "10px 14px",
            cursor: canBid ? "pointer" : "not-allowed",
            transition: "background 140ms ease, color 140ms ease",
          }}
        >
          {busy ? "Bidding..." : settling ? "Closing..." : !online ? "Offline" : `Bid ${auction.nextBidLabel}`}
        </button>
      )}

      {/* Row 5: the live bid feed */}
      <BidFeed bids={bids} />
    </div>
  );
}

export function AuctionPanel() {
  const { status, online, auctions, bidsByAuction, placeBid } = useStdbAuctions();
  const hasOpen = auctions.some((a) => a.status === "open");
  const now = useNow(hasOpen);

  // Own visibility: render nothing rather than an empty band. The one exception is the very first
  // connect, where a slim "connecting" line tells the user the auction house is wiring up.
  if (auctions.length === 0) {
    if (status === "connecting") {
      return (
        <section style={{ marginBottom: 32 }}>
          <SectionLabel>Live auctions</SectionLabel>
          <div style={{ fontFamily: FONT.body, fontSize: 13, color: theme.ui.inkFaint }}>
            Connecting to the auction house...
          </div>
        </section>
      );
    }
    return null;
  }

  const openCount = auctions.filter((a) => a.status === "open").length;

  return (
    <section style={{ marginBottom: 32 }}>
      {/* One-time keyframes for the live pulse + settling blink. Static string, rendered once per panel. */}
      <style>{`
        @keyframes crash-auction-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes crash-auction-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.2; } }
      `}</style>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <SectionLabel>Live auctions</SectionLabel>
        {openCount > 0 && (
          <span
            style={{
              fontFamily: FONT.body,
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: theme.ui.good,
            }}
          >
            {openCount} open
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {auctions.map((a) => (
          <AuctionLot
            key={a.id}
            auction={a}
            bids={bidsByAuction.get(a.id) ?? []}
            now={now}
            online={online}
            onBid={placeBid}
          />
        ))}
      </div>
    </section>
  );
}
