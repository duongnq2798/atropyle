'use client';

import { useId, useState } from 'react';
import { BPS_STEP, boundaries, fromBoundaries, normalizeBoundaries, setShare, TOTAL_BPS } from '@/flows/shares';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages } from '@/messages/editors.messages';
import { BRANCH_BG } from '@/thread/branches';
import { branchWidths } from '@/thread/geometry';
import { SLIDER_THUMB, Slider } from '@/ui/slider';

/**
 * How tall a lone heir's part would be, in px: the parts keep the proportions of the Thread's branches
 * (branchWidths, √n), at this scale instead of MAIN_WIDTH. With five heirs the tallest part stays under 18 px.
 */
export const TRACK_MAIN = 8;

export interface ShareSplitterProps {
  shares: readonly number[];
  /** Display names, one per heir ("Heir 1"); they must differ: they key the thumbs and the fields. */
  names: readonly string[];
  onChange(shares: number[]): void;
  testId: string;
  disabled?: boolean;
}

/**
 * n heirs, n − 1 thumbs: every share at least 1%, the sum always 100% (Quyết định 6). Each part is painted with its
 * heir's branch colour, as thick as that heir's branch will be (spec §18.4.2 T6); every share is also a number field.
 */
export function ShareSplitter({ shares, names, onChange, testId, disabled }: ShareSplitterProps) {
  const t = useT(messages);
  const helpId = useId();
  if (shares.length <= 1) {
    return (
      <p data-testid={`${testId}-single`} className="text-small text-ink-muted">
        {t('shareSingle')}
      </p>
    );
  }
  const pct = (bps: number) => String(bps / 100);
  const thumbs = boundaries(shares);
  const heights = branchWidths(shares, TRACK_MAIN);
  const pair = (i: number) => ({ a: names[i] ?? '', b: names[i + 1] ?? '' });
  return (
    <div className="space-y-3">
      <Slider
        testId={testId}
        value={thumbs}
        min={0}
        max={TOTAL_BPS}
        step={BPS_STEP}
        minStepsBetweenThumbs={1}
        preserveThumbOrder
        disabled={disabled}
        bare
        className="h-11"
        trackClassName="relative flex h-6 grow items-center gap-0.5"
        thumbClassName={SLIDER_THUMB}
        thumbLabels={thumbs.map((_, i) => t('shareThumb', pair(i)))}
        thumbDescribedBy={helpId}
        valueText={(_, i) => t('shareValue', { ...pair(i), pa: pct(shares[i] ?? 0), pb: pct(shares[i + 1] ?? 0) })}
        onValueChange={(v) => onChange(fromBoundaries(normalizeBoundaries(v)))}
        track={shares.map((s, i) => (
          <span
            key={names[i]}
            aria-hidden="true"
            data-part="share"
            data-branch={i + 1}
            className={cn('block rounded-full', BRANCH_BG[i % BRANCH_BG.length])}
            style={{ flex: `${s} 1 0%`, height: `${heights[i] ?? 1}px` }}
          />
        ))}
      />
      <p id={helpId} className="text-caption text-ink-muted">
        {t('sharesHelp', { step: BPS_STEP / 100 })}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {shares.map((s, i) => (
          <PercentField
            key={names[i]}
            label={t('sharePercent', { name: names[i] ?? '' })}
            name={names[i] ?? ''}
            tone={BRANCH_BG[i % BRANCH_BG.length]}
            bps={s}
            disabled={disabled}
            testId={`${testId}-percent-${i}`}
            onCommit={(bps) => onChange(setShare(shares, i, bps))}
          />
        ))}
      </div>
    </div>
  );
}

/** A percent that applies when the field is left or Enter is pressed, so typing "5" on the way to "50" moves nothing. */
function PercentField(p: {
  label: string;
  name: string;
  tone: string;
  bps: number;
  disabled?: boolean;
  testId: string;
  onCommit(bps: number): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.replace(',', '.').trim());
    setDraft(null);
    if (draft.trim() !== '' && Number.isFinite(n)) p.onCommit(Math.round(n * 100));
  };
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="flex items-center gap-2 text-caption text-ink-muted">
        <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', p.tone)} />
        {p.name}
      </span>
      {/* The field and its % sign are one box, like a TextField; the focus ring goes round both. */}
      <span
        className={cn(
          'flex h-11 items-center rounded-xl border border-line-strong bg-surface-1 pr-3.5',
          'transition-colors duration-150 hover:border-ink-muted has-[input:focus-visible]:border-thread',
          'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2',
          'has-[input:focus-visible]:outline-thread has-[input:disabled]:opacity-50',
        )}
      >
        <input
          aria-label={p.label}
          data-testid={p.testId}
          inputMode="decimal"
          autoComplete="off"
          disabled={p.disabled}
          value={draft ?? String(p.bps / 100)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          className="h-full w-full min-w-0 rounded-xl bg-transparent pl-3.5 font-mono text-body text-ink tabular-nums focus-visible:outline-none"
        />
        <span aria-hidden="true" className="font-mono text-body text-ink-muted">
          %
        </span>
      </span>
    </label>
  );
}
