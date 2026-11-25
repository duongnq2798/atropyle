/**
 * The environment every `next build` and `next dev` runs with (Quyết định 5, 30 and spec §2).
 *
 * Typed as a plain record: once Next's global types load (`next-env.d.ts`, or any import of `next`), they make
 * `ProcessEnv.NODE_ENV` required and read-only, and this function builds an environment without it.
 */
export function buildEnvFor(base: Readonly<Record<string, string | undefined>>): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...base, NEXT_TELEMETRY_DISABLED: '1' };
  const target = env.NEXT_PUBLIC_TARGET?.trim() || 'deweb';
  if (target !== 'vercel' && target !== 'deweb') {
    throw new Error(`NEXT_PUBLIC_TARGET must be vercel or deweb, got "${target}"`);
  }
  env.NEXT_PUBLIC_TARGET = target;
  // Never undefined: @next/env never lets a .env file set a variable that is already in the environment, even as ''
  // (processEnv checks `typeof initialEnv[key] === 'undefined'`). So every NEXT_PUBLIC_* build variable comes only
  // from the build environment, the one the page CSP reads (Task 15): a developer's .env.local cannot point a build
  // at the devnet while connect-src allows only X Layer, nor put the backend URL into deweb. src/config/env.ts reads
  // '' as the default (xlayer, no deployment, no docs path); next.config.mjs sets NEXT_PUBLIC_APP_VERSION itself.
  if (target === 'deweb' || env.NEXT_PUBLIC_API_URL === undefined) env.NEXT_PUBLIC_API_URL = '';
  for (const k of ['NEXT_PUBLIC_CHAIN', 'NEXT_PUBLIC_DEPLOYMENT', 'NEXT_PUBLIC_DOCS_PATH'] as const) env[k] ??= '';
  // Vitest sets NODE_ENV=test; Next picks production or development itself and warns on anything else.
  delete env.NODE_ENV;
  return env as NodeJS.ProcessEnv;
}
