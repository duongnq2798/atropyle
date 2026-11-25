import { type IntegrityReport, VERSION } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { buildDiagnostics, pageUrl, probeRpc } from '../../src/lib/diagnostics';

const REPORT: IntegrityReport = {
  ok: false,
  chainId: 196,
  blockNumber: 123n,
  blockTimestamp: 1_000n,
  rpcs: 1,
  checks: [
    { name: 'factory.cpu', ok: true },
    { name: 'vaultImpl.codehash', ok: false, expected: '0xab', actual: '0xcd' },
  ],
  warnings: [{ code: 'SINGLE_RPC', message: 'Only one RPC operator was used.' }] as IntegrityReport['warnings'],
};

const base = {
  appVersion: '1.2.3',
  target: 'deweb' as const,
  href: 'https://4-2-1.tapekit.org/?ref=x#/sign?p=c2VjcmV0',
  chainId: 196,
  integrity: REPORT,
  integrityError: null,
  probes: [{ url: 'https://rpc.xlayer.tech', ok: true, ms: 42, block: 123n, error: null }],
  wallets: ['OKX Wallet', '\u{202E}evil'],
  crossCheck: false,
  lang: 'vi' as const,
};

describe('diagnostics', () => {
  it('pageUrl drops the query and the hash', () => {
    expect(pageUrl('https://duongnq2798.github.io/atropyle/?a=1#/sign?p=abc')).toBe(
      'https://duongnq2798.github.io/atropyle/',
    );
  });

  it('probeRpc times a good node and reports a dead one', async () => {
    const ticks = [10, 52];
    const now = () => ticks.shift() ?? 0;
    expect(await probeRpc('https://a', async () => 7n, now)).toEqual({
      url: 'https://a',
      ok: true,
      ms: 42,
      block: 7n,
      error: null,
    });
    expect(
      await probeRpc('https://b', async () => {
        throw new Error('down');
      }),
    ).toEqual({ url: 'https://b', ok: false, ms: null, block: null, error: 'UNKNOWN' });
  });

  it('buildDiagnostics has only the agreed fields and no wallet address or hash', () => {
    const text = buildDiagnostics(base);
    const d = JSON.parse(text);
    expect(Object.keys(d)).toEqual([
      'app',
      'sdk',
      'target',
      'page',
      'chainId',
      'block',
      'rpcs',
      'integrity',
      'wallets',
      'crossCheck',
      'lang',
    ]);
    expect(d).toMatchObject({
      app: '1.2.3',
      sdk: VERSION,
      target: 'deweb',
      page: 'https://4-2-1.tapekit.org/',
      chainId: 196,
      block: '123',
      rpcs: [{ url: 'https://rpc.xlayer.tech', ok: true, ms: 42, block: '123', error: null }],
      integrity: { ok: false, rpcs: 1, failed: ['vaultImpl.codehash'], warnings: ['SINGLE_RPC'] },
      wallets: ['OKX Wallet', 'evil'],
      crossCheck: false,
      lang: 'vi',
    });
    expect(text).not.toContain('#');
    expect(text).not.toContain('c2VjcmV0');
    expect(text).not.toMatch(/0x[0-9a-fA-F]{40}/);
    const failed = JSON.parse(
      buildDiagnostics({ ...base, integrity: null, integrityError: new Error('boom'), probes: null }),
    );
    expect(failed).toMatchObject({ block: null, rpcs: [], integrity: { error: 'UNKNOWN' } });
  });
});
