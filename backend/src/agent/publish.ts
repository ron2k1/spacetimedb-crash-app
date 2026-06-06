import type { CatalogListing } from '@crash/protocol';
import { saveAgent, type AgentManifest } from './agents.js';
import { toListing } from '../marketplace/listings.js';

/** "Deploy" = a local listing: persist the pack and return its Browse listing. */
export function publishAgent(root: string, manifest: AgentManifest, category: string): CatalogListing {
  const m: AgentManifest = { ...manifest, source: 'user' };
  saveAgent(root, m);
  return toListing(m, category);
}
