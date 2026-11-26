'use client';

import type { PlanIssue } from '@atropyle/sdk';
import { KeyRound, Plus, X } from 'lucide-react';
import type { FlowsImpl } from '@/flows/load';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { durationWords } from '@/lib/duration';
import { messages } from '@/messages/editors.messages';
import { messages as warnings } from '@/messages/warnings.messages';
import { Button } from '@/ui/button';
import { InlineError } from '@/ui/inline-error';
import { PlainIconButton } from '@/ui/plain-icon-button';
import { KNOB, SWITCH } from '@/ui/switch';
import { TextField } from '@/ui/text-field';
import { AddressInput } from './address-input';
import { useIssueText } from './issue-list';

export interface GuardianFields {
  guardians: string[];
  k: string;
  recoveryEnabled: boolean;
}

export interface GuardiansEditorProps {
  flows: FlowsImpl;
  value: GuardianFields;
  issues: readonly PlanIssue[];
  showIssues: boolean;
  testId: string;
  /**
   * The plan's alarm window in seconds, for the RECOVERY_POWER sentence: flows.timingWindow(form.timing) in the
   * wizard, the vault's timing.window when an owner edits. null while it is unknown.
   */
  recoveryWindow: number | null;
  /** Rows that cannot be removed: 1 in the wizard, 0 when an owner edits a vault to drop every guardian. */
  min?: number;
  onChange(v: GuardianFields): void;
}

/** planTemplate('guarded') reads an empty k as a majority. */
export function majorityOf(n: number): number {
  return Math.floor(n / 2) + 1;
}

/** The k the plan will hold: a majority for an empty field, a typed whole number from 1 to n, else null. */
export function effectiveK(text: string, n: number): number | null {
  if (n <= 0) return null;
  const s = text.trim();
  if (s === '') return majorityOf(n);
  const k = Number(s);
  return Number.isInteger(k) && k >= 1 && k <= n ? k : null;
}

export function GuardiansEditor({
  flows,
  value: v,
  issues,
  showIssues,
  testId,
  recoveryWindow,
  min = 1,
  onChange,
}: GuardiansEditorProps) {
  const t = useT(messages);
  const tw = useT(warnings);
  const { lang } = useLang();
  const issueText = useIssueText(flows);
  const err = (path: string): string | undefined => {
    const hit = showIssues ? issues.find((i) => i.path === path) : undefined;
    return hit ? issueText(hit) : undefined;
  };
  const set = (patch: Partial<GuardianFields>) => onChange({ ...v, ...patch });
  const n = v.guardians.length;
  const dupes = new Set(flows.duplicateIndexes(v.guardians));
  const majority = majorityOf(n);
  const k = effectiveK(v.k, n);
  // RECOVERY_POWER in the reader's words, from the shared key (7B-main-sync): never the SDK's English sentence.
  const power =
    v.recoveryEnabled && n > 0
      ? k !== null && recoveryWindow !== null
        ? tw('recoveryPower', { k, n, window: durationWords(recoveryWindow, lang) })
        : t('recoveryPowerSome')
      : '';
  return (
    <fieldset className="space-y-4">
      <legend className="font-display text-h2 text-ink">{t('guardiansTitle')}</legend>
      <p className="text-body text-ink-muted">{t('guardiansHelp')}</p>
      {v.guardians.map((g, i) => (
        <AddressInput
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional (guardian 1, guardian 2)
          key={i}
          flows={flows}
          label={t('guardianAccount', { n: i + 1 })}
          value={g}
          testId={`${testId}-guardian-${i}`}
          duplicate={dupes.has(i)}
          error={err(`guardians[${i}]`)}
          onChange={(a) => set({ guardians: v.guardians.map((x, j) => (j === i ? a : x)) })}
          action={
            n > min ? (
              <PlainIconButton
                icon={X}
                label={t('removeGuardian', { n: i + 1 })}
                data-testid={`${testId}-remove-guardian-${i}`}
                onClick={() => set({ guardians: v.guardians.filter((_, j) => j !== i) })}
              />
            ) : null
          }
        />
      ))}
      {err('guardians') ? <InlineError>{err('guardians')}</InlineError> : null}
      {n < flows.LIMITS.maxGuardians ? (
        <Button
          variant="secondary"
          icon={<Plus aria-hidden="true" className="size-4" />}
          data-testid={`${testId}-add-guardian`}
          onClick={() => set({ guardians: [...v.guardians, ''] })}
        >
          {t('addGuardian')}
        </Button>
      ) : null}
      {n > 0 ? (
        <div className="space-y-4">
          <TextField
            // A number of one digit: the field need not run the width of the form.
            className="sm:max-w-xs"
            label={t('kLabel')}
            value={v.k}
            inputMode="numeric"
            autoComplete="off"
            placeholder={String(majority)}
            data-testid={`${testId}-k`}
            hint={t('kHelp', { n, majority })}
            error={err('k')}
            onChange={(e) => set({ k: e.target.value })}
          />
          {/* A native checkbox drawn as the product's switch (ui/switch.ts): off is the default here. */}
          <label className="group flex min-h-11 cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              data-testid={`${testId}-recovery`}
              checked={v.recoveryEnabled}
              onChange={(e) => set({ recoveryEnabled: e.target.checked })}
              className="peer sr-only"
            />
            <span aria-hidden="true" data-part="switch" className={cn(SWITCH, 'mt-0.5')}>
              <span className={KNOB} />
            </span>
            <span>
              <span className="block text-body text-ink">{t('recovery')}</span>
              <span className="block text-small text-ink-muted">{t('recoveryHelp')}</span>
              {err('recoveryEnabled') ? <InlineError>{err('recoveryEnabled')}</InlineError> : null}
            </span>
          </label>
        </div>
      ) : null}
      {/* In the page from the first paint, so ticking recovery reads the sentence out (7A rule 19). */}
      <p
        aria-live="polite"
        data-testid={`${testId}-recovery-power`}
        className={
          power
            ? 'flex items-start gap-3 rounded-xl border border-line-strong bg-surface-2 p-4 text-small text-ink'
            : undefined
        }
      >
        {power ? (
          <>
            <KeyRound aria-hidden="true" size={18} strokeWidth={1.5} className="mt-px shrink-0 text-recovery" />
            <span>{power}</span>
          </>
        ) : null}
      </p>
    </fieldset>
  );
}
