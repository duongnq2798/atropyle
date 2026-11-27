import { defineMessages } from '@/i18n/core';

/**
 * The heir letter of /vault/ (Plan 7B Task 11, spec §16.2 and §18.4.2 T11), for an heir and for the recovery wallet.
 * The heir receives; nothing here says claim or unlock. In Vietnamese the vault "trao" (passes on) and nothing says
 * the assets were already handed over: they stay in the owner's wallet until someone delivers them (R22).
 */
export const messages = defineMessages(
  {
    title: 'What this vault leaves you',
    titleRecover: 'A recovery names this wallet',
    to: 'To',
    from: 'From',
    openActive: 'Nothing has happened. This is what was set aside for you. The owner last checked in on {date}.',
    openSilent:
      'They have been silent since {date}. That is longer than the plan allows: anyone, you included, may now raise the alarm, and the owner can still answer it.',
    openAlarm:
      'They have been silent since {date}. The alarm is raised: if they do not check in before it ends, the vault passes to the heirs.',
    openDue:
      'They have been silent since {date}, and did not answer the alarm. The vault can now pass to the heirs: anyone can make that happen, you included.',
    openRecovery:
      'The guardians have started a wallet recovery. If the owner does not stop it, the assets go to the recovery wallet, not to the heirs.',
    openReleased:
      "Since {date} the vault has passed to the heirs. The assets stay in the owner's wallet until someone delivers them; anyone can, you included.",
    openDelivered: 'On {date} the vault passed to the heirs, and your share has reached your wallet.',
    openReleasedRecover: 'The vault passed to the recovery wallet the guardians chose. Nothing goes to the heirs.',
    openExpired: 'This Drill has expired: it was a rehearsal, and nothing more will happen to it.',
    openRecoverPending:
      "The guardians chose this wallet to receive the owner's assets. If the owner does not stop it, that can happen from {date}.",
    openRecoverDue:
      'The owner did not stop the recovery. The vault can now pass to this wallet: anyone can make that happen, you included.',
    openRecoverReleased:
      "Since {date} the vault has passed to this wallet. The assets stay in the owner's old wallet until someone delivers them; anyone can, you included.",
    openRecoverDelivered: 'On {date} the vault passed to this wallet, and the covered assets have reached it.',
    body: "Atropyle never holds the assets. A circuit on X Layer decides when the vault passes on, and the vault's contract decides who receives how much. Anyone can check each step below.",
    drillNote: 'This vault is a Drill (a rehearsal) with test tokens. Nothing in it has value.',
    threadLabel: "The vault's thread: {state}",
    threadLabelAhead: "The vault's thread: {state} now; dashed, where it leads if nothing changes: {ahead}",
    legendTitle: 'Who each branch is',
    legendYou: 'You',
    legendHeir: 'Heir {n}',
    legendAbout: 'about',
    sharesTitle: 'Who receives what',
    sharesCaption: 'If the vault passed on now, from what the owner holds and allows today.',
    shareYou: 'you',
    shareNft: 'NFT',
    sharesEmpty: "The owner's wallet holds nothing the vault covers right now.",
    sharesEmptyReleased: "Nothing the vault covers is left in the owner's wallet to deliver.",
    receivedTitle: 'What you received',
    shareUncovered: "Part of this token is not covered: it stays in the owner's wallet.",
    signed: 'Signed by their last check-in',
    vaultOn: 'This vault on {name}',
    stepsTitle: 'What you can do',
    stepVerify: 'Check the circuit yourself',
    stepVerifyHelp: 'Anyone can prove that the circuit deciding this vault is the one that was published.',
    stepVerifyGo: 'Run the check',
    stepMoveTitle: 'Move the vault on',
    stepMoveIdle: 'Nothing to move on now.',
    moveHelpAlarm:
      'The owner has missed their check-ins. Raising the alarm gives them one last window to answer; if they do not, the vault passes to the heirs. Anyone can raise it, you included.',
    moveHelpRelease:
      'The time to answer the alarm is over. This passes the vault to the heirs; then step 3 sends each their share.',
    moveHelpRecover:
      'The time to stop the recovery is over. This passes the vault to this wallet; then step 3 sends the assets here.',
    stepReceiveTitle: 'Receive',
    stepReceivedTitle: 'Received',
    receiveHelp:
      "Sends each heir their share from the owner's wallet, in one transaction. Anyone can send it; the assets go only to the heirs.",
    receiveHelpRecover:
      "Sends the covered assets from the owner's old wallet to this wallet, in one transaction. Anyone can send it.",
    receive: 'Receive',
    receiveHint: 'Hold to receive. This cannot be undone.',
    receiveDone: 'Now confirm in your wallet',
    received: 'Received · block {block}',
    receiveIdle: 'Nothing to receive now.',
    receivedNote: 'Delivered to your wallet: what you received is in the letter above.',
    resultsTitle: 'Transfers',
  },
  {
    title: 'Điều vault này để\u00a0lại cho bạn',
    titleRecover: 'Một\u00a0lần khôi\u00a0phục đã chọn ví này',
    to: 'Gửi',
    from: 'Từ',
    openActive: 'Chưa có gì xảy ra. Đây là phần đã được dành cho bạn. Chủ vault điểm danh lần gần nhất vào {date}.',
    openSilent:
      'Chủ vault đã im lặng từ {date}. Như vậy là lâu hơn kế hoạch cho phép: bất kỳ ai, kể cả bạn, giờ có thể báo động, và chủ vault vẫn có thể trả lời.',
    openAlarm:
      'Chủ vault đã im lặng từ {date}. Báo động đã được bật: nếu chủ vault không điểm danh trước khi hết thời gian báo động, vault sẽ trao cho những người thừa kế.',
    openDue:
      'Chủ vault đã im lặng từ {date} và không trả lời báo động. Giờ vault có thể trao cho những người thừa kế: bất kỳ ai cũng làm được việc này, kể cả bạn.',
    openRecovery:
      'Những người giám hộ đã bắt đầu khôi phục ví. Nếu chủ vault không ngăn\u00a0lại, tài sản sẽ chuyển sang ví khôi phục, không đến những người thừa kế.',
    openReleased:
      'Từ {date}, đã tới lúc vault trao tài sản cho những người thừa kế. Tài sản vẫn nằm trong ví chủ vault cho tới khi có người chuyển đi; bất kỳ ai cũng làm được, kể cả bạn.',
    openDelivered: 'Ngày {date}, vault đã trao cho những người thừa kế, và phần của bạn đã về ví của bạn.',
    openReleasedRecover:
      'Đã tới lúc vault trao tài sản cho ví khôi phục mà những người giám hộ chọn. Những người thừa kế sẽ không nhận gì.',
    openExpired: 'Drill (bản diễn tập) này đã hết hạn: đó chỉ là buổi diễn tập, và sẽ không có gì xảy ra với nó nữa.',
    openRecoverPending:
      'Những người giám hộ đã chọn ví này để nhận tài sản của chủ vault. Nếu chủ vault không ngăn\u00a0lại, việc này có thể diễn ra từ {date}.',
    openRecoverDue:
      'Chủ vault đã không ngăn lần khôi phục. Giờ vault có thể trao cho ví này: bất kỳ ai cũng làm được, kể cả bạn.',
    openRecoverReleased:
      'Từ {date}, đã tới lúc vault trao tài sản cho ví này. Tài sản vẫn nằm trong ví cũ của chủ vault cho tới khi có người chuyển đi; bất kỳ ai cũng làm được, kể cả bạn.',
    openRecoverDelivered: 'Ngày {date}, vault đã trao cho ví này, và tài sản vault phủ đã về ví này.',
    body: 'Atropyle không bao giờ giữ tài sản. Một mạch trên X Layer quyết định khi nào vault được trao, còn hợp đồng của vault quyết định ai nhận bao nhiêu. Ai cũng có thể kiểm tra từng bước dưới đây.',
    drillNote: 'Vault này là Drill (bản diễn tập), dùng token thử. Không thứ gì trong đó có giá trị.',
    threadLabel: 'Sợi\u00a0chỉ của vault: {state}',
    threadLabelAhead: 'Sợi chỉ của vault: hiện là {state}; nét đứt là nơi nó dẫn tới nếu không có gì thay đổi: {ahead}',
    legendTitle: 'Mỗi nhánh là của ai',
    legendYou: 'Bạn',
    legendHeir: 'Người\u00a0thừa\u00a0kế {n}',
    legendAbout: 'khoảng',
    sharesTitle: 'Ai nhận gì',
    sharesCaption: 'Nếu vault được trao ngay lúc này, theo những gì chủ vault đang giữ và cho phép hôm nay.',
    shareYou: 'bạn',
    shareNft: 'NFT',
    sharesEmpty: 'Ví chủ vault hiện không có gì mà vault đang phủ.',
    sharesEmptyReleased: 'Trong ví chủ vault không còn gì vault phủ để chuyển đi.',
    receivedTitle: 'Những gì bạn đã nhận',
    shareUncovered: 'Một phần token này chưa được phủ: phần đó ở lại ví chủ vault.',
    signed: 'Ký bằng lần điểm\u00a0danh cuối',
    vaultOn: 'Vault này trên {name}',
    stepsTitle: 'Những việc bạn có thể làm',
    stepVerify: 'Tự kiểm\u00a0tra mạch',
    stepVerifyHelp: 'Ai cũng có thể chứng minh mạch quyết định vault này đúng là mạch đã được công bố.',
    stepVerifyGo: 'Chạy kiểm\u00a0tra',
    stepMoveTitle: 'Đẩy vault đi tiếp',
    stepMoveIdle: 'Hiện chưa có gì để đẩy đi tiếp.',
    moveHelpAlarm:
      'Chủ vault đã lỡ các lần điểm danh. Báo động cho chủ vault một khoảng thời gian cuối để trả lời; nếu không, vault sẽ trao cho những người thừa kế. Bất kỳ ai cũng bật được, kể cả bạn.',
    moveHelpRelease:
      'Thời gian trả lời báo động đã hết. Việc này trao vault cho những người thừa kế; sau đó bước 3 chuyển phần của từng người.',
    moveHelpRecover:
      'Thời gian ngăn lần khôi phục đã hết. Việc này trao vault cho ví này; sau đó bước 3 chuyển tài sản về đây.',
    stepReceiveTitle: 'Nhận',
    stepReceivedTitle: 'Đã nhận',
    receiveHelp:
      'Chuyển phần của từng người thừa kế từ ví chủ vault, trong một giao dịch. Ai cũng gửi được; tài sản chỉ đến những người thừa kế.',
    receiveHelpRecover:
      'Chuyển tài sản vault đang phủ từ ví cũ của chủ vault sang ví này, trong một giao dịch. Ai cũng gửi được.',
    receive: 'Nhận',
    receiveHint: 'Giữ để nhận. Việc này không thể hoàn tác.',
    receiveDone: 'Giờ hãy xác\u00a0nhận trong ví của bạn',
    received: 'Đã nhận · block {block}',
    receiveIdle: 'Hiện chưa có gì để nhận.',
    receivedNote: 'Đã chuyển về ví của bạn: những gì bạn đã nhận có trong lá thư phía trên.',
    resultsTitle: 'Các lần chuyển',
  },
);
