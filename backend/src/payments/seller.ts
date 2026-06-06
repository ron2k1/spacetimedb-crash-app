import express from 'express';
import { paymentMiddleware, x402ResourceServer } from '@x402/express';
// HTTPFacilitatorClient is a types-only re-export from @x402/express; its runtime
// home is @x402/core/server (a direct dependency of @crash/engine).
import { HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import type { AddressInfo } from 'node:net';

const BASE_SEPOLIA = 'eip155:84532' as const;

/** USDC has 6 decimals; render minor units as a dollar-denominated price string. */
function usdcPrice(priceMinor: number): string {
  return `$${(priceMinor / 1_000_000).toString()}`;
}

/**
 * A tiny local paid resource. Stands in for a premium API so the demo's x402 buy is
 * end-to-end without a third-party paid endpoint. Loopback-only.
 *
 * The resource server is configured with the Base Sepolia EVM exact scheme. We await
 * `server.initialize()` (which fetches the facilitator's supported kinds) BEFORE binding,
 * so the very first unpaid request deterministically returns a 402 challenge -- no signer
 * or wallet is needed to serve the 402. Because initialization is already complete, the
 * middleware's own start-sync is disabled (5th arg `false`) to avoid a redundant fetch.
 */
export async function startSeller(opts: {
  priceMinor: number;
  payTo: string;
  facilitatorUrl?: string;
}): Promise<{ port: number; close: () => Promise<void> }> {
  const app = express();

  const facilitator = new HTTPFacilitatorClient({
    url: opts.facilitatorUrl ?? 'https://x402.org/facilitator',
  });
  const server = new x402ResourceServer(facilitator).register(
    BASE_SEPOLIA,
    new ExactEvmScheme(),
  );
  await server.initialize();

  app.use(
    paymentMiddleware(
      {
        'GET /premium': {
          accepts: {
            scheme: 'exact',
            price: usdcPrice(opts.priceMinor),
            network: BASE_SEPOLIA,
            payTo: opts.payTo,
          },
          description: 'Premium result',
        },
      },
      server,
      undefined, // paywallConfig
      undefined, // paywall
      false, // syncFacilitatorOnStart -- already initialized above
    ),
  );
  app.get('/premium', (_req, res) => {
    res.json({ ok: true, data: 'premium result' });
  });

  return await new Promise((resolve) => {
    const httpServer = app.listen(0, '127.0.0.1', () => {
      const port = (httpServer.address() as AddressInfo).port;
      resolve({
        port,
        close: () => new Promise<void>((r) => httpServer.close(() => r())),
      });
    });
  });
}
