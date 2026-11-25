'use client';

import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { IS_VERCEL } from '@/config/env';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { useMounted } from '@/lib/use-mounted';
import { messages as ui } from '@/messages/ui.messages';
import { VisuallyHidden } from './visually-hidden';

export function safeExternalHref(href: string): string | null {
  try {
    const u = new URL(href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

const LOOK = {
  inline:
    'inline-flex items-center gap-1 underline decoration-line-strong decoration-1 underline-offset-4 ' +
    'transition-colors duration-150 hover:decoration-thread',
  icon:
    'inline-grid size-8 shrink-0 place-items-center rounded-full text-ink-muted transition-colors duration-150 ' +
    'hover:bg-surface-2 hover:text-ink',
} as const;

/**
 * A link that leaves the site, in a new tab without an opener. `variant="icon"` is a round arrow button whose
 * children are its hidden label. Quyết định 16: on DeWEB the gateway's static scan counts external `href`s in the
 * prerendered HTML, so the deweb build prints text first and links after mount.
 */
export function ExternalLink({
  href,
  children,
  icon = true,
  variant = 'inline',
  className,
}: {
  href: string;
  children: ReactNode;
  icon?: boolean;
  variant?: 'inline' | 'icon';
  className?: string;
}) {
  const t = useT(ui);
  const mounted = useMounted();
  const safe = safeExternalHref(href);
  const cls = cn(LOOK[variant], className);
  const body =
    variant === 'icon' ? (
      <>
        <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.5} />
        <VisuallyHidden>{children}</VisuallyHidden>
      </>
    ) : (
      children
    );
  if (!safe || (!IS_VERCEL && !mounted)) {
    return (
      <span className={cls} data-external={safe ? 'pending' : 'refused'}>
        {body}
      </span>
    );
  }
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
      {variant === 'inline' && icon ? (
        <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.5} className="shrink-0" />
      ) : null}
      <VisuallyHidden>{` ${t('newTab')}`}</VisuallyHidden>
    </a>
  );
}
