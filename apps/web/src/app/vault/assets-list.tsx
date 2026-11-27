'use client';

import type { VaultView } from '@/flows/impl/vault-view';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages } from '@/messages/vault.messages';
import { Address } from '@/ui/address';
import { Amount } from '@/ui/amount';
import { Banner } from '@/ui/banner';
import { UntrustedText } from '@/ui/untrusted-text';

function Coverage({ percent }: { percent: number | null }) {
  const t = useT(messages);
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2.5 py-0.5 font-mono text-caption text-ink tabular-nums',
        percent === null ? 'bg-surface-2' : percent === 100 ? 'bg-alive/15' : 'bg-grace/20',
      )}
    >
      {percent === null ? t('notHeld') : `${percent}%`}
    </span>
  );
}

/** Each asset, what the owner holds, and how much of it the vault can move (allowance coverage). */
export function AssetsList({ view, explorer }: { view: VaultView; explorer: string | null }) {
  const t = useT(messages);
  return (
    <section aria-labelledby="vault-assets-title" data-testid="vault-assets" className="flex flex-col gap-4">
      <h2 id="vault-assets-title" className="text-title text-ink">
        {t('assets')}
      </h2>
      {view.lowCoverage.length > 0 ? (
        <Banner tone="warn" testId="coverage-low">
          {t('coverageLow')}
        </Banner>
      ) : null}
      {view.assets.length === 0 ? (
        <p className="text-body text-ink-muted">{t('noAssets')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface-1">
          {view.assets.map((a) => (
            <li
              key={a.index}
              data-testid={`asset-${a.index}`}
              data-coverage={a.percent === null ? '' : String(a.percent)}
              className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-6"
            >
              <div className="col-span-2 flex min-w-0 flex-col items-start gap-1 sm:col-span-1">
                {/* Chain text in the Ledger voice (§18.2 rule 7): the name is not the product speaking. */}
                <p className="voice-ledger text-body text-ink break-words">
                  <span data-testid={`asset-${a.index}-name`}>
                    <UntrustedText value={a.info.name} max={32} />
                  </span>{' '}
                  <span data-testid={`asset-${a.index}-symbol`} className="text-ink-muted">
                    <UntrustedText value={a.info.symbol} max={16} />
                  </span>
                </p>
                <Address address={a.token} explorer={explorer} size="sm" className="self-start" />
                {a.kind !== 'erc20' ? (
                  <p className="voice-ledger text-caption text-ink-muted">{t('nftId', { id: a.id })}</p>
                ) : null}
                {a.recipient ? (
                  <p
                    data-testid={`asset-${a.index}-heir`}
                    className="flex flex-wrap items-center gap-2 text-caption text-ink-muted"
                  >
                    {t('goesTo')} <Address address={a.recipient} size="sm" />
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <p className="text-caption text-ink-muted">{t('colHeld')}</p>
                {a.kind === 'erc20' ? (
                  // The first Amount of a page that a phone reads: the base-unit value is a tap away (C4).
                  <Amount raw={a.held} decimals={a.info.decimals} symbol={a.info.symbol} className="voice-ledger" />
                ) : (
                  <span className="voice-ledger text-ink tabular-nums">{a.held.toString()}</span>
                )}
              </div>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                <p className="text-caption text-ink-muted">{t('colCoverage')}</p>
                <Coverage percent={a.percent} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-ink-muted">{t('untrustedNote')}</p>
    </section>
  );
}
