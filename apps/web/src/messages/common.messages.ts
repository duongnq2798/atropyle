import { defineMessages } from '@/i18n/core';

/**
 * `~` is a space where a line must not break; glue() turns it into U+00A0, as in proof.messages.ts. Vietnamese writes
 * the syllables of one word with spaces between them ("cảnh báo", "người thừa kế"), so a heading, a button or a short
 * label could break inside a word; vi-compounds-showcase.test.ts holds them. "X Layer" is one name in both languages.
 */
const glue = (s: string): string => s.replaceAll('~', '\u00A0');

export const messages = defineMessages(
  {
    beta: 'Beta — unaudited',
    loading: 'Loading…',
    retry: 'Retry',
    copy: 'Copy',
    copied: 'Copied',
    back: 'Back',
    next: 'Next',
    cancel: 'Cancel',
    close: 'Close',
    yes: 'Yes',
    no: 'No',
    none: 'None',
    unknown: 'Unknown',
    docs: 'Docs',
    error: 'Something went wrong',
    untrustedNote: 'Names and symbols come from the token contract. Anyone can write anything there.',
    baseUnits: 'base units',
  },
  {
    beta: glue('Beta — chưa kiểm~toán'),
    loading: 'Đang tải…',
    retry: glue('Thử~lại'),
    copy: glue('Sao~chép'),
    copied: glue('Đã sao~chép'),
    back: glue('Quay~lại'),
    next: 'Tiếp',
    cancel: 'Huỷ',
    close: 'Đóng',
    yes: 'Có',
    no: 'Không',
    none: 'Không có',
    unknown: 'Không rõ',
    docs: glue('Tài~liệu'),
    error: glue('Có lỗi xảy~ra'),
    untrustedNote: 'Tên và ký hiệu lấy từ contract token. Ai cũng có thể ghi bất cứ gì vào đó.',
    baseUnits: 'đơn vị gốc',
  },
);
