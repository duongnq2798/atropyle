/** Motion tokens (spec §4.4). Durations are milliseconds; motion takes seconds, hence `sec`. */
export const DURATION = { instant: 90, quick: 160, base: 240, slow: 420, story: 720 } as const;
export type DurationName = keyof typeof DURATION;

export const sec = (ms: number): number => ms / 1000;

/** `out-expo` for things that appear, `in-out-sine` for breathing (globals.css has the same curves). */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT_SINE = [0.37, 0, 0.63, 1] as const;

/** The default spring. globals.css `--ease-spring` is the same curve for CSS (Quyết định 11). */
export const SPRING = { type: 'spring', stiffness: 380, damping: 32, mass: 1 } as const;
/** Where the CSS approximation of SPRING ends: |x − 1| < 0.0015 from here on. */
export const SPRING_MS = 443;
/** The check-in ritual: hold 600 ms (spec §4.6). */
export const HOLD_MS = 600;
/** Under prefers-reduced-motion every transition becomes a crossfade of this length (spec §4.4). */
export const REDUCED_MS = 120;

/** Position of SPRING released from rest at 0 towards 1, `t` in seconds (underdamped closed form). */
export function springAt(t: number): number {
  const { stiffness: k, damping: c, mass: m } = SPRING;
  const wn = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  const wd = wn * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + ((zeta * wn) / wd) * Math.sin(wd * t));
}

/** The stops of CSS `linear()`: `samples` points over SPRING_MS, four decimals, the last pinned to 1. */
export function springStops(samples = 25): number[] {
  return Array.from({ length: samples }, (_, i) =>
    i === samples - 1 ? 1 : Math.round(springAt((i * SPRING_MS) / 1000 / (samples - 1)) * 1e4) / 1e4,
  );
}
