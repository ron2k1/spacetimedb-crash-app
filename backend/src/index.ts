// Engine entry / library surface.
import { PROTOCOL_VERSION } from '@crash/protocol';

export const ENGINE_VERSION = '0.1.0';

/** The protocol version this engine build speaks (sourced from @crash/protocol). */
export const SPEAKS_PROTOCOL = PROTOCOL_VERSION;

// Public surface for embedders/tests.
export { startEngineServer } from './socket/server.js';
export type { EngineServer, EngineServerOptions } from './socket/server.js';
export { Session } from './socket/session.js';
export { Orchestrator } from './agent/orchestrator.js';
export { resolveProvider, makeProvider } from './agent/detect.js';
export { ClaudeCodeProvider } from './agent/claude-code.js';
export { CodexProvider } from './agent/codex.js';
export { DeterministicProvider } from './agent/deterministic.js';
export type { AgentProvider, AgentRunInput } from './agent/provider.js';
export { resolveWorkspace, ensureWorkspace } from './workspace/paths.js';
export { listSkills, saveSkill } from './skills/store.js';
export { retrieve } from './rag/retriever.js';
