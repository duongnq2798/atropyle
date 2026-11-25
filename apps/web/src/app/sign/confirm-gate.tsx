'use client';

import type { ConfirmAddress } from '@atropyle/sdk';
import { useState } from 'react';
import type { TypedReason } from '@/flows/impl/sign-gate';
import { useT } from '@/i18n/provider';
import { formatBps } from '@/lib/format';
import { messages } from '@/messages/sign.messages';
import { TextField } from '@/ui/text-field';
import { shownReason } from './typed';

export interface ConfirmRow {
  address: ConfirmAddress;
  /** Its position in the SDK's list, which is the order `confirmed` must follow. */
  i: number;
  /** confirmKey: vault, role and position, which a resumed request keeps. */
  key: string;
  reason: TypedReason | null;
}

const REASON_KEY = { invalid: 'confirmInvalid', mismatch: 'confirmMismatch' } as const;

/**
 * A Drill that can move the signer's tokens, or gets new recipients: every heir (and, with wallet recovery, every
 * guardian) is typed again from the signer's own records before Sign turns on. The labels name the role and the
 * share, never the address; nothing is filled in from the link.
 */
export function ConfirmGate({
  rows,
  typed,
  locked,
  recipients,
  onType,
}: {
  rows: readonly ConfirmRow[];
  typed: Readonly<Record<string, string>>;
  locked: boolean;
  /** DRILL_RECIPIENTS_CHANGED: the link changes who receives, rather than giving the Drill an allowance. */
  recipients: boolean;
  onType(key: string, value: string): void;
}) {
  const t = useT(messages);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [last, setLast] = useState<string | null>(null);
  const shown = (r: ConfirmRow) => shownReason(r.reason, typed[r.key] ?? '', touched[r.key] ?? false);
  const lastRow = rows.find((r) => r.key === last);
  const lastShown = lastRow ? shown(lastRow) : null;
  const done = rows.filter((r) => r.reason === null).length;
  return (
    <section
      data-testid="sign-confirm"
      aria-labelledby="sign-confirm-title"
      aria-describedby="sign-confirm-intro"
      className="flex flex-col gap-4 rounded-3xl border border-danger/45 bg-danger/8 p-5 sm:p-6"
    >
      <h2 id="sign-confirm-title" className="font-display text-ink text-title">
        {t('confirmTitle')}
      </h2>
      <p id="sign-confirm-intro" className="text-body text-ink">
        {t(recipients ? 'confirmIntroRecipients' : 'confirmIntro')}
      </p>
      {rows.map((r) => {
        const a = r.address;
        const value = typed[r.key] ?? '';
        const reason = shown(r);
        return (
          <TextField
            key={r.key}
            label={
              a.role === 'heir'
                ? t('confirmHeir', { n: a.index + 1, share: formatBps(a.bps ?? 0), step: a.step + 1 })
                : t('confirmGuardian', { n: a.index + 1, step: a.step + 1 })
            }
            mono
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="0x…"
            readOnly={locked}
            value={value}
            onChange={(e) => {
              setLast(r.key);
              onType(r.key, e.currentTarget.value);
            }}
            onBlur={() => setTouched((x) => ({ ...x, [r.key]: true }))}
            data-testid={`sign-confirm-${r.i}`}
            error={
              reason ? (
                <span data-testid={`sign-confirm-${r.i}-error`} data-reason={reason}>
                  {t(REASON_KEY[reason])}
                </span>
              ) : undefined
            }
          />
        );
      })}
      <p aria-live="polite" data-testid="sign-confirm-count" className="text-ink-muted text-small">
        {t('confirmCount', { done, total: rows.length })}
      </p>
      <p aria-live="polite" className="sr-only" data-testid="sign-confirm-live">
        {lastShown ? t(REASON_KEY[lastShown]) : ''}
      </p>
    </section>
  );
}
