import { defineMessages } from '@/i18n/core';

/**
 * `~` is a space where a line must not break; glue() turns it into U+00A0, as in proof.messages.ts. Vietnamese writes
 * the syllables of one word with spaces between them ("cảnh báo", "người thừa kế"), so a heading, a button or a short
 * label could break inside a word; vi-compounds-showcase.test.ts holds them. "X Layer" is one name in both languages.
 */
const glue = (s: string): string => s.replaceAll('~', '\u00A0');

export const messages = defineMessages(
  {
    didYouMean: 'Did you mean this page?',
    looksLikeVault: 'This address looks like a vault. Open it instead?',
    openVault: 'Open the vault',
    verifyVault: 'Verify the vault',
  },
  {
    didYouMean: 'Có phải bạn muốn mở trang này?',
    looksLikeVault: glue('Địa~chỉ này trông như một vault. Mở nó thay vào đó?'),
    openVault: 'Mở vault',
    verifyVault: glue('Kiểm~chứng vault'),
  },
);
