'use client';

import { type FormEvent, useState } from 'react';
import type { Address as Addr } from 'viem';
import { useT } from '@/i18n/provider';
import { isAddressText } from '@/lib/address';
import { replaceHash, useLocationHash } from '@/lib/hash';
import { useMounted } from '@/lib/use-mounted';
import { messages } from '@/messages/verify-page.messages';
import { ErrorBox } from '@/tx/error-box';
import { Button } from '@/ui/button';
import { TextField } from '@/ui/text-field';
import { useVaultVerify } from '@/verify/hooks';
import { ADDRESS_PLACEHOLDER, LINE_IDS, type LineId, verifyCommand } from './lines';
import { VerifyLoadingBody, VerifyReport, VerifyShell, type VerifySite } from './verify-report';

/** The checks of one vault: the cheap rows first, then the policy proof in the worker. */
export function VerifyScreen({ vault, site }: { vault: Addr; site: VerifySite }) {
  const quick = useVaultVerify(vault, false);
  // The 2^26-input proof starts once the cheap checks are in, so those show at once (the old page's order). It joins
  // the session's proof when /proof/ or another vault already started it.
  const full = useVaultVerify(quick.status === 'done' ? vault : null, true);
  if (quick.status === 'error') {
    return (
      <VerifyShell vault={vault} explorer={site.explorer}>
        <ErrorBox error={quick.error} onRetry={quick.retry} />
      </VerifyShell>
    );
  }
  if (!quick.result) {
    return (
      <VerifyShell vault={vault} explorer={site.explorer}>
        <VerifyLoadingBody />
      </VerifyShell>
    );
  }
  return (
    <VerifyShell vault={vault} explorer={site.explorer} answered>
      <VerifyReport
        vault={vault}
        site={site}
        verification={full.result ?? quick.result}
        proofRunning={full.result === undefined && full.status !== 'error'}
        progress={full.progress}
        proofError={full.status === 'error' ? { error: full.error, retry: full.retry } : null}
      />
    </VerifyShell>
  );
}

/** The first paint (prerender): the question, the shape of the answer, and without JavaScript the command. */
function VerifyLoading({ version }: { version: string }) {
  const t = useT(messages);
  return (
    <VerifyShell vault={null} explorer={null}>
      <VerifyLoadingBody />
      {/* Not a <noscript>: a browser that runs no script but parses with scripting on (a script blocker, Playwright
          without JavaScript) shows nothing of one (7C T3). The media feature follows what the page can run. */}
      <section
        data-testid="verify-noscript"
        className="hidden flex-col gap-3 rounded-2xl border border-line bg-surface-1 p-5 [@media(scripting:none)]:flex"
      >
        <p className="text-ink text-small">{t('noScript')}</p>
        <code className="voice-ledger break-words text-ink text-small">
          {verifyCommand(version, ADDRESS_PLACEHOLDER, null)}
        </code>
      </section>
    </VerifyShell>
  );
}

const WHAT = {
  real: ['lineReal', 'lineRealHelp'],
  rules: ['lineRules', 'lineRulesHelp'],
  operators: ['lineOperators', 'lineOperatorsHelp'],
} as const satisfies Record<LineId, readonly [string, string]>;

/** `initial`: what the hash held when it was not an address, kept in the field so the reader sees what was wrong. */
function OpenVerify({ initial }: { initial: string }) {
  const t = useT(messages);
  const [text, setText] = useState(initial);
  const [error, setError] = useState(initial.length > 0);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = text.trim();
    // A same-route hash change goes through replaceHash: a <Link> leaves the reader stale without the Navigation API.
    if (isAddressText(v)) replaceHash(`#${v}`);
    else setError(true);
  };
  return (
    <div data-testid="verify-missing" className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6">
      <h1 className="font-display text-h1 text-ink">{t('missingTitle')}</h1>
      <p className="text-ink-muted text-lead">{t('missingBody')}</p>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <TextField
          label={t('openLabel')}
          mono
          value={text}
          autoComplete="off"
          spellCheck={false}
          data-testid="verify-open-input"
          error={error ? t('openInvalid') : undefined}
          className="flex-1"
          onChange={(e) => {
            setText(e.target.value);
            setError(false);
          }}
        />
        <Button type="submit" variant="primary" data-testid="verify-open" className="sm:mt-7">
          {t('open')}
        </Button>
      </form>
      <section aria-labelledby="verify-what-title" className="flex flex-col gap-4 border-line border-t pt-6">
        <h2 id="verify-what-title" className="font-display text-ink text-title">
          {t('missingWhat')}
        </h2>
        <ol data-testid="verify-what" className="flex flex-col gap-4">
          {LINE_IDS.map((id, i) => (
            <li key={id} className="flex gap-4">
              <span
                aria-hidden="true"
                className="voice-ledger grid size-8 shrink-0 place-items-center rounded-full border border-line-strong text-caption text-ink"
              >
                {i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-body text-ink">{t(WHAT[id][0])}</span>
                <span className="text-ink-muted text-small">{t(WHAT[id][1])}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** `/verify/#<address>`: the hash is read after mount ('' at prerender), so the first paint is the loading frame. */
export function VerifyPage({ site }: { site: VerifySite }) {
  const hash = useLocationHash();
  const mounted = useMounted();
  if (!mounted) return <VerifyLoading version={site.version} />;
  const text = hash.slice(1).trim();
  if (!isAddressText(text)) return <OpenVerify key={text} initial={text} />;
  return <VerifyScreen key={text.toLowerCase()} vault={text as Addr} site={site} />;
}
