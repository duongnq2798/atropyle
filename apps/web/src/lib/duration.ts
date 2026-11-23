/** Copy of formatDuration in packages/sdk/src/duration.ts (Quyết định 13; test/unit/sdk-copies.test.ts). */
export function formatDuration(seconds: number | bigint): string {
  let s = Number(seconds);
  if (s <= 0) return '0s';
  const parts: string[] = [];
  for (const [u, n] of [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ] as const) {
    const q = Math.floor(s / n);
    if (q > 0) {
      parts.push(`${q}${u}`);
      s -= q * n;
    }
  }
  return parts.slice(0, 2).join(' ');
}
