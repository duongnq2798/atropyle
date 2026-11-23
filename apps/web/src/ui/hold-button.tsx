'use client';

import { m, useAnimate } from 'motion/react';
import { type ButtonHTMLAttributes, type ReactNode, useCallback, useEffect, useId, useState } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as ui } from '@/messages/ui.messages';
import { usePrefersReducedMotion } from '@/motion/provider';
import { DURATION, EASE_OUT_EXPO, HOLD_MS, SPRING, sec } from '@/motion/tokens';
import { type HoldBind, useHold } from '@/motion/use-hold';

/** The handlers `useHold` binds and the hint's `aria-describedby` belong to the button; a caller's would be lost. */
export interface HoldButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof HoldBind | 'aria-describedby' | 'children' | 'type'> {
  onConfirm(): void;
  children: ReactNode;
  icon?: ReactNode;
  /** `danger` for actions that cannot be undone. */
  tone?: 'thread' | 'danger';
  size?: 'md' | 'lg';
  duration?: number;
  /** Replaces the default "Hold to confirm, or press Enter". */
  hint?: string;
}

const SIZE = {
  md: 'h-12 px-6 text-body gap-2',
  lg: 'h-16 px-10 text-lead gap-3',
} as const;

const TONE = {
  thread: { fill: 'bg-thread/15', line: 'bg-thread', knot: 'bg-thread', hover: 'hover:border-thread' },
  danger: { fill: 'bg-danger/15', line: 'bg-danger', knot: 'bg-danger', hover: 'hover:border-danger' },
} as const;

/**
 * The check-in ritual (spec §4.6): hold to tie a knot on the thread. A thread runs under the label and tightens
 * while held; on release before the end it slackens and the button shakes once; on confirmation a knot snaps in.
 * Under reduced motion the fill fades in place of growing, and nothing shakes.
 */
export function HoldButton({
  onConfirm,
  children,
  icon,
  tone = 'thread',
  size = 'lg',
  duration = HOLD_MS,
  hint,
  disabled,
  className,
  ...rest
}: HoldButtonProps) {
  const t = useT(ui);
  const hintId = useId();
  const calm = usePrefersReducedMotion();
  const [scope, animate] = useAnimate<HTMLButtonElement>();
  const [nudges, setNudges] = useState(0);
  const [keep, setKeep] = useState(false);

  const onCancel = useCallback(() => {
    setNudges((n) => n + 1);
    if (!calm && scope.current) {
      animate(scope.current, { x: [0, -5, 5, -3, 3, 0] }, { duration: sec(DURATION.slow), ease: 'easeOut' });
    }
  }, [calm, animate, scope]);

  const { phase, bind } = useHold({ duration, disabled, onConfirm, onCancel });

  useEffect(() => {
    if (nudges === 0) return;
    setKeep(true);
    const id = setTimeout(() => setKeep(false), 1400);
    return () => clearTimeout(id);
  }, [nudges]);

  const on = phase !== 'idle';
  const grow =
    phase === 'holding'
      ? { duration: sec(duration), ease: 'linear' as const }
      : { duration: sec(DURATION.quick), ease: EASE_OUT_EXPO };
  // Both targets name both values: a value left without a target falls back to its first rendered one, and the
  // prerendered page renders with motion allowed (scaleX 0). reducedMotion="user" makes the scaleX step instant.
  const fill = calm ? { opacity: on ? 1 : 0, scaleX: on ? 1 : 0 } : { opacity: 1, scaleX: on ? 1 : 0 };
  const c = TONE[tone];

  return (
    <span className="inline-flex flex-col items-center gap-2">
      <button
        {...rest}
        {...bind}
        ref={scope}
        type="button"
        disabled={disabled}
        aria-describedby={hintId}
        data-phase={phase}
        className={cn(
          'relative isolate inline-flex select-none items-center justify-center overflow-hidden rounded-full',
          'touch-manipulation border border-line-strong bg-surface-2 font-medium text-ink',
          'transition-[border-color,background-color] duration-150 ease-out-expo',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !disabled && c.hover,
          SIZE[size],
          className,
        )}
      >
        <m.span
          aria-hidden
          className={cn('-z-10 absolute inset-0 origin-left', c.fill)}
          initial={false}
          animate={fill}
          transition={grow}
        />
        {icon ? <span className="inline-flex shrink-0">{icon}</span> : null}
        <span>{children}</span>
        <span aria-hidden className="absolute inset-x-8 bottom-2.5 h-px bg-line" />
        <m.span
          aria-hidden
          className={cn('absolute inset-x-8 bottom-2.5 h-0.5 origin-left rounded-full', c.line)}
          initial={false}
          animate={fill}
          transition={grow}
        />
        <m.span
          aria-hidden
          className={cn('absolute right-7 bottom-1.5 size-2.5 rounded-full', c.knot)}
          initial={false}
          animate={phase === 'done' ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={phase === 'done' ? SPRING : { duration: sec(DURATION.base), ease: EASE_OUT_EXPO }}
        />
      </button>
      <span id={hintId} aria-live="polite" className="text-caption text-ink-muted">
        {phase === 'done' ? t('holdDone') : keep ? t('holdKeep') : (hint ?? t('holdHint'))}
      </span>
    </span>
  );
}
