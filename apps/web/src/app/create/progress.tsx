'use client';

import { Check } from 'lucide-react';
import type { WizardStep } from '@/flows/impl/wizard';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages } from '@/messages/create.messages';

export const STEP_KEY = {
  kind: 'stepKind',
  heirs: 'stepHeirs',
  guardians: 'stepGuardians',
  timing: 'stepTiming',
  assets: 'stepAssets',
  review: 'stepReview',
  done: 'stepDone',
} as const satisfies Record<WizardStep, keyof typeof messages.en>;

/** The step order, without the flow chunk: test/unit/sdk-copies.test.ts keeps it equal to WIZARD_STEPS. */
export const CREATE_STEPS = Object.keys(STEP_KEY) as WizardStep[];

/** The step's question, the page's h1 (one decision per screen). */
export const ASK_KEY = {
  kind: 'askKind',
  heirs: 'askHeirs',
  guardians: 'askGuardians',
  timing: 'askTiming',
  assets: 'askAssets',
  review: 'askReview',
  done: 'doneTitle',
} as const satisfies Record<WizardStep, keyof typeof messages.en>;

/** Half a column of the seven: the thread runs from the middle of the first to the middle of the last. */
const EDGE = 100 / (CREATE_STEPS.length * 2);

/**
 * The wizard's progress as a thread: one knot per step in seven equal columns, tied up to the current one, which
 * stands out with a halo. A done step is a button back to it unless the plan is frozen; the names show from lg, and
 * the line above says the step in words at every width.
 */
export function Progress(p: { step: WizardStep; locked: boolean; onGo(s: WizardStep): void }) {
  const t = useT(messages);
  const at = CREATE_STEPS.indexOf(p.step);
  const share = CREATE_STEPS.length > 1 ? at / (CREATE_STEPS.length - 1) : 0;
  return (
    <nav aria-label={t('progressNav')} className="space-y-3">
      <p className="font-medium text-caption text-ink-muted tracking-wide">
        {t('progressLine', { n: at + 1, total: CREATE_STEPS.length, name: t(STEP_KEY[p.step]) })}
      </p>
      <ol className="relative grid grid-cols-7">
        <span
          aria-hidden="true"
          className="absolute top-[1.375rem] h-px -translate-y-1/2 bg-line-strong"
          style={{ left: `${EDGE}%`, right: `${EDGE}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute top-[1.375rem] h-0.5 -translate-y-1/2 rounded-full bg-thread motion-safe:transition-[width] motion-safe:duration-300"
          style={{ left: `${EDGE}%`, width: `calc(${share} * (100% - ${2 * EDGE}%))` }}
        />
        {CREATE_STEPS.map((s, i) => {
          const state = i < at ? 'done' : i === at ? 'current' : 'todo';
          const label = t(STEP_KEY[s]);
          const knot = (
            <span
              aria-hidden="true"
              className={cn(
                'relative z-10 flex items-center justify-center rounded-full transition-colors duration-150',
                state === 'done' && 'size-5 bg-thread text-on-thread',
                state === 'current' && 'size-5 border-2 border-thread bg-bg ring-4 ring-thread/20',
                state === 'todo' && 'size-3 border-2 border-line-strong bg-bg',
              )}
            >
              {state === 'done' ? <Check className="size-3" strokeWidth={3} /> : null}
              {state === 'current' ? <span className="size-2 rounded-full bg-thread" /> : null}
            </span>
          );
          return (
            <li
              key={s}
              data-testid={`create-progress-${s}`}
              data-state={state}
              className="flex min-w-0 flex-col items-center gap-1"
            >
              {state === 'done' && !p.locked && s !== 'done' ? (
                <button
                  type="button"
                  onClick={() => p.onGo(s)}
                  className="group flex size-11 items-center justify-center rounded-full hover:bg-surface-2"
                >
                  {knot}
                  <span className="sr-only">{label}</span>
                </button>
              ) : (
                <span
                  className="flex size-11 items-center justify-center"
                  aria-current={state === 'current' ? 'step' : undefined}
                >
                  {knot}
                  <span className="sr-only">{label}</span>
                </span>
              )}
              <span
                aria-hidden="true"
                className={cn(
                  'hidden px-1 text-center text-caption leading-tight lg:block',
                  state === 'current' ? 'font-medium text-ink' : 'text-ink-muted',
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
