import { useEffect, useRef, useState } from 'preact/hooks';
import type { Address } from 'viem';
import { historyFromBlock, type TransferRow, transferRows } from '../lib/heir';
import { telegramLink } from '../lib/links';
import type { Sdk } from '../lib/sdk';
import type { AssetView, VaultView } from '../lib/vault-view';
import { ActionRunner } from '../ui/action-runner';
import { useApp, useT } from '../ui/app-context';
import { AddressText, ErrorBox, TokenAmount, UntrustedText } from '../ui/components';
import { messages } from './heir.messages';

/** ERC-20 amounts use the token decimals; ERC-721 shows the token id; anything else stays a raw number. */
function Amount({ row, asset }: { row: TransferRow; asset: AssetView | undefined }) {
  const t = useT(messages);
  if (row.amount === null) return null;
  if (asset?.kind === 'erc20') return <TokenAmount raw={row.amount} token={asset.info} />;
  if (asset?.kind === 'erc721') return <span class="mono">{t('nftId', { id: row.amount })}</span>;
  return <span class="mono">{row.amount.toString()}</span>;
}

function TransferTable({ rows, view, testid }: { rows: readonly TransferRow[]; view: VaultView; testid: string }) {
  const t = useT(messages);
  if (rows.length === 0) {
    return (
      <p class="muted" data-testid={testid}>
        {t('noTransfers')}
      </p>
    );
  }
  return (
    <>
      <table class="table" data-testid={testid}>
        <thead>
          <tr>
            <th>{t('colAsset')}</th>
            <th>{t('colTo')}</th>
            <th>{t('colAmount')}</th>
            <th>{t('colResult')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const a = view.assets.find((x) => x.index === r.assetIndex);
            return (
              <tr key={`${r.hash}-${r.logIndex}`} data-testid={`${testid}-${i}`} data-ok={String(r.ok)}>
                <td>{a ? <UntrustedText value={a.info.symbol} max={16} /> : `#${r.assetIndex + 1}`}</td>
                <td>
                  <AddressText address={r.to} />
                </td>
                <td>
                  <Amount row={r} asset={a} />
                </td>
                <td>
                  {r.ok ? (
                    <span class="badge badge-ok">{t('sent')}</span>
                  ) : (
                    <span class="badge badge-bad">{t('failed')}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.some((r) => !r.ok) ? <p class="muted">{t('failedHelp')}</p> : null}
    </>
  );
}

export function HeirPanel(props: {
  sdk: Sdk;
  view: VaultView;
  /** The wallet the guardians chose, from the snapshot; null when no recovery is pending or done. */
  recoveryTarget: Address | null;
  account: Address;
  onChanged: () => void;
}) {
  const { sdk, view, recoveryTarget, account, onChanged } = props;
  const app = useApp();
  const t = useT(messages);
  const [results, setResults] = useState<TransferRow[] | null>(null);
  const [history, setHistory] = useState<TransferRow[] | null>(null);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [pokeHeld, setPokeHeld] = useState(false);
  // The vault this panel shows now; null after unmount. A history response for another vault is dropped.
  const current = useRef<Address | null>(view.vault);
  useEffect(() => {
    current.current = view.vault;
    setHistory(null);
    setHistoryError(null);
    setHistoryBusy(false);
    return () => {
      current.current = null;
    };
  }, [view.vault]);
  const bot = app.env.telegramBot;
  const recoveryText =
    view.state === 'recovery' ? 'recoveryPending' : view.state === 'releasedRecover' ? 'releasedRecover' : null;

  // A bounded window: the SDK default (a day of blocks) is hundreds of eth_getLogs calls on a public node.
  const loadHistory = async () => {
    const vault = view.vault;
    setHistoryBusy(true);
    setHistoryError(null);
    try {
      const events = await sdk.atro
        .vault(vault)
        .events({ fromBlock: historyFromBlock(view.blockNumber, sdk.deployment.factoryBlock) });
      if (current.current === vault) setHistory(transferRows(events));
    } catch (e) {
      if (current.current === vault) setHistoryError(e);
    } finally {
      if (current.current === vault) setHistoryBusy(false);
    }
  };

  return (
    <section class="card stack" data-testid="heir-panel">
      <h2>{t('title')}</h2>
      {recoveryText && recoveryTarget ? (
        <p data-testid="heir-recovery">
          {t(recoveryText)} <AddressText address={recoveryTarget} />
        </p>
      ) : null}
      {(!view.released || pokeHeld) && !view.expired ? (
        <>
          <p class="muted">{t('pokeHelp')}</p>
          <ActionRunner
            sdk={sdk}
            vault={view.vault}
            action={{ type: 'poke' }}
            as={account}
            label={t('poke')}
            testid="heir-poke"
            onPlan={setPokeHeld}
            onDone={onChanged}
          />
        </>
      ) : null}
      {view.released && !view.expired ? (
        <>
          <p class="muted" data-testid="heir-claim-help">
            {view.state === 'releasedRecover' ? t('claimHelpRecover') : t('claimHelp')}
          </p>
          <ActionRunner
            sdk={sdk}
            vault={view.vault}
            action={{ type: 'distribute' }}
            as={account}
            label={t('claim')}
            testid="heir-claim"
            kind="big"
            onDone={(r) => {
              // Claim is one transaction, so even a resumed send carries all of its events.
              setResults(transferRows(r.steps.flatMap((s) => s.events)));
              onChanged();
            }}
          />
        </>
      ) : null}
      {results ? (
        <>
          <h3>{t('results')}</h3>
          <TransferTable rows={results} view={view} testid="heir-results" />
        </>
      ) : null}
      <p class="muted">{t('historyRange')}</p>
      <button type="button" class="btn" data-testid="heir-history" disabled={historyBusy} onClick={loadHistory}>
        {historyBusy ? t('historyBusy') : t('history')}
      </button>
      {history ? <TransferTable rows={history} view={view} testid="heir-history-list" /> : null}
      {historyError ? <ErrorBox error={historyError} onRetry={loadHistory} /> : null}
      {bot ? (
        <a class="btn" href={telegramLink(bot, view.vault, 'heir')} target="_blank" rel="noopener noreferrer">
          {t('telegram')}
        </a>
      ) : null}
    </section>
  );
}
