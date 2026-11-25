// npm run daily:check [-- --keeper <address>] [--drill <vault>] [--site <url>] [--blocks <n>]
//                       [--deployment <file>] [--rpc <url>] [--json]
// Read-only report for the maintainer: counters, keeper balance and last action, the public Drill, the site.
// Exits 1 when something needs attention, 2 on a bad argument. It reads the chain and fetches the site, nothing else.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { type Address, createPublicClient, type PublicClient } from 'viem';
import { toAddress } from '../packages/sdk/src/address';
import { chainOf } from '../packages/sdk/src/chain';
import { type Deployment, getDeployment, getTeam, parseDeployment } from '../packages/sdk/src/deployments/index';
import { stringify } from '../packages/sdk/src/json';
import { readTransport } from '../packages/sdk/src/transports';
import { DEFAULT_KEEPER_BLOCKS, renderReport, runDailyCheck } from './lib/daily-check';

const HELP = `Usage: npm run daily:check -- [options]

  --keeper <address>     keeper wallet (default: ATROPYLE_KEEPER, then a keeper in deployments/team.json)
  --drill <vault>        public Drill vault (default: ATROPYLE_DRILL, then the longest-lived Drill a team address owns)
  --site <url>           site that must answer 200 with the app, redirecting only on its own host
                         (default: the deployment's webUrl)
  --blocks <n>           blocks to search back for the keeper's last poke or distribute (default ${DEFAULT_KEEPER_BLOCKS})
  --deployment <file>    deployment JSON, e.g. deployments/local.json (default: X Layer mainnet)
  --rpc <url>            read through this RPC instead of the deployment's
  --json                 print the report as JSON
`;

function fail(message: string): never {
  console.error(`daily:check: ${message}\n\n${HELP}`);
  process.exit(2);
}

function address(v: string | undefined, what: string): Address | null {
  if (v === undefined || v.trim() === '') return null;
  try {
    return toAddress(v, what);
  } catch {
    fail(`${what} is not an address: ${v}`);
  }
}

function readArgs() {
  try {
    return parseArgs({
      options: {
        keeper: { type: 'string' },
        drill: { type: 'string' },
        site: { type: 'string' },
        blocks: { type: 'string' },
        deployment: { type: 'string' },
        rpc: { type: 'string' },
        json: { type: 'boolean' },
        help: { type: 'boolean' },
      },
    }).values;
  } catch (e) {
    fail((e as Error).message);
  }
}

function loadDeployment(file: string | undefined): Deployment {
  try {
    return file ? parseDeployment(JSON.parse(readFileSync(file, 'utf8'))) : getDeployment('xlayer');
  } catch (e) {
    fail(`cannot load the deployment: ${(e as Error).message}`);
  }
}

const args = readArgs();
if (args.help) {
  console.log(HELP);
  process.exit(0);
}
const deployment = loadDeployment(args.deployment);
const blocksArg = args.blocks ?? String(DEFAULT_KEEPER_BLOCKS);
if (!/^\d{1,9}$/.test(blocksArg) || BigInt(blocksArg) < 1n)
  fail(`--blocks must be a whole number from 1: ${blocksArg}`);
const team = getTeam(deployment);
const keeper =
  address(args.keeper, '--keeper') ??
  address(process.env.ATROPYLE_KEEPER, 'ATROPYLE_KEEPER') ??
  team.find((m) => m.role === 'keeper')?.address ??
  null;
const drill = address(args.drill, '--drill') ?? address(process.env.ATROPYLE_DRILL, 'ATROPYLE_DRILL');
if (args.site !== undefined && !URL.canParse(args.site)) fail(`--site is not a URL: ${args.site}`);
if (args.site !== undefined && !/^https?:$/.test(new URL(args.site).protocol))
  fail(`--site must be http or https: ${args.site}`);
const rpc = args.rpc;
const client = createPublicClient({
  chain: chainOf(deployment),
  transport: readTransport(rpc ? [rpc] : deployment.rpcUrls),
  cacheTime: 0,
  // Never follow an OffchainLookup revert to a URL a contract chose.
  ccipRead: false,
}) as PublicClient;

const report = await runDailyCheck({
  client,
  deployment,
  team,
  keeper,
  drill,
  siteUrl: args.site ?? deployment.webUrl,
  keeperBlocks: BigInt(blocksArg),
});
console.log(args.json ? stringify(report, 2) : renderReport(report, deployment.name));
process.exit(report.attention ? 1 : 0);
