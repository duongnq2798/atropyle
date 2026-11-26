'use client';

import type { PlanIssue, PlanResult } from '@atropyle/sdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Address } from 'viem';
import type { CreateForm } from '@/flows/impl/create-form';
import type { WizardState } from '@/flows/impl/session';
import type { WizardStep } from '@/flows/impl/wizard';
import type { FlowsImpl } from '@/flows/load';
import { jsonStringify, type KV, safeKV } from '@/lib/store';

export interface Wizard {
  state: WizardState;
  /** validatePlan of the current form for the connected owner (no owner: owner checks are skipped). */
  result: PlanResult;
  /** The local issues plus those the last plan check on chain returned. */
  issues: PlanIssue[];
  showIssues: boolean;
  setForm(form: CreateForm): void;
  /** Drill or real: the people stay, guardians and timing take the kind's defaults. */
  setKind(drill: boolean): void;
  patch(p: Partial<WizardState>): void;
  next(): void;
  back(): void;
  goTo(step: WizardStep): void;
  /** Issues from the chain check (unknown token, …): show them and go to the first step that edits one. */
  fix(issues: PlanIssue[]): void;
}

let kv: KV | null = null;
/**
 * One instance: safeKV makes a fresh memory fallback on every call, so a blocked sessionStorage would forget. Its
 * memory copy outlives sessionStorage.clear(); remove(key) clears both (the unit tests start from it).
 */
export const sessionKV = (): KV => {
  kv ??= safeKV(() => window.sessionStorage);
  return kv;
};

/** A new form or kind drops the saved plan and its predicted vault (Ruling 9). */
const RESET = { payload: null, vault: null, createStep: -1, offset: 0 } as const;

export function useWizard(flows: FlowsImpl | null, owner: Address | null): Wizard | null {
  const [state, setState] = useState<WizardState | null>(null);
  const [showIssues, setShowIssues] = useState(false);
  const [remote, setRemote] = useState<PlanIssue[]>([]);

  // After mount only: sessionStorage and the hash do not exist at prerender.
  useEffect(() => {
    if (!flows || state) return;
    let restored: WizardState | null = null;
    try {
      restored = flows.reviveSession(JSON.parse(sessionKV().get(flows.SESSION_KEY) ?? 'null'));
    } catch {
      restored = null;
    }
    const hash = window.location.hash;
    const asked = hash === '#real' ? false : hash === '#drill' ? true : null;
    // The session wins over the hash (Ruling 9), except on the first step, where nothing was typed yet; never on a
    // frozen session (createVault ran), whose kind is on chain.
    const frozen = restored !== null && restored.createStep >= 0 && restored.offset > restored.createStep;
    if (restored && restored.step === 'kind' && asked !== null && !frozen) {
      restored = { ...restored, form: flows.withKind(restored.form, asked) };
    }
    setState(restored ?? flows.freshState(flows.initialForm(asked !== false), flows.newSalt()));
  }, [flows, state]);

  useEffect(() => {
    if (flows && state) sessionKV().set(flows.SESSION_KEY, jsonStringify({ v: 1, ...state }));
  }, [flows, state]);

  const result = useMemo(
    () =>
      flows && state
        ? flows.validatePlan(flows.formToPlan(state.form), { owner: owner ?? undefined, drill: state.form.drill })
        : null,
    [flows, state, owner],
  );
  const issues = useMemo(() => {
    const local = result && !result.ok ? result.issues : [];
    const seen = new Set(local.map((i) => `${i.path}|${i.code}`));
    return [...local, ...remote.filter((i) => !seen.has(`${i.path}|${i.code}`))];
  }, [result, remote]);

  const patch = useCallback((p: Partial<WizardState>) => setState((s) => (s ? { ...s, ...p } : s)), []);
  // The page never calls these once createVault ran: the form is frozen then.
  const setForm = useCallback(
    (form: CreateForm) => {
      setRemote([]);
      patch({ form, ...RESET });
    },
    [patch],
  );
  const setKind = useCallback(
    (drill: boolean) => {
      if (!flows) return;
      setRemote([]);
      setState((s) => (s && s.form.drill !== drill ? { ...s, form: flows.withKind(s.form, drill), ...RESET } : s));
    },
    [flows],
  );

  if (!flows || !state || !result) return null;
  const steps = flows.WIZARD_STEPS;
  const at = steps.indexOf(state.step);
  const goTo = (step: WizardStep) => {
    setShowIssues(false);
    patch({ step });
  };
  return {
    state,
    result,
    issues,
    showIssues,
    setForm,
    setKind,
    patch,
    goTo,
    next: () => {
      const blocking = flows.issuesThrough(issues, state.step);
      if (blocking.length > 0) {
        setShowIssues(true);
        const first = flows.firstWizardStep(blocking);
        if (first && steps.indexOf(first) < at) patch({ step: first });
        return;
      }
      setShowIssues(false);
      const to = steps[at + 1];
      if (to) patch({ step: to });
    },
    back: () => {
      const to = steps[at - 1];
      if (to) goTo(to);
    },
    fix: (list) => {
      setRemote(list);
      setShowIssues(true);
      const first = flows.firstWizardStep(list);
      if (first) patch({ step: first });
    },
  };
}
