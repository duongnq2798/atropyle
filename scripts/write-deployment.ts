// npm run deployment:write -- [--builder-code <code>] [--web-url <url>] [--factory <address> --factory-block <n>]
// Reads X Layer mainnet through two independent RPC operators and writes deployments/xlayer.json.
// Read only: it never signs, and needs no key.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildAll, deployedNetlists, listRefs } from '@atropyle/circuits';
import {
  type Address,
  createPublicClient,
  defineChain,
  getAddress,
  type Hex,
  hexToBytes,
  keccak256,
  type PublicClient,
} from 'viem';
import { cpuAbi, factoryAbi } from '../packages/sdk/src/abi/index';
import { isBuilderCode } from '../packages/sdk/src/builder-code';
import {
  type Deployment,
  deploymentToJson,
  parseDeployment,
  readTransport,
  toAddress,
} from '../packages/sdk/src/index';
import { quorumTransport, readIntegrity } from '../packages/sdk/src/verify/index';
import { syncDeployments } from './lib/deployment-files';

const ROOT = join(import.meta.dirname, '..');
const BROADCAST = join(ROOT, 'contracts/broadcast/04_DeployAtropyle.s.sol/196/run-latest.json');
const OKX = ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'];
const DRPC = ['https://xlayer.drpc.org'];
const FEE_TOKENS: Address[] = [
  '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
  '0xB6CEceAB302E2E4948951eE7843FC24E92933061',
  '0x4ae46a509F6b1D9056937BA4500cb143933D2dc8',
];
const TAPEOUT = {
  factory: '0x1f09DAeFA827f02CBb40967cc91b259763760761',
  beacon: '0xf70d1ed4f62CF3780157B0b421b7E2F45bD0991C',
  beaconSlot: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50',
  name: 'Atropyle',
  symbol: 'ATRO',
} as const;

function fail(message: string): never {
  console.error(`write-deployment: ${message}`);
  process.exit(1);
}

function readArgs() {
  try {
    return parseArgs({
      options: {
        'builder-code': { type: 'string' },
        'web-url': { type: 'string', default: 'https://atropyle.xyz/' },
        factory: { type: 'string' },
        'factory-block': { type: 'string' },
      },
    }).values;
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

const args = readArgs();
// Before any network access: an empty or malformed code would be written into the deployment file.
if (args['builder-code'] !== undefined && !isBuilderCode(args['builder-code']))
  fail('--builder-code must be printable ASCII without spaces or commas (and not empty)');

function fromBroadcast(): { factory: Address; block: bigint } | null {
  if (!existsSync(BROADCAST)) return null;
  const run = JSON.parse(readFileSync(BROADCAST, 'utf8')) as {
    transactions: { transactionType: string; contractName: string | null; contractAddress: string | null }[];
    receipts: { contractAddress: string | null; blockNumber: string }[];
  };
  const tx = run.transactions.find(
    (t) => t.transactionType.startsWith('CREATE') && t.contractName === 'AtropyleFactory',
  );
  if (!tx?.contractAddress) return null;
  const factory = getAddress(tx.contractAddress);
  const receipt = run.receipts.find((r) => r.contractAddress && getAddress(r.contractAddress) === factory);
  return receipt ? { factory, block: BigInt(receipt.blockNumber) } : null;
}

function fromFlags(): { factory: Address; block: bigint } | null {
  if (args.factory === undefined && args['factory-block'] === undefined) return null;
  if (args.factory === undefined || args['factory-block'] === undefined)
    fail('--factory and --factory-block go together: pass both');
  if (!/^\d+$/.test(args['factory-block'])) fail('--factory-block must be a non-negative integer');
  let factory: Address;
  try {
    factory = toAddress(args.factory, '--factory');
  } catch {
    return fail('--factory is not a valid address');
  }
  return { factory, block: BigInt(args['factory-block']) };
}

const origin =
  fromFlags() ??
  fromBroadcast() ??
  fail(`no factory: pass --factory <address> and --factory-block <n>, or keep the broadcast file ${BROADCAST}`);

const chain = defineChain({
  id: 196,
  name: 'X Layer',
  nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
  rpcUrls: { default: { http: OKX } },
});
const client = createPublicClient({
  chain,
  transport: quorumTransport([readTransport(OKX), readTransport(DRPC)]),
  // No CCIP read: --factory is untrusted input, and a contract must not make this script fetch a URL it picked.
  ccipRead: false,
  cacheTime: 0,
}) as PublicClient;

if ((await client.getChainId()) !== 196) fail('the RPC operators are not on chain 196');
const blockNumber = await client.getBlockNumber();
const f = { address: origin.factory, abi: factoryAbi, blockNumber } as const;
const [cpu, policyId, vaultImpl, treasury] = await Promise.all([
  client.readContract({ ...f, functionName: 'cpu' }),
  client.readContract({ ...f, functionName: 'policyId' }),
  client.readContract({ ...f, functionName: 'vaultImpl' }),
  client.readContract({ ...f, functionName: 'treasury' }),
]);
const implCode = await client.getCode({ address: vaultImpl, blockNumber });
if (!implCode || implCode === '0x') fail(`vault implementation ${vaultImpl} has no code`);

const feeTokens: Address[] = [];
for (const token of FEE_TOKENS) {
  if ((await client.readContract({ ...f, functionName: 'fullFee', args: [token] })) > 0n) feeTokens.push(token);
}
if (feeTokens.length === 0) fail('the factory accepts none of the expected fee tokens');

// Circuit ids by role: match the on-chain REF sites with the source template by byte offset.
const netlist = (id: bigint) =>
  client.readContract({ address: cpu, abi: cpuAbi, functionName: 'netlist', args: [id], blockNumber });
const policyBytes = await netlist(policyId);
if (policyBytes === '0x') fail(`CPU ${cpu} has no netlist for policy ${policyId}`);
const refs = listRefs(hexToBytes(policyBytes));
const sites = buildAll().policy.refs;
const idOf = (target: 'KofN5' | 'Ge4'): bigint => {
  const site = sites.find((s) => s.target === target) ?? fail(`the source template has no ${target} REF`);
  return refs.find((r) => r.offset === site.offset)?.id ?? fail(`no ${target} REF at byte ${site.offset} on chain`);
};
const ids = [idOf('KofN5'), idOf('Ge4')] as const;
const source = deployedNetlists(cpu, ids);
const onChain: Record<'policy' | 'kofn5' | 'ge4', Hex> = {
  policy: policyBytes,
  kofn5: await netlist(ids[0]),
  ge4: await netlist(ids[1]),
};
const netlistKeccak = { policy: keccak256(source.policy), kofn5: keccak256(source.kofn5), ge4: keccak256(source.ge4) };
for (const role of ['policy', 'kofn5', 'ge4'] as const) {
  if (keccak256(onChain[role]) !== netlistKeccak[role])
    fail(`the ${role} netlist on chain differs from the source in circuits/`);
}

if (!args['builder-code'])
  console.warn('write-deployment: no --builder-code given; builderCode will be null (spec §19, item 7).');

const deployment: Deployment = {
  name: 'xlayer',
  chainId: 196,
  rpcUrls: OKX,
  quorumRpcUrls: [OKX, DRPC],
  explorerUrl: 'https://www.oklink.com/xlayer',
  factory: origin.factory,
  factoryBlock: origin.block,
  vaultImpl,
  vaultImplCodehash: keccak256(implCode),
  cpu,
  policyId,
  treasury,
  feeTokens,
  circuits: { kofn5: ids[0], ge4: ids[1], netlistKeccak },
  tapeout: TAPEOUT,
  builderCode: args['builder-code'] ?? null,
  webUrl: args['web-url'] ?? null,
  logsBlockRange: 100,
};
const json = deploymentToJson(deployment);
parseDeployment(json);

const report = await readIntegrity(client, deployment, 2);
for (const c of report.checks)
  console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}${c.ok ? '' : ` expected ${c.expected} got ${c.actual}`}`);
if (!report.ok) fail(`integrity failed at block ${report.blockNumber}; nothing written`);

writeFileSync(join(ROOT, 'deployments/xlayer.json'), `${JSON.stringify(json, null, 2)}\n`);
syncDeployments(false);
console.log(
  `wrote deployments/xlayer.json at block ${blockNumber}: factory ${origin.factory}, cpu ${cpu}, policy ${policyId}, KofN5 ${ids[0]}, Ge4 ${ids[1]}`,
);
