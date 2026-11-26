import type { SendResult, StateName, VaultStatus } from '@atropyle/sdk';
import { stateChanges } from '@/tx/receipt-view';

/**
 * A change of state this page saw confirmed, and the block that carried it: from the receipt of its own send
 * (movedOf), or found between two of its reads (flows.movedBetween) when someone else sent it.
 */
export interface Moved {
  to: StateName;
  block: bigint;
}

export type Moment =
  | { kind: 'predicted'; state: StateName }
  | { kind: 'moved'; state: StateName; block: bigint }
  | { kind: 'none' };

/** The last state change of a confirmed send; null when it changed none (a distribute). */
export function movedOf(r: SendResult): Moved | null {
  for (const step of [...r.steps].reverse()) {
    const c = stateChanges(step.events).at(-1);
    if (c) return { to: c.to, block: step.blockNumber };
  }
  return null;
}

/**
 * The line under the header's thread (spec §18.4.2 T9), most urgent first: a change newer than the read (this page's
 * own receipt, while the read is still the older one); else what the rules allow now that nobody has asked for; else
 * the last change seen (this page's send, or anyone's poke between two reads), while the vault is still there; else
 * nothing. A change at or before the read's block is never told as the one the read is waiting for: the read already
 * carries it, and the state may have moved since (review fix 1).
 */
export function momentOf(
  s: Pick<VaultStatus, 'state' | 'pending' | 'expired' | 'blockNumber'>,
  moved: Moved | null,
): Moment {
  if (moved && moved.block > s.blockNumber) return { kind: 'moved', state: moved.to, block: moved.block };
  if (!s.expired && s.pending !== s.state) return { kind: 'predicted', state: s.pending };
  if (moved && moved.to === s.state) return { kind: 'moved', state: moved.to, block: moved.block };
  return { kind: 'none' };
}

/**
 * What the page does between two consecutive reads: nothing (no newer read, or the same state within a span it saw
 * whole), one eth_getLogs for the change (the span fits `range`, deployment.logsBlockRange), or nothing it can know
 * ('blind': a tab asleep, so the state may have gone and come back).
 */
export function betweenReads(
  from: Pick<VaultStatus, 'state' | 'blockNumber'>,
  to: Pick<VaultStatus, 'state' | 'blockNumber'>,
  range: bigint,
): 'none' | 'lookup' | 'blind' {
  if (to.blockNumber <= from.blockNumber) return 'none';
  if (to.blockNumber - from.blockNumber > range) return 'blind';
  return from.state === to.state ? 'none' : 'lookup';
}

/**
 * After a span the page could not see into (blind, or a lookup that failed or found nothing), only a change newer than
 * the span's older read can still be the last one.
 */
export function forgetBefore(cur: Moved | null, block: bigint): Moved | null {
  return cur && cur.block > block ? cur : null;
}
