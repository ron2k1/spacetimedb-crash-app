import type { CatalogListing } from '@crash/protocol';
import { accessesSummary, type AgentManifest } from '../agent/agents.js';

/** Project an agent manifest into the wire-shape catalog listing shown in Browse. */
export function toListing(m: AgentManifest, category: string): CatalogListing {
  return {
    id: m.id,
    name: m.name,
    description: m.goal,
    category,
    accesses: accessesSummary(m),
    source: m.source,
    price: m.price,
  };
}
