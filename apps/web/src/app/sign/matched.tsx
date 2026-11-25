'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

/** The hint under a typed address once it matches: a tick in the colour of a living vault, the words in ink. */
export function Matched({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ink">
      <Check aria-hidden="true" size={14} strokeWidth={2.25} className="shrink-0 text-alive" />
      {children}
    </span>
  );
}
