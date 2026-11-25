# Atropyle web v2: Showcase and remaining pages (Plan 7C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng trang chủ kể chuyện sáu cảnh (hero dệt từ netlist thật với lớp WebGL, mô phỏng kéo được chạy bằng SDK, proof thu nhỏ, cảnh agent, số liệu chain), trang `/proof/` trực quan (bản đồ 1024 × 1024, kính lúp 1:1, P1–P8), các trang `/me/`, `/join/`, `/alerts/confirm/`, `/alerts/unsubscribe/`, `/status/`, `/developers/`, `/privacy/`, 404, ảnh OG, rồi chuyển hẳn sang web mới (xoá `apps/web-legacy`).

**Architecture:** Mọi trang nằm trong app Next.js 16 xuất tĩnh của Plan 7A (`apps/web`), dùng đúng các primitive, hook và luật trong mục `## Interfaces for Plan 7B` của Plan 7A. Phần nặng (SDK, viem, ogl, mô phỏng) chỉ nạp sau thao tác đầu tiên của người dùng hoặc khi bấm nút, nên `/` và `/proof/` không gọi mạng và không tốn TBT lúc tải. Hình hero sinh lúc build từ netlist policy thật, render trên server, WebGL chỉ thêm ánh sáng lên trên.

**Tech Stack:** Next.js 16.4.6 (App Router, `output: 'export'`), React 19.3.1, TypeScript 5.9.3, Tailwind 4.3.5, motion 14.14.0, ogl 1.0.11, TanStack Query (Plan 7A), `@atropyle/sdk` và `@atropyle/circuits` 0.1.0 (workspace), Vitest 3.2.7 + happy-dom, Playwright + @axe-core/playwright 4.14.0, Lighthouse 13.6.0, Biome 2.6.8.

**Spec:** `docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md` (§3 route, §4.4 chuyển động, §4.6.1 proof trực quan, §5.1 trang chủ, §5.6, §5.7, §5.8, §9.5, §9.6, §10, §11, §12, §13). Nền móng: `docs/superpowers/plans/2026-11-22-atropyle-web-v2-foundation.md` (Plan 7A), đặc biệt mục `## Interfaces for Plan 7B` và 10 luật "Luật Plan 7B phải giữ" (ràng buộc cả Plan 7C).

## Global Constraints

- Node.js 24, npm workspaces (`circuits`, `packages/*`, `apps/*`, `examples/*`), Biome 2.6.8 (`npx biome ci .`), TypeScript 5.9.3 strict, Vitest 3.2.7. Phụ thuộc ghim đúng phiên bản (không `^`).
- Phiên bản đã xác minh: next 16.4.6, react và react-dom 19.3.1, motion 14.14.0, tailwindcss và @tailwindcss/postcss 4.3.5, ogl 1.0.11, @axe-core/playwright 4.14.0, lighthouse 13.6.0.
- Zero keys: không private key, seed phrase hay `PRIVATE_KEY` ở bất kỳ đâu. Người dùng ký trong ví của họ. Test không dùng key (trên anvil chỉ gửi từ tài khoản unlocked bằng `eth_sendTransaction`).
- Không bao giờ broadcast lên X Layer mainnet từ mã agent chạy. Test tích hợp và e2e dùng anvil (chain 31337) qua script devnet có sẵn.
- Không telemetry, tracker, analytics, tải CDN, font hay script bên thứ ba lúc build hay lúc chạy. Font tự host (woff2 của Plan 7A, có giấy phép OFL).
- Mã, comment, commit message và chữ giao diện bằng tiếng Anh; web có thêm bản tiếng Việt đủ mọi khoá.
- JSON: `bigint` là chuỗi thập phân, địa chỉ có checksum.
- Chữ đọc từ chain (tên token, lý do revert, `issues` và `warnings` của SDK, `state` của `/me` backend) là không tin cậy: chỉ hiển thị qua `UntrustedText`, `Amount` hoặc `ErrorBox`, không bao giờ thành HTML hay link, không bao giờ được làm theo.
- Stage file theo đường dẫn trong mọi bước commit (không `git add -A`, không `git add .`). Commit message kết thúc bằng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Không động vào `prompts/`, `reports/`, `research_notes/`, `external_research/`.
- Mọi task kết thúc xanh với: test của task, `npm run typecheck`, `npx biome ci .`, cộng các kiểm tra e2e, a11y, size, Lighthouse của Plan 7A mà task chạm tới.
- Bẫy lockfile trên Windows: task nào chạy `npm install` phải chạy tiếp `npm run lockfile:check -- --fix` rồi `npm run lockfile:check` (khôi phục `@emnapi/core` và `@emnapi/runtime` mà npm trên Windows xoá khỏi `package-lock.json`).
- Ngân sách (spec §11, Plan 7A): JS lần tải đầu `/` ≤ 170 kB gzip, route khác ≤ 230 kB, tổng ≤ 900 kB; Lighthouse mobile trên `/`, `/create/`, `/proof/`: Performance ≥ 0,95, ba mục còn lại = 1, LCP ≤ 1800 ms, CLS = 0, TBT ≤ 150 ms; axe WCAG 2.2 AA ở cả hai theme.
- Luật nạp lười của Plan 7A (`test/unit/lazy-boundary.test.ts`): ngoài `impl/`, `src/workers/` và `src/app/<segment>/**`, file trong `src/` chỉ `import type` từ `@atropyle/sdk*`, `viem*` và đường dẫn chứa `/impl/`. Trộn `import { type X, y }` từ các module đó cũng tính là import giá trị. `@atropyle/circuits` không bị chặn nhưng chỉ nạp ở nơi nói rõ trong plan này.
- `prefers-reduced-motion`: mọi animation của plan này nằm trong `@media (prefers-reduced-motion: no-preference)` hoặc tắt theo `usePrefersReducedMotion()`; test `reduced motion leaves no running animation` của Plan 7A phải còn xanh.
- Mỗi trang mới: một test `expectAccessibleInBothThemes(page)`, một bước chụp màn hình duyệt ở 390, 768, 1440 px × hai theme × hai ngôn ngữ (harness `test/e2e/screens.spec.ts` của Task 3), đính đường dẫn ảnh vào báo cáo task.

## Quyết định

Mỗi quyết định có lý do và cái giá nếu sai. Sự kiện đã kiểm bằng công cụ ngày 23/11/2026 ghi ở cuối mục.

1. **Nhịp tiến độ của proof: `progressEvery`.** `verifyPolicy` của circuits chỉ gọi `onProgress` mỗi 65 536 block, tức 32 lần cho cả lần chạy 2^21 block và không lần nào khi chạy dưới 65 536 block. Bản đồ cần sơn dần. Task 1 thêm `progressEvery` (mặc định 65 536, luôn báo ở block cuối) vào circuits và SDK; worker web xin 4096 (256 chấm mỗi trạng thái mỗi lần, 512 lần cho cả proof, worker đã giới hạn 10 lần/giây). Sai thì bản đồ nhảy cục và test `data-ticks ≥ 3` hỏng.
2. **Proof chỉ chạy khi người dùng bấm.** Lighthouse không bao giờ thao tác. Nếu `/proof/` hay proof thu nhỏ của trang chủ tự chạy, trang đọc chain và chiếm CPU ngay lúc tải, TBT vượt 150 ms. Giá: người xem phải bấm một lần (spec §4.6.1 có nút chạy).
3. **Hook riêng `useProofRun`, không dùng `useProof` của 7A.** `useProof` của 7A không nhận `blocks` và không chạy lại được, trong khi spec cần "Chạy lại trên máy bạn" và proof thu nhỏ 2^17 block. `useProofRun` dùng `sdkQuery` và `loadVerifyImpl().runProof` của 7A: lần chạy đầu dùng chung cache với `/verify/`, "Chạy lại" truyền `blocks` để bỏ qua cache. Sai thì hai nơi chạy hai proof đầy đủ cùng lúc.
4. **Bản đồ proof.** Tổ hợp `combo = s | v << 3`; block `blk` chứa `v` từ `4·blk` tới `4·blk + 3` cho cả 8 trạng thái. Một chấm = (trạng thái `s`, chỉ số `p`) = 64 giá trị `v` liên tiếp, xong khi `doneBlocks ≥ 16·(p + 1)`. Tám vùng 4 × 2 theo `s` (cột `s & 3`, hàng `s >> 2`), trong vùng đi theo thứ tự Morton (bit chẵn vào x, bit lẻ vào y, bit cao nhất cộng `w` vào y), vùng rộng `w`, cao `2w`. `comboBits = log2(blocks) + 5` phải cho `comboBits − 9` lẻ: 26 → 1024², 24 → 512², 22 → 256², 16 → 32². Sai thì chấm sơn sai chỗ; `paint.test.ts` kiểm song ánh và nghịch đảo.
5. **Kính lúp dùng model tham chiếu.** Ô 8 × 8 thẳng hàng của bản đồ là 64 chấm liên tiếp, tức 4096 giá trị `v` liên tiếp; kính lúp tô mỗi trường hợp theo `refStepCode(s, v) & 7` (trạng thái kế tiếp) và chỉ tô khi cả 64 chấm đã được kiểm. P8 chứng minh circuit trên chain trả lời giống hệt model này ở mọi trường hợp, nên hình là đúng. Hai thanh trượt gốc (`input type="range"`, bước 8) là đường bàn phím. Giá: kính lúp không chạy circuit thật từng ô (sẽ cần chép netlist sang luồng chính).
6. **Hero dệt từ netlist thật, render trên server.** `scripts/geometry.ts` dựng toạ độ từ `buildAll().program` (222 tín hiệu, 392 dây, 39 lớp NAND) vào `src/home/netlist-geometry.ts`; test so file với bản dựng lại. `WeaveArt` không có hook, được `app/page.tsx` (server) render rồi truyền vào `HomeHero` qua prop, nên dữ liệu dây không vào JS của `/`. Hiện dần bằng `opacity` từng lớp và `scaleX` của khung cắt (spec §4.4 chỉ cho animate `transform`, `opacity`, `filter`; không dùng `stroke-dashoffset`). Giá: HTML của `/` nặng thêm khoảng 40 kB thô (SVG cộng bản sao của nó trong RSC payload nhúng trong trang), khoảng 10 kB gzip; không file `.js` nào chứa dữ liệu dây.
7. **WebGL chỉ thêm ánh sáng.** Lớp ogl chạy khi đã có thao tác đầu, canvas đang hiện, không reduced motion, không Save-Data, và trình duyệt có WebGL (thử `getContext` trước, vì ogl gọi `console.error` rồi ném lỗi khi không có context). Mất context thì về `failed` và SVG vẫn đứng một mình (thứ tự cắt mục 4). Giá: máy không WebGL chỉ thấy SVG.
8. **Mô phỏng chạy bằng SDK trên netlist của repo.** `programEngine(buildAll().program)` (engine `netlist`, 199 cổng, dựng trong khoảng 2 ms) cùng `applyAction`, `deriveInputs`, `computeTimeline` của SDK, đúng vòng lặp vault dùng. Danh sách bước prerender (để có nội dung khi chưa nạp JS) là hằng số trong `sim-days.ts`; `sim.test.ts` buộc hằng số bằng đúng kết quả SDK. Giá: đổi circuit mà quên chạy test thì trang chủ nói sai ngày; test hỏng ngay.
9. **Chunk nặng của trang chủ chờ thao tác đầu.** Mô phỏng (SDK + circuits), ogl và `useStats` (nạp chunk chain) chỉ mount sau `pointerdown`, `pointermove`, `keydown`, `wheel`, `touchstart` hoặc `scroll` đầu tiên. Giá: ai chỉ đọc bằng trình đọc màn hình mà không thao tác vẫn có danh sách bước tĩnh và nút "Count from the chain".
10. **`/me/` đọc chain bằng `vaultsOf`, không bằng `scan`.** Spec §5.6 ghi `scan` cho bản deweb. `vaultsOf` đọc chỉ mục theo tài khoản của factory rồi đọc lại `owner`, `heirs`, `guardians`, `state` của từng vault ở cùng một block (SDK `read/vaults.ts`), nên vai trò luôn là vai trò hiện tại; `scan` phải đọc log từ block của factory với giới hạn 100 block mỗi lần của RPC X Layer. Bản vercel hiện danh sách của backend ngay, mỗi vault chỉ có trạng thái sau khi chain xác nhận; chain thắng khi hai bên khác nhau. Giá: chỉ thấy 100 vault mới nhất của một ví.
11. **Trang huỷ email cần một cú bấm.** Máy quét link của email doanh nghiệp mở link và có khi chạy JS; nếu trang tự gửi `POST /unsubscribe`, người dùng bị huỷ mà không hay. Huỷ một chạm đúng RFC 8058 vẫn có qua header `List-Unsubscribe` (backend). Trang xác nhận thì tự gửi một lần (double opt-in chuẩn). Giá: thêm một cú bấm khi huỷ từ web.
12. **Token sau `#` được kiểm và xoá khỏi thanh địa chỉ.** `TOKEN_RE = /^[A-Za-z0-9_-]{43}$/` chép từ backend (`apps/backend/src/crypto.ts` trên `feat/backend`); token sai dạng không bao giờ được gửi. Trang đọc hash một lần rồi `replaceHash('')`, để token không nằm trong lịch sử, ảnh chụp hay link chia sẻ. Giá: Plan 8 đổi dạng token thì phải sửa hằng số này (test `alerts.test.tsx` chỉ ra chỗ).
13. **Chuỗi giao diện:** mọi file `.messages.ts` của plan này là file mới: `proof`, `story`, `me`, `join`, `alerts`, `status`, `developers`, `privacy`, `not-found`. Plan 7A không port chuỗi của `status` và `developers` (đã kiểm: 7A không tạo hai file này); trang cũ trong `apps/web-legacy/src/pages/` chỉ để tham khảo, chữ được viết lại cho trang mới. Khoá hero trong `home.messages.ts` của 7A giữ nguyên (test của 7A đọc chúng). Giá: nếu 7B lỡ tạo cùng tên file thì Task 10 phải gộp khoá thay vì tạo mới.
14. **Một ảnh OG dùng chung** (thứ tự cắt mục 2). Thẻ `og:image` và `twitter:image` cần URL tuyệt đối, nên chỉ bản vercel có, và chỉ khi biết origin (`NEXT_PUBLIC_SITE_URL`, hoặc `VERCEL_PROJECT_PRODUCTION_URL` mà Vercel tự đặt). Bản deweb không có URL tuyệt đối nào trong HTML (quét on-chain của gateway). Ảnh vẽ bằng `scripts/og-image.ts` (Chromium của Playwright, netlist thật, font tự host) rồi commit, không sinh lúc build: satori của `next/og` không đọc woff2, và file `opengraph-image` luôn thêm `og:image` tuyệt đối vào cả bản deweb. `og.png` không lên DeWEB (chỉ bản vercel dùng; mỗi byte on-chain tốn gas). Giá: quên chạy `npm run og` sau khi đổi hero thì ảnh cũ.
15. **Chuyển hẳn (Task 12):** bỏ GitHub Pages (spec §10: "GitHub Pages: bỏ"); fallback của DeWEB thành `404.html` (đường dẫn lạ ra trang 404 có gợi ý thay vì trang chủ sai URL); `TEXT_ONLY_HOSTS` sửa theo đúng báo cáo của `site:check` trên bản mới; `webUrl` của deployment thành `SITE_URL` (Vercel là bản chính, spec §10; runbook DeWEB thôi ghi đè `webUrl`). Vì fallback giờ là trang 404, `site:check` theo mọi link nội bộ của cả site (trước chỉ docs), để link hỏng không lặng lẽ rơi vào 404. Job CI `web-next` đổi tên thành `web` (repo không có branch protection, đã kiểm) và chạy thêm `test:site` cùng một bản build DeWEB có URL sentinel. `prefetch={false}` của 7A (Quyết định 22, "cho tới khi có route đích") được bỏ. URL docs (`DOCS_BASE_URL`, `$id` của schema CLI, `homepage` của plugin) giữ nguyên cho Plan 6. Giá: nếu npm publish 0.1.0 xảy ra trước Task 12, các gói mang `webUrl` github.io (rủi ro mở).
16. **`settle()` bỏ qua animation theo cuộn.** Animation có `timeline` khác `document.timeline` (scroll-driven) không bao giờ "xong", làm `settle()` của 7A treo 10 giây rồi hỏng. Hiện cảnh chỉ bằng `transform` (không `opacity`), vì axe đo tương phản trên chữ đang mờ sẽ báo lỗi.
17. **Ngưỡng sức khoẻ ở `/status/`:** chỉ mục trễ khi cập nhật cũ hơn 5 phút hoặc lệch hơn 100 block; integrity hỏng khi `ok = false`, cũ khi quá 30 phút; keeper cảnh báo khi chạy thử (`dryRun`), cũ khi quá 5 phút, ít gas khi dưới 0,005 OKB (`5e15` wei). Giá: ngưỡng sai chỉ đổi màu một dòng, không chặn gì.

**Đã kiểm bằng công cụ (23/11/2026):**
- `circuits/src/sim.ts`: `Program { nIn, nOut, nState, nSignals, ops: Int32Array (bước 4: [0, out, a, b] là NAND, [1, out, slot, 0] là LATCH), latchD, outIdx, gateCount }`. Chạy trên `circuits/dist`: 224 tín hiệu, 23 input và 3 latch ở độ sâu 0, 196 NAND, 392 dây, không dây nào từ hằng số, độ sâu tối đa 39, output release (`outIdx[2]`) ở độ sâu 36, đường lùi theo input sâu hơn dài 37 nút và bắt đầu ở một input.
- SDK (`packages/sdk/dist`): mô phỏng với `PRESETS.sixMonths`, k = 1, hai giám hộ: báo động ngày 180, xác nhận ngày 183, nhận ngày 194; không xác nhận thì nhận ngày 450 (15 kỳ); chủ ví check-in ngày 187 thì về `active`, báo động kế ngày 367, nhận ngày 637. Khôi phục với k = 2, ba giám hộ: phiếu ngày 10 (vẫn `active`), phiếu ngày 12 (`recovery`), chuyển ngày 26; check-in ngày 20 thì về `active`.
- `ogl@1.0.11` (đọc tarball qua `npm pack`): `Renderer({ canvas, dpr, alpha, antialias, premultipliedAlpha })`, `setSize(w, h)` đặt cả style px, `render({ scene })` chạy không cần camera, `Program(gl, { vertex, fragment, uniforms, transparent, cullFace, depthTest, depthWrite })` với `program.program` là `WebGLProgram`, `Geometry(gl, { name: { size, data } })`, `Mesh(gl, { geometry, program, mode })`, `Transform`, `setParent`. Không xử lý mất context; không context thì `console.error` rồi ném lỗi.
- `packages/mcp/src/tools.ts` có `atropyle_check_plan`, `atropyle_simulate`, `atropyle_prepare_create_vault`. `.claude-plugin/plugin.json` chạy `npx -y @atropyle/mcp@0.1.0`; marketplace và plugin cùng tên `atropyle`; CLI là gói `atropyle` 0.1.0.
- Backend (`feat/backend`, `.claude/worktrees/backend`): bảng `subscriptions` lưu email, vault, vai trò, ngôn ngữ, trạng thái, hash của token xác nhận và token huỷ, thời điểm tạo và xác nhận; đăng ký chưa xác nhận bị xoá sau 48 giờ; khoá rate limit là HMAC của IP hoặc email, xoá sau 24 giờ; `deliveries` xoá theo `subscriptions` (cascade); README chọn vùng Supabase Southeast Asia (Singapore).
- `scripts/lib/seed.ts`: chủ của `simple`, `guarded`, `grace` là `ANVIL[1]`; `ANVIL[2]` là người thừa kế của cả ba; `guarded` có giám hộ `ANVIL[3]`, `ANVIL[4]`, `ANVIL[5]` và `ANVIL[5]` còn là người thừa kế 30 %. E2E web cũ: chạy proof trên devnet trả `POLICY_UNAVAILABLE`; `ANVIL[8]` không phải vault (`NOT_VAULT`).
- `deployments/xlayer.json`: `explorerUrl` `https://www.oklink.com/xlayer`, `circuits.kofn5 = 1`, `circuits.ge4 = 2`, keccak của ba netlist, `webUrl` github.io. Không test nào ghim `webUrl`; `npm run deployments:sync` sinh lại `packages/sdk/src/deployments/xlayer.ts`.
- `next/og` của next 16.4.6 (worktree backend): bộ đọc font của satori chỉ nhận chữ ký TrueType, `OTTO`, `wOFF` ("Unsupported OpenType signature"), không có `wOF2`.
- Script site (`scripts/build-site.ts`, `lib/site-build.ts`, `lib/site-check.ts`, `lib/deweb.ts`): fallback mặc định `index.html`; `deweb-cli`, `deweb-local`, `deweb-fork` gọi `deweb:publish` trên site không có `404.html`. `gh api …/branches/main/protection` và `…/rulesets` trả 403 (repo private, không Pro): không có check bắt buộc. Backend dựng link email bằng secret `SITE_URL` (`apps/backend/src/config.ts`).

## Review Focus

1. **Link mời bị sửa hoặc hỏng** (`#<vault>.<role>` sai checksum, thiếu vai trò, vai trò lạ, thêm phần thừa): trang không gọi chain với dữ liệu rác, nói rõ link hỏng, và không bao giờ hiện form đăng ký cho vault không tồn tại. Test: Task 9 `invite.test.ts` và `join.spec.ts`.
2. **Link xác nhận hoặc huỷ email mở hai lần, mở trong StrictMode, bị máy quét mở, hoặc token sai dạng:** xác nhận gửi đúng một `POST`, huỷ không gửi gì khi chưa bấm, token sai dạng không gửi gì. Test: Task 9 `alerts.test.tsx`.
3. **Bản đồ proof giữa chừng, chạy lại, hay đổi theme:** chấm không bao giờ sai chỗ hay sót, chạy lại bắt đầu từ nền, đổi theme vẽ lại đúng màu mà không mất tiến độ. Test: Task 2 `paint.test.ts` và `proof-canvas.test.tsx`.
4. **Backend và chain không khớp ở `/me/`:** vault backend có mà chain không xác nhận vai trò thì không hiện; vault trùng (khác hoa thường) chỉ hiện một lần; trạng thái chỉ lấy từ chain. Test: Task 8 `me-merge.test.ts`.
5. **Không có WebGL, mất context, reduced motion, Save-Data:** hero vẫn đầy đủ bằng SVG, không lỗi console, WebGL không khởi động khi không nên. Test: Task 5 `hero-gl.test.ts` và `home.spec.ts`.

---

## File Structure

```
circuits/src/verify.ts                         (sửa) VerifyOptions.progressEvery
circuits/test/verify-progress.test.ts          (mới)
packages/sdk/src/verify/policy.ts              (sửa) VerifyPolicyOptions.progressEvery
packages/sdk/test/unit/verify-policy.test.ts   (sửa) thêm một test
apps/web/
  package.json                                 (sửa) @atropyle/circuits, ogl, script geometry và og
  .size-limit.mjs                              (không sửa: tự đo trang mới)
  public/og.png  icon-192.png  icon-512.png  manifest.webmanifest       (Task 11)
  scripts/geometry.ts                          sinh src/home/netlist-geometry.ts
  scripts/lib/netlist-layout.ts                toạ độ netlist (thuần)
  scripts/og-image.ts                          ảnh OG và icon bằng Chromium của Playwright
  scripts/lib/lighthouse-score.ts              (sửa) thêm '/proof/'
  src/workers/verify.worker.ts                 (sửa) PROGRESS_EVERY = 4096
  src/lib/css-color.ts  count.ts  use-first-interaction.ts  use-in-view.ts  route-suggest.ts
  src/config/site.ts                           siteUrlOf, socialMetadata, OG_IMAGE
  src/content/commands.ts  sdk-snippet.ts      lệnh cài và đoạn SDK 10 dòng
  src/proof/paint.ts  use-palette.ts  particles.ts  proof-canvas.tsx
           use-proof-run.ts  use-stagger.ts  loupe-math.ts  loupe.tsx
  src/home/netlist-geometry.ts                 (sinh) VIEW, DEPTHS, WIRES, NODES, THREAD
           weave-path.ts  weave-svg.tsx  hero.tsx (thay)  home.css
           weave-gl-geometry.ts  use-hero-gl.ts  hero-gl.tsx  impl/weave-gl.ts
           sim-days.ts  impl/sim.ts  scene.tsx  sim-box.tsx  how-it-works.tsx  recovery-scene.tsx
           mini-proof.tsx  trust-scene.tsx  agent-lines.ts  agent-scene.tsx  stats-scene.tsx  story.tsx
  src/messages/proof  story  me  join  alerts  status  developers  privacy  not-found   (.messages.ts, đều mới)
  src/app/page.tsx  layout.tsx  not-found.tsx  apple-icon.png (sinh)  (sửa trừ apple-icon)
  src/app/proof/page.tsx  proof-page.tsx  proof-view.tsx
  src/app/me/page.tsx  me-page.tsx  merge.ts
  src/app/join/page.tsx  join-page.tsx  invite.ts
  src/app/alerts/token.ts  alerts-view.tsx
  src/app/alerts/confirm/page.tsx  confirm-page.tsx
  src/app/alerts/unsubscribe/page.tsx  unsubscribe-page.tsx
  src/app/status/page.tsx  status-page.tsx  health.ts  impl/diagnostics.ts
  src/app/developers/page.tsx  developers-page.tsx
  src/app/privacy/page.tsx  privacy-page.tsx
  src/app/e2e/proof/page.e2e.tsx  bundle.ts  src/app/e2e/mini-proof/page.e2e.tsx   (chỉ build e2e)
  test/unit/  paint  proof-canvas  commands  loupe  use-proof-run  proof-view  netlist-geometry  weave-path
              hero-gl  sim  agent-lines  me-merge  invite  alerts  diagnostics  health  sdk-snippet  route-suggest  site
  test/build/home.test.ts  social.test.ts  paths.ts (sửa)  global-setup.ts (sửa)
  test/e2e/screens.spec.ts  proof.spec.ts  home.spec.ts  me.spec.ts  join.spec.ts  pages.spec.ts
  test/e2e/helpers.ts                           (sửa) settle()
.gitignore  biome.json                          (sửa) apps/web/screens/, file sinh ra
Task 12 (chuyển hẳn): xoá apps/web-legacy, job CI `web` cũ, scripts/test/site/{ci-web,deweb-bundle}.test.ts;
  đổi tên job `web-next` → `web` và ci-web-next.test.ts → ci-web.test.ts;
  sửa scripts/build-site.ts, check-site.ts, deweb-publish.ts, write-deployment.ts, lib/{site-build,site-check,site-files,deweb,onchain-check}.ts,
  test/site/{site-build,site-check,deweb,deweb-cli,deweb-local,deweb-fork,onchain-check}.test.ts, .github/workflows/ci.yml,
  deployments/xlayer.json, packages/sdk/src/deployments/xlayer.ts (sinh lại), packages/sdk/README.md, docs/deployments.md,
  AGENTS.md, apps/web/README.md, .gitignore, biome.json, package-lock.json, các file apps/web/src có prefetch={false}
```

## Thứ tự và điều kiện

- Plan 7A phải đã merge (mọi interface ở mục `## Interfaces for Plan 7B` có thật).
- Task 1 → 2 → 3 theo thứ tự (proof). Task 4 → 5 → 6 → 7 theo thứ tự (trang chủ). Task 8 và 10 độc lập sau Task 3 (dùng harness chụp màn hình của Task 3); Task 11 sau Task 3 và Task 4 (test build đọc `proof/index.html`; ảnh OG vẽ từ `weave-path.ts` và `netlist-geometry.ts`).
- **Task 9 cần task `SubscribeForm` của Plan 7B đã merge** (`apps/web/src/components/subscribe/SubscribeForm.tsx`, giao diện cố định ở đầu Task 9).
- **Task 12 cần cả Plan 7B đã merge, mọi trang đã có, và `SITE_URL` (origin https của bản vercel) do controller đưa.**
- `LIGHTHOUSE_ROUTES`: Plan 7B thêm `'/create/'` vào cùng dòng. Task 3 thêm `'/proof/'` vào mảng đang có, không ghi đè.

---

### Task 1: Nhịp tiến độ của proof (`progressEvery`)

Bản đồ proof (Task 2) sơn theo `onProgress`. Hiện circuits chỉ báo mỗi 65 536 block và không báo ở block cuối khi tổng không chia hết (Quyết định 1).

**Files:**
- Modify: `circuits/src/verify.ts:29-34` (`VerifyOptions`), `:43-44` (kiểm tham số), `:74` (điều kiện gọi)
- Create: `circuits/test/verify-progress.test.ts`
- Modify: `packages/sdk/src/verify/policy.ts:92-96` (`VerifyPolicyOptions`), `:258` (truyền xuống)
- Modify: `packages/sdk/test/unit/verify-policy.test.ts` (thêm một test cuối `describe('evaluatePolicyBundle')`, trước dòng `});` số 145)
- Modify: `apps/web/src/workers/verify.worker.ts`

**Interfaces:**
- Consumes: không.
- Produces: `VerifyOptions.progressEvery?: number` (circuits), `VerifyPolicyOptions.progressEvery?: number` (SDK). Worker web gọi `onProgress` mỗi 4096 block và luôn ở block cuối (`done === total`).

- [ ] **Step 1: Test của circuits**

`circuits/test/verify-progress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildAll } from '../src/policy';
import { verifyPolicy } from '../src/verify';

const program = buildAll().program;

describe('verifyPolicy progress', () => {
  it('reports every progressEvery blocks and always at the last block', () => {
    const calls: [number, number][] = [];
    verifyPolicy(program, { blocks: 10, progressEvery: 4, onProgress: (d, t) => calls.push([d, t]) });
    expect(calls).toEqual([
      [4, 10],
      [8, 10],
      [10, 10],
    ]);
  });

  it('keeps the 65 536-block default and still ends at done === total', () => {
    const calls: number[] = [];
    verifyPolicy(program, { blocks: 70_000, onProgress: (d) => calls.push(d) });
    expect(calls).toEqual([65_536, 70_000]);
  });

  it('refuses a cadence that is not a positive whole number', () => {
    for (const progressEvery of [0, -1, 1.5, Number.NaN]) {
      expect(() => verifyPolicy(program, { blocks: 1, progressEvery })).toThrow('progressEvery');
    }
  });
});
```

- [ ] **Step 2: Chạy, thấy hỏng**

Run: `npm test -w circuits -- verify-progress`
Expected: FAIL. Test đầu nhận `[]` (không lần nào dưới 65 536 block), test hai nhận `[65536]`, test ba không ném lỗi.

- [ ] **Step 3: Sửa circuits**

Trong `circuits/src/verify.ts`, thay `VerifyOptions`:

```ts
export interface VerifyOptions {
  maxFailures?: number;
  onProgress?: (done: number, total: number) => void;
  /** Blocks between two onProgress calls (default 65 536). The last block always reports, so a run ends at done === total. */
  progressEvery?: number;
  /** Test hook: enumerate only the first `blocks` blocks of 32 combinations. */
  blocks?: number;
}
```

Ngay sau dòng `const maxFailures = opts.maxFailures ?? 16;` thêm:

```ts
  const every = opts.progressEvery ?? 0x10000;
  if (!Number.isSafeInteger(every) || every < 1) {
    throw new Error(`progressEvery must be a positive whole number, got ${every}`);
  }
```

Thay dòng gọi tiến độ trong vòng lặp (dòng 74):

```ts
    if (opts.onProgress && ((blk + 1) % every === 0 || blk + 1 === blocks)) opts.onProgress(blk + 1, blocks);
```

Run: `npm test -w circuits`
Expected: PASS toàn bộ, gồm 3 test mới.

- [ ] **Step 4: Test của SDK**

Trong `packages/sdk/test/unit/verify-policy.test.ts`, thêm vào cuối `describe('evaluatePolicyBundle', …)`:

```ts
  it('reports progress at the cadence it is given', async () => {
    const calls: [number, number][] = [];
    await evaluatePolicyBundle(bundle(), { blocks: 10, progressEvery: 4, onProgress: (d, t) => calls.push([d, t]) });
    expect(calls).toEqual([
      [4, 10],
      [8, 10],
      [10, 10],
    ]);
  });
```

Run: `npm run build -w circuits && npm test -w packages/sdk -- verify-policy`
Expected: FAIL. Vitest không kiểm kiểu, nên test chạy và nhận `[[10, 10]]`: SDK chưa truyền `progressEvery`, còn circuits mới vẫn báo ở block cuối.

- [ ] **Step 5: Sửa SDK**

Trong `packages/sdk/src/verify/policy.ts`, thay `VerifyPolicyOptions`:

```ts
export interface VerifyPolicyOptions {
  onProgress?: (done: number, total: number) => void;
  /** Blocks between two onProgress calls; the circuits default is 65 536. The web worker asks for 4096 to paint its map. */
  progressEvery?: number;
  /** Test hook: enumerate only `blocks` × 32 combinations. Omit for the full 2^26 proof. */
  blocks?: number;
}
```

Thay dòng gọi `proveProgram`:

```ts
    const report = proveProgram(fetched.program, {
      onProgress: o.onProgress,
      progressEvery: o.progressEvery,
      blocks: o.blocks,
      maxFailures: 16,
    });
```

Run: `npm run build && npm test -w packages/sdk`
Expected: PASS toàn bộ. `npm run build` ở gốc dựng circuits rồi SDK, nên web và các gói khác đọc `dist` mới.

- [ ] **Step 6: Worker web xin 4096**

Trong `apps/web/src/workers/verify.worker.ts` (bản port ở Task 12 của Plan 7A), thêm hằng số ngay trên `scope.onmessage`:

```ts
/** 4096 blocks = 256 dots per state on the 1024 × 1024 proof map: 512 calls for the full run, posted at most every 100 ms. */
const PROGRESS_EVERY = 4096;
```

và truyền nó vào lời gọi `evaluatePolicyBundle` của file, cạnh `blocks`. Lời gọi sau khi sửa:

```ts
    const result = await evaluatePolicyBundle(e.data.bundle, {
      blocks: e.data.blocks,
      progressEvery: PROGRESS_EVERY,
      onProgress: (done, total) => {
        const now = Date.now();
        if (now - last >= 100 || done === total) {
          last = now;
          scope.postMessage({ type: 'progress', done, total });
        }
      },
    });
```

Giữ nguyên phần còn lại của file (import, kiểu `scope`, nhánh `result` và `error`). Nếu 7A đặt tên biến khác `last` hay `scope`, giữ tên của 7A; chỉ thêm `PROGRESS_EVERY`, `progressEvery` và điều kiện `|| done === total`.

Run: `npm test -w apps/web -- verify && npm run worker:check -w apps/web`
Expected: PASS; `worker-check: PASS`.

- [ ] **Step 7: Kiểm toàn bộ và commit**

```bash
npm run typecheck
npx biome check --write circuits/src/verify.ts circuits/test/verify-progress.test.ts packages/sdk/src/verify/policy.ts packages/sdk/test/unit/verify-policy.test.ts apps/web/src/workers/verify.worker.ts
npx biome ci .
git add circuits/src/verify.ts circuits/test/verify-progress.test.ts packages/sdk/src/verify/policy.ts packages/sdk/test/unit/verify-policy.test.ts apps/web/src/workers/verify.worker.ts
git commit -m "feat(circuits): progressEvery, and the web proof worker reports every 4096 blocks" -m "The proof map of /proof/ paints from onProgress; 65 536-block steps gave 32 ticks per run and none below 65 536 blocks. The last block now always reports." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Bản đồ proof (painter, canvas, hạt)

Khoảnh khắc chữ ký §4.6.1: hình vuông 1024 × 1024, mỗi chấm 64 trường hợp, sơn dần theo worker. Task này làm phần thuần (toạ độ, màu, sơn từng đoạn) và component `ProofCanvas`. Task 3 và Task 7 dùng nó.

**Files:**
- Create: `apps/web/src/lib/css-color.ts`, `apps/web/src/proof/paint.ts`, `apps/web/src/proof/use-palette.ts`, `apps/web/src/proof/particles.ts`, `apps/web/src/proof/proof-canvas.tsx`
- Test: `apps/web/test/unit/paint.test.ts`, `apps/web/test/unit/proof-canvas.test.tsx`

**Interfaces:**
- Consumes (7A): `useTheme()` (`@/theme/provider`), `usePrefersReducedMotion()` (`@/motion/provider`), `cn` (`@/lib/cn`), `renderWithProviders` (`test/helpers/render.tsx`).
- Produces:
  - `src/lib/css-color.ts`: `type Rgb = [number, number, number]`; `parseHexColor(raw: string): Rgb | null`; `cssVar(name: string, el?: Element): string`.
  - `src/proof/paint.ts`: `PROOF_BLOCKS = 2 ** 21`; `TOTAL_CASES = 2 ** 26`; `CASES_PER_DOT = 64`; `interface ProofGrid { comboBits; hBits; half; w; h; size; perRegion }` (mọi trường là `number`); `comboBitsOf(blocks: number): number`; `proofGrid(comboBits: number): ProofGrid`; `pixelsDone(doneBlocks: number): number`; `pixelOf(g: ProofGrid, s: number, p: number): { x: number; y: number }`; `cellAt(g: ProofGrid, x: number, y: number): { s: number; p: number }`; `type ProofToken`; `STATE_TOKENS`; `BASE_TOKEN`; `FALLBACK`; `SHADES`; `interface ProofPalette { theme: 'light' | 'dark'; base: Rgb; states: Rgb[][] }`; `readPalette(read: (t: ProofToken) => string, theme: 'light' | 'dark'): ProofPalette`; `fillBase(data: Uint8ClampedArray, palette: ProofPalette): void`; `interface DirtyRect { s; x; y; w; h }`; `paintRange(data, g, palette, from: number, to: number): DirtyRect[]`.
  - `src/proof/use-palette.ts`: `useProofPalette(): ProofPalette`.
  - `src/proof/particles.ts`: `FX_SIZE = 256`; `interface Burst { emit(rects: readonly DirtyRect[], palette: ProofPalette): void; destroy(): void }`; `createBurst(canvas: HTMLCanvasElement, gridSize: number): Burst | null`.
  - `src/proof/proof-canvas.tsx`: `interface ProofCanvasProps { comboBits: number; doneBlocks: number; label: string; pick?: { x: number; y: number } | null; onPick?(at: { x: number; y: number }): void; testId?: string; className?: string }`; `ProofCanvas(p: ProofCanvasProps): JSX.Element`. Thuộc tính trên `<canvas>`: `data-testid` (mặc định `proof-canvas`), `data-done`, `data-painted` (8 × số chấm đã sơn mỗi vùng), `data-size`, `data-generation` (tăng mỗi lần vẽ lại từ nền), `data-ticks` (số lần sơn thêm), `data-fx` (`on` | `off`).

- [ ] **Step 1: Test phần thuần**

`apps/web/test/unit/paint.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseHexColor } from '../../src/lib/css-color';
import {
  cellAt,
  comboBitsOf,
  fillBase,
  PROOF_BLOCKS,
  paintRange,
  pixelOf,
  pixelsDone,
  proofGrid,
  readPalette,
} from '../../src/proof/paint';

describe('proof map geometry', () => {
  it('gives a square map for every run size the site uses', () => {
    expect(comboBitsOf(PROOF_BLOCKS)).toBe(26);
    expect(proofGrid(26)).toMatchObject({ size: 1024, w: 256, h: 512, perRegion: 2 ** 17 });
    expect(proofGrid(comboBitsOf(2 ** 19)).size).toBe(512);
    expect(proofGrid(comboBitsOf(2 ** 17)).size).toBe(256);
    expect(proofGrid(16).size).toBe(32);
    expect(() => proofGrid(25)).toThrow('no square map');
    expect(() => comboBitsOf(3)).toThrow('power of two');
  });

  it('places every dot exactly once and finds it again', () => {
    const g = proofGrid(16);
    const seen = new Set<number>();
    for (let s = 0; s < 8; s++) {
      for (let p = 0; p < g.perRegion; p++) {
        const { x, y } = pixelOf(g, s, p);
        seen.add(y * g.size + x);
        expect(cellAt(g, x, y)).toEqual({ s, p });
      }
    }
    expect(seen.size).toBe(g.size * g.size);
  });

  it('counts a dot only when its 16 blocks are done', () => {
    expect(pixelsDone(15)).toBe(0);
    expect(pixelsDone(16)).toBe(1);
    expect(pixelsDone(1000)).toBe(62);
  });
});

describe('proof map paint', () => {
  const g = proofGrid(16);
  const dark = readPalette(() => '', 'dark');
  const fresh = () => {
    const data = new Uint8ClampedArray(g.size * g.size * 4);
    fillBase(data, dark);
    return data;
  };
  const rgbAt = (data: Uint8ClampedArray, x: number, y: number) => {
    const i = (y * g.size + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };

  it('paints in many small steps exactly like in one go', () => {
    const once = fresh();
    paintRange(once, g, dark, 0, g.perRegion);
    const steps = fresh();
    for (let p = 0; p < g.perRegion; p += 5) paintRange(steps, g, dark, p, Math.min(p + 5, g.perRegion));
    expect(steps).toEqual(once);
  });

  it('colours a dot by its starting state and leaves unchecked dots as the base', () => {
    const data = fresh();
    const rects = paintRange(data, g, dark, 0, 1);
    expect(rgbAt(data, 0, 0)).toEqual([92, 200, 176]); // alive, dark theme
    const grace = pixelOf(g, 1, 0);
    expect(rgbAt(data, grace.x, grace.y)).toEqual([240, 162, 59]); // grace, dark theme
    expect(rgbAt(data, 1, 0)).toEqual([0x20, 0x25, 0x2f]); // dot 1 of state 0: not checked yet
    expect(rects).toHaveLength(8);
    expect(rects[0]).toEqual({ s: 0, x: 0, y: 0, w: 1, h: 1 });
    expect(paintRange(data, g, dark, 3, 3)).toEqual([]);
  });

  it('reads the theme tokens and falls back to the values of Plan 7A', () => {
    expect(readPalette(() => '', 'light').base).toEqual([0xe7, 0xdf, 0xd1]);
    const custom = readPalette((t) => (t === 'alive' ? '#010203' : ''), 'dark');
    expect(custom.states[0][0]).toEqual([1, 2, 3]);
    expect(parseHexColor(' #A0b1C2 ')).toEqual([160, 177, 194]);
    expect(parseHexColor('rgb(1, 2, 3)')).toBeNull();
  });
});
```

Run: `npm test -w apps/web -- paint`
Expected: FAIL, không tìm thấy `../../src/proof/paint`.

- [ ] **Step 2: `css-color.ts` và `paint.ts`**

`apps/web/src/lib/css-color.ts`:

```ts
export type Rgb = [number, number, number];

/** `#rrggbb` only: the theme tokens of Plan 7A are written that way; anything else returns null. */
export function parseHexColor(raw: string): Rgb | null {
  const m = /^#([0-9a-f]{6})$/i.exec(raw.trim());
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** The computed value of a CSS custom property, '' when it is not set (tests, old engines). */
export function cssVar(name: string, el: Element = document.documentElement): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}
```

`apps/web/src/proof/paint.ts`:

```ts
import { parseHexColor, type Rgb } from '@/lib/css-color';

/** Blocks of 32 cases in the full proof (circuits FULL_BLOCKS): 2^21 × 32 = 2^26 cases. */
export const PROOF_BLOCKS = 2 ** 21;
export const TOTAL_CASES = PROOF_BLOCKS * 32;
/** One dot is 64 consecutive inputs of one starting state; the worker finishes them in 16 blocks. */
export const CASES_PER_DOT = 64;
const BLOCKS_PER_DOT = 16;

/**
 * The map of 2^comboBits cases. Eight regions, 4 across and 2 down, one per starting state s (column s & 3,
 * row s >> 2); each region is w wide and 2w high and holds perRegion = 2^hBits dots in Morton (Z) order.
 */
export interface ProofGrid {
  comboBits: number;
  hBits: number;
  half: number;
  w: number;
  h: number;
  size: number;
  perRegion: number;
}

export function comboBitsOf(blocks: number): number {
  const bits = Math.log2(blocks);
  if (!Number.isInteger(bits)) throw new Error(`blocks must be a power of two, got ${blocks}`);
  return bits + 5;
}

export function proofGrid(comboBits: number): ProofGrid {
  const hBits = comboBits - 9;
  if (!Number.isInteger(hBits) || hBits < 7 || hBits % 2 === 0) {
    throw new Error(`no square map for 2^${comboBits} cases`);
  }
  const half = (hBits - 1) / 2;
  const w = 2 ** half;
  return { comboBits, hBits, half, w, h: 2 * w, size: 4 * w, perRegion: 2 ** hBits };
}

/** Dots finished in every region after `doneBlocks` blocks. */
export function pixelsDone(doneBlocks: number): number {
  return Math.floor(doneBlocks / BLOCKS_PER_DOT);
}

/** Canvas position of dot p of state s: even bits of p go to x, odd bits to y, the top bit adds w to y. */
export function pixelOf(g: ProofGrid, s: number, p: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (let i = 0; i < g.half; i++) {
    x |= ((p >>> (2 * i)) & 1) << i;
    y |= ((p >>> (2 * i + 1)) & 1) << i;
  }
  if ((p >>> (2 * g.half)) & 1) y += g.w;
  return { x: (s & 3) * g.w + x, y: (s >> 2) * g.h + y };
}

/** The inverse of pixelOf. */
export function cellAt(g: ProofGrid, x: number, y: number): { s: number; p: number } {
  const rx = Math.min(3, Math.floor(x / g.w));
  const ry = Math.min(1, Math.floor(y / g.h));
  const lx = x - rx * g.w;
  let ly = y - ry * g.h;
  let p = 0;
  if (ly >= g.w) {
    p = 1 << (2 * g.half);
    ly -= g.w;
  }
  for (let i = 0; i < g.half; i++) {
    p |= (((lx >>> i) & 1) << (2 * i)) | (((ly >>> i) & 1) << (2 * i + 1));
  }
  return { s: rx | (ry << 2), p };
}

export type ProofToken = 'surface-3' | 'alive' | 'grace' | 'recovery' | 'release' | 'line-strong';

/** Colour of each starting state code: 0 active, 1 grace, 3 recovery, 5 and 7 released; 2, 4 and 6 are unused codes. */
export const STATE_TOKENS: readonly ProofToken[] = [
  'alive',
  'grace',
  'line-strong',
  'recovery',
  'line-strong',
  'release',
  'line-strong',
  'release',
];
export const BASE_TOKEN: ProofToken = 'surface-3';

/** The theme tokens of Plan 7A (src/app/globals.css), used when a custom property cannot be read. */
export const FALLBACK: Record<'light' | 'dark', Record<ProofToken, string>> = {
  dark: {
    'surface-3': '#20252f',
    alive: '#5cc8b0',
    grace: '#f0a23b',
    recovery: '#7fa8ff',
    release: '#b7a6ff',
    'line-strong': '#737985',
  },
  light: {
    'surface-3': '#e7dfd1',
    alive: '#106f5a',
    grace: '#945100',
    recovery: '#2e5bc7',
    release: '#5b44c9',
    'line-strong': '#80766a',
  },
};

/** Four shades per state, picked by the top two bits of the dot index, so the map shows texture as it fills. */
export const SHADES: readonly number[] = [1, 0.84, 0.7, 0.56];

export interface ProofPalette {
  theme: 'light' | 'dark';
  base: Rgb;
  /** states[s][band]: band 0 is the token itself, the others blend towards the base. */
  states: Rgb[][];
}

export function readPalette(read: (token: ProofToken) => string, theme: 'light' | 'dark'): ProofPalette {
  const color = (t: ProofToken): Rgb => parseHexColor(read(t)) ?? (parseHexColor(FALLBACK[theme][t]) as Rgb);
  const base = color(BASE_TOKEN);
  const mix = (c: Rgb, k: number): Rgb => [
    Math.round(base[0] + (c[0] - base[0]) * k),
    Math.round(base[1] + (c[1] - base[1]) * k),
    Math.round(base[2] + (c[2] - base[2]) * k),
  ];
  return { theme, base, states: STATE_TOKENS.map((t) => SHADES.map((k) => mix(color(t), k))) };
}

export function fillBase(data: Uint8ClampedArray, palette: ProofPalette): void {
  const [r, g, b] = palette.base;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
}

export interface DirtyRect {
  s: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Paints dots [from, to) of all eight states into an RGBA buffer of g.size²; returns one bounding box per state. */
export function paintRange(
  data: Uint8ClampedArray,
  g: ProofGrid,
  palette: ProofPalette,
  from: number,
  to: number,
): DirtyRect[] {
  if (to <= from) return [];
  const shift = g.hBits - 2;
  const rects: DirtyRect[] = [];
  for (let s = 0; s < 8; s++) {
    let minX = g.size;
    let minY = g.size;
    let maxX = -1;
    let maxY = -1;
    for (let p = from; p < to; p++) {
      const { x, y } = pixelOf(g, s, p);
      const [r, gr, b] = palette.states[s][(p >>> shift) & 3];
      const i = (y * g.size + x) * 4;
      data[i] = r;
      data[i + 1] = gr;
      data[i + 2] = b;
      data[i + 3] = 255;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    rects.push({ s, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
  }
  return rects;
}
```

Run: `npm test -w apps/web -- paint`
Expected: PASS (6 test).

- [ ] **Step 3: Test component**

`apps/web/test/unit/proof-canvas.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ProofCanvas } from '../../src/proof/proof-canvas';
import { useTheme } from '../../src/theme/provider';
import { renderWithProviders } from '../helpers/render';

function Harness({ initial }: { initial: number }) {
  const [done, setDone] = useState(initial);
  const { resolved, setChoice } = useTheme();
  return (
    <>
      <ProofCanvas comboBits={22} doneBlocks={done} label="map" />
      <button type="button" onClick={() => setDone(1000)}>
        mid
      </button>
      <button type="button" onClick={() => setDone(2 ** 17)}>
        end
      </button>
      <button type="button" onClick={() => setDone(0)}>
        restart
      </button>
      <button type="button" onClick={() => setChoice(resolved === 'dark' ? 'light' : 'dark')}>
        theme
      </button>
    </>
  );
}

const attr = (name: string) => screen.getByTestId('proof-canvas').getAttribute(name);
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('ProofCanvas', () => {
  it('paints 8 dots per 16 blocks, finishes on every dot and starts over on a new run', async () => {
    renderWithProviders(<Harness initial={0} />);
    expect(attr('data-size')).toBe('256');
    click('mid');
    await waitFor(() => expect(attr('data-painted')).toBe('496'));
    click('end');
    await waitFor(() => expect(attr('data-painted')).toBe('65536'));
    const generation = Number(attr('data-generation'));
    click('restart');
    await waitFor(() => expect(attr('data-painted')).toBe('0'));
    expect(Number(attr('data-generation'))).toBe(generation + 1);
  });

  it('repaints from the base in the new colours when the theme changes, keeping the progress', async () => {
    renderWithProviders(<Harness initial={1000} />);
    await waitFor(() => expect(attr('data-painted')).toBe('496'));
    const generation = Number(attr('data-generation'));
    click('theme');
    await waitFor(() => expect(Number(attr('data-generation'))).toBe(generation + 1));
    expect(attr('data-painted')).toBe('496');
  });
});
```

Đọc `data-generation` sau `waitFor`, không ngay sau `render`: `render` của Testing Library đã chạy xong effect, và bảng màu đọc lại sau commit đầu có thể đã tăng thế hệ thêm một lần.

Run: `npm test -w apps/web -- proof-canvas`
Expected: FAIL, không tìm thấy `../../src/proof/proof-canvas`.

- [ ] **Step 4: Bảng màu, hạt và `ProofCanvas`**

`apps/web/src/proof/use-palette.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';
import { cssVar } from '@/lib/css-color';
import { useTheme } from '@/theme/provider';
import { type ProofPalette, readPalette } from './paint';

/**
 * The map colours of the current theme. Read after commit: by then the theme attribute of the new theme applies,
 * so the custom properties hold the new values.
 */
export function useProofPalette(): ProofPalette {
  const { resolved } = useTheme();
  const [palette, setPalette] = useState<ProofPalette>(() => readPalette(() => '', 'dark'));
  useEffect(() => {
    setPalette(readPalette((t) => cssVar(`--atro-${t}`), resolved));
  }, [resolved]);
  return palette;
}
```

`apps/web/src/proof/particles.ts`:

```ts
import type { DirtyRect, ProofPalette } from './paint';

/** The particle layer is a small canvas stretched over the map: cheap, and soft on purpose. */
export const FX_SIZE = 256;
const LIFE_MS = 700;
const PER_RECT = 3;
const MAX_PARTICLES = 240;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  color: string;
}

export interface Burst {
  emit(rects: readonly DirtyRect[], palette: ProofPalette): void;
  destroy(): void;
}

/** A few sparks where new dots were checked. Null without a 2D context; the map works without it. */
export function createBurst(canvas: HTMLCanvasElement, gridSize: number): Burst | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const scale = FX_SIZE / gridSize;
  let parts: Particle[] = [];
  let raf = 0;
  const tick = (now: number) => {
    ctx.clearRect(0, 0, FX_SIZE, FX_SIZE);
    parts = parts.filter((q) => now - q.born < LIFE_MS);
    for (const q of parts) {
      const age = (now - q.born) / LIFE_MS;
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x + q.vx * age * 24, q.y + q.vy * age * 24, 2, 2);
    }
    ctx.globalAlpha = 1;
    raf = parts.length > 0 ? requestAnimationFrame(tick) : 0;
  };
  return {
    emit(rects, palette) {
      const now = performance.now();
      for (const r of rects) {
        const [cr, cg, cb] = palette.states[r.s][0];
        for (let i = 0; i < PER_RECT && parts.length < MAX_PARTICLES; i++) {
          parts.push({
            x: (r.x + Math.random() * r.w) * scale,
            y: (r.y + Math.random() * r.h) * scale,
            vx: Math.random() * 2 - 1,
            vy: -Math.random(),
            born: now,
            color: `rgb(${cr} ${cg} ${cb})`,
          });
        }
      }
      if (raf === 0 && parts.length > 0) raf = requestAnimationFrame(tick);
    },
    destroy() {
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      parts = [];
      ctx.clearRect(0, 0, FX_SIZE, FX_SIZE);
    },
  };
}
```

`apps/web/src/proof/proof-canvas.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/motion/provider';
import { fillBase, type ProofPalette, paintRange, pixelsDone, proofGrid } from './paint';
import { type Burst, createBurst, FX_SIZE } from './particles';
import { useProofPalette } from './use-palette';

export interface ProofCanvasProps {
  comboBits: number;
  doneBlocks: number;
  /** Read by screen readers instead of the canvas. */
  label: string;
  /** Top-left canvas pixel of the loupe window, shown as a reticle. */
  pick?: { x: number; y: number } | null;
  onPick?(at: { x: number; y: number }): void;
  testId?: string;
  className?: string;
}

interface Painter {
  data: Uint8ClampedArray<ArrayBuffer> | null;
  image: ImageData | null;
  palette: ProofPalette | null;
  size: number;
  painted: number;
  generation: number;
  ticks: number;
}

/** Spec §4.6.1: every case of the proof as one dot of 64, painted as the worker reports. */
export function ProofCanvas({
  comboBits,
  doneBlocks,
  label,
  pick = null,
  onPick,
  testId = 'proof-canvas',
  className,
}: ProofCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const burstRef = useRef<Burst | null>(null);
  const painter = useRef<Painter>({
    data: null,
    image: null,
    palette: null,
    size: 0,
    painted: 0,
    generation: 0,
    ticks: 0,
  });
  const [meta, setMeta] = useState({ painted: 0, generation: 0, ticks: 0 });
  const grid = useMemo(() => proofGrid(comboBits), [comboBits]);
  const palette = useProofPalette();
  const reduced = usePrefersReducedMotion();

  // Spec §4.4: with reduced motion the map still fills, without sparks.
  useEffect(() => {
    const fx = fxRef.current;
    if (reduced || !fx) return;
    const burst = createBurst(fx, grid.size);
    burstRef.current = burst;
    return () => {
      burst?.destroy();
      burstRef.current = null;
    };
  }, [reduced, grid.size]);

  useEffect(() => {
    const st = painter.current;
    const target = Math.min(pixelsDone(doneBlocks), grid.perRegion);
    let from = st.painted;
    // A new map size, a new theme, or a run that starts over: repaint from the base.
    if (!st.data || st.size !== grid.size || st.palette !== palette || target < st.painted) {
      st.data = new Uint8ClampedArray(grid.size * grid.size * 4);
      st.image = null;
      fillBase(st.data, palette);
      st.size = grid.size;
      st.palette = palette;
      st.generation += 1;
      from = 0;
    }
    const rects = paintRange(st.data, grid, palette, from, target);
    if (target > from) st.ticks += 1;
    st.painted = target;
    const ctx = canvasRef.current?.getContext('2d') ?? null;
    if (ctx) {
      if (!st.image) st.image = new ImageData(st.data, grid.size, grid.size);
      if (from === 0) {
        ctx.putImageData(st.image, 0, 0);
      } else {
        for (const r of rects) ctx.putImageData(st.image, 0, 0, r.x, r.y, r.w, r.h);
        burstRef.current?.emit(rects, palette);
      }
    }
    setMeta({ painted: target * 8, generation: st.generation, ticks: st.ticks });
  }, [doneBlocks, grid, palette]);

  // Pointer only; the keyboard path is the pair of loupe sliders.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onPick) return;
    const down = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const clamp = (n: number) => Math.min(Math.max(n, 0), grid.size - 1);
      onPick({
        x: clamp(Math.floor(((e.clientX - r.left) / r.width) * grid.size)),
        y: clamp(Math.floor(((e.clientY - r.top) / r.height) * grid.size)),
      });
    };
    canvas.addEventListener('pointerdown', down);
    return () => canvas.removeEventListener('pointerdown', down);
  }, [onPick, grid.size]);

  return (
    <div
      className={cn(
        'relative aspect-square w-full overflow-hidden rounded-2xl border border-line bg-surface-3',
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        width={grid.size}
        height={grid.size}
        aria-hidden="true"
        data-testid={testId}
        data-done={doneBlocks}
        data-painted={meta.painted}
        data-size={grid.size}
        data-generation={meta.generation}
        data-ticks={meta.ticks}
        data-fx={reduced ? 'off' : 'on'}
        className={cn('block size-full [image-rendering:pixelated]', onPick && 'cursor-crosshair')}
      />
      <canvas
        ref={fxRef}
        width={FX_SIZE}
        height={FX_SIZE}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
      />
      {pick ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[2px] border-2 border-ink shadow-[0_0_0_1px_var(--atro-bg)]"
          style={{
            left: `${(pick.x / grid.size) * 100}%`,
            top: `${(pick.y / grid.size) * 100}%`,
            width: `max(${(8 / grid.size) * 100}%, 0.75rem)`,
            aspectRatio: '1',
          }}
        />
      ) : null}
      <span className="sr-only">{label}</span>
    </div>
  );
}
```

Run: `npm test -w apps/web -- proof-canvas paint`
Expected: PASS (8 test). happy-dom trả `null` cho `getContext`, nên test unit chỉ kiểm logic sơn qua `data-*`; pixel thật được kiểm ở e2e của Task 3.

- [ ] **Step 5: Kiểm toàn bộ và commit**

```bash
npm test -w apps/web
npm run typecheck
npx biome check --write apps/web/src/lib/css-color.ts apps/web/src/proof apps/web/test/unit/paint.test.ts apps/web/test/unit/proof-canvas.test.tsx
npx biome ci .
git add apps/web/src/lib/css-color.ts apps/web/src/proof/paint.ts apps/web/src/proof/use-palette.ts apps/web/src/proof/particles.ts apps/web/src/proof/proof-canvas.tsx apps/web/test/unit/paint.test.ts apps/web/test/unit/proof-canvas.test.tsx
git commit -m "feat(web): the proof map, one dot per 64 cases, painted as the worker reports" -m "Morton order inside eight regions, one per starting state; repaints from the base on a new run or a new theme; sparks only without reduced motion." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Trang `/proof/` (chạy, kính lúp, P1–P8, kết luận) và harness chụp màn hình

**Files:**
- Modify: `apps/web/package.json` (thêm `"@atropyle/circuits": "0.1.0"`), `package-lock.json`, `.gitignore` (thêm `apps/web/screens/`), `apps/web/scripts/lib/lighthouse-score.ts` (thêm `'/proof/'`)
- Create: `apps/web/src/content/commands.ts`, `apps/web/src/lib/count.ts`
- Create: `apps/web/src/proof/use-proof-run.ts`, `apps/web/src/proof/use-stagger.ts`, `apps/web/src/proof/loupe-math.ts`, `apps/web/src/proof/loupe.tsx`
- Create: `apps/web/src/messages/proof.messages.ts`
- Create: `apps/web/src/app/proof/page.tsx`, `apps/web/src/app/proof/proof-page.tsx`, `apps/web/src/app/proof/proof-view.tsx`
- Create: `apps/web/src/app/e2e/proof/bundle.ts`, `apps/web/src/app/e2e/proof/page.e2e.tsx`
- Test: `apps/web/test/unit/commands.test.ts`, `apps/web/test/unit/loupe.test.ts`, `apps/web/test/unit/use-proof-run.test.tsx`, `apps/web/test/unit/proof-view.test.tsx`, `apps/web/test/e2e/proof.spec.ts`, `apps/web/test/e2e/screens.spec.ts`

**Interfaces:**
- Consumes (7A): `sdkQuery(crossCheck)` (`@/chain/hooks`), `useChainSettings()` (`@/chain/provider`), `loadVerifyImpl()` (`@/verify/load`, `runProof(sdk, { onProgress?, blocks?, worker? }): Promise<PolicyVerification>`; có `blocks` thì luôn chạy mới, không có thì nhập lần chạy đầy đủ của phiên), `PolicyVerification` (`@/verify/types`), `PROPERTY_ORDER` (`@/verify/verify-view`), `ENV`, `explorerUrlOf` (`@/config/env`), `explorerName` (`@/lib/links`), `useT`, `useLang`, `defineMessages`, `ErrorBox`, `Address`, `Button`, `CopyButton`, `ExternalLink`, `UntrustedText`, `usePrefersReducedMotion`, `DURATION`, `sec`, `EASE_OUT_EXPO`, `m` (`motion/react`). E2E: `test`, `expect`, `ANVIL` (`./fixtures`), `settle`, `connectWallet`, `expectAccessibleInBothThemes` (`./helpers`), `state.siteUrl`, `state.seeded`.
- Consumes (Task 2): `ProofCanvas`, `proofGrid`, `comboBitsOf`, `cellAt`, `pixelsDone`, `CASES_PER_DOT`, `PROOF_BLOCKS`, `TOTAL_CASES`, `ProofGrid`, `useProofPalette`.
- Produces:
  - `src/content/commands.ts`: `MCP_PACKAGE = '@atropyle/mcp@0.1.0'`; `COMMANDS: { verify; sdk; mcp; plugin; skills }` (chuỗi); `type CommandName`.
  - `src/lib/count.ts`: `formatCount(n: number | bigint, lang: Lang, fraction?: number): string`.
  - `src/proof/use-proof-run.ts`: `type ProofStatus = 'idle' | 'loading' | 'running' | 'done' | 'error'`; `interface ProofRun { status; doneBlocks: number; totalBlocks: number; result: PolicyVerification | null; error: unknown; runs: number }`; `IDLE_RUN: ProofRun`; `interface ProofRunControls { run: ProofRun; start(): void; again(): void }`; `useProofRun(blocks?: number): ProofRunControls`.
  - `src/proof/use-stagger.ts`: `useStagger(count: number, active: boolean, reduced: boolean, stepMs?: number): number`.
  - `src/proof/loupe-math.ts`: `LOUPE = 8`; `LOUPE_PX = 64`; `LOUPE_CASES = 4096`; `interface LoupeWindow { x; y; s; p0; v0 }`; `loupeWindow(g, at): LoupeWindow`; `loupeChecked(w, doneBlocks): boolean`; `loupeCells(g, w): Uint8Array`; `countNext(cells): number[]`.
  - `src/proof/loupe.tsx`: `Loupe({ grid, doneBlocks, win, onMove })`; `data-testid="proof-loupe"`, `data-v0`, `data-checked`; hai thanh trượt tên "Loupe column" và "Loupe row".
  - `src/app/proof/proof-view.tsx`: `interface ProofViewProps { run: ProofRun; onStart(): void; onAgain(): void; explorer: string | null }`; `ProofView(p)`. Test id: `proof-run` (`data-status`), `proof-start`, `proof-again`, `proof-prop-P1` … `proof-prop-P8` (`data-state` = `pending` | `holds` | `broken`), `proof-verdict` (`data-ok`), `proof-netlist` (`data-role`).
  - `src/messages/proof.messages.ts`: `messages` (khoá ở Step 7).
  - `test/e2e/screens.spec.ts`: harness chụp màn hình mà mọi task sau dùng (cách chạy ở Step 12).

- [ ] **Step 1: Thêm `@atropyle/circuits` vào web**

Kính lúp tô mỗi trường hợp theo `refStepCode` (Quyết định 5) và trang e2e dựng bundle từ `buildAll` và `deployedNetlists`, nên web cần gói circuits của workspace (`sideEffects: false`, đã kiểm `circuits/package.json`). Trong `apps/web/package.json`, thêm vào `dependencies`, ngay trên dòng `"@atropyle/sdk"`:

```json
    "@atropyle/circuits": "0.1.0",
```

```bash
npm install
npm run lockfile:check -- --fix
npm run lockfile:check
```

Expected: `npm install` không tải gói mới (circuits là workspace, đã link); `lockfile:check` cuối in dòng PASS của nó (đủ `@emnapi/core` và `@emnapi/runtime`).

- [ ] **Step 2: Lệnh cài, định dạng số và test**

`apps/web/test/unit/commands.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COMMANDS, MCP_PACKAGE } from '../../src/content/commands';

const json = (path: string) => JSON.parse(readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8'));

describe('install commands', () => {
  it('name the packages and the plugin this repository ships', () => {
    const plugin = json('.claude-plugin/plugin.json');
    const market = json('.claude-plugin/marketplace.json');
    const mcp = json('packages/mcp/package.json');
    const cli = json('packages/cli/package.json');
    expect(MCP_PACKAGE).toBe(`${mcp.name}@${mcp.version}`);
    expect(plugin.mcpServers.atropyle.args).toEqual(['-y', MCP_PACKAGE]);
    expect(COMMANDS.mcp).toBe(`npx -y ${MCP_PACKAGE}`);
    expect(COMMANDS.verify).toBe(`npx -y ${cli.name} verify`);
    const repo = String(plugin.repository).replace('https://github.com/', '');
    expect(COMMANDS.plugin).toBe(`/plugin marketplace add ${repo}\n/plugin install ${plugin.name}@${market.name}`);
    expect(COMMANDS.skills).toBe(`npx skills add ${repo}`);
  });
});
```

Run: `npm test -w apps/web -- commands`
Expected: FAIL, không tìm thấy `../../src/content/commands`.

`apps/web/src/content/commands.ts`:

```ts
/**
 * Install and run commands shown on /proof/, /developers/ and the home page's agent scene. commands.test.ts keeps them
 * in step with .claude-plugin/ and the package.json files. The plugin and skills lines are those of
 * examples/agent-mcp-client/README.md.
 */
export const MCP_PACKAGE = '@atropyle/mcp@0.1.0';

export const COMMANDS = {
  verify: 'npx -y atropyle verify',
  sdk: 'npm install @atropyle/sdk viem',
  mcp: `npx -y ${MCP_PACKAGE}`,
  plugin: '/plugin marketplace add duongnq2798/atropyle\n/plugin install atropyle@atropyle',
  skills: 'npx skills add duongnq2798/atropyle',
} as const;

export type CommandName = keyof typeof COMMANDS;
```

`apps/web/src/lib/count.ts`:

```ts
import type { Lang } from '@/i18n/core';

/** 67,108,864 in English, 67.108.864 in Vietnamese. */
export function formatCount(n: number | bigint, lang: Lang, fraction = 0): string {
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', {
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
  }).format(n);
}
```

Run: `npm test -w apps/web -- commands`
Expected: PASS (1 test).

- [ ] **Step 3: Test kính lúp**

`apps/web/test/unit/loupe.test.ts`:

```ts
import { refStepCode } from '@atropyle/circuits';
import { describe, expect, it } from 'vitest';
import { countNext, loupeCells, loupeChecked, loupeWindow } from '../../src/proof/loupe-math';
import { cellAt, proofGrid } from '../../src/proof/paint';

const g = proofGrid(26);

describe('loupe', () => {
  it('snaps to whole 8 × 8 squares inside the map', () => {
    expect(loupeWindow(g, { x: 13, y: 5 })).toMatchObject({ x: 8, y: 0, s: 0, p0: 64, v0: 4096 });
    expect(loupeWindow(g, { x: 5000, y: -3 })).toMatchObject({ x: 1016, y: 0, s: 3 });
  });

  it('colours every case by the reference model, once all 64 of its dots are checked', () => {
    const w = loupeWindow(g, { x: 8, y: 8 });
    const cells = loupeCells(g, w);
    const { p } = cellAt(g, 9, 10); // dot (1, 2) of the window: pixels x 8–15, y 16–23
    expect(cells[(2 * 8 + 5) * 64 + 1 * 8 + 3]).toBe(refStepCode(w.s, p * 64 + 5 * 8 + 3) & 7);
    expect(countNext(cells).reduce((a, b) => a + b, 0)).toBe(4096);
    expect(loupeChecked(w, 16 * (w.p0 + 64) - 1)).toBe(false);
    expect(loupeChecked(w, 16 * (w.p0 + 64))).toBe(true);
  });
});
```

Run: `npm test -w apps/web -- loupe`
Expected: FAIL, không tìm thấy `../../src/proof/loupe-math`.

- [ ] **Step 4: `loupe-math.ts`**

```ts
import { refStepCode } from '@atropyle/circuits';
import { CASES_PER_DOT, cellAt, type ProofGrid, pixelsDone } from './paint';

/** The loupe shows LOUPE × LOUPE dots of the map, every case of each dot as one pixel. */
export const LOUPE = 8;
export const LOUPE_PX = LOUPE * 8;
export const LOUPE_CASES = LOUPE_PX * LOUPE_PX;

/**
 * An aligned 8 × 8 square of the map. Morton order makes it 64 consecutive dots p0 … p0 + 63 of one starting state s,
 * that is the 4096 consecutive inputs v0 … v0 + 4095.
 */
export interface LoupeWindow {
  x: number;
  y: number;
  s: number;
  p0: number;
  v0: number;
}

export function loupeWindow(g: ProofGrid, at: { x: number; y: number }): LoupeWindow {
  const snap = (n: number) => Math.min(Math.max(0, Math.floor(n / LOUPE) * LOUPE), g.size - LOUPE);
  const x = snap(at.x);
  const y = snap(at.y);
  const { s, p } = cellAt(g, x, y);
  return { x, y, s, p0: p, v0: p * CASES_PER_DOT };
}

export function loupeChecked(w: LoupeWindow, doneBlocks: number): boolean {
  return pixelsDone(doneBlocks) >= w.p0 + LOUPE * LOUPE;
}

/**
 * The state each case leads to (refStepCode & 7), row by row. Dot (i, j) of the window fills pixels 8i … 8i + 7 across
 * and 8j … 8j + 7 down, its 64 inputs in reading order. P8 proves the circuit on chain answers exactly like this model.
 */
export function loupeCells(g: ProofGrid, w: LoupeWindow): Uint8Array {
  const out = new Uint8Array(LOUPE_CASES);
  for (let y = 0; y < LOUPE_PX; y++) {
    for (let x = 0; x < LOUPE_PX; x++) {
      const { p } = cellAt(g, w.x + (x >> 3), w.y + (y >> 3));
      out[y * LOUPE_PX + x] = refStepCode(w.s, p * CASES_PER_DOT + (y & 7) * 8 + (x & 7)) & 7;
    }
  }
  return out;
}

export function countNext(cells: Uint8Array): number[] {
  const n = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const c of cells) n[c] += 1;
  return n;
}
```

Run: `npm test -w apps/web -- loupe`
Expected: PASS (2 test).

- [ ] **Step 5: Test `useProofRun`**

`apps/web/test/unit/use-proof-run.test.tsx` (cùng cách giả `loadVerifyImpl` và chunk chain như `verify-hooks.test.tsx` của Plan 7A):

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProofRun } from '../../src/proof/use-proof-run';
import type { PolicyVerification } from '../../src/verify/types';
import { makeWrapper } from '../helpers/render';

const impl = vi.hoisted(() => ({ runProof: vi.fn() }));
vi.mock('../../src/verify/load', () => ({ loadVerifyImpl: async () => impl }));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: (deployment: unknown) => ({ deployment, atro: {}, rpc: { read: [], verify: [] } }),
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});

type Options = { onProgress?: (done: number, total: number) => void; blocks?: number };
const full = (tag: string) => ({ ok: true, combos: 2 ** 26, tag }) as unknown as PolicyVerification;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useProofRun', () => {
  it('joins the session proof first; "run again" asks for a fresh full run', async () => {
    impl.runProof.mockImplementation(async (_sdk: unknown, o: Options) => {
      o.onProgress?.(4096, 2 ** 21);
      return full('run');
    });
    const { wrapper } = makeWrapper();
    const h = renderHook(() => useProofRun(), { wrapper });
    expect(h.result.current.run.status).toBe('idle');
    expect(impl.runProof).not.toHaveBeenCalled();

    act(() => h.result.current.start());
    await waitFor(() => expect(h.result.current.run.status).toBe('done'));
    expect(h.result.current.run.doneBlocks).toBe(2 ** 21);
    expect((impl.runProof.mock.calls[0][1] as Options).blocks).toBeUndefined();

    act(() => h.result.current.again());
    await waitFor(() => expect(h.result.current.run.runs).toBe(2));
    await waitFor(() => expect(h.result.current.run.status).toBe('done'));
    expect((impl.runProof.mock.calls[1][1] as Options).blocks).toBe(2 ** 21);
  });

  it('ignores a run that a newer run replaced', async () => {
    let finishFirst: (r: PolicyVerification) => void = () => undefined;
    impl.runProof
      .mockImplementationOnce(
        () =>
          new Promise<PolicyVerification>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(full('second'));
    const { wrapper } = makeWrapper();
    const h = renderHook(() => useProofRun(), { wrapper });
    act(() => h.result.current.start());
    await waitFor(() => expect(impl.runProof).toHaveBeenCalledTimes(1));
    act(() => h.result.current.again());
    await waitFor(() => expect(h.result.current.run.status).toBe('done'));
    await act(async () => finishFirst(full('first')));
    expect(h.result.current.run.result).toMatchObject({ tag: 'second' });
  });
});
```

Run: `npm test -w apps/web -- use-proof-run`
Expected: FAIL, không tìm thấy `../../src/proof/use-proof-run`.

- [ ] **Step 6: `useProofRun` và `useStagger`**

`apps/web/src/proof/use-proof-run.ts`:

```ts
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { sdkQuery } from '@/chain/hooks';
import { useChainSettings } from '@/chain/provider';
import { loadVerifyImpl } from '@/verify/load';
import type { PolicyVerification } from '@/verify/types';
import { PROOF_BLOCKS } from './paint';

export type ProofStatus = 'idle' | 'loading' | 'running' | 'done' | 'error';

export interface ProofRun {
  status: ProofStatus;
  /** Blocks of 32 cases the worker has finished. */
  doneBlocks: number;
  totalBlocks: number;
  result: PolicyVerification | null;
  error: unknown;
  /** Runs started on this page. */
  runs: number;
}

export const IDLE_RUN: ProofRun = {
  status: 'idle',
  doneBlocks: 0,
  totalBlocks: PROOF_BLOCKS,
  result: null,
  error: null,
  runs: 0,
};

export interface ProofRunControls {
  run: ProofRun;
  start(): void;
  again(): void;
}

/**
 * The policy proof of this build's deployment, only when the user asks (Quyết định 2 of Plan 7C). Without `blocks`,
 * start() joins the session's full proof (the one /verify/ uses too, through runProof's cache) and again() runs a fresh
 * one on this machine. With `blocks`, every run is a fresh run of that many blocks (the home page's mini proof).
 */
export function useProofRun(blocks?: number): ProofRunControls {
  const client = useQueryClient();
  const { crossCheck } = useChainSettings();
  const total = blocks ?? PROOF_BLOCKS;
  const [run, setRun] = useState<ProofRun>(() => ({ ...IDLE_RUN, totalBlocks: total }));
  const seq = useRef(0);

  // A run that ends after the page is gone changes nothing.
  useEffect(
    () => () => {
      seq.current += 1;
    },
    [],
  );

  const go = useCallback(
    (fresh: boolean) => {
      seq.current += 1;
      const id = seq.current;
      const live = () => seq.current === id;
      setRun((r) => ({ status: 'loading', doneBlocks: 0, totalBlocks: total, result: null, error: null, runs: r.runs + 1 }));
      void (async () => {
        try {
          const sdk = await client.fetchQuery(sdkQuery(crossCheck));
          const impl = await loadVerifyImpl();
          const result = await impl.runProof(sdk, {
            blocks: fresh || blocks !== undefined ? total : undefined,
            onProgress: (done, all) => {
              if (live()) setRun((r) => ({ ...r, status: 'running', doneBlocks: done, totalBlocks: all }));
            },
          });
          if (live()) setRun((r) => ({ ...r, status: 'done', doneBlocks: result.combos / 32, result }));
        } catch (error) {
          if (live()) setRun((r) => ({ ...r, status: 'error', error }));
        }
      })();
    },
    [client, crossCheck, blocks, total],
  );

  const start = useCallback(() => go(false), [go]);
  const again = useCallback(() => go(true), [go]);
  return { run, start, again };
}
```

`apps/web/src/proof/use-stagger.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

/** How many of `count` items are lit: one more every stepMs once active, all at once with reduced motion, none while inactive. */
export function useStagger(count: number, active: boolean, reduced: boolean, stepMs = 140): number {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    setLit(0);
    if (!active || reduced) return;
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setLit(n);
      if (n >= count) window.clearInterval(id);
    }, stepMs);
    return () => window.clearInterval(id);
  }, [count, active, reduced, stepMs]);
  if (!active) return 0;
  return reduced ? count : lit;
}
```

Run: `npm test -w apps/web -- use-proof-run`
Expected: PASS (2 test).

- [ ] **Step 7: Chuỗi giao diện**

`apps/web/src/messages/proof.messages.ts`:

```ts
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    eyebrow: 'The proof',
    title: 'Every case, checked in your browser',
    lead: 'The rules of every Atropyle vault are one circuit on the X Layer TapeOut processor. Nobody can change it, not even us. Your browser reads that circuit from the chain and tries all {total} situations a vault can ever be in. Each dot on the map stands for 64 of them.',
    mapTitle: 'The map of every case',
    mapLabel: 'Proof map: {done} of {total} cases checked. Colours show the state each case starts in.',
    legendTitle: 'Colour: the state a case starts in',
    stateActive: 'Normal',
    stateGrace: 'Alarm window',
    stateRecovery: 'Recovery vote',
    stateReleased: 'Released',
    stateUnused: 'Unused code',
    legendUnused: 'Unused code (the rules never reach it)',
    legendPending: 'Not checked yet',
    loupeTitle: 'Loupe: one pixel per case',
    loupeHint: 'Tap the map to move the loupe, or use the two sliders.',
    loupeColumn: 'Loupe column',
    loupeRow: 'Loupe row',
    loupeValue: '{n} of {max}',
    loupePending: 'The proof has not reached these 4,096 cases yet.',
    loupeSummary: 'Starting state: {state}. One step later: {active} normal, {grace} alarm window, {recovery} recovery vote, {released} released.',
    runTitle: 'Run it yourself',
    runBody: 'About a minute on a laptop, a few minutes on a phone. Nothing leaves your device: the work runs in a background thread of this page.',
    start: 'Run the proof',
    again: 'Run again on your machine',
    loading: 'Reading the circuit from the chain…',
    running: 'Checking…',
    progressLabel: 'Proof progress',
    progress: '{done} of {total} cases checked',
    notStarted: 'Not started yet. The map fills in as your browser checks each case.',
    liveStarted: 'Proof started.',
    livePercent: '{percent}% checked.',
    liveDone: 'Proof finished.',
    propsTitle: 'Eight rules, every case',
    propPending: 'Waiting',
    propHolds: 'Holds',
    propBroken: 'Broken',
    P1: 'Once a vault has released, it stays released and does nothing else.',
    P2: 'A check-in from the owner always brings the vault back to normal.',
    P3: 'Heirs receive only after the alarm window ends with no check-in, with a guardian confirmation or enough missed check-ins, and with no recovery vote.',
    P4: 'Assets move to a new wallet only after the window ends with no check-in and enough guardian votes for that same wallet.',
    P5: 'An alarm starts only after missed check-ins or recovery votes, never right after a check-in.',
    P6: 'The vault never lands in a state the rules do not define.',
    P7: 'The alarm, cancel and release signals always match the change of state.',
    P8: 'The circuit on chain answers exactly like the reference model, in every case.',
    verdictOk: 'All eight rules hold in every case checked.',
    verdictBroken: 'The proof failed. Do not rely on this deployment until the reasons below are explained.',
    verdictPartial: 'This run checked {combos} of {total} cases.',
    detailCases: 'Cases checked',
    verdictCases: '{combos} in {seconds} s',
    detailBlock: 'Chain block',
    blockLink: 'Block {block} on {explorer}',
    detailRpcs: 'RPC operators',
    rpcsMany: '{n} independent operators agreed on every read',
    rpcsOne: 'One operator only: a dishonest RPC could have shown different data',
    detailCpu: 'Processor',
    detailBeacon: 'Processor code frozen',
    beaconYes: 'Yes',
    beaconNo: 'No',
    beaconUnknown: 'Not recorded',
    netlistsTitle: 'The circuits, by keccak256',
    netlistGates: '{gates} gates',
    matchesSource: 'Matches the source code',
    differsSource: 'Differs from the source code',
    matchesDeploy: 'Matches the deployment record',
    differsDeploy: 'Differs from the deployment record',
    noDeploy: 'No deployment record',
    issuesTitle: 'Why it failed',
    warningsTitle: 'Notes',
    cliTitle: 'Or run it in a terminal',
    cliBody: 'The same proof, without this website. It needs Node.js 24.',
    copyCli: 'Copy the command',
  },
  {
    eyebrow: 'Bằng chứng',
    title: 'Mọi trường hợp, kiểm ngay trên trình duyệt của bạn',
    lead: 'Luật của mọi vault Atropyle là một circuit trên bộ xử lý X Layer TapeOut. Không ai sửa được nó, kể cả chúng tôi. Trình duyệt của bạn đọc circuit đó từ chain rồi thử đủ {total} tình huống mà một vault có thể gặp. Mỗi chấm trên bản đồ là 64 tình huống.',
    mapTitle: 'Bản đồ của mọi trường hợp',
    mapLabel: 'Bản đồ bằng chứng: đã kiểm {done} trên {total} trường hợp. Màu cho biết trạng thái ban đầu của từng trường hợp.',
    legendTitle: 'Màu: trạng thái ban đầu của trường hợp',
    stateActive: 'Bình thường',
    stateGrace: 'Thời gian báo động',
    stateRecovery: 'Đang bầu khôi phục',
    stateReleased: 'Đã chuyển',
    stateUnused: 'Mã không dùng',
    legendUnused: 'Mã không dùng (luật không bao giờ đi tới)',
    legendPending: 'Chưa kiểm',
    loupeTitle: 'Kính lúp: mỗi điểm ảnh là một trường hợp',
    loupeHint: 'Chạm vào bản đồ để dời kính lúp, hoặc dùng hai thanh trượt.',
    loupeColumn: 'Cột của kính lúp',
    loupeRow: 'Hàng của kính lúp',
    loupeValue: '{n} trên {max}',
    loupePending: 'Bằng chứng chưa kiểm tới 4.096 trường hợp này.',
    loupeSummary: 'Trạng thái ban đầu: {state}. Sau một bước: {active} bình thường, {grace} báo động, {recovery} bầu khôi phục, {released} đã chuyển.',
    runTitle: 'Tự chạy',
    runBody: 'Khoảng một phút trên laptop, vài phút trên điện thoại. Không gì rời khỏi máy bạn: việc kiểm chạy trong một luồng nền của trang này.',
    start: 'Chạy bằng chứng',
    again: 'Chạy lại trên máy bạn',
    loading: 'Đang đọc circuit từ chain…',
    running: 'Đang kiểm…',
    progressLabel: 'Tiến độ của bằng chứng',
    progress: 'Đã kiểm {done} trên {total} trường hợp',
    notStarted: 'Chưa chạy. Bản đồ sẽ kín dần khi trình duyệt kiểm từng trường hợp.',
    liveStarted: 'Đã bắt đầu kiểm.',
    livePercent: 'Đã kiểm {percent}%.',
    liveDone: 'Đã kiểm xong.',
    propsTitle: 'Tám luật, mọi trường hợp',
    propPending: 'Đang chờ',
    propHolds: 'Đúng',
    propBroken: 'Sai',
    P1: 'Vault đã chuyển tài sản thì giữ nguyên như vậy và không làm gì thêm.',
    P2: 'Chủ ví check-in là vault luôn trở về bình thường.',
    P3: 'Người thừa kế chỉ nhận khi thời gian báo động hết mà không có check-in, có giám hộ xác nhận hoặc đã lỡ đủ số lần check-in, và không có phiếu khôi phục nào.',
    P4: 'Tài sản chỉ sang ví mới khi thời gian báo động hết mà không có check-in và đủ giám hộ bầu cho đúng ví đó.',
    P5: 'Báo động chỉ bắt đầu sau khi lỡ check-in hoặc có phiếu khôi phục, không bao giờ ngay sau một lần check-in.',
    P6: 'Vault không bao giờ rơi vào một trạng thái mà luật không định nghĩa.',
    P7: 'Tín hiệu báo động, huỷ và chuyển luôn khớp với thay đổi trạng thái.',
    P8: 'Circuit trên chain trả lời giống hệt model tham chiếu, ở mọi trường hợp.',
    verdictOk: 'Cả tám luật đều đúng ở mọi trường hợp đã kiểm.',
    verdictBroken: 'Bằng chứng thất bại. Đừng dựa vào bản triển khai này cho tới khi các lý do bên dưới được giải thích.',
    verdictPartial: 'Lần chạy này kiểm {combos} trên {total} trường hợp.',
    detailCases: 'Số trường hợp đã kiểm',
    verdictCases: '{combos} trong {seconds} giây',
    detailBlock: 'Block trên chain',
    blockLink: 'Block {block} trên {explorer}',
    detailRpcs: 'Nhà cung cấp RPC',
    rpcsMany: '{n} nhà cung cấp độc lập trả lời khớp nhau ở mọi lần đọc',
    rpcsOne: 'Chỉ một nhà cung cấp: một RPC gian lận có thể đã cho xem dữ liệu khác',
    detailCpu: 'Bộ xử lý',
    detailBeacon: 'Mã bộ xử lý đã đóng băng',
    beaconYes: 'Có',
    beaconNo: 'Không',
    beaconUnknown: 'Không có ghi nhận',
    netlistsTitle: 'Các circuit, theo keccak256',
    netlistGates: '{gates} cổng',
    matchesSource: 'Khớp mã nguồn',
    differsSource: 'Khác mã nguồn',
    matchesDeploy: 'Khớp bản ghi triển khai',
    differsDeploy: 'Khác bản ghi triển khai',
    noDeploy: 'Không có bản ghi triển khai',
    issuesTitle: 'Vì sao thất bại',
    warningsTitle: 'Ghi chú',
    cliTitle: 'Hoặc chạy trong terminal',
    cliBody: 'Cùng bằng chứng đó, không cần website này. Cần Node.js 24.',
    copyCli: 'Chép lệnh',
  },
);
```

- [ ] **Step 8: `Loupe`**

`apps/web/src/proof/loupe.tsx`:

```tsx
'use client';

import { useEffect, useId, useMemo, useRef } from 'react';
import { useLang, useT } from '@/i18n/provider';
import { formatCount } from '@/lib/count';
import { messages } from '@/messages/proof.messages';
import {
  countNext,
  LOUPE,
  LOUPE_CASES,
  LOUPE_PX,
  type LoupeWindow,
  loupeCells,
  loupeChecked,
} from './loupe-math';
import type { ProofGrid } from './paint';
import { useProofPalette } from './use-palette';

type StateKey = 'stateActive' | 'stateGrace' | 'stateRecovery' | 'stateReleased' | 'stateUnused';
const STATE_OF_CODE: readonly StateKey[] = [
  'stateActive',
  'stateGrace',
  'stateUnused',
  'stateRecovery',
  'stateUnused',
  'stateReleased',
  'stateUnused',
  'stateReleased',
];

export interface LoupeProps {
  grid: ProofGrid;
  doneBlocks: number;
  win: LoupeWindow;
  onMove(at: { x: number; y: number }): void;
}

/** Spec §4.6.1: a 1:1 view of any 8 × 8 dots of the map, one pixel per case, coloured by the state the case leads to. */
export function Loupe({ grid, doneBlocks, win, onMove }: LoupeProps) {
  const t = useT(messages);
  const { lang } = useLang();
  const palette = useProofPalette();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titleId = useId();
  const checked = loupeChecked(win, doneBlocks);
  const cells = useMemo(() => (checked ? loupeCells(grid, win) : null), [checked, grid, win]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const image = ctx.createImageData(LOUPE_PX, LOUPE_PX);
    for (let i = 0; i < LOUPE_CASES; i++) {
      const [r, g, b] = cells ? palette.states[cells[i]][0] : palette.base;
      image.data[4 * i] = r;
      image.data[4 * i + 1] = g;
      image.data[4 * i + 2] = b;
      image.data[4 * i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }, [cells, palette]);

  const max = grid.size - LOUPE;
  const n = (v: number) => formatCount(v, lang);
  const counts = cells ? countNext(cells) : null;
  const summary = counts
    ? t('loupeSummary', {
        state: t(STATE_OF_CODE[win.s]),
        active: n(counts[0]),
        grace: n(counts[1]),
        recovery: n(counts[3]),
        released: n(counts[5] + counts[7]),
      })
    : t('loupePending');
  const valueText = (v: number) => t('loupeValue', { n: n(v / LOUPE + 1), max: n(max / LOUPE + 1) });

  return (
    <section
      aria-labelledby={titleId}
      data-testid="proof-loupe"
      data-v0={win.v0}
      data-checked={String(checked)}
      className="grid gap-4 rounded-2xl border border-line bg-surface-1 p-4 sm:grid-cols-[12rem_minmax(0,1fr)]"
    >
      <canvas
        ref={canvasRef}
        width={LOUPE_PX}
        height={LOUPE_PX}
        aria-hidden="true"
        className="size-32 rounded-lg border border-line [image-rendering:pixelated] sm:size-48"
      />
      <div className="flex min-w-0 flex-col gap-3">
        <h3 id={titleId} className="font-medium">
          {t('loupeTitle')}
        </h3>
        <p className="text-ink-muted text-small">{t('loupeHint')}</p>
        <label className="flex flex-col gap-1 text-small">
          {t('loupeColumn')}
          <input
            type="range"
            min={0}
            max={max}
            step={LOUPE}
            value={win.x}
            aria-valuetext={valueText(win.x)}
            onChange={(e) => onMove({ x: Number(e.currentTarget.value), y: win.y })}
            className="accent-thread"
          />
        </label>
        <label className="flex flex-col gap-1 text-small">
          {t('loupeRow')}
          <input
            type="range"
            min={0}
            max={max}
            step={LOUPE}
            value={win.y}
            aria-valuetext={valueText(win.y)}
            onChange={(e) => onMove({ x: win.x, y: Number(e.currentTarget.value) })}
            className="accent-thread"
          />
        </label>
        <p aria-live="polite" className="text-pretty text-small">
          {summary}
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 9: Test `ProofView`**

`apps/web/test/unit/proof-view.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProofView } from '../../src/app/proof/proof-view';
import { IDLE_RUN, type ProofRun } from '../../src/proof/use-proof-run';
import type { PolicyVerification } from '../../src/verify/types';
import { renderWithProviders } from '../helpers/render';

const ok = { ok: true, violations: 0 };
const result = {
  ok: false,
  properties: { P1: ok, P2: ok, P3: { ok: false, violations: 2 }, P4: ok, P5: ok, P6: ok, P7: ok, P8: ok },
  combos: 2 ** 26,
  ms: 61_234,
  netlists: [
    { id: 7n, role: 'policy', keccak: `0x${'ab'.repeat(32)}`, gates: 199, matchesSource: true, matchesDeployment: false },
  ],
  cpu: '0x1111111111111111111111111111111111111111',
  policyId: 7n,
  beaconFrozen: true,
  cpuCheck: null,
  chainId: 196,
  blockNumber: 123n,
  rpcs: 1,
  issues: ['<img src=x onerror=alert(1)>'],
  firstFailures: [],
  warnings: [{ code: 'SINGLE_RPC', message: 'Only one RPC operator was used.' }],
} as unknown as PolicyVerification;

const done: ProofRun = { ...IDLE_RUN, status: 'done', doneBlocks: 2 ** 21, result, runs: 1 };
const noop = () => undefined;

describe('ProofView', () => {
  it('starts only on a click', () => {
    const onStart = vi.fn();
    renderWithProviders(<ProofView run={IDLE_RUN} onStart={onStart} onAgain={noop} explorer={null} />);
    expect(screen.getByTestId('proof-prop-P1').getAttribute('data-state')).toBe('pending');
    fireEvent.click(screen.getByRole('button', { name: 'Run the proof' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('lights the rules one by one, says which broke, and shows chain text only as text', async () => {
    const { container } = renderWithProviders(
      <ProofView run={done} onStart={noop} onAgain={noop} explorer="https://www.oklink.com/xlayer" />,
    );
    await waitFor(() => expect(screen.getByTestId('proof-prop-P8').getAttribute('data-state')).toBe('holds'), {
      timeout: 3000,
    });
    expect(screen.getByTestId('proof-prop-P3').getAttribute('data-state')).toBe('broken');
    expect(screen.getByTestId('proof-verdict').getAttribute('data-ok')).toBe('false');
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Block 123/ }).getAttribute('href')).toBe(
        'https://www.oklink.com/xlayer/block/123',
      ),
    );
    expect(screen.getByRole('button', { name: 'Run again on your machine' })).toBeTruthy();
  });
});
```

Run: `npm test -w apps/web -- proof-view`
Expected: FAIL, không tìm thấy `../../src/app/proof/proof-view`.

- [ ] **Step 10: `ProofView`, trang và trang e2e**

`apps/web/src/app/proof/proof-view.tsx`:

```tsx
'use client';

import { m } from 'motion/react';
import { type ReactNode, useMemo, useState } from 'react';
import { COMMANDS } from '@/content/commands';
import { useLang, useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatCount } from '@/lib/count';
import { explorerName } from '@/lib/links';
import { messages } from '@/messages/proof.messages';
import { usePrefersReducedMotion } from '@/motion/provider';
import { DURATION, EASE_OUT_EXPO, sec } from '@/motion/tokens';
import { Loupe } from '@/proof/loupe';
import { loupeWindow } from '@/proof/loupe-math';
import { comboBitsOf, proofGrid, TOTAL_CASES } from '@/proof/paint';
import { ProofCanvas } from '@/proof/proof-canvas';
import type { ProofRun } from '@/proof/use-proof-run';
import { useStagger } from '@/proof/use-stagger';
import { ErrorBox } from '@/tx/error-box';
import { Address } from '@/ui/address';
import { Button } from '@/ui/button';
import { CopyButton } from '@/ui/copy-button';
import { ExternalLink } from '@/ui/external-link';
import { UntrustedText } from '@/ui/untrusted-text';
import { PROPERTY_ORDER } from '@/verify/verify-view';

const LEGEND = [
  { key: 'stateActive', swatch: 'bg-alive' },
  { key: 'stateGrace', swatch: 'bg-grace' },
  { key: 'stateRecovery', swatch: 'bg-recovery' },
  { key: 'stateReleased', swatch: 'bg-release' },
  { key: 'legendUnused', swatch: 'bg-line-strong' },
  { key: 'legendPending', swatch: 'border border-line-strong bg-surface-3' },
] as const;

const NETLIST_NAME = { policy: 'Policy', kofn5: 'KofN5', ge4: 'Ge4', other: 'REF' } as const;

export interface ProofViewProps {
  run: ProofRun;
  onStart(): void;
  onAgain(): void;
  explorer: string | null;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:contents">
      <dt className="text-ink-muted text-small">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** Spec §4.6.1. The page (live chain) and the e2e page (a bundle built from source) render the same view. */
export function ProofView({ run, onStart, onAgain, explorer }: ProofViewProps) {
  const t = useT(messages);
  const { lang } = useLang();
  const reduced = usePrefersReducedMotion();
  const n = (v: number | bigint) => formatCount(v, lang);
  const grid = useMemo(() => proofGrid(comboBitsOf(run.totalBlocks)), [run.totalBlocks]);
  const [at, setAt] = useState({ x: 0, y: 0 });
  const win = useMemo(() => loupeWindow(grid, at), [grid, at]);
  const result = run.status === 'done' ? run.result : null;
  const lit = useStagger(PROPERTY_ORDER.length, result !== null, reduced);
  const totalCases = run.totalBlocks * 32;
  const doneCases = Math.min(run.doneBlocks, run.totalBlocks) * 32;
  const percent = Math.floor((doneCases / totalCases) * 100);
  const busy = run.status === 'loading' || run.status === 'running';
  const live =
    run.status === 'done'
      ? t('liveDone')
      : run.status === 'running'
        ? t('livePercent', { percent: Math.floor(percent / 10) * 10 })
        : run.status === 'loading'
          ? t('liveStarted')
          : '';

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 pt-12 pb-24 sm:px-6 md:pt-20">
      <header className="flex max-w-3xl flex-col gap-4">
        <p className="font-medium text-caption text-thread uppercase tracking-[0.16em]">{t('eyebrow')}</p>
        <h1 className="text-balance font-display text-h1">{t('title')}</h1>
        <p className="text-pretty text-ink-muted text-lead">{t('lead', { total: n(TOTAL_CASES) })}</p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        <section aria-labelledby="proof-map-title" className="flex flex-col gap-5 lg:sticky lg:top-24">
          <h2 id="proof-map-title" className="sr-only">
            {t('mapTitle')}
          </h2>
          <ProofCanvas
            comboBits={grid.comboBits}
            doneBlocks={run.doneBlocks}
            label={t('mapLabel', { done: n(doneCases), total: n(totalCases) })}
            pick={{ x: win.x, y: win.y }}
            onPick={setAt}
          />
          <div className="flex flex-col gap-2">
            <p className="text-ink-muted text-small">{t('legendTitle')}</p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-small">
              {LEGEND.map((l) => (
                <li key={l.key} className="flex items-center gap-2">
                  <span aria-hidden="true" className={cn('size-3 rounded-[3px]', l.swatch)} />
                  {t(l.key)}
                </li>
              ))}
            </ul>
          </div>
          <Loupe grid={grid} doneBlocks={run.doneBlocks} win={win} onMove={setAt} />
        </section>

        <div className="flex flex-col gap-10">
          <section
            aria-labelledby="proof-run-title"
            data-testid="proof-run"
            data-status={run.status}
            className="flex flex-col gap-4 rounded-2xl border border-line bg-surface-1 p-5 md:p-6"
          >
            <h2 id="proof-run-title" className="font-display text-title">
              {t('runTitle')}
            </h2>
            <p className="text-pretty text-ink-muted">{t('runBody')}</p>
            <progress
              max={totalCases}
              value={doneCases}
              aria-label={t('progressLabel')}
              className="h-2 w-full appearance-none overflow-hidden rounded-full bg-surface-3 [&::-moz-progress-bar]:bg-thread [&::-webkit-progress-bar]:bg-surface-3 [&::-webkit-progress-value]:bg-thread"
            />
            <p className="font-mono text-small tabular-nums">
              {run.status === 'idle' ? t('notStarted') : t('progress', { done: n(doneCases), total: n(totalCases) })}
            </p>
            <p className="sr-only" aria-live="polite">
              {live}
            </p>
            <div className="flex flex-wrap gap-3">
              {run.status === 'idle' ? (
                <Button variant="primary" size="lg" onClick={onStart} data-testid="proof-start">
                  {t('start')}
                </Button>
              ) : null}
              {busy ? (
                <Button variant="secondary" size="lg" loading>
                  {run.status === 'loading' ? t('loading') : t('running')}
                </Button>
              ) : null}
              {run.status === 'done' ? (
                <Button variant="secondary" size="lg" onClick={onAgain} data-testid="proof-again">
                  {t('again')}
                </Button>
              ) : null}
            </div>
            {run.status === 'error' ? <ErrorBox error={run.error} onRetry={onStart} /> : null}
          </section>

          <section aria-labelledby="proof-props-title" className="flex flex-col gap-4">
            <h2 id="proof-props-title" className="font-display text-title">
              {t('propsTitle')}
            </h2>
            <ol className="flex flex-col divide-y divide-line">
              {PROPERTY_ORDER.map((name, i) => {
                const r = result?.properties[name];
                const state = !r || i >= lit ? 'pending' : r.ok ? 'holds' : 'broken';
                return (
                  <li key={name} data-testid={`proof-prop-${name}`} data-state={state} className="flex gap-4 py-3">
                    <m.span
                      aria-hidden="true"
                      className={cn(
                        'mt-1.5 size-3 shrink-0 rounded-full transition-colors',
                        state === 'holds' ? 'bg-alive' : state === 'broken' ? 'bg-danger' : 'bg-line-strong',
                      )}
                      animate={state === 'pending' ? { scale: 1 } : { scale: [1, 1.6, 1] }}
                      transition={{ duration: sec(DURATION.slow), ease: EASE_OUT_EXPO }}
                    />
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="font-mono text-caption text-ink-muted">{name}</p>
                      <p className="text-pretty">{t(name)}</p>
                    </div>
                    <span
                      className={cn(
                        'ml-auto shrink-0 text-small',
                        state === 'holds' ? 'text-alive' : state === 'broken' ? 'text-danger' : 'text-ink-muted',
                      )}
                    >
                      {t(state === 'holds' ? 'propHolds' : state === 'broken' ? 'propBroken' : 'propPending')}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {result ? (
            <section
              aria-labelledby="proof-verdict-title"
              data-testid="proof-verdict"
              data-ok={String(result.ok)}
              className={cn(
                'flex flex-col gap-5 rounded-2xl border-2 p-5 md:p-6',
                result.ok ? 'border-alive' : 'border-danger',
              )}
            >
              <h2 id="proof-verdict-title" className="text-balance font-display text-title">
                {t(result.ok ? 'verdictOk' : 'verdictBroken')}
              </h2>
              {result.combos < TOTAL_CASES ? (
                <p className="text-ink-muted">{t('verdictPartial', { combos: n(result.combos), total: n(TOTAL_CASES) })}</p>
              ) : null}
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)]">
                <Detail label={t('detailCases')}>
                  {t('verdictCases', { combos: n(result.combos), seconds: formatCount(result.ms / 1000, lang, 1) })}
                </Detail>
                <Detail label={t('detailBlock')}>
                  {explorer ? (
                    <ExternalLink href={`${explorer}/block/${result.blockNumber}`}>
                      {t('blockLink', { block: String(result.blockNumber), explorer: explorerName(explorer) })}
                    </ExternalLink>
                  ) : (
                    String(result.blockNumber)
                  )}
                </Detail>
                <Detail label={t('detailRpcs')}>
                  {result.rpcs > 1 ? t('rpcsMany', { n: result.rpcs }) : t('rpcsOne')}
                </Detail>
                <Detail label={t('detailCpu')}>
                  <Address address={result.cpu} explorer={explorer} copy />
                </Detail>
                <Detail label={t('detailBeacon')}>
                  {t(result.beaconFrozen === null ? 'beaconUnknown' : result.beaconFrozen ? 'beaconYes' : 'beaconNo')}
                </Detail>
              </dl>
              <div className="flex flex-col gap-3">
                <h3 className="font-medium">{t('netlistsTitle')}</h3>
                <ul className="flex flex-col gap-3">
                  {result.netlists.map((nl) => (
                    <li
                      key={String(nl.id)}
                      data-testid="proof-netlist"
                      data-role={nl.role}
                      className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3"
                    >
                      <p className="flex flex-wrap gap-x-3 text-small">
                        <span className="font-medium">{NETLIST_NAME[nl.role]}</span>
                        <span className="text-ink-muted">#{String(nl.id)}</span>
                        <span className="text-ink-muted">{t('netlistGates', { gates: n(nl.gates) })}</span>
                      </p>
                      <code className="break-all font-mono text-caption">{nl.keccak}</code>
                      <p className="text-small">
                        {t(nl.matchesSource ? 'matchesSource' : 'differsSource')}
                        {' · '}
                        {t(
                          nl.matchesDeployment === null
                            ? 'noDeploy'
                            : nl.matchesDeployment
                              ? 'matchesDeploy'
                              : 'differsDeploy',
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
              {result.issues.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h3 className="font-medium">{t('issuesTitle')}</h3>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-small">
                    {[...new Set(result.issues)].map((issue) => (
                      <li key={issue}>
                        <UntrustedText value={issue} max={400} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {result.warnings.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h3 className="font-medium">{t('warningsTitle')}</h3>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-small">
                    {result.warnings.map((w) => (
                      <li key={w.code}>
                        <UntrustedText value={w.message} max={400} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      <section
        aria-labelledby="proof-cli-title"
        className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-1 p-5 md:p-8"
      >
        <h2 id="proof-cli-title" className="font-display text-title">
          {t('cliTitle')}
        </h2>
        <p className="text-ink-muted">{t('cliBody')}</p>
        <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
          <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-small">{COMMANDS.verify}</code>
          <CopyButton text={COMMANDS.verify} label={t('copyCli')} />
        </div>
      </section>
    </div>
  );
}
```

`apps/web/src/app/proof/proof-page.tsx`:

```tsx
'use client';

import { ENV, explorerUrlOf } from '@/config/env';
import { useProofRun } from '@/proof/use-proof-run';
import { ProofView } from './proof-view';

const EXPLORER = explorerUrlOf(ENV);

export function ProofPage() {
  const { run, start, again } = useProofRun();
  return <ProofView run={run} onStart={start} onAgain={again} explorer={EXPLORER} />;
}
```

`apps/web/src/app/proof/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { ProofPage } from './proof-page';

export const metadata: Metadata = {
  title: 'The proof',
  description:
    'Check every rule of every Atropyle vault in your own browser: 67,108,864 cases, eight rules, one circuit on X Layer.',
};

export default function Page() {
  return <ProofPage />;
}
```

`apps/web/src/app/e2e/proof/bundle.ts` (chép fixture `bundle()` của `packages/sdk/test/unit/verify-policy.test.ts:6-62`):

```ts
import { buildAll, deployedNetlists } from '@atropyle/circuits';
import type { PolicyBundle } from '@atropyle/sdk/verify';
import { bytesToHex, getAddress, keccak256 } from 'viem';

const CPU = getAddress('0x1111111111111111111111111111111111111111');
const BEACON = getAddress('0x2222222222222222222222222222222222222222');
const FACTORY = getAddress('0x3333333333333333333333333333333333333333');
const IDS = [5n, 6n] as const;
const POLICY_ID = 7n;

/**
 * The policy and both subcircuits built from this repository, as a chain would hold them: the devnet has no policy
 * circuit (POLICY_UNAVAILABLE), so the e2e page proves this bundle in the real worker instead.
 */
export function sourceBundle(): PolicyBundle {
  const src = buildAll();
  const nl = deployedNetlists(CPU, IDS);
  const sub = (c: { nand: number; latch: number }) => c.nand + c.latch;
  return {
    chainId: 196,
    blockNumber: 1n,
    rpcs: 2,
    factory: FACTORY,
    cpu: CPU,
    policyId: POLICY_ID,
    expected: {
      cpu: CPU,
      policyId: POLICY_ID,
      kofn5: IDS[0],
      ge4: IDS[1],
      keccak: { policy: keccak256(nl.policy), kofn5: keccak256(nl.kofn5), ge4: keccak256(nl.ge4) },
    },
    netlists: [
      { id: POLICY_ID, bytes: bytesToHex(nl.policy), nIn: 23, nOut: 3, nState: 3, gateCount: src.program.gateCount },
      { id: IDS[0], bytes: bytesToHex(nl.kofn5), nIn: src.kofn.nIn, nOut: src.kofn.nOut, nState: 0, gateCount: sub(src.kofn) },
      { id: IDS[1], bytes: bytesToHex(nl.ge4), nIn: src.ge4.nIn, nOut: src.ge4.nOut, nState: 0, gateCount: sub(src.ge4) },
    ],
    cpuCheck: {
      ok: true,
      isTapeoutCpu: true,
      nameMatches: true,
      symbolMatches: true,
      beacon: BEACON,
      beaconMatches: true,
      beaconFrozen: true,
      transistorsPaired: true,
    },
  };
}
```

`apps/web/src/app/e2e/proof/page.e2e.tsx`:

```tsx
'use client';

import { useCallback, useRef, useState } from 'react';
import { IDLE_RUN, type ProofRun } from '@/proof/use-proof-run';
import { ProofView } from '../../proof/proof-view';
import { sourceBundle } from './bundle';

/** 2^19 blocks = 2^24 cases on a 512 × 512 map: long enough to see it paint, short enough for CI. */
const BLOCKS = 2 ** 19;

/** Only in builds with ATROPYLE_E2E=1 (pageExtensions): the real worker proves the bundle built from source. */
export default function ProofE2EPage() {
  const [run, setRun] = useState<ProofRun>({ ...IDLE_RUN, totalBlocks: BLOCKS });
  const seq = useRef(0);
  const start = useCallback(() => {
    seq.current += 1;
    const id = seq.current;
    setRun((r) => ({ ...IDLE_RUN, status: 'running', totalBlocks: BLOCKS, runs: r.runs + 1 }));
    void (async () => {
      const { evaluateInWorker } = await import('../../../verify/impl/verify-client');
      try {
        const result = await evaluateInWorker(sourceBundle(), {
          blocks: BLOCKS,
          onProgress: (done) => {
            if (seq.current === id) setRun((r) => ({ ...r, doneBlocks: done }));
          },
        });
        if (seq.current === id) setRun((r) => ({ ...r, status: 'done', doneBlocks: BLOCKS, result }));
      } catch (error) {
        if (seq.current === id) setRun((r) => ({ ...r, status: 'error', error }));
      }
    })();
  }, []);
  return <ProofView run={run} onStart={start} onAgain={start} explorer="https://www.oklink.com/xlayer" />;
}
```

Run: `npm test -w apps/web -- proof-view loupe use-proof-run commands lazy-boundary`
Expected: PASS. `lazy-boundary` vẫn xanh: `src/proof/*` chỉ `import type` từ `@/verify/types`; giá trị SDK và viem chỉ nằm trong `src/app/e2e/**`.

- [ ] **Step 11: Lighthouse đo `/proof/`**

Trong `apps/web/scripts/lib/lighthouse-score.ts`, thêm `'/proof/'` vào mảng đang có (Plan 7B thêm `'/create/'` vào cùng dòng; giữ cả hai, theo thứ tự `'/', '/create/', '/proof/'`):

```ts
export const LIGHTHOUSE_ROUTES: readonly string[] = ['/', '/proof/'];
```

(Nếu dòng đã có `'/create/'` thì kết quả là `['/', '/create/', '/proof/']`.)

Run: `npm run build -w apps/web && npm run size -w apps/web && npm run lighthouse -w apps/web`
Expected: `size` PASS (`/proof/` ≤ 230 kB gzip); `lighthouse: PASS` với dòng `/proof/: {"performance":≥0.95,"accessibility":1,…,"cls":0,…}`. Trang không chạy gì trước khi bấm (Quyết định 2), nên TBT chỉ là phần hydrate. Nếu `size` vượt: xem `@atropyle/circuits` có bị gom cả gói vào chunk `/proof/` không (`.size/` ghi các file); khi đó chuyển `loupeCells` sang `import('@atropyle/circuits')` động trong `loupe.tsx` (nạp khi kính lúp lần đầu có ô đã kiểm).

- [ ] **Step 12: Harness chụp màn hình**

`apps/web/test/e2e/screens.spec.ts`:

```ts
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANVIL, expect, test } from './fixtures';
import { connectWallet, settle } from './helpers';

/**
 * Screenshot review (Plan 7C). Not part of CI: runs only when SCREENS is set.
 * SCREENS: comma-separated routes without the leading slash ('home' for /), {simple|guarded|grace} for a seeded vault,
 * e.g. "proof/,vault/#{guarded}". SCREENS_WALLET: an ANVIL index to connect first. SCREENS_CLICK: a test id to click,
 * SCREENS_WAIT: a test id to wait for, before each shot. Writes apps/web/screens/<route>-<lang>-<scheme>-<width>.png.
 */
const ROUTES = (process.env.SCREENS ?? '')
  .split(',')
  .map((r) => r.trim())
  .filter((r) => r.length > 0);
const OUT = fileURLToPath(new URL('../../screens/', import.meta.url));
const WIDTHS = [390, 768, 1440] as const;
type Seeded = 'simple' | 'guarded' | 'grace';

test.describe('screens', () => {
  test.skip(ROUTES.length === 0, 'set SCREENS to review pages by eye');
  for (const route of ROUTES) {
    test(`screens ${route}`, async ({ page, state, wallet }, info) => {
      test.skip(info.project.name !== 'desktop', 'the 390 px shots cover phones');
      test.setTimeout(600_000);
      mkdirSync(OUT, { recursive: true });
      const path = (route === 'home' ? '' : route).replace(/\{(simple|guarded|grace)\}/g, (_m, k: string) =>
        String(state.seeded[k as Seeded]),
      );
      const url = new URL(path, state.siteUrl).href;
      const slug = route.replace(/\{|\}/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home';
      const account = process.env.SCREENS_WALLET;
      if (account) await wallet({ account: ANVIL[Number(account)] });
      let connected = !account;
      for (const lang of ['en', 'vi'] as const) {
        for (const colorScheme of ['dark', 'light'] as const) {
          for (const width of WIDTHS) {
            await page.setViewportSize({ width, height: 900 });
            await page.emulateMedia({ colorScheme });
            // The language is set before the page's scripts run, and every shot is a fresh document: no reload,
            // because a page that clears its own hash (the email pages) would reload without it.
            await page.addInitScript((l) => {
              try {
                localStorage.setItem('atropyle:lang', l);
              } catch {
                // about:blank has no storage.
              }
            }, lang);
            await page.goto('about:blank');
            await page.goto(url);
            if (!connected) {
              await connectWallet(page);
              connected = true;
            }
            await page.mouse.move(width / 2, 300);
            const click = process.env.SCREENS_CLICK;
            if (click) await page.getByTestId(click).click();
            const wait = process.env.SCREENS_WAIT;
            if (wait) await expect(page.getByTestId(wait)).toBeVisible({ timeout: 300_000 });
            await settle(page);
            await page.screenshot({ path: join(OUT, `${slug}-${lang}-${colorScheme}-${width}.png`), fullPage: true });
          }
        }
      }
    });
  }
});
```

Thêm vào `.gitignore` (cạnh `apps/web/test-results/`):

```
apps/web/screens/
```

- [ ] **Step 13: E2E của proof**

`apps/web/test/e2e/proof.spec.ts`:

```ts
import { expect, test } from './fixtures';
import { expectAccessibleInBothThemes } from './helpers';

const PROPS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];

test('the real worker paints the map, lights P1–P8 and ends on the verdict', async ({ page, state }, info) => {
  test.skip(info.project.name !== 'desktop', 'one full run is enough; phones are covered by the screenshot review');
  test.setTimeout(240_000);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto(new URL('e2e/proof/', state.siteUrl).href);
  const map = page.getByTestId('proof-canvas');
  await expect(map).toHaveAttribute('data-size', '512');
  await page.getByRole('button', { name: 'Run the proof' }).click();
  await expect(map).toHaveAttribute('data-done', String(2 ** 19), { timeout: 200_000 });
  await expect(page.getByTestId('proof-verdict')).toHaveAttribute('data-ok', 'true');
  for (const p of PROPS) await expect(page.getByTestId(`proof-prop-${p}`)).toHaveAttribute('data-state', 'holds');
  expect(Number(await map.getAttribute('data-ticks'))).toBeGreaterThanOrEqual(3);
  const pixel = await map.evaluate((c) =>
    Array.from((c as HTMLCanvasElement).getContext('2d')?.getImageData(0, 0, 1, 1).data ?? []).slice(0, 3),
  );
  expect(pixel).toEqual([92, 200, 176]); // the first dot of state 0, in the dark theme's --atro-alive
  await expect(page.getByTestId('proof-netlist')).toHaveCount(3);
  const loupe = page.getByTestId('proof-loupe');
  await expect(loupe).toHaveAttribute('data-v0', '0');
  await page.getByRole('slider', { name: 'Loupe column' }).press('ArrowRight');
  await expect(loupe).toHaveAttribute('data-v0', '4096');
  await expect(loupe).toHaveAttribute('data-checked', 'true');
  await expectAccessibleInBothThemes(page);
});

test('/proof/ on the devnet is accessible before and after a run that finds no policy circuit', async ({
  page,
  state,
}) => {
  await page.goto(new URL('proof/', state.siteUrl).href);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every case, checked in your browser');
  await expectAccessibleInBothThemes(page);
  await page.getByRole('button', { name: 'Run the proof' }).click();
  await expect(page.getByTestId('error')).toHaveAttribute('data-code', 'POLICY_UNAVAILABLE');
  await expectAccessibleInBothThemes(page);
});
```

Run: `npm run e2e -w apps/web -- proof`
Expected: PASS (desktop 2, mobile 1, mobile bỏ qua test đầu). Test đầu mất khoảng 10 đến 40 giây cho 2^19 block. Nếu `pixel` khác: kiểm `useProofPalette` đọc đúng `--atro-alive` (`getComputedStyle(document.documentElement)`).

- [ ] **Step 14: Chụp màn hình và duyệt**

PowerShell (Git Bash đổi `/` đầu chuỗi thành đường dẫn Windows, nên route viết không có `/` đầu):

```powershell
$env:SCREENS='proof/'; npm run e2e -w apps/web -- screens --project=desktop
$env:SCREENS='proof/'; $env:SCREENS_CLICK='proof-start'; $env:SCREENS_WAIT='error'; npm run e2e -w apps/web -- screens --project=desktop
$env:SCREENS='e2e/proof/'; $env:SCREENS_CLICK='proof-start'; $env:SCREENS_WAIT='proof-verdict'; npm run e2e -w apps/web -- screens --project=desktop
Remove-Item Env:SCREENS, Env:SCREENS_CLICK, Env:SCREENS_WAIT
```

Expected: 36 ảnh trong `apps/web/screens/` (lần 2 ghi đè lần 1 cho `proof`, nên đổi tên thư mục giữa hai lần chạy nếu muốn giữ cả hai). Mở từng ảnh, kiểm: bản đồ vuông và không tràn ở 390 px; chú giải xuống dòng gọn; chữ tiếng Việt không bị cắt; kính lúp và hai thanh trượt thẳng hàng; viền kết luận đúng màu ở cả hai theme; không có khoảng trống lạ. Sửa rồi chụp lại tới khi đạt. Liệt kê đường dẫn ảnh trong báo cáo task.

- [ ] **Step 15: Kiểm toàn bộ và commit**

```bash
npm test -w apps/web
npm run typecheck
npx biome check --write apps/web/src/content apps/web/src/lib/count.ts apps/web/src/proof apps/web/src/messages/proof.messages.ts apps/web/src/app/proof apps/web/src/app/e2e/proof apps/web/test/unit apps/web/test/e2e apps/web/scripts/lib/lighthouse-score.ts
npx biome ci .
git add apps/web/package.json package-lock.json .gitignore apps/web/scripts/lib/lighthouse-score.ts apps/web/src/content/commands.ts apps/web/src/lib/count.ts apps/web/src/proof/use-proof-run.ts apps/web/src/proof/use-stagger.ts apps/web/src/proof/loupe-math.ts apps/web/src/proof/loupe.tsx apps/web/src/messages/proof.messages.ts apps/web/src/app/proof/page.tsx apps/web/src/app/proof/proof-page.tsx apps/web/src/app/proof/proof-view.tsx apps/web/src/app/e2e/proof/bundle.ts apps/web/src/app/e2e/proof/page.e2e.tsx apps/web/test/unit/commands.test.ts apps/web/test/unit/loupe.test.ts apps/web/test/unit/use-proof-run.test.tsx apps/web/test/unit/proof-view.test.tsx apps/web/test/e2e/proof.spec.ts apps/web/test/e2e/screens.spec.ts
git commit -m "feat(web): /proof/, the visual proof with its loupe, P1-P8 and the verdict" -m "The proof runs only on a click, joins the session's run, and 'Run again on your machine' runs a fresh one. An e2e-only page proves the bundle built from source in the real worker. Adds /proof/ to Lighthouse and a screenshot harness for page reviews." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Hero dệt từ netlist thật (SVG, render trên server)

Cảnh 1 của §5.1: "Sợi chỉ dệt từ netlist hiện dần". Hình phải đứng một mình khi WebGL bị cắt (thứ tự cắt mục 4), nên task này làm bản SVG đầy đủ; Task 5 thêm ánh sáng WebGL lên trên.

**Files:**
- Create: `apps/web/scripts/lib/netlist-layout.ts`, `apps/web/scripts/geometry.ts`
- Create (sinh ra): `apps/web/src/home/netlist-geometry.ts`
- Create: `apps/web/src/home/weave-path.ts`, `apps/web/src/home/weave-svg.tsx`, `apps/web/src/home/home.css`
- Modify: `apps/web/src/home/hero.tsx` (thay toàn bộ), `apps/web/src/app/page.tsx` (thay toàn bộ), `apps/web/package.json` (script `geometry`), `biome.json` (bỏ qua file sinh ra)
- Test: `apps/web/test/unit/netlist-geometry.test.ts`, `apps/web/test/unit/weave-path.test.ts`, `apps/web/test/build/home.test.ts`

**Interfaces:**
- Consumes (7A): `SharedThread` (`@/motion/view-transition`), `Thread`, `useT`, `messages` của `@/messages/home.messages` (khoá `heroEyebrow`, `heroTitle`, `heroLead`, `heroDrill`, `heroProof`), `createHref`, `ROUTES`, `buttonClass`, `outOf(target)` (`test/build/paths.ts`). Circuits: `buildAll().program`, `type Program` (`@atropyle/circuits`).
- Produces:
  - `scripts/lib/netlist-layout.ts`: `WEAVE_VIEW = { w: 1200, h: 520 }`; `GEOMETRY_FILE: string`; `interface NetlistGeometry { depths: number; nodes: number[]; wires: number[]; thread: number[] }`; `signalDepths(p: Program): Int32Array`; `netlistGeometry(p: Program, view?): NetlistGeometry`; `renderGeometryModule(g: NetlistGeometry, view?): string`.
  - `src/home/netlist-geometry.ts` (sinh ra, không sửa tay): `VIEW`, `DEPTHS` (39), `NODES` (444 số), `WIRES` (1960 số: x1, y1, x2, y2, độ sâu), `THREAD` (78 số).
  - `src/home/weave-path.ts`: `interface Point { x: number; y: number }`; `wirePaths(): string[]` (39 path, một path mỗi lớp NAND); `dotsPath(): string`; `pointsOf(flat): Point[]`; `catmull(pts, i): [Point, Point]`; `smoothPath(pts): string`; `cubicPoint(p0, c1, c2, p1, t): Point`; `smoothPoints(pts, perSegment): Point[]`.
  - `src/home/weave-svg.tsx`: `WeaveArt(): JSX.Element` (không hook, render được trên server; gốc là `div.weave` có `aria-hidden`; lớp `.weave-col` có `style="--d:<độ sâu>"`, `.weave-dots`, `.weave-thread`, khung cắt `.weave-reveal`).
  - `src/home/hero.tsx`: `HomeHero({ art }: { art?: ReactNode }): JSX.Element` (không có `art` thì giữ sợi chỉ của 7A, nên test của 7A vẫn chạy).
  - `src/home/home.css`: CSS toàn cục của trang chủ (Task 5 và 7 thêm vào).

- [ ] **Step 1: Test bố cục netlist**

`apps/web/test/unit/netlist-geometry.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { buildAll } from '@atropyle/circuits';
import { describe, expect, it } from 'vitest';
import { GEOMETRY_FILE, netlistGeometry, renderGeometryModule } from '../../scripts/lib/netlist-layout';
import { DEPTHS, NODES, THREAD, VIEW, WIRES } from '../../src/home/netlist-geometry';

describe('hero geometry', () => {
  it('is the policy netlist of this repository (run `npm run geometry -w apps/web` after a circuit change)', () => {
    expect(readFileSync(GEOMETRY_FILE, 'utf8')).toBe(renderGeometryModule(netlistGeometry(buildAll().program)));
  });

  it('holds every signal, both inputs of every NAND, and the release thread from edge to edge', () => {
    expect(DEPTHS).toBe(39);
    expect(NODES).toHaveLength(222 * 2);
    expect(WIRES).toHaveLength(392 * 5);
    expect(THREAD).toHaveLength((37 + 2) * 2);
    for (let i = 0; i < NODES.length; i += 2) {
      expect(NODES[i]).toBeGreaterThan(0);
      expect(NODES[i]).toBeLessThan(VIEW.w);
      expect(NODES[i + 1]).toBeGreaterThan(0);
      expect(NODES[i + 1]).toBeLessThan(VIEW.h);
    }
    expect(THREAD[0]).toBe(0);
    expect(THREAD.at(-2)).toBe(VIEW.w);
    for (let i = 2; i < THREAD.length; i += 2) expect(THREAD[i]).toBeGreaterThan(THREAD[i - 2]);
  });
});
```

Run: `npm test -w apps/web -- netlist-geometry`
Expected: FAIL, không tìm thấy `../../scripts/lib/netlist-layout`.

- [ ] **Step 2: Bố cục và script sinh file**

`apps/web/scripts/lib/netlist-layout.ts`:

```ts
import { fileURLToPath } from 'node:url';
import type { Program } from '@atropyle/circuits';

/** The hero's drawing box. Height 520 keeps 26 inputs and latches apart on a phone. */
export const WEAVE_VIEW = { w: 1200, h: 520 } as const;
export const GEOMETRY_FILE = fileURLToPath(new URL('../../src/home/netlist-geometry.ts', import.meta.url));

const PAD_X = 24;
const PAD_Y = 28;
const round = (v: number) => Math.round(v * 10) / 10;

export interface NetlistGeometry {
  /** NAND layers: the deepest signal's depth. */
  depths: number;
  /** x, y of signals 2 … nSignals − 1 (0 and 1 are the constants). */
  nodes: number[];
  /** x1, y1, x2, y2, depth of the target, for both inputs of every NAND, in op order. */
  wires: number[];
  /** The release output traced back through its deeper input, plus a point on each edge. */
  thread: number[];
}

/** Depth of every signal: inputs and latch outputs 0, a NAND one more than its deeper input. Ops are in run order. */
export function signalDepths(p: Program): Int32Array {
  const depth = new Int32Array(p.nSignals);
  for (let j = 0; j < p.ops.length; j += 4) {
    const out = p.ops[j + 1];
    depth[out] = p.ops[j] === 0 ? 1 + Math.max(depth[p.ops[j + 2]], depth[p.ops[j + 3]]) : 0;
  }
  return depth;
}

/**
 * One column per depth. Column 0 keeps signal order; every other column is sorted by the mean height of each gate's two
 * inputs, so wires flow instead of crossing at random. Deterministic: the same netlist gives the same file.
 */
export function netlistGeometry(p: Program, view: { w: number; h: number } = WEAVE_VIEW): NetlistGeometry {
  const depth = signalDepths(p);
  let depths = 0;
  for (let s = 2; s < p.nSignals; s++) depths = Math.max(depths, depth[s]);
  const inputs = new Map<number, [number, number]>();
  for (let j = 0; j < p.ops.length; j += 4) if (p.ops[j] === 0) inputs.set(p.ops[j + 1], [p.ops[j + 2], p.ops[j + 3]]);
  const xs = new Float64Array(p.nSignals);
  const ys = new Float64Array(p.nSignals);
  const columns: number[][] = Array.from({ length: depths + 1 }, () => []);
  for (let s = 2; s < p.nSignals; s++) columns[depth[s]].push(s);
  const innerW = view.w - 2 * PAD_X;
  const innerH = view.h - 2 * PAD_Y;
  for (let d = 0; d <= depths; d++) {
    const col = columns[d];
    if (d > 0) {
      const key = new Map<number, number>();
      for (const s of col) {
        const [a, b] = inputs.get(s) as [number, number];
        key.set(s, (ys[a] + ys[b]) / 2);
      }
      col.sort((a, b) => (key.get(a) as number) - (key.get(b) as number) || a - b);
    }
    col.forEach((s, i) => {
      xs[s] = PAD_X + (d / depths) * innerW;
      ys[s] = PAD_Y + ((i + 0.5) / col.length) * innerH;
    });
  }
  const nodes: number[] = [];
  for (let s = 2; s < p.nSignals; s++) nodes.push(round(xs[s]), round(ys[s]));
  const wires: number[] = [];
  for (let j = 0; j < p.ops.length; j += 4) {
    if (p.ops[j] !== 0) continue;
    const out = p.ops[j + 1];
    for (const src of [p.ops[j + 2], p.ops[j + 3]]) {
      wires.push(round(xs[src]), round(ys[src]), round(xs[out]), round(ys[out]), depth[out]);
    }
  }
  const chain = [p.outIdx[2]];
  for (let s = p.outIdx[2]; depth[s] > 0; ) {
    const [a, b] = inputs.get(s) as [number, number];
    s = depth[a] >= depth[b] ? a : b;
    chain.push(s);
  }
  chain.reverse();
  const thread = [0, round(ys[chain[0]])];
  for (const s of chain) thread.push(round(xs[s]), round(ys[s]));
  thread.push(view.w, round(ys[chain[chain.length - 1]]));
  return { depths, nodes, wires, thread };
}

export function renderGeometryModule(g: NetlistGeometry, view: { w: number; h: number } = WEAVE_VIEW): string {
  const list = (a: readonly number[]) => `[${a.join(',')}]`;
  return [
    '// Generated by apps/web/scripts/geometry.ts from the policy netlist (buildAll().program of @atropyle/circuits).',
    '// Do not edit: run `npm run geometry -w apps/web`. test/unit/netlist-geometry.test.ts fails when it is stale.',
    `export const VIEW = { w: ${view.w}, h: ${view.h} } as const;`,
    `export const DEPTHS = ${g.depths};`,
    '/** x, y of every signal but the two constants, in signal order. */',
    `export const NODES: readonly number[] = ${list(g.nodes)};`,
    '/** x1, y1, x2, y2 and the depth of the target, for both inputs of every NAND. */',
    `export const WIRES: readonly number[] = ${list(g.wires)};`,
    '/** The release output traced back through its deeper input, from the left edge to the right edge. */',
    `export const THREAD: readonly number[] = ${list(g.thread)};`,
    '',
  ].join('\n');
}
```

`apps/web/scripts/geometry.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { buildAll } from '@atropyle/circuits';
import { GEOMETRY_FILE, netlistGeometry, renderGeometryModule } from './lib/netlist-layout';

writeFileSync(GEOMETRY_FILE, renderGeometryModule(netlistGeometry(buildAll().program)));
console.log(`geometry: wrote ${GEOMETRY_FILE}`);
```

Thêm script và bỏ qua file sinh ra trong Biome (thêm vào `files.includes` của `biome.json`, sau dòng `"!apps/web/lighthouse-report"`, nhớ dấu phẩy):

```bash
npm pkg set scripts.geometry="tsx scripts/geometry.ts" -w apps/web
```

```json
      "!apps/web/src/home/netlist-geometry.ts"
```

Run: `npm run build && npm run geometry -w apps/web && npm test -w apps/web -- netlist-geometry`
Expected: `geometry: wrote …netlist-geometry.ts`; PASS (2 test). Bản thử ngày 23/11 trên `circuits/dist`: 39 lớp, 444 số nút, 1960 số dây, 78 số sợi chỉ, x của sợi chỉ tăng dần, y nằm trong 36 … 484.

- [ ] **Step 3: Test đường vẽ**

`apps/web/test/unit/weave-path.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEPTHS, NODES, THREAD, WIRES } from '../../src/home/netlist-geometry';
import { dotsPath, pointsOf, smoothPath, smoothPoints, wirePaths } from '../../src/home/weave-path';

describe('weave paths', () => {
  it('draws one path per NAND layer holding every wire, and one dot per signal', () => {
    const paths = wirePaths();
    expect(paths).toHaveLength(DEPTHS);
    expect(paths.join('').match(/M/g)).toHaveLength(WIRES.length / 5);
    expect(dotsPath().match(/M/g)).toHaveLength(NODES.length / 2);
  });

  it('samples the thread on the curve it draws, which passes through every point', () => {
    const pts = pointsOf(THREAD);
    const s = smoothPoints(pts, 4);
    expect(s).toHaveLength((pts.length - 1) * 4 + 1);
    expect(s[0]).toEqual(pts[0]);
    expect(s[4]).toEqual(pts[1]);
    expect(s.at(-1)).toEqual(pts.at(-1));
    expect(smoothPath(pts).startsWith(`M0 ${pts[0].y}C`)).toBe(true);
  });
});
```

Run: `npm test -w apps/web -- weave-path`
Expected: FAIL, không tìm thấy `../../src/home/weave-path`.

- [ ] **Step 4: `weave-path.ts`**

```ts
import { DEPTHS, NODES, WIRES } from './netlist-geometry';

export interface Point {
  x: number;
  y: number;
}

const round = (v: number) => Math.round(v * 10) / 10;

/** One path per NAND layer: the wires entering layer d (1 … DEPTHS), each a horizontal S-curve. */
export function wirePaths(): string[] {
  const parts: string[][] = Array.from({ length: DEPTHS }, () => []);
  for (let i = 0; i < WIRES.length; i += 5) {
    const x1 = WIRES[i];
    const y1 = WIRES[i + 1];
    const x2 = WIRES[i + 2];
    const y2 = WIRES[i + 3];
    const mx = round((x1 + x2) / 2);
    parts[WIRES[i + 4] - 1].push(`M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`);
  }
  return parts.map((p) => p.join(''));
}

/** Every signal as a dot: a zero-length segment drawn with a round cap. */
export function dotsPath(): string {
  let d = '';
  for (let i = 0; i < NODES.length; i += 2) d += `M${NODES[i]} ${NODES[i + 1]}h0`;
  return d;
}

export function pointsOf(flat: readonly number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1] });
  return out;
}

/** The Bézier control points of segment i of a uniform Catmull-Rom spline through pts. */
export function catmull(pts: readonly Point[], i: number): [Point, Point] {
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(pts.length - 1, i + 2)];
  return [
    { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
  ];
}

export function smoothPath(pts: readonly Point[]): string {
  if (pts.length === 0) return '';
  let d = `M${round(pts[0].x)} ${round(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [c1, c2] = catmull(pts, i);
    const p = pts[i + 1];
    d += `C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(p.x)} ${round(p.y)}`;
  }
  return d;
}

export function cubicPoint(p0: Point, c1: Point, c2: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + e * p1.x, y: a * p0.y + b * c1.y + c * c2.y + e * p1.y };
}

/** The curve of smoothPath, sampled perSegment times per segment plus the last point: the WebGL ribbon follows it. */
export function smoothPoints(pts: readonly Point[], perSegment: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [c1, c2] = catmull(pts, i);
    for (let k = 0; k < perSegment; k++) out.push(cubicPoint(pts[i], c1, c2, pts[i + 1], k / perSegment));
  }
  if (pts.length > 0) out.push(pts[pts.length - 1]);
  return out;
}
```

Run: `npm test -w apps/web -- weave-path`
Expected: PASS (2 test).

- [ ] **Step 5: `WeaveArt`, CSS, hero và trang chủ**

`apps/web/src/home/weave-svg.tsx` (không `'use client'`: `app/page.tsx` render nó trên server, Quyết định 6):

```tsx
import type { CSSProperties } from 'react';
import { SharedThread } from '@/motion/view-transition';
import { THREAD, VIEW } from './netlist-geometry';
import { dotsPath, pointsOf, smoothPath, wirePaths } from './weave-path';

const COLUMNS = wirePaths().map((d, i) => ({ id: `weave-${i + 1}`, d, depth: i + 1 }));
const DOTS = dotsPath();
const THREAD_PATH = smoothPath(pointsOf(THREAD));
const BOX = `0 0 ${VIEW.w} ${VIEW.h}`;

/**
 * The real policy circuit: 392 wires in 39 NAND layers, and in gold the path from an input to the release output.
 * Layers appear left to right, then the thread is drawn across (home.css); with reduced motion everything is simply there.
 */
export function WeaveArt() {
  return (
    <div className="weave absolute inset-0" aria-hidden="true">
      <svg viewBox={BOX} className="absolute inset-0 size-full" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth={0.8}>
          {COLUMNS.map((c) => (
            <path key={c.id} d={c.d} className="weave-col" style={{ '--d': c.depth } as CSSProperties} />
          ))}
        </g>
        <path d={DOTS} className="weave-dots" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" />
      </svg>
      <SharedThread>
        <svg viewBox={BOX} className="absolute inset-0 size-full" focusable="false">
          <defs>
            <clipPath id="weave-reveal">
              <rect className="weave-reveal" x={0} y={0} width={VIEW.w} height={VIEW.h} />
            </clipPath>
          </defs>
          <path
            d={THREAD_PATH}
            clipPath="url(#weave-reveal)"
            className="weave-thread"
            fill="none"
            stroke="var(--atro-thread)"
            strokeWidth={3}
            strokeLinecap="round"
          />
        </svg>
      </SharedThread>
    </div>
  );
}
```

`apps/web/src/home/home.css`:

```css
/* Plan 7C: the home page. Spec §4.4: only transform and opacity move, and only without a reduced-motion preference. */

.weave {
  color: var(--atro-line-strong);
}
.weave-col {
  opacity: 0.5;
}
.weave-dots {
  color: var(--atro-ink-muted);
  opacity: 0.75;
}
.weave-reveal {
  transform-box: fill-box;
  transform-origin: left center;
}

@media (prefers-reduced-motion: no-preference) {
  .weave-col {
    animation: weave-col 640ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(var(--d) * 28ms);
  }
  .weave-dots {
    animation: weave-dots 900ms ease-out 240ms both;
  }
  .weave-reveal {
    animation: weave-reveal 1400ms cubic-bezier(0.16, 1, 0.3, 1) 520ms both;
  }
}

@keyframes weave-col {
  from {
    opacity: 0;
  }
  to {
    opacity: 0.5;
  }
}
@keyframes weave-dots {
  from {
    opacity: 0;
  }
  to {
    opacity: 0.75;
  }
}
@keyframes weave-reveal {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}
```

Thay `apps/web/src/home/hero.tsx`:

```tsx
'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useT } from '@/i18n/provider';
import { messages as home } from '@/messages/home.messages';
import { createHref, ROUTES } from '@/routes';
import { Thread } from '@/thread/thread';
import { buttonClass } from '@/ui/button';

/**
 * Scene 1 of the home page (spec §5.1). `art` is the server-rendered weave (Plan 7C); without it the plain thread of
 * Plan 7A stays, which keeps that plan's tests meaningful.
 */
export function HomeHero({ art }: { art?: ReactNode } = {}) {
  const t = useT(home);
  return (
    <section className="relative isolate flex flex-col gap-10 overflow-hidden pt-16 pb-12 md:pt-28">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 sm:px-6">
        <p className="font-medium text-caption text-thread uppercase tracking-[0.16em]">{t('heroEyebrow')}</p>
        <h1 className="max-w-4xl text-balance font-display text-display">{t('heroTitle')}</h1>
        <p className="max-w-2xl text-pretty text-ink-muted text-lead">{t('heroLead')}</p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href={createHref('drill')} prefetch={false} className={buttonClass({ variant: 'primary', size: 'lg' })}>
            {t('heroDrill')}
          </Link>
          <Link href={ROUTES.proof} prefetch={false} className={buttonClass({ variant: 'secondary', size: 'lg' })}>
            {t('heroProof')}
          </Link>
        </div>
      </div>
      {art ? (
        <div className="relative mx-auto w-full max-w-7xl px-2 sm:px-6">
          <div className="relative w-full" style={{ aspectRatio: '1200 / 520' }}>
            {art}
          </div>
        </div>
      ) : (
        <Thread state="active" remaining={0.72} knots={[0.16, 0.34, 0.52]} shared className="w-full" />
      )}
    </section>
  );
}
```

Thay `apps/web/src/app/page.tsx`:

```tsx
import { HomeHero } from '@/home/hero';
import { WeaveArt } from '@/home/weave-svg';
import '@/home/home.css';

export default function HomePage() {
  return <HomeHero art={<WeaveArt />} />;
}
```

Run: `npm test -w apps/web`
Expected: PASS, gồm test hero của 7A (chúng render `<HomeHero />` không có `art`).

- [ ] **Step 6: Test build: hình nằm trong HTML, dữ liệu không nằm trong JS**

`apps/web/test/build/home.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEPTHS, NODES } from '../../src/home/netlist-geometry';
import { outOf } from './paths';

const jsFiles = (root: string): string[] =>
  readdirSync(join(root, '_next'), { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.js'))
    .map((f) => join(root, '_next', f));

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} home`, () => {
    const html = () => readFileSync(join(outOf(target), 'index.html'), 'utf8');

    it('prerenders the weave of the real netlist and ships none of its numbers as JavaScript', () => {
      expect(html()).toContain('class="weave ');
      expect(html().match(/class="weave-col"/g)).toHaveLength(DEPTHS);
      expect(html()).toContain('class="weave-thread"');
      const marker = `M${NODES[0]} ${NODES[1]}h0M${NODES[2]} ${NODES[3]}h0`;
      expect(html()).toContain(marker);
      for (const file of jsFiles(outOf(target))) expect(readFileSync(file, 'utf8')).not.toContain(marker);
    });
  });
}
```

Run: `npm run test:build -w apps/web`
Expected: PASS (thêm 2 test). HTML của `/` có thêm hình hai lần (SVG và payload RSC của Next), khoảng 40 kB thô, khoảng 10 kB gzip; không file `.js` nào chứa dữ liệu dây.

- [ ] **Step 7: Ngân sách, Lighthouse và màn hình**

```bash
npm run build -w apps/web
npm run size -w apps/web
npm run lighthouse -w apps/web
npm run e2e -w apps/web
```

Expected: `size` PASS (`/` ≤ 170 kB gzip: task này không thêm JS); `lighthouse: PASS` cho `/` với `cls` 0 (khung hình có `aspect-ratio` cố định); e2e của 7A xanh, gồm `reduced motion leaves no running animation` (mọi animation nằm trong `no-preference`).

```powershell
$env:SCREENS='home'; npm run e2e -w apps/web -- screens --project=desktop; Remove-Item Env:SCREENS
```

Kiểm 12 ảnh `apps/web/screens/home-*.png`: dây đủ mảnh và không lấn chữ; sợi chỉ vàng thấy rõ ở cả hai theme; ở 390 px hình vẫn đọc được (có thể thấp, không bị cắt); tiêu đề tiếng Việt không tràn. Liệt kê đường dẫn ảnh trong báo cáo task.

- [ ] **Step 8: Kiểm toàn bộ và commit**

```bash
npm run typecheck
npx biome check --write apps/web/scripts/lib/netlist-layout.ts apps/web/scripts/geometry.ts apps/web/src/home apps/web/src/app/page.tsx apps/web/test/unit/netlist-geometry.test.ts apps/web/test/unit/weave-path.test.ts apps/web/test/build/home.test.ts biome.json
npx biome ci .
git add apps/web/scripts/lib/netlist-layout.ts apps/web/scripts/geometry.ts apps/web/src/home/netlist-geometry.ts apps/web/src/home/weave-path.ts apps/web/src/home/weave-svg.tsx apps/web/src/home/home.css apps/web/src/home/hero.tsx apps/web/src/app/page.tsx apps/web/package.json biome.json apps/web/test/unit/netlist-geometry.test.ts apps/web/test/unit/weave-path.test.ts apps/web/test/build/home.test.ts
git commit -m "feat(web): the home hero weaves the real policy netlist" -m "Geometry is generated from buildAll().program and checked against it; the SVG is rendered on the server, layers fade in and the release thread is drawn across, all still under reduced motion." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ánh sáng WebGL trên hero (ogl)

Lớp WebGL chỉ thêm ánh sáng lên hình SVG của Task 4: xung sáng chạy dọc dây từ trái sang phải (tín hiệu đi qua các lớp NAND) và một dải sáng trên sợi chỉ (Quyết định 7). Mọi trường hợp không chạy được đều để SVG đứng một mình.

**Files:**
- Modify: `apps/web/package.json`, `package-lock.json` (`ogl` 1.0.11)
- Create: `apps/web/src/lib/use-first-interaction.ts`, `apps/web/src/lib/use-in-view.ts`
- Create: `apps/web/src/home/weave-gl-geometry.ts`, `apps/web/src/home/use-hero-gl.ts`, `apps/web/src/home/impl/weave-gl.ts`, `apps/web/src/home/hero-gl.tsx`
- Modify: `apps/web/src/home/hero.tsx` (thêm `<HeroGl />` trong khung hình)
- Test: `apps/web/test/unit/hero-gl.test.ts`, `apps/web/test/e2e/home.spec.ts`

**Interfaces:**
- Consumes (7A): `usePrefersReducedMotion()`, `useTheme()`, `cn`. (Task 2): `parseHexColor`, `cssVar`, `type Rgb`. (Task 4): `VIEW`, `WIRES`, `THREAD`, `cubicPoint`, `pointsOf`, `smoothPoints`, `HomeHero`.
- Produces:
  - `src/lib/use-first-interaction.ts`: `useFirstInteraction(): boolean` (false lúc prerender; true từ `pointerdown`, `pointermove`, `keydown`, `wheel`, `touchstart` hoặc `scroll` đầu tiên của trang, dùng chung cho cả trang).
  - `src/lib/use-in-view.ts`: `useInView(ref: RefObject<Element | null>, o?: { once?: boolean; rootMargin?: string }): boolean`.
  - `src/home/weave-gl-geometry.ts`: `WIRE_SEGMENTS = 12`; `RIBBON_WIDTH = 10`; `RIBBON_STEPS = 8`; `wireBuffers(): Float32Array`; `ribbonBuffers(): { position: Float32Array; side: Float32Array }`.
  - `src/home/use-hero-gl.ts`: `type HeroGlState = 'off' | 'wait' | 'loading' | 'live' | 'unsupported' | 'failed'`; `interface WeaveColors { glow: [number, number, number]; strength: number }`; `glDecision(o: { reduced: boolean; saveData: boolean; interacted: boolean; visible: boolean }): 'off' | 'wait' | 'start'`; `supportsWebGL(): boolean`; `weaveColors(theme: 'light' | 'dark', read?: (name: string) => string): WeaveColors`; `useHeroGl(ref: RefObject<HTMLCanvasElement | null>): HeroGlState`.
  - `src/home/impl/weave-gl.ts` (chỉ qua `import()`): `interface WeaveGl { setColors(c: WeaveColors): void; setRunning(on: boolean): void; destroy(): void }`; `startWeaveGl(canvas, colors, onLost): WeaveGl`.
  - `src/home/hero-gl.tsx`: `HeroGl()`; `<canvas data-testid="hero-gl" data-state={HeroGlState}>`.

- [ ] **Step 1: Cài ogl**

```bash
npm install -E ogl@1.0.11 -w apps/web
npm run lockfile:check -- --fix
npm run lockfile:check
```

Expected: `apps/web/package.json` có `"ogl": "1.0.11"`; `lockfile:check` cuối PASS. ogl 1.0.11 đã đọc qua `npm pack` (Quyết định "Đã kiểm"): `sideEffects: false`, có kiểu ở `types/`, giấy phép Unlicense, không phụ thuộc.

- [ ] **Step 2: Test phần thuần**

`apps/web/test/unit/hero-gl.test.ts`:

```ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useFirstInteraction } from '../../src/lib/use-first-interaction';
import { THREAD, WIRES } from '../../src/home/netlist-geometry';
import { glDecision, weaveColors } from '../../src/home/use-hero-gl';
import { RIBBON_STEPS, ribbonBuffers, WIRE_SEGMENTS, wireBuffers } from '../../src/home/weave-gl-geometry';

const ready = { reduced: false, saveData: false, interacted: true, visible: true };

describe('hero WebGL', () => {
  it('starts only after an interaction, on screen, without reduced motion or Save-Data', () => {
    expect(glDecision(ready)).toBe('start');
    expect(glDecision({ ...ready, reduced: true })).toBe('off');
    expect(glDecision({ ...ready, saveData: true })).toBe('off');
    expect(glDecision({ ...ready, interacted: false })).toBe('wait');
    expect(glDecision({ ...ready, visible: false })).toBe('wait');
  });

  it('notices the first interaction of the page', () => {
    const h = renderHook(() => useFirstInteraction());
    expect(h.result.current).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('pointermove'));
    });
    expect(h.result.current).toBe(true);
  });

  it('builds the wire and ribbon buffers from the committed geometry, and reads the theme gold', () => {
    const lines = wireBuffers();
    expect(lines).toHaveLength((WIRES.length / 5) * WIRE_SEGMENTS * 4);
    expect([lines[0], lines[1]]).toEqual([WIRES[0], WIRES[1]].map(Math.fround));
    const ribbon = ribbonBuffers();
    const samples = (THREAD.length / 2 - 1) * RIBBON_STEPS + 1;
    expect(ribbon.position).toHaveLength(samples * 4);
    expect(ribbon.side).toHaveLength(samples * 2);
    expect(weaveColors('dark', () => '').glow).toEqual([232 / 255, 182 / 255, 90 / 255]);
    expect(weaveColors('light', (n) => (n === '--atro-thread' ? '#ff0000' : '')).glow).toEqual([1, 0, 0]);
  });
});
```

Run: `npm test -w apps/web -- hero-gl`
Expected: FAIL, không tìm thấy `../../src/lib/use-first-interaction`.

- [ ] **Step 3: Hai hook dùng chung và hình học WebGL**

`apps/web/src/lib/use-first-interaction.ts`:

```ts
'use client';

import { useSyncExternalStore } from 'react';

const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
let interacted = false;
let armed = false;
const listeners = new Set<() => void>();

function fire(): void {
  if (interacted) return;
  interacted = true;
  for (const e of EVENTS) window.removeEventListener(e, fire, { capture: true });
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!armed && !interacted) {
    armed = true;
    for (const e of EVENTS) window.addEventListener(e, fire, { capture: true, passive: true });
  }
  return () => {
    listeners.delete(listener);
  };
}

/**
 * True once the visitor has done anything on the page. Heavy parts of the home page (the simulation, WebGL, live
 * stats) wait for it, so that loading the page costs no script time (Quyết định 9 of Plan 7C). Lighthouse never interacts.
 */
export function useFirstInteraction(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => interacted,
    () => false,
  );
}
```

`apps/web/src/lib/use-in-view.ts`:

```ts
'use client';

import { type RefObject, useEffect, useState } from 'react';

/** Whether the element is on screen. False without IntersectionObserver; with `once`, stays true after the first time. */
export function useInView(
  ref: RefObject<Element | null>,
  { once = false, rootMargin = '0px' }: { once?: boolean; rootMargin?: string } = {},
): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const on = entries.some((e) => e.isIntersecting);
        setInView((prev) => (once && prev ? true : on));
        if (on && once) io.disconnect();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, rootMargin]);
  return inView;
}
```

`apps/web/src/home/weave-gl-geometry.ts`:

```ts
import { THREAD, WIRES } from './netlist-geometry';
import { cubicPoint, type Point, pointsOf, smoothPoints } from './weave-path';

export const WIRE_SEGMENTS = 12;
export const RIBBON_WIDTH = 10;
export const RIBBON_STEPS = 8;

/** Every wire as WIRE_SEGMENTS straight pieces of the S-curve the SVG draws, for gl.LINES: x, y per vertex. */
export function wireBuffers(): Float32Array {
  const out = new Float32Array((WIRES.length / 5) * WIRE_SEGMENTS * 4);
  let k = 0;
  for (let i = 0; i < WIRES.length; i += 5) {
    const p0: Point = { x: WIRES[i], y: WIRES[i + 1] };
    const p1: Point = { x: WIRES[i + 2], y: WIRES[i + 3] };
    const mx = (p0.x + p1.x) / 2;
    const c1: Point = { x: mx, y: p0.y };
    const c2: Point = { x: mx, y: p1.y };
    let prev = p0;
    for (let s = 1; s <= WIRE_SEGMENTS; s++) {
      const next = cubicPoint(p0, c1, c2, p1, s / WIRE_SEGMENTS);
      out[k++] = prev.x;
      out[k++] = prev.y;
      out[k++] = next.x;
      out[k++] = next.y;
      prev = next;
    }
  }
  return out;
}

/** The thread as a TRIANGLE_STRIP RIBBON_WIDTH wide: x, y and a side of −1 or 1 per vertex, two vertices per sample. */
export function ribbonBuffers(): { position: Float32Array; side: Float32Array } {
  const pts = smoothPoints(pointsOf(THREAD), RIBBON_STEPS);
  const position = new Float32Array(pts.length * 4);
  const side = new Float32Array(pts.length * 2);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = (-(b.y - a.y) / len) * (RIBBON_WIDTH / 2);
    const ny = ((b.x - a.x) / len) * (RIBBON_WIDTH / 2);
    position.set([pts[i].x + nx, pts[i].y + ny, pts[i].x - nx, pts[i].y - ny], i * 4);
    side.set([1, -1], i * 2);
  }
  return { position, side };
}
```

- [ ] **Step 4: Hook quyết định và phần vẽ**

`apps/web/src/home/use-hero-gl.ts`:

```ts
'use client';

import { type RefObject, useEffect, useRef, useState } from 'react';
import { cssVar, parseHexColor } from '@/lib/css-color';
import { useFirstInteraction } from '@/lib/use-first-interaction';
import { useInView } from '@/lib/use-in-view';
import { usePrefersReducedMotion } from '@/motion/provider';
import { useTheme } from '@/theme/provider';
import type { WeaveGl } from './impl/weave-gl';

export type HeroGlState = 'off' | 'wait' | 'loading' | 'live' | 'unsupported' | 'failed';

export interface WeaveColors {
  /** The theme's thread gold, 0–1 per channel. */
  glow: [number, number, number];
  /** Light is dimmer on the light theme, where a glow reads as smudge. */
  strength: number;
}

export function glDecision(o: {
  reduced: boolean;
  saveData: boolean;
  interacted: boolean;
  visible: boolean;
}): 'off' | 'wait' | 'start' {
  if (o.reduced || o.saveData) return 'off';
  return o.interacted && o.visible ? 'start' : 'wait';
}

/** Probed first: without a context, ogl logs to the console and then throws. Software GL counts as none. */
export function supportsWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl', { failIfMajorPerformanceCaveat: true });
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

const GOLD = { dark: '#e8b65a', light: '#86590e' } as const;

export function weaveColors(theme: 'light' | 'dark', read: (name: string) => string = (n) => cssVar(n)): WeaveColors {
  const [r, g, b] = parseHexColor(read('--atro-thread')) ?? parseHexColor(GOLD[theme]) ?? [0, 0, 0];
  return { glow: [r / 255, g / 255, b / 255], strength: theme === 'dark' ? 1 : 0.7 };
}

/** Spec §5.1 scene 1 and Quyết định 7 of Plan 7C: WebGL adds light to the SVG weave, never replaces it. */
export function useHeroGl(ref: RefObject<HTMLCanvasElement | null>): HeroGlState {
  const reduced = usePrefersReducedMotion();
  const interacted = useFirstInteraction();
  const visible = useInView(ref);
  const { resolved } = useTheme();
  const [saveData, setSaveData] = useState(false);
  const [state, setState] = useState<HeroGlState>('wait');
  const handle = useRef<WeaveGl | null>(null);
  const started = useRef(false);
  const alive = useRef(false);
  const theme = useRef(resolved);
  theme.current = resolved;
  const decision = glDecision({ reduced, saveData, interacted, visible });

  useEffect(() => {
    const c = (navigator as { connection?: { saveData?: boolean } }).connection;
    setSaveData(c?.saveData === true);
  }, []);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      handle.current?.destroy();
      handle.current = null;
    };
  }, []);

  useEffect(() => {
    if (decision !== 'start' || started.current) return;
    started.current = true;
    if (!supportsWebGL()) {
      setState('unsupported');
      return;
    }
    setState('loading');
    import('./impl/weave-gl')
      .then(({ startWeaveGl }) => {
        const canvas = ref.current;
        if (!alive.current || !canvas) return;
        handle.current = startWeaveGl(canvas, weaveColors(theme.current), () => {
          handle.current = null;
          if (alive.current) setState('failed');
        });
        setState('live');
      })
      .catch(() => {
        if (alive.current) setState('failed');
      });
  }, [decision, ref]);

  useEffect(() => {
    if (state === 'live') handle.current?.setRunning(decision === 'start');
  }, [decision, state]);

  useEffect(() => {
    if (state === 'live') handle.current?.setColors(weaveColors(resolved));
  }, [resolved, state]);

  return decision === 'off' && (state === 'wait' || state === 'live') ? 'off' : state;
}
```

`apps/web/src/home/impl/weave-gl.ts`:

```ts
import { Geometry, Mesh, Program, Renderer, Transform } from 'ogl';
import { VIEW } from '../netlist-geometry';
import type { WeaveColors } from '../use-hero-gl';
import { ribbonBuffers, wireBuffers } from '../weave-gl-geometry';

const CLIP = 'gl_Position = vec4(position.x / uView.x * 2.0 - 1.0, 1.0 - position.y / uView.y * 2.0, 0.0, 1.0);';

const WIRE_VERTEX = `
attribute vec2 position;
uniform vec2 uView;
varying float vAlong;
void main() {
  vAlong = position.x / uView.x;
  ${CLIP}
}`;

// A pulse runs left to right, the way a signal crosses the 39 NAND layers.
const WIRE_FRAGMENT = `
precision mediump float;
uniform float uTime;
uniform vec3 uGlow;
uniform float uStrength;
varying float vAlong;
void main() {
  float d = fract(vAlong - uTime * 0.08);
  gl_FragColor = vec4(uGlow, exp(-d * 18.0) * 0.6 * uStrength);
}`;

const RIBBON_VERTEX = `
attribute vec2 position;
attribute float side;
uniform vec2 uView;
varying float vSide;
varying float vAlong;
void main() {
  vSide = side;
  vAlong = position.x / uView.x;
  ${CLIP}
}`;

const RIBBON_FRAGMENT = `
precision mediump float;
uniform float uTime;
uniform vec3 uGlow;
uniform float uStrength;
varying float vSide;
varying float vAlong;
void main() {
  float edge = 1.0 - abs(vSide);
  float sheen = 0.5 + 0.5 * sin((vAlong * 6.0 - uTime * 0.9) * 3.14159);
  gl_FragColor = vec4(uGlow, edge * edge * (0.2 + 0.55 * sheen) * uStrength);
}`;

export interface WeaveGl {
  setColors(c: WeaveColors): void;
  setRunning(on: boolean): void;
  destroy(): void;
}

/** Draws over the SVG in the same 1200 × 520 box (the canvas fills the hero's art frame, whose aspect ratio is fixed). */
export function startWeaveGl(canvas: HTMLCanvasElement, colors: WeaveColors, onLost: () => void): WeaveGl {
  const renderer = new Renderer({
    canvas,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
  });
  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);
  const uniforms = {
    uTime: { value: 0 },
    uView: { value: [VIEW.w, VIEW.h] },
    uGlow: { value: colors.glow },
    uStrength: { value: colors.strength },
  };
  const options = { uniforms, transparent: true, cullFace: false as const, depthTest: false, depthWrite: false };
  const wireProgram = new Program(gl, { vertex: WIRE_VERTEX, fragment: WIRE_FRAGMENT, ...options });
  const ribbonProgram = new Program(gl, { vertex: RIBBON_VERTEX, fragment: RIBBON_FRAGMENT, ...options });
  for (const p of [wireProgram, ribbonProgram]) {
    if (!gl.getProgramParameter(p.program, gl.LINK_STATUS)) throw new Error('the weave shaders did not link');
  }
  const scene = new Transform();
  const rb = ribbonBuffers();
  new Mesh(gl, {
    geometry: new Geometry(gl, { position: { size: 2, data: wireBuffers() } }),
    program: wireProgram,
    mode: gl.LINES,
  }).setParent(scene);
  new Mesh(gl, {
    geometry: new Geometry(gl, { position: { size: 2, data: rb.position }, side: { size: 1, data: rb.side } }),
    program: ribbonProgram,
    mode: gl.TRIANGLE_STRIP,
  }).setParent(scene);

  let running = false;
  let lost = false;
  let raf = 0;
  const t0 = performance.now();
  const draw = () => renderer.render({ scene });
  const frame = (now: number) => {
    uniforms.uTime.value = (now - t0) / 1000;
    draw();
    raf = running ? requestAnimationFrame(frame) : 0;
  };
  const parent = canvas.parentElement;
  const resize = () => {
    if (!parent || lost) return;
    renderer.setSize(parent.clientWidth, parent.clientHeight);
    if (!running) draw();
  };
  const ro = new ResizeObserver(resize);
  if (parent) ro.observe(parent);
  resize();
  const onContextLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    running = false;
    cancelAnimationFrame(raf);
    raf = 0;
    onLost();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  return {
    setColors(c) {
      uniforms.uGlow.value = c.glow;
      uniforms.uStrength.value = c.strength;
      if (!running && !lost) draw();
    },
    setRunning(on) {
      if (lost || on === running) return;
      running = on;
      if (on) raf = requestAnimationFrame(frame);
      else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
```

`apps/web/src/home/hero-gl.tsx`:

```tsx
'use client';

import { useRef } from 'react';
import { cn } from '@/lib/cn';
import { useHeroGl } from './use-hero-gl';

export function HeroGl() {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useHeroGl(ref);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      data-testid="hero-gl"
      data-state={state}
      className={cn(
        'pointer-events-none absolute inset-0 size-full transition-opacity duration-700',
        state === 'live' ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
}
```

Trong `apps/web/src/home/hero.tsx`, thêm `import { HeroGl } from './hero-gl';` và đặt `<HeroGl />` ngay sau `{art}` trong khung `aspectRatio: '1200 / 520'`:

```tsx
          <div className="relative w-full" style={{ aspectRatio: '1200 / 520' }}>
            {art}
            <HeroGl />
          </div>
```

Run: `npm test -w apps/web -- hero-gl lazy-boundary`
Expected: PASS (hero-gl 3, lazy-boundary 2). `ogl` chỉ có trong `src/home/impl/weave-gl.ts`, nạp bằng `import()`.

- [ ] **Step 5: E2E hero**

`apps/web/test/e2e/home.spec.ts`:

```ts
import { expect, test } from './fixtures';

test('the WebGL layer waits for the first interaction, never errors, and stays off with reduced motion', async ({
  page,
  state,
}) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(state.siteUrl);
  const gl = page.getByTestId('hero-gl');
  await expect(gl).toHaveAttribute('data-state', 'wait');
  await page.mouse.move(200, 200);
  // Headless Chromium has only software GL, which supportsWebGL() refuses: 'unsupported' is the expected answer there.
  await expect(gl).toHaveAttribute('data-state', /^(live|unsupported)$/);
  expect(errors).toEqual([]);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(state.siteUrl);
  await page.mouse.move(200, 200);
  await expect(gl).toHaveAttribute('data-state', 'off');
});
```

Run: `npm run e2e -w apps/web -- home`
Expected: PASS (desktop và mobile). Trên máy có GPU, chạy `npx playwright test home --headed -c apps/web/playwright.config.ts` một lần để thấy `live` và nhìn ánh sáng chạy.

- [ ] **Step 6: Ngân sách, Lighthouse, màn hình**

```bash
npm run build -w apps/web
npm run size -w apps/web
npm run lighthouse -w apps/web
```

Expected: `size` PASS (`/` vẫn ≤ 170 kB: ogl và shader nằm trong chunk nạp sau thao tác đầu); `lighthouse: PASS` (Lighthouse không thao tác nên WebGL không chạy).

Chụp màn hình có WebGL cần trình duyệt có GPU: chạy harness ở chế độ headed (`$env:SCREENS='home'; npx playwright test screens --project=desktop --headed -c apps/web/playwright.config.ts`), rồi kiểm ở cả hai theme: xung sáng không làm mờ chữ, dải sáng nằm đúng trên sợi chỉ vàng của SVG ở cả 390, 768 và 1440 px (nếu lệch: khung hình và canvas phải cùng tỉ lệ 1200 / 520). Liệt kê đường dẫn ảnh trong báo cáo task.

- [ ] **Step 7: Kiểm toàn bộ và commit**

```bash
npm test -w apps/web
npm run typecheck
npx biome check --write apps/web/src/lib/use-first-interaction.ts apps/web/src/lib/use-in-view.ts apps/web/src/home apps/web/test/unit/hero-gl.test.ts apps/web/test/e2e/home.spec.ts
npx biome ci .
git add apps/web/package.json package-lock.json apps/web/src/lib/use-first-interaction.ts apps/web/src/lib/use-in-view.ts apps/web/src/home/weave-gl-geometry.ts apps/web/src/home/use-hero-gl.ts apps/web/src/home/impl/weave-gl.ts apps/web/src/home/hero-gl.tsx apps/web/src/home/hero.tsx apps/web/test/unit/hero-gl.test.ts apps/web/test/e2e/home.spec.ts
git commit -m "feat(web): WebGL light over the hero weave, after the first interaction" -m "ogl loads only after an interaction, on screen, without reduced motion or Save-Data, and only where real WebGL exists; a lost context falls back to the SVG." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Mô phỏng kéo được (cảnh 2 và 3), chạy bằng SDK trên netlist thật

Cảnh 2 (thừa kế) và cảnh 3 (khôi phục ví) của §5.1: một thanh kéo ngày, vài công tắc, sợi chỉ và danh sách bước, mọi khung hình tính bằng `applyAction`, `deriveInputs`, `computeTimeline` của SDK trên `programEngine(buildAll().program)` (Quyết định 8). Plan 7C tự làm, không dùng cỗ máy thời gian của 7B.

**Files:**
- Create: `apps/web/src/home/sim-days.ts`, `apps/web/src/home/impl/sim.ts`, `apps/web/src/home/sim-box.tsx`, `apps/web/src/home/scene.tsx`, `apps/web/src/home/how-it-works.tsx`, `apps/web/src/home/recovery-scene.tsx`
- Create: `apps/web/src/messages/story.messages.ts` (chữ của cả năm cảnh 2–6; Task 7 dùng tiếp)
- Modify: `apps/web/src/app/page.tsx`
- Test: `apps/web/test/unit/sim.test.ts`, `apps/web/test/e2e/home.spec.ts` (thêm hai test)

**Interfaces:**
- Consumes (7A): `Thread`, `StateBadge`, `messages as labels` và `STATE_KEY` (`@/messages/labels.messages`), `useT`, `cn`, `defineMessages`. (Task 4): `HomeHero`, `WeaveArt`. (Task 5): `useFirstInteraction()`. SDK (chỉ trong `impl/sim.ts`): `applyAction`, `deriveInputs`, `computeTimeline`, `programEngine`, `PRESETS`, `STATE_CODES`, `OUT_FLAGS`, `stateName`, `type EvalState`, `type PolicyEngine`, `type VaultAction`, `type StateName`; circuits: `buildAll`.
- Produces:
  - `src/home/sim-days.ts`: `DAY = 86_400n`; `INHERIT_DAYS = { alarm: 180, confirm: 183, back: 187, release: 194, fallback: 450, nextAlarm: 367 }`; `RECOVER_DAYS = { vote1: 10, vote2: 12, block: 20, release: 26 }`; `WINDOW_DAYS = 14`; `ALARM_AFTER_DAYS = 180`; `type ScenarioName = 'inherit' | 'recover'`; `interface ScenarioOptions { confirm?: boolean; ownerReturns?: boolean; block?: boolean }`; `DEFAULT_OPTIONS: Record<ScenarioName, Required<ScenarioOptions>>`; `SCENARIO_SPAN = { inherit: 480, recover: 40 }`; `type SimEventKind = 'start' | 'alarm' | 'confirm' | 'vote' | 'checkIn' | 'release'`; `interface SimEvent { day: number; kind: SimEventKind; state: StateName }`; `DEFAULT_EVENTS: Record<ScenarioName, readonly SimEvent[]>`; `interface SimFrame { state: StateName; remaining: number; index: number }`; `frameAt(events, day, span): SimFrame`; `type StoryEventKey`; `eventKey(name, events, i): StoryEventKey`.
  - `src/home/impl/sim.ts` (chỉ qua `import()`): `simEngine(): PolicyEngine`; `runScenario(name: ScenarioName, o?: ScenarioOptions): SimEvent[]`.
  - `src/home/sim-box.tsx`: `SimBox({ name })`; `data-testid="sim-<name>"` với `data-state` (StateName) và `data-ready` (`true` khi SDK đã nạp); thanh kéo `data-testid="sim-<name>-day"`.
  - `src/home/scene.tsx`: `interface SceneProps { id: string; eyebrow: string; title: string; lead: string; children?: ReactNode }`; `Scene(p)` (`<section class="scene">` với `<header class="scene-head">` và `<h2 id="<id>-title">`).
  - `src/home/how-it-works.tsx`: `HowItWorks()`; `src/home/recovery-scene.tsx`: `RecoveryScene()`.
  - `src/messages/story.messages.ts`: `messages` (khoá ở Step 5; Task 7 đọc các khoá `trust*`, `mini*`, `agent*`, `stats*`, `copyCommand`).

- [ ] **Step 1: Test mô phỏng**

`apps/web/test/unit/sim.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { runScenario } from '../../src/home/impl/sim';
import { DEFAULT_EVENTS, eventKey, frameAt, SCENARIO_SPAN, type SimEvent } from '../../src/home/sim-days';

const lines = (events: readonly SimEvent[]) => events.map((e) => `${e.day} ${e.kind} ${e.state}`);

describe('home simulations', () => {
  it('prerender exactly what the SDK computes on the real netlist', () => {
    expect(runScenario('inherit')).toEqual(DEFAULT_EVENTS.inherit);
    expect(runScenario('recover')).toEqual(DEFAULT_EVENTS.recover);
  });

  it('follow the toggles', () => {
    const noConfirm = runScenario('inherit', { confirm: false });
    expect(lines(noConfirm)).toEqual(['0 start active', '180 alarm grace', '450 release releasedInherit']);
    expect(eventKey('inherit', noConfirm, 2)).toBe('evReleaseFallback');
    expect(eventKey('inherit', DEFAULT_EVENTS.inherit, 3)).toBe('evReleaseInherit');
    expect(lines(runScenario('inherit', { ownerReturns: true }))).toEqual([
      '0 start active',
      '180 alarm grace',
      '183 confirm grace',
      '187 checkIn active',
      '367 alarm grace',
    ]);
    expect(lines(runScenario('recover', { block: true }))).toEqual([
      '0 start active',
      '10 vote active',
      '12 vote recovery',
      '20 checkIn active',
    ]);
  });

  it('read the vault on any day', () => {
    const inherit = DEFAULT_EVENTS.inherit;
    expect(frameAt(inherit, 90, SCENARIO_SPAN.inherit)).toEqual({ state: 'active', remaining: 0.5, index: 0 });
    expect(frameAt(inherit, 187, SCENARIO_SPAN.inherit)).toEqual({ state: 'grace', remaining: 0.5, index: 2 });
    expect(frameAt(inherit, 300, SCENARIO_SPAN.inherit)).toEqual({ state: 'releasedInherit', remaining: 0, index: 3 });
    expect(frameAt(DEFAULT_EVENTS.recover, 19, SCENARIO_SPAN.recover)).toEqual({
      state: 'recovery',
      remaining: 0.5,
      index: 2,
    });
  });
});
```

Run: `npm test -w apps/web -- sim`
Expected: FAIL, không tìm thấy `../../src/home/impl/sim`.

- [ ] **Step 2: `sim-days.ts`**

```ts
import type { StateName } from '@atropyle/sdk';

export const DAY = 86_400n;
/** Days of the inheritance story with PRESETS.sixMonths (check in every 30 days, alarm after 6 misses, 14-day window). */
export const INHERIT_DAYS = { alarm: 180, confirm: 183, back: 187, release: 194, fallback: 450, nextAlarm: 367 } as const;
/** Days of the recovery story: 2 of 3 guardians, the same timing. */
export const RECOVER_DAYS = { vote1: 10, vote2: 12, block: 20, release: 26 } as const;
export const WINDOW_DAYS = 14;
export const ALARM_AFTER_DAYS = 180;

export type ScenarioName = 'inherit' | 'recover';
export interface ScenarioOptions {
  /** inherit: a guardian confirms on day 183. */
  confirm?: boolean;
  /** inherit: the owner checks in on day 187. */
  ownerReturns?: boolean;
  /** recover: the owner checks in on day 20. */
  block?: boolean;
}
export const DEFAULT_OPTIONS: Record<ScenarioName, Required<ScenarioOptions>> = {
  inherit: { confirm: true, ownerReturns: false, block: false },
  recover: { confirm: false, ownerReturns: false, block: false },
};
export const SCENARIO_SPAN: Record<ScenarioName, number> = { inherit: 480, recover: 40 };

export type SimEventKind = 'start' | 'alarm' | 'confirm' | 'vote' | 'checkIn' | 'release';
export interface SimEvent {
  day: number;
  kind: SimEventKind;
  state: StateName;
}

/** What runScenario computes with the default toggles (sim.test.ts proves it), shown before the SDK loads. */
export const DEFAULT_EVENTS: Record<ScenarioName, readonly SimEvent[]> = {
  inherit: [
    { day: 0, kind: 'start', state: 'active' },
    { day: INHERIT_DAYS.alarm, kind: 'alarm', state: 'grace' },
    { day: INHERIT_DAYS.confirm, kind: 'confirm', state: 'grace' },
    { day: INHERIT_DAYS.release, kind: 'release', state: 'releasedInherit' },
  ],
  recover: [
    { day: 0, kind: 'start', state: 'active' },
    { day: RECOVER_DAYS.vote1, kind: 'vote', state: 'active' },
    { day: RECOVER_DAYS.vote2, kind: 'vote', state: 'recovery' },
    { day: RECOVER_DAYS.release, kind: 'release', state: 'releasedRecover' },
  ],
};

export interface SimFrame {
  state: StateName;
  /** How much of the thread is left, 0–1. */
  remaining: number;
  /** The last event at or before the day. */
  index: number;
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

export function frameAt(events: readonly SimEvent[], day: number, span: number): SimFrame {
  let index = 0;
  for (let i = 0; i < events.length; i++) if (events[i].day <= day) index = i;
  const { state } = events[index];
  if (state === 'releasedInherit' || state === 'releasedRecover') return { state, remaining: 0, index };
  if (state === 'active') {
    let alive = 0;
    for (let i = 0; i <= index; i++) if (events[i].kind === 'start' || events[i].kind === 'checkIn') alive = events[i].day;
    return { state, remaining: clamp(1 - (day - alive) / ALARM_AFTER_DAYS), index };
  }
  // grace or recovery: from the day it began to the release, or to the end of the story.
  let from = events[index].day;
  for (let i = index; i >= 0 && events[i].state === state; i--) from = events[i].day;
  const to = events.slice(index + 1).find((e) => e.kind === 'release')?.day ?? span;
  return { state, remaining: clamp(1 - (day - from) / Math.max(1, to - from)), index };
}

export type StoryEventKey =
  | 'evStart'
  | 'evAlarm'
  | 'evConfirm'
  | 'evCheckIn'
  | 'evCheckInBlock'
  | 'evVoteOne'
  | 'evVoteEnough'
  | 'evReleaseInherit'
  | 'evReleaseFallback'
  | 'evReleaseRecover';

/** Which sentence tells event i: a release without a confirmation since the last alarm is the 15-period fallback. */
export function eventKey(name: ScenarioName, events: readonly SimEvent[], i: number): StoryEventKey {
  const e = events[i];
  switch (e.kind) {
    case 'start':
      return 'evStart';
    case 'alarm':
      return 'evAlarm';
    case 'confirm':
      return 'evConfirm';
    case 'vote':
      return e.state === 'recovery' ? 'evVoteEnough' : 'evVoteOne';
    case 'checkIn':
      return name === 'recover' ? 'evCheckInBlock' : 'evCheckIn';
    case 'release': {
      if (name === 'recover') return 'evReleaseRecover';
      let confirmed = false;
      for (let j = 0; j < i; j++) {
        if (events[j].kind === 'alarm') confirmed = false;
        if (events[j].kind === 'confirm') confirmed = true;
      }
      return confirmed ? 'evReleaseInherit' : 'evReleaseFallback';
    }
  }
}
```

- [ ] **Step 3: `impl/sim.ts`**

```ts
import { buildAll } from '@atropyle/circuits';
import {
  applyAction,
  computeTimeline,
  deriveInputs,
  type EvalState,
  OUT_FLAGS,
  type PolicyEngine,
  PRESETS,
  programEngine,
  STATE_CODES,
  stateName,
  type VaultAction,
} from '@atropyle/sdk';
import type { Address } from 'viem';
import {
  DAY,
  DEFAULT_OPTIONS,
  INHERIT_DAYS,
  RECOVER_DAYS,
  SCENARIO_SPAN,
  type ScenarioName,
  type ScenarioOptions,
  type SimEvent,
  type SimEventKind,
} from '../sim-days';

// Stand-in people: any distinct addresses do, these read as such.
const OWNER: Address = '0x1000000000000000000000000000000000000001';
const GUARDIANS: Address[] = [
  '0x2000000000000000000000000000000000000001',
  '0x2000000000000000000000000000000000000002',
  '0x2000000000000000000000000000000000000003',
];
const KEEPER: Address = '0x3000000000000000000000000000000000000001';
const NEW_WALLET: Address = '0x4000000000000000000000000000000000000001';

const INHERIT: EvalState = {
  state: STATE_CODES.active,
  owner: OWNER,
  lastAlive: 0n,
  alarmAt: 0n,
  timing: PRESETS.sixMonths,
  k: 1,
  recoveryEnabled: false,
  guardians: GUARDIANS.slice(0, 2),
  inhVotes: 0,
  recVotes: [null, null],
  recoveryTarget: null,
};
const RECOVER: EvalState = { ...INHERIT, k: 2, recoveryEnabled: true, guardians: GUARDIANS, recVotes: [null, null, null] };

let engine: PolicyEngine | null = null;
/** The policy netlist of this repository: the circuit the vault runs on chain (P8 of the proof). */
export function simEngine(): PolicyEngine {
  engine ??= programEngine(buildAll().program);
  return engine;
}

/** One call to the vault, the way AtropyleVault._evaluate does it: the same steps as predictAction (SDK policy/predict.ts). */
function step(e: PolicyEngine, cur: EvalState, action: VaultAction, as: Address, at: bigint): EvalState {
  const applied = applyAction(cur, action, as, at, false);
  if (!applied) return cur;
  const r = e.step(cur.state, deriveInputs(applied.next, at, { alive: applied.alive, candidate: applied.candidate }));
  const next: EvalState = { ...applied.next, state: r.next };
  const candidate = cur.state === STATE_CODES.recovery ? cur.recoveryTarget : applied.candidate;
  if (r.out & OUT_FLAGS.alarm) {
    next.alarmAt = at;
    next.recoveryTarget = r.next === STATE_CODES.recovery ? candidate : null;
  }
  if (r.out & OUT_FLAGS.cancel) {
    next.alarmAt = 0n;
    next.recoveryTarget = null;
  }
  return next;
}

interface ScriptStep {
  day: number;
  kind: SimEventKind;
  action: VaultAction;
  by: Address;
}

function scriptOf(name: ScenarioName, o: Required<ScenarioOptions>): ScriptStep[] {
  if (name === 'inherit') {
    const s: ScriptStep[] = [];
    if (o.confirm) s.push({ day: INHERIT_DAYS.confirm, kind: 'confirm', action: { type: 'attestDeath', on: true }, by: GUARDIANS[0] });
    if (o.ownerReturns) s.push({ day: INHERIT_DAYS.back, kind: 'checkIn', action: { type: 'checkIn' }, by: OWNER });
    return s;
  }
  const vote: VaultAction = { type: 'voteRecovery', target: NEW_WALLET };
  const s: ScriptStep[] = [
    { day: RECOVER_DAYS.vote1, kind: 'vote', action: vote, by: GUARDIANS[0] },
    { day: RECOVER_DAYS.vote2, kind: 'vote', action: vote, by: GUARDIANS[1] },
  ];
  if (o.block) s.push({ day: RECOVER_DAYS.block, kind: 'checkIn', action: { type: 'checkIn' }, by: OWNER });
  return s;
}

/**
 * The story day by day: the scripted calls, and between them every alarm and release the timeline predicts, each
 * triggered by a keeper's poke as on chain. Events up to the end of the story's span.
 */
export function runScenario(name: ScenarioName, o: ScenarioOptions = {}): SimEvent[] {
  const e = simEngine();
  const opts = { ...DEFAULT_OPTIONS[name], ...o };
  let cur = name === 'inherit' ? INHERIT : RECOVER;
  let now = 0n;
  const events: SimEvent[] = [{ day: 0, kind: 'start', state: 'active' }];
  const until = (end: bigint) => {
    for (let guard = 0; guard < 8; guard++) {
      const next = computeTimeline(e, cur, now, null).events.find((x) => x.kind !== 'drillExpiry' && x.at < end);
      if (!next) return;
      cur = step(e, cur, { type: 'poke' }, KEEPER, next.at);
      now = next.at;
      events.push({ day: Number(next.at / DAY), kind: next.kind === 'alarm' ? 'alarm' : 'release', state: stateName(cur.state) });
    }
  };
  for (const s of scriptOf(name, opts)) {
    const at = BigInt(s.day) * DAY;
    until(at);
    cur = step(e, cur, s.action, s.by, at);
    now = at;
    events.push({ day: s.day, kind: s.kind, state: stateName(cur.state) });
  }
  until(BigInt(SCENARIO_SPAN[name]) * DAY + 1n);
  return events;
}
```

Run: `npm run build && npm test -w apps/web -- sim`
Expected: PASS (3 test). Đây là đúng các ngày đã chạy thử trên `packages/sdk/dist` ngày 23/11 (mục "Đã kiểm"). Nếu một ngày khác: đừng sửa hằng số cho khớp trước khi hiểu vì sao circuit hay SDK đã đổi.

- [ ] **Step 4: Test `lazy-boundary` vẫn giữ**

Run: `npm test -w apps/web -- lazy-boundary`
Expected: PASS. `sim-days.ts` chỉ `import type` từ `@atropyle/sdk`; giá trị SDK chỉ nằm trong `src/home/impl/sim.ts`.

- [ ] **Step 5: Chuỗi giao diện của câu chuyện trang chủ**

`apps/web/src/messages/story.messages.ts`:

```ts
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    howEyebrow: 'How it works',
    howTitle: 'A promise you keep by checking in',
    howLead: 'Check in once a month with a tap. If six months pass without one, an alarm starts: your guardians are told, and your heirs can receive what you left them. Drag the slider to watch a real vault decide, day by day.',
    recEyebrow: 'Wallet recovery',
    recTitle: 'Lost your keys, not your life',
    recLead: 'Recovery is off unless you turn it on. When it is on, enough of your guardians can move everything to a new wallet of yours, after a 14-day wait. One check-in from your old wallet stops it, so nobody can take your vault while you can still sign.',
    recNote: 'This example uses 2 of 3 guardians. You choose the number.',
    toggleConfirm: 'A guardian confirms on day 183',
    toggleReturn: 'The owner comes back on day 187',
    toggleBlock: 'The owner checks in on day 20',
    togglesLegend: 'What happens in this story',
    sliderLabel: 'Day in the story',
    sliderValue: 'Day {day} of {span}: {state}',
    dayShort: 'Day {day}',
    threadLabel: 'The vault on day {day}: {state}',
    stepsLabel: 'What the vault does',
    simLoading: 'Loading the simulation…',
    simCaption: 'Every step is computed by the Atropyle SDK on the same circuit that runs on chain.',
    evStart: 'Day {day}: you set up the vault and check in.',
    evAlarm: 'Day {day}: six check-ins missed. The alarm starts and your guardians are told.',
    evConfirm: 'Day {day}: a guardian confirms that you can no longer sign. Your heirs can receive when the 14-day alarm window ends.',
    evCheckIn: 'Day {day}: you check in. The alarm stops and everything starts over.',
    evCheckInBlock: 'Day {day}: you check in from your old wallet. The vote is cancelled.',
    evVoteOne: 'Day {day}: a guardian votes to move the vault to your new wallet.',
    evVoteEnough: 'Day {day}: a second guardian votes. That is enough: a 14-day wait starts.',
    evReleaseInherit: 'Day {day}: the window closes with no check-in. Your heirs receive their shares.',
    evReleaseFallback: 'Day {day}: no guardian confirmed, but fifteen check-ins in a row are now missed. Your heirs receive their shares.',
    evReleaseRecover: 'Day {day}: the wait is over. Everything moves to your new wallet.',
    trustEyebrow: 'Why you can trust it',
    trustTitle: 'Rules nobody can change, not even us',
    trustLead: 'The rules above are not a promise from a company. They are one circuit on the X Layer TapeOut processor, frozen on chain, and anyone can check every case. Try a small part of the proof right here.',
    trustScope: 'This quick run checks {done} of the {total} cases. The full proof checks all of them.',
    trustRun: 'Run a quick proof',
    trustAgain: 'Run it again',
    trustRunning: 'Checking…',
    trustOk: 'All eight rules held in {combos} cases.',
    trustBroken: 'The quick proof failed. Open the full proof to see why.',
    trustFull: 'See the full proof',
    miniLabel: 'Quick proof map: {done} of {total} cases checked.',
    agentEyebrow: 'For AI agents',
    agentTitle: 'Plan in plain words. Sign in your own wallet.',
    agentLead: 'Ask Claude Code, or any agent that speaks MCP, to plan your vault. The Atropyle plugin checks the plan, simulates it on the real circuit and prepares the transactions. It never holds a key: you sign every step yourself.',
    agentCaption: 'An illustration of a session with the Atropyle plugin. The tool names are the real ones.',
    agentYou: 'You',
    agentAgent: 'Agent',
    agentTool: 'Tool',
    agentLine1: 'Plan my crypto inheritance: 70% to my daughter, 30% to my brother. Two friends as guardians.',
    agentLine2: 'The plan is valid: 2 heirs, 2 guardians, a check-in every 30 days.',
    agentLine3: 'If you stop checking in, the alarm starts on day 180, and with a guardian confirmation your heirs receive on day 194.',
    agentLine4: 'The transactions are prepared. Nothing is signed.',
    agentLine5: 'Here is your plan. Open the signing link and approve each step in your wallet.',
    agentInstall: 'Install',
    agentPlugin: 'Claude Code plugin',
    agentMcp: 'Any MCP client',
    agentSkills: 'Agent Skills, for other agents',
    copyCommand: 'Copy the command',
    statsEyebrow: 'On chain now',
    statsTitle: 'Live from the chain',
    statsLead: 'Every number comes from X Layer, and you can count them again yourself.',
    statsVaults: 'Vaults',
    statsDrills: 'Drills',
    statsCheckIns: 'Check-ins',
    statsAtBlock: 'At block {block}',
    statsSourceApi: 'From the Atropyle index',
    statsSourceChain: 'Counted by your browser from the chain',
    statsCount: 'Count from the chain',
    statsCounting: 'Counting… {done} of {total} blocks',
    statsEmpty: 'No count yet. Counting reads the factory’s events from the chain and takes a few seconds.',
    statsFactory: 'The factory contract on {explorer}',
  },
  {
    howEyebrow: 'Cách hoạt động',
    howTitle: 'Một lời hứa bạn giữ bằng cách check-in',
    howLead: 'Mỗi tháng check-in một lần bằng một cú chạm. Nếu sáu tháng trôi qua mà không có lần nào, báo động bắt đầu: người giám hộ được báo, và người thừa kế có thể nhận phần bạn để lại. Kéo thanh trượt để xem một vault thật quyết định, từng ngày một.',
    recEyebrow: 'Khôi phục ví',
    recTitle: 'Mất chìa khoá, không mất tất cả',
    recLead: 'Khôi phục ví mặc định tắt. Khi bạn bật, đủ số người giám hộ có thể chuyển mọi thứ sang một ví mới của bạn, sau 14 ngày chờ. Chỉ một lần check-in từ ví cũ là dừng được, nên không ai lấy được vault khi bạn vẫn còn ký được.',
    recNote: 'Ví dụ này dùng 2 trên 3 người giám hộ. Con số do bạn chọn.',
    toggleConfirm: 'Một người giám hộ xác nhận vào ngày 183',
    toggleReturn: 'Chủ ví quay lại vào ngày 187',
    toggleBlock: 'Chủ ví check-in vào ngày 20',
    togglesLegend: 'Điều xảy ra trong câu chuyện này',
    sliderLabel: 'Ngày trong câu chuyện',
    sliderValue: 'Ngày {day} trên {span}: {state}',
    dayShort: 'Ngày {day}',
    threadLabel: 'Vault vào ngày {day}: {state}',
    stepsLabel: 'Những gì vault làm',
    simLoading: 'Đang nạp mô phỏng…',
    simCaption: 'Mỗi bước được SDK của Atropyle tính trên đúng circuit đang chạy trên chain.',
    evStart: 'Ngày {day}: bạn lập vault và check-in.',
    evAlarm: 'Ngày {day}: đã lỡ sáu lần check-in. Báo động bắt đầu và người giám hộ được báo.',
    evConfirm: 'Ngày {day}: một người giám hộ xác nhận bạn không còn ký được. Người thừa kế sẽ nhận khi 14 ngày báo động kết thúc.',
    evCheckIn: 'Ngày {day}: bạn check-in. Báo động dừng và mọi thứ bắt đầu lại.',
    evCheckInBlock: 'Ngày {day}: bạn check-in từ ví cũ. Cuộc bầu bị huỷ.',
    evVoteOne: 'Ngày {day}: một người giám hộ bầu chuyển vault sang ví mới của bạn.',
    evVoteEnough: 'Ngày {day}: người giám hộ thứ hai bầu. Thế là đủ: 14 ngày chờ bắt đầu.',
    evReleaseInherit: 'Ngày {day}: hết thời gian báo động mà không có check-in. Người thừa kế nhận phần của mình.',
    evReleaseFallback: 'Ngày {day}: không ai xác nhận, nhưng bạn đã lỡ mười lăm lần check-in liên tiếp. Người thừa kế nhận phần của mình.',
    evReleaseRecover: 'Ngày {day}: hết 14 ngày chờ. Mọi thứ chuyển sang ví mới của bạn.',
    trustEyebrow: 'Vì sao tin được',
    trustTitle: 'Luật không ai sửa được, kể cả chúng tôi',
    trustLead: 'Các luật ở trên không phải lời hứa của một công ty. Chúng là một circuit trên bộ xử lý X Layer TapeOut, đã đóng băng trên chain, và ai cũng kiểm được mọi trường hợp. Hãy thử một phần nhỏ của bằng chứng ngay tại đây.',
    trustScope: 'Lần chạy nhanh này kiểm {done} trên {total} trường hợp. Bằng chứng đầy đủ kiểm tất cả.',
    trustRun: 'Chạy bằng chứng nhanh',
    trustAgain: 'Chạy lại',
    trustRunning: 'Đang kiểm…',
    trustOk: 'Cả tám luật đều đúng trong {combos} trường hợp.',
    trustBroken: 'Bằng chứng nhanh thất bại. Mở bằng chứng đầy đủ để xem lý do.',
    trustFull: 'Xem bằng chứng đầy đủ',
    miniLabel: 'Bản đồ bằng chứng nhanh: đã kiểm {done} trên {total} trường hợp.',
    agentEyebrow: 'Cho AI agent',
    agentTitle: 'Lập kế hoạch bằng lời. Ký bằng ví của bạn.',
    agentLead: 'Nhờ Claude Code, hoặc bất kỳ agent nào dùng được MCP, lập kế hoạch cho vault. Plugin Atropyle kiểm kế hoạch, mô phỏng nó trên đúng circuit và chuẩn bị giao dịch. Nó không bao giờ giữ khoá: bạn tự ký từng bước.',
    agentCaption: 'Minh hoạ một phiên làm việc với plugin Atropyle. Tên công cụ là tên thật.',
    agentYou: 'Bạn',
    agentAgent: 'Agent',
    agentTool: 'Công cụ',
    agentLine1: 'Lập kế hoạch thừa kế crypto cho tôi: 70% cho con gái, 30% cho em trai. Hai người bạn làm giám hộ.',
    agentLine2: 'Kế hoạch hợp lệ: 2 người thừa kế, 2 người giám hộ, check-in mỗi 30 ngày.',
    agentLine3: 'Nếu bạn ngừng check-in, báo động bắt đầu vào ngày 180, và khi có giám hộ xác nhận thì người thừa kế nhận vào ngày 194.',
    agentLine4: 'Các giao dịch đã được chuẩn bị. Chưa có gì được ký.',
    agentLine5: 'Kế hoạch của bạn đây. Mở link ký và duyệt từng bước trong ví của bạn.',
    agentInstall: 'Cài đặt',
    agentPlugin: 'Plugin cho Claude Code',
    agentMcp: 'Mọi MCP client',
    agentSkills: 'Agent Skills, cho các agent khác',
    copyCommand: 'Chép lệnh',
    statsEyebrow: 'Trên chain lúc này',
    statsTitle: 'Số liệu thật từ chain',
    statsLead: 'Mọi con số đến từ X Layer, và bạn tự đếm lại được.',
    statsVaults: 'Vault',
    statsDrills: 'Drill',
    statsCheckIns: 'Lần check-in',
    statsAtBlock: 'Tại block {block}',
    statsSourceApi: 'Theo chỉ mục của Atropyle',
    statsSourceChain: 'Do trình duyệt của bạn đếm từ chain',
    statsCount: 'Đếm từ chain',
    statsCounting: 'Đang đếm… {done} trên {total} block',
    statsEmpty: 'Chưa có số liệu. Việc đếm đọc các sự kiện của factory từ chain và mất vài giây.',
    statsFactory: 'Hợp đồng factory trên {explorer}',
  },
);
```

- [ ] **Step 6: `Scene`, `SimBox` và hai cảnh**

`apps/web/src/home/scene.tsx` (không hook; dùng được trong client và server component):

```tsx
import type { ReactNode } from 'react';

export interface SceneProps {
  id: string;
  eyebrow: string;
  title: string;
  lead: string;
  children?: ReactNode;
}

/** One scene of the home story (spec §5.1). `.scene-head` drifts in on scroll (home.css, Task 7). */
export function Scene({ id, eyebrow, title, lead, children }: SceneProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scene relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-20 sm:px-6 md:py-28"
    >
      <header className="scene-head flex max-w-3xl flex-col gap-4">
        <p className="font-medium text-caption text-thread uppercase tracking-[0.16em]">{eyebrow}</p>
        <h2 id={`${id}-title`} className="text-balance font-display text-h2">
          {title}
        </h2>
        <p className="text-pretty text-ink-muted text-lead">{lead}</p>
      </header>
      {children}
    </section>
  );
}
```

`apps/web/src/home/sim-box.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { useFirstInteraction } from '@/lib/use-first-interaction';
import { messages as labels, STATE_KEY } from '@/messages/labels.messages';
import { messages as story } from '@/messages/story.messages';
import { StateBadge } from '@/thread/state-badge';
import { Thread } from '@/thread/thread';
import type * as SimImpl from './impl/sim';
import {
  DEFAULT_EVENTS,
  DEFAULT_OPTIONS,
  eventKey,
  frameAt,
  SCENARIO_SPAN,
  type ScenarioName,
  type ScenarioOptions,
} from './sim-days';

type Toggle = { key: keyof ScenarioOptions; label: 'toggleConfirm' | 'toggleReturn' | 'toggleBlock' };
const TOGGLES: Record<ScenarioName, readonly Toggle[]> = {
  inherit: [
    { key: 'confirm', label: 'toggleConfirm' },
    { key: 'ownerReturns', label: 'toggleReturn' },
  ],
  recover: [{ key: 'block', label: 'toggleBlock' }],
};

const same = (a: Required<ScenarioOptions>, b: Required<ScenarioOptions>) =>
  a.confirm === b.confirm && a.ownerReturns === b.ownerReturns && a.block === b.block;

/**
 * Drag through the days of a vault. Before the first interaction the SDK is not loaded and the steps of the default
 * story are shown (the same ones, sim.test.ts); toggles changed before it loads apply as soon as it does.
 */
export function SimBox({ name }: { name: ScenarioName }) {
  const t = useT(story);
  const tl = useT(labels);
  const interacted = useFirstInteraction();
  const [impl, setImpl] = useState<typeof SimImpl | null>(null);
  const [opts, setOpts] = useState<Required<ScenarioOptions>>(DEFAULT_OPTIONS[name]);
  const [day, setDay] = useState(0);
  const span = SCENARIO_SPAN[name];

  useEffect(() => {
    if (!interacted || impl) return;
    let live = true;
    import('./impl/sim').then(
      (m) => {
        if (live) setImpl(m);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [interacted, impl]);

  const events = useMemo(() => (impl ? impl.runScenario(name, opts) : DEFAULT_EVENTS[name]), [impl, name, opts]);
  const frame = frameAt(events, day, span);
  const stateText = tl(STATE_KEY[frame.state]);
  const waiting = impl === null && !same(opts, DEFAULT_OPTIONS[name]);

  return (
    <div
      data-testid={`sim-${name}`}
      data-state={frame.state}
      data-ready={impl ? 'true' : 'false'}
      className="grid gap-8 rounded-3xl border border-line bg-surface-1 p-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:p-8"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <StateBadge state={frame.state} />
          <span className="font-mono text-ink-muted text-small tabular-nums">{t('dayShort', { day })}</span>
        </div>
        <Thread
          state={frame.state}
          remaining={frame.remaining}
          label={t('threadLabel', { day, state: stateText })}
          className="w-full"
        />
        <label className="flex flex-col gap-2 text-small">
          {t('sliderLabel')}
          <input
            type="range"
            min={0}
            max={span}
            step={1}
            value={day}
            data-testid={`sim-${name}-day`}
            aria-valuetext={t('sliderValue', { day, span, state: stateText })}
            onChange={(e) => setDay(Number(e.currentTarget.value))}
            className="accent-thread"
          />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t('togglesLegend')}</legend>
          {TOGGLES[name].map((tg) => (
            <label key={tg.key} className="flex items-center gap-3 text-small">
              <input
                type="checkbox"
                checked={opts[tg.key]}
                onChange={(e) => {
                  const on = e.currentTarget.checked;
                  setOpts((o) => ({ ...o, [tg.key]: on }));
                }}
                className="size-4 accent-thread"
              />
              {t(tg.label)}
            </label>
          ))}
        </fieldset>
        {waiting ? <p className="text-ink-muted text-small">{t('simLoading')}</p> : null}
      </div>
      <ol aria-label={t('stepsLabel')} className="flex flex-col gap-3">
        {events.map((e, i) => (
          <li
            key={`${e.day}-${e.kind}`}
            aria-current={i === frame.index ? 'step' : undefined}
            className={cn(
              'flex gap-3 text-pretty',
              e.day > day ? 'text-ink-muted' : 'text-ink',
              i === frame.index && 'font-medium',
            )}
          >
            <span
              aria-hidden="true"
              className={cn('mt-2 size-2 shrink-0 rounded-full', e.day > day ? 'bg-line-strong' : 'bg-thread')}
            />
            {t(eventKey(name, events, i), { day: e.day })}
          </li>
        ))}
      </ol>
      <p className="text-caption text-ink-muted md:col-span-2">{t('simCaption')}</p>
    </div>
  );
}
```

`apps/web/src/home/how-it-works.tsx`:

```tsx
'use client';

import { useT } from '@/i18n/provider';
import { messages as story } from '@/messages/story.messages';
import { Scene } from './scene';
import { SimBox } from './sim-box';

export function HowItWorks() {
  const t = useT(story);
  return (
    <Scene id="how" eyebrow={t('howEyebrow')} title={t('howTitle')} lead={t('howLead')}>
      <SimBox name="inherit" />
    </Scene>
  );
}
```

`apps/web/src/home/recovery-scene.tsx`:

```tsx
'use client';

import { useT } from '@/i18n/provider';
import { messages as story } from '@/messages/story.messages';
import { Scene } from './scene';
import { SimBox } from './sim-box';

export function RecoveryScene() {
  const t = useT(story);
  return (
    <Scene id="recovery" eyebrow={t('recEyebrow')} title={t('recTitle')} lead={t('recLead')}>
      <SimBox name="recover" />
      <p className="text-ink-muted text-small">{t('recNote')}</p>
    </Scene>
  );
}
```

Thay `apps/web/src/app/page.tsx` (Task 7 thay tiếp bằng câu chuyện đủ sáu cảnh):

```tsx
import { HomeHero } from '@/home/hero';
import { HowItWorks } from '@/home/how-it-works';
import { RecoveryScene } from '@/home/recovery-scene';
import { WeaveArt } from '@/home/weave-svg';
import '@/home/home.css';

export default function HomePage() {
  return (
    <>
      <HomeHero art={<WeaveArt />} />
      <HowItWorks />
      <RecoveryScene />
    </>
  );
}
```

Run: `npm test -w apps/web`
Expected: PASS (gồm test i18n của 7A: `story.messages.ts` có đủ khoá VI và cùng placeholder).

- [ ] **Step 7: E2E mô phỏng**

Thêm vào cuối `apps/web/test/e2e/home.spec.ts`:

```ts
test('the inheritance story runs on the SDK: confirmation, release, and the fallback without one', async ({
  page,
  state,
}) => {
  await page.goto(state.siteUrl);
  const sim = page.getByTestId('sim-inherit');
  await sim.scrollIntoViewIfNeeded();
  await page.mouse.move(100, 100);
  await expect(sim).toHaveAttribute('data-ready', 'true');
  const slider = page.getByTestId('sim-inherit-day');
  await slider.fill('200');
  await expect(sim).toHaveAttribute('data-state', 'releasedInherit');
  await page.getByLabel('A guardian confirms on day 183').uncheck();
  await expect(sim).toHaveAttribute('data-state', 'grace');
  await slider.focus();
  await page.keyboard.press('End');
  await expect(sim).toHaveAttribute('data-state', 'releasedInherit');
  await expect(sim.getByText(/^Day 450:/)).toBeVisible();
});

test('one check-in from the old wallet stops a recovery', async ({ page, state }) => {
  await page.goto(state.siteUrl);
  const sim = page.getByTestId('sim-recover');
  await sim.scrollIntoViewIfNeeded();
  await page.mouse.move(100, 100);
  await expect(sim).toHaveAttribute('data-ready', 'true');
  await page.getByTestId('sim-recover-day').fill('40');
  await expect(sim).toHaveAttribute('data-state', 'releasedRecover');
  await page.getByLabel('The owner checks in on day 20').check();
  await expect(sim).toHaveAttribute('data-state', 'active');
  await expectAccessibleInBothThemes(page);
});
```

và thêm `import { expectAccessibleInBothThemes } from './helpers';` ở đầu file.

Run: `npm run e2e -w apps/web -- home`
Expected: PASS (3 test × 2 project).

- [ ] **Step 8: Ngân sách, màn hình**

```bash
npm run build -w apps/web
npm run size -w apps/web
npm run lighthouse -w apps/web
```

Expected: `size` PASS (`/` ≤ 170 kB: SDK và circuits nằm trong chunk `impl/sim`, nạp sau thao tác đầu); `lighthouse: PASS` cho `/`.

```powershell
$env:SCREENS='home'; npm run e2e -w apps/web -- screens --project=desktop; Remove-Item Env:SCREENS
```

Kiểm cảnh 2 và 3 ở mọi ảnh: thanh trượt, công tắc và danh sách bước không chồng nhau ở 390 px; bước sau ngày đang chọn màu `ink-muted` vẫn đọc được ở theme sáng; câu tiếng Việt dài xuống dòng gọn. Liệt kê đường dẫn ảnh trong báo cáo task.

- [ ] **Step 9: Kiểm toàn bộ và commit**

```bash
npm run typecheck
npx biome check --write apps/web/src/home apps/web/src/messages/story.messages.ts apps/web/src/app/page.tsx apps/web/test/unit/sim.test.ts apps/web/test/e2e/home.spec.ts
npx biome ci .
git add apps/web/src/home/sim-days.ts apps/web/src/home/impl/sim.ts apps/web/src/home/sim-box.tsx apps/web/src/home/scene.tsx apps/web/src/home/how-it-works.tsx apps/web/src/home/recovery-scene.tsx apps/web/src/messages/story.messages.ts apps/web/src/app/page.tsx apps/web/test/unit/sim.test.ts apps/web/test/e2e/home.spec.ts
git commit -m "feat(web): the home page's inheritance and recovery stories, simulated by the SDK" -m "A day slider and toggles over applyAction, deriveInputs and computeTimeline on the repository's policy netlist; the prerendered steps are pinned to what the SDK computes." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Trang chủ đủ sáu cảnh: proof thu nhỏ, cảnh agent, số liệu chain, cột sống cuộn

Ghép ba cảnh cuối của §5.1 vào câu chuyện: cảnh 4 chạy một phần thật của proof (2^17 block, 4 194 304 trường hợp, bản đồ 256 × 256) trong worker khi bấm; cảnh 5 là bản ghi một phiên agent (minh hoạ, tên công cụ thật) hiện dần khi cuộn tới; cảnh 6 là số liệu chain, đếm lại được ngay trên trang. Tiêu đề cảnh trôi vào và cột sống bên trái tô dần theo cuộn, chỉ bằng `transform` (Quyết định 16).

**Files:**
- Create: `apps/web/src/home/mini-proof.tsx`, `apps/web/src/home/trust-scene.tsx`, `apps/web/src/home/agent-lines.ts`, `apps/web/src/home/agent-scene.tsx`, `apps/web/src/home/stats-scene.tsx`, `apps/web/src/home/story.tsx`, `apps/web/src/app/e2e/mini-proof/page.e2e.tsx`
- Modify: `apps/web/src/home/home.css` (thêm cuối file), `apps/web/src/app/page.tsx`, `apps/web/test/e2e/helpers.ts` (`settle`)
- Test: `apps/web/test/unit/agent-lines.test.ts`, `apps/web/test/build/home.test.ts` (thêm một test), `apps/web/test/e2e/home.spec.ts` (thêm bốn test)

**Interfaces:**
- Consumes (7A): `useSdk` (`@/chain/hooks`), `useStats` và `StatsState` (`@/chain/use-stats`), `ENV`, `explorerUrlOf`, `explorerAddress`, `explorerName` (`@/lib/links`), `useMounted`, `usePrefersReducedMotion` (`@/motion/provider`), `ErrorBox` (`@/tx/error-box`), `Button`, `buttonClass`, `CopyButton`, `ExternalLink`, `ROUTES`, `cn`, `settle` (sửa). (Task 2): `ProofCanvas`, `TOTAL_CASES`. (Task 3): `useProofRun`, `ProofRun`, `IDLE_RUN`, `useStagger`, `formatCount`, `COMMANDS`, `sourceBundle` (`src/app/e2e/proof/bundle.ts`). (Task 4): `WeaveArt`, `HomeHero`. (Task 5): `useFirstInteraction`, `useInView`. (Task 6): `Scene`, `HowItWorks`, `RecoveryScene`, `INHERIT_DAYS`, `messages` của `story.messages.ts` (khoá `trust*`, `mini*`, `agent*`, `stats*`, `copyCommand`).
- Produces:
  - `src/home/mini-proof.tsx`: `MINI_BLOCKS = 2 ** 17`; `MINI_COMBO_BITS = 22`; `interface MiniProofViewProps { run: ProofRun; onRun(): void }`; `MiniProofView(p)`. Test id: `mini-proof` (canvas), `mini-proof-panel` (`data-status`), `mini-proof-run`, `mini-proof-verdict` (`data-ok`).
  - `src/home/trust-scene.tsx`: `TrustScene()`.
  - `src/home/agent-lines.ts`: `AGENT_TOOLS`; `type AgentTool`; `type AgentLineKey`; `type AgentLine = { who: 'you' | 'agent'; key: AgentLineKey } | { who: 'tool'; tool: AgentTool }`; `AGENT_LINES: readonly AgentLine[]` (8 dòng).
  - `src/home/agent-scene.tsx`: `AgentScene()`; `data-testid="agent-transcript"` với `data-shown`.
  - `src/home/stats-scene.tsx`: `interface StatsFeed`; `NO_FEED`; `StatsScene()`. Test id: `stats-vaults`, `stats-drills`, `stats-checkIns` (`data-value`, rỗng khi chưa có số), `stats-count`.
  - `src/home/story.tsx`: `HomeStory({ art }: { art?: ReactNode })` (server component, không hook).

- [ ] **Step 1: Test bản ghi agent khớp với MCP server và mô phỏng**

`apps/web/test/unit/agent-lines.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AGENT_LINES, AGENT_TOOLS } from '../../src/home/agent-lines';
import { INHERIT_DAYS } from '../../src/home/sim-days';
import { messages as story } from '../../src/messages/story.messages';

const tools = readFileSync(new URL('../../../../packages/mcp/src/tools.ts', import.meta.url), 'utf8');

describe('the agent scene', () => {
  it('names only tools the MCP server has, and the days the simulation computes', () => {
    for (const tool of AGENT_TOOLS) expect(tools).toContain(`name: '${tool}'`);
    expect(AGENT_LINES.filter((l) => l.who === 'tool').map((l) => l.tool)).toEqual([...AGENT_TOOLS]);
    for (const lang of ['en', 'vi'] as const) {
      expect(story[lang].agentLine3).toContain(String(INHERIT_DAYS.alarm));
      expect(story[lang].agentLine3).toContain(String(INHERIT_DAYS.release));
    }
  });
});
```

Run: `npm test -w apps/web -- agent-lines`
Expected: FAIL, không tìm thấy `../../src/home/agent-lines`.

- [ ] **Step 2: `agent-lines.ts`**

```ts
/** The three MCP tools of the illustrated session, in the order an agent calls them (agent-lines.test.ts checks them). */
export const AGENT_TOOLS = ['atropyle_check_plan', 'atropyle_simulate', 'atropyle_prepare_create_vault'] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];
export type AgentLineKey = 'agentLine1' | 'agentLine2' | 'agentLine3' | 'agentLine4' | 'agentLine5';
export type AgentLine = { who: 'you' | 'agent'; key: AgentLineKey } | { who: 'tool'; tool: AgentTool };

export const AGENT_LINES: readonly AgentLine[] = [
  { who: 'you', key: 'agentLine1' },
  { who: 'tool', tool: 'atropyle_check_plan' },
  { who: 'agent', key: 'agentLine2' },
  { who: 'tool', tool: 'atropyle_simulate' },
  { who: 'agent', key: 'agentLine3' },
  { who: 'tool', tool: 'atropyle_prepare_create_vault' },
  { who: 'agent', key: 'agentLine4' },
  { who: 'agent', key: 'agentLine5' },
];
```

Run: `npm test -w apps/web -- agent-lines`
Expected: PASS (1 test).

- [ ] **Step 3: Proof thu nhỏ (cảnh 4)**

`apps/web/src/home/mini-proof.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useLang, useT } from '@/i18n/provider';
import { formatCount } from '@/lib/count';
import { messages as story } from '@/messages/story.messages';
import { TOTAL_CASES } from '@/proof/paint';
import { ProofCanvas } from '@/proof/proof-canvas';
import type { ProofRun } from '@/proof/use-proof-run';
import { ROUTES } from '@/routes';
import { ErrorBox } from '@/tx/error-box';
import { Button, buttonClass } from '@/ui/button';

/** 2^17 blocks = 2^22 cases: about one sixteenth of the proof, a second or two on a phone. */
export const MINI_BLOCKS = 2 ** 17;
/** log2(MINI_BLOCKS) + 5: a 256 × 256 map (Quyết định 4). */
export const MINI_COMBO_BITS = 22;

export interface MiniProofViewProps {
  run: ProofRun;
  onRun(): void;
}

export function MiniProofView({ run, onRun }: MiniProofViewProps) {
  const t = useT(story);
  const { lang } = useLang();
  const busy = run.status === 'loading' || run.status === 'running';
  const cases = MINI_BLOCKS * 32;
  return (
    <div className="grid items-start gap-8 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <ProofCanvas
        comboBits={MINI_COMBO_BITS}
        doneBlocks={run.doneBlocks}
        label={t('miniLabel', { done: formatCount(run.doneBlocks * 32, lang), total: formatCount(cases, lang) })}
        testId="mini-proof"
        className="aspect-square w-full max-w-80 rounded-2xl border border-line bg-surface-2"
      />
      <div data-testid="mini-proof-panel" data-status={run.status} className="flex flex-col gap-4">
        <p className="text-pretty text-ink-muted">
          {t('trustScope', { done: formatCount(cases, lang), total: formatCount(TOTAL_CASES, lang) })}
        </p>
        <div aria-live="polite" className="min-h-12">
          {busy ? <p className="text-ink-muted">{t('trustRunning')}</p> : null}
          {run.status === 'done' && run.result ? (
            <p
              data-testid="mini-proof-verdict"
              data-ok={String(run.result.ok)}
              className={run.result.ok ? 'font-medium text-alive' : 'font-medium text-danger'}
            >
              {run.result.ok ? t('trustOk', { combos: formatCount(run.result.combos, lang) }) : t('trustBroken')}
            </p>
          ) : null}
        </div>
        {run.status === 'error' ? <ErrorBox error={run.error} onRetry={onRun} /> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button data-testid="mini-proof-run" loading={busy} disabled={busy} onClick={onRun}>
            {run.runs === 0 ? t('trustRun') : t('trustAgain')}
          </Button>
          <Link href={ROUTES.proof} className={buttonClass({ variant: 'ghost' })}>
            {t('trustFull')}
          </Link>
        </div>
      </div>
    </div>
  );
}
```

`apps/web/src/home/trust-scene.tsx`:

```tsx
'use client';

import { useT } from '@/i18n/provider';
import { messages as story } from '@/messages/story.messages';
import { useProofRun } from '@/proof/use-proof-run';
import { MINI_BLOCKS, MiniProofView } from './mini-proof';
import { Scene } from './scene';

/** Every run is a fresh run of MINI_BLOCKS on this machine (useProofRun with blocks). Nothing runs before the tap (Quyết định 2). */
export function TrustScene() {
  const t = useT(story);
  const { run, again } = useProofRun(MINI_BLOCKS);
  return (
    <Scene id="trust" eyebrow={t('trustEyebrow')} title={t('trustTitle')} lead={t('trustLead')}>
      <MiniProofView run={run} onRun={again} />
    </Scene>
  );
}
```

Trang e2e (chỉ build e2e) để thấy proof thu nhỏ chạy hết trong worker thật, vì devnet không có circuit policy (`POLICY_UNAVAILABLE`). `apps/web/src/app/e2e/mini-proof/page.e2e.tsx`:

```tsx
'use client';

import { useCallback, useRef, useState } from 'react';
import { MINI_BLOCKS, MiniProofView } from '@/home/mini-proof';
import { IDLE_RUN, type ProofRun } from '@/proof/use-proof-run';
import { sourceBundle } from '../proof/bundle';

/** Only in builds with ATROPYLE_E2E=1: the home page's quick proof over the bundle built from source. */
export default function MiniProofE2EPage() {
  const [run, setRun] = useState<ProofRun>({ ...IDLE_RUN, totalBlocks: MINI_BLOCKS });
  const seq = useRef(0);
  const start = useCallback(() => {
    seq.current += 1;
    const id = seq.current;
    setRun((r) => ({ ...IDLE_RUN, status: 'running', totalBlocks: MINI_BLOCKS, runs: r.runs + 1 }));
    void (async () => {
      const { evaluateInWorker } = await import('../../../verify/impl/verify-client');
      try {
        const result = await evaluateInWorker(sourceBundle(), {
          blocks: MINI_BLOCKS,
          onProgress: (done) => {
            if (seq.current === id) setRun((r) => ({ ...r, doneBlocks: done }));
          },
        });
        if (seq.current === id) setRun((r) => ({ ...r, status: 'done', doneBlocks: MINI_BLOCKS, result }));
      } catch (error) {
        if (seq.current === id) setRun((r) => ({ ...r, status: 'error', error }));
      }
    })();
  }, []);
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-16">
      <h1 className="mb-8 font-display text-h2">Quick proof (e2e)</h1>
      <MiniProofView run={run} onRun={start} />
    </section>
  );
}
```

- [ ] **Step 4: Cảnh agent (cảnh 5)**

`apps/web/src/home/agent-scene.tsx`:

```tsx
'use client';

import { useRef } from 'react';
import { COMMANDS } from '@/content/commands';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { useInView } from '@/lib/use-in-view';
import { useMounted } from '@/lib/use-mounted';
import { messages as story } from '@/messages/story.messages';
import { usePrefersReducedMotion } from '@/motion/provider';
import { useStagger } from '@/proof/use-stagger';
import { CopyButton } from '@/ui/copy-button';
import { AGENT_LINES, type AgentLine } from './agent-lines';
import { Scene } from './scene';

const STEP_MS = 650;

function LineText({ line }: { line: AgentLine }) {
  const t = useT(story);
  return line.who === 'tool' ? <code className="font-mono text-small">{line.tool}</code> : <>{t(line.key)}</>;
}

const INSTALL = [
  { id: 'plugin', label: 'agentPlugin', cmd: COMMANDS.plugin },
  { id: 'mcp', label: 'agentMcp', cmd: COMMANDS.mcp },
  { id: 'skills', label: 'agentSkills', cmd: COMMANDS.skills },
] as const;

/**
 * The visual transcript appears line by line once on screen; screen readers get the whole transcript at once from a
 * visually hidden copy, so nothing depends on scrolling. Lines are hidden with `visibility`, never a partial opacity.
 */
export function AgentScene() {
  const t = useT(story);
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, rootMargin: '0px 0px -20% 0px' });
  const reduced = usePrefersReducedMotion();
  const mounted = useMounted();
  const lit = useStagger(AGENT_LINES.length, inView, reduced, STEP_MS);
  const shown = !mounted || reduced ? AGENT_LINES.length : lit;
  const who = { you: t('agentYou'), agent: t('agentAgent'), tool: t('agentTool') };
  return (
    <Scene id="agent" eyebrow={t('agentEyebrow')} title={t('agentTitle')} lead={t('agentLead')}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <figure ref={ref} className="flex flex-col gap-4 rounded-3xl border border-line bg-surface-1 p-5 md:p-8">
          <ol className="sr-only">
            {AGENT_LINES.map((l, i) => (
              <li key={`sr-${i}-${l.who}`}>
                {who[l.who]}: <LineText line={l} />
              </li>
            ))}
          </ol>
          <ol aria-hidden="true" data-testid="agent-transcript" data-shown={shown} className="flex min-h-96 flex-col gap-3">
            {AGENT_LINES.map((l, i) => (
              <li
                key={`v-${i}-${l.who}`}
                className={cn(
                  'flex max-w-[85%] flex-col gap-1 rounded-2xl px-4 py-3 motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out-expo',
                  i < shown ? 'visible translate-y-0' : 'invisible translate-y-2',
                  l.who === 'you' && 'self-end bg-surface-3',
                  l.who === 'agent' && 'self-start bg-surface-2',
                  l.who === 'tool' && 'self-start border border-line-strong border-dashed',
                )}
              >
                <span className="text-caption text-ink-muted">{who[l.who]}</span>
                <span className="text-pretty">
                  <LineText line={l} />
                </span>
              </li>
            ))}
          </ol>
          <figcaption className="text-caption text-ink-muted">{t('agentCaption')}</figcaption>
        </figure>
        <div className="flex flex-col gap-4">
          <h3 className="font-display text-title">{t('agentInstall')}</h3>
          {INSTALL.map((x) => (
            <div key={x.id} className="flex flex-col gap-2">
              <p className="text-ink-muted text-small">{t(x.label)}</p>
              <div className="flex items-start gap-2 rounded-2xl border border-line bg-surface-1 p-3">
                <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-small">{x.cmd}</pre>
                <CopyButton text={x.cmd} label={t('copyCommand')} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Scene>
  );
}
```

- [ ] **Step 5: Số liệu chain (cảnh 6)**

Nút đếm luôn là cùng một phần tử DOM (không bị thay khi phần đọc chain mount), nên cú chạm đầu tiên lên nó không bị mất; phần đọc chain (`LiveStats`) không vẽ gì, chỉ báo số lên trên. Bấm nút trước khi có thao tác nào khác (trình đọc màn hình gửi `click` mà không có `pointerdown`) cũng mount nó.

`apps/web/src/home/stats-scene.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSdk } from '@/chain/hooks';
import { useStats } from '@/chain/use-stats';
import { ENV, explorerUrlOf } from '@/config/env';
import { useLang, useT } from '@/i18n/provider';
import { formatCount } from '@/lib/count';
import { explorerAddress, explorerName } from '@/lib/links';
import { useFirstInteraction } from '@/lib/use-first-interaction';
import { messages as story } from '@/messages/story.messages';
import { ErrorBox } from '@/tx/error-box';
import { Button } from '@/ui/button';
import { ExternalLink } from '@/ui/external-link';
import { Scene } from './scene';

/** What the chain side reports, as primitives so that an unchanged report changes nothing. */
export interface StatsFeed {
  source: 'api' | 'chain' | null;
  block: string | null;
  vaults: number | null;
  drills: number | null;
  checkIns: number | null;
  done: number | null;
  total: number | null;
  busy: boolean;
  error: unknown;
  factory: string | null;
}

export const NO_FEED: StatsFeed = {
  source: null,
  block: null,
  vaults: null,
  drills: null,
  checkIns: null,
  done: null,
  total: null,
  busy: false,
  error: null,
  factory: null,
};

const same = (a: StatsFeed, b: StatsFeed) => (Object.keys(a) as (keyof StatsFeed)[]).every((k) => Object.is(a[k], b[k]));

/** Loads the chain chunk (and, on the vercel build, asks the backend). Each new `want` counts once, when the SDK is ready. */
function LiveStats({ want, onFeed }: { want: number; onFeed(f: StatsFeed): void }) {
  const stats = useStats();
  const sdk = useSdk().data;
  const fired = useRef(0);
  useEffect(() => {
    if (!sdk || want <= fired.current) return;
    fired.current = want;
    if (!stats.busy) stats.refresh();
  });
  const s = stats.summary;
  useEffect(() => {
    onFeed({
      source: s?.source ?? null,
      block: s ? s.block.toString() : null,
      vaults: s?.vaults ?? null,
      drills: s?.drills ?? null,
      checkIns: s?.checkIns ?? null,
      done: stats.progress?.done ?? null,
      total: stats.progress?.total ?? null,
      busy: stats.busy,
      error: stats.error ?? null,
      factory: sdk?.deployment.factory ?? null,
    });
  });
  return null;
}

export function StatsScene() {
  const t = useT(story);
  const { lang } = useLang();
  const interacted = useFirstInteraction();
  const [want, setWant] = useState(0);
  const [feed, setFeed] = useState<StatsFeed>(NO_FEED);
  const onFeed = useCallback((f: StatsFeed) => setFeed((prev) => (same(prev, f) ? prev : f)), []);
  const count = useCallback(() => setWant((w) => w + 1), []);
  const explorer = explorerUrlOf(ENV);
  const tiles = [
    { id: 'vaults', label: t('statsVaults'), value: feed.vaults },
    { id: 'drills', label: t('statsDrills'), value: feed.drills },
    { id: 'checkIns', label: t('statsCheckIns'), value: feed.checkIns },
  ] as const;
  return (
    <Scene id="stats" eyebrow={t('statsEyebrow')} title={t('statsTitle')} lead={t('statsLead')}>
      {interacted || want > 0 ? <LiveStats want={want} onFeed={onFeed} /> : null}
      <dl className="grid gap-4 sm:grid-cols-3">
        {tiles.map((x) => (
          <div
            key={x.id}
            data-testid={`stats-${x.id}`}
            data-value={x.value ?? ''}
            className="flex flex-col gap-1 rounded-2xl border border-line bg-surface-1 p-5"
          >
            <dt className="text-ink-muted text-small">{x.label}</dt>
            <dd className="font-display text-h2 tabular-nums">{x.value === null ? '—' : formatCount(x.value, lang)}</dd>
          </div>
        ))}
      </dl>
      <div aria-live="polite" className="flex min-h-16 flex-col gap-1 text-small">
        {feed.block === null ? (
          <p className="text-ink-muted">{t('statsEmpty')}</p>
        ) : (
          <p className="text-ink-muted">
            {t('statsAtBlock', { block: formatCount(BigInt(feed.block), lang) })} ·{' '}
            {t(feed.source === 'api' ? 'statsSourceApi' : 'statsSourceChain')}
          </p>
        )}
        {feed.busy && feed.done !== null && feed.total !== null ? (
          <p>{t('statsCounting', { done: formatCount(feed.done, lang), total: formatCount(feed.total, lang) })}</p>
        ) : null}
      </div>
      {feed.error ? <ErrorBox error={feed.error} onRetry={count} testId="stats-error" /> : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="secondary" data-testid="stats-count" loading={feed.busy} onClick={count}>
          {t('statsCount')}
        </Button>
        {explorer && feed.factory ? (
          <ExternalLink href={explorerAddress(explorer, feed.factory)}>
            {t('statsFactory', { explorer: explorerName(explorer) })}
          </ExternalLink>
        ) : null}
      </div>
    </Scene>
  );
}
```

- [ ] **Step 6: Câu chuyện đủ sáu cảnh và chuyển động theo cuộn**

`apps/web/src/home/story.tsx` (không `'use client'`: server component, `art` đi thẳng từ `app/page.tsx`):

```tsx
import type { ReactNode } from 'react';
import { AgentScene } from './agent-scene';
import { HomeHero } from './hero';
import { HowItWorks } from './how-it-works';
import { RecoveryScene } from './recovery-scene';
import { StatsScene } from './stats-scene';
import { TrustScene } from './trust-scene';

/** Spec §5.1: the hero, then five scenes along a spine that fills as the reader scrolls (home.css). */
export function HomeStory({ art }: { art?: ReactNode }) {
  return (
    <>
      <HomeHero art={art} />
      <div className="story relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-2 hidden w-px bg-line md:block xl:left-[calc(50%-37rem)]"
        >
          <div className="story-spine-fill h-full w-full origin-top bg-thread" />
        </div>
        <HowItWorks />
        <RecoveryScene />
        <TrustScene />
        <AgentScene />
        <StatsScene />
      </div>
    </>
  );
}
```

Thay `apps/web/src/app/page.tsx`:

```tsx
import { HomeStory } from '@/home/story';
import { WeaveArt } from '@/home/weave-svg';
import '@/home/home.css';

export default function HomePage() {
  return <HomeStory art={<WeaveArt />} />;
}
```

Thêm vào cuối `apps/web/src/home/home.css`:

```css
/* Scroll-driven scene motion (Task 7): transform only, never opacity, so axe never measures half-faded text. */
@keyframes scene-rise {
  from {
    transform: translateY(2rem);
  }
  to {
    transform: none;
  }
}

@keyframes spine-fill {
  from {
    transform: scaleY(0);
  }
  to {
    transform: scaleY(1);
  }
}

@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .scene-head {
      animation: scene-rise linear both;
      animation-timeline: view();
      animation-range: entry 0% entry 60%;
    }

    .story {
      view-timeline-name: --story;
    }

    .story-spine-fill {
      animation: spine-fill linear both;
      animation-timeline: --story;
      animation-range: contain 0% contain 100%;
    }
  }
}
```

Không có `animation-timeline` (Firefox, Safari cũ) thì tiêu đề đứng yên và cột sống tô đầy sẵn: chữ luôn đọc được.

- [ ] **Step 7: `settle()` bỏ qua animation theo cuộn**

Trong `apps/web/test/e2e/helpers.ts`, thay thân `settle` (Quyết định 16):

```ts
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every(
          (a) =>
            a.playState !== 'running' ||
            a.timeline !== document.timeline ||
            a.effect?.getComputedTiming().endTime === Number.POSITIVE_INFINITY,
        ),
    undefined,
    { timeout: 10_000 },
  );
}
```

Animation theo cuộn chỉ chạy khi cuộn, nên với `settle()` nó luôn "xong".

- [ ] **Step 8: Test build và e2e**

Thêm vào trong `describe` của `apps/web/test/build/home.test.ts`, sau test đang có:

```ts
    it('prerenders all six scenes, the simulated days and the real tool names', () => {
      const h = html();
      for (const title of [
        'A promise you keep by checking in',
        'Lost your keys, not your life',
        'Rules nobody can change, not even us',
        'Plan in plain words. Sign in your own wallet.',
        'Live from the chain',
      ]) {
        expect(h).toContain(title);
      }
      expect(h).toContain('Day 194:');
      expect(h).toContain('atropyle_prepare_create_vault');
    });
```

Thêm vào cuối `apps/web/test/e2e/home.spec.ts`:

```ts
test('the quick proof runs only on a tap, and says why on a chain without the policy circuit', async ({
  page,
  state,
}) => {
  await page.goto(state.siteUrl);
  const panel = page.getByTestId('mini-proof-panel');
  await panel.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('mini-proof')).toHaveAttribute('data-size', '256');
  await expect(panel).toHaveAttribute('data-status', 'idle');
  await page.getByTestId('mini-proof-run').click();
  await expect(page.getByTestId('error')).toHaveAttribute('data-code', 'POLICY_UNAVAILABLE');
  await expectAccessibleInBothThemes(page);
});

test('the quick proof paints its whole map in the real worker', async ({ page, state }) => {
  await page.goto(new URL('e2e/mini-proof/', state.siteUrl).href);
  await page.getByTestId('mini-proof-run').click();
  await expect(page.getByTestId('mini-proof-verdict')).toHaveAttribute('data-ok', 'true', { timeout: 60_000 });
  await expect(page.getByTestId('mini-proof')).toHaveAttribute('data-done', String(2 ** 17));
  await expect(page.getByText('All eight rules held in 4,194,304 cases.')).toBeVisible();
});

test('the agent transcript appears as it scrolls into view', async ({ page, state }) => {
  await page.goto(state.siteUrl);
  const transcript = page.getByTestId('agent-transcript');
  await expect(transcript).toHaveAttribute('data-shown', '0');
  await transcript.scrollIntoViewIfNeeded();
  await expect(transcript).toHaveAttribute('data-shown', '8');
  await expect(transcript.getByText('atropyle_prepare_create_vault')).toBeVisible();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(transcript).toHaveAttribute('data-shown', '8');
});

test('the live numbers are counted from the chain on request', async ({ page, state }) => {
  await page.goto(state.siteUrl);
  const vaults = page.getByTestId('stats-vaults');
  await expect(vaults).toHaveAttribute('data-value', '');
  await page.getByTestId('stats-count').scrollIntoViewIfNeeded();
  await page.getByTestId('stats-count').click();
  await expect(vaults).not.toHaveAttribute('data-value', '', { timeout: 60_000 });
  expect(Number(await vaults.getAttribute('data-value'))).toBeGreaterThanOrEqual(3);
  expect(Number(await page.getByTestId('stats-drills').getAttribute('data-value'))).toBeGreaterThanOrEqual(3);
  await expectAccessibleInBothThemes(page);
});
```

Ba vault seed (`simple`, `guarded`, `grace`) đều là Drill, nên cả hai số ít nhất là 3; e2e khác có thể tạo thêm.

Run:

```bash
npm test -w apps/web
npm run build -w apps/web
npm run test:build -w apps/web
npm run e2e -w apps/web -- home
```

Expected: PASS. `test:build` thêm 2 test (vercel và deweb). E2E `home` 7 test × 2 project; test `reduced motion leaves no running animation` của 7A vẫn xanh (mọi animation mới nằm trong `no-preference`).

- [ ] **Step 9: Ngân sách, Lighthouse, màn hình**

```bash
npm run size -w apps/web
npm run lighthouse -w apps/web
```

Expected: `size` PASS, `/` ≤ 170 kB gzip. Nếu vượt, xem `.size/` để biết chunk nào: SDK, viem, circuits và ogl chỉ được nằm trong chunk nạp động (`impl/sim`, `impl/weave-gl`, chunk chain, chunk verify). Lighthouse `/`: Performance ≥ 0,95, CLS 0 (khu số liệu có chiều cao tối thiểu, bản ghi agent ẩn bằng `visibility` nên không đổi bố cục).

```powershell
$env:SCREENS='home'; npm run e2e -w apps/web -- screens --project=desktop; Remove-Item Env:SCREENS
$env:SCREENS='e2e/mini-proof/'; $env:SCREENS_CLICK='mini-proof-run'; $env:SCREENS_WAIT='mini-proof-verdict'; npm run e2e -w apps/web -- screens --project=desktop; Remove-Item Env:SCREENS, Env:SCREENS_CLICK, Env:SCREENS_WAIT
```

Ảnh `home-*` là cả trang (`fullPage`), nên thấy đủ sáu cảnh. Kiểm: cột sống không đè chữ ở 768 px; bản ghi agent ở 390 px không tràn ngang (lệnh dài cuộn ngang trong khung `pre`, không phải cả trang); bản đồ thu nhỏ vuông và nét ở cả hai theme; ô số liệu không nhảy cỡ khi có số. Liệt kê đường dẫn ảnh trong báo cáo task.

- [ ] **Step 10: Kiểm toàn bộ và commit**

```bash
npm run typecheck
npx biome check --write apps/web/src/home apps/web/src/app/page.tsx apps/web/src/app/e2e/mini-proof apps/web/test/unit/agent-lines.test.ts apps/web/test/build/home.test.ts apps/web/test/e2e/home.spec.ts apps/web/test/e2e/helpers.ts
npx biome ci .
git add apps/web/src/home/mini-proof.tsx apps/web/src/home/trust-scene.tsx apps/web/src/home/agent-lines.ts apps/web/src/home/agent-scene.tsx apps/web/src/home/stats-scene.tsx apps/web/src/home/story.tsx apps/web/src/home/home.css apps/web/src/app/page.tsx apps/web/src/app/e2e/mini-proof/page.e2e.tsx apps/web/test/unit/agent-lines.test.ts apps/web/test/build/home.test.ts apps/web/test/e2e/home.spec.ts apps/web/test/e2e/helpers.ts
git commit -m "feat(web): the home page's last three scenes: quick proof, agent session and live numbers" -m "The quick proof runs 2^17 blocks in the worker on a tap, the agent transcript names the real MCP tools, the numbers count from the chain on request. Scene headings and the story spine move with scroll, by transform only." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `/me/`, mọi vault của ví đang kết nối

Spec §5.6: ba nhóm (vault bạn sở hữu, vault bạn giám hộ, vault bạn có thể nhận). Chain đọc bằng `useVaultsOf` (Quyết định 10). Bản vercel có thêm danh sách của backend (`useMe`) để hiện nhanh, nhưng một dòng của backend chỉ hiện khi chain xác nhận vault đó do factory tạo và ví có đúng vai trò; trạng thái luôn lấy từ chain.

**Files:**
- Create: `apps/web/src/app/me/merge.ts`, `apps/web/src/app/me/me-page.tsx`, `apps/web/src/app/me/page.tsx`, `apps/web/src/messages/me.messages.ts`
- Test: `apps/web/test/unit/me-merge.test.ts`, `apps/web/test/e2e/me.spec.ts`

**Interfaces:**
- Consumes (7A): `useWallet` (`@/wallet/provider`), `useVaultRoles` (`@/wallet/use-vault-roles`), `useVault`, `useVaultsOf` (`@/chain/hooks`), `useMe` (`@/api/hooks`), `MeVault` (`@/api/types`), `IS_VERCEL`, `threadStateOf`, `ThreadState` (`@/thread/state`), `StateBadge`, `ErrorBox`, `Address`, `Button`, `buttonClass`, `EmptyState`, `Skeleton`, `createHref`, `vaultHref`, `useT`, `defineMessages`. SDK (chỉ kiểu): `Role`, `StateName`, `VaultRef`. E2E: `wallet`, `connectWallet`, `expectAccessibleInBothThemes`, `ANVIL`, `state.seeded`.
- Produces:
  - `src/app/me/merge.ts`: `type MeRole = Role` (SDK: `'owner' | 'heir' | 'guardian' | 'recoveryTarget'`); `interface MeRow { vault: Address; roles: readonly MeRole[]; drill: boolean | null; state: StateName | null; source: 'chain' | 'index' }`; `mergeMe(chain, index): MeRow[]`; `type Section = 'own' | 'guard' | 'inherit'`; `SECTIONS: readonly Section[]`; `SECTION_ROLES: Record<Section, readonly MeRole[]>`; `sectionsOf(rows): Record<Section, MeRow[]>`; `type RowVerdict = 'pending' | 'show' | 'hide'`; `indexRowVerdict(section, read, failed): RowVerdict`.
  - Trang: `data-testid="me-section-own|guard|inherit"`; mỗi dòng `data-testid="me-row"` với `data-vault`, `data-state`, `data-source`.

- [ ] **Step 1: Test gộp danh sách**

`apps/web/test/unit/me-merge.test.ts`:

```ts
import type { VaultRef } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { indexRowVerdict, mergeMe, sectionsOf } from '../../src/app/me/merge';
import type { MeVault } from '../../src/api/types';

const V1 = '0x1111111111111111111111111111111111111111';
const V2 = '0x2222222222222222222222222222222222222222';
const LOW = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const HIGH = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const OWNER = '0x9999999999999999999999999999999999999999';

const ref = (vault: `0x${string}`, roles: VaultRef['roles'], state: VaultRef['state']): VaultRef => ({
  vault,
  owner: OWNER,
  drill: true,
  state,
  roles,
});
const listed = (vault: `0x${string}`, roles: MeVault['roles']): MeVault => ({
  vault,
  roles,
  drill: false,
  state: 'releasedInherit',
  released: true,
});

describe('/me/ lists', () => {
  it('put the chain first, add each vault only the index knows once, and never take a state from the index', () => {
    const rows = mergeMe(
      [ref(V1, ['owner'], 'grace')],
      [listed(V1, ['guardian']), listed(LOW, ['heir']), listed(HIGH, ['heir'])],
    );
    expect(rows).toEqual([
      { vault: V1, roles: ['owner'], drill: true, state: 'grace', source: 'chain' },
      { vault: LOW, roles: ['heir'], drill: null, state: null, source: 'index' },
    ]);
    expect(mergeMe(undefined, undefined)).toEqual([]);
  });

  it('show a guardian who is also an heir in both lists, and a recovery target with the heirs', () => {
    const both = ref(V1, ['guardian', 'heir'], 'active');
    const target = ref(V2, ['recoveryTarget'], 'recovery');
    const s = sectionsOf(mergeMe([both, target], undefined));
    expect(s.own).toEqual([]);
    expect(s.guard.map((r) => r.vault)).toEqual([V1]);
    expect(s.inherit.map((r) => r.vault)).toEqual([V1, V2]);
  });

  it('show an index row only once the chain confirms the vault and the role', () => {
    expect(indexRowVerdict('guard', null, false)).toBe('pending');
    expect(indexRowVerdict('guard', null, true)).toBe('hide');
    expect(indexRowVerdict('guard', { registered: false, roles: ['guardian'] }, false)).toBe('hide');
    expect(indexRowVerdict('guard', { registered: true, roles: ['heir'] }, false)).toBe('hide');
    expect(indexRowVerdict('guard', { registered: true, roles: ['guardian', 'heir'] }, false)).toBe('show');
    expect(indexRowVerdict('inherit', { registered: true, roles: ['recoveryTarget'] }, false)).toBe('show');
  });
});
```

Run: `npm test -w apps/web -- me-merge`
Expected: FAIL, không tìm thấy `../../src/app/me/merge`.

- [ ] **Step 2: `merge.ts`**

```ts
import type { Role, StateName, VaultRef } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { MeVault } from '@/api/types';

export type MeRole = Role;

export interface MeRow {
  vault: Address;
  /** The chain's roles; for an index row, the backend's, used only to pick its list until the chain confirms. */
  roles: readonly MeRole[];
  drill: boolean | null;
  /** Only ever from the chain. */
  state: StateName | null;
  source: 'chain' | 'index';
}

/** Chain rows first, in the SDK's order (newest first); then each vault only the backend lists, once, whatever its case. */
export function mergeMe(chain: readonly VaultRef[] | undefined, index: readonly MeVault[] | undefined): MeRow[] {
  const seen = new Set<string>();
  const rows: MeRow[] = [];
  for (const r of chain ?? []) {
    const key = r.vault.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ vault: r.vault, roles: r.roles, drill: r.drill, state: r.state, source: 'chain' });
  }
  for (const r of index ?? []) {
    const key = r.vault.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ vault: r.vault, roles: r.roles, drill: null, state: null, source: 'index' });
  }
  return rows;
}

export type Section = 'own' | 'guard' | 'inherit';
export const SECTIONS: readonly Section[] = ['own', 'guard', 'inherit'];
export const SECTION_ROLES: Record<Section, readonly MeRole[]> = {
  own: ['owner'],
  guard: ['guardian'],
  inherit: ['heir', 'recoveryTarget'],
};

const inSection = (roles: readonly MeRole[], s: Section) => roles.some((r) => SECTION_ROLES[s].includes(r));

/** A vault shows in every list one of its roles belongs to. */
export function sectionsOf(rows: readonly MeRow[]): Record<Section, MeRow[]> {
  return {
    own: rows.filter((r) => inSection(r.roles, 'own')),
    guard: rows.filter((r) => inSection(r.roles, 'guard')),
    inherit: rows.filter((r) => inSection(r.roles, 'inherit')),
  };
}

export type RowVerdict = 'pending' | 'show' | 'hide';

/**
 * An index row in `section`: hidden when the chain read failed, when the deployment's factory did not create the
 * vault, or when the connected wallet has no role of that list in it; pending until the chain answers.
 */
export function indexRowVerdict(
  section: Section,
  read: { registered: boolean; roles: readonly MeRole[] } | null,
  failed: boolean,
): RowVerdict {
  if (failed) return 'hide';
  if (!read) return 'pending';
  return read.registered && inSection(read.roles, section) ? 'show' : 'hide';
}
```

Run: `npm test -w apps/web -- me-merge`
Expected: PASS (3 test).

- [ ] **Step 3: Chuỗi giao diện**

`apps/web/src/messages/me.messages.ts`:

```ts
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    title: 'Your vaults',
    lead: 'Every vault where this wallet has a role, read from X Layer.',
    connectTitle: 'Connect your wallet to see your vaults',
    connectBody: 'Connecting only shares your address so the page can look up your vaults. Nothing is signed.',
    connect: 'Connect wallet',
    loading: 'Looking for your vaults on the chain…',
    emptyTitle: 'This wallet has no vaults yet',
    emptyBody: 'Create a vault for yourself, or, if you are a guardian or an heir, ask the owner for their invitation link.',
    create: 'Create a vault',
    sectionOwn: 'Vaults you own',
    sectionOwnEmpty: 'You do not own a vault with this wallet.',
    sectionGuard: 'Vaults you guard',
    sectionGuardEmpty: 'Nobody has named this wallet as a guardian.',
    sectionInherit: 'Vaults you may receive from',
    sectionInheritHint: 'As an heir, or as the new wallet of a recovery in progress.',
    sectionInheritEmpty: 'Nobody has named this wallet as an heir.',
    open: 'Open',
    openVault: 'vault {vault}',
    checking: 'Checking this vault on the chain…',
    indexNote: 'The list starts from the Atropyle index for speed. Every vault and role is checked on the chain before it shows.',
  },
  {
    title: 'Vault của bạn',
    lead: 'Mọi vault mà ví này có vai trò, đọc từ X Layer.',
    connectTitle: 'Kết nối ví để xem vault của bạn',
    connectBody: 'Kết nối chỉ chia sẻ địa chỉ để trang tìm vault của bạn. Không có gì được ký.',
    connect: 'Kết nối ví',
    loading: 'Đang tìm vault của bạn trên chain…',
    emptyTitle: 'Ví này chưa có vault nào',
    emptyBody: 'Hãy tạo một vault cho chính bạn, hoặc nếu bạn là người giám hộ hay người thừa kế, hãy xin chủ vault link mời.',
    create: 'Tạo vault',
    sectionOwn: 'Vault bạn sở hữu',
    sectionOwnEmpty: 'Bạn không sở hữu vault nào bằng ví này.',
    sectionGuard: 'Vault bạn giám hộ',
    sectionGuardEmpty: 'Chưa ai chọn ví này làm người giám hộ.',
    sectionInherit: 'Vault bạn có thể nhận',
    sectionInheritHint: 'Với tư cách người thừa kế, hoặc là ví mới của một lần khôi phục đang diễn ra.',
    sectionInheritEmpty: 'Chưa ai chọn ví này làm người thừa kế.',
    open: 'Mở',
    openVault: 'vault {vault}',
    checking: 'Đang kiểm vault này trên chain…',
    indexNote: 'Danh sách bắt đầu từ chỉ mục của Atropyle cho nhanh. Mọi vault và vai trò đều được kiểm trên chain trước khi hiện.',
  },
);
```

- [ ] **Step 4: Trang**

`apps/web/src/app/me/me-page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useMe } from '@/api/hooks';
import { useVault, useVaultsOf } from '@/chain/hooks';
import { IS_VERCEL } from '@/config/env';
import { useT } from '@/i18n/provider';
import { messages as me } from '@/messages/me.messages';
import { createHref, vaultHref } from '@/routes';
import { type ThreadState, threadStateOf } from '@/thread/state';
import { StateBadge } from '@/thread/state-badge';
import { ErrorBox } from '@/tx/error-box';
import { Address } from '@/ui/address';
import { Button, buttonClass } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Skeleton } from '@/ui/skeleton';
import { useWallet } from '@/wallet/provider';
import { useVaultRoles } from '@/wallet/use-vault-roles';
import { indexRowVerdict, type MeRow, mergeMe, SECTIONS, type Section, sectionsOf } from './merge';

const TITLE = { own: 'sectionOwn', guard: 'sectionGuard', inherit: 'sectionInherit' } as const;
const EMPTY = { own: 'sectionOwnEmpty', guard: 'sectionGuardEmpty', inherit: 'sectionInheritEmpty' } as const;

function RowView(p: { vault: string; state: ThreadState; drill: boolean; source: MeRow['source'] }) {
  const t = useT(me);
  return (
    <li
      data-testid="me-row"
      data-vault={p.vault}
      data-state={p.state}
      data-source={p.source}
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface-1 px-4 py-3"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <StateBadge state={p.state} drill={p.drill} size="sm" />
        <Address address={p.vault} avatar />
      </div>
      <Link href={vaultHref(p.vault)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
        {t('open')}
        <span className="sr-only"> {t('openVault', { vault: p.vault })}</span>
      </Link>
    </li>
  );
}

/** A row only the backend listed: read on the chain first, shown only when the chain agrees (merge.ts). */
function IndexRow({ row, section }: { row: MeRow; section: Section }) {
  const t = useT(me);
  const q = useVault(row.vault);
  const roles = useVaultRoles(q.data);
  const verdict = indexRowVerdict(section, q.data && roles ? { registered: q.data.registered, roles } : null, q.isError);
  if (verdict === 'hide') return null;
  if (verdict === 'pending' || !q.data) {
    return (
      <li className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3" aria-busy="true">
        <Skeleton className="h-6 w-24" />
        <span className="text-ink-muted text-small">{t('checking')}</span>
      </li>
    );
  }
  const s = q.data.snap;
  return <RowView vault={row.vault} state={threadStateOf(s.status)} drill={s.config.drill} source="index" />;
}

function SectionList({ section, rows }: { section: Section; rows: readonly MeRow[] }) {
  const t = useT(me);
  return (
    <section data-testid={`me-section-${section}`} aria-labelledby={`me-${section}`} className="flex flex-col gap-3">
      <h2 id={`me-${section}`} className="font-display text-title">
        {t(TITLE[section])}
      </h2>
      {section === 'inherit' ? <p className="text-ink-muted text-small">{t('sectionInheritHint')}</p> : null}
      {rows.length === 0 ? (
        <p className="text-ink-muted text-small">{t(EMPTY[section])}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) =>
            r.source === 'chain' && r.state && r.drill !== null ? (
              <RowView key={r.vault.toLowerCase()} vault={r.vault} state={r.state} drill={r.drill} source="chain" />
            ) : (
              <IndexRow key={r.vault.toLowerCase()} row={r} section={section} />
            ),
          )}
        </ul>
      )}
    </section>
  );
}

export function MePage() {
  const t = useT(me);
  const { wallet, openSheet } = useWallet();
  const account = wallet?.account ?? null;
  const chain = useVaultsOf(account);
  const index = useMe(account);
  const rows = mergeMe(chain.data, index.data?.vaults);
  const sections = sectionsOf(rows);

  let body: ReactNode;
  if (!account) {
    body = (
      <EmptyState
        title={t('connectTitle')}
        body={t('connectBody')}
        action={<Button onClick={openSheet}>{t('connect')}</Button>}
      />
    );
  } else if (rows.length === 0 && chain.isError) {
    body = <ErrorBox error={chain.error} onRetry={() => void chain.refetch()} />;
  } else if (rows.length === 0 && chain.isPending) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-2">
        <p className="text-ink-muted">{t('loading')}</p>
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        title={t('emptyTitle')}
        body={t('emptyBody')}
        action={
          <Link href={createHref()} className={buttonClass({ variant: 'primary' })}>
            {t('create')}
          </Link>
        }
      />
    );
  } else {
    body = (
      <div className="flex flex-col gap-10">
        {SECTIONS.map((s) => (
          <SectionList key={s} section={s} rows={sections[s]} />
        ))}
        {IS_VERCEL ? <p className="text-caption text-ink-muted">{t('indexNote')}</p> : null}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h1">{t('title')}</h1>
        <p className="text-ink-muted">{t('lead')}</p>
      </header>
      {body}
    </div>
  );
}
```

`apps/web/src/app/me/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { MePage } from './me-page';

export const metadata: Metadata = {
  title: 'Your vaults',
  description: 'Every Atropyle vault where your wallet is the owner, a guardian or an heir, read from X Layer.',
};

export default function Page() {
  return <MePage />;
}
```

Run: `npm test -w apps/web -- me-merge lazy-boundary && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: E2E**

`apps/web/test/e2e/me.spec.ts`:

```ts
import { ANVIL, expect, test } from './fixtures';
import { connectWallet, expectAccessibleInBothThemes } from './helpers';

test('without a wallet the page asks to connect', async ({ page, state }) => {
  await page.goto(new URL('me/', state.siteUrl).href);
  await expect(page.getByRole('heading', { level: 1, name: 'Your vaults' })).toBeVisible();
  await expect(page.getByText('Connect your wallet to see your vaults')).toBeVisible();
  await expectAccessibleInBothThemes(page);
});

test('the owner sees the seeded vaults with their states from the chain', async ({ page, state, wallet }) => {
  await wallet({ account: ANVIL[1] });
  await page.goto(new URL('me/', state.siteUrl).href);
  await connectWallet(page);
  const own = page.getByTestId('me-section-own');
  for (const v of [state.seeded.simple, state.seeded.guarded, state.seeded.grace]) {
    await expect(own.locator(`[data-testid="me-row"][data-vault="${v}"]`)).toHaveAttribute('data-source', 'chain');
  }
  await expect(own.locator(`[data-vault="${state.seeded.grace}"]`)).toHaveAttribute('data-state', 'grace');
  await expect(page.getByTestId('me-section-guard')).toContainText('Nobody has named this wallet as a guardian.');
  await expectAccessibleInBothThemes(page);
});

test('a guardian who is also an heir sees the vault in both lists', async ({ page, state, wallet }) => {
  await wallet({ account: ANVIL[5] });
  await page.goto(new URL('me/', state.siteUrl).href);
  await connectWallet(page);
  const row = (s: string) => page.getByTestId(`me-section-${s}`).locator(`[data-vault="${state.seeded.guarded}"]`);
  await expect(row('guard')).toBeVisible();
  await expect(row('inherit')).toBeVisible();
  await expect(page.getByTestId('me-section-own').getByTestId('me-row')).toHaveCount(0);
});
```

Theo `scripts/lib/seed.ts`: chủ của ba vault là `ANVIL[1]`, `grace` đã ở `grace`; `ANVIL[5]` là giám hộ và người thừa kế 30 % của `guarded`.

Run: `npm run e2e -w apps/web -- me`
Expected: PASS (3 test × 2 project). Bản e2e là deweb nên không có request backend (lưới chặn request off-chain của 7A giữ điều đó).

- [ ] **Step 6: Màn hình**

```powershell
$env:SCREENS='me/'; $env:SCREENS_WALLET='5'; npm run e2e -w apps/web -- screens --project=desktop; Remove-Item Env:SCREENS, Env:SCREENS_WALLET
$env:SCREENS='me/'; npm run e2e -w apps/web -- screens --project=desktop; Remove-Item Env:SCREENS
```

Lần đầu có ví (đủ ba nhóm, một vault ở hai nhóm), lần hai chưa kết nối. Chạy lần hai sau khi đã chép ảnh lần đầu ra chỗ khác, vì tên file trùng. Kiểm: địa chỉ dài không tràn ở 390 px, nút "Open" không rớt xuống dòng riêng một cách xấu, nhãn trạng thái đọc được ở theme sáng. Liệt kê đường dẫn ảnh trong báo cáo task.

- [ ] **Step 7: Kiểm toàn bộ và commit**

```bash
npm test -w apps/web
npm run typecheck
npx biome check --write apps/web/src/app/me apps/web/src/messages/me.messages.ts apps/web/test/unit/me-merge.test.ts apps/web/test/e2e/me.spec.ts
npx biome ci .
git add apps/web/src/app/me/merge.ts apps/web/src/app/me/me-page.tsx apps/web/src/app/me/page.tsx apps/web/src/messages/me.messages.ts apps/web/test/unit/me-merge.test.ts apps/web/test/e2e/me.spec.ts
git commit -m "feat(web): /me/ lists the connected wallet's vaults in three groups" -m "Read from the chain with vaultsOf; on the vercel build the backend's list shows first, but each of its rows appears only once the chain confirms the vault and the role, and states come only from the chain." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `/join/`, `/alerts/confirm/`, `/alerts/unsubscribe/`

**Điều kiện:** task `SubscribeForm` của Plan 7B đã merge. Giao diện cố định giữa hai plan (chép nguyên văn, không gì khác đi qua lại):

```ts
// apps/web/src/components/subscribe/SubscribeForm.tsx — created by Plan 7B, imported by Plan 7C's /join/ page
'use client';
export interface SubscribeFormProps {
  vault: `0x${string}`;                    // checksummed
  role: 'owner' | 'guardian' | 'heir';
  /** Tighter layout for the wizard's Done step and /join/. */
  compact?: boolean;
}
export function SubscribeForm(props: SubscribeFormProps): JSX.Element;
```

Bản vercel: ô email, chọn EN/VI, honeypot `website`, gửi mutation §9.6 qua `src/api/hooks.ts`, luôn trả cùng một câu "check your inbox". Bản deweb: một dòng nói cảnh báo email chỉ có ở site hosted, kèm link qua `ExternalLink`; không bao giờ gửi request.

Spec §5.7: người nhận link mời (`/join/#<vault>.<role>`, tạo bằng `joinHref` của 7A) phải hiểu mình được mời làm gì, thấy vault thật trên chain, được nhắc an toàn, và đăng ký cảnh báo nếu muốn. Hai trang email theo Quyết định 11 và 12.

**Files:**
- Create: `apps/web/src/app/join/invite.ts`, `apps/web/src/app/join/join-page.tsx`, `apps/web/src/app/join/page.tsx`
- Create: `apps/web/src/app/alerts/token.ts`, `apps/web/src/app/alerts/alerts-view.tsx`, `apps/web/src/app/alerts/confirm/confirm-page.tsx`, `apps/web/src/app/alerts/confirm/page.tsx`, `apps/web/src/app/alerts/unsubscribe/unsubscribe-page.tsx`, `apps/web/src/app/alerts/unsubscribe/page.tsx`
- Create: `apps/web/src/messages/join.messages.ts`, `apps/web/src/messages/alerts.messages.ts`
- Test: `apps/web/test/unit/invite.test.ts`, `apps/web/test/unit/alerts.test.tsx`, `apps/web/test/e2e/join.spec.ts`

**Interfaces:**
- Consumes (7A): `useLocationHash`, `replaceHash` (`@/lib/hash`), `useMounted`, `getApi` (`@/api/instance`), `useConfirm`, `useUnsubscribe` (`@/api/hooks`), `ConfirmResponse` (`@/api/types`), `errorCode` (`@/chain/query-client`), `useVault`, `useWallet`, `useVaultRoles`, `threadStateOf`, `StateBadge`, `ENV`, `explorerUrlOf`, `vaultHref`, `ROUTES`, `ErrorBox`, `Address`, `Banner`, `Button`, `buttonClass`, `Skeleton`, `Spinner`, `useT`, `defineMessages`. (7B): `SubscribeForm`. viem (trong `src/app/join/**`, được phép import giá trị): `getAddress`, `isAddress`. Test: `makeWrapper` (`test/helpers/render`).
- Produces:
  - `src/app/join/invite.ts`: `type InviteRole = 'guardian' | 'heir'`; `type InviteProblem = 'missing' | 'shape' | 'address' | 'role'`; `type Invite = { ok: true; vault: Address; role: InviteRole } | { ok: false; reason: InviteProblem }`; `parseInvite(hash: string): Invite`.
  - `src/app/alerts/token.ts`: `TOKEN_RE`; `readToken(hash: string): string | null`; `type HashToken = { status: 'reading' } | { status: 'invalid' } | { status: 'found'; token: string }`; `useHashToken(): HashToken`; `type ConfirmState = 'reading' | 'invalid' | 'hostedOnly' | 'working' | 'done' | 'error'`; `useConfirmFlow(): { state: ConfirmState; result: ConfirmResponse | null; error: unknown; retry(): void }`; `type UnsubscribeState = 'reading' | 'invalid' | 'hostedOnly' | 'ready' | 'working' | 'done' | 'error'`; `useUnsubscribeFlow(): { state: UnsubscribeState; error: unknown; stop(): void }`.
  - Test id: `join` (`data-state` = `loading` | `invalid` | `notVault` | `error` | `ready`, `data-reason` khi `invalid`); `alerts` (`data-state` = trạng thái của flow); `alerts-stop`.

- [ ] **Step 1: Test link mời**

`apps/web/test/unit/invite.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseInvite } from '../../src/app/join/invite';

// The EIP-55 test vector: mixed case, so one changed letter breaks its checksum.
const V = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

describe('invitation links', () => {
  it('accept exactly a vault address and the role guardian or heir', () => {
    expect(parseInvite(`#${V}.heir`)).toEqual({ ok: true, vault: V, role: 'heir' });
    expect(parseInvite(`#${V.toLowerCase()}.guardian`)).toEqual({ ok: true, vault: V, role: 'guardian' });
  });

  it('refuse a link that was cut, edited or padded, and say which part is wrong', () => {
    const edited = V.replace('F3E', 'f3E');
    expect(parseInvite('')).toEqual({ ok: false, reason: 'missing' });
    expect(parseInvite('#')).toEqual({ ok: false, reason: 'missing' });
    expect(parseInvite(`#${V}`)).toEqual({ ok: false, reason: 'shape' });
    expect(parseInvite(`#${V}.heir.extra`)).toEqual({ ok: false, reason: 'shape' });
    expect(parseInvite(`#${V}.heir${'x'.repeat(200)}`)).toEqual({ ok: false, reason: 'shape' });
    expect(parseInvite(`#${edited}.heir`)).toEqual({ ok: false, reason: 'address' });
    expect(parseInvite('#0x1234.heir')).toEqual({ ok: false, reason: 'address' });
    expect(parseInvite(`#${V}.owner`)).toEqual({ ok: false, reason: 'role' });
    expect(parseInvite(`#${V}.Heir`)).toEqual({ ok: false, reason: 'role' });
  });
});
```

Run: `npm test -w apps/web -- invite`
Expected: FAIL, không tìm thấy `../../src/app/join/invite`.

- [ ] **Step 2: `invite.ts`**

```ts
import { type Address, getAddress, isAddress } from 'viem';

export type InviteRole = 'guardian' | 'heir';
export type InviteProblem = 'missing' | 'shape' | 'address' | 'role';
export type Invite = { ok: true; vault: Address; role: InviteRole } | { ok: false; reason: InviteProblem };

/** 42 for the address, 1 for the dot, 8 for the longest role: anything longer was padded. */
const MAX = 51;

/**
 * `#<vault>.<role>` as joinHref writes it. A mixed-case address must carry a valid EIP-55 checksum, so a changed letter
 * is caught before anything is read from the chain.
 */
export function parseInvite(hash: string): Invite {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw === '') return { ok: false, reason: 'missing' };
  const parts = raw.split('.');
  if (raw.length > MAX || parts.length !== 2) return { ok: false, reason: 'shape' };
  const [address, role] = parts;
  if (!isAddress(address, { strict: true })) return { ok: false, reason: 'address' };
  if (role !== 'guardian' && role !== 'heir') return { ok: false, reason: 'role' };
  return { ok: true, vault: getAddress(address), role };
}
```

Run: `npm test -w apps/web -- invite`
Expected: PASS (2 test).

- [ ] **Step 3: Test link email**

`apps/web/test/unit/alerts.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode, StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfirmFlow, useUnsubscribeFlow } from '../../src/app/alerts/token';
import { makeWrapper } from '../helpers/render';

const fake = vi.hoisted(() => ({
  subscribe: vi.fn(),
  confirm: vi.fn(),
  unsubscribe: vi.fn(),
  me: vi.fn(),
  stats: vi.fn(),
  health: vi.fn(),
}));
const backend = vi.hoisted(() => ({ on: true }));
vi.mock('../../src/api/instance', () => ({ getApi: () => (backend.on ? fake : null) }));

const TOKEN = 'Ab3_-'.repeat(8).concat('xyz');
const VAULT = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

function strict() {
  const Wrapper = makeWrapper();
  return ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <Wrapper>{children}</Wrapper>
    </StrictMode>
  );
}

const open = (path: string) => window.history.replaceState(null, '', path);

beforeEach(() => {
  vi.resetAllMocks();
  backend.on = true;
});

describe('email links', () => {
  it('confirm with exactly one request, even in StrictMode, and take the token out of the address bar', async () => {
    expect(TOKEN).toHaveLength(43);
    open(`/alerts/confirm/#t=${TOKEN}`);
    fake.confirm.mockResolvedValue({ ok: true, vault: VAULT, role: 'heir' });
    const { result } = renderHook(() => useConfirmFlow(), { wrapper: strict() });
    await waitFor(() => expect(result.current.state).toBe('done'));
    expect(fake.confirm).toHaveBeenCalledTimes(1);
    expect(fake.confirm.mock.calls[0][0]).toBe(TOKEN);
    expect(result.current.result).toEqual({ ok: true, vault: VAULT, role: 'heir' });
    expect(window.location.href).not.toContain(TOKEN);
  });

  it('unsubscribe only when the person presses the button, once', async () => {
    open(`/alerts/unsubscribe/#t=${TOKEN}`);
    fake.unsubscribe.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useUnsubscribeFlow(), { wrapper: strict() });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(fake.unsubscribe).not.toHaveBeenCalled();
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.state).toBe('done'));
    expect(fake.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('send nothing for a malformed token, or when this build has no backend', async () => {
    open('/alerts/confirm/#t=short');
    const bad = renderHook(() => useConfirmFlow(), { wrapper: strict() });
    await waitFor(() => expect(bad.result.current.state).toBe('invalid'));
    expect(window.location.href).not.toContain('#t=');

    backend.on = false;
    open(`/alerts/confirm/#t=${TOKEN}`);
    const deweb = renderHook(() => useConfirmFlow(), { wrapper: strict() });
    await waitFor(() => expect(deweb.result.current.state).toBe('hostedOnly'));
    expect(fake.confirm).not.toHaveBeenCalled();
  });
});
```

`TOKEN_RE` chép từ backend (Quyết định 12). Khi Plan 8 đổi dạng token, test đầu hỏng ở `toHaveLength(43)` hoặc ở `'invalid'`, và chỉ cần sửa `TOKEN_RE` trong `token.ts` cùng chuỗi `TOKEN` ở đây.

Run: `npm test -w apps/web -- alerts`
Expected: FAIL, không tìm thấy `../../src/app/alerts/token`.

- [ ] **Step 4: `token.ts`**

`apps/web/src/app/alerts/token.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfirm, useUnsubscribe } from '@/api/hooks';
import { getApi } from '@/api/instance';
import type { ConfirmResponse } from '@/api/types';
import { replaceHash } from '@/lib/hash';

/** The backend's token: 32 random bytes in base64url (TOKEN_RE of apps/backend/src/crypto.ts, Plan 8). */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function readToken(hash: string): string | null {
  const m = /^#t=([^&]*)$/.exec(hash);
  return m && TOKEN_RE.test(m[1]) ? m[1] : null;
}

export type HashToken = { status: 'reading' } | { status: 'invalid' } | { status: 'found'; token: string };

/**
 * Reads `#t=<token>` once after hydration and clears the fragment at once, so the token is in no history entry,
 * screenshot or shared link. The ref keeps the first read through StrictMode's second effect run.
 */
export function useHashToken(): HashToken {
  const [state, setState] = useState<HashToken>({ status: 'reading' });
  const read = useRef<HashToken | null>(null);
  useEffect(() => {
    if (!read.current) {
      const hash = window.location.hash;
      const token = readToken(hash);
      read.current = token ? { status: 'found', token } : { status: 'invalid' };
      if (hash !== '') replaceHash('');
    }
    setState(read.current);
  }, []);
  return state;
}

export type ConfirmState = 'reading' | 'invalid' | 'hostedOnly' | 'working' | 'done' | 'error';

/** Double opt-in: the page confirms by itself, with one POST (Quyết định 11). */
export function useConfirmFlow(): { state: ConfirmState; result: ConfirmResponse | null; error: unknown; retry(): void } {
  const tok = useHashToken();
  const { mutate, data, error, isSuccess, isError } = useConfirm();
  const hosted = getApi() !== null;
  const sent = useRef(false);
  const token = tok.status === 'found' ? tok.token : null;
  useEffect(() => {
    if (!token || !hosted || sent.current) return;
    sent.current = true;
    mutate(token);
  }, [token, hosted, mutate]);
  const retry = useCallback(() => {
    if (token && hosted) mutate(token);
  }, [token, hosted, mutate]);
  let state: ConfirmState;
  if (tok.status === 'reading') state = 'reading';
  else if (tok.status === 'invalid') state = 'invalid';
  else if (!hosted) state = 'hostedOnly';
  else if (isSuccess) state = 'done';
  else if (isError) state = 'error';
  else state = 'working';
  return { state, result: data ?? null, error, retry };
}

export type UnsubscribeState = 'reading' | 'invalid' | 'hostedOnly' | 'ready' | 'working' | 'done' | 'error';

/** Nothing is sent until the person presses the button: mail scanners open links and may run scripts. */
export function useUnsubscribeFlow(): { state: UnsubscribeState; error: unknown; stop(): void } {
  const tok = useHashToken();
  const { mutate, error, isIdle, isSuccess, isError, isPending } = useUnsubscribe();
  const hosted = getApi() !== null;
  const token = tok.status === 'found' ? tok.token : null;
  const stop = useCallback(() => {
    if (token && hosted && !isPending) mutate(token);
  }, [token, hosted, isPending, mutate]);
  let state: UnsubscribeState;
  if (tok.status === 'reading') state = 'reading';
  else if (tok.status === 'invalid') state = 'invalid';
  else if (!hosted) state = 'hostedOnly';
  else if (isSuccess) state = 'done';
  else if (isError) state = 'error';
  else if (isIdle) state = 'ready';
  else state = 'working';
  return { state, error, stop };
}
```

Run: `npm test -w apps/web -- alerts`
Expected: PASS (3 test).

- [ ] **Step 5: Chuỗi giao diện**

`apps/web/src/messages/join.messages.ts`:

```ts
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    eyebrow: 'Atropyle invitation',
    titleHeir: 'You have been named as an heir',
    titleGuardian: 'You have been asked to be a guardian',
    leadHeir: 'Someone who cares about you has made a plan for their crypto. If they can no longer look after it, part of it can come to you, without a lawyer and without anyone being able to stop it.',
    leadGuardian: 'Someone trusts you to help their plan do the right thing. You never hold their money, and you never need to be online at a set time.',
    loading: 'Reading the vault on X Layer…',
    vaultLabel: 'Vault',
    stateLabel: 'Right now',
    openVault: 'See the whole vault',
    roleHeir: 'heir',
    roleGuardian: 'guardian',
    walletYes: 'The connected wallet is named as {role} in this vault.',
    walletNo: 'The connected wallet is not named as {role} in this vault. You may have connected another wallet, or the owner has not finished setting it up.',
    whatTitle: 'What this means for you',
    whatHeir1: 'You do not need to do anything now, and being named costs you nothing.',
    whatHeir2: 'If the owner stops checking in, the vault raises an alarm and tells the guardians. After the waiting time the owner chose, your share can be sent to your wallet.',
    whatHeir3: 'While the owner is active they can change the plan. This link always shows the vault as it is now, so keep it.',
    whatGuardian1: 'If the owner stops checking in, you may be asked to confirm that they can no longer sign. That lets the heirs receive sooner.',
    whatGuardian2: 'If the owner turned on recovery and loses their keys, you can vote with the other guardians to move the vault to their new wallet.',
    whatGuardian3: 'Guardians act together and on a delay, and one check-in from the owner cancels any vote.',
    safetyTitle: 'Stay safe',
    safety1: 'Atropyle never asks for your seed phrase or private key, and will never message you first.',
    safety2: 'This page asks you to sign nothing.',
    safety3: 'Check that the vault address above is the one the owner told you about.',
    alertsTitle: 'Get an email when it matters',
    alertsLead: 'Optional. You will hear from us only when this vault needs you.',
    invalidTitle: 'This invitation link is broken',
    invalidMissing: 'The link has no vault in it. Ask the owner to send you the whole link again.',
    invalidShape: 'The link was cut short or something was added to it. Ask the owner to send it again.',
    invalidAddress: 'The vault address in the link is not valid: a character may have been changed. Ask the owner to send it again, and do not use this one.',
    invalidRole: 'The link does not say whether you are a guardian or an heir. Ask the owner to send it again.',
    notVaultTitle: 'There is no Atropyle vault at this address',
    notVaultBody: 'The address in the link is not a vault made by Atropyle on X Layer. Do not send anything to it, and check the link with the owner.',
    home: 'Go to the home page',
  },
  {
    eyebrow: 'Lời mời Atropyle',
    titleHeir: 'Bạn được chọn làm người thừa kế',
    titleGuardian: 'Bạn được mời làm người giám hộ',
    leadHeir: 'Một người quan tâm đến bạn đã lập kế hoạch cho tài sản crypto của họ. Nếu họ không còn tự lo được, một phần có thể đến với bạn, không cần luật sư và không ai ngăn được.',
    leadGuardian: 'Một người tin bạn đủ để nhờ bạn giúp kế hoạch của họ đi đúng hướng. Bạn không bao giờ giữ tiền của họ, và không phải trực vào giờ nào cả.',
    loading: 'Đang đọc vault trên X Layer…',
    vaultLabel: 'Vault',
    stateLabel: 'Lúc này',
    openVault: 'Xem toàn bộ vault',
    roleHeir: 'người thừa kế',
    roleGuardian: 'người giám hộ',
    walletYes: 'Ví đang kết nối được ghi là {role} trong vault này.',
    walletNo: 'Ví đang kết nối chưa được ghi là {role} trong vault này. Có thể bạn kết nối nhầm ví, hoặc chủ vault chưa thiết lập xong.',
    whatTitle: 'Điều này có nghĩa gì với bạn',
    whatHeir1: 'Bây giờ bạn không cần làm gì, và được chọn không tốn của bạn đồng nào.',
    whatHeir2: 'Nếu chủ vault ngừng check-in, vault bật báo động và báo cho người giám hộ. Sau thời gian chờ mà chủ vault đã chọn, phần của bạn có thể được gửi về ví của bạn.',
    whatHeir3: 'Khi chủ vault còn hoạt động, họ có thể đổi kế hoạch. Link này luôn cho thấy vault như hiện tại, nên hãy giữ nó.',
    whatGuardian1: 'Nếu chủ vault ngừng check-in, bạn có thể được nhờ xác nhận rằng họ không còn ký được. Việc đó giúp người thừa kế nhận sớm hơn.',
    whatGuardian2: 'Nếu chủ vault đã bật khôi phục và mất chìa khoá, bạn có thể cùng những người giám hộ khác bầu chuyển vault sang ví mới của họ.',
    whatGuardian3: 'Người giám hộ hành động cùng nhau và có thời gian chờ, và chỉ một lần check-in của chủ vault là huỷ mọi cuộc bầu.',
    safetyTitle: 'Giữ an toàn',
    safety1: 'Atropyle không bao giờ hỏi seed phrase hay private key của bạn, và không bao giờ nhắn cho bạn trước.',
    safety2: 'Trang này không yêu cầu bạn ký gì cả.',
    safety3: 'Hãy kiểm tra địa chỉ vault ở trên đúng là địa chỉ chủ vault đã nói với bạn.',
    alertsTitle: 'Nhận email khi cần',
    alertsLead: 'Không bắt buộc. Bạn chỉ nhận thư khi vault này cần đến bạn.',
    invalidTitle: 'Link mời này bị hỏng',
    invalidMissing: 'Link không có vault nào. Hãy nhờ chủ vault gửi lại đầy đủ.',
    invalidShape: 'Link bị cắt ngắn hoặc bị thêm thứ gì đó. Hãy nhờ chủ vault gửi lại.',
    invalidAddress: 'Địa chỉ vault trong link không hợp lệ: có thể một ký tự đã bị sửa. Hãy nhờ chủ vault gửi lại, và đừng dùng link này.',
    invalidRole: 'Link không nói bạn là người giám hộ hay người thừa kế. Hãy nhờ chủ vault gửi lại.',
    notVaultTitle: 'Không có vault Atropyle nào ở địa chỉ này',
    notVaultBody: 'Địa chỉ trong link không phải vault do Atropyle tạo trên X Layer. Đừng gửi gì vào đó, và hãy hỏi lại chủ vault.',
    home: 'Về trang chủ',
  },
);
```

`apps/web/src/messages/alerts.messages.ts`:

```ts
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    confirmTitle: 'Confirm your email alerts',
    unsubTitle: 'Stop email alerts',
    reading: 'Reading your link…',
    invalidTitle: 'This link does not work',
    invalidBody: 'The link is incomplete or was changed. Open it again from the email, or copy the whole address into your browser.',
    hostedOnly: 'Email alerts work only on the hosted Atropyle site. This copy of the site never sends your email address anywhere.',
    confirming: 'Confirming…',
    confirmedTitle: 'You will get alerts for this vault',
    confirmedBody: 'We will email you when this vault needs attention: an alarm, a recovery vote or a release. Every email has a link to stop.',
    roleLabel: 'You signed up as',
    roleOwner: 'owner',
    roleGuardian: 'guardian',
    roleHeir: 'heir',
    openVault: 'Open the vault',
    expired: 'This link has expired or was already used. Sign up again from the vault or the invitation link.',
    unsubReady: 'Stop the alerts this email address gets for this vault? You can sign up again at any time.',
    unsubButton: 'Stop alerts',
    unsubWorking: 'Stopping…',
    unsubDoneTitle: 'Alerts stopped',
    unsubDoneBody: 'This email address will get no more alerts for this vault.',
    tokenNote: 'The code from your link is no longer in the address bar, so a screenshot or a shared address cannot reveal it.',
    privacy: 'How Atropyle handles your email',
  },
  {
    confirmTitle: 'Xác nhận nhận cảnh báo qua email',
    unsubTitle: 'Ngừng cảnh báo qua email',
    reading: 'Đang đọc link của bạn…',
    invalidTitle: 'Link này không dùng được',
    invalidBody: 'Link bị thiếu hoặc đã bị sửa. Hãy mở lại từ email, hoặc chép nguyên địa chỉ vào trình duyệt.',
    hostedOnly: 'Cảnh báo qua email chỉ có trên site Atropyle hosted. Bản site này không bao giờ gửi địa chỉ email của bạn đi đâu.',
    confirming: 'Đang xác nhận…',
    confirmedTitle: 'Bạn sẽ nhận cảnh báo cho vault này',
    confirmedBody: 'Chúng tôi sẽ email cho bạn khi vault này cần chú ý: báo động, bầu khôi phục hoặc giải ngân. Mỗi email đều có link để ngừng.',
    roleLabel: 'Bạn đăng ký với vai trò',
    roleOwner: 'chủ vault',
    roleGuardian: 'người giám hộ',
    roleHeir: 'người thừa kế',
    openVault: 'Mở vault',
    expired: 'Link này đã hết hạn hoặc đã được dùng. Hãy đăng ký lại từ vault hoặc từ link mời.',
    unsubReady: 'Ngừng các cảnh báo mà địa chỉ email này nhận cho vault này? Bạn có thể đăng ký lại bất cứ lúc nào.',
    unsubButton: 'Ngừng cảnh báo',
    unsubWorking: 'Đang ngừng…',
    unsubDoneTitle: 'Đã ngừng cảnh báo',
    unsubDoneBody: 'Địa chỉ email này sẽ không nhận thêm cảnh báo nào cho vault này.',
    tokenNote: 'Mã trong link không còn trên thanh địa chỉ, nên ảnh chụp màn hình hay địa chỉ chia sẻ không làm lộ nó.',
    privacy: 'Atropyle xử lý email của bạn thế nào',
  },
);
```

- [ ] **Step 6: Trang `/join/`**

`apps/web/src/app/join/join-page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { type ReactNode, useMemo } from 'react';
import { useVault } from '@/chain/hooks';
import { errorCode } from '@/chain/query-client';
import { SubscribeForm } from '@/components/subscribe/SubscribeForm';
import { ENV, explorerUrlOf } from '@/config/env';
import { useT } from '@/i18n/provider';
import { useLocationHash } from '@/lib/hash';
import { useMounted } from '@/lib/use-mounted';
import { messages as join } from '@/messages/join.messages';
import { ROUTES, vaultHref } from '@/routes';
import { threadStateOf } from '@/thread/state';
import { StateBadge } from '@/thread/state-badge';
import { ErrorBox } from '@/tx/error-box';
import { Address } from '@/ui/address';
import { Banner } from '@/ui/banner';
import { buttonClass } from '@/ui/button';
import { Skeleton } from '@/ui/skeleton';
import { useWallet } from '@/wallet/provider';
import { useVaultRoles } from '@/wallet/use-vault-roles';
import { type InviteProblem, type InviteRole, parseInvite } from './invite';

const EXPLORER = explorerUrlOf(ENV);
const PROBLEM = {
  missing: 'invalidMissing',
  shape: 'invalidShape',
  address: 'invalidAddress',
  role: 'invalidRole',
} as const satisfies Record<InviteProblem, string>;
const WHAT = {
  heir: ['whatHeir1', 'whatHeir2', 'whatHeir3'],
  guardian: ['whatGuardian1', 'whatGuardian2', 'whatGuardian3'],
} as const;

function Frame({ state, reason, children }: { state: string; reason?: string; children: ReactNode }) {
  return (
    <article
      data-testid="join"
      data-state={state}
      data-reason={reason}
      className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12 sm:px-6"
    >
      {children}
    </article>
  );
}

function Problem({ state, reason, title, body }: { state: string; reason?: string; title: string; body: string }) {
  const t = useT(join);
  return (
    <Frame state={state} reason={reason}>
      <h1 className="font-display text-h1">{title}</h1>
      <p className="text-pretty text-ink-muted text-lead">{body}</p>
      <Link href={ROUTES.home} className={buttonClass({ variant: 'secondary', className: 'self-start' })}>
        {t('home')}
      </Link>
    </Frame>
  );
}

function WalletCheck({ roles, role }: { roles: readonly string[] | null; role: InviteRole }) {
  const t = useT(join);
  const { wallet } = useWallet();
  if (!wallet || !roles) return null;
  const name = t(role === 'heir' ? 'roleHeir' : 'roleGuardian');
  return roles.includes(role) ? (
    <p className="text-alive text-small">{t('walletYes', { role: name })}</p>
  ) : (
    <p className="text-ink-muted text-small">{t('walletNo', { role: name })}</p>
  );
}

export function JoinPage() {
  const t = useT(join);
  const mounted = useMounted();
  const hash = useLocationHash();
  const invite = useMemo(() => parseInvite(hash), [hash]);
  // Nothing is read from the chain for a broken link.
  const q = useVault(mounted && invite.ok ? invite.vault : null);
  const roles = useVaultRoles(q.data);

  if (!mounted) {
    return (
      <Frame state="loading">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-24 w-full" />
      </Frame>
    );
  }
  if (!invite.ok) {
    return (
      <Problem state="invalid" reason={invite.reason} title={t('invalidTitle')} body={t(PROBLEM[invite.reason])} />
    );
  }
  if (q.isError && errorCode(q.error) !== 'NOT_VAULT') {
    return (
      <Frame state="error">
        <ErrorBox error={q.error} onRetry={() => void q.refetch()} />
      </Frame>
    );
  }
  if (q.isError || (q.data && !q.data.registered)) {
    return <Problem state="notVault" title={t('notVaultTitle')} body={t('notVaultBody')} />;
  }
  if (!q.data) {
    return (
      <Frame state="loading">
        <p className="text-ink-muted" aria-live="polite">
          {t('loading')}
        </p>
        <Skeleton className="h-32 w-full" />
      </Frame>
    );
  }

  const { role, vault } = invite;
  const s = q.data.snap;
  return (
    <Frame state="ready">
      <header className="flex flex-col gap-3">
        <p className="font-medium text-caption text-thread uppercase tracking-[0.16em]">{t('eyebrow')}</p>
        <h1 className="text-balance font-display text-h1">{t(role === 'heir' ? 'titleHeir' : 'titleGuardian')}</h1>
        <p className="text-pretty text-ink-muted text-lead">{t(role === 'heir' ? 'leadHeir' : 'leadGuardian')}</p>
      </header>
      <section className="flex flex-col gap-4 rounded-3xl border border-line bg-surface-1 p-5">
        <dl className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
          <dt className="text-ink-muted text-small">{t('vaultLabel')}</dt>
          <dd className="min-w-0">
            <Address address={vault} explorer={EXPLORER} avatar />
          </dd>
          <dt className="text-ink-muted text-small">{t('stateLabel')}</dt>
          <dd>
            <StateBadge state={threadStateOf(s.status)} drill={s.config.drill} />
          </dd>
        </dl>
        <WalletCheck roles={roles} role={role} />
        <Link href={vaultHref(vault)} className={buttonClass({ variant: 'secondary', className: 'self-start' })}>
          {t('openVault')}
        </Link>
      </section>
      <section aria-labelledby="join-what" className="flex flex-col gap-3">
        <h2 id="join-what" className="font-display text-title">
          {t('whatTitle')}
        </h2>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-pretty">
          {WHAT[role].map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </section>
      <Banner tone="info" title={t('safetyTitle')}>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>{t('safety1')}</li>
          <li>{t('safety2')}</li>
          <li>{t('safety3')}</li>
        </ul>
      </Banner>
      <section aria-labelledby="join-alerts" className="flex flex-col gap-3">
        <h2 id="join-alerts" className="font-display text-title">
          {t('alertsTitle')}
        </h2>
        <p className="text-ink-muted">{t('alertsLead')}</p>
        <SubscribeForm vault={vault} role={role} compact />
      </section>
    </Frame>
  );
}
```

`apps/web/src/app/join/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { JoinPage } from './join-page';

export const metadata: Metadata = {
  title: 'Your invitation',
  description: 'You have been named in an Atropyle vault. See what it means for you, and get an email when it matters.',
  robots: { index: false },
};

export default function Page() {
  return <JoinPage />;
}
```

- [ ] **Step 7: Hai trang email**

`apps/web/src/app/alerts/alerts-view.tsx`:

```tsx
'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useT } from '@/i18n/provider';
import { messages as alerts } from '@/messages/alerts.messages';
import { ROUTES } from '@/routes';
import { Banner } from '@/ui/banner';
import { Spinner } from '@/ui/spinner';

export function AlertsFrame({ state, title, children }: { state: string; title: string; children: ReactNode }) {
  const t = useT(alerts);
  return (
    <article data-testid="alerts" data-state={state} className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-16">
      <h1 className="font-display text-h1">{title}</h1>
      {children}
      <p className="text-caption text-ink-muted">{t('tokenNote')}</p>
      <Link href={ROUTES.privacy} className="self-start text-small underline underline-offset-4">
        {t('privacy')}
      </Link>
    </article>
  );
}

/** What every email page shows before the backend is involved. Null when the flow has moved past those states. */
export function EarlyState({ state }: { state: string }) {
  const t = useT(alerts);
  if (state === 'reading') return <Spinner label={t('reading')} />;
  if (state === 'invalid') {
    return (
      <Banner tone="error" title={t('invalidTitle')}>
        {t('invalidBody')}
      </Banner>
    );
  }
  if (state === 'hostedOnly') return <Banner tone="info">{t('hostedOnly')}</Banner>;
  return null;
}
```

`apps/web/src/app/alerts/confirm/confirm-page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { errorCode } from '@/chain/query-client';
import { useT } from '@/i18n/provider';
import { messages as alerts } from '@/messages/alerts.messages';
import { vaultHref } from '@/routes';
import { ErrorBox } from '@/tx/error-box';
import { Address } from '@/ui/address';
import { Banner } from '@/ui/banner';
import { buttonClass } from '@/ui/button';
import { Spinner } from '@/ui/spinner';
import { AlertsFrame, EarlyState } from '../alerts-view';
import { useConfirmFlow } from '../token';

const ROLE = { owner: 'roleOwner', guardian: 'roleGuardian', heir: 'roleHeir' } as const;

export function ConfirmPage() {
  const t = useT(alerts);
  const { state, result, error, retry } = useConfirmFlow();
  return (
    <AlertsFrame state={state} title={state === 'done' ? t('confirmedTitle') : t('confirmTitle')}>
      <EarlyState state={state} />
      {state === 'working' ? <Spinner label={t('confirming')} /> : null}
      {state === 'error' && errorCode(error) === 'TOKEN_INVALID' ? <Banner tone="warn">{t('expired')}</Banner> : null}
      {state === 'error' && errorCode(error) !== 'TOKEN_INVALID' ? <ErrorBox error={error} onRetry={retry} /> : null}
      {state === 'done' && result ? (
        <div className="flex flex-col gap-4">
          <p className="text-pretty">{t('confirmedBody')}</p>
          <Address address={result.vault} avatar />
          <p className="text-ink-muted text-small">
            {t('roleLabel')}: {t(ROLE[result.role])}
          </p>
          <Link href={vaultHref(result.vault)} className={buttonClass({ variant: 'primary', className: 'self-start' })}>
            {t('openVault')}
          </Link>
        </div>
      ) : null}
    </AlertsFrame>
  );
}
```

`apps/web/src/app/alerts/unsubscribe/unsubscribe-page.tsx`:

```tsx
'use client';

import { errorCode } from '@/chain/query-client';
import { useT } from '@/i18n/provider';
import { messages as alerts } from '@/messages/alerts.messages';
import { ErrorBox } from '@/tx/error-box';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { AlertsFrame, EarlyState } from '../alerts-view';
import { useUnsubscribeFlow } from '../token';

export function UnsubscribePage() {
  const t = useT(alerts);
  const { state, error, stop } = useUnsubscribeFlow();
  return (
    <AlertsFrame state={state} title={state === 'done' ? t('unsubDoneTitle') : t('unsubTitle')}>
      <EarlyState state={state} />
      {state === 'ready' || state === 'working' ? (
        <div className="flex flex-col gap-4">
          <p className="text-pretty">{t('unsubReady')}</p>
          <Button
            data-testid="alerts-stop"
            variant="danger"
            loading={state === 'working'}
            onClick={stop}
            className="self-start"
          >
            {state === 'working' ? t('unsubWorking') : t('unsubButton')}
          </Button>
        </div>
      ) : null}
      {state === 'error' && errorCode(error) === 'TOKEN_INVALID' ? <Banner tone="warn">{t('expired')}</Banner> : null}
      {state === 'error' && errorCode(error) !== 'TOKEN_INVALID' ? <ErrorBox error={error} onRetry={stop} /> : null}
      {state === 'done' ? <p className="text-pretty">{t('unsubDoneBody')}</p> : null}
    </AlertsFrame>
  );
}
```

`apps/web/src/app/alerts/confirm/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { ConfirmPage } from './confirm-page';

export const metadata: Metadata = { title: 'Confirm email alerts', robots: { index: false } };

export default function Page() {
  return <ConfirmPage />;
}
```

`apps/web/src/app/alerts/unsubscribe/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { UnsubscribePage } from './unsubscribe-page';

export const metadata: Metadata = { title: 'Stop email alerts', robots: { index: false } };

export default function Page() {
  return <UnsubscribePage />;
}
```

Run: `npm test -w apps/web -- invite alerts lazy-boundary && npm run typecheck`
Expected: PASS.

- [ ] **Step 8: E2E**

`apps/web/test/e2e/join.spec.ts`:

```ts
import { ANVIL, expect, test } from './fixtures';
import { expectAccessibleInBothThemes } from './helpers';

const at = (siteUrl: string, path: string) => new URL(path, siteUrl).href;

test('an heir opens a real invitation and sees the vault, what it means, and how to stay safe', async ({
  page,
  state,
}) => {
  await page.goto(at(state.siteUrl, `join/#${state.seeded.guarded}.heir`));
  const join = page.getByTestId('join');
  await expect(join).toHaveAttribute('data-state', 'ready');
  await expect(page.getByRole('heading', { level: 1, name: 'You have been named as an heir' })).toBeVisible();
  await expect(page.getByText('This page asks you to sign nothing.')).toBeVisible();
  await expectAccessibleInBothThemes(page);
});

test('a broken or wrong invitation never shows a sign-up form', async ({ page, state }) => {
  await page.goto(at(state.siteUrl, `join/#${state.seeded.guarded}.owner`));
  await expect(page.getByTestId('join')).toHaveAttribute('data-reason', 'role');
  await page.goto(at(state.siteUrl, 'join/#0x1234.heir'));
  await expect(page.getByTestId('join')).toHaveAttribute('data-reason', 'address');
  await page.goto(at(state.siteUrl, `join/#${ANVIL[8]}.heir`));
  await expect(page.getByTestId('join')).toHaveAttribute('data-state', 'notVault');
  await expect(page.getByTestId('join').getByRole('textbox')).toHaveCount(0);
  await expectAccessibleInBothThemes(page);
});

test('email links on this build send nothing and leave no token in the address bar', async ({ page, state }) => {
  const token = 'Ab3_-'.repeat(8).concat('xyz');
  await page.goto(at(state.siteUrl, `alerts/confirm/#t=${token}`));
  await expect(page.getByTestId('alerts')).toHaveAttribute('data-state', 'hostedOnly');
  expect(page.url()).not.toContain('#t=');
  await expectAccessibleInBothThemes(page);
  await page.goto(at(state.siteUrl, `alerts/unsubscribe/#t=${token}`));
  await expect(page.getByTestId('alerts')).toHaveAttribute('data-state', 'hostedOnly');
  await expect(page.getByTestId('alerts-stop')).toHaveCount(0);
  await expectAccessibleInBothThemes(page);
});
```

Bản e2e là deweb: `SubscribeForm` của 7B ở đó chỉ là một dòng chữ kèm link, không có ô nhập. Test thứ hai vẫn đếm ô nhập trong trang `notVault`, để bắt ngay lỗi hiện form cho vault không tồn tại nếu sau này bản deweb có ô nhập. Lưới chặn request off-chain của 7A bắt mọi request tới backend.

Run: `npm run e2e -w apps/web -- join`
Expected: PASS (3 test × 2 project).

- [ ] **Step 9: Màn hình**

```powershell
$env:SCREENS='join/#{guarded}.heir,join/#{guarded}.guardian,join/#0x1234.heir'; npm run e2e -w apps/web -- screens --project=desktop; Remove-Item Env:SCREENS
$env:SCREENS='alerts/confirm/#t=Ab3_-Ab3_-Ab3_-Ab3_-Ab3_-Ab3_-Ab3_-Ab3_-xyz,alerts/unsubscribe/'; npm run e2e -w apps/web -- screens --project=desktop; Remove-Item Env:SCREENS
```

Harness mở mỗi ảnh bằng một document mới (Task 3), nên trang xác nhận chụp đúng trạng thái `hostedOnly`; trang huỷ không có token chụp trạng thái link hỏng. Đọc từng ảnh như một người thừa kế không rành crypto: câu mở đầu không đáng sợ, ba dòng an toàn đọc được ở 390 px, địa chỉ vault không tràn, chữ tiếng Việt không bị cắt. Bản vercel của form đăng ký là phần của 7B; ảnh ở đây là bản deweb. Liệt kê đường dẫn ảnh trong báo cáo task.

- [ ] **Step 10: Kiểm toàn bộ và commit**

```bash
npm test -w apps/web
npm run typecheck
npx biome check --write apps/web/src/app/join apps/web/src/app/alerts apps/web/src/messages/join.messages.ts apps/web/src/messages/alerts.messages.ts apps/web/test/unit/invite.test.ts apps/web/test/unit/alerts.test.tsx apps/web/test/e2e/join.spec.ts
npx biome ci .
git add apps/web/src/app/join/invite.ts apps/web/src/app/join/join-page.tsx apps/web/src/app/join/page.tsx apps/web/src/app/alerts/token.ts apps/web/src/app/alerts/alerts-view.tsx apps/web/src/app/alerts/confirm/confirm-page.tsx apps/web/src/app/alerts/confirm/page.tsx apps/web/src/app/alerts/unsubscribe/unsubscribe-page.tsx apps/web/src/app/alerts/unsubscribe/page.tsx apps/web/src/messages/join.messages.ts apps/web/src/messages/alerts.messages.ts apps/web/test/unit/invite.test.ts apps/web/test/unit/alerts.test.tsx apps/web/test/e2e/join.spec.ts
git commit -m "feat(web): invitation page and the email confirm and unsubscribe pages" -m "/join/ checks the link's checksum and role before reading the chain, shows the real vault, what the role means and how to stay safe, then the alert sign-up. Email tokens are read once, cleared from the address bar, confirmed with one request, and unsubscribed only on a press." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `/status/`, `/developers/`, `/privacy/` và trang 404 có gợi ý

Spec §5.8 và §3. Ba trang 7A chưa có (web cũ có `status` và `developers` ở `apps/web-legacy/src/pages/`, chỉ để tham khảo; trang mới viết lại bằng primitive của 7A), cộng trang 404 biết gợi ý. Logic thuần đi kèm test: `impl/diagnostics.ts` (port từ `apps/web-legacy/src/lib/diagnostics.ts`), `health.ts` (ngưỡng Quyết định 17), `sdk-snippet.ts`, `route-suggest.ts`.

**Files:**
- Create: `apps/web/src/app/status/impl/diagnostics.ts`, `apps/web/src/app/status/health.ts`, `apps/web/src/app/status/status-page.tsx`, `apps/web/src/app/status/page.tsx`
- Create: `apps/web/src/content/sdk-snippet.ts`, `apps/web/src/app/developers/developers-page.tsx`, `apps/web/src/app/developers/page.tsx`
- Create: `apps/web/src/app/privacy/privacy-page.tsx`, `apps/web/src/app/privacy/page.tsx`
- Create: `apps/web/src/lib/route-suggest.ts`
- Create: `apps/web/src/messages/status.messages.ts`, `apps/web/src/messages/developers.messages.ts`, `apps/web/src/messages/privacy.messages.ts`, `apps/web/src/messages/not-found.messages.ts`
- Modify: `apps/web/src/app/not-found.tsx`
- Test: `apps/web/test/unit/diagnostics.test.ts`, `apps/web/test/unit/health.test.ts`, `apps/web/test/unit/sdk-snippet.test.ts`, `apps/web/test/unit/route-suggest.test.ts`, `apps/web/test/e2e/pages.spec.ts`

**Interfaces:**
- Consumes (7A): `useSdk`, `CHAIN_ID` (`@/chain/hooks`), `useChainSettings`, `RpcPlan` (`@/chain/types`), `useHealth` (`@/api/hooks`), `HealthResponse` (`@/api/types`), `ENV`, `IS_VERCEL`, `explorerUrlOf`, `Target` (`@/config/env`), `Lang`, `Params` (`@/i18n/core`), `useWallet`, `networkName` (`@/wallet/network`), `uniqueWarnings`, `warningKey` (`@/tx/tx-view`), `docsHome`, `REPO_URL`, `LICENSE_URL`, `ROUTES`, `vaultHref`, `verifyHref`, `useMounted`, `Thread`, `ErrorBox`, `Address`, `Banner`, `Button`, `buttonClass`, `CopyButton`, `ExternalLink`, `Skeleton`, `Spinner`, `UntrustedText`, khoá `notFoundTitle`, `notFoundBody`, `notFoundHint`, `goHome` của `shell.messages.ts`. (Task 3): `COMMANDS`, `CommandName`, `formatCount`. SDK (giá trị, chỉ trong `impl/diagnostics.ts`): `decodeError`, `stringify`, `untrusted`, `VERSION`, kiểu `IntegrityReport`; viem: `createPublicClient`, `http`.
- Produces:
  - `src/app/status/impl/diagnostics.ts` (chỉ qua `import()`): `interface RpcProbe { url; ok; ms; block: bigint | null; error: string | null }`; `rpcBlockNumber(url)`; `rpcUrlsOf(rpc: RpcPlan): string[]`; `probeRpc(url, blockNumber, now?)`; `probeAll(urls, blockNumber)`; `pageUrl(href)`; `interface DiagnosticsInput`; `buildDiagnostics(i): string`.
  - `src/app/status/health.ts`: `INDEXER_STALE_SEC = 300`, `INDEXER_LAG_BLOCKS = 100`, `INTEGRITY_STALE_SEC = 1800`, `KEEPER_STALE_SEC = 300`, `KEEPER_LOW_WEI = 5_000_000_000_000_000n`; `type HealthId = 'indexer' | 'integrity' | 'keeper'`; `type HealthTone = 'ok' | 'warn' | 'bad' | 'unknown'`; `type HealthText`; `interface HealthRow { id; tone; text: HealthText; ageSec: number | null; block: string | null; lag: number | null; okb: string | null }`; `healthRows(h: HealthResponse, nowMs: number): HealthRow[]`; `okbText(wei: bigint): string`; `formatAge(sec: number, lang: Lang): string`.
  - `src/content/sdk-snippet.ts`: `SDK_SNIPPET` (10 dòng).
  - `src/lib/route-suggest.ts`: `type Suggestion = { kind: 'vault'; address: string } | { kind: 'route'; path: string }`; `levenshtein(a, b): number`; `suggestFor(pathname: string): Suggestion | null`.
  - Test id: `status-integrity` (`data-ok`), `status-warning-<code>`, `status-rpc-<i>` (`data-ok`), `status-backend-off`, `status-backend-none`, `status-health-<id>` (`data-tone`), `status-crosscheck`, `status-wallets`, `status-diagnostics`; `dev-contract-<id>`; `not-found-suggest`, `not-found-vault`.

- [ ] **Step 1: Test phần thuần**

`apps/web/test/unit/diagnostics.test.ts` (port từ web cũ, đổi đường dẫn import):

```ts
import { type IntegrityReport, VERSION } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { buildDiagnostics, pageUrl, probeRpc } from '../../src/app/status/impl/diagnostics';

const REPORT: IntegrityReport = {
  ok: false,
  chainId: 196,
  blockNumber: 123n,
  blockTimestamp: 1_000n,
  rpcs: 1,
  checks: [
    { name: 'factory.cpu', ok: true },
    { name: 'vaultImpl.codehash', ok: false, expected: '0xab', actual: '0xcd' },
  ],
  warnings: [{ code: 'SINGLE_RPC', message: 'Only one RPC operator was used.' }] as IntegrityReport['warnings'],
};

const base = {
  appVersion: '1.2.3',
  target: 'deweb' as const,
  href: 'https://atropyle.example/status/?ref=x#t=c2VjcmV0',
  chainId: 196,
  integrity: REPORT,
  integrityError: null,
  probes: [{ url: 'https://rpc.xlayer.tech', ok: true, ms: 42, block: 123n, error: null }],
  wallets: ['OKX Wallet', '\u{202E}evil'],
  crossCheck: false,
  lang: 'vi' as const,
};

describe('diagnostics', () => {
  it('pageUrl drops the query and the hash', () => {
    expect(pageUrl('https://atropyle.example/sign/?a=1#p=abc')).toBe('https://atropyle.example/sign/');
  });

  it('probeRpc times a good node and reports a dead one', async () => {
    const ticks = [10, 52];
    const now = () => ticks.shift() ?? 0;
    expect(await probeRpc('https://a', async () => 7n, now)).toEqual({
      url: 'https://a',
      ok: true,
      ms: 42,
      block: 7n,
      error: null,
    });
    expect(
      await probeRpc('https://b', async () => {
        throw new Error('down');
      }),
    ).toEqual({ url: 'https://b', ok: false, ms: null, block: null, error: 'UNKNOWN' });
  });

  it('buildDiagnostics has only the agreed fields and no wallet address or hash', () => {
    const text = buildDiagnostics(base);
    const d = JSON.parse(text);
    expect(Object.keys(d)).toEqual([
      'app',
      'sdk',
      'target',
      'page',
      'chainId',
      'block',
      'rpcs',
      'integrity',
      'wallets',
      'crossCheck',
      'lang',
    ]);
    expect(d).toMatchObject({
      app: '1.2.3',
      sdk: VERSION,
      target: 'deweb',
      page: 'https://atropyle.example/status/',
      chainId: 196,
      block: '123',
      rpcs: [{ url: 'https://rpc.xlayer.tech', ok: true, ms: 42, block: '123', error: null }],
      integrity: { ok: false, rpcs: 1, failed: ['vaultImpl.codehash'], warnings: ['SINGLE_RPC'] },
      wallets: ['OKX Wallet', 'evil'],
      crossCheck: false,
      lang: 'vi',
    });
    expect(text).not.toContain('#');
    expect(text).not.toContain('c2VjcmV0');
    expect(text).not.toMatch(/0x[0-9a-fA-F]{40}/);
    const failed = JSON.parse(
      buildDiagnostics({ ...base, integrity: null, integrityError: new Error('boom'), probes: null }),
    );
    expect(failed).toMatchObject({ block: null, rpcs: [], integrity: { error: 'UNKNOWN' } });
  });
});
```

`apps/web/test/unit/health.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { HealthResponse } from '../../src/api/types';
import { formatAge, healthRows, okbText } from '../../src/app/status/health';

const NOW = Date.parse('2026-11-23T12:00:00.000Z');
const ago = (sec: number) => new Date(NOW - sec * 1000).toISOString();
const GOOD: HealthResponse = {
  indexer: { block: '5000', lagBlocks: 3, updatedAt: ago(60) },
  integrity: { at: ago(600), block: '4990', ok: true },
  keeper: { lastRunAt: ago(120), balanceWei: '20000000000000000', dryRun: false },
};
const tones = (h: HealthResponse) => healthRows(h, NOW).map((r) => `${r.id} ${r.tone} ${r.text}`);

describe('backend health', () => {
  it('reads fresh reports as fine', () => {
    expect(tones(GOOD)).toEqual([
      'indexer ok indexerFresh',
      'integrity ok integrityFresh',
      'keeper ok keeperFresh',
    ]);
    expect(healthRows(GOOD, NOW)[2]).toMatchObject({ ageSec: 120, okb: '0.0200' });
  });

  it('flags stale, lagging, failed, dry-run and low-gas reports, and missing ones as unknown', () => {
    expect(tones({ ...GOOD, indexer: { ...GOOD.indexer, updatedAt: ago(301) } })[0]).toBe('indexer warn indexerStale');
    expect(tones({ ...GOOD, indexer: { ...GOOD.indexer, lagBlocks: 101 } })[0]).toBe('indexer warn indexerLagging');
    expect(tones({ ...GOOD, integrity: { ...GOOD.integrity!, ok: false } })[1]).toBe('integrity bad integrityFailed');
    expect(tones({ ...GOOD, integrity: { ...GOOD.integrity!, at: ago(1801) } })[1]).toBe('integrity warn integrityStale');
    expect(tones({ ...GOOD, keeper: { ...GOOD.keeper!, dryRun: true } })[2]).toBe('keeper warn keeperDryRun');
    expect(tones({ ...GOOD, keeper: { ...GOOD.keeper!, lastRunAt: ago(301) } })[2]).toBe('keeper warn keeperStale');
    expect(tones({ ...GOOD, keeper: { ...GOOD.keeper!, balanceWei: '4999999999999999' } })[2]).toBe(
      'keeper warn keeperLowGas',
    );
    expect(tones({ ...GOOD, integrity: null, keeper: null }).slice(1)).toEqual([
      'integrity unknown healthNone',
      'keeper unknown healthNone',
    ]);
    expect(tones({ ...GOOD, indexer: { ...GOOD.indexer, updatedAt: 'garbage' } })[0]).toBe('indexer unknown healthNone');
  });

  it('formats gas and ages for people', () => {
    expect(okbText(1_234_567_000_000_000_000n)).toBe('1.2345');
    expect(formatAge(45, 'en')).toBe('45 seconds');
    expect(formatAge(130, 'en')).toBe('2 minutes');
    expect(formatAge(7200, 'vi')).toBe('2 giờ');
  });
});
```

`apps/web/test/unit/sdk-snippet.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import * as sdk from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { SDK_SNIPPET } from '../../src/content/sdk-snippet';

const quickstart = readFileSync(new URL('../../../../examples/node-quickstart/index.mjs', import.meta.url), 'utf8');

describe('the SDK snippet on /developers/', () => {
  it('is ten lines that call the real SDK the way the node quickstart does', () => {
    expect(SDK_SNIPPET.split('\n')).toHaveLength(10);
    expect(SDK_SNIPPET).toContain("import { createAtropyle } from '@atropyle/sdk';");
    const atro = sdk.createAtropyle({ chain: 'xlayer' });
    const vault = atro.vault('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');
    expect(typeof vault.status).toBe('function');
    expect(typeof vault.prepare).toBe('function');
    expect(typeof atro.handoff.link).toBe('function');
    for (const call of ['vault.status()', "vault.prepare({ type: 'checkIn' }", 'atro.handoff.link(tx)']) {
      expect(SDK_SNIPPET).toContain(call);
      expect(quickstart).toContain(call);
    }
  });
});
```

`apps/web/test/unit/route-suggest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { levenshtein, suggestFor } from '../../src/lib/route-suggest';

const V = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

describe('404 suggestions', () => {
  it('offer the vault for a path holding an address, and the nearest page for a typo', () => {
    expect(levenshtein('prof', 'proof')).toBe(1);
    expect(suggestFor(`/${V}`)).toEqual({ kind: 'vault', address: V });
    expect(suggestFor(`/vaults/${V}/`)).toEqual({ kind: 'vault', address: V });
    expect(suggestFor('/prof/')).toEqual({ kind: 'route', path: '/proof/' });
    expect(suggestFor('/Develpers')).toEqual({ kind: 'route', path: '/developers/' });
    expect(suggestFor('/alerts/confrim/')).toEqual({ kind: 'route', path: '/alerts/confirm/' });
  });

  it('offer nothing when no page is close', () => {
    expect(suggestFor('/')).toBeNull();
    expect(suggestFor('/wp-admin/setup.php')).toBeNull();
    expect(suggestFor(`/${'x'.repeat(500)}`)).toBeNull();
  });
});
```

Run: `npm test -w apps/web -- diagnostics health sdk-snippet route-suggest`
Expected: FAIL, không tìm thấy các module.

- [ ] **Step 2: Phần thuần**

`apps/web/src/app/status/impl/diagnostics.ts` (port `apps/web-legacy/src/lib/diagnostics.ts`; chỉ đổi ba import kiểu):

```ts
import { decodeError, type IntegrityReport, VERSION as SDK_VERSION, stringify, untrusted } from '@atropyle/sdk';
import { createPublicClient, http } from 'viem';
import type { RpcPlan } from '@/chain/types';
import type { Target } from '@/config/env';
import type { Lang } from '@/i18n/core';

export interface RpcProbe {
  url: string;
  ok: boolean;
  ms: number | null;
  block: bigint | null;
  /** Error code from the SDK decoder; null when the node answered. */
  error: string | null;
}

/** One eth_blockNumber per URL, with no retry, so a dead node shows up at once. */
export async function rpcBlockNumber(url: string): Promise<bigint> {
  const client = createPublicClient({ transport: http(url, { retryCount: 0, timeout: 5_000 }) });
  return client.getBlockNumber({ cacheTime: 0 });
}

/** Every URL the page reads or verifies through, once each, in plan order. */
export function rpcUrlsOf(rpc: RpcPlan): string[] {
  return [...new Set([...rpc.read, ...rpc.verify.flat()])];
}

export async function probeRpc(
  url: string,
  blockNumber: (url: string) => Promise<bigint>,
  now: () => number = () => performance.now(),
): Promise<RpcProbe> {
  const start = now();
  try {
    const block = await blockNumber(url);
    return { url, ok: true, ms: Math.round(now() - start), block, error: null };
  } catch (e) {
    return { url, ok: false, ms: null, block: null, error: decodeError(e).code };
  }
}

export function probeAll(urls: readonly string[], blockNumber: (url: string) => Promise<bigint>): Promise<RpcProbe[]> {
  return Promise.all(urls.map((u) => probeRpc(u, blockNumber)));
}

/** Origin and path only: the hash can hold a payload to sign or an email token. */
export function pageUrl(href: string): string {
  const u = new URL(href);
  return `${u.origin}${u.pathname}`;
}

export interface DiagnosticsInput {
  appVersion: string;
  target: Target;
  href: string;
  chainId: number;
  integrity: IntegrityReport | null;
  integrityError: unknown;
  probes: readonly RpcProbe[] | null;
  /** Names announced by wallet extensions: untrusted text. */
  wallets: readonly string[];
  crossCheck: boolean;
  lang: Lang;
}

/** The text behind "Copy diagnostics". No wallet address and no URL hash; the user decides whether to share it. */
export function buildDiagnostics(i: DiagnosticsInput): string {
  const integrity = i.integrity
    ? {
        ok: i.integrity.ok,
        rpcs: i.integrity.rpcs,
        failed: i.integrity.checks.filter((c) => !c.ok).map((c) => c.name),
        warnings: i.integrity.warnings.map((w) => w.code),
      }
    : i.integrityError
      ? { error: decodeError(i.integrityError).code }
      : null;
  return stringify(
    {
      app: i.appVersion,
      sdk: SDK_VERSION,
      target: i.target,
      page: pageUrl(i.href),
      chainId: i.chainId,
      block: i.integrity?.blockNumber ?? null,
      rpcs: (i.probes ?? []).map((p) => ({ url: p.url, ok: p.ok, ms: p.ms, block: p.block, error: p.error })),
      integrity,
      wallets: i.wallets.map((w) => untrusted(w, 32).value),
      crossCheck: i.crossCheck,
      lang: i.lang,
    },
    2,
  );
}
```

`apps/web/src/app/status/health.ts`:

```ts
import type { HealthResponse } from '@/api/types';
import type { Lang } from '@/i18n/core';

export const INDEXER_STALE_SEC = 300;
export const INDEXER_LAG_BLOCKS = 100;
export const INTEGRITY_STALE_SEC = 1800;
export const KEEPER_STALE_SEC = 300;
/** 0.005 OKB. */
export const KEEPER_LOW_WEI = 5_000_000_000_000_000n;

export type HealthId = 'indexer' | 'integrity' | 'keeper';
export type HealthTone = 'ok' | 'warn' | 'bad' | 'unknown';
export type HealthText =
  | 'indexerFresh'
  | 'indexerStale'
  | 'indexerLagging'
  | 'integrityFresh'
  | 'integrityStale'
  | 'integrityFailed'
  | 'keeperFresh'
  | 'keeperStale'
  | 'keeperDryRun'
  | 'keeperLowGas'
  | 'healthNone';

export interface HealthRow {
  id: HealthId;
  tone: HealthTone;
  text: HealthText;
  ageSec: number | null;
  block: string | null;
  lag: number | null;
  okb: string | null;
}

const ageOf = (iso: string, nowMs: number): number | null => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((nowMs - t) / 1000));
};

const weiOf = (s: string): bigint | null => {
  try {
    return BigInt(s);
  } catch {
    return null;
  }
};

/** Four decimals, rounded down: 1234567000000000000n → "1.2345". */
export function okbText(wei: bigint): string {
  const unit = 10n ** 18n;
  return `${wei / unit}.${((wei % unit) / 10n ** 14n).toString().padStart(4, '0')}`;
}

/** "2 minutes", "2 giờ": the largest whole unit, rounded down. */
export function formatAge(sec: number, lang: Lang): string {
  const [value, unit] =
    sec < 60
      ? [sec, 'second']
      : sec < 3600
        ? [Math.floor(sec / 60), 'minute']
        : sec < 86_400
          ? [Math.floor(sec / 3600), 'hour']
          : [Math.floor(sec / 86_400), 'day'];
  return new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'en-US', { style: 'unit', unit, unitDisplay: 'long' }).format(
    value,
  );
}

const none = (id: HealthId): HealthRow => ({
  id,
  tone: 'unknown',
  text: 'healthNone',
  ageSec: null,
  block: null,
  lag: null,
  okb: null,
});

/** Quyết định 17 of Plan 7C. The thresholds only colour a row; nothing on the site depends on them. */
export function healthRows(h: HealthResponse, nowMs: number): HealthRow[] {
  const rows: HealthRow[] = [];

  const ia = ageOf(h.indexer.updatedAt, nowMs);
  if (ia === null) rows.push(none('indexer'));
  else {
    const base = { id: 'indexer' as const, ageSec: ia, block: h.indexer.block, lag: h.indexer.lagBlocks, okb: null };
    if (ia > INDEXER_STALE_SEC) rows.push({ ...base, tone: 'warn', text: 'indexerStale' });
    else if (h.indexer.lagBlocks > INDEXER_LAG_BLOCKS) rows.push({ ...base, tone: 'warn', text: 'indexerLagging' });
    else rows.push({ ...base, tone: 'ok', text: 'indexerFresh' });
  }

  const ig = h.integrity;
  const ga = ig ? ageOf(ig.at, nowMs) : null;
  if (!ig || ga === null) rows.push(none('integrity'));
  else {
    const base = { id: 'integrity' as const, ageSec: ga, block: ig.block, lag: null, okb: null };
    if (!ig.ok) rows.push({ ...base, tone: 'bad', text: 'integrityFailed' });
    else if (ga > INTEGRITY_STALE_SEC) rows.push({ ...base, tone: 'warn', text: 'integrityStale' });
    else rows.push({ ...base, tone: 'ok', text: 'integrityFresh' });
  }

  const k = h.keeper;
  const ka = k ? ageOf(k.lastRunAt, nowMs) : null;
  const wei = k ? weiOf(k.balanceWei) : null;
  if (!k || ka === null || wei === null) rows.push(none('keeper'));
  else {
    const base = { id: 'keeper' as const, ageSec: ka, block: null, lag: null, okb: okbText(wei) };
    if (k.dryRun) rows.push({ ...base, tone: 'warn', text: 'keeperDryRun' });
    else if (ka > KEEPER_STALE_SEC) rows.push({ ...base, tone: 'warn', text: 'keeperStale' });
    else if (wei < KEEPER_LOW_WEI) rows.push({ ...base, tone: 'warn', text: 'keeperLowGas' });
    else rows.push({ ...base, tone: 'ok', text: 'keeperFresh' });
  }
  return rows;
}
```

`apps/web/src/content/sdk-snippet.ts`:

```ts
/** Shown on /developers/. sdk-snippet.test.ts runs its calls against the real SDK and the node quickstart. */
export const SDK_SNIPPET = `import { createAtropyle } from '@atropyle/sdk';

const atro = createAtropyle({ chain: 'xlayer' });
const vault = atro.vault('0xYourVaultAddress');

const status = await vault.status();
console.log(status.state, status.pending);

const tx = await vault.prepare({ type: 'checkIn' }, { as: '0xOwnerAddress' });
console.log(atro.handoff.link(tx)); // the owner opens it and signs in their own wallet`;
```

`apps/web/src/lib/route-suggest.ts`:

```ts
import { ROUTES } from '@/routes';

export type Suggestion = { kind: 'vault'; address: string } | { kind: 'route'; path: string };

const PAGES = Object.values(ROUTES).filter((p) => p !== '/');
const MAX_DISTANCE = 3;
const ADDRESS = /0x[0-9a-fA-F]{40}/;

export function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** For the 404 page: a vault for a path that holds an address, else the nearest page within three edits. */
export function suggestFor(pathname: string): Suggestion | null {
  const address = ADDRESS.exec(pathname)?.[0];
  if (address) return { kind: 'vault', address };
  const wanted = pathname.toLowerCase().replace(/\.html$/, '').replace(/^\/+|\/+$/g, '');
  if (wanted === '' || wanted.length > 40) return null;
  let best: string | null = null;
  let bestDistance = MAX_DISTANCE + 1;
  for (const page of PAGES) {
    const d = levenshtein(wanted, page.slice(1, -1));
    if (d < bestDistance) {
      best = page;
      bestDistance = d;
    }
  }
  return best ? { kind: 'route', path: best } : null;
}
```

Run: `npm test -w apps/web -- diagnostics health sdk-snippet route-suggest`
Expected: PASS (3 + 3 + 1 + 2 test). `formatAge` dùng ICU đầy đủ của Node 24 (có `vi`).

- [ ] **Step 3: Chuỗi giao diện**

`apps/web/src/messages/status.messages.ts`:

```ts
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    title: 'Status',
    lead: 'Check the contracts, the nodes this page reads through and, on the hosted site, the Atropyle backend. Every check here runs in your browser.',
    loading: 'Checking…',
    integrityTitle: 'Contracts on the chain',
    integrityLead: 'The factory, the vault code and the circuit binding, compared with the deployment record this site was built with.',
    integrityOk: 'Everything matches',
    integrityBad: 'Something does not match',
    integrityAt: 'At block {block}, through {rpcs} node operators.',
    colCheck: 'Check',
    colResult: 'Result',
    colExpected: 'Expected',
    colActual: 'Found',
    pass: 'Pass',
    fail: 'Fail',
    rpcTitle: 'Nodes',
    rpcLead: 'Each node this page reads through, asked once for its latest block.',
    colRpc: 'Node',
    colBlock: 'Block',
    colMs: 'Time (ms)',
    reachable: 'Reachable',
    recheck: 'Check again',
    crossTitle: 'Cross-check',
    crossLabel: 'Also confirm every read with nodes run by other operators',
    crossWarning: 'Off by default: this copy of the site talks only to the X Layer nodes it was published with, so it stays 100% on-chain. Turning it on also asks the nodes below.',
    offchainList: 'Other nodes used when cross-check is on:',
    backendTitle: 'Atropyle backend',
    backendOff: 'This copy of the site has no backend: no email alerts and no index, and nothing here depends on one.',
    backendNone: 'This build has no backend address set.',
    healthIndexer: 'Index',
    healthIntegrity: 'Daily contract check',
    healthKeeper: 'Keeper',
    indexerFresh: 'Up to date at block {block}, {lag} blocks behind the chain.',
    indexerStale: 'Last updated {age} ago.',
    indexerLagging: '{lag} blocks behind the chain.',
    integrityFresh: 'Passed {age} ago, at block {block}.',
    integrityStale: 'Last run {age} ago.',
    integrityFailed: 'The last run found a mismatch at block {block}.',
    keeperFresh: 'Last ran {age} ago. Gas left: {okb} OKB.',
    keeperStale: 'Last ran {age} ago.',
    keeperDryRun: 'Running in test mode: it checks vaults but sends no transaction.',
    keeperLowGas: 'Low on gas: {okb} OKB left.',
    healthNone: 'No report yet.',
    toneOk: 'OK',
    toneWarn: 'Attention',
    toneBad: 'Problem',
    toneUnknown: 'Unknown',
    diagTitle: 'Diagnostics',
    diagLead: 'If something does not work, copy this and send it with your report. It holds no wallet address and nothing that follows the page’s path.',
    walletsSeen: 'Wallets this browser announced:',
    walletsNone: 'none',
    copy: 'Copy diagnostics',
    diagShow: 'Show what will be copied',
  },
  {
    title: 'Trạng thái',
    lead: 'Kiểm tra hợp đồng, các node mà trang này đọc qua, và backend của Atropyle trên site hosted. Mọi phép kiểm ở đây chạy trong trình duyệt của bạn.',
    loading: 'Đang kiểm…',
    integrityTitle: 'Hợp đồng trên chain',
    integrityLead: 'Factory, mã vault và liên kết circuit, so với bản ghi deployment mà site này được build cùng.',
    integrityOk: 'Mọi thứ đều khớp',
    integrityBad: 'Có chỗ không khớp',
    integrityAt: 'Tại block {block}, qua {rpcs} nhà vận hành node.',
    colCheck: 'Mục kiểm',
    colResult: 'Kết quả',
    colExpected: 'Mong đợi',
    colActual: 'Thực tế',
    pass: 'Đạt',
    fail: 'Hỏng',
    rpcTitle: 'Node',
    rpcLead: 'Mỗi node mà trang này đọc qua, được hỏi một lần block mới nhất.',
    colRpc: 'Node',
    colBlock: 'Block',
    colMs: 'Thời gian (ms)',
    reachable: 'Kết nối được',
    recheck: 'Kiểm lại',
    crossTitle: 'Kiểm chéo',
    crossLabel: 'Xác nhận thêm mọi lần đọc với node của các nhà vận hành khác',
    crossWarning: 'Mặc định tắt: bản site này chỉ nói chuyện với các node X Layer mà nó được xuất bản cùng, nên vẫn 100% on-chain. Bật lên thì trang hỏi thêm các node bên dưới.',
    offchainList: 'Các node khác được dùng khi bật kiểm chéo:',
    backendTitle: 'Backend của Atropyle',
    backendOff: 'Bản site này không có backend: không có cảnh báo email, không có chỉ mục, và không gì ở đây phụ thuộc vào backend.',
    backendNone: 'Bản build này chưa đặt địa chỉ backend.',
    healthIndexer: 'Chỉ mục',
    healthIntegrity: 'Kiểm hợp đồng hằng ngày',
    healthKeeper: 'Keeper',
    indexerFresh: 'Đã cập nhật tới block {block}, chậm hơn chain {lag} block.',
    indexerStale: 'Cập nhật lần cuối cách đây {age}.',
    indexerLagging: 'Chậm hơn chain {lag} block.',
    integrityFresh: 'Đạt cách đây {age}, tại block {block}.',
    integrityStale: 'Chạy lần cuối cách đây {age}.',
    integrityFailed: 'Lần chạy cuối thấy chỗ không khớp tại block {block}.',
    keeperFresh: 'Chạy lần cuối cách đây {age}. Gas còn: {okb} OKB.',
    keeperStale: 'Chạy lần cuối cách đây {age}.',
    keeperDryRun: 'Đang chạy chế độ thử: kiểm các vault nhưng không gửi giao dịch nào.',
    keeperLowGas: 'Sắp hết gas: còn {okb} OKB.',
    healthNone: 'Chưa có báo cáo.',
    toneOk: 'Ổn',
    toneWarn: 'Cần chú ý',
    toneBad: 'Có vấn đề',
    toneUnknown: 'Chưa rõ',
    diagTitle: 'Chẩn đoán',
    diagLead: 'Nếu có gì không chạy, hãy chép phần này và gửi kèm báo lỗi. Nó không chứa địa chỉ ví nào và không chứa gì đứng sau đường dẫn của trang.',
    walletsSeen: 'Các ví trình duyệt này đã báo:',
    walletsNone: 'không có',
    copy: 'Chép chẩn đoán',
    diagShow: 'Xem nội dung sẽ được chép',
  },
);
```

`apps/web/src/messages/developers.messages.ts`:

```ts
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    title: 'Developers',
    lead: 'Atropyle is open source. Read any vault, simulate its rules, prepare transactions for a wallet to sign, or prove the circuit yourself. Nothing in these tools holds a key.',
    installTitle: 'Install',
    sdkTitle: 'SDK',
    sdkHelp: 'TypeScript for Node.js and browsers: read, simulate, verify and prepare. It never signs.',
    verifyTitle: 'Prove the circuit',
    verifyHelp: 'Checks all 67,108,864 cases of the policy against the chain, from your terminal.',
    mcpTitle: 'MCP server',
    mcpHelp: 'For any agent that speaks MCP over stdio. It prepares transactions; your wallet signs them.',
    pluginTitle: 'Claude Code plugin',
    pluginHelp: 'The two Agent Skills and the MCP server in one install.',
    skillsTitle: 'Agent Skills',
    skillsHelp: 'The estate-planning and guardian skills, for other agents.',
    snippetTitle: 'Read a vault in ten lines',
    snippetHelp: 'Reads the state, prepares a check-in and prints a link the owner opens in their own wallet.',
    copyCommand: 'Copy the command',
    copyCode: 'Copy the code',
    contractsTitle: 'Contracts',
    contractsLead: 'This site reads these addresses on {network}.',
    contractsLoading: 'Reading the deployment record…',
    factory: 'Factory',
    vaultImpl: 'Vault implementation',
    cpu: 'TapeOut processor',
    treasury: 'Treasury',
    feeToken: 'Fee token',
    linksTitle: 'Links',
    repo: 'Source code on GitHub',
    docs: 'Documentation',
    npm: '{name} on npm',
    license: 'License',
    version: 'This site is version {version}.',
  },
  {
    title: 'Nhà phát triển',
    lead: 'Atropyle là mã nguồn mở. Đọc bất kỳ vault nào, mô phỏng luật của nó, chuẩn bị giao dịch để ví ký, hoặc tự chứng minh circuit. Không công cụ nào ở đây giữ khoá.',
    installTitle: 'Cài đặt',
    sdkTitle: 'SDK',
    sdkHelp: 'TypeScript cho Node.js và trình duyệt: đọc, mô phỏng, kiểm chứng và chuẩn bị. Nó không bao giờ ký.',
    verifyTitle: 'Chứng minh circuit',
    verifyHelp: 'Kiểm cả 67.108.864 trường hợp của policy so với chain, ngay trong terminal của bạn.',
    mcpTitle: 'MCP server',
    mcpHelp: 'Cho mọi agent dùng MCP qua stdio. Nó chuẩn bị giao dịch; ví của bạn ký.',
    pluginTitle: 'Plugin cho Claude Code',
    pluginHelp: 'Hai Agent Skill và MCP server trong một lần cài.',
    skillsTitle: 'Agent Skills',
    skillsHelp: 'Skill lập kế hoạch thừa kế và skill người giám hộ, cho các agent khác.',
    snippetTitle: 'Đọc một vault trong mười dòng',
    snippetHelp: 'Đọc trạng thái, chuẩn bị một lần check-in và in ra link để chủ vault mở trong ví của chính họ.',
    copyCommand: 'Chép lệnh',
    copyCode: 'Chép mã',
    contractsTitle: 'Hợp đồng',
    contractsLead: 'Site này đọc các địa chỉ sau trên {network}.',
    contractsLoading: 'Đang đọc bản ghi deployment…',
    factory: 'Factory',
    vaultImpl: 'Mã vault',
    cpu: 'Bộ xử lý TapeOut',
    treasury: 'Ngân quỹ',
    feeToken: 'Token phí',
    linksTitle: 'Liên kết',
    repo: 'Mã nguồn trên GitHub',
    docs: 'Tài liệu',
    npm: '{name} trên npm',
    license: 'Giấy phép',
    version: 'Site này là phiên bản {version}.',
  },
);
```

`apps/web/src/messages/privacy.messages.ts`:

```ts
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    title: 'Privacy',
    lead: 'Atropyle is built to know as little about you as possible. This is everything it keeps, and where.',
    siteTitle: 'This website',
    site1: 'No cookies, no analytics, no trackers, and no fonts or scripts from other companies.',
    site2: 'Your language, theme and settings stay in this browser’s storage, on your device only.',
    site3: 'Pages read the blockchain through public X Layer nodes. Like any website, those nodes see your IP address and which vaults are read.',
    walletTitle: 'Your wallet',
    wallet1: 'Connecting a wallet shares only its public address with this page. Atropyle never asks for, sees or stores a private key or seed phrase.',
    wallet2: 'Every transaction is shown to you first and signed in your own wallet.',
    emailTitle: 'Email alerts, on the hosted site only',
    email1: 'If you sign up, we keep your email address, the vault, your role, your language, whether you confirmed, and when.',
    email2: 'The links in our emails carry one-time codes. We keep only a hash of each code, never the code.',
    email3: 'A sign-up you do not confirm within 48 hours is deleted.',
    email4: 'To stop abuse we keep a keyed hash of your IP address or email address for 24 hours, never the address itself.',
    email5: 'The data is stored with Supabase in Southeast Asia (Singapore), and the emails are sent through Resend.',
    email6: 'Every email has a link to stop alerts.',
    meTitle: 'Your vault list',
    me1: 'On the hosted site, the list of your vaults may start from the Atropyle index, asked with your public address. Every entry is checked on the chain before it shows.',
    onchainTitle: 'The on-chain copy',
    onchain1: 'The copy of this site served from X Layer has no backend at all: no email alerts, no index, and no server of ours that sees you.',
    contactTitle: 'Questions',
    contact1: 'Open an issue on GitHub. Do not post a private key, a seed phrase or an email address there.',
    contactLink: 'Atropyle on GitHub',
  },
  {
    title: 'Quyền riêng tư',
    lead: 'Atropyle được làm để biết về bạn ít nhất có thể. Đây là mọi thứ nó giữ, và giữ ở đâu.',
    siteTitle: 'Website này',
    site1: 'Không cookie, không analytics, không tracker, không font hay script của công ty khác.',
    site2: 'Ngôn ngữ, giao diện và cài đặt của bạn nằm trong bộ nhớ của trình duyệt này, chỉ trên thiết bị của bạn.',
    site3: 'Các trang đọc blockchain qua node X Layer công khai. Như mọi website, các node đó thấy địa chỉ IP của bạn và vault nào được đọc.',
    walletTitle: 'Ví của bạn',
    wallet1: 'Kết nối ví chỉ chia sẻ địa chỉ công khai của ví với trang này. Atropyle không bao giờ hỏi, thấy hay lưu private key hay seed phrase.',
    wallet2: 'Mọi giao dịch đều được cho bạn xem trước và được ký trong chính ví của bạn.',
    emailTitle: 'Cảnh báo email, chỉ trên site hosted',
    email1: 'Nếu bạn đăng ký, chúng tôi giữ địa chỉ email, vault, vai trò, ngôn ngữ của bạn, việc bạn đã xác nhận chưa, và thời điểm.',
    email2: 'Link trong email mang mã dùng một lần. Chúng tôi chỉ giữ hash của mỗi mã, không bao giờ giữ mã.',
    email3: 'Đăng ký không được xác nhận trong 48 giờ sẽ bị xoá.',
    email4: 'Để chống lạm dụng, chúng tôi giữ một hash có khoá của địa chỉ IP hoặc email trong 24 giờ, không bao giờ giữ chính địa chỉ.',
    email5: 'Dữ liệu được lưu ở Supabase vùng Đông Nam Á (Singapore), và email được gửi qua Resend.',
    email6: 'Mỗi email đều có link để ngừng cảnh báo.',
    meTitle: 'Danh sách vault của bạn',
    me1: 'Trên site hosted, danh sách vault của bạn có thể bắt đầu từ chỉ mục của Atropyle, được hỏi bằng địa chỉ công khai của bạn. Mỗi mục đều được kiểm trên chain trước khi hiện.',
    onchainTitle: 'Bản on-chain',
    onchain1: 'Bản site được phục vụ từ X Layer không có backend nào: không cảnh báo email, không chỉ mục, và không máy chủ nào của chúng tôi thấy bạn.',
    contactTitle: 'Câu hỏi',
    contact1: 'Hãy mở một issue trên GitHub. Đừng đăng private key, seed phrase hay địa chỉ email ở đó.',
    contactLink: 'Atropyle trên GitHub',
  },
);
```

`apps/web/src/messages/not-found.messages.ts`:

```ts
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    didYouMean: 'Did you mean',
    looksLikeVault: 'This address looks like a vault. Open it instead?',
    openVault: 'Open the vault',
    verifyVault: 'Verify the vault',
  },
  {
    didYouMean: 'Có phải bạn muốn mở',
    looksLikeVault: 'Địa chỉ này trông như một vault. Mở nó thay vào đó?',
    openVault: 'Mở vault',
    verifyVault: 'Kiểm chứng vault',
  },
);
```

Các câu ở trang quyền riêng tư dựa trên mã backend đã đọc (mục "Đã kiểm"): bảng `subscriptions`, hash của token, xoá đăng ký chưa xác nhận sau 48 giờ, khoá rate limit HMAC xoá sau 24 giờ, vùng Singapore. Nếu Plan 8 đổi một điều trong số đó trước khi merge, sửa câu tương ứng ở đây trong cùng PR.

- [ ] **Step 4: Trang `/status/`**

`apps/web/src/app/status/status-page.tsx`:

```tsx
'use client';

import { skipToken, useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useHealth } from '@/api/hooks';
import { CHAIN_ID, useSdk } from '@/chain/hooks';
import { useChainSettings } from '@/chain/provider';
import { ENV, IS_VERCEL } from '@/config/env';
import type { Params } from '@/i18n/core';
import { useLang, useT } from '@/i18n/provider';
import { formatCount } from '@/lib/count';
import { cn } from '@/lib/cn';
import { messages as status } from '@/messages/status.messages';
import { ErrorBox } from '@/tx/error-box';
import { uniqueWarnings, warningKey } from '@/tx/tx-view';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { CopyButton } from '@/ui/copy-button';
import { Spinner } from '@/ui/spinner';
import { UntrustedText } from '@/ui/untrusted-text';
import { useWallet } from '@/wallet/provider';
import { formatAge, type HealthRow, type HealthTone, healthRows } from './health';
import type * as Diag from './impl/diagnostics';

const TONE_KEY = { ok: 'toneOk', warn: 'toneWarn', bad: 'toneBad', unknown: 'toneUnknown' } as const;
const TONE_CLASS: Record<HealthTone, string> = {
  ok: 'text-alive',
  warn: 'text-grace',
  bad: 'text-danger',
  unknown: 'text-ink-muted',
};
const HEALTH_TITLE = { indexer: 'healthIndexer', integrity: 'healthIntegrity', keeper: 'healthKeeper' } as const;

function Card({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-line bg-surface-1 p-5 md:p-6">
      <h2 className="font-display text-title">{title}</h2>
      {lead ? <p className="text-ink-muted text-small">{lead}</p> : null}
      {children}
    </section>
  );
}

function Verdict({ ok }: { ok: boolean }) {
  const t = useT(status);
  return <span className={cn('font-medium', ok ? 'text-alive' : 'text-danger')}>{ok ? t('pass') : t('fail')}</span>;
}

function HealthList({ rows }: { rows: readonly HealthRow[] }) {
  const t = useT(status);
  const { lang } = useLang();
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => {
        const p: Params = {};
        if (r.ageSec !== null) p.age = formatAge(r.ageSec, lang);
        if (r.block !== null) p.block = formatCount(BigInt(r.block), lang);
        if (r.lag !== null) p.lag = formatCount(r.lag, lang);
        if (r.okb !== null) p.okb = r.okb;
        return (
          <li key={r.id} data-testid={`status-health-${r.id}`} data-tone={r.tone} className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <span className="font-medium">{t(HEALTH_TITLE[r.id])}</span>
              <span className={cn('text-small', TONE_CLASS[r.tone])}>{t(TONE_KEY[r.tone])}</span>
            </span>
            <span className="text-ink-muted text-small">{t(r.text, p)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function StatusPage() {
  const t = useT(status);
  const { lang } = useLang();
  const sdk = useSdk();
  const s = sdk.data;
  const { crossCheck, setCrossCheck } = useChainSettings();
  const { wallets, discover } = useWallet();
  const health = useHealth();
  const [impl, setImpl] = useState<typeof Diag | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    let live = true;
    import('./impl/diagnostics').then(
      (m) => {
        if (live) setImpl(m);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (asked.current || wallets !== null) return;
    asked.current = true;
    discover().catch(() => undefined);
  }, [wallets, discover]);

  const integrity = useQuery({
    queryKey: ['atropyle', CHAIN_ID, 'status', 'integrity', crossCheck],
    queryFn: s ? () => s.atro.integrity() : skipToken,
    staleTime: 0,
  });
  const probes = useQuery({
    queryKey: ['atropyle', CHAIN_ID, 'status', 'probes', crossCheck],
    queryFn: s && impl ? () => impl.probeAll(impl.rpcUrlsOf(s.rpc), impl.rpcBlockNumber) : skipToken,
    retry: false,
    staleTime: 0,
  });

  const names = (wallets ?? []).map((w) => w.name);
  const text =
    impl && s
      ? impl.buildDiagnostics({
          appVersion: ENV.version,
          target: ENV.target,
          href: window.location.href,
          chainId: s.deployment.chainId,
          integrity: integrity.data ?? null,
          integrityError: integrity.error ?? null,
          probes: probes.data ?? null,
          wallets: names,
          crossCheck,
          lang,
        })
      : null;

  let backend: ReactNode;
  if (!IS_VERCEL) backend = <p data-testid="status-backend-off">{t('backendOff')}</p>;
  else if (health.data) backend = <HealthList rows={healthRows(health.data, health.dataUpdatedAt)} />;
  else if (health.isError) backend = <ErrorBox error={health.error} onRetry={() => void health.refetch()} />;
  else if (health.fetchStatus === 'idle') backend = <p data-testid="status-backend-none">{t('backendNone')}</p>;
  else backend = <Spinner label={t('loading')} />;

  const report = integrity.data;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h1">{t('title')}</h1>
        <p className="text-pretty text-ink-muted">{t('lead')}</p>
      </header>

      <Card title={t('integrityTitle')} lead={t('integrityLead')}>
        {sdk.isError ? <ErrorBox error={sdk.error} onRetry={() => void sdk.refetch()} /> : null}
        {integrity.isError ? <ErrorBox error={integrity.error} onRetry={() => void integrity.refetch()} /> : null}
        {!report && !integrity.isError && !sdk.isError ? <Spinner label={t('loading')} /> : null}
        {report ? (
          <div data-testid="status-integrity" data-ok={String(report.ok)} className="flex flex-col gap-4">
            <p>
              <span className={cn('font-medium', report.ok ? 'text-alive' : 'text-danger')}>
                {report.ok ? t('integrityOk') : t('integrityBad')}
              </span>{' '}
              <span className="text-ink-muted text-small">
                {t('integrityAt', { block: formatCount(report.blockNumber, lang), rpcs: report.rpcs })}
              </span>
            </p>
            {uniqueWarnings([report.warnings]).map((w) => (
              <Banner key={warningKey(w)} tone="warn" testId={`status-warning-${w.code}`}>
                <UntrustedText value={w.message} max={240} />
              </Banner>
            ))}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-small">
                <thead className="text-ink-muted">
                  <tr>
                    <th className="py-2 pr-4 font-medium">{t('colCheck')}</th>
                    <th className="py-2 pr-4 font-medium">{t('colResult')}</th>
                    <th className="py-2 pr-4 font-medium">{t('colExpected')}</th>
                    <th className="py-2 font-medium">{t('colActual')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.checks.map((c) => (
                    <tr key={c.name} data-ok={String(c.ok)} className="border-line border-t">
                      <td className="py-2 pr-4 font-mono">{c.name}</td>
                      <td className="py-2 pr-4">
                        <Verdict ok={c.ok} />
                      </td>
                      <td className="py-2 pr-4 font-mono">
                        {c.expected === undefined ? null : <UntrustedText value={c.expected} max={80} />}
                      </td>
                      <td className="py-2 font-mono">
                        {c.actual === undefined ? null : <UntrustedText value={c.actual} max={80} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Card>

      <Card title={t('rpcTitle')} lead={t('rpcLead')}>
        {probes.data ? (
          <div className="overflow-x-auto">
            <table data-testid="status-rpcs" className="w-full text-left text-small">
              <thead className="text-ink-muted">
                <tr>
                  <th className="py-2 pr-4 font-medium">{t('colRpc')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colResult')}</th>
                  <th className="py-2 pr-4 font-medium">{t('colBlock')}</th>
                  <th className="py-2 font-medium">{t('colMs')}</th>
                </tr>
              </thead>
              <tbody>
                {probes.data.map((p, i) => (
                  <tr key={p.url} data-testid={`status-rpc-${i}`} data-ok={String(p.ok)} className="border-line border-t">
                    <td className="break-all py-2 pr-4 font-mono">{p.url}</td>
                    <td className={cn('py-2 pr-4', p.ok ? 'text-alive' : 'text-danger')}>
                      {p.ok ? t('reachable') : p.error}
                    </td>
                    <td className="py-2 pr-4 font-mono">{p.block === null ? '' : formatCount(p.block, lang)}</td>
                    <td className="py-2 font-mono">{p.ms ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Spinner label={t('loading')} />
        )}
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => {
            void integrity.refetch();
            void probes.refetch();
          }}
        >
          {t('recheck')}
        </Button>
      </Card>

      {ENV.target === 'deweb' ? (
        <Card title={t('crossTitle')}>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              data-testid="status-crosscheck"
              checked={crossCheck}
              onChange={(e) => setCrossCheck(e.currentTarget.checked)}
              className="size-4 accent-thread"
            />
            <span>{t('crossLabel')}</span>
          </label>
          <Banner tone="warn" testId="status-crosscheck-warning">
            {t('crossWarning')}
          </Banner>
          {s && s.rpc.offchain.length > 0 ? (
            <div className="flex flex-col gap-2 text-small">
              <p>{t('offchainList')}</p>
              <ul className="flex flex-col gap-1 font-mono">
                {s.rpc.offchain.map((u) => (
                  <li key={u} className="break-all">
                    {u}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card title={t('backendTitle')}>{backend}</Card>

      <Card title={t('diagTitle')} lead={t('diagLead')}>
        <p data-testid="status-wallets" className="text-small">
          {t('walletsSeen')}{' '}
          {names.length === 0
            ? t('walletsNone')
            : names.map((n, i) => (
                <span key={`${i}:${n}`}>
                  {i > 0 ? ', ' : null}
                  <UntrustedText value={n} max={32} />
                </span>
              ))}
        </p>
        {text ? (
          <>
            <CopyButton text={text} label={t('copy')} showText className="self-start" />
            <details>
              <summary className="cursor-pointer text-small">{t('diagShow')}</summary>
              <pre
                data-testid="status-diagnostics"
                className="mt-2 overflow-x-auto rounded-2xl bg-surface-2 p-4 font-mono text-caption"
              >
                {text}
              </pre>
            </details>
          </>
        ) : (
          <Spinner label={t('loading')} />
        )}
      </Card>
    </div>
  );
}
```

`apps/web/src/app/status/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { StatusPage } from './status-page';

export const metadata: Metadata = {
  title: 'Status',
  description: 'Check the Atropyle contracts, the X Layer nodes this site reads through, and the backend, from your browser.',
};

export default function Page() {
  return <StatusPage />;
}
```

- [ ] **Step 5: Trang `/developers/` và `/privacy/`**

`apps/web/src/app/developers/developers-page.tsx`:

```tsx
'use client';

import { CHAIN_ID, useSdk } from '@/chain/hooks';
import { ENV, explorerUrlOf } from '@/config/env';
import { COMMANDS, type CommandName } from '@/content/commands';
import { SDK_SNIPPET } from '@/content/sdk-snippet';
import { useT } from '@/i18n/provider';
import { docsHome, LICENSE_URL, REPO_URL } from '@/lib/links';
import { messages as dev } from '@/messages/developers.messages';
import { Address } from '@/ui/address';
import { CopyButton } from '@/ui/copy-button';
import { ExternalLink } from '@/ui/external-link';
import { Skeleton } from '@/ui/skeleton';
import { networkName } from '@/wallet/network';

const EXPLORER = explorerUrlOf(ENV);
type Key = keyof typeof dev.en;

const INSTALL: readonly { id: CommandName; title: Key; help: Key }[] = [
  { id: 'sdk', title: 'sdkTitle', help: 'sdkHelp' },
  { id: 'verify', title: 'verifyTitle', help: 'verifyHelp' },
  { id: 'mcp', title: 'mcpTitle', help: 'mcpHelp' },
  { id: 'plugin', title: 'pluginTitle', help: 'pluginHelp' },
  { id: 'skills', title: 'skillsTitle', help: 'skillsHelp' },
];
const PACKAGES = ['@atropyle/sdk', 'atropyle', '@atropyle/mcp'] as const;

function Code({ text, label }: { text: string; label: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-line bg-surface-2 p-3">
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre font-mono text-small">{text}</pre>
      <CopyButton text={text} label={label} />
    </div>
  );
}

export function DevelopersPage() {
  const t = useT(dev);
  const d = useSdk().data?.deployment;
  const contracts = d
    ? [
        { id: 'factory', label: t('factory'), address: d.factory },
        { id: 'vaultImpl', label: t('vaultImpl'), address: d.vaultImpl },
        { id: 'cpu', label: t('cpu'), address: d.cpu },
        { id: 'treasury', label: t('treasury'), address: d.treasury },
        ...d.feeTokens.map((a, i) => ({ id: `feeToken-${i}`, label: t('feeToken'), address: a })),
      ]
    : null;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-h1">{t('title')}</h1>
        <p className="text-pretty text-ink-muted text-lead">{t('lead')}</p>
      </header>

      <section aria-labelledby="dev-install" className="flex flex-col gap-6">
        <h2 id="dev-install" className="font-display text-h2">
          {t('installTitle')}
        </h2>
        {INSTALL.map((x) => (
          <div key={x.id} className="flex flex-col gap-2">
            <h3 className="font-medium">{t(x.title)}</h3>
            <p className="text-ink-muted text-small">{t(x.help)}</p>
            <Code text={COMMANDS[x.id]} label={t('copyCommand')} />
          </div>
        ))}
      </section>

      <section aria-labelledby="dev-snippet" className="flex flex-col gap-3">
        <h2 id="dev-snippet" className="font-display text-h2">
          {t('snippetTitle')}
        </h2>
        <p className="text-ink-muted">{t('snippetHelp')}</p>
        <Code text={SDK_SNIPPET} label={t('copyCode')} />
      </section>

      <section aria-labelledby="dev-contracts" className="flex flex-col gap-3">
        <h2 id="dev-contracts" className="font-display text-h2">
          {t('contractsTitle')}
        </h2>
        <p className="text-ink-muted">{t('contractsLead', { network: networkName(CHAIN_ID) })}</p>
        {contracts ? (
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)]">
            {contracts.map((c) => (
              <div key={c.id} data-testid={`dev-contract-${c.id}`} className="contents">
                <dt className="text-ink-muted text-small">{c.label}</dt>
                <dd className="min-w-0">
                  <Address address={c.address} explorer={EXPLORER} />
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div aria-busy="true" className="flex flex-col gap-2">
            <span className="sr-only">{t('contractsLoading')}</span>
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        )}
      </section>

      <section aria-labelledby="dev-links" className="flex flex-col gap-3">
        <h2 id="dev-links" className="font-display text-h2">
          {t('linksTitle')}
        </h2>
        <ul className="flex flex-col gap-2">
          <li>
            <ExternalLink href={REPO_URL}>{t('repo')}</ExternalLink>
          </li>
          <li>
            <ExternalLink href={docsHome(ENV.docsPath)}>{t('docs')}</ExternalLink>
          </li>
          {PACKAGES.map((name) => (
            <li key={name}>
              <ExternalLink href={`https://www.npmjs.com/package/${name}`}>{t('npm', { name })}</ExternalLink>
            </li>
          ))}
          <li>
            <ExternalLink href={LICENSE_URL}>{t('license')}</ExternalLink>
          </li>
        </ul>
        <p className="text-caption text-ink-muted">{t('version', { version: ENV.version })}</p>
      </section>
    </div>
  );
}
```

`div` với `className="contents"` bọc từng cặp `dt`/`dd` là cách hợp lệ của HTML (`dl > div > dt + dd`); test id nằm trên nó.

`apps/web/src/app/developers/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { DevelopersPage } from './developers-page';

export const metadata: Metadata = {
  title: 'Developers',
  description: 'The Atropyle SDK, CLI, MCP server, Claude Code plugin and Agent Skills, with the contract addresses this site reads.',
};

export default function Page() {
  return <DevelopersPage />;
}
```

`apps/web/src/app/privacy/privacy-page.tsx`:

```tsx
'use client';

import { useT } from '@/i18n/provider';
import { REPO_URL } from '@/lib/links';
import { messages as privacy } from '@/messages/privacy.messages';
import { ExternalLink } from '@/ui/external-link';

type Key = keyof typeof privacy.en;

const SECTIONS: readonly { id: string; title: Key; items: readonly Key[] }[] = [
  { id: 'site', title: 'siteTitle', items: ['site1', 'site2', 'site3'] },
  { id: 'wallet', title: 'walletTitle', items: ['wallet1', 'wallet2'] },
  { id: 'email', title: 'emailTitle', items: ['email1', 'email2', 'email3', 'email4', 'email5', 'email6'] },
  { id: 'me', title: 'meTitle', items: ['me1'] },
  { id: 'onchain', title: 'onchainTitle', items: ['onchain1'] },
  { id: 'contact', title: 'contactTitle', items: ['contact1'] },
];

export function PrivacyPage() {
  const t = useT(privacy);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-h1">{t('title')}</h1>
        <p className="text-pretty text-ink-muted text-lead">{t('lead')}</p>
      </header>
      {SECTIONS.map((s) => (
        <section key={s.id} aria-labelledby={`privacy-${s.id}`} className="flex flex-col gap-3">
          <h2 id={`privacy-${s.id}`} className="font-display text-title">
            {t(s.title)}
          </h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-pretty">
            {s.items.map((k) => (
              <li key={k}>{t(k)}</li>
            ))}
          </ul>
        </section>
      ))}
      <ExternalLink href={`${REPO_URL}/issues`}>{t('contactLink')}</ExternalLink>
    </div>
  );
}
```

`apps/web/src/app/privacy/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { PrivacyPage } from './privacy-page';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Atropyle keeps about you, and where: no cookies or trackers, and email alerts only if you ask for them.',
};

export default function Page() {
  return <PrivacyPage />;
}
```

- [ ] **Step 6: Trang 404 có gợi ý**

Thay `apps/web/src/app/not-found.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useT } from '@/i18n/provider';
import { suggestFor } from '@/lib/route-suggest';
import { useMounted } from '@/lib/use-mounted';
import { messages as nf } from '@/messages/not-found.messages';
import { messages as shell } from '@/messages/shell.messages';
import { vaultHref, verifyHref } from '@/routes';
import { Thread } from '@/thread/thread';
import { buttonClass } from '@/ui/button';
import { UntrustedText } from '@/ui/untrusted-text';

/**
 * 404.html. The missing path comes from the address bar, so it is shown only as cleaned, truncated text, and a
 * suggestion is only ever one of this site's own pages or a 40-hex-digit address.
 */
export default function NotFound() {
  const t = useT(shell);
  const n = useT(nf);
  const mounted = useMounted();
  const hint = mounted ? suggestFor(window.location.pathname) : null;
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 px-4 py-24 text-center">
      <Thread state="expired" className="w-full max-w-md" />
      <h1 className="font-display text-h1">{t('notFoundTitle')}</h1>
      {mounted ? (
        <p className="flex max-w-full flex-col gap-1 text-ink-muted">
          {t('notFoundBody')}
          <code className="font-mono text-ink text-small">
            <UntrustedText value={window.location.pathname} max={96} />
          </code>
        </p>
      ) : null}
      {hint?.kind === 'route' ? (
        <p data-testid="not-found-suggest" className="text-lead">
          {n('didYouMean')}{' '}
          <Link href={hint.path} prefetch={false} className="font-mono underline underline-offset-4">
            {hint.path}
          </Link>
          ?
        </p>
      ) : null}
      {hint?.kind === 'vault' ? (
        <div data-testid="not-found-vault" className="flex flex-col items-center gap-3">
          <p>{n('looksLikeVault')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href={vaultHref(hint.address)} prefetch={false} className={buttonClass({ variant: 'primary' })}>
              {n('openVault')}
            </Link>
            <Link href={verifyHref(hint.address)} prefetch={false} className={buttonClass({ variant: 'secondary' })}>
              {n('verifyVault')}
            </Link>
          </div>
        </div>
      ) : null}
      <p className="text-ink-muted">{t('notFoundHint')}</p>
      <Link href="/" prefetch={false} className={buttonClass({ variant: hint ? 'ghost' : 'primary', size: 'lg' })}>
        {t('goHome')}
      </Link>
    </section>
  );
}
```

Run: `npm test -w apps/web && npm run typecheck && npm run build -w apps/web && npm run test:build -w apps/web`
Expected: PASS. Test build của 7A vẫn thấy `Page not found` trong `404.html`.

- [ ] **Step 7: E2E**

`apps/web/test/e2e/pages.spec.ts`:

```ts
import { ANVIL, expect, test } from './fixtures';
import { connectWallet, expectAccessibleInBothThemes } from './helpers';

const at = (siteUrl: string, path: string) => new URL(path, siteUrl).href;

test('the status page checks the contracts and nodes, and its diagnostics hold no wallet address', async ({
  page,
  state,
  wallet,
}) => {
  await wallet({ account: ANVIL[1] });
  await page.goto(at(state.siteUrl, 'status/'));
  await connectWallet(page);
  await expect(page.getByTestId('status-integrity')).toHaveAttribute('data-ok', 'true');
  await expect(page.getByTestId('status-rpc-0')).toHaveAttribute('data-ok', 'true');
  await expect(page.getByTestId('status-backend-off')).toBeVisible();
  await expect(page.getByTestId('status-crosscheck')).not.toBeChecked();
  await expect(page.getByTestId('status-wallets')).toContainText('Test Wallet');
  await page.getByText('Show what will be copied').click();
  const text = (await page.getByTestId('status-diagnostics').textContent()) ?? '';
  expect(JSON.parse(text)).toMatchObject({
    target: 'deweb',
    page: at(state.siteUrl, 'status/'),
    chainId: 31337,
    crossCheck: false,
    lang: 'en',
  });
  expect(text.toLowerCase()).not.toContain(ANVIL[1].toLowerCase());
  await expectAccessibleInBothThemes(page);
});

test('the developer page shows the real commands and contract addresses', async ({ page, state }) => {
  await page.goto(at(state.siteUrl, 'developers/'));
  await expect(page.getByText('npx -y atropyle verify')).toBeVisible();
  await expect(page.getByTestId('dev-contract-factory')).toBeVisible();
  await expectAccessibleInBothThemes(page);
});

test('the privacy page says what is kept and where', async ({ page, state }) => {
  await page.goto(at(state.siteUrl, 'privacy/'));
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible();
  await expect(page.getByText('A sign-up you do not confirm within 48 hours is deleted.')).toBeVisible();
  await expectAccessibleInBothThemes(page);
});

test('a missing page suggests the nearest page, or the vault for an address', async ({ page, state }) => {
  await page.goto(at(state.siteUrl, 'prof/'));
  await expect(page.getByTestId('not-found-suggest').getByRole('link', { name: '/proof/' })).toBeVisible();
  await expectAccessibleInBothThemes(page);
  await page.goto(at(state.siteUrl, state.seeded.guarded));
  await page.getByRole('link', { name: 'Open the vault' }).click();
  await expect(page).toHaveURL(new RegExp(`/vault/#${state.seeded.guarded}$`));
});
```

Run: `npm run e2e -w apps/web -- pages`
Expected: PASS (4 test × 2 project). Static server của 7A trả `404.html` với status 404 cho `prof/` và cho đường dẫn là địa chỉ vault.

- [ ] **Step 8: Màn hình**

```powershell
$env:SCREENS='status/'; $env:SCREENS_WAIT='status-integrity'; npm run e2e -w apps/web -- screens --project=desktop; Remove-Item Env:SCREENS, Env:SCREENS_WAIT
$env:SCREENS='developers/,privacy/,prof/'; npm run e2e -w apps/web -- screens --project=desktop; Remove-Item Env:SCREENS
```

Kiểm: bảng kiểm hợp đồng và bảng node cuộn ngang trong khung riêng ở 390 px, không cuộn cả trang; đoạn mã 10 dòng đọc được ở theme sáng; trang quyền riêng tư đọc trôi bằng cả hai ngôn ngữ; gợi ý 404 nổi hơn nút về trang chủ. Liệt kê đường dẫn ảnh trong báo cáo task.

- [ ] **Step 9: Kiểm toàn bộ và commit**

```bash
npm run typecheck
npx biome check --write apps/web/src/app/status apps/web/src/app/developers apps/web/src/app/privacy apps/web/src/app/not-found.tsx apps/web/src/content/sdk-snippet.ts apps/web/src/lib/route-suggest.ts apps/web/src/messages apps/web/test/unit/diagnostics.test.ts apps/web/test/unit/health.test.ts apps/web/test/unit/sdk-snippet.test.ts apps/web/test/unit/route-suggest.test.ts apps/web/test/e2e/pages.spec.ts
npx biome ci .
git add apps/web/src/app/status/impl/diagnostics.ts apps/web/src/app/status/health.ts apps/web/src/app/status/status-page.tsx apps/web/src/app/status/page.tsx apps/web/src/content/sdk-snippet.ts apps/web/src/app/developers/developers-page.tsx apps/web/src/app/developers/page.tsx apps/web/src/app/privacy/privacy-page.tsx apps/web/src/app/privacy/page.tsx apps/web/src/lib/route-suggest.ts apps/web/src/messages/status.messages.ts apps/web/src/messages/developers.messages.ts apps/web/src/messages/privacy.messages.ts apps/web/src/messages/not-found.messages.ts apps/web/src/app/not-found.tsx apps/web/test/unit/diagnostics.test.ts apps/web/test/unit/health.test.ts apps/web/test/unit/sdk-snippet.test.ts apps/web/test/unit/route-suggest.test.ts apps/web/test/e2e/pages.spec.ts
git commit -m "feat(web): status, developers and privacy pages, and a 404 that suggests" -m "Status checks the contracts and every node from the browser and, on the hosted site, colours the backend's health; diagnostics carry no wallet address or URL fragment. The SDK snippet is tested against the real SDK, the privacy page states what the backend keeps." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Ảnh OG, icon và `manifest.webmanifest`

Spec §5 hàng "Metadata" (ảnh OG tĩnh, `manifest.webmanifest`, không service worker) và thứ tự cắt mục 2 (giữ một ảnh chung, Quyết định 14). Ảnh vẽ từ chính sợi dệt netlist của hero và font tự host, bằng Chromium của Playwright trên máy, rồi commit.

Vì sao không sinh lúc `next build` (đã kiểm 23/11/2026 trong `node_modules/next/dist/compiled/@vercel/og` của worktree backend, next 16.4.6): `next/og` dùng satori, mà bộ đọc font của satori chỉ nhận chữ ký TrueType, `OTTO` và `wOFF` ("Unsupported OpenType signature"), không có `wOF2`; repo chỉ có woff2. Ngoài ra file `opengraph-image` luôn thêm `og:image` tuyệt đối vào mọi bản build, kể cả deweb (Quyết định 14 cấm). Máy build của Vercel cũng không có Chromium. Giá: đổi tagline hay hình hero mà quên chạy `npm run og` thì ảnh cũ; test chỉ kiểm kích thước.

**Files:**
- Create: `apps/web/src/config/site.ts`, `apps/web/scripts/og-image.ts`, `apps/web/public/manifest.webmanifest`
- Create (sinh bởi script, commit): `apps/web/public/og.png`, `apps/web/public/icon-192.png`, `apps/web/public/icon-512.png`, `apps/web/src/app/apple-icon.png`
- Modify: `apps/web/src/app/layout.tsx` (object `metadata`), `apps/web/package.json` (script `og`), `apps/web/test/build/paths.ts`, `apps/web/test/build/global-setup.ts`
- Test: `apps/web/test/unit/site.test.ts`, `apps/web/test/build/social.test.ts`

**Interfaces:**
- Consumes (7A): `ENV`, `type Target` (`@/config/env`); `outOf`, `API_SENTINEL` (`test/build/paths.ts`); `walkSite` (`scripts/lib/site-files.ts` ở gốc repo); `src/app/icon.svg`; `src/fonts/files/fraunces-latin-full-normal.woff2`, `inter-latin-wght-normal.woff2`. (Task 4): `THREAD`, `VIEW` (`src/home/netlist-geometry.ts`), `wirePaths`, `dotsPath`, `pointsOf`, `smoothPath` (`src/home/weave-path.ts`).
- Produces:
  - `src/config/site.ts`: `OG_IMAGE = { url: '/og.png', width: 1200, height: 630, alt }`; `MANIFEST_PATH = '/manifest.webmanifest'`; `siteUrlOf(target: Target, raw: string | undefined, vercelHost: string | undefined): URL | null` (ném lỗi khi giá trị không phải origin https); `socialMetadata(site: URL | null, title: string, description: string): Metadata`.
  - `test/build/paths.ts`: `SITE_SENTINEL = 'https://site.atropyle.invalid'`.
  - Script `npm run og -w apps/web`.

- [ ] **Step 1: Test hỏng cho `siteUrlOf` và `socialMetadata`**

`apps/web/test/unit/site.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MANIFEST_PATH, OG_IMAGE, siteUrlOf, socialMetadata } from '../../src/config/site';

describe('siteUrlOf', () => {
  it('gives the deweb build no origin, whatever the environment says', () => {
    expect(siteUrlOf('deweb', 'https://atropyle.example', 'atropyle.vercel.app')).toBeNull();
  });

  it('prefers NEXT_PUBLIC_SITE_URL, then the production host Vercel sets, and keeps only the origin', () => {
    expect(siteUrlOf('vercel', ' https://atropyle.example/ ', 'atropyle.vercel.app')?.href).toBe(
      'https://atropyle.example/',
    );
    expect(siteUrlOf('vercel', undefined, 'atropyle.vercel.app')?.href).toBe('https://atropyle.vercel.app/');
    expect(siteUrlOf('vercel', '', '')).toBeNull();
  });

  it('fails the build on anything but an https origin', () => {
    for (const bad of ['http://atropyle.example', 'https://atropyle.example/app', 'https://a.example/?x=1', 'atropyle']) {
      expect(() => siteUrlOf('vercel', bad, undefined), bad).toThrow('NEXT_PUBLIC_SITE_URL must be an https origin');
    }
  });
});

describe('socialMetadata', () => {
  it('links the manifest everywhere and adds the card only with an origin', () => {
    expect(socialMetadata(null, 'T', 'D')).toEqual({ manifest: MANIFEST_PATH });
    const m = socialMetadata(new URL('https://atropyle.example'), 'T', 'D');
    expect(m.metadataBase?.href).toBe('https://atropyle.example/');
    expect(m.openGraph).toMatchObject({ type: 'website', siteName: 'Atropyle', title: 'T', description: 'D' });
    expect(m.openGraph?.images).toEqual([{ ...OG_IMAGE }]);
    expect(m.twitter).toMatchObject({ card: 'summary_large_image', title: 'T', description: 'D' });
  });
});
```

Run: `npm test -w apps/web -- site`
Expected: FAIL, không tìm thấy `../../src/config/site`.

- [ ] **Step 2: `src/config/site.ts`**

```ts
import type { Metadata } from 'next';
import type { Target } from '@/config/env';

/** The one social card (Quyết định 14), drawn by scripts/og-image.ts and committed under public/. */
export const OG_IMAGE = {
  url: '/og.png',
  width: 1200,
  height: 630,
  alt: 'The Atropyle policy circuit drawn as threads, under the words: inheritance and wallet recovery on X Layer.',
} as const;

export const MANIFEST_PATH = '/manifest.webmanifest';

const notOrigin = (text: string) => new Error(`NEXT_PUBLIC_SITE_URL must be an https origin, got "${text}"`);

/**
 * The absolute origin of the hosted site, or null. A card needs an absolute image URL, and the deweb build must carry
 * none (the gateway scans it on-chain), so only the vercel build gets one. NEXT_PUBLIC_SITE_URL (the custom domain)
 * wins over VERCEL_PROJECT_PRODUCTION_URL, which Vercel sets on its own builds as a bare host.
 */
export function siteUrlOf(target: Target, raw: string | undefined, vercelHost: string | undefined): URL | null {
  if (target !== 'vercel') return null;
  const host = vercelHost?.trim();
  const text = raw?.trim() || (host ? `https://${host}` : '');
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw notOrigin(text);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw notOrigin(text);
  }
  return new URL(url.origin);
}

/** The manifest on every build; the Open Graph and X card only when the build knows its own origin. */
export function socialMetadata(site: URL | null, title: string, description: string): Metadata {
  if (!site) return { manifest: MANIFEST_PATH };
  return {
    manifest: MANIFEST_PATH,
    metadataBase: site,
    openGraph: { type: 'website', siteName: 'Atropyle', title, description, images: [{ ...OG_IMAGE }] },
    twitter: { card: 'summary_large_image', title, description, images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }] },
  };
}
```

Run: `npm test -w apps/web -- site`
Expected: PASS (4 test).

- [ ] **Step 3: Script vẽ ảnh, rồi chạy nó**

`apps/web/scripts/og-image.ts`:

```ts
// npm run og -w apps/web: the social card and the app icons, drawn offline by Playwright's Chromium from the real
// netlist art (src/home) and the self-hosted fonts. Run it after changing the hero art, the card text or the icon,
// then commit the PNGs. Needs `npm run playwright:install -w apps/web` once.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';
import { OG_IMAGE } from '../src/config/site';
import { THREAD, VIEW } from '../src/home/netlist-geometry';
import { dotsPath, pointsOf, smoothPath, wirePaths } from '../src/home/weave-path';

const at = (p: string) => new URL(`../${p}`, import.meta.url);
const font = (file: string) => readFileSync(at(`src/fonts/files/${file}`)).toString('base64');
const BG = '#0b0d12';
const INK = '#ece7dd';
const MUTED = '#a59f94';
const THREAD_GOLD = '#e8b65a';

const FACES = `
@font-face { font-family: Fraunces; font-weight: 100 900; src: url(data:font/woff2;base64,${font('fraunces-latin-full-normal.woff2')}) format('woff2'); }
@font-face { font-family: Inter; font-weight: 100 900; src: url(data:font/woff2;base64,${font('inter-latin-wght-normal.woff2')}) format('woff2'); }
* { margin: 0; box-sizing: border-box; }
html, body { background: ${BG}; }`;

const weave = `
<svg viewBox="0 0 ${VIEW.w} ${VIEW.h}" width="${VIEW.w}" height="${VIEW.h}" xmlns="http://www.w3.org/2000/svg"
  style="position:absolute;left:0;top:${OG_IMAGE.height - VIEW.h + 40}px">
  <g fill="none" stroke="${INK}" stroke-width="0.8" opacity="0.22">${wirePaths()
    .map((d) => `<path d="${d}"/>`)
    .join('')}</g>
  <path d="${dotsPath()}" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" opacity="0.4"/>
  <path d="${smoothPath(pointsOf(THREAD))}" fill="none" stroke="${THREAD_GOLD}" stroke-width="3.5" stroke-linecap="round"/>
</svg>`;

const card = `<!doctype html><html><head><meta charset="utf-8"><style>${FACES}
.card { position: relative; width: ${OG_IMAGE.width}px; height: ${OG_IMAGE.height}px; overflow: hidden; }
.veil { position: absolute; inset: 0; background: linear-gradient(180deg, ${BG} 0%, ${BG}ee 34%, ${BG}00 66%); }
.text { position: absolute; left: 72px; top: 64px; width: 900px; }
.mark { font: 600 40px/1 Fraunces; color: ${THREAD_GOLD}; letter-spacing: -0.01em; }
h1 { margin-top: 28px; font: 500 64px/1.08 Fraunces; color: ${INK}; letter-spacing: -0.02em; }
p { margin-top: 20px; font: 400 28px/1.35 Inter; color: ${MUTED}; }
</style></head><body><div class="card">${weave}<div class="veil"></div><div class="text">
<div class="mark">Atropyle</div>
<h1>Inheritance and wallet recovery on X&nbsp;Layer.</h1>
<p>A circuit decides every step. Anyone can prove it.</p>
</div></div></body></html>`;

const icon = (size: number) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${FACES} img { display: block; width: ${size}px; height: ${size}px; }</style></head>` +
  `<body><img alt="" src="data:image/svg+xml;base64,${readFileSync(at('src/app/icon.svg')).toString('base64')}"></body></html>`;

async function shoot(page: Page, html: string, width: number, height: number, out: string): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  writeFileSync(at(out), await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } }));
  console.log(`${out}: ${width} × ${height}`);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  // Everything is inline (data: URLs never reach the router); any other request means a leak, so stop.
  let requests = 0;
  await page.route('**/*', (route) => {
    requests += 1;
    return route.abort();
  });
  await shoot(page, card, OG_IMAGE.width, OG_IMAGE.height, 'public/og.png');
  await shoot(page, icon(192), 192, 192, 'public/icon-192.png');
  await shoot(page, icon(512), 512, 512, 'public/icon-512.png');
  // iOS rounds the corners itself; the icon's own background fills the square.
  await shoot(page, icon(180), 180, 180, 'src/app/apple-icon.png');
  if (requests > 0) throw new Error(`${requests} network request(s) while drawing; everything must be inline`);
} finally {
  await browser.close();
}
```

`apps/web/public/manifest.webmanifest`:

```json
{
  "name": "Atropyle",
  "short_name": "Atropyle",
  "description": "Inheritance and wallet recovery on X Layer.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0b0d12",
  "theme_color": "#0b0d12",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" }
  ]
}
```

```bash
npm pkg set scripts.og="tsx scripts/og-image.ts" -w apps/web
npm run playwright:install -w apps/web
npm run og -w apps/web
```

Expected: bốn dòng `public/og.png: 1200 × 630`, `public/icon-192.png: 192 × 192`, `public/icon-512.png: 512 × 512`, `src/app/apple-icon.png: 180 × 180`; không lỗi request.

Mở `apps/web/public/og.png` bằng công cụ Read (đọc được ảnh) và kiểm bằng mắt: chữ "Atropyle" vàng, tiêu đề và câu phụ đọc rõ trên nền tối, không chữ nào đè lên sợi chỉ vàng, sợi dệt thấy rõ ở nửa dưới, không ô vuông thay chữ (font đã nạp). Mở `icon-192.png`: sợi chỉ vàng trên ô tối, góc không trong suốt sai màu. Đính đường dẫn bốn ảnh vào báo cáo task.

- [ ] **Step 4: Gắn vào layout, rồi test build hỏng trước khi sửa môi trường build**

Trong `apps/web/src/app/layout.tsx`, thêm import

```ts
import { ENV } from '@/config/env';
import { siteUrlOf, socialMetadata } from '@/config/site';
```

và thay toàn bộ `export const metadata: Metadata = { … };` của 7A bằng:

```ts
const TITLE = 'Atropyle: inheritance and wallet recovery on X Layer';
const DESCRIPTION =
  'A vault for crypto inheritance and wallet recovery on X Layer. A circuit decides every step, and anyone can prove it.';

export const metadata: Metadata = {
  title: { default: TITLE, template: '%s · Atropyle' },
  description: DESCRIPTION,
  applicationName: 'Atropyle',
  // iOS would otherwise turn long numbers (amounts, block numbers) into phone links.
  formatDetection: { telephone: false, address: false, email: false },
  // Read at build time only: this is a server module, so neither variable reaches a client bundle.
  ...socialMetadata(
    siteUrlOf(ENV.target, process.env.NEXT_PUBLIC_SITE_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL),
    TITLE,
    DESCRIPTION,
  ),
};
```

(Nếu `ENV` đã được import ở file này thì không import lại.)

Thêm vào cuối `apps/web/test/build/paths.ts`:

```ts
/** NEXT_PUBLIC_SITE_URL in the environment of both builds; only the vercel build may carry it (social.test.ts). */
export const SITE_SENTINEL = 'https://site.atropyle.invalid';
```

`apps/web/test/build/social.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { walkSite } from '../../../../scripts/lib/site-files.ts';
import { outOf, SITE_SENTINEL } from './paths';

type Target = 'vercel' | 'deweb';
const read = (target: Target, path: string) => readFileSync(join(outOf(target), path));
const html = (target: Target, page: string) => read(target, page).toString('utf8');
const meta = (doc: string, key: string): string | null =>
  new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`).exec(doc)?.[1] ?? null;
// Pages that exist from Task 3 on, so the test holds whatever order Tasks 8 to 11 land in.
const PAGES = ['index.html', 'proof/index.html', '404.html'];

/** Width and height from the IHDR chunk, right after the 8-byte signature and the chunk's length and type. */
function pngSize(bytes: Buffer): string {
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe('vercel build', () => {
  it('every page shares the one card, with an absolute image URL', () => {
    for (const page of PAGES) {
      const doc = html('vercel', page);
      expect(meta(doc, 'og:image'), page).toBe(`${SITE_SENTINEL}/og.png`);
      expect(meta(doc, 'og:image:width'), page).toBe('1200');
      expect(meta(doc, 'twitter:card'), page).toBe('summary_large_image');
    }
    expect(pngSize(read('vercel', 'og.png'))).toBe('1200x630');
    expect(read('vercel', 'og.png').length).toBeLessThan(300_000);
  });
});

describe('deweb build', () => {
  it('carries no card and no absolute site URL anywhere', () => {
    expect(meta(html('deweb', 'index.html'), 'og:image')).toBeNull();
    const root = outOf('deweb');
    for (const path of walkSite(root)) {
      if (!/\.(html|txt|js|css|json|webmanifest)$/.test(path)) continue;
      expect(readFileSync(join(root, path), 'utf8').includes('site.atropyle.invalid'), path).toBe(false);
    }
  });
});

describe.each(['vercel', 'deweb'] as const)('%s build', (target) => {
  it('links a manifest whose icons exist at their stated size, and an Apple icon', () => {
    const doc = html(target, 'index.html');
    expect(doc).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/);
    expect(doc).toMatch(/<link rel="apple-touch-icon" href="\/apple-icon\.png/);
    const manifest = JSON.parse(html(target, 'manifest.webmanifest')) as {
      start_url: string;
      icons: { src: string; sizes: string }[];
    };
    expect(manifest.start_url).toBe('/');
    expect(manifest.icons.length).toBe(2);
    for (const i of manifest.icons) expect(pngSize(read(target, i.src.slice(1))), i.src).toBe(i.sizes);
    expect(pngSize(read(target, 'apple-icon.png'))).toBe('180x180');
  });
});
```

Run: `npm run test:build -w apps/web`
Expected: FAIL ở `every page shares the one card…` (`og:image` là `null`: build chưa có `NEXT_PUBLIC_SITE_URL`). Hai test còn lại PASS.

- [ ] **Step 5: Đưa sentinel vào cả hai build**

Trong `apps/web/test/build/global-setup.ts`:
- thêm `SITE_SENTINEL` vào import từ `./paths`;
- trong dòng dựng `env`, thêm `NEXT_PUBLIC_SITE_URL: SITE_SENTINEL` ngay sau `NEXT_PUBLIC_API_URL: API_SENTINEL`;
- ngay sau `delete env.ATROPYLE_E2E;` thêm:

```ts
      // Vercel sets this on its own builds; a developer's shell must not stand in for the sentinel.
      delete env.VERCEL_PROJECT_PRODUCTION_URL;
```

Run: `npm run test:build -w apps/web`
Expected: PASS, gồm 3 test của `social.test.ts`. `html-purity.test.ts` của 7A vẫn xanh (bản deweb không có URL tuyệt đối nào; bản vercel chỉ có URL trong `content` của `<meta>`, thứ quét on-chain không đọc).

- [ ] **Step 6: E2E và Lighthouse vẫn xanh**

```bash
npm run e2e -w apps/web
npm run build -w apps/web && npm run size -w apps/web && npm run lighthouse -w apps/web
```

Expected: PASS. Bản e2e là deweb: trình duyệt tải `manifest.webmanifest` (`manifest-src 'self'` của CSP 7A, MIME `.webmanifest` của server tĩnh 7A) mà không lỗi console; lưới request off-chain không bắt gì. Size không đổi (ảnh không phải JS).

- [ ] **Step 7: Kiểm toàn bộ và commit**

```bash
npm run typecheck
npx biome check --write apps/web/src/config/site.ts apps/web/scripts/og-image.ts apps/web/src/app/layout.tsx apps/web/test/unit/site.test.ts apps/web/test/build/social.test.ts apps/web/test/build/paths.ts apps/web/test/build/global-setup.ts apps/web/package.json
npx biome ci .
git add apps/web/src/config/site.ts apps/web/scripts/og-image.ts apps/web/public/manifest.webmanifest apps/web/public/og.png apps/web/public/icon-192.png apps/web/public/icon-512.png apps/web/src/app/apple-icon.png apps/web/src/app/layout.tsx apps/web/package.json apps/web/test/unit/site.test.ts apps/web/test/build/social.test.ts apps/web/test/build/paths.ts apps/web/test/build/global-setup.ts
git commit -m "feat(web): one social card, app icons and a web manifest" -m "The card is drawn offline from the real netlist art and the self-hosted fonts by Playwright's Chromium, then committed: next/og cannot read woff2 and would put an absolute URL into the deweb build. Only the vercel build, which knows its origin, carries og:image." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Chuyển hẳn sang web mới

Spec §10 và §13: script site đọc `apps/web/out`, bỏ GitHub Pages, xoá `apps/web-legacy` và job CI của nó. Quyết định 15. Ba commit, mỗi commit xanh: (1) script site, CI, xoá bản cũ; (2) `webUrl` trỏ về bản Vercel; (3) bật lại tiền tải route.

**Điều kiện trước (dừng và báo controller nếu thiếu):**
- Plan 7B đã merge, Task 1 đến 11 của plan này đã merge: có `apps/web/src/app/{create,vault,verify,sign,proof,me,join,status,developers,privacy}/page.tsx` và `apps/web/src/components/subscribe/SubscribeForm.tsx`.
- Controller đưa `SITE_URL`, origin https của bản Vercel production (cùng giá trị với secret `SITE_URL` của backend, `apps/backend/README.md`).

Đã kiểm (23/11/2026): repo không có branch protection hay ruleset (`gh api …/branches/main/protection` trả 403 "Upgrade to GitHub Pro"), nên đổi tên job `web-next` thành `web` không làm treo check bắt buộc nào. Không workflow nào đăng GitHub Pages (`.github/workflows/` chỉ có `ci.yml`). Không test nào ghim `webUrl` của `deployments/xlayer.json`; SDK dựng link ký bằng `deployment.webUrl` (`packages/sdk/src/client.ts`, dạng `#/sign?p=`, bản mới chuyển hướng bằng `legacyTarget` của 7A). `deweb-cli`, `deweb-local` và `deweb-fork` gọi `deweb:publish` trên site không có `404.html`.

**Files:**
- Delete: `apps/web-legacy/`, `scripts/test/site/ci-web.test.ts` (bản cũ), `scripts/test/site/deweb-bundle.test.ts`
- Move: `scripts/test/site/ci-web-next.test.ts` → `scripts/test/site/ci-web.test.ts`
- Modify: `scripts/build-site.ts`, `scripts/check-site.ts`, `scripts/deweb-publish.ts` (comment), `scripts/lib/site-build.ts`, `scripts/lib/site-check.ts`, `scripts/lib/site-files.ts`, `scripts/lib/deweb.ts`, `scripts/lib/onchain-check.ts`, `scripts/write-deployment.ts`
- Modify (test): `scripts/test/site/{site-build,site-check,deweb,deweb-cli,deweb-local,deweb-fork,onchain-check}.test.ts`
- Modify: `.github/workflows/ci.yml`, `AGENTS.md`, `apps/web/README.md`, `docs/deployments.md`, `.gitignore`, `biome.json`, `package-lock.json`, `deployments/xlayer.json`, `packages/sdk/src/deployments/xlayer.ts` (sinh lại), `packages/sdk/README.md`, các file `apps/web/src/**` có `prefetch={false}`

**Interfaces:**
- Consumes (7A): `OUT_DIR` là `apps/web/out` (`apps/web/scripts/lib/run-next.ts`), `buildEnvFor` (bản deweb luôn để `NEXT_PUBLIC_API_URL` rỗng), static server trả `404.html` với status 404, job CI `web-next`, `scripts/test/site/ci-web-next.test.ts`, `apps/web/src/chain/impl/rpc.ts` (`ONCHAIN_RPCS`). (Task 10): `src/app/not-found.tsx` sinh `404.html`. (Task 11): `siteUrlOf` (bản deweb không bao giờ có URL site), `public/og.png`.
- Produces:
  - `scripts/lib/site-files.ts`: `DEFAULT_FALLBACK = '404.html'`.
  - `scripts/lib/site-build.ts`: `type SiteTarget = 'deweb'`; `DOCS_BASE = { deweb: '/docs/' }`; `webOutOf(root): string`; `DEWEB_SKIP`; `keepInSite(path): boolean`; `webEnv(target, withDocs, base)` đặt biến `NEXT_PUBLIC_*`.
  - Job CI `web` (thay `web-next`), thêm `npm run test:site` và bước build site DeWEB.

- [ ] **Step 1: Kiểm điều kiện, giữ `SITE_URL` trong shell**

```bash
ls apps/web/src/app/{create,vault,verify,sign,proof,me,join,status,developers,privacy}/page.tsx apps/web/src/components/subscribe/SubscribeForm.tsx
export SITE_URL='<origin controller đưa, ví dụ https://atropyle.xyz>'
node -e "const u=new URL(process.env.SITE_URL); if(u.protocol!=='https:'||u.pathname!=='/'||u.search||u.hash) throw new Error('SITE_URL must be an https origin'); console.log(u.origin + '/', u.hostname)"
```

Expected: `ls` liệt kê đủ 11 file; `node` in origin có `/` cuối và hostname. Giữ shell này cho Step 8.

- [ ] **Step 2: Test hỏng cho script site**

Thay toàn bộ `scripts/test/site/site-build.test.ts`:

```ts
import { join, resolve } from 'node:path';
import { expect, test } from 'vitest';
import { DOCS_BASE, docsEnv, keepInSite, outDirProblem, parseSiteArgs, webEnv, webOutOf } from '../../lib/site-build';

test('parseSiteArgs reads --target deweb, --no-docs and --out', () => {
  expect(parseSiteArgs(['--target', 'deweb'])).toEqual({ target: 'deweb', docs: true, dir: 'site-dist/deweb' });
  expect(parseSiteArgs(['--target=deweb', '--no-docs', '--out', 'tmp/site'])).toEqual({
    target: 'deweb',
    docs: false,
    dir: 'tmp/site',
  });
});

test('parseSiteArgs rejects a missing or unknown target, and says where Pages went', () => {
  expect(() => parseSiteArgs([])).toThrow('--target must be deweb');
  expect(() => parseSiteArgs(['--target', 'ipfs'])).toThrow('--target must be deweb');
  expect(() => parseSiteArgs(['--target', 'pages'])).toThrow('GitHub Pages is no longer built (spec §10)');
  expect(() => parseSiteArgs(['--target', 'deweb', '--out'])).toThrow('--out needs a value');
  expect(() => parseSiteArgs(['--target', 'deweb', '--yes'])).toThrow('unknown argument: --yes');
});

test('webEnv pins a mainnet deweb build and drops every URL that must not reach DeWEB', () => {
  const base = {
    PATH: '/bin',
    NEXT_PUBLIC_TARGET: 'vercel',
    NEXT_PUBLIC_CHAIN: 'local',
    NEXT_PUBLIC_DEPLOYMENT: '{}',
    NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1',
    NEXT_PUBLIC_SITE_URL: 'https://atropyle.example',
    VERCEL_PROJECT_PRODUCTION_URL: 'atropyle.vercel.app',
    ATROPYLE_E2E: '1',
    NEXT_PUBLIC_DOCS_PATH: '/docs/',
  };
  expect(webEnv('deweb', false, base)).toEqual({
    PATH: '/bin',
    NEXT_PUBLIC_TARGET: 'deweb',
    NEXT_PUBLIC_CHAIN: 'xlayer',
  });
  expect(webEnv('deweb', true, { PATH: '/bin' })).toEqual({
    PATH: '/bin',
    NEXT_PUBLIC_TARGET: 'deweb',
    NEXT_PUBLIC_CHAIN: 'xlayer',
    NEXT_PUBLIC_DOCS_PATH: '/docs/',
  });
});

test('docsEnv sets DOCS_BASE', () => {
  expect(DOCS_BASE).toEqual({ deweb: '/docs/' });
  expect(docsEnv('deweb', { PATH: '/bin' })).toEqual({ PATH: '/bin', DOCS_BASE: '/docs/' });
});

test('the DeWEB copy leaves out only the social card at the root', () => {
  expect(keepInSite('og.png')).toBe(false);
  for (const p of ['', 'index.html', '404.html', 'icon-192.png', 'manifest.webmanifest', 'proof/og.png']) {
    expect(keepInSite(p), p).toBe(true);
  }
});

test('outDirProblem refuses the repo root, its parents and the Next export', () => {
  const root = resolve('/work/atropyle');
  expect(webOutOf(root)).toBe(join(root, 'apps', 'web', 'out'));
  expect(outDirProblem(root, root)).toContain('repository root');
  expect(outDirProblem(resolve('/work'), root)).toContain('repository root');
  expect(outDirProblem(join(root, 'apps', 'web', 'out'), root)).toContain('apps/web/out');
  expect(outDirProblem(join(root, 'apps', 'web', 'out', 'x'), root)).toContain('apps/web/out');
  expect(outDirProblem(join(root, 'apps', 'web'), root)).toContain('apps/web/out');
  expect(outDirProblem(join(root, 'site-dist', 'deweb'), root)).toBeNull();
  expect(outDirProblem(resolve('/tmp/site'), root)).toBeNull();
});
```

Thay toàn bộ `scripts/test/site/site-check.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterAll, expect, test } from 'vitest';
import { siteProblems } from '../../lib/site-check';

const NOT_FOUND = '<!doctype html><title>Not found</title>';
const temps: string[] = [];
const temp = () => {
  const d = mkdtempSync(join(tmpdir(), 'atropyle-site-'));
  temps.push(d);
  return d;
};
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

test('siteProblems reports a missing index.html', () => {
  const dir = temp();
  expect(siteProblems(dir, 'deweb')).toEqual([
    `index.html is missing in ${dir.split(sep).join('/')}; run npm run site:build -- --target deweb`,
  ]);
});

test('siteProblems requires 404.html, the page the gateway serves for unknown paths', () => {
  const dir = temp();
  writeFileSync(join(dir, 'index.html'), '<!doctype html>');
  expect(siteProblems(dir, 'deweb')).toEqual([
    '404.html is missing: the gateway serves it for every unknown path (deweb:publish sets it as the fallback)',
  ]);
  writeFileSync(join(dir, '404.html'), NOT_FOUND);
  expect(siteProblems(dir, 'deweb')).toEqual([]);
});

test('siteProblems reports external references and every internal link the gateway would not serve as written', () => {
  const dir = temp();
  writeFileSync(
    join(dir, 'index.html'),
    '<img src="https://cdn.example/logo.png"><a href="/proof/">Proof</a><a href="/status/">Status</a>',
  );
  writeFileSync(join(dir, '404.html'), NOT_FOUND);
  mkdirSync(join(dir, 'status'));
  writeFileSync(join(dir, 'status', 'index.html'), '<a href="../">Home</a>');
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs', 'index.html'), '<a href="guide">Guide</a>');
  expect(siteProblems(dir, 'deweb')).toEqual([
    'index.html: external reference https://cdn.example/logo.png (html) breaks the 100% on-chain badge',
    'docs/index.html: link docs/guide falls back to 404.html on the gateway',
    'index.html: link proof/index.html does not exist on the gateway',
  ]);
});
```

Sửa ba test DeWEB:
- `scripts/test/site/deweb.test.ts`, trong test `defaults to a dry run` của `describe('parsePublishArgs')`: đổi `fallback: 'index.html',` thành `fallback: '404.html',`.
- `scripts/test/site/deweb-cli.test.ts`: ngay sau dòng `writeFileSync(join(siteDir, 'index.html'), '<!doctype html><title>cli</title>');` thêm `writeFileSync(join(siteDir, '404.html'), '<!doctype html><title>missing</title>');`; trong test `a dry run without a site file plans every file as new…`, đổi `expect(lines).toContain('fallback  index.html');` thành hai dòng:

```ts
    expect(lines).toContain('new       404.html (37 B, 1 tx)');
    expect(lines).toContain('fallback  404.html');
```

- `scripts/test/site/deweb-local.test.ts`: trong dòng `common = ['--rpc', anvil.url, '--container', CONTAINER, '--dir', site, '--site', join(dir, 'none.json')];` thêm `'--fallback', 'index.html'` vào cuối mảng (site thử của test này không có `404.html`; test vẫn đọc `fallbackPath()` = `'index.html'`, và nhờ thế cờ `--fallback` có một test đi hết đường). Làm đúng như vậy với dòng `const common = [...]` trong `scripts/test/site/deweb-fork.test.ts`.

Run: `npx vitest run --config scripts/vitest.site.config.ts scripts/test/site/site-build.test.ts scripts/test/site/site-check.test.ts scripts/test/site/deweb.test.ts`
Expected: FAIL. `site-build`: `keepInSite is not a function`, thông báo `--target must be deweb or pages`, env còn `VITE_TARGET`; `site-check`: không có dòng `404.html is missing…`, link `/proof/` không bị báo; `deweb`: `expected 'index.html' to be '404.html'`.

- [ ] **Step 3: Script site chỉ còn DeWEB, đọc bản xuất Next**

Trong `scripts/lib/site-files.ts`, ngay sau dòng `export const LIMITS = …`, thêm:

```ts
/** The page the gateway serves for an unknown path (the container's `fallbackPath`): the web app's 404 page. */
export const DEFAULT_FALLBACK = '404.html';
```

Trong `scripts/lib/deweb.ts`: đổi `import { CHUNK_MAX, type SiteFile } from './site-files';` thành `import { CHUNK_MAX, DEFAULT_FALLBACK, type SiteFile } from './site-files';`, và trong `parsePublishArgs` đổi `fallback: 'index.html',` thành `fallback: DEFAULT_FALLBACK,`. Trong `scripts/deweb-publish.ts`, dòng comment đầu file: `[--fallback index.html]` thành `[--fallback 404.html]`.

Thay toàn bộ `scripts/lib/site-build.ts`:

```ts
import { existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';

/** The one static target the scripts build and publish. Vercel builds the vercel target itself (spec §10). */
export type SiteTarget = 'deweb';

export interface SiteArgs {
  target: SiteTarget;
  docs: boolean;
  dir: string;
}

export function parseSiteArgs(argv: readonly string[]): SiteArgs {
  let target: string | undefined;
  let docs = true;
  let dir: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--target') target = value();
    else if (a.startsWith('--target=')) target = a.slice('--target='.length);
    else if (a === '--no-docs') docs = false;
    else if (a === '--out') dir = value();
    else throw new Error(`unknown argument: ${a}`);
  }
  if (target === 'pages') {
    throw new Error('--target pages: GitHub Pages is no longer built (spec §10); Vercel builds the vercel target itself');
  }
  if (target !== 'deweb') throw new Error('--target must be deweb');
  return { target, docs, dir: dir ?? `site-dist/${target}` };
}

/** Docs base path; the docs app reads it as process.env.DOCS_BASE (Plan 6). */
export const DOCS_BASE: Record<SiteTarget, string> = { deweb: '/docs/' };

/** Where `next build` writes the static export (OUT_DIR of apps/web/scripts/lib/run-next.ts). */
export const webOutOf = (root: string): string => join(root, 'apps', 'web', 'out');

/** Only the vercel build links the social card, and on DeWEB every byte is paid in gas. Paths relative to out/. */
export const DEWEB_SKIP: ReadonlySet<string> = new Set(['og.png']);
export const keepInSite = (path: string): boolean => !DEWEB_SKIP.has(path);

/**
 * Site builds are mainnet deweb builds. Every URL that must not reach DeWEB is dropped before Next starts;
 * apps/web/scripts/lib/build-env.ts blanks the backend URL again, and siteUrlOf ignores the site URL on deweb.
 */
export function webEnv(target: SiteTarget, withDocs: boolean, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, NEXT_PUBLIC_TARGET: target, NEXT_PUBLIC_CHAIN: 'xlayer' };
  for (const key of [
    'NEXT_PUBLIC_DEPLOYMENT',
    'NEXT_PUBLIC_API_URL',
    'NEXT_PUBLIC_SITE_URL',
    'VERCEL_PROJECT_PRODUCTION_URL',
    'ATROPYLE_E2E',
  ]) {
    delete env[key];
  }
  if (withDocs) env.NEXT_PUBLIC_DOCS_PATH = DOCS_BASE[target];
  else delete env.NEXT_PUBLIC_DOCS_PATH;
  return env;
}

export function docsEnv(target: SiteTarget, base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...base, DOCS_BASE: DOCS_BASE[target] };
}

export function hasDocsWorkspace(root: string): boolean {
  return existsSync(join(root, 'apps', 'docs', 'package.json'));
}

const contains = (outer: string, inner: string) => {
  const r = relative(outer, inner);
  return r === '' || (!r.startsWith('..') && !isAbsolute(r));
};

/**
 * `site:build` deletes the output directory first. Refuse one that is, contains or lies inside the repo root
 * or the Next export, so a wrong `--out` cannot wipe the checkout.
 */
export function outDirProblem(out: string, root: string): string | null {
  const o = resolve(out);
  const webOut = webOutOf(root);
  if (contains(o, resolve(root))) {
    return `--out ${o} is the repository root or one of its parents; refusing to delete it`;
  }
  if (contains(o, webOut) || contains(webOut, o)) {
    return `--out ${o} overlaps apps/web/out, which the build copies from; choose another directory`;
  }
  return null;
}
```

Thay toàn bộ `scripts/lib/site-check.ts`:

```ts
import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { checkInternalLinks } from './gateway-path';
import { checkSite } from './onchain-check';
import type { SiteTarget } from './site-build';
import { DEFAULT_FALLBACK, limitProblems, loadSite } from './site-files';

export function siteProblems(dir: string, target: SiteTarget): string[] {
  if (!existsSync(join(dir, 'index.html'))) {
    return [`index.html is missing in ${dir.split(sep).join('/')}; run npm run site:build -- --target ${target}`];
  }
  const files = loadSite(dir);
  const out = limitProblems(files);
  if (!files.some((f) => f.path === DEFAULT_FALLBACK)) {
    out.push(
      `${DEFAULT_FALLBACK} is missing: the gateway serves it for every unknown path (deweb:publish sets it as the fallback)`,
    );
  }
  const report = checkSite(files);
  for (const f of report.external) {
    out.push(`${f.path}: external reference ${f.url} (${f.where}) breaks the 100% on-chain badge`);
  }
  for (const f of report.js) {
    out.push(
      `${f.path}: unknown host in JS: ${f.url}; if the page never requests it, add it to TEXT_ONLY_HOSTS with a reason`,
    );
  }
  // Every page, web and docs: with a 404 fallback, a broken link would quietly land on the 404 page.
  for (const l of checkInternalLinks(files, '', DEFAULT_FALLBACK)) {
    const why = l.problem === 'fallback' ? `falls back to ${DEFAULT_FALLBACK} on the gateway` : 'does not exist on the gateway';
    out.push(`${l.from}: link ${l.ref} ${why}`);
  }
  return out;
}
```

Thay toàn bộ `scripts/build-site.ts`:

```ts
// npm run site:build -- --target deweb [--no-docs] [--out <dir>]
// The static export of apps/web at the root of site-dist/deweb; docs under docs/ when the apps/docs workspace exists.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { docsEnv, hasDocsWorkspace, keepInSite, outDirProblem, parseSiteArgs, webEnv, webOutOf } from './lib/site-build';
import { siteProblems } from './lib/site-check';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const posix = (p: string) => p.split(sep).join('/');

class Fail extends Error {
  constructor(
    message: string,
    readonly code = 2,
  ) {
    super(message);
  }
}

/** Runs `npm <args>`. Never passes an args array together with `shell: true` (Node DEP0190). */
function npm(args: string[], env: NodeJS.ProcessEnv): void {
  const execpath = env.npm_execpath;
  const r = execpath
    ? spawnSync(process.execPath, [execpath, ...args], { cwd: ROOT, env, stdio: 'inherit' })
    : spawnSync(`npm ${args.join(' ')}`, { cwd: ROOT, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    const why = r.error ? `: ${r.error.message}` : '';
    throw new Fail(`npm ${args.join(' ')} failed${why}`, r.status ?? 1);
  }
}

function main(): void {
  const args = parseSiteArgs(process.argv.slice(2));
  const out = resolve(ROOT, args.dir);
  const refused = outDirProblem(out, ROOT);
  if (refused) throw new Fail(refused);
  const docs = args.docs && hasDocsWorkspace(ROOT);
  if (args.docs && !docs) console.log('apps/docs does not exist yet: building the web app only.');

  npm(['run', 'build', '-w', 'apps/web'], webEnv(args.target, docs, process.env));
  const webOut = webOutOf(ROOT);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(webOut, out, { recursive: true, filter: (src) => keepInSite(posix(relative(webOut, src))) });
  if (docs) {
    npm(['run', 'build', '-w', 'apps/docs'], docsEnv(args.target, process.env));
    cpSync(join(ROOT, 'apps', 'docs', 'dist'), join(out, 'docs'), { recursive: true });
  }

  const problems = siteProblems(out, args.target);
  if (problems.length > 0) {
    for (const p of problems) console.error(`- ${p}`);
    if (docs) console.error('The docs are not DeWEB-clean yet. Rebuild with --no-docs to publish the web app only.');
    throw new Fail(`${problems.length} problem(s) in ${posix(out)}`, 1);
  }
  console.log(`${posix(out)}: ready for ${args.target}${docs ? ' (web + docs)' : ' (web only)'}`);
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(e instanceof Fail ? e.code : 2);
}
```

Thay toàn bộ `scripts/check-site.ts`:

```ts
// npm run site:check -- --target deweb [--out <dir>]
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSiteArgs } from './lib/site-build';
import { siteProblems } from './lib/site-check';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

try {
  const args = parseSiteArgs(process.argv.slice(2));
  const dir = resolve(ROOT, args.dir);
  const shown = dir.split(sep).join('/');
  const problems = siteProblems(dir, args.target);
  if (problems.length > 0) {
    for (const p of problems) console.error(`- ${p}`);
    console.error(`${problems.length} problem(s) in ${shown}`);
    process.exit(1);
  }
  console.log(`${shown}: OK for ${args.target} (no external references)`);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(2);
}
```

`scripts/test/site/deweb-bundle.test.ts` dựng web Preact bằng Vite để chứng minh URL Worker không lọt vào bản DeWEB; bản mới có `test/build/api-url.test.ts` và `html-purity.test.ts` của 7A, `social.test.ts` của Task 11 và bước CI ở Step 4. Xoá nó:

```bash
git rm -q scripts/test/site/deweb-bundle.test.ts
```

Run: `npx vitest run --config scripts/vitest.site.config.ts scripts/test/site/site-build.test.ts scripts/test/site/site-check.test.ts scripts/test/site/deweb.test.ts scripts/test/site/deweb-cli.test.ts`
Expected: PASS (site-build 6, site-check 3, cùng mọi test của `deweb` và `deweb-cli`).

- [ ] **Step 4: Xoá web cũ, đổi job CI**

```bash
git rm -r -q apps/web-legacy
rm -rf apps/web-legacy
sed -i '/apps\/web-legacy/d' .gitignore biome.json
node -e "JSON.parse(require('fs').readFileSync('biome.json','utf8')); console.log('biome.json parses')"
sed -i 's#apps/web-legacy/src/lib/rpc.ts#apps/web/src/chain/impl/rpc.ts#' scripts/lib/onchain-check.ts scripts/test/site/onchain-check.test.ts
git rm -q scripts/test/site/ci-web.test.ts
git mv scripts/test/site/ci-web-next.test.ts scripts/test/site/ci-web.test.ts
F=scripts/test/site/ci-web.test.ts
sed -i -e "s#workflow.jobs\['web-next'\]#workflow.jobs['web']#" -e 's#the web-next job#the web job#g' -e 's#WEB_NEXT_COMMANDS#WEB_COMMANDS#g' -e 's#as Plan 7A Task 15 leaves it#as Plan 7C Task 12 leaves it#' $F
```

Expected: `biome.json parses`. (`sed` xoá các dòng `apps/web-legacy/…` mà 7A Task 1 đổi tên; chúng không phải phần tử cuối của mảng `files.includes`, vì 7A chèn các dòng `apps/web/` mới sau chúng.)

Trong `scripts/test/site/ci-web.test.ts`:
- trong mảng `WEB_COMMANDS`, thêm `'npm run test:site',` ngay sau `'npm test -w apps/web',`, và thêm hai dòng `'npm run site:build -- --target deweb --no-docs',` và `'npm run site:check -- --target deweb',` ngay sau `'npm run e2e -w apps/web',`;
- trong test `size and Lighthouse read a fresh production build…`, thêm `'npm run site:build -- --target deweb --no-docs',` vào mảng `before`;
- thêm vào cuối file:

```ts
test('the DeWEB site is built with URLs that must not reach it, and nothing builds Pages or the legacy app', () => {
  const site = job.steps.find((s) => s.run?.includes('npm run site:build'));
  expect(site?.env?.NEXT_PUBLIC_API_URL).toBe('https://api.atropyle.invalid/functions/v1');
  expect(site?.env?.NEXT_PUBLIC_SITE_URL).toBe('https://site.atropyle.invalid');
  expect(JSON.stringify(workflow)).not.toMatch(/--target pages|web-legacy|web-next/);
  const c = commands();
  expect(c.indexOf('npm run e2e -w apps/web')).toBeLessThan(c.indexOf('npm run site:build -- --target deweb --no-docs'));
});
```

Run: `npx vitest run --config scripts/vitest.site.config.ts scripts/test/site/ci-web.test.ts`
Expected: FAIL, `expected undefined to be defined` (chưa có job `web` mới).

Trong `.github/workflows/ci.yml`:
1. Xoá toàn bộ job `web` cũ: từ hai dòng comment `# Read-only and keyless. test:site runs deweb-publish and a local forge script…` ngay trên `  web:` tới bước `upload-artifact` cuối của job đó (dòng `retention-days: 7` trước comment của job kế).
2. Thay dòng comment ngay trên `  web-next:` (hai dòng `# The Next.js web app v2 (Plan 7A)…`) và dòng `  web-next:` bằng:

```yaml
  # The web app (Next.js static export) and the DeWEB site scripts. Read-only and keyless: e2e and test:site send only
  # from unlocked accounts of their own anvil (test:site also runs a local forge script that way), and no step signs or
  # broadcasts anything to a real chain.
  web:
```

3. Trong job đó, ngay sau bước `Typecheck and unit tests`, thêm:

```yaml
      - name: Site script tests, on their own anvil
        run: npm run test:site
```

4. Ngay sau bước `E2E on a local anvil…`, thêm:

```yaml
      - name: DeWEB site built with backend and site URLs that must not reach it
        run: npm run site:build -- --target deweb --no-docs && npm run site:check -- --target deweb
        env:
          NEXT_PUBLIC_API_URL: https://api.atropyle.invalid/functions/v1
          NEXT_PUBLIC_SITE_URL: https://site.atropyle.invalid
```

5. Đổi `name: web-next-reports` thành `name: web-reports`.

Run: `npx vitest run --config scripts/vitest.site.config.ts scripts/test/site/ci-web.test.ts scripts/test/site/onchain-check.test.ts`
Expected: PASS (`ci-web` 7 test; `RPC_HOSTS equals the hosts of the web ONCHAIN_RPCS` đọc `apps/web/src/chain/impl/rpc.ts`).

- [ ] **Step 5: Lockfile, AGENTS, README, runbook**

```bash
npm install
npm run lockfile:check -- --fix
npm run lockfile:check
git grep -n "web-legacy" -- . ':!docs' ':!package-lock.json'
```

Expected: `npm install` bỏ workspace `apps/web-legacy`, link `node_modules/@atropyle/web-legacy` và các gói chỉ bản Preact dùng; `lockfile:check` cuối in `every dependency resolves.` (nếu `--fix` in `added node_modules/@emnapi/…`, đó là bẫy Windows; giữ thay đổi). `git grep` chỉ còn các dòng trong `AGENTS.md` mà bước sau sửa.

Trong `AGENTS.md`:

```bash
sed -i '/^| `apps\/web-legacy\/`/d' AGENTS.md
sed -i 's#-w apps/web-legacy#-w apps/web#g' AGENTS.md
sed -i 's#built by Plans 7A and 7B#built by Plans 7A, 7B and 7C#' AGENTS.md
```

rồi thay đoạn bắt đầu bằng `The site scripts and the web app have their own checks.` cùng khối ` ```bash ` ngay sau nó, **và** đoạn bắt đầu bằng ``The web app v2 in `apps/web` has its own checks.`` cùng khối ` ```bash ` ngay sau nó, bằng một đoạn:

~~~markdown
The web app and the site scripts have their own checks. `npm run test:site` and `npm run e2e -w apps/web` need the output of `forge build` in `contracts/`. `npm run playwright:install -w apps/web` installs Chromium once, for `worker:check`, `e2e` and `lighthouse`. `size` and `lighthouse` read the production build in `apps/web/out`, so run `npm run build -w apps/web` right before them. The site scripts build and check the DeWEB site only; Vercel builds the `vercel` target itself.

```bash
cd contracts && forge build && cd ..
npm run test:site
npm run typecheck -w apps/web
npm run test:build -w apps/web
npm run playwright:install -w apps/web
npm run worker:check -w apps/web
npm run e2e -w apps/web
npm run site:build -- --target deweb --no-docs
npm run site:check -- --target deweb
npm run build -w apps/web
npm run size -w apps/web
npm run lighthouse -w apps/web
```
~~~

Run: `grep -n "web-legacy\|--target pages\|GitHub Pages" AGENTS.md`
Expected: không dòng nào.

Trong `apps/web/README.md`, thêm trước mục `## Commands`:

~~~markdown
## DeWEB site

`npm run site:build -- --target deweb` (at the repository root) builds the `deweb` target for mainnet and copies `out/` into `site-dist/deweb`, without `og.png`: only the `vercel` build links the card, and on DeWEB every byte costs gas. `npm run site:check -- --target deweb` and `npm run deweb:publish` read that folder. Unknown paths fall back to `404.html`. The runbook is `docs/deployments.md`.
~~~

Trong `docs/deployments.md`:

```bash
sed -i 's#`fallbackPath` = `"index.html"`#`fallbackPath` = `"404.html"`#g' docs/deployments.md
sed -i 's#(docs chỉ trên Pages)#(docs chờ Plan 6)#' docs/deployments.md
```

và ở bước 8 ("Kiểm trong trình duyệt thật"): mục 1, thay câu `Mở \`#/proof\`, bấm chạy; chờ kết quả.` bằng `Mở \`/proof/\`, bấm "Run the proof"; chờ kết luận.`; mục 4, thay `Mở một trang vault (` bằng `Mở \`/vault/#<địa chỉ vault>\` (`; thêm mục 7 sau mục 6:

```markdown
7. Mở `/prof/` trên cùng host: trang 404 hiện (fallback `404.html`) và gợi ý `/proof/`.
```

Run: `grep -n 'index.html"\|Pages\|#/proof' docs/deployments.md`
Expected: không dòng nào.

- [ ] **Step 6: Bản build site thật, rồi sửa `TEXT_ONLY_HOSTS` theo đúng báo cáo**

```bash
npm run build
NEXT_PUBLIC_API_URL=https://api.atropyle.invalid/functions/v1 npm run site:build -- --target deweb --no-docs
```

Expected lần đầu: FAIL với các dòng `unknown host in JS` cho host mà bundle Next có nhưng web Preact không có. Dự kiến `react.dev` (React bản production nối link `react.dev/errors/<mã>` vào thông báo lỗi) và `nextjs.org` (thông báo lỗi của Next). Với **mỗi** host được báo, mở chunk được nêu và đọc ngữ cảnh: `grep -o '.\{80\}<host>.\{80\}' site-dist/deweb/<đường dẫn chunk>`. Chỉ thêm host vào `TEXT_ONLY_HOSTS` khi nó nằm trong chuỗi văn bản (thông báo lỗi, namespace, link điều hướng), không bao giờ trong `fetch`, `src` hay URL RPC. Host bị gọi thật thì đó là lỗi của trang: sửa trang, không nới danh sách. Không bao giờ có `api.atropyle.invalid` trong báo cáo; nếu có, `webEnv` hoặc `buildEnvFor` đã để lọt URL backend: dừng và sửa.

Trong `scripts/lib/onchain-check.ts`, thêm vào `TEXT_ONLY_HOSTS` (giữ thứ tự chữ cái không bắt buộc; đặt sau `'viem.sh'`):

```ts
  'react.dev': 'React production error messages link to react.dev/errors; text only',
  'nextjs.org': 'Next.js error messages link to its docs; text only',
```

và sửa lý do của các khoá có sẵn cho đúng app mới:

```ts
  'duongnq2798.github.io': 'docs links (DOCS_BASE_URL, until Plan 6 moves the docs); navigation, not a request',
  'github.com': 'repository links on /developers/ and in error hints; navigation, not a request',
  'www.npmjs.com': 'package links on /developers/; navigation, not a request',
  'www.w3.org': 'SVG, MathML and XLink namespace URIs inside React DOM; identifiers, never fetched',
  '127.0.0.1': 'the SDK built-in local devnet deployment; only used when NEXT_PUBLIC_CHAIN=local',
  localhost: 'webUrl of the SDK built-in local devnet deployment; only used when NEXT_PUBLIC_CHAIN=local',
```

và trong `OPT_IN_HOSTS`: `'second RPC operator for verify; only after "Cross-check" on /status/, which warns the badge is lost'`.

Run lại:

```bash
NEXT_PUBLIC_API_URL=https://api.atropyle.invalid/functions/v1 npm run site:build -- --target deweb --no-docs
npm run site:check -- --target deweb
ls site-dist/deweb/404.html site-dist/deweb/manifest.webmanifest
ls site-dist/deweb/og.png
```

Expected: `site-dist/deweb: ready for deweb (web only)`; `site-dist/deweb: OK for deweb (no external references)`; `ls` đầu liệt kê hai file; `ls` cuối báo `No such file or directory` (ảnh OG không lên DeWEB). Nếu `site:check` báo `link … does not exist on the gateway` hay `falls back to 404.html`, một trang có link hỏng: sửa link trong trang, không nới kiểm tra.

- [ ] **Step 7: Kiểm toàn bộ và commit 1**

```bash
npm test
npm run typecheck
npx biome check --write scripts/build-site.ts scripts/check-site.ts scripts/lib scripts/test/site
npx biome ci .
npm run test:site
npm run e2e -w apps/web
```

Expected: tất cả PASS. `npm run typecheck` gồm `typecheck:scripts`, nên không còn chỗ nào dùng `'pages'` làm `SiteTarget`.

```bash
git add .github/workflows/ci.yml .gitignore biome.json package-lock.json AGENTS.md apps/web/README.md docs/deployments.md scripts/build-site.ts scripts/check-site.ts scripts/deweb-publish.ts scripts/lib/site-build.ts scripts/lib/site-check.ts scripts/lib/site-files.ts scripts/lib/deweb.ts scripts/lib/onchain-check.ts scripts/test/site/site-build.test.ts scripts/test/site/site-check.test.ts scripts/test/site/deweb.test.ts scripts/test/site/deweb-cli.test.ts scripts/test/site/deweb-local.test.ts scripts/test/site/deweb-fork.test.ts scripts/test/site/onchain-check.test.ts scripts/test/site/ci-web.test.ts
git status --short
git commit -m "build(site)!: publish the Next.js export to DeWEB and retire the Preact app" -m "site:build copies apps/web/out (without the social card) and builds DeWEB only: GitHub Pages is gone (spec §10). Unknown paths fall back to 404.html, so site:check now follows every internal link of the site. The web-next CI job becomes web and also runs the site script tests and a DeWEB build with backend and site URLs that must not leak." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected trước commit: `git status --short` chỉ có các file trên, các xoá của `apps/web-legacy/`, `scripts/test/site/deweb-bundle.test.ts` và rename `ci-web-next.test.ts → ci-web.test.ts` (đã stage bởi `git rm`/`git mv`); không có `prompts/`, `reports/`, `research_notes/` nào được stage.

- [ ] **Step 8: `webUrl` trỏ về bản Vercel**

Vẫn trong shell có `SITE_URL` (Step 1):

```bash
sed -i "s#\"webUrl\": \"https://duongnq2798.github.io/atropyle/\"#\"webUrl\": \"${SITE_URL%/}/\"#" deployments/xlayer.json
sed -i "s#default: 'https://duongnq2798.github.io/atropyle/'#default: '${SITE_URL%/}/'#" scripts/write-deployment.ts
sed -i "s#(https://duongnq2798.github.io/atropyle/)#(${SITE_URL%/}/)#" packages/sdk/README.md
npm run deployments:sync
npm run deployments:sync -- --check
git diff --stat deployments packages/sdk scripts/write-deployment.ts
```

Expected: `deployments: synced`, rồi `deployments: up to date`; `git diff --stat` có đúng một dòng đổi ở mỗi file `deployments/xlayer.json`, `packages/sdk/src/deployments/xlayer.ts`, `packages/sdk/README.md`, `scripts/write-deployment.ts`. URL docs (`DOCS_BASE_URL`, `$id` của schema CLI, `homepage` của plugin) giữ nguyên cho Plan 6.

Trong `docs/deployments.md`, bước 4 không còn đổi `webUrl` (Vercel là bản chính, spec §10):
- tiêu đề `#### 4. [CLAUDE] Ghi danh tính site, đổi \`webUrl\`, lập kế hoạch đăng` thành `#### 4. [CLAUDE] Ghi danh tính site, lập kế hoạch đăng`;
- trong lệnh `npm run deployment:write -- --web-url "$(node -p "require('./deployments/deweb.json').gatewayUrl")" ${BC:+…}`, xoá phần `--web-url "$(node -p "require('./deployments/deweb.json').gatewayUrl")" ` (mặc định của `--web-url` giờ là bản Vercel);
- thay gạch đầu dòng ``- `deployments/xlayer.json` có `webUrl` = `gatewayUrl`;`` bằng ``- `deployments/xlayer.json` giữ `webUrl` là bản Vercel (spec §10: Vercel là bản chính, DeWEB là bản 100% on-chain);``;
- commit message của bước đó thành `feat(web): record the DeWEB site identity`.

SDK mang `webUrl` mới vào bundle của web, nên host Vercel giờ có trong JS của bản DeWEB:

```bash
npm run build
npm test -w packages/sdk
NEXT_PUBLIC_API_URL=https://api.atropyle.invalid/functions/v1 npm run site:build -- --target deweb --no-docs
```

Expected: SDK PASS. `site:build` FAIL với đúng một dòng `unknown host in JS: https://<host của SITE_URL>`. Thêm vào `TEXT_ONLY_HOSTS` (khoá là hostname mà Step 1 in ra):

```ts
  '<hostname của SITE_URL>': 'deployment.webUrl, the hosted site on Vercel (spec §10): sign links handed to wallets; navigation, not a request',
```

Run lại `NEXT_PUBLIC_API_URL=https://api.atropyle.invalid/functions/v1 npm run site:build -- --target deweb --no-docs` và `npm run test:site`.
Expected: `ready for deweb (web only)`; test:site PASS.

```bash
npm run typecheck
npx biome ci .
git add deployments/xlayer.json packages/sdk/src/deployments/xlayer.ts packages/sdk/README.md scripts/write-deployment.ts scripts/lib/onchain-check.ts docs/deployments.md
git commit -m "feat(deployments): point webUrl at the hosted site" -m "Vercel is the main site (spec §10), so sign links from the SDK, the CLI and the MCP server open there; the DeWEB runbook no longer rewrites webUrl. Docs URLs stay for Plan 6." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: Bật lại tiền tải route**

Quyết định 22 của Plan 7A đặt `prefetch={false}` "cho tới khi Plan 7B dựng route đích"; giờ mọi route đã có.

```bash
git grep -n "prefetch={false}\|no prefetch\|Quyết định 22" -- apps/web/src
git grep -l "prefetch={false}" -- apps/web/src | xargs sed -i 's/ prefetch={false}//'
git grep -n "prefetch" -- apps/web/src
```

Expected: lệnh cuối chỉ còn các comment nhắc Quyết định 22 (nếu có); sửa tay từng comment đó, bỏ câu về prefetch. Rồi:

```bash
npm run typecheck
npm test -w apps/web
npm run e2e -w apps/web
npm run build -w apps/web && npm run size -w apps/web && npm run lighthouse -w apps/web
```

Expected: PASS. Lighthouse Best Practices vẫn 1 (không lỗi 404 nào trong console vì mọi route đích có `index.txt`); size không đổi (tiền tải không thêm JS lần tải đầu). Nếu e2e báo request lạ, đó là tiền tải tới một đường dẫn không có trang: sửa link đó.

```bash
npx biome ci .
git diff --name-only -- apps/web/src
git add $(git diff --name-only -- apps/web/src)
git commit -m "perf(web): prefetch routes again now that every page exists" -m "Plan 7A turned prefetch off until Plan 7B built the target routes; the cutover is that point." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git diff --name-only` in ra danh sách để kiểm trước; `git add` nhận đúng các đường dẫn đó, không `-A`.)

- [ ] **Step 10: Duyệt màn hình toàn site trên bản cuối**

```powershell
$env:SCREENS='home,create/,vault/#{guarded},verify/#{guarded},proof/,me/,join/#{guarded}.heir,status/,developers/,privacy/,prof/'; npm run e2e -w apps/web -- screens --project=desktop; Remove-Item Env:SCREENS
```

Expected: 132 ảnh trong `apps/web/screens/` (11 trang × 3 bề rộng × 2 theme × 2 ngôn ngữ). Lần này nhìn cả site như một: header, footer và nút ngôn ngữ giống nhau mọi trang; tiêu đề trang cùng một bậc chữ; không trang nào còn chữ hay link của web cũ (`#/…`); 404 gợi ý đúng; tiếng Việt không bị cắt ở 390 px. Liệt kê đường dẫn ảnh và mọi chỗ đã sửa trong báo cáo task.

- [ ] **Step 11: 60 fps trên CPU chậm 4× (spec §11, kiểm thủ công ghi vào PR)**

Bản build production phục vụ bằng server tĩnh của 7A (không cần dev server):

```bash
npm run build -w apps/web
cd apps/web && npx tsx -e "import('./scripts/lib/static-server.ts').then(async (m) => { const s = await m.startStaticServer('out', 4173); console.log(s.url); })"
```

Mở URL in ra trong Chrome, DevTools → Performance → CPU: 4× slowdown, theme tối, rồi ghi ba lần, mỗi lần khoảng 10 giây: (1) `/`, bấm một lần vào trang (đánh thức WebGL và mô phỏng, Quyết định 9) rồi cuộn hết sáu cảnh; (2) `/`, kéo thanh ngày của cảnh 2 qua lại; (3) `/proof/`, bấm chạy proof khi `NEXT_PUBLIC_CHAIN` là `xlayer` (đọc chain thật, chỉ đọc). Expected: dải FPS không rơi dưới 60 quá vài khung lẻ, không task dài hơn 50 ms lúc cuộn hay kéo; lần (3) chỉ luồng worker bận, luồng chính vẫn 60 fps. Ghi số FPS trung bình và khung tệ nhất của từng lần vào mô tả PR. Một lần không đạt: tìm hàm nóng trong flame chart và sửa trước khi merge (nếu thủ phạm là lớp WebGL và không sửa kịp, thứ tự cắt mục 4 của spec cho phép bỏ nó, giữ sợi chỉ SVG). Dừng server bằng Ctrl+C.

---

## Tự kiểm của plan

**Phủ spec.**
- §3 route: `/` (Task 4–7), `/proof/` (Task 3), `/me/` (Task 8), `/join/`, `/alerts/confirm/`, `/alerts/unsubscribe/` (Task 9), `/status/`, `/developers/`, `/privacy/`, 404 (Task 10).
- §4.4 chuyển động:
  - `opacity` và `scaleX` cho hero (Task 4);
  - WebGL có điều kiện (Task 5);
  - hiện cảnh theo cuộn bằng `transform` (Task 7);
  - reduced motion ở mọi nơi.
- §4.6.1 proof trực quan: Task 1–3. §5.1 sáu cảnh: Task 4–7.
- §5.6: Task 8 (lệch: `vaultsOf` thay `scan`, Quyết định 10).
- §5.7: Task 9 (lệch: huỷ cần một cú bấm, Quyết định 11).
- §5.8: Task 10.
- §9.5 và §9.6 qua `src/api/hooks.ts` của 7A: `/me` ở Task 8, xác nhận và huỷ ở Task 9, health ở Task 10, đăng ký qua `SubscribeForm` của 7B.
- Hàng "Metadata" của §5: Task 11 (một ảnh chung, thứ tự cắt mục 2).
- §10 và §13: Task 12.
- §11:
  - ngân sách và Lighthouse ở mọi task chạm `/` hoặc `/proof/` (Task 3 thêm `/proof/` vào Lighthouse);
  - axe hai theme ở mọi trang mới;
  - ảnh 390, 768, 1440 px qua harness của Task 3 và lượt toàn site ở Task 12 Step 10;
  - 60 fps ở Task 12 Step 11.
- Lệch spec còn lại: proof chỉ chạy khi bấm (Quyết định 2).

**Quét placeholder.** Không còn "TBD", "TODO", "tương tự Task N" hay câu "nếu typecheck báo thì…". Hai giá trị chỉ biết lúc chạy, đều là đầu vào có kiểm, không phải chỗ trống:
- `SITE_URL` (Task 12 Step 1, do controller đưa, kiểm bằng `node`);
- hostname của nó trong `TEXT_ONLY_HOSTS` (Task 12 Step 8, lấy từ output của Step 1).

**Nhất quán kiểu.** Đã đối chiếu tên giữa các task:
- `useProofRun(blocks?)` (Task 3, Task 7 dùng `MINI_BLOCKS`);
- `COMMANDS`, `CommandName`, `formatCount` (Task 3; Task 7 và 10 dùng);
- `useFirstInteraction`, `useInView` (Task 5; Task 6 và 7 dùng);
- `Scene` (Task 6; Task 7 dùng);
- `wirePaths`, `dotsPath`, `smoothPath`, `pointsOf`, `THREAD`, `VIEW` (Task 4; Task 11 dùng);
- `SubscribeForm` đúng giao diện cố định (Task 9);
- `siteUrlOf` bỏ qua URL site trên deweb (Task 11), và `webEnv` của Task 12 xoá biến đó thêm một lần;
- `DEFAULT_FALLBACK` (Task 12) khớp file `404.html` mà `not-found.tsx` của Task 10 sinh ra.

**Review Focus → test.**
1. Link mời hỏng: Task 9 `invite.test.ts` (checksum EIP-55, thiếu hay thừa phần, vai trò lạ) và `join.spec.ts` (không form, không gọi chain với dữ liệu rác).
2. Link email mở hai lần, StrictMode, máy quét, token sai dạng: Task 9 `alerts.test.tsx` (đúng một `POST` xác nhận, huỷ không gửi gì khi chưa bấm, token sai dạng không gửi gì).
3. Bản đồ giữa chừng, chạy lại, đổi theme: Task 2 `paint.test.ts` (song ánh, nghịch đảo) và `proof-canvas.test.tsx` (về nền khi chạy lại, vẽ lại màu khi đổi theme mà giữ tiến độ).
4. Backend và chain không khớp ở `/me/`: Task 8 `me-merge.test.ts` (chain thắng, gộp không phân biệt hoa thường, trạng thái chỉ từ chain).
5. Không WebGL, mất context, reduced motion, Save-Data: Task 5 `hero-gl.test.ts` và `home.spec.ts` (SVG đứng một mình, không lỗi console).
