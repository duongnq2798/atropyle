import { GUARDIAN_WARNING, type VaultSnapshot } from '@atropyle/sdk';
import { useRef, useState } from 'preact/hooks';
import type { Address } from 'viem';
import { confirmTarget, guardianRows, tally } from '../lib/guardian';
import { telegramLink } from '../lib/links';
import type { Sdk } from '../lib/sdk';
import type { VaultView } from '../lib/vault-view';
import { ActionRunner } from '../ui/action-runner';
import { useApp, useT } from '../ui/app-context';
import { messages as common } from '../ui/common.messages';
import { AddressText, Banner } from '../ui/components';
import { messages } from './guardian.messages';

const REASON_KEY = { invalid: 'reasonInvalid', mismatch: 'reasonMismatch' } as const;

export function GuardianPanel(props: {
  sdk: Sdk;
  snap: VaultSnapshot;
  view: VaultView;
  account: Address;
  onChanged: () => void;
}) {
  const { sdk, snap, view, account, onChanged } = props;
  const app = useApp();
  const t = useT(messages);
  const c = useT(common);
  // Both fields start empty on every visit: nothing here is ever read from the URL (spec §16.3).
  const [first, setFirst] = useState('');
  const [second, setSecond] = useState('');
  // True while a runner holds a prepared plan: its form must neither change nor unmount (the T11/T12 lock rule).
  const [voteHeld, setVoteHeld] = useState(false);
  const [withdrawHeld, setWithdrawHeld] = useState(false);
  const rows = guardianRows(snap, account);
  const me = rows.find((r) => r.me);
  const votes = tally(rows);
  const k = snap.config.k;
  const check = confirmTarget(first, second);
  // The last confirmed target: a held vote keeps voting for it even if the fields change after Send.
  const confirmed = useRef<Address | null>(null);
  if (check.ok) confirmed.current = check.target;
  const voteTarget = check.ok ? check.target : voteHeld ? confirmed.current : null;
  const open = !view.released && !view.expired;
  const bot = app.env.telegramBot;
  const value = (ev: Event) => (ev.target as HTMLInputElement).value;

  return (
    <div class="stack" data-testid="guardian-panel">
      <section class="card stack">
        <h2>{t('title')}</h2>
        <Banner kind="warn" testid="guardian-warning">
          <strong>{GUARDIAN_WARNING.message}</strong>
          <p>{t('plainWarning')}</p>
        </Banner>
        <table class="table" data-testid="guardian-votes">
          <thead>
            <tr>
              <th>{t('colGuardian')}</th>
              <th>{t('colAttested')}</th>
              <th>{t('colVote')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.guardian}
                data-testid={`guardian-row-${r.guardian.toLowerCase()}`}
                data-attested={String(r.attested)}
                data-target={r.target ?? ''}
              >
                <td>
                  <AddressText address={r.guardian} /> {r.me ? <span class="badge">{t('you')}</span> : null}
                </td>
                <td>{r.attested ? c('yes') : c('no')}</td>
                <td>{r.target ? <AddressText address={r.target} /> : <span class="muted">{t('noVote')}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="muted">{t('attestCount', { n: rows.filter((r) => r.attested).length, k })}</p>
        {votes.length > 0 ? (
          <ul>
            {votes.map((x) => (
              <li key={x.target} data-testid={`guardian-tally-${x.target.toLowerCase()}`}>
                <AddressText address={x.target} /> {t('tallyVotes', { votes: x.votes, k })}
              </li>
            ))}
          </ul>
        ) : null}
        {bot ? (
          <a class="btn" href={telegramLink(bot, view.vault, 'guardian')} target="_blank" rel="noopener noreferrer">
            {t('telegram')}
          </a>
        ) : null}
      </section>
      {open ? (
        <section class="card stack">
          <h3>{t('attestTitle')}</h3>
          <p class="muted">{t('attestHelp', { k })}</p>
          <ActionRunner
            sdk={sdk}
            vault={view.vault}
            action={{ type: 'attestDeath', on: !me?.attested }}
            as={account}
            label={me?.attested ? t('attestOff') : t('attestOn')}
            testid="guardian-attest"
            kind={me?.attested ? 'primary' : 'danger'}
            onDone={onChanged}
          />
        </section>
      ) : null}
      {open && snap.config.recoveryEnabled ? (
        <section class="card stack">
          <h3 data-testid="guardian-vote-title">{t('voteTitle')}</h3>
          <Banner kind="warn" testid="guardian-power">
            {t('power', { k })}
          </Banner>
          <p class="muted">{t('voteHelp')}</p>
          <label class="field">
            <span>{t('target')}</span>
            <input
              data-testid="guardian-target"
              value={first}
              placeholder="0x…"
              spellcheck={false}
              autocomplete="off"
              readOnly={voteHeld}
              onInput={(ev) => setFirst(value(ev))}
            />
          </label>
          <label class="field">
            <span>{t('targetAgain')}</span>
            <input
              data-testid="guardian-target-again"
              value={second}
              placeholder="0x…"
              spellcheck={false}
              autocomplete="off"
              readOnly={voteHeld}
              onInput={(ev) => setSecond(value(ev))}
            />
          </label>
          {!check.ok && check.reason !== 'empty' ? (
            <p class="field-error" data-testid="guardian-target-error" data-reason={check.reason}>
              {t(REASON_KEY[check.reason])}
            </p>
          ) : null}
          {voteTarget ? (
            <ActionRunner
              sdk={sdk}
              vault={view.vault}
              action={{ type: 'voteRecovery', target: voteTarget }}
              as={account}
              label={t('vote')}
              testid="guardian-vote"
              kind="danger"
              onPlan={setVoteHeld}
              onDone={onChanged}
            />
          ) : (
            <button type="button" class="btn btn-danger" data-testid="guardian-vote" disabled>
              {t('vote')}
            </button>
          )}
          {me?.target || withdrawHeld ? (
            <ActionRunner
              sdk={sdk}
              vault={view.vault}
              action={{ type: 'voteRecovery', target: null }}
              as={account}
              label={t('withdraw')}
              testid="guardian-withdraw"
              onPlan={setWithdrawHeld}
              onDone={onChanged}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
