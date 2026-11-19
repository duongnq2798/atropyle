import { custom, getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { createAtropyle, stringify } from '../../src/index';

const parse = (s: string): unknown => JSON.parse(s);

describe('scanEvents options', () => {
  const atro = createAtropyle({
    chain: 'local',
    transport: custom({
      request: async () => {
        throw new Error('no RPC call is expected');
      },
    }),
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    'rejects maxBlocks %s before any RPC call',
    async (n) => {
      await expect(atro.scan({ maxBlocks: n })).rejects.toMatchObject({
        code: 'INVALID_OPTIONS',
        details: { path: 'maxBlocks' },
      });
    },
  );

  it('rejects resume together with fromBlock before any RPC call', async () => {
    await expect(atro.scan({ resume: { toBlock: 5n, vaults: [] }, fromBlock: 1n })).rejects.toMatchObject({
      code: 'INVALID_OPTIONS',
      details: { path: 'fromBlock' },
    });
  });
});

describe('cursors that went through JSON', () => {
  const atro = createAtropyle({
    chain: 'local',
    transport: custom({
      request: async () => {
        throw new Error('no RPC call is expected');
      },
    }),
  });
  const VAULT = '0x1111111111111111111111111111111111111111';

  it('scan resumes from a cursor written with stringify and parsed back', async () => {
    const stored = parse(stringify({ toBlock: 100n, vaults: [VAULT.toLowerCase()] }));
    expect((stored as { toBlock: unknown }).toBlock).toBe('100');
    const r = await atro.scan({ resume: stored as never, toBlock: 100n });
    expect(r.fromBlock).toBe(101n);
    expect(r.cursor).toEqual({ toBlock: 100n, vaults: [getAddress(VAULT)] });
  });

  it('stats resumes from a cursor written with stringify and parsed back', async () => {
    const cursor = { toBlock: 100n, vaults: [], aliveEvents: 3, alarms: 1, releases: 0, distributions: 2 };
    const r = await atro.stats({ resume: parse(stringify(cursor)) as never, toBlock: 100n });
    expect(r.toBlock).toBe(100n);
    expect(r.cursor).toEqual(cursor);
  });

  it.each([
    ['toBlock is not a number', { toBlock: 'soon', vaults: [] }],
    ['toBlock is negative', { toBlock: -1, vaults: [] }],
    ['vaults is missing', { toBlock: '5' }],
    ['a vault is not an address', { toBlock: '5', vaults: ['0x12'] }],
    ['the cursor is null', null],
  ])('scan rejects a malformed cursor (%s) as INVALID_OPTIONS', async (_n, resume) => {
    await expect(atro.scan({ resume: resume as never, toBlock: 10n })).rejects.toMatchObject({
      code: 'INVALID_OPTIONS',
    });
  });

  it('stats rejects a malformed cursor as INVALID_OPTIONS', async () => {
    await expect(atro.stats({ resume: { toBlock: '5', vaults: [] } as never, toBlock: 10n })).rejects.toMatchObject({
      code: 'INVALID_OPTIONS',
    });
  });
});
