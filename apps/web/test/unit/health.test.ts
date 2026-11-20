import { AtropyleError } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { fetchHealth, parseHealth } from '../../src/lib/health';

const GOOD = {
  schemaVersion: 1,
  status: 'ok',
  rpcs: [{ url: 'https://rpc.xlayer.tech', ok: true, ms: 41 }],
  lastCronAt: '2026-11-18T10:00:00.000Z',
  lastCronAgeSec: 30,
  cursorLagBlocks: 2,
  integrity: 'pass',
  keeper: { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', balance: '1000000000000000000', dryRun: false },
};

describe('health', () => {
  it('parseHealth keeps the fields of the contract and drops the rest', () => {
    expect(parseHealth({ ...GOOD, extra: '<script>', keeper: { ...GOOD.keeper, secret: 'x' } })).toEqual(GOOD);
    expect(
      parseHealth({ ...GOOD, lastCronAt: null, lastCronAgeSec: null, cursorLagBlocks: null })?.lastCronAt,
    ).toBeNull();
  });

  it('parseHealth rejects any other shape', () => {
    for (const bad of [
      null,
      'ok',
      { ...GOOD, schemaVersion: 2 },
      { ...GOOD, status: 'fine' },
      { ...GOOD, integrity: true },
      { ...GOOD, rpcs: 'none' },
      { ...GOOD, rpcs: [{ url: 'https://a', ok: 'yes', ms: 1 }] },
      { ...GOOD, lastCronAgeSec: '30' },
      { ...GOOD, keeper: { ...GOOD.keeper, dryRun: 'no' } },
    ]) {
      expect(parseHealth(bad)).toBeNull();
    }
  });

  it('fetchHealth asks /health without cookies or referrer and rejects a bad answer', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const answer = (status: number, body: unknown) => async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify(body), { status });
    };
    await expect(fetchHealth('https://w.example.workers.dev', answer(200, GOOD))).resolves.toEqual(GOOD);
    expect(seen[0].url).toBe('https://w.example.workers.dev/health');
    expect(seen[0].init).toMatchObject({ cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
    await expect(fetchHealth('https://w.example.workers.dev', answer(500, GOOD))).rejects.toThrow('HTTP 500');
    await expect(fetchHealth('https://w.example.workers.dev', answer(200, { status: 'ok' }))).rejects.toThrow(
      'unexpected body',
    );
  });

  it('fetchHealth failures are AtropyleError UNKNOWN and keep the HTTP status text', async () => {
    const bad = async () => new Response('{}', { status: 503 });
    const e = await fetchHealth('https://w.example.workers.dev', bad).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AtropyleError);
    expect((e as AtropyleError).code).toBe('UNKNOWN');
    expect((e as AtropyleError).message).toContain('HTTP 503');
  });

  it('fetchHealth gives up after the timeout', async () => {
    const hang = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    await expect(fetchHealth('https://w.example.workers.dev', hang, 10)).rejects.toThrow('aborted');
  });
});
