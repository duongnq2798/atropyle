'use client';

import type { PlanIssue, PresetName } from '@atropyle/sdk';
import type { TimingForm } from '@/flows/impl/create-form';
import type { FlowsImpl } from '@/flows/load';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { durationWords } from '@/lib/duration';
import { messages } from '@/messages/editors.messages';
import { TextField } from '@/ui/text-field';
import { useIssueText } from './issue-list';

const PRESET_KEY = {
  drill: 'presetDrill',
  sixMonths: 'presetSixMonths',
  twelveMonths: 'presetTwelveMonths',
} as const satisfies Record<PresetName, keyof typeof messages.en>;

export interface TimingEditorProps {
  flows: FlowsImpl;
  value: TimingForm;
  drill: boolean;
  issues: readonly PlanIssue[];
  showIssues: boolean;
  testId: string;
  onChange(v: TimingForm): void;
}

export function TimingEditor({ flows, value: v, drill, issues, showIssues, testId, onChange }: TimingEditorProps) {
  const t = useT(messages);
  const { lang } = useLang();
  const issueText = useIssueText(flows, drill);
  const err = (path: string): string | undefined => {
    const hit = showIssues ? issues.find((i) => i.path === path) : undefined;
    return hit ? issueText(hit) : undefined;
  };
  const L = flows.LIMITS;
  const words = (seconds: number) => durationWords(seconds, lang);
  const line = (p: PresetName) =>
    t('presetLine', {
      period: words(flows.PRESETS[p].period),
      threshold: flows.PRESETS[p].threshold,
      window: words(flows.PRESETS[p].window),
    });
  const card = (checked: boolean) =>
    cn(
      'flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4',
      checked ? 'border-thread bg-surface-2' : 'border-line bg-surface-1',
    );
  const name = `${testId}-timing`;
  return (
    <fieldset className="space-y-3">
      <legend className="font-display text-h2 text-ink">{t('timingTitle')}</legend>
      {flows.presetsFor(drill).map((p) => (
        <label key={p} className={card(v.preset === p)}>
          <input
            type="radio"
            name={name}
            data-testid={`${testId}-preset-${p}`}
            checked={v.preset === p}
            onChange={() => onChange({ ...v, preset: p })}
            className="mt-1 size-5 shrink-0 accent-thread"
          />
          <span>
            <span className="block text-body text-ink">{t(PRESET_KEY[p])}</span>
            <span className="block text-small text-ink-muted">{line(p)}</span>
          </span>
        </label>
      ))}
      <label className={card(v.preset === 'custom')}>
        <input
          type="radio"
          name={name}
          data-testid={`${testId}-preset-custom`}
          checked={v.preset === 'custom'}
          onChange={() => onChange(v.preset === 'custom' ? v : flows.customFrom(v.preset))}
          className="mt-1 size-5 shrink-0 accent-thread"
        />
        <span className="text-body text-ink">{t('presetCustom')}</span>
      </label>
      {err('timing') ? <p className="text-small text-danger">{err('timing')}</p> : null}
      {v.preset === 'custom' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label={t('periodLabel')}
            value={v.period}
            autoComplete="off"
            data-testid={`${testId}-period`}
            hint={t('periodHint', { min: words(drill ? L.drillMin : L.minPeriod) })}
            error={err('timing.period')}
            onChange={(e) => onChange({ ...v, period: e.target.value })}
          />
          <TextField
            label={t('thresholdLabel')}
            value={v.threshold}
            inputMode="numeric"
            autoComplete="off"
            data-testid={`${testId}-threshold`}
            hint={t('thresholdHint', { max: L.maxThreshold })}
            error={err('timing.threshold')}
            onChange={(e) => onChange({ ...v, threshold: e.target.value })}
          />
          <TextField
            label={t('windowLabel')}
            value={v.window}
            autoComplete="off"
            data-testid={`${testId}-window`}
            hint={t('windowHint', { min: words(drill ? L.drillMin : L.minWindow) })}
            error={err('timing.window')}
            onChange={(e) => onChange({ ...v, window: e.target.value })}
          />
          <p className="text-caption text-ink-muted sm:col-span-3">{t('durationHelp')}</p>
        </div>
      ) : null}
    </fieldset>
  );
}
