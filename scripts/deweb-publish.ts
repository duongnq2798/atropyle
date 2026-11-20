// npm run deweb:publish -- [--dry-run | --emit contracts/deweb-calls/<name>.json | --unlocked <addr>]
//                          [--dir site-dist/deweb] [--rpc <url>] [--site deployments/deweb.json] [--container <addr>]
//                          [--prune] [--fallback index.html]
// No mode flag means a dry run: it reads the chain and prints the plan and the fee. Nothing here takes a key.
// --emit writes the calls that are left for contracts/script/07_DewebPublish.s.sol, which the circuit holder
// broadcasts from their own terminal with their keystore. --unlocked sends with eth_sendTransaction, and only to a
// local anvil on chain 31337 (a rehearsal fork).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Address, createPublicClient, createWalletClient, formatEther, formatGwei, http } from 'viem';
import {
  DEWEB,
  describeOp,
  emitBatch,
  emitCalls,
  emitJson,
  estimate,
  executePlan,
  type PublishArgs,
  parsePublishArgs,
  planPublish,
  publishCommand,
  type RegistryReader,
  registryAbi,
  registryReader,
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
    else if (argv[i] !== '--dry-run') rest.push(/\s/.test(argv[i]) ? JSON.stringify(posix(argv[i])) : posix(argv[i]));
  }
  return ['npm run deweb:publish -- --dry-run', ...rest].join(' ');
}

async function main(argv: readonly string[]): Promise<void> {
  let args: PublishArgs;
  try {
    args = parsePublishArgs(argv);
  } catch (e) {
    throw new Fail((e as Error).message, 2);
  }

  const dir = resolve(ROOT, args.dir);
  const problems = siteProblems(dir, 'deweb');
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
    console.log(`No ${posix(args.site)} yet: every file counts as new.`);
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
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, emitJson(emitCalls(batch, container, chainId)));
    console.log(
      `Wrote ${batch.length} call(s) to ${file} (chain ${chainId}, container ${container}). Nothing was sent.`,
    );
    if (left > 0) {
      console.log(
        `That is part of the plan: ${left} call(s) are left, so that one forge run stays under its gas limit. After this broadcast, run --emit again for the next part.`,
      );
    }
    console.log(
      'Broadcast them from your own terminal, in Git Bash, as the holder of the circuit NFT (the container editor):',
    );
    console.log('  cd contracts');
    console.log(`  ${publishCommand(file, args.rpcUrl)}`);
    if (chainId !== DEWEB.chainId) {
      console.log(
        `  (chain ${chainId} is not X Layer: on a local anvil, use --unlocked --sender <address> instead of --account)`,
      );
    }
    console.log('forge simulates every call before it sends one, and asks for the keystore password once.');
    console.log(
      left > 0
        ? `Then run ${dryRunCommand(argv)}: it should plan the ${left} call(s) that are left.`
        : `Then run ${dryRunCommand(argv)} and expect "Nothing to publish".`,
    );
    console.log('If the broadcast stops part way, run --emit again: it writes only the calls that are left.');
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
  console.error(e instanceof Error ? e.message : String(e));
  // Not process.exit(): on Windows it can abort in libuv while fetch still holds a keep-alive socket.
  process.exitCode = e instanceof Fail ? e.code : 1;
}
