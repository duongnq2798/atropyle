'use client';

import type { InspectedStep } from '@atropyle/sdk';
import { ChevronDown, X } from 'lucide-react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/format';
import { untrusted } from '@/lib/untrusted';
import { messages } from '@/messages/sign.messages';
import { ACTION_KEY, messages as flowMessages } from '@/messages/tx-flow.messages';
import { SummaryText } from '@/tx/summary-text';
import { Address } from '@/ui/address';
import { UntrustedText } from '@/ui/untrusted-text';

/**
 * The SDK's words about a step: cleaned like any untrusted text (no hidden or bidi character, cut to `max`), isolated
 * from the surrounding direction, and only then drawn, with every full address in groups of four like the card's
 * summaries, so an address in a refusal can be compared group by group and never breaks inside a group.
 */
function SdkText({ text, max }: { text: string; max: number }) {
  return (
    <bdi data-untrusted="" className="break-words">
      <SummaryText text={untrusted(text, max).value} />
    </bdi>
  );
}

/**
 * One step of a request that cannot be signed: what it is, why it was refused, and its technical details. Even an
 * allowed step gets a neutral label here, never a green one: nothing in this request is fine to sign.
 */
export function SignStep({
  step,
  dataBytes,
  explorer,
}: {
  step: InspectedStep;
  dataBytes: number;
  explorer: string | null;
}) {
  const t = useT(messages);
  const tf = useT(flowMessages);
  const sim = step.simulation.ok === true ? 'simOk' : step.simulation.ok === false ? 'simFailed' : 'simSkipped';
  // A step that is allowed but would fail is the reason nothing can be signed: it is marked like a refusal.
  const fails = step.simulation.ok === false;
  const bad = !step.allowed || fails;
  return (
    <li
      data-testid={`sign-step-${step.index}`}
      data-allowed={String(step.allowed)}
      data-fails={fails ? 'true' : undefined}
      className={cn(
        'flex gap-4 rounded-2xl border p-4 sm:p-5',
        bad ? 'border-danger/45 bg-danger/8' : 'border-line bg-surface-1',
      )}
    >
      {/* The list is an <ol>: a screen reader already counts the steps. */}
      <span
        aria-hidden="true"
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full border font-mono text-small tabular-nums',
          bad ? 'border-danger/60 text-danger' : 'border-line-strong text-ink-muted',
        )}
      >
        {step.index + 1}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-balance text-body text-ink">
            {step.action ? tf(ACTION_KEY[step.action]) : t('unknownAction')}
          </p>
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-caption',
              step.allowed ? 'border-line-strong text-ink' : 'border-danger/45 font-medium text-danger',
            )}
          >
            {step.allowed ? t('allowedYes') : t('allowedNo')}
          </span>
          {fails ? (
            <span className="rounded-full border border-danger/45 px-2 py-0.5 font-medium text-caption text-danger">
              {t('simFailed')}
            </span>
          ) : null}
        </div>
        {step.summary ? (
          <p lang="en" className="text-ink-muted text-small">
            <SdkText text={step.summary} max={400} />
          </p>
        ) : null}
        {step.reason ? (
          // Why it was refused, as a sentence in ink: the chip, the number ring and the border already carry the red.
          // ::first-letter reaches the first letter inside the <bdi>, so the SDK's fragment starts with a capital.
          <div className="flex items-start gap-2">
            <X aria-hidden="true" size={14} strokeWidth={2.25} className="mt-1.5 shrink-0 text-danger" />
            <p
              data-testid={`sign-step-${step.index}-reason`}
              lang="en"
              className="text-body text-ink first-letter:uppercase"
            >
              <SdkText text={step.reason} max={280} />
            </p>
          </div>
        ) : null}
        <details className="group mt-1">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-caption text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            {t('technical')}
            <ChevronDown
              aria-hidden="true"
              size={14}
              strokeWidth={1.5}
              className="transition-transform duration-150 group-open:rotate-180"
            />
          </summary>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-xl bg-surface-2/60 p-3 text-small">
            <dt className="text-ink-muted">{t('contract')}</dt>
            <dd className="min-w-0">
              <Address address={step.to} size="sm" avatar={false} explorer={explorer} />
            </dd>
            <dt className="text-ink-muted">{t('value')}</dt>
            <dd className="font-mono text-ink tabular-nums">{formatAmount(step.value, 18)} OKB</dd>
            <dt className="text-ink-muted">{t('dataBytes')}</dt>
            <dd className="font-mono text-ink tabular-nums">{t('bytes', { n: dataBytes })}</dd>
            <dt className="text-ink-muted">{t('simulation')}</dt>
            <dd className="text-ink">{t(sim)}</dd>
            {step.builderCodes && step.builderCodes.length > 0 ? (
              <>
                <dt className="text-ink-muted">{t('builderCodes')}</dt>
                <dd className="font-mono text-ink">
                  <UntrustedText value={step.builderCodes.join(' ')} max={200} />
                </dd>
              </>
            ) : null}
          </dl>
        </details>
      </div>
    </li>
  );
}
