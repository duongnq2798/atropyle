'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useKV } from '@/lib/kv';
import { KEYS } from '@/lib/store';

const PULSE_MS = 12;

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** A 12 ms pulse on check-in and after signing (spec §4.4), on devices that can, unless turned off. */
export function useHaptics(): { supported: boolean; enabled: boolean; setEnabled(on: boolean): void; pulse(): void } {
  const kv = useKV();
  const [enabled, setEnabledState] = useState(true);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setEnabledState(kv.get(KEYS.haptics) !== '0');
    setSupported(canVibrate());
  }, [kv]);

  const setEnabled = useCallback(
    (on: boolean) => {
      kv.set(KEYS.haptics, on ? '1' : '0');
      setEnabledState(on);
    },
    [kv],
  );

  // Read at the moment of the pulse: the setting may have changed in another component (the settings menu).
  const pulse = useCallback(() => {
    if (kv.get(KEYS.haptics) !== '0' && canVibrate()) navigator.vibrate(PULSE_MS);
  }, [kv]);

  return useMemo(() => ({ supported, enabled, setEnabled, pulse }), [supported, enabled, setEnabled, pulse]);
}
