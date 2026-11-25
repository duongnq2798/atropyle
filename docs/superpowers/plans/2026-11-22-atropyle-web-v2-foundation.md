# Atropyle Plan 7A — Nền tảng web v2 (Next.js) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển web Preact sang `apps/web-legacy`, dựng ở `apps/web` một app Next.js 16 xuất tĩnh (hai target `vercel` và `deweb`) với đủ nền móng cho Plan 7B dựng trang: token màu và chữ đạt AA, font tự host, i18n EN/VI, motion và `HoldButton`, `Thread` và `StateBadge`, bộ primitive, khung trang với chuyển hướng link cũ, lớp ví và `ConnectSheet`, đọc chain bằng TanStack Query, Web Worker cho proof, engine giao dịch `useTxRunner`, client API (chỉ bản vercel), CSP theo hash, ngân sách kích thước, e2e có axe và Lighthouse.

**Architecture:**
- `next build` với `output: 'export'` sinh `out/` tĩnh. Một wrapper (`scripts/next.ts`) tắt telemetry, kiểm target, đặt rỗng `NEXT_PUBLIC_API_URL` ở bản deweb, chọn bundler theo kết quả spike, rồi chạy bước postbuild chèn CSP có hash của mọi script inline.
- **Ranh giới nạp lười:** mã khung (shell, primitive, hook) chỉ `import type` từ `@atropyle/sdk` và `viem`. Giá trị của SDK và viem chỉ được nạp qua `import()` từ các file trong thư mục `impl/`, từ `src/workers/` và từ thư mục route con `src/app/<segment>/`. Một test quét mã nguồn giữ luật này, để trang `/` đạt 200 kB gzip (R23).
- Logic thuần đã có test của web cũ (i18n, store, format, tx-view, wallet, send-calls, verify-client, rpc, sdk, stats-view, errors-view) được port nguyên văn kèm test. Giao diện viết mới bằng React 19, Tailwind v4, Radix và `motion`.
- E2E Playwright chạy bản build `deweb` trên anvil với ví giả (port từ web cũ), kiểm axe ở cả hai theme, kiểm mọi request (badge "100% on-chain") và mọi vi phạm CSP.

**Tech Stack:** Next.js 16.4.6 (App Router, static export), React 19.3.1, TypeScript 5.9.3, Tailwind CSS 4.3.5 (`@tailwindcss/postcss`), `motion` 14.14.0, Radix (dialog 1.3.1, popover 1.3.1, tooltip 1.4.1, visually-hidden 1.2.13), lucide-react 1.73.0, @tanstack/react-query 5.107.1, uqr 0.1.3, viem 2.58.0, `@atropyle/sdk` 0.1.0, Fontsource variable 5.3.0 (Fraunces, Inter, JetBrains Mono, chỉ dùng lúc dev để chép woff2), Vitest 3.2.7 + happy-dom 21.0.4 + @testing-library/react 16.3.3 + @testing-library/jest-dom 7.0.1, @playwright/test 1.65.1 + @axe-core/playwright 4.14.0, size-limit 14.3.0, lighthouse 13.6.0 + chrome-launcher 1.2.3, tsx 4.20.6, Biome 2.6.8.

**Spec:**
- `docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md` (§0–§8, §9.6, §10–§13, §16, §17). §9.6 là hợp đồng API, không được sửa.
- Plan 4 (web cũ, để biết mã được port): `docs/superpowers/plans/2026-11-18-atropyle-web.md`.
- Plan 7B (các trang) dùng mục "Interfaces for Plan 7B" ở cuối plan này.

## Global Constraints

- Node.js 24, npm workspaces (`circuits`, `packages/*`, `apps/*`, `examples/*`), Biome 2.6.8 (`npx biome ci .`), TypeScript 5.9.3 strict, Vitest 3.2.7. Mọi dependency ghim chính xác (`npm install -E`, không `^`).
- Phiên bản đã xác minh ngày 22/11/2026 (`npm view`, mỗi bản đã ra ít nhất 7 ngày): next 16.4.6; react, react-dom 19.3.1; @types/react, @types/react-dom 19.3.0; motion 14.14.0; tailwindcss, @tailwindcss/postcss 4.3.5; @radix-ui/react-dialog 1.3.1; @radix-ui/react-popover 1.3.1; @radix-ui/react-tooltip 1.4.1; @radix-ui/react-visually-hidden 1.2.13; lucide-react 1.73.0; @tanstack/react-query 5.107.1; uqr 0.1.3; @testing-library/react 16.3.3; @testing-library/dom 10.4.2; @testing-library/jest-dom 7.0.1 (8.0.0 ra ngày 19/11/2026, chưa đủ 7 ngày); happy-dom 21.0.4; @fontsource-variable/fraunces, inter, jetbrains-mono 5.3.0; @playwright/test 1.65.1; @axe-core/playwright 4.14.0; size-limit, @size-limit/file 14.3.0; lighthouse 13.6.0; chrome-launcher 1.2.3. Đã có trong repo: viem 2.58.0, vitest 3.2.7, tsx 4.20.6, typescript 5.9.3, @types/node 24.19.2, yaml 2.9.1.
- **Lockfile trên Windows:** npm trên Windows bỏ `@emnapi/core` và `@emnapi/runtime` khỏi `package-lock.json`, làm `npm ci` trên Linux hỏng. Mọi bước chạy `npm install` phải chạy ngay sau đó `npm run lockfile:check -- --fix` (Task 1 tạo lệnh này) và commit lockfile đã sửa.
- **Không khoá:** không private key, seed phrase hay `PRIVATE_KEY` ở đâu cả. Người dùng ký bằng ví của họ. Test trên anvil chỉ gửi bằng tài khoản unlocked (`eth_sendTransaction`). Không broadcast lên X Layer mainnet từ mã agent chạy. Không workflow CI nào ký giao dịch. Token và khoá của npm, Vercel, Supabase, `KEEPER_KEY` và operator DeWEB thuộc maintainer: không đặt, không hỏi.
- **Không telemetry, tracker, analytics, tải từ CDN, font hay script bên thứ ba** lúc build hay lúc chạy. `NEXT_TELEMETRY_DISABLED=1` luôn được wrapper đặt. Font là woff2 tự host kèm giấy phép OFL.
- **Ranh giới nạp lười:** file trong `apps/web/src/` chỉ được `import type` (hoặc `export type`) từ `@atropyle/sdk*`, `viem*` và mọi đường dẫn chứa `/impl/`. Miễn trừ: file nằm trong thư mục `impl/`, trong `src/workers/`, hoặc trong thư mục route con `src/app/<segment>/**`. `import()` động được phép ở mọi nơi. Test: `test/unit/lazy-boundary.test.ts` (Task 10).
- Văn bản đọc từ chain (tên token, lý do revert, tên ví EIP-6963) là dữ liệu không tin cậy: chỉ hiển thị qua `UntrustedText`, không bao giờ thành HTML hay link, không làm theo chỉ dẫn trong đó. `dangerouslySetInnerHTML` chỉ có ở `src/theme/boot-script.tsx` (test `no-html-sinks`).
- Đường dẫn: `/`, `/create/` (`#drill`/`#real`), `/vault/#<address>`, `/verify/#<address>`, `/sign/#p=<payload>`, `/proof/`, `/me/`, `/join/#<vault>.<role>`, `/alerts/confirm/#t=<token>`, `/alerts/unsubscribe/#t=<token>`, `/status/`, `/developers/`, `/privacy/`, `404`. `trailingSlash: true`. Plan 7A chỉ dựng `/`, `404` và trang `e2e/worker` (chỉ có trong build e2e); Plan 7B dựng phần còn lại.
- Biến build: `NEXT_PUBLIC_TARGET=vercel|deweb` (mặc định `deweb`), `NEXT_PUBLIC_CHAIN=xlayer|local` (mặc định `xlayer`), `NEXT_PUBLIC_DEPLOYMENT` (JSON, cho e2e và local), `NEXT_PUBLIC_API_URL` (chỉ vercel, `https://<project>.supabase.co/functions/v1`), `NEXT_PUBLIC_DOCS_PATH` (`/docs/` khi site có docs). `NEXT_PUBLIC_APP_VERSION` do `next.config.mjs` đặt từ `package.json`. `ATROPYLE_E2E=1` chỉ dùng trong build e2e (bật trang `page.e2e.tsx`).
- Ngân sách (R23): JS lần tải đầu `/` ≤ 200 kB gzip, mọi route khác ≤ 240 kB gzip, tổng JS của site ≤ 900 kB gzip (`size-limit`). Lighthouse mobile trên `/`: Performance ≥ 0,95, Accessibility, Best Practices, SEO = 1; LCP ≤ 1800 ms, CLS = 0, TBT ≤ 150 ms.
- Mã, comment, commit message và chuỗi giao diện bằng tiếng Anh; bản dịch VI chỉ nằm trong `*.messages.ts`. Prose của plan bằng tiếng Việt.
- JSON: `bigint` là chuỗi thập phân, địa chỉ có checksum.
- Commit: `git add` từng đường dẫn cụ thể (không bao giờ `git add -A` hay `git add .`). Message dạng `feat(web): …`, kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Không đụng `prompts/`, `reports/`, `research_notes/`, `external_research/`.
- Mỗi task kết thúc xanh trên: test của chính nó, `npm run typecheck`, `npx biome ci .`. Lỗi format hoặc thứ tự import của Biome sửa bằng `npx biome check --write <đường dẫn>`; lỗi lint khác sửa tay, không tắt luật.
- Thứ tự build: `npm run build` (circuits rồi SDK) trước mọi lệnh của `apps/web`, vì app đọc `dist` của SDK.
- Mọi lệnh trong plan chạy bằng Git Bash (cú pháp POSIX), không bao giờ bằng PowerShell, kể cả ở các task không ghi rõ.

## Quyết định

Mọi mục được xác minh chỉ-đọc ngày 22/11/2026 (bằng `npm view`, `npm pack` vào thư mục nháp và đọc file, hoặc đọc mã trong repo), trừ khi ghi khác.

1. **Phiên bản.** Danh sách ở Global Constraints. Hai gói có bản mới hơn nhưng chưa đủ 7 ngày nên lùi về bản trước: lucide-react 1.77.0 → **1.73.0**, @tanstack/react-query 5.108.2 → **5.107.1**. uqr 0.1.3 ra ngày 3/4/2026, MIT, không dependency, `sideEffects: false`. chrome-launcher 1.2.3. Trong lucide-react 1.73.0 (đọc `dist`): **không có** `CircleAlert`, `TriangleAlert`, `Fingerprint`; dùng `CircleExclamationPoint`, `TriangleExclamationPoint`. Lucide tự thêm `aria-hidden="true"` khi không có prop a11y; nét mặc định 2, plan luôn truyền `strokeWidth={1.5}` (spec §4.5).
2. **`next.config.mjs`, không `.ts`.** Next 16.4.6 biên dịch `next.config.ts` bằng SWC sang CommonJS (`handleCJS`, trừ khi bật `__NEXT_NODE_NATIVE_TS_LOADER_ENABLED`), nên `import.meta.url` không dùng được. File `.mjs` là ESM thật. Config là một hàm không tham số, để kiểm target lúc nạp và để trang `page.e2e.tsx` chỉ có khi `ATROPYLE_E2E=1`.
3. **Bundler: Turbopack mặc định, spike quyết định.** `next build` của 16.4.6 có cờ `--webpack` (đọc `dist/bin/next`). Task 2 dựng trang `page.e2e.tsx` tạo worker bằng `new Worker(new URL(...), { type: 'module' })`, worker import `@atropyle/sdk/verify` và một `import()` động, rồi chạy trong Chromium dưới CSP `worker-src 'self'`. Đạt với Turbopack thì giữ (`BUNDLER_FLAGS = []`); hỏng thì thử `--webpack`; cả hai hỏng thì dừng và báo BLOCKED. Kết quả ghi vào spec §16 hàng 15.
4. **tsconfig dùng `extends`.** `writeConfigurationDefaults` của Next 16.4.6 return ngay khi tsconfig có `extends` hoặc `references`, nên Next không tự sửa tsconfig lúc build. `next-env.d.ts` (Next tự sinh) bị ignore trong git và Biome, không nằm trong `include`.
5. **Telemetry:** `dist/telemetry/storage.js` tắt telemetry khi `NEXT_TELEMETRY_DISABLED` có giá trị. Wrapper luôn đặt `1`.
6. **Config cố định:** `output: 'export'`, `trailingSlash: true`, `images.unoptimized`, `reactStrictMode`, `productionBrowserSourceMaps: false`, `typescript.ignoreBuildErrors: true` (typecheck chạy riêng bằng `tsc`, Next không chạy lần hai), `turbopack.root` = gốc monorepo (Turbopack chỉ resolve file dưới thư mục này; `node_modules` nằm ở gốc). Không có khoá `viewTransition`: React 19.3.1 đã export `ViewTransition` và `addTransitionType` ổn định (đọc `cjs/react.production.js` và `@types/react` 19.3.0). **Task 15 ra Kết quả B:** bấm một `Link` thường không bao giờ gọi `document.startViewTransition` (spy của `test/e2e/motion.spec.ts`), nên React không mở view transition khi điều hướng. Vì vậy mọi link sang route khác dùng `NavLink` (`src/shell/nav-link.tsx`, Interfaces luật 18), và `<Thread shared>` tự đặt `view-transition-name` lên gốc của nó (spec §16 hàng 18).
7. **Token light được làm đậm để đạt AA** (tính bằng công thức WCAG 2.x). Spec §4.3 ghi `thread #A86F12`, `alive #127A63`, `grace #A35A00`; trên `surface-3 #E7DFD1` chúng không đạt 4,5:1. Plan dùng **`thread #86590E`, `alive #106F5A`, `grace #945100`** (tối thiểu 4,60:1 trên mọi surface). Thêm `on-thread`, `on-danger`, `line`, `line-strong` (≥ 3:1 cho viền điều khiển, WCAG 1.4.11). Tỉ lệ nhỏ nhất: dark 5,50 (danger trên surface-3), light 4,60 (thread trên surface-3); `ink/bg` dark 15,77 và light 16,45 (AAA). Task 3 cập nhật bảng §4.3 và thêm spec §16 hàng 16.
8. **Font bằng `next/font/local`, 9 lần gọi** (3 họ × 3 subset vietnamese, latin-ext, latin). Đọc `dist/compiled/@next/font/dist/local/loader.js` và validator: `declarations` được phép chứa `font-family` (loader bỏ tên họ tự sinh khi có `hasCustomFontFamily`), chỉ cấm `src`, `font-display`, `font-weight`, `font-style`. Nhờ vậy cả 3 file của một họ dùng chung tên `'Atropyle Fraunces'` với `unicode-range` riêng: trình duyệt chỉ tải subset cần. Chỉ subset latin có `adjustFontFallback` (sinh mặt `'Atropyle Fraunces Fallback'` có size-adjust, giữ CLS 0). Chỉ preload Fraunces latin và Inter latin. Plugin `postcss-next-font` của webpack đã đọc; hành vi của Turbopack với tên họ tự đặt nằm trong binary native nên chưa xác minh: test build `fonts.test.ts` (Task 4) quyết định, hỏng thì chuyển `BUNDLER_FLAGS` sang `--webpack`.
9. **Fontsource 5.3.0:** trục Fraunces `opsz 9–144`, `wght 100–900`, `SOFT 0–100`, `WONK 0–1`; Inter `wght 100–900`; JetBrains Mono `wght 100–800`. File `LICENSE` của cả ba là SIL OFL 1.1. Woff2 được chép vào `src/fonts/files/`; test so SHA-256 với `node_modules/@fontsource-variable/*/files`.
10. **Thang chữ** 8 bậc, fluid giữa viewport 360 và 1440 px (12 → 96 px): `caption 0.75rem`, `small 0.875rem`, `body clamp(1rem, 0.9792rem + 0.0926vw, 1.0625rem)`, `lead clamp(1.125rem, 1.0625rem + 0.2778vw, 1.3125rem)`, `title clamp(1.375rem, 1.25rem + 0.5556vw, 1.75rem)`, `h2 clamp(1.75rem, 1.5rem + 1.1111vw, 2.5rem)`, `h1 clamp(2.25rem, 1.6667rem + 2.5926vw, 4rem)`, `display clamp(2.75rem, 1.6667rem + 4.8148vw, 6rem)`. Tiêu đề VI có line-height ≥ 1.15 qua `:root:lang(vi)` (cần `@theme` không `inline` cho bậc chữ).
11. **Spring CSS:** `stiffness 380, damping 32, mass 1` có ζ = 0,8208, nghiệm x(t) = 1 − e^(−16t)(cos 11,1356t + 1,43683 sin 11,1356t). Lấy mẫu 25 điểm trong 443 ms thành `linear(...)` cho CSS (test so với công thức, sai số 0,0006). `motion` dùng chính bộ số này cho animation JS.
12. **CSP tách làm hai lớp** (spec §8 nói bản vercel đặt CSP qua header): `vercel.json` là file tĩnh trong repo nên không chứa được hash của script inline sinh ra lúc build. Vì vậy **cả hai bản** nhận `<meta http-equiv="Content-Security-Policy">` có hash từng trang (postbuild), còn header của Vercel chỉ mang những gì meta không làm được: `frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'` (không có `default-src`, vì header không hash được script inline sẽ chặn chúng). `style-src` cần `'unsafe-inline'`: HTML prerender chứa thuộc tính `style` (style ban đầu của `motion`, màu avatar). Task 15 thêm spec §16 hàng 17.
13. **Ranh giới nạp lười** (Global Constraints) để đạt 200 kB cho `/` (R23). Bốn thứ nhỏ của SDK được chép tại chỗ để khung không phải nạp SDK: `untrusted` (`src/lib/untrusted.ts`, bản sao từng byte của `packages/sdk/src/untrusted.ts`, có test so nội dung), `formatDuration` (test so hành vi), `DOCS_BASE_URL` (test so giá trị), `sameAddress`. `stringify` của store thay bằng `jsonStringify` tại chỗ (bigint thành chuỗi thập phân).
14. **Theme không nháy:** script inline duy nhất (`boot-script.tsx`) đặt `data-theme` trước khi vẽ, chỉ khi người dùng đã chọn vellum (`light`) hoặc match device (`system`). Night là mặc định và không cần thuộc tính (R18.1); giá trị rác là night. Cùng script chuyển hướng link cũ ở `/` (spec §3). Nguồn script là `Function.prototype.toString()` của hai hàm tự chứa, có test chạy thật trong `node:vm`, và test `leaves <html> as parseTheme reads the stored value` giữ script khớp với `parseTheme`.
15. **Ngôn ngữ:** static export không biết ngôn ngữ người xem, nên lần vẽ đầu luôn là EN, rồi effect đọc lựa chọn đã lưu hoặc `navigator.languages` và đổi sang VI nếu cần (chấp nhận một lần nháy chữ; ghi ở rủi ro). `<html lang>` được cập nhật theo.
16. **Link ngoài trên DeWEB:** quét tĩnh của gateway (`scripts/lib/onchain-check.ts`, regex `ATTR` trên `src|href|action|…`) tính cả `href` ra ngoài trong HTML prerender. Primitive `ExternalLink` ở bản deweb render chữ thường lúc prerender và lần vẽ đầu, chỉ thành `<a>` sau khi mount. Test build `html-purity.test.ts` (Task 15) giữ luật này.
17. **Ví:** giữ lớp ví tự viết (spec §16 hàng 8), port nguyên văn. Deep link OKX App chưa xác minh (spec §17), nên `ConnectSheet` khi không có ví chỉ hiện hướng dẫn, nút sao chép link và mã QR (uqr: `encode(text, { ecc, border })` trả `data: boolean[][]`, đọc `dist/index.d.ts`; render thành một `<path>` SVG, không dùng `renderSVG` vì nó trả chuỗi HTML).
18. **TanStack Query:** khoá query chỉ gồm chuỗi và số: `['atropyle', chainId, 'sdk', 'cross'|'own']`, `[..., 'vault', <địa chỉ chữ thường>]`, `[..., 'stats', 'api'|'chain']`, … Query SDK có `staleTime`/`gcTime` vô hạn, không retry, không structural sharing. Retry tối đa 2 lần, trừ mã lỗi vĩnh viễn (`NOT_VAULT`, `INVALID_ADDRESS`, `DEPLOYMENT_INVALID`, `DEPLOYMENT_MISSING`, `LINK_INVALID`, `PLAN_INVALID`, `INVALID_OPTIONS`, `USER_REJECTED`, `WRONG_CHAIN`, `WRONG_ACCOUNT`, `POLICY_MISMATCH`, `DRILL_EXPIRED`). `useVault` không dùng `placeholderData` (đổi địa chỉ sẽ hiện vault cũ).
19. **Worker được kiểm bằng trang chỉ có trong build e2e.** Trên devnet không có circuit policy, nên proof hỏng với `POLICY_UNAVAILABLE` trước khi tới worker (đọc `apps/web/test/e2e/verify.spec.ts` của web cũ). Vì vậy trang `src/app/e2e/worker/page.e2e.tsx` (chỉ build khi `ATROPYLE_E2E=1`, qua `pageExtensions`) gửi một bundle hỏng vào worker thật và chờ lỗi SDK quay về: chứng minh chunk worker nạp được dưới CSP và SDK chạy trong worker. `npm run worker:check` (Task 2) và e2e `worker.spec.ts` (Task 15) dùng trang này; bản build production không có nó (test build).
20. **`HoldButton`:** giữ chuột hoặc chạm 600 ms thì xác nhận; nhả sớm thì huỷ và nháy gợi ý. **Enter xác nhận ngay** (spec §4.6: "bấm phím Enter cũng được"); Space là giữ (nhả sớm thì huỷ). Click có `detail === 0` (công nghệ hỗ trợ kích hoạt) xác nhận ngay; click chuột thường bị bỏ qua. Khi reduced motion, thanh tiến độ đổi `opacity` thay vì `scaleX`.
21. **Không có trang `/dev/`** (spec §18, cắt C7): duyệt bằng mắt dùng ảnh chụp các trang thật (`test/e2e/screens.ts`, R18.13). `pageExtensions` chỉ thêm `e2e.tsx` khi `ATROPYLE_E2E=1`. Test build vẫn kiểm `out/dev/` không tồn tại, để gallery không lặng lẽ quay lại.
22. **Link điều hướng `prefetch={false}`** cho tới khi Plan 7B dựng route đích: prefetch tới route chưa có sinh lỗi 404 trong console, làm hỏng Lighthouse Best Practices.
23. **Biome:** `css.parser.tailwindDirectives: true` (đọc `biome explain` 2.6.8; file mẫu có `@import "tailwindcss"`, `@theme`, `@theme inline`, `linear()`, `color-mix`, `::view-transition-*` qua `biome ci`). Chuỗi CSS dùng nháy kép (mặc định của formatter CSS). Các luật ảnh hưởng thiết kế: `useUniqueElementIds` cấm `id` là chuỗi cố định (dùng `useId()`), `noSvgWithoutTitle`, `noStaticElementInteractions`, `useSemanticElements`, `noDangerouslySetInnerHtml`, `useExhaustiveDependencies` đều là error.
24. **Lighthouse chạy cục bộ:** `lighthouse` 13.6.0 qua `chrome-launcher` 1.2.3 với Chromium của Playwright (`chromium.executablePath()`), phục vụ `out/` bằng server tĩnh của app. Mỗi route chạy 3 lần, lấy trung vị điểm Performance. Không dịch vụ ngoài.
25. **Lockfile:** `scripts/lockfile-check.ts` tìm mọi dependency mà không đường resolve nào của node trỏ tới entry trong `package-lock.json` (đã thử: lockfile hiện tại cho 0 thiếu; bỏ hai entry emnapi cho đúng 2 thiếu). `--fix` lấy `version`, `dist.tarball`, `dist.integrity`, `license`, `dependencies` bằng `npm view`, đặt `dev`/`optional` theo entry cha, sắp xếp khoá bằng `localeCompare(…, 'en')` (đã thử: thứ tự khoá của lockfile hiện tại trùng hoàn toàn), ghi lại bằng `JSON.stringify(…, null, 2) + '\n'` (đã thử: trùng từng byte).
26. **Header CSP của Vercel và cache:** `vercel.json` có `"framework": null`, `"outputDirectory": "out"`, lệnh cài và build chạy ở gốc monorepo (`cd ../.. && npm ci`; build SDK rồi app với `NEXT_PUBLIC_TARGET=vercel`), header bảo mật và cache bất biến cho `/_next/static/`.
27. **Phiên ví của cả site** (Task 11): `KEYS.wallet` nhớ `rdns`, nguồn và tên của ví, không bao giờ nhớ địa chỉ. Lần ghé sau khôi phục im lặng: tìm lại đúng ví qua EIP-6963 rồi hỏi `eth_accounts`, không bao giờ `eth_requestAccounts` hay mở cửa sổ của ví; ví đã gỡ (`gone`) thì quên lựa chọn, ví đang khoá (`locked`) thì giữ lựa chọn và hiện nút Connect. Mỗi lần kết nối, khôi phục hay ngắt tăng một `epoch`, kết quả về muộn của lượt cũ bị bỏ. SDK và viem chỉ nạp khi cần (`switchChain`, `walletClient`) qua `queryClient.fetchQuery(sdkQuery(…))` và `peekChainImpl()`, nên header không kéo SDK vào lần tải đầu. Mã QR nạp lười và chỉ vẽ khi URL ≤ `QR_MAX_CHARS` (512 ký tự). Sự kiện `disconnect` mã 1013 (MetaMask mất kết nối tạm tới chain) bị bỏ qua.
28. **Proof một lần mỗi phiên** (Task 12): query proof dùng `skipToken` cho tới khi người dùng bấm chạy, `gcTime` vô hạn và không retry, nên kết quả sống cả phiên và hai trang dùng chung một lượt đang chạy. Tiến độ nằm trong một store ngoài React (`useSyncExternalStore`), để trang mount lại giữa chừng vẫn thấy đúng tiến độ.
29. **Engine giao dịch** (Task 13): `useTxRunner` trả một object `TxRunner` mà trang giữ và đưa cho `TxCard`. Link ký trên máy khác là `/sign/#p=…` của chính site (`toSignHref`), không có khi đang gửi hay khi đã xong. Bộ giải mã lỗi nằm trong chunk `tx/impl`, nạp cùng thẻ giao dịch. Đổi plan reset trạng thái ngay trong lúc render (không qua effect), và cờ `inFlight` chặn lần gửi thứ hai trước khi React kịp vẽ lại.
30. **URL backend** (Task 14): ba lớp giữ URL khỏi bản deweb (`build-env.ts` đặt chuỗi rỗng, `next.config.mjs` đặt rỗng, `env.ts` chỉ đọc URL sau phép so target). Chuỗi rỗng, không phải xoá biến, vì `@next/env` chỉ nạp khoá từ `.env*` khi biến `undefined`; bản vercel không có URL trong môi trường cũng nhận chuỗi rỗng, nên URL chỉ đến từ môi trường build, đúng nguồn của CSP. Test build dùng một sentinel trong môi trường và một sentinel trong `.env.production.local`. `getApi()` là hàm (đọc lúc gọi, test thay được), client kiểm hình dạng mọi câu trả lời theo §9.6 (lệch thì `BAD_RESPONSE`), và mã lỗi vĩnh viễn của API vào `PERMANENT_CODES`.
31. **E2E, kích thước và Lighthouse** (Task 15): e2e chạy bản build **deweb** (không backend, chịu quét on-chain) với deployment devnet có `rpcUrls` là hai origin OKX; Playwright chuyển mọi request tới chúng sang anvil. Server tĩnh của e2e và Lighthouse gửi đúng header của `vercel.json` và nén gzip như Vercel, nên hai lớp CSP được thử cùng nhau và Lighthouse đo số byte thật. Mỗi test e2e có ba lưới chặn tự động: request off-chain, vi phạm CSP (`securitypolicyviolation` qua `exposeFunction`), lỗi trang. axe chạy WCAG 2.2 AA ở cả hai theme sau khi mọi animation hữu hạn dừng. `size-limit` đo bản sao script của từng trang trong `.size/` (tên chunk của bundler có thể chứa ký tự glob). Hash CSP tính trên text đã đổi CRLF thành LF như parser HTML. `src/app/icon.svg` tránh lỗi 404 `/favicon.ico` trong console (Best Practices). `vercel.json` không có HSTS: Vercel tự gửi, còn `includeSubDomains` hay `preload` là quyết định về domain của maintainer.

## Review Focus

1. **Link cũ do SDK, CLI và MCP in ra** (`#/sign?p=<payload dài>`, `#/sign?p=a&p=b`, `#/v/<a>/verify`, `#/create?drill=1`, hash lạ, hash trên đường dẫn khác `/`): chuyển đúng một lần, giữ payload từng byte (kể cả hai tham số `p` để trang ký từ chối), không chuyển hash lạ. Test: `legacyTarget keeps the payload byte for byte` và `legacyTarget leaves unknown hashes alone` (Task 9), `legacy links land on the new routes` (Task 15).
2. **Bộ nhớ trình duyệt bị chặn hoặc hỏng** (cửa sổ riêng tư, `localStorage` ném lỗi, giá trị theme/lang/ví rác): trang vẫn vẽ, dùng mặc định, script boot không ném. Test: `boot survives a localStorage that throws` (Task 9), `a stored garbage theme falls back to night` (Task 9), `restore ignores a remembered wallet that is gone` (Task 11).
3. **Ví đổi trạng thái giữa chừng** (đổi tài khoản, đổi chain, ngắt, trả mảng tài khoản rác): trạng thái cập nhật, hiện cảnh báo sai chain, không crash, không giữ tài khoản cũ. Test: `wallet events update the account and chain and drop garbage` (Task 11).
4. **Chỉ bàn phím, công nghệ hỗ trợ và reduced motion:** `HoldButton` dùng được bằng Enter, Space và click của trình đọc màn hình; khi reduced motion không còn animation chạy lúc nghỉ. Test: `HoldButton keyboard and assistive activation` (Task 6), `reduced motion leaves no running animation` (Task 15).
5. **Bản deweb rò URL backend hoặc link ngoài** (`NEXT_PUBLIC_API_URL` có trong môi trường lúc build deweb; footer có link GitHub): không chuỗi nào của URL API nằm trong `out/`, không thuộc tính HTML nào trỏ ra ngoài. Test: `the deweb build never contains the API url` (Task 14), `deweb HTML has no external attribute` (Task 15).

---

## File Structure

```
package.json                              (sửa) script lockfile:check (Task 1)
package-lock.json                         (sửa) workspace apps/web-legacy, apps/web mới; entry emnapi giữ nguyên
biome.json                                (sửa) đường dẫn legacy, ignore output Next và .size, css.parser.tailwindDirectives
.gitignore                                (sửa) đường dẫn legacy, output Next, báo cáo e2e và Lighthouse, .size
.github/workflows/ci.yml                  (sửa) job web chạy apps/web-legacy; job web-next mới (Task 2, Task 15)
AGENTS.md                                 (sửa) bảng thư mục và lệnh (Task 1, Task 15)
docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md  (sửa) §4.3 token light, §16 hàng 15–17
scripts/
  lockfile-check.ts                       npm run lockfile:check [-- --fix]
  lib/lockfile.ts                         resolveIn, missingDeps, withEntries, entryFrom, fixLock, serializeLock
  test/tooling/lockfile.test.ts
  test/site/ci-web-next.test.ts           kiểm job web-next
  build-site.ts, lib/site-build.ts, lib/onchain-check.ts, test/site/*.test.ts, vitest.site.config.ts  (sửa đường dẫn)
apps/web-legacy/                          web Preact cũ (git mv từ apps/web), workspace @atropyle/web-legacy
apps/web/
  package.json  next.config.mjs  postcss.config.mjs  tsconfig.json  vitest.config.ts  vitest.build.config.ts
  playwright.config.ts  .size-limit.mjs  vercel.json  README.md
  public/robots.txt  public/licenses/fonts/OFL-{Fraunces,Inter,JetBrainsMono}.txt
  scripts/
    next.ts                               tsx scripts/next.ts build|dev
    worker-check.ts                       build e2e + Chromium dưới CSP chặt: worker nạp được
    lighthouse.ts                         Lighthouse cục bộ trên out/, 3 lần mỗi route, lấy trung vị
    lib/build-env.ts  lib/run-next.ts  lib/static-server.ts  lib/csp.ts  lib/site-headers.ts  lib/lighthouse-score.ts
  src/
    app/layout.tsx  page.tsx  not-found.tsx  globals.css  icon.svg
    app/e2e/worker/page.e2e.tsx           smoke worker (chỉ build e2e)
    config/env.ts                         target, chain, API URL, explorer
    config/facts.ts                       POLICY_NETLIST_KECCAK, MAINNET_SINCE, KEEPER_CADENCE_S
    routes.ts                             ROUTES, NAV, href builders, legacyTarget, toSdkSignLink
    fonts/index.ts  fonts/ranges.ts  fonts/files/*.woff2 (9 file)
    i18n/core.ts  i18n/provider.tsx
    lib/store.ts  kv.tsx  untrusted.ts  duration.ts  docs.ts  address.ts  hash.ts  format.ts  links.ts  cn.ts
       use-mounted.ts  use-now.ts  lazy-chunk.ts
    messages/{labels,common,shell,ui,tx,wallet,wallet-overlays,api,create,developers,guardian,heir,home,owner,sign,status,vault,verify,action-runner,editors}.messages.ts
    theme/theme.ts  provider.tsx  boot.ts  boot-script.tsx
    motion/tokens.ts  features.ts  provider.tsx  view-transition.tsx  haptics.ts  use-hold.ts  move.ts  reveal-window.tsx
    thread/geometry.ts  state.ts  thread.tsx  glyphs.tsx  state-badge.tsx
    ui/button.tsx  icon-button.tsx  plain-icon-button.tsx  hold-button.tsx  address.tsx  avatar.tsx  identicon.ts
       amount.tsx  countdown.tsx  skeleton.tsx  empty-state.tsx  inline-error.tsx  banner.tsx  copy-button.tsx
       untrusted-text.tsx  external-link.tsx  visually-hidden.tsx  dialog.tsx  popover.tsx  tooltip.tsx  lazy-overlay.ts
       qr-code.tsx  spinner.tsx  text-field.tsx
    shell/providers.tsx  frame.tsx  header.tsx  footer.tsx  nav-list.tsx  nav-link.tsx  proof-line.tsx  load-notice.tsx
       settings-menu.tsx  settings-panel.tsx  mobile-menu.tsx  menu-sheet.tsx  warm-overlays.ts  skip-link.tsx
       lang-switch.tsx  theme-switch.tsx  haptics-switch.tsx  wordmark.tsx
    home/hero.tsx                         cảnh đầu của trang chủ (Plan 7C thay)
    chain/types.ts  load.ts  query-client.ts  keys.ts  provider.tsx  hooks.ts  use-stats.ts  time.ts
    chain/impl/index.ts  rpc.ts  sdk.ts  vault.ts  stats.ts  stats-view.ts            (chỉ nạp qua loadChainImpl)
    wallet/types.ts  load.ts  remember.ts  recommended.ts  network.ts  provider.tsx  connect-sheet.tsx
       connect-sheet-slot.tsx  wallet-button.tsx  wallet-menu.tsx  wallet-menu-panel.tsx  network-banner.tsx
       network-banner-slot.tsx  use-vault-roles.ts
    wallet/impl/index.ts  wallet.ts  send-calls.ts  session.ts                       (chỉ nạp qua loadWalletImpl)
    verify/types.ts  load.ts  hooks.ts  verify-view.ts
    verify/impl/index.ts  verify-client.ts                                           (chỉ nạp qua loadVerifyImpl)
    workers/verify.worker.ts  smoke.worker.ts  smoke-lazy.ts
    tx/tx-view.ts  load.ts  use-error-view.ts  error-box.tsx  use-tx-runner.ts  tx-card.tsx  tx-progress.tsx
       use-leave-guard.ts  sign-href.ts
    tx/impl/index.ts  errors-view.ts  decode.ts  describe.ts                         (chỉ nạp qua loadTxImpl)
    api/types.ts  client.ts  instance.ts  hooks.ts  errors.ts                        (chỉ bản vercel gọi mạng)
  test/setup.ts
  test/helpers/render.tsx  helpers/wallet.ts
  test/unit/*.test.ts(x)  test/unit/fixtures.ts                                       (port + mới)
  test/build/global-setup.ts  paths.ts  *.test.ts                                     (hai lần next build thật, rồi đọc out/)
  test/e2e/global-setup.ts  network.ts  fixtures.ts  helpers.ts  screens.ts  state.ts  wallet.ts  *.spec.ts
  (ignore) out/  .size/  test-results/  playwright-report/  lighthouse-report/  test/e2e/.site/  test/e2e/.state.json
```

---
### Task 1: Công cụ lockfile và chuyển web cũ sang `apps/web-legacy`

Mọi lệnh chạy ở gốc repo trừ khi ghi khác. Task này không cài gói mới; nó đổi tên workspace và tạo lệnh `lockfile:check` mà mọi task sau dùng.

**Files:**
- Create: `scripts/lib/lockfile.ts`, `scripts/lockfile-check.ts`, `scripts/test/tooling/lockfile.test.ts`
- Modify: `scripts/vitest.site.config.ts` (thêm thư mục test tooling), `package.json` (script `lockfile:check`)
- Move: `apps/web/` → `apps/web-legacy/` (`git mv`); Modify: `apps/web-legacy/package.json` (tên `@atropyle/web-legacy`)
- Modify (đường dẫn): `.github/workflows/ci.yml:222,226,228,236,241`, `.gitignore:12-15`, `biome.json:24-28`, `AGENTS.md:19,40,53,56,61,62,67,68`, `scripts/build-site.ts:42,45`, `scripts/lib/site-build.ts:66,70`, `scripts/lib/onchain-check.ts:115`, `scripts/test/site/ci-web.test.ts:49,64,65,67,72,76,93`, `scripts/test/site/deweb-bundle.test.ts:13`, `scripts/test/site/onchain-check.test.ts:126`, `scripts/test/site/site-build.test.ts:54-56`, `package-lock.json`

**Interfaces:**
- Consumes: không có.
- Produces: `npm run lockfile:check` (in danh sách thiếu, exit 1) và `npm run lockfile:check -- --fix` (thêm entry thiếu, exit 0 khi sạch). `scripts/lib/lockfile.ts`:
  - `interface LockEntry`, `interface Lockfile`, `interface Missing { name: string; range: string; from: string; at: string }`
  - `resolveIn(packages: Record<string, LockEntry>, from: string, name: string): string | null`
  - `missingDeps(lock: Lockfile): Missing[]`
  - `withEntries(lock: Lockfile, add: Record<string, LockEntry>): Lockfile`
  - `entryFrom(view: unknown, dev: boolean, optional: boolean): LockEntry`
  - `type NpmView = (spec: string) => unknown`; `npmView: NpmView`
  - `fixLock(lock: Lockfile, view: NpmView, rounds?: number): { lock: Lockfile; added: string[]; missing: Missing[] }`
  - `serializeLock(lock: Lockfile): string`
- Workspace web cũ: `@atropyle/web-legacy` ở `apps/web-legacy`. Job CI `web` giữ id, chạy `-w apps/web-legacy`.

- [ ] **Step 1: Viết test hỏng cho công cụ lockfile**

Tạo `scripts/test/tooling/lockfile.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  entryFrom,
  fixLock,
  type Lockfile,
  missingDeps,
  type NpmView,
  resolveIn,
  serializeLock,
  withEntries,
} from '../../lib/lockfile';

const FILE = fileURLToPath(new URL('../../../package-lock.json', import.meta.url));
const raw = () => readFileSync(FILE, 'utf8');
const real = (): Lockfile => JSON.parse(raw()) as Lockfile;
const CORE = 'node_modules/@emnapi/core';
const RUNTIME = 'node_modules/@emnapi/runtime';

function stripped(): Lockfile {
  const lock = real();
  delete lock.packages[CORE];
  delete lock.packages[RUNTIME];
  return lock;
}

/** What `npm view <spec> version dist.tarball dist.integrity license dependencies --json` prints, built from the real lockfile. */
const viewFromLock: NpmView = (spec) => {
  const at = spec.lastIndexOf('@');
  const name = spec.slice(0, at);
  const e = real().packages[`node_modules/${name}`];
  if (!e) throw new Error(`no fixture for ${spec}`);
  return {
    version: e.version,
    'dist.tarball': e.resolved,
    'dist.integrity': e.integrity,
    license: e.license,
    ...(e.dependencies ? { dependencies: e.dependencies } : {}),
  };
};

describe('lockfile check', () => {
  it('finds every dependency of the repository lockfile', () => {
    expect(missingDeps(real())).toEqual([]);
  });

  it('reports the two emnapi entries that npm on Windows drops', () => {
    const missing = missingDeps(stripped());
    expect(missing.map((m) => m.name).sort()).toEqual(['@emnapi/core', '@emnapi/runtime']);
    expect(missing.every((m) => m.from === 'node_modules/@rolldown/binding-wasm32-wasi')).toBe(true);
    expect(missing.every((m) => m.at === `node_modules/${m.name}`)).toBe(true);
  });

  it('resolves like node: own node_modules first, then each parent, then the root', () => {
    const packages = {
      '': {},
      'node_modules/a': { version: '1.0.0' },
      'node_modules/b': { version: '1.0.0' },
      'node_modules/b/node_modules/a': { version: '2.0.0' },
      'node_modules/b/node_modules/c': { version: '1.0.0' },
      'apps/x': {},
    };
    expect(resolveIn(packages, 'node_modules/b/node_modules/c', 'a')).toBe('node_modules/b/node_modules/a');
    expect(resolveIn(packages, 'node_modules/b', 'a')).toBe('node_modules/b/node_modules/a');
    expect(resolveIn(packages, 'apps/x', 'a')).toBe('node_modules/a');
    expect(resolveIn(packages, '', 'zz')).toBeNull();
  });

  it('keeps the exact key order of the repository lockfile', () => {
    const lock = real();
    expect(Object.keys(withEntries(lock, {}).packages)).toEqual(Object.keys(lock.packages));
  });

  it('builds an entry exactly like the one npm wrote', () => {
    const e = entryFrom(viewFromLock('@emnapi/core@2.0.0-beta.2'), true, true);
    expect(JSON.stringify(e)).toBe(JSON.stringify(real().packages[CORE]));
  });

  it('takes the highest version when npm view returns a list for a range', () => {
    const e = entryFrom(
      [
        { version: '1.0.0', 'dist.tarball': 'https://r/x-1.0.0.tgz', 'dist.integrity': 'sha512-a', license: 'MIT' },
        { version: '1.2.0', 'dist.tarball': 'https://r/x-1.2.0.tgz', 'dist.integrity': 'sha512-b', license: 'MIT' },
      ],
      false,
      false,
    );
    expect(e).toEqual({ version: '1.2.0', resolved: 'https://r/x-1.2.0.tgz', integrity: 'sha512-b', license: 'MIT' });
  });

  it('refuses an npm view answer without a tarball or integrity', () => {
    expect(() => entryFrom({ version: '1.0.0' }, false, false)).toThrow(/tarball|integrity/);
  });

  it('restores the stripped lockfile byte for byte', () => {
    const r = fixLock(stripped(), viewFromLock);
    expect(r.missing).toEqual([]);
    expect(r.added.sort()).toEqual([CORE, RUNTIME]);
    expect(serializeLock(r.lock)).toBe(raw());
  });
});
```

Sửa `scripts/vitest.site.config.ts`, dòng `include`:

```ts
    include: ['scripts/test/site/**/*.test.ts', 'scripts/test/deploy/**/*.test.ts', 'scripts/test/tooling/**/*.test.ts'],
```

- [ ] **Step 2: Chạy test, xác nhận hỏng**

Run: `npx vitest run --config scripts/vitest.site.config.ts scripts/test/tooling/lockfile.test.ts`
Expected: FAIL, `Cannot find module '../../lib/lockfile'`.

- [ ] **Step 3: Viết `scripts/lib/lockfile.ts` và `scripts/lockfile-check.ts`**

`scripts/lib/lockfile.ts`:

```ts
import { spawnSync } from 'node:child_process';

export interface LockEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
  link?: boolean;
  dev?: boolean;
  optional?: boolean;
  license?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export interface Lockfile {
  name?: string;
  lockfileVersion: number;
  requires?: boolean;
  packages: Record<string, LockEntry>;
  [key: string]: unknown;
}

export interface Missing {
  name: string;
  range: string;
  /** The lockfile path of the package that depends on it. */
  from: string;
  /** Where npm puts it: a missing package has no copy anywhere on the resolution path, so the top level is free. */
  at: string;
}

const isWorkspace = (path: string): boolean => path === '' || !path.includes('node_modules/');

/** Node's lookup: the package's own node_modules, then every parent's, then the root's. */
export function resolveIn(packages: Record<string, LockEntry>, from: string, name: string): string | null {
  let base = from;
  for (;;) {
    const candidate = base === '' ? `node_modules/${name}` : `${base}/node_modules/${name}`;
    if (packages[candidate]) return candidate;
    if (base === '') return null;
    const i = base.lastIndexOf('/node_modules/');
    base = i >= 0 ? base.slice(0, i) : '';
  }
}

/** Every dependency (and every devDependency of a workspace) that no entry of the lockfile satisfies. */
export function missingDeps(lock: Lockfile): Missing[] {
  const out: Missing[] = [];
  const seen = new Set<string>();
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (entry.link) continue;
    const deps: Record<string, string> = {
      ...entry.dependencies,
      ...entry.optionalDependencies,
      ...(isWorkspace(path) ? entry.devDependencies : {}),
    };
    for (const [name, range] of Object.entries(deps)) {
      if (resolveIn(lock.packages, path, name)) continue;
      const key = `${name}@${range}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, range, from: path, at: `node_modules/${name}` });
    }
  }
  return out;
}

/** npm writes the root entry first, then every path in `localeCompare` order (checked against the real file). */
export function withEntries(lock: Lockfile, add: Record<string, LockEntry>): Lockfile {
  const all = { ...lock.packages, ...add };
  const keys = Object.keys(all).sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, 'en')));
  const packages: Record<string, LockEntry> = {};
  for (const k of keys) packages[k] = all[k] as LockEntry;
  return { ...lock, packages };
}

export function entryFrom(view: unknown, dev: boolean, optional: boolean): LockEntry {
  const picked = Array.isArray(view) ? view[view.length - 1] : view;
  const o = (picked ?? {}) as Record<string, unknown>;
  const version = o.version;
  const resolved = o['dist.tarball'];
  const integrity = o['dist.integrity'];
  if (typeof version !== 'string' || typeof resolved !== 'string' || typeof integrity !== 'string') {
    throw new Error('npm view returned no version, tarball or integrity');
  }
  // Same key order as npm: version, resolved, integrity, dev, license, optional, dependencies.
  const e: LockEntry = { version, resolved, integrity };
  if (dev) e.dev = true;
  if (typeof o.license === 'string') e.license = o.license;
  if (optional) e.optional = true;
  const deps = o.dependencies;
  if (deps && typeof deps === 'object' && Object.keys(deps).length > 0) e.dependencies = deps as Record<string, string>;
  return e;
}

export type NpmView = (spec: string) => unknown;

/** `npm` is a .cmd on Windows, so it runs through a shell there; the quotes keep `^` and `<` literal for cmd.exe. */
export const npmView: NpmView = (spec) => {
  const win = process.platform === 'win32';
  const r = spawnSync(
    'npm',
    [
      'view',
      win ? `"${spec}"` : spec,
      'version',
      'dist.tarball',
      'dist.integrity',
      'license',
      'dependencies',
      '--json',
    ],
    { encoding: 'utf8', shell: win, windowsHide: true },
  );
  if (r.status !== 0) throw new Error(`npm view ${spec} failed:\n${r.stderr}`);
  return JSON.parse(r.stdout) as unknown;
};

export function fixLock(
  lock: Lockfile,
  view: NpmView,
  rounds = 5,
): { lock: Lockfile; added: string[]; missing: Missing[] } {
  let current = lock;
  const added: string[] = [];
  for (let i = 0; i < rounds; i++) {
    const missing = missingDeps(current);
    if (missing.length === 0) return { lock: current, added, missing };
    const add: Record<string, LockEntry> = {};
    for (const m of missing) {
      const parent = current.packages[m.from] ?? {};
      const dev = parent.dev === true || (isWorkspace(m.from) && !!parent.devDependencies?.[m.name]);
      const optional = parent.optional === true || !!parent.optionalDependencies?.[m.name];
      add[m.at] = entryFrom(view(`${m.name}@${m.range}`), dev, optional);
      added.push(m.at);
    }
    current = withEntries(current, add);
  }
  return { lock: current, added, missing: missingDeps(current) };
}

export function serializeLock(lock: Lockfile): string {
  return `${JSON.stringify(lock, null, 2)}\n`;
}
```

`scripts/lockfile-check.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixLock, type Lockfile, missingDeps, npmView, serializeLock } from './lib/lockfile';

// npm on Windows drops @emnapi/core and @emnapi/runtime (optional wasm deps) from the lockfile, and `npm ci` on
// Linux then fails. Run this after every `npm install`.
const FILE = fileURLToPath(new URL('../package-lock.json', import.meta.url));
const fix = process.argv.includes('--fix');
const lock = JSON.parse(readFileSync(FILE, 'utf8')) as Lockfile;
const missing = missingDeps(lock);

if (missing.length === 0) {
  console.log('package-lock.json: every dependency resolves.');
  process.exit(0);
}
if (!fix) {
  for (const m of missing) console.error(`missing ${m.name}@${m.range} (needed by ${m.from || 'the root'})`);
  console.error('Run: npm run lockfile:check -- --fix');
  process.exit(1);
}
const r = fixLock(lock, npmView);
writeFileSync(FILE, serializeLock(r.lock));
for (const a of r.added) console.log(`added ${a}`);
if (r.missing.length > 0) {
  for (const m of r.missing) console.error(`still missing ${m.name}@${m.range}`);
  process.exit(1);
}
```

Trong `package.json` ở gốc, thêm sau dòng `"test:site": …` (nhớ dấu phẩy):

```json
    "test:site": "vitest run --config scripts/vitest.site.config.ts",
    "lockfile:check": "tsx scripts/lockfile-check.ts"
```

- [ ] **Step 4: Chạy test và lệnh, xác nhận đạt**

Run: `npx vitest run --config scripts/vitest.site.config.ts scripts/test/tooling/lockfile.test.ts`
Expected: PASS, 8 test.

Run: `npm run lockfile:check`
Expected: `package-lock.json: every dependency resolves.`

Run: `npm run typecheck:scripts && npx biome ci .`
Expected: không lỗi.

- [ ] **Step 5: Commit công cụ**

```bash
git add scripts/lib/lockfile.ts scripts/lockfile-check.ts scripts/test/tooling/lockfile.test.ts scripts/vitest.site.config.ts package.json
git commit -m "chore: lockfile:check finds and restores entries npm on Windows drops" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Chuyển web cũ sang `apps/web-legacy` và sửa mọi tham chiếu**

Chạy trong Git Bash (GNU sed):

```bash
git mv apps/web apps/web-legacy
sed -i 's#"name": "@atropyle/web"#"name": "@atropyle/web-legacy"#' apps/web-legacy/package.json
sed -i -e 's#-w apps/web\b#-w apps/web-legacy#g' -e 's#path: apps/web/playwright-report#path: apps/web-legacy/playwright-report#' .github/workflows/ci.yml
sed -i 's#^apps/web/#apps/web-legacy/#' .gitignore
sed -i 's#"!apps/web/#"!apps/web-legacy/#' biome.json
sed -i -e "s#'-w', 'apps/web'#'-w', 'apps/web-legacy'#" -e "s#join(ROOT, 'apps', 'web', 'dist')#join(ROOT, 'apps', 'web-legacy', 'dist')#" scripts/build-site.ts
sed -i -e "s#join(root, 'apps', 'web', 'dist')#join(root, 'apps', 'web-legacy', 'dist')#" -e 's#overlaps apps/web/dist#overlaps apps/web-legacy/dist#' scripts/lib/site-build.ts
sed -i 's#apps/web/src/lib/rpc.ts#apps/web-legacy/src/lib/rpc.ts#' scripts/lib/onchain-check.ts scripts/test/site/onchain-check.test.ts
sed -i -e "s#-w apps/web'#-w apps/web-legacy'#g" -e 's#apps/web/.size-limit.json#apps/web-legacy/.size-limit.json#' scripts/test/site/ci-web.test.ts
sed -i "s#'../../../apps/web'#'../../../apps/web-legacy'#" scripts/test/site/deweb-bundle.test.ts
sed -i -e "s#join(root, 'apps', 'web'#join(root, 'apps', 'web-legacy'#g" -e "s#'apps/web/dist'#'apps/web-legacy/dist'#g" scripts/test/site/site-build.test.ts
sed -i 's#-w apps/web\b#-w apps/web-legacy#g' AGENTS.md
```

Trong `AGENTS.md`, thay dòng bảng của `apps/web/` (dòng 19) bằng hai dòng:

```markdown
| `apps/web/`                                         | The web app v2 (Next.js 16 static export, targets `vercel` and `deweb`), built by Plans 7A and 7B                   |
| `apps/web-legacy/`                                  | The previous web app (Vite + Preact), tested in CI until the v2 cutover, then deleted                               |
```

Kiểm không còn tham chiếu cũ (ngoài `docs/`):

Run: `git grep -nE "apps/web([^-]|$)" -- . ':!docs' ':!apps/web-legacy' ':!package-lock.json' | grep -v "apps/web-legacy"`
Expected: chỉ còn dòng bảng `apps/web/` mới trong `AGENTS.md`.

- [ ] **Step 7: Cập nhật lockfile và khôi phục entry emnapi**

```bash
npm install
npm run lockfile:check -- --fix
npm run lockfile:check
git diff --stat package-lock.json
```

Expected: `npm install` đổi `"apps/web"` thành `"apps/web-legacy"` và link `node_modules/@atropyle/web` thành `node_modules/@atropyle/web-legacy`. `lockfile:check` cuối in `every dependency resolves.` Nếu `--fix` in `added node_modules/@emnapi/…` thì đó đúng là bẫy của Windows; giữ thay đổi.

- [ ] **Step 8: Chạy lại toàn bộ kiểm tra của web cũ và script**

```bash
npm run build
npm test -w apps/web-legacy
npm run typecheck
npx biome ci .
cd contracts && forge build && cd ..
npm run test:site
```

Expected: tất cả PASS. `ci-web.test.ts` đọc job `web` với lệnh `-w apps/web-legacy`; `site-build.test.ts` và `deweb-bundle.test.ts` đọc `apps/web-legacy`.

- [ ] **Step 9: Commit**

```bash
git add apps/web-legacy .github/workflows/ci.yml .gitignore biome.json AGENTS.md package-lock.json scripts/build-site.ts scripts/lib/site-build.ts scripts/lib/onchain-check.ts scripts/test/site/ci-web.test.ts scripts/test/site/deweb-bundle.test.ts scripts/test/site/onchain-check.test.ts scripts/test/site/site-build.test.ts
git commit -m "refactor(web): move the Preact app to apps/web-legacy" -m "The Next.js app takes apps/web from the next commit; CI keeps testing the legacy app until the v2 cutover (spec §13)." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git mv` đã ghi việc xoá các đường dẫn cũ vào index; không `git add apps/web`, vì đường dẫn đó không còn.)

---

### Task 2: Khung Next.js 16, cấu hình môi trường, wrapper build và spike Web Worker

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.mjs`, `apps/web/vitest.config.ts`, `apps/web/vitest.build.config.ts`, `apps/web/test/setup.ts`
- Create: `apps/web/src/config/env.ts`, `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`
- Create: `apps/web/scripts/next.ts`, `apps/web/scripts/lib/build-env.ts`, `apps/web/scripts/lib/run-next.ts`, `apps/web/scripts/lib/static-server.ts`, `apps/web/scripts/worker-check.ts`
- Create: `apps/web/src/app/e2e/worker/page.e2e.tsx`, `apps/web/src/workers/smoke.worker.ts`, `apps/web/src/workers/smoke-lazy.ts`
- Create: `apps/web/test/unit/env.test.ts`, `apps/web/test/unit/build-env.test.ts`, `apps/web/test/unit/static-server.test.ts`, `apps/web/test/build/paths.ts`, `apps/web/test/build/global-setup.ts`, `apps/web/test/build/output.test.ts`
- Create: `scripts/test/site/ci-web-next.test.ts`
- Modify: `.github/workflows/ci.yml` (job `web-next` ở cuối), `.gitignore`, `biome.json`, `package-lock.json`, `docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md` (§16 hàng 15)

**Interfaces:**
- Consumes: `@atropyle/sdk` 0.1.0 (`ChainName` type, `getDeployment` chỉ trong test), Task 1 (`npm run lockfile:check`).
- Produces:
  - `src/config/env.ts`: `type Target = 'vercel' | 'deweb'`; `interface RawEnv`; `interface AppEnv { target: Target; chain: ChainName; deploymentJson: string | null; apiUrl: string | null; docsPath: '/docs/' | null; version: string }`; `targetOf(raw?: string): Target`; `chainNameOf(raw?: string): ChainName`; `apiUrlOf(target: Target, raw?: string): string | null`; `readEnv(raw: RawEnv): AppEnv`; `chainIdOf(env: Pick<AppEnv, 'chain' | 'deploymentJson'>): number`; `explorerUrlOf(env: Pick<AppEnv, 'chain' | 'deploymentJson'>): string | null`; `XLAYER_EXPLORER = 'https://www.oklink.com/xlayer'`; `ENV: AppEnv`; `IS_VERCEL: boolean`.
  - `scripts/lib/build-env.ts`: `buildEnvFor(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv`.
  - `scripts/lib/run-next.ts`: `APP_DIR`, `OUT_DIR`, `NEXT_BIN`, `BUNDLER_FLAGS: readonly string[]`, `interface RunOptions { env?: NodeJS.ProcessEnv; args?: readonly string[]; quiet?: boolean }`, `runNext(command: 'build' | 'dev', o?: RunOptions): Promise<{ code: number; output: string }>`, `buildApp(o?: RunOptions): Promise<{ code: number; output: string }>`.
  - `scripts/lib/static-server.ts`: `startStaticServer(root: string, port?: number, headers?: Record<string, string>): Promise<{ port: number; url: string; close(): Promise<void> }>` (`/x/` → `x/index.html`, thiếu thì `404.html` với status 404).
  - `test/build/paths.ts`: `BUILD_OUT`, `API_SENTINEL = 'https://api.atropyle.invalid/functions/v1'`, `outOf(target: 'vercel' | 'deweb'): string`.
  - Lệnh: `npm run dev|build|test|test:build|typecheck|worker:check|playwright:install -w apps/web`.
  - Alias import `@/` → `apps/web/src/` (tsconfig `paths`, Vitest `resolve.alias`).

- [ ] **Step 1: Tạo `apps/web/package.json` rồi cài gói**

```json
{
  "name": "@atropyle/web",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx scripts/next.ts dev",
    "build": "tsx scripts/next.ts build",
    "test": "vitest run",
    "test:build": "vitest run --config vitest.build.config.ts",
    "typecheck": "tsc -p tsconfig.json",
    "worker:check": "tsx scripts/worker-check.ts",
    "playwright:install": "playwright install --with-deps chromium"
  },
  "dependencies": {
    "@atropyle/sdk": "0.1.0",
    "next": "16.4.6",
    "react": "19.3.1",
    "react-dom": "19.3.1",
    "viem": "2.58.0"
  },
  "devDependencies": {
    "@playwright/test": "1.65.1",
    "@testing-library/dom": "10.4.2",
    "@testing-library/react": "16.3.3",
    "@types/node": "24.19.2",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "happy-dom": "21.0.4",
    "tsx": "4.20.6",
    "typescript": "5.9.3",
    "vitest": "3.2.7"
  }
}
```

```bash
npm install
npm run lockfile:check -- --fix
npm run lockfile:check
```

Expected: `every dependency resolves.` (`@atropyle/sdk` 0.1.0 là workspace, npm tạo link.)

- [ ] **Step 2: Cấu hình TypeScript, Vitest, Next và bỏ qua output**

`apps/web/tsconfig.json` (có `extends` nên Next không tự sửa file này, Quyết định 4):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["node"],
    "paths": { "@/*": ["./src/*"] },
    "allowImportingTsExtensions": true
  },
  "include": ["src", "test", "scripts", "*.ts"]
}
```

`apps/web/vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src/', import.meta.url));

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: [{ find: /^@\//, replacement: src }] },
  test: {
    include: ['test/unit/**/*.test.{ts,tsx}'],
    environment: 'happy-dom',
    setupFiles: ['./test/setup.ts'],
    env: { NEXT_PUBLIC_APP_VERSION: '0.0.0-test' },
  },
});
```

`apps/web/vitest.build.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src/', import.meta.url));

// Real `next build` runs for both targets (test/build/global-setup.ts), then every file reads the output.
export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: src }] },
  test: {
    include: ['test/build/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./test/build/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
```

`apps/web/test/setup.ts`:

```ts
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

`apps/web/next.config.mjs` (Quyết định 2, 6):

(Task 8 Step 4 thay file này: không còn tham số `phase` hay nhánh `dev.tsx`.)

Thêm vào cuối `.gitignore` ở gốc (`out/` đã có sẵn):

```gitignore
apps/web/.next/
apps/web/next-env.d.ts
apps/web/test/build/.out/
apps/web/test/e2e/.site/
apps/web/test/e2e/.state.json
apps/web/test-results/
apps/web/playwright-report/
apps/web/lighthouse-report/
```

Thêm vào mảng `files.includes` của `biome.json`, sau dòng `"!apps/web-legacy/test/e2e/.state.json"` (nhớ dấu phẩy ở dòng trước):

```json
      "!apps/web/.next",
      "!apps/web/out",
      "!apps/web/next-env.d.ts",
      "!apps/web/test/build/.out",
      "!apps/web/test/e2e/.site",
      "!apps/web/test/e2e/.state.json",
      "!apps/web/test-results",
      "!apps/web/playwright-report",
      "!apps/web/lighthouse-report"
```

- [ ] **Step 3: Viết test hỏng cho `env.ts`, `build-env.ts` và server tĩnh**

`apps/web/test/unit/env.test.ts`:

```ts
import { getDeployment } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import {
  apiUrlOf,
  chainIdOf,
  chainNameOf,
  explorerUrlOf,
  readEnv,
  targetOf,
  XLAYER_EXPLORER,
} from '../../src/config/env';

describe('env', () => {
  it('defaults to the deweb target and refuses unknown targets', () => {
    expect(targetOf(undefined)).toBe('deweb');
    expect(targetOf(' ')).toBe('deweb');
    expect(targetOf('deweb')).toBe('deweb');
    expect(targetOf('vercel')).toBe('vercel');
    expect(() => targetOf('pages')).toThrow(/vercel or deweb/);
  });

  it('defaults to X Layer and refuses unknown chains', () => {
    expect(chainNameOf(undefined)).toBe('xlayer');
    expect(chainNameOf('local')).toBe('local');
    expect(() => chainNameOf('mainnet')).toThrow(/xlayer or local/);
  });

  it('keeps the API URL only for the vercel target, https only, without a trailing slash', () => {
    const url = 'https://abc.supabase.co/functions/v1/';
    expect(apiUrlOf('deweb', url)).toBeNull();
    expect(apiUrlOf('vercel', url)).toBe('https://abc.supabase.co/functions/v1');
    expect(apiUrlOf('vercel', undefined)).toBeNull();
    expect(() => apiUrlOf('vercel', 'http://abc.supabase.co/functions/v1')).toThrow(/https/);
    expect(() => apiUrlOf('vercel', 'https://u:p@abc.supabase.co/f')).toThrow(/credentials/);
    expect(() => apiUrlOf('vercel', 'https://abc.supabase.co/f?x=1')).toThrow(/query/);
    expect(() => apiUrlOf('vercel', 'not a url')).toThrow(/not a URL/);
  });

  it('reads every build variable', () => {
    const env = readEnv({
      NEXT_PUBLIC_TARGET: 'vercel',
      NEXT_PUBLIC_CHAIN: 'local',
      NEXT_PUBLIC_DEPLOYMENT: '{"chainId":31337}',
      NEXT_PUBLIC_API_URL: 'https://abc.supabase.co/functions/v1',
      NEXT_PUBLIC_DOCS_PATH: '/docs/',
      NEXT_PUBLIC_APP_VERSION: '0.2.0',
    });
    expect(env).toEqual({
      target: 'vercel',
      chain: 'local',
      deploymentJson: '{"chainId":31337}',
      apiUrl: 'https://abc.supabase.co/functions/v1',
      docsPath: '/docs/',
      version: '0.2.0',
    });
    expect(readEnv({})).toEqual({
      target: 'deweb',
      chain: 'xlayer',
      deploymentJson: null,
      apiUrl: null,
      docsPath: null,
      version: '0.0.0',
    });
  });

  it('knows the chain id and explorer without loading the SDK', () => {
    expect(chainIdOf({ chain: 'xlayer', deploymentJson: null })).toBe(196);
    expect(chainIdOf({ chain: 'local', deploymentJson: null })).toBe(31337);
    expect(chainIdOf({ chain: 'xlayer', deploymentJson: '{"chainId":31337}' })).toBe(31337);
    expect(chainIdOf({ chain: 'xlayer', deploymentJson: '{' })).toBe(196);
    expect(explorerUrlOf({ chain: 'xlayer', deploymentJson: null })).toBe(XLAYER_EXPLORER);
    expect(explorerUrlOf({ chain: 'local', deploymentJson: null })).toBeNull();
    expect(explorerUrlOf({ chain: 'local', deploymentJson: '{"explorerUrl":null}' })).toBeNull();
    expect(explorerUrlOf({ chain: 'local', deploymentJson: '{"explorerUrl":"javascript:alert(1)"}' })).toBeNull();
  });

  it('matches the explorer and chain id of the SDK deployment', () => {
    const d = getDeployment('xlayer');
    expect(XLAYER_EXPLORER).toBe(d.explorerUrl);
    expect(chainIdOf({ chain: 'xlayer', deploymentJson: null })).toBe(d.chainId);
  });
});
```

`apps/web/test/unit/build-env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildEnvFor } from '../../scripts/lib/build-env';

describe('build env', () => {
  it('always disables Next telemetry', () => {
    expect(buildEnvFor({}).NEXT_TELEMETRY_DISABLED).toBe('1');
  });

  it('defaults to deweb and drops the API URL there', () => {
    const env = buildEnvFor({ NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1' });
    expect(env.NEXT_PUBLIC_TARGET).toBe('deweb');
    expect('NEXT_PUBLIC_API_URL' in env).toBe(false);
  });

  it('keeps the API URL for vercel', () => {
    const env = buildEnvFor({
      NEXT_PUBLIC_TARGET: 'vercel',
      NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1',
    });
    expect(env.NEXT_PUBLIC_API_URL).toBe('https://x.supabase.co/functions/v1');
  });

  it('refuses an unknown target', () => {
    expect(() => buildEnvFor({ NEXT_PUBLIC_TARGET: 'pages' })).toThrow(/vercel or deweb/);
  });

  it('removes NODE_ENV, which Next sets itself, and never mutates its input', () => {
    const base = { NODE_ENV: 'test', NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1' };
    const env = buildEnvFor(base);
    expect('NODE_ENV' in env).toBe(false);
    expect(base).toEqual({ NODE_ENV: 'test', NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1' });
  });
});
```

`apps/web/test/unit/static-server.test.ts` (môi trường node):

```ts
// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startStaticServer } from '../../scripts/lib/static-server';

describe('static server', () => {
  const root = mkdtempSync(join(tmpdir(), 'atropyle-static-'));
  let server: Awaited<ReturnType<typeof startStaticServer>>;

  beforeAll(async () => {
    writeFileSync(join(root, 'index.html'), '<p>home</p>');
    writeFileSync(join(root, '404.html'), '<p>missing</p>');
    mkdirSync(join(root, 'proof'));
    writeFileSync(join(root, 'proof', 'index.html'), '<p>proof</p>');
    writeFileSync(join(root, 'font.woff2'), 'x');
    server = await startStaticServer(root, 0, { 'content-security-policy': "default-src 'self'" });
  });
  afterAll(() => server.close());

  it('serves directory index pages with and without the trailing slash', async () => {
    expect(await (await fetch(`${server.url}/`)).text()).toBe('<p>home</p>');
    expect(await (await fetch(`${server.url}/proof/`)).text()).toBe('<p>proof</p>');
    expect(await (await fetch(`${server.url}/proof`)).text()).toBe('<p>proof</p>');
  });

  it('answers 404 with the 404 page', async () => {
    const r = await fetch(`${server.url}/nope/`);
    expect(r.status).toBe(404);
    expect(await r.text()).toBe('<p>missing</p>');
  });

  it('sends the extra headers and the right content types', async () => {
    const r = await fetch(`${server.url}/font.woff2`);
    expect(r.headers.get('content-type')).toBe('font/woff2');
    expect(r.headers.get('content-security-policy')).toBe("default-src 'self'");
  });

  it('never serves a file outside the root', async () => {
    const r = await fetch(`${server.url}/..%2f..%2fetc%2fpasswd`);
    expect([403, 404]).toContain(r.status);
  });
});
```

- [ ] **Step 4: Chạy test, xác nhận hỏng**

Run: `npm test -w apps/web`
Expected: FAIL, không tìm thấy `../../src/config/env`, `../../scripts/lib/build-env`, `../../scripts/lib/static-server`.

- [ ] **Step 5: Viết `env.ts`, `build-env.ts`, `run-next.ts`, `static-server.ts`, `next.ts`**

`apps/web/src/config/env.ts`:

```ts
import type { ChainName } from '@atropyle/sdk';

export type Target = 'vercel' | 'deweb';

export interface RawEnv {
  NEXT_PUBLIC_TARGET?: string;
  NEXT_PUBLIC_CHAIN?: string;
  NEXT_PUBLIC_DEPLOYMENT?: string;
  NEXT_PUBLIC_API_URL?: string;
  NEXT_PUBLIC_DOCS_PATH?: string;
  NEXT_PUBLIC_APP_VERSION?: string;
}

export interface AppEnv {
  target: Target;
  chain: ChainName;
  /** Deployment JSON for e2e and local builds; null reads the SDK's built-in deployment of `chain`. */
  deploymentJson: string | null;
  /** Supabase Functions base URL; only the vercel build has one (spec §9.6). */
  apiUrl: string | null;
  /** Set by the site build when the site carries its own docs. */
  docsPath: '/docs/' | null;
  version: string;
}

/** The SDK deployment of X Layer uses this explorer; test/unit/env.test.ts keeps the two equal. */
export const XLAYER_EXPLORER = 'https://www.oklink.com/xlayer';

export function targetOf(raw: string | undefined): Target {
  const t = raw?.trim() ?? '';
  if (t === '' || t === 'deweb') return 'deweb';
  if (t === 'vercel') return 'vercel';
  throw new Error(`NEXT_PUBLIC_TARGET must be vercel or deweb, got "${t}"`);
}

export function chainNameOf(raw: string | undefined): ChainName {
  const c = raw?.trim() ?? '';
  if (c === '' || c === 'xlayer') return 'xlayer';
  if (c === 'local') return 'local';
  throw new Error(`NEXT_PUBLIC_CHAIN must be xlayer or local, got "${c}"`);
}

export function apiUrlOf(target: Target, raw: string | undefined): string | null {
  if (target !== 'vercel') return null;
  const s = raw?.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new Error('NEXT_PUBLIC_API_URL is not a URL');
  }
  if (u.protocol !== 'https:') throw new Error('NEXT_PUBLIC_API_URL must use https');
  if (u.username || u.password) throw new Error('NEXT_PUBLIC_API_URL must not carry credentials');
  if (u.search || u.hash) throw new Error('NEXT_PUBLIC_API_URL must not carry a query or a fragment');
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
}

export function readEnv(raw: RawEnv): AppEnv {
  const target = targetOf(raw.NEXT_PUBLIC_TARGET);
  return {
    target,
    chain: chainNameOf(raw.NEXT_PUBLIC_CHAIN),
    deploymentJson: raw.NEXT_PUBLIC_DEPLOYMENT?.trim() ? raw.NEXT_PUBLIC_DEPLOYMENT : null,
    apiUrl: apiUrlOf(target, raw.NEXT_PUBLIC_API_URL),
    docsPath: raw.NEXT_PUBLIC_DOCS_PATH === '/docs/' ? '/docs/' : null,
    version: raw.NEXT_PUBLIC_APP_VERSION?.trim() || '0.0.0',
  };
}

function deploymentField(json: string | null, key: string): unknown {
  if (!json) return undefined;
  try {
    const d = JSON.parse(json) as Record<string, unknown>;
    return d && typeof d === 'object' ? d[key] : undefined;
  } catch {
    // The SDK reports an invalid deployment when it loads; the shell only needs a best guess.
    return undefined;
  }
}

export function chainIdOf(env: Pick<AppEnv, 'chain' | 'deploymentJson'>): number {
  const id = deploymentField(env.deploymentJson, 'chainId');
  if (typeof id === 'number' && Number.isSafeInteger(id) && id > 0) return id;
  return env.chain === 'local' ? 31337 : 196;
}

export function explorerUrlOf(env: Pick<AppEnv, 'chain' | 'deploymentJson'>): string | null {
  if (env.deploymentJson) {
    const url = deploymentField(env.deploymentJson, 'explorerUrl');
    return typeof url === 'string' && url.startsWith('https://') ? url : null;
  }
  return env.chain === 'xlayer' ? XLAYER_EXPLORER : null;
}

// Next inlines each `process.env.NEXT_PUBLIC_*` member at build time, so every one is read by its full name.
export const ENV: AppEnv = readEnv({
  NEXT_PUBLIC_TARGET: process.env.NEXT_PUBLIC_TARGET,
  NEXT_PUBLIC_CHAIN: process.env.NEXT_PUBLIC_CHAIN,
  NEXT_PUBLIC_DEPLOYMENT: process.env.NEXT_PUBLIC_DEPLOYMENT,
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_DOCS_PATH: process.env.NEXT_PUBLIC_DOCS_PATH,
  NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
});

/** A literal comparison the minifier folds, so vercel-only code is dropped from the deweb bundle. */
export const IS_VERCEL: boolean = process.env.NEXT_PUBLIC_TARGET === 'vercel';
```

`apps/web/scripts/lib/build-env.ts`:

```ts
/** The environment every `next build` and `next dev` runs with (Quyết định 5 and spec §2). */
export function buildEnvFor(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, NEXT_TELEMETRY_DISABLED: '1' };
  const target = env.NEXT_PUBLIC_TARGET?.trim() || 'deweb';
  if (target !== 'vercel' && target !== 'deweb') {
    throw new Error(`NEXT_PUBLIC_TARGET must be vercel or deweb, got "${target}"`);
  }
  env.NEXT_PUBLIC_TARGET = target;
  if (target === 'deweb') delete env.NEXT_PUBLIC_API_URL;
  // Vitest sets NODE_ENV=test; Next picks production or development itself and warns on anything else.
  delete env.NODE_ENV;
  return env;
}
```

`apps/web/scripts/lib/run-next.ts`:

```ts
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildEnvFor } from './build-env';

export const APP_DIR = fileURLToPath(new URL('../..', import.meta.url));
export const OUT_DIR = fileURLToPath(new URL('../../out', import.meta.url));
/** `next` has no exports map, so its bin resolves by path from the hoisted package. */
export const NEXT_BIN = createRequire(import.meta.url).resolve('next/dist/bin/next');
/**
 * Quyết định 3, settled by the spike of Plan 7A Task 2: [] keeps Turbopack. Set ['--webpack'] when
 * `npm run worker:check` or test/build/fonts.test.ts fails under Turbopack and passes under webpack.
 */
export const BUNDLER_FLAGS: readonly string[] = [];

export interface RunOptions {
  env?: NodeJS.ProcessEnv;
  args?: readonly string[];
  /** Capture output instead of printing it (tests). */
  quiet?: boolean;
}

export function runNext(command: 'build' | 'dev', o: RunOptions = {}): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [NEXT_BIN, command, ...BUNDLER_FLAGS, ...(o.args ?? [])], {
      cwd: APP_DIR,
      env: buildEnvFor(o.env ?? process.env),
      stdio: o.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    });
    let output = '';
    child.stdout?.on('data', (d: Buffer) => {
      output += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      output += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

/** `next build` into out/, then the postbuild steps (Task 15 adds the CSP). */
export async function buildApp(o: RunOptions = {}): Promise<{ code: number; output: string }> {
  return runNext('build', o);
}
```

`apps/web/scripts/lib/static-server.ts`:

```ts
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves a static export like Vercel and the DeWEB gateway: `/x/` and `/x` read `x/index.html`, anything missing
 * gets `404.html` with status 404. Port 0 picks a free port.
 */
export async function startStaticServer(
  root: string,
  port = 0,
  headers: Record<string, string> = {},
): Promise<{ port: number; url: string; close(): Promise<void> }> {
  const server = createServer(async (req, res) => {
    let path: string;
    try {
      path = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    const rel = normalize(path).replace(/^[/\\]+/, '');
    if (rel.startsWith('..')) {
      res.writeHead(403).end();
      return;
    }
    const candidates = [join(root, rel), join(root, rel, 'index.html')];
    let file: string | null = null;
    for (const c of candidates) {
      if (await isFile(c)) {
        file = c;
        break;
      }
    }
    const status = file ? 200 : 404;
    const target = file ?? join(root, '404.html');
    try {
      const body = await readFile(target);
      res.writeHead(status, {
        ...headers,
        'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, headers).end('not found');
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  const bound = typeof addr === 'object' && addr ? addr.port : port;
  return {
    port: bound,
    url: `http://127.0.0.1:${bound}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
```

`apps/web/scripts/next.ts`:

```ts
import { buildApp, runNext } from './lib/run-next';

const [command, ...args] = process.argv.slice(2);
if (command !== 'build' && command !== 'dev') {
  console.error('usage: tsx scripts/next.ts build|dev [next arguments]');
  process.exit(2);
}
const r = command === 'build' ? await buildApp({ args }) : await runNext('dev', { args });
process.exit(r.code);
```

- [ ] **Step 6: Chạy test, xác nhận đạt**

Run: `npm run build && npm test -w apps/web`
Expected: PASS (env 6, build-env 5, static-server 4).

- [ ] **Step 7: Trang tối thiểu và trang smoke worker (chỉ build e2e)**

`apps/web/src/app/layout.tsx` (Task 9 thay bằng khung đầy đủ):

```tsx
import type { ReactNode } from 'react';

export const metadata = { title: 'Atropyle', description: 'Inheritance and wallet recovery on X Layer.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`apps/web/src/app/page.tsx` (Task 9 thay):

```tsx
export default function HomePage() {
  return (
    <main>
      <h1>Atropyle</h1>
    </main>
  );
}
```

`apps/web/src/workers/smoke-lazy.ts`:

```ts
/** Loaded with import() inside the smoke worker: proves that a worker can fetch its own lazy chunks. */
export const MARK = 'lazy-chunk-loaded';
```

`apps/web/src/workers/smoke.worker.ts`:

```ts
import { evaluatePolicyBundle, type PolicyBundle } from '@atropyle/sdk/verify';

export type SmokeResult = { state: 'ok' | 'error'; detail: string };

// Typed by hand: the WebWorker lib clashes with the DOM lib of this project.
const scope = self as unknown as {
  postMessage(m: SmokeResult): void;
  onmessage: ((e: MessageEvent<unknown>) => void) | null;
};

/** A bundle without the policy netlist: the SDK must refuse it with POLICY_UNAVAILABLE, before any enumeration. */
const EMPTY = {
  cpu: '0x0000000000000000000000000000000000000000',
  policyId: 0n,
  netlists: [],
} as unknown as PolicyBundle;

/**
 * Plan 7A Quyết định 3 and 19: the worker chunk loads under `worker-src 'self'`, runs SDK verify code and loads a
 * lazy chunk of its own.
 */
scope.onmessage = async () => {
  let mark: string;
  try {
    mark = (await import('./smoke-lazy')).MARK;
  } catch (e) {
    scope.postMessage({ state: 'error', detail: `lazy chunk failed: ${String(e)}` });
    return;
  }
  try {
    await evaluatePolicyBundle(EMPTY);
    scope.postMessage({ state: 'error', detail: 'a bundle without a policy was accepted' });
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    scope.postMessage(
      code === 'POLICY_UNAVAILABLE'
        ? { state: 'ok', detail: `${mark}; the SDK refused the bundle with ${code}` }
        : { state: 'error', detail: `unexpected error: ${String(e)}` },
    );
  }
};
```

`apps/web/src/app/e2e/worker/page.e2e.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import type { SmokeResult } from '../../../workers/smoke.worker';

type Check = SmokeResult | { state: 'running'; detail: string };

function runSmoke(): Promise<SmokeResult> {
  return new Promise((resolve) => {
    const w = new Worker(new URL('../../../workers/smoke.worker.ts', import.meta.url), { type: 'module' });
    const done = (r: SmokeResult) => {
      w.terminate();
      resolve(r);
    };
    w.onmessage = (e: MessageEvent<SmokeResult>) => done(e.data);
    w.onerror = (e) => done({ state: 'error', detail: e.message || 'the worker failed to load' });
    w.postMessage('run');
  });
}

/** Only in builds with ATROPYLE_E2E=1 (next.config.mjs pageExtensions). Read by scripts/worker-check.ts and e2e. */
export default function WorkerSmokePage() {
  const [smoke, setSmoke] = useState<Check>({ state: 'running', detail: '' });
  useEffect(() => {
    let live = true;
    runSmoke().then((r) => {
      if (live) setSmoke(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return (
    <main>
      <h1>Worker smoke test</h1>
      <p data-testid="worker-smoke" data-state={smoke.state}>
        {smoke.detail}
      </p>
    </main>
  );
}
```

- [ ] **Step 8: Viết `worker-check.ts` (spike)**

`apps/web/scripts/worker-check.ts`:

```ts
import { chromium } from '@playwright/test';
import { buildApp, OUT_DIR } from './lib/run-next';
import { startStaticServer } from './lib/static-server';

// The strictest policy the site will run under for workers and connections. Inline scripts stay allowed here
// because a header cannot carry the per-page hashes; the meta CSP of Task 15 adds those on top.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

const built = await buildApp({ env: { ...process.env, ATROPYLE_E2E: '1', NEXT_PUBLIC_TARGET: 'deweb' } });
if (built.code !== 0) process.exit(built.code);

const server = await startStaticServer(OUT_DIR, 0, { 'content-security-policy': CSP });
const browser = await chromium.launch();
let ok = false;
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/e2e/worker/`);
  const smoke = page.getByTestId('worker-smoke');
  await page.waitForSelector('[data-testid="worker-smoke"]:not([data-state="running"])', { timeout: 90_000 });
  const state = await smoke.getAttribute('data-state');
  console.log(`worker smoke: ${state} — ${await smoke.textContent()}`);
  for (const e of errors) console.error(`console: ${e}`);
  ok = state === 'ok' && !errors.some((e) => /Content Security Policy/i.test(e));
} finally {
  await browser.close();
  await server.close();
}
console.log(ok ? 'worker-check: PASS' : 'worker-check: FAIL');
process.exit(ok ? 0 : 1);
```

- [ ] **Step 9: Chạy spike và ghi quyết định bundler**

```bash
npm run playwright:install -w apps/web
npm run worker:check -w apps/web
```

- **Kết quả A (mong đợi):** in `worker smoke: ok — lazy-chunk-loaded; the SDK refused the bundle with POLICY_UNAVAILABLE` và `worker-check: PASS`. Giữ `BUNDLER_FLAGS = []`.
- **Kết quả B:** FAIL với Turbopack. Đổi trong `scripts/lib/run-next.ts` thành `export const BUNDLER_FLAGS: readonly string[] = ['--webpack'];` rồi chạy lại `npm run worker:check -w apps/web`. PASS thì giữ webpack.
- **Kết quả C:** FAIL với cả hai. Dừng task, báo người điều phối là BLOCKED, kèm toàn bộ output của hai lần chạy. Không viết workaround (ví dụ bỏ `worker-src`).

Thêm hàng 15 vào bảng §16 của spec `docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md`, ngay sau hàng 14. Kết quả A:

```markdown
| 15 | Turbopack (mặc định của Next 16) cho build và dev | Spike ở Plan 7A Task 2: worker module nạp `@atropyle/sdk/verify` và một chunk lười của chính nó dưới CSP `worker-src 'self'` trong Chromium | Bản Next sau làm hỏng worker hoặc font thì đổi `BUNDLER_FLAGS` sang `--webpack`, một dòng trong `scripts/lib/run-next.ts` |
```

Kết quả B (dán dòng lỗi mà `worker-check` in ra với Turbopack vào chỗ nói "lỗi"):

```markdown
| 15 | webpack (`next build --webpack`) cho build và dev | Spike ở Plan 7A Task 2: với Turbopack, worker không chạy dưới CSP `worker-src 'self'` (lỗi: dòng `worker smoke: error — …` của worker-check); webpack chạy | Build chậm hơn Turbopack; thử lại Turbopack ở bản Next sau bằng cách đặt `BUNDLER_FLAGS = []` |
```

- [ ] **Step 10: Test build thật cho hai target**

`apps/web/test/build/paths.ts`:

```ts
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILD_OUT = fileURLToPath(new URL('./.out', import.meta.url));
/** Present in the environment of both builds; must reach only the vercel build (Task 14). */
export const API_SENTINEL = 'https://api.atropyle.invalid/functions/v1';
export const outOf = (target: 'vercel' | 'deweb'): string => join(BUILD_OUT, target);
```

`apps/web/test/build/global-setup.ts`:

```ts
import { cpSync, existsSync, rmSync } from 'node:fs';
import { buildApp, OUT_DIR } from '../../scripts/lib/run-next';
import { API_SENTINEL, BUILD_OUT, outOf } from './paths';

/** Two real production builds; ATROPYLE_REUSE_BUILD=1 reuses the last ones for a quick rerun. */
export default async function setup(): Promise<void> {
  if (process.env.ATROPYLE_REUSE_BUILD === '1' && existsSync(outOf('vercel')) && existsSync(outOf('deweb'))) return;
  rmSync(BUILD_OUT, { recursive: true, force: true });
  for (const target of ['vercel', 'deweb'] as const) {
    // Typed: spreading process.env next to other keys drops its index signature, and `delete` needs it.
    const env: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_TARGET: target, NEXT_PUBLIC_API_URL: API_SENTINEL };
    delete env.ATROPYLE_E2E;
    const r = await buildApp({ env, quiet: true });
    if (r.code !== 0) throw new Error(`next build (${target}) failed:\n${r.output}`);
    cpSync(OUT_DIR, outOf(target), { recursive: true });
  }
}
```

`apps/web/test/build/output.test.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outOf } from './paths';

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} build`, () => {
    const out = outOf(target);

    it('is a static site with a home page and a 404 page', () => {
      expect(existsSync(join(out, 'index.html'))).toBe(true);
      expect(existsSync(join(out, '404.html'))).toBe(true);
    });

    it('ships no dev-only and no e2e-only pages', () => {
      expect(existsSync(join(out, 'dev'))).toBe(false);
      expect(existsSync(join(out, 'e2e'))).toBe(false);
    });
  });
}
```

Run: `npm run test:build -w apps/web`
Expected: PASS (4 test). Lần đầu mất vài phút vì hai lần `next build`.

- [ ] **Step 11: Job CI `web-next` và test của nó**

`scripts/test/site/ci-web-next.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  'working-directory'?: string;
}
interface Job {
  permissions?: Record<string, string>;
  steps: Step[];
}

const workflow = parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as { jobs: Record<string, Job> };
const job = workflow.jobs['web-next'] as Job;
const commands = (): string[] =>
  (job?.steps ?? [])
    .flatMap((s) => (s.run ?? '').split(/&&|\n/))
    .map((c) => c.trim())
    .filter((c) => c !== '');
const scriptsOf = (dir: string): string[] =>
  Object.keys(
    (JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')) as { scripts?: Record<string, string> })
      .scripts ?? {},
  );

/** Grows with Plan 7A: Task 15 adds the e2e, size and Lighthouse steps. */
const WEB_NEXT_COMMANDS = [
  'npm ci',
  'npm run build',
  'npm run typecheck -w apps/web',
  'npm test -w apps/web',
  'npm run playwright:install -w apps/web',
  'npm run test:build -w apps/web',
  'npm run worker:check -w apps/web',
];

test('the web-next job reads only, holds no secret and signs nothing', () => {
  expect(job).toBeDefined();
  expect(job.permissions).toEqual({ contents: 'read' });
  expect(JSON.stringify(job)).not.toMatch(
    /secrets\.|PRIVATE_KEY|DEWEB_OPERATOR_KEY|KEEPER_KEY|SUPABASE_ACCESS_TOKEN|VERCEL_TOKEN|--broadcast|cast send|deweb:publish|eth_sendRawTransaction/,
  );
});

test('the web-next job checks out without keeping credentials and pins every action', () => {
  const checkout = job.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
  expect(checkout?.with?.['persist-credentials']).toBe(false);
  for (const s of job.steps) if (s.uses) expect(s.uses, s.uses).toMatch(/@v\d+$/);
  expect(commands().some((c) => c.startsWith('npx'))).toBe(false);
});

test('the web-next job builds the SDK first, then tests, then builds both targets', () => {
  const c = commands();
  for (const want of WEB_NEXT_COMMANDS) expect(c, want).toContain(want);
  expect(c.indexOf('npm run build')).toBeLessThan(c.indexOf('npm test -w apps/web'));
  expect(c.indexOf('npm run playwright:install -w apps/web')).toBeLessThan(
    c.indexOf('npm run worker:check -w apps/web'),
  );
});

test('the web-next job runs only npm scripts that exist', () => {
  const runs = commands().filter((c) => c.startsWith('npm run ') || c.startsWith('npm test'));
  expect(runs.length).toBeGreaterThanOrEqual(WEB_NEXT_COMMANDS.length - 1);
  for (const c of runs) {
    const m = /^npm (?:run ([\w:-]+)|(test))(?: -w (\S+))?/.exec(c);
    expect(m, c).not.toBeNull();
    const [, script, npmTest, workspace] = m as RegExpExecArray;
    expect(scriptsOf(workspace ?? '.'), c).toContain(script ?? npmTest);
  }
});
```

Thêm job vào cuối `.github/workflows/ci.yml` (cùng mức thụt với job `web`):

```yaml
  # The Next.js web app v2 (Plan 7A). Read-only and keyless: no step signs or broadcasts anything.
  web-next:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: true
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Build circuits and the SDK
        run: npm run build
      - name: Typecheck and unit tests
        run: npm run typecheck -w apps/web && npm test -w apps/web
      - name: Chromium for Playwright
        run: npm run playwright:install -w apps/web
      - name: Production builds of both targets
        run: npm run test:build -w apps/web
      - name: The worker loads under a strict CSP
        run: npm run worker:check -w apps/web
```

Run: `npx vitest run --config scripts/vitest.site.config.ts scripts/test/site/ci-web-next.test.ts scripts/test/site/ci-web.test.ts`
Expected: PASS.

- [ ] **Step 12: Kiểm toàn repo và commit**

```bash
npm run typecheck
npx biome ci .
npm run lockfile:check
git status --short
```

Expected: không lỗi; `git status` không liệt kê `apps/web/.next`, `apps/web/out`, `apps/web/next-env.d.ts` hay `apps/web/test/build/.out`.

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/next.config.mjs apps/web/vitest.config.ts apps/web/vitest.build.config.ts apps/web/test/setup.ts apps/web/src/config/env.ts apps/web/src/app/layout.tsx apps/web/src/app/page.tsx apps/web/src/app/e2e/worker/page.e2e.tsx apps/web/src/workers/smoke.worker.ts apps/web/src/workers/smoke-lazy.ts apps/web/scripts/next.ts apps/web/scripts/worker-check.ts apps/web/scripts/lib/build-env.ts apps/web/scripts/lib/run-next.ts apps/web/scripts/lib/static-server.ts apps/web/test/unit/env.test.ts apps/web/test/unit/build-env.test.ts apps/web/test/unit/static-server.test.ts apps/web/test/build/paths.ts apps/web/test/build/global-setup.ts apps/web/test/build/output.test.ts scripts/test/site/ci-web-next.test.ts .github/workflows/ci.yml .gitignore biome.json package-lock.json docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md
git commit -m "feat(web): Next.js 16 static export scaffold, build wrapper and worker spike" -m "Ruling 15 of the spec records the bundler the spike settled." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Token màu, Tailwind v4 và test tương phản AA

**Files:**
- Create: `apps/web/postcss.config.mjs`, `apps/web/src/app/globals.css`, `apps/web/test/unit/contrast.test.ts`
- Modify: `apps/web/src/app/layout.tsx`, `apps/web/package.json`, `package-lock.json`, `biome.json`, `docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md` (§4.3, §16 hàng 16)

**Interfaces:**
- Consumes: Task 2 (layout, Vitest).
- Produces (lớp Tailwind mà mọi task sau dùng):
  - Màu: `bg`, `surface-1`, `surface-2`, `surface-3`, `ink`, `ink-muted`, `thread`, `on-thread`, `alive`, `grace`, `recovery`, `release`, `danger`, `on-danger`, `line`, `line-strong` (ví dụ `bg-surface-1`, `text-ink-muted`, `border-line`, `outline-thread`). Biến CSS gốc: `--atro-<tên>`; `--avatar-l` (độ sáng OKLCH của avatar).
  - Chữ: `text-caption|small|body|lead|title|h2|h1|display` (mỗi bậc có line-height riêng; VI ≥ 1.15 cho tiêu đề), `font-display`, `font-sans` (mặc định), `font-mono`.
  - Easing: `ease-out-expo`, `ease-in-out-sine`, `ease-spring` (`linear()` 443 ms). Animation: `animate-thread-pulse`, `animate-thread-tremble`, `animate-shimmer` (luôn dùng kèm `motion-safe:`).
  - Lớp animation cho Radix: `atro-overlay`, `atro-dialog`, `atro-sheet`, `atro-pop` (theo `data-state`).
  - Theme: không có `data-theme` thì theo hệ thống; `data-theme="dark"|"light"` trên `<html>` thì ép. (Task 9 đổi: không có `data-theme` là night; `data-theme="light"` là vellum, ở `<html>` hay ở một phần tử; chỉ `data-theme="system"` trên `<html>` theo thiết bị.)

- [ ] **Step 1: Cài Tailwind và bật cú pháp Tailwind cho Biome**

```bash
npm install -E -D -w apps/web tailwindcss@4.3.5 @tailwindcss/postcss@4.3.5
npm run lockfile:check -- --fix
npm run lockfile:check
```

Expected: `every dependency resolves.` (Tailwind v4 kéo binary `@tailwindcss/oxide-*` tuỳ nền tảng; `--fix` thêm lại gói tuỳ chọn nào mà npm trên Windows bỏ sót.)

`apps/web/postcss.config.mjs`:

```js
export default {
  plugins: { '@tailwindcss/postcss': {} },
};
```

Trong `biome.json`, thêm khoá `css` ngay sau khoá `javascript`:

```json
  "css": { "parser": { "tailwindDirectives": true } },
```

- [ ] **Step 2: Viết test tương phản (hỏng vì chưa có CSS)**

`apps/web/test/unit/contrast.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS_FILE = fileURLToPath(new URL('../../src/app/globals.css', import.meta.url));
const css = () => readFileSync(CSS_FILE, 'utf8');

/** The `--atro-*` colours declared in the first rule after a `/* tokens:<name> *\/` marker. */
function tokens(marker: string): Record<string, string> {
  const text = css();
  const at = text.indexOf(`/* tokens:${marker} */`);
  if (at < 0) throw new Error(`marker tokens:${marker} not found`);
  const first = text.indexOf('--atro-', at);
  const body = text.slice(first, text.indexOf('}', first));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--atro-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio. */
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const NAMES = [
  'bg',
  'surface-1',
  'surface-2',
  'surface-3',
  'ink',
  'ink-muted',
  'thread',
  'on-thread',
  'alive',
  'grace',
  'recovery',
  'release',
  'danger',
  'on-danger',
  'line',
  'line-strong',
];
const SURFACES = ['bg', 'surface-1', 'surface-2', 'surface-3'];
const TEXT = ['ink', 'ink-muted', 'thread', 'alive', 'grace', 'recovery', 'release', 'danger'];

describe('colour tokens', () => {
  it('declares the same sixteen colours for both themes, and the system light block equals the light block', () => {
    expect(Object.keys(tokens('dark')).sort()).toEqual([...NAMES].sort());
    expect(Object.keys(tokens('light')).sort()).toEqual([...NAMES].sort());
    expect(tokens('light-system')).toEqual(tokens('light'));
  });

  it('maps every token to a Tailwind colour', () => {
    for (const n of NAMES) expect(css(), n).toContain(`--color-${n}: var(--atro-${n});`);
  });

  for (const theme of ['dark', 'light'] as const) {
    describe(theme, () => {
      const t = () => tokens(theme);

      it('every text colour reaches AA (4.5:1) on every surface', () => {
        for (const fg of TEXT)
          for (const bg of SURFACES) {
            expect(contrast(t()[fg], t()[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
          }
      });

      it('body text on the background reaches AAA (7:1)', () => {
        expect(contrast(t().ink, t().bg)).toBeGreaterThanOrEqual(7);
      });

      it('text on filled buttons reaches AA', () => {
        expect(contrast(t()['on-thread'], t().thread)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t()['on-danger'], t().danger)).toBeGreaterThanOrEqual(4.5);
      });

      it('control borders and the focus ring reach 3:1 on every surface (WCAG 1.4.11)', () => {
        for (const bg of SURFACES) {
          expect(contrast(t()['line-strong'], t()[bg]), `line-strong on ${bg}`).toBeGreaterThanOrEqual(3);
          expect(contrast(t().thread, t()[bg]), `focus ring on ${bg}`).toBeGreaterThanOrEqual(3);
        }
      });
    });
  }
});
```

Run: `npm test -w apps/web -- contrast`
Expected: FAIL, `ENOENT … globals.css`.

- [ ] **Step 3: Viết `globals.css`**

`apps/web/src/app/globals.css`:

```css
@import "tailwindcss";

/*
 * Atropyle tokens (spec §4.3, §4.4, Quyết định 7, 10, 11 of Plan 7A). The default palette and type scale are
 * replaced, not extended: only Atropyle colours and steps exist.
 */
@theme {
  --color-*: initial;
  --text-*: initial;

  --text-caption: 0.75rem;
  --text-caption--line-height: 1.4;
  --text-small: 0.875rem;
  --text-small--line-height: 1.5;
  --text-body: clamp(1rem, 0.9792rem + 0.0926vw, 1.0625rem);
  --text-body--line-height: 1.6;
  --text-lead: clamp(1.125rem, 1.0625rem + 0.2778vw, 1.3125rem);
  --text-lead--line-height: 1.5;
  --text-title: clamp(1.375rem, 1.25rem + 0.5556vw, 1.75rem);
  --text-title--line-height: 1.25;
  --text-h2: clamp(1.75rem, 1.5rem + 1.1111vw, 2.5rem);
  --text-h2--line-height: 1.1;
  --text-h2--letter-spacing: -0.01em;
  --text-h1: clamp(2.25rem, 1.6667rem + 2.5926vw, 4rem);
  --text-h1--line-height: 1.04;
  --text-h1--letter-spacing: -0.015em;
  --text-display: clamp(2.75rem, 1.6667rem + 4.8148vw, 6rem);
  --text-display--line-height: 0.98;
  --text-display--letter-spacing: -0.02em;

  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out-sine: cubic-bezier(0.37, 0, 0.63, 1);
  /* stiffness 380, damping 32, mass 1, sampled over 443 ms (src/motion/tokens.ts SPRING_LINEAR). */
  --ease-spring: linear(
    0,
    0.0531,
    0.1741,
    0.321,
    0.4681,
    0.601,
    0.7132,
    0.8031,
    0.872,
    0.9225,
    0.958,
    0.9817,
    0.9966,
    1.0052,
    1.0095,
    1.0109,
    1.0106,
    1.0095,
    1.0079,
    1.0063,
    1.0048,
    1.0035,
    1.0024,
    1.0016,
    1
  );

  --animate-thread-pulse: thread-pulse 2.4s var(--ease-in-out-sine) infinite;
  --animate-thread-tremble: thread-tremble 0.9s var(--ease-in-out-sine) infinite;
  --animate-shimmer: shimmer 1.6s linear infinite;

  @keyframes thread-pulse {
    0%,
    100% {
      opacity: 0.22;
    }
    50% {
      opacity: 0.6;
    }
  }
  @keyframes thread-tremble {
    0%,
    100% {
      transform: translateY(0);
    }
    25% {
      transform: translateY(-0.6px);
    }
    75% {
      transform: translateY(0.6px);
    }
  }
  @keyframes shimmer {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(100%);
    }
  }
}

/* Colours and families resolve at use, so one class works in both themes and with the self-hosted fonts. */
@theme inline {
  --color-bg: var(--atro-bg);
  --color-surface-1: var(--atro-surface-1);
  --color-surface-2: var(--atro-surface-2);
  --color-surface-3: var(--atro-surface-3);
  --color-ink: var(--atro-ink);
  --color-ink-muted: var(--atro-ink-muted);
  --color-thread: var(--atro-thread);
  --color-on-thread: var(--atro-on-thread);
  --color-alive: var(--atro-alive);
  --color-grace: var(--atro-grace);
  --color-recovery: var(--atro-recovery);
  --color-release: var(--atro-release);
  --color-danger: var(--atro-danger);
  --color-on-danger: var(--atro-on-danger);
  --color-line: var(--atro-line);
  --color-line-strong: var(--atro-line-strong);

  --font-display: var(--font-fraunces, ui-serif), ui-serif, Georgia, serif;
  --font-sans: var(--font-inter, ui-sans-serif), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains, ui-monospace), ui-monospace, "SF Mono", Menlo, monospace;
}

/* tokens:dark */
:root,
[data-theme="dark"] {
  color-scheme: dark;
  --atro-bg: #0b0d12;
  --atro-surface-1: #12151c;
  --atro-surface-2: #181c25;
  --atro-surface-3: #20252f;
  --atro-ink: #ece7dd;
  --atro-ink-muted: #a59f94;
  --atro-thread: #e8b65a;
  --atro-on-thread: #0b0d12;
  --atro-alive: #5cc8b0;
  --atro-grace: #f0a23b;
  --atro-recovery: #7fa8ff;
  --atro-release: #b7a6ff;
  --atro-danger: #ff6b5e;
  --atro-on-danger: #0b0d12;
  --atro-line: #2a303c;
  --atro-line-strong: #737985;
  --avatar-l: 0.78;
}

/* tokens:light */
[data-theme="light"] {
  color-scheme: light;
  --atro-bg: #f6f1e7;
  --atro-surface-1: #fffdf8;
  --atro-surface-2: #f0eadf;
  --atro-surface-3: #e7dfd1;
  --atro-ink: #16130f;
  --atro-ink-muted: #5e574c;
  --atro-thread: #86590e;
  --atro-on-thread: #fffdf8;
  --atro-alive: #106f5a;
  --atro-grace: #945100;
  --atro-recovery: #2e5bc7;
  --atro-release: #5b44c9;
  --atro-danger: #b42318;
  --atro-on-danger: #fffdf8;
  --atro-line: #ddd3c2;
  --atro-line-strong: #80766a;
  --avatar-l: 0.52;
}

/* tokens:light-system */
@media (prefers-color-scheme: light) {
  :root:not([data-theme]) {
    color-scheme: light;
    --atro-bg: #f6f1e7;
    --atro-surface-1: #fffdf8;
    --atro-surface-2: #f0eadf;
    --atro-surface-3: #e7dfd1;
    --atro-ink: #16130f;
    --atro-ink-muted: #5e574c;
    --atro-thread: #86590e;
    --atro-on-thread: #fffdf8;
    --atro-alive: #106f5a;
    --atro-grace: #945100;
    --atro-recovery: #2e5bc7;
    --atro-release: #5b44c9;
    --atro-danger: #b42318;
    --atro-on-danger: #fffdf8;
    --atro-line: #ddd3c2;
    --atro-line-strong: #80766a;
    --avatar-l: 0.52;
  }
}

/* Vietnamese stacks diacritics (ặ, ỗ, ữ): headings never go below 1.15 (spec §4.2). */
:root:lang(vi) {
  --text-display--line-height: 1.15;
  --text-h1--line-height: 1.15;
  --text-h2--line-height: 1.18;
  --text-title--line-height: 1.3;
}

@layer base {
  html {
    background-color: var(--color-bg);
    color: var(--color-ink);
    -webkit-text-size-adjust: 100%;
    text-rendering: optimizeLegibility;
  }
  body {
    min-height: 100dvh;
    font-size: var(--text-body);
    line-height: var(--text-body--line-height);
    font-feature-settings: "cv11", "ss01";
    -webkit-font-smoothing: antialiased;
  }
  h1,
  h2,
  h3 {
    font-family: var(--font-display);
    font-optical-sizing: auto;
    font-variation-settings:
      "SOFT" var(--soft, 30),
      "WONK" var(--wonk, 0);
    text-wrap: balance;
  }
  p {
    text-wrap: pretty;
  }
  ::selection {
    background-color: color-mix(in oklab, var(--color-thread) 35%, transparent);
  }
  :focus-visible {
    outline: 2px solid var(--color-thread);
    outline-offset: 2px;
  }
}

/* Shared-element and theme transitions (src/motion/view-transition.tsx). */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 240ms;
  animation-timing-function: var(--ease-out-expo);
}
::view-transition-group(atropyle-thread) {
  animation-duration: 443ms;
  animation-timing-function: var(--ease-spring);
}

/* Radix overlays animate on `data-state` (tooltips open as `delayed-open` or `instant-open`); Radix waits for the
   closing animation before it unmounts. */
@media (prefers-reduced-motion: no-preference) {
  .atro-overlay[data-state="open"] {
    animation: atro-fade-in 240ms var(--ease-out-expo);
  }
  .atro-overlay[data-state="closed"] {
    animation: atro-fade-out 160ms var(--ease-out-expo);
  }
  .atro-dialog[data-state="open"] {
    animation: atro-rise-in 443ms var(--ease-spring);
  }
  .atro-dialog[data-state="closed"] {
    animation: atro-rise-out 160ms var(--ease-out-expo);
  }
  .atro-pop:is([data-state="open"], [data-state="delayed-open"], [data-state="instant-open"]) {
    animation: atro-pop-in 240ms var(--ease-out-expo);
  }
  .atro-pop[data-state="closed"] {
    animation: atro-fade-out 90ms linear;
  }
}
@media (prefers-reduced-motion: no-preference) and (max-width: 39.999rem) {
  .atro-sheet[data-state="open"] {
    animation: atro-sheet-in 443ms var(--ease-spring);
  }
  .atro-sheet[data-state="closed"] {
    animation: atro-sheet-out 240ms var(--ease-out-expo);
  }
}

/* Reduced motion: every transition becomes a 120 ms crossfade and nothing moves (spec §4.4). */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*) {
    animation: none;
  }
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 120ms;
    animation-timing-function: linear;
  }
  .atro-overlay[data-state="open"],
  .atro-dialog[data-state="open"],
  .atro-sheet[data-state="open"],
  .atro-pop:is([data-state="open"], [data-state="delayed-open"], [data-state="instant-open"]) {
    animation: atro-fade-in 120ms linear;
  }
  .atro-overlay[data-state="closed"],
  .atro-dialog[data-state="closed"],
  .atro-sheet[data-state="closed"],
  .atro-pop[data-state="closed"] {
    animation: atro-fade-out 120ms linear;
  }
}

@keyframes atro-fade-in {
  from {
    opacity: 0;
  }
}
@keyframes atro-fade-out {
  to {
    opacity: 0;
  }
}
@keyframes atro-rise-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
}
@keyframes atro-rise-out {
  to {
    opacity: 0;
    transform: translateY(6px) scale(0.99);
  }
}
@keyframes atro-pop-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
}
@keyframes atro-sheet-in {
  from {
    transform: translateY(100%);
  }
}
@keyframes atro-sheet-out {
  to {
    transform: translateY(100%);
  }
}
```

Sửa `apps/web/src/app/layout.tsx` để nạp CSS (Task 9 thay toàn bộ layout):

```tsx
import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Atropyle', description: 'Inheritance and wallet recovery on X Layer.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Chạy test, Biome và build**

```bash
npm test -w apps/web -- contrast
npx biome ci .
npm run build -w apps/web
```

Expected: contrast PASS (10 test); Biome không lỗi (nếu formatter đổi cách xuống dòng trong CSS, chạy `npx biome format --write apps/web/src/app/globals.css` rồi chạy lại test); build tạo `out/_next/static/**/*.css` có `--atro-bg`.

- [ ] **Step 5: Cập nhật spec §4.3 và ghi ruling 16**

```bash
SPEC=docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md
sed -i -e 's/| `#E8B65A` | `#A86F12` |/| `#E8B65A` | `#86590E` |/' -e 's/| `#5CC8B0` | `#127A63` |/| `#5CC8B0` | `#106F5A` |/' -e 's/| `#F0A23B` | `#A35A00` |/| `#F0A23B` | `#945100` |/' "$SPEC"
grep -n "86590E\|106F5A\|945100" "$SPEC"
```

Expected: ba dòng. Rồi thêm vào bảng §4.3, ngay sau dòng `danger`:

```markdown
| `on-thread` / `on-danger` | `#0B0D12` | `#FFFDF8` | Chữ trên nút tô `thread` hoặc `danger` |
| `line` | `#2A303C` | `#DDD3C2` | Đường kẻ trang trí |
| `line-strong` | `#737985` | `#80766A` | Viền điều khiển (≥ 3:1, WCAG 1.4.11) |
```

Và thêm hàng 16 vào bảng §16, sau hàng 15:

```markdown
| 16 | Làm đậm ba token light: `thread #86590E`, `alive #106F5A`, `grace #945100`; thêm `on-thread`, `on-danger`, `line`, `line-strong` | Giá trị ban đầu không đạt 4,5:1 trên `surface-3`; sau khi đổi, nhỏ nhất là 4,60:1 (light) và 5,50:1 (dark), test `contrast.test.ts` giữ ngưỡng | Vàng light hơi trầm hơn bản phác; đổi lại chỉ là sửa token, test chặn mọi giá trị không đạt AA |
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/postcss.config.mjs apps/web/src/app/globals.css apps/web/src/app/layout.tsx apps/web/test/unit/contrast.test.ts apps/web/package.json package-lock.json biome.json docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md
git commit -m "feat(web): colour, type and motion tokens on Tailwind v4, with an AA contrast test" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Font tự host (Fraunces, Inter, JetBrains Mono) qua `next/font/local`

**Files:**
- Create: `apps/web/src/fonts/ranges.ts`, `apps/web/src/fonts/index.ts`, `apps/web/src/fonts/files/` (9 file woff2), `apps/web/public/licenses/fonts/OFL-Fraunces.txt`, `OFL-Inter.txt`, `OFL-JetBrainsMono.txt`
- Create: `apps/web/test/unit/fonts.test.ts`, `apps/web/test/build/fonts.test.ts`
- Modify: `apps/web/src/app/layout.tsx`, `apps/web/package.json`, `package-lock.json`

**Interfaces:**
- Consumes: Task 3 (`--font-fraunces`, `--font-inter`, `--font-jetbrains` trong `@theme inline`), Task 2 (`test/build/paths.ts`).
- Produces: `src/fonts/index.ts` export `fontVariables: string` (chuỗi class đặt lên `<html>`); `src/fonts/ranges.ts` export `SUBSETS = ['vietnamese', 'latin-ext', 'latin'] as const`, `type Subset`, `RANGES: Record<Subset, string>`, `FONT_FILES: readonly { file: string; pkg: string }[]`. Họ font trong CSS: `'Atropyle Fraunces'`, `'Atropyle Inter'`, `'Atropyle Mono'` (cộng mặt `… Fallback` có size-adjust).

- [ ] **Step 1: Cài Fontsource (chỉ để lấy file) và chép woff2 cùng giấy phép**

```bash
npm install -E -D -w apps/web @fontsource-variable/fraunces@5.3.0 @fontsource-variable/inter@5.3.0 @fontsource-variable/jetbrains-mono@5.3.0
npm run lockfile:check -- --fix
npm run lockfile:check
F=node_modules/@fontsource-variable
mkdir -p apps/web/src/fonts/files apps/web/public/licenses/fonts
cp $F/fraunces/files/fraunces-{vietnamese,latin-ext,latin}-full-normal.woff2 apps/web/src/fonts/files/
cp $F/inter/files/inter-{vietnamese,latin-ext,latin}-wght-normal.woff2 apps/web/src/fonts/files/
cp $F/jetbrains-mono/files/jetbrains-mono-{vietnamese,latin-ext,latin}-wght-normal.woff2 apps/web/src/fonts/files/
cp $F/fraunces/LICENSE apps/web/public/licenses/fonts/OFL-Fraunces.txt
cp $F/inter/LICENSE apps/web/public/licenses/fonts/OFL-Inter.txt
cp $F/jetbrains-mono/LICENSE apps/web/public/licenses/fonts/OFL-JetBrainsMono.txt
ls -la apps/web/src/fonts/files
```

Expected: 9 file. Kích thước (đọc từ tarball 5.3.0): Fraunces `full` (đủ 4 trục opsz, wght, SOFT, WONK) vietnamese 34 KB, latin-ext 105 KB, latin 121 KB; Inter `wght` 10/85/48 KB; JetBrains Mono `wght` 8/15/40 KB.

- [ ] **Step 2: Viết test hỏng**

`apps/web/src/fonts/ranges.ts`:

```ts
/** Unicode ranges of the Fontsource 5.3.0 subsets; identical for Fraunces, Inter and JetBrains Mono. */
export const SUBSETS = ['vietnamese', 'latin-ext', 'latin'] as const;
export type Subset = (typeof SUBSETS)[number];

export const RANGES: Record<Subset, string> = {
  vietnamese:
    'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
};

export const FONT_FILES: readonly { file: string; pkg: string }[] = [
  ...SUBSETS.map((s) => ({ file: `fraunces-${s}-full-normal.woff2`, pkg: 'fraunces' })),
  ...SUBSETS.map((s) => ({ file: `inter-${s}-wght-normal.woff2`, pkg: 'inter' })),
  ...SUBSETS.map((s) => ({ file: `jetbrains-mono-${s}-wght-normal.woff2`, pkg: 'jetbrains-mono' })),
];
```

`apps/web/test/unit/fonts.test.ts`:

```ts
// @vitest-environment node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONT_FILES, RANGES, SUBSETS } from '../../src/fonts/ranges';

const at = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Each `localFont({ ... })` call of src/fonts/index.ts, read as text so that line breaks do not matter. */
function calls(): { file: string; preload: boolean; range: string }[] {
  const src = readFileSync(at('../../src/fonts/index.ts'), 'utf8');
  return src
    .split('localFont({')
    .slice(1)
    .map((chunk) => ({
      file: /src:\s*'\.\/files\/([^']+)'/.exec(chunk)?.[1] ?? '',
      preload: /preload:\s*true/.test(chunk),
      range: /prop:\s*'unicode-range',\s*value:\s*'([^']+)'/.exec(chunk)?.[1] ?? '',
    }));
}

describe('self-hosted fonts', () => {
  it('ships the nine woff2 files byte for byte as Fontsource 5.3.0 publishes them', () => {
    for (const { file, pkg } of FONT_FILES) {
      const ours = at(`../../src/fonts/files/${file}`);
      const theirs = at(`../../../../node_modules/@fontsource-variable/${pkg}/files/${file}`);
      expect(existsSync(ours), file).toBe(true);
      expect(sha(ours), file).toBe(sha(theirs));
    }
  });

  it('ships the SIL Open Font License of each family', () => {
    for (const name of ['Fraunces', 'Inter', 'JetBrainsMono']) {
      const text = readFileSync(at(`../../public/licenses/fonts/OFL-${name}.txt`), 'utf8');
      expect(text, name).toMatch(/^Copyright/);
      expect(text, name).toContain('SIL Open Font License, Version 1.1');
    }
  });

  it('writes the same literal unicode ranges into every next/font call as ranges.ts', () => {
    const literals = calls().map((c) => c.range);
    expect(literals).toHaveLength(9);
    for (let i = 0; i < 9; i++) expect(literals[i], `call ${i}`).toBe(RANGES[SUBSETS[i % 3]]);
  });

  it('preloads only the Latin files of Fraunces and Inter', () => {
    const preloaded = calls()
      .filter((c) => c.preload)
      .map((c) => c.file);
    expect(preloaded).toEqual(['fraunces-latin-full-normal.woff2', 'inter-latin-wght-normal.woff2']);
  });
});
```

`apps/web/test/build/fonts.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RANGES, SUBSETS } from '../../src/fonts/ranges';
import { outOf } from './paths';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** `U+0000-00FF,U+0131` (any case, any spacing, `?` wildcards) as sorted [start, end] pairs. */
function parseRanges(value: string): [number, number][] {
  return value
    .split(',')
    .map((part) => part.trim().replace(/^u\+/i, ''))
    .filter((p) => p !== '')
    .map((p): [number, number] => {
      if (p.includes('?'))
        return [Number.parseInt(p.replace(/\?/g, '0'), 16), Number.parseInt(p.replace(/\?/g, 'f'), 16)];
      const [a, b] = p.split('-');
      return [Number.parseInt(a, 16), Number.parseInt(b ?? a, 16)];
    })
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
}

interface Face {
  family: string;
  ranges: [number, number][] | null;
  sizeAdjust: boolean;
}

function faces(out: string): Face[] {
  const css = walk(join(out, '_next'))
    .filter((f) => f.endsWith('.css'))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
    const body = m[1];
    // The last font-family wins, as in CSS: next/font writes `declarations` before its own properties.
    const families = [...body.matchAll(/font-family:\s*([^;]+)/g)].map((x) => x[1].replace(/['"]/g, '').trim());
    const range = /unicode-range:\s*([^;]+)/.exec(body);
    return {
      family: families[families.length - 1] ?? '',
      ranges: range ? parseRanges(range[1]) : null,
      sizeAdjust: /size-adjust:/.test(body),
    };
  });
}

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} fonts`, () => {
    const out = outOf(target);

    for (const family of ['Atropyle Fraunces', 'Atropyle Inter', 'Atropyle Mono']) {
      it(`${family} has one face per subset, each with its own unicode range`, () => {
        const ours = faces(out).filter((f) => f.family === family);
        expect(ours).toHaveLength(3);
        const got = ours.map((f) => JSON.stringify(f.ranges)).sort();
        const want = SUBSETS.map((s) => JSON.stringify(parseRanges(RANGES[s]))).sort();
        expect(got).toEqual(want);
      });

      it(`${family} has a metric-adjusted fallback face, so the swap does not shift layout`, () => {
        const fallback = faces(out).filter((f) => f.family === `${family} Fallback`);
        expect(fallback).toHaveLength(1);
        expect(fallback[0].sizeAdjust).toBe(true);
      });
    }

    it('preloads exactly the Latin files of Fraunces and Inter on the home page', () => {
      const html = readFileSync(join(out, 'index.html'), 'utf8');
      const preloads = [...html.matchAll(/<link[^>]+rel="preload"[^>]+as="font"[^>]*>/g)].map((m) => m[0]);
      expect(preloads).toHaveLength(2);
      for (const p of preloads) expect(p).toMatch(/\.woff2"/);
    });

    it('never reaches a font CDN', () => {
      const all = walk(out)
        .filter((f) => /\.(html|css|js)$/.test(f))
        .map((f) => readFileSync(f, 'utf8'))
        .join('\n');
      expect(all).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit|fonts\.bunny/);
    });
  });
}
```

Run: `npm test -w apps/web -- fonts`
Expected: FAIL ở test literal và preload (`src/fonts/index.ts` chưa có); hai test đầu đã PASS sau Step 1.

- [ ] **Step 3: Viết `src/fonts/index.ts` và nạp vào layout**

`apps/web/src/fonts/index.ts`:

```ts
import localFont from 'next/font/local';

// Quyết định 8: three subsets per family share one family name, each with its own unicode-range, so a page loads
// only the files it needs. next/font reads options statically, so every value is a literal; test/unit/fonts.test.ts
// compares the ranges with src/fonts/ranges.ts. Only the Latin subsets preload and carry a metric-adjusted fallback.

const frauncesVi = localFont({
  src: './files/fraunces-vietnamese-full-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-fraunces-vi',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Fraunces'" },
    {
      prop: 'unicode-range',
      value:
        'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
    },
  ],
});

const frauncesExt = localFont({
  src: './files/fraunces-latin-ext-full-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-fraunces-ext',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Fraunces'" },
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    },
  ],
});

const fraunces = localFont({
  src: './files/fraunces-latin-full-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: true,
  adjustFontFallback: 'Times New Roman',
  fallback: ['ui-serif', 'Georgia', 'serif'],
  variable: '--font-fraunces',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Fraunces'" },
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    },
  ],
});

const interVi = localFont({
  src: './files/inter-vietnamese-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-inter-vi',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Inter'" },
    {
      prop: 'unicode-range',
      value:
        'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
    },
  ],
});

const interExt = localFont({
  src: './files/inter-latin-ext-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-inter-ext',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Inter'" },
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    },
  ],
});

const inter = localFont({
  src: './files/inter-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: true,
  adjustFontFallback: 'Arial',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
  variable: '--font-inter',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Inter'" },
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    },
  ],
});

const monoVi = localFont({
  src: './files/jetbrains-mono-vietnamese-wght-normal.woff2',
  weight: '100 800',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-jetbrains-vi',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Mono'" },
    {
      prop: 'unicode-range',
      value:
        'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
    },
  ],
});

const monoExt = localFont({
  src: './files/jetbrains-mono-latin-ext-wght-normal.woff2',
  weight: '100 800',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-jetbrains-ext',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Mono'" },
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    },
  ],
});

const mono = localFont({
  src: './files/jetbrains-mono-latin-wght-normal.woff2',
  weight: '100 800',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Arial',
  fallback: ['ui-monospace', 'Menlo', 'monospace'],
  variable: '--font-jetbrains',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Mono'" },
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    },
  ],
});

/** Every call's variable class goes on <html>, so each subset's @font-face ships and the three tokens resolve. */
export const fontVariables = [frauncesVi, frauncesExt, fraunces, interVi, interExt, inter, monoVi, monoExt, mono]
  .map((f) => f.variable)
  .join(' ');
```

(Nếu Biome xuống dòng các `declarations` dài, chạy `npx biome format --write apps/web/src/fonts/index.ts`; test đọc từng lời gọi `localFont({` như văn bản, không phụ thuộc cách xuống dòng.)

Sửa `apps/web/src/app/layout.tsx`:

```tsx
import type { ReactNode } from 'react';
import { fontVariables } from '@/fonts';
import './globals.css';

export const metadata = { title: 'Atropyle', description: 'Inheritance and wallet recovery on X Layer.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Chạy test đơn vị và test build**

```bash
npm test -w apps/web -- fonts
npm run test:build -w apps/web
```

Expected: unit PASS (4); build PASS (mỗi target 8 test font + 2 test output).

Nếu `test/build/fonts.test.ts` hỏng với Turbopack (ví dụ họ font là tên băm thay vì `Atropyle Fraunces`, hoặc thiếu mặt Fallback): đổi `BUNDLER_FLAGS` trong `apps/web/scripts/lib/run-next.ts` thành `['--webpack']`, chạy lại `npm run test:build -w apps/web` và `npm run worker:check -w apps/web`. Cả hai PASS thì sửa hàng 15 của spec §16 thành bản webpack (Task 2 Step 9), ghi lý do "Turbopack bỏ `font-family` tự đặt của `next/font/local`" cùng dòng lỗi của test. Hỏng cả với webpack thì dừng và báo BLOCKED kèm output.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/fonts apps/web/public/licenses/fonts apps/web/src/app/layout.tsx apps/web/test/unit/fonts.test.ts apps/web/test/build/fonts.test.ts apps/web/package.json package-lock.json
git commit -m "feat(web): self-hosted Fraunces, Inter and JetBrains Mono with per-subset faces and OFL licences" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Nếu Step 4 đổi bundler, thêm `apps/web/scripts/lib/run-next.ts docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md` vào `git add`.)

---

### Task 5: i18n, bộ nhớ, theme và các helper dùng chung

Task này port nguyên văn i18n, store, format và toàn bộ file message của web cũ, chép tại chỗ bốn helper nhỏ của SDK (Quyết định 13), rồi viết mới `KVProvider`, `LangProvider` và `ThemeProvider`.

**Files:**
- Create (port): `apps/web/src/i18n/core.ts`, `apps/web/src/lib/format.ts`, `apps/web/src/messages/{labels,common,shell,tx,action-runner,editors,create,developers,guardian,heir,home,owner,sign,status,vault,verify}.messages.ts`, `apps/web/test/unit/{i18n,format}.test.ts`
- Create (chép SDK): `apps/web/src/lib/untrusted.ts`, `apps/web/src/lib/duration.ts`, `apps/web/src/lib/docs.ts`, `apps/web/src/lib/address.ts`
- Create (mới): `apps/web/src/lib/store.ts`, `apps/web/src/lib/kv.tsx`, `apps/web/src/lib/links.ts`, `apps/web/src/lib/cn.ts`, `apps/web/src/lib/use-mounted.ts`, `apps/web/src/i18n/provider.tsx`, `apps/web/src/theme/theme.ts`, `apps/web/src/theme/provider.tsx`, `apps/web/src/messages/ui.messages.ts`
- Test: `apps/web/test/unit/{store,sdk-copies,links,theme,lang,address}.test.ts(x)`, `apps/web/test/helpers/render.tsx`

**Interfaces:**
- Consumes: không có (chỉ `import type` từ `@atropyle/sdk`).
- Produces:
  - `src/i18n/core.ts`: `type Lang = 'en' | 'vi'`; `interface Messages<K extends string> { en; vi }`; `type Params = Record<string, string | number | bigint>`; `defineMessages(en, vi)`; `format(template, params?)`; `translate(m, lang, key, params?)`; `placeholders(s)`; `detectLang(stored: string | null, languages: readonly string[]): Lang`.
  - `src/i18n/provider.tsx`: `LangProvider({ children })`; `useLang(): { lang: Lang; setLang(l: Lang): void }`; `useT<K extends string>(m: Messages<K>): (key: K, params?: Params) => string`.
  - `src/lib/store.ts`: `interface KV { get; set; remove }`; `memoryKV()`; `safeKV(storage: () => Storage | null | undefined)`; `readJson<T>(kv, key, revive)`; `writeJson(kv, key, value)`; `jsonStringify(value: unknown, space?: number): string`; `KEYS = { lang, crossCheck, theme, haptics, wallet, stats }`.
  - `src/lib/kv.tsx`: `KVProvider({ kv?, children })`; `useKV(): KV`.
  - `src/theme/theme.ts`: `type ThemeChoice = 'system' | 'light' | 'dark'`; `THEME_CHOICES`; `parseTheme(raw: string | null | undefined): ThemeChoice`; `readThemeAttr(): ThemeChoice`; `subscribeTheme(cb: () => void): () => void`; `applyTheme(choice: ThemeChoice, root?: HTMLElement): void`.
  - `src/theme/provider.tsx`: `ThemeProvider({ children })`; `useTheme(): { choice: ThemeChoice; resolved: 'light' | 'dark'; setChoice(c: ThemeChoice): void }`.
  - `src/lib/untrusted.ts`: `interface Untrusted`, `untrusted(raw: unknown, max?: number): Untrusted`. `src/lib/duration.ts`: `formatDuration(seconds: number | bigint): string`. `src/lib/docs.ts`: `DOCS_BASE_URL`, `errorDocsUrl(code: string): string`. `src/lib/address.ts`: `sameAddress(a, b)`, `isAddressText(s: string): boolean`, `addressGroups(address: string): string[]`, `compactAddress(address: string): string`.
  - `src/lib/format.ts`: `formatAmount`, `formatBps`, `formatTimestamp`, `formatRemaining`, `coveragePercent`, `chainNow` (chữ ký như web cũ).
  - `src/lib/links.ts`: `explorerAddress(base, address)`, `explorerTx(base, hash)`, `explorerName(base)`, `docsHome(docsPath)`, `REPO_URL`, `LICENSE_URL`, `XLAYER_URL`.
  - `src/lib/cn.ts`: `type ClassValue = string | false | null | undefined`; `cn(...v: ClassValue[]): string`. `src/lib/use-mounted.ts`: `useMounted(): boolean` (false lúc prerender và hydrate, true sau đó).
  - `src/messages/labels.messages.ts`: `messages`, `type LabelKey`, `STATE_KEY`, `ROLE_KEY`, `THREAD_STATE_KEY: Record<StateName | 'expired', LabelKey>`. `src/messages/ui.messages.ts`: `messages` (khoá ở Step 5). Mọi file `*.messages.ts` export `messages`.
  - `test/helpers/render.tsx`: `renderWithProviders(ui, o?: { kv?: KV; lang?: Lang })` trả kết quả `render` cộng `kv`; `rerender(next)` vẫn bọc provider.

- [ ] **Step 1: Port i18n, format và các file message (chép rồi sửa đường dẫn import)**

```bash
L=apps/web-legacy
W=apps/web
mkdir -p $W/src/i18n $W/src/lib $W/src/messages $W/test/helpers
cp $L/src/lib/i18n.ts $W/src/i18n/core.ts
cp $L/src/lib/format.ts $W/src/lib/format.ts
sed -i "s#^import { formatDuration } from '@atropyle/sdk';#import { formatDuration } from './duration';#" $W/src/lib/format.ts
for f in labels common shell action-runner editors; do cp $L/src/ui/$f.messages.ts $W/src/messages/$f.messages.ts; done
cp $L/src/ui/tx-runner.messages.ts $W/src/messages/tx.messages.ts
for f in create developers guardian heir home owner sign status vault verify; do cp $L/src/pages/$f.messages.ts $W/src/messages/$f.messages.ts; done
sed -i "s#from '../lib/i18n';#from '@/i18n/core';#" $W/src/messages/*.messages.ts
grep -L "from '@/i18n/core'" $W/src/messages/*.messages.ts
cp $L/test/unit/i18n.test.ts $W/test/unit/i18n.test.ts
sed -i "s#'../../src/lib/i18n'#'../../src/i18n/core'#" $W/test/unit/i18n.test.ts
cp $L/test/unit/format.test.ts $W/test/unit/format.test.ts
```

Expected: `grep -L` không in gì (cả 16 file đã đổi import). `format.test.ts` vẫn import `formatDuration` từ `@atropyle/sdk` để so: test được phép import SDK, chỉ `src/` bị ranh giới nạp lười ràng buộc.

Thêm trạng thái "Drill hết hạn" (spec §4.1) vào `apps/web/src/messages/labels.messages.ts`: trong object `en`, sau `stateReleasedRecover: 'Released to the recovery wallet',` thêm `stateExpired: 'Drill expired',`; trong object `vi`, sau `stateReleasedRecover: 'Đã giải phóng cho ví khôi phục',` thêm `stateExpired: 'Drill đã hết hạn',`. Cuối file thêm:

```ts
/** The states a Thread or StateBadge can show: the five vault states plus an expired Drill (spec §4.1). */
export const THREAD_STATE_KEY: Record<StateName | 'expired', LabelKey> = { ...STATE_KEY, expired: 'stateExpired' };
```

- [ ] **Step 2: Viết test hỏng cho store, bản chép SDK, link và địa chỉ**

`apps/web/test/unit/store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { jsonStringify, KEYS, memoryKV, readJson, safeKV, writeJson } from '../../src/lib/store';

describe('store', () => {
  it('keeps values in memory', () => {
    const kv = memoryKV();
    kv.set('a', '1');
    expect(kv.get('a')).toBe('1');
    kv.remove('a');
    expect(kv.get('a')).toBeNull();
  });

  it('falls back to memory when localStorage throws', () => {
    const kv = safeKV(() => {
      throw new Error('SecurityError');
    });
    kv.set('a', '1');
    expect(kv.get('a')).toBe('1');
  });

  it('falls back to memory when there is no storage', () => {
    const kv = safeKV(() => null);
    kv.set('b', '2');
    expect(kv.get('b')).toBe('2');
  });

  it('falls back to memory when every storage call throws (quota, blocked site data)', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const kv = safeKV(() => broken);
    kv.set('c', '3');
    expect(kv.get('c')).toBe('3');
    kv.remove('c');
    expect(kv.get('c')).toBeNull();
  });

  it('writes bigint values as strings and drops corrupt entries', () => {
    const kv = memoryKV();
    writeJson(kv, 'x', { n: 10n });
    expect(kv.get('x')).toBe('{"n":"10"}');
    expect(readJson(kv, 'x', (raw) => (raw as { n: string }).n)).toBe('10');
    kv.set('bad', '{nope');
    expect(readJson(kv, 'bad', () => 1)).toBeNull();
    expect(kv.get('bad')).toBeNull();
    kv.set('old', '{"v":0}');
    expect(readJson(kv, 'old', () => null)).toBeNull();
    expect(kv.get('old')).toBeNull();
  });

  it('serialises bytes as 0x hex and drops undefined members', () => {
    expect(jsonStringify({ b: new Uint8Array([0, 15, 255]), u: undefined, a: [1n] })).toBe(
      '{"b":"0x000fff","a":["1"]}',
    );
  });

  it('namespaces every key', () => {
    for (const key of Object.values(KEYS)) expect(key).toMatch(/^atropyle:[a-zA-Z]+$/);
    expect(new Set(Object.values(KEYS)).size).toBe(Object.values(KEYS).length);
  });
});
```

`apps/web/test/unit/sdk-copies.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as sdk from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { sameAddress } from '../../src/lib/address';
import { DOCS_BASE_URL, errorDocsUrl } from '../../src/lib/docs';
import { formatDuration } from '../../src/lib/duration';
import { jsonStringify } from '../../src/lib/store';
import { untrusted } from '../../src/lib/untrusted';

const text = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Quyết định 13: the shell keeps small copies of SDK helpers so the home page never loads the SDK.
describe('local copies of SDK helpers', () => {
  it('untrusted.ts is a byte-for-byte copy of the SDK file', () => {
    expect(text('../../src/lib/untrusted.ts')).toBe(text('../../../../packages/sdk/src/untrusted.ts'));
  });

  it('untrusted cleans hostile text exactly like the SDK', () => {
    const inputs: unknown[] = ['USD\u{202E}C', 'a\u{200B}b', 'x'.repeat(100), '\u{E0041}tag', 'two\nlines', 42, null];
    for (const s of inputs) expect(untrusted(s), String(s)).toEqual(sdk.untrusted(s));
  });

  it('formatDuration matches the SDK', () => {
    const inputs: (number | bigint)[] = [
      0,
      1,
      59,
      60,
      61,
      3599,
      3600,
      86_399,
      86_400,
      90_061,
      1_000_000,
      -5,
      10n ** 6n,
    ];
    for (const s of inputs) expect(formatDuration(s), String(s)).toBe(sdk.formatDuration(s));
  });

  it('the docs links match the SDK', () => {
    expect(DOCS_BASE_URL).toBe(sdk.DOCS_BASE_URL);
    expect(errorDocsUrl('NOT_VAULT')).toBe(sdk.errorDocsUrl('NOT_VAULT'));
  });

  it('sameAddress matches the SDK', () => {
    const a = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
    const cases: [string | null, string | null][] = [
      [a, a.toLowerCase()],
      [a, null],
      [null, null],
      ['', ''],
      [a, '0x0000000000000000000000000000000000000000'],
    ];
    for (const [x, y] of cases) expect(sameAddress(x, y)).toBe(sdk.sameAddress(x, y));
  });

  it('jsonStringify matches the SDK stringify', () => {
    const v = { a: 1n, b: [2n, 'x', null], c: { d: 10n ** 30n, e: undefined }, f: true, g: new Uint8Array([1, 2]) };
    expect(jsonStringify(v)).toBe(sdk.stringify(v));
    expect(jsonStringify(v, 2)).toBe(sdk.stringify(v, 2));
  });
});
```

`apps/web/test/unit/links.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DOCS_BASE_URL } from '../../src/lib/docs';
import {
  docsHome,
  explorerAddress,
  explorerName,
  explorerTx,
  LICENSE_URL,
  REPO_URL,
  XLAYER_URL,
} from '../../src/lib/links';

describe('links', () => {
  it('builds explorer links', () => {
    expect(explorerAddress('https://www.oklink.com/xlayer/', '0xAb')).toBe(
      'https://www.oklink.com/xlayer/address/0xAb',
    );
    expect(explorerTx('https://www.oklink.com/xlayer', '0x12')).toBe('https://www.oklink.com/xlayer/tx/0x12');
    expect(explorerName('https://www.oklink.com/xlayer')).toBe('OKLink');
    expect(explorerName('http://127.0.0.1:1')).toBe('Explorer');
    expect(explorerName('not a url')).toBe('Explorer');
  });

  it('opens docs on the same site when the site has them', () => {
    expect(docsHome('/docs/')).toBe('/docs/');
    expect(docsHome(null)).toBe(`${DOCS_BASE_URL}/`);
  });

  it('points the footer at https pages only', () => {
    for (const url of [REPO_URL, LICENSE_URL, XLAYER_URL]) expect(new URL(url).protocol).toBe('https:');
  });
});
```

`apps/web/test/unit/address.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addressGroups, compactAddress, isAddressText } from '../../src/lib/address';

const A = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

describe('address text', () => {
  it('recognises a 0x-prefixed 40-digit hex string only', () => {
    expect(isAddressText(A)).toBe(true);
    expect(isAddressText(A.toLowerCase())).toBe(true);
    expect(isAddressText(A.slice(0, 41))).toBe(false);
    expect(isAddressText(`${A}0`)).toBe(false);
    expect(isAddressText(A.replace('0x', '0X'))).toBe(false);
    expect(isAddressText(' '.repeat(42))).toBe(false);
  });

  it('splits the full address into ten groups of four after the prefix (spec §4.2)', () => {
    const g = addressGroups(A);
    expect(g).toEqual(['0x', '3C44', 'CdDd', 'B6a9', '00fa', '2b58', '5dd2', '99e0', '3d12', 'FA42', '93BC']);
    expect(g.join('')).toBe(A);
  });

  it('keeps anything that is not an address as one piece', () => {
    expect(addressGroups('vault.eth')).toEqual(['vault.eth']);
  });

  it('compacts only for the header account button: first and last two groups', () => {
    expect(compactAddress(A)).toBe('0x3C44 CdDd … FA42 93BC');
    expect(compactAddress('short')).toBe('short');
  });
});
```

Run: `npm test -w apps/web -- store sdk-copies links address i18n format`
Expected: FAIL (`Cannot find module '../../src/lib/store'` và tương tự). `i18n.test.ts` và `format.test.ts` hỏng vì `src/lib/duration.ts` chưa có.

- [ ] **Step 3: Viết store, bản chép SDK, link, địa chỉ, `cn` và `useMounted`**

```bash
cp packages/sdk/src/untrusted.ts apps/web/src/lib/untrusted.ts
```

`apps/web/src/lib/duration.ts`:

```ts
/** Copy of formatDuration in packages/sdk/src/duration.ts (Quyết định 13; test/unit/sdk-copies.test.ts). */
export function formatDuration(seconds: number | bigint): string {
  let s = Number(seconds);
  if (s <= 0) return '0s';
  const parts: string[] = [];
  for (const [u, n] of [
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1],
  ] as const) {
    const q = Math.floor(s / n);
    if (q > 0) {
      parts.push(`${q}${u}`);
      s -= q * n;
    }
  }
  return parts.slice(0, 2).join(' ');
}
```

`apps/web/src/lib/docs.ts`:

```ts
/** Copy of packages/sdk/src/links.ts (Quyết định 13; test/unit/sdk-copies.test.ts keeps them equal). */
export const DOCS_BASE_URL = 'https://duongnq2798.github.io/atropyle/docs';

export function errorDocsUrl(code: string): string {
  return `${DOCS_BASE_URL}/reference/errors.html#${code.toLowerCase()}`;
}
```

`apps/web/src/lib/address.ts`:

```ts
/** Copy of sameAddress in packages/sdk/src/address.ts (Quyết định 13). */
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/** Shape only: 0x and 40 hex digits. Checksums are the SDK's job (`toAddress`), loaded lazily. */
export function isAddressText(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

/** `0x` then ten groups of four, so two addresses can be compared group by group (spec §4.2). */
export function addressGroups(address: string): string[] {
  if (!isAddressText(address)) return [address];
  const body = address.slice(2);
  return ['0x', ...Array.from({ length: 10 }, (_, i) => body.slice(i * 4, i * 4 + 4))];
}

/**
 * Only for the connected account in the header, where the full address is one click away. Every address the user
 * must check (recipients, heirs, guardians, vaults) is shown in full with <Address>.
 */
export function compactAddress(address: string): string {
  const g = addressGroups(address);
  if (g.length === 1) return address;
  return `0x${g[1]} ${g[2]} … ${g[9]} ${g[10]}`;
}
```

`apps/web/src/lib/store.ts`:

```ts
export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => {
      m.set(k, v);
    },
    remove: (k) => {
      m.delete(k);
    },
  };
}

/** localStorage when it works; private windows, blocked storage and full quotas fall back to memory. */
export function safeKV(storage: () => Storage | null | undefined): KV {
  const mem = memoryKV();
  const s = (): Storage | null => {
    try {
      return storage() ?? null;
    } catch {
      return null;
    }
  };
  return {
    get: (k) => {
      try {
        return s()?.getItem(k) ?? mem.get(k);
      } catch {
        return mem.get(k);
      }
    },
    set: (k, v) => {
      mem.set(k, v);
      try {
        s()?.setItem(k, v);
      } catch {
        // the memory copy above is enough
      }
    },
    remove: (k) => {
      mem.remove(k);
      try {
        s()?.removeItem(k);
      } catch {
        // nothing stored
      }
    },
  };
}

const HEX = '0123456789abcdef';

function toJson(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString(10);
  if (value instanceof Uint8Array) {
    let s = '0x';
    for (const b of value) s += HEX[b >> 4] + HEX[b & 15];
    return s;
  }
  if (Array.isArray(value)) return value.map(toJson);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = toJson(v);
    }
    return out;
  }
  return value;
}

/** Same output as `stringify` of @atropyle/sdk (bigint → decimal string, bytes → 0x hex), without loading the SDK. */
export function jsonStringify(value: unknown, space?: number): string {
  return JSON.stringify(toJson(value), null, space);
}

export function readJson<T>(kv: KV, key: string, revive: (raw: unknown) => T | null): T | null {
  const text = kv.get(key);
  if (text === null) return null;
  try {
    const value = revive(JSON.parse(text));
    if (value !== null) return value;
  } catch {
    // corrupt entry: removed below
  }
  kv.remove(key);
  return null;
}

export function writeJson(kv: KV, key: string, value: unknown): void {
  kv.set(key, jsonStringify(value));
}

export const KEYS = {
  lang: 'atropyle:lang',
  crossCheck: 'atropyle:crossCheck',
  theme: 'atropyle:theme',
  haptics: 'atropyle:haptics',
  wallet: 'atropyle:wallet',
  stats: 'atropyle:stats',
} as const;
```

`apps/web/src/lib/links.ts`:

```ts
import { DOCS_BASE_URL } from './docs';

const trim = (base: string) => base.replace(/\/+$/, '');

export const REPO_URL = 'https://github.com/duongnq2798/atropyle';
export const LICENSE_URL = `${REPO_URL}/blob/main/packages/sdk/LICENSE`;
export const XLAYER_URL = 'https://web3.okx.com/xlayer';

export function explorerAddress(base: string, address: string): string {
  return `${trim(base)}/address/${address}`;
}

export function explorerTx(base: string, hash: string): string {
  return `${trim(base)}/tx/${hash}`;
}

export function explorerName(base: string): string {
  try {
    return new URL(base).hostname.endsWith('oklink.com') ? 'OKLink' : 'Explorer';
  } catch {
    return 'Explorer';
  }
}

export function docsHome(docsPath: string | null): string {
  return docsPath ?? `${DOCS_BASE_URL}/`;
}
```

`apps/web/src/lib/cn.ts`:

```ts
export type ClassValue = string | false | null | undefined;

/** Joins the truthy class names. Tailwind classes are written so that no two in one call conflict. */
export function cn(...v: ClassValue[]): string {
  return v.filter(Boolean).join(' ');
}
```

`apps/web/src/lib/use-mounted.ts`:

```ts
import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/** False while prerendering and hydrating, true afterwards: for markup that must match the static HTML first. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
```

Run: `npm test -w apps/web -- store sdk-copies links address i18n format`
Expected: PASS. `i18n` chạy được 5 test trên 16 file message (test cuối duyệt mọi file).

- [ ] **Step 4: Viết test hỏng cho `KVProvider`, `LangProvider` và `ThemeProvider`**

`apps/web/test/helpers/render.tsx`:

```tsx
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { Lang } from '@/i18n/core';
import { LangProvider } from '@/i18n/provider';
import { KVProvider } from '@/lib/kv';
import { KEYS, type KV, memoryKV } from '@/lib/store';

/** Renders inside the storage and language providers, as every page is; `rerender` keeps them. */
export function renderWithProviders(ui: ReactElement, o: { kv?: KV; lang?: Lang } = {}) {
  const kv = o.kv ?? memoryKV();
  if (o.lang) kv.set(KEYS.lang, o.lang);
  const wrap = (node: ReactElement) => (
    <KVProvider kv={kv}>
      <LangProvider>{node}</LangProvider>
    </KVProvider>
  );
  const r = render(wrap(ui));
  return { ...r, kv, rerender: (next: ReactElement) => r.rerender(wrap(next)) };
}
```

`apps/web/test/unit/lang.test.tsx`:

```tsx
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineMessages } from '../../src/i18n/core';
import { LangProvider, useLang, useT } from '../../src/i18n/provider';
import { KVProvider } from '../../src/lib/kv';
import { KEYS, type KV, memoryKV } from '../../src/lib/store';

const m = defineMessages({ hi: 'Hello {name}' }, { hi: 'Xin chào {name}' });

function wrap(kv: KV) {
  return ({ children }: { children: ReactNode }) => (
    <KVProvider kv={kv}>
      <LangProvider>{children}</LangProvider>
    </KVProvider>
  );
}

function Greeting() {
  const t = useT(m);
  return <p>{t('hi', { name: 'An' })}</p>;
}

/** happy-dom defines `languages` on the Navigator prototype; an own property shadows it until deleted. */
function stubLanguages(list: string[]) {
  Object.defineProperty(navigator, 'languages', { configurable: true, get: () => list });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'languages');
  document.documentElement.lang = 'en';
});

describe('LangProvider', () => {
  it('renders English first, then the stored language, and updates <html lang>', async () => {
    const kv = memoryKV();
    kv.set(KEYS.lang, 'vi');
    render(<Greeting />, { wrapper: wrap(kv) });
    await waitFor(() => expect(screen.getByText('Xin chào An')).toBeTruthy());
    expect(document.documentElement.lang).toBe('vi');
  });

  it('follows the browser language when nothing is stored', async () => {
    stubLanguages(['vi-VN', 'en']);
    render(<Greeting />, { wrapper: wrap(memoryKV()) });
    await waitFor(() => expect(screen.getByText('Xin chào An')).toBeTruthy());
  });

  it('ignores a garbage stored language', async () => {
    stubLanguages(['en-US']);
    const kv = memoryKV();
    kv.set(KEYS.lang, '<b>fr</b>');
    const { result } = renderHook(() => useLang(), { wrapper: wrap(kv) });
    await waitFor(() => expect(result.current.lang).toBe('en'));
  });

  it('remembers a chosen language', async () => {
    const kv = memoryKV();
    const { result } = renderHook(() => useLang(), { wrapper: wrap(kv) });
    act(() => result.current.setLang('vi'));
    expect(result.current.lang).toBe('vi');
    expect(kv.get(KEYS.lang)).toBe('vi');
    await waitFor(() => expect(document.documentElement.lang).toBe('vi'));
  });

  it('throws a clear error outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useLang())).toThrow(/LangProvider/);
  });
});
```

`apps/web/test/unit/theme.test.tsx`:

(Task 9 Step 1 thay toàn bộ file này; test Review Focus 2 là `a stored garbage theme falls back to night`.)

Run: `npm test -w apps/web -- lang theme`
Expected: FAIL (`Cannot find module '../../src/i18n/provider'`).

- [ ] **Step 5: Viết `kv.tsx`, `LangProvider`, theme và `ui.messages.ts`**

`apps/web/src/lib/kv.tsx`:

```tsx
'use client';

import { createContext, type ReactNode, use, useState } from 'react';
import { type KV, safeKV } from './store';

const KVContext = createContext<KV | null>(null);

/** localStorage behind safeKV; while prerendering there is no window, so it is memory only. */
export function KVProvider({ kv, children }: { kv?: KV; children: ReactNode }) {
  const [value] = useState<KV>(() => kv ?? safeKV(() => window.localStorage));
  return <KVContext value={value}>{children}</KVContext>;
}

export function useKV(): KV {
  const kv = use(KVContext);
  if (!kv) throw new Error('useKV must be used inside <KVProvider>');
  return kv;
}
```

`apps/web/src/i18n/provider.tsx`:

```tsx
'use client';

import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react';
import { useKV } from '@/lib/kv';
import { KEYS } from '@/lib/store';
import { detectLang, type Lang, type Messages, type Params, translate } from './core';

interface LangValue {
  lang: Lang;
  setLang(l: Lang): void;
}

const LangContext = createContext<LangValue | null>(null);

/**
 * Quyết định 15: the static HTML is English. After mount the stored choice, or else the browser language, wins.
 */
export function LangProvider({ children }: { children: ReactNode }) {
  const kv = useKV();
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    setLangState(detectLang(kv.get(KEYS.lang), navigator.languages ?? []));
  }, [kv]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback(
    (l: Lang) => {
      kv.set(KEYS.lang, l);
      setLangState(l);
    },
    [kv],
  );

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangContext value={value}>{children}</LangContext>;
}

export function useLang(): LangValue {
  const v = use(LangContext);
  if (!v) throw new Error('useLang must be used inside <LangProvider>');
  return v;
}

export function useT<K extends string>(m: Messages<K>): (key: K, params?: Params) => string {
  const { lang } = useLang();
  return useCallback((key: K, params?: Params) => translate(m, lang, key, params), [m, lang]);
}
```

`apps/web/src/theme/theme.ts`:

(Task 9 Step 2 thay toàn bộ file này: night mặc định, `THEME_CHOICES = ['dark', 'light', 'system']`, `DEFAULT_THEME = 'dark'`, giá trị rác là night.)

`apps/web/src/theme/provider.tsx`:

(Task 9 Step 2 thay toàn bộ file này: lúc prerender `choice` là `DEFAULT_THEME`, tức night, không còn là `system`.)

`apps/web/src/messages/ui.messages.ts` (chuỗi của primitive, khung và motion; Task 6–9 dùng):

```ts
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    skip: 'Skip to content',
    home: 'Atropyle home',
    menu: 'Menu',
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    language: 'Language',
    langEn: 'English',
    langVi: 'Tiếng Việt',
    holdHint: 'Hold to confirm, or press Enter',
    holdKeep: 'Keep holding',
    holdDone: 'Confirmed',
    copyAddress: 'Copy address',
    copyText: 'Copy {what}',
    viewOn: 'View on {name}',
    newTab: '(opens in a new tab)',
    inTime: 'in {time}',
    timeAgo: '{time} ago',
    rawAmount: '{raw} base units',
    qrOf: 'QR code for {what}',
    threadOf: 'Vault thread: {state}',
    untrustedTitle: 'Text from a token contract. Anyone can write anything there.',
    hapticsOn: 'Vibrate on check-in',
    footerSource: 'Source code',
    footerXLayer: 'Built on X Layer',
    footerLicense: 'MIT licence',
    footerPrivacy: 'Privacy',
    footerVersion: 'Version {version}',
    onchainBadge: '100% on-chain',
  },
  {
    skip: 'Tới nội dung chính',
    home: 'Trang chủ Atropyle',
    menu: 'Menu',
    theme: 'Giao diện',
    themeSystem: 'Theo hệ thống',
    themeLight: 'Sáng',
    themeDark: 'Tối',
    language: 'Ngôn ngữ',
    langEn: 'English',
    langVi: 'Tiếng Việt',
    holdHint: 'Nhấn giữ để xác nhận, hoặc bấm Enter',
    holdKeep: 'Giữ thêm chút nữa',
    holdDone: 'Đã xác nhận',
    copyAddress: 'Sao chép địa chỉ',
    copyText: 'Sao chép {what}',
    viewOn: 'Xem trên {name}',
    newTab: '(mở tab mới)',
    inTime: 'sau {time}',
    timeAgo: '{time} trước',
    rawAmount: '{raw} đơn vị gốc',
    qrOf: 'Mã QR của {what}',
    threadOf: 'Sợi chỉ của vault: {state}',
    untrustedTitle: 'Chữ lấy từ contract token. Ai cũng có thể ghi bất cứ gì vào đó.',
    hapticsOn: 'Rung khi điểm danh',
    footerSource: 'Mã nguồn',
    footerXLayer: 'Chạy trên X Layer',
    footerLicense: 'Giấy phép MIT',
    footerPrivacy: 'Quyền riêng tư',
    footerVersion: 'Phiên bản {version}',
    onchainBadge: '100% on-chain',
  },
);
```

- [ ] **Step 6: Chạy test, typecheck và Biome**

```bash
npm test -w apps/web
npm run typecheck -w apps/web
npx biome ci .
```

Expected: PASS (lang 5, theme 5, store 7, sdk-copies 6, links 3, address 4, i18n 5, format 6, cộng test của Task 2–4).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/i18n apps/web/src/lib apps/web/src/theme/theme.ts apps/web/src/theme/provider.tsx apps/web/src/messages apps/web/test/helpers/render.tsx apps/web/test/unit/i18n.test.ts apps/web/test/unit/format.test.ts apps/web/test/unit/store.test.ts apps/web/test/unit/sdk-copies.test.ts apps/web/test/unit/links.test.ts apps/web/test/unit/address.test.ts apps/web/test/unit/lang.test.tsx apps/web/test/unit/theme.test.tsx
git commit -m "feat(web): i18n, storage, theme and shared helpers for the Next app" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Motion — token, provider, View Transitions, rung và `HoldButton`

**Files:**
- Create: `apps/web/src/motion/tokens.ts`, `apps/web/src/motion/features.ts`, `apps/web/src/motion/provider.tsx`, `apps/web/src/motion/view-transition.tsx`, `apps/web/src/motion/haptics.ts`, `apps/web/src/motion/use-hold.ts`, `apps/web/src/ui/hold-button.tsx`
- Test: `apps/web/test/unit/motion-tokens.test.ts`, `apps/web/test/unit/motion.test.tsx`, `apps/web/test/unit/hold-button.test.tsx`
- Modify: `apps/web/test/setup.ts`, `apps/web/package.json`, `package-lock.json`

**Interfaces:**
- Consumes: Task 3 (`--ease-spring` trong `globals.css`, lớp `bg-thread`, `bg-danger`, `border-line-strong`), Task 5 (`useKV`, `KEYS.haptics`, `useT`, `ui.messages`, `cn`).
- Produces:
  - `src/motion/tokens.ts`: `DURATION = { instant: 90, quick: 160, base: 240, slow: 420, story: 720 }`; `type DurationName`; `sec(ms: number): number`; `EASE_OUT_EXPO`, `EASE_IN_OUT_SINE` (bộ 4 số); `SPRING = { type: 'spring', stiffness: 380, damping: 32, mass: 1 }`; `SPRING_MS = 443`; `HOLD_MS = 600`; `REDUCED_MS = 120`; `springAt(t: number): number`; `springStops(samples?: number): number[]`.
  - `src/motion/provider.tsx`: `MotionProvider({ children })` (`MotionConfig reducedMotion="user"` + `LazyMotion strict` nạp `domMax` lười); `usePrefersReducedMotion(): boolean` (false lúc prerender và hydrate).
  - `src/motion/view-transition.tsx`: `THREAD_VT_NAME = 'atropyle-thread'`; `SharedThread({ children })` (bọc `<ViewTransition name>` của React 19.3); `withViewTransition(update: () => void): void` (crossfade toàn trang, bỏ qua khi trình duyệt không hỗ trợ hoặc reduced motion).
  - `src/motion/haptics.ts`: `canVibrate(): boolean`; `useHaptics(): { supported: boolean; enabled: boolean; setEnabled(on: boolean): void; pulse(): void }` (12 ms, tắt được, lưu ở `KEYS.haptics`).
  - `src/motion/use-hold.ts`: `type HoldPhase = 'idle' | 'holding' | 'done'`; `interface HoldOptions { duration?: number; disabled?: boolean; onConfirm(): void; onCancel?(progress: number): void }`; `useHold(o: HoldOptions): { phase: HoldPhase; bind: HoldBind }`.
  - `src/ui/hold-button.tsx`: `interface HoldButtonProps` (thuộc tính `<button>` trừ `onClick`, cộng `onConfirm(): void`, `children: ReactNode`, `icon?: ReactNode`, `tone?: 'thread' | 'danger'`, `size?: 'md' | 'lg'`, `duration?: number`, `hint?: string`); `HoldButton(props)`.
  - `test/setup.ts` đặt `MotionGlobalConfig.skipAnimations = true`.

- [ ] **Step 1: Cài `motion`**

```bash
npm install -E -w apps/web motion@14.14.0
npm run lockfile:check -- --fix
npm run lockfile:check
```

Expected: `every dependency resolves.`

Sửa `apps/web/test/setup.ts`:

```ts
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach } from 'vitest';

// Animations finish instantly in unit tests; timing is tested through timers, never through frames.
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 2: Viết test hỏng cho token và spring**

`apps/web/test/unit/motion-tokens.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DURATION, HOLD_MS, SPRING, SPRING_MS, springAt, springStops } from '../../src/motion/tokens';

const css = readFileSync(fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)), 'utf8');

describe('motion tokens (spec §4.4)', () => {
  it('has the five durations, the spring and the 600 ms hold', () => {
    expect(DURATION).toEqual({ instant: 90, quick: 160, base: 240, slow: 420, story: 720 });
    expect(SPRING).toMatchObject({ stiffness: 380, damping: 32, mass: 1 });
    expect(HOLD_MS).toBe(600);
  });

  it('springAt is the closed form of the spring: starts at rest, overshoots about 1 %, settles at 1', () => {
    expect(springAt(0)).toBe(0);
    const peak = Math.max(...Array.from({ length: 500 }, (_, i) => springAt(i / 1000)));
    expect(peak).toBeGreaterThan(1.01);
    expect(peak).toBeLessThan(1.012);
    expect(Math.abs(springAt(SPRING_MS / 1000) - 1)).toBeLessThan(0.0015);
    expect(Math.abs(springAt(2) - 1)).toBeLessThan(1e-9);
  });

  it('the CSS --ease-spring stops are the spring sampled 25 times over 443 ms (Quyết định 11)', () => {
    const m = /--ease-spring:\s*linear\(([^)]*)\)/.exec(css);
    expect(m).not.toBeNull();
    const stops = (m?.[1] ?? '').split(',').map((s) => Number(s.trim()));
    expect(stops).toEqual(springStops());
    for (let i = 0; i < 24; i++) {
      expect(Math.abs(stops[i] - springAt((i * SPRING_MS) / 1000 / 24)), `stop ${i}`).toBeLessThan(0.0006);
    }
    expect(stops[24]).toBe(1);
  });
});
```

Run: `npm test -w apps/web -- motion-tokens`
Expected: FAIL (`Cannot find module '../../src/motion/tokens'`).

- [ ] **Step 3: Viết `tokens.ts`**

`apps/web/src/motion/tokens.ts`:

```ts
/** Motion tokens (spec §4.4). Durations are milliseconds; motion takes seconds, hence `sec`. */
export const DURATION = { instant: 90, quick: 160, base: 240, slow: 420, story: 720 } as const;
export type DurationName = keyof typeof DURATION;

export const sec = (ms: number): number => ms / 1000;

/** `out-expo` for things that appear, `in-out-sine` for breathing (globals.css has the same curves). */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_IN_OUT_SINE = [0.37, 0, 0.63, 1] as const;

/** The default spring. globals.css `--ease-spring` is the same curve for CSS (Quyết định 11). */
export const SPRING = { type: 'spring', stiffness: 380, damping: 32, mass: 1 } as const;
/** Where the CSS approximation of SPRING ends: |x − 1| < 0.0015 from here on. */
export const SPRING_MS = 443;
/** The check-in ritual: hold 600 ms (spec §4.6). */
export const HOLD_MS = 600;
/** Under prefers-reduced-motion every transition becomes a crossfade of this length (spec §4.4). */
export const REDUCED_MS = 120;

/** Position of SPRING released from rest at 0 towards 1, `t` in seconds (underdamped closed form). */
export function springAt(t: number): number {
  const { stiffness: k, damping: c, mass: m } = SPRING;
  const wn = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  const wd = wn * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * wn * t) * (Math.cos(wd * t) + ((zeta * wn) / wd) * Math.sin(wd * t));
}

/** The stops of CSS `linear()`: `samples` points over SPRING_MS, four decimals, the last pinned to 1. */
export function springStops(samples = 25): number[] {
  return Array.from({ length: samples }, (_, i) =>
    i === samples - 1 ? 1 : Math.round(springAt((i * SPRING_MS) / 1000 / (samples - 1)) * 1e4) / 1e4,
  );
}
```

Run: `npm test -w apps/web -- motion-tokens`
Expected: PASS (3 test).

- [ ] **Step 4: Viết test hỏng cho provider, View Transitions và rung**

`apps/web/test/unit/motion.test.tsx`:

```tsx
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { KVProvider } from '../../src/lib/kv';
import { KEYS, type KV, memoryKV } from '../../src/lib/store';
import { useHaptics } from '../../src/motion/haptics';
import { MotionProvider, usePrefersReducedMotion } from '../../src/motion/provider';
import { withViewTransition } from '../../src/motion/view-transition';

function stubReduced(reduce: boolean) {
  const mql = { matches: reduce, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) => ({ ...mql, matches: q.includes('reduce') ? reduce : false }) as unknown as MediaQueryList,
  );
}

type StartVT = (cb: () => void) => unknown;
function stubViewTransitions(): Mock<StartVT> {
  const start = vi.fn<StartVT>((cb) => {
    cb();
    return {};
  });
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: start });
  return start;
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'startViewTransition');
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('MotionProvider', () => {
  it('renders its children', () => {
    render(
      <MotionProvider>
        <p>inside</p>
      </MotionProvider>,
    );
    expect(screen.getByText('inside')).toBeTruthy();
  });

  it('reports the reduced motion preference after mount', () => {
    stubReduced(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });
});

describe('withViewTransition', () => {
  it('runs the update directly when the browser has no View Transitions', () => {
    const update = vi.fn();
    withViewTransition(update);
    expect(update).toHaveBeenCalledOnce();
  });

  it('runs the update inside a view transition when motion is allowed', () => {
    stubReduced(false);
    const start = stubViewTransitions();
    const update = vi.fn();
    withViewTransition(update);
    expect(start).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it('skips the transition under reduced motion', () => {
    stubReduced(true);
    const start = stubViewTransitions();
    const update = vi.fn();
    withViewTransition(update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
  });
});

describe('useHaptics', () => {
  function wrap(kv: KV) {
    return ({ children }: { children: ReactNode }) => <KVProvider kv={kv}>{children}</KVProvider>;
  }

  it('vibrates 12 ms when supported and enabled, and can be turned off', () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
    const kv = memoryKV();
    const { result } = renderHook(() => useHaptics(), { wrapper: wrap(kv) });
    expect(result.current.supported).toBe(true);
    act(() => result.current.pulse());
    expect(vibrate).toHaveBeenCalledWith(12);
    act(() => result.current.setEnabled(false));
    expect(kv.get(KEYS.haptics)).toBe('0');
    act(() => result.current.pulse());
    expect(vibrate).toHaveBeenCalledOnce();
  });

  it('does nothing on a device without vibration', () => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });
    const { result } = renderHook(() => useHaptics(), { wrapper: wrap(memoryKV()) });
    expect(result.current.supported).toBe(false);
    expect(() => result.current.pulse()).not.toThrow();
  });

  it('remembers that vibration was turned off', () => {
    const kv = memoryKV();
    kv.set(KEYS.haptics, '0');
    const { result } = renderHook(() => useHaptics(), { wrapper: wrap(kv) });
    expect(result.current.enabled).toBe(false);
  });
});
```

Run: `npm test -w apps/web -- motion.test`
Expected: FAIL (`Cannot find module '../../src/motion/haptics'`).

- [ ] **Step 5: Viết features, provider, View Transitions và rung**

`apps/web/src/motion/features.ts`:

```ts
// Loaded with import() by MotionProvider, so the animation engine never sits in the first-load bundle.
export { domMax as default } from 'motion/react';
```

`apps/web/src/motion/provider.tsx`:

```tsx
'use client';

import { LazyMotion, MotionConfig } from 'motion/react';
import { type ReactNode, useSyncExternalStore } from 'react';
import { SPRING } from './tokens';

const loadFeatures = () => import('./features').then((r) => r.default);

/**
 * `reducedMotion="user"`: motion drops transform and layout animations for users who ask for less motion, and
 * keeps opacity. `strict` throws on a `motion.*` component, so every animated element is an `m.*` and the engine
 * stays lazy.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={SPRING}>
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}

const REDUCE = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(REDUCE);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

function read(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(REDUCE).matches;
}

/** False while prerendering and hydrating (no mismatch), then the live preference. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
```

`apps/web/src/motion/view-transition.tsx`:

```tsx
'use client';

import { type ReactNode, ViewTransition } from 'react';
import { flushSync } from 'react-dom';

/** One element per page carries this name; globals.css gives its group the spring (spec §4.1 "shared element"). */
export const THREAD_VT_NAME = 'atropyle-thread';

/** Wrap the page's main Thread: it morphs from one route to the next instead of cutting. */
export function SharedThread({ children }: { children: ReactNode }) {
  return <ViewTransition name={THREAD_VT_NAME}>{children}</ViewTransition>;
}

type StartViewTransition = (update: () => void) => unknown;

/**
 * A whole-page crossfade around a synchronous DOM update (the theme switch). Without the API, or when the user
 * prefers reduced motion, the update simply runs.
 */
export function withViewTransition(update: () => void): void {
  const start = (document as { startViewTransition?: StartViewTransition }).startViewTransition;
  const reduce =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof start !== 'function' || reduce) {
    update();
    return;
  }
  start.call(document, () => flushSync(update));
}
```

`apps/web/src/motion/haptics.ts`:

```ts
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useKV } from '@/lib/kv';
import { KEYS } from '@/lib/store';

const PULSE_MS = 12;

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** A 12 ms pulse on check-in and after signing (spec §4.4), on devices that can, unless turned off. */
export function useHaptics(): { supported: boolean; enabled: boolean; setEnabled(on: boolean): void; pulse(): void } {
  const kv = useKV();
  const [enabled, setEnabledState] = useState(true);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setEnabledState(kv.get(KEYS.haptics) !== '0');
    setSupported(canVibrate());
  }, [kv]);

  const setEnabled = useCallback(
    (on: boolean) => {
      kv.set(KEYS.haptics, on ? '1' : '0');
      setEnabledState(on);
    },
    [kv],
  );

  // Read at the moment of the pulse: the setting may have changed in another component (the settings menu).
  const pulse = useCallback(() => {
    if (kv.get(KEYS.haptics) !== '0' && canVibrate()) navigator.vibrate(PULSE_MS);
  }, [kv]);

  return useMemo(() => ({ supported, enabled, setEnabled, pulse }), [supported, enabled, setEnabled, pulse]);
}
```

Run: `npm test -w apps/web -- motion.test`
Expected: PASS (8 test).

- [ ] **Step 6: Viết test hỏng cho `HoldButton`**

`apps/web/test/unit/hold-button.test.tsx`:

```tsx
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoldButton } from '../../src/ui/hold-button';
import { renderWithProviders } from '../helpers/render';

function setup(props: { disabled?: boolean } = {}) {
  const onConfirm = vi.fn();
  renderWithProviders(
    <HoldButton onConfirm={onConfirm} disabled={props.disabled}>
      Check in
    </HoldButton>,
  );
  return { onConfirm, button: screen.getByRole('button', { name: 'Check in' }) };
}

const press = (el: HTMLElement) => fireEvent.pointerDown(el, { button: 0 });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('HoldButton', () => {
  it('confirms once after a 600 ms hold', () => {
    const { onConfirm, button } = setup();
    press(button);
    expect(button.getAttribute('data-phase')).toBe('holding');
    act(() => vi.advanceTimersByTime(599));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(button.getAttribute('data-phase')).toBe('done');
    fireEvent.pointerUp(button);
    act(() => vi.advanceTimersByTime(2000));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(button.getAttribute('data-phase')).toBe('idle');
  });

  it('cancels when released early and says to keep holding', () => {
    const { onConfirm, button } = setup();
    press(button);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerUp(button);
    expect(button.getAttribute('data-phase')).toBe('idle');
    expect(screen.getByText('Keep holding')).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Hold to confirm, or press Enter')).toBeTruthy();
  });

  it('cancels when the pointer leaves or the browser takes it over', () => {
    const { onConfirm, button } = setup();
    press(button);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerLeave(button);
    press(button);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerCancel(button);
    act(() => vi.advanceTimersByTime(1000));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ignores the right mouse button, a plain mouse click, and the long-press menu', () => {
    const { onConfirm, button } = setup();
    fireEvent.pointerDown(button, { button: 2 });
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(button, { detail: 1 });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(fireEvent.contextMenu(button)).toBe(false);
  });

  it('HoldButton keyboard and assistive activation', () => {
    const { onConfirm, button } = setup();
    // Enter confirms at once (spec §4.6) and only once, even when pressed again or auto-repeated.
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(button, { key: 'Enter', repeat: true });
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(2000));

    // Space is a hold: released early it cancels, and the click the browser sends after it does not confirm.
    fireEvent.keyDown(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.keyUp(button, { key: ' ' });
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(2000));

    // Held for 600 ms it confirms.
    fireEvent.keyDown(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(600));
    expect(onConfirm).toHaveBeenCalledTimes(2);
    fireEvent.keyUp(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(2000));

    // A click with detail 0 comes from assistive technology (screen reader, switch access): it confirms.
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).toHaveBeenCalledTimes(3);
  });

  it('does nothing while disabled, and a hold in progress stops when it becomes disabled', () => {
    const onConfirm = vi.fn();
    const { rerender } = renderWithProviders(<HoldButton onConfirm={onConfirm}>Release</HoldButton>);
    const button = screen.getByRole('button', { name: 'Release' });
    press(button);
    act(() => vi.advanceTimersByTime(300));
    rerender(
      <HoldButton onConfirm={onConfirm} disabled>
        Release
      </HoldButton>,
    );
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('describes how to use it', () => {
    const { button } = setup();
    const id = button.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id ?? '')?.textContent).toBe('Hold to confirm, or press Enter');
  });
});
```


Run: `npm test -w apps/web -- hold-button`
Expected: FAIL (`Cannot find module '../../src/ui/hold-button'`).

- [ ] **Step 7: Viết `useHold` và `HoldButton`**

`apps/web/src/motion/use-hold.ts`:

```ts
'use client';

import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { HOLD_MS } from './tokens';

export type HoldPhase = 'idle' | 'holding' | 'done';

export interface HoldOptions {
  duration?: number;
  disabled?: boolean;
  onConfirm(): void;
  /** Released early; `progress` is the share of the hold that was done (0–1). */
  onCancel?(progress: number): void;
}

export interface HoldBind {
  onPointerDown(e: PointerEvent<HTMLElement>): void;
  onPointerUp(): void;
  onPointerLeave(): void;
  onPointerCancel(): void;
  onKeyDown(e: KeyboardEvent<HTMLElement>): void;
  onKeyUp(e: KeyboardEvent<HTMLElement>): void;
  onClick(e: MouseEvent<HTMLElement>): void;
  onContextMenu(e: MouseEvent<HTMLElement>): void;
  onBlur(): void;
}

type Timer = { current: ReturnType<typeof setTimeout> | null };

function stop(t: Timer): void {
  if (t.current !== null) clearTimeout(t.current);
  t.current = null;
}

/** After a confirmation the control rests this long before it accepts another. */
const SETTLE_MS = 900;
/** A click this soon after a key we handled is the browser's own activation of that key, not a new action. */
const KEY_CLICK_MS = 250;

/**
 * Quyết định 20. Pointer: hold `duration` ms to confirm; release, leave or cancel before that and it is cancelled.
 * Enter confirms at once. Space is a hold. A click with `detail === 0` comes from assistive technology and
 * confirms; a mouse click (detail ≥ 1) does nothing. The timer, not the animation, decides.
 */
export function useHold({ duration = HOLD_MS, disabled = false, onConfirm, onCancel }: HoldOptions): {
  phase: HoldPhase;
  bind: HoldBind;
} {
  const [phase, setPhase] = useState<HoldPhase>('idle');
  const hold: Timer = useRef(null);
  const settle: Timer = useRef(null);
  const startedAt = useRef(0);
  const settling = useRef(false);
  const keyAt = useRef(-Infinity);
  const latest = useRef({ onConfirm, onCancel });

  useEffect(() => {
    latest.current = { onConfirm, onCancel };
  });

  const confirm = useCallback(() => {
    if (settling.current) return;
    stop(hold);
    settling.current = true;
    setPhase('done');
    latest.current.onConfirm();
    stop(settle);
    settle.current = setTimeout(() => {
      settling.current = false;
      setPhase('idle');
    }, SETTLE_MS);
  }, []);

  const start = useCallback(() => {
    if (disabled || settling.current || hold.current !== null) return;
    startedAt.current = Date.now();
    setPhase('holding');
    hold.current = setTimeout(confirm, duration);
  }, [disabled, duration, confirm]);

  const cancel = useCallback(() => {
    if (hold.current === null) return;
    stop(hold);
    setPhase('idle');
    latest.current.onCancel?.(Math.min(1, (Date.now() - startedAt.current) / duration));
  }, [duration]);

  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);

  useEffect(
    () => () => {
      stop(hold);
      stop(settle);
    },
    [],
  );

  const bind = useMemo<HoldBind>(
    () => ({
      onPointerDown: (e) => {
        if (e.button === 0) start();
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onKeyDown: (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          keyAt.current = Date.now();
          if (!e.repeat && !disabled) confirm();
        } else if (e.key === ' ') {
          e.preventDefault();
          keyAt.current = Date.now();
          if (!e.repeat) start();
        }
      },
      onKeyUp: (e) => {
        if (e.key !== ' ') return;
        e.preventDefault();
        keyAt.current = Date.now();
        cancel();
      },
      onClick: (e) => {
        if (e.detail !== 0 || disabled || Date.now() - keyAt.current < KEY_CLICK_MS) return;
        confirm();
      },
      onContextMenu: (e) => {
        e.preventDefault();
      },
      onBlur: cancel,
    }),
    [start, cancel, confirm, disabled],
  );

  return { phase, bind };
}
```

`apps/web/src/ui/hold-button.tsx`:

```tsx
'use client';

import { m, useAnimate } from 'motion/react';
import { type ButtonHTMLAttributes, type ReactNode, useCallback, useEffect, useId, useState } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as ui } from '@/messages/ui.messages';
import { usePrefersReducedMotion } from '@/motion/provider';
import { DURATION, EASE_OUT_EXPO, HOLD_MS, SPRING, sec } from '@/motion/tokens';
import { useHold } from '@/motion/use-hold';

export interface HoldButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'type'> {
  onConfirm(): void;
  children: ReactNode;
  icon?: ReactNode;
  /** `danger` for actions that cannot be undone. */
  tone?: 'thread' | 'danger';
  size?: 'md' | 'lg';
  duration?: number;
  /** Replaces the default "Hold to confirm, or press Enter". */
  hint?: string;
}

const SIZE = {
  md: 'h-12 px-6 text-body gap-2',
  lg: 'h-16 px-10 text-lead gap-3',
} as const;

const TONE = {
  thread: { fill: 'bg-thread/15', line: 'bg-thread', knot: 'bg-thread', hover: 'hover:border-thread' },
  danger: { fill: 'bg-danger/15', line: 'bg-danger', knot: 'bg-danger', hover: 'hover:border-danger' },
} as const;

/**
 * The check-in ritual (spec §4.6): hold to tie a knot on the thread. A thread runs under the label and tightens
 * while held; on release before the end it slackens and the button shakes once; on confirmation a knot snaps in.
 * Under reduced motion the fill fades in place of growing, and nothing shakes.
 */
export function HoldButton({
  onConfirm,
  children,
  icon,
  tone = 'thread',
  size = 'lg',
  duration = HOLD_MS,
  hint,
  disabled,
  className,
  ...rest
}: HoldButtonProps) {
  const t = useT(ui);
  const hintId = useId();
  const calm = usePrefersReducedMotion();
  const [scope, animate] = useAnimate<HTMLButtonElement>();
  const [nudges, setNudges] = useState(0);
  const [keep, setKeep] = useState(false);

  const onCancel = useCallback(() => {
    setNudges((n) => n + 1);
    if (!calm && scope.current) {
      animate(scope.current, { x: [0, -5, 5, -3, 3, 0] }, { duration: sec(DURATION.slow), ease: 'easeOut' });
    }
  }, [calm, animate, scope]);

  const { phase, bind } = useHold({ duration, disabled, onConfirm, onCancel });

  useEffect(() => {
    if (nudges === 0) return;
    setKeep(true);
    const id = setTimeout(() => setKeep(false), 1400);
    return () => clearTimeout(id);
  }, [nudges]);

  const on = phase !== 'idle';
  const grow =
    phase === 'holding'
      ? { duration: sec(duration), ease: 'linear' as const }
      : { duration: sec(DURATION.quick), ease: EASE_OUT_EXPO };
  const fill = calm ? { opacity: on ? 1 : 0 } : { scaleX: on ? 1 : 0 };
  const c = TONE[tone];

  return (
    <span className="inline-flex flex-col items-center gap-2">
      <button
        {...rest}
        {...bind}
        ref={scope}
        type="button"
        disabled={disabled}
        aria-describedby={hintId}
        data-phase={phase}
        className={cn(
          'relative isolate inline-flex select-none items-center justify-center overflow-hidden rounded-full',
          'touch-manipulation border border-line-strong bg-surface-2 font-medium text-ink',
          'transition-[border-color,background-color] duration-150 ease-out-expo',
          'disabled:cursor-not-allowed disabled:opacity-50',
          !disabled && c.hover,
          SIZE[size],
          className,
        )}
      >
        <m.span
          aria-hidden
          className={cn('-z-10 absolute inset-0 origin-left', c.fill)}
          initial={false}
          animate={fill}
          transition={grow}
        />
        {icon ? <span className="inline-flex shrink-0">{icon}</span> : null}
        <span>{children}</span>
        <span aria-hidden className="absolute inset-x-8 bottom-2.5 h-px bg-line" />
        <m.span
          aria-hidden
          className={cn('absolute inset-x-8 bottom-2.5 h-0.5 origin-left rounded-full', c.line)}
          initial={false}
          animate={fill}
          transition={grow}
        />
        <m.span
          aria-hidden
          className={cn('absolute right-7 bottom-1.5 size-2.5 rounded-full', c.knot)}
          initial={false}
          animate={phase === 'done' ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={phase === 'done' ? SPRING : { duration: sec(DURATION.base), ease: EASE_OUT_EXPO }}
        />
      </button>
      <span id={hintId} aria-live="polite" className="text-caption text-ink-muted">
        {phase === 'done' ? t('holdDone') : keep ? t('holdKeep') : (hint ?? t('holdHint'))}
      </span>
    </span>
  );
}
```

Câu chữ dưới nút có ba trạng thái: gợi ý (mặc định), "Keep holding" khi nhả sớm (1,4 s), "Confirmed" lúc xác nhận. Test "describes how to use it" đọc trạng thái mặc định.

- [ ] **Step 8: Chạy test**

Run: `npm test -w apps/web -- hold-button motion`
Expected: PASS (hold-button 7, motion 8, motion-tokens 3).

- [ ] **Step 9: Kiểm toàn app và commit**

```bash
npm test -w apps/web
npm run typecheck -w apps/web
npx biome ci .
git add apps/web/src/motion apps/web/src/ui/hold-button.tsx apps/web/test/setup.ts apps/web/test/unit/motion-tokens.test.ts apps/web/test/unit/motion.test.tsx apps/web/test/unit/hold-button.test.tsx apps/web/package.json package-lock.json
git commit -m "feat(web): motion tokens, lazy motion provider, view transitions, haptics and the HoldButton" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Sợi chỉ (`Thread`) trên compositor, có trục thời gian, glyph trạng thái và `StateBadge`

> Các khối mã của task này là bản lúc giao. 56c3479 (review Task 7) đổi `move.ts` (mới), `reveal-window.tsx` và `geometry.ts`; 5151279 và 2d9ff4c sửa tiếp `thread.tsx` và `move.ts`. Khi hai bên khác nhau, mã trên đĩa và mục "Interfaces for Plan 7B" là đúng.

Nhân vật duy nhất của ngôn ngữ hình ảnh (spec §4.1), dựng theo `thread-engine` của spec §18.4.1 và hai ruling R18.4 (chỉ chuyển động trên compositor), R18.5 (trục thời gian tuyến tính). Hình học là hàm thuần có test; component chỉ vẽ. Không đo path bằng DOM (`getPointAtLength` không có lúc prerender): sợi chỉ là đường sóng `y = 60 + 9·sin(3π·x/600)` lấy mẫu rồi nối bằng Catmull-Rom, nên vị trí nút, điểm "bây giờ" và cổng tính được chính xác. Có hai chế độ. Không có `axis`, phần sáng là `remaining` của chu kỳ hiện tại, như trước (các trang chưa có trục và `StateBadge` dùng). Có `axis`, mọi mốc nằm ở `courseX(t, axis)`, tuyến tính theo thời gian chain, để `Scrubber`, bản xem trước, header, lá thư và witness của Plan 7B/7C đặt được thumb, chip mốc và đường dự đoán. Không có path nào được animate: phần sáng là một path cố định, chỉ cửa sổ `RevealWindow` bên ngoài nó dịch bằng `transform`.

**Bốn lớp trong một gốc** (`div[data-thread]`, `relative`, `overflow: clip`):

- Gốc mang màu của trạng thái (`THREAD_COLOR`), mọi lớp vẽ bằng `currentColor`. Mặc định tỉ lệ 5:1 (`aspect-[5/1]`); chỗ gọi đặt chiều rộng, và đặt chiều cao khi muốn tỉ lệ khác (ví dụ `h-20 w-full`). Có `label` thì gốc là `role="img"`; không có thì gốc là `aria-hidden="true"`. `shared` bọc gốc bằng `SharedThread`. Gốc có `pointer-events-none`, để sợi chỉ nằm dưới thanh kéo (7B T5) mà không chặn thao tác.
- (a) `svg[data-layer="base"]` với `preserveAspectRatio="none"`: track, đường đi của các sợi sờn (`fiber-course`), ghost, nhánh và curl.
- (b) `RevealWindow` (file mới `src/motion/reveal-window.tsx`): cửa sổ `[litFrom, litTo]` tính theo % chiều rộng, bên trong là quầng (c) và `svg[data-layer="lit"]` (path `lit` cùng các sợi sờn sáng). Đổi `remaining` hay `axis.now` chỉ đổi ba `translateX` của cửa sổ, không đổi `d` nào. Ref `setRange(from, to, move?)` dịch cửa sổ mà không render React (kéo từng khung ở 7B T5, nạp lại tuyến tính khi giữ ở 7B T10). Transition `transform` theo `--ease-spring` 443 ms, chỉ dưới `motion-safe`. Cửa sổ có ba hộp lồng nhau: hộp ngoài cắt mép trái, hộp giữa cắt mép phải, hộp trong dịch ngược lại để nội dung đứng yên. Với cửa sổ `[a, b]` (%), ba `translateX` là `a %`, `(b − 100 − a) %` và `(100 − b) %`, cộng lại bằng 0. Câu "ngoài dịch, trong dịch ngược" của spec §18.4.1 vì vậy được làm bằng ba hộp lồng nhau (ngoài, giữa, trong), không phải hai: một hộp `overflow: hidden` chỉ cắt được một mép.
- (c) Quầng sáng là một `<svg data-layer="glow">` gốc riêng (chỉ ở `active`). Nhịp chỉ animate `opacity` của chính `<svg>` đó, với `data-beat`: `slow` khi còn trên 50 % (2,4 s), `mid` từ 10 tới 50 % (1,6 s), `fast` dưới 10 % (1,0 s). Cả ba dùng keyframe `thread-pulse`. Rung của `grace` nằm ở `<svg data-layer="lit">` gốc.
- (d) Lớp HTML `div[data-layer="marks"]`: cổng (`span[data-part="gate"]`, là chỗ trống cho cột giám hộ của 7B T6, bên trong có vòm `span[data-part="arch"]`), các nút, các chấm cuối nhánh, đặt bằng `left`/`top` theo %. Điểm "bây giờ", quầng `radial-gradient` của nó và nút đang chờ (`pendingKnot`) nằm trong một `span[data-part="now-at"]` phủ cả gốc, dịch bằng `translate(x%, y%)` với cùng transition của cửa sổ. Nhờ vậy chấm đi cùng mép cửa sổ trên compositor, thay vì nhảy bằng `left` (layout) trong khi cửa sổ trượt. Không `drop-shadow`, không filter SVG, không `<circle>` trong SVG: SVG bị giãn theo khung thì hình tròn thành bầu dục. Mọi `<path>` có `vector-effect="non-scaling-stroke"`, nên độ dày nét là pixel màn hình ở mọi tỉ lệ khung.

| Trạng thái | Không có `axis` (viewBox 600 × 120) | Có `axis` | Màu | Chuyển động (chỉ khi `motion-safe`) |
|---|---|---|---|---|
| `active` | Sóng từ 0 tới 600. Cửa sổ sáng từ `600·(1 − remaining)` tới 600; điểm "bây giờ" ở mép trái cửa sổ. Không có cổng | Track từ 0 tới 600. Cửa sổ từ `courseX(now)` tới `courseX(alarmAt)` (không có `alarmAt` thì tới cổng). Cổng ở `courseX(releaseAt)` (không có thì `GATE_X`) | `thread` | Quầng đập `slow`/`mid`/`fast` theo phần còn lại |
| `grace` | Sóng tới x = 556 rồi sờn thành 3 sợi ngắn; cửa sổ từ `556·(1 − remaining)` tới 600 | Sóng tới `courseX(alarmAt)`, rồi 3 sợi tách ra và gặp lại ở cổng `courseX(releaseAt)`; cửa sổ từ "bây giờ" tới cổng | `grace` | `<svg>` sáng rung 0,6 px, 0,9 s |
| `recovery` | Sóng tới x = 352 rồi rẽ lên ví mới ở (588, 22); đường cũ còn lại dạng chấm mờ | Như bên trái; nút ở `marks` | `recovery` | Không |
| `releasedInherit` | Sóng tới cổng ở x = 400, qua cổng tách N nhánh bắt đầu ở `(gateX, waveY(gateX))`; độ dày nhánh tỉ lệ phần thừa kế | Cổng và điểm bắt đầu của nhánh ở `courseX(releaseAt)` | `release`; có `highlight` thì nhánh đó `thread`, các nhánh khác `ink-muted` 35 % | Không |
| `releasedRecover` | Qua cổng, một nhánh lên ví khôi phục | Như bên trái, cổng theo trục | `release` | Không |
| `expired` | Sóng ngắn tới x = 352 rồi cuộn lại | Như bên trái; nút ở `marks` | `ink-muted` | Không |

Luật của chế độ trục:

- `courseX(t, axis)` trừ bằng bigint rồi mới đổi phần tỉ lệ sang number, kẹp vào [0, `VIEW.w`], trả 0 khi `from = to` (hay `to < from`).
- y của cổng luôn là `waveY(gateX)`, không bao giờ giả định bằng `mid`. Nhờ vậy 7B T6 thêm chữ ký của vault mà không phải sửa cổng.
- `marks` nằm ngoài `[from, to]` bị bỏ, không dồn vào mép 0 hay 600 (một nút ở mép sẽ nói sai thời gian). Có `axis` thì `remaining` và `knots` bị bỏ qua.
- Ở `releasedInherit` và `releasedRecover`, mốc có x > `gateX` cũng bị bỏ: đường đi dừng ở cổng, sau cổng là các nhánh.
- Có `axis` thì cổng được vẽ ở `active`, `grace` và hai trạng thái release: người xem thấy sợi chỉ đang đi về đâu. Không có `axis` thì cổng chỉ có sau khi release, như trước.

Ba prop mới, mỗi prop có `data-*` riêng trên gốc:

- `predicted` (`data-predicted="true"`): phần sau "bây giờ" (các sợi sờn ở `grace`, các nhánh khi đã release) vẽ nét đứt `PREDICTED_DASH` ("luật dự đoán, chain chưa ghi"). Không path nào đổi, chỉ kiểu nét.
- `pendingKnot` (`data-pending-knot="true"`): một vòng nét đứt quanh "bây giờ", là nút đang thắt (đã ký, chưa vào block). Trạng thái không có "bây giờ" thì không vẽ.
- `highlight` (`data-highlight="<i>"`, trên gốc và trên `div[data-layer="marks"]`, ở mọi trạng thái, hễ prop có giá trị): nhánh của người đọc dùng `thread`, các nhánh khác `ink-muted` 35 %. Chỉ số không chỉ tới nhánh nào (hay trạng thái không có nhánh) thì không đổi kiểu nét nào, nhưng `data-highlight` vẫn có.

Reduced motion: không transition, không nhịp, không rung, chỉ đổi màu (spec §4.4). Đổi trạng thái thì đổi màu ngay, không transition `color` (R18.4 chỉ cho `opacity` và `transform`).

Không làm ở task này: chữ ký và cột giám hộ (7B T6, đặt vào `[data-part="gate"]`), glyph nối thành một nét (P1), glyph `mark` (Task 9). Glyph và `StateBadge` giữ nguyên như bản plan trước.

**Files:**
- Create: `apps/web/src/thread/geometry.ts`, `apps/web/src/thread/state.ts`, `apps/web/src/thread/glyphs.tsx`, `apps/web/src/thread/thread.tsx`, `apps/web/src/thread/state-badge.tsx`, `apps/web/src/motion/reveal-window.tsx`
- Modify: `apps/web/src/app/globals.css` (hai animation `thread-pulse-mid`, `thread-pulse-fast`)
- Test: `apps/web/test/unit/thread-geometry.test.ts`, `apps/web/test/unit/thread.test.tsx`, `apps/web/test/unit/thread-layers.test.tsx`

**Interfaces:**
- Consumes: Task 3 (lớp màu `text-*`, `stroke-*`, `bg-*`, `border-*` của token; `--ease-spring` qua lớp `ease-spring`; `--animate-thread-pulse`, `--animate-thread-tremble` và hai keyframe), Task 5 (`useT`, `messages` và `THREAD_STATE_KEY` của `labels.messages`, `cn`), Task 6 (`usePrefersReducedMotion`, `DURATION`, `EASE_OUT_EXPO`, `sec` cho `StateBadge`; `SharedThread`; `SPRING_MS` trong test).
- Produces:
  - `src/thread/geometry.ts`: `type Point = readonly [number, number]`; `VIEW = { w: 600, h: 120, mid: 60, amp: 9 }`; `GATE_X = 400`; `FRAY_X = 556`; `BEND_X = 352`; `RECOVERY_END: Point = [588, 22]`; `MAIN_WIDTH = 3`; `PREDICTED_DASH = '5 5'`; `BEAT_SECONDS = { slow: 2.4, mid: 1.6, fast: 1 }`; `type ThreadBeat = 'slow' | 'mid' | 'fast'`; `waveY(x: number): number`; `smoothPath(points: readonly Point[]): string`; `waveSegment(x0: number, x1: number, samples?: number): string`; `branchWidths(weights: readonly number[], main?: number): number[]`; `branchEnds(n: number): number[]`; `interface ThreadAxis { from: bigint; to: bigint; now: bigint; alarmAt?: bigint | null; releaseAt?: bigint | null; marks?: readonly bigint[] }`; `courseX(t: bigint, axis: Pick<ThreadAxis, 'from' | 'to'>): number`; `pctX(x: number): number`; `pctY(y: number): number`; `beatOf(left: number): ThreadBeat`; `interface ThreadInput { remaining?: number; knots?: readonly number[]; branches?: readonly number[]; axis?: ThreadAxis; predicted?: boolean; pendingKnot?: boolean; highlight?: number }`; `type ThreadTone = 'plain' | 'highlight' | 'muted'`; `interface ThreadGeometry { track: string; lit: string; litFrom: number; litTo: number; now: Point | null; nowX: number; pending: Point | null; knots: Point[]; gate: Point | null; gateX: number; branches: { d: string; width: number; tone: ThreadTone }[]; dots: { at: Point; tone: ThreadTone }[]; fibers: string[]; curl: string | null; ghost: string | null; dash: string | null; beat: ThreadBeat | null }`; `threadGeometry(state: ThreadState, input?: ThreadInput): ThreadGeometry`.
  - `src/thread/state.ts`: `type ThreadState = StateName | 'expired'`; `THREAD_STATES: readonly ThreadState[]`; `threadStateOf(s: Pick<VaultStatus, 'state' | 'expired'>): ThreadState`; `threadRemaining(s: Pick<VaultStatus, 'state' | 'expired' | 'lastAlive' | 'lateAt' | 'alarmAt' | 'windowEndsAt'>, now: bigint): number`; `THREAD_COLOR`, `BADGE_COLOR: Record<ThreadState, string>`; `STATE_GLYPH: Record<ThreadState, GlyphName>`.
  - `src/thread/glyphs.tsx`: `type GlyphName = 'active' | 'grace' | 'recovery' | 'releasedInherit' | 'releasedRecover' | 'expired' | 'drill' | 'knot'`; `GLYPH_NAMES`; `StateGlyph({ name, size?, className? })` (SVG 24 × 24, nét 1,5, `aria-hidden="true"`).
  - `src/motion/reveal-window.tsx`: `type RevealMove = 'spring' | 'instant' | { linear: number }`; `interface RevealWindowHandle { setRange(from: number, to: number, move?: RevealMove): void; reset(move?: RevealMove): void }`; `interface RevealWindowProps { from: number; to: number; children: ReactNode; ref?: Ref<RevealWindowHandle>; className?: string }`; `RevealWindow(props)`; `revealTransforms(from: number, to: number): [string, string, string]`; `useMoveWith(transform)` cho thứ đi cùng cửa sổ. Sau review (56c3479), `RevealMove` nằm ở `src/motion/move.ts` (cùng `moveTiming`, `moveTogether`) và `reveal-window.tsx` export lại; không còn `REVEAL_MOVE`.
  - `src/thread/thread.tsx`: `interface ThreadProps extends ThreadInput { state: ThreadState; label?: string; shared?: boolean; revealRef?: Ref<RevealWindowHandle>; className?: string }`; `Thread(props)`. DOM: gốc `div[data-thread]` có `data-state`, `data-predicted`, `data-pending-knot`, `data-highlight`; lớp `svg[data-layer="base" | "glow" | "lit"]`, `div[data-layer="marks"]` (cũng mang `data-highlight`); phần `[data-part="lit" | "glow" | "track" | "fiber" | "fiber-course" | "ghost" | "branch" | "curl" | "gate" | "arch" | "knot" | "dot" | "now-at" | "now" | "halo" | "pending"]`.
  - `src/thread/state-badge.tsx`: `interface StateBadgeProps { state: ThreadState; drill?: boolean; size?: 'sm' | 'md'; live?: boolean; className?: string }`; `StateBadge(props)`.

- [ ] **Step 1: Viết test hỏng cho hình học, trục thời gian và trạng thái**

Test cũ của `VIEW`, `waveY`, `smoothPath`, `waveSegment`, `branchWidths`, `branchEnds` và `state.ts` giữ nguyên. Test của `threadGeometry` đổi theo cách biểu diễn mới: `lit` là cả đường sáng, phần hiện ra là `[litFrom, litTo]`. Thêm `courseX` (kẹp, đơn điệu, không chia cho 0, chính xác với giây unix và với trục khổng lồ), chế độ trục (nút, "bây giờ", cổng, sờn nằm đúng x; đã release thì mốc sau cổng bị bỏ), `predicted` chỉ đổi kiểu nét, `highlight`, `pendingKnot` và nhịp.

`apps/web/test/unit/thread-geometry.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BEAT_SECONDS,
  BEND_X,
  beatOf,
  branchEnds,
  branchWidths,
  courseX,
  FRAY_X,
  GATE_X,
  PREDICTED_DASH,
  RECOVERY_END,
  smoothPath,
  type ThreadAxis,
  type ThreadInput,
  threadGeometry,
  VIEW,
  waveSegment,
  waveY,
} from '../../src/thread/geometry';
import { THREAD_STATES, threadRemaining, threadStateOf } from '../../src/thread/state';

/** Path commands and numbers only, one or more subpaths; never NaN, undefined or Infinity. */
const VALID = /^M[0-9.\- ]+(?:[MCcSsVvHhAaLl][0-9.\- ]+)*$/;
const y2 = (x: number) => Math.round(waveY(x) * 100) / 100;

describe('wave', () => {
  it('stays inside the band and crosses the middle at the gate', () => {
    for (let x = 0; x <= VIEW.w; x += 7) {
      expect(waveY(x)).toBeGreaterThanOrEqual(VIEW.mid - VIEW.amp);
      expect(waveY(x)).toBeLessThanOrEqual(VIEW.mid + VIEW.amp);
    }
    expect(waveY(0)).toBeCloseTo(VIEW.mid, 9);
    expect(waveY(GATE_X)).toBeCloseTo(VIEW.mid, 9);
  });

  it('turns n points into one move and n − 1 cubic segments through them', () => {
    const d = smoothPath([
      [0, 60],
      [100, 50],
      [200, 70],
    ]);
    expect(d.startsWith('M0 60 C')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(2);
    expect(d.endsWith(' 200 70')).toBe(true);
    expect(smoothPath([])).toBe('');
  });

  it('samples every segment with the same structure', () => {
    const a = waveSegment(0, 600);
    const b = waveSegment(300, 600);
    expect(a.match(/C/g)).toHaveLength(16);
    expect(b.match(/C/g)).toHaveLength(16);
    expect(b.startsWith('M300 ')).toBe(true);
  });
});

describe('branches', () => {
  it('keeps the shares in proportion and a single heir as thick as the thread', () => {
    expect(branchWidths([1])).toEqual([3]);
    const [a, b] = branchWidths([7000, 3000]);
    expect(a / b).toBeCloseTo(7 / 3, 1);
    expect(branchWidths([1, 1, 1, 1])).toEqual([1.5, 1.5, 1.5, 1.5]);
  });

  it('never draws a branch thinner than 1 and survives zero, negative and NaN weights', () => {
    expect(branchWidths([9999, 1])[1]).toBe(1);
    expect(branchWidths([0, 0])).toEqual([1, 1]);
    expect(branchWidths([Number.NaN, -5, 10])).toEqual([1, 1, 5.2]);
  });

  it('fans the branch ends out evenly inside the view', () => {
    expect(branchEnds(1)).toEqual([60]);
    expect(branchEnds(3)).toEqual([24, 60, 96]);
    for (const y of branchEnds(12)) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(VIEW.h);
    }
  });
});

describe('courseX', () => {
  const axis = { from: 1_000n, to: 1_600n };

  it('maps chain time linearly onto the width and clamps outside the axis', () => {
    expect(courseX(1_000n, axis)).toBe(0);
    expect(courseX(1_300n, axis)).toBe(300);
    expect(courseX(1_600n, axis)).toBe(VIEW.w);
    expect(courseX(999n, axis)).toBe(0);
    expect(courseX(-(2n ** 200n), axis)).toBe(0);
    expect(courseX(2n ** 200n, axis)).toBe(VIEW.w);
  });

  it('never divides by zero: an empty or reversed axis puts everything at 0', () => {
    for (const t of [0n, 999n, 1_000n, 1_001n, 2n ** 70n]) {
      expect(courseX(t, { from: 1_000n, to: 1_000n })).toBe(0);
      expect(courseX(t, { from: 1_600n, to: 1_000n })).toBe(0);
    }
  });

  it('is monotonic and exact on unix seconds', () => {
    const from = 1_795_000_000n;
    const half = { from, to: from + 15_552_000n };
    expect(courseX(from + 3_888_000n, half)).toBe(150);
    let last = -1;
    for (let t = from - 86_400n; t <= half.to + 86_400n; t += 97_001n) {
      const x = courseX(t, half);
      expect(Number.isFinite(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(last);
      last = x;
    }
    // A huge axis stays finite: only the share of it becomes a number.
    expect(courseX(2n ** 1100n, { from: 0n, to: 2n ** 1101n })).toBe(300);
  });
});

describe('threadGeometry without an axis', () => {
  it('active: the whole course is lit, and the window shows what is left, from "now"', () => {
    const g = threadGeometry('active', { remaining: 0.25 });
    expect(g.now?.[0]).toBe(450);
    expect(g.now?.[1]).toBeCloseTo(waveY(450), 2);
    expect(g.nowX).toBe(450);
    expect([g.litFrom, g.litTo]).toEqual([450, VIEW.w]);
    expect(g.lit).toBe(waveSegment(0, VIEW.w));
    expect(g.track.startsWith('M0 60 ')).toBe(true);
    expect(g.gate).toBeNull();
    expect(g.gateX).toBe(GATE_X);
  });

  it('clamps remaining to 0–1 and hides "now" when nothing is left', () => {
    expect(threadGeometry('active', { remaining: 7 }).now?.[0]).toBe(0);
    expect(threadGeometry('active', { remaining: -1 }).now).toBeNull();
    expect(threadGeometry('active', { remaining: Number.NaN }).now?.[0]).toBe(0);
  });

  it('ties knots on the wave, once each, in order', () => {
    const g = threadGeometry('active', { remaining: 0.5, knots: [0.5, 0, 0.5, 2, -1] });
    expect(g.knots.map(([x]) => x)).toEqual([0, 300, 600]);
    for (const [x, y] of g.knots) expect(y).toBeCloseTo(waveY(x), 2);
  });

  it('grace: frays into three strands before the end, inside the window', () => {
    const g = threadGeometry('grace', { remaining: 0.5 });
    expect(g.fibers).toHaveLength(3);
    for (const f of g.fibers) expect(f.startsWith(`M${FRAY_X} `)).toBe(true);
    expect(g.now?.[0]).toBe(FRAY_X / 2);
    expect([g.litFrom, g.litTo]).toEqual([FRAY_X / 2, VIEW.w]);
    expect(g.beat).toBeNull();
  });

  it('recovery: bends to the new wallet and keeps the old course as a ghost', () => {
    const g = threadGeometry('recovery');
    expect(g.lit.endsWith(`${RECOVERY_END[0]} ${RECOVERY_END[1]}`)).toBe(true);
    expect(g.ghost?.startsWith(`M${BEND_X} `)).toBe(true);
    expect(g.dots).toEqual([{ at: RECOVERY_END, tone: 'plain' }]);
  });

  it('releasedInherit: through the gate, one branch per heir, each starting at the gate on the wave', () => {
    const g = threadGeometry('releasedInherit', { branches: [5000, 3000, 2000] });
    expect(g.gate).toEqual([GATE_X, y2(GATE_X)]);
    expect(g.branches).toHaveLength(3);
    expect(g.dots).toHaveLength(3);
    expect(g.branches[0].width).toBeGreaterThan(g.branches[2].width);
    for (const b of g.branches) expect(b.d.startsWith(`M${g.gateX} ${y2(g.gateX)} `)).toBe(true);
  });

  it('releasedRecover: through the gate to one wallet', () => {
    const g = threadGeometry('releasedRecover');
    expect(g.branches).toHaveLength(1);
    expect(g.dots[0].at[1]).toBeLessThan(VIEW.mid);
  });

  it('expired: a short thread that curls up', () => {
    const g = threadGeometry('expired');
    expect(g.curl).not.toBeNull();
    expect(g.now).toBeNull();
    expect(g.track).toBe('');
  });
});

describe('threadGeometry on a time axis', () => {
  const axis: ThreadAxis = { from: 1_000n, to: 1_600n, now: 1_150n, alarmAt: 1_450n, releaseAt: 1_500n };

  it('active: "now", the end of the lit part and the gate sit at courseX of their times', () => {
    const g = threadGeometry('active', { axis });
    expect(g.nowX).toBe(150);
    expect(g.now).toEqual([150, y2(150)]);
    expect([g.litFrom, g.litTo]).toEqual([150, 450]);
    expect(g.gate).toEqual([500, y2(500)]);
    expect(g.gateX).toBe(500);
    expect(g.lit).toBe(waveSegment(0, VIEW.w));
  });

  it('ties a knot at each mark inside the axis, once, and leaves the others out', () => {
    const g = threadGeometry('active', { axis: { ...axis, marks: [900n, 1_000n, 1_100n, 1_100n, 1_700n] } });
    expect(g.knots).toEqual([
      [0, y2(0)],
      [100, y2(100)],
    ]);
    // The fractions of `knots` belong to the old mode and are ignored on an axis.
    expect(threadGeometry('active', { axis, knots: [0.5] }).knots).toEqual([]);
  });

  it('grace: frays from the alarm to the gate; the window runs from "now" to the gate', () => {
    const g = threadGeometry('grace', { axis: { ...axis, now: 1_350n, alarmAt: 1_300n } });
    expect(g.fibers).toHaveLength(3);
    for (const f of g.fibers) expect(f.startsWith('M300 ')).toBe(true);
    for (const f of g.fibers) expect(f.endsWith(` 500 ${y2(500)}`)).toBe(true);
    expect(g.track).toBe(waveSegment(0, 300));
    expect([g.litFrom, g.litTo]).toEqual([350, 500]);
    expect(g.now).toEqual([350, y2(350)]);
    expect(g.gate?.[0]).toBe(500);
  });

  it('puts the gate on the wave wherever releaseAt falls, and the branches start there', () => {
    const g = threadGeometry('releasedInherit', { axis: { ...axis, releaseAt: 1_300n }, branches: [1, 1] });
    expect(g.gate).toEqual([300, 51]);
    for (const b of g.branches) expect(b.d.startsWith('M300 51 ')).toBe(true);
  });

  it('released: the course ends at the gate, so a mark past it is left out', () => {
    const marks = [1_100n, 1_500n, 1_550n];
    for (const s of ['releasedInherit', 'releasedRecover'] as const) {
      expect(threadGeometry(s, { axis: { ...axis, marks } }).knots, s).toEqual([
        [100, y2(100)],
        [500, y2(500)],
      ]);
    }
    // Active runs on past the gate, and keeps the mark.
    expect(threadGeometry('active', { axis: { ...axis, marks } }).knots.map(([x]) => x)).toEqual([100, 500, 550]);
  });

  it('falls back to GATE_X without releaseAt, and ends the lit part of active at the gate without alarmAt', () => {
    const g = threadGeometry('active', { axis: { from: 0n, to: 600n, now: 100n } });
    expect(g.gateX).toBe(GATE_X);
    expect([g.litFrom, g.litTo]).toEqual([100, GATE_X]);
  });

  it('past the alarm time the lit part is empty and the glow beats fast', () => {
    const g = threadGeometry('active', { axis: { ...axis, now: 1_480n } });
    expect(g.nowX).toBe(480);
    expect([g.litFrom, g.litTo]).toEqual([450, 450]);
    expect(g.beat).toBe('fast');
  });
});

describe('the props of Plan 7B', () => {
  const inputs: ThreadInput[] = [
    { remaining: 0.3, knots: [0.1], branches: [2, 1] },
    { axis: { from: 0n, to: 600n, now: 250n, alarmAt: 200n, releaseAt: 450n, marks: [50n] }, branches: [2, 1] },
  ];

  it('predicted changes only the stroke style, in every state, with and without an axis', () => {
    for (const s of THREAD_STATES) {
      for (const input of inputs) {
        const plain = threadGeometry(s, input);
        const told = threadGeometry(s, { ...input, predicted: true });
        expect(plain.dash, s).toBeNull();
        expect(told.dash, s).toBe(PREDICTED_DASH);
        expect({ ...told, dash: null }, s).toEqual(plain);
      }
    }
  });

  it('highlight lights one branch and mutes the others; an index that names no branch changes nothing', () => {
    const g = threadGeometry('releasedInherit', { branches: [5000, 3000, 2000], highlight: 1 });
    expect(g.branches.map((b) => b.tone)).toEqual(['muted', 'highlight', 'muted']);
    expect(g.dots.map((d) => d.tone)).toEqual(['muted', 'highlight', 'muted']);
    for (const h of [3, -1, 1.5, Number.NaN]) {
      const n = threadGeometry('releasedInherit', { branches: [5000, 3000, 2000], highlight: h });
      expect(
        n.branches.map((b) => b.tone),
        String(h),
      ).toEqual(['plain', 'plain', 'plain']);
    }
  });

  it('pendingKnot puts a knot being tied at "now", and nowhere when there is no "now"', () => {
    expect(threadGeometry('active', { remaining: 0.5, pendingKnot: true }).pending).toEqual([300, y2(300)]);
    expect(threadGeometry('active', { remaining: 0.5 }).pending).toBeNull();
    expect(threadGeometry('active', { axis: inputs[1].axis, pendingKnot: true }).pending).toEqual([250, y2(250)]);
    expect(threadGeometry('releasedInherit', { pendingKnot: true }).pending).toBeNull();
  });
});

describe('the beat', () => {
  it('quickens near the deadline: above half slow, a tenth to half mid, under a tenth fast', () => {
    expect([1, 0.51, 0.5, 0.1, 0.099, 0].map(beatOf)).toEqual(['slow', 'slow', 'mid', 'mid', 'fast', 'fast']);
    expect(threadGeometry('active', { remaining: 0.72 }).beat).toBe('slow');
    expect(threadGeometry('active', { remaining: 0.3 }).beat).toBe('mid');
    expect(threadGeometry('active', { remaining: 0.05 }).beat).toBe('fast');
    expect(threadGeometry('active', { axis: { from: 0n, to: 600n, now: 10n, alarmAt: 400n } }).beat).toBe('slow');
    for (const s of THREAD_STATES.filter((x) => x !== 'active')) expect(threadGeometry(s).beat, s).toBeNull();
  });

  it('globals.css runs thread-pulse once per beat: 2.4 s, 1.6 s and 1 s', () => {
    const css = readFileSync(fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)), 'utf8');
    const token = { slow: 'thread-pulse', mid: 'thread-pulse-mid', fast: 'thread-pulse-fast' } as const;
    expect(BEAT_SECONDS).toEqual({ slow: 2.4, mid: 1.6, fast: 1 });
    for (const [beat, name] of Object.entries(token) as [keyof typeof token, string][]) {
      expect(css, beat).toMatch(new RegExp(`--animate-${name}:\\s*thread-pulse ${BEAT_SECONDS[beat]}s `));
    }
  });
});

describe('every path', () => {
  it('is well formed in every state, with and without an axis', () => {
    const axis: ThreadAxis = { from: 0n, to: 600n, now: 250n, alarmAt: 200n, releaseAt: 450n, marks: [50n] };
    const odd: ThreadAxis = { from: 0n, to: 600n, now: 599n, alarmAt: 600n, releaseAt: 100n };
    for (const s of THREAD_STATES) {
      for (const input of [{ remaining: 0.3, knots: [0.1] }, { axis }, { axis: odd }] as ThreadInput[]) {
        const g = threadGeometry(s, { ...input, branches: [2, 1] });
        const all = [g.track, g.lit, g.curl, g.ghost, ...g.fibers, ...g.branches.map((b) => b.d)];
        for (const d of all) if (d) expect(d, `${s}: ${d}`).toMatch(VALID);
        for (const n of [g.litFrom, g.litTo, g.nowX, g.gateX]) {
          expect(n, s).toBeGreaterThanOrEqual(0);
          expect(n, s).toBeLessThanOrEqual(VIEW.w);
        }
        expect(g.litFrom, s).toBeLessThanOrEqual(g.litTo);
      }
    }
  });
});

describe('thread state', () => {
  const base = { lastAlive: 1000n, lateAt: 2000n, alarmAt: null, windowEndsAt: null, expired: false } as const;

  it('maps an expired Drill to its own state', () => {
    expect(threadStateOf({ state: 'active', expired: false })).toBe('active');
    expect(threadStateOf({ state: 'active', expired: true })).toBe('expired');
  });

  it('measures what is left until the owner is late', () => {
    expect(threadRemaining({ ...base, state: 'active' }, 1000n)).toBe(1);
    expect(threadRemaining({ ...base, state: 'active' }, 1750n)).toBe(0.25);
    expect(threadRemaining({ ...base, state: 'active' }, 5000n)).toBe(0);
  });

  it('measures the alarm window while an alarm runs', () => {
    const s = { ...base, state: 'grace' as const, alarmAt: 3000n, windowEndsAt: 4000n };
    expect(threadRemaining(s, 3500n)).toBe(0.5);
  });

  it('has nothing left once released or expired, and survives an empty period', () => {
    expect(threadRemaining({ ...base, state: 'releasedInherit' }, 1500n)).toBe(0);
    expect(threadRemaining({ ...base, state: 'active', expired: true }, 1500n)).toBe(0);
    expect(threadRemaining({ ...base, state: 'active', lateAt: 1000n }, 1000n)).toBe(0);
  });
});
```

Run: `npm test -w apps/web -- thread-geometry`
Expected: FAIL (`Cannot find module '../../src/thread/geometry'`).

- [ ] **Step 2: Viết `geometry.ts`, `state.ts`, `glyphs.tsx` và hai nhịp trong `globals.css`**

`apps/web/src/thread/geometry.ts`:

```ts
import type { ThreadState } from './state';

export type Point = readonly [number, number];

/** The Thread draws in this box; the SVG stretches it to the box of its root (preserveAspectRatio="none"). */
export const VIEW = { w: 600, h: 120, mid: 60, amp: 9 } as const;
/** One and a half waves across the box: the wave crosses the middle at x = 0, 200, 400, 600. */
const CYCLES = 1.5;
/** Where the gate stands when nothing says when it opens; the wave is at the middle there. */
export const GATE_X = 400;
/** Where a thread in grace starts to fray, without a time axis. */
export const FRAY_X = 556;
/** Where a recovery bends away, and where an expired Drill curls up. */
export const BEND_X = 352;
export const RECOVERY_END: Point = [588, 22];
/** Stroke widths are screen pixels: every path keeps them however the box stretches (non-scaling-stroke). */
export const MAIN_WIDTH = 3;
/** The dash of what the rules predict and the chain has not recorded yet. */
export const PREDICTED_DASH = '5 5';
/** Seconds of one beat of the glow (globals.css `--animate-thread-pulse`, `-mid`, `-fast`). */
export const BEAT_SECONDS = { slow: 2.4, mid: 1.6, fast: 1 } as const;
export type ThreadBeat = keyof typeof BEAT_SECONDS;
const SAMPLES = 16;
const BRANCH_END_X = 594;
const BAND = { top: 24, bottom: 96 } as const;
/** How far the outer strands of a fray stand from the thread, halfway through the alarm window. */
const FRAY_SPREAD = 7;
/** A fray shorter than this would be a knot, not a fray: it gets this length. */
const FRAY_MIN = 40;
/** courseX works in millionths of the axis, in bigint, before it turns into a number. */
const SCALE = 1_000_000n;

const r = (n: number): number => Math.round(n * 100) / 100;
const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1);

export function waveY(x: number): number {
  return VIEW.mid + VIEW.amp * Math.sin((x / VIEW.w) * Math.PI * 2 * CYCLES);
}

/** Catmull-Rom through the points (tension 0.5), written as cubic Bézier segments. */
export function smoothPath(points: readonly Point[]): string {
  if (points.length === 0) return '';
  let d = `M${r(points[0][0])} ${r(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(p2[0])} ${r(p2[1])}`;
  }
  return d;
}

/** The wave from x0 to x1, always `samples` segments long. */
export function waveSegment(x0: number, x1: number, samples = SAMPLES): string {
  const a = Math.min(x0, x1);
  const b = Math.max(x0, x1);
  const pts: Point[] = Array.from({ length: samples + 1 }, (_, i) => {
    const x = a + ((b - a) * i) / samples;
    return [x, waveY(x)];
  });
  return smoothPath(pts);
}

/**
 * Stroke width per heir: proportional to the share, scaled by √n so that the branches together look about as
 * heavy as the thread they come from; never under 1 so a small share stays visible.
 */
export function branchWidths(weights: readonly number[], main = MAIN_WIDTH): number[] {
  const w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  const total = w.reduce((a, b) => a + b, 0);
  if (total === 0) return w.map(() => 1);
  const k = main * Math.sqrt(w.length);
  return w.map((x) => Math.max(1, r((k * x) / total)));
}

/** Y of each branch end, spread evenly over the band. */
export function branchEnds(n: number): number[] {
  if (n <= 1) return [VIEW.mid];
  return Array.from({ length: n }, (_, i) => r(BAND.top + ((BAND.bottom - BAND.top) * i) / (n - 1)));
}

/** A linear time axis under the thread (R18.5): chain time `from` is x = 0, `to` is x = VIEW.w. */
export interface ThreadAxis {
  from: bigint;
  to: bigint;
  /** Chain time now: the "now" point. */
  now: bigint;
  /** When the alarm can be raised (active) or was raised (grace). The lit part of `active` ends here; `grace` frays from here. */
  alarmAt?: bigint | null;
  /** When the gate opens: the gate stands here, and the lit part of `grace` ends here. */
  releaseAt?: bigint | null;
  /**
   * Moments tied as knots (check-ins). Marks outside [from, to] are left out, never piled up at an edge; once
   * released, so are marks past the gate, where the branches take over.
   */
  marks?: readonly bigint[];
}

/**
 * X of chain time `t` on the axis: the subtraction runs in bigint and only the share of the axis becomes a number,
 * so unix seconds never lose a digit. Clamped to [0, VIEW.w]; an empty or reversed axis puts everything at 0.
 */
export function courseX(t: bigint, axis: Pick<ThreadAxis, 'from' | 'to'>): number {
  const span = axis.to - axis.from;
  if (span <= 0n) return 0;
  const d = t - axis.from;
  if (d <= 0n) return 0;
  if (d >= span) return VIEW.w;
  return r((Number((d * SCALE) / span) / Number(SCALE)) * VIEW.w);
}

/** Percent of the box width or height, for the HTML layer and the RevealWindow. */
export const pctX = (x: number): number => Math.round((x / VIEW.w) * 100_000) / 1000;
export const pctY = (y: number): number => Math.round((y / VIEW.h) * 100_000) / 1000;

/** The glow beats faster as the deadline nears: above half left slow, from a tenth to half mid, under a tenth fast. */
export function beatOf(left: number): ThreadBeat {
  if (left > 0.5) return 'slow';
  if (left >= 0.1) return 'mid';
  return 'fast';
}

export interface ThreadInput {
  /** Share of the current period still left, 0–1. Read by `active` and `grace`, and only without `axis`. */
  remaining?: number;
  /** Where check-ins tied knots, as fractions 0–1 of the drawn wave. Only without `axis` (it has `marks`). */
  knots?: readonly number[];
  /** One weight per heir (for example the share in basis points). Read by `releasedInherit` only. */
  branches?: readonly number[];
  /** Places "now", the lit part, the fray, the gate and the knots on a linear time axis. */
  axis?: ThreadAxis;
  /** What lies after "now" (the fray in `grace`, the branches once released) is the rules' prediction: dashed. */
  predicted?: boolean;
  /** A knot is being tied at "now": signed, not yet in a block. */
  pendingKnot?: boolean;
  /** Index of the branch of the reader (an heir): drawn in `thread`, the others in `ink-muted` at 35 %. */
  highlight?: number;
}

/** `plain` takes the state's colour; `highlight` and `muted` come from `highlight`. */
export type ThreadTone = 'plain' | 'highlight' | 'muted';

export interface ThreadGeometry {
  /** The course, drawn faint under the lit thread. Empty when the state has no course to show. */
  track: string;
  /** The lit course. Only its window [litFrom, litTo] shows, so moving "now" never changes this path. */
  lit: string;
  litFrom: number;
  litTo: number;
  /** The "now" point, or null when the state draws none. */
  now: Point | null;
  /** X of "now" also when no point is drawn: courseX(axis.now), else the start of what is left (active, grace), else VIEW.w. */
  nowX: number;
  /** The knot being tied (at "now"), or null. */
  pending: Point | null;
  knots: Point[];
  /** Where the gate arch stands, or null when the state draws no gate. */
  gate: Point | null;
  /** X of the gate, also when it is not drawn (the guardians' posts of Plan 7B stand here). */
  gateX: number;
  branches: { d: string; width: number; tone: ThreadTone }[];
  dots: { at: Point; tone: ThreadTone }[];
  fibers: string[];
  curl: string | null;
  ghost: string | null;
  /** Stroke dash of the fray and the branches: PREDICTED_DASH when `predicted`, else null. */
  dash: string | null;
  /** The glow's beat, or null when the state does not pulse (only `active` does). */
  beat: ThreadBeat | null;
}

function knotsOn(fractions: readonly number[] | undefined, end: number): Point[] {
  const xs = [...new Set((fractions ?? []).map((f) => r(clamp01(f) * end)))].sort((a, b) => a - b);
  return xs.map((x): Point => [x, r(waveY(x))]);
}

function marksOn(axis: ThreadAxis): Point[] {
  const inside = (axis.marks ?? []).filter((t) => t >= axis.from && t <= axis.to);
  const xs = [...new Set(inside.map((t) => courseX(t, axis)))].sort((a, b) => a - b);
  return xs.map((x): Point => [x, r(waveY(x))]);
}

/** From the gate (gx, gy) to the branch end; the curve keeps its shape when the gate moves along the axis. */
function branch(gx: number, gy: number, y: number): string {
  const k = (BRANCH_END_X - gx) / (BRANCH_END_X - GATE_X);
  return `M${gx} ${gy} C${r(gx + 60 * k)} ${gy} ${r(gx + 106 * k)} ${y} ${BRANCH_END_X} ${y}`;
}

/** Three strands from x0 to x1 that part from the thread and meet again at the gate. */
function frayStrands(x0: number, x1: number): string[] {
  return [-1, 0, 1].map((side) =>
    smoothPath(
      Array.from({ length: SAMPLES + 1 }, (_, i): Point => {
        const x = x0 + ((x1 - x0) * i) / SAMPLES;
        return [x, waveY(x) + side * FRAY_SPREAD * Math.sin((Math.PI * i) / SAMPLES)];
      }),
    ),
  );
}

export function threadGeometry(state: ThreadState, input: ThreadInput = {}): ThreadGeometry {
  const { axis } = input;
  const gateX = axis?.releaseAt != null ? courseX(axis.releaseAt, axis) : GATE_X;
  const gateY = r(waveY(gateX));
  const base: ThreadGeometry = {
    track: '',
    lit: '',
    litFrom: 0,
    litTo: VIEW.w,
    now: null,
    nowX: axis ? courseX(axis.now, axis) : VIEW.w,
    pending: null,
    knots: [],
    gate: null,
    gateX,
    branches: [],
    dots: [],
    fibers: [],
    curl: null,
    ghost: null,
    dash: input.predicted ? PREDICTED_DASH : null,
    beat: null,
  };
  const knotsAt = (end: number): Point[] => (axis ? marksOn(axis) : knotsOn(input.knots, end));
  const withPending = (g: ThreadGeometry): ThreadGeometry => ({
    ...g,
    pending: input.pendingKnot && g.now ? g.now : null,
  });

  if ((state === 'active' || state === 'grace') && axis) {
    const nowX = base.nowX;
    const now: Point = [nowX, r(waveY(nowX))];
    const alarmX = axis.alarmAt != null ? courseX(axis.alarmAt, axis) : gateX;
    if (state === 'active') {
      return withPending({
        ...base,
        track: waveSegment(0, VIEW.w),
        lit: waveSegment(0, VIEW.w),
        litFrom: Math.min(nowX, alarmX),
        litTo: alarmX,
        now,
        knots: knotsAt(VIEW.w),
        gate: [gateX, gateY],
        beat: beatOf(alarmX > 0 ? clamp01((alarmX - nowX) / alarmX) : 0),
      });
    }
    // grace: the thread frays from the alarm and the strands meet again at the gate. A gate at or before the alarm
    // (an axis cut short) still gets a short fray after the alarm.
    const x0 = gateX > alarmX ? alarmX : Math.min(alarmX, VIEW.w - FRAY_MIN);
    const x1 = gateX > alarmX ? gateX : x0 + FRAY_MIN;
    return withPending({
      ...base,
      track: waveSegment(0, x0),
      lit: waveSegment(0, x0),
      litFrom: Math.min(nowX, x1),
      litTo: x1,
      now,
      knots: knotsAt(x0),
      gate: [gateX, gateY],
      fibers: frayStrands(x0, x1),
    });
  }

  if (state === 'active' || state === 'grace') {
    const end = state === 'grace' ? FRAY_X : VIEW.w;
    const left = input.remaining === undefined ? 1 : Number.isNaN(input.remaining) ? 1 : clamp01(input.remaining);
    const xNow = r(end * (1 - left));
    const fy = r(waveY(FRAY_X));
    return withPending({
      ...base,
      track: waveSegment(0, end),
      lit: waveSegment(0, end),
      litFrom: xNow,
      // In grace the window reaches past FRAY_X, over the strands.
      litTo: VIEW.w,
      now: left > 0 ? [xNow, r(waveY(xNow))] : null,
      nowX: xNow,
      knots: knotsOn(input.knots, end),
      fibers:
        state === 'grace'
          ? [
              `M${FRAY_X} ${fy} c12 -1 24 -9 38 -14`,
              `M${FRAY_X} ${fy} c14 0 26 2 40 1`,
              `M${FRAY_X} ${fy} c10 2 20 10 32 16`,
            ]
          : [],
      beat: state === 'active' ? beatOf(left) : null,
    });
  }

  if (state === 'recovery') {
    const by = r(waveY(BEND_X));
    const [ex, ey] = RECOVERY_END;
    return {
      ...base,
      lit: `${waveSegment(0, BEND_X)} C${BEND_X + 90} ${by} ${ex - 70} ${ey} ${ex} ${ey}`,
      knots: knotsAt(BEND_X),
      ghost: waveSegment(BEND_X, VIEW.w),
      dots: [{ at: RECOVERY_END, tone: 'plain' }],
    };
  }

  if (state === 'releasedInherit' || state === 'releasedRecover') {
    const weights = state === 'releasedRecover' || !input.branches?.length ? [1] : input.branches;
    const widths = branchWidths(weights);
    const ys = state === 'releasedRecover' ? [BAND.top] : branchEnds(weights.length);
    const h = input.highlight;
    const valid = h !== undefined && Number.isInteger(h) && h >= 0 && h < ys.length;
    const tone = (i: number): ThreadTone => (!valid ? 'plain' : i === h ? 'highlight' : 'muted');
    return {
      ...base,
      lit: waveSegment(0, gateX),
      // The course ends at the gate and the branches take over: a mark past the gate is left out.
      knots: knotsAt(gateX).filter(([x]) => x <= gateX),
      gate: [gateX, gateY],
      branches: ys.map((y, i) => ({ d: branch(gateX, gateY, y), width: widths[i], tone: tone(i) })),
      dots: ys.map((y, i) => ({ at: [BRANCH_END_X, y] as Point, tone: tone(i) })),
    };
  }

  // expired: a short thread that curls up.
  const ey = r(waveY(BEND_X));
  return {
    ...base,
    lit: waveSegment(0, BEND_X),
    knots: knotsAt(BEND_X),
    curl: `M${BEND_X} ${ey} c36 0 64 -12 64 6 s-22 26 -38 12 s2 -22 18 -14 s6 10 -4 12`,
  };
}
```

(Không có `axis`, `remaining` là `NaN` hoặc thiếu ở `active`/`grace` đều coi là còn nguyên: sợi chỉ không bao giờ "đứt" vì một số đọc hỏng. `courseX` tính phần tỉ lệ bằng bigint theo phần triệu của trục, nên `2n ** 1100n` cũng không thành `NaN`; độ phân giải 0,0006 đơn vị view, nhỏ hơn mọi pixel.)

`apps/web/src/thread/state.ts`:

```ts
import type { StateName, VaultStatus } from '@atropyle/sdk';
import type { GlyphName } from './glyphs';

/** The five vault states plus an expired Drill (spec §4.1). */
export type ThreadState = StateName | 'expired';

export const THREAD_STATES: readonly ThreadState[] = [
  'active',
  'grace',
  'recovery',
  'releasedInherit',
  'releasedRecover',
  'expired',
];

export function threadStateOf(s: Pick<VaultStatus, 'state' | 'expired'>): ThreadState {
  return s.expired ? 'expired' : s.state;
}

function fraction(left: bigint, span: bigint): number {
  if (span <= 0n || left <= 0n) return 0;
  if (left >= span) return 1;
  return Number((left * 10_000n) / span) / 10_000;
}

/**
 * Share of the thread still lit, 0–1. While an alarm runs it is the response window; otherwise the time until the
 * owner is late. Released and expired vaults have nothing left. `now` is chain time (chainNow of lib/format).
 */
export function threadRemaining(
  s: Pick<VaultStatus, 'state' | 'expired' | 'lastAlive' | 'lateAt' | 'alarmAt' | 'windowEndsAt'>,
  now: bigint,
): number {
  if (s.expired || s.state === 'releasedInherit' || s.state === 'releasedRecover') return 0;
  if (s.alarmAt !== null && s.windowEndsAt !== null) return fraction(s.windowEndsAt - now, s.windowEndsAt - s.alarmAt);
  return fraction(s.lateAt - now, s.lateAt - s.lastAlive);
}

/** The Thread is gold while alive (spec §4.1); the badge uses `alive` (spec §4.3). */
export const THREAD_COLOR: Record<ThreadState, string> = {
  active: 'text-thread',
  grace: 'text-grace',
  recovery: 'text-recovery',
  releasedInherit: 'text-release',
  releasedRecover: 'text-release',
  expired: 'text-ink-muted',
};

export const BADGE_COLOR: Record<ThreadState, string> = {
  active: 'border-alive/40 bg-alive/10 text-alive',
  grace: 'border-grace/40 bg-grace/10 text-grace',
  recovery: 'border-recovery/40 bg-recovery/10 text-recovery',
  releasedInherit: 'border-release/40 bg-release/10 text-release',
  releasedRecover: 'border-release/40 bg-release/10 text-release',
  expired: 'border-line-strong bg-surface-2 text-ink-muted',
};

export const STATE_GLYPH: Record<ThreadState, GlyphName> = {
  active: 'active',
  grace: 'grace',
  recovery: 'recovery',
  releasedInherit: 'releasedInherit',
  releasedRecover: 'releasedRecover',
  expired: 'expired',
};
```

`apps/web/src/thread/glyphs.tsx`:

```tsx
import { cn } from '@/lib/cn';

export type GlyphName =
  | 'active'
  | 'grace'
  | 'recovery'
  | 'releasedInherit'
  | 'releasedRecover'
  | 'expired'
  | 'drill'
  | 'knot';

export const GLYPH_NAMES: readonly GlyphName[] = [
  'active',
  'grace',
  'recovery',
  'releasedInherit',
  'releasedRecover',
  'expired',
  'drill',
  'knot',
];

const GATE = 'M9 19V9.5a3 3 0 0 1 6 0V19';

/** Eight glyphs in the thread's own line (spec §4.5): 24 × 24, stroke 1.5, round ends, like Lucide. */
const SHAPES: Record<GlyphName, { d: string[]; dots?: [number, number][]; dashed?: string }> = {
  // A heartbeat travelling along the thread.
  active: { d: ['M2 12h5l2-4.5 3 9 2-4.5h8'] },
  // The thread runs, then frays into three strands.
  grace: { d: ['M2 12h10', 'M12 12c2.5 0 4-2 7.5-3.5', 'M12 12c2.5 0 5 .5 8.5.5', 'M12 12c2 .5 3.5 2.5 6 4.5'] },
  // The thread bends away to a new wallet.
  recovery: { d: ['M2 16h7c4.5 0 6-7.5 10-7.5'], dots: [[20.5, 8.5]] },
  // Through the gate, then three branches.
  releasedInherit: { d: ['M2 15h7', GATE, 'M15 15c3 0 3.5-5 7-5', 'M15 15h7', 'M15 15c3 0 3.5 4 7 4'] },
  // Through the gate, one branch to the recovery wallet.
  releasedRecover: { d: ['M2 15h7', GATE, 'M15 15c3 0 3.5-6.5 5.5-6.5'], dots: [[21, 8.5]] },
  // A short thread that curls up.
  expired: { d: ['M2 12h9a4 4 0 1 1-4 4 2.5 2.5 0 0 1 2.5-2.5'] },
  // A practice loop: the dashed part is the Drill.
  drill: { d: ['M2 12h4', 'M18 12h4'], dashed: 'M6 12a6 5 0 1 0 12 0a6 5 0 1 0-12 0' },
  // A knot tied on the thread: one check-in.
  knot: { d: ['M2 12h6', 'M16 12h6', 'M8 12c0-3 2-4.5 4-4.5s4 1.5 4 4.5-2 4.5-4 4.5-4-1.5-4-4.5Z', 'M9.5 9l5 6'] },
};

export function StateGlyph({ name, size = 16, className }: { name: GlyphName; size?: number; className?: string }) {
  const s = SHAPES[name];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0', className)}
      data-glyph={name}
    >
      {s.d.map((d) => (
        <path key={d} d={d} />
      ))}
      {s.dashed ? <path d={s.dashed} strokeDasharray="2 2.6" /> : null}
      {s.dots?.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.6} fill="currentColor" stroke="none" />
      ))}
    </svg>
  );
}
```

`apps/web/src/app/globals.css`: trong khối `@theme`, ngay sau dòng `--animate-thread-pulse: thread-pulse 2.4s var(--ease-in-out-sine) infinite;`, thêm hai dòng để có ba nhịp của quầng (`BEAT_SECONDS`); keyframe `thread-pulse` giữ nguyên, nên e2e vẫn thấy cùng tên animation:

```css
  --animate-thread-pulse-mid: thread-pulse 1.6s var(--ease-in-out-sine) infinite;
  --animate-thread-pulse-fast: thread-pulse 1s var(--ease-in-out-sine) infinite;
```

Run: `npm test -w apps/web -- thread-geometry`
Expected: PASS (34 test).

- [ ] **Step 3: Viết test hỏng cho `Thread`, các lớp, `RevealWindow`, glyph và `StateBadge`**

`thread.test.tsx` giữ các ca của bản trước, đọc gốc `[data-thread]` thay cho `<svg>`. `thread-layers.test.tsx` (mới) giữ R18.4: không `animate-*` trên phần tử con của SVG; đổi `remaining` hay `axis.now` không đổi `d` nào, chỉ đổi transform của `RevealWindow` (và của "bây giờ"); không filter, không `drop-shadow`, không hình tròn trong SVG; mọi path có `vector-effect`; gốc `overflow: clip`; mỗi prop mới có `data-*` riêng (`data-highlight` ở mọi trạng thái, trên gốc và trên lớp `marks`); `setRange` chỉ dịch cửa sổ, "bây giờ" và các mốc đứng yên; lần vẽ đầu (prerender) đã có cửa sổ đúng chỗ.

`apps/web/test/unit/thread.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GLYPH_NAMES, StateGlyph } from '../../src/thread/glyphs';
import { THREAD_STATES } from '../../src/thread/state';
import { StateBadge } from '../../src/thread/state-badge';
import { Thread } from '../../src/thread/thread';
import { renderWithProviders } from '../helpers/render';

const parts = (c: HTMLElement, part: string) => c.querySelectorAll(`[data-part="${part}"]`);
const root = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-thread]');

describe('Thread', () => {
  it('is decorative unless it has a label', () => {
    const { container } = renderWithProviders(<Thread state="active" />);
    expect(root(container)?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();
    for (const svg of container.querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden')).toBe('true');
  });

  it('carries a label as an image when given one', () => {
    renderWithProviders(<Thread state="grace" label="Vault thread: Grace period" />);
    const img = screen.getByRole('img', { name: 'Vault thread: Grace period' });
    expect(img.hasAttribute('data-thread')).toBe(true);
    expect(img.hasAttribute('aria-hidden')).toBe(false);
  });

  it('draws the lit part, the "now" point and the knots of an active vault, in the thread colour', () => {
    const { container } = renderWithProviders(<Thread state="active" remaining={0.5} knots={[0.1, 0.3]} />);
    expect(root(container)?.getAttribute('data-state')).toBe('active');
    expect(root(container)?.getAttribute('class')).toContain('text-thread');
    expect(parts(container, 'lit')).toHaveLength(1);
    expect(parts(container, 'now')).toHaveLength(1);
    expect(parts(container, 'knot')).toHaveLength(2);
    expect(parts(container, 'lit')[0].getAttribute('d')).toMatch(/^M0 60 /);
    expect(container.querySelector<HTMLElement>('[data-reveal="outer"]')?.style.transform).toBe('translateX(50%)');
  });

  it('splits into one branch per heir, thicker for a larger share, through an HTML gate', () => {
    const { container } = renderWithProviders(<Thread state="releasedInherit" branches={[5000, 3000, 2000]} />);
    const b = parts(container, 'branch');
    expect(b).toHaveLength(3);
    expect(parts(container, 'gate')).toHaveLength(1);
    expect(parts(container, 'gate')[0].tagName).toBe('SPAN');
    expect(parts(container, 'dot')).toHaveLength(3);
    const widths = [...b].map((p) => Number(p.getAttribute('stroke-width')));
    expect(widths[0]).toBeGreaterThan(widths[2]);
  });

  it('curls an expired Drill up and shows no "now"', () => {
    const { container } = renderWithProviders(<Thread state="expired" />);
    expect(parts(container, 'curl')).toHaveLength(1);
    expect(parts(container, 'now')).toHaveLength(0);
    expect(root(container)?.getAttribute('class')).toContain('text-ink-muted');
  });

  it('moves only behind motion-safe: the pulse and the tremble never run under reduced motion', () => {
    const { container } = renderWithProviders(
      <>
        <Thread state="active" />
        <Thread state="grace" />
      </>,
    );
    const classes = [...container.querySelectorAll('[class]')].flatMap((e) =>
      (e.getAttribute('class') ?? '').split(/\s+/),
    );
    expect(classes).toContain('motion-safe:animate-thread-pulse');
    expect(classes).toContain('motion-safe:animate-thread-tremble');
    expect(classes.filter((c) => /^(?:transition|animate-|duration-|ease-)/.test(c))).toEqual([]);
  });

  it('is 5:1 unless the caller sets a height', () => {
    const { container } = renderWithProviders(<Thread state="active" className="h-20 w-full" />);
    const cls = root(container)?.getAttribute('class') ?? '';
    expect(cls).toContain('aspect-[5/1]');
    expect(cls).toContain('h-20 w-full');
  });

  it('renders every state', () => {
    for (const s of THREAD_STATES) {
      const { container, unmount } = renderWithProviders(<Thread state={s} remaining={0.4} branches={[1, 2]} />);
      expect(container.querySelector(`[data-thread][data-state="${s}"]`), s).not.toBeNull();
      unmount();
    }
  });
});

describe('StateGlyph', () => {
  it('draws eight distinct glyphs, hidden from assistive technology, in the current colour', () => {
    const seen = new Set<string>();
    for (const name of GLYPH_NAMES) {
      const { container, unmount } = renderWithProviders(<StateGlyph name={name} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden'), name).toBe('true');
      expect(svg?.getAttribute('stroke'), name).toBe('currentColor');
      expect(svg?.getAttribute('stroke-width'), name).toBe('1.5');
      for (const p of container.querySelectorAll('path'))
        expect(p.getAttribute('d'), name).toMatch(/^M[0-9.\- a-zA-Z]+$/);
      seen.add(svg?.innerHTML ?? '');
      unmount();
    }
    expect(seen.size).toBe(GLYPH_NAMES.length);
  });
});

describe('StateBadge', () => {
  it('names every state in words next to its glyph (colour is never the only signal)', () => {
    const want = {
      active: 'Active',
      grace: 'Grace period',
      recovery: 'Recovery pending',
      releasedInherit: 'Released to heirs',
      releasedRecover: 'Released to the recovery wallet',
      expired: 'Drill expired',
    } as const;
    for (const s of THREAD_STATES) {
      const { container, unmount } = renderWithProviders(<StateBadge state={s} />);
      expect(screen.getByText(want[s])).toBeTruthy();
      expect(container.querySelector(`[data-state="${s}"] svg[data-glyph]`), s).not.toBeNull();
      unmount();
    }
  });

  it('uses the alive colour for an active vault', () => {
    const { container } = renderWithProviders(<StateBadge state="active" />);
    expect(container.querySelector('[data-state="active"]')?.getAttribute('class')).toContain('text-alive');
  });

  it('speaks Vietnamese', async () => {
    renderWithProviders(<StateBadge state="grace" />, { lang: 'vi' });
    await waitFor(() => expect(screen.getByText('Thời gian ân hạn')).toBeTruthy());
  });

  it('marks a Drill and announces changes when live', () => {
    const { container } = renderWithProviders(<StateBadge state="active" drill live />);
    expect(screen.getByText('Drill')).toBeTruthy();
    expect(container.querySelector('[data-state="active"]')?.getAttribute('aria-live')).toBe('polite');
  });
});
```

`apps/web/test/unit/thread-layers.test.tsx`:

```tsx
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REVEAL_MOVE, RevealWindow, type RevealWindowHandle, revealTransforms } from '../../src/motion/reveal-window';
import { SPRING_MS } from '../../src/motion/tokens';
import type { ThreadAxis } from '../../src/thread/geometry';
import { THREAD_STATES } from '../../src/thread/state';
import { Thread, type ThreadProps } from '../../src/thread/thread';

afterEach(() => {
  vi.restoreAllMocks();
});

const AXIS: ThreadAxis = { from: 0n, to: 600n, now: 150n, alarmAt: 450n, releaseAt: 500n, marks: [60n, 120n] };
const ds = (c: HTMLElement) => [...c.querySelectorAll('path')].map((p) => p.getAttribute('d'));
const reveal = (c: HTMLElement) =>
  ['outer', 'middle', 'inner'].map((n) => c.querySelector<HTMLElement>(`[data-reveal="${n}"]`)?.style.transform);
const placed = (c: HTMLElement) =>
  [...c.querySelectorAll<HTMLElement>('[data-part="knot"], [data-part="gate"], [data-part="dot"]')].map(
    (e) => `${e.style.left} ${e.style.top}`,
  );
/** Every state, each with all the props a page can pass. */
const EVERY: ThreadProps[] = THREAD_STATES.flatMap((state) => [
  { state, remaining: 0.3, knots: [0.2], branches: [2, 1], predicted: true, pendingKnot: true, highlight: 0 },
  { state, axis: AXIS, branches: [2, 1] },
]);

let renders = 0;
/** Counts the renders of the RevealWindow's children. */
function Count() {
  renders++;
  return null;
}

function stubReduced(reduce: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) => ({ matches: q.includes('reduce') ? reduce : false }) as unknown as MediaQueryList,
  );
}

describe('Thread layers (R18.4)', () => {
  it('animates only root svgs: no animate-* class on anything inside an svg', () => {
    for (const props of EVERY) {
      const { container, unmount } = render(<Thread {...props} />);
      for (const el of container.querySelectorAll('svg *')) {
        expect(el.getAttribute('class') ?? '', `${props.state} ${el.tagName}`).not.toMatch(/animate-/);
      }
      unmount();
    }
    const { container } = render(
      <>
        <Thread state="active" remaining={0.05} />
        <Thread state="grace" remaining={0.5} />
      </>,
    );
    const glow = container.querySelector('svg[data-layer="glow"]');
    expect(glow?.getAttribute('class')).toContain('motion-safe:animate-thread-pulse-fast');
    expect(glow?.parentElement?.closest('svg')).toBeNull();
    const tremble = container.querySelector('[data-state="grace"] svg[data-layer="lit"]');
    expect(tremble?.getAttribute('class')).toContain('motion-safe:animate-thread-tremble');
    expect(tremble?.parentElement?.closest('svg')).toBeNull();
  });

  it('a new remaining moves the window and "now", and no path', () => {
    const { container, rerender } = render(<Thread state="active" remaining={0.5} knots={[0.1, 0.3]} />);
    const before = { d: ds(container), reveal: reveal(container), placed: placed(container) };
    expect(before.reveal).toEqual(['translateX(50%)', 'translateX(-50%)', 'translateX(0%)']);
    rerender(<Thread state="active" remaining={0.25} knots={[0.1, 0.3]} />);
    expect(ds(container)).toEqual(before.d);
    expect(placed(container)).toEqual(before.placed);
    expect(reveal(container)).toEqual(['translateX(75%)', 'translateX(-75%)', 'translateX(0%)']);
    expect(container.querySelector<HTMLElement>('[data-part="now-at"]')?.style.transform).toMatch(/^translate\(75%, /);
  });

  it('a new axis.now moves the window and "now", and no path', () => {
    const { container, rerender } = render(<Thread state="active" axis={AXIS} />);
    const before = { d: ds(container), reveal: reveal(container), placed: placed(container) };
    expect(before.reveal).toEqual(['translateX(25%)', 'translateX(-50%)', 'translateX(25%)']);
    rerender(<Thread state="active" axis={{ ...AXIS, now: 300n }} />);
    expect(ds(container)).toEqual(before.d);
    expect(placed(container)).toEqual(before.placed);
    expect(reveal(container)).toEqual(['translateX(50%)', 'translateX(-75%)', 'translateX(25%)']);
  });

  it('setRange moves only the window: "now", the pending knot and the marks stay where the props put them', () => {
    const ref = createRef<RevealWindowHandle>();
    const { container } = render(<Thread state="active" axis={AXIS} pendingKnot revealRef={ref} />);
    const nowAt = container.querySelector<HTMLElement>('[data-part="now-at"]');
    const before = { now: nowAt?.style.transform, placed: placed(container) };
    expect(before.now).toMatch(/^translate\(25%, /);
    act(() => ref.current?.setRange(50, 75, 'instant'));
    expect(reveal(container)).toEqual(['translateX(50%)', 'translateX(-75%)', 'translateX(25%)']);
    expect(nowAt?.style.transform).toBe(before.now);
    expect(nowAt?.querySelector('[data-part="pending"]')).not.toBeNull();
    expect(placed(container)).toEqual(before.placed);
  });

  it('has no filter and no drop-shadow, and nothing round inside an svg (it would stretch)', () => {
    for (const props of EVERY) {
      const { container, unmount } = render(<Thread {...props} />);
      expect(container.querySelectorAll('filter, circle, ellipse'), props.state).toHaveLength(0);
      for (const el of container.querySelectorAll('*')) {
        expect(el.hasAttribute('filter'), props.state).toBe(false);
        expect(el.getAttribute('class') ?? '', props.state).not.toMatch(/drop-shadow|blur|filter/);
        expect(el.getAttribute('style') ?? '', props.state).not.toMatch(/filter/);
      }
      unmount();
    }
  });

  it('stretches every svg to the box and keeps every stroke width', () => {
    for (const props of EVERY) {
      const { container, unmount } = render(<Thread {...props} />);
      expect(container.querySelectorAll('svg').length, props.state).toBeGreaterThanOrEqual(2);
      for (const svg of container.querySelectorAll('svg')) {
        expect(svg.getAttribute('preserveAspectRatio'), props.state).toBe('none');
      }
      for (const p of container.querySelectorAll('path')) {
        expect(p.getAttribute('vector-effect'), `${props.state} ${p.getAttribute('data-part')}`).toBe(
          'non-scaling-stroke',
        );
      }
      unmount();
    }
  });

  it('clips its layers at the root', () => {
    const { container } = render(<Thread state="releasedInherit" branches={[1, 1]} />);
    const root = container.querySelector('[data-thread]');
    expect(root?.getAttribute('class')?.split(/\s+/)).toEqual(expect.arrayContaining(['relative', 'overflow-clip']));
    expect(
      [...(root?.children ?? [])].map((e) => e.getAttribute('data-layer') ?? e.getAttribute('data-reveal')),
    ).toEqual(['base', 'outer', 'marks']);
  });

  it('gives predicted, pendingKnot and highlight each its own data attribute', () => {
    const plain = render(<Thread state="releasedInherit" branches={[5000, 3000, 2000]} />).container;
    const root = plain.querySelector('[data-thread]');
    for (const a of ['data-predicted', 'data-pending-knot', 'data-highlight'])
      expect(root?.hasAttribute(a), a).toBe(false);
    expect(plain.querySelector('[data-layer="marks"]')?.hasAttribute('data-highlight')).toBe(false);
    expect(plain.querySelector('[stroke-dasharray="5 5"]')).toBeNull();

    const told = render(
      <Thread state="releasedInherit" branches={[5000, 3000, 2000]} predicted highlight={1} />,
    ).container;
    const r = told.querySelector('[data-thread]');
    expect(r?.getAttribute('data-predicted')).toBe('true');
    expect(r?.getAttribute('data-highlight')).toBe('1');
    expect(told.querySelector('[data-layer="marks"]')?.getAttribute('data-highlight')).toBe('1');
    const branches = [...told.querySelectorAll('[data-part="branch"]')];
    for (const b of branches) expect(b.getAttribute('stroke-dasharray')).toBe('5 5');
    expect(branches[1].getAttribute('class')).toBe('stroke-thread');
    for (const i of [0, 2]) {
      expect(branches[i].getAttribute('class')).toBe('stroke-ink-muted');
      expect(branches[i].getAttribute('stroke-opacity')).toBe('0.35');
    }
    expect([...told.querySelectorAll('[data-part="dot"]')].map((d) => d.getAttribute('data-tone'))).toEqual([
      'muted',
      'highlight',
      'muted',
    ]);
    // The same paths: predicted and highlight change the style only.
    expect(ds(told)).toEqual(ds(plain));

    // data-highlight follows the prop in every state, on the root and on the marks; the styling needs a branch.
    for (const props of [
      { state: 'active', remaining: 0.5, highlight: 2 },
      { state: 'releasedInherit', branches: [1, 1], highlight: 2 },
    ] as ThreadProps[]) {
      const c = render(<Thread {...props} />).container;
      expect(c.querySelector('[data-thread]')?.getAttribute('data-highlight'), props.state).toBe('2');
      expect(c.querySelector('[data-layer="marks"]')?.getAttribute('data-highlight'), props.state).toBe('2');
      expect(c.querySelectorAll('[data-tone="highlight"], [data-tone="muted"]'), props.state).toHaveLength(0);
    }

    const grace = render(<Thread state="grace" remaining={0.5} predicted />).container;
    const fibers = grace.querySelectorAll('[data-part="fiber"], [data-part="fiber-course"]');
    expect(fibers).toHaveLength(6);
    for (const f of fibers) expect(f.getAttribute('stroke-dasharray')).toBe('5 5');

    const tying = render(<Thread state="active" remaining={0.5} pendingKnot />).container;
    expect(tying.querySelector('[data-thread]')?.getAttribute('data-pending-knot')).toBe('true');
    expect(tying.querySelectorAll('[data-part="now-at"] [data-part="pending"]')).toHaveLength(1);
  });

  it('beats faster as the deadline nears, and only while active', () => {
    const beat = (props: ThreadProps) =>
      render(<Thread {...props} />)
        .container.querySelector('svg[data-layer="glow"]')
        ?.getAttribute('data-beat') ?? null;
    expect(beat({ state: 'active', remaining: 0.8 })).toBe('slow');
    expect(beat({ state: 'active', remaining: 0.3 })).toBe('mid');
    expect(beat({ state: 'active', remaining: 0.05 })).toBe('fast');
    expect(beat({ state: 'grace', remaining: 0.05 })).toBeNull();
    expect(beat({ state: 'releasedInherit' })).toBeNull();
  });

  it('places the gate, its posts slot, the knots and the dots in percent of the box', () => {
    const { container } = render(
      <Thread state="releasedInherit" axis={{ ...AXIS, releaseAt: 300n }} branches={[1, 1]} />,
    );
    const gate = container.querySelector<HTMLElement>('[data-part="gate"]');
    expect([gate?.style.left, gate?.style.top]).toEqual(['50%', '42.5%']);
    expect(gate?.querySelector('[data-part="arch"]')).not.toBeNull();
    const knots = [...container.querySelectorAll<HTMLElement>('[data-part="knot"]')].map((k) => k.style.left);
    expect(knots).toEqual(['10%', '20%']);
    const dots = [...container.querySelectorAll<HTMLElement>('[data-part="dot"]')].map((d) => d.style.left);
    expect(dots).toEqual(['99%', '99%']);
  });

  it('prerenders the window where it rests, so the first paint is the final layout', () => {
    const html = renderToString(<Thread state="active" remaining={0.5} />);
    expect(html).toContain('transform:translateX(50%)');
    expect(html).toContain('data-beat="mid"');
  });
});

describe('RevealWindow', () => {
  it('shows [from, to] in place: three translations that sum to zero', () => {
    for (const [a, b] of [
      [0, 100],
      [25, 75],
      [12.5, 12.5],
      [80, 20],
      [-10, 140],
    ]) {
      const t = revealTransforms(a, b).map((s) => Number(/-?[\d.]+/.exec(s)?.[0]));
      expect(t[0] + t[1] + t[2], `${a} ${b}`).toBeCloseTo(0, 9);
    }
    expect(revealTransforms(25, 75)).toEqual(['translateX(25%)', 'translateX(-50%)', 'translateX(25%)']);
    expect(revealTransforms(80, 20)).toEqual(['translateX(80%)', 'translateX(-100%)', 'translateX(20%)']);
    expect(revealTransforms(-10, 140)).toEqual(['translateX(0%)', 'translateX(0%)', 'translateX(0%)']);
    expect(revealTransforms(Number.NaN, 50)).toEqual(['translateX(0%)', 'translateX(-50%)', 'translateX(50%)']);
  });

  it('moves with the spring only when motion is allowed', () => {
    expect(REVEAL_MOVE).toContain(`motion-safe:duration-[${SPRING_MS}ms]`);
    expect(REVEAL_MOVE.split(' ')).toEqual([
      'motion-safe:transition-transform',
      `motion-safe:duration-[${SPRING_MS}ms]`,
      'motion-safe:ease-spring',
    ]);
    const { container } = render(
      <RevealWindow from={10} to={90}>
        <i />
      </RevealWindow>,
    );
    for (const n of ['outer', 'middle', 'inner']) {
      expect(container.querySelector(`[data-reveal="${n}"]`)?.getAttribute('class')).toContain(REVEAL_MOVE);
    }
  });

  it('setRange moves the window without a React render, and the next props take it back', () => {
    stubReduced(false);
    const ref = createRef<RevealWindowHandle>();
    const { container, rerender } = render(
      <RevealWindow from={0} to={100} ref={ref}>
        <Count />
      </RevealWindow>,
    );
    const seen = renders;
    act(() => ref.current?.setRange(30, 60, 'instant'));
    expect(renders).toBe(seen);
    expect(reveal(container)).toEqual(['translateX(30%)', 'translateX(-70%)', 'translateX(40%)']);
    const outer = container.querySelector<HTMLElement>('[data-reveal="outer"]');
    expect(outer?.style.transition).toBe('none');
    act(() => ref.current?.setRange(30, 60, { linear: 600 }));
    expect(outer?.style.transition).toBe('transform 600ms linear');
    act(() => ref.current?.setRange(40, 60));
    expect(outer?.style.transition).toBe('');
    rerender(
      <RevealWindow from={50} to={100} ref={ref}>
        <Count />
      </RevealWindow>,
    );
    expect(reveal(container)).toEqual(['translateX(50%)', 'translateX(-50%)', 'translateX(0%)']);
    expect(outer?.style.transition).toBe('');
  });

  it('jumps under reduced motion, whatever the move asks', () => {
    stubReduced(true);
    const ref = createRef<RevealWindowHandle>();
    const { container } = render(
      <RevealWindow from={0} to={100} ref={ref}>
        <i />
      </RevealWindow>,
    );
    act(() => ref.current?.setRange(20, 80, { linear: 600 }));
    expect(container.querySelector<HTMLElement>('[data-reveal="outer"]')?.style.transition).toBe('none');
    act(() => ref.current?.setRange(20, 80));
    expect(container.querySelector<HTMLElement>('[data-reveal="outer"]')?.style.transition).toBe('none');
  });
});
```

Run: `npm test -w apps/web -- thread.test thread-layers`
Expected: FAIL (`Failed to resolve import "../../src/thread/state-badge"` và `Failed to resolve import "../../src/motion/reveal-window"`).

- [ ] **Step 4: Viết `RevealWindow`, `Thread` và `StateBadge`**

`apps/web/src/motion/reveal-window.tsx`:

```tsx
'use client';

import { type ReactNode, type Ref, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/** How setRange moves the window: the spring (default), straight over `linear` ms, or at once (a drag). */
export type RevealMove = 'spring' | 'instant' | { linear: number };

export interface RevealWindowHandle {
  /** Moves the window to [from, to] (percent of the width) without a React render. Holds until the props move. */
  setRange(from: number, to: number, move?: RevealMove): void;
}

export interface RevealWindowProps {
  /** Left edge of what shows, percent of the width, 0–100. */
  from: number;
  /** Right edge of what shows, percent of the width, 0–100; below `from` it shows nothing. */
  to: number;
  children: ReactNode;
  ref?: Ref<RevealWindowHandle>;
  className?: string;
}

const pct = (n: number): number => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
const fix = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * The three translations that show [from, to] of the content in place: the outer box clips the left edge, the
 * middle box the right edge, the inner box puts the content back where it was. They sum to zero, so the content
 * never moves, also halfway through a transition (all three share one curve).
 */
export function revealTransforms(from: number, to: number): [string, string, string] {
  const a = pct(from);
  const b = Math.max(a, pct(to));
  return [`translateX(${fix(a)}%)`, `translateX(${fix(b - 100 - a)}%)`, `translateX(${fix(100 - b)}%)`];
}

/** The spring of globals.css over SPRING_MS (443 ms), only when motion is allowed; what moves with the window uses it. */
export const REVEAL_MOVE = 'motion-safe:transition-transform motion-safe:duration-[443ms] motion-safe:ease-spring';

function transitionOf(move: RevealMove): string {
  if (move === 'instant') return 'none';
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'none';
  }
  // An empty inline value hands the transition back to the REVEAL_MOVE classes.
  if (move === 'spring') return '';
  return `transform ${Math.max(0, move.linear)}ms linear`;
}

/**
 * The lit part of the Thread (R18.4): a window over its children that moves on the compositor only, by
 * `transform`. The path inside never changes, so a moving "now" or a drag never re-renders or re-lays out SVG.
 */
export function RevealWindow({ from, to, children, ref, className }: RevealWindowProps) {
  const outer = useRef<HTMLDivElement>(null);
  const middle = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [ta, tb, tc] = revealTransforms(from, to);

  // New props take the window back from setRange, with the spring again.
  useLayoutEffect(() => {
    const values = [ta, tb, tc];
    [outer, middle, inner].forEach((box, i) => {
      if (!box.current) return;
      box.current.style.transition = '';
      box.current.style.transform = values[i];
    });
  }, [ta, tb, tc]);

  useImperativeHandle(
    ref,
    () => ({
      setRange(f, t, move = 'spring') {
        const values = revealTransforms(f, t);
        const transition = transitionOf(move);
        [outer, middle, inner].forEach((box, i) => {
          if (!box.current) return;
          box.current.style.transition = transition;
          box.current.style.transform = values[i];
        });
      },
    }),
    [],
  );

  return (
    <div
      ref={outer}
      data-reveal="outer"
      className={cn('absolute inset-0 overflow-hidden', REVEAL_MOVE, className)}
      style={{ transform: ta }}
    >
      <div
        ref={middle}
        data-reveal="middle"
        className={cn('absolute inset-0 overflow-hidden', REVEAL_MOVE)}
        style={{ transform: tb }}
      >
        <div ref={inner} data-reveal="inner" className={cn('absolute inset-0', REVEAL_MOVE)} style={{ transform: tc }}>
          {children}
        </div>
      </div>
    </div>
  );
}
```

(Props đổi thì `useLayoutEffect` trả cửa sổ về cho props, kèm lại spring; `setRange` giữ vị trí của nó cho tới lúc đó. `setRange` đọc reduced motion ngay lúc gọi, vì transition inline thắng lớp `motion-safe:`.)

`apps/web/src/thread/thread.tsx`:

```tsx
'use client';

import { type ReactNode, type Ref, useMemo } from 'react';
import { cn } from '@/lib/cn';
import { REVEAL_MOVE, RevealWindow, type RevealWindowHandle } from '@/motion/reveal-window';
import { SharedThread } from '@/motion/view-transition';
import {
  MAIN_WIDTH,
  type Point,
  pctX,
  pctY,
  type ThreadBeat,
  type ThreadInput,
  type ThreadTone,
  threadGeometry,
  VIEW,
} from './geometry';
import { THREAD_COLOR, type ThreadState } from './state';

export interface ThreadProps extends ThreadInput {
  state: ThreadState;
  /** Makes the thread an image with this name; without it the thread is decoration next to a text label. */
  label?: string;
  /** Morph into the next page's thread (View Transitions). At most one shared thread per page. */
  shared?: boolean;
  /**
   * The lit part's window, for a caller that moves it every frame (a drag) without rendering. setRange moves only
   * the window: "now", the pending knot and every mark are props, and the caller re-renders them to move them.
   */
  revealRef?: Ref<RevealWindowHandle>;
  /** Size of the box: a width, and a height to change the 5:1 ratio. */
  className?: string;
}

const BOX = `0 0 ${VIEW.w} ${VIEW.h}`;
/** One loop of `thread-pulse` per beat (BEAT_SECONDS; globals.css has the three animations). */
const BEAT_CLASS: Record<ThreadBeat, string> = {
  slow: 'motion-safe:animate-thread-pulse',
  mid: 'motion-safe:animate-thread-pulse-mid',
  fast: 'motion-safe:animate-thread-pulse-fast',
};
const BRANCH_TONE: Record<ThreadTone, { stroke?: string; className?: string; opacity?: number }> = {
  plain: { stroke: 'currentColor' },
  highlight: { className: 'stroke-thread' },
  muted: { className: 'stroke-ink-muted', opacity: 0.35 },
};
const DOT_TONE: Record<ThreadTone, string> = {
  plain: 'bg-current',
  highlight: 'bg-thread',
  muted: 'bg-ink-muted/35',
};
const MARK = 'absolute -translate-x-1/2 -translate-y-1/2 rounded-full';

/** A point of the view as `left`/`top` percents of the box. */
const at = ([x, y]: Point) => ({ left: `${pctX(x)}%`, top: `${pctY(y)}%` });

/** A root SVG of the Thread: the view stretched to the box. Only the root itself ever animates. */
function Svg(p: { layer: 'base' | 'glow' | 'lit'; beat?: ThreadBeat; className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={BOX}
      preserveAspectRatio="none"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      data-layer={p.layer}
      data-beat={p.beat}
      className={cn('absolute inset-0 size-full overflow-visible', p.className)}
    >
      {p.children}
    </svg>
  );
}

/**
 * The one character of the visual language (spec §4.1, R18.4). Four layers in a clipped box: the course in an SVG
 * stretched to the box (`preserveAspectRatio="none"`, every stroke `non-scaling-stroke`); the lit part and its glow
 * in a RevealWindow; and HTML for everything round (the "now" point, knots, gate, dots), so nothing turns oval.
 * Only `transform` and `opacity` of a root element ever move.
 */
export function Thread({
  state,
  remaining,
  knots,
  branches,
  axis,
  predicted,
  pendingKnot,
  highlight,
  label,
  shared = false,
  revealRef,
  className,
}: ThreadProps) {
  const g = useMemo(
    () => threadGeometry(state, { remaining, knots, branches, axis, predicted, pendingKnot, highlight }),
    [state, remaining, knots, branches, axis, predicted, pendingKnot, highlight],
  );
  const dash = g.dash ?? undefined;
  // Set whenever the prop is, in every state; only the branch styling needs an index that names a branch.
  const highlighted = highlight !== undefined ? String(highlight) : undefined;

  const box = {
    'data-thread': '',
    'data-state': state,
    'data-predicted': predicted ? 'true' : undefined,
    'data-pending-knot': pendingKnot ? 'true' : undefined,
    'data-highlight': highlighted,
    className: cn('pointer-events-none relative aspect-[5/1] overflow-clip', THREAD_COLOR[state], className),
  };

  const layers = (
    <>
      <Svg layer="base">
        {g.track ? (
          <path
            d={g.track}
            className="stroke-line"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            data-part="track"
          />
        ) : null}
        {g.fibers.map((d) => (
          <path
            key={d}
            d={d}
            className="stroke-line"
            strokeWidth={1.25}
            strokeDasharray={dash}
            vectorEffect="non-scaling-stroke"
            data-part="fiber-course"
          />
        ))}
        {g.ghost ? (
          <path
            d={g.ghost}
            stroke="currentColor"
            strokeOpacity={0.4}
            strokeWidth={1.5}
            strokeDasharray="1 7"
            vectorEffect="non-scaling-stroke"
            data-part="ghost"
          />
        ) : null}
        {g.branches.map((b) => {
          const tone = BRANCH_TONE[b.tone];
          return (
            <path
              key={b.d}
              d={b.d}
              stroke={tone.stroke}
              className={tone.className}
              strokeOpacity={tone.opacity}
              strokeWidth={b.width}
              strokeDasharray={dash}
              vectorEffect="non-scaling-stroke"
              data-part="branch"
              data-tone={b.tone}
            />
          );
        })}
        {g.curl ? (
          <path
            d={g.curl}
            stroke="currentColor"
            strokeWidth={MAIN_WIDTH}
            vectorEffect="non-scaling-stroke"
            data-part="curl"
          />
        ) : null}
      </Svg>

      <RevealWindow from={pctX(g.litFrom)} to={pctX(g.litTo)} ref={revealRef}>
        {g.beat ? (
          <Svg layer="glow" beat={g.beat} className={cn('opacity-25', BEAT_CLASS[g.beat])}>
            <path d={g.lit} stroke="currentColor" strokeWidth={10} vectorEffect="non-scaling-stroke" data-part="glow" />
          </Svg>
        ) : null}
        <Svg layer="lit" className={state === 'grace' ? 'motion-safe:animate-thread-tremble' : undefined}>
          <path
            d={g.lit}
            stroke="currentColor"
            strokeWidth={MAIN_WIDTH}
            vectorEffect="non-scaling-stroke"
            data-part="lit"
          />
          {g.fibers.map((d) => (
            <path
              key={d}
              d={d}
              stroke="currentColor"
              strokeWidth={1.25}
              strokeOpacity={0.75}
              strokeDasharray={dash}
              vectorEffect="non-scaling-stroke"
              data-part="fiber"
            />
          ))}
        </Svg>
      </RevealWindow>

      <div data-layer="marks" data-highlight={highlighted} className="absolute inset-0">
        {g.gate ? (
          // The slot of the guardians' posts (Plan 7B): they go inside this box, next to the arch.
          <span
            data-part="gate"
            className="absolute block aspect-[12/25] h-[42%] -translate-x-1/2 -translate-y-1/2"
            style={at(g.gate)}
          >
            <span data-part="arch" className="absolute inset-0 rounded-t-full border-2 border-ink-muted border-b-0" />
          </span>
        ) : null}
        {g.knots.map((k) => (
          <span
            key={`${k[0]}-${k[1]}`}
            data-part="knot"
            className={cn(MARK, 'size-2.5 border-2 border-current bg-bg')}
            style={at(k)}
          />
        ))}
        {g.dots.map((dot) => (
          <span
            key={`${dot.at[0]}-${dot.at[1]}`}
            data-part="dot"
            data-tone={dot.tone}
            className={cn(MARK, 'size-2', DOT_TONE[dot.tone])}
            style={at(dot.at)}
          />
        ))}
        {g.now ? (
          // "Now" rides a box as large as the root, moved by translate in percent of the root: it moves with the
          // window, on the compositor, with the same spring.
          <span
            data-part="now-at"
            className={cn('absolute inset-0', REVEAL_MOVE)}
            style={{ transform: `translate(${pctX(g.now[0])}%, ${pctY(g.now[1])}%)` }}
          >
            <span
              data-part="halo"
              className={cn(
                MARK,
                'top-0 left-0 size-8 bg-[radial-gradient(closest-side,currentColor,transparent)] opacity-40',
              )}
            />
            <span data-part="now" className={cn(MARK, 'top-0 left-0 size-3 bg-current')} />
            {g.pending ? (
              <span
                data-part="pending"
                className={cn(MARK, 'top-0 left-0 size-5 border-2 border-current border-dashed')}
              />
            ) : null}
          </span>
        ) : null}
      </div>
    </>
  );

  // With a label the box is one image; without, it is decoration next to a text label.
  const root = label ? (
    <div role="img" aria-label={label} {...box}>
      {layers}
    </div>
  ) : (
    <div aria-hidden="true" {...box}>
      {layers}
    </div>
  );
  return shared ? <SharedThread>{root}</SharedThread> : root;
}
```

`apps/web/src/thread/state-badge.tsx`:

```tsx
'use client';

import { m } from 'motion/react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as labels, THREAD_STATE_KEY } from '@/messages/labels.messages';
import { usePrefersReducedMotion } from '@/motion/provider';
import { DURATION, EASE_OUT_EXPO, sec } from '@/motion/tokens';
import { StateGlyph } from './glyphs';
import { BADGE_COLOR, STATE_GLYPH, type ThreadState } from './state';

export interface StateBadgeProps {
  state: ThreadState;
  /** Adds a "Drill" chip. */
  drill?: boolean;
  size?: 'sm' | 'md';
  /** Announce state changes politely (the vault page, where the state can change while the user reads). */
  live?: boolean;
  className?: string;
}

/** The vault state in words, glyph and colour; the glyph and words alone are enough (spec §4.1). */
export function StateBadge({ state, drill = false, size = 'md', live = false, className }: StateBadgeProps) {
  const t = useT(labels);
  const calm = usePrefersReducedMotion();
  return (
    <span
      data-state={state}
      aria-live={live ? 'polite' : undefined}
      aria-atomic={live ? true : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
        size === 'sm' ? 'h-6 px-2 text-caption' : 'h-8 px-3 text-small',
        BADGE_COLOR[state],
        className,
      )}
    >
      <m.span
        key={state}
        className="inline-flex items-center gap-1.5"
        initial={calm ? { opacity: 0 } : { opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: sec(calm ? 120 : DURATION.base), ease: EASE_OUT_EXPO }}
      >
        <StateGlyph name={STATE_GLYPH[state]} size={size === 'sm' ? 14 : 16} />
        <span>{t(THREAD_STATE_KEY[state])}</span>
      </m.span>
      {drill ? (
        <span className="ml-0.5 inline-flex items-center gap-1 rounded-full bg-surface-3 px-1.5 text-caption text-ink-muted">
          <StateGlyph name="drill" size={12} />
          {t('drill')}
        </span>
      ) : null}
    </span>
  );
}
```

(Badge chỉ có hiệu ứng vào khi đổi trạng thái: `key={state}` làm React gắn phần tử mới; không có hiệu ứng ra, nên không bao giờ hai nhãn chồng nhau.)

Run: `npm test -w apps/web -- thread`
Expected: PASS (thread-geometry 34, thread 13, thread-layers 15).

- [ ] **Step 5: Chạy test, typecheck, Biome và commit**

```bash
npm test -w apps/web -- thread
npm test -w apps/web -- motion
npm run typecheck -w apps/web
npx biome ci .
git add apps/web/src/thread/geometry.ts apps/web/src/thread/state.ts apps/web/src/thread/glyphs.tsx apps/web/src/thread/thread.tsx apps/web/src/thread/state-badge.tsx
git add apps/web/src/motion/reveal-window.tsx apps/web/src/app/globals.css
git add apps/web/test/unit/thread-geometry.test.ts apps/web/test/unit/thread.test.tsx apps/web/test/unit/thread-layers.test.tsx
git commit -m "feat(web): the Thread on the compositor with a time axis, its state glyphs and the StateBadge" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: PASS (thread-geometry 34, thread 13, thread-layers 15; `motion` vẫn xanh vì `--ease-spring` và `atro-shake` không đổi). Lỗi Biome về format hay thứ tự import sửa bằng `npx biome check --write <đường dẫn>`.

**Ghi chú cho Task 15 (e2e).** Task 7 không đòi sửa `motion.spec.ts`: test "without reduced motion the thread breathes" vẫn tìm animation `thread-pulse` trên `/`, giờ nằm trên `<svg data-layer="glow">` gốc của hero (`remaining={0.72}` cho nhịp `slow`), và `runningAnimations` in ra dạng `thread-pulse on svg.absolute.inset-0.size-full`. Test reduced motion vẫn phải ra mảng rỗng: mọi transition của `RevealWindow` và của "bây giờ" nằm sau `motion-safe:`, và lúc nghỉ không có transition nào chạy. Trong danh sách "Lỗi thường gặp" của Task 15, ví dụ `thread-tremble on path.…` giờ là `thread-tremble on svg.…`.

---

### Task 8: Bộ primitive và `Providers`

**Files:**
- Create: `apps/web/src/ui/{visually-hidden,spinner,button,icon-button,tooltip,popover,dialog,copy-button,untrusted-text,external-link,address,amount,countdown,skeleton,empty-state,inline-error,banner,text-field,qr-code}.tsx`, `apps/web/src/ui/identicon.ts`, `apps/web/src/lib/use-now.ts`, `apps/web/src/shell/providers.tsx`
- Test: `apps/web/test/unit/primitives.test.tsx`, `apps/web/test/unit/ssr.test.tsx`, `apps/web/test/unit/next-config.test.ts`
- Modify: `apps/web/src/app/layout.tsx`, `apps/web/src/messages/ui.messages.ts` (khoá `copyFailed`), `apps/web/test/helpers/render.tsx`, `apps/web/test/setup.ts` (jest-dom, R13), `apps/web/next.config.mjs` (bỏ trang chỉ có lúc dev), `apps/web/test/build/output.test.ts` (tên test), `apps/web/package.json`, `package-lock.json`

**Interfaces:**
- Consumes: Task 3 (token, `atro-*`), Task 5 (`useT`, `KVProvider`, `ThemeProvider`, `LangProvider`, `addressGroups`, `isAddressText`, `formatAmount`, `formatRemaining`, `formatTimestamp`, `chainNow`, `explorerAddress`, `explorerName`, `untrusted`, `useMounted`, `cn`), Task 6 (`MotionProvider`, token), Task 7 (`StateGlyph`).
- Produces (mọi file `'use client'`):
  - `ui/visually-hidden.tsx`: `VisuallyHidden` (Radix `Root`).
  - `ui/spinner.tsx`: `Spinner({ label?, size?, className? })`.
  - `ui/button.tsx`: `type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'`; `type ButtonSize = 'sm' | 'md' | 'lg'`; `buttonClass(o?: { variant?; size?; className? }): string`; `interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?; size?; loading?: boolean; icon?: ReactNode; ref?: Ref<HTMLButtonElement> }`; `Button(props)`.
  - `ui/icon-button.tsx`: `IconButton({ icon: LucideIcon, label: string, size?: 'sm' | 'md', tooltip?: boolean, ...button })`.
  - `ui/tooltip.tsx`: `TooltipProvider({ children })`; `Tooltip({ content: ReactNode, children: ReactElement, side? })`.
  - `ui/popover.tsx`: `Popover({ trigger: ReactElement, children, open?, onOpenChange?, align?, side?, label?, className? })`; `PopoverClose` (Radix `Close`).
  - `ui/dialog.tsx`: `interface DialogProps { open?; onOpenChange?(open: boolean): void; trigger?: ReactElement; title: ReactNode; description?: ReactNode; children?: ReactNode; size?: 'sm' | 'md' | 'lg'; sheet?: boolean; className? }`; `Dialog(props)` (sheet dưới đáy màn hình hẹp, hộp giữa màn hình từ 40rem). Overlay `atro-overlay`: dưới 48rem là `bg-bg/95`, không blur; từ 48rem là `bg-bg/70` với `backdrop-blur-[3px]` (spec §18.4.1).
  - `ui/copy-button.tsx`: `copyText(text: string): Promise<boolean>`; `CopyButton({ text, label, showText?, className? })`.
  - `ui/untrusted-text.tsx`: `isUntrusted(v: unknown): v is Untrusted`; `UntrustedText({ value: unknown, max?: number, className? })` (render trong `<bdi>`).
  - `ui/external-link.tsx`: `safeExternalHref(href: string): string | null`; `ExternalLink({ href, children, icon?, variant?: 'inline' | 'icon', className? })` (`icon`: nút tròn chỉ có mũi tên, `children` thành nhãn ẩn; deweb: chữ thường lúc prerender và hydrate, Quyết định 16).
  - `ui/identicon.ts`: `interface IdenticonData { hue: number; cells: boolean[] }`; `identiconOf(address: string): IdenticonData`.
  - `ui/address.tsx`: `Avatar({ address, size? })`; `Address({ address, explorer?, copy?, avatar?, size?, className? })` (luôn đủ 40 ký tự, theo cụm 4).
  - `ui/amount.tsx`: `Amount({ raw: bigint, decimals: number | null, symbol?: Untrusted | string | null, maxFraction?, className? })`.
  - `lib/use-now.ts`: `useNow(intervalMs?: number): number | null`. `ui/countdown.tsx`: `Countdown({ target: bigint, blockTimestamp: bigint, fetchedAtMs: number, className? })`.
  - `ui/skeleton.tsx`: `Skeleton({ className? })`, `SkeletonText({ lines?, className? })`. `ui/empty-state.tsx`: `EmptyState({ title, body?, action?, icon?, className? })`. `ui/inline-error.tsx`: `InlineError({ id?, children, className? })`. `ui/banner.tsx`: `type BannerTone = 'info' | 'warn' | 'error' | 'success'`; `Banner({ tone?, title?, children, action?, onDismiss?, testId?, className? })`.
  - `ui/text-field.tsx`: `interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> { label: ReactNode; hint?: ReactNode; error?: ReactNode; mono?: boolean; ref?: Ref<HTMLInputElement> }`; `TextField(props)`.
  - `ui/qr-code.tsx`: `qrPath(data: readonly (readonly boolean[])[]): string`; `QrCode({ value, label, size?, className? })` (màu cố định `#0B0D12` trên `#FFFDF8` ở cả hai theme để máy quét đọc chắc).
  - `shell/providers.tsx`: `Providers({ children, kv?: KV })` = KV → Lang → Theme → Motion → Tooltip. Task 10 thêm Query, Task 11 thêm Wallet.
  - `test/helpers/render.tsx` bọc KV → Lang → Theme → Tooltip (không bọc `MotionProvider`: nó nạp feature bất đồng bộ; `m.*` vẫn render đúng trạng thái đầu).
  - `test/setup.ts` nạp `@testing-library/jest-dom/vitest` (R13), nên mọi test unit có matcher của jest-dom (`toHaveClass`, `toBeInTheDocument`, `toHaveAttribute`, `toHaveValue`, `toBeChecked`, `toBeDisabled`, `toHaveTextContent`, …), cả về kiểu lẫn lúc chạy. Bảy file test của Plan 7B dựa vào điều này.
  - `next.config.mjs` không còn tham số `phase` và không có trang chỉ có lúc dev.

- [ ] **Step 1: Cài Radix, Lucide, uqr và jest-dom; thêm `Providers`**

```bash
npm install -E -w apps/web @radix-ui/react-dialog@1.3.1 @radix-ui/react-popover@1.3.1 @radix-ui/react-tooltip@1.4.1 @radix-ui/react-visually-hidden@1.2.13 lucide-react@1.73.0 uqr@0.1.3
npm run lockfile:check -- --fix
npm run lockfile:check
```

Expected: `every dependency resolves.`

Ruling R13: Plan 7B có bảy file test dùng matcher của jest-dom, nhưng không plan nào cài gói này. Bản 8.0.0 ra ngày 19/11/2026, chưa đủ 7 ngày, và có peer `vitest >=5 <6` trong khi repo dùng vitest 3.2.7, nên dùng bản 7.0.1 (ra ngày 9/8/2026; peer `vitest >= 0.32`, `@testing-library/dom >=10 <11`):

```bash
npm view @testing-library/jest-dom time --json | grep '"7.0.1"'
npm install -E -D -w apps/web @testing-library/jest-dom@7.0.1
npm run lockfile:check -- --fix
npm run lockfile:check
```

Expected: dòng đầu in `"7.0.1": "2026-08-09T23:44:33.598Z",`; lệnh cuối in `every dependency resolves.`; `apps/web/package.json` có `"@testing-library/jest-dom": "7.0.1"` trong `devDependencies`.

Thêm dòng này làm dòng đầu tiên của `apps/web/test/setup.ts` (phần còn lại của file giữ nguyên):

```ts
import '@testing-library/jest-dom/vitest';
```

`test/setup.ts` nằm trong `include` của `tsconfig.json` (`"test"`), nên `npm run typecheck` thấy kiểu của các matcher.

Thêm khoá vào `apps/web/src/messages/ui.messages.ts`: trong `en`, sau `copyText: 'Copy {what}',` thêm `copyFailed: 'Could not copy',`; trong `vi`, sau `copyText: 'Sao chép {what}',` thêm `copyFailed: 'Không sao chép được',`.

`apps/web/src/ui/visually-hidden.tsx`:

```tsx
'use client';

export { Root as VisuallyHidden } from '@radix-ui/react-visually-hidden';
```

`apps/web/src/ui/tooltip.tsx`:

```tsx
'use client';

import * as T from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <T.Provider delayDuration={350} skipDelayDuration={150}>
      {children}
    </T.Provider>
  );
}

/** A label on hover and on keyboard focus. The trigger must be focusable (a button or a link). */
export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: ReactNode;
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="atro-pop z-50 max-w-xs rounded-lg border border-line bg-surface-3 px-2.5 py-1.5 text-caption text-ink shadow-lg"
        >
          {content}
          <T.Arrow className="fill-surface-3" width={10} height={5} />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
```

`apps/web/src/shell/providers.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { LangProvider } from '@/i18n/provider';
import { KVProvider } from '@/lib/kv';
import type { KV } from '@/lib/store';
import { MotionProvider } from '@/motion/provider';
import { ThemeProvider } from '@/theme/provider';
import { TooltipProvider } from '@/ui/tooltip';

/** Every page renders inside these, in this order (storage first: language and theme read it). */
export function Providers({ children, kv }: { children: ReactNode; kv?: KV }) {
  return (
    <KVProvider kv={kv}>
      <LangProvider>
        <ThemeProvider>
          <MotionProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </MotionProvider>
        </ThemeProvider>
      </LangProvider>
    </KVProvider>
  );
}
```

Sửa `apps/web/src/app/layout.tsx` (Task 9 thay bằng khung đầy đủ):

```tsx
import type { ReactNode } from 'react';
import { fontVariables } from '@/fonts';
import { Providers } from '@/shell/providers';
import './globals.css';

export const metadata = { title: 'Atropyle', description: 'Inheritance and wallet recovery on X Layer.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Sửa `apps/web/test/helpers/render.tsx`:

```tsx
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { Lang } from '@/i18n/core';
import { LangProvider } from '@/i18n/provider';
import { KVProvider } from '@/lib/kv';
import { KEYS, type KV, memoryKV } from '@/lib/store';
import { ThemeProvider } from '@/theme/provider';
import { TooltipProvider } from '@/ui/tooltip';

/**
 * The providers of every page except MotionProvider, which loads its features asynchronously; `m.*` elements still
 * render their first state without it. `rerender` keeps the providers.
 */
export function renderWithProviders(ui: ReactElement, o: { kv?: KV; lang?: Lang } = {}) {
  const kv = o.kv ?? memoryKV();
  if (o.lang) kv.set(KEYS.lang, o.lang);
  const wrap = (node: ReactElement) => (
    <KVProvider kv={kv}>
      <LangProvider>
        <ThemeProvider>
          <TooltipProvider>{node}</TooltipProvider>
        </ThemeProvider>
      </LangProvider>
    </KVProvider>
  );
  const r = render(wrap(ui));
  return { ...r, kv, rerender: (next: ReactElement) => r.rerender(wrap(next)) };
}
```

- [ ] **Step 2: Viết test hỏng cho các primitive**

`apps/web/test/unit/primitives.test.tsx`:

```tsx
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { encode } from 'uqr';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { untrusted } from '../../src/lib/untrusted';
import { Address } from '../../src/ui/address';
import { Amount } from '../../src/ui/amount';
import { Banner } from '../../src/ui/banner';
import { Button, buttonClass } from '../../src/ui/button';
import { CopyButton } from '../../src/ui/copy-button';
import { Countdown } from '../../src/ui/countdown';
import { Dialog } from '../../src/ui/dialog';
import { ExternalLink, safeExternalHref } from '../../src/ui/external-link';
import { identiconOf } from '../../src/ui/identicon';
import { QrCode, qrPath } from '../../src/ui/qr-code';
import { Skeleton } from '../../src/ui/skeleton';
import { TextField } from '../../src/ui/text-field';
import { UntrustedText } from '../../src/ui/untrusted-text';
import { renderWithProviders } from '../helpers/render';

const A = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('Button', () => {
  it('is a plain button by default and busy while loading', () => {
    const { rerender } = renderWithProviders(<Button>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b.getAttribute('type')).toBe('button');
    rerender(<Button loading>Save</Button>);
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('gives links the same look', () => {
    expect(buttonClass({ variant: 'primary' })).toContain('bg-thread');
    expect(buttonClass({ variant: 'danger', size: 'lg' })).toContain('text-on-danger');
  });
});

describe('UntrustedText', () => {
  it('renders markup as text and truncates', () => {
    const evil = `<img src=x onerror="window.__pwned=1">${'A'.repeat(10_000)}`;
    const { container } = renderWithProviders(<UntrustedText value={evil} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent?.startsWith('<img src=x onerror=')).toBe(true);
    expect(Array.from(container.textContent ?? '').length).toBe(65);
    expect((globalThis as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('strips bidi and zero-width characters and isolates the direction', () => {
    const { container } = renderWithProviders(<UntrustedText value={'USD\u{202E}evil\u{200B}'} />);
    expect(container.textContent).toBe('USDevil');
    expect(container.querySelector('bdi')).not.toBeNull();
  });

  it('accepts an Untrusted value from the SDK and re-cleans it', () => {
    const { container } = renderWithProviders(
      <UntrustedText value={{ ...untrusted('Tether'), value: 'Te\u{200B}ther' }} />,
    );
    expect(container.textContent).toBe('Tether');
  });
});

describe('ExternalLink', () => {
  it('accepts only http and https', () => {
    expect(safeExternalHref('https://www.oklink.com/xlayer')).toBe('https://www.oklink.com/xlayer');
    expect(safeExternalHref('javascript:alert(1)')).toBeNull();
    expect(safeExternalHref('data:text/html,x')).toBeNull();
    expect(safeExternalHref('/relative')).toBeNull();
  });

  it('opens a new tab without an opener once mounted', () => {
    renderWithProviders(<ExternalLink href="https://web3.okx.com/xlayer">X Layer</ExternalLink>);
    const a = screen.getByRole('link', { name: /X Layer/ });
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.textContent).toContain('(opens in a new tab)');
  });

  it('never becomes a link for a refused URL', () => {
    const refused = 'javascript:alert(1)';
    renderWithProviders(<ExternalLink href={refused}>bad</ExternalLink>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('bad').getAttribute('data-external')).toBe('refused');
  });
});

describe('CopyButton', () => {
  it('copies and says so, then resets', async () => {
    // Only the timers the button uses: React's async act needs real microtasks and setImmediate.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderWithProviders(<CopyButton text={A} label="Copy address" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    });
    expect(writeText).toHaveBeenCalledWith(A);
    expect(screen.getByText('Copied')).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText('Copied')).toBeNull();
  });

  it('says when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    renderWithProviders(<CopyButton text="x" label="Copy" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(screen.getByText('Could not copy')).toBeTruthy();
  });
});

describe('Address', () => {
  it('shows the whole address in groups of four, never shortened', () => {
    const { container } = renderWithProviders(<Address address={A} />);
    const text = container.querySelector('[translate="no"]')?.textContent;
    expect(text).toBe(A);
    expect(container.querySelector('[data-address]')?.getAttribute('data-address')).toBe(A);
    expect(container.querySelectorAll('[translate="no"] > span')).toHaveLength(11);
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeTruthy();
  });

  it('links to the explorer', () => {
    renderWithProviders(<Address address={A} explorer="https://www.oklink.com/xlayer" />);
    const a = screen.getByRole('link', { name: /View on OKLink/ });
    expect(a.getAttribute('href')).toBe(`https://www.oklink.com/xlayer/address/${A}`);
  });

  it('draws a mirrored identicon that ignores letter case', () => {
    const id = identiconOf(A);
    expect(identiconOf(A.toLowerCase())).toEqual(id);
    expect(id.cells).toHaveLength(25);
    for (let row = 0; row < 5; row++) {
      expect(id.cells[row * 5]).toBe(id.cells[row * 5 + 4]);
      expect(id.cells[row * 5 + 1]).toBe(id.cells[row * 5 + 3]);
    }
    expect(id.hue).toBeGreaterThanOrEqual(0);
    expect(id.hue).toBeLessThan(360);
    expect(identiconOf('0x0000000000000000000000000000000000000001')).not.toEqual(id);
    expect(() => identiconOf('not hex')).not.toThrow();
  });
});

describe('Amount', () => {
  it('formats with the token symbol and keeps the raw value', () => {
    renderWithProviders(<Amount raw={1_234_567_890n} decimals={6} symbol={untrusted('USDC')} />);
    const b = screen.getByRole('button', { name: /1,234\.56789/ });
    expect(b.textContent).toContain('USDC');
    expect(b.getAttribute('data-raw')).toBe('1234567890');
  });

  it('says "base units" when the token has no decimals', () => {
    renderWithProviders(<Amount raw={5n} decimals={null} symbol="NFT" />);
    expect(screen.getByRole('button').textContent).toContain('base units');
  });
});

describe('Countdown', () => {
  it('counts down in chain time and turns into "ago"', () => {
    vi.useFakeTimers();
    const fetchedAtMs = Date.now();
    renderWithProviders(<Countdown target={1090n} blockTimestamp={1000n} fetchedAtMs={fetchedAtMs} />);
    const time = () => document.querySelector('time');
    expect(time()?.textContent).toBe('in 1m 30s');
    act(() => vi.advanceTimersByTime(30_000));
    expect(time()?.textContent).toBe('in 1m');
    act(() => vi.advanceTimersByTime(100_000));
    expect(time()?.textContent).toBe('40s ago');
    expect(time()?.getAttribute('data-past')).toBe('true');
  });

  it('survives a timestamp no date can hold', () => {
    renderWithProviders(<Countdown target={2n ** 200n} blockTimestamp={1n} fetchedAtMs={0} />);
    expect(document.querySelector('time')?.getAttribute('datetime')).toBeNull();
  });
});

describe('Banner', () => {
  it('interrupts only for errors and can be dismissed', () => {
    const onDismiss = vi.fn();
    const { rerender } = renderWithProviders(<Banner tone="info">Note</Banner>);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(
      <Banner tone="error" onDismiss={onDismiss}>
        Broken
      </Banner>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Broken');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe('Dialog', () => {
  it('opens from its trigger with a title, and closes with Escape', async () => {
    renderWithProviders(
      <Dialog trigger={<Button>Open</Button>} title="Choose a wallet" description="Pick one.">
        <p>Body</p>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose a wallet' });
    expect(dialog.textContent).toContain('Body');
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the page behind a phone sheet solid and blurs it only from 48rem', async () => {
    renderWithProviders(
      <Dialog open title="Choose a wallet">
        <p>Body</p>
      </Dialog>,
    );
    await screen.findByRole('dialog', { name: 'Choose a wallet' });
    const overlay = document.querySelector('.atro-overlay');
    // Spec §18.4.1: backdrop-filter on a full-screen layer costs a phone GPU on every frame of the sheet animation.
    expect(overlay).toHaveClass('bg-bg/95', 'md:bg-bg/70', 'md:backdrop-blur-[3px]');
    expect(overlay).not.toHaveClass('bg-bg/70');
    expect(overlay).not.toHaveClass('backdrop-blur-[3px]');
  });
});

describe('TextField', () => {
  it('labels the input and links its hint and error', () => {
    renderWithProviders(<TextField label="Vault address" hint="0x and 40 characters" error="Not an address" mono />);
    const input = screen.getByLabelText('Vault address');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      '0x and 40 characters',
      'Not an address',
    ]);
  });
});

describe('QrCode', () => {
  it('draws one square per dark module, labelled', () => {
    expect(
      qrPath([
        [true, false],
        [false, true],
      ]),
    ).toBe('M0 0h1v1h-1zM1 1h1v1h-1z');
    const value = `https://atropyle.app/vault/#${A}`;
    renderWithProviders(<QrCode value={value} label="this page" />);
    const svg = screen.getByRole('img', { name: 'QR code for this page' });
    const dark = encode(value, { ecc: 'M', border: 2 }).data.flat().filter(Boolean).length;
    expect(svg.querySelector('path')?.getAttribute('d')?.match(/M/g)).toHaveLength(dark);
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive technology and shimmers only with motion allowed', () => {
    const { container } = renderWithProviders(<Skeleton className="h-4 w-24" />);
    const root = container.firstElementChild;
    expect(root?.getAttribute('aria-hidden')).toBe('true');
    expect(container.innerHTML).toContain('motion-safe:animate-shimmer');
  });
});
```

`apps/web/test/unit/ssr.test.tsx` (prerender, Quyết định 16):

```tsx
// @vitest-environment node
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LangProvider } from '../../src/i18n/provider';
import { KVProvider } from '../../src/lib/kv';
import { memoryKV } from '../../src/lib/store';
import { Address } from '../../src/ui/address';
import { ExternalLink } from '../../src/ui/external-link';
import { TooltipProvider } from '../../src/ui/tooltip';

const html = (node: ReactNode) =>
  renderToString(
    <KVProvider kv={memoryKV()}>
      <LangProvider>
        <TooltipProvider>{node}</TooltipProvider>
      </LangProvider>
    </KVProvider>,
  );

describe('prerendered HTML of the deweb build', () => {
  it('has no external link in it, only text', () => {
    const out = html(<ExternalLink href="https://github.com/duongnq2798/atropyle">Source code</ExternalLink>);
    expect(out).toContain('Source code');
    expect(out).not.toContain('<a');
    expect(out).not.toContain('github.com');
  });

  it('does not link an address to the explorer before the page runs', () => {
    const out = html(
      <Address address="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" explorer="https://www.oklink.com/xlayer" />,
    );
    expect(out).not.toContain('oklink.com');
  });
});
```

Run: `npm test -w apps/web -- primitives ssr`
Expected: FAIL, không tìm thấy `../../src/ui/address` (trong `src/ui/` mới có `hold-button`, `visually-hidden` và `tooltip`).

- [ ] **Step 3: Viết các primitive**

`apps/web/src/ui/spinner.tsx`:

```tsx
'use client';

import { cn } from '@/lib/cn';
import { VisuallyHidden } from './visually-hidden';

/** An arc that turns while motion is allowed; under reduced motion it stays still. */
export function Spinner({ label, size = 16, className }: { label?: string; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        className="motion-safe:animate-spin"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.5} />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
      </svg>
      {label ? <VisuallyHidden>{label}</VisuallyHidden> : null}
    </span>
  );
}
```

`apps/web/src/ui/button.tsx`:

```tsx
'use client';

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium ' +
  'transition-[background-color,border-color,color,translate,scale] duration-150 ease-out-expo ' +
  'motion-safe:active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-50';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-thread text-on-thread shadow-[inset_0_1px_0_0_rgb(255_255_255/0.18)] hover:bg-thread/90',
  secondary: 'border border-line-strong bg-surface-2 text-ink hover:border-thread hover:bg-surface-3',
  ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger text-on-danger hover:bg-danger/90',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-small',
  md: 'h-10 px-4 text-small',
  lg: 'h-12 px-6 text-body',
};

/** The button look, for links that act as buttons (`<Link className={buttonClass(...)}>`). */
export function buttonClass(o: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(BASE, VARIANT[o.variant ?? 'secondary'], SIZE[o.size ?? 'md'], o.className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Disables the button and shows a spinner in place of the icon. */
  loading?: boolean;
  icon?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant,
  size,
  loading = false,
  icon,
  disabled,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, className })}
    >
      {loading ? (
        <Spinner size={16} />
      ) : icon ? (
        <span className="inline-flex shrink-0 [&>svg]:size-4">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
```

`apps/web/src/ui/icon-button.tsx`:

```tsx
'use client';

import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from '@/lib/cn';
import { Tooltip } from './tooltip';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** The accessible name, also shown as a tooltip. */
  label: string;
  size?: 'sm' | 'md';
  tooltip?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton({
  icon: Icon,
  label,
  size = 'md',
  tooltip = true,
  className,
  type = 'button',
  ...rest
}: IconButtonProps) {
  const button = (
    <button
      {...rest}
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors duration-150',
        'hover:bg-surface-2 hover:text-ink disabled:opacity-50',
        size === 'sm' ? 'size-8' : 'size-10',
        className,
      )}
    >
      <Icon aria-hidden="true" size={size === 'sm' ? 16 : 18} strokeWidth={1.5} />
    </button>
  );
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
}
```

`apps/web/src/ui/popover.tsx`:

```tsx
'use client';

import * as P from '@radix-ui/react-popover';
import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const PopoverClose = P.Close;

export function Popover({
  trigger,
  children,
  open,
  onOpenChange,
  align = 'end',
  side = 'bottom',
  label,
  className,
}: {
  trigger: ReactElement;
  children: ReactNode;
  open?: boolean;
  onOpenChange?(open: boolean): void;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  label?: string;
  className?: string;
}) {
  return (
    <P.Root open={open} onOpenChange={onOpenChange}>
      <P.Trigger asChild>{trigger}</P.Trigger>
      <P.Portal>
        <P.Content
          align={align}
          side={side}
          sideOffset={8}
          collisionPadding={12}
          aria-label={label}
          className={cn(
            'atro-pop z-50 min-w-56 rounded-2xl border border-line bg-surface-1 p-2 text-ink outline-none',
            'shadow-[0_24px_48px_-12px_rgb(0_0_0/0.45)]',
            className,
          )}
        >
          {children}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
```

`apps/web/src/ui/dialog.tsx`:

```tsx
'use client';

import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as common } from '@/messages/common.messages';
import { IconButton } from './icon-button';

export interface DialogProps {
  open?: boolean;
  onOpenChange?(open: boolean): void;
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** A sheet from the bottom edge on narrow screens (the default); a centred box from 40rem. */
  sheet?: boolean;
  className?: string;
}

const WIDTH = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-xl' } as const;

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  size = 'md',
  sheet = true,
  className,
}: DialogProps) {
  const c = useT(common);
  // Radix links the description itself; without one, an explicit undefined tells it there is none on purpose.
  const describedBy = description ? {} : { 'aria-describedby': undefined };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <D.Trigger asChild>{trigger}</D.Trigger> : null}
      <D.Portal>
        <D.Overlay className="atro-overlay fixed inset-0 z-50 bg-bg/95 md:bg-bg/70 md:backdrop-blur-[3px]" />
        <D.Content
          {...describedBy}
          className={cn(
            'fixed z-50 flex max-h-[min(90dvh,48rem)] w-full flex-col gap-5 overflow-y-auto border border-line',
            'bg-surface-1 p-6 text-ink shadow-[0_32px_64px_-16px_rgb(0_0_0/0.55)] outline-none',
            sheet
              ? 'atro-dialog atro-sheet inset-x-0 bottom-0 rounded-t-3xl pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl'
              : 'atro-dialog top-1/2 left-1/2 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl',
            WIDTH[size],
            className,
          )}
        >
          {sheet ? (
            <div aria-hidden="true" className="-mt-2 mx-auto h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" />
          ) : null}
          <div className="flex flex-col gap-1.5 pr-10">
            <D.Title className="font-display text-title">{title}</D.Title>
            {description ? <D.Description className="text-small text-ink-muted">{description}</D.Description> : null}
          </div>
          {children}
          <D.Close asChild>
            <IconButton icon={X} label={c('close')} size="sm" tooltip={false} className="absolute top-4 right-4" />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
```

`apps/web/src/ui/copy-button.tsx`:

```tsx
'use client';

import { Check, Copy } from 'lucide-react';
import { m } from 'motion/react';
import { useEffect, useState } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as common } from '@/messages/common.messages';
import { messages as ui } from '@/messages/ui.messages';
import { SPRING } from '@/motion/tokens';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type CopyState = 'idle' | 'copied' | 'failed';

export function CopyButton({
  text,
  label,
  showText = false,
  className,
}: {
  text: string;
  /** The accessible name, for example "Copy address". */
  label: string;
  showText?: boolean;
  className?: string;
}) {
  const c = useT(common);
  const t = useT(ui);
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const id = setTimeout(() => setState('idle'), 1600);
    return () => clearTimeout(id);
  }, [state]);

  const Icon = state === 'copied' ? Check : Copy;
  return (
    <>
      <button
        type="button"
        aria-label={showText ? undefined : label}
        onClick={async () => setState((await copyText(text)) ? 'copied' : 'failed')}
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 rounded-full text-ink-muted transition-colors duration-150 hover:text-ink',
          showText ? 'h-8 px-3 text-small hover:bg-surface-2' : 'size-8 justify-center hover:bg-surface-2',
          state === 'copied' && 'text-alive hover:text-alive',
          className,
        )}
      >
        <m.span
          key={state}
          className="inline-flex"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING}
        >
          <Icon aria-hidden="true" size={16} strokeWidth={1.5} />
        </m.span>
        {showText ? <span>{state === 'copied' ? c('copied') : label}</span> : null}
      </button>
      <span aria-live="polite" className="sr-only">
        {state === 'copied' ? c('copied') : state === 'failed' ? t('copyFailed') : ''}
      </span>
    </>
  );
}
```

`apps/web/src/ui/untrusted-text.tsx`:

```tsx
'use client';

import { cn } from '@/lib/cn';
import { type Untrusted, untrusted } from '@/lib/untrusted';

export function isUntrusted(v: unknown): v is Untrusted {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as Untrusted).untrusted === true &&
    typeof (v as Untrusted).value === 'string'
  );
}

/**
 * Text read from the chain (token names, symbols, revert reasons): cleaned again, truncated, isolated from the
 * surrounding text direction with <bdi>, and only ever a text node. Never HTML, never a link.
 */
export function UntrustedText({ value, max = 64, className }: { value: unknown; max?: number; className?: string }) {
  const u = untrusted(isUntrusted(value) ? value.value : value, max);
  return (
    <bdi data-untrusted="" className={cn('break-words', className)}>
      {u.value}
    </bdi>
  );
}
```

`apps/web/src/ui/external-link.tsx`:

```tsx
'use client';

import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { IS_VERCEL } from '@/config/env';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { useMounted } from '@/lib/use-mounted';
import { messages as ui } from '@/messages/ui.messages';
import { VisuallyHidden } from './visually-hidden';

export function safeExternalHref(href: string): string | null {
  try {
    const u = new URL(href);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

const LOOK = {
  inline:
    'inline-flex items-center gap-1 underline decoration-line-strong decoration-1 underline-offset-4 ' +
    'transition-colors duration-150 hover:decoration-thread',
  icon:
    'inline-grid size-8 shrink-0 place-items-center rounded-full text-ink-muted transition-colors duration-150 ' +
    'hover:bg-surface-2 hover:text-ink',
} as const;

/**
 * A link that leaves the site, in a new tab without an opener. `variant="icon"` is a round arrow button whose
 * children are its hidden label. Quyết định 16: on DeWEB the gateway's static scan counts external `href`s in the
 * prerendered HTML, so the deweb build prints text first and links after mount.
 */
export function ExternalLink({
  href,
  children,
  icon = true,
  variant = 'inline',
  className,
}: {
  href: string;
  children: ReactNode;
  icon?: boolean;
  variant?: 'inline' | 'icon';
  className?: string;
}) {
  const t = useT(ui);
  const mounted = useMounted();
  const safe = safeExternalHref(href);
  const cls = cn(LOOK[variant], className);
  const body =
    variant === 'icon' ? (
      <>
        <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.5} />
        <VisuallyHidden>{children}</VisuallyHidden>
      </>
    ) : (
      children
    );
  if (!safe || (!IS_VERCEL && !mounted)) {
    return (
      <span className={cls} data-external={safe ? 'pending' : 'refused'}>
        {body}
      </span>
    );
  }
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
      {variant === 'inline' && icon ? (
        <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.5} className="shrink-0" />
      ) : null}
      <VisuallyHidden>{` ${t('newTab')}`}</VisuallyHidden>
    </a>
  );
}
```

`apps/web/src/ui/identicon.ts`:

```ts
export interface IdenticonData {
  /** OKLCH hue, 0–359. */
  hue: number;
  /** 5 × 5, row by row, mirrored left to right. */
  cells: boolean[];
}

/** A face for an address, from its own hex digits (no hashing needed: an address already is one). */
export function identiconOf(address: string): IdenticonData {
  const hex = address
    .toLowerCase()
    .replace(/^0x/, '')
    .replace(/[^0-9a-f]/g, '0')
    .padEnd(40, '0');
  const digit = (i: number) => Number.parseInt(hex[i % hex.length], 16);
  const hue = Number.parseInt(hex.slice(0, 3), 16) % 360;
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    const half = [0, 1, 2].map((col) => digit(3 + row * 3 + col) % 2 === 0);
    cells.push(half[0], half[1], half[2], half[1], half[0]);
  }
  return { hue, cells };
}
```

`apps/web/src/ui/address.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { useT } from '@/i18n/provider';
import { addressGroups, isAddressText } from '@/lib/address';
import { cn } from '@/lib/cn';
import { explorerAddress, explorerName } from '@/lib/links';
import { messages as ui } from '@/messages/ui.messages';
import { CopyButton } from './copy-button';
import { ExternalLink } from './external-link';
import { identiconOf } from './identicon';

/** Lightness comes from --avatar-l (0.78 dark, 0.52 light), so the face reads in both themes. */
export function Avatar({ address, size = 22 }: { address: string; size?: number }) {
  const { hue, cells } = useMemo(() => identiconOf(address), [address]);
  let d = '';
  for (let i = 0; i < 25; i++) if (cells[i]) d += `M${i % 5} ${Math.floor(i / 5)}h1v1h-1z`;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="-0.5 -0.5 6 6"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className="shrink-0 rounded-full"
    >
      <rect x={-0.5} y={-0.5} width={6} height={6} style={{ fill: `oklch(var(--avatar-l) 0.05 ${hue} / 0.35)` }} />
      <path d={d} style={{ fill: `oklch(var(--avatar-l) 0.13 ${hue})` }} />
    </svg>
  );
}

/**
 * An address in full, in groups of four (spec §4.2), so two addresses can be compared group by group. Never
 * shortened: a shortened address is what address-poisoning attacks rely on.
 */
export function Address({
  address,
  explorer = null,
  copy = true,
  avatar = true,
  size = 'md',
  className,
}: {
  address: string;
  explorer?: string | null;
  copy?: boolean;
  avatar?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = useT(ui);
  const parts = addressGroups(address).map((text, at) => ({ text, at }));
  return (
    <span
      data-address={address}
      className={cn('inline-flex min-w-0 max-w-full items-center gap-2 align-middle', className)}
    >
      {avatar ? <Avatar address={address} size={size === 'sm' ? 18 : 22} /> : null}
      <span
        translate="no"
        className={cn('min-w-0 break-all font-mono tabular-nums', size === 'sm' ? 'text-small' : 'text-body')}
      >
        {parts.map((p) => (
          <span
            key={p.at}
            className={p.at === 0 && parts.length > 1 ? 'text-ink-muted' : p.at > 1 ? 'ml-[0.45ch]' : undefined}
          >
            {p.text}
          </span>
        ))}
      </span>
      {copy ? <CopyButton text={address} label={t('copyAddress')} /> : null}
      {explorer && isAddressText(address) ? (
        <ExternalLink href={explorerAddress(explorer, address)} variant="icon">
          {t('viewOn', { name: explorerName(explorer) })}
        </ExternalLink>
      ) : null}
    </span>
  );
}
```

`apps/web/src/ui/amount.tsx`:

```tsx
'use client';

import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/format';
import type { Untrusted } from '@/lib/untrusted';
import { messages as common } from '@/messages/common.messages';
import { messages as ui } from '@/messages/ui.messages';
import { Tooltip } from './tooltip';
import { UntrustedText } from './untrusted-text';

/** Tabular figures, the unit, and the exact base-unit value on hover or focus (spec §6). */
export function Amount({
  raw,
  decimals,
  symbol = null,
  maxFraction = 6,
  className,
}: {
  raw: bigint;
  decimals: number | null;
  symbol?: Untrusted | string | null;
  maxFraction?: number;
  className?: string;
}) {
  const c = useT(common);
  const t = useT(ui);
  return (
    <Tooltip content={<span className="font-mono">{t('rawAmount', { raw: raw.toString() })}</span>}>
      <button
        type="button"
        data-raw={raw.toString()}
        className={cn(
          'inline-flex items-baseline gap-1 rounded-sm text-left tabular-nums decoration-dotted underline-offset-4 hover:underline',
          className,
        )}
      >
        <span className="font-mono">{formatAmount(raw, decimals, maxFraction)}</span>
        <span className="text-ink-muted">
          {decimals === null ? c('baseUnits') : symbol ? <UntrustedText value={symbol} max={16} /> : null}
        </span>
      </button>
    </Tooltip>
  );
}
```

`apps/web/src/lib/use-now.ts`:

```ts
'use client';

import { useEffect, useState } from 'react';

/** The wall clock, ticking every `intervalMs`; null until mounted so prerendered markup never depends on it. */
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

`apps/web/src/ui/countdown.tsx`:

```tsx
'use client';

import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { chainNow, formatRemaining, formatTimestamp } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { messages as ui } from '@/messages/ui.messages';

const MAX_DATE_MS = 8.64e15;

function dateOf(ts: bigint): { iso: string; text: string } | null {
  const ms = Number(ts) * 1000;
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) return null;
  return { iso: new Date(ms).toISOString(), text: formatTimestamp(ts) };
}

/** Time to (or since) a chain timestamp, in chain time: the block's time plus the wall clock since the read. */
export function Countdown({
  target,
  blockTimestamp,
  fetchedAtMs,
  className,
}: {
  target: bigint;
  blockTimestamp: bigint;
  fetchedAtMs: number;
  className?: string;
}) {
  const t = useT(ui);
  const nowMs = useNow(1000) ?? fetchedAtMs;
  const r = formatRemaining(target, chainNow(blockTimestamp, fetchedAtMs, nowMs));
  const date = dateOf(target);
  return (
    <time
      dateTime={date?.iso}
      title={date?.text}
      data-past={r.past}
      className={cn('font-mono tabular-nums', r.past ? 'text-ink-muted' : 'text-ink', className)}
    >
      {r.past ? t('timeAgo', { time: r.text }) : t('inTime', { time: r.text })}
    </time>
  );
}
```

`apps/web/src/ui/skeleton.tsx`:

```tsx
'use client';

import { cn } from '@/lib/cn';

/** A placeholder with the shape of the real content (size it with className). */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn('relative block overflow-hidden rounded-lg bg-surface-2', className)}>
      <span className="absolute inset-0 hidden bg-linear-to-r from-transparent via-surface-3 to-transparent motion-safe:block motion-safe:animate-shimmer" />
    </span>
  );
}

const WIDTHS = ['w-full', 'w-11/12', 'w-2/3'] as const;

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  const rows = Array.from({ length: lines }, (_, at) => ({ at, width: WIDTHS[at % WIDTHS.length] }));
  return (
    <span aria-hidden="true" className={cn('flex flex-col gap-2', className)}>
      {rows.map((r) => (
        <Skeleton key={r.at} className={cn('h-3.5', r.width)} />
      ))}
    </span>
  );
}
```

`apps/web/src/ui/empty-state.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { StateGlyph } from '@/thread/glyphs';

export function EmptyState({
  title,
  body,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-3xl border border-line border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-thread">
        {icon ?? <StateGlyph name="knot" size={24} />}
      </span>
      <p className="font-display text-title text-ink">{title}</p>
      {body ? <p className="max-w-prose text-ink-muted text-small">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
```

`apps/web/src/ui/inline-error.tsx`:

```tsx
'use client';

import { CircleExclamationPoint } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function InlineError({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <p id={id} className={cn('flex items-start gap-1.5 text-danger text-small', className)}>
      <CircleExclamationPoint aria-hidden="true" size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
```

`apps/web/src/ui/banner.tsx`:

```tsx
'use client';

import { CircleCheck, CircleExclamationPoint, Info, type LucideIcon, TriangleExclamationPoint, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as common } from '@/messages/common.messages';
import { IconButton } from './icon-button';

export type BannerTone = 'info' | 'warn' | 'error' | 'success';

const TONE: Record<BannerTone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: { box: 'border-line bg-surface-1', icon: 'text-recovery', Icon: Info },
  warn: { box: 'border-grace/45 bg-grace/8', icon: 'text-grace', Icon: TriangleExclamationPoint },
  error: { box: 'border-danger/45 bg-danger/8', icon: 'text-danger', Icon: CircleExclamationPoint },
  success: { box: 'border-alive/45 bg-alive/8', icon: 'text-alive', Icon: CircleCheck },
};

/** Only errors interrupt a screen reader (role="alert"); the rest is read in order. */
export function Banner({
  tone = 'info',
  title,
  children,
  action,
  onDismiss,
  testId,
  className,
}: {
  tone?: BannerTone;
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  onDismiss?(): void;
  testId?: string;
  className?: string;
}) {
  const c = useT(common);
  const { box, icon, Icon } = TONE[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      data-tone={tone}
      data-testid={testId}
      className={cn('flex items-start gap-3 rounded-2xl border p-4 text-ink text-small', box, className)}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.5} className={cn('mt-0.5 shrink-0', icon)} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className="text-ink-muted [&_strong]:text-ink">{children}</div>
        {action ? <div className="pt-2">{action}</div> : null}
      </div>
      {onDismiss ? (
        <IconButton icon={X} label={c('close')} size="sm" tooltip={false} onClick={onDismiss} className="-mt-1 -mr-1" />
      ) : null}
    </div>
  );
}
```

`apps/web/src/ui/text-field.tsx`:

```tsx
'use client';

import { type InputHTMLAttributes, type ReactNode, type Ref, useId } from 'react';
import { cn } from '@/lib/cn';
import { InlineError } from './inline-error';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Monospace with tabular figures: addresses, amounts, hashes. */
  mono?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function TextField({ label, hint, error, mono = false, className, ...rest }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="font-medium text-ink text-small">
        {label}
      </label>
      <input
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-11 w-full rounded-xl border bg-surface-1 px-3.5 text-body text-ink placeholder:text-ink-muted',
          'transition-colors duration-150 focus-visible:border-thread',
          error ? 'border-danger' : 'border-line-strong hover:border-ink-muted',
          mono && 'font-mono tabular-nums',
        )}
      />
      {hint ? (
        <p id={hintId} className="text-caption text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? <InlineError id={errorId}>{error}</InlineError> : null}
    </div>
  );
}
```

`apps/web/src/ui/qr-code.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import { encode } from 'uqr';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as ui } from '@/messages/ui.messages';

/** One `h1v1` square per dark module, as a single path. */
export function qrPath(data: readonly (readonly boolean[])[]): string {
  let d = '';
  for (let y = 0; y < data.length; y++) {
    for (let x = 0; x < data[y].length; x++) if (data[y][x]) d += `M${x} ${y}h1v1h-1z`;
  }
  return d;
}

/**
 * Dark modules on paper in both themes: scanners read dark-on-light best, and an inverted code fails on some
 * phones. Quyết định 17: a path, not uqr's renderSVG, which returns an HTML string.
 */
export function QrCode({
  value,
  label,
  size = 192,
  className,
}: {
  value: string;
  label: string;
  size?: number;
  className?: string;
}) {
  const t = useT(ui);
  const data = useMemo(() => encode(value, { ecc: 'M', border: 2 }).data, [value]);
  const n = data.length;
  return (
    <svg
      role="img"
      aria-label={t('qrOf', { what: label })}
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn('rounded-xl', className)}
    >
      <rect width={n} height={n} fill="#FFFDF8" />
      <path d={qrPath(data)} fill="#0B0D12" />
    </svg>
  );
}
```

Run: `npm test -w apps/web -- primitives ssr`
Expected: PASS (primitives 23, ssr 2).

- [ ] **Step 4: Không còn trang chỉ có lúc dev**

Spec §18 cắt gallery `/dev/` (C7): duyệt bằng mắt dùng ảnh chụp các trang thật (Task 15, R18.13). `next.config.mjs` vì vậy không cần đọc `phase` nữa.

`apps/web/test/unit/next-config.test.ts`:

```ts
// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

type NextConfigFn = (phase?: string) => { pageExtensions: string[] };

/** next.config.mjs is plain ESM typed by JSDoc (Quyết định 2); a dynamic import keeps tsc out of it. */
const CONFIG = '../../next.config.mjs';
const load = async (): Promise<NextConfigFn> =>
  ((await import(/* @vite-ignore */ CONFIG)) as { default: NextConfigFn }).default;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('next.config.mjs', () => {
  it('has no dev-only pages, not even under next dev (spec §18, C7)', async () => {
    vi.stubEnv('NEXT_PUBLIC_TARGET', 'deweb');
    vi.stubEnv('ATROPYLE_E2E', '');
    const config = await load();
    expect(config('phase-development-server').pageExtensions).toEqual(['tsx', 'ts']);
    expect(config('phase-production-build').pageExtensions).toEqual(['tsx', 'ts']);
  });

  it('adds the e2e pages only when ATROPYLE_E2E=1 (Quyết định 19)', async () => {
    vi.stubEnv('NEXT_PUBLIC_TARGET', 'deweb');
    vi.stubEnv('ATROPYLE_E2E', '1');
    const config = await load();
    expect(config().pageExtensions).toEqual(['e2e.tsx', 'tsx', 'ts']);
  });
});
```

Run: `npm test -w apps/web -- next-config`
Expected: FAIL ở test đầu: `expected [ 'dev.tsx', 'tsx', 'ts' ] to deeply equal [ 'tsx', 'ts' ]`. Test thứ hai PASS.

Lần chạy này cũng kiểm cách nạp file: test đầu phải hỏng ở `toEqual`, không hỏng lúc nạp `next.config.mjs`. Nếu nó hỏng lúc nạp (ví dụ `Failed to load url ../../next.config.mjs` hay `Cannot find module`), import động với đường dẫn tương đối không chạy trong bản vitest này. Khi đó:
- giữ `// @vitest-environment node` ở dòng đầu;
- thêm import này ngay trên dòng import `vitest`:

  ```ts
  import { fileURLToPath, pathToFileURL } from 'node:url';
  ```

- thay dòng `const CONFIG = '../../next.config.mjs';` bằng dòng dưới. `load` giữ nguyên: nó vẫn gọi `await import(/* @vite-ignore */ CONFIG)`, giờ với một URL `file:` tuyệt đối.

  ```ts
  const CONFIG = pathToFileURL(fileURLToPath(new URL('../../next.config.mjs', import.meta.url))).href;
  ```

Chạy lại lệnh trên. Expected không đổi. Ghi vào báo cáo task cách nạp nào đã chạy.

Thay `apps/web/next.config.mjs`:

```js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const TARGETS = ['vercel', 'deweb'];

/**
 * A function, so that the target is checked at load and e2e-only pages (`page.e2e.tsx`) exist only when
 * ATROPYLE_E2E=1. There are no dev-only pages: the design review uses screenshots of the real pages.
 * @returns {import('next').NextConfig}
 */
export default function config() {
  const target = process.env.NEXT_PUBLIC_TARGET || 'deweb';
  if (!TARGETS.includes(target)) throw new Error(`NEXT_PUBLIC_TARGET must be vercel or deweb, got "${target}"`);
  // The deweb build must never carry the backend URL (spec §2); scripts/lib/build-env.ts drops it too.
  if (target !== 'vercel') delete process.env.NEXT_PUBLIC_API_URL;
  const pageExtensions = ['tsx', 'ts'];
  if (process.env.ATROPYLE_E2E === '1') pageExtensions.unshift('e2e.tsx');
  return {
    output: 'export',
    trailingSlash: true,
    images: { unoptimized: true },
    reactStrictMode: true,
    poweredByHeader: false,
    productionBrowserSourceMaps: false,
    // `npm run typecheck` runs tsc on the whole app; the build does not type-check a second time.
    typescript: { ignoreBuildErrors: true },
    pageExtensions,
    // node_modules live at the monorepo root.
    turbopack: { root: fileURLToPath(new URL('../..', import.meta.url)) },
    env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  };
}
```

Đổi tên test build để nó nói đúng điều nó canh:

```bash
sed -i "s/ships neither the dev gallery nor the e2e pages/ships no dev-only and no e2e-only pages/" apps/web/test/build/output.test.ts
grep -c "ships no dev-only and no e2e-only pages" apps/web/test/build/output.test.ts
```

Expected: `1`.

Run: `npm test -w apps/web -- next-config`
Expected: PASS (2 test).

- [ ] **Step 5: Chạy toàn bộ, build và commit**

```bash
npm test -w apps/web
npm run typecheck -w apps/web
npx biome ci .
npm run test:build -w apps/web
git add apps/web/src/ui apps/web/src/lib/use-now.ts apps/web/src/shell/providers.tsx apps/web/src/app/layout.tsx apps/web/src/messages/ui.messages.ts apps/web/next.config.mjs apps/web/test/setup.ts apps/web/test/helpers/render.tsx apps/web/test/unit/primitives.test.tsx apps/web/test/unit/ssr.test.tsx apps/web/test/unit/next-config.test.ts apps/web/test/build/output.test.ts apps/web/package.json package-lock.json
git commit -m "feat(web): primitives and app providers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected:
- mọi test PASS;
- `test:build` PASS (không có `out/dev`, không có `out/e2e`);
- `git status --short apps/web/src/app` không còn gì (không có thư mục `src/app/dev/`).

---

### Task 9: Khung trang trung thực, script boot, chuyển hướng link cũ và trang chủ tạm

Khung (`Frame`) bọc mọi trang. Task này dựng nó theo `honest-frame` của spec §18.4.1 (mục 1 tới 8) và các ruling R18.1, R18.7, R18.11, R18.12. Thứ tự trong DOM:

1. nút "Tới nội dung chính": đứng đầu cho bàn phím (WCAG 2.4.1), ẩn tới khi được focus;
2. dòng bằng chứng: dải đầu tiên hiện ra trên trang, ngay sau nút bỏ qua;
3. header dính trên cùng: wordmark với glyph `mark`, điều hướng, menu cài đặt; dưới 48rem là một sheet;
4. nội dung trang;
5. footer: giới hạn đã biết, trang cho người thừa kế và người giám hộ, nguồn, giấy phép, phiên bản, "No trackers · No cookies".

Script boot vẫn là script inline duy nhất (Quyết định 14). Nó chuyển link cũ ở `/` sang đường dẫn mới (spec §3), rồi đặt theme đã lưu, trước lần vẽ đầu.

Trang chủ tạm là cảnh đầu. Nó có câu hỏi, một lời dẫn đúng cả với vault không có người giám hộ, và lời mời diễn tập "khoảng 6 phút" kèm một câu nói rõ phí.

**Theme (R18.1).**

- Night là mặc định bất kể thiết bị. Night không cần thuộc tính: `:root` mang token night.
- Vellum là `data-theme="light"`:
  - Block token sáng khớp mọi phần tử mang thuộc tính đó. Nhờ vậy một lá thư hay một bản in có thể là vellum trên một trang night.
  - Một luật trong `@layer base` cho phần tử đó tự tô nền và chữ.
- "Match device" là `data-theme="system"` trên `<html>`: vellum khi thiết bị thích sáng, night khi không.
- Giá trị rác trong bộ nhớ là night.
- Meta `theme-color` chỉ còn `#0b0d12`, và meta `color-scheme` là `dark`. Thuộc tính CSS `color-scheme` thì theo theme, và `globals.css` đã có sẵn nó: `dark` trên `:root`, `light` trên `[data-theme="light"]` (cả vellum theo phạm vi) và trong khối match device sáng. `theme-css.test.ts` kiểm cả ba chỗ.

**Dòng bằng chứng (R18.7).** Một dòng 24 px, chữ mono cỡ caption, được prerender và không tắt được.

- Từ 48rem: "Rules frozen in netlist `0x7016…3864` on X Layer · unaudited · limits →".
- Dưới 48rem: "Rules `0x7016…3864` · unaudited →" (≤ 36 ký tự).
- Keccak trỏ tới `/proof/`. Phần giới hạn trỏ tới `/proof/#limits` (`LIMITS_HREF`). Cả hai link có `prefetch={false}` tới khi 7C T3 dựng `/proof/`.
- Hai bản cùng nằm trong HTML, và CSS chọn bản nào hiện. Không có JS đo bề rộng.

**Số liệu (nguyên tắc 3 của §18).** `src/config/facts.ts` giữ ba hằng, mỗi hằng có test đọc nguồn thật của nó:

| Hằng | Nguồn mà test đọc |
| --- | --- |
| keccak của netlist policy | `deployments/xlayer.json` |
| ngày lên mainnet | `factoryBlock` của deployment |
| nhịp của keeper | lịch `pg_cron` trong `supabase/migrations` |

Số phút của Drill trong `heroDrill` (EN và VI) do `drill-minutes.test.ts` tính (R18.11): `computeTimeline` của SDK trên một Drill không giám hộ, cộng hai lượt keeper. Nếu SDK cho số khác, sửa chữ, không sửa test.

**Header và View Transition.**

- Dưới 48rem header có nền đặc `bg-bg/95`. `backdrop-blur-md` chỉ có từ 48rem, vì blur sau một thanh dính bắt điện thoại vẽ lại ở mỗi khung cuộn.
- Header và footer mang `view-transition-name` riêng (`site-header`, `site-footer`), nên chúng đứng yên khi trang giữa chúng đổi.
- Sợi chỉ chung giữ chiều cao và trượt từ trái khi hai trang vẽ nó ở bề rộng khác nhau.

**Từ vựng (R18.12).**

- VI dùng "điểm danh" cho check-in. Footer gọi Drill là "Drill (bản diễn tập)".
- Không chuỗi mới nào của `shell.messages` chứa "connect": Task 11 xoá các khoá ví bằng `sed`, rồi đếm chữ này.

**Files:**
- Create: `apps/web/src/config/facts.ts`, `apps/web/src/theme/boot.ts`, `apps/web/src/theme/boot-script.tsx`, `apps/web/src/routes.ts`, `apps/web/src/lib/hash.ts`
- Create: `apps/web/src/shell/{frame,header,proof-line,nav-list,settings-menu,mobile-menu,footer,skip-link,lang-switch,theme-switch,haptics-switch,wordmark}.tsx`, `apps/web/src/home/hero.tsx`, `apps/web/src/app/not-found.tsx`
- Modify: `apps/web/src/theme/theme.ts`, `apps/web/src/theme/provider.tsx`, `apps/web/src/app/globals.css`, `apps/web/src/thread/glyphs.tsx` (glyph `mark`), `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/messages/shell.messages.ts`, `apps/web/src/messages/home.messages.ts`, `apps/web/src/messages/ui.messages.ts` (chỉ ba nhãn theme)
- Test (tạo): `apps/web/test/unit/theme-css.test.ts`, `apps/web/test/unit/facts.test.ts`, `apps/web/test/unit/boot.test.ts`, `apps/web/test/unit/routes.test.ts`, `apps/web/test/unit/hash.test.tsx`, `apps/web/test/unit/drill-minutes.test.ts`, `apps/web/test/unit/proof-line.test.tsx`, `apps/web/test/unit/shell.test.tsx`, `apps/web/test/unit/no-html-sinks.test.ts`, `apps/web/test/build/shell.test.ts`
- Test (sửa): `apps/web/test/unit/theme.test.tsx` (của Task 5, thay toàn bộ), `apps/web/test/unit/thread.test.tsx` (của Task 7, chỉ đổi tên test glyph)

**Interfaces:**
- Consumes:
  - Task 2: `ENV`, `IS_VERCEL`, `test/build/paths.ts` (`outOf`).
  - Task 4: `fontVariables`.
  - Task 5: `useT`, `useLang`, `useTheme`, `ThemeProvider`, `KVProvider`, `KEYS`, `memoryKV`, `format`, `REPO_URL`, `LICENSE_URL`, `XLAYER_URL`, `cn`, `useMounted`, `theme.ts`.
  - Task 6: `withViewTransition`, `useHaptics`, `SPRING`.
  - Task 7: `Thread`, `StateGlyph`, `GLYPH_NAMES`, và bản ghi hình `SHAPES` của `glyphs.tsx`.
  - Task 8: `Providers`, `Dialog`, `Popover`, `IconButton`, `buttonClass`, `ExternalLink`, `UntrustedText`, `renderWithProviders`.
  - Chỉ trong test (code client không import `deployments/xlayer.json`):
    - `circuits.netlistKeccak.policy` và `factoryBlock` của `deployments/xlayer.json`, và `supabase/migrations/*.sql` (job `atropyle-tick`);
    - giá trị của SDK: `parseSignLink`, `signLink`, `type SignPayload`, `computeTimeline`, `modelEngine`, `PRESETS`, `STATE_CODES`, `type EvalState`.
- Produces:
  - `src/config/facts.ts`:
    - `POLICY_NETLIST_KECCAK = '0x70167214a030d2024e5b31d7be5f5664e5abad2d7d5323443abed76b776c3864'` (literal);
    - `MAINNET_SINCE = '2026-11-22'`;
    - `KEEPER_CADENCE_S = 60`.
  - `src/theme/theme.ts` (đổi nghĩa):
    - `type ThemeChoice = 'dark' | 'light' | 'system'`;
    - `THEME_CHOICES = ['dark', 'light', 'system']`;
    - `DEFAULT_THEME = 'dark'` (mới);
    - `parseTheme(raw)`: rác là `'dark'`;
    - `applyTheme(choice, root?)`: `'dark'` gỡ `data-theme`, `'light'` và `'system'` đặt nó; `root` có thể là phần tử bất kỳ.
  - `src/theme/provider.tsx`: `ThemeProvider` (prerender ra `'dark'`), `useTheme()` (không đổi chữ ký).
  - `src/theme/boot.ts`:
    - `legacyTarget(pathname: string, hash: string): string | null`;
    - `boot(themeKey: string, legacy: typeof legacyTarget): void` (đặt thuộc tính chỉ khi giá trị đã lưu là `light` hoặc `system`);
    - `BOOT_SCRIPT: string`.
  - `src/theme/boot-script.tsx`: `BootScript()`, đặt trong `<head>` của layout.
  - `src/routes.ts`:
    - `ROUTES`: `home`, `create`, `vault`, `verify`, `sign`, `proof`, `me`, `join`, `alertsConfirm`, `alertsUnsubscribe`, `status`, `developers`, `privacy`; mỗi giá trị kết thúc bằng `/`;
    - `type RouteName = keyof typeof ROUTES`;
    - `type NavKey = 'navCreate' | 'navMe' | 'navProof' | 'navDevelopers'`;
    - `NAV: readonly { route: RouteName; key: NavKey }[]`;
    - `LIMITS_HREF = '/proof/#limits'` (mới);
    - `createHref(mode?: 'drill' | 'real'): string`;
    - `vaultHref(vault: string): string`;
    - `verifyHref(vault: string): string`;
    - `joinHref(vault: string, role: 'guardian' | 'heir'): string`;
    - `signHref(encodedPayload: string): string`;
    - `toSdkSignLink(hash: string): string`;
    - `isCurrent(pathname: string, href: string): boolean`;
    - re-export `legacyTarget`.
  - `src/lib/hash.ts`:
    - `useLocationHash(): string`: gồm cả `#`; chuỗi rỗng lúc prerender;
    - `replaceHash(hash: string): void`: không thêm mục lịch sử; báo cho mọi `useLocationHash`.
  - `src/thread/glyphs.tsx`: `GlyphName` và `GLYPH_NAMES` thêm `'mark'`.
  - `src/shell/frame.tsx`: `Frame({ children })`, gồm SkipLink, ProofLine, Header, main, Footer.
  - `src/shell/proof-line.tsx`: `ProofLine()` (mới).
  - `src/shell/header.tsx`: `Header()`, có lớp `site-header`.
  - `src/shell/nav-list.tsx`: `NavList({ layout: 'bar' | 'sheet', onNavigate?(): void })`.
  - `src/shell/settings-menu.tsx`: `SettingsMenu()`.
  - `src/shell/mobile-menu.tsx`: `MobileMenu()`.
  - `src/shell/footer.tsx`: `Footer()`, có lớp `site-footer`.
  - `src/shell/skip-link.tsx`: `SkipLink({ targetId })`.
  - `src/shell/lang-switch.tsx`: `LangSwitch()`.
  - `src/shell/theme-switch.tsx`: `ThemeSwitch()`, với Night / Vellum / Match device.
  - `src/shell/haptics-switch.tsx`: `HapticsSwitch()`.
  - `src/shell/wordmark.tsx`: `Wordmark({ className? })`.
  - `src/home/hero.tsx`: `HomeHero()`. Plan 7B thay nó bằng trang chủ sáu cảnh.
  - `src/app/globals.css`:
    - selector `:root[data-theme="system"]`;
    - luật vellum theo phạm vi;
    - tên View Transition `site-header` và `site-footer`;
    - hai luật cho `atropyle-thread`.
  - Khoá chuỗi mới:
    - `shell`: `navMe`, `navLabel`, `footerNav`, `settings`, `notFoundHint`, `knownLimits`, `forHeirs`, `noTrackers`, `proofLine`, `proofLineShort`, `proofLimits`, `proofLimitsShort`;
    - `home`: `heroEyebrow`, `heroTitle`, `heroLead`, `heroDrill`, `heroDrillNote`, `heroProof`.
  - Khoá chuỗi bị xoá: `home`: `drillCta` ("Try a 5-minute Drill") và `drillNote`, ở EN và VI. Chỉ trang chủ cũ dùng chúng; lời mời mới lấy số phút từ `drill-minutes.test.ts` (R18.11).

- [ ] **Step 1: Viết test hỏng cho night mặc định**

Thay toàn bộ `apps/web/test/unit/theme.test.tsx` (bản của Task 5). Tên test của Review Focus 2 đổi thành `a stored garbage theme falls back to night`.

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KVProvider } from '../../src/lib/kv';
import { KEYS, type KV, memoryKV } from '../../src/lib/store';
import { ThemeProvider, useTheme } from '../../src/theme/provider';
import { applyTheme, DEFAULT_THEME, parseTheme, readThemeAttr, THEME_CHOICES } from '../../src/theme/theme';

const root = document.documentElement;

function wrap(kv: KV) {
  return ({ children }: { children: ReactNode }) => (
    <KVProvider kv={kv}>
      <ThemeProvider>{children}</ThemeProvider>
    </KVProvider>
  );
}

function stubScheme(light: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches: light,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  };
  vi.spyOn(window, 'matchMedia').mockImplementation(() => mql as unknown as MediaQueryList);
  return {
    set(next: boolean) {
      mql.matches = next;
      for (const l of listeners) l();
    },
  };
}

function Shown() {
  const { choice, resolved } = useTheme();
  return <span>{`${choice}/${resolved}`}</span>;
}

beforeEach(() => root.removeAttribute('data-theme'));
afterEach(() => {
  vi.restoreAllMocks();
  root.removeAttribute('data-theme');
});

describe('theme', () => {
  it('parses night, vellum and match device; anything else is night', () => {
    expect(DEFAULT_THEME).toBe('dark');
    expect(THEME_CHOICES).toEqual(['dark', 'light', 'system']);
    for (const c of THEME_CHOICES) expect(parseTheme(c)).toBe(c);
    for (const raw of ['', null, undefined, 'Dark', ' light', 'auto', '"><script>'])
      expect(parseTheme(raw)).toBe('dark');
  });

  it('night removes data-theme; vellum and match device set it', () => {
    root.setAttribute('data-theme', 'light');
    applyTheme('dark');
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(readThemeAttr()).toBe('dark');
    applyTheme('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    applyTheme('system');
    expect(root.getAttribute('data-theme')).toBe('system');
    expect(readThemeAttr()).toBe('system');
    root.setAttribute('data-theme', 'purple');
    expect(readThemeAttr()).toBe('dark');
  });

  it('vellum can be scoped to one element without touching the page', () => {
    const letter = document.createElement('article');
    applyTheme('light', letter);
    expect(letter.getAttribute('data-theme')).toBe('light');
    expect(root.hasAttribute('data-theme')).toBe(false);
    applyTheme('dark', letter);
    expect(letter.hasAttribute('data-theme')).toBe(false);
  });

  it('a stored garbage theme falls back to night', async () => {
    stubScheme(true);
    root.setAttribute('data-theme', 'light');
    const kv = memoryKV();
    kv.set(KEYS.theme, 'sepia"><img src=x>');
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(kv) });
    await waitFor(() => expect(result.current.choice).toBe('dark'));
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(result.current.resolved).toBe('dark');
  });

  it('a device that prefers light still opens at night', async () => {
    stubScheme(true);
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(memoryKV()) });
    await waitFor(() => expect(result.current.choice).toBe('dark'));
    expect(result.current.resolved).toBe('dark');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('prerenders at night', () => {
    const html = renderToString(
      <KVProvider kv={memoryKV()}>
        <ThemeProvider>
          <Shown />
        </ThemeProvider>
      </KVProvider>,
    );
    expect(html).toContain('dark/dark');
  });

  it('applies the stored theme, then remembers a new choice', async () => {
    stubScheme(false);
    const kv = memoryKV();
    kv.set(KEYS.theme, 'light');
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(kv) });
    await waitFor(() => expect(result.current.choice).toBe('light'));
    expect(root.getAttribute('data-theme')).toBe('light');
    act(() => result.current.setChoice('system'));
    expect(result.current.choice).toBe('system');
    expect(root.getAttribute('data-theme')).toBe('system');
    expect(kv.get(KEYS.theme)).toBe('system');
    act(() => result.current.setChoice('dark'));
    expect(result.current.choice).toBe('dark');
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(kv.get(KEYS.theme)).toBe('dark');
  });

  it('match device follows the colour scheme of the device, live', async () => {
    const scheme = stubScheme(true);
    const kv = memoryKV();
    kv.set(KEYS.theme, 'system');
    const { result } = renderHook(() => useTheme(), { wrapper: wrap(kv) });
    await waitFor(() => expect(result.current.resolved).toBe('light'));
    expect(result.current.choice).toBe('system');
    act(() => scheme.set(false));
    expect(result.current.resolved).toBe('dark');
  });
});
```

`apps/web/test/unit/theme-css.test.ts` đọc `globals.css` như `contrast.test.ts`. Các marker `tokens:*` giữ nguyên, nên test tương phản không đổi.

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const CSS_FILE = fileURLToPath(new URL('../../src/app/globals.css', import.meta.url));
const CSS = readFileSync(CSS_FILE, 'utf8').replaceAll('\r\n', '\n');

/** The declarations of the first rule written as `<selector> {`, searched from `from`. */
function decls(selector: string, from = 0): Record<string, string> {
  const at = CSS.indexOf(`${selector} {`, from);
  if (at < 0) throw new Error(`no rule "${selector}" after offset ${from}`);
  const open = at + selector.length + 2;
  const out: Record<string, string> = {};
  for (const d of CSS.slice(open, CSS.indexOf('}', open)).split(';')) {
    const i = d.indexOf(':');
    if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  }
  return out;
}

describe('theme stylesheet', () => {
  it('night is :root with no attribute; vellum is an attribute any element can carry', () => {
    expect(decls('/* tokens:dark */\n:root,\n[data-theme="dark"]')['color-scheme']).toBe('dark');
    expect(decls('/* tokens:light */\n[data-theme="light"]')['color-scheme']).toBe('light');
    // A scoped vellum element paints its own paper and ink instead of inheriting night's.
    expect(decls('[data-theme="light"]', CSS.indexOf('@layer base {'))).toEqual({
      'background-color': 'var(--atro-bg)',
      color: 'var(--atro-ink)',
    });
  });

  it('match device turns vellum only for data-theme="system", inside the light media query', () => {
    expect(CSS).toContain(
      '/* tokens:light-system */\n@media (prefers-color-scheme: light) {\n  :root[data-theme="system"] {',
    );
    expect(decls(':root[data-theme="system"]')['color-scheme']).toBe('light');
    expect(CSS).not.toContain(':not([data-theme])');
  });

  it('the shared thread keeps its height, and the header and the footer stay put between pages', () => {
    expect(decls('::view-transition-old(atropyle-thread),\n::view-transition-new(atropyle-thread)')).toEqual({
      height: '100%',
      width: 'auto',
      'object-fit': 'none',
      'object-position': 'left center',
    });
    expect(decls('::view-transition-image-pair(atropyle-thread)')).toEqual({ overflow: 'clip' });
    expect(decls('.site-header')).toEqual({ 'view-transition-name': 'site-header' });
    expect(decls('.site-footer')).toEqual({ 'view-transition-name': 'site-footer' });
  });
});
```

Run: `npm test -w apps/web -- theme`

Expected: FAIL.

- `theme` có 7 test hỏng. `DEFAULT_THEME` chưa có, `parseTheme` vẫn trả `'system'`, `applyTheme('dark')` vẫn đặt thuộc tính, và prerender ra `system/dark`.
- `match device follows the colour scheme of the device, live` qua ngay, vì Task 5 đã làm đúng phần đó.
- `theme-css` có 3 test hỏng: chưa có luật vellum trong `@layer base`, chưa có selector `system`, chưa có luật View Transition.

- [ ] **Step 2: Đổi `theme.ts`, `provider.tsx` và `globals.css` sang night mặc định**

Thay toàn bộ `apps/web/src/theme/theme.ts`:

```ts
export type ThemeChoice = 'dark' | 'light' | 'system';
/** Night, vellum, match device: the order of the theme switch (R18.1). */
export const THEME_CHOICES: readonly ThemeChoice[] = ['dark', 'light', 'system'];
/** Night whatever the device prefers (R18.1). It needs no attribute: `:root` carries the night tokens. */
export const DEFAULT_THEME = 'dark' satisfies ThemeChoice;

/** Only an exact choice counts; anything else is night (Review Focus 2: storage may hold garbage). */
export function parseTheme(raw: string | null | undefined): ThemeChoice {
  return raw === 'light' || raw === 'system' || raw === 'dark' ? raw : DEFAULT_THEME;
}

const listeners = new Set<() => void>();

/** The theme in force is the `data-theme` attribute of <html>; the boot script sets it before the first paint. */
export function readThemeAttr(): ThemeChoice {
  return parseTheme(document.documentElement.getAttribute('data-theme'));
}

export function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Night removes the attribute; vellum and match device set it (Quyết định 14). `root` may be any element:
 * `data-theme="light"` on a letter or a print sheet makes just that element vellum. `system` means something only
 * on <html>, where the stylesheet's media query reads it.
 */
export function applyTheme(choice: ThemeChoice, root: HTMLElement = document.documentElement): void {
  if (choice === 'dark') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  for (const l of listeners) l();
}
```

Thay toàn bộ `apps/web/src/theme/provider.tsx`:

```tsx
'use client';

import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useKV } from '@/lib/kv';
import { KEYS } from '@/lib/store';
import { applyTheme, DEFAULT_THEME, parseTheme, readThemeAttr, subscribeTheme, type ThemeChoice } from './theme';

interface ThemeValue {
  choice: ThemeChoice;
  /** What the page shows now: night or vellum, or under match device the device's colour scheme. */
  resolved: 'light' | 'dark';
  setChoice(c: ThemeChoice): void;
}

const ThemeContext = createContext<ThemeValue | null>(null);
const LIGHT = '(prefers-color-scheme: light)';

function subscribeScheme(cb: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(LIGHT);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

function prefersLight(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(LIGHT).matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const kv = useKV();
  // The prerendered page is night: the HTML carries no theme attribute (R18.1).
  const choice = useSyncExternalStore(subscribeTheme, readThemeAttr, () => DEFAULT_THEME);
  const light = useSyncExternalStore(subscribeScheme, prefersLight, () => false);

  // The boot script already did this; doing it again keeps a page whose inline script was blocked correct.
  useEffect(() => {
    applyTheme(parseTheme(kv.get(KEYS.theme)));
  }, [kv]);

  const setChoice = useCallback(
    (c: ThemeChoice) => {
      kv.set(KEYS.theme, c);
      applyTheme(c);
    },
    [kv],
  );

  const value = useMemo<ThemeValue>(
    () => ({ choice, resolved: choice === 'system' ? (light ? 'light' : 'dark') : choice, setChoice }),
    [choice, light, setChoice],
  );
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeValue {
  const v = use(ThemeContext);
  if (!v) throw new Error('useTheme must be used inside <ThemeProvider>');
  return v;
}
```

Bốn chỗ sửa trong `apps/web/src/app/globals.css`. Mỗi chỗ thay đúng đoạn cũ bằng đoạn mới; các marker `tokens:*` giữ nguyên.

(a) Ghi chú về theme, đặt ngay trước block token night. Đoạn cũ:

```css
/* tokens:dark */
:root,
[data-theme="dark"] {
```

Đoạn mới:

```css
/* Themes (R18.1). Night is the default and needs no attribute: :root carries it. Vellum is data-theme="light", on
   <html> or on any one element (a letter, a print sheet). Match device is data-theme="system" on <html>: vellum
   while the device prefers light, night otherwise. test/unit/contrast.test.ts reads the marker comments below. */
/* tokens:dark */
:root,
[data-theme="dark"] {
```

(b) "Match device" chỉ bật vellum khi được chọn. Thay dòng:

```css
  :root:not([data-theme]) {
```

bằng:

```css
  :root[data-theme="system"] {
```

(c) Vellum theo phạm vi, trong `@layer base`, ngay sau luật `html`. Đoạn cũ:

```css
    -webkit-text-size-adjust: 100%;
    text-rendering: optimizeLegibility;
  }
  body {
```

Đoạn mới:

```css
    -webkit-text-size-adjust: 100%;
    text-rendering: optimizeLegibility;
  }
  /* Scoped vellum paints its own paper and ink: inherited night ink would sit on vellum paper. */
  [data-theme="light"] {
    background-color: var(--atro-bg);
    color: var(--atro-ink);
  }
  body {
```

Luật này dùng thẳng `--atro-*`, không qua `--color-*`. `--color-bg` được khai báo trên `:root`, nên giá trị của nó tính ở `:root`, rồi phần tử con thừa hưởng giá trị đã tính đó, tức giá trị night. Các lớp tiện ích (`bg-bg`, `text-ink`) thì đúng ở mọi phần tử, vì `@theme inline` in thẳng `var(--atro-*)` vào lớp.

(d) View Transition (§18.4.1 mục 6). Đoạn cũ:

```css
::view-transition-group(atropyle-thread) {
  animation-duration: 443ms;
  animation-timing-function: var(--ease-spring);
}
```

Đoạn mới:

```css
::view-transition-group(atropyle-thread) {
  animation-duration: 443ms;
  animation-timing-function: var(--ease-spring);
}
/* Two pages draw the thread at different widths: it keeps its height and slides from the left, never stretches. */
::view-transition-old(atropyle-thread),
::view-transition-new(atropyle-thread) {
  height: 100%;
  width: auto;
  object-fit: none;
  object-position: left center;
}
::view-transition-image-pair(atropyle-thread) {
  overflow: clip;
}
/* The header and the footer stay put while the page between them changes. */
.site-header {
  view-transition-name: site-header;
}
.site-footer {
  view-transition-name: site-footer;
}
```

Khối reduced motion có sẵn (`::view-transition-group(*) { animation: none; }`) đã phủ hai tên mới, nên không cần sửa thêm.

Run: `npm test -w apps/web -- theme contrast`
Expected: PASS (theme 8, theme-css 3, contrast 10).

- [ ] **Step 3: `facts.ts`, mỗi hằng buộc vào nguồn thật của nó**

`apps/web/test/unit/facts.test.ts`:

```ts
// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { KEEPER_CADENCE_S, MAINNET_SINCE, POLICY_NETLIST_KECCAK } from '../../src/config/facts';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const deployment = JSON.parse(readFileSync(join(ROOT, 'deployments/xlayer.json'), 'utf8')) as {
  factoryBlock: string | number;
  circuits: { netlistKeccak: { policy: string } };
};

/** The schedule of the `atropyle-tick` job. Migrations run in name order, and the last schedule wins. */
function tickSchedule(): string {
  const dir = join(ROOT, 'supabase/migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let found: string | null = null;
  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8');
    for (const m of sql.matchAll(/cron\.schedule\(\s*'atropyle-tick'\s*,\s*'([^']+)'\s*,\s*\$\$([^$]*)\$\$/g)) {
      expect(m[2], file).toContain("call_function('tick')");
      found = m[1];
    }
  }
  if (found === null) throw new Error('no migration schedules atropyle-tick');
  return found;
}

/** Seconds between runs of a cron expression that fires every N minutes; any other shape is refused. */
function cadenceSeconds(expr: string): number {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5 || f.slice(1).some((x) => x !== '*')) throw new Error(`not an every-N-minutes schedule: ${expr}`);
  if (f[0] === '*') return 60;
  const m = /^\*\/([1-9]\d*)$/.exec(f[0]);
  if (m === null) throw new Error(`not an every-N-minutes schedule: ${expr}`);
  return Number(m[1]) * 60;
}

describe('facts', () => {
  it('shows the policy netlist keccak of the X Layer deployment', () => {
    expect(POLICY_NETLIST_KECCAK).toBe(deployment.circuits.netlistKeccak.policy);
    expect(POLICY_NETLIST_KECCAK).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it('dates mainnet from the factory block it was deployed at', () => {
    // Block 76567034 is the factory deployment of 22 Nov 2026. A redeploy moves the block, and this test then
    // asks for the new date as well.
    expect(String(deployment.factoryBlock)).toBe('76567034');
    expect(MAINNET_SINCE).toBe('2026-11-22');
  });

  it('the keeper cadence is the pg_cron schedule of atropyle-tick', () => {
    expect(KEEPER_CADENCE_S).toBe(cadenceSeconds(tickSchedule()));
  });

  it('reads only every-N-minutes schedules', () => {
    expect(cadenceSeconds('* * * * *')).toBe(60);
    expect(cadenceSeconds('*/10 * * * *')).toBe(600);
    expect(() => cadenceSeconds('17 3 * * *')).toThrow();
    expect(() => cadenceSeconds('*/5 2 * * *')).toThrow();
    expect(() => cadenceSeconds('* * * *')).toThrow();
  });
});
```

Run: `npm test -w apps/web -- facts`
Expected: FAIL, không tìm thấy `../../src/config/facts`.

`apps/web/src/config/facts.ts`:

```ts
/*
 * Facts the pages state as hashes, dates or numbers (spec §18, principle 3: no such value is typed by hand twice).
 * test/unit/facts.test.ts ties each one to its source of truth. They are literals: client code never imports
 * deployments/xlayer.json, which would put the whole file into the first load of every page (R16).
 */

/** The keccak of the policy netlist frozen on X Layer: what the proof line shows and /proof/ proves. */
export const POLICY_NETLIST_KECCAK = '0x70167214a030d2024e5b31d7be5f5664e5abad2d7d5323443abed76b776c3864';

/**
 * The day the contracts went live on X Layer mainnet: block 76567034, timestamp 1795336070 = 2026-11-22T08:27:50Z
 * (read from rpc.xlayer.tech on 24 Nov 2026). The test ties it to `factoryBlock`, so a redeploy breaks it.
 */
export const MAINNET_SINCE = '2026-11-22';

/** Seconds between keeper runs: the `atropyle-tick` pg_cron job in supabase/migrations. */
export const KEEPER_CADENCE_S = 60;
```

Ba hằng là literal. Code client không import `deployments/xlayer.json`: file đó sẽ vào JS lần tải đầu của mọi trang, mà ngân sách của `/` là 200 kB (R16, R23). `facts.test.ts` đọc file đó bằng `node:fs`, nên literal keccak lệch khỏi `circuits.netlistKeccak.policy`, hay `factoryBlock` đổi sau một lần deploy lại, đều làm test hỏng.

Run: `npm test -w apps/web -- facts`
Expected: PASS (4 test).

- [ ] **Step 4: Viết test hỏng cho script boot và đường dẫn**

`apps/web/test/unit/boot.test.ts`:

```ts
// @vitest-environment node
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { BOOT_SCRIPT, legacyTarget } from '../../src/theme/boot';
import { parseTheme, THEME_CHOICES } from '../../src/theme/theme';

/** 4 kB of every character base64url uses: the shape of a long signing payload. */
const PAYLOAD = Array.from({ length: 4096 }, (_, i) => 'ABYZabyz0189-_'[i % 14]).join('');

/** Runs the real inline script against a fake page; `theme` is the data-theme it left on <html>, or null. */
function page(o: { pathname?: string; hash?: string; stored?: string | null; storageThrows?: boolean } = {}) {
  const replace = vi.fn();
  const attrs = new Map<string, string>();
  const setAttribute = vi.fn((name: string, value: string) => {
    attrs.set(name, value);
  });
  const ctx: Record<string, unknown> = {
    location: { pathname: o.pathname ?? '/', hash: o.hash ?? '', replace },
    document: { documentElement: { setAttribute } },
  };
  Object.defineProperty(ctx, 'localStorage', {
    get() {
      if (o.storageThrows) throw new Error('SecurityError: storage is disabled');
      return { getItem: (k: string) => (k === 'atropyle:theme' ? (o.stored ?? null) : null) };
    },
  });
  runInNewContext(BOOT_SCRIPT, ctx);
  return { replace, setAttribute, theme: attrs.get('data-theme') ?? null };
}

describe('legacyTarget', () => {
  it('legacyTarget keeps the payload byte for byte', () => {
    expect(legacyTarget('/', `#/sign?p=${PAYLOAD}`)).toBe(`/sign/#p=${PAYLOAD}`);
    expect(legacyTarget('/index.html', `#/sign?p=${PAYLOAD}`)).toBe(`/sign/#p=${PAYLOAD}`);
    // Two p parameters move as they are, so the sign page still refuses the link.
    expect(legacyTarget('/', '#/sign?p=a&p=b')).toBe('/sign/#p=a&p=b');
  });

  it('maps every page of the old app', () => {
    const A = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
    const cases: [string, string][] = [
      [`#/v/${A}`, `/vault/#${A}`],
      [`#/v/${A}/`, `/vault/#${A}`],
      [`#/v/${A}/verify`, `/verify/#${A}`],
      ['#/proof', '/proof/'],
      ['#/status', '/status/'],
      ['#/developers', '/developers/'],
      ['#/create', '/create/'],
      ['#/create?drill=1', '/create/#drill'],
      ['#/sign', '/sign/'],
    ];
    for (const [hash, want] of cases) expect(legacyTarget('/', hash), hash).toBe(want);
  });

  it('legacyTarget leaves unknown hashes alone', () => {
    for (const hash of [
      '',
      '#',
      '#/',
      '#/nope',
      '#/v',
      '#/v/a/edit',
      '#/v/a/b/c',
      '#p=abc',
      '#drill',
      '#/sign/extra?p=a',
    ]) {
      expect(legacyTarget('/', hash), hash).toBeNull();
    }
    expect(legacyTarget('/vault/', '#/sign?p=a')).toBeNull();
    expect(legacyTarget('/sign/', '#/sign?p=a')).toBeNull();
  });
});

describe('boot script', () => {
  it('redirects a legacy link before it touches the theme', () => {
    const { replace, setAttribute } = page({ hash: '#/v/0xabc/verify', stored: 'light' });
    expect(replace).toHaveBeenCalledWith('/verify/#0xabc');
    expect(setAttribute).not.toHaveBeenCalled();
  });

  it('applies a stored vellum or match-device choice and leaves night to the stylesheet', () => {
    expect(page({ stored: 'light' }).setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    expect(page({ stored: 'system' }).setAttribute).toHaveBeenCalledWith('data-theme', 'system');
    for (const stored of ['dark', 'blue', '', null]) expect(page({ stored }).setAttribute).not.toHaveBeenCalled();
  });

  it('leaves <html> as parseTheme reads the stored value', () => {
    // The inline script cannot import parseTheme; this keeps the two in step.
    for (const stored of [...THEME_CHOICES, 'blue', '', null, 'Dark', ' light']) {
      expect(parseTheme(page({ stored }).theme), String(stored)).toBe(parseTheme(stored));
    }
  });

  it('boot survives a localStorage that throws', () => {
    expect(() => page({ storageThrows: true })).not.toThrow();
    expect(page({ storageThrows: true }).theme).toBeNull();
    expect(page({ storageThrows: true, hash: '#/proof' }).replace).toHaveBeenCalledWith('/proof/');
  });
});
```

`apps/web/test/unit/routes.test.ts`:

```ts
// @vitest-environment node
import { parseSignLink, type SignPayload, signLink } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import {
  createHref,
  isCurrent,
  joinHref,
  LIMITS_HREF,
  legacyTarget,
  NAV,
  ROUTES,
  signHref,
  toSdkSignLink,
  vaultHref,
  verifyHref,
} from '../../src/routes';

const A = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const B = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

describe('routes', () => {
  it('puts every parameter after the #, so it never reaches a server', () => {
    expect(createHref()).toBe('/create/#drill');
    expect(createHref('real')).toBe('/create/#real');
    expect(vaultHref(A)).toBe(`/vault/#${A}`);
    expect(verifyHref(A)).toBe(`/verify/#${A}`);
    expect(joinHref(A, 'heir')).toBe(`/join/#${A}.heir`);
    expect(signHref('AQID')).toBe('/sign/#p=AQID');
    expect(LIMITS_HREF).toBe('/proof/#limits');
    for (const path of Object.values(ROUTES)) expect(path.endsWith('/'), path).toBe(true);
  });

  it('marks the current page whatever the trailing slash', () => {
    expect(isCurrent('/create/', ROUTES.create)).toBe(true);
    expect(isCurrent('/create', ROUTES.create)).toBe(true);
    expect(isCurrent('/create/', createHref('real'))).toBe(true);
    expect(isCurrent('/', ROUTES.home)).toBe(true);
    expect(isCurrent('/proof/', ROUTES.create)).toBe(false);
    expect(isCurrent('/', ROUTES.create)).toBe(false);
  });

  it('navigates only to known routes', () => {
    const known = new Set<string>(Object.keys(ROUTES));
    for (const item of NAV) expect(known.has(item.route), item.route).toBe(true);
  });

  it('an SDK sign link survives the redirect and decodes to the same request', () => {
    const payload: SignPayload = {
      chainId: 196,
      from: A,
      steps: [{ to: B, data: `0x5c19a95c${'00'.repeat(32)}`, value: 1n }],
    };
    const old = new URL(signLink(payload, 'https://atropyle.example/'));
    const moved = new URL(legacyTarget(old.pathname, old.hash) ?? '', old);
    expect(moved.pathname).toBe('/sign/');
    expect(toSdkSignLink(moved.hash)).toBe(old.hash);
    expect(parseSignLink(toSdkSignLink(moved.hash))).toEqual(payload);
  });

  it('keeps two p parameters, so the SDK refuses the link', () => {
    expect(toSdkSignLink('#p=a&p=b')).toBe('#/sign?p=a&p=b');
    expect(() => parseSignLink(toSdkSignLink('#p=a&p=b'))).toThrow(/more than one p/);
    expect(toSdkSignLink('')).toBe('#/sign?');
  });
});
```

Run: `npm test -w apps/web -- boot routes`
Expected: FAIL, không tìm thấy `../../src/theme/boot` và `../../src/routes`.

- [ ] **Step 5: Viết `boot.ts`, `boot-script.tsx` và `routes.ts`**

`apps/web/src/theme/boot.ts`:

```ts
import { KEYS } from '@/lib/store';

/**
 * The old app kept its route in the hash (`#/sign?p=…`, `#/v/<a>/verify`); the SDK, the CLI and the MCP server
 * still print such links. Only the home page redirects, and only the shapes the old app had (spec §3).
 *
 * Self-contained on purpose: its source text runs as the inline boot script, so it uses no import, no outer
 * variable and nothing a compiler would rewrite into a helper call.
 */
export function legacyTarget(pathname: string, hash: string): string | null {
  if (pathname !== '/' && pathname !== '/index.html') return null;
  const m = /^#\/([^?]*)(?:\?(.*))?$/.exec(hash);
  if (m === null) return null;
  const parts = m[1].split('/').filter((p) => p !== '');
  const query = m[2] === undefined ? '' : m[2];
  const first = parts[0];
  if (parts.length === 1) {
    if (first === 'sign') return query === '' ? '/sign/' : `/sign/#${query}`;
    if (first === 'create') return /(^|&)drill=1(&|$)/.test(query) ? '/create/#drill' : '/create/';
    if (first === 'proof' || first === 'status' || first === 'developers') return `/${first}/`;
  }
  if (first === 'v' && parts.length === 2) return `/vault/#${parts[1]}`;
  if (first === 'v' && parts.length === 3 && parts[2] === 'verify') return `/verify/#${parts[1]}`;
  return null;
}

/**
 * Runs before the first paint. Self-contained like legacyTarget, which it receives as an argument. Night needs no
 * attribute (R18.1), so only a stored vellum (`light`) or match device (`system`) sets one; anything else stays
 * night, exactly as parseTheme reads it (test/unit/boot.test.ts checks the two agree).
 */
export function boot(themeKey: string, legacy: (pathname: string, hash: string) => string | null): void {
  try {
    const target = legacy(location.pathname, location.hash);
    if (target !== null) {
      location.replace(target);
      return;
    }
  } catch {
    // A failed redirect leaves the visitor on the home page, which works on its own.
  }
  try {
    const stored = localStorage.getItem(themeKey);
    if (stored === 'light' || stored === 'system') document.documentElement.setAttribute('data-theme', stored);
  } catch {
    // Storage is blocked (private window, sandboxed frame): the page stays at night.
  }
}

/** The page's only inline script (Quyết định 14). The CSP hashes it after the build (Task 15). */
export const BOOT_SCRIPT = `(${boot.toString()})(${JSON.stringify(KEYS.theme)},${legacyTarget.toString()});`;
```

`apps/web/src/theme/boot-script.tsx`:

```tsx
import { BOOT_SCRIPT } from './boot';

/** In <head>: redirects legacy links and applies the stored theme before anything paints. */
export function BootScript() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: a constant built from two functions of this file's sibling; no input reaches it.
  return <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />;
}
```

`apps/web/src/routes.ts`:

```ts
export { legacyTarget } from './theme/boot';

/** Every page of the app (spec §3). Parameters always go after the #, which no server ever receives. */
export const ROUTES = {
  home: '/',
  create: '/create/',
  vault: '/vault/',
  verify: '/verify/',
  sign: '/sign/',
  proof: '/proof/',
  me: '/me/',
  join: '/join/',
  alertsConfirm: '/alerts/confirm/',
  alertsUnsubscribe: '/alerts/unsubscribe/',
  status: '/status/',
  developers: '/developers/',
  privacy: '/privacy/',
} as const;

export type RouteName = keyof typeof ROUTES;
export type NavKey = 'navCreate' | 'navMe' | 'navProof' | 'navDevelopers';

export const NAV: readonly { route: RouteName; key: NavKey }[] = [
  { route: 'create', key: 'navCreate' },
  { route: 'me', key: 'navMe' },
  { route: 'proof', key: 'navProof' },
  { route: 'developers', key: 'navDevelopers' },
];

/** What the proof does not check, written next to the proof (R18.7); /proof/ gives the section `id="limits"`. */
export const LIMITS_HREF = `${ROUTES.proof}#limits`;

export function createHref(mode: 'drill' | 'real' = 'drill'): string {
  return `${ROUTES.create}#${mode}`;
}

export function vaultHref(vault: string): string {
  return `${ROUTES.vault}#${vault}`;
}

export function verifyHref(vault: string): string {
  return `${ROUTES.verify}#${vault}`;
}

export function joinHref(vault: string, role: 'guardian' | 'heir'): string {
  return `${ROUTES.join}#${vault}.${role}`;
}

export function signHref(encodedPayload: string): string {
  return `${ROUTES.sign}#p=${encodedPayload}`;
}

/** `/sign/#p=X` → the `#/sign?p=X` form that `parseSignLink` of the SDK reads, byte for byte. */
export function toSdkSignLink(hash: string): string {
  return `#/sign?${hash.startsWith('#') ? hash.slice(1) : hash}`;
}

const bare = (path: string) => (path.length > 1 ? path.replace(/\/+$/, '') : path);

export function isCurrent(pathname: string, href: string): boolean {
  return bare(pathname) === bare(href.split('#')[0]);
}
```

Run: `npm test -w apps/web -- boot routes`
Expected: PASS (boot 7, routes 5).

- [ ] **Step 6: `useLocationHash` và `replaceHash`**

`apps/web/test/unit/hash.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { replaceHash, useLocationHash } from '../../src/lib/hash';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('useLocationHash', () => {
  it('follows the fragment', () => {
    window.history.replaceState(null, '', '/vault/#0xabc');
    const { result } = renderHook(() => useLocationHash());
    expect(result.current).toBe('#0xabc');
    act(() => {
      window.history.replaceState(null, '', '/vault/#0xdef');
      window.dispatchEvent(new Event('hashchange'));
    });
    expect(result.current).toBe('#0xdef');
  });

  it('replaceHash changes the fragment in place and tells every reader', () => {
    window.history.replaceState(null, '', '/create/#drill');
    const entries = window.history.length;
    const { result } = renderHook(() => useLocationHash());
    act(() => replaceHash('#real'));
    expect(window.location.hash).toBe('#real');
    expect(result.current).toBe('#real');
    expect(window.history.length).toBe(entries);
  });
});
```

Run: `npm test -w apps/web -- hash.test`
Expected: FAIL, không tìm thấy `../../src/lib/hash`.

`apps/web/src/lib/hash.ts`:

```ts
'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** `location.hash`, with its `#`; empty while prerendering. Pages parse it themselves. */
export function useLocationHash(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
}

/** Changes the fragment without a history entry (the /create/ mode switch) and notifies useLocationHash. */
export function replaceHash(hash: string): void {
  const next = hash.startsWith('#') ? hash : `#${hash}`;
  window.history.replaceState(window.history.state, '', next);
  window.dispatchEvent(new Event('hashchange'));
}
```

Run: `npm test -w apps/web -- hash.test`
Expected: PASS (2 test).

- [ ] **Step 7: Chuỗi của khung và trang chủ tạm, với số phút của Drill do test tính**

`apps/web/test/unit/drill-minutes.test.ts`:

```ts
// @vitest-environment node
import { computeTimeline, type EvalState, modelEngine, PRESETS, STATE_CODES } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { KEEPER_CADENCE_S } from '../../src/config/facts';
import { messages as home } from '../../src/messages/home.messages';

/** A Drill with no guardians, checked in at t = 0: the vault that "Rehearse it" on the home page starts. */
const DRILL: EvalState = {
  state: STATE_CODES.active,
  owner: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  lastAlive: 0n,
  alarmAt: 0n,
  timing: PRESETS.drill,
  k: 0,
  recoveryEnabled: false,
  guardians: [],
  inhVotes: 0,
  recVotes: [],
  recoveryTarget: null,
};

const timeline = computeTimeline(modelEngine(), DRILL, 0n, null);

/** Release at the earliest, plus two keeper runs (one raises the alarm, one releases), in whole minutes (R18.11). */
function drillMinutes(): number {
  if (timeline.earliestRelease === null) throw new Error('a silent Drill never releases');
  return Math.ceil(Number(timeline.earliestRelease + 2n * BigInt(KEEPER_CADENCE_S)) / 60);
}

describe('the Drill on the home page', () => {
  it('a silent Drill raises the alarm, then releases', () => {
    expect(timeline.events.map((e) => e.kind)).toEqual(['alarm', 'release']);
    expect(timeline.earliestRelease).not.toBeNull();
  });

  it('promises the minutes the rules give, in both languages', () => {
    // If the SDK gives another number, change the copy, never this test (spec §18.4.1 item 4).
    for (const lang of ['en', 'vi'] as const) {
      const numbers = [...home[lang].heroDrill.matchAll(/\d+/g)].map((m) => Number(m[0]));
      expect(numbers, lang).toEqual([drillMinutes()]);
    }
  });

  it('the fee note states no number of its own', () => {
    for (const lang of ['en', 'vi'] as const) expect(home[lang].heroDrillNote, lang).not.toMatch(/\d/);
  });
});
```

Run: `npm test -w apps/web -- drill-minutes`

Expected: FAIL.

- 2 test hỏng, vì `heroDrill` và `heroDrillNote` chưa có trong `home.messages`.
- `a silent Drill raises the alarm, then releases` đã qua: SDK cho báo động ở 120 s, release ở 240 s, và 240 + 2 · 60 = 360 s, tức 6 phút.

Thay toàn bộ `apps/web/src/messages/shell.messages.ts`:

- Giữ mọi khoá cũ.
- Thêm `navMe`, `navLabel`, `footerNav`, `settings`, `notFoundHint`, `knownLimits`, `forHeirs`, `noTrackers`, `proofLine`, `proofLineShort`, `proofLimits`, `proofLimitsShort`.
- Không có nhãn beta: footer có link "Known limits" thay cho nó.
- Bảy khoá ví của Task 11 mỗi khoá nằm trên một dòng.

```ts
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    navCreate: 'Create',
    navMe: 'My vaults',
    navProof: 'Proof',
    navStatus: 'Status',
    navDevelopers: 'Developers',
    navLabel: 'Main',
    footerNav: 'Site',
    settings: 'Settings',
    connect: 'Connect wallet',
    connecting: 'Connecting…',
    disconnect: 'Disconnect',
    noWallet: 'No wallet found. Install OKX Wallet, or open this page in the OKX App browser.',
    chooseWallet: 'Choose a wallet',
    wrongNetwork: 'Your wallet is on chain {actual}. Atropyle runs on {expected} (chain {id}).',
    switchNetwork: 'Switch to {expected}',
    deploymentMissing: 'Atropyle is not available on this network yet.',
    notFoundTitle: 'Page not found',
    notFoundBody: 'There is no page at this link:',
    notFoundHint: 'Check the link for a typo, or start again from the home page.',
    goHome: 'Go to the home page',
    badAddressTitle: 'Not a valid address',
    badAddressBody: 'This link does not contain a valid vault address:',
    footer: 'Atropyle is beta software and has not been audited. Practise with a Drill or small amounts first.',
    knownLimits: 'Known limits',
    forHeirs: 'For heirs and guardians',
    noTrackers: 'No trackers · No cookies',
    proofLine: 'Rules frozen in netlist {keccak} on X Layer · unaudited · {limits}',
    proofLineShort: 'Rules {keccak} · {limits}',
    proofLimits: 'limits →',
    proofLimitsShort: 'unaudited →',
  },
  {
    navCreate: 'Tạo vault',
    navMe: 'Vault của tôi',
    navProof: 'Chứng minh',
    navStatus: 'Trạng thái',
    navDevelopers: 'Nhà phát triển',
    navLabel: 'Điều hướng chính',
    footerNav: 'Liên kết',
    settings: 'Cài đặt',
    connect: 'Kết nối ví',
    connecting: 'Đang kết nối…',
    disconnect: 'Ngắt kết nối',
    noWallet: 'Không tìm thấy ví. Hãy cài OKX Wallet, hoặc mở trang này trong trình duyệt của OKX App.',
    chooseWallet: 'Chọn ví',
    wrongNetwork: 'Ví của bạn đang ở chain {actual}. Atropyle chạy trên {expected} (chain {id}).',
    switchNetwork: 'Chuyển sang {expected}',
    deploymentMissing: 'Atropyle chưa có trên mạng này.',
    notFoundTitle: 'Không tìm thấy trang',
    notFoundBody: 'Không có trang nào ở link này:',
    notFoundHint: 'Hãy kiểm tra link có gõ sai không, hoặc bắt đầu lại từ trang chủ.',
    goHome: 'Về trang chủ',
    badAddressTitle: 'Địa chỉ không hợp lệ',
    badAddressBody: 'Link này không chứa địa chỉ vault hợp lệ:',
    footer: 'Atropyle là phần mềm beta, chưa được kiểm toán. Hãy tập bằng Drill (bản diễn tập) hoặc số tiền nhỏ trước.',
    knownLimits: 'Giới hạn đã biết',
    forHeirs: 'Cho người thừa kế và người giám hộ',
    noTrackers: 'Không tracker · Không cookie',
    proofLine: 'Luật đóng băng trong netlist {keccak} trên X Layer · chưa kiểm toán · {limits}',
    proofLineShort: 'Luật {keccak} · {limits}',
    proofLimits: 'giới hạn →',
    proofLimitsShort: 'chưa kiểm toán →',
  },
);
```

Hai chỗ sửa trong `apps/web/src/messages/home.messages.ts`, một ở object `en`, một ở object `vi`. Mỗi chỗ có neo riêng: bốn dòng cũ cộng dòng `openTitle` ngay sau chúng. Khoá kề đó có giá trị chỉ object của nó có (`'Open a vault'` ở `en`, `'Mở một vault'` ở `vi`), nên mỗi neo khớp đúng một lần trong file, và neo của `en` không khớp ở `vi`. Mỗi chỗ xoá `drillCta` và `drillNote` (lời mời cũ "Try a 5-minute Drill" và "free practice vault" trái với R18.11), giữ `createCta`, `proofCta` và `openTitle`, rồi thêm sáu khoá `hero*` trước `openTitle`.

(a) Object `en`. Đoạn cũ:

```ts
    drillCta: 'Try a 5-minute Drill',
    createCta: 'Create a vault',
    proofCta: 'Check the proof',
    drillNote: 'A Drill is a free practice vault with timings in minutes. It runs the same rules as a real vault.',
    openTitle: 'Open a vault',
```

Đoạn mới:

```ts
    createCta: 'Create a vault',
    proofCta: 'Check the proof',
    heroEyebrow: 'Inheritance and wallet recovery on X Layer',
    heroTitle: 'What happens to your crypto when you can no longer sign?',
    heroLead:
      'Nothing, unless you plan for it. Atropyle watches over your wallet on X Layer. Check in now and then. If you go quiet, the people you chose receive what you left them. Your tokens stay in your wallet until that day.',
    heroDrill: 'Rehearse it in about 6 minutes',
    heroDrillNote: 'No Atropyle fee. You pay only X Layer network gas, in OKB.',
    heroProof: 'See the proof',
    openTitle: 'Open a vault',
```

(b) Object `vi`. Đoạn cũ:

```ts
    drillCta: 'Thử Drill 5 phút',
    createCta: 'Tạo vault',
    proofCta: 'Xem chứng minh',
    drillNote: 'Drill là vault tập miễn phí, thời gian tính bằng phút. Drill chạy đúng luật như vault thật.',
    openTitle: 'Mở một vault',
```

Đoạn mới:

```ts
    createCta: 'Tạo vault',
    proofCta: 'Xem chứng minh',
    heroEyebrow: 'Thừa kế và khôi phục ví trên X Layer',
    heroTitle: 'Chuyện gì xảy ra với tài sản crypto của bạn khi bạn không còn ký được nữa?',
    heroLead:
      'Không có gì cả, trừ khi bạn chuẩn bị trước. Atropyle trông chừng ví của bạn trên X Layer. Thỉnh thoảng bạn điểm danh. Nếu bạn im lặng, những người bạn đã chọn sẽ nhận phần bạn để lại. Token của bạn nằm yên trong ví cho tới ngày đó.',
    heroDrill: 'Diễn tập trong khoảng 6 phút',
    heroDrillNote: 'Atropyle không thu phí. Bạn chỉ trả gas của mạng X Layer, bằng OKB.',
    heroProof: 'Xem bằng chứng',
    openTitle: 'Mở một vault',
```

Chỉ trang chủ cũ dùng `drillCta` và `drillNote`; 7A, 7B và 7C không gọi tên chúng. Kiểm không còn file nào của `apps/web` gọi hai khoá (`apps/web-legacy` giữ bản của nó):

```bash
git grep -nE "drillCta|drillNote" -- apps/web
```

Expected: không in gì.

Trong `apps/web/src/messages/ui.messages.ts`, chỉ đổi giá trị của ba nhãn theme, không đổi khoá:

- Ở object `en`, thay ba dòng `themeSystem: 'System',`, `themeLight: 'Light',`, `themeDark: 'Dark',` bằng:

  ```ts
      themeSystem: 'Match device',
      themeLight: 'Vellum',
      themeDark: 'Night',
  ```

- Ở object `vi`, thay `themeSystem: 'Theo hệ thống',`, `themeLight: 'Sáng',`, `themeDark: 'Tối',` bằng:

  ```ts
      themeSystem: 'Theo thiết bị',
      themeLight: 'Giấy da',
      themeDark: 'Đêm',
  ```

Run: `npm test -w apps/web -- drill-minutes i18n`
Expected: PASS (drill-minutes 3, i18n 5). Test i18n kiểm EN và VI có cùng khoá và cùng placeholder: `proofLine` và `proofLineShort` đều có `{keccak}` và `{limits}`, và `home` mất `drillCta`, `drillNote` ở cả hai ngôn ngữ.

- [ ] **Step 8: Dòng bằng chứng**

`apps/web/test/unit/proof-line.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import deployment from '../../../../deployments/xlayer.json';
import { ProofLine } from '../../src/shell/proof-line';
import { renderWithProviders } from '../helpers/render';

const KECCAK = deployment.circuits.netlistKeccak.policy;
const SHORT = `${KECCAK.slice(0, 6)}…${KECCAK.slice(-4)}`;

/** Characters as a reader counts them: `…`, `→` and each Vietnamese letter are one. */
const length = (s: string | null) => Array.from((s ?? '').normalize('NFC')).length;

function variants() {
  const line = screen.getByTestId('proof-line');
  const wide = line.querySelector<HTMLElement>('[data-variant="wide"]');
  const narrow = line.querySelector<HTMLElement>('[data-variant="narrow"]');
  if (wide === null || narrow === null) throw new Error('the proof line needs a wide and a narrow variant');
  return { line, wide, narrow };
}

describe('ProofLine', () => {
  it('states the frozen netlist and links it to the proof and its limits', () => {
    renderWithProviders(<ProofLine />);
    const { line, wide, narrow } = variants();
    expect(line.tagName).toBe('P');
    expect(line.className.split(/\s+/)).toEqual(expect.arrayContaining(['h-6', 'font-mono', 'text-caption']));
    expect(wide.textContent).toBe(`Rules frozen in netlist ${SHORT} on X Layer · unaudited · limits →`);
    expect(narrow.textContent).toBe(`Rules ${SHORT} · unaudited →`);
    expect(wide.className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', 'md:inline']));
    expect(narrow.className.split(/\s+/)).toContain('md:hidden');
    for (const v of [wide, narrow]) {
      const links = Array.from(v.querySelectorAll('a'));
      expect(links).toHaveLength(2);
      expect(links[0].textContent).toBe(SHORT);
      expect(links[0].getAttribute('href')).toBe('/proof/');
      expect(links[0].getAttribute('title')).toBe(KECCAK);
      expect(links[1].getAttribute('href')).toBe('/proof/#limits');
    }
  });

  it('speaks Vietnamese in sentence case', async () => {
    renderWithProviders(<ProofLine />, { lang: 'vi' });
    await waitFor(() => expect(variants().narrow.textContent).toBe(`Luật ${SHORT} · chưa kiểm toán →`));
    expect(variants().wide.textContent).toBe(
      `Luật đóng băng trong netlist ${SHORT} trên X Layer · chưa kiểm toán · giới hạn →`,
    );
  });

  it('fits one line: 36 characters on a phone, 96 from 48rem', async () => {
    // 12 px mono is about 7.2 px a character: 36 fit a 320 px phone inside 16 px gutters, 96 fit 48rem.
    for (const lang of ['en', 'vi'] as const) {
      const { unmount } = renderWithProviders(<ProofLine />, { lang });
      await waitFor(() => expect(variants().narrow.textContent).toContain(lang === 'vi' ? 'Luật' : 'Rules'));
      const { wide, narrow } = variants();
      expect(length(narrow.textContent), `${lang} narrow`).toBeLessThanOrEqual(36);
      expect(length(wide.textContent), `${lang} wide`).toBeLessThanOrEqual(96);
      unmount();
    }
  });
});
```

Run: `npm test -w apps/web -- proof-line`
Expected: FAIL, không tìm thấy `../../src/shell/proof-line`.

`apps/web/src/shell/proof-line.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { POLICY_NETLIST_KECCAK } from '@/config/facts';
import { useT } from '@/i18n/provider';
import { messages as shell } from '@/messages/shell.messages';
import { LIMITS_HREF, ROUTES } from '@/routes';

/** `0x7016…3864`: the first four and the last four hex digits; the full hash is the link's title. */
const SHORT = `${POLICY_NETLIST_KECCAK.slice(0, 6)}…${POLICY_NETLIST_KECCAK.slice(-4)}`;
const LINK =
  'rounded-sm text-thread underline decoration-thread/40 underline-offset-2 transition-colors duration-150 hover:decoration-thread';

/**
 * Splits a template at `{keccak}` and `{limits}`, so both links sit inside one translated sentence. A template
 * without both, in that order, is a bug; test/unit/proof-line.test.tsx renders both languages, so it fails there.
 */
function around(template: string): [string, string, string] {
  const k = template.indexOf('{keccak}');
  const l = template.indexOf('{limits}');
  if (k < 0 || l < k) throw new Error(`the proof line needs {keccak} before {limits}: ${template}`);
  return [template.slice(0, k), template.slice(k + '{keccak}'.length, l), template.slice(l + '{limits}'.length)];
}

function Variant({ variant, template, limits }: { variant: 'wide' | 'narrow'; template: string; limits: string }) {
  const [before, between, after] = around(template);
  return (
    <span data-variant={variant} className={variant === 'wide' ? 'hidden md:inline' : 'md:hidden'}>
      {before}
      {/* prefetch stays off until /proof/ exists (Quyết định 22; 7C T3 turns it on). */}
      <Link href={ROUTES.proof} prefetch={false} title={POLICY_NETLIST_KECCAK} className={LINK}>
        {SHORT}
      </Link>
      {between}
      <Link href={LIMITS_HREF} prefetch={false} className={LINK}>
        {limits}
      </Link>
      {after}
    </span>
  );
}

/**
 * The first line every page shows (R18.7): where the guarantee lives (the netlist frozen on X Layer) and where it
 * stops (unaudited, the known limits). Prerendered, one 24 px line, never dismissable. Both variants are in the
 * HTML and CSS picks one, so nothing measures the width in JS.
 */
export function ProofLine() {
  const t = useT(shell);
  return (
    <p
      data-testid="proof-line"
      className="h-6 whitespace-nowrap border-line/60 border-b bg-surface-1 px-4 text-center font-mono text-caption text-ink-muted leading-6"
    >
      <Variant variant="wide" template={t('proofLine')} limits={t('proofLimits')} />
      <Variant variant="narrow" template={t('proofLineShort')} limits={t('proofLimitsShort')} />
    </p>
  );
}
```

`t('proofLine')` không truyền tham số, nên `format` giữ nguyên `{keccak}` và `{limits}`, và `around` cắt chuỗi tại hai chỗ đó. Dòng này không có `overflow-hidden`, để vòng focus của hai link không bị cắt.

Run: `npm test -w apps/web -- proof-line`
Expected: PASS (3 test). Độ dài đo được:

| Bản | EN | VI |
| --- | --- | --- |
| hẹp | 31 | 35 |
| rộng | 69 | 83 |

- [ ] **Step 9: Viết test hỏng cho khung**

`apps/web/test/unit/shell.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NotFound from '../../src/app/not-found';
import { HomeHero } from '../../src/home/hero';
import { REPO_URL } from '../../src/lib/links';
import { KEYS } from '../../src/lib/store';
import { messages as home } from '../../src/messages/home.messages';
import { Footer } from '../../src/shell/footer';
import { Frame } from '../../src/shell/frame';
import { Header } from '../../src/shell/header';
import { LangSwitch } from '../../src/shell/lang-switch';
import { MobileMenu } from '../../src/shell/mobile-menu';
import { ThemeSwitch } from '../../src/shell/theme-switch';
import { Wordmark } from '../../src/shell/wordmark';
import { GLYPH_NAMES } from '../../src/thread/glyphs';
import { renderWithProviders } from '../helpers/render';

vi.mock('next/navigation', () => ({ usePathname: () => '/create/' }));

const root = document.documentElement;
afterEach(() => root.removeAttribute('data-theme'));

describe('Frame', () => {
  it('skips to the main content without touching the hash', () => {
    window.history.replaceState(null, '', '/vault/#0xabc');
    renderWithProviders(
      <Frame>
        <p>Body</p>
      </Frame>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip to content' }));
    expect(document.activeElement?.tagName).toBe('MAIN');
    expect(window.location.hash).toBe('#0xabc');
    window.history.replaceState(null, '', '/');
  });

  it('marks the current page in the navigation', () => {
    renderWithProviders(
      <Frame>
        <p>Body</p>
      </Frame>,
    );
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const create = nav.querySelector('a[href="/create/"]');
    expect(create?.getAttribute('aria-current')).toBe('page');
    expect(nav.querySelector('a[href="/proof/"]')?.getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'Atropyle home' }).getAttribute('href')).toBe('/');
  });

  it('opens with the skip button for the keyboard, then the proof line, then the header', () => {
    renderWithProviders(
      <Frame>
        <p>Body</p>
      </Frame>,
    );
    // Found by role and test id, never by child index: the proof line is the first visible band, right after the skip
    // link, whatever later tasks put around the three.
    const skip = screen.getByRole('button', { name: 'Skip to content' });
    const proof = screen.getByTestId('proof-line');
    const header = screen.getByRole('banner');
    expect(skip.compareDocumentPosition(proof) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(proof.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(proof.contains(screen.getAllByRole('link')[0])).toBe(true);
  });
});

describe('Header', () => {
  it('is solid below 48rem, blurs only from 48rem, and wears the mark', () => {
    renderWithProviders(<Header />);
    const cls = screen.getByRole('banner').className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(['site-header', 'sticky', 'bg-bg/95', 'md:bg-bg/80']));
    expect(cls.filter((c) => c.includes('backdrop-blur'))).toEqual(['md:backdrop-blur-md']);
    const homeLink = screen.getByRole('link', { name: 'Atropyle home' });
    expect(homeLink.querySelector('svg[data-glyph="mark"]')).not.toBeNull();
  });
});

describe('Wordmark', () => {
  it('draws the mark in one stroke, in the thread colour, before the name', () => {
    expect(GLYPH_NAMES).toContain('mark');
    const { container } = renderWithProviders(<Wordmark />);
    const mark = container.querySelector('svg[data-glyph="mark"]');
    expect(mark?.querySelectorAll('path')).toHaveLength(1);
    expect(mark?.getAttribute('class')).toContain('text-thread');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toBe('Atropyle');
  });
});

describe('settings', () => {
  it('switches language with native radios and remembers it', async () => {
    const { kv } = renderWithProviders(<LangSwitch />);
    expect(screen.getByRole('group', { name: 'Language' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Tiếng Việt' }));
    await waitFor(() => expect(document.documentElement.lang).toBe('vi'));
    expect(kv.get(KEYS.lang)).toBe('vi');
    expect((screen.getByRole('radio', { name: 'Tiếng Việt' }) as HTMLInputElement).checked).toBe(true);
  });

  it('opens at night, then switches to vellum, to match device and back to night', async () => {
    const { kv } = renderWithProviders(<ThemeSwitch />);
    const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;
    await waitFor(() => expect(radio('Night').checked).toBe(true));
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['dark', 'light', 'system']);
    fireEvent.click(radio('Vellum'));
    await waitFor(() => expect(root.getAttribute('data-theme')).toBe('light'));
    expect(kv.get(KEYS.theme)).toBe('light');
    fireEvent.click(radio('Match device'));
    await waitFor(() => expect(root.getAttribute('data-theme')).toBe('system'));
    fireEvent.click(radio('Night'));
    await waitFor(() => expect(root.hasAttribute('data-theme')).toBe(false));
    expect(kv.get(KEYS.theme)).toBe('dark');
    expect(radio('Night').checked).toBe(true);
  });

  it('names the three themes in Vietnamese', async () => {
    renderWithProviders(<ThemeSwitch />, { lang: 'vi' });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Đêm' })).toBeTruthy());
    expect(screen.getByRole('radio', { name: 'Giấy da' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Theo thiết bị' })).toBeTruthy();
  });

  it('opens the navigation as a sheet on narrow screens', async () => {
    renderWithProviders(<MobileMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const sheet = await screen.findByRole('dialog', { name: 'Menu' });
    expect(sheet.querySelector('a[href="/create/"]')?.getAttribute('aria-current')).toBe('page');
    expect(sheet.querySelector('input[type="radio"]')).not.toBeNull();
  });
});

describe('Footer', () => {
  it('names its limits, the page for heirs and what it never collects, and links out in a new tab', () => {
    renderWithProviders(<Footer />);
    expect(screen.getByRole('contentinfo').classList.contains('site-footer')).toBe(true);
    expect(screen.getByRole('link', { name: 'Known limits' }).getAttribute('href')).toBe('/proof/#limits');
    expect(screen.getByRole('link', { name: 'For heirs and guardians' }).getAttribute('href')).toBe('/verify/');
    expect(screen.getByText('No trackers · No cookies')).toBeTruthy();
    const source = screen.getByRole('link', { name: /Source code/ });
    expect(source.getAttribute('href')).toBe(REPO_URL);
    expect(source.getAttribute('target')).toBe('_blank');
    expect(screen.getByText('Version 0.0.0-test')).toBeTruthy();
    expect(screen.getByText('100% on-chain')).toBeTruthy();
    expect(screen.queryByText(/Beta —/)).toBeNull();
  });
});

describe('pages', () => {
  it('the 404 page shows the missing path as text', () => {
    window.history.replaceState(null, '', '/nope/<img src=x>');
    const { container } = renderWithProviders(<NotFound />);
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('/nope/');
    expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe('/');
    window.history.replaceState(null, '', '/');
  });

  it('the home page asks its question, offers a Drill that says what it costs, and the proof', () => {
    renderWithProviders(<HomeHero />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'What happens to your crypto when you can no longer sign?' }),
    ).toBeTruthy();
    // The number in heroDrill is pinned by drill-minutes.test.ts.
    const drill = screen.getByRole('link', { name: home.en.heroDrill });
    expect(drill.getAttribute('href')).toBe('/create/#drill');
    const note = document.getElementById(drill.getAttribute('aria-describedby') ?? '');
    expect(note?.textContent).toBe('No Atropyle fee. You pay only X Layer network gas, in OKB.');
    expect(screen.getByRole('link', { name: 'See the proof' }).getAttribute('href')).toBe('/proof/');
    const lead = screen.getByText(/^Nothing, unless you plan for it\./);
    // True for a vault without guardians too (spec §18.4.1 item 4).
    expect(lead.textContent).toContain('the people you chose receive');
    expect(lead.textContent).not.toContain('guardians confirm');
  });

  it('the home page speaks Vietnamese', async () => {
    renderWithProviders(<HomeHero />, { lang: 'vi' });
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Chuyện gì xảy ra với tài sản crypto của bạn khi bạn không còn ký được nữa?',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: home.vi.heroDrill }).getAttribute('href')).toBe('/create/#drill');
    expect(screen.getByText(home.vi.heroDrillNote)).toBeTruthy();
  });
});
```

`apps/web/test/unit/no-html-sinks.test.ts`:

```ts
// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const SINKS =
  /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write|\beval\s*\(|new Function\s*\(|\brenderSVG\s*\(/;
/** The one inline script (Quyết định 14); its content is a constant. */
const ALLOWED = new Set(['theme/boot-script.tsx']);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

it('no file writes HTML from a string, except the boot script', () => {
  const offenders = files(SRC)
    .map((f) => relative(SRC, f).replaceAll('\\', '/'))
    .filter((f) => !ALLOWED.has(f) && SINKS.test(readFileSync(join(SRC, f), 'utf8')));
  expect(offenders).toEqual([]);
});
```

Run: `npm test -w apps/web -- shell no-html-sinks`

Expected: FAIL, vì `shell` không tìm thấy `../../src/app/not-found` và các module `src/shell/*`. `no-html-sinks` qua ngay: nó là lưới cho các bước sau, và `boot-script.tsx` nằm trong `ALLOWED`.

- [ ] **Step 10: Glyph `mark` và các thành phần của khung**

`apps/web/src/thread/glyphs.tsx` (của Task 7) có bốn chỗ sửa. Bản ghi hình tên là `SHAPES` trong văn bản của Task 7. Nếu bản đã commit đặt tên khác, thêm vào bản ghi đó.

- Trong union `GlyphName`, thay dòng cuối `  | 'knot';` bằng:

  ```ts
    | 'knot'
    | 'mark';
  ```

- Trong mảng `GLYPH_NAMES`, thêm `'mark',` ngay sau `'knot',`.
- Đổi chú thích `/** Eight glyphs in the thread's own line (spec §4.5): …` thành `/** Nine glyphs in the thread's own line (spec §4.5): …`. Phần còn lại của dòng giữ nguyên.
- Trong `SHAPES`, thêm ngay sau mục `knot: { … },`:

  ```ts
    // The mark: the thread rises into the gate's arch and goes on beyond it, in one stroke (§18.4.1 item 8).
    mark: { d: ['M2 18c2.5 0 4.5-1 4.5-4v-3a5.5 5.5 0 0 1 11 0v3c0 3 2 4 4.5 4'] },
  ```

Path này không có dấu phẩy, nên vẫn khớp regex `/^M[0-9.\- a-zA-Z]+$/` của test glyph.

Test glyph của Task 7 duyệt `GLYPH_NAMES`, nên giờ nó kiểm cả `mark`: `aria-hidden`, nét `currentColor` 1,5, và hình khác mọi glyph còn lại. Đổi tên của test đó cho đúng số glyph:

```bash
sed -i "s/it('draws eight distinct glyphs,/it('draws nine distinct glyphs,/" apps/web/test/unit/thread.test.tsx
grep -c "draws nine distinct glyphs" apps/web/test/unit/thread.test.tsx
```

Expected: `1`.

`apps/web/src/shell/wordmark.tsx`:

```tsx
import { cn } from '@/lib/cn';
import { StateGlyph } from '@/thread/glyphs';

/** The mark (the thread rises into the gate's arch and goes on beyond it), then the name. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-display text-ink text-title tracking-tight', className)}>
      <StateGlyph name="mark" size={28} className="text-thread" />
      <span>Atropyle</span>
    </span>
  );
}
```

`apps/web/src/shell/skip-link.tsx`:

```tsx
'use client';

import { useT } from '@/i18n/provider';
import { messages as ui } from '@/messages/ui.messages';

/**
 * A button, not `<a href="#main">`: the hash carries page parameters (the vault address, the signing payload), and
 * a fragment link would overwrite them. It is the first element of every page (WCAG 2.4.1).
 */
export function SkipLink({ targetId }: { targetId: string }) {
  const t = useT(ui);
  return (
    <button
      type="button"
      onClick={() => document.getElementById(targetId)?.focus()}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:rounded-full focus:bg-thread focus:px-4 focus:py-2 focus:font-medium focus:text-on-thread focus:text-small"
    >
      {t('skip')}
    </button>
  );
}
```

`apps/web/src/shell/lang-switch.tsx`:

```tsx
'use client';

import { useId } from 'react';
import type { Lang } from '@/i18n/core';
import { useLang, useT } from '@/i18n/provider';
import { messages as ui } from '@/messages/ui.messages';

const OPTIONS: readonly { value: Lang; label: 'langEn' | 'langVi' }[] = [
  { value: 'en', label: 'langEn' },
  { value: 'vi', label: 'langVi' },
];

/** Native radios in a fieldset (spec §6): arrow keys move between them and screen readers announce a group. */
export function LangSwitch() {
  const { lang, setLang } = useLang();
  const t = useT(ui);
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-caption text-ink-muted">{t('language')}</legend>
      <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-surface-2 p-1">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            lang={o.value}
            className="cursor-pointer rounded-full px-3 py-1.5 text-center text-ink-muted text-small transition-colors duration-150 hover:text-ink has-checked:bg-surface-1 has-checked:text-ink has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-thread has-focus-visible:outline-offset-2"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={lang === o.value}
              onChange={() => setLang(o.value)}
              className="sr-only"
            />
            {t(o.label)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
```

`apps/web/src/shell/theme-switch.tsx`:

```tsx
'use client';

import { type LucideIcon, Monitor, Moon, Sun } from 'lucide-react';
import { useId } from 'react';
import { useT } from '@/i18n/provider';
import { messages as ui } from '@/messages/ui.messages';
import { withViewTransition } from '@/motion/view-transition';
import { useTheme } from '@/theme/provider';
import { THEME_CHOICES, type ThemeChoice } from '@/theme/theme';

const OPTION: Record<ThemeChoice, { label: 'themeDark' | 'themeLight' | 'themeSystem'; Icon: LucideIcon }> = {
  dark: { label: 'themeDark', Icon: Moon },
  light: { label: 'themeLight', Icon: Sun },
  system: { label: 'themeSystem', Icon: Monitor },
};

/**
 * Night, Vellum, Match device (R18.1), in the order of THEME_CHOICES. Icon above the word, so "Match device" fits
 * the 18rem popover in both languages. The new theme crossfades in through a View Transition where the browser has
 * one (reduced motion: instant).
 */
export function ThemeSwitch() {
  const { choice, setChoice } = useTheme();
  const t = useT(ui);
  const name = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-caption text-ink-muted">{t('theme')}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface-2 p-1">
        {THEME_CHOICES.map((value) => {
          const { label, Icon } = OPTION[value];
          return (
            <label
              key={value}
              className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-center text-caption text-ink-muted leading-tight transition-colors duration-150 hover:text-ink has-checked:bg-surface-1 has-checked:text-ink has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-thread has-focus-visible:outline-offset-2"
            >
              <input
                type="radio"
                name={name}
                value={value}
                checked={choice === value}
                onChange={() => withViewTransition(() => setChoice(value))}
                className="sr-only"
              />
              <Icon aria-hidden="true" size={16} strokeWidth={1.5} />
              {t(label)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
```

`apps/web/src/shell/haptics-switch.tsx`:

```tsx
'use client';

import { useT } from '@/i18n/provider';
import { messages as ui } from '@/messages/ui.messages';
import { useHaptics } from '@/motion/haptics';

/** Shown only on devices that can vibrate (spec §4.4: it can be turned off). */
export function HapticsSwitch() {
  const { supported, enabled, setEnabled } = useHaptics();
  const t = useT(ui);
  if (!supported) return null;
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-ink text-small">
      {t('hapticsOn')}
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => setEnabled(e.currentTarget.checked)}
        className="size-5 accent-thread"
      />
    </label>
  );
}
```

`apps/web/src/shell/nav-list.tsx`:

```tsx
'use client';

import { ChevronRight } from 'lucide-react';
import { m } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as shell } from '@/messages/shell.messages';
import { SPRING } from '@/motion/tokens';
import { isCurrent, NAV, ROUTES } from '@/routes';

/**
 * The main navigation. `bar`: one row in the header, a thread under the current page that slides to the next one.
 * `sheet`: large rows in the mobile menu. Quyết định 22: no prefetch until every target route exists.
 */
export function NavList({ layout, onNavigate }: { layout: 'bar' | 'sheet'; onNavigate?(): void }) {
  const t = useT(shell);
  const pathname = usePathname() ?? '/';
  return (
    <ul className={layout === 'bar' ? 'flex items-center gap-1' : 'flex flex-col'}>
      {NAV.map((item) => {
        const href = ROUTES[item.route];
        const current = isCurrent(pathname, href);
        return (
          <li key={item.route}>
            <Link
              href={href}
              prefetch={false}
              onClick={onNavigate}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'transition-colors duration-150',
                layout === 'bar'
                  ? 'relative block rounded-full px-3 py-2 text-small'
                  : 'flex h-12 items-center justify-between rounded-xl px-3 font-display text-title hover:bg-surface-2',
                current ? 'text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {t(item.key)}
              {layout === 'bar' && current ? (
                <m.span
                  layoutId="nav-thread"
                  transition={SPRING}
                  aria-hidden="true"
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-thread"
                />
              ) : null}
              {layout === 'sheet' ? (
                <ChevronRight aria-hidden="true" size={18} strokeWidth={1.5} className="text-ink-muted" />
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
```

`apps/web/src/shell/settings-menu.tsx`:

```tsx
'use client';

import { Settings } from 'lucide-react';
import { useT } from '@/i18n/provider';
import { messages as shell } from '@/messages/shell.messages';
import { IconButton } from '@/ui/icon-button';
import { Popover } from '@/ui/popover';
import { HapticsSwitch } from './haptics-switch';
import { LangSwitch } from './lang-switch';
import { ThemeSwitch } from './theme-switch';

export function SettingsMenu() {
  const t = useT(shell);
  return (
    <Popover
      label={t('settings')}
      trigger={<IconButton icon={Settings} label={t('settings')} tooltip={false} />}
      className="flex w-72 flex-col gap-5 p-4"
    >
      <LangSwitch />
      <ThemeSwitch />
      <HapticsSwitch />
    </Popover>
  );
}
```

`apps/web/src/shell/mobile-menu.tsx`:

```tsx
'use client';

import { Menu } from 'lucide-react';
import { useState } from 'react';
import { useT } from '@/i18n/provider';
import { messages as shell } from '@/messages/shell.messages';
import { messages as ui } from '@/messages/ui.messages';
import { Dialog } from '@/ui/dialog';
import { IconButton } from '@/ui/icon-button';
import { HapticsSwitch } from './haptics-switch';
import { LangSwitch } from './lang-switch';
import { NavList } from './nav-list';
import { ThemeSwitch } from './theme-switch';

/** Below 48rem the navigation and the settings live in one bottom sheet. */
export function MobileMenu() {
  const t = useT(shell);
  const u = useT(ui);
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={u('menu')}
      trigger={<IconButton icon={Menu} label={u('menu')} tooltip={false} />}
    >
      <nav aria-label={t('navLabel')}>
        <NavList layout="sheet" onNavigate={() => setOpen(false)} />
      </nav>
      <div className="flex flex-col gap-5 border-line border-t pt-5">
        <LangSwitch />
        <ThemeSwitch />
        <HapticsSwitch />
      </div>
    </Dialog>
  );
}
```

`apps/web/src/shell/header.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useT } from '@/i18n/provider';
import { messages as shell } from '@/messages/shell.messages';
import { messages as ui } from '@/messages/ui.messages';
import { ROUTES } from '@/routes';
import { MobileMenu } from './mobile-menu';
import { NavList } from './nav-list';
import { SettingsMenu } from './settings-menu';
import { Wordmark } from './wordmark';

/**
 * Sticky at the top. Solid below 48rem: a blur behind a sticky bar repaints every scrolled frame on a phone
 * (spec §18.4.1 item 7). `site-header` names it for View Transitions, so it stays put between pages.
 */
export function Header() {
  const t = useT(shell);
  const u = useT(ui);
  return (
    <header className="site-header sticky top-0 z-40 border-line/70 border-b bg-bg/95 md:bg-bg/80 md:backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link href={ROUTES.home} prefetch={false} aria-label={u('home')} className="-ml-1 rounded-full p-1">
          <Wordmark />
        </Link>
        <nav aria-label={t('navLabel')} className="ml-6 hidden md:block">
          <NavList layout="bar" />
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden md:block">
            <SettingsMenu />
          </div>
          <div className="md:hidden">
            <MobileMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
```

`apps/web/src/shell/footer.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { ENV, IS_VERCEL } from '@/config/env';
import { useT } from '@/i18n/provider';
import { LICENSE_URL, REPO_URL, XLAYER_URL } from '@/lib/links';
import { messages as shell } from '@/messages/shell.messages';
import { messages as ui } from '@/messages/ui.messages';
import { LIMITS_HREF, ROUTES } from '@/routes';
import { ExternalLink } from '@/ui/external-link';
import { Wordmark } from './wordmark';

const LINK = 'text-ink-muted transition-colors duration-150 hover:text-ink';

/**
 * The known limits instead of a beta badge (R18.7), the page for heirs and guardians, and what the site never
 * collects. Task 15's e2e blocks every third-party request, which keeps "No trackers · No cookies" true.
 */
export function Footer() {
  const t = useT(shell);
  const u = useT(ui);
  return (
    <footer className="site-footer border-line border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="flex max-w-md flex-col items-start gap-3">
            <Wordmark />
            <p className="text-ink-muted text-small">{t('footer')}</p>
            <Link
              href={LIMITS_HREF}
              prefetch={false}
              className="rounded-sm font-medium text-small text-thread underline decoration-thread/40 underline-offset-4 transition-colors duration-150 hover:decoration-thread"
            >
              {t('knownLimits')}
            </Link>
          </div>
          <nav aria-label={t('footerNav')}>
            <ul className="grid grid-cols-2 gap-x-10 gap-y-3 text-small">
              <li>
                <Link href={ROUTES.verify} prefetch={false} className={LINK}>
                  {t('forHeirs')}
                </Link>
              </li>
              <li>
                <ExternalLink href={REPO_URL} className={LINK}>
                  {u('footerSource')}
                </ExternalLink>
              </li>
              <li>
                <Link href={ROUTES.status} prefetch={false} className={LINK}>
                  {t('navStatus')}
                </Link>
              </li>
              <li>
                <ExternalLink href={XLAYER_URL} className={LINK}>
                  {u('footerXLayer')}
                </ExternalLink>
              </li>
              <li>
                <Link href={ROUTES.developers} prefetch={false} className={LINK}>
                  {t('navDevelopers')}
                </Link>
              </li>
              <li>
                <ExternalLink href={LICENSE_URL} className={LINK}>
                  {u('footerLicense')}
                </ExternalLink>
              </li>
              <li>
                <Link href={ROUTES.privacy} prefetch={false} className={LINK}>
                  {u('footerPrivacy')}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-line border-t pt-6 text-caption text-ink-muted">
          <span className="font-mono">{u('footerVersion', { version: ENV.version })}</span>
          <span>{t('noTrackers')}</span>
          {IS_VERCEL ? null : (
            <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-ink">{u('onchainBadge')}</span>
          )}
        </div>
      </div>
    </footer>
  );
}
```

`apps/web/src/shell/frame.tsx`:

```tsx
'use client';

import { type ReactNode, useId } from 'react';
import { Footer } from './footer';
import { Header } from './header';
import { ProofLine } from './proof-line';
import { SkipLink } from './skip-link';

/**
 * Every page. The skip button comes first for the keyboard (WCAG 2.4.1; hidden until focused), then the proof line,
 * the first thing anyone sees (R18.7), then the sticky header, the page and the footer.
 */
export function Frame({ children }: { children: ReactNode }) {
  const mainId = useId();
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink targetId={mainId} />
      <ProofLine />
      <Header />
      <main id={mainId} tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
      <Footer />
    </div>
  );
}
```

`apps/web/src/home/hero.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useId } from 'react';
import { useT } from '@/i18n/provider';
import { messages as home } from '@/messages/home.messages';
import { createHref, ROUTES } from '@/routes';
import { Thread } from '@/thread/thread';
import { buttonClass } from '@/ui/button';

/**
 * The first scene of the home page (spec §5.1). Plan 7B adds the other five. The Drill offer carries its cost in a
 * note right under it, linked with aria-describedby, so no reader hears "6 minutes" without "network gas" (R18.11).
 */
export function HomeHero() {
  const t = useT(home);
  const noteId = useId();
  return (
    <section className="relative isolate flex flex-col gap-12 overflow-hidden pt-16 pb-20 md:pt-28">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 sm:px-6">
        <p className="font-medium text-caption text-thread uppercase tracking-[0.16em]">{t('heroEyebrow')}</p>
        <h1 className="max-w-4xl text-balance font-display text-display">{t('heroTitle')}</h1>
        <p className="max-w-2xl text-pretty text-ink-muted text-lead">{t('heroLead')}</p>
        <div className="flex flex-col gap-3 pt-2">
          <div className="flex flex-wrap gap-3">
            <Link
              href={createHref('drill')}
              prefetch={false}
              aria-describedby={noteId}
              className={buttonClass({ variant: 'primary', size: 'lg' })}
            >
              {t('heroDrill')}
            </Link>
            <Link href={ROUTES.proof} prefetch={false} className={buttonClass({ variant: 'secondary', size: 'lg' })}>
              {t('heroProof')}
            </Link>
          </div>
          <p id={noteId} className="text-ink-muted text-small">
            {t('heroDrillNote')}
          </p>
        </div>
      </div>
      <Thread state="active" remaining={0.72} knots={[0.16, 0.34, 0.52]} shared className="w-full" />
    </section>
  );
}
```

(`Thread` của Task 7 mặc định tỉ lệ 5:1; chỗ gọi chỉ đặt chiều rộng. `remaining={0.72}` cho nhịp `slow`, đúng chỗ e2e `motion.spec.ts` của Task 15 tìm `thread-pulse`.)

`apps/web/src/app/not-found.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useT } from '@/i18n/provider';
import { useMounted } from '@/lib/use-mounted';
import { messages as shell } from '@/messages/shell.messages';
import { Thread } from '@/thread/thread';
import { buttonClass } from '@/ui/button';
import { UntrustedText } from '@/ui/untrusted-text';

/** 404.html. The missing path comes from the address bar, so it is shown only as cleaned, truncated text. */
export default function NotFound() {
  const t = useT(shell);
  const mounted = useMounted();
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
      <p className="text-ink-muted">{t('notFoundHint')}</p>
      <Link href="/" prefetch={false} className={buttonClass({ variant: 'primary', size: 'lg' })}>
        {t('goHome')}
      </Link>
    </section>
  );
}
```

Thay `apps/web/src/app/page.tsx`:

```tsx
import { HomeHero } from '@/home/hero';

export default function HomePage() {
  return <HomeHero />;
}
```

Thay `apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { fontVariables } from '@/fonts';
import { Frame } from '@/shell/frame';
import { Providers } from '@/shell/providers';
import { BootScript } from '@/theme/boot-script';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Atropyle: inheritance and wallet recovery on X Layer', template: '%s · Atropyle' },
  description:
    'A vault for crypto inheritance and wallet recovery on X Layer. A circuit decides every step, and anyone can prove it.',
  applicationName: 'Atropyle',
  // iOS would otherwise turn long numbers (amounts, block numbers) into phone links.
  formatDetection: { telephone: false, address: false, email: false },
};

// Night whatever the device prefers (R18.1). The stylesheet sets color-scheme per theme; this meta only decides the
// canvas before the stylesheet applies, and the browser bar keeps the night colour under every theme.
export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0b0d12',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
      <head>
        <BootScript />
      </head>
      <body>
        <Providers>
          <Frame>{children}</Frame>
        </Providers>
      </body>
    </html>
  );
}
```

`suppressHydrationWarning` chỉ có hiệu lực cho thuộc tính của chính `<html>`. Ở đây có hai thuộc tính như vậy: script boot đặt `data-theme` khi người dùng đã chọn vellum hay "match device", và `LangProvider` đổi `lang`.

Run: `npm test -w apps/web -- shell no-html-sinks proof-line thread`
Expected: PASS (shell 13, no-html-sinks 1, proof-line 3, thread 13, thread-geometry 33, thread-layers 14). Lỗi Biome về format hay thứ tự import thì sửa bằng `npx biome check --write <đường dẫn>` trên đúng các file của task.

- [ ] **Step 11: Test build cho khung**

`apps/web/test/build/shell.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { format } from '../../src/i18n/core';
import { messages as home } from '../../src/messages/home.messages';
import { messages as shell } from '../../src/messages/shell.messages';
import { outOf } from './paths';

const deployment = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../deployments/xlayer.json', import.meta.url)), 'utf8'),
) as { circuits: { netlistKeccak: { policy: string } } };
const KECCAK = deployment.circuits.netlistKeccak.policy;
const SHORT = `${KECCAK.slice(0, 6)}…${KECCAK.slice(-4)}`;

/** The text a reader sees: tags and React's `<!-- -->` separators removed. */
const textOf = (html: string) => html.replace(/<[^>]*>/g, '');
const metas = (html: string, name: string) => html.match(new RegExp(`<meta[^>]*name="${name}"[^>]*>`, 'g')) ?? [];

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} shell`, () => {
    const read = (file: string) => readFileSync(join(outOf(target), file), 'utf8');

    it('runs the boot script in the head, before anything paints', () => {
      const html = read('index.html');
      const head = html.slice(0, html.indexOf('</head>'));
      expect(head).toContain('"atropyle:theme"');
      expect(head).toContain('location.replace');
      expect(html).toMatch(/<html lang="en"/);
    });

    it('opens at night: no theme attribute, one night theme colour, a dark colour scheme', () => {
      const html = read('index.html');
      expect(html.match(/<html[^>]*>/)?.[0]).not.toContain('data-theme');
      const colours = metas(html, 'theme-color');
      expect(colours).toHaveLength(1);
      expect(colours[0]).toContain('content="#0b0d12"');
      expect(colours[0]).not.toContain('media=');
      expect(metas(html, 'color-scheme')).toEqual([expect.stringContaining('content="dark"')]);
    });

    it('prerenders the proof line and the footer on every page, and the home and 404 text', () => {
      const proof = format(shell.en.proofLine, { keccak: SHORT, limits: shell.en.proofLimits });
      for (const file of ['index.html', '404.html']) {
        const html = read(file);
        expect(textOf(html), file).toContain(proof);
        expect(html, file).toContain('href="/proof/#limits"');
        expect(html, file).toContain('href="/verify/"');
        expect(textOf(html), file).toContain(shell.en.noTrackers);
      }
      expect(textOf(read('404.html'))).toContain(shell.en.notFoundTitle);
      const index = textOf(read('index.html'));
      expect(index).toContain(home.en.heroTitle);
      expect(index).toContain(home.en.heroDrill);
    });
  });
}
```

Run: `npm run test:build -w apps/web`

Expected: PASS (thêm 6 test). Nếu một test hỏng, kiểm theo bảng dưới:

| Test hỏng | Kiểm gì |
| --- | --- |
| `head` không chứa `"atropyle:theme"` | Mở `out/index.html` và tìm script boot. Nếu bundler đã đổi cách in hằng chuỗi, so bằng `atropyle:theme` không kèm nháy. |
| test meta | In `metas(html, 'theme-color')` và xem Next 16.4.6 đã in gì từ `viewport`. Sửa `layout.tsx`, không sửa test. |

- [ ] **Step 12: Chạy toàn bộ và commit**

```bash
npm test -w apps/web
npm run typecheck -w apps/web
npx biome ci .
git add apps/web/src/config/facts.ts apps/web/src/theme/theme.ts apps/web/src/theme/provider.tsx apps/web/src/theme/boot.ts apps/web/src/theme/boot-script.tsx
git add apps/web/src/routes.ts apps/web/src/lib/hash.ts apps/web/src/app/globals.css apps/web/src/app/layout.tsx apps/web/src/app/page.tsx apps/web/src/app/not-found.tsx
git add apps/web/src/shell/frame.tsx apps/web/src/shell/header.tsx apps/web/src/shell/proof-line.tsx apps/web/src/shell/nav-list.tsx apps/web/src/shell/settings-menu.tsx apps/web/src/shell/mobile-menu.tsx
git add apps/web/src/shell/footer.tsx apps/web/src/shell/skip-link.tsx apps/web/src/shell/lang-switch.tsx apps/web/src/shell/theme-switch.tsx apps/web/src/shell/haptics-switch.tsx apps/web/src/shell/wordmark.tsx
git add apps/web/src/home/hero.tsx apps/web/src/thread/glyphs.tsx apps/web/src/messages/shell.messages.ts apps/web/src/messages/home.messages.ts apps/web/src/messages/ui.messages.ts
git add apps/web/test/unit/theme.test.tsx apps/web/test/unit/theme-css.test.ts apps/web/test/unit/facts.test.ts apps/web/test/unit/boot.test.ts apps/web/test/unit/routes.test.ts apps/web/test/unit/hash.test.tsx
git add apps/web/test/unit/drill-minutes.test.ts apps/web/test/unit/proof-line.test.tsx apps/web/test/unit/shell.test.tsx apps/web/test/unit/no-html-sinks.test.ts apps/web/test/unit/thread.test.tsx apps/web/test/build/shell.test.ts
git status --porcelain
git commit -m "feat(web): honest frame: night by default, the proof line, legacy link redirect and the first home scene" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected:

- Mọi test unit qua, kể cả `contrast`, `i18n` và `motion` của các task trước.
- `typecheck` và `biome ci` không báo lỗi.
- `git status --porcelain` trước commit không còn dòng nào ngoài các file vừa add. Nếu `deployments/local.json` hiện ra là đã đổi, không add nó.

**Ghi chú cho Task 11.** Task 11 Step 7 sửa `header.tsx` và `frame.tsx` bằng các lệnh `sed` có neo, không thay cả file.

**Ghi chú cho Task 15.**

- `expectAccessibleInBothThemes` và `captureScreens` không đổi được theme bằng `emulateMedia` nữa, vì night là mặc định bất kể thiết bị. Chúng đổi bằng `KEYS.theme` trong `localStorage` rồi tải lại, như §18.4.1 (Task 15) đã ghi.
- `nojs.spec.ts` (mới theo §18.4.1) tìm dòng bằng chứng bằng `page.getByTestId('proof-line')`. Với `javaScriptEnabled: false`, bản hiện ra là bản do CSS chọn theo bề rộng.
- Test nút bỏ qua (`Tab` một lần rồi chờ nút `Skip to content` được focus) vẫn đúng, vì `SkipLink` đứng đầu DOM, trước hai link của dòng bằng chứng.
- `apps/web/src/app/icon.svg` vẽ glyph `mark` thay cho sợi chỉ cũ của wordmark:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" rx="6" fill="#0b0d12"/>
  <path d="M2 18c2.5 0 4.5-1 4.5-4v-3a5.5 5.5 0 0 1 11 0v3c0 3 2 4 4.5 4" fill="none" stroke="#e8b65a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

**Ghi chú cho Plan 7B và 7C.**

- 7C T4 giữ `heroDrillNote` ngay dưới nút Drill, nối bằng `aria-describedby`, và không gõ lại số phút: số đó nằm trong `heroDrill`, do `drill-minutes.test.ts` khoá.
- Task 9 đã xoá hai khoá cũ `drillCta` ("Try a 5-minute Drill") và `drillNote` ("free practice vault") của `home.messages`, ở EN và VI, vì chúng trái với R18.11. 7B và 7C không dựng lại chúng: lời mời Drill là `heroDrill` và `heroDrillNote`.
- `/proof/` (7C T3) phải có phần tử `id="limits"`, vì dòng bằng chứng và footer đều trỏ tới `LIMITS_HREF`.

---

### Task 10: Dữ liệu chain: SDK nạp lười, TanStack Query và các hook đọc

Mọi lần đọc chain đi qua `@atropyle/sdk` và viem, nhưng hai gói này không được vào bundle đầu của `/` (Quyết định 13). Vì vậy mọi mã chạm SDK nằm trong `src/chain/impl/` và chỉ được nạp bằng `import()` qua `loadChainImpl()`; các hook ở ngoài chỉ `import type`. TanStack Query giữ cache, retry và refetch (Quyết định 18).

**Files:**
- Create (port): `apps/web/src/chain/impl/rpc.ts`, `apps/web/src/chain/impl/sdk.ts`, `apps/web/src/chain/impl/stats-view.ts`, `apps/web/test/unit/{rpc,sdk,stats-view}.test.ts`, `apps/web/test/unit/fixtures.ts`
- Create (mới): `apps/web/src/chain/impl/{vault,stats,index}.ts`, `apps/web/src/chain/{types,load,query-client,keys,hooks,use-stats,time}.ts`, `apps/web/src/chain/provider.tsx`
- Modify: `apps/web/src/shell/providers.tsx`, `apps/web/test/helpers/render.tsx`, `apps/web/package.json`, `package-lock.json`
- Test: `apps/web/test/unit/lazy-boundary.test.ts`, `apps/web/test/unit/query-client.test.ts`, `apps/web/test/unit/chain-hooks.test.tsx`, `apps/web/test/unit/chain-impl.test.ts`, `apps/web/test/unit/chain-time.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`ENV`, `chainIdOf`, `type Target`), Task 5 (`KV`, `KEYS`, `readJson`, `writeJson`, `useKV`, `chainNow`), Task 8 (`useNow`, `Providers`, `renderWithProviders`).
- Produces:
  - `src/chain/impl/index.ts` (chỉ nạp qua `loadChainImpl`): `loadDeployment(env: Pick<AppEnv, 'chain' | 'deploymentJson'>): Deployment`; `createSdk(d: Deployment, target: Target, crossCheck: boolean): Sdk`; `rpcPlan(...)`; `loadVault(sdk: Sdk, vault: Address, nowMs?: () => number): Promise<LoadedVault>`; `rolesIn(snap: VaultSnapshot, account: string | null): Role[]`; `vaultsOf(sdk: Sdk, account: Address): Promise<VaultRef[]>`; `cachedStats(sdk: Sdk, kv: KV): CachedStats | null`; `countStats(sdk: Sdk, kv: KV, onProgress?: (done: number, total: number) => void): Promise<CachedStats>`.
  - `src/chain/types.ts` (chỉ kiểu): `Sdk { atro: AtropyleClient; deployment: Deployment; rpc: RpcPlan }`, `RpcPlan`, `LoadedVault { snap: VaultSnapshot; timeline: Timeline; registered: boolean; fetchedAtMs: number }`, `CachedStats`, `StatsSnapshot`.
  - `src/chain/load.ts`: `type ChainImpl`; `loadChainImpl(): Promise<ChainImpl>` (một chunk, nạp một lần, nạp lại được sau lỗi mạng); `peekChainImpl(): ChainImpl | null`.
  - `src/chain/query-client.ts`: `PERMANENT_CODES: ReadonlySet<string>`; `errorCode(e: unknown): string | null`; `shouldRetry(failureCount: number, error: unknown): boolean`; `makeQueryClient(): QueryClient`.
  - `src/chain/keys.ts`: `chainKeys.{all(chainId), sdk(chainId, crossCheck), vault(chainId, vault), vaultsOf(chainId, account), stats(chainId, source: 'api' | 'chain'), me(chainId, account), health(chainId)}`, mỗi khoá là `readonly (string | number)[]`.
  - `src/chain/provider.tsx`: `ChainProvider({ children, client?: QueryClient })`; `useChainSettings(): { crossCheck: boolean; setCrossCheck(on: boolean): void }`.
  - `src/chain/hooks.ts`: `CHAIN_ID: number`; `sdkQuery(crossCheck: boolean)` (`queryOptions` của SDK, cho `fetchQuery`); `useSdk(): UseQueryResult<Sdk>`; `useVault(vault: Address | null): UseQueryResult<LoadedVault>`; `useVaultsOf(account: Address | null): UseQueryResult<VaultRef[]>`; `useInvalidateVault(): (vault: string) => Promise<void>`.
  - `src/chain/use-stats.ts`: `interface StatsSummary { source: 'api' | 'chain'; block: bigint; vaults: number; drills: number; checkIns: number; savedAtMs: number | null }`; `interface StatsState { summary: StatsSummary | null; progress: { done: number; total: number } | null; busy: boolean; error: unknown; refresh(): void }`; `summaryOfCache(c: CachedStats): StatsSummary`; `useChainStats(): StatsState`; `useStats(): StatsState` (Task 14 thêm đường API).
  - `src/chain/time.ts`: `useChainNow(read: { blockTimestamp: bigint; fetchedAtMs: number } | null, intervalMs?: number): bigint | null`.
  - `test/helpers/render.tsx`: `testQueryClient(): QueryClient`; `TestProviders({ kv, queryClient, children })`; `makeWrapper(o?: { kv?: KV; lang?: Lang; queryClient?: QueryClient }): { wrapper; kv; queryClient }`; `renderWithProviders(ui, o?)` trả thêm `queryClient`.

- [ ] **Step 1: Cài TanStack Query, port `rpc`, `sdk`, `stats-view` và test của chúng**

```bash
npm install -E -w apps/web @tanstack/react-query@5.107.1
npm run lockfile:check -- --fix
npm run lockfile:check
L=apps/web-legacy
W=apps/web
mkdir -p $W/src/chain/impl
cp $L/src/lib/rpc.ts $W/src/chain/impl/rpc.ts
sed -i "s#from '../env';#from '@/config/env';#; s#target === 'pages'#target === 'vercel'#; s#(always empty on Pages)#(always empty on Vercel)#" $W/src/chain/impl/rpc.ts
cp $L/src/lib/sdk.ts $W/src/chain/impl/sdk.ts
sed -i "s#from '../env';#from '@/config/env';#; s#VITE_DEPLOYMENT is not valid JSON.#NEXT_PUBLIC_DEPLOYMENT is not valid JSON.#" $W/src/chain/impl/sdk.ts
cp $L/src/lib/stats-view.ts $W/src/chain/impl/stats-view.ts
sed -i "s#from './store';#from '@/lib/store';#" $W/src/chain/impl/stats-view.ts
cp $L/test/unit/fixtures.ts $W/test/unit/fixtures.ts
cp $L/test/unit/rpc.test.ts $W/test/unit/rpc.test.ts
sed -i "s#'../../src/lib/rpc'#'../../src/chain/impl/rpc'#; s#'pages'#'vercel'#; s#on GitHub Pages#on Vercel#" $W/test/unit/rpc.test.ts
cp $L/test/unit/sdk.test.ts $W/test/unit/sdk.test.ts
sed -i "s#'../../src/lib/sdk'#'../../src/chain/impl/sdk'#" $W/test/unit/sdk.test.ts
cp $L/test/unit/stats-view.test.ts $W/test/unit/stats-view.test.ts
sed -i "s#'../../src/lib/stats-view'#'../../src/chain/impl/stats-view'#" $W/test/unit/stats-view.test.ts
grep -n "pages\|VITE_\|'\.\./env'\|'\./store'" $W/src/chain/impl/*.ts $W/test/unit/rpc.test.ts
```

Expected: `every dependency resolves.`; lệnh `grep` cuối không in gì.

Run: `npm test -w apps/web -- rpc sdk stats-view`
Expected: PASS (rpc 4, sdk 3, stats-view 5).

- [ ] **Step 2: Viết test hỏng cho phần mới của `impl`, cho query client và cho ranh giới nạp lười**

`apps/web/test/unit/chain-impl.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Sdk } from '../../src/chain/impl/sdk';
import { loadVault, rolesIn } from '../../src/chain/impl/vault';
import { fixtureDeployment, fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

vi.mock('@atropyle/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@atropyle/sdk')>()),
  timelineOf: () => fixtureTimeline(),
}));

describe('chain impl', () => {
  it('loads a vault at one block: snapshot, registration and timeline', async () => {
    const snap = fixtureSnapshot();
    const registered = vi.fn(async () => true);
    const engineFor = vi.fn(async () => ({}));
    const sdk = {
      atro: { vault: () => ({ snapshot: async () => snap, registered }), engineFor },
      deployment: fixtureDeployment(),
    } as unknown as Sdk;
    const loaded = await loadVault(sdk, PEOPLE.vault, () => 42);
    expect(registered).toHaveBeenCalledWith({ blockNumber: snap.status.blockNumber });
    expect(engineFor).toHaveBeenCalledWith(snap.binding.cpu, snap.binding.policyId);
    expect(loaded).toEqual({ snap, timeline: fixtureTimeline(), registered: true, fetchedAtMs: 42 });
  });

  it('finds the roles of an account and none for a stranger or garbage', () => {
    const snap = fixtureSnapshot();
    expect(rolesIn(snap, PEOPLE.owner)).toContain('owner');
    expect(rolesIn(snap, PEOPLE.heirB)).toEqual(expect.arrayContaining(['heir', 'guardian']));
    expect(rolesIn(snap, PEOPLE.stranger)).toEqual([]);
    expect(rolesIn(snap, null)).toEqual([]);
    expect(rolesIn(snap, 'not an address')).toEqual([]);
  });
});
```

`apps/web/test/unit/query-client.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { chainKeys } from '../../src/chain/keys';
import { errorCode, PERMANENT_CODES, shouldRetry } from '../../src/chain/query-client';

const fail = (code: string) => Object.assign(new Error(code), { code });

describe('query client', () => {
  it('retries a passing failure twice and a permanent one never', () => {
    expect(shouldRetry(0, fail('RPC_UNAVAILABLE'))).toBe(true);
    expect(shouldRetry(1, new TypeError('Failed to fetch'))).toBe(true);
    expect(shouldRetry(2, fail('RPC_UNAVAILABLE'))).toBe(false);
    for (const code of PERMANENT_CODES) expect(shouldRetry(0, fail(code)), code).toBe(false);
    expect(errorCode('text')).toBeNull();
    expect(errorCode({ code: 7 })).toBeNull();
  });

  it('builds keys from plain strings and numbers only, addresses lowercased', () => {
    const A = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
    const keys = [
      chainKeys.all(196),
      chainKeys.sdk(196, true),
      chainKeys.vault(196, A),
      chainKeys.vaultsOf(196, A),
      chainKeys.stats(196, 'chain'),
      chainKeys.me(196, A),
      chainKeys.health(196),
    ];
    for (const k of keys) {
      expect(JSON.parse(JSON.stringify(k))).toEqual(k);
      for (const part of k) expect(['string', 'number']).toContain(typeof part);
    }
    expect(chainKeys.vault(196, A)).toEqual(['atropyle', 196, 'vault', A.toLowerCase()]);
    expect(chainKeys.sdk(196, false)).toEqual(['atropyle', 196, 'sdk', 'own']);
  });
});
```

`apps/web/test/unit/lazy-boundary.test.ts`:

```ts
// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
/** Modules that may reach a page's first bundle only as types (Quyết định 13). */
const GUARDED = /^(?:@atropyle\/sdk|viem)(?:\/|$)|(?:^|\/)impl(?:\/|$)/;
const STATEMENT = /^\s*(?:import|export)\b([^;]*?)\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;

const exempt = (rel: string) => /(^|\/)impl\//.test(rel) || rel.startsWith('workers/') || /^app\/[^/]+\//.test(rel);

/** Every runtime import of a guarded module in `source`. */
function runtimeImports(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(STATEMENT)) {
    const spec = m[2] ?? m[3];
    const typeOnly = m[2] !== undefined && /^\s*type\s/.test(m[1]);
    if (GUARDED.test(spec) && !typeOnly) out.push(spec);
  }
  return out;
}

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

describe('lazy boundary', () => {
  it('catches value imports and lets type imports through', () => {
    expect(runtimeImports("import { getAddress } from 'viem';")).toEqual(['viem']);
    expect(runtimeImports("import {\n  type A,\n  b,\n} from '@atropyle/sdk';")).toEqual(['@atropyle/sdk']);
    expect(runtimeImports("export { loadVault } from './impl/vault';")).toEqual(['./impl/vault']);
    expect(runtimeImports("import '@atropyle/sdk/verify';")).toEqual(['@atropyle/sdk/verify']);
    expect(runtimeImports("import type { Address } from 'viem';")).toEqual([]);
    expect(runtimeImports("export type { Sdk } from './impl/sdk';")).toEqual([]);
    expect(runtimeImports("const impl = await import('./impl');")).toEqual([]);
  });

  it('no file outside impl/, workers/ and route folders imports the SDK, viem or impl at runtime', () => {
    const all = files(SRC).map((f) => relative(SRC, f).replaceAll('\\', '/'));
    const checked = all.filter((f) => !exempt(f));
    const offenders = checked.flatMap((f) =>
      runtimeImports(readFileSync(join(SRC, f), 'utf8')).map((spec) => `${f}: ${spec}`),
    );
    expect(offenders).toEqual([]);
    expect(checked).toContain('chain/hooks.ts');
    expect(checked.length).toBeGreaterThan(40);
  });
});
```

Run: `npm test -w apps/web -- chain-impl query-client lazy-boundary`
Expected: FAIL, không tìm thấy `../../src/chain/impl/vault`, `../../src/chain/keys`, `../../src/chain/query-client`; `lazy-boundary` hỏng ở `toContain('chain/hooks.ts')`.

- [ ] **Step 3: Viết `impl/vault.ts`, `impl/stats.ts`, `impl/index.ts` và phần ngoài `impl`**

`apps/web/src/chain/impl/vault.ts`:

```ts
import { type Role, rolesOf, type Timeline, timelineOf, type VaultRef, type VaultSnapshot } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { Sdk } from './sdk';

export interface LoadedVault {
  snap: VaultSnapshot;
  timeline: Timeline;
  /** The deployment's factory created this vault, at the snapshot's block. Its own `factory()` proves nothing. */
  registered: boolean;
  fetchedAtMs: number;
}

/** One snapshot, then the registration check and the engine at that snapshot's block. */
export async function loadVault(sdk: Sdk, vault: Address, nowMs: () => number = Date.now): Promise<LoadedVault> {
  const handle = sdk.atro.vault(vault);
  const snap = await handle.snapshot();
  const [registered, engine] = await Promise.all([
    handle.registered({ blockNumber: snap.status.blockNumber }),
    sdk.atro.engineFor(snap.binding.cpu, snap.binding.policyId),
  ]);
  return { snap, timeline: timelineOf(engine, snap), registered, fetchedAtMs: nowMs() };
}

export function rolesIn(snap: VaultSnapshot, account: string | null): Role[] {
  if (!account) return [];
  try {
    return rolesOf(snap, account);
  } catch {
    return [];
  }
}

export function vaultsOf(sdk: Sdk, account: Address): Promise<VaultRef[]> {
  return sdk.atro.vaultsOf(account);
}
```

`apps/web/src/chain/impl/stats.ts`:

```ts
import type { KV } from '@/lib/store';
import type { Sdk } from './sdk';
import { type CachedStats, loadStats, saveStats } from './stats-view';

export function cachedStats(sdk: Sdk, kv: KV): CachedStats | null {
  return loadStats(kv, sdk.deployment.chainId, sdk.deployment.factory);
}

/** Counts from the chain, resuming from this device's last count (the factory's logs only grow). */
export async function countStats(
  sdk: Sdk,
  kv: KV,
  onProgress?: (done: number, total: number) => void,
): Promise<CachedStats> {
  const s = await sdk.atro.stats({ resume: cachedStats(sdk, kv)?.cursor, onProgress });
  return saveStats(kv, sdk.deployment.chainId, sdk.deployment.factory, s, Date.now());
}
```

`apps/web/src/chain/impl/index.ts`:

```ts
export { rpcPlan } from './rpc';
export { createSdk, loadDeployment } from './sdk';
export { cachedStats, countStats } from './stats';
export { loadVault, rolesIn, vaultsOf } from './vault';
```

`apps/web/src/chain/types.ts`:

```ts
export type { RpcPlan } from './impl/rpc';
export type { Sdk } from './impl/sdk';
export type { CachedStats, StatsSnapshot } from './impl/stats-view';
export type { LoadedVault } from './impl/vault';
```

`apps/web/src/chain/load.ts`:

```ts
import type * as Impl from './impl';

export type ChainImpl = typeof Impl;

let pending: Promise<ChainImpl> | null = null;
let loaded: ChainImpl | null = null;

/**
 * The SDK and viem arrive in their own chunk, after the page is interactive (Quyết định 13). One request per page
 * load; a failed request (offline) is forgotten so the next call tries again.
 */
export function loadChainImpl(): Promise<ChainImpl> {
  pending ??= import('./impl').then(
    (impl) => {
      loaded = impl;
      return impl;
    },
    (e: unknown) => {
      pending = null;
      throw e;
    },
  );
  return pending;
}

/** The impl if it has loaded, else null. Data from any chain query means it has, so pure helpers can run in render. */
export function peekChainImpl(): ChainImpl | null {
  return loaded;
}
```

`apps/web/src/chain/query-client.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';

/** Errors that the same request will meet again (Quyết định 18): retrying only delays the message. */
export const PERMANENT_CODES: ReadonlySet<string> = new Set([
  'NOT_VAULT',
  'INVALID_ADDRESS',
  'DEPLOYMENT_INVALID',
  'DEPLOYMENT_MISSING',
  'LINK_INVALID',
  'PLAN_INVALID',
  'INVALID_OPTIONS',
  'USER_REJECTED',
  'WRONG_CHAIN',
  'WRONG_ACCOUNT',
  'POLICY_MISMATCH',
  'DRILL_EXPIRED',
]);

/** The `code` of an AtropyleError, read structurally so this file stays free of the SDK. */
export function errorCode(e: unknown): string | null {
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : null;
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && !PERMANENT_CODES.has(errorCode(error) ?? '');
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 15_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}
```

`apps/web/src/chain/keys.ts`:

```ts
/** Query keys: strings and numbers only, addresses lowercased, so equal requests share one cache entry. */
export const chainKeys = {
  all: (chainId: number) => ['atropyle', chainId] as const,
  sdk: (chainId: number, crossCheck: boolean) => ['atropyle', chainId, 'sdk', crossCheck ? 'cross' : 'own'] as const,
  vault: (chainId: number, vault: string) => ['atropyle', chainId, 'vault', vault.toLowerCase()] as const,
  vaultsOf: (chainId: number, account: string) => ['atropyle', chainId, 'vaultsOf', account.toLowerCase()] as const,
  stats: (chainId: number, source: 'api' | 'chain') => ['atropyle', chainId, 'stats', source] as const,
  me: (chainId: number, account: string) => ['atropyle', chainId, 'me', account.toLowerCase()] as const,
  health: (chainId: number) => ['atropyle', chainId, 'health'] as const,
};
```

`apps/web/src/chain/provider.tsx`:

```tsx
'use client';

import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react';
import { useKV } from '@/lib/kv';
import { KEYS } from '@/lib/store';
import { makeQueryClient } from './query-client';

interface ChainSettings {
  /** Verify reads from a second RPC operator too (off-chain on DeWEB, so off unless the user turns it on). */
  crossCheck: boolean;
  setCrossCheck(on: boolean): void;
}

const SettingsContext = createContext<ChainSettings | null>(null);

export function ChainProvider({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? makeQueryClient());
  const kv = useKV();
  const [crossCheck, setCross] = useState(false);

  useEffect(() => {
    setCross(kv.get(KEYS.crossCheck) === '1');
  }, [kv]);

  const setCrossCheck = useCallback(
    (on: boolean) => {
      kv.set(KEYS.crossCheck, on ? '1' : '0');
      setCross(on);
    },
    [kv],
  );

  const settings = useMemo(() => ({ crossCheck, setCrossCheck }), [crossCheck, setCrossCheck]);
  return (
    <QueryClientProvider client={queryClient}>
      <SettingsContext value={settings}>{children}</SettingsContext>
    </QueryClientProvider>
  );
}

export function useChainSettings(): ChainSettings {
  const v = use(SettingsContext);
  if (!v) throw new Error('useChainSettings must be used inside <ChainProvider>');
  return v;
}
```

`apps/web/src/chain/hooks.ts`:

```ts
'use client';

import type { VaultRef } from '@atropyle/sdk';
import { queryOptions, skipToken, type UseQueryResult, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Address } from 'viem';
import { chainIdOf, ENV } from '@/config/env';
import { chainKeys } from './keys';
import { loadChainImpl } from './load';
import { useChainSettings } from './provider';
import type { LoadedVault, Sdk } from './types';

export const CHAIN_ID: number = chainIdOf(ENV);

/**
 * The query behind useSdk. Code that needs the SDK only on demand (the wallet, when it switches chain) calls
 * `queryClient.fetchQuery(sdkQuery(crossCheck))`, so a page that never connects never loads the SDK chunk.
 */
export function sdkQuery(crossCheck: boolean) {
  return queryOptions({
    queryKey: chainKeys.sdk(CHAIN_ID, crossCheck),
    queryFn: async (): Promise<Sdk> => {
      const impl = await loadChainImpl();
      return impl.createSdk(impl.loadDeployment(ENV), ENV.target, crossCheck);
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: false,
    refetchOnWindowFocus: false,
    structuralSharing: false,
  });
}

/** The SDK client of this build's deployment, created once per cross-check setting. */
export function useSdk(): UseQueryResult<Sdk> {
  const { crossCheck } = useChainSettings();
  return useQuery(sdkQuery(crossCheck));
}

/**
 * One vault, refreshed every 30 s and when the tab comes back. No placeholder: while another address loads, `data`
 * is undefined, so a page never shows the previous vault under the new address (Quyết định 18).
 */
export function useVault(vault: Address | null): UseQueryResult<LoadedVault> {
  const sdk = useSdk().data;
  return useQuery({
    queryKey: chainKeys.vault(CHAIN_ID, vault ?? ''),
    queryFn:
      sdk && vault
        ? async () => {
            const impl = await loadChainImpl();
            return impl.loadVault(sdk, vault);
          }
        : skipToken,
    refetchInterval: 30_000,
    structuralSharing: false,
  });
}

/** Vaults where `account` has a role, from the factory index, newest first. */
export function useVaultsOf(account: Address | null): UseQueryResult<VaultRef[]> {
  const sdk = useSdk().data;
  return useQuery({
    queryKey: chainKeys.vaultsOf(CHAIN_ID, account ?? ''),
    queryFn:
      sdk && account
        ? async () => {
            const impl = await loadChainImpl();
            return impl.vaultsOf(sdk, account);
          }
        : skipToken,
    refetchInterval: 60_000,
    structuralSharing: false,
  });
}

/** After a transaction confirms: read the vault again now instead of at the next interval. */
export function useInvalidateVault(): (vault: string) => Promise<void> {
  const client = useQueryClient();
  return useCallback(
    (vault: string) => client.invalidateQueries({ queryKey: chainKeys.vault(CHAIN_ID, vault) }),
    [client],
  );
}
```

`apps/web/src/chain/time.ts`:

```ts
'use client';

import { chainNow } from '@/lib/format';
import { useNow } from '@/lib/use-now';

/** Chain time, ticking: the last read's block time plus the wall clock since the read. Null until mounted. */
export function useChainNow(
  read: { blockTimestamp: bigint; fetchedAtMs: number } | null,
  intervalMs = 1000,
): bigint | null {
  const now = useNow(intervalMs);
  if (!read || now === null) return null;
  return chainNow(read.blockTimestamp, read.fetchedAtMs, now);
}
```

`apps/web/src/chain/use-stats.ts`:

```ts
'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useKV } from '@/lib/kv';
import { useSdk } from './hooks';
import { loadChainImpl } from './load';
import type { CachedStats, Sdk } from './types';

export interface StatsSummary {
  source: 'api' | 'chain';
  block: bigint;
  vaults: number;
  drills: number;
  checkIns: number;
  /** When this device counted (chain); null when the backend's own time is not a device time. */
  savedAtMs: number | null;
}

export interface StatsState {
  summary: StatsSummary | null;
  progress: { done: number; total: number } | null;
  busy: boolean;
  error: unknown;
  /** Counts from the chain, resuming from the last count on this device. */
  refresh(): void;
}

export function summaryOfCache(c: CachedStats): StatsSummary {
  return {
    source: 'chain',
    block: c.stats.toBlock,
    vaults: c.stats.vaults.total,
    drills: c.stats.vaults.drill,
    checkIns: c.stats.checkIns,
    savedAtMs: c.savedAtMs,
  };
}

/**
 * The count on this device shows at once; reading the chain waits for a button (the factory's logs take many
 * requests on public RPC, 100 blocks per request on X Layer).
 */
export function useChainStats(): StatsState {
  const kv = useKV();
  const sdk = useSdk().data;
  const [cached, setCached] = useState<CachedStats | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!sdk) return;
    let live = true;
    loadChainImpl().then(
      (impl) => {
        if (live) setCached(impl.cachedStats(sdk, kv));
      },
      () => {
        // The SDK query reports a chunk that failed to load; there is nothing cached to show then.
      },
    );
    return () => {
      live = false;
    };
  }, [sdk, kv]);

  const count = useMutation({
    mutationFn: async (s: Sdk) => {
      const impl = await loadChainImpl();
      return impl.countStats(s, kv, (done, total) => setProgress({ done, total }));
    },
    onSuccess: (c) => setCached(c),
    onSettled: () => setProgress(null),
  });

  return {
    summary: cached ? summaryOfCache(cached) : null,
    progress,
    busy: count.isPending,
    error: count.error,
    refresh: () => {
      if (sdk) count.mutate(sdk);
    },
  };
}

export function useStats(): StatsState {
  return useChainStats();
}
```

Thay `apps/web/src/shell/providers.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { ChainProvider } from '@/chain/provider';
import { LangProvider } from '@/i18n/provider';
import { KVProvider } from '@/lib/kv';
import type { KV } from '@/lib/store';
import { MotionProvider } from '@/motion/provider';
import { ThemeProvider } from '@/theme/provider';
import { TooltipProvider } from '@/ui/tooltip';

/** Every page renders inside these, in this order (storage first: language, theme and chain settings read it). */
export function Providers({ children, kv }: { children: ReactNode; kv?: KV }) {
  return (
    <KVProvider kv={kv}>
      <LangProvider>
        <ThemeProvider>
          <ChainProvider>
            <MotionProvider>
              <TooltipProvider>{children}</TooltipProvider>
            </MotionProvider>
          </ChainProvider>
        </ThemeProvider>
      </LangProvider>
    </KVProvider>
  );
}
```

Thay `apps/web/test/helpers/render.tsx` (`render` của Testing Library tự bọc lại `wrapper` khi `rerender`):

```tsx
import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ChainProvider } from '@/chain/provider';
import type { Lang } from '@/i18n/core';
import { LangProvider } from '@/i18n/provider';
import { KVProvider } from '@/lib/kv';
import { KEYS, type KV, memoryKV } from '@/lib/store';
import { ThemeProvider } from '@/theme/provider';
import { TooltipProvider } from '@/ui/tooltip';

export interface ProviderOptions {
  kv?: KV;
  lang?: Lang;
  queryClient?: QueryClient;
}

/** No retries and no background refetch, so a test sees exactly the requests it makes. */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
}

/**
 * The providers of every page except MotionProvider, which loads its features asynchronously; `m.*` elements still
 * render their first state without it.
 */
export function TestProviders({
  kv,
  queryClient,
  children,
}: {
  kv: KV;
  queryClient: QueryClient;
  children: ReactNode;
}) {
  return (
    <KVProvider kv={kv}>
      <LangProvider>
        <ThemeProvider>
          <ChainProvider client={queryClient}>
            <TooltipProvider>{children}</TooltipProvider>
          </ChainProvider>
        </ThemeProvider>
      </LangProvider>
    </KVProvider>
  );
}

/** For `render` and `renderHook`: `{ wrapper }` plus the storage and the query client the test can inspect. */
export function makeWrapper(o: ProviderOptions = {}) {
  const kv = o.kv ?? memoryKV();
  if (o.lang) kv.set(KEYS.lang, o.lang);
  const queryClient = o.queryClient ?? testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders kv={kv} queryClient={queryClient}>
      {children}
    </TestProviders>
  );
  return { wrapper, kv, queryClient };
}

export function renderWithProviders(ui: ReactElement, o: ProviderOptions = {}) {
  const { wrapper, kv, queryClient } = makeWrapper(o);
  return { ...render(ui, { wrapper }), kv, queryClient };
}
```

Run: `npm test -w apps/web -- chain-impl query-client lazy-boundary`
Expected: PASS (chain-impl 2, query-client 2, lazy-boundary 2).

- [ ] **Step 4: Test các hook (impl giả qua `vi.mock`)**

`apps/web/test/unit/chain-hooks.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Address } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSdk, useVault } from '../../src/chain/hooks';
import { toCache } from '../../src/chain/impl/stats-view';
import { useChainSettings } from '../../src/chain/provider';
import type { LoadedVault } from '../../src/chain/types';
import { useStats } from '../../src/chain/use-stats';
import { KEYS } from '../../src/lib/store';
import { makeWrapper } from '../helpers/render';
import { fixtureDeployment, fixtureStats, PEOPLE } from './fixtures';

const impl = vi.hoisted(() => ({
  loadDeployment: vi.fn(),
  createSdk: vi.fn(),
  loadVault: vi.fn(),
  vaultsOf: vi.fn(),
  cachedStats: vi.fn(),
  countStats: vi.fn(),
}));
vi.mock('../../src/chain/load', () => ({ loadChainImpl: async () => impl }));

const A = PEOPLE.vault as Address;
const B = PEOPLE.stranger as Address;
const loaded = (vault: string) =>
  ({ snap: { status: { vault } }, timeline: null, registered: true, fetchedAtMs: 0 }) as unknown as LoadedVault;

beforeEach(() => {
  vi.resetAllMocks();
  impl.loadDeployment.mockImplementation(() => fixtureDeployment());
  impl.createSdk.mockImplementation((deployment: unknown, target: string, crossCheck: boolean) => ({
    deployment,
    target,
    crossCheck,
  }));
  impl.loadVault.mockImplementation(async (_sdk: unknown, vault: string) => loaded(vault));
  impl.cachedStats.mockReturnValue(null);
});

describe('useSdk', () => {
  it('builds one SDK per cross-check setting and remembers the setting', async () => {
    const { wrapper, kv } = makeWrapper();
    const { result } = renderHook(() => ({ sdk: useSdk(), settings: useChainSettings() }), { wrapper });
    await waitFor(() => expect(result.current.sdk.data).toMatchObject({ target: 'deweb', crossCheck: false }));
    act(() => result.current.settings.setCrossCheck(true));
    await waitFor(() => expect(result.current.sdk.data).toMatchObject({ crossCheck: true }));
    expect(kv.get(KEYS.crossCheck)).toBe('1');
  });

  it('reports a broken deployment as an error, not a crash', async () => {
    impl.loadDeployment.mockImplementation(() => {
      throw Object.assign(new Error('NEXT_PUBLIC_DEPLOYMENT is not valid JSON.'), { code: 'DEPLOYMENT_INVALID' });
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSdk(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'DEPLOYMENT_INVALID' });
  });
});

describe('useVault', () => {
  it('waits for an address', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => ({ sdk: useSdk(), vault: useVault(null) }), { wrapper });
    await waitFor(() => expect(result.current.sdk.isSuccess).toBe(true));
    expect(result.current.vault.fetchStatus).toBe('idle');
    expect(impl.loadVault).not.toHaveBeenCalled();
  });

  it('never shows the previous vault while the next one loads', async () => {
    let release: (() => void) | undefined;
    impl.loadVault.mockImplementation(async (_sdk: unknown, vault: string) => {
      if (vault === B) await new Promise<void>((r) => (release = r));
      return loaded(vault);
    });
    const { wrapper } = makeWrapper();
    const { result, rerender } = renderHook(({ v }: { v: Address }) => useVault(v), {
      wrapper,
      initialProps: { v: A },
    });
    await waitFor(() => expect(result.current.data?.snap.status.vault).toBe(A));
    rerender({ v: B });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(release).toBeTypeOf('function'));
    act(() => release?.());
    await waitFor(() => expect(result.current.data?.snap.status.vault).toBe(B));
  });
});

describe('useStats on the chain', () => {
  it('shows this device count at once and counts again on demand', async () => {
    impl.cachedStats.mockReturnValue(toCache(fixtureStats(), 5));
    impl.countStats.mockImplementation(
      async (_s: unknown, _kv: unknown, onProgress: (d: number, t: number) => void) => {
        onProgress(1, 4);
        return toCache({ ...fixtureStats(), checkIns: 9, toBlock: 2_100n }, 6);
      },
    );
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStats(), { wrapper });
    await waitFor(() => expect(result.current.summary).toMatchObject({ source: 'chain', vaults: 3, checkIns: 5 }));
    expect(result.current.summary?.block).toBe(2_000n);
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.summary).toMatchObject({ checkIns: 9, block: 2_100n, savedAtMs: 6 }));
    expect(result.current.progress).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('keeps the old count and reports the error when counting fails', async () => {
    impl.cachedStats.mockReturnValue(toCache(fixtureStats(), 5));
    impl.countStats.mockRejectedValue(Object.assign(new Error('timeout'), { code: 'RPC_UNAVAILABLE' }));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStats(), { wrapper });
    await waitFor(() => expect(result.current.summary).not.toBeNull());
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toMatchObject({ code: 'RPC_UNAVAILABLE' }));
    expect(result.current.summary?.checkIns).toBe(5);
  });
});
```

`apps/web/test/unit/chain-time.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useChainNow } from '../../src/chain/time';

afterEach(() => {
  vi.useRealTimers();
});

describe('useChainNow', () => {
  it('ticks from the last read and is null without one', () => {
    vi.useFakeTimers();
    const read = { blockTimestamp: 1_000n, fetchedAtMs: Date.now() };
    const { result, rerender } = renderHook(({ r }) => useChainNow(r), {
      initialProps: { r: read as typeof read | null },
    });
    expect(result.current).toBe(1_000n);
    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(1_005n);
    rerender({ r: null });
    expect(result.current).toBeNull();
  });
});
```

Run: `npm test -w apps/web -- chain-hooks chain-time`
Expected: PASS (chain-hooks 6, chain-time 1).

- [ ] **Step 5: Chạy toàn bộ, kiểm bundle của `/` và commit**

```bash
npm test -w apps/web
npm run typecheck -w apps/web
npx biome ci .
npm run test:build -w apps/web
git add apps/web/src/chain apps/web/src/shell/providers.tsx apps/web/test/helpers/render.tsx apps/web/test/unit/fixtures.ts apps/web/test/unit/rpc.test.ts apps/web/test/unit/sdk.test.ts apps/web/test/unit/stats-view.test.ts apps/web/test/unit/chain-impl.test.ts apps/web/test/unit/query-client.test.ts apps/web/test/unit/lazy-boundary.test.ts apps/web/test/unit/chain-hooks.test.tsx apps/web/test/unit/chain-time.test.tsx apps/web/package.json package-lock.json
git commit -m "feat(web): chain reads through a lazily loaded SDK, with TanStack Query" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: mọi test PASS. Trang `/` chưa gọi hook chain nào, nên bundle đầu của nó không đổi; Task 15 đo bằng `size-limit`.

---

### Task 11: Ví: lớp ví port nguyên văn, `WalletProvider`, `ConnectSheet` và nút ví trên header

Lớp ví tự viết của web cũ được giữ (Quyết định 17) và chuyển vào `src/wallet/impl/`, nạp lười như chain (Quyết định 13). Phần mới là phiên ví của cả site: nhớ ví giữa các lần ghé, kết nối lại không hỏi, nghe sự kiện của ví, và giao diện chọn ví (Quyết định 27).

**Files:**
- Create (port): `apps/web/src/wallet/impl/wallet.ts`, `apps/web/src/wallet/impl/send-calls.ts`, `apps/web/test/unit/wallet.test.ts`, `apps/web/test/unit/send-calls.test.ts`
- Create (mới): `apps/web/src/wallet/impl/{session,index}.ts`, `apps/web/src/wallet/{types,load,remember,network,use-vault-roles}.ts`, `apps/web/src/wallet/{provider,connect-sheet,wallet-button,wallet-menu,network-banner}.tsx`, `apps/web/src/messages/wallet.messages.ts`, `apps/web/test/helpers/wallet.ts`
- Modify: `apps/web/src/ui/dialog.tsx` (thêm `onCloseAutoFocus`), `apps/web/src/messages/shell.messages.ts` (bỏ 7 khoá ví), `apps/web/src/shell/providers.tsx`, `apps/web/src/shell/header.tsx` (thêm `WalletButton`, chỉ sửa), `apps/web/src/shell/frame.tsx` (thêm `NetworkBanner`, `ConnectSheet`, chỉ sửa), `apps/web/test/helpers/render.tsx`
- Test: `apps/web/test/unit/wallet-session.test.ts`, `apps/web/test/unit/wallet-provider.test.tsx`, `apps/web/test/unit/wallet-ui.test.tsx`

**Interfaces:**
- Consumes: Task 5 (`KV`, `KEYS`, `readJson`, `writeJson`, `useKV`, `useT`, `compactAddress`, `cn`), Task 6 (`SPRING`), Task 8 (`Button`, `Dialog`, `Popover`, `PopoverClose`, `Banner`, `InlineError`, `Skeleton`, `Spinner`, `CopyButton`, `QrCode`, `EmptyState`, `Address`, `Avatar`, `UntrustedText`), Task 9 (`Header`, `Frame`), Task 10 (`CHAIN_ID`, `sdkQuery`, `useChainSettings`, `peekChainImpl`, `errorCode`, `type LoadedVault`, `type Sdk`, `makeWrapper`).
- Produces:
  - `src/wallet/impl/index.ts` (chỉ nạp qua `loadWalletImpl`): từ `wallet.ts` `discoverWallets(win, waitMs?)`, `providerErrorCodes(e)`, `call<T>(p, method, params?)`, `requestAccount(p)`, `readChainId(p)`, `ensureChain(p, chain)`, `walletClientFor(p, account, chain)`; từ `send-calls.ts` `UNSUPPORTED_CODES`, `CallsUnsupported`, `isUnsupported(e)`, `supportsSendCalls(p, account, chainId)`, `normalizeStatus(raw)`, `sendCalls(p, params, o?)`; từ `session.ts` `parseAccountsEvent(arg): Address | null`, `parseChainEvent(arg): number | null`, `isTransientDisconnect(arg): boolean`, `interface WalletEvents { account(a: Address): void; chain(id: number): void; gone(): void }`, `watchWallet(p: Eip1193, h: WalletEvents): () => void`, `findRemembered(list, r): WalletOption | null`, `silentAccount(p): Promise<Address | null>`, `type RestoreResult`, `restoreWallet(win, r): Promise<RestoreResult>`, `connectWallet(option): Promise<ConnectedWallet>`, `notConnected(): AtropyleError`.
  - `src/wallet/types.ts` (chỉ kiểu): `Eip1193`, `WalletOption`, `WalletWindow`, `CallsResult`, `CallsStatus`, `SendCallsOptions`, `type WalletStatus = 'idle' | 'restoring' | 'connecting' | 'connected'`, `interface ConnectedWallet { option: WalletOption; account: Address; chainId: number }`, `interface RememberedWallet { rdns: string | null; source: WalletOption['source']; name: string }`.
  - `src/wallet/load.ts`: `type WalletImpl`; `loadWalletImpl(): Promise<WalletImpl>`.
  - `src/wallet/remember.ts`: `reviveRemembered(raw: unknown): RememberedWallet | null`; `readRemembered(kv: KV): RememberedWallet | null`; `remember(kv: KV, option: WalletOption): void`; `forget(kv: KV): void`.
  - `src/wallet/network.ts`: `networkName(chainId: number): string`.
  - `src/wallet/provider.tsx`: `interface WalletValue { status; wallet: ConnectedWallet | null; expectedChainId: number; wrongChain: boolean; wallets: WalletOption[] | null; discovering: boolean; discover(): Promise<WalletOption[]>; connect(option): Promise<ConnectedWallet>; disconnect(): void; switchChain(): Promise<void>; walletClient(): Promise<WalletClient>; sheetOpen: boolean; openSheet(): void; setSheetOpen(open: boolean): void; sheetOpener: RefObject<HTMLElement | null> }`; `WalletContext`; `WalletProvider({ children, win?: WalletWindow })`; `useWallet(): WalletValue`.
  - `src/wallet/connect-sheet.tsx`: `QR_MAX_CHARS = 512`; `type PickerError = 'rejected' | 'requestPending' | 'connectFailed' | 'searchFailed'`; `connectErrorKey(e: unknown): Exclude<PickerError, 'searchFailed'>`; `isRecommended(w: Pick<WalletOption, 'rdns' | 'source'>): boolean`; `interface WalletPickerProps`; `WalletPicker(props)`; `ConnectSheet()`.
  - `src/wallet/wallet-button.tsx`: `WalletButton()`. `src/wallet/wallet-menu.tsx`: `WalletMenu()`. `src/wallet/network-banner.tsx`: `SwitchNetworkButton({ className? })`, `NetworkBanner()`. `src/wallet/use-vault-roles.ts`: `useVaultRoles(loaded: LoadedVault | undefined): readonly Role[] | null`.
  - `src/ui/dialog.tsx`: `DialogProps` thêm `onCloseAutoFocus?(event: Event): void`. Overlay giữ nguyên lớp của Task 8 (`bg-bg/95`, blur chỉ từ 48rem).
  - `test/helpers/wallet.ts`: `interface FakeWalletState`, `interface FakeWallet`, `fakeWallet(o?)`, `interface Announced`, `walletWindow(announced?, globals?)`. `test/helpers/render.tsx`: `ProviderOptions` thêm `win?: WalletWindow`.

- [ ] **Step 1: Port lớp ví và test của nó**

```bash
L=apps/web-legacy
W=apps/web
mkdir -p $W/src/wallet/impl
cp $L/src/lib/wallet.ts $W/src/wallet/impl/wallet.ts
cp $L/src/lib/send-calls.ts $W/src/wallet/impl/send-calls.ts
cp $L/test/unit/wallet.test.ts $W/test/unit/wallet.test.ts
sed -i "s#'../../src/lib/wallet'#'../../src/wallet/impl/wallet'#" $W/test/unit/wallet.test.ts
cp $L/test/unit/send-calls.test.ts $W/test/unit/send-calls.test.ts
sed -i "s#'../../src/lib/send-calls'#'../../src/wallet/impl/send-calls'#; s#'../../src/lib/wallet'#'../../src/wallet/impl/wallet'#" $W/test/unit/send-calls.test.ts
grep -n "src/lib/" $W/test/unit/wallet.test.ts $W/test/unit/send-calls.test.ts
```

Expected: lệnh `grep` cuối không in gì (`send-calls.ts` import `./wallet`, cùng thư mục, không cần sửa).

Run: `npm test -w apps/web -- wallet.test send-calls`
Expected: PASS (wallet 10, send-calls 10).

- [ ] **Step 2: Viết test hỏng cho phiên ví (sự kiện, ví đã nhớ, kết nối lại)**

`apps/web/test/helpers/wallet.ts`:

```ts
import type { Eip1193, WalletWindow } from '@/wallet/types';

type Listener = (...args: unknown[]) => void;

export interface FakeWalletState {
  accounts: string[];
  chainId: number;
  /** Whether the wallet already shares its accounts with this site: what `eth_accounts` answers. */
  shared: boolean;
  /** The user declines the next connection request. */
  reject: boolean;
}

export interface FakeWallet {
  provider: Eip1193;
  state: FakeWalletState;
  /** Every method the page called, in order. */
  calls: string[];
  emit(event: string, ...args: unknown[]): void;
  listenerCount(event: string): number;
}

/** An EIP-1193 wallet in memory: accounts, one chain, a prompt the test can decline, and events. */
export function fakeWallet(o: Partial<FakeWalletState> = {}): FakeWallet {
  const state: FakeWalletState = { accounts: [], chainId: 196, shared: false, reject: false, ...o };
  const calls: string[] = [];
  const listeners = new Map<string, Set<Listener>>();
  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners.get(event) ?? []) listener(...args);
  };
  const provider: Eip1193 = {
    async request({ method, params }) {
      calls.push(method);
      switch (method) {
        case 'eth_accounts':
          return state.shared ? state.accounts : [];
        case 'eth_requestAccounts':
          if (state.reject) throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
          state.shared = true;
          return state.accounts;
        case 'eth_chainId':
          return `0x${state.chainId.toString(16)}`;
        case 'wallet_switchEthereumChain': {
          const [{ chainId }] = params as [{ chainId: string }];
          state.chainId = Number(BigInt(chainId));
          emit('chainChanged', chainId);
          return null;
        }
        default:
          throw Object.assign(new Error(`unexpected ${method}`), { code: 4200 });
      }
    },
    on(event, listener) {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(event, set);
    },
    removeListener(event, listener) {
      listeners.get(event)?.delete(listener);
    },
  };
  return { provider, state, calls, emit, listenerCount: (event) => listeners.get(event)?.size ?? 0 };
}

export interface Announced {
  info: { uuid: string; name: string; rdns: string; icon: string };
  provider: Eip1193;
}

/** A window where the given wallets answer EIP-6963 discovery, plus injected globals such as `okxwallet`. */
export function walletWindow(
  announced: Announced[] = [],
  globals: { okxwallet?: unknown; ethereum?: unknown } = {},
): WalletWindow {
  const win = new EventTarget();
  win.addEventListener('eip6963:requestProvider', () => {
    for (const detail of announced) win.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
  });
  return Object.assign(win, globals);
}
```

`apps/web/test/unit/wallet-session.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { KEYS, memoryKV } from '../../src/lib/store';
import {
  findRemembered,
  isTransientDisconnect,
  parseAccountsEvent,
  parseChainEvent,
  restoreWallet,
  watchWallet,
} from '../../src/wallet/impl/session';
import { readRemembered, reviveRemembered } from '../../src/wallet/remember';
import type { RememberedWallet, WalletOption } from '../../src/wallet/types';
import { fakeWallet, walletWindow } from '../helpers/wallet';
import { PEOPLE } from './fixtures';

const OKX: RememberedWallet = { rdns: 'com.okex.wallet', source: 'eip6963', name: 'OKX Wallet' };

function option(over: Partial<WalletOption>): WalletOption {
  return {
    id: 'id',
    name: 'Wallet',
    icon: null,
    rdns: null,
    provider: fakeWallet().provider,
    source: 'eip6963',
    ...over,
  };
}

describe('wallet events', () => {
  it('reads accounts and chains, and refuses garbage', () => {
    expect(parseAccountsEvent([PEOPLE.owner.toLowerCase()])).toBe(PEOPLE.owner);
    for (const bad of [[], [42], 'x', null, undefined, ['0x123'], {}]) expect(parseAccountsEvent(bad)).toBeNull();

    expect(parseChainEvent('0xc4')).toBe(196);
    expect(parseChainEvent('196')).toBe(196);
    expect(parseChainEvent(196)).toBe(196);
    for (const bad of ['', 'garbage', '0x', '-1', 0, 1.5, null, {}, '0x1fffffffffffff0']) {
      expect(parseChainEvent(bad)).toBeNull();
    }

    expect(isTransientDisconnect({ code: 1013 })).toBe(true);
    expect(isTransientDisconnect({ code: 4900 })).toBe(false);
    expect(isTransientDisconnect(undefined)).toBe(false);
  });

  it('watchWallet forwards what it understands and stops listening', () => {
    const fake = fakeWallet();
    const seen: string[] = [];
    const stop = watchWallet(fake.provider, {
      account: (a) => seen.push(`account ${a}`),
      chain: (id) => seen.push(`chain ${id}`),
      gone: () => seen.push('gone'),
    });
    fake.emit('accountsChanged', [PEOPLE.heirA.toLowerCase()]);
    fake.emit('chainChanged', 'not a chain');
    fake.emit('chainChanged', '0x1');
    fake.emit('disconnect', { code: 1013 });
    fake.emit('disconnect', { code: 4900 });
    fake.emit('accountsChanged', []);
    expect(seen).toEqual([`account ${PEOPLE.heirA}`, 'chain 1', 'gone', 'gone']);

    stop();
    for (const event of ['accountsChanged', 'chainChanged', 'disconnect']) expect(fake.listenerCount(event)).toBe(0);
  });
});

describe('remembered wallet', () => {
  it('keeps only a well-formed entry, and drops a corrupt one from storage', () => {
    expect(reviveRemembered(OKX)).toEqual(OKX);
    expect(reviveRemembered({ rdns: null, source: 'okxwallet', name: 'OKX Wallet' })).not.toBeNull();
    for (const bad of [
      null,
      'x',
      {},
      { rdns: 5, source: 'eip6963', name: 'A' },
      { rdns: null, source: 'walletconnect', name: 'A' },
      { rdns: null, source: 'ethereum', name: 'x'.repeat(41) },
    ]) {
      expect(reviveRemembered(bad)).toBeNull();
    }
    const kv = memoryKV();
    kv.set(KEYS.wallet, '{"rdns":');
    expect(readRemembered(kv)).toBeNull();
    expect(kv.get(KEYS.wallet)).toBeNull();
  });

  it('finds the same wallet by rdns, because EIP-6963 uuids change on every page load', () => {
    const okx = option({ id: 'new-uuid', name: 'OKX Wallet', rdns: 'com.okex.wallet' });
    const other = option({ id: 'other', name: 'Other', rdns: 'org.example' });
    const injected = option({ id: 'okxwallet', name: 'OKX Wallet', source: 'okxwallet' });
    expect(findRemembered([other, okx], OKX)).toBe(okx);
    expect(findRemembered([other], OKX)).toBeNull();
    expect(findRemembered([other, injected], { rdns: null, source: 'okxwallet', name: 'OKX Wallet' })).toBe(injected);
  });

  it('reconnects without a prompt, and tells a missing wallet from a locked one', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner], shared: true });
    const info = { uuid: 'uuid-9', name: 'OKX Wallet', rdns: 'com.okex.wallet', icon: '' };
    const win = walletWindow([{ info, provider: fake.provider }]);
    expect(await restoreWallet(win, OKX)).toMatchObject({
      kind: 'connected',
      wallet: { account: PEOPLE.owner, chainId: 196 },
    });
    fake.state.shared = false;
    expect(await restoreWallet(win, OKX)).toEqual({ kind: 'locked' });
    expect(await restoreWallet(walletWindow(), OKX)).toEqual({ kind: 'gone' });
    expect(fake.calls).not.toContain('eth_requestAccounts');
  });
});
```

Run: `npm test -w apps/web -- wallet-session`
Expected: FAIL, không tìm thấy `../../src/wallet/impl/session` và `../../src/wallet/remember`.

- [ ] **Step 3: Viết `session.ts`, `types.ts`, `load.ts`, `remember.ts`, `network.ts`**

`apps/web/src/wallet/types.ts`:

```ts
import type { Address } from 'viem';
import type { WalletOption } from './impl/wallet';

export type { CallsResult, CallsStatus, SendCallsOptions } from './impl/send-calls';
export type { Eip1193, WalletOption, WalletWindow } from './impl/wallet';

export type WalletStatus = 'idle' | 'restoring' | 'connecting' | 'connected';

export interface ConnectedWallet {
  option: WalletOption;
  account: Address;
  chainId: number;
}

/** What `KEYS.wallet` keeps: enough to find the same wallet on the next visit. Never an account, never a key. */
export interface RememberedWallet {
  rdns: string | null;
  source: WalletOption['source'];
  name: string;
}
```

`apps/web/src/wallet/impl/session.ts`:

```ts
import { AtropyleError } from '@atropyle/sdk';
import { type Address, getAddress } from 'viem';
import type { ConnectedWallet, RememberedWallet } from '../types';
import {
  call,
  discoverWallets,
  type Eip1193,
  readChainId,
  requestAccount,
  type WalletOption,
  type WalletWindow,
} from './wallet';

const MAX_CHAIN_ID = BigInt(Number.MAX_SAFE_INTEGER);

/** The first account of an `accountsChanged` payload or an `eth_accounts` answer, checksummed; null for anything else. */
export function parseAccountsEvent(arg: unknown): Address | null {
  if (!Array.isArray(arg) || typeof arg[0] !== 'string') return null;
  try {
    return getAddress(arg[0]);
  } catch {
    return null;
  }
}

/** A `chainChanged` payload (hex or decimal) as a chain id; null for anything else, so the last known chain stays. */
export function parseChainEvent(arg: unknown): number | null {
  if (typeof arg !== 'string' && typeof arg !== 'number') return null;
  try {
    const id = BigInt(arg);
    return id > 0n && id <= MAX_CHAIN_ID ? Number(id) : null;
  } catch {
    return null;
  }
}

/**
 * EIP-1193 `disconnect` means the wallet lost every chain. MetaMask also sends it, with code 1013, while it moves
 * between networks and then reconnects by itself; that one is not a disconnection.
 */
export function isTransientDisconnect(arg: unknown): boolean {
  return typeof arg === 'object' && arg !== null && (arg as { code?: unknown }).code === 1013;
}

export interface WalletEvents {
  account(account: Address): void;
  chain(chainId: number): void;
  /** No usable account any more: the user locked the wallet, removed this site, or sent garbage. */
  gone(): void;
}

/** Listens to one wallet; the returned function stops listening. A wallet without `on` sends no events. */
export function watchWallet(p: Eip1193, h: WalletEvents): () => void {
  if (!p.on) return () => undefined;
  const onAccounts = (...args: unknown[]) => {
    const account = parseAccountsEvent(args[0]);
    if (account) h.account(account);
    else h.gone();
  };
  const onChain = (...args: unknown[]) => {
    const id = parseChainEvent(args[0]);
    if (id !== null) h.chain(id);
  };
  const onDisconnect = (...args: unknown[]) => {
    if (!isTransientDisconnect(args[0])) h.gone();
  };
  p.on('accountsChanged', onAccounts);
  p.on('chainChanged', onChain);
  p.on('disconnect', onDisconnect);
  return () => {
    p.removeListener?.('accountsChanged', onAccounts);
    p.removeListener?.('chainChanged', onChain);
    p.removeListener?.('disconnect', onDisconnect);
  };
}

/**
 * The wallet found now that is the remembered one: by rdns, since EIP-6963 uuids change on every page load; a
 * wallet without rdns (an injected global) by how it was found and its fixed name.
 */
export function findRemembered(list: readonly WalletOption[], r: RememberedWallet): WalletOption | null {
  return list.find((w) => (r.rdns ? w.rdns === r.rdns : w.source === r.source && w.name === r.name)) ?? null;
}

/** The account the wallet already shares with this site, without a prompt; null when it shares none. */
export async function silentAccount(p: Eip1193): Promise<Address | null> {
  try {
    return parseAccountsEvent(await call<unknown>(p, 'eth_accounts'));
  } catch {
    return null;
  }
}

export type RestoreResult = { kind: 'connected'; wallet: ConnectedWallet } | { kind: 'gone' } | { kind: 'locked' };

/** Reconnects a remembered wallet. Never `eth_requestAccounts` here: a page load must not open a wallet prompt. */
export async function restoreWallet(win: WalletWindow, r: RememberedWallet): Promise<RestoreResult> {
  const option = findRemembered(await discoverWallets(win), r);
  if (!option) return { kind: 'gone' };
  const account = await silentAccount(option.provider);
  if (!account) return { kind: 'locked' };
  try {
    return { kind: 'connected', wallet: { option, account, chainId: await readChainId(option.provider) } };
  } catch {
    return { kind: 'locked' };
  }
}

/** Asks the wallet for an account (its prompt) and reads its chain. */
export async function connectWallet(option: WalletOption): Promise<ConnectedWallet> {
  const account = await requestAccount(option.provider);
  return { option, account, chainId: await readChainId(option.provider) };
}

export function notConnected(): AtropyleError {
  return new AtropyleError('WRONG_ACCOUNT', { message: 'Connect a wallet first.' });
}
```

`apps/web/src/wallet/impl/index.ts`:

```ts
export {
  CallsUnsupported,
  isUnsupported,
  normalizeStatus,
  sendCalls,
  supportsSendCalls,
  UNSUPPORTED_CODES,
} from './send-calls';
export {
  connectWallet,
  findRemembered,
  isTransientDisconnect,
  notConnected,
  parseAccountsEvent,
  parseChainEvent,
  restoreWallet,
  silentAccount,
  watchWallet,
} from './session';
export {
  call,
  discoverWallets,
  ensureChain,
  providerErrorCodes,
  readChainId,
  requestAccount,
  walletClientFor,
} from './wallet';
```

`apps/web/src/wallet/load.ts`:

```ts
import type * as Impl from './impl';

export type WalletImpl = typeof Impl;

let pending: Promise<WalletImpl> | null = null;

/**
 * The wallet code (viem and the SDK's error type) loads on first use: a click on Connect, or a wallet remembered from
 * an earlier visit. A failed load (offline) is forgotten so the next call tries again.
 */
export function loadWalletImpl(): Promise<WalletImpl> {
  pending ??= import('./impl').catch((e: unknown) => {
    pending = null;
    throw e;
  });
  return pending;
}
```

`apps/web/src/wallet/remember.ts`:

```ts
import { KEYS, type KV, readJson, writeJson } from '@/lib/store';
import type { RememberedWallet, WalletOption } from './types';

const SOURCES: ReadonlySet<string> = new Set(['eip6963', 'okxwallet', 'ethereum']);

/** A stored entry, or null when it is not exactly what `remember` writes (storage is user-editable). */
export function reviveRemembered(raw: unknown): RememberedWallet | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { rdns, source, name } = raw as Record<string, unknown>;
  if (typeof source !== 'string' || !SOURCES.has(source)) return null;
  if (typeof name !== 'string' || name.length > 40) return null;
  if (rdns === null) return { rdns: null, source: source as RememberedWallet['source'], name };
  if (typeof rdns !== 'string' || rdns.length === 0 || rdns.length > 100) return null;
  return { rdns, source: source as RememberedWallet['source'], name };
}

/** The remembered wallet; a corrupt entry is removed (readJson). */
export function readRemembered(kv: KV): RememberedWallet | null {
  return readJson(kv, KEYS.wallet, reviveRemembered);
}

export function remember(kv: KV, option: WalletOption): void {
  const entry: RememberedWallet = { rdns: option.rdns, source: option.source, name: option.name };
  writeJson(kv, KEYS.wallet, entry);
}

export function forget(kv: KV): void {
  kv.remove(KEYS.wallet);
}
```

`apps/web/src/wallet/network.ts`:

```ts
const NAMES: Readonly<Record<number, string>> = {
  1: 'Ethereum',
  10: 'OP Mainnet',
  56: 'BNB Smart Chain',
  137: 'Polygon',
  196: 'X Layer',
  8453: 'Base',
  31337: 'Anvil',
  42161: 'Arbitrum One',
};

/** The name a person knows a chain by; any other chain is shown by its number. */
export function networkName(chainId: number): string {
  return NAMES[chainId] ?? `chain ${chainId}`;
}
```

Run: `npm test -w apps/web -- wallet-session`
Expected: PASS (5 test).

- [ ] **Step 4: Test hỏng cho `WalletProvider`, rồi viết nó và nối vào `Providers`**

`apps/web/test/unit/wallet-provider.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KEYS, type KV, memoryKV } from '../../src/lib/store';
import { useWallet } from '../../src/wallet/provider';
import type { WalletWindow } from '../../src/wallet/types';
import { makeWrapper } from '../helpers/render';
import { type FakeWallet, fakeWallet, walletWindow } from '../helpers/wallet';
import { PEOPLE } from './fixtures';

// The SDK the wallet needs for switchChain and walletClient: only its chain, built from the fixture deployment.
vi.mock('../../src/chain/load', async () => {
  const { chainOf } = await import('@atropyle/sdk');
  const { fixtureDeployment } = await import('./fixtures');
  const impl = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: (deployment: ReturnType<typeof fixtureDeployment>) => ({
      atro: { chain: chainOf(deployment) },
      deployment,
    }),
  };
  return { loadChainImpl: async () => impl, peekChainImpl: () => impl };
});

const OKX = { uuid: 'uuid-1', name: 'OKX Wallet', rdns: 'com.okex.wallet', icon: '' };
const REMEMBERED = JSON.stringify({ rdns: 'com.okex.wallet', source: 'eip6963', name: 'OKX Wallet' });
// Discovery listens for EIP-6963 answers for 250 ms.
const SLOW = { timeout: 2000 };

function setup(o: { kv?: KV; win?: WalletWindow } = {}) {
  const { wrapper, kv } = makeWrapper(o);
  return { ...renderHook(() => useWallet(), { wrapper }), kv };
}

async function connected(fake: FakeWallet, kv: KV = memoryKV()) {
  const h = setup({ kv, win: walletWindow([{ info: OKX, provider: fake.provider }]) });
  const list = await act(() => h.result.current.discover());
  await act(() => h.result.current.connect(list[0]));
  return h;
}

describe('WalletProvider', () => {
  it('connects, remembers the wallet by rdns and reconnects silently on the next visit', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner.toLowerCase()] });
    const kv = memoryKV();
    const first = await connected(fake, kv);
    expect(first.result.current.status).toBe('connected');
    expect(first.result.current.wallet).toMatchObject({ account: PEOPLE.owner, chainId: 196 });
    expect(kv.get(KEYS.wallet)).toBe(REMEMBERED);
    first.unmount();

    // The next page load: EIP-6963 hands out a new uuid, the rdns stays.
    const win = walletWindow([{ info: { ...OKX, uuid: 'uuid-2' }, provider: fake.provider }]);
    const next = setup({ kv, win });
    expect(next.result.current.status).toBe('restoring');
    await waitFor(() => expect(next.result.current.status).toBe('connected'), SLOW);
    expect(next.result.current.wallet?.account).toBe(PEOPLE.owner);
    expect(fake.calls.filter((m) => m === 'eth_requestAccounts')).toHaveLength(1);
  });

  it('restore ignores a remembered wallet that is gone', async () => {
    const kv = memoryKV();
    kv.set(KEYS.wallet, JSON.stringify({ rdns: 'io.metamask', source: 'eip6963', name: 'MetaMask' }));
    const gone = setup({ kv, win: walletWindow() });
    await waitFor(() => expect(gone.result.current.status).toBe('idle'), SLOW);
    expect(gone.result.current.wallet).toBeNull();
    expect(kv.get(KEYS.wallet)).toBeNull();
    gone.unmount();

    kv.set(KEYS.wallet, '{"rdns":');
    const garbage = setup({ kv, win: walletWindow() });
    expect(garbage.result.current.status).toBe('idle');
    expect(kv.get(KEYS.wallet)).toBeNull();
  });

  it('restore never prompts: a locked wallet stays disconnected and remembered', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner], shared: false });
    const kv = memoryKV();
    kv.set(KEYS.wallet, REMEMBERED);
    const h = setup({ kv, win: walletWindow([{ info: OKX, provider: fake.provider }]) });
    await waitFor(() => expect(h.result.current.status).toBe('idle'), SLOW);
    expect(fake.calls).toEqual(['eth_accounts']);
    expect(kv.get(KEYS.wallet)).toBe(REMEMBERED);
  });

  it('wallet events update the account and chain and drop garbage', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner] });
    const h = await connected(fake);
    await waitFor(() => expect(fake.listenerCount('accountsChanged')).toBe(1));

    act(() => fake.emit('accountsChanged', [PEOPLE.heirA.toLowerCase()]));
    expect(h.result.current.wallet?.account).toBe(PEOPLE.heirA);

    act(() => fake.emit('chainChanged', '0x1'));
    expect(h.result.current.wallet?.chainId).toBe(1);
    expect(h.result.current.wrongChain).toBe(true);

    act(() => fake.emit('chainChanged', 'not a chain'));
    expect(h.result.current.wallet?.chainId).toBe(1);

    act(() => fake.emit('disconnect', { code: 1013, message: 'Disconnected from chain. Attempting to connect.' }));
    expect(h.result.current.status).toBe('connected');

    act(() => fake.emit('accountsChanged', [42]));
    expect(h.result.current.wallet).toBeNull();
    expect(h.result.current.status).toBe('idle');
    expect(fake.listenerCount('accountsChanged')).toBe(0);
  });

  it('switches the wallet to the chain of this build', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner], chainId: 1 });
    const h = await connected(fake);
    expect(h.result.current.wrongChain).toBe(true);
    await act(() => h.result.current.switchChain());
    expect(h.result.current.wallet?.chainId).toBe(196);
    expect(h.result.current.wrongChain).toBe(false);
    expect(fake.calls).toContain('wallet_switchEthereumChain');
  });

  it('hands out a wallet client only while connected, and forgets the wallet on disconnect', async () => {
    const kv = memoryKV();
    const h = await connected(fakeWallet({ accounts: [PEOPLE.owner] }), kv);
    const client = await act(() => h.result.current.walletClient());
    expect(client.account?.address).toBe(PEOPLE.owner);

    act(() => h.result.current.disconnect());
    expect(h.result.current.status).toBe('idle');
    expect(kv.get(KEYS.wallet)).toBeNull();
    await expect(h.result.current.walletClient()).rejects.toMatchObject({ code: 'WRONG_ACCOUNT' });
  });

  it('a declined request leaves the wallet disconnected and gives the error to the caller', async () => {
    const fake = fakeWallet({ accounts: [PEOPLE.owner], reject: true });
    const kv = memoryKV();
    const h = setup({ kv, win: walletWindow([{ info: OKX, provider: fake.provider }]) });
    const list = await act(() => h.result.current.discover());
    await expect(act(() => h.result.current.connect(list[0]))).rejects.toMatchObject({ code: 'USER_REJECTED' });
    expect(h.result.current.status).toBe('idle');
    expect(kv.get(KEYS.wallet)).toBeNull();
  });
});
```

Run: `npm test -w apps/web -- wallet-provider`
Expected: FAIL, không tìm thấy `../../src/wallet/provider`.

`apps/web/src/wallet/provider.tsx`:

```tsx
'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  type RefObject,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { WalletClient } from 'viem';
import { CHAIN_ID, sdkQuery } from '@/chain/hooks';
import { useChainSettings } from '@/chain/provider';
import { useKV } from '@/lib/kv';
import { loadWalletImpl } from './load';
import { forget, readRemembered, remember } from './remember';
import type { ConnectedWallet, WalletOption, WalletStatus, WalletWindow } from './types';

export interface WalletValue {
  status: WalletStatus;
  wallet: ConnectedWallet | null;
  /** The chain of this build's deployment. */
  expectedChainId: number;
  /** Connected, but on another chain than expectedChainId. */
  wrongChain: boolean;
  /** The wallets the last discover() found; null before the first one. */
  wallets: WalletOption[] | null;
  discovering: boolean;
  discover(): Promise<WalletOption[]>;
  /** Opens the wallet's prompt. Rejects with USER_REJECTED when the user declines. */
  connect(option: WalletOption): Promise<ConnectedWallet>;
  /** Forgets the wallet on this site; the wallet itself keeps its permission. */
  disconnect(): void;
  switchChain(): Promise<void>;
  /** A viem client that signs through the connected wallet on this build's chain. */
  walletClient(): Promise<WalletClient>;
  sheetOpen: boolean;
  openSheet(): void;
  setSheetOpen(open: boolean): void;
  /** The element that opened the sheet, so focus returns to it. */
  sheetOpener: RefObject<HTMLElement | null>;
}

export const WalletContext = createContext<WalletValue | null>(null);

type Pending = 'restoring' | 'connecting' | null;

/**
 * The connected wallet of the whole site (Quyết định 27). Nothing here loads viem or the SDK until it is needed: a
 * click on Connect, or a wallet remembered from an earlier visit.
 */
export function WalletProvider({ children, win }: { children: ReactNode; win?: WalletWindow }) {
  const kv = useKV();
  const queryClient = useQueryClient();
  const { crossCheck } = useChainSettings();
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [wallets, setWallets] = useState<WalletOption[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetOpener = useRef<HTMLElement | null>(null);
  // Each connect, disconnect, restore and loss takes the next number; a slower one that meets a newer number drops
  // its result, so a late restore never overwrites a wallet the user has just chosen.
  const epoch = useRef(0);
  const windowOf = useCallback((): WalletWindow => win ?? window, [win]);

  // A remembered wallet reconnects after mount, without a prompt (Review Focus 2).
  useEffect(() => {
    const remembered = readRemembered(kv);
    if (!remembered) return;
    const mine = ++epoch.current;
    setPending('restoring');
    loadWalletImpl()
      .then((impl) => impl.restoreWallet(windowOf(), remembered))
      .then(
        (r) => {
          if (epoch.current !== mine) return;
          if (r.kind === 'gone') forget(kv);
          if (r.kind === 'connected') setWallet(r.wallet);
          setPending(null);
        },
        () => {
          if (epoch.current === mine) setPending(null);
        },
      );
  }, [kv, windowOf]);

  // Wallet events (Review Focus 3): a new account or chain updates the state; anything unusable drops the wallet.
  const provider = wallet?.option.provider ?? null;
  useEffect(() => {
    if (!provider) return;
    let live = true;
    let stop: (() => void) | null = null;
    loadWalletImpl().then(
      (impl) => {
        if (!live) return;
        stop = impl.watchWallet(provider, {
          account: (account) => setWallet((w) => (w ? { ...w, account } : w)),
          chain: (chainId) => setWallet((w) => (w ? { ...w, chainId } : w)),
          gone: () => {
            epoch.current++;
            setPending(null);
            setWallet(null);
          },
        });
      },
      () => undefined,
    );
    return () => {
      live = false;
      stop?.();
    };
  }, [provider]);

  const discover = useCallback(async (): Promise<WalletOption[]> => {
    setDiscovering(true);
    try {
      const list = await (await loadWalletImpl()).discoverWallets(windowOf());
      setWallets(list);
      return list;
    } finally {
      setDiscovering(false);
    }
  }, [windowOf]);

  const connect = useCallback(
    async (option: WalletOption): Promise<ConnectedWallet> => {
      const mine = ++epoch.current;
      setPending('connecting');
      try {
        const next = await (await loadWalletImpl()).connectWallet(option);
        if (epoch.current === mine) {
          setWallet(next);
          remember(kv, option);
          setSheetOpen(false);
        }
        return next;
      } finally {
        if (epoch.current === mine) setPending(null);
      }
    },
    [kv],
  );

  const disconnect = useCallback(() => {
    epoch.current++;
    forget(kv);
    setPending(null);
    setWallet(null);
  }, [kv]);

  // The SDK only on demand: a visitor who never connects never loads it here.
  const sdkNow = useCallback(() => queryClient.fetchQuery(sdkQuery(crossCheck)), [queryClient, crossCheck]);

  const switchChain = useCallback(async () => {
    const [impl, sdk] = await Promise.all([loadWalletImpl(), sdkNow()]);
    if (!wallet) throw impl.notConnected();
    const chain = sdk.atro.chain;
    await impl.ensureChain(wallet.option.provider, chain);
    setWallet((w) => (w && w.option === wallet.option ? { ...w, chainId: chain.id } : w));
  }, [wallet, sdkNow]);

  const walletClient = useCallback(async (): Promise<WalletClient> => {
    const [impl, sdk] = await Promise.all([loadWalletImpl(), sdkNow()]);
    if (!wallet) throw impl.notConnected();
    return impl.walletClientFor(wallet.option.provider, wallet.account, sdk.atro.chain);
  }, [wallet, sdkNow]);

  const openSheet = useCallback(() => {
    sheetOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSheetOpen(true);
  }, []);

  const value = useMemo<WalletValue>(
    () => ({
      status: pending ?? (wallet ? 'connected' : 'idle'),
      wallet,
      expectedChainId: CHAIN_ID,
      wrongChain: wallet !== null && wallet.chainId !== CHAIN_ID,
      wallets,
      discovering,
      discover,
      connect,
      disconnect,
      switchChain,
      walletClient,
      sheetOpen,
      openSheet,
      setSheetOpen,
      sheetOpener,
    }),
    [
      pending,
      wallet,
      wallets,
      discovering,
      discover,
      connect,
      disconnect,
      switchChain,
      walletClient,
      sheetOpen,
      openSheet,
    ],
  );
  return <WalletContext value={value}>{children}</WalletContext>;
}

export function useWallet(): WalletValue {
  const v = use(WalletContext);
  if (!v) throw new Error('useWallet must be used inside <WalletProvider>');
  return v;
}
```

Thay `apps/web/src/shell/providers.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { ChainProvider } from '@/chain/provider';
import { LangProvider } from '@/i18n/provider';
import { KVProvider } from '@/lib/kv';
import type { KV } from '@/lib/store';
import { MotionProvider } from '@/motion/provider';
import { ThemeProvider } from '@/theme/provider';
import { TooltipProvider } from '@/ui/tooltip';
import { WalletProvider } from '@/wallet/provider';

/** Every page renders inside these, in this order (storage first: language, theme, chain and wallet read it). */
export function Providers({ children, kv }: { children: ReactNode; kv?: KV }) {
  return (
    <KVProvider kv={kv}>
      <LangProvider>
        <ThemeProvider>
          <ChainProvider>
            <WalletProvider>
              <MotionProvider>
                <TooltipProvider>{children}</TooltipProvider>
              </MotionProvider>
            </WalletProvider>
          </ChainProvider>
        </ThemeProvider>
      </LangProvider>
    </KVProvider>
  );
}
```

Thay `apps/web/test/helpers/render.tsx`:

```tsx
import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ChainProvider } from '@/chain/provider';
import type { Lang } from '@/i18n/core';
import { LangProvider } from '@/i18n/provider';
import { KVProvider } from '@/lib/kv';
import { KEYS, type KV, memoryKV } from '@/lib/store';
import { ThemeProvider } from '@/theme/provider';
import { TooltipProvider } from '@/ui/tooltip';
import { WalletProvider } from '@/wallet/provider';
import type { WalletWindow } from '@/wallet/types';

export interface ProviderOptions {
  kv?: KV;
  lang?: Lang;
  queryClient?: QueryClient;
  /** Where wallet discovery looks; the test window by default. */
  win?: WalletWindow;
}

/** No retries and no background refetch, so a test sees exactly the requests it makes. */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } },
  });
}

/**
 * The providers of every page except MotionProvider, which loads its features asynchronously; `m.*` elements still
 * render their first state without it.
 */
export function TestProviders({
  kv,
  queryClient,
  win,
  children,
}: {
  kv: KV;
  queryClient: QueryClient;
  win?: WalletWindow;
  children: ReactNode;
}) {
  return (
    <KVProvider kv={kv}>
      <LangProvider>
        <ThemeProvider>
          <ChainProvider client={queryClient}>
            <WalletProvider win={win}>
              <TooltipProvider>{children}</TooltipProvider>
            </WalletProvider>
          </ChainProvider>
        </ThemeProvider>
      </LangProvider>
    </KVProvider>
  );
}

/** For `render` and `renderHook`: `{ wrapper }` plus the storage and the query client the test can inspect. */
export function makeWrapper(o: ProviderOptions = {}) {
  const kv = o.kv ?? memoryKV();
  if (o.lang) kv.set(KEYS.lang, o.lang);
  const queryClient = o.queryClient ?? testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TestProviders kv={kv} queryClient={queryClient} win={o.win}>
      {children}
    </TestProviders>
  );
  return { wrapper, kv, queryClient };
}

export function renderWithProviders(ui: ReactElement, o: ProviderOptions = {}) {
  const { wrapper, kv, queryClient } = makeWrapper(o);
  return { ...render(ui, { wrapper }), kv, queryClient };
}
```

Run: `npm test -w apps/web -- wallet-provider wallet-session chain-hooks shell`
Expected: PASS (wallet-provider 7, wallet-session 5, chain-hooks 6, shell 8).

- [ ] **Step 5: Chuỗi của ví và `onCloseAutoFocus` cho `Dialog`**

`apps/web/src/messages/wallet.messages.ts`:

```ts
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    connect: 'Connect wallet',
    connectShort: 'Connect',
    connecting: 'Connecting…',
    restoring: 'Reconnecting your wallet…',
    chooseWallet: 'Choose a wallet',
    chooseWalletHint: 'Atropyle never asks for a seed phrase. Your wallet shows every step before you sign it.',
    searching: 'Looking for wallets in this browser…',
    searchFailed: 'Could not look for wallets. Check your connection and try again.',
    searchAgain: 'Look again',
    recommended: 'Recommended on X Layer',
    noWalletTitle: 'No wallet in this browser',
    noWalletBody: 'Install the OKX Wallet extension, or open this page in the browser inside the OKX App.',
    noWalletPhone: 'Scan it with your phone, then open the link in the OKX App browser.',
    qrTooLong: 'This link is too long for a QR code. Copy it and send it to your phone.',
    pageLink: 'this page',
    copyLink: 'Copy link',
    rejected: 'You declined in your wallet. Nothing was shared.',
    requestPending: 'Your wallet already has a request open. Finish it there, then try again.',
    connectFailed: 'The wallet did not connect. Try again, or choose another wallet.',
    walletMenu: 'Wallet',
    accountButton: 'Wallet {account}',
    accountButtonWrong: 'Wallet {account}, wrong network',
    connectedWith: 'Connected with',
    network: 'Network',
    wrongNetworkTitle: 'Wrong network',
    wrongNetwork:
      'Your wallet is on {actual}. Atropyle runs on {expected} (chain {id}). Nothing can be signed until you switch.',
    switchNetwork: 'Switch to {expected}',
    switchRejected: 'You declined the switch. Switch to {expected} when you are ready.',
    switchFailed: 'The wallet did not switch. Choose {expected} in your wallet, then come back.',
    disconnect: 'Disconnect',
    disconnectHint: 'This site forgets the wallet. To remove its access, use the connected sites list in your wallet.',
  },
  {
    connect: 'Kết nối ví',
    connectShort: 'Kết nối',
    connecting: 'Đang kết nối…',
    restoring: 'Đang kết nối lại ví…',
    chooseWallet: 'Chọn ví',
    chooseWalletHint: 'Atropyle không bao giờ hỏi cụm từ khôi phục. Ví của bạn hiện từng bước trước khi bạn ký.',
    searching: 'Đang tìm ví trong trình duyệt này…',
    searchFailed: 'Không tìm được ví. Hãy kiểm tra kết nối mạng rồi thử lại.',
    searchAgain: 'Tìm lại',
    recommended: 'Khuyên dùng trên X Layer',
    noWalletTitle: 'Trình duyệt này chưa có ví',
    noWalletBody: 'Hãy cài tiện ích OKX Wallet, hoặc mở trang này trong trình duyệt của OKX App.',
    noWalletPhone: 'Quét bằng điện thoại, rồi mở link trong trình duyệt của OKX App.',
    qrTooLong: 'Link này quá dài để làm mã QR. Hãy sao chép rồi gửi sang điện thoại.',
    pageLink: 'trang này',
    copyLink: 'Sao chép link',
    rejected: 'Bạn đã từ chối trong ví. Không có gì được chia sẻ.',
    requestPending: 'Ví của bạn đang có một yêu cầu chưa xong. Hãy xử lý nó trong ví rồi thử lại.',
    connectFailed: 'Ví chưa kết nối được. Hãy thử lại hoặc chọn ví khác.',
    walletMenu: 'Ví',
    accountButton: 'Ví {account}',
    accountButtonWrong: 'Ví {account}, sai mạng',
    connectedWith: 'Đã kết nối bằng',
    network: 'Mạng',
    wrongNetworkTitle: 'Sai mạng',
    wrongNetwork:
      'Ví của bạn đang ở {actual}. Atropyle chạy trên {expected} (chain {id}). Chưa ký được gì cho tới khi bạn chuyển mạng.',
    switchNetwork: 'Chuyển sang {expected}',
    switchRejected: 'Bạn đã từ chối chuyển mạng. Hãy chuyển sang {expected} khi sẵn sàng.',
    switchFailed: 'Ví chưa chuyển mạng. Hãy chọn {expected} trong ví rồi quay lại.',
    disconnect: 'Ngắt kết nối',
    disconnectHint: 'Trang này sẽ quên ví. Để thu hồi quyền truy cập, hãy dùng danh sách trang đã kết nối trong ví.',
  },
);
```

Bỏ 7 khoá ví cũ khỏi `shell.messages.ts` (giờ nằm trong `wallet.messages.ts`; mỗi khoá là một dòng ở cả `en` và `vi`):

```bash
sed -i -E "/^    (connect|connecting|disconnect|noWallet|chooseWallet|wrongNetwork|switchNetwork): /d" apps/web/src/messages/shell.messages.ts
grep -c "connect\|noWallet\|wrongNetwork\|switchNetwork\|chooseWallet" apps/web/src/messages/shell.messages.ts
```

Expected: `0`.

Thay `apps/web/src/ui/dialog.tsx` (thêm `onCloseAutoFocus`: dialog không có `trigger` thì Radix không biết trả focus về đâu, đọc `onCloseAutoFocus` của `DialogContentModal` trong `@radix-ui/react-dialog` 1.3.1: nó gọi `context.triggerRef.current?.focus()`):

```tsx
'use client';

import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as common } from '@/messages/common.messages';
import { IconButton } from './icon-button';

export interface DialogProps {
  open?: boolean;
  onOpenChange?(open: boolean): void;
  trigger?: ReactElement;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** A sheet from the bottom edge on narrow screens (the default); a centred box from 40rem. */
  sheet?: boolean;
  /** Where focus goes on close. Needed when there is no `trigger`; call `preventDefault()` after moving focus. */
  onCloseAutoFocus?(event: Event): void;
  className?: string;
}

const WIDTH = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-xl' } as const;

export function Dialog({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  children,
  size = 'md',
  sheet = true,
  onCloseAutoFocus,
  className,
}: DialogProps) {
  const c = useT(common);
  // Radix links the description itself; without one, an explicit undefined tells it there is none on purpose.
  const describedBy = description ? {} : { 'aria-describedby': undefined };
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <D.Trigger asChild>{trigger}</D.Trigger> : null}
      <D.Portal>
        <D.Overlay className="atro-overlay fixed inset-0 z-50 bg-bg/95 md:bg-bg/70 md:backdrop-blur-[3px]" />
        <D.Content
          {...describedBy}
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(
            'fixed z-50 flex max-h-[min(90dvh,48rem)] w-full flex-col gap-5 overflow-y-auto border border-line',
            'bg-surface-1 p-6 text-ink shadow-[0_32px_64px_-16px_rgb(0_0_0/0.55)] outline-none',
            sheet
              ? 'atro-dialog atro-sheet inset-x-0 bottom-0 rounded-t-3xl pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:inset-x-auto sm:bottom-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl'
              : 'atro-dialog top-1/2 left-1/2 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl',
            WIDTH[size],
            className,
          )}
        >
          {sheet ? (
            <div aria-hidden="true" className="-mt-2 mx-auto h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" />
          ) : null}
          <div className="flex flex-col gap-1.5 pr-10">
            <D.Title className="font-display text-title">{title}</D.Title>
            {description ? <D.Description className="text-small text-ink-muted">{description}</D.Description> : null}
          </div>
          {children}
          <D.Close asChild>
            <IconButton icon={X} label={c('close')} size="sm" tooltip={false} className="absolute top-4 right-4" />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
```

Run: `npm test -w apps/web -- primitives i18n`
Expected: PASS. Hai test `Dialog` của Task 8 vẫn đạt, kể cả test overlay (`bg-bg/95`, blur chỉ từ 48rem). Test i18n kiểm `wallet.messages.ts` có cùng khoá và cùng placeholder ở hai ngôn ngữ.

- [ ] **Step 6: Test hỏng cho giao diện ví**

`apps/web/test/unit/wallet-ui.test.tsx`:

```tsx
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LoadedVault } from '../../src/chain/types';
import { ConnectSheet } from '../../src/wallet/connect-sheet';
import { NetworkBanner } from '../../src/wallet/network-banner';
import { WalletContext, type WalletValue } from '../../src/wallet/provider';
import type { ConnectedWallet, WalletOption } from '../../src/wallet/types';
import { useVaultRoles } from '../../src/wallet/use-vault-roles';
import { WalletButton } from '../../src/wallet/wallet-button';
import { renderWithProviders } from '../helpers/render';
import { fakeWallet } from '../helpers/wallet';
import { fixtureSnapshot, PEOPLE } from './fixtures';

// useVaultRoles reads the real rolesIn through peekChainImpl.
vi.mock('../../src/chain/load', async () => {
  const impl = await import('../../src/chain/impl');
  return { loadChainImpl: async () => impl, peekChainImpl: () => impl };
});

function option(over: Partial<WalletOption> = {}): WalletOption {
  return {
    id: 'okx',
    name: 'OKX Wallet',
    icon: null,
    rdns: 'com.okex.wallet',
    provider: fakeWallet().provider,
    source: 'eip6963',
    ...over,
  };
}

function walletValue(over: Partial<WalletValue> = {}): WalletValue {
  return {
    status: 'idle',
    wallet: null,
    expectedChainId: 196,
    wrongChain: false,
    wallets: null,
    discovering: false,
    discover: vi.fn(async () => []),
    connect: vi.fn(),
    disconnect: vi.fn(),
    switchChain: vi.fn(async () => undefined),
    walletClient: vi.fn(),
    sheetOpen: false,
    openSheet: vi.fn(),
    setSheetOpen: vi.fn(),
    sheetOpener: { current: null },
    ...over,
  };
}

const on = (chainId: number, account: string = PEOPLE.owner): ConnectedWallet => ({
  option: option(),
  account: account as ConnectedWallet['account'],
  chainId,
});

function withWallet(ui: ReactElement, value: WalletValue) {
  const r = renderWithProviders(<WalletContext value={value}>{ui}</WalletContext>);
  return {
    ...r,
    update: (next: WalletValue) => r.rerender(<WalletContext value={next}>{ui}</WalletContext>),
  };
}

const fail = (code: string | number) => Object.assign(new Error(String(code)), { code });

describe('ConnectSheet', () => {
  it('looks for wallets when it opens, then lists them with OKX recommended', () => {
    const discover = vi.fn(async () => []);
    const r = withWallet(<ConnectSheet />, walletValue({ sheetOpen: true, discovering: true, discover }));
    expect(screen.getByRole('dialog', { name: 'Choose a wallet' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Looking for wallets');

    const other = option({ id: 'other', name: 'Other wallet', rdns: 'org.example.wallet' });
    r.update(walletValue({ sheetOpen: true, wallets: [option(), other], discover }));
    expect(screen.getByRole('button', { name: /OKX Wallet/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Other wallet/ })).toBeTruthy();
    expect(screen.getAllByText('Recommended on X Layer')).toHaveLength(1);
    expect(discover).toHaveBeenCalledTimes(1);
  });

  it('connects the wallet chosen and says why a connection failed', async () => {
    const okx = option();
    const connect = vi
      .fn()
      .mockRejectedValueOnce(fail('USER_REJECTED'))
      .mockRejectedValueOnce(fail(-32002))
      .mockRejectedValueOnce(new Error('boom'));
    withWallet(<ConnectSheet />, walletValue({ sheetOpen: true, wallets: [okx], connect }));
    const row = screen.getByRole('button', { name: /OKX Wallet/ });

    fireEvent.click(row);
    expect(await screen.findByText('You declined in your wallet. Nothing was shared.')).toBeTruthy();
    fireEvent.click(row);
    expect(await screen.findByText(/already has a request open/)).toBeTruthy();
    fireEvent.click(row);
    expect(await screen.findByText(/did not connect/)).toBeTruthy();
    expect(connect).toHaveBeenCalledWith(okx);
  });

  it('treats a wallet name as untrusted text and recommends by rdns only', () => {
    const evil = option({ id: 'evil', name: '<img src=x onerror=alert(1)> OKX', rdns: 'evil.example' });
    withWallet(<ConnectSheet />, walletValue({ sheetOpen: true, wallets: [evil] }));
    const name = screen.getByRole('dialog').querySelector('bdi[data-untrusted]');
    expect(name?.textContent).toBe('<img src=x onerror=alert(1)> OKX');
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(screen.queryByText('Recommended on X Layer')).toBeNull();
  });

  it('without a wallet, offers the page link and a QR code, never an app link', async () => {
    withWallet(<ConnectSheet />, walletValue({ sheetOpen: true, wallets: [] }));
    expect(screen.getByText('No wallet in this browser')).toBeTruthy();
    expect(await screen.findByRole('img', { name: 'QR code for this page' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    expect(screen.getByRole('dialog').querySelector('a')).toBeNull();
  });

  it('offers a link too long for a QR code for copying only', async () => {
    window.history.replaceState(null, '', `/sign/#p=${'a'.repeat(700)}`);
    try {
      withWallet(<ConnectSheet />, walletValue({ sheetOpen: true, wallets: [] }));
      expect(await screen.findByText(/too long for a QR code/)).toBeTruthy();
      expect(screen.queryByRole('img', { name: 'QR code for this page' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeTruthy();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});

describe('WalletButton', () => {
  it('offers Connect, holds the place while it reconnects, then shows the account', () => {
    const openSheet = vi.fn();
    const r = withWallet(<WalletButton />, walletValue({ openSheet }));
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect(openSheet).toHaveBeenCalledTimes(1);

    r.update(walletValue({ status: 'restoring' }));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Reconnecting your wallet');

    r.update(walletValue({ status: 'connected', wallet: on(196) }));
    expect(screen.getByRole('button', { name: 'Wallet 0x7099 7970 … 17dc 79C8' })).toBeTruthy();

    r.update(walletValue({ status: 'connected', wallet: on(1), wrongChain: true }));
    expect(screen.getByRole('button', { name: 'Wallet 0x7099 7970 … 17dc 79C8, wrong network' })).toBeTruthy();
  });

  it('the wallet menu shows the full address, the network and Disconnect', async () => {
    const disconnect = vi.fn();
    withWallet(<WalletButton />, walletValue({ status: 'connected', wallet: on(196), disconnect }));
    fireEvent.click(screen.getByRole('button', { name: /^Wallet 0x7099/ }));
    const menu = await screen.findByRole('dialog', { name: 'Wallet' });
    expect(menu.querySelector(`[data-address="${PEOPLE.owner}"]`)).toBeTruthy();
    expect(menu.textContent).toContain('X Layer');
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('NetworkBanner', () => {
  it('appears only on the wrong chain and switches when asked', async () => {
    const switchChain = vi.fn().mockRejectedValueOnce(fail('USER_REJECTED')).mockResolvedValueOnce(undefined);
    const r = withWallet(<NetworkBanner />, walletValue({ status: 'connected', wallet: on(196) }));
    expect(screen.queryByTestId('network-banner')).toBeNull();

    r.update(walletValue({ status: 'connected', wallet: on(1), wrongChain: true, switchChain }));
    expect(screen.getByTestId('network-banner').textContent).toContain(
      'Your wallet is on Ethereum. Atropyle runs on X Layer (chain 196).',
    );
    const button = screen.getByRole('button', { name: 'Switch to X Layer' });
    fireEvent.click(button);
    expect(await screen.findByText('You declined the switch. Switch to X Layer when you are ready.')).toBeTruthy();
    fireEvent.click(button);
    await waitFor(() => expect(switchChain).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/You declined the switch/)).toBeNull());
  });
});

function Roles({ loaded }: { loaded: LoadedVault | undefined }) {
  return <output>{JSON.stringify(useVaultRoles(loaded))}</output>;
}

describe('useVaultRoles', () => {
  it('gives the connected account its roles, none without a wallet, and null before the vault loads', () => {
    const loaded = {
      snap: fixtureSnapshot(),
      timeline: null,
      registered: true,
      fetchedAtMs: 0,
    } as unknown as LoadedVault;
    const read = () => JSON.parse(screen.getByRole('status').textContent ?? '');
    const r = renderWithProviders(
      <WalletContext value={walletValue({ status: 'connected', wallet: on(196) })}>
        <Roles loaded={loaded} />
      </WalletContext>,
    );
    expect(read()).toEqual(['owner']);
    r.rerender(
      <WalletContext value={walletValue({ status: 'connected', wallet: on(196, PEOPLE.heirB) })}>
        <Roles loaded={loaded} />
      </WalletContext>,
    );
    expect(read()).toEqual(['heir', 'guardian']);
    r.rerender(
      <WalletContext value={walletValue()}>
        <Roles loaded={loaded} />
      </WalletContext>,
    );
    expect(read()).toEqual([]);
    r.rerender(
      <WalletContext value={walletValue()}>
        <Roles loaded={undefined} />
      </WalletContext>,
    );
    expect(read()).toBeNull();
  });
});
```

(`<output>` có vai trò ARIA `status`, nên test đọc nó bằng `getByRole('status')`.)

Run: `npm test -w apps/web -- wallet-ui`
Expected: FAIL, không tìm thấy `../../src/wallet/connect-sheet`.

- [ ] **Step 7: Viết `ConnectSheet`, `WalletButton`, `WalletMenu`, `NetworkBanner`, `useVaultRoles`; gắn vào header và khung**

`apps/web/src/wallet/connect-sheet.tsx`:

```tsx
'use client';

import { ChevronRight, RefreshCw, Wallet, WalletMinimal } from 'lucide-react';
import { m } from 'motion/react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { errorCode } from '@/chain/query-client';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as walletText } from '@/messages/wallet.messages';
import { SPRING } from '@/motion/tokens';
import { Button } from '@/ui/button';
import { CopyButton } from '@/ui/copy-button';
import { Dialog } from '@/ui/dialog';
import { InlineError } from '@/ui/inline-error';
import { Skeleton } from '@/ui/skeleton';
import { Spinner } from '@/ui/spinner';
import { UntrustedText } from '@/ui/untrusted-text';
import { useWallet } from './provider';
import type { WalletOption } from './types';

// The QR encoder loads only when the no-wallet help shows, so it stays out of every page's first bundle.
const QrCode = lazy(() => import('@/ui/qr-code').then((mod) => ({ default: mod.QrCode })));

/** Longer links (a sign link with its payload) make a QR code too dense for a phone camera; uqr throws past ~2.3 kB. */
export const QR_MAX_CHARS = 512;

export type PickerError = 'rejected' | 'requestPending' | 'connectFailed' | 'searchFailed';

/** The message for a failed connection: declined (4001, USER_REJECTED here), a prompt already open (-32002), or other. */
export function connectErrorKey(e: unknown): Exclude<PickerError, 'searchFailed'> {
  if (errorCode(e) === 'USER_REJECTED') return 'rejected';
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined;
  return code === -32002 ? 'requestPending' : 'connectFailed';
}

/** OKX Wallet, known by its EIP-6963 rdns or the OKX App's injected global. Never by name: any wallet can pick a name. */
export function isRecommended(w: Pick<WalletOption, 'rdns' | 'source'>): boolean {
  return w.rdns === 'com.okex.wallet' || w.source === 'okxwallet';
}

export interface WalletPickerProps {
  /** null until the first search ends. */
  wallets: readonly WalletOption[] | null;
  searching: boolean;
  /** The wallet whose prompt is open. */
  connectingId: string | null;
  error: PickerError | null;
  /** The page to open on a phone; empty until known. */
  pageUrl: string;
  onPick(option: WalletOption): void;
  onSearch(): void;
}

function WalletIcon({ option }: { option: WalletOption }) {
  if (option.icon) {
    // A data: image from the wallet (wallet.ts keeps only data:image/ up to 100 kB); next/image cannot serve it here.
    // biome-ignore lint/performance/noImgElement: a data: URL from the wallet, in a static export
    return <img src={option.icon} alt="" width={36} height={36} className="size-9 shrink-0 rounded-xl" />;
  }
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-muted">
      <Wallet aria-hidden="true" size={18} strokeWidth={1.5} />
    </span>
  );
}

function NoWallet({ pageUrl, searching, onSearch }: Pick<WalletPickerProps, 'pageUrl' | 'searching' | 'onSearch'>) {
  const t = useT(walletText);
  const fits = pageUrl.length > 0 && pageUrl.length <= QR_MAX_CHARS;
  return (
    <div className="flex flex-col items-center gap-3 py-2 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-2 text-thread">
        <WalletMinimal aria-hidden="true" size={22} strokeWidth={1.5} />
      </span>
      <p className="font-display text-ink text-title">{t('noWalletTitle')}</p>
      <p className="max-w-prose text-ink-muted text-small">{t('noWalletBody')}</p>
      {pageUrl ? (
        <div className="mt-1 flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-line bg-surface-2/60 p-4">
          {fits ? (
            <Suspense
              fallback={
                <span className="block overflow-hidden rounded-xl">
                  <Skeleton className="size-[168px]" />
                </span>
              }
            >
              <QrCode value={pageUrl} label={t('pageLink')} size={168} />
            </Suspense>
          ) : null}
          <p className="text-caption text-ink-muted">{fits ? t('noWalletPhone') : t('qrTooLong')}</p>
          <CopyButton text={pageUrl} label={t('copyLink')} showText />
        </div>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        loading={searching}
        onClick={onSearch}
        icon={<RefreshCw aria-hidden="true" strokeWidth={1.5} />}
      >
        {t('searchAgain')}
      </Button>
    </div>
  );
}

/** The body of the sheet in each of its states; pure, so a test renders each one without a wallet. */
export function WalletPicker({
  wallets,
  searching,
  connectingId,
  error,
  pageUrl,
  onPick,
  onSearch,
}: WalletPickerProps) {
  const t = useT(walletText);
  if (wallets === null && error === 'searchFailed' && !searching) {
    return (
      <div className="flex flex-col items-start gap-3">
        <InlineError>{t('searchFailed')}</InlineError>
        <Button
          variant="secondary"
          size="sm"
          onClick={onSearch}
          icon={<RefreshCw aria-hidden="true" strokeWidth={1.5} />}
        >
          {t('searchAgain')}
        </Button>
      </div>
    );
  }
  if (wallets === null) {
    return (
      <div role="status" className="flex flex-col gap-2">
        <span className="sr-only">{t('searching')}</span>
        <span className="block overflow-hidden rounded-2xl">
          <Skeleton className="h-[62px]" />
        </span>
        <span className="block overflow-hidden rounded-2xl">
          <Skeleton className="h-[62px]" />
        </span>
      </div>
    );
  }
  if (wallets.length === 0) return <NoWallet pageUrl={pageUrl} searching={searching} onSearch={onSearch} />;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {wallets.map((w, at) => {
          const busy = connectingId === w.id;
          return (
            <m.li
              key={w.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...SPRING, delay: at * 0.04 }}
            >
              <button
                type="button"
                onClick={() => onPick(w)}
                disabled={connectingId !== null}
                aria-busy={busy || undefined}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-2xl border bg-surface-1 p-3 text-left',
                  'transition-[border-color,background-color,opacity,transform] duration-150',
                  busy ? 'border-thread/60' : 'border-line',
                  connectingId === null
                    ? 'hover:border-line-strong hover:bg-surface-2 active:scale-[0.99]'
                    : !busy && 'cursor-not-allowed opacity-60',
                )}
              >
                <WalletIcon option={w} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <UntrustedText value={w.name} max={40} className="truncate font-medium text-ink" />
                  {isRecommended(w) ? <span className="text-caption text-thread">{t('recommended')}</span> : null}
                </span>
                {busy ? (
                  <Spinner label={t('connecting')} />
                ) : (
                  <ChevronRight
                    aria-hidden="true"
                    size={18}
                    strokeWidth={1.5}
                    className="shrink-0 text-ink-muted transition-transform duration-150 group-hover:translate-x-0.5"
                  />
                )}
              </button>
            </m.li>
          );
        })}
      </ul>
      <div aria-live="polite">{error ? <InlineError>{t(error)}</InlineError> : null}</div>
    </div>
  );
}

/** The one wallet sheet of the site, opened by `openSheet()` from anywhere (Quyết định 17: no OKX app link). */
export function ConnectSheet() {
  const t = useT(walletText);
  const w = useWallet();
  const { sheetOpen, discover } = w;
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [error, setError] = useState<PickerError | null>(null);
  const [pageUrl, setPageUrl] = useState('');

  useEffect(() => {
    if (!sheetOpen) return;
    setError(null);
    setPageUrl(window.location.href);
    discover().catch(() => setError('searchFailed'));
  }, [sheetOpen, discover]);

  const pick = async (option: WalletOption) => {
    setError(null);
    setConnectingId(option.id);
    try {
      await w.connect(option);
    } catch (e) {
      setError(connectErrorKey(e));
    } finally {
      setConnectingId(null);
    }
  };

  const search = () => {
    setError(null);
    discover().catch(() => setError('searchFailed'));
  };

  return (
    <Dialog
      open={sheetOpen}
      onOpenChange={w.setSheetOpen}
      title={t('chooseWallet')}
      description={t('chooseWalletHint')}
      size="sm"
      onCloseAutoFocus={(event) => {
        // Back to what opened the sheet; after a connection that button is gone, so to the wallet button instead.
        const opener = w.sheetOpener.current;
        const back = opener?.isConnected ? opener : document.querySelector<HTMLElement>('[data-wallet-button]');
        if (back) {
          event.preventDefault();
          back.focus();
        }
      }}
    >
      <WalletPicker
        wallets={w.wallets}
        searching={w.discovering}
        connectingId={connectingId}
        error={error}
        pageUrl={pageUrl}
        onPick={pick}
        onSearch={search}
      />
    </Dialog>
  );
}
```

`apps/web/src/wallet/wallet-button.tsx`:

```tsx
'use client';

import { Wallet } from 'lucide-react';
import { useT } from '@/i18n/provider';
import { messages as walletText } from '@/messages/wallet.messages';
import { Button } from '@/ui/button';
import { Skeleton } from '@/ui/skeleton';
import { useWallet } from './provider';
import { WalletMenu } from './wallet-menu';

/** Connect, a placeholder while a remembered wallet reconnects, or the account with its menu. */
export function WalletButton() {
  const t = useT(walletText);
  const { status, wallet, openSheet } = useWallet();
  if (wallet) return <WalletMenu />;
  if (status === 'restoring') {
    return (
      <span role="status" className="inline-flex overflow-hidden rounded-full">
        <Skeleton className="h-8 w-24 sm:w-44" />
        <span className="sr-only">{t('restoring')}</span>
      </span>
    );
  }
  const connecting = status === 'connecting';
  return (
    <Button
      size="sm"
      variant="primary"
      data-wallet-button=""
      aria-label={connecting ? undefined : t('connect')}
      loading={connecting}
      onClick={openSheet}
      icon={<Wallet aria-hidden="true" strokeWidth={1.5} />}
    >
      {connecting ? (
        t('connecting')
      ) : (
        <>
          <span className="sm:hidden">{t('connectShort')}</span>
          <span className="hidden sm:inline">{t('connect')}</span>
        </>
      )}
    </Button>
  );
}
```

`apps/web/src/wallet/wallet-menu.tsx`:

```tsx
'use client';

import { LogOut } from 'lucide-react';
import { ENV, explorerUrlOf } from '@/config/env';
import { useT } from '@/i18n/provider';
import { compactAddress } from '@/lib/address';
import { cn } from '@/lib/cn';
import { messages as walletText } from '@/messages/wallet.messages';
import { Address, Avatar } from '@/ui/address';
import { Button } from '@/ui/button';
import { Popover, PopoverClose } from '@/ui/popover';
import { UntrustedText } from '@/ui/untrusted-text';
import { networkName } from './network';
import { SwitchNetworkButton } from './network-banner';
import { useWallet } from './provider';

const EXPLORER = explorerUrlOf(ENV);

/**
 * The connected account: a short form on the button (the full address is one click away, Task 5 `compactAddress`),
 * the full address, the network and Disconnect in the menu.
 */
export function WalletMenu() {
  const t = useT(walletText);
  const { wallet, wrongChain, disconnect } = useWallet();
  if (!wallet) return null;
  const short = compactAddress(wallet.account);
  return (
    <Popover
      label={t('walletMenu')}
      className="w-80 max-w-[calc(100vw-1.5rem)]"
      trigger={
        <button
          type="button"
          data-wallet-button=""
          aria-label={t(wrongChain ? 'accountButtonWrong' : 'accountButton', { account: short })}
          className="relative inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface-1 pr-1.5 pl-1.5 text-small transition-colors duration-150 hover:bg-surface-2 sm:pr-3"
        >
          <Avatar address={wallet.account} size={24} />
          <span translate="no" className="hidden font-mono tabular-nums sm:inline">
            {short}
          </span>
          {wrongChain ? (
            <span
              aria-hidden="true"
              className="-top-0.5 -right-0.5 absolute size-2.5 rounded-full bg-grace ring-2 ring-bg"
            />
          ) : null}
        </button>
      }
    >
      <div className="flex flex-col gap-4 p-1">
        <div className="flex flex-col gap-2">
          <p className="text-caption text-ink-muted">
            {t('connectedWith')} <UntrustedText value={wallet.option.name} max={40} className="text-ink" />
          </p>
          <Address address={wallet.account} explorer={EXPLORER} size="sm" />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3 py-2 text-small">
          <span className="text-ink-muted">{t('network')}</span>
          <span className={cn('inline-flex items-center gap-1.5', wrongChain ? 'text-grace' : 'text-ink')}>
            <span aria-hidden="true" className={cn('size-2 rounded-full', wrongChain ? 'bg-grace' : 'bg-alive')} />
            {networkName(wallet.chainId)}
            <span className="font-mono text-ink-muted">· {wallet.chainId}</span>
          </span>
        </div>
        {wrongChain ? <SwitchNetworkButton /> : null}
        <div className="flex flex-col items-start gap-1.5 border-line border-t pt-3">
          <PopoverClose asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={disconnect}
              icon={<LogOut aria-hidden="true" strokeWidth={1.5} />}
            >
              {t('disconnect')}
            </Button>
          </PopoverClose>
          <p className="px-1 text-caption text-ink-muted">{t('disconnectHint')}</p>
        </div>
      </div>
    </Popover>
  );
}
```

`apps/web/src/wallet/network-banner.tsx`:

```tsx
'use client';

import { useId, useState } from 'react';
import { errorCode } from '@/chain/query-client';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as walletText } from '@/messages/wallet.messages';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { InlineError } from '@/ui/inline-error';
import { networkName } from './network';
import { useWallet } from './provider';

/** Asks the wallet to move to this build's chain (adding it first if the wallet does not know it). */
export function SwitchNetworkButton({ className }: { className?: string }) {
  const t = useT(walletText);
  const { switchChain, expectedChainId } = useWallet();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'switchRejected' | 'switchFailed' | null>(null);
  const errorId = useId();
  const expected = networkName(expectedChainId);
  return (
    <div className={cn('flex flex-col items-start gap-2', className)}>
      <Button
        size="sm"
        variant="primary"
        loading={busy}
        aria-describedby={error ? errorId : undefined}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await switchChain();
          } catch (e) {
            setError(errorCode(e) === 'USER_REJECTED' ? 'switchRejected' : 'switchFailed');
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('switchNetwork', { expected })}
      </Button>
      {error ? <InlineError id={errorId}>{t(error, { expected })}</InlineError> : null}
    </div>
  );
}

/**
 * Under the header while the wallet is on another chain (Review Focus 3). The live region is always there, so a
 * screen reader hears the banner when a wallet event brings it.
 */
export function NetworkBanner() {
  const t = useT(walletText);
  const { wallet, wrongChain, expectedChainId } = useWallet();
  const show = wallet !== null && wrongChain;
  return (
    <div aria-live="polite" className={show ? 'mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6' : undefined}>
      {show ? (
        <Banner tone="warn" testId="network-banner" title={t('wrongNetworkTitle')} action={<SwitchNetworkButton />}>
          {t('wrongNetwork', {
            actual: networkName(wallet.chainId),
            expected: networkName(expectedChainId),
            id: expectedChainId,
          })}
        </Banner>
      ) : null}
    </div>
  );
}
```

`apps/web/src/wallet/use-vault-roles.ts`:

```ts
'use client';

import type { Role } from '@atropyle/sdk';
import { useMemo } from 'react';
import { peekChainImpl } from '@/chain/load';
import type { LoadedVault } from '@/chain/types';
import { useWallet } from './provider';

/**
 * The connected account's roles in a loaded vault: null until the vault has loaded, [] without a wallet. Computed in
 * render (a vault in the cache means the chain impl has loaded), so a wallet event changes the roles in the same frame.
 */
export function useVaultRoles(loaded: LoadedVault | undefined): readonly Role[] | null {
  const { wallet } = useWallet();
  const account = wallet?.account ?? null;
  return useMemo(() => {
    const impl = peekChainImpl();
    return loaded && impl ? impl.rolesIn(loaded.snap, account) : null;
  }, [loaded, account]);
}
```

`header.tsx` và `frame.tsx` đã mang các thay đổi §18 của Task 9:
- header đặc dưới 48rem (`bg-bg/95`), blur chỉ từ 48rem;
- `view-transition-name`;
- dòng bằng chứng là dải đầu tiên hiện ra trên trang, ngay sau nút bỏ qua.

Task này chỉ thêm ba thành phần ví. Mọi thứ khác giữ nguyên từng ký tự.

Header: `WalletButton` đứng đầu khối nút bên phải; khoảng cách của khối từ `gap-1` thành `gap-2`.

```bash
sed -i "s#^import { MobileMenu } from './mobile-menu';#import { WalletButton } from '@/wallet/wallet-button';\nimport { MobileMenu } from './mobile-menu';#" apps/web/src/shell/header.tsx
sed -i 's#^\(\s*\)<div className="ml-auto flex items-center gap-1">$#\1<div className="ml-auto flex items-center gap-2">\n\1  <WalletButton />#' apps/web/src/shell/header.tsx
npx biome check --write apps/web/src/shell/header.tsx
grep -c "WalletButton" apps/web/src/shell/header.tsx
git diff --numstat apps/web/src/shell/header.tsx
grep -o 'className="site-header[^"]*"' apps/web/src/shell/header.tsx
```

Expected:
- `grep -c` in `2`;
- `git diff --numstat` in `3	1	apps/web/src/shell/header.tsx`: thêm import, thêm `<WalletButton />`, đổi `gap-1` thành `gap-2`;
- `grep -o` in đúng một dòng, là lớp của `<header>` mà Task 9 viết, không đổi ký tự nào: `className="site-header sticky top-0 z-40 border-line/70 border-b bg-bg/95 md:bg-bg/80 md:backdrop-blur-md"`. Nếu lệnh không in gì, hoặc in dòng khác, thì sed đã chạm vào `<header>`: chạy `git checkout -- apps/web/src/shell/header.tsx` rồi làm lại từ lệnh sed đầu.

Nếu Task 9 đã đổi dòng `ml-auto` hay dòng import `MobileMenu`, `sed` sẽ không khớp và `grep -c` ra số khác `2`. Khi đó sửa tay đúng hai chỗ đó, rồi chạy lại ba lệnh kiểm.

Khung: `NetworkBanner` ngay dưới `Header`, `ConnectSheet` ngay sau `Footer`.

```bash
sed -i "s#^import { Footer } from './footer';#import { ConnectSheet } from '@/wallet/connect-sheet';\nimport { NetworkBanner } from '@/wallet/network-banner';\nimport { Footer } from './footer';#" apps/web/src/shell/frame.tsx
sed -i 's#^\(\s*\)<Header />$#\1<Header />\n\1<NetworkBanner />#' apps/web/src/shell/frame.tsx
sed -i 's#^\(\s*\)<Footer />$#\1<Footer />\n\1<ConnectSheet />#' apps/web/src/shell/frame.tsx
npx biome check --write apps/web/src/shell/frame.tsx
grep -c "NetworkBanner\|ConnectSheet" apps/web/src/shell/frame.tsx
git diff --numstat apps/web/src/shell/frame.tsx
```

Expected: `grep -c` in `4`; `git diff --numstat` in `4	0	apps/web/src/shell/frame.tsx`. Dòng bằng chứng của Task 9 vẫn là dải đầu tiên hiện ra trên trang, ngay sau nút bỏ qua: `NetworkBanner` đứng sau `Header`, `ConnectSheet` sau `Footer`. Test của Task 9 tìm dòng đó bằng role và `data-testid`, không theo thứ tự con, nên vẫn đạt.

Run: `npm test -w apps/web -- wallet-ui shell`
Expected: PASS. `wallet-ui` có 9 test. `shell` có đúng số test của Task 9 (bản đã viết lại); Task này không thêm test shell.

- [ ] **Step 8: Chạy toàn bộ, kiểm bundle, kiểm bằng mắt và commit**

```bash
npm test -w apps/web
npm run typecheck -w apps/web
npx biome ci .
npm run test:build -w apps/web
```

Kiểm bằng mắt bằng `npm run dev -w apps/web`, mở `http://localhost:3000/`, ở 360 px và ở 1440 px:
- bấm Connect wallet: trên trình duyệt không có ví, sheet hiện hướng dẫn, nút sao chép link và mã QR;
- dưới 48rem, nền sau sheet đặc, không nhoè; từ 48rem, nền mờ và nhoè nhẹ;
- lặp lại ở theme Vellum (Settings, hoặc Menu trên màn hình hẹp).

Dừng server.

```bash
git add apps/web/src/wallet apps/web/src/messages/wallet.messages.ts apps/web/src/messages/shell.messages.ts apps/web/src/ui/dialog.tsx apps/web/src/shell/providers.tsx apps/web/src/shell/header.tsx apps/web/src/shell/frame.tsx apps/web/test/helpers/render.tsx apps/web/test/helpers/wallet.ts apps/web/test/unit/wallet.test.ts apps/web/test/unit/send-calls.test.ts apps/web/test/unit/wallet-session.test.ts apps/web/test/unit/wallet-provider.test.tsx apps/web/test/unit/wallet-ui.test.tsx
git commit -m "feat(web): wallet session, connect sheet and wallet button" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected:
- mọi test PASS;
- `lazy-boundary` vẫn PASS: mọi file ngoài `wallet/impl/` chỉ `import type` từ viem, SDK và `impl`;
- `test:build` vẫn PASS: HTML prerender của `/` có nút "Connect wallet" và không có `href` ra ngoài.

---

### Task 12: Chứng minh trong worker: port `verify-client`, worker thật và hook `useProof`, `useVaultVerify`

Phép liệt kê 2^26 tổ hợp chạy trong `src/workers/verify.worker.ts`, không gọi mạng (Plan 4, quyết định 8 của web cũ). Client của worker và phần đọc quorum được port nguyên văn vào `src/verify/impl/`; hook ở ngoài giữ kết quả cho cả phiên bằng TanStack Query, và tiến độ nằm trong một store nhỏ để trang mount lại giữa chừng vẫn thấy tiến độ.

**Files:**
- Create (port): `apps/web/src/workers/verify.worker.ts`, `apps/web/src/verify/impl/verify-client.ts`, `apps/web/src/verify/verify-view.ts`, `apps/web/test/unit/{verify-client,verify-cache,verify-view}.test.ts`
- Create (mới): `apps/web/src/verify/impl/index.ts`, `apps/web/src/verify/{types,load,hooks}.ts`
- Modify: `apps/web/src/app/e2e/worker/page.e2e.tsx` (thêm hàng `worker-verify`), `apps/web/scripts/worker-check.ts` (chờ cả hai hàng)
- Test: `apps/web/test/unit/verify-hooks.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`buildApp`, `OUT_DIR`, `startStaticServer`, trang `e2e/worker`), Task 10 (`CHAIN_ID`, `useSdk`, `chainKeys`, `useChainSettings`, `type Sdk`, `makeWrapper`).
- Produces:
  - `src/verify/impl/index.ts` (chỉ nạp qua `loadVerifyImpl`): `type WorkerIn`, `type WorkerOut`, `interface WorkerLike`, `type WorkerFactory`, `createVerifyWorker`, `errorFromJson(j)`, `evaluateInWorker(bundle, o?)`, `quorumClient(sdk)`, `proofKey(sdk)`, `runProof(sdk: Sdk, o?: { onProgress?; blocks?; worker? }): Promise<PolicyVerification>` (một lần mỗi phiên, người gọi sau nhập chuyến đang chạy), `runVaultVerify(sdk, vault, { policy, onProgress?, worker? }): Promise<VaultVerification>`.
  - `src/verify/types.ts` (chỉ kiểu): `PolicyVerification`, `PolicyBundle`, `VaultVerification`, `interface ProofProgress { done: number; total: number }`.
  - `src/verify/load.ts`: `type VerifyImpl`; `loadVerifyImpl(): Promise<VerifyImpl>`.
  - `src/verify/verify-view.ts` (thuần, chỉ kiểu từ SDK): `type RowState`, `type RowId`, `interface VerifyRow`, `vaultVerifyRows(v)`, `PROPERTY_ORDER`, `interface ProofSummary`, `proofSummary(r)`.
  - `src/verify/hooks.ts`: `type RunStatus = 'idle' | 'running' | 'done' | 'error'`; `verifyKeys.{proof(crossCheck), vault(vault, policy, crossCheck)}`; `interface ProofState { status; progress: ProofProgress | null; result: PolicyVerification | undefined; error: unknown; run(): void }`; `useProof(): ProofState`; `interface VaultVerifyState { status; progress; result: VaultVerification | undefined; error: unknown; retry(): void }`; `useVaultVerify(vault: Address | null, policy: boolean): VaultVerifyState`.

- [ ] **Step 1: Port worker, client, phần trình bày và test của chúng**

```bash
L=apps/web-legacy
W=apps/web
mkdir -p $W/src/verify/impl
cp $L/src/workers/verify.worker.ts $W/src/workers/verify.worker.ts
sed -i "s#'../lib/verify-client'#'../verify/impl/verify-client'#" $W/src/workers/verify.worker.ts
cp $L/src/lib/verify-client.ts $W/src/verify/impl/verify-client.ts
sed -i "s#import type { Sdk } from './sdk';#import type { Sdk } from '@/chain/types';#; s#'../workers/verify.worker.ts'#'../../workers/verify.worker.ts'#" $W/src/verify/impl/verify-client.ts
cp $L/src/lib/verify-view.ts $W/src/verify/verify-view.ts
cp $L/test/unit/verify-client.test.ts $W/test/unit/verify-client.test.ts
sed -i "s#'../../src/lib/verify-client'#'../../src/verify/impl/verify-client'#" $W/test/unit/verify-client.test.ts
cp $L/test/unit/verify-cache.test.ts $W/test/unit/verify-cache.test.ts
sed -i "s#'../../src/lib/verify-client'#'../../src/verify/impl/verify-client'#; s#'../../src/lib/sdk'#'../../src/chain/types'#" $W/test/unit/verify-cache.test.ts
cp $L/test/unit/verify-view.test.ts $W/test/unit/verify-view.test.ts
sed -i "s#'../../src/lib/verify-view'#'../../src/verify/verify-view'#" $W/test/unit/verify-view.test.ts
grep -n "src/lib/\|'./sdk'\|'../workers/" $W/src/workers/verify.worker.ts $W/src/verify/impl/verify-client.ts $W/test/unit/verify-*.test.ts
```

Expected: lệnh `grep` cuối không in gì.

Run: `npm test -w apps/web -- verify-client verify-cache verify-view`
Expected: PASS (verify-client 6, verify-cache 7, verify-view 6).

- [ ] **Step 2: Viết test hỏng cho các hook**

`apps/web/test/unit/verify-hooks.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Address } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProof, useVaultVerify } from '../../src/verify/hooks';
import type { PolicyVerification } from '../../src/verify/types';
import { makeWrapper } from '../helpers/render';
import { PEOPLE } from './fixtures';

const impl = vi.hoisted(() => ({ runProof: vi.fn(), runVaultVerify: vi.fn() }));
vi.mock('../../src/verify/load', () => ({ loadVerifyImpl: async () => impl }));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: (deployment: unknown) => ({ deployment, atro: {}, rpc: { read: [], verify: [] } }),
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});

type Progress = (done: number, total: number) => void;

beforeEach(() => {
  vi.resetAllMocks();
});

describe('useProof', () => {
  it('runs only when asked, shows progress and keeps the result for the session', async () => {
    let finish: (r: PolicyVerification) => void = () => undefined;
    impl.runProof.mockImplementation(
      (_sdk: unknown, o: { onProgress?: Progress }) =>
        new Promise<PolicyVerification>((resolve) => {
          o.onProgress?.(1, 4);
          finish = resolve;
        }),
    );
    const { wrapper } = makeWrapper();
    const first = renderHook(() => useProof(), { wrapper });
    expect(first.result.current.status).toBe('idle');
    expect(impl.runProof).not.toHaveBeenCalled();

    act(() => first.result.current.run());
    expect(first.result.current.status).toBe('running');
    await waitFor(() => expect(first.result.current.progress).toEqual({ done: 1, total: 4 }));

    const result = { ok: true } as unknown as PolicyVerification;
    act(() => finish(result));
    await waitFor(() => expect(first.result.current.status).toBe('done'));
    expect(first.result.current.result).toBe(result);
    expect(first.result.current.progress).toBeNull();
    first.unmount();

    // Another page of the same session: the proof is not run again.
    const again = renderHook(() => useProof(), { wrapper });
    expect(again.result.current.status).toBe('done');
    expect(again.result.current.result).toBe(result);
    expect(impl.runProof).toHaveBeenCalledTimes(1);
  });

  it('reports a failed proof and runs it again on request', async () => {
    impl.runProof
      .mockRejectedValueOnce(Object.assign(new Error('every RPC failed'), { code: 'RPC_UNAVAILABLE' }))
      .mockResolvedValueOnce({ ok: true });
    const { wrapper } = makeWrapper();
    const h = renderHook(() => useProof(), { wrapper });
    act(() => h.result.current.run());
    await waitFor(() => expect(h.result.current.status).toBe('error'));
    expect(h.result.current.error).toMatchObject({ code: 'RPC_UNAVAILABLE' });

    act(() => h.result.current.run());
    await waitFor(() => expect(h.result.current.status).toBe('done'));
    expect(impl.runProof).toHaveBeenCalledTimes(2);
  });
});

describe('useVaultVerify', () => {
  it('checks the vault at once, and the policy only when asked', async () => {
    impl.runVaultVerify.mockImplementation(async (_sdk: unknown, vault: string, o: { policy: boolean }) => ({
      vault,
      policy: o.policy,
    }));
    const { wrapper } = makeWrapper();
    const h = renderHook(({ policy }) => useVaultVerify(PEOPLE.vault as Address, policy), {
      wrapper,
      initialProps: { policy: false },
    });
    expect(h.result.current.status).toBe('running');
    await waitFor(() => expect(h.result.current.status).toBe('done'));
    expect(h.result.current.result).toMatchObject({ vault: PEOPLE.vault, policy: false });

    h.rerender({ policy: true });
    await waitFor(() => expect(h.result.current.result).toMatchObject({ policy: true }));
    expect(impl.runVaultVerify).toHaveBeenCalledTimes(2);

    const none = renderHook(() => useVaultVerify(null, false), { wrapper });
    expect(none.result.current.status).toBe('idle');
  });
});
```

Run: `npm test -w apps/web -- verify-hooks`
Expected: FAIL, không tìm thấy `../../src/verify/hooks`.

- [ ] **Step 3: Viết `types.ts`, `load.ts`, `impl/index.ts` và `hooks.ts`**

`apps/web/src/verify/types.ts`:

```ts
export type { PolicyVerification } from '@atropyle/sdk';
export type { PolicyBundle, VaultVerification } from '@atropyle/sdk/verify';

/** Combinations enumerated so far, out of 2^26. */
export interface ProofProgress {
  done: number;
  total: number;
}
```

`apps/web/src/verify/impl/index.ts`:

```ts
export {
  createVerifyWorker,
  errorFromJson,
  evaluateInWorker,
  proofKey,
  quorumClient,
  runProof,
  runVaultVerify,
  type WorkerFactory,
  type WorkerIn,
  type WorkerLike,
  type WorkerOut,
} from './verify-client';
```

`apps/web/src/verify/load.ts`:

```ts
import type * as Impl from './impl';

export type VerifyImpl = typeof Impl;

let pending: Promise<VerifyImpl> | null = null;

/** The proof code (quorum reads, the worker client) loads when a page first asks for a proof. */
export function loadVerifyImpl(): Promise<VerifyImpl> {
  pending ??= import('./impl').catch((e: unknown) => {
    pending = null;
    throw e;
  });
  return pending;
}
```

`apps/web/src/verify/hooks.ts`:

```ts
'use client';

import { skipToken, useQuery } from '@tanstack/react-query';
import { useCallback, useState, useSyncExternalStore } from 'react';
import type { Address } from 'viem';
import { CHAIN_ID, useSdk } from '@/chain/hooks';
import { chainKeys } from '@/chain/keys';
import { useChainSettings } from '@/chain/provider';
import { loadVerifyImpl } from './load';
import type { PolicyVerification, ProofProgress, VaultVerification } from './types';

export type RunStatus = 'idle' | 'running' | 'done' | 'error';

export const verifyKeys = {
  proof: (crossCheck: boolean) => [...chainKeys.all(CHAIN_ID), 'proof', crossCheck ? 'cross' : 'own'] as const,
  vault: (vault: string, policy: boolean, crossCheck: boolean) =>
    [
      ...chainKeys.vault(CHAIN_ID, vault),
      'verify',
      policy ? 'policy' : 'integrity',
      crossCheck ? 'cross' : 'own',
    ] as const,
};

// The proof's progress, by query, outside React state: a page that mounts while the proof runs (the user went from
// /proof/ to a vault and back) still sees the count, although the run was started by the page it left.
const progressById = new Map<string, ProofProgress>();
const listeners = new Set<() => void>();

function publish(id: string, p: ProofProgress | null): void {
  if (p) progressById.set(id, p);
  else progressById.delete(id);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function useProgress(id: string): ProofProgress | null {
  return useSyncExternalStore(
    subscribe,
    () => progressById.get(id) ?? null,
    () => null,
  );
}

const SESSION = {
  staleTime: Number.POSITIVE_INFINITY,
  retry: false,
  refetchOnWindowFocus: false,
  structuralSharing: false,
} as const;

export interface ProofState {
  status: RunStatus;
  progress: ProofProgress | null;
  result: PolicyVerification | undefined;
  error: unknown;
  /** Starts the proof, or runs it again after an error. A finished proof is kept for the whole session. */
  run(): void;
}

/** The policy proof of this build's deployment (2^26 combinations, in the worker), only when the user asks. */
export function useProof(): ProofState {
  const sdkQuery = useSdk();
  const sdk = sdkQuery.data;
  const { crossCheck } = useChainSettings();
  const [started, setStarted] = useState(false);
  const queryKey = verifyKeys.proof(crossCheck);
  const id = JSON.stringify(queryKey);
  const q = useQuery({
    queryKey,
    queryFn:
      started && sdk
        ? async () => {
            try {
              const impl = await loadVerifyImpl();
              return await impl.runProof(sdk, { onProgress: (done, total) => publish(id, { done, total }) });
            } finally {
              publish(id, null);
            }
          }
        : skipToken,
    gcTime: Number.POSITIVE_INFINITY,
    ...SESSION,
  });
  const progress = useProgress(id);
  const { isError, refetch } = q;
  const run = useCallback(() => {
    if (!started) setStarted(true);
    else if (isError) void refetch();
  }, [started, isError, refetch]);

  const sdkError = started && sdkQuery.isError;
  // A retry after an error is 'running' again, not still 'error'.
  const status: RunStatus =
    q.data !== undefined
      ? 'done'
      : q.fetchStatus === 'fetching'
        ? 'running'
        : q.isError || sdkError
          ? 'error'
          : started
            ? 'running'
            : 'idle';
  return { status, progress, result: q.data, error: q.error ?? (sdkError ? sdkQuery.error : null), run };
}

export interface VaultVerifyState {
  status: RunStatus;
  /** The policy proof's progress, while `policy` is on and the proof runs. */
  progress: ProofProgress | null;
  result: VaultVerification | undefined;
  error: unknown;
  retry(): void;
}

/**
 * The integrity checks of one vault through a quorum of RPCs, at once; with `policy`, the policy proof as well
 * (the same run as useProof, joined if it is already going). A transaction on the vault invalidates the result
 * (useInvalidateVault clears every key under the vault's).
 */
export function useVaultVerify(vault: Address | null, policy: boolean): VaultVerifyState {
  const sdkQuery = useSdk();
  const sdk = sdkQuery.data;
  const { crossCheck } = useChainSettings();
  const proofId = JSON.stringify(verifyKeys.proof(crossCheck));
  const q = useQuery({
    queryKey: verifyKeys.vault(vault ?? '', policy, crossCheck),
    queryFn:
      vault && sdk
        ? async () => {
            try {
              const impl = await loadVerifyImpl();
              return await impl.runVaultVerify(sdk, vault, {
                policy,
                onProgress: (done, total) => publish(proofId, { done, total }),
              });
            } finally {
              if (policy) publish(proofId, null);
            }
          }
        : skipToken,
    ...SESSION,
  });
  const progress = useProgress(proofId);
  const { refetch } = q;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const sdkError = vault !== null && sdkQuery.isError;
  const status: RunStatus =
    q.data !== undefined
      ? 'done'
      : q.fetchStatus === 'fetching'
        ? 'running'
        : q.isError || sdkError
          ? 'error'
          : vault
            ? 'running'
            : 'idle';
  return {
    status,
    progress: policy && status === 'running' ? progress : null,
    result: q.data,
    error: q.error ?? (sdkError ? sdkQuery.error : null),
    retry,
  };
}
```

Run: `npm test -w apps/web -- verify-hooks lazy-boundary`
Expected: PASS (verify-hooks 3, lazy-boundary 2).

- [ ] **Step 4: Trang worker của build e2e kiểm thêm worker thật**

Thay `apps/web/src/app/e2e/worker/page.e2e.tsx`:

```tsx
'use client';

import type { PolicyBundle } from '@atropyle/sdk/verify';
import { useEffect, useState } from 'react';
import type { SmokeResult } from '../../../workers/smoke.worker';

type Check = SmokeResult | { state: 'running'; detail: string };

/** A bundle without the policy netlist: the SDK refuses it with POLICY_UNAVAILABLE, before any enumeration. */
const EMPTY = {
  cpu: '0x0000000000000000000000000000000000000000',
  policyId: 0n,
  netlists: [],
} as unknown as PolicyBundle;

function runSmoke(): Promise<SmokeResult> {
  return new Promise((resolve) => {
    const w = new Worker(new URL('../../../workers/smoke.worker.ts', import.meta.url), { type: 'module' });
    const done = (r: SmokeResult) => {
      w.terminate();
      resolve(r);
    };
    w.onmessage = (e: MessageEvent<SmokeResult>) => done(e.data);
    w.onerror = (e) => done({ state: 'error', detail: e.message || 'the worker failed to load' });
    w.postMessage('run');
  });
}

/** The production worker through the production client (Task 12): its chunk loads and its errors come back typed. */
async function runVerifyWorker(): Promise<SmokeResult> {
  const { evaluateInWorker } = await import('../../../verify/impl/verify-client');
  try {
    await evaluateInWorker(EMPTY);
    return { state: 'error', detail: 'a bundle without a policy was accepted' };
  } catch (e) {
    const code = (e as { code?: unknown }).code;
    return code === 'POLICY_UNAVAILABLE'
      ? { state: 'ok', detail: `verify.worker refused the bundle with ${code}` }
      : { state: 'error', detail: `unexpected error: ${String(e)}` };
  }
}

function useCheck(run: () => Promise<SmokeResult>): Check {
  const [check, setCheck] = useState<Check>({ state: 'running', detail: '' });
  useEffect(() => {
    let live = true;
    run().then((r) => {
      if (live) setCheck(r);
    });
    return () => {
      live = false;
    };
  }, [run]);
  return check;
}

/** Only in builds with ATROPYLE_E2E=1 (next.config.mjs pageExtensions). Read by scripts/worker-check.ts and e2e. */
export default function WorkerSmokePage() {
  const smoke = useCheck(runSmoke);
  const verify = useCheck(runVerifyWorker);
  return (
    <main>
      <h1>Worker smoke test</h1>
      <p data-testid="worker-smoke" data-state={smoke.state}>
        {smoke.detail}
      </p>
      <p data-testid="worker-verify" data-state={verify.state}>
        {verify.detail}
      </p>
    </main>
  );
}
```

Thay `apps/web/scripts/worker-check.ts` (chờ cả hai hàng):

```ts
import { chromium } from '@playwright/test';
import { buildApp, OUT_DIR } from './lib/run-next';
import { startStaticServer } from './lib/static-server';

// The strictest policy the site will run under for workers and connections. Inline scripts stay allowed here
// because a header cannot carry the per-page hashes; the meta CSP of Task 15 adds those on top.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

/** The smoke worker of Task 2, then the production verify worker of Task 12. */
const ROWS = ['worker-smoke', 'worker-verify'] as const;

const built = await buildApp({ env: { ...process.env, ATROPYLE_E2E: '1', NEXT_PUBLIC_TARGET: 'deweb' } });
if (built.code !== 0) process.exit(built.code);

const server = await startStaticServer(OUT_DIR, 0, { 'content-security-policy': CSP });
const browser = await chromium.launch();
let ok = false;
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${server.url}/e2e/worker/`);
  const states: string[] = [];
  for (const id of ROWS) {
    await page.waitForSelector(`[data-testid="${id}"]:not([data-state="running"])`, { timeout: 90_000 });
    const row = page.getByTestId(id);
    const state = (await row.getAttribute('data-state')) ?? 'missing';
    states.push(state);
    console.log(`${id}: ${state} — ${await row.textContent()}`);
  }
  for (const e of errors) console.error(`console: ${e}`);
  ok = states.every((s) => s === 'ok') && !errors.some((e) => /Content Security Policy/i.test(e));
} finally {
  await browser.close();
  await server.close();
}
console.log(ok ? 'worker-check: PASS' : 'worker-check: FAIL');
process.exit(ok ? 0 : 1);
```

Run: `npm run worker:check -w apps/web`
Expected: in `worker-smoke: ok — lazy-chunk-loaded; the SDK refused the bundle with POLICY_UNAVAILABLE`, `worker-verify: ok — verify.worker refused the bundle with POLICY_UNAVAILABLE`, rồi `worker-check: PASS`. Nếu `worker-verify` là `error` với lỗi nạp chunk: đường dẫn `new URL('../../workers/verify.worker.ts', import.meta.url)` trong `verify-client.ts` sai thư mục; sửa lệnh `sed` ở Step 1, không đổi trang.

- [ ] **Step 5: Chạy toàn bộ và commit**

```bash
npm test -w apps/web
npm run typecheck -w apps/web
npx biome ci .
npm run test:build -w apps/web
git add apps/web/src/workers/verify.worker.ts apps/web/src/verify apps/web/src/app/e2e/worker/page.e2e.tsx apps/web/scripts/worker-check.ts apps/web/test/unit/verify-client.test.ts apps/web/test/unit/verify-cache.test.ts apps/web/test/unit/verify-view.test.ts apps/web/test/unit/verify-hooks.test.tsx
git commit -m "feat(web): policy proof in a worker, with session-wide proof and vault verify hooks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: mọi test PASS; `test:build` xác nhận `out/e2e/` không có trong build production.

---

### Task 13: Engine giao dịch: `useTxRunner`, `TxCard`, `TxProgress` và `ErrorBox`

Hành vi gửi của web cũ được giữ nguyên: ký lần lượt từng bước, "Tiếp tục từ bước N" sau khi gián đoạn mà không ký lại bước đã xác nhận, link ký trên máy khác chỉ chở các bước còn lại, hỏi trước khi đóng tab khi ví đã nhận một phần. Khác web cũ ở ba chỗ (Quyết định 29):
- `useTxRunner` là hook trả một object `TxRunner`; trang giữ object đó và đưa cho `TxCard`. Trang đọc thẳng `runner.committed`, `runner.result` thay cho callback `onProgress` của web cũ. `tx-card.test.tsx` vẽ `TxCard` ở mọi trạng thái bằng runner giả (`runnerOf`), không cần ví.
- Link ký trên máy khác là `/sign/#p=…` của chính site (`toSignHref`), không còn `#/sign?p=…` qua chuyển hướng. Không có link khi đang gửi hoặc khi mọi bước đã xong (web cũ vẫn cho chép link chở các bước đã xác nhận).
- `ErrorBox` không import SDK: bộ giải mã lỗi nằm trong chunk `tx/impl`, nạp cùng thẻ giao dịch.

Mirror (thẻ giao dịch soi lại sợi chỉ) và Receipt (biên nhận sau khi xong) của spec §18 không thuộc task này: Plan 7B Task 3 làm cả hai. Trạng thái xong của `TxCard` ở đây (`${testId}-done`) giữ nguyên như dưới.

**Files:**
- Create (port): `apps/web/src/tx/tx-view.ts`, `apps/web/src/tx/impl/errors-view.ts`, `apps/web/src/tx/use-leave-guard.ts`, `apps/web/test/unit/{tx-view,errors-view}.test.ts`
- Create (mới): `apps/web/src/tx/impl/{decode,describe,index}.ts`, `apps/web/src/tx/{load,sign-href,use-error-view,use-tx-runner}.ts`, `apps/web/src/tx/{error-box,tx-progress,tx-card}.tsx`
- Modify: `apps/web/src/messages/tx.messages.ts` (thay toàn bộ), `apps/web/test/helpers/wallet.ts` (thêm `walletValue`)
- Test: `apps/web/test/unit/tx-impl.test.ts`, `apps/web/test/unit/error-box.test.tsx`, `apps/web/test/unit/tx-card.test.tsx`, `apps/web/test/unit/tx-runner.test.tsx`

**Interfaces:**
- Consumes: Task 5 (`useT`, `cn`, `formatAmount`, `explorerTx`, `sameAddress`, `defineMessages`, `common.messages`), Task 6 (`HoldButton`, `SPRING`, `useHaptics`), Task 8 (`Address`, `Banner`, `Button`, `CopyButton`, `ExternalLink`, `SkeletonText`, `Spinner`, `UntrustedText`), Task 9 (`ROUTES`, `toSdkSignLink`), Task 10 (`CHAIN_ID`, `useSdk`, `renderWithProviders`, `test/unit/fixtures.ts`), Task 11 (`useWallet`, `WalletContext`, `type WalletValue`, `networkName`, `fakeWallet`, `wallet.messages`).
- Produces:
  - `src/tx/tx-view.ts` (thuần, chỉ kiểu từ SDK): `type StepPhase`, `interface StepRow`, `interface TxView`, `simState`, `warningKey`, `uniqueWarnings`, `txView(plan)`, `applyStep(v, e)`, `failStep(v, index, error)`.
  - `src/tx/impl/index.ts` (chỉ nạp qua `loadTxImpl`): `errorView`, `isErrorJson`, `localDocs`, `interface ErrorView`; `interface ErrorDescription extends ErrorView { reason: string | null }`, `describeError(e: unknown, docsPath: string | null): ErrorDescription`; `interface SendFailure { error: AtropyleErrorJson; index: number | null; completed: number }`, `decodeSendFailure(e: unknown): SendFailure`.
  - `src/tx/load.ts`: `type TxImpl`; `loadTxImpl(): Promise<TxImpl>`; `peekTxImpl(): TxImpl | null`.
  - `src/tx/sign-href.ts`: `toSignHref(sdkLink: string, origin: string): string | null`.
  - `src/tx/use-leave-guard.ts`: `useLeaveGuard(active: boolean): void`.
  - `src/tx/use-error-view.ts`: `type ErrorDescription`; `interface ErrorViewState { view: ErrorDescription | null; unavailable: boolean }`; `useErrorView(error: unknown): ErrorViewState`.
  - `src/tx/error-box.tsx`: `ErrorBox({ error: unknown, onRetry?(): void, testId? = 'error', className? })` (`data-testid`, `data-code`).
  - `src/tx/tx-progress.tsx`: `TxProgress({ rows: readonly StepRow[], testId?, className? })`.
  - `src/tx/use-tx-runner.ts`: `type TxBlocker = 'blocked' | 'connect' | 'wrongAccount' | 'loading'`; `interface TxRunner { plan; view; busy; error: unknown; result: SendResult | null; offset; confirmed; committed; blocker: TxBlocker | null; switchFirst; handoffLink: string | null; explorer: string | null; send(): void; connect(): void; reload(): void }`; `interface TxRunnerOptions { plan: TxPlan; onDone?(result: SendResult): void }`; `useTxRunner(o): TxRunner`.
  - `src/tx/tx-card.tsx`: `interface TxCardProps { runner; label: string; title?: ReactNode; confirm?: 'click' | 'hold'; tone?: 'thread' | 'danger'; testId? = 'tx'; className? }`; `TxCard(props)`. Test id: `${testId}`, `${testId}-progress`, `${testId}-step-${i}` (`data-phase`), `${testId}-send`, `${testId}-connect`, `${testId}-wrong-account`, `${testId}-done`, `${testId}-copy-link`, `warning-${code}`, `error`.
  - `test/helpers/wallet.ts`: `TEST_ACCOUNT`; `walletValue(over?: Partial<WalletValue>): WalletValue` (mặc định đã kết nối `TEST_ACCOUNT` trên chain 196).

- [ ] **Step 1: Port `tx-view`, `errors-view`, `use-leave-guard` và test của chúng**

```bash
L=apps/web-legacy
W=apps/web
mkdir -p $W/src/tx/impl
cp $L/src/lib/tx-view.ts $W/src/tx/tx-view.ts
cp $L/src/lib/errors-view.ts $W/src/tx/impl/errors-view.ts
sed -i "s#^interface ErrorView {#export interface ErrorView {#" $W/src/tx/impl/errors-view.ts
cp $L/src/ui/use-leave-guard.ts $W/src/tx/use-leave-guard.ts
sed -i "s#from 'preact/hooks';#from 'react';#" $W/src/tx/use-leave-guard.ts
cp $L/test/unit/tx-view.test.ts $W/test/unit/tx-view.test.ts
sed -i "s#'../../src/lib/tx-view'#'../../src/tx/tx-view'#" $W/test/unit/tx-view.test.ts
cp $L/test/unit/errors-view.test.ts $W/test/unit/errors-view.test.ts
sed -i "s#'../../src/lib/errors-view'#'../../src/tx/impl/errors-view'#" $W/test/unit/errors-view.test.ts
grep -n "src/lib/\|preact" $W/src/tx/tx-view.ts $W/src/tx/impl/errors-view.ts $W/src/tx/use-leave-guard.ts $W/test/unit/tx-view.test.ts $W/test/unit/errors-view.test.ts
grep -c "^export interface ErrorView" $W/src/tx/impl/errors-view.ts
```

Expected: lệnh `grep -n` không in gì; `grep -c` in `1`. `tx-view.ts` chỉ `import type` từ SDK và viem nên nằm ngoài `impl/`; `errors-view.ts` dùng `decodeError`, `ERROR_INFO` lúc chạy nên nằm trong `impl/`.

Run: `npm test -w apps/web -- tx-view errors-view lazy-boundary`
Expected: PASS (tx-view 5, errors-view 5, lazy-boundary 2).

- [ ] **Step 2: Viết test hỏng cho bộ giải mã và link ký**

`apps/web/test/unit/tx-impl.test.ts`:

```ts
import { AtropyleError, parseSignLink, type SignPayload, signLink, untrusted } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { toSdkSignLink } from '../../src/routes';
import { decodeSendFailure, describeError } from '../../src/tx/impl';
import { toSignHref } from '../../src/tx/sign-href';

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const B = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

describe('decodeSendFailure', () => {
  it('reads which step failed and how many were confirmed before it', () => {
    const f = decodeSendFailure(new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } }));
    expect(f).toMatchObject({ index: 1, completed: 1, error: { code: 'USER_REJECTED' } });
  });

  it('treats a missing or nonsense count as unknown, never as progress', () => {
    expect(decodeSendFailure(new Error('socket hang up'))).toMatchObject({ index: null, completed: 0 });
    for (const details of [
      { index: -1, completed: -2 },
      { index: 1.5, completed: Number.NaN },
      { index: '1', completed: '2' },
    ]) {
      expect(decodeSendFailure(new AtropyleError('UNKNOWN', { details }))).toMatchObject({ index: null, completed: 0 });
    }
  });
});

describe('describeError', () => {
  it('keeps the revert reason apart from the message, and the docs link comes from the code', () => {
    const d = describeError(
      new AtropyleError('UNKNOWN', {
        message: 'The call reverted with a reason this SDK does not recognize.',
        details: { reason: untrusted('ERC20: transfer amount exceeds balance') },
      }),
      null,
    );
    expect(d.reason).toBe('ERC20: transfer amount exceeds balance');
    expect(d.message).not.toContain('ERC20');
    expect(describeError(new AtropyleError('NOT_OWNER'), '/docs/').docsUrl).toBe(
      '/docs/reference/errors.html#not_owner',
    );
    // A reason that is not an Untrusted value from the SDK is not shown at all.
    const raw = { code: 'NOT_OWNER', message: 'm', hint: 'h', details: { reason: 'raw text' } };
    expect(describeError(raw, null).reason).toBeNull();
  });
});

describe('toSignHref', () => {
  it('turns an SDK signing link into the sign page of this site, byte for byte', () => {
    const payload: SignPayload = {
      chainId: 196,
      from: A,
      steps: [{ to: B, data: `0x5c19a95c${'00'.repeat(32)}`, value: 1n }],
    };
    const sdkLink = signLink(payload, 'https://atropyle.example/');
    const href = toSignHref(sdkLink, 'https://atropyle.example');
    expect(href).toMatch(/^https:\/\/atropyle\.example\/sign\/#p=/);
    const hash = new URL(href ?? '').hash;
    expect(toSdkSignLink(hash)).toBe(new URL(sdkLink).hash);
    expect(parseSignLink(toSdkSignLink(hash))).toEqual(payload);
  });

  it('refuses anything that is not a signing link', () => {
    expect(toSignHref('https://atropyle.example/#/v/0xabc/verify', 'https://atropyle.example')).toBeNull();
    expect(toSignHref('https://atropyle.example/', 'https://atropyle.example')).toBeNull();
  });
});
```

Run: `npm test -w apps/web -- tx-impl`
Expected: FAIL, không tìm thấy `../../src/tx/impl` (chưa có `index.ts`) và `../../src/tx/sign-href`.

- [ ] **Step 3: Viết bộ giải mã, `load.ts` và `sign-href.ts`**

`apps/web/src/tx/impl/decode.ts`:

```ts
import { type AtropyleErrorJson, decodeError } from '@atropyle/sdk';

export interface SendFailure {
  error: AtropyleErrorJson;
  /** The step of the sent plan that failed, when the SDK says which. */
  index: number | null;
  /** Steps of that send confirmed on chain before it failed; a retry starts after them. */
  completed: number;
}

function count(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
}

/** `sendPlan` puts `index` and `completed` in the details of every failure; anything else counts as nothing done. */
export function decodeSendFailure(e: unknown): SendFailure {
  const err = decodeError(e);
  return { error: err.toJSON(), index: count(err.details?.index), completed: count(err.details?.completed) ?? 0 };
}
```

`apps/web/src/tx/impl/describe.ts`:

```ts
import { decodeError } from '@atropyle/sdk';
import { type ErrorView, errorView, isErrorJson } from './errors-view';

/** What ErrorBox shows. `reason`: the cleaned revert text of an unknown revert, which the SDK keeps out of `message`. */
export interface ErrorDescription extends ErrorView {
  reason: string | null;
}

function reasonOf(details: Record<string, unknown> | undefined): string | null {
  const r = details?.reason;
  if (typeof r !== 'object' || r === null) return null;
  const u = r as { untrusted?: unknown; value?: unknown };
  return u.untrusted === true && typeof u.value === 'string' && u.value !== '' ? u.value : null;
}

export function describeError(e: unknown, docsPath: string | null): ErrorDescription {
  const json = isErrorJson(e) ? e : decodeError(e).toJSON();
  return { ...errorView(json, docsPath), reason: reasonOf(json.details) };
}
```

`apps/web/src/tx/impl/index.ts`:

```ts
export { decodeSendFailure, type SendFailure } from './decode';
export { describeError, type ErrorDescription } from './describe';
export { type ErrorView, errorView, isErrorJson, localDocs } from './errors-view';
```

`apps/web/src/tx/load.ts`:

```ts
import type * as Impl from './impl';

export type TxImpl = typeof Impl;

let pending: Promise<TxImpl> | null = null;
let loaded: TxImpl | null = null;

/**
 * The error decoder of the SDK, in a chunk of its own (Quyết định 13). A card that can send loads it on mount, so a
 * failure is described at once; a failed request (offline) is forgotten so the next call tries again.
 */
export function loadTxImpl(): Promise<TxImpl> {
  pending ??= import('./impl').then(
    (impl) => {
      loaded = impl;
      return impl;
    },
    (e: unknown) => {
      pending = null;
      throw e;
    },
  );
  return pending;
}

/** The decoder if it has loaded, else null: lets ErrorBox describe an error in the same render. */
export function peekTxImpl(): TxImpl | null {
  return loaded;
}
```

`apps/web/src/tx/sign-href.ts`:

```ts
import { ROUTES } from '@/routes';

const SDK_SIGN = '#/sign?';

/**
 * The SDK writes `<base>#/sign?p=X`, the form the CLI and agents print. This site's own page is `/sign/#p=X`: the
 * part after `?` is kept byte for byte, so `toSdkSignLink` on the sign page gives back exactly what the SDK made.
 */
export function toSignHref(sdkLink: string, origin: string): string | null {
  const at = sdkLink.indexOf(SDK_SIGN);
  return at < 0 ? null : `${origin}${ROUTES.sign}#${sdkLink.slice(at + SDK_SIGN.length)}`;
}
```

Run: `npm test -w apps/web -- tx-impl lazy-boundary`
Expected: PASS (tx-impl 5, lazy-boundary 2).

- [ ] **Step 4: Viết test hỏng cho `ErrorBox`, `TxCard` và `useTxRunner`**

Trong `apps/web/test/helpers/wallet.ts`, thay dòng `import type { Eip1193, WalletWindow } from '@/wallet/types';` bằng:

```ts
import type { WalletClient } from 'viem';
import type { WalletValue } from '@/wallet/provider';
import type { ConnectedWallet, Eip1193, WalletOption, WalletWindow } from '@/wallet/types';
```

rồi thêm vào cuối `apps/web/test/helpers/wallet.ts`:

```ts
/** The account `walletValue` connects by default (anvil account 1). */
export const TEST_ACCOUNT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const;

/** A wallet context for components under test: connected as TEST_ACCOUNT on chain 196 unless `over` says otherwise. */
export function walletValue(over: Partial<WalletValue> = {}): WalletValue {
  const option: WalletOption = {
    id: 'test',
    name: 'Test Wallet',
    icon: null,
    rdns: 'org.example.test',
    provider: fakeWallet().provider,
    source: 'eip6963',
  };
  const wallet: ConnectedWallet = { option, account: TEST_ACCOUNT, chainId: 196 };
  return {
    status: 'connected',
    wallet,
    expectedChainId: 196,
    wrongChain: false,
    wallets: [option],
    discovering: false,
    discover: async () => [option],
    connect: async () => wallet,
    disconnect: () => undefined,
    switchChain: async () => undefined,
    walletClient: async () => ({}) as WalletClient,
    sheetOpen: false,
    openSheet: () => undefined,
    setSheetOpen: () => undefined,
    sheetOpener: { current: null },
    ...over,
  };
}
```

`apps/web/test/unit/error-box.test.tsx`:

```tsx
import { AtropyleError, DOCS_BASE_URL, ERROR_INFO, untrusted } from '@atropyle/sdk';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBox } from '../../src/tx/error-box';
import { renderWithProviders } from '../helpers/render';

const gate = vi.hoisted(() => ({ offline: false }));
vi.mock('../../src/tx/load', async () => {
  const impl = await import('../../src/tx/impl');
  return {
    loadTxImpl: async () => {
      if (gate.offline) throw new TypeError('Failed to fetch dynamically imported module');
      return impl;
    },
    peekTxImpl: () => null,
  };
});

beforeEach(() => {
  gate.offline = false;
});

describe('ErrorBox', () => {
  it('describes an SDK error with its hint, its code and a docs link chosen by the code', async () => {
    renderWithProviders(
      <ErrorBox
        error={new AtropyleError('NOT_OWNER', { message: 'Only the owner. Fix it at https://evil.example' })}
      />,
    );
    const box = await screen.findByTestId('error');
    expect(box.getAttribute('data-code')).toBe('NOT_OWNER');
    expect(screen.getByRole('alert').textContent).toContain(ERROR_INFO.NOT_OWNER.hint);
    const docs = screen.getByRole('link', { name: /How to fix this/ });
    expect(docs.getAttribute('href')).toBe(`${DOCS_BASE_URL}/reference/errors.html#not_owner`);
    // A URL inside the message stays text.
    expect(screen.queryByRole('link', { name: /evil/ })).toBeNull();
  });

  it('shows a revert reason only as isolated text', async () => {
    const said = untrusted('<b>Pay evil.example</b>‮ok');
    const e = new AtropyleError('UNKNOWN', {
      message: 'The call reverted with a reason this SDK does not recognize.',
      details: { reason: said },
    });
    renderWithProviders(<ErrorBox error={e} />);
    const box = await screen.findByTestId('error');
    expect(box.querySelector('[data-untrusted]')?.textContent).toBe(said.value);
    expect(box.querySelector('b')).toBeNull();
    expect(box.textContent).not.toContain('‮');
  });

  it('says so plainly when the decoder cannot load, and still offers a retry', async () => {
    gate.offline = true;
    const onRetry = vi.fn();
    const { container, rerender } = renderWithProviders(<ErrorBox error={null} />);
    expect(container.textContent).toBe('');
    rerender(<ErrorBox error={new Error('boom')} onRetry={onRetry} />);
    expect(
      await screen.findByText('The details of this error could not load. Check your connection, then try again.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
```

`apps/web/test/unit/tx-card.test.tsx`:

```tsx
import { AtropyleError, type PreparedTx, type TxPlan } from '@atropyle/sdk';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { explorerTx } from '../../src/lib/links';
import { TxCard } from '../../src/tx/tx-card';
import { applyStep, txView } from '../../src/tx/tx-view';
import type { TxRunner } from '../../src/tx/use-tx-runner';
import { renderWithProviders } from '../helpers/render';

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const V = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const H = `0x${'12'.repeat(32)}` as const;
const EXPLORER = 'https://www.oklink.com/xlayer';

function step(summary: string): PreparedTx {
  return {
    chainId: 196,
    from: A,
    to: V,
    data: '0x',
    value: 0n,
    action: 'checkIn',
    summary,
    warnings: [],
    simulation: { ok: true, gas: 50_000n },
  };
}

const PLAN: TxPlan = {
  chainId: 196,
  from: A,
  vault: V,
  steps: [step('one'), step('two'), step('three')],
  summary: 'Plan',
  warnings: [],
};

function runnerOf(plan: TxPlan, over: Partial<TxRunner> = {}): TxRunner {
  return {
    plan,
    view: txView(plan),
    busy: false,
    error: null,
    result: null,
    offset: 0,
    confirmed: 0,
    committed: false,
    blocker: null,
    switchFirst: false,
    handoffLink: null,
    explorer: null,
    send: () => undefined,
    connect: () => undefined,
    reload: () => undefined,
    ...over,
  };
}

const sendButton = () => screen.getByTestId('tx-send') as HTMLButtonElement;

describe('TxCard', () => {
  it('asks for a wallet first, and opens the wallet sheet', () => {
    const connect = vi.fn();
    renderWithProviders(<TxCard runner={runnerOf(PLAN, { blocker: 'connect', connect })} label="Send" />);
    expect(screen.queryByTestId('tx-send')).toBeNull();
    expect(screen.getByText('Connect a wallet to sign.')).toBeTruthy();
    fireEvent.click(screen.getByTestId('tx-connect'));
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('names the account that must sign when another one is connected', () => {
    renderWithProviders(<TxCard runner={runnerOf(PLAN, { blocker: 'wrongAccount' })} label="Send" />);
    const banner = screen.getByTestId('tx-wrong-account');
    expect(banner.querySelector(`[data-address="${A}"]`)).not.toBeNull();
    expect(screen.queryByTestId('tx-send')).toBeNull();
  });

  it('a step that would fail blocks the plan and says why', async () => {
    const blocked: TxPlan = {
      ...PLAN,
      steps: [
        step('one'),
        { ...step('two'), simulation: { ok: false, error: new AtropyleError('NOT_OWNER').toJSON() } },
      ],
    };
    renderWithProviders(<TxCard runner={runnerOf(blocked, { blocker: 'blocked' })} label="Send" />);
    expect(screen.getByTestId('tx-step-1').getAttribute('data-phase')).toBe('blocked');
    expect(sendButton().disabled).toBe(true);
    await waitFor(() => expect(screen.getByTestId('error').getAttribute('data-code')).toBe('NOT_OWNER'));
  });

  it('hold to confirm: Enter sends at once, a plain mouse click does not', () => {
    const send = vi.fn();
    const single: TxPlan = { ...PLAN, steps: [step('check in')] };
    renderWithProviders(<TxCard runner={runnerOf(single, { send })} label="Check in" confirm="hold" />);
    fireEvent.click(sendButton(), { detail: 1 });
    expect(send).not.toHaveBeenCalled();
    fireEvent.keyDown(sendButton(), { key: 'Enter' });
    expect(send).toHaveBeenCalledTimes(1);
    // One step needs no progress bar.
    expect(screen.queryByTestId('tx-progress')).toBeNull();
  });

  it('shows each step in plain words, its status, its transaction and its technical details', () => {
    const view = applyStep(applyStep(txView(PLAN), { index: 0, phase: 'confirmed', hash: H }), {
      index: 1,
      phase: 'signing',
    });
    renderWithProviders(
      <TxCard
        runner={runnerOf(PLAN, { view, busy: true, confirmed: 1, committed: true, explorer: EXPLORER })}
        label="Send"
      />,
    );
    const first = within(screen.getByTestId('tx-step-0'));
    expect(first.getByText('one')).toBeTruthy();
    expect(first.getByText('Confirmed')).toBeTruthy();
    expect(first.getByRole('link', { name: /View transaction/ }).getAttribute('href')).toBe(explorerTx(EXPLORER, H));
    expect(within(screen.getByTestId('tx-step-1')).getByText('Confirm in your wallet')).toBeTruthy();
    expect(screen.getAllByText('Technical details')).toHaveLength(3);
    expect(screen.getByTestId('tx-progress').getAttribute('value')).toBe('1');
    expect(screen.getByText('Step 2 of 3: Confirm in your wallet')).toBeTruthy();
    expect(sendButton().disabled).toBe(true);
    expect(sendButton().textContent).toBe('Sending…');
  });

  it('shows warnings from the chain as text only', () => {
    const warned: TxPlan = {
      ...PLAN,
      warnings: [{ code: 'TOKEN_NOT_HELD', message: '<img src=x onerror=alert(1)> Claim at evil.example‮' }],
    };
    renderWithProviders(<TxCard runner={runnerOf(warned)} label="Send" />);
    const banner = screen.getByTestId('warning-TOKEN_NOT_HELD');
    expect(banner.querySelector('[data-untrusted]')?.textContent).toBe(
      '<img src=x onerror=alert(1)> Claim at evil.example',
    );
    expect(banner.querySelector('img')).toBeNull();
    expect(within(banner).queryByRole('link')).toBeNull();
  });
});
```

`apps/web/test/unit/tx-runner.test.tsx` (7 hành vi của `TxRunner` cũ, cộng gửi một lần, đổi chain, plan mới):

```tsx
import { AtropyleError, type PreparedTx, type TxPlan } from '@atropyle/sdk';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { WalletClient } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TxCard } from '../../src/tx/tx-card';
import { type TxRunner, useTxRunner } from '../../src/tx/use-tx-runner';
import { WalletContext, type WalletValue } from '../../src/wallet/provider';
import { renderWithProviders } from '../helpers/render';
import { walletValue } from '../helpers/wallet';

const fake = vi.hoisted(() => ({ send: vi.fn(), link: vi.fn() }));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: () => ({
      deployment: { explorerUrl: null },
      atro: { chain: { id: 196 }, send: fake.send, handoff: { link: fake.link } },
      rpc: { read: [], verify: [] },
    }),
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});

const A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const V = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const;
const H = `0x${'12'.repeat(32)}` as const;

function step(summary: string): PreparedTx {
  return {
    chainId: 196,
    from: A,
    to: V,
    data: '0x',
    value: 0n,
    action: 'checkIn',
    summary,
    warnings: [],
    simulation: { ok: true, gas: 50_000n },
  };
}

const plan: TxPlan = {
  chainId: 196,
  from: A,
  vault: V,
  steps: [step('one'), step('two'), step('three')],
  summary: 'Plan',
  warnings: [],
};

type OnStep = (e: unknown) => void;
type Options = { onStep?: OnStep };
interface Seen {
  confirmed: number;
  committed: boolean;
}

function Harness({ plan, onRunner }: { plan: TxPlan; onRunner(r: TxRunner): void }) {
  const runner = useTxRunner({ plan });
  onRunner(runner);
  return <TxCard runner={runner} label="Send" />;
}

function setup(o: { wallet?: Partial<WalletValue> } = {}) {
  const reported: Seen[] = [];
  let latest: TxRunner | null = null;
  const value = walletValue(o.wallet);
  const onRunner = (r: TxRunner) => {
    latest = r;
    const last = reported.at(-1);
    if (!last || last.confirmed !== r.confirmed || last.committed !== r.committed) {
      reported.push({ confirmed: r.confirmed, committed: r.committed });
    }
  };
  const ui = (p: TxPlan) => (
    <WalletContext value={value}>
      <Harness plan={p} onRunner={onRunner} />
    </WalletContext>
  );
  const utils = renderWithProviders(ui(plan));
  const runner = (): TxRunner => {
    if (!latest) throw new Error('not rendered');
    return latest;
  };
  return { ...utils, reported, runner, show: (p: TxPlan) => utils.rerender(ui(p)) };
}

const sendButton = () => screen.getByTestId('tx-send') as HTMLButtonElement;
const phase = (i: number) => screen.getByTestId(`tx-step-${i}`).getAttribute('data-phase');

/** The SDK chunk loads after the first render; until then the button waits. */
async function ready() {
  await waitFor(() => expect(sendButton().disabled).toBe(false));
}

function leaving(): boolean {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
}

/** First call: step 0 confirmed, then the wallet declines step 1. Later calls: every step confirmed. */
function failOnceAtStep1() {
  let attempt = 0;
  return async (p: TxPlan, _w: unknown, o: Options) => {
    attempt++;
    const total = p.steps.length;
    if (attempt === 1) {
      o.onStep?.({ index: 0, total, step: p.steps[0], phase: 'confirmed', hash: H });
      throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
    }
    for (const [index, s] of p.steps.entries()) o.onStep?.({ index, total, step: s, phase: 'confirmed', hash: H });
    return { vault: V, steps: [] };
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  fake.link.mockImplementation(
    (p: TxPlan, base: string) => `${base}#/sign?steps=${p.steps.map((s) => s.summary).join(',')}`,
  );
});

describe('useTxRunner with TxCard', () => {
  it('resumes after a partial failure without signing confirmed steps again', async () => {
    const seen: string[][] = [];
    let attempt = 0;
    fake.send.mockImplementation(async (p: TxPlan, _w: unknown, o: Options) => {
      seen.push(p.steps.map((s) => s.summary));
      attempt++;
      const total = p.steps.length;
      if (attempt === 1) {
        o.onStep?.({ index: 0, total, step: p.steps[0], phase: 'signing' });
        o.onStep?.({ index: 0, total, step: p.steps[0], phase: 'confirmed', hash: H });
        o.onStep?.({ index: 1, total, step: p.steps[1], phase: 'signing' });
        throw new AtropyleError('USER_REJECTED', { details: { index: 1, completed: 1 } });
      }
      for (const index of [0, 1]) o.onStep?.({ index, total, step: p.steps[index], phase: 'confirmed', hash: H });
      return { vault: V, steps: [] };
    });
    setup();
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(phase(1)).toBe('failed'));
    expect(phase(0)).toBe('confirmed');
    expect(sendButton().textContent).toBe('Resume from step 2');
    await waitFor(() => expect(screen.getByTestId('error').getAttribute('data-code')).toBe('USER_REJECTED'));

    fireEvent.click(sendButton());
    await screen.findByTestId('tx-done');
    expect(seen).toEqual([
      ['one', 'two', 'three'],
      ['two', 'three'],
    ]);
    expect([phase(0), phase(1), phase(2)]).toEqual(['confirmed', 'confirmed', 'confirmed']);
    expect(screen.queryByTestId('error')).toBeNull();
  });

  it('asks before the page unloads only while a sent plan is unfinished', async () => {
    fake.send.mockImplementation(failOnceAtStep1());
    const { unmount } = setup();
    await ready();
    expect(leaving()).toBe(false);
    fireEvent.click(sendButton());
    await waitFor(() => expect(sendButton().textContent).toBe('Resume from step 2'));
    await waitFor(() => expect(leaving()).toBe(true));
    fireEvent.click(sendButton());
    await screen.findByTestId('tx-done');
    await waitFor(() => expect(leaving()).toBe(false));
    unmount();
    expect(leaving()).toBe(false);
  });

  it('drops its unload guard when it unmounts mid-plan', async () => {
    fake.send.mockImplementation(failOnceAtStep1());
    const { unmount } = setup();
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(sendButton().textContent).toBe('Resume from step 2'));
    unmount();
    expect(leaving()).toBe(false);
  });

  it('hands off only the steps that are not confirmed yet, on the sign page, and nothing once all are', async () => {
    const writeText = vi.fn(async (_t: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    fake.send.mockImplementation(failOnceAtStep1());
    setup();
    await ready();
    const copy = () => {
      const button = screen.getByTestId('tx-copy-link').querySelector('button');
      if (!button) throw new Error('no copy button');
      fireEvent.click(button);
    };
    copy();
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(`${location.origin}/sign/#steps=one,two,three`));
    expect(fake.link).toHaveBeenLastCalledWith(expect.objectContaining({ from: A }), `${location.origin}/`);

    fireEvent.click(sendButton());
    await waitFor(() => expect(sendButton().textContent).toBe('Resume from step 2'));
    // A hand-off of the whole plan would make the next signer send step 1 again.
    const last = fake.link.mock.calls.at(-1)?.[0] as TxPlan;
    expect(last.steps.map((s) => s.summary)).toEqual(['two', 'three']);
    expect(last).toMatchObject({ chainId: plan.chainId, from: plan.from, vault: plan.vault });
    copy();
    await waitFor(() => expect(writeText).toHaveBeenLastCalledWith(`${location.origin}/sign/#steps=two,three`));

    fireEvent.click(sendButton());
    await screen.findByTestId('tx-done');
    expect(screen.queryByTestId('tx-copy-link')).toBeNull();
  });

  it('counts the confirmed steps', async () => {
    fake.send.mockImplementation(failOnceAtStep1());
    const { reported } = setup();
    await ready();
    const bar = () => screen.getByTestId('tx-progress');
    expect([bar().getAttribute('value'), bar().getAttribute('max')]).toEqual(['0', '3']);
    fireEvent.click(sendButton());
    await waitFor(() => expect(phase(1)).toBe('failed'));
    expect(bar().getAttribute('value')).toBe('1');
    expect(reported.at(-1)).toEqual({ confirmed: 1, committed: true });
    fireEvent.click(sendButton());
    await screen.findByTestId('tx-done');
    expect(bar().getAttribute('value')).toBe('3');
    expect(reported.at(-1)).toEqual({ confirmed: 3, committed: true });
    expect(reported.map((r) => r.confirmed)).toEqual(expect.arrayContaining([0, 1, 3]));
  });

  it('is committed while a send is in flight and free again after a rejection with no hash', async () => {
    let reject: (e: unknown) => void = () => undefined;
    fake.send.mockImplementation(
      (_p: TxPlan, _w: unknown, o: Options) =>
        new Promise((_, no) => {
          o.onStep?.({ index: 0, total: 3, step: plan.steps[0], phase: 'signing' });
          reject = no;
        }),
    );
    const { reported } = setup();
    expect(reported.at(-1)).toEqual({ confirmed: 0, committed: false });
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(reported.at(-1)?.committed).toBe(true));
    await waitFor(() => expect(phase(0)).toBe('signing'));
    reject(new AtropyleError('USER_REJECTED', { details: { index: 0, completed: 0 } }));
    await waitFor(() => expect(reported.at(-1)).toEqual({ confirmed: 0, committed: false }));
  });

  it('stays committed after a failure that follows a pending step with a hash', async () => {
    fake.send.mockImplementation(async (_p: TxPlan, _w: unknown, o: Options) => {
      o.onStep?.({ index: 0, total: 3, step: plan.steps[0], phase: 'signing' });
      o.onStep?.({ index: 0, total: 3, step: plan.steps[0], phase: 'pending', hash: H });
      throw new AtropyleError('UNKNOWN', { details: { index: 0, completed: 0 } });
    });
    const { reported } = setup();
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(phase(0)).toBe('failed'));
    expect(reported.at(-1)).toEqual({ confirmed: 0, committed: true });
  });

  it('sends once, however often send is called while it runs', async () => {
    fake.send.mockImplementation(() => new Promise(() => undefined));
    const { runner } = setup();
    await ready();
    act(() => {
      runner().send();
      runner().send();
    });
    await waitFor(() => expect(fake.send).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(fake.send).toHaveBeenCalledTimes(1);
  });

  it('moves the wallet to the right chain before it asks for a signature', async () => {
    const order: string[] = [];
    fake.send.mockImplementation(async () => {
      order.push('send');
      return { vault: V, steps: [] };
    });
    setup({
      wallet: {
        wrongChain: true,
        switchChain: async () => {
          order.push('switch');
        },
        walletClient: async () => {
          order.push('client');
          return {} as WalletClient;
        },
      },
    });
    expect(screen.getByText('Your wallet will first ask to switch to X Layer.')).toBeTruthy();
    await ready();
    fireEvent.click(sendButton());
    await screen.findByTestId('tx-done');
    expect(order).toEqual(['switch', 'client', 'send']);
  });

  it('a new plan starts clean', async () => {
    fake.send.mockRejectedValue(new AtropyleError('USER_REJECTED', { details: { index: 0, completed: 0 } }));
    const { show } = setup();
    await ready();
    fireEvent.click(sendButton());
    await waitFor(() => expect(phase(0)).toBe('failed'));
    await screen.findByTestId('error');
    show({ ...plan, steps: [step('only')] });
    expect(phase(0)).toBe('ready');
    expect(screen.queryByTestId('tx-step-1')).toBeNull();
    expect(screen.queryByTestId('tx-progress')).toBeNull();
    expect(screen.queryByTestId('error')).toBeNull();
    expect(sendButton().textContent).toBe('Send');
  });
});
```

Run: `npm test -w apps/web -- error-box tx-card tx-runner`
Expected: FAIL, không tìm thấy `../../src/tx/error-box`, `../../src/tx/tx-card`, `../../src/tx/use-tx-runner`.

- [ ] **Step 5: Viết message, `useErrorView`, `ErrorBox`, `TxProgress`, `useTxRunner` và `TxCard`**

Thay `apps/web/src/messages/tx.messages.ts` (giữ mọi khoá cũ, thêm khoá mới):

```ts
import { defineMessages } from '@/i18n/core';

export const messages = defineMessages(
  {
    title: 'Review and sign',
    stepsOne: 'One transaction',
    stepsMany: '{n} transactions, in order',
    signer: 'Signed by',
    what: 'What this does',
    check: 'Simulation',
    status: 'Status',
    simOk: 'Passes',
    simFailed: 'Would fail',
    simSkipped: 'Checked after the previous step',
    phaseReady: 'Ready',
    phaseBlocked: 'Blocked',
    phaseSigning: 'Confirm in your wallet',
    phasePending: 'Waiting for the block',
    phaseConfirmed: 'Confirmed',
    phaseFailed: 'Failed',
    live: 'Step {n} of {total}: {status}',
    viewTx: 'View transaction',
    details: 'Technical details',
    contract: 'Contract',
    fn: 'Function',
    gas: 'Gas estimate',
    noGas: 'Estimated by your wallet',
    progressLabel: 'Signing progress',
    progress: '{done} of {total} confirmed',
    preparing: 'Preparing…',
    sending: 'Sending…',
    resume: 'Resume from step {n}',
    switchFirst: 'Your wallet will first ask to switch to {network}.',
    done: 'All steps are confirmed on chain.',
    connectFirst: 'Connect a wallet to sign.',
    wrongAccountTitle: 'Another account must sign',
    wrongAccount: 'This must be signed by the wallet below. Switch the account in your wallet.',
    handoffTitle: 'Sign on another device',
    handoffBody:
      'Copy this link and open it where your wallet is. That page checks every step again before it lets you sign.',
    copyLink: 'Copy link to sign on another device',
    reason: 'The contract said',
    readDocs: 'How to fix this',
    errorCode: 'Error code',
    errorUnavailable: 'The details of this error could not load. Check your connection, then try again.',
  },
  {
    title: 'Xem lại và ký',
    stepsOne: 'Một giao dịch',
    stepsMany: '{n} giao dịch, lần lượt',
    signer: 'Người ký',
    what: 'Việc sẽ làm',
    check: 'Mô phỏng',
    status: 'Trạng thái',
    simOk: 'Qua',
    simFailed: 'Sẽ lỗi',
    simSkipped: 'Kiểm sau bước trước',
    phaseReady: 'Sẵn sàng',
    phaseBlocked: 'Bị chặn',
    phaseSigning: 'Xác nhận trong ví',
    phasePending: 'Đang chờ block',
    phaseConfirmed: 'Đã xác nhận',
    phaseFailed: 'Thất bại',
    live: 'Bước {n}/{total}: {status}',
    viewTx: 'Xem giao dịch',
    details: 'Chi tiết kỹ thuật',
    contract: 'Contract',
    fn: 'Hàm',
    gas: 'Gas ước tính',
    noGas: 'Ví của bạn sẽ ước tính',
    progressLabel: 'Tiến độ ký',
    progress: 'Đã xác nhận {done}/{total}',
    preparing: 'Đang chuẩn bị…',
    sending: 'Đang gửi…',
    resume: 'Tiếp tục từ bước {n}',
    switchFirst: 'Ví sẽ hỏi chuyển sang {network} trước.',
    done: 'Mọi bước đã được xác nhận trên chain.',
    connectFirst: 'Kết nối ví để ký.',
    wrongAccountTitle: 'Cần tài khoản khác ký',
    wrongAccount: 'Bước này phải do ví dưới đây ký. Hãy đổi tài khoản trong ví.',
    handoffTitle: 'Ký trên thiết bị khác',
    handoffBody: 'Sao chép link này và mở ở nơi có ví của bạn. Trang đó kiểm lại từng bước trước khi cho bạn ký.',
    copyLink: 'Sao chép link để ký trên thiết bị khác',
    reason: 'Contract trả lời',
    readDocs: 'Cách khắc phục',
    errorCode: 'Mã lỗi',
    errorUnavailable: 'Không tải được chi tiết lỗi. Kiểm tra kết nối rồi thử lại.',
  },
);
```

`apps/web/src/tx/use-error-view.ts`:

```ts
'use client';

import { useEffect, useMemo, useState } from 'react';
import { ENV } from '@/config/env';
import type { ErrorDescription } from './impl/describe';
import { loadTxImpl, peekTxImpl, type TxImpl } from './load';

export type { ErrorDescription } from './impl/describe';

export interface ErrorViewState {
  /** null when there is no error, while the decoder loads, or when it cannot load. */
  view: ErrorDescription | null;
  /** The decoder could not load (offline): show a plain sentence instead. */
  unavailable: boolean;
}

/**
 * Describes any thrown value the way the SDK does: message, hint, and a docs link built from the code. The decoder
 * lives next to the SDK; a page that shows an error has almost always loaded it, so this is synchronous in practice.
 */
export function useErrorView(error: unknown): ErrorViewState {
  const [fetched, setFetched] = useState<TxImpl | null>(null);
  const [failed, setFailed] = useState<{ error: unknown } | null>(null);
  const impl = fetched ?? peekTxImpl();

  useEffect(() => {
    if (error === null || error === undefined || impl) return;
    let live = true;
    loadTxImpl().then(
      (m) => {
        if (live) setFetched(m);
      },
      () => {
        if (live) setFailed({ error });
      },
    );
    return () => {
      live = false;
    };
  }, [error, impl]);

  const view = useMemo(
    () => (impl && error !== null && error !== undefined ? impl.describeError(error, ENV.docsPath) : null),
    [impl, error],
  );
  return { view, unavailable: !impl && failed !== null && failed.error === error };
}
```

`apps/web/src/tx/error-box.tsx`:

```tsx
'use client';

import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages as common } from '@/messages/common.messages';
import { messages } from '@/messages/tx.messages';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { ExternalLink } from '@/ui/external-link';
import { SkeletonText } from '@/ui/skeleton';
import { UntrustedText } from '@/ui/untrusted-text';
import { useErrorView } from './use-error-view';

const LOCAL_LINK =
  'underline decoration-line-strong decoration-1 underline-offset-4 transition-colors duration-150 ' +
  'hover:decoration-thread';

/** Docs that ship with this site (`/docs/…`) open in place; the SDK's docs site opens in a new tab. */
function DocsLink({ href, children }: { href: string; children: ReactNode }) {
  if (href.startsWith('/')) {
    return (
      <a href={href} className={LOCAL_LINK}>
        {children}
      </a>
    );
  }
  return <ExternalLink href={href}>{children}</ExternalLink>;
}

/**
 * Any error, described by the SDK: the message as the title, the hint, the code and a docs link chosen by the code
 * (never a URL from the message). The revert reason of an unknown revert is shown apart, as untrusted text.
 */
export function ErrorBox({
  error,
  onRetry,
  testId = 'error',
  className,
}: {
  error: unknown;
  onRetry?(): void;
  testId?: string;
  className?: string;
}) {
  const c = useT(common);
  const t = useT(messages);
  const { view, unavailable } = useErrorView(error);
  if (error === null || error === undefined) return null;

  const retry = onRetry ? (
    <Button variant="secondary" size="sm" onClick={onRetry} icon={<RotateCcw aria-hidden="true" strokeWidth={1.5} />}>
      {c('retry')}
    </Button>
  ) : null;

  if (view) {
    return (
      <div data-testid={testId} data-code={view.code} className={className}>
        <Banner tone="error" title={view.message} className="break-words">
          <p>{view.hint}</p>
          {view.reason ? (
            <p className="mt-2 flex flex-col items-start gap-1">
              <span>{t('reason')}</span>
              <UntrustedText
                value={view.reason}
                max={160}
                className="rounded-lg bg-surface-2 px-2 py-1 font-mono text-caption text-ink"
              />
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex text-caption">
              <span className="sr-only">{t('errorCode')}</span>
              <code className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-ink">{view.code}</code>
            </span>
            <DocsLink href={view.docsUrl}>{t('readDocs')}</DocsLink>
            {retry}
          </div>
        </Banner>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div data-testid={testId} className={className}>
        <Banner tone="error" title={c('error')} action={retry}>
          {t('errorUnavailable')}
        </Banner>
      </div>
    );
  }

  // The decoder is a cached chunk away: hold the place without announcing anything yet.
  return (
    <div aria-hidden="true" className={cn('rounded-2xl border border-danger/45 bg-danger/8 p-4', className)}>
      <SkeletonText lines={2} />
    </div>
  );
}
```

`apps/web/src/tx/tx-progress.tsx`:

```tsx
'use client';

import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { messages } from '@/messages/tx.messages';
import type { StepPhase, StepRow } from './tx-view';

const SEGMENT: Record<StepPhase, string> = {
  ready: 'bg-line',
  skipped: 'bg-line',
  blocked: 'bg-danger/45',
  signing: 'bg-thread/30',
  pending: 'bg-thread/30',
  confirmed: 'bg-thread',
  failed: 'bg-danger',
};

/**
 * One segment per step, filled as the chain confirms them. The step in the wallet shimmers while motion is allowed;
 * under reduced motion it is a still, lighter segment. A native <progress> carries the value for assistive tech.
 */
export function TxProgress({
  rows,
  testId,
  className,
}: {
  rows: readonly StepRow[];
  testId?: string;
  className?: string;
}) {
  const t = useT(messages);
  const total = rows.length;
  const done = rows.filter((r) => r.phase === 'confirmed').length;
  const text = t('progress', { done, total });
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <progress
        data-testid={testId}
        value={done}
        max={total}
        aria-label={t('progressLabel')}
        aria-valuetext={text}
        className="sr-only"
      />
      <ol aria-hidden="true" className="flex items-center gap-1">
        {rows.map((r) => (
          <li
            key={r.index}
            data-phase={r.phase}
            className={cn(
              'relative h-1.5 flex-1 overflow-hidden rounded-full transition-colors duration-500',
              SEGMENT[r.phase],
            )}
          >
            {r.phase === 'signing' || r.phase === 'pending' ? (
              <span className="absolute inset-0 bg-linear-to-r from-thread/0 via-thread to-thread/0 motion-safe:animate-shimmer motion-reduce:hidden" />
            ) : null}
          </li>
        ))}
      </ol>
      <p aria-hidden="true" className="text-caption text-ink-muted tabular-nums">
        {text}
      </p>
    </div>
  );
}
```

`apps/web/src/tx/use-tx-runner.ts`:

```ts
'use client';

import type { SendResult, TxPlan } from '@atropyle/sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSdk } from '@/chain/hooks';
import { sameAddress } from '@/lib/address';
import { useHaptics } from '@/motion/haptics';
import { useWallet } from '@/wallet/provider';
import { loadTxImpl, type TxImpl } from './load';
import { toSignHref } from './sign-href';
import { applyStep, failStep, type TxView, txView } from './tx-view';
import { useLeaveGuard } from './use-leave-guard';

/** Why `send()` would do nothing now, in the order the card asks the user to fix them. */
export type TxBlocker = 'blocked' | 'connect' | 'wrongAccount' | 'loading';

export interface TxRunner {
  plan: TxPlan;
  view: TxView;
  busy: boolean;
  /** The failure of the last send (decoded by the SDK), or the SDK chunk failing to load. */
  error: unknown;
  result: SendResult | null;
  /** Steps confirmed by earlier, partly failed sends; the next send starts after them. */
  offset: number;
  confirmed: number;
  /**
   * A send is in flight, or the wallet accepted something for this plan (a hash, a pending or confirmed step). The
   * page must not swap the plan, and closing the tab asks first.
   */
  committed: boolean;
  blocker: TxBlocker | null;
  /** The wallet is on another chain: send() asks it to switch first. */
  switchFirst: boolean;
  /** `/sign/#p=…` for the steps still to send; null while sending, when done, or above the SDK's payload limits. */
  handoffLink: string | null;
  explorer: string | null;
  send(): void;
  /** Opens the wallet sheet. */
  connect(): void;
  /** Loads the SDK chunk again after it failed. */
  reload(): void;
}

export interface TxRunnerOptions {
  plan: TxPlan;
  /** After every step is confirmed, for example to refresh the vault (`useInvalidateVault`). */
  onDone?(result: SendResult): void;
}

/** The steps not confirmed yet: what a retry sends, and what a hand-off link may carry. */
function remaining(plan: TxPlan, offset: number): TxPlan {
  return offset === 0 ? plan : { ...plan, steps: plan.steps.slice(offset) };
}

/** Sends a prepared plan step by step through the connected wallet (Quyết định 29). Nothing is ever retried alone. */
export function useTxRunner({ plan, onDone }: TxRunnerOptions): TxRunner {
  const sdkResult = useSdk();
  const sdk = sdkResult.data;
  const wallet = useWallet();
  const { pulse } = useHaptics();
  const [shown, setShown] = useState(plan);
  const [view, setView] = useState(() => txView(plan));
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<unknown>(null);
  const [result, setResult] = useState<SendResult | null>(null);
  // Steps already confirmed on chain by an earlier, partly failed send; a retry never signs them again.
  const [offset, setOffset] = useState(0);
  const inFlight = useRef(false);
  const live = useRef(plan);

  // A different plan starts clean, in the same render (no frame shows the old rows under the new plan).
  if (shown !== plan) {
    setShown(plan);
    setView(txView(plan));
    setSendError(null);
    setResult(null);
    setOffset(0);
  }

  useEffect(() => {
    live.current = plan;
  }, [plan]);

  // The send-failure decoder loads with the card, so a failure is described without a wait.
  useEffect(() => {
    loadTxImpl().catch(() => undefined);
  }, []);

  const confirmed = view.rows.filter((r) => r.phase === 'confirmed').length;
  // A failed row keeps the hash it got, so a failure after `pending` stays accepted; a rejection before any hash does not.
  const accepted = view.rows.some((r) => r.hash !== null || r.phase === 'pending' || r.phase === 'confirmed');
  const committed = busy || accepted;
  useLeaveGuard(committed && result === null);

  const account = wallet.wallet?.account ?? null;
  const blocker: TxBlocker | null = !view.canSend
    ? 'blocked'
    : account === null
      ? 'connect'
      : !sameAddress(account, plan.from)
        ? 'wrongAccount'
        : sdk
          ? null
          : 'loading';

  const handoffLink = useMemo(() => {
    if (!sdk || busy || result || offset >= plan.steps.length || typeof window === 'undefined') return null;
    try {
      const origin = window.location.origin;
      return toSignHref(sdk.atro.handoff.link(remaining(plan, offset), `${origin}/`), origin);
    } catch {
      return null; // above PAYLOAD_LIMITS: no hand-off for this plan
    }
  }, [sdk, busy, result, plan, offset]);

  const send = () => {
    if (inFlight.current || blocker !== null || !sdk) return;
    inFlight.current = true;
    const sent = plan;
    const base = offset;
    setBusy(true);
    setSendError(null);
    void (async () => {
      let tx: TxImpl | null = null;
      try {
        tx = await loadTxImpl();
        if (wallet.wrongChain) await wallet.switchChain();
        const client = await wallet.walletClient();
        const r = await sdk.atro.send(remaining(sent, base), client, {
          onStep: (e) => {
            if (live.current === sent) setView((v) => applyStep(v, { ...e, index: e.index + base }));
          },
        });
        if (live.current !== sent) return;
        setResult(r);
        pulse();
        onDone?.(r);
      } catch (e) {
        if (live.current !== sent) return;
        if (!tx) {
          setSendError(e);
          return;
        }
        const f = tx.decodeSendFailure(e);
        const at = f.index;
        if (at !== null) setView((v) => failStep(v, at + base, f.error));
        if (f.completed > 0) setOffset(Math.min(base + f.completed, sent.steps.length));
        setSendError(f.error);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    })();
  };

  return {
    plan,
    view,
    busy,
    error: sendError ?? (sdkResult.isError ? sdkResult.error : null),
    result,
    offset,
    confirmed,
    committed,
    blocker,
    switchFirst: account !== null && wallet.wrongChain,
    handoffLink,
    explorer: sdk?.deployment.explorerUrl ?? null,
    send,
    connect: wallet.openSheet,
    reload: () => {
      void sdkResult.refetch();
    },
  };
}
```

`apps/web/src/tx/tx-card.tsx`:

```tsx
'use client';

import { Ban, Check, ChevronDown, Signature, Smartphone, Wallet, X } from 'lucide-react';
import { m } from 'motion/react';
import { type ReactNode, useId } from 'react';
import { CHAIN_ID } from '@/chain/hooks';
import { useT } from '@/i18n/provider';
import { cn } from '@/lib/cn';
import { formatAmount } from '@/lib/format';
import { explorerTx } from '@/lib/links';
import { messages } from '@/messages/tx.messages';
import { messages as walletMessages } from '@/messages/wallet.messages';
import { SPRING } from '@/motion/tokens';
import { Address } from '@/ui/address';
import { Banner } from '@/ui/banner';
import { Button } from '@/ui/button';
import { CopyButton } from '@/ui/copy-button';
import { ExternalLink } from '@/ui/external-link';
import { HoldButton } from '@/ui/hold-button';
import { Spinner } from '@/ui/spinner';
import { UntrustedText } from '@/ui/untrusted-text';
import { networkName } from '@/wallet/network';
import { ErrorBox } from './error-box';
import { TxProgress } from './tx-progress';
import { type StepPhase, type StepRow, warningKey } from './tx-view';
import type { TxRunner } from './use-tx-runner';

const PHASE = {
  ready: { key: 'phaseReady', tone: 'text-ink-muted' },
  skipped: { key: 'phaseReady', tone: 'text-ink-muted' },
  blocked: { key: 'phaseBlocked', tone: 'text-danger' },
  signing: { key: 'phaseSigning', tone: 'text-thread' },
  pending: { key: 'phasePending', tone: 'text-thread' },
  confirmed: { key: 'phaseConfirmed', tone: 'text-alive' },
  failed: { key: 'phaseFailed', tone: 'text-danger' },
} as const satisfies Record<StepPhase, { key: string; tone: string }>;

const MARKER: Record<StepPhase, string> = {
  ready: 'border-line-strong bg-surface-1 text-ink-muted',
  skipped: 'border-line-strong bg-surface-1 text-ink-muted',
  blocked: 'border-danger/45 bg-danger/8 text-danger',
  signing: 'border-thread bg-surface-1 text-thread',
  pending: 'border-thread bg-surface-1 text-thread',
  confirmed: 'border-thread bg-thread text-on-thread',
  failed: 'border-danger bg-danger text-on-danger',
};

const inWallet = (p: StepPhase) => p === 'signing' || p === 'pending';

/** A knot on the thread: the step number, a turning arc while the wallet or the chain works, then a check or a cross. */
function StepMarker({ row }: { row: StepRow }) {
  const icon =
    row.phase === 'confirmed' ? (
      <Check size={16} strokeWidth={2} />
    ) : row.phase === 'failed' ? (
      <X size={16} strokeWidth={2} />
    ) : row.phase === 'blocked' ? (
      <Ban size={16} strokeWidth={1.5} />
    ) : (
      row.index + 1
    );
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative z-10 grid size-8 shrink-0 place-items-center rounded-full border font-mono text-small tabular-nums',
        'transition-colors duration-300',
        MARKER[row.phase],
      )}
    >
      {inWallet(row.phase) ? (
        <Spinner size={16} />
      ) : (
        <m.span
          key={row.phase}
          className="inline-flex"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={SPRING}
        >
          {icon}
        </m.span>
      )}
    </span>
  );
}

function StepItem({
  row,
  last,
  explorer,
  testId,
}: {
  row: StepRow;
  last: boolean;
  explorer: string | null;
  testId: string;
}) {
  const t = useT(messages);
  const phase = PHASE[row.phase];
  const sim = row.simulation === 'ok' ? t('simOk') : row.simulation === 'failed' ? t('simFailed') : t('simSkipped');
  return (
    <li
      data-testid={`${testId}-step-${row.index}`}
      data-phase={row.phase}
      className="relative flex gap-4 pb-5 last:pb-0"
    >
      {last ? null : (
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-9 bottom-1 left-[15.5px] w-px transition-colors duration-500',
            row.phase === 'confirmed' ? 'bg-thread' : 'bg-line',
          )}
        />
      )}
      <StepMarker row={row} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
        <p className="text-body text-ink">{row.summary}</p>
        <p className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-small', phase.tone)}>
          <span>{t(phase.key)}</span>
          {row.hash && explorer ? (
            <ExternalLink href={explorerTx(explorer, row.hash)} className="text-ink-muted">
              {t('viewTx')}
            </ExternalLink>
          ) : null}
          {row.hash && !explorer ? (
            <code className="break-all font-mono text-caption text-ink-muted">{row.hash}</code>
          ) : null}
        </p>
        <details className="group mt-1">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-caption text-ink-muted transition-colors duration-150 hover:text-ink [&::-webkit-details-marker]:hidden">
            {t('details')}
            <ChevronDown
              aria-hidden="true"
              size={14}
              strokeWidth={1.5}
              className="transition-transform duration-150 group-open:rotate-180"
            />
          </summary>
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-xl bg-surface-2/60 p-3 text-small">
            <dt className="text-ink-muted">{t('contract')}</dt>
            <dd className="min-w-0">
              <Address address={row.to} size="sm" avatar={false} explorer={explorer} />
            </dd>
            <dt className="text-ink-muted">{t('fn')}</dt>
            <dd>
              <code className="font-mono text-ink">{row.action}</code>
            </dd>
            <dt className="text-ink-muted">{t('check')}</dt>
            <dd className="text-ink">{sim}</dd>
            <dt className="text-ink-muted">{t('gas')}</dt>
            <dd className="font-mono text-ink tabular-nums">
              {row.gas !== null ? `≈ ${formatAmount(row.gas, 0)}` : row.simulation === 'failed' ? '—' : t('noGas')}
            </dd>
          </dl>
        </details>
      </div>
    </li>
  );
}

export interface TxCardProps {
  runner: TxRunner;
  /** The send button, for example "Create vault". */
  label: string;
  title?: ReactNode;
  /** `hold`: a HoldButton (600 ms, or Enter) for the actions the spec makes a ritual, such as the check-in. */
  confirm?: 'click' | 'hold';
  /** `danger` for a plan that cannot be undone. */
  tone?: 'thread' | 'danger';
  testId?: string;
  className?: string;
}

/** A prepared plan, step by step: what each step does, what the simulation said, and where the wallet is. */
export function TxCard({
  runner,
  label,
  title,
  confirm = 'click',
  tone = 'thread',
  testId = 'tx',
  className,
}: TxCardProps) {
  const t = useT(messages);
  const tw = useT(walletMessages);
  const headingId = useId();
  const { plan, view, busy, result, blocker, offset } = runner;
  const active = view.rows.find((r) => inWallet(r.phase));
  const announce = result
    ? t('done')
    : active
      ? t('live', { n: active.index + 1, total: view.total, status: t(PHASE[active.phase].key) })
      : '';
  const sendLabel = busy
    ? t('sending')
    : blocker === 'loading'
      ? t('preparing')
      : offset > 0
        ? t('resume', { n: offset + 1 })
        : label;

  let action: ReactNode;
  if (result) {
    action = (
      <Banner tone="success" testId={`${testId}-done`}>
        {t('done')}
      </Banner>
    );
  } else if (blocker === 'connect') {
    action = (
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-muted text-small">{t('connectFirst')}</p>
        <Button
          variant="primary"
          data-testid={`${testId}-connect`}
          onClick={runner.connect}
          icon={<Wallet aria-hidden="true" strokeWidth={1.5} />}
        >
          {tw('connect')}
        </Button>
      </div>
    );
  } else if (blocker === 'wrongAccount') {
    action = (
      <Banner tone="error" title={t('wrongAccountTitle')} testId={`${testId}-wrong-account`}>
        <p>{t('wrongAccount')}</p>
        <Address address={plan.from} size="sm" className="mt-2" />
      </Banner>
    );
  } else {
    action = (
      <div className={cn('flex flex-col gap-2', confirm === 'hold' ? 'items-center' : 'items-stretch sm:items-end')}>
        {confirm === 'hold' ? (
          <HoldButton
            data-testid={`${testId}-send`}
            tone={tone}
            disabled={busy || blocker !== null}
            onConfirm={runner.send}
          >
            {sendLabel}
          </HoldButton>
        ) : (
          <Button
            data-testid={`${testId}-send`}
            variant={tone === 'danger' ? 'danger' : 'primary'}
            size="lg"
            loading={busy || (blocker === 'loading' && runner.error === null)}
            disabled={blocker !== null}
            onClick={runner.send}
            icon={<Signature aria-hidden="true" strokeWidth={1.5} />}
            className="w-full sm:w-auto"
          >
            {sendLabel}
          </Button>
        )}
        {runner.switchFirst ? (
          <p className="text-caption text-ink-muted">{t('switchFirst', { network: networkName(CHAIN_ID) })}</p>
        ) : null}
      </div>
    );
  }

  return (
    <section
      data-testid={testId}
      aria-labelledby={headingId}
      className={cn('flex flex-col gap-5 rounded-3xl border border-line bg-surface-1 p-5 sm:p-6', className)}
    >
      <header className="flex flex-col gap-1.5">
        <h3 id={headingId} className="font-display text-ink text-title">
          {title ?? t('title')}
        </h3>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-muted text-small">
          <span>{view.total === 1 ? t('stepsOne') : t('stepsMany', { n: view.total })}</span>
          <span aria-hidden="true">·</span>
          <span>{t('signer')}</span>
          <Address address={plan.from} size="sm" copy={false} />
        </div>
      </header>

      {view.total > 1 ? <TxProgress rows={view.rows} testId={`${testId}-progress`} /> : null}

      {view.warnings.length > 0 ? (
        <div className="flex flex-col gap-2">
          {view.warnings.map((w) => (
            <Banner key={warningKey(w)} tone="warn" testId={`warning-${w.code}`}>
              <UntrustedText value={w.message} max={280} />
            </Banner>
          ))}
        </div>
      ) : null}

      <ol aria-label={t('what')} className="flex flex-col">
        {view.rows.map((r, i) => (
          <StepItem
            key={r.index}
            row={r}
            last={i === view.rows.length - 1}
            explorer={runner.explorer}
            testId={testId}
          />
        ))}
      </ol>

      {view.blockedError ? <ErrorBox error={view.blockedError} /> : null}
      <ErrorBox error={runner.error} onRetry={blocker === 'loading' ? runner.reload : undefined} />

      <footer className="flex flex-col gap-3 border-line border-t pt-5">{action}</footer>

      {runner.handoffLink ? (
        <details className="group rounded-2xl border border-line bg-surface-2/40">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-ink text-small [&::-webkit-details-marker]:hidden">
            <Smartphone aria-hidden="true" size={16} strokeWidth={1.5} className="text-ink-muted" />
            <span className="flex-1">{t('handoffTitle')}</span>
            <ChevronDown
              aria-hidden="true"
              size={16}
              strokeWidth={1.5}
              className="text-ink-muted transition-transform duration-150 group-open:rotate-180"
            />
          </summary>
          <div className="flex flex-col items-start gap-3 px-4 pb-4">
            <p className="text-ink-muted text-small">{t('handoffBody')}</p>
            <span data-testid={`${testId}-copy-link`} className="inline-flex">
              <CopyButton
                text={runner.handoffLink}
                label={t('copyLink')}
                showText
                className="border border-line-strong"
              />
            </span>
          </div>
        </details>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>
    </section>
  );
}
```

Run: `npm test -w apps/web -- error-box tx-card tx-runner tx-impl tx-view errors-view lazy-boundary`
Expected: PASS (error-box 3, tx-card 6, tx-runner 10, tx-impl 5, tx-view 5, errors-view 5, lazy-boundary 2). `lazy-boundary` giữ luật: `use-error-view.ts` chỉ `import type` từ `./impl/describe`, `use-tx-runner.ts` chỉ `import type` từ SDK; giá trị của SDK chỉ tới qua `loadTxImpl` và `useSdk`.

Nếu `tx-runner` hỏng ở `ready()` (nút không bao giờ bật): kiểm mock của `../../src/chain/load` có `createSdk` trả `atro.send` và `handoff.link`, và `walletValue` mặc định đã kết nối đúng `TEST_ACCOUNT` (trùng `plan.from`).

- [ ] **Step 6: Chạy toàn bộ và commit**

```bash
npm test -w apps/web
npm run typecheck -w apps/web
npx biome ci .
git add apps/web/src/tx apps/web/src/messages/tx.messages.ts apps/web/test/helpers/wallet.ts apps/web/test/unit/tx-view.test.ts apps/web/test/unit/errors-view.test.ts apps/web/test/unit/tx-impl.test.ts apps/web/test/unit/error-box.test.tsx apps/web/test/unit/tx-card.test.tsx apps/web/test/unit/tx-runner.test.tsx
git commit -m "feat(web): transaction engine with resume, hand-off to the sign page, TxCard and ErrorBox" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: mọi test PASS; typecheck và Biome sạch.

---

### Task 14: Client API (chỉ bản vercel), số liệu API trước, chain sau, và lính canh URL ở bản deweb

Spec §9.6 là giao diện duy nhất với backend (Plan 8 viết song song), nên kiểu trong `src/api/types.ts` chép đúng bảng đó và client kiểm hình dạng của mọi câu trả lời: câu trả lời lệch hợp đồng thành lỗi `BAD_RESPONSE`, không bao giờ lọt vào giao diện. Bản deweb không có backend: `getApi()` trả `null`, mọi hook đứng yên, và không file nào trong `out/` của deweb chứa URL backend (Quyết định 30).

Ba lớp giữ URL khỏi bản deweb, mỗi lớp đủ chặn một đường rò:
- `scripts/lib/build-env.ts` đặt `NEXT_PUBLIC_API_URL=''` (rỗng, không xoá) trước khi Next chạy. `@next/env` 16.4.6 chỉ nạp một khoá từ file `.env*` khi khoá đó `undefined` trong môi trường ban đầu (`processEnv`: `typeof p[t]==="undefined"`, `p` là bản chụp `process.env` lúc đầu), nên chuỗi rỗng chặn cả `.env.local` của nhà phát triển. Xoá khoá thì không chặn. Bản vercel không có URL trong môi trường cũng nhận chuỗi rỗng: URL chỉ đến từ môi trường build, đúng nguồn mà CSP của trang đọc (Task 15), nên `connect-src` không bao giờ lệch với bundle.
- `next.config.mjs` cũng đặt rỗng (cho `next build` gọi trực tiếp) và luôn đặt `NEXT_PUBLIC_TARGET`, để Next inline target ở mọi module.
- `src/config/env.ts` chỉ đọc URL sau phép so `process.env.NEXT_PUBLIC_TARGET === 'vercel'`. Ở bản deweb phép so thành `"deweb" === "vercel"`, minifier gập nó và bỏ nhánh chứa URL.

Test build `the deweb build never contains the API url` (Review Focus 5) chạy thật hai lần `next build` với URL sentinel trong môi trường **và** một file `apps/web/.env.production.local` chứa sentinel thứ hai.

**Files:**
- Create: `apps/web/src/api/types.ts`, `apps/web/src/api/client.ts`, `apps/web/src/api/instance.ts`, `apps/web/src/api/hooks.ts`
- Modify: `apps/web/src/chain/use-stats.ts` (thay toàn bộ), `apps/web/src/chain/query-client.ts` (thay toàn bộ), `apps/web/src/config/env.ts` (một dòng), `apps/web/scripts/lib/build-env.ts`, `apps/web/next.config.mjs`, `apps/web/test/build/paths.ts`, `apps/web/test/build/global-setup.ts`, `apps/web/test/unit/build-env.test.ts`
- Test: `apps/web/test/unit/api-client.test.ts`, `apps/web/test/unit/api-hooks.test.tsx`, `apps/web/test/build/api-url.test.ts`

**Interfaces:**
- Consumes: Task 2 (`ENV`, `IS_VERCEL`, `buildEnvFor`, `buildApp`, `APP_DIR`, `OUT_DIR`, `BUILD_OUT`, `API_SENTINEL`, `outOf`), Task 5 (`isAddressText`, `sameAddress`), Task 10 (`CHAIN_ID`, `chainKeys`, `PERMANENT_CODES`, `shouldRetry`, `useSdk`, `loadChainImpl`, `type CachedStats`, `type Sdk`, `toCache`, `makeWrapper`, `test/unit/fixtures.ts`).
- Produces:
  - `src/api/types.ts` (chỉ kiểu và một hằng): `type Role = 'owner' | 'guardian' | 'heir'`; `type Lang = 'en' | 'vi'`; `PROBLEM_CODES`; `type ProblemCode`; `interface Problem`; `interface SubscribeRequest { email: string; vault: Address; role: Role; lang: Lang; website: string }`; `interface OkResponse { ok: true }`; `interface ConfirmResponse { ok: true; vault: Address; role: Role }`; `interface MeVault { vault: Address; roles: Role[]; drill: boolean; state: string; released: boolean }`; `interface MeResponse { address: Address; block: string; vaults: MeVault[] }`; `interface StatsResponse { block: string; vaults: string; drills: string; checkIns: string; updatedAt: string }`; `interface HealthResponse { indexer: { block: string; lagBlocks: number; updatedAt: string }; integrity: { at: string; block: string; ok: boolean } | null; keeper: { lastRunAt: string; balanceWei: string; dryRun: boolean } | null }`.
  - `src/api/client.ts`: `type ApiErrorCode = ProblemCode | 'NETWORK' | 'TIMEOUT' | 'BAD_RESPONSE' | 'UNAVAILABLE'`; `class ApiError extends Error { readonly code: ApiErrorCode; readonly status: number | null }`; `interface ApiClient { subscribe(req, signal?): Promise<OkResponse>; confirm(token, signal?): Promise<ConfirmResponse>; unsubscribe(token, signal?): Promise<OkResponse>; me(address, signal?): Promise<MeResponse>; stats(signal?): Promise<StatsResponse>; health(signal?): Promise<HealthResponse> }`; `interface ApiClientOptions { fetch?: typeof fetch; timeoutMs?: number }`; `createApiClient(base: string, o?: ApiClientOptions): ApiClient`.
  - `src/api/instance.ts`: `getApi(): ApiClient | null` (null ở bản deweb và khi bản vercel không có URL).
  - `src/api/hooks.ts`: `useApiStats(): UseQueryResult<StatsResponse>`; `useMe(account: string | null): UseQueryResult<MeResponse>`; `useHealth(): UseQueryResult<HealthResponse>`; `useSubscribe(): UseMutationResult<OkResponse, Error, SubscribeRequest>`; `useConfirm(): UseMutationResult<ConfirmResponse, Error, string>`; `useUnsubscribe(): UseMutationResult<OkResponse, Error, string>`. Không có backend thì query đứng yên (`fetchStatus 'idle'`) và mutation hỏng với `ApiError` mã `UNAVAILABLE`.
  - `src/chain/use-stats.ts`: `StatsState` thêm `loading: boolean`; `summaryOfApi(s: StatsResponse): StatsSummary`; `freshest(a: StatsSummary | null, b: StatsSummary | null): StatsSummary | null`; `useStats()` đọc API trước, đếm chain khi người dùng bấm.
  - `src/chain/query-client.ts`: `PERMANENT_CODES` thêm `INVALID_INPUT`, `NOT_A_VAULT`, `RATE_LIMITED`, `TOKEN_INVALID`, `UNAUTHORIZED`, `BAD_RESPONSE`, `UNAVAILABLE`.
  - `test/build/paths.ts`: `DOTENV_SENTINEL = 'https://dotenv.atropyle.invalid/functions/v1'`.

- [ ] **Step 1: Viết test hỏng cho client**

`apps/web/test/unit/api-client.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient } from '../../src/api/client';
import type { SubscribeRequest } from '../../src/api/types';
import { shouldRetry } from '../../src/chain/query-client';

const BASE = 'https://api.atropyle.test/functions/v1';
const OWNER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const OTHER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
const VAULT = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

const REQUEST: SubscribeRequest = { email: 'ana@example.com', vault: VAULT, role: 'heir', lang: 'vi', website: '' };
const STATS = { block: '2500', vaults: '7', drills: '2', checkIns: '40', updatedAt: '2026-11-23T08:00:00.000Z' };
const ME = {
  address: OWNER,
  block: '1234',
  vaults: [{ vault: VAULT, roles: ['owner'], drill: true, state: 'active', released: false }],
};
const HEALTH = {
  indexer: { block: '1234', lagBlocks: 2, updatedAt: '2026-11-23T08:00:00.000Z' },
  integrity: { at: '2026-11-23T07:50:00.000Z', block: '1200', ok: true },
  keeper: { lastRunAt: '2026-11-23T07:59:00.000Z', balanceWei: '50000000000000000', dryRun: false },
};

const json = (status: number, body: unknown, type = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });
const problem = (status: number, code: string) =>
  json(status, { type: 'about:blank', title: code.toLowerCase(), status, code }, 'application/problem+json');

/** A fake backend that answers with `answers` in order and records every request. */
function backend(...answers: Array<Response | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const a = answers.shift();
    if (!a) throw new Error('no answer left');
    if (a instanceof Error) throw a;
    return a;
  };
  return { calls, client: createApiClient(`${BASE}/`, { fetch: fetch as unknown as typeof globalThis.fetch }) };
}

/** A fetch that never answers and rejects like the real one when its signal aborts. */
const hanging = (_url: string, init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    if (init.signal?.aborted) abort();
    else init.signal?.addEventListener('abort', abort);
  });

describe('api client', () => {
  it('sends a GET without credentials, referrer, redirects or a header that needs a preflight', async () => {
    const { calls, client } = backend(json(200, STATS));
    expect(await client.stats()).toEqual(STATS);
    expect(calls[0].url).toBe(`${BASE}/stats`);
    expect(calls[0].init).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    });
    expect(calls[0].init.headers).toEqual({ accept: 'application/json' });
    expect(calls[0].init.body).toBeUndefined();
  });

  it('posts JSON to each form endpoint and reads its answer', async () => {
    const { calls, client } = backend(
      json(202, { ok: true }),
      json(200, { ok: true, vault: VAULT, role: 'heir' }),
      json(200, { ok: true }),
    );
    expect(await client.subscribe(REQUEST)).toEqual({ ok: true });
    expect(await client.confirm('tok-1')).toEqual({ ok: true, vault: VAULT, role: 'heir' });
    expect(await client.unsubscribe('tok-2')).toEqual({ ok: true });
    expect(calls.map((c) => c.url)).toEqual([`${BASE}/subscribe`, `${BASE}/confirm`, `${BASE}/unsubscribe`]);
    expect(calls[0].init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
    });
    expect(JSON.parse(String(calls[0].init.body))).toEqual(REQUEST);
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ token: 'tok-1' });
    expect(JSON.parse(String(calls[2].init.body))).toEqual({ token: 'tok-2' });
  });

  it('reads me and health as the contract has them', async () => {
    const { calls, client } = backend(
      json(200, ME),
      json(200, HEALTH),
      json(200, { ...HEALTH, integrity: null, keeper: null }),
    );
    expect(await client.me(OWNER)).toEqual(ME);
    expect(calls[0].url).toBe(`${BASE}/me?address=${OWNER}`);
    expect(await client.health()).toEqual(HEALTH);
    expect(await client.health()).toEqual({ ...HEALTH, integrity: null, keeper: null });
  });

  it('turns a problem+json answer into an ApiError with its code and status', async () => {
    const { client } = backend(
      problem(429, 'RATE_LIMITED'),
      problem(404, 'TOKEN_INVALID'),
      problem(400, 'NOT_A_VAULT'),
    );
    await expect(client.subscribe(REQUEST)).rejects.toMatchObject({
      name: 'ApiError',
      code: 'RATE_LIMITED',
      status: 429,
    });
    await expect(client.confirm('old')).rejects.toMatchObject({ code: 'TOKEN_INVALID', status: 404 });
    await expect(client.subscribe(REQUEST)).rejects.toMatchObject({ code: 'NOT_A_VAULT', status: 400 });
  });

  it('maps an error without a known problem to INTERNAL on 5xx and BAD_RESPONSE otherwise', async () => {
    const { client } = backend(
      new Response('<html>Bad gateway</html>', { status: 502 }),
      json(418, { code: 'TEAPOT' }),
    );
    await expect(client.stats()).rejects.toMatchObject({ code: 'INTERNAL', status: 502 });
    await expect(client.stats()).rejects.toMatchObject({ code: 'BAD_RESPONSE', status: 418 });
  });

  it('refuses an answer that breaks the contract and keeps only the fields of the contract', async () => {
    const { client } = backend(
      json(200, { ...STATS, vaults: 7 }),
      json(200, { ...STATS, block: '-1' }),
      json(200, { ...HEALTH, indexer: { ...HEALTH.indexer, lagBlocks: -1 } }),
      json(200, { ...HEALTH, keeper: 'later' }),
      json(200, { ...ME, vaults: [{ ...ME.vaults[0], roles: ['owner', 'admin'] }] }),
      json(200, { ...ME, vaults: [{ ...ME.vaults[0], state: '<img src=x>' }] }),
      json(200, { ...ME, address: OTHER }),
      json(200, { ...STATS, note: '<script>alert(1)</script>' }),
      new Response('not json', { status: 200 }),
    );
    await expect(client.stats()).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    await expect(client.stats()).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    await expect(client.health()).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    await expect(client.health()).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    await expect(client.me(OWNER)).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    await expect(client.me(OWNER)).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    await expect(client.me(OWNER)).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
    expect(await client.stats()).toEqual(STATS);
    await expect(client.stats()).rejects.toMatchObject({ code: 'BAD_RESPONSE' });
  });

  it('checks the input before asking', async () => {
    const { calls, client } = backend();
    await expect(client.me('0x123')).rejects.toMatchObject({ code: 'INVALID_INPUT', status: null });
    await expect(client.confirm('')).rejects.toMatchObject({ code: 'TOKEN_INVALID', status: null });
    await expect(client.unsubscribe('x'.repeat(513))).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
    expect(calls).toEqual([]);
  });

  it('reports a network failure and a timeout with their own codes', async () => {
    const offline = createApiClient(BASE, {
      fetch: (async () => {
        throw new TypeError('Failed to fetch');
      }) as typeof fetch,
    });
    await expect(offline.stats()).rejects.toMatchObject({ code: 'NETWORK', status: null });
    const slow = createApiClient(BASE, { fetch: hanging as unknown as typeof fetch, timeoutMs: 20 });
    await expect(slow.stats()).rejects.toMatchObject({ code: 'TIMEOUT', status: null });
  });

  it('lets a cancelled query end as a cancellation, not as an ApiError', async () => {
    const client = createApiClient(BASE, { fetch: hanging as unknown as typeof fetch });
    const ctrl = new AbortController();
    const pending = client.stats(ctrl.signal);
    ctrl.abort();
    const e = await pending.catch((x: unknown) => x);
    expect(e).not.toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ name: 'AbortError' });
  });

  it('never retries an answer that will not change, and retries a passing failure', () => {
    const permanent = [
      'INVALID_INPUT',
      'NOT_A_VAULT',
      'RATE_LIMITED',
      'TOKEN_INVALID',
      'UNAUTHORIZED',
      'BAD_RESPONSE',
      'UNAVAILABLE',
    ] as const;
    for (const code of permanent) expect(shouldRetry(0, new ApiError(code, 400, code)), code).toBe(false);
    for (const code of ['INTERNAL', 'NETWORK', 'TIMEOUT'] as const) {
      expect(shouldRetry(0, new ApiError(code, null, code)), code).toBe(true);
    }
  });
});
```

Run: `npm test -w apps/web -- api-client`
Expected: FAIL, không tìm thấy `../../src/api/client`.

- [ ] **Step 2: Viết kiểu của hợp đồng, client và mã lỗi vĩnh viễn**

`apps/web/src/api/types.ts`:

```ts
import type { Address } from 'viem';

/**
 * The contract of spec §9.6, the only interface between this app and the backend (Plan 8). Change the spec first.
 * Wire types: bigint values are decimal strings, times are ISO 8601 UTC strings, addresses are checksummed.
 */
export type Role = 'owner' | 'guardian' | 'heir';
export type Lang = 'en' | 'vi';

export const PROBLEM_CODES = [
  'INVALID_INPUT',
  'NOT_A_VAULT',
  'RATE_LIMITED',
  'TOKEN_INVALID',
  'UNAUTHORIZED',
  'INTERNAL',
] as const;
export type ProblemCode = (typeof PROBLEM_CODES)[number];

/** An error answer, served as `application/problem+json`. */
export interface Problem {
  type: 'about:blank';
  title: string;
  status: number;
  code: ProblemCode;
}

export interface SubscribeRequest {
  email: string;
  vault: Address;
  role: Role;
  lang: Lang;
  /** A trap for bots: a person never sees the field, so it is always empty. */
  website: string;
}

export interface OkResponse {
  ok: true;
}

export interface ConfirmResponse {
  ok: true;
  vault: Address;
  role: Role;
}

export interface MeVault {
  vault: Address;
  roles: Role[];
  drill: boolean;
  /** The SDK's state name (`active`, `grace`, …): shown as data, never as markup. */
  state: string;
  released: boolean;
}

export interface MeResponse {
  address: Address;
  block: string;
  vaults: MeVault[];
}

export interface StatsResponse {
  block: string;
  vaults: string;
  drills: string;
  checkIns: string;
  updatedAt: string;
}

export interface HealthResponse {
  indexer: { block: string; lagBlocks: number; updatedAt: string };
  /** null until the first integrity run. */
  integrity: { at: string; block: string; ok: boolean } | null;
  /** null until the keeper's first run. */
  keeper: { lastRunAt: string; balanceWei: string; dryRun: boolean } | null;
}
```

`apps/web/src/api/client.ts`:

```ts
import type { Address } from 'viem';
import { isAddressText, sameAddress } from '@/lib/address';
import {
  type ConfirmResponse,
  type HealthResponse,
  type MeResponse,
  type MeVault,
  type OkResponse,
  PROBLEM_CODES,
  type ProblemCode,
  type Role,
  type StatsResponse,
  type SubscribeRequest,
} from './types';

export type ApiErrorCode = ProblemCode | 'NETWORK' | 'TIMEOUT' | 'BAD_RESPONSE' | 'UNAVAILABLE';

/**
 * Every failure of a backend call. The UI words its message by `code`; `message` is for the console only, since the
 * backend's `title` is neither translated nor meant for people.
 */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /** The HTTP status, or null when no answer came (network, timeout, an input refused before asking). */
  readonly status: number | null;

  constructor(code: ApiErrorCode, status: number | null, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export interface ApiClient {
  subscribe(req: SubscribeRequest, signal?: AbortSignal): Promise<OkResponse>;
  confirm(token: string, signal?: AbortSignal): Promise<ConfirmResponse>;
  unsubscribe(token: string, signal?: AbortSignal): Promise<OkResponse>;
  me(address: string, signal?: AbortSignal): Promise<MeResponse>;
  stats(signal?: AbortSignal): Promise<StatsResponse>;
  health(signal?: AbortSignal): Promise<HealthResponse>;
}

export interface ApiClientOptions {
  /** The global fetch by default; tests pass a fake. */
  fetch?: typeof fetch;
  /** Per request, the answer's body included. 10 s by default. */
  timeoutMs?: number;
}

type Obj = Record<string, unknown>;
type Parse<T> = (v: unknown) => T | null;

const MAX_TOKEN = 512;
const MAX_VAULTS = 1000;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
/** A bigint on the wire: a decimal string without sign or leading zero, at most 78 digits (2^256 has 78). */
const isDecimal = (v: unknown): v is string => typeof v === 'string' && /^(?:0|[1-9]\d{0,77})$/.test(v);
const isTime = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));
const isAddress = (v: unknown): v is Address => typeof v === 'string' && isAddressText(v);
const isRole = (v: unknown): v is Role => v === 'owner' || v === 'guardian' || v === 'heir';
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
/** SDK state names are camelCase words; anything else is refused rather than shown. */
const isStateName = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z]{1,32}$/.test(v);
const isProblemCode = (v: unknown): v is ProblemCode =>
  typeof v === 'string' && (PROBLEM_CODES as readonly string[]).includes(v);

const okOf: Parse<OkResponse> = (v) => (isObj(v) && v.ok === true ? { ok: true } : null);

const confirmOf: Parse<ConfirmResponse> = (v) =>
  isObj(v) && v.ok === true && isAddress(v.vault) && isRole(v.role) ? { ok: true, vault: v.vault, role: v.role } : null;

function meVaultOf(v: unknown): MeVault | null {
  if (!isObj(v) || !isAddress(v.vault) || !Array.isArray(v.roles)) return null;
  const roles = v.roles.filter(isRole);
  if (roles.length === 0 || roles.length !== v.roles.length) return null;
  if (typeof v.drill !== 'boolean' || typeof v.released !== 'boolean' || !isStateName(v.state)) return null;
  return { vault: v.vault, roles: [...new Set(roles)], drill: v.drill, state: v.state, released: v.released };
}

const meOf: Parse<MeResponse> = (v) => {
  if (!isObj(v) || !isAddress(v.address) || !isDecimal(v.block)) return null;
  if (!Array.isArray(v.vaults) || v.vaults.length > MAX_VAULTS) return null;
  const vaults: MeVault[] = [];
  for (const raw of v.vaults) {
    const one = meVaultOf(raw);
    if (!one) return null;
    vaults.push(one);
  }
  return { address: v.address, block: v.block, vaults };
};

const statsOf: Parse<StatsResponse> = (v) =>
  isObj(v) &&
  isDecimal(v.block) &&
  isDecimal(v.vaults) &&
  isDecimal(v.drills) &&
  isDecimal(v.checkIns) &&
  isTime(v.updatedAt)
    ? { block: v.block, vaults: v.vaults, drills: v.drills, checkIns: v.checkIns, updatedAt: v.updatedAt }
    : null;

const indexerOf: Parse<HealthResponse['indexer']> = (v) =>
  isObj(v) && isDecimal(v.block) && isCount(v.lagBlocks) && isTime(v.updatedAt)
    ? { block: v.block, lagBlocks: v.lagBlocks, updatedAt: v.updatedAt }
    : null;

const integrityOf: Parse<NonNullable<HealthResponse['integrity']>> = (v) =>
  isObj(v) && isTime(v.at) && isDecimal(v.block) && typeof v.ok === 'boolean'
    ? { at: v.at, block: v.block, ok: v.ok }
    : null;

const keeperOf: Parse<NonNullable<HealthResponse['keeper']>> = (v) =>
  isObj(v) && isTime(v.lastRunAt) && isDecimal(v.balanceWei) && typeof v.dryRun === 'boolean'
    ? { lastRunAt: v.lastRunAt, balanceWei: v.balanceWei, dryRun: v.dryRun }
    : null;

/** null stays null (that part has not run yet); anything else must parse, or `undefined` refuses the answer. */
function nullable<T>(v: unknown, parse: Parse<T>): T | null | undefined {
  if (v === null) return null;
  return parse(v) ?? undefined;
}

const healthOf: Parse<HealthResponse> = (v) => {
  if (!isObj(v)) return null;
  const indexer = indexerOf(v.indexer);
  const integrity = nullable(v.integrity, integrityOf);
  const keeper = nullable(v.keeper, keeperOf);
  return indexer && integrity !== undefined && keeper !== undefined ? { indexer, integrity, keeper } : null;
};

function problemOf(v: unknown): { code: ProblemCode; title: string } | null {
  if (!isObj(v) || !isProblemCode(v.code)) return null;
  return { code: v.code, title: typeof v.title === 'string' ? v.title.slice(0, 200) : v.code };
}

function jsonOf(text: string): unknown {
  if (text === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * The backend of spec §9.6 at `base` (`https://<project>.supabase.co/functions/v1`). Every answer is checked against
 * the contract and rebuilt from its known fields only; a cancelled `signal` rejects with the abort error itself, so
 * TanStack Query sees a cancellation rather than a failure.
 */
export function createApiClient(base: string, o: ApiClientOptions = {}): ApiClient {
  const root = base.replace(/\/+$/, '');
  // Called bare: the browser's fetch throws when called as a method of another object (the options here).
  const send: (url: string, init: RequestInit) => Promise<Response> = o.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = o.timeoutMs ?? 10_000;

  async function call<T>(
    method: 'GET' | 'POST',
    path: string,
    body: object | null,
    parse: Parse<T>,
    outer?: AbortSignal,
  ): Promise<T> {
    // No query string in messages: `me` carries an address.
    const what = `${method} /${path.split('?')[0]}`;
    const ctrl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, timeoutMs);
    const forward = () => ctrl.abort(outer?.reason);
    if (outer?.aborted) forward();
    else outer?.addEventListener('abort', forward, { once: true });
    let res: Response;
    let text: string;
    try {
      res = await send(`${root}/${path}`, {
        method,
        // A GET with only `accept` is a simple CORS request, so it needs no preflight (spec §9.2 opens GET to all).
        headers: body
          ? { accept: 'application/json', 'content-type': 'application/json' }
          : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        signal: ctrl.signal,
      });
      text = await res.text();
    } catch (e) {
      if (timedOut) throw new ApiError('TIMEOUT', null, `${what} took longer than ${timeoutMs} ms`);
      if (outer?.aborted) throw e;
      throw new ApiError('NETWORK', null, `${what} failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', forward);
    }
    const json = jsonOf(text);
    if (!res.ok) {
      const p = problemOf(json);
      if (p) throw new ApiError(p.code, res.status, `${what}: ${p.title}`);
      throw new ApiError(res.status >= 500 ? 'INTERNAL' : 'BAD_RESPONSE', res.status, `${what}: HTTP ${res.status}`);
    }
    const value = parse(json);
    if (value === null)
      throw new ApiError('BAD_RESPONSE', res.status, `${what}: the answer does not match the contract`);
    return value;
  }

  const refuse = (code: ApiErrorCode, message: string): Promise<never> =>
    Promise.reject(new ApiError(code, null, message));
  const badToken = (t: string) => t.length === 0 || t.length > MAX_TOKEN;

  return {
    subscribe: (req, signal) =>
      call(
        'POST',
        'subscribe',
        { email: req.email, vault: req.vault, role: req.role, lang: req.lang, website: req.website },
        okOf,
        signal,
      ),
    confirm: (token, signal) =>
      badToken(token)
        ? refuse('TOKEN_INVALID', 'The link carries no valid token.')
        : call('POST', 'confirm', { token }, confirmOf, signal),
    unsubscribe: (token, signal) =>
      badToken(token)
        ? refuse('TOKEN_INVALID', 'The link carries no valid token.')
        : call('POST', 'unsubscribe', { token }, okOf, signal),
    me: (address, signal) => {
      if (!isAddressText(address)) return refuse('INVALID_INPUT', 'me needs an address.');
      const forAddress: Parse<MeResponse> = (v) => {
        const m = meOf(v);
        return m && sameAddress(m.address, address) ? m : null;
      };
      return call('GET', `me?address=${encodeURIComponent(address)}`, null, forAddress, signal);
    },
    stats: (signal) => call('GET', 'stats', null, statsOf, signal),
    health: (signal) => call('GET', 'health', null, healthOf, signal),
  };
}
```

Thay `apps/web/src/chain/query-client.ts` (thêm mã lỗi vĩnh viễn của backend, Quyết định 30):

```ts
import { QueryClient } from '@tanstack/react-query';

/** Errors that the same request will meet again (Quyết định 18): retrying only delays the message. */
export const PERMANENT_CODES: ReadonlySet<string> = new Set([
  'NOT_VAULT',
  'INVALID_ADDRESS',
  'DEPLOYMENT_INVALID',
  'DEPLOYMENT_MISSING',
  'LINK_INVALID',
  'PLAN_INVALID',
  'INVALID_OPTIONS',
  'USER_REJECTED',
  'WRONG_CHAIN',
  'WRONG_ACCOUNT',
  'POLICY_MISMATCH',
  'DRILL_EXPIRED',
  // The backend (src/api/client.ts): its answers to the same request do not change, and RATE_LIMITED only gets worse.
  'INVALID_INPUT',
  'NOT_A_VAULT',
  'RATE_LIMITED',
  'TOKEN_INVALID',
  'UNAUTHORIZED',
  'BAD_RESPONSE',
  'UNAVAILABLE',
]);

/** The `code` of an AtropyleError or an ApiError, read structurally so this file stays free of the SDK. */
export function errorCode(e: unknown): string | null {
  const code = typeof e === 'object' && e !== null ? (e as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : null;
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  return failureCount < 2 && !PERMANENT_CODES.has(errorCode(error) ?? '');
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 15_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}
```

Run: `npm test -w apps/web -- api-client query-client`
Expected: PASS (api-client 10, query-client 2).

- [ ] **Step 3: Viết test hỏng cho hook API và `useStats`**

`apps/web/test/unit/api-hooks.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import { useApiStats, useConfirm, useHealth, useMe, useSubscribe, useUnsubscribe } from '../../src/api/hooks';
import type { SubscribeRequest } from '../../src/api/types';
import { toCache } from '../../src/chain/impl/stats-view';
import { freshest, type StatsSummary, summaryOfApi, useStats } from '../../src/chain/use-stats';
import { makeWrapper } from '../helpers/render';
import { fixtureDeployment, fixtureStats, PEOPLE } from './fixtures';

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

const impl = vi.hoisted(() => ({
  loadDeployment: vi.fn(),
  createSdk: vi.fn(),
  cachedStats: vi.fn(),
  countStats: vi.fn(),
}));
vi.mock('../../src/chain/load', () => ({ loadChainImpl: async () => impl, peekChainImpl: () => impl }));

const STATS = { block: '2500', vaults: '7', drills: '2', checkIns: '40', updatedAt: '2026-11-23T08:00:00.000Z' };
const REQUEST: SubscribeRequest = {
  email: 'ana@example.com',
  vault: PEOPLE.vault,
  role: 'heir',
  lang: 'vi',
  website: '',
};
const HEALTH = {
  indexer: { block: '1234', lagBlocks: 2, updatedAt: '2026-11-23T08:00:00.000Z' },
  integrity: null,
  keeper: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  backend.on = true;
  impl.loadDeployment.mockImplementation(() => fixtureDeployment());
  impl.createSdk.mockImplementation(() => ({ fake: 'sdk' }));
  impl.cachedStats.mockReturnValue(null);
});

describe('stats summary', () => {
  const at = (source: 'api' | 'chain', block: bigint): StatsSummary => ({
    source,
    block,
    vaults: 1,
    drills: 0,
    checkIns: 0,
    savedAtMs: null,
  });

  it('takes the count at the higher block, and the count of this device on a tie', () => {
    expect(freshest(null, null)).toBeNull();
    expect(freshest(at('api', 5n), null)?.source).toBe('api');
    expect(freshest(null, at('chain', 5n))?.source).toBe('chain');
    expect(freshest(at('api', 6n), at('chain', 5n))?.source).toBe('api');
    expect(freshest(at('api', 5n), at('chain', 6n))?.source).toBe('chain');
    expect(freshest(at('api', 5n), at('chain', 5n))?.source).toBe('chain');
    expect(freshest(at('chain', 5n), at('api', 5n))?.source).toBe('chain');
  });

  it('reads the decimal strings of the backend', () => {
    expect(summaryOfApi(STATS)).toEqual({
      source: 'api',
      block: 2_500n,
      vaults: 7,
      drills: 2,
      checkIns: 40,
      savedAtMs: null,
    });
  });
});

describe('useStats with a backend', () => {
  it('shows the backend count without counting on the chain', async () => {
    fake.stats.mockResolvedValue(STATS);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStats(), { wrapper });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.summary).toMatchObject({ source: 'api', block: 2_500n, vaults: 7 }));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(impl.countStats).not.toHaveBeenCalled();
  });

  it('falls back to the chain when the backend fails, and reports the failure only while nothing shows', async () => {
    fake.stats.mockRejectedValue(new ApiError('INTERNAL', 503, 'GET /stats: HTTP 503'));
    impl.countStats.mockResolvedValue(toCache(fixtureStats(), 6));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStats(), { wrapper });
    await waitFor(() => expect(result.current.error).toMatchObject({ code: 'INTERNAL' }));
    expect(result.current.summary).toBeNull();
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(impl.cachedStats).toHaveBeenCalled());
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.summary).toMatchObject({ source: 'chain', block: 2_000n, vaults: 3 }));
    expect(result.current.error).toBeNull();
  });

  it('asks nothing on a build without a backend', async () => {
    backend.on = false;
    impl.cachedStats.mockReturnValue(toCache(fixtureStats(), 5));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useStats(), { wrapper });
    expect(result.current.loading).toBe(false);
    await waitFor(() => expect(result.current.summary).toMatchObject({ source: 'chain', checkIns: 5 }));
    expect(fake.stats).not.toHaveBeenCalled();
  });
});

describe('backend hooks', () => {
  it('asks for the vaults of an account only once there is a valid one', async () => {
    fake.me.mockResolvedValue({ address: PEOPLE.owner, block: '10', vaults: [] });
    const { wrapper } = makeWrapper();
    const { result, rerender } = renderHook(({ a }: { a: string | null }) => useMe(a), {
      wrapper,
      initialProps: { a: null as string | null },
    });
    expect(result.current.fetchStatus).toBe('idle');
    rerender({ a: 'not an address' });
    expect(result.current.fetchStatus).toBe('idle');
    rerender({ a: PEOPLE.owner });
    await waitFor(() => expect(result.current.data?.address).toBe(PEOPLE.owner));
    expect(fake.me).toHaveBeenCalledTimes(1);
    expect(fake.me.mock.calls[0][0]).toBe(PEOPLE.owner);
  });

  it('reads the health of the backend', async () => {
    fake.health.mockResolvedValue(HEALTH);
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useHealth(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(HEALTH));
  });

  it('sends a subscription, a confirmation and an unsubscription as given', async () => {
    fake.subscribe.mockResolvedValue({ ok: true });
    fake.confirm.mockResolvedValue({ ok: true, vault: PEOPLE.vault, role: 'heir' });
    fake.unsubscribe.mockResolvedValue({ ok: true });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => ({ s: useSubscribe(), c: useConfirm(), u: useUnsubscribe() }), { wrapper });
    await act(async () => {
      await result.current.s.mutateAsync(REQUEST);
      await result.current.c.mutateAsync('tok-1');
      await result.current.u.mutateAsync('tok-2');
    });
    expect(fake.subscribe).toHaveBeenCalledWith(REQUEST);
    expect(fake.confirm).toHaveBeenCalledWith('tok-1');
    expect(fake.unsubscribe).toHaveBeenCalledWith('tok-2');
    await waitFor(() => expect(result.current.c.data).toEqual({ ok: true, vault: PEOPLE.vault, role: 'heir' }));
  });

  it('stays idle without a backend, and a form fails as unavailable', async () => {
    backend.on = false;
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => ({ stats: useApiStats(), health: useHealth(), subscribe: useSubscribe() }), {
      wrapper,
    });
    expect(result.current.stats.fetchStatus).toBe('idle');
    expect(result.current.health.fetchStatus).toBe('idle');
    await act(async () => {
      await expect(result.current.subscribe.mutateAsync(REQUEST)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    });
    expect(fake.subscribe).not.toHaveBeenCalled();
    expect(fake.stats).not.toHaveBeenCalled();
  });
});
```

Run: `npm test -w apps/web -- api-hooks`
Expected: FAIL, không tìm thấy `../../src/api/hooks`.

- [ ] **Step 4: Viết `instance.ts`, `hooks.ts` và `useStats` mới**

`apps/web/src/api/instance.ts`:

```ts
import { ENV, IS_VERCEL } from '@/config/env';
import { type ApiClient, createApiClient } from './client';

/**
 * The backend of the vercel build (spec §9.6). The deweb build has none: `IS_VERCEL` folds to false there, and its
 * bundle never holds the URL (test/build/api-url.test.ts, Quyết định 30).
 */
const API: ApiClient | null = IS_VERCEL && ENV.apiUrl ? createApiClient(ENV.apiUrl) : null;

/** A function rather than the constant, so a test can stand in a fake backend or none. */
export function getApi(): ApiClient | null {
  return API;
}
```

`apps/web/src/api/hooks.ts`:

```ts
'use client';

import { skipToken, type UseMutationResult, type UseQueryResult, useMutation, useQuery } from '@tanstack/react-query';
import { CHAIN_ID } from '@/chain/hooks';
import { chainKeys } from '@/chain/keys';
import { isAddressText } from '@/lib/address';
import { type ApiClient, ApiError } from './client';
import { getApi } from './instance';
import type { ConfirmResponse, HealthResponse, MeResponse, OkResponse, StatsResponse, SubscribeRequest } from './types';

/** For forms, which the deweb build does not show (spec §5.7); a call there fails as UNAVAILABLE. */
function requireApi(): ApiClient {
  const api = getApi();
  if (!api) throw new ApiError('UNAVAILABLE', null, 'This build has no backend.');
  return api;
}

/** Counts for the home page; the backend caches them 60 s (spec §9.2). Idle without a backend. */
export function useApiStats(): UseQueryResult<StatsResponse> {
  const api = getApi();
  return useQuery({
    queryKey: chainKeys.stats(CHAIN_ID, 'api'),
    queryFn: api ? ({ signal }) => api.stats(signal) : skipToken,
    staleTime: 60_000,
  });
}

/**
 * The vaults where `account` has a role, from the backend's index (spec §5.6). The page still reads each vault on the
 * chain before it shows a state. Idle without a backend or a valid address.
 */
export function useMe(account: string | null): UseQueryResult<MeResponse> {
  const api = getApi();
  return useQuery({
    queryKey: chainKeys.me(CHAIN_ID, account ?? ''),
    queryFn: api && account && isAddressText(account) ? ({ signal }) => api.me(account, signal) : skipToken,
    staleTime: 30_000,
  });
}

/** Indexer lag, the last integrity run and the keeper, for /status/ (spec §5.8). Idle without a backend. */
export function useHealth(): UseQueryResult<HealthResponse> {
  const api = getApi();
  return useQuery({
    queryKey: chainKeys.health(CHAIN_ID),
    queryFn: api ? ({ signal }) => api.health(signal) : skipToken,
    refetchInterval: 30_000,
  });
}

/** Double opt-in: the answer is the same whether the email is known or not (spec §5.7). Never retried. */
export function useSubscribe(): UseMutationResult<OkResponse, Error, SubscribeRequest> {
  return useMutation({ mutationFn: async (req: SubscribeRequest) => requireApi().subscribe(req) });
}

/** The token comes from `#t=` of /alerts/confirm/, never from a query string (spec §9.6). */
export function useConfirm(): UseMutationResult<ConfirmResponse, Error, string> {
  return useMutation({ mutationFn: async (token: string) => requireApi().confirm(token) });
}

/** Idempotent: an unknown token answers ok as well (spec §9.6). */
export function useUnsubscribe(): UseMutationResult<OkResponse, Error, string> {
  return useMutation({ mutationFn: async (token: string) => requireApi().unsubscribe(token) });
}
```

Thay `apps/web/src/chain/use-stats.ts`:

```ts
'use client';

import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useApiStats } from '@/api/hooks';
import type { StatsResponse } from '@/api/types';
import { useKV } from '@/lib/kv';
import { useSdk } from './hooks';
import { loadChainImpl } from './load';
import type { CachedStats, Sdk } from './types';

export interface StatsSummary {
  source: 'api' | 'chain';
  block: bigint;
  vaults: number;
  drills: number;
  checkIns: number;
  /** When this device counted (chain); null when the backend's own time is not a device time. */
  savedAtMs: number | null;
}

export interface StatsState {
  summary: StatsSummary | null;
  /** The backend's count is on its way and nothing shows yet (vercel build only). */
  loading: boolean;
  progress: { done: number; total: number } | null;
  busy: boolean;
  error: unknown;
  /** Counts from the chain, resuming from the last count on this device. */
  refresh(): void;
}

export function summaryOfCache(c: CachedStats): StatsSummary {
  return {
    source: 'chain',
    block: c.stats.toBlock,
    vaults: c.stats.vaults.total,
    drills: c.stats.vaults.drill,
    checkIns: c.stats.checkIns,
    savedAtMs: c.savedAtMs,
  };
}

/** The backend's numbers (spec §9.6: decimal strings) as a summary. */
export function summaryOfApi(s: StatsResponse): StatsSummary {
  return {
    source: 'api',
    block: BigInt(s.block),
    vaults: Number(s.vaults),
    drills: Number(s.drills),
    checkIns: Number(s.checkIns),
    savedAtMs: null,
  };
}

/** The count at the higher block; on a tie the one this device made from the chain itself. */
export function freshest(a: StatsSummary | null, b: StatsSummary | null): StatsSummary | null {
  if (!a) return b;
  if (!b) return a;
  if (a.block !== b.block) return a.block > b.block ? a : b;
  return a.source === 'chain' ? a : b;
}

/**
 * The count on this device shows at once; reading the chain waits for a button (the factory's logs take many
 * requests on public RPC, 100 blocks per request on X Layer).
 */
export function useChainStats(): StatsState {
  const kv = useKV();
  const sdk = useSdk().data;
  const [cached, setCached] = useState<CachedStats | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!sdk) return;
    let live = true;
    loadChainImpl().then(
      (impl) => {
        if (live) setCached(impl.cachedStats(sdk, kv));
      },
      () => {
        // The SDK query reports a chunk that failed to load; there is nothing cached to show then.
      },
    );
    return () => {
      live = false;
    };
  }, [sdk, kv]);

  const count = useMutation({
    mutationFn: async (s: Sdk) => {
      const impl = await loadChainImpl();
      return impl.countStats(s, kv, (done, total) => setProgress({ done, total }));
    },
    onSuccess: (c) => setCached(c),
    onSettled: () => setProgress(null),
  });

  return {
    summary: cached ? summaryOfCache(cached) : null,
    loading: false,
    progress,
    busy: count.isPending,
    error: count.error,
    refresh: () => {
      if (sdk) count.mutate(sdk);
    },
  };
}

/**
 * The backend's count first on the vercel build; this device's own count wins when it is at a later block, and
 * "count from the chain" works on both builds (spec §2: the site keeps working when the backend is down). A backend
 * failure shows only while there is nothing to show.
 */
export function useStats(): StatsState {
  const chain = useChainStats();
  const api = useApiStats();
  const summary = freshest(api.data ? summaryOfApi(api.data) : null, chain.summary);
  return {
    ...chain,
    summary,
    loading: summary === null && api.isLoading,
    error: chain.error ?? (summary === null ? api.error : null),
  };
}
```

Run: `npm test -w apps/web -- api-hooks chain-hooks lazy-boundary`
Expected: PASS (api-hooks 9, chain-hooks 6, lazy-boundary 2). `chain-hooks` không mock backend: trong Vitest `NEXT_PUBLIC_TARGET` không được đặt, nên `getApi()` thật trả `null` và đường chain giữ nguyên hành vi.

- [ ] **Step 5: Viết test hỏng cho môi trường build: URL rỗng thay vì bị xoá**

Thay `apps/web/test/unit/build-env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildEnvFor } from '../../scripts/lib/build-env';

describe('build env', () => {
  it('always disables Next telemetry', () => {
    expect(buildEnvFor({}).NEXT_TELEMETRY_DISABLED).toBe('1');
  });

  it('defaults to deweb and blanks the API URL there, so that no .env file can set it', () => {
    const env = buildEnvFor({ NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1' });
    expect(env.NEXT_PUBLIC_TARGET).toBe('deweb');
    // @next/env loads a .env key only when the variable is undefined; an empty string keeps it out (Quyết định 30).
    expect(env.NEXT_PUBLIC_API_URL).toBe('');
    expect(buildEnvFor({}).NEXT_PUBLIC_API_URL).toBe('');
  });

  it('keeps the API URL for vercel, and blanks it there when unset so that only the environment sets it', () => {
    const env = buildEnvFor({
      NEXT_PUBLIC_TARGET: 'vercel',
      NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1',
    });
    expect(env.NEXT_PUBLIC_API_URL).toBe('https://x.supabase.co/functions/v1');
    expect(buildEnvFor({ NEXT_PUBLIC_TARGET: 'vercel' }).NEXT_PUBLIC_API_URL).toBe('');
  });

  it('refuses an unknown target', () => {
    expect(() => buildEnvFor({ NEXT_PUBLIC_TARGET: 'pages' })).toThrow(/vercel or deweb/);
  });

  it('removes NODE_ENV, which Next sets itself, and never mutates its input', () => {
    const base = { NODE_ENV: 'test', NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1' };
    const env = buildEnvFor(base);
    expect('NODE_ENV' in env).toBe(false);
    expect(base).toEqual({ NODE_ENV: 'test', NEXT_PUBLIC_API_URL: 'https://x.supabase.co/functions/v1' });
  });
});
```

Run: `npm test -w apps/web -- build-env`
Expected: FAIL ở hai test, `defaults to deweb and blanks the API URL there…` và `keeps the API URL for vercel, and blanks it there when unset…`, cùng thông báo `expected undefined to be ''`.

- [ ] **Step 6: Ba lớp chặn URL ở bản deweb**

Thay `apps/web/scripts/lib/build-env.ts`:

```ts
/** The environment every `next build` and `next dev` runs with (Quyết định 5, 30 and spec §2). */
export function buildEnvFor(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base, NEXT_TELEMETRY_DISABLED: '1' };
  const target = env.NEXT_PUBLIC_TARGET?.trim() || 'deweb';
  if (target !== 'vercel' && target !== 'deweb') {
    throw new Error(`NEXT_PUBLIC_TARGET must be vercel or deweb, got "${target}"`);
  }
  env.NEXT_PUBLIC_TARGET = target;
  // Never undefined: @next/env never lets a .env file set a variable that is already in the environment, even as ''
  // (processEnv checks `typeof initialEnv[key] === 'undefined'`). So a developer's .env.local cannot reach deweb, and
  // on vercel the build environment is the only source of the URL: the same one the page CSP reads (Task 15).
  if (target === 'deweb' || env.NEXT_PUBLIC_API_URL === undefined) env.NEXT_PUBLIC_API_URL = '';
  // Vitest sets NODE_ENV=test; Next picks production or development itself and warns on anything else.
  delete env.NODE_ENV;
  return env;
}
```

Trong `apps/web/next.config.mjs`, thay hai dòng

```js
  // The deweb build must never carry the backend URL (spec §2); scripts/lib/build-env.ts drops it too.
  if (target !== 'vercel') delete process.env.NEXT_PUBLIC_API_URL;
```

bằng

```js
  // Next inlines every NEXT_PUBLIC_* variable, so set the target even for a bare `next build`: src/config/env.ts
  // compares it with 'vercel', and the minifier drops the vercel-only branch from the deweb bundle.
  process.env.NEXT_PUBLIC_TARGET = target;
  // The deweb build must never carry the backend URL (spec §2). Blank, not deleted, like scripts/lib/build-env.ts,
  // which blanks it before Next starts and so also keeps .env files out (Quyết định 30).
  if (target !== 'vercel') process.env.NEXT_PUBLIC_API_URL = '';
```

Trong `apps/web/src/config/env.ts`, ở object truyền cho `readEnv` của `ENV`, thay dòng

```ts
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
```

bằng

```ts
  // Read behind the target: on deweb the comparison folds to false and the URL never reaches the bundle.
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_TARGET === 'vercel' ? process.env.NEXT_PUBLIC_API_URL : undefined,
```

Run: `npm test -w apps/web -- build-env env`
Expected: PASS (build-env 5, env 6).

- [ ] **Step 7: Test build: sentinel trong môi trường và trong file `.env`**

Thay `apps/web/test/build/paths.ts`:

```ts
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BUILD_OUT = fileURLToPath(new URL('./.out', import.meta.url));
/** In the environment of both builds; must reach only the vercel build (test/build/api-url.test.ts). */
export const API_SENTINEL = 'https://api.atropyle.invalid/functions/v1';
/** In apps/web/.env.production.local during both builds; must reach neither. */
export const DOTENV_SENTINEL = 'https://dotenv.atropyle.invalid/functions/v1';
export const outOf = (target: 'vercel' | 'deweb'): string => join(BUILD_OUT, target);
```

Thay `apps/web/test/build/global-setup.ts`:

```ts
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_DIR, buildApp, OUT_DIR } from '../../scripts/lib/run-next';
import { API_SENTINEL, BUILD_OUT, DOTENV_SENTINEL, outOf } from './paths';

/** The file Next reads first in a production build; a developer's copy is the likeliest leak into deweb. */
const DOTENV = join(APP_DIR, '.env.production.local');

/** Two real production builds; ATROPYLE_REUSE_BUILD=1 reuses the last ones for a quick rerun. */
export default async function setup(): Promise<void> {
  if (process.env.ATROPYLE_REUSE_BUILD === '1' && existsSync(outOf('vercel')) && existsSync(outOf('deweb'))) return;
  if (existsSync(DOTENV)) {
    throw new Error(`${DOTENV} exists. The build test writes its own and never touches yours: move it away first.`);
  }
  rmSync(BUILD_OUT, { recursive: true, force: true });
  writeFileSync(DOTENV, `NEXT_PUBLIC_API_URL=${DOTENV_SENTINEL}\n`, { flag: 'wx' });
  try {
    for (const target of ['vercel', 'deweb'] as const) {
      // Typed: spreading process.env next to other keys drops its index signature, and `delete` needs it.
      const env: NodeJS.ProcessEnv = { ...process.env, NEXT_PUBLIC_TARGET: target, NEXT_PUBLIC_API_URL: API_SENTINEL };
      delete env.ATROPYLE_E2E;
      const r = await buildApp({ env, quiet: true });
      if (r.code !== 0) throw new Error(`next build (${target}) failed:\n${r.output}`);
      cpSync(OUT_DIR, outOf(target), { recursive: true });
    }
  } finally {
    rmSync(DOTENV, { force: true });
  }
}
```

`apps/web/test/build/api-url.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_SENTINEL, DOTENV_SENTINEL, outOf } from './paths';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** Every file of a build whose bytes contain `needle`, relative to the build. */
function holders(target: 'vercel' | 'deweb', needle: string): string[] {
  const out = outOf(target);
  return files(out)
    .filter((f) => readFileSync(f).includes(needle))
    .map((f) => relative(out, f).replaceAll('\\', '/'));
}

describe('backend URL', () => {
  it('the deweb build never contains the API url', () => {
    // Both sentinels live under this host: the build environment's and the .env.production.local file's.
    expect(holders('deweb', 'atropyle.invalid')).toEqual([]);
  });

  it('the vercel build carries the URL of its build environment and ignores a .env file', () => {
    expect(holders('vercel', API_SENTINEL).length).toBeGreaterThan(0);
    expect(holders('vercel', DOTENV_SENTINEL)).toEqual([]);
  });
});
```

Run: `npm run test:build -w apps/web`
Expected: PASS, trong đó có `the deweb build never contains the API url` và `the vercel build carries the URL of its build environment and ignores a .env file`; sau khi chạy, `apps/web/.env.production.local` không còn (`git status` sạch ở `apps/web`). Test này không có bước đỏ chắc chắn: lớp của Task 2 (xoá biến trong `next.config.mjs`) có thể đã đủ cho đúng tình huống này, còn ba lớp của Step 6 chặn thêm `next build` gọi trực tiếp, process con của Next và nhánh đọc trong mã.

Kiểm tra tuỳ chọn (thêm vài phút build): tạm xoá dòng `if (target === 'deweb' || env.NEXT_PUBLIC_API_URL === undefined) env.NEXT_PUBLIC_API_URL = '';` trong `build-env.ts` và dòng `if (target !== 'vercel') process.env.NEXT_PUBLIC_API_URL = '';` trong `next.config.mjs`, đổi dòng của `env.ts` về `NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,`, rồi chạy lại `npm run test:build -w apps/web`. Expected: `the deweb build never contains the API url` FAIL và liệt kê các file JS chứa `atropyle.invalid`. Hoàn lại cả ba chỗ.

- [ ] **Step 8: Chạy toàn bộ và commit**

```bash
npm test -w apps/web
npm run typecheck -w apps/web
npx biome ci .
npm run test:build -w apps/web
git add apps/web/src/api/types.ts apps/web/src/api/client.ts apps/web/src/api/instance.ts apps/web/src/api/hooks.ts apps/web/src/chain/use-stats.ts apps/web/src/chain/query-client.ts apps/web/src/config/env.ts apps/web/scripts/lib/build-env.ts apps/web/next.config.mjs apps/web/test/build/paths.ts apps/web/test/build/global-setup.ts apps/web/test/build/api-url.test.ts apps/web/test/unit/build-env.test.ts apps/web/test/unit/api-client.test.ts apps/web/test/unit/api-hooks.test.tsx
git commit -m "feat(web): backend client for the vercel build, stats from the API first, and no backend URL in the deweb build" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: mọi test PASS; typecheck và Biome sạch; `git status` không còn file `.env*` mới trong `apps/web`.

---

### Task 15: Gia cố: CSP theo hash, header Vercel, e2e có axe trên anvil, ngân sách kích thước và Lighthouse

Task cuối biến các cổng chất lượng của spec §8 và §11 thành lệnh chạy được trong CI. `buildApp` thêm bước postbuild: mỗi trang nhận một thẻ `<meta>` CSP chứa SHA-256 của từng script inline của chính trang đó (Quyết định 12), còn `vercel.json` gửi kèm những directive mà thẻ meta không mang được. E2E chạy bản build deweb trên anvil với ví giả của web cũ, phục vụ bằng đúng header của Vercel; mỗi test tự fail khi trang gọi ra ngoài (badge "100% on-chain"), khi có vi phạm CSP hoặc khi trang ném lỗi. `size-limit` đo JS lần tải đầu của từng route, Lighthouse chạy cục bộ trên bản production (Quyết định 24 và 31).

Theo spec §18:
- e2e và axe đổi theme bằng lựa chọn đã lưu (R18.17);
- ảnh duyệt thiết kế theo ma trận ba ảnh mỗi màn hình (R18.13);
- một spec tắt JavaScript giữ lời hứa "lần vẽ đầu là bố cục cuối";
- Lighthouse có cổng request bị cấm cho Plan 7C (R18.18).

**Files:**
- Create: `apps/web/scripts/lib/csp.ts`, `apps/web/scripts/lib/site-headers.ts`, `apps/web/scripts/lib/lighthouse-score.ts`, `apps/web/scripts/lighthouse.ts`, `apps/web/vercel.json`, `apps/web/.size-limit.mjs`, `apps/web/playwright.config.ts`, `apps/web/public/robots.txt`, `apps/web/src/app/icon.svg`, `apps/web/README.md`
- Create (e2e mới): `apps/web/test/e2e/{global-setup,network,fixtures,helpers,screens}.ts`, `apps/web/test/e2e/{shell,legacy,wallet,motion,csp,worker,nojs}.spec.ts`
- Create (chép nguyên văn từ `apps/web-legacy/test/e2e/`): `apps/web/test/e2e/state.ts`, `apps/web/test/e2e/wallet.ts`, `apps/web/test/e2e/offchain.spec.ts`
- Modify: `apps/web/scripts/lib/run-next.ts` (bước CSP trong `buildApp`), `apps/web/scripts/lib/static-server.ts` (nén gzip), `apps/web/test/unit/static-server.test.ts`, `apps/web/package.json`, `package-lock.json`, `.gitignore`, `biome.json`, `.github/workflows/ci.yml` (thay job `web-next`), `scripts/test/site/ci-web-next.test.ts` (thay toàn bộ), `AGENTS.md`, `docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md` (§16 hàng 17)
- Test: `apps/web/test/unit/csp.test.ts`, `apps/web/test/unit/vercel-config.test.ts`, `apps/web/test/unit/lighthouse-score.test.ts`, `apps/web/test/unit/icon.test.tsx`, `apps/web/test/build/csp.test.ts`, `apps/web/test/build/html-purity.test.ts`, các file `apps/web/test/e2e/*.spec.ts`
- Chỉ khi Step 7 ra Kết quả B: Create `apps/web/src/shell/nav-link.tsx`, `apps/web/test/unit/nav-link.test.tsx`; Modify `apps/web/src/motion/view-transition.tsx` (thêm `withPendingViewTransition`), `apps/web/src/shell/{nav-list,footer,header}.tsx` (`Link` thành `NavLink`), `apps/web/test/unit/shell.test.tsx` (mock `useRouter`)

**Interfaces:**
- Consumes:
  - Task 2: `buildApp`, `runNext`, `APP_DIR`, `OUT_DIR`, `NEXT_BIN`, `BUNDLER_FLAGS`, `RunOptions`, `buildEnvFor`, `startStaticServer`, `outOf`, trang `e2e/worker`, job CI `web-next`.
  - Task 3: marker `/* tokens:dark */` của `globals.css` (`--atro-bg`, `--atro-thread`), mà `icon.test.tsx` đọc (Step 4).
  - Task 5: `KEYS` của `src/lib/store.ts`.
  - Task 6: `withViewTransition` và `SharedThread`.
  - Task 7: quầng `<svg data-layer="glow">` có `thread-pulse`.
  - Task 9 (bản viết lại theo §18.4.1):
    - nút `Skip to content`, `Settings`, `Menu`, link `Atropyle home`;
    - nhãn theme `Night`/`Vellum`/`Match device`;
    - night không có thuộc tính `data-theme`, vellum là `data-theme="light"`;
    - tiêu đề hero và 404;
    - trang 404 chỉ in đường dẫn trong `<code>` sau khi mount;
    - CTA `/create/#drill` và `/proof/`;
    - dòng bằng chứng `data-testid="proof-line"`, có keccak rút gọn trỏ tới `/proof/` và chữ "unaudited" ở cả hai bề rộng;
    - footer có "No trackers", link `/proof/#limits` và `/verify/`;
    - glyph `mark` (`StateGlyph name="mark"`), mà `icon.svg` vẽ lại (Step 4);
    - `legacyTarget`.
  - Task 11: nhãn ví `Connect wallet`, `Choose a wallet`, `Wallet {account}`, `Disconnect`, `network-banner`, `Switch to {expected}`.
  - Task 12: hàng `worker-smoke` và `worker-verify`.
  - Task 14: `build-env` không để file `.env` đặt URL API.
  - Từ gốc repo:
    - `scripts/lib/anvil.ts`: `startAnvil`, `ANVIL_ACCOUNTS`, `rpc`;
    - `scripts/lib/onchain-check.ts`: `RPC_HOSTS`, `scanSite`;
    - `scripts/lib/site-files.ts`: `walkSite`, `contentTypeOf`;
    - `scripts/e2e-devnet-prep.ts`;
    - `deployments/xlayer.json` (`circuits.netlistKeccak.policy`).
- Produces:
  - `scripts/lib/csp.ts`: `XLAYER_RPC_ORIGINS`, `LOCAL_RPC_ORIGINS`, `interface CspEnv`, `rpcOrigins(chain, deploymentJson): string[]`, `apiOrigin(target, apiUrl): string | null`, `connectOrigins(env: CspEnv): string[]`, `inlineScripts(html: string): string[]`, `scriptHash(text: string): string`, `buildCsp(o: { scriptHashes: readonly string[]; connect: readonly string[] }): string`, `withCsp(html: string, csp: string): string`, `applyCsp(outDir: string, env: CspEnv): number`.
  - `scripts/lib/run-next.ts`: `buildApp` chèn CSP sau `next build` (trả `code: 1` khi `out/` không có trang HTML).
  - `scripts/lib/static-server.ts`: chữ ký giữ nguyên; text (HTML, JS, CSS, JSON, SVG) được gzip khi request có `accept-encoding: gzip`, mọi response có `vary: accept-encoding`.
  - `scripts/lib/site-headers.ts`: `VERCEL_JSON`, `siteHeaders(json?: string): Record<string, string>`.
  - `scripts/lib/lighthouse-score.ts`:
    - `LIGHTHOUSE_ROUTES: readonly string[]` (`['/']`; 7B thêm `/create/`, 7C T3 thêm `/proof/`, không ghi đè mảng);
    - `CATEGORIES`, `THRESHOLDS`, `interface Run`;
    - `interface LhrLike` (audit có thêm `details?: unknown`);
    - `FORBIDDEN_REQUESTS: Readonly<Record<string, readonly (string | RegExp)[]>>` (rỗng ở 7A; 7C T6 điền cho `/`, R18.18);
    - `runOf(lhr: LhrLike): Run`, `medianRun(runs: readonly Run[]): Run`, `failures(r: Run): string[]`;
    - `forbiddenRequests(lhr: LhrLike, patterns: readonly (string | RegExp)[]): string[]`.
  - `test/e2e/fixtures.ts`: `test` (fixture `state`, `requests`, `cspViolations`, `deployment`, `atro`, `wallet`, `page` có ba lưới chặn), `expect`, `ANVIL`, `interface CspViolation`.
  - `test/e2e/helpers.ts`:
    - `AXE_TAGS`;
    - `type E2ETheme = 'dark' | 'light'`, `type E2ELang = 'en' | 'vi'`;
    - `settle(page)` (bỏ qua animation theo cuộn, R15);
    - `runningAnimations(page): Promise<string[]>`;
    - `expectAccessible(page)`;
    - `setStoredTheme(page, theme: E2ETheme)`, `setStoredLang(page, lang: E2ELang)`;
    - `expectAccessibleInBothThemes(page, ready?: Locator)` (vellum rồi night, mỗi theme một lần tải lại, R18.17);
    - `openSettings(page): Promise<Locator>`, `connectWallet(page, name?)`.
  - `test/e2e/screens.ts`:
    - `interface Shot { theme: E2ETheme; lang: E2ELang; width: number }`;
    - `SCREEN_MATRIX`, `VELLUM_MATRIX` (R18.13);
    - `shouldCapture(projectName: string): boolean`;
    - `captureScreens(page, name, o?: { vellum?: boolean }): Promise<void>`.
  - `test/e2e/nojs.spec.ts`: mảng `PAGES` gồm `{ path, content(page) }`, kèm `expectFrame(page)` chung cho mọi trang. 7B T12 thêm `verify/`, 7C T3 thêm `proof/`.
  - Chỉ khi ra Kết quả B:
    - `src/shell/nav-link.tsx`: `NavLink(props: Omit<ComponentProps<typeof Link>, 'href'> & { href: string })`;
    - `src/motion/view-transition.tsx` thêm `withPendingViewTransition(update: () => void, committed: Promise<void>, maxMs?: number): void`.
  - Lệnh: `npm run e2e|size|lighthouse -w apps/web`.

- [ ] **Step 1: Cài gói, thêm lệnh và bỏ qua thư mục đo kích thước**

```bash
npm install -E -D -w apps/web @axe-core/playwright@4.14.0 size-limit@14.3.0 @size-limit/file@14.3.0 lighthouse@13.6.0 chrome-launcher@1.2.3
npm run lockfile:check -- --fix
npm run lockfile:check
npm pkg set scripts.e2e="playwright test" scripts.size="size-limit" scripts.lighthouse="tsx scripts/lighthouse.ts" -w apps/web
npm pkg get scripts -w apps/web
```

Expected: `every dependency resolves.`; `npm pkg get` in ra thêm `"e2e": "playwright test"`, `"size": "size-limit"`, `"lighthouse": "tsx scripts/lighthouse.ts"`. Không gói nào tải trình duyệt khi cài: Lighthouse và chrome-launcher dùng Chromium mà `npm run playwright:install -w apps/web` đã cài; Lighthouse qua Node API chỉ gửi báo lỗi khi được truyền `enableErrorReporting`, script của task này không truyền.

Thêm vào cuối `.gitignore` ở gốc:

```gitignore
apps/web/.size/
```

Thêm vào mảng `files.includes` của `biome.json`, ngay sau dòng `"!apps/web/lighthouse-report"` (nhớ dấu phẩy ở dòng trước):

```json
      "!apps/web/.size"
```

- [ ] **Step 2: Viết test hỏng cho CSP**

`apps/web/test/unit/csp.test.ts`:

```ts
// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDeployment } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import {
  apiOrigin,
  applyCsp,
  buildCsp,
  connectOrigins,
  inlineScripts,
  rpcOrigins,
  scriptHash,
  withCsp,
  XLAYER_RPC_ORIGINS,
} from '../../scripts/lib/csp';

describe('csp', () => {
  it('hashes a script the way browsers do: SHA-256 of its UTF-8 text, base64', () => {
    expect(scriptHash('')).toBe("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
    expect(scriptHash('abc')).toBe("'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='");
    expect(scriptHash('alert("Ví")')).toBe("'sha256-hZIhXqlBP0tpUDcF8iB1nx6q2uQEGsvuP2dxYTRoCrg='");
  });

  it('reads every inline script, skips scripts with a src, and normalizes newlines like the HTML parser', () => {
    const html =
      '<head><script src="/_next/a.js" async=""></script><script>self.__next_f=[]</script></head>' +
      '<body><script data-src="x" id="b">a()</script><SCRIPT type="module">b()</SCRIPT ><script>c(1,\r\n2)\r</script></body>';
    expect(inlineScripts(html)).toEqual(['self.__next_f=[]', 'a()', 'b()', 'c(1,\n2)\n']);
  });

  it('takes RPC origins from the deployment JSON, else from the chain', () => {
    const json = JSON.stringify({
      rpcUrls: ['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com/'],
      quorumRpcUrls: [['https://rpc.xlayer.tech'], ['https://xlayer.drpc.org']],
    });
    expect(rpcOrigins('xlayer', json)).toEqual([
      'https://rpc.xlayer.tech',
      'https://xlayerrpc.okx.com',
      'https://xlayer.drpc.org',
    ]);
    expect(rpcOrigins('local', undefined)).toEqual(['http://127.0.0.1:8545']);
    expect(rpcOrigins(undefined, ' ')).toEqual([...XLAYER_RPC_ORIGINS]);
  });

  it('covers every RPC of the SDK deployment of X Layer', () => {
    const d = getDeployment('xlayer');
    for (const url of [...d.rpcUrls, ...d.quorumRpcUrls.flat()]) {
      expect(XLAYER_RPC_ORIGINS).toContain(new URL(url).origin);
    }
  });

  it('lets only the vercel build reach the backend, and only over https', () => {
    const url = 'https://abc.supabase.co/functions/v1';
    expect(apiOrigin('vercel', url)).toBe('https://abc.supabase.co');
    expect(apiOrigin('deweb', url)).toBeNull();
    expect(apiOrigin(undefined, url)).toBeNull();
    expect(apiOrigin('vercel', 'http://abc.supabase.co/functions/v1')).toBeNull();
    expect(apiOrigin('vercel', 'not a url')).toBeNull();
    expect(apiOrigin('vercel', '')).toBeNull();
    expect(
      connectOrigins({ NEXT_PUBLIC_TARGET: 'vercel', NEXT_PUBLIC_API_URL: url, NEXT_PUBLIC_CHAIN: 'local' }),
    ).toEqual(['http://127.0.0.1:8545', 'https://abc.supabase.co']);
    expect(
      connectOrigins({ NEXT_PUBLIC_TARGET: 'deweb', NEXT_PUBLIC_API_URL: url, NEXT_PUBLIC_CHAIN: 'local' }),
    ).toEqual(['http://127.0.0.1:8545']);
  });

  it('builds the policy of Quyết định 12', () => {
    expect(
      buildCsp({ scriptHashes: ["'sha256-a'", "'sha256-a'", "'sha256-b'"], connect: ['https://rpc.xlayer.tech'] }),
    ).toBe(
      "default-src 'self'; script-src 'self' 'sha256-a' 'sha256-b'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; font-src 'self'; connect-src 'self' https://rpc.xlayer.tech; worker-src 'self'; " +
        "manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'",
    );
  });

  it('puts the policy right after the charset, before any script, and only once', () => {
    const html = '<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><script>x()</script></head></html>';
    const out = withCsp(html, "default-src 'self'");
    expect(out).toBe(
      '<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/>' +
        `<meta http-equiv="Content-Security-Policy" content="default-src 'self'"/><script>x()</script></head></html>`,
    );
    expect(withCsp('<html><head class="a"><script>x()</script></head></html>', "default-src 'self'")).toBe(
      `<html><head class="a"><meta http-equiv="Content-Security-Policy" content="default-src 'self'"/><script>x()</script></head></html>`,
    );
    expect(() => withCsp(out, "default-src 'self'")).toThrow(/already has/);
    expect(() => withCsp('<p>no head</p>', "default-src 'self'")).toThrow(/no <head>/);
    expect(() => withCsp('<head></head>', 'default-src "self"')).toThrow(/escaping/);
  });

  it('gives every page of a build the hashes of its own inline scripts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atropyle-csp-'));
    mkdirSync(join(dir, 'x'));
    writeFileSync(join(dir, 'index.html'), '<html><head><meta charset="utf-8"><script>a()</script></head></html>');
    writeFileSync(join(dir, 'x', 'index.html'), '<html><head><script>b()</script></head></html>');
    writeFileSync(join(dir, 'x', 'index.txt'), '<script>c()</script>');
    const env = { NEXT_PUBLIC_TARGET: 'vercel', NEXT_PUBLIC_API_URL: 'https://api.example.test/functions/v1' };
    expect(applyCsp(dir, env)).toBe(2);
    const home = readFileSync(join(dir, 'index.html'), 'utf8');
    expect(home).toContain(scriptHash('a()'));
    expect(home).not.toContain(scriptHash('b()'));
    expect(home).toContain('https://xlayer.drpc.org https://api.example.test; worker-src');
    expect(readFileSync(join(dir, 'x', 'index.html'), 'utf8')).toContain(scriptHash('b()'));
    expect(readFileSync(join(dir, 'x', 'index.txt'), 'utf8')).toBe('<script>c()</script>');
    expect(() => applyCsp(dir, env)).toThrow(/already has/);
  });
});
```

Run: `npm test -w apps/web -- csp`
Expected: FAIL, không tìm thấy `../../scripts/lib/csp`.

- [ ] **Step 3: Viết `csp.ts`**

`apps/web/scripts/lib/csp.ts`:

```ts
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** X Layer RPC origins the app may call: the two OKX nodes, and dRPC for the opt-in cross-check (web v1, Plan 4). */
export const XLAYER_RPC_ORIGINS: readonly string[] = [
  'https://rpc.xlayer.tech',
  'https://xlayerrpc.okx.com',
  'https://xlayer.drpc.org',
];

/** `npm run devnet` listens here, like the SDK's built-in local deployment. */
export const LOCAL_RPC_ORIGINS: readonly string[] = ['http://127.0.0.1:8545'];

/** The build variables the policy depends on; a NodeJS.ProcessEnv fits. */
export interface CspEnv {
  NEXT_PUBLIC_TARGET?: string;
  NEXT_PUBLIC_CHAIN?: string;
  NEXT_PUBLIC_DEPLOYMENT?: string;
  NEXT_PUBLIC_API_URL?: string;
}

/** The origin of every RPC URL in the deployment JSON; without one, the RPCs of the SDK deployment of the chain. */
export function rpcOrigins(chain: string | undefined, deploymentJson: string | undefined): string[] {
  if (deploymentJson?.trim()) {
    const d = JSON.parse(deploymentJson) as { rpcUrls?: unknown; quorumRpcUrls?: unknown };
    const groups = Array.isArray(d.quorumRpcUrls) ? (d.quorumRpcUrls as unknown[]).flat() : [];
    const urls: unknown[] = [...(Array.isArray(d.rpcUrls) ? d.rpcUrls : []), ...groups];
    return [...new Set(urls.filter((u): u is string => typeof u === 'string').map((u) => new URL(u).origin))];
  }
  return chain?.trim() === 'local' ? [...LOCAL_RPC_ORIGINS] : [...XLAYER_RPC_ORIGINS];
}

/** The backend origin: only in the vercel build, and only over https (spec §8). */
export function apiOrigin(target: string | undefined, apiUrl: string | undefined): string | null {
  const raw = apiUrl?.trim();
  if (target?.trim() !== 'vercel' || !raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' ? u.origin : null;
  } catch {
    return null;
  }
}

/** Every origin the pages of this build may fetch from, besides their own. */
export function connectOrigins(env: CspEnv): string[] {
  const api = apiOrigin(env.NEXT_PUBLIC_TARGET, env.NEXT_PUBLIC_API_URL);
  return [...rpcOrigins(env.NEXT_PUBLIC_CHAIN, env.NEXT_PUBLIC_DEPLOYMENT), ...(api ? [api] : [])];
}

// A <script> without a src attribute; `\s` before src, so that data-src="…" does not count as one.
const INLINE_SCRIPT = /<script\b(?![^>]*\ssrc\s*=)[^>]*>([\s\S]*?)<\/script\s*>/gi;

/**
 * The text of every inline <script> of a page, in order, with CR LF and lone CR turned into LF: the HTML parser does
 * that before the browser hashes a script, so a page built on Windows still matches its policy.
 */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(INLINE_SCRIPT)].map((m) => m[1].replace(/\r\n?/g, '\n'));
}

/** The CSP source of one inline script: SHA-256 of its UTF-8 text, in base64. */
export function scriptHash(text: string): string {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/** Quyết định 12: the policy of one page. frame-ancestors only works in a header, so vercel.json carries it. */
export function buildCsp(o: { scriptHashes: readonly string[]; connect: readonly string[] }): string {
  return [
    "default-src 'self'",
    ['script-src', "'self'", ...new Set(o.scriptHashes)].join(' '),
    // Prerendered HTML carries style attributes (the first frame of motion, avatar colours) that no hash can cover.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    ['connect-src', "'self'", ...new Set(o.connect)].join(' '),
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

const META_CSP = /<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy/i;
const CHARSET = /<meta\s+charset\s*=\s*["']?utf-8["']?\s*\/?>/i;
const HEAD = /<head\b[^>]*>/i;

/** The page with its policy first in <head>, right after the charset, so that it governs every script below. */
export function withCsp(html: string, csp: string): string {
  if (/["<>&]/.test(csp)) throw new Error('a policy must not need escaping inside an HTML attribute');
  if (META_CSP.test(html)) throw new Error('the page already has a Content-Security-Policy meta tag');
  const at = CHARSET.exec(html) ?? HEAD.exec(html);
  if (!at) throw new Error('the page has no <head>');
  const end = at.index + at[0].length;
  return `${html.slice(0, end)}<meta http-equiv="Content-Security-Policy" content="${csp}"/>${html.slice(end)}`;
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(path);
    return e.name.endsWith('.html') ? [path] : [];
  });
}

/** After `next build` (run-next.ts): each page gets a meta policy with the hashes of its own inline scripts. */
export function applyCsp(outDir: string, env: CspEnv): number {
  const connect = connectOrigins(env);
  const pages = htmlFiles(outDir);
  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    writeFileSync(page, withCsp(html, buildCsp({ scriptHashes: inlineScripts(html).map(scriptHash), connect })));
  }
  return pages.length;
}
```

Run: `npm test -w apps/web -- csp`
Expected: PASS (8 test).

- [ ] **Step 4: `buildApp` chèn CSP; test build cho CSP và cho HTML của bản deweb**

Sửa `apps/web/scripts/lib/run-next.ts`. Không thay cả file: `BUNDLER_FLAGS` giữ đúng giá trị mà spike của Task 2 (hoặc test font của Task 4) đã chốt. Thêm import ngay sau dòng `import { buildEnvFor } from './build-env';`:

```ts
import { applyCsp } from './csp';
```

Thay hàm `buildApp` cùng comment của nó:

```ts
/** `next build` into out/, then the postbuild steps (Task 15 adds the CSP). */
export async function buildApp(o: RunOptions = {}): Promise<{ code: number; output: string }> {
  return runNext('build', o);
}
```

bằng:

```ts
/** `next build` into out/, then the postbuild step: a hashed CSP in every page (Quyết định 12). */
export async function buildApp(o: RunOptions = {}): Promise<{ code: number; output: string }> {
  const built = await runNext('build', o);
  if (built.code !== 0) return built;
  // The environment `next build` ran with, so that connect-src matches the bundle (Task 14 keeps .env files out).
  const pages = applyCsp(OUT_DIR, buildEnvFor(o.env ?? process.env));
  const line =
    pages > 0 ? `csp: ${pages} pages carry a hashed Content-Security-Policy\n` : 'csp: out/ has no HTML page\n';
  if (!o.quiet) process.stdout.write(line);
  return { code: pages > 0 ? 0 : 1, output: built.output + line };
}
```

`apps/web/test/build/csp.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inlineScripts, scriptHash } from '../../scripts/lib/csp';
import { outOf } from './paths';

const META = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"\/>/g;

function pages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return pages(path);
    return e.name.endsWith('.html') ? [path] : [];
  });
}

function policies(html: string): { csp: string; at: number }[] {
  return [...html.matchAll(META)].map((m) => ({ csp: m[1], at: m.index ?? -1 }));
}

/** The sources of one directive of a policy. */
function sources(csp: string, directive: string): string[] {
  const found = csp
    .split(';')
    .map((d) => d.trim().split(/\s+/))
    .find(([name]) => name === directive);
  return found ? found.slice(1) : [];
}

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} build`, () => {
    const out = outOf(target);
    const files = pages(out);

    it('every page carries exactly one policy, before its first script', () => {
      expect(files.length).toBeGreaterThanOrEqual(2);
      for (const file of files) {
        const html = readFileSync(file, 'utf8');
        const found = policies(html);
        expect(found, relative(out, file)).toHaveLength(1);
        const firstScript = html.search(/<script\b/i);
        if (firstScript !== -1) expect(found[0].at, relative(out, file)).toBeLessThan(firstScript);
      }
    });

    it('lets each page run its own inline scripts and nothing else', () => {
      for (const file of files) {
        const html = readFileSync(file, 'utf8');
        const scripts = sources(policies(html)[0].csp, 'script-src');
        expect(scripts[0], relative(out, file)).toBe("'self'");
        for (const s of scripts.slice(1)) expect(s, relative(out, file)).toMatch(/^'sha256-[A-Za-z0-9+/]{43}='$/);
        for (const text of inlineScripts(html)) expect(scripts, relative(out, file)).toContain(scriptHash(text));
      }
    });
  });
}

describe('connect-src', () => {
  const home = (target: 'vercel' | 'deweb'): string =>
    policies(readFileSync(join(outOf(target), 'index.html'), 'utf8'))[0].csp;

  it('reaches the backend only from the vercel build', () => {
    expect(sources(home('vercel'), 'connect-src')).toContain('https://api.atropyle.invalid');
    expect(home('deweb')).not.toContain('atropyle.invalid');
  });

  it('allows the OKX nodes of X Layer in both builds', () => {
    for (const target of ['vercel', 'deweb'] as const) {
      expect(sources(home(target), 'connect-src')).toEqual(
        expect.arrayContaining(['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com']),
      );
    }
  });
});
```

`apps/web/test/build/html-purity.test.ts` (Review Focus 5):

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanSite } from '../../../../scripts/lib/onchain-check.ts';
import { contentTypeOf, walkSite } from '../../../../scripts/lib/site-files.ts';
import { outOf } from './paths';

describe('deweb build', () => {
  it('deweb HTML has no external attribute', () => {
    // The gateway's own static check (Quyết định 16): any src, href, action, srcset or CSS url() that leaves the
    // site costs the "100% on-chain" badge. The meta CSP lists RPC origins inside `content`, which it never reads.
    const root = outOf('deweb');
    const files = new Map(
      walkSite(root).map((path) => [path, { bytes: readFileSync(join(root, path)), contentType: contentTypeOf(path) }]),
    );
    expect(files.size).toBeGreaterThan(0);
    expect(scanSite(files).external).toEqual([]);
  });
});
```

`apps/web/public/robots.txt` (Lighthouse SEO đòi một file hợp lệ; không có dòng `Sitemap`, vì nó cần URL tuyệt đối của một domain chưa chốt):

```text
User-agent: *
Allow: /
```

`apps/web/test/unit/icon.test.tsx`:

```tsx
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StateGlyph } from '../../src/thread/glyphs';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const ICON = read('../../src/app/icon.svg');

/** The `d` of every `<path>`, in document order. */
const paths = (svg: string) => [...svg.matchAll(/<path\b[^>]*?\sd="([^"]*)"/g)].map((m) => m[1]);

/** The attribute `name` of the first `<tag>`. */
const attr = (svg: string, tag: string, name: string) =>
  svg.match(new RegExp(`<${tag}\\b[^>]*?\\s${name}="([^"]*)"`))?.[1];

/** A night colour: the first rule after the `tokens:dark` marker of globals.css, read as contrast.test.ts reads it. */
function night(token: string): string {
  const css = read('../../src/app/globals.css');
  const at = css.indexOf('/* tokens:dark */');
  if (at < 0) throw new Error('marker tokens:dark not found');
  const first = css.indexOf('--atro-', at);
  const block = css.slice(first, css.indexOf('}', first));
  const value = block.match(new RegExp(`--atro-${token}:\\s*(#[0-9a-fA-F]{6})\\s*;`))?.[1];
  if (!value) throw new Error(`--atro-${token} not found after tokens:dark`);
  return value.toLowerCase();
}

describe('icon.svg', () => {
  it('draws the mark of the Wordmark: one stroke, the same path, the same 24 × 24 box', () => {
    const glyph = renderToString(<StateGlyph name="mark" />);
    expect(paths(ICON)).toHaveLength(1);
    expect(paths(ICON)).toEqual(paths(glyph));
    expect(attr(ICON, 'svg', 'viewBox')).toBe(attr(glyph, 'svg', 'viewBox'));
  });

  it('paints the night colours itself and refers to nothing outside the file', () => {
    // A favicon has no page around it: currentColor would be black, and any reference would be a request.
    expect(attr(ICON, 'rect', 'fill')?.toLowerCase()).toBe(night('bg'));
    expect(attr(ICON, 'path', 'stroke')?.toLowerCase()).toBe(night('thread'));
    expect(ICON).not.toMatch(/currentColor|href|url\(|<(image|use|script|style|foreignObject)\b/i);
    expect(ICON.match(/[a-z]+:\/\/[^\s"']+/gi)).toEqual(['http://www.w3.org/2000/svg']);
  });
});
```

Run: `npm test -w apps/web -- icon`
Expected: FAIL, `ENOENT: no such file or directory` cho `src/app/icon.svg`: file chưa có.

`apps/web/src/app/icon.svg` (glyph `mark` của `Wordmark`, Task 9, trong cùng hộp 24 × 24; màu `bg` và `thread` của night; không có icon thì Chrome xin `/favicon.ico` và nhận 404 trong console, làm hỏng Best Practices):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <rect width="24" height="24" rx="6" fill="#0b0d12"/>
  <path d="M2 18c2.5 0 4.5-1 4.5-4v-3a5.5 5.5 0 0 1 11 0v3c0 3 2 4 4.5 4" fill="none" stroke="#e8b65a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Run: `npm test -w apps/web -- icon`
Expected: PASS (2 test).

Run: `npm run build && npm test -w apps/web && npm run test:build -w apps/web`
Expected: PASS. Output của `npm test` có `icon.test.tsx` (2 test); output của `test:build` có `csp.test.ts` (6 test), `html-purity.test.ts` (1 test) cùng các test của Task 2 đến Task 14. Nếu `deweb HTML has no external attribute` FAIL, dòng lỗi chỉ ra file và URL: một `<a href="https://…">` lọt vào HTML prerender nghĩa là có chỗ dùng thẳng `<a>` thay cho `ExternalLink` (Quyết định 16); sửa chỗ đó, không nới test.

- [ ] **Step 5: Test hỏng cho `vercel.json`, rồi viết nó cùng `site-headers.ts`**

`apps/web/test/unit/vercel-config.test.ts`:

```ts
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { siteHeaders, VERCEL_JSON } from '../../scripts/lib/site-headers';

interface Rule {
  source: string;
  headers: { key: string; value: string }[];
}
interface VercelConfig {
  framework: unknown;
  installCommand: string;
  buildCommand: string;
  outputDirectory: string;
  trailingSlash: boolean;
  headers: Rule[];
}

const raw = readFileSync(VERCEL_JSON, 'utf8');
const config = JSON.parse(raw) as VercelConfig;

describe('vercel.json', () => {
  it('installs and builds from the monorepo root, the SDK first, the vercel target into out/', () => {
    expect(config.framework).toBeNull();
    expect(config.installCommand).toBe('cd ../.. && npm ci');
    expect(config.buildCommand).toBe(
      'cd ../.. && npm run build && NEXT_PUBLIC_TARGET=vercel npm run build -w apps/web',
    );
    expect(config.outputDirectory).toBe('out');
    expect(config.trailingSlash).toBe(true);
  });

  it('sends only the directives a meta policy cannot carry, so the hashed meta CSP still decides scripts', () => {
    // A header with default-src or script-src would block the inline scripts it cannot hash (Quyết định 12).
    expect(siteHeaders()['content-security-policy']).toBe(
      "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
    );
  });

  it('hardens every page and caches hashed assets for a year', () => {
    expect(siteHeaders()).toEqual({
      'content-security-policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'cross-origin-opener-policy': 'same-origin',
    });
    expect(config.headers.find((h) => h.source === '/_next/static/(.*)')?.headers).toEqual([
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ]);
  });

  it('holds no secret and no backend URL: those live in the Vercel project settings', () => {
    expect(raw).not.toMatch(/supabase|NEXT_PUBLIC_API_URL|token|secret|password/i);
  });

  it('refuses a config without a rule for every page', () => {
    expect(() => siteHeaders('{"headers":[]}')).toThrow(/no header rule/);
  });
});
```

Run: `npm test -w apps/web -- vercel-config`
Expected: FAIL, không tìm thấy `../../scripts/lib/site-headers`.

`apps/web/scripts/lib/site-headers.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const VERCEL_JSON = fileURLToPath(new URL('../../vercel.json', import.meta.url));

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/**
 * The headers vercel.json sends with every page (its rule for "/(.*)"), keys in lower case. The local servers of e2e
 * and Lighthouse send them too, so the header policy and the meta policy of each page are tested together.
 */
export function siteHeaders(json: string = readFileSync(VERCEL_JSON, 'utf8')): Record<string, string> {
  const rules = (JSON.parse(json) as { headers?: HeaderRule[] }).headers ?? [];
  const rule = rules.find((h) => h.source === '/(.*)');
  if (!rule) throw new Error('vercel.json has no header rule for "/(.*)"');
  return Object.fromEntries(rule.headers.map((h) => [h.key.toLowerCase(), h.value]));
}
```

`apps/web/vercel.json` (Quyết định 26; không có `$schema`, để không trình soạn thảo nào tải schema từ mạng; không có HSTS vì Vercel tự gửi cho mọi deployment, và `includeSubDomains` hay `preload` là quyết định về cả domain của maintainer):

```json
{
  "framework": null,
  "installCommand": "cd ../.. && npm ci",
  "buildCommand": "cd ../.. && npm run build && NEXT_PUBLIC_TARGET=vercel npm run build -w apps/web",
  "outputDirectory": "out",
  "trailingSlash": true,
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Content-Security-Policy",
          "value": "frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
        },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" }
      ]
    },
    {
      "source": "/_next/static/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```

`NEXT_PUBLIC_API_URL` của bản vercel đặt trong Project Settings → Environment Variables của Vercel (maintainer làm), không bao giờ trong file này hay trong `.env` (test cuối của file test trên giữ luật đó).

Run: `npm test -w apps/web -- vercel-config`
Expected: PASS (5 test).

- [ ] **Step 6: Hạ tầng e2e: cấu hình, ví giả, lưới chặn của từng test**

Chép nguyên văn ba file của web cũ (đường dẫn tương đối tới `scripts/lib/anvil.ts` giữ nguyên vì cùng độ sâu thư mục):

```bash
mkdir -p apps/web/test/e2e
cp apps/web-legacy/test/e2e/state.ts apps/web/test/e2e/state.ts
cp apps/web-legacy/test/e2e/wallet.ts apps/web/test/e2e/wallet.ts
cp apps/web-legacy/test/e2e/offchain.spec.ts apps/web/test/e2e/offchain.spec.ts
```

`apps/web/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

// The site and anvil run on free ports chosen by global-setup; tests read the site URL from the state file.
// Every test runs on a desktop and on a phone: the header, the settings and the wallet sheet change shape between them.
export default defineConfig({
  testDir: 'test/e2e',
  globalSetup: './test/e2e/global-setup.ts',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
```

`apps/web/test/e2e/network.ts`:

```ts
import type { Page } from '@playwright/test';
import { RPC_HOSTS } from '../../../../scripts/lib/onchain-check.ts';

/** The only chain nodes the DeWEB gateway counts as on-chain: its own list, which the site check also reads. */
export const OKX_ORIGINS: readonly string[] = RPC_HOSTS.map((host) => `https://${host}`);

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

/** The page talks to the OKX origins, like the real deweb site; every such request is answered by anvil. */
export async function routeRpcToAnvil(page: Page, rpcUrl: string): Promise<void> {
  await page.route(
    (url) => OKX_ORIGINS.includes(url.origin),
    async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: req.postData() ?? '',
      });
      return route.fulfill({
        status: res.status,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: await res.text(),
      });
    },
  );
}

export function recordRequests(page: Page, urls: string[] = []): string[] {
  page.on('request', (r) => urls.push(r.url()));
  return urls;
}

/** Requests the gateway would report: anything not on the site origin and not an OKX chain node. */
export function offchain(urls: readonly string[], siteOrigin: string): string[] {
  const out = urls.filter((u) => {
    if (/^(data|blob|about):/.test(u)) return false;
    const origin = new URL(u).origin;
    return origin !== siteOrigin && !OKX_ORIGINS.includes(origin);
  });
  return [...new Set(out)];
}
```

`apps/web/test/e2e/fixtures.ts`:

```ts
import { type AtropyleClient, createAtropyle, type Deployment, parseDeployment } from '@atropyle/sdk';
import { test as base, expect, type Page } from '@playwright/test';
import type { Address } from 'viem';
import { ANVIL_ACCOUNTS } from '../../../../scripts/lib/anvil.ts';
import { offchain, recordRequests, routeRpcToAnvil } from './network.ts';
import { type E2EState, readState, resetChain } from './state.ts';
import { installWallet, type TestWallet, type WalletOptions } from './wallet.ts';

export const ANVIL: readonly Address[] = ANVIL_ACCOUNTS;

export interface CspViolation {
  directive: string;
  blocked: string;
  sample: string;
}

/** Every securitypolicyviolation of every document the page loads, sent to Node as it happens. */
async function recordCspViolations(page: Page, out: CspViolation[]): Promise<void> {
  await page.exposeFunction('__atropyleCsp', (v: CspViolation) => {
    out.push(v);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      const w = window as unknown as { __atropyleCsp(v: { directive: string; blocked: string; sample: string }): void };
      w.__atropyleCsp({ directive: e.effectiveDirective, blocked: e.blockedURI, sample: e.sample });
    });
  });
}

interface Fixtures {
  state: E2EState;
  /** Every URL the page requested, in order. */
  requests: string[];
  /** Policy violations seen so far; a test that provokes one on purpose empties it (csp.spec.ts). */
  cspViolations: CspViolation[];
  deployment: Deployment;
  atro: AtropyleClient;
  wallet: (o: Omit<WalletOptions, 'rpcUrl'>) => Promise<TestWallet>;
}

export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright passes fixture dependencies as the first argument
  state: async ({}, use) => {
    await use(await resetChain(readState()));
  },
  deployment: async ({ state }, use) => {
    await use(parseDeployment(state.deployment));
  },
  atro: async ({ state, deployment }, use) => {
    const chain = { ...deployment, rpcUrls: [state.rpcUrl], quorumRpcUrls: [[state.rpcUrl]] };
    await use(createAtropyle({ chain, builderCode: null }));
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright passes fixture dependencies as the first argument
  requests: async ({}, use) => {
    await use([]);
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright passes fixture dependencies as the first argument
  cspViolations: async ({}, use) => {
    await use([]);
  },
  // Three nets under every test: no request leaves the site and the OKX nodes, no policy violation, no uncaught error.
  page: async ({ page, state, requests, cspViolations }, use) => {
    await routeRpcToAnvil(page, state.rpcUrl);
    recordRequests(page, requests);
    await recordCspViolations(page, cspViolations);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(page);
    expect(
      offchain(requests, new URL(state.siteUrl).origin),
      'requests that would break the 100% on-chain badge',
    ).toEqual([]);
    expect(cspViolations, 'Content Security Policy violations').toEqual([]);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  },
  wallet: async ({ page, state }, use) => {
    await use((o) => installWallet(page, { rpcUrl: state.rpcUrl, ...o }));
  },
});

export { expect };
```

`apps/web/test/e2e/helpers.ts`:

```ts
import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';
import { KEYS } from '../../src/lib/store.ts';

/** WCAG 2.2 AA, the bar of spec §11. */
export const AXE_TAGS: readonly string[] = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** The stored theme choices the tests use: `dark` is night (the default), `light` is vellum (spec §18.4.1). */
export type E2ETheme = 'dark' | 'light';
export type E2ELang = 'en' | 'vi';

/**
 * Waits until every animation that can end has ended. Loops (the thread pulse) never end, and an animation on a
 * scroll or view timeline ends only when the page scrolls (Ruling R15): both are let through.
 */
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

/** The animations running now, each as `<name> on <tag.class>`, so that a failure says what moves. */
export function runningAnimations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => {
        const name =
          a instanceof CSSAnimation
            ? a.animationName
            : a instanceof CSSTransition
              ? `transition:${a.transitionProperty}`
              : a.id || 'scripted';
        const target = a.effect instanceof KeyframeEffect ? a.effect.target : null;
        const classes = (target?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 3);
        return `${name} on ${target ? [target.tagName.toLowerCase(), ...classes].join('.') : 'nothing'}`;
      }),
  );
}

/** No axe violation at WCAG 2.2 AA, once the page is at rest. */
export async function expectAccessible(page: Page): Promise<void> {
  await settle(page);
  const { violations } = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
  expect(violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual(
    [],
  );
}

/**
 * Ruling R18.17: switches the theme the way a person's choice does, through the stored choice and a reload. Night
 * does not follow the system preference, so emulateMedia({ colorScheme }) cannot change the theme. The reload restarts
 * the page from its URL: state in the hash or in session storage survives, an open dialog does not.
 */
export async function setStoredTheme(page: Page, theme: E2ETheme): Promise<void> {
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [KEYS.theme, theme] as const);
  await page.reload();
  // The boot script applies the stored choice before the first paint: vellum sets the attribute, night removes it.
  if (theme === 'light') await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  else await expect(page.locator('html')).not.toHaveAttribute('data-theme');
}

/** The language, the same way; it applies after hydration, so this waits for <html lang>. */
export async function setStoredLang(page: Page, lang: E2ELang): Promise<void> {
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [KEYS.lang, lang] as const);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

/**
 * No axe violation in vellum, then in night, each set through the stored choice (setStoredTheme); the page ends in
 * night, the default. Each theme reloads the page: pass `ready` when the page fills in after load (a vault read from
 * the chain), and use expectAccessible instead while a dialog is open.
 */
export async function expectAccessibleInBothThemes(page: Page, ready?: Locator): Promise<void> {
  for (const theme of ['light', 'dark'] as const) {
    await setStoredTheme(page, theme);
    if (ready) await expect(ready).toBeVisible();
    await expectAccessible(page);
  }
}

/** The settings: the Settings popover on wide screens, the Menu sheet on phones. */
export async function openSettings(page: Page): Promise<Locator> {
  const settings = page.getByRole('button', { name: 'Settings' });
  if (await settings.isVisible()) {
    await settings.click();
    return page.getByRole('dialog', { name: 'Settings' });
  }
  await page.getByRole('button', { name: 'Menu' }).click();
  return page.getByRole('dialog', { name: 'Menu' });
}

/** Connect through the header button and the wallet sheet, as a person would. */
export async function connectWallet(page: Page, name = 'Test Wallet'): Promise<void> {
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  const sheet = page.getByRole('dialog', { name: 'Choose a wallet' });
  await sheet.getByRole('button', { name }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: /^Wallet 0x/ })).toBeVisible();
}
```

`apps/web/test/e2e/screens.ts` (harness ảnh chụp của R18.13; 7B T4 không tạo file này nữa):

```ts
import type { Page } from '@playwright/test';
import { type E2ELang, type E2ETheme, setStoredLang, setStoredTheme, settle } from './helpers.ts';

export interface Shot {
  theme: E2ETheme;
  lang: E2ELang;
  width: number;
}

/** Ruling R18.13: three shots per screen, all in night: English at 1440 and 390 px, Vietnamese at 390 px. */
export const SCREEN_MATRIX: readonly Shot[] = [
  { theme: 'dark', lang: 'en', width: 1440 },
  { theme: 'dark', lang: 'en', width: 390 },
  { theme: 'dark', lang: 'vi', width: 390 },
];

/** The same three in vellum, only for a vellum surface (the heir letter, a printed page). */
export const VELLUM_MATRIX: readonly Shot[] = SCREEN_MATRIX.map((s): Shot => ({ ...s, theme: 'light' }));

/** Screens are taken only on demand (SCREENS=1) and once, on the desktop project; the 390 px shots stand for phones. */
export function shouldCapture(projectName: string): boolean {
  return process.env.SCREENS === '1' && projectName === 'desktop';
}

/**
 * Full-page screenshots for the design review, into test-results/screens/<name>/<night|vellum>-<lang>-<width>.png
 * (ignored by git, never compared). The theme and the language change through the stored choice and a reload
 * (Ruling R18.17), so the screen must survive a reload: its state lives in the hash or in session storage. Ends in
 * night and English, at the viewport it started with.
 */
export async function captureScreens(page: Page, name: string, o: { vellum?: boolean } = {}): Promise<void> {
  const start = page.viewportSize();
  const shots = o.vellum ? [...SCREEN_MATRIX, ...VELLUM_MATRIX] : SCREEN_MATRIX;
  let theme: E2ETheme | null = null;
  let lang: E2ELang | null = null;
  for (const shot of shots) {
    if (shot.theme !== theme) {
      await setStoredTheme(page, shot.theme);
      theme = shot.theme;
    }
    if (shot.lang !== lang) {
      await setStoredLang(page, shot.lang);
      lang = shot.lang;
    }
    await page.setViewportSize({ width: shot.width, height: 900 });
    await settle(page);
    const scheme = shot.theme === 'dark' ? 'night' : 'vellum';
    await page.screenshot({
      path: `test-results/screens/${name}/${scheme}-${shot.lang}-${shot.width}.png`,
      fullPage: true,
    });
  }
  await setStoredLang(page, 'en');
  await setStoredTheme(page, 'dark');
  if (start) await page.setViewportSize(start);
}
```

`apps/web/test/e2e/global-setup.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAnvil } from '../../../../scripts/lib/anvil.ts';
import { buildApp, OUT_DIR } from '../../scripts/lib/run-next.ts';
import { siteHeaders } from '../../scripts/lib/site-headers.ts';
import { startStaticServer } from '../../scripts/lib/static-server.ts';
import { OKX_ORIGINS } from './network.ts';
import { type E2EState, rpcCall, writeState } from './state.ts';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
/** The e2e build, copied out of out/ so that a later `npm run build` cannot change it under a running suite. */
const SITE = fileURLToPath(new URL('./.site', import.meta.url));

/** Deploys the contracts and seeds the demo vaults; its own process, because it imports repo sources directly. */
function prepareDevnet(rpcUrl: string): Pick<E2EState, 'deployment' | 'seeded'> {
  const out = join(mkdtempSync(join(tmpdir(), 'atropyle-e2e-')), 'devnet.json');
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/e2e-devnet-prep.ts', rpcUrl, out], {
    cwd: ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (r.status !== 0) throw new Error(`e2e-devnet-prep failed:\n${r.stdout}\n${r.stderr}`);
  return JSON.parse(readFileSync(out, 'utf8')) as Pick<E2EState, 'deployment' | 'seeded'>;
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const anvil = await startAnvil();
  let server: Awaited<ReturnType<typeof startStaticServer>> | undefined;
  try {
    const devnet = prepareDevnet(anvil.url);
    // The deweb build, pointed at the OKX origins that every test routes to anvil (network.ts).
    const site = {
      ...devnet.deployment,
      rpcUrls: [...OKX_ORIGINS],
      quorumRpcUrls: [[...OKX_ORIGINS], ['https://xlayer.drpc.org']],
      webUrl: null,
    };
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NEXT_PUBLIC_TARGET: 'deweb',
      NEXT_PUBLIC_CHAIN: 'local',
      NEXT_PUBLIC_DEPLOYMENT: JSON.stringify(site),
      ATROPYLE_E2E: '1',
    };
    const built = await buildApp({ env, quiet: true });
    if (built.code !== 0) throw new Error(`next build (e2e) failed:\n${built.output}`);
    rmSync(SITE, { recursive: true, force: true });
    cpSync(OUT_DIR, SITE, { recursive: true });
    // Served with the headers of vercel.json, so the header policy and each page's meta policy apply together.
    server = await startStaticServer(SITE, 0, siteHeaders());
    const snapshot = (await rpcCall(anvil.url, 'evm_snapshot')) as string;
    writeState({ rpcUrl: anvil.url, siteUrl: `${server.url}/`, snapshot, ...devnet });
    const started = server;
    return async () => {
      await started.close();
      await anvil.stop();
    };
  } catch (e) {
    await server?.close();
    await anvil.stop();
    throw e;
  }
}
```

Run: `npm run typecheck -w apps/web && npx biome ci .`
Expected: không lỗi. (`wallet.ts` và `state.ts` chép nguyên văn đã qua Biome ở web cũ; `offchain.spec.ts` dùng `OKX_ORIGINS` và `offchain` của `network.ts` mới.)

- [ ] **Step 7: Các spec e2e**

`apps/web/test/e2e/shell.spec.ts`:

```ts
import { expect, test } from './fixtures.ts';
import { expectAccessibleInBothThemes, openSettings, setStoredTheme } from './helpers.ts';
import { captureScreens, shouldCapture } from './screens.ts';

const HERO = 'What happens to your crypto when you can no longer sign?';
const HERO_VI = 'Chuyện gì xảy ra với tài sản crypto của bạn khi bạn không còn ký được nữa?';
/** --atro-bg of globals.css (Task 3): night #0b0d12, vellum #f6f1e7. */
const NIGHT_BG = 'rgb(11, 13, 18)';
const VELLUM_BG = 'rgb(246, 241, 231)';

test('the home page and the 404 page pass axe in both themes', async ({ page, state }) => {
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  await expectAccessibleInBothThemes(page);
  await page.goto(new URL('no-such-page/', state.siteUrl).href);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await expectAccessibleInBothThemes(page);
});

test('the stored theme changes the palette axe checks, and the system preference does not', async ({
  page,
  state,
}) => {
  const background = () => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  // Night is not the system theme (spec §18.4.1): emulateMedia leaves it alone, which is why R18.17 exists.
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(background).toBe(NIGHT_BG);
  await setStoredTheme(page, 'light');
  await expect.poll(background).toBe(VELLUM_BG);
  await setStoredTheme(page, 'dark');
  await expect.poll(background).toBe(NIGHT_BG);
});

test('the skip button moves focus to the main content and keeps the hash', async ({ page, state }) => {
  await page.goto(`${state.siteUrl}#keep`);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('button', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  // A fragment link would have replaced it; the hash carries page parameters (Task 9).
  expect(new URL(page.url()).hash).toBe('#keep');
});

test('the theme and the language persist across a reload', async ({ page, state }) => {
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  // Night is the default and carries no attribute.
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  const settings = await openSettings(page);
  await settings.getByText('Vellum', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await settings.getByText('Tiếng Việt', { exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await page.reload();
  // The boot script sets the theme before the first paint; the language follows after hydration.
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('heading', { level: 1, name: HERO_VI })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
});

test('screens of the home page and the 404 page, for the design review', async ({ page, state }, info) => {
  test.skip(!shouldCapture(info.project.name), 'set SCREENS=1 to take the review screenshots');
  test.setTimeout(300_000);
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1, name: HERO })).toBeVisible();
  await captureScreens(page, 'home');
  await page.goto(new URL('no-such-page/', state.siteUrl).href);
  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await captureScreens(page, '404');
});
```

`apps/web/test/e2e/legacy.spec.ts` (Review Focus 1):

```ts
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

/** 4 kB of every character base64url uses: the shape of a long signing payload (as in boot.test.ts). */
const PAYLOAD = Array.from({ length: 4096 }, (_, i) => 'ABYZabyz0189-_'[i % 14]).join('');
const VAULT = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

/**
 * Opens a legacy link from another document, so that it is a real page load. Returns the history length before it:
 * a redirect by location.replace adds one entry (the new route), never two.
 */
async function openLegacy(page: Page, siteUrl: string, hash: string): Promise<number> {
  await page.goto(new URL('robots.txt', siteUrl).href);
  const before = await page.evaluate(() => history.length);
  // 'commit': the boot script replaces the document while it parses, so the first one never finishes loading.
  await page.goto(`${siteUrl}${hash}`, { waitUntil: 'commit' });
  return before;
}

test('legacy links land on the new routes', async ({ page, state }) => {
  const cases: [string, string][] = [
    [`#/sign?p=${PAYLOAD}`, `/sign/#p=${PAYLOAD}`],
    // Two p parameters move as they are, so the sign page still refuses the link.
    ['#/sign?p=a&p=b', '/sign/#p=a&p=b'],
    [`#/v/${VAULT}/verify`, `/verify/#${VAULT}`],
    [`#/v/${VAULT}`, `/vault/#${VAULT}`],
    ['#/create?drill=1', '/create/#drill'],
    ['#/status', '/status/'],
  ];
  for (const [hash, want] of cases) {
    const before = await openLegacy(page, state.siteUrl, hash);
    await page.waitForURL((u) => `${u.pathname}${u.hash}` === want);
    expect(await page.evaluate(() => history.length), hash).toBe(before + 1);
  }
});

test('unknown hashes and hashes on other pages stay where they are', async ({ page, state }) => {
  for (const rest of ['#/nope', '#/v/a/edit', '#drill', '#p=abc', 'no-such-page/#/sign?p=a']) {
    // From another document each time: a hash-only change would not load the page, and the boot script would not run.
    await page.goto(new URL('robots.txt', state.siteUrl).href);
    await page.goto(`${state.siteUrl}${rest}`);
    // Once the page has hydrated, a redirect would already have changed the URL.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(page.url(), rest).toBe(`${state.siteUrl}${rest}`);
  }
});
```

`apps/web/test/e2e/wallet.spec.ts`:

```ts
import { ANVIL, expect, test } from './fixtures.ts';
import { connectWallet, expectAccessible } from './helpers.ts';
import { rpcCall } from './state.ts';

/** compactAddress of ANVIL[1] (Task 5). */
const ACCOUNT = 'Wallet 0x7099 7970 … 17dc 79C8';

const REFUSED = [
  ['eth_sendRawTransaction', ['0x02f8']],
  ['personal_sign', ['0x68656c6c6f', ANVIL[1]]],
  ['eth_sign', [ANVIL[1], '0x68656c6c6f']],
  ['eth_signTypedData_v4', [ANVIL[1], '{}']],
  ['eth_signTransaction', [{ from: ANVIL[1], to: ANVIL[2] }]],
] as const;

test('a wallet connects through the sheet, comes back after a reload without a prompt, and disconnects', async ({
  page,
  state,
  wallet,
}) => {
  const w = await wallet({ account: ANVIL[1] });
  await page.goto(state.siteUrl);
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  const sheet = page.getByRole('dialog', { name: 'Choose a wallet' });
  await expect(sheet.getByRole('button', { name: 'Test Wallet' })).toBeVisible();
  await expectAccessible(page);
  await sheet.getByRole('button', { name: 'Test Wallet' }).click();
  await expect(sheet).toBeHidden();
  const account = page.getByRole('button', { name: ACCOUNT, exact: true });
  await expect(account).toBeVisible();
  expect(w.calls.map((c) => c.method)).toContain('eth_requestAccounts');

  const before = w.calls.length;
  await page.reload();
  await expect(account).toBeVisible();
  // Quyết định 27: a remembered wallet comes back through eth_accounts, never through a prompt.
  expect(w.calls.slice(before).map((c) => c.method)).not.toContain('eth_requestAccounts');

  await account.click();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Disconnect' }).click();
  const connect = page.getByRole('button', { name: 'Connect wallet' });
  await expect(connect).toBeVisible();
  await page.reload();
  await expect(connect).toBeVisible();
  await expect(account).toBeHidden();
});

test('a wallet on another chain sees the banner and switches with one press', async ({ page, state, wallet }) => {
  await wallet({ account: ANVIL[1], chainId: 196, knownChains: [31337] });
  await page.goto(state.siteUrl);
  await connectWallet(page);
  const banner = page.getByTestId('network-banner');
  await expect(banner).toContainText('Your wallet is on X Layer. Atropyle runs on Anvil (chain 31337).');
  await expect(page.getByRole('button', { name: `${ACCOUNT}, wrong network` })).toBeVisible();
  await expectAccessible(page);
  await banner.getByRole('button', { name: 'Switch to Anvil' }).click();
  await expect(banner).toBeHidden();
  await expect(page.getByRole('button', { name: ACCOUNT, exact: true })).toBeVisible();
});

test('the wallet refuses signing and raw-transaction methods before anvil sees them', async ({
  page,
  state,
  wallet,
}) => {
  const w = await wallet({ account: ANVIL[1] });
  await page.goto(state.siteUrl);
  const before = await rpcCall(state.rpcUrl, 'eth_blockNumber');
  const codes = await page.evaluate(async (cases) => {
    const provider = await new Promise<{ request(a: { method: string; params: unknown[] }): Promise<unknown> }>(
      (resolve) => {
        window.addEventListener('eip6963:announceProvider', (e) => resolve((e as CustomEvent).detail.provider), {
          once: true,
        });
        window.dispatchEvent(new Event('eip6963:requestProvider'));
      },
    );
    const out: unknown[] = [];
    for (const [method, params] of cases) {
      out.push(
        await provider.request({ method, params: [...params] }).then(
          () => 'accepted',
          (e: { code?: number }) => e.code,
        ),
      );
    }
    return out;
  }, REFUSED);
  expect(codes).toEqual(REFUSED.map(() => 4200));
  expect(w.calls.map((c) => c.method)).toEqual(REFUSED.map(([m]) => m));
  expect(await rpcCall(state.rpcUrl, 'eth_blockNumber')).toBe(before);
});
```

`apps/web/test/e2e/motion.spec.ts` (Review Focus 4):

```ts
import { expect, test } from './fixtures.ts';
import { runningAnimations } from './helpers.ts';

test('reduced motion leaves no running animation', async ({ page, state }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of ['', 'no-such-page/']) {
    await page.goto(new URL(path, state.siteUrl).href);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // At rest: a finite transition may still finish, a loop never does.
    await expect.poll(() => runningAnimations(page), { timeout: 5_000 }).toEqual([]);
  }
});

test('without reduced motion the thread breathes, so the test above can fail', async ({ page, state }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(state.siteUrl);
  await expect.poll(async () => (await runningAnimations(page)).some((a) => a.startsWith('thread-pulse '))).toBe(true);
});

/**
 * Plan 7A Quyết định 6: React's ViewTransition starts a view transition when a client navigation commits, so Next
 * needs no viewTransition key. In 7A only `/` and the 404 page exist, and a Link to a missing route reloads the
 * document, so the only client navigation is from the 404 page to `/`.
 */
test('a client navigation runs inside a view transition', async ({ page, state }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(new URL('no-such-page/', state.siteUrl).href);
  // The 404 page prints the missing path only once it has mounted: from here on, the header's Link is live.
  await expect(page.getByRole('main').locator('code')).toContainText('/no-such-page/');
  await page.evaluate(() => {
    const w = window as unknown as { __vtCalls: number; __sameDocument: boolean };
    w.__vtCalls = 0;
    w.__sameDocument = true;
    const start = document.startViewTransition?.bind(document);
    if (!start) return;
    document.startViewTransition = ((arg?: Parameters<typeof start>[0]) => {
      w.__vtCalls += 1;
      return start(arg);
    }) as typeof document.startViewTransition;
  });
  await page.getByRole('link', { name: 'Atropyle home' }).click();
  await page.waitForURL(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const seen = await page.evaluate(() => {
    const w = window as unknown as { __vtCalls?: number; __sameDocument?: boolean };
    return { sameDocument: w.__sameDocument === true, calls: w.__vtCalls ?? 0 };
  });
  expect(seen.sameDocument, 'the click loaded a new document instead of navigating on the client').toBe(true);
  expect(seen.calls, 'document.startViewTransition was never called during the navigation').toBeGreaterThan(0);
});
```

`apps/web/test/e2e/csp.spec.ts`:

```ts
import { expect, test } from './fixtures.ts';

test('every page runs under its policy without a single violation', async ({ page, state }) => {
  // The page fixture fails the test on any violation; the worker page also loads a module worker and its chunks.
  for (const path of ['', 'no-such-page/', 'e2e/worker/']) {
    await page.goto(new URL(path, state.siteUrl).href);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  }
});

test('an injected inline script is blocked and reported', async ({ page, state, cspViolations }) => {
  await page.goto(state.siteUrl);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const ran = await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__injected = true;';
    document.head.append(s);
    return (window as unknown as { __injected?: boolean }).__injected === true;
  });
  expect(ran).toBe(false);
  await expect.poll(() => cspViolations.map((v) => v.directive)).toEqual(['script-src-elem']);
  // Provoked on purpose: clear it, so the fixture still guards the rest of this test.
  cspViolations.length = 0;
});
```

`apps/web/test/e2e/worker.spec.ts`:

```ts
import { expect, test } from './fixtures.ts';

test('the proof worker loads and runs under the page policy', async ({ page, state }) => {
  await page.goto(new URL('e2e/worker/', state.siteUrl).href);
  for (const id of ['worker-smoke', 'worker-verify']) {
    const row = page.getByTestId(id);
    await expect(row).not.toHaveAttribute('data-state', 'running', { timeout: 60_000 });
    expect(`${await row.getAttribute('data-state')}: ${await row.textContent()}`, id).toMatch(/^ok: /);
  }
});
```

`apps/web/test/e2e/nojs.spec.ts`:

```ts
import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

// Spec §18 principle 6: the first paint is the final layout, so a reader without JavaScript loses nothing to read.
test.use({ javaScriptEnabled: false });

const XLAYER = JSON.parse(readFileSync(new URL('../../../../deployments/xlayer.json', import.meta.url), 'utf8')) as {
  circuits: { netlistKeccak: { policy: string } };
};
/** The policy netlist keccak; the proof line names it in short form, 0x7016…3864 (Task 9, src/config/facts.ts). */
const KECCAK = XLAYER.circuits.netlistKeccak.policy;

/**
 * Seen by a reader: visible to Playwright, and no ancestor left at opacity 0. toBeVisible counts opacity 0 as visible,
 * and an `m.*` element prerenders its initial style, which only JavaScript would lift.
 */
async function expectSeen(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  const chain = target.locator('xpath=ancestor-or-self::*');
  const n = await chain.count();
  for (let i = 0; i < n; i++) await expect(chain.nth(i)).not.toHaveCSS('opacity', '0');
}

/**
 * What every page shows before any script runs: the proof line, then the footer and its promise (Task 9). The proof
 * line is found by its test id, never by position: it is the first visible band, right after the skip link.
 */
async function expectFrame(page: Page): Promise<void> {
  const line = page.getByTestId('proof-line');
  // Both variants are in the HTML and CSS shows one; each links the short keccak to the proof.
  const keccak = line
    .locator('a[href="/proof/"]')
    .filter({ hasText: KECCAK.slice(0, 6) })
    .filter({ hasText: KECCAK.slice(-4) })
    .filter({ visible: true })
    .first();
  await expectSeen(keccak);
  await expectSeen(line.getByText('unaudited').filter({ visible: true }).first());
  const footer = page.getByRole('contentinfo');
  await expectSeen(footer.getByText('No trackers'));
  await expectSeen(footer.locator('a[href="/proof/#limits"]'));
  await expectSeen(footer.locator('a[href="/verify/"]'));
}

/** `/`: the question, and the two ways in (rehearse it, see the proof). */
async function expectHome(page: Page): Promise<void> {
  await expectSeen(page.getByRole('heading', { level: 1 }));
  const main = page.getByRole('main');
  await expectSeen(main.locator('a[href="/create/#drill"]').first());
  await expectSeen(main.locator('a[href="/proof/"]').first());
}

/** Every page that must read without JavaScript. Plan 7B Task 12 adds 'verify/', Plan 7C Task 3 adds 'proof/'. */
const PAGES: readonly { path: string; content(page: Page): Promise<void> }[] = [{ path: '', content: expectHome }];

for (const { path, content } of PAGES) {
  test(`/${path} reads without JavaScript`, async ({ page, state }) => {
    await page.goto(new URL(path, state.siteUrl).href);
    await content(page);
    await expectFrame(page);
  });
}
```

Run:

```bash
cd contracts && forge build && cd ..
npm run build
npm run playwright:install -w apps/web
npm run e2e -w apps/web
```

Expected: `34 passed`, `2 skipped`. Đó là 18 test × 2 project (`desktop`, `mobile`) = 36 kết quả: 34 passed, 2 skipped. 18 test gồm `shell` 5, `legacy` 2, `wallet` 3, `motion` 3, `csp` 2, `worker` 1, `nojs` 1 (một mục trong `PAGES`) và `offchain` 1 (chép nguyên từ bản cũ, chạy ở cả hai project). Hai kết quả bị bỏ là một test chụp màn hình của `shell.spec.ts`, bị bỏ ở cả hai project vì không có `SCREENS=1`. Global setup mất vài phút (anvil, triển khai hợp đồng, một lần `next build`).

Kết quả của test `a client navigation runs inside a view transition` quyết định bước sau. Ghi kết quả vào báo cáo task.
- **Kết quả A:** test PASS. Quyết định 6 đúng; bỏ Step 7b, không có `nav-link.tsx`.
- **Kết quả B:** test hỏng ở `document.startViewTransition was never called during the navigation`. Điều hướng chạy trên client, nhưng React không mở view transition. Làm Step 7b.
- **Kết quả C:** test hỏng ở `the click loaded a new document instead of navigating on the client`. Đây không phải lỗi view transition: `Link` chưa hydrate, hoặc payload RSC `index.txt` của `/` thiếu trong `out/`. Dừng và báo BLOCKED, kèm trace (`npx playwright show-trace`); không viết `nav-link.tsx`.

Lỗi thường gặp và cách đọc:
- `requests that would break the 100% on-chain badge`: trang gọi một origin ngoài. Tìm nguồn trong mảng in ra; không thêm origin vào `offchain`.
- `Content Security Policy violations` với `script-src-elem` và `sample` là đoạn đầu của một script inline: script đó sinh ra sau bước postbuild, hoặc có `\r` lạ; xem `inlineScripts`. Với `worker-src`: Turbopack tạo worker qua `blob:`; đổi `BUNDLER_FLAGS` sang `--webpack` (Quyết định 3).
- `reduced motion leaves no running animation` in tên animation và phần tử, ví dụ `thread-tremble on svg.…`: class đó thiếu tiền tố `motion-safe:`.
- `nojs.spec.ts` hỏng ở `not.toHaveCSS('opacity', '0')`: một phần tử `m.*` prerender với `initial` có `opacity: 0`, nên không có JS thì chữ không bao giờ hiện. Sửa phần tử đó (`initial={false}`, hoặc animation CSS sau `motion-safe:`), không bỏ kiểm tra.
- `expectAccessibleInBothThemes` hỏng ở `toHaveAttribute('data-theme', 'light')` sau khi tải lại: script boot không áp lựa chọn đã lưu (Task 9). Không chuyển về `emulateMedia` (R18.17).

- [ ] **Step 7b: Chỉ khi Kết quả B: `NavLink` mở view transition cho điều hướng trên client**

Không làm bước này khi ra Kết quả A.

`withViewTransition(() => router.push(href))` (câu chữ của §18.4.1) không đủ. `withViewTransition` chạy `update` trong `flushSync`, mà `router.push` chỉ commit sau khi tải payload RSC. Vì vậy trình duyệt chụp ảnh "mới" khi DOM chưa đổi, rồi trang đổi mà không có chuyển cảnh. `NavLink` giữ ảnh cũ cho tới khi pathname mới đã commit, tối đa 1 giây.

**Lệch có chủ ý khỏi §18.4.1** (controller đã chấp nhận, A-Q2). Bước này khác câu chữ của spec ở hai chỗ:
- `NavLink` gọi `withPendingViewTransition(() => router.push(href), committed)`, không gọi `withViewTransition(() => router.push(href))`: `flushSync` không chờ được một lần `push` bất đồng bộ, như đoạn trên giải thích. `withViewTransition` giữ nguyên cho việc đổi theme, nơi cập nhật là đồng bộ.
- §18.4.1 chỉ nêu `nav-list.tsx` và `footer.tsx`. Bước này đổi cả link `Atropyle home` của `header.tsx` sang `NavLink`, vì spy của e2e bấm chính link đó.

Hai chỗ này là quyết định, không phải sai sót: đừng đưa mã về câu chữ của spec.

`apps/web/test/unit/nav-link.test.tsx`:

```tsx
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavLink } from '../../src/shell/nav-link';

const nav = vi.hoisted(() => ({ pathname: '/', push: vi.fn<(href: string) => void>() }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: nav.push }) }));

/** The update callbacks handed to the fake document.startViewTransition, in call order. */
const updates: (() => Promise<void>)[] = [];

beforeEach(() => {
  nav.pathname = '/';
  nav.push.mockClear();
  updates.length = 0;
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: (update: () => Promise<void>) => {
      updates.push(update);
      return {};
    },
  });
});

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('NavLink', () => {
  it('runs a plain click as a client navigation in a view transition that waits for the new route', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    const { rerender } = render(<NavLink href="/proof/">Proof</NavLink>);
    const link = screen.getByRole('link', { name: 'Proof' });
    const click = createEvent.click(link);
    fireEvent(link, click);
    expect(click.defaultPrevented).toBe(true);
    expect(updates).toHaveLength(1);
    let done = false;
    const finished = updates[0]().then(() => {
      done = true;
    });
    expect(nav.push).toHaveBeenCalledWith('/proof/');
    await Promise.resolve();
    expect(done).toBe(false);
    // usePathname may report the route without its trailing slash; it is the same page.
    nav.pathname = '/proof';
    rerender(<NavLink href="/proof/">Proof</NavLink>);
    await finished;
    expect(done).toBe(true);
  });

  it('stops holding the old picture after one second, so a failed navigation never freezes the page', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    render(<NavLink href="/proof/">Proof</NavLink>);
    fireEvent.click(screen.getByRole('link', { name: 'Proof' }));
    let done = false;
    const finished = updates[0]().then(() => {
      done = true;
    });
    vi.advanceTimersByTime(999);
    await Promise.resolve();
    expect(done).toBe(false);
    vi.advanceTimersByTime(1);
    await finished;
    expect(done).toBe(true);
  });

  it('leaves modified clicks and links to the current page to the browser and next/link', () => {
    render(
      <>
        <NavLink href="/proof/">Proof</NavLink>
        <NavLink href="/">Home</NavLink>
      </>,
    );
    const prevented: boolean[] = [];
    // React handles the click at its root; this listener on window runs after it and stops happy-dom navigating.
    const guard = (e: Event) => {
      prevented.push(e.defaultPrevented);
      e.preventDefault();
    };
    window.addEventListener('click', guard);
    fireEvent.click(screen.getByRole('link', { name: 'Proof' }), { ctrlKey: true });
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    window.removeEventListener('click', guard);
    expect(prevented).toEqual([false, false]);
    expect(updates).toHaveLength(0);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('navigates without a view transition when the user prefers reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query.includes('reduce'), media: query }) as MediaQueryList,
    );
    render(<NavLink href="/proof/">Proof</NavLink>);
    const link = screen.getByRole('link', { name: 'Proof' });
    const click = createEvent.click(link);
    fireEvent(link, click);
    expect(click.defaultPrevented).toBe(true);
    expect(nav.push).toHaveBeenCalledWith('/proof/');
    expect(updates).toHaveLength(0);
  });
});
```

Run: `npm test -w apps/web -- nav-link`
Expected: FAIL, không tìm thấy `../../src/shell/nav-link`.

Thêm vào cuối `apps/web/src/motion/view-transition.tsx` (phần còn lại của file giữ nguyên):

```tsx
type StartPendingViewTransition = (update: () => Promise<void>) => unknown;

/**
 * A crossfade around an update that commits later, such as a client route change: the browser keeps the old picture
 * until `committed` resolves or `maxMs` has passed, then animates to the new one. Without the API, or when the user
 * prefers reduced motion, the update simply runs.
 */
export function withPendingViewTransition(update: () => void, committed: Promise<void>, maxMs = 1_000): void {
  const start = (document as { startViewTransition?: StartPendingViewTransition }).startViewTransition;
  const reduce =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (typeof start !== 'function' || reduce) {
    update();
    return;
  }
  start.call(document, () => {
    update();
    return Promise.race([committed, new Promise<void>((resolve) => setTimeout(resolve, maxMs))]);
  });
}
```

`apps/web/src/shell/nav-link.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ComponentProps, type MouseEvent, useEffect, useRef } from 'react';
import { withPendingViewTransition } from '@/motion/view-transition';

type NavLinkProps = Omit<ComponentProps<typeof Link>, 'href'> & { href: string };

/** `/proof` and `/proof/` are the same page (trailingSlash: true). */
function samePath(a: string, b: string): boolean {
  return (a.replace(/\/+$/, '') || '/') === (b.replace(/\/+$/, '') || '/');
}

/** A click the browser keeps for itself: another button, a modifier key, another tab. */
function isPlainClick(e: MouseEvent<HTMLAnchorElement>): boolean {
  const target = e.currentTarget.getAttribute('target');
  return (
    e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && (target === null || target === '_self')
  );
}

/**
 * next/link whose client navigation runs inside a view transition, because React did not start one for a navigation
 * in this Next version (the spy in test/e2e/motion.spec.ts). The old picture stays until the new pathname has
 * committed, at most one second.
 */
export function NavLink({ href, onClick, ...rest }: NavLinkProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const pending = useRef<{ path: string; resolve(): void } | null>(null);
  useEffect(() => {
    const p = pending.current;
    if (p && samePath(p.path, pathname)) {
      pending.current = null;
      p.resolve();
    }
  }, [pathname]);
  return (
    <Link
      {...rest}
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || !isPlainClick(e)) return;
        const to = new URL(href, window.location.href);
        // Another site, or the same page (a hash change): next/link and the browser handle it.
        if (to.origin !== window.location.origin || samePath(to.pathname, window.location.pathname)) return;
        e.preventDefault();
        const committed = new Promise<void>((resolve) => {
          pending.current = { path: to.pathname, resolve };
        });
        withPendingViewTransition(() => router.push(href), committed);
      }}
    />
  );
}
```

Run: `npm test -w apps/web -- nav-link`
Expected: PASS (4 test).

Đổi `Link` thành `NavLink` trong ba file khung. Spy của e2e bấm link `Atropyle home` của header, nên header cũng đổi. Dòng bằng chứng (link `/proof/`) giữ `Link` cho tới khi 7C T3 dựng `/proof/`. (Vòng sửa cuối của 7A đổi cả dòng bằng chứng và trang 404 sang `NavLink`, như link "Known limits" của footer; luật 18 của Interfaces.)

```bash
sed -i -e "s#^import Link from 'next/link';#import { NavLink } from './nav-link';#" -e 's#<Link\b#<NavLink#g' -e 's#</Link>#</NavLink>#g' apps/web/src/shell/nav-list.tsx apps/web/src/shell/footer.tsx apps/web/src/shell/header.tsx
npx biome check --write apps/web/src/shell/nav-list.tsx apps/web/src/shell/footer.tsx apps/web/src/shell/header.tsx
grep -c "next/link" apps/web/src/shell/nav-list.tsx apps/web/src/shell/footer.tsx apps/web/src/shell/header.tsx
grep -ln "shell/header\|shell/footer\|shell/frame\|shell/nav-list\|shell/mobile-menu" apps/web/test/unit
```

Expected:
- `grep -c` in `:0` cho cả ba file. `ExternalLink` không bị đổi, vì mẫu cần `<` đứng ngay trước `Link`.
- Lệnh cuối liệt kê các file test unit vẽ một thành phần của khung; với Task 9 là `apps/web/test/unit/shell.test.tsx`.

`sed` đổi mọi `Link` của ba file, kể cả link tới route mà 7A chưa dựng (7B và 7C dựng sau) và link "Known limits" của footer. Như thế là đúng, đừng thu hẹp `sed`. Route chưa có thì không có payload RSC; Next khi đó tải lại cả trang, y như với `Link` thường. Khác biệt duy nhất: `NavLink` giữ ảnh cũ cho tới khi trang mới tải xong, tối đa 1 giây (`maxMs`). Khoảng chờ này hết khi route có thật. Ghi một dòng về nó vào báo cáo task.

Trong factory `vi.mock('next/navigation', () => ({ … }))` của **mỗi** file vừa liệt kê, thêm khoá `useRouter: () => ({ push: () => undefined }),` cạnh `usePathname`. Ví dụ, dòng của Task 9 thành:

```tsx
vi.mock('next/navigation', () => ({ usePathname: () => '/create/', useRouter: () => ({ push: () => undefined }) }));
```

Run:

```bash
npm test -w apps/web -- nav-link shell
npm run e2e -w apps/web -- motion.spec.ts
```

Expected:
- unit: PASS; số test của `shell` không đổi;
- e2e: `6 passed`. Test spy thấy `startViewTransition` được gọi từ `NavLink`, và điều hướng vẫn chạy trên client.

Ghi vào báo cáo task:
- "Kết quả B";
- dòng lỗi của spy trước khi sửa;
- link của khung tới route chưa có trong 7A tải lại cả trang sau tối đa 1 giây giữ ảnh cũ, cho tới khi 7B và 7C dựng route đó.

Controller sửa Quyết định 6 và spec §16 theo kết quả này, và ghi hai chỗ lệch §18.4.1 ở đầu bước vào spec.

- [ ] **Step 8: Ngân sách kích thước theo route**

`apps/web/.size-limit.mjs`:

```js
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Global Constraints of Plan 7A and spec §11: first-load JS of `/` and of every other route, and all JS of the site.
// Ruling R23 set `/` to 200 kB and other routes to 240 kB: Next 16 + React 19 alone measure about 136 kB.
const HOME_LIMIT = '200 kB';
const ROUTE_LIMIT = '240 kB';
const TOTAL_LIMIT = '900 kB';

const OUT = fileURLToPath(new URL('./out/', import.meta.url));
/** size-limit globs every path; staged copies get plain names, whatever characters the bundler put in its own. */
const STAGE = fileURLToPath(new URL('./.size/', import.meta.url));

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

if (!existsSync(join(OUT, 'index.html'))) {
  throw new Error('apps/web/out holds no build: run `npm run build -w apps/web` first.');
}
if (existsSync(join(OUT, 'e2e'))) {
  throw new Error('apps/web/out holds the e2e build: run `npm run build -w apps/web` first.');
}

/** `/` for out/index.html, `/x/` for out/x/index.html, `/404` for out/404.html. */
function routeOf(file) {
  const rel = relative(OUT, file).split(sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel.slice(0, -'.html'.length)}`;
}

/** The script files a page loads before it is interactive: every <script src>, except the nomodule fallback. */
function scriptsOf(file) {
  const files = [];
  for (const [tag] of readFileSync(file, 'utf8').matchAll(/<script\b[^>]*>/gi)) {
    const src = /\ssrc="([^"]+)"/i.exec(tag)?.[1];
    if (!src || /\snomodule\b/i.test(tag)) continue;
    if (!src.startsWith('/_next/')) throw new Error(`${routeOf(file)} loads a script from outside /_next/: ${src}`);
    const path = join(OUT, ...decodeURIComponent(src.split('?')[0]).split('/'));
    if (!existsSync(path)) throw new Error(`${routeOf(file)} loads ${src}, which is not in out/`);
    files.push(path);
  }
  if (files.length === 0) throw new Error(`${routeOf(file)} loads no script: the HTML of Next changed shape`);
  return files;
}

function stage(name, files) {
  const dir = join(STAGE, name);
  mkdirSync(dir, { recursive: true });
  return files.map((file, i) => {
    copyFileSync(file, join(dir, `${i}.js`));
    return `.size/${name}/${i}.js`;
  });
}

rmSync(STAGE, { recursive: true, force: true });
const pages = walk(OUT)
  .filter((f) => f.endsWith('.html'))
  .sort();

export default [
  ...pages.map((file, i) => ({
    name: `first load of ${routeOf(file)}`,
    path: stage(`route-${i}`, scriptsOf(file)),
    limit: routeOf(file) === '/' ? HOME_LIMIT : ROUTE_LIMIT,
    gzip: true,
  })),
  {
    name: 'all JavaScript of the site',
    path: stage(
      'all',
      walk(join(OUT, '_next', 'static')).filter((f) => f.endsWith('.js')),
    ),
    limit: TOTAL_LIMIT,
    gzip: true,
  },
];
```

Run: `npm run build -w apps/web && npm run size -w apps/web`
Expected: mỗi dòng `first load of /`, `first load of /404`, … và `all JavaScript of the site` có `Size limit` và `Size` (gzip), lệnh thoát 0. Nếu `/` vượt 200 kB (R23): chạy `npx size-limit --why` không giúp được (plugin `file` không phân tích bundle); thay vào đó tìm module nặng bằng cách so tên chunk trong `out/index.html` với `out/_next/static/chunks/`, rồi kiểm luật nạp lười (`npm test -w apps/web -- lazy-boundary`). Không nâng ngân sách trong task này: ngân sách là của spec §11.

Ruling R16: ghi số đo JS lần tải đầu của `/` và phần còn dư dưới 200 kB (R23). Lần đo trên khung trần của Task 2 (Next 16 + React 19) đã khoảng 132 kB; Plan 7B và 7C cần biết còn bao nhiêu.

```bash
npm run build -w apps/web
OUT="$(mktemp)"
npm run size --silent -w apps/web -- --json > "$OUT"
node -e "const r=JSON.parse(require('node:fs').readFileSync(process.argv[1],'utf8')).find((x)=>x.name==='first load of /');console.log('first load of /: '+r.size+' B gzip = '+(r.size/1000).toFixed(1)+' kB; headroom '+((200000-r.size)/1000).toFixed(1)+' kB under 200 kB')" "$OUT"
rm -f "$OUT"
```

Expected: một dòng `first load of /: <byte> B gzip = <x> kB; headroom <y> kB under 200 kB` với `<y>` dương (R23). `size-limit` đọc `200 kB` là 200 000 byte, cùng đơn vị với dòng `Size` mà `npm run size -w apps/web` in ra.

Chép nguyên dòng đó vào báo cáo task, dưới tiêu đề "R16". Controller chép hai số vào mục "Interfaces for Plan 7B" (mục "Kích thước").

- [ ] **Step 9: Lighthouse: server nén như host thật, phần chấm điểm thuần có test, rồi script**

Lighthouse giả lập mạng 4G chậm từ số byte thật trên đường truyền. Server tĩnh của Task 2 gửi text không nén, nên JS 200 kB gzip (R23) sẽ thành khoảng 3 lần số byte và LCP, TBT bị đo tệ hơn bản thật trên Vercel (Vercel luôn nén). Server được nén gzip khi trình duyệt chấp nhận; e2e và `worker:check` dùng cùng server nên cũng chạy với nội dung nén.

Trong `apps/web/test/unit/static-server.test.ts`, thêm test này ngay trước `it('never serves a file outside the root', …)`:

```ts
  it('gzips text when the client accepts it, as Vercel does, and leaves compressed formats alone', async () => {
    const page = await fetch(`${server.url}/proof/`, { headers: { 'accept-encoding': 'gzip, br' } });
    expect(page.headers.get('content-encoding')).toBe('gzip');
    expect(page.headers.get('vary')).toBe('accept-encoding');
    expect(await page.text()).toBe('<p>proof</p>');
    const plain = await fetch(`${server.url}/proof/`, { headers: { 'accept-encoding': 'identity' } });
    expect(plain.headers.get('content-encoding')).toBeNull();
    expect(await plain.text()).toBe('<p>proof</p>');
    const font = await fetch(`${server.url}/font.woff2`, { headers: { 'accept-encoding': 'gzip' } });
    expect(font.headers.get('content-encoding')).toBeNull();
  });
```

Run: `npm test -w apps/web -- static-server`
Expected: FAIL ở test mới, `expected null to be 'gzip'`.

Sửa `apps/web/scripts/lib/static-server.ts`. Thêm import ngay sau dòng import `node:path`:

```ts
import { gzipSync } from 'node:zlib';
```

Thêm hằng này ngay sau khối `TYPES`:

```ts
/** Text that Vercel compresses on the way out; woff2, images and wasm are compressed already. */
const COMPRESSIBLE = /^(?:text\/|application\/(?:json|manifest\+json)|image\/svg\+xml)/;
```

Thay khối gửi file trong `startStaticServer`:

```ts
      const body = await readFile(target);
      res.writeHead(status, {
        ...headers,
        'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body);
```

bằng:

```ts
      const body = await readFile(target);
      const type = TYPES[extname(target)] ?? 'application/octet-stream';
      // Lighthouse simulates a slow network from the bytes on the wire, so text goes out gzipped as on Vercel.
      const gzip = COMPRESSIBLE.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '');
      res.writeHead(status, {
        ...headers,
        'content-type': type,
        'cache-control': 'no-store',
        vary: 'accept-encoding',
        ...(gzip ? { 'content-encoding': 'gzip' } : {}),
      });
      res.end(gzip ? gzipSync(body) : body);
```

Run: `npm test -w apps/web -- static-server`
Expected: PASS (5 test). Các test cũ vẫn đạt: `fetch` của Node tự gửi `accept-encoding: gzip, deflate` và tự giải nén.

`apps/web/test/unit/lighthouse-score.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  failures,
  forbiddenRequests,
  type LhrLike,
  medianRun,
  type Run,
  runOf,
  THRESHOLDS,
} from '../../scripts/lib/lighthouse-score';

const PASS: Run = { performance: 0.97, accessibility: 1, bestPractices: 1, seo: 1, lcpMs: 1500, cls: 0, tbtMs: 90 };

const SITE = 'http://127.0.0.1:4000';

/** A result whose network-requests audit lists these rows, as Lighthouse 13 writes them. */
function withRequests(items: readonly unknown[]): LhrLike {
  return { categories: {}, audits: { 'network-requests': { details: { type: 'table', headings: [], items } } } };
}

describe('lighthouse score', () => {
  it('reads the four categories and three metrics; a missing one counts as a failure', () => {
    const lhr = {
      categories: {
        performance: { score: 0.96 },
        accessibility: { score: 1 },
        'best-practices': { score: null },
        seo: { score: 1 },
      },
      audits: {
        'largest-contentful-paint': { numericValue: 1700.4 },
        'cumulative-layout-shift': { numericValue: 0 },
      },
    };
    expect(runOf(lhr)).toEqual({
      performance: 0.96,
      accessibility: 1,
      bestPractices: 0,
      seo: 1,
      lcpMs: 1700.4,
      cls: 0,
      tbtMs: Number.POSITIVE_INFINITY,
    });
  });

  it('takes the run with the median performance score, with its own metrics', () => {
    const runs = [
      { ...PASS, performance: 0.99, lcpMs: 1 },
      { ...PASS, performance: 0.91, lcpMs: 2 },
      { ...PASS, performance: 0.96, lcpMs: 3 },
    ];
    expect(medianRun(runs)).toEqual({ ...PASS, performance: 0.96, lcpMs: 3 });
    expect(() => medianRun([])).toThrow(/no Lighthouse run/);
  });

  it('passes a run that meets every threshold of spec §11, edges included', () => {
    expect(failures(PASS)).toEqual([]);
    const edge = { ...PASS, performance: THRESHOLDS.performance, lcpMs: 1800.4, tbtMs: THRESHOLDS.tbtMs };
    expect(failures(edge)).toEqual([]);
  });

  it('names every threshold a run misses', () => {
    const bad: Run = {
      performance: 0.94,
      accessibility: 0.98,
      bestPractices: 0.96,
      seo: 0.92,
      lcpMs: 1801,
      cls: 0.01,
      tbtMs: 151,
    };
    expect(failures(bad)).toEqual([
      'performance 0.94 < 0.95',
      'accessibility 0.98 < 1',
      'best-practices 0.96 < 1',
      'seo 0.92 < 1',
      'LCP 1801 ms > 1800 ms',
      'CLS 0.01 > 0',
      'TBT 151 ms > 150 ms',
    ]);
  });

  it('rounds CLS to three decimals like the report, so float noise does not fail the gate', () => {
    expect(failures({ ...PASS, cls: 0.0004 })).toEqual([]);
    expect(failures({ ...PASS, cls: 0.0006 })).toEqual(['CLS 0.001 > 0']);
  });

  it('lists each request that matches a forbidden pattern once, in load order', () => {
    const lhr = withRequests([
      { url: `${SITE}/` },
      { url: `${SITE}/_next/static/chunks/sdk-1a2b.js` },
      { url: `${SITE}/_next/static/chunks/app-3c4d.js` },
      { url: `${SITE}/_next/static/chunks/circuits-5e6f.js` },
      { url: `${SITE}/_next/static/chunks/sdk-1a2b.js` },
      { url: `${SITE}/_next/static/chunks/circuits-7a8b.js` },
    ]);
    // A global RegExp keeps state between test() calls; the gate must not depend on it.
    expect(forbiddenRequests(lhr, ['/chunks/sdk-', /circuits-[0-9a-f]+\.js$/g])).toEqual([
      `${SITE}/_next/static/chunks/sdk-1a2b.js`,
      `${SITE}/_next/static/chunks/circuits-5e6f.js`,
      `${SITE}/_next/static/chunks/circuits-7a8b.js`,
    ]);
  });

  it('is empty when nothing matches or no pattern is given, and skips rows without a URL', () => {
    const lhr = withRequests([{ url: `${SITE}/` }, { url: 42 }, 'row', null, {}]);
    expect(forbiddenRequests(lhr, ['/chunks/sdk-'])).toEqual([]);
    expect(forbiddenRequests(lhr, [])).toEqual([]);
  });

  it('fails closed when the run has no network-requests table', () => {
    expect(() => forbiddenRequests({ categories: {}, audits: {} }, ['/chunks/sdk-'])).toThrow(
      /no network-requests table/,
    );
    const noTable: LhrLike = { categories: {}, audits: { 'network-requests': { details: { type: 'opportunity' } } } };
    expect(() => forbiddenRequests(noTable, [])).toThrow(/no network-requests table/);
  });
});
```

Run: `npm test -w apps/web -- lighthouse-score`
Expected: FAIL, không tìm thấy `../../scripts/lib/lighthouse-score`.

`apps/web/scripts/lib/lighthouse-score.ts`:

```ts
/** Spec §11 runs Lighthouse on `/`, `/create/` and `/proof/`; Plan 7B adds `/create/`, Plan 7C Task 3 adds `/proof/`. */
export const LIGHTHOUSE_ROUTES: readonly string[] = ['/'];

export const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'] as const;

/** Spec §11 on mobile: Performance ≥ 95, the other three 100; LCP ≤ 1.8 s, CLS 0, TBT ≤ 150 ms. */
export const THRESHOLDS = {
  performance: 0.95,
  accessibility: 1,
  bestPractices: 1,
  seo: 1,
  lcpMs: 1800,
  cls: 0,
  tbtMs: 150,
} as const;

/**
 * Requests that must not happen while Lighthouse loads a route (spec §18, R18.18), as a substring of the URL or a
 * RegExp. Empty in Plan 7A; Plan 7C Task 6 adds the SDK, circuits and time-machine chunks of `/`.
 */
export const FORBIDDEN_REQUESTS: Readonly<Record<string, readonly (string | RegExp)[]>> = {};

export interface Run {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
  lcpMs: number;
  cls: number;
  tbtMs: number;
}

/** The part of a Lighthouse result the gate reads; the real `Result` type fits it. */
export interface LhrLike {
  categories: Record<string, { score: number | null } | undefined>;
  audits: Record<string, { numericValue?: number; details?: unknown } | undefined>;
}

const score = (lhr: LhrLike, id: string): number => lhr.categories[id]?.score ?? 0;
const metric = (lhr: LhrLike, id: string): number => lhr.audits[id]?.numericValue ?? Number.POSITIVE_INFINITY;

/** A missing score counts as 0 and a missing metric as infinitely slow, so a broken run never passes. */
export function runOf(lhr: LhrLike): Run {
  return {
    performance: score(lhr, 'performance'),
    accessibility: score(lhr, 'accessibility'),
    bestPractices: score(lhr, 'best-practices'),
    seo: score(lhr, 'seo'),
    lcpMs: metric(lhr, 'largest-contentful-paint'),
    cls: metric(lhr, 'cumulative-layout-shift'),
    tbtMs: metric(lhr, 'total-blocking-time'),
  };
}

/** Quyết định 24: the run with the median Performance score; its other numbers come with it. */
export function medianRun(runs: readonly Run[]): Run {
  if (runs.length === 0) throw new Error('no Lighthouse run');
  const sorted = [...runs].sort((a, b) => a.performance - b.performance);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

/** Every threshold the run misses, one readable line each; empty when it passes. */
export function failures(r: Run): string[] {
  const out: string[] = [];
  const atLeast = (name: string, got: number, want: number) => {
    if (!(got >= want)) out.push(`${name} ${got} < ${want}`);
  };
  const atMost = (name: string, got: number, want: number, unit = '') => {
    if (!(got <= want)) out.push(`${name} ${got}${unit} > ${want}${unit}`);
  };
  atLeast('performance', r.performance, THRESHOLDS.performance);
  atLeast('accessibility', r.accessibility, THRESHOLDS.accessibility);
  atLeast('best-practices', r.bestPractices, THRESHOLDS.bestPractices);
  atLeast('seo', r.seo, THRESHOLDS.seo);
  atMost('LCP', Math.round(r.lcpMs), THRESHOLDS.lcpMs, ' ms');
  atMost('CLS', Math.round(r.cls * 1000) / 1000, THRESHOLDS.cls);
  atMost('TBT', Math.round(r.tbtMs), THRESHOLDS.tbtMs, ' ms');
  return out;
}

function hasItems(details: unknown): details is { items: readonly unknown[] } {
  return typeof details === 'object' && details !== null && Array.isArray((details as { items?: unknown }).items);
}

/**
 * The URL of every request in the run that matches a pattern, each once, in load order. Reads the table of the
 * `network-requests` audit; a run without that table throws, so the gate can never pass by reading nothing.
 */
export function forbiddenRequests(lhr: LhrLike, patterns: readonly (string | RegExp)[]): string[] {
  const details = lhr.audits['network-requests']?.details;
  if (!hasItems(details)) throw new Error('Lighthouse result has no network-requests table');
  const out: string[] = [];
  for (const item of details.items) {
    const url = typeof item === 'object' && item !== null ? (item as { url?: unknown }).url : undefined;
    if (typeof url !== 'string' || out.includes(url)) continue;
    // String#search ignores lastIndex, so a global RegExp matches the same way on every URL.
    if (patterns.some((p) => (typeof p === 'string' ? url.includes(p) : url.search(p) !== -1))) out.push(url);
  }
  return out;
}
```

Run: `npm test -w apps/web -- lighthouse-score`
Expected: PASS (8 test).

`apps/web/scripts/lighthouse.ts`:

```ts
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import {
  CATEGORIES,
  failures,
  FORBIDDEN_REQUESTS,
  forbiddenRequests,
  LIGHTHOUSE_ROUTES,
  medianRun,
  type Run,
  runOf,
} from './lib/lighthouse-score';
import { APP_DIR, OUT_DIR } from './lib/run-next';
import { siteHeaders } from './lib/site-headers';
import { startStaticServer } from './lib/static-server';

/** Quyết định 24: three runs per route, the median decides. */
const RUNS = 3;
const REPORTS = join(APP_DIR, 'lighthouse-report');

if (!existsSync(join(OUT_DIR, 'index.html')) || existsSync(join(OUT_DIR, 'e2e'))) {
  console.error('lighthouse: out/ must hold a production build. Run `npm run build -w apps/web` first.');
  process.exit(2);
}

rmSync(REPORTS, { recursive: true, force: true });
mkdirSync(REPORTS, { recursive: true });
const server = await startStaticServer(OUT_DIR, 0, siteHeaders());
// The Chromium that Playwright installed: nothing is downloaded, and no report leaves the machine.
const chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless=new', '--no-sandbox'] });
let failed = false;
try {
  for (const route of LIGHTHOUSE_ROUTES) {
    const runs: Run[] = [];
    const forbidden = new Set<string>();
    for (let i = 1; i <= RUNS; i++) {
      const result = await lighthouse(`${server.url}${route}`, {
        port: chrome.port,
        output: 'html',
        logLevel: 'error',
        onlyCategories: [...CATEGORIES],
      });
      if (!result) throw new Error(`Lighthouse returned nothing for ${route}`);
      const name = route === '/' ? 'home' : route.replaceAll('/', '');
      const report = typeof result.report === 'string' ? result.report : result.report.join('\n');
      writeFileSync(join(REPORTS, `${name}-${i}.html`), report);
      runs.push(runOf(result.lhr));
      // R18.18: a chunk that must wait for intent fails the route when any of the runs loaded it.
      for (const url of forbiddenRequests(result.lhr, FORBIDDEN_REQUESTS[route] ?? [])) forbidden.add(url);
    }
    const median = medianRun(runs);
    const missed = [...failures(median), ...[...forbidden].map((url) => `loaded a forbidden request: ${url}`)];
    console.log(`${route}: ${JSON.stringify(median)}`);
    for (const m of missed) console.error(`  ${route}: ${m}`);
    if (missed.length > 0) failed = true;
  }
} finally {
  chrome.kill();
  await server.close();
}
console.log(failed ? 'lighthouse: FAIL (reports in apps/web/lighthouse-report/)' : 'lighthouse: PASS');
process.exit(failed ? 1 : 0);
```

Biome xếp tên trong import theo thứ tự không phân biệt hoa thường. Nếu `npx biome ci .` báo thứ tự import của hai file trên, chạy `npx biome check --write apps/web/scripts/lighthouse.ts apps/web/test/unit/lighthouse-score.test.ts`.

Run: `npm run build -w apps/web && npm run lighthouse -w apps/web`
Expected: in `/: {"performance":…,"accessibility":1,"bestPractices":1,"seo":1,…}` rồi `lighthouse: PASS`. Mỗi lần chạy để lại `apps/web/lighthouse-report/home-{1,2,3}.html` (bị ignore). Nếu FAIL: mở báo cáo trung vị, sửa nguyên nhân (thường là LCP của tiêu đề Fraunces hoặc một lỗi console), không nới ngưỡng.

Mỗi lần chạy, `forbiddenRequests` đọc bảng của audit `network-requests`. Ở 7A, `FORBIDDEN_REQUESTS` rỗng nên không URL nào bị cấm, nhưng bảng vẫn phải có. Nếu script dừng với `Lighthouse result has no network-requests table`, nghĩa là `onlyCategories` của bản 13.6.0 đã bỏ audit đó. Khi đó thêm `onlyAudits: ['network-requests']` vào options: Lighthouse lấy hợp của hai bộ lọc. Không bỏ lời gọi `forbiddenRequests`.

- [ ] **Step 10: CI chạy e2e, kích thước và Lighthouse**

Thay `scripts/test/site/ci-web-next.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
  'working-directory'?: string;
}
interface Job {
  permissions?: Record<string, string>;
  steps: Step[];
}

const workflow = parse(readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8')) as { jobs: Record<string, Job> };
const job = workflow.jobs['web-next'] as Job;
const commands = (): string[] =>
  (job?.steps ?? [])
    .flatMap((s) => (s.run ?? '').split(/&&|\n/))
    .map((c) => c.trim())
    .filter((c) => c !== '');
const scriptsOf = (dir: string): string[] =>
  Object.keys(
    (JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')) as { scripts?: Record<string, string> })
      .scripts ?? {},
  );
const isNpmScript = (c: string): boolean => c.startsWith('npm run ') || c.startsWith('npm test');

/** Every command of the job, as Plan 7A Task 15 leaves it. */
const WEB_NEXT_COMMANDS = [
  'npm ci',
  'forge build',
  'npm run build',
  'npm run typecheck -w apps/web',
  'npm test -w apps/web',
  'npm run playwright:install -w apps/web',
  'npm run test:build -w apps/web',
  'npm run worker:check -w apps/web',
  'npm run e2e -w apps/web',
  'npm run build -w apps/web',
  'npm run size -w apps/web',
  'npm run lighthouse -w apps/web',
];

test('the web-next job reads only, holds no secret and signs nothing', () => {
  expect(job).toBeDefined();
  expect(job.permissions).toEqual({ contents: 'read' });
  expect(JSON.stringify(job)).not.toMatch(
    /secrets\.|PRIVATE_KEY|DEWEB_OPERATOR_KEY|KEEPER_KEY|SUPABASE_ACCESS_TOKEN|VERCEL_TOKEN|--broadcast|cast send|deweb:publish|eth_sendRawTransaction/,
  );
});

test('the web-next job checks out without keeping credentials and pins every action', () => {
  const checkout = job.steps.find((s) => s.uses?.startsWith('actions/checkout@'));
  expect(checkout?.with?.['persist-credentials']).toBe(false);
  for (const s of job.steps) if (s.uses) expect(s.uses, s.uses).toMatch(/@v\d+$/);
  expect(commands().some((c) => c.startsWith('npx'))).toBe(false);
});

test('the web-next job builds the SDK first, then tests, then builds both targets', () => {
  const c = commands();
  for (const want of WEB_NEXT_COMMANDS) expect(c, want).toContain(want);
  expect(c.indexOf('npm run build')).toBeLessThan(c.indexOf('npm test -w apps/web'));
  expect(c.indexOf('npm run playwright:install -w apps/web')).toBeLessThan(
    c.indexOf('npm run worker:check -w apps/web'),
  );
});

test('the web-next job installs Foundry 1.9.0 and builds the contracts before e2e', () => {
  const foundry = job.steps.find((s) => s.uses?.startsWith('foundry-rs/foundry-toolchain@'));
  expect(foundry?.with?.version).toBe('v1.9.0');
  expect(job.steps.find((s) => s.run === 'forge build')?.['working-directory']).toBe('contracts');
  const c = commands();
  expect(c.indexOf('forge build')).toBeLessThan(c.indexOf('npm run e2e -w apps/web'));
  expect(c.indexOf('npm run playwright:install -w apps/web')).toBeLessThan(c.indexOf('npm run e2e -w apps/web'));
});

test('size and Lighthouse read a fresh production build, made after every other build', () => {
  const c = commands();
  const build = c.indexOf('npm run build -w apps/web');
  for (const before of [
    'npm run test:build -w apps/web',
    'npm run worker:check -w apps/web',
    'npm run e2e -w apps/web',
  ]) {
    expect(c.indexOf(before), before).toBeLessThan(build);
  }
  expect(build).toBeLessThan(c.indexOf('npm run size -w apps/web'));
  expect(c.indexOf('npm run size -w apps/web')).toBeLessThan(c.indexOf('npm run lighthouse -w apps/web'));
});

test('the web-next job runs only npm scripts that exist', () => {
  const runs = commands().filter(isNpmScript);
  expect(runs.length).toBeGreaterThanOrEqual(WEB_NEXT_COMMANDS.filter(isNpmScript).length);
  for (const c of runs) {
    const m = /^npm (?:run ([\w:-]+)|(test))(?: -w (\S+))?/.exec(c);
    expect(m, c).not.toBeNull();
    const [, script, npmTest, workspace] = m as RegExpExecArray;
    expect(scriptsOf(workspace ?? '.'), c).toContain(script ?? npmTest);
  }
});
```

Run: `npx vitest run --config scripts/vitest.site.config.ts scripts/test/site/ci-web-next.test.ts`
Expected: FAIL ở `the web-next job builds the SDK first…` (thiếu `forge build`, `npm run e2e -w apps/web`, …), `the web-next job installs Foundry 1.9.0…` , `size and Lighthouse read a fresh production build…` và `runs only npm scripts that exist` (job cũ có 6 lệnh npm, test cần ít nhất 10).

Trong `.github/workflows/ci.yml`, thay toàn bộ job `web-next` (từ dòng comment ngay trên `web-next:` tới hết job) bằng:

```yaml
  # The Next.js web app v2 (Plan 7A). Read-only and keyless: e2e sends only from unlocked accounts of its own anvil,
  # and no step signs or broadcasts anything to a real chain.
  web-next:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          # forge-std and openzeppelin-contracts; their own nested submodules are not needed.
          submodules: true
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: v1.9.0
      - run: npm ci
      - run: forge build
        working-directory: contracts
      - name: Build circuits and the SDK
        run: npm run build
      - name: Typecheck and unit tests
        run: npm run typecheck -w apps/web && npm test -w apps/web
      - name: Chromium for Playwright
        run: npm run playwright:install -w apps/web
      - name: Production builds of both targets
        run: npm run test:build -w apps/web
      - name: The worker loads under a strict CSP
        run: npm run worker:check -w apps/web
      - name: E2E on a local anvil, with axe, the on-chain request rule and the CSP
        run: npm run e2e -w apps/web
      - name: Size budget per route, on a fresh production build
        run: npm run build -w apps/web && npm run size -w apps/web
      - name: Lighthouse on the production build, run locally
        run: npm run lighthouse -w apps/web
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: web-next-reports
          path: |
            apps/web/playwright-report
            apps/web/lighthouse-report
          retention-days: 7
```

Run: `npx vitest run --config scripts/vitest.site.config.ts scripts/test/site/ci-web-next.test.ts scripts/test/site/ci-web.test.ts`
Expected: PASS (ci-web-next 6 test, cùng các test của job `web` cũ).

- [ ] **Step 11: README của app, AGENTS và spec**

`apps/web/README.md`:

~~~markdown
# @atropyle/web

The Atropyle web app v2: Next.js 16, exported as a static site and built for two targets.

| Target            | Hosting                             | Backend                                        | Build                                                 |
| ----------------- | ----------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| `deweb` (default) | DeWEB, 100% on-chain                | None: the build never contains the backend URL | `npm run build -w apps/web`                           |
| `vercel`          | Vercel, configured by `vercel.json` | Supabase Functions at `NEXT_PUBLIC_API_URL`    | `NEXT_PUBLIC_TARGET=vercel npm run build -w apps/web` |

Build the circuits and the SDK first (`npm run build` at the repository root): the app reads the SDK's `dist`.

## Commands

```bash
npm run dev -w apps/web            # next dev
npm test -w apps/web               # unit tests (Vitest, happy-dom)
npm run typecheck -w apps/web
npm run test:build -w apps/web     # two real production builds, then checks on their output
npm run worker:check -w apps/web   # the proof worker under a strict CSP in Chromium
npm run e2e -w apps/web            # Playwright on a local anvil with a test wallet; needs `forge build` in contracts/
SCREENS=1 npm run e2e -w apps/web -- --project=desktop   # design-review screenshots into test-results/screens/
npm run build -w apps/web && npm run size -w apps/web
npm run lighthouse -w apps/web     # after a production build; reports in lighthouse-report/
```

`npm run playwright:install -w apps/web` installs Chromium once, for `worker:check`, `e2e` and `lighthouse`.

## Build variables

| Variable                 | Values                                                      |
| ------------------------ | ----------------------------------------------------------- |
| `NEXT_PUBLIC_TARGET`     | `deweb` (default) or `vercel`                               |
| `NEXT_PUBLIC_CHAIN`      | `xlayer` (default) or `local`                               |
| `NEXT_PUBLIC_DEPLOYMENT` | A deployment JSON, for e2e and local work                   |
| `NEXT_PUBLIC_API_URL`    | `vercel` only: `https://<project>.supabase.co/functions/v1` |
| `NEXT_PUBLIC_DOCS_PATH`  | `/docs/` when the site carries its own docs                 |

Set them in the environment of the build, not in a `.env` file. The CSP of every page is computed from the build environment, and the build keeps `.env` files away from the backend URL. On Vercel, `NEXT_PUBLIC_API_URL` lives in the project settings.

## Security

- **CSP.** After `next build`, every page gets a `<meta>` policy with the SHA-256 of each of its inline scripts (`scripts/lib/csp.ts`). `connect-src` allows the RPC nodes of the deployment, plus the backend on `vercel`. `vercel.json` adds `frame-ancestors 'none'` and the other directives a meta tag cannot carry.
- **No telemetry, no third parties.** The build sets `NEXT_TELEMETRY_DISABLED=1`. Fonts are self-hosted with their OFL licences in `public/licenses/fonts/`. Lighthouse runs on this machine against the local build.
- **Zero keys.** The app never asks for a key or a seed phrase; people sign in their own wallet. The e2e wallet holds no key either: it sends from unlocked accounts of a local anvil.
- **Untrusted text.** Token names, revert reasons and wallet names are shown through `UntrustedText`, never as HTML or as a link.
- **Readable without JavaScript.** Every page prerenders its text, links and footer; `test/e2e/nojs.spec.ts` opens them with JavaScript off.

## Budgets

Spec §11 (ruling R23), checked in CI: first-load JS of `/` at most 200 kB gzip, any other route at most 240 kB, all JS of the site at most 900 kB (`size-limit`). Lighthouse mobile on `/`: Performance at least 95; Accessibility, Best Practices and SEO 100; LCP at most 1.8 s, CLS 0, TBT at most 150 ms.
~~~

Trong `AGENTS.md`, chèn đoạn sau ngay trước dòng bắt đầu bằng `Integration and e2e tests start their own anvil devnet`:

~~~markdown
The web app v2 in `apps/web` has its own checks. Its e2e, like the legacy one, needs the output of `forge build` in `contracts/` and Chromium. `size` and `lighthouse` read the production build in `apps/web/out`, so run `npm run build -w apps/web` right before them.

```bash
npm run typecheck -w apps/web
npm test -w apps/web
npm run test:build -w apps/web
npm run worker:check -w apps/web
npm run e2e -w apps/web
npm run build -w apps/web
npm run size -w apps/web
npm run lighthouse -w apps/web
```

~~~

Thêm hàng 17 vào bảng §16 của spec `docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md`, ngay sau hàng 16:

```markdown
| 17 | CSP theo hash trong thẻ `<meta>` ở cả hai bản; header của Vercel chỉ mang `frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'` (§8 nói bản vercel đặt CSP qua header) | `vercel.json` là file tĩnh, không chứa được hash của script inline sinh lúc build; header có `script-src` hay `default-src` sẽ chặn chính các script đó. `style-src` cần `'unsafe-inline'` vì HTML prerender có thuộc tính `style` | Header và meta cùng được áp: thêm directive vào header phải kiểm cả hai; bỏ `'unsafe-inline'` ở style cần nonce, tức là cần server |
```

Run: `npx biome ci .`
Expected: không lỗi (Biome không đọc Markdown; `vercel.json`, `.size-limit.mjs` và mọi file `.ts` mới đã đúng format).

- [ ] **Step 12: Kiểm toàn bộ và commit**

```bash
npm run lockfile:check
npm test -w apps/web
npm run typecheck
npx biome ci .
npm run test:build -w apps/web
npm run worker:check -w apps/web
npm run e2e -w apps/web
npm run build -w apps/web
npm run size -w apps/web
npm run lighthouse -w apps/web
npx vitest run --config scripts/vitest.site.config.ts scripts/test/site/ci-web-next.test.ts
git status --short
```

Expected: mọi lệnh PASS; `git status` không liệt kê `apps/web/.size/`, `apps/web/out/`, `apps/web/test/e2e/.site/`, `apps/web/test/e2e/.state.json`, `apps/web/test-results/`, `apps/web/playwright-report/` hay `apps/web/lighthouse-report/`.

Báo cáo task có ba mục:
- "R16": dòng đo của Step 8;
- "Quyết định 6": Kết quả A hoặc B, với Kết quả B kèm dòng lỗi của spy;
- danh sách ảnh nếu đã chạy `SCREENS=1`.

```bash
git add apps/web/scripts/lib/csp.ts apps/web/scripts/lib/site-headers.ts apps/web/scripts/lib/lighthouse-score.ts apps/web/scripts/lib/run-next.ts apps/web/scripts/lib/static-server.ts apps/web/scripts/lighthouse.ts apps/web/vercel.json apps/web/.size-limit.mjs apps/web/playwright.config.ts apps/web/public/robots.txt apps/web/src/app/icon.svg apps/web/README.md apps/web/package.json package-lock.json
git add apps/web/test/unit/csp.test.ts apps/web/test/unit/vercel-config.test.ts apps/web/test/unit/lighthouse-score.test.ts apps/web/test/unit/icon.test.tsx apps/web/test/unit/static-server.test.ts apps/web/test/build/csp.test.ts apps/web/test/build/html-purity.test.ts
git add apps/web/test/e2e/global-setup.ts apps/web/test/e2e/network.ts apps/web/test/e2e/fixtures.ts apps/web/test/e2e/helpers.ts apps/web/test/e2e/screens.ts apps/web/test/e2e/state.ts apps/web/test/e2e/wallet.ts apps/web/test/e2e/offchain.spec.ts apps/web/test/e2e/shell.spec.ts apps/web/test/e2e/legacy.spec.ts apps/web/test/e2e/wallet.spec.ts apps/web/test/e2e/motion.spec.ts apps/web/test/e2e/csp.spec.ts apps/web/test/e2e/worker.spec.ts apps/web/test/e2e/nojs.spec.ts
git add .gitignore biome.json .github/workflows/ci.yml scripts/test/site/ci-web-next.test.ts AGENTS.md docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md
git commit -m "feat(web): hashed page CSP, Vercel headers, e2e with axe on anvil, size and Lighthouse budgets" -m "Ruling 17 of the spec records the CSP split between the meta tag and the Vercel header." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Chỉ khi ra Kết quả B, thêm ngay trước `git commit`:

```bash
git add apps/web/src/shell/nav-link.tsx apps/web/src/motion/view-transition.tsx apps/web/src/shell/nav-list.tsx apps/web/src/shell/footer.tsx apps/web/src/shell/header.tsx apps/web/test/unit/nav-link.test.tsx apps/web/test/unit/shell.test.tsx
```

Nếu lệnh `grep -ln` ở Step 7b liệt kê thêm file test nào, `git add` cả file đó, theo đường dẫn.

Khi ra Kết quả B, lệnh commit có thêm một `-m` ngay trước dòng `Co-Authored-By`:

```bash
-m "NavLink starts the view transition of a client navigation: React did not start one in this Next version."
```

---

## Interfaces for Plan 7B

Plan 7B dựng các trang trên nền này và chỉ cần đọc mục này cùng các file được nêu. Đường dẫn tính từ `apps/web/`; mã trong `src/` import qua alias `@/`. Chữ ký dưới đây là bản cuối cùng, sau Task 15. Mọi component là client component (`'use client'`) trừ khi ghi khác.

### Luật Plan 7B phải giữ

1. **Route mới** là `src/app/<segment>/page.tsx`. Tham số động nằm sau `#` và đọc bằng `useLocationHash()`; đổi tham số mà không thêm mục lịch sử bằng `replaceHash()`. Link tới route dùng `ROUTES` và các hàm `*Href` của `src/routes.ts`. Khi route đích đã có, bỏ `prefetch={false}` ở link trỏ tới nó (Quyết định 22).
2. **Ranh giới nạp lười** (Global Constraints, test `lazy-boundary`): mã dùng chung trong `src/` chỉ `import type` từ `@atropyle/sdk*`, `viem*` và `**/impl/**`. Thư mục route con `src/app/<segment>/**` được import giá trị SDK trực tiếp, nhưng JS lần tải đầu của route vẫn ≤ 240 kB gzip (R23). `.size-limit.mjs` tự thêm mọi trang HTML mới vào phép đo, không cần sửa.
3. **Lighthouse:**
   - thêm `'/create/'` (7B) và `'/proof/'` (7C T3) vào `LIGHTHOUSE_ROUTES` (`scripts/lib/lighthouse-score.ts`) khi route đó có, bằng cách thêm vào mảng đang có, không ghi đè (spec §11);
   - request bị cấm theo route nằm trong `FORBIDDEN_REQUESTS`: 7C T6 điền cho `/` các chunk SDK, circuits và time-machine (R18.18);
   - `npm run lighthouse` hỏng khi một lần chạy bất kỳ tải một URL khớp mẫu (`forbiddenRequests`).
4. **Văn bản không tin cậy** (tên token, lý do revert, tên ví, `state` của `MeVault`) chỉ hiển thị qua `UntrustedText`, `Amount` (với `symbol: Untrusted`) hoặc `ErrorBox`. Link ra ngoài chỉ qua `ExternalLink` (bản deweb: chữ thường lúc prerender, test `html-purity`). Không `dangerouslySetInnerHTML` (test `no-html-sinks`).
5. **Giao dịch:** trang dựng `TxPlan` bằng SDK trong thư mục route con, rồi `const runner = useTxRunner({ plan, onDone })` và `<TxCard runner={runner} label=… />`. Nghi thức (check-in) dùng `confirm="hold"`; plan không hoàn tác được dùng `tone="danger"`. Sau `onDone`, làm mới dữ liệu bằng `useInvalidateVault()`.
   - `useTxRunner` không mở thêm lời nhắc ví nào khi thẻ đã unmount (người dùng bấm một link trong khung) hay plan đã bị đổi. SDK nhận một client có `sendTransaction` từ chối bằng `pageGone()` (`USER_REJECTED`, chunk `tx/impl`). Lời nhắc đang mở vẫn ký được, nên plan dừng nửa chừng, cùng trạng thái chain như khi người dùng từ chối. 7B T3 viết lại runner thì giữ chốt này (`alive.current && live.current === sent`) và áp nó cho cả đường `wallet_sendCalls`: không gọi `sendCalls` cho một trang đã rời đi.
   - `useLeaveGuard` chỉ hỏi khi đóng hay tải lại tab (`beforeunload`), và đó là chủ ý. NavLink và Link chuyển trang trong app mà không hỏi. Trang giữ một plan đã cam kết (`committed && result === null`) chọn một trong hai cách và ghi vào báo cáo task. Cách thứ nhất là chấp nhận điều đó: runner đã ngừng nhắc ví, và luồng chuẩn bị lại plan từ chain như sau một lần từ chối. Cách thứ hai là chặn cả điều hướng trong app: listener `navigate` của Navigation API gọi `preventDefault` khi người dùng không xác nhận, hoặc chặn click ở capture phase trên anchor cùng origin.
6. **Chuỗi giao diện** nằm trong `src/messages/<trang>.messages.ts` (`defineMessages(en, vi)`, VI đủ khoá) và đọc bằng `useT(messages)`. Tên ngôn ngữ, mã lỗi và địa chỉ không dịch.
7. **Backend** chỉ qua `src/api/hooks.ts`. Bản deweb không có backend: query đứng yên (`fetchStatus === 'idle'`), mutation hỏng với `ApiError` mã `UNAVAILABLE`; trang phải có cách hiển thị trạng thái đó (ví dụ `/me/` đọc chain bằng `useVaultsOf`).
8. **CSP:** không thêm `<script>` inline, `eval`, iframe hay origin mới. `connect-src` của mỗi trang sinh từ `connectOrigins(env)`: RPC của deployment, cộng backend ở bản vercel. Một origin mới phải vào `scripts/lib/csp.ts` kèm test.
9. **E2E** (`test/e2e/`):
   - Import `test`, `expect`, `ANVIL` từ `./fixtures.ts`. Ba lưới chặn (request off-chain, vi phạm CSP, lỗi trang) tự chạy sau mỗi test.
   - Mỗi trang mới có một test `expectAccessibleInBothThemes(page, ready?)`:
     - Helper đổi theme bằng lựa chọn đã lưu rồi tải lại: vellum trước, night sau, và kết thúc ở night (R18.17).
     - Sau mỗi lần tải lại, trang chạy lại từ URL. Truyền `ready` khi nội dung đến sau lúc tải (vault đọc từ chain).
     - Không gọi helper khi một dialog đang mở: khi đó dùng `expectAccessible`.
   - Không bao giờ đổi theme bằng `page.emulateMedia({ colorScheme })`, vì night không theo hệ điều hành. Dùng `setStoredTheme(page, 'dark' | 'light')` và `setStoredLang(page, 'en' | 'vi')`.
   - `emulateMedia({ reducedMotion })` vẫn dùng được.
   - Ví giả: `await wallet({ account: ANVIL[1], sendCalls?: true, chainId?, knownChains? })`.
   - Tua thời gian bằng `warp(state, seconds)` của `./state.ts`.
   - Vault mẫu đã seed ở `state.seeded.{simple,guarded,grace}`.
   - `settle(page)` bỏ qua animation lặp và animation theo cuộn (R15). 7C T7 Step 7 không còn.
10. **Test id ổn định** mà e2e của Plan 7B dựa vào: `TxCard` (`tx`, `tx-progress`, `tx-step-<i>` với `data-phase`, `tx-send`, `tx-connect`, `tx-wrong-account`, `tx-done`, `tx-copy-link`, `warning-<code>`), `ErrorBox` (`error`, `data-code`), `network-banner`, ví giả tên `Test Wallet`.
11. **Theme** (R18.1).
    - Night là mặc định và không có thuộc tính.
    - Vellum theo phạm vi là `data-theme="light"` trên chính phần tử đó (lá thư người thừa kế, bản in). Phần tử đó tự tô nền `--atro-bg` và chữ `--atro-ink`; lớp tiện ích bên trong dùng token vellum.
    - `data-theme="system"` chỉ có nghĩa trên `<html>`.
    - Không trang nào đọc `prefers-color-scheme` để chọn theme. Ảnh chụp và axe đổi theme bằng `KEYS.theme` trong `localStorage` rồi tải lại.
12. **Dòng bằng chứng** (R18.7).
    - `Frame` đã vẽ nó trên mọi trang. Trang không vẽ lại, không che, không lặp các fact của nó trong hero.
    - `/proof/` (7C T3) có phần tử `id="limits"`, và khi đó bỏ `prefetch={false}` ở hai link của dòng này và ở link "Known limits" của footer.
13. **Tên View Transition** `site-header`, `site-footer` và `atropyle-thread` đã có chủ. Không trang nào đặt chúng cho phần tử khác.
14. **Số liệu.**
    - Keccak, ngày mainnet và nhịp keeper import từ `src/config/facts.ts`.
    - Số phút, số ngày hay số trường hợp mới phải do test tính từ SDK hoặc từ một hằng sinh ra, như `drill-minutes.test.ts`.
    - Footer hứa "No trackers · No cookies", nên không trang nào được thêm cookie hay request tới bên thứ ba.
15. **Không có trang `/dev/`** (spec §18, cắt C7): không gallery, không specimen. Duyệt bằng mắt bằng ảnh chụp các trang thật (luật 16). `next.config.mjs` không còn trang chỉ có lúc dev, và test build kiểm `out/dev/` không tồn tại.
16. **Ảnh duyệt thiết kế** (R18.13), qua `test/e2e/screens.ts` của 7A (7B T4 không tạo file này):
    - Gọi `captureScreens(page, name)` trong một test có `test.skip(!shouldCapture(info.project.name), …)`. Lệnh chạy: `SCREENS=1 npm run e2e -w apps/web -- --project=desktop`.
    - Mỗi màn hình có 3 ảnh: night EN 1440, night EN 390, night VI 390, vào `test-results/screens/<name>/<night|vellum>-<lang>-<width>.png`.
    - `captureScreens(page, name, { vellum: true })` chỉ dùng cho bề mặt vellum (lá thư người thừa kế, bản in). Lượt đủ hai theme nằm ở 7C T12.
    - Màn hình phải sống qua một lần tải lại: trạng thái nằm trong hash hoặc `sessionStorage`.
    - Đính đường dẫn ảnh vào báo cáo task.
17. **Không có JavaScript** (`test/e2e/nojs.spec.ts`):
    - Mỗi trang đọc được mà không cần JS thì thêm một mục `{ path, content(page) }` vào `PAGES`. `expectFrame` (dòng bằng chứng, footer) tự chạy cho mọi mục.
    - 7B T12 thêm `{ path: 'verify/', content }`: `content` kiểm `<noscript>` trỏ tới `npx atropyle verify`.
    - 7C T3 thêm `{ path: 'proof/', content }`.
    - Kiểm bằng `expectSeen`: hiện ra, và không phần tử cha nào có `opacity: 0`.
18. **View transition khi điều hướng** (Task 15 ra Kết quả B; spec §16 hàng 18). React không mở view transition khi điều hướng trên client: spy `document.startViewTransition` của `test/e2e/motion.spec.ts` không bao giờ được gọi khi bấm một `Link` thường.
    - Mọi link sang route khác, của khung và của trang, dùng `NavLink` (`import { NavLink } from '@/shell/nav-link'`). Nó nhận đúng prop của `Link`, với `href` là chuỗi; `prefetch`, `replace`, `scroll`, `transitionTypes` và `onNavigate` vẫn có tác dụng.
    - `next/link` chỉ dùng cho link hash trong cùng trang.
    - Test `next-link-imports` hỏng khi một file trong `src/` import `next/link` mà không có tên trong danh sách `ALLOWED` của nó. Hiện danh sách có `shell/nav-link.tsx` và `home/hero.tsx`. 7C thay `hero.tsx` thì CTA dùng `NavLink`, và 7C bỏ file đó khỏi danh sách.
    - `NavLink` tự mở transition bên ngoài React và giữ ảnh cũ cho tới khi pathname mới commit, tối đa 1 giây. Route chưa có thì Next tải lại cả trang sau khoảng chờ đó.
    - Khi một route của nav đã có, 7B có thể thêm vào test spy một ca bấm nav từ `/`.
19. **Lần tải đầu của `/` (R23).** Phần dư dưới 200 kB còn 11,4 kB (mục Kích thước ở cuối), nên:
    - Component `m.*` lấy từ `motion/react-m` (`import * as m from 'motion/react-m'`); chỉ `MotionProvider` import từ `motion/react`. Test `motion-imports` và `test/build/first-load.test.ts` kiểm: một `import { m } from 'motion/react'` kéo mọi feature của Motion vào lần tải đầu của mọi trang (khoảng 36 kB).
    - Khung và trang `/` không dùng tĩnh `Dialog`, `Popover`, `Tooltip` hay `IconButton` có tooltip: nút vẽ ngay là `PlainIconButton` hay một `<button>` thường, nội dung nạp bằng `lazyChunk` + `useLazyOverlay` (mẫu ở `src/shell/settings-menu.tsx`). Thư viện QR cũng vậy. `first-load.test.ts` kiểm Radix và QR trên `/` và các trang 404; route khác của 7B được dùng chúng ngay từ lần vẽ đầu, trong 240 kB của mình.
    - Lần bấm đầu không được chờ chunk: điện thoại không có hover. Frame nạp chunk của các overlay khi trang rảnh (`useWarmOverlays`, `whenIdle`), và mọi nút gọi `useWallet().openSheet()` trải `onPointerEnter={connectSheet.preload}` và `onFocus={connectSheet.preload}` (như `WalletButton` và `TxCard`). Overlay lazy mới mà nút nằm trong khung thì thêm `preload` của mình vào `useWarmOverlays`. Trong lúc chờ, nút báo `aria-busy` (trigger của `useLazyOverlay` có sẵn; `PlainIconButton` đổi icon thành spinner) và vẫn bật, nên focus ở lại trên nút.
    - Chunk hỏng khi người đọc bấm: `onError` của `useChunk` gọi `reportLoadFailure()`, và `LoadNotice` (trong Frame) nói ra và cho tải lại trang. `useLazyOverlay` và `ConnectSheetSlot` đã làm vậy. Không tự tải lại trang: một form đang điền sẽ mất.
    - Vùng live (`aria-live`, `role="alert"`) phải có từ lần vẽ đầu, nội dung lazy đi vào bên trong; một vùng vào DOM đã có chữ thì trình đọc màn hình không chắc đọc. `NetworkBannerSlot` và `LoadNotice` là mẫu, `test/build/shell.test.ts` kiểm cả hai.
    - Chuỗi của sheet ví, menu ví và banner sai mạng nằm trong `wallet-overlays.messages.ts`, chỉ chunk của chúng import; `wallet.messages.ts` chỉ còn chuỗi của nút ví. `VisuallyHidden` là một `<span className="sr-only">`: bản của Radix kéo Primitive và Slot vào lần tải đầu qua `Spinner`, và app không còn dependency `@radix-ui/react-visually-hidden`.
20. **Mọi ký tự hiện ra đều có trong font tự host.** Subset của Fontsource thiếu nhiều ký hiệu, chẳng hạn `→` (U+2192). Ký tự thiếu thì trình duyệt vẽ bằng font hệ thống: trông lạc, và trên Linux, lần tìm font thay thế đầu tiên chặn main thread ngay lúc vẽ đầu. CI của 7A đo được TBT 826 ms chỉ vì một `→` trong dòng bằng chứng. Mũi tên và ký hiệu khác vẽ bằng icon `lucide-react` có `aria-hidden="true"`, không bằng ký tự. `test/unit/glyphs.test.ts` kiểm mọi chuỗi EN và VI trong `*.messages.ts`, `test/build/glyphs.test.ts` kiểm chữ của mọi trang prerender: mỗi ký tự phải có glyph trong cả ba họ font. Chuỗi dựng trong code thì không test nào bắt, nên người viết tự giữ luật này. Ví dụ: `detail` trong `src/verify/verify-view.ts` vẫn nối hai hash bằng `→`, và 7B vẽ giá trị expected và actual bằng icon khi hiện hàng đó.

### Khoảng trống đã biết

7A để lại các chỗ dưới đây, mỗi chỗ có task chủ. Task đó đóng nó, hoặc báo cáo vì sao không. Vài chỗ liên quan tới an toàn tiền: gửi lại một giao dịch, nói "Confirmed" trước receipt, chạy proof hai lần.

- **`TxCard` với `confirm="hold"`** (7B T10, cả nút Nhận của 7B T11; R18.16). Giữ xong thì `HoldButton` hiện `ui.holdDone` ("Confirmed" / "Đã xác nhận") và thắt nút trước khi ví mở, trong lúc vùng live của thẻ nói "Confirm in your wallet". 7B T10 thêm `doneLabel` và `showKnot` cho `HoldButton`, và mọi `TxCard` dùng `hold` truyền một nhãn không nói đã xác nhận. Ở VI, `ui.holdDone` và chuỗi tiến độ `tx.progress` "Đã xác nhận {done}/{total}" có cùng chữ đầu: test tìm theo test id hay vùng, không theo chữ "Đã xác nhận".
- **`useTxRunner`** (7B T3).
  - Bước đã có hash mà đọc receipt hỏng (SDK: "was sent in transaction X, but its receipt could not be read") vẫn được mời gửi lại. `details.completed` chỉ đếm các bước trước nó, nên `offset` giữ bước đó, và "Resume from step N" cùng link hand-off gửi một giao dịch có thể vẫn lên chain. Gửi một bước hai lần có thể chuyển tài sản hai lần.
  - `result` và `onDone(result)` chỉ chứa các bước của lần gửi tiếp tục cuối cùng, với chỉ số tính từ đầu sub-plan đó: chỉ số 0 là bước `offset`.
  - Đổi plan giữa lúc gửi làm mất lần gửi đó, vì reset trong render chạy cả khi `inFlight`. Các hàng về `ready`, `committed` về false, và lần bấm sau gửi lại cả các bước đã xác nhận. Chốt của luật 5 chỉ chặn lời nhắc ví mới.
- **`runProof`** (7C T3, quyết định 3 của 7C). Truyền `signal` làm lượt chạy thành lượt mới, không cache, kể cả khi không có `blocks`. Chỉ truyền `signal` cùng `blocks` (`again()`, `MINI_BLOCKS`), không bao giờ ở `start()`: nếu không, `start()` chạy một proof 2^26 thứ hai bên cạnh proof của `/verify/`.
- **`loadVault`** (7B T9). Vault của factory khác có `binding.cpu` giả làm hỏng cả lần đọc (ví dụ `POLICY_MISMATCH`) thay vì trả `registered: false`, nên màn "không do factory này tạo" không bao giờ hiện. Sửa cần một ruling: `LoadedVault.timeline` có thể null, hoặc một kết quả "chưa đăng ký" riêng.
- **Mọi chỗ dùng `failedEmpty`** (7C T8 `IndexRow` và `MePage`, mọi trang đọc). Một lần đọc hỏng trước khi có dữ liệu không tự đọc lại, kể cả lỗi tạm như `RPC_UNAVAILABLE` hay 429. Chỗ dùng `useVault`, `useVaultsOf` hay hook backend phải có nút Retry cho trạng thái đó. Ẩn hàng lỗi mà không có Retry là sai.
- **`freshest()`** (7C T7). Câu trả lời API ở block cao hơn luôn thắng, kể cả ngay sau `refresh()` (người dùng bấm đếm từ chain). Một backend báo block quá xa thì thắng mãi.
- **`Amount`** (7B T9). Giá trị gốc chỉ nằm trong tooltip lúc hover hay focus. Trên màn chạm Radix Tooltip không mở, nên không xem được.
- **Link chỉ đổi hash trong cùng route** (7B T7, T9). Trình duyệt không có Navigation API (Safari trước 26.2, Firefox trước 147) chỉ báo `hashchange` và `popstate`, nên `useLocationHash` giữ giá trị cũ sau một `Link` như vậy. Đổi tham số trong cùng trang bằng `replaceHash()` (luật 1).

### Cấu hình, route và môi trường

```ts
// src/config/env.ts
export type Target = 'vercel' | 'deweb';
export interface RawEnv { NEXT_PUBLIC_TARGET?: string; NEXT_PUBLIC_CHAIN?: string; NEXT_PUBLIC_DEPLOYMENT?: string; NEXT_PUBLIC_API_URL?: string; NEXT_PUBLIC_DOCS_PATH?: string; NEXT_PUBLIC_APP_VERSION?: string }
export interface AppEnv { target: Target; chain: ChainName; deploymentJson: string | null; apiUrl: string | null; docsPath: '/docs/' | null; version: string }
export function targetOf(raw: string | undefined): Target;                 // raw bắt buộc (không có `targetOf()`): chỗ gọi
export function chainNameOf(raw: string | undefined): ChainName;           // truyền tường minh process.env.NEXT_PUBLIC_*,
export function apiUrlOf(target: Target, raw: string | undefined): string | null; // nên Next thay đúng chuỗi đó lúc build
export function readEnv(raw: RawEnv): AppEnv;
export function chainIdOf(env: Pick<AppEnv, 'chain' | 'deploymentJson'>): number;
export function explorerUrlOf(env: Pick<AppEnv, 'chain' | 'deploymentJson'>): string | null;
export const XLAYER_EXPLORER = 'https://www.oklink.com/xlayer';
export const ENV: AppEnv;
export const IS_VERCEL: boolean;

// src/config/facts.ts (mỗi hằng có test đọc nguồn thật của nó: test/unit/facts.test.ts)
export const POLICY_NETLIST_KECCAK: string; // deployments/xlayer.json circuits.netlistKeccak.policy; hiển thị '0x7016…3864'
export const MAINNET_SINCE = '2026-11-22';  // test buộc factoryBlock === '76567034'
export const KEEPER_CADENCE_S = 60;         // lịch pg_cron 'atropyle-tick' trong supabase/migrations

// src/routes.ts
export const ROUTES: { home: '/'; create: '/create/'; vault: '/vault/'; verify: '/verify/'; sign: '/sign/'; proof: '/proof/'; me: '/me/'; join: '/join/'; alertsConfirm: '/alerts/confirm/'; alertsUnsubscribe: '/alerts/unsubscribe/'; status: '/status/'; developers: '/developers/'; privacy: '/privacy/' };
export type RouteName = keyof typeof ROUTES;
export type NavKey = 'navCreate' | 'navMe' | 'navProof' | 'navDevelopers';
export const NAV: readonly { route: RouteName; key: NavKey }[];
export const LIMITS_HREF: string;                                       // '/proof/#limits'
export function createHref(mode?: 'drill' | 'real'): string;            // '/create/#drill' (mặc định) | '/create/#real'
export function vaultHref(vault: string): string;                       // '/vault/#<vault>'
export function verifyHref(vault: string): string;                      // '/verify/#<vault>'
export function joinHref(vault: string, role: 'guardian' | 'heir'): string; // '/join/#<vault>.<role>'
export function signHref(encodedPayload: string): string;               // '/sign/#p=<payload>'
export function toSdkSignLink(hash: string): string;
export function isCurrent(pathname: string, href: string): boolean;
export { legacyTarget } from './theme/boot';                            // (pathname: string, hash: string) => string | null

// src/lib/hash.ts
export function useLocationHash(): string;       // gồm '#', '' lúc prerender và hydrate
export function replaceHash(hash: string): void; // không thêm mục lịch sử; mọi useLocationHash nhận giá trị mới
```

### i18n, bộ nhớ, theme, helper

```ts
// src/i18n/core.ts
export type Lang = 'en' | 'vi';
export interface Messages<K extends string> { en: Record<K, string>; vi: Record<K, string> }
export type Params = Record<string, string | number | bigint>;
export function defineMessages<K extends string>(en: Record<K, string>, vi: Record<NoInfer<K>, string>): Messages<K>;
export function format(template: string, params?: Params): string;
export function translate<K extends string>(m: Messages<K>, lang: Lang, key: K, params?: Params): string;
export function placeholders(s: string): string[];
export function detectLang(stored: string | null, languages: readonly string[]): Lang;

// src/i18n/provider.tsx
export function LangProvider(p: { children: ReactNode }): JSX.Element;
export function useLang(): { lang: Lang; setLang(l: Lang): void };
export function useT<K extends string>(m: Messages<K>): (key: K, params?: Params) => string;

// src/lib/store.ts, src/lib/kv.tsx
export interface KV { get(key: string): string | null; set(key: string, value: string): void; remove(key: string): void }
export function memoryKV(): KV;
export function safeKV(storage: () => Storage | null | undefined): KV;
export function jsonStringify(value: unknown, space?: number): string; // bigint thành chuỗi thập phân
export function readJson<T>(kv: KV, key: string, revive: (raw: unknown) => T | null): T | null;
export function writeJson(kv: KV, key: string, value: unknown): void;
export const KEYS: { lang: 'atropyle:lang'; crossCheck: 'atropyle:crossCheck'; theme: 'atropyle:theme'; haptics: 'atropyle:haptics'; wallet: 'atropyle:wallet'; stats: 'atropyle:stats' };
export function KVProvider(p: { kv?: KV; children: ReactNode }): JSX.Element;
export function useKV(): KV;

// src/theme/theme.ts, src/theme/provider.tsx, src/theme/boot.ts, src/theme/boot-script.tsx
export type ThemeChoice = 'dark' | 'light' | 'system';                // night | vellum | match device (R18.1)
export const THEME_CHOICES: readonly ThemeChoice[];                    // ['dark', 'light', 'system'], thứ tự của ThemeSwitch
export const DEFAULT_THEME: 'dark';                                    // night, bất kể thiết bị
export function parseTheme(raw: string | null | undefined): ThemeChoice; // đúng một trong ba; mọi giá trị khác là 'dark'
export function readThemeAttr(): ThemeChoice;                          // data-theme của <html>; không có thuộc tính là 'dark'
export function subscribeTheme(cb: () => void): () => void;
export function applyTheme(choice: ThemeChoice, root?: HTMLElement): void; // 'dark' gỡ data-theme; 'light' | 'system' đặt nó; root có thể là phần tử bất kỳ (vellum theo phạm vi)
export function ThemeProvider(p: { children: ReactNode }): JSX.Element;    // prerender: choice 'dark'
export function useTheme(): { choice: ThemeChoice; resolved: 'light' | 'dark'; setChoice(c: ThemeChoice): void }; // resolved: 'system' theo thiết bị
export function legacyTarget(pathname: string, hash: string): string | null;
export function boot(themeKey: string, legacy: (pathname: string, hash: string) => string | null): void; // đặt data-theme chỉ khi đã lưu 'light' hoặc 'system'
export const BOOT_SCRIPT: string;
export function BootScript(): JSX.Element; // server component, trong <head> của layout

// src/lib/address.ts, untrusted.ts, duration.ts, docs.ts
export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean;
export function isAddressText(s: string): boolean;
export function addressGroups(address: string): string[];   // ['0x', 10 cụm 4 ký tự]; không phải địa chỉ thì [address]
export function compactAddress(address: string): string;    // '0x7099 7970 … 17dc 79C8'
export interface Untrusted { readonly untrusted: true; readonly value: string; readonly truncated: boolean }
export function untrusted(raw: unknown, max?: number): Untrusted;
export function formatDuration(seconds: number | bigint): string;
export const DOCS_BASE_URL: string;
export function errorDocsUrl(code: string): string;

// src/lib/format.ts (port nguyên văn)
export function formatAmount(raw: bigint, decimals: number | null, maxFraction?: number): string;
export function formatBps(bps: number): string;
export function formatTimestamp(ts: bigint): string;
export function formatRemaining(target: bigint, now: bigint): { past: boolean; text: string };
export function coveragePercent(coverage: bigint, held: bigint): number | null;
export function chainNow(blockTimestamp: bigint, fetchedAtMs: number, nowMs: number): bigint;

// src/lib/links.ts, cn.ts, use-mounted.ts, use-now.ts
export const REPO_URL: string; export const LICENSE_URL: string; export const XLAYER_URL: string;
export function explorerAddress(base: string, address: string): string;
export function explorerTx(base: string, hash: string): string;
export function explorerName(base: string): string;
export function docsHome(docsPath: string | null): string;
export type ClassValue = string | false | null | undefined;
export function cn(...v: ClassValue[]): string;
export function useMounted(): boolean;                     // false lúc prerender và hydrate
export function useNow(intervalMs?: number): number | null; // null lúc prerender

// src/lib/lazy-chunk.ts (R23)
export interface LazyChunk<T> { peek(): T | null; load(): Promise<T>; preload(): void } // load một lần; hỏng thì lần sau thử lại; preload nuốt lỗi
export function lazyChunk<T>(importer: () => Promise<T>): LazyChunk<T>;
export function useChunk<T>(chunk: LazyChunk<T>, wanted: boolean, onError?: () => void): T | null; // null tới khi nạp xong; đã nạp thì giữ
export function reportLoadFailure(): void;  // cho onError của useChunk khi người đọc bấm; LoadNotice hiện tới lần một chunk nạp được
export function useLoadFailed(): boolean;   // false lúc prerender và hydrate
export function whenIdle(task: () => void): () => void; // requestIdleCallback (timeout 4 s), Safari thì setTimeout 1,5 s; trả hàm huỷ

// src/messages/labels.messages.ts (mọi *.messages.ts export `messages`)
export const messages: Messages<LabelKey>;
export type LabelKey = keyof typeof messages.en;
export const STATE_KEY: Record<StateName, LabelKey>;
export const ROLE_KEY: Record<Role, LabelKey>;
export const THREAD_STATE_KEY: Record<StateName | 'expired', LabelKey>;
```

`src/messages/` đã có (port từ web cũ ở Task 5, thêm mới ở các task sau): `labels`, `common`, `shell`, `ui`, `tx`, `wallet`, `wallet-overlays` (sheet ví, menu ví, banner sai mạng; luật 19), `api` (lỗi backend, `src/api/errors.ts`), `home`, `create`, `developers`, `guardian`, `heir`, `owner`, `sign`, `status`, `vault`, `verify`, `action-runner`, `editors`. Plan 7B sửa nội dung các file trang, giữ khoá mà test đang đọc.

Selector CSS mà Plan 7B được dựa vào:

| Selector | Nghĩa |
| --- | --- |
| `:root` | night |
| `[data-theme="light"]` | vellum, ở `<html>` hay ở bất kỳ phần tử nào |
| `:root[data-theme="system"]` trong `@media (prefers-color-scheme: light)` | match device |

Meta `theme-color` là `#0b0d12` và meta `color-scheme` là `dark` dưới mọi theme. Thuộc tính CSS `color-scheme` thì theo theme: `dark` trên `:root`, `light` trên `[data-theme="light"]` (cả vellum theo phạm vi) và trên `:root[data-theme="system"]` khi thiết bị thích sáng.

### Motion, sợi chỉ, trạng thái

```ts
// src/motion/tokens.ts
export const DURATION: { instant: 90; quick: 160; base: 240; slow: 420; story: 720 };
export type DurationName = keyof typeof DURATION;
export const sec: (ms: number) => number;
export const EASE_OUT_EXPO: readonly [0.16, 1, 0.3, 1];
export const EASE_IN_OUT_SINE: readonly [0.37, 0, 0.63, 1];
export const SPRING: { type: 'spring'; stiffness: 380; damping: 32; mass: 1 };
export const SPRING_MS = 443; export const HOLD_MS = 600; export const REDUCED_MS = 120;
export function springAt(t: number): number;
export function springStops(samples?: number): number[];
export const SPRING_EASING: string;                                     // --ease-spring dạng linear() cho Web Animations API

// src/motion/provider.tsx, view-transition.tsx, haptics.ts, use-hold.ts
export function MotionProvider(p: { children: ReactNode }): JSX.Element; // MotionConfig reducedMotion="user" + LazyMotion strict
export function usePrefersReducedMotion(): boolean;                     // false lúc prerender và hydrate
export const THREAD_VT_NAME = 'atropyle-thread';                      // <Thread shared> đặt nó lên chính gốc (style view-transition-name); không còn SharedThread: <ViewTransition name> của React chỉ đặt tên trong transition do React tự mở, mà NavLink mở mọi transition (Task 15, Kết quả B)
export function withViewTransition(update: () => void): void;
export function canVibrate(): boolean;
export function useHaptics(): { supported: boolean; enabled: boolean; setEnabled(on: boolean): void; pulse(): void };
export type HoldPhase = 'idle' | 'holding' | 'done';
export interface HoldOptions { duration?: number; disabled?: boolean; onConfirm(): void; onCancel?(progress: number): void }
export interface HoldBind { onPointerDown(e: PointerEvent<HTMLElement>): void; onPointerUp(): void; onPointerLeave(): void; onPointerCancel(): void; onKeyDown(e: KeyboardEvent<HTMLElement>): void; onKeyUp(e: KeyboardEvent<HTMLElement>): void; onClick(e: MouseEvent<HTMLElement>): void; onContextMenu(e: MouseEvent<HTMLElement>): void; onBlur(): void }
export function useHold(o: HoldOptions): { phase: HoldPhase; bind: HoldBind };

// src/motion/move.ts
export type RevealMove = 'spring' | 'instant' | { linear: number };    // reveal-window.tsx export lại
export type Move = readonly [element: HTMLElement | null | undefined, transform: string];
export function moveTiming(move: RevealMove): { duration: number; easing: string } | null; // null: instant, reduced motion, linear không hữu hạn hoặc ≤ 0
export function moveTogether(moves: readonly Move[], move?: RevealMove): void; // Web Animations API: mọi phần tử đi từ chỗ đang đứng (cả giữa một lần dời), cùng một đồng hồ, một đường cong

// src/motion/reveal-window.tsx
export interface RevealWindowHandle { setRange(from: number, to: number, move?: RevealMove): void; reset(move?: RevealMove): void } // % chiều rộng 0–100; không render React; setRange giữ cho tới khi from/to của props đổi hoặc tới reset() (render lại với cùng props không kéo về); reset() về range của props, mặc định spring; reduced motion: luôn nhảy ngay
export interface RevealWindowProps { from: number; to: number; children: ReactNode; ref?: Ref<RevealWindowHandle>; className?: string }
export function RevealWindow(p: RevealWindowProps): JSX.Element;       // chỉ transform, qua moveTogether; spring SPRING_EASING 443 ms; không lớp transition CSS nào
export function revealTransforms(from: number, to: number): [string, string, string];
export interface MoveWith<T extends HTMLElement> { ref: RefObject<T | null>; style: CSSProperties }
export function useMoveWith<T extends HTMLElement>(transform: string): MoveWith<T>; // cho thứ phải đi cùng cửa sổ: trải { ref, style } lên phần tử; render đầu đặt chỗ, các lần sau dời bằng moveTogether

// src/thread/state.ts
export type ThreadState = StateName | 'expired';
export const THREAD_STATES: readonly ThreadState[];
export function threadStateOf(s: Pick<VaultStatus, 'state' | 'expired'>): ThreadState;
export function threadRemaining(s: Pick<VaultStatus, 'state' | 'expired' | 'lastAlive' | 'lateAt' | 'alarmAt' | 'windowEndsAt'>, now: bigint): number; // 0–1
export const THREAD_COLOR: Record<ThreadState, string>;
export const BADGE_COLOR: Record<ThreadState, string>;
export const STATE_GLYPH: Record<ThreadState, GlyphName>;

// src/thread/geometry.ts
export type Point = readonly [number, number];
export const VIEW: { w: 600; h: 120; mid: 60; amp: 9 };
export const GATE_X = 400; export const GATE_MAX_X = 500; export const FRAY_X = 556; export const BEND_X = 352; export const RECOVERY_END: Point; export const MAIN_WIDTH = 3;
export const PREDICTED_DASH = '5 5';
export const BEAT_SECONDS: { slow: 2.4; mid: 1.6; fast: 1 };
export type ThreadBeat = 'slow' | 'mid' | 'fast';
export function waveY(x: number): number;
export function smoothPath(points: readonly Point[]): string;
export function waveSegment(x0: number, x1: number, samples?: number): string;
export function branchWidths(weights: readonly number[], main?: number): number[];
export function branchEnds(n: number): number[];
export interface ThreadAxis { from: bigint; to: bigint; now: bigint; alarmAt?: bigint | null; releaseAt?: bigint | null; marks?: readonly bigint[] }
export function courseX(t: bigint, axis: Pick<ThreadAxis, 'from' | 'to'>): number; // trừ bằng bigint; kẹp [0, VIEW.w]; from >= to thì 0
export function drawnAxis(axis: ThreadAxis): ThreadAxis;           // trục sợi chỉ vẽ: cổng sau GATE_MAX_X thì to kéo dài tới khi cổng đứng ở GATE_MAX_X; còn lại trả nguyên axis
export function pctX(x: number): number; export function pctY(y: number): number; // % của khung, cho lớp HTML và RevealWindow
export function beatOf(left: number): ThreadBeat;                   // > 0,5 slow; 0,1–0,5 mid; < 0,1 fast
export interface ThreadInput {
  remaining?: number; knots?: readonly number[];                    // chế độ cũ, bị bỏ qua khi có axis
  branches?: readonly number[];
  axis?: ThreadAxis;
  predicted?: boolean;                                              // nét đứt cho sợi sờn (grace) và nhánh (đã release); không đổi path
  pendingKnot?: boolean;                                            // vòng nét đứt ở "bây giờ"
  highlight?: number;                                               // nhánh của người đọc: thread; nhánh khác ink-muted 35 %
}
export type ThreadTone = 'plain' | 'highlight' | 'muted';
export interface ThreadGeometry {
  track: string; lit: string; litFrom: number; litTo: number;       // lit là cả đường sáng; phần hiện ra là [litFrom, litTo]
  now: Point | null; nowX: number; pending: Point | null; knots: Point[];
  gate: Point | null; gateX: number;                                // y của cổng = waveY(gateX)
  branches: { d: string; width: number; tone: ThreadTone }[]; dots: { at: Point; tone: ThreadTone }[];
  fibers: string[]; curl: string | null; ghost: string | null; dash: string | null; beat: ThreadBeat | null;
}
export function threadGeometry(state: ThreadState, input?: ThreadInput): ThreadGeometry;

// src/thread/glyphs.tsx
export type GlyphName = 'active' | 'grace' | 'recovery' | 'releasedInherit' | 'releasedRecover' | 'expired' | 'drill' | 'knot' | 'mark';
export const GLYPH_NAMES: readonly GlyphName[]; // chín tên; 'mark' là dấu của Wordmark và icon.svg, không là trạng thái nào (STATE_GLYPH không dùng nó)
export function StateGlyph(p: { name: GlyphName; size?: number; className?: string }): JSX.Element; // aria-hidden

// src/thread/thread.tsx
export interface ThreadProps extends ThreadInput { state: ThreadState; label?: string; shared?: boolean; revealRef?: Ref<RevealWindowHandle>; className?: string }
export function Thread(p: ThreadProps): JSX.Element;        // có label: role="img"; shared: gốc [data-thread] mang view-transition-name THREAD_VT_NAME, nên nó morph sang sợi shared của trang kế; tối đa một sợi shared mỗi trang (tên trùng làm hỏng cả transition); mặc định 5:1, chỗ gọi đặt chiều cao để đổi tỉ lệ

// src/thread/state-badge.tsx
export interface StateBadgeProps { state: ThreadState; drill?: boolean; size?: 'sm' | 'md'; live?: boolean; className?: string }
export function StateBadge(p: StateBadgeProps): JSX.Element;
```

Luật dùng `Thread` cho Plan 7B (R18.4, R18.5):

- **Chỉ compositor.** Không animate `d`, không filter SVG, không `drop-shadow`, không hình tròn trong SVG của sợi chỉ. Thứ gì phải đi cùng phần sáng thì dịch bằng `useMoveWith` (hay `moveTogether` trong cùng lượt với cửa sổ), không bằng transition CSS: mỗi transition CSS chạy một đồng hồ riêng, nên khi một lần dời cắt ngang lần trước, nó lệch khỏi cửa sổ (đo trên Chromium: tới 50 px trên sợi 1000 px). Điểm "bây giờ" đi theo dây cung giữa hai điểm, không theo sóng; với bước nhỏ của đồng hồ chain thì không thấy khác.
- **Trục.** Trang có thời gian thật dùng `axis`: `from` là x = 0, `to` là x = `VIEW.w`, `now` là thời gian chain (`useChainNow`). Phần sáng của `active` dừng ở `alarmAt`, của `grace` ở `releaseAt`; cổng ở `releaseAt`; nút ở `marks` (đã release thì mốc sau cổng bị bỏ; recovery và expired bỏ mốc sau `BEND_X`). "Bây giờ" ngoài `[from, to]` không được vẽ, như mốc. Header của vault không truyền `marks` (không vẽ nút `CheckedIn`); `HistoryThread` có trục riêng. Cột sống của trang chủ là đường CSS, không phải `Thread`.
  - Sợi chỉ vẽ trên `drawnAxis(axis)`. Khi cổng rơi sau `GATE_MAX_X` (trục kết thúc ở `releaseAt` hay vài phút sau đó, như header kết thúc ở mốc nhận), `to` được kéo dài tới khi cổng đứng ở `GATE_MAX_X`: nhánh còn ít nhất 94 đơn vị, vòm cổng không bị cắt, mọi thứ giữ thứ tự và tỉ lệ thời gian. Thứ đặt tay lên sợi chỉ (thumb và mốc của Scrubber) dùng `courseX(t, drawnAxis(axis))`, và thanh kéo chạy trên `[from, drawnAxis(axis).to]`.
  - Nhịp quầng đo phần còn lại của `[from, alarmAt]` sau "bây giờ". Vậy ở mọi nơi trạng thái có thể là `active`, `from` phải là đầu kỳ hiện tại (`lastAlive`). Trục bắt đầu sớm hơn (Scrubber từ lúc tạo vault, witness) sẽ đập nhanh quá ngay sau một lần điểm danh: chỗ đó truyền `from: lastAlive` khi trạng thái là `active`, hoặc chấp nhận nhịp theo trục.
- **Kéo.** `setRange` chỉ dịch cửa sổ. Điểm "bây giờ", nút đang chờ và mọi mốc là props: chúng đứng yên khi `setRange` chạy, và chỗ gọi render lại `Thread` với props mới khi muốn dời chúng. Cửa sổ giữ chỗ `setRange` đặt cho tới khi `litFrom` hay `litTo` của props đổi, hoặc tới khi gọi `reset()`. Một lần render lại với cùng props (một nhịp `useChainNow`) không kéo nó về, nên không cắt ngang một lần kéo. Ngược lại, props không đổi thì cũng không có gì kéo nó về, nên chỗ gọi luôn gọi `reset()` khi xong.
  - Thanh kéo của cỗ máy thời gian (7B T5) giữ `axis` của lần render cuối và gọi `revealRef.current?.setRange(pctX(courseX(t, drawnAxis(axis))), pctX(litTo), 'instant')` trong rAF, với `litTo` lấy từ `threadGeometry(state, { axis })`. Khi `pointerup` hay `pointercancel`: render lại với mốc mới rồi gọi `revealRef.current?.reset()`. Props đổi thì cửa sổ đi theo props; không đổi (thả trong detent 2 % về đúng mốc cũ) thì `reset()` đưa nó về bằng spring.
  - Nút giữ của nghi thức (7B T10) gọi `setRange(from, 100, { linear: HOLD_MS })` khi `holding`, và gọi `reset()` khi thả sớm hay khi ví từ chối: chưa có nút nào được thắt, nên sợi chỉ về đúng như trước (nguyên tắc 8, R18.16).
- **Cột giám hộ** (7B T6) đặt vào `[data-part="gate"]`, hộp của vòm cổng, đã đứng ở `(gateX, waveY(gateX))` theo %.
- **DOM ổn định** cho test của Plan 7B: gốc `[data-thread]` có `data-state`, `data-predicted`, `data-pending-knot`, `data-highlight` (`data-highlight` có ở mọi trạng thái hễ truyền `highlight`, cả trên `[data-layer="marks"]`); quầng là `svg[data-layer="glow"][data-beat]`; phần sáng là `[data-part="lit"]`; cửa sổ là `[data-reveal="outer" | "middle" | "inner"]`.

### Primitive (`src/ui/`)

```ts
export function VisuallyHidden(p: { children: ReactNode }): JSX.Element; // <span className="sr-only">, không Radix (R23)
export function Spinner(p: { label?: string; size?: number; className?: string }): JSX.Element;
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export function buttonClass(o?: { variant?: ButtonVariant; size?: ButtonSize; className?: string }): string; // cho <Link>
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean; loadingLabel?: string; icon?: ReactNode; ref?: Ref<HTMLButtonElement> }
export function Button(p: ButtonProps): JSX.Element; // loading: aria-disabled + aria-busy, không phải disabled gốc (nút vẫn giữ focus), bỏ qua lần bấm (preventDefault, nên submit cũng không gửi form), spinner có nhãn ẩn loadingLabel (mặc định 'loading' của ui.messages, không phải common: common thêm 1,4 kB gzip vào first load của /); disabled vẫn là disabled gốc; aria-busy của người gọi được giữ khi không loading (bận mà vẫn bật). Test: toBeDisabled() của jest-dom chỉ đọc disabled gốc, bỏ qua aria-disabled, nên nút đang loading thì kiểm getAttribute('aria-disabled')
export interface PlainIconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> { icon: LucideIcon; label: string; size?: 'sm' | 'md'; ref?: Ref<HTMLButtonElement> }
export function PlainIconButton(p: PlainIconButtonProps): JSX.Element; // src/ui/plain-icon-button.tsx: không tooltip, không Radix (R23); aria-busy thì spinner thay icon
export interface IconButtonProps extends PlainIconButtonProps { tooltip?: boolean }
export function IconButton(p: IconButtonProps): JSX.Element;           // tooltip mặc định bật, nên file này mang Radix tooltip
export interface HoldButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'type'> { onConfirm(): void; children: ReactNode; icon?: ReactNode; tone?: 'thread' | 'danger'; size?: 'md' | 'lg'; duration?: number; hint?: string }
export function HoldButton(p: HoldButtonProps): JSX.Element; // giữ 600 ms, Enter xác nhận ngay, Space là giữ
export function Tooltip(p: { content: ReactNode; children: ReactElement; side?: 'top' | 'right' | 'bottom' | 'left' }): JSX.Element; // mỗi Tooltip mang provider riêng, không có TooltipProvider (R23)
export function Popover(p: { trigger: ReactElement; children: ReactNode; open?: boolean; onOpenChange?(open: boolean): void; align?: 'start' | 'center' | 'end'; side?: 'top' | 'right' | 'bottom' | 'left'; label: string; onCloseAutoFocus?(event: Event): void; className?: string }): JSX.Element; // label bắt buộc: role="dialog" không tên trượt luật aria-dialog-name của axe
export const PopoverClose = P.Close; // P = @radix-ui/react-popover
export function AnchoredPopover(p: { anchor: RefObject<HTMLButtonElement | null>; id: string; open: boolean; onOpenChange(open: boolean): void; children: ReactNode; align?: 'start' | 'center' | 'end'; side?: 'top' | 'right' | 'bottom' | 'left'; label: string; onCloseAutoFocus?(event: Event): void; className?: string }): JSX.Element; // popover của một nút đã vẽ trước khi chunk nạp: bấm nút thì đóng, Escape hay chọn bên trong trả focus về nút, bấm chỗ khác để focus ở đó
export interface OverlayTrigger { ref: RefObject<HTMLButtonElement | null>; 'aria-haspopup': 'dialog'; 'aria-expanded': boolean; 'aria-controls': string | undefined; 'aria-busy': true | undefined; onClick(): void; onPointerEnter(): void; onFocus(): void }
export function useLazyOverlay<T>(chunk: LazyChunk<T>): { open: boolean; setOpen(open: boolean): void; id: string; anchor: RefObject<HTMLButtonElement | null>; trigger: OverlayTrigger; content: T | null }; // src/ui/lazy-overlay.ts: trải trigger lên nút; content null tới khi lần mở đầu nạp xong;
                                              // bấm khi chunk đang nạp thì aria-busy và giữ lệnh mở (onClick đảo theo aria-expanded); chunk hỏng thì đóng lại và reportLoadFailure()
export interface DialogProps { open?: boolean; onOpenChange?(open: boolean): void; trigger?: ReactElement; title: ReactNode; description?: ReactNode; children?: ReactNode; size?: 'sm' | 'md' | 'lg'; sheet?: boolean; onCloseAutoFocus?(event: Event): void; id?: string; className?: string } // id cho aria-controls của nút ngoài dialog
export function Dialog(p: DialogProps): JSX.Element;
export function copyText(text: string): Promise<boolean>;
export function CopyButton(p: { text: string; label: string; showText?: boolean; className?: string }): JSX.Element;
export function isUntrusted(v: unknown): v is Untrusted;
export function UntrustedText(p: { value: unknown; max?: number; className?: string }): JSX.Element; // trong <bdi>
export function safeExternalHref(href: string): string | null;
export function ExternalLink(p: { href: string; children: ReactNode; icon?: boolean; variant?: 'inline' | 'icon'; className?: string }): JSX.Element;
export interface IdenticonData { hue: number; cells: boolean[] }
export function identiconOf(address: string): IdenticonData;
export function Avatar(p: { address: string; size?: number }): JSX.Element; // src/ui/avatar.tsx; address.tsx export lại. Chỉ cần avatar thì import từ '@/ui/avatar' (R23)
export function Address(p: { address: string; explorer?: string | null; copy?: boolean; avatar?: boolean; size?: 'sm' | 'md'; className?: string }): JSX.Element;
export function Amount(p: { raw: bigint; decimals: number | null; symbol?: Untrusted | string | null; maxFraction?: number; className?: string }): JSX.Element;
export function Countdown(p: { target: bigint; blockTimestamp: bigint; fetchedAtMs: number; className?: string }): JSX.Element;
export function Skeleton(p: { className?: string }): JSX.Element;
export function SkeletonText(p: { lines?: number; className?: string }): JSX.Element;
export function EmptyState(p: { title: ReactNode; body?: ReactNode; action?: ReactNode; icon?: ReactNode; className?: string }): JSX.Element;
export function InlineError(p: { id?: string; children: ReactNode; className?: string }): JSX.Element;
export type BannerTone = 'info' | 'warn' | 'error' | 'success';
export function Banner(p: { tone?: BannerTone; title?: ReactNode; children: ReactNode; action?: ReactNode; onDismiss?(): void; testId?: string; className?: string }): JSX.Element;
export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> { label: ReactNode; hint?: ReactNode; error?: ReactNode; mono?: boolean; ref?: Ref<HTMLInputElement> }
export function TextField(p: TextFieldProps): JSX.Element; // id từ useId(), aria-describedby nối hint và error
export function qrPath(data: readonly (readonly boolean[])[]): string;
export function QrCode(p: { value: string; label: string; size?: number; className?: string }): JSX.Element;
```

Lớp Tailwind (Task 3): màu `bg`, `surface-1|2|3`, `ink`, `ink-muted`, `thread`, `on-thread`, `alive`, `grace`, `recovery`, `release`, `danger`, `on-danger`, `line`, `line-strong`; chữ `text-caption|small|body|lead|title|h2|h1|display`, `font-display|sans|mono`; easing `ease-out-expo|in-out-sine|spring`; animation `motion-safe:animate-thread-pulse|thread-tremble|shimmer` (luôn kèm `motion-safe:`, test `reduced motion leaves no running animation`); Radix `atro-overlay|dialog|sheet|pop`.

### Khung trang

```ts
// src/shell/*.tsx, src/home/hero.tsx
export function Providers(p: { children: ReactNode; kv?: KV }): JSX.Element; // KV → Lang → Theme → Chain (Query) → Wallet → Motion; không provider tooltip (R23)
export function Frame(p: { children: ReactNode }): JSX.Element;               // SkipLink, ProofLine, Header, NetworkBannerSlot, LoadNotice, <main tabIndex={-1}>, Footer, ConnectSheetSlot; gọi useWarmOverlays()
export function LoadNotice(): JSX.Element;    // src/shell/load-notice.tsx: <div role="alert" data-testid="load-notice"> luôn có; chunk hỏng thì lỗi + nút "Reload the page"
export function useWarmOverlays(): void;      // src/shell/warm-overlays.ts: khi trang rảnh, preload connectSheet, walletMenuPanel và settingsPanel (từ 48rem) hoặc menuSheet
export function ProofLine(): JSX.Element;     // <p data-testid="proof-line">, một dòng 24 px, mono cỡ caption, prerender, không tắt được;
                                              // [data-variant="wide"] từ md: "Rules frozen in netlist 0x7016…3864 on X Layer · unaudited · limits →";
                                              // [data-variant="narrow"] dưới md, ≤ 36 ký tự: "Rules 0x7016…3864 · unaudited →";
                                              // link keccak → ROUTES.proof (title = keccak đầy đủ), link giới hạn → LIMITS_HREF; cả hai là NavLink
export function Header(): JSX.Element;        // .site-header, dính trên cùng; bg-bg/95 dưới md, md:bg-bg/80 md:backdrop-blur-md
export function NavList(p: { layout: 'bar' | 'sheet'; onNavigate?(): void }): JSX.Element;
export function SettingsMenu(): JSX.Element;  // popover "Settings" (md trở lên); nút vẽ ngay, popover nạp khi trang rảnh, hover, focus hay bấm (R23)
export const settingsPanel: LazyChunk<typeof import('./settings-panel')>;   // settings-menu.tsx
export function MobileMenu(): JSX.Element;    // dialog "Menu" (dưới md); nạp như SettingsMenu
export const menuSheet: LazyChunk<typeof import('./menu-sheet')>;           // mobile-menu.tsx
export function Footer(): JSX.Element;        // .site-footer; "Known limits" → LIMITS_HREF; "For heirs and guardians" → ROUTES.verify;
                                              // nguồn, X Layer, giấy phép, trạng thái, nhà phát triển, quyền riêng tư; phiên bản; "No trackers · No cookies"
export function SkipLink(p: { targetId: string }): JSX.Element; // một <button>, giữ nguyên hash; luôn là phần tử đầu của trang
export function LangSwitch(): JSX.Element;
export function ThemeSwitch(): JSX.Element;   // Night | Vellum | Match device (VI: Đêm | Giấy da | Theo thiết bị), radio gốc
export function HapticsSwitch(): JSX.Element;
export function Wordmark(p: { className?: string }): JSX.Element; // StateGlyph 'mark' (text-thread) + "Atropyle"
export function HomeHero(): JSX.Element;      // Plan 7C thay cả file (T4: HomeHero({ art }); T7: trang chủ sáu cảnh); giữ heroDrillNote dưới nút Drill, nối bằng aria-describedby;
                                              // hai CTA (createHref('drill'), ROUTES.proof) vẫn là next/link: bản thay dùng NavLink (luật 18)
```

Khoá chuỗi mà Plan 7B và 7C dùng lại:

- `shell`: `notFoundTitle`, `notFoundBody`, `notFoundHint`, `goHome`, `knownLimits`, `forHeirs`, `noTrackers`, `proofLine`, `proofLineShort`, `proofLimits`, `proofLimitsShort`.
- `home`: `heroEyebrow`, `heroTitle`, `heroLead`, `heroDrill`, `heroDrillNote`, `heroProof`.
- `ui`: `themeDark` = "Night", `themeLight` = "Vellum", `themeSystem` = "Match device".

### Dữ liệu chain

```ts
// src/chain/types.ts (chỉ kiểu)
export interface Sdk { atro: AtropyleClient; deployment: Deployment; rpc: RpcPlan }
export interface RpcPlan { read: string[]; verify: string[][]; crossCheck: boolean; offchain: string[] }
export interface LoadedVault { snap: VaultSnapshot; timeline: Timeline; registered: boolean; fetchedAtMs: number }
export type { CachedStats, StatsSnapshot } from './impl/stats-view';

// src/chain/load.ts (một chunk, nạp một lần, nạp lại được sau lỗi mạng)
export type ChainImpl = typeof Impl; // import type * as Impl from './impl'
export function loadChainImpl(): Promise<ChainImpl>;
export function peekChainImpl(): ChainImpl | null;
// src/chain/impl/index.ts (chỉ qua loadChainImpl)
export function loadDeployment(env: Pick<AppEnv, 'chain' | 'deploymentJson'>): Deployment;
export function createSdk(d: Deployment, target: Target, crossCheck: boolean): Sdk;
export function rpcPlan(d: Deployment, target: Target, crossCheck: boolean): RpcPlan;
export function loadVault(sdk: Sdk, vault: Address, nowMs?: () => number): Promise<LoadedVault>;
export function rolesIn(snap: VaultSnapshot, account: string | null): Role[];
export function vaultsOf(sdk: Sdk, account: Address): Promise<VaultRef[]>;
export function cachedStats(sdk: Sdk, kv: KV): CachedStats | null;
export function countStats(sdk: Sdk, kv: KV, onProgress?: (done: number, total: number) => void): Promise<CachedStats>;

// src/chain/query-client.ts, keys.ts, provider.tsx
export const PERMANENT_CODES: ReadonlySet<string>; // mã SDK vĩnh viễn + INVALID_INPUT, NOT_A_VAULT, RATE_LIMITED, TOKEN_INVALID, UNAUTHORIZED, BAD_RESPONSE, UNAVAILABLE
export function errorCode(e: unknown): string | null;
export function shouldRetry(failureCount: number, error: unknown): boolean; // tối đa 2 lần, không bao giờ với mã vĩnh viễn
export function makeQueryClient(): QueryClient;
export const chainKeys: {
  all(chainId: number): readonly ['atropyle', number];
  sdk(chainId: number, crossCheck: boolean): readonly ['atropyle', number, 'sdk', 'cross' | 'own'];
  vault(chainId: number, vault: string): readonly ['atropyle', number, 'vault', string];       // địa chỉ chữ thường
  vaultsOf(chainId: number, account: string): readonly ['atropyle', number, 'vaultsOf', string];
  stats(chainId: number, source: 'api' | 'chain'): readonly ['atropyle', number, 'stats', 'api' | 'chain'];
  me(chainId: number, account: string): readonly ['atropyle', number, 'me', string];
  health(chainId: number): readonly ['atropyle', number, 'health'];
  history(chainId: number, vault: string): readonly ['atropyle', number, 'history', string]; // địa chỉ chữ thường; 7B HistoryThread dùng khoá này, không tự viết mảng
};
export function ChainProvider(p: { children: ReactNode; client?: QueryClient }): JSX.Element;
export function useChainSettings(): { crossCheck: boolean; setCrossCheck(on: boolean): void };

// src/chain/hooks.ts
export const CHAIN_ID: number;
export function sdkQuery(crossCheck: boolean); // queryOptions({ queryKey: chainKeys.sdk(CHAIN_ID, crossCheck), queryFn: (): Promise<Sdk> }), cho queryClient.query(sdkQuery(…)) (fetchQuery đã deprecated ở TanStack 5.107.1)
export function useSdk(): UseQueryResult<Sdk>;
export function failedEmpty(q: { state: { data: unknown; status: string } }): boolean; // đọc hỏng trước khi có dữ liệu: không poll, không đọc lại khi tab quay lại, chờ nút Retry của trang
export function useVault(vault: Address | null): UseQueryResult<LoadedVault>; // không placeholderData; mỗi 30 s và khi tab quay lại, chỉ khi đã có dữ liệu (failedEmpty)
export function useVaultsOf(account: Address | null): UseQueryResult<VaultRef[]>; // mỗi 60 s và khi tab quay lại, chỉ khi đã có dữ liệu (failedEmpty)
export function useInvalidateVault(): (vault: string) => Promise<void>;

// src/chain/time.ts (không phải hooks.ts: `import { useChainNow } from '@/chain/time'`)
export function useChainNow(read: { blockTimestamp: bigint; fetchedAtMs: number } | null, intervalMs?: number): bigint | null;

// src/chain/use-stats.ts
export interface StatsSummary { source: 'api' | 'chain'; block: bigint; vaults: number; drills: number; checkIns: number; savedAtMs: number | null }
export interface StatsState { summary: StatsSummary | null; loading: boolean; progress: { done: number; total: number } | null; busy: boolean; error: unknown; refresh(): void }
export function summaryOfCache(c: CachedStats): StatsSummary;
export function summaryOfApi(s: StatsResponse): StatsSummary;
export function freshest(a: StatsSummary | null, b: StatsSummary | null): StatsSummary | null;
export function useChainStats(): StatsState;
export function useStats(): StatsState; // API trước (vercel), chain khi người dùng bấm refresh(); nạp chunk chain sau khi mount
```

### Ví

```ts
// src/wallet/types.ts (chỉ kiểu)
export type { Eip1193, WalletOption, WalletWindow } from './impl/wallet';
export type { CallsResult, CallsStatus, SendCallsOptions } from './impl/send-calls';
export type WalletStatus = 'idle' | 'restoring' | 'connecting' | 'connected';
export interface ConnectedWallet { option: WalletOption; account: Address; chainId: number }
export interface RememberedWallet { rdns: string | null; source: WalletOption['source']; name: string }

// src/wallet/provider.tsx
export interface WalletValue {
  status: WalletStatus;
  wallet: ConnectedWallet | null;
  expectedChainId: number;
  wrongChain: boolean;
  wallets: WalletOption[] | null;
  discovering: boolean;
  discover(): Promise<WalletOption[]>;
  connect(option: WalletOption): Promise<ConnectedWallet>; // USER_REJECTED khi người dùng từ chối
  disconnect(): void;
  switchChain(): Promise<void>;
  walletClient(): Promise<WalletClient>;                     // ký qua ví đã kết nối, trên chain của build
  sheetOpen: boolean;
  openSheet(): void;
  setSheetOpen(open: boolean): void;
  sheetOpener: RefObject<HTMLElement | null>;
}
export const WalletContext: Context<WalletValue | null>;
export function WalletProvider(p: { children: ReactNode; win?: WalletWindow }): JSX.Element;
export function useWallet(): WalletValue;

// src/wallet/load.ts, remember.ts, network.ts, use-vault-roles.ts
export type WalletImpl = typeof Impl; // import type * as Impl from './impl'
export function loadWalletImpl(): Promise<WalletImpl>;
export function reviveRemembered(raw: unknown): RememberedWallet | null;
export function readRemembered(kv: KV): RememberedWallet | null;
export function remember(kv: KV, option: WalletOption): void;
export function forget(kv: KV): void;
export function networkName(chainId: number): string; // 196 → 'X Layer', 31337 → 'Anvil', khác → 'chain <id>'
export function useVaultRoles(loaded: LoadedVault | undefined): readonly Role[] | null;

// src/wallet/connect-sheet.tsx, wallet-button.tsx, wallet-menu.tsx, network-banner.tsx
export const QR_MAX_CHARS = 512;
export type PickerError = 'rejected' | 'requestPending' | 'connectFailed' | 'searchFailed';
export function connectErrorKey(e: unknown): Exclude<PickerError, 'searchFailed'>;
export function isRecommended(w: Pick<WalletOption, 'rdns' | 'source'>): boolean;
export interface WalletPickerProps { wallets: readonly WalletOption[] | null; searching: boolean; connectingId: string | null; error: PickerError | null; pageUrl: string; onPick(option: WalletOption): void; onSearch(): void }
export function WalletPicker(p: WalletPickerProps): JSX.Element;
export function ConnectSheet(): JSX.Element;          // chunk riêng; Frame gắn qua ConnectSheetSlot; trang mở bằng useWallet().openSheet()
export const connectSheet: LazyChunk<typeof import('./connect-sheet')>; // connect-sheet-slot.tsx; Frame preload khi trang rảnh, mọi nút gọi openSheet() preload khi hover và focus
export function ConnectSheetSlot(): JSX.Element | null; // không vẽ gì tới lần openSheet() đầu, rồi giữ sheet; chunk hỏng thì đóng sheet lại và reportLoadFailure()
export function WalletButton(): JSX.Element;
export function WalletMenu(): JSX.Element;            // nút tài khoản vẽ ngay; menu (wallet-menu-panel.tsx) nạp khi trang rảnh, hover, focus hay bấm
export const walletMenuPanel: LazyChunk<typeof import('./wallet-menu-panel')>; // wallet-menu.tsx
export function SwitchNetworkButton(p: { className?: string }): JSX.Element;
export function NetworkBanner(): JSX.Element | null;  // data-testid="network-banner"; null khi ví đúng chain; không tự mang vùng live
export const networkBanner: LazyChunk<typeof import('./network-banner')>; // network-banner-slot.tsx
export function NetworkBannerSlot(): JSX.Element;     // <div aria-live="polite"> luôn có từ lần vẽ đầu; NetworkBanner nạp khi ví sai chain lần đầu rồi vào trong nó;
                                                      // chunk hỏng thì thử lại sau 2 s (gấp đôi, tối đa 60 s) hoặc khi trình duyệt online lại

// src/wallet/impl/index.ts (chỉ qua loadWalletImpl): discoverWallets, providerErrorCodes, call, requestAccount,
// readChainId, ensureChain, walletClientFor (wallet.ts); UNSUPPORTED_CODES, CallsUnsupported, isUnsupported,
// supportsSendCalls, normalizeStatus, sendCalls (send-calls.ts); parseAccountsEvent, parseChainEvent,
// isTransientDisconnect, type WalletEvents, watchWallet, findRemembered, silentAccount, type RestoreResult, restoreWallet,
// connectWallet, notConnected (session.ts). useTxRunner ký lần lượt từng bước bằng atro.send; đường wallet_sendCalls
// thuộc Plan 7B (Task 3 của 7B), không có trong 7A.
```

### Proof trong worker

```ts
// src/verify/types.ts (chỉ kiểu)
export type { PolicyVerification } from '@atropyle/sdk';
export type { PolicyBundle, VaultVerification } from '@atropyle/sdk/verify';
export interface ProofProgress { done: number; total: number }

// src/verify/hooks.ts
export type RunStatus = 'idle' | 'running' | 'done' | 'error';
export const verifyKeys: { proof(crossCheck: boolean): readonly unknown[]; vault(vault: string, policy: boolean, crossCheck: boolean): readonly unknown[] };
export interface ProofState { status: RunStatus; progress: ProofProgress | null; result: PolicyVerification | undefined; error: unknown; run(): void }
export function useProof(): ProofState; // không chạy tới khi run(); kết quả giữ cả phiên; trang mount lại vẫn thấy tiến độ
export interface VaultVerifyState { status: RunStatus; progress: ProofProgress | null; result: VaultVerification | undefined; error: unknown; retry(): void }
export function useVaultVerify(vault: Address | null, policy: boolean): VaultVerifyState;

// src/verify/verify-view.ts (thuần, port nguyên văn)
export type RowState = 'pass' | 'fail' | 'unknown';
export type RowId = 'factory' | 'proxy' | 'binding' | 'code' | 'policy' | 'operators';
export interface VerifyRow { id: RowId; state: RowState; detail: string | null }
export function vaultVerifyRows(v: VaultVerification): VerifyRow[];
export const PROPERTY_ORDER: readonly PropertyName[]; // P1 … P8
export interface ProofSummary { ok: boolean; properties: { name: PropertyName; ok: boolean; violations: number }[]; combos: number; seconds: number; rpcs: number; blockNumber: bigint; warnings: Warning[]; issues: string[] }
export function proofSummary(r: PolicyVerification): ProofSummary;

// src/verify/load.ts: type VerifyImpl; loadVerifyImpl(): Promise<VerifyImpl>.
// src/verify/impl/index.ts (chỉ qua loadVerifyImpl): WorkerIn, WorkerOut, WorkerLike, WorkerFactory, createVerifyWorker,
// errorFromJson, evaluateInWorker, quorumClient, proofKey, runProof(sdk, o?), runVaultVerify(sdk, vault, o).
```

### Giao dịch

```ts
// src/tx/tx-view.ts (thuần, port nguyên văn)
export type StepPhase = 'ready' | 'skipped' | 'blocked' | 'signing' | 'pending' | 'confirmed' | 'failed';
export interface StepRow { index: number; action: ActionName; to: Address; summary: string; simulation: 'ok' | 'failed' | 'skipped'; gas: bigint | null; phase: StepPhase; hash: Hex | null; error: AtropyleErrorJson | null }
export interface TxView { total: number; rows: StepRow[]; warnings: Warning[]; canSend: boolean; blockedAt: number | null; blockedError: AtropyleErrorJson | null }
export function simState(s: Simulation): StepRow['simulation'];
export function warningKey(w: Warning): string;
export function uniqueWarnings(lists: readonly (readonly Warning[])[]): Warning[];
export function txView(plan: TxPlan): TxView;
export function applyStep(v: TxView, e: { index: number; phase: SendPhase; hash?: Hex }): TxView;
export function failStep(v: TxView, index: number, error: AtropyleErrorJson): TxView;

// src/tx/use-tx-runner.ts
export type TxBlocker = 'blocked' | 'connect' | 'wrongAccount' | 'loading';
export interface TxRunnerOptions { plan: TxPlan; onDone?(result: SendResult): void }
export interface TxRunner {
  plan: TxPlan;
  view: TxView;
  busy: boolean;
  error: unknown;
  result: SendResult | null;
  offset: number;              // bước đã xác nhận ở các lần gửi trước; lần gửi sau bắt đầu sau chúng
  confirmed: number;
  committed: boolean;          // trang không được đổi plan; đóng tab sẽ hỏi
  blocker: TxBlocker | null;
  switchFirst: boolean;        // send() xin ví đổi chain trước
  handoffLink: string | null;  // '/sign/#p=…' cho các bước còn lại; null khi đang gửi, đã xong, hoặc quá giới hạn SDK
  explorer: string | null;
  send(): void;
  connect(): void;
  reload(): void;
}
export function useTxRunner(o: TxRunnerOptions): TxRunner;

// src/tx/tx-card.tsx, tx-progress.tsx, error-box.tsx, use-error-view.ts, use-leave-guard.ts, sign-href.ts, load.ts
export interface TxCardProps { runner: TxRunner; label: string; title?: ReactNode; confirm?: 'click' | 'hold'; tone?: 'thread' | 'danger'; testId?: string; className?: string }
export function TxCard(p: TxCardProps): JSX.Element;
export function TxProgress(p: { rows: readonly StepRow[]; testId?: string; className?: string }): JSX.Element;
export function ErrorBox(p: { error: unknown; onRetry?(): void; testId?: string; className?: string }): JSX.Element; // data-testid, data-code
export interface ErrorViewState { view: ErrorDescription | null; unavailable: boolean }
export function useErrorView(error: unknown): ErrorViewState;
export type { ErrorDescription } from './impl/describe'; // Omit<ErrorView, 'code'> + { code: ErrorView['code'] | ApiErrorCode; reason: string | null }
                                                         // lỗi backend (ApiError) nói bằng EN/VI theo ngôn ngữ người đọc và không cần chunk tx/impl; lỗi SDK chỉ bằng tiếng Anh
export function useLeaveGuard(active: boolean): void;
export function toSignHref(sdkLink: string, origin: string): string | null;
export type TxImpl = typeof Impl; // import type * as Impl from './impl'
export function loadTxImpl(): Promise<TxImpl>;
export function peekTxImpl(): TxImpl | null;
// src/tx/impl/index.ts (chỉ qua loadTxImpl): errorView, isErrorJson, localDocs, ErrorView, describeError(e, docsPath),
// ErrorDescription, decodeSendFailure(e): SendFailure { error: AtropyleErrorJson; index: number | null; completed: number },
// pageGone(): AtropyleError (USER_REJECTED, cho client của một thẻ đã unmount; luật 5).
```

### Backend (chỉ bản vercel)

```ts
// src/api/types.ts — chép đúng spec §9.6; bigint là chuỗi thập phân, thời gian là chuỗi ISO
export type Role = 'owner' | 'guardian' | 'heir';
export type Lang = 'en' | 'vi';
export const PROBLEM_CODES: readonly ['INVALID_INPUT', 'NOT_A_VAULT', 'RATE_LIMITED', 'TOKEN_INVALID', 'UNAUTHORIZED', 'INTERNAL'];
export type ProblemCode = (typeof PROBLEM_CODES)[number];
export interface Problem { type: 'about:blank'; title: string; status: number; code: ProblemCode }
export interface SubscribeRequest { email: string; vault: Address; role: Role; lang: Lang; website: string } // website: bẫy bot, luôn ''
export interface OkResponse { ok: true }
export interface ConfirmResponse { ok: true; vault: Address; role: Role }
export interface MeVault { vault: Address; roles: Role[]; drill: boolean; state: string; released: boolean }
export interface MeResponse { address: Address; block: string; vaults: MeVault[] }
export interface StatsResponse { block: string; vaults: string; drills: string; checkIns: string; updatedAt: string }
export interface HealthResponse { indexer: { block: string; lagBlocks: number; updatedAt: string }; integrity: { at: string; block: string; ok: boolean } | null; keeper: { lastRunAt: string; balanceWei: string; dryRun: boolean } | null }

// src/api/client.ts, instance.ts, hooks.ts
export type ApiErrorCode = ProblemCode | 'NETWORK' | 'TIMEOUT' | 'BAD_RESPONSE' | 'UNAVAILABLE';
export class ApiError extends Error { readonly code: ApiErrorCode; readonly status: number | null }
export interface ApiClient { subscribe(req: SubscribeRequest, signal?: AbortSignal): Promise<OkResponse>; confirm(token: string, signal?: AbortSignal): Promise<ConfirmResponse>; unsubscribe(token: string, signal?: AbortSignal): Promise<OkResponse>; me(address: string, signal?: AbortSignal): Promise<MeResponse>; stats(signal?: AbortSignal): Promise<StatsResponse>; health(signal?: AbortSignal): Promise<HealthResponse> }
export interface ApiClientOptions { fetch?: typeof fetch; timeoutMs?: number }
export function createApiClient(base: string, o?: ApiClientOptions): ApiClient;
export function getApi(): ApiClient | null; // null ở bản deweb và khi bản vercel không có URL
export function useApiStats(): UseQueryResult<StatsResponse>;
export function useMe(account: string | null): UseQueryResult<MeResponse>;
export function useHealth(): UseQueryResult<HealthResponse>;
export function useSubscribe(): UseMutationResult<OkResponse, Error, SubscribeRequest>;
export function useConfirm(): UseMutationResult<ConfirmResponse, Error, string>;     // token từ '/alerts/confirm/#t=<token>'
export function useUnsubscribe(): UseMutationResult<OkResponse, Error, string>;

// src/api/errors.ts (chỉ `import type` từ client.ts: đọc ApiError theo hình dạng, nên trang hiện lỗi không kéo client vào)
export interface ApiErrorView { code: ApiErrorCode; message: string; hint: string; docsUrl: string; reason: null } // hình dạng của ErrorDescription
export function apiErrorCode(e: unknown): ApiErrorCode | null;  // mã của một ApiError; giá trị khác là null
export function describeApiError(code: ApiErrorCode, docsPath: string | null, lang: Lang): ApiErrorView; // chữ chọn theo mã (api.messages, EN/VI), không bao giờ theo message của backend
```

### Build, test và công cụ

```ts
// scripts/lib/run-next.ts, build-env.ts, static-server.ts, csp.ts, site-headers.ts, lighthouse-score.ts
export const APP_DIR: string; export const OUT_DIR: string; export const NEXT_BIN: string;
export const BUNDLER_FLAGS: readonly string[];
export interface RunOptions { env?: NodeJS.ProcessEnv; args?: readonly string[]; quiet?: boolean }
export function runNext(command: 'build' | 'dev', o?: RunOptions): Promise<{ code: number; output: string }>;
export function buildApp(o?: RunOptions): Promise<{ code: number; output: string }>; // next build, rồi CSP có hash cho mọi trang
export function buildEnvFor(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
export function startStaticServer(root: string, port?: number, headers?: Record<string, string>): Promise<{ port: number; url: string; close(): Promise<void> }>;
export const XLAYER_RPC_ORIGINS: readonly string[]; export const LOCAL_RPC_ORIGINS: readonly string[];
export interface CspEnv { NEXT_PUBLIC_TARGET?: string; NEXT_PUBLIC_CHAIN?: string; NEXT_PUBLIC_DEPLOYMENT?: string; NEXT_PUBLIC_API_URL?: string }
export function rpcOrigins(chain: string | undefined, deploymentJson: string | undefined): string[];
export function apiOrigin(target: string | undefined, apiUrl: string | undefined): string | null;
export function connectOrigins(env: CspEnv): string[];
export function inlineScripts(html: string): string[];
export function scriptHash(text: string): string;
export function buildCsp(o: { scriptHashes: readonly string[]; connect: readonly string[] }): string;
export function withCsp(html: string, csp: string): string;
export function applyCsp(outDir: string, env: CspEnv): number;
export const VERCEL_JSON: string;
export function siteHeaders(json?: string): Record<string, string>;
export const LIGHTHOUSE_ROUTES: readonly string[]; // ['/']; 7B thêm '/create/', 7C T3 thêm '/proof/' (thêm vào mảng, không ghi đè)
export const CATEGORIES: readonly ['performance', 'accessibility', 'best-practices', 'seo'];
export const THRESHOLDS: { performance: 0.95; accessibility: 1; bestPractices: 1; seo: 1; lcpMs: 1800; cls: 0; tbtMs: 150 };
export const FORBIDDEN_REQUESTS: Readonly<Record<string, readonly (string | RegExp)[]>>; // {} ở 7A; 7C T6 điền '/' (R18.18)
export interface Run { performance: number; accessibility: number; bestPractices: number; seo: number; lcpMs: number; cls: number; tbtMs: number }
export interface LhrLike { categories: Record<string, { score: number | null } | undefined>; audits: Record<string, { numericValue?: number; details?: unknown } | undefined> }
export function runOf(lhr: LhrLike): Run;
export function medianRun(runs: readonly Run[]): Run;
export function failures(r: Run): string[];
export function forbiddenRequests(lhr: LhrLike, patterns: readonly (string | RegExp)[]): string[]; // chuỗi con hoặc RegExp của URL; mỗi URL một lần, theo thứ tự tải; không có bảng network-requests thì ném lỗi

// next.config.mjs
export default function config(): NextConfig; // không tham số; pageExtensions = ['tsx', 'ts'], thêm 'e2e.tsx' khi ATROPYLE_E2E=1; không có trang chỉ có lúc dev

// test/setup.ts (Vitest): nạp '@testing-library/jest-dom/vitest' (7.0.1, R13), nên mọi test unit có matcher của jest-dom
// test/helpers/render.tsx, test/helpers/wallet.ts, test/unit/fixtures.ts (Vitest)
export interface ProviderOptions { kv?: KV; lang?: Lang; queryClient?: QueryClient; win?: WalletWindow }
export function testQueryClient(): QueryClient;
export function TestProviders(p: { kv: KV; queryClient: QueryClient; win?: WalletWindow; children: ReactNode }): JSX.Element;
export function makeWrapper(o?: ProviderOptions): { wrapper: (p: { children: ReactNode }) => JSX.Element; kv: KV; queryClient: QueryClient };
export function renderWithProviders(ui: ReactElement, o?: ProviderOptions): RenderResult & { kv: KV; queryClient: QueryClient };
export interface FakeWalletState { accounts: string[]; chainId: number; shared: boolean; reject: boolean }
export interface FakeWallet { provider: Eip1193; state: FakeWalletState; calls: string[]; emit(event: string, ...args: unknown[]): void; listenerCount(event: string): number }
export function fakeWallet(o?: Partial<FakeWalletState>): FakeWallet;
export interface Announced { info: { uuid: string; name: string; rdns: string; icon: string }; provider: Eip1193 }
export function walletWindow(announced?: Announced[], globals?: { okxwallet?: unknown; ethereum?: unknown }): WalletWindow;
export const TEST_ACCOUNT = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
export function walletValue(over?: Partial<WalletValue>): WalletValue; // mặc định: đã kết nối TEST_ACCOUNT trên chain 196
export function fixtureDeployment(): Deployment;
// test/unit/tx-card.test.tsx: runnerOf(plan, over?) là object literal TxRunner duy nhất của 7A; 7B T3 thêm `bundle: null,` vào đó, ngay sau `explorer: null,`, và liệt kê file này trong Files và git add (nếu không, typecheck hỏng với TS2741)

// test/e2e/fixtures.ts, helpers.ts, screens.ts, state.ts, wallet.ts, network.ts (Playwright)
export const test: TestType<{ state: E2EState; requests: string[]; cspViolations: CspViolation[]; deployment: Deployment; atro: AtropyleClient; wallet(o: Omit<WalletOptions, 'rpcUrl'>): Promise<TestWallet> }>;
export { expect };
export const ANVIL: readonly Address[];
export interface CspViolation { directive: string; blocked: string; sample: string }
export const AXE_TAGS: readonly string[]; // wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa
export type E2ETheme = 'dark' | 'light'; // giá trị đã lưu: 'dark' là night (mặc định, không có data-theme), 'light' là vellum
export type E2ELang = 'en' | 'vi';
export function settle(page: Page): Promise<void>; // chờ mọi animation hữu hạn trên document.timeline; bỏ qua vòng lặp và animation theo cuộn (R15)
export function runningAnimations(page: Page): Promise<string[]>;
export function expectAccessible(page: Page): Promise<void>;
export function setStoredTheme(page: Page, theme: E2ETheme): Promise<void>; // KEYS.theme trong localStorage, tải lại, chờ data-theme (R18.17)
export function setStoredLang(page: Page, lang: E2ELang): Promise<void>; // KEYS.lang trong localStorage, tải lại, chờ <html lang>
export function expectAccessibleInBothThemes(page: Page, ready?: Locator): Promise<void>; // vellum rồi night, mỗi theme một lần tải lại; kết thúc ở night
export function openSettings(page: Page): Promise<Locator>;
export function connectWallet(page: Page, name?: string): Promise<void>;
export interface Shot { theme: E2ETheme; lang: E2ELang; width: number }
export const SCREEN_MATRIX: readonly Shot[]; // R18.13: night EN 1440, night EN 390, night VI 390
export const VELLUM_MATRIX: readonly Shot[]; // cùng ba ảnh ở vellum, chỉ cho bề mặt vellum
export function shouldCapture(projectName: string): boolean; // SCREENS=1 và project 'desktop'
export function captureScreens(page: Page, name: string, o?: { vellum?: boolean }): Promise<void>; // test-results/screens/<name>/<night|vellum>-<lang>-<width>.png; kết thúc ở night, EN, viewport ban đầu
export interface E2EState { rpcUrl: string; siteUrl: string; snapshot: string; deployment: Record<string, unknown>; seeded: { simple: Address; guarded: Address; grace: Address } }
export function readState(): E2EState;
export function resetChain(s: E2EState): Promise<E2EState>;
export function warp(s: E2EState, seconds: number): Promise<void>;
export const rpcCall: (url: string, method: string, params?: unknown[]) => Promise<unknown>;
export interface WalletOptions { rpcUrl: string; account: Address; chainId?: number; knownChains?: number[]; sendCalls?: boolean }
export interface TestWallet { calls: { method: string; params: unknown[] }[]; setAccount(a: Address): void }
export function installWallet(page: Page, o: WalletOptions): Promise<TestWallet>; // không khoá; ký và raw tx bị từ chối 4200
export const OKX_ORIGINS: readonly string[];
export function routeRpcToAnvil(page: Page, rpcUrl: string): Promise<void>;
export function offchain(urls: readonly string[], siteOrigin: string): string[];

// test/e2e/nojs.spec.ts (mở rộng bằng cách thêm mục, không export)
const PAGES: readonly { path: string; content(page: Page): Promise<void> }[]; // [{ path: '', content: expectHome }]; 7B T12 thêm 'verify/', 7C T3 thêm 'proof/'
async function expectSeen(target: Locator): Promise<void>; // toBeVisible và không phần tử cha nào có opacity 0
async function expectFrame(page: Page): Promise<void>; // dòng bằng chứng (data-testid "proof-line": keccak rút gọn → /proof/, "unaudited"), footer ("No trackers", /proof/#limits, /verify/)

// Task 15 ra Kết quả B (luật 18): mọi link sang route khác dùng NavLink
export function NavLink(props: Omit<ComponentProps<typeof Link>, 'href'> & { href: string }): JSX.Element; // src/shell/nav-link.tsx; replace, scroll, transitionTypes, onNavigate như next/link
export function withPendingViewTransition(update: () => void, committed: Promise<void>, maxMs?: number): void; // src/motion/view-transition.tsx
```

Lệnh: `npm run dev|build|test|test:build|typecheck|worker:check|e2e|size|lighthouse|playwright:install -w apps/web`.
- `size` và `lighthouse` đọc `out/` của một bản production mới build.
- `e2e` và `worker:check` tự build bản deweb e2e vào `out/`; `e2e` chép nó sang `test/e2e/.site/` rồi phục vụ từ đó. Sau hai lệnh này `out/` giữ bản e2e, nên `size` và `lighthouse` từ chối chạy cho tới khi `npm run build -w apps/web` build lại.
- Ảnh duyệt thiết kế: `SCREENS=1 npm run e2e -w apps/web -- --project=desktop`.

**Kích thước (R16).** JS lần tải đầu của `/` sau vòng sửa cuối của 7A (25/11) là `188,6 kB` gzip (`npm run size`, bản deweb và bản vercel như nhau), dưới ngân sách 200 kB (R23), còn dư `11,4 kB`. Trang 404 là `182,1 kB`, dưới 240 kB.
- Next 16 + React 19 chiếm `135,7 kB` trong đó. Đây là tổng gzip mức 9 của sáu chunk lần tải đầu chỉ chứa React DOM, runtime client của Next, phần còn lại của Next và runtime Turbopack: 71,6 + 45,6 + 8,7 + 3,9 + 3,9 + 2,0 kB.
- Báo cáo Task 15 (dòng "R16") ghép chunk với nội dung bằng `next analyze`. Bản build sau vòng sửa cuối có đủ sáu chunk đó với cùng cỡ; chỉ chunk mang bản đồ chunk của Next đổi tên.
- Con số 129,7 kB lúc Task 15 mới dựng theo cách chia chunk lúc đó và không tính chunk 2 kB của Next (`310vm2bl3xxpt.js`). Khung trần của Task 2 (khoảng 132 kB) là một phép đo khác: app rỗng, trước khung của 7A.
- Mọi thứ 7B và 7C thêm vào `/` phải nằm trong phần dư này; chunk nặng chỉ nạp khi có ý định thật (R18.18). Pre-flight 7C (F5) ước 7C thêm khoảng 18–20 kB vào `/`, nhiều hơn phần dư.
