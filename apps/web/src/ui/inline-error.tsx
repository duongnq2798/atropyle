'use client';

import { CircleExclamationPoint } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function InlineError({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <p id={id} className={cn('flex items-start gap-1.5 text-danger text-small', className)}>
      <CircleExclamationPoint aria-hidden="true" size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
