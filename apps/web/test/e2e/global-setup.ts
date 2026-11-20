import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAnvil } from '../../../../scripts/lib/anvil.ts';
import { OKX_ORIGINS } from './network.ts';
import { type E2EState, rpcCall, writeState } from './state.ts';
import { startStaticServer } from './static-server.ts';

const WEB = fileURLToPath(new URL('../..', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
/** Must never reach the DeWEB bundle (Task 7 checks the same sentinel). */
export const WORKER_SENTINEL = 'https://health.atropyle.invalid';

/** One-shot command that finishes before setup returns; npx is a .cmd on Windows, so it runs through a shell (never anvil, see startAnvil). */
function run(command: string, cwd: string, env: NodeJS.ProcessEnv = process.env): void {
  const r = spawnSync(command, { cwd, env, encoding: 'utf8', shell: true, windowsHide: true });
  if (r.status !== 0)
    throw new Error(`${command} failed:
${r.stdout}
${r.stderr}`);
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const anvil = await startAnvil();
  try {
    const out = join(mkdtempSync(join(tmpdir(), 'atropyle-e2e-')), 'devnet.json');
    run(`npx tsx scripts/e2e-devnet-prep.ts ${anvil.url} "${out}"`, ROOT);
    const devnet = JSON.parse(readFileSync(out, 'utf8')) as Pick<E2EState, 'deployment' | 'seeded'>;

    const site = {
      ...devnet.deployment,
      rpcUrls: OKX_ORIGINS,
      quorumRpcUrls: [OKX_ORIGINS, ['https://xlayer.drpc.org']],
      webUrl: null,
    };
    run('npx vite build', WEB, {
      ...process.env,
      VITE_TARGET: 'deweb',
      VITE_CHAIN: 'local',
      VITE_DEPLOYMENT: JSON.stringify(site),
      VITE_WORKER_URL: WORKER_SENTINEL,
      VITE_TELEGRAM_BOT: 'atropyle_test_bot',
      WEB_OUT_DIR: 'dist-e2e',
    });

    const server = await startStaticServer(join(WEB, 'dist-e2e'));
    const snapshot = (await rpcCall(anvil.url, 'evm_snapshot')) as string;
    writeState({ rpcUrl: anvil.url, siteUrl: `http://127.0.0.1:${server.port}/`, snapshot, ...devnet });
    return async () => {
      await server.close();
      await anvil.stop();
    };
  } catch (e) {
    await anvil.stop();
    throw e;
  }
}
