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
}

export interface Standing {
  key: StandingKey;
  params: Params;
}

/** Two days, in seconds. */
const NEAR = 172_800n;

/** Heirs read their letter and guardians their tab (spec §18.4.2 T9): the sentence is the owner's and a visitor's. */
export function standingRole(roles: readonly Role[]): StandingRole | null {
  if (roles.includes('owner')) return 'owner';
  return roles.length === 0 ? 'guest' : null;
}

/**
 * The header's first sentence: where this vault stands, with absolute dates in chain time (UTC). "Late" and "Due"
 * are the moments the rules allow what nobody has asked for yet (status.pending).
 */
export function standingSentence({ role, status: s, chainNow, lang, drill }: StandingInput): Standing | null {
  if (role === null) return null;
  const date = (ts: bigint | null): string => {
    const t = ts ?? chainNow;
    const d = t > chainNow ? t - chainNow : chainNow - t;
    return chainDate(t, lang, drill || d < NEAR);
  };
  const say = (kind: Kind, params: Params): Standing => {
    const key: `${StandingRole}${Kind}` = `${role}${kind}`;
    return { key, params };
  };
  if (s.expired) return say('Expired', { date: date(s.expiresAt) });
  switch (s.state) {
    case 'releasedInherit':
      return say('ReleasedInherit', { date: date(s.releasedAt) });
    case 'releasedRecover':
      return say('ReleasedRecover', { date: date(s.releasedAt) });
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
