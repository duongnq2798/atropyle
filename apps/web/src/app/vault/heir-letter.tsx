'use client';

import type { SendResult, StateName, VaultAction } from '@atropyle/sdk';
import { type ReactNode, useState } from 'react';
import { useChainNow } from '@/chain/time';
import { SubscribeForm } from '@/components/subscribe/SubscribeForm';
import type { TransferRow } from '@/flows/impl/heir';
import { useLang, useT } from '@/i18n/provider';
import { Glossary } from '@/letter/glossary';
import { LetterSheet } from '@/letter/letter-sheet';
import { cn } from '@/lib/cn';
import { formatBps } from '@/lib/format';
import { explorerAddress, explorerName } from '@/lib/links';
import { chainDate } from '@/lib/when';
import { messages } from '@/messages/heir.messages';
import { messages as labels, THREAD_STATE_KEY } from '@/messages/labels.messages';
import { messages as vaultMessages } from '@/messages/vault.messages';
import { verifyHref } from '@/routes';
import { NavLink } from '@/shell/nav-link';
import { Thread } from '@/thread/thread';
import { Address } from '@/ui/address';
import { Amount } from '@/ui/amount';
import { buttonClass } from '@/ui/button';
import { ExternalLink } from '@/ui/external-link';
import { UntrustedText } from '@/ui/untrusted-text';
import { POKE_HELP_KEY, POKE_KEY, publicOffers } from './guest';
import { LazyActionFlow } from './lazy-action-flow';
import { letterOpening } from './letter-opening';
import { letterThread } from './letter-thread';
import { keepDate } from './standing';
import { TransferTable } from './transfers';
import type { PanelProps } from './vault-page';

const POKE: VaultAction = { type: 'poke' };
const DISTRIBUTE: VaultAction = { type: 'distribute' };

/** The pokes that move the vault toward this reader (R9): the alarm and the release, never the end of an alarm. */
const SERVES: Record<'heir' | 'recover', readonly StateName[]> = {
  heir: ['grace', 'releasedInherit'],
  recover: ['releasedRecover'],
};

/** The alerts form's role (an expression: a literal `role` reads as an ARIA role to the linter). */
const ALERTS_ROLE = 'heir' as const;

const lower = (a: string | null | undefined) => (a ?? '').toLowerCase();

/**
 * The heir letter (spec §16.2, §18.4.2 T11), for an heir and for the recovery wallet the guardians chose: a sheet of
 * vellum in the Letter voice that says where the vault stands, the reader's share on the vault's own thread, and who
 * receives what; then the three steps (check the circuit, move the vault on, receive), the words, and the alerts.
 */
export function HeirLetter(p: PanelProps) {
  const { flows, sdk, loaded, view, account } = p;
  const t = useT(messages);
  const l = useT(labels);
  const { lang } = useLang();
  const snap = loaded.snap;
  const s = snap.status;
  const explorer = sdk.deployment.explorerUrl;
  const recover =
    lower(s.recoveryTarget) === lower(account) && (s.state === 'recovery' || s.state === 'releasedRecover');
  const heir = snap.config.heirs.findIndex((h) => lower(h.account) === lower(account));
  const now =
    useChainNow({ blockTimestamp: s.blockTimestamp, fetchedAtMs: loaded.fetchedAtMs }, 30_000) ?? s.blockTimestamp;
  // Who would receive what if the vault passed to the heirs now: the branches' weights and the legend's amounts.
  const inherit = flows.recipientsFor(snap, 'releasedInherit', null);
  const thread = letterThread(snap.config, s, loaded.timeline, now, { heir, recover }, inherit);
  const opening = letterOpening(s, recover, lang);
  const next: StateName = recover || s.state === 'releasedRecover' ? 'releasedRecover' : 'releasedInherit';
  const shares = next === 'releasedInherit' ? inherit : flows.recipientsFor(snap, next, s.recoveryTarget);
  // The label says the stored state first; a dashed thread also says where it leads.
  const stateLabel = l(THREAD_STATE_KEY[s.expired ? 'expired' : s.state]);
  const threadLabel = thread.predicted
    ? t('threadLabelAhead', { state: stateLabel, ahead: l(THREAD_STATE_KEY[thread.state]) })
    : t('threadLabel', { state: stateLabel });
  const legend = !recover && heir >= 0 && thread.state === 'releasedInherit';

  return (
    <div
      data-testid="heir-letter"
      data-recover={recover ? 'true' : 'false'}
      data-opening={opening.key}
      className="flex flex-col gap-10"
    >
      <LetterSheet
        testId="heir-letter-sheet"
        labelledBy="heir-letter-title"
        signature={
          <>
            <p data-testid="heir-signed" data-ts={String(s.lastAlive)} className="voice-letter text-lead text-ink">
              {t('signed', { date: keepDate(chainDate(s.lastAlive, lang, true)) })}
            </p>
            <p className="flex flex-wrap items-center gap-2 text-small text-ink-muted">
              <span className="voice-ledger">{t('from')}</span>
              <Address address={view.owner} explorer={explorer} size="sm" />
            </p>
            {explorer ? (
              <ExternalLink href={explorerAddress(explorer, view.vault)}>
                {t('vaultOn', { name: explorerName(explorer) })}
              </ExternalLink>
            ) : null}
          </>
        }
      >
        <p className="flex flex-wrap items-center gap-2 text-small text-ink-muted">
          <span className="voice-ledger">{t('to')}</span>
          <Address address={account} explorer={explorer} size="sm" />
        </p>
        <h2 id="heir-letter-title" className="voice-letter text-h2 text-ink">
          {t(recover ? 'titleRecover' : 'title')}
        </h2>
        <p data-testid="heir-opening" className="voice-letter text-lead text-ink">
          {t(opening.key, opening.params)}
        </p>
        <p data-testid="heir-body" className="voice-letter text-body text-ink">
          {t('body')}
        </p>
        {view.drill ? (
          <p data-testid="heir-drill" className="voice-letter text-small text-ink-muted">
            {t('drillNote')}
          </p>
        ) : null}

        <figure
          data-testid="heir-thread"
          data-thread-state={thread.state}
          data-predicted={thread.predicted ? 'true' : 'false'}
          data-highlight={thread.input.highlight ?? ''}
          className="flex flex-col gap-3"
        >
          <Thread state={thread.state} {...thread.input} label={threadLabel} className="h-24 w-full" />
          {legend ? (
            // Spec §18.4.2 T11: the legend is a list, "You · 30% · about 1,240 USDT0", one line per branch.
            <figcaption>
              <span className="sr-only">{t('legendTitle')}</span>
              <ul data-testid="heir-legend" className="flex flex-col gap-1.5 text-small text-ink-muted">
                {snap.config.heirs.map((h, i) => {
                  const you = i === heir;
                  const rows = inherit.filter((r) => lower(r.to) === lower(h.account));
                  return (
                    <li
                      key={h.account}
                      data-testid={`heir-legend-${i}`}
                      data-you={you ? 'true' : 'false'}
                      className="grid grid-cols-[0.625rem_minmax(0,1fr)] items-baseline gap-x-2.5"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'mt-[0.3125rem] size-2.5 self-start rounded-full',
                          you ? 'bg-thread' : 'bg-ink-muted/35',
                        )}
                      />
                      {/* On a phone the amounts take their own line under the name: no line starts with a dot. */}
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="inline-flex items-baseline gap-x-2 whitespace-nowrap">
                          <span className={you ? 'font-medium text-ink' : undefined}>
                            {you ? t('legendYou') : t('legendHeir', { n: String(i + 1) })}
                          </span>
                          <span aria-hidden>·</span>
                          <span className="voice-ledger">{formatBps(h.bps)}</span>
                        </span>
                        {rows.length > 0 ? (
                          <span className="flex basis-full flex-wrap items-baseline gap-x-2 sm:basis-auto">
                            <span aria-hidden className="hidden sm:inline">
                              ·
                            </span>
                            {rows.map((r, j) => {
                              const a = view.assets.find((x) => x.index === r.assetIndex);
                              return (
                                <span
                                  key={r.assetIndex}
                                  className="inline-flex items-baseline gap-x-2 whitespace-nowrap"
                                >
                                  {j > 0 ? <span aria-hidden>·</span> : null}
                                  {r.kind === 'erc20' && a ? (
                                    <span>
                                      {t('legendAbout')}{' '}
                                      <Amount
                                        raw={r.amount}
                                        decimals={a.info.decimals}
                                        symbol={a.info.symbol}
                                        className="voice-ledger"
                                      />
                                    </span>
                                  ) : (
                                    <span className="voice-ledger">
                                      {t('shareNft')} {a ? <UntrustedText value={a.info.symbol} max={16} /> : null}
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </figcaption>
          ) : null}
        </figure>

        <section aria-labelledby="heir-shares-title" className="flex flex-col gap-3">
          <h3 id="heir-shares-title" className="text-lead text-ink">
            {t('sharesTitle')}
          </h3>
          {s.state === 'releasedInherit' || s.state === 'releasedRecover' ? null : (
            <p className="text-caption text-ink-muted">{t('sharesCaption')}</p>
          )}
          {shares.length === 0 ? (
            <p data-testid="heir-share-empty" className="text-small text-ink-muted">
              {t('sharesEmpty')}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {shares.map((r, i) => {
                const a = view.assets.find((x) => x.index === r.assetIndex);
                const you = lower(r.to) === lower(account);
                return (
                  <li
                    key={`${r.assetIndex}-${r.to}`}
                    data-testid={`heir-share-${i}`}
                    data-you={you ? 'true' : 'false'}
                    data-amount={String(r.amount)}
                    className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Address address={r.to} explorer={explorer} size="sm" />
                      {you ? <span className="text-caption text-thread">({t('shareYou')})</span> : null}
                    </span>
                    <span className="flex flex-col items-start gap-1 sm:items-end">
                      {r.kind === 'erc20' && a ? (
                        <Amount
                          raw={r.amount}
                          decimals={a.info.decimals}
                          symbol={a.info.symbol}
                          className="voice-ledger"
                        />
                      ) : (
                        <span className="voice-ledger text-small">
                          {t('shareNft')} {a ? <UntrustedText value={a.info.symbol} max={16} /> : null}
                        </span>
                      )}
                      {view.lowCoverage.includes(r.assetIndex) ? (
                        <span data-testid={`heir-share-${i}-uncovered`} className="text-caption text-ink-muted">
                          {t('shareUncovered')}
                        </span>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </LetterSheet>

      <section aria-labelledby="heir-steps-title" data-testid="heir-steps" className="flex flex-col gap-6">
        <h2 id="heir-steps-title" className="text-title text-ink">
          {t('stepsTitle')}
        </h2>
        <ol className="flex flex-col">
          <Step n={1} title={t('stepVerify')}>
            <p className="text-small text-ink-muted">{t('stepVerifyHelp')}</p>
            <NavLink
              href={verifyHref(view.vault)}
              prefetch={false}
              data-testid="heir-verify"
              className={buttonClass({ variant: 'secondary', size: 'md', className: 'self-start' })}
            >
              {t('stepVerifyGo')}
            </NavLink>
          </Step>
          <Step n={2} title={t('stepMoveTitle')}>
            <MoveStep {...p} recover={recover} />
          </Step>
          <Step n={3} title={t('stepReceiveTitle')} last>
            <ReceiveStep {...p} recover={recover} />
          </Step>
        </ol>
      </section>

      <Glossary />
      <SubscribeForm vault={view.vault} role={ALERTS_ROLE} />
    </div>
  );
}

/**
 * One step of the three, on a rail: its number in a ring (the list itself numbers it for a screen reader), a line down
 * to the next step, then its heading and what it offers.
 */
function Step({ n, title, last = false, children }: { n: number; title: string; last?: boolean; children: ReactNode }) {
  return (
    <li className="relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-4">
      {last ? null : <span aria-hidden className="absolute top-11 bottom-2 left-[1.125rem] w-px bg-line" />}
      <span
        aria-hidden
        className="voice-ledger grid size-9 place-items-center rounded-full border border-line-strong bg-surface-1 text-small text-ink"
      >
        {n}
      </span>
      <div className={cn('flex min-w-0 flex-col gap-2 pt-1', last ? null : 'pb-8')}>
        <h3 className="text-lead text-ink">{title}</h3>
        {children}
      </div>
    </li>
  );
}

/** Step 2: the poke, only when it moves the vault toward this reader (R9), labelled by what it does. */
function MoveStep({ flows, sdk, loaded, view, account, onChanged, recover }: PanelProps & { recover: boolean }) {
  const t = useT(messages);
  const v = useT(vaultMessages);
  const [held, setHeld] = useState(false);
  const s = loaded.snap.status;
  const { canPoke } = publicOffers(view, s, held);
  const serves = canPoke && SERVES[recover ? 'recover' : 'heir'].includes(s.pending);
  if (!serves && !held)
    return (
      <p data-testid="heir-move-idle" className="text-small text-ink-muted">
        {t('stepMoveIdle')}
      </p>
    );
  return (
    <div className="flex flex-col gap-3">
      <p className="text-small text-ink-muted">{v(POKE_HELP_KEY[s.pending])}</p>
      <LazyActionFlow
        flows={flows}
        sdk={sdk}
        vault={view.vault}
        drill={view.drill}
        action={POKE}
        as={account}
        label={v(POKE_KEY[s.pending])}
        testId="heir-poke"
        variant="secondary"
        onPlan={setHeld}
        onDone={onChanged}
      />
    </div>
  );
}

/**
 * Step 3: Receive, a hold (spec §4.6), only once the vault has passed to this reader and the owner's wallet still holds
 * something covered (R10). The hold only opens the wallet: it says "Now confirm in your wallet" and ties no knot
 * (R18.16); the receipt's footer says the block. The flow stays on screen after the send even though the refreshed
 * vault no longer offers it, so the receipt and the transfers do not vanish.
 */
function ReceiveStep({ flows, sdk, loaded, view, account, onChanged, recover }: PanelProps & { recover: boolean }) {
  const t = useT(messages);
  const [held, setHeld] = useState(false);
  const [sent, setSent] = useState<SendResult | null>(null);
  const [results, setResults] = useState<TransferRow[] | null>(null);
  const s = loaded.snap.status;
  const explorer = sdk.deployment.explorerUrl;
  const { canDeliver } = publicOffers(view, s, false);
  const mine = s.state === (recover ? 'releasedRecover' : 'releasedInherit');
  const offer = canDeliver && mine;
  if (!offer && !held && !sent)
    return (
      <p data-testid="heir-receive-idle" className="text-small text-ink-muted">
        {t('receiveIdle')}
      </p>
    );
  const block = sent?.steps.at(-1)?.blockNumber;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-ink-muted">{t(recover ? 'receiveHelpRecover' : 'receiveHelp')}</p>
      <LazyActionFlow
        flows={flows}
        sdk={sdk}
        vault={view.vault}
        drill={view.drill}
        action={DISTRIBUTE}
        as={account}
        label={t('receive')}
        testId="heir-receive"
        confirm="hold"
        tone="danger"
        hold={{ hint: t('receiveHint'), doneLabel: t('receiveDone'), showKnot: false }}
        receiptFooter={
          block !== undefined ? (
            <p data-testid="heir-received" data-block={String(block)} className="text-small text-ink">
              {t('received', { block: String(block) })}
            </p>
          ) : null
        }
        onPlan={setHeld}
        onDone={(r) => {
          setSent(r);
          // One transaction: even a resumed send carries all of its events.
          setResults(flows.transferRows(r.steps.flatMap((x) => x.events)));
          onChanged(r);
        }}
      />
      {results ? (
        <div className="flex flex-col gap-3">
          <h4 className="text-small text-ink">{t('resultsTitle')}</h4>
          <TransferTable rows={results} view={view} explorer={explorer} testId="heir-results" />
        </div>
      ) : null}
    </div>
  );
}
