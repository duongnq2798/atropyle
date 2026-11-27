import {
  DRILL_LIFETIME_SECONDS,
  type EvalState,
  type PlanConfig,
  type PlanIssue,
  PRESETS,
  parseDuration,
  STATE_CODES,
} from '@atropyle/sdk';
import type { Address } from 'viem';
import type { TimingForm } from './create-form';

/** Spec §5.2: seven steps. `kind` and `review` edit nothing the plan check names, `done` is after the send. */
export const WIZARD_STEPS = ['kind', 'heirs', 'guardians', 'timing', 'assets', 'review', 'done'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
export type FieldStep = 'heirs' | 'guardians' | 'timing' | 'assets';
const FIELD_STEPS: readonly FieldStep[] = ['heirs', 'guardians', 'timing', 'assets'];

/** The step whose fields an issue names; anything the form cannot name (version, drill, owner) lands on the last. */
export function wizardStepOfIssue(path: string): FieldStep {
  const head = path.split(/[.[]/)[0];
  if (head === 'heirs') return 'heirs';
  if (head === 'guardians' || head === 'k' || head === 'recoveryEnabled') return 'guardians';
  if (head === 'timing') return 'timing';
  return 'assets';
}

/** Issues that keep the user on `step`: its own and those of every step before it. */
export function issuesThrough(issues: readonly PlanIssue[], step: WizardStep): PlanIssue[] {
  const last = WIZARD_STEPS.indexOf(step);
  return issues.filter((i) => WIZARD_STEPS.indexOf(wizardStepOfIssue(i.path)) <= last);
}

export function firstWizardStep(issues: readonly PlanIssue[]): FieldStep | null {
  return FIELD_STEPS.find((s) => issues.some((i) => wizardStepOfIssue(i.path) === s)) ?? null;
}

/** AtropyleVault.DRILL_LIFETIME, from the SDK: a Drill reverts every call this long after its creation. */
export const DRILL_LIFETIME: bigint = BigInt(DRILL_LIFETIME_SECONDS);

/** The state a vault built from this plan would have right after creation, for the time machine's preview. */
export function planEvalState(
  config: PlanConfig,
  owner: Address,
  now: bigint,
): { state: EvalState; expiresAt: bigint | null } {
  return {
    state: {
      state: STATE_CODES.active,
      owner,
      lastAlive: now,
      alarmAt: 0n,
      timing: config.timing,
      k: config.k,
      recoveryEnabled: config.recoveryEnabled,
      guardians: [...config.guardians],
      inhVotes: 0,
      recVotes: config.guardians.map(() => null),
      recoveryTarget: null,
    },
    expiresAt: config.drill ? now + DRILL_LIFETIME : null,
  };
}

/**
 * The alarm window the timing step holds, in seconds: the preset's, or the custom field's once it parses to more
 * than 0. The guardians step says it in the RECOVERY_POWER sentence; null while it is not known yet.
 */
export function timingWindow(t: TimingForm): number | null {
  if (t.preset !== 'custom') return PRESETS[t.preset].window;
  try {
    const s = parseDuration(t.window.trim(), 'timing.window');
    return s > 0 ? s : null;
  } catch {
    return null;
  }
}
