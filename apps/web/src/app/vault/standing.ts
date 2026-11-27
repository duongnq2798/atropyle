import type { Role, VaultStatus } from '@atropyle/sdk';
import type { Lang, Params } from '@/i18n/core';
import { chainDate } from '@/lib/when';
import type { StandingKey } from '@/messages/standing.messages';

export type StandingRole = 'owner' | 'guest';

type Kind =
  | 'Active'
  | 'Late'
  | 'Grace'
  | 'Due'
  | 'Recovery'
  | 'RecoveryDue'
  | 'ReleasedInherit'
  | 'ReleasedRecover'
  | 'ReleasedInheritDone'
  | 'ReleasedRecoverDone'
  | 'Expired';

export interface StandingInput {
  role: StandingRole | null;
  status: Pick<
    VaultStatus,
    'state' | 'pending' | 'expired' | 'lastAlive' | 'lateAt' | 'alarmAt' | 'windowEndsAt' | 'releasedAt' | 'expiresAt'
  >;
  /** Chain time now: a moment within two days of it gets its time of day. */
  chainNow: bigint;
  lang: Lang;
  /** A Drill's moments are minutes apart: always with the time of day. */
  drill: boolean;
  /**
   * Every asset of the vault has left the owner's wallet (each `held` is 0): once released, the sentence says the
   * assets were delivered instead of offering a delivery that would send nothing (7B-P1).
   */
  delivered: boolean;
}

export interface Standing {
  key: StandingKey;
  params: Params;
}

/** Two days, in seconds. */
const NEAR = 172_800n;

const NBSP = String.fromCharCode(0xa0);
/** The comma before the time of day: the one place a date may break. */
const BEFORE_TIME = /, (?=\d{2}:\d{2} UTC$)/;

/**
 * The date ("26 tháng 11, 2026") and the time ("20:41 UTC") each stay whole on a phone: at lead size a bare
 * "26 tháng" at a line end reads as "26 months" (fix round 2). The line breaks only after the comma between them.
 */
export function keepDate(d: string): string {
  return d
    .split(BEFORE_TIME)
    .map((part) => part.replaceAll(' ', NBSP))
    .join(', ');
}

/** Heirs read their letter and guardians their tab (spec §18.4.2 T9): the sentence is the owner's and a visitor's. */
export function standingRole(roles: readonly Role[]): StandingRole | null {
  if (roles.includes('owner')) return 'owner';
  return roles.length === 0 ? 'guest' : null;
}

/**
 * The header's first sentence: where this vault stands, with absolute dates in chain time (UTC). "Late" and "Due"
 * are the moments the rules allow what nobody has asked for yet (status.pending).
 */
export function standingSentence({
  role,
  status: s,
  chainNow,
  lang,
  drill,
  delivered,
}: StandingInput): Standing | null {
  if (role === null) return null;
  const date = (ts: bigint | null): string => {
    const t = ts ?? chainNow;
    const d = t > chainNow ? t - chainNow : chainNow - t;
    return keepDate(chainDate(t, lang, drill || d < NEAR));
  };
  const say = (kind: Kind, params: Params): Standing => {
    const key: `${StandingRole}${Kind}` = `${role}${kind}`;
    return { key, params };
  };
  if (s.expired) return say('Expired', { date: date(s.expiresAt) });
  switch (s.state) {
    case 'releasedInherit':
      return say(delivered ? 'ReleasedInheritDone' : 'ReleasedInherit', { date: date(s.releasedAt) });
    case 'releasedRecover':
      return say(delivered ? 'ReleasedRecoverDone' : 'ReleasedRecover', { date: date(s.releasedAt) });
    case 'recovery':
      return s.pending === 'releasedRecover'
        ? say('RecoveryDue', { date: date(s.windowEndsAt) })
        : say('Recovery', { date: date(s.alarmAt), until: date(s.windowEndsAt) });
    case 'grace':
      return s.pending === 'releasedInherit'
        ? say('Due', { date: date(s.windowEndsAt) })
        : say('Grace', { date: date(s.alarmAt), until: date(s.windowEndsAt) });
    case 'active':
      return s.pending === 'grace'
        ? say('Late', { date: date(s.lateAt), since: date(s.lastAlive) })
        : say('Active', { date: date(s.lastAlive), until: date(s.lateAt) });
  }
}
