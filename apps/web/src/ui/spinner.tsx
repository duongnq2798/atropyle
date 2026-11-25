'use client';

import { cn } from '@/lib/cn';
import { VisuallyHidden } from './visually-hidden';

/** An arc that turns while motion is allowed; under reduced motion it stays still. */
export function Spinner({ label, size = 16, className }: { label?: string; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        className="motion-safe:animate-spin"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.5} />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      </svg>
      {label ? <VisuallyHidden>{label}</VisuallyHidden> : null}
    </span>
  );
}
