import type { MarketListing, Seller } from "./types.js";

/**
 * Starter catalog for a fresh marketplace (no data file present yet).
 *
 * Twelve listings spanning all four categories. Most are published by the house
 * seller "Crash Labs" (human), but one workflow ("Daily Market Brief") is
 * published by an AGENT seller, "Scout v2", to demonstrate that agents are
 * first-class participants on this marketplace -- they list, not just buy.
 *
 * acquiredCount is seeded > 0 only for the flagship research agent so the feed
 * has some social proof on first boot.
 */

const LABS: Seller = { kind: "human", name: "Crash Labs" };
const SCOUT: Seller = { kind: "agent", name: "Scout v2" };
/** The autonomous buyer in the agent->agent commerce demo: an agent that resells research. */
const MARKET_SCOUT: Seller = { kind: "agent", name: "Market Scout" };

/**
 * Seeds carry a stable id so demos/tests can reference them by hand
 * (e.g. POST /api/listings/research-agent/acquire). createdAt is stamped at
 * load time by the store so the feed orders sensibly; we leave it 0 here and
 * the store fills it in if absent.
 */
type SeedListing = Omit<MarketListing, "createdAt"> & { createdAt?: number };

export const SEED_LISTINGS: SeedListing[] = [
  // --- Agents (purple) ---
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
    seller: LABS,
    acquiredCount: 7,
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
    seller: LABS,
    acquiredCount: 0,
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
    seller: LABS,
    acquiredCount: 0,
  },

  // --- Skills (blue) ---
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
    seller: LABS,
    acquiredCount: 0,
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
    seller: LABS,
    acquiredCount: 0,
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
    seller: LABS,
    acquiredCount: 0,
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
    seller: LABS,
    acquiredCount: 0,
  },

  // --- Workflows (orange) ---
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
    seller: LABS,
    acquiredCount: 0,
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
    seller: SCOUT,
    acquiredCount: 0,
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
    seller: LABS,
    acquiredCount: 0,
  },
  {
    // The headline: an AGENT-sold orchestrator that, when run, AUTONOMOUSLY buys the research
    // agent below (subListingId) with no human, then runs it. The store seeds this with a stable
    // id so demos can POST /api/run { listingId: "market-scout" } directly.
    id: "market-scout",
    name: "Market Scout",
    blurb:
      "An agent that buys what it needs to answer you. It autonomously purchases the Research Agent over x402, runs it, and returns a cited brief.",
    category: "workflow",
    icon: "🛒",
    glow: "orange",
    price: "~0.06 USDC / run",
    tags: ["agent-to-agent", "x402", "autonomous"],
    seller: MARKET_SCOUT,
    acquiredCount: 3,
    subListingId: "research-agent",
  },

  // --- Tools (green) ---
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
    seller: LABS,
    acquiredCount: 0,
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
    seller: LABS,
    acquiredCount: 0,
  },
];
