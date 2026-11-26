import { defineMessages } from '@/i18n/core';

/** `~` is a space where a line must not break, as in home.messages.ts (glue). */
const glue = (s: string): string => s.replaceAll('~', '\u00A0');

/** The sentence after "Ask X Layer" answered: loaded with the ask chunk, never in the first load of `/`. */
export const messages = defineMessages(
  {
    matchClosed: glue('X~Layer answered at block~{block}: the gate stays closed. Same as this page.'),
    matchOpen: glue('X~Layer answered at block~{block}: the gate opens. Same as this page.'),
    mismatch: glue('X~Layer answered differently at block~{block}:'),
    mismatchPage: 'this page says',
    reverted: glue('X~Layer refused the question at block~{block}.'),
    opSame: 'same answer',
    opDifferent: 'a different answer',
    opNone: 'not reachable',
  },
  {
    matchClosed: glue('X~Layer trả~lời ở block~{block}: cổng vẫn đóng. Giống trang này.'),
    matchOpen: glue('X~Layer trả~lời ở block~{block}: cổng mở. Giống trang này.'),
    mismatch: glue('X~Layer trả~lời khác ở block~{block}:'),
    mismatchPage: 'trang này nói',
    reverted: glue('X~Layer từ~chối câu~hỏi ở block~{block}.'),
    opSame: 'cùng câu trả lời',
    opDifferent: 'câu trả lời khác',
    opNone: 'không kết nối được',
  },
);
