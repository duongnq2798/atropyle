import { defineMessages } from '@/i18n/core';

/** `~` is a space where a line must not break, as in home.messages.ts (glue). */
const glue = (s: string): string => s.replaceAll('~', ' ');

/**
 * The answer after "Ask X Layer": loaded with the ask chunk, never in the first load of `/`. Row 1 says what X Layer
 * said, in the product's voice; the block number and the operators follow in a Ledger row (impl/ask-view.tsx), so no
 * message carries a number read from the chain.
 */
export const messages = defineMessages(
  {
    agreeClosed: glue('X~Layer agrees: the gate stays closed.'),
    agreeOpen: glue('X~Layer agrees: the gate opens.'),
    disagree: glue('X~Layer disagrees'),
    refused: glue('X~Layer refused the question'),
    atBlock: glue('at~block'),
    block: 'block',
    state: 'state',
    out: 'out',
    thisPage: glue('this~page'),
    opSame: 'same answer',
    opDifferent: 'a different answer',
    opRefused: 'refused',
    opNone: 'not reachable',
  },
  {
    agreeClosed: glue('X~Layer cũng nói: cổng vẫn đóng.'),
    agreeOpen: glue('X~Layer cũng nói: cổng mở.'),
    disagree: glue('X~Layer trả~lời khác'),
    refused: glue('X~Layer từ~chối câu~hỏi'),
    atBlock: glue('ở~block'),
    block: 'block',
    state: glue('trạng~thái'),
    out: glue('đầu~ra'),
    thisPage: glue('trang~này'),
    opSame: 'cùng câu trả lời',
    opDifferent: 'câu trả lời khác',
    opRefused: 'từ chối',
    opNone: 'không kết nối được',
  },
);
