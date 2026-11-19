// npm run devnet:seed → seeds the three demo vaults on a devnet that is already running.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDeployment } from '../packages/sdk/src/index';
import { seedDevnet } from './lib/seed';

const url = process.env.DEVNET_RPC ?? 'http://127.0.0.1:8545';
const deployment = parseDeployment(
  JSON.parse(readFileSync(join(import.meta.dirname, '../deployments/local.json'), 'utf8')),
);
const seeded = await seedDevnet(url, deployment);
console.log(`simple ${seeded.simple}\nguarded ${seeded.guarded}\ngrace ${seeded.grace}`);
