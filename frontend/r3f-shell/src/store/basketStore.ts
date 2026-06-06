// basketStore.ts -- the "skills basket": a small client-only cart of marketplace listings the user
// quick-adds by clicking a card. It is deliberately SEPARATE from dashboardStore (the live skill
// shelf) and taskStore (engine run state). The basket is a STAGING area -- "capabilities I want
// Crash to use" -- that the user assembles by browsing the marketplace, before anything is wired to
// the engine. Nothing here spends money or calls a connector: adding to the basket is pure local UI
// intent, so it is honest by construction -- the real x402 metering still lives only in the engine.
//
// Persisted to localStorage (by id) so a demo reload keeps the basket, mirroring how custom
// subagents persist in dashboardStore. We store ONLY ids and re-hydrate against the canonical
// MARKET_LISTINGS, so a stored basket can never drift from the live listing data (price/blurb edits
// always win) and a listing removed from the catalog silently drops out of the basket.
import { create } from "zustand";
import { MARKET_LISTINGS, type MarketListing } from "../data/marketplace";

const STORAGE_KEY = "crash-basket";

interface BasketState {
  items: MarketListing[];
  /** Add if absent, remove if present. Returns the NEW membership (true = now in basket) so the
      caller can phrase the right confirmation line without re-reading the store. */
  toggle: (item: MarketListing) => boolean;
  remove: (id: string) => void;
  clear: () => void;
}

function load(): MarketListing[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(ids)) return [];
    return ids
      .map((id) => MARKET_LISTINGS.find((l) => l.id === id))
      .filter((l): l is MarketListing => Boolean(l));
  } catch {
    return [];
  }
}

function persist(items: MarketListing[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map((i) => i.id)));
}

export const useBasketStore = create<BasketState>((set, get) => ({
  items: load(),
  toggle: (item) => {
    const present = get().items.some((i) => i.id === item.id);
    const items = present
      ? get().items.filter((i) => i.id !== item.id)
      : [...get().items, item];
    persist(items);
    set({ items });
    return !present;
  },
  remove: (id) =>
    set((st) => {
      const items = st.items.filter((i) => i.id !== id);
      persist(items);
      return { items };
    }),
  clear: () => {
    persist([]);
    set({ items: [] });
  },
}));
