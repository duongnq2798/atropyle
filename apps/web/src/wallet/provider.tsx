'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { WalletClient } from 'viem';
import { CHAIN_ID, sdkQuery } from '@/chain/hooks';
import { useChainSettings } from '@/chain/provider';
import { useKV } from '@/lib/kv';
import { loadWalletImpl } from './load';
import { forget, readRemembered, remember } from './remember';
import type { ConnectedWallet, WalletOption, WalletStatus, WalletWindow } from './types';

export interface WalletValue {
  status: WalletStatus;
  wallet: ConnectedWallet | null;
  /** The chain of this build's deployment. */
  expectedChainId: number;
  /** Connected, but on another chain than expectedChainId. */
  wrongChain: boolean;
  /** The wallets the last discover() found; null before the first one. */
  wallets: WalletOption[] | null;
  discovering: boolean;
  discover(): Promise<WalletOption[]>;
  /**
   * Opens the wallet's prompt. Rejects with USER_REJECTED when the user declines, and with a plain Error when a newer
   * connect, a disconnect or a lost wallet overtook it.
   */
  connect(option: WalletOption): Promise<ConnectedWallet>;
  /** Forgets the wallet on this site; the wallet itself keeps its permission. */
  disconnect(): void;
  switchChain(): Promise<void>;
  /** A viem client that signs through the connected wallet on this build's chain. */
  walletClient(): Promise<WalletClient>;
  sheetOpen: boolean;
  /**
   * Opens the wallet sheet. `fallback`: where focus goes when the sheet closes and the element that opened it has
   * left the page (a connection replaces a Connect button), tried before the wallet button.
   */
  openSheet(fallback?: () => HTMLElement | null): void;
  setSheetOpen(open: boolean): void;
  /** The element that opened the sheet, so focus returns to it. */
  sheetOpener: RefObject<HTMLElement | null>;
  /** The `fallback` of the last openSheet(), or null. */
  sheetFallback: RefObject<(() => HTMLElement | null) | null>;
}

export const WalletContext = createContext<WalletValue | null>(null);

type Pending = 'restoring' | 'connecting' | null;

/**
 * The longest a silent reconnect may hold the header's placeholder. A wallet that keeps `eth_accounts` waiting until
 * it is unlocked, or a chunk that never arrives, counts as locked: Connect shows, and the wallet stays remembered.
 */
const RESTORE_TIMEOUT_MS = 4000;

/**
 * The connected wallet of the whole site (Quyết định 27). Nothing here loads viem or the SDK until it is needed: a
 * click on Connect, or a wallet remembered from an earlier visit.
 */
export function WalletProvider({ children, win }: { children: ReactNode; win?: WalletWindow }) {
  const kv = useKV();
  const queryClient = useQueryClient();
  const { crossCheck } = useChainSettings();
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetOpener = useRef<HTMLElement | null>(null);
  const sheetFallback = useRef<(() => HTMLElement | null) | null>(null);
  // Each connect, disconnect, restore and loss takes the next number; a slower one that meets a newer number drops
  // its result, so a late restore never overwrites a wallet the user has just chosen.
  const epoch = useRef(0);
  const windowOf = useCallback((): WalletWindow => win ?? window, [win]);

  // A remembered wallet reconnects after mount, without a prompt (Review Focus 2).
  useEffect(() => {
    const remembered = readRemembered(kv);
    if (!remembered) return;
    const mine = ++epoch.current;
    setPending('restoring');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tooSlow = new Promise<{ kind: 'locked' }>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'locked' }), RESTORE_TIMEOUT_MS);
    });
    Promise.race([loadWalletImpl().then((impl) => impl.restoreWallet(windowOf(), remembered)), tooSlow])
      .finally(() => clearTimeout(timer))
      .then(
        (r) => {
          if (epoch.current !== mine) return;
          if (r.kind === 'gone') forget(kv);
          if (r.kind === 'connected') setWallet(r.wallet);
          setPending(null);
        },
        () => {
          if (epoch.current === mine) setPending(null);
        },
      );
    return () => clearTimeout(timer);
  }, [kv, windowOf]);

  // Wallet events (Review Focus 3): a new account or chain updates the state; anything unusable drops the wallet.
  const provider = wallet?.option.provider ?? null;
  useEffect(() => {
    if (!provider) return;
    let live = true;
    let stop: (() => void) | null = null;
    loadWalletImpl().then(
      (impl) => {
        if (!live) return;
        stop = impl.watchWallet(provider, {
          account: (account) => setWallet((w) => (w ? { ...w, account } : w)),
          chain: (chainId) => setWallet((w) => (w ? { ...w, chainId } : w)),
          gone: () => {
            epoch.current++;
            setPending(null);
            setWallet(null);
          },
        });
      },
      () => undefined,
    );
    return () => {
      live = false;
      stop?.();
    };
  }, [provider]);

  const discover = useCallback(async (): Promise<WalletOption[]> => {
    setDiscovering(true);
    try {
      const list = await (await loadWalletImpl()).discoverWallets(windowOf());
      setWallets(list);
      return list;
    } finally {
      setDiscovering(false);
    }
  }, [windowOf]);

  const connect = useCallback(
    async (option: WalletOption): Promise<ConnectedWallet> => {
      const mine = ++epoch.current;
      setPending('connecting');
      try {
        const next = await (await loadWalletImpl()).connectWallet(option);
        // A newer connect, a disconnect or a lost wallet came first: say so, rather than pass for a success the
        // page never applied (the sheet shows the error, and trying again connects at once).
        if (epoch.current !== mine) throw new Error('A newer wallet action replaced this connection.');
        setWallet(next);
        remember(kv, option);
        setSheetOpen(false);
        return next;
      } finally {
        if (epoch.current === mine) setPending(null);
      }
    },
    [kv],
  );

  const disconnect = useCallback(() => {
    epoch.current++;
    forget(kv);
    setPending(null);
    setWallet(null);
  }, [kv]);

  // The SDK only on demand: a visitor who never connects never loads it here.
  const sdkNow = useCallback(() => queryClient.query(sdkQuery(crossCheck)), [queryClient, crossCheck]);

  const switchChain = useCallback(async () => {
    const [impl, sdk] = await Promise.all([loadWalletImpl(), sdkNow()]);
    if (!wallet) throw impl.notConnected();
    const chain = sdk.atro.chain;
    await impl.ensureChain(wallet.option.provider, chain);
    setWallet((w) => (w && w.option === wallet.option ? { ...w, chainId: chain.id } : w));
  }, [wallet, sdkNow]);

  const walletClient = useCallback(async (): Promise<WalletClient> => {
    const [impl, sdk] = await Promise.all([loadWalletImpl(), sdkNow()]);
    if (!wallet) throw impl.notConnected();
    return impl.walletClientFor(wallet.option.provider, wallet.account, sdk.atro.chain);
  }, [wallet, sdkNow]);

  const openSheet = useCallback((fallback?: () => HTMLElement | null) => {
    // Safari and Firefox on macOS focus no button on a click or a tap, so the page itself may have focus: no opener
    // then, and the sheet gives focus to `fallback` or the wallet button when it closes.
    const a = document.activeElement;
    sheetOpener.current = a instanceof HTMLElement && a !== document.body && a !== document.documentElement ? a : null;
    sheetFallback.current = fallback ?? null;
    setSheetOpen(true);
  }, []);

  const value = useMemo<WalletValue>(
    () => ({
      status: pending ?? (wallet ? 'connected' : 'idle'),
      wallet,
      expectedChainId: CHAIN_ID,
      wrongChain: wallet !== null && wallet.chainId !== CHAIN_ID,
      wallets,
      discovering,
      discover,
      connect,
      disconnect,
      switchChain,
      walletClient,
      sheetOpen,
      openSheet,
      setSheetOpen,
      sheetOpener,
      sheetFallback,
    }),
    [
      pending,
      wallet,
      wallets,
      discovering,
      discover,
      connect,
      disconnect,
      switchChain,
      walletClient,
      sheetOpen,
      openSheet,
    ],
  );
  return <WalletContext value={value}>{children}</WalletContext>;
}

export function useWallet(): WalletValue {
  const v = use(WalletContext);
  if (!v) throw new Error('useWallet must be used inside <WalletProvider>');
  return v;
}
