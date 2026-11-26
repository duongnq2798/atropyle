'use client';

import type { StateName, VaultAction } from '@atropyle/sdk';
import { useRef, useState } from 'react';
import type { Address as Addr } from 'viem';
import type { TransferRow } from '@/flows/impl/heir';
import { useT } from '@/i18n/provider';
import { messages as labels, ROLE_KEY } from '@/messages/labels.messages';
import { messages } from '@/messages/vault.messages';
import { Address } from '@/ui/address';
import { Button } from '@/ui/button';
import { connectSheet } from '@/wallet/connect-sheet-slot';
import { useWallet } from '@/wallet/provider';
import { ActionFlow } from './action-flow';
import { TransferTable } from './transfers';
import type { PanelProps } from './vault-page';

type VaultKey = keyof typeof messages.en;

const POKE: VaultAction = { type: 'poke' };
const DISTRIBUTE: VaultAction = { type: 'distribute' };

/** The poke says what it will do: status.pending is the state it makes. */
const POKE_KEY = {
  active: 'pokeEnd',
  grace: 'poke',
  recovery: 'pokeRecovery',
  releasedInherit: 'pokeReleaseInherit',
  releasedRecover: 'pokeReleaseRecover',
} as const satisfies Record<StateName, VaultKey>;

/** Spec §16.4 of the ecosystem spec: anyone can poke or distribute; the assets never go to the caller. */
export function PublicActions({ flows, sdk, loaded, view, account, onChanged }: PanelProps) {
  const t = useT(messages);
  const [pokeHeld, setPokeHeld] = useState(false);
  const [results, setResults] = useState<TransferRow[] | null>(null);
  const s = loaded.snap.status;
  const explorer = sdk.deployment.explorerUrl;
  // Signed by the owner of a vault not yet released, poke is a check-in (AtropyleVault.poke: _ownerAlive, then
  // _advance(true)): it cancels the alarm that its label would promise. The owner's check-in belongs to Task 10.
  const ownerChecksIn = view.roles.includes('owner') && !view.released;
  // status.pending is what a poke from anyone but the owner would do at this block (rule 18): offer it only when it
  // moves the vault, and keep a plan on screen while it is held.
  const canPoke = !ownerChecksIn && !view.expired && (s.pending !== s.state || pokeHeld);
  // Only once released: then an owner's distribute is no longer a check-in either.
  const canDeliver = view.released && !view.expired;
  const recover = s.state === 'recovery' || s.state === 'releasedRecover';
  return (
    <div data-testid="vault-public" className="flex flex-col gap-6">
      {ownerChecksIn ? (
        <p data-testid="vault-public-owner" className="text-body text-ink-muted">
          {t('ownerPublic')}
        </p>
      ) : (
        <p className="text-body text-ink-muted">{t(recover ? 'anyoneRecover' : 'anyone')}</p>
      )}
      {s.state === 'releasedRecover' && s.recoveryTarget ? (
        <p className="flex flex-wrap items-center gap-2 text-small text-ink">
          {t('recoveryTo')} <Address address={s.recoveryTarget} explorer={explorer} size="sm" />
        </p>
      ) : null}
      {canPoke ? (
        <div className="flex flex-col gap-3">
          <p className="text-small text-ink-muted">{t('pokeHelp')}</p>
          <ActionFlow
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
          <ActionFlow
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
      {!ownerChecksIn && !canPoke && !canDeliver && !results ? (
        // Never to a late owner: "nothing needs doing" would be untrue for them (their line is vault-public-owner).
        <p data-testid="vault-public-idle" className="text-small text-ink-muted">
          {t('nothingToDo')}
        </p>
      ) : null}
    </div>
  );
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
  const { account, view } = p;
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
        {!account ? t('guestTitle') : view.roles.includes('owner') ? t('ownerTitle') : t('guestTitleConnected')}
      </h2>
      {account ? (
        <>
          {view.roles.length === 0 ? (
            <p data-testid="vault-no-role" className="text-body text-ink-muted">
              {t('noRole')}
            </p>
          ) : (
            <p data-testid="vault-your-roles" className="text-body text-ink">
              {t('roles', { roles: view.roles.map((r) => l(ROLE_KEY[r])).join(', ') })}
            </p>
          )}
          <PublicActions {...p} account={account} />
        </>
      ) : (
        <>
          <p className="text-body text-ink-muted">{t('guestBody')}</p>
          <Button
            data-testid="vault-guest-connect"
            className="self-start"
            onPointerEnter={connectSheet.preload}
            onFocus={connectSheet.preload}
            onClick={() => openSheet(() => title.current)}
          >
            {t('guestConnect')}
          </Button>
        </>
      )}
    </section>
  );
}
