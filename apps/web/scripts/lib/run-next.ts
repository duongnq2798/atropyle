import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildEnvFor } from './build-env';
import { applyCsp } from './csp';

export const APP_DIR = fileURLToPath(new URL('../..', import.meta.url));
export const OUT_DIR = fileURLToPath(new URL('../../out', import.meta.url));
/** `next` has no exports map, so its bin resolves by path from the hoisted package. */
export const NEXT_BIN = createRequire(import.meta.url).resolve('next/dist/bin/next');
/**
 * Quyết định 3, settled by the spike of Plan 7A Task 2: [] keeps Turbopack. Set ['--webpack'] when
 * `npm run worker:check` or test/build/fonts.test.ts fails under Turbopack and passes under webpack.
 */
export const BUNDLER_FLAGS: readonly string[] = [];

export interface RunOptions {
  env?: NodeJS.ProcessEnv;
  args?: readonly string[];
  /** Capture output instead of printing it (tests). */
  quiet?: boolean;
}

export function runNext(command: 'build' | 'dev', o: RunOptions = {}): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [NEXT_BIN, command, ...BUNDLER_FLAGS, ...(o.args ?? [])], {
      cwd: APP_DIR,
      env: buildEnvFor(o.env ?? process.env),
      stdio: o.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    });
    let output = '';
    child.stdout?.on('data', (d: Buffer) => {
      output += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      output += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

/** `next build` into out/, then the postbuild step: a hashed CSP in every page (Quyết định 12). */
export async function buildApp(o: RunOptions = {}): Promise<{ code: number; output: string }> {
  const built = await runNext('build', o);
  if (built.code !== 0) return built;
  // The environment `next build` ran with, so that connect-src matches the bundle (Task 14 keeps .env files out).
  // A plain record, as buildEnvFor takes: ProcessEnv declares TZ and NODE_ENV, which share no key with CspEnv.
  const env: Readonly<Record<string, string | undefined>> = buildEnvFor(o.env ?? process.env);
  const pages = applyCsp(OUT_DIR, env);
  const line =
    pages > 0 ? `csp: ${pages} pages carry a hashed Content-Security-Policy\n` : 'csp: out/ has no HTML page\n';
  if (!o.quiet) process.stdout.write(line);
  return { code: pages > 0 ? 0 : 1, output: built.output + line };
}
