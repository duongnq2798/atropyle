import type { Eip1193, WalletWindow } from '@/wallet/types';

type Listener = (...args: unknown[]) => void;

export interface FakeWalletState {
  accounts: string[];
  chainId: number;
  /** Whether the wallet already shares its accounts with this site: what `eth_accounts` answers. */
  shared: boolean;
  /** The user declines the next connection request. */
  reject: boolean;
}

export interface FakeWallet {
  provider: Eip1193;
  state: FakeWalletState;
  /** Every method the page called, in order. */
  calls: string[];
  emit(event: string, ...args: unknown[]): void;
  listenerCount(event: string): number;
}

/** An EIP-1193 wallet in memory: accounts, one chain, a prompt the test can decline, and events. */
export function fakeWallet(o: Partial<FakeWalletState> = {}): FakeWallet {
  const state: FakeWalletState = { accounts: [], chainId: 196, shared: false, reject: false, ...o };
  const calls: string[] = [];
  const listeners = new Map<string, Set<Listener>>();
  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners.get(event) ?? []) listener(...args);
  };
  const provider: Eip1193 = {
    async request({ method, params }) {
      calls.push(method);
      switch (method) {
        case 'eth_accounts':
          return state.shared ? state.accounts : [];
        case 'eth_requestAccounts':
          if (state.reject) throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
          state.shared = true;
          return state.accounts;
        case 'eth_chainId':
          return `0x${state.chainId.toString(16)}`;
        case 'wallet_switchEthereumChain': {
          const [{ chainId }] = params as [{ chainId: string }];
          state.chainId = Number(BigInt(chainId));
          emit('chainChanged', chainId);
          return null;
        }
        default:
          throw Object.assign(new Error(`unexpected ${method}`), { code: 4200 });
      }
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(event, set);
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
  };
  return { provider, state, calls, emit, listenerCount: (event) => listeners.get(event)?.size ?? 0 };
}

export interface Announced {
  info: { uuid: string; name: string; rdns: string; icon: string };
  provider: Eip1193;
}

/** A window where the given wallets answer EIP-6963 discovery, plus injected globals such as `okxwallet`. */
export function walletWindow(
  announced: Announced[] = [],
  globals: { okxwallet?: unknown; ethereum?: unknown } = {},
): WalletWindow {
  const win = new EventTarget();
  win.addEventListener('eip6963:requestProvider', () => {
    for (const detail of announced) win.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
  });
  return Object.assign(win, globals);
}
