import { defineMessages } from '@/i18n/core';

/**
 * `~` is a space where a line must not break; glue() turns it into U+00A0, as in proof.messages.ts. Vietnamese writes
 * the syllables of one word with spaces between them ("cảnh báo", "người thừa kế"), so a heading, a button or a short
 * label could break inside a word; vi-compounds-showcase.test.ts holds them. "X Layer" is one name in both languages.
 */
const glue = (s: string): string => s.replaceAll('~', '\u00A0');

export const messages = defineMessages(
  {
    navCreate: 'Create',
    navMe: 'My vaults',
    navProof: 'Proof',
    navStatus: 'Status',
    navDevelopers: 'Developers',
    navLabel: 'Main',
    footerNav: 'Site',
    settings: 'Settings',
    deploymentMissing: 'Atropyle is not available on this network yet.',
    notFoundTitle: 'Page not found',
    notFoundBody: 'There is no page at this link:',
    notFoundHint: 'Check the link for a typo, or start again from the home page.',
    goHome: 'Go to the home page',
    badAddressTitle: 'Not a valid address',
    badAddressBody: 'This link does not contain a valid vault address:',
    footer: 'Atropyle is beta software and has not been audited. Practise with a Drill or small amounts first.',
    knownLimits: 'Known limits',
    forHeirs: 'For heirs and guardians',
    noTrackers: 'No trackers · No cookies',
    proofLine: glue('Rules frozen in netlist {keccak} on X~Layer · unaudited · {limits}'),
    proofLineShort: 'Rules {keccak} · {limits}',
    proofLimits: 'limits',
    proofLimitsShort: 'unaudited',
    proofLineLabel: 'Proof of the rules',
    loadFailed: 'Part of this page did not load. Check your connection and press again, or reload the page.',
    reload: 'Reload the page',
  },
  {
    navCreate: 'Tạo vault',
    navMe: 'Vault của tôi',
    navProof: glue('Chứng~minh'),
    navStatus: glue('Trạng~thái'),
    navDevelopers: glue('Nhà~phát~triển'),
    navLabel: 'Điều hướng chính',
    footerNav: 'Liên kết',
    settings: glue('Cài~đặt'),
    deploymentMissing: 'Atropyle chưa có trên mạng này.',
    notFoundTitle: glue('Không tìm~thấy trang'),
    notFoundBody: 'Không có trang nào ở link này:',
    notFoundHint: 'Hãy kiểm tra link có gõ sai không, hoặc bắt đầu lại từ trang chủ.',
    goHome: glue('Về trang~chủ'),
    badAddressTitle: glue('Địa~chỉ không hợp~lệ'),
    badAddressBody: 'Link này không chứa địa chỉ vault hợp lệ:',
    footer: 'Atropyle là phần mềm beta, chưa được kiểm toán. Hãy tập bằng Drill (bản diễn tập) hoặc số tiền nhỏ trước.',
    knownLimits: glue('Giới~hạn đã biết'),
    forHeirs: glue('Cho người~thừa~kế và người~giám~hộ'),
    noTrackers: 'Không tracker · Không cookie',
    proofLine: glue('Luật đóng~băng trong netlist {keccak} trên X~Layer · chưa kiểm~toán · {limits}'),
    proofLineShort: 'Luật {keccak} · {limits}',
    proofLimits: glue('giới~hạn'),
    proofLimitsShort: glue('chưa kiểm~toán'),
    proofLineLabel: glue('Bằng~chứng về luật'),
    loadFailed: 'Một phần của trang này chưa tải được. Hãy kiểm tra kết nối mạng rồi bấm lại, hoặc tải lại trang.',
    reload: 'Tải lại trang',
  },
);
