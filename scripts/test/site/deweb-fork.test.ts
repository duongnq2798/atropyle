// Runs only with XLAYER_FORK_RPC set, in Git Bash: XLAYER_FORK_RPC=https://rpc.xlayer.tech npm run test:site
// The fork runs on 127.0.0.1 and keeps chain id 196: the DeWEB opener derives container addresses from block.chainid,
// so under --chain-id 31337 the live container is not found. Only this test's own walletSender sends on the fork,
// as the impersonated circuit holder; the CLI's --unlocked refuses chain 196, and forge script only simulates.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type Address,
  createPublicClient,
  createWalletClient,
  decodeAbiParameters,
  getAddress,
  type Hex,
  hexToBytes,
  http,
  parseAbi,
} from 'viem';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { type Anvil, rpc, startAnvil } from '../../lib/anvil';
import {
  callsParams,
  DEWEB,
  executePlan,
  findCpuIndex,
  openerAbi,
  planPublish,
  registryAbi,
  registryReader,
  walletSender,
} from '../../lib/deweb';
import { loadSite, makeSiteFile } from '../../lib/site-files';

const FORK = process.env.XLAYER_FORK_RPC;
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
/** The live site 1.2.396.tape (read-only checks of 18/11/2026). */
const LIVE = {
  cpu: getAddress('0x632910a79eee7fa99e99695510aa95ddee6ef771'),
  container: getAddress('0x97abe83c61003674451c35441c02cc3d7ad2c1e3'),
  tokenId: 1n,
  cpuIndex: 396,
};
const erc721 = parseAbi(['function ownerOf(uint256 id) view returns (address)']);

function publish(args: string[]) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/deweb-publish.ts', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 300_000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe.skipIf(!FORK)('DeWEB on an X Layer fork', () => {
  let anvil: Anvil;
  let holder: Address;
  const temps: string[] = [];
  const emitted: string[] = [];
  const client = () => createPublicClient({ transport: http(anvil.url) });
  const sender = () => walletSender(createWalletClient({ transport: http(anvil.url) }), holder, client());

  beforeAll(async () => {
    anvil = await startAnvil({ forkUrl: FORK });
    holder = await client().readContract({
      address: LIVE.cpu,
      abi: erc721,
      functionName: 'ownerOf',
      args: [LIVE.tokenId],
    });
    await rpc(anvil.url, 'anvil_impersonateAccount', [holder]);
    await rpc(anvil.url, 'anvil_setBalance', [holder, '0x8ac7230489e80000']);
  }, 120_000);
  afterAll(async () => {
    await anvil?.stop();
    for (const d of temps) rmSync(d, { recursive: true, force: true });
    for (const f of emitted) rmSync(f, { force: true });
    // The simulation's record. A real broadcast would be in 196/run-latest.json: this never touches it, and the
    // folders above it go only when they are empty.
    for (const d of ['broadcast', 'cache']) {
      const script = join(ROOT, 'contracts', d, '07_DewebPublish.s.sol');
      rmSync(join(script, '196', 'dry-run'), { recursive: true, force: true });
      for (const empty of [join(script, '196'), script]) {
        try {
          rmdirSync(empty);
        } catch {
          // not empty, or already gone
        }
      }
    }
  });

  test('the opener and the factory index agree with the live site 1.2.396.tape', async () => {
    const c = client();
    expect(anvil.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(await c.getChainId()).toBe(196);
    expect(
      await c.readContract({
        address: DEWEB.opener,
        abi: openerAbi,
        functionName: 'accountOf',
        args: [LIVE.cpu, LIVE.tokenId],
      }),
    ).toBe(LIVE.container);
    expect(
      await c.readContract({
        address: DEWEB.registry,
        abi: registryAbi,
        functionName: 'isOpenedContainer',
        args: [LIVE.container],
      }),
    ).toBe(true);
    expect(await c.readContract({ address: DEWEB.registry, abi: registryAbi, functionName: 'CHUNK_MAX' })).toBe(
      24_000n,
    );
    expect(await findCpuIndex(c, LIVE.cpu)).toBe(LIVE.cpuIndex);
  }, 300_000);

  test('the circuit holder publishes a small site with no operator, and a second plan is empty', async () => {
    const c = client();
    const files = [
      makeSiteFile('index.html', new TextEncoder().encode('<!doctype html><title>fork</title>')),
      makeSiteFile(
        'assets/big.js',
        Uint8Array.from({ length: 30_000 }, (_, i) => i % 251),
      ),
    ];
    const reader = registryReader(c, LIVE.container);
    const opts = { prune: false, fallback: 'index.html' };
    const plan = await planPublish(files, reader, opts);
    expect(await executePlan(plan.ops, LIVE.container, sender())).toBe(plan.ops.length);

    for (const f of files) {
      const data = await c.readContract({
        address: DEWEB.registry,
        abi: registryAbi,
        functionName: 'read',
        args: [LIVE.container, f.path],
      });
      expect(hexToBytes(data)).toEqual(f.bytes);
      expect(await reader.fileInfo(f.path)).toEqual({
        size: f.bytes.length,
        contentType: f.contentType,
        sha256: f.sha256,
        chunkCount: f.chunks.length,
      });
    }
    // Checks the assumption that readRange takes (offset, length).
    expect(await reader.readRange('assets/big.js', 24_000, 6_000)).toEqual(files[1].bytes.subarray(24_000));
    // --prune depends on pathsRange.
    const paths = await reader.paths();
    expect(paths).toContain('index.html');
    expect(paths).toContain('assets/big.js');
    expect(await reader.fallbackPath()).toBe('index.html');
    expect((await planPublish(files, reader, opts)).ops).toEqual([]);
  }, 300_000);

  test('the CLI refuses --unlocked on chain 196; --emit writes calls that forge accepts and that publish the site', async () => {
    const c = client();
    const dir = mkdtempSync(join(tmpdir(), 'atropyle-deweb-fork-'));
    temps.push(dir);
    const site = join(dir, 'site');
    mkdirSync(join(site, 'assets'), { recursive: true });
    writeFileSync(join(site, 'index.html'), '<!doctype html><title>emit</title><script src="./assets/e.js"></script>');
    writeFileSync(
      join(site, 'assets/e.js'),
      Uint8Array.from({ length: 26_000 }, (_, i) => (i * 7) % 251),
    );
    const common = ['--rpc', anvil.url, '--container', LIVE.container, '--dir', site, '--site', join(dir, 'none.json')];

    const nonce = await c.getTransactionCount({ address: holder });
    const unlocked = publish(['--unlocked', holder, ...common]);
    expect(unlocked.status).toBe(2);
    expect(unlocked.stderr).toContain(`refusing --unlocked: ${anvil.url} is chain 196`);
    expect(await c.getTransactionCount({ address: holder })).toBe(nonce);

    const name = `fork-test-${process.pid}.json`;
    const file = `contracts/deweb-calls/${name}`;
    emitted.push(join(ROOT, file));
    const emit = publish(['--emit', file, ...common]);
    expect(emit.stderr).toBe('');
    expect(emit.status).toBe(0);
    // assets/e.js is two chunks and index.html one, plus setFallback when the test above did not run.
    expect(emit.stdout).toMatch(
      new RegExp(
        `Wrote [34] call\\(s\\) to ${file} \\(chain 196, container ${LIVE.container}\\)\\. Nothing was sent\\.`,
      ),
    );
    expect(emit.stdout).toContain(
      `DEWEB_CALLS=deweb-calls/${name} forge script script/07_DewebPublish.s.sol --rpc-url ${anvil.url} --account atropyle-deployer --broadcast --slow`,
    );
    expect(await c.getTransactionCount({ address: holder })).toBe(nonce);
    const json = JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as { calls: Hex };
    expect(json).toMatchObject({
      chainId: 196,
      registry: DEWEB.registry,
      binding: DEWEB.binding,
      container: LIVE.container,
    });

    // The user's forge script, as a simulation only (no --broadcast): its guard accepts the file and every call
    // succeeds against the real SiteRegistry when the holder sends it.
    const forge = spawnSync(
      'forge',
      ['script', 'script/07_DewebPublish.s.sol', '--rpc-url', anvil.url, '--sender', holder],
      {
        cwd: join(ROOT, 'contracts'),
        env: { ...process.env, DEWEB_CALLS: `deweb-calls/${name}` },
        encoding: 'utf8',
        windowsHide: true,
        timeout: 600_000,
      },
    );
    expect(forge.status, `${forge.stdout}\n${forge.stderr}`).toBe(0);
    expect(forge.stdout).toContain('Script ran successfully.');
    expect(forge.stdout).not.toMatch(/ONCHAIN EXECUTION COMPLETE/);
    expect(await c.getTransactionCount({ address: holder })).toBe(nonce);

    // The fork stands in for the holder's wallet: send the file's calls exactly as written.
    const [calls] = decodeAbiParameters(callsParams, json.calls);
    const s = sender();
    for (const call of calls) {
      expect(call.to).toBe(DEWEB.registry);
      expect(call.value).toBe(0n);
      expect(await s.wait(await s.send({ to: call.to, data: call.data }))).toBe('success');
    }
    const dry = publish(['--dry-run', ...common]);
    expect(dry.stderr).toBe('');
    expect(dry.stdout).toContain('Nothing to publish: the chain already has this site.');
    const reader = registryReader(c, LIVE.container);
    for (const f of loadSite(site)) expect(await reader.readRange(f.path, 0, f.bytes.length)).toEqual(f.bytes);
  }, 900_000);
});
