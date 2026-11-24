'use client';

import * as P from '@radix-ui/react-popover';
import { type ReactElement, type ReactNode, type RefObject, useRef } from 'react';
import { cn } from '@/lib/cn';

export const PopoverClose = P.Close;

interface ContentProps {
  children: ReactNode;
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
}

const contentClass = (className?: string) =>
  cn(
    'atro-pop z-50 min-w-56 rounded-2xl border border-line bg-surface-1 p-2 text-ink outline-none',
    'shadow-[0_24px_48px_-12px_rgb(0_0_0/0.45)]',
    className,
  );

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
}: ContentProps & {
  trigger: ReactElement;
  open?: boolean;
  onOpenChange?(open: boolean): void;
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
          className={contentClass(className)}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}

/**
 * A popover opened by a plain button that rendered before this file loaded (ui/lazy-overlay.ts, ruling R23). It
 * positions on that button and does for it what Radix does for its own trigger: a press on the button does not
 * dismiss the popover first (the button toggles it), and a close by Escape or by a choice inside gives focus back
 * to the button, while a close by a press or focus elsewhere leaves focus there.
 */
export function AnchoredPopover({
  anchor,
  id,
  open,
  onOpenChange,
  children,
  align = 'end',
  side = 'bottom',
  label,
  onCloseAutoFocus,
  className,
}: ContentProps & {
  anchor: RefObject<HTMLButtonElement | null>;
  /** The id of the content, for the button's aria-controls. */
  id: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const outside = useRef(false);
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Anchor virtualRef={anchor} />
      <P.Portal>
        <P.Content
          id={id}
          align={align}
          side={side}
          sideOffset={8}
          collisionPadding={12}
          aria-label={label}
          onInteractOutside={(event) => {
            if (event.target instanceof Node && anchor.current?.contains(event.target)) event.preventDefault();
            else outside.current = true;
          }}
          onCloseAutoFocus={(event) => {
            onCloseAutoFocus?.(event);
            if (!event.defaultPrevented) {
              event.preventDefault();
              if (!outside.current) anchor.current?.focus();
            }
            outside.current = false;
          }}
          className={contentClass(className)}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
