import type { Timing } from '../types';

/** `AtropyleVault.DRILL_LIFETIME`: a Drill reverts every call from this many seconds after its creation. */
export const DRILL_LIFETIME_SECONDS = 604_800;

/**
 * How the assets can leave the owner's wallet:
 * - `heirs`: to the heirs by their shares, once the owner is late and the alarm window ends; with guardians, only if
 *   `k` of them confirm the death;
 * - `heirsFallback`: to the heirs without any guardian, once the owner has missed 15 periods and the window ended;
 * - `recovery`: to any wallet `k` guardians vote for, once the alarm window that their votes opened ends.
 */
export type ExitRoute = 'heirs' | 'heirsFallback' | 'recovery';

export interface ExitTime {
  route: ExitRoute;
  /** Seconds after the last check-in (for a new vault: after its creation) when the assets can first leave. */
  after: number;
  /** Guardians who must sign for this route; 0 means nobody has to sign anything (anyone can then trigger it). */
  guardians: number;
}

export interface ExitTimes {
  /** Every route that can happen, earliest first. Routes that would end after a Drill expires are left out. */
  routes: ExitTime[];
  /** The first of `routes`; null when none can happen (a Drill that expires first). */
  earliest: ExitTime | null;
  /** A Drill only: seconds after creation when it expires and every call reverts. */
  expiresAfter: number | null;
}

export interface ExitTerms {
  drill: boolean;
  guardians: readonly unknown[];
  k: number;
  recoveryEnabled: boolean;
  timing: Timing;
}

const ORDER: Record<ExitRoute, number> = { recovery: 0, heirs: 1, heirsFallback: 2 };

/**
 * The earliest moments the policy can release, if the owner never checks in again (spec §3.4, AtropyleVault):
 * - Active turns Grace at the first poke once `idle >= T`, that is T·P after the check-in, and raises the alarm;
 * - Grace releases to the heirs at the first poke once the window W has passed and either k guardians confirmed
 *   (always true with k = 0) or idle reached 15 periods;
 * - with recovery on, k matching votes turn Active into Recovery at once, and Recovery releases when W has passed.
 * A Drill reverts every call from its expiry on, `distribute` included, so a route that ends there never happens.
 */
export function exitTimes(c: ExitTerms): ExitTimes {
  const { period: P, threshold: T, window: W } = c.timing;
  const late = T * P;
  const all: ExitTime[] = [];
  if (c.k === 0) all.push({ route: 'heirs', after: late + W, guardians: 0 });
  else {
    all.push({ route: 'heirs', after: late + W, guardians: c.k });
    all.push({ route: 'heirsFallback', after: Math.max(late + W, 15 * P), guardians: 0 });
  }
  if (c.recoveryEnabled && c.k > 0 && c.guardians.length >= c.k) {
    all.push({ route: 'recovery', after: W, guardians: c.k });
  }
  const expiresAfter = c.drill ? DRILL_LIFETIME_SECONDS : null;
  const routes = all
    .filter((r) => expiresAfter === null || r.after < expiresAfter)
    .sort((a, b) => a.after - b.after || ORDER[a.route] - ORDER[b.route]);
  return { routes, earliest: routes[0] ?? null, expiresAfter };
}
