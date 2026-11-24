import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR, buildApp, OUT_DIR } from '../../scripts/lib/run-next';
import { API_SENTINEL, BUILD_OUT, DOTENV_SENTINEL, outOf } from './paths';

/** The file Next reads first in a production build; a developer's copy is the likeliest leak into deweb. */
const DOTENV = join(APP_DIR, '.env.production.local');

/** Two real production builds; ATROPYLE_REUSE_BUILD=1 reuses the last ones for a quick rerun. */
export default async function setup(): Promise<void> {
  if (process.env.ATROPYLE_REUSE_BUILD === '1' && existsSync(outOf('vercel')) && existsSync(outOf('deweb'))) return;
  if (existsSync(DOTENV)) {
    throw new Error(`${DOTENV} exists. The build test writes its own and never touches yours: move it away first.`);
  }
  rmSync(BUILD_OUT, { recursive: true, force: true });
  writeFileSync(DOTENV, `NEXT_PUBLIC_API_URL=${DOTENV_SENTINEL}\n`, { flag: 'wx' });
  try {
    for (const target of ['vercel', 'deweb'] as const) {
      // Typed: spreading process.env next to other keys drops its index signature, and `delete` needs it.
      const env: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_TARGET: target, NEXT_PUBLIC_API_URL: API_SENTINEL };
      delete env.ATROPYLE_E2E;
      const r = await buildApp({ env, quiet: true });
      if (r.code !== 0) throw new Error(`next build (${target}) failed:\n${r.output}`);
      cpSync(OUT_DIR, outOf(target), { recursive: true });
    }
  } finally {
    rmSync(DOTENV, { force: true });
  }
}
