// npm run devnet: anvil on :8545 + DeployLocal + deployments/local.json + three seeded vaults (spec §10.3); --no-seed skips them.
// npm run devnet -- --fork: fork X Layer mainnet (real CPU and circuits) on :8545, nothing deployed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDeployment } from '../packages/sdk/src/index';
import { deployLocal, startAnvil } from './lib/anvil';
import { syncDeployments } from './lib/deployment-files';
import { seedDevnet } from './lib/seed';

const ROOT = join(import.meta.dirname, '..');
const fork = process.argv.includes('--fork');

function die(e: unknown): never {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

const anvil = await startAnvil({
  port: 8545,
  forkUrl: fork ? (process.env.XLAYER_FORK_RPC ?? 'https://rpc.xlayer.tech') : undefined,
}).catch(die);
try {
  if (fork) {
    console.log(
      `X Layer fork on ${anvil.url} (chain 196). Try: npx atropyle verify --verify-rpc ${anvil.url} --single-rpc`,
    );
  } else {
    const json = await deployLocal(anvil.url);
    mkdirSync(join(ROOT, 'deployments'), { recursive: true });
    writeFileSync(join(ROOT, 'deployments/local.json'), `${JSON.stringify(json, null, 2)}\n`);
    syncDeployments(false);
    if (!process.argv.includes('--no-seed')) {
      const seeded = await seedDevnet(anvil.url, parseDeployment(json));
      console.log(`seeded vaults: simple ${seeded.simple}, guarded ${seeded.guarded}, grace ${seeded.grace}`);
    }
    console.log(
      `devnet on ${anvil.url}: factory ${json.factory}, fee tokens ${(json.feeTokens as string[]).join(', ')}`,
    );
  }
} catch (e) {
  await anvil.stop();
  die(e);
}
console.log('Ctrl+C to stop.');
const stop = async () => {
  await anvil.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
await new Promise(() => {});
