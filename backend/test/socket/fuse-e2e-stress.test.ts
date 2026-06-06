// End-to-end stress harness for the Tavily x402 fuse.
//
// Unlike research-wiring.test.ts (which constructs a Session directly and runs tier-3, offline),
// this boots the REAL WebSocket server via startEngineServer and drives it with a REAL ws client.
// That path runs server.ts's Session ctor -- so it proves the host-seeded research-agent cap is in
// effect. Without that seed the CapLedger denies research-agent and the x402 required/signing beats
// never fire; this test would then fail at the `requiredFired` assertion. It is the regression
// guard for that exact demo-killing bug.
//
// Determinism: the buyer's FIRST fetch (buyer.ts:58) hits the network BEFORE the wallet check
// (buyer.ts:64). Pointing CRASH_TAVILY_X402_URL at a loopback seller that always answers 402 makes
// the no-wallet path reproducible with zero real network -- the buyer throws wallet_not_configured
// the instant it sees the 402, so the seller is hit exactly once and no retry is signed.
import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startEngineServer, type EngineServer } from '../../src/socket/server.js';
import { DeterministicProvider } from '../../src/agent/deterministic.js';
import { resolveWorkspace } from '../../src/workspace/paths.js';
import { EngineToRendererSchema, PROTOCOL_VERSION } from '@crash/protocol';

const PV = PROTOCOL_VERSION;

// A loopback "x402 seller" that always answers 402. The body is a minimal challenge shell; the
// buyer never reads it on the no-wallet path (it throws before parsing), so its contents are inert.
function start402Seller(): Promise<{ url: string; close: () => Promise<void>; count: () => number }> {
  let count = 0;
  const server = http.createServer((_req, res) => {
    count += 1;
    res.statusCode = 402;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ x402Version: 1, error: 'payment required', accepts: [] }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}/search`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        count: () => count,
      });
    });
  });
}

async function open(url: string): Promise<WebSocket> {
  const ws = new WebSocket(url);
  await new Promise<void>((res, rej) => {
    ws.once('open', () => res());
    ws.once('error', rej);
  });
  return ws;
}

describe('tavily x402 fuse e2e (no wallet -> visible payment beats -> canned fallback)', () => {
  let srv: EngineServer | null = null;
  let seller: { url: string; close: () => Promise<void>; count: () => number } | null = null;
  const priorEndpoint = process.env.CRASH_TAVILY_X402_URL;
  const priorWallet = process.env.CRASH_X402_WALLET;

  afterEach(async () => {
    if (srv) await srv.close();
    if (seller) await seller.close();
    srv = null;
    seller = null;
    // Restore env so this file's overrides never leak into another test.
    if (priorEndpoint === undefined) delete process.env.CRASH_TAVILY_X402_URL;
    else process.env.CRASH_TAVILY_X402_URL = priorEndpoint;
    if (priorWallet === undefined) delete process.env.CRASH_X402_WALLET;
    else process.env.CRASH_X402_WALLET = priorWallet;
  });

  it('fires required+signing, fails closed at the 402, and returns a cited canned brief', async () => {
    seller = await start402Seller();
    // Route the buyer at the loopback seller; guarantee no funded wallet so it fails closed.
    process.env.CRASH_TAVILY_X402_URL = seller.url;
    delete process.env.CRASH_X402_WALLET;

    srv = await startEngineServer({
      provider: new DeterministicProvider('claude-code'),
      port: 0,
      token: 'stress',
      engineVersion: '0.1.0',
      // Temp workspace -> a clean keystore (no x402.wallet on disk) and no clobber of the real runtime dir.
      workspace: resolveWorkspace(path.join(os.tmpdir(), 'crash-fuse-e2e-stress')),
    });

    const url = `ws://${srv.host}:${srv.port}`;
    const frames: Array<{ type: string; payload: any }> = [];
    const ws = await open(url);
    await new Promise<void>((resolve, reject) => {
      const requestId = 'stress_r1';
      ws.send(
        JSON.stringify({
          v: PV,
          type: 'hello',
          sessionId: '',
          seq: 0,
          payload: { token: 'stress', protocolVersion: PV, renderer: 'r3f', provider: 'claude-code' },
        }),
      );
      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        // Every frame the engine emits must be a valid renderer frame (the egress filter guarantees it).
        expect(EngineToRendererSchema.safeParse(msg).success).toBe(true);
        frames.push({ type: msg.type, payload: msg.payload });
        if (msg.type === 'session.ready') {
          ws.send(
            JSON.stringify({
              v: PV,
              type: 'request.submit',
              sessionId: msg.sessionId,
              seq: 1,
              payload: { requestId, text: 'find the x402 spec', agentId: 'research-agent' },
            }),
          );
        } else if (msg.type === 'result.final' && msg.payload.requestId === requestId) {
          ws.close();
          resolve();
        } else if (msg.type === 'error') {
          reject(new Error(`engine error: ${msg.payload?.code ?? 'unknown'}`));
        }
      });
      setTimeout(() => reject(new Error('timeout; frames=' + frames.map((f) => f.type).join(','))), 10000);
    });

    const payments = frames.filter((f) => f.type === 'payment.activity');
    const tools = frames.filter((f) => f.type === 'tool.activity');

    // The cap is seeded -> the payment narrative is visible (this is the cap-seed regression guard).
    expect(payments.some((f) => f.payload.phase === 'required')).toBe(true);
    expect(payments.some((f) => f.payload.phase === 'signing')).toBe(true);
    // No wallet -> the buyer fails closed at the 402; the connector surfaces it as a tool error.
    expect(tools.some((f) => f.payload.phase === 'error' && f.payload.code === 'connector_payment_required')).toBe(true);
    // ...and the run still completes gracefully on the canned brief (search reads 'ok').
    expect(tools.some((f) => f.payload.phase === 'ok')).toBe(true);

    // SECURITY/correctness: a run that never paid must NEVER fabricate a settlement.
    expect(payments.some((f) => f.payload.phase === 'settled')).toBe(false);

    // The result is real and cited (the canned brief), not an error.
    const final = frames.find((f) => f.type === 'result.final');
    expect(final).toBeDefined();
    expect(typeof final!.payload.answer).toBe('string');
    expect(final!.payload.answer.length).toBeGreaterThan(0);
    expect(Array.isArray(final!.payload.citations)).toBe(true);
    expect(final!.payload.citations.length).toBeGreaterThan(0);

    // The buyer hit the seller exactly once (the first fetch); it threw before signing any retry.
    expect(seller.count()).toBe(1);
  });
});
