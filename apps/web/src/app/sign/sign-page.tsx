'use client';

import type { SignPayload, SignRequestCheck, TxPlan } from '@atropyle/sdk';
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleQuestionMark, Link2Off, type LucideIcon, ShieldCheck, ShieldX, X } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
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
import { Skeleton, SkeletonText } from '@/ui/skeleton';
import { Spinner } from '@/ui/spinner';
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
const CHECK_IDS: readonly CheckId[] = ['decoded', 'whitelist', 'simulation', 'signer'];
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
        <Verdict id="sign-framed" icon={ShieldX} title={t('framed')} testId="sign-framed">
          {t('framedHelp')}
        </Verdict>
      ) : (
        // Keyed by the fragment: another link never inherits what was typed, sent or refused for this one.
        <SignRequest key={hash} hash={hash} />
      )}
    </div>
  );
}

/**
 * The page's verdict when nothing may be signed, or the link cannot be read: first on the page, before any address
 * or check (Ruling 20), and in the display voice, so it is what the signer reads first. An alert is announced; a
 * broken link is a plain region, since the page has nothing else to say.
 */
function Verdict({
  id,
  icon: Icon,
  title,
  alert = true,
  testId,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: ReactNode;
  alert?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  const body = (
    <>
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-danger text-on-danger"
      >
        <Icon size={20} strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-col gap-1.5 pt-1">
        <h2 id={`${id}-title`} className="font-display text-ink text-title">
          {title}
        </h2>
        <div className="text-body text-ink-muted">{children}</div>
      </div>
    </>
  );
  const box = 'flex items-start gap-4 rounded-3xl border border-danger/45 bg-danger/8 p-5 sm:gap-5 sm:p-6';
  // A named <section> is a region; a <div role="alert"> may carry a name, a bare <div> may not (axe).
  return alert ? (
    <div role="alert" aria-labelledby={`${id}-title`} data-testid={testId} className={box}>
      {body}
    </div>
  ) : (
    <section aria-labelledby={`${id}-title`} data-testid={testId} className={box}>
      {body}
    </section>
  );
}

/** The checks card before inspect answers: the same four checks, each still running, so nothing moves when it does. */
function Checking() {
  const t = useT(messages);
  return (
    <section
      data-testid="sign-checking"
      aria-busy="true"
      aria-labelledby="sign-checking-title"
      className="flex flex-col gap-4 rounded-3xl border border-line bg-surface-1 p-5 sm:p-6"
    >
      <h2 id="sign-checking-title" className="font-display text-ink text-title">
        {t('checking')}
      </h2>
      <ul className="flex flex-col gap-4">
        {CHECK_IDS.map((id) => (
          <li key={id} className="flex items-start gap-3">
            <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center text-ink-muted">
              <Spinner size={18} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-body text-ink-muted">{t(CHECK_KEY[id])}</span>
              <Skeleton className="h-3 w-16" />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Invalid({ error }: { error: unknown }) {
  const t = useT(messages);
  return (
    <div data-testid="sign-invalid" className="flex flex-col gap-3">
      <Verdict id="sign-invalid" icon={Link2Off} title={t('invalid')} alert={false}>
        {t('invalidHelp')}
      </Verdict>
      <ErrorBox error={error} />
    </div>
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
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-body text-ink">{t(CHECK_KEY[id])}</span>
        <span className={cn('text-small', state === 'fail' ? 'text-danger' : 'text-ink-muted')}>{t(note)}</span>
      </span>
    </li>
  );
}

/**
 * One fact of the request. On a phone the label sits above its value, so a full address keeps two rows of five
 * groups instead of four rows of three beside a label column.
 */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center sm:gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
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
        <Verdict id="sign-refused" icon={ShieldX} title={t('refusedTitle')} testId="sign-refused">
          {t('refused')}
        </Verdict>
      ) : null}
      {view.verdict === 'simulationFailed' ? (
        <div data-testid="sign-sim-failed" className="flex flex-col gap-3">
          <Verdict id="sign-sim-failed" icon={X} title={t('simFailedTitle')}>
            {t('simFailedAll')}
          </Verdict>
          {failure && failure.ok === false ? <ErrorBox error={failure.error} testId="sign-sim-error" /> : null}
        </div>
      ) : null}
      {view.verdict === 'unproven' ? (
        <Verdict id="sign-unproven" icon={ShieldX} title={t('unprovenTitle')} testId="sign-unproven">
          {t('unproven')}
        </Verdict>
      ) : null}

      {/* What was checked, then what it was checked against: one card, the facts in its footer. */}
      <section
        aria-labelledby="sign-checks-title"
        className="overflow-hidden rounded-3xl border border-line bg-surface-1"
      >
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <h2 id="sign-checks-title" className="font-display text-ink text-title">
            {t('checksTitle')}
          </h2>
          <ul data-testid="sign-checks" className="flex flex-col gap-4">
            {checkRows(check, view, connected?.account ?? null).map((r) => (
              <CheckRow key={r.id} {...r} />
            ))}
          </ul>
        </div>
        <dl className="flex flex-col gap-4 border-line border-t bg-surface-2/40 p-5 text-small sm:p-6">
          <Fact label={t('signer')}>
            <Address address={check.from} explorer={explorer} />
          </Fact>
          <Fact label={t('chain')}>
            <span className="text-ink">{networkName(check.chainId)}</span>
          </Fact>
          {check.vault ? (
            <Fact label={t('vault')}>
              <Address address={check.vault} explorer={explorer} />
            </Fact>
          ) : null}
        </dl>
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
