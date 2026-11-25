'use client';

import { useMemo } from 'react';
import { encode } from 'uqr';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as ui } from '@/messages/ui.messages';

/** One `h1v1` square per dark module, as a single path. */
export function qrPath(data: readonly (readonly boolean[])[]): string {
  let d = '';
  for (let y = 0; y < data.length; y++) {
    for (let x = 0; x < data[y].length; x++) if (data[y][x]) d += `M${x} ${y}h1v1h-1z`;
  }
  return d;
}

/**
 * Dark modules on paper in both themes: scanners read dark-on-light best, and an inverted code fails on some
 * phones. Quyết định 17: a path, not uqr's renderSVG, which returns an HTML string.
 */
export function QrCode({
  value,
  label,
  size = 192,
  className,
}: {
  value: string;
  label: string;
  size?: number;
  className?: string;
}) {
  const t = useT(ui);
  const data = useMemo(() => encode(value, { ecc: 'M', border: 2 }).data, [value]);
  const n = data.length;
  return (
    <svg
      role="img"
      aria-label={t('qrOf', { what: label })}
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn('rounded-xl', className)}
    >
      <rect width={n} height={n} fill="#FFFDF8" />
      <path d={qrPath(data)} fill="#0B0D12" />
    </svg>
  );
}
