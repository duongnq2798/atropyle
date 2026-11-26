import { decodeError, factoryAbi, type VaultRef, vaultAbi } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { Sdk } from './sdk';

/** As many index entries as `atropyle vaults` reads: VAULTS_PAGE of packages/sdk/src/read/vaults.ts (me-view.test.ts). */
export const ME_LIMIT = 100;

export interface MyVault extends VaultRef {
  /** A Drill past its seven days: its state stays, and nothing in it moves any more (thread/state.ts). */
  expired: boolean;
}

export interface MyVaults {
  vaults: MyVault[];
  /** Entries of the factory index for the account, stale ones included. More than `limit`: some were not read. */
  indexed: bigint;
  limit: number;
  blockNumber: bigint;
}

/**
 * The vaults that name `account`, from the factory index (newest first, roles from each vault's present lists), plus
 * what VaultRef leaves out: whether each Drill has expired, by chain time, and how long the index is. Those reads share
 * one block. The vault decides expiry the same way (AtropyleVault._expired, the SDK's snapshot).
 */
export async function myVaults(sdk: Sdk, account: Address): Promise<MyVaults> {
  const refs = await sdk.atro.vaultsOf(account, { limit: ME_LIMIT });
  try {
    const c = sdk.atro.publicClient;
    const block = await c.getBlock();
    const at = { blockNumber: block.number } as const;
    const [indexed, ends] = await Promise.all([
      c.readContract({
        address: sdk.deployment.factory,
        abi: factoryAbi,
        functionName: 'vaultsOfLength',
        args: [account],
        ...at,
      }),
      Promise.all(
        refs.map((r) =>
          r.drill
            ? c.readContract({ address: r.vault, abi: vaultAbi, functionName: 'expiresAt', ...at })
            : Promise.resolve(0n),
        ),
      ),
    ]);
    return {
      vaults: refs.map((r, i) => ({ ...r, expired: ends[i] !== 0n && block.timestamp >= ends[i] })),
      indexed,
      limit: ME_LIMIT,
      blockNumber: block.number,
    };
  } catch (e) {
    throw decodeError(e);
  }
}
