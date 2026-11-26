'use client';

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { useT } from '@/i18n/provider';
import { messages as ui } from '@/messages/ui.messages';
import { type ButtonSize, type ButtonVariant, buttonClass } from './button-class';
import { Spinner } from './spinner';

export { type ButtonSize, type ButtonVariant, buttonClass } from './button-class';

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
