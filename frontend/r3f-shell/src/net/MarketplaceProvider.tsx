// MarketplaceProvider.tsx -- a single shared instance of the live marketplace connection.
//
// useMarketplace() owns a WebSocket + REST bootstrap + idempotent reducers. Originally the Marketplace
// component called it privately, which was fine while the storefront was ALWAYS mounted. The tabbed
// redesign makes the storefront and the dashboard tabs MUTUALLY EXCLUSIVE views: the Marketplace
// unmounts whenever a tab (e.g. My Agents) is showing. If each surface called useMarketplace() on its
// own, switching tabs would tear down and re-open the socket every time, and the My Agents Deploy/Sell
// actions could not reach the same createListing the storefront uses.
//
// So we hoist ONE useMarketplace() up to a provider mounted at the App root (above the home/tab switch)
// and hand it to both surfaces via context. The connection now lives for the whole authenticated
// session regardless of which view is on screen, and a listing created from My Agents appears on the
// storefront (and every other connected client) with no reconnect.

import { createContext, useContext, type ReactNode } from "react";
import { useMarketplace, type UseMarketplaceResult } from "./marketplaceClient";

const MarketplaceContext = createContext<UseMarketplaceResult | null>(null);

export function MarketplaceProvider({ children }: { children: ReactNode }) {
  const market = useMarketplace();
  return (
    <MarketplaceContext.Provider value={market}>
      {children}
    </MarketplaceContext.Provider>
  );
}

// Read the shared marketplace connection. Throws if used outside the provider -- that is a wiring bug,
// surfaced loudly rather than silently opening a second socket.
export function useMarketplaceContext(): UseMarketplaceResult {
  const ctx = useContext(MarketplaceContext);
  if (!ctx) {
    throw new Error("crash_marketplace_context_missing");
  }
  return ctx;
}
