import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAnvil } from '../../../../scripts/lib/anvil.ts';
import { buildApp, OUT_DIR } from '../../scripts/lib/run-next.ts';
import { siteHeaders } from '../../scripts/lib/site-headers.ts';
import { startStaticServer } from '../../scripts/lib/static-server.ts';
import { OKX_ORIGINS } from './network.ts';
import { type E2EState, rpcCall, writeState } from './state.ts';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
/** The e2e build, copied out of out/ so that a later `npm run build` cannot change it under a running suite. */
const SITE = fileURLToPath(new URL('./.site', import.meta.url));

/**
 * Empties a folder and keeps it. Windows cannot remove a folder that a process holds open (a file server started in
 * it, a shell left in it), but it can remove what is inside, which is all a fresh copy needs.
 */
function emptyDir(dir: string): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) rmSync(join(dir, name), { recursive: true, force: true });
}

/** Deploys the contracts and seeds the demo vaults; its own process, because it imports repo sources directly. */
function prepareDevnet(rpcUrl: string): Pick<E2EState, 'deployment' | 'seeded'> {
  const out = join(mkdtempSync(join(tmpdir(), 'atropyle-e2e-')), 'devnet.json');
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/e2e-devnet-prep.ts', rpcUrl, out], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error(`e2e-devnet-prep failed:\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(readFileSync(out, 'utf8')) as Pick<E2EState, 'deployment' | 'seeded'>;
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const anvil = await startAnvil();
  let server: Awaited<ReturnType<typeof startStaticServer>> | undefined;
  try {
    const devnet = prepareDevnet(anvil.url);
    // The deweb build, pointed at the OKX origins that every test routes to anvil (network.ts).
    const site = {
      ...devnet.deployment,
      rpcUrls: [...OKX_ORIGINS],
      quorumRpcUrls: [[...OKX_ORIGINS], ['https://xlayer.drpc.org']],
      webUrl: null,
    };
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NEXT_PUBLIC_TARGET: 'deweb',
      NEXT_PUBLIC_CHAIN: 'local',
      NEXT_PUBLIC_DEPLOYMENT: JSON.stringify(site),
      ATROPYLE_E2E: '1',
    };
    const built = await buildApp({ env, quiet: true });
    if (built.code !== 0) throw new Error(`next build (e2e) failed:\n${built.output}`);
    emptyDir(SITE);
    cpSync(OUT_DIR, SITE, { recursive: true });
    // Served with the headers of vercel.json, so the header policy and each page's meta policy apply together.
    server = await startStaticServer(SITE, 0, siteHeaders());
    const snapshot = (await rpcCall(anvil.url, 'evm_snapshot')) as string;
    writeState({ rpcUrl: anvil.url, siteUrl: `${server.url}/`, snapshot, ...devnet });
    const started = server;
    return async () => {
      await started.close();
      await anvil.stop();
    };
  } catch (e) {
    await server?.close();
    await anvil.stop();
    throw e;
  }
}
