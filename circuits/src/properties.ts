import { cls, expectedOut, F, flags, S } from './model';

export const PROP_NAMES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'] as const;

/** Bits 0, 1, 3, 5, 7: the canonical state codes of spec §3.1. */
const CANONICAL = 0b10101011;

/** Returns a bitmask: bit j set means property P(j+1) of spec §3.6 fails for this (s, v) -> (next, out). */
export function violations(s: number, v: number, next: number, out: number): number {
  const c = cls(s);
  const f = flags(v);
  const released = c === 'released';
  const alive = (f & F.ALIVE) !== 0;
  const wd = (f & F.WD) !== 0;
  const recQ = (f & F.RECQ) !== 0;
  const inhOk = (f & (F.INHQ | F.MAXED)) !== 0;
  const late = (f & F.LATE) !== 0;
  const kPos = (f & F.KPOS) !== 0;
  let bad = 0;
  if (released && (next !== s || out !== 0)) bad |= 1;
  if (!released && alive && next !== S.ACTIVE) bad |= 2;
  if (!released && next === S.RELEASED_INHERIT && !(c === 'grace' && !alive && wd && !recQ && inhOk)) bad |= 4;
  if (!released && next === S.RELEASED_RECOVER && !(c === 'recovery' && !alive && wd && recQ && kPos)) bad |= 8;
  if (c === 'active' && next === S.GRACE && !(late && !alive)) bad |= 16;
  if (c === 'active' && next === S.RECOVERY && !(recQ && !alive)) bad |= 16;
  if (!released && ((CANONICAL >> next) & 1) === 0) bad |= 32;
  if (out !== expectedOut(s, next)) bad |= 64;
  return bad;
}
