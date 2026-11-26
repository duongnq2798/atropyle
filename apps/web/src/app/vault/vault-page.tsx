'use client';

import type { Role, SendResult } from '@atropyle/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { type ComponentType, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Address as Addr } from 'viem';
import { CHAIN_ID, useInvalidateVault, useVault } from '@/chain/hooks';
import { chainKeys } from '@/chain/keys';
import type { RegisteredVault, Sdk } from '@/chain/types';
import { useSdk } from '@/chain/use-sdk';
import type { VaultView } from '@/flows/impl/vault-view';
import type { FlowsImpl } from '@/flows/load';
import { useFlows } from '@/flows/use-flows';
import { useT } from '@/i18n/provider';
import { isAddressText } from '@/lib/address';
import { replaceHash, useLocationHash } from '@/lib/hash';
import { useMounted } from '@/lib/use-mounted';
import { messages as labels, ROLE_KEY } from '@/messages/labels.messages';
import { messages } from '@/messages/vault.messages';
import { ErrorBox } from '@/tx/error-box';
import { Address } from '@/ui/address';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { SkeletonText } from '@/ui/skeleton';
import { Tabs } from '@/ui/tabs';
import { TextField } from '@/ui/text-field';
import { useWallet } from '@/wallet/provider';
import { AssetsList } from './assets-list';
import { vaultRefetchMs } from './boundary';
import { GuestView } from './guest';
import { HistoryThread } from './history-thread';
import { type Moved, movedOf } from './moment';
import { StandingLine } from './standing-line';
import { VaultHeader, VaultPlan } from './vault-header';

export type PanelRole = 'owner' | 'guardian' | 'heir';

export interface PanelProps {
  flows: FlowsImpl;
  sdk: Sdk;
  /** A vault the factory created: only such a vault has a timeline, and a page. */
  loaded: RegisteredVault;
  view: VaultView;
  account: Addr;
  /**
   * After a confirmed transaction: reads the vault and its history again. Pass the result: a send that moved the
   * state is told in the header ("Alarm raised at block N").
   */
  onChanged(result?: SendResult): void;
}

const PANEL_ORDER: readonly PanelRole[] = ['owner', 'guardian', 'heir'];

/**
 * One panel per role, a constant of this page (not a registry changed at run time). A role without a panel sees the
 * guest view, with its roles named, and can still poke or distribute like anyone.
 */
const PANELS: Partial<Record<PanelRole, ComponentType<PanelProps>>> = {
  // owner: OwnerTab — Task 10 (src/app/vault/owner-tab.tsx): the check-in ritual, coverage, edit, revoke, time machine.
  // guardian: GuardianTab, heir: HeirLetter — Task 11.
};

function panelRoles(roles: readonly Role[]): PanelRole[] {
  return PANEL_ORDER.filter(
    (r) =>
      PANELS[r] !== undefined &&
      (r === 'heir' ? roles.includes('heir') || roles.includes('recoveryTarget') : roles.includes(r)),
  );
}

function Panel({ role, ...p }: PanelProps & { role: PanelRole }) {
  const C = PANELS[role];
  return C ? <C {...p} /> : null;
}

const SHELL = 'mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14';

function VaultLoading() {
  const t = useT(messages);
  return (
    <div data-testid="vault-loading" aria-busy="true" className={SHELL}>
      <h1 className="font-display text-h1 text-ink">{t('pageTitle')}</h1>
      <p className="sr-only">{t('loading')}</p>
      <SkeletonText lines={8} />
    </div>
  );
}

function OpenVault({ invalid }: { invalid: boolean }) {
  const t = useT(messages);
  const [text, setText] = useState('');
  const [error, setError] = useState(invalid);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    // A same-route hash change goes through replaceHash: a <Link> leaves the reader stale without the Navigation API.
    if (isAddressText(v)) replaceHash(`#${v}`);
    else setError(true);
  };
  return (
    <div data-testid="vault-missing" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
      <h1 className="font-display text-h1 text-ink">{t('missingTitle')}</h1>
      <p className="text-lead text-ink-muted">{t('missingBody')}</p>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          label={t('openLabel')}
          mono
          value={text}
          autoComplete="off"
          spellCheck={false}
          data-testid="vault-open-input"
          error={error ? t('openInvalid') : undefined}
          className="flex-1"
          onChange={(e) => {
            setText(e.target.value);
            setError(false);
          }}
        />
        <Button type="submit" data-testid="vault-open" className="sm:mt-7">
          {t('open')}
        </Button>
      </form>
    </div>
  );
}

/** Any contract can answer like a vault and name the real factory: nothing it says is shown, nothing is offered. */
function NotRegistered({ vault, explorer }: { vault: Addr; explorer: string | null }) {
  const t = useT(messages);
  return (
    <div data-testid="vault" className={SHELL}>
      <h1 className="font-display text-h1 text-ink">{t('pageTitle')}</h1>
      <Address address={vault} explorer={explorer} copy />
      <Banner tone="error" testId="vault-not-registered" title={t('notRegistered')}>
        {t('notRegisteredHelp')}
      </Banner>
    </div>
  );
}

function useVaultRefresh(vault: Addr) {
  const invalidate = useInvalidateVault();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = useCallback(() => {
    setBusy(true);
    void Promise.all([
      invalidate(vault),
      client.resetQueries({ queryKey: chainKeys.history(CHAIN_ID, vault) }),
    ]).finally(() => setBusy(false));
  }, [invalidate, client, vault]);
  return { busy, run };
}

function VaultScreen({ vault }: { vault: Addr }) {
  const t = useT(messages);
  const l = useT(labels);
  const loaded = useVault(vault, { refetchMs: vaultRefetchMs });
  const sdk = useSdk().data ?? null;
  const flowsQ = useFlows();
  const flows = flowsQ.data ?? null;
  const { wallet } = useWallet();
  const account = wallet?.account ?? null;
  const refresh = useVaultRefresh(vault);
  const [tab, setTab] = useState<string | null>(null);
  const [moved, setMoved] = useState<Moved | null>(null);
  // The newest change wins, whichever way it was found (a receipt, or a lookup that resolved late).
  const keepMoved = useCallback((m: Moved) => setMoved((cur) => (cur && cur.block > m.block ? cur : m)), []);
  const data = loaded.data;
  const view = useMemo(
    () => (flows && data?.registered ? flows.vaultView(data.snap, data.timeline, account) : null),
    [flows, data, account],
  );
  const run = refresh.run;
  const onChanged = useCallback(
    (r?: SendResult) => {
      const m = r ? movedOf(r) : null;
      if (m) keepMoved(m);
      run();
    },
    [run, keepMoved],
  );
  // Spec §18.4.2 T9: a poke by anyone (a keeper, another visitor) is told with its block. Between two consecutive
  // reads (30 s apart at most, 1.5 s after a boundary) a change of state spans a few dozen blocks: one eth_getLogs
  // within deployment.logsBlockRange (100 on X Layer). A larger gap (a tab asleep) falls back to the standing
  // sentence and its date (R4). No cleanup: a newer read must not cancel the lookup of an older change.
  const prevRead = useRef<RegisteredVault | null>(null);
  useEffect(() => {
    if (!data?.registered || !flows || !sdk) return;
    const prev = prevRead.current;
    prevRead.current = data;
    if (!prev) return;
    const from = prev.snap.status;
    const to = data.snap.status;
    if (from.state === to.state || to.blockNumber <= from.blockNumber) return;
    if (to.blockNumber - from.blockNumber > BigInt(sdk.deployment.logsBlockRange)) return;
    flows.movedBetween(sdk.atro, vault, from.blockNumber, to.blockNumber).then(
      (m) => {
        if (m) keepMoved(m);
      },
      // The moment line is a courtesy: a failed lookup leaves it as it was, and the standing sentence still tells.
      () => undefined,
    );
  }, [data, flows, sdk, vault, keepMoved]);

  if (!data) {
    if (!loaded.error) return <VaultLoading />;
    return (
      <div data-testid="vault" className={SHELL}>
        <h1 className="font-display text-h1 text-ink">{t('pageTitle')}</h1>
        <ErrorBox error={loaded.error} onRetry={() => void loaded.refetch()} testId="vault-error" />
      </div>
    );
  }
  if (!data.registered) return <NotRegistered vault={vault} explorer={sdk?.deployment.explorerUrl ?? null} />;
  if (!flows && flowsQ.error) {
    return (
      <div data-testid="vault" className={SHELL}>
        <h1 className="font-display text-h1 text-ink">{t('pageTitle')}</h1>
        <ErrorBox error={flowsQ.error} onRetry={() => void flowsQ.refetch()} testId="vault-error" />
      </div>
    );
  }
  if (!view || !sdk || !flows) return <VaultLoading />;

  const explorer = sdk.deployment.explorerUrl;
  const roles = account ? panelRoles(view.roles) : [];
  const active = roles.find((r) => r === tab) ?? roles[0] ?? null;
  const panel: PanelProps | null = account ? { flows, sdk, loaded: data, view, account, onChanged } : null;
  return (
    <div data-testid="vault" className={SHELL}>
      {loaded.error ? (
        <ErrorBox error={loaded.error} onRetry={() => void loaded.refetch()} testId="vault-refresh-error" />
      ) : null}
      <VaultHeader
        sdk={sdk}
        loaded={data}
        view={view}
        lead={<StandingLine loaded={data} view={view} />}
        moved={moved}
        refreshing={refresh.busy}
        onRefresh={refresh.run}
      />
      {panel && active && roles.length > 1 ? (
        <Tabs
          testId="vault-roles"
          label={t('rolesLabel')}
          value={active}
          onValueChange={setTab}
          items={roles.map((r) => ({ value: r, label: l(ROLE_KEY[r]), content: <Panel role={r} {...panel} /> }))}
        />
      ) : panel && active ? (
        <Panel role={active} {...panel} />
      ) : (
        <GuestView flows={flows} sdk={sdk} loaded={data} view={view} account={account} onChanged={onChanged} />
      )}
      <VaultPlan snap={data.snap} view={view} explorer={explorer} />
      <AssetsList view={view} explorer={explorer} />
      <HistoryThread flows={flows} sdk={sdk} vault={view.vault} />
    </div>
  );
}

/** `/vault/#<address>`: the hash is read after mount (it is '' at prerender), so the first paint is the skeleton. */
export function VaultPage() {
  const hash = useLocationHash();
  const mounted = useMounted();
  if (!mounted) return <VaultLoading />;
  const text = hash.slice(1).trim();
  if (!isAddressText(text)) return <OpenVault key={text} invalid={text.length > 0} />;
  return <VaultScreen key={text.toLowerCase()} vault={text as Addr} />;
}
