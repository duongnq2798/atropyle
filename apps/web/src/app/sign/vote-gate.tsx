'use client';

import { useState } from 'react';
import type { TypedReason } from '@/flows/impl/sign-gate';
import { useT } from '@/i18n/provider';
import { messages } from '@/messages/sign.messages';
import { TextField } from '@/ui/text-field';
import { shownReason } from './typed';

export interface VoteRow {
  /** The step index of the vote. */
  index: number;
  reason: TypedReason | null;
}

const REASON_KEY = { invalid: 'voteInvalid', mismatch: 'voteMismatch' } as const;

/**
 * Spec §16.3 of the ecosystem spec: the guardian types the new wallet; the link's text never fills it in. Sign stays
 * off until every vote matches the wallet its calldata names. TextField errors are not live, so the gate has its own
 * polite region for the field typed last.
 */
export function VoteGate({
  rows,
  typed,
  locked,
  onType,
}: {
  rows: readonly VoteRow[];
  typed: Readonly<Record<number, string>>;
  locked: boolean;
  onType(index: number, value: string): void;
}) {
  const t = useT(messages);
  const [touched, setTouched] = useState<Record<number, boolean>>({});
  const [last, setLast] = useState<number | null>(null);
  const shown = (r: VoteRow) => shownReason(r.reason, typed[r.index] ?? '', touched[r.index] ?? false);
  const lastRow = rows.find((r) => r.index === last);
  const lastShown = lastRow ? shown(lastRow) : null;
  const live = !lastRow ? '' : lastRow.reason === null ? t('voteOk') : lastShown ? t(REASON_KEY[lastShown]) : '';
  return (
    <section
      data-testid="sign-votes"
      aria-labelledby="sign-votes-title"
      className="flex flex-col gap-4 rounded-3xl border border-danger/45 bg-danger/8 p-5 sm:p-6"
    >
      <h2 id="sign-votes-title" className="font-display text-ink text-title">
        {t('voteTitle')}
      </h2>
      <p className="text-body text-ink">{t('voteConfirm')}</p>
      {rows.map((r) => {
        const value = typed[r.index] ?? '';
        const reason = shown(r);
        return (
          <TextField
            key={r.index}
            label={t('voteTarget', { n: r.index + 1 })}
            mono
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="0x…"
            readOnly={locked}
            value={value}
            onChange={(e) => {
              setLast(r.index);
              onType(r.index, e.currentTarget.value);
            }}
            onBlur={() => setTouched((x) => ({ ...x, [r.index]: true }))}
            data-testid={`sign-vote-target-${r.index}`}
            hint={r.reason === null ? t('voteOk') : value.trim() === '' ? t('voteEmpty') : undefined}
            error={
              reason ? (
                <span data-testid={`sign-vote-target-${r.index}-error`} data-reason={reason}>
                  {t(REASON_KEY[reason])}
                </span>
              ) : undefined
            }
          />
        );
      })}
      <p aria-live="polite" className="sr-only" data-testid="sign-votes-live">
        {live}
      </p>
    </section>
  );
}
