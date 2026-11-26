import { useState } from 'preact/hooks';
import type { Sdk } from '../lib/sdk';
import { type CachedStats, loadStats, type StatTileId, saveStats, statsTiles } from '../lib/stats-view';
import { useApp, useT } from './app-context';
import { ErrorBox } from './components';
import { messages } from './stats-panel.messages';

type StatsKey = keyof typeof messages.en;

const TILE = {
  vaults: 'tileVaults',
  paid: 'tilePaid',
  drill: 'tileDrill',
  owners: 'tileOwners',
  checkIns: 'tileCheckIns',
  alarms: 'tileAlarms',
  releases: 'tileReleases',
  distributions: 'tileDistributions',
} as const satisfies Record<StatTileId, StatsKey>;

/**
 * The full count from factory and vault events, cached on this device. It reads the chain only when the button is
 * pressed (plan decision 17); the cached counts show without a request. The chain counters card reads the vaults this
 * count found too, so its released vaults and stablecoins can be exact.
 */
export function StatsPanel({ sdk }: { sdk: Sdk }) {
  const app = useApp();
  const t = useT(messages);
  const d = sdk.deployment;
  const [cached, setCached] = useState<CachedStats | null>(() => loadStats(app.kv, d.chainId, d.factory));
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<unknown>(null);

  const run = async () => {
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      const s = await sdk.atro.stats({
        resume: cached?.cursor,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setCached(saveStats(app.kv, d.chainId, d.factory, s, Date.now()));
    } catch (e) {
      setError(e);
    } finally {
      setProgress(null);
    }
  };

  return (
    <section class="card stack" data-testid="stats">
      <h2>{t('title')}</h2>
      {cached ? (
        <>
          <div class="tiles">
            {statsTiles(cached.stats).map((tile) => (
              <div key={tile.id} class="tile" data-testid={`stat-${tile.id}`} data-value={tile.value}>
                <strong class="tile-value">{tile.value}</strong>
                <span class="tile-label muted">{t(TILE[tile.id])}</span>
              </div>
            ))}
          </div>
          <p class="muted">{t('asOf', { block: cached.stats.toBlock })}</p>
        </>
      ) : (
        <p class="muted">{t('none')}</p>
      )}
      {progress ? (
        <progress data-testid="stats-progress" value={progress.done} max={progress.total || 1} />
      ) : (
        <button type="button" class="btn" data-testid="stats-load" onClick={run}>
          {cached ? t('update') : t('load')}
        </button>
      )}
      <p class="muted">{t('note')}</p>
      {error ? <ErrorBox error={error} onRetry={run} /> : null}
    </section>
  );
}
