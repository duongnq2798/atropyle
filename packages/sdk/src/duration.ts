import { AtropyleError } from './errors';

const UNIT: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

export function parseDuration(input: string | number, path = 'duration'): number {
  if (typeof input === 'number' && Number.isSafeInteger(input) && input >= 0) return input;
  if (typeof input === 'string') {
    const m = /^(\d+)([smhdw]?)$/.exec(input.trim());
    if (m) {
      const v = Number(m[1]) * UNIT[m[2] || 's'];
      if (Number.isSafeInteger(v)) return v;
    }
  }
  throw new AtropyleError('PLAN_INVALID', {
    message: `${path}: expected a duration like 45s, 90m, 12h, 3d or 2w`,
    details: { path },
  });
}

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
