import {
  formatDuration,
  isReleasedState,
  type Timeline,
  type VaultConfig,
  type VaultStatus,
  type Warning,
} from '@atropyle/sdk';

/** Unix seconds to ISO 8601, without milliseconds. */
export function iso(t: bigint | number | null | undefined): string | null {
  if (t === null || t === undefined) return null;
  return new Date(Number(t) * 1000).toISOString().replace('.000Z', 'Z');
}
const at = (t: bigint | null) => iso(t) ?? 'an unknown time';

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

export const COVERAGE_WARNING: Warning = {
  code: 'COVERAGE_BELOW_100',
  message: 'Some assets are not fully approved to the vault. Heirs would receive only the approved part.',
};

/** Plain-language lines about a vault. Built only from typed fields: no token names, no on-chain strings. */
export function explainStatus(s: VaultStatus, c: VaultConfig, t: Timeline): string[] {
  const lines: string[] = [];
  const released = isReleasedState(s.state);
  switch (s.state) {
    case 'active':
      lines.push(
        `Active. The owner last checked in at ${at(s.lastAlive)} and should check in every ${formatDuration(c.timing.period)}. After ${at(s.lateAt)} the owner counts as late and the alarm can go off.`,
      );
      break;
    case 'grace':
      lines.push(
        `Grace. The alarm went off at ${at(s.alarmAt)}. The owner can cancel it by checking in before ${at(s.windowEndsAt)}.`,
      );
      break;
    case 'recovery':
      lines.push(
        `Recovery pending. Guardians voted to move everything to ${s.recoveryTarget ?? 'a new wallet'}. The owner can cancel by checking in before ${at(s.windowEndsAt)}.`,
      );
      break;
    case 'releasedInherit':
      lines.push(
        `Released to the heirs at ${at(s.releasedAt)}. Anyone can call distribute to pay them, again for tokens that arrive later.`,
      );
      break;
    case 'releasedRecover':
      lines.push(
        `Released to the recovery wallet ${s.recoveryTarget ?? 'chosen by the guardians'} at ${at(s.releasedAt)}. Anyone can call distribute.`,
      );
      break;
  }
  // status().pending is what a poke from anyone but the owner would produce; the owner's poke is a check-in.
  if (s.pending !== s.state) {
    lines.push(
      `The policy already allows a move to ${s.pending}. A poke from anyone but the owner records it; from the owner it is a check-in.`,
    );
  }
  if (!released && c.guardians.length > 0) {
    lines.push(`${s.inhVotes} of ${c.guardians.length} guardians have attested death; the vault needs ${c.k}.`);
  }
  if (c.drill) {
    lines.push(
      s.expired
        ? 'This Drill has expired and accepts no more actions.'
        : `This is a Drill, a practice vault. It expires at ${at(s.expiresAt)}.`,
    );
  }
  if (!released && t.earliestRelease !== null)
    lines.push(`If nobody acts, the earliest release is ${at(t.earliestRelease)}.`);
  const short = s.assets.filter((a) => a.coverage < a.held).length;
  if (short > 0) lines.push(`${short} of ${s.assets.length} assets are not fully approved to the vault.`);
  return lines;
}
