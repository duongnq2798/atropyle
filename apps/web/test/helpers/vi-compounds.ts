/**
 * Words a Vietnamese reader takes as one, though they are written as two or three syllables with spaces between them.
 * A line break inside one reads as broken typesetting ("Trao cho người thừa / kế"), and text-wrap: balance does not
 * prevent it. In headings, titles, buttons and short labels they are bound with U+00A0 (every space of the word).
 *
 * The one list for the tests of the Vietnamese typesetting rule (7B-P1). It holds the words of the rule, those of
 * the wizard (create-vi-compounds.test.ts) and those of the showcase pages (vi-compounds-showcase.test.ts on
 * feat/web-v2-showcase), so those tests can read it once the branches meet. Lower case, NFC.
 */
export const VI_COMPOUNDS: readonly string[] = [
  // The words of the typesetting rule.
  'tài sản',
  'người thừa kế',
  'thừa kế',
  'người giám hộ',
  'giám hộ',
  'điểm danh',
  'báo động',
  'cảnh báo',
  'lời mời',
  'ví khôi phục',
  'khôi phục',
  'kế hoạch',
  'chủ ví',
  'chủ vault',
  'giao dịch',
  'xác nhận',
  'hết hạn',
  'hợp đồng',
  // The wizard's.
  'diễn tập',
  'vault thật',
  'trông chừng',
  'bắt đầu',
  'bao lâu',
  'một lần',
  // The showcase pages'.
  'an toàn',
  'ban đầu',
  'bảo mật',
  'bảo vệ',
  'bằng chứng',
  'biến mất',
  'cài đặt',
  'câu chuyện',
  'câu hỏi',
  'chẩn đoán',
  'chỉ mục',
  'chính sách',
  'chú ý',
  'chứng minh',
  'chứng nhận',
  'chúng tôi',
  'con dấu',
  'con số',
  'danh sách',
  'đăng ký',
  'địa chỉ',
  'đóng băng',
  'đội ngũ',
  'đầy đủ',
  'ghi chú',
  'giao diện',
  'giấy da',
  'giấy phép',
  'giới hạn',
  'hộp thư',
  'hợp lệ',
  'kết luận',
  'kết nối',
  'kiểm chứng',
  'kiểm toán',
  'ký hiệu',
  'liên kết',
  'mã nguồn',
  'mong đợi',
  'ngân quỹ',
  'ngôn ngữ',
  'nhà phát triển',
  'nhà vận hành',
  'nội dung',
  'phiên bản',
  'quyết định',
  'riêng tư',
  'sao chép',
  'sự kiện',
  'tài liệu',
  'thất bại',
  'thiết bị',
  'thực tế',
  'tiếng việt',
  'tìm thấy',
  'toàn bộ',
  'trang chủ',
  'trạng thái',
  'trường hợp',
  'vai trò',
  'vấn đề',
  'xảy ra',
  'xử lý',
  'im lặng',
  'nói dối',
  'đầu tiên',
  'đồng ý',
  'bỏ phiếu',
  'công cụ',
  'trình duyệt',
  'bản đồ',
  'phân tích',
  'tuỳ chọn',
  'trực tiếp',
  'kiểm chéo',
  'đầu vào',
  'ít nhất',
  // The vault, guardian, heir letter, history, verify and sign pages' (7B-P1).
  'bất kỳ',
  'bước kiểm',
  'chi tiết',
  'chuẩn bị',
  'công bố',
  'dữ liệu',
  'để lại',
  'độ phủ',
  'độc lập',
  'được phép',
  'gần đây',
  'gần nhất',
  'giá trị',
  'giải mã',
  'hành động',
  'hoàn tất',
  'hoạt động',
  'kết thúc',
  'kiểm tra',
  'kỹ thuật',
  'làm mới',
  'lịch sử',
  'lúc này',
  'mô phỏng',
  'ngăn lại',
  'người ký',
  'nhà cung cấp',
  'nhận ra',
  'qua đời',
  'sớm nhất',
  'sợi chỉ',
  'thành công',
  'theo dõi',
  'thiết lập',
  'thời gian',
  'thử lại',
  'thuộc về',
  'tiến độ',
  'tiếp theo',
  'trước đó',
  'tư cách',
  'tỷ lệ',
  'từ chối',
  'vi phạm',
  'yêu cầu',
  // The wizard's labels and the owner tab's (create-vi-compounds.test.ts, owner-vi-compounds.test.ts).
  'số dư',
  'chia sẻ',
  'quay lại',
  'xem lại',
  'tự chọn',
  'ranh giới',
  'phần trăm',
  'liên quan',
  'khoảnh khắc',
  'hôm nay',
  'tối đa',
  'bao nhiêu',
  'khi nào',
  'số lần',
  'đọc lại',
  'nối lại',
  // Names, in either language.
  'claude code',
  'x layer',
];

/** Every syllable of a compound, at word edges, with any run of spaces between them: bound or not. */
const finder = (compound: string): RegExp =>
  new RegExp(`(?<!\\p{L})${compound.split(' ').join('\\s+')}(?!\\p{L})`, 'giu');

/** A breakable space: any white space but U+00A0. */
const BREAKABLE = /[^\S\u00a0]/u;

/**
 * The compounds of the list that `text` writes with a breakable space between two of their syllables. A page with
 * words of its own passes them after the shared list (`[...VI_COMPOUNDS, ...own]`).
 */
export function plainCompounds(text: string, words: readonly string[] = VI_COMPOUNDS): string[] {
  const s = text.normalize('NFC').toLowerCase();
  return words.flatMap((c) => [...s.matchAll(finder(c))].filter(([m]) => BREAKABLE.test(m)).map(() => c));
}

/**
 * A heading, a title, a button or a short label: at most 70 characters and not ending like a sentence (a full stop
 * or a colon). Questions ("Bạn là người giám hộ hay người thừa kế?") and labels with a placeholder count.
 */
export function isShortLabel(text: string): boolean {
  const t = text.trim();
  return t.length <= 70 && !/[.:]$/.test(t);
}
