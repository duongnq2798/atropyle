import { decodeError, GUARDIAN_WARNING, type SignPayload } from '@atropyle/sdk';
import { useMemo, useState } from 'preact/hooks';
import type { Hex } from 'viem';
import { explorerTx } from '../lib/links';
import { href } from '../lib/route';
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

/** Keyed by the hash: a second link never inherits the outcome, status or error of the first. */
export function SignPage({ sdk }: { sdk: Sdk }) {
  const hash = useHash();
  return <SignRequest key={hash} sdk={sdk} hash={hash} />;
}

function SignRequest({ sdk, hash }: { sdk: Sdk; hash: string }) {
  const app = useApp();
  const t = useT(messages);
  const parsed = useMemo(() => parse(sdk, hash), [sdk, hash]);
  const inspected = useAsync(
    async () => (parsed.payload ? sdk.atro.handoff.inspect(parsed.payload) : null),
    [sdk, parsed.payload],
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<CallsStatus | 'signing' | null>(null);
  const [outcome, setOutcome] = useState<SignOutcome | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Steps of a one-by-one send already confirmed on chain; a resume signs only what is left.
  const [confirmed, setConfirmed] = useState<Hex[]>([]);
  const [offset, setOffset] = useState(0);
  const [resumeBlocked, setResumeBlocked] = useState(false);

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
    const base = offset;
    const request = base === 0 ? payload : { ...payload, steps: payload.steps.slice(base) };
    try {
      if (view.verdict === 'wrongChain') await app.switchChain();
      const r = await sendSignRequest(
        { atro: sdk.atro, provider: app.wallet.option.provider, walletClient: app.walletClient() },
        request,
        {
          onStatus: setStatus,
          onStep: (e) => {
            setStatus(e.phase === 'signing' ? 'signing' : 'pending');
            const h = e.hash;
            if (e.phase === 'confirmed' && h) setConfirmed((c) => (c.includes(h) ? c : [...c, h]));
          },
        },
      );
      setOutcome(r);
      if (r.kind === 'refused') {
        if (base > 0) setResumeBlocked(true);
        else inspected.reload();
      }
    } catch (e) {
      const err = decodeError(e);
      const completed = err.details?.completed;
      if (typeof completed === 'number' && completed > 0) setOffset(base + completed);
      setError(err);
    } finally {
      setBusy(false);
      setStatus(null);
    }
  };

  const done =
    outcome !== null && (outcome.kind === 'sequential' || (outcome.kind === 'sendCalls' && outcome.result.ok));
  // The wallet took the bundle. Only 400 (not sent) and 500 (reverted) allow another try; pending, partial and
  // unknown statuses could still be on chain, and signing again could move assets twice.
  const bundle = outcome?.kind === 'sendCalls' && !outcome.result.ok ? outcome.result : null;
  const submitted = bundle !== null && bundle.status !== 'failed' && bundle.status !== 'reverted';
  const bundleFailed = bundle !== null && bundle.status !== 'pending';
  const doneHashes = outcome ? [...new Set([...confirmed, ...outcomeHashes(outcome)])] : [];

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

      {view.canSign && !done && !submitted && !resumeBlocked ? (
        <button type="button" class="btn btn-primary btn-big" data-testid="sign-send" disabled={busy} onClick={sign}>
          {busy
            ? t('signing')
            : offset > 0
              ? t('resume', { n: offset + 1 })
              : view.verdict === 'wrongChain'
                ? t('switchAndSign', { n: check.steps.length })
                : t('sign', { n: check.steps.length })}
        </button>
      ) : null}
      {status || bundle?.status === 'pending' ? (
        <p data-testid="sign-status" data-status={status ?? 'pending'}>
          {status === 'signing' ? t('signing') : t('pending')}
        </p>
      ) : null}
      {error ? <ErrorBox error={error} /> : null}
      {confirmed.length > 0 && !done ? (
        <div data-testid="sign-confirmed" class="stack">
          <p>{t('confirmedSoFar')}</p>
          {confirmed.map((h) => (
            <div key={h} class="mono">
              {h}
            </div>
          ))}
        </div>
      ) : null}
      {resumeBlocked ? (
        <div class="stack" data-testid="sign-resume-blocked">
          {check.vault ? (
            <a href={href({ name: 'vault', vault: check.vault })}>{t('openVault')}</a>
          ) : (
            <p>{t('openVault')}</p>
          )}
        </div>
      ) : null}
      {bundle ? (
        <div class="stack" data-testid="sign-bundle-id">
          <p class="mono">{t('bundleId', { id: bundle.id })}</p>
          {submitted ? <p>{t('checkWallet')}</p> : null}
        </div>
      ) : null}
      {bundleFailed && bundle ? (
        <Banner kind="error" testid="sign-bundle-failed">
          {t('bundleFailed', { status: bundle.status })}
        </Banner>
      ) : null}
      {done && outcome ? (
        <Banner kind="info" testid="sign-done">
          <p>{t('done')}</p>
          {doneHashes.map((h) =>
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
