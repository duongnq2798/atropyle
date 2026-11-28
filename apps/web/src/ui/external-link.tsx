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
  // Wraps like a sentence on a narrow card: the arrow keeps to the last word instead of the far end of a flex box.
  flow:
    'underline decoration-line-strong decoration-1 underline-offset-4 transition-colors duration-150 ' +
    'hover:decoration-thread',
} as const;

/** `flow`: the label's last word and the arrow never part, so the arrow never stands alone on a line. */
function flowBody(children: ReactNode, arrow: ReactNode): ReactNode {
  if (typeof children !== 'string') {
    return (
      <>
        {children}
        {arrow}
      </>
    );
  }
  const at = children.trimEnd().lastIndexOf(' ');
  return (
    <>
      {at < 0 ? null : children.slice(0, at + 1)}
      <span className="whitespace-nowrap">
        {children.slice(at + 1)}
        {arrow}
      </span>
    </>
  );
}

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
  variant?: 'inline' | 'icon' | 'flow';
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
  // Lucide's ArrowUpRight at 14 px, painted through a CSS mask (globals.css, `.ext-arrow`): an inline SVG cost about
  // 330 bytes of HTML per link, and every page's footer prints three (7C-F1).
  const arrow =
    variant === 'inline' && icon ? (
      <span aria-hidden="true" className="ext-arrow" />
    ) : variant === 'flow' && icon ? (
      <span aria-hidden="true" className="ext-arrow ml-1 align-[-0.125em]" />
    ) : null;
  // The arrow is drawn before the link comes too: the text keeps its width, and nothing beside it moves when the page
  // mounts (7B-P1: the footer's links moved 16 px on every deweb page).
  const content =
    variant === 'flow' ? (
      flowBody(children, safe ? arrow : null)
    ) : (
      <>
        {body}
        {safe ? arrow : null}
      </>
    );
  if (!safe || (!IS_VERCEL && !mounted)) {
    return (
      <span className={cls} data-external={safe ? 'pending' : 'refused'}>
        {content}
      </span>
    );
  }
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className={cls}>
      {content}
      <VisuallyHidden>{` ${t('newTab')}`}</VisuallyHidden>
    </a>
  );
}
