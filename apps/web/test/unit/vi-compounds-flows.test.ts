// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Messages } from '../../src/i18n/core';
import { messages as actionRunner } from '../../src/messages/action-runner.messages';
import { messages as guardian } from '../../src/messages/guardian.messages';
import { messages as heir } from '../../src/messages/heir.messages';
import { messages as history } from '../../src/messages/history.messages';
import { messages as labels } from '../../src/messages/labels.messages';
import { messages as sign } from '../../src/messages/sign.messages';
import { messages as standing } from '../../src/messages/standing.messages';
import { messages as subscribe } from '../../src/messages/subscribe.messages';
import { messages as vault } from '../../src/messages/vault.messages';
import { messages as verify } from '../../src/messages/verify.messages';
import { messages as verifyPage } from '../../src/messages/verify-page.messages';
import { isShortLabel, plainCompounds } from '../helpers/vi-compounds';

type Dict = Messages<string>;

/**
 * The messages of the Plan 7B pages: the vault page and its standing sentence, the guardian tab, the heir letter,
 * the history, /verify/, /sign/ and the alerts form, with the labels and the action runner they show.
 */
const FILES: readonly (readonly [string, Dict])[] = [
  ['vault', vault],
  ['standing', standing],
  ['guardian', guardian],
  ['heir', heir],
  ['history', history],
  ['verify-page', verifyPage],
  ['verify', verify],
  ['sign', sign],
  ['subscribe', subscribe],
  ['labels', labels],
  ['action-runner', actionRunner],
];

/** Headings that read as a sentence (a verdict in the display voice), beyond the short labels found by their shape. */
const SENTENCE_HEADINGS: Readonly<Record<string, readonly string[]>> = {
  'verify-page': ['overallOk', 'overallNo', 'overallFail'],
  verify: ['overallOk'],
};

/**
 * Files whose every key is checked whatever its length: the standing sentence is the largest line of the vault page
 * (voice-proclaim, text-lead), so a split compound there is the most visible one.
 */
const WHOLE_FILES: readonly string[] = ['standing'];

/**
 * Lead lines in the lead or body voice right under a page heading: the vault header's moment line (predicted* and
 * moved*), the lead of the empty /vault/ and /verify/, and the intros of /verify/ and /sign/.
 */
const LEAD_SENTENCES: Readonly<Record<string, readonly string[]>> = {
  vault: [
    'missingBody',
    'predictedActive',
    'predictedGrace',
    'predictedRecovery',
    'predictedReleasedInherit',
    'predictedReleasedRecover',
    'movedActive',
    'movedGrace',
    'movedRecovery',
    'movedReleasedInherit',
    'movedReleasedRecover',
  ],
  'verify-page': ['intro', 'missingBody'],
  sign: ['intro', 'emptyBody'],
};

const TITLE = /^title|Title$/;

const headings = (lang: 'en' | 'vi') =>
  FILES.flatMap(([file, dict]) =>
    Object.entries(dict[lang])
      .filter(
        ([key, text]) =>
          typeof text === 'string' &&
          (WHOLE_FILES.includes(file) ||
            TITLE.test(key) ||
            isShortLabel(dict.vi[key] ?? '') ||
            SENTENCE_HEADINGS[file]?.includes(key) ||
            LEAD_SENTENCES[file]?.includes(key)),
      )
      .map(([key, text]) => [`${file}.${lang}.${key}`, text] as const),
  );

describe('the Vietnamese headings, titles and buttons of the Plan 7B pages never break inside a word (7B-P1)', () => {
  it('reads the headings of every page', () => {
    expect(headings('vi').map(([path]) => path)).toEqual(
      expect.arrayContaining([
        'vault.vi.planTitle',
        'vault.vi.pokeReleaseInherit',
        'guardian.vi.attest',
        'heir.vi.title',
        'history.vi.title',
        'verify-page.vi.overallFail',
        'verify-page.vi.stateChecking',
        'sign.vi.emptyTitle',
        'subscribe.vi.send',
        'labels.vi.roleHeir',
        'standing.vi.guestReleasedInheritDone',
        'standing.vi.ownerActive',
        'vault.vi.predictedReleasedInherit',
        'vault.vi.missingBody',
        'verify-page.vi.intro',
        'sign.vi.emptyBody',
      ]),
    );
  });

  it('names only sentence headings and lead lines that exist', () => {
    const missing = [...Object.entries(SENTENCE_HEADINGS), ...Object.entries(LEAD_SENTENCES)].flatMap(
      ([file, keys]) => {
        const dict = FILES.find(([f]) => f === file)?.[1];
        return keys.filter((k) => typeof dict?.vi[k] !== 'string').map((k) => `${file}.${k}`);
      },
    );
    expect(missing).toEqual([]);
  });

  it('binds every Vietnamese compound with a no-break space', () => {
    const plain = headings('vi').flatMap(([path, text]) => plainCompounds(text).map((c) => `${path}: "${c}"`));
    expect(plain, 'headings that hold one of the words with a plain space').toEqual([]);
  });

  it('keeps "X Layer" whole in the English ones too', () => {
    const plain = headings('en').flatMap(([path, text]) =>
      plainCompounds(text)
        .filter((c) => c === 'x layer' || c === 'claude code')
        .map((c) => `${path}: "${c}"`),
    );
    expect(plain).toEqual([]);
  });

  it('finds a compound written with a plain space, and passes the bound one', () => {
    const NBSP = String.fromCharCode(0xa0);
    expect(plainCompounds('Trao cho người thừa kế')).toEqual(['người thừa kế', 'thừa kế']);
    expect(plainCompounds(`Trao cho người thừa${NBSP}kế`)).toEqual(['người thừa kế']);
    expect(plainCompounds(`Trao cho người${NBSP}thừa${NBSP}kế`)).toEqual([]);
    expect(plainCompounds('Đã chuyển tài sản'.normalize('NFD'))).toEqual(['tài sản']);
    // A syllable inside a longer word is not the compound.
    expect(plainCompounds('tài sảnh')).toEqual([]);
  });

  it('the bound words still read as the words', () => {
    expect(vault.vi.pokeReleaseInherit.replaceAll(String.fromCharCode(0xa0), ' ')).toBe('Trao cho người thừa kế');
    expect(vault.vi.pokeReleaseInherit).not.toContain(' kế');
  });
});
