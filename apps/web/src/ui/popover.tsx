'use client';

import * as P from '@radix-ui/react-popover';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const PopoverClose = P.Close;

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = 'end',
  side = 'bottom',
  label,
  onCloseAutoFocus,
  className,
}: {
  trigger: ReactElement;
  children: ReactNode;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** The name of the content, a role="dialog": an unnamed one fails axe's aria-dialog-name rule. */
  label: string;
  /**
   * Where focus goes on close, for a popover whose trigger can be gone by then (Radix would focus the missing
   * trigger and leave focus on the page). Call `preventDefault()` after moving focus; otherwise Radix focuses the trigger.
   */
  onCloseAutoFocus?(event: Event): void;
  className?: string;
}) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          align={align}
          side={side}
          sideOffset={8}
          collisionPadding={12}
          aria-label={label}
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(
            'atro-pop z-50 min-w-56 rounded-2xl border border-line bg-surface-1 p-2 text-ink outline-none',
            'shadow-[0_24px_48px_-12px_rgb(0_0_0/0.45)]',
            className,
          )}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
