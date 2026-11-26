'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '@/i18n/provider';
import { isAddressText } from '@/lib/address';
import { cn } from '@/lib/cn';
import { messages } from '@/messages/sign.messages';
import { Address } from '@/ui/address';

/**
 * The frame of a gate the signer types addresses into. Closed, it is red and says what to type; once every address
 * matches it turns the colour of a living vault and says so beside a tick, so an open gate looks open. The intro and
 * the fields stay as they are, and the gate's own live region announces the match.
 */
export function Gate({
  id,
  testId,
  open,
  title,
  describedBy,
  children,
}: {
  id: string;
  testId: string;
  open: boolean;
  title: string;
  describedBy?: string;
  children: ReactNode;
}) {
  const t = useT(messages);
  return (
    <section
      data-testid={testId}
      data-open={String(open)}
      aria-labelledby={`${id}-title`}
      aria-describedby={describedBy}
      className={cn(
        'flex flex-col gap-4 rounded-3xl border p-5 transition-colors duration-240 sm:p-6',
        open ? 'border-alive/45 bg-alive/8' : 'border-danger/45 bg-danger/8',
      )}
    >
      <div className="flex items-center gap-4">
        {open ? (
          // The disc of the page's verdict, in the colour of a living vault.
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-alive text-on-thread"
          >
            <Check size={20} strokeWidth={2} />
          </span>
        ) : null}
        <h2 id={`${id}-title`} className="font-display text-ink text-title">
          {open ? t('gateOpen') : title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/**
 * What was typed, once it reads as an address, drawn like every address on the page: in groups of four, two rows of
 * five, so it can be compared group by group with the mirror and the terms. A field shows about 30 of the 42
 * characters on a phone and never groups them. A screen reader already reads the field's value: this is for the eye.
 */
export function TypedEcho({ value, testId }: { value: string; testId: string }) {
  const t = useT(messages);
  const typed = value.trim();
  if (!isAddressText(typed)) return null;
  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-1/60 px-3.5 py-3"
    >
      <span className="text-caption text-ink-muted">{t('youTyped')}</span>
      <Address address={typed} copy={false} avatar={false} size="sm" />
    </div>
  );
}
