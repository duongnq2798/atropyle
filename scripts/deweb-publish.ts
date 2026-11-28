// npm run deweb:publish -- [--dry-run | --emit contracts/deweb-calls/<name>.json | --unlocked <addr>]
//                          [--dir site-dist/deweb] [--rpc <url>] [--site deployments/deweb.json] [--container <addr>]
//                          [--prune] [--fallback 404.html]
// No mode flag means a dry run: it reads the chain and prints the plan and the fee. Nothing here takes a key.
// --emit writes the calls that are left for contracts/script/07_DewebPublish.s.sol, which the circuit holder
// broadcasts from their own terminal with their keystore. --unlocked sends with eth_sendTransaction, and only to a
// local anvil on chain 31337: for a rehearsal, one with MockSiteRegistry at the registry address (as in
// scripts/test/site/deweb-local.test.ts). A fork of X Layer keeps chain 196; there, use --emit and a forge script
// simulation without --broadcast.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Address,
  createPublicClient,
  createWalletClient,
  formatEther,
  formatGwei,
  http,
  isAddress,
  isAddressEqual,
} from 'viem';
import {
  checkCommand,
  DEWEB,
  describeOp,
  emitBatch,
  emitCalls,
  emitJson,
  estimate,
  executePlan,
  fileKeccak,
  type PublishArgs,
  parsePublishArgs,
  planPublish,
  publishCommand,
  type RegistryReader,
  redactHex,
  registryAbi,
  registryReader,
  shQuote,
  unlockedChainProblem,
  walletSender,
} from './lib/deweb';
import { readSite } from './lib/deweb-site';
import { siteProblems } from './lib/site-check';
import { loadSite } from './lib/site-files';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const posix = (p: string) => p.split(sep).join('/').replaceAll('\\', '/');

class Fail extends Error {
  constructor(
    message: string,
    readonly code = 1,
  ) {
    super(message);
  }
}

/** The same command line as a dry run: the mode flag swapped for --dry-run, every other option kept. */
function dryRunCommand(argv: readonly string[]): string {
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--emit' || argv[i] === '--unlocked') i++;
    else if (argv[i] !== '--dry-run') {
      const arg = redactHex(posix(argv[i]));
      rest.push(/^[\w@%+=:,./-]+$/.test(arg) ? arg : shQuote(arg));
    }
  }
  return ['npm run deweb:publish -- --dry-run', ...rest].join(' ');
}

/**
 * With nothing left to publish, an --emit file for this container holds only calls that are on chain: broadcasting
 * it again would put old bytes back (a part file would cut a file back to its first chunks), so --emit deletes it.
 * Only a file directly in contracts/deweb-calls/ (never the committed fixtures under test/), and only when it is a
 * calls file for this container and chain; any other file is left as it is.
 */
function removeSpentFile(file: string, container: Address, chainId: number): void {
  const abs = resolve(ROOT, file);
  if (dirname(abs) !== resolve(ROOT, 'contracts', 'deweb-calls') || !existsSync(abs)) return;
  let calls: { container?: unknown; chainId?: unknown };
  try {
    calls = JSON.parse(readFileSync(abs, 'utf8'));
  } catch {
    console.log(`Kept ${file}: it is not JSON, so it is not a calls file this command wrote.`);
    return;
  }
  const own =
    typeof calls === 'object' &&
    calls !== null &&
    typeof calls.container === 'string' &&
    isAddress(calls.container, { strict: false }) &&
    isAddressEqual(calls.container, container) &&
    calls.chainId === chainId;
  if (!own) {
    console.log(`Kept ${file}: it is not a calls file for container ${container} on chain ${chainId}.`);
    return;
  }
  rmSync(abs);
  console.log(`Deleted ${file}: its calls are all on chain, and a second broadcast would put old bytes back.`);
}

async function main(argv: readonly string[]): Promise<void> {
  let args: PublishArgs;
  try {
    args = parsePublishArgs(argv);
  } catch (e) {
    throw new Fail((e as Error).message, 2);
  }

  const dir = resolve(ROOT, args.dir);
  const problems = siteProblems(dir, 'deweb', { pages: false });
  if (problems.length > 0) throw new Fail(problems.map((p) => `- ${p}`).join('\n'));
  const local = loadSite(dir);
  const site = readSite(resolve(ROOT, args.site));
  const container: Address | null = args.container ?? site?.container ?? null;

  const client = createPublicClient({ transport: http(args.rpcUrl) });
  const chainId = await client.getChainId();
  if (args.mode.kind === 'unlocked') {
    const refused = unlockedChainProblem(args.rpcUrl, chainId);
    if (refused) throw new Fail(refused, 2);
  }

  let reader: RegistryReader | null = null;
  if (container) {
    const opened = await client.readContract({
      address: DEWEB.registry,
      abi: registryAbi,
      functionName: 'isOpenedContainer',
      args: [container],
    });
    if (!opened) {
      throw new Fail(
        `${container} is not an opened DeWEB container: open the container first, see docs/deployments.md`,
      );
    }
    reader = registryReader(client, container);
  } else if (args.mode.kind !== 'dry-run') {
    throw new Fail('no container: pass --container, or run npm run deweb:site once the container is open');
  } else {
    console.log(`No ${redactHex(posix(args.site))} yet: every file counts as new.`);
  }

  const plan = await planPublish(local, reader, { prune: args.prune, fallback: args.fallback });
  const gasPrice = await client.getGasPrice();
  const est = estimate(plan.ops, gasPrice);
  for (const f of plan.files) console.log(`${f.status.padEnd(9)} ${f.path} (${f.bytes} B, ${f.ops.length} tx)`);
  for (const p of plan.removals) console.log(`remove    ${p}`);
  if (plan.fallback) console.log(`fallback  ${plan.fallback}`);
  console.log(
    `${est.txs} transaction(s), ${est.bytes} bytes, about ${est.gas} gas = ${formatEther(est.fee)} OKB at ${formatGwei(gasPrice)} gwei`,
  );

  if (plan.ops.length === 0) {
    console.log('Nothing to publish: the chain already has this site.');
    if (args.mode.kind === 'emit' && container) removeSpentFile(args.mode.file, container, chainId);
    return;
  }
  // forge reserves 1.3 x the estimated gas at up to twice the gas price before it broadcasts.
  console.log(
    `The account that sends them should hold at least ${formatEther(est.fee * 3n)} OKB (the estimate x 3, as forge budgets it).`,
  );
  if (args.mode.kind === 'dry-run' || !container) {
    console.log(
      'Dry run: nothing was sent. To publish, run --emit contracts/deweb-calls/<name>.json and broadcast it with forge script (see docs/deployments.md).',
    );
    return;
  }

  if (args.mode.kind === 'emit') {
    const file = args.mode.file;
    const abs = resolve(ROOT, file);
    const batch = emitBatch(plan.ops);
    const left = plan.ops.length - batch.length;
    const text = emitJson(emitCalls(batch, container, chainId));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text);
    const hash = fileKeccak(text);
    console.log(
      `Wrote ${batch.length} call(s) to ${file} (chain ${chainId}, container ${container}). Nothing was sent.`,
    );
    console.log(`keccak256 of ${file}: ${hash}`);
    if (left > 0) {
      console.log(
        `That is part of the plan: ${left} call(s) are left, so that one forge run stays under its gas limit.`,
      );
    }
    console.log(
      'Broadcast them from your own terminal, in Git Bash, as the holder of the circuit NFT (the container editor):',
    );
    console.log('  cd contracts');
    console.log('First check the file. This needs no key and sends nothing; it prints the keccak256 and every call:');
    console.log(`  ${checkCommand(file, args.rpcUrl)}`);
    console.log(
      `Compare its "file keccak256" with ${hash}. Type the keystore password below only if they are the same.`,
    );
    console.log(`  ${publishCommand(file, args.rpcUrl, hash)}`);
    if (chainId !== DEWEB.chainId) {
      console.log(
        `  (chain ${chainId} is not X Layer: on a local anvil, use --unlocked --sender <address> instead of --account)`,
      );
    }
    console.log(
      'forge asks for the keystore password first, then prints the same keccak256 and simulates every call before it sends one.',
    );
    console.log(
      'The command carries the keccak256 (DEWEB_KECCAK): forge sends nothing if the file changed after your check.',
    );
    console.log(
      left > 0
        ? `After a successful broadcast, delete ${file}, then run --emit again for the next part: broadcasting this part again later would cut a file back to its first chunks.`
        : `After a successful broadcast, delete ${file}: broadcasting it again later would put these bytes back.`,
    );
    console.log(
      left > 0
        ? `Then run ${dryRunCommand(argv)}: it should plan the ${left} call(s) that are left.`
        : `Then run ${dryRunCommand(argv)} and expect "Nothing to publish".`,
    );
    console.log(
      'If the broadcast stops part way, run --emit again: it writes only the calls that are left, and deletes the file once nothing is left.',
    );
    return;
  }

  const from = args.mode.from;
  const balance = await client.getBalance({ address: from });
  if (balance < est.fee) {
    throw new Fail(`${from} has ${formatEther(balance)} OKB; it needs at least ${formatEther(est.fee)}`);
  }
  const sender = walletSender(createWalletClient({ transport: http(args.rpcUrl) }), from, client);
  await executePlan(plan.ops, container, sender, (i, op, hash) =>
    console.log(`[${i + 1}/${plan.ops.length}] ${describeOp(op)} ${hash}`),
  );
  console.log(
    `Published ${plan.ops.length} transaction(s) to ${container}. A new dry run should now plan 0 transactions.`,
  );
}

try {
  await main(process.argv.slice(2));
} catch (e) {
  console.error(redactHex(e instanceof Error ? e.message : String(e)));
  // Not process.exit(): on Windows it can abort in libuv while fetch still holds a keep-alive socket.
  process.exitCode = e instanceof Fail ? e.code : 1;
}
