// marketplace-server/src/runtime/caps.ts
//
// Lifted from backend/src/payments/caps.ts. The WalletCap type is inlined locally (./tavily.js)
// rather than imported from @crash/protocol, per the brief.

import type { WalletCap } from "./tavily.js";

/** Per-agent spend caps in USDC minor units. Enforced BEFORE any transfer is signed. */
export class CapLedger {
  private spent: Record<string, number> = {};

  constructor(private readonly caps: Record<string, number>) {}

  /** True iff the agent has a configured cap AND charging `amountMinor` stays within it. */
  canSpend(agentId: string, amountMinor: number): boolean {
    const cap = this.caps[agentId];
    if (cap === undefined) return false; // no cap configured = no spending
    return (this.spent[agentId] ?? 0) + amountMinor <= cap;
  }

  /** Record a settled charge. Call ONLY after a successful settlement. */
  record(agentId: string, amountMinor: number): void {
    this.spent[agentId] = (this.spent[agentId] ?? 0) + amountMinor;
  }

  snapshot(): WalletCap[] {
    return Object.entries(this.caps).map(([agentId, capMinor]) => ({
      agentId,
      capMinor,
      spentMinor: this.spent[agentId] ?? 0,
    }));
  }
}
