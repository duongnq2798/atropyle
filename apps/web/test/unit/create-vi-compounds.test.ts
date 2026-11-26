// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { messages } from '../../src/messages/create.messages';

/**
 * Two-syllable words a Vietnamese reader takes as one: a line break between the syllables reads as broken
 * typesetting ("Ai nhận tài / sản của bạn?"). In the wizard's headings and names they are bound with U+00A0.
 */
const COMPOUNDS = [
  'tài sản',
  'thừa kế',
  'giám hộ',
  'điểm danh',
  'báo động',
  'xác nhận',
  'diễn tập',
  'vault thật',
  'trông chừng',
  'bắt đầu',
  'bao lâu',
  'một lần',
];

/** The h1 of each step, the step names, the section titles and the invitation headings of /create/. */
const HEADING = /^(ask|step)[A-Z]|Title$|^invite(Guardian|Heir)$/;

const headings = Object.entries(messages.vi).filter(([key]) => HEADING.test(key));

describe('the Vietnamese headings of /create/ never break inside a word', () => {
  it('reads the headings', () => {
    expect(headings.map(([key]) => key)).toEqual(expect.arrayContaining(['askHeirs', 'askGuardians', 'stepKind']));
  });

  it('binds every two-syllable word with a no-break space', () => {
    const plain = headings.flatMap(([key, text]) =>
      COMPOUNDS.filter((c) => text.normalize('NFC').toLowerCase().includes(c)).map((c) => `${key}: "${c}"`),
    );
    expect(plain, 'headings that hold one of the words with a plain space').toEqual([]);
  });

  it('the bound words still read as the words', () => {
    expect(messages.vi.askHeirs).toBe('Ai nhận tài\u00a0sản của bạn?');
    expect(messages.vi.stepKind).toBe('Drill hay vault\u00a0thật');
  });
});
