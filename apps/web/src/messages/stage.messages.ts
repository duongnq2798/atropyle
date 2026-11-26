import { defineMessages } from '@/i18n/core';

/**
 * `~` is a space where a line must not break (home.messages.ts): Vietnamese words of two syllables, "day {day}" and
 * the key names of the hint (7B-T5 fix round 2). Every number is a parameter (spec §18.2, 3): the days come from
 * src/home/sim-days.ts, the durations from durationWords, k and n from HOME_VAULT.
 */
const glue = (s: string): string => s.replaceAll('~', '\u00A0');

export const messages = defineMessages(
  {
    stampMake: 'You make a vault',
    title: 'Every day, decided by the circuit',
    lead: 'Pick a story and move along the thread. Each state you see is what the policy circuit answers for that day, not a drawing.',
    storyLegend: 'The story',
    chipInherit: 'Inheritance',
    chipRecover: 'Recovery',
    whatLegend: 'What happens',
    switchConfirm: glue('A guardian confirms on day~{day}'),
    switchBack: glue('I come back on day~{day}'),
    day: glue('Day~{day}'),
    days: glue('Days~{from}–{to}'),
    titleStart: 'Your first check-in',
    titleQuiet: 'No check-in comes',
    titleAlarm: 'Silence. The alarm',
    titleConfirm: 'A guardian confirms',
    titleBack: 'You come back',
    titleVote: 'A guardian votes',
    titleVoteEnough: '{k} of {n} agree',
    titleGate: 'Through the gate',
    titleGateRecover: 'To the wallet they chose',
    sayStart: 'Making the vault counts as one. After {silence} without another, the alarm goes off.',
    sayQuiet: 'Every {period} without a check-in is counted. Nothing moves yet.',
    sayAlarm:
      'Your guardians are told. With a confirmation from {k} of the {n}, the gate can open {window} after the alarm.',
    sayConfirm: 'They confirm you can no longer sign. The gate opens when the alarm window ends.',
    sayBack: 'One check-in ends the alarm and cancels every confirmation. The count starts over.',
    sayBackRecovery: 'One check-in from your own wallet cancels the recovery. Nothing moves.',
    sayVote: 'They vote to move the vault to a wallet they choose. {k} of {n} must agree.',
    sayVoteEnough: 'The wait begins. Only your check-in can stop it, before {window} pass.',
    sayGate: 'The alarm window ends with no check-in. The gate opens: your heirs can claim.',
    sayGateFallback:
      'Nobody confirmed, so the vault waited its longest: {missed} periods of {period} without a check-in. The gate opens: your heirs can claim.',
    sayGateRecover: 'The wait ends with no check-in. Everything the vault covers can move to their wallet.',
    aboutInherit:
      'The vault in this story: a check-in every {period}, the alarm after {silence} without one, then an alarm window of {window}. A confirmation from {k} of its {n} guardians opens the gate when that window ends.',
    slider: 'Day in the story',
    valueText: glue('Day~{day}: {state}'),
    gateHeirs: glue('Heirs · day~{day}'),
    gateWallet: glue('Their wallet · day~{day}'),
    hint: 'Drag the thread, or use the arrow keys.',
    hintKeys: glue('Page~Up and Page~Down jump to the next day that matters.'),
    listTitle: 'Day by day',
    footPrerender:
      'Worked out when this page was built, by the Atropyle SDK on the policy circuit in this repository. Touch the stage and your browser works it out again.',
    footLive:
      'Your browser just worked out every day above, with the Atropyle SDK on the policy circuit in this repository.',
    footFailed: 'Your browser could not load the simulator, so these are the days worked out when the page was built.',
    retry: 'Try again',
  },
  {
    stampMake: glue('Bạn lập một vault'),
    title: glue('Mỗi ngày đều do circuit quyết~định'),
    lead: glue(
      'Chọn một câu~chuyện rồi đi dọc sợi~chỉ. Mỗi trạng~thái bạn thấy là câu trả~lời của circuit chính~sách cho ngày đó, không phải hình~vẽ.',
    ),
    storyLegend: glue('Câu~chuyện'),
    chipInherit: glue('Thừa~kế'),
    chipRecover: glue('Khôi~phục ví'),
    whatLegend: glue('Điều xảy~ra'),
    switchConfirm: glue('Một giám~hộ xác~nhận vào ngày~{day}'),
    switchBack: glue('Tôi điểm~danh lại vào ngày~{day}'),
    day: glue('Ngày~{day}'),
    days: glue('Ngày~{from}–{to}'),
    titleStart: glue('Lần điểm~danh đầu~tiên'),
    titleQuiet: glue('Không có lần điểm~danh nào'),
    titleAlarm: glue('Im~lặng. Báo~động'),
    titleConfirm: glue('Một giám~hộ xác~nhận'),
    titleBack: glue('Bạn quay~lại'),
    titleVote: glue('Một giám~hộ bỏ~phiếu'),
    titleVoteEnough: glue('{k} trên {n} người đồng~ý'),
    titleGate: 'Qua cổng',
    titleGateRecover: glue('Sang ví họ đã chọn'),
    sayStart: glue('Lập vault cũng tính là một lần. Nếu {silence} trôi~qua mà không có lần nào nữa, báo~động sẽ bật.'),
    sayQuiet: glue('Mỗi {period} không điểm~danh đều được đếm. Chưa có gì chuyển~đi.'),
    sayAlarm: glue(
      'Người giám~hộ được báo. Khi {k} trên {n} người giám~hộ xác~nhận, cổng có~thể mở sau báo~động {window}.',
    ),
    sayConfirm: glue('Họ xác~nhận bạn không~còn ký được. Cổng mở khi hết thời~gian báo~động.'),
    sayBack: glue('Một lần điểm~danh tắt báo~động và huỷ mọi xác~nhận. Việc đếm bắt~đầu lại.'),
    sayBackRecovery: glue('Một lần điểm~danh từ chính ví của bạn huỷ việc khôi~phục. Không có gì chuyển~đi.'),
    sayVote: glue('Họ bỏ~phiếu chuyển vault sang một ví họ chọn. Cần {k} trên {n} người đồng~ý.'),
    sayVoteEnough: glue('Thời~gian chờ bắt~đầu. Chỉ lần điểm~danh của bạn ngăn được, trước khi hết {window}.'),
    sayGate: glue('Hết thời~gian báo~động mà không có lần điểm~danh nào. Cổng mở: người thừa~kế của bạn có~thể nhận.'),
    sayGateFallback: glue(
      'Không ai xác~nhận, nên vault chờ lâu nhất: {missed} lần {period} không điểm~danh. Cổng mở: người thừa~kế của bạn có~thể nhận.',
    ),
    sayGateRecover: glue(
      'Hết thời~gian chờ mà không có lần điểm~danh nào. Mọi tài~sản vault đang phủ có~thể chuyển sang ví của họ.',
    ),
    aboutInherit: glue(
      'Vault trong câu~chuyện này: điểm~danh mỗi {period}, báo~động sau {silence} không điểm~danh, rồi {window} thời~gian báo~động. Khi {k} trên {n} người giám~hộ xác~nhận, cổng mở lúc hết thời~gian đó.',
    ),
    slider: glue('Ngày trong câu~chuyện'),
    valueText: glue('Ngày~{day}: {state}'),
    gateHeirs: glue('Người thừa~kế · ngày~{day}'),
    gateWallet: glue('Ví họ chọn · ngày~{day}'),
    hint: glue('Kéo sợi~chỉ, hoặc dùng phím mũi~tên.'),
    hintKeys: glue('Page~Up và Page~Down nhảy tới ngày quan~trọng kế~tiếp.'),
    listTitle: glue('Từng ngày'),
    footPrerender: glue(
      'Được tính lúc build trang này, bằng SDK của Atropyle trên circuit chính~sách trong repository này. Chạm vào sân~khấu, trình~duyệt của bạn sẽ tự tính lại.',
    ),
    footLive: glue(
      'Trình~duyệt của bạn vừa tự tính mọi ngày ở trên, bằng SDK của Atropyle trên circuit chính~sách trong repository này.',
    ),
    footFailed: glue('Trình~duyệt của bạn không nạp được bộ mô~phỏng, nên đây là các ngày được tính lúc build trang.'),
    retry: glue('Thử lại'),
  },
);
