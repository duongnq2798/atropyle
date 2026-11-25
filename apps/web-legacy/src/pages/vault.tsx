import { formatDuration, type TimelineEventKind, type VaultSnapshot } from '@atropyle/sdk';
import type { Address } from 'viem';
import { chainNow, formatBps, formatRemaining, formatTimestamp } from '../lib/format';
import { href } from '../lib/route';
import type { Sdk } from '../lib/sdk';
import { type VaultView, vaultView } from '../lib/vault-view';
import { useApp, useT } from '../ui/app-context';
import { messages as common } from '../ui/common.messages';
import { AddressText, Banner, ErrorBox, TokenAmount, UntrustedText } from '../ui/components';
import { messages as labels, ROLE_KEY, STATE_KEY } from '../ui/labels.messages';
import { GuardianPanel } from './guardian-panel';
import { HeirPanel } from './heir-panel';
import { OwnerPanel } from './owner-panel';
import { messages } from './vault.messages';
import { useNowMs, useVault } from './vault-hooks';

type VaultKey = keyof typeof messages.en;

const EVENT_KEY = {
  alarm: 'nextAlarm',
  release: 'nextRelease',
  drillExpiry: 'nextDrillExpiry',
} as const satisfies Record<TimelineEventKind, VaultKey>;

function StatusCard(props: {
  sdk: Sdk;
  snap: VaultSnapshot;
  view: VaultView;
  fetchedAtMs: number;
  busy: boolean;
  onRefresh: () => void;
}) {
  const { sdk, snap, view, fetchedAtMs, busy, onRefresh } = props;
  // The clock lives here so only this card re-renders every second.
  const now = chainNow(snap.status.blockTimestamp, fetchedAtMs, useNowMs(1000));
  const t = useT(messages);
  const l = useT(labels);
  const c = snap.config;
  const explorer = sdk.deployment.explorerUrl;
  const due = view.next ? formatRemaining(view.next.at, now) : null;
  const owner = view.roles.includes('owner');
  const target = view.state === 'recovery' ? snap.status.recoveryTarget : null;
  const windowEnd = snap.status.windowEndsAt;
  const left = windowEnd === null ? null : formatRemaining(windowEnd, now);
  return (
    <section class="card stack" data-testid="vault-status">
      <h1>
        {t('title')} {view.drill ? <span class="badge badge-warn">{l('drill')}</span> : null}
      </h1>
      <AddressText address={view.vault} explorer={explorer} />
      <p>
        {t('state')}:{' '}
        <strong data-testid="vault-state" data-state={view.state}>
          {l(STATE_KEY[view.state])}
        </strong>
      </p>
      {view.expired ? (
        <Banner kind="warn" testid="vault-expired">
          {t('expired')}
        </Banner>
      ) : null}
      {target ? (
        // Every viewer sees it: heirs, guardians and strangers can warn the owner, who alone can stop it.
        <Banner kind="warn" testid="vault-recovery">
          <strong>{t('recoveryPending')}</strong> <AddressText address={target} explorer={explorer} />
          {left ? (
            <p>
              {left.past
                ? t('recoveryEnded', { time: left.text })
                : `${t('recoveryLeft', { time: left.text })} ${t(owner ? 'recoveryStopOwner' : 'recoveryStopOther')}`}
            </p>
          ) : null}
        </Banner>
      ) : null}
      <p>
        {t('owner')}: <AddressText address={view.owner} explorer={explorer} />
      </p>
      <p data-testid="vault-last-alive" data-ts={String(view.lastAlive)}>
        {t('lastAlive')}: {formatTimestamp(view.lastAlive)}
      </p>
      {view.next && due ? (
        <p data-testid="vault-next" data-kind={view.next.kind}>
          <strong>{t(EVENT_KEY[view.next.kind])}</strong>{' '}
          {due.past ? t('dueSince', { time: due.text }) : t('dueIn', { time: due.text })} (
          {formatTimestamp(view.next.at)})
          <br />
          <span class="muted">{view.next.note}</span>
        </p>
      ) : null}
      <h3>{t('heirs')}</h3>
      <ul>
        {c.heirs.map((h) => (
          <li key={h.account}>
            <AddressText address={h.account} /> {formatBps(h.bps)}
          </li>
        ))}
      </ul>
      <h3>{t('guardians')}</h3>
      {c.guardians.length === 0 ? (
        <p class="muted">{t('guardiansNone')}</p>
      ) : (
        <>
          <ul>
            {c.guardians.map((g) => (
              <li key={g}>
                <AddressText address={g} />
              </li>
            ))}
          </ul>
          <p class="muted">
            {t('guardiansK', { k: c.k, n: c.guardians.length })}{' '}
            {c.recoveryEnabled ? t(owner ? 'recoveryOnOwner' : 'recoveryOnOther', { k: c.k }) : null}
          </p>
        </>
      )}
      <h3>{t('timing')}</h3>
      <p>
        {t('timingLine', {
          period: formatDuration(c.timing.period),
          threshold: c.timing.threshold,
          window: formatDuration(c.timing.window),
        })}
      </p>
      <p class="row muted">
        <span>{t('asOf', { block: view.blockNumber })}</span>
        <button type="button" class="btn" data-testid="vault-refresh" disabled={busy} onClick={onRefresh}>
          {t('refresh')}
        </button>
        <a href={href({ name: 'verify', vault: view.vault })}>{t('verify')}</a>
      </p>
    </section>
  );
}

function AssetsCard({ view, explorer }: { view: VaultView; explorer: string | null }) {
  const t = useT(messages);
  const c = useT(common);
  return (
    <section class="card stack" data-testid="vault-assets">
      <h2>{t('assets')}</h2>
      {view.lowCoverage.length > 0 ? (
        <Banner kind="warn" testid="coverage-low">
          {t('coverageLow')}
        </Banner>
      ) : null}
      {view.assets.length === 0 ? (
        <p class="muted">{t('noAssets')}</p>
      ) : (
        <table class="table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('colAsset')}</th>
              <th>{t('colHeld')}</th>
              <th>{t('colCoverage')}</th>
            </tr>
          </thead>
          <tbody>
            {view.assets.map((a) => (
              <tr
                key={a.index}
                data-testid={`asset-${a.index}`}
                data-coverage={a.percent === null ? '' : String(a.percent)}
              >
                <td>{a.index + 1}</td>
                <td class="stack">
                  <span data-testid={`asset-${a.index}-name`}>
                    <UntrustedText value={a.info.name} max={32} />
                  </span>
                  <span data-testid={`asset-${a.index}-symbol`}>
                    <UntrustedText value={a.info.symbol} max={16} />
                  </span>
                  <AddressText address={a.token} explorer={explorer} />
                  {a.kind !== 'erc20' ? <span class="muted">{t('nftId', { id: a.id })}</span> : null}
                  {a.recipient ? (
                    <span data-testid={`asset-${a.index}-heir`}>
                      {t('goesTo')} <AddressText address={a.recipient} />
                    </span>
                  ) : null}
                </td>
                <td>
                  {a.kind === 'erc20' ? (
                    <TokenAmount raw={a.held} token={a.info} />
                  ) : (
                    <span class="mono">{a.held.toString()}</span>
                  )}
                </td>
                <td>
                  {a.percent === null ? (
                    <span class="badge">{t('notHeld')}</span>
                  ) : (
                    <span class={a.percent === 100 ? 'badge badge-ok' : 'badge badge-warn'}>{a.percent}%</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class="muted">{c('untrustedNote')}</p>
    </section>
  );
}

export function VaultPage({ sdk, vault }: { sdk: Sdk; vault: Address }) {
  const app = useApp();
  const t = useT(messages);
  const c = useT(common);
  const l = useT(labels);
  const { data, error, busy, reload } = useVault(sdk, vault);
  if (!data) return error ? <ErrorBox error={error} onRetry={reload} /> : <p class="muted">{c('loading')}</p>;

  // Any contract can answer like a vault and name the real factory: nothing it says is shown, and nothing is offered.
  if (!data.registered) {
    return (
      <div class="stack" data-testid="vault">
        <h1>{t('title')}</h1>
        <AddressText address={vault} explorer={sdk.deployment.explorerUrl} />
        <Banner kind="error" testid="vault-not-registered">
          <strong>{t('notRegistered')}</strong>
          <p>{t('notRegisteredHelp')}</p>
        </Banner>
      </div>
    );
  }

  const account = app.wallet?.account ?? null;
  const view = vaultView(data.snap, data.timeline, account);
  return (
    <div class="stack" data-testid="vault">
      {error ? <ErrorBox error={error} onRetry={reload} /> : null}
      <StatusCard
        sdk={sdk}
        snap={data.snap}
        view={view}
        fetchedAtMs={data.fetchedAtMs}
        busy={busy}
        onRefresh={reload}
      />
      {account ? (
        <p data-testid="vault-roles">
          {view.roles.length > 0
            ? t('roles', { roles: view.roles.map((r) => l(ROLE_KEY[r])).join(', ') })
            : t('noRole')}
        </p>
      ) : (
        <p class="muted">{t('connectHint')}</p>
      )}
      {account && view.roles.includes('owner') ? (
        <OwnerPanel sdk={sdk} snap={data.snap} view={view} account={account} onChanged={reload} />
      ) : null}
      {account && view.roles.includes('guardian') ? (
        <GuardianPanel sdk={sdk} snap={data.snap} view={view} account={account} onChanged={reload} />
      ) : null}
      {/* Spec §16.4: anyone can poke or distribute; the owner keeps only Check in. */}
      {account && !view.roles.includes('owner') ? (
        <HeirPanel
          sdk={sdk}
          view={view}
          recoveryTarget={data.snap.status.recoveryTarget}
          account={account}
          onChanged={reload}
        />
      ) : null}
      <AssetsCard view={view} explorer={sdk.deployment.explorerUrl} />
    </div>
  );
}
