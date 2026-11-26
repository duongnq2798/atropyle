import { defineMessages } from '../lib/i18n';

export const messages = defineMessages(
  {
    title: 'Counted on the chain',
    vaults: 'Vaults, free Drills included',
    paid: 'Paid vaults',
    releases: 'Released vaults',
    stablecoins: 'Stablecoins protected',
    outside: '{n} outside the team',
    atLeast: '{n} or more',
    asOf: 'Read from the factory and vault contracts at block {block}, {time}.',
    loading: 'Reading the counters from the chain…',
    failed: 'The counters could not be read from the RPC right now.',
    retry: 'Try again',
    partial:
      'Released vaults and stablecoins count the {read} of {all} vaults this page read. Run the full count below, then reload the page, to read them all.',
    partialCap:
      'Released vaults and stablecoins count the {read} of {all} vaults this page read: it reads at most {max} vaults, so the true numbers may be higher.',
    teamPartial:
      'The team’s vault list was too long to read to its end, so the counts outside the team may be too high.',
    defTitle: 'How each number is counted',
    defVaults:
      'Vaults: every vault the factory created, free Drills included, read as the factory’s account nonce minus one. A contract’s nonce starts at 1 and grows by one for each contract it creates, and the factory creates only vaults.',
    defPaid:
      'Paid vaults: factory.paidCount(), the vaults that paid the creation fee. Drills are free and not counted.',
    defReleases:
      'Released vaults: vaults whose policy released them, to the heirs or to a recovery wallet. Drills included. This is the vault’s state: the sweep that pays out (distribute) leaves nothing a view function can read, so a released vault counts whether or not its sweep has run.',
    defStablecoins:
      'Stablecoins protected: what live paid vaults could move right now (the smaller of the owner’s balance and allowance) in the fee stablecoins, at face value, counted once per owner and token.',
    defTeam: 'Outside the team: vaults whose owner is not one of the {n} addresses in deployments/team.json.',
  },
  {
    title: 'Đếm trên chain',
    vaults: 'Vault, gồm cả Drill miễn phí',
    paid: 'Vault trả phí',
    releases: 'Vault đã giải phóng',
    stablecoins: 'Stablecoin được bảo vệ',
    outside: '{n} ngoài đội ngũ',
    atLeast: '{n} trở lên',
    asOf: 'Đọc từ contract factory và vault ở block {block}, {time}.',
    loading: 'Đang đọc số liệu từ chain…',
    failed: 'Hiện chưa đọc được số liệu từ RPC.',
    retry: 'Thử lại',
    partial:
      'Vault đã giải phóng và stablecoin chỉ tính trên {read} trong {all} vault mà trang này đã đọc. Chạy lần đếm đầy đủ ở bên dưới rồi tải lại trang để đọc hết.',
    partialCap:
      'Vault đã giải phóng và stablecoin chỉ tính trên {read} trong {all} vault mà trang này đã đọc: trang chỉ đọc tối đa {max} vault, nên số thực có thể cao hơn.',
    teamPartial: 'Danh sách vault của đội ngũ quá dài để đọc hết, nên số ngoài đội ngũ có thể cao hơn thực tế.',
    defTitle: 'Cách đếm từng con số',
    defVaults:
      'Vault: mọi vault mà factory đã tạo, gồm cả Drill miễn phí, đọc bằng nonce tài khoản của factory trừ một. Nonce của một contract bắt đầu từ 1 và tăng một cho mỗi contract nó tạo, và factory chỉ tạo vault.',
    defPaid: 'Vault trả phí: factory.paidCount(), các vault đã trả phí tạo. Drill miễn phí nên không tính.',
    defReleases:
      'Vault đã giải phóng: các vault mà policy đã giải phóng, cho người thừa kế hoặc sang ví khôi phục. Có tính Drill. Đây là trạng thái của vault: bước chuyển tài sản (distribute) không để lại gì mà hàm view đọc được, nên vault đã giải phóng vẫn được tính dù bước chuyển đã chạy hay chưa.',
    defStablecoins:
      'Stablecoin được bảo vệ: số mà các vault trả phí còn hiệu lực có thể chuyển ngay lúc này (phần nhỏ hơn giữa số dư và hạn mức cho phép của chủ vault), bằng các stablecoin dùng trả phí, theo mệnh giá, mỗi chủ và mỗi token tính một lần.',
    defTeam: 'Ngoài đội ngũ: các vault có chủ không thuộc {n} địa chỉ trong deployments/team.json.',
  },
);
