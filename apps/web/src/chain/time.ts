'use client';

import { chainNow } from '@/lib/format';
import { useNow } from '@/lib/use-now';

/** Chain time, ticking: the last read's block time plus the wall clock since the read. Null until mounted. */
export function useChainNow(
  read: { blockTimestamp: bigint; fetchedAtMs: number } | null,
  intervalMs = 1000,
): bigint | null {
  const now = useNow(intervalMs);
  if (!read || now === null) return null;
  return chainNow(read.blockTimestamp, read.fetchedAtMs, now);
}
