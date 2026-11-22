export type Env = (name: string) => string | undefined;

export interface Config {
  /** Where the web app lives (no trailing slash). Every link in every email starts with it. */
  siteUrl: string;
  siteHost: string;
  /** Origins allowed to POST: the site's origin plus ALLOWED_ORIGINS. */
  allowedOrigins: string[];
  /** https://<project-ref>.supabase.co/functions/v1: the target of the List-Unsubscribe header. */
  apiUrl: string;
  /** "Atropyle <alerts@<domain>>" on a domain verified at Resend. */
  mailFrom: string;
  /** HMAC key for unsubscribe tokens and rate-limit keys. */
  tokenSecret: string;
  /** Shared with the pg_cron job through Vault; tick and integrity refuse calls without it. */
  cronSecret: string;
  opsEmail: string | null;
  /** Without it the mailer is off: sends fail and are retried once it is set. */
  resendApiKey: string | null;
  /** Override for the deployment's read RPCs. */
  rpcUrls: string[] | null;
  /** The indexer stays this many blocks behind the head (a lagging RPC node may not serve the newest logs). */
  headMargin: number;
  /** Whole tick budget in ms (spec §9.3: 50 s). */
  budgetMs: number;
  /** Blocks one tick indexes at most (spec §9.3: 2,000). */
  maxBlocksPerRun: number;
  /** Blocks per committed indexer step. */
  stepBlocks: number;
  /** Keeper transactions per tick at most (ecosystem spec §9.4: 20). */
  keeperMaxTx: number;
}

export const TICK_DEFAULTS = {
  budgetMs: 50_000,
  maxBlocksPerRun: 2_000,
  stepBlocks: 500,
  keeperMaxTx: 20,
  headMargin: 3,
} as const;

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`The backend is not configured: ${problems.join('; ')}.`);
    this.name = 'ConfigError';
  }
}

const noSlash = (s: string) => s.replace(/\/+$/, '');
const list = (s: string | undefined) =>
  (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');

/** Reads the function secrets (apps/backend/README.md). Problems name the variable, never its value. */
export function loadConfig(env: Env): Config {
  const problems: string[] = [];
  const get = (name: string): string | undefined => {
    const v = env(name)?.trim();
    return v === undefined || v === '' ? undefined : v;
  };
  const httpsUrl = (name: string, raw: string | undefined): URL | null => {
    if (raw === undefined) {
      problems.push(`${name} is not set`);
      return null;
    }
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:') return u;
      problems.push(`${name} must be an https URL`);
    } catch {
      problems.push(`${name} is not a URL`);
    }
    return null;
  };

  const site = httpsUrl('SITE_URL', get('SITE_URL'));
  const supabase = get('SUPABASE_URL');
  const api = httpsUrl('API_URL', get('API_URL') ?? (supabase ? `${noSlash(supabase)}/functions/v1` : undefined));
  const mailFrom = get('MAIL_FROM');
  if (mailFrom === undefined) problems.push('MAIL_FROM is not set');
  const tokenSecret = get('TOKEN_SECRET') ?? '';
  if (tokenSecret.length < 32) problems.push('TOKEN_SECRET must be at least 32 characters');
  const cronSecret = get('CRON_SECRET') ?? '';
  if (cronSecret.length < 32) problems.push('CRON_SECRET must be at least 32 characters');
  const extra = list(get('ALLOWED_ORIGINS'));
  for (const o of extra) {
    let isOrigin = false;
    try {
      isOrigin = new URL(o).origin === o;
    } catch {
      isOrigin = false;
    }
    if (!isOrigin) problems.push(`ALLOWED_ORIGINS entry ${o} is not an origin like https://example.com`);
  }
  const rpcUrls = list(get('RPC_URLS'));
  const marginRaw = get('HEAD_MARGIN');
  const headMargin = marginRaw === undefined ? TICK_DEFAULTS.headMargin : Number(marginRaw);
  if (!Number.isSafeInteger(headMargin) || headMargin < 0 || headMargin > 100) {
    problems.push('HEAD_MARGIN must be a whole number from 0 to 100');
  }
  if (problems.length > 0 || site === null || api === null || mailFrom === undefined) throw new ConfigError(problems);

  return {
    siteUrl: noSlash(site.href),
    siteHost: site.host,
    allowedOrigins: [site.origin, ...extra],
    apiUrl: noSlash(api.href),
    mailFrom,
    tokenSecret,
    cronSecret,
    opsEmail: get('OPS_EMAIL') ?? null,
    resendApiKey: get('RESEND_API_KEY') ?? null,
    rpcUrls: rpcUrls.length > 0 ? rpcUrls : null,
    headMargin,
    budgetMs: TICK_DEFAULTS.budgetMs,
    maxBlocksPerRun: TICK_DEFAULTS.maxBlocksPerRun,
    stepBlocks: TICK_DEFAULTS.stepBlocks,
    keeperMaxTx: TICK_DEFAULTS.keeperMaxTx,
  };
}
