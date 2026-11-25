import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KEYS, type KV, memoryKV } from '../../src/lib/store';
import { loadWalletImpl } from '../../src/wallet/load';
import { useWallet } from '../../src/wallet/provider';
import type { WalletOption, WalletWindow } from '../../src/wallet/types';
import { makeWrapper } from '../helpers/render';
import { type FakeWallet, fakeWallet, walletWindow } from '../helpers/wallet';
import { PEOPLE } from './fixtures';

// The SDK the wallet needs for switchChain and walletClient: only its chain, built from the fixture deployment.
vi.mock('../../src/chain/load', async () => {
  const { chainOf } = await import('@atropyle/sdk');
  const { fixtureDeployment } = await import('./fixtures');
  const impl = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: (deployment: ReturnType<typeof fixtureDeployment>) => ({
      atro: { chain: chainOf(deployment) },
      deployment,
    }),
  };
  return { loadChainImpl: async () => impl, peekChainImpl: () => impl };
});

const OKX = { uuid: 'uuid-1', name: 'OKX Wallet', rdns: 'com.okex.wallet', icon: '' };
const OTHER = { uuid: 'uuid-3', name: 'Other wallet', rdns: 'org.example.wallet', icon: '' };
const REMEMBERED = JSON.stringify({ rdns: 'com.okex.wallet', source: 'eip6963', name: 'OKX Wallet' });
// Discovery listens for EIP-6963 answers for 250 ms.
const SLOW = { timeout: 2000 };

/**
 * An async act() as a real Promise. React's act() returns a thenable whose then() returns undefined, so
 * `expect(act(...)).rejects` has nothing to wait for and passes whatever the callback does.
 */
function settled<T>(callback: () => Promise<T>): Promise<T> {
  return Promise.resolve(act(callback));
}

function byRdns(list: readonly WalletOption[], rdns: string): WalletOption {
  const found = list.find((w) => w.rdns === rdns);
  if (!found) throw new Error(`no wallet ${rdns}`);
  return found;
}

/** Holds the wallet's answer to `method` until the test releases it; `reached()` says whether the page asked yet. */
function hold(fake: FakeWallet, method: string) {
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  let asked = false;
  const answer = fake.provider.request.bind(fake.provider);
  fake.provider.request = async (args) => {
    if (args.method === method) {
      asked = true;
      await gate;
    }
    return answer(args);
  };
  return Object.assign(() => open(), { reached: () => asked });
}

function setup(o: { kv?: KV; win?: WalletWindow } = {}) {
  const { wrapper, kv } = makeWrapper(o);
  return { ...renderHook(() => useWallet(), { wrapper }), kv };
}

async function connected(fake: FakeWallet, kv: KV = memoryKV()) {
  const h = setup({ kv, win: walletWindow([{ info: OKX, provider: fake.provider }]) });
  const list = await act(() => h.result.current.discover());
  await act(() => h.result.current.connect(list[0]));
  return h;
}

describe('WalletProvider', () => {
  it('connects, remembers the wallet by rdns and reconnects silently on the next visit', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner.toLowerCase()] });
    const kv = memoryKV();
    const first = await connected(fake, kv);
    expect(first.result.current.status).toBe('connected');
    expect(first.result.current.wallet).toMatchObject({ account: PEOPLE.owner, chainId: 196 });
    expect(kv.get(KEYS.wallet)).toBe(REMEMBERED);
    first.unmount();

    // The next page load: EIP-6963 hands out a new uuid, the rdns stays.
    const win = walletWindow([{ info: { ...OKX, uuid: 'uuid-2' }, provider: fake.provider }]);
    const next = setup({ kv, win });
    expect(next.result.current.status).toBe('restoring');
    await waitFor(() => expect(next.result.current.status).toBe('connected'), SLOW);
    expect(next.result.current.wallet?.account).toBe(PEOPLE.owner);
    expect(fake.calls.filter((m) => m === 'eth_requestAccounts')).toHaveLength(1);
  });

  it('restore ignores a remembered wallet that is gone', async () => {
    const kv = memoryKV();
    kv.set(KEYS.wallet, JSON.stringify({ rdns: 'io.metamask', source: 'eip6963', name: 'MetaMask' }));
    const gone = setup({ kv, win: walletWindow() });
    await waitFor(() => expect(gone.result.current.status).toBe('idle'), SLOW);
    expect(gone.result.current.wallet).toBeNull();
    expect(kv.get(KEYS.wallet)).toBeNull();
    gone.unmount();

    kv.set(KEYS.wallet, '{"rdns":');
    const garbage = setup({ kv, win: walletWindow() });
    expect(garbage.result.current.status).toBe('idle');
    expect(kv.get(KEYS.wallet)).toBeNull();
  });

  it('restore never prompts: a locked wallet stays disconnected and remembered', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner], shared: false });
    const kv = memoryKV();
    kv.set(KEYS.wallet, REMEMBERED);
    const h = setup({ kv, win: walletWindow([{ info: OKX, provider: fake.provider }]) });
    await waitFor(() => expect(h.result.current.status).toBe('idle'), SLOW);
    expect(fake.calls).toEqual(['eth_accounts']);
    expect(kv.get(KEYS.wallet)).toBe(REMEMBERED);
  });

  it('wallet events update the account and chain and drop garbage', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner] });
    const h = await connected(fake);
    await waitFor(() => expect(fake.listenerCount('accountsChanged')).toBe(1));

    act(() => fake.emit('accountsChanged', [PEOPLE.heirA.toLowerCase()]));
    expect(h.result.current.wallet?.account).toBe(PEOPLE.heirA);

    act(() => fake.emit('chainChanged', '0x1'));
    expect(h.result.current.wallet?.chainId).toBe(1);
    expect(h.result.current.wrongChain).toBe(true);

    act(() => fake.emit('chainChanged', 'not a chain'));
    expect(h.result.current.wallet?.chainId).toBe(1);

    act(() => fake.emit('disconnect', { code: 1013, message: 'Disconnected from chain. Attempting to connect.' }));
    expect(h.result.current.status).toBe('connected');

    act(() => fake.emit('accountsChanged', [42]));
    expect(h.result.current.wallet).toBeNull();
    expect(h.result.current.status).toBe('idle');
    expect(fake.listenerCount('accountsChanged')).toBe(0);
  });

  it('switches the wallet to the chain of this build', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner], chainId: 1 });
    const h = await connected(fake);
    expect(h.result.current.wrongChain).toBe(true);
    await act(() => h.result.current.switchChain());
    expect(h.result.current.wallet?.chainId).toBe(196);
    expect(h.result.current.wrongChain).toBe(false);
    expect(fake.calls).toContain('wallet_switchEthereumChain');
  });

  it('hands out a wallet client only while connected, and forgets the wallet on disconnect', async () => {
    const kv = memoryKV();
    const h = await connected(fakeWallet({ accounts: [PEOPLE.owner] }), kv);
    const client = await act(() => h.result.current.walletClient());
    expect(client.account?.address).toBe(PEOPLE.owner);

    act(() => h.result.current.disconnect());
    expect(h.result.current.status).toBe('idle');
    expect(kv.get(KEYS.wallet)).toBeNull();
    await expect(h.result.current.walletClient()).rejects.toMatchObject({ code: 'WRONG_ACCOUNT' });
  });

  it('stops listening to the wallet when the page unmounts', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner] });
    const h = await connected(fake);
    await waitFor(() => expect(fake.listenerCount('accountsChanged')).toBe(1));
    h.unmount();
    for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) expect(fake.listenerCount(event)).toBe(0);
  });

  it('a wallet that never answers ends the restore after a few seconds, still remembered', async () => {
    // The chunk is loaded before the clock is faked: only the wallet hangs here.
    await loadWalletImpl();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const fake = fakeWallet({ accounts: [PEOPLE.owner], shared: true });
      hold(fake, 'eth_accounts');
      const kv = memoryKV();
      kv.set(KEYS.wallet, REMEMBERED);
      const h = setup({ kv, win: walletWindow([{ info: OKX, provider: fake.provider }]) });
      await act(() => vi.advanceTimersByTimeAsync(1000));
      expect(h.result.current.status).toBe('restoring');
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(h.result.current.status).toBe('idle');
      expect(h.result.current.wallet).toBeNull();
      expect(kv.get(KEYS.wallet)).toBe(REMEMBERED);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a slow restore never replaces the wallet the user chose meanwhile', async () => {
    const remembered = fakeWallet({ accounts: [PEOPLE.owner], shared: true });
    const release = hold(remembered, 'eth_accounts');
    const chosen = fakeWallet({ accounts: [PEOPLE.heirA] });
    const kv = memoryKV();
    kv.set(KEYS.wallet, REMEMBERED);
    const h = setup({
      kv,
      win: walletWindow([
        { info: OKX, provider: remembered.provider },
        { info: OTHER, provider: chosen.provider },
      ]),
    });
    const list = await act(() => h.result.current.discover());
    await waitFor(() => expect(release.reached()).toBe(true), SLOW);
    await act(() => h.result.current.connect(byRdns(list, OTHER.rdns)));
    expect(h.result.current.wallet?.account).toBe(PEOPLE.heirA);

    // The remembered wallet answers at last: too late, the user has chosen.
    release();
    await waitFor(() => expect(remembered.calls).toContain('eth_chainId'));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(h.result.current.status).toBe('connected');
    expect(h.result.current.wallet?.account).toBe(PEOPLE.heirA);
    expect(JSON.parse(kv.get(KEYS.wallet) ?? '{}')).toMatchObject({ rdns: OTHER.rdns });
  });

  it('a connection that a newer wallet event overtook fails instead of passing for a success', async () => {
    const first = fakeWallet({ accounts: [PEOPLE.owner] });
    const second = fakeWallet({ accounts: [PEOPLE.heirA] });
    const release = hold(second, 'eth_requestAccounts');
    const h = setup({
      win: walletWindow([
        { info: OKX, provider: first.provider },
        { info: OTHER, provider: second.provider },
      ]),
    });
    const list = await act(() => h.result.current.discover());
    await act(() => h.result.current.connect(byRdns(list, OKX.rdns)));
    await waitFor(() => expect(first.listenerCount('accountsChanged')).toBe(1));

    let outcome: Promise<unknown> = Promise.resolve();
    act(() => {
      outcome = h.result.current.connect(byRdns(list, OTHER.rdns));
    });
    await waitFor(() => expect(release.reached()).toBe(true));
    // The first wallet locks while the second one's prompt is open.
    act(() => first.emit('accountsChanged', []));
    expect(h.result.current.wallet).toBeNull();
    release();
    await expect(settled(() => outcome)).rejects.toThrow();
    expect(h.result.current.wallet).toBeNull();
    expect(h.result.current.status).toBe('idle');
  });

  it('a declined request leaves the wallet disconnected and gives the error to the caller', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner], reject: true });
    const kv = memoryKV();
    const h = setup({ kv, win: walletWindow([{ info: OKX, provider: fake.provider }]) });
    const list = await act(() => h.result.current.discover());
    await expect(settled(() => h.result.current.connect(list[0]))).rejects.toMatchObject({ code: 'USER_REJECTED' });
    expect(h.result.current.status).toBe('idle');
    expect(kv.get(KEYS.wallet)).toBeNull();
  });
});
