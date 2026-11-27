/** Share of the slider's span within which a pointer snaps to a moment (spec §18.4.2). */
export const DETENT_SHARE = 0.02;
/**
 * The smallest snap distance in seconds: on a Drill run of a few minutes, 2 % is about one step, and a detent no
 * wider than a step would never catch.
 */
export const DETENT_MIN_S = 2;

/**
 * The moment nearest to `value` when one lies within the detent, else `value`. For pointer input only: the arrow
 * keys must reach every step, and Page Up / Page Down already land on moments.
 */
export function snapToMoment(value: number, moments: readonly number[], span: number): number {
  const radius = Math.max(span * DETENT_SHARE, DETENT_MIN_S);
  let best = value;
  let gap = Number.POSITIVE_INFINITY;
  for (const m of moments) {
    const d = Math.abs(m - value);
    if (d <= radius && d < gap) {
      best = m;
      gap = d;
    }
  }
  return best;
}

/**
 * The offset under a pointer at clientX `x`. Radix keeps the thumb's centre inside [half, width − half] but maps the
 * pointer over the whole width, so near the ends the thumb would stand up to half a thumb away from the pointer
 * (and from the moment it should snap to). This maps over the inset track the Thread is drawn on, on the slider's
 * step grid, clamped to the span so the end stays reachable. Null when the root is too narrow to have a track.
 */
export function pointerOffset(
  x: number,
  left: number,
  width: number,
  half: number,
  span: number,
  step: number,
): number | null {
  const inner = width - 2 * half;
  if (inner <= 0 || span <= 0) return null;
  const share = Math.min(1, Math.max(0, (x - left - half) / inner));
  return Math.min(span, Math.round((share * span) / step) * step);
}
