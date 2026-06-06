import type { CatalogListing } from '@crash/protocol';

// The all-zero address is a deliberate testnet placeholder payTo for the demo listing.
const PAYTO_DEMO = '0x0000000000000000000000000000000000000000';

/** The builtin agents shown in Browse before the engine loads any user-published agents.
 *  `deep-research-pro` is the priced demo listing (matches the protocol example exactly). */
export const BUILTIN_AGENT_CATALOG: CatalogListing[] = [
  {
    id: 'research-agent',
    name: 'Research Agent',
    description: 'Searches the web and summarizes what it finds.',
    category: 'Research/web',
    accesses: ['Web search'],
    source: 'builtin',
  },
  {
    id: 'deep-research-pro',
    name: 'Deep Research Pro',
    description: 'Premium multi-source web research.',
    category: 'Research/web',
    accesses: ['Web search', 'Pays: 0.01 USDC'],
    source: 'builtin',
    price: { amountMinor: 10000, asset: 'USDC', payTo: PAYTO_DEMO },
  },
  {
    id: 'file-janitor',
    name: 'File Janitor',
    description: 'Finds, renames, and organizes files in a folder you grant.',
    category: 'Files',
    accesses: ['Writes to a folder you grant'],
    source: 'builtin',
  },
  {
    id: 'gmail-triage',
    name: 'Gmail Triage',
    description: 'Sorts and summarizes your inbox.',
    category: 'Productivity',
    accesses: ['Gmail (when connected)'],
    source: 'builtin',
  },
  {
    id: 'video-studio',
    name: 'Video Studio',
    description: 'Turns a prompt into a short video clip.',
    category: 'Media',
    accesses: ['Video generation (when connected)'],
    source: 'builtin',
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Reviews a diff for bugs and risks.',
    category: 'Engineering',
    accesses: ['Reads files you grant'],
    source: 'builtin',
  },
];
