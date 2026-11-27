'use client';

import type { PlanIssue } from '@atropyle/sdk';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Address as Addr } from 'viem';
import { CHAIN_ID } from '@/chain/hooks';
import type { Sdk } from '@/chain/types';
import { AssetsEditor } from '@/flows/editors/assets-editor';
import { GuardiansEditor } from '@/flows/editors/guardians-editor';
import { HeirsEditor } from '@/flows/editors/heirs-editor';
import { TimingEditor } from '@/flows/editors/timing-editor';
import type { AssetRow } from '@/flows/impl/create-form';
import type { NftRemap } from '@/flows/impl/vault-view';
import type { FlowsImpl } from '@/flows/load';
import { evenSplit, withShares } from '@/flows/shares';
import { useT } from '@/i18n/provider';
import { isAddressText } from '@/lib/address';
import { focusInView } from '@/lib/focus';
import { jsonStringify } from '@/lib/store';
import { messages } from '@/messages/owner.messages';
import { Address } from '@/ui/address';
import { Banner } from '@/ui/banner';
import { UntrustedText } from '@/ui/untrusted-text';
import { LazyActionFlow } from './lazy-action-flow';
import { type EditForms, type EditPart, editAction, formsOf, ownerTokens } from './owner-view';
import type { PanelProps } from './vault-page';

/**
 * The editors mark their fields from the wizard's issue paths; here the SDK's issues for the one action of a part come
 * back from the prepare and stand in ActionFlow's IssueList, under Save.
 */
const NO_ISSUES: readonly PlanIssue[] = [];

const SAVE_KEY = {
  heirs: 'saveHeirs',
  guardians: 'saveGuardians',
  timing: 'saveTiming',
  assets: 'saveAssets',
} as const satisfies Record<EditPart, keyof typeof messages.en>;

export interface EditConfigProps extends PanelProps {
  /** The part on screen; null keeps the forms (and what was typed) with nothing shown. */
  part: EditPart | null;
  /** A save is prepared, in flight or done: the part buttons hold still. */
  onLocked(locked: boolean): void;
  /** Start over was pressed (EditFields): EditConfig keeps the focus in the editor once the forms start again. */
  onStartOver?(): void;
}

/**
 * The owner's editor (spec §16.2), loaded the first time a part is chosen (owner-tab's editConfigChunk). The forms
 * start from the vault as read and start again from it (a new key) once nothing of a save is on screen: a refresh
 * after a save never wipes its receipt, and Start over shows the plan as it now stands.
 */
export function EditConfig(p: EditConfigProps) {
  const key = jsonStringify(p.loaded.snap.config);
  const [formKey, setFormKey] = useState(key);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!locked && key !== formKey) setFormKey(key);
  }, [locked, key, formKey]);
  const { onLocked, part } = p;
  useEffect(() => {
    onLocked(locked);
  }, [locked, onLocked]);
  // The new key mounts new forms, and the Start over button that had focus goes with the old ones: focus moves to Save
  // when it can be pressed, else to this part's button, never to <body>. After every render until then, since the part
  // buttons open a render later (onLocked), and a key the press saw is not yet the new one.
  const wrap = useRef<HTMLDivElement>(null);
  const refocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (refocus.current === null || refocus.current === formKey) return;
    const at = document.activeElement;
    if (!(at === null || at === document.body || wrap.current?.contains(at))) {
      refocus.current = null;
      return;
    }
    const save = wrap.current?.querySelector<HTMLButtonElement>('[data-testid="owner-edit-save"]');
    const partButton = part ? document.querySelector<HTMLButtonElement>(`[data-testid="owner-edit-${part}"]`) : null;
    const target = save && !save.disabled ? save : partButton && !partButton.disabled ? partButton : null;
    if (!target) return;
    refocus.current = null;
    focusInView(target);
  });
  return (
    <div ref={wrap} className="contents">
      <EditFields
        key={formKey}
        {...p}
        onLocked={setLocked}
        onStartOver={() => {
          // Still on the Start over button: the press runs before the forms go.
          refocus.current = wrap.current?.contains(document.activeElement) === true ? formKey : null;
        }}
      />
    </div>
  );
}

function EditFields({ flows, sdk, loaded, view, account, onChanged, part, onLocked, onStartOver }: EditConfigProps) {
  const t = useT(messages);
  const snap = loaded.snap;
  const c = snap.config;
  const [forms, setForms] = useState<EditForms>(() => formsOf(flows, c, view.drill));
  const saved = useMemo(() => formsOf(flows, c, view.drill), [flows, c, view.drill]);
  // The remaps the owner said they understood; a different set asks again.
  const [acked, setAcked] = useState('');
  const [held, setHeld] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    onLocked(held || done);
  }, [held, done, onLocked]);
  const remaps = useMemo(() => flows.nftRemaps(snap, forms.heirs), [flows, snap, forms.heirs]);
  const remapKey = jsonStringify(remaps);
  const tokens = useMemo(() => ownerTokens(snap, forms.assets), [snap, forms.assets]);

  if (part === null) return null;
  const action = editAction(flows, part, forms);
  const unchanged = jsonStringify(action) === jsonStringify(editAction(flows, part, saved));
  const blocked = part === 'heirs' && remaps.length > 0 && acked !== remapKey;
  const set =
    <K extends EditPart>(k: K) =>
    (v: EditForms[K]) =>
      setForms((f) => ({ ...f, [k]: v }));

  return (
    <div data-testid="owner-edit-fields" data-part={part} className="flex flex-col gap-6">
      {part === 'heirs' ? (
        <HeirsEditor
          flows={flows}
          rows={forms.heirs}
          issues={NO_ISSUES}
          showIssues={false}
          testId="owner-edit"
          hideLegend
          onChange={set('heirs')}
          onRemove={(i) => {
            // The heir's NFTs keep their position: the remap warning below says where they would go.
            const rest = forms.heirs.filter((_, j) => j !== i);
            set('heirs')(withShares(rest, evenSplit(rest.length)));
          }}
        />
      ) : null}
      {part === 'heirs' && remaps.length > 0 ? (
        <RemapWarning
          remaps={remaps}
          explorer={sdk.deployment.explorerUrl}
          acked={acked === remapKey}
          disabled={held}
          onAck={(on) => setAcked(on ? remapKey : '')}
        />
      ) : null}
      {part === 'guardians' ? (
        <GuardiansEditor
          flows={flows}
          value={forms.guardians}
          issues={NO_ISSUES}
          showIssues={false}
          testId="owner-edit"
          recoveryWindow={c.timing.window}
          min={0}
          hideLegend
          onChange={set('guardians')}
        />
      ) : null}
      {part === 'timing' ? (
        <TimingEditor
          flows={flows}
          value={forms.timing}
          drill={view.drill}
          issues={NO_ISSUES}
          showIssues={false}
          testId="owner-edit"
          hideLegend
          onChange={set('timing')}
        />
      ) : null}
      {part === 'assets' ? (
        <AssetsPart
          flows={flows}
          sdk={sdk}
          account={account}
          rows={forms.assets}
          heirs={c.heirs.length}
          onChange={set('assets')}
        />
      ) : null}
      {unchanged && !held && !done ? (
        <p data-testid="owner-edit-unchanged" className="text-small text-ink-muted">
          {t('unchanged')}
        </p>
      ) : null}
      <LazyActionFlow
        key={part}
        flows={flows}
        sdk={sdk}
        vault={view.vault}
        drill={view.drill}
        action={action}
        as={account}
        label={t(SAVE_KEY[part])}
        testId="owner-edit-save"
        tokens={part === 'assets' ? tokens : undefined}
        disabled={unchanged || blocked}
        onPlan={setHeld}
        onDone={(r) => {
          setDone(true);
          onChanged(r);
        }}
        onReset={() => {
          onStartOver?.();
          setDone(false);
        }}
      />
    </div>
  );
}

function RemapWarning({
  remaps,
  explorer,
  acked,
  disabled,
  onAck,
}: {
  remaps: readonly NftRemap[];
  explorer: string | null;
  acked: boolean;
  disabled: boolean;
  onAck(on: boolean): void;
}) {
  const t = useT(messages);
  return (
    <Banner tone="warn" title={t('nftRemapTitle')} testId="owner-edit-remap">
      <div className="flex flex-col gap-3">
        <p>{t('nftRemapHelp')}</p>
        <ul className="flex flex-col gap-3">
          {remaps.map((r) => (
            <li
              key={r.index}
              data-testid={`owner-edit-remap-${r.index}`}
              data-to={r.to ?? ''}
              className="flex flex-col gap-1 text-small"
            >
              <span className="flex flex-wrap items-baseline gap-2">
                <span>{t('nftRemapAsset', { n: r.index + 1 })}</span>
                <UntrustedText value={r.info.symbol} max={16} className="voice-ledger" />
                <span className="voice-ledger">{t('nftId', { id: r.id.toString() })}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {t('nftRemapFrom')} <Address address={r.from} explorer={explorer} size="sm" />
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {t('nftRemapTo')}{' '}
                {r.to === null ? (
                  <span>{t('nftRemapNone')}</span>
                ) : r.to === '' ? (
                  <span>{t('nftRemapBlank')}</span>
                ) : isAddressText(r.to) ? (
                  <Address address={r.to as Addr} explorer={explorer} size="sm" />
                ) : (
                  <span className="break-all font-mono">{r.to}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p>{t('nftRemapFix')}</p>
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            data-testid="owner-edit-remap-ack"
            checked={acked}
            disabled={disabled}
            onChange={(e) => onAck(e.currentTarget.checked)}
            className="mt-1 size-4 shrink-0 accent-thread"
          />
          <span>{t('nftRemapAck')}</span>
        </label>
      </div>
    </Banner>
  );
}

function AssetsPart({
  flows,
  sdk,
  account,
  rows,
  heirs,
  onChange,
}: {
  flows: FlowsImpl;
  sdk: Sdk;
  account: Addr;
  rows: readonly AssetRow[];
  heirs: number;
  onChange(rows: AssetRow[]): void;
}) {
  const choices = useMemo(() => flows.tokenChoices(sdk.deployment), [flows, sdk]);
  // The wizard's own key: one read of the owner's balances serves both pages.
  const balances = useQuery({
    queryKey: ['atropyle', CHAIN_ID, 'balances', account.toLowerCase()],
    queryFn: () =>
      flows.tokenBalances(
        sdk.atro,
        account,
        choices.map((x) => x.address),
      ),
    staleTime: 60_000,
  });
  return (
    <AssetsEditor
      flows={flows}
      rows={rows}
      heirs={heirs}
      choices={choices}
      circuit={flows.circuitShortcut(sdk.deployment)}
      balances={balances.data ?? null}
      issues={NO_ISSUES}
      showIssues={false}
      testId="owner-edit"
      hideLegend
      onChange={onChange}
    />
  );
}
