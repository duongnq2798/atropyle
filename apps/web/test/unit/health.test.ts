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
      // The balance is a wei amount as a decimal string, and nothing else.
      { ...GOOD, keeper: { ...GOOD.keeper, balance: '' } },
      { ...GOOD, keeper: { ...GOOD.keeper, balance: '1e18' } },
      { ...GOOD, keeper: { ...GOOD.keeper, balance: '-1' } },
      { ...GOOD, keeper: { ...GOOD.keeper, balance: '0x10' } },
      { ...GOOD, keeper: { ...GOOD.keeper, balance: ' 1' } },
      { ...GOOD, keeper: { ...GOOD.keeper, balance: '1'.repeat(41) } },
      { ...GOOD, keeper: { ...GOOD.keeper, balance: `1${'<b>x</b>'.repeat(1_000)}` } },
    ]) {
      expect(parseHealth(bad)).toBeNull();
    }
    for (const balance of ['0', '9'.repeat(40), null]) {
      expect(parseHealth({ ...GOOD, keeper: { ...GOOD.keeper, balance } })?.keeper.balance).toBe(balance);
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
    expect(seen[0].init).toMatchObject({
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    });
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

  const failure = async (p: Promise<unknown>) => {
    const e = await p.catch((x: unknown) => x);
    expect(e).toBeInstanceOf(AtropyleError);
    expect((e as AtropyleError).code).toBe('UNKNOWN');
    return (e as AtropyleError).message;
  };

  it('fetchHealth gives up after the timeout with an UNKNOWN error that says so', async () => {
    const hang = (_url: string, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    expect(await failure(fetchHealth('https://w.example.workers.dev', hang, 10))).toBe(
      'The Worker did not answer within 10 ms.',
    );
  });

  it('fetchHealth turns a network failure (a refused redirect is one) and a body that is not JSON into UNKNOWN errors', async () => {
    const offline = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await failure(fetchHealth('https://w.example.workers.dev', offline))).toBe(
      'Could not reach the Worker: Failed to fetch',
    );
    const notJson = async () => new Response('<html>Sign in</html>', { status: 200 });
    expect(await failure(fetchHealth('https://w.example.workers.dev', notJson))).toBe(
      'The Worker answered with an unexpected body.',
    );
  });
});
