import type { ChainCounters } from '@atropyle/sdk';
import { counterTiles, knownVaults } from '../lib/counters-view';
import { formatTimestamp } from '../lib/format';
import type { Sdk } from '../lib/sdk';
import { useApp, useT } from './app-context';
import { messages } from './chain-counters.messages';
import { useAsync } from './use-async';

export type CountersLoad = () => Promise<ChainCounters>;

/**
 * Vaults the card reads one by one, for released vaults and stablecoins (3 to 5 view calls each): as many as the SDK
 * default. Only the status page shows the card.
 */
export const STATUS_MAX_VAULTS = 200;

function Body({ c, detail, maxVaults }: { c: ChainCounters; detail: boolean; maxVaults: number }) {
  const t = useT(messages);
  // Fewer vaults read than exist: either this device knows too few vault addresses, or the page hit its cap.
  const partial = !c.complete && c.read < c.vaults.all;
  const capped = c.read >= maxVaults;
  return (
    <>
      <div class="tiles">
        {counterTiles(c).map((x) => (
          <div
            key={x.id}
            class="tile"
            data-testid={`counter-${x.id}`}
            data-value={x.rawAll}
            data-outside={x.rawOutsideTeam}
            data-lower-bound={String(x.lowerBound)}
          >
            <strong class="tile-value">{x.lowerBound ? t('atLeast', { n: x.all }) : x.all}</strong>
            <span class="tile-label">{t(x.id)}</span>
            <span class="tile-label muted">
              {t('outside', { n: x.lowerBound ? t('atLeast', { n: x.outsideTeam }) : x.outsideTeam })}
            </span>
          </div>
        ))}
      </div>
      <p class="muted" data-testid="counters-as-of" data-block={c.blockNumber.toString()}>
        {t('asOf', { block: c.blockNumber.toString(), time: formatTimestamp(c.blockTimestamp) })}
      </p>
      {partial ? (
        <p class="muted" data-testid="counters-partial" data-capped={String(capped)}>
          {capped
            ? t('partialCap', { read: c.read, all: c.vaults.all, max: maxVaults })
            : t('partial', { read: c.read, all: c.vaults.all })}
        </p>
      ) : null}
      {c.teamComplete ? null : (
        <p class="muted" data-testid="counters-team-partial">
          {t('teamPartial')}
        </p>
      )}
      {detail ? (
        <details data-testid="counters-definitions">
          <summary>{t('defTitle')}</summary>
          <ul>
            <li>{t('defVaults')}</li>
            <li>{t('defPaid')}</li>
            <li>{t('defReleases')}</li>
            <li>{t('defStablecoins')}</li>
            <li>{t('defTeam', { n: c.team.length })}</li>
          </ul>
        </details>
      ) : null}
    </>
  );
}

/**
 * A few view calls at one block (no event scan), so the page reads them on load. A failing RPC leaves one quiet line
 * with a retry, never an error page. `load` is a seam for unit tests.
 */
export function ChainCountersCard(props: { sdk: Sdk; detail?: boolean; maxVaults?: number; load?: CountersLoad }) {
  const { sdk } = props;
  const maxVaults = props.maxVaults ?? STATUS_MAX_VAULTS;
  const app = useApp();
  const t = useT(messages);
  const state = useAsync(
    () => (props.load ? props.load() : sdk.atro.counters({ vaults: knownVaults(app.kv, sdk.deployment), maxVaults })),
    [sdk, maxVaults],
  );
  return (
    <section class="card stack" data-testid="counters" data-status={state.status}>
      <h2>{t('title')}</h2>
      {state.status === 'loading' ? <p class="muted">{t('loading')}</p> : null}
      {state.status === 'error' ? (
        <p class="row muted" data-testid="counters-error">
          <span>{t('failed')}</span>
          <button type="button" class="btn" data-testid="counters-retry" onClick={state.reload}>
            {t('retry')}
          </button>
        </p>
      ) : null}
      {state.status === 'ok' ? <Body c={state.value} detail={props.detail === true} maxVaults={maxVaults} /> : null}
    </section>
  );
}
