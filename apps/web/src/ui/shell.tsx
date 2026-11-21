import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { docsHome } from '../lib/links';
import type { Route } from '../lib/route';
import type { WalletOption } from '../lib/wallet';
import { useApp, useT } from './app-context';
import { messages as common } from './common.messages';
import { ErrorBox, UntrustedText } from './components';
import { messages } from './shell.messages';

/** Language names are shown in their own language and are not translated. */
const LANG_NAMES = { en: 'English', vi: 'Tiếng Việt' } as const;

function WalletButton() {
  const app = useApp();
  const t = useT(messages);
  const [list, setList] = useState<WalletOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (app.wallet) {
    return (
      <div class="row">
        <span class="addr" data-testid="wallet-account">
          {app.wallet.account}
        </span>
        <button type="button" class="btn" onClick={app.disconnect}>
          {t('disconnect')}
        </button>
      </div>
    );
  }

  const pick = async (o: WalletOption) => {
    setBusy(true);
    setError(null);
    try {
      await app.connect(o);
      setList(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const found = await app.findWallets();
      if (found.length === 1) await pick(found[0]);
      else setList(found);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="stack">
      <button type="button" class="btn btn-primary" data-testid="connect" disabled={busy} onClick={open}>
        {busy ? t('connecting') : t('connect')}
      </button>
      {list && list.length === 0 ? <p class="muted">{t('noWallet')}</p> : null}
      {list && list.length > 1 ? (
        <div class="stack">
          <p>{t('chooseWallet')}</p>
          {list.map((o) => (
            <button type="button" class="btn row" key={o.id} onClick={() => pick(o)}>
              {o.icon ? <img src={o.icon} alt="" width={20} height={20} /> : null}
              <UntrustedText value={o.name} max={40} />
            </button>
          ))}
        </div>
      ) : null}
      {error ? <ErrorBox error={error} /> : null}
    </div>
  );
}

export function Shell({ route, children }: { route: Route; children: ComponentChildren }) {
  const app = useApp();
  const t = useT(messages);
  const c = useT(common);
  const [switchError, setSwitchError] = useState<unknown>(null);
  const chain = app.sdk?.atro.chain;
  const wrong = app.wallet && chain && app.wallet.chainId !== chain.id ? app.wallet.chainId : null;
  const otherLang = app.lang === 'en' ? 'vi' : 'en';
  return (
    <>
      <header class="site-header">
        <a class="brand" href="#/">
          Atropyle
        </a>
        <span class="beta" data-testid="beta">
          {c('beta')}
        </span>
        <nav class="nav">
          <a href="#/create">{t('navCreate')}</a>
          <a href="#/proof">{t('navProof')}</a>
          <a href="#/status">{t('navStatus')}</a>
          <a href="#/developers">{t('navDevelopers')}</a>
          <a href={docsHome(app.env.docsPath)}>{c('docs')}</a>
        </nav>
        <button type="button" class="btn" data-testid="lang" lang={otherLang} onClick={() => app.setLang(otherLang)}>
          {LANG_NAMES[otherLang]}
        </button>
        <WalletButton />
      </header>
      {app.sdkError ? (
        <div class="banner banner-error" role="alert" data-testid="sdk-error" data-code={app.sdkError.code}>
          {t('deploymentMissing')} <span class="mono">{app.sdkError.code}</span>
        </div>
      ) : null}
      {wrong !== null && chain ? (
        <div class="banner banner-warn" role="alert" data-testid="wrong-network">
          <p>{t('wrongNetwork', { actual: wrong, expected: chain.name, id: chain.id })}</p>
          <button
            type="button"
            class="btn btn-primary"
            data-testid="switch-network"
            onClick={() => app.switchChain().then(() => setSwitchError(null), setSwitchError)}
          >
            {t('switchNetwork', { expected: chain.name })}
          </button>
          {switchError ? <ErrorBox error={switchError} /> : null}
        </div>
      ) : null}
      <main class="page" data-route={route.name}>
        {children}
      </main>
      <footer>{t('footer')}</footer>
    </>
  );
}
