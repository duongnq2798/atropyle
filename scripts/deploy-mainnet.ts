// npm run deploy:mainnet -- --deployer <address> --treasury <address> [--smoke-heir <address>]
//                           [--account atropyle-deployer] [--legacy] [--skip-balance-check]
// npm run deploy:mainnet -- --rehearsal http://127.0.0.1:<port> --deployer <anvil account> --treasury <address> ...
//
// Runs stages 01-05 of contracts/README.md ("Triển khai mainnet") in order, from the deployer's own terminal.
// Forge signs every transaction with the deployer's Foundry keystore (--account) and asks for its password itself:
// this script never sees a key or a password, and never reads its own stdin (a short child process asks for the
// confirmation), so forge's password prompt has the console to itself.
//
// Before anything is spent it checks the chain id, contracts/.env, that DEPLOYER is a plain EOA holding enough BEM
// and OKB, that TREASURY receives every fee token (the read-only fork test), and that the keystore unlocks to
// DEPLOYER. After each stage it reads the result back from the chain and saves it to
// contracts/broadcast/atropyle-deploy/<chainId>/progress.json, so running the same command again resumes at the
// first stage left. A stage that sent anything is never sent again by this script, even when forge failed half-way.
// At the end it runs the read-only ForkTest on the deployed contracts.
// --rehearsal sends with --unlocked, and only to an anvil fork on 127.0.0.1 with chain id 31337.
import { type SpawnOptions, spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { type Address, createPublicClient, formatEther, formatUnits, http, isAddressEqual, parseAbi } from 'viem';
import { ANVIL_ACCOUNTS } from './lib/anvil';
import {
  addressArg,
  childEnv,
  controlledNamesInEnvFile,
  existingProcessor,
  exportLines,
  mergeRoles,
  type Progress,
  parseExports,
  type Roles,
  readProgress,
  resolveFoundry,
  STAGES,
  type Stage,
  stageDone,
  writeProgress,
} from './lib/mainnet-deploy';

const ROOT = join(import.meta.dirname, '..');
const CONTRACTS = join(ROOT, 'contracts');
const MAINNET_RPC = 'https://rpc.xlayer.tech';
const BEM: Address = '0x60e62Efa9405d6873C5deaBD4E6CC91c25363952';
const MIN_BEM = 20_000_000n; // 0.2 BEM (8 decimals), contracts/README.md
const MIN_OKB = 20_000_000_000_000_000n; // 0.02 OKB

const erc20Abi = parseAbi(['function balanceOf(address) view returns (uint256)']);
const cpuAbi = parseAbi([
  'function name() view returns (string)',
  'function transistors() view returns (address)',
  'function circuitInfo(uint256) view returns (uint32, uint32, uint32, uint32)',
  'function ownerOf(uint256) view returns (address)',
]);
const transistorsAbi = parseAbi(['function creator() view returns (address)']);
const factoryAbi = parseAbi([
  'function cpu() view returns (address)',
  'function policyId() view returns (uint256)',
  'function treasury() view returns (address)',
  'function vaultImpl() view returns (address)',
]);
const vaultAbi = parseAbi(['function drill() view returns (bool)', 'function state() view returns (uint8)']);

class Stop extends Error {}
function stop(message: string): never {
  throw new Stop(message);
}

const rel = (p: string) => relative(ROOT, p).replaceAll('\\', '/');
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function readArgs() {
  return parseArgs({
    options: {
      deployer: { type: 'string' },
      treasury: { type: 'string' },
      'smoke-heir': { type: 'string' },
      account: { type: 'string', default: 'atropyle-deployer' },
      legacy: { type: 'boolean', default: false },
      'skip-balance-check': { type: 'boolean', default: false },
      rehearsal: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  }).values;
}

/**
 * Runs a command in contracts/, echoing its output while it runs, and returns the exit code and the text. Ctrl+C
 * reaches the child through the shared console; this process waits for it instead of dying with unsaved progress.
 */
function run(cmd: string, args: string[], env: Record<string, string>): Promise<{ code: number; out: string }> {
  const opts: SpawnOptions = { cwd: CONTRACTS, env, stdio: ['inherit', 'pipe', 'pipe'] };
  const onSigint = () => console.error(`\nCtrl+C: waiting for ${cmd} to stop, then saving progress…`);
  process.on('SIGINT', onSigint);
  return new Promise<{ code: number; out: string }>((resolve, reject) => {
    const child = spawn(cmd, args, opts);
    let out = '';
    child.stdout?.on('data', (b: Buffer) => {
      out += b.toString();
      process.stdout.write(b);
    });
    child.stderr?.on('data', (b: Buffer) => {
      out += b.toString();
      process.stderr.write(b);
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  }).finally(() => process.off('SIGINT', onSigint));
}

// One line from the console, read in a child process that exits right after: this process never opens its stdin.
const CONFIRM =
  "const rl=require('node:readline').createInterface({input:process.stdin});" +
  "rl.once('line',(l)=>process.exit(l.trim()===process.argv[1]?0:1));rl.once('close',()=>process.exit(1));";
function confirm(prompt: string, word: string): boolean {
  process.stdout.write(prompt);
  return spawnSync(process.execPath, ['-e', CONFIRM, word], { stdio: 'inherit' }).status === 0;
}

/**
 * Finds forge and cast, on PATH or in ~/.foundry/bin, before anything else; stops with a clear message if neither.
 * Returns how the maintainer's own shell can run cast, for the hints this script prints.
 */
function setUpFoundry(): string {
  const works = (cmd: string) => spawnSync(cmd, ['--version'], { encoding: 'utf8' }).status === 0;
  const found = resolveFoundry(works('forge') && works('cast'), homedir(), process.platform, existsSync);
  if ('error' in found) stop(found.error);
  if (found.use === 'path') return 'cast';
  // Every child (forge, cast) inherits this PATH. On Windows process.env is case-insensitive, so this is "Path".
  process.env.PATH = `${found.dir}${delimiter}${process.env.PATH ?? ''}`;
  console.log(`forge and cast are not on PATH; using ${found.dir}`);
  return process.platform === 'win32' ? `& "${join(found.dir, 'cast.exe')}"` : join(found.dir, 'cast');
}

const recordPath = (s: Stage, chainId: number) =>
  join(CONTRACTS, 'broadcast', `${s.script}.s.sol`, String(chainId), 'run-latest.json');

async function main(): Promise<void> {
  const args = readArgs();
  if (args.help) {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\nimport ')[0]);
    return;
  }
  const castCmd = setUpFoundry();

  const rehearsal = args.rehearsal !== undefined;
  const rpc = args.rehearsal ?? MAINNET_RPC;
  if (rehearsal && !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(rpc))
    stop('--rehearsal takes a local anvil URL, http://127.0.0.1:<port>');
  const client = createPublicClient({ transport: http(rpc, { retryCount: 3 }) });
  const chainId = await client.getChainId();
  if (rehearsal && chainId !== 31337) stop(`--rehearsal needs anvil started with --chain-id 31337, got ${chainId}`);
  if (!rehearsal && chainId !== 196) stop(`${rpc} reports chain ${chainId}, not X Layer (196)`);

  const given: Partial<Roles> = {
    deployer: addressArg('deployer', args.deployer),
    treasury: addressArg('treasury', args.treasury),
    smokeHeir: addressArg('smoke-heir', args['smoke-heir']),
  };

  const dir = join(CONTRACTS, 'broadcast', 'atropyle-deploy', String(chainId));
  const progressFile = join(dir, 'progress.json');
  const saved = readProgress(progressFile);
  if (saved && saved.chainId !== chainId) stop(`${rel(progressFile)} belongs to chain ${saved.chainId}`);
  const merged = mergeRoles(given, saved?.roles ?? null);
  if (typeof merged === 'string') stop(merged);
  const roles: Roles = merged;
  const { deployer, treasury, smokeHeir } = roles;
  const progress: Progress = saved ?? { chainId, roles, values: {}, txs: {}, verified: [] };
  const save = () => writeProgress(progressFile, progress);

  const envFile = join(CONTRACTS, '.env');
  if (existsSync(envFile)) {
    const names = controlledNamesInEnvFile(readFileSync(envFile, 'utf8'));
    if (names.length > 0)
      stop(
        `contracts/.env sets ${names.join(', ')}. Forge loads that file itself, so the value would reach a stage. ` +
          'Remove those lines (OKLINK_API_KEY can stay).',
      );
  }

  const account = args.account as string;
  if (!rehearsal) {
    for (const [name, a] of [
      ['DEPLOYER', deployer],
      ['TREASURY', treasury],
      ['SMOKE_HEIR', smokeHeir],
    ] as const)
      if (ANVIL_ACCOUNTS.some((x) => isAddressEqual(x, a)))
        stop(`${name} ${a} is a public anvil test account: its private key is public`);
    // Only the keystore's name is looked up, never its content.
    const list = spawnSync('cast', ['wallet', 'list'], { encoding: 'utf8' });
    if (list.error) stop(`cannot run cast: ${list.error.message}`);
    const known = (list.stdout ?? '').split(/\r?\n/).some((l) => l.trim().split(/\s+/)[0] === account);
    if (!known && !existsSync(join(homedir(), '.foundry', 'keystores', account)))
      stop(
        `no Foundry keystore named ${account}. Create one first (cast asks for a new password):\n` +
          `  ${castCmd} wallet new ${account}\n` +
          'then send BEM and OKB to the address it prints and pass that address as --deployer.',
      );
  }

  // A stage an earlier run started and never finished: send it again only if it provably sent nothing.
  if (progress.pending) {
    const pending = progress.pending;
    const s = STAGES.find((x) => x.id === pending.stage) as Stage;
    if (!stageDone(s, progress.values) && (await sentSince(s, chainId, pending, client, deployer)))
      stop(pendingRefusal(s, chainId, progressFile));
    delete progress.pending;
    save();
  }

  const checkPlainEoa = async () => {
    const code = await client.getCode({ address: deployer });
    if (code && code !== '0x')
      stop(`DEPLOYER ${deployer} has code (${code.slice(0, 10)}…, EIP-7702?): use a plain EOA`);
  };
  await checkPlainEoa();
  const bem = await client.readContract({ address: BEM, abi: erc20Abi, functionName: 'balanceOf', args: [deployer] });
  const okb = await client.getBalance({ address: deployer });
  console.log(`\nX Layer chain ${chainId}${rehearsal ? ' (local anvil rehearsal)' : ''}, RPC ${rpc}`);
  console.log(`DEPLOYER   ${deployer}  ${formatUnits(bem, 8)} BEM, ${formatEther(okb)} OKB`);
  console.log(`TREASURY   ${treasury}  receives every vault fee. IMMUTABLE after stage 04: check it now.`);
  console.log(`SMOKE_HEIR ${smokeHeir}  heir of the test Drill vault made at stage 05`);
  if (!stageDone(STAGES[0], progress.values) && (bem < MIN_BEM || okb < MIN_OKB) && !args['skip-balance-check'])
    stop(
      `DEPLOYER needs at least 0.2 BEM and 0.02 OKB before stage 01; send them to ${deployer}. ` +
        'Only if stage 01 already ran in an earlier run whose progress file is lost, add --skip-balance-check: ' +
        'each forge script still checks the exact amounts it needs before it sends anything.',
    );

  const left = STAGES.filter((s) => !stageDone(s, progress.values));
  if (left.length > 0 && !stageDone(STAGES[3], progress.values)) {
    console.log('\nTreasury check (read-only fork test): every fee token must reach TREASURY…');
    const env = childEnv(process.env, roles, {}, { XLAYER_FORK_RPC: rpc });
    const t = await run(
      'forge',
      ['test', '--match-contract', 'ForkTest', '--match-test', 'test_treasuryReceivesEveryFeeToken', '-vv'],
      env,
    );
    const paid = t.out.match(/fee paid to treasury/g)?.length ?? 0;
    if (t.code !== 0 || paid !== 3 || !/\[PASS\]/.test(t.out))
      stop('the treasury check failed: a fee token refuses TREASURY. Choose another treasury wallet.');
  }

  if (left.length > 0) {
    if (!rehearsal) {
      console.log(`\nKeystore check: cast asks for the password of "${account}" (this script never sees it).`);
      const k = await run('cast', ['wallet', 'address', '--account', account], childEnv(process.env, roles, {}));
      const holds = k.out.match(/0x[0-9a-fA-F]{40}/)?.[0];
      if (k.code !== 0 || !holds || !isAddressEqual(holds as Address, deployer))
        stop(`keystore "${account}" did not unlock to DEPLOYER ${deployer}${holds ? ` (it holds ${holds})` : ''}`);
      console.log(`Keystore "${account}" unlocks to DEPLOYER.`);
    }
    console.log(`\nStages left: ${left.map((s) => s.script).join(', ')}`);
    if (!rehearsal) console.log(`Forge asks for the password of "${account}" once per stage.`);
    if (!confirm(`Type "deploy" to send them${rehearsal ? ' to the local anvil' : ' to X Layer mainnet'}: `, 'deploy'))
      stop('nothing sent');
  }

  const verify = async (s: Stage) => {
    await readBack(s, progress, client);
    if (!progress.verified.includes(s.id)) progress.verified.push(s.id);
    save();
    console.log(`Stage ${s.id} done and read back from the chain.`);
  };

  for (const s of STAGES) {
    if (stageDone(s, progress.values)) {
      // On chain from an earlier run, maybe never read back: read it now, never send it again.
      if (!progress.verified.includes(s.id)) await verify(s);
      continue;
    }
    for (const need of s.needs) if (progress.values[need] === undefined) stop(`stage ${s.id} needs ${need}`);
    // A forge record with no value in the progress file: the stage was sent outside it (by hand, or the file was
    // lost). Stage 01 has its own on-chain guard and recovery below.
    const record = recordPath(s, chainId);
    if (s.id !== '01' && !s.produces.some((n) => progress.values[n] !== undefined) && existsSync(record))
      stop(
        `${rel(record)} exists, so stage ${s.id} was sent before, outside ${rel(progressFile)}. Take its values ` +
          'from that record, add them to progress.json and run the same command again. If the record is from an ' +
          'abandoned attempt, move it out of broadcast/ first.',
      );
    await checkPlainEoa();

    console.log(`\n=== Stage ${s.id}: ${s.script} ===`);
    const nonce = await client.getTransactionCount({ address: deployer, blockTag: 'pending' });
    const pending = { stage: s.id, nonce, startedAt: Date.now() };
    progress.pending = pending;
    save();
    const signer = rehearsal ? ['--unlocked'] : ['--account', account];
    const forgeArgs = ['script', `script/${s.script}.s.sol`, '--rpc-url', rpc, '--sender', deployer, ...signer];
    forgeArgs.push('--broadcast', '--slow', ...(args.legacy ? ['--legacy'] : []));
    const r = await run('forge', forgeArgs, childEnv(process.env, roles, progress.values));

    if (r.code !== 0) {
      if (await sentSince(s, chainId, pending, client, deployer)) {
        keepRecord(s, chainId, dir, `.failed-${pending.startedAt}`);
        stop(pendingRefusal(s, chainId, progressFile));
      }
      delete progress.pending;
      save();
      const existing = s.id === '01' ? existingProcessor(r.out) : null;
      if (!existing)
        stop(`stage ${s.id} failed before sending anything. Fix the error above, then run the same command again.`);
      console.log(`\nDEPLOYER already made the Atropyle processor ${existing} in an earlier run.`);
      if (!confirm('Type "continue" to use it and go on with stage 02: ', 'continue'))
        stop('stopped. To abandon that processor, follow REPLACE_PROCESSOR in contracts/README.md.');
      progress.values.ATRO_CPU = existing;
    } else {
      progress.txs[s.id] = keepRecord(s, chainId, dir);
      const fix =
        'Take the values from the receipts (contracts/README.md, "Đọc lại từ chain sau mỗi bước"), add them to ' +
        `${rel(progressFile)}, then run the same command again.`;
      let found: Progress['values'];
      try {
        found = parseExports(r.out, s.produces);
      } catch (e) {
        save();
        stop(`stage ${s.id} is on chain, but its output could not be read: ${(e as Error).message}. ${fix}`);
      }
      // Saved before anything else can fail. "pending" stays until every value is known.
      Object.assign(progress.values, found);
      save();
      const missing = s.produces.filter((name) => found[name] === undefined);
      if (missing.length > 0) stop(`stage ${s.id} is on chain, but printed no value for ${missing.join(', ')}. ${fix}`);
      delete progress.pending;
    }
    save();
    await verify(s);
  }

  const exportsFile = join(dir, 'exports.env');
  writeFileSync(exportsFile, `${exportLines(roles, progress.values).join('\n')}\n`);
  console.log(`\nAll five stages are on chain. Values (also in ${rel(exportsFile)}):`);
  for (const line of exportLines(roles, progress.values)) console.log(`  ${line}`);

  console.log('\nRead-only ForkTest on the deployed contracts…');
  const f = await run(
    'forge',
    ['test', '--match-contract', 'ForkTest', '-vv'],
    childEnv(process.env, roles, progress.values, { XLAYER_FORK_RPC: rpc }),
  );
  if (f.code !== 0) stop('the deployment is on chain, but ForkTest failed on it: read the output above');
  console.log('\nForkTest passed on the deployed contracts.');
  console.log(`Progress, receipts and exports: ${rel(dir)}`);
  console.log('Back that folder up. Next: docs/deployments.md, OKLink verify, then npm run deployment:write.');
}

/**
 * Whether a stage that started at `p` sent anything: forge's record has a transaction hash written since, or the
 * deployer's nonce moved. The nonce is read three times, for a lagging RPC node. An unreadable record counts as sent.
 */
async function sentSince(
  s: Stage,
  chainId: number,
  p: NonNullable<Progress['pending']>,
  client: Client,
  deployer: Address,
): Promise<boolean> {
  const record = recordPath(s, chainId);
  try {
    if (existsSync(record) && statSync(record).mtimeMs >= p.startedAt - 2000) {
      const run = JSON.parse(readFileSync(record, 'utf8')) as { transactions?: { hash?: string | null }[] };
      if ((run.transactions ?? []).some((t) => t.hash)) return true;
    }
  } catch {
    return true;
  }
  for (let i = 0; i < 3; i++) {
    if ((await client.getTransactionCount({ address: deployer, blockTag: 'pending' })) !== p.nonce) return true;
    await sleep(2000);
  }
  return false;
}

function pendingRefusal(s: Stage, chainId: number, progressFile: string): string {
  return (
    `stage ${s.id} (${s.script}) sent transactions before it stopped, so this script will not send it again on ` +
    `its own. Check ${rel(recordPath(s, chainId))} and the receipts on the explorer, and read the notes for stage ` +
    `${s.id} in contracts/README.md. When you know the stage's values, add them to ${rel(progressFile)} and run ` +
    'the same command again: it reads them back from the chain. To send the rest of the stage instead, remove ' +
    '"pending" from that file first.'
  );
}

/**
 * Copies forge's run-latest.json for the stage next to the progress file and returns the stage's tx hashes.
 * A failure here only warns: the stage's values are saved first, and the record stays in forge's own folder.
 */
function keepRecord(s: Stage, chainId: number, dir: string, suffix = ''): string[] {
  const latest = recordPath(s, chainId);
  try {
    if (!existsSync(latest)) return [];
    mkdirSync(dir, { recursive: true });
    copyFileSync(latest, join(dir, `${s.script}${suffix}.json`));
    const run = JSON.parse(readFileSync(latest, 'utf8')) as { receipts?: { transactionHash: string }[] };
    return (run.receipts ?? []).map((r) => r.transactionHash);
  } catch (e) {
    console.warn(`Could not copy ${rel(latest)}: ${e instanceof Error ? e.message : String(e)}. Back it up by hand.`);
    return [];
  }
}

type Client = ReturnType<typeof createPublicClient>;

/** contracts/README.md, "Đọc lại từ chain sau mỗi bước". Retries for a lagging RPC node, then stops. */
async function readBack(s: Stage, p: Progress, client: Client): Promise<void> {
  const v = p.values;
  const me = p.roles.deployer;
  const cpu = v.ATRO_CPU as Address;
  const shape = async (id: string) =>
    (await client.readContract({ address: cpu, abi: cpuAbi, functionName: 'circuitInfo', args: [BigInt(id)] })).join(
      ' ',
    );
  const owner = (id: string) =>
    client.readContract({ address: cpu, abi: cpuAbi, functionName: 'ownerOf', args: [BigInt(id)] });
  const checks: Record<Stage['id'], () => Promise<string[]>> = {
    '01': async () => {
      const name = await client.readContract({ address: cpu, abi: cpuAbi, functionName: 'name' });
      const t = await client.readContract({ address: cpu, abi: cpuAbi, functionName: 'transistors' });
      const creator = await client.readContract({ address: t, abi: transistorsAbi, functionName: 'creator' });
      return [
        ...(name === 'Atropyle' ? [] : [`processor name is ${JSON.stringify(name)}`]),
        ...(isAddressEqual(creator, me) ? [] : [`processor creator is ${creator}`]),
      ];
    },
    '02': async () => {
      const out: string[] = [];
      if ((await shape(v.KOFN_ID as string)) !== '8 1 0 41') out.push(`KOFN_ID ${v.KOFN_ID} is not KofN5`);
      if ((await shape(v.GE4_ID as string)) !== '8 1 0 25') out.push(`GE4_ID ${v.GE4_ID} is not Ge4`);
      for (const id of [v.KOFN_ID, v.GE4_ID] as string[])
        if (!isAddressEqual(await owner(id), me)) out.push(`circuit ${id} is not owned by DEPLOYER`);
      return out;
    },
    '03': async () => {
      const out: string[] = [];
      if ((await shape(v.POLICY_ID as string)) !== '23 3 3 199') out.push(`POLICY_ID ${v.POLICY_ID} is not the policy`);
      if (!isAddressEqual(await owner(v.POLICY_ID as string), me)) out.push('the policy is not owned by DEPLOYER');
      return out;
    },
    '04': async () => {
      const f = v.ATRO_FACTORY as Address;
      const read = <N extends 'cpu' | 'policyId' | 'treasury' | 'vaultImpl'>(functionName: N) =>
        client.readContract({ address: f, abi: factoryAbi, functionName });
      const out: string[] = [];
      if (!isAddressEqual(await read('cpu'), cpu)) out.push('factory cpu() is not ATRO_CPU');
      if ((await read('policyId')).toString() !== v.POLICY_ID) out.push('factory policyId() is not POLICY_ID');
      if (!isAddressEqual(await read('treasury'), p.roles.treasury)) out.push('factory treasury() is not TREASURY');
      if (!isAddressEqual(await read('vaultImpl'), v.VAULT_IMPL as Address)) out.push('factory vaultImpl() differs');
      return out;
    },
    '05': async () => {
      const a = v.SMOKE_VAULT as Address;
      const drill = await client.readContract({ address: a, abi: vaultAbi, functionName: 'drill' });
      const state = await client.readContract({ address: a, abi: vaultAbi, functionName: 'state' });
      return [...(drill ? [] : ['smoke vault is not a Drill']), ...(state === 0 ? [] : [`smoke vault state ${state}`])];
    },
  };
  let problems: string[] = [];
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      problems = await checks[s.id]();
    } catch (e) {
      problems = [e instanceof Error ? e.message.split('\n')[0] : String(e)];
    }
    if (problems.length === 0) return;
    await new Promise((done) => setTimeout(done, 3000));
  }
  stop(
    `stage ${s.id} is on chain, but reading it back failed: ${problems.join('; ')}. Someone may have taped out ` +
      'in between. Take the real values from the receipts (contracts/README.md, "Đọc lại từ chain sau mỗi bước"), ' +
      'correct them in progress.json, then run the same command again: it reads the stage back and never sends it ' +
      'again.',
  );
}

main().catch((e: unknown) => {
  console.error(`\ndeploy-mainnet: ${e instanceof Error ? e.message : String(e)}`);
  // Not process.exit(): on Windows it aborts in libuv while fetch sockets are still closing.
  process.exitCode = 1;
});
