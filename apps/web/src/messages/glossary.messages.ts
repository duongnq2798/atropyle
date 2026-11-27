import { defineMessages } from '@/i18n/core';

/** The words of the heir letter, each with a short meaning (Plan 7B Task 11). */
export const messages = defineMessages(
  {
    title: 'Words in this letter',
    open: 'What "{term}" means',
    vault: 'Vault',
    vaultDef:
      'A contract on X Layer that holds nothing itself: the owner allowed it to move chosen assets to the heirs, and only when its rules say so.',
    checkIn: 'Check-in',
    checkInDef: 'A transaction the owner signs to say they are still here. Each one starts the count again.',
    alarm: 'Alarm',
    alarmDef:
      'Anyone can raise it once the owner is late. It gives the owner one last window to check in before the vault passes on.',
    guardian: 'Guardian',
    guardianDef:
      "Someone the owner trusts. Enough guardians together can say the owner has died, or move the owner's assets to a new wallet if the owner lost access.",
    xlayer: 'X Layer',
    xlayerDef: 'The blockchain the vault lives on. Anyone can read what happens there, with any explorer.',
  },
  {
    title: 'Các từ trong lá thư này',
    open: '"{term}" nghĩa là gì',
    vault: 'Vault',
    vaultDef:
      'Một hợp đồng trên X Layer không tự giữ gì: chủ vault cho phép nó chuyển những tài sản đã chọn cho người thừa kế, và chỉ khi luật của nó cho phép.',
    checkIn: 'Điểm danh',
    checkInDef: 'Một giao dịch chủ vault ký để báo mình vẫn còn đây. Mỗi lần điểm danh, việc đếm giờ bắt đầu lại.',
    alarm: 'Báo động',
    alarmDef:
      'Bất kỳ ai cũng bật được khi chủ vault trễ hạn. Nó cho chủ vault một khoảng thời gian cuối để điểm danh trước khi vault được trao.',
    guardian: 'Người giám hộ',
    guardianDef:
      'Người được chủ vault tin tưởng. Đủ số người giám hộ cùng hành động thì có thể xác nhận chủ vault đã qua đời, hoặc chuyển tài sản sang ví mới nếu chủ vault mất quyền truy cập ví.',
    xlayer: 'X Layer',
    xlayerDef:
      'Chuỗi khối nơi vault hoạt động. Ai cũng có thể đọc những gì xảy ra trên đó, bằng bất kỳ trình khám phá nào.',
  },
);
