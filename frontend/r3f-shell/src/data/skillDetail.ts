// skillDetail.ts -- the DEPTH layer behind each marketplace listing. The storefront card (marketplace.ts)
// only has room for a one-line blurb; this is what the user sees when they SELECT a listing and want to
// understand what it actually does. It is deliberately NOT a buy/sell surface: there are no prices to
// "checkout", no quantities, no purchase. It answers four plain questions -- what it does, how it works,
// what it calls, and what you get back -- plus an honest note on how (and whether) you're charged.
//
// HONESTY / GROUNDING: the `calls` entries are written to match the engine's real capability model in
// backend/src/connectors/{types.ts,registry.ts}. The capability enum there is exactly: chat,
// image.generate, tts.speak, search, video.generate, x402, fs. So when this file says the Tavily
// connector uses the `search` capability over bearer auth at api.tavily.com, or that x402 is the HTTP-402
// rail, or that the file workspace is the local-only `fs` capability -- those are the registry's facts,
// not marketing. Nothing here implies a charge has happened; the engine's x402 layer remains the only
// source of truth for real spend, and every charge is bounded by the cap the user sets.

import type { MarketListing } from "./marketplace";

/** One step in the "How it works" sequence -- a short label plus a plain-language detail. */
export interface SkillStep {
  label: string;
  detail: string;
}

/** One thing the listing calls under the hood. `note` ties it to the real connector/capability model. */
export interface SkillCall {
  name: string;
  note: string;
}

export interface SkillDetail {
  /** The fuller "what it actually does" paragraph the card blurb can't fit. */
  what: string;
  /** The concrete steps it runs (agents) or the operations it exposes (connectors/tools). */
  steps: SkillStep[];
  /** What it calls under the hood -- grounded in the engine's connector registry. */
  calls: SkillCall[];
  /** What you get back when it finishes. */
  returns: string;
  /** Honest note on how you're charged (or that you aren't). */
  charging: string;
}

// Keyed by MarketListing.id so the drawer is a single O(1) lookup from the selected card. Every id in
// data/marketplace.ts has an entry here; the drawer falls back gracefully if one is ever missing.
export const SKILL_DETAILS: Record<string, SkillDetail> = {
  // ---- Agents -------------------------------------------------------------------------------------
  "research-agent": {
    what: "Hand it a question and it runs the whole loop for you: it breaks the question into a few focused searches, runs each against the live web, pays the tiny per-search fee itself, reads the results, and writes back a short brief with a source linked under every claim. You never touch an API key or a wallet -- you set a spending cap and it stays under it.",
    steps: [
      {
        label: "Plan",
        detail: "Turns your question into a handful of focused search queries.",
      },
      {
        label: "Search the live web",
        detail:
          "Runs each query through Tavily and pulls back clean, readable results.",
      },
      {
        label: "Pay as it goes",
        detail:
          "Clears each search's micro-fee over x402 -- never above your cap.",
      },
      {
        label: "Read and cite",
        detail: "Keeps the source URL for every fact it uses.",
      },
      {
        label: "Write the brief",
        detail: "Returns a short answer with inline citations.",
      },
    ],
    calls: [
      {
        name: "Tavily web search",
        note: "the `search` capability -- your key, called over HTTPS",
      },
      {
        name: "x402 payments",
        note: "settles each search fee; the total stays under your per-agent cap",
      },
    ],
    returns:
      "A short, readable brief that answers your question, with a linked source beneath every claim.",
    charging:
      "About 0.05 USDC for a typical run -- just the sum of the few searches it makes. Only the engine's x402 layer ever moves money, and only up to the cap you set.",
  },
  "filings-analyst": {
    what: "Point it at a company and it gathers the recent filings plus the news around them, then hands back a structured read -- what changed, why it might matter, and the exact documents behind each point.",
    steps: [
      {
        label: "Find the company",
        detail: "Resolves the ticker or name you give it.",
      },
      {
        label: "Pull filings",
        detail: "Gathers the most recent filings to work from.",
      },
      {
        label: "Search the news",
        detail:
          "Runs Tavily searches for current context around those filings.",
      },
      {
        label: "Cross-read",
        detail: "Lines the filings up against the news and flags what moved.",
      },
      {
        label: "Return the read",
        detail: "Writes a structured summary with its sources.",
      },
    ],
    calls: [
      { name: "Filings source", note: "recent company filings" },
      {
        name: "Tavily web search",
        note: "the `search` capability for current news",
      },
      { name: "x402 payments", note: "meters only the web-search calls" },
    ],
    returns:
      "A structured read -- key changes, context, and the filings and articles it used.",
    charging:
      "About 0.04 USDC -- the news searches. Filing pulls don't meter; only Tavily calls clear through x402.",
  },
  "price-watcher": {
    what: "Tell it what to watch and the condition that matters, and it checks on a schedule -- quietly -- and only pings you when the thing you actually care about happens. No noise the rest of the time.",
    steps: [
      {
        label: "Set the watch",
        detail: 'You give it a source and a condition, e.g. "drops below X".',
      },
      {
        label: "Check on schedule",
        detail: "It polls the source at the interval you choose.",
      },
      {
        label: "Compare",
        detail: "Each check tests your condition -- nothing else.",
      },
      {
        label: "Alert only on a hit",
        detail:
          "It pings you the moment the condition is met, and stays silent otherwise.",
      },
    ],
    calls: [
      {
        name: "Web search / source fetch",
        note: "the `search` capability to read the source each cycle",
      },
      {
        name: "x402 payments",
        note: "meters each scheduled check, one micro-fee at a time",
      },
    ],
    returns:
      "A single alert when your condition is met -- and nothing in between.",
    charging:
      "About 0.01 USDC per check. You're charged only for the checks it actually runs, capped to your limit.",
  },

  // ---- Skills -------------------------------------------------------------------------------------
  tavily: {
    what: "Real-time web search built for agents to call mid-task. It returns clean, extracted content -- not a wall of raw HTML -- so whatever's calling it can read the result straight away.",
    steps: [
      {
        label: "Query",
        detail: "Takes a search string from the agent that's running.",
      },
      { label: "Fetch", detail: "Hits Tavily's API over HTTPS with your key." },
      {
        label: "Extract",
        detail: "Returns ranked results with clean, readable content.",
      },
    ],
    calls: [
      {
        name: "api.tavily.com",
        note: "the `search` family -- bearer-token auth, your key, held only in the engine",
      },
    ],
    returns:
      "Ranked search results with extracted, readable content and source URLs.",
    charging:
      "Pay-per-call -- each search is one metered request. Your key never leaves the engine and never crosses to the browser.",
  },
  x402: {
    what: "The payment rail that makes agents self-sufficient. When a tool answers an agent's request with HTTP 402 (Payment Required), x402 settles the exact micro-fee for that one request in USDC -- no subscription, no plan, no human in the loop.",
    steps: [
      { label: "Request", detail: "An agent calls a paid tool." },
      {
        label: "402",
        detail: "The tool replies 402 with the price for that one call.",
      },
      { label: "Settle", detail: "x402 pays exactly that amount in USDC." },
      {
        label: "Proceed",
        detail: "The tool returns the result, charge complete.",
      },
    ],
    calls: [
      { name: "HTTP 402 flow", note: "the agent-native payment standard" },
      {
        name: "Your wallet",
        note: "spend is capped per agent and per task in the engine",
      },
    ],
    returns:
      "A settled per-request payment so the agent can keep working -- nothing beyond the call's cost.",
    charging:
      "It IS the metering layer. Every charge in Crash flows through here, and every charge is bounded by the cap you set.",
  },
  wallet: {
    what: "A spend-capped onchain wallet an agent can draw from -- just enough to buy what a task needs, and not a cent more. You fund it and set the ceiling; the agent works within it.",
    steps: [
      { label: "Connect", detail: "Link the wallet once." },
      {
        label: "Cap",
        detail: "Set a per-agent and per-task spending ceiling.",
      },
      {
        label: "Spend within bounds",
        detail: "The agent pays for tools through x402, never above the cap.",
      },
      {
        label: "See every move",
        detail: "Each spend shows up as an activity beat you can watch.",
      },
    ],
    calls: [
      { name: "x402 payments", note: "the wallet is what x402 draws from" },
      {
        name: "Onchain USDC",
        note: "spend is capped and enforced in the engine before anything is signed",
      },
    ],
    returns:
      "A funded, capped balance an agent can spend against -- with every payment visible.",
    charging:
      "You decide the ceiling. The engine enforces it before signing, so an agent can't exceed what you allowed.",
  },
  files: {
    what: "Read and write files for an agent -- but only inside your Crash folder, never anywhere else on your disk. The boundary is enforced by the engine, not by trust.",
    steps: [
      {
        label: "Scope",
        detail: "Everything is rooted at your Crash workspace folder.",
      },
      { label: "Read", detail: "An agent can read files you've placed there." },
      {
        label: "Write",
        detail: "An agent can write results back into that folder.",
      },
      {
        label: "Stay jailed",
        detail: "Any path that resolves outside the folder is refused.",
      },
    ],
    calls: [
      {
        name: "Local filesystem",
        note: "the `fs` capability -- local-only, no network",
      },
    ],
    returns:
      "File reads and writes confined to your Crash workspace -- nothing outside it.",
    charging: "Free -- it's local. No network, no metering, no key.",
  },

  // ---- Workflows ----------------------------------------------------------------------------------
  // Workflows chain the agents + skills above into one repeatable job. Their `calls` reference the same
  // real capabilities (search, x402, filings) -- a workflow is a fixed recipe over them, not new magic.
  "due-diligence": {
    what: "Give it a company and it runs a full first pass for you: it pulls the recent filings, searches the live web for what's being said right now, lines the two up, and hands back one cited dossier -- the changes that matter, the context around them, and the exact documents and articles behind each point.",
    steps: [
      {
        label: "Resolve the company",
        detail: "Turns the name or ticker you give it into the right entity.",
      },
      {
        label: "Pull filings",
        detail: "Gathers the most recent filings to anchor the read.",
      },
      {
        label: "Search the news",
        detail: "Runs Tavily searches for current context, paying per call.",
      },
      {
        label: "Cross-read and assemble",
        detail: "Combines filings and news into one structured dossier.",
      },
      {
        label: "Return with sources",
        detail: "Writes the dossier with a source under every claim.",
      },
    ],
    calls: [
      { name: "Filings source", note: "recent company filings" },
      {
        name: "Tavily web search",
        note: "the `search` capability for current context",
      },
      {
        name: "x402 payments",
        note: "meters only the web-search calls in the chain",
      },
    ],
    returns:
      "One cited dossier -- key changes, the context around them, and the filings and articles behind each point.",
    charging:
      "About 0.12 USDC for a typical run -- the sum of the searches across the whole flow. Filing pulls don't meter; only Tavily calls clear through x402, capped to your limit.",
  },
  "market-brief": {
    what: "A standing morning job: each day it gathers the headlines moving the watchlist you set, reads them, and writes back a short brief so you start the day already caught up. It runs on a schedule and only spends on the searches it actually makes.",
    steps: [
      {
        label: "Set the watchlist",
        detail: "You give it the names or topics to track.",
      },
      {
        label: "Gather each morning",
        detail: "On schedule, it searches the live web for what moved.",
      },
      {
        label: "Read and group",
        detail: "Clusters the headlines by what they're about.",
      },
      {
        label: "Write the brief",
        detail: "Returns a short, readable summary with its sources.",
      },
    ],
    calls: [
      {
        name: "Tavily web search",
        note: "the `search` capability, one metered call per query",
      },
      {
        name: "x402 payments",
        note: "settles each search; the run stays under your cap",
      },
    ],
    returns:
      "A short daily brief of what moved your watchlist, with a source under each item.",
    charging:
      "About 0.03 USDC per morning run -- just the searches it makes that day. Only x402 moves money, only up to the cap you set.",
  },
  "competitor-watch": {
    what: "Point it at a rival and it keeps an eye on their site and filings for you -- checking on a schedule and flagging only the changes that actually mean something, so you hear about a real move and nothing in between.",
    steps: [
      {
        label: "Set the target",
        detail: "You give it the company and what counts as a change.",
      },
      {
        label: "Check on schedule",
        detail: "It reads the site and filings at your chosen interval.",
      },
      {
        label: "Compare to last time",
        detail: "Each check is diffed against the previous one.",
      },
      {
        label: "Flag real moves",
        detail: "It alerts you only when a meaningful change shows up.",
      },
    ],
    calls: [
      {
        name: "Web search / source fetch",
        note: "the `search` capability to read the site each cycle",
      },
      { name: "Filings source", note: "recent filings for the target" },
      {
        name: "x402 payments",
        note: "meters each scheduled check, one micro-fee at a time",
      },
    ],
    returns:
      "An alert when something meaningful changes -- and silence the rest of the time.",
    charging:
      "About 0.02 USDC per check. You're charged only for the checks it runs, capped to your limit.",
  },

  // ---- Tools --------------------------------------------------------------------------------------
  "recipe-runner": {
    what: "Runs multi-step agent flows deterministically -- the same inputs produce the same steps in the same order, every time. When you need a flow you can trust to behave identically on every run, this is the runner.",
    steps: [
      {
        label: "Load the recipe",
        detail: "A fixed sequence of steps with no hidden randomness.",
      },
      {
        label: "Run in order",
        detail: "Each step runs the same way every time.",
      },
      {
        label: "Meter per step",
        detail: "Any paid call inside a step still clears through x402.",
      },
      { label: "Return", detail: "Hands back the result of the final step." },
    ],
    calls: [
      {
        name: "Whatever the recipe declares",
        note: "search, payments, files -- only the capabilities the recipe lists",
      },
    ],
    returns: "The deterministic result of the flow -- reproducible run to run.",
    charging:
      "Built-in. The runner itself is free; only the metered calls inside a recipe (if any) clear through x402.",
  },
  "skill-creator": {
    what: "Build your own agent by composing capabilities -- pick what it can call, give it its instructions, test it, and publish it to your own shelf. No code, just capabilities wired together.",
    steps: [
      {
        label: "Compose",
        detail: "Choose the capabilities the new agent may use.",
      },
      {
        label: "Instruct",
        detail: "Write what it should do in plain language.",
      },
      {
        label: "Test",
        detail: "Run it against a real input before you keep it.",
      },
      { label: "Publish", detail: "Save it to your shelf to reuse or share." },
    ],
    calls: [
      {
        name: "Connector registry",
        note: "offers only the capabilities you actually have keys for",
      },
    ],
    returns: "A new, reusable agent on your shelf -- yours to run or refine.",
    charging:
      "Built-in. Creating and publishing is free; the agent you build meters its own calls when it runs.",
  },
};

// Synthesized depth for a listing that has NO hand-written entry above -- i.e. anything the community
// lists at run time (seller uploads), whose id is not a compile-time key in SKILL_DETAILS. Without this
// the drawer dead-ends: a freshly listed agent that can't be opened can't be run, breaking the whole
// publish -> appears -> run loop that two-sided agentic commerce depends on.
//
// HONESTY: this is NOT a bespoke spec invented per listing. It describes the SHARED agent runtime every
// listing actually executes on when you press "Run it now" -- the marketplace service plans the task,
// runs live web search paying per call over x402, and streams back a cited answer (backend search/x402 +
// the active inference provider). The `what` text says plainly that there's no hand-written spec, so the
// steps describe the shared loop. The seller's own honest `price` label rides through verbatim into the
// charging note; nothing here implies a charge has happened.
export function fallbackSkillDetail(listing: MarketListing): SkillDetail {
  const sellerName = listing.seller?.name ?? "the seller";
  const byAgent = listing.seller?.kind === "agent";
  return {
    what:
      `Listed by ${sellerName}${byAgent ? " (an autonomous agent)" : ""}. ` +
      "Crash doesn't ship a hand-written spec for community listings, so the steps below describe the " +
      "shared agent runtime every listing runs on -- the same plan, paid search, then synthesize loop " +
      "you can watch stream live when you run it.",
    steps: [
      {
        label: "Plan",
        detail: "Turns the task into a focused set of web searches.",
      },
      {
        label: "Search the live web",
        detail:
          "Runs each query through Tavily and pulls back clean, readable results.",
      },
      {
        label: "Pay as it goes",
        detail: "Clears each search's micro-fee over x402 -- never above your cap.",
      },
      {
        label: "Synthesize",
        detail:
          "Reads the results and writes a short answer with a source under each claim.",
      },
    ],
    calls: [
      {
        name: "Tavily web search",
        note: "the `search` capability, called over HTTPS",
      },
      {
        name: "x402 payments",
        note: "settles each search fee; the total stays under your per-agent cap",
      },
      {
        name: "Live model",
        note: "the active inference provider composes the final answer",
      },
    ],
    returns:
      "A short, readable answer to the task, with a linked source beneath each claim it makes.",
    charging:
      `The seller lists this as "${listing.price}". Only the engine's x402 layer ever moves money, ` +
      "and only up to the cap you set -- the label is a metering estimate, not a charge.",
  };
}
