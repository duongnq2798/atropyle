'use client';

import type { InspectedStep } from '@atropyle/sdk';
import { ChevronDown } from 'lucide-react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/format';
import { messages } from '@/messages/sign.messages';
import { ACTION_KEY, messages as flowMessages } from '@/messages/tx-flow.messages';
import { Address } from '@/ui/address';
import { UntrustedText } from '@/ui/untrusted-text';

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
  return (
    <li
      data-testid={`sign-step-${step.index}`}
      data-allowed={String(step.allowed)}
      className={cn(
        'flex flex-col gap-2 rounded-2xl border p-4',
        step.allowed ? 'border-line bg-surface-1' : 'border-danger/45 bg-danger/8',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-caption text-ink-muted tabular-nums">{step.index + 1}</span>
        <span className="text-body text-ink">{step.action ? tf(ACTION_KEY[step.action]) : t('unknownAction')}</span>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 text-caption',
            step.allowed ? 'border-line-strong text-ink' : 'border-danger/45 font-medium text-danger',
          )}
        >
          {step.allowed ? t('allowedYes') : t('allowedNo')}
        </span>
      </div>
      {step.summary ? (
        <p lang="en" className="text-ink-muted text-small">
          <UntrustedText value={step.summary} max={400} />
        </p>
      ) : null}
      {step.reason ? (
        <p lang="en" className="text-danger text-small">
          <UntrustedText value={step.reason} max={280} />
        </p>
      ) : null}
      <details className="group">
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
    </li>
  );
}
