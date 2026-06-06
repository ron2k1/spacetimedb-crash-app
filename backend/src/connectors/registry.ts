import type { Capability, ConnectorDescriptor } from './types.js';

/** Seed descriptors -- one line of intent per vendor. Extend freely; this is config, not code. */
export const BUILTIN_CONNECTORS: ConnectorDescriptor[] = [
  // chat (openai-compatible covers many vendors by base URL)
  { id: 'openai', family: 'openai-compatible', baseUrl: 'https://api.openai.com', auth: { scheme: 'bearer' }, capabilities: ['chat'] },
  { id: 'groq', family: 'openai-compatible', baseUrl: 'https://api.groq.com/openai', auth: { scheme: 'bearer' }, capabilities: ['chat'] },
  { id: 'openrouter', family: 'openai-compatible', baseUrl: 'https://openrouter.ai/api', auth: { scheme: 'bearer' }, capabilities: ['chat'] },
  { id: 'anthropic', family: 'anthropic', baseUrl: 'https://api.anthropic.com', auth: { scheme: 'header', headerName: 'x-api-key' }, capabilities: ['chat'] },
  // search
  { id: 'tavily', family: 'search', baseUrl: 'https://api.tavily.com', auth: { scheme: 'bearer' }, capabilities: ['search'] },
  { id: 'brave', family: 'search', baseUrl: 'https://api.search.brave.com', auth: { scheme: 'header', headerName: 'X-Subscription-Token' }, capabilities: ['search'] },
  // media (BYO-key capability families -- no hardcoded per-use price)
  { id: 'fal', family: 'image', baseUrl: 'https://fal.run', auth: { scheme: 'header', headerName: 'Authorization' }, capabilities: ['image.generate'] },
  { id: 'elevenlabs', family: 'tts', baseUrl: 'https://api.elevenlabs.io', auth: { scheme: 'header', headerName: 'xi-api-key' }, capabilities: ['tts.speak'] },
  { id: 'higgsfield', family: 'video', baseUrl: 'https://platform.higgsfield.ai', auth: { scheme: 'bearer' }, capabilities: ['video.generate'] },
];

/**
 * Capability-based resolution: return the first connector that (a) declares `cap`
 * AND (b) has a key (id present in `keyedConnectorIds`). Null if none -- the caller
 * then emits `connector_not_configured` and the UI prompts for a key.
 */
export function resolveCapability(
  cap: Capability,
  keyedConnectorIds: ReadonlySet<string>,
  connectors: ConnectorDescriptor[] = BUILTIN_CONNECTORS,
): ConnectorDescriptor | null {
  return connectors.find((c) => c.capabilities.includes(cap) && keyedConnectorIds.has(c.id)) ?? null;
}
