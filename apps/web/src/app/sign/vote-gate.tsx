'use client';

import { useState } from 'react';
import type { TypedReason } from '@/flows/impl/sign-gate';
import { useT } from '@/i18n/provider';
import { messages } from '@/messages/sign.messages';
import { TextField } from '@/ui/text-field';
import { Gate, TypedEcho } from './gate';
import { Matched } from './matched';
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
    <Gate id="sign-votes" testId="sign-votes" open={rows.every((r) => r.reason === null)} title={t('voteTitle')}>
      <p className="text-body text-ink">{t('voteConfirm')}</p>
      {rows.map((r) => {
        const value = typed[r.index] ?? '';
        const reason = shown(r);
        return (
          <div key={r.index} className="flex flex-col gap-2">
            <TextField
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
              hint={
                r.reason === null ? <Matched>{t('voteOk')}</Matched> : value.trim() === '' ? t('voteEmpty') : undefined
              }
              error={
                reason ? (
                  <span data-testid={`sign-vote-target-${r.index}-error`} data-reason={reason}>
                    {t(REASON_KEY[reason])}
                  </span>
                ) : undefined
              }
            />
            <TypedEcho value={value} testId={`sign-vote-target-${r.index}-typed`} />
          </div>
        );
      })}
      <p aria-live="polite" className="sr-only" data-testid="sign-votes-live">
        {live}
      </p>
    </Gate>
  );
}
