'use client';

import { cn } from '@/lib/cn';

/** A placeholder with the shape of the real content (size it with className). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative block overflow-hidden rounded-lg bg-surface-2', className)}>
      <span className="absolute inset-0 hidden bg-linear-to-r from-transparent via-surface-3 to-transparent motion-safe:block motion-safe:animate-shimmer" />
    </span>
  );
}

const WIDTHS = ['w-full', 'w-11/12', 'w-2/3'] as const;

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const rows = Array.from({ length: lines }, (_, at) => ({ at, width: WIDTHS[at % WIDTHS.length] }));
  return (
    <span aria-hidden="true" className={cn('flex flex-col gap-2', className)}>
      {rows.map((r) => (
        <Skeleton key={r.at} className={cn('h-3.5', r.width)} />
      ))}
    </span>
  );
}
