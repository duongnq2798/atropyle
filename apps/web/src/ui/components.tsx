import { type TokenInfo, type Untrusted, untrusted } from '@atropyle/sdk';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { getAddress, isAddress } from 'viem';
import { errorView } from '../lib/errors-view';
import { formatAmount } from '../lib/format';
import { explorerAddress, explorerName } from '../lib/links';
import type { Sdk } from '../lib/sdk';
import { useApp, useDocsPath, useT } from './app-context';
import { messages as common } from './common.messages';
import { messages as shell } from './shell.messages';

function isUntrusted(v: unknown): v is Untrusted {
  return typeof v === 'object' && v !== null && (v as Untrusted).untrusted === true;
}

/** The only way to show text read from a contract the vault does not control (spec §16.2). */
export function UntrustedText({ value, max = 64 }: { value: unknown; max?: number }) {
  const u = untrusted(isUntrusted(value) ? value.value : value, max);
  return <span class="untrusted">{u.value}</span>;
}

/** Full checksum address, never shortened (spec §16.2). */
export function AddressText({ address, explorer }: { address: string; explorer?: string | null }) {
  const shown = isAddress(address) ? getAddress(address) : address;
  return (
    <span class="addr">
      {shown}
      {explorer ? (
        <>
          {' '}
          <a href={explorerAddress(explorer, shown)} target="_blank" rel="noopener noreferrer">
            {explorerName(explorer)}
          </a>
        </>
      ) : null}
    </span>
  );
}

export function TokenAmount({ raw, token }: { raw: bigint; token: TokenInfo }) {
  const c = useT(common);
  return (
    <span class="mono">
      {formatAmount(raw, token.decimals)}{' '}
      {token.decimals === null ? c('baseUnits') : <UntrustedText value={token.symbol} max={16} />}
    </span>
  );
}

export function Banner(props: { kind: 'info' | 'warn' | 'error'; testid?: string; children: ComponentChildren }) {
  const cls = props.kind === 'info' ? 'banner' : `banner banner-${props.kind}`;
  return (
    <div class={cls} role={props.kind === 'info' ? undefined : 'alert'} data-testid={props.testid}>
      {props.children}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const docsPath = useDocsPath();
  const c = useT(common);
  const v = errorView(error, docsPath);
  return (
    <div class="banner banner-error" role="alert" data-testid="error" data-code={v.code}>
      <strong>{v.message}</strong>
      <p>{v.hint}</p>
      <p class="row muted">
        <span class="mono">{v.code}</span>
        <a href={v.docsUrl}>{c('docs')}</a>
        {onRetry ? (
          <button type="button" class="btn" onClick={onRetry}>
            {c('retry')}
          </button>
        ) : null}
      </p>
    </div>
  );
}

export function CopyButton({ text, label, testid }: { text: string; label?: string; testid?: string }) {
  const c = useT(common);
  const [done, setDone] = useState(false);
  const [manual, setManual] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      setManual(true); // clipboard blocked: show the text to copy by hand
    }
  };
  return (
    <span class="stack">
      <button type="button" class="btn" data-testid={testid} onClick={copy}>
        {done ? c('copied') : (label ?? c('copy'))}
      </button>
      {manual ? <textarea class="code" readOnly rows={4} value={text} /> : null}
    </span>
  );
}

export function RequireSdk({ children }: { children: (sdk: Sdk) => ComponentChildren }) {
  const app = useApp();
  const t = useT(shell);
  if (!app.sdk) {
    return (
      <div class="stack">
        <h1>{t('deploymentMissing')}</h1>
        <ErrorBox error={app.sdkError} />
      </div>
    );
  }
  return <>{children(app.sdk)}</>;
}
