'use client';

import { useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import { IssueList } from '@/flows/editors/issue-list';
import type { FlowsImpl } from '@/flows/load';
import { useFlows } from '@/flows/use-flows';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { replaceHash, useLocationHash } from '@/lib/hash';
import { messages } from '@/messages/create.messages';
import { ErrorBox } from '@/tx/error-box';
import { useLeaveGuard } from '@/tx/use-leave-guard';
import { Button } from '@/ui/button';
import { SkeletonText } from '@/ui/skeleton';
import { useWallet } from '@/wallet/provider';
import type { StepsModule } from './edit-chunk';
import { useStepsChunk } from './edit-chunk';
import { useFinishChunk } from './finish-chunk';
import { KindCards } from './kind-cards';
import { Preview, PreviewStrip, usePreviewModel } from './preview';
import { ASK_KEY, Progress } from './progress';
import type { Prepared } from './review';
import { useWizard, type Wizard as WizardApi } from './use-wizard';

/** The steps from which the review and done chunk loads: it is in before the user reaches review. */
const FINISH_FROM = new Set(['assets', 'review', 'done']);

export function Wizard() {
  const t = useT(messages);
  const flowsQuery = useFlows();
  const flows = flowsQuery.data ?? null;
  const { wallet } = useWallet();
  const owner = wallet?.account ?? null;
  const w = useWizard(flows, owner);
  const hash = useLocationHash();
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [locked, setLocked] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef<string | null>(null);
  const seenHash = useRef<string | null>(null);
  const edit = useStepsChunk();
  const E = edit.data ?? null;
  const ready = flows !== null && w !== null && E !== null;
  const step = w?.state.step ?? 'kind';
  const finish = useFinishChunk(ready && FINISH_FROM.has(step));

  // Keyboard and screen reader users land on the new step's heading (not on the first render).
  useEffect(() => {
    if (shown.current !== null && shown.current !== step) heading.current?.focus();
    shown.current = step;
  }, [step]);
  useLeaveGuard(ready && step !== 'kind' && step !== 'done');

  const s = w?.state ?? null;
  // The wallet holds the plan (this tab) or createVault is on chain (saved offset): the form can no longer change.
  const frozen = locked || (s !== null && s.createStep >= 0 && s.offset > s.createStep);

  // The hash says the kind (Ruling 9): a link to #drill or #real on the first step picks it; anywhere else, and on
  // a frozen session, the session wins and the hash is written back to match it. It goes through the same guard as
  // the cards (frozen, then drop the prepared plan): a plan is never signed for a different form.
  const drill = w?.state.form.drill;
  const rawSetKind = w?.setKind;
  useEffect(() => {
    if (drill === undefined || !rawSetKind) return;
    const changed = seenHash.current !== null && seenHash.current !== hash;
    seenHash.current = hash;
    const want = drill ? '#drill' : '#real';
    if (hash === want) return;
    if (changed && !frozen && step === 'kind' && (hash === '#drill' || hash === '#real')) {
      setPrepared(null);
      rawSetKind(hash === '#drill');
    } else replaceHash(want);
  }, [hash, drill, step, frozen, rawSetKind]);

  const loadError = (!flows && flowsQuery.error) || (!E && edit.error) || null;
  if (loadError) {
    return (
      <div className="mx-auto min-h-svh max-w-6xl px-4 py-10">
        <ErrorBox
          error={loadError}
          onRetry={() => {
            if (!flows) flowsQuery.refetch();
            if (!E) edit.refetch();
          }}
        />
      </div>
    );
  }

  // An edit drops a prepared plan the wallet has not seen: a plan is never signed for a different form.
  const wizard: WizardApi | null = w
    ? {
        ...w,
        setForm: (f) => {
          if (frozen) return;
          setPrepared(null);
          w.setForm(f);
        },
        setKind: (d) => {
          if (frozen) return;
          setPrepared(null);
          w.setKind(d);
        },
      }
    : null;
  const blocking = flows && w?.showIssues ? flows.issuesThrough(w.issues, step) : [];
  const dock = step !== 'done';
  const editing = step !== 'review' && step !== 'done';
  const restart = () => {
    if (!flows || !w || !s) return;
    setPrepared(null);
    setLocked(false);
    w.patch(flows.freshState(flows.initialForm(s.form.drill), flows.newSalt()));
  };
  const F = finish.data ?? null;

  return (
    <div
      className={cn(
        'group/create mx-auto grid min-h-svh max-w-6xl gap-10 px-4 pt-8 pb-16 sm:px-6 lg:gap-14 lg:px-8 lg:pt-12',
        // The preview's column; the done screen has none, its own thread is in the page.
        dock ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : 'lg:max-w-4xl',
        dock && 'max-lg:pb-[calc(10rem+env(safe-area-inset-bottom))]',
      )}
    >
      <section
        data-testid="create"
        data-step={step}
        data-ready={ready ? 'true' : 'false'}
        aria-busy={ready ? undefined : true}
        aria-labelledby="create-step-title"
        className="min-w-0 space-y-8"
      >
        <Progress step={step} locked={!ready || frozen || step === 'done'} onGo={(x) => w?.goTo(x)} />
        <h1
          id="create-step-title"
          ref={heading}
          tabIndex={-1}
          className="max-w-[20ch] text-balance font-display text-h1 text-ink outline-none"
        >
          {t(ASK_KEY[step])}
        </h1>
        {/* In the page once the flow chunk is in, empty until Next finds something (7A rule 19): the first list is read. */}
        {flows && s ? <IssueList flows={flows} drill={s.form.drill} issues={blocking} testId="create-issues" /> : null}
        {!wizard || !flows || !E ? (
          // The prerendered frame: the real first step, the hash holds the pick until the flow chunks load.
          <KindCards drill={hash !== '#real'} onPick={(d) => replaceHash(d ? '#drill' : '#real')} />
        ) : (
          <Steps steps={E} flows={flows} wizard={wizard} owner={owner} />
        )}
        {wizard && flows && (step === 'review' || step === 'done') ? (
          F ? (
            step === 'review' ? (
              <F.ReviewStep
                flows={flows}
                wizard={wizard}
                owner={owner}
                frozen={frozen}
                onLock={setLocked}
                prepared={prepared}
                onPrepared={setPrepared}
              />
            ) : wizard.state.vault ? (
              <F.DoneStep flows={flows} vault={wizard.state.vault} form={wizard.state.form} onRestart={restart} />
            ) : null
          ) : finish.error ? (
            <ErrorBox error={finish.error} onRetry={() => finish.refetch()} testId="create-finish-error" />
          ) : (
            <div aria-busy="true" className="space-y-2">
              <p className="sr-only">{t('finishLoading')}</p>
              <SkeletonText lines={4} />
            </div>
          )
        ) : null}
        {dock ? (
          <div
            data-testid="create-dock"
            // globals.css keeps a focused field clear of the dock below lg (scroll-padding, WCAG 2.4.11).
            data-create-dock=""
            className={cn(
              'max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-line max-lg:border-t',
              'max-lg:bg-bg max-lg:pb-[env(safe-area-inset-bottom)] lg:border-line lg:border-t lg:pt-6',
            )}
          >
            {wizard && flows ? <DockStrip flows={flows} wizard={wizard} /> : null}
            <div className="flex items-center justify-between gap-3 max-lg:px-4 max-lg:py-3">
              {step !== 'kind' ? (
                <Button variant="ghost" data-testid="create-back" disabled={frozen} onClick={() => w?.back()}>
                  {t('back')}
                </Button>
              ) : (
                <span />
              )}
              {editing ? (
                <Button
                  variant="primary"
                  size="lg"
                  data-testid="create-next"
                  disabled={!ready}
                  onClick={() => w?.next()}
                >
                  {step === 'assets' ? t('toReview') : t('next')}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
      {wizard && flows && step !== 'done' ? <AsidePreview flows={flows} wizard={wizard} /> : null}
    </div>
  );
}

function Steps({
  steps: S,
  ...props
}: {
  steps: StepsModule;
  flows: FlowsImpl;
  wizard: WizardApi;
  owner: Address | null;
}) {
  const step = props.wizard.state.step;
  return (
    <>
      {step === 'kind' ? <KindCards drill={props.wizard.state.form.drill} onPick={props.wizard.setKind} /> : null}
      {step === 'heirs' ? <S.HeirsStep {...props} /> : null}
      {step === 'guardians' ? <S.GuardiansStep {...props} /> : null}
      {step === 'timing' ? <S.TimingStep {...props} /> : null}
      {step === 'assets' ? <S.AssetsStep {...props} /> : null}
    </>
  );
}

function DockStrip({ flows, wizard }: { flows: FlowsImpl; wizard: WizardApi }) {
  const model = usePreviewModel(flows, wizard.state.form);
  return <PreviewStrip model={model} step={wizard.state.step} vault={wizard.state.vault} />;
}

function AsidePreview({ flows, wizard }: { flows: FlowsImpl; wizard: WizardApi }) {
  const model = usePreviewModel(flows, wizard.state.form);
  return <Preview model={model} step={wizard.state.step} vault={wizard.state.vault} />;
}
