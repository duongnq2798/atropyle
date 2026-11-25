'use client';

import { cn } from '@/lib/cn';
import { type Untrusted, untrusted } from '@/lib/untrusted';

export function isUntrusted(v: unknown): v is Untrusted {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as Untrusted).untrusted === true &&
    typeof (v as Untrusted).value === 'string'
  );
}

/**
 * Text read from the chain (token names, symbols, revert reasons): cleaned again, truncated, isolated from the
 * surrounding text direction with <bdi>, and only ever a text node. Never HTML, never a link.
 */
export function UntrustedText({ value, max = 64, className }: { value: unknown; max?: number; className?: string }) {
  const u = untrusted(isUntrusted(value) ? value.value : value, max);
  return (
    <bdi data-untrusted="" className={cn('break-words', className)}>
      {u.value}
    </bdi>
  );
}
