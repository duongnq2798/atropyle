'use client';

import type { AssetKind, PlanCheck, TxPlan, Warning } from '@atropyle/sdk';
import { skipToken, useMutation, useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef } from 'react';
import type { Address as Addr } from 'viem';
import { CHAIN_ID } from '@/chain/hooks';
import { useSdk } from '@/chain/use-sdk';
import { IssueList } from '@/flows/editors/issue-list';
import type { AssetRow } from '@/flows/impl/create-form';
import type { Resumed } from '@/flows/impl/resume';
import type { FlowsImpl } from '@/flows/load';
import { sharesOf } from '@/flows/shares';
import { useLang, useT } from '@/i18n/provider';
import { durationWords } from '@/lib/duration';
import { formatAmount, formatBps } from '@/lib/format';
import { jsonStringify } from '@/lib/store';
import { messages as assetWords } from '@/messages/assets.messages';
import { messages as common } from '@/messages/common.messages';
import { messages } from '@/messages/create.messages';
import { messages as editors } from '@/messages/editors.messages';
import { vaultHref } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { ErrorBox } from '@/tx/error-box';
import type { MirrorToken } from '@/tx/mirror';
import { TxCard } from '@/tx/tx-card';
import { uniqueWarnings, warningKey } from '@/tx/tx-view';
import { useTxRunner } from '@/tx/use-tx-runner';
import { WarningText } from '@/tx/warning-text';
import { Address } from '@/ui/address';
import { Amount } from '@/ui/amount';
import { Banner } from '@/ui/banner';
import { Button, buttonClass } from '@/ui/button';
import { SkeletonText } from '@/ui/skeleton';
import { CHOICE_CARD, RADIO, RADIO_DOT } from '@/ui/switch';
import { UntrustedText } from '@/ui/untrusted-text';
import { connectSheet } from '@/wallet/connect-sheet-slot';
import { useWallet } from '@/wallet/provider';
import { DRILL_LIFETIME_SECONDS } from './kind';
import { formTokens, planTokens } from './plan-tokens';
import { STEP_KEY } from './progress';
import { PlanTimeMachine } from './steps';
import type { Wizard } from './use-wizard';

const SECTION_TITLE = 'font-display text-title text-ink';

/** One part of the summary: a small caption, then what it says. */
function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-line border-t py-4 first:border-t-0 first:pt-0 sm:grid-cols-[10rem_1fr] sm:gap-6">
      <p className="font-medium text-caption text-ink-muted uppercase tracking-wider sm:pt-0.5">{label}</p>
      <div className="min-w-0 space-y-3">{children}</div>
    </div>
  );
}

/** The plan in plain words, every address in full (spec §5.2 step 6). */
function PlanSummary({ wizard, explorer }: { wizard: Wizard; explorer: string | null }) {
  const t = useT(messages);
  const e = useT(editors);
  const { lang } = useLang();
  const f = wizard.state.form;
  const shares = sharesOf(f.heirs);
  const guardians = f.template === 'guarded' ? f.guardians.map((g) => g.trim()).filter((g) => g !== '') : [];
  const cfg = wizard.result.ok ? wizard.result.config : null;
  return (
    <section
      data-testid="create-summary"
      aria-label={t('stepReview')}
      className="rounded-2xl border border-line bg-surface-1 p-5 text-body text-ink sm:p-6"
    >
      <SummaryRow label={t('stepKind')}>
        <p>{f.drill ? t('sumDrill', { lifetime: durationWords(DRILL_LIFETIME_SECONDS, lang) }) : t('sumReal')}</p>
      </SummaryRow>
      <SummaryRow label={t('stepHeirs')}>
        <ul className="space-y-3">
          {f.heirs.map((h, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: heirs are positional
            <li key={i} className="space-y-1">
              <span className="block">{t('sumHeir', { n: i + 1, share: formatBps(shares[i] ?? 0) })}</span>
              <Address address={h.account.trim()} explorer={explorer} copy />
            </li>
          ))}
        </ul>
      </SummaryRow>
      <SummaryRow label={t('stepGuardians')}>
        {guardians.length === 0 ? (
          <p>{t('sumNoGuardians')}</p>
        ) : (
          <>
            <p>{t('sumGuardians', { k: cfg?.k ?? f.k, n: guardians.length })}</p>
            <ul className="space-y-1">
              {guardians.map((g) => (
                <li key={g}>
                  <Address address={g} explorer={explorer} copy />
                </li>
              ))}
            </ul>
            <p className="text-ink-muted">{f.recoveryEnabled ? t('sumRecoveryOn') : t('sumRecoveryOff')}</p>
          </>
        )}
      </SummaryRow>
      {cfg ? (
        <SummaryRow label={t('stepTiming')}>
          <p>
            {e('presetLine', {
              period: durationWords(cfg.timing.period, lang),
              threshold: cfg.timing.threshold,
              window: durationWords(cfg.timing.window, lang),
            })}
          </p>
        </SummaryRow>
      ) : null}
      <SummaryRow label={t('stepAssets')}>
        <AssetsSummary assets={f.assets} explorer={explorer} />
      </SummaryRow>
    </section>
  );
}

const KIND_KEY = {
  erc20: 'kindErc20',
  erc721: 'kindErc721',
  erc1155: 'kindErc1155',
} as const satisfies Record<AssetKind, keyof typeof assetWords.en>;

/**
 * Every asset the vault will be allowed to move, before any wallet connects: its kind, its address in full and, for
 * an NFT or a multi-token, its id and heir. The names the tokens give themselves come after the chain check.
 */
export function AssetsSummary({ assets, explorer }: { assets: readonly AssetRow[]; explorer: string | null }) {
  const t = useT(messages);
  const a = useT(assetWords);
  if (assets.length === 0) return <p>{t('sumNoAssets')}</p>;
  return (
    <>
      <p>{t('sumAssets', { n: assets.length })}</p>
      <ul className="space-y-3">
        {assets.map((x, i) => {
          const id = x.id.trim();
          const heir = Number(x.heir);
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: assets are positional, like the plan's
            <li key={i} data-testid={`create-sum-asset-${i}`} className="space-y-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-line bg-bg px-2.5 py-0.5 font-medium text-caption text-ink">
                  {a(KIND_KEY[x.kind])}
                  {x.kind !== 'erc20' && id !== '' ? ` #${id}` : ''}
                </span>
                {x.kind !== 'erc20' && Number.isInteger(heir) ? (
                  <span className="text-ink-muted text-small">{t('sumAssetHeir', { n: heir + 1 })}</span>
                ) : null}
              </p>
              <Address address={x.token.trim()} explorer={explorer} copy />
            </li>
          );
        })}
      </ul>
    </>
  );
}

const OWN_WORDS = {
  NO_GUARDIANS: 'warnNoGuardians',
  DRILL_NOT_FOR_REAL_ASSETS: 'warnDrillAssets',
  HEIR_IS_CONTRACT: 'warnHeirContract',
} as const satisfies Record<string, keyof typeof messages.en>;

/**
 * The check's warnings in the app's own words where it has them (RECOVERY_POWER through WarningText, three codes
 * here); any other in the SDK's English, as untrusted text. TOKEN_NOT_HELD is said in its token's row instead.
 */
export function CheckWarnings({ warnings }: { warnings: readonly Warning[] }) {
  const t = useT(messages);
  return (
    <>
      {uniqueWarnings([warnings])
        .filter((w) => w.code !== 'TOKEN_NOT_HELD')
        .map((w) => {
          const own = OWN_WORDS[w.code as keyof typeof OWN_WORDS];
          return (
            <Banner key={warningKey(w)} tone="warn" testId={`create-warning-${w.code}`}>
              {own ? t(own) : <WarningText warning={w} />}
            </Banner>
          );
        })}
    </>
  );
}

export function CheckResult(p: {
  check: PlanCheck;
  drill: boolean;
  feeToken: Addr | null;
  locked: boolean;
  explorer: string | null;
  /** Before prepare: once the plan is prepared, TxCard says the plan's warnings (Ruling 7). */
  showWarnings: boolean;
  onFee(a: Addr): void;
}) {
  const t = useT(messages);
  const c = useT(common);
  return (
    <div data-testid="create-checked" className="space-y-8">
      {p.showWarnings ? (
        <div className="space-y-3">
          <CheckWarnings warnings={p.check.warnings} />
        </div>
      ) : null}
      {p.check.tokens.length > 0 ? (
        <section aria-labelledby="create-tokens-title" className="space-y-3">
          <h2 id="create-tokens-title" className={SECTION_TITLE}>
            {t('tokensTitle')}
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-left text-small">
              <thead className="bg-surface-1 text-caption text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    {t('colAsset')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    {t('colHeld')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.check.tokens.map((x) => (
                  <tr key={x.index} data-testid={`create-token-row-${x.index}`} className="border-line border-t">
                    <td className="space-y-1 px-4 py-3 align-top">
                      {x.info ? (
                        <span className="voice-ledger block text-ink">
                          <UntrustedText value={x.info.name} max={32} /> (
                          <UntrustedText value={x.info.symbol} max={16} />)
                        </span>
                      ) : (
                        <span className="block text-danger">{t('notContract')}</span>
                      )}
                      <Address address={x.token} explorer={p.explorer} size="sm" />
                    </td>
                    <td className="voice-ledger px-4 py-3 align-top">
                      {x.held === null ? (
                        <span className="font-sans text-ink-muted">{t('unknown')}</span>
                      ) : x.kind === 'erc20' && x.info ? (
                        <Amount raw={x.held} decimals={x.info.decimals} symbol={x.info.symbol} />
                      ) : (
                        x.held.toString()
                      )}
                      {x.held === 0n ? (
                        <span className="mt-1 block font-sans text-caption text-grace">{t('notHeld')}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-caption text-ink-muted">{t('untrustedNote')}</p>
        </section>
      ) : null}
      <section aria-labelledby="create-fee-title" className="space-y-3">
        <h2 id="create-fee-title" className={SECTION_TITLE}>
          {t('feeTitle')}
        </h2>
        {p.drill ? (
          <p className="text-ink-muted text-small">{t('feeFree')}</p>
        ) : (
          <fieldset className="space-y-3">
            <legend className="mb-3 text-ink-muted text-small">{t('feeHelp')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {p.check.fees.tokens.map((o) => (
                <label key={o.token} className={CHOICE_CARD}>
                  <input
                    type="radio"
                    name="create-fee"
                    data-testid={`create-fee-${o.token.toLowerCase()}`}
                    checked={p.feeToken === o.token}
                    disabled={p.locked}
                    onChange={() => p.onFee(o.token)}
                    className="peer sr-only"
                  />
                  <span aria-hidden="true" data-part="radio" className={`${RADIO} mt-0.5`}>
                    <span className={RADIO_DOT} />
                  </span>
                  <span className="min-w-0 space-y-1">
                    {/* Plain text only inside a label: Amount is a button, and Address adds a copy button by default. */}
                    <span className="voice-ledger block text-ink text-lead">
                      {formatAmount(o.fee, o.decimals)}{' '}
                      {o.decimals === null ? c('baseUnits') : <UntrustedText value={o.symbol} max={16} />}
                    </span>
                    <Address address={o.token} size="sm" copy={false} avatar={false} />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </section>
    </div>
  );
}

export interface Prepared {
  plan: TxPlan;
  /** Steps of the saved payload confirmed before `plan` starts (0 for a plan prepared on this page). */
  base: number;
  /** Set when the plan was rebuilt from the saved payload after a reload (Task 8): what the resume banner says. */
  resumed?: { created: boolean; total: number };
}

function CreateTx(p: {
  prepared: Prepared;
  tokens: readonly MirrorToken[];
  onLock(locked: boolean): void;
  onOffset(offset: number): void;
  onDone(vault: Addr): void;
}) {
  const t = useT(messages);
  const { onLock, onOffset } = p;
  const { plan, base } = p.prepared;
  const runner = useTxRunner({ plan, tokens: p.tokens, onDone: () => p.onDone(plan.vault) });
  useEffect(() => onLock(runner.committed), [onLock, runner.committed]);
  // Every confirmation is saved at once: a reload right after it resumes after that step (Task 8).
  useEffect(() => {
    if (runner.confirmed > 0) onOffset(base + runner.confirmed);
  }, [onOffset, base, runner.confirmed]);
  return <TxCard runner={runner} label={t('send')} title={t('txTitle')} testId="create-tx" />;
}

export interface ReviewStepProps {
  flows: FlowsImpl;
  wizard: Wizard;
  owner: Addr | null;
  /** The wallet has the plan, or createVault already ran: nothing before this step can change. */
  frozen: boolean;
  onLock(locked: boolean): void;
  prepared: Prepared | null;
  onPrepared(p: Prepared | null): void;
}

export function ReviewStep(p: ReviewStepProps) {
  const { flows, wizard, owner, onPrepared } = p;
  const t = useT(messages);
  const sdkQuery = useSdk();
  const sdk = sdkQuery.data ?? null;
  const { openSheet } = useWallet();
  const s = wizard.state;
  const f = s.form;
  const { patch } = wizard;
  const explorer = sdk?.deployment.explorerUrl ?? null;
  const check = useQuery({
    queryKey: ['atropyle', CHAIN_ID, 'checkPlan', owner?.toLowerCase() ?? '', jsonStringify(f)],
    // Once a plan is saved the check stays as it was: the plan, not a new check, is what gets signed.
    queryFn:
      sdk && owner && s.payload === null
        ? () => sdk.atro.checkPlan(flows.formToPlan(f), { owner, drill: f.drill })
        : skipToken,
    staleTime: 30_000,
    structuralSharing: false,
  });
  const checked = check.data?.ok ? check.data : null;
  const feeToken =
    checked && !f.drill
      ? (checked.fees.tokens.find((o) => o.token === s.feeToken)?.token ?? checked.fees.tokens[0]?.token ?? null)
      : null;
  const prepare = useMutation({
    mutationFn: async () => {
      if (!sdk || !owner) throw new Error('not connected');
      return sdk.atro.prepare.createVault(flows.formToPlan(f), {
        owner,
        drill: f.drill,
        feeToken: f.drill ? undefined : (feeToken ?? undefined),
        allowance: 'exact',
        salt: s.salt,
      });
    },
    onSuccess: (plan) => {
      patch({ ...flows.savedPlan(plan), feeToken });
      onPrepared({ plan, base: 0 });
    },
  });

  // A saved plan and none on the page: the tab was reloaded (Decision 4). The chain says whether createVault ran;
  // only the steps still to send are inspected again, with the same calldata and salt, so no second vault can follow.
  // No wallet is needed for this; the wallet signs what is left.
  const saved =
    s.payload !== null && s.vault !== null && !p.prepared
      ? { payload: s.payload, vault: s.vault, createStep: s.createStep, offset: s.offset }
      : null;
  const resume = useQuery({
    queryKey: ['atropyle', CHAIN_ID, 'resume', s.vault?.toLowerCase() ?? ''],
    queryFn: sdk && saved ? () => flows.resumePlan(sdk.atro, saved, f) : skipToken,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    structuralSharing: false,
  });
  // Each answer is applied once: the plan goes to the page with what the banner says, and the session learns the
  // offset the chain proved (every step on chain: the done screen).
  const applied = useRef<Resumed | null>(null);
  useEffect(() => {
    const r = resume.data;
    if (!r || applied.current === r) return;
    applied.current = r;
    if (r.plan) onPrepared({ plan: r.plan, base: r.offset, resumed: { created: r.created, total: r.total } });
    patch(r.plan ? { offset: r.offset } : { offset: r.offset, step: 'done' });
  }, [resume.data, onPrepared, patch]);
  const resumeError = saved ? (resume.error ?? sdkQuery.error ?? null) : null;
  // A payload without its vault was written by hand: it can only be dropped.
  const orphan = s.payload !== null && s.vault === null && !p.prepared;
  const createdOnChain = s.createStep >= 0 && s.offset > s.createStep;
  return (
    <div data-testid="create-review" className="space-y-10">
      <p className="text-body text-ink-muted">{t('reviewIntro')}</p>
      <PlanSummary wizard={wizard} explorer={explorer} />
      <PlanTimeMachine flows={flows} wizard={wizard} owner={owner} />
      {!owner ? (
        <Banner
          tone="info"
          action={
            <Button
              variant="primary"
              data-testid="create-connect"
              onPointerEnter={connectSheet.preload}
              onFocus={connectSheet.preload}
              onClick={() => openSheet()}
            >
              {t('connect')}
            </Button>
          }
        >
          {t('connectFirst')}
        </Banner>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-ink-muted text-small">{t('ownerLine')}</p>
            <Address address={owner} explorer={explorer} />
          </div>
          <IssueList
            flows={flows}
            drill={f.drill}
            issues={check.data && !check.data.ok ? check.data.issues : []}
            testId="create-check-issues"
          />
        </div>
      )}
      {owner && check.isPending && check.fetchStatus !== 'idle' ? (
        <div className="space-y-2" aria-busy="true">
          <p className="text-ink-muted text-small">{t('checking')}</p>
          <SkeletonText lines={3} />
        </div>
      ) : null}
      {check.data && !check.data.ok ? (
        <div className="space-y-3">
          <p className="text-body text-danger">{t('checkFailed')}</p>
          <Button variant="secondary" onClick={() => check.data && !check.data.ok && wizard.fix(check.data.issues)}>
            {t('fixAt', { step: t(STEP_KEY[flows.firstWizardStep(check.data.issues) ?? 'assets']) })}
          </Button>
        </div>
      ) : null}
      {checked ? (
        <CheckResult
          check={checked}
          drill={f.drill}
          feeToken={feeToken}
          locked={p.prepared !== null}
          explorer={explorer}
          showWarnings={p.prepared === null}
          onFee={(a) => patch({ feeToken: a })}
        />
      ) : null}
      {checked && !p.prepared && s.payload === null ? (
        <Button
          variant="primary"
          size="lg"
          data-testid="create-prepare"
          loading={prepare.isPending}
          onClick={() => prepare.mutate()}
        >
          {t('prepare')}
        </Button>
      ) : null}
      {saved && !resumeError ? (
        <div data-testid="create-resuming" aria-busy="true" className="space-y-2">
          <p className="text-ink-muted text-small">{t('resuming')}</p>
          <SkeletonText lines={3} />
        </div>
      ) : null}
      {resumeError || orphan ? (
        <div className="space-y-3">
          <Banner
            tone="warn"
            testId="create-resume-failed"
            action={
              <div className="flex flex-wrap gap-3">
                {createdOnChain ? null : (
                  // Same salt: if the vault exists after all, the SDK refuses the new prepare; never a second vault.
                  <Button
                    variant="secondary"
                    data-testid="create-resume-discard"
                    onClick={() => patch({ payload: null, vault: null, createStep: -1, offset: 0 })}
                  >
                    {t('resumeDiscard')}
                  </Button>
                )}
                {s.vault ? (
                  // The vault may exist even when the saved offset says not: its page finishes the approvals.
                  <NavLink
                    href={vaultHref(s.vault)}
                    className={buttonClass({ variant: createdOnChain ? 'secondary' : 'ghost' })}
                  >
                    {t('resumeVault')}
                  </NavLink>
                ) : null}
              </div>
            }
          >
            {t('resumeFailed')}
          </Banner>
          {resumeError ? (
            <ErrorBox
              error={resumeError}
              testId="create-resume-error"
              onRetry={() => (resume.error ? resume.refetch() : sdkQuery.refetch())}
            />
          ) : null}
        </div>
      ) : null}
      {p.prepared?.resumed ? (
        <Banner tone="info" testId="create-resume">
          {p.prepared.resumed.created
            ? t('resumeCreated', { done: p.prepared.base, total: p.prepared.resumed.total })
            : t('resumeSame', { done: p.prepared.base, total: p.prepared.resumed.total })}
        </Banner>
      ) : null}
      {p.prepared ? (
        <CreateTx
          prepared={p.prepared}
          tokens={checked ? planTokens(checked) : formTokens(f.assets, s.feeToken)}
          onLock={p.onLock}
          onOffset={(offset) => patch({ offset })}
          onDone={(vault) => patch({ vault, step: 'done' })}
        />
      ) : null}
      {p.frozen ? <p className="text-ink-muted text-small">{t('frozen')}</p> : null}
      {check.error ? <ErrorBox error={check.error} onRetry={() => check.refetch()} /> : null}
      {prepare.error ? <ErrorBox error={prepare.error} onRetry={() => prepare.mutate()} /> : null}
    </div>
  );
}
