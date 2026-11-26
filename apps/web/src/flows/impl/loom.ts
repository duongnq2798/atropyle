import {
  DRILL_LIFETIME_SECONDS,
  type ExitTerms,
  type ExitTimes,
  exitTimes,
  PRESETS,
  parseDuration,
} from '@atropyle/sdk';
import type { TimingForm } from './create-form';

export { exitTimes };

export type LoomTiming = ExitTerms['timing'];

/** The timing a form holds, or null while a custom field cannot be read (the preview then waits). */
export function timingOf(t: TimingForm): LoomTiming | null {
  if (t.preset !== 'custom') {
    const p = PRESETS[t.preset];
    return { period: p.period, threshold: p.threshold, window: p.window };
  }
  try {
    const period = parseDuration(t.period.trim(), 'timing.period');
    const window = parseDuration(t.window.trim(), 'timing.window');
    const threshold = Number(t.threshold.trim());
    if (!(period > 0 && window > 0 && Number.isInteger(threshold) && threshold >= 1)) return null;
    return { period, threshold, window };
  } catch {
    return null;
  }
}

export interface LoomInput {
  drill: boolean;
  /** Guardians the plan will hold (0 without guardians). */
  guardians: number;
  /** The k the plan will hold (0 without guardians). */
  k: number;
  recoveryEnabled: boolean;
  timing: TimingForm;
}

export interface Loom {
  timing: LoomTiming | null;
  exits: ExitTimes | null;
  /** releasedInherit: the heirs can receive; expired: a Drill that ends before any heirs route. */
  state: 'releasedInherit' | 'expired';
  /** Seconds since creation, on the Thread's time axis; null while the timing cannot be read. */
  axis: { from: bigint; now: bigint; alarmAt: bigint; releaseAt: bigint | null; to: bigint } | null;
  /** Seconds after creation when the heirs can first receive, by any heirs route; null when none can happen. */
  heirsAfter: number | null;
  /** A recovery route exists: the Thread draws its dashed exit. */
  exit: boolean;
}

/**
 * The plan being written as the Thread draws it (spec §18.4.2 loom-preview): pure, from the form alone, so the
 * preview needs no RPC and no engine. The same exitTimes the sign page's TermsCard reads.
 */
export function loomOf(p: LoomInput): Loom {
  const timing = timingOf(p.timing);
  if (!timing)
    return { timing: null, exits: null, state: 'releasedInherit', axis: null, heirsAfter: null, exit: false };
  const guarded = p.guardians > 0 && p.k > 0;
  const exits = exitTimes({
    drill: p.drill,
    guardians: Array.from({ length: guarded ? p.guardians : 0 }),
    k: guarded ? p.k : 0,
    recoveryEnabled: guarded && p.recoveryEnabled,
    timing,
  });
  const heirs = exits.routes.find((r) => r.route !== 'recovery') ?? null;
  const alarmAt = BigInt(timing.threshold * timing.period);
  const end = BigInt(heirs ? heirs.after : (exits.expiresAfter ?? DRILL_LIFETIME_SECONDS));
  // The home thread's composition: the axis runs half a release past the gate, so the gate stands at GATE_X (two
  // thirds) and drawnAxis leaves it there; the posts, the exit and the heirs' branches get the last third to fan out.
  const to = heirs ? end + end / 2n : end > alarmAt ? end : alarmAt + 1n;
  return {
    timing,
    exits,
    state: heirs ? 'releasedInherit' : 'expired',
    axis: { from: 0n, now: 0n, alarmAt, releaseAt: heirs ? end : null, to },
    heirsAfter: heirs?.after ?? null,
    exit: exits.routes.some((r) => r.route === 'recovery'),
  };
}
