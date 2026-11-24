'use client';

import { useEffect, useState } from 'react';

/** The wall clock, ticking every `intervalMs`; null until mounted so prerendered markup never depends on it. */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
