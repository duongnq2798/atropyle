// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { KEYS, memoryKV } from '../../src/lib/store';
import {
  findRemembered,
  isTransientDisconnect,
  parseAccountsEvent,
  parseChainEvent,
  restoreWallet,
  watchWallet,
} from '../../src/wallet/impl/session';
import { discoverWallets } from '../../src/wallet/impl/wallet';
import { readRemembered, remember, reviveRemembered } from '../../src/wallet/remember';
import type { RememberedWallet, WalletOption } from '../../src/wallet/types';
import { fakeWallet, walletWindow } from '../helpers/wallet';
import { PEOPLE } from './fixtures';

const OKX: RememberedWallet = { rdns: 'com.okex.wallet', source: 'eip6963', name: 'OKX Wallet' };

function option(over: Partial<WalletOption>): WalletOption {
  return {
    id: 'id',
    name: 'Wallet',
    icon: null,
    rdns: null,
    provider: fakeWallet().provider,
    source: 'eip6963',
    ...over,
  };
}

describe('wallet events', () => {
  it('reads accounts and chains, and refuses garbage', () => {
    expect(parseAccountsEvent([PEOPLE.owner.toLowerCase()])).toBe(PEOPLE.owner);
    for (const bad of [[], [42], 'x', null, undefined, ['0x123'], {}]) expect(parseAccountsEvent(bad)).toBeNull();

    expect(parseChainEvent('0xc4')).toBe(196);
    expect(parseChainEvent('196')).toBe(196);
    expect(parseChainEvent(196)).toBe(196);
    for (const bad of ['', 'garbage', '0x', '-1', 0, 1.5, null, {}, '0x1fffffffffffff0']) {
      expect(parseChainEvent(bad)).toBeNull();
    }

    expect(isTransientDisconnect({ code: 1013 })).toBe(true);
    expect(isTransientDisconnect({ code: 4900 })).toBe(false);
    expect(isTransientDisconnect(undefined)).toBe(false);
  });

  it('watchWallet forwards what it understands and stops listening', () => {
    const fake = fakeWallet();
    const seen: string[] = [];
    const stop = watchWallet(fake.provider, {
      account: (a) => seen.push(`account ${a}`),
      chain: (id) => seen.push(`chain ${id}`),
      gone: () => seen.push('gone'),
    });
    fake.emit('accountsChanged', [PEOPLE.heirA.toLowerCase()]);
    fake.emit('chainChanged', 'not a chain');
    fake.emit('chainChanged', '0x1');
    fake.emit('disconnect', { code: 1013 });
    fake.emit('disconnect', { code: 4900 });
    fake.emit('accountsChanged', []);
    expect(seen).toEqual([`account ${PEOPLE.heirA}`, 'chain 1', 'gone', 'gone']);

    stop();
    for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) expect(fake.listenerCount(event)).toBe(0);
  });
});

describe('remembered wallet', () => {
  it('keeps only a well-formed entry, and drops a corrupt one from storage', () => {
    expect(reviveRemembered(OKX)).toEqual(OKX);
    expect(reviveRemembered({ rdns: null, source: 'okxwallet', name: 'OKX Wallet' })).not.toBeNull();
    for (const bad of [
      null,
      'x',
      {},
      { rdns: 5, source: 'eip6963', name: 'A' },
      { rdns: null, source: 'walletconnect', name: 'A' },
      { rdns: null, source: 'ethereum', name: 'x'.repeat(41) },
    ]) {
      expect(reviveRemembered(bad)).toBeNull();
    }
    const kv = memoryKV();
    kv.set(KEYS.wallet, '{"rdns":');
    expect(readRemembered(kv)).toBeNull();
    expect(kv.get(KEYS.wallet)).toBeNull();
  });

  it('reads back every wallet that discovery can hand to remember()', async () => {
    const fake = fakeWallet();
    const announced = [
      // Cut by discovery to 40 characters plus the ellipsis, and the rdns to 100 plus the ellipsis.
      { uuid: 'long', name: 'Super Long Wallet Name Of Some Fancy Extension', rdns: `com.${'x'.repeat(120)}` },
      // 30 characters, but 60 UTF-16 code units.
      { uuid: 'astral', name: '\u{1F98A}'.repeat(30), rdns: 'org.example.fox' },
      // An rdns that is only an invisible character cleans to nothing.
      { uuid: 'blank', name: 'Blank rdns', rdns: '​' },
    ];
    const win = walletWindow(announced.map((info) => ({ info: { ...info, icon: '' }, provider: fake.provider })));
    const found = await discoverWallets(win);
    expect(found).toHaveLength(3);
    expect(found.find((w) => w.id === 'long')?.name).toHaveLength(41);
    for (const option of found) {
      const kv = memoryKV();
      remember(kv, option);
      const back = readRemembered(kv);
      expect(back).toEqual({ rdns: option.rdns || null, source: 'eip6963', name: option.name });
      expect(back && findRemembered(found, back)).toBe(option);
    }
  });

  it('finds the same wallet by rdns, because EIP-6963 uuids change on every page load', () => {
    const okx = option({ id: 'new-uuid', name: 'OKX Wallet', rdns: 'com.okex.wallet' });
    const other = option({ id: 'other', name: 'Other', rdns: 'org.example' });
    const injected = option({ id: 'okxwallet', name: 'OKX Wallet', source: 'okxwallet' });
    expect(findRemembered([other, okx], OKX)).toBe(okx);
    expect(findRemembered([other], OKX)).toBeNull();
    expect(findRemembered([other, injected], { rdns: null, source: 'okxwallet', name: 'OKX Wallet' })).toBe(injected);
  });

  it('reconnects without a prompt, and tells a missing wallet from a locked one', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner], shared: true });
    const info = { uuid: 'uuid-9', name: 'OKX Wallet', rdns: 'com.okex.wallet', icon: '' };
    const win = walletWindow([{ info, provider: fake.provider }]);
    expect(await restoreWallet(win, OKX)).toMatchObject({
      kind: 'connected',
      wallet: { account: PEOPLE.owner, chainId: 196 },
    });
    fake.state.shared = false;
    expect(await restoreWallet(win, OKX)).toEqual({ kind: 'locked' });
    expect(await restoreWallet(walletWindow(), OKX)).toEqual({ kind: 'gone' });
    expect(fake.calls).not.toContain('eth_requestAccounts');
  });
});
