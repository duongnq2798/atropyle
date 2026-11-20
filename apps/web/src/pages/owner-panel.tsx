import { stringify, type VaultAction, type VaultSnapshot } from '@atropyle/sdk';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Address } from 'viem';
import {
  assetRows,
  assetsInput,
  circuitShortcut,
  heirRows,
  heirsInput,
  timingFormOf,
  timingInput,
  tokenChoices,
} from '../lib/create-form';
import { telegramLink } from '../lib/links';
import type { Sdk } from '../lib/sdk';
import { fixCoverageAction, guardiansAction, type VaultView } from '../lib/vault-view';
import { ActionRunner } from '../ui/action-runner';
import { useApp, useT } from '../ui/app-context';
import { AssetsEditor, type GuardianFields, GuardiansEditor, HeirsEditor, TimingEditor } from '../ui/editors';
import { messages } from './owner.messages';

type Tab = 'heirs' | 'guardians' | 'timing' | 'assets';
const TABS: readonly Tab[] = ['heirs', 'guardians', 'timing', 'assets'];
const TAB_KEY = { heirs: 'tabHeirs', guardians: 'tabGuardians', timing: 'tabTiming', assets: 'tabAssets' } as const;

function EditConfig(props: {
  sdk: Sdk;
  snap: VaultSnapshot;
  account: Address;
  onChanged: () => void;
  /** True while the runner prepares or holds an unfinished plan; OwnerPanel then freezes this form's key. */
  onHeld: (held: boolean) => void;
}) {
  const { sdk, snap, account, onChanged, onHeld } = props;
  const t = useT(messages);
  const c = snap.config;
  const [tab, setTab] = useState<Tab | null>(null);
  const [heirs, setHeirs] = useState(() => heirRows(c.heirs));
  const [guardians, setGuardians] = useState<GuardianFields>(() => ({
    guardians: [...c.guardians],
    k: String(c.k),
    recoveryEnabled: c.recoveryEnabled,
  }));
  const [timing, setTiming] = useState(() => timingFormOf(c.timing, c.drill));
  const [assets, setAssets] = useState(() => assetRows(c.assets));
  // While the runner holds a prepared plan the editors are read-only: a form edit must not change the action under it.
  const [held, setHeld] = useState(false);
  const report = (h: boolean) => {
    setHeld(h);
    onHeld(h);
  };
  useEffect(() => () => onHeld(false), []);

  const action = (): VaultAction | null => {
    switch (tab) {
      case 'heirs':
        return { type: 'setHeirs', heirs: heirsInput(heirs) };
      case 'guardians':
        return guardiansAction(guardians.guardians, guardians.k, guardians.recoveryEnabled);
      case 'timing':
        return { type: 'setTiming', timing: timingInput(timing) };
      case 'assets':
        return { type: 'setAssets', assets: assetsInput(assets) };
      default:
        return null;
    }
  };
  const current = action();

  return (
    <section class="card stack" data-testid="owner-edit">
      <h2>{t('editTitle')}</h2>
      <div class="row">
        {TABS.map((x) => (
          <button
            key={x}
            type="button"
            class={x === tab ? 'btn btn-primary' : 'btn'}
            data-testid={`owner-edit-${x}`}
            disabled={held}
            onClick={() => setTab(x === tab ? null : x)}
          >
            {t(TAB_KEY[x])}
          </button>
        ))}
      </div>
      <fieldset class="stack" disabled={held} data-testid="owner-edit-fields">
        {tab === 'heirs' ? (
          <HeirsEditor
            rows={heirs}
            issues={[]}
            testid="owner"
            onChange={setHeirs}
            onRemove={(i) => setHeirs(heirs.filter((_, j) => j !== i))}
          />
        ) : null}
        {tab === 'guardians' ? (
          <GuardiansEditor value={guardians} issues={[]} testid="owner" min={0} onChange={setGuardians} />
        ) : null}
        {tab === 'timing' ? (
          <TimingEditor value={timing} drill={c.drill} issues={[]} testid="owner" onChange={setTiming} />
        ) : null}
        {tab === 'assets' ? (
          <AssetsEditor
            rows={assets}
            heirs={c.heirs.length}
            choices={tokenChoices(sdk.deployment)}
            circuit={circuitShortcut(sdk.deployment)}
            issues={[]}
            testid="owner"
            onChange={setAssets}
          />
        ) : null}
      </fieldset>
      {current ? (
        <ActionRunner
          sdk={sdk}
          vault={snap.status.vault}
          action={current}
          as={account}
          label={t('save')}
          testid="owner-save"
          onDone={onChanged}
          onPlan={report}
        />
      ) : null}
    </section>
  );
}

export function OwnerPanel(props: {
  sdk: Sdk;
  snap: VaultSnapshot;
  view: VaultView;
  account: Address;
  onChanged: () => void;
}) {
  const { sdk, snap, view, account, onChanged } = props;
  const app = useApp();
  const t = useT(messages);
  const bot = app.env.telegramBot;
  const open = !view.released && !view.expired;
  // The form is rebuilt from a changed on-chain config (after a save), but never while its runner holds an unfinished
  // plan: a multi-step save changes the config after step 1, and a remount would lose the remaining steps.
  const [editHeld, setEditHeld] = useState(false);
  const editKey = useRef('');
  const nextKey = `${view.vault}:${stringify(snap.config)}`;
  if (!editHeld || !editKey.current.startsWith(`${view.vault}:`)) editKey.current = nextKey;
  return (
    <div class="stack" data-testid="owner-panel">
      <section class="card stack">
        <h2>{t('title')}</h2>
        {open ? (
          <>
            <p class="muted">{t('checkInHelp')}</p>
            <ActionRunner
              sdk={sdk}
              vault={view.vault}
              action={{ type: 'checkIn' }}
              as={account}
              label={t('checkIn')}
              testid="owner-checkin"
              kind="big"
              onDone={onChanged}
            />
          </>
        ) : (
          <p class="muted">{t('closed')}</p>
        )}
        {bot ? (
          <a class="btn" href={telegramLink(bot, view.vault, 'owner')} target="_blank" rel="noopener noreferrer">
            {t('telegram')}
          </a>
        ) : null}
      </section>
      {open && view.lowCoverage.length > 0 ? (
        <section class="card stack">
          <h2>{t('coverageTitle')}</h2>
          <p class="muted">{t('coverageHelp')}</p>
          <ActionRunner
            sdk={sdk}
            vault={view.vault}
            action={fixCoverageAction(snap.config)}
            as={account}
            label={t('fixCoverage')}
            testid="owner-fix-coverage"
            onDone={onChanged}
          />
        </section>
      ) : null}
      {open ? (
        <EditConfig
          key={editKey.current}
          sdk={sdk}
          snap={snap}
          account={account}
          onChanged={onChanged}
          onHeld={setEditHeld}
        />
      ) : null}
      <section class="card stack">
        <h2>{t('revokeTitle')}</h2>
        <p class="muted">{t('revokeHelp')}</p>
        <ActionRunner
          sdk={sdk}
          vault={view.vault}
          action={{ type: 'revokeAll' }}
          as={account}
          label={t('revoke')}
          testid="owner-revoke"
          kind="danger"
          onDone={onChanged}
        />
      </section>
    </div>
  );
}
