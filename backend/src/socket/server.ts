// The transport: a WebSocket server bound to 127.0.0.1 with a per-session token.
// Loopback alone is necessary but not sufficient — the token stops any other local
// process from driving the agent (Spec 3.1). The token + port are written to
// Crash/.runtime/socket.json so the renderer can discover them.
import { WebSocketServer, WebSocket } from 'ws';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HelloSchema, PROTOCOL_VERSION } from '@crash/protocol';
import { Session } from './session.js';
import type { AgentProvider } from '../agent/provider.js';
import { ensureWorkspace, resolveWorkspace, type Workspace } from '../workspace/paths.js';
import { TAVILY_X402_URL, RESEARCH_AGENT_ID, RESEARCH_DEMO_CAP_MINOR } from './research.js';

export interface EngineServerOptions {
  provider: AgentProvider;
  workspace?: Workspace;
  host?: string;
  port?: number;
  token?: string;
  engineVersion?: string;
}

/** Starting wallet balance the badge displays, in USDC minor units. Defaults to the demo budget
 *  (1 USDC = 100 paid searches) so the chip reads "1.00 USDC" on connect and visibly ticks down
 *  0.01 per paid search. Override with CRASH_WALLET_BALANCE_MINOR; a malformed/negative value falls
 *  back to the default. This is DISPLAY-only -- the actual spend authority is the per-agent CapLedger
 *  and the funded x402.wallet key, never this number. */
function walletBalanceFromEnv(): number {
  const raw = process.env.CRASH_WALLET_BALANCE_MINOR;
  if (raw === undefined) return RESEARCH_DEMO_CAP_MINOR;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : RESEARCH_DEMO_CAP_MINOR;
}

export interface EngineServer {
  host: string;
  port: number;
  token: string;
  close(): Promise<void>;
}

export async function startEngineServer(opts: EngineServerOptions): Promise<EngineServer> {
  const host = opts.host ?? '127.0.0.1';
  const token = opts.token ?? crypto.randomBytes(24).toString('hex');
  const engineVersion = opts.engineVersion ?? '0.1.0';
  const workspace: Workspace = ensureWorkspace(opts.workspace ?? resolveWorkspace());

  const wss = new WebSocketServer({ host, port: opts.port ?? 0 });
  await new Promise<void>((resolve, reject) => {
    wss.once('listening', resolve);
    wss.once('error', reject);
  });
  const address = wss.address();
  const port = typeof address === 'object' && address ? address.port : (opts.port ?? 0);

  wss.on('connection', (ws: WebSocket) => {
    let session: Session | null = null;
    // A dropped/closed connection MUST abort any in-flight run; otherwise the headless
    // provider CLI keeps running with no consumer -- a per-disconnect process + memory leak.
    // Fires on tab close, page reload, and app quit. Idempotent on the Session side.
    const teardown = () => {
      session?.dispose();
      session = null;
    };
    ws.on('close', teardown);
    ws.on('error', teardown);
    ws.on('message', (data: unknown) => {
      const raw = String(data);
      if (!session) {
        let ok = false;
        try {
          const parsed = HelloSchema.safeParse(JSON.parse(raw));
          ok =
            parsed.success &&
            parsed.data.payload.token === token &&
            parsed.data.payload.protocolVersion === PROTOCOL_VERSION;
        } catch {
          ok = false;
        }
        if (!ok) {
          ws.close(1008, 'unauthorized');
          return;
        }
        const sessionId = `sess_${crypto.randomBytes(6).toString('hex')}`;
        session = new Session({
          sessionId,
          provider: opts.provider,
          workspace,
          engineVersion,
          send: (s) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(s);
          },
          // Seed an OPEN spend cap for research-agent. The CapLedger denies any agent with no
          // configured cap (caps.ts: cap===undefined -> false), which would short-circuit the paid
          // path to `payment_cap_exceeded` BEFORE the x402 required/signing beats ever fire. With a
          // budget seeded, the *missing wallet* becomes the fail-closed gate instead of the cap, so
          // the payment narrative is visible now and a funded x402.wallet later settles for real.
          caps: { [RESEARCH_AGENT_ID]: RESEARCH_DEMO_CAP_MINOR },
          // The wallet badge's starting balance (display-only). Seeded so the chip reads a real
          // figure on connect and ticks down 0.01 USDC per paid search instead of sitting at 0.
          walletBalanceMinor: walletBalanceFromEnv(),
          // The x402 fuse config seam: default to Tavily's first-party endpoint so the payment
          // beats fire even before a wallet is funded (the buyer fails closed at signing -> a
          // canned brief). Drop a funded x402.wallet keystore key and the SAME path settles for
          // real with zero code change. Env overrides are for pointing at a loopback seller in tests.
          tavilyX402Url: process.env.CRASH_TAVILY_X402_URL ?? TAVILY_X402_URL,
          sellerUrl: process.env.CRASH_X402_SELLER_URL,
        });
        session.ready();
        return;
      }
      void session.handleRaw(raw);
    });
  });

  try {
    fs.writeFileSync(
      path.join(workspace.runtimeDir, 'socket.json'),
      JSON.stringify({ host, port, token, protocolVersion: PROTOCOL_VERSION, provider: opts.provider.id }, null, 2),
      { mode: 0o600 }, // the token is a capability — keep it owner-readable only
    );
  } catch {
    /* non-fatal: renderer can also receive these on the boot line */
  }

  return {
    host,
    port,
    token,
    close: () => new Promise<void>((resolve) => wss.close(() => resolve())),
  };
}
