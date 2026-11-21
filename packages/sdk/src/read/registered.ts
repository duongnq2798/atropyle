import type { Address } from 'viem';
import { factoryAbi } from '../abi/index';
import type { ReadContext } from './context';

/**
 * True when the deployment's own factory created `vault` (`factory.isVault`). The snapshot's `binding.factory` is read
 * from the vault itself, so it proves nothing: any contract can answer like a vault and name the real factory.
 */
export function isRegistered(ctx: ReadContext, vault: Address, blockNumber?: bigint): Promise<boolean> {
  return ctx.client.readContract({
    address: ctx.deployment.factory,
    abi: factoryAbi,
    functionName: 'isVault',
    args: [vault],
    ...(blockNumber === undefined ? {} : { blockNumber }),
  });
}
