import { fileURLToPath } from 'node:url';
import type { AtropyleError, Deployment } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { parseBinArgs } from '../../src/bin-args';

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
