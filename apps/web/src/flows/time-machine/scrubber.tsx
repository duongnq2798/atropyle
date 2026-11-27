'use client';

import { type CSSProperties, type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import type { RevealWindowHandle } from '@/motion/reveal-window';
import { courseX, pctX, pctY, threadGeometry, waveY } from '@/thread/geometry';
import { THREAD_COLOR, type ThreadState } from '@/thread/state';
import { Thread } from '@/thread/thread';
import { Slider } from '@/ui/slider';
import type { ScenarioRun } from '../impl/time-machine';
import { pointerOffset, snapToMoment } from './detent';
import {
  clampOffset,
  frameIndex,
  gateOf,
  momentOffsets,
  momentRings,
  nextOffset,
  prevOffset,
  scrubAxis,
  threadFrame,
} from './frame';

export interface ScrubberProps {
  run: ScenarioRun;
  /** A Drill's end: the thread is drawn `expired` from there on. Null for a vault that never expires. */
  expiresAt: bigint | null;
  /** Seconds after the run's first moment; clamped to the slider. */
  offset: number;
  onOffsetChange(offset: number): void;
  /** The thumb's accessible name. */
  label: string;
  /** The thumb's aria-valuetext at chain time `at`, in the frame of moment `index` of `run`, drawn as `state`. */
  valueText(at: bigint, index: number, state: ThreadState): string;
  /** What the live region says when the slider reaches the frame of moment `index`. */
  announce(index: number, at: bigint): string;
  /** Id of the hint that describes the thumb (its keys). */
  describedBy?: string;
  /**
   * A short label that rides above the thumb ("In 3 minutes"): the reading of the playhead. Hidden from assistive
   * technology, which hears valueText.
   */
  playhead?(at: bigint): string;
  /**
   * The label under the gate, at chain time `at` when it opens, in `state` (the heirs', or the new wallet's in a
   * recovery and once released to it). Shown only where the gate is the frame's own release (gateOf), and not while
   * the playhead stands near it, where its pill says the same. Hidden from assistive technology: the moments list
   * says it.
   */
  gateLabel?(at: bigint, state: ThreadState): string;
  testId?: string;
  /**
   * For the wrapper, an inline-size container (the Thread's height and the dot's rise are in cqw): its width comes
   * from outside, so place it in a block or a stretched flex item, never in a box that shrinks to its content.
   */
  className?: string;
}

/** The Thread draws its own "now" in its box; here the thumb is "now", so the Thread's is hidden. */
const HIDE_NOW = '[&_[data-part=now-at]]:hidden';
/**
 * Radix keeps the thumb's centre in [half a thumb, width − half a thumb]: the Thread is inset by half the thumb on
 * each side (2.75rem thumb, mx-5.5 = 1.375rem), both in rem, so x = 0 and x = 600 of the Thread are the two ends of
 * the thumb's run at any root font size.
 */
const THUMB_SIZE = 'size-11';
const TRACK_INSET = 'mx-5.5';
/**
 * The Thread's height: its width (the container's, 100cqw, less the inset) over --tm-r. The ratio is 5:1 like every
 * Thread once the Scrubber is 32rem wide, and 3:1 below, so that on a phone the wave, the rings and the gate keep a
 * size a finger and an eye can tell apart.
 */
const RATIO = '[--tm-r:3] @min-[32rem]:[--tm-r:5]';
const THREAD_HEIGHT = 'h-[calc((100cqw_-_2.75rem)/var(--tm-r))]';
/**
 * The dot rides the wave: the thumb is centred on the middle of the Thread, which is (100cqw − 2.75rem) / --tm-r
 * high (the wrapper is a size container), so the wave's y at x is that height times (pctY − 50) / 100. Transform
 * only.
 */
const rise = (x: number): string =>
  `translateY(calc((100cqw - 2.75rem) / var(--tm-r) * ${((pctY(waveY(x)) - 50) / 100).toFixed(5)}))`;
const lift = (x: number): CSSProperties => ({ transform: rise(x) });
/**
 * The playhead's label rides over the dot, inside the thumb: it starts at the thumb's centre and moves left by the
 * thumb's share of the track, in its own width, so it is left-aligned at the start, right-aligned at the end, and
 * never leaves the box. Transform only, like the dot.
 */
const ride = (x: number): CSSProperties => ({ transform: `translateX(-${pctX(x)}%) ${rise(x)}` });
const DOT = 'pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full';
/**
 * The focus ring rides the dot, not the thumb's 44 px box, which stays on the thread's centre line while the dot
 * moves with the wave. An outline, not a shadow, so forced-colors mode draws it too. The thumb itself is
 * `outline-none`, so the global :focus-visible ring never draws around its box; Radix focuses the thumb on a
 * pointer press, which does not match :focus-visible, so a drag shows no ring.
 */
const DOT_FOCUS =
  'group-focus-visible:outline-2 group-focus-visible:outline-offset-[3px] group-focus-visible:outline-thread';
/** The gate's label steps aside while the playhead stands this close to the gate, in percent of the track. */
const GATE_LABEL_NEAR = 12;
/** The gate's arch is 42 % of the Thread's height, centred on the wave: its legs end 21 % below the wave. */
const GATE_FOOT = 21;

/**
 * The time machine's slider is the thread itself (spec §18.4.2, R18.5): a Radix Slider over [now, drawnAxis.to]
 * whose track is the Thread on that axis and whose thumb is its "now". Moments are rings at courseX; a pointer snaps
 * to one within the detent; Page Up and Page Down jump between them; the live region speaks once per moment.
 * Inside one frame a drag moves the lit window by rAF and never renders the Thread (R18.4); the Thread's props move
 * on a new frame and when the drag ends, and then reset() hands the window back to them.
 */
export function Scrubber({
  run,
  expiresAt,
  offset,
  onOffsetChange,
  label,
  valueText,
  announce,
  describedBy,
  playhead,
  gateLabel,
  testId = 'scrubber',
  className,
}: ScrubberProps) {
  const axis = useMemo(() => scrubAxis(run), [run]);
  const offsets = useMemo(() => momentOffsets(run), [run]);
  // The lit window's right edge in each frame; it does not move with "now". Null where no range is lit.
  const litTo = useMemo(
    () =>
      run.moments.map((m, i) => {
        const f = threadFrame(run, axis, i, m.at, expiresAt);
        return f.state === 'active' || f.state === 'grace' ? threadGeometry(f.state, { axis: f.axis }).litTo : null;
      }),
    [run, axis, expiresAt],
  );
  const value = clampOffset(offset, axis.span);
  const at = axis.from + BigInt(value);
  const index = frameIndex(run, at);
  const state: ThreadState = expiresAt !== null && at >= expiresAt ? 'expired' : run.moments[index].state;

  const pointer = useRef(false);
  const aimAt = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  // Where the Thread is drawn: the value, except during a drag inside one frame.
  const [drawnAt, setDrawnAt] = useState(at);
  if (!dragging && drawnAt !== at) setDrawnAt(at);
  const drawnIndex = frameIndex(run, drawnAt);
  const reveal = useRef<RevealWindowHandle>(null);
  const raf = useRef(0);
  const said = useRef(index);
  const [live, setLive] = useState('');

  // A jump from outside (a moment button, a new offset) is its own announcement: the region only follows it.
  useEffect(() => {
    said.current = index;
  }, [index]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const ended = useRef(false);
  useEffect(() => {
    if (dragging) {
      ended.current = true;
      return;
    }
    if (!ended.current) return;
    ended.current = false;
    cancelAnimationFrame(raf.current);
    reveal.current?.reset();
  }, [dragging]);

  const frame = useMemo(
    () => threadFrame(run, axis, drawnIndex, drawnAt, expiresAt),
    [run, axis, drawnIndex, drawnAt, expiresAt],
  );
  const rings = useMemo(() => momentRings(run, axis), [run, axis]);
  // One element per frame: inside a frame React skips the whole Thread on every value change.
  const track = useMemo(
    () => (
      <>
        <Thread
          state={frame.state}
          axis={frame.axis}
          revealRef={reveal}
          className={cn('w-full', THREAD_HEIGHT, HIDE_NOW)}
        />
        {/*
         * Each ring in the colour of the state its moment leads into, like the moments list's dots; a check-in is
         * the knot the Thread ties there, a little larger, so the Thread's own knot never peeks out from under it.
         */}
        <span aria-hidden="true" data-layer="moments" className="pointer-events-none absolute inset-0">
          {rings.map((r) => {
            const current = r.members.includes(index);
            return (
              <span
                key={r.members.join('-')}
                data-moment={r.index}
                data-moments={r.members.join(' ')}
                data-kind={r.knot ? 'checkIn' : undefined}
                data-current={current ? 'true' : undefined}
                className={cn(
                  'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-current bg-bg',
                  THREAD_COLOR[r.state],
                  r.knot ? 'size-3 border-[2.5px]' : 'size-2.5 border-2',
                  current && 'ring-2 ring-current/30',
                )}
                style={{ left: `${pctX(r.x)}%`, top: `${pctY(waveY(r.x))}%` }}
              />
            );
          })}
        </span>
      </>
    ),
    [frame, rings, index],
  );

  const change = (next: number) => {
    const raw = pointer.current ? (aimAt.current ?? next) : next;
    const v = pointer.current ? snapToMoment(raw, offsets, axis.span) : raw;
    const t = axis.from + BigInt(v);
    const i = frameIndex(run, t);
    if (i !== said.current) {
      said.current = i;
      setLive(announce(i, t));
    }
    if (pointer.current) {
      if (i !== frameIndex(run, drawnAt)) setDrawnAt(t);
      cancelAnimationFrame(raf.current);
      const to = litTo[i];
      if (to !== null) {
        const x = Math.min(courseX(t, axis), to);
        raf.current = requestAnimationFrame(() => reveal.current?.setRange(pctX(x), pctX(to), 'instant'));
      }
    }
    onOffsetChange(v);
  };
  const aim = (e: PointerEvent<HTMLSpanElement>) => {
    const thumb = e.currentTarget.querySelector<HTMLElement>('[role="slider"]');
    const box = e.currentTarget.getBoundingClientRect();
    aimAt.current = pointerOffset(e.clientX, box.left, box.width, (thumb?.offsetWidth ?? 0) / 2, axis.span, axis.step);
  };
  const press = (e: PointerEvent<HTMLSpanElement>) => {
    pointer.current = true;
    aim(e);
    setDragging(true);
  };
  const release = () => {
    pointer.current = false;
    aimAt.current = null;
    setDragging(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key !== 'PageUp' && e.key !== 'PageDown') return;
    // Radix would step ten; here they jump to the next or previous moment, then to the end or the start.
    e.preventDefault();
    const v = e.key === 'PageUp' ? (nextOffset(offsets, value) ?? axis.span) : (prevOffset(offsets, value) ?? 0);
    if (v !== value) change(v);
  };

  const x = courseX(at, axis);
  const gate = gateLabel ? gateOf(run, axis, drawnIndex, drawnAt, expiresAt) : null;
  const gx = gate ? courseX(gate.at, axis) : null;
  // In the track's box, under the arch; left-aligned at the start, right-aligned at the end, like the playhead.
  const gateAt =
    gate && gateLabel && gx !== null && Math.abs(pctX(gx) - pctX(x)) >= GATE_LABEL_NEAR ? (
      <span
        aria-hidden="true"
        data-part="gate-at"
        className="pointer-events-none absolute whitespace-nowrap font-mono text-caption text-ink-muted tabular-nums"
        style={{
          left: `${pctX(gx)}%`,
          top: `calc(${pctY(waveY(gx))}% + ${GATE_FOOT}% + 0.125rem)`,
          transform: `translateX(-${pctX(gx)}%)`,
        }}
      >
        {gateLabel(gate.at, gate.state)}
      </span>
    ) : null;
  return (
    <div className={cn('@container flex min-w-0 flex-col', className)}>
      <Slider
        bare
        value={[value]}
        min={0}
        max={axis.span}
        step={axis.step}
        onValueChange={(v) => change(v[0] ?? 0)}
        onValueCommit={release}
        onKeyDown={onKeyDown}
        onPointerDown={press}
        onPointerMove={(e) => {
          if (pointer.current) aim(e);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        thumbLabels={[label]}
        valueText={() => valueText(at, index, state)}
        thumbDescribedBy={describedBy}
        track={
          <>
            {track}
            {gateAt}
          </>
        }
        trackClassName={cn('relative block min-w-0 grow', TRACK_INSET)}
        thumbClassName={cn(
          'group relative block cursor-grab rounded-full outline-none active:cursor-grabbing',
          THUMB_SIZE,
          THREAD_COLOR[state],
        )}
        thumbContent={() => (
          <>
            <span
              aria-hidden="true"
              className={cn(DOT, 'size-8 bg-[radial-gradient(closest-side,currentColor,transparent)] opacity-40')}
              style={lift(x)}
            />
            <span
              aria-hidden="true"
              data-part="scrub-now"
              className={cn(DOT, 'size-3 bg-current', DOT_FOCUS)}
              style={lift(x)}
            />
            {playhead ? (
              <span
                aria-hidden="true"
                data-part="playhead"
                className="pointer-events-none absolute bottom-[calc(50%_+_1.75rem)] left-1/2 whitespace-nowrap rounded-full border border-current/30 bg-surface-2/90 px-2 font-mono text-caption tabular-nums leading-5"
                style={ride(x)}
              >
                {playhead(at)}
              </span>
            ) : null}
          </>
        )}
        testId={testId}
        className={RATIO}
      />
      <p data-testid={`${testId}-live`} aria-live="polite" aria-atomic="true" className="sr-only">
        {live}
      </p>
    </div>
  );
}
