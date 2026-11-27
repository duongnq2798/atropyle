import type { Recipient, Timeline, VaultConfig } from '@atropyle/sdk';
import type { ThreadState } from '@/thread/state';
import { type HeaderThread, headerThread } from './header-thread';

export interface LetterReader {
  /** The reader's index among the heirs, or -1. */
  heir: number;
  /** The reader is the recovery wallet. */
  recover: boolean;
}

const RECOVERY: readonly ThreadState[] = ['recovery', 'releasedRecover'];
const SCALE = 1_000_000n;

/**
 * One weight per heir for the letter's branches: what recipientsFor says each heir would receive now, as a share of
 * each asset (so six-decimal and eighteen-decimal tokens and NFTs weigh alike), summed over the assets. When nothing is
 * covered (an empty wallet, or after delivery) the plan's basis points draw the branches instead.
 */
export function branchWeights(
  heirs: Pick<VaultConfig, 'heirs'>['heirs'],
  recipients: readonly Pick<Recipient, 'assetIndex' | 'to' | 'amount'>[],
): number[] {
  const totals = new Map<number, bigint>();
  for (const r of recipients) totals.set(r.assetIndex, (totals.get(r.assetIndex) ?? 0n) + r.amount);
  const w = heirs.map(() => 0);
  for (const r of recipients) {
    const total = totals.get(r.assetIndex) ?? 0n;
    const i = heirs.findIndex((h) => h.account.toLowerCase() === r.to.toLowerCase());
    if (i >= 0 && total > 0n) w[i] += Number((r.amount * SCALE) / total) / Number(SCALE);
  }
  return w.some((x) => x > 0) ? w : heirs.map((h) => h.bps);
}

/**
 * The letter's thread (spec §18.4.2 T11): the header's axis, posts and wave, the last check-in tied as a knot, and the
 * course that ends with the reader. An heir reads the inheritance: `releasedInherit`, dashed past "now" until the vault
 * has passed on, with one branch per heir weighed by recipientsFor and the reader's drawn in thread. While a recovery
 * is under way (or the rules allow one) an heir sees the header's own thread: the course turns away from the heirs, and
 * the letter must not draw branches that may never grow. The recovery wallet reads `releasedRecover`, one course to it,
 * dashed until released. An expired Drill curls up whoever reads it.
 */
export function letterThread(
  config: Pick<VaultConfig, 'guardians' | 'k' | 'heirs'>,
  s: Parameters<typeof headerThread>[1],
  timeline: Pick<Timeline, 'earliestRelease'>,
  now: bigint,
  reader: LetterReader,
  /** recipientsFor(snap, 'releasedInherit', null): who would receive what if the vault passed to the heirs now. */
  inherit: readonly Pick<Recipient, 'assetIndex' | 'to' | 'amount'>[],
): HeaderThread {
  const base = headerThread(config, s, timeline, now);
  const released = s.state === 'releasedInherit' || s.state === 'releasedRecover';
  let state: ThreadState;
  let predicted: boolean;
  if (s.expired) [state, predicted] = ['expired', false];
  else if (reader.recover) [state, predicted] = ['releasedRecover', s.state !== 'releasedRecover'];
  else if (released) [state, predicted] = [s.state, false];
  else if (RECOVERY.includes(s.state) || RECOVERY.includes(s.pending))
    [state, predicted] = [base.state, base.predicted];
  else [state, predicted] = ['releasedInherit', true];
  const highlight = !reader.recover && reader.heir >= 0 ? reader.heir : undefined;
  return {
    state,
    predicted,
    input: {
      ...base.input,
      // headerThread always returns an axis; the guard only satisfies the optional type.
      axis: base.input.axis && { ...base.input.axis, marks: [s.lastAlive] },
      predicted,
      branches: branchWeights(config.heirs, inherit),
      highlight,
    },
  };
}
