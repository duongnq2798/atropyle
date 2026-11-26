import { toAddress } from '@atropyle/sdk';
import { useState } from 'preact/hooks';
import type { Address } from 'viem';
import { href } from '../lib/route';
import type { Sdk } from '../lib/sdk';
import { useApp, useT } from '../ui/app-context';
import { messages as common } from '../ui/common.messages';
import { AddressText, ErrorBox } from '../ui/components';
import { messages as labels, ROLE_KEY, STATE_KEY } from '../ui/labels.messages';
import { messages as shell } from '../ui/shell.messages';
import { useAsync } from '../ui/use-async';
import { messages } from './home.messages';

function OpenVault() {
  const t = useT(messages);
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const open = (e: Event) => {
    e.preventDefault();
    let vault: Address;
    try {
      vault = toAddress(value);
    } catch {
      setInvalid(true);
      return;
    }
    location.hash = href({ name: 'vault', vault });
  };
  return (
    <form class="card stack" data-testid="home-open-form" onSubmit={open}>
      <h2>{t('openTitle')}</h2>
      <label class="field">
        <span>{t('openLabel')}</span>
        <input
          data-testid="home-open-input"
          value={value}
          placeholder={'0x\u{2026}'}
          spellcheck={false}
          autocomplete="off"
          onInput={(e) => {
            setValue((e.target as HTMLInputElement).value);
            setInvalid(false);
          }}
        />
      </label>
      {invalid ? <p class="field-error">{t('openInvalid')}</p> : null}
      <button type="submit" class="btn" data-testid="home-open">
        {t('openButton')}
      </button>
    </form>
  );
}

function MyVaultList({ sdk, account }: { sdk: Sdk; account: Address }) {
  const t = useT(messages);
  const l = useT(labels);
  const c = useT(common);
  const list = useAsync(() => sdk.atro.vaultsOf(account), [sdk, account]);
  if (list.status === 'loading') return <p class="muted">{c('loading')}</p>;
  if (list.status === 'error') return <ErrorBox error={list.error} onRetry={list.reload} />;
  if (list.value.length === 0) {
    return (
      <p class="muted">
        {t('noVaults')} <a href={href({ name: 'create', drill: true })}>{t('drillCta')}</a>
      </p>
    );
  }
  return (
    <table class="table">
      <thead>
        <tr>
          <th>{t('colVault')}</th>
          <th>{t('colState')}</th>
          <th>{t('colRoles')}</th>
        </tr>
      </thead>
      <tbody>
        {list.value.map((v) => (
          <tr key={v.vault} data-testid={`my-vault-${v.vault.toLowerCase()}`} data-state={v.state}>
            <td>
              <a href={href({ name: 'vault', vault: v.vault })}>
                <AddressText address={v.vault} />
              </a>
              {v.drill ? (
                <>
                  {' '}
                  <span class="badge badge-warn">{l('drill')}</span>
                </>
              ) : null}
            </td>
            <td>{l(STATE_KEY[v.state])}</td>
            <td>{v.roles.map((r) => l(ROLE_KEY[r])).join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MyVaults({ sdk }: { sdk: Sdk }) {
  const app = useApp();
  const t = useT(messages);
  return (
    <section class="card stack" data-testid="my-vaults">
      <h2>{t('myVaults')}</h2>
      {app.wallet ? <MyVaultList sdk={sdk} account={app.wallet.account} /> : <p class="muted">{t('connectToSee')}</p>}
    </section>
  );
}

/** The chain counts and the full count live on the status page; the home page links there in one line. */
export function HomePage({ sdk }: { sdk: Sdk }) {
  const t = useT(messages);
  const s = useT(shell);
  return (
    <div class="stack">
      <section class="card stack">
        <h1>{t('title')}</h1>
        <p data-testid="home-tagline">{t('tagline')}</p>
        <div class="row">
          <a class="btn btn-primary btn-big" data-testid="home-drill" href={href({ name: 'create', drill: true })}>
            {t('drillCta')}
          </a>
          <a class="btn" href={href({ name: 'create', drill: false })}>
            {t('createCta')}
          </a>
          <a class="btn" href={href({ name: 'proof' })}>
            {t('proofCta')}
          </a>
        </div>
        <p class="muted">{t('drillNote')}</p>
      </section>
      <p class="muted" data-testid="home-status-note">
        {t('statusNote')}{' '}
        <a href={href({ name: 'status' })} data-testid="home-status-link">
          {s('navStatus')}
        </a>
        .
      </p>
      <OpenVault />
      <MyVaults sdk={sdk} />
    </div>
  );
}
