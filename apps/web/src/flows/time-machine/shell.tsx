'use client';

import type { EvalState } from '@atropyle/sdk';
import { useId } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages } from '@/messages/time-machine.messages';
import { ErrorBox } from '@/tx/error-box';
import { STATE_BY_CODE } from '@/tx/receipt-view';
import { Skeleton } from '@/ui/skeleton';

// The time machine's frame, shared by the stage (time-machine.tsx) and its skeleton here, so that the skeleton has
// the exact shape of what replaces it (spec §6, §18.2.6): every box below is one class string, used by both.

export const TIME_MACHINE_BOX = 'flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-surface-1 p-5 sm:p-6';
/**
 * The stage inside the box: edge to edge of the box on a phone (the box's p-5), so the thread gets every pixel; a
 * framed screen from sm up.
 */
export const TIME_MACHINE_STAGE =
  'relative isolate -mx-5 flex flex-col gap-4 overflow-hidden border-line border-y bg-bg/50 p-4 ' +
  'sm:mx-0 sm:rounded-2xl sm:border-x sm:p-5';
/**
 * A vault that ended has nothing under its stage: on a phone the stage closes the box, over its bottom padding and
 * into its rounded corners (the box's radius less its border), so no strip of the box is left under it.
 */
export const TIME_MACHINE_STAGE_CLOSED = 'max-sm:-mb-5 max-sm:rounded-b-[calc(1.5rem-1px)] max-sm:border-b-0';
/** The stage's first row: the state's badge, and the date of the frame. */
export const TIME_MACHINE_STAGE_HEAD = 'flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between';
/** The scenario chips: one row of equal cells on a phone (grid-cols-2 or -3 by their count), a wrapping row from sm. */
export const TIME_MACHINE_CHIPS = 'grid gap-1.5 sm:flex sm:flex-wrap sm:items-center sm:gap-2';
/** "I check in again": its own row after a hairline on a phone, after the chips past a divider from sm up. */
export const TIME_MACHINE_SWITCH_ROW =
  'col-span-full flex min-h-11 items-center gap-2.5 pr-1 text-small mt-1.5 border-line border-t pt-1.5 pl-1 ' +
  'sm:mt-0 sm:ml-1 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4';
/** A row of the moments list: its dot, its time, and its sentence (under the time on a phone). */
export const TIME_MACHINE_MOMENT =
  'grid min-h-11 grid-cols-[0.75rem_minmax(0,1fr)] gap-x-3 px-3 py-2.5 sm:grid-cols-[0.75rem_8rem_minmax(0,1fr)]';
/** The line under the moments that says which engine computed them. */
export const TIME_MACHINE_FOOTER = 'flex items-start gap-2 border-line border-t pt-4 text-caption text-ink-muted';

/** What the loaded time machine will show, so its skeleton takes that shape. */
export interface ShellShape {
  /** The scenario chips: the vault has enough guardians for a story where someone signs. */
  picker: boolean;
  /** A vault that ended: one frame, no slider, no moments. */
  closed: boolean;
}

/**
 * The shape of the time machine of a vault in `state` at chain time `now`, from the state alone (the scenarios
 * need the engine, which may be what is loading). It follows scenarios(): a released or expired vault is closed;
 * the chips show where guardians can confirm or vote (k of at least k guardians, active or in grace). A case it
 * misses (every confirmation already in, and no recovery) costs one row of chips when the stage arrives.
 */
export function shellShape(
  state: Pick<EvalState, 'state' | 'k' | 'guardians'>,
  now: bigint,
  expiresAt: bigint | null,
): ShellShape {
  const name = STATE_BY_CODE[state.state];
  const expired = expiresAt !== null && now >= expiresAt;
  const closed = expired || name === 'releasedInherit' || name === 'releasedRecover';
  const open = !closed && (name === 'active' || name === 'grace');
  return { picker: open && state.k > 0 && state.guardians.length >= state.k, closed };
}

const OPEN: ShellShape = { picker: true, closed: false };
const PILL = 'block rounded-full border border-line';

/**
 * One line of text, as a bar: the line box of the text size `size` (h-lh), so lines add up to the paragraph they
 * stand for. `line` places the line (`sm:hidden` for a line that only a phone wraps onto).
 */
function Line({ size, width, line }: { size: string; width: string; line?: string }) {
  return (
    <span className={cn('flex h-lh items-center', size, line)}>
      <Skeleton className={cn('h-[0.7em]', width)} />
    </span>
  );
}

/** The moments of the default story (now, the alarm, the release) as rail rows: a time, then a sentence. */
const MOMENT_LINES = [
  { time: 'w-10', words: 'w-40', wrap: null },
  { time: 'w-24', words: 'w-full sm:w-80', wrap: 'w-1/3' },
  { time: 'w-20', words: 'w-full sm:w-96', wrap: 'w-1/2' },
] as const;

/**
 * The time machine's box while its code or its engine loads, with the shape of what comes, so nothing jumps when
 * it arrives (`shape`, from shellShape: the chips or none, open or closed); or the error of that load with a Retry.
 */
export function TimeMachineShell({
  testId,
  className,
  shape = OPEN,
  error,
  onRetry,
}: {
  testId: string;
  className?: string;
  shape?: ShellShape;
  error: unknown;
  onRetry(): void;
}) {
  const t = useT(messages);
  const titleId = useId();
  const failed = error !== null && error !== undefined;
  return (
    <section
      data-testid={testId}
      aria-busy={failed ? undefined : true}
      aria-labelledby={titleId}
      className={cn(TIME_MACHINE_BOX, className)}
    >
      <header className="flex flex-col gap-1.5">
        <h2 id={titleId} className="font-display text-ink text-title">
          {t('title')}
        </h2>
        <p className="text-ink-muted text-small">
          {failed ? t('failed') : t('loading')}
          {/* The intro it stands for wraps onto a second line on a phone. */}
          {failed || shape.closed ? null : <Line size="text-small" width="w-1/2" line="sm:hidden" />}
        </p>
      </header>
      {failed ? <ErrorBox error={error} onRetry={onRetry} testId={`${testId}-error`} /> : <Skeletons shape={shape} />}
    </section>
  );
}

/** The skeleton's parts, in the stage's order; each a direct child of the box, like the stage's own. */
function Skeletons({ shape }: { shape: ShellShape }) {
  return (
    <>
      {shape.picker ? (
        <div aria-hidden="true" className="flex min-w-0 flex-col">
          <Line size="text-small" width="w-14" line="mb-2" />
          <div data-part="skeleton-chips" className={cn(TIME_MACHINE_CHIPS, 'grid-cols-3')}>
            <span data-part="skeleton-chip" className={cn(PILL, 'h-11 sm:w-[4.5rem]')} />
            <span data-part="skeleton-chip" className={cn(PILL, 'h-11 sm:w-[9.75rem]')} />
            <span data-part="skeleton-chip" className={cn(PILL, 'h-11 sm:w-24')} />
            {/* The switch, as under Silent: dimmed on its own row on a phone, out of sight from sm up. */}
            <span className={cn(TIME_MACHINE_SWITCH_ROW, 'sm:invisible')}>
              <span className={cn(PILL, 'h-6 w-10 shrink-0')} />
              <Skeleton className="h-[0.7em] w-28" />
            </span>
          </div>
        </div>
      ) : null}
      {shape.closed ? null : (
        <p aria-hidden="true" className="flex flex-col">
          <Line size="text-small" width="w-full sm:w-3/4" />
          <Line size="text-small" width="w-1/3" line="sm:hidden" />
        </p>
      )}

      <div
        aria-hidden="true"
        data-part="skeleton-stage"
        className={cn(TIME_MACHINE_STAGE, shape.closed && TIME_MACHINE_STAGE_CLOSED)}
      >
        <div className={TIME_MACHINE_STAGE_HEAD}>
          <span className={cn(PILL, 'h-8 w-28')} />
          <Line size="text-caption" width="w-44" />
        </div>
        {shape.closed ? (
          // A closed vault's Thread is a still one, at the Thread's own 5:1 on the stage's full width.
          <div className="flex aspect-[5/1] items-center">
            <span className="h-0.5 w-full rounded-full bg-line" />
          </div>
        ) : (
          // The Scrubber's thread: inset by half a thumb, 3:1 on a phone and 5:1 from 32rem.
          <div className="@container">
            <div className="mx-5.5 flex aspect-[3/1] items-center @min-[32rem]:aspect-[5/1]">
              <span className="h-0.5 w-full rounded-full bg-line" />
            </div>
          </div>
        )}
        {shape.closed ? (
          // What the rules decided: two lines.
          <span className="flex flex-col">
            <Line size="text-lead" width="w-full" />
            <Line size="text-lead" width="w-2/3 sm:w-1/4" />
          </span>
        ) : (
          <Line size="text-lead" width="w-2/3 sm:w-1/2" />
        )}
      </div>

      {shape.closed ? null : (
        <>
          <p aria-hidden="true" className="-mt-2 flex flex-col">
            <Line size="text-caption" width="w-full sm:w-4/5" />
            <Line size="text-caption" width="w-full" line="sm:hidden" />
            <Line size="text-caption" width="w-1/4" line="sm:hidden" />
          </p>
          <div aria-hidden="true" className="flex flex-col gap-2">
            <Line size="text-small" width="w-20" />
            <div data-part="skeleton-moments" className="flex flex-col">
              {MOMENT_LINES.map((m, i) => (
                <span key={m.time} className={TIME_MACHINE_MOMENT}>
                  <span className="flex h-[1.3125rem] items-center justify-center">
                    <span className={cn('size-2.5 rounded-full border-2 border-line', i === 0 && 'bg-line')} />
                  </span>
                  <span className="flex h-[1.3125rem] items-center">
                    <Skeleton className={cn('h-[0.7em] text-caption', m.time)} />
                  </span>
                  <span className="col-start-2 flex min-w-0 flex-col sm:col-start-3">
                    <Line size="text-small" width={m.words} />
                    {/* A sentence a phone wraps onto a second line. */}
                    {m.wrap ? <Line size="text-small" width={m.wrap} line="sm:hidden" /> : null}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <p aria-hidden="true" data-part="skeleton-footer" className={TIME_MACHINE_FOOTER}>
            <span className="mt-px size-3.5 shrink-0 rounded-sm border border-line" />
            <span className="flex min-w-0 grow flex-col">
              <Line size="text-caption" width="w-full sm:w-2/3" />
              <Line size="text-caption" width="w-2/3" line="sm:hidden" />
            </span>
          </p>
        </>
      )}
    </>
  );
}
