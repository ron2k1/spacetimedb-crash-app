import { z } from 'zod';

/** Capabilities an agent can require. A manifest references one of these, NOT a vendor. */
export const CapabilitySchema = z.enum([
  'chat',
  'image.generate',
  'tts.speak',
  'search',
  'video.generate',
  'x402', // commerce rail (special)
  'fs', // local filesystem (special, local-only)
]);
export type Capability = z.infer<typeof CapabilitySchema>;

export const ConnectorFamilySchema = z.enum([
  'openai-compatible',
  'anthropic',
  'image',
  'tts',
  'search',
  'video',
  'x402',
  'fs',
]);
export type ConnectorFamily = z.infer<typeof ConnectorFamilySchema>;

/** A vendor descriptor. ~10 lines per vendor -- config, not code. */
export const ConnectorDescriptorSchema = z.object({
  id: z.string(), // 'tavily' | 'openai' | 'higgsfield'
  family: ConnectorFamilySchema,
  baseUrl: z.string().url(),
  auth: z.object({
    scheme: z.enum(['bearer', 'header']),
    headerName: z.string().optional(), // required when scheme === 'header'
  }),
  capabilities: z.array(CapabilitySchema).nonempty(),
  models: z.array(z.string()).optional(),
});
export type ConnectorDescriptor = z.infer<typeof ConnectorDescriptorSchema>;
