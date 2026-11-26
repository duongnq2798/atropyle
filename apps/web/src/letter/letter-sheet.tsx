import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The paper of the heir letter (spec §18.4.2 T11): always vellum (data-theme="light" scopes the tokens), whatever the
 * page's theme, with ruled lines, a thin inner border, a measure of 34rem, and margins of 24, 64 and 96 px from
 * phone to desktop. The signature sits at its foot. The measure is in rem, not ch: a ch here would be the UI face's,
 * much wider than the Letter's italic, and 62ch of it ran the italic body past 90 characters a line; 34rem keeps the
 * body at about 70 and the lead at about 60 (spec §4.2: 60 to 72).
 */
export function LetterSheet({
  children,
  signature,
  testId,
  className,
  labelledBy,
}: {
  children: ReactNode;
  signature: ReactNode;
  testId?: string;
  className?: string;
  labelledBy?: string;
}) {
  return (
    <article
      data-theme="light"
      data-testid={testId}
      aria-labelledby={labelledBy}
      className={cn(
        'letter-paper relative mx-auto w-full max-w-[calc(34rem+2*96px)] rounded-2xl text-ink shadow-sm',
        'px-6 py-8 sm:px-16 sm:py-12 lg:px-24 lg:py-16',
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-3 rounded-xl border border-line" />
      <div className="relative mx-auto flex w-full max-w-[34rem] flex-col gap-6">
        {children}
        <footer className="mt-4 flex flex-col gap-2 border-line border-t pt-6">{signature}</footer>
      </div>
    </article>
  );
}
