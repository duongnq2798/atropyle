import { AtropyleError, decodeError } from '@atropyle/sdk';
import { type ComponentChildren, createContext } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { type Address, getAddress, type WalletClient } from 'viem';
import type { AppEnv } from '../env';
import { detectLang, type Lang, type Messages, type Params, translate } from '../lib/i18n';
import { createSdk, loadDeployment, type Sdk } from '../lib/sdk';
import { KEYS, type KV } from '../lib/store';
import {
  discoverWallets,
  ensureChain,
  readChainId,
  requestAccount,
  type WalletOption,
  type WalletWindow,
  walletClientFor,
} from '../lib/wallet';

interface WalletState {
  option: WalletOption;
  account: Address;
  chainId: number;
}

interface AppValue {
  env: AppEnv;
  kv: KV;
  sdk: Sdk | null;
  sdkError: AtropyleError | null;
  lang: Lang;
  setLang(lang: Lang): void;
  crossCheck: boolean;
  setCrossCheck(on: boolean): void;
  wallets: WalletOption[] | null;
  wallet: WalletState | null;
  findWallets(): Promise<WalletOption[]>;
  connect(option: WalletOption): Promise<WalletState>;
  disconnect(): void;
  switchChain(): Promise<void>;
  walletClient(): WalletClient;
}

const AppContext = createContext<AppValue | null>(null);

const notConnected = () => new AtropyleError('WRONG_ACCOUNT', { message: 'Connect a wallet first.' });

export function AppProvider(props: {
  env: AppEnv;
  kv: KV;
  win: WalletWindow;
  languages: readonly string[];
  children: ComponentChildren;
}) {
  const { env, kv, win } = props;
  const [lang, setLangState] = useState<Lang>(() => detectLang(kv.get(KEYS.lang), props.languages));
  const [crossCheck, setCrossState] = useState(() => kv.get(KEYS.crossCheck) === '1');
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [wallet, setWallet] = useState<WalletState | null>(null);

  const built = useMemo(() => {
    try {
      return { sdk: createSdk(loadDeployment(env), env.target, crossCheck), error: null };
    } catch (e) {
      return { sdk: null, error: decodeError(e) };
    }
  }, [env, crossCheck]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const provider = wallet?.option.provider;
  useEffect(() => {
    if (!provider?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const list = args[0];
      if (!Array.isArray(list) || typeof list[0] !== 'string') return setWallet(null);
      try {
        const account = getAddress(list[0]);
        setWallet((w) => (w ? { ...w, account } : w));
      } catch {
        setWallet(null);
      }
    };
    const onChain = (...args: unknown[]) => {
      try {
        const chainId = Number(BigInt(String(args[0])));
        setWallet((w) => (w ? { ...w, chainId } : w));
      } catch {
        // malformed event from the wallet: keep the last known chain
      }
    };
    provider.on('accountsChanged', onAccounts);
    provider.on('chainChanged', onChain);
    return () => {
      provider.removeListener?.('accountsChanged', onAccounts);
      provider.removeListener?.('chainChanged', onChain);
    };
  }, [provider]);

  const value: AppValue = {
    env,
    kv,
    sdk: built.sdk,
    sdkError: built.error,
    lang,
    setLang: (l) => {
      kv.set(KEYS.lang, l);
      setLangState(l);
    },
    crossCheck,
    setCrossCheck: (on) => {
      kv.set(KEYS.crossCheck, on ? '1' : '0');
      setCrossState(on);
    },
    wallets,
    wallet,
    findWallets: async () => {
      const list = await discoverWallets(win);
      setWallets(list);
      return list;
    },
    connect: async (option) => {
      const account = await requestAccount(option.provider);
      const chainId = await readChainId(option.provider);
      const state = { option, account, chainId };
      setWallet(state);
      return state;
    },
    disconnect: () => setWallet(null),
    switchChain: async () => {
      if (!wallet || !built.sdk) throw notConnected();
      await ensureChain(wallet.option.provider, built.sdk.atro.chain);
      setWallet({ ...wallet, chainId: built.sdk.atro.chain.id });
    },
    walletClient: () => {
      if (!wallet || !built.sdk) throw notConnected();
      return walletClientFor(wallet.option.provider, wallet.account, built.sdk.atro.chain);
    },
  };
  return <AppContext.Provider value={value}>{props.children}</AppContext.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp() needs <AppProvider>');
  return v;
}

export function useDocsPath(): string | null {
  return useContext(AppContext)?.env.docsPath ?? null;
}

export function useT<K extends string>(m: Messages<K>): (key: K, params?: Params) => string {
  const lang = useContext(AppContext)?.lang ?? 'en';
  return (key, params) => translate(m, lang, key, params);
}
