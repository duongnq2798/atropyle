import { defineMessages } from '@/i18n/core';

/**
 * `~` is a space where a line must not break; glue() turns it into U+00A0, as in proof.messages.ts. Vietnamese writes
 * the syllables of one word with spaces between them ("cảnh báo", "người thừa kế"), so a heading, a button or a short
 * label could break inside a word; vi-compounds-showcase.test.ts holds them. "X Layer" is one name in both languages.
 */
const glue = (s: string): string => s.replaceAll('~', '\u00A0');

export const messages = defineMessages(
  {
    title: 'Email alerts',
    roleOwner:
      'A reminder before each check-in is due, and an alert if the alarm is raised or a guardian votes for a recovery wallet.',
    roleGuardian: 'An alert when the alarm is raised, so you can reach the owner in time.',
    roleHeir: 'An email if the alarm is raised, and the steps to receive your share when the time comes.',
    email: 'Email address',
    emailInvalid: 'Enter an email address like name@example.com.',
    mailLang: 'Language of the emails',
    send: 'Send me a confirmation email',
    sending: 'Sending…',
    privacy:
      'We keep only this email, the vault, your role and the language. Every email we send has a one-click link that deletes them.',
    checkInbox: 'Check your inbox',
    checkInboxHelp:
      'If {email} can get alerts for this vault, a confirmation email is on its way. Nothing else is sent until you open the link in it.',
    checkSpam: 'Nothing after a few minutes? Look in the spam folder.',
    again: 'Use another email address',
    errorRateLimited: 'Too many sign-ups in the last hour. Try again later.',
    errorInvalid: 'This email or this vault was not accepted. Check the email and try again.',
    errorNotVault: glue(
      'X~Layer does not show a vault at this address yet. If it was created a moment ago, try again in a minute.',
    ),
    errorTimeout:
      'The alert service did not answer in time. If no confirmation email arrives in a few minutes, try again.',
    errorUnavailable: 'The alert service cannot be reached right now. Try again later; the vault works without it.',
    hostedOnly: 'Email alerts need a server, so they exist only on the main site.',
    hostedOnlyWhy: 'This copy of Atropyle lives on the chain and talks only to it.',
    hostedLink: 'Sign up on {host}',
  },
  {
    title: glue('Cảnh~báo qua email'),
    roleOwner:
      'Lời nhắc trước mỗi lần cần điểm danh, và cảnh báo khi có người báo động hoặc một người giám hộ bỏ phiếu chọn ví khôi phục.',
    roleGuardian: 'Cảnh báo khi có người báo động, để bạn kịp liên lạc với chủ vault.',
    roleHeir: 'Email khi có người báo động, và các bước để nhận phần của bạn khi tới lúc.',
    email: glue('Địa~chỉ email'),
    emailInvalid: 'Nhập một địa chỉ email, ví dụ ten@example.com.',
    mailLang: glue('Ngôn~ngữ của email'),
    send: glue('Gửi email xác~nhận cho tôi'),
    sending: 'Đang gửi…',
    privacy:
      'Chúng tôi chỉ giữ email này, vault, vai trò của bạn và ngôn ngữ. Mọi email chúng tôi gửi đều có một link xoá chúng chỉ bằng một lần bấm.',
    checkInbox: glue('Hãy xem hộp~thư của bạn'),
    checkInboxHelp:
      'Nếu {email} nhận được cảnh báo cho vault này, một email xác nhận đang được gửi tới. Sẽ không có email nào khác cho tới khi bạn mở link trong email đó.',
    checkSpam: 'Vài phút rồi vẫn chưa thấy? Hãy xem thư mục spam.',
    again: glue('Dùng địa~chỉ email khác'),
    errorRateLimited: 'Có quá nhiều lượt đăng ký trong một giờ qua. Hãy thử lại sau.',
    errorInvalid: 'Email hoặc vault này không được chấp nhận. Hãy kiểm tra lại email rồi thử lại.',
    errorNotVault: glue(
      'X~Layer chưa cho thấy vault nào ở địa chỉ này. Nếu vault vừa được tạo, hãy thử lại sau một phút.',
    ),
    errorTimeout: 'Dịch vụ cảnh báo không trả lời kịp. Nếu vài phút nữa vẫn chưa có email xác nhận, hãy thử lại.',
    errorUnavailable:
      'Lúc này chưa kết nối được dịch vụ cảnh báo. Hãy thử lại sau; vault vẫn hoạt động mà không cần nó.',
    hostedOnly: 'Cảnh báo qua email cần một máy chủ, nên chỉ có trên trang chính.',
    hostedOnlyWhy: 'Bản Atropyle này nằm trên chain và chỉ nói chuyện với chain.',
    hostedLink: glue('Đăng~ký trên {host}'),
  },
);
