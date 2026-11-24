import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KEYS, type KV, memoryKV } from '../../src/lib/store';
import { useWallet } from '../../src/wallet/provider';
import type { WalletWindow } from '../../src/wallet/types';
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
const REMEMBERED = JSON.stringify({ rdns: 'com.okex.wallet', source: 'eip6963', name: 'OKX Wallet' });
// Discovery listens for EIP-6963 answers for 250 ms.
const SLOW = { timeout: 2000 };

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

  it('a declined request leaves the wallet disconnected and gives the error to the caller', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner], reject: true });
    const kv = memoryKV();
    const h = setup({ kv, win: walletWindow([{ info: OKX, provider: fake.provider }]) });
    const list = await act(() => h.result.current.discover());
    await expect(act(() => h.result.current.connect(list[0]))).rejects.toMatchObject({ code: 'USER_REJECTED' });
    expect(h.result.current.status).toBe('idle');
    expect(kv.get(KEYS.wallet)).toBeNull();
  });
});
