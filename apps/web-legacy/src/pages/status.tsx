import { formatDuration, type IntegrityReport } from '@atropyle/sdk';
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { formatUnits, isAddress } from 'viem';
import { buildDiagnostics, probeAll, type RpcProbe, rpcBlockNumber, rpcUrlsOf } from '../lib/diagnostics';
import { type FetchFn, fetchHealth, type Health } from '../lib/health';
import type { Sdk } from '../lib/sdk';
import { uniqueWarnings, warningKey } from '../lib/tx-view';
import { useApp, useT } from '../ui/app-context';
import { ChainCountersCard, type CountersLoad } from '../ui/chain-counters';
import { messages as common } from '../ui/common.messages';
import { AddressText, Banner, CopyButton, ErrorBox, UntrustedText } from '../ui/components';
import { type AsyncState, useAsync } from '../ui/use-async';
import { messages } from './status.messages';

const INTEGRITY_KEY = { pass: 'pass', fail: 'fail', unknown: 'unknownResult' } as const;

function AsyncView<T>(props: { state: AsyncState<T> & { reload(): void }; children: (value: T) => ComponentChildren }) {
  const c = useT(common);
  const s = props.state;
  if (s.status === 'loading') return <p class="muted">{c('loading')}</p>;
  if (s.status === 'error') return <ErrorBox error={s.error} onRetry={s.reload} />;
  return <>{props.children(s.value)}</>;
}

function Verdict({ ok }: { ok: boolean }) {
  const t = useT(messages);
  return ok ? <span class="badge badge-ok">{t('pass')}</span> : <span class="badge badge-bad">{t('fail')}</span>;
}

function IntegrityView({ report }: { report: IntegrityReport }) {
  const t = useT(messages);
  return (
    <div class="stack" data-testid="status-integrity" data-ok={String(report.ok)}>
      <p>
        <Verdict ok={report.ok} /> {t('integrityAt', { block: report.blockNumber.toString(), rpcs: report.rpcs })}
      </p>
      {uniqueWarnings([report.warnings]).map((w) => (
        <Banner kind="warn" key={warningKey(w)} testid={`status-warning-${w.code}`}>
          {w.message}
        </Banner>
      ))}
      <table class="table">
        <thead>
          <tr>
            <th>{t('colCheck')}</th>
            <th>{t('colResult')}</th>
            <th>{t('colExpected')}</th>
            <th>{t('colActual')}</th>
          </tr>
        </thead>
        <tbody>
          {report.checks.map((x) => (
            <tr key={x.name} data-ok={String(x.ok)}>
              <td class="mono">{x.name}</td>
              <td>
                <Verdict ok={x.ok} />
              </td>
              <td class="mono">{x.expected === undefined ? '' : <UntrustedText value={x.expected} max={80} />}</td>
              <td class="mono">{x.actual === undefined ? '' : <UntrustedText value={x.actual} max={80} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProbeTable({ probes }: { probes: readonly RpcProbe[] }) {
  const t = useT(messages);
  return (
    <table class="table" data-testid="status-rpcs">
      <thead>
        <tr>
          <th>{t('colRpc')}</th>
          <th>{t('colResult')}</th>
          <th>{t('colBlock')}</th>
          <th>{t('colMs')}</th>
        </tr>
      </thead>
      <tbody>
        {probes.map((p, i) => (
          <tr key={p.url} data-testid={`status-rpc-${i}`} data-ok={String(p.ok)}>
            <td class="mono">{p.url}</td>
            <td>
              {p.ok ? (
                <span class="badge badge-ok">{t('reachable')}</span>
              ) : (
                <span class="badge badge-bad">{p.error}</span>
              )}
            </td>
            <td class="mono">{p.block === null ? '' : p.block.toString()}</td>
            <td class="mono">{p.ms ?? ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CrossCheck({ sdk }: { sdk: Sdk }) {
  const app = useApp();
  const t = useT(messages);
  return (
    <section class="card stack">
      <h2>{t('crossTitle')}</h2>
      <label class="row">
        <input
          type="checkbox"
          data-testid="status-crosscheck"
          checked={app.crossCheck}
          onChange={(e) => app.setCrossCheck((e.target as HTMLInputElement).checked)}
        />
        <span>{t('crossLabel')}</span>
      </label>
      <Banner kind="warn" testid="status-crosscheck-warning">
        {t('crossWarning')}
      </Banner>
      {sdk.rpc.offchain.length > 0 ? (
        <div data-testid="status-offchain">
          <p>{t('offchainList')}</p>
          <ul>
            {sdk.rpc.offchain.map((u) => (
              <li key={u} class="mono">
                {u}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function HealthView({ health }: { health: Health }) {
  const t = useT(messages);
  const k = health.keeper;
  return (
    <div class="stack" data-testid="status-worker" data-status={health.status}>
      <p>
        {health.status === 'ok' ? (
          <span class="badge badge-ok">{t('workerOk')}</span>
        ) : (
          <span class="badge badge-warn">{t('workerDegraded')}</span>
        )}
      </p>
      <ul>
        <li data-testid="status-worker-integrity" data-value={health.integrity}>
          {t('workerIntegrity', { result: t(INTEGRITY_KEY[health.integrity]) })}
        </li>
        <li>
          {health.lastCronAgeSec === null
            ? t('cronNever')
            : t('cronAge', { age: formatDuration(Math.max(0, Math.round(health.lastCronAgeSec))) })}
        </li>
        <li>{health.cursorLagBlocks === null ? t('lagUnknown') : t('lag', { blocks: health.cursorLagBlocks })}</li>
        <li data-testid="status-worker-keeper" data-dry-run={String(k.dryRun)}>
          {k.dryRun ? t('keeperDryRun') : t('keeperOn')}{' '}
          {k.address && isAddress(k.address, { strict: false }) ? <AddressText address={k.address} /> : null}{' '}
          {k.balance && /^\d+$/.test(k.balance)
            ? t('keeperBalance', { okb: formatUnits(BigInt(k.balance), 18) })
            : null}
        </li>
      </ul>
      <table class="table">
        <thead>
          <tr>
            <th>{t('colRpc')}</th>
            <th>{t('colResult')}</th>
            <th>{t('colMs')}</th>
          </tr>
        </thead>
        <tbody>
          {health.rpcs.map((r) => (
            <tr key={r.url} data-ok={String(r.ok)}>
              <td>
                <UntrustedText value={r.url} max={80} />
              </td>
              <td>
                <Verdict ok={r.ok} />
              </td>
              <td class="mono">{r.ms ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Spec section 14. `probe`, `fetchFn` and `counters` are seams for unit tests; the app uses the defaults. */
export function StatusPage(props: {
  sdk: Sdk;
  probe?: (url: string) => Promise<bigint>;
  fetchFn?: FetchFn;
  counters?: CountersLoad;
}) {
  const { sdk } = props;
  const app = useApp();
  const t = useT(messages);
  const probe = props.probe ?? rpcBlockNumber;
  const integrity = useAsync(() => sdk.atro.integrity(), [sdk]);
  const probes = useAsync(() => probeAll(rpcUrlsOf(sdk.rpc), probe), [sdk]);
  // The DeWEB build has no Worker URL; the check on target is a second guard.
  const worker = app.env.target === 'pages' ? app.env.workerUrl : null;
  const health = useAsync(() => (worker ? fetchHealth(worker, props.fetchFn) : Promise.resolve(null)), [worker]);

  const { wallets, findWallets } = app;
  useEffect(() => {
    if (wallets === null) findWallets().catch(() => undefined);
  }, []);

  const walletNames = (wallets ?? []).map((w) => w.name);
  const text = buildDiagnostics({
    appVersion: app.env.version,
    target: app.env.target,
    href: location.href,
    chainId: sdk.deployment.chainId,
    integrity: integrity.status === 'ok' ? integrity.value : null,
    integrityError: integrity.status === 'error' ? integrity.error : null,
    probes: probes.status === 'ok' ? probes.value : null,
    wallets: walletNames,
    crossCheck: app.crossCheck,
    lang: app.lang,
  });

  let workerBody: ComponentChildren;
  if (app.env.target === 'deweb') {
    workerBody = <p data-testid="status-worker-off">{t('workerOff')}</p>;
  } else if (!worker) {
    workerBody = (
      <p class="muted" data-testid="status-worker-none">
        {t('workerNone')}
      </p>
    );
  } else {
    workerBody = <AsyncView state={health}>{(h) => (h ? <HealthView health={h} /> : null)}</AsyncView>;
  }

  return (
    <div class="stack" data-testid="status">
      <h1>{t('title')}</h1>
      <p class="muted">{t('intro')}</p>
      <section class="card stack">
        <h2>{t('integrityTitle')}</h2>
        <AsyncView state={integrity}>{(r) => <IntegrityView report={r} />}</AsyncView>
      </section>
      <ChainCountersCard sdk={sdk} detail load={props.counters} />
      <section class="card stack">
        <h2>{t('rpcTitle')}</h2>
        <AsyncView state={probes}>{(list) => <ProbeTable probes={list} />}</AsyncView>
        <button
          type="button"
          class="btn"
          data-testid="status-recheck"
          onClick={() => {
            integrity.reload();
            probes.reload();
          }}
        >
          {t('recheck')}
        </button>
      </section>
      {app.env.target === 'deweb' ? <CrossCheck sdk={sdk} /> : null}
      <section class="card stack">
        <h2>{t('workerTitle')}</h2>
        {workerBody}
      </section>
      <section class="card stack">
        <h2>{t('diagTitle')}</h2>
        <p class="muted">{t('diagHelp')}</p>
        <p data-testid="status-wallets">
          {t('walletsSeen')}{' '}
          {walletNames.length === 0
            ? t('walletsNone')
            : walletNames.map((n, i) => (
                <span key={`${i}:${n}`}>
                  {i > 0 ? ', ' : null}
                  <UntrustedText value={n} max={32} />
                </span>
              ))}
        </p>
        <CopyButton text={text} label={t('copy')} testid="status-copy" />
        <details>
          <summary>{t('diagShow')}</summary>
          <pre class="code" data-testid="status-diagnostics">
            {text}
          </pre>
        </details>
      </section>
    </div>
  );
}
