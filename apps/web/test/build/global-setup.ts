import { cpSync, existsSync, rmSync } from 'node:fs';
import { buildApp, OUT_DIR } from '../../scripts/lib/run-next';
import { API_SENTINEL, BUILD_OUT, outOf } from './paths';

/** Two real production builds; ATROPYLE_REUSE_BUILD=1 reuses the last ones for a quick rerun. */
export default async function setup(): Promise<void> {
  if (process.env.ATROPYLE_REUSE_BUILD === '1' && existsSync(outOf('vercel')) && existsSync(outOf('deweb'))) return;
  rmSync(BUILD_OUT, { recursive: true, force: true });
  for (const target of ['vercel', 'deweb'] as const) {
    // Typed: spreading process.env next to other keys drops its index signature, and `delete` needs it.
    const env: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_TARGET: target, NEXT_PUBLIC_API_URL: API_SENTINEL };
    delete env.ATROPYLE_E2E;
    const r = await buildApp({ env, quiet: true });
    if (r.code !== 0) throw new Error(`next build (${target}) failed:\n${r.output}`);
    cpSync(OUT_DIR, outOf(target), { recursive: true });
  }
}
