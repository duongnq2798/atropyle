'use client';

import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HOLD_MS } from './tokens';

export type HoldPhase = 'idle' | 'holding' | 'done';

export interface HoldOptions {
  duration?: number;
  disabled?: boolean;
  onConfirm(): void;
  /** Released early; `progress` is the share of the hold that was done (0–1). */
  onCancel?(progress: number): void;
}

export interface HoldBind {
  onPointerDown(e: PointerEvent<HTMLElement>): void;
  onPointerUp(): void;
  onPointerLeave(): void;
  onPointerCancel(): void;
  onKeyDown(e: KeyboardEvent<HTMLElement>): void;
  onKeyUp(e: KeyboardEvent<HTMLElement>): void;
  onClick(e: MouseEvent<HTMLElement>): void;
  onContextMenu(e: MouseEvent<HTMLElement>): void;
  onBlur(): void;
}

type Timer = { current: ReturnType<typeof setTimeout> | null };

function stop(t: Timer): void {
  if (t.current !== null) clearTimeout(t.current);
  t.current = null;
}

/** After a confirmation the control rests this long before it accepts another. */
const SETTLE_MS = 900;
/** A click this soon after a key we handled is the browser's own activation of that key, not a new action. */
const KEY_CLICK_MS = 250;

/**
 * Quyết định 20. Pointer: hold `duration` ms to confirm; release, leave or cancel before that and it is cancelled.
 * Enter confirms at once. Space is a hold. A click with `detail === 0` comes from assistive technology and
 * confirms; a mouse click (detail ≥ 1) does nothing. The timer, not the animation, decides.
 */
export function useHold({ duration = HOLD_MS, disabled = false, onConfirm, onCancel }: HoldOptions): {
  phase: HoldPhase;
  bind: HoldBind;
} {
  const [phase, setPhase] = useState<HoldPhase>('idle');
  const hold: Timer = useRef(null);
  const settle: Timer = useRef(null);
  const startedAt = useRef(0);
  const settling = useRef(false);
  const keyAt = useRef(-Infinity);
  const latest = useRef({ onConfirm, onCancel });

  useEffect(() => {
    latest.current = { onConfirm, onCancel };
  });

  const confirm = useCallback(() => {
    if (settling.current) return;
    stop(hold);
    settling.current = true;
    setPhase('done');
    latest.current.onConfirm();
    stop(settle);
    settle.current = setTimeout(() => {
      settling.current = false;
      setPhase('idle');
    }, SETTLE_MS);
  }, []);

  const start = useCallback(() => {
    if (disabled || settling.current || hold.current !== null) return;
    startedAt.current = Date.now();
    setPhase('holding');
    hold.current = setTimeout(confirm, duration);
  }, [disabled, duration, confirm]);

  const cancel = useCallback(() => {
    if (hold.current === null) return;
    stop(hold);
    setPhase('idle');
    latest.current.onCancel?.(Math.min(1, (Date.now() - startedAt.current) / duration));
  }, [duration]);

  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);

  useEffect(
    () => () => {
      stop(hold);
      stop(settle);
    },
    [],
  );

  const bind = useMemo<HoldBind>(
    () => ({
      onPointerDown: (e) => {
        if (e.button === 0) start();
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onKeyDown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          keyAt.current = Date.now();
          if (!e.repeat && !disabled) confirm();
        } else if (e.key === ' ') {
          e.preventDefault();
          keyAt.current = Date.now();
          if (!e.repeat) start();
        }
      },
      onKeyUp: (e) => {
        if (e.key !== ' ') return;
        e.preventDefault();
        keyAt.current = Date.now();
        cancel();
      },
      onClick: (e) => {
        if (e.detail !== 0 || disabled || Date.now() - keyAt.current < KEY_CLICK_MS) return;
        confirm();
      },
      onContextMenu: (e) => {
        e.preventDefault();
      },
      onBlur: cancel,
    }),
    [start, cancel, confirm, disabled],
  );

  return { phase, bind };
}
