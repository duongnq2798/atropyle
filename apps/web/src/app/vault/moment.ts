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
 * The line under the header's thread (spec §18.4.2 T9), most urgent first: right after this page's own send, the
 * change it made (the read may still be the older one); else what the rules allow now that nobody has asked for;
 * else the last change seen (this page's send, or anyone's poke between two reads), while the vault is still there;
 * else nothing.
 */
export function momentOf(s: Pick<VaultStatus, 'state' | 'pending' | 'expired'>, moved: Moved | null): Moment {
  if (moved && s.pending !== s.state && moved.to === s.pending)
    return { kind: 'moved', state: moved.to, block: moved.block };
  if (!s.expired && s.pending !== s.state) return { kind: 'predicted', state: s.pending };
  if (moved && moved.to === s.state) return { kind: 'moved', state: moved.to, block: moved.block };
  return { kind: 'none' };
}
