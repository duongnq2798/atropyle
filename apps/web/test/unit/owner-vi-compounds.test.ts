// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { messages as owner } from '../../src/messages/owner.messages';

/** Words a Vietnamese reader takes as one (create-vi-compounds.test.ts): bound with U+00A0 in every owner string. */
const COMPOUNDS = [
  'tài sản',
  'người thừa kế',
  'thừa kế',
  'giám hộ',
  'điểm danh',
  'báo động',
  'cảnh báo',
  'lời mời',
  'khôi phục',
  'kế hoạch',
  'chủ ví',
  'giao dịch',
  'xác nhận',
  'hết hạn',
  'hợp đồng',
  'thời gian',
  'có thể',
  'bắt đầu',
  'kết thúc',
  'sợi chỉ',
  'số lần',
  'địa chỉ',
  'cho phép',
  'những gì',
  'xảy ra',
  // The words 7B-P1 adds to the shared list (test/helpers/vi-compounds.ts on feat/web-v2-flows-polish).
  'người giám hộ',
  'chủ vault',
  'độ phủ',
  'danh sách',
  'lúc này',
  'tiếp theo',
  'ngăn lại',
  'x layer',
  // This tab's own.
  'thu hồi',
  'nhắc nhở',
  'thời điểm',
  'khung hình',
];

/** Every syllable of a compound at word edges, with any run of spaces between them: bound or not. */
const finder = (compound: string) => new RegExp(`(?<!\\p{L})${compound.split(' ').join('\\s+')}(?!\\p{L})`, 'gu');

/** A breakable space: any white space but U+00A0. */
const BREAKABLE = /[^\S\u00a0]/u;

describe('the owner tab never breaks a Vietnamese word', () => {
  it('binds every compound with a no-break space, in every string', () => {
    const bad: string[] = [];
    for (const [key, text] of Object.entries(owner.vi as Record<string, string>)) {
      const lower = text.normalize('NFC').toLowerCase();
      for (const c of COMPOUNDS) {
        for (const [m] of lower.matchAll(finder(c))) if (BREAKABLE.test(m)) bad.push(`${key}: "${c}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('has a Vietnamese string for every English key', () => {
    expect(Object.keys(owner.vi).sort()).toEqual(Object.keys(owner.en).sort());
  });
});
