import type { ChainName } from '@atropyle/sdk';
import { type Target, targetOf, workerOrigin } from '../build/csp';

export type { Target } from '../build/csp';

export interface RawEnv {
  VITE_TARGET?: string;
  VITE_CHAIN?: string;
  VITE_DEPLOYMENT?: string;
  VITE_WORKER_URL?: string;
  VITE_TELEGRAM_BOT?: string;
  VITE_DOCS_PATH?: string;
}

export interface AppEnv {
  target: Target;
  chain: ChainName;
  deploymentJson: string | null;
  workerUrl: string | null;
  telegramBot: string | null;
  docsPath: string | null;
  version: string;
}

/** The Worker URL the CSP allows (https, Pages build only), kept with its path but without a trailing slash. */
function workerUrlOf(target: Target, raw: string): string | null {
  const origin = workerOrigin(target, raw);
  if (origin === null) return null;
  const u = new URL(raw);
  if (u.username || u.password || raw.includes('?') || raw.includes('#')) return null;
  return `${origin}${u.pathname}`.replace(/\/+$/, '');
}

export function readEnv(raw: RawEnv, version = '0.0.0'): AppEnv {
  const target = targetOf(raw.VITE_TARGET);
  const bot = raw.VITE_TELEGRAM_BOT?.trim() ?? '';
  const deployment = raw.VITE_DEPLOYMENT?.trim() ?? '';
  return {
    target,
    chain: raw.VITE_CHAIN === 'local' ? 'local' : 'xlayer',
    deploymentJson: deployment || null,
    workerUrl: workerUrlOf(target, raw.VITE_WORKER_URL?.trim() ?? ''),
    telegramBot: /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(bot) ? bot : null,
    docsPath: raw.VITE_DOCS_PATH === './docs/' ? './docs/' : null,
    version,
  };
}

// Each key is read on its own: using the whole `import.meta.env` object would inline every VITE_ variable.
export const ENV: AppEnv = readEnv(
  {
    VITE_TARGET: import.meta.env.VITE_TARGET,
    VITE_CHAIN: import.meta.env.VITE_CHAIN,
    VITE_DEPLOYMENT: import.meta.env.VITE_DEPLOYMENT,
    VITE_WORKER_URL: import.meta.env.VITE_WORKER_URL,
    VITE_TELEGRAM_BOT: import.meta.env.VITE_TELEGRAM_BOT,
    VITE_DOCS_PATH: import.meta.env.VITE_DOCS_PATH,
  },
  __APP_VERSION__,
);
