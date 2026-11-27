'use client';

import type { TransferRow } from '@/flows/impl/heir';
import type { AssetView, VaultView } from '@/flows/impl/vault-view';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { explorerName, explorerTx } from '@/lib/links';
import { messages } from '@/messages/vault.messages';
import { Address } from '@/ui/address';
import { Amount } from '@/ui/amount';
import { ExternalLink } from '@/ui/external-link';
import { UntrustedText } from '@/ui/untrusted-text';

/** ERC-20 amounts use the token decimals; ERC-721 shows the token id; anything else stays a raw number. */
function TransferAmount({ row, asset }: { row: TransferRow; asset: AssetView | undefined }) {
  const t = useT(messages);
  if (row.amount === null) return null;
  if (asset?.kind === 'erc20')
    return <Amount raw={row.amount} decimals={asset.info.decimals} symbol={asset.info.symbol} />;
  if (asset?.kind === 'erc721') return <span className="font-mono">{t('nftId', { id: row.amount })}</span>;
  return <span className="font-mono tabular-nums">{row.amount.toString()}</span>;
}

export function TransferTable({
  rows,
  view,
  explorer,
  testId,
}: {
  rows: readonly TransferRow[];
  view: VaultView;
  explorer: string | null;
  testId: string;
}) {
  const t = useT(messages);
  if (rows.length === 0) {
    return (
      <p data-testid={testId} className="text-small text-ink-muted">
        {t('noTransfers')}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <ul data-testid={testId} className="divide-y divide-line rounded-2xl border border-line bg-surface-1">
        {rows.map((r, i) => {
          const a = view.assets.find((x) => x.index === r.assetIndex);
          return (
            <li
              key={`${r.hash}-${r.logIndex}`}
              data-testid={`${testId}-${i}`}
              data-ok={String(r.ok)}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4"
            >
              <span className="voice-ledger min-w-16 text-body text-ink">
                {a ? <UntrustedText value={a.info.symbol} max={16} /> : `#${r.assetIndex + 1}`}
              </span>
              <Address address={r.to} size="sm" />
              <span className="ml-auto">
                <TransferAmount row={r} asset={a} />
              </span>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-caption text-ink',
                  r.ok ? 'bg-alive/15' : 'bg-danger/15',
                )}
              >
                {r.ok ? t('sent') : t('failed')}
              </span>
              {explorer ? (
                <ExternalLink href={explorerTx(explorer, r.hash)} variant="icon">
                  {t('viewTx', { name: explorerName(explorer) })}
                </ExternalLink>
              ) : null}
            </li>
          );
        })}
      </ul>
      {rows.some((r) => !r.ok) ? <p className="text-small text-ink-muted">{t('failedHelp')}</p> : null}
    </div>
  );
}
