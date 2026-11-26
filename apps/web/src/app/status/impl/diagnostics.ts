import { decodeError, type IntegrityReport, VERSION as SDK_VERSION, stringify, untrusted } from '@atropyle/sdk';
import { createPublicClient, http } from 'viem';
import type { Target } from '@/config/env';
import type { Lang } from '@/i18n/core';

export interface RpcProbe {
  url: string;
  ok: boolean;
  ms: number | null;
  block: bigint | null;
  /** Error code from the SDK decoder; null when the node answered. */
  error: string | null;
}

/** One eth_blockNumber per URL, with no retry, so a dead node shows up at once. */
export async function rpcBlockNumber(url: string): Promise<bigint> {
  const client = createPublicClient({ transport: http(url, { retryCount: 0, timeout: 5_000 }) });
  return client.getBlockNumber({ cacheTime: 0 });
}

export { rpcUrlsOf } from '../rpc-urls';

export async function probeRpc(
  url: string,
  blockNumber: (url: string) => Promise<bigint>,
  now: () => number = () => performance.now(),
): Promise<RpcProbe> {
  const start = now();
  try {
    const block = await blockNumber(url);
    return { url, ok: true, ms: Math.round(now() - start), block, error: null };
  } catch (e) {
    return { url, ok: false, ms: null, block: null, error: decodeError(e).code };
  }
}

export function probeAll(urls: readonly string[], blockNumber: (url: string) => Promise<bigint>): Promise<RpcProbe[]> {
  return Promise.all(urls.map((u) => probeRpc(u, blockNumber)));
}

/** Origin and path only: the hash can hold a payload to sign or an email token. */
export function pageUrl(href: string): string {
  const u = new URL(href);
  return `${u.origin}${u.pathname}`;
}

export interface DiagnosticsInput {
  appVersion: string;
  target: Target;
  href: string;
  chainId: number;
  integrity: IntegrityReport | null;
  integrityError: unknown;
  probes: readonly RpcProbe[] | null;
  /** Names announced by wallet extensions: untrusted text. */
  wallets: readonly string[];
  crossCheck: boolean;
  lang: Lang;
}

/** The text behind "Copy diagnostics". No wallet address and no URL hash; the user decides whether to share it. */
export function buildDiagnostics(i: DiagnosticsInput): string {
  const integrity = i.integrity
    ? {
        ok: i.integrity.ok,
        rpcs: i.integrity.rpcs,
        failed: i.integrity.checks.filter((c) => !c.ok).map((c) => c.name),
        warnings: i.integrity.warnings.map((w) => w.code),
      }
    : i.integrityError
      ? { error: decodeError(i.integrityError).code }
      : null;
  return stringify(
    {
      app: i.appVersion,
      sdk: SDK_VERSION,
      target: i.target,
      page: pageUrl(i.href),
      chainId: i.chainId,
      block: i.integrity?.blockNumber ?? null,
      rpcs: (i.probes ?? []).map((p) => ({ url: p.url, ok: p.ok, ms: p.ms, block: p.block, error: p.error })),
      integrity,
      wallets: i.wallets.map((w) => untrusted(w, 32).value),
      crossCheck: i.crossCheck,
      lang: i.lang,
    },
    2,
  );
}
