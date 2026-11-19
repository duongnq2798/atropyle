/** Reference model of AtropylePolicy v1, spec §3. State bits: bit0 = A, bit1 = R, bit2 = X. */

export const S = { ACTIVE: 0, GRACE: 1, RECOVERY: 3, RELEASED_INHERIT: 5, RELEASED_RECOVER: 7 } as const;
export const OUT = { ALARM: 1, CANCEL: 2, RELEASE: 4 } as const;
export const F = { INHQ: 1, RECQ: 2, LATE: 4, MAXED: 8, ALIVE: 16, WD: 32, KPOS: 64 } as const;

export type Cls = 'active' | 'grace' | 'recovery' | 'released';

export interface PolicyInputs {
  idle: number;
  threshold: number;
  inhVotes: number;
  recVotes: number;
  k: number;
  alive: boolean;
  windowDone: boolean;
}

export function packInputs(i: PolicyInputs): number {
  const fields: Array<[number, number, string]> = [
    [i.idle, 15, 'idle'],
    [i.threshold, 15, 'threshold'],
    [i.inhVotes, 31, 'inhVotes'],
    [i.recVotes, 31, 'recVotes'],
    [i.k, 7, 'k'],
  ];
  for (const [v, max, name] of fields) {
    if (!Number.isInteger(v) || v < 0 || v > max) throw new Error(`${name} out of range`);
  }
  return (
    i.idle |
    (i.threshold << 4) |
    (i.inhVotes << 8) |
    (i.recVotes << 13) |
    (i.k << 18) |
    (i.alive ? 1 << 21 : 0) |
    (i.windowDone ? 1 << 22 : 0)
  );
}

export function unpackInputs(v: number): PolicyInputs {
  return {
    idle: v & 15,
    threshold: (v >>> 4) & 15,
    inhVotes: (v >>> 8) & 31,
    recVotes: (v >>> 13) & 31,
    k: (v >>> 18) & 7,
    alive: ((v >>> 21) & 1) === 1,
    windowDone: ((v >>> 22) & 1) === 1,
  };
}

export function cls(s: number): Cls {
  if (s & 4) return 'released';
  if ((s & 1) === 0) return 'active';
  return s & 2 ? 'recovery' : 'grace';
}

export function popcount(x: number): number {
  let c = 0;
  for (let y = x >>> 0; y !== 0; y >>>= 1) c += y & 1;
  return c;
}

const POP5 = Uint8Array.from({ length: 32 }, (_, x) => popcount(x));

/** Derived signals of spec §3.3 as F-flags. */
export function flags(v: number): number {
  const idle = v & 15;
  const t = (v >>> 4) & 15;
  const k = (v >>> 18) & 7;
  let f = 0;
  if (POP5[(v >>> 8) & 31] >= k) f |= F.INHQ;
  if (k !== 0 && POP5[(v >>> 13) & 31] >= k) f |= F.RECQ;
  if (idle >= t) f |= F.LATE;
  if (idle === 15) f |= F.MAXED;
  if ((v >>> 21) & 1) f |= F.ALIVE;
  if ((v >>> 22) & 1) f |= F.WD;
  if (k !== 0) f |= F.KPOS;
  return f;
}

/** Transition function, spec §3.4, in priority order. */
export function nextState(s: number, v: number): number {
  const c = cls(s);
  if (c === 'released') return s;
  const f = flags(v);
  if (f & F.ALIVE) return S.ACTIVE;
  const recQ = (f & F.RECQ) !== 0;
  const late = (f & F.LATE) !== 0;
  const wd = (f & F.WD) !== 0;
  if (c === 'recovery') {
    if (recQ && wd) return S.RELEASED_RECOVER;
    if (recQ) return S.RECOVERY;
    return late ? S.GRACE : S.ACTIVE;
  }
  if (c === 'grace') {
    if (recQ) return S.RECOVERY;
    return wd && (f & (F.INHQ | F.MAXED)) !== 0 ? S.RELEASED_INHERIT : S.GRACE;
  }
  if (recQ) return S.RECOVERY;
  return late ? S.GRACE : S.ACTIVE;
}

/** Output flags, spec §3.5. */
export function expectedOut(s: number, next: number): number {
  const cs = cls(s);
  const cn = cls(next);
  const alarmCls = (c: Cls) => c === 'grace' || c === 'recovery';
  let o = 0;
  if (alarmCls(cn) && cn !== cs) o |= OUT.ALARM;
  if (alarmCls(cs) && next === S.ACTIVE) o |= OUT.CANCEL;
  if (cs !== 'released' && cn === 'released') o |= OUT.RELEASE;
  return o;
}

export function refStepCode(s: number, v: number): number {
  const n = nextState(s, v);
  return n | (expectedOut(s, n) << 3);
}

export function refStep(s: number, i: PolicyInputs): { next: number; out: number } {
  const c = refStepCode(s, packInputs(i));
  return { next: c & 7, out: c >>> 3 };
}
