import { defineMessages } from '@/i18n/core';

/**
 * `~` is a space where a line must not break; glue() turns it into U+00A0, as in proof.messages.ts. Vietnamese writes
 * the syllables of one word with spaces between them ("cảnh báo", "người thừa kế"), so a heading, a button or a short
 * label could break inside a word; vi-compounds-showcase.test.ts holds them. "X Layer" is one name in both languages.
 */
const glue = (s: string): string => s.replaceAll('~', '\u00A0');

export const messages = defineMessages(
  {
    eyebrow: 'An Atropyle invitation',
    loadingTitle: 'Opening your invitation',
    loading: 'Reading the vault on X Layer…',
    titleHeir: 'You have been named as an heir',
    titleGuardian: 'You have been asked to be a guardian',
    leadHeir:
      'Someone who cares about you has made a plan for their crypto. If they can no longer look after it, part of it can come to you, with no lawyer and no one in between.',
    leadGuardian:
      'Someone trusts you to help their plan do the right thing. You never hold their money, and you never need to be online at a set time.',
    nowGrace: 'Right now the alarm is on: the owner has not checked in, and the waiting time has started.',
    nowHeirReleased:
      "The waiting time is over: the vault's rules now let its assets go to the heirs. Open the vault to receive your share.",
    nowExpired: 'This Drill has ended, as every Drill does. Nothing more will happen in it.',
    vaultTitle: glue('The vault, read from X~Layer just now'),
    vaultLabel: 'Vault',
    heirsLabel: 'Heirs',
    guardiansLabel: 'Guardians',
    guardiansRule: '{n}, and {k} of them must agree',
    guardiansNone: 'None',
    drillNote: 'This vault is a Drill: a rehearsal on X Layer that ends by itself.',
    openVault: 'See the whole vault',
    walletAskHeir:
      'Is this you? Connect the wallet you gave the owner, and this page checks that it is named as an heir.',
    walletAskGuardian:
      'Is this you? Connect the wallet you gave the owner, and this page checks that it is named as a guardian.',
    walletYesHeir: 'The connected wallet is named as an heir in this vault.',
    walletYesGuardian: 'The connected wallet is named as a guardian in this vault.',
    walletShare: 'Your share in the plan: {share}.',
    walletOther: 'The connected wallet has another role in this vault: {roles}.',
    walletNoHeir:
      'The connected wallet is not named as an heir in this vault. You may have connected another wallet, or the owner has not added you yet.',
    walletNoGuardian:
      'The connected wallet is not named as a guardian in this vault. You may have connected another wallet, or the owner has not added you yet.',
    whatTitle: 'What this means for you',
    heir1: 'You do not need to do anything now, and being named costs you nothing.',
    heir2:
      'If the owner stops checking in, an alarm is raised on the vault, and the owner still has time to answer it.',
    heir3:
      'If the owner does not answer, your share can be sent to your wallet after a waiting time the owner chose. Until then they can change the plan, so keep this link: it always shows the vault as it is now.',
    guardian1:
      'If the owner stops checking in, you may be asked to confirm that they have died. When {k} of the {n} guardians confirm, the heirs can receive sooner.',
    guardian2Power:
      "{k} guardians who agree can move everything in the vault to a wallet they choose. It is meant for the owner's new wallet if they lose their key, and only a check-in from the owner can stop it in time. Keep your own wallet safe.",
    guardian2Off: 'Recovery is off in this vault: guardians cannot move its assets anywhere.',
    guardian3: 'You never hold the owner’s money, and nothing here can send it to you.',
    guardianNone:
      'This vault names no guardians yet, so a guardian has nothing to do in it. Ask the owner whether they meant to add you.',
    safetyTitle: 'Stay safe',
    safety1: 'Atropyle never asks for your secret phrase or private key, and never contacts you first.',
    safety2: 'This page asks you to sign nothing.',
    safety3: 'Check that the vault address above is the one the owner told you about.',
    alertsTitle: 'Get an email when it matters',
    alertsLead: 'Optional. You hear from us only when this vault needs you.',
    trust: "Atropyle's rules are a circuit on X Layer, and anyone can check them.",
    trustLink: 'See the proof',
    invalidTitle: 'This invitation link is broken',
    invalidMissing: 'The link has no vault in it. Ask the owner to send you the whole link again.',
    invalidShape: 'The link was cut short or something was added to it. Ask the owner to send it again.',
    invalidAddress:
      'The vault address in the link is not valid: a character may have been changed. Do not use this link; ask the owner for it again.',
    invalidRole: 'The link does not say whether you are a guardian or an heir. Ask the owner to send it again.',
    invalidSafe: 'Ask in person, or on a call to a number you already had.',
    notVaultTitle: 'There is no Atropyle vault at this address',
    notVaultBody:
      'The address in the link is not a vault made by Atropyle on X Layer. Do not send anything to it, and check the link with the owner.',
    errorTitle: 'The vault could not be read',
    home: 'Go to the home page',
  },
  {
    eyebrow: glue('Lời~mời từ Atropyle'),
    loadingTitle: glue('Đang mở lời~mời của bạn'),
    loading: 'Đang đọc vault trên X Layer…',
    titleHeir: glue('Bạn được chọn làm người~thừa~kế'),
    titleGuardian: glue('Bạn được mời làm người~giám~hộ'),
    leadHeir:
      'Một người quan tâm đến bạn đã lập kế hoạch cho tài sản crypto của họ. Nếu họ không còn tự lo được, một phần có thể đến với bạn, không cần luật sư và không qua người trung gian nào.',
    leadGuardian:
      'Một người tin bạn đủ để nhờ bạn giúp kế hoạch của họ đi đúng hướng. Bạn không bao giờ giữ tiền của họ, và không phải trực vào giờ nào cả.',
    nowGrace: 'Lúc này báo động đang bật: chủ vault chưa điểm danh, và thời gian chờ đã bắt đầu.',
    nowHeirReleased:
      'Thời gian chờ đã hết: đã tới lúc vault trao tài sản cho người thừa kế. Hãy mở vault để nhận phần của bạn.',
    nowExpired: 'Drill này đã kết thúc, như mọi Drill. Sẽ không có gì xảy ra thêm trong vault này.',
    vaultTitle: glue('Vault, vừa đọc từ X~Layer'),
    vaultLabel: 'Vault',
    heirsLabel: glue('Người~thừa~kế'),
    guardiansLabel: glue('Người~giám~hộ'),
    guardiansRule: '{n} người, cần {k} người đồng ý',
    guardiansNone: 'Không có',
    drillNote: 'Vault này là một Drill: một lần diễn tập trên X Layer, tự kết thúc sau một thời gian.',
    openVault: glue('Xem toàn~bộ vault'),
    walletAskHeir:
      'Có phải bạn không? Hãy kết nối ví bạn đã đưa cho chủ vault, trang này sẽ kiểm tra ví đó có được ghi là người thừa kế không.',
    walletAskGuardian:
      'Có phải bạn không? Hãy kết nối ví bạn đã đưa cho chủ vault, trang này sẽ kiểm tra ví đó có được ghi là người giám hộ không.',
    walletYesHeir: 'Ví đang kết nối được ghi là người thừa kế trong vault này.',
    walletYesGuardian: 'Ví đang kết nối được ghi là người giám hộ trong vault này.',
    walletShare: 'Phần của bạn trong kế hoạch: {share}.',
    walletOther: 'Ví đang kết nối có vai trò khác trong vault này: {roles}.',
    walletNoHeir:
      'Ví đang kết nối chưa được ghi là người thừa kế trong vault này. Có thể bạn đã kết nối ví khác, hoặc chủ vault chưa thêm bạn.',
    walletNoGuardian:
      'Ví đang kết nối chưa được ghi là người giám hộ trong vault này. Có thể bạn đã kết nối ví khác, hoặc chủ vault chưa thêm bạn.',
    whatTitle: 'Điều này có nghĩa gì với bạn',
    heir1: 'Bây giờ bạn không cần làm gì, và được ghi tên không tốn của bạn đồng nào.',
    heir2: 'Nếu chủ vault ngừng điểm danh, vault sẽ bật báo động, và chủ vault vẫn còn thời gian để trả lời.',
    heir3:
      'Nếu chủ vault không trả lời, phần của bạn có thể được gửi về ví của bạn sau một thời gian chờ do chủ vault chọn. Trước lúc đó họ vẫn đổi được kế hoạch, nên hãy giữ link này: nó luôn cho thấy vault như hiện tại.',
    guardian1:
      'Nếu chủ vault ngừng điểm danh, bạn có thể được nhờ xác nhận rằng họ đã qua đời. Khi {k} trên {n} người giám hộ xác nhận, người thừa kế có thể nhận sớm hơn.',
    guardian2Power:
      '{k} người giám hộ cùng đồng ý có thể chuyển mọi thứ trong vault tới một ví họ chọn. Việc này dành cho ví mới của chủ vault khi họ mất chìa khoá, và chỉ một lần điểm danh của chủ vault mới chặn kịp. Hãy giữ ví của chính bạn thật an toàn.',
    guardian2Off: 'Vault này tắt khôi phục: người giám hộ không chuyển được tài sản của nó đi đâu cả.',
    guardian3: 'Bạn không bao giờ giữ tiền của chủ vault, và không gì ở đây gửi được số tiền đó cho bạn.',
    guardianNone:
      'Vault này chưa ghi người giám hộ nào, nên người giám hộ không có việc gì trong đó. Hãy hỏi chủ vault xem họ có định thêm bạn không.',
    safetyTitle: glue('Giữ an~toàn'),
    safety1:
      'Atropyle không bao giờ hỏi cụm từ bí mật hay private key của bạn, và không bao giờ liên lạc với bạn trước.',
    safety2: 'Trang này không yêu cầu bạn ký gì cả.',
    safety3: 'Hãy kiểm tra địa chỉ vault ở trên đúng là địa chỉ chủ vault đã nói với bạn.',
    alertsTitle: 'Nhận email khi cần',
    alertsLead: 'Không bắt buộc. Bạn chỉ nhận thư khi vault này cần đến bạn.',
    trust: 'Luật của Atropyle là một circuit trên X Layer, và ai cũng kiểm được.',
    trustLink: glue('Xem bằng~chứng'),
    invalidTitle: 'Link mời này bị hỏng',
    invalidMissing: 'Link không có vault nào. Hãy nhờ chủ vault gửi lại đầy đủ.',
    invalidShape: 'Link bị cắt ngắn hoặc bị thêm thứ gì đó. Hãy nhờ chủ vault gửi lại.',
    invalidAddress:
      'Địa chỉ vault trong link không hợp lệ: có thể một ký tự đã bị sửa. Đừng dùng link này; hãy xin lại chủ vault.',
    invalidRole: 'Link không nói bạn là người giám hộ hay người thừa kế. Hãy nhờ chủ vault gửi lại.',
    invalidSafe: 'Hãy hỏi trực tiếp, hoặc gọi vào số bạn đã có từ trước.',
    notVaultTitle: glue('Không có vault Atropyle nào ở địa~chỉ này'),
    notVaultBody:
      'Địa chỉ trong link không phải vault do Atropyle tạo trên X Layer. Đừng gửi gì vào đó, và hãy hỏi lại chủ vault.',
    errorTitle: 'Chưa đọc được vault',
    home: glue('Về trang~chủ'),
  },
);
