import type { ChainName } from '@atropyle/sdk';

export type Target = 'vercel' | 'deweb';

export interface RawEnv {
  NEXT_PUBLIC_TARGET?: string;
  NEXT_PUBLIC_CHAIN?: string;
  NEXT_PUBLIC_DEPLOYMENT?: string;
  NEXT_PUBLIC_API_URL?: string;
  NEXT_PUBLIC_DOCS_PATH?: string;
  NEXT_PUBLIC_APP_VERSION?: string;
}

export interface AppEnv {
  target: Target;
  chain: ChainName;
  /** Deployment JSON for e2e and local builds; null reads the SDK's built-in deployment of `chain`. */
  deploymentJson: string | null;
  /** Supabase Functions base URL; only the vercel build has one (spec §9.6). */
  apiUrl: string | null;
  /** Set by the site build when the site carries its own docs. */
  docsPath: '/docs/' | null;
  version: string;
}

/** The SDK deployment of X Layer uses this explorer; test/unit/env.test.ts keeps the two equal. */
export const XLAYER_EXPLORER = 'https://www.oklink.com/xlayer';

export function targetOf(raw: string | undefined): Target {
  const t = raw?.trim() ?? '';
  if (t === '' || t === 'deweb') return 'deweb';
  if (t === 'vercel') return 'vercel';
  throw new Error(`NEXT_PUBLIC_TARGET must be vercel or deweb, got "${t}"`);
}

export function chainNameOf(raw: string | undefined): ChainName {
  const c = raw?.trim() ?? '';
  if (c === '' || c === 'xlayer') return 'xlayer';
  if (c === 'local') return 'local';
  throw new Error(`NEXT_PUBLIC_CHAIN must be xlayer or local, got "${c}"`);
}

export function apiUrlOf(target: Target, raw: string | undefined): string | null {
  if (target !== 'vercel') return null;
  const s = raw?.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL is not a URL');
  }
  if (u.protocol !== 'https:') throw new Error('NEXT_PUBLIC_API_URL must use https');
  if (u.username || u.password) throw new Error('NEXT_PUBLIC_API_URL must not carry credentials');
  if (u.search || u.hash) throw new Error('NEXT_PUBLIC_API_URL must not carry a query or a fragment');
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

export function readEnv(raw: RawEnv): AppEnv {
  const target = targetOf(raw.NEXT_PUBLIC_TARGET);
  return {
    target,
    chain: chainNameOf(raw.NEXT_PUBLIC_CHAIN),
    deploymentJson: raw.NEXT_PUBLIC_DEPLOYMENT?.trim() ? raw.NEXT_PUBLIC_DEPLOYMENT : null,
    apiUrl: apiUrlOf(target, raw.NEXT_PUBLIC_API_URL),
    docsPath: raw.NEXT_PUBLIC_DOCS_PATH === '/docs/' ? '/docs/' : null,
    version: raw.NEXT_PUBLIC_APP_VERSION?.trim() || '0.0.0',
  };
}

function deploymentField(json: string | null, key: string): unknown {
  if (!json) return undefined;
  try {
    const d = JSON.parse(json) as Record<string, unknown>;
    return d && typeof d === 'object' ? d[key] : undefined;
  } catch {
    // The SDK reports an invalid deployment when it loads; the shell only needs a best guess.
    return undefined;
  }
}

export function chainIdOf(env: Pick<AppEnv, 'chain' | 'deploymentJson'>): number {
  const id = deploymentField(env.deploymentJson, 'chainId');
  if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) return id;
  return env.chain === 'local' ? 31337 : 196;
}

export function explorerUrlOf(env: Pick<AppEnv, 'chain' | 'deploymentJson'>): string | null {
  if (env.deploymentJson) {
    const url = deploymentField(env.deploymentJson, 'explorerUrl');
    return typeof url === 'string' && url.startsWith('https://') ? url : null;
  }
  return env.chain === 'xlayer' ? XLAYER_EXPLORER : null;
}

// Next inlines each `process.env.NEXT_PUBLIC_*` member at build time, so every one is read by its full name.
export const ENV: AppEnv = readEnv({
  NEXT_PUBLIC_TARGET: process.env.NEXT_PUBLIC_TARGET,
  NEXT_PUBLIC_CHAIN: process.env.NEXT_PUBLIC_CHAIN,
  NEXT_PUBLIC_DEPLOYMENT: process.env.NEXT_PUBLIC_DEPLOYMENT,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_DOCS_PATH: process.env.NEXT_PUBLIC_DOCS_PATH,
  NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
});

/** A literal comparison the minifier folds, so vercel-only code is dropped from the deweb bundle. */
export const IS_VERCEL: boolean = process.env.NEXT_PUBLIC_TARGET === 'vercel';
