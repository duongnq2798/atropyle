'use client';

import { useMemo } from 'react';
import { identiconOf } from './identicon';

/** Lightness comes from --avatar-l (0.78 dark, 0.52 light), so the face reads in both themes. */
export function Avatar({ address, size = 22 }: { address: string; size?: number }) {
  const { hue, cells } = useMemo(() => identiconOf(address), [address]);
  let d = '';
  for (let i = 0; i < 25; i++) if (cells[i]) d += `M${i % 5} ${Math.floor(i / 5)}h1v1h-1z`;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="-0.5 -0.5 6 6"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="shrink-0 rounded-full"
    >
      <rect x={-0.5} y={-0.5} width={6} height={6} style={{ fill: `oklch(var(--avatar-l) 0.05 ${hue} / 0.35)` }} />
      <path d={d} style={{ fill: `oklch(var(--avatar-l) 0.13 ${hue})` }} />
    </svg>
  );
}
