import { defineMessages } from '@/i18n/core';

/**
 * `~` is a space where a line must not break; glue() turns it into U+00A0, as in proof.messages.ts. Vietnamese writes
 * the syllables of one word with spaces between them ("cảnh báo", "người thừa kế"), so a heading, a button or a short
 * label could break inside a word; vi-compounds-showcase.test.ts holds them. "X Layer" is one name in both languages.
 */
const glue = (s: string): string => s.replaceAll('~', '\u00A0');

export const messages = defineMessages(
  {
    confirmTitle: 'Confirming your email alerts',
    confirmedTitle: 'Your email alerts are on',
    confirmedStop: 'Every email has a link that stops them, in one click.',
    confirmError: 'The alerts could not be confirmed',
    vaultLabel: 'Vault',
    roleLabel: 'Your role',
    openVault: 'Open the vault',
    expiredTitle: 'This link no longer works',
    expiredBody:
      'It may have expired, or the alerts it was for were stopped. Sign up again from the vault page or your invitation link.',
    findVaults: 'Find your vaults',
    invalidTitle: 'This link is incomplete',
    invalidBody:
      'Part of it is missing or was changed, so nothing was sent. Open the link again from the email, or copy the whole address into your browser.',
    hostedOnlyTitle: 'Email alerts live on the main site',
    hostedOnlyBody:
      'This copy of Atropyle lives on the chain and has no server, so it cannot confirm or stop alerts. Open the link from the email as it came: it points to the main site.',
    unsubTitle: 'Stop email alerts?',
    unsubReady: 'This email address will get no more alerts for this vault. You can sign up again at any time.',
    unsubButton: 'Stop alerts',
    unsubWorking: 'Stopping…',
    unsubKeep: 'Nothing changes until you press the button. If you opened this link by mistake, just close the page.',
    unsubDoneTitle: 'Alerts stopped',
    unsubDoneBody: 'We deleted this email address from the alerts of this vault. You will get nothing more about it.',
    unsubAgain: 'Changed your mind? Sign up again from the vault page or your invitation link.',
    unsubError: 'The alerts could not be stopped',
    saidReading: 'Reading your link…',
    saidConfirming: 'Confirming…',
    confirmWorking: 'One moment: this page is telling Atropyle that this email address is yours. Nothing else is sent.',
    tokenNote:
      'The code from your link is no longer in the address bar, so a screenshot or a shared address cannot reveal it.',
    privacyLead: 'What Atropyle keeps, and for how long:',
  },
  {
    confirmTitle: glue('Đang xác~nhận cảnh~báo qua email'),
    confirmedTitle: glue('Cảnh~báo qua email đã bật'),
    confirmedStop: 'Mọi email đều có link để ngừng, chỉ bằng một lần bấm.',
    confirmError: glue('Chưa xác~nhận được cảnh~báo'),
    vaultLabel: 'Vault',
    roleLabel: glue('Vai~trò của bạn'),
    openVault: 'Mở vault',
    expiredTitle: 'Link này không còn dùng được',
    expiredBody:
      'Có thể link đã hết hạn, hoặc cảnh báo của nó đã bị ngừng. Hãy đăng ký lại từ trang vault hoặc từ link mời của bạn.',
    findVaults: 'Tìm vault của bạn',
    invalidTitle: glue('Link này không đầy~đủ'),
    invalidBody:
      'Một phần của link bị thiếu hoặc đã bị sửa, nên không có gì được gửi đi. Hãy mở lại link từ email, hoặc chép nguyên địa chỉ vào trình duyệt.',
    hostedOnlyTitle: glue('Cảnh~báo qua email nằm ở site chính'),
    hostedOnlyBody:
      'Bản Atropyle này nằm trên chain và không có máy chủ, nên không xác nhận hay ngừng cảnh báo được. Hãy mở link trong email đúng như nó được gửi: link đó trỏ tới site chính.',
    unsubTitle: glue('Ngừng cảnh~báo qua email?'),
    unsubReady:
      'Địa chỉ email này sẽ không nhận thêm cảnh báo nào cho vault này. Bạn có thể đăng ký lại bất cứ lúc nào.',
    unsubButton: glue('Ngừng cảnh~báo'),
    unsubWorking: 'Đang ngừng…',
    unsubKeep: 'Không có gì thay đổi cho tới khi bạn bấm nút. Nếu bạn lỡ mở link này, cứ đóng trang lại.',
    unsubDoneTitle: glue('Đã ngừng cảnh~báo'),
    unsubDoneBody:
      'Chúng tôi đã xoá địa chỉ email này khỏi cảnh báo của vault này. Bạn sẽ không nhận thêm gì về nó nữa.',
    unsubAgain: 'Đổi ý? Hãy đăng ký lại từ trang vault hoặc từ link mời của bạn.',
    unsubError: glue('Chưa ngừng được cảnh~báo'),
    saidReading: 'Đang đọc link của bạn…',
    saidConfirming: 'Đang xác nhận…',
    confirmWorking:
      'Chờ một chút: trang này đang báo cho Atropyle rằng địa chỉ email này là của bạn. Không gửi gì khác.',
    tokenNote: 'Mã trong link không còn trên thanh địa chỉ, nên ảnh chụp màn hình hay địa chỉ chia sẻ không làm lộ nó.',
    privacyLead: 'Atropyle giữ gì, và giữ bao lâu:',
  },
);
