'use client';

import { CircleCheck, CircleExclamationPoint, Info, type LucideIcon, TriangleExclamationPoint, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as common } from '@/messages/common.messages';
import { IconButton } from './icon-button';

export type BannerTone = 'info' | 'warn' | 'error' | 'success';

const TONE: Record<BannerTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: 'border-line bg-surface-1', icon: 'text-recovery', Icon: Info },
  warn: { box: 'border-grace/45 bg-grace/8', icon: 'text-grace', Icon: TriangleExclamationPoint },
  error: { box: 'border-danger/45 bg-danger/8', icon: 'text-danger', Icon: CircleExclamationPoint },
  success: { box: 'border-alive/45 bg-alive/8', icon: 'text-alive', Icon: CircleCheck },
};

/** Only errors interrupt a screen reader (role="alert"); the rest is read in order. */
export function Banner({
  tone = 'info',
  title,
  children,
  action,
  onDismiss,
  testId,
  className,
}: {
  tone?: BannerTone;
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  onDismiss?(): void;
  testId?: string;
  className?: string;
}) {
  const c = useT(common);
  const { box, icon, Icon } = TONE[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      data-tone={tone}
      data-testid={testId}
      className={cn('flex items-start gap-3 rounded-2xl border p-4 text-ink text-small', box, className)}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.5} className={cn('mt-0.5 shrink-0', icon)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className="text-ink-muted [&_strong]:text-ink">{children}</div>
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
      {onDismiss ? (
        <IconButton icon={X} label={c('close')} size="sm" tooltip={false} onClick={onDismiss} className="-mt-1 -mr-1" />
      ) : null}
    </div>
  );
}
