// npx tsx scripts/e2e-devnet-prep.ts <rpcUrl> <outFile>
// Deploys the local contracts on a running anvil, seeds the demo vaults and writes { deployment, seeded } to outFile.
// Runs outside Playwright (the web e2e global setup calls it), so it can import repo sources directly.
import { writeFileSync } from 'node:fs';
import { parseDeployment } from '../packages/sdk/src/index';
import { deployLocal } from './lib/anvil';
import { seedDevnet } from './lib/seed';

const [rpcUrl, out] = process.argv.slice(2);
if (!rpcUrl || !out) throw new Error('usage: e2e-devnet-prep.ts <rpcUrl> <outFile>');

const json = await deployLocal(rpcUrl);
const seeded = await seedDevnet(rpcUrl, parseDeployment(json));

writeFileSync(out, JSON.stringify({ deployment: json, seeded }, null, 2));
