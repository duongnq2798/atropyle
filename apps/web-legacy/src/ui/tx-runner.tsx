import { decodeError, type SendResult, sameAddress, type TxPlan } from '@atropyle/sdk';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { explorerTx } from '../lib/links';
import { applyStep, failStep, type StepPhase, txView, warningKey } from '../lib/tx-view';
import { useApp, useT } from './app-context';
import { AddressText, Banner, CopyButton, ErrorBox, WarningText } from './components';
import { messages } from './tx-runner.messages';
import { useLeaveGuard } from './use-leave-guard';

const PHASE = {
  ready: 'phaseReady',
  skipped: 'phaseReady',
  blocked: 'phaseBlocked',
  signing: 'phaseSigning',
  pending: 'phasePending',
  confirmed: 'phaseConfirmed',
  failed: 'phaseFailed',
} as const satisfies Record<StepPhase, string>;

/** The steps not confirmed yet: what a retry sends, and what a hand-off link may carry. */
function remaining(plan: TxPlan, offset: number): TxPlan {
  return offset === 0 ? plan : { ...plan, steps: plan.steps.slice(offset) };
}

function signBase(): string {
  return location.href.split('#')[0];
}

export function TxRunner(props: {
  plan: TxPlan;
  label: string;
  onDone?: (r: SendResult) => void;
  /**
   * Called whenever either value changes. `committed`: a send is in flight or the wallet has accepted something for
   * this plan (a hash, a pending or confirmed step), so the plan must not be replaced by a new one.
   */
  onProgress?: (p: { confirmed: number; committed: boolean }) => void;
  testid?: string;
}) {
  const { plan, label, onDone, onProgress } = props;
  const id = props.testid ?? 'tx';
  const app = useApp();
  const t = useT(messages);
  const sdk = app.sdk!;
  const [view, setView] = useState(() => txView(plan));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  // Steps already confirmed on chain by an earlier, partly failed send; a retry never signs them again.
  const [offset, setOffset] = useState(0);

  // The state above is already built for the plan this component mounted with; only a different plan resets it. Without
  // this, the mount run of the effect could wipe a row confirmed by a send that started right after mount.
  const resetFor = useRef(plan);
  useEffect(() => {
    if (resetFor.current === plan) return;
    resetFor.current = plan;
    setView(txView(plan));
    setError(null);
    setResult(null);
    setOffset(0);
  }, [plan]);

  const confirmed = view.rows.filter((r) => r.phase === 'confirmed').length;
  // A failed row keeps the hash it got, so a failure after `pending` stays accepted; a rejection before any hash does not.
  const accepted = view.rows.some((r) => r.hash !== null || r.phase === 'pending' || r.phase === 'confirmed');
  const committed = busy || accepted;
  useEffect(() => {
    onProgress?.({ confirmed, committed });
  }, [confirmed, committed]);
  useLeaveGuard(committed && result === null);

  // After a partial send the link carries only the remaining steps, so the next signer never sends a confirmed one again.
  const link = useMemo(() => {
    try {
      return sdk.atro.handoff.link(remaining(plan, offset), signBase());
    } catch {
      return null; // payload above PAYLOAD_LIMITS: no hand-off for this plan
    }
  }, [sdk, plan, offset]);

  const wallet = app.wallet;
  const wrongAccount = !!wallet && !sameAddress(wallet.account, plan.from);
  const explorer = sdk.deployment.explorerUrl;

  const send = async () => {
    setBusy(true);
    setError(null);
    const base = offset;
    try {
      if (wallet && wallet.chainId !== sdk.atro.chain.id) await app.switchChain();
      const r = await sdk.atro.send(remaining(plan, base), app.walletClient(), {
        onStep: (e) => {
          setView((v) => applyStep(v, { ...e, index: e.index + base }));
        },
      });
      setResult(r);
      onDone?.(r);
    } catch (e) {
      const err = decodeError(e);
      const index = err.details?.index;
      const completed = err.details?.completed;
      if (typeof index === 'number') setView((v) => failStep(v, index + base, err.toJSON()));
      if (typeof completed === 'number' && completed > 0) setOffset(base + completed);
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section class="card stack" data-testid={id}>
      {view.total > 1 ? (
        <progress
          data-testid={`${id}-progress`}
          value={view.rows.filter((r) => r.phase === 'confirmed').length}
          max={view.total}
        />
      ) : null}
      {view.warnings.map((w) => (
        <Banner kind="warn" key={warningKey(w)} testid={`warning-${w.code}`}>
          <WarningText warning={w} />
        </Banner>
      ))}
      <div class="table-wrap">
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
                <td class="wrap-anywhere">{r.summary}</td>
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
                  {r.hash && !explorer ? <span class="mono wrap-anywhere"> {r.hash}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
          {busy ? t('sending') : offset > 0 ? t('resume', { n: offset + 1 }) : label}
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
