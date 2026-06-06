// backend/src/payments/buyer.ts
//
// The x402 buyer: a fetch WRAPPER that pays an HTTP 402 challenge and retries. x402 is modeled
// as orthogonal to the wrapped request's own auth, so any connector (e.g. the Tavily search
// POST) can be paid for without changing its descriptor.
//
// SECURITY: the wallet private key is read fresh from walletKeyProvider() on each call (late
// binding -> build-now/fund-later), never stored, never logged, never returned. The buyer emits
// nothing; callers own all activity events. On failure it throws a SYNTHETIC code or returns
// ok:false -- it never fabricates a settled result and never invents a txRef.

import { x402Client, x402HTTPClient } from '@x402/core/client';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { privateKeyToAccount } from 'viem/accounts';

export interface PaidFetchResult {
  ok: boolean;
  status: number;
  headers: { get(k: string): string | null };
  json(): Promise<unknown>;
  txRef?: string; // from the 'x-payment-response' header when the seller settled
}

/** The slice of @x402/core/client's x402HTTPClient the buyer drives. Narrowed to an interface
 *  so tests inject a deterministic fake (no real chain, no real challenge). */
export interface X402HttpClientLike {
  getPaymentRequiredResponse(getHeader: (k: string) => string | null, body?: unknown): unknown;
  createPaymentPayload(paymentRequired: unknown): Promise<unknown>;
  encodePaymentSignatureHeader(payload: unknown): Record<string, string>;
}

export interface MakePaidFetchOpts {
  /** Late-bind keystore read at CALL time -> undefined means "fail closed at signing". */
  walletKeyProvider: () => string | undefined;
  /** Test seam: defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Test seam: defaults to the real @x402 exact-EVM client built from the wallet key. */
  httpClientFactory?: (walletKey: string) => X402HttpClientLike;
}

function defaultHttpClientFactory(walletKey: string): X402HttpClientLike {
  // A viem account IS the ClientEvmSigner the exact scheme needs. Omitting `networks` registers
  // the eip155:* wildcard (covers Base Sepolia eip155:84532). ERC-3009 TransferWithAuthorization
  // signing is a pure EIP-712 signature -> no RPC needed here; the seller+facilitator settle.
  const account = privateKeyToAccount(walletKey as `0x${string}`);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer: account });
  return new x402HTTPClient(client);
}

export function makePaidFetch(
  opts: MakePaidFetchOpts,
): (url: string, init?: RequestInit) => Promise<PaidFetchResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const makeClient = opts.httpClientFactory ?? defaultHttpClientFactory;

  return async (url: string, init?: RequestInit): Promise<PaidFetchResult> => {
    const first = await doFetch(url, init);
    if (first.status !== 402) {
      return { ok: first.ok, status: first.status, headers: first.headers, json: () => first.json() };
    }

    // A 402 means payment is required. Fail closed BEFORE any signing if no wallet.
    const walletKey = opts.walletKeyProvider();
    if (!walletKey) throw new Error('wallet_not_configured');

    // The initial response is discarded after we read its challenge; no clone() (fakes lack it).
    let body: unknown;
    try {
      body = await first.json();
    } catch {
      body = undefined;
    }

    const client = makeClient(walletKey);
    let paymentRequired: unknown;
    try {
      paymentRequired = client.getPaymentRequiredResponse((k) => first.headers.get(k), body);
    } catch {
      throw new Error('payment_required_malformed');
    }

    const payload = await client.createPaymentPayload(paymentRequired);
    const payHeader = client.encodePaymentSignatureHeader(payload);
    const mergedHeaders = { ...(init?.headers as Record<string, string> | undefined), ...payHeader };

    const retried = await doFetch(url, { ...init, headers: mergedHeaders });
    return {
      ok: retried.ok,
      status: retried.status,
      headers: retried.headers,
      json: () => retried.json(),
      txRef: retried.headers.get('x-payment-response') ?? undefined,
    };
  };
}
