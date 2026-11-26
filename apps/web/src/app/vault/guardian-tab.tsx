'use client';

import type { VaultAction } from '@atropyle/sdk';
import { useState } from 'react';
import type { Address as Addr } from 'viem';
import { SubscribeForm } from '@/components/subscribe/SubscribeForm';
import type { TargetCheck } from '@/flows/impl/guardian';
import { useT } from '@/i18n/provider';
import { isFramed } from '@/lib/framed';
import { useMounted } from '@/lib/use-mounted';
import { messages } from '@/messages/guardian.messages';
import { WarningText } from '@/tx/warning-text';
import { Address } from '@/ui/address';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/text-field';
import { PublicActions } from './guest';
import { LazyActionFlow } from './lazy-action-flow';
import type { PanelProps } from './vault-page';

const ATTEST_ON: VaultAction = { type: 'attestDeath', on: true };
const ATTEST_OFF: VaultAction = { type: 'attestDeath', on: false };
const WITHDRAW: VaultAction = { type: 'voteRecovery', target: null };

type FailReason = Exclude<TargetCheck, { ok: true }>['reason'];
const REASON_KEY = { invalid: 'targetInvalid', mismatch: 'targetMismatch' } as const satisfies Record<
  Exclude<FailReason, 'empty'>,
  keyof typeof messages.en
>;

/** An address is 42 characters: once both fields are that long, the check speaks without waiting for a blur. */
const FULL = 42;

/** The alerts form's role (an expression: a literal `role` reads as an ARIA role to the linter). */
const ALERTS_ROLE = 'guardian' as const;

const CARD = 'flex flex-col gap-4 rounded-2xl border border-line bg-surface-1 p-4 sm:p-6';

/**
 * The guardian's tab (spec §16.3): who the guardians are and what each has done, then attest and vote. The new wallet
 * is typed twice and never read from the URL; inside a frame nothing can be signed (a page inside another can be
 * dressed as this one). The warning to confirm out of band stands above every action, in the reader's words.
 */
export function GuardianTab(p: PanelProps) {
  const { flows, sdk, loaded, view, account, onChanged } = p;
  const t = useT(messages);
  const mounted = useMounted();
  const framed = mounted && isFramed(window);
  const snap = loaded.snap;
  const { k, recoveryEnabled } = snap.config;
  const explorer = sdk.deployment.explorerUrl;
  const rows = flows.guardianRows(snap, account);
  const me = rows.find((r) => r.me) ?? null;
  const attested = rows.filter((r) => r.attested).length;
  const votes = flows.tally(rows);
  const open = !view.released && !view.expired;

  return (
    <div data-testid="guardian-tab" className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h2 className="text-title text-ink">{t('title')}</h2>
        <p className="text-body text-ink-muted">{t('lead')}</p>
      </header>

      {open ? (
        <Banner tone="warn" title={t('warningTitle')} testId="guardian-warning">
          <WarningText warning={flows.GUARDIAN_WARNING} />
        </Banner>
      ) : null}

      <section aria-labelledby="guardian-rows-title" className={CARD}>
        <h3 id="guardian-rows-title" className="text-lead text-ink">
          {t('rowsTitle')}
        </h3>
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((r, i) => (
            <li
              key={r.guardian}
              data-testid={`guardian-row-${i}`}
              data-me={r.me ? 'true' : 'false'}
              data-attested={r.attested ? 'true' : 'false'}
              data-target={r.target ?? ''}
              className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Address address={r.guardian} explorer={explorer} size="sm" />
                {r.me ? <span className="text-caption text-thread">({t('rowYou')})</span> : null}
              </span>
              <span className="flex flex-wrap items-center gap-2 text-small text-ink-muted">
                {r.attested ? <span>{t('rowAttested')}</span> : null}
                {r.target ? (
                  <span className="flex min-w-0 items-center gap-2">
                    {t('rowVoted')} <Address address={r.target} explorer={explorer} size="sm" />
                  </span>
                ) : null}
                {!r.attested && !r.target ? <span>{t('rowNone')}</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <p data-testid="guardian-attest-count" data-count={attested} className="text-small text-ink">
          {t('attestCount', { count: attested, k })}
        </p>
        {recoveryEnabled ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-small text-ink">{t('tallyTitle')}</h4>
            {votes.length === 0 ? (
              <p data-testid="guardian-tally-empty" className="text-small text-ink-muted">
                {t('tallyEmpty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {votes.map((v, i) => (
                  <li
                    key={v.target}
                    data-testid={`guardian-tally-${i}`}
                    data-votes={v.votes}
                    className="flex flex-wrap items-center gap-2 text-small text-ink"
                  >
                    <Address address={v.target} explorer={explorer} size="sm" />
                    <span className="voice-ledger">{t('tallyVotes', { votes: v.votes, k })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </section>

      {!open ? (
        <p data-testid="guardian-closed" className="text-body text-ink-muted">
          {t(view.expired ? 'closedExpired' : 'closedReleased')}
        </p>
      ) : framed ? (
        <Banner tone="error" testId="guardian-framed">
          {t('framed')}
        </Banner>
      ) : me ? (
        <>
          <section aria-labelledby="guardian-attest-title" data-testid="guardian-attest-card" className={CARD}>
            <h3 id="guardian-attest-title" className="text-lead text-ink">
              {t('attestTitle')}
            </h3>
            <p className="text-small text-ink-muted">{t('attestHelp', { k })}</p>
            <LazyActionFlow
              key={me.attested ? 'off' : 'on'}
              flows={flows}
              sdk={sdk}
              vault={view.vault}
              drill={view.drill}
              action={me.attested ? ATTEST_OFF : ATTEST_ON}
              as={account}
              label={t(me.attested ? 'unattest' : 'attest')}
              testId={me.attested ? 'guardian-unattest' : 'guardian-attest'}
              variant={me.attested ? 'secondary' : 'danger'}
              tone={me.attested ? 'thread' : 'danger'}
              onDone={onChanged}
            />
          </section>
          {recoveryEnabled ? (
            <VoteCard {...p} myTarget={me.target} />
          ) : (
            <p data-testid="guardian-recovery-off" className="text-small text-ink-muted">
              {t('recoveryOff')}
            </p>
          )}
        </>
      ) : null}

      <section aria-labelledby="guardian-public-title" className="flex flex-col gap-4">
        <h3 id="guardian-public-title" className="text-lead text-ink">
          {t('publicTitle')}
        </h3>
        <PublicActions {...p} />
      </section>

      <SubscribeForm vault={view.vault} role={ALERTS_ROLE} />
    </div>
  );
}

/**
 * The recovery vote (spec §16.3): the new wallet typed or pasted twice, checked with its checksum (confirmTarget),
 * never read from the URL. The error waits for a blur, or for both fields to be full, so it never scolds a guardian
 * still typing; it is also said in a polite live region. While a plan is held, the fields are read only: the plan
 * signs the wallet shown, nothing else.
 */
function VoteCard({ flows, sdk, loaded, view, account, onChanged, myTarget }: PanelProps & { myTarget: Addr | null }) {
  const t = useT(messages);
  const explorer = sdk.deployment.explorerUrl;
  const { k } = loaded.snap.config;
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  const [blurred, setBlurred] = useState(false);
  const [held, setHeld] = useState(false);
  const [withdrawHeld, setWithdrawHeld] = useState(false);
  const check = flows.confirmTarget(first, second);
  const full = first.trim().length >= FULL && second.trim().length >= FULL;
  const reason = !check.ok && check.reason !== 'empty' && (blurred || full) ? check.reason : null;
  const error = reason ? (
    <span data-testid="guardian-target-error" data-reason={reason}>
      {t(REASON_KEY[reason])}
    </span>
  ) : undefined;
  return (
    <section aria-labelledby="guardian-vote-title" data-testid="guardian-vote-card" className={CARD}>
      <h3 id="guardian-vote-title" className="text-lead text-ink">
        {t('voteTitle')}
      </h3>
      <p className="text-small text-ink-muted">{t('voteHelp', { k })}</p>
      {myTarget || withdrawHeld ? (
        <div className="flex flex-col gap-3">
          {myTarget ? (
            <p data-testid="guardian-my-vote" className="flex flex-wrap items-center gap-2 text-small text-ink">
              {t('yourVote')} <Address address={myTarget} explorer={explorer} size="sm" />
            </p>
          ) : null}
          <LazyActionFlow
            flows={flows}
            sdk={sdk}
            vault={view.vault}
            drill={view.drill}
            action={WITHDRAW}
            as={account}
            label={t('withdraw')}
            testId="guardian-withdraw"
            variant="secondary"
            onPlan={setWithdrawHeld}
            onDone={onChanged}
          />
        </div>
      ) : null}
      <TextField
        label={t('targetFirst')}
        hint={t('targetHint')}
        mono
        value={first}
        onChange={(e) => setFirst(e.currentTarget.value)}
        readOnly={held}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        data-testid="guardian-target-1"
      />
      <TextField
        label={t('targetSecond')}
        mono
        value={second}
        onChange={(e) => setSecond(e.currentTarget.value)}
        onBlur={() => setBlurred(true)}
        readOnly={held}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={reason ? true : undefined}
        error={error}
        data-testid="guardian-target-2"
      />
      <p data-testid="guardian-target-live" aria-live="polite" className="sr-only">
        {reason ? t(REASON_KEY[reason]) : check.ok ? t('targetMatch') : ''}
      </p>
      {check.ok ? (
        <div
          data-testid="guardian-target-confirmed"
          data-target={check.target}
          className="flex flex-col gap-2 rounded-xl border border-thread/40 bg-thread/5 p-3"
        >
          <p className="text-small text-ink">{t('targetMatch')}</p>
          <Address address={check.target} explorer={explorer} />
        </div>
      ) : null}
      {check.ok ? (
        <LazyActionFlow
          key={check.target}
          flows={flows}
          sdk={sdk}
          vault={view.vault}
          drill={view.drill}
          action={{ type: 'voteRecovery', target: check.target }}
          as={account}
          label={t('vote')}
          testId="guardian-vote"
          variant="danger"
          tone="danger"
          onPlan={setHeld}
          onDone={onChanged}
        />
      ) : (
        <Button variant="danger" size="lg" className="self-start" disabled data-testid="guardian-vote">
          {t('vote')}
        </Button>
      )}
    </section>
  );
}
