import { type Chain, createWalletClient, type Hex, type Transport, type WalletClient } from 'viem';
import { type LocalAccount, privateKeyToAccount } from 'viem/accounts';
import type { Env } from '../config';

/*
 * THE ONLY FILE OF THE REPOSITORY THAT READS KEEPER_KEY OR BUILDS AN ACCOUNT FROM A KEY (AGENTS.md, zero-key rule).
 *
 * KEEPER_KEY is a Supabase secret that only the maintainer sets (apps/backend/README.md). It funds gas for poke and
 * distribute, which are permissionless and only ever pay heirs or the recovery wallet: a stolen keeper key can burn
 * the keeper's gas, never move a vault's assets. Without it the keeper runs dry. Tests never pass a key: they inject
 * `toAccount`, and on anvil the e2e uses an unlocked account instead.
 */
export const KEEPER_KEY_INVALID =
  'KEEPER_KEY is set but cannot be read as a private key; the keeper runs dry until it is replaced.';

export type ToAccount = (key: Hex) => LocalAccount;

export interface KeeperSigner {
  wallet: WalletClient | null;
  /** Set when the secret exists but is unusable. Never contains the secret. */
  error: string | null;
}

export function keeperSigner(
  key: string | undefined,
  chain: Chain,
  transport: Transport,
  toAccount: ToAccount = privateKeyToAccount,
): KeeperSigner {
  const raw = key?.trim() ?? '';
  if (raw === '') return { wallet: null, error: null };
  const hex = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  try {
    return { wallet: createWalletClient({ account: toAccount(hex), chain, transport }), error: null };
  } catch {
    return { wallet: null, error: KEEPER_KEY_INVALID };
  }
}

export function keeperSignerFromEnv(env: Env, chain: Chain, transport: Transport): KeeperSigner {
  return keeperSigner(env('KEEPER_KEY'), chain, transport);
}
