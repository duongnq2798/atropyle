// npm run deployments:sync [-- --check]: exits 1 on drift with --check.
import { syncDeployments } from './lib/deployment-files';

const check = process.argv.includes('--check');
const clean = syncDeployments(check);
if (check && !clean) {
  console.error('packages/sdk/src/deployments is out of date: run "npm run deployments:sync"');
  process.exit(1);
}
console.log(check ? 'deployments: up to date' : 'deployments: synced');
