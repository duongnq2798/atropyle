'use client';

import { useT } from '@/i18n/provider';
import { useLoadFailed } from '@/lib/lazy-chunk';
import { messages as shell } from '@/messages/shell.messages';
import { InlineError } from '@/ui/inline-error';

/**
 * Says that a chunk a press asked for did not load (offline, or a deploy replaced the hashed chunks of an open
 * tab), until a chunk next loads. The alert region is part of every page from the first paint, since a region
 * that arrives already filled is not reliably read out, and it is eager: a lazy notice would fail with the rest.
 * The reader reloads; an automatic reload would lose a form in progress, and offline it would lose the page.
 */
export function LoadNotice() {
  const t = useT(shell);
  const failed = useLoadFailed();
  return (
    <div
      role="alert"
      data-testid="load-notice"
      className={failed ? 'mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6' : undefined}
    >
      {failed ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <InlineError>{t('loadFailed')}</InlineError>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-sm text-ink text-small underline underline-offset-4 hover:text-thread"
          >
            {t('reload')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
