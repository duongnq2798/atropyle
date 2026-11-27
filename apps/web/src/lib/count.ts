import type { Lang } from '@/i18n/core';

/** 67,108,864 in English, 67.108.864 in Vietnamese; `fraction` fixes the decimals (18.2 / 18,2). */
export function formatCount(n: number | bigint, lang: Lang, fraction = 0): string {
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(n);
}
