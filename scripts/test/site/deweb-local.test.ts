// The emit-and-forge path end to end on a local anvil (chain 31337): MockSiteRegistry sits at the real registry
// address (anvil_setCode), `deweb:publish --emit` writes the calls, the user's forge script broadcasts them from
// unlocked anvil account 0, and a second dry run has nothing to publish. Needs Foundry (anvil and forge) on PATH.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, getAddress, type Hex, hexToBytes, http, keccak256 } from 'viem';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { ANVIL_ACCOUNTS, type Anvil, rpc, startAnvil } from '../../lib/anvil';
import { DEWEB, EMIT_GAS_BUDGET, EMIT_OVERHEAD_GAS, registryReader } from '../../lib/deweb';
import { loadSite } from '../../lib/site-files';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONTRACTS = join(ROOT, 'contracts');
const CONTAINER = getAddress('0x97abe83c61003674451c35441c02cc3d7ad2c1e3');
const FROM = ANVIL_ACCOUNTS[0];

function publish(args: string[]) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/deweb-publish.ts', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/**
 * The user's forge script from contracts/, with the unlocked anvil account in place of --account
 * atropyle-deployer. forge keeps its broadcast and cache records in this test's temp folder, so contracts/broadcast
 * and contracts/cache are untouched. `hash` goes in DEWEB_KECCAK; undefined leaves the variable unset.
 */
function forge(name: string, hash: string | undefined, args: string[]) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DEWEB_CALLS: `deweb-calls/${name}`,
    FOUNDRY_BROADCAST: join(forgeDir, 'broadcast'),
  };
  delete env.DEWEB_KECCAK;
  if (hash !== undefined) env.DEWEB_KECCAK = hash;
  const base = ['script', 'script/07_DewebPublish.s.sol', '--rpc-url', anvil.url, '--unlocked', '--sender', FROM];
  const r = spawnSync('forge', [...base, '--cache-path', join(forgeDir, 'cache'), ...args], {
    cwd: CONTRACTS,
    env,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 600_000,
    // A failing run prints every trace, chunks included.
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, error: r.error };
}

/** The broadcast command --emit prints, run from the unlocked account. */
function broadcast(name: string, hash: string): string {
  const r = forge(name, hash, ['--broadcast', '--slow']);
  expect(r.status, `${r.error ?? ''}\n${r.stdout.slice(-4000)}\n${r.stderr.slice(-4000)}`).toBe(0);
  expect(r.stdout).toContain('ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.');
  return r.stdout;
}

/** Gas of the calls in forge's last broadcast record, without the intrinsic gas of each transaction. */
function callGasOfLastBroadcast(): number {
  const record = JSON.parse(
    readFileSync(join(forgeDir, 'broadcast/07_DewebPublish.s.sol/31337/run-latest.json'), 'utf8'),
  ) as {
    transactions: { hash: string; transaction: { input: Hex } }[];
    receipts: { transactionHash: string; gasUsed: Hex }[];
  };
  let total = 0;
  for (const t of record.transactions) {
    const receipt = record.receipts.find((r) => r.transactionHash === t.hash);
    if (!receipt) throw new Error(`no receipt for ${t.hash}`);
    let intrinsic = 21_000;
    for (const b of hexToBytes(t.transaction.input)) intrinsic += b === 0 ? 4 : 16;
    total += Number(BigInt(receipt.gasUsed)) - intrinsic;
  }
  return total;
}

/** The keccak256 line --emit prints, checked against the file on disk. */
function emittedKeccak(stdout: string, file: string): string {
  const hash = keccak256(readFileSync(join(ROOT, file)));
  expect(stdout).toContain(`keccak256 of ${file}: ${hash}`);
  return hash;
}

let anvil: Anvil;
let forgeDir = '';
let site = '';
let common: string[] = [];
const temps: string[] = [];
const emitted: string[] = [];

beforeAll(async () => {
  const build = spawnSync('forge', ['build'], {
    cwd: CONTRACTS,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 600_000,
  });
  if (build.status !== 0) throw new Error(`forge build failed:\n${build.stdout}\n${build.stderr}`);
  forgeDir = mkdtempSync(join(tmpdir(), 'atropyle-deweb-forge-'));
  temps.push(forgeDir);
  // The compiler cache of the build above, so forge script finds nothing to recompile.
  mkdirSync(join(forgeDir, 'cache'));
  copyFileSync(join(CONTRACTS, 'cache/solidity-files-cache.json'), join(forgeDir, 'cache/solidity-files-cache.json'));
  const artifact = JSON.parse(readFileSync(join(CONTRACTS, 'out/MockSiteRegistry.sol/MockSiteRegistry.json'), 'utf8'));
  anvil = await startAnvil();
  await rpc(anvil.url, 'anvil_setCode', [DEWEB.registry, artifact.deployedBytecode.object]);

  const dir = mkdtempSync(join(tmpdir(), 'atropyle-deweb-local-'));
  temps.push(dir);
  site = join(dir, 'site');
  mkdirSync(join(site, 'assets'), { recursive: true });
  mkdirSync(join(site, 'docs'));
  writeFileSync(join(site, 'index.html'), '<!doctype html><title>local</title><script src="./assets/e.js"></script>');
  writeFileSync(
    join(site, 'assets/e.js'),
    Uint8Array.from({ length: 26_000 }, (_, i) => (i * 7) % 251),
  );
  writeFileSync(join(site, 'docs/a.html'), '<h1>a</h1>');
  common = [
    '--rpc',
    anvil.url,
    '--container',
    CONTAINER,
    '--dir',
    site,
    '--site',
    join(dir, 'none.json'),
    '--fallback',
    'index.html',
  ];
}, 600_000);

afterAll(async () => {
  await anvil?.stop();
  for (const d of temps) rmSync(d, { recursive: true, force: true });
  for (const f of emitted) rmSync(f, { force: true });
});

test('--emit, then forge script --broadcast from the unlocked account, then the dry run has nothing to publish', async () => {
  const client = createPublicClient({ transport: http(anvil.url) });
  const name = `local-test-${process.pid}.json`;
  const file = `contracts/deweb-calls/${name}`;
  emitted.push(join(ROOT, file));

  const emit = publish(['--emit', file, ...common]);
  expect(emit.stderr).toBe('');
  expect(emit.status).toBe(0);
  expect(emit.stdout).toContain(`Wrote 5 call(s) to ${file} (chain 31337, container ${CONTAINER}). Nothing was sent.`);
  const hash = emittedKeccak(emit.stdout, file);
  expect(emit.stdout).toContain(
    `DEWEB_CALLS=deweb-calls/${name} forge script script/07_DewebPublish.s.sol --sig 'show()' --rpc-url '${anvil.url}'`,
  );
  expect(emit.stdout).toContain(
    `Compare its "file keccak256" with ${hash}. Type the keystore password below only if they are the same.`,
  );
  expect(emit.stdout).toContain(
    `DEWEB_CALLS=deweb-calls/${name} DEWEB_KECCAK=${hash} forge script script/07_DewebPublish.s.sol --rpc-url '${anvil.url}' --account atropyle-deployer --broadcast --slow`,
  );
  expect(emit.stdout).toContain(`After a successful broadcast, delete ${file}:`);
  expect(emit.stdout).toContain('use --unlocked --sender <address> instead of --account');
  expect(emit.stdout).toContain(
    `Then run npm run deweb:publish -- --dry-run ${common.join(' ').replaceAll('\\', '/')}`,
  );
  expect(JSON.parse(readFileSync(join(ROOT, file), 'utf8'))).toMatchObject({ chainId: 31337, container: CONTAINER });
  expect(await client.getTransactionCount({ address: FROM })).toBe(0);

  // The broadcast needs DEWEB_KECCAK, and sends nothing when the file is not the one the user checked.
  const missing = forge(name, undefined, ['--broadcast', '--slow']);
  expect(missing.status).not.toBe(0);
  expect(missing.stderr).toContain('NoExpectedHash()');
  const wrong = `0x${'00'.repeat(31)}01`;
  const mismatch = forge(name, wrong, ['--broadcast', '--slow']);
  expect(mismatch.status).not.toBe(0);
  expect(mismatch.stderr).toContain(`HashMismatch(${wrong}, ${hash})`);
  expect(await client.getTransactionCount({ address: FROM })).toBe(0);

  // The broadcast run prints the same keccak256 and one line per call before it sends anything.
  const sent = broadcast(name, hash);
  expect(sent).toContain(`file keccak256 ${hash}`);
  expect(sent).toContain('call 0: registry putFile assets/e.js');
  expect(sent).toContain('call 1: registry appendChunk assets/e.js');
  expect(sent).toContain('call 4: registry setFallback index.html');
  expect(sent.indexOf(`file keccak256 ${hash}`)).toBeLessThan(sent.indexOf('ONCHAIN EXECUTION COMPLETE'));
  expect(await client.getTransactionCount({ address: FROM })).toBe(5);

  const dry = publish(['--dry-run', ...common]);
  expect(dry.stderr).toBe('');
  expect(dry.status).toBe(0);
  expect(dry.stdout).toContain('Nothing to publish: the chain already has this site.');
  const reader = registryReader(client, CONTAINER);
  for (const f of loadSite(site)) expect(await reader.readRange(f.path, 0, f.bytes.length)).toEqual(f.bytes);
  expect(await reader.fallbackPath()).toBe('index.html');

  // With nothing left, --emit deletes the named file only when it is a calls file for this container and chain.
  const others = {
    'not-json': ['not json', 'it is not JSON'],
    'other-container': [
      JSON.stringify({ chainId: 31337, container: '0x632910a79EeE7fA99e99695510aA95dDee6ef771', calls: '0x' }),
      `it is not a calls file for container ${CONTAINER} on chain 31337`,
    ],
    'other-chain': [
      JSON.stringify({ chainId: 196, container: CONTAINER, calls: '0x' }),
      `it is not a calls file for container ${CONTAINER} on chain 31337`,
    ],
  };
  for (const [kind, [text, why]] of Object.entries(others)) {
    const other = `contracts/deweb-calls/local-test-${kind}-${process.pid}.json`;
    emitted.push(join(ROOT, other));
    writeFileSync(join(ROOT, other), text);
    const kept = publish(['--emit', other, ...common]);
    expect(kept.status, kind).toBe(0);
    expect(kept.stdout).toContain(`Kept ${other}: ${why}`);
    expect(existsSync(join(ROOT, other)), kind).toBe(true);
  }
  // The spent file is deleted, so it cannot be broadcast again by mistake.
  const again = publish(['--emit', file, ...common]);
  expect(again.stderr).toBe('');
  expect(again.status).toBe(0);
  expect(again.stdout).toContain('Nothing to publish: the chain already has this site.');
  expect(again.stdout).toContain(`Deleted ${file}: its calls are all on chain`);
  expect(existsSync(join(ROOT, file))).toBe(false);
  // forge wrote its records to the temp folder only.
  expect(existsSync(join(forgeDir, 'broadcast/07_DewebPublish.s.sol/31337/run-latest.json'))).toBe(true);
}, 600_000);

test('--unlocked publishes a change and --prune removes a dropped path, then the dry run is empty again', async () => {
  writeFileSync(
    join(site, 'index.html'),
    '<!doctype html><title>local v2</title><script src="./assets/e.js"></script>',
  );
  rmSync(join(site, 'docs'), { recursive: true });

  const plan = publish(['--prune', ...common]);
  expect(plan.status).toBe(0);
  expect(plan.stdout).toContain('remove    docs/a.html');
  expect(plan.stdout).toContain('2 transaction(s)');

  const sent = publish(['--unlocked', FROM, '--prune', ...common]);
  expect(sent.stderr).toBe('');
  expect(sent.status).toBe(0);
  expect(sent.stdout).toContain('[1/2] putFile index.html chunk 1/1');
  expect(sent.stdout).toContain('[2/2] removeFile docs/a.html');
  expect(sent.stdout).toContain(`Published 2 transaction(s) to ${CONTAINER}.`);

  const dry = publish(['--prune', ...common]);
  expect(dry.stdout).toContain('Nothing to publish: the chain already has this site.');
  const client = createPublicClient({ transport: http(anvil.url) });
  expect((await registryReader(client, CONTAINER).paths()).sort()).toEqual(['assets/e.js', 'index.html']);
}, 300_000);

test('a plan over 1 MB goes out in two --emit files, the second resuming the partial file', async () => {
  const big = Uint8Array.from({ length: 1_100_000 }, (_, i) => (i * 13) % 251);
  writeFileSync(join(site, 'assets/big.js'), big);
  const name = `local-test-parts-${process.pid}.json`;
  const file = `contracts/deweb-calls/${name}`;
  emitted.push(join(ROOT, file));

  // 46 chunks of new data: 41 fit in 1 MB (984,000 B), the 42nd would not.
  const first = publish(['--emit', file, ...common]);
  expect(first.status).toBe(0);
  expect(first.stdout).toContain('Wrote 41 call(s)');
  expect(first.stdout).toContain('That is part of the plan: 5 call(s) are left');
  expect(first.stdout).toContain('it should plan the 5 call(s) that are left.');
  expect(first.stdout).toContain(
    `After a successful broadcast, delete ${file}, then run --emit again for the next part`,
  );
  const firstHash = emittedKeccak(first.stdout, file);
  // This part is cap-sized: its whole forge run stays within EMIT_GAS_BUDGET (half of forge's 2^30), and the
  // script's own share (the run minus the registry calls) within EMIT_OVERHEAD_GAS.
  // A simulation with traces (no --broadcast): the top frame, `[gas] DewebPublish::run()`, is the whole run.
  const simulated = forge(name, firstHash, ['-vvvv']);
  expect(simulated.status, `${simulated.error ?? ''}\n${simulated.stderr.slice(-2000)}`).toBe(0);
  const runGas = Number(/\[(\d+)\] DewebPublish::run\(\)/.exec(simulated.stdout)?.[1]);
  expect(runGas).toBeGreaterThan(0);
  expect(runGas).toBeLessThanOrEqual(EMIT_GAS_BUDGET);
  expect(broadcast(name, firstHash)).toContain(`file keccak256 ${firstHash}`);
  const callGas = callGasOfLastBroadcast();
  expect(callGas).toBeGreaterThan(41 * 24_000 * 150);
  expect(runGas - callGas).toBeLessThanOrEqual(EMIT_OVERHEAD_GAS);

  const second = publish(['--emit', file, ...common]);
  expect(second.status).toBe(0);
  expect(second.stdout).toContain('resume    assets/big.js (1100000 B, 5 tx)');
  expect(second.stdout).toContain('Wrote 5 call(s)');
  expect(second.stdout).not.toContain('That is part of the plan');
  const secondHash = emittedKeccak(second.stdout, file);
  expect(secondHash).not.toBe(firstHash);
  expect(broadcast(name, secondHash)).toContain(`file keccak256 ${secondHash}`);

  expect(publish(['--dry-run', ...common]).stdout).toContain('Nothing to publish: the chain already has this site.');
  expect(existsSync(join(ROOT, file))).toBe(true);
  const done = publish(['--emit', file, ...common]);
  expect(done.stdout).toContain(`Deleted ${file}`);
  expect(existsSync(join(ROOT, file))).toBe(false);
  const reader = registryReader(createPublicClient({ transport: http(anvil.url) }), CONTAINER);
  for (let off = 0; off < big.length; off += 96_000) {
    expect(await reader.readRange('assets/big.js', off, 96_000)).toEqual(big.subarray(off, off + 96_000));
  }
}, 600_000);
