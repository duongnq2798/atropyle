'use client';

import { type ComponentType, lazy, Suspense } from 'react';
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
 * lets globals.css step the home button back, and `data-nf-vault` lets it cut the raw path above to one line: the
 * card shows the address in full, in groups of four (spec §4.2).
 */

type AddressProps = { address: string; copy: boolean; avatar: boolean; size: 'sm'; className: string };
/** If the chunk fails to load, the address in plain text: still whole, never shortened. */
const PlainAddress: ComponentType<AddressProps> = ({ address }) => (
  <span translate="no" className="voice-ledger max-w-full text-small wrap-anywhere">
    {address}
  </span>
);
/**
 * Ruling T10-F5: the shared Address loads one step later, from this chunk. Imported directly, its modules changed how
 * the bundler splits the shell's first-load chunks: the same bytes, compressed 63 bytes worse, and `/` went over its
 * 200 kB. The vault card waits for it, so the card appears once, whole.
 */
const Address = lazy<ComponentType<AddressProps>>(() =>
  import('@/ui/address').then(
    (m) => ({ default: m.Address }),
    () => ({ default: PlainAddress }),
  ),
);

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
        <p className="text-balance text-lead">{n('didYouMean')}</p>
        <NavLink href={hint.path} prefetch={false} className={buttonClass({ variant: 'primary', size: 'lg' })}>
          <span className="voice-ledger">{hint.path}</span>
        </NavLink>
      </div>
    );
  }
  return (
    <Suspense fallback={null}>
      <div
        data-testid="not-found-vault"
        data-nf-suggest=""
        data-nf-vault=""
        className="flex max-w-full flex-col items-center gap-3 rounded-2xl border border-line bg-surface-1 px-6 py-5"
      >
        <p className="text-balance">{n('looksLikeVault')}</p>
        <Address address={hint.address} copy={false} avatar size="sm" className="self-center text-start" />
        <div className="flex flex-wrap justify-center gap-3">
          <NavLink href={vaultHref(hint.address)} prefetch={false} className={buttonClass({ variant: 'primary' })}>
            {n('openVault')}
          </NavLink>
          <NavLink href={verifyHref(hint.address)} prefetch={false} className={buttonClass({ variant: 'secondary' })}>
            {n('verifyVault')}
          </NavLink>
        </div>
      </div>
    </Suspense>
  );
}
