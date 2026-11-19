import type { Address } from 'viem';
import { factoryAbi, vaultAbi } from '../abi/index';
import { sameAddress, toAddress } from '../address';
import { AtropyleError } from '../errors';
import { type Role, type StateName, stateName } from '../types';
import type { ReadContext } from './context';

export interface VaultRef {
  vault: Address;
  owner: Address;
  drill: boolean;
  state: StateName;
  roles: Role[];
}

/** Vaults read per call by default. */
const VAULTS_PAGE = 100;

/**
 * The factory index only grows (no duplicates, but stale entries) and has no length cap: anyone can name `account`
 * as heir or guardian of free Drills. So it is paged with vaultsOfLength/vaultsOfPage, which clamp and never revert,
 * reading only the newest `limit` entries, newest first. Current roles come from each vault's present lists
 * (Plan 1 decision 6).
 */
export async function readVaultsOf(ctx: ReadContext, account: string, o: { limit?: number } = {}): Promise<VaultRef[]> {
  const a = toAddress(account, 'account');
  const limit = o.limit ?? VAULTS_PAGE;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new AtropyleError('INVALID_OPTIONS', { message: 'limit must be a whole number of at least 1.' });
  }
  const c = ctx.client;
  const blockNumber = await c.getBlockNumber();
  const f = { address: ctx.deployment.factory, abi: factoryAbi, blockNumber } as const;
  const length = await c.readContract({ ...f, functionName: 'vaultsOfLength', args: [a] });
  const count = length < BigInt(limit) ? length : BigInt(limit);
  const page = await c.readContract({ ...f, functionName: 'vaultsOfPage', args: [a, length - count, count] });
  const list = [...page].reverse();
  const refs = await Promise.all(
    list.map(async (vault) => {
      const v = { address: vault, abi: vaultAbi, blockNumber } as const;
      const [owner, drill, state, heirs, guardians] = await Promise.all([
        c.readContract({ ...v, functionName: 'owner' }),
        c.readContract({ ...v, functionName: 'drill' }),
        c.readContract({ ...v, functionName: 'state' }),
        c.readContract({ ...v, functionName: 'heirs' }),
        c.readContract({ ...v, functionName: 'guardians' }),
      ]);
      const roles: Role[] = [];
      if (sameAddress(owner, a)) roles.push('owner');
      if (heirs.some((h) => sameAddress(h.account, a))) roles.push('heir');
      if (guardians.some((g) => sameAddress(g, a))) roles.push('guardian');
      return { vault, owner, drill, state: stateName(state), roles };
    }),
  );
  return refs.filter((r) => r.roles.length > 0);
}
