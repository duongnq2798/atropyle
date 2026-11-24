'use client';

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as ui } from '@/messages/ui.messages';
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
  /**
   * Busy: a spinner with a hidden label takes the icon's place, and a press does nothing (also a submit). The button
   * stays focusable (aria-disabled, not `disabled`), so a keyboard user who pressed it keeps their place. A caller's
   * own `aria-busy` stays without it: busy but enabled, for a press that waits for a chunk (WalletButton).
   */
  loading?: boolean;
  /** What a screen reader hears for the spinner while loading; 'Loading…' by default. */
  loadingLabel?: string;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * The spinner's label in the page's language; a component of its own, so only a loading Button reads it. From
 * ui.messages, which the header already loads: common.messages added 1.4 kB gzip to the first load of /.
 */
function LoadingSpinner() {
  const t = useT(ui);
  return <Spinner size={16} label={t('loading')} />;
}

export function Button({
  variant,
  size,
  loading = false,
  loadingLabel,
  icon,
  disabled,
  children,
  className,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-disabled={disabled || loading || rest['aria-disabled'] || undefined}
      aria-busy={loading || rest['aria-busy'] || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      className={buttonClass({ variant, size, className })}
    >
      {loading ? (
        loadingLabel ? (
          <Spinner size={16} label={loadingLabel} />
        ) : (
          <LoadingSpinner />
        )
      ) : icon ? (
        <span className="inline-flex shrink-0 [&>svg]:size-4">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
