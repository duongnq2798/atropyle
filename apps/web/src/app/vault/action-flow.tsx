'use client';

import type { SendResult, TxPlan, VaultAction } from '@atropyle/sdk';
import { type ReactNode, useEffect, useRef } from 'react';
import type { Address } from 'viem';
import type { Sdk } from '@/chain/types';
import { IssueList } from '@/flows/editors/issue-list';
import type { FlowsImpl } from '@/flows/load';
import { useT } from '@/i18n/provider';
import { messages } from '@/messages/action-runner.messages';
import { ErrorBox } from '@/tx/error-box';
import type { MirrorToken } from '@/tx/mirror';
import { TxCard } from '@/tx/tx-card';
import { useTxRunner } from '@/tx/use-tx-runner';
import { Button, type ButtonVariant } from '@/ui/button';
import { SkeletonText } from '@/ui/skeleton';
import { type RunProgress, usePreparedAction } from './use-prepared-action';

export type FlowProgress = RunProgress & { busy: boolean };

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
  variant?: ButtonVariant;
  auto?: boolean;
  /** Its button was pressed before this chunk loaded (LazyActionFlow): prepare once, as the press asked. */
  pressed?: boolean;
  disabled?: boolean;
  /** The assets the plan may approve, for the wallet mirror (useTxRunner `tokens`): Task 10's coverage fix. */
  tokens?: readonly MirrorToken[];
  /** The Receipt's footer: the page's next step. */
  receiptFooter?: ReactNode;
  onDone?(r: SendResult): void;
  onPlan?(held: boolean): void;
  onProgress?(p: FlowProgress): void;
}

function ActionTx(p: {
  plan: TxPlan;
  label: string;
  title?: ReactNode;
  testId: string;
  confirm?: 'click' | 'hold';
  tone?: 'thread' | 'danger';
  tokens?: readonly MirrorToken[];
  receiptFooter?: ReactNode;
  onDone(r: SendResult): void;
  onProgress(p: FlowProgress): void;
}) {
  const runner = useTxRunner({ plan: p.plan, onDone: p.onDone, tokens: p.tokens });
  const report = useRef(p.onProgress);
  report.current = p.onProgress;
  const finished = runner.result !== null;
  useEffect(() => {
    report.current({ committed: runner.committed, finished, busy: runner.busy });
  }, [runner.committed, finished, runner.busy]);
  return (
    <TxCard
      runner={runner}
      label={p.label}
      title={p.title}
      confirm={p.confirm}
      tone={p.tone}
      receiptFooter={p.receiptFooter}
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
  const pressed = useRef(p.pressed);
  const prepare = a.prepare;
  useEffect(() => {
    if (!pressed.current) return;
    pressed.current = false;
    prepare();
  }, [prepare]);
  const onProgress = (x: FlowProgress) => {
    a.report(x);
    p.onProgress?.(x);
  };
  return (
    <div className="flex flex-col gap-4 [&>[role=alert]:empty]:hidden">
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
            tokens={p.tokens}
            receiptFooter={p.receiptFooter}
            onDone={(r) => p.onDone?.(r)}
            onProgress={onProgress}
          />
          {a.locked ? null : (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              data-testid={`${p.testId}-reset`}
              onClick={a.reset}
            >
              {t('startOver')}
            </Button>
          )}
        </>
      ) : p.auto && !a.error ? (
        <div data-testid={`${p.testId}-preparing`} aria-busy="true" className="flex flex-col gap-2">
          <p className="text-small text-ink-muted">{t('preparing')}</p>
          <SkeletonText lines={2} />
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
          onClick={a.prepare}
        >
          {p.auto ? t('retry') : p.label}
        </Button>
      )}
      <IssueList flows={p.flows} drill={p.drill} issues={a.issues} testId={`${p.testId}-issues`} />
      {a.error && a.issues.length === 0 ? <ErrorBox error={a.error} testId={`${p.testId}-error`} /> : null}
    </div>
  );
}
