import { fileURLToPath } from 'node:url';
import type { AtropyleError, Deployment } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { parseBinArgs } from '../../src/bin-args';
import { errorOutput } from '../../src/ops/index';

const FIXTURE = fileURLToPath(new URL('../fixtures/deployment.json', import.meta.url));
const chainIs =
  (id: string): typeof fetch =>
  async () =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: id }), {
      headers: { 'content-type': 'application/json' },
    });
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: unknown) => (e as AtropyleError).code,
  );

describe('parseBinArgs', () => {
  it('handles --help and --version', async () => {
    expect(await parseBinArgs(['--help'], {})).toEqual({ kind: 'help' });
    expect(await parseBinArgs(['-h'], {})).toEqual({ kind: 'help' });
    expect(await parseBinArgs(['--version'], {})).toEqual({ kind: 'version' });
  });

  it('defaults to X Layer and reads ATROPYLE_CHAIN', async () => {
    expect(await parseBinArgs([], {})).toEqual({ kind: 'run', sdk: { chain: 'xlayer' } });
    expect(await parseBinArgs([], { ATROPYLE_CHAIN: 'local' })).toEqual({ kind: 'run', sdk: { chain: 'local' } });
    expect(await parseBinArgs(['--chain', 'xlayer'], { ATROPYLE_CHAIN: 'local' })).toEqual({
      kind: 'run',
      sdk: { chain: 'xlayer' },
    });
  });

  it('rejects unknown chains, unknown flags and bad URLs with INVALID_OPTIONS', async () => {
    expect(await codeOf(parseBinArgs(['--chain', 'mars'], {}))).toBe('INVALID_OPTIONS');
    expect(await codeOf(parseBinArgs(['--bogus'], {}))).toBe('INVALID_OPTIONS');
    expect(await codeOf(parseBinArgs(['extra'], {}))).toBe('INVALID_OPTIONS');
    expect(await codeOf(parseBinArgs(['--rpc', 'not a url', '--deployment', FIXTURE], {}))).toBe('INVALID_OPTIONS');
  });

  it('loads a deployment file, from the flag or ATROPYLE_DEPLOYMENT', async () => {
    for (const cmd of [
      await parseBinArgs(['--deployment', FIXTURE], {}),
      await parseBinArgs([], { ATROPYLE_DEPLOYMENT: FIXTURE }),
    ]) {
      expect(cmd.kind).toBe('run');
      if (cmd.kind === 'run') expect((cmd.sdk.chain as Deployment).chainId).toBe(31337);
    }
    expect(await codeOf(parseBinArgs(['--deployment', `${FIXTURE}.missing`], {}))).toBe('DEPLOYMENT_INVALID');
  });

  it('refuses an --rpc that serves another chain', async () => {
    const p = parseBinArgs(['--deployment', FIXTURE, '--rpc', 'http://127.0.0.1:9/'], {}, { fetch: chainIs('0xc4') });
    expect(await codeOf(p)).toBe('WRONG_CHAIN');
    const ok = await parseBinArgs(
      ['--deployment', FIXTURE, '--rpc', 'http://127.0.0.1:9/'],
      {},
      { fetch: chainIs('0x7a69') },
    );
    expect(ok.kind === 'run' && ok.sdk.transport).toBeTruthy();
  });

  it('treats empty environment values as unset', async () => {
    const env = { ATROPYLE_CHAIN: '', ATROPYLE_RPC: '', ATROPYLE_DEPLOYMENT: '' };
    expect(await parseBinArgs([], env)).toEqual({ kind: 'run', sdk: { chain: 'xlayer' } });
    // A bad chain name does not matter when a deployment file is given.
    const cmd = await parseBinArgs(['--chain', 'mars', '--deployment', FIXTURE], {});
    expect(cmd.kind === 'run' && (cmd.sdk.chain as Deployment).chainId).toBe(31337);
  });

  it('lets a deployment file win over --chain, and a flag win over the environment', async () => {
    const win = await parseBinArgs(['--chain', 'xlayer', '--deployment', FIXTURE], {});
    expect(win.kind === 'run' && (win.sdk.chain as Deployment).chainId).toBe(31337);
    const seen: string[] = [];
    const spy: typeof fetch = async (url, init) => {
      seen.push(String(url));
      return chainIs('0x7a69')(url, init);
    };
    await parseBinArgs(
      ['--deployment', FIXTURE, '--rpc', 'http://flag.test/'],
      { ATROPYLE_RPC: 'http://env.test/' },
      { fetch: spy },
    );
    expect(seen).toEqual(['http://flag.test/']);
    const bad = await codeOf(parseBinArgs(['--deployment', `${FIXTURE}.missing`], { ATROPYLE_DEPLOYMENT: FIXTURE }));
    expect(bad).toBe('DEPLOYMENT_INVALID');
  });

  it('never echoes an option value in a usage error', async () => {
    const e = (await parseBinArgs(['--bogus=https://host/v2/SECRETKEY'], {}).catch((x: unknown) => x)) as AtropyleError;
    expect(e.code).toBe('INVALID_OPTIONS');
    expect(JSON.stringify([e.message, e.hint, e.details])).not.toContain('SECRETKEY');
  });

  it('never echoes a URL given as the deployment file, and still names a plain file', async () => {
    const KEY_URL = 'https://rpc.example.test/key-abc';
    for (const [argv, env] of [
      [['--deployment', KEY_URL], {}],
      [[], { ATROPYLE_DEPLOYMENT: KEY_URL }],
    ] as const) {
      const e = await parseBinArgs(argv, env).catch((x: unknown) => x);
      const out = errorOutput(e);
      expect(out.error.code).toBe('DEPLOYMENT_INVALID');
      // bin.ts writes the summary to stderr; details go nowhere else.
      expect(JSON.stringify([out.summary, out.error.details])).not.toContain('key-abc');
    }
    const plain = errorOutput(await parseBinArgs(['--deployment', 'missing.json'], {}).catch((x: unknown) => x));
    expect(plain.summary).toContain('missing.json');
  });

  it('says once, without the URL, that a silent RPC will not stop the start', async () => {
    const down: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const lines: string[] = [];
    await parseBinArgs(
      ['--deployment', FIXTURE, '--rpc', 'https://host/v2/SECRETKEY'],
      {},
      { fetch: down, warn: (l) => lines.push(l) },
    );
    expect(lines).toEqual(['atropyle-mcp: the RPC did not answer; starting anyway']);
  });

  it('still starts when the --rpc does not answer yet', async () => {
    const down: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const cmd = await parseBinArgs(
      [],
      { ATROPYLE_RPC: 'http://127.0.0.1:9/', ATROPYLE_DEPLOYMENT: FIXTURE },
      { fetch: down },
    );
    expect(cmd.kind === 'run' && cmd.sdk.transport).toBeTruthy();
  });
});
