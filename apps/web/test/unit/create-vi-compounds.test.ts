// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { messages as assets } from '../../src/messages/assets.messages';
import { messages as create } from '../../src/messages/create.messages';
import { messages as editors } from '../../src/messages/editors.messages';
import { messages as sign } from '../../src/messages/sign.messages';
import { plainCompounds, VI_COMPOUNDS } from '../helpers/vi-compounds';

/** The h1 of each step, the step names, the section titles and the invitation headings: whatever their length. */
const HEADING = /^(ask|step)[A-Z]|Title$|^invite(Guardian|Heir)$/;

/**
 * The buttons and the short labels: every string that is not a sentence of prose. Prose ends in a full stop, a colon
 * or a question mark and runs past six words; a label, a button, a column head or a short line does not.
 */
function isLabel(key: string, text: string): boolean {
  if (HEADING.test(key)) return true;
  const words = text.split(/\s+/).length;
  return !/[.:?]$/.test(text.trim()) || words <= 6;
}

const FILES = { create, editors, assets } as const;

/**
 * The labels of /sign/ that the wizard's preview renders in its rail and its sheet (preview.tsx). The rest of
 * sign.messages belongs to /sign/ and is not read here.
 */
const SIGN_KEYS = ['earliestLabel', 'earliestAfter'] as const;

/**
 * The words come from the one shared list (test/helpers/vi-compounds.ts), so the wizard and the flows read the same
 * rule, and three phrases the wizard and the owner tab also bind in their labels.
 */
const WORDS = [...VI_COMPOUNDS, 'có thể', 'cho phép', 'những gì'];

const labels = [
  ...Object.entries(FILES).flatMap(([file, m]) =>
    Object.entries(m.vi as Record<string, string>)
      .filter(([key, text]) => isLabel(key, text))
      .map(([key, text]) => ({ name: `${file}.${key}`, text: text.normalize('NFC').toLowerCase() })),
  ),
  ...SIGN_KEYS.map((key) => ({ name: `sign.${key}`, text: sign.vi[key].normalize('NFC').toLowerCase() })),
];

describe('the Vietnamese labels of /create/ never break inside a word', () => {
  it('reads the headings, the steps, the buttons and the short labels of the wizard and its editors', () => {
    const names = labels.map((l) => l.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'create.askHeirs',
        'create.stepKind',
        'create.next',
        'create.back',
        'create.prepare',
        'create.send',
        'create.connect',
        'create.doneOpen',
        'create.previewGate',
        'create.kindReal',
        'create.guardiansNone',
        'editors.heirsTitle',
        'editors.addHeir',
        'editors.removeGuardian',
        'editors.recovery',
        'editors.windowLabel',
        'editors.presetCustom',
        'assets.assetsTitle',
        'assets.pickHeir',
        'assets.tokenAddress',
        'create.previewRecovery',
        'sign.earliestLabel',
        'sign.earliestAfter',
      ]),
    );
    // Prose stays prose: a help paragraph is not a label.
    expect(names).not.toContain('create.kindDrillHelp');
    expect(names).not.toContain('editors.guardiansHelp');
  });

  it('binds every compound of the shared list with a no-break space', () => {
    const plain = labels.flatMap(({ name, text }) => plainCompounds(text, WORDS).map((c) => `${name}: "${c}"`));
    expect(plain, 'labels that hold a compound with a plain space').toEqual([]);
  });

  it('the bound words still read as the words', () => {
    expect(editors.vi.recovery).toBe('Cho phép người giám hộ chuyển vault này sang ví mới');
    expect(create.vi.previewRecovery).toBe('Giám hộ có thể chuyển sang ví mới');
    expect(sign.vi.earliestLabel).toBe('Sớm nhất tài sản có thể rời ví của bạn');
    expect(create.vi.askHeirs).toBe('Ai nhận tài sản của bạn?');
    expect(create.vi.stepKind).toBe('Drill hay vault thật');
    expect(create.vi.stepHeirs).toBe('Người thừa kế');
    expect(editors.vi.addGuardian).toBe('Thêm người giám hộ');
    expect(create.vi.timingPreview).toBe('Chuyện gì sẽ xảy ra, từng khoảnh khắc');
    expect(create.vi.emailTitle).toBe('Nhận email trước khi có chuyện gì xảy ra');
  });
});
