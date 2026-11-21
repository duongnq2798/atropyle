import { render } from 'preact';
import { App } from './app';
import { ENV } from './env';
import { safeKV } from './lib/store';
import type { WalletWindow } from './lib/wallet';
import './styles.css';

render(
  <App
    env={ENV}
    kv={safeKV(() => window.localStorage)}
    win={window as unknown as WalletWindow}
    languages={navigator.languages ?? []}
  />,
  document.getElementById('app')!,
);
