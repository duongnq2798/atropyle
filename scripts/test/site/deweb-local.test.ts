// The emit-and-forge path end to end on a local anvil (chain 31337): MockSiteRegistry sits at the real registry
// address (anvil_setCode), `deweb:publish --emit` writes the calls, the user's forge script broadcasts them from
// unlocked anvil account 0, and a second dry run has nothing to publish. Needs Foundry (anvil and forge) on PATH.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, getAddress, http } from 'viem';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { ANVIL_ACCOUNTS, type Anvil, rpc, startAnvil } from '../../lib/anvil';
import { DEWEB, registryReader } from '../../lib/deweb';
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

/** The user's command, with the unlocked anvil account in place of --account atropyle-deployer. */
function broadcast(name: string): void {
  const args = ['script', 'script/07_DewebPublish.s.sol', '--rpc-url', anvil.url, '--unlocked', '--sender', FROM];
  const r = spawnSync('forge', [...args, '--broadcast', '--slow'], {
    cwd: CONTRACTS,
    env: { ...process.env, DEWEB_CALLS: `deweb-calls/${name}` },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 600_000,
  });
  expect(r.status, `${r.stdout}\n${r.stderr}`).toBe(0);
  expect(r.stdout).toContain('ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.');
}

let anvil: Anvil;
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
  common = ['--rpc', anvil.url, '--container', CONTAINER, '--dir', site, '--site', join(dir, 'none.json')];
}, 600_000);

afterAll(async () => {
  await anvil?.stop();
  for (const d of temps) rmSync(d, { recursive: true, force: true });
  for (const f of emitted) rmSync(f, { force: true });
  // forge's records of these anvil broadcasts (chain 31337 only), and their folder when nothing else is in it.
  for (const d of ['broadcast', 'cache']) {
    const script = join(CONTRACTS, d, '07_DewebPublish.s.sol');
    rmSync(join(script, '31337'), { recursive: true, force: true });
    try {
      rmdirSync(script);
    } catch {
      // not empty, or already gone
    }
  }
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
  expect(emit.stdout).toContain(
    `DEWEB_CALLS=deweb-calls/${name} forge script script/07_DewebPublish.s.sol --rpc-url ${anvil.url} --account atropyle-deployer --broadcast --slow`,
  );
  expect(emit.stdout).toContain('use --unlocked --sender <address> instead of --account');
  expect(emit.stdout).toContain(
    `Then run npm run deweb:publish -- --dry-run ${common.join(' ').replaceAll('\\', '/')}`,
  );
  expect(JSON.parse(readFileSync(join(ROOT, file), 'utf8'))).toMatchObject({ chainId: 31337, container: CONTAINER });
  expect(await client.getTransactionCount({ address: FROM })).toBe(0);

  broadcast(name);
  expect(await client.getTransactionCount({ address: FROM })).toBe(5);

  const dry = publish(['--dry-run', ...common]);
  expect(dry.stderr).toBe('');
  expect(dry.status).toBe(0);
  expect(dry.stdout).toContain('Nothing to publish: the chain already has this site.');
  const reader = registryReader(client, CONTAINER);
  for (const f of loadSite(site)) expect(await reader.readRange(f.path, 0, f.bytes.length)).toEqual(f.bytes);
  expect(await reader.fallbackPath()).toBe('index.html');
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
  broadcast(name);

  const second = publish(['--emit', file, ...common]);
  expect(second.status).toBe(0);
  expect(second.stdout).toContain('resume    assets/big.js (1100000 B, 5 tx)');
  expect(second.stdout).toContain('Wrote 5 call(s)');
  expect(second.stdout).not.toContain('That is part of the plan');
  broadcast(name);

  expect(publish(['--dry-run', ...common]).stdout).toContain('Nothing to publish: the chain already has this site.');
  const reader = registryReader(createPublicClient({ transport: http(anvil.url) }), CONTAINER);
  for (let off = 0; off < big.length; off += 96_000) {
    expect(await reader.readRange('assets/big.js', off, 96_000)).toEqual(big.subarray(off, off + 96_000));
  }
}, 600_000);
