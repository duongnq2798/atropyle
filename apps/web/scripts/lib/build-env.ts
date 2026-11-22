/**
 * The environment every `next build` and `next dev` runs with (Quyết định 5 and spec §2).
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
  if (target === 'deweb') delete env.NEXT_PUBLIC_API_URL;
  // Vitest sets NODE_ENV=test; Next picks production or development itself and warns on anything else.
  delete env.NODE_ENV;
  return env as NodeJS.ProcessEnv;
}
