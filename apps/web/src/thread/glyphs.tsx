import { cn } from '@/lib/cn';

export type GlyphName =
  | 'active'
  | 'grace'
  | 'recovery'
  | 'releasedInherit'
  | 'releasedRecover'
  | 'expired'
  | 'drill'
  | 'knot'
  | 'mark';

export const GLYPH_NAMES: readonly GlyphName[] = [
  'active',
  'grace',
  'recovery',
  'releasedInherit',
  'releasedRecover',
  'expired',
  'drill',
  'knot',
  'mark',
];

const GATE = 'M9 19V9.5a3 3 0 0 1 6 0V19';

/** Nine glyphs in the thread's own line (spec §4.5): 24 × 24, stroke 1.5, round ends, like Lucide. */
const SHAPES: Record<GlyphName, { d: string[]; dots?: [number, number][]; dashed?: string }> = {
  // A heartbeat travelling along the thread.
  active: { d: ['M2 12h5l2-4.5 3 9 2-4.5h8'] },
  // The thread runs, then frays into three strands.
  grace: { d: ['M2 12h10', 'M12 12c2.5 0 4-2 7.5-3.5', 'M12 12c2.5 0 5 .5 8.5.5', 'M12 12c2 .5 3.5 2.5 6 4.5'] },
  // The thread bends away to a new wallet.
  recovery: { d: ['M2 16h7c4.5 0 6-7.5 10-7.5'], dots: [[20.5, 8.5]] },
  // Through the gate, then three branches.
  releasedInherit: { d: ['M2 15h7', GATE, 'M15 15c3 0 3.5-5 7-5', 'M15 15h7', 'M15 15c3 0 3.5 4 7 4'] },
  // Through the gate, one branch to the recovery wallet.
  releasedRecover: { d: ['M2 15h7', GATE, 'M15 15c3 0 3.5-6.5 5.5-6.5'], dots: [[21, 8.5]] },
  // A short thread that curls up.
  expired: { d: ['M2 12h9a4 4 0 1 1-4 4 2.5 2.5 0 0 1 2.5-2.5'] },
  // A practice loop: the dashed part is the Drill.
  drill: { d: ['M2 12h4', 'M18 12h4'], dashed: 'M6 12a6 5 0 1 0 12 0a6 5 0 1 0-12 0' },
  // A knot tied on the thread: one check-in.
  knot: { d: ['M2 12h6', 'M16 12h6', 'M8 12c0-3 2-4.5 4-4.5s4 1.5 4 4.5-2 4.5-4 4.5-4-1.5-4-4.5Z', 'M9.5 9l5 6'] },
  // The mark: the thread rises into the gate's arch and goes on beyond it, in one stroke (§18.4.1 item 8).
  mark: { d: ['M2 18c2.5 0 4.5-1 4.5-4v-3a5.5 5.5 0 0 1 11 0v3c0 3 2 4 4.5 4'] },
};

export function StateGlyph({ name, size = 16, className }: { name: GlyphName; size?: number; className?: string }) {
  const s = SHAPES[name];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      data-glyph={name}
    >
      {s.d.map((d) => (
        <path key={d} d={d} />
      ))}
      {s.dashed ? <path d={s.dashed} strokeDasharray="2 2.6" /> : null}
      {s.dots?.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.6} fill="currentColor" stroke="none" />
      ))}
    </svg>
  );
}
