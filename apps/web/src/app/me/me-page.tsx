'use client';

import { ArrowRight, KeyRound, ShieldCheck, Sprout, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import type { MyVault, MyVaults } from '@/chain/impl/my-vaults';
import { useMyVaults } from '@/chain/use-my-vaults';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/count';
import { messages as labels } from '@/messages/labels.messages';
import { messages } from '@/messages/me.messages';
import { messages as walletText } from '@/messages/wallet.messages';
import { createHref, vaultHref } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { THREAD_COLOR, threadStateOf } from '@/thread/state';
import { StateBadge } from '@/thread/state-badge';
import { ErrorBox } from '@/tx/error-box';
import { Address } from '@/ui/address';
import { Button, buttonClass } from '@/ui/button';
import { CommandLine } from '@/ui/command-line';
import { EmptyState } from '@/ui/empty-state';
import { Skeleton } from '@/ui/skeleton';
import { VisuallyHidden } from '@/ui/visually-hidden';
import { connectSheet } from '@/wallet/connect-sheet-slot';
import { useWallet } from '@/wallet/provider';
import { type ListRole, otherRoles, SECTIONS, type Section, sectionsOf, truncated, vaultsCommand } from './me-view';

type Key = keyof typeof messages.en;

const TITLE: Record<Section, Key> = { own: 'ownTitle', guard: 'guardTitle', inherit: 'inheritTitle' };
const HINT: Record<Section, Key> = { own: 'ownHint', guard: 'guardHint', inherit: 'inheritHint' };
const EMPTY: Record<Section, Key> = { own: 'ownEmpty', guard: 'guardEmpty', inherit: 'inheritEmpty' };
const ALSO: Record<ListRole, Key> = { owner: 'alsoOwner', guardian: 'alsoGuardian', heir: 'alsoHeir' };
const SHORT: Record<Section, Key> = { own: 'ownShort', guard: 'guardShort', inherit: 'inheritShort' };
/** The connect card names the three lists the page will read, in their order. */
const PREVIEW = [
  { key: 'roleOwner', Icon: KeyRound },
  { key: 'roleGuardian', Icon: ShieldCheck },
  { key: 'roleHeir', Icon: Sprout },
] as const;
/** EmptyState's dashed border, one step stronger: the hairline alone fades into vellum. */
const CARD = 'border-line-strong/45';

const TITLE_ID = 'me-title';
/** Where the wallet sheet puts focus when it closes: once connected, the Connect button has left the page. */
const titleEl = () => document.getElementById(TITLE_ID);

const LINK =
  'rounded-sm text-thread underline decoration-thread/40 underline-offset-4 transition-colors duration-150 hover:decoration-thread';

/**
 * Every vault that names the connected wallet, in three lists by role (spec §5.6), read from the factory on the
 * chain in both builds (§18.4.3 Task 8). The prerender, and a reader without JavaScript, get the connect card and the
 * CLI line that reads the same list with no wallet.
 */
export function MePage() {
  const t = useT(messages);
  const w = useT(walletText);
  const { lang } = useLang();
  const { status, wallet } = useWallet();
  const account = wallet?.account ?? null;
  const q = useMyVaults(account);
  const data = q.data;

  let body: ReactNode;
  // The status line exists from the first paint; it stays empty where something else speaks (the header while the
  // wallet reconnects, the alert of the error box).
  let said = '';
  if (!account) {
    body = status === 'restoring' ? <Reading label={w('restoring')} /> : <ConnectCard />;
  } else if (data === undefined && q.isError) {
    body = <ErrorBox error={q.error} onRetry={() => void q.refetch()} testId="me-error" />;
  } else if (data === undefined) {
    said = t('loading');
    body = <Reading label={said} />;
  } else {
    const n = data.vaults.length;
    // An empty read of a truncated index says what it read, not "none yet" (R-T8-27).
    if (n === 0) said = truncated(data) ? t('noneNewest', { limit: formatCount(data.limit, lang) }) : t('foundNone');
    else if (n === 1) said = t('foundOne');
    else said = t('foundMany', { n: formatCount(n, lang) });
    // The notes stand under every loaded state, the empty one included (R-T8-26).
    body = (
      <>
        {n === 0 ? <NoVaults data={data} /> : <Lists vaults={data.vaults} />}
        <Notes data={data} />
      </>
    );
  }

  return (
    <div data-testid="me" className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-col gap-3">
        <h1 id={TITLE_ID} tabIndex={-1} className="font-display text-h1 text-ink outline-none">
          {t('title')}
        </h1>
        <p className="text-ink-muted text-lead">{t('lead')}</p>
      </header>
      <p role="status" data-testid="me-status" className="sr-only">
        {said}
      </p>
      {body}
      <Terminal account={account} />
    </div>
  );
}

function Reading({ label }: { label: string }) {
  return (
    <div data-testid="me-loading" aria-busy="true" className="flex flex-col gap-4">
      <p className="text-ink-muted text-small">{label}</p>
      {/* The shape of what comes: the overview, a list title and two rows. */}
      <Skeleton className="h-[4.75rem] w-full rounded-2xl" />
      <Skeleton className="mt-4 h-7 w-56 max-w-full rounded-md" />
      {[0, 1].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface-1 py-4 pr-4 pl-5"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Skeleton className="h-6 w-32 rounded-full" />
            <Skeleton className="h-3.5 w-3/4 max-w-80" />
            <Skeleton className="h-3.5 w-1/2 max-w-56" />
          </div>
          <Skeleton className="hidden h-8 w-20 shrink-0 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

function ConnectCard() {
  const t = useT(messages);
  const w = useT(walletText);
  const l = useT(labels);
  const { openSheet } = useWallet();
  return (
    <EmptyState
      as="h2"
      testId="me-connect-card"
      icon={<Wallet aria-hidden="true" size={24} strokeWidth={1.5} />}
      title={t('connectTitle')}
      body={t('connectBody')}
      className={CARD}
      action={
        <div className="flex flex-col items-center gap-6">
          <ul aria-label={t('previewLabel')} className="flex flex-wrap justify-center gap-2">
            {PREVIEW.map(({ key, Icon }) => (
              <li
                key={key}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border border-line bg-surface-1 px-3 text-caption text-ink-muted"
              >
                <Icon aria-hidden="true" size={14} strokeWidth={1.5} className="text-thread" />
                {l(key)}
              </li>
            ))}
          </ul>
          <Button
            variant="primary"
            data-testid="me-connect"
            onClick={() => openSheet(titleEl)}
            // The sheet's chunk loads now if the idle preload has not loaded it yet (7A rule 19).
            onPointerEnter={connectSheet.preload}
            onFocus={connectSheet.preload}
          >
            {w('connect')}
          </Button>
        </div>
      }
    />
  );
}

function NoVaults({ data }: { data: MyVaults }) {
  const t = useT(messages);
  const { lang } = useLang();
  return (
    <EmptyState
      as="h2"
      testId="me-empty"
      className={CARD}
      // Past the newest `limit` entries the page has not looked, so it cannot say the wallet has no vault (R-T8-27).
      title={truncated(data) ? t('noneNewest', { limit: formatCount(data.limit, lang) }) : t('emptyTitle')}
      body={t('emptyBody')}
      action={
        <NavLink href={createHref('drill')} prefetch={false} className={buttonClass({ variant: 'primary' })}>
          {t('rehearse')}
        </NavLink>
      }
    />
  );
}

function Lists({ vaults }: { vaults: readonly MyVault[] }) {
  const sections = sectionsOf(vaults);
  return (
    <>
      <Overview sections={sections} />
      {SECTIONS.map((s) => (
        <SectionList key={s} section={s} vaults={sections[s]} />
      ))}
    </>
  );
}

/** The three lists at a glance, each a jump to its list: a long list of guarded vaults must not hide the heir's. */
function Overview({ sections }: { sections: Record<Section, MyVault[]> }) {
  const t = useT(messages);
  const { lang } = useLang();
  return (
    <nav aria-label={t('jumpLabel')} data-testid="me-overview">
      <ul className="grid grid-cols-3 overflow-hidden rounded-2xl border border-line bg-surface-1">
        {SECTIONS.map((s, at) => {
          const n = sections[s].length;
          return (
            <li key={s} className="min-w-0 border-line not-first:border-l">
              {/* The ring is drawn inside the cell: outside it, the strip's overflow-hidden would cut it down to a
                  line on a divider. The end cells take the strip's curve, so the ring and the tint follow it. */}
              <a
                href={`#me-${s}`}
                data-count={n}
                className={cn(
                  'flex h-full min-w-0 flex-col gap-1.5 px-3 py-3 transition-colors duration-150 hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:-outline-offset-4 sm:px-5 sm:py-4',
                  at === 0 && 'rounded-s-2xl',
                  at === SECTIONS.length - 1 && 'rounded-e-2xl',
                )}
              >
                <span className={cn('font-display text-h2 leading-none', n === 0 ? 'text-ink-muted' : 'text-ink')}>
                  {formatCount(n, lang)}
                </span>
                <span className="text-caption text-ink-muted sm:text-small">{t(SHORT[s])}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Under the lists and under the empty state alike: why a vault may be missing, and what being named means. */
function Notes({ data }: { data: MyVaults }) {
  const t = useT(messages);
  const { lang } = useLang();
  return (
    <div className="flex flex-col gap-2 text-ink-muted text-small">
      {truncated(data) ? (
        <p data-testid="me-truncated">
          {t('truncated', { indexed: formatCount(data.indexed, lang), limit: formatCount(data.limit, lang) })}
        </p>
      ) : null}
      <p data-testid="me-named">{t('namedNote')}</p>
    </div>
  );
}

function SectionList({ section, vaults }: { section: Section; vaults: MyVault[] }) {
  const t = useT(messages);
  const { lang } = useLang();
  const id = `me-${section}-title`;
  return (
    <section
      id={`me-${section}`}
      data-testid={`me-section-${section}`}
      aria-labelledby={id}
      // Below the sticky header when the overview jumps here.
      className="flex scroll-mt-24 flex-col gap-3"
    >
      <h2 id={id} className="flex items-baseline gap-3 font-display text-ink text-title">
        {t(TITLE[section])}
        {/* The list itself says how many items it has; the figure is for the eye. */}
        <span aria-hidden="true" className="voice-ledger text-ink-muted text-small">
          {formatCount(vaults.length, lang)}
        </span>
      </h2>
      {vaults.length === 0 ? (
        <p data-testid={`me-section-${section}-empty`} className="text-ink-muted text-small">
          {t(EMPTY[section])}
          {section === 'own' ? (
            <>
              {' '}
              <NavLink href={createHref('drill')} prefetch={false} className={LINK}>
                {t('rehearse')}
              </NavLink>
            </>
          ) : null}
        </p>
      ) : (
        <>
          <p className="text-ink-muted text-small">{t(HINT[section])}</p>
          <ul className="flex flex-col gap-3">
            {vaults.map((v) => (
              <VaultRow key={v.vault} vault={v} section={section} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function VaultRow({ vault: v, section }: { vault: MyVault; section: Section }) {
  const t = useT(messages);
  const l = useT(labels);
  const state = threadStateOf(v);
  const also = otherRoles(v.roles, section);
  return (
    <li
      data-testid="me-row"
      data-vault={v.vault}
      data-state={state}
      data-drill={v.drill ? 'true' : 'false'}
      className="relative flex flex-col gap-4 overflow-hidden rounded-2xl border border-line bg-surface-1 py-4 pr-4 pl-5 sm:flex-row sm:items-center sm:justify-between"
    >
      {/* The state's thread colour, as on the vault page; the badge says the state in words and a glyph. */}
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1 bg-current', THREAD_COLOR[state])} />
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StateBadge state={state} drill={v.drill} size="sm" />
          {also.map((r) => (
            <span key={r} className="text-caption text-ink-muted">
              {t(ALSO[r])}
            </span>
          ))}
        </div>
        {/* Below sm each label stands above its address, so the address keeps the width for its block of two rows
            of five; beside it, the label column took the few pixels that broke it into three ragged lines. */}
        <dl className="grid min-w-0 grid-cols-1 gap-y-0.5 text-small sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-x-3 sm:gap-y-1.5">
          <dt className="text-caption text-ink-muted sm:text-small">{t('vaultLabel')}</dt>
          <dd className="min-w-0">
            <Address address={v.vault} size="sm" />
          </dd>
          {section === 'own' ? null : (
            <>
              <dt className="mt-2 text-caption text-ink-muted sm:mt-0 sm:text-small">{l('roleOwner')}</dt>
              <dd className="min-w-0">
                <Address address={v.owner} size="sm" />
              </dd>
            </>
          )}
        </dl>
      </div>
      <NavLink
        href={vaultHref(v.vault)}
        prefetch={false}
        className={buttonClass({
          variant: 'secondary',
          size: 'sm',
          className: 'shrink-0 gap-1.5 self-start sm:self-center',
        })}
      >
        {t('open')}
        <VisuallyHidden>{` ${t('openVault', { vault: v.vault })}`}</VisuallyHidden>
        <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} />
      </NavLink>
    </li>
  );
}

function Terminal({ account }: { account: string | null }) {
  const t = useT(messages);
  return (
    <section
      data-testid="me-cli"
      aria-labelledby="me-cli-title"
      className="flex flex-col gap-3 border-line border-t pt-8"
    >
      <h2 id="me-cli-title" className="font-display text-ink text-title">
        {t('cliTitle')}
      </h2>
      <p className="text-ink-muted">{t('cliBody')}</p>
      <CommandLine command={vaultsCommand(account)} label={t('cliCopy')} />
    </section>
  );
}
