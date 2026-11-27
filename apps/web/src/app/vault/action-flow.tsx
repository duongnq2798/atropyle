'use client';

import type { SendResult, TxPlan, VaultAction } from '@atropyle/sdk';
import { type MutableRefObject, type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import type { Address } from 'viem';
import type { Sdk } from '@/chain/types';
import { IssueList } from '@/flows/editors/issue-list';
import type { FlowsImpl } from '@/flows/load';
import { useT } from '@/i18n/provider';
import { focusInView } from '@/lib/focus';
import { messages } from '@/messages/action-runner.messages';
import { ErrorBox } from '@/tx/error-box';
import { HoldCardShape, holdShaped } from '@/tx/hold-card-shape';
import type { MirrorToken } from '@/tx/mirror';
import { TxCard } from '@/tx/tx-card';
import { useTxRunner } from '@/tx/use-tx-runner';
import { Button, type ButtonVariant } from '@/ui/button';
import type { HoldWords } from '@/ui/hold-button';
import { SkeletonText } from '@/ui/skeleton';
import { type RunProgress, usePreparedAction } from './use-prepared-action';

/** `sent`: a transaction of the plan left the wallet and waits for its block (a step row is `pending`). */
export type FlowProgress = RunProgress & { busy: boolean; sent: boolean };

export interface ActionFlowProps {
  flows: FlowsImpl;
  sdk: Sdk;
  vault: Address;
  /** The vault is a Drill: the issue list words its limits for one (IssueList). */
  drill: boolean;
  action: VaultAction;
  as: Address;
  label: string;
  testId: string;
  title?: ReactNode;
  confirm?: 'click' | 'hold';
  tone?: 'thread' | 'danger';
  hold?: HoldWords;
  /** Where the hold stands on its TxCard: `top` is the check-in ritual's, straight under the card's heading. */
  holdPlacement?: 'end' | 'top';
  variant?: ButtonVariant;
  auto?: boolean;
  /** Its button was pressed before this chunk loaded (LazyActionFlow): prepare once, as the press asked. */
  pressed?: boolean;
  disabled?: boolean;
  /** The assets the plan may approve, for the wallet mirror (useTxRunner `tokens`): Task 10's coverage fix. */
  tokens?: readonly MirrorToken[];
  /** The Receipt's footer: the page's next step. */
  receiptFooter?: ReactNode;
  /** The TxCard stands under a heading that already names the action: its own heading one step smaller (TxCard). */
  nested?: boolean;
  /** Offer "Start over" while a plan is held (default). False once a one-shot send is done: nothing to start over. */
  resettable?: boolean;
  /** The reset button's words in place of "Start over": the check-in ritual's "Check in again" once tied. */
  resetLabel?: string;
  onDone?(r: SendResult): void;
  onPlan?(held: boolean): void;
  onProgress?(p: FlowProgress): void;
  /** Start over was pressed: the page lets go of what it kept from the last plan (a receipt it showed, a done card). */
  onReset?(): void;
}

function ActionTx(p: {
  plan: TxPlan;
  label: string;
  title?: ReactNode;
  testId: string;
  confirm?: 'click' | 'hold';
  tone?: 'thread' | 'danger';
  hold?: HoldWords;
  holdPlacement?: 'end' | 'top';
  tokens?: readonly MirrorToken[];
  receiptFooter?: ReactNode;
  nested?: boolean;
  /** The flow's root and its pending focus move (ActionFlow): the card takes it once it is on the page. */
  root: MutableRefObject<HTMLDivElement | null>;
  want: MutableRefObject<boolean>;
  onDone(r: SendResult): void;
  onProgress(p: FlowProgress): void;
}) {
  const runner = useTxRunner({ plan: p.plan, onDone: p.onDone, tokens: p.tokens });
  const { root, want, testId } = p;
  // Prepare or Start over was pressed with focus in the flow, and the button went with the plan's arrival: Send takes
  // focus as soon as it can be pressed, the heading until then. After every render, since Send comes with the runner
  // (it waits for the mirror); a reader who moved elsewhere keeps their place.
  useLayoutEffect(() => {
    if (!want.current) return;
    const r = root.current;
    if (!r) return;
    const heading = r.querySelector<HTMLElement>(`[data-testid="${testId}"] h3`);
    const a = document.activeElement;
    if (!(a === null || a === document.body || a === r || (heading !== null && a === heading))) {
      want.current = false;
      return;
    }
    const send = r.querySelector<HTMLButtonElement>(`[data-testid="${testId}-send"]`);
    if (send && !send.disabled) {
      want.current = false;
      focusInView(send);
    } else if (heading && a !== heading) {
      focusInView(heading);
    }
  });
  const report = useRef(p.onProgress);
  report.current = p.onProgress;
  const finished = runner.result !== null;
  const sent = runner.view.rows.some((r) => r.phase === 'pending');
  useEffect(() => {
    report.current({ committed: runner.committed, finished, busy: runner.busy, sent });
  }, [runner.committed, finished, runner.busy, sent]);
  return (
    <TxCard
      runner={runner}
      label={p.label}
      title={p.title}
      confirm={p.confirm}
      tone={p.tone}
      hold={p.hold}
      holdPlacement={p.holdPlacement}
      receiptFooter={p.receiptFooter}
      nested={p.nested}
      testId={p.testId}
    />
  );
}

/**
 * A button that prepares one vault action, then the TxCard that signs it (Quyết định 16). The issue list is on the
 * page from the first paint (7A rule 19); empty, it takes no room.
 */
export function ActionFlow(p: ActionFlowProps) {
  const t = useT(messages);
  const a = usePreparedAction({ sdk: p.sdk, flows: p.flows, vault: p.vault, action: p.action, as: p.as, auto: p.auto });
  const onPlan = useRef(p.onPlan);
  onPlan.current = p.onPlan;
  useEffect(() => {
    onPlan.current?.(a.held);
  }, [a.held]);
  const root = useRef<HTMLDivElement>(null);
  // A press that takes its own button away (Prepare, Start over) with focus in the flow: the focus follows to what
  // comes next instead of falling to <body>. A press kept by LazyActionFlow had focus on the button that is gone.
  const want = useRef(p.pressed === true);
  const focusWasHere = () => root.current?.contains(document.activeElement) === true;
  const pressed = useRef(p.pressed);
  const prepare = a.prepare;
  useEffect(() => {
    if (!pressed.current) return;
    pressed.current = false;
    prepare();
  }, [prepare]);
  // No plan on screen: while it prepares the flow itself holds focus; at rest, its button does (or, disabled, the flow).
  // A plan on screen places it itself (ActionTx).
  useLayoutEffect(() => {
    if (!want.current || a.plan) return;
    const r = root.current;
    if (!r) return;
    const at = document.activeElement;
    const free = at === null || at === document.body || at === r;
    if (!free) {
      if (!r.contains(at)) want.current = false;
      return;
    }
    if (a.busy || (p.auto && !a.error)) {
      if (at !== r) r.focus({ preventScroll: true });
      return;
    }
    want.current = false;
    const b = r.querySelector<HTMLButtonElement>(`[data-testid="${p.testId}"]`);
    if (b && !b.disabled) focusInView(b);
    else if (at !== r) r.focus({ preventScroll: true });
  }, [a.plan, a.busy, a.error, p.auto, p.testId]);
  const onProgress = (x: FlowProgress) => {
    a.report(x);
    p.onProgress?.(x);
  };
  return (
    // tabIndex -1: the flow holds focus while a press it took away waits for what comes next (no tab stop).
    <div ref={root} tabIndex={-1} className="flex flex-col gap-4 outline-none [&>[role=alert]:empty]:hidden">
      {a.plan ? (
        <>
          <ActionTx
            key={a.planId}
            plan={a.plan}
            label={p.label}
            title={p.title}
            testId={`${p.testId}-tx`}
            confirm={p.confirm}
            tone={p.tone}
            hold={p.hold}
            holdPlacement={p.holdPlacement}
            tokens={p.tokens}
            receiptFooter={p.receiptFooter}
            nested={p.nested}
            root={root}
            want={want}
            onDone={(r) => p.onDone?.(r)}
            onProgress={onProgress}
          />
          {a.locked || p.resettable === false ? null : (
            // -ml-3 takes back the ghost's own px-3: its words stand on the card's content edge, not 12 px in.
            <Button
              variant="ghost"
              size="sm"
              className="-ml-3 self-start"
              data-testid={`${p.testId}-reset`}
              onClick={() => {
                want.current = focusWasHere();
                a.again();
                p.onReset?.();
              }}
            >
              {p.resetLabel ?? t('startOver')}
            </Button>
          )}
        </>
      ) : p.auto && !a.error ? (
        // A hold up front with its face (the check-in ritual) stands where it will be, its card around it; any other
        // auto flow waits as a line of text.
        <div data-testid={`${p.testId}-preparing`} aria-busy="true" className="flex flex-col gap-2">
          {holdShaped(p) ? (
            <HoldCardShape title={p.title} nested={p.nested} tone={p.tone} face={p.hold?.face} hint={p.hold?.hint} />
          ) : (
            <>
              <p className="text-small text-ink-muted">{t('preparing')}</p>
              <SkeletonText lines={2} />
            </>
          )}
        </div>
      ) : (
        // `loading`, not `disabled`: a keyboard user who pressed it keeps their place (Button).
        <Button
          variant={p.variant ?? 'primary'}
          size="lg"
          className="self-start"
          data-testid={p.testId}
          loading={a.busy}
          loadingLabel={t('preparing')}
          disabled={p.disabled}
          onClick={() => {
            want.current = focusWasHere();
            a.prepare();
          }}
        >
          {p.auto ? t('retry') : p.label}
        </Button>
      )}
      <IssueList flows={p.flows} drill={p.drill} issues={a.issues} testId={`${p.testId}-issues`} />
      {a.error && a.issues.length === 0 ? <ErrorBox error={a.error} testId={`${p.testId}-error`} /> : null}
    </div>
  );
}
