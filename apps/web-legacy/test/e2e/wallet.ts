import type { Page } from '@playwright/test';
import type { Address, Hex } from 'viem';
import { rpcCall } from './state.ts';

export interface WalletOptions {
  rpcUrl: string;
  account: Address;
  chainId?: number;
  knownChains?: number[];
  sendCalls?: boolean;
}

export interface TestWallet {
  calls: { method: string; params: unknown[] }[];
  setAccount(a: Address): void;
}

type Reply = { result?: unknown; error?: { code: number; message: string }; chainChanged?: string };

/** Read-only methods passed through to anvil; everything else the wallet does not implement is refused. */
const READ_ONLY = new Set([
  'eth_call',
  'eth_estimateGas',
  'eth_getBalance',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_getTransactionByHash',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_gasPrice',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'eth_getLogs',
  'net_version',
]);

const hex = (n: number) => `0x${n.toString(16)}`;

/**
 * An EIP-1193 wallet that lives outside the page, like an extension: the page only sees `request`, every call
 * crosses to Node through `exposeFunction` and reaches anvil with an unlocked account. It holds no key and signs
 * nothing: state changes are `eth_sendTransaction` from an unlocked anvil account. It is not a page request, so
 * neither the CSP nor the on-chain request recorder sees it.
 */
export async function installWallet(page: Page, o: WalletOptions): Promise<TestWallet> {
  const calls: TestWallet['calls'] = [];
  let account = o.account;
  let chainId = o.chainId ?? 31337;
  const known = new Set([chainId, ...(o.knownChains ?? [])]);
  const bundles = new Map<string, Hex[]>();
  const anvil = (method: string, params: unknown[]) => rpcCall(o.rpcUrl, method, params);
  const fail = (code: number, message: string): Reply => ({ error: { code, message } });

  await page.exposeFunction('__atropyleWallet', async (method: string, params: unknown[]): Promise<Reply> => {
    calls.push({ method, params });
    const first = (params[0] ?? {}) as Record<string, unknown>;
    try {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return { result: [account] };
        case 'eth_chainId':
          return { result: hex(chainId) };
        case 'wallet_switchEthereumChain': {
          const id = Number(BigInt(String(first.chainId)));
          if (!known.has(id)) return fail(4902, 'Unrecognized chain ID');
          chainId = id;
          return { result: null, chainChanged: hex(id) };
        }
        case 'wallet_addEthereumChain':
          known.add(Number(BigInt(String(first.chainId))));
          return { result: null };
        case 'wallet_getCapabilities':
          return o.sendCalls
            ? { result: { [hex(chainId)]: { atomic: { status: 'supported' } } } }
            : fail(-32601, 'Method not found');
        case 'wallet_sendCalls': {
          if (!o.sendCalls) return fail(-32601, 'Method not found');
          if (Number(BigInt(String(first.chainId))) !== chainId) return fail(5710, 'Unsupported chain');
          const hashes: Hex[] = [];
          for (const c of first.calls as { to: Address; data: Hex; value?: Hex }[]) {
            hashes.push(
              (await anvil('eth_sendTransaction', [
                { from: account, to: c.to, data: c.data, value: c.value ?? '0x0' },
              ])) as Hex,
            );
          }
          const id = `bundle-${bundles.size + 1}`;
          bundles.set(id, hashes);
          return { result: { id } };
        }
        case 'wallet_getCallsStatus': {
          const hashes = bundles.get(String(params[0]));
          if (!hashes) return fail(5730, 'Unknown bundle id');
          const receipts = (await Promise.all(hashes.map((h) => anvil('eth_getTransactionReceipt', [h])))) as {
            transactionHash: Hex;
            status: Hex;
            blockHash: Hex;
            blockNumber: Hex;
            gasUsed: Hex;
            logs: unknown[];
          }[];
          const ok = receipts.every((r) => r?.status === '0x1');
          return {
            result: {
              version: '2.0.0',
              id: params[0],
              chainId: hex(chainId),
              atomic: false,
              status: ok ? 200 : 500,
              receipts,
            },
          };
        }
        case 'eth_sendTransaction': {
          if (chainId !== 31337) return fail(4901, 'The wallet is not on the devnet');
          const tx = first as { from?: string };
          if (tx.from && tx.from.toLowerCase() !== account.toLowerCase()) return fail(4100, 'Unknown account');
          return { result: await anvil('eth_sendTransaction', [{ ...first, from: account }]) };
        }
        default:
          // Signing and raw-transaction methods must never reach anvil, which would sign with its dev keys.
          if (!READ_ONLY.has(method)) return fail(4200, 'Unsupported method');
          return { result: await anvil(method, params) };
      }
    } catch (e) {
      return fail(-32603, (e as Error).message);
    }
  });

  await page.addInitScript(() => {
    type Listener = (arg: unknown) => void;
    type Reply = { result?: unknown; error?: { code: number; message: string }; chainChanged?: string };
    const w = window as unknown as {
      __atropyleWallet(method: string, params: unknown[]): Promise<Reply>;
    };
    const listeners = new Map<string, Listener[]>();
    const emit = (ev: string, arg: unknown) => {
      for (const f of listeners.get(ev) ?? []) f(arg);
    };
    const provider = {
      async request(args: { method: string; params?: unknown[] }) {
        const r = await w.__atropyleWallet(args.method, args.params ?? []);
        if (r.error) throw Object.assign(new Error(r.error.message), { code: r.error.code });
        if (r.chainChanged) setTimeout(() => emit('chainChanged', r.chainChanged), 0);
        return r.result;
      },
      on(ev: string, f: Listener) {
        listeners.set(ev, [...(listeners.get(ev) ?? []), f]);
      },
      removeListener(ev: string, f: Listener) {
        listeners.set(
          ev,
          (listeners.get(ev) ?? []).filter((x) => x !== f),
        );
      },
    };
    const info = {
      uuid: '6b2e9d6a-0000-4000-8000-000000000001',
      name: 'Test Wallet',
      icon: 'data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMSAxIi8+',
      rdns: 'dev.atropyle.testwallet',
    };
    const announce = () =>
      window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
    window.addEventListener('eip6963:requestProvider', announce);
    announce();
  });

  return {
    calls,
    setAccount: (a) => {
      account = a;
    },
  };
}
