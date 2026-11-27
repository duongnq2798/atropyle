import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    ownerActive: 'You last checked in on {date}. Check in again before {until} and nothing changes.',
    ownerLate:
      'You have not checked in since {since}. Since {date} anyone may raise the alarm; check in now and nothing changes.',
    ownerGrace: 'The alarm was raised on {date}. Check in before {until} to cancel it.',
    ownerDue: 'The time to cancel the alarm ended on {date}.',
    ownerRecovery: 'Your guardians started a recovery on {date}. If you are here, check in before {until} to stop it.',
    ownerRecoveryDue: 'The time to stop the recovery ended on {date}.',
    ownerReleasedInherit: 'On {date} the vault was released to your heirs. Anyone can now deliver the assets to them.',
    ownerReleasedRecover:
      'On {date} the vault was released to the recovery wallet your guardians chose. Anyone can now deliver the assets there.',
    ownerReleasedInheritDone:
      'On {date} the vault was released to your heirs, and its assets have been delivered to them.',
    ownerReleasedRecoverDone:
      'On {date} the vault was released to the recovery wallet your guardians chose, and its assets have been delivered there.',
    ownerExpired: 'This Drill expired on {date}. Nothing more can happen in it.',
    guestActive:
      'The owner last checked in on {date}. If they do not check in again, an alarm can be raised from {until}.',
    guestLate: 'The owner has not checked in since {since}. Since {date} anyone may raise the alarm.',
    guestGrace: 'The alarm was raised on {date}. The owner can still cancel it by checking in before {until}.',
    guestDue: 'The time to cancel the alarm ended on {date}.',
    guestRecovery: 'The guardians started a recovery on {date}. The owner can stop it by checking in before {until}.',
    guestRecoveryDue: 'The time to stop the recovery ended on {date}.',
    guestReleasedInherit: 'On {date} the vault was released to the heirs. Anyone can now deliver the assets to them.',
    guestReleasedRecover:
      'On {date} the vault was released to the recovery wallet the guardians chose. Anyone can now deliver the assets there.',
    guestReleasedInheritDone:
      'On {date} the vault was released to the heirs, and its assets have been delivered to them.',
    guestReleasedRecoverDone:
      'On {date} the vault was released to the recovery wallet the guardians chose, and its assets have been delivered there.',
    guestExpired: 'This Drill expired on {date}. Nothing more can happen in it.',
  },
  {
    ownerActive:
      'Bạn điểm\u00a0danh lần gần\u00a0nhất vào {date}. Hãy điểm\u00a0danh lại trước {until} thì mọi thứ giữ nguyên.',
    ownerLate:
      'Bạn chưa điểm\u00a0danh từ {since}. Từ {date}, bất\u00a0kỳ ai cũng có thể báo\u00a0động; điểm\u00a0danh ngay bây giờ thì mọi thứ giữ nguyên.',
    ownerGrace: 'Báo\u00a0động đã được bật vào {date}. Hãy điểm\u00a0danh trước {until} để huỷ.',
    ownerDue: 'Thời\u00a0gian huỷ báo\u00a0động đã hết vào {date}.',
    ownerRecovery:
      'Người\u00a0giám\u00a0hộ của bạn đã bắt\u00a0đầu khôi\u00a0phục vào {date}. Nếu bạn vẫn ở đây, hãy điểm\u00a0danh trước {until} để ngăn\u00a0lại.',
    ownerRecoveryDue: 'Thời\u00a0gian ngăn khôi\u00a0phục đã hết vào {date}.',
    ownerReleasedInherit:
      'Từ {date}, đã tới lúc vault trao tài\u00a0sản cho người\u00a0thừa\u00a0kế của bạn. Giờ ai cũng có thể chuyển tài\u00a0sản tới họ.',
    ownerReleasedRecover:
      'Từ {date}, đã tới lúc vault trao tài\u00a0sản cho ví\u00a0khôi\u00a0phục do người\u00a0giám\u00a0hộ của bạn chọn. Giờ ai cũng có thể chuyển tài\u00a0sản tới ví đó.',
    ownerReleasedInheritDone:
      'Ngày {date} vault đã được trao cho người\u00a0thừa\u00a0kế của bạn, và tài\u00a0sản đã được chuyển tới họ.',
    ownerReleasedRecoverDone:
      'Ngày {date} vault đã được trao cho ví\u00a0khôi\u00a0phục do người\u00a0giám\u00a0hộ của bạn chọn, và tài\u00a0sản đã được chuyển tới ví đó.',
    ownerExpired: 'Drill này đã hết\u00a0hạn vào {date}. Không còn gì xảy\u00a0ra được nữa.',
    guestActive:
      'Chủ\u00a0vault điểm\u00a0danh lần gần\u00a0nhất vào {date}. Nếu họ không điểm\u00a0danh lại, từ {until} có thể báo\u00a0động.',
    guestLate: 'Chủ\u00a0vault chưa điểm\u00a0danh từ {since}. Từ {date}, bất\u00a0kỳ ai cũng có thể báo\u00a0động.',
    guestGrace:
      'Báo\u00a0động đã được bật vào {date}. Chủ\u00a0vault vẫn huỷ được bằng cách điểm\u00a0danh trước {until}.',
    guestDue: 'Thời\u00a0gian huỷ báo\u00a0động đã hết vào {date}.',
    guestRecovery:
      'Các người\u00a0giám\u00a0hộ đã bắt\u00a0đầu khôi\u00a0phục vào {date}. Chủ\u00a0vault có thể ngăn\u00a0lại bằng cách điểm\u00a0danh trước {until}.',
    guestRecoveryDue: 'Thời\u00a0gian ngăn khôi\u00a0phục đã hết vào {date}.',
    guestReleasedInherit:
      'Từ {date}, đã tới lúc vault trao tài\u00a0sản cho người\u00a0thừa\u00a0kế. Giờ ai cũng có thể chuyển tài\u00a0sản tới họ.',
    guestReleasedRecover:
      'Từ {date}, đã tới lúc vault trao tài\u00a0sản cho ví\u00a0khôi\u00a0phục do các người\u00a0giám\u00a0hộ chọn. Giờ ai cũng có thể chuyển tài\u00a0sản tới ví đó.',
    guestReleasedInheritDone:
      'Ngày {date} vault đã được trao cho người\u00a0thừa\u00a0kế, và tài\u00a0sản đã được chuyển tới họ.',
    guestReleasedRecoverDone:
      'Ngày {date} vault đã được trao cho ví\u00a0khôi\u00a0phục do các người\u00a0giám\u00a0hộ chọn, và tài\u00a0sản đã được chuyển tới ví đó.',
    guestExpired: 'Drill này đã hết\u00a0hạn vào {date}. Không còn gì xảy\u00a0ra được nữa.',
  },
);

export type StandingKey = keyof typeof messages.en;
