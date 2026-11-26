import type { PolicyInputs } from '@atropyle/circuits';
import { deriveInputs, type EvalState, type Heir, PRESETS, STATE_CODES } from '@atropyle/sdk';
import type { HeroCase } from '../hero-cases';

const DAY = 86_400n;
const SIX = PRESETS.sixMonths;
/** When the owner of HERO_BASE, last seen at 0, is due: threshold periods later (180 days). */
const DUE = BigInt(SIX.threshold) * BigInt(SIX.period);

/**
 * A vault on the sixMonths preset: k = 1 of two guardians, recovery on (spec §18.4.3 Task 5′). The addresses are
 * placeholders. Task 6's stage starts from it too (hero-sim-days-order).
 */
export const HERO_BASE: EvalState = {
  state: STATE_CODES.active,
  owner: '0x1111111111111111111111111111111111111111',
  lastAlive: 0n,
  alarmAt: 0n,
  timing: SIX,
  k: 1,
  recoveryEnabled: true,
  guardians: ['0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333'],
  inhVotes: 0,
  recVotes: [null, null],
  recoveryTarget: null,
};

/** The two heirs of HERO_BASE, 70/30: EvalState carries none, and Task 6 names them. */
export const HERO_HEIRS: readonly Heir[] = [
  { account: '0x4444444444444444444444444444444444444444', bps: 7_000 },
  { account: '0x5555555555555555555555555555555555555555', bps: 3_000 },
];

export interface HeroState {
  state: EvalState;
  /** When the question is asked, in seconds from the owner's first check-in. */
  at: bigint;
  /** What AtropyleVault._evaluate feeds the circuit then (deriveInputs). */
  inputs: PolicyInputs;
}

function asked(state: EvalState, at: bigint, alive: boolean): HeroState {
  return { state, at, inputs: deriveInputs(state, at, { alive }) };
}

/**
 * alive: active, checked in yesterday, checking in now. silent: grace, the alarm raised at DUE, its window over, k
 * guardians confirmed. liar: active, checked in yesterday, a guardian confirms anyway.
 */
export const HERO_STATES: Readonly<Record<HeroCase, HeroState>> = {
  alive: asked({ ...HERO_BASE, lastAlive: DUE - DAY }, DUE, true),
  silent: asked({ ...HERO_BASE, state: STATE_CODES.grace, alarmAt: DUE, inhVotes: 1 }, DUE + BigInt(SIX.window), false),
  liar: asked({ ...HERO_BASE, lastAlive: DUE - DAY, inhVotes: 1 }, DUE, false),
};
