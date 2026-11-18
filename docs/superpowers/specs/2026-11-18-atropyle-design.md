# Atropyle — Đặc tả thiết kế (P0)

- **Ngày:** 18/11/2026
- **Trạng thái:** đã duyệt từng phần trong buổi brainstorming; chờ duyệt bản viết
- **Cuộc thi:** X Layer TapeOut Accelerate. Hạn nộp 7/12/2026 23:59 UTC; mục tiêu nội bộ là nộp ngày 6/12.
- **Đội:** một người điều phối và kiểm tra, Claude viết phần lớn code.
- **Bối cảnh và lý do chọn ý tưởng:** `reports/Chốt ý tưởng cuối cùng.md`, `research_notes/`

## 1. Mục tiêu

Atropyle (Ἄτροπος + πύλη, "cánh cổng không thể quay đầu") là vault **thừa kế và khôi phục ví** non-custodial trên X Layer.

- Tài sản nằm yên trong ví của chủ cho tới khi chính sách mở khoá.
- Chính sách là một **circuit LATCH đã tape-out trên TapeOut** và bị đóng băng vĩnh viễn. Ai cũng kiểm chứng được nó bằng cách duyệt hết mọi đầu vào.

Hai chế độ đều thuộc P0:

| Chế độ | Kịch bản | Kết quả |
|---|---|---|
| **Thừa kế** | Chủ ví im lặng quá ngưỡng và không phản hồi trong cửa sổ báo động | Tài sản chia cho người thừa kế theo tỉ lệ |
| **Khôi phục** | Chủ ví mất seed; đủ k giám hộ bầu một ví mới; chủ ví không veto trong cửa sổ | Toàn bộ tài sản chuyển sang ví mới |

### Tiêu chí thành công

1. Trên mainnet X Layer:
   - processor `Atropyle`/`ATRO` đã có 3 circuit;
   - Factory và Vault đã verify trên OKLink.
2. Phép chứng minh exhaustive (§3.6) chạy qua trong CI và trên trang Proof.
3. Có E2E Drill trên mainnet cho cả hai chế độ, ghi lại trong video.
4. Video demo dài ≤ 2:50; nộp bài ngày 6/12.
5. Chỉ tiêu người dùng (mục tiêu, không phải điều kiện): ≥ 30 vault Drill và ≥ 5 vault trả phí từ người dùng thật trước 6/12.

### Ngoài phạm vi

- Bảo vệ khi khoá của chủ ví bị lộ. Kẻ trộm có khoá thì tự rút tài sản được.
- Giá trị pháp lý của di chúc.
- OKB gốc. Hướng dẫn người dùng wrap sang WOKB.
- Cross-chain.
- Tài sản ngoài danh sách đã đăng ký.

## 2. Kiến trúc

| Thành phần | Vai trò | Quyền đặc biệt |
|---|---|---|
| Circuit `AtropylePolicy v1` + sub-circuit `KofN5`, `Ge4` (processor ATRO) | Máy trạng thái chính sách, gọi qua `step()` (view, thuần) | Không có. Beacon circuit đã đóng băng |
| `AtropyleVault` (mỗi chủ ví một clone EIP-1167) | Lưu cấu hình, trạng thái và mốc thời gian; gọi `step()`; khi Released thì kéo tài sản từ ví chủ sang người nhận | Không có admin, pause, upgrade, delegatecall hay selfdestruct |
| `AtropyleFactory` | Tạo vault bằng CREATE2, thu phí immutable, giữ chỉ mục vai trò | Không có owner. Đổi giá thì deploy factory v2 |
| Web app (SPA tĩnh) | Bản chính trên DeWEB/TapeKit, mirror trên GitHub Pages, dùng chung một bundle | Không có. Không có backend |
| Bot Telegram `@AtropyleBot` (Cloudflare Worker) | Chỉ đọc chain: nhắc check-in, báo động | Chỉ giữ Telegram token. Không có khoá ví |

**Nguyên tắc tin cậy:**
- Tài sản chỉ di chuyển khi `step()` đưa trạng thái về Released.
- Contract duy nhất được cấp allowance là vault của chính chủ ví.
- Không ai, kể cả đội Atropyle, có khoá đặc quyền.

### Sự thật on-chain đã xác minh (18/11)

- **Beacon circuit `0xf70d1ed4…0991C` có owner `0x0` (đóng băng)**, impl `0x977f2178…F29B2`. Mã nguồn verified của `NetlistVM.run` **không gọi factory lúc chạy**: registry chỉ được kiểm trong `analyze`, tức lúc tape-out. Vì vậy Safe có nâng cấp factory cũng không làm hỏng `step()` của circuit đã tape-out, kể cả circuit có REF.
- Circuits có getter `netlist(id)`, `circuitInfo(id)` và `step(id, state, inputs)`. Cả input lẫn output đều được đóng gói bit theo thứ tự little-endian. `step` tính output từ trạng thái hiện tại cộng input, sau đó các LATCH chốt `d` vào `newState`.
- Gas của `step` khoảng 50k cộng 2.5k cho mỗi gate đã làm phẳng. Mỗi REF tốn thêm một external call.
- **Bắt buộc kiểm lúc deploy:** proxy circuits của processor ATRO phải trỏ tới beacon `0xf70d…991C`, đọc qua slot beacon EIP-1967 `0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50`. Factory nâng cấp được, nên CPU mới có thể dùng beacon khác. **Nếu beacon không phải bản đóng băng thì dừng lại và đánh giá lại.** Phương án dự phòng: tape-out trên một processor cũ đã đóng băng.

## 3. Circuit chính sách `AtropylePolicy v1`

### 3.1 Trạng thái (3 LATCH, khai báo theo thứ tự A, R, X → bit state 0, 1, 2)

| Mã (X R A) | Byte state | Tên | Lớp |
|---|---|---|---|
| 000 | `0x00` | Active | Active |
| 001 | `0x01` | Grace | Alarm |
| 011 | `0x03` | RecoveryPending | Alarm |
| 101 | `0x05` | ReleasedInherit | Released |
| 111 | `0x07` | ReleasedRecover | Released |
| 010, 100, 110 | — | không chuẩn | Không đạt tới được. Nếu X=1 thì xử lý như Released (giữ nguyên); 010 xử lý như Active |

Phân lớp theo bit `cls(s)`:
- X=1 → Released.
- A=1, R=0 → Grace.
- A=1, R=1 → RecoveryPending.
- Còn lại → Active.

### 3.2 Đầu vào (`nIn = 23`, đóng gói vào 3 byte)

| Bit | Tên | Nghĩa (vault tính) |
|---|---|---|
| 0–3 | `idle` | `min(15, (now − lastAlive) / P)` |
| 4–7 | `T` | Ngưỡng báo động tính theo chu kỳ. Vault ép 1 ≤ T ≤ 15 |
| 8–12 | `inhVotes` | Bitmap các giám hộ xác nhận "chủ ví đã mất". Bit i ứng với `guardians[i]` |
| 13–17 | `recVotes` | Bit i = 1 khi và chỉ khi `recVote[guardians[i]] == candidate`, `candidate ≠ 0` và `recoveryEnabled` |
| 18–20 | `k` | Ngưỡng k-of-n. Vault ép k ≤ n. k = 0 nghĩa là template Simple |
| 21 | `alive` | Giao dịch này do chủ ví ký |
| 22 | `windowDone` | `alarmAt ≠ 0` và `now ≥ alarmAt + W` |

### 3.3 Tín hiệu dẫn xuất

- `inhQ` = popcount(inhVotes) ≥ k. Luôn đúng khi k = 0.
- `recQ` = (k ≠ 0) ∧ popcount(recVotes) ≥ k.
- `late` = idle ≥ T.
- `maxed` = (idle = 15). Đây là đường dự phòng khi giám hộ không phản hồi.

### 3.4 Hàm chuyển trạng thái (xét theo thứ tự ưu tiên)

1. `cls = Released` → `s' = s`, mọi output bằng 0.
2. `alive` → `s' = 000`.
3. `cls = RecoveryPending`:
   - `recQ ∧ windowDone` → 111;
   - `recQ` → 011;
   - `late` → 001;
   - còn lại → 000.
4. `cls = Grace`:
   - `recQ` → 011;
   - `windowDone ∧ (inhQ ∨ maxed)` → 101;
   - còn lại → 001.
5. `cls = Active`:
   - `recQ` → 011;
   - `late` → 001;
   - còn lại → 000.

### 3.5 Đầu ra (`nOut = 3`, là các tín hiệu cuối của netlist)

| Bit | Cờ | Định nghĩa |
|---|---|---|
| 0 | `alarm` | `cls(s') ∈ {Grace, RecoveryPending}` ∧ `cls(s') ≠ cls(s)` |
| 1 | `cancel` | `cls(s) ∈ {Grace, RecoveryPending}` ∧ `s' = 000` |
| 2 | `release` | `cls(s) ≠ Released` ∧ `cls(s') = Released` |

### 3.6 Ghép mạch và kiểm chứng

**Sub-circuit**, tape-out riêng trên ATRO và công khai cho mọi người REF lại:
- `KofN5`: nIn = 8 (v0..v4, k0..k2), nOut = 1, tính `popcount(v) ≥ k`.
- `Ge4`: nIn = 8 (a0..a3, b0..b3), nOut = 1, tính `a ≥ b`.

**Policy v1** gồm:
- REF `KofN5` cho cặp (inhVotes, k) → `inhQ`;
- REF `KofN5` cho cặp (recVotes, k), AND với `k ≠ 0` → `recQ`;
- REF `Ge4` cho cặp (idle, T) → `late`;
- các NAND cho `maxed`, FSM và output;
- 3 LATCH.

Ước tính khoảng 190 NAND đã làm phẳng, tức khoảng 0.5–0.6M gas cho mỗi lần `step`. Con số thật sẽ đo và ghi vào README.

**Các tính chất duyệt hết 2²⁶ tổ hợp** (3 bit state × 23 bit input):

| # | Tính chất |
|---|---|
| P1 | `cls(s) = Released` ⇒ `s' = s` ∧ `out = 000` |
| P2 | `cls(s) ≠ Released` ∧ `alive` ⇒ `s' = 000` |
| P3 | `s' = 101` ∧ `cls(s) ≠ Released` ⇒ `cls(s) = Grace` ∧ ¬alive ∧ windowDone ∧ ¬recQ ∧ (inhQ ∨ maxed) |
| P4 | `s' = 111` ∧ `cls(s) ≠ Released` ⇒ `cls(s) = RecoveryPending` ∧ ¬alive ∧ windowDone ∧ recQ ∧ k ≠ 0 |
| P5 | `cls(s) = Active` ∧ `s' = 001` ⇒ late ∧ ¬alive; `cls(s) = Active` ∧ `s' = 011` ⇒ recQ ∧ ¬alive |
| P6 | `cls(s) ≠ Released` ⇒ `s' ∈ {000, 001, 011, 101, 111}`, nên các mã 010/100/110 không đạt tới được từ 000 |
| P7 | Ba cờ output khớp đúng §3.5 |
| P8 | `(s', out)` trùng khớp với model tham chiếu viết bằng TS ở mọi tổ hợp |

**Bộ công cụ** (`circuits/`, TypeScript):
- Netlist builder: NAND/NOT/AND/OR/XOR, full adder, popcount, comparator, REF, cùng encoder `00 a b` / `01 d` / `02 cpu id nIns nOut ins`.
- Simulator bitsliced theo đúng ngữ nghĩa `NetlistVM.run`, gồm cả REF.
- Model tham chiếu, và bộ kiểm các tính chất P1–P8.

Trang Proof tái dùng chính simulator này trong một Web Worker:
1. đọc `netlist(id)` của Policy và các sub-circuit từ chain;
2. duyệt hết mọi tổ hợp;
3. chạy 64 lần `eth_call step` ngẫu nhiên để đối chiếu kết quả mô phỏng với chain.

## 4. `AtropyleVault`

### 4.1 Cấu hình

Đặt ở `initialize`. Chủ ví sửa được khi chưa Released.

| Trường | Ràng buộc |
|---|---|
| `owner` | Bất biến |
| `heirs[]` `(address, uint16 bps)` | 1–5 người; tổng bps = 10000; không trùng; không phải `0x0`; không phải owner; không phải chính địa chỉ vault (vault không có hàm rút, phần chia gửi vào vault sẽ kẹt vĩnh viễn) |
| `guardians[]` | 0–5 người; không trùng; không phải `0x0`; không phải owner; không phải chính địa chỉ vault (vault không bao giờ ký được, sẽ thành một ghế chết). Giám hộ được phép đồng thời là người thừa kế |
| `k` | 0 ≤ k ≤ số giám hộ |
| `recoveryEnabled` | Chỉ bật được khi k ≥ 1 |
| `P` (giây) | Vault thường: ≥ 86 400. Drill: ≥ 60 |
| `T` | 1–15 |
| `W` (giây) | Vault thường: ≥ 259 200 (3 ngày). Drill: ≥ 60 |
| `assets[]` `{kind, token, id, heir}` | Tối đa 20 mục. `kind` ∈ {ERC20, ERC721, ERC1155}. ERC-20 chia theo bps; ERC-721/1155 gán cho `heirs[heir]` |
| `drill` | Đặt bởi factory. Vault Drill có `expiresAt = createdAt + 7 ngày`; quá hạn thì mọi hàm thay đổi trạng thái revert `DrillExpired` |

### 4.2 Trạng thái lưu trữ

- `state` (uint8)
- `lastAlive`, `alarmAt` (uint64)
- `inhVotes` (uint8)
- `recVote[guardian] → address`
- `recoveryTarget`
- `releasedAt`

### 4.3 Các hàm

| Ai gọi | Hàm | Hành vi |
|---|---|---|
| owner | `checkIn()` | Gọi `_ownerAlive()`, sau đó `_advance(alive = true)` |
| owner | `setHeirs`, `setGuardians`, `setTiming`, `setAssets` | Gọi `_ownerAlive()`, kiểm ràng buộc §4.1, `_advance(true)`, rồi gọi `factory.index(...)` cho các vai trò mới |
| guardian | `attestDeath(bool on)` | Bật hoặc tắt bit của mình trong `inhVotes`, sau đó `_advance(false, 0)` |
| guardian | `voteRecovery(address target)` | Yêu cầu `recoveryEnabled` (không thì `RecoveryDisabled`). `target` phải khác owner, chính địa chỉ vault và các giám hộ (không thì `InvalidTarget`); `target = 0x0` là rút phiếu. Ghi `recVote[msg.sender] = target`, sau đó `_advance(false, target)` |
| bất kỳ ai | `poke()` | Đã Released thì không làm gì. Chưa Released: owner ký thì gọi `_ownerAlive()`, sau đó `_advance(true)`, giống `checkIn`; người khác ký thì `_advance(false, 0)` |
| bất kỳ ai | `distribute()` | Chưa Released và owner ký: gọi `_ownerAlive()`, sau đó `_advance(true)`, giống `checkIn`, rồi trả về `false`. Người khác ký: `_advance(false, 0)`; nếu vẫn chưa Released thì trả về `false` mà **không revert**, để các chuyển trạng thái báo động vẫn được ghi lại. Khi đã Released thì chuyển tài sản theo §4.4, ai gọi cũng được, kể cả owner |
| view | `status()` | Trả về trạng thái, `pending` (trạng thái mà một `poke()` do người không phải owner ký sẽ tạo ra ngay lúc này; bằng `state` khi đã Released hoặc Drill đã hết hạn), `idle`, các mốc hạn chót, phiếu bầu, `recoveryTarget`, và độ phủ allowance của từng tài sản |

`_ownerAlive()` thực hiện:
1. `lastAlive = now`;
2. `inhVotes = 0`;
3. xoá `recVote` của mọi giám hộ.

`_advance(alive, candidateArg)` thực hiện:
1. `candidate = (cls(state) == RecoveryPending) ? recoveryTarget : candidateArg`.
2. Dựng input theo §3.2 rồi gọi `step(policyId, [state], inputs)`.
3. Nếu `alarm`:
   - đặt `alarmAt = now`;
   - nếu `s' = 011` thì `recoveryTarget = candidate`, ngược lại `recoveryTarget = 0`;
   - phát `AlarmRaised(s', recoveryTarget)`.
4. Nếu `cancel`: đặt `alarmAt = 0`, `recoveryTarget = 0`, rồi phát `AlarmCancelled(alive)`.
5. Nếu `release`: đặt `releasedAt = now`, rồi phát `Released(s', recoveryTarget)`.
6. Gán `state = s'`.

Mọi hàm thay đổi trạng thái đều có `nonReentrant`. Khi `cls(state) = Released`, mọi hàm của owner và guardian (gồm `checkIn`, `set*`, `attestDeath`, `voteRecovery`) đều revert `AlreadyReleased` **trước khi** ghi bất cứ thứ gì. Lúc đó `poke` không làm gì, còn `distribute` vẫn chạy.

### 4.4 Phân phối (gọi lặp lại được, mỗi lần quét số dư mới)

- **Người nhận:**
  - ReleasedInherit → người thừa kế;
  - ReleasedRecover → `recoveryTarget`, nhận 100% mọi tài sản.
- **ERC-20:**
  - `avail = min(balanceOf(owner), allowance(owner, vault))`.
  - Ở chế độ thừa kế, người i nhận `avail·bps_i/10000`; người cuối nhận phần dư.
  - Chuyển bằng `transferFrom(owner → người nhận)` qua low-level call, chấp nhận cả kiểu trả về `bool` lẫn không trả về gì.
- **ERC-721:** chỉ chuyển khi `ownerOf(id) == owner` và vault đã được approve (theo từng token hoặc ForAll). Dùng `safeTransferFrom(owner → heirs[heir])`.
- **ERC-1155:** `bal = balanceOf(owner, id)`. Khi `bal > 0` và vault đã được approve ForAll, dùng `safeTransferFrom(owner → heirs[heir], id, bal, "")`.
- **Xử lý lỗi:** mỗi lần chuyển được bọc riêng; thất bại thì phát `TransferFailed(assetIndex, to)` rồi chạy tiếp. Thành công thì phát `Distributed(assetIndex, to, amountOrId)`.
- **Trần gas mỗi lời gọi:** view 100 000, `transferFrom` ERC-20 300 000, `safeTransferFrom` ERC-721/1155 500 000. Trước mỗi lời gọi có trần, vault đòi `gasleft() ≥ cap·64/63 + 10 000`; thiếu thì revert `InsufficientGas()` cho cả giao dịch, để người gọi không thể chỉnh gas cho một lần chuyển hết gas (thành `TransferFailed`) rồi lần quét sau chia lại phần đó. Kiểm này cũng chạy trong các lời gọi view của `coverage()` và `status()`.
- **Giới hạn:** tối đa 20 tài sản × 5 người nhận, ngân sách dưới 6M gas (có gas snapshot trong test).

### 4.5 Bất biến (kiểm bằng invariant test)

| # | Bất biến |
|---|---|
| I1 | Token chỉ di chuyển trong `distribute()` và chỉ khi `cls(state) = Released` |
| I2 | Người nhận ∈ heirs (thừa kế), hoặc người nhận = `recoveryTarget` (khôi phục) |
| I3 | Sau Released, cấu hình và trạng thái không bao giờ thay đổi |
| I4 | Chỉ owner sửa được cấu hình, và mọi giao dịch owner ký khi chưa Released (`checkIn`, `set*`, `poke`, `distribute`) đều là bằng chứng còn sống: `lastAlive = now` và trạng thái về Active |
| I5 | Vault không bao giờ giữ token |
| I6 | Trạng thái được lưu luôn là một mã chuẩn của §3.1 và trùng với kết quả `step` |

## 5. `AtropyleFactory`

- **Hằng số khởi tạo (immutable):**
  - `cpu` (địa chỉ processor ATRO), `policyId`, `vaultImpl`, `treasury` (ví của người dùng);
  - danh sách token phí {USDT0, USDC, USDG};
  - mức phí theo từng token, tính từ `decimals()` đọc lúc deploy: early = 1.99, full = 9.9;
  - `earlyCount = 100`.
- **`createVault(cfg, salt, drill, feeToken)`:** `owner = msg.sender`.
  - Drill miễn phí.
  - Vault thường: `transferFrom(msg.sender → treasury, paidCount < 100 ? early : full)`, rồi `paidCount++`.
  - Clone vault bằng CREATE2 với salt `keccak(owner, salt)`, gọi `initialize`, ghi chỉ mục.
- **`predictVault(owner, salt)`:** cho UI biết trước địa chỉ vault.
- **`vaultsOf(addr)`:** danh sách vault mà `addr` là owner, giám hộ hoặc người thừa kế.
  - Chỉ ghi thêm, không trùng, nhưng có thể có mục cũ; UI tự lọc lại theo cấu hình hiện tại.
  - Không giới hạn độ dài: ai cũng có thể ghi `addr` làm người thừa kế hay giám hộ của các Drill miễn phí. Nơi đọc không được phép hỏng thì đọc theo trang bằng `vaultsOfLength(addr)` và `vaultsOfPage(addr, start, count)`; hai hàm này kẹp phạm vi và không bao giờ revert (`start` ≥ độ dài thì trả mảng rỗng).
  - `index(addr)` chỉ nhận lời gọi từ vault do chính factory tạo.
- **Event:** `VaultCreated(address indexed owner, address indexed vault, bool drill, address feeToken, uint256 fee)`. Drill phát `feeToken = 0x0`, `fee = 0`.

Giảm giá khi trả bằng BEM để sang P1, vì cần oracle.

## 6. Web app

- **Stack:** Vite + Preact + TypeScript + viem.
  - Không dùng CDN; dùng font hệ thống.
  - Mục tiêu dưới khoảng 400 KB gzip.
  - Định tuyến bằng hash: `#/`, `#/create`, `#/v/<vault>`, `#/proof`.
- **Ví:** EIP-6963 và `window.okxwallet`. Tự đề nghị thêm hoặc chuyển sang chain 196. OKX Connect SDK để P1.
- **RPC:** đọc qua provider của ví, hoặc fallback `https://rpc.xlayer.tech` → `https://xlayerrpc.okx.com`.
- **Ngôn ngữ:** EN mặc định, có VI.
- **Các trang:** vai trò tự nhận diện theo ví đang kết nối.
  1. **Trang chủ:** CTA "Try a 5-minute Drill".
  2. **Tạo vault (4 bước):**
     - chọn template Simple (k = 0) hoặc Guarded;
     - nhập người thừa kế và giám hộ;
     - chọn thời gian theo preset (Drill: P = 60 s, T = 2, W = 120 s; 6 tháng; 12 tháng) hoặc tuỳ chỉnh;
     - chọn tài sản, trả phí, `createVault`, rồi lần lượt approve từng tài sản, có thanh tiến độ.
     - Token có sẵn trong danh sách: USDT0, USDC, USDG, WOKB, BEM. NFT nhập tay collection + id, có lối tắt "TapeOut circuit".
  3. **Bảng điều khiển chủ ví:**
     - trạng thái, đếm ngược, nút Check-in lớn;
     - độ phủ allowance của từng tài sản;
     - sửa cấu hình;
     - nút "Revoke all".
  4. **Giám hộ:** bật/tắt xác nhận; bầu ví mới, phải dán lại địa chỉ để xác nhận và có cảnh báo.
  5. **Người thừa kế / người nhận:** `poke` ("Raise alarm") và `distribute` ("Claim"), kèm bảng kết quả từng lần chuyển.
  6. **Proof:** như §3.6, kèm link OKLink.
- **Xử lý lỗi:**
  - trạng thái giao dịch pending, confirmed hoặc failed;
  - giải mã custom error;
  - cảnh báo khi sai mạng;
  - cảnh báo khi độ phủ dưới 100%;
  - nhãn "Beta — unaudited".
- **Đăng tải:**
  - Script tự viết upload lên DeWEB bằng `putFile`/`appendChunk` của SiteRegistry `0xd6EFb7ad…ADB6`. ABI phải xác nhận từ mã nguồn verified trước khi viết script.
  - Bind tên `atropyle` qua DomainBinding `0x68809Fd2…66f9`.
  - Mirror trên GitHub Pages.

## 7. Bot Telegram

- **Nền tảng:** Cloudflare Worker gói miễn phí. KV lưu `chat_id ↔ (vault, role)` và `lastBlock`. Telegram token nằm trong Worker secret.
- **Webhook:**
  - `/start <vault>-<role>` nhận từ deep link trong UI;
  - `/status`;
  - `/unwatch`.
  - Không cần xác minh vai trò, vì dữ liệu này vốn công khai.
- **Cron mỗi phút:**
  - `eth_getLogs` từ `lastBlock` (khoảng 60 block mỗi phút), dedupe theo `txHash` + `logIndex`;
  - gọi `status()` cho các vault đang được theo dõi.
- **Lịch nhắc:**
  - Chủ ví được nhắc ở các mốc 50%, 80% và 100% của T×P.
  - `AlarmRaised`: báo khẩn cho chủ ví ("check in to cancel"), đồng thời báo giám hộ và người thừa kế.
  - `voteRecovery`: báo chủ ví.
  - `Released`: báo người nhận.
- **Khi bot hỏng:** sản phẩm không bị ảnh hưởng. Bot không có quyền on-chain nào.

## 8. Cấu trúc repo

```
circuits/   TS: builder, simulator, model tham chiếu, kiểm tính chất, xuất netlist hex
contracts/  Foundry: src/AtropyleVault.sol, src/AtropyleFactory.sol, src/interfaces/ICPU.sol, test/, script/
web/        Vite + Preact
bot/        Cloudflare Worker
docs/       spec, plan
```

Dùng npm workspaces (Node 24) và Foundry 1.9.

## 9. Kiểm thử

| Lớp | Kiểm thử |
|---|---|
| Circuit | Kiểm exhaustive P1–P8 trong Node/CI. Trên anvil fork X Layer, tape-out lên một processor tạo trên fork, rồi so `step` với simulator ở mọi chuyển trạng thái và trên 10k mẫu ngẫu nhiên |
| Vault/Factory | Unit test theo từng vai trò và từng lỗi ràng buộc. Fuzz và invariant test I1–I6 với chuỗi hành động ngẫu nhiên, đối chiếu model tham chiếu. Test trên fork với Circuits thật. Mock token chuẩn, fee-on-transfer, revert/blacklist, không trả `bool`, ERC-721 và ERC-1155. Có gas snapshot |
| Web | Vitest cho phần đóng gói input, chọn preset và giải mã lỗi |
| Bot | Vitest cho lịch nhắc và dedupe |
| E2E | Checklist làm tay bằng Drill trên mainnet cho cả hai chế độ |

## 10. Triển khai mainnet

Claude viết Foundry script. **Người dùng tự ký** bằng keystore (`--account`) hoặc `--interactive`; Claude không bao giờ chạm vào khoá. Thứ tự:

1. `bem.approve(factory, deployFee)`, rồi `createCPU("Atropyle", "ATRO", story, 10000, 0)`.
2. Kiểm beacon đã đóng băng (§2). Không đạt thì dừng.
3. Approve `protocolFee`, rồi mint NAND/LATCH đúng số cần dùng.
4. Tape-out `KofN5`, `Ge4`, rồi Policy v1, mỗi cái kèm `value = TAPEOUT_FEE`.
5. Deploy `AtropyleVault` impl và `AtropyleFactory`.
6. Verify trên OKLink.

Chi phí ước tính dưới 0.05 OKB và dưới 0.5 BEM.

Hồ sơ nộp bài cần: địa chỉ processor, 3 circuit ID, link DeWEB, repo và video.

## 11. Lịch

| Ngày | Công việc | Mốc |
|---|---|---|
| 18–19/11 | Spec, plan, dựng repo. Người dùng chuẩn bị OKB/BEM, BotFather, Cloudflare | |
| 20–23/11 | Công cụ circuit, chứng minh exhaustive, tape-out trên fork | |
| 22–26/11 | Vault, Factory, bộ test | **26/11: lên mainnet** |
| 24–30/11 | Web app, Proof worker | |
| 29/11–1/12 | Bot, DeWEB, mirror | **1/12: E2E Drill trên mainnet** |
| 2–4/12 | Chiến dịch Drill, sửa lỗi | **2/12: khoá tính năng** |
| 4–5/12 | Video, README, tài liệu nộp | **6/12: nộp** |

Nếu đến 1/12 bị trễ thì chỉ sửa lỗi, không thêm tính năng.

## 12. Phạm vi sau P0

- **P1, chỉ làm nếu kịp trước 2/12:**
  - Tiếng Trung (ZH);
  - OKX Connect mobile;
  - giảm giá khi trả bằng BEM;
  - check-in gasless bằng chữ ký EIP-712 qua relayer;
  - thư TapeSend;
  - Builder Codes;
  - bot xác minh vai trò bằng chữ ký.
- **P2 (roadmap):**
  - template Staged (mở 25/50/100%);
  - "chip di chúc cá nhân" (circuit chỉ gồm REF trỏ về Policy);
  - EIP-7702;
  - OKB gốc;
  - Policy Studio.

## 13. Rủi ro đã chấp nhận

| Rủi ro | Giảm thiểu |
|---|---|
| Quorum giám hộ khôi phục có quyền ngang ví social-recovery; nếu chủ ví đã mất thì không còn ai veto | Chủ ví tự bật/tắt `recoveryEnabled`; bot báo cho người thừa kế; UI cảnh báo khi chọn giám hộ |
| Chủ ví quay lại sau khi đã Released | Không đảo ngược được, đây là chủ ý. Cửa sổ W ≥ 3 ngày, có bot nhắc, và trạng thái chỉ đổi khi có giao dịch nên chủ ví check-in trước lời claim vẫn thắng |
| Chủ ví thu hồi allowance làm người thừa kế nhận ít hơn | Chủ ý, vì là non-custodial; UI hiển thị độ phủ |
| Contract chưa audit | Code nhỏ, không có admin; nhãn Beta; khuyến nghị approve có giới hạn; có bug thì deploy factory v2 |
| Gateway `tapekit.org` bị một số danh sách chống phishing chặn | Có mirror GitHub Pages |
| Factory TapeOut nâng cấp được | Không ảnh hưởng tới `step` (§2); bắt buộc kiểm beacon lúc deploy |

## 14. Điểm cần xác nhận khi bắt đầu code

- Giá trị `decimals()` của USDT0, USDC, USDG trên X Layer.
- ABI của SiteRegistry và DomainBinding, cùng quy tắc URL của gateway.
- Giới hạn range của `eth_getLogs` trên RPC công khai.
- Số gate thực tế của Policy v1 sau khi build, và gas `step` đo trên fork.
