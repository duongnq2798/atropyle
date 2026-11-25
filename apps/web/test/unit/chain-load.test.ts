import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.doUnmock('../../src/chain/impl');
  vi.resetModules();
});

describe('loadChainImpl', () => {
  it('loads the chunk once, and again after a request that failed', async () => {
    let requests = 0;
    vi.doMock('../../src/chain/impl', () => {
      requests += 1;
      if (requests === 1) throw new TypeError('Failed to fetch dynamically imported module');
      return { marker: 'impl' };
    });
    const { loadChainImpl, peekChainImpl } = await import('../../src/chain/load');
    expect(peekChainImpl()).toBeNull();
    await expect(loadChainImpl()).rejects.toThrow();
    expect(peekChainImpl()).toBeNull();
    const impl = await loadChainImpl();
    expect(impl).toMatchObject({ marker: 'impl' });
    expect(peekChainImpl()).toBe(impl);
    expect(loadChainImpl()).toBe(loadChainImpl());
    expect(await loadChainImpl()).toBe(impl);
    expect(requests).toBe(2);
  });
});
