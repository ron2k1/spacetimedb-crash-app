// TestRunModal -- the live "Run / Test" overlay for a marketplace listing.
//
// This is NOT a simulation. Clicking "Test <category>" POSTs to the marketplace service (POST /api/run)
// and then renders the REAL server-streamed execution of that listing: the agent plans, pays for its
// paid tools over x402/USDC on Base, runs a paid web search (Tavily), and synthesizes a CITED answer --
// and, for an orchestrator listing sold by an agent, it autonomously HIRES and pays a sub-agent (the
// agent-to-agent commerce moment). Every step shown here is an echo of a real server frame keyed by runId
// (see net/marketplaceClient.ts run.* stream); the wallet draws down server-side and streams back via
// wallet.status -> the WalletBadge. We never fabricate a tx hash or a result.
//
// RESILIENCE: if the service is unreachable (runListing returns null) we fall back to a tailored,
// clearly-labeled "offline" canned result so an on-stage demo never hard-stalls -- and we say so. If the
// WebSocket misses a frame, a light GET /api/runs/:id poll reconciles the run record.
//
// SECURITY: this surface carries zero secrets. The run streams only display-safe fields (synthetic phase
// strings, formatted USDC amounts, an optional public txRef, citation snippets). The x402 signing key and
// every API key live server-side and never cross to the renderer.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { theme, FONT } from "../../theme";
import {
  CATEGORY_SINGULAR,
  type MarketListing,
  type MarketSeller,
} from "../../data/marketplace";
import {
  MARKETPLACE_BASE,
  type RunStepKind,
  type RunStepWire,
} from "../../net/marketplaceClient";
import { useMarketplaceContext } from "../../net/MarketplaceProvider";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const shortTx = (tx: string) =>
  tx.length > 18 ? `${tx.slice(0, 10)}...${tx.slice(-6)}` : tx;

// USDC carries 6 decimals; costs arrive as integer "minor" units. Matches WalletBadge/engine formatting.
function usdc(minor?: number): string {
  if (minor == null) return "0.00";
  return (minor / 1_000_000).toFixed(2);
}

function truncate(s: string, n: number): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > n ? `${t.slice(0, n - 1)}...` : t;
}

// CAIP-2 chain id -> human label. The demo settles a2a/x402 on Base Sepolia testnet.
function networkLabel(net?: string): string {
  if (!net) return "Base";
  if (net === "eip155:84532") return "Base Sepolia";
  if (net === "eip155:8453") return "Base";
  return net;
}

// The buyer identity stamped on a human-initiated run (the seller side is the listing's own seller).
const BUYER: MarketSeller = { kind: "human", name: "You" };

// GET /api/config tells us the ACTUAL inference backend so the badge names it honestly instead of just
// claiming "Live". Module-cached: probed once per session and shared across every modal open.
interface MarketConfig {
  inference: string;
  /** Search tier the server reports (x402 | tavily | offline). Optional: older builds omit it. */
  search?: string;
  network: string;
}
let cfgCache: MarketConfig | null = null;
let cfgPromise: Promise<MarketConfig | null> | null = null;
function loadConfig(): Promise<MarketConfig | null> {
  if (cfgCache) return Promise.resolve(cfgCache);
  if (!cfgPromise) {
    cfgPromise = fetch(`${MARKETPLACE_BASE}/api/config`)
      .then((r) => (r.ok ? (r.json() as Promise<MarketConfig>) : null))
      .then((d) => {
        if (d) cfgCache = d;
        return d;
      })
      .catch(() => null);
  }
  return cfgPromise;
}

const INFER_LABEL: Record<string, string> = {
  "azure-openai": "Azure OpenAI",
  "github-models": "GitHub Models",
  gmi: "GMI",
  offline: "offline model",
};

// Search tier -> human label. x402/tavily are real web search; offline is the canned brief.
const SEARCH_LABEL: Record<string, string> = {
  x402: "x402 paid search",
  tavily: "Tavily live",
  offline: "offline brief",
};

// Per-step-kind presentation. The icons are UI flavor; the labels are the human reading of each beat.
const KIND_LABEL: Record<RunStepKind, string> = {
  plan: "Planning the task",
  payment: "Paying for the tool",
  search: "Searching the web",
  synthesize: "Writing the answer",
  agent_purchase: "Hiring a sub-agent",
};
const KIND_ICON: Record<RunStepKind, string> = {
  plan: "🧭",
  payment: "💳",
  search: "🔎",
  synthesize: "✍️",
  agent_purchase: "🤝",
};

// The detail line under a beat -> read from the LATEST step of that kind. payment + agent_purchase walk
// the x402 handshake (required -> signing -> settled); search reports start/ok/error.
function stepSub(s: RunStepWire, netFallback?: string): string {
  switch (s.kind) {
    case "plan":
      return s.text ? truncate(s.text, 120) : "deciding what to do";
    case "payment":
      if (s.phase === "required") return "402 Payment Required";
      if (s.phase === "signing")
        return `Signing ${s.amount ?? ""} ${s.asset ?? "USDC"}`.replace(/\s+/g, " ").trim();
      if (s.phase === "settled")
        return `Settled on ${networkLabel(s.network ?? netFallback)}${s.txRef ? ` - ${shortTx(s.txRef)}` : ""}`;
      return s.phase ?? "paying";
    case "search":
      if (s.phase === "start") return "Querying Tavily (paid per call)";
      if (s.phase === "ok") return "Results in - extracting sources";
      if (s.phase === "error") return "Search unavailable - using fallback";
      return s.phase ?? "searching";
    case "synthesize":
      return s.text ? truncate(s.text, 120) : "composing from the sources";
    case "agent_purchase":
      if (s.phase === "required") return "Sub-agent requires payment";
      if (s.phase === "signing")
        return `Paying sub-agent ${s.amount ?? ""} ${s.asset ?? "USDC"}`.replace(/\s+/g, " ").trim();
      if (s.phase === "settled")
        return `Hired - paid on ${networkLabel(s.network ?? netFallback)}${s.txRef ? ` - ${shortTx(s.txRef)}` : ""}`;
      return s.phase ?? "hiring";
  }
  return "";
}

// Collapse consecutive steps of the same kind into one beat (so the three payment phases read as one
// "Paying" row whose detail line advances), preserving order.
type Beat = { kind: RunStepKind; steps: RunStepWire[] };
function groupSteps(steps: RunStepWire[]): Beat[] {
  const beats: Beat[] = [];
  for (const s of steps) {
    const last = beats[beats.length - 1];
    if (last && last.kind === s.kind) last.steps.push(s);
    else beats.push({ kind: s.kind, steps: [s] });
  }
  return beats;
}

// Per-listing fallback shown ONLY if the marketplace service is unreachable (no server run possible).
// Tailored so the demo still looks specific. ASCII-only and honest ("offline demo response").
const CANNED: Record<string, string> = {
  "research-agent":
    "Agentic commerce is moving from demos to rails: agents now call paid APIs autonomously, settling per request in USDC over x402 instead of human-held subscriptions. Standards like Coinbase x402 formalize the HTTP 402 handshake so any agent can pay any service. Agent-to-agent marketplaces -- exactly this one -- are where the first real volume shows up.",
  "market-scout":
    "Scouted the question, then autonomously hired the research-agent sub-listing, paid it 0.05 USDC over x402 on Base, and returned its findings as one answer -- a full agent-to-agent purchase with no human in the loop.",
  "filings-analyst":
    "Latest 10-Q shows revenue up 14% YoY with gross margin steady near 61%; the flagged risk is customer concentration (top 3 = 38% of sales). Operating cash flow turned positive this quarter. Sources: SEC EDGAR 10-Q plus two recent earnings articles.",
  "price-watcher":
    "Condition not met on the last check, so no ping was sent. I poll every 5 minutes and stay silent until your exact threshold is crossed, then alert you once -- no noise in between.",
  phinite:
    "Provisioned a 3-agent team: a Planner, a Researcher (Tavily), and a Writer, wired so the Planner routes subtasks and the Writer composes the final answer. Each agent has its own spend cap and tool grants. The team is now live and addressable as one endpoint.",
  tavily:
    "Query 'x402 protocol' -> 5 fresh results with clean extracted text, e.g. 'x402 is an open payment standard that uses the HTTP 402 status to let clients pay per request...', each returned with its source URL and date, ready for an agent to cite.",
  x402:
    "Request returned 402 Payment Required; the agent auto-signed a 0.01 USDC payment, retried with the X-PAYMENT header, and got 200 OK. Settled on Base in about two seconds -- no plan, no API key, just pay-per-call.",
  wallet:
    "Spend-capped wallet connected: balance 1.00 USDC, per-task cap 0.25 USDC. The agent can draw down for tool calls within that cap and nothing more; you keep the keys.",
  files:
    "Wrote brief.md (1.2 KB) and read back research/notes.txt inside your Crash folder only. Anything outside the sandbox is refused -- the rest of your disk is invisible to the agent.",
  gmi: "Prompt -> Llama-3.3-70B on GMI returned in about a second: a tight, correct answer at a fraction of hosted-frontier cost. You pay only for the tokens used and can swap models per call with no plan.",
  "due-diligence":
    "Compiled a one-page dossier: company overview, last two filings, four recent news items, and three risk flags -- every claim linked to its source. This run cost about 0.12 USDC across research, filings, and news.",
  "market-brief":
    "This morning's brief: six headlines moving your watchlist, each summarized in a line and ranked by likely impact. Top item: a sector downgrade affecting two of your names. Delivered at 7:00 AM as scheduled.",
  "competitor-watch":
    "Detected a change on the rival's pricing page (a new enterprise tier) and a freshly filed 8-K. Flagged both with diffs and ignored 14 cosmetic changes as noise.",
  "recipe-runner":
    "Ran the 4-step recipe (search -> extract -> summarize -> save) deterministically: same inputs, same outputs, every time. Completed in 3.4s with a full step-by-step trace you can replay.",
  "skill-creator":
    "Composed a new 'Earnings Summarizer' skill from Tavily + GMI, ran a smoke test (passed), and published it to your shelf. It is now callable by any of your agents.",
};

function cannedFor(l: MarketListing): string {
  return (
    CANNED[l.id] ??
    `The ${l.name} ${l.category} ran end-to-end and returned its result. (Offline demo response -- the marketplace service was unreachable.)`
  );
}

function promptFor(l: MarketListing): string {
  return `Demonstrate the "${l.name}" ${l.category}. ${l.blurb} Show one concrete example of the exact output a user would get -- no preamble.`;
}

export function TestRunModal({
  listing,
  onClose,
}: {
  listing: MarketListing | null;
  onClose: () => void;
}) {
  const { runListing, fetchRun, runs } = useMarketplaceContext();

  // runListing/fetchRun identity changes whenever `listings` updates (the hook closes over it). Hold them
  // in refs so the start-effect can depend ONLY on [listing, nonce] and a background listing push can't
  // restart an in-flight run.
  const runListingRef = useRef(runListing);
  const fetchRunRef = useRef(fetchRun);
  useEffect(() => {
    runListingRef.current = runListing;
    fetchRunRef.current = fetchRun;
  });

  const [runId, setRunId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false); // service unreachable -> client canned fallback
  const [cannedResult, setCannedResult] = useState("");
  const [nonce, setNonce] = useState(0); // "Run again"
  const [cfg, setCfg] = useState<MarketConfig | null>(cfgCache);

  // Probe the inference backend once so the badge can name it (Azure OpenAI / GMI / offline).
  useEffect(() => {
    let c = false;
    void loadConfig().then((d) => {
      if (!c) setCfg(d);
    });
    return () => {
      c = true;
    };
  }, []);

  // Esc closes the overlay.
  useEffect(() => {
    if (!listing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listing, onClose]);

  // Start a real run when the listing opens (or "Run again" bumps the nonce). The server streams run.*
  // frames over the shared socket into runs[runId]; we just read them. If the POST fails (service down),
  // drop to the labeled offline canned result.
  useEffect(() => {
    if (!listing) return;
    let cancelled = false;
    setRunId(null);
    setOffline(false);
    setCannedResult("");

    void (async () => {
      const id = await runListingRef.current(listing.id, promptFor(listing), BUYER);
      if (cancelled) return;
      if (id) {
        setRunId(id);
      } else {
        setOffline(true);
        await sleep(1400); // dwell so the fallback reads like work, not a string snapping in
        if (cancelled) return;
        setCannedResult(cannedFor(listing));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listing, nonce]);

  const run = runId ? runs[runId] : undefined;
  const runStatus = run?.status;

  // Poll fallback: if the WS misses a frame, reconcile the persisted run record until it terminates.
  // Normal connected path never needs this (frames arrive on the shared socket).
  useEffect(() => {
    if (!runId) return;
    if (runStatus === "done" || runStatus === "error") return;
    const t = setInterval(() => {
      void fetchRunRef.current(runId);
    }, 1600);
    return () => clearInterval(t);
  }, [runId, runStatus]);

  const ui = theme.ui;
  const beats = groupSteps(run?.steps ?? []);
  const finished = runStatus === "done" || runStatus === "error";
  const errored = runStatus === "error";

  // What to show in the result panel + how to badge it.
  const resultText = offline ? cannedResult : (run?.result ?? "");
  const citations = offline ? [] : (run?.citations ?? []);
  const showResult = (!offline && runStatus === "done" && !!resultText) || (offline && !!cannedResult);

  const isLive = !offline && cfg?.inference !== "offline";
  const badgeText = offline
    ? "Demo - offline"
    : cfg?.inference === "offline"
      ? "Demo - offline model"
      : "Live";
  const badgeSub = offline
    ? "service unreachable"
    : cfg
      ? (INFER_LABEL[cfg.inference] ?? cfg.inference)
      : "marketplace service";

  // Search tier, named honestly next to the inference badge. Hidden when the modal is fully offline
  // (service unreachable) or when an older server build doesn't report the field. searchLive = a real
  // web search ran (x402 paid or key-auth Tavily); offline = the canned brief.
  const searchTier = cfg?.search;
  const searchLive = searchTier === "x402" || searchTier === "tavily";
  const searchSub = searchTier ? (SEARCH_LABEL[searchTier] ?? searchTier) : null;

  const canRunAgain = finished || offline;
  const pending =
    (!offline && !!runId && beats.length === 0 && !finished) || (offline && !cannedResult);
  const pendingText = offline
    ? "Service unreachable - preparing demo response..."
    : "Connecting to the agent...";

  return createPortal(
    <AnimatePresence>
      {listing && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "rgba(8,6,16,0.66)",
            backdropFilter: "blur(6px)",
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`Test ${CATEGORY_SINGULAR[listing.category]}: ${listing.name}`}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "92vw",
              maxWidth: 520,
              maxHeight: "86vh",
              overflowY: "auto",
              background: ui.panelSolid,
              border: `1px solid ${ui.line}`,
              borderRadius: 16,
              boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
              color: ui.ink,
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "18px 20px",
                borderBottom: `1px solid ${ui.line}`,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  flexShrink: 0,
                  borderRadius: 12,
                  background: ui.accentSoft,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 22,
                }}
              >
                {listing.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONT.display,
                    fontSize: 16,
                    fontWeight: 600,
                    color: ui.ink,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {listing.name}
                </div>
                <div style={{ fontFamily: FONT.body, fontSize: 12, color: ui.inkFaint }}>
                  Test {CATEGORY_SINGULAR[listing.category]} - {listing.price}
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                style={{
                  background: "transparent",
                  border: "none",
                  color: ui.inkFaint,
                  fontSize: 20,
                  lineHeight: 1,
                  cursor: "pointer",
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>

            {/* Live step stream */}
            <div style={{ padding: "18px 20px" }}>
              {pending && (
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                  <motion.div
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
                    style={{ width: 8, height: 8, borderRadius: "50%", background: ui.accent, marginLeft: 7 }}
                  />
                  <div style={{ fontFamily: FONT.body, fontSize: 13, color: ui.inkFaint }}>
                    {pendingText}
                  </div>
                </div>
              )}

              {beats.map((b, i) => {
                const latest = b.steps[b.steps.length - 1];
                const isLast = i === beats.length - 1;
                const done = finished || !isLast;
                const active = !done && isLast;
                const accent = b.kind === "agent_purchase";
                return (
                  <div
                    key={`${b.kind}-${i}`}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "flex-start",
                      marginBottom: 14,
                      ...(accent
                        ? {
                            background: ui.accentSoft,
                            borderRadius: 10,
                            padding: "10px 12px",
                            border: `1px solid ${ui.accent}`,
                          }
                        : {}),
                    }}
                  >
                    <div
                      style={{
                        width: 22,
                        height: 22,
                        flexShrink: 0,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 12,
                        marginTop: 1,
                        background: done ? ui.good : active ? ui.accentSoft : "transparent",
                        border: done
                          ? `1px solid ${ui.good}`
                          : active
                            ? `1px solid ${ui.accent}`
                            : `1px solid ${ui.line}`,
                        color: done ? "#0b0a12" : ui.accent,
                      }}
                    >
                      {done ? (
                        "✓"
                      ) : active ? (
                        <motion.div
                          animate={{ opacity: [0.3, 1, 0.3] }}
                          transition={{ duration: 1.1, repeat: Infinity }}
                          style={{ width: 8, height: 8, borderRadius: "50%", background: ui.accent }}
                        />
                      ) : null}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          fontFamily: FONT.body,
                          fontSize: 13.5,
                          fontWeight: 500,
                          color: done || active ? ui.ink : ui.inkFaint,
                        }}
                      >
                        <span aria-hidden>{KIND_ICON[b.kind]}</span>
                        <span>{KIND_LABEL[b.kind]}</span>
                        {accent && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: 0.4,
                              textTransform: "uppercase",
                              color: ui.accent,
                              border: `1px solid ${ui.accent}`,
                              borderRadius: 999,
                              padding: "1px 6px",
                            }}
                          >
                            agent to agent
                          </span>
                        )}
                      </div>
                      <div style={{ fontFamily: FONT.body, fontSize: 12, color: ui.inkFaint }}>
                        {stepSub(latest, cfg?.network)}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Error line (honest -- show the code, never a stack/message). */}
              {errored && (
                <div
                  style={{
                    marginTop: 4,
                    padding: 12,
                    borderRadius: 10,
                    background: ui.panel,
                    border: `1px solid ${ui.warn}`,
                    fontFamily: FONT.body,
                    fontSize: 13,
                    color: ui.inkSoft,
                  }}
                >
                  This run hit an error{run?.errorCode ? ` (code: ${run.errorCode})` : ""}. Try again.
                </div>
              )}

              {/* Result */}
              {showResult && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginTop: 4,
                    padding: 14,
                    borderRadius: 10,
                    background: ui.panel,
                    border: `1px solid ${ui.line}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span
                      style={{
                        fontFamily: FONT.body,
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        padding: "2px 7px",
                        borderRadius: 999,
                        color: isLive ? "#0b0a12" : ui.inkFaint,
                        background: isLive ? ui.good : "transparent",
                        border: isLive ? "none" : `1px solid ${ui.line}`,
                      }}
                    >
                      {badgeText}
                    </span>
                    <span style={{ fontFamily: FONT.body, fontSize: 12, color: ui.inkFaint }}>
                      {badgeSub}
                    </span>
                    {!offline && searchSub && (
                      <span
                        title={
                          searchLive
                            ? "Web search ran live"
                            : "Web search returns a canned brief - add a Tavily key or fund the x402 wallet to go live"
                        }
                        style={{
                          fontFamily: FONT.body,
                          fontSize: 10.5,
                          fontWeight: 600,
                          letterSpacing: 0.4,
                          padding: "2px 7px",
                          borderRadius: 999,
                          color: searchLive ? ui.good : ui.inkFaint,
                          border: `1px solid ${searchLive ? ui.good : ui.line}`,
                        }}
                      >
                        {searchSub}
                      </span>
                    )}
                    {!offline && run?.costMinor != null && (
                      <span
                        style={{
                          marginLeft: "auto",
                          fontFamily: FONT.body,
                          fontSize: 12,
                          color: ui.inkSoft,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        Cost {usdc(run.costMinor)} USDC
                        {run.sellerEarnedMinor != null
                          ? ` - seller earned ${usdc(run.sellerEarnedMinor)}`
                          : ""}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT.body,
                      fontSize: 13.5,
                      lineHeight: 1.6,
                      color: ui.inkSoft,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {resultText}
                  </div>

                  {/* Citations from the paid search -- the proof the answer is grounded, not made up. */}
                  {citations.length > 0 && (
                    <div style={{ marginTop: 12, borderTop: `1px solid ${ui.line}`, paddingTop: 10 }}>
                      <div
                        style={{
                          fontFamily: FONT.body,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                          textTransform: "uppercase",
                          color: ui.inkFaint,
                          marginBottom: 8,
                        }}
                      >
                        Sources
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {citations.map((c, i) => (
                          <div key={i} style={{ fontFamily: FONT.body, fontSize: 12 }}>
                            <div style={{ color: ui.ink, fontWeight: 600 }}>{c.source}</div>
                            <div style={{ color: ui.inkFaint, lineHeight: 1.45 }}>
                              {truncate(c.snippet, 160)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                padding: "14px 20px",
                borderTop: `1px solid ${ui.line}`,
              }}
            >
              <button
                onClick={() => setNonce((n) => n + 1)}
                disabled={!canRunAgain}
                style={{
                  fontFamily: FONT.body,
                  fontSize: 13,
                  padding: "8px 14px",
                  borderRadius: 9,
                  cursor: canRunAgain ? "pointer" : "default",
                  background: "transparent",
                  border: `1px solid ${ui.line}`,
                  color: canRunAgain ? ui.inkSoft : ui.inkFaint,
                  opacity: canRunAgain ? 1 : 0.5,
                }}
              >
                Run again
              </button>
              <button
                onClick={onClose}
                style={{
                  fontFamily: FONT.body,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 16px",
                  borderRadius: 9,
                  cursor: "pointer",
                  background: ui.accent,
                  border: "none",
                  color: "#0b0a12",
                }}
              >
                Done
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
