import { type PlanCheck, type PlanIssue, type TxPlan, validatePlan } from '@atropyle/sdk';
import { useEffect, useState } from 'preact/hooks';
import type { Address } from 'viem';
import {
  type CreateForm,
  circuitShortcut,
  firstStepWithIssue,
  formToPlan,
  initialForm,
  issuesFor,
  issuesUpTo,
  removeHeir,
  STEPS,
  type StepId,
  type Template,
  tokenChoices,
} from '../lib/create-form';
import { formatAmount } from '../lib/format';
import { telegramLink } from '../lib/links';
import { href } from '../lib/route';
import type { Sdk } from '../lib/sdk';
import { uniqueWarnings, warningKey } from '../lib/tx-view';
import { useApp, useT } from '../ui/app-context';
import { messages as common } from '../ui/common.messages';
import { AddressText, Banner, ErrorBox, TokenAmount, UntrustedText } from '../ui/components';
import { AssetsEditor, GuardiansEditor, HeirsEditor, IssueList, TimingEditor } from '../ui/editors';
import { TxRunner } from '../ui/tx-runner';
import { messages } from './create.messages';

type CreateKey = keyof typeof messages.en;

const STEP_KEY = {
  template: 'stepTemplate',
  people: 'stepPeople',
  timing: 'stepTiming',
  assets: 'stepAssets',
} as const satisfies Record<StepId, CreateKey>;

function TemplateStep({ form, onChange }: { form: CreateForm; onChange: (f: CreateForm) => void }) {
  const t = useT(messages);
  const option = (value: Template, label: CreateKey, help: CreateKey) => (
    <label class="field">
      <span class="row">
        <input
          type="radio"
          name="create-template"
          data-testid={`create-template-${value}`}
          checked={form.template === value}
          onChange={() => onChange({ ...form, template: value })}
        />
        <strong>{t(label)}</strong>
      </span>
      <span class="muted">{t(help)}</span>
    </label>
  );
  return (
    <fieldset class="stack">
      <legend>{t('stepTemplate')}</legend>
      {option('simple', 'templateSimple', 'templateSimpleHelp')}
      {option('guarded', 'templateGuarded', 'templateGuardedHelp')}
    </fieldset>
  );
}

function CheckResult(props: {
  locked: boolean;
  check: PlanCheck;
  drill: boolean;
  explorer: string | null;
  feeToken: Address | null;
  onFeeToken: (a: Address) => void;
}) {
  const { check, drill, explorer, feeToken, locked, onFeeToken } = props;
  const t = useT(messages);
  const c = useT(common);
  return (
    <div class="stack" data-testid="create-checked">
      {uniqueWarnings([check.warnings]).map((w) => (
        <Banner kind="warn" key={warningKey(w)} testid={`create-warning-${w.code}`}>
          {w.message}
        </Banner>
      ))}
      <h3>{t('tokensTitle')}</h3>
      {check.tokens.length === 0 ? (
        <p class="muted">{t('noAssets')}</p>
      ) : (
        <>
          <table class="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('colAsset')}</th>
                <th>{t('colHeld')}</th>
              </tr>
            </thead>
            <tbody>
              {check.tokens.map((x) => (
                <tr key={x.index} data-testid={`create-token-${x.index}`}>
                  <td>{x.index + 1}</td>
                  <td class="stack">
                    <AddressText address={x.token} explorer={explorer} />
                    {x.info ? (
                      <span>
                        <UntrustedText value={x.info.name} max={32} /> (<UntrustedText value={x.info.symbol} max={16} />
                        )
                      </span>
                    ) : (
                      <span class="muted">{t('notContract')}</span>
                    )}
                  </td>
                  <td>
                    {x.held === null ? (
                      c('unknown')
                    ) : x.kind === 'erc20' && x.info ? (
                      <TokenAmount raw={x.held} token={x.info} />
                    ) : (
                      <span class="mono">{x.held.toString()}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="muted">{c('untrustedNote')}</p>
        </>
      )}
      <h3>{t('feeTitle')}</h3>
      {drill ? (
        <p>{t('feeFree')}</p>
      ) : (
        <fieldset class="stack">
          <legend class="muted">{t('feeHelp')}</legend>
          {check.fees.tokens.map((o) => (
            <label class="row" key={o.token}>
              <input
                type="radio"
                name="create-fee"
                data-testid={`create-fee-${o.token.toLowerCase()}`}
                checked={feeToken === o.token}
                disabled={locked}
                onChange={() => onFeeToken(o.token)}
              />
              <span class="mono">
                {formatAmount(o.fee, o.decimals)}{' '}
                {o.decimals === null ? c('baseUnits') : <UntrustedText value={o.symbol} max={16} />}
              </span>
              <AddressText address={o.token} />
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}

/** `plan` lives in CreatePage so it survives this component; while it exists, the fee choice is locked. */
export function Review(props: {
  sdk: Sdk;
  form: CreateForm;
  owner: Address;
  plan: TxPlan | null;
  onPlan: (p: TxPlan | null) => void;
  onProgress: (p: { confirmed: number; committed: boolean }) => void;
  onIssues: (issues: PlanIssue[]) => void;
  onCreated: (vault: Address) => void;
}) {
  const { sdk, form, owner, plan, onPlan, onProgress, onIssues, onCreated } = props;
  const t = useT(messages);
  const [check, setCheck] = useState<PlanCheck | null>(null);
  const [feeToken, setFeeToken] = useState<Address | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const explorer = sdk.deployment.explorerUrl;

  // Any edit or another account invalidates what was checked and prepared.
  useEffect(() => {
    setCheck(null);
    setError(null);
  }, [form, owner]);

  const runCheck = async () => {
    setBusy(true);
    setError(null);
    try {
      const input = formToPlan(form);
      const local = validatePlan(input, { owner, drill: form.drill });
      if (!local.ok) {
        onIssues(local.issues);
        return;
      }
      const r = await sdk.atro.checkPlan(input, { owner, drill: form.drill });
      if (!r.ok) {
        onIssues(r.issues);
        return;
      }
      setCheck(r);
      setFeeToken(r.fees.tokens[0]?.token ?? null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const runPrepare = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await sdk.atro.prepare.createVault(formToPlan(form), {
        owner,
        drill: form.drill,
        feeToken: form.drill ? undefined : (feeToken ?? undefined),
        allowance: 'exact',
      });
      onPlan(p);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="stack" data-testid="create-review">
      <p>
        {t('ownerLine')} <AddressText address={owner} explorer={explorer} />
      </p>
      {check ? (
        <CheckResult
          check={check}
          drill={form.drill}
          explorer={explorer}
          feeToken={feeToken}
          locked={plan !== null}
          onFeeToken={setFeeToken}
        />
      ) : (
        <button type="button" class="btn btn-primary" data-testid="create-check" disabled={busy} onClick={runCheck}>
          {busy ? t('checking') : t('review')}
        </button>
      )}
      {check && !plan ? (
        <button type="button" class="btn btn-primary" data-testid="create-prepare" disabled={busy} onClick={runPrepare}>
          {busy ? t('preparing') : t('prepare')}
        </button>
      ) : null}
      {plan ? (
        <TxRunner
          plan={plan}
          label={t('send')}
          testid="create-tx"
          onProgress={onProgress}
          onDone={() => onCreated(plan.vault)}
        />
      ) : null}
      {error ? <ErrorBox error={error} /> : null}
    </div>
  );
}

function Created({ vault }: { vault: Address }) {
  const app = useApp();
  const t = useT(messages);
  const bot = app.env.telegramBot;
  return (
    <Banner kind="info" testid="create-created">
      <p>
        <strong>{t('created')}</strong> <AddressText address={vault} />
      </p>
      <p class="row">
        <a class="btn btn-primary" data-testid="create-open-vault" href={href({ name: 'vault', vault })}>
          {t('openVault')}
        </a>
        {bot ? (
          <a class="btn" href={telegramLink(bot, vault, 'owner')} target="_blank" rel="noopener noreferrer">
            {t('telegram')}
          </a>
        ) : null}
      </p>
    </Banner>
  );
}

export function CreatePage({ sdk, drill }: { sdk: Sdk; drill: boolean }) {
  const app = useApp();
  const t = useT(messages);
  const c = useT(common);
  const [form, setFormState] = useState<CreateForm>(() => initialForm(drill));
  const [step, setStep] = useState<StepId>('template');
  const [issues, setIssues] = useState<PlanIssue[]>([]);
  const [created, setCreated] = useState<Address | null>(null);
  // The prepared plan and how many of its steps are confirmed. A plan with a confirmed step is never discarded:
  // a new one would carry a fresh salt and create (and charge for) a second vault.
  const [plan, setPlan] = useState<TxPlan | null>(null);
  const [progress, setProgress] = useState({ confirmed: 0, committed: false });
  const account = app.wallet?.account ?? null;
  const index = STEPS.indexOf(step);
  const shown = issuesFor(step, issues);
  const locked = plan !== null;
  // The switch mounts a fresh wizard: it would lose the remaining steps of a plan the wallet already accepted.
  const switchable = !progress.committed || created !== null;
  const preparePlan = (p: TxPlan | null) => {
    setPlan(p);
    setProgress({ confirmed: 0, committed: false });
  };

  const setForm = (f: CreateForm) => {
    setFormState(f);
    setIssues([]);
  };
  const showIssues = (list: PlanIssue[]) => {
    setIssues(list);
    setStep(firstStepWithIssue(list) ?? step);
  };
  const next = () => {
    const r = validatePlan(formToPlan(form), { owner: account, drill: form.drill });
    const blocking = r.ok ? [] : issuesUpTo(step, r.issues);
    if (blocking.length > 0) {
      showIssues(blocking);
      return;
    }
    setIssues([]);
    setStep(STEPS[index + 1]);
  };
  const back = () => {
    setIssues([]);
    setStep(STEPS[index - 1]);
  };

  return (
    <div class="stack" data-testid="create">
      <h1>{drill ? t('titleDrill') : t('title')}</h1>
      {drill ? (
        <Banner kind="info" testid="create-drill-banner">
          {t('drillBanner')}{' '}
          {switchable ? <a href={href({ name: 'create', drill: false })}>{t('switchToReal')}</a> : null}
        </Banner>
      ) : (
        <Banner kind="warn" testid="create-real-banner">
          {t('realBanner')}{' '}
          {switchable ? <a href={href({ name: 'create', drill: true })}>{t('switchToDrill')}</a> : null}
        </Banner>
      )}
      {created ? <Created vault={created} /> : null}
      <ol class="steps">
        {STEPS.map((s) => (
          <li key={s} class={s === step ? 'step-active' : undefined} data-testid={`create-step-${s}`}>
            {t(STEP_KEY[s])}
          </li>
        ))}
      </ol>
      {created ? null : (
        <section class="card stack">
          <IssueList issues={shown} testid="create-issues" />
          {locked ? (
            progress.committed ? (
              <Banner kind="info" testid="create-plan-locked">
                {t('planLocked')}
              </Banner>
            ) : (
              <div class="row">
                <span class="muted">{t('planPrepared')}</span>
                <button type="button" class="btn" data-testid="create-change-plan" onClick={() => preparePlan(null)}>
                  {t('changePlan')}
                </button>
              </div>
            )
          ) : null}
          <fieldset class="stack" disabled={locked} data-testid="create-editors">
            {step === 'template' ? <TemplateStep form={form} onChange={setForm} /> : null}
            {step === 'people' ? (
              <>
                <HeirsEditor
                  rows={form.heirs}
                  issues={shown}
                  testid="create"
                  onChange={(heirs) => setForm({ ...form, heirs })}
                  onRemove={(i) => setForm(removeHeir(form, i))}
                />
                {form.template === 'guarded' ? (
                  <GuardiansEditor
                    value={{ guardians: form.guardians, k: form.k, recoveryEnabled: form.recoveryEnabled }}
                    issues={shown}
                    testid="create"
                    onChange={(g) => setForm({ ...form, ...g })}
                  />
                ) : null}
              </>
            ) : null}
            {step === 'timing' ? (
              <TimingEditor
                value={form.timing}
                drill={form.drill}
                issues={shown}
                testid="create"
                onChange={(timing) => setForm({ ...form, timing })}
              />
            ) : null}
            {step === 'assets' ? (
              <AssetsEditor
                rows={form.assets}
                heirs={form.heirs.length}
                choices={tokenChoices(sdk.deployment)}
                circuit={circuitShortcut(sdk.deployment)}
                issues={shown}
                testid="create"
                onChange={(assets) => setForm({ ...form, assets })}
              />
            ) : null}
          </fieldset>
          <div class="row">
            {index > 0 && !locked ? (
              <button type="button" class="btn" data-testid="create-back" onClick={back}>
                {c('back')}
              </button>
            ) : null}
            {index < STEPS.length - 1 && !locked ? (
              <button type="button" class="btn btn-primary" data-testid="create-next" onClick={next}>
                {c('next')}
              </button>
            ) : null}
          </div>
        </section>
      )}
      {step === 'assets' ? (
        <section class="card stack">
          {account || plan ? (
            <Review
              sdk={sdk}
              form={form}
              owner={plan ? plan.from : (account as Address)}
              plan={plan}
              onPlan={preparePlan}
              onProgress={setProgress}
              onIssues={showIssues}
              onCreated={setCreated}
            />
          ) : (
            <p class="muted" data-testid="create-connect">
              {t('connectToReview')}
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
