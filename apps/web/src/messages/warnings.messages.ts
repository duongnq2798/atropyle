import { defineMessages } from '@/i18n/core';

/** Warnings the app says in its own words, from the SDK's typed params (Warning.params); shared by T3, T4 and T7. */
export const messages = defineMessages(
  {
    recoveryPower:
      'Wallet recovery is on: {k} of {n} guardians acting together can move 100% of the covered assets to any wallet they choose. The owner can stop it only by checking in before the {window} alarm window ends.',
  },
  {
    recoveryPower:
      'Đã bật khôi phục ví: {k} trên {n} người giám hộ cùng hành động thì có thể chuyển 100% tài sản vault đang phủ sang bất kỳ ví nào họ chọn. Chủ vault chỉ có thể ngăn lại bằng cách điểm danh trước khi hết thời gian báo động {window}.',
  },
);
