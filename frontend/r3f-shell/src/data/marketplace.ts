// marketplace.ts -- the agentic-marketplace storefront catalog. This is the OFFLINE-FALLBACK SEED for
// the BROWSE surface (the center Marketplace). At run time the Marketplace prefers LIVE listings fetched
// from the shared Crash Marketplace service (see net/marketplaceClient.ts) -- a networked, real-time
// "eBay" where humans and AI agents list/buy/sell. This static array is what renders when that service
// is unreachable, so the app degrades to a readable (read-only) catalog instead of a blank screen. The
// shapes here MUST match the service's MarketListing contract 1:1.
//
// Listings are grouped into the four kinds the Crash pivot is built around:
//   agent     -- a packaged autonomous worker (a "subagent" you can hire): plans, calls skills, pays, returns.
//   skill     -- a capability an agent can call (web search, payments, wallet, sandboxed files).
//   workflow  -- a deterministic multi-step flow that chains agents + skills into one repeatable job.
//   tool      -- a first-party Crash builder/runner (recipe runner, skill creator).
// Each listing carries a GlowCard hue so a whole category reads as one color family across the wall,
// plus an HONEST `price` label. Prices/tags describe how a capability is METERED (pay-per-call,
// protocol, local, built-in) -- they are catalog copy, NOT live quotes. The engine's x402 layer is the
// source of truth for what anything actually costs at run time; nothing here implies a charge happened.

export type MarketCategory = "agent" | "skill" | "workflow" | "tool";

// Mirrors the GlowCard `glowColor` union (kept as its own literal type so this data module doesn't
// import from a .tsx component). Values are assignable to GlowCard's prop 1:1.
export type MarketGlow = "blue" | "purple" | "green" | "red" | "orange";

// Who listed a thing on the marketplace. The whole point of agentic commerce is that this can be an
// autonomous AGENT, not just a human -- so the kind is surfaced in the UI ("by Scout v2 - agent").
export interface MarketSeller {
  kind: "human" | "agent";
  name: string;
}

export interface MarketListing {
  id: string;
  name: string;
  blurb: string;
  category: MarketCategory;
  /** Emoji glyph used as the card's icon tile. */
  icon: string;
  /** GlowCard hue family for this listing's category. */
  glow: MarketGlow;
  /** Honest metering label: "Pay-per-call", "~0.05 USDC / run", "Local", "Built-in", "Protocol". */
  price: string;
  tags: string[];
  /** Who listed it. Optional in the static seed; always present on live listings from the service. */
  seller?: MarketSeller;
  /** How many times it's been acquired on the marketplace. Optional in the seed; live from the service. */
  acquiredCount?: number;
  /** Epoch ms the listing was created (live listings only; used to surface "just listed"). */
  createdAt?: number;
  /** Exactly one listing should be featured; it renders large at the top via FeaturedSpotlight. */
  featured?: boolean;
}

// Default GlowCard hue for a category -- used when a live listing arrives without one, and to keep the
// seed internally consistent. Single source of truth for the category->color mapping.
export const CATEGORY_GLOW: Record<MarketCategory, MarketGlow> = {
  agent: "purple",
  skill: "blue",
  workflow: "orange",
  tool: "green",
};

export const CATEGORY_LABEL: Record<MarketCategory, string> = {
  agent: "Agents",
  skill: "Skills",
  workflow: "Workflows",
  tool: "Tools",
};

// Singular form for the small per-card category pill ("Agent" / "Skill" / "Workflow" / "Tool").
export const CATEGORY_SINGULAR: Record<MarketCategory, string> = {
  agent: "Agent",
  skill: "Skill",
  workflow: "Workflow",
  tool: "Tool",
};

// Display order for tabs/filters -- broadest/most-valuable first.
export const CATEGORY_ORDER: MarketCategory[] = [
  "agent",
  "skill",
  "workflow",
  "tool",
];

const CRASH_LABS: MarketSeller = { kind: "human", name: "Crash Labs" };

export const MARKET_LISTINGS: MarketListing[] = [
  // ---- Agents (purple) -- packaged autonomous workers (subagents you can hire) ----
  {
    id: "research-agent",
    name: "Autonomous Research Agent",
    blurb:
      "Plans a question, searches the live web with Tavily, pays per call with x402, and returns a cited brief.",
    category: "agent",
    icon: "🧭",
    glow: "purple",
    price: "~0.05 USDC / run",
    tags: ["Tavily", "x402", "cited"],
    seller: CRASH_LABS,
    acquiredCount: 128,
    featured: true,
  },
  {
    id: "filings-analyst",
    name: "Filings Analyst",
    blurb:
      "Pulls company filings and recent news, then returns a structured read with the sources it used.",
    category: "agent",
    icon: "📊",
    glow: "purple",
    price: "~0.04 USDC / run",
    tags: ["EDGAR", "Tavily"],
    seller: CRASH_LABS,
    acquiredCount: 64,
  },
  {
    id: "price-watcher",
    name: "Price Watcher",
    blurb:
      "Polls a source on a schedule and pings you only when the condition you set is actually met.",
    category: "agent",
    icon: "🔔",
    glow: "purple",
    price: "~0.01 USDC / check",
    tags: ["scheduled", "alerts"],
    seller: CRASH_LABS,
    acquiredCount: 41,
  },

  {
    // Phinite -- the multi-agent orchestration layer the demo "provisions" through. Listed as an
    // AGENT sold by an agent, so the marketplace shows agent-to-agent commerce, not just human listings.
    id: "phinite",
    name: "Phinite Multi-Agent OS",
    blurb:
      "Provisions and orchestrates a whole team of agents as one system -- the infrastructure layer for the multi-agent era.",
    category: "agent",
    icon: "♾️",
    glow: "purple",
    price: "~0.02 USDC / run",
    tags: ["orchestration", "multi-agent"],
    seller: { kind: "agent", name: "Phinite" },
    acquiredCount: 76,
  },

  // ---- Skills (blue) -- capabilities an agent calls ----
  {
    id: "tavily",
    name: "Tavily Web Search",
    blurb:
      "Real-time web search and clean content extraction, built for agents to call mid-task.",
    category: "skill",
    icon: "🔎",
    glow: "blue",
    price: "Pay-per-call",
    tags: ["search", "HTTP"],
    seller: CRASH_LABS,
    acquiredCount: 203,
  },
  {
    id: "x402",
    name: "x402 Payments",
    blurb:
      "Agent-native USDC micropayments over the HTTP 402 status -- pay exactly per request, no plan.",
    category: "skill",
    icon: "🪙",
    glow: "blue",
    price: "Protocol",
    tags: ["USDC", "402"],
    seller: CRASH_LABS,
    acquiredCount: 187,
  },
  {
    id: "wallet",
    name: "Coinbase Wallet",
    blurb:
      "A spend-capped onchain wallet so an agent can buy what it needs for a task and nothing more.",
    category: "skill",
    icon: "👛",
    glow: "blue",
    price: "Connect",
    tags: ["onchain", "capped"],
    seller: CRASH_LABS,
    acquiredCount: 96,
  },
  {
    id: "files",
    name: "File Workspace",
    blurb:
      "Sandboxed read and write inside your Crash folder only -- never the rest of your disk.",
    category: "skill",
    icon: "📁",
    glow: "blue",
    price: "Local",
    tags: ["sandbox", "fs"],
    seller: CRASH_LABS,
    acquiredCount: 72,
  },

  {
    // GMI Inference -- the skill the "Test" flow actually calls for real (see net/gmi.ts). Everything
    // else in the test run is simulated; this is the one live beat, so the demo genuinely hits the model.
    id: "gmi",
    name: "GMI Inference",
    blurb:
      "Fast, low-cost LLM inference an agent can call mid-task -- pay per token, no plan, frontier open models.",
    category: "skill",
    icon: "⚡",
    glow: "blue",
    price: "Pay-per-token",
    tags: ["LLM", "GMI"],
    seller: CRASH_LABS,
    acquiredCount: 154,
  },

  // ---- Workflows (orange) -- deterministic multi-step flows chaining agents + skills ----
  {
    id: "due-diligence",
    name: "Due Diligence Flow",
    blurb:
      "Research, filings, and news on a company combined into one cited dossier.",
    category: "workflow",
    icon: "🧩",
    glow: "orange",
    price: "~0.12 USDC / run",
    tags: ["multi-step", "cited"],
    seller: CRASH_LABS,
    acquiredCount: 38,
  },
  {
    id: "market-brief",
    name: "Daily Market Brief",
    blurb:
      "Every morning, gathers the headlines moving your watchlist and summarizes them.",
    category: "workflow",
    icon: "📰",
    glow: "orange",
    price: "~0.03 USDC / run",
    tags: ["scheduled", "summary"],
    // Listed by an AGENT, not a human -- this is the agentic-commerce thesis made visible.
    seller: { kind: "agent", name: "Scout v2" },
    acquiredCount: 57,
  },
  {
    id: "competitor-watch",
    name: "Competitor Watch",
    blurb: "Tracks a rival's site and filings, and flags meaningful changes.",
    category: "workflow",
    icon: "🛰️",
    glow: "orange",
    price: "~0.02 USDC / check",
    tags: ["monitor", "alerts"],
    seller: CRASH_LABS,
    acquiredCount: 29,
  },

  // ---- Tools (green) -- first-party Crash builders/runners ----
  {
    id: "recipe-runner",
    name: "Recipe Runner",
    blurb:
      "Run deterministic, multi-step agent flows that behave the same way every single time.",
    category: "tool",
    icon: "⚙️",
    glow: "green",
    price: "Built-in",
    tags: ["deterministic", "flows"],
    seller: CRASH_LABS,
    acquiredCount: 51,
  },
  {
    id: "skill-creator",
    name: "Skill Creator",
    blurb:
      "Compose a new agent from capabilities, test it, then publish it to your own shelf.",
    category: "tool",
    icon: "✨",
    glow: "green",
    price: "Built-in",
    tags: ["build", "publish"],
    seller: CRASH_LABS,
    acquiredCount: 44,
  },
];

/** The single featured listing (rendered large at the top of the marketplace). */
export const FEATURED_LISTING: MarketListing | undefined = MARKET_LISTINGS.find(
  (l) => l.featured,
);
