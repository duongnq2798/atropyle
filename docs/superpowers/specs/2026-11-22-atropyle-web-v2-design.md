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
| `thread` | `#E8B65A` | `#A86F12` | Sợi chỉ, hành động chính, focus ring |
| `alive` | `#5CC8B0` | `#127A63` | ACTIVE |
| `grace` | `#F0A23B` | `#A35A00` | GRACE |
| `recovery` | `#7FA8FF` | `#2E5BC7` | RECOVERY |
| `release` | `#B7A6FF` | `#5B44C9` | Release |
| `danger` | `#FF6B5E` | `#B42318` | Lỗi, thao tác không đảo ngược |

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

## 17. Rủi ro

- **Next 16 + Turbopack + Web Worker và `output: 'export'`:** spike ở task đầu. Không ổn thì build bằng webpack (`next build --webpack`).
- **Edge Function giới hạn CPU và thời gian:** `tick` có ngân sách 50 giây, chia nhỏ việc, ghi cursor sau mỗi khối.
- **Email vào spam:** domain riêng có SPF, DKIM và DMARC; nội dung thuần, ít link; test với Gmail và Outlook ngày 30/11.
- **Thời gian:** mười ngày cho cả frontend lẫn backend. Hai plan chạy song song bằng subagent, có thứ tự cắt ở §14.
- **Deep link OKX App:** chưa xác minh định dạng. Chưa xác minh thì chỉ hiện QR và link thường.
