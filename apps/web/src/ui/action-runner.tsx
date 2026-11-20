import { type SendResult, stringify, type TxPlan, type VaultAction } from '@atropyle/sdk';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Address } from 'viem';
import type { Sdk } from '../lib/sdk';
import { planIssues } from '../lib/vault-view';
import { messages } from './action-runner.messages';
import { useT } from './app-context';
import { ErrorBox } from './components';
import { IssueList } from './editors';
import { TxRunner } from './tx-runner';

const BUTTON = { primary: 'btn btn-primary', big: 'btn btn-primary btn-big', danger: 'btn btn-danger' } as const;

/**
 * One vault action: on click the SDK prepares it (simulation, summary, warnings), then TxRunner signs it.
 *
 * Once the wallet has accepted a transaction of the plan, the plan can no longer be replaced: Start over disappears and
 * a changed action, account or vault does not discard it, because a fresh prepare would send the same action again.
 */
export function ActionRunner(props: {
  sdk: Sdk;
  vault: Address;
  action: VaultAction;
  as: Address;
  label: string;
  testid: string;
  kind?: keyof typeof BUTTON;
  onDone?: (r: SendResult) => void;
  /** TxRunner's progress; `committed` is true while a send is in flight or the wallet accepted something. */
  onProgress?: (p: { confirmed: number; committed: boolean }) => void;
  /** Called with true while this runner holds a prepared plan. */
  onPlan?: (held: boolean) => void;
}) {
  const { sdk, vault, action, as, label, testid, onDone, onProgress, onPlan } = props;
  const t = useT(messages);
  const key = stringify(action);
  const ctx = `${vault}|${as}|${key}`;
  const [plan, setPlan] = useState<TxPlan | null>(null);
  const [planCtx, setPlanCtx] = useState('');
  const [committed, setCommitted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // The lock protects a partly sent plan only; a finished plan has nothing left to protect.
  const locked = committed && !finished;
  const held = busy || (plan !== null && !finished);
  // Read by async callbacks and by the onPlan effect, which must not re-run for a new callback identity.
  const latest = useRef({ ctx, onPlan });
  latest.current = { ctx, onPlan };

  const clear = () => {
    setPlan(null);
    setCommitted(false);
    setFinished(false);
  };

  // `[vault, as, key]` and the lock are triggers: a plan for another action, account or vault is dropped, but never
  // while it is locked; when the lock opens (a rejection before any hash) this runs again and drops the stale plan.
  useEffect(() => {
    if (locked || plan === null || planCtx === ctx) return;
    clear();
    setError(null);
  }, [ctx, locked, plan, planCtx]);

  useEffect(() => {
    latest.current.onPlan?.(held);
  }, [held]);

  const prepare = async () => {
    const started = ctx;
    setBusy(true);
    setError(null);
    try {
      const p = await sdk.atro.vault(vault).prepare(action, { as });
      // The form may have changed while the SDK was preparing; a plan that differs from the screen is never shown.
      if (latest.current.ctx !== started) return;
      setPlan(p);
      setPlanCtx(started);
      setCommitted(false);
      setFinished(false);
    } catch (e) {
      if (latest.current.ctx === started) setError(e);
    } finally {
      setBusy(false);
    }
  };

  const issues = error ? planIssues(error) : [];
  return (
    <div class="stack">
      {plan ? (
        <>
          <TxRunner
            plan={plan}
            label={label}
            testid={`${testid}-tx`}
            onDone={(r) => {
              setFinished(true);
              onDone?.(r);
            }}
            onProgress={(p) => {
              setCommitted(p.committed);
              onProgress?.(p);
            }}
          />
          {locked ? null : (
            <button type="button" class="btn" data-testid={`${testid}-reset`} onClick={clear}>
              {t('startOver')}
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          class={BUTTON[props.kind ?? 'primary']}
          data-testid={testid}
          disabled={busy}
          onClick={prepare}
        >
          {busy ? t('preparing') : label}
        </button>
      )}
      {issues.length > 0 ? <IssueList issues={issues} testid={`${testid}-issues`} /> : null}
      {error && issues.length === 0 ? <ErrorBox error={error} /> : null}
    </div>
  );
}
