'use client';

import { useT } from '@/i18n/provider';
import { suggestFor } from '@/lib/route-suggest';
import { messages as nf } from '@/messages/not-found.messages';
import { vaultHref, verifyHref } from '@/routes';
import { buttonClass } from '@/ui/button';
import { NavLink } from './nav-link';

/**
 * The 404 page's suggestion, in a chunk of its own that loads after mount (ruling T10-R8): the not-found boundary's
 * chunk is in the first load of every page, and `/` has about 0.3 kB of its 200 kB left. It only ever offers one of
 * this site's own pages or a 40-hex-digit address read from the path, never other text from it. `data-nf-suggest`
 * lets globals.css step the home button back.
 */
export default function NotFoundHint({ pathname }: { pathname: string }) {
  const n = useT(nf);
  const hint = suggestFor(pathname);
  if (!hint) return null;
  if (hint.kind === 'route') {
    return (
      <div
        data-testid="not-found-suggest"
        data-nf-suggest=""
        className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-surface-1 px-6 py-5"
      >
        <p className="text-lead">{n('didYouMean')}</p>
        <NavLink href={hint.path} prefetch={false} className={buttonClass({ variant: 'primary', size: 'lg' })}>
          <span className="voice-ledger">{hint.path}</span>
        </NavLink>
      </div>
    );
  }
  return (
    <div
      data-testid="not-found-vault"
      data-nf-suggest=""
      className="flex max-w-full flex-col items-center gap-3 rounded-2xl border border-line bg-surface-1 px-6 py-5"
    >
      <p>{n('looksLikeVault')}</p>
      <p translate="no" className="voice-ledger max-w-full text-small wrap-anywhere">
        {hint.address}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <NavLink href={vaultHref(hint.address)} prefetch={false} className={buttonClass({ variant: 'primary' })}>
          {n('openVault')}
        </NavLink>
        <NavLink href={verifyHref(hint.address)} prefetch={false} className={buttonClass({ variant: 'secondary' })}>
          {n('verifyVault')}
        </NavLink>
      </div>
    </div>
  );
}
