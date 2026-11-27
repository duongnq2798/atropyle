import type { TimelineEvent, TimelineEventKind, VaultStatus } from '@atropyle/sdk';
import type { messages } from '@/messages/vault.messages';

type VaultKey = keyof typeof messages.en;

const EVENT_KEY = {
  alarm: 'nextAlarm',
  release: 'nextRelease',
  drillExpiry: 'nextDrillExpiry',
} as const satisfies Record<TimelineEventKind, VaultKey>;

export interface NextStep {
  /** A timeline event still ahead, or the release: due (allowed, not asked for yet) or done. */
  kind: TimelineEventKind | 'releaseDue' | 'released';
  at: bigint;
  key: VaultKey;
}

/**
 * The countdown under the end of the header's thread. While the vault is on its way it names the next moment still
 * ahead. Once the release is due, or done, that moment would be the Drill's expiry a week out ("The Drill expires in
 * 6d 23h"), which says nothing about this vault's turn: the line speaks of the release instead, and since when
 * (7B-P1). An expired Drill keeps its timeline: nothing more can happen in it.
 */
export function nextStep(
  s: Pick<VaultStatus, 'state' | 'pending' | 'expired' | 'blockTimestamp' | 'windowEndsAt' | 'releasedAt'>,
  events: readonly TimelineEvent[],
): NextStep | null {
  if (!s.expired) {
    const recover = s.state === 'releasedRecover' || s.pending === 'releasedRecover';
    if ((s.state === 'releasedInherit' || s.state === 'releasedRecover') && s.releasedAt !== null) {
      return { kind: 'released', at: s.releasedAt, key: recover ? 'nextReleasedRecover' : 'nextReleased' };
    }
    const due =
      (s.state === 'grace' && s.pending === 'releasedInherit') ||
      (s.state === 'recovery' && s.pending === 'releasedRecover');
    if (due && s.windowEndsAt !== null) {
      return { kind: 'releaseDue', at: s.windowEndsAt, key: recover ? 'nextReleaseDueRecover' : 'nextReleaseDue' };
    }
  }
  const e = events.find((x) => x.at > s.blockTimestamp);
  return e ? { kind: e.kind, at: e.at, key: EVENT_KEY[e.kind] } : null;
}
