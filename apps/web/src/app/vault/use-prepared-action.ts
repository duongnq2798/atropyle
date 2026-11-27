'use client';

import type { PlanIssue, TxPlan, VaultAction } from '@atropyle/sdk';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import type { Sdk } from '@/chain/types';
import type { FlowsImpl } from '@/flows/load';
import { jsonStringify } from '@/lib/store';

export interface RunProgress {
  committed: boolean;
  finished: boolean;
}

export interface PreparedActionOptions {
  sdk: Sdk | null;
  flows: FlowsImpl;
  vault: Address;
  action: VaultAction;
  as: Address | null;
  /** Prepare as soon as the action is known (the check-in ritual): the TxCard comes without a first button. */
  auto?: boolean;
}

export interface PreparedAction {
  plan: TxPlan | null;
  /** A new number for every plan: the key of the component that runs it, so a runner never outlives its plan. */
  planId: number;
  busy: boolean;
  error: unknown;
  issues: PlanIssue[];
  /** The wallet accepted part of the plan: no Start over, and a changed action does not drop it. */
  locked: boolean;
  /** A prepare is running, or a plan is on screen and not finished. */
  held: boolean;
  prepare(): void;
  reset(): void;
  /**
   * Start over: drops the plan and, in auto mode, prepares the same action again. reset() alone leaves an auto
   * action on "Preparing…" for good, since auto prepares once per context.
   */
  again(): void;
  report(p: RunProgress): void;
}

const IDLE: RunProgress = { committed: false, finished: false };

/**
 * One vault action, with the semantics of the old ActionRunner (Quyết định 16): the SDK prepares on demand
 * (simulation, summary, warnings); a plan for another action, account or vault is dropped unless the wallet already
 * accepted part of it, because a fresh prepare would send the same action again.
 */
export function usePreparedAction(o: PreparedActionOptions): PreparedAction {
  const { sdk, flows, vault, action, as, auto = false } = o;
  const ctx = `${vault}|${as ?? ''}|${jsonStringify(action)}`;
  const [plan, setPlan] = useState<TxPlan | null>(null);
  const [planCtx, setPlanCtx] = useState('');
  const [planId, setPlanId] = useState(0);
  const [progress, setProgress] = useState<RunProgress>(IDLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // The lock protects a partly sent plan only; a finished plan has nothing left to protect.
  const locked = progress.committed && !progress.finished;
  const latest = useRef(ctx);
  latest.current = ctx;

  const reset = useCallback(() => {
    setPlan(null);
    setProgress(IDLE);
  }, []);

  // The context and the lock are triggers: a stale plan goes, never while locked; when the lock opens (a rejection
  // before any hash) this runs again and drops it.
  useEffect(() => {
    if (locked) return;
    setError(null);
    if (plan !== null && planCtx !== ctx) reset();
  }, [ctx, locked, plan, planCtx, reset]);

  const run = useCallback(async () => {
    if (!sdk || !as) return;
    const started = latest.current;
    setBusy(true);
    setError(null);
    try {
      const p = await sdk.atro.vault(vault).prepare(action, { as });
      // The screen may have changed while the SDK was preparing: a plan that differs from it is never shown.
      if (latest.current !== started) return;
      setPlan(p);
      setPlanCtx(started);
      setPlanId((n) => n + 1);
      setProgress(IDLE);
    } catch (e) {
      if (latest.current === started) setError(e);
    } finally {
      setBusy(false);
    }
  }, [sdk, as, vault, action]);

  const prepare = useCallback(() => {
    void run();
  }, [run]);

  // Auto mode prepares once per context; a failure waits for the retry button instead of looping.
  const autoCtx = useRef('');
  useEffect(() => {
    if (!auto || !sdk || !as || plan !== null || busy || autoCtx.current === ctx) return;
    autoCtx.current = ctx;
    void run();
  }, [auto, sdk, as, plan, busy, ctx, run]);

  const again = useCallback(() => {
    autoCtx.current = '';
    reset();
  }, [reset]);

  const report = useCallback((p: RunProgress) => {
    setProgress((q) => (q.committed === p.committed && q.finished === p.finished ? q : p));
  }, []);

  return {
    plan,
    planId,
    busy,
    error,
    issues: error ? flows.planIssues(error) : [],
    locked,
    held: busy || (plan !== null && !progress.finished),
    prepare,
    reset,
    again,
    report,
  };
}
