import { cn } from '@/lib/cn';

/**
 * The check-in ritual's object (a hold with a face, spec §4.6.3 "one big button"): its classes, shared by the hold
 * (HoldButton), its end (HoldEnd) and its silhouette while the plan is prepared (HoldCardShape), so all three stand at
 * the same place in the same boxes. Plain strings and no component: the silhouette rides the first load of /vault/
 * (LazyActionFlow), the hold does not.
 *
 * Per tone: the frame and the face's paper in the tone, and the bar in the primary action's accent (button-class.ts
 * `primary`). The fill sweeps the bar towards the ink, away from the label's own colour (deeper on vellum, brighter on
 * night), so the label only gains contrast as the hold fills; a sweep in the label's colour left it at 3.9:1 on vellum
 * halfway through. Disabled (preparing, the wallet is open, the transaction waits for its block), the face keeps its
 * thread at full strength, since it shows the pending knot; only the frame and the bar go quiet. `end` is the rule over
 * the band of a HoldEnd, where the bar stood: the band has no background of its own, so it stands on the face's paper
 * and never passes for the quiet bar of a hold that waits; `check` colours the check in front of its outcome. Every
 * tint is one the site already ships: the layout's stylesheet sits just under the 100 kB above which Turbopack stops
 * merging it with the fonts' (test/build/home.test.ts), and every new utility adds to it.
 */
export const OBJECT = {
  thread: {
    frame: 'border-thread bg-thread/6',
    bar: 'bg-thread text-on-thread group-enabled:group-hover:bg-thread/90',
    fill: 'bg-ink/25',
    knot: 'bg-on-thread',
    end: 'border-thread/40',
    check: 'text-thread',
  },
  danger: {
    frame: 'border-danger bg-danger/6',
    bar: 'bg-danger text-on-danger group-enabled:group-hover:bg-danger/90',
    fill: 'bg-ink/25',
    knot: 'bg-on-danger',
    end: 'border-danger/45',
    check: 'text-danger',
  },
} as const;

/**
 * The geometry: the object's column (the full width up to 28rem, centred by the caller), its frame, and the face's box
 * in it. The knot a hold left pending then ties where it stood.
 */
export const OBJECT_COLUMN = 'flex w-full max-w-md flex-col items-center gap-2';
export const OBJECT_FRAME = 'flex w-full flex-col overflow-hidden rounded-3xl border';
export const FACE_BOX = 'block w-full px-4 pt-4 pb-3 sm:px-6';
/** The bar's height: the end's outcome stands in as much room as the label had. */
export const BAR_BOX = 'min-h-14 w-full items-center justify-center';

/** The hold itself, a button: one press target, one focus ring, one shake. Its tone's frame comes on top. */
export const OBJECT_BUTTON = cn(
  'group relative isolate select-none font-medium',
  OBJECT_FRAME,
  'touch-manipulation transition-[border-color] duration-150 ease-out-expo motion-safe:data-shake:animate-shake',
  'disabled:cursor-not-allowed disabled:border-line-strong',
);

/** The bar under the face, its label in the lead size. Its tone's accent comes on top. */
export const OBJECT_BAR = cn(
  'relative isolate flex gap-3 px-6 py-3 text-lead',
  BAR_BOX,
  'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.18)] transition-colors duration-150 ease-out-expo',
  'group-disabled:bg-surface-3 group-disabled:text-ink-muted group-disabled:shadow-none',
);

/** The line under a hold: how to hold it, or what it waits for. */
export const HOLD_HINT = 'text-center text-caption text-ink-muted';
