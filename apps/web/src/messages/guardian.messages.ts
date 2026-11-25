import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    title: 'You guard this vault',
    plainWarning:
      "In plain words: never vote because of a message, a link or a call from a number you do not know, even if it seems to come from the owner or their family. Meet them, or call a number you already had. Someone who took the owner's phone would ask you exactly this.",
    colGuardian: 'Guardian',
    colAttested: 'Confirmed the death',
    colVote: 'Vote for a new wallet',
    you: 'You',
    noVote: 'No vote',
    attestCount: '{n} of the {k} confirmations the vault needs.',
    tallyVotes: '{votes} of {k} votes',
    attestTitle: 'Confirm that the owner has died',
    attestHelp: 'Only confirm when you know it for certain. Your confirmation counts toward the {k} the vault needs.',
    attestOn: 'Confirm the death',
    attestOff: 'Withdraw my confirmation',
    voteTitle: 'Vote to move everything in the vault to a new wallet',
    power:
      "{k} guardians who agree, you included, can move everything in the vault to a wallet you choose. It is meant for the owner's new wallet if they lose their key. The owner can stop it only by checking in before the window ends.",
    voteHelp:
      'Use this only when the owner lost their key and asked you, face to face or on a call you trust. Type the new address, then type or paste it again.',
    target: 'New wallet address',
    targetAgain: 'The same address again',
    reasonInvalid: 'That is not a valid address. Check it, including its capital letters.',
    reasonMismatch: 'The two addresses do not match.',
    vote: 'Vote for this wallet',
    withdraw: 'Withdraw my vote',
    telegram: 'Get alerts on Telegram',
  },
  {
    title: 'Bạn là người giám hộ vault này',
    plainWarning:
      'Nói đơn giản: đừng bao giờ bầu chỉ vì một tin nhắn, một đường link hay một cuộc gọi từ số lạ, kể cả khi nó có vẻ đến từ chủ vault hay gia đình họ. Hãy gặp trực tiếp, hoặc gọi vào số bạn đã có từ trước. Kẻ lấy được điện thoại của chủ vault sẽ nhờ bạn đúng việc này.',
    colGuardian: 'Người giám hộ',
    colAttested: 'Đã xác nhận qua đời',
    colVote: 'Bầu ví mới',
    you: 'Bạn',
    noVote: 'Chưa bầu',
    attestCount: '{n} trên {k} xác nhận mà vault cần.',
    tallyVotes: '{votes} trên {k} phiếu',
    attestTitle: 'Xác nhận chủ vault đã qua đời',
    attestHelp: 'Chỉ xác nhận khi bạn biết chắc chắn. Xác nhận của bạn được tính vào {k} xác nhận mà vault cần.',
    attestOn: 'Xác nhận qua đời',
    attestOff: 'Rút lại xác nhận',
    voteTitle: 'Bầu chuyển toàn bộ tài sản trong vault sang ví mới',
    power:
      '{k} người giám hộ cùng đồng ý, trong đó có bạn, thì có thể chuyển toàn bộ tài sản trong vault sang một ví do bạn chọn. Tính năng này dành cho ví mới của chủ vault nếu họ mất khoá. Chủ vault chỉ có thể ngăn lại bằng cách điểm danh trước khi hết thời gian báo động.',
    voteHelp:
      'Chỉ dùng khi chủ vault mất khoá và nhờ bạn trực tiếp, hoặc qua một cuộc gọi bạn tin được. Gõ địa chỉ mới, rồi gõ hoặc dán lại lần nữa.',
    target: 'Địa chỉ ví mới',
    targetAgain: 'Nhập lại đúng địa chỉ đó',
    reasonInvalid: 'Đây không phải địa chỉ hợp lệ. Hãy kiểm lại, kể cả chữ hoa chữ thường.',
    reasonMismatch: 'Hai địa chỉ không trùng nhau.',
    vote: 'Bầu ví này',
    withdraw: 'Rút lại phiếu',
    telegram: 'Nhận cảnh báo qua Telegram',
  },
);
