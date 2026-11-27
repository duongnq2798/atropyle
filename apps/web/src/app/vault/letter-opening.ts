import type { VaultStatus } from '@atropyle/sdk';
import type { Lang } from '@/i18n/core';
import { chainDate } from '@/lib/when';
import type { messages } from '@/messages/heir.messages';
import { keepDate } from './standing';

type HeirKey = keyof typeof messages.en;

export interface LetterOpening {
  key: Extract<HeirKey, `open${string}`>;
  params: Record<string, string>;
}

const at = (ts: bigint, lang: Lang) => keepDate(chainDate(ts, lang, true));

/**
 * The first lines of the letter, from the stored state and what the rules allow now (status.pending). Dates are chain
 * time, with the time of day (a Drill's moments are minutes apart), and stay whole on a phone (keepDate). Before
 * anything is due the date is the last check-in: "Nothing has happened" (active), "They have been silent since" (late,
 * alarm, due).
 * `recover`: the reader is the recovery wallet the guardians chose. `received`: a transfer of the vault reached the
 * reader (the receipt of their own send, or the vault events after a reload); once released, the letter says so.
 */
export function letterOpening(
  s: Pick<
    VaultStatus,
    'state' | 'pending' | 'expired' | 'lastAlive' | 'windowEndsAt' | 'releasedAt' | 'blockTimestamp'
  >,
  recover: boolean,
  lang: Lang,
  received = false,
): LetterOpening {
  if (s.expired) return { key: 'openExpired', params: {} };
  if (recover) {
    if (s.state === 'releasedRecover')
      return {
        key: received ? 'openRecoverDelivered' : 'openRecoverReleased',
        params: { date: at(s.releasedAt ?? s.blockTimestamp, lang) },
      };
    if (s.pending === 'releasedRecover') return { key: 'openRecoverDue', params: {} };
    return { key: 'openRecoverPending', params: { date: at(s.windowEndsAt ?? s.blockTimestamp, lang) } };
  }
  switch (s.state) {
    case 'releasedInherit':
      return {
        key: received ? 'openDelivered' : 'openReleased',
        params: { date: at(s.releasedAt ?? s.blockTimestamp, lang) },
      };
    case 'releasedRecover':
      return { key: 'openReleasedRecover', params: {} };
    case 'recovery':
      return { key: 'openRecovery', params: {} };
    case 'grace':
      // Spec §18.4.2 T11: in grace the letter opens with "They have been silent since {date}", the last check-in.
      return {
        key: s.pending === 'releasedInherit' ? 'openDue' : 'openAlarm',
        params: { date: at(s.lastAlive, lang) },
      };
    default:
      return { key: s.pending === 'grace' ? 'openSilent' : 'openActive', params: { date: at(s.lastAlive, lang) } };
  }
}
