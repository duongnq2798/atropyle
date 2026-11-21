// Runs only with XLAYER_FORK_RPC set, in Git Bash: XLAYER_FORK_RPC=https://rpc.xlayer.tech npm run test:site
// The fork runs on 127.0.0.1 and keeps chain id 196: the DeWEB opener derives container addresses from block.chainid,
// so under --chain-id 31337 the live container is not found. Only this test's own walletSender sends on the fork,
// as the impersonated circuit holder; the CLI's --unlocked refuses chain 196, and forge script only simulates.
// forge keeps its records in a temp folder (FOUNDRY_BROADCAST and --cache-path): contracts/broadcast and
// contracts/cache, where the user's own runs are, stay untouched.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  keccak256,
  parseAbi,
} from 'viem';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { type Anvil, rpc, startAnvil } from '../../lib/anvil';
import {
  callsParams,
  DEWEB,
  describeOp,
  EMIT_GAS_BUDGET,
  EMIT_MAX_BYTES,
  EMIT_OVERHEAD_GAS,
  executePlan,
  findCpuIndex,
  openerAbi,
  planPublish,
  REGISTRY_GAS_PER_BYTE,
  registryAbi,
  registryReader,
  type TxSender,
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
  let forgeDir = '';
  const temps: string[] = [];
  const emitted: string[] = [];
  const client = () => createPublicClient({ transport: http(anvil.url) });
  const sender = () => walletSender(createWalletClient({ transport: http(anvil.url) }), holder, client());

  beforeAll(async () => {
    const build = spawnSync('forge', ['build'], {
      cwd: join(ROOT, 'contracts'),
      encoding: 'utf8',
      windowsHide: true,
      timeout: 600_000,
    });
    if (build.status !== 0) throw new Error(`forge build failed:\n${build.stdout}\n${build.stderr}`);
    forgeDir = mkdtempSync(join(tmpdir(), 'atropyle-deweb-forge-'));
    temps.push(forgeDir);
    // The compiler cache of the build above, so forge script finds nothing to recompile.
    mkdirSync(join(forgeDir, 'cache'));
    copyFileSync(
      join(ROOT, 'contracts/cache/solidity-files-cache.json'),
      join(forgeDir, 'cache/solidity-files-cache.json'),
    );
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
    // Records each receipt, to measure the real registry's gas per data byte.
    const gasUsed: bigint[] = [];
    const inner = sender();
    const recording: TxSender = {
      send: (tx) => inner.send(tx),
      wait: async (hash) => {
        const receipt = await c.waitForTransactionReceipt({ hash });
        gasUsed.push(receipt.gasUsed);
        return receipt.status;
      },
    };
    expect(await executePlan(plan.ops, LIVE.container, recording)).toBe(plan.ops.length);

    // A full 24,000-byte chunk, receipt gas over its data bytes (intrinsic gas included, so this overstates the
    // share of a call inside the forge run). With the overhead measured on the mock, a cap-sized --emit file must
    // stay within half of forge's 2^30 gas.
    const full = plan.ops.findIndex((op) => op.kind === 'putFile' && op.data.length === 24_000);
    expect(describeOp(plan.ops[full])).toBe('putFile assets/big.js chunk 1/2 (24000 B)');
    const perByte = Number(gasUsed[full]) / 24_000;
    expect(perByte).toBeGreaterThan(150);
    expect(perByte).toBeLessThanOrEqual(REGISTRY_GAS_PER_BYTE);
    expect(EMIT_OVERHEAD_GAS + EMIT_MAX_BYTES * perByte).toBeLessThanOrEqual(EMIT_GAS_BUDGET);

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
    const hash = keccak256(readFileSync(join(ROOT, file)));
    expect(emit.stdout).toContain(`keccak256 of ${file}: ${hash}`);
    expect(emit.stdout).toContain(
      `DEWEB_CALLS=deweb-calls/${name} forge script script/07_DewebPublish.s.sol --sig 'show()' --rpc-url '${anvil.url}'`,
    );
    expect(emit.stdout).toContain(
      `DEWEB_CALLS=deweb-calls/${name} DEWEB_KECCAK=${hash} forge script script/07_DewebPublish.s.sol --rpc-url '${anvil.url}' --account atropyle-deployer --broadcast --slow`,
    );
    expect(await c.getTransactionCount({ address: holder })).toBe(nonce);
    const json = JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as { calls: Hex };
    expect(json).toMatchObject({
      chainId: 196,
      registry: DEWEB.registry,
      binding: DEWEB.binding,
      container: LIVE.container,
    });

    const forge = (args: string[]) => {
      const r = spawnSync(
        'forge',
        [
          'script',
          'script/07_DewebPublish.s.sol',
          '--rpc-url',
          anvil.url,
          '--cache-path',
          join(forgeDir, 'cache'),
          ...args,
        ],
        {
          cwd: join(ROOT, 'contracts'),
          env: {
            ...process.env,
            DEWEB_CALLS: `deweb-calls/${name}`,
            DEWEB_KECCAK: hash,
            FOUNDRY_BROADCAST: join(forgeDir, 'broadcast'),
          },
          encoding: 'utf8',
          windowsHide: true,
          timeout: 600_000,
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      expect(r.status, `${r.error ?? ''}\n${r.stdout.slice(-4000)}\n${r.stderr.slice(-4000)}`).toBe(0);
      expect(r.stdout).toContain('Script ran successfully.');
      expect(r.stdout).not.toMatch(/ONCHAIN EXECUTION COMPLETE/);
      return r.stdout;
    };
    // The check the user runs first: no key, no sender, nothing sent; it prints the keccak256 and every call.
    const shown = forge(['--sig', 'show()']);
    expect(shown).toContain(`file keccak256 ${hash}`);
    expect(shown).toContain('call 0: registry putFile assets/e.js');
    // The user's broadcast command as a simulation only (no --broadcast): its guard accepts the file and every
    // call succeeds against the real SiteRegistry when the holder sends it.
    expect(forge(['--sender', holder])).toContain(`file keccak256 ${hash}`);
    expect(await c.getTransactionCount({ address: holder })).toBe(nonce);
    expect(existsSync(join(forgeDir, 'broadcast/07_DewebPublish.s.sol/196/dry-run/run-latest.json'))).toBe(true);

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
