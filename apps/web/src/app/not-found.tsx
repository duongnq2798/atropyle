'use client';

import { type ComponentType, lazy, Suspense } from 'react';
import { useT } from '@/i18n/provider';
import { useMounted } from '@/lib/use-mounted';
import { messages as shell } from '@/messages/shell.messages';
import { NavLink } from '@/shell/nav-link';
import { Thread } from '@/thread/thread';
import { buttonClass } from '@/ui/button';
import { UntrustedText } from '@/ui/untrusted-text';

const NoHint: ComponentType<{ pathname: string }> = () => null;
/** Ruling T10-R8: the suggestion is a chunk of its own, fetched after mount; a chunk that fails to load shows nothing. */
const Hint = lazy<ComponentType<{ pathname: string }>>(() =>
  import('@/shell/not-found-hint').catch(() => ({ default: NoHint })),
);

/** 404.html. The missing path comes from the address bar, so it is shown only as cleaned, truncated text. */
export default function NotFound() {
  const t = useT(shell);
  const mounted = useMounted();
  return (
    <section className="nf mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center">
      <Thread state="expired" className="w-full max-w-md" />
      <h1 className="font-display text-h1">{t('notFoundTitle')}</h1>
      {mounted ? (
        <p className="flex max-w-full flex-col gap-1 text-ink-muted">
          {t('notFoundBody')}
          <code className="font-mono text-ink text-small">
            <UntrustedText value={window.location.pathname} max={96} />
          </code>
        </p>
      ) : null}
      {mounted ? (
        <Suspense fallback={null}>
          <Hint pathname={window.location.pathname} />
        </Suspense>
      ) : null}
      <p className="text-ink-muted">{t('notFoundHint')}</p>
      {/* A NavLink, like every internal link of the shell and the pages: the way home runs in a view transition. */}
      <NavLink
        href="/"
        prefetch={false}
        className={buttonClass({ variant: 'primary', size: 'lg', className: 'nf-home' })}
      >
        {t('goHome')}
      </NavLink>
    </section>
  );
}
