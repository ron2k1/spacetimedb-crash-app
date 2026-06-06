// CANONICAL Crash socket contract — single source of truth.
// Unity consumes a HAND-MIRRORED copy at protocol/Protocol.cs (kept in sync by the
// drift-guard test in protocol/test/contract.test.ts).
//
// SECURITY: `error` events carry a synthetic CODE only — never a message, stack,
// prompt, environment value, response body, or credential. Do NOT add a free-text
// field to ErrorSchema. (Spec Section: sidecar error events emit err.code only.)
//
// PROVIDER (DISPLAY ONLY): the `hello` / `session.ready` handshake carries a `provider`
// field ('claude-code' | 'codex') so the renderer can show which backend is live. The
// renderer must NEVER branch behavior on it; the protocol is otherwise provider-agnostic
// and never forks per provider, exactly as it never forks per vertical. Provider
// differences are absorbed entirely inside the engine. (Spec 3.1 / 3.2.)
//
// Transport (WebSocket on 127.0.0.1 + per-session token) is a runtime concern owned by
// the engine (Plan 2). This file defines message *shapes* and the handshake fields only.

import { z } from 'zod';

/** Bump on any backward-incompatible payload change. Mirrored in Protocol.cs (Version). */
export const PROTOCOL_VERSION = 3;

// ---- shared sub-schemas ----
export const PlanStepSchema = z.object({
  id: z.string(),
  label: z.string(),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const CitationSchema = z.object({
  source: z.string(), // human-facing label (e.g. a filename) — NOT an absolute path
  snippet: z.string(), // the small relevant passage shown to the user
});
export type Citation = z.infer<typeof CitationSchema>;

export const RunStateSchema = z.enum([
  'idle',
  'planning',
  'indexing',
  'running',
  'awaiting_confirm',
  'done',
  'error',
]);
export type RunState = z.infer<typeof RunStateSchema>;

/** Which BYO backend is live. DISPLAY ONLY — see the PROVIDER note above. */
export const ProviderSchema = z.enum(['claude-code', 'codex']);
export type Provider = z.infer<typeof ProviderSchema>;

/** Per-provider auth snapshot. Booleans only — derived from CLI exit codes / file EXISTENCE, never file contents. */
export const ProviderAuthSchema = z.object({
  id: ProviderSchema,
  installed: z.boolean(), // CLI present + launchable (`<cmd> --version` exits 0)
  authenticated: z.boolean(), // signed in — exit-code or file-EXISTENCE derived; never reads credential contents
});
export type ProviderAuth = z.infer<typeof ProviderAuthSchema>;

export const ProviderSessionStateSchema = z.enum(['starting', 'running', 'ready', 'done', 'error']);
export type ProviderSessionState = z.infer<typeof ProviderSessionStateSchema>;

/** Filesystem op the engine performed inside the workspace (file.activity). */
export const FileOpSchema = z.enum(['create', 'write', 'delete', 'mkdir']);
export type FileOp = z.infer<typeof FileOpSchema>;

/** One node in the initial folder.snapshot tree. */
export const FolderEntrySchema = z.object({
  path: z.string(), // workspace-relative, POSIX separators, never absolute
  kind: z.enum(['file', 'dir']),
  bytes: z.number().int().nonnegative().optional(),
});
export type FolderEntry = z.infer<typeof FolderEntrySchema>;

/** Which marketplace catalog an item comes from. */
export const MarketplaceKindSchema = z.enum(['skill', 'plugin', 'agent']);
export type MarketplaceKind = z.infer<typeof MarketplaceKindSchema>;

/** A marketplace listing as shown in the Browse grid. Access-forward: `accesses` is a
 *  list of human-facing chips (capabilities + permission scope) derived from the manifest,
 *  shown BEFORE install. Never carries a key, URL, or secret. */
export const CatalogListingSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  accesses: z.array(z.string()), // e.g. ['Web search', 'Write to: Documents/Research']
  source: z.enum(['builtin', 'user', 'installed']),
  price: z
    .object({
      amountMinor: z.number().int().nonnegative(),
      asset: z.literal('USDC'),
      payTo: z.string(),
    })
    .optional(), // absent = free
});
export type CatalogListing = z.infer<typeof CatalogListingSchema>;

/** One per-agent spend cap row for wallet.status display. Minor units (USDC has 6 decimals). */
export const WalletCapSchema = z.object({
  agentId: z.string(),
  capMinor: z.number().int().nonnegative(),
  spentMinor: z.number().int().nonnegative(),
});
export type WalletCap = z.infer<typeof WalletCapSchema>;

// ---- envelope ----
// Every message is { v, type, sessionId, seq, payload }. `type` is the discriminant.
// `sessionId` is "" only for the pre-session `hello`; the engine assigns the real id in
// `session.ready`, and all later messages carry it.
function envelope<T extends string, P extends z.ZodTypeAny>(type: T, payload: P) {
  return z.object({
    v: z.literal(PROTOCOL_VERSION),
    type: z.literal(type),
    sessionId: z.string(),
    seq: z.number().int().nonnegative(),
    payload,
  });
}

// ---- Renderer -> Engine ----
export const HelloSchema = envelope(
  'hello',
  z.object({
    token: z.string(), // per-session localhost token
    protocolVersion: z.number().int(),
    renderer: z.string(), // 'unity' | 'r3f' (free string; engine validates)
    provider: ProviderSchema, // backend the renderer is branded for; engine confirms in session.ready
  }),
);
export const RequestSubmitSchema = envelope(
  'request.submit',
  z.object({
    requestId: z.string(),
    text: z.string(), // what the user asked -- generic, blind to input type
    targetPath: z.string().optional(), // optional pointer to a file/folder in the workspace
    agentId: z.string().optional(), // run a specific marketplace agent; absent = default flow
  }),
);
export const PlanConfirmSchema = envelope('plan.confirm', z.object({ planId: z.string() }));
export const PlanCancelSchema = envelope('plan.cancel', z.object({ planId: z.string() }));
export const ConfirmResponseSchema = envelope(
  'confirm.response',
  z.object({ confirmId: z.string(), approved: z.boolean() }),
);
export const SkillSaveAcceptSchema = envelope(
  'skill.save.accept',
  z.object({ requestId: z.string(), name: z.string() }),
);
export const RunCancelSchema = envelope('run.cancel', z.object({ requestId: z.string() }));
export const MarketplaceInstallSchema = envelope(
  'marketplace.install',
  z.object({
    installId: z.string(),
    kind: MarketplaceKindSchema,
    itemId: z.string(), // catalog item id (a slug); engine resolves it to a bundled folder
  }),
);

export const MarketplacePurchaseSchema = envelope(
  'marketplace.purchase',
  z.object({ listingId: z.string() }),
);
export const PermissionGrantSchema = envelope(
  'permission.grant',
  // absolute path the user picked in a native dialog; the engine canonicalizes (realpath)
  // and records it in grants.json. NOT a secret.
  z.object({ folder: z.string() }),
);

// ---- Renderer -> Engine (auth) ----
export const AuthStatusQuerySchema = envelope('auth.status.query', z.object({}));
export const AuthLoginStartSchema = envelope(
  'auth.login.start',
  z.object({ provider: ProviderSchema }),
);

// ---- Engine -> Renderer ----
export const SessionReadySchema = envelope(
  'session.ready',
  z.object({
    sessionId: z.string(),
    protocolVersion: z.number().int(),
    engineVersion: z.string(),
    provider: ProviderSchema, // authoritative: which backend the engine authenticated
  }),
);
export const PlanProposedSchema = envelope(
  'plan.proposed',
  z.object({
    requestId: z.string(),
    planId: z.string(),
    title: z.string(),
    summary: z.string(),
    steps: z.array(PlanStepSchema),
  }),
);
export const StatusSchema = envelope(
  'status',
  z.object({
    requestId: z.string(),
    state: RunStateSchema,
    detail: z.string().optional(), // short non-sensitive label
  }),
);
export const IndexProgressSchema = envelope(
  'index.progress',
  z.object({
    requestId: z.string(),
    processed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
);
export const StepStartedSchema = envelope(
  'step.started',
  z.object({ planId: z.string(), stepId: z.string(), label: z.string() }),
);
export const StepProgressSchema = envelope(
  'step.progress',
  z.object({ planId: z.string(), stepId: z.string(), fraction: z.number().min(0).max(1) }),
);
export const ConfirmRequiredSchema = envelope(
  'confirm.required',
  z.object({
    confirmId: z.string(),
    planId: z.string(),
    action: z.string(), // short human label, e.g. 'write file'
    detail: z.string(), // short human label, e.g. 'summary.md in your workspace'
  }),
);
export const AnswerPartialSchema = envelope(
  'answer.partial',
  z.object({ requestId: z.string(), textDelta: z.string() }),
);
export const ResultFinalSchema = envelope(
  'result.final',
  z.object({
    requestId: z.string(),
    answer: z.string(),
    citations: z.array(CitationSchema).optional(),
  }),
);
export const SkillSaveOfferSchema = envelope(
  'skill.save.offer',
  z.object({ requestId: z.string(), suggestedName: z.string(), description: z.string() }),
);
export const SkillSavedSchema = envelope(
  'skill.saved',
  z.object({ skillId: z.string(), name: z.string(), path: z.string() }),
);
export const FileActivitySchema = envelope(
  'file.activity',
  z.object({
    op: FileOpSchema,
    path: z.string(), // workspace-relative, POSIX, never absolute (no home-dir leak)
    bytes: z.number().int().nonnegative().optional(),
    seq: z.number().int().nonnegative(), // per-activity ordinal (distinct from envelope seq)
  }),
);
export const TerminalOutputSchema = envelope(
  'terminal.output',
  z.object({
    requestId: z.string(),
    stream: z.enum(['stdout', 'stderr']),
    // ONE raw line of CLI output, forwarded verbatim for the read-only Technical mirror.
    // RENDERER-ONLY + EPHEMERAL: by design this can carry file contents / CLI internals —
    // it must NEVER be written to a log, chat, or any persisted artifact.
    line: z.string(),
    seq: z.number().int().nonnegative(), // per-request line ordinal (distinct from envelope seq)
  }),
);
export const ProviderSessionSchema = envelope(
  'provider.session',
  z.object({
    requestId: z.string(),
    provider: ProviderSchema,
    state: ProviderSessionStateSchema,
    detail: z.string().optional(), // short non-sensitive lifecycle label; never a session id
  }),
);
export const FolderSnapshotSchema = envelope(
  'folder.snapshot',
  z.object({ entries: z.array(FolderEntrySchema) }),
);
export const MarketplaceInstalledSchema = envelope(
  'marketplace.installed',
  z.object({
    installId: z.string(),
    kind: MarketplaceKindSchema,
    itemId: z.string(),
    path: z.string(), // workspace-relative dir the item was copied to
  }),
);
export const MarketplaceCatalogSchema = envelope(
  'marketplace.catalog',
  z.object({ listings: z.array(CatalogListingSchema) }),
);
export const ToolActivitySchema = envelope(
  'tool.activity',
  z.object({
    agentId: z.string(),
    tool: z.string(), // capability label, e.g. 'search' | 'video.generate' -- NEVER a URL or key
    phase: z.enum(['start', 'ok', 'error']),
    code: z.string().optional(), // SYNTHETIC code only on error; never a message/body
  }),
);
export const PaymentActivitySchema = envelope(
  'payment.activity',
  z.object({
    agentId: z.string(),
    phase: z.enum(['required', 'signing', 'settled']),
    amount: z.string(), // human display string, e.g. '0.01' -- formatted engine-side
    asset: z.literal('USDC'),
    network: z.string(), // CAIP-2 chain id: 'eip155:8453' (Base mainnet, Tavily x402) or 'eip155:84532' (Base Sepolia, demo seller)
    payTo: z.string().optional(),
    txRef: z.string().optional(), // on-chain settlement reference for display (e.g. the x-payment-response)
  }),
);
export const WalletStatusSchema = envelope(
  'wallet.status',
  z.object({
    balanceMinor: z.number().int().nonnegative(),
    caps: z.array(WalletCapSchema),
  }),
);
export const ErrorSchema = envelope(
  'error',
  z.object({
    requestId: z.string().optional(),
    code: z.string(), // SYNTHETIC code only — never a message/stack/prompt/credential
    retryable: z.boolean(),
  }),
);

// ---- Engine -> Renderer (auth) ----
export const AuthStatusSchema = envelope(
  'auth.status',
  z.object({
    providers: z.array(ProviderAuthSchema), // one entry per known provider (claude-code, codex)
    active: ProviderSchema.nullable(), // provider the engine resolved for this session (display only)
  }),
);
export const AuthLoginResultSchema = envelope(
  'auth.login.result',
  z.object({
    provider: ProviderSchema,
    launched: z.boolean(), // true = the interactive login terminal was spawned (NOT that auth succeeded)
    code: z.string().optional(), // SYNTHETIC code only on launch failure; never a message/stack
  }),
);

// ---- unions ----
export const RendererToEngineSchema = z.discriminatedUnion('type', [
  HelloSchema,
  RequestSubmitSchema,
  PlanConfirmSchema,
  PlanCancelSchema,
  ConfirmResponseSchema,
  SkillSaveAcceptSchema,
  RunCancelSchema,
  MarketplaceInstallSchema,
  MarketplacePurchaseSchema,
  PermissionGrantSchema,
  AuthStatusQuerySchema,
  AuthLoginStartSchema,
]);
export const EngineToRendererSchema = z.discriminatedUnion('type', [
  SessionReadySchema,
  PlanProposedSchema,
  StatusSchema,
  IndexProgressSchema,
  StepStartedSchema,
  StepProgressSchema,
  ConfirmRequiredSchema,
  AnswerPartialSchema,
  ResultFinalSchema,
  SkillSaveOfferSchema,
  SkillSavedSchema,
  FileActivitySchema,
  TerminalOutputSchema,
  ProviderSessionSchema,
  FolderSnapshotSchema,
  MarketplaceInstalledSchema,
  MarketplaceCatalogSchema,
  ToolActivitySchema,
  PaymentActivitySchema,
  WalletStatusSchema,
  ErrorSchema,
  AuthStatusSchema,
  AuthLoginResultSchema,
]);
export const ProtocolEventSchema = z.union([RendererToEngineSchema, EngineToRendererSchema]);

export type RendererToEngine = z.infer<typeof RendererToEngineSchema>;
export type EngineToRenderer = z.infer<typeof EngineToRendererSchema>;
export type ProtocolEvent = z.infer<typeof ProtocolEventSchema>;

// Canonical list of every event `type`. The drift-guard test asserts parity against
// protocol/examples and protocol/Protocol.cs.
export const ALL_EVENT_TYPES = [
  // Renderer -> Engine
  'hello',
  'request.submit',
  'plan.confirm',
  'plan.cancel',
  'confirm.response',
  'skill.save.accept',
  'run.cancel',
  'marketplace.install',
  'marketplace.purchase',
  'permission.grant',
  'auth.status.query',
  'auth.login.start',
  // Engine -> Renderer
  'session.ready',
  'plan.proposed',
  'status',
  'index.progress',
  'step.started',
  'step.progress',
  'confirm.required',
  'answer.partial',
  'result.final',
  'skill.save.offer',
  'skill.saved',
  'file.activity',
  'terminal.output',
  'provider.session',
  'folder.snapshot',
  'marketplace.installed',
  'marketplace.catalog',
  'tool.activity',
  'payment.activity',
  'wallet.status',
  'error',
  'auth.status',
  'auth.login.result',
] as const;
export type EventType = (typeof ALL_EVENT_TYPES)[number];

/** Construct a well-formed message envelope. Used by the engine, renderers, and tests. */
export function makeMessage<T extends EventType, P>(
  type: T,
  sessionId: string,
  seq: number,
  payload: P,
) {
  return { v: PROTOCOL_VERSION, type, sessionId, seq, payload } as const;
}
