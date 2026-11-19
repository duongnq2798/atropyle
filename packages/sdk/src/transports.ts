import { fallback, http, type Transport } from 'viem';

/** JSON-RPC batching, retries with backoff (viem retries 429 and 5xx), bounded timeout. */
export function httpTransport(url: string): Transport {
  return http(url, { batch: { batchSize: 20, wait: 0 }, retryCount: 3, retryDelay: 400, timeout: 20_000 });
}

/**
 * Several URLs fall back in order. `retryCount: 0` on the fallback itself: each URL already retries on its own
 * (httpTransport keeps its own count whatever the fallback passes in), and the fallback's default of 3 more rounds
 * over the pool would multiply that into dozens of attempts and minutes on an RPC that hangs.
 */
export function readTransport(urls: string[]): Transport {
  return urls.length === 1 ? httpTransport(urls[0]) : fallback(urls.map(httpTransport), { retryCount: 0 });
}
