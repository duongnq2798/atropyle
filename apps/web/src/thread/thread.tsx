'use client';

import { type ReactNode, type Ref, useMemo } from 'react';
import { cn } from '@/lib/cn';
import { RevealWindow, type RevealWindowHandle, useMoveWith } from '@/motion/reveal-window';
import { THREAD_VT_NAME } from '@/motion/view-transition';
import {
  MAIN_WIDTH,
  type Point,
  pctX,
  pctY,
  type ThreadBeat,
  type ThreadInput,
  type ThreadTone,
  threadGeometry,
  VIEW,
} from './geometry';
import { THREAD_COLOR, type ThreadState } from './state';

export interface ThreadProps extends ThreadInput {
  state: ThreadState;
  /** Makes the thread an image with this name; without it the thread is decoration next to a text label. */
  label?: string;
  /**
   * Morph into the next page's thread (View Transitions): the root carries THREAD_VT_NAME. At most one shared thread
   * per page, since a name used twice aborts the whole transition.
   */
  shared?: boolean;
  /**
   * The lit part's window, for a caller that moves it every frame (a drag) without rendering. setRange moves only
   * the window: "now", the pending knot and every mark are props, and the caller re-renders them to move them.
   */
  revealRef?: Ref<RevealWindowHandle>;
  /** Size of the box: a width, and a height to change the 5:1 ratio. */
  className?: string;
}

const BOX = `0 0 ${VIEW.w} ${VIEW.h}`;
/** One loop of `thread-pulse` per beat (BEAT_SECONDS; globals.css has the three animations). */
const BEAT_CLASS: Record<ThreadBeat, string> = {
  slow: 'motion-safe:animate-thread-pulse',
  mid: 'motion-safe:animate-thread-pulse-mid',
  fast: 'motion-safe:animate-thread-pulse-fast',
};
const BRANCH_TONE: Record<ThreadTone, { stroke?: string; className?: string; opacity?: number }> = {
  plain: { stroke: 'currentColor' },
  highlight: { className: 'stroke-thread' },
  muted: { className: 'stroke-ink-muted', opacity: 0.35 },
};
const DOT_TONE: Record<ThreadTone, string> = {
  plain: 'bg-current',
  highlight: 'bg-thread',
  muted: 'bg-ink-muted/35',
};
const MARK = 'absolute -translate-x-1/2 -translate-y-1/2 rounded-full';

/** A point of the view as `left`/`top` percents of the box. */
const at = ([x, y]: Point) => ({ left: `${pctX(x)}%`, top: `${pctY(y)}%` });

/**
 * "Now" rides a box as large as the root, moved by translate in percent of the root: it moves with the window, on
 * the compositor, on the window's clock (useMoveWith). It moves along the chord between two points, not along the
 * wave: on the small steps of a ticking chain clock the two cannot be told apart, and a long jump (a Scrubber
 * release) cuts across the wave for one spring.
 */
function NowAt({ at: [x, y], pending }: { at: Point; pending: boolean }) {
  const move = useMoveWith<HTMLSpanElement>(`translate(${pctX(x)}%, ${pctY(y)}%)`);
  return (
    <span data-part="now-at" className="absolute inset-0" {...move}>
      <span
        data-part="halo"
        className={cn(
          MARK,
          'top-0 left-0 size-8 bg-[radial-gradient(closest-side,currentColor,transparent)] opacity-40',
        )}
      />
      <span data-part="now" className={cn(MARK, 'top-0 left-0 size-3 bg-current')} />
      {pending ? (
        <span data-part="pending" className={cn(MARK, 'top-0 left-0 size-5 border-2 border-current border-dashed')} />
      ) : null}
    </span>
  );
}

/** A root SVG of the Thread: the view stretched to the box. Only the root itself ever animates. */
function Svg(p: { layer: 'base' | 'glow' | 'lit'; beat?: ThreadBeat; className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={BOX}
      preserveAspectRatio="none"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-layer={p.layer}
      data-beat={p.beat}
      className={cn('absolute inset-0 size-full overflow-visible', p.className)}
    >
      {p.children}
    </svg>
  );
}

/**
 * The one character of the visual language (spec §4.1, R18.4). Four layers in a clipped box: the course in an SVG
 * stretched to the box (`preserveAspectRatio="none"`, every stroke `non-scaling-stroke`); the lit part and its glow
 * in a RevealWindow; and HTML for everything round (the "now" point, knots, gate, dots), so nothing turns oval.
 * Only `transform` and `opacity` of a root element ever move.
 */
export function Thread({
  state,
  remaining,
  knots,
  branches,
  axis,
  predicted,
  pendingKnot,
  highlight,
  label,
  shared = false,
  revealRef,
  className,
}: ThreadProps) {
  const g = useMemo(
    () => threadGeometry(state, { remaining, knots, branches, axis, predicted, pendingKnot, highlight }),
    [state, remaining, knots, branches, axis, predicted, pendingKnot, highlight],
  );
  const dash = g.dash ?? undefined;
  // Set whenever the prop is, in every state; only the branch styling needs an index that names a branch.
  const highlighted = highlight !== undefined ? String(highlight) : undefined;

  const box = {
    'data-thread': '',
    'data-state': state,
    'data-predicted': predicted ? 'true' : undefined,
    'data-pending-knot': pendingKnot ? 'true' : undefined,
    'data-highlight': highlighted,
    className: cn('pointer-events-none relative aspect-[5/1] overflow-clip', THREAD_COLOR[state], className),
    // Named on the element itself, so it is named in every transition, also the ones NavLink starts. React's
    // <ViewTransition name> names an element only inside a transition React starts (Task 15, outcome B).
    style: shared ? { viewTransitionName: THREAD_VT_NAME } : undefined,
  };

  const layers = (
    <>
      <Svg layer="base">
        {g.track ? (
          <path
            d={g.track}
            className="stroke-line"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            data-part="track"
          />
        ) : null}
        {g.fibers.map((d) => (
          <path
            key={d}
            d={d}
            className="stroke-line"
            strokeWidth={1.25}
            strokeDasharray={dash}
            vectorEffect="non-scaling-stroke"
            data-part="fiber-course"
          />
        ))}
        {g.ghost ? (
          <path
            d={g.ghost}
            stroke="currentColor"
            strokeOpacity={0.4}
            strokeWidth={1.5}
            strokeDasharray="1 7"
            vectorEffect="non-scaling-stroke"
            data-part="ghost"
          />
        ) : null}
        {g.branches.map((b) => {
          const tone = BRANCH_TONE[b.tone];
          return (
            <path
              key={b.d}
              d={b.d}
              stroke={tone.stroke}
              className={tone.className}
              strokeOpacity={tone.opacity}
              strokeWidth={b.width}
              strokeDasharray={dash}
              vectorEffect="non-scaling-stroke"
              data-part="branch"
              data-tone={b.tone}
            />
          );
        })}
        {g.curl ? (
          <path
            d={g.curl}
            stroke="currentColor"
            strokeWidth={MAIN_WIDTH}
            vectorEffect="non-scaling-stroke"
            data-part="curl"
          />
        ) : null}
      </Svg>

      <RevealWindow from={pctX(g.litFrom)} to={pctX(g.litTo)} ref={revealRef}>
        {g.beat ? (
          // Keyed on the beat: a new beat starts a fresh loop instead of cutting into the running one.
          <Svg key={g.beat} layer="glow" beat={g.beat} className={cn('opacity-25', BEAT_CLASS[g.beat])}>
            <path d={g.lit} stroke="currentColor" strokeWidth={10} vectorEffect="non-scaling-stroke" data-part="glow" />
          </Svg>
        ) : null}
        <Svg layer="lit" className={state === 'grace' ? 'motion-safe:animate-thread-tremble' : undefined}>
          <path
            d={g.lit}
            stroke="currentColor"
            strokeWidth={MAIN_WIDTH}
            vectorEffect="non-scaling-stroke"
            data-part="lit"
          />
          {g.fibers.map((d) => (
            <path
              key={d}
              d={d}
              stroke="currentColor"
              strokeWidth={1.25}
              strokeOpacity={0.75}
              strokeDasharray={dash}
              vectorEffect="non-scaling-stroke"
              data-part="fiber"
            />
          ))}
        </Svg>
      </RevealWindow>

      <div data-layer="marks" data-highlight={highlighted} className="absolute inset-0">
        {g.gate ? (
          // The slot of the guardians' posts (Plan 7B): they go inside this box, next to the arch.
          <span
            data-part="gate"
            className="absolute block aspect-[12/25] h-[42%] -translate-x-1/2 -translate-y-1/2"
            style={at(g.gate)}
          >
            <span data-part="arch" className="absolute inset-0 rounded-t-full border-2 border-ink-muted border-b-0" />
          </span>
        ) : null}
        {g.knots.map((k) => (
          <span
            key={`${k[0]}-${k[1]}`}
            data-part="knot"
            className={cn(MARK, 'size-2.5 border-2 border-current bg-bg')}
            style={at(k)}
          />
        ))}
        {g.dots.map((dot) => (
          <span
            key={`${dot.at[0]}-${dot.at[1]}`}
            data-part="dot"
            data-tone={dot.tone}
            className={cn(MARK, 'size-2', DOT_TONE[dot.tone])}
            style={at(dot.at)}
          />
        ))}
        {g.now ? <NowAt at={g.now} pending={g.pending !== null} /> : null}
      </div>
    </>
  );

  // With a label the box is one image; without, it is decoration next to a text label.
  return label ? (
    <div role="img" aria-label={label} {...box}>
      {layers}
    </div>
  ) : (
    <div aria-hidden="true" {...box}>
      {layers}
    </div>
  );
}
