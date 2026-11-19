import { custom } from 'viem';
import { describe, expect, it } from 'vitest';
import { createAtropyle } from '../../src/index';

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
