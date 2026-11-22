import { type AtropyleClient, keeperTick, timelineOf } from '@atropyle/sdk';
import { getAddress, type WalletClient } from 'viem';
import type { ChainPort } from './port';
import { deriveView } from './view';

/**
 * The real chain: the SDK over the deployment's read transport (plan ruling 6: MAX_BATCH 3, 100-block log ranges)
 * and, for the keeper only, the wallet from keeper/signer.ts (null = dry run).
 */
export function createSdkChain(atro: AtropyleClient, o: { wallet: WalletClient | null }): ChainPort {
  return {
    factoryBlock: atro.deployment.factoryBlock,
    async head() {
      const b = await atro.publicClient.getBlock();
      return { number: b.number, timestamp: b.timestamp };
    },
    scan: (r) => atro.scan({ resume: r.resume, toBlock: r.toBlock }),
    async blockTime(blockNumber) {
      return (await atro.publicClient.getBlock({ blockNumber })).timestamp;
    },
    async view(vault) {
      const snap = await atro.vault(vault).snapshot();
      const engine = await atro.engineFor(snap.binding.cpu, snap.binding.policyId);
      return deriveView(snap, timelineOf(engine, snap));
    },
    isVault: (vault) => atro.vault(vault).registered(),
    keeper: (run) =>
      keeperTick(atro, run.vaults, {
        wallet: o.wallet ?? undefined,
        maxTx: run.maxTx,
        lastDistributeAt: (vault) => run.lastDistributeAt.get(getAddress(vault)) ?? null,
      }),
    integrity: () => atro.integrity(),
  };
}
