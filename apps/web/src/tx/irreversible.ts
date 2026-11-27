import type { ActionName, PreparedTx, TxPlan } from '@atropyle/sdk';

/** Spec §5.4: what no later transaction can undo (a vault and its fee, a payout, a vote that may move everything). */
export const IRREVERSIBLE: ReadonlySet<ActionName> = new Set<ActionName>(['createVault', 'distribute', 'voteRecovery']);

/** voteRecovery(address); pinned against the vault ABI by test/unit/irreversible.test.ts. */
export const VOTE_RECOVERY_SELECTOR = '0xddec7ea8';

/**
 * voteRecovery(address(0)): a guardian takes the vote back, which a new vote can undo. Read from the bytes (the
 * selector and an all-zero first word), never from the summary; anything else counts as a vote.
 */
export function voteWithdraws(data: string): boolean {
  return (
    data.length >= 74 &&
    data.slice(0, 10).toLowerCase() === VOTE_RECOVERY_SELECTOR &&
    /^0{64}$/.test(data.slice(10, 74))
  );
}

export function stepIsIrreversible(s: Pick<PreparedTx, 'action' | 'data'>): boolean {
  return IRREVERSIBLE.has(s.action) && !(s.action === 'voteRecovery' && voteWithdraws(s.data));
}

/** A plan made only of such steps gets the danger tone on its send button. */
export function planIsIrreversible(plan: TxPlan): boolean {
  return plan.steps.length > 0 && plan.steps.every(stepIsIrreversible);
}
