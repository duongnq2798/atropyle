import { fallback, http, type Transport } from 'viem';

/** JSON-RPC batching, retries with backoff (viem retries 429 and 5xx), bounded timeout. */
export function httpTransport(url: string): Transport {
  return http(url, { batch: { batchSize: 20, wait: 0 }, retryCount: 3, retryDelay: 400, timeout: 20_000 });
}

export function readTransport(urls: string[]): Transport {
  return urls.length === 1 ? httpTransport(urls[0]) : fallback(urls.map(httpTransport));
}
