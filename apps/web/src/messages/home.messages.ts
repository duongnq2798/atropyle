import { defineMessages } from '@/i18n/core';

/**
 * `~` is a space where a line must not break; glue() turns it into U+00A0, as in proof.messages.ts. Vietnamese writes
 * the syllables of one word with spaces between them, so a phone can split "xảy ra" or "điểm danh" across two lines,
 * and "X Layer" is one name in both languages: a line that ends on a lone "X" reads as a typo. The hero's Vietnamese
 * is glued word by word, measured at 320 to 1440 px (7C-T4); home-messages.test.ts holds every "X Layer" here.
 */
const glue = (s: string): string => s.replaceAll('~', '\u00A0');

export const messages = defineMessages(
  {
    title: 'Atropyle',
    heroTitle: 'What happens to your crypto when you can no longer sign?',
    heroLead: glue(
      'Nothing, unless you plan for it. Atropyle watches over your wallet on X~Layer. Check in now and then. If you go quiet, the people you chose receive what you left them.',
    ),
    heroDrill: 'Rehearse it in about 6 minutes',
    heroDrillNote: glue('No Atropyle fee. You pay only X~Layer network gas, in OKB.'),
    heroProof: 'See the proof',
    heroFactCustody: 'Your tokens stay in your wallet',
    heroFactLive: glue('Live on X~Layer mainnet since~{date}'),
    heroHeirDoor: 'Named as an heir or a guardian? Start here',
    askLegend: 'Ask the circuit',
    askAlive: 'If I keep checking in',
    askSilent: 'If I go silent',
    askLiar: 'If my guardians lie while I keep checking in',
    answerAlive: 'The gate stays closed. Your wallet stays yours.',
    answerSilent: 'The gate opens. Your heirs can claim.',
    answerLiar: 'The gate stays closed. Your check-in outweighs their word.',
    askCaption:
      'The real policy circuit, {nand} NAND gates and {latch} latches in {depth} layers, answering this question.',
    askRunAll: 'Run all {cases} cases yourself',
    askButton: glue('Ask X~Layer'),
    askBusy: glue('Asking X~Layer…'),
    askHint: glue('Your browser asks the processor on X~Layer the same question. No signature needed.'),
    askUnreachable: glue('X~Layer is not reachable from this device.'),
  },
  {
    title: 'Atropyle',
    heroTitle: glue('Chuyện gì xảy~ra với tài~sản crypto của bạn khi bạn không~còn ký được~nữa?'),
    heroLead: glue(
      'Không có gì cả, trừ khi bạn chuẩn~bị trước. Atropyle trông~chừng ví của bạn trên X~Layer. Thỉnh~thoảng bạn điểm~danh. Nếu bạn im~lặng, những người bạn đã chọn sẽ nhận phần bạn để~lại.',
    ),
    heroDrill: 'Diễn tập trong khoảng 6 phút',
    heroDrillNote: glue('Atropyle không thu~phí. Bạn chỉ trả gas của mạng X~Layer, bằng OKB.'),
    heroProof: 'Xem chứng minh',
    heroFactCustody: glue('Token của bạn nằm~yên trong ví'),
    heroFactLive: glue('Đang chạy trên mainnet X~Layer từ~{date}'),
    heroHeirDoor: glue('Bạn là người thừa~kế hay giám~hộ? Bắt~đầu ở~đây'),
    askLegend: 'Hỏi circuit',
    askAlive: glue('Nếu tôi vẫn điểm~danh'),
    askSilent: glue('Nếu tôi im~lặng'),
    askLiar: glue('Nếu giám~hộ nói~dối khi tôi vẫn điểm~danh'),
    answerAlive: glue('Cổng vẫn đóng. Ví vẫn là của~bạn.'),
    answerSilent: glue('Cổng mở. Người thừa~kế của bạn có~thể nhận.'),
    answerLiar: glue('Cổng vẫn đóng. Lần điểm~danh của bạn nặng hơn lời họ.'),
    askCaption: glue(
      'Circuit chính sách thật, {nand} cổng NAND và {latch} latch trong {depth} lớp, đang trả~lời câu~hỏi này.',
    ),
    askRunAll: glue('Tự chạy cả {cases} trường~hợp'),
    askButton: glue('Hỏi X~Layer'),
    askBusy: glue('Đang hỏi X~Layer…'),
    askHint: glue('Trình~duyệt của bạn hỏi processor trên X~Layer đúng câu này. Bạn không cần ký gì.'),
    askUnreachable: glue('Không kết~nối được tới X~Layer từ thiết~bị này.'),
  },
);
