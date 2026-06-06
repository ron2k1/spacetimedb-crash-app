import { PROTOCOL_VERSION, type EventType, type ProtocolEvent } from './events.js';

const v = PROTOCOL_VERSION;
const s = 'sess_demo';

// One valid example per event type. Doubles as documentation and as the drift-guard
// fixture (protocol/test/contract.test.ts validates each against ProtocolEventSchema).
export const EXAMPLES: Record<EventType, ProtocolEvent> = {
  // ---- Renderer -> Engine ----
  hello: { v, type: 'hello', sessionId: '', seq: 0, payload: { token: 'tok_demo', protocolVersion: v, renderer: 'unity', provider: 'claude-code' } },
  'request.submit': { v, type: 'request.submit', sessionId: s, seq: 1, payload: { requestId: 'req_1', text: 'Summarize this for me', targetPath: 'notes/towns.pdf' } },
  'plan.confirm': { v, type: 'plan.confirm', sessionId: s, seq: 2, payload: { planId: 'plan_1' } },
  'plan.cancel': { v, type: 'plan.cancel', sessionId: s, seq: 3, payload: { planId: 'plan_1' } },
  'confirm.response': { v, type: 'confirm.response', sessionId: s, seq: 4, payload: { confirmId: 'cf_1', approved: true } },
  'skill.save.accept': { v, type: 'skill.save.accept', sessionId: s, seq: 5, payload: { requestId: 'req_1', name: 'Summarize This' } },
  'run.cancel': { v, type: 'run.cancel', sessionId: s, seq: 6, payload: { requestId: 'req_1' } },
  'auth.status.query': { v, type: 'auth.status.query', sessionId: s, seq: 15, payload: {} },
  'auth.login.start': { v, type: 'auth.login.start', sessionId: s, seq: 16, payload: { provider: 'codex' } },
  'marketplace.purchase': { v, type: 'marketplace.purchase', sessionId: s, seq: 21, payload: { listingId: 'deep-research-pro' } },
  'permission.grant': { v, type: 'permission.grant', sessionId: s, seq: 22, payload: { folder: '/Users/demo/Crash/Research' } },
  // ---- Engine -> Renderer ----
  'session.ready': { v, type: 'session.ready', sessionId: s, seq: 0, payload: { sessionId: s, protocolVersion: v, engineVersion: '0.1.0', provider: 'claude-code' } },
  'plan.proposed': { v, type: 'plan.proposed', sessionId: s, seq: 1, payload: { requestId: 'req_1', planId: 'plan_1', title: 'Summarize your document', summary: 'I will read the file and write a short summary.', steps: [{ id: 'st_1', label: 'Read the document' }, { id: 'st_2', label: 'Write a summary' }] } },
  status: { v, type: 'status', sessionId: s, seq: 2, payload: { requestId: 'req_1', state: 'running', detail: 'reading' } },
  'index.progress': { v, type: 'index.progress', sessionId: s, seq: 3, payload: { requestId: 'req_1', processed: 3, total: 10 } },
  'step.started': { v, type: 'step.started', sessionId: s, seq: 4, payload: { planId: 'plan_1', stepId: 'st_1', label: 'Read the document' } },
  'step.progress': { v, type: 'step.progress', sessionId: s, seq: 5, payload: { planId: 'plan_1', stepId: 'st_1', fraction: 0.5 } },
  'confirm.required': { v, type: 'confirm.required', sessionId: s, seq: 6, payload: { confirmId: 'cf_1', planId: 'plan_1', action: 'write file', detail: 'summary.md in your workspace' } },
  'answer.partial': { v, type: 'answer.partial', sessionId: s, seq: 7, payload: { requestId: 'req_1', textDelta: 'Your document is about ' } },
  'result.final': { v, type: 'result.final', sessionId: s, seq: 8, payload: { requestId: 'req_1', answer: 'Your document is about three small towns.', citations: [{ source: 'towns.pdf', snippet: 'Three towns share a river.' }] } },
  'skill.save.offer': { v, type: 'skill.save.offer', sessionId: s, seq: 9, payload: { requestId: 'req_1', suggestedName: 'Summarize This', description: 'Reads a document and writes a short summary.' } },
  'skill.saved': { v, type: 'skill.saved', sessionId: s, seq: 10, payload: { skillId: 'sk_1', name: 'Summarize This', path: 'skills/summarize-this/SKILL.md' } },
  'marketplace.install': { v, type: 'marketplace.install', sessionId: s, seq: 12, payload: { installId: 'inst_1', kind: 'skill', itemId: 'meeting-notes' } },
  'file.activity': { v, type: 'file.activity', sessionId: s, seq: 13, payload: { op: 'create', path: 'skills/ask-my-stuff/SKILL.md', bytes: 412, seq: 0 } },
  'terminal.output': { v, type: 'terminal.output', sessionId: s, seq: 19, payload: { requestId: 'req_1', stream: 'stdout', line: 'Reading your document...', seq: 0 } },
  'provider.session': { v, type: 'provider.session', sessionId: s, seq: 20, payload: { requestId: 'req_1', provider: 'codex', state: 'running', detail: 'headless worker active' } },
  'folder.snapshot': { v, type: 'folder.snapshot', sessionId: s, seq: 0, payload: { entries: [{ path: 'skills', kind: 'dir' }, { path: 'docs', kind: 'dir' }, { path: 'plugins', kind: 'dir' }, { path: 'CLAUDE.md', kind: 'file', bytes: 120 }] } },
  'marketplace.installed': { v, type: 'marketplace.installed', sessionId: s, seq: 14, payload: { installId: 'inst_1', kind: 'skill', itemId: 'meeting-notes', path: 'skills/meeting-notes' } },
  'auth.status': { v, type: 'auth.status', sessionId: s, seq: 17, payload: { providers: [{ id: 'claude-code', installed: true, authenticated: true }, { id: 'codex', installed: true, authenticated: false }], active: 'claude-code' } },
  'auth.login.result': { v, type: 'auth.login.result', sessionId: s, seq: 18, payload: { provider: 'codex', launched: true } },
  'marketplace.catalog': { v, type: 'marketplace.catalog', sessionId: s, seq: 23, payload: { listings: [{ id: 'deep-research-pro', name: 'Deep Research Pro', description: 'Premium multi-source web research.', category: 'Research/web', accesses: ['Web search', 'Pays: 0.01 USDC'], source: 'builtin', price: { amountMinor: 10000, asset: 'USDC', payTo: '0x0000000000000000000000000000000000000000' } }] } },
  'tool.activity': { v, type: 'tool.activity', sessionId: s, seq: 24, payload: { agentId: 'research-agent', tool: 'search', phase: 'ok' } },
  'payment.activity': { v, type: 'payment.activity', sessionId: s, seq: 25, payload: { agentId: 'deep-research-pro', phase: 'settled', amount: '0.01', asset: 'USDC', network: 'eip155:84532', payTo: '0x0000000000000000000000000000000000000000', txRef: '0xtestref' } },
  'wallet.status': { v, type: 'wallet.status', sessionId: s, seq: 26, payload: { balanceMinor: 5000000, caps: [{ agentId: 'deep-research-pro', capMinor: 50000, spentMinor: 10000 }] } },
  error: { v, type: 'error', sessionId: s, seq: 11, payload: { requestId: 'req_1', code: 'index_unavailable', retryable: true } },
};
