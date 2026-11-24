'use client';

import { useT } from '@/i18n/provider';
import { useMounted } from '@/lib/use-mounted';
import { messages as shell } from '@/messages/shell.messages';
import { NavLink } from '@/shell/nav-link';
import { Thread } from '@/thread/thread';
import { buttonClass } from '@/ui/button';
import { UntrustedText } from '@/ui/untrusted-text';

/** 404.html. The missing path comes from the address bar, so it is shown only as cleaned, truncated text. */
export default function NotFound() {
  const t = useT(shell);
  const mounted = useMounted();
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center">
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
      <p className="text-ink-muted">{t('notFoundHint')}</p>
      {/* A NavLink, like every internal link of the shell and the pages: the way home runs in a view transition. */}
      <NavLink href="/" prefetch={false} className={buttonClass({ variant: 'primary', size: 'lg' })}>
        {t('goHome')}
      </NavLink>
    </section>
  );
}
