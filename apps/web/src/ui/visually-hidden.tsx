import type { ReactNode } from 'react';

/**
 * Text for screen readers only: Tailwind's `sr-only`, the same rules as Radix's VisuallyHidden. A plain span, since
 * Radix's brought its Primitive and Slot into every page's first load through Spinner (ruling R23).
 */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
