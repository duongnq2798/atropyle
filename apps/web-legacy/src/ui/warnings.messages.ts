import { defineMessages } from '../lib/i18n';

/** SDK warnings this app translates. The others are shown in the SDK's English words. */
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
