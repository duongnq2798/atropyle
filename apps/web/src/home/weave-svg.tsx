import type { CSSProperties, ReactNode } from 'react';
import { THREAD_VT_NAME } from '@/motion/names';
import { CROP, VIEW } from './netlist-geometry';
import { dotsPath, threadPath, wirePaths } from './weave-path';

const BOX = `0 0 ${VIEW.w} ${VIEW.h}`;
const LAYERS = wirePaths().map((d, i) => ({ depth: i + 1, d }));
const DOTS = dotsPath();
const THREAD = threadPath();
const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`;
/** The phone strip shows CROP of the view: the plate is VIEW.w / CROP.w strips wide and starts CROP.x to the left. */
const PLATE = {
  '--wv-plate-w': pct((VIEW.w / CROP.w) * 100),
  '--wv-plate-x': pct((-CROP.x / CROP.w) * 100),
} as CSSProperties;

/**
 * One drawing of the weave, uncovered from the left by its sweep and cropped on a phone (globals.css, `.weave`). The
 * two sweep boxes are the size of the strip and the plate rides inside the inner one, so the sweep crosses the strip
 * at the same pace at every width; inside the plate it would cross a phone's strip in a flash.
 */
function Layer({ name, style, children }: { name: 'warp' | 'thread'; style?: CSSProperties; children: ReactNode }) {
  return (
    <div data-weave={name} className="weave-layer" style={style}>
      <div className="weave-sweep">
        <div className="weave-sweep-in">
          <div className="weave-plate" style={PLATE}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The whole view, stretched to the box: strokes keep their width (`vector-effect` in globals.css). */
function Drawing({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg viewBox={BOX} preserveAspectRatio="none" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

/**
 * The real policy circuit: every signal a dot, both inputs of every NAND a wire, one group per layer (`--d` is its
 * depth, for the sweep of Task 5′), and in gold the calmest real path from the owner's check-in to the release
 * output. A server component: app/page.tsx renders it, so its numbers reach the HTML and no script
 * (test/build/home.test.ts). The thread layer carries the page's shared view-transition name.
 */
export function WeaveArt() {
  return (
    <div className="weave" aria-hidden="true">
      <Layer name="warp">
        <Drawing className="text-line-strong">
          <g fill="none" stroke="currentColor" strokeWidth={1} opacity={0.55}>
            {LAYERS.map((layer) => (
              <g key={layer.depth} className="weave-col" style={{ '--d': layer.depth } as CSSProperties}>
                <path d={layer.d} />
              </g>
            ))}
          </g>
          <path
            d={DOTS}
            className="text-ink-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.8}
          />
        </Drawing>
      </Layer>
      <Layer name="thread" style={{ viewTransitionName: THREAD_VT_NAME }}>
        <Drawing className="opacity-25 motion-safe:animate-thread-pulse">
          <path d={THREAD} fill="none" stroke="var(--atro-thread)" strokeWidth={8} strokeLinecap="round" />
        </Drawing>
        <Drawing>
          <path d={THREAD} fill="none" stroke="var(--atro-thread)" strokeWidth={2.5} strokeLinecap="round" />
        </Drawing>
      </Layer>
    </div>
  );
}
