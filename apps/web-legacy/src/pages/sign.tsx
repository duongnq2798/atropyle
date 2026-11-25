import { type CreateTerms, decodeError, formatDuration, GUARDIAN_WARNING, type SignPayload } from '@atropyle/sdk';
import { useMemo, useState } from 'preact/hooks';
import type { Hex } from 'viem';
import { formatBps, formatTimestamp } from '../lib/format';
import { confirmTarget, type TargetCheck } from '../lib/guardian';
import { explorerTx } from '../lib/links';
import { href } from '../lib/route';
import type { Sdk } from '../lib/sdk';
import type { CallsStatus } from '../lib/send-calls';
import { confirmKey, isGuardianStep, type SignOutcome, sendSignRequest, signView, voteSteps } from '../lib/sign';
import { uniqueWarnings, warningKey } from '../lib/tx-view';
import { useApp, useT } from '../ui/app-context';
import { AddressText, Banner, ErrorBox, WarningText } from '../ui/components';
import { messages as labels } from '../ui/labels.messages';
import { useAsync } from '../ui/use-async';
import { useHash } from '../ui/use-hash';
import { useLeaveGuard } from '../ui/use-leave-guard';
import { messages } from './sign.messages';

function parse(sdk: Sdk, hash: string): { payload: SignPayload | null; error: unknown } {
  try {
    return { payload: sdk.atro.handoff.parse(hash), error: null };
  } catch (error) {
    return { payload: null, error };
  }
}

/** A vote whose calldata does not decode: no typed address can match it, so it can never be signed here. */
const UNDECODED: TargetCheck = { ok: false, reason: 'invalid' };
const VOTE_REASON = { invalid: 'voteInvalid', mismatch: 'voteMismatch' } as const;
const CONFIRM_REASON = { invalid: 'confirmInvalid', mismatch: 'confirmMismatch' } as const;

/** Who gets what and how early, as the SDK decoded it from the createVault calldata. The SDK refuses a second
 * createVault, a vault that already exists and any later call to that vault in the same link, so these terms are
 * final. */
function TermsCard({ index, terms, explorer }: { index: number; terms: CreateTerms; explorer: string | null }) {
  const t = useT(messages);
  const l = useT(labels);
  const e = terms.exit;
  const id = `sign-terms-${index}`;
  const tm = terms.timing;
  return (
    <section class="card stack" data-testid={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        {t('termsTitle', { n: index + 1 })} {terms.drill ? <span class="badge">{l('drill')}</span> : null}
      </h2>
      <div>
        <AddressText address={terms.vault} explorer={explorer} />
      </div>
      {e.earliest && terms.earliestAt !== null ? (
        <p data-testid={`${id}-earliest`} data-after={String(e.earliest.after)} data-route={e.earliest.route}>
          <strong>
            {t('earliest', { time: formatDuration(e.earliest.after), date: formatTimestamp(terms.earliestAt) })}
          </strong>
        </p>
      ) : (
        <p data-testid={`${id}-earliest`} data-after="none">
          <strong>{t('earliestNone')}</strong>
        </p>
      )}
      {terms.drill && e.expiresAfter !== null ? (
        <p>{t('termsDrill', { time: formatDuration(e.expiresAfter) })}</p>
      ) : null}
      {e.routes.length > 0 ? (
        <>
          <h3>{t('routesTitle')}</h3>
          <ul data-testid={`${id}-routes`}>
            {e.routes.map((r) => {
              const time = formatDuration(r.after);
              const text =
                r.route === 'recovery'
                  ? t('routeRecovery', { time, k: r.guardians })
                  : r.route === 'heirsFallback'
                    ? t('routeFallback', { time })
                    : r.guardians === 0
                      ? t('routeHeirs', { time })
                      : t('routeHeirsGuardians', { time, k: r.guardians });
              return (
                <li key={r.route} data-route={r.route} data-after={String(r.after)}>
                  {text}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      <h3>{t('heirsTitle')}</h3>
      <ul data-testid={`${id}-heirs`}>
        {terms.heirs.map((h) => (
          <li key={h.account}>
            <AddressText address={h.account} /> {formatBps(h.bps)}
          </li>
        ))}
      </ul>
      <h3>{t('guardiansTitle')}</h3>
      {terms.guardians.length === 0 ? (
        <p class="muted" data-testid={`${id}-guardians`}>
          {t('guardiansNone')}
        </p>
      ) : (
        <div data-testid={`${id}-guardians`}>
          <ul>
            {terms.guardians.map((g) => (
              <li key={g}>
                <AddressText address={g} />
              </li>
            ))}
          </ul>
          <p>{t(terms.recoveryEnabled ? 'guardiansOn' : 'guardiansOff', { k: terms.k, n: terms.guardians.length })}</p>
        </div>
      )}
      <p>
        {t('timingLine', {
          period: formatDuration(tm.period),
          threshold: tm.threshold,
          window: formatDuration(tm.window),
        })}
      </p>
    </section>
  );
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
  // What the guardian typed for each vote step, by step index. Always empty on load: never read from the link.
  const [typed, setTyped] = useState<Record<number, string>>({});
  // What the signer typed for each address the SDK asks to confirm, by confirmKey. Also never read from the link.
  const [retyped, setRetyped] = useState<Record<string, string>>({});
  // Closing the tab mid-send, or with confirmed steps and steps left, loses the only copy of what remains to sign.
  const finished =
    outcome !== null && (outcome.kind === 'sequential' || (outcome.kind === 'sendCalls' && outcome.result.ok));
  useLeaveGuard((busy || offset > 0) && !finished && !resumeBlocked);

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
  // A vote moves everything in the vault: the guardian types the wallet, and it must be the one the calldata names.
  const votes = voteSteps(payload, check).map((v) => ({
    ...v,
    check: v.target ? confirmTarget(typed[v.index] ?? '', v.target) : UNDECODED,
  }));
  const votesConfirmed = votes.every((v) => v.check.ok);
  // A Drill that can move tokens, or gets new heirs or recovery guardians: every heir (and guardian, with recovery)
  // is typed again before Sign turns on.
  const confirmRows = view.confirm.map((a, i) => {
    const key = confirmKey(a);
    return { a, i, key, check: confirmTarget(retyped[key] ?? '', a.account) };
  });
  const addressesConfirmed = confirmRows.every((r) => r.check.ok);

  const sign = async () => {
    if (!app.wallet || !votesConfirmed || !addressesConfirmed) return;
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
          confirm: (addresses) => addresses.map((a) => retyped[confirmKey(a)] ?? ''),
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

  const done = finished;
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
                {/* A guardian step is allowed but never "fine": it gets a neutral badge, not the green one. */}
                {!s.allowed ? (
                  <span class="badge badge-bad">{t('allowedNo')}</span>
                ) : isGuardianStep(s) ? (
                  <span class="badge">{t('allowedGuardian')}</span>
                ) : (
                  <span class="badge badge-ok">{t('allowedYes')}</span>
                )}{' '}
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

      {check.steps.map((s) =>
        s.create ? <TermsCard key={s.index} index={s.index} terms={s.create} explorer={explorer} /> : null,
      )}

      {warnings.map((w) => (
        <Banner kind="warn" key={warningKey(w)} testid={`warning-${w.code}`}>
          <WarningText warning={w} />
        </Banner>
      ))}
      {view.guardianWarning ? (
        <Banner kind="warn" testid="sign-guardian">
          <strong>{GUARDIAN_WARNING.message}</strong>
          <p>{t('guardianPlain')}</p>
        </Banner>
      ) : null}
      {votes.length > 0 && view.verdict !== 'refused' ? (
        <div class="card stack" data-testid="sign-votes">
          <p>{t('voteConfirm')}</p>
          {votes.map((v) => (
            <div class="stack" key={v.index}>
              <label class="field">
                <span>{t('voteTarget', { n: v.index + 1 })}</span>
                <input
                  data-testid={`sign-vote-target-${v.index}`}
                  value={typed[v.index] ?? ''}
                  placeholder={'0x\u{2026}'}
                  spellcheck={false}
                  autocomplete="off"
                  readOnly={busy}
                  onInput={(ev) => {
                    const value = (ev.target as HTMLInputElement).value;
                    setTyped((x) => ({ ...x, [v.index]: value }));
                  }}
                />
              </label>
              {!v.check.ok && v.check.reason !== 'empty' ? (
                <p class="field-error" data-testid={`sign-vote-target-${v.index}-error`} data-reason={v.check.reason}>
                  {t(VOTE_REASON[v.check.reason])}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {confirmRows.length > 0 && view.verdict !== 'refused' && view.verdict !== 'unproven' ? (
        <section
          class="card stack"
          data-testid="sign-confirm"
          aria-labelledby="sign-confirm-title"
          aria-describedby="sign-confirm-intro"
        >
          <h2 id="sign-confirm-title">{t('confirmTitle')}</h2>
          <p id="sign-confirm-intro">
            {t(check.confirm?.reason === 'DRILL_RECIPIENTS_CHANGED' ? 'confirmIntroRecipients' : 'confirmIntro')}
          </p>
          {confirmRows.map((r) => {
            const reason = !r.check.ok && r.check.reason !== 'empty' ? r.check.reason : null;
            const errorId = `sign-confirm-${r.i}-error`;
            return (
              <div class="stack" key={r.key}>
                <label class="field">
                  <span>
                    {r.a.role === 'heir'
                      ? t('confirmHeir', { n: r.a.index + 1, share: formatBps(r.a.bps ?? 0), step: r.a.step + 1 })
                      : t('confirmGuardian', { n: r.a.index + 1, step: r.a.step + 1 })}
                  </span>
                  <input
                    data-testid={`sign-confirm-${r.i}`}
                    value={retyped[r.key] ?? ''}
                    placeholder={'0x\u{2026}'}
                    spellcheck={false}
                    autocomplete="off"
                    readOnly={busy}
                    aria-invalid={reason ? 'true' : undefined}
                    aria-describedby={reason ? errorId : undefined}
                    onInput={(ev) => {
                      const value = (ev.target as HTMLInputElement).value;
                      setRetyped((x) => ({ ...x, [r.key]: value }));
                    }}
                  />
                </label>
                {reason ? (
                  <p class="field-error" id={errorId} data-testid={errorId} data-reason={reason}>
                    {t(CONFIRM_REASON[reason])}
                  </p>
                ) : null}
              </div>
            );
          })}
          <p class="muted" aria-live="polite" data-testid="sign-confirm-count">
            {t('confirmCount', { done: confirmRows.filter((r) => r.check.ok).length, total: confirmRows.length })}
          </p>
        </section>
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
      {view.verdict === 'unproven' ? (
        <Banner kind="error" testid="sign-unproven">
          {t('unproven')}
        </Banner>
      ) : null}
      {view.verdict === 'connect' ? <p data-testid="sign-connect">{t('connect')}</p> : null}
      {view.verdict === 'wrongAccount' && wallet ? (
        <Banner kind="error" testid="sign-wrong-account">
          {t('wrongAccount', { account: wallet.account })}
        </Banner>
      ) : null}

      {view.canSign && !done && !submitted && !resumeBlocked ? (
        <button
          type="button"
          class="btn btn-primary btn-big"
          data-testid="sign-send"
          disabled={busy || !votesConfirmed || !addressesConfirmed}
          onClick={sign}
        >
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
