'use client';

import { type RefObject, useEffect, useState } from 'react';

/**
 * True while `ref`'s element meets the viewport, shrunk by `rootMargin` (CSS margin syntax, as IntersectionObserver
 * takes it). False before the first answer of the observer; true in a browser without IntersectionObserver, so
 * nothing that waits on it waits for ever.
 */
export function useInView(ref: RefObject<Element | null>, rootMargin = '0px'): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setInView(last.isIntersecting);
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}
