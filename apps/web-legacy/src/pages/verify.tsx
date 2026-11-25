import { useState } from 'preact/hooks';
import type { Address } from 'viem';
import { href } from '../lib/route';
import type { Sdk } from '../lib/sdk';
import { runVaultVerify } from '../lib/verify-client';
import { type RowId, type RowState, vaultVerifyRows } from '../lib/verify-view';
import { useT } from '../ui/app-context';
import { AddressText, Banner, ErrorBox, UntrustedText } from '../ui/components';
import { useAsync } from '../ui/use-async';
import { ProofResult } from './proof';
import { messages } from './verify.messages';

const STATE = {
  pass: 'statePass',
  fail: 'stateFail',
  unknown: 'stateUnknown',
} as const satisfies Record<RowState, string>;
const BADGE = { pass: 'badge badge-ok', fail: 'badge badge-bad', unknown: 'badge badge-warn' } as const;
const ROW = {
  factory: 'rowfactory',
  proxy: 'rowproxy',
  binding: 'rowbinding',
  code: 'rowcode',
  policy: 'rowpolicy',
  operators: 'rowoperators',
} as const satisfies Record<RowId, string>;

export function VerifyPage({ sdk, vault }: { sdk: Sdk; vault: Address }) {
  const t = useT(messages);
  const [progress, setProgress] = useState<[number, number] | null>(null);
  // The cheap rows appear first; the second run adds the policy proof (cached by `runProof`).
  const quick = useAsync(() => runVaultVerify(sdk, vault, { policy: false }), [sdk, vault]);
  const full = useAsync(
    async () =>
      quick.status === 'ok'
        ? runVaultVerify(sdk, vault, { policy: true, onProgress: (d, total) => setProgress([d, total]) })
        : null,
    [sdk, vault, quick.status],
  );

  if (quick.status === 'loading') return <p>{t('verifyIntro')}</p>;
  if (quick.status === 'error') return <ErrorBox error={quick.error} onRetry={quick.reload} />;
  const v = full.status === 'ok' && full.value ? full.value : quick.value;
  const rows = vaultVerifyRows(v);
  // The cheap pass marks the policy row unknown; do not call that a failure while the proof is still running. A row
  // that already failed is a failure whatever the proof says, so it is reported at once.
  const failed = rows.some((r) => r.state === 'fail');
  const running = full.status === 'loading' || (full.status === 'ok' && full.value === null);
  const pending = !failed && running;
  const allPass = rows.every((r) => r.state === 'pass');
  const explorer = sdk.deployment.explorerUrl;

  return (
    <section class="stack">
      <h1>{t('verifyTitle')}</h1>
      <p>
        <AddressText address={vault} explorer={explorer} />
      </p>
      <p class="muted">
        {t('verifyIntro')} {t('atBlock', { block: v.blockNumber })}
      </p>
      <div data-testid="verify-overall" data-ok={pending ? 'pending' : String(allPass)}>
        {pending ? (
          <Banner kind="info">{t('checkingPolicy')}</Banner>
        ) : (
          <Banner kind={allPass ? 'info' : 'warn'}>{allPass ? t('overallOk') : t('overallNo')}</Banner>
        )}
      </div>
      <table class="table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-testid={`verify-row-${r.id}`} data-state={r.state}>
              <td>{t(ROW[r.id])}</td>
              <td>
                <span class={BADGE[r.state]}>{t(STATE[r.state])}</span>
              </td>
              <td class="mono">{r.detail ? <UntrustedText value={r.detail} max={160} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {running && progress ? (
        <div>
          <progress data-testid="verify-progress" max={progress[1]} value={progress[0]} />
          <p class="muted">{t('running', { done: progress[0], total: progress[1] })}</p>
        </div>
      ) : null}
      {full.status === 'error' ? <ErrorBox error={full.error} onRetry={full.reload} /> : null}
      {v.policy.status === 'unavailable' ? <ErrorBox error={v.policy.error} /> : null}
      {v.policy.status === 'verified' ? <ProofResult sdk={sdk} result={v.policy.result} /> : null}
      <a href={href({ name: 'vault', vault })}>{t('openVault')}</a>
    </section>
  );
}
