import type { PreparedTx } from '@atropyle/sdk';
import { ACTION_KEY, type FlowKey } from '@/messages/tx-flow.messages';
import { voteWithdraws } from './irreversible';
import { isRevoke, type MirrorCall } from './mirror';

/**
 * The plain title of a step: what it does for the person, from the action and the approval decoded from its
 * calldata. A grant to anyone but the vault or the factory says so. Without a decoded call, the neutral title of the
 * action. The SDK's summary stays under it, in English.
 */
export function stepTitleKey(step: Pick<PreparedTx, 'action' | 'data'>, call: MirrorCall | null): FlowKey {
  if (step.action === 'voteRecovery' && voteWithdraws(step.data)) return 'actVoteWithdraw';
  const a = call?.approval ?? null;
  if (!a) return ACTION_KEY[step.action];
  const off = isRevoke(a);
  switch (a.kind) {
    case 'erc20':
      if (a.spenderRole === 'factory') return off ? 'apprFeeOff' : 'apprFee';
      if (off) return 'apprTokenOff';
      return a.spenderRole === 'vault' ? 'apprToken' : 'apprUnknown';
    case 'erc721':
      if (off) return 'apprNftOff';
      return a.spenderRole === 'vault' ? 'apprNft' : 'apprUnknown';
    case 'all':
      if (off) return 'apprAllOff';
      return a.spenderRole === 'vault' ? 'apprAll' : 'apprUnknown';
    case 'unknown':
      return 'apprUnknown';
  }
}
