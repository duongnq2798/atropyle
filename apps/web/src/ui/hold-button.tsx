'use client';

import { CircleCheck } from 'lucide-react';
import * as m from 'motion/react-m';
import { type ButtonHTMLAttributes, type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as ui } from '@/messages/ui.messages';
import { usePrefersReducedMotion } from '@/motion/provider';
import { DURATION, EASE_OUT_EXPO, HOLD_MS, REDUCED_MS, SPRING, sec } from '@/motion/tokens';
import { useHold } from '@/motion/use-hold';
import {
  BAR_BOX,
  FACE_BOX,
  HOLD_HINT,
  OBJECT,
  OBJECT_BAR,
  OBJECT_BUTTON,
  OBJECT_COLUMN,
  OBJECT_FRAME,
} from './hold-object';

/**
 * A caller's pointer, key, context menu and blur handlers run before the hold's, and its `aria-describedby` joins
 * the hint. `onClick` is the hold's alone (assistive technology confirms through it), and the button is never a submit.
 */
export interface HoldButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'type'> {
  onConfirm(): void;
  children: ReactNode;
  icon?: ReactNode;
  /** `danger` for actions that cannot be undone. */
  tone?: 'thread' | 'danger';
  size?: 'md' | 'lg';
  duration?: number;
  /**
   * Replaces the default "Hold to confirm, or press Enter". A node, so a caller can say a live wait under a disabled
   * hold (the check-in ritual's seconds under "Waiting for X Layer", aria-hidden as they tick).
   */
  hint?: ReactNode;
  /**
   * Said once the hold is done, in place of "Confirmed"; null says nothing. A hold that only opens the wallet is not
   * a confirmation (R18.16): such a caller passes its own words ("Now confirm in your wallet").
   */
  doneLabel?: ReactNode;
  /** The knot that snaps in when the hold is done. False for a hold that only opens the wallet (R18.16). */
  showKnot?: boolean;
  /**
   * The button's face (spec §4.6.3 "one big button", §18.4.2 T10): the check-in ritual's thread. With a face the hold
   * is the ritual's object, not a pill: the face on top and the label on an accent bar under it, both in the button's
   * own box (one press target, one focus ring, one shake), the full width of its column up to 28rem. The caller moves
   * the face with onHoldStart and onHoldEnd.
   */
  face?: ReactNode;
  /** A hold began (a pointer or Space). Enter and an assistive click confirm without one. */
  onHoldStart?(): void;
  /** The hold ended: true once confirmed (Enter included, after onConfirm), false when let go early. */
  onHoldEnd?(confirmed: boolean): void;
}

/**
 * The words, the knot and the face of a hold, as TxCard and ActionFlow pass them through. `busyLabel` is TxCard's, not
 * the button's: the button's own words while its transaction is busy, in place of "Sending…". The check-in ritual
 * names each phase there ("Now sign in your wallet", then "Waiting for X Layer"): nothing is sent until the owner signs.
 */
export type HoldWords = Pick<
  HoldButtonProps,
  'hint' | 'doneLabel' | 'showKnot' | 'face' | 'onHoldStart' | 'onHoldEnd'
> & { busyLabel?: ReactNode };

const SIZE = {
  md: 'h-12 px-6 text-body gap-2',
  lg: 'h-16 px-10 text-lead gap-3',
} as const;

/** The caller's handler first, then the hold's: neither preventDefault() nor a throw in the caller's skips the hold. */
function compose<E>(theirs: ((e: E) => void) | undefined, ours: (e: E) => void): (e: E) => void {
  if (!theirs) return ours;
  return (e) => {
    try {
      theirs(e);
    } finally {
      ours(e);
    }
  };
}

const TONE = {
  thread: { fill: 'bg-thread/15', line: 'bg-thread', knot: 'bg-thread', hover: 'hover:border-thread' },
  danger: { fill: 'bg-danger/15', line: 'bg-danger', knot: 'bg-danger', hover: 'hover:border-danger' },
} as const;

/**
 * The check-in ritual (spec §4.6): hold to tie a knot on the thread. A thread runs under the label and tightens
 * while held; on release before the end it slackens and the button shakes, again on every early release; on
 * confirmation a knot snaps in. Under reduced motion the fill and the knot fade in place of growing, and nothing
 * shakes. The shake is a CSS keyframe (globals.css `atro-shake`), so the button brings no animation engine into the
 * first load.
 */
export function HoldButton({
  onConfirm,
  children,
  icon,
  tone = 'thread',
  size = 'lg',
  duration = HOLD_MS,
  hint,
  doneLabel,
  showKnot = true,
  face,
  onHoldStart,
  onHoldEnd,
  disabled,
  className,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onKeyDown,
  onKeyUp,
  onContextMenu,
  onBlur,
  'aria-describedby': describedBy,
  ...rest
}: HoldButtonProps) {
  const t = useT(ui);
  const hintId = useId();
  const calm = usePrefersReducedMotion();
  const [nudges, setNudges] = useState(0);
  const [keep, setKeep] = useState(false);
  const [shake, setShake] = useState(false);
  const shaking = useRef(shake);
  shaking.current = shake;
  const again = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ends = useRef({ onHoldStart, onHoldEnd });
  ends.current = { onHoldStart, onHoldEnd };

  const onCancel = useCallback(() => {
    setNudges((n) => n + 1);
    ends.current.onHoldEnd?.(false);
    if (calm) return;
    if (!shaking.current) {
      setShake(true);
      return;
    }
    // A second early release during the first shake (parked item 59): the attribute goes, then comes back, so the
    // keyframe runs again instead of being cut short.
    setShake(false);
    if (again.current !== null) clearTimeout(again.current);
    again.current = setTimeout(() => {
      again.current = null;
      setShake(true);
    }, 0);
  }, [calm]);

  const confirmed = useCallback(() => {
    try {
      onConfirm();
    } finally {
      ends.current.onHoldEnd?.(true);
    }
  }, [onConfirm]);

  const onStart = useCallback(() => ends.current.onHoldStart?.(), []);

  const { phase, bind } = useHold({ duration, disabled, onConfirm: confirmed, onCancel, onStart });

  useEffect(() => {
    if (nudges === 0) return;
    setKeep(true);
    const id = setTimeout(() => setKeep(false), 1400);
    return () => clearTimeout(id);
  }, [nudges]);

  // data-shake runs the keyframe once; dropping it when the shake ends lets the next early release run it again.
  useEffect(() => {
    if (!shake) return;
    const id = setTimeout(() => setShake(false), DURATION.slow);
    return () => clearTimeout(id);
  }, [shake]);

  useEffect(
    () => () => {
      if (again.current !== null) clearTimeout(again.current);
    },
    [],
  );

  const on = phase !== 'idle';
  const grow =
    phase === 'holding'
      ? { duration: sec(duration), ease: 'linear' as const }
      : { duration: sec(DURATION.quick), ease: EASE_OUT_EXPO };
  // Every target names both values: a value left without a target falls back to its first rendered one, and the
  // prerendered page renders with motion allowed (scaleX 0). reducedMotion="user" makes a scaleX step instant, so
  // at rest the calm fill fades out at full width and collapses in transitionEnd, once it is out of sight.
  const fill = calm
    ? on
      ? { opacity: 1, scaleX: 1 }
      : { opacity: 0, transitionEnd: { scaleX: 0 } }
    : { opacity: 1, scaleX: on ? 1 : 0 };
  // Under reduced motion the knot fades in REDUCED_MS at full size (parked item 59): no scale to cut.
  const knot = phase === 'done' ? { scale: 1, opacity: 1 } : calm ? { scale: 1, opacity: 0 } : { scale: 0, opacity: 0 };
  const knotMove = calm
    ? { duration: sec(REDUCED_MS) }
    : phase === 'done'
      ? SPRING
      : { duration: sec(DURATION.base), ease: EASE_OUT_EXPO };
  const c = TONE[tone];
  const o = OBJECT[tone];
  const press = {
    ...rest,
    onPointerDown: compose(onPointerDown, bind.onPointerDown),
    onPointerUp: compose(onPointerUp, bind.onPointerUp),
    onPointerLeave: compose(onPointerLeave, bind.onPointerLeave),
    onPointerCancel: compose(onPointerCancel, bind.onPointerCancel),
    onKeyDown: compose(onKeyDown, bind.onKeyDown),
    onKeyUp: compose(onKeyUp, bind.onKeyUp),
    onClick: bind.onClick,
    onContextMenu: compose(onContextMenu, bind.onContextMenu),
    onBlur: compose(onBlur, bind.onBlur),
    type: 'button' as const,
    disabled,
    'aria-describedby': describedBy ? `${describedBy} ${hintId}` : hintId,
    'data-phase': phase,
    'data-shake': shake ? '' : undefined,
  };
  const knotMark = (className: string) =>
    showKnot ? (
      <m.span
        aria-hidden
        data-part="knot"
        className={cn('absolute size-2.5 rounded-full', className)}
        initial={false}
        animate={knot}
        transition={knotMove}
      />
    ) : null;

  const button = face ? (
    <button {...press} className={cn(OBJECT_BUTTON, o.frame, className)}>
      <span data-part="face" className={FACE_BOX}>
        {face}
      </span>
      <span data-part="bar" className={cn(OBJECT_BAR, o.bar)}>
        <m.span
          aria-hidden
          className={cn('-z-10 absolute inset-0 origin-left', o.fill)}
          initial={false}
          animate={fill}
          transition={grow}
        />
        {icon ? <span className="inline-flex shrink-0">{icon}</span> : null}
        <span>{children}</span>
        {knotMark(cn('top-1/2 right-6 -translate-y-1/2', o.knot))}
      </span>
    </button>
  ) : (
    <button
      {...press}
      className={cn(
        'relative isolate inline-flex select-none items-center justify-center overflow-hidden rounded-full',
        'touch-manipulation border border-line-strong bg-surface-2 font-medium text-ink',
        'transition-[border-color,background-color] duration-150 ease-out-expo motion-safe:data-shake:animate-shake',
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
      <span aria-hidden data-part="underline" className="absolute inset-x-8 bottom-2.5 h-px bg-line" />
      <m.span
        aria-hidden
        className={cn('absolute inset-x-8 bottom-2.5 h-0.5 origin-left rounded-full', c.line)}
        initial={false}
        animate={fill}
        transition={grow}
      />
      {knotMark(cn('right-7 bottom-1.5', c.knot))}
    </button>
  );

  return (
    <span className={face ? OBJECT_COLUMN : 'inline-flex flex-col items-center gap-2'}>
      {button}
      <span id={hintId} aria-live="polite" className={HOLD_HINT}>
        {phase === 'done'
          ? doneLabel === undefined
            ? t('holdDone')
            : (doneLabel ?? '')
          : keep
            ? t('holdKeep')
            : (hint ?? t('holdHint'))}
      </span>
    </span>
  );
}

export interface HoldEndProps {
  /** The hold's face, as it is once the hold is over: the check-in ritual's thread with its tied knot. */
  face: ReactNode;
  /**
   * The outcome, where the bar stood: the ritual's "Tied at block 1,234,567 · 4.1 s". Phrasing content (a span), since
   * it runs on from the check in front of it.
   */
  children?: ReactNode;
  tone?: 'thread' | 'danger';
  testId?: string;
}

/**
 * A hold with a face, once its transaction is recorded (TxCard `holdPlacement="top"`): the same object without the
 * button. Its column, frame and face box are the hold's own (OBJECT_COLUMN, OBJECT_FRAME, FACE_BOX), so the thread on
 * the face does not move and its pending knot fills in place; the frame is lit again in the tone, and the outcome
 * stands where the bar stood, in as much room. The band reads done, never disabled: it stands on the face's own paper
 * (no tint of its own, where the waiting bar was grey), under a rule in the tone, the outcome in ink after the check
 * the card's heading carries once done. Nothing in it can be pressed: what comes next is the caller's.
 */
export function HoldEnd({ face, children, tone = 'thread', testId }: HoldEndProps) {
  const o = OBJECT[tone];
  return (
    <div data-testid={testId} className={OBJECT_COLUMN}>
      <div className={cn(OBJECT_FRAME, o.frame)}>
        <span data-part="face" className={FACE_BOX}>
          {face}
        </span>
        <div data-part="end" className={cn('flex border-t px-4 py-3 text-center text-ink sm:px-6', BAR_BOX, o.end)}>
          {/* The check flows with the outcome's first line, so a wrapped outcome stays one centred block with it. */}
          <span className="text-balance">
            <CircleCheck
              aria-hidden="true"
              size={20}
              strokeWidth={1.5}
              className={cn('mr-2 inline-block align-middle', o.check)}
            />
            {children}
          </span>
        </div>
      </div>
    </div>
  );
}
