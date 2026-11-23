import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    title: 'You can receive from this vault',
    titleAnyone: 'Help this vault move on',
    anyone:
      'Anyone can raise the alarm or deliver the assets once the vault is released; the assets go to the heirs, not to you.',
    anyoneRecover:
      'Anyone can raise the alarm or deliver the assets once the vault is released; the assets go to the recovery wallet the guardians chose, not to you.',
    pokeHelp:
      'If the owner has missed their check-ins, anyone can raise the alarm or move the vault to its next state. The owner can still cancel an alarm by checking in.',
    poke: 'Raise alarm',
    recoveryPending:
      'A recovery is pending: if the owner does not check in before the window ends, everything in the vault goes to this wallet, chosen by the guardians:',
    releasedRecover: 'The vault was released to the recovery wallet chosen by the guardians:',
    claimHelp: 'The vault is released. Claim sends every asset as the vault was set up.',
    claimHelpRecover: 'Claim sends everything in the vault to the recovery wallet above.',
    claim: 'Claim',
    deliverHelp:
      'The vault is released. Deliver sends every asset to the heirs, as the vault was set up. Nothing comes to your wallet.',
    deliverHelpRecover:
      'Deliver sends everything in the vault to the recovery wallet above. Nothing comes to your wallet.',
    deliver: 'Deliver the assets',
    results: 'Transfers',
    history: 'Show recent transfers',
    historyBusy: 'Loading…',
    historyRange: 'Shows the last few hours only.',
    noTransfers: 'No transfers in the last few hours.',
    colAsset: 'Asset',
    colTo: 'To',
    colAmount: 'Amount',
    colResult: 'Result',
    sent: 'Sent',
    failed: 'Failed',
    failedHelp:
      'A failed transfer means the token refused it, for example because the owner moved the tokens or removed the allowance.',
    nftId: 'id {id}',
    telegram: 'Get alerts on Telegram',
  },
  {
    title: 'Bạn có thể nhận từ vault này',
    titleAnyone: 'Giúp vault này đi tiếp',
    anyone:
      'Ai cũng có thể báo động, hoặc chuyển tài sản khi đã tới lúc trao cho người thừa kế; tài sản đi tới họ, không phải cho bạn.',
    anyoneRecover:
      'Ai cũng có thể báo động, hoặc chuyển tài sản khi đã tới lúc trao cho ví khôi phục do các người giám hộ chọn; tài sản đi tới ví đó, không phải cho bạn.',
    pokeHelp:
      'Nếu chủ vault đã bỏ lỡ các lần điểm danh, ai cũng có thể báo động hoặc chuyển vault sang trạng thái kế tiếp. Chủ vault vẫn huỷ được báo động bằng cách điểm danh.',
    poke: 'Báo động',
    recoveryPending:
      'Đang chờ khôi phục: nếu chủ vault không điểm danh trước khi hết thời gian báo động, toàn bộ tài sản trong vault sẽ chuyển tới ví này, do các người giám hộ chọn:',
    releasedRecover: 'Đã tới lúc vault trao tài sản cho ví khôi phục do các người giám hộ chọn:',
    claimHelp: 'Đã tới lúc vault trao tài sản. Nút Nhận sẽ chuyển mọi tài sản đúng như vault đã được thiết lập.',
    claimHelpRecover: 'Nút Nhận sẽ chuyển toàn bộ tài sản trong vault sang ví khôi phục ở trên.',
    claim: 'Nhận',
    deliverHelp:
      'Đã tới lúc vault trao tài sản. Nút Chuyển tài sản sẽ gửi mọi tài sản tới người thừa kế, đúng như vault đã được thiết lập. Ví của bạn không nhận gì.',
    deliverHelpRecover:
      'Nút Chuyển tài sản sẽ gửi toàn bộ tài sản trong vault sang ví khôi phục ở trên. Ví của bạn không nhận gì.',
    deliver: 'Chuyển tài sản',
    results: 'Các lần chuyển',
    history: 'Xem các lần chuyển gần đây',
    historyBusy: 'Đang tải…',
    historyRange: 'Chỉ hiện vài giờ gần nhất.',
    noTransfers: 'Không có lần chuyển nào trong vài giờ gần nhất.',
    colAsset: 'Tài sản',
    colTo: 'Tới',
    colAmount: 'Số lượng',
    colResult: 'Kết quả',
    sent: 'Đã chuyển',
    failed: 'Thất bại',
    failedHelp:
      'Chuyển thất bại nghĩa là token từ chối, chẳng hạn vì chủ vault đã chuyển token đi hoặc đã xoá allowance.',
    nftId: 'id {id}',
    telegram: 'Nhận cảnh báo qua Telegram',
  },
);
