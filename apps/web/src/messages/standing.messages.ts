import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    ownerActive: 'You last checked in on {date}. Check in again before {until} and nothing changes.',
    ownerLate:
      'You have not checked in since {since}. Since {date} anyone may raise the alarm; check in now and nothing changes.',
    ownerGrace: 'The alarm was raised on {date}. Check in before {until} to cancel it.',
    ownerDue: 'The time to cancel the alarm ended on {date}. The rules now let the vault pass to your heirs.',
    ownerRecovery: 'Your guardians started a recovery on {date}. If you are here, check in before {until} to stop it.',
    ownerRecoveryDue:
      'The time to stop the recovery ended on {date}. The rules now let the vault pass to the recovery wallet.',
    ownerReleasedInherit: 'On {date} the vault was released to your heirs. Anyone can now deliver the assets to them.',
    ownerReleasedRecover:
      'On {date} the vault was released to the recovery wallet your guardians chose. Anyone can now deliver the assets there.',
    ownerExpired: 'This Drill expired on {date}. Nothing more can happen in it.',
    guestActive:
      'The owner last checked in on {date}. If they do not check in again, an alarm can be raised from {until}.',
    guestLate: 'The owner has not checked in since {since}. Since {date} anyone may raise the alarm.',
    guestGrace: 'The alarm was raised on {date}. The owner can still cancel it by checking in before {until}.',
    guestDue: 'The time to cancel the alarm ended on {date}. The rules now let the vault pass to the heirs.',
    guestRecovery: 'The guardians started a recovery on {date}. The owner can stop it by checking in before {until}.',
    guestRecoveryDue:
      'The time to stop the recovery ended on {date}. The rules now let the vault pass to the recovery wallet.',
    guestReleasedInherit: 'On {date} the vault was released to the heirs. Anyone can now deliver the assets to them.',
    guestReleasedRecover:
      'On {date} the vault was released to the recovery wallet the guardians chose. Anyone can now deliver the assets there.',
    guestExpired: 'This Drill expired on {date}. Nothing more can happen in it.',
  },
  {
    ownerActive: 'Bạn điểm danh lần gần nhất vào {date}. Hãy điểm danh lại trước {until} thì mọi thứ giữ nguyên.',
    ownerLate:
      'Bạn chưa điểm danh từ {since}. Từ {date}, bất kỳ ai cũng có thể báo động; điểm danh ngay bây giờ thì mọi thứ giữ nguyên.',
    ownerGrace: 'Báo động đã được bật vào {date}. Hãy điểm danh trước {until} để huỷ.',
    ownerDue:
      'Thời gian huỷ báo động đã hết vào {date}. Giờ luật cho phép vault trao tài sản cho người thừa kế của bạn.',
    ownerRecovery:
      'Người giám hộ của bạn đã bắt đầu khôi phục vào {date}. Nếu bạn vẫn ở đây, hãy điểm danh trước {until} để ngăn lại.',
    ownerRecoveryDue:
      'Thời gian ngăn khôi phục đã hết vào {date}. Giờ luật cho phép vault trao tài sản cho ví khôi phục.',
    ownerReleasedInherit:
      'Từ {date}, đã tới lúc vault trao tài sản cho người thừa kế của bạn. Giờ ai cũng có thể chuyển tài sản tới họ.',
    ownerReleasedRecover:
      'Từ {date}, đã tới lúc vault trao tài sản cho ví khôi phục do người giám hộ của bạn chọn. Giờ ai cũng có thể chuyển tài sản tới ví đó.',
    ownerExpired: 'Drill này đã hết hạn vào {date}. Không còn gì xảy ra được nữa.',
    guestActive: 'Chủ vault điểm danh lần gần nhất vào {date}. Nếu họ không điểm danh lại, từ {until} có thể báo động.',
    guestLate: 'Chủ vault chưa điểm danh từ {since}. Từ {date}, bất kỳ ai cũng có thể báo động.',
    guestGrace: 'Báo động đã được bật vào {date}. Chủ vault vẫn huỷ được bằng cách điểm danh trước {until}.',
    guestDue: 'Thời gian huỷ báo động đã hết vào {date}. Giờ luật cho phép vault trao tài sản cho người thừa kế.',
    guestRecovery:
      'Các người giám hộ đã bắt đầu khôi phục vào {date}. Chủ vault có thể ngăn lại bằng cách điểm danh trước {until}.',
    guestRecoveryDue:
      'Thời gian ngăn khôi phục đã hết vào {date}. Giờ luật cho phép vault trao tài sản cho ví khôi phục.',
    guestReleasedInherit:
      'Từ {date}, đã tới lúc vault trao tài sản cho người thừa kế. Giờ ai cũng có thể chuyển tài sản tới họ.',
    guestReleasedRecover:
      'Từ {date}, đã tới lúc vault trao tài sản cho ví khôi phục do các người giám hộ chọn. Giờ ai cũng có thể chuyển tài sản tới ví đó.',
    guestExpired: 'Drill này đã hết hạn vào {date}. Không còn gì xảy ra được nữa.',
  },
);

export type StandingKey = keyof typeof messages.en;
