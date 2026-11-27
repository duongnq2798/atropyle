import { defineMessages } from '@/i18n/core';

/** Warnings the app says in its own words, from the SDK's typed params (Warning.params); shared by T3, T4 and T7. */
export const messages = defineMessages(
  {
    recoveryPower:
      'Wallet recovery is on: {k} of {n} guardians acting together can move 100% of the covered assets to any wallet they choose. The owner can stop it only by checking in before the alarm window of {window} ends.',
    /** GUARDIAN_VERIFY_OUT_OF_BAND: the SDK's own text, word for word (warning-text.test.tsx guards it). */
    guardianOutOfBand:
      'Before signing, confirm the request through a channel you already trust, such as a call or a meeting. Never act only on a message, even one that seems to come from the family or from Atropyle.',
  },
  {
    recoveryPower:
      'Đã bật khôi phục ví: {k} trên {n} người giám hộ cùng hành động thì có thể chuyển 100% tài sản vault đang phủ sang bất kỳ ví nào họ chọn. Chủ vault chỉ có thể ngăn lại bằng cách điểm danh trước khi hết thời gian báo động {window}.',
    guardianOutOfBand:
      'Trước khi ký, hãy xác nhận yêu cầu qua một kênh bạn vốn đã tin, như một cuộc gọi hay gặp trực tiếp. Đừng bao giờ hành động chỉ vì một tin nhắn, kể cả tin có vẻ đến từ gia đình hay từ Atropyle.',
  },
);
