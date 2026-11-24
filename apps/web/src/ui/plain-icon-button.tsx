'use client';

import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/cn';

export interface PlainIconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** The accessible name. */
  label: string;
  size?: 'sm' | 'md';
  ref?: Ref<HTMLButtonElement>;
}

/**
 * An icon button without a tooltip. The shell's own buttons (Menu, Settings, the close buttons) use it, so the
 * Radix tooltip and its positioning engine stay out of the first load (ruling R23); IconButton adds the tooltip.
 */
export function PlainIconButton({
  icon: Icon,
  label,
  size = 'md',
  className,
  type = 'button',
  ...rest
}: PlainIconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors duration-150',
        'hover:bg-surface-2 hover:text-ink disabled:opacity-50',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
    >
      <Icon aria-hidden="true" size={size === 'sm' ? 16 : 18} strokeWidth={1.5} />
    </button>
  );
}
