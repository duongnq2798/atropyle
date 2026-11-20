import { AtropyleError, untrusted } from '@atropyle/sdk';
import { type Address, type Chain, createWalletClient, custom, getAddress, type WalletClient } from 'viem';

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface WalletOption {
  id: string;
  name: string;
  icon: string | null;
  rdns: string | null;
  provider: Eip1193;
  source: 'eip6963' | 'okxwallet' | 'ethereum';
}

export interface WalletWindow {
  addEventListener: EventTarget['addEventListener'];
  removeEventListener: EventTarget['removeEventListener'];
  dispatchEvent: EventTarget['dispatchEvent'];
  okxwallet?: unknown;
  ethereum?: unknown;
}

function isProvider(p: unknown): p is Eip1193 {
  return !!p && typeof (p as Eip1193).request === 'function';
}

function safeIcon(icon: unknown): string | null {
  return typeof icon === 'string' && icon.startsWith('data:image/') && icon.length <= 100_000 ? icon : null;
}

function isOkx(w: Pick<WalletOption, 'name' | 'rdns'>): boolean {
  return /okx|okex/i.test(`${w.rdns ?? ''} ${w.name}`);
}

function sortWallets(list: WalletOption[]): WalletOption[] {
  return [...list].sort((a, b) => Number(isOkx(b)) - Number(isOkx(a)) || a.name.localeCompare(b.name));
}

/** EIP-6963 first; then `window.okxwallet` (OKX App browser); `window.ethereum` only when nothing else answered. */
export async function discoverWallets(win: WalletWindow, waitMs = 250): Promise<WalletOption[]> {
  const found = new Map<string, WalletOption>();
  const onAnnounce = (e: Event) => {
    const detail = (e as CustomEvent).detail as { info?: Record<string, unknown>; provider?: unknown } | undefined;
    if (!detail?.info || !isProvider(detail.provider)) return;
    const id = typeof detail.info.uuid === 'string' ? detail.info.uuid : `eip6963-${found.size}`;
    found.set(id, {
      id,
      name: untrusted(detail.info.name, 40).value || 'Wallet',
      icon: safeIcon(detail.info.icon),
      rdns: typeof detail.info.rdns === 'string' ? untrusted(detail.info.rdns, 100).value : null,
      provider: detail.provider,
      source: 'eip6963',
    });
  };
  win.addEventListener('eip6963:announceProvider', onAnnounce);
  win.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  win.removeEventListener('eip6963:announceProvider', onAnnounce);
  const list = [...found.values()];
  const okx = win.okxwallet;
  if (isProvider(okx) && !list.some((w) => isOkx(w) || w.provider === okx)) {
    list.push({ id: 'okxwallet', name: 'OKX Wallet', icon: null, rdns: null, provider: okx, source: 'okxwallet' });
  }
  if (list.length === 0 && isProvider(win.ethereum)) {
    list.push({
      id: 'ethereum',
      name: 'Browser wallet',
      icon: null,
      rdns: null,
      provider: win.ethereum,
      source: 'ethereum',
    });
  }
  return sortWallets(list);
}

/** Codes along the error chain; MetaMask mobile nests 4902 under `data.originalError`. */
export function providerErrorCodes(e: unknown): number[] {
  const codes: number[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 6 && cur && typeof cur === 'object'; i++) {
    const o = cur as { code?: unknown; data?: { originalError?: unknown }; cause?: unknown };
    if (typeof o.code === 'number') codes.push(o.code);
    cur = o.data?.originalError ?? o.cause;
  }
  return codes;
}

export async function call<T>(p: Eip1193, method: string, params?: unknown[]): Promise<T> {
  try {
    return (await p.request(params === undefined ? { method } : { method, params })) as T;
  } catch (e) {
    if (providerErrorCodes(e).includes(4001)) throw new AtropyleError('USER_REJECTED', { cause: e });
    if (e && typeof e === 'object' && !(e instanceof Error)) {
      // EIP-1193 errors are often plain objects; an Error keeps `decodeError` from printing "[object Object]".
      const o = e as { code?: unknown; message?: unknown; data?: unknown };
      throw Object.assign(new Error(typeof o.message === 'string' ? o.message.slice(0, 200) : 'Wallet error'), {
        code: o.code,
        data: o.data,
      });
    }
    throw e;
  }
}

export async function requestAccount(p: Eip1193): Promise<Address> {
  const accounts = await call<unknown>(p, 'eth_requestAccounts');
  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof first !== 'string')
    throw new AtropyleError('WRONG_ACCOUNT', { message: 'The wallet returned no account.' });
  return getAddress(first);
}

export async function readChainId(p: Eip1193): Promise<number> {
  return Number(BigInt(await call<string>(p, 'eth_chainId')));
}

interface AddChainParams {
  chainId: string;
  chainName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls?: string[];
}

/** EIP-3085 parameters, taken from the SDK chain (X Layer: OKB, OKX RPC, OKLink). */
function addChainParams(chain: Chain): AddChainParams {
  const p: AddChainParams = {
    chainId: `0x${chain.id.toString(16)}`,
    chainName: chain.name,
    nativeCurrency: { ...chain.nativeCurrency },
    rpcUrls: [...chain.rpcUrls.default.http],
  };
  if (chain.blockExplorers) p.blockExplorerUrls = [chain.blockExplorers.default.url];
  return p;
}

export async function ensureChain(p: Eip1193, chain: Chain): Promise<void> {
  if ((await readChainId(p)) === chain.id) return;
  const chainId = `0x${chain.id.toString(16)}`;
  try {
    await call(p, 'wallet_switchEthereumChain', [{ chainId }]);
  } catch (e) {
    if (!providerErrorCodes(e).includes(4902)) throw e;
    await call(p, 'wallet_addEthereumChain', [addChainParams(chain)]);
    await call(p, 'wallet_switchEthereumChain', [{ chainId }]);
  }
  const now = await readChainId(p);
  if (now !== chain.id) {
    throw new AtropyleError('WRONG_CHAIN', {
      message: `The wallet is on chain ${now}; this page needs chain ${chain.id}.`,
      details: { expected: chain.id, actual: now },
    });
  }
}

export function walletClientFor(p: Eip1193, account: Address, chain: Chain): WalletClient {
  return createWalletClient({ account, chain, transport: custom(p as Parameters<typeof custom>[0]) });
}
