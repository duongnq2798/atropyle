import { createPublicClient, custom, encodeErrorResult, type Transport } from 'viem';
import { describe, expect, it } from 'vitest';
import { vaultAbi } from '../../src/abi/index';
import { decodeError } from '../../src/index';
import { quorumTransport } from '../../src/verify/quorum';

type Handler = (method: string, params: unknown[]) => unknown;

function fake(handler: Handler): { transport: Transport; calls: string[] } {
  const calls: string[] = [];
  const transport = custom({
    async request({ method, params }: { method: string; params?: unknown }) {
      calls.push(method);
      return handler(method, (params ?? []) as unknown[]);
    },
  });
  return { transport, calls };
}

const call = (block: string) => ({
  method: 'eth_call',
  params: [{ to: '0x0000000000000000000000000000000000000001', data: '0x' }, block],
});
const revert = (data: string) => Object.assign(new Error('execution reverted'), { code: 3, data });

async function run(a: Handler, b: Handler, req: { method: string; params: unknown[] }) {
  const x = fake(a);
  const y = fake(b);
  const client = createPublicClient({
    transport: quorumTransport([x.transport, y.transport], { retries: 2, retryDelayMs: 1 }),
  });
  try {
    return { value: await client.request(req as never), x, y };
  } catch (e) {
    return { error: decodeError(e), x, y };
  }
}

describe('quorumTransport', () => {
  it('returns the value when both operators agree, and takes the block number from the first one', async () => {
    const r = await run(
      () => '0xaa',
      () => '0xAA',
      call('0x10'),
    );
    expect(r.value).toBe('0xaa');
    const n = await run(
      () => '0x10',
      () => '0x0f',
      { method: 'eth_blockNumber', params: [] },
    );
    expect(n.value).toBe('0x10');
    expect(n.y.calls).toEqual([]);
  });

  it('reports RPC_DISAGREEMENT when the results differ', async () => {
    const r = await run(
      () => '0xaa',
      () => '0xbb',
      call('0x10'),
    );
    expect(r.error?.code).toBe('RPC_DISAGREEMENT');
  });

  it('retries an operator that lags, then reports QUORUM_UNAVAILABLE if it never answers', async () => {
    let tries = 0;
    const lagging = await run(
      () => '0xaa',
      () => {
        tries++;
        if (tries < 2) throw new Error('header not found');
        return '0xaa';
      },
      call('0x10'),
    );
    expect(lagging.value).toBe('0xaa');
    const dead = await run(
      () => '0xaa',
      () => {
        throw new Error('fetch failed');
      },
      call('0x10'),
    );
    expect(dead.error?.code).toBe('QUORUM_UNAVAILABLE');
    expect(dead.y.calls).toHaveLength(3);
  });

  it('refuses reads that are not pinned to a block number', async () => {
    const r = await run(
      () => '0xaa',
      () => '0xaa',
      call('latest'),
    );
    expect(r.error?.code).toBe('INVALID_OPTIONS');
    expect(r.x.calls).toEqual([]);
  });

  it('passes an identical revert through and flags different reverts', async () => {
    const same = await run(
      () => {
        throw revert('0xdeadbeef');
      },
      () => {
        throw revert('0xdeadbeef');
      },
      call('0x10'),
    );
    expect(same.error?.code).not.toBe('RPC_DISAGREEMENT');
    expect(same.error?.code).not.toBe('QUORUM_UNAVAILABLE');
    const diff = await run(
      () => {
        throw revert('0xdeadbeef');
      },
      () => {
        throw revert('0x00');
      },
      call('0x10'),
    );
    expect(diff.error?.code).toBe('RPC_DISAGREEMENT');
  });

  it('compares blocks by hash only', async () => {
    const block = (extra: object) => ({ hash: '0xabc', number: '0x10', ...extra });
    const r = await run(
      () => block({ totalDifficulty: '0x0' }),
      () => block({ mixHash: '0x1' }),
      { method: 'eth_getBlockByNumber', params: ['0x10', false] },
    );
    expect(r.value).toMatchObject({ hash: '0xabc' });
    const d = await run(
      () => block({}),
      () => ({ ...block({}), hash: '0xdef' }),
      { method: 'eth_getBlockByNumber', params: ['0x10', false] },
    );
    expect(d.error?.code).toBe('RPC_DISAGREEMENT');
  });

  it('does not take a backend -32603 for a revert', async () => {
    const backend = Object.assign(new Error('internal error'), { code: -32603 });
    const r = await run(
      () => '0xaa',
      () => {
        throw backend;
      },
      call('0x10'),
    );
    expect(r.error?.code).toBe('QUORUM_UNAVAILABLE');
  });

  it('keeps the revert data of an identical revert, so the error still decodes', async () => {
    const data = encodeErrorResult({ abi: vaultAbi, errorName: 'NotOwner' });
    const r = await run(
      () => {
        throw revert(data);
      },
      () => {
        throw revert(data);
      },
      call('0x10'),
    );
    expect(r.error?.code).toBe('NOT_OWNER');
  });

  it('flags one operator that answers while the other reverts', async () => {
    const r = await run(
      () => '0xaa',
      () => {
        throw revert('0xdeadbeef');
      },
      call('0x10'),
    );
    expect(r.error?.code).toBe('RPC_DISAGREEMENT');
  });

  it('retries a null block from a lagging operator, then reports QUORUM_UNAVAILABLE if it stays null', async () => {
    const block = { hash: '0xabc', number: '0x10', timestamp: '0x64' };
    const req = { method: 'eth_getBlockByNumber', params: ['0x10', false] };
    let tries = 0;
    const lagging = await run(
      () => block,
      () => (tries++ < 1 ? null : block),
      req,
    );
    expect(lagging.value).toMatchObject({ hash: '0xabc' });
    expect(lagging.y.calls).toHaveLength(2);
    const never = await run(
      () => block,
      () => null,
      req,
    );
    expect(never.error?.code).toBe('QUORUM_UNAVAILABLE');
    expect(never.y.calls).toHaveLength(3);
    expect(never.error?.details).toMatchObject({ operator: 2 });
    expect(never.error?.message).toContain('#2');
  });

  it('compares the timestamp of a block, not only its hash', async () => {
    const block = (timestamp: string) => ({ hash: '0xabc', number: '0x10', timestamp });
    const req = { method: 'eth_getBlockByNumber', params: ['0x10', false] };
    const r = await run(
      () => block('0x64'),
      () => block('0x65'),
      req,
    );
    expect(r.error?.code).toBe('RPC_DISAGREEMENT');
    const same = await run(
      () => block('0x64'),
      () => block('0x064'),
      req,
    );
    expect(same.value).toMatchObject({ hash: '0xabc' });
  });

  it('refuses unpinned block and storage reads, and any method it cannot compare', async () => {
    for (const req of [
      { method: 'eth_getBlockByNumber', params: ['latest', false] },
      { method: 'eth_getStorageAt', params: ['0x0000000000000000000000000000000000000001', '0x0', 'latest'] },
      { method: 'eth_getLogs', params: [{}] },
    ]) {
      const r = await run(
        () => '0xaa',
        () => '0xaa',
        req,
      );
      expect(r.error?.code).toBe('INVALID_OPTIONS');
      expect(r.x.calls).toEqual([]);
    }
  });
});
