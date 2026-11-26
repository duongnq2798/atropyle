import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The paper of the heir letter (spec §18.4.2 T11): always vellum (data-theme="light" scopes the tokens), whatever the
 * page's theme, with ruled lines, a thin inner border, at most 62ch of text, and margins of 24, 64 and 96 px from
 * phone to desktop. The signature sits at its foot.
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
        'letter-paper relative mx-auto w-full max-w-[calc(62ch+2*96px)] rounded-2xl text-ink shadow-sm',
        'px-6 py-8 sm:px-16 sm:py-12 lg:px-24 lg:py-16',
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-3 rounded-xl border border-line" />
      <div className="relative mx-auto flex max-w-[62ch] flex-col gap-6">
        {children}
        <footer className="mt-4 flex flex-col gap-2 border-line border-t pt-6">{signature}</footer>
      </div>
    </article>
  );
}
