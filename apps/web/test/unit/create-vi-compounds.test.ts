// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { messages } from '../../src/messages/create.messages';
import { plainCompounds } from '../helpers/vi-compounds';

/** The h1 of each step, the step names, the section titles and the invitation headings of /create/. */
const HEADING = /^(ask|step)[A-Z]|Title$|^invite(Guardian|Heir)$/;

const headings = Object.entries(messages.vi).filter(([key]) => HEADING.test(key));

/** The words come from the one shared list (test/helpers/vi-compounds.ts), so the wizard and the flows read the same rule. */
describe('the Vietnamese headings of /create/ never break inside a word', () => {
  it('reads the headings', () => {
    expect(headings.map(([key]) => key)).toEqual(expect.arrayContaining(['askHeirs', 'askGuardians', 'stepKind']));
  });

  it('binds every two-syllable word with a no-break space', () => {
    const plain = headings.flatMap(([key, text]) => plainCompounds(text).map((c) => `${key}: "${c}"`));
    expect(plain, 'headings that hold one of the words with a plain space').toEqual([]);
  });

  it('the bound words still read as the words', () => {
    expect(messages.vi.askHeirs).toBe('Ai nhận tài\u00a0sản của bạn?');
    expect(messages.vi.stepKind).toBe('Drill hay vault\u00a0thật');
    expect(messages.vi.stepHeirs).toBe('Người\u00a0thừa\u00a0kế');
  });
});
