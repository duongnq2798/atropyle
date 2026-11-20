import { decodeError, GUARDIAN_WARNING, type SignPayload } from '@atropyle/sdk';
import { useMemo, useState } from 'preact/hooks';
import type { Hex } from 'viem';
import { explorerTx } from '../lib/links';
import type { Sdk } from '../lib/sdk';
import type { CallsStatus } from '../lib/send-calls';
import { type SignOutcome, sendSignRequest, signView } from '../lib/sign';
import { uniqueWarnings, warningKey } from '../lib/tx-view';
import { useApp, useT } from '../ui/app-context';
import { AddressText, Banner, ErrorBox } from '../ui/components';
import { useAsync } from '../ui/use-async';
import { useHash } from '../ui/use-hash';
import { messages } from './sign.messages';

function parse(sdk: Sdk, hash: string): { payload: SignPayload | null; error: unknown } {
  try {
    return { payload: sdk.atro.handoff.parse(hash), error: null };
  } catch (error) {
    return { payload: null, error };
  }
}

function outcomeHashes(o: SignOutcome): Hex[] {
  if (o.kind === 'sendCalls') return o.result.hashes;
  if (o.kind === 'sequential') return o.result.steps.map((s) => s.hash);
  return [];
}

export function SignPage({ sdk }: { sdk: Sdk }) {
  const app = useApp();
  const t = useT(messages);
  const hash = useHash();
  const parsed = useMemo(() => parse(sdk, hash), [sdk, hash]);
  const inspected = useAsync(
    async () => (parsed.payload ? sdk.atro.handoff.inspect(parsed.payload) : null),
    [sdk, parsed.payload],
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<CallsStatus | 'signing' | null>(null);
  const [outcome, setOutcome] = useState<SignOutcome | null>(null);
  const [error, setError] = useState<unknown>(null);

  if (!parsed.payload) {
    return (
      <section class="stack" data-testid="sign-invalid">
        <h1>{t('invalid')}</h1>
        <ErrorBox error={parsed.error} />
      </section>
    );
  }
  if (inspected.status === 'loading') return <p data-testid="sign-checking">{t('checking')}</p>;
  if (inspected.status === 'error') return <ErrorBox error={inspected.error} onRetry={inspected.reload} />;
  const check = inspected.value;
  if (!check) return null;

  const payload = parsed.payload;
  const wallet = app.wallet ? { account: app.wallet.account, chainId: app.wallet.chainId } : null;
  const view = signView(check, wallet, sdk.atro.chain.id);
  const explorer = sdk.deployment.explorerUrl;
  const firstFailure = view.failed[0]?.simulation;
  // The guardian warning has its own banner below.
  const warnings = uniqueWarnings(check.steps.map((s) => s.warnings)).filter((w) => w.code !== GUARDIAN_WARNING.code);

  const sign = async () => {
    if (!app.wallet) return;
    setBusy(true);
    setError(null);
    setStatus('signing');
    try {
      if (view.verdict === 'wrongChain') await app.switchChain();
      const r = await sendSignRequest(
        { atro: sdk.atro, provider: app.wallet.option.provider, walletClient: app.walletClient() },
        payload,
        { onStatus: setStatus, onStep: (e) => setStatus(e.phase === 'signing' ? 'signing' : 'pending') },
      );
      setOutcome(r);
      if (r.kind === 'refused') inspected.reload();
    } catch (e) {
      setError(decodeError(e));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const done =
    outcome !== null && (outcome.kind === 'sequential' || (outcome.kind === 'sendCalls' && outcome.result.ok));
  // A bundle still pending after the wait: signing again could send the same calls twice.
  const submitted = outcome?.kind === 'sendCalls' && !outcome.result.ok && outcome.result.status === 'pending';
  const bundleFailed = outcome?.kind === 'sendCalls' && !outcome.result.ok && outcome.result.status !== 'pending';

  return (
    <section class="stack">
      <h1>{t('title')}</h1>
      <p class="muted">{t('intro')}</p>
      <div class="card stack">
        <div>
          {t('signer')}: <AddressText address={check.from} explorer={explorer} />
        </div>
        <div>
          {t('chain')}: <span class="mono">{check.chainId}</span>
        </div>
        {check.vault ? (
          <div>
            {t('vault')}: <AddressText address={check.vault} explorer={explorer} />
          </div>
        ) : null}
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>{t('target')}</th>
            <th>{t('action')}</th>
            <th>{t('simulation')}</th>
          </tr>
        </thead>
        <tbody>
          {check.steps.map((s) => (
            <tr key={s.index} data-testid={`sign-step-${s.index}`} data-allowed={String(s.allowed)}>
              <td>{s.index + 1}</td>
              <td>
                <AddressText address={s.to} explorer={explorer} />
              </td>
              <td>
                <span class={s.allowed ? 'badge badge-ok' : 'badge badge-bad'}>
                  {s.allowed ? t('allowedYes') : t('allowedNo')}
                </span>{' '}
                {s.allowed ? s.summary : s.reason}
                {s.builderCodes ? (
                  <div class="muted">{t('builderCodes', { codes: s.builderCodes.join(', ') })}</div>
                ) : null}
              </td>
              <td>
                {s.simulation.ok === true ? t('simOk') : s.simulation.ok === false ? t('simFailed') : t('simSkipped')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {warnings.map((w) => (
        <Banner kind="warn" key={warningKey(w)} testid={`warning-${w.code}`}>
          {w.message}
        </Banner>
      ))}
      {view.guardianWarning ? (
        <Banner kind="warn" testid="sign-guardian">
          <strong>{GUARDIAN_WARNING.message}</strong>
          <p>{t('guardianPlain')}</p>
        </Banner>
      ) : null}

      {view.verdict === 'refused' ? (
        <Banner kind="error" testid="sign-refused">
          {t('refused')}
        </Banner>
      ) : null}
      {view.verdict === 'simulationFailed' ? (
        <div data-testid="sign-sim-failed" class="stack">
          <Banner kind="error">{t('simFailedAll')}</Banner>
          {firstFailure && firstFailure.ok === false ? <ErrorBox error={firstFailure.error} /> : null}
        </div>
      ) : null}
      {view.verdict === 'connect' ? <p data-testid="sign-connect">{t('connect')}</p> : null}
      {view.verdict === 'wrongAccount' && wallet ? (
        <Banner kind="error" testid="sign-wrong-account">
          {t('wrongAccount', { account: wallet.account })}
        </Banner>
      ) : null}

      {view.canSign && !done && !submitted ? (
        <button type="button" class="btn btn-primary btn-big" data-testid="sign-send" disabled={busy} onClick={sign}>
          {busy
            ? t('signing')
            : view.verdict === 'wrongChain'
              ? t('switchAndSign', { n: check.steps.length })
              : t('sign', { n: check.steps.length })}
        </button>
      ) : null}
      {status || submitted ? (
        <p data-testid="sign-status" data-status={status ?? 'pending'}>
          {status === 'signing' ? t('signing') : t('pending')}
        </p>
      ) : null}
      {error ? <ErrorBox error={error} /> : null}
      {bundleFailed && outcome?.kind === 'sendCalls' ? (
        <Banner kind="error" testid="sign-bundle-failed">
          {t('bundleFailed', { status: outcome.result.status })}
        </Banner>
      ) : null}
      {done && outcome ? (
        <Banner kind="info" testid="sign-done">
          <p>{t('done')}</p>
          {outcomeHashes(outcome).map((h) =>
            explorer ? (
              <div key={h}>
                <a href={explorerTx(explorer, h)} target="_blank" rel="noopener noreferrer">
                  {t('viewTx')}
                </a>
              </div>
            ) : (
              <div key={h} class="mono">
                {h}
              </div>
            ),
          )}
        </Banner>
      ) : null}
    </section>
  );
}
