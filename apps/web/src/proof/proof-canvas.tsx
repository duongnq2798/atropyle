'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/cn';
import { cssVar } from '@/lib/css-color';
import { usePageVisible } from '@/lib/use-page-visible';
import { useTheme } from '@/theme/provider';
import { type GlyphName, StateGlyph } from '@/thread/glyphs';
import { fillBase, type ProofPalette, paintRange, pixelsDone, proofGrid, readPalette } from './paint';

export interface ProofCanvasProps {
  /** log2 of the cases the run checks, comboBitsOf(blocks): 26 for the full proof, a 1024 × 1024 map. */
  comboBits: number;
  /** Blocks of 32 cases the worker has finished. A smaller value than before is a new run. */
  doneBlocks: number;
  /** What a screen reader hears: the picture has no text of its own. */
  label: string;
  className?: string;
}

interface Painter {
  data: Uint8ClampedArray<ArrayBuffer> | null;
  /** A view of `data`, made once per map: later paints write into the same pixels. */
  image: ImageData | null;
  palette: ProofPalette | null;
  size: number;
  /** Dots painted in every region. */
  painted: number;
  generation: number;
  ticks: number;
}

/** The eight starting states, as the map lays them out: column s & 3, row s >> 2 (paint.ts). */
const REGIONS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

/**
 * The key, one glyph per starting state, in the colour its dots will take (STATE_TOKENS of paint.ts): colour is
 * never the only signal (spec §4.3). Codes 2, 4 and 6, which the vault never holds, get the bare gate, a gate no
 * thread reaches: the proof checks them too. line-strong on surface-3 is 3.5:1 in night and 3.4:1 in vellum, past
 * the 3:1 of a graphic (contrast.test.ts).
 */
const KEY: readonly { name: GlyphName; ink: string }[] = [
  { name: 'active', ink: 'text-alive' },
  { name: 'grace', ink: 'text-grace' },
  { name: 'unused', ink: 'text-line-strong' },
  { name: 'recovery', ink: 'text-recovery' },
  { name: 'unused', ink: 'text-line-strong' },
  { name: 'releasedInherit', ink: 'text-release' },
  { name: 'unused', ink: 'text-line-strong' },
  { name: 'releasedRecover', ink: 'text-release' },
];

/** Dots in a region before the bottom band (band 3 of paint.ts), the last quarter of the run, where the key sits. */
const keyBand = (perRegion: number) => (perRegion * 3) / 4;

/**
 * The key as the painter sets it on the canvas (data-key): "on" while the dots have not reached the bottom band, and
 * whenever the map stays blank (no 2D context); "off" from three quarters of the run; "done" once every dot is painted.
 */
function keyState(painted: number, perRegion: number, drawn: boolean): 'on' | 'off' | 'done' {
  if (!drawn) return 'on';
  if (painted >= perRegion) return 'done';
  return painted >= keyBand(perRegion) ? 'off' : 'on';
}

/**
 * Each glyph sits in the bottom of four rows of its region: the band the dots reach last, after three quarters of the
 * run, so the key and the colours share the map for most of it and the colour comes down the column to its key. The
 * key gives way to the dots: from 75 % (data-key="off") it fades out, so a glyph never covers a dot mid-run (in
 * Morton order the first dot under a glyph's box comes at 78 % or later, at every width whose band holds the glyph).
 * The finished plate carries its key again, stamped in ink over the bottom band (data-key="done"): the frame people
 * look at longest keys every column by more than its colour (spec §4.3), and tells apart the two releases and the
 * three unused codes, which share a colour. Ink over band 3 is 3.7:1 or more in night and 6.0:1 or more in vellum
 * (paint.test.ts). The ink rule's selector outranks the state inks, and the colour changes while the glyph is still
 * hidden, so the return is one crossfade. A new run shows the key in its colours again. The prerender and the no-JS
 * page have no data-key and show it. Reduced motion makes the fade a 120 ms crossfade (spec §4.4). The glyph grows
 * with the plate, not the viewport (@md: a plate of 448 px or more), so it keeps its share of the band at every width.
 */
const GLYPH =
  'row-start-4 size-6 self-center transition-opacity duration-240 ease-out-expo motion-reduce:duration-120 ' +
  'motion-reduce:ease-linear @md:size-8 group-has-[canvas[data-key="off"]]/map:opacity-0 ' +
  'group-has-[canvas[data-key="done"]]/map:text-ink';

/**
 * Hairlines between the regions: line-strong over the empty base (1.64:1 in night, 1.53:1 in vellum), the page colour
 * from the first dot, `canvas[data-painted]:not([data-painted="0"])` (3.1:1 to 6.7:1 over every state colour, where
 * line-strong would fall to 1.0–1.35:1). They change with the first dots, in the same frame and without a transition:
 * the dots themselves never fade in, and spec §4.4 animates opacity, not colour.
 */
const HAIRLINE = 'border-line-strong/40 group-has-[canvas[data-painted]:not([data-painted="0"])]/map:border-bg/80';

/**
 * Spec §4.6.1: every case of the proof as one dot of 64, painted as the worker reports. The pixels live in one
 * buffer; a tick paints only the new dots and puts only their boxes. A new map size, a new theme or a run that starts
 * over paints a new map from the base. No particles (spec §18.5 C2): the map itself never moves, and the only
 * transition is the key giving way to the last band and coming back in ink on the finished plate. The map is a square
 * plate mounted in a bezel, not clipped by the rounded frame, so every corner dot shows, the first dot of a run among
 * them. The canvas carries data-key ("on", "off" or "done", see keyState) and, for tests, data-painted (8 × dots per
 * region), data-generation (maps started from the base), data-ticks (paints that added dots) and data-palette (the
 * theme).
 */
export function ProofCanvas({ comboBits, doneBlocks, label, className }: ProofCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painter = useRef<Painter>({
    data: null,
    image: null,
    palette: null,
    size: 0,
    painted: 0,
    generation: 0,
    ticks: 0,
  });
  const grid = useMemo(() => proofGrid(comboBits), [comboBits]);
  const { resolved } = useTheme();
  const visible = usePageVisible();

  // A layout effect: a new theme and its repaint reach the screen in the same frame, inside the theme's view
  // transition, and a resized canvas (which the browser clears) never shows blank.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    // Spec §18.4.3 (Task 3): no painting in a hidden tab. The worker runs on; the first frame back catches up.
    if (!canvas || !visible) return;
    const st = painter.current;
    const target = Math.min(pixelsDone(doneBlocks), grid.perRegion);
    let { data, palette } = st;
    let fresh = false;
    // A new map: the first paint, a new size, a new theme, or a run that starts over.
    if (!data || !palette || st.size !== grid.size || palette.theme !== resolved || target < st.painted) {
      // The colours where the map sits: a scoped vellum ancestor reads vellum.
      palette = readPalette((t) => cssVar(`--atro-${t}`, canvas), resolved);
      data = new Uint8ClampedArray(grid.size * grid.size * 4);
      fillBase(data, palette);
      st.data = data;
      st.palette = palette;
      st.image = null;
      st.size = grid.size;
      st.generation += 1;
      fresh = true;
    }
    const from = fresh ? 0 : st.painted;
    const rects = paintRange(data, grid, palette, from, target);
    if (target > from) st.ticks += 1;
    st.painted = target;
    // Opaque: every pixel is painted, so the compositor need not blend the map with what lies under it.
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx) {
      // A new map, or the first put after paints without a context, goes up whole: the canvas has none of it yet.
      // A tick puts only the box of each region it painted.
      const whole = st.image === null;
      st.image ??= new ImageData(data, grid.size, grid.size);
      if (whole) ctx.putImageData(st.image, 0, 0);
      else for (const r of rects) ctx.putImageData(st.image, 0, 0, r.x, r.y, r.w, r.h);
    }
    // Without a 2D context the map stays blank, and the key is all it shows.
    canvas.dataset.key = keyState(target, grid.perRegion, ctx !== null);
    canvas.dataset.painted = String(target * 8);
    canvas.dataset.generation = String(st.generation);
    canvas.dataset.ticks = String(st.ticks);
    canvas.dataset.palette = palette.theme;
  }, [doneBlocks, grid, resolved, visible]);

  // A browser may drop a canvas's pixels (a phone tab in the background, a GPU reset) and hand back a blank one.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const restore = () => {
      const image = painter.current.image;
      if (image) canvas.getContext('2d', { alpha: false })?.putImageData(image, 0, 0);
    };
    canvas.addEventListener('contextrestored', restore);
    return () => canvas.removeEventListener('contextrestored', restore);
  }, []);

  return (
    <div
      role="img"
      aria-label={label}
      className={cn('group/map w-full rounded-2xl border border-line bg-surface-2 p-1.5 sm:p-2', className)}
    >
      {/* The plate: square, so the rounded bezel around it clips no dot; the key sizes itself by its width. */}
      <div className="@container relative aspect-square bg-surface-3">
        <canvas
          ref={canvasRef}
          width={grid.size}
          height={grid.size}
          data-testid="proof-canvas"
          data-size={grid.size}
          data-done={doneBlocks}
          className="block size-full [image-rendering:pixelated]"
        />
        {/* The eight starting states and the key: the empty map already shows what will fill, and where. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid grid-cols-4 grid-rows-2">
          {REGIONS.map((s) => (
            <span
              key={s}
              data-region={s}
              className={cn(
                'grid grid-rows-4 justify-items-center',
                HAIRLINE,
                (s & 3) !== 3 && 'border-r',
                s < 4 && 'border-b',
              )}
            >
              <StateGlyph name={KEY[s].name} className={cn(GLYPH, KEY[s].ink)} />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
