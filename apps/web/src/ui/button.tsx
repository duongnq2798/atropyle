'use client';

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium ' +
  'transition-[background-color,border-color,color,translate,scale] duration-150 ease-out-expo ' +
  'motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-50';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-thread text-on-thread shadow-[inset_0_1px_0_0_rgb(255_255_255/0.18)] hover:bg-thread/90',
  secondary: 'border border-line-strong bg-surface-2 text-ink hover:border-thread hover:bg-surface-3',
  ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger text-on-danger hover:bg-danger/90',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-small',
  md: 'h-10 px-4 text-small',
  lg: 'h-12 px-6 text-body',
};

/** The button look, for links that act as buttons (`<Link className={buttonClass(...)}>`). */
export function buttonClass(o: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(BASE, VARIANT[o.variant ?? 'secondary'], SIZE[o.size ?? 'md'], o.className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Disables the button and shows a spinner in place of the icon. */
  loading?: boolean;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant,
  size,
  loading = false,
  icon,
  disabled,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, className })}
    >
      {loading ? (
        <Spinner size={16} />
      ) : icon ? (
        <span className="inline-flex shrink-0 [&>svg]:size-4">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
