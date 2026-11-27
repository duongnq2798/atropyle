'use client';

// Steps two to five in a chunk of their own (Ruling 19): the editors and the Radix slider stay out of /create/'s
// first load (R23); edit-chunk.ts loads it at once, beside the flow chunk.

import { skipToken, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { Address } from 'viem';
import { CHAIN_ID } from '@/chain/hooks';
import { useSdk } from '@/chain/use-sdk';
import { AssetsEditor } from '@/flows/editors/assets-editor';
import { GuardiansEditor } from '@/flows/editors/guardians-editor';
import { HeirsEditor } from '@/flows/editors/heirs-editor';
import { TimingEditor } from '@/flows/editors/timing-editor';
import type { FlowsImpl } from '@/flows/load';
import { evenSplit, withShares } from '@/flows/shares';
import { LazyTimeMachine } from '@/flows/time-machine/lazy';
import { useT } from '@/i18n/provider';
import { messages } from '@/messages/create.messages';
import { Choice } from './kind-cards';
import type { Wizard } from './use-wizard';

export interface StepProps {
  flows: FlowsImpl;
  wizard: Wizard;
  owner: Address | null;
}

export function HeirsStep({ flows, wizard }: StepProps) {
  const f = wizard.state.form;
  return (
    <HeirsEditor
      flows={flows}
      rows={f.heirs}
      issues={wizard.issues}
      showIssues={wizard.showIssues}
      testId="create"
      hideLegend
      onChange={(heirs) => wizard.setForm({ ...f, heirs })}
      onRemove={(i) => {
        // removeHeir moves the removed heir's NFTs to heir 1; the shares start even again.
        const g = flows.removeHeir(f, i);
        wizard.setForm({ ...g, heirs: withShares(g.heirs, evenSplit(g.heirs.length)) });
      }}
    />
  );
}

export function GuardiansStep({ flows, wizard }: StepProps) {
  const t = useT(messages);
  const f = wizard.state.form;
  const guarded = f.template === 'guarded';
  return (
    <div className="space-y-8">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">{t('stepGuardians')}</legend>
        <Choice
          name="create-guardians"
          testId="create-guardians-none"
          checked={!guarded}
          title={t('guardiansNone')}
          help={t('guardiansNoneHelp')}
          onPick={() => wizard.setForm({ ...f, template: 'simple' })}
        />
        <Choice
          name="create-guardians"
          testId="create-guardians-with"
          checked={guarded}
          title={t('guardiansWith')}
          help={t('guardiansWithHelp')}
          onPick={() =>
            wizard.setForm({ ...f, template: 'guarded', guardians: f.guardians.length > 0 ? f.guardians : [''] })
          }
        />
      </fieldset>
      {guarded ? (
        <GuardiansEditor
          flows={flows}
          value={{ guardians: f.guardians, k: f.k, recoveryEnabled: f.recoveryEnabled }}
          issues={wizard.issues}
          showIssues={wizard.showIssues}
          testId="create"
          recoveryWindow={flows.timingWindow(f.timing)}
          hideLegend
          onChange={(v) => wizard.setForm({ ...f, ...v })}
        />
      ) : null}
    </div>
  );
}

/** The time machine on the plan being written (spec §4.6.2: on the timing step and on the review step). */
export function PlanTimeMachine({ flows, wizard, owner }: StepProps) {
  const t = useT(messages);
  const f = wizard.state.form;
  // One "now" per visit: a new one every render would recompute every frame of the preview.
  const [now] = useState(() => BigInt(Math.floor(Date.now() / 1000)));
  const preview = useMemo(
    () => (wizard.result.ok ? flows.planEvalState(wizard.result.config, owner ?? flows.ZERO_ADDRESS, now) : null),
    [flows, wizard.result, owner, now],
  );
  return (
    <section aria-labelledby="create-preview-time" className="space-y-3">
      <h2 id="create-preview-time" className="font-display text-title text-ink">
        {t('timingPreview')}
      </h2>
      {preview ? (
        <LazyTimeMachine state={preview.state} now={now} expiresAt={preview.expiresAt} drill={f.drill} binding={null} />
      ) : (
        <p className="text-ink-muted text-small">{t('timingPreviewNeedsPlan')}</p>
      )}
    </section>
  );
}

export function TimingStep(props: StepProps) {
  const { flows, wizard } = props;
  const f = wizard.state.form;
  return (
    <div className="space-y-10">
      <TimingEditor
        flows={flows}
        value={f.timing}
        drill={f.drill}
        issues={wizard.issues}
        showIssues={wizard.showIssues}
        testId="create"
        hideLegend
        onChange={(timing) => wizard.setForm({ ...f, timing })}
      />
      <PlanTimeMachine {...props} />
    </div>
  );
}

export function AssetsStep({ flows, wizard, owner }: StepProps) {
  const f = wizard.state.form;
  const sdk = useSdk().data ?? null;
  const choices = useMemo(() => (sdk ? flows.tokenChoices(sdk.deployment) : []), [flows, sdk]);
  const balances = useQuery({
    queryKey: ['atropyle', CHAIN_ID, 'balances', owner?.toLowerCase() ?? ''],
    queryFn:
      sdk && owner
        ? () =>
            flows.tokenBalances(
              sdk.atro,
              owner,
              choices.map((c) => c.address),
            )
        : skipToken,
    staleTime: 60_000,
  });
  return (
    <AssetsEditor
      flows={flows}
      rows={f.assets}
      heirs={f.heirs.length}
      choices={choices}
      circuit={sdk ? flows.circuitShortcut(sdk.deployment) : null}
      balances={balances.data ?? null}
      issues={wizard.issues}
      showIssues={wizard.showIssues}
      testId="create"
      hideLegend
      onChange={(assets) => wizard.setForm({ ...f, assets })}
    />
  );
}
