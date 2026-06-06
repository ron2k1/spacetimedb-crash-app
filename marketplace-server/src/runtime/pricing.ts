// marketplace-server/src/runtime/pricing.ts
//
// Parse a listing's human-facing price display string into USDC minor units (6 decimals).
// Listing prices are free-form display strings ("~0.05 USDC / run", "0.10", "Pay-per-call",
// "Built-in", "Free") -- only some carry an actual number. When no parseable amount is present we
// default to RESEARCH_COST_MINOR so a run still charges a sensible micro-amount rather than 0.

import { RESEARCH_COST_MINOR } from "./tavily.js";

const USDC_DECIMALS = 6;

/**
 * Extract the first decimal number from `price` and convert to USDC minor units. Tolerant of
 * surrounding text, a leading "$", a "~" approximation marker, and trailing units ("/ run",
 * "USDC"). Returns RESEARCH_COST_MINOR when nothing numeric can be parsed.
 *
 * Examples: "$0.05" -> 50000, "0.05 USDC" -> 50000, "~0.12 USDC / run" -> 120000,
 *           "0.10" -> 100000, "Free" -> RESEARCH_COST_MINOR, "Pay-per-call" -> RESEARCH_COST_MINOR.
 */
export function priceToMinor(price: string): number {
  if (typeof price !== "string") return RESEARCH_COST_MINOR;
  // First run of digits with an optional decimal part. Ignores currency symbols and words.
  const match = price.match(/(\d+(?:\.\d+)?)/);
  if (!match) return RESEARCH_COST_MINOR;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return RESEARCH_COST_MINOR;
  // Round to the nearest minor unit; never emit a fractional minor unit.
  return Math.round(value * 10 ** USDC_DECIMALS);
}
