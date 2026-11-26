'use client';

import type { StateName, VaultAction, VaultStatus } from '@atropyle/sdk';
import { useRef, useState } from 'react';
import type { Address as Addr } from 'viem';
import type { TransferRow } from '@/flows/impl/heir';
import type { VaultView } from '@/flows/impl/vault-view';
import { useT } from '@/i18n/provider';
import { messages as labels, ROLE_KEY } from '@/messages/labels.messages';
import { messages } from '@/messages/vault.messages';
import { Address } from '@/ui/address';
import { Button } from '@/ui/button';
import { connectSheet } from '@/wallet/connect-sheet-slot';
import { useWallet } from '@/wallet/provider';
import { actionFlowChunk, LazyActionFlow } from './lazy-action-flow';
import { preloadPanels } from './lazy-panels';
import { TransferTable } from './transfers';
import type { PanelProps } from './vault-page';

type VaultKey = keyof typeof messages.en;

const POKE: VaultAction = { type: 'poke' };
const DISTRIBUTE: VaultAction = { type: 'distribute' };

/** The poke says what it will do: status.pending is the state it makes. */
export const POKE_KEY = {
  active: 'pokeEnd',
  grace: 'poke',
  recovery: 'pokeRecovery',
  releasedInherit: 'pokeReleaseInherit',
  releasedRecover: 'pokeReleaseRecover',
} as const satisfies Record<StateName, VaultKey>;

/**
 * Its help says the same, from the same status.pending (fix round 2): once the time to cancel is over, a line that
 * still says "the owner can cancel" would contradict the header above it.
 */
export const POKE_HELP_KEY = {
  active: 'pokeHelpEnd',
  grace: 'pokeHelp',
  recovery: 'pokeHelpRecovery',
  releasedInherit: 'pokeHelpRelease',
  releasedRecover: 'pokeHelpReleaseRecover',
} as const satisfies Record<StateName, VaultKey>;

/** What the public actions offer this wallet now: GuestView titles its card by it, PublicActions renders it. */
export function publicOffers(view: VaultView, s: VaultStatus, pokeHeld: boolean) {
  // Signed by the owner of a vault not yet released, poke is a check-in (AtropyleVault.poke: _ownerAlive, then
  // _advance(true)): it cancels the alarm that its label would promise. The owner's check-in belongs to Task 10.
  const ownerChecksIn = view.roles.includes('owner') && !view.released;
  // status.pending is what a poke from anyone but the owner would do at this block (rule 18): offer it only when it
  // moves the vault, and keep a plan on screen while it is held.
  const canPoke = !ownerChecksIn && !view.expired && (s.pending !== s.state || pokeHeld);
  // Only once released: then an owner's distribute is no longer a check-in either. And only while the owner still
  // holds something the vault can move (rule 18): a second delivery would send nothing.
  const canDeliver = view.released && !view.expired && view.assets.some((x) => x.held > 0n);
  const recover = s.state === 'recovery' || s.state === 'releasedRecover';
  return { ownerChecksIn, canPoke, canDeliver, recover };
}

export interface PublicActionsProps extends PanelProps {
  /** Whether a poke plan is held: the caller owns it when it titles its card by the offers (GuestView). */
  held?: [boolean, (held: boolean) => void];
  /** The caller already said that anyone may act and where the assets go (GuestView's no-role line). */
  said?: boolean;
}

/** Spec §16.4 of the ecosystem spec: anyone can poke or distribute; the assets never go to the caller. */
export function PublicActions({ flows, sdk, loaded, view, account, onChanged, held, said }: PublicActionsProps) {
  const t = useT(messages);
  const own = useState(false);
  const [pokeHeld, setPokeHeld] = held ?? own;
  const [results, setResults] = useState<TransferRow[] | null>(null);
  const s = loaded.snap.status;
  const explorer = sdk.deployment.explorerUrl;
  const { ownerChecksIn, canPoke, canDeliver, recover } = publicOffers(view, s, pokeHeld);
  const idle = !ownerChecksIn && !canPoke && !canDeliver && !results;
  return (
    <div data-testid="vault-public" className="flex flex-col gap-6">
      {ownerChecksIn ? (
        <p data-testid="vault-public-owner" className="text-body text-ink-muted">
          {t('ownerPublic')}
        </p>
      ) : idle && !said ? (
        // Above an action its own help says it (pokeHelp, deliverHelp): said once (review fix 3).
        <p className="text-body text-ink-muted">{t(recover ? 'anyoneRecover' : 'anyone')}</p>
      ) : null}
      {s.state === 'releasedRecover' && s.recoveryTarget ? (
        <p className="flex flex-wrap items-center gap-2 text-small text-ink">
          {t('recoveryTo')} <Address address={s.recoveryTarget} explorer={explorer} size="sm" />
        </p>
      ) : null}
      {canPoke ? (
        <div className="flex flex-col gap-3">
          <p data-testid="vault-poke-help" className="text-small text-ink-muted">
            {t(POKE_HELP_KEY[s.pending])}
          </p>
          <LazyActionFlow
            flows={flows}
            sdk={sdk}
            vault={view.vault}
            drill={view.drill}
            action={POKE}
            as={account}
            label={t(POKE_KEY[s.pending])}
            testId="vault-poke"
            variant="secondary"
            onPlan={setPokeHeld}
            onDone={onChanged}
          />
        </div>
      ) : null}
      {canDeliver ? (
        <div className="flex flex-col gap-3">
          <p className="text-small text-ink-muted">
            {t(s.state === 'releasedRecover' ? 'deliverHelpRecover' : 'deliverHelp')}
          </p>
          <LazyActionFlow
            flows={flows}
            sdk={sdk}
            vault={view.vault}
            drill={view.drill}
            action={DISTRIBUTE}
            as={account}
            label={t('deliver')}
            testId="vault-distribute"
            tone="danger"
            onDone={(r) => {
              // One transaction: even a resumed send carries all of its events.
              setResults(flows.transferRows(r.steps.flatMap((x) => x.events)));
              onChanged(r);
            }}
          />
        </div>
      ) : null}
      {results ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-lead text-ink">{t('transfersTitle')}</h3>
          <TransferTable rows={results} view={view} explorer={explorer} testId="vault-transfers" />
        </div>
      ) : null}
      {idle ? (
        // Never to a late owner: "nothing needs doing" would be untrue for them (their line is vault-public-owner).
        // It answers "what can I do here", so it reads at body size.
        <p data-testid="vault-public-idle" className="text-body text-ink">
          {t('nothingToDo')}
        </p>
      ) : null}
    </div>
  );
}

/** The wallet sheet, and the signing UI and role panels that a connected wallet may need next. */
function warm() {
  connectSheet.preload();
  actionFlowChunk.preload();
  preloadPanels();
}

/**
 * A visitor: the invitation when no wallet is connected (spec §5.3), the public actions otherwise. A wallet with a
 * role whose panel has not come yet (PANELS) sees its roles named, then the public actions: never "no role". The owner
 * of a vault not yet released is offered no poke there (PublicActions): signed by them it is a check-in.
 */
export function GuestView(p: Omit<PanelProps, 'account'> & { account: Addr | null }) {
  const t = useT(messages);
  const l = useT(labels);
  const { openSheet } = useWallet();
  const title = useRef<HTMLHeadingElement>(null);
  const held = useState(false);
  const { account, view } = p;
  const offers = publicOffers(view, p.loaded.snap.status, held[0]);
  const heading = !account
    ? t('guestTitle')
    : view.roles.includes('owner')
      ? t('ownerTitle')
      : offers.canPoke || offers.canDeliver
        ? t('guestTitleConnected')
        : t('guestTitleIdle');
  const noRole = view.roles.length === 0;
  return (
    <section
      aria-labelledby="vault-guest-title"
      data-testid="vault-guest"
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-1 p-4 sm:p-6"
    >
      {/* Focus lands here when the wallet sheet closes on a connection: the Connect button is gone by then. */}
      <h2
        id="vault-guest-title"
        ref={title}
        tabIndex={-1}
        className="text-title text-ink focus-visible:outline-2 focus-visible:outline-thread"
      >
        {heading}
      </h2>
      {account ? (
        <>
          {noRole ? (
            <p data-testid="vault-no-role" className="text-body text-ink-muted">
              {t(offers.recover ? 'noRoleRecover' : 'noRole')}
            </p>
          ) : (
            <p data-testid="vault-your-roles" className="text-body text-ink">
              {t('roles', { roles: view.roles.map((r) => l(ROLE_KEY[r])).join(', ') })}
            </p>
          )}
          <PublicActions {...p} account={account} held={held} said={noRole} />
        </>
      ) : (
        <>
          <p className="text-body text-ink-muted">{t('guestBody')}</p>
          <Button
            data-testid="vault-guest-connect"
            className="self-start"
            onPointerEnter={warm}
            onFocus={warm}
            onClick={() =>
              // A wallet with a role swaps this section for its panel: focus then lands on the panel's region.
              openSheet(() => title.current ?? document.querySelector<HTMLElement>('[data-role-focus]'))
            }
          >
            {t('guestConnect')}
          </Button>
        </>
      )}
    </section>
  );
}
