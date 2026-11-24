'use client';

import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip } from './tooltip';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** The accessible name, also shown as a tooltip. */
  label: string;
  size?: 'sm' | 'md';
  tooltip?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  icon: Icon,
  label,
  size = 'md',
  tooltip = true,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const button = (
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
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}
