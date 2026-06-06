import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { CapabilitySchema, type Capability } from '../connectors/types.js';

export const AgentManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  systemPrompt: z.string(), // inline; persisted to systemPrompt.md in the pack
  requires: z.object({ capabilities: z.array(CapabilitySchema) }),
  permissions: z.object({ readBroad: z.boolean(), writeFolders: z.array(z.string()) }),
  price: z
    .object({ amountMinor: z.number().int().nonnegative(), asset: z.literal('USDC'), payTo: z.string() })
    .optional(),
  source: z.enum(['builtin', 'user', 'installed']),
  createdAt: z.string(),
});
export type AgentManifest = z.infer<typeof AgentManifestSchema>;

const CAPABILITY_LABEL: Record<Capability, string> = {
  chat: 'Chat (LLM)',
  'image.generate': 'Generate images',
  'tts.speak': 'Generate speech',
  search: 'Web search',
  'video.generate': 'Generate video',
  x402: 'Pay for premium data',
  fs: 'Read/write files',
};

/** Access-forward chips shown on a card BEFORE install -- the trust differentiator. */
export function accessesSummary(m: AgentManifest): string[] {
  const out = m.requires.capabilities.map((c) => CAPABILITY_LABEL[c]);
  if (m.permissions.readBroad) out.push('Reads your machine');
  for (const f of m.permissions.writeFolders) out.push(`Write to: ${f}`);
  if (m.price) out.push(`Costs: ${(m.price.amountMinor / 1_000_000).toString()} USDC`);
  return out;
}

export function saveAgent(root: string, m: AgentManifest): void {
  const dir = join(root, 'agents', m.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
  writeFileSync(join(dir, 'systemPrompt.md'), m.systemPrompt);
}

export function loadAgents(root: string): AgentManifest[] {
  const base = join(root, 'agents');
  if (!existsSync(base)) return [];
  const out: AgentManifest[] = [];
  for (const slug of readdirSync(base)) {
    const file = join(base, slug, 'manifest.json');
    if (!existsSync(file)) continue;
    const parsed = AgentManifestSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
