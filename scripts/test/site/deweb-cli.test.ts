import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { ANVIL_ACCOUNTS, type Anvil, rpc, startAnvil } from '../../lib/anvil';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONTAINER = '0x97abE83C61003674451C35441c02CC3D7ad2c1e3';
const NO_KEY = 'there is no key mode. Run --emit contracts/deweb-calls/<name>.json';
const HIDDEN = '<64-hex value, not shown>';
/** A made-up 64-hex value shaped like a private key (not a real or anvil key). */
const FAKE_KEY_HEX = 'ab'.repeat(32);
const FAKE_KEY = `0x${FAKE_KEY_HEX}`;

/** Runs `npm run deweb:<script> -- <args>` without npm, so the exit code is the script's own. */
function cli(script: string, args: string[]) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', `scripts/${script}.ts`, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 120_000,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
const publish = (args: string[]) => cli('deweb-publish', args);

/** Neither stream may show the made-up key. */
function expectHidden(r: { stdout: string; stderr: string }): void {
  expect(r.stdout + r.stderr).not.toContain(FAKE_KEY_HEX);
  expect(r.stdout + r.stderr).not.toMatch(/[0-9a-fA-F]{64}/);
}

const temps: string[] = [];
let siteDir = '';
let noSite = '';
beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'atropyle-deweb-cli-'));
  temps.push(dir);
  siteDir = join(dir, 'site');
  mkdirSync(siteDir);
  writeFileSync(join(siteDir, 'index.html'), '<!doctype html><title>cli</title>');
  noSite = join(dir, 'none.json');
});
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

test('--yes exits 2: there is no key mode', () => {
  const r = publish(['--yes']);
  expect(r.status).toBe(2);
  expect(r.stderr).toContain(`--yes: ${NO_KEY}`);
  expect(r.stdout).toBe('');
});

test('--key=<value> and --private-key=<value> exit 2 and never echo the value', () => {
  for (const arg of [`--key=${FAKE_KEY}`, `--private-key=${FAKE_KEY_HEX}`, '--yes=1']) {
    const r = publish([arg]);
    expect(r.status, arg).toBe(2);
    expect(r.stderr).toContain(`${arg.slice(0, arg.indexOf('='))}: ${NO_KEY}`);
    expectHidden(r);
  }
  // A key passed where an address or a flag belongs is hidden too.
  for (const args of [[FAKE_KEY], ['--container', FAKE_KEY], ['--private-key', FAKE_KEY]]) {
    const r = publish(args);
    expect(r.status, args[0]).toBe(2);
    expectHidden(r);
  }
  expect(publish([FAKE_KEY]).stderr.trim()).toBe(`unknown argument: ${HIDDEN}`);
});

test('deweb:site has no key mode either, and hides 64-hex values', () => {
  for (const args of [['--yes'], [`--key=${FAKE_KEY}`], ['--private-key', FAKE_KEY]]) {
    const r = cli('deweb-site', args);
    expect(r.status, args[0]).toBe(2);
    expect(r.stderr).toContain('there is no key mode; deweb:site only reads the chain and writes a file');
    expectHidden(r);
  }
  const unknown = cli('deweb-site', [FAKE_KEY_HEX]);
  expect(unknown.status).toBe(2);
  expect(unknown.stderr.trim()).toBe(`unknown argument: ${HIDDEN}`);
  const cpu = cli('deweb-site', ['--cpu', FAKE_KEY, '--token-id', '1']);
  expect(cpu.status).toBe(2);
  expect(cpu.stderr.trim()).toBe(`--cpu is not an address: ${HIDDEN}`);
  const token = cli('deweb-site', ['--cpu', CONTAINER, '--token-id', FAKE_KEY_HEX]);
  expect(token.status).toBe(2);
  expect(token.stderr.trim()).toBe(`--token-id must be a positive integer: ${HIDDEN}`);
});

test('--emit outside contracts/deweb-calls/ exits 2 and writes nothing', () => {
  const r = publish(['--emit', 'site-dist/calls.json']);
  expect(r.status).toBe(2);
  expect(r.stderr).toContain('--emit must be contracts/deweb-calls/<name>.json');
  expect(existsSync(join(ROOT, 'site-dist/calls.json'))).toBe(false);
});

test('--unlocked with a remote RPC exits 2 before it reads the chain', () => {
  const r = publish(['--unlocked', ANVIL_ACCOUNTS[0]]);
  expect(r.status).toBe(2);
  expect(r.stderr).toContain('--unlocked only sends to a local anvil');
});

describe('against a local anvil that reports chain 196', () => {
  let anvil: Anvil;
  beforeAll(async () => {
    anvil = await startAnvil({ chainId: 196 });
  }, 60_000);
  afterAll(async () => {
    await anvil?.stop();
  });

  test('--unlocked refuses a loopback RPC that is not chain 31337 and sends nothing', async () => {
    const r = publish([
      '--unlocked',
      ANVIL_ACCOUNTS[0],
      '--rpc',
      anvil.url,
      '--dir',
      siteDir,
      '--container',
      CONTAINER,
    ]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain(`refusing --unlocked: ${anvil.url} is chain 196`);
    expect(await rpc(anvil.url, 'eth_blockNumber')).toBe('0x0');
    expect(await rpc(anvil.url, 'eth_getTransactionCount', [ANVIL_ACCOUNTS[0], 'latest'])).toBe('0x0');
  });

  test('a dry run without a site file plans every file as new and sends nothing', async () => {
    const r = publish(['--rpc', anvil.url, '--dir', siteDir, '--site', noSite]);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split('\n');
    expect(lines[0]).toMatch(/^No .*none\.json yet: every file counts as new\.$/);
    expect(lines).toContain('new       index.html (33 B, 1 tx)');
    expect(lines).toContain('fallback  index.html');
    expect(lines.at(-1)).toBe(
      'Dry run: nothing was sent. To publish, run --emit contracts/deweb-calls/<name>.json and broadcast it with forge script (see docs/deployments.md).',
    );
    expect(lines.join('\n')).not.toContain('\\');
    expect(await rpc(anvil.url, 'eth_blockNumber')).toBe('0x0');
  });

  test('an error raised after parsing hides 64-hex values too', () => {
    const r = publish(['--rpc', anvil.url, '--dir', siteDir, '--site', noSite, '--fallback', FAKE_KEY]);
    expect(r.status).toBe(1);
    expect(r.stderr.trim()).toBe(`fallback ${HIDDEN} is not part of the site`);
    expectHidden(r);
  });

  test('--emit without a container exits 1 and writes nothing', () => {
    const file = 'contracts/deweb-calls/cli-test-no-container.json';
    const r = publish(['--emit', file, '--rpc', anvil.url, '--dir', siteDir, '--site', noSite]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('no container: pass --container, or run npm run deweb:site once the container is open');
    expect(existsSync(join(ROOT, file))).toBe(false);
  });
});
