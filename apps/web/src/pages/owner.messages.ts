import { defineMessages } from '../lib/i18n';

export const messages = defineMessages(
  {
    title: 'You own this vault',
    checkIn: 'Check in',
    checkInHelp:
      'A check-in tells the vault you are alive. It resets the missed check-ins, cancels an alarm and stops a pending recovery.',
    closed: 'This vault is closed: no more check-ins.',
    telegram: 'Get reminders on Telegram',
    coverageTitle: 'Coverage',
    coverageHelp: 'Approve again so the vault can move everything you hold.',
    fixCoverage: 'Fix coverage',
    editTitle: 'Edit the vault',
    tabHeirs: 'Heirs',
    tabGuardians: 'Guardians',
    tabTiming: 'Timing',
    tabAssets: 'Assets',
    save: 'Save changes',
    revokeTitle: 'Revoke all',
    revokeHelp:
      'Removes every allowance the vault has over your assets. Your heirs then receive nothing until you approve again.',
    revoke: 'Revoke all',
  },
  {
    title: 'Bạn là chủ vault này',
    checkIn: 'Điểm danh',
    checkInHelp:
      'Điểm danh báo cho vault biết bạn còn sống. Việc này xoá số lần bỏ lỡ, huỷ báo động và ngăn việc khôi phục đang chờ.',
    closed: 'Vault đã đóng: không điểm danh được nữa.',
    telegram: 'Nhận nhắc nhở qua Telegram',
    coverageTitle: 'Độ phủ',
    coverageHelp: 'Approve lại để vault chuyển được mọi thứ bạn đang giữ.',
    fixCoverage: 'Sửa độ phủ',
    editTitle: 'Sửa vault',
    tabHeirs: 'Người thừa kế',
    tabGuardians: 'Người giám hộ',
    tabTiming: 'Thời gian',
    tabAssets: 'Tài sản',
    save: 'Lưu thay đổi',
    revokeTitle: 'Thu hồi tất cả',
    revokeHelp:
      'Xoá mọi allowance của vault trên tài sản của bạn. Khi đó người thừa kế không nhận được gì cho tới khi bạn approve lại.',
    revoke: 'Thu hồi tất cả',
  },
);
