import { AtropyleError, chainOf } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import {
  call,
  discoverWallets,
  type Eip1193,
  ensureChain,
  providerErrorCodes,
  readChainId,
  requestAccount,
  type WalletWindow,
} from '../../src/lib/wallet';
import { fixtureDeployment } from './fixtures';

const ICON = 'data:image/svg+xml;base64,PHN2Zy8+';
const chain = chainOf(fixtureDeployment());

function fakeProvider(o: { chainId: number; known?: number[]; accounts?: string[]; stuck?: boolean }) {
  const calls: { method: string; params?: unknown }[] = [];
  let chainId = o.chainId;
  const known = new Set([o.chainId, ...(o.known ?? [])]);
  const provider: Eip1193 = {
    async request({ method, params }) {
      calls.push({ method, params });
      const first = Array.isArray(params) ? (params[0] as { chainId?: string }) : undefined;
      switch (method) {
        case 'eth_requestAccounts':
          return o.accounts ?? [];
        case 'eth_chainId':
          return `0x${chainId.toString(16)}`;
        case 'wallet_switchEthereumChain': {
          const id = Number(BigInt(first?.chainId ?? '0x0'));
          if (!known.has(id)) throw Object.assign(new Error('Unrecognized chain ID'), { code: 4902 });
          if (!o.stuck) chainId = id;
          return null;
        }
        case 'wallet_addEthereumChain':
          known.add(Number(BigInt(first?.chainId ?? '0x0')));
          return null;
        default:
          throw new Error(`unexpected ${method}`);
      }
    },
  };
  return { provider, calls };
}

function announce(win: EventTarget, wallets: { uuid: string; name: string; rdns: string; icon: string }[]) {
  win.addEventListener('eip6963:requestProvider', () => {
    for (const info of wallets) {
      const detail = { info, provider: fakeProvider({ chainId: 1 }).provider };
      win.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
    }
  });
}

describe('discoverWallets', () => {
  it('lists announced wallets, OKX first, and drops unsafe icons', async () => {
    const win = new EventTarget() as WalletWindow;
    announce(win, [
      { uuid: 'a', name: 'Alpha Wallet', rdns: 'io.alpha', icon: 'https://evil.example/x.png' },
      { uuid: 'b', name: 'OKX Wallet', rdns: 'com.okex.wallet', icon: ICON },
    ]);
    const list = await discoverWallets(win, 0);
    expect(list.map((w) => w.name)).toEqual(['OKX Wallet', 'Alpha Wallet']);
    expect(list[0].icon).toBe(ICON);
    expect(list[1].icon).toBeNull();
  });

  it('falls back to window.okxwallet, then window.ethereum', async () => {
    const okx = fakeProvider({ chainId: 196 }).provider;
    const eth = fakeProvider({ chainId: 1 }).provider;
    const both = Object.assign(new EventTarget(), { okxwallet: okx, ethereum: eth }) as WalletWindow;
    expect((await discoverWallets(both, 0)).map((w) => w.source)).toEqual(['okxwallet']);
    const ethOnly = Object.assign(new EventTarget(), { ethereum: eth }) as WalletWindow;
    expect((await discoverWallets(ethOnly, 0)).map((w) => w.source)).toEqual(['ethereum']);
    const announced = Object.assign(new EventTarget(), { okxwallet: okx }) as WalletWindow;
    announce(announced, [{ uuid: 'b', name: 'OKX Wallet', rdns: 'com.okex.wallet', icon: ICON }]);
    expect((await discoverWallets(announced, 0)).map((w) => w.source)).toEqual(['eip6963']);
  });

  it('keeps a wallet name as cleaned, short text', async () => {
    const win = new EventTarget() as WalletWindow;
    announce(win, [{ uuid: 'c', name: `Evil\u{202E}${'W'.repeat(200)}`, rdns: 'x.evil', icon: ICON }]);
    const [w] = await discoverWallets(win, 0);
    expect(w.name.startsWith('EvilW')).toBe(true);
    expect(Array.from(w.name).length).toBeLessThanOrEqual(41);
  });
});

describe('chain and account', () => {
  it('ensureChain does nothing when the wallet is already on the chain', async () => {
    const { provider, calls } = fakeProvider({ chainId: 196 });
    await ensureChain(provider, chain);
    expect(calls.map((c) => c.method)).toEqual(['eth_chainId']);
  });

  it('ensureChain adds the chain when the wallet does not know it', async () => {
    const { provider, calls } = fakeProvider({ chainId: 1 });
    await ensureChain(provider, chain);
    expect(calls.map((c) => c.method)).toEqual([
      'eth_chainId',
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
      'wallet_switchEthereumChain',
      'eth_chainId',
    ]);
    expect(calls[2].params).toEqual([
      {
        chainId: '0xc4',
        chainName: 'X Layer',
        nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
        rpcUrls: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com'],
        blockExplorerUrls: ['https://www.oklink.com/xlayer'],
      },
    ]);
    expect(await readChainId(provider)).toBe(196);
  });

  it('ensureChain fails with WRONG_CHAIN when the wallet does not move', async () => {
    const { provider } = fakeProvider({ chainId: 1, known: [196], stuck: true });
    await expect(ensureChain(provider, chain)).rejects.toMatchObject({ code: 'WRONG_CHAIN' });
  });

  it('maps a user rejection to USER_REJECTED', async () => {
    const p: Eip1193 = {
      request: async () => {
        throw { code: 4001, message: 'User rejected the request.' };
      },
    };
    await expect(call(p, 'eth_requestAccounts')).rejects.toBeInstanceOf(AtropyleError);
    await expect(requestAccount(p)).rejects.toMatchObject({ code: 'USER_REJECTED' });
  });

  it('turns a plain-object rejection into an Error with a short message', async () => {
    const p: Eip1193 = {
      request: async () => {
        throw { code: -32603, message: `boom${'x'.repeat(500)}`, data: { reason: 'r' } };
      },
    };
    const err = await call(p, 'eth_chainId').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message.length).toBe(200);
    expect(err).toMatchObject({ code: -32603, data: { reason: 'r' } });
    const bare: Eip1193 = {
      request: async () => {
        throw {};
      },
    };
    await expect(call(bare, 'eth_chainId')).rejects.toThrowError('Wallet error');
  });

  it('reads every provider error code along the cause chain', () => {
    expect(providerErrorCodes({ code: -32603, data: { originalError: { code: 4902 } } })).toEqual([-32603, 4902]);
    expect(providerErrorCodes(new Error('plain'))).toEqual([]);
  });

  it('requestAccount checksums the first account', async () => {
    const { provider } = fakeProvider({ chainId: 196, accounts: ['0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc'] });
    expect(await requestAccount(provider)).toBe('0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');
  });
});
