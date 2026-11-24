'use client';

import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as common } from '@/messages/common.messages';
import { messages } from '@/messages/tx.messages';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { ExternalLink } from '@/ui/external-link';
import { SkeletonText } from '@/ui/skeleton';
import { UntrustedText } from '@/ui/untrusted-text';
import { useErrorView } from './use-error-view';

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
 * error (ApiError) is worded by its code alone (src/api/errors.ts), never by its message.
 */
export function ErrorBox({
  error,
  onRetry,
  testId = 'error',
  className,
}: {
  error: unknown;
  onRetry?(): void;
  testId?: string;
  className?: string;
}) {
  const c = useT(common);
  const t = useT(messages);
  const { view, unavailable } = useErrorView(error);
  if (error === null || error === undefined) return null;

  const retry = onRetry ? (
    <Button variant="secondary" size="sm" onClick={onRetry} icon={<RotateCcw aria-hidden="true" strokeWidth={1.5} />}>
      {c('retry')}
    </Button>
  ) : null;

  if (view) {
    return (
      <div data-testid={testId} data-code={view.code} className={className}>
        <Banner tone="error" title={view.message} className="break-words">
          <p>{view.hint}</p>
          {view.reason ? (
            <p className="mt-2 flex flex-col items-start gap-1">
              <span>{t('reason')}</span>
              <UntrustedText
                value={view.reason}
                max={160}
                className="rounded-lg bg-surface-2 px-2 py-1 font-mono text-caption text-ink"
              />
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex text-caption">
              <span className="sr-only">{t('errorCode')}</span>
              <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-ink">{view.code}</code>
            </span>
            <DocsLink href={view.docsUrl}>{t('readDocs')}</DocsLink>
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
