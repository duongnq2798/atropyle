// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { messages as owner } from '../../src/messages/owner.messages';
import { plainCompounds, VI_COMPOUNDS } from '../helpers/vi-compounds';

/**
 * Every owner string, whatever its length, is read against the one shared list (test/helpers/vi-compounds.ts), the
 * phrases the wizard also binds, and this tab's own words.
 */
const WORDS = [...VI_COMPOUNDS, 'có thể', 'cho phép', 'những gì', 'thu hồi', 'nhắc nhở', 'thời điểm', 'khung hình'];

describe('the owner tab never breaks a Vietnamese word', () => {
  it('binds every compound with a no-break space, in every string', () => {
    const bad: string[] = [];
    for (const [key, text] of Object.entries(owner.vi as Record<string, string>)) {
      for (const c of plainCompounds(text, WORDS)) bad.push(`${key}: "${c}"`);
    }
    expect(bad).toEqual([]);
  });

  it('has a Vietnamese string for every English key', () => {
    expect(Object.keys(owner.vi).sort()).toEqual(Object.keys(owner.en).sort());
  });
});
