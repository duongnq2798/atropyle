'use client';

import { type InputHTMLAttributes, type ReactNode, type Ref, useId } from 'react';
import { cn } from '@/lib/cn';
import { InlineError } from './inline-error';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Monospace with tabular figures: addresses, amounts, hashes. */
  mono?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({ label, hint, error, mono = false, className, ...rest }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="font-medium text-ink text-small">
        {label}
      </label>
      <input
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-11 w-full rounded-xl border bg-surface-1 px-3.5 text-body text-ink placeholder:text-ink-muted',
          'transition-colors duration-150 focus-visible:border-thread',
          error ? 'border-danger' : 'border-line-strong hover:border-ink-muted',
          mono && 'font-mono tabular-nums',
        )}
      />
      {hint ? (
        <p id={hintId} className="text-caption text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? <InlineError id={errorId}>{error}</InlineError> : null}
    </div>
  );
}
