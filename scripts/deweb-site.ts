// npm run deweb:site -- --cpu <addr> --token-id <n> [--rpc <url>] [--out deployments/deweb.json]
// Read-only. Finds the opened container of circuit <n> on <cpu> and records the site identity.
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, getAddress, http, isAddress } from 'viem';
import { DEWEB, findCpuIndex, keyFlagOf, openerAbi, redactHex, registryAbi } from './lib/deweb';
import { makeSite, writeSite } from './lib/deweb-site';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_OUT = 'deployments/deweb.json';
const posix = (p: string) => p.split(sep).join('/').replaceAll('\\', '/');

class Fail extends Error {
  constructor(
    message: string,
    readonly code = 1,
  ) {
    super(message);
  }
}

function parseArgs(argv: readonly string[], env: NodeJS.ProcessEnv) {
  const o: Record<string, string | undefined> = {
    '--cpu': env.ATRO_CPU,
    '--token-id': env.DEWEB_TOKEN_ID,
    '--rpc': 'https://rpc.xlayer.tech',
    '--out': DEFAULT_OUT,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const key = keyFlagOf(a);
    if (key) throw new Fail(`${key}: there is no key mode; deweb:site only reads the chain and writes a file`, 2);
    if (!(a in o)) throw new Fail(`unknown argument: ${redactHex(a)}`, 2);
    const v = argv[++i];
    if (!v || v.startsWith('--')) throw new Fail(`${a} needs a value`, 2);
    o[a] = v;
  }
  const cpu = o['--cpu'] ?? '';
  const token = o['--token-id'] ?? '';
  if (!isAddress(cpu, { strict: false })) {
    throw new Fail(`--cpu is not an address: ${redactHex(cpu) || '(missing)'}`, 2);
  }
  if (!/^[1-9]\d*$/.test(token)) {
    throw new Fail(`--token-id must be a positive integer: ${redactHex(token) || '(missing)'}`, 2);
  }
  return {
    cpu: getAddress(cpu.toLowerCase()),
    tokenId: BigInt(token),
    rpcUrl: o['--rpc'] as string,
    out: o['--out'] as string,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.env);
  const client = createPublicClient({ transport: http(args.rpcUrl) });
  const chainId = await client.getChainId();
  if (resolve(ROOT, args.out) === resolve(ROOT, DEFAULT_OUT) && chainId !== DEWEB.chainId) {
    throw new Fail(`${args.rpcUrl} is chain ${chainId}; on a fork, write to another file with --out`, 2);
  }
  const container = await client.readContract({
    address: DEWEB.opener,
    abi: openerAbi,
    functionName: 'accountOf',
    args: [args.cpu, args.tokenId],
  });
  const opened = await client.readContract({
    address: DEWEB.registry,
    abi: registryAbi,
    functionName: 'isOpenedContainer',
    args: [container],
  });
  if (!opened) {
    throw new Fail(
      `circuit #${args.tokenId} on ${args.cpu} has no opened container yet (${container}): open the container first, see docs/deployments.md`,
    );
  }
  const cpuIndex = await findCpuIndex(client, args.cpu);
  const site = makeSite({ cpu: args.cpu, cpuIndex, tokenId: args.tokenId, container });
  writeSite(resolve(ROOT, args.out), site);
  console.log(`Wrote ${posix(args.out)}:`);
  console.log(JSON.stringify(site, null, 2));
  console.log('In Git Bash:');
  console.log(`export DEWEB_CONTAINER=${site.container}`);
  console.log(`export DEWEB_NAME=${site.name}`);
}

try {
  await main();
} catch (e) {
  console.error(redactHex(e instanceof Error ? e.message : String(e)));
  // Not process.exit(): on Windows it can abort in libuv while fetch still holds a keep-alive socket.
  process.exitCode = e instanceof Fail ? e.code : 1;
}
