import { AtropyleError } from '@atropyle/sdk';

const unavailable = () =>
  new AtropyleError('RPC_UNAVAILABLE', {
    message: 'The RPC did not answer eth_chainId.',
    hint: 'Check your connection, or use another RPC endpoint.',
  });

/**
 * An RPC option must serve the chain of the deployment, or every read would answer for the wrong chain.
 * The URL and the name of the option are never put in an error: the URL can carry an API key, and the CLI
 * and the MCP bin call this for different options.
 */
export async function assertRpcChain(
  url: string,
  chainId: number,
  o: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<void> {
  const doFetch = o.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 10_000),
    });
  } catch {
    throw unavailable();
  }
  if (res.status === 429) {
    throw new AtropyleError('RPC_RATE_LIMITED', {
      message: 'The RPC is rate limiting requests.',
      hint: 'Wait a moment, or use another RPC endpoint.',
    });
  }
  let actual = Number.NaN;
  try {
    const body = (await res.json()) as { result?: unknown };
    if (res.ok && typeof body.result === 'string' && /^0x[0-9a-fA-F]+$/.test(body.result)) {
      actual = Number.parseInt(body.result, 16);
    }
  } catch {
    // handled below
  }
  if (!Number.isSafeInteger(actual)) throw unavailable();
  if (actual !== chainId) {
    throw new AtropyleError('WRONG_CHAIN', {
      message: `The RPC serves chain ${actual}, but this deployment is on chain ${chainId}.`,
      hint: 'Use an RPC of the same chain, or select the matching chain or deployment.',
      details: { expected: chainId, actual },
    });
  }
}
