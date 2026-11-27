import type { PolicyVerification } from '@atropyle/sdk';
import { useState } from 'preact/hooks';
import type { Sdk } from '../lib/sdk';
import { runProof } from '../lib/verify-client';
import { proofSummary } from '../lib/verify-view';
import { useApp, useT } from '../ui/app-context';
import { AddressText, Banner, ErrorBox, UntrustedText } from '../ui/components';
import { messages } from './verify.messages';

export function ProofResult({ sdk, result }: { sdk: Sdk; result: PolicyVerification }) {
  const t = useT(messages);
  const { env } = useApp();
  const s = proofSummary(result);
  const explorer = sdk.deployment.explorerUrl;
  return (
    <div class="card stack" data-testid="proof-result" data-ok={String(s.ok)}>
      <p>
        <span class={s.ok ? 'badge badge-ok' : 'badge badge-bad'}>{s.ok ? t('pass') : t('fail')}</span>
      </p>
      <p>{t('combos', { n: s.combos.toLocaleString('en-US'), s: s.seconds, block: s.blockNumber })}</p>
      <p>{t('rpcs', { n: s.rpcs })}</p>
      {s.rpcs < 2 ? (
        <Banner kind="warn" testid="proof-single-rpc">
          {t(env.target === 'deweb' ? 'singleRpc' : 'singleRpcPages')}
        </Banner>
      ) : null}
      <div class="table-wrap">
        <table class="table">
          <tbody>
            {s.properties.map((p) => (
              <tr key={p.name} data-testid={`proof-prop-${p.name}`} data-ok={String(p.ok)}>
                <td class="mono">{p.name}</td>
                <td>{t(p.name)}</td>
                <td>
                  {p.ok ? (
                    <span class="badge badge-ok">{t('statePass')}</span>
                  ) : (
                    <span class="badge badge-bad">{t('violations', { n: p.violations })}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.issues.map((i) => (
        <Banner kind="error" key={i}>
          <UntrustedText value={i} max={300} />
        </Banner>
      ))}
      <h3>{t('netlists')}</h3>
      <p>
        {t('cpu')}: <AddressText address={result.cpu} explorer={explorer} />
      </p>
      <ul>
        {result.netlists.map((n) => (
          <li key={String(n.id)} class="mono wrap-anywhere">
            #{String(n.id)} {n.role} {t('gates', { n: n.gates })} {n.keccak}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProofPage({ sdk }: { sdk: Sdk }) {
  const t = useT(messages);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [result, setResult] = useState<PolicyVerification | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(await runProof(sdk, { onProgress: (d, total) => setProgress([d, total]) }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="stack">
      <h1>{t('proofTitle')}</h1>
      <p>{t('proofIntro')}</p>
      <button type="button" class="btn btn-primary btn-big" data-testid="proof-run" disabled={busy} onClick={run}>
        {t('run')}
      </button>
      {busy && progress ? (
        <div>
          <progress data-testid="proof-progress" max={progress[1]} value={progress[0]} />
          <p class="muted">{t('running', { done: progress[0], total: progress[1] })}</p>
        </div>
      ) : null}
      {error ? <ErrorBox error={error} onRetry={run} /> : null}
      {result ? <ProofResult sdk={sdk} result={result} /> : null}
    </section>
  );
}
