'use client';

import { ArrowRight, CircleCheck, SearchX, ShieldCheck, Unlink, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorCode } from '@/chain/query-client';
import { SubscribeForm } from '@/components/subscribe/SubscribeForm';
import { ENV, explorerUrlOf } from '@/config/env';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatBps } from '@/lib/format';
import { useLocationHash } from '@/lib/hash';
import { useMounted } from '@/lib/use-mounted';
import { messages } from '@/messages/join.messages';
import { messages as labels, ROLE_KEY } from '@/messages/labels.messages';
import { messages as walletText } from '@/messages/wallet.messages';
import { ROUTES, vaultHref } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { type ThreadState, threadStateOf } from '@/thread/state';
import { StateBadge } from '@/thread/state-badge';
import { Thread } from '@/thread/thread';
import { ErrorBox } from '@/tx/error-box';
import { Address } from '@/ui/address';
import { Banner } from '@/ui/banner';
import { Button, buttonClass } from '@/ui/button';
import { Skeleton } from '@/ui/skeleton';
import { connectSheet } from '@/wallet/connect-sheet-slot';
import { useWallet } from '@/wallet/provider';
import {
  heirIndex,
  type Invite,
  type InviteProblem,
  type InviteRole,
  namedRoles,
  parseInvite,
  walletMatch,
} from './invite';
import { remainingAt } from './remaining';
import { type InvitedVault, useInvitedVault } from './use-invited-vault';

type Key = keyof typeof messages.en;

const EXPLORER = explorerUrlOf(ENV);
const TITLE_ID = 'join-title';
/** Where the wallet sheet puts focus when it closes: once connected, the Connect button has left the page. */
const titleEl = () => document.getElementById(TITLE_ID);

const PROBLEM: Record<InviteProblem, Key> = {
  missing: 'invalidMissing',
  shape: 'invalidShape',
  address: 'invalidAddress',
  role: 'invalidRole',
};
const TITLE: Record<InviteRole, Key> = { heir: 'titleHeir', guardian: 'titleGuardian' };
const LEAD: Record<InviteRole, Key> = { heir: 'leadHeir', guardian: 'leadGuardian' };
const ASK: Record<InviteRole, Key> = { heir: 'walletAskHeir', guardian: 'walletAskGuardian' };
const YES: Record<InviteRole, Key> = { heir: 'walletYesHeir', guardian: 'walletYesGuardian' };
const NO: Record<InviteRole, Key> = { heir: 'walletNoHeir', guardian: 'walletNoGuardian' };

const LINK =
  'rounded-sm text-thread underline decoration-thread/40 underline-offset-4 transition-colors duration-150 hover:decoration-thread';
const H2 = 'font-display text-ink text-title';

export type JoinView =
  | { kind: 'loading' }
  | { kind: 'invalid'; reason: InviteProblem }
  | { kind: 'notVault' }
  | { kind: 'error'; error: unknown }
  | { kind: 'ready'; vault: InvitedVault; role: InviteRole };

/**
 * The screen the link and the read give. Nothing the link claims (the role, the title) shows before the chain has
 * confirmed a vault of this factory at the address; data already on screen stays when a later refresh fails.
 */
export function joinView(
  mounted: boolean,
  invite: Invite,
  q: { data?: InvitedVault; isError: boolean; error: unknown },
): JoinView {
  if (!mounted) return { kind: 'loading' };
  if (!invite.ok) return { kind: 'invalid', reason: invite.reason };
  if (q.data) return q.data.registered ? { kind: 'ready', vault: q.data, role: invite.role } : { kind: 'notVault' };
  if (q.isError) {
    const code = errorCode(q.error);
    if (code === 'INVALID_ADDRESS') return { kind: 'invalid', reason: 'address' };
    if (code === 'NOT_VAULT') return { kind: 'notVault' };
    return { kind: 'error', error: q.error };
  }
  return { kind: 'loading' };
}

/**
 * /join/#<vault>.<role> (spec §5.7, joinHref): what the reader was invited to be, the vault as the chain has it now,
 * what happens next, how to stay safe, and the alert sign-up. The prerender, and the reader without JavaScript, get
 * the frame and the shape of what comes; the hash is read after hydration.
 */
export function JoinPage() {
  const t = useT(messages);
  const mounted = useMounted();
  const hash = useLocationHash();
  const invite = parseInvite(hash);
  // Nothing is read for a link that fails its shape or its role.
  const q = useInvitedVault(mounted && invite.ok ? invite.vault : null);
  const view = joinView(mounted, invite, q);

  let body: ReactNode;
  switch (view.kind) {
    case 'loading':
      body = <Loading />;
      break;
    case 'invalid':
      body = (
        <Problem icon={<Unlink aria-hidden="true" size={22} strokeWidth={1.5} />} title={t('invalidTitle')}>
          <p>{t(PROBLEM[view.reason])}</p>
          <p>{t('invalidSafe')}</p>
        </Problem>
      );
      break;
    case 'notVault':
      body = (
        <Problem icon={<SearchX aria-hidden="true" size={22} strokeWidth={1.5} />} title={t('notVaultTitle')}>
          <p>{t('notVaultBody')}</p>
        </Problem>
      );
      break;
    case 'error':
      body = (
        <>
          <Header title={t('errorTitle')} />
          <ErrorBox error={view.error} onRetry={() => void q.refetch()} testId="join-error" />
        </>
      );
      break;
    case 'ready':
      body = <Ready vault={view.vault} role={view.role} />;
      break;
  }

  return (
    <article
      data-testid="join"
      data-state={view.kind}
      data-reason={view.kind === 'invalid' ? view.reason : undefined}
      aria-labelledby={TITLE_ID}
      className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-10 sm:px-6 sm:py-14"
    >
      {/* From the first paint, so the reading is announced (7A rule 19); the ready page speaks through its title. */}
      <p role="status" className="sr-only">
        {view.kind === 'loading' && mounted ? t('loading') : ''}
      </p>
      {body}
    </article>
  );
}

function Header({ title, lead }: { title: string; lead?: string }) {
  const t = useT(messages);
  return (
    <header className="flex flex-col gap-4">
      <p className="font-medium text-caption text-thread uppercase tracking-[0.16em]">{t('eyebrow')}</p>
      <h1 id={TITLE_ID} tabIndex={-1} className="text-balance font-display text-h1 text-ink outline-none">
        {title}
      </h1>
      {lead ? <p className="max-w-[60ch] text-pretty text-ink-muted text-lead">{lead}</p> : null}
    </header>
  );
}

/** The shape of the ready page: the header, the vault card and the first section. */
function Loading() {
  const t = useT(messages);
  return (
    <>
      <Header title={t('loadingTitle')} />
      <div aria-hidden="true" className="flex flex-col gap-5 rounded-3xl border border-line bg-surface-1 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <Skeleton className="h-16 w-full rounded-2xl" />
        <Skeleton className="h-4 w-3/4 max-w-96" />
        <Skeleton className="h-4 w-1/2 max-w-72" />
      </div>
      <Skeleton className="h-7 w-64 max-w-full rounded-md" />
    </>
  );
}

function Problem({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  const t = useT(messages);
  return (
    <div className="flex max-w-2xl flex-col items-start gap-6">
      <span aria-hidden="true" className="grid size-12 place-items-center rounded-full bg-grace/12 text-grace">
        {icon}
      </span>
      <h1 id={TITLE_ID} tabIndex={-1} className="text-balance font-display text-h1 text-ink outline-none">
        {title}
      </h1>
      <div className="flex flex-col gap-3 text-pretty text-ink-muted text-lead">{children}</div>
      <NavLink href={ROUTES.home} className={buttonClass({ variant: 'secondary' })}>
        {t('home')}
      </NavLink>
      {/* A broken or edited link is what a scam looks like: the same safety rules, without the address to check. */}
      <Safety address={false} />
    </div>
  );
}

function Ready({ vault, role }: { vault: InvitedVault; role: InviteRole }) {
  const t = useT(messages);
  const s = vault.snap;
  const state = threadStateOf(s.status);
  return (
    <>
      <Header title={t(TITLE[role])} lead={t(LEAD[role])} />
      <Now state={state} role={role} />
      <VaultCard vault={vault} role={role} state={state} />
      <section aria-labelledby="join-what" className="flex flex-col gap-5">
        <h2 id="join-what" className={H2}>
          {t('whatTitle')}
        </h2>
        <Steps lines={role === 'heir' ? heirLines(t) : guardianLines(t, s.config)} />
      </section>
      <Safety />
      <section aria-labelledby="join-alerts" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 id="join-alerts" className={H2}>
            {t('alertsTitle')}
          </h2>
          <p className="text-ink-muted">{t('alertsLead')}</p>
        </div>
        <SubscribeForm vault={vault.address} role={role} compact />
      </section>
      <p className="border-line border-t pt-6 text-ink-muted text-small">
        {t('trust')}{' '}
        <NavLink href={ROUTES.proof} className={LINK}>
          {t('trustLink')}
        </NavLink>
      </p>
    </>
  );
}

/** One line on what the vault is doing now, when that changes what the reader should do. */
function Now({ state, role }: { state: ThreadState; role: InviteRole }) {
  const t = useT(messages);
  if (state === 'grace') return <Banner tone="warn">{t('nowGrace')}</Banner>;
  if (state === 'releasedInherit' && role === 'heir') return <Banner tone="success">{t('nowHeirReleased')}</Banner>;
  if (state === 'expired') return <Banner tone="info">{t('nowExpired')}</Banner>;
  return null;
}

function VaultCard({ vault, role, state }: { vault: InvitedVault; role: InviteRole; state: ThreadState }) {
  const t = useT(messages);
  const l = useT(labels);
  const { wallet } = useWallet();
  const { config, status } = vault.snap;
  const reader = heirIndex(config, wallet?.account ?? null);
  const dt = 'text-caption text-ink-muted sm:text-small';
  return (
    <section
      data-testid="join-vault"
      aria-labelledby="join-vault-title"
      className="flex min-w-0 flex-col gap-5 rounded-3xl border border-line bg-surface-1 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="join-vault-title" className="font-medium text-ink text-small">
          {t('vaultTitle')}
        </h2>
        <StateBadge state={state} drill={config.drill} />
      </div>
      {/* The vault's own thread at the snapshot's block: decoration next to the badge, which says it in words. */}
      <Thread
        state={state}
        remaining={remainingAt(status, status.blockTimestamp)}
        branches={config.heirs.map((h) => h.bps)}
        highlight={reader >= 0 ? reader : undefined}
        className="h-16 w-full"
      />
      {/* Below sm each label stands above its value, so an address keeps its block of two rows of five (7C T8). */}
      <dl className="grid min-w-0 grid-cols-1 gap-y-0.5 text-small sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-x-4 sm:gap-y-3">
        <dt className={dt}>{t('vaultLabel')}</dt>
        <dd className="min-w-0">
          <Address address={vault.address} explorer={EXPLORER} />
        </dd>
        <dt className={cn(dt, 'mt-3 sm:mt-0')}>{l(ROLE_KEY.owner)}</dt>
        <dd className="min-w-0">
          <Address address={config.owner} explorer={EXPLORER} size="sm" />
        </dd>
        <dt className={cn(dt, 'mt-3 sm:mt-0')}>{t('heirsLabel')}</dt>
        <dd className="voice-ledger text-ink">{String(config.heirs.length)}</dd>
        <dt className={cn(dt, 'mt-3 sm:mt-0')}>{t('guardiansLabel')}</dt>
        <dd className="text-ink">
          {config.guardians.length === 0
            ? t('guardiansNone')
            : t('guardiansRule', { n: config.guardians.length, k: config.k })}
        </dd>
      </dl>
      {config.drill ? <p className="text-caption text-ink-muted">{t('drillNote')}</p> : null}
      <WalletCheck vault={vault} role={role} />
      <NavLink
        href={vaultHref(vault.address)}
        prefetch={false}
        className={buttonClass({ variant: 'secondary', className: 'gap-1.5 self-start' })}
      >
        {t('openVault')}
        <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} />
      </NavLink>
    </section>
  );
}

/** Whether the connected wallet is the one the owner named; without a wallet, an offer to check. Asks nothing to sign. */
function WalletCheck({ vault, role }: { vault: InvitedVault; role: InviteRole }) {
  const t = useT(messages);
  const w = useT(walletText);
  const l = useT(labels);
  const { status, wallet, openSheet } = useWallet();
  const account = wallet?.account ?? null;
  if (!account) {
    if (status === 'restoring') {
      return (
        <p data-testid="join-wallet" data-named="restoring" className="text-ink-muted text-small">
          {w('restoring')}
        </p>
      );
    }
    return (
      <div
        data-testid="join-wallet"
        data-named="none"
        className="flex flex-col gap-3 rounded-2xl border border-line-strong/45 border-dashed p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
      >
        <p className="text-ink-muted text-small">{t(ASK[role])}</p>
        <Button
          variant="secondary"
          size="sm"
          data-testid="join-connect"
          className="shrink-0 self-start sm:self-center"
          icon={<Wallet aria-hidden="true" strokeWidth={1.5} />}
          onClick={() => openSheet(titleEl)}
          // The sheet's chunk loads now if the idle preload has not loaded it yet (7A rule 19).
          onPointerEnter={connectSheet.preload}
          onFocus={connectSheet.preload}
        >
          {w('connect')}
        </Button>
      </div>
    );
  }
  const { config } = vault.snap;
  const roles = namedRoles(config, account);
  const match = walletMatch(roles, role);
  const at = heirIndex(config, account);
  return (
    <div
      data-testid="join-wallet"
      data-named={match}
      className={cn(
        'flex items-start gap-3 rounded-2xl border p-4 text-small',
        match === 'yes' ? 'border-alive/45 bg-alive/8' : 'border-line bg-surface-2',
      )}
    >
      {match === 'yes' ? (
        <CircleCheck aria-hidden="true" size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-alive" />
      ) : (
        <Wallet aria-hidden="true" size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-ink-muted" />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-ink">
          {match === 'yes'
            ? t(YES[role])
            : match === 'other'
              ? t('walletOther', { roles: roles.map((r) => l(ROLE_KEY[r])).join(' · ') })
              : t(NO[role])}
        </p>
        {match === 'yes' && role === 'heir' && at >= 0 ? (
          <p className="text-ink-muted">{t('walletShare', { share: formatBps(config.heirs[at].bps) })}</p>
        ) : null}
      </div>
    </div>
  );
}

type T = (key: Key, params?: Record<string, string | number | bigint>) => string;

function heirLines(t: T): string[] {
  return [t('heir1'), t('heir2'), t('heir3')];
}

/** k and n from the vault itself (spec §18.2 rule 3): never a figure typed into the copy. */
function guardianLines(t: T, c: InvitedVault['snap']['config']): string[] {
  if (c.guardians.length === 0 || c.k === 0) return [t('guardianNone')];
  const n = c.guardians.length;
  return [
    t('guardian1', { k: c.k, n }),
    c.recoveryEnabled ? t('guardian2Power', { k: c.k }) : t('guardian2Off'),
    t('guardian3'),
  ];
}

/** What happens next, numbered on a line like the home page's spine; the list itself says the numbers. */
function Steps({ lines }: { lines: string[] }) {
  return (
    <ol className="ml-3 flex list-none flex-col gap-5 border-line border-l pl-7">
      {lines.map((line, i) => (
        <li key={line} className="relative max-w-[62ch] text-pretty text-ink">
          <span
            aria-hidden="true"
            className="-left-[calc(1.75rem+0.75rem+0.5px)] absolute top-0 grid size-6 place-items-center rounded-full border border-line-strong bg-bg font-medium text-caption text-ink"
          >
            {i + 1}
          </span>
          {line}
        </li>
      ))}
    </ol>
  );
}

/** `address`: the page shows a vault address the reader can check against what the owner told them. */
function Safety({ address = true }: { address?: boolean }) {
  const t = useT(messages);
  return (
    <section
      aria-labelledby="join-safety"
      className="flex w-full flex-col gap-4 rounded-3xl border border-line bg-surface-2 p-5 sm:p-6"
    >
      <h2 id="join-safety" className="flex items-center gap-2 font-medium text-body text-ink">
        <ShieldCheck aria-hidden="true" size={20} strokeWidth={1.5} className="shrink-0 text-alive" />
        {t('safetyTitle')}
      </h2>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-pretty text-ink-muted text-small marker:text-line-strong">
        <li>{t('safety1')}</li>
        <li>{t('safety2')}</li>
        {address ? <li>{t('safety3')}</li> : null}
      </ul>
    </section>
  );
}
