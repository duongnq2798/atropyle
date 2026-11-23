import type { Lang, Role } from '../types';
import type { EmailKind, FactName } from './kinds';

export interface KindCopy {
  subject: string;
  /** Inbox preview line. */
  preheader: string;
  /** Short label in the chip next to the wordmark. */
  eyebrow: string;
  heading: string;
  body: readonly string[];
  cta: string;
  note?: string;
}

export interface Copy {
  kinds: Record<EmailKind, KindCopy>;
  /** Lowercase: used inside sentences ("as its owner") and in the facts well. */
  roles: Record<Role, string>;
  labels: Record<FactName | 'vault' | 'role' | 'compare' | 'transfers', string>;
  footer: { never: string; why: string; unsubscribe: string; beta: string };
  /** Filled into {{reason}} and {{outcome}}, and the payout lines ({{amount}}, {{token}}, {{id}}, {{to}}). */
  fragments: {
    alarmOwnerInheritance: string;
    alarmOwnerRecovery: string;
    alarmGuardianInheritance: string;
    alarmGuardianRecovery: string;
    releasedInheritance: string;
    releasedRecovery: string;
    summaryReleased: string;
    summaryNotReleased: string;
    transferErc20: string;
    transferErc721: string;
    transferErc1155: string;
    transferUnknown: string;
  };
}

const en: Copy = {
  kinds: {
    confirm: {
      subject: 'Confirm alerts for vault {{vaultShort}}',
      preheader: 'One click, and we will tell you when this vault needs you.',
      eyebrow: 'Confirm',
      heading: 'Confirm your alerts',
      body: [
        'Someone, hopefully you, asked for alerts about this Atropyle vault, as its {{roleLabel}}.',
        'Confirm to start. If it was not you, ignore this email: nothing is sent until you confirm, and the request is deleted after 48 hours.',
      ],
      cta: 'Confirm alerts',
    },
    welcome: {
      subject: 'Alerts are on for vault {{vaultShort}}',
      preheader: 'We write when this vault needs you, and only then.',
      eyebrow: 'Subscribed',
      heading: 'You will hear from us when it matters',
      body: [
        'Alerts are on for this vault, for you as its {{roleLabel}}.',
        'We write when a check-in is coming due, when an alarm is raised, when a guardian votes, and when assets are released or paid out. Nothing else.',
      ],
      cta: 'Open the vault',
    },
    'checkin-50': {
      subject: 'Halfway to your next check-in, vault {{vaultShort}}',
      preheader: 'Check in before {{deadline}} and nothing happens.',
      eyebrow: 'Check-in 50%',
      heading: 'Halfway to your next check-in',
      body: [
        'Half of the time before your next check-in has passed.',
        'Check in before {{deadline}}. One transaction from the owner wallet resets the clock.',
      ],
      cta: 'Check in',
    },
    'checkin-80': {
      subject: 'Check in soon, vault {{vaultShort}}',
      preheader: '80% of the time has passed. Deadline {{deadline}}.',
      eyebrow: 'Check-in 80%',
      heading: 'Your check-in is coming due',
      body: [
        '80% of the time before your next check-in has passed.',
        'Check in before {{deadline}}. After that, anyone can raise the alarm on this vault.',
      ],
      cta: 'Check in now',
    },
    'checkin-due': {
      subject: 'Check-in due now, vault {{vaultShort}}',
      preheader: 'The deadline was {{deadline}}. Check in to stop the alarm.',
      eyebrow: 'Check-in due',
      heading: 'Your check-in is due',
      body: [
        'The check-in deadline was {{deadline}}. From now on, anyone can raise the alarm on this vault.',
        'Check in from the owner wallet now. It stops the alarm before it starts.',
      ],
      cta: 'Check in now',
    },
    'alarm-owner': {
      subject: 'Alarm raised on your vault {{vaultShort}}',
      preheader: 'Check in before {{deadline}} to cancel it.',
      eyebrow: 'Alarm',
      heading: 'An alarm was raised on your vault',
      body: [
        '{{reason}}',
        'If you are reading this, check in before {{deadline}}. One check-in from the owner wallet cancels the alarm, and nothing moves.',
      ],
      cta: 'Check in to cancel',
      note: 'If you did not expect this, find out who holds your keys before anything else.',
    },
    'alarm-guardian': {
      subject: 'Alarm on a vault you guard, {{vaultShort}}',
      preheader: 'The window closes at {{deadline}}.',
      eyebrow: 'Alarm',
      heading: 'A vault you guard raised an alarm',
      body: [
        '{{reason}}',
        'The owner can still cancel it by checking in before {{deadline}}. Try to reach them, then open the vault page to see what you can do as a guardian.',
      ],
      cta: 'Open the vault',
    },
    'alarm-heir': {
      subject: 'Vault {{vaultShort}}: the inheritance window has started',
      preheader: 'Nothing to do yet. The window closes at {{deadline}}.',
      eyebrow: 'Alarm',
      heading: 'The inheritance window has started',
      body: [
        'The owner of this vault missed their check-in, so the alarm was raised. If they check in before {{deadline}}, nothing changes.',
        'If they do not, the vault releases its assets to its heirs after that time. You do not need to do anything now, and nobody will ask you to sign or to pay.',
      ],
      cta: 'Open the vault',
    },
    'recovery-vote': {
      subject: 'A guardian voted to recover your vault {{vaultShort}}',
      preheader: 'Check the proposed wallet. If it is not yours, act now.',
      eyebrow: 'Recovery vote',
      heading: 'A guardian voted to recover your vault',
      body: [
        'A guardian voted to move this vault to a new wallet. If enough guardians agree, a recovery window starts.',
        'If you did not ask for this, open the vault page now, while you still hold the owner wallet.',
      ],
      cta: 'Open the vault',
    },
    released: {
      subject: 'Vault {{vaultShort}} was released',
      preheader: '{{outcome}}',
      eyebrow: 'Released',
      heading: 'This vault was released',
      body: [
        '{{outcome}}',
        'Assets are paid out by distribute, which anyone can call, our keeper included. You get another email when a payout lands.',
      ],
      cta: 'Open the vault',
    },
    distributed: {
      subject: 'Assets paid out from vault {{vaultShort}}',
      preheader: 'A payout landed. The details are inside.',
      eyebrow: 'Paid out',
      heading: 'A payout landed',
      body: ['This vault paid out in transaction {{txShort}}.'],
      cta: 'Open the vault',
      note: 'Check the amounts in your wallet. Token names are left out on purpose: compare each token address with the vault page.',
    },
    'drill-summary': {
      subject: 'How your Drill went, vault {{vaultShort}}',
      preheader: 'Your 7-day Drill has ended. Here is what happened.',
      eyebrow: 'Drill complete',
      heading: 'Your Drill has ended',
      body: [
        'Your Drill vault ran its full 7 days and has now expired. {{outcome}}',
        'The vault page keeps the full record. When you are ready, create a real vault: the rules are the same, and only the timing is yours to choose.',
      ],
      cta: 'Open the vault',
    },
  },
  roles: { owner: 'owner', guardian: 'guardian', heir: 'heir' },
  labels: {
    vault: 'Vault',
    role: 'Your role',
    compare: 'Compare this address with the one on the vault page before you act.',
    deadline: 'Deadline',
    guardian: 'Guardian',
    target: 'Proposed wallet',
    tx: 'Transaction',
    checkIns: 'Check-ins',
    alarms: 'Alarms',
    transfers: 'Paid out',
  },
  footer: {
    never:
      'Atropyle never asks you to sign anything by email. Every action happens on the vault page, in your own wallet.',
    why: 'You get this email because this address subscribed to alerts for this vault on {{siteHost}}.',
    unsubscribe: 'Unsubscribe from this vault',
    beta: 'Atropyle is in beta on X Layer. Alerts are best effort: the chain, not this email, is the source of truth.',
  },
  fragments: {
    alarmOwnerInheritance: 'Your vault missed its check-in, so the inheritance window has started.',
    alarmOwnerRecovery: 'Your guardians voted to move this vault to a new wallet, so the recovery window has started.',
    alarmGuardianInheritance: 'The owner missed their check-in, so the inheritance window has started.',
    alarmGuardianRecovery: 'Guardians voted to recover this vault, so the recovery window has started.',
    releasedInheritance: 'The inheritance window closed without a check-in, so the vault now belongs to its heirs.',
    releasedRecovery: 'The recovery window closed, so the vault now pays out to the recovery wallet.',
    summaryReleased: 'It went all the way: the alarm, the window and the release.',
    summaryNotReleased: 'It never reached release: your check-ins kept it alive.',
    transferErc20: '{{amount}} of token {{token}} to {{to}}',
    transferErc721: 'Token #{{id}} of {{token}} to {{to}}',
    transferErc1155: '{{amount}} of token #{{id}} of {{token}} to {{to}}',
    transferUnknown: 'Asset #{{id}} ({{amount}}) to {{to}}',
  },
};

const vi: Copy = {
  kinds: {
    confirm: {
      subject: 'Xác nhận nhận thông báo cho vault {{vaultShort}}',
      preheader: 'Một cú bấm, và chúng tôi sẽ báo khi vault này cần bạn.',
      eyebrow: 'Xác nhận',
      heading: 'Xác nhận nhận thông báo',
      body: [
        'Có người, hy vọng là bạn, đã đăng ký nhận thông báo cho vault Atropyle này với vai trò {{roleLabel}}.',
        'Hãy xác nhận để bắt đầu. Nếu không phải bạn, cứ bỏ qua email này: chúng tôi không gửi gì cho tới khi bạn xác nhận, và yêu cầu sẽ bị xoá sau 48 giờ.',
      ],
      cta: 'Xác nhận',
    },
    welcome: {
      subject: 'Đã bật thông báo cho vault {{vaultShort}}',
      preheader: 'Chúng tôi chỉ viết khi vault này cần bạn.',
      eyebrow: 'Đã đăng ký',
      heading: 'Chúng tôi sẽ báo khi có việc quan trọng',
      body: [
        'Thông báo đã bật cho vault này, với vai trò {{roleLabel}} của bạn.',
        'Chúng tôi viết khi sắp tới hạn điểm danh, khi có báo động, khi người giám hộ bỏ phiếu, và khi vault trao hoặc chi trả tài sản. Ngoài ra không có gì khác.',
      ],
      cta: 'Mở vault',
    },
    'checkin-50': {
      subject: 'Đã qua nửa chặng tới lần điểm danh kế tiếp, vault {{vaultShort}}',
      preheader: 'Điểm danh trước {{deadline}} là mọi thứ giữ nguyên.',
      eyebrow: 'Điểm danh 50%',
      heading: 'Đã qua nửa chặng tới lần điểm danh',
      body: [
        'Một nửa thời gian trước lần điểm danh kế tiếp đã trôi qua.',
        'Hãy điểm danh trước {{deadline}}. Một giao dịch từ ví chủ là đủ để đặt lại đồng hồ.',
      ],
      cta: 'Điểm danh',
    },
    'checkin-80': {
      subject: 'Sắp tới hạn điểm danh, vault {{vaultShort}}',
      preheader: 'Đã qua 80% thời gian. Hạn chót {{deadline}}.',
      eyebrow: 'Điểm danh 80%',
      heading: 'Sắp tới hạn điểm danh',
      body: [
        '80% thời gian trước lần điểm danh kế tiếp đã trôi qua.',
        'Hãy điểm danh trước {{deadline}}. Sau mốc đó, bất kỳ ai cũng có thể bật báo động cho vault này.',
      ],
      cta: 'Điểm danh ngay',
    },
    'checkin-due': {
      subject: 'Đã tới hạn điểm danh, vault {{vaultShort}}',
      preheader: 'Hạn chót là {{deadline}}. Điểm danh để chặn báo động.',
      eyebrow: 'Tới hạn',
      heading: 'Đã tới hạn điểm danh',
      body: [
        'Hạn điểm danh là {{deadline}}. Từ giờ, bất kỳ ai cũng có thể bật báo động cho vault này.',
        'Hãy điểm danh từ ví chủ ngay bây giờ để chặn báo động trước khi nó bắt đầu.',
      ],
      cta: 'Điểm danh ngay',
    },
    'alarm-owner': {
      subject: 'Vault {{vaultShort}} của bạn đang báo động',
      preheader: 'Điểm danh trước {{deadline}} để huỷ.',
      eyebrow: 'Báo động',
      heading: 'Vault của bạn đang báo động',
      body: [
        '{{reason}}',
        'Nếu bạn đang đọc thư này, hãy điểm danh trước {{deadline}}. Một lần điểm danh từ ví chủ sẽ huỷ báo động, và không tài sản nào bị chuyển đi.',
      ],
      cta: 'Điểm danh để huỷ',
      note: 'Nếu bạn không lường trước chuyện này, trước hết hãy kiểm tra xem ai đang giữ khoá ví của bạn.',
    },
    'alarm-guardian': {
      subject: 'Vault bạn giám hộ đang báo động, {{vaultShort}}',
      preheader: 'Cửa sổ đóng lúc {{deadline}}.',
      eyebrow: 'Báo động',
      heading: 'Vault bạn giám hộ đang báo động',
      body: [
        '{{reason}}',
        'Chủ ví vẫn có thể huỷ bằng cách điểm danh trước {{deadline}}. Hãy thử liên lạc với họ, rồi mở trang vault để xem bạn có thể làm gì với vai trò giám hộ.',
      ],
      cta: 'Mở vault',
    },
    'alarm-heir': {
      subject: 'Vault {{vaultShort}}: cửa sổ thừa kế đã bắt đầu',
      preheader: 'Bạn chưa cần làm gì. Cửa sổ đóng lúc {{deadline}}.',
      eyebrow: 'Báo động',
      heading: 'Cửa sổ thừa kế đã bắt đầu',
      body: [
        'Chủ của vault này đã lỡ hạn điểm danh, nên báo động đã bật. Nếu họ điểm danh trước {{deadline}}, mọi thứ giữ nguyên.',
        'Nếu không, sau mốc đó vault sẽ trao tài sản cho người thừa kế. Bạn chưa cần làm gì, và sẽ không ai yêu cầu bạn ký hay trả tiền.',
      ],
      cta: 'Mở vault',
    },
    'recovery-vote': {
      subject: 'Một người giám hộ bỏ phiếu khôi phục vault {{vaultShort}} của bạn',
      preheader: 'Hãy kiểm tra ví được đề xuất. Nếu không phải ví của bạn, hãy hành động ngay.',
      eyebrow: 'Phiếu khôi phục',
      heading: 'Một người giám hộ bỏ phiếu khôi phục vault của bạn',
      body: [
        'Một người giám hộ đã bỏ phiếu chuyển vault này sang một ví mới. Nếu đủ số người giám hộ đồng ý, cửa sổ khôi phục sẽ bắt đầu.',
        'Nếu bạn không yêu cầu việc này, hãy mở trang vault ngay, khi bạn vẫn còn giữ ví chủ.',
      ],
      cta: 'Mở vault',
    },
    released: {
      subject: 'Đã tới lúc vault {{vaultShort}} trao tài sản',
      preheader: '{{outcome}}',
      eyebrow: 'Trao tài sản',
      heading: 'Đã tới lúc vault này trao tài sản',
      body: [
        '{{outcome}}',
        'Tài sản được chi trả bằng lệnh distribute, ai cũng gọi được, kể cả keeper của chúng tôi. Bạn sẽ nhận thêm một email khi khoản chi trả về tới.',
      ],
      cta: 'Mở vault',
    },
    distributed: {
      subject: 'Tài sản đã được chi trả từ vault {{vaultShort}}',
      preheader: 'Một khoản chi trả đã về. Chi tiết ở bên trong.',
      eyebrow: 'Đã chi trả',
      heading: 'Một khoản chi trả đã về',
      body: ['Vault này đã chi trả trong giao dịch {{txShort}}.'],
      cta: 'Mở vault',
      note: 'Hãy kiểm tra số dư trong ví. Tên token cố ý không hiển thị ở đây: hãy đối chiếu từng địa chỉ token với trang vault.',
    },
    'drill-summary': {
      subject: 'Drill của bạn đã chạy thế nào, vault {{vaultShort}}',
      preheader: 'Drill 7 ngày đã kết thúc. Đây là những gì đã xảy ra.',
      eyebrow: 'Drill kết thúc',
      heading: 'Drill của bạn đã kết thúc',
      body: [
        'Vault Drill đã chạy đủ 7 ngày và giờ đã hết hạn. {{outcome}}',
        'Trang vault giữ toàn bộ hồ sơ. Khi sẵn sàng, hãy tạo một vault thật: luật vẫn như cũ, chỉ có nhịp thời gian là do bạn chọn.',
      ],
      cta: 'Mở vault',
    },
  },
  roles: { owner: 'chủ ví', guardian: 'người giám hộ', heir: 'người thừa kế' },
  labels: {
    vault: 'Vault',
    role: 'Vai trò của bạn',
    compare: 'Hãy đối chiếu địa chỉ này với địa chỉ trên trang vault trước khi làm gì.',
    deadline: 'Hạn chót',
    guardian: 'Người giám hộ',
    target: 'Ví được đề xuất',
    tx: 'Giao dịch',
    checkIns: 'Số lần điểm danh',
    alarms: 'Số lần báo động',
    transfers: 'Đã chi trả',
  },
  footer: {
    never:
      'Atropyle không bao giờ yêu cầu bạn ký bất cứ thứ gì qua email. Mọi thao tác đều diễn ra trên trang vault, trong ví của chính bạn.',
    why: 'Bạn nhận email này vì địa chỉ này đã đăng ký nhận thông báo cho vault trên {{siteHost}}.',
    unsubscribe: 'Huỷ đăng ký vault này',
    beta: 'Atropyle đang chạy beta trên X Layer. Thông báo chỉ mang tính hỗ trợ: chain mới là nguồn sự thật, không phải email này.',
  },
  fragments: {
    alarmOwnerInheritance: 'Vault của bạn đã quá hạn điểm danh, nên cửa sổ thừa kế đã bắt đầu.',
    alarmOwnerRecovery:
      'Các người giám hộ đã bỏ phiếu chuyển vault này sang một ví mới, nên cửa sổ khôi phục đã bắt đầu.',
    alarmGuardianInheritance: 'Chủ ví đã lỡ hạn điểm danh, nên cửa sổ thừa kế đã bắt đầu.',
    alarmGuardianRecovery: 'Các người giám hộ đã bỏ phiếu khôi phục vault này, nên cửa sổ khôi phục đã bắt đầu.',
    releasedInheritance: 'Cửa sổ thừa kế đã đóng mà không có lần điểm danh nào, nên vault giờ thuộc về người thừa kế.',
    releasedRecovery: 'Cửa sổ khôi phục đã đóng, nên vault giờ chi trả cho ví khôi phục.',
    summaryReleased: 'Vault đã đi hết hành trình: báo động, cửa sổ chờ và bước trao tài sản.',
    summaryNotReleased:
      'Vault chưa từng tới bước trao tài sản: các lần điểm danh của bạn đã giữ cho vault luôn hoạt động.',
    transferErc20: '{{amount}} token {{token}} cho {{to}}',
    transferErc721: 'Token #{{id}} của {{token}} cho {{to}}',
    transferErc1155: '{{amount}} token #{{id}} của {{token}} cho {{to}}',
    transferUnknown: 'Tài sản #{{id}} ({{amount}}) cho {{to}}',
  },
};

export const COPY: Record<Lang, Copy> = { en, vi };
