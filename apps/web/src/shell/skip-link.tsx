'use client';

import { useT } from '@/i18n/provider';
import { messages as ui } from '@/messages/ui.messages';

/**
 * A button, not `<a href="#main">`: the hash carries page parameters (the vault address, the signing payload), and
 * a fragment link would overwrite them. It is the first element of every page (WCAG 2.4.1).
 */
export function SkipLink({ targetId }: { targetId: string }) {
  const t = useT(ui);
  return (
    <button
      type="button"
      onClick={() => document.getElementById(targetId)?.focus()}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-thread focus:px-4 focus:py-2 focus:font-medium focus:text-on-thread focus:text-small"
    >
      {t('skip')}
    </button>
  );
}
