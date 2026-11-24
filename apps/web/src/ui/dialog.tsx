'use client';

import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as common } from '@/messages/common.messages';
import { IconButton } from './icon-button';

export interface DialogProps {
  open?: boolean;
  onOpenChange?(open: boolean): void;
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** A sheet from the bottom edge on narrow screens (the default); a centred box from 40rem. */
  sheet?: boolean;
  /** Where focus goes on close. Needed when there is no `trigger`; call `preventDefault()` after moving focus. */
  onCloseAutoFocus?(event: Event): void;
  className?: string;
}

const WIDTH = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-xl' } as const;

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  size = 'md',
  sheet = true,
  onCloseAutoFocus,
  className,
}: DialogProps) {
  const c = useT(common);
  // Radix links the description itself; without one, an explicit undefined tells it there is none on purpose.
  const describedBy = description ? {} : { 'aria-describedby': undefined };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <D.Trigger asChild>{trigger}</D.Trigger> : null}
      <D.Portal>
        <D.Overlay className="atro-overlay fixed inset-0 z-50 bg-bg/95 md:bg-bg/70 md:backdrop-blur-[3px]" />
        <D.Content
          {...describedBy}
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(
            'fixed z-50 flex max-h-[min(90dvh,48rem)] w-full flex-col gap-5 overflow-y-auto border border-line',
            'bg-surface-1 p-6 text-ink shadow-[0_32px_64px_-16px_rgb(0_0_0/0.55)] outline-none',
            sheet
              ? 'atro-dialog atro-sheet inset-x-0 bottom-0 rounded-t-3xl pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl'
              : 'atro-dialog top-1/2 left-1/2 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl',
            WIDTH[size],
            className,
          )}
        >
          {sheet ? (
            <div aria-hidden="true" className="-mt-2 mx-auto h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" />
          ) : null}
          <div className="flex flex-col gap-1.5 pr-10">
            <D.Title className="font-display text-title">{title}</D.Title>
            {description ? <D.Description className="text-small text-ink-muted">{description}</D.Description> : null}
          </div>
          {children}
          <D.Close asChild>
            <IconButton icon={X} label={c('close')} size="sm" tooltip={false} className="absolute top-4 right-4" />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
