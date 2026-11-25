'use client';

import type { SignPayload, SignRequestCheck, TxPlan } from '@atropyle/sdk';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleQuestionMark, ShieldCheck, X } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { CHAIN_ID, useInvalidateVault, useSdk } from '@/chain/hooks';
import { chainKeys } from '@/chain/keys';
import type { Sdk } from '@/chain/types';
import type { FlowsImpl } from '@/flows/load';
import { useFlows } from '@/flows/use-flows';
import { useT } from '@/i18n/provider';
import { sameAddress } from '@/lib/address';
import { cn } from '@/lib/cn';
import { isFramed } from '@/lib/framed';
import { useLocationHash } from '@/lib/hash';
import { useMounted } from '@/lib/use-mounted';
import { messages } from '@/messages/sign.messages';
import { toSdkSignLink, vaultHref } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { ErrorBox } from '@/tx/error-box';
import { planIsIrreversible } from '@/tx/irreversible';
import type { MirrorToken } from '@/tx/mirror';
import { TxCard } from '@/tx/tx-card';
import { useTxRunner } from '@/tx/use-tx-runner';
import { Address } from '@/ui/address';
import { Banner } from '@/ui/banner';
import { buttonClass } from '@/ui/button';
import { SkeletonText } from '@/ui/skeleton';
import { networkName } from '@/wallet/network';
import { useWallet } from '@/wallet/provider';
import { ConfirmGate, type ConfirmRow } from './confirm-gate';
import { SignStep } from './sign-step';
import { TermsCard } from './terms-card';
import { VoteGate, type VoteRow } from './vote-gate';

type Decoded = { ok: true; payload: SignPayload } | { ok: false; error: unknown };
type SignView = ReturnType<FlowsImpl['signView']>;
type CheckId = 'decoded' | 'whitelist' | 'simulation' | 'signer';
type CheckState = 'pass' | 'fail' | 'unknown';
type NoteKey = 'statePass' | 'stateFail' | 'stateConnect' | 'stateSkipped' | 'stateNotRun';
interface CheckItem {
  id: CheckId;
  state: CheckState;
  note: NoteKey;
}

const CHECK_KEY = {
  decoded: 'checkDecoded',
  whitelist: 'checkWhitelist',
  simulation: 'checkSimulation',
  signer: 'checkSigner',
} as const;
const NO_TOKENS: readonly MirrorToken[] = [];

const errorCode = (e: unknown): string | null =>
  typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string'
    ? (e as { code: string }).code
    : null;
const bytesOf = (p: SignPayload, i: number) => Math.max(0, ((p.steps[i]?.data.length ?? 2) - 2) / 2);

export function SignPage() {
  const t = useT(messages);
  const mounted = useMounted();
  const hash = useLocationHash();
  const framed = mounted && isFramed(window);
  return (
    <div data-testid="sign" className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-h1 text-ink">{t('title')}</h1>
        <p className="flex items-start gap-3 text-ink-muted text-lead">
          <ShieldCheck aria-hidden="true" size={24} strokeWidth={1.5} className="mt-1 shrink-0 text-thread" />
          <span>{t('intro')}</span>
        </p>
      </header>
      {!mounted ? (
        <Checking />
      ) : framed ? (
        <Banner tone="error" title={t('framed')} testId="sign-framed">
          {t('framedHelp')}
        </Banner>
      ) : (
        // Keyed by the fragment: another link never inherits what was typed, sent or refused for this one.
        <SignRequest key={hash} hash={hash} />
      )}
    </div>
  );
}

function Checking() {
  const t = useT(messages);
  return (
    <div data-testid="sign-checking" aria-busy="true" className="flex flex-col gap-3">
      <p className="text-ink-muted text-small">{t('checking')}</p>
      <SkeletonText lines={5} />
    </div>
  );
}

function Invalid({ error }: { error: unknown }) {
  const t = useT(messages);
  return (
    <section data-testid="sign-invalid" aria-labelledby="sign-invalid-title" className="flex flex-col gap-4">
      <h2 id="sign-invalid-title" className="font-display text-ink text-title">
        {t('invalid')}
      </h2>
      <p className="text-ink-muted">{t('invalidHelp')}</p>
      <ErrorBox error={error} />
    </section>
  );
}

function SignRequest({ hash }: { hash: string }) {
  const sdkQuery = useSdk();
  const flowsQuery = useFlows();
  const sdk = sdkQuery.data ?? null;
  // A link without `p=`, or no fragment at all, fails to parse like any broken link: LINK_INVALID.
  const decoded = useMemo<Decoded | null>(() => {
    if (!sdk) return null;
    try {
      return { ok: true, payload: sdk.atro.handoff.parse(toSdkSignLink(hash)) };
    } catch (error) {
      return { ok: false, error };
    }
  }, [sdk, hash]);
  const payload = decoded?.ok ? decoded.payload : null;
  const inspect = useQuery({
    queryKey: chainKeys.sign(CHAIN_ID, hash),
    queryFn: sdk && payload ? () => sdk.atro.handoff.inspect(payload) : skipToken,
    // The send inspects again right before the wallet: this check only shows the page.
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    structuralSharing: false,
  });

  if (sdkQuery.isError) return <ErrorBox error={sdkQuery.error} onRetry={() => void sdkQuery.refetch()} />;
  if (flowsQuery.isError) return <ErrorBox error={flowsQuery.error} onRetry={() => void flowsQuery.refetch()} />;
  if (decoded && !decoded.ok) return <Invalid error={decoded.error} />;
  if (inspect.isError) return <ErrorBox error={inspect.error} onRetry={() => void inspect.refetch()} />;
  if (!sdk || !payload || !inspect.data || !flowsQuery.data) return <Checking />;
  return <SignChecked hash={hash} payload={payload} check={inspect.data} flows={flowsQuery.data} sdk={sdk} />;
}

function checkRows(check: SignRequestCheck, view: SignView, account: string | null): CheckItem[] {
  const decoded = check.steps.length > 0 && check.steps.every((s) => s.action !== null);
  const listed = view.refused.length === 0 && check.chainId === CHAIN_ID && check.steps.length > 0;
  const simulation: Pick<CheckItem, 'state' | 'note'> =
    view.failed.length > 0 || view.verdict === 'simulationFailed' || view.verdict === 'unproven'
      ? { state: 'fail', note: 'stateFail' }
      : view.refused.length > 0
        ? { state: 'unknown', note: 'stateNotRun' }
        : check.steps.some((s) => s.simulation.ok === 'skipped')
          ? { state: 'unknown', note: 'stateSkipped' }
          : { state: 'pass', note: 'statePass' };
  const signer: Pick<CheckItem, 'state' | 'note'> =
    account === null
      ? { state: 'unknown', note: 'stateConnect' }
      : sameAddress(account, check.from)
        ? { state: 'pass', note: 'statePass' }
        : { state: 'fail', note: 'stateFail' };
  return [
    { id: 'decoded', state: decoded ? 'pass' : 'fail', note: decoded ? 'statePass' : 'stateFail' },
    { id: 'whitelist', state: listed ? 'pass' : 'fail', note: listed ? 'statePass' : 'stateFail' },
    { id: 'simulation', ...simulation },
    { id: 'signer', ...signer },
  ];
}

function CheckRow({ id, state, note }: CheckItem) {
  const t = useT(messages);
  const Icon = state === 'pass' ? Check : state === 'fail' ? X : CircleQuestionMark;
  return (
    <li data-testid={`sign-check-${id}`} data-state={state} className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border',
          state === 'pass' && 'border-thread bg-thread text-on-thread',
          state === 'fail' && 'border-danger bg-danger text-on-danger',
          state === 'unknown' && 'border-line-strong text-ink-muted',
        )}
      >
        <Icon size={14} strokeWidth={2} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-body text-ink">{t(CHECK_KEY[id])}</span>
        <span className={cn('text-small', state === 'fail' ? 'text-danger' : 'text-ink-muted')}>{t(note)}</span>
      </span>
    </li>
  );
}

function SignChecked({
  hash,
  payload,
  check,
  flows,
  sdk,
}: {
  hash: string;
  payload: SignPayload;
  check: SignRequestCheck;
  flows: FlowsImpl;
  sdk: Sdk;
}) {
  const t = useT(messages);
  const wallet = useWallet();
  const client = useQueryClient();
  const explorer = sdk.deployment.explorerUrl;
  const connected = wallet.wallet ? { account: wallet.wallet.account, chainId: wallet.wallet.chainId } : null;
  const view = flows.signView(check, connected, CHAIN_ID);
  const plan = useMemo(() => flows.signPlan(payload, check, CHAIN_ID), [flows, payload, check]);
  const tokens = useQuery({
    queryKey: chainKeys.signTokens(CHAIN_ID, hash),
    queryFn: plan ? () => flows.signTokens(sdk.atro, payload, check) : skipToken,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    retry: false,
    structuralSharing: false,
  });
  // The sender inspected the whole request again and it no longer passes: the page shows that check instead, when it
  // leaves nothing to sign. A resumed send inspects only the steps left, which says nothing of those already on chain.
  const onRefused = useCallback(
    (fresh: SignRequestCheck) => {
      if (fresh.steps.length === payload.steps.length && flows.signPlan(payload, fresh, CHAIN_ID) === null)
        client.setQueryData(chainKeys.sign(CHAIN_ID, hash), fresh);
    },
    [client, flows, hash, payload],
  );
  const failure = view.failed[0]?.simulation;

  return (
    <div className="flex flex-col gap-6">
      {view.verdict === 'refused' ? (
        <Banner tone="error" testId="sign-refused">
          {t('refused')}
        </Banner>
      ) : null}
      {view.verdict === 'simulationFailed' ? (
        <div data-testid="sign-sim-failed" className="flex flex-col gap-3">
          <Banner tone="error">{t('simFailedAll')}</Banner>
          {failure && failure.ok === false ? <ErrorBox error={failure.error} testId="sign-sim-error" /> : null}
        </div>
      ) : null}
      {view.verdict === 'unproven' ? (
        <Banner tone="error" testId="sign-unproven">
          {t('unproven')}
        </Banner>
      ) : null}

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-6 gap-y-3 rounded-3xl border border-line bg-surface-1 p-5 text-small sm:p-6">
        <dt className="text-ink-muted">{t('signer')}</dt>
        <dd className="min-w-0">
          <Address address={check.from} explorer={explorer} />
        </dd>
        <dt className="text-ink-muted">{t('chain')}</dt>
        <dd className="text-ink">{networkName(check.chainId)}</dd>
        {check.vault ? (
          <>
            <dt className="text-ink-muted">{t('vault')}</dt>
            <dd className="min-w-0">
              <Address address={check.vault} explorer={explorer} />
            </dd>
          </>
        ) : null}
      </dl>

      <section aria-labelledby="sign-checks-title" className="flex flex-col gap-3">
        <h2 id="sign-checks-title" className="font-display text-ink text-title">
          {t('checksTitle')}
        </h2>
        <ul data-testid="sign-checks" className="flex flex-col gap-3">
          {checkRows(check, view, connected?.account ?? null).map((r) => (
            <CheckRow key={r.id} {...r} />
          ))}
        </ul>
      </section>

      {check.steps.map((s) =>
        s.create ? <TermsCard key={s.index} index={s.index} terms={s.create} explorer={explorer} /> : null,
      )}

      {plan ? (
        tokens.isPending ? (
          <SkeletonText lines={4} />
        ) : (
          <SignSend
            plan={plan}
            payload={payload}
            check={check}
            flows={flows}
            tokens={tokens.data ?? NO_TOKENS}
            guardian={view.guardianWarning}
            onRefused={onRefused}
          />
        )
      ) : (
        // Nothing here can be signed: the steps in plain words and their reasons, and no "Your wallet should show",
        // which would read as an invitation to sign.
        <section aria-labelledby="sign-steps-title" className="flex flex-col gap-3">
          <h2 id="sign-steps-title" className="font-display text-ink text-title">
            {t('stepsTitle')}
          </h2>
          <ol className="flex flex-col gap-3">
            {check.steps.map((s) => (
              <SignStep key={s.index} step={s} dataBytes={bytesOf(payload, s.index)} explorer={explorer} />
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function SignSend({
  plan,
  payload,
  check,
  flows,
  tokens,
  guardian,
  onRefused,
}: {
  plan: TxPlan;
  payload: SignPayload;
  check: SignRequestCheck;
  flows: FlowsImpl;
  tokens: readonly MirrorToken[];
  guardian: boolean;
  onRefused(check: SignRequestCheck): void;
}) {
  const t = useT(messages);
  const invalidate = useInvalidateVault();
  // Typed by the signer, never filled from the link: the votes by step, the Drill recipients by confirmKey.
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [retyped, setRetyped] = useState<Record<string, string>>({});
  const voteSteps = useMemo(() => flows.voteSteps(payload, check), [flows, payload, check]);
  const votes: VoteRow[] = voteSteps.map((v) => ({
    index: v.index,
    reason: flows.typedReason(typed[v.index] ?? '', v.target),
  }));
  const confirms: ConfirmRow[] = (check.confirm?.addresses ?? []).map((a, i) => {
    const key = flows.confirmKey(a);
    return { address: a, i, key, reason: flows.typedReason(retyped[key] ?? '', a.account) };
  });
  const open = votes.every((v) => v.reason === null) && confirms.every((r) => r.reason === null);
  const sender = useMemo(
    () =>
      flows.signSenderWith({
        typed: (a) => retyped[flows.confirmKey(a)] ?? '',
        open: () => open,
        refused: onRefused,
      }),
    [flows, retyped, open, onRefused],
  );
  const vault = check.vault;
  const runner = useTxRunner({
    plan,
    sender,
    handoff: false,
    tokens,
    onDone: () => {
      if (vault) void invalidate(vault);
    },
  });
  const done = runner.result !== null;
  // Once the wallet holds something, what was typed is what is being sent: it stays as it is.
  const locked = runner.busy || runner.committed;
  const n = plan.steps.length;
  const resumeRefused = !done && runner.offset > 0 && errorCode(runner.error) === 'LINK_INVALID';
  return (
    <div className="flex flex-col gap-6">
      {guardian && !done ? (
        <Banner tone="warn" title={t('guardianTitle')} testId="sign-guardian">
          {t('guardianPlain')}
        </Banner>
      ) : null}
      {votes.length > 0 && !done ? (
        <VoteGate rows={votes} typed={typed} locked={locked} onType={(i, v) => setTyped((s) => ({ ...s, [i]: v }))} />
      ) : null}
      {confirms.length > 0 && !done ? (
        <ConfirmGate
          rows={confirms}
          typed={retyped}
          locked={locked}
          recipients={check.confirm?.reason === 'DRILL_RECIPIENTS_CHANGED'}
          onType={(k, v) => setRetyped((s) => ({ ...s, [k]: v }))}
        />
      ) : null}
      <TxCard
        runner={runner}
        label={n === 1 ? t('signOne') : t('signMany', { n })}
        // TxCard's own done title ("Signed and recorded") names the Receipt: the page's title only names the steps.
        title={done ? undefined : t('txTitle')}
        tone={planIsIrreversible(plan) ? 'danger' : 'thread'}
        disabled={!open}
        testId="sign-tx"
        receiptFooter={
          vault ? (
            <NavLink
              href={vaultHref(vault)}
              data-testid="sign-open-vault"
              className={buttonClass({ variant: 'secondary' })}
            >
              {t('openVault')}
            </NavLink>
          ) : null
        }
      />
      {resumeRefused ? (
        <Banner
          tone="info"
          testId="sign-resume-blocked"
          action={
            vault ? (
              <NavLink href={vaultHref(vault)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                {t('openVaultToFinish')}
              </NavLink>
            ) : undefined
          }
        >
          {t('resumeBlocked')}
        </Banner>
      ) : null}
    </div>
  );
}
