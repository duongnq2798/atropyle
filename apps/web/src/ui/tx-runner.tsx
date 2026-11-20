import { decodeError, type SendResult, sameAddress, type TxPlan } from '@atropyle/sdk';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { explorerTx } from '../lib/links';
import { applyStep, failStep, type StepPhase, txView, warningKey } from '../lib/tx-view';
import { useApp, useT } from './app-context';
import { AddressText, Banner, CopyButton, ErrorBox } from './components';
import { messages } from './tx-runner.messages';

const PHASE = {
  ready: 'phaseReady',
  skipped: 'phaseReady',
  blocked: 'phaseBlocked',
  signing: 'phaseSigning',
  pending: 'phasePending',
  confirmed: 'phaseConfirmed',
  failed: 'phaseFailed',
} as const satisfies Record<StepPhase, string>;

function signBase(): string {
  return location.href.split('#')[0];
}

export function TxRunner(props: { plan: TxPlan; label: string; onDone?: (r: SendResult) => void; testid?: string }) {
  const { plan, label, onDone } = props;
  const id = props.testid ?? 'tx';
  const app = useApp();
  const t = useT(messages);
  const sdk = app.sdk!;
  const [view, setView] = useState(() => txView(plan));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  useEffect(() => {
    setView(txView(plan));
    setError(null);
    setResult(null);
  }, [plan]);

  const link = useMemo(() => {
    try {
      return sdk.atro.handoff.link(plan, signBase());
    } catch {
      return null; // payload above PAYLOAD_LIMITS: no hand-off for this plan
    }
  }, [sdk, plan]);

  const wallet = app.wallet;
  const wrongAccount = !!wallet && !sameAddress(wallet.account, plan.from);
  const explorer = sdk.deployment.explorerUrl;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      if (wallet && wallet.chainId !== sdk.atro.chain.id) await app.switchChain();
      const r = await sdk.atro.send(plan, app.walletClient(), { onStep: (e) => setView((v) => applyStep(v, e)) });
      setResult(r);
      onDone?.(r);
    } catch (e) {
      const err = decodeError(e);
      const index = err.details?.index;
      if (typeof index === 'number') setView((v) => failStep(v, index, err.toJSON()));
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="card stack" data-testid={id}>
      {view.warnings.map((w) => (
        <Banner kind="warn" key={warningKey(w)} testid={`warning-${w.code}`}>
          {w.message}
        </Banner>
      ))}
      <table class="table">
        <thead>
          <tr>
            <th>#</th>
            <th>{t('what')}</th>
            <th>{t('check')}</th>
            <th>{t('status')}</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((r) => (
            <tr key={r.index} data-testid={`${id}-step-${r.index}`} data-phase={r.phase}>
              <td>{r.index + 1}</td>
              <td>{r.summary}</td>
              <td>
                {r.simulation === 'ok' ? t('simOk') : r.simulation === 'failed' ? t('simFailed') : t('simSkipped')}
              </td>
              <td>
                {t(PHASE[r.phase])}
                {r.hash && explorer ? (
                  <>
                    {' '}
                    <a href={explorerTx(explorer, r.hash)} target="_blank" rel="noopener noreferrer">
                      {t('viewTx')}
                    </a>
                  </>
                ) : null}
                {r.hash && !explorer ? <span class="mono"> {r.hash}</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {view.blockedError ? <ErrorBox error={view.blockedError} /> : null}
      {error ? <ErrorBox error={error} /> : null}
      {result ? (
        <Banner kind="info" testid={`${id}-done`}>
          {t('done')}
        </Banner>
      ) : !wallet ? (
        <p class="muted">{t('connectFirst')}</p>
      ) : wrongAccount ? (
        <Banner kind="error" testid={`${id}-wrong-account`}>
          {t('wrongAccount')} <AddressText address={plan.from} />
        </Banner>
      ) : (
        <button
          type="button"
          class="btn btn-primary btn-big"
          data-testid={`${id}-send`}
          disabled={busy || !view.canSend}
          onClick={send}
        >
          {busy ? t('sending') : label}
        </button>
      )}
      {link ? (
        <details>
          <summary>{t('handoffTitle')}</summary>
          <p class="muted">{t('handoffBody')}</p>
          <CopyButton text={link} label={t('copyLink')} testid={`${id}-copy-link`} />
        </details>
      ) : null}
    </section>
  );
}
