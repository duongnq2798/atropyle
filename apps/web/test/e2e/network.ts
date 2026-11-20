import type { Page } from '@playwright/test';
import { ONCHAIN_RPCS } from '../../src/lib/rpc.ts';

/** The only chain nodes the DeWEB gateway counts as on-chain. */
export const OKX_ORIGINS: readonly string[] = ONCHAIN_RPCS;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

export async function routeRpcToAnvil(page: Page, rpcUrl: string): Promise<void> {
  await page.route(
    (url) => OKX_ORIGINS.includes(url.origin),
    async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: req.postData() ?? '',
      });
      return route.fulfill({
        status: res.status,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: await res.text(),
      });
    },
  );
}

export function recordRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  return urls;
}

/** Requests the gateway would report: anything not on the site origin and not an OKX chain node. */
export function offchain(urls: readonly string[], siteOrigin: string): string[] {
  const out = urls.filter((u) => {
    if (/^(data|blob|about):/.test(u)) return false;
    const origin = new URL(u).origin;
    return origin !== siteOrigin && !OKX_ORIGINS.includes(origin);
  });
  return [...new Set(out)];
}
