import { createAtropyle, readTransport } from '@atropyle/sdk';
import { createSdkChain } from '../chain/sdk';
import { systemClock } from '../clock';
import { type Config, ConfigError, type Env, loadConfig } from '../config';
import { connectPostgres, type PgFactory } from '../db/postgres';
import type { Deps } from '../deps';
import { type Handler, problem } from '../http';
import { keeperSignerFromEnv } from '../keeper/signer';
import { errorText, jsonLog, type Log } from '../log';
import { disabledMailer, resendMailer } from '../mail/mailer';

export interface BuildOptions {
  /** postgres.js in production (the default); tests pass a stand-in. */
  pg?: PgFactory;
  log?: Log;
}

/**
 * Production wiring of the five ports from the function secrets (apps/backend/README.md). It opens no connection
 * and makes no request: postgres.js connects on the first query, viem on the first call.
 *
 * - Database: SUPABASE_DB_URL (a Supabase default secret) through postgres.js.
 * - Chain: the X Layer deployment bundled in the SDK, read over RPC_URLS when set, else the deployment's own URLs.
 * - Keeper: the keeper secret, read only by keeperSignerFromEnv. Without it the keeper runs dry.
 * - Mail: Resend when RESEND_API_KEY is set; otherwise every delivery fails and stays unsent until it is.
 */
export function buildDeps(env: Env, o: BuildOptions = {}): Deps {
  const problems: string[] = [];
  let config: Config | null = null;
  try {
    config = loadConfig(env);
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    problems.push(...e.problems);
  }
  const dbUrl = env('SUPABASE_DB_URL')?.trim() ?? '';
  if (dbUrl === '') problems.push('SUPABASE_DB_URL is not set');
  if (config === null || problems.length > 0) throw new ConfigError(problems);

  const atro = createAtropyle({
    chain: 'xlayer',
    transport: config.rpcUrls === null ? undefined : readTransport(config.rpcUrls),
  });
  const signer = keeperSignerFromEnv(env, atro.chain, readTransport(config.rpcUrls ?? atro.deployment.rpcUrls));
  let sql: Deps['sql'];
  try {
    sql = connectPostgres(dbUrl, o.pg);
  } catch {
    // The client's own error can quote the URL, which holds the database password: never pass it on.
    throw new ConfigError(['SUPABASE_DB_URL is not a valid database URL']);
  }
  return {
    sql,
    chain: createSdkChain(atro, { wallet: signer.wallet }),
    mailer: config.resendApiKey === null ? disabledMailer() : resendMailer({ apiKey: config.resendApiKey }),
    clock: systemClock,
    log: o.log ?? jsonLog(),
    config,
    random: (size) => crypto.getRandomValues(new Uint8Array(size)),
    keeperError: signer.error,
  };
}

/**
 * Builds the Deps on the first request of an isolate and keeps them for the next ones. While a secret is missing
 * or invalid, every request answers 500 INTERNAL and logs which secret is wrong (ConfigError names variables, never
 * values). The build is retried on the next request, so the function recovers once the secret is set.
 */
export function lazyHandler(
  handler: Handler<Deps>,
  env: Env,
  build: (env: Env) => Deps = buildDeps,
  log: Log = jsonLog(),
): (req: Request) => Promise<Response> {
  let deps: Deps | null = null;
  return async (req) => {
    if (deps === null) {
      try {
        deps = build(env);
      } catch (e) {
        // Only a ConfigError is safe to log: it names variables, never values. Any other error may quote a secret.
        if (e instanceof ConfigError) log.error('backend not configured', { error: errorText(e) });
        else log.error('backend could not be built', { error: e instanceof Error ? e.name : 'Error' });
        return problem(500, 'INTERNAL', 'The service is not configured yet.');
      }
    }
    return handler(req, deps);
  };
}

/** The whole body of every entry file: serve one handler with Deno.serve (Supabase Edge Runtime). */
export function serve(handler: Handler<Deps>): void {
  Deno.serve(lazyHandler(handler, (name) => Deno.env.get(name)));
}
