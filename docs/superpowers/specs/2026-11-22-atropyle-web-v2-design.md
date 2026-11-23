# Atropyle Web v2 — Đặc tả thiết kế (Next.js, Supabase, Resend)

Ngày 22/11/2026. Mainnet đã chạy từ hôm nay (`deployments/xlayer.json`). Người dùng yêu cầu dựng lại web bằng Next.js, Supabase và Resend, với tham vọng "vô lý" về UI, UX, thiết kế, font, animation và flow, nhắm giải nhất. Người dùng giao toàn quyền quyết định: mọi lựa chọn dưới đây là ruling của Claude, ghi theo dạng "quyết định — vì sao — giá nếu sai" ở §16.

Spec này **thay** §6 của spec lõi (`2026-11-18-atropyle-design.md`) và §15 của spec hệ sinh thái (`2026-11-18-atropyle-ecosystem-design.md`). Phần backend (§9) **thay** §9 của spec hệ sinh thái và §7 của spec lõi: Cloudflare Worker + D1 + Telegram đổi thành Supabase + Resend. Các phần khác của hai spec cũ giữ nguyên.

## 0. Tóm tắt quyết định

1. **Next.js xuất web tĩnh, chain là nguồn sự thật.** Next.js 16 (App Router) với `output: 'export'`. Mọi thao tác chính (tạo vault, check-in, giám hộ, nhận tài sản, ký link, proof, verify) chạy trong trình duyệt và nói chuyện thẳng với RPC X Layer qua `@atropyle/sdk`. Web vẫn chạy khi Supabase chết.
2. **Hai bản build từ cùng một mã:**
   - `vercel`: bản chính, có email và chỉ mục.
   - `deweb`: bản 100% on-chain trên DeWEB, ẩn mọi thứ cần Supabase.
3. **Supabase + Resend là lớp thêm, không phải lõi.**
   - Supabase lo chỉ mục vault, email nhắc và báo động, keeper và theo dõi integrity.
   - Resend gửi email, template viết bằng React Email.
   - Telegram bị cắt khỏi P0.
4. **Ý tưởng thiết kế: "Sợi chỉ và Cánh cổng".**
   - Tên Atropyle lấy từ Atropos, vị thần cắt sợi chỉ đời. Một sợi chỉ vàng chạy xuyên suốt sản phẩm, và mỗi trạng thái của nó mang nghĩa thật:
     - sợi chỉ đập nhịp khi chủ ví còn sống;
     - sờn và hổ phách khi báo động;
     - đi qua cánh cổng và tách nhánh theo tỉ lệ thừa kế khi vault release.
   - Hình ảnh hero được dệt từ chính netlist 199 cổng của circuit policy.
5. **Năm khoảnh khắc chữ ký**, xem §4.6:
   - proof sơn 67.108.864 tổ hợp lên canvas theo thời gian thực;
   - cỗ máy thời gian kéo được trên timeline, chạy đúng netlist;
   - nghi thức check-in;
   - trải nghiệm cho người thừa kế không biết crypto;
   - email đẹp ngang trang web.
6. **Thước đo chất lượng cứng**, xem §11: Lighthouse mobile ≥ 95/100/100/100, WCAG 2.2 AA, CLS 0, 60 fps trên Android tầm trung, ngân sách JS theo route, và mọi màn hình đều được duyệt bằng ảnh chụp trước khi merge.
7. **Không khoá nào trong repo.** Người dùng ký bằng ví của họ. Ngoại lệ duy nhất là keeper, giữ như spec hệ sinh thái §9.4: `KEEPER_KEY` là secret do maintainer tự đặt trong Supabase.

## 1. Mục tiêu và tiêu chí thành công

**Mục tiêu:** web là thứ giám khảo chạm vào đầu tiên, là cảnh chính của video demo, và quyết định điểm "Product Readiness & UX" lẫn "Demo Video". Nó phải khiến người xem nghĩ "đây là sản phẩm của một đội làm ví hàng đầu", không phải "đây là bài hackathon".

**Tiêu chí thành công (đo được):**

1. **60 giây đầu.** Một người chưa biết Atropyle mở trang chủ trên điện thoại và trả lời được ba câu: nó làm gì, vì sao tin được, bắt đầu thế nào. Trong 60 giây đó họ bấm được "Thử Drill 7 ngày".
2. **Tạo Drill bằng OKX Wallet trên mainnet trong dưới 2 phút**, kể cả thời gian ký, không cần đọc tài liệu.
3. **Đủ hành trình cho ba vai trò trên mainnet:** chủ ví (check-in, sửa, thu hồi), giám hộ (xác nhận, bầu ví khôi phục), người thừa kế (báo động, nhận tài sản, tự kiểm vault).
4. **Proof** chạy hết 2^26 tổ hợp trong trình duyệt và hiển thị trực quan, với hai RPC đồng thuận.
5. **Email:** chủ ví nhận nhắc ở 50/80/100% chu kỳ. Báo động đến chủ ví, giám hộ và người thừa kế trong vòng 2 phút sau event. Mọi email có hủy đăng ký một chạm.
6. **Keeper** tự `poke` và `distribute` cho một Drill trên mainnet mà không ai bấm nút.
7. **Thước đo §11 đạt hết** trên bản build production.
8. **Link cũ vẫn chạy:** mọi link `#/sign?p=…`, `#/v/<vault>`, `#/proof` mà SDK, CLI và MCP đã in ra vẫn mở đúng trang.

**Ngoài phạm vi:** chat LLM nhúng trong web (cần khoá API ở server, trái nguyên tắc), push notification, Telegram (P1), docs (Plan 6 lo, dùng chung design system của spec này), ví nhúng hay social login.

## 2. Kiến trúc tổng thể

```
                         ┌───────────────────────── Trình duyệt ─────────────────────────┐
                         │ Next.js 16 static export (React 19)                           │
 Vercel (bản vercel) ───▶│  • @atropyle/sdk: đọc đồng thuận 2 RPC, mô phỏng, prepare     │──▶ RPC X Layer
 DeWEB (bản deweb)  ───▶│  • ví EIP-6963 / OKX: người dùng tự ký                        │    (OKX, dRPC)
                         │  • Web Worker: verifyPolicy, vault.verify                    │
                         │  • chỉ bản vercel: gọi Supabase Functions (email, chỉ mục)    │
                         └───────────────────────────────┬───────────────────────────────┘
                                                         │ HTTPS (chỉ bản vercel)
                         ┌───────────────────────────────▼───────────────────────────────┐
                         │ Supabase                                                      │
                         │  • Postgres: vaults, roles, events, subscriptions, deliveries │
                         │  • Edge Functions: subscribe, confirm, unsubscribe, me, stats │
                         │  • pg_cron → tick (mỗi phút), integrity (10 phút)             │
                         │  • tick: chỉ mục event → tính lịch nhắc → Resend → keeper     │──▶ Resend
                         └───────────────────────────────────────────────────────────────┘
```

- **Một engine:** web, Supabase Functions, CLI và MCP cùng gọi `@atropyle/sdk`. Web không giữ ABI hay luật riêng (giữ nguyên spec hệ sinh thái §15).
- **Biến build `NEXT_PUBLIC_TARGET`:** `vercel` hoặc `deweb`. Bản `deweb` không chứa URL Supabase trong bundle lẫn CSP, nên badge "100% on-chain" vẫn đúng.
- **Supabase hỏng thì:** web vẫn tạo, check-in, ký, verify được. Riêng trang "Vault của tôi" chuyển sang quét chain (chậm hơn, có thanh tiến độ), và mục email hiện "tạm thời không đăng ký được".

## 3. Thông tin và định tuyến

Static export không dựng sẵn được trang cho mọi địa chỉ vault. Vì vậy tham số động nằm sau dấu `#`: nó không bao giờ được gửi tới server nào, giống thiết kế cũ.

| Đường dẫn | Trang |
|---|---|
| `/` | Trang chủ kể chuyện |
| `/create/` | Tạo vault. `#drill` (mặc định) hoặc `#real` |
| `/vault/#<address>` | Bảng điều khiển vault, nhận diện vai trò theo ví |
| `/verify/#<address>` | Tự kiểm một vault (viết cho người thừa kế) |
| `/sign/#p=<payload>` | Đích của mọi lần chuyển giao từ CLI, MCP và agent |
| `/proof/` | Proof toàn bộ policy |
| `/me/` | Mọi vault mà ví đang kết nối là chủ, giám hộ hoặc người thừa kế |
| `/join/#<vault>.<role>` | Lời mời cho giám hộ hoặc người thừa kế (`role` là `guardian` hoặc `heir`): giải thích vai trò, đăng ký email |
| `/alerts/confirm/#t=<token>`, `/alerts/unsubscribe/#t=<token>` | Xác nhận và huỷ email. Token nằm sau `#` |
| `/status/` | Sức khoẻ: RPC, integrity, keeper, chỉ mục |
| `/developers/` | SDK, CLI, MCP, plugin, circuit dùng lại được |
| `/privacy/` | Dữ liệu nào được lưu, ở đâu, xoá thế nào |
| `404` | Trang không tồn tại, có gợi ý |

- `trailingSlash: true` để host tĩnh phục vụ `/<route>/index.html`.
- **Chuyển hướng link cũ:** trang `/` đọc `location.hash`. `#/sign?p=X` chuyển sang `/sign/#p=X`, `#/v/<a>` sang `/vault/#<a>`, `#/v/<a>/verify` sang `/verify/#<a>`, `#/proof` sang `/proof/`, `#/create` sang `/create/`. Test bao hết mọi dạng SDK từng sinh ra.
- **Ngôn ngữ:** EN mặc định, có VI, chọn ở client và nhớ trong `localStorage`, giống thư viện `i18n` hiện có. `vi` phải có đủ khoá của `en` (kiểm bằng compiler và test).

## 4. Định hướng sáng tạo

### 4.1 Ý tưởng: Sợi chỉ và Cánh cổng

Atropos cắt sợi chỉ. Atropyle là cánh cổng để sợi chỉ không đứt vô nghĩa: tài sản đi tiếp tới đúng người. Ngôn ngữ hình ảnh có một nhân vật duy nhất là **Sợi chỉ**, một nét vàng liên tục:

- **Trang chủ:** sợi chỉ dệt nên hero, chạy dọc theo câu chuyện khi cuộn, và nối các phần với nhau.
- **Chuyển trang:** sợi chỉ là phần tử chung (shared element), trượt từ trang này sang trang kia, nhờ View Transitions.
- **Vault:** sợi chỉ là timeline. Mỗi lần check-in thắt một nút. Khoảng cách tới hạn kế tiếp là đoạn chỉ còn lại.
- **Trạng thái vault:**

| Trạng thái | Sợi chỉ |
|---|---|
| Đang sống (ACTIVE) | Vàng, đập nhịp chậm như mạch |
| Báo động (GRACE) | Hổ phách, sờn, rung nhẹ |
| Khôi phục (RECOVERY) | Lam, rẽ sang ví mới |
| Đã release | Đi qua cánh cổng rồi tách thành nhánh, độ dày mỗi nhánh tỉ lệ với phần thừa kế |
| Drill hết hạn | Xám, cuộn lại |

Màu không bao giờ là tín hiệu duy nhất: mỗi trạng thái đều có biểu tượng và nhãn chữ.

### 4.2 Kiểu chữ

Font tự host (woff2, subset latin, latin-ext, vietnamese), giấy phép OFL đi kèm, nạp bằng `next/font/local`. Không gọi Google Fonts lúc build hay lúc chạy.

| Vai trò | Font | Ghi chú |
|---|---|---|
| Hiển thị | **Fraunces** (variable: `opsz`, `wght`, `SOFT`, `WONK`) | Tiêu đề lớn. Trục `SOFT` và `WONK` animate nhẹ khi hover hoặc khi vào màn hình |
| Giao diện | **Inter** (variable) | Thân bài, form, nút. Bật `cv11`, `ss01`, `tnum` khi cần |
| Kỹ thuật | **JetBrains Mono** (variable) | Địa chỉ, hash, số, mã. Địa chỉ luôn hiển thị theo cụm 4 ký tự để dễ so |

- **Thang chữ:** fluid, dùng `clamp()`. 8 bậc từ 12 tới 96 px. Chiều dài dòng thân bài 60–72 ký tự.
- **Tiếng Việt:** kiểm dấu chồng (ặ, ỗ, ữ) ở mọi bậc tiêu đề; line-height không dưới 1.15 cho tiêu đề VI.

### 4.3 Màu

Dark là mặc định ("đêm khung cửi"), có light ("giấy da"), theo `prefers-color-scheme`, có nút đổi. Token là biến CSS, định nghĩa trong Tailwind v4 `@theme`.

| Token | Dark | Light | Dùng cho |
|---|---|---|---|
| `bg` | `#0B0D12` | `#F6F1E7` | Nền |
| `surface-1/2/3` | `#12151C` / `#181C25` / `#20252F` | `#FFFDF8` / `#F0EADF` / `#E7DFD1` | Các lớp |
| `ink` | `#ECE7DD` | `#16130F` | Chữ chính |
| `ink-muted` | `#A59F94` | `#5E574C` | Chữ phụ |
| `thread` | `#E8B65A` | `#86590E` | Sợi chỉ, hành động chính, focus ring |
| `alive` | `#5CC8B0` | `#106F5A` | ACTIVE |
| `grace` | `#F0A23B` | `#945100` | GRACE |
| `recovery` | `#7FA8FF` | `#2E5BC7` | RECOVERY |
| `release` | `#B7A6FF` | `#5B44C9` | Release |
| `danger` | `#FF6B5E` | `#B42318` | Lỗi, thao tác không đảo ngược |
| `on-thread` / `on-danger` | `#0B0D12` | `#FFFDF8` | Chữ trên nút tô `thread` hoặc `danger` |
| `line` | `#2A303C` | `#DDD3C2` | Đường kẻ trang trí |
| `line-strong` | `#737985` | `#80766A` | Viền điều khiển (≥ 3:1, WCAG 1.4.11) |

Mọi cặp chữ trên nền đạt AA. Thân bài trên `bg` đạt AAA. Một test kiểm tỉ lệ tương phản của bảng token.

### 4.4 Chuyển động

- **Thư viện:** `motion` cho spring và layout animation, View Transitions API cho chuyển trang, CSS scroll-driven animation cho trang chủ.
- **Token:**
  - thời lượng `instant 90`, `quick 160`, `base 240`, `slow 420`, `story 720` ms;
  - spring mặc định `stiffness 380, damping 32`;
  - easing `out-expo` cho xuất hiện, `in-out-sine` cho nhịp thở.
- **Luật:**
  - mọi animation ngắt được giữa chừng;
  - không animation nào chặn thao tác;
  - chỉ animate `transform`, `opacity`, `filter` và trục font;
  - 60 fps trên Android tầm trung.
- **`prefers-reduced-motion`:** thay bằng crossfade 120 ms. Sợi chỉ đứng yên, chỉ đổi màu. Canvas proof vẫn điền nhưng không có hiệu ứng hạt.
- **Phản hồi xúc giác:** `navigator.vibrate` 12 ms khi check-in và khi ký xong, chỉ trên thiết bị hỗ trợ, tắt được.
- **Không có âm thanh.**

### 4.5 Biểu tượng và hình minh hoạ

- Biểu tượng: Lucide (ISC, tree-shake), nét 1.5 px. Thêm 8 glyph riêng cho trạng thái vault, vẽ cùng ngôn ngữ nét chỉ.
- Không dùng ảnh stock, không minh hoạ 3D chung chung. Mọi hình đều sinh từ dữ liệu thật: netlist, timeline, tỉ lệ thừa kế, số liệu chain.

### 4.6 Năm khoảnh khắc chữ ký

1. **Proof trực quan (`/proof/`).**
   - 2^26 = 8192 × 8192, nên mỗi tổ hợp là đúng một điểm ảnh của một hình vuông 8192 × 8192.
   - Canvas 1024 × 1024 (mỗi điểm là 64 tổ hợp) được sơn theo `onProgress` của `verifyPolicy` trong Web Worker. Kính lúp xem 1:1 ở vùng bất kỳ.
   - Tám thuộc tính P1–P8 bật xanh từng cái.
   - Kết thúc bằng hash netlist khớp mã nguồn, block đồng thuận và link OKLink.
   - Có nút "Chạy lại trên máy bạn" và lệnh `npx atropyle verify`.
2. **Cỗ máy thời gian.**
   - Một thanh kéo thời gian trên trang vault và ở bước cuối wizard. Kéo tới tương lai để thấy điều gì xảy ra nếu chủ ví ngừng check-in, nếu một giám hộ xác nhận, nếu đủ k giám hộ bầu ví mới.
   - Mọi khung hình được tính bằng `timelineOf` và `predictAction` trên đúng netlist mainnet, không phải mô phỏng vẽ tay.
3. **Nghi thức check-in.**
   - Một nút lớn. Nhấn giữ 600 ms (bấm phím Enter cũng được) để thắt nút trên sợi chỉ, rồi ký.
   - Khi giao dịch xác nhận, nút thắt sáng lên, thời hạn mới chạy lại từ đầu, và có rung nhẹ.
4. **Trải nghiệm người thừa kế.**
   - `/vault/#<a>` mở bằng ví người thừa kế cho thấy một trang viết như lá thư: "Ai đó đã để lại cho bạn một phần tài sản".
   - Ba bước bằng lời thường: kiểm vault là thật (verify), báo động nếu cần, nhận tài sản. Thuật ngữ crypto có chú giải bật lên.
5. **Email cùng ngôn ngữ thiết kế.** Template React Email dùng cùng token màu, cùng font (có fallback cho email client), và hình sợi chỉ tĩnh theo trạng thái.

## 5. Các trang và flow

### 5.1 Trang chủ `/`

Kể chuyện theo cuộn, sáu cảnh, mỗi cảnh một ý:

1. **Hero:** câu hỏi "Chuyện gì xảy ra với tài sản crypto của bạn khi bạn không còn ký được nữa?" Sợi chỉ dệt từ netlist hiện dần. Hai CTA: "Thử Drill 7 ngày, miễn phí" và "Xem bằng chứng".
2. **Cách hoạt động:** check-in, lỡ hạn, báo động, giám hộ xác nhận, người thừa kế nhận. Đây là một mô phỏng tương tác chạy bằng SDK, kéo được.
3. **Khôi phục ví:** k giám hộ chuyển tài sản sang ví mới. Chỉ một lần check-in của chủ ví là chặn được. Mặc định tắt, ghi rõ nó cho phép gì.
4. **Vì sao tin được:** luật nằm trong circuit trên TapeOut, không ai sửa được, kể cả đội Atropyle. Proof thu nhỏ chạy ngay trên trang.
5. **Agent:** "Lập kế hoạch thừa kế bằng lời, ký bằng ví của bạn". Trình chiếu cảnh Claude Code với plugin Atropyle, và lệnh cài.
6. **Số liệu thật từ chain:** số vault, số Drill, số check-in. Bản vercel lấy từ Supabase, bản deweb từ chain qua `stats()` có cache. Có link OKLink của factory.

Chân trang: nhãn "Beta — unaudited", link GitHub, X Layer, giấy phép, quyền riêng tư.

### 5.2 Tạo vault `/create/`

Wizard một quyết định mỗi màn hình, có thanh tiến độ là sợi chỉ. Bản xem trước vault "được dệt" dần ở cột phải (trên mobile là tấm kéo lên được).

1. **Kiểu:** Drill (7 ngày, miễn phí, nhịp tính bằng phút) hoặc vault thật (phí 1,99 rồi 9,90 USDT0/USDC/USDG). Giải thích bằng một câu.
2. **Người thừa kế:**
   - Nhập địa chỉ và phần trăm. Có thanh chia phần kéo được, tổng luôn 100%.
   - Địa chỉ được kiểm checksum, hiển thị theo cụm 4 ký tự, cảnh báo khi dán trùng.
3. **Giám hộ (tuỳ chọn):** tối đa 5 người, chọn k. Bật khôi phục ví bằng một checkbox ghi rõ hậu quả.
4. **Thời gian:** preset Drill, 6 tháng, 12 tháng, hoặc tuỳ chỉnh. Cỗ máy thời gian cho xem trước.
5. **Tài sản:** token có sẵn trong danh sách (USDT0, USDC, USDG, WOKB, BEM) và NFT. Hiện số dư thật.
6. **Xem lại và ký:**
   - tóm tắt bằng lời thường, rồi mô phỏng toàn bộ (`checkPlan`, `simulate`);
   - ký từng bước, có thanh tiến độ, "Tiếp tục từ bước N" khi gián đoạn (giữ hành vi đã sửa ở web cũ), và `wallet_sendCalls` nếu ví hỗ trợ.
7. **Xong:**
   - địa chỉ vault, link OKLink, link mời cho từng giám hộ và người thừa kế (`/join/#…`, có nút chia sẻ và QR);
   - ô đăng ký email (bản vercel).

Trạng thái wizard lưu trong `sessionStorage`, rời trang có cảnh báo. Mọi lỗi giải mã qua SDK và hiện gợi ý sửa.

### 5.3 Vault `/vault/#<address>`

- Đầu trang: địa chỉ, nhãn Drill hoặc vault thật, trạng thái kèm sợi chỉ, nút Verify, link OKLink.
- Vai trò nhận theo ví đang kết nối (`rolesOf`). Một ví có thể mang nhiều vai, thì hiện tab theo vai.
  - **Chủ ví:** nghi thức check-in, đếm ngược, độ phủ allowance của từng tài sản (cảnh báo khi dưới 100%), sửa cấu hình, "Thu hồi tất cả", cỗ máy thời gian.
  - **Giám hộ:** trạng thái hiện tại, bật/tắt xác nhận. Khi bầu ví khôi phục, phải dán lại địa chỉ, và hiện cảnh báo chống lừa đảo của SDK (`GUARDIAN_WARNING`).
  - **Người thừa kế:** trải nghiệm lá thư (§4.6). "Báo động" (`poke`) và "Nhận" (`distribute`), kèm bảng kết quả từng lần chuyển.
  - **Khách:** xem công khai, kèm lời mời "Bạn là giám hộ hay người thừa kế? Kết nối ví".
- Lịch sử event dạng dòng thời gian trên sợi chỉ.

### 5.4 Ký `/sign/#p=<payload>`

Giữ toàn bộ luật an toàn của spec hệ sinh thái §15:

- trang tự giải mã calldata;
- đích phải nằm trong whitelist;
- ví đang kết nối phải trùng `from`;
- mô phỏng lại mọi bước;
- `wallet_sendCalls` hoặc ký lần lượt.

Thiết kế mới:
- Mỗi bước là một thẻ viết bằng lời thường ("Tạo vault, trả 1,99 USDT0"), có phần "chi tiết kỹ thuật" mở ra được.
- Cảnh báo màu `danger` cho bất cứ thứ gì không đảo ngược được.
- Ghi rõ "Trang này không tin link: mọi thứ bạn thấy được giải mã lại từ dữ liệu sẽ ký".

### 5.5 Verify vault `/verify/#<address>`

`vault.verify()` chạy trong Web Worker. Kết quả viết cho người không chuyên, ba dòng xanh hoặc đỏ:
- đây là vault thật của Atropyle (clone của đúng implementation);
- luật của nó đúng là circuit đã kiểm (đúng CPU, đúng policy);
- dữ liệu được hai nhà cung cấp RPC độc lập xác nhận.

Mỗi dòng có link tự đối chiếu trên OKLink.

### 5.6 Vault của tôi `/me/`

Kết nối ví để thấy mọi vault theo vai trò.
- **Bản vercel:** gọi `me` của Supabase để có danh sách ngay, rồi kiểm lại từng vault trên chain trước khi hiện trạng thái.
- **Bản deweb:** quét chain bằng SDK (`scan`), có tiến độ và cache trong `localStorage`.

### 5.7 Email (chỉ bản vercel)

- **Đăng ký:** ở bước Xong của wizard, trên trang vault và trang `/join/`. Nhập email, chọn ngôn ngữ (EN/VI). Hệ thống gửi thư xác nhận (double opt-in), và chỉ gửi nhắc sau khi người nhận bấm xác nhận.
- **Phản hồi luôn giống nhau** ("Kiểm tra hộp thư"), để không lộ email nào đã đăng ký.
- **Hủy:** link một chạm trong mọi email, kèm header `List-Unsubscribe` và `List-Unsubscribe-Post` (RFC 8058). Hủy là xoá hàng khỏi cơ sở dữ liệu.

### 5.8 Trang khác

- **`/status/`:** RPC (độ trễ, block), integrity mới nhất, keeper (lần chạy cuối, số dư ví gas), độ trễ chỉ mục.
  - Bản vercel đọc thêm `health` của Supabase.
  - Bản deweb chỉ hiện phần đọc từ chain.
- **`/developers/`:** SDK trong 10 dòng, lệnh thêm MCP, cài plugin, `KofN5` và `Ge4` dùng lại được, link docs.
- **`/privacy/`:** lưu gì (email, vault, vai trò, ngôn ngữ), ở đâu (Supabase, khu vực Singapore), xoá thế nào, không tracker.

## 6. Design system

- **Tailwind CSS v4.** Token ở §4 nằm trong `@theme` và biến CSS cho hai theme.
- **Primitive:** Radix (Dialog, Popover, Tooltip, Tabs, ToggleGroup, Slider, VisuallyHidden) để có accessibility chuẩn. Toàn bộ giao diện tự thiết kế, không dùng theme có sẵn.
- **Thành phần riêng:**

| Nhóm | Thành phần |
|---|---|
| Sợi chỉ | `Thread`: SVG có path động; WebGL qua `ogl` cho hero, nạp lười, có fallback SVG |
| Địa chỉ và tiền | `Address`: cụm 4 ký tự, copy, link OKLink, avatar sinh từ địa chỉ. `Amount`: số tabular, đơn vị, giá trị gốc khi hover |
| Trạng thái | `StateBadge` |
| Giao dịch | `TxCard`, `TxProgress` |
| Thời gian | `Countdown`, `TimeMachine`, `ShareSplitter` |
| Hành động | `HoldButton` |
| Khung | `WalletButton`, `ConnectSheet`, `LangSwitch`, `ThemeSwitch` |
| Trạng thái trống | `EmptyState`, `Skeleton` có đúng hình dạng nội dung thật |

- **Trạng thái của mỗi thành phần:** đủ loading, empty, error, disabled, focus. Mỗi thành phần có trang xem thử ở `/dev/`, một route chỉ có trong build dev, không xuất ra production.

## 7. Kỹ thuật frontend

| Hạng mục | Lựa chọn |
|---|---|
| Framework | Next.js 16 App Router, `output: 'export'`, `images.unoptimized`, `trailingSlash` |
| UI | React 19, Tailwind v4, Radix, `motion`, Lucide |
| Chain | `@atropyle/sdk` (đọc đồng thuận, mô phỏng, prepare, handoff), viem |
| Dữ liệu | TanStack Query: cache, retry, refetch theo khoảng và khi quay lại tab. Khoá query theo `[chainId, vault, block]` |
| Ví | Lớp ví hiện có (EIP-6963, `window.okxwallet`, thêm hoặc chuyển chain 196, `wallet_sendCalls`), viết lại thành hook React. OKX đứng đầu danh sách. Trên mobile không có ví thì mở "Mở trong OKX App" bằng deep link; định dạng link phải xác minh từ docs OKX trước khi code |
| Worker | `verifyPolicy` và `vault.verify` trong Web Worker. Cách nạp worker với Next 16 phải spike ở task đầu tiên |
| Mã dùng lại | Các module thuần đã có test của web cũ: `create-form`, `sign`, `send-calls`, `wallet`, `tx-view`, `vault-view`, `i18n`, `format`, `errors-view`. Port sang và giữ nguyên test |
| Chia code | Theo route. WebGL, canvas proof và cỗ máy thời gian nạp lười |
| Metadata | Ảnh OG tĩnh cho từng trang, sinh lúc build. `manifest.webmanifest`. Không service worker |

## 8. Bảo mật frontend

- **CSP chặt** cho cả hai bản:
  - `default-src 'self'`;
  - `script-src 'self'` cộng hash của mọi script inline mà Next sinh ra (tính sau build, như `build/csp.ts` hiện có);
  - `connect-src` chỉ gồm RPC của deployment, và URL Functions của Supabase ở bản vercel;
  - `frame-ancestors 'none'` (chỉ có hiệu lực qua header, tức là ở bản vercel).
  - Bản vercel đặt CSP qua header trong `vercel.json`. Bản deweb đặt qua `<meta>`.
- **Không script, font hay ảnh bên thứ ba. Không tracker, không analytics.**
- **Văn bản đọc từ chain** (tên token, lý do revert) luôn hiển thị như dữ liệu không tin cậy: không render HTML, không biến thành link.
- **Chống lừa đảo:**
  - trang ký và trang giám hộ giữ đủ cảnh báo và luật whitelist;
  - email không bao giờ chứa nút "ký ngay". Email chỉ trỏ về domain của Atropyle và in địa chỉ vault dạng chữ để tự đối chiếu.

## 9. Backend Supabase

### 9.1 Dữ liệu (Postgres, migration trong `supabase/migrations/`)

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `cursors` | `name`, `block`, `updated_at` | Vị trí đã quét của chỉ mục |
| `vaults` | `address` (pk), `owner`, `drill`, `created_block`, `state`, `pending_state`, `next_check_at`, `expires_at`, `released`, `updated_block` | Tính lại sau mỗi event và mỗi lần keeper gửi giao dịch |
| `vault_roles` | `vault`, `address`, `role` (`owner`/`guardian`/`heir`) | pk ba cột |
| `vault_events` | `tx_hash`, `log_index`, `vault`, `name`, `block`, `at`, `args` (jsonb) | pk `(tx_hash, log_index)`, dùng để dedupe |
| `subscriptions` | `id`, `email` (citext), `vault`, `role`, `lang`, `status` (`pending`/`active`), `confirm_hash`, `unsub_hash`, `created_at`, `confirmed_at` | unique `(email, vault, role)`. Chỉ lưu hash của token |
| `deliveries` | `subscription_id`, `kind`, `period_key`, `sent_at`, `provider_id` | pk ba cột đầu: không gửi trùng |
| `rate_limits` | `key`, `window_start`, `count` | Khoá là hash của IP hoặc email |
| `keeper_log` | `vault`, `action`, `tx_hash`, `status`, `at` | |
| `integrity_runs` | `at`, `block`, `ok`, `report` (jsonb) | |

- **RLS bật trên mọi bảng, không có policy nào cho `anon` hay `authenticated`.** Chỉ Edge Functions với service role được đọc ghi. Không bảng nào lộ qua API REST tự động.
- **Pending tự xoá:** đăng ký `pending` quá 48 giờ bị xoá bởi job hằng ngày.

### 9.2 Edge Functions

- **Cách viết:** TypeScript chỉ dùng Web API (`Request` → `Response`), nên chạy được cả trên Deno (production) lẫn Node (test).
- **Đóng gói:** mỗi function được bundle bằng esbuild cùng `@atropyle/sdk` thành một file.
- **Kho:** mã trong `apps/backend/` (workspace `@atropyle/backend`, không publish). File bundle ghi vào `supabase/functions/<tên>/index.ts`.

| Function | Phương thức | Việc |
|---|---|---|
| `subscribe` | POST `{email, vault, role, lang}` | Kiểm vault có thật (`factory.isVault`), rate limit (5/giờ mỗi IP, 3/giờ mỗi email), tạo hoặc làm mới hàng `pending`, gửi thư xác nhận. Luôn trả 202 với cùng nội dung |
| `confirm` | POST `{token}` | Chuyển sang `active`, gửi thư chào mừng |
| `unsubscribe` | POST `{token}`, và POST một chạm theo RFC 8058 | Xoá hàng |
| `me` | GET `?address=` | Danh sách vault theo vai trò từ chỉ mục. Dữ liệu công khai |
| `stats` | GET | Số liệu cho trang chủ, cache 60 giây |
| `health` | GET | Độ trễ chỉ mục, integrity mới nhất, keeper |
| `tick` | POST, cần header `x-cron-secret` | Chạy mỗi phút: chỉ mục, nhắc, keeper (§9.3) |
| `integrity` | POST, cần `x-cron-secret` | Mỗi 10 phút: `integrity()` của SDK. Không đạt thì ghi lại và báo email vận hành |

- **CORS:** GET mở `*`. POST chỉ nhận origin của bản vercel.
- **Lỗi:** `application/problem+json`, dùng mã lỗi của SDK.

### 9.3 `tick`: chỉ mục, nhắc, keeper

1. **Chỉ mục.**
   - `getLogs` từ cursor, chia khoảng 100 block (giới hạn của RPC), đọc qua transport đồng thuận của SDK. Batch tối đa 3 call, như đã sửa ở PR #7.
   - Dedupe bằng `vault_events`.
   - Cập nhật `vaults`, `vault_roles` và `next_check_at` (mốc kế tiếp của `timelineOf`).
   - Mỗi lần chạy xử lý tối đa 2.000 block, phần còn lại để lần sau.
2. **Nhắc** (idempotent nhờ `deliveries`):
   - **Chủ ví:** nhắc ở 50%, 80% và 100% chu kỳ check-in. `period_key` là block của lần check-in gần nhất.
   - **`AlarmRaised`:** báo khẩn cho chủ ví ("check in để huỷ, hạn …"), và báo giám hộ, người thừa kế.
   - **Bầu khôi phục:** báo chủ ví.
   - **Release:** báo người thừa kế.
   - **Sau `distribute`:** báo người thừa kế, kèm số đã nhận.
   - **Drill hết hạn:** gửi chủ ví bản tóm tắt "Drill của bạn đã chạy thế nào".
3. **Keeper:**
   - Ứng viên: vault có `next_check_at ≤ now`, chưa hết hạn Drill.
   - Gọi `status()` rồi `planKeeperActions`, mô phỏng, rồi gửi bằng ví keeper.
   - Giới hạn an toàn giữ nguyên spec hệ sinh thái §9.4: 20 giao dịch mỗi lần chạy, trần gas, dừng khi số dư dưới 0,005 OKB. Thiếu `KEEPER_KEY` thì chỉ chạy dry-run.
   - Mỗi giao dịch keeper ghi `keeper_log`.
4. **Thời gian chạy:** cả `tick` phải xong trong 50 giây, giới hạn Edge Function còn dư. Vượt thì dừng sạch, ghi cursor, và để lần sau chạy tiếp.

**Lịch:** `pg_cron` cộng `pg_net` gọi `tick` mỗi phút, `integrity` mỗi 10 phút, dọn `pending` mỗi ngày. Secret của cron nằm trong Supabase Vault.

### 9.4 Email (Resend + React Email)

- **Template trong repo, render lúc build** thành HTML và text:
  - `confirm`, `welcome`;
  - `checkin-50`, `checkin-80`, `checkin-due`;
  - `alarm-owner`, `alarm-guardian`, `alarm-heir`;
  - `recovery-vote`, `released`, `distributed`, `drill-summary`.
  - Mỗi template có hai ngôn ngữ, EN và VI.
- **Người gửi:** `Atropyle <alerts@<domain>>`. Domain được xác minh SPF và DKIM ở Resend (việc của người dùng, §15).
- **Nội dung:**
  - địa chỉ vault dạng chữ, trạng thái, thời hạn (múi giờ UTC kèm giờ địa phương nếu biết);
  - một nút duy nhất trỏ về trang vault trên domain của Atropyle;
  - dòng "Chúng tôi không bao giờ yêu cầu bạn ký qua email".
- **Test:** snapshot HTML của mọi template ở cả hai ngôn ngữ; kiểm link chỉ trỏ về domain cho phép; kiểm có header hủy đăng ký.

### 9.5 Quyền riêng tư

- **Dữ liệu cá nhân duy nhất là email.** IP chỉ dùng dạng hash có muối để rate limit, giữ 24 giờ.
- **Không chia sẻ, không marketing.** Email chỉ dùng cho thông báo của vault đã đăng ký.
- **Xoá:** hủy là xoá thật. Trang `/privacy/` mô tả đủ.

### 9.6 Hợp đồng API giữa web và backend

Plan 7 (web) và Plan 8 (backend) viết song song. Bảng dưới là giao diện duy nhất giữa hai bên; đổi nó phải sửa spec trước.

- **Gốc URL:** `NEXT_PUBLIC_API_URL`, dạng `https://<project>.supabase.co/functions/v1`. Chỉ bản vercel có biến này.
- **Định dạng:** JSON UTF-8. `bigint` là chuỗi thập phân, địa chỉ có checksum (theo AGENTS.md). Thời điểm là chuỗi ISO 8601 UTC.
- **Lỗi:** `application/problem+json` dạng `{ "type": "about:blank", "title": string, "status": number, "code": string }`. Các `code`: `INVALID_INPUT`, `NOT_A_VAULT`, `RATE_LIMITED`, `TOKEN_INVALID`, `UNAUTHORIZED`, `INTERNAL`.
- **Kiểu dùng chung:** `Role = "owner" | "guardian" | "heir"`, `Lang = "en" | "vi"`.

| Endpoint | Yêu cầu | Trả về |
|---|---|---|
| `POST /subscribe` | `{ email: string, vault: Address, role: Role, lang: Lang, website: string }`. `website` là bẫy bot, phải rỗng | `202 { ok: true }` cho mọi email hợp lệ, có hay chưa có trong hệ thống. `400 INVALID_INPUT`, `400 NOT_A_VAULT`, `429 RATE_LIMITED` |
| `POST /confirm` | `{ token: string }` | `200 { ok: true, vault: Address, role: Role }`. `404 TOKEN_INVALID` |
| `POST /unsubscribe` | `{ token: string }`, hoặc `?t=<token>` với thân `List-Unsubscribe=One-Click` (RFC 8058) | `200 { ok: true }`, kể cả khi token không còn (idempotent) |
| `GET /me?address=<Address>` | | `200 { address, block: string, vaults: [{ vault: Address, roles: Role[], drill: boolean, state: string, released: boolean }] }`. `state` là tên trạng thái của SDK |
| `GET /stats` | | `200 { block: string, vaults: string, drills: string, checkIns: string, updatedAt: string }` |
| `GET /health` | | `200 { indexer: { block: string, lagBlocks: number, updatedAt: string }, integrity: { at: string, block: string, ok: boolean } \| null, keeper: { lastRunAt: string, balanceWei: string, dryRun: boolean } \| null }` |

- **Link trong email** (web phải có các trang này):
  - `<SITE_URL>/vault/#<vault>`;
  - `<SITE_URL>/alerts/confirm/#t=<token>`;
  - `<SITE_URL>/alerts/unsubscribe/#t=<token>`.
  - Trang web đọc token sau `#` rồi `POST` lên function. Token không bao giờ nằm trong query string gửi tới Vercel.
- **Header `List-Unsubscribe`:** trỏ thẳng tới `POST <API_URL>/unsubscribe?t=<token>`. Đây là một chạm theo RFC 8058, mail client gọi trực tiếp, không qua web.

## 10. Hosting và triển khai

- **Vercel (bản chính):**
  - import repo GitHub, root `apps/web`, lệnh build dựng `@atropyle/sdk` trước rồi build app với `NEXT_PUBLIC_TARGET=vercel`;
  - header CSP và cache trong `vercel.json`;
  - domain riêng.
- **DeWEB (bản 100% on-chain):**
  - `NEXT_PUBLIC_TARGET=deweb`, output `out/`;
  - các script `site:build`, `site:check` và `deweb:publish` đổi sang đọc thư mục này;
  - luật tĩnh giữ nguyên: không URL ngoài trừ RPC, mỗi file ≤ 8,4 MB, ≤ 5.000 đường dẫn;
  - runbook trong `docs/deployments.md` giữ nguyên các bước ký của người dùng.
- **GitHub Pages:** bỏ. Vercel thay vai trò bản sao.
- **Supabase:** migration bằng `supabase db push`, function bằng `supabase functions deploy`. Cả hai do người dùng chạy (cần access token của họ), hoặc qua một workflow dùng secret `SUPABASE_ACCESS_TOKEN` mà người dùng tự đặt. Không workflow nào ký giao dịch.

## 11. Thước đo chất lượng (cổng merge)

| Hạng mục | Ngưỡng | Cách kiểm |
|---|---|---|
| Lighthouse mobile | Performance ≥ 95, Accessibility 100, Best Practices 100, SEO 100 trên `/`, `/create/`, `/proof/` | Lighthouse chạy cục bộ trong CI trên bản build, không dịch vụ ngoài |
| Web vitals (Lighthouse mobile) | LCP ≤ 1,8 s, CLS 0, TBT ≤ 150 ms | Như trên |
| JS lần tải đầu | `/` ≤ 170 kB gzip; mỗi route khác ≤ 230 kB gzip; tổng site ≤ 900 kB | `size-limit` theo route |
| Accessibility | WCAG 2.2 AA; không lỗi axe ở mọi trang và mọi trạng thái chính; bàn phím đi hết mọi flow | `@axe-core/playwright` trong e2e, cộng một test chỉ dùng bàn phím |
| Chuyển động | 60 fps trên CPU throttle 4×; không animation nào khi reduced motion ngoài crossfade | Kiểm thủ công có ghi lại trong PR, cộng một test e2e với `reducedMotion: 'reduce'` |
| Tương phản | Mọi cặp token đạt AA | Unit test trên bảng token |
| Thiết kế | Mỗi màn hình chụp ở 390, 768 và 1440 px, hai theme, hai ngôn ngữ; reviewer duyệt theo checklist §4 | Ảnh đính kèm PR |
| Chức năng | Mọi flow của §5 chạy e2e trên anvil devnet với ví giả | Playwright, dùng hạ tầng devnet hiện có |
| Backend | Logic thuần có unit test; migration chạy trên PGlite; handler test bằng `Request` giả; chỉ mục và keeper chạy e2e trên anvil | Vitest |
| Email | Snapshot mọi template; link chỉ về domain cho phép | Vitest |

## 12. Kiểm thử

- **Frontend:** Vitest + Testing Library cho thành phần và hook; Playwright e2e trên anvil (`scripts/devnet`, `e2e-devnet-prep`) với ví giả đã có; axe trong mỗi e2e.
- **Backend:**
  - logic thuần (lịch nhắc, `period_key`, chọn ứng viên keeper, rate limit) test bằng Vitest;
  - SQL test trên PGlite;
  - `tick` chạy e2e trên anvil: tạo Drill, tua thời gian bằng `devnet-warp`, rồi kiểm email giả được "gửi" đúng lúc và keeper `poke` đúng block.
- **Ảnh chụp:** reviewer dùng trình duyệt tích hợp. Visual regression tự động để P1, vì baseline phụ thuộc hệ điều hành của CI.

## 13. Chuyển đổi từ web cũ

- Task đầu tiên chuyển web Preact sang `apps/web-legacy` (workspace `@atropyle/web-legacy`) và dựng app Next.js ở `apps/web`. CI tiếp tục test bản legacy cho tới khi bản mới đạt đủ §5 và §11, rồi xoá `apps/web-legacy`. Đường dẫn cuối cùng có ngay từ đầu, nên CI và script chỉ phải sửa một lần.
- **Mang sang và giữ nguyên test:** logic thuần (§7), thông điệp i18n đã dịch, luật whitelist của trang ký, luồng "Tiếp tục từ bước N".
- **Viết lại:** toàn bộ giao diện và trang.
- **SDK không đổi định dạng link:** web mới chuyển hướng link cũ (§3).

## 14. Lịch và thứ tự cắt

Hôm nay là 22/11. Khoá tính năng 2/12, nộp bài 6/12. Có hai plan chạy song song:

- **Plan 7:** frontend Next.js.
- **Plan 8:** backend Supabase, email và keeper. Plan 8 thay Plan 5; phần Worker của Plan 5 không làm nữa.

| Ngày | Việc |
|---|---|
| 22/11 | Spec, Plan 7, Plan 8 |
| 23–24/11 | Nền tảng: khung Next.js, token, font, motion, shell, ví, i18n, spike Web Worker; khung Supabase, schema, logic thuần |
| 24–28/11 | Các trang (song song): trang chủ, tạo vault, vault, ký, proof, verify. Song song: `tick`, email, keeper |
| 28–30/11 | `/me`, `/join`, email UI, status, developers, privacy; e2e, a11y, Lighthouse; build deweb |
| 30/11 | Người dùng làm các bước §15; deploy thử |
| 1/12 | E2E Drill trên mainnet, keeper tự chạy, email thật; chuyển đổi, xoá web cũ |
| 2/12 | Khoá tính năng |

**Thứ tự cắt khi trễ** (cắt từ trên xuống):

1. Trang `/dev/` xem thử thành phần
2. Ảnh OG riêng từng trang (giữ một ảnh chung)
3. Email `drill-summary` và `distributed`
4. Hero WebGL (giữ sợi chỉ SVG có animation)
5. `/me` qua Supabase (giữ quét chain)
6. Phản hồi xúc giác và hiệu ứng trục font

**Không bao giờ cắt:**

- tạo vault, trang vault cho cả ba vai trò, trang ký với whitelist;
- proof trực quan, verify vault;
- email báo động và nhắc check-in, keeper;
- hai bản build vercel và deweb, chuyển hướng link cũ;
- WCAG AA;
- cỗ máy thời gian.

## 15. Việc của người dùng

1. **Mua domain.** Claude kiểm trước các tên còn trống bằng RDAP; người dùng tự mua.
2. **Vercel:** tạo tài khoản, import repo, đặt root `apps/web` và biến môi trường theo README của app, gắn domain.
3. **Supabase:**
   - tạo project ở khu vực Singapore;
   - bật extension `pg_cron` và `pg_net`;
   - đặt secret `RESEND_API_KEY`, `CRON_SECRET`, `KEEPER_KEY`, `OPS_EMAIL`;
   - chạy migration và deploy function theo lệnh trong README backend.
4. **Resend:** tạo tài khoản, thêm domain gửi thư, thêm bản ghi DNS SPF/DKIM, tạo API key.
5. **Ví keeper:** tạo một ví mới chỉ để trả gas, nạp khoảng 0,02 OKB (keeper dừng khi còn dưới 0,005), tự đặt khoá vào secret `KEEPER_KEY`. Claude không bao giờ thấy khoá này.
6. **Duyệt bằng mắt:** xem bản deploy thử trên điện thoại thật (OKX App) ngày 30/11.

## 16. Ruling

| # | Quyết định | Vì sao | Giá nếu sai |
|---|---|---|---|
| 1 | Next.js static export, chain là nguồn sự thật | Giữ "verify, don't trust" và DeWEB 100% on-chain, thứ đối thủ khó bắt chước; UI không bị giới hạn | Mất SSR và OG động; thêm route server trên Vercel sau mà không đổi app |
| 2 | Supabase + Resend thay Cloudflare Worker + D1 + Telegram | Người dùng chọn stack. Email đến được người thừa kế không dùng Telegram | Mất kênh Telegram mà dân crypto quen; thêm lại là P1 |
| 3 | Tham số động sau `#` (`/vault/#addr`) | Static export không dựng sẵn được mọi địa chỉ; dữ liệu không rời trình duyệt | URL kém đẹp hơn path; đổi được bằng rewrite trên Vercel sau |
| 4 | Fraunces + Inter + JetBrains Mono, tự host | Có cá tính, hỗ trợ tiếng Việt, OFL, có trục variable để animate | Đổi font chỉ là đổi token |
| 5 | Dark mặc định | Hợp ý tưởng sợi chỉ vàng trong đêm; khi quay video nổi bật hơn | Người dùng chọn light vẫn có đủ |
| 6 | Tailwind v4 + Radix, không dùng bộ UI có sẵn | Nhanh mà vẫn thiết kế riêng hoàn toàn; Radix cho accessibility chuẩn | Thêm thời gian dựng thành phần |
| 7 | TanStack Query cho đọc chain | Cache, retry, refetch đúng chuẩn, ít bug tự viết | Khoảng 13 kB gzip |
| 8 | Giữ lớp ví tự viết, không wagmi hay RainbowKit | Lớp hiện có đã test với OKX; modal kết nối tự thiết kế | Phải tự lo các ví lạ |
| 9 | Không xác minh vai trò khi đăng ký email; chỉ double opt-in | Dữ liệu vault vốn công khai; double opt-in chặn spam | Người lạ có thể theo dõi vault, nhưng chỉ thấy cái vốn công khai |
| 10 | Edge Function viết bằng Web API, bundle bằng esbuild, test trên Node | Máy này không có Docker hay Deno; vẫn test được đầy đủ | Khác biệt nhỏ Deno/Node chỉ lộ ra khi deploy; giảm rủi ro bằng chỉ dùng Web API |
| 11 | Visual regression tự động để P1; mỗi PR giao diện đính ảnh để duyệt | Baseline phụ thuộc hệ điều hành; duyệt bằng ảnh thật bắt lỗi thẩm mỹ tốt hơn | Lỗi giao diện lặp lại có thể lọt giữa hai lần duyệt |
| 12 | Bỏ GitHub Pages, giữ Vercel và DeWEB | Hai nơi đủ; bớt một bản phải bảo trì | Nếu Vercel bị chặn thì còn DeWEB |
| 13 | Plan 8 thay Plan 5 | Cùng mục tiêu (chỉ mục, thông báo, keeper) trên stack mới | Phần Worker đã viết trong plan cũ bị bỏ (chưa có mã) |
| 14 | Preact sang `apps/web-legacy`, Next.js ở `apps/web` ngay từ task đầu | Đường dẫn cuối có sẵn; CI và script sửa một lần; bản cũ vẫn được test tới lúc xoá | Hai app cùng chạy CI trong khoảng một tuần, CI chậm hơn |
| 15 | Turbopack (mặc định của Next 16) cho build và dev | Spike ở Plan 7A Task 2: worker module nạp `@atropyle/sdk/verify` và một chunk lười của chính nó dưới CSP `worker-src 'self'` trong Chromium | Bản Next sau làm hỏng worker hoặc font thì đổi `BUNDLER_FLAGS` sang `--webpack`, một dòng trong `scripts/lib/run-next.ts` |
| 16 | Làm đậm ba token light: `thread #86590E`, `alive #106F5A`, `grace #945100`; thêm `on-thread`, `on-danger`, `line`, `line-strong` | Giá trị ban đầu không đạt 4,5:1 trên `surface-3`; sau khi đổi, nhỏ nhất là 4,60:1 (light) và 5,50:1 (dark), test `contrast.test.ts` giữ ngưỡng | Vàng light hơi trầm hơn bản phác; đổi lại chỉ là sửa token, test chặn mọi giá trị không đạt AA |

## 17. Rủi ro

- **Next 16 + Turbopack + Web Worker và `output: 'export'`:** spike ở task đầu. Không ổn thì build bằng webpack (`next build --webpack`).
- **Edge Function giới hạn CPU và thời gian:** `tick` có ngân sách 50 giây, chia nhỏ việc, ghi cursor sau mỗi khối.
- **Email vào spam:** domain riêng có SPF, DKIM và DMARC; nội dung thuần, ít link; test với Gmail và Outlook ngày 30/11.
- **Thời gian:** mười ngày cho cả frontend lẫn backend. Hai plan chạy song song bằng subagent, có thứ tự cắt ở §14.
- **Deep link OKX App:** chưa xác minh định dạng. Chưa xác minh thì chỉ hiện QR và link thường.

## 18. Nâng cấp vượt mức tham chiếu (23/11)

Người dùng yêu cầu UI và UX "phải đạt level trên cả" ba trang hiresyncly.site, probarion.xyz và vestiarion.xyz, và "hãy tham vọng một cách vô lý". Mục này gộp đề xuất của bốn góc nhìn (kể chuyện, tương tác, niềm tin, hình ảnh) thành **một** nâng cấp, phục vụ đúng một ý tưởng: Sợi chỉ và Cánh cổng (§4.1). Bản này (bản 2) đã xử lý 13 điểm chặn của phản biện (bảng ở §18.3.1). Mục này sửa §4, §5, §6, §11, §14 và §15. Chỗ nào mâu thuẫn với các mục trước thì §18 thắng.

**Giá:** thêm 8,5 L-tương-đương (trong đó 0,75 là viết lại văn bản plan ở mức mã), cắt 4,0 việc đã lên plan, nên phần tăng ròng là **4,5** (S = 0,25, M = 0,5, L = 1). Con số này vượt mục tiêu 4,0 nửa task. Phần vượt được trả bằng thứ tự rơi có mốc kiểm (§18.5), có thể giải phóng tới 2,25.

- **Đường găng 7A** chỉ thêm 1,0 (Task 7: 0,5; Task 9: 0,25; Task 15: 0,25) và bớt các trang gallery.
- **Số task:** 7A giữ 15 task, 7B giữ 12. 7C có 13 task: Task 5 (WebGL) bị cắt và chỗ của nó dành cho Task 5′ "Hỏi circuit"; Task 7 tách thành 7a và 7b.
- **Không task nào nhận thêm quá M+S.** Chỗ nào vượt thì đã tách thành run riêng.

Tên ba trang tham chiếu chỉ xuất hiện trong tài liệu này, không bao giờ trong chữ giao diện.

### 18.1 Mức sàn: ba trang tham chiếu làm tốt gì, thiếu gì

| Trang | Làm tốt (mức sàn ta phải vượt) | Thiếu (chỗ Atropyle vượt) |
|---|---|---|
| **Syncly** (hiresyncly.site) | Hero minh hoạ lớn trong khung bo góc, kèm pill "Live on mainnet". Các phần đánh số bằng eyebrow mono. "How it works" là bốn thẻ dính chồng nhau, mỗi thẻ có minh hoạ HTML trên giấy kẻ ô. Có câu chuyện khách hàng thật, bộ đếm live, nhật ký quyết định. Mega menu chia nhóm. | Hero là tranh raster, chỉ để trang trí. Trên mobile, lần vẽ đầu là màn hình kem trống hơn 3 s. Chỉ có theme sáng. Bố cục đánh số giống mọi trang cùng thể loại. Bằng chứng chỉ là con số. Không có cảm xúc. |
| **Probarion** (probarion.xyz) | Banner trung thực ở đầu trang (beta, testnet, "known gaps"). Hai thẻ biên lai: một khoản thật trên mainnet, một khoản bị chặn. So sánh ✗/✓. Thẻ mã struct, trường "không tồn tại" bị gạch. Playground live: chọn kịch bản tấn công, xem "Allow"/"Blocked" kèm JSON thô và block. 78 SVG inline, không ảnh. | Playground chạy trên testnet, mỗi lần hỏi một câu. Banner trỏ tới một danh sách chung chung. Chỉ có theme sáng. Không có người đọc thứ hai. |
| **Vestiarion** (vestiarion.xyz) | Hero cobalt tràn viền, kèm câu trấn an ("shadow mode, không cần ví"). Giao diện sản phẩm dựng bằng HTML, không phải ảnh chụp. Bản ghi quyết định ba bước: agent quyết, code giữ, người duyệt. Timeline bằng chứng có nút "Check its signature". | Mỗi nút chỉ kiểm một chữ ký. Trang nạp Google Tag Manager (tracker). Chỉ có theme sáng. Mỗi lần chỉ kể một hoá đơn, không kể một vòng đời. |

**Điểm chung của cả thể loại:** giọng biên tập sáng màu, chữ dẫn dắt, eyebrow mono đánh số, biên lai on-chain làm bằng chứng, nút "tự kiểm", lời nói thật về bản beta, playground live, chuyển động tiết chế (reveal, thẻ dính). Không trang nào dùng canvas hay WebGL, không trang nào dark-first, và không trang nào chạm tới một chủ đề có cảm xúc.

**Mức của Atropyle**, đo bằng ba mốc mà giám khảo sẽ trải qua:

1. **10 giây (hero).**
   - Hình hero là chính circuit trả lời ba câu hỏi: "nếu tôi vẫn điểm danh", "nếu tôi im lặng", "nếu giám hộ nói dối trong khi tôi vẫn điểm danh". Tất cả là CSS thuần, prerender, chạy được khi tắt JS.
   - Một cú bấm hỏi thẳng processor của X Layer (`cpu.step` qua `eth_call` tới hai nhà vận hành) và in "X Layer, block N: giống trang này".
   - Dòng bằng chứng trên đầu trang: luật đóng băng trong netlist `0x7016…3864`, chưa kiểm toán, có link tới các giới hạn.
   - Dải fact: tài sản ở yên trong ví; chạy trên mainnet từ 22/11/2026.
2. **60 giây (trang chủ).**
   - Mỗi cảnh được đề ngày trong một đời người.
   - Thanh kéo chính là sợi chỉ.
   - Có hồ sơ một Drill thật trên mainnet, từ lúc tạo tới lúc chia tài sản, nếu maintainer đã chạy nó.
3. **5 phút (Drill).**
   - Người xem diễn tập sự vắng mặt của mình trên mainnet, khoảng 6 phút, không phí, chỉ trả gas.
   - Họ xem vault được dệt dần, nhấn giữ để thắt nút qua các pha trung thực, và nhìn sợi chỉ sờn đúng lúc tới hạn.
   - Họ đọc lá thư người thừa kế sẽ nhận ngay từ ví của mình, rồi in lá thư đó cho gia đình.

Thêm vào đó, `/proof/` kết thúc bằng hai hàng keccak theo cụm, một chứng nhận chép được, và mục "Proof này phủ gì, không phủ gì".

### 18.2 Nguyên tắc

1. **Một nhân vật.** Mọi nâng cấp được nhận phải làm một trong ba việc: vẽ Sợi chỉ, đưa nó qua Cánh cổng, hoặc chứng minh Cánh cổng. Ý nào không làm được việc nào thì bị loại, dù hay đến đâu.
2. **Hình là dữ liệu, dữ liệu là bằng chứng.**
   - Hero là netlist được tính trên ba đầu vào.
   - Sợi chỉ của mỗi vault sinh từ địa chỉ của nó.
   - Các mốc trên sợi chỉ nằm đúng thời gian tuyến tính.
   - Không có ảnh trang trí.
3. **Đo, đừng tuyên bố.** Mọi con số trên trang đều import từ hằng sinh ra hoặc được một test tính:
   - "khoảng 6 phút" do `computeTimeline` tính, cộng hai lượt keeper;
   - số cổng và lớp của circuit lấy từ `netlist-geometry`;
   - 67.108.864 là `TOTAL_CASES`;
   - ngày lên mainnet được buộc vào `factoryBlock`.
   - Không chữ số nào được gõ tay.
4. **Nói rõ chỗ bảo đảm dừng.** Bằng chứng nào cũng đi kèm giới hạn của nó, và mỗi giới hạn có cách tự bảo vệ.
5. **Người đọc thứ hai là người thừa kế.** Họ có thể đang có tang, có thể không biết crypto, có thể chỉ đọc tiếng Việt. Màn hình của họ là chỗ đẹp nhất của sản phẩm.
6. **Lần vẽ đầu là bố cục cuối.** Mọi thứ quan trọng đều prerender. JS chỉ thêm tương tác, và chỉ nạp khi người xem thật sự có ý định dùng (R18.18), không bao giờ trong cửa sổ đo của Lighthouse.
7. **Ba giọng chữ:** sản phẩm nói (Proclaim), con người nói (Letter), chain nói (Ledger). Chữ đọc từ chain chỉ xuất hiện ở giọng Ledger, nên ranh giới "không tin cậy" nhìn thấy được bằng mắt.
8. **Không UI nào nói "đã xong" trước receipt.** Nhấn giữ chỉ là ý định. Xác nhận là việc của chain.
9. **7A gọn.** Plan 7A chỉ nhận những gì mọi trang cần: engine sợi chỉ có trục thời gian, theme night, dòng bằng chứng. Mọi thứ khác nằm ở task đầu tiên dùng nó.
10. **Một run, một agent.** Không task nào nhận thêm quá M+S. Văn bản plan được viết lại ở mức mã trước khi giao, không bao giờ "mã cũ cộng đoạn sửa bằng lời".

### 18.3 Các nâng cấp được nhận

| # | id | Là gì | Task sở hữu | Giá | Test chính |
|---|---|---|---|---|---|
| 1 | `thread-engine` | Sợi chỉ chỉ chuyển động trên compositor: lớp SVG gốc, `RevealWindow`, lớp HTML cho điểm "bây giờ", nút, cổng và cột. `preserveAspectRatio="none"` cộng `vector-effect: non-scaling-stroke`. Trục thời gian `courseX`. Nhịp đập nhanh dần khi gần hạn. Prop `predicted`, `pendingKnot`, `highlight` | 7A T7 | M (0,5) | `thread-layers.test.tsx`; `courseX` trong `thread-geometry.test.ts` |
| 2 | `honest-frame` | Night là mặc định, vellum là chất liệu theo phạm vi. Dòng bằng chứng (của riêng ta, không phải banner). Chữ hero "khoảng 6 phút, không phí, chỉ gas". Footer "Known limits · No trackers · No cookies". Sửa snapshot View Transition. Header đặc trên mobile. Wordmark là sợi chỉ qua vòm cổng. E2E đổi theme bằng lựa chọn đã lưu; test tắt JS; spy View Transition | 7A T9, T15 | S+S (0,5) | `theme`, `proof-line`, `drill-minutes.test.ts`, `nojs.spec.ts`, spy trong `motion.spec.ts` |
| 3 | `voices` | Giọng Proclaim và Ledger, bậc chữ `monument`. Fraunces đổi file `full` sang `standard` (wght + opsz): bản latin preload giảm từ 121 xuống 67 kB. `Address` ở giọng Ledger, chữ hoa checksum đậm hơn, chuỗi hiển thị `aria-hidden` cộng chữ ẩn cho trình đọc màn hình | 7B T1 | S | `fonts.test.ts` (SHA-256), `address.test.tsx` (casing và axe sạch) |
| 4 | `wallet-mirror` | Mỗi bước ký có hộp "Ví của bạn phải hiện …". Giải mã từ calldata theo loại tài sản lấy từ danh sách tài sản của vault: ERC-20, ERC-721, `setApprovalForAll`, thu hồi | 7B T3 | S | `tx-card`: summary nói dối nhưng hộp vẫn đúng; thử 721, 1155 và thu hồi |
| 5 | `receipt` | Trạng thái xong của `TxCard` thành `Receipt`: câu thường; "Circuit đã quyết: A → B"; block; giờ chain; tx theo cụm 4; OKLink; một khe `footer` | 7B T3 | S | `StateChanged` hiện thành hai `StateBadge` |
| 6 | `scrubber` | Cỗ máy thời gian kéo trên chính sợi chỉ (trục thời gian). Có detent; PageUp/PageDown nhảy mốc; một vùng live đọc khi đổi mốc. `ScenarioOptions` cho thời điểm xác nhận, bỏ phiếu, quay lại và chặn; thêm hai kịch bản `returns` và `recoverBlocked`. Loader import thẳng `time-machine` | 7B T5 | M | `detent.test.ts`, `time-machine.test.ts` (giá trị mặc định không đổi), `time-machine-ui` |
| 7 | `vault-thread` | Mỗi vault có sợi chỉ riêng (`threadSignature`). Cột giám hộ ở cổng (`posts`: n cột, thanh ngang phủ k, cột sáng theo số xác nhận). Năm token màu nhánh đạt ≥ 3:1 | 7B T6 | M | 1.000 địa chỉ có seed; thêm dòng vào test tương phản |
| 8 | `loom-preview` | Xem trước của wizard là vault đang được dệt. Mobile có dải 72 px dính đáy, ẩn khi một ô nhập đang focus. Sau khi prepare, sợi chỉ nhận chữ ký của chính vault | 7B T7 | M | `create-wizard`; e2e: dải không che ô nhập nào |
| 9 | `living-vault` | Refetch đúng lúc tới mốc. Trạng thái `predicted` được gọi tên bằng chữ. Header dùng trục thời gian, chữ ký và cột giám hộ (không vẽ nút `CheckedIn`). Lịch sử ghi "Circuit đã quyết". `standingSentence` cho chủ ví và khách | 7B T9 | M | `standing.test.ts`, `boundary.test.ts` (fake timers), chip trong lịch sử |
| 10 | `knot-ritual` | Nhấn giữ là nạp lại thời gian cho sợi chỉ. Các pha `holding`, `wallet`, `sent`, `tied`; `tied` chỉ có khi có receipt. `HoldButton` thêm `doneLabel`, `showKnot`, `onHoldStart`. Chữ cho Drill tính từ timeline của chính vault | 7B T10 | M | `owner-tab`: không "Confirmed", không nút thắt trước receipt |
| 11 | `heir-letter` | Lá thư người thừa kế thành lá thư thật trên vellum, giọng Letter (Fraunces Italic `standard`). Câu mở theo trạng thái. Chữ ký là lần điểm danh cuối. Nhánh của người đọc sáng lên. Giữ để nhận, trung thực | 7B T11 | M | `heir-letter`: câu mở, `highlight`, ngày của chữ ký; không "Confirmed" trước receipt |
| 12 | `proof-ending` | Hai hàng keccak theo cụm. "Copy certificate" (8 dòng). Wake Lock. Mục `#limits`. Viết lại P8. Lệnh `cast call` | 7C T3 | S | `certificate.test.ts`, `proof-view` (anchor `#limits`), thêm `/proof/` vào `nojs.spec.ts` |
| 13 | `hero-loom` | Warp tràn viền sau hero. Bỏ eyebrow. Dải fact (tài sản ở yên trong ví, ngày lên mainnet). Cửa vào cho người thừa kế | 7C T4 | S | test build, test tắt JS, keccak của repo bằng keccak của deployment |
| 14 | `ask-the-circuit` | Ba chip radio thắp các dây mang giá trị 1 (path tách theo chữ ký giá trị, không thêm chuỗi `d`). Lượt quét chạy theo độ sâu khi đổi chip. Nút "Ask X Layer" gọi `eth_call` thô `cpu.step` tới hai nhà vận hành. Tiêu đề được dệt bằng đơn vị `lh` | 7C T5′ (chỗ của T5) | M+S (0,75) | `hero-eval.test.ts`, `ask.test.ts` (fetch giả), calldata bằng viem, test build, smoke chỉ đọc trên mainnet ghi trong PR |
| 15 | `home-recut` | Cảnh đề ngày trong một đời người, số lấy từ `scenarios()`. Hai đoạn lặng. Cảnh kết là cánh cổng. Cột sống là đường CSS có nút HTML. Băng agent tĩnh. Nạp theo ý định, có kiểm bằng Lighthouse | 7C T6, T7a | S+S (0,5) | `sim.test.ts` gọi `scenarios()` với `ScenarioOptions`; Lighthouse không thấy chunk SDK, circuits hay time-machine trên `/` |
| 16 | `witness` | "Một đời, có hồ sơ": một Drill thật trên mainnet chạy từ ví mới, ghi vào `witness.json` có khối `untrusted`, `blockHash` và `logs`, prerender trên cột sống. Link "Không có ví? Xem một Drill đã ghi" | 7C T7b | M+S (0,75) | schema; test build "chữ untrusted chỉ nằm trong `[data-untrusted]`"; không có file thì không có scene |
| 17 | `heir-preview-print` | Chủ ví bấm "See what heir N sees" để xem lá thư của người đó, mọi hành động bị tắt. Bản in của chính lá thư đó (A4, QR tới `/verify/#vault`, câu an toàn) là lá thư cho gia đình | 7C T9 | M | preview không render `TxCard` hay `ActionFlow` nào; `page.pdf()` ra một trang; không đổi URL hay storage |
| | | Viết lại văn bản plan ở mức mã (7A T7, T9, T15 trước khi giao; 7B T3, T5, T10, T11 và 7C T4, T5′, T6, T7a, T7b, T9 lúc giao) | controller | M+S (0,75) | |
| | | **Tổng thêm** | | **8,5** | |
| | | **Cắt (§18.5)** | | **−4,0** | |
| | | **Tăng ròng** | | **4,5** | |

#### 18.3.1 Phản biện chặn → cách xử lý

| Điểm chặn | Xử lý | Ở đâu |
|---|---|---|
| `intent-loading-tbt` | Chỉ nạp khi có `pointerdown`, `keydown` hoặc `focusin` trong cảnh. Ngoài ra có một observer `rootMargin 0`, chỉ được bật sau `wheel`, `touchmove` hoặc phím cuộn thật đầu tiên (Lighthouse không gửi những event này). Loader import thẳng `@/flows/impl/time-machine`. Lighthouse khẳng định không chunk SDK, circuits hay time-machine nào được tải trên `/` | 7C T6, 7B T5 (loader), R18.18 |
| `scenario-days-mismatch` | `ScenarioOptions { confirmAt, votesAt, returnAt, blockAt }`. Giá trị mặc định giữ đúng số hiện tại. Thêm hai kịch bản `returns` và `recoverBlocked` | 7B T5, 7C T6 |
| `thread-time-axis` | `ThreadInput.axis` cùng `courseX(t, axis)` tuyến tính. Header không vẽ nút `CheckedIn`, `HistoryThread` có trục riêng. `preserveAspectRatio="none"` cộng `non-scaling-stroke`. Cổng, cột và chấm là HTML. Gốc có `overflow: clip`. Cột sống là đường CSS | 7A T7, R18.5 |
| `holdbutton-false-confirm` | `HoldButton` thêm `doneLabel?: string \| null` và `showKnot?: boolean`. Nghi thức và nút nhận truyền `showKnot={false}` kèm câu "Now sign in your wallet". Có test cho cả hai | 7B T10, T11, R18.16 |
| `mirror-nft-approvals` | Giải mã theo loại tài sản lấy từ danh sách tài sản của vault, khớp theo `to` (cùng luật với `atro.handoff.inspect`). Có dòng cho 721, cho `setApprovalForAll` (kèm dòng `danger`) và cho thu hồi | 7B T3, R18.8 |
| `address-aria-label` | Các đoạn chữ hiển thị mang `aria-hidden`, địa chỉ nằm trong `VisuallyHidden` của cùng phần tử. Có một ca axe sạch trong `address.test.tsx` | 7B T1 |
| `critical-path-7a` | 7A chỉ giữ `thread-engine` (có trục), theme và dòng bằng chứng. Mirror và receipt sang 7B T3. `stats-checkpoint` bị đẩy xuống P1. Specimen bị cắt, gallery bị xoá. T7 và T9 được viết lại ở mức mã trước khi giao | §18.4.1 |
| `hero-loom-weave` | Gắn class cho các path dây, không thêm chuỗi `d`. Sợi chỉ của tiêu đề chạy *sau* chữ, và chỉ nổi lên phía trước ở một cửa sổ trong khoảng leading dưới dòng 1, đặt bằng đơn vị `lh`, nên không bao giờ thành nét gạch ngang. Duyệt ảnh EN và VI ở 390 và 1440 | 7C T5′, R18.20 |
| `hero-sim-days-order` | `HERO_BASE` và `HERO_STATES` được định nghĩa trong 7C T5′ từ `PRESETS.sixMonths`. Ca `silent` là `grace`, báo động đã bật, cửa sổ đã qua, k xác nhận. `sim-days` của T6 import `HERO_BASE` | 7C T5′, T6 |
| `drill-minutes-claim` | Test dùng `computeTimeline` trên Drill không giám hộ, cộng 2 lượt keeper, ra 6 phút. Chữ là "about 6 minutes · No Atropyle fee, only network gas". Nghi thức dùng mốc nhận sớm nhất trong timeline im lặng của vault và nêu rõ điều kiện về giám hộ | 7A T9, 7B T10, R18.11 |
| `honesty-strip` | Thay bằng dòng bằng chứng: "Rules frozen in netlist 0x7016…3864 on X Layer · unaudited · limits →". Bản mobile ≤ 36 ký tự, VI viết hoa đầu câu, không lặp fact của hero | 7A T9, R18.7 |
| `witness-file-safety` | `witness.json` sinh bằng `JSON.stringify`. Chữ đọc từ chain nằm trong khối `untrusted` và chỉ render qua `UntrustedText`. Mỗi bước có `blockHash` và `logs[]`. Test build kiểm điều đó | 7C T7b, R18.6 |
| `overloaded-runs-7c` | 7C T4 (warp) và T5′ (hỏi circuit) là hai run riêng. T7a (trang chủ) và T7b (witness, sau Drill của maintainer) cũng vậy | §18.4.3 |

Ý "còn thiếu" của phản biện được nhận: hỏi X Layer live từ chip hero, chip thứ ba cho kịch bản giám hộ nói dối, đường cho người không có ví, Fraunces `standard`, witness chạy từ ví mới, số liệu DeWEB chỉ đếm khi bấm, token màu nhánh, dải xem trước ẩn khi có bàn phím, checklist OKX App, danh sách cảnh quay cho video demo, và luật import hằng số. Ajv không cần nữa vì chứng nhận JSON bị đẩy xuống P1. Lý do từng ý nằm ở §18.6.

### 18.4 Thay đổi chi tiết theo task

#### 18.4.1 Plan 7A (đang chạy; mọi thay đổi dưới đây phải có trong văn bản plan trước khi task được giao)

**Trước khi giao Task 7:** controller viết lại văn bản của Task 7, Task 9 và các bước đổi của Task 15 thành bước ở mức mã, kèm test đã sửa. Mã cũ bị đảo ngược (`m.path animate={{ d }}`, nhánh bắt đầu ở `M400 60` cố định, `backdrop-blur` trên mobile) phải biến mất khỏi văn bản, không chỉ được ghi chú bên cạnh.

**Task 7, `thread-engine` (M).**

*Hình học* (`src/thread/geometry.ts`, thuần, có test):

- Giữ `VIEW`, `waveY`, `smoothPath`, `waveSegment`, `branchWidths`, `branchEnds` và các test cũ của chúng.
- Mới:
  - `interface ThreadAxis { from: bigint; to: bigint; now: bigint; alarmAt?: bigint | null; releaseAt?: bigint | null; marks?: readonly bigint[] }`;
  - `courseX(t: bigint, axis: ThreadAxis): number`: trừ bằng bigint rồi mới đổi sang number; kẹp vào [0, `VIEW.w`]; khi `from = to` thì trả 0.
- `ThreadInput.axis?: ThreadAxis`. Khi có axis:
  - điểm "bây giờ" ở `courseX(now)`;
  - phần sáng chạy từ "bây giờ" tới `alarmAt` (ở `active`) hoặc tới `releaseAt` (ở `grace`);
  - sờn bắt đầu ở `courseX(alarmAt)`;
  - cổng ở `courseX(releaseAt)`, mặc định `GATE_X`;
  - nút ở `courseX(marks[i])`.
- Không có axis thì giữ hành vi `remaining` như plan.
- y của cổng là `waveY(gateX)`, không giả định bằng `mid`. Nhờ vậy 7B T6 thêm chữ ký mà không phải sửa cổng.
- Prop mới:
  - `predicted?: boolean`: phần sau "bây giờ" (sợi sờn ở `grace`, các nhánh ở `releasedInherit`) vẽ nét đứt, nghĩa là "luật dự đoán, chain chưa ghi";
  - `pendingKnot?: boolean`;
  - `highlight?: number`: nhánh này dùng `thread`, các nhánh khác dùng `ink-muted` 35 %.
- `ThreadGeometry` thêm `nowX`, `gateX`, `litFrom`, `litTo` (để lớp HTML đặt theo %) và `pending`.

*Vẽ* (`src/thread/thread.tsx`). Gốc là `div.relative` có `overflow: clip`; tỉ lệ khung do chỗ gọi đặt.

- (a) `<svg preserveAspectRatio="none">` vẽ track, ghost, fibers, nhánh và curl. Mọi `<path>` mang `vector-effect="non-scaling-stroke"`.
- (b) Phần sáng nằm trong `src/motion/reveal-window.tsx` (mới):
  - `RevealWindow({ from, to, children })`, tính theo %: ngoài `overflow: hidden` dịch bằng `translateX`, trong dịch ngược lại;
  - ref `setRange(from, to)` cho phép kéo mà không render React mỗi khung;
  - đổi range bằng transition `transform` theo `--ease-spring`, chỉ khi motion-safe;
  - lớp này **thay** `m.path animate={{ d }}`.
- (c) Quầng sáng là một `<svg>` gốc riêng. Nhịp chỉ animate `opacity` của chính `<svg>` gốc đó. `data-beat` theo phần còn lại: `slow` khi trên 50 % (2,4 s), `mid` từ 10 tới 50 % (1,6 s), `fast` dưới 10 % (1,0 s).
- (d) Lớp HTML gồm điểm "bây giờ", các nút, vòm cổng và chỗ trống cho cột (7B T6). Mỗi phần tử là `span` đặt bằng `left`/`top` theo %. Quầng dùng `radial-gradient`. Không `drop-shadow`, không filter SVG.
- Hiệu ứng rung của GRACE nằm ở `<svg>` gốc của lớp sáng. `shared` bọc gốc.

*Test:*

- `thread-geometry.test.ts` thêm:
  - `courseX` kẹp, đơn điệu, không chia cho 0;
  - có axis thì nút, "bây giờ" và cổng nằm đúng x;
  - `predicted` chỉ đổi kiểu nét.
- `thread-layers.test.tsx` (mới):
  - không lớp `animate-*` nào trên phần tử con của SVG;
  - đổi `remaining` hay `axis.now` không đổi `d` nào, chỉ đổi transform của `RevealWindow`;
  - không `filter`, không `drop-shadow`;
  - mọi path có `vector-effect`;
  - gốc có `overflow: clip`;
  - `highlight`, `pendingKnot`, `predicted` mỗi prop có `data-*` riêng.
- E2E `thread-pulse` vẫn phải thấy animation, giờ trên `<svg>` gốc của quầng.

*Không làm ở Task 7:*

- chữ ký và cột giám hộ: sang 7B T6;
- glyph nối thành một nét: P1;
- glyph `mark`: sang Task 9.

**Task 8 (bớt).**

- Xoá `src/app/dev/{page.dev,gallery}.tsx` và `test/unit/dev-gallery.test.tsx` (thứ tự cắt §14 mục 1). Không có trang specimen.
- Overlay của `Dialog`: dưới 48rem dùng `bg-bg/95`; từ 48rem dùng `bg-bg/70 backdrop-blur-[3px]`.
- `Address` giữ nguyên (giọng Ledger làm ở 7B T1).

**Task 9, `honest-frame` (S).**

1. *Night là mặc định:*
   - `theme.ts`: `DEFAULT_THEME = 'dark'`; `parseTheme(rác)` trả `'dark'`; `'system'` đặt `data-theme="system"`, `'light'` đặt `light`, `'dark'` gỡ thuộc tính.
   - `boot.ts` chỉ đặt thuộc tính khi giá trị đã lưu là `light` hoặc `system`.
   - `globals.css`:
     - block token sáng dùng selector `[data-theme="light"]`, nên khớp cả `:root` lẫn bất kỳ phần tử nào (vellum theo phạm vi, dùng cho lá thư và bản in), kèm `color-scheme: light`;
     - `tokens:light-system` thành `:root[data-theme="system"]`, vẫn nằm trong media query cũ;
     - các marker giữ nguyên, nên test tương phản không đổi.
   - Meta `theme-color` còn một giá trị, `#0b0d12`.
   - Nhãn `ThemeSwitch`: "Night" / "Vellum" / "Match device" (VI: "Đêm" / "Giấy da" / "Theo thiết bị").
   - Test đổi tên thành `a stored garbage theme falls back to night`.
2. *`src/config/facts.ts`:*
   - `POLICY_NETLIST_KECCAK`, đọc từ `deployments/xlayer.json` (`circuits.netlistKeccak.policy`);
   - `MAINNET_SINCE = '2026-11-22'`, có test khẳng định `factoryBlock === 76567034`. Deploy lại mà quên sửa ngày thì test hỏng;
   - `KEEPER_CADENCE_S = 60`, có test đọc lịch `pg_cron` trong `supabase/`.
3. *Dòng bằng chứng* (`src/shell/proof-line.tsx`): con đầu tiên của `Frame`, prerender, không tắt được, một dòng 24 px ở giọng mono cỡ caption.
   - Desktop: "Rules frozen in netlist `0x7016…3864` on X Layer · unaudited · limits →".
   - Mobile (≤ 36 ký tự): "Rules `0x7016…3864` · unaudited →".
   - VI, viết hoa đầu câu: "Luật đóng băng trong netlist `0x7016…3864` trên X Layer · chưa kiểm toán · giới hạn →"; mobile "Luật `0x7016…3864` · chưa kiểm toán →".
   - Keccak lấy từ `POLICY_NETLIST_KECCAK` và trỏ tới `/proof/`; "limits" trỏ tới `/proof/#limits`. Cả hai link có `prefetch={false}` cho tới 7C T3.
   - Test: hai bản đủ độ dài cho phép; keccak bằng giá trị của deployment.
4. *Chữ hero* (`home.messages`; giữ năm khoá, chỉ đổi chữ):
   - `heroLead`: "Nothing, unless you plan for it. Atropyle watches over your wallet on X Layer. Check in now and then. If you go quiet, the people you chose receive what you left them. Your tokens stay in your wallet until that day." Câu cũ "your guardians confirm" sai với vault không có giám hộ.
   - `heroDrill`: "Rehearse it in about 6 minutes"; VI: "Diễn tập trong khoảng 6 phút".
   - Khoá mới `heroDrillNote`: "No Atropyle fee. You pay only X Layer network gas, in OKB."
   - `drill-minutes.test.ts`: `computeTimeline(modelEngine(), drillNoGuardians, 0n)` cho mốc release; số phút = ⌈(release + 2 · `KEEPER_CADENCE_S`) / 60⌉, kỳ vọng ra 6 (báo động sau 120 s, cửa sổ 120 s, hai lượt keeper). Test buộc chữ số trong `heroDrill` (EN và VI) bằng số tính được; nếu SDK cho số khác thì chữ theo số đó, không sửa test.
5. *Footer:* "Known limits" (→ `/proof/#limits`); dòng "No trackers · No cookies" (lưới chặn request của e2e đứng sau dòng này); "For heirs and guardians" (→ `/verify/`).
6. *View Transition* (`globals.css`):
   - `::view-transition-old/new(atropyle-thread) { height: 100%; width: auto; object-fit: none; object-position: left center }`;
   - `::view-transition-image-pair(atropyle-thread) { overflow: clip }`;
   - `view-transition-name: site-header` và `site-footer`.
7. *Header:* dưới 48rem dùng `bg-bg/95`, `backdrop-blur-md` chỉ từ 48rem.
8. *Wordmark:* `GlyphName` thêm `mark` (một path: nét vàng vươn thành vòm rồi đi tiếp ra phía bên kia). `Wordmark` dùng glyph này.

**Task 11.** Xoá `wallet-gallery.tsx` và ca của nó trong test gallery.

**Task 13.** Xoá `tx-gallery.tsx` và ca của nó. Mirror và receipt **không** làm ở đây (đã sang 7B T3). Trạng thái xong của `TxCard` giữ như plan.

**Task 14.** Không đổi. `useStats` vẫn chỉ đếm chain khi người dùng bấm.

**Task 15.**

- `expectAccessibleInBothThemes` và `captureScreens` đổi theme bằng `KEYS.theme` trong `localStorage` rồi tải lại, không bằng `emulateMedia`. Lighthouse giờ đo theme night.
- `motion.spec.ts`: thêm một spy `document.startViewTransition` khi bấm một `Link` của nav. Nếu spy không được gọi (Quyết định 6 của 7A sai), viết `src/shell/nav-link.tsx` gọi `withViewTransition(() => router.push(href))` và dùng nó trong nav-list và footer.
- `nojs.spec.ts` (mới): mở `/` với `javaScriptEnabled: false`; H1, CTA, dòng bằng chứng và footer phải hiện. 7B T12 thêm `/verify/`, 7C T3 thêm `/proof/`.
- `scripts/lib/lighthouse-score.ts` xuất `forbiddenRequests(lhr, patterns)`, đọc từ audit `network-requests`. 7C T6 dùng nó.

**Mục `## Interfaces for Plan 7B` của 7A** cập nhật theo: `ThreadAxis`, `courseX`, prop `axis`/`predicted`/`pendingKnot`/`highlight`, `RevealWindow`, `facts.ts`, vellum theo phạm vi `[data-theme="light"]`, glyph `mark`, `forbiddenRequests`.

#### 18.4.2 Plan 7B

**Global Constraints (thêm):**

- *Ảnh chụp:* mỗi màn hình 3 ảnh (night EN 1440, night EN 390, night VI 390). Vellum chỉ chụp ở bề mặt vellum. `screens.ts` đổi theme bằng lựa chọn đã lưu.
- *Từ vựng* (R18.12):
  - EN: "check in" là động từ, "check-in" là danh từ; heir "receive"; "Drill" là tên riêng. Cấm "dead man's switch", "unlock", và "claim" khi nói với người thừa kế.
  - VI: "điểm danh"; "Drill" là tên riêng, lần đầu kèm "(bản diễn tập)"; release là "trao".
- *Giọng chữ:* chữ đọc từ chain chỉ ở giọng Ledger. Giọng Letter (italic) không bao giờ có trong lần vẽ đầu của `/`, `/create/`, `/proof/`.
- *Nút giữ:* `HoldButton` không bao giờ nói "Confirmed", và không hiện nút thắt, trước receipt (R18.16).
- *Số:* mọi số về circuit, số trường hợp hay số ngày đều import từ hằng sinh ra hoặc do một test tính (nguyên tắc 3).

**Task 1, `voices` (S).** Làm trước phần port, để mọi task sau của 7B dùng được.

- *Font:* đổi ba file Fraunces normal từ `full` sang `standard` (wght + opsz) của `@fontsource-variable/fraunces` 5.3.0:
  - latin: 121.016 → 67.304 B (file preload của LCP);
  - latin-ext: 105.244 → 59.388 B;
  - vietnamese: 34.308 → 19.700 B.
  - Sửa `src/fonts/index.ts` và SHA-256 trong `fonts.test.ts`. Tính lại số đo fallback theo đúng công thức mà test của 7A T4 đã kiểm.
  - Bỏ `"SOFT" 30` toàn cục. File `standard` không có trục SOFT/WONK.
- *`globals.css`:*
  - `.voice-proclaim`: Fraunces, `font-optical-sizing: auto`, wght 300–420, tracking −0,02em;
  - `.voice-ledger`: JetBrains Mono, `font-variant-numeric: tabular-nums`;
  - `--text-monument: clamp(4.5rem, 2rem + 12vw, 13rem)`; dưới `:lang(vi)` line-height ≥ 1,08.
- *`Address`:* giọng Ledger, cụm 4 ký tự cách bằng khe mảnh; chữ hex hoa (checksum) wght 650, chữ thường wght 400. Độ rộng ký tự mono không đổi giữa các độ đậm, nên không có layout shift.
  - Các đoạn hiển thị mang `aria-hidden`. Phần tử chứa có `VisuallyHidden` với đúng chuỗi mà `Address` của 7A vẫn đọc.
  - Không gắn `aria-label` lên `span` hay `div` không tương tác.
- *Test:*
  - `address.test.tsx`: casing; chuỗi ẩn; `axe-core` chạy trên một `Address` đã render và không có vi phạm nào (bắt `aria-prohibited-attr`);
  - `fonts.test.ts` (SHA-256 mới).

**Task 3, `wallet-mirror` và `receipt` (S+S).**

- `tx-view.ts` (thuần, không viem): `StepRow` thêm `value: bigint` và `approval: ApprovalRow | null`, trong đó:

  ```ts
  type ApprovalRow =
    | { kind: 'erc20'; spender: Address; amount: bigint; unlimited: boolean }
    | { kind: 'erc721'; spender: Address; id: bigint }
    | { kind: 'all'; operator: Address; on: boolean };
  ```

  - Loại tài sản lấy từ danh sách tài sản của vault (calldata `createVault` của plan, snapshot của vault, hoặc kết quả `atro.handoff.inspect` ở `/sign/`), khớp theo `to`. Không bao giờ lấy từ chữ đọc trên chain.
  - Selector `0x095ea7b3` cộng loại `erc20` thì là `erc20`. Selector đó cộng loại `erc721` thì là `erc721`. `0xa22cb465` là `all`.
  - Thu hồi: amount 0, `on = false`, hoặc spender là địa chỉ 0.
- `StepItem` của bước đang chờ ký có một hộp luôn mở, `${testId}-mirror-${i}`:
  > Your wallet should show: Network X Layer (196) · Interact with `<Address đủ 40 ký tự>` (the Atropyle factory | this vault | a token in this plan) · Function `<action>` · Sends `<value>` OKB · Approves `<N SYMBOL>` | `NFT #<id> of <collection>` | `ALL tokens of <collection>`.
  - `all` và approve vô hạn có thêm một dòng `danger`.
  - Dòng cuối, ở tone `danger`: "If your wallet shows anything else, reject it."
  - Vai trò của hợp đồng lấy từ deployment (`factory`, `feeTokens`) và vault của plan. Symbol và collection đi qua `UntrustedText` ở giọng Ledger.
  - Gửi bằng `wallet_sendCalls` thì hộp liệt kê mọi call của bó.
- *`src/tx/receipt.tsx` (`Receipt`)* thay banner "Done" cho mỗi bước đã xác nhận. Test id `${testId}-done` giữ ở phần bọc ngoài. Thứ tự nội dung:
  1. câu thường, là tiêu đề `ACTION_KEY`;
  2. "The circuit decided: `<StateBadge>` → `<StateBadge>`" khi event của bước có `StateChanged`;
  3. các trường mono: block, giờ chain (UTC và giờ địa phương), tx theo cụm 4, OKLink;
  4. khe `footer?: ReactNode`.
  - Với bó lệnh, event nằm ở bước cuối (`sentSteps`).
- *Test:*
  - mirror lấy hàm, địa chỉ và approve từ calldata kể cả khi `summary` nói khác;
  - một ca cho mỗi loại: 721 `approve`, 1155 `setApprovalForAll`, ERC-20 vô hạn, thu hồi;
  - `Receipt` vẽ hai badge.

**Task 4.** `/sign/` dùng hộp mirror của Task 3 cho mọi bước (không tốn thêm).

**Task 5, `scrubber` (M).**

- *`time-machine.ts`:*
  - `scenarios(engine, s, now, expiresAt, drill, opts?: ScenarioOptions)` với `interface ScenarioOptions { confirmAt?: bigint; votesAt?: readonly bigint[]; returnAt?: bigint; blockAt?: bigint }`. Không truyền gì thì ra đúng số như hiện tại, nên test cũ giữ nguyên;
  - `ScenarioId` thêm `'returns'`: như `confirm` tới lúc báo động, rồi chủ ví điểm danh ở `returnAt` (mặc định: báo động cộng nửa kỳ), rồi tiếp phần im lặng;
  - và `'recoverBlocked'`: phiếu khôi phục rồi chủ ví điểm danh ở `blockAt` (mặc định: phiếu cuối cộng 1 s);
  - hai kịch bản mới nối vào sau ba kịch bản cũ;
  - `time-machine.ts` không import gì từ `./index`.
- *`src/flows/time-machine/load.ts`:* `loadTimeMachine = () => import('../impl/time-machine')`. Đây là đường nạp mà 7C T6 dùng.
- *`src/flows/time-machine/scrubber.tsx`:*
  - dựng trên `ui/slider` với `track={<Thread axis={…} />}`; thumb được vẽ như điểm "bây giờ";
  - các mốc là nút đặt tại `courseX(m.at)`;
  - khi kéo, rAF ghi vào `RevealWindow.setRange`;
  - `detent.ts` (thuần): `snapToMoment(value, moments, span)` hút về mốc khi cách dưới 2 % độ dài, có khoảng cách tối thiểu cho các độ dài chỉ tính bằng phút của Drill.
- *Phím:* PageUp/PageDown nhảy tới mốc trước hoặc sau; Home/End giữ như Radix.
- *Accessibility:* `aria-valuetext` có dạng "In 6 months, 22 May 2027: the alarm goes off". Caption bỏ `aria-live`; một vùng `polite` riêng chỉ đọc khi mốc đổi.
- *UI:* chip "Silent / Guardians confirm / Recovery", cộng một công tắc "I check in again". Công tắc đổi `confirm` thành `returns` và `recover` thành `recoverBlocked`.
- *Test:*
  - `time-machine.test.ts`: số mặc định không đổi; có ca `returns` và `recoverBlocked` với options truyền vào;
  - `detent.test.ts`;
  - `time-machine-ui` (PageUp/PageDown; vùng live đọc một lần mỗi mốc).

**Task 6, `vault-thread` (M).**

- *`geometry.ts`:*
  - `threadSignature(address): { f; phase; w }[]` lấy 6 byte của địa chỉ (chữ thường) sinh 3 hoạ âm: f trong 1,5–4 chu kỳ trên `VIEW.w`, phase trong [0, 2π), tổng các w bằng 1, có kẹp để nút không chen nhau gần cổng;
  - `waveY(x, sig?)`: không có `sig` thì ra đúng giá trị cũ;
  - `ThreadInput.signature?: string`;
  - `ThreadInput.posts?: { n; k; lit }` là HTML ở cổng: n cột, một thanh ngang phủ k cột, `lit` cột tô đặc.
- *Token* `--atro-branch-1..5` (5 = `LIMITS.maxHeirs`): nhánh 1 là `thread`; mỗi token đạt ≥ 3:1 trên mọi bề mặt ở cả hai theme. Thêm các dòng này vào test tương phản của 7A T3.
- `ShareSplitter` tô từng đoạn bằng đúng token đó và độ dày `branchWidths`.
- *Test:*
  - 1.000 địa chỉ có seed: mọi mẫu nằm trong dải; nút nằm trên sóng có chữ ký; y của cổng nằm trong dải; kết quả tất định và không phân biệt hoa thường;
  - `posts` với n từ 0 tới 5, k ≤ n, lit ≤ n.

**Task 7, `loom-preview` (M).**

- `preview.tsx`: `PreviewBody` là một `Thread` ở chế độ trục, các mốc tính bằng `computeTimeline` trên `planEvalState`:
  - `branches` là bps của từng người thừa kế, vẽ ở trạng thái `releasedInherit` với `predicted` (nét đứt);
  - `posts` là n và k;
  - bật khôi phục thì có thêm lối ra nét đứt;
  - một chip số tài sản;
  - nhãn trục: "every 60 s" cho Drill, "every 6 months" cho vault thật.
- Danh sách chữ hiện có giữ lại làm mô tả accessible. SVG là `aria-hidden`, cộng một nhãn `role="img"`.
- Khi `wizard.state.vault` có giá trị (đã prepare): `signature={vault}` cùng câu "This is your vault's thread. Your heirs will see the same one." Câu luôn dùng "will".
- Dưới `lg`:
  - một dải 72 px dính trên thanh hành động, đệm bằng `env(safe-area-inset-bottom)`; trang có đệm đáy bằng chiều cao dải;
  - dải ẩn khi `:has(input:focus, textarea:focus, [role="slider"]:focus)`;
  - bấm vào dải thì mở sheet có bản xem trước đầy đủ.
- Bỏ hiệu ứng `m.li`. Hình học được memo theo hash của form.
- *Test:*
  - `create-wizard`: số nhánh, n và k, chữ ký có sau prepare;
  - e2e 390 px: dải hiện, không che ô nhập nào, và ẩn khi focus.

**Task 9, `living-vault` (M).**

- `nextBoundary(status, chainNow)`: mốc tương lai gần nhất trong `lateAt`, `alarmAt`, `windowEndsAt`, `expiresAt`. `refetchInterval` = kẹp(mốc − bây giờ + 1,5 s, 1 s, nhịp thường).
- Qua mốc mà `status.pending !== status.state`:
  - sợi chỉ của header thành `predicted`;
  - câu "The rules now allow the alarm. Nobody has raised it yet." hiện ra, cùng nút Raise the alarm (luật 18 đã có);
  - khi `poke` của bất kỳ ai được xác nhận, câu thành "Alarm raised at block N".
- *Sợi chỉ của header:*
  - `axis = { from: lastAlive, to: mốc nhận, now: chainNow, alarmAt, releaseAt }`;
  - `signature={vault}`, cùng `posts` từ giám hộ, k và số xác nhận;
  - không có nút `CheckedIn`; `HistoryThread` vẽ nút trên trục riêng.
- Lịch sử gom theo tx hash. Tx nào có `StateChanged` thì dòng của nó ghi "Decided by the circuit: A → B" cùng hai `StateBadge`.
- `src/app/vault/standing.ts`: `standingSentence({ role, status, chainNow, lang })` trả `{ key, params }`, là dòng đầu của header, có ngày tuyệt đối theo giờ block.
  - Biến thể của chủ ví: active, grace (đã dự đoán / đã bật), recovery pending, released, Drill đã hết hạn.
  - Biến thể cho khách.
  - Người thừa kế có lá thư, giám hộ có tab riêng, nên không cần câu.
- *Test:*
  - `standing.test.ts`: bảng trạng thái × vai × ngôn ngữ;
  - `boundary.test.ts` (fake timers);
  - chip của `StateChanged`.

**Task 10, `knot-ritual` (M).**

- *`HoldButton` (7A) thêm:*
  - `doneLabel?: string | null`: `null` thì không đọc gì; chuỗi thì thay "Confirmed";
  - `showKnot?: boolean`, mặc định `true`;
  - `onHoldStart?(): void`, truyền vào `useHold`.
- `RitualPhase = 'idle' | 'holding' | 'wallet' | 'sent' | 'tied'`. Nghi thức truyền `showKnot={false}` và `doneLabel={t('ritualSign')}` ("Now sign in your wallet").
- Mặt nút chứa sợi chỉ của chính vault. Trong `holding`, `RevealWindow` chạy tuyến tính từ phần còn lại lên 1 trong `HOLD_MS` (chỉ khi motion-safe). Thả sớm thì nảy về.
- `wallet`: `pendingKnot`. `sent` (có hash, chưa có receipt): "Waiting for X Layer · 0.8 s", đo ở client.
- `tied`, chỉ khi có receipt:
  - nút đặc lại, rung 12 ms;
  - `Receipt` có câu "Tied at block 1,234,567 · 1.3 s · OKLink";
  - header làm mới.
- `visibilitychange` khôi phục đúng pha sau khi người dùng chuyển qua OKX App rồi quay lại.
- Reduced motion: không nạp lại; nút rỗng sang đặc bằng crossfade 120 ms.
- *Chữ cho Drill* tính từ timeline im lặng của vault (`computeTimeline`) cộng 2 · `KEEPER_CADENCE_S`.
  - Có giám hộ: "Stop checking in and your heirs can receive about {a} minutes later if a guardian confirms, or about {b} minutes later if nobody does." ({b} là đường 15 kỳ.)
  - Không giám hộ: một câu với {a}.
- *Test:*
  - `data-ritual` không bao giờ là `tied` trước receipt;
  - không có "Confirmed"/"Đã xác nhận", không có nút thắt trước receipt;
  - Enter xác nhận ngay;
  - đủ chuỗi `holding → wallet → sent → tied`;
  - pha được khôi phục khi tab hiện lại;
  - chữ Drill đúng cho cả hai trường hợp có và không có giám hộ.

**Task 11, `heir-letter` (M).**

- *Font italic:*
  - `fraunces-{latin,vietnamese}-standard-italic.woff2` (81.520 và 22.128 B), `style: 'italic'`, không preload, `font-synthesis: none`;
  - không ship latin-ext italic;
  - `.voice-letter`: opsz auto, wght 360–400, italic;
  - mở rộng `fonts.test.ts`.
- *`src/letter/letter-sheet.tsx`:* `LetterSheet({ children, signature? })` là `<article data-theme="light">`, một tờ vellum trên nền night. Tối đa 62ch, lề 64–96 px, viền mảnh bên trong, dòng kẻ bằng `repeating-linear-gradient` ≤ 3 %.
- *`HeirLetter`:*
  - lời chào ở giọng Ledger ("To 0x7A0D 3F2A …");
  - thân thư ở giọng Letter;
  - bảng phần nhận ở giọng Ledger, số tabular;
  - câu mở theo trạng thái:
    - ACTIVE: "Nothing has happened. This is what was set aside for you.";
    - GRACE: "They have been silent since {date}.";
    - released và releasedRecover mỗi trạng thái một câu riêng.
- *Chữ ký:* sợi chỉ của vault ở chế độ trục, kết thúc ở một nút tại `lastAlive`, kèm "Signed by their last check-in · {date} UTC" và link OKLink.
- *Nhánh:* `Thread` `releasedInherit` (thêm `predicted` khi chưa giải phóng); `branches` lấy từ `recipientsFor`; `highlight` là chỉ số của người đọc. Chú giải dạng danh sách: "You · 30% · about 1,240 USDT0".
- *Nhận:* `HoldButton tone="danger" showKnot={false}` kèm gợi ý "Hold to receive. This cannot be undone." và `doneLabel` "Now confirm in your wallet". Enter vẫn dùng được. Receipt có thêm dòng "Received · block N". Không confetti.
- *Test:*
  - câu mở theo trạng thái;
  - `highlight` là người đang kết nối;
  - ngày của chữ ký bằng `lastAlive`;
  - không có "Confirmed" trước receipt.

**Task 12 (chỉ sửa chữ, không tốn thêm).**

- Trạng thái trống: "Paste the vault address from your letter or invitation."
- Sau ba dòng xanh: "Next: see what this vault leaves you →" (`vaultHref`).
- Thêm `/verify/` vào `nojs.spec.ts`. Trang dùng tham số sau `#` có `<noscript>` trỏ tới `npx atropyle verify`.

#### 18.4.3 Plan 7C

**Thứ tự:** T1 → T2 → T3 → T4 → **T5′** → T6 (chờ 7B T5 merge) → **T7a** → **T7b** (chỉ giao khi Drill witness đã xong, muộn nhất 29/11) → T8 → T9 (chờ 7B T11) → T10 → T11 → T12.

- `use-first-interaction` và `use-in-view` của Task 5 cũ chuyển sang T6, dưới tên `useIntent`.
- Quyết định 9 của 7C được thay bằng R18.18.

**Task 1.** Không đổi (`progressEvery`).

**Task 2.** Bỏ `particles.ts`, canvas FX và `data-fx`.

**Task 3, `proof-ending` (S).**

- Bỏ kính lúp: `loupe.tsx`, `loupe-math.ts`, hai thanh trượt, phần tóm tắt `refStepCode`.
- *Wake Lock:* `navigator.wakeLock?.request('screen')`, nhả khi xong, khi lỗi hoặc khi tab bị ẩn. Ngừng sơn khi `document.hidden`; worker vẫn chạy và trang vẽ bù khi quay lại.
- *Con dấu:* keccak của netlist từ mã nguồn và từ chain hiện thành hai hàng tĩnh, mỗi hàng 16 cụm 4. Mỗi cặp cụm có dấu bằng.
- *"Copy certificate":* 8 dòng từ template cố định, không có chữ đọc từ chain:
  1. circuit 3 trên processor `<addr>`;
  2. keccak, bằng mã nguồn và bằng bản ghi deployment;
  3. block;
  4. các nhà vận hành đã đồng ý;
  5. P1–P8 đúng ở 67.108.864 / 67.108.864 trường hợp;
  6. số giây trên máy này;
  7. lệnh `npx -y atropyle verify`;
  8. câu "Your terminal should print the same keccak".
- *Mục `#limits`* "What this proof covers, and what it does not". Mỗi dòng có một cách tự bảo vệ và một link:
  1. vault và factory Solidity: test bằng Foundry, chưa kiểm toán, không có khoá admin;
  2. VM của processor: trang này chạy các byte netlist đọc từ processor bằng JS. Muốn hỏi chính processor thì dùng nút ở hero, hoặc `cast call <cpu> "step(uint256,bytes,bytes)(bytes,bytes)" 3 <state> <inputs> --rpc-url https://rpc.xlayer.tech` (đặt trong `COMMANDS`, có test);
  3. hợp đồng token: độ phủ hiện ở trang vault;
  4. nhà vận hành RPC: hai bên phải đồng ý; có `--verify-rpc`;
  5. keeper: chỉ cho tiện, `poke` và `distribute` ai cũng gọi được;
  6. ví và link của bạn: whitelist ở `/sign/`.
  - Câu kết: "Start with a Drill; approve only what you mean to leave." Maintainer duyệt trước khi merge.
- *P8* (EN và VI): "The netlist stored in the processor on X Layer, run on this device, answers exactly like the reference model for every input."
- *Test:*
  - `certificate.test.ts`: 8 dòng; số bằng `TOTAL_CASES`; không chuỗi nào lấy từ chain;
  - `proof-view`: anchor `#limits`;
  - thêm `/proof/` vào `nojs.spec.ts`.

**Task 4, `hero-loom` (S).**

- *Warp tràn viền:* `WeaveArt` đặt tuyệt đối phía sau nội dung hero. Mask CSS làm mờ dây xuống ≤ 12 % ở cột chữ (desktop: 7/12 bên trái). Mobile: một dải dưới H1, chỉ lấy 12 cột ở giữa. Bỏ eyebrow trên H1.
- *Dải fact* dưới CTA, HTML tĩnh, không fetch:
  - `heroFactCustody`: "Your tokens stay in your wallet";
  - `heroFactLive`: "Live on X Layer mainnet since {MAINNET_SINCE}", link tới factory trên OKLink;
  - cửa vào cho người thừa kế, `heroHeirDoor`: "Named as an heir or a guardian? Start here", trỏ `/verify/`.
  - Không có fact "unaudited · limits": dòng bằng chứng ở đầu trang đã nói điều đó, và hero không lặp lại.
- *Test:*
  - test build: dải fact có trong HTML;
  - keccak của byte netlist trong repo (dùng bộ encode của đường deploy) bằng `POLICY_NETLIST_KECCAK`;
  - test tắt JS;
  - ở 390 px, dải fact xuống ba dòng mà không có CLS (duyệt ảnh).

**Task 5′, `ask-the-circuit` (M+S), thay Task 5.**

- *`src/home/hero-states.ts`* (chỉ script và test import; JS của client không bao giờ import):
  - `HERO_BASE: EvalState` dựng từ `PRESETS.sixMonths`: k = 1, hai giám hộ, hai người thừa kế, bật khôi phục;
  - `HERO_STATES`, mỗi phần tử `{ state, at, inputs }`, inputs do `deriveInputs` sinh:
    - `alive`: `active`, `lastAlive = at − 1 ngày`;
    - `silent`: `grace`, báo động đã bật, cửa sổ đã qua, k xác nhận;
    - `liar`: `active`, `lastAlive = at − 1 ngày`, giám hộ đã gửi xác nhận.
- *`scripts/geometry.ts`:*
  - chạy `buildAll().program` từng op (NAND `[0,out,a,b]`, LATCH `[1,out,slot,0]`) trên ba vector;
  - mỗi path của một lớp (hiện mỗi lớp là một path) được tách theo chữ ký giá trị: những vector nào làm dây mang 1. Mỗi lớp thành tối đa 8 path, có `data-v` gồm các chữ `a`, `s`, `l`. Tổng byte của các chuỗi `d` không đổi; chỉ thêm khoảng 30 B mỗi path;
  - ghi ra `ANSWER = { alive, silent, liar }` gồm `{ next, release }`, và `ASK`: calldata của `step(3, state, inputs)` cho từng vector, mã hoá bằng viem lúc build.
- *Ba chip* là một nhóm radio thật (label bọc input, không có `id` cố định):
  - "If I keep checking in" / "If I go silent" / "If my guardians lie while I keep checking in";
  - CSS: `.hero:has(input[value="s"]:checked) .weave-col [data-v~="s"] { stroke: var(--atro-thread) }`;
  - fallback khi đã có JS: `onChange` đặt `data-ask` trên gốc hero, CSS dùng cả hai selector.
- *Lượt quét:* chỉ chạy khi đổi chip, không bao giờ khi tải trang. `transition: stroke 160ms` cùng `transition-delay: calc(var(--d) * 28ms)` (dùng lại `--d` sẵn có), tổng ≤ 1,3 s. Cuối lượt, chân release sáng: vòng vàng nghĩa là cổng đóng, tím nghĩa là cổng mở. Reduced motion: đổi ngay (R18.20).
- *Nút "Ask X Layer"* (`src/home/impl/ask.ts`, không viem, không SDK):
  - chỉ hiện khi `deployment.chainId === 196`;
  - khi bấm: gửi `eth_blockNumber` rồi `eth_call` (`{ to: cpu, data: ASK[v] }`, tại block đó) bằng JSON-RPC thô tới URL đầu tiên của mỗi nhóm `quorumRpcUrls`; giải mã `(bytes, bytes)` bằng tay; so với `ANSWER[v]`;
  - khớp: "X Layer answered at block N: the gate stays closed. Same as this page. OKX ✓ dRPC ✓";
  - lệch: một dòng đỏ, hiện cả hai chuỗi byte thô;
  - không tới được: dòng xám "not reachable from this device".
- *Tiêu đề được dệt:* path của sợi chỉ được render hai lần, trong một khung đặt tuyệt đối trong H1 (`top: 1lh; height: calc(100% - 1lh)`), là đường cong chữ S đi từ khoảng leading dưới dòng 1 tới vùng chân chữ của dòng cuối.
  - Bản dưới nằm *sau* chữ, nên chỉ hiện giữa các nét chữ.
  - Bản trên (`aria-hidden`) có mask là một dải cao 0,12em ở đỉnh khung, tức nằm trong leading, nơi không có nét chữ nào. Sợi chỉ nổi lên phía trước đúng ở đó, rồi chìm xuống sau chữ.
  - Nét rộng 2,5–3 px. `:lang(vi)` dùng line-height 1,14 để dải không chạm dấu chồng.
  - Va chạm thì đặt `--weave-over: 0` (chỉ còn bản dưới) mà không phải sửa mã.
  - Sợi chỉ rời khung ở phía CTA.
- *Chú thích* (chiều cao cố định): "The real policy circuit, {nand} NAND gates and {latch} latches in {depth} layers, answering this question. Run all {TOTAL_CASES} yourself →". Mọi số import từ hằng sinh ra.
- *Test:*
  - `hero-eval.test.ts`: `ANSWER` bằng `programEngine(buildAll().program)` trên cùng đầu vào (`alive` → 0, `silent` → 1, `liar` → 0);
  - calldata bằng `encodeFunctionData` chạy lúc test;
  - `ask.test.ts` với fetch giả: khớp, lệch, không tới được;
  - test build: không file `.js` nào chứa dữ liệu dây; gzip HTML của `/` tăng ≤ 4 kB so với T4;
  - e2e: đổi chip đổi được lớp hiện ra, cả khi tắt JS;
  - Lighthouse: phần tử LCP là H1;
  - một lần smoke chỉ đọc trên mainnet, ghi kết quả vào PR (agent không bao giờ broadcast).

**Task 6, một sân khấu, phần đầu của `home-recut` (S).**

- Cảnh 2 là một sân khấu duy nhất: `Scrubber` của 7B T5 trên `Thread` ở chế độ trục, cùng `StateBadge`, bộ đếm ngày mono và danh sách event.
- Chip "Inheritance" / "Recovery", cộng hai công tắc "a guardian confirms" và "I come back".
- Engine: `programEngine(buildAll().program)`, với `HERO_BASE` cho thừa kế và một `EvalState` k = 2 / 3 giám hộ cho khôi phục.
- `ScenarioOptions` (`DAY` × n):
  - `confirmAt` = 183;
  - `returnAt` = 187;
  - `votesAt` = [10, 12];
  - `blockAt` = 20.
- Xoá `home/impl/sim.ts`, `recovery-scene.tsx` và input range gốc. `sim-days.ts` giữ hằng để prerender; `sim.test.ts` gọi `scenarios()` với các options trên và khẳng định `INHERIT_DAYS`, `RECOVER_DAYS`.
- *Eyebrow thành dấu thời gian* ở giọng Ledger, kèm `StateGlyph`:
  - "Day 0 · You make a vault";
  - "Days 1–179 · You check in";
  - "Day 180 · Silence. The alarm";
  - "Day 183 · A guardian confirms";
  - "Day 194 · Through the gate";
  - khôi phục: "Day 10 · Day 12 · Day 26";
  - agent: "Before day 0 · Planned in words".
  - Mọi số đều import.
- *`useIntent(ref)`* (R18.18):
  - nạp bằng `loadTimeMachine()` cộng `import('@atropyle/circuits')`, không bao giờ qua `flows/impl/index.ts`;
  - kích hoạt khi có `pointerdown`, `keydown` hoặc `focusin` trong cảnh, hoặc một `IntersectionObserver` (`rootMargin '0px'`, threshold 0,25) chỉ được bật sau `wheel`, `touchmove` hay phím cuộn thật đầu tiên;
  - sau đó `requestIdleCallback` (timeout 2 s) rồi `scheduler.yield` (fallback `setTimeout 0`).
- *Lighthouse:* `forbiddenRequests` trên `/` với mẫu tên chunk SDK, circuits và time-machine (lấy từ manifest build) phải rỗng.
- E2E kích hoạt việc nạp bằng focus.

**Task 7a, trang chủ (S).**

- *Thứ tự:*
  1. Hero.
  2. Đoạn lặng 1: "The chain cannot tell when you are gone. So Atropyle asks, now and then."
  3. Sân khấu.
  4. Đoạn lặng 2: "Rules like this are usually a promise. Here they are a circuit, and you can check every case."
  5. Băng trust: số `monument` `TOTAL_CASES`, dòng "Every day above was decided by the same {gates} gates. The proof covers the rules, not everything. Read its edges →", CTA `/proof/`.
  6. (Chỗ cho witness, T7b.)
  7. Băng agent: transcript tĩnh (giọng Letter cho dòng "you", giọng Ledger cho tool call), một lệnh cài, link `/developers/`.
  8. Cảnh kết "Rehearse it before it is real.": glyph `mark` phóng to; sợi chỉ `releasedInherit` tách theo phần mặc định của mô phỏng (T7b đổi sang phần thật của witness); CTA "about 6 minutes" và cửa vào cho người thừa kế.
- Đoạn lặng là chữ thật ở giọng Proclaim, chỉ chuyển động bằng transform.
- *Cột sống:* một đường CSS (`div` 2 px) cùng các nút HTML ở mỗi cảnh, hiện theo `--story` (scroll timeline, chỉ transform). Không hỗ trợ thì đứng tĩnh. Không phải `Thread`.
- *Chú thích số liệu:*
  - vercel: "N vaults · M Drills · K check-ins · counted by the Atropyle index at block B";
  - deweb: nút "Count from the chain", kèm ước lượng trung thực "about {calls} requests from block 76,567,034", tính từ head;
  - không đếm lúc tải trang.
- Xoá `mini-proof.tsx`, trang `e2e/mini-proof` và test của chúng, `StatsScene` cùng các ô số, logic hiện dần transcript khi cuộn, và lưới cài ba biến thể.

**Task 7b, `witness` (M+S).** Chỉ giao khi Drill của maintainer đã xong (§18.4.4 mục 7).

- *Script* `apps/web/scripts/witness.ts --vault 0x…`, chỉ đọc:
  - `eth_getLogs` theo cửa sổ 100 block qua bộ đọc lịch sử của SDK;
  - `getTransaction` để biết ai gửi;
  - `getTransactionReceipt` để lấy `blockHash` và `logs`.
- Ghi `src/content/witness.json` bằng `JSON.stringify`, không bao giờ bằng template chuỗi:

  ```jsonc
  {
    "v": 1, "chainId": 196, "vault": "0x…", "heirs": [{ "address": "0x…", "bps": "7000" }],
    "steps": [{
      "kind": "created", "tx": "0x…", "block": "…", "blockHash": "0x…", "at": "…",
      "sender": "0x…", "senderRole": "owner",            // owner | guardian | keeper | anyone
      "logs": [{ "address": "0x…", "topics": ["0x…"], "data": "0x…" }],
      "fields": { "from": "active", "to": "grace", "amount": "…" },
      "untrusted": { "symbol": "USDC" }
    }]
  }
  ```

  - bigint là chuỗi thập phân; địa chỉ checksum;
  - `KEEPER_ADDRESS` là hằng công khai do maintainer đưa (chỉ địa chỉ).
- *`RecordScene` "One life, on the record":*
  - các thẻ `Receipt` tĩnh (của 7B T3) đánh số, xâu trên cột sống CSS; nút của mỗi thẻ mang màu trạng thái;
  - các dòng: Created · Checked in ×N · Went quiet · The alarm was raised (by the keeper; anyone could have) · A guardian confirmed · Released · Delivered: 70% to heir 1, 30% to heir 2, cộng `TransferFailed` nếu có;
  - thẻ cuối là một `Thread` `releasedInherit` theo phần thật;
  - link "Open this vault", "Verify it", và OKLink cho mỗi tx;
  - prerender, chỉ hiện khi `deployment.chainId === witness.chainId` và `steps` không rỗng.
- Cảnh kết của T7a tách theo phần của witness.
- Cạnh CTA Drill của hero có link "No wallet? Watch a Drill on the record" (→ `#record`).
- *Test:*
  - schema: chuỗi thập phân, checksum, thứ tự `kind`, có `blockHash` và `logs`;
  - test build: mọi chuỗi trong `untrusted` chỉ xuất hiện trong HTML của `/` bên trong `[data-untrusted]`;
  - file rỗng thì không có scene và không có link;
  - e2e trên 31337: scene vắng.

**Task 8.**

- `/me/` đọc chain (`vaultsOf`) ở cả hai bản. Bỏ `merge.ts` và `me-merge.test.ts`.
- Trạng thái trống: "This wallet has no vaults yet, as owner, guardian or heir. Rehearse one in about 6 minutes."

**Task 9, `heir-preview-print` (M).** Chờ 7B T11.

- *`HeirLetter`* thêm `preview?: { heir: number }`:
  - tài khoản là địa chỉ của người thừa kế đó;
  - mọi `ActionFlow` và `HoldButton` thay bằng thẻ tắt "Only this person's wallet can do this.";
  - có ribbon `aria-live` "Preview: what heir 1 sees after connecting their wallet", cùng nút "Back to my vault".
- *Tab chủ ví* có mục "Letters for your family": với mỗi người thừa kế có "See what heir N sees" và "Print heir N's letter". Nút in mở preview rồi gọi `window.print()` trong cùng handler bấm.
- *`src/letter/print.css`* (`@media print`):
  - ẩn khung, dòng bằng chứng, nav và nút; lề A4/Letter;
  - lá thư có thêm phần chỉ hiện khi in: `QrCode` (7A) tới `<origin>/verify/#<vault>`; địa chỉ vault theo cụm 4, giọng Ledger 14 pt; câu "Nobody from Atropyle will ever contact you, ask you to pay, or ask for a secret phrase. Never type a secret phrase into a website."; dòng "Keep this with your will".
  - Origin là `SITE_URL` ở vercel, `location.origin` ở deweb.
  - Lá thư in theo ngôn ngữ giao diện.
- Màn Xong của wizard (`done.tsx`) có thêm "Letters for your family →" (`vaultHref`).
- *Test:*
  - preview không render `TxCard`, `ActionFlow` hay `HoldButton` nào, và ribbon được đọc;
  - preview và in không đổi URL, `KV` hay `history`;
  - e2e `page.pdf()` trên Chromium ra đúng một trang.

**Task 11.** Ảnh OG là tiêu đề được dệt trên warp (Quyết định 14 giữ nguyên).

**Task 12 (danh sách trước khoá tính năng).**

- Sinh lại `witness.json` nếu có Drill tốt hơn.
- Một lượt vellum và VI cho mọi màn hình.
- Chạy lại smoke chỉ đọc "Ask X Layer" trên mainnet.

#### 18.4.4 Thêm vào §15 (việc của maintainer)

7. **Drill witness trên mainnet** trước 28/11, muộn nhất 29/11, theo 7C T7b:
   - dùng **ví mới**: chủ ví, một giám hộ, hai người thừa kế. Trang chủ không bao giờ được nối vĩnh viễn với ví cá nhân;
   - template `guarded`, k = 1, chia 70/30, approve một khoản nhỏ USDC hoặc USDT0;
   - điểm danh hai lần, rồi im lặng; keeper (hoặc bất kỳ ai) báo động; giám hộ xác nhận; vault giải phóng; chia tài sản;
   - đưa địa chỉ vault cùng địa chỉ công khai của ví keeper (`KEEPER_ADDRESS`, chỉ địa chỉ, không bao giờ khoá).
   - Agent không bao giờ ký.
8. **Trước 25/11, duyệt:**
   - chữ của dòng bằng chứng ("Rules frozen…");
   - mục `#limits`;
   - từ VI cho "release" (R18.12).
9. **30/11, kiểm trên điện thoại thật** (OKX App, Android và iOS): chip hero (`:has()`); mask của warp và của tiêu đề; View Transitions; scroll timeline của cột sống; Wake Lock trên `/proof/`; in lá thư; rung khi thắt nút. Tính năng nào hỏng thì ghi lại; fallback đã có sẵn.
10. **1/12, quay video demo** theo danh sách cảnh (không tốn agent):
    - S1: hero, đổi ba chip, bấm "Ask X Layer" ra block N;
    - S2: sân khấu trang chủ, kéo, bật "I come back";
    - S3: `/create/` trên điện thoại, xem trước được dệt, chữ ký hiện sau prepare;
    - S4: nghi thức `holding → wallet → sent → tied at block N`;
    - S5: vault Drill qua mốc, sợi chỉ sờn, câu "The rules now allow the alarm…", Raise the alarm;
    - S6: "See what heir 1 sees" rồi xem trước bản in;
    - S7: `/proof/` chạy, P1–P8, hai hàng keccak, copy certificate, `#limits`;
    - S8: hồ sơ witness.

### 18.5 Phần cắt (trả cho phần thêm)

| # | Cắt | Ở đâu | Tiết kiệm | Thay bằng |
|---|---|---|---|---|
| C1 | Ánh sáng WebGL của hero (`ogl`, `use-hero-gl`, `hero-gl`, xử lý mất context, e2e riêng) | 7C T5, cả task | L (1,0) | 7C T5′ "Hỏi circuit", trong cùng chỗ trống |
| C2 | Lớp hạt (`particles.ts`, canvas FX, `data-fx`) | 7C T2 | S | Bản đồ một mình |
| C3 | Kính lúp (`loupe.tsx`, `loupe-math.ts`, hai thanh trượt, tóm tắt `refStepCode`) | 7C T3 | M | Con dấu, chứng nhận, `#limits` |
| C4 | Proof thu nhỏ trên trang chủ (`mini-proof.tsx`, `e2e/mini-proof`, test) | 7C T7 | M | Chip và nút "Ask X Layer" ở hero; băng trust trỏ `/proof/` |
| C5 | `StatsScene` (ô số, giao diện "Counting…", bốn e2e) | 7C T7 | S | Chú thích số liệu chỉ đếm khi bấm |
| C6 | Hộp `RecoveryScene` riêng, input range gốc, engine `home/impl/sim.ts` | 7C T6 | M | Một sân khấu trên `scenarios()` và `Scrubber` của 7B |
| C7 | Gallery `/dev/` (`gallery.tsx`, `wallet-gallery`, `tx-gallery`, test của chúng); không có specimen | 7A T8, T11, T13 | S | Ảnh chụp của các trang thật |
| C8 | Hiện dần transcript agent khi cuộn, lưới cài ba biến thể | 7C T7 | S | Băng tĩnh, một lệnh |
| C9 | Gộp `/me/` với backend (`merge.ts`) | 7C T8 | S | Đọc chain ở cả hai bản (thứ tự cắt §14 mục 5) |
| C10 | Ma trận ảnh chụp 12 ảnh mỗi màn hình (phần lớn là thời gian review) | Mọi task giao diện | S | 3 ảnh mỗi màn hình; một lượt đủ ở 7C T12 |
| | **Tổng** | | **4,0** | |

**Cắt thêm, không tính vào ngân sách** (không task nào đã lên lịch làm):

- animation trục `SOFT`/`WONK` (§4.2): file `standard` không còn hai trục này;
- `backdrop-blur` dưới 48rem;
- fade `m.li` trong bản xem trước của wizard.

**Thứ tự rơi khi trễ**, rơi từ trên xuống, kèm mốc kiểm:

| Mốc | Điều kiện | Rơi | Giải phóng |
|---|---|---|---|
| 25/11 tối | 7A chưa merge hết | 1. cửa sổ nổi của tiêu đề dệt (chỉ còn bản dưới chữ) · 2. dải xem trước 72 px (quay về nút "Preview") | 0,5 |
| 27/11 | 7B T5 hoặc T7 chưa merge | 3. `standingSentence` · 4. bản in lá thư (giữ preview) · 5. chữ ký riêng của vault (về sóng chuẩn) | 0,75 |
| 29/11 | Drill witness chưa xong | 6. 7C T7b không được giao | 0,75 |
| 30/11 | 7C T7a chưa merge | 7. đoạn lặng và cảnh kết (về CTA đơn) | 0,25 |
| | | **Tổng có thể giải phóng** | **2,25** |

**Không bao giờ cắt:**

- night mặc định và dòng bằng chứng;
- wallet mirror;
- sợi chỉ trên compositor có trục thời gian;
- các pha trung thực của nghi thức (sửa lỗi "Confirmed" trước receipt);
- lá thư người thừa kế trên vellum;
- chip "Hỏi circuit" (nút live có thể rơi sau cùng, nhưng chip thì không).

### 18.6 Ý tưởng bị từ chối

**Hàng đợi P1**, theo thứ tự sẽ nhận nếu mốc 27/11 còn dư:

1. `ask-the-processor` đầy đủ trên `/proof/` (L);
2. `law-portrait` (L, phải spike trước);
3. đọc lại từ nhiều nhà vận hành cho `Receipt` và witness (S, một module chung);
4. `stats-checkpoint` (S);
5. chứng nhận JSON (S; ajv 8.20.0 đã có trong lockfile qua `packages/cli`);
6. `address-match`;
7. `verify-ladder`;
8. `this-visit-ledger`;
9. ghi video bằng script Playwright;
10. odometer và bộ đếm tốc độ có ETA.

Lý do từng ý:

- **`ask-the-processor`** (playground đầy đủ, 7 kịch bản, điều khiển tay, 32 câu ngẫu nhiên). Giá L, và trên devnet không kiểm được vì devnet không có netlist. Chip hero cộng nút "Ask X Layer" (S) đã lấy phần giá trị lớn nhất: chính processor trả lời trên mainnet, có hai nhà vận hành đồng ý. Lệnh `cast call` có trong `#limits`.
- **`law-portrait`** (bản đồ sơn quyết định của circuit). Giá L, phải sửa vòng lặp nóng của gói circuits đã publish, và phụ thuộc một spike chưa biết kết quả. Giữ painter cũ.
- **`og-portrait`**: đi cùng `law-portrait`.
- **Đọc lại từ hai nhà vận hành** (`receipt-everywhere`, nút "Read it again" của witness). Để P1 #3. Hồ sơ tĩnh có OKLink cho từng tx là đủ cho lần chấm.
- **`stats-checkpoint`.** Số liệu giờ chỉ là một dòng chú thích. Nút đếm khi bấm, kèm ước lượng trung thực, không tốn gì. Lighthouse không bao giờ đọc chain.
- **Chứng nhận JSON so với `verify.json` của CLI.** Để P1 #5. Chứng nhận dạng chữ đã có lệnh chạy lại.
- **`sabotage-gate`.** Giá L. Dễ bị đọc thành "circuit đã deploy bị hỏng"; chính góc nhìn đề xuất nó cũng xếp nó bỏ trước tiên.
- **`scroll-story`** (sân khấu dính theo cuộn, 300 svh). Giá L, cần fallback cho Safari < 26, Firefox và reduced motion, và có rủi ro chiếm cuộn trong webview của OKX App. Dấu thời gian và `Scrubber` đã nói "cuộn là thời gian".
- **`agent-recorded`.** Phải nhúng vào HTML một payload ký được cho ví của maintainer. Băng tĩnh là đủ.
- **`rehearsal-report-make-it-real`** và **`RehearsalPanel`.** Trùng với `standingSentence`, với các mốc của cỗ máy thời gian, và với email `drill-summary`.
- **`heir-journey`** (kiểm một địa chỉ bất kỳ). Dễ bị hiểu là bằng chứng sở hữu. Chỉ nhận chữ của `/verify/`.
- **`verify-line-four`.** Độ phủ đã có ở trang vault.
- **`role-doors-nav`** (mega menu). Header ở 390 px với chữ VI không đủ rộng. Chỉ nhận cửa vào cho người thừa kế, ở hero và footer.
- **`lexicon-copy-deck`.** Thay bằng R18.12 và một Global Constraint, không tốn gì.
- **`haptic-vocab`.** iOS không có Vibration API. Giữ một xung 12 ms.
- **`sheets`** (kéo có vật lý). Kéo bằng `motion` trong Radix Dialog là rủi ro về focus. Chỉ nhận overlay và header đặc trên mobile.
- **`motion-gate`.** Ngưỡng khoảng cách khung hình chập chờn trong CI headless. Test lớp của sợi chỉ, test reduced motion và TBT của Lighthouse là cổng.
- **`chain-pulse`.** Phải gọi RPC công khai ở mọi trang chỉ để hiện một con số. Dòng bằng chứng là fact tĩnh, đã kiểm bằng test.
- **`sim-reads-chain`.** Test build buộc keccak của repo vào deployment, cộng nút "Ask X Layer".
- **`dye-palette-materials`.** Đổi token sau Task 3 thì phải sửa lại fixture, và vân chéo sinh moiré. Chỉ nhận token màu nhánh.
- **Identicon sợi chỉ, tô sáng địa chỉ trùng trên cả trang.** Phần chữ hoa checksum đậm đã nằm trong `voices`.
- **Glyph nối thành một nét, favicon theo trạng thái.** Để P1. Glyph `mark` và wordmark đã được nhận.
- **View Transition đổi hướng theo độ sâu route, nút thắt bay sang header.** Firefox không có View Transitions; dòng receipt đã mang đủ ý nghĩa.
- **Xem trước tab giám hộ, hạt chuyển khoản trong lá thư.** Để P1.
- **Prop `strands`, `silence`, `future` của sợi chỉ.** `predicted` trên `releasedInherit` thay được `future`; hai prop kia chỉ thêm nhiễu.
- **Loader `indeterminate`, nút "Play the story".** Để P1. Detent và phím nhảy mốc là đủ.
- **Biệt danh, ô "To" và "A note" trên lá thư cho gia đình, `FamilyLetter` riêng, nút in ở `/join/`.** Bản in chính là lá thư người thừa kế ở trạng thái ACTIVE ("Nothing has happened. This is what was set aside for you."). Không có chữ riêng nào phải giữ hay phải chứng minh là không rò.
- **Fraunces `soft-italic` (77,8 kB)** thay cho `standard-italic` (81,5 kB). Lá thư ở cỡ chữ thân cần trục opsz để dễ đọc; SOFT không đáng mất opsz. Latin-ext italic không ship, nên DeWEB chỉ thêm khoảng 104 kB, không phải 320 kB.
- **Chuỗi `d` riêng cho từng lớp sáng của hero.** Thay bằng path tách theo chữ ký giá trị.
- **Cửa sổ dệt do script build đặt theo vị trí glyph.** Chỗ xuống dòng đổi theo viewport và ngôn ngữ. Đơn vị `lh` của CSS giữ đúng vị trí ở mọi độ rộng.
- **Banner "BETA · UNAUDITED · LIVE ON …".** Giống banner của một trang tham chiếu cả về chỗ đặt lẫn chữ, và xuống 2–3 dòng ở 390 px. Thay bằng dòng bằng chứng.
- **Specimen `/dev/`.** Chỉ dùng lúc dev, và là mục đầu trong thứ tự cắt của §14.

### 18.7 Ruling mới

Mỗi ruling có dạng "Ruling: … — vì sao — giá nếu sai".

- **R18.1 Ruling:** night ("đêm khung cửi") là mặc định bất kể hệ điều hành. Vellum là theme chọn thêm, và là chất liệu theo phạm vi (`[data-theme="light"]` trên từng phần tử). "Match device" vẫn có.
  - *Vì sao:* cả ba trang tham chiếu đều sáng. Mọi ấn tượng đầu, mọi ảnh chụp và video đều là sợi chỉ vàng trong đêm; vellum dành cho khoảnh khắc lá thư.
  - *Giá nếu sai:* người thích sáng phải bấm một lần. Đổi lại chỉ là sửa một selector và `DEFAULT_THEME`.
- **R18.2 Ruling:** cắt hero WebGL. Hero là netlist được tính lúc build trên ba đầu vào, CSS thuần, cộng một nút hỏi processor live.
  - *Vì sao:* WebGL là món tốn nhất mà ít nghĩa nhất. "Hỏi circuit" nói đúng điều sản phẩm làm, ngay trong lần vẽ đầu, và là bằng chứng đặc thù TapeOut nhất trong ba trang.
  - *Giá nếu sai:* mất ánh sáng động; thêm lại được sau mà không đổi SVG.
- **R18.3 Ruling:** mỗi vault có một sợi chỉ riêng (`threadSignature(address)`), giống nhau ở header, ở bản xem trước, ở lá thư và ở bản in. Phần này làm ở 7B T6, không ở 7A.
  - *Vì sao:* hình nói một sự thật về vault của người xem, và người thừa kế thấy đúng sợi chỉ chủ ví đã thấy.
  - *Giá nếu sai:* hoạ âm có thể làm nút chen nhau; test 1.000 địa chỉ cộng việc kẹp trọng số chặn điều đó. Nằm ở mục 5 của thứ tự rơi.
- **R18.4 Ruling:** chuyển động của sợi chỉ chỉ chạy trên compositor:
  - chỉ `opacity` và `transform` của `<svg>` gốc hoặc phần tử HTML;
  - `RevealWindow` cho phần sáng;
  - không spring path `d`, không filter SVG;
  - lớp HTML cho chấm, nút, cổng và cột;
  - `preserveAspectRatio="none"` cùng `non-scaling-stroke`, gốc có `overflow: clip`.
  - *Vì sao:* nhịp vô hạn trên phần tử con cộng `drop-shadow` vẽ lại header mỗi khung, spring `d` đuổi theo từng tick kéo, và chấm theo % chỉ thẳng hàng ở một tỉ lệ khung nếu SVG giữ tỉ lệ.
  - *Giá nếu sai:* sóng bị giãn theo khung; nét vẫn đúng độ dày, và test lớp giữ việc căn chỉnh.
- **R18.5 Ruling:** sợi chỉ có trục thời gian tuyến tính (`ThreadInput.axis`, `courseX`). `Scrubber`, bản xem trước, header, lá thư và witness đều dùng nó.
  - Header không vẽ nút `CheckedIn`; `HistoryThread` có trục riêng.
  - Cột sống của trang chủ là đường CSS có nút HTML, không phải `Thread`.
  - *Vì sao:* hình học cũ đặt x = 0 ở `lastAlive`, nên mọi lần điểm danh trong quá khứ rơi ra ngoài trái, còn cổng chỉ có sau khi giải phóng. Thumb, chip mốc và đường dự đoán cần thời gian tuyến tính.
  - *Giá nếu sai:* hai chế độ phải cùng được test; chế độ `remaining` cũ giữ cho `StateBadge`.
- **R18.6 Ruling:** hồ sơ witness là một file JSON đã commit, do một script chỉ đọc sinh ra bằng `JSON.stringify`.
  - Chữ đọc từ chain nằm trong khối `untrusted` và chỉ render qua `UntrustedText`.
  - Drill chạy từ ví mới. Maintainer ký; agent chỉ đọc. 7C T7b chỉ được giao sau khi Drill đã xong.
  - *Vì sao:* cả vòng đời là thứ sản phẩm tồn tại để làm; template chuỗi để một token độc tiêm mã vào build; và trang chủ không được nối vĩnh viễn với ví cá nhân.
  - *Giá nếu sai:* Drill không chạy kịp thì không có scene và không có link; mất cảnh mạnh nhất của video, chiếm 0,75 trong thứ tự rơi.
- **R18.7 Ruling:** mọi trang mở đầu bằng một dòng bằng chứng của riêng ta ("Rules frozen in netlist 0x7016…3864 on X Layer · unaudited · limits →"), không phải banner miễn trừ.
  - Giới hạn của proof viết ngay cạnh bằng chứng (`/proof/#limits`).
  - P8 được viết lại cho đúng: JS chạy các byte netlist đọc từ processor.
  - *Vì sao:* niềm tin đến từ việc nói bảo đảm nằm ở đâu và dừng ở đâu; banner cũ giống một trang tham chiếu và xuống 2–3 dòng trên mobile; câu P8 cũ nói quá điều proof kiểm.
  - *Giá nếu sai:* thêm 24 px mỗi trang; chữ do maintainer duyệt trước 25/11.
- **R18.8 Ruling:** mọi bước ký có hộp "Your wallet should show …", giải mã từ calldata theo loại tài sản của danh sách tài sản của vault (khớp theo `to`), không bao giờ từ summary hay chữ đọc trên chain.
  - *Vì sao:* lừa đảo xảy ra ở khoảng giữa trang và cửa sổ của ví; và cùng selector `approve` có nghĩa khác nhau cho ERC-20 và ERC-721.
  - *Giá nếu sai:* mỗi ví hiển thị khác nhau, nên chữ ghi "should show" và không bắt chước giao diện ví.
- **R18.9 Ruling:** lá thư người thừa kế là tờ vellum ở giọng Letter. Lá thư cho gia đình là bản in của chính lá thư đó, qua chế độ preview của chủ ví. Không có ô chữ riêng nào.
  - *Vì sao:* đây là đỉnh cảm xúc của sản phẩm, và nó giải đúng thất bại thật của thừa kế crypto: người thân không biết vault tồn tại. Một component, không có dữ liệu riêng tư.
  - *Giá nếu sai:* bố cục in khác nhau giữa các trình duyệt; smoke `page.pdf()` bắt lỗi trên Chromium, và maintainer in thử ngày 30/11.
- **R18.10 Ruling:** ba giọng chữ là luật của design system. Fraunces dùng file `standard` (wght + opsz) cho cả roman lẫn italic; bỏ SOFT và WONK. Italic chỉ có latin và VI, và không bao giờ có trong lần vẽ đầu của `/`, `/create/`, `/proof/`. Chữ đọc từ chain chỉ ở giọng Ledger.
  - *Vì sao:* ai đang nói trở nên rõ ngay khi nhìn, và font LCP giảm 54 kB.
  - *Giá nếu sai:* mất chút "mềm" của Fraunces; giọng Proclaim vẫn có opsz.
- **R18.11 Ruling:** Drill được giới thiệu là "about 6 minutes · No Atropyle fee, only network gas". Con số do test tính bằng `computeTimeline` trên Drill không giám hộ, cộng 2 · `KEEPER_CADENCE_S`.
  - Nghi thức nêu thời gian của chính vault, có điều kiện về giám hộ (đường 15 kỳ).
  - *Vì sao:* "Drill 7 ngày" bán rẻ khoảnh khắc demo mạnh nhất, còn "5 phút, miễn phí" thì sai: thiếu hai lượt keeper, sai với vault có giám hộ, và bỏ qua gas.
  - *Giá nếu sai:* keeper chết thì phải bấm tay; trang luôn đưa sẵn hành động bấm tay.
- **R18.12 Ruling:** từ vựng VI là:
  - "điểm danh" cho check-in;
  - "Drill" là tên riêng, lần đầu kèm "(bản diễn tập)";
  - "trao" cho release ("Đã trao cho người thừa kế").
  - *Vì sao:* bản VI đang lệch từ, và "giải phóng" nghe lạnh với người có tang.
  - *Giá nếu sai:* maintainer chọn từ khác trước 25/11 thì chỉ sửa `labels.messages` và các file chưa viết.
- **R18.13 Ruling:** mỗi màn hình 3 ảnh chụp (night EN 1440, night EN 390, night VI 390). Vellum chỉ chụp ở bề mặt vellum, cộng một lượt đủ ở 7C T12.
  - *Vì sao:* bớt thời gian review mà axe vẫn chạy cả hai theme tự động.
  - *Giá nếu sai:* lỗi thẩm mỹ riêng của vellum có thể lọt tới lượt cuối.
- **R18.14 Ruling:** 7C T6 chờ 7B T5. Trang chủ và trang vault dùng chung `scenarios()` (có `ScenarioOptions`) và `Scrubber`, nạp qua `loadTimeMachine()`.
  - *Vì sao:* một nguồn sự thật cho các ngày mà trang chủ, agent và trang vault cùng kể.
  - *Giá nếu sai:* 7B T5 trễ quá 27/11 thì T6 dùng ngày prerender và `Slider` thường, và C6 không tiết kiệm được.
- **R18.15 Ruling:** trang vault refetch đúng lúc tới mốc kế tiếp, và gọi tên trạng thái `predicted` ("luật đã cho phép, chain chưa ghi") bằng chữ, không chỉ bằng nét đứt.
  - *Vì sao:* với timing của Drill, giám khảo nhìn sợi chỉ sờn ngay trước mắt, và trang không lẫn điều luật dự đoán với điều chain đã ghi.
  - *Giá nếu sai:* thêm một lần đọc RPC mỗi mốc, nhân đôi vì hai nhà vận hành.
- **R18.16 Ruling:** không UI nào nói "Confirmed" hay hiện nút thắt trước receipt. `HoldButton` có `doneLabel` và `showKnot`; nghi thức và nút nhận tắt nút thắt, và nói "Now sign in your wallet".
  - *Vì sao:* `HoldButton` của 7A đọc "Confirmed" ngay khi giữ đủ lâu, trước khi ví kịp mở.
  - *Giá nếu sai:* thêm hai prop vào một component đã commit; test của 7A giữ giá trị mặc định.
- **R18.17 Ruling:** e2e, axe và harness ảnh chụp đổi theme bằng lựa chọn đã lưu, không bằng `emulateMedia`.
  - *Vì sao:* night không theo hệ điều hành, nên `emulateMedia` không còn đổi được theme.
  - *Giá nếu sai:* cổng axe ở vellum im lặng thành xanh; test `theme` của 7A kiểm điều này.
- **R18.18 Ruling:** chunk nặng của trang chủ (SDK, circuits, time-machine) chỉ nạp khi có ý định thật:
  - `pointerdown`, `keydown` hoặc `focusin` trong cảnh;
  - hoặc khi cảnh vào màn hình (`rootMargin 0`), nhưng chỉ sau `wheel`, `touchmove` hay phím cuộn thật đầu tiên;
  - không bao giờ qua `flows/impl/index.ts`;
  - Lighthouse khẳng định không chunk nào trong số đó được tải trên `/`.
  - *Vì sao:* observer `rootMargin 100%` bắn ngay khi tải trên màn hình mobile của Lighthouse, và index kéo theo mọi module flow, phá TBT ≤ 150 ms.
  - *Giá nếu sai:* ai chỉ đọc mà không thao tác thì chỉ thấy danh sách bước tĩnh (đã có).
- **R18.19 Ruling:** đọc chain từ trang (nút "Ask X Layer", và phần đọc lại nếu P1 được nhận) dùng JSON-RPC thô tới các origin đã có trong CSP. Chỉ chạy khi người xem bấm, tối đa 3 call đồng thời, chỉ trên chain 196.
  - *Vì sao:* không thêm origin, không thêm gì vào JS lần tải đầu, không làm Lighthouse đọc chain, và devnet (CPU giả) không bao giờ hiện câu trả lời giả.
  - *Giá nếu sai:* một nhà vận hành trễ hay chặn thì trang báo "not reachable from this device", không bao giờ báo lệch.
- **R18.20 Ruling:** lượt quét của hero là transition `stroke` theo độ sâu. Đây là ngoại lệ duy nhất của R18.4, chỉ chạy sau khi người xem đổi chip, ≤ 1,3 s, và không chạy khi reduced motion. Sợi chỉ của tiêu đề chạy sau chữ và chỉ nổi lên trong leading.
  - *Vì sao:* một lớp sáng riêng phải nhân đôi chuỗi `d` (vượt ngân sách HTML), còn path tách theo chữ ký giá trị thì gần như không tốn byte. Sợi chỉ chạy trước nét chữ đọc thành gạch ngang.
  - *Giá nếu sai:* lượt quét có thể giật trên Android yếu; đặt delay bằng 0 thì còn đổi ngay.
- **R18.21 Ruling:** 7A gọn; mỗi task là một run; có mốc kiểm 25/11, 27/11, 29/11 và 30/11 với thứ tự rơi đã thống nhất trước (§18.5). Văn bản plan được viết lại ở mức mã trước khi giao.
  - *Vì sao:* 7A chặn cả 7B lẫn 7C, nên mỗi ngày 7A trễ là một ngày của cả hai. Đưa "mã cũ cộng đoạn sửa bằng lời" cho agent thì kết quả không nhất quán.
  - *Giá nếu sai:* controller tốn khoảng 0,75 task viết lại văn bản; đã tính vào giá.
