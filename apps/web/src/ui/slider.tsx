'use client';

import * as S from '@radix-ui/react-slider';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SliderProps {
  value: readonly number[];
  min: number;
  max: number;
  step?: number;
  minStepsBetweenThumbs?: number;
  /** A thumb stops at its neighbours instead of passing them (Radix 1.6). */
  preserveThumbOrder?: boolean;
  onValueChange(v: number[]): void;
  onValueCommit?(v: number[]): void;
  /** One accessible name per thumb; also the thumb's React key, so they must differ. */
  thumbLabels: readonly string[];
  valueText?(value: number, index: number): string;
  /** Id of what describes every thumb (a hint about its keys). */
  thumbDescribedBy?: string;
  /** Drawn inside the track, under the thumbs: the share splitter's coloured parts, the Scrubber's Thread. */
  track?: ReactNode;
  /**
   * No bar: the track is only `track` at its own height, and trackClassName and thumbClassName style the track and
   * the thumbs from scratch (cn joins classes, it does not merge them, so a restyle cannot be an override).
   */
  bare?: boolean;
  trackClassName?: string;
  thumbClassName?: string;
  /** Drawn inside each thumb (the Scrubber's "now" point). */
  thumbContent?(value: number, index: number): ReactNode;
  /** Run before Radix's own handlers: `preventDefault()` keeps Radix from handling the event. */
  onKeyDown?(e: KeyboardEvent<HTMLSpanElement>): void;
  onPointerDown?(e: PointerEvent<HTMLSpanElement>): void;
  onPointerMove?(e: PointerEvent<HTMLSpanElement>): void;
  onPointerUp?(e: PointerEvent<HTMLSpanElement>): void;
  onPointerCancel?(e: PointerEvent<HTMLSpanElement>): void;
  disabled?: boolean;
  testId?: string;
  className?: string;
}

const THUMB = cn(
  'block size-6 rounded-full border-2 border-thread bg-surface-1 shadow-sm',
  'motion-safe:transition-transform motion-safe:duration-150 hover:scale-110',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-thread',
  'data-[disabled]:opacity-50',
);

/** Radix Slider (arrows, Page Up/Down, Home/End) with a 44 px hit area and the thread's colours. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  minStepsBetweenThumbs,
  preserveThumbOrder,
  onValueChange,
  onValueCommit,
  thumbLabels,
  valueText,
  thumbDescribedBy,
  track,
  bare = false,
  trackClassName,
  thumbClassName,
  thumbContent,
  onKeyDown,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  disabled,
  testId,
  className,
}: SliderProps) {
  return (
    <S.Root
      data-testid={testId}
      value={[...value]}
      min={min}
      max={max}
      step={step}
      minStepsBetweenThumbs={minStepsBetweenThumbs}
      preserveThumbOrder={preserveThumbOrder}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      disabled={disabled}
      className={cn('relative flex w-full touch-none select-none items-center', !bare && 'h-11', className)}
    >
      <S.Track
        className={
          bare ? trackClassName : cn('relative h-2 grow overflow-hidden rounded-full bg-surface-3', trackClassName)
        }
      >
        {track ?? (bare ? null : <S.Range className="absolute h-full bg-thread" />)}
      </S.Track>
      {value.map((v, i) => (
        <S.Thumb
          key={thumbLabels[i]}
          aria-label={thumbLabels[i]}
          aria-valuetext={valueText?.(v, i)}
          aria-describedby={thumbDescribedBy}
          data-testid={testId ? `${testId}-thumb-${i}` : undefined}
          className={bare ? thumbClassName : cn(THUMB, thumbClassName)}
        >
          {thumbContent?.(v, i)}
        </S.Thumb>
      ))}
    </S.Root>
  );
}
