'use client';

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { cn } from '@/lib/cn';
import { cssVar } from '@/lib/css-color';
import { usePageVisible } from '@/lib/use-page-visible';
import { useTheme } from '@/theme/provider';
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
 * Spec §4.6.1: every case of the proof as one dot of 64, painted as the worker reports. The pixels live in one
 * buffer; a tick paints only the new dots and puts only their boxes. A new map size, a new theme or a run that starts
 * over paints a new map from the base. No particles and no motion (spec §18.5 C2): reduced motion changes nothing.
 * For tests, the canvas carries data-painted (8 × dots per region), data-generation (maps started from the base),
 * data-ticks (paints that added dots) and data-palette (the theme it is painted in).
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
      st.image ??= new ImageData(data, grid.size, grid.size);
      // A new map goes up whole; a tick puts only the box of each region it painted.
      if (fresh) ctx.putImageData(st.image, 0, 0);
      else for (const r of rects) ctx.putImageData(st.image, 0, 0, r.x, r.y, r.w, r.h);
    }
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
      className={cn(
        'relative aspect-square w-full overflow-hidden rounded-2xl border border-line bg-surface-3',
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        width={grid.size}
        height={grid.size}
        data-testid="proof-canvas"
        data-size={grid.size}
        data-done={doneBlocks}
        className="block size-full [image-rendering:pixelated]"
      />
      {/* Hairlines between the eight starting states: the empty map already shows what will fill. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid grid-cols-4 grid-rows-2">
        {REGIONS.map((s) => (
          <span
            key={s}
            data-region={s}
            className={cn('border-bg/80', (s & 3) !== 3 && 'border-r', s < 4 && 'border-b')}
          />
        ))}
      </div>
    </div>
  );
}
