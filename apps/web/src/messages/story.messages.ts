import { defineMessages } from '@/i18n/core';

/**
 * The home page after the stage (spec §18.4.3 Task 7a), read only by server components (src/home/bands.tsx through
 * src/i18n/say.tsx): none of it reaches a script. `~` is a space where a line must not break, as in home.messages.ts:
 * "X Layer" is one name, and a Vietnamese word of two syllables stays on one line. Every number is a parameter.
 */
const glue = (s: string): string => s.replaceAll('~', '\u00A0');

export const messages = defineMessages(
  {
    quiet1: 'The chain cannot tell when you are gone. So Atropyle asks, now and then.',
    quiet2: 'Rules like this are usually a promise. Here they are a circuit, and you can check every case.',
    trustCases: 'cases',
    trustLine:
      'Every turn of the story above was decided by the same circuit: {nand} NAND gates and {latch} latches. It decides when assets may leave; the contracts decide who receives how much. The proof covers the rules, not everything.',
    trustEdges: 'Read its edges',
    trustRun: 'Run the proof yourself',
    trustStatus: glue('Live vaults on X~Layer, counted from the chain'),
    agentStamp: glue('Before day~{day} · Planned in words'),
    agentTitle: 'Plan in plain words. Sign in your own wallet.',
    agentLead: 'Ask your AI agent. It checks the plan and prepares the vault.',
    agentYou: 'You',
    agentAgent: 'Agent',
    agentTool: 'Tool call',
    agentLine1: 'If I can no longer sign, my USDC should go to my two children, {a}% and {b}%. My sister can confirm.',
    agentLine2: 'The plan checks out: two heirs, your sister as guardian, a check-in every {period}.',
    agentLine3: glue(
      'If you go quiet, the alarm sounds on day~{alarm}. Once your sister confirms, your children can claim from day~{gate}.',
    ),
    agentLine4: 'Ready. Nothing is sent until you sign.',
    agentCaption: 'An illustrated session. The tool names are real.',
    agentInstall: 'Add Atropyle to Claude Code',
    agentMore: 'Other agents, the CLI and the SDK',
    closeTitle: 'Rehearse it before it is real.',
    closeLead: glue(
      'A Drill is a real vault on X~Layer whose rules run in minutes instead of months. Watch the gate open before you trust it with more.',
    ),
  },
  {
    quiet1: glue('Chain không tự biết khi nào bạn không~còn ở~đây. Vì~vậy, thỉnh~thoảng Atropyle hỏi bạn.'),
    quiet2: glue(
      'Luật như thế này thường chỉ là một lời~hứa. Ở~đây chúng là một circuit, và bạn kiểm được mọi trường~hợp.',
    ),
    trustCases: glue('trường~hợp'),
    trustLine: glue(
      'Mỗi bước của câu~chuyện ở trên đều do cùng một circuit quyết~định: {nand} cổng NAND và {latch} latch. Circuit quyết~định khi nào tài~sản được rời vault; các hợp~đồng quyết~định ai nhận bao~nhiêu. Chứng~minh này phủ các luật, không phủ mọi~thứ.',
    ),
    trustEdges: glue('Đọc giới~hạn của nó'),
    trustRun: glue('Tự chạy chứng~minh'),
    trustStatus: glue('Các vault đang chạy trên X~Layer, đếm từ chain'),
    agentStamp: glue('Trước ngày~{day} · Lập kế~hoạch bằng lời'),
    agentTitle: glue('Lập kế~hoạch bằng lời thường. Ký bằng ví của chính bạn.'),
    agentLead: glue('Hỏi agent AI của bạn. Nó kiểm kế~hoạch và chuẩn~bị vault.'),
    agentYou: 'Bạn',
    agentAgent: 'Agent',
    agentTool: glue('Gọi công~cụ'),
    agentLine1: glue('Nếu tôi không~còn ký được, USDC của tôi nên về hai con, {a}% và {b}%. Chị tôi có~thể xác~nhận.'),
    agentLine2: glue('Kế~hoạch hợp~lệ: hai người thừa~kế, chị bạn là giám~hộ, điểm~danh mỗi {period}.'),
    agentLine3: glue(
      'Nếu bạn im~lặng, báo~động bật vào ngày~{alarm}. Khi chị bạn xác~nhận, các con bạn có~thể nhận từ ngày~{gate}.',
    ),
    agentLine4: glue('Xong. Chưa có gì được gửi cho~tới khi bạn ký.'),
    agentCaption: glue('Một phiên minh~hoạ. Tên công~cụ là thật.'),
    agentInstall: 'Thêm Atropyle vào Claude Code',
    agentMore: glue('Agent khác, CLI và SDK'),
    closeTitle: glue('Diễn~tập trước khi là thật.'),
    closeLead: glue(
      'Drill (bản diễn~tập) là một vault thật trên X~Layer, với luật chạy trong vài phút thay vì vài tháng. Hãy xem cổng mở trước khi giao thêm tài~sản.',
    ),
  },
);
