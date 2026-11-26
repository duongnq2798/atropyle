'use client';

import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { apiErrorCode } from '@/api/errors';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { untrusted } from '@/lib/untrusted';
import { messages as common } from '@/messages/common.messages';
import { messages } from '@/messages/tx.messages';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { ExternalLink } from '@/ui/external-link';
import { SkeletonText } from '@/ui/skeleton';
import { UntrustedText } from '@/ui/untrusted-text';
import { useErrorView } from './use-error-view';

/** The longest message shown as the title; the SDK already cuts an unclassified error's text to 500 characters. */
const MESSAGE_MAX = 200;

const LOCAL_LINK =
  'underline decoration-line-strong decoration-1 underline-offset-4 transition-colors duration-150 ' +
  'hover:decoration-thread';

/** Docs that ship with this site (`/docs/…`) open in place; the SDK's docs site opens in a new tab. */
function DocsLink({ href, children }: { href: string; children: ReactNode }) {
  if (href.startsWith('/')) {
    return (
      <a href={href} className={LOCAL_LINK}>
        {children}
      </a>
    );
  }
  return <ExternalLink href={href}>{children}</ExternalLink>;
}

/**
 * Any error, described by the SDK: the message as the title, the hint, the code and a docs link chosen by the code
 * (never a URL from the message). The revert reason of an unknown revert is shown apart, as untrusted text. A backend
 * error (ApiError) is worded by its code alone (src/api/errors.ts), never by its message. For an error the SDK cannot
 * classify, the message is the wallet's or the RPC's own text, so the title is cleaned like untrusted text (no bidi
 * override or hidden character) and isolated from the surrounding text direction.
 */
export function ErrorBox({
  error,
  onRetry,
  testId = 'error',
  className,
  bare,
}: {
  error: unknown;
  onRetry?(): void;
  testId?: string;
  className?: string;
  /**
   * Inside a box that already says what went wrong in its own words (the sign page's verdict): no frame, no alert and
   * no hint, whose advice could contradict the box's. 'message' leads with the error's message, 'code' gives only the
   * code and the docs link. A revert reason and Retry stay in both.
   */
  bare?: 'message' | 'code';
}) {
  const c = useT(common);
  const t = useT(messages);
  const { view, unavailable } = useErrorView(error);
  // The SDK's words and this site's hints for them are English: a Vietnamese page marks them as such until they are
  // translated (parked T14 184). A backend error is worded in the reader's language by its code.
  const english = apiErrorCode(error) === null ? 'en' : undefined;
  if (error === null || error === undefined) return null;

  const retry = onRetry ? (
    <Button variant="secondary" size="sm" onClick={onRetry} icon={<RotateCcw aria-hidden="true" strokeWidth={1.5} />}>
      {c('retry')}
    </Button>
  ) : null;

  // The revert reason of an unknown revert, and the code with its docs: the same in the banner and bare.
  const reason = (gap?: string) =>
    view?.reason ? (
      <p className={cn('flex flex-col items-start gap-1', gap)}>
        <span>{t('reason')}</span>
        <UntrustedText
          value={view.reason}
          max={160}
          className="rounded-lg bg-surface-2 px-2 py-1 font-mono text-caption text-ink"
        />
      </p>
    ) : null;
  const code = view ? (
    <>
      <span className="inline-flex text-caption">
        <span className="sr-only">{t('errorCode')}</span>
        <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-ink">{view.code}</code>
      </span>
      <DocsLink href={view.docsUrl}>{t('readDocs')}</DocsLink>
    </>
  ) : null;

  if (bare) {
    if (view) {
      return (
        <div data-testid={testId} data-code={view.code} className={cn('flex flex-col gap-3', className)}>
          {bare === 'message' ? (
            <p className="break-words">
              <bdi lang={english}>{untrusted(view.message, MESSAGE_MAX).value}</bdi>
            </p>
          ) : null}
          {reason()}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption">
            {code}
            {retry}
          </div>
        </div>
      );
    }
    // The box around says what went wrong; without the decoder only its message is missing.
    if (unavailable)
      return bare === 'message' || retry ? (
        <div data-testid={testId} className={cn('flex flex-col items-start gap-3', className)}>
          {bare === 'message' ? <p>{t('errorUnavailable')}</p> : null}
          {retry}
        </div>
      ) : null;
    return <SkeletonText lines={bare === 'message' ? 2 : 1} className={className} />;
  }

  if (view) {
    return (
      <div data-testid={testId} data-code={view.code} className={className}>
        <Banner
          tone="error"
          title={<bdi lang={english}>{untrusted(view.message, MESSAGE_MAX).value}</bdi>}
          className="break-words"
        >
          <p lang={english}>{view.hint}</p>
          {reason('mt-2')}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {code}
            {retry}
          </div>
        </Banner>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div data-testid={testId} className={className}>
        <Banner tone="error" title={c('error')} action={retry}>
          {t('errorUnavailable')}
        </Banner>
      </div>
    );
  }

  // The decoder is a cached chunk away: hold the place without announcing anything yet.
  return (
    <div aria-hidden="true" className={cn('rounded-2xl border border-danger/45 bg-danger/8 p-4', className)}>
      <SkeletonText lines={2} />
    </div>
  );
}
