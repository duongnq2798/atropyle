// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Messages } from '../../src/i18n/core';
import { messages as alerts } from '../../src/messages/alerts.messages';
import { messages as common } from '../../src/messages/common.messages';
import { messages as developers } from '../../src/messages/developers.messages';
import { messages as home } from '../../src/messages/home.messages';
import { messages as join } from '../../src/messages/join.messages';
import { messages as me } from '../../src/messages/me.messages';
import { messages as notFound } from '../../src/messages/not-found.messages';
import { messages as privacy } from '../../src/messages/privacy.messages';
import { messages as proof } from '../../src/messages/proof.messages';
import { messages as shell } from '../../src/messages/shell.messages';
import { messages as stage } from '../../src/messages/stage.messages';
import { messages as status } from '../../src/messages/status.messages';
import { messages as story } from '../../src/messages/story.messages';
import { messages as subscribe } from '../../src/messages/subscribe.messages';
import { messages as ui } from '../../src/messages/ui.messages';

/**
 * Words a Vietnamese reader takes as one, though they are written as two or three syllables with spaces between
 * them. A line break inside one reads as broken typesetting ("Ngừng cảnh / báo qua email?"), and text-wrap: balance
 * does not prevent it. In the headings, titles, buttons and short labels of the Plan 7C pages they are bound with
 * U+00A0. "X Layer" is a name, and a line that ends on a lone "X" reads as a typo in either language.
 */
const COMPOUNDS = [
  // The words of the typesetting rule.
  'tài sản',
  'người thừa kế',
  'thừa kế',
  'người giám hộ',
  'giám hộ',
  'điểm danh',
  'báo động',
  'cảnh báo',
  'lời mời',
  'khôi phục',
  'kế hoạch',
  'chủ ví',
  'chủ vault',
  'giao dịch',
  'xác nhận',
  'hết hạn',
  'hợp đồng',
  // The other words of these headings.
  'an toàn',
  'ban đầu',
  'bảo mật',
  'bảo vệ',
  'bằng chứng',
  'bắt đầu',
  'biến mất',
  'cài đặt',
  'câu chuyện',
  'câu hỏi',
  'chẩn đoán',
  'chỉ mục',
  'chính sách',
  'chú ý',
  'chứng minh',
  'chứng nhận',
  'chúng tôi',
  'con dấu',
  'con số',
  'danh sách',
  'diễn tập',
  'đăng ký',
  'địa chỉ',
  'đóng băng',
  'đội ngũ',
  'đầy đủ',
  'ghi chú',
  'giao diện',
  'giấy da',
  'giấy phép',
  'giới hạn',
  'hộp thư',
  'hợp lệ',
  'kết luận',
  'kết nối',
  'kiểm chứng',
  'kiểm toán',
  'ký hiệu',
  'liên kết',
  'mã nguồn',
  'mong đợi',
  'ngân quỹ',
  'ngôn ngữ',
  'nhà phát triển',
  'nhà vận hành',
  'nội dung',
  'phiên bản',
  'quyết định',
  'riêng tư',
  'sao chép',
  'sự kiện',
  'tài liệu',
  'thất bại',
  'thiết bị',
  'thực tế',
  'tiếng việt',
  'tìm thấy',
  'toàn bộ',
  'trang chủ',
  'trạng thái',
  'trường hợp',
  'vai trò',
  'vấn đề',
  'xảy ra',
  'xử lý',
  'im lặng',
  'nói dối',
  'đầu tiên',
  'đồng ý',
  'bỏ phiếu',
  'công cụ',
  'trình duyệt',
  'bản đồ',
  'phân tích',
  'tuỳ chọn',
  'trực tiếp',
  'kiểm chéo',
  'đầu vào',
  'ít nhất',
  'claude code',
  'x layer',
] as const;

type Dict = Messages<string>;

/**
 * The headings, titles, buttons and short labels of each page, by key. Keys named `title…` or `…Title` are added by
 * themselves, so a new section title is held without editing this list.
 */
const PAGES: readonly (readonly [string, Dict, readonly string[]])[] = [
  [
    'home',
    home,
    [
      'heroTitle',
      'heroDrill',
      'heroProof',
      'heroFactCustody',
      'heroFactLive',
      'heroHeirDoor',
      'askLegend',
      'askAlive',
      'askSilent',
      'askLiar',
      'askRunAll',
      'askButton',
      'askBusy',
    ],
  ],
  [
    'stage',
    stage,
    [
      'stampMake',
      'storyLegend',
      'chipInherit',
      'chipRecover',
      'whatLegend',
      'switchConfirm',
      'switchBack',
      'gateHeirs',
      'gateWallet',
      'retry',
    ],
  ],
  [
    'story',
    story,
    ['trustCases', 'trustEdges', 'trustRun', 'trustStatus', 'agentStamp', 'agentTool', 'agentInstall', 'agentMore'],
  ],
  [
    'proof',
    proof,
    [
      'eyebrow',
      'start',
      'again',
      'propPending',
      'propHolds',
      'propBroken',
      'propNotRun',
      'limitsLink',
      'detailCases',
      'detailBlock',
      'detailRpcs',
      'detailCpu',
      'detailBeacon',
      'certCopy',
      'copyCli',
      'copyStep',
      'limitDo',
      'limit1Link',
      'limit1Link2',
      'limit2Link',
      'limit3Link',
      'limit4Link',
      'limit5Link',
      'limit6Link',
    ],
  ],
  [
    'me',
    me,
    [
      'rehearse',
      'vaultLabel',
      'alsoOwner',
      'alsoGuardian',
      'alsoHeir',
      'open',
      'cliCopy',
      'ownShort',
      'guardShort',
      'inheritShort',
    ],
  ],
  ['join', join, ['eyebrow', 'vaultLabel', 'heirsLabel', 'guardiansLabel', 'openVault', 'trustLink', 'home']],
  [
    'alerts',
    alerts,
    ['confirmError', 'vaultLabel', 'roleLabel', 'openVault', 'findVaults', 'unsubButton', 'unsubError'],
  ],
  [
    'status',
    status,
    [
      'stamp',
      'ctVaults',
      'ctDrills',
      'ctPaid',
      'ctReleases',
      'ctStablecoins',
      'defTeamTerm',
      'statVaults',
      'statDrills',
      'statCheckIns',
      'statsRun',
      'statsAgain',
      'glanceLabel',
      'glanceContracts',
      'glanceNodes',
      'glanceBackend',
      'toneOk',
      'toneWarn',
      'toneBad',
      'toneUnknown',
      'toneOff',
      'integrityOk',
      'integrityBad',
      'pass',
      'fail',
      'expected',
      'found',
      'reachable',
      'recheck',
      'crossLabel',
      'healthIndexer',
      'healthIntegrity',
      'healthKeeper',
      'copy',
      'diagShow',
    ],
  ],
  [
    'developers',
    developers,
    [
      'stamp',
      'copyCommand',
      'copyCode',
      'factory',
      'vaultImpl',
      'cpu',
      'treasury',
      'feeToken',
      'tapeoutFactory',
      'xlayerCpu',
      'circuitPolicy',
      'circuitKofn5',
      'circuitGe4',
      'circuitId',
      'netlist',
      'copyKeccak',
      'repo',
      'docs',
      'npm',
      'license',
    ],
  ],
  ['privacy', privacy, ['stamp', 'contactLink']],
  ['not-found', notFound, ['didYouMean', 'looksLikeVault', 'openVault', 'verifyVault']],
  [
    'shell',
    shell,
    [
      'navCreate',
      'navMe',
      'navProof',
      'navStatus',
      'navDevelopers',
      'settings',
      'goHome',
      'knownLimits',
      'forHeirs',
      'noTrackers',
      'proofLine',
      'proofLineShort',
      'proofLimits',
      'proofLimitsShort',
      'proofLineLabel',
      'reload',
    ],
  ],
  [
    'ui',
    ui,
    [
      'skip',
      'home',
      'theme',
      'themeSystem',
      'themeLight',
      'themeDark',
      'language',
      'langVi',
      'holdDone',
      'copyAddress',
      'copyText',
      'copyFailed',
      'hapticsOn',
      'footerSource',
      'footerXLayer',
      'footerLicense',
      'footerPrivacy',
      'footerVersion',
    ],
  ],
  ['subscribe', subscribe, ['email', 'mailLang', 'send', 'sending', 'checkInbox', 'again', 'hostedLink']],
  ['common', common, ['beta', 'retry', 'copy', 'copied', 'back', 'next', 'cancel', 'close', 'docs', 'error']],
];

const TITLE = /^title|Title$/;

/** Every syllable of a compound, at word edges, with any run of spaces between them: bound or not. */
const finder = (compound: string): RegExp =>
  new RegExp(`(?<!\\p{L})${compound.split(' ').join('\\s+')}(?!\\p{L})`, 'giu');

/** The places where a compound is written with a breakable space between its syllables. */
function plainCompounds(text: string): string[] {
  const s = text.normalize('NFC').toLowerCase();
  return COMPOUNDS.flatMap((c) => [...s.matchAll(finder(c))].filter(([m]) => /[^\S\u00A0]/u.test(m)).map(() => c));
}

const headings = (lang: 'en' | 'vi') =>
  PAGES.flatMap(([file, dict, keys]) => {
    const all = new Set([...keys, ...Object.keys(dict[lang]).filter((k) => TITLE.test(k))]);
    return [...all].map((key) => [`${file}.${lang}.${key}`, dict[lang][key]] as const);
  });

describe('the headings of the Plan 7C pages never break inside a word', () => {
  it('names only keys that exist', () => {
    const missing = PAGES.flatMap(([file, dict, keys]) =>
      keys.filter((k) => typeof dict.vi[k] !== 'string' || typeof dict.en[k] !== 'string').map((k) => `${file}.${k}`),
    );
    expect(missing).toEqual([]);
  });

  it('reads the headings of every page', () => {
    const keys = headings('vi').map(([path]) => path);
    expect(keys).toEqual(
      expect.arrayContaining([
        'join.vi.loadingTitle',
        'alerts.vi.unsubTitle',
        'proof.vi.limitsTitle',
        'status.vi.title',
        'shell.vi.notFoundTitle',
        'story.vi.closeTitle',
      ]),
    );
  });

  it('binds every Vietnamese compound with a no-break space', () => {
    const plain = headings('vi').flatMap(([path, text]) => plainCompounds(text).map((c) => `${path}: "${c}"`));
    expect(plain, 'headings that hold one of the words with a plain space').toEqual([]);
  });

  it('keeps "X Layer" and "Claude Code" whole in the English headings too', () => {
    const plain = headings('en').flatMap(([path, text]) =>
      plainCompounds(text)
        .filter((c) => c === 'x layer' || c === 'claude code')
        .map((c) => `${path}: "${c}"`),
    );
    expect(plain).toEqual([]);
  });

  it('keeps "X Layer" whole in every text of these pages, body copy included', () => {
    // At 1440 px the lead of /proof/ ended a line on a lone "X" (7C-P1 screens). The certificate lines of /proof/
    // are copied and pasted elsewhere, so they keep plain spaces.
    const COPIED = /^proof\.cert\d$/;
    const plain = PAGES.flatMap(([file, dict]) =>
      (['en', 'vi'] as const).flatMap((lang) =>
        Object.entries(dict[lang])
          .filter(([key, text]) => !COPIED.test(`${file}.${key}`) && plainCompounds(text).includes('x layer'))
          .map(([key]) => `${file}.${lang}.${key}`),
      ),
    );
    expect(plain).toEqual([]);
  });

  it('finds a compound written with a plain space, and passes the bound one', () => {
    expect(plainCompounds('Ngừng cảnh báo qua email?')).toEqual(['cảnh báo']);
    expect(plainCompounds('Ngừng cảnh\u00A0báo qua email?')).toEqual([]);
    expect(plainCompounds('Bạn là người thừa\u00A0kế')).toEqual(['người thừa kế']);
    expect(plainCompounds('cảnh báo động')).toEqual(['báo động', 'cảnh báo']);
    expect(plainCompounds('Đang mở lời mời của bạn'.normalize('NFD'))).toEqual(['lời mời']);
    // A syllable inside a longer word is not the compound.
    expect(plainCompounds('lời mờir')).toEqual([]);
  });

  it('the bound words still read as the words', () => {
    expect(join.vi.loadingTitle).toBe('Đang mở lời\u00A0mời của bạn');
    expect(alerts.vi.unsubTitle).toBe('Ngừng cảnh\u00A0báo qua email?');
  });
});
