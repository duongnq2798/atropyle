'use client';

import { useEffect, useState } from 'react';

/**
 * How many of `count` rows are lit: none until `active`, then one more every `stepMs`, so a finished proof lights its
 * properties one by one. `instant` lights them all at once: reduced motion, or a result the page already had when it
 * mounted (the reader came back from another page).
 */
export function useStagger(count: number, active: boolean, instant: boolean, stepMs = 140): number {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    setLit(0);
    if (!active || instant) return;
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setLit(n);
      if (n >= count) clearInterval(id);
    }, stepMs);
    return () => clearInterval(id);
  }, [count, active, instant, stepMs]);
  if (!active) return 0;
  return instant ? count : Math.min(lit, count);
}
