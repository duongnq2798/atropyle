export type Target = 'deweb' | 'pages';

export function targetOf(raw: string | undefined): Target {
  return raw === 'deweb' ? 'deweb' : 'pages';
}

/** X Layer RPC origins the web may call: the two OKX nodes, plus dRPC for the opt-in cross-check. */
export const XLAYER_RPC_ORIGINS: readonly string[] = [
  'https://rpc.xlayer.tech',
  'https://xlayerrpc.okx.com',
  'https://xlayer.drpc.org',
];

/** `npm run devnet` (Plan 2) listens here. */
export const LOCAL_RPC_ORIGINS: readonly string[] = ['http://127.0.0.1:8545'];

export function rpcOrigins(chain: string | undefined, deploymentJson: string | undefined): string[] {
  if (deploymentJson?.trim()) {
    const d = JSON.parse(deploymentJson) as { rpcUrls?: unknown; quorumRpcUrls?: unknown };
    const groups = Array.isArray(d.quorumRpcUrls) ? (d.quorumRpcUrls as unknown[]).flat() : [];
    const urls = [...(Array.isArray(d.rpcUrls) ? d.rpcUrls : []), ...groups];
    return [...new Set(urls.filter((u): u is string => typeof u === 'string').map((u) => new URL(u).origin))];
  }
  return chain === 'local' ? [...LOCAL_RPC_ORIGINS] : [...XLAYER_RPC_ORIGINS];
}

export function workerOrigin(target: Target, url: string | undefined): string | null {
  if (target !== 'pages' || !url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** No 'unsafe-inline': the UI has no inline script and no style attribute (test/unit/no-html-sinks.test.ts). */
export function buildCsp(o: { rpcOrigins: readonly string[]; workerOrigin: string | null }): string {
  const connect = ["'self'", ...o.rpcOrigins, ...(o.workerOrigin ? [o.workerOrigin] : [])];
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
