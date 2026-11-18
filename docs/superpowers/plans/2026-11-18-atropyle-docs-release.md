# Atropyle Plan 6 — Docs, CI/CD và phát hành — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa Atropyle tới trạng thái nộp bài được. Cụ thể: docs 17 trang (`apps/docs`, Starlight) đăng ở DeWEB và GitHub Pages; CI đầy đủ (docs, phân tích tĩnh, bảo mật, benchmark, kiểm gói); `proof.yml` verify mainnet mỗi ngày; `release.yml` publish 4 gói npm `0.1.0` có provenance và deploy Worker cùng Pages; `TRACTION.md` đếm từ chain; README, `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE`; mọi action ghim SHA; bộ hồ sơ nộp bài trong `docs/submission/`.

**Architecture:**
- Docs là site tĩnh Starlight. `base` lấy từ `DOCS_BASE` (mặc định `/docs/`), `build.format: 'file'`, nên mỗi trang là một file `.html` thật. Link trong nội dung viết tương đối, có đuôi `.html`, nên cùng một bản build chạy được ở `/docs/` (DeWEB) và `/atropyle/docs/` (Pages). Tìm kiếm là Pagefind cục bộ. Không có analytics, không tải gì từ ngoài.
- Bốn trang tham chiếu sinh từ code bằng `npm run docs:gen`: Errors (từ `ERROR_CODES`/`ERROR_INFO`), CLI (từ snapshot `--help` của Plan 3), SDK (TypeDoc → Markdown), Contracts (ABI + NatSpec + `deployments/xlayer.json`). CI chạy `docs:gen -- --check` và báo lỗi khi bản commit lệch code.
- Sau build có bộ kiểm riêng chạy trên HTML thật: mọi link nội bộ và anchor phải tồn tại, không có tài nguyên tải từ ngoài, mọi mã lỗi có anchor trên trang Errors. CI kiểm cả hai `base`.
- Mọi script mới là TypeScript chạy bằng `tsx`, tách phần thuần (có unit test) khỏi phần đọc chain hay gọi lệnh. Không script nào ký giao dịch.
- Workflow GitHub chỉ dùng `GITHUB_TOKEN` và ba secret do người dùng đặt. `release.yml` publish npm qua trusted publishing (OIDC); lần publish đầu tiên bắt buộc dùng token vì gói chưa tồn tại.

**Tech Stack:** Node 24 (dev, CI) / Node ≥ 20 (gói publish), npm workspaces, TypeScript 5.9.3, tsx 4.20.6, vitest 3.2.7, astro 7.4.12, @astrojs/starlight 0.43.1, yaml 2.9.1, typedoc 0.28.20, typedoc-plugin-markdown 4.14.1, knip 6.45.1, @changesets/cli 3.0.3, publint 0.3.25, @arethetypeswrong/cli 0.18.5, playwright 1.65.1, esbuild 0.28.2, Foundry 1.9.0 (`forge lint`, anvil), Slither 0.11.6 (qua `crytic/slither-action`), gitleaks (qua `gitleaks/gitleaks-action` v3), CodeQL v4, GitHub Pages, Cloudflare wrangler (của Plan 5).

**Spec:**
- `docs/superpowers/specs/2026-11-18-atropyle-ecosystem-design.md`: §10.1 (docs), §12.2 (benchmark, bảo mật, E2E 1/12), §13 (CI/CD), §14 (traction), §16 (threat model), §17 (demo), §18 (lịch, thứ tự cắt), §19 (việc người dùng).
- Spec lõi `docs/superpowers/specs/2026-11-18-atropyle-design.md`: §1 (ngoài phạm vi), §3 (policy), §4 (vault), §5 (factory), §13 (rủi ro đã chấp nhận). Nội dung docs lấy từ đây.
- Plan 1 `docs/superpowers/plans/2026-11-18-atropyle-onchain-core.md` (ABI, event, error, `ci.yml`), Plan 2 `docs/superpowers/plans/2026-11-18-atropyle-sdk.md` (API SDK). Người thực thi đọc cả bốn.

**Điều kiện bắt đầu:**
- Plan 1 và Plan 2 đã xong. Mainnet đã deploy (26/11), nên `deployments/xlayer.json` đã có.
- Plan 3 đã xong phần P0: `packages/cli` (gói `atropyle`), `packages/mcp` (`@atropyle/mcp`), snapshot `packages/cli/test/snapshots/help/*.txt`, schema `packages/cli/schemas/*.json`.
- Plan 4 đã có `scripts/build-site.ts` (`npm run site:build -- --target deweb|pages`). Plan 5 đã có `apps/worker`.
- **Ngoại lệ:** Phần A của Task 8 (Step 1–4: chạy Slither và `forge lint`, phân loại) chỉ cần Plan 1. Chạy phần này ngay sau Plan 1 Task 11, **trước** khi deploy mainnet 26/11 (Quyết định 13). Phần B (test, job CI) chạy theo thứ tự, sau Task 7.

**Lịch (spec §18: Plan 6 chạy 28/11–2/12):**

| Ngày | Task | Mốc |
|---|---|---|
| trước 26/11 | 8 | Slither và `forge lint` sạch trước khi deploy |
| 28/11 | 1, 2, 3 | Repo công khai, khung docs, trang sinh tự động |
| 29/11 | 4, 5, 6 | 13 trang viết tay |
| 30/11 | 7, 9, 10, 11, 17 | CI đầy đủ, benchmark, traction, README; checklist E2E sẵn cho 1/12 |
| 1/12 | 12, 13, 14, 15 | **E2E mainnet theo checklist của Task 17** |
| 2/12 | 16, rồi publish `0.1.0` | **Khoá tính năng, publish npm** |
| sau 2/12 | 18 (P1) chỉ khi P0 xong trước 30/11 | |

## Global Constraints

- **Chạy lệnh:** mọi lệnh chạy từ gốc repo `E:\1Hackathon2026\xlayer-hackathon` trong Git Bash. Lệnh Foundry có dạng `cd contracts && forge …`.
- **Git:**
  - **Không bao giờ** `git add -A` hay `git add .`. Chỉ add đúng các đường dẫn liệt kê trong task.
  - `prompts/`, `reports/`, `research_notes/`, `external_research/` luôn untracked; không đọc ghi gì vào đó trong lúc thực thi.
  - Commit theo dạng `git commit -m "<type>(<scope>): <mô tả>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- **Không khoá, không mainnet:**
  - Người dùng tự ký mọi giao dịch mainnet. Claude/agent không bao giờ cầm private key, không `cast send` hay broadcast lên mainnet, không đặt secret.
  - Trên anvil (chain 31337) chỉ gửi giao dịch qua tài khoản unlocked (`eth_sendTransaction`, `--unlocked`).
  - Repo không có biến `PRIVATE_KEY`. Không private key nào được viết vào file.
- **Secret và biến của GitHub:**
  - Token npm, Cloudflare, Telegram, `KEEPER_KEY`, khoá operator DeWEB do **người dùng** đặt. Bước nào cần chúng đánh dấu `[USER]`, ghi đúng lệnh người dùng chạy.
  - Secret duy nhất workflow được đọc: `GITHUB_TOKEN`, `NPM_TOKEN` (chỉ cho lần publish đầu, xoá sau đó), `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Test ở Task 7 ép điều này.
  - Biến repo (không phải secret): `NPM_PUBLISH`, `DEPLOY_WORKER`, `DEPLOY_PAGES` (`'true'` để bật), `WORKER_URL`, `TELEGRAM_BOT`.
  - Mọi task vẫn test được khi chưa có secret nào: job cần secret bị tắt qua biến repo.
- **Không workflow CI nào ký giao dịch on-chain.** Không workflow nào chứa `cast send`, `--broadcast`, `--private-key`, `PRIVATE_KEY` hay `KEEPER_KEY`. Test ở Task 7 ép điều này.
- **Không telemetry, không tracker, không tải gì từ CDN ở web và docs.** Docs: Pagefind cục bộ, không analytics, font hệ thống. Bộ kiểm link ở Task 2 báo lỗi khi HTML hoặc CSS của docs chứa bất kỳ URL tuyệt đối nào ra site khác, kể cả link thường (luật của gateway DeWEB). URL ngoài trong docs hiện dưới dạng inline code.
- **Contract đã đóng băng sau mainnet (26/11):** Plan 6 không sửa `contracts/src/**`, không sửa mục `[profile.*]` của `contracts/foundry.toml`. Sửa một comment cũng đổi metadata hash, tức đổi `vaultImplCodehash`. Phát hiện tĩnh được xử lý bằng cấu hình (Task 8).
- **Repo và URL:**
  - Repo: `duongnq2798/atropyle` (`https://github.com/duongnq2798/atropyle`).
  - Docs: `https://duongnq2798.github.io/atropyle/docs/` (`DOCS_BASE_URL` của SDK, không có `/` cuối). DeWEB dùng `/docs/`, Pages dùng `/atropyle/docs/`.
  - Trang lỗi: `${DOCS_BASE_URL}/reference/errors.html#<code viết thường>` cho **mọi** mã trong `ERROR_CODES`.
  - Mirror web: `https://duongnq2798.github.io/atropyle/`.
- **Gói publish:** `@atropyle/circuits`, `@atropyle/sdk`, `@atropyle/mcp`, `atropyle`, cùng phiên bản `0.1.0`, dist-tag `latest`, ngày 2/12. Mỗi `package.json` có `repository` (`git+https://github.com/duongnq2798/atropyle.git` kèm `directory`), `homepage`, `bugs`, `publishConfig: { access: "public", provenance: true }`.
- **Phiên bản ghim** (đã kiểm bằng `npm view`, ngày 18/11): astro 7.4.12, @astrojs/starlight 0.43.1, yaml 2.9.1, typedoc 0.28.20, typedoc-plugin-markdown 4.14.1, knip 6.45.1, @changesets/cli 3.0.3, playwright 1.65.1, esbuild 0.28.2. publint (0.3.25) và @arethetypeswrong/cli (0.18.5) đã là devDependency của từng gói từ Plan 2–3 (script `check:pkg`); Plan 6 không cài lại. Giữ nguyên bản Plan 2 đã ghim: vitest 3.2.7, tsx 4.20.6, TypeScript 5.9.3, @types/node 24.19.2. Cài bằng `npm install -D -E …`.
- **Node:** astro 7.4.12 cần Node ≥ 22.23.4. Mọi job CI của Plan 6 chạy Node 24.
- **Ngôn ngữ:**
  - Thân plan và tài liệu nội bộ trong `docs/` (kể cả `docs/submission/`) viết tiếng Việt.
  - Mã, comment trong mã, chuỗi hiện cho người dùng, nội dung docs site, README gốc, `SECURITY.md`, `CONTRIBUTING.md`, lời thoại video: **tiếng Anh**.
- **File sinh tự động, không sửa tay:** `apps/docs/src/content/docs/reference/**`, `apps/docs/public/schemas/**`, `apps/docs/src/generated/**`, `bench/verify-policy.budget.json` (chỉ ghi bằng `--record`), `traction/cursor.json`, `TRACTION.md`.
- **Biome:** mọi file TS mới qua `npx biome check --write <file>` trước khi commit. File sinh tự động nằm trong danh sách bỏ qua của `biome.json` (Task 2).

**Quyết định của plan bổ sung cho spec** (người duyệt cần biết):

1. **Phiên bản docs, xác minh ngày 18/11 bằng `npm view`:** `astro` 7.4.12 (engines `node >=22.23.4`), `@astrojs/starlight` 0.43.1 (peer `astro ^7.4`, `@astrojs/markdown-remark ^7.3.0`, npm tự cài peer). Các gói docs nằm trong `devDependencies` của `apps/docs` (`private: true`): output là file tĩnh, không có runtime. Vì vậy `npm audit --omit=dev` chỉ xét phần thật sự chạy ở người dùng (gói publish, Worker).
2. **`build.format: 'file'` với base tuỳ biến chạy đúng.** Đối chiếu mã nguồn Starlight (`packages/starlight/src/utils/createPathFormatter.ts`) và test `packages/starlight/__tests__/build-format-file/navigation.test.ts`: với `format: 'file'`, Starlight gọi `ensureHtmlExtension` rồi ghép base, nên link sidebar và điều hướng có dạng `<base>index.html`, `<base>reference/configuration.html`. Pagefind chạy ở `astro:build:done` trên thư mục output; UI tìm kiếm dùng `import.meta.env.BASE_URL`, nên cũng theo base. Riêng kết quả tìm kiếm cho trang chủ docs có URL `<base>` (Pagefind bỏ `index.html`), mà fallback của DeWEB không áp cho đường dẫn này. Vì vậy trang chủ docs đặt `pagefind: false`.
3. **Link trong nội dung viết tương đối, có `.html`** (ví dụ `../reference/errors.html#not_owner`). Cách này không phụ thuộc base, nên một bản build dùng được ở cả `/docs/` và `/atropyle/docs/`. Link từ docs sang web app là `../index.html#/…` (tính từ gốc docs), vì web luôn nằm ngay trên thư mục docs ở cả hai nơi.
4. **Tự viết bộ kiểm link chạy trên HTML đã build** (`apps/docs/scripts/check-links.ts`), không dùng `starlight-links-validator` 0.27.0. Gói đó kiểm link trong nguồn Markdown, nên không thấy được lỗi base, lỗi tài nguyên ngoài, hay anchor do Starlight sinh. Bộ kiểm của plan làm ba việc trên HTML thật: (a) mọi `href`/`src` nội bộ trỏ tới file có thật và `#id` có thật; (b) không có URL tuyệt đối nào ra site khác, kể cả link thường, vì gateway DeWEB tính mọi URL như vậy trong `href`/`src`/`srcset`/`url()`/`@import` là request ngoài chain và site mất badge "100% on-chain" (Plan 4 Quyết định 6–7, đối chiếu `purity.js` của TapeKit); (c) mọi anchor bắt buộc (mã lỗi) có mặt. CI chạy nó cho cả hai base. Hệ quả: Starlight không đặt `site`, `social`, `editLink`; một plugin rehype đổi link ra ngoài trong nội dung (kể cả URL trần) thành inline code.
5. **Tự sinh `llms.txt` và `llms-full.txt`** trong một integration Astro nhỏ (`astro:build:done`), không dùng `starlight-llms-txt` 0.12.0. Lý do: gói đó ném lỗi khi thiếu `site`, mà URL DeWEB chưa biết; nó cũng không theo `build.format: 'file'`. Bản tự sinh dùng link tương đối và có unit test.
6. **Không dùng sharp:** `image.service = passthroughImageService()`. Docs không có ảnh raster, nên không cần cài binary native.
7. **SDK reference là 5 trang phẳng** thay vì một trang: `reference/sdk.md` (tổng quan) và `reference/sdk-{core,plan,handoff,verify}.md`, mỗi subpath một trang. Một trang cho cả bốn entry sẽ quá dài và trùng tên. TypeDoc 0.28.20 chạy qua API (`Application.bootstrapWithPlugins`, `app.convert()`, `app.generateOutputs(project)`, đối chiếu `src/lib/application.ts` ở tag v0.28.20), mỗi entry một lần, với `typedoc-plugin-markdown` 4.14.1 (`router: 'module'`, `useHTMLAnchors`, `useHTMLEncodedBrackets`, `useCodeBlocks`, `hidePageTitle`, `hideBreadcrumbs`, `hidePageHeader`; đối chiếu `packages/typedoc-plugin-markdown/src/options/declarations.ts`). Script tự thêm frontmatter, nên không cần `typedoc-plugin-frontmatter`, và không dùng `starlight-typedoc`.
8. **Trang CLI sinh từ snapshot `--help`** của Plan 3 (`packages/cli/test/snapshots/help/*.txt`), không đọc thẳng định nghĩa commander như §10.1 viết. Snapshot chính là output của commander và đã được test của Plan 3 khoá, nên hai cách cho cùng nội dung; đọc snapshot thì không phải build CLI. Thứ tự lệnh: `atropyle, verify, status, vaults, simulate, plan, plan-init, plan-check, prepare, doctor, mcp`, rồi các lệnh khác theo bảng chữ cái.
9. **Trang Errors:** mỗi mã một heading `## NOT_OWNER`. Starlight sinh id bằng github-slugger, giữ dấu `_`, nên anchor là `not_owner`, khớp `errorDocsUrl`. Map custom error của contract sang mã lỗi bằng cách encode lỗi với tham số 0 (`encodeErrorResult` trên `revertAbi`) rồi `decodeRevertData`, vì bảng map trong SDK không được export.
10. **Trang Contracts & deployments** là mục cắt số 4 của §18, nên có task riêng ở cuối phần P0 (Task 15). Nguồn: `vaultAbi`, `factoryAbi` (SDK), NatSpec trong artifact Foundry (`metadata.output.userdoc/devdoc`), một bảng ghi chú viết tay cho từng hàm, event và error (`scripts/docs-gen/contract-notes.ts`, vì NatSpec trong contract còn thưa và contract không sửa được nữa), và `deployments/xlayer.json`. Mọi mục ABI (hàm, event, error, trường struct) phải có NatSpec hoặc ghi chú; error có mã SDK thì dùng thông điệp của trang Errors. Ghi chú không khớp mục ABI nào cũng là lỗi. `docs:gen` dừng khi thiếu, và test khoá điều này. Vì đọc artifact, job `docs` của CI cài Foundry và chạy `forge build`.
11. **`tsc -b` của §13 không áp dụng:** mọi tsconfig dùng `noEmit` và không có project references. Thay bằng `npm run typecheck` (mọi workspace) cộng `tsconfig.scripts.json` cho script của Plan 6 (`npm run typecheck:scripts`). `apps/docs` typecheck bằng `astro sync && tsc --noEmit`.
12. **Aderyn đã ngừng phát triển** (repo `Cyfrin/aderyn` đã archive, không còn đường cài qua npm hay cyfrinup; kiểm ngày 18/11). Thay bằng `forge lint` có sẵn trong Foundry 1.9.0. Đối chiếu `crates/forge/tests/cli/lint.rs` ở tag `v1.9.0`: `forge lint` thoát 0 khi chỉ có cảnh báo; `--severity high` chỉ chạy lint mức high; `--deny warnings` biến cảnh báo thành lỗi. Lệnh CI: `forge lint --severity high --deny warnings`. Lint có thể được bỏ qua bằng mục `[lint] exclude_lints` trong `foundry.toml`; mục này không đổi bytecode.
13. **Slither qua `crytic/slither-action` v0.4.2, chạy với artifact sẵn có.** Đối chiếu `entrypoint.sh` của action: `fail-on: high` thành `--fail-high`; `slither-config` thành `--config-file`; `ignore-compile: true` bỏ qua cài solc/foundry và gọi `slither <target> --ignore-compile`. Đối chiếu `crytic_compile/platform/foundry.py`: khi `ignore_compile`, crytic-compile đọc `out/build-info` mà không gọi `forge`. Vì vậy job tự `forge build --build-info --skip test --skip script` bằng Foundry 1.9.0 đã ghim, thay vì để action tự cài foundry "stable". Ghim `slither-version: 0.11.6` (PyPI, 18/11). Plan 1 chưa có Slither trước mainnet; Task 8 nên chạy trước 26/11. Nếu Slither hoặc `forge lint` báo một lỗi high thật sau khi đã deploy: dừng lại, báo người dùng, vì cách sửa duy nhất là factory v2 (spec lõi §13).
14. **CI build lại code hash của vault impl từ mã nguồn** (spec §5.4 bước 4). `scripts/ops/check-codehash.ts` so `keccak256(deployedBytecode.object)` trong `contracts/out/AtropyleVault.sol/AtropyleVault.json` với `vaultImplCodehash` của `deployments/xlayer.json`. `AtropyleVault` không có immutable (đối chiếu Plan 1), nên runtime code on-chain bằng đúng `deployedBytecode`. Thiếu `xlayer.json` thì bỏ qua và in lý do.
15. **knip 6.45.1** (`$schema` `https://unpkg.com/knip@6/schema.json`), cấu hình ở `knip.json`, chạy trong job `security`. `exports` và `types` thừa để mức `warn` (SDK cố ý export rộng); `files`, `dependencies`, `unlisted`, `binaries` là lỗi.
16. **npm trusted publishing** (đối chiếu docs.npmjs.com/trusted-publishers, 18/11):
    - Cần npm CLI ≥ 11.5.1, Node ≥ 22.14.0, quyền `id-token: write`, runner do GitHub host. `repository.url` phải khớp đúng repo. Provenance tự có khi publish qua trusted publishing, và cần repo lẫn gói đều công khai.
    - **Gói phải tồn tại trên npm thì mới cấu hình trusted publisher được.** Vì vậy lần publish đầu (`0.1.0`, 2/12) dùng token: `[USER]` tạo granular access token (quyền publish cho scope `@atropyle` và gói `atropyle`, bật "bypass 2FA"), đặt secret `NPM_TOKEN`. Job vẫn có `id-token: write` và `publishConfig.provenance: true`, nên bản `0.1.0` vẫn có provenance.
    - Ngay sau đó `[USER]` cấu hình trusted publisher cho cả 4 gói trên npmjs.com (workflow `release.yml`, environment `npm`), xoá secret `NPM_TOKEN`, thu hồi token.
    - Bốn tên `atropyle`, `@atropyle/sdk`, `@atropyle/circuits`, `@atropyle/mcp` đều trả E404 trên `npm view` ngày 18/11, tức còn trống.
    - Node 24 mới nhất trên runner đi kèm npm 11.x ≥ 11.5.1; workflow kiểm phiên bản npm trước khi publish thay vì cài npm toàn cục.
17. **Changesets 3.0.3** (engines `node ^22.11 || ^24 || >=26`, `npm >=10.9.0`):
    - `changeset init` nay hỏi tương tác, nên `.changeset/config.json` viết tay. Mặc định của v3 (đối chiếu `packages/config/src/defaults.ts`): `changelog: "@changesets/cli/changelog"`, `access: "restricted"` (plan đổi thành `public`), `privatePackages` mặc định không version.
    - Bốn gói nằm trong một nhóm `fixed`, luôn cùng phiên bản. Phiên bản đã là `0.1.0`, nên lần publish đầu không cần changeset.
    - **`changesets/action` v2.1.2** (đối chiếu README và CHANGELOG ở tag đó): input đổi sang kebab-case (`publish-script`, `version-script`, `pr-title`, `commit-message`); có sub-action `select-mode`, `version`, `publish`, và README khuyên tách chúng khi dùng trusted publishing để thu hẹp quyền; action **không còn tự ghi `.npmrc` từ `NPM_TOKEN`**. Vì vậy plan tách ba job, và tự ghi `.npmrc` chỉ khi có `NPM_TOKEN`.
    - PR "Version Packages" do `GITHUB_TOKEN` tạo sẽ không kích hoạt CI (luật của GitHub). Người dùng đóng rồi mở lại PR đó để chạy CI trước khi merge.
18. **Release chỉ chạy khi người dùng bật:** job publish cần `vars.NPM_PUBLISH == 'true'`, deploy Worker cần `vars.DEPLOY_WORKER == 'true'`, deploy Pages cần `vars.DEPLOY_PAGES == 'true'`. Push lên `main` trước ngày 2/12 không publish gì.
19. **Badge "Policy verified on mainnet" không cần secret nào ngoài `GITHUB_TOKEN`:** `proof.yml` ghi `proof.json` theo định dạng endpoint của shields.io (`{ schemaVersion: 1, label, message, color }`), rồi force-push một commit duy nhất lên nhánh mồ côi `badges` bằng `GITHUB_TOKEN` (`permissions: contents: write` chỉ ở job đó). README trỏ `https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fduongnq2798%2Fatropyle%2Fbadges%2Fproof.json`. Push bằng `GITHUB_TOKEN` không kích hoạt workflow khác (luật của GitHub), nên nhánh `badges` không chạy CI.
20. **Badge có ba trạng thái:** `passing` (cả hai lần verify thoát 0 và `ok: true`), `failing` (một lần thoát 3 hoặc `ok: false`), `unknown` (RPC lỗi, thoát 4, hoặc không có report). RPC sập không được biến thành "failing", cũng không được giữ "passing".
21. **Lần verify bằng gói đã publish chạy trong `$RUNNER_TEMP`, ngoài repo.** Nếu chạy `npx atropyle@latest` trong repo đã `npm ci`, npm có thể dùng gói workspace cùng phiên bản thay vì tải từ registry, và như vậy không kiểm gì cả.
22. **Runner GitHub đã bỏ Node 20** (GitHub changelog, thông báo cuối ngày 23/09/2026: action JavaScript chạy bằng Node 24, không có cách tắt). Plan 6 viết workflow mới bằng major hiện tại, và Task 16 nâng mọi action của Plan 1–5 lên cùng major rồi ghim SHA. Tag và commit đã tra bằng `git ls-remote` ngày 18/11 (`^{}` là commit của tag annotated):

    | Action | Tag | Commit |
    |---|---|---|
    | `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
    | `actions/setup-node` | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
    | `actions/upload-artifact` | v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
    | `actions/download-artifact` | v7 | `37930b1c2abaa49bbe596cd826c3c89aef350131` |
    | `actions/upload-pages-artifact` | v5.0.0 | `fc324d3547104276b827a68afc52ff2a11cc49c9` |
    | `actions/deploy-pages` | v5.0.1 | `368f82528645a54fb793d4d04e342629a3f51346` |
    | `github/codeql-action` | v4.39.3 | `33d7b85da1a04171e211befe2c739303b9a4c066` |
    | `gitleaks/gitleaks-action` | v3.0.0 | `e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` |
    | `crytic/slither-action` | v0.4.2 | `b52cc1cbfee9ca3e8722dd5224299d16c9a6b80f` |
    | `changesets/action` | v2.1.2 | `ae32849d5ba541f9ae29e40e22a623bc13562f51` |
    | `foundry-rs/foundry-toolchain` | v1.9.2 (= v1) | `dba66c27052e63476d886f22216e119ba7e615bf` |
    | `cloudflare/wrangler-action` | v4.1.3 | `953926a2e2182532811c01a25e53647d93bf07c0` |

    `scripts/ops/pin-actions.ts` tra lại SHA lúc thực thi (không chép bảng này), nên kết quả luôn mới. Ghi chú khi nâng: `setup-node` từ v5 tự bật cache npm khi có trường `packageManager` (repo không có); từ v7 là ESM và bỏ biến giả `NODE_AUTH_TOKEN`. `checkout` v6 lưu credential vào file riêng; v7 chặn checkout PR từ fork trong `pull_request_target`/`workflow_run` (repo không dùng hai trigger này). Workflow `release.yml` và `proof.yml` không dùng cache npm, để tránh cache poisoning.
23. **Dependabot chỉ bật cập nhật bảo mật:** `open-pull-requests-limit: 0` cho `npm` và `github-actions` tắt cập nhật phiên bản nhưng vẫn để cập nhật bảo mật chạy (GitHub docs "Customizing Dependabot security pull requests", 18/11). `[USER]` bật Dependabot alerts và security updates trong Settings.
24. **CodeQL v4:** ngôn ngữ `javascript-typescript` và `actions`, `build-mode: none`, chạy khi có PR, khi push `main`, và mỗi tuần. Cần repo công khai (hoặc GitHub Advanced Security).
25. **gitleaks-action v3.0.0** chạy Node 24, input không đổi so với v2; tài khoản cá nhân không cần `GITLEAKS_LICENSE`. Cần `GITHUB_TOKEN` trong env và checkout `fetch-depth: 0`.
26. **Benchmark `verifyPolicy` (§12.2):**
    - Dùng `evaluatePolicyBundle` trên một `PolicyBundle` dựng từ netlist build từ mã nguồn, giống hệt test `verify-policy` của Plan 2. Không cần mạng, chạy đủ 2^26 tổ hợp.
    - Ngân sách không phụ thuộc máy: mỗi lần đo cũng chạy một vòng hiệu chuẩn cố định, và so **tỉ lệ** `verifyMs / calibrationMs`. Mỗi bên lấy giá trị nhỏ nhất của 3 lần chạy.
    - Lần đo đầu được ghi vào `bench/verify-policy.budget.json` bằng `--record` rồi commit. CI báo lỗi khi tỉ lệ đo được lớn hơn ngân sách quá 30%. Nếu lần CI đầu tiên lệch chỉ vì khác nền tảng, ghi lại ngân sách đúng một lần bằng số CI in ra (lệnh in sẵn JSON).
    - Chromium dùng `playwright` 1.65.1 (cùng bản Plan 4 nên ghim), bundle IIFE bằng `esbuild` 0.28.2, nạp bằng `page.addScriptTag({ content })`.
27. **Traction:** `npm run traction` gọi `atro.stats({ resume })`, lưu cursor ở `traction/cursor.json` (bigint dạng chuỗi qua `stringify`), ghi `TRACTION.md`. Mốc thời gian là timestamp của block cuối (tái lập được), không dùng đồng hồ máy. `TRACTION.md` liệt kê địa chỉ vault kèm link OKLink, **không** liệt kê địa chỉ owner. `--verify` đếm lại từ đầu tới đúng `toBlock` đã ghi; việc này cần `stats({ toBlock })`, là một Plan 2 gap (Task 10).
28. **Giấy phép:** MIT cho cả repo (spec và Plan 2 đã chọn MIT cho gói publish). Người giữ bản quyền ghi là `Nguyen Quoc Duong` (tên git user). Đây là câu hỏi mở cho người dùng.
29. **Docs có một dòng "Beta — unaudited"** ở trang chủ và các trang người dùng (spec lõi §6).
30. **Hồ sơ nộp bài** (`docs/submission/`) viết tiếng Việt vì là tài liệu nội bộ. Lời thoại video và elevator pitch viết tiếng Anh, vì giám khảo đọc tiếng Anh.

## Review Focus

1. **Docs mở ở host thứ hai** (DeWEB dùng `/docs/`, Pages dùng `/atropyle/docs/`). Người đọc mong mọi link, CSS, script và ô tìm kiếm đều chạy ở cả hai nơi. Một link tuyệt đối viết tay như `/docs/x.html` sẽ hỏng trên Pages. Test `rejects absolute links that escape the base` (Task 2), và CI build rồi kiểm link cho cả hai base (Task 7).
2. **Một mã lỗi mới trong SDK mà chưa có anchor trên trang Errors.** CLI, MCP và Worker đều in `docsUrl`; người dùng bấm vào phải tới đúng mục, không phải đầu trang. Test `every ERROR_CODES entry gets an anchor` (Task 3), cộng kiểm anchor bắt buộc trên HTML đã build (Task 3, Step 7).
3. **Lệnh CLI trong docs lệch với CLI thật** (đổi tên cờ, lệnh con). Người dùng chép lệnh từ docs và gặp lỗi cú pháp. Test `every atropyle command in the docs exists in the CLI snapshots` (Task 6).
4. **Gói npm chạy trong monorepo nhưng hỏng khi cài từ tarball** (thiếu file trong `files`, `bin` sai, phụ thuộc phiên bản chưa publish, ESM/CJS sai). Người dùng `npx atropyle` trên máy sạch phải chạy được. `npm run release:check` cài 4 tarball vào thư mục trống rồi chạy CLI trên devnet (Task 13).
5. **RPC mainnet sập hoặc giới hạn rate đúng lúc `proof.yml` chạy.** Badge phải hiện `unknown`, không được báo "failing" sai, cũng không được giữ "passing" cũ. Test `network errors make the badge unknown, not failing` (Task 12).

---

## File Structure

```
package.json                               (sửa) script docs:gen, test:scripts, typecheck:scripts, bench, traction,
                                           readme:sync, release:*, pin-actions, codehash:check, proof:report,
                                           doc-test (P1); devDeps
.gitignore                                 (sửa) apps/docs/.astro/, proof/, badge/, .doc-test/ (P1)
.gitattributes                             mọi file text dùng LF (các phép so byte, metadata hash Solidity)
biome.json                                 (sửa) bỏ qua file sinh tự động
tsconfig.scripts.json                      typecheck cho script của Plan 6
vitest.scripts.config.ts                   test cho scripts/test/**
knip.json                                  cấu hình knip
.changeset/config.json, .changeset/README.md
README.md, SECURITY.md, CONTRIBUTING.md, LICENSE
TRACTION.md                                (sinh) npm run traction
traction/cursor.json                       (sinh) cursor của stats()
bench/verify-policy.budget.json            (sinh, --record) ngân sách benchmark
circuits/package.json                      (sửa) repository, homepage, bugs, publishConfig
packages/{sdk,mcp,cli}/package.json        (sửa) như trên
contracts/slither.config.json              lọc đường dẫn và detector đã phân loại
contracts/STATIC-ANALYSIS.md               kết quả phân loại Slither và forge lint (tiếng Anh)
.github/
  workflows/ci.yml                         (sửa) permissions; job docs, scripts, security, contracts-static, bench, packages
  workflows/proof.yml                      verify mainnet hằng ngày, badge
  workflows/release.yml                    changesets, npm, Worker, Pages
  workflows/codeql.yml                     CodeQL
  dependabot.yml                           chỉ cập nhật bảo mật
apps/docs/
  package.json, astro.config.ts, tsconfig.json, vitest.config.ts
  src/content.config.ts, src/sidebar.ts
  src/integrations/llms-txt.ts             integration sinh llms.txt
  src/lib/llms.ts                          hàm thuần: đọc trang, dựng llms.txt / llms-full.txt
  src/lib/external-links.ts                plugin rehype: link ra site khác thành inline code (luật DeWEB)
  src/generated/required-anchors.json      (sinh) anchor bắt buộc, cho bộ kiểm link
  scripts/check-links.ts                   CLI kiểm link trên dist/
  scripts/lib/check.ts                     hàm kiểm link, anchor, tài nguyên ngoài
  public/favicon.svg
  public/schemas/*.json                    (sinh) JSON Schema của CLI
  src/content/docs/index.md                trang chủ docs
  src/content/docs/users/*.md              6 trang người dùng
  src/content/docs/concepts/*.md           4 trang khái niệm
  src/content/docs/developers/*.md         3 trang developer viết tay
  src/content/docs/reference/*.md          (sinh) sdk, sdk-core, sdk-plan, sdk-handoff, sdk-verify, cli, contracts, errors
  test/{llms,check-links,external-links,pages}.test.ts
scripts/
  docs-gen.ts                              npm run docs:gen [-- --check]
  docs-gen/{files,errors,cli,sdk,contracts,contract-notes}.ts
  bench/{bundle,calibrate,budget,browser,run,browser-entry}.ts
  ops/workflows.ts                         luật chung cho mọi workflow (quyền, secret, không ký)
  ops/doc-commands.ts                      tìm lệnh atropyle trong docs, so với snapshot --help
  traction.ts                              npm run traction [-- --verify]
  traction/render.ts                       hàm thuần: cursor JSON, TRACTION.md
  traction/update.ts                       đếm từng đoạn qua stats(), lưu cursor, --verify
  ops/check-codehash.ts                    so code hash vault impl với deployments/xlayer.json
  ops/proof.ts, ops/proof-report.ts        phân loại kết quả verify, badge, tóm tắt
  ops/readme.ts                            hai khối sinh của README: badge, bảng deployment
  ops/packages.ts                          danh sách bốn gói publish và metadata bắt buộc
  ops/pack.ts                              hàm thuần: đọc `npm pack --json`, kiểm bin và phụ thuộc
  ops/release-check.ts                     publint, attw, smoke từ tarball trên devnet
  ops/pins.ts                              hàm thuần: đọc dòng uses:, chọn tag, ghim SHA, kiểm
  ops/pin-actions.ts                       CLI ghim SHA cho action, --check
  ops/demo-timing.ts                       kiểm bảng thời gian của kịch bản demo
  ops/doc-blocks.ts                        (P1) tìm ví dụ `test` trong docs, sandbox, chạy từng ví dụ
  ops/doc-test.ts                          (P1) CLI: dựng devnet rồi chạy ví dụ `test`
  test/*.test.ts
docs/submission/
  demo-script.md, submission-checklist.md, e2e-mainnet-checklist.md
```

---

### Task 1: Metadata của gói publish, hạ tầng test cho script, và khởi động repo `[USER]`

**Files:**
- Create: `scripts/ops/packages.ts`, `vitest.scripts.config.ts`, `tsconfig.scripts.json`, `.gitattributes`
- Modify: `package.json` (gốc), `circuits/package.json`, `packages/sdk/package.json`, `packages/mcp/package.json`, `packages/cli/package.json`
- Test: `scripts/test/package-meta.test.ts`

**Interfaces:**
- Consumes:
  - `package.json` của `circuits` và `packages/sdk` (Plan 2 Task 1–2), `packages/mcp` và `packages/cli` (Plan 3).
  - `DOCS_BASE_URL` trong `packages/sdk/src/links.ts` (Plan 2 Task 1).
- Produces:
  - `scripts/ops/packages.ts`:
    - `REPO: { slug: 'duongnq2798/atropyle'; url: 'https://github.com/duongnq2798/atropyle' }`
    - `DOCS_URL = 'https://duongnq2798.github.io/atropyle/docs'`
    - `interface PublishPackage { dir: string; name: string; docsPage: string; bin: boolean }`
    - `PUBLISH_PACKAGES: readonly PublishPackage[]`, theo đúng thứ tự publish: circuits → sdk → mcp → cli.
  - Script gốc `test:scripts` (vitest với `vitest.scripts.config.ts`, chạy `scripts/test/**/*.test.ts`) và `typecheck:scripts` (`tsc -p tsconfig.scripts.json`). Mọi task sau đặt test script vào `scripts/test/`.
  - Bốn gói publish có `repository`, `homepage`, `bugs`, `publishConfig`.

- [ ] **Step 1: Viết test thất bại**

`scripts/test/package-meta.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCS_BASE_URL } from '../../packages/sdk/src/links';
import { DOCS_URL, PUBLISH_PACKAGES, REPO } from '../ops/packages';

const ROOT = join(import.meta.dirname, '..', '..');

interface PackageJson {
  name: string;
  version: string;
  private?: boolean;
  license?: string;
  engines?: { node?: string };
  repository?: unknown;
  homepage?: string;
  bugs?: unknown;
  publishConfig?: unknown;
}

const read = (dir: string): PackageJson => JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8'));

describe('published package metadata', () => {
  it.each(PUBLISH_PACKAGES)('$name points at the GitHub repository and the docs', (p) => {
    const pkg = read(p.dir);
    expect(pkg.name).toBe(p.name);
    expect(pkg.private).toBeUndefined();
    expect(pkg.license).toBe('MIT');
    expect(pkg.engines?.node).toBe('>=20');
    // npm provenance and trusted publishing need repository.url to match the repository that builds the package.
    expect(pkg.repository).toEqual({ type: 'git', url: `git+${REPO.url}.git`, directory: p.dir });
    expect(pkg.homepage).toBe(`${DOCS_URL}/${p.docsPage}.html`);
    expect(pkg.bugs).toEqual({ url: `${REPO.url}/issues` });
    expect(pkg.publishConfig).toEqual({ access: 'public', provenance: true });
  });

  it('every published package has the same version, 0.1.0 for the beta', () => {
    expect(new Set(PUBLISH_PACKAGES.map((p) => read(p.dir).version))).toEqual(new Set(['0.1.0']));
  });

  it('uses the same docs base as the SDK error links', () => {
    expect(DOCS_URL).toBe(DOCS_BASE_URL);
  });

  it('lists packages in dependency order', () => {
    expect(PUBLISH_PACKAGES.map((p) => p.name)).toEqual(['@atropyle/circuits', '@atropyle/sdk', '@atropyle/mcp', 'atropyle']);
  });
});
```

`vitest.scripts.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@atropyle/circuits': fileURLToPath(new URL('./circuits/src/index.ts', import.meta.url)) },
  },
  test: { include: ['scripts/test/**/*.test.ts'], testTimeout: 120_000, hookTimeout: 180_000 },
});
```

`tsconfig.scripts.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"],
    "paths": { "@atropyle/circuits": ["./circuits/src/index.ts"] }
  },
  "include": [
    "scripts/docs-gen.ts",
    "scripts/docs-gen/**/*.ts",
    "scripts/bench/**/*.ts",
    "scripts/traction.ts",
    "scripts/traction/**/*.ts",
    "scripts/ops/**/*.ts",
    "scripts/test/**/*.ts",
    "vitest.scripts.config.ts"
  ]
}
```

Thêm vào `scripts` của `package.json` gốc (giữ nguyên các script khác):

```json
"test:scripts": "vitest run -c vitest.scripts.config.ts",
"typecheck:scripts": "tsc -p tsconfig.scripts.json"
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `npm run test:scripts -- package-meta`
Expected: FAIL vì không tìm thấy `../ops/packages`.

- [ ] **Step 3: Viết `scripts/ops/packages.ts` và sửa bốn `package.json`**

`scripts/ops/packages.ts`:

```ts
// Single source for the repository coordinates and the list of packages published to npm.
export const REPO = {
  slug: 'duongnq2798/atropyle',
  url: 'https://github.com/duongnq2798/atropyle',
} as const;

// Same value as DOCS_BASE_URL in packages/sdk/src/links.ts (a test keeps them equal).
export const DOCS_URL = 'https://duongnq2798.github.io/atropyle/docs';

export interface PublishPackage {
  /** Workspace directory, relative to the repository root. */
  dir: string;
  name: string;
  /** Docs page (without .html) used as the npm homepage. */
  docsPage: string;
  /** True when the package ships a bin. */
  bin: boolean;
}

// Dependency order: each package only depends on packages listed before it.
export const PUBLISH_PACKAGES: readonly PublishPackage[] = [
  { dir: 'circuits', name: '@atropyle/circuits', docsPage: 'concepts/policy-circuit', bin: false },
  { dir: 'packages/sdk', name: '@atropyle/sdk', docsPage: 'reference/sdk', bin: false },
  { dir: 'packages/mcp', name: '@atropyle/mcp', docsPage: 'developers/ai-agents', bin: true },
  { dir: 'packages/cli', name: 'atropyle', docsPage: 'reference/cli', bin: true },
];
```

Thêm các trường sau vào từng `package.json`, ngay sau trường `license`, giữ nguyên mọi trường khác. Bốn khối chỉ khác nhau ở `directory` và `homepage`.

`circuits/package.json`:

```json
"repository": { "type": "git", "url": "git+https://github.com/duongnq2798/atropyle.git", "directory": "circuits" },
"homepage": "https://duongnq2798.github.io/atropyle/docs/concepts/policy-circuit.html",
"bugs": { "url": "https://github.com/duongnq2798/atropyle/issues" },
"publishConfig": { "access": "public", "provenance": true },
```

`packages/sdk/package.json`:

```json
"repository": { "type": "git", "url": "git+https://github.com/duongnq2798/atropyle.git", "directory": "packages/sdk" },
"homepage": "https://duongnq2798.github.io/atropyle/docs/reference/sdk.html",
"bugs": { "url": "https://github.com/duongnq2798/atropyle/issues" },
"publishConfig": { "access": "public", "provenance": true },
```

`packages/mcp/package.json`:

```json
"repository": { "type": "git", "url": "git+https://github.com/duongnq2798/atropyle.git", "directory": "packages/mcp" },
"homepage": "https://duongnq2798.github.io/atropyle/docs/developers/ai-agents.html",
"bugs": { "url": "https://github.com/duongnq2798/atropyle/issues" },
"publishConfig": { "access": "public", "provenance": true },
```

`packages/cli/package.json`:

```json
"repository": { "type": "git", "url": "git+https://github.com/duongnq2798/atropyle.git", "directory": "packages/cli" },
"homepage": "https://duongnq2798.github.io/atropyle/docs/reference/cli.html",
"bugs": { "url": "https://github.com/duongnq2798/atropyle/issues" },
"publishConfig": { "access": "public", "provenance": true },
```

`.gitattributes` (máy dev có `core.autocrlf=true`; không có file này thì một lần clone lại trên Windows đổi mọi file sang CRLF, làm hỏng các phép so byte của `docs:gen --check`, `readme:sync --check`, `traction --verify`, và đổi metadata hash của Solidity):

```text
# Every text file uses LF on every OS. Several checks compare exact bytes, and the Solidity
# metadata hash, part of the deployed bytecode, covers the exact source bytes.
* text=auto eol=lf
*.png binary
*.ico binary
*.woff2 binary
```

File đã commit vẫn là LF trong index (autocrlf chuyển về LF khi commit), nên không cần `git add --renormalize`.

Nếu `packages/mcp` hoặc `packages/cli` thiếu `"license": "MIT"` hay `"engines": { "node": ">=20" }` thì thêm vào; brief chung của Plan 3 đã yêu cầu cả hai. Trang docs trong `homepage` sẽ có ở Task 3–6; Task 6 có test kiểm mỗi `homepage` trỏ tới một trang có thật.

- [ ] **Step 4: Chạy test để thấy qua, rồi typecheck**

Run: `npm run test:scripts -- package-meta && npm run typecheck:scripts && npx biome check --write scripts/ops/packages.ts scripts/test/package-meta.test.ts vitest.scripts.config.ts && npx biome ci .`
Expected: PASS 7 test (4 gói và 3 test chung); `tsc` và biome thoát 0.

Run: `git check-attr eol -- README.md contracts/src/AtropyleVault.sol`
Expected: `README.md: eol: lf` và `contracts/src/AtropyleVault.sol: eol: lf`.

- [ ] **Step 5: Commit**

```bash
git add .gitattributes scripts/ops/packages.ts scripts/test/package-meta.test.ts vitest.scripts.config.ts tsconfig.scripts.json package.json circuits/package.json packages/sdk/package.json packages/mcp/package.json packages/cli/package.json
git commit -m "chore(release): repository metadata for published packages and a test harness for scripts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: `[USER]` Đưa repo lên GitHub và bật các tính năng cần thiết**

Repo `duongnq2798/atropyle` hiện private và trống. Người dùng tự chạy các lệnh sau trên máy mình (đã `gh auth login`). Agent không chạy bước này.

```bash
# 1. Push main. The local branch was still called master on 18/11; CI, proof.yml and release.yml expect main.
[ "$(git branch --show-current)" = main ] || git branch -m main
git remote get-url origin || git remote add origin https://github.com/duongnq2798/atropyle.git
git push -u origin main

# 2. Make the repository public: needed for GitHub Pages, CodeQL, npm provenance, the MCP Registry,
#    the plugin marketplace and `npx skills add`.
gh repo edit duongnq2798/atropyle --visibility public --accept-visibility-change-consequences

# 3. GitHub Pages builds from GitHub Actions (release.yml, Task 14).
gh api -X POST repos/duongnq2798/atropyle/pages -f build_type=workflow

# 4. GITHUB_TOKEN stays read-only by default; allow Actions to open the changesets "Version Packages" PR.
gh api -X PUT repos/duongnq2798/atropyle/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true

# 5. Security: Dependabot alerts and security updates, private vulnerability reporting (SECURITY.md, Task 11).
gh api -X PUT repos/duongnq2798/atropyle/vulnerability-alerts
gh api -X PUT repos/duongnq2798/atropyle/automated-security-fixes
gh api -X PUT repos/duongnq2798/atropyle/private-vulnerability-reporting

# 6. Repository variables. Every deploy and publish stays off until the user turns it on (Task 14).
gh variable set NPM_PUBLISH --repo duongnq2798/atropyle --body false
gh variable set DEPLOY_WORKER --repo duongnq2798/atropyle --body false
gh variable set DEPLOY_PAGES --repo duongnq2798/atropyle --body false
```

Việc trên npmjs.com (spec §19 việc 3, trước 2/12):
- Bật 2FA cho tài khoản npm, chế độ "Authorization and writes".
- Tạo org miễn phí `atropyle` để có scope `@atropyle`.

Người dùng tự kiểm:
- `gh repo view duongnq2798/atropyle --json visibility,defaultBranchRef` in `"visibility":"PUBLIC"` và `"name":"main"`.
- `gh api repos/duongnq2798/atropyle/pages --jq .build_type` in `workflow`.

Từ đây mỗi lần push, CI chạy trên GitHub. Mọi task sau vẫn kiểm được hoàn toàn trên máy bằng lệnh `Run:` của task đó.

### Task 2: Khung `apps/docs`: Starlight, `llms.txt`, bộ kiểm link

**Files:**
- Create: `apps/docs/package.json`, `apps/docs/astro.config.ts`, `apps/docs/tsconfig.json`, `apps/docs/vitest.config.ts`
- Create: `apps/docs/src/content.config.ts`, `apps/docs/src/sidebar.ts`, `apps/docs/src/integrations/llms-txt.ts`, `apps/docs/src/lib/llms.ts`, `apps/docs/src/lib/external-links.ts`
- Create: `apps/docs/scripts/check-links.ts`, `apps/docs/scripts/lib/check.ts`
- Create: `apps/docs/public/favicon.svg`, `apps/docs/src/content/docs/index.md`
- Modify: `.gitignore`, `biome.json`, `package-lock.json`
- Test: `apps/docs/test/llms.test.ts`, `apps/docs/test/check-links.test.ts`, `apps/docs/test/external-links.test.ts`

**Interfaces:**
- Consumes: không có gì từ task trước, ngoài workspace `apps/*` của `package.json` gốc (Plan 2 Task 1).
- Produces:
  - Workspace `@atropyle/docs` (`private: true`). Script:
    - `build`: `astro build`. Đọc `DOCS_BASE` (mặc định `/docs/`, phải bắt đầu và kết thúc bằng `/`), ra `apps/docs/dist`. Đây là lệnh mà `scripts/build-site.ts` của Plan 4 gọi.
    - `check:links [-- <dir>]`: kiểm `dist` (hoặc `<dir>`) với base `DOCS_BASE`. Thoát 1 khi có lỗi.
    - `test`, `typecheck`, `dev`, `preview`.
  - `src/lib/llms.ts`:
    - `interface DocPage { slug: string; title: string; description: string; group: string; groupIndex: number; order: number; body: string }`
    - `GROUPS`: `users` → "Start here", `concepts` → "Concepts", `developers` → "Developers", `reference` → "Reference".
    - `parsePage(relPath: string, source: string): DocPage | null` (trang ngoài bốn nhóm, như `index.md`, trả `null`)
    - `readPages(contentDir: string): DocPage[]`, `sortPages(pages: DocPage[]): DocPage[]`
    - `buildLlms(pages: DocPage[]): { llms: string; full: string }`
  - `scripts/lib/check.ts`:
    - `interface LinkIssue { file: string; ref: string; problem: string }`
    - `interface CheckOptions { base: string; requiredAnchors?: Record<string, readonly string[]>; requiredFiles?: readonly string[] }`
    - `type Target = { kind: 'skip' } | { kind: 'web' } | { kind: 'file'; path: string; hash: string } | { kind: 'error'; problem: string }`
    - `resolveRef(fromFile: string, value: string, base: string): Target`
    - `extractIds(html: string): Set<string>`
    - `checkSite(dir: string, o: CheckOptions): LinkIssue[]`. Mọi URL tuyệt đối ra site khác (`http(s):`, `ws(s):`, `ftp:`, `//`) trong `href`, `src`, `srcset`, `action`, `poster`, `data`, `formaction`, `background`, `url()`, `@import` hay meta refresh đều là lỗi, kể cả link thường: đó là luật quét của gateway DeWEB (Plan 4 Quyết định 6–7).
  - `src/lib/external-links.ts`: `interface HastNode`, `rehypeExternalLinksAsCode()`. Plugin rehype của mọi trang Markdown, kể cả trang sinh: link ra site khác (và URL trần được Markdown tự biến thành link) thành inline code, nên người viết nội dung không phải nhớ luật trên.
  - `src/sidebar.ts` export `interface SidebarGroup { label: string; autogenerate: { directory: string } }` và `sidebar: SidebarGroup[]`. Task 3–6 thay toàn bộ nội dung file này.
  - Bộ kiểm đọc `src/generated/required-anchors.json` (dạng `Record<string, string[]>`, đường dẫn trang → id) nếu file tồn tại. Task 3 sinh file này.
  - Quy ước nội dung cho Task 3–6 và 15: trang nằm trong `src/content/docs/{users,concepts,developers,reference}/`; frontmatter có `title`, `description`, `sidebar.order`; link nội bộ viết tương đối và có `.html`.

- [ ] **Step 1: Tạo workspace và cài gói**

`apps/docs/package.json`:

```json
{
  "name": "@atropyle/docs",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check:links": "tsx scripts/check-links.ts",
    "test": "vitest run",
    "typecheck": "astro sync && tsc --noEmit"
  }
}
```

Run: `npm install -D -E -w apps/docs astro@7.4.12 @astrojs/starlight@0.43.1 yaml@2.9.1`
Expected: thoát 0; `apps/docs/package.json` có ba gói trong `devDependencies` với phiên bản chính xác. `vitest`, `tsx`, `typescript` dùng bản ở gốc repo.

- [ ] **Step 2: Viết test thất bại cho `llms.ts` và bộ kiểm link**

`apps/docs/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['test/**/*.test.ts'] } });
```

`apps/docs/test/llms.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildLlms, parsePage } from '../src/lib/llms';

const page = (title: string, order: number, body = 'Body.') =>
  `---\ntitle: ${title}\ndescription: About ${title}.\nsidebar:\n  order: ${order}\n---\n\n${body}\n`;

describe('parsePage', () => {
  it('reads title, description, group and order', () => {
    expect(parsePage('users/heirs.md', page('For heirs', 3, 'Hello.'))).toEqual({
      slug: 'users/heirs',
      title: 'For heirs',
      description: 'About For heirs.',
      group: 'Start here',
      groupIndex: 0,
      order: 3,
      body: 'Hello.',
    });
  });

  it('normalizes Windows paths', () => {
    expect(parsePage('concepts\\security.md', page('Security', 3))?.slug).toBe('concepts/security');
  });

  it('skips pages outside the four groups, such as the landing page', () => {
    expect(parsePage('index.md', page('Home', 1))).toBeNull();
  });

  it('rejects a page without a title', () => {
    expect(() => parsePage('users/x.md', '---\ndescription: d\n---\nx')).toThrow('missing title');
  });
});

describe('buildLlms', () => {
  const pages = [
    parsePage('reference/errors.md', page('Errors', 8)),
    parsePage('users/faq.md', page('FAQ', 6)),
    parsePage('users/what-is-atropyle.md', page('What is Atropyle', 1, 'Intro text.')),
  ].filter((p) => p !== null);

  it('lists pages by group, then by sidebar order, with relative .html links', () => {
    const { llms } = buildLlms(pages);
    expect(llms.startsWith('# Atropyle\n\n> ')).toBe(true);
    const links = [...llms.matchAll(/^- \[([^\]]+)\]\(([^)]+)\)/gm)].map((m) => [m[1], m[2]]);
    expect(links).toEqual([
      ['What is Atropyle', 'users/what-is-atropyle.html'],
      ['FAQ', 'users/faq.html'],
      ['Errors', 'reference/errors.html'],
    ]);
    expect(llms.indexOf('## Start here')).toBeLessThan(llms.indexOf('## Reference'));
    expect(llms).not.toContain('## Concepts');
  });

  it('puts the full text of every page in llms-full.txt', () => {
    const { full } = buildLlms(pages);
    expect(full).toContain('# What is Atropyle\n\nURL: users/what-is-atropyle.html\n\nIntro text.');
    expect(full.match(/^URL: /gm)).toHaveLength(3);
    expect(full.endsWith('\n')).toBe(true);
  });
});
```

`apps/docs/test/check-links.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkSite, extractIds, resolveRef } from '../scripts/lib/check';

function site(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'atropyle-links-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const html = (base: string, body: string) =>
  `<!doctype html><html><head><link rel="stylesheet" href="${base}_astro/a.css"></head>` +
  `<body><h1 id="_top">T</h1>${body}</body></html>`;

const problems = (dir: string, base = '/docs/', extra = {}) => checkSite(dir, { base, ...extra }).map((i) => i.problem);

describe('resolveRef', () => {
  it('resolves relative, base-absolute and same-page links', () => {
    expect(resolveRef('users/heirs.html', '../reference/errors.html#not_owner', '/docs/')).toEqual({
      kind: 'file',
      path: 'reference/errors.html',
      hash: 'not_owner',
    });
    expect(resolveRef('index.html', '/docs/_astro/a.css', '/docs/')).toEqual({ kind: 'file', path: '_astro/a.css', hash: '' });
    expect(resolveRef('users/heirs.html', '#_top', '/docs/')).toEqual({ kind: 'file', path: 'users/heirs.html', hash: '_top' });
  });

  it('treats ../index.html above the docs root as the web app', () => {
    expect(resolveRef('users/heirs.html', '../../index.html#/proof', '/docs/')).toEqual({ kind: 'web' });
    expect(resolveRef('users/heirs.html', '../../other.html', '/docs/').kind).toBe('error');
  });

  it('rejects every absolute URL to another site, as the DeWEB gateway does', () => {
    expect(resolveRef('index.html', 'https://github.com/duongnq2798/atropyle', '/docs/').kind).toBe('error');
    expect(resolveRef('index.html', '//cdn.example.com/x.css', '/docs/').kind).toBe('error');
    expect(resolveRef('index.html', 'wss://rpc.example.com', '/docs/').kind).toBe('error');
    expect(resolveRef('index.html', 'mailto:security@example.com', '/docs/')).toEqual({ kind: 'skip' });
    expect(resolveRef('index.html', 'data:image/svg+xml,%3Csvg/%3E', '/docs/')).toEqual({ kind: 'skip' });
  });
});

describe('checkSite', () => {
  it('accepts a site whose links resolve, under both deployment bases', () => {
    for (const base of ['/docs/', '/atropyle/docs/']) {
      const dir = site({
        'index.html': html(base, '<a href="users/heirs.html#claim">Heirs</a><a href="#_top">top</a>'),
        'users/heirs.html': html(base, '<h2 id="claim">Claim</h2><a href="../index.html">Home</a>'),
        '_astro/a.css': 'body{background:url(./bg.svg)}',
        '_astro/bg.svg': '<svg/>',
      });
      expect(problems(dir, base)).toEqual([]);
    }
  });

  it('rejects absolute links that escape the base', () => {
    const dir = site({ 'index.html': html('/atropyle/docs/', '<a href="/docs/users/heirs.html">x</a>'), '_astro/a.css': '' });
    expect(problems(dir, '/atropyle/docs/')).toEqual([expect.stringContaining('outside the docs base')]);
  });

  it('rejects missing files, missing anchors and directory links', () => {
    const dir = site({
      'index.html': html('/docs/', '<a href="missing.html">a</a><a href="#nope">b</a><a href="users/">c</a>'),
      '_astro/a.css': '',
    });
    expect(problems(dir)).toEqual([
      expect.stringContaining('file not found'),
      expect.stringContaining('anchor not found'),
      expect.stringContaining('directory'),
    ]);
  });

  it('rejects links and resources on another host, in HTML and CSS', () => {
    const dir = site({
      'index.html': html(
        '/docs/',
        '<script src="https://cdn.example.com/a.js"></script><img srcset="//img.example.com/x.png 2x">' +
          '<a href="https://github.com/duongnq2798/atropyle">GitHub</a>',
      ),
      '_astro/a.css': '@import "https://fonts.example.com/f.css";',
    });
    expect(problems(dir)).toEqual([
      expect.stringContaining('another site'),
      expect.stringContaining('another site'),
      expect.stringContaining('another site'),
      expect.stringContaining('another site'),
    ]);
  });

  it('ignores markup inside inline scripts', () => {
    const dir = site({
      'index.html': html('/docs/', '<script>const s = "<a href=\\"missing.html\\">";</script>'),
      '_astro/a.css': '',
    });
    expect(problems(dir)).toEqual([]);
  });

  it('checks required anchors and required files', () => {
    const dir = site({
      'index.html': html('/docs/', ''),
      'reference/errors.html': html('/docs/', '<h2 id="not_owner">NOT_OWNER</h2>'),
      '_astro/a.css': '',
    });
    expect(
      problems(dir, '/docs/', {
        requiredAnchors: { 'reference/errors.html': ['not_owner', 'drill_expired'] },
        requiredFiles: ['llms.txt'],
      }),
    ).toEqual([expect.stringContaining('required anchor #drill_expired'), expect.stringContaining('required file')]);
  });
});

describe('extractIds', () => {
  it('reads id and name attributes outside scripts', () => {
    expect([...extractIds('<h2 id="a">x</h2><a name="b"></a><script>let s = \'<p id="c">\';</script>')]).toEqual(['a', 'b']);
  });
});
```

`apps/docs/test/external-links.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { type HastNode, rehypeExternalLinksAsCode } from '../src/lib/external-links';

const text = (value: string): HastNode => ({ type: 'text', value });
const link = (href: string, label: string): HastNode => ({
  type: 'element',
  tagName: 'a',
  properties: { href },
  children: [text(label)],
});

function run(children: HastNode[]): HastNode {
  const tree: HastNode = { type: 'root', children };
  rehypeExternalLinksAsCode()(tree);
  return tree;
}

describe('rehypeExternalLinksAsCode', () => {
  it('turns a link to another site into its text followed by the URL as code', () => {
    expect(run([link('https://github.com/duongnq2798/atropyle', 'the repository')]).children).toEqual([
      {
        type: 'element',
        tagName: 'span',
        properties: {},
        children: [
          text('the repository ('),
          { type: 'element', tagName: 'code', properties: {}, children: [text('https://github.com/duongnq2798/atropyle')] },
          text(')'),
        ],
      },
    ]);
  });

  it('turns an autolinked URL into code only', () => {
    expect(run([link('https://rpc.xlayer.tech', 'https://rpc.xlayer.tech')]).children).toEqual([
      { type: 'element', tagName: 'code', properties: {}, children: [text('https://rpc.xlayer.tech')] },
    ]);
  });

  it('keeps internal links and walks nested elements', () => {
    const tree = run([
      { type: 'element', tagName: 'p', properties: {}, children: [link('../reference/errors.html', 'Errors'), link('//x.example', 'x')] },
    ]);
    const p = tree.children?.[0];
    expect(p?.children?.[0]).toEqual(link('../reference/errors.html', 'Errors'));
    expect(p?.children?.[1]?.tagName).toBe('span');
  });
});
```

- [ ] **Step 3: Chạy test để thấy thất bại**

Run: `npm test -w apps/docs`
Expected: FAIL vì không tìm thấy `../src/lib/llms`, `../scripts/lib/check` và `../src/lib/external-links`.

- [ ] **Step 4: Viết `llms.ts` và bộ kiểm link**

`apps/docs/src/lib/llms.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { parse } from 'yaml';

export interface DocPage {
  /** Path under src/content/docs without the extension, with forward slashes. */
  slug: string;
  title: string;
  description: string;
  group: string;
  groupIndex: number;
  order: number;
  body: string;
}

export const GROUPS = [
  { dir: 'users', label: 'Start here' },
  { dir: 'concepts', label: 'Concepts' },
  { dir: 'developers', label: 'Developers' },
  { dir: 'reference', label: 'Reference' },
] as const;

export const SITE = {
  title: 'Atropyle',
  summary:
    'Atropyle is a non-custodial inheritance and wallet-recovery vault on X Layer. Its rules run as a frozen TapeOut ' +
    'circuit that anyone can verify by checking every one of its 2^26 inputs. No tool of Atropyle ever holds your keys.',
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

interface Frontmatter {
  title?: unknown;
  description?: unknown;
  sidebar?: { order?: unknown };
}

export function parsePage(relPath: string, source: string): DocPage | null {
  const slug = relPath.split(sep).join('/').split('\\').join('/').replace(/\.mdx?$/, '');
  const groupIndex = GROUPS.findIndex((g) => slug.startsWith(`${g.dir}/`));
  if (groupIndex < 0) return null;
  const match = FRONTMATTER.exec(source);
  if (!match) throw new Error(`${relPath}: missing frontmatter`);
  const fm = (parse(match[1]) ?? {}) as Frontmatter;
  if (typeof fm.title !== 'string' || fm.title.trim() === '') throw new Error(`${relPath}: missing title`);
  return {
    slug,
    title: fm.title,
    description: typeof fm.description === 'string' ? fm.description : '',
    group: GROUPS[groupIndex].label,
    groupIndex,
    order: typeof fm.sidebar?.order === 'number' ? fm.sidebar.order : 100,
    body: source.slice(match[0].length).trim(),
  };
}

export function sortPages(pages: readonly DocPage[]): DocPage[] {
  return [...pages].sort((a, b) => a.groupIndex - b.groupIndex || a.order - b.order || a.slug.localeCompare(b.slug));
}

export function readPages(contentDir: string): DocPage[] {
  const pages: DocPage[] = [];
  for (const entry of readdirSync(contentDir, { recursive: true })) {
    const rel = String(entry);
    if (!/\.mdx?$/.test(rel)) continue;
    const page = parsePage(rel, readFileSync(join(contentDir, rel), 'utf8'));
    if (page) pages.push(page);
  }
  return sortPages(pages);
}

// llms.txt follows https://llmstxt.org: a title, a one-line summary, then sections of links.
// Links are relative to the file, so the same build works under /docs/ (DeWEB) and /atropyle/docs/ (Pages).
export function buildLlms(pages: readonly DocPage[]): { llms: string; full: string } {
  const sorted = sortPages(pages);
  const llms = [
    `# ${SITE.title}`,
    '',
    `> ${SITE.summary}`,
    '',
    'Links are relative to this file. [llms-full.txt](llms-full.txt) holds the full text of every page.',
    '',
  ];
  for (const group of GROUPS) {
    const inGroup = sorted.filter((p) => p.groupIndex === GROUPS.indexOf(group));
    if (inGroup.length === 0) continue;
    llms.push(`## ${group.label}`, '');
    for (const p of inGroup) llms.push(`- [${p.title}](${p.slug}.html)${p.description ? `: ${p.description}` : ''}`);
    llms.push('');
  }
  const full = [`# ${SITE.title} documentation, full text`, '', `> ${SITE.summary}`, ''];
  for (const p of sorted) full.push('---', '', `# ${p.title}`, '', `URL: ${p.slug}.html`, '', p.body, '');
  return { llms: `${llms.join('\n').trimEnd()}\n`, full: `${full.join('\n').trimEnd()}\n` };
}
```

`apps/docs/scripts/lib/check.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

export interface LinkIssue {
  file: string;
  ref: string;
  problem: string;
}

export interface CheckOptions {
  /** Deployment base, for example "/docs/" (DeWEB) or "/atropyle/docs/" (GitHub Pages). */
  base: string;
  /** Page path (relative to the build) → ids that must exist on it. */
  requiredAnchors?: Record<string, readonly string[]>;
  /** Files that must exist in the build. */
  requiredFiles?: readonly string[];
}

export type Target =
  | { kind: 'skip' }
  | { kind: 'web' }
  | { kind: 'file'; path: string; hash: string }
  | { kind: 'error'; problem: string };

const TAG = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
// The attributes the DeWEB gateway's purity scan reads (TapeKit purity.js, see Plan 4 decision 6).
const REF_ATTR = /\s(?:href|src|action|poster|data|formaction|background)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const SRCSET_ATTR = /\ssrcset\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const ID_ATTR = /\s(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const STYLE_ATTR = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const META_REFRESH = /<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url\s*=\s*([^"'>\s]+)/gi;
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s"']*))\s*\)/g;
const CSS_IMPORT = /@import\s+(?:"([^"]*)"|'([^']*)')/g;
// "External" exactly as the gateway defines it. Any such URL, even a plain link, costs the site its
// "100% on-chain" badge, so external URLs in the docs are written as code, never as links.
const EXTERNAL = /^(?:(?:https?|wss?|ftp):|\/\/)/i;
const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// Inline scripts and styles may contain "<a href=…>" inside strings; only their own tag is markup.
function stripInline(html: string): string {
  return html
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>')
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/gi, '$1</style>');
}

const decodeAttr = (value: string) => value.replace(/&amp;/g, '&').replace(/&#38;/g, '&').trim();

export function extractIds(html: string): Set<string> {
  const ids = new Set<string>();
  for (const tag of stripInline(html).matchAll(TAG)) {
    for (const attr of tag[2].matchAll(ID_ATTR)) ids.add(decodeAttr(attr[1] ?? attr[2] ?? ''));
  }
  return ids;
}

export function resolveRef(fromFile: string, value: string, base: string): Target {
  if (value === '') return { kind: 'error', problem: 'empty link' };
  if (EXTERNAL.test(value)) {
    return { kind: 'error', problem: 'points to another site, which DeWEB counts as an off-chain request; write the URL as code' };
  }
  if (OTHER_SCHEME.test(value)) return { kind: 'skip' }; // mailto:, data:, javascript: and similar
  const hashAt = value.indexOf('#');
  const hash = hashAt >= 0 ? value.slice(hashAt + 1) : '';
  const path = (hashAt >= 0 ? value.slice(0, hashAt) : value).split('?')[0];
  if (path === '') return { kind: 'file', path: fromFile, hash: decodeURIComponent(hash) };
  let rel: string;
  if (path.startsWith('/')) {
    if (!path.startsWith(base)) return { kind: 'error', problem: `absolute link outside the docs base ${base}` };
    rel = path.slice(base.length);
  } else {
    rel = posix.normalize(posix.join(posix.dirname(fromFile), path));
  }
  if (rel.startsWith('../')) {
    // The web app sits right above the docs on both hosts (DeWEB "/", Pages "/atropyle/").
    return rel === '../index.html' ? { kind: 'web' } : { kind: 'error', problem: 'relative link leaves the docs site' };
  }
  if (rel === '' || rel === '.' || rel.endsWith('/')) {
    return { kind: 'error', problem: 'links to a directory; DeWEB needs an explicit .html file' };
  }
  return { kind: 'file', path: decodeURIComponent(rel), hash: decodeURIComponent(hash) };
}

function listFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, prefix))) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(join(dir, rel)).isDirectory()) out.push(...listFiles(dir, rel));
    else out.push(rel);
  }
  return out.sort();
}

export function checkSite(dir: string, o: CheckOptions): LinkIssue[] {
  if (!o.base.startsWith('/') || !o.base.endsWith('/')) throw new Error(`base must start and end with "/": ${o.base}`);
  if (!existsSync(dir)) throw new Error(`build directory not found: ${dir}`);
  const files = listFiles(dir);
  const present = new Set(files);
  const idCache = new Map<string, Set<string>>();
  const idsOf = (rel: string) => {
    let ids = idCache.get(rel);
    if (!ids) {
      ids = extractIds(readFileSync(join(dir, rel), 'utf8'));
      idCache.set(rel, ids);
    }
    return ids;
  };
  const issues: LinkIssue[] = [];
  const check = (file: string, raw: string) => {
    const ref = decodeAttr(raw);
    const t = resolveRef(file, ref, o.base);
    if (t.kind === 'error') issues.push({ file, ref, problem: t.problem });
    if (t.kind !== 'file') return;
    if (!present.has(t.path)) issues.push({ file, ref, problem: `file not found: ${t.path}` });
    else if (t.hash && t.path.endsWith('.html') && !idsOf(t.path).has(t.hash)) {
      issues.push({ file, ref, problem: `anchor not found: #${t.hash} in ${t.path}` });
    }
  };
  const checkCss = (file: string, css: string) => {
    for (const m of css.matchAll(CSS_URL)) check(file, m[1] ?? m[2] ?? m[3] ?? '');
    for (const m of css.matchAll(CSS_IMPORT)) check(file, m[1] ?? m[2] ?? '');
  };

  for (const file of files) {
    if (file.endsWith('.html')) {
      const html = readFileSync(join(dir, file), 'utf8');
      const stripped = stripInline(html);
      for (const tag of stripped.matchAll(TAG)) {
        for (const attr of tag[2].matchAll(REF_ATTR)) check(file, attr[1] ?? attr[2] ?? '');
        for (const attr of tag[2].matchAll(SRCSET_ATTR)) {
          for (const candidate of (attr[1] ?? attr[2] ?? '').split(',')) {
            const url = candidate.trim().split(/\s+/)[0];
            if (url) check(file, url);
          }
        }
        for (const style of tag[2].matchAll(STYLE_ATTR)) checkCss(file, style[1] ?? style[2] ?? '');
      }
      for (const m of stripped.matchAll(META_REFRESH)) check(file, m[1]);
      for (const block of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) checkCss(file, block[1]);
    } else if (file.endsWith('.css')) {
      checkCss(file, readFileSync(join(dir, file), 'utf8'));
    }
  }

  for (const [page, ids] of Object.entries(o.requiredAnchors ?? {})) {
    if (!present.has(page)) {
      issues.push({ file: page, ref: page, problem: `required page is missing: ${page}` });
      continue;
    }
    for (const id of ids) {
      if (!idsOf(page).has(id)) issues.push({ file: page, ref: `#${id}`, problem: `required anchor #${id} is missing` });
    }
  }
  for (const f of o.requiredFiles ?? []) {
    if (!present.has(f)) issues.push({ file: f, ref: f, problem: `required file is missing: ${f}` });
  }
  return issues;
}
```

`apps/docs/scripts/check-links.ts`:

```ts
// npm run check:links -w apps/docs [-- <dir>]
// Checks a built docs site: internal links and anchors, no resources from other hosts, required anchors.
// The base comes from DOCS_BASE, exactly like astro.config.ts.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkSite } from './lib/check';

const root = join(import.meta.dirname, '..');
const dir = resolve(process.argv[2] ?? join(root, 'dist'));
const base = process.env.DOCS_BASE ?? '/docs/';
const anchorsFile = join(root, 'src', 'generated', 'required-anchors.json');
const requiredAnchors: Record<string, string[]> = existsSync(anchorsFile)
  ? JSON.parse(readFileSync(anchorsFile, 'utf8'))
  : {};

const issues = checkSite(dir, {
  base,
  requiredAnchors,
  requiredFiles: ['index.html', '404.html', 'llms.txt', 'llms-full.txt', 'pagefind/pagefind.js'],
});
for (const i of issues) console.error(`${i.file}: ${i.ref} -> ${i.problem}`);
if (issues.length > 0) {
  console.error(`${issues.length} problem(s) in ${dir} (base ${base})`);
  process.exit(1);
}
console.log(`links ok: ${dir} (base ${base})`);
```

`apps/docs/src/lib/external-links.ts`:

```ts
// Rehype plugin for every Markdown page, generated pages included. The DeWEB gateway counts any absolute
// URL to another site as an off-chain request, even a plain link, so such links become inline code: the
// reader still sees and can copy the URL. Markdown also autolinks bare URLs, which this catches too.

/** The few hast fields this plugin reads and writes. */
export interface HastNode {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: string;
}

const EXTERNAL = /^(?:(?:https?|wss?|ftp):|\/\/)/i;

const textOf = (n: HastNode): string => (n.type === 'text' ? (n.value ?? '') : (n.children ?? []).map(textOf).join(''));

const code = (url: string): HastNode => ({
  type: 'element',
  tagName: 'code',
  properties: {},
  children: [{ type: 'text', value: url }],
});

function rewrite(node: HastNode): HastNode {
  const href = node.properties?.href;
  if (node.type === 'element' && node.tagName === 'a' && typeof href === 'string' && EXTERNAL.test(href)) {
    const label = textOf(node).trim();
    if (label === '' || label === href) return code(href);
    return {
      type: 'element',
      tagName: 'span',
      properties: {},
      children: [{ type: 'text', value: `${label} (` }, code(href), { type: 'text', value: ')' }],
    };
  }
  if (node.children) node.children = node.children.map(rewrite);
  return node;
}

export function rehypeExternalLinksAsCode() {
  return (tree: HastNode): void => {
    if (tree.children) tree.children = tree.children.map(rewrite);
  };
}
```

- [ ] **Step 5: Chạy test để thấy qua**

Run: `npm test -w apps/docs`
Expected: PASS mọi test của `llms.test.ts`, `check-links.test.ts` và `external-links.test.ts`.

- [ ] **Step 6: Viết cấu hình Starlight, integration `llms.txt` và trang chủ tạm**

`apps/docs/astro.config.ts`:

```ts
import starlight from '@astrojs/starlight';
import { defineConfig, passthroughImageService } from 'astro/config';
import { llmsTxt } from './src/integrations/llms-txt';
import { rehypeExternalLinksAsCode } from './src/lib/external-links';
import { sidebar } from './src/sidebar';

// "/docs/" inside the DeWEB site, "/atropyle/docs/" on GitHub Pages (scripts/build-site.ts of Plan 4 sets it).
const base = process.env.DOCS_BASE ?? '/docs/';
if (!base.startsWith('/') || !base.endsWith('/')) throw new Error(`DOCS_BASE must start and end with "/": ${base}`);

export default defineConfig({
  base,
  // One real .html file per page: the DeWEB fallback only covers paths without an extension.
  build: { format: 'file' },
  // No raster images, so no native image toolchain.
  image: { service: passthroughImageService() },
  markdown: { rehypePlugins: [rehypeExternalLinksAsCode] },
  integrations: [
    // No `site`, `social` or `editLink`: each of them puts an absolute URL to another site into every page,
    // and the DeWEB gateway counts any such URL, even a plain link, as an off-chain request.
    starlight({
      title: 'Atropyle',
      description: 'Verifiable inheritance and wallet-recovery vaults on X Layer.',
      lastUpdated: false,
      credits: false,
      sidebar,
    }),
    llmsTxt(),
  ],
});
```

`apps/docs/src/integrations/llms-txt.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { buildLlms, readPages } from '../lib/llms';

// Writes llms.txt and llms-full.txt next to the built pages, with links relative to the docs root.
export function llmsTxt(): AstroIntegration {
  let contentDir = '';
  return {
    name: 'atropyle-llms-txt',
    hooks: {
      'astro:config:done': ({ config }) => {
        contentDir = fileURLToPath(new URL('src/content/docs/', config.root));
      },
      'astro:build:done': ({ dir, logger }) => {
        const { llms, full } = buildLlms(readPages(contentDir));
        writeFileSync(new URL('llms.txt', dir), llms);
        writeFileSync(new URL('llms-full.txt', dir), full);
        logger.info('wrote llms.txt and llms-full.txt');
      },
    },
  };
}
```

`apps/docs/src/content.config.ts`:

```ts
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { defineCollection } from 'astro:content';

export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
```

`apps/docs/src/sidebar.ts` (Task 3–6 thay toàn bộ file này):

```ts
// Sidebar groups. Each group is generated from one directory; pages set their position with `sidebar.order`.
export interface SidebarGroup {
  label: string;
  autogenerate: { directory: string };
}

export const sidebar: SidebarGroup[] = [];
```

`apps/docs/tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": { "types": ["node"] },
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

`apps/docs/public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#111827"/><path d="M9 24 16 7l7 17h-4.2L16 16.6 13.2 24z" fill="#f9fafb"/></svg>
```

`apps/docs/src/content/docs/index.md` (Task 6 viết lại đầy đủ):

```md
---
title: Atropyle documentation
description: Verifiable inheritance and wallet-recovery vaults on X Layer.
pagefind: false
---

Atropyle is a non-custodial inheritance and wallet-recovery vault on X Layer. Its rules run as a frozen TapeOut circuit that anyone can verify.

> **Beta, unaudited.** Start with a free Drill before you protect real assets.
```

Thêm vào cuối `.gitignore`:

```
apps/docs/.astro/
proof/
badge/
```

Thêm vào mảng `files.includes` của `biome.json` (giữ nguyên các mục đang có):

```json
"!**/.astro/**",
"!apps/docs/src/content/docs/reference/**",
"!apps/docs/public/schemas/**",
"!apps/docs/src/generated/**",
"!bench/**",
"!traction/**",
"!.changeset/**",
"!site-dist/**",
"!proof/**",
"!badge/**"
```

- [ ] **Step 7: Build ở cả hai base và kiểm link**

Run: `DOCS_BASE=/docs/ npm run build -w apps/docs && DOCS_BASE=/docs/ npm run check:links -w apps/docs`
Expected: build thoát 0, log có `wrote llms.txt and llms-full.txt`; dòng cuối `links ok: …apps/docs/dist (base /docs/)`. Có `apps/docs/dist/index.html`, `apps/docs/dist/404.html`, `apps/docs/dist/pagefind/pagefind.js`.

Run: `grep -o 'href="[^"]*"' apps/docs/dist/index.html | sort -u`
Expected: link nội bộ đều bắt đầu bằng `/docs/` và trang có đuôi `.html` (ví dụ `href="/docs/index.html"`); không có `href="/docs/"` trần.

Run: `DOCS_BASE=/atropyle/docs/ npm run build -w apps/docs && DOCS_BASE=/atropyle/docs/ npm run check:links -w apps/docs`
Expected: `links ok: …apps/docs/dist (base /atropyle/docs/)`.

Run: `npm run typecheck -w apps/docs && npx biome check --write apps/docs && npx biome ci .`
Expected: thoát 0.

Nếu `check:links` báo một link dạng thư mục do chính Starlight sinh (ví dụ tiêu đề site trỏ `<base>`), đó là lỗi thật trên DeWEB, vì gateway không thêm `.html`. Sửa bằng cách ghi đè đúng component đó qua tuỳ chọn `components` của Starlight (ví dụ `components: { SiteTitle: './src/components/SiteTitle.astro' }`, link tới `${import.meta.env.BASE_URL}index.html`). Nếu nó báo một URL ra site khác do Starlight sinh, tắt tuỳ chọn sinh ra URL đó. Không nới bộ kiểm trong cả hai trường hợp.

Run: `grep -lE '(href|src)="(https?:)?//' apps/docs/dist/*.html apps/docs/dist/**/*.html 2>/dev/null | wc -l`
Expected: `0`. Đây là phép kiểm thô, độc lập với bộ kiểm, cho đúng luật của gateway.

- [ ] **Step 8: Commit**

```bash
git add apps/docs/package.json apps/docs/astro.config.ts apps/docs/tsconfig.json apps/docs/vitest.config.ts apps/docs/src/content.config.ts apps/docs/src/sidebar.ts apps/docs/src/integrations/llms-txt.ts apps/docs/src/lib/llms.ts apps/docs/src/lib/external-links.ts apps/docs/scripts/check-links.ts apps/docs/scripts/lib/check.ts apps/docs/public/favicon.svg apps/docs/src/content/docs/index.md apps/docs/test/llms.test.ts apps/docs/test/check-links.test.ts apps/docs/test/external-links.test.ts .gitignore biome.json package-lock.json
git commit -m "feat(docs): Starlight skeleton with file-format pages, llms.txt and a built-site link checker" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: `docs:gen`: trang Errors, CLI, SDK, JSON Schema và anchor bắt buộc

**Files:**
- Create: `scripts/docs-gen.ts`, `scripts/docs-gen/files.ts`, `scripts/docs-gen/errors.ts`, `scripts/docs-gen/cli.ts`, `scripts/docs-gen/sdk.ts`
- Generated (bằng lệnh, commit): `apps/docs/src/content/docs/reference/{sdk,sdk-core,sdk-plan,sdk-handoff,sdk-verify,cli,errors}.md`, `apps/docs/public/schemas/*.json`, `apps/docs/src/generated/required-anchors.json`
- Modify: `package.json` (gốc: script `docs:gen`, devDependencies), `package-lock.json`, `apps/docs/src/sidebar.ts`
- Test: `scripts/test/docs-gen.test.ts`

**Interfaces:**
- Consumes:
  - Plan 2: `ERROR_CODES`, `ERROR_INFO`, `TRANSPORT_ERROR_CODES`, `decodeRevertData` (`packages/sdk/src/errors.ts`); `vaultAbi`, `factoryAbi`, `revertAbi`, `ozErc20ErrorsAbi` (`packages/sdk/src/abi/index.ts`); `errorDocsUrl` (`packages/sdk/src/links.ts`); bốn entry `packages/sdk/src/{index,plan/index,handoff/index,verify/index}.ts`; `packages/sdk/tsconfig.json`.
  - Plan 3: `packages/cli/test/snapshots/help/<command>.txt` (lệnh con nối bằng `-`, gốc là `atropyle.txt`), `packages/cli/schemas/<command>.json`.
  - Task 2: `SidebarGroup`; bộ kiểm link đọc `apps/docs/src/generated/required-anchors.json`.
- Produces:
  - `scripts/docs-gen/files.ts`:
    - `REFERENCE_DIR = 'apps/docs/src/content/docs/reference'`, `SCHEMAS_DIR = 'apps/docs/public/schemas'`, `GENERATED_DIR = 'apps/docs/src/generated'`, `REQUIRED_ANCHORS_FILE`, `MANAGED_DIRS`
    - `interface DocsPart { files: Map<string, string>; anchors: Record<string, string[]> }`. Khoá của `files` là đường dẫn từ gốc repo; khoá của `anchors` là đường dẫn trang đã build (`reference/errors.html`).
    - `interface PageInput { title: string; description: string; order: number; body: string }`, `renderPage(p: PageInput): string`
    - `normalizeText(s: string): string`, `slugOf(text: string): string`, `escapeMd(text: string, cell?: boolean): string`
    - `mergeParts(parts: readonly DocsPart[]): Map<string, string>` (thêm file `required-anchors.json`)
    - `syncFiles(root: string, files: Map<string, string>, managedDirs: readonly string[], check: boolean): { changed: string[]; stale: string[] }`
  - `scripts/docs-gen/errors.ts`: `interface ContractError { contract: string; name: string; signature: string; code: string | null }`, `collectContractErrors(): ContractError[]`, `HTTP_API_CODES: ReadonlySet<string>`, `renderErrorsPage(input: ErrorsInput): string`, `errorsPart(): DocsPart`.
  - `scripts/docs-gen/cli.ts`: `CLI_ORDER`, `stripAnsi(s: string): string`, `commandTitle(name: string): string`, `cliPart(root: string): DocsPart`.
  - `scripts/docs-gen/sdk.ts`: `SDK_ENTRIES`, `runTypedoc(root: string, entry: string): Promise<string>`, `postProcessTypedoc(md: string): string`, `sdkPart(root: string): Promise<DocsPart>`.
  - `npm run docs:gen` ghi file; `npm run docs:gen -- --check` không ghi gì, thoát 1 khi bản commit lệch code. Task 15 thêm `contractsPart` vào `scripts/docs-gen.ts`.
  - Anchor ổn định: `reference/errors.html#<code viết thường>`, `reference/cli.html#atropyle-<lệnh>` (ví dụ `#atropyle-plan-init`), `reference/cli.html#exit-codes`.

- [ ] **Step 1: Cài TypeDoc và thêm script**

Run: `npm install -D -E typedoc@0.28.20 typedoc-plugin-markdown@4.14.1`
Expected: thoát 0; `package.json` gốc có hai gói trong `devDependencies`, phiên bản chính xác.

Thêm vào `scripts` của `package.json` gốc:

```json
"docs:gen": "tsx scripts/docs-gen.ts"
```

- [ ] **Step 2: Viết test thất bại**

`scripts/test/docs-gen.test.ts`:

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../packages/sdk/src/errors';
import { errorDocsUrl } from '../../packages/sdk/src/links';
import { cliPart, commandTitle, stripAnsi } from '../docs-gen/cli';
import { collectContractErrors, errorsPart, HTTP_API_CODES } from '../docs-gen/errors';
import { escapeMd, mergeParts, REQUIRED_ANCHORS_FILE, renderPage, slugOf, syncFiles } from '../docs-gen/files';
import { postProcessTypedoc } from '../docs-gen/sdk';

const ESC = String.fromCharCode(27);

describe('syncFiles', () => {
  it('writes new files, ignores line endings and removes stale generated files', () => {
    const root = mkdtempSync(join(tmpdir(), 'atropyle-gen-'));
    mkdirSync(join(root, 'gen', 'sub'), { recursive: true });
    writeFileSync(join(root, 'gen', 'same.md'), 'same\r\n');
    writeFileSync(join(root, 'gen', 'sub', 'old.md'), 'old\n');
    const files = new Map([
      ['gen/same.md', 'same\n'],
      ['gen/new.md', 'new\n'],
    ]);
    expect(syncFiles(root, files, ['gen'], true)).toEqual({ changed: ['gen/new.md'], stale: ['gen/sub/old.md'] });
    expect(existsSync(join(root, 'gen', 'new.md'))).toBe(false);
    expect(syncFiles(root, files, ['gen'], false)).toEqual({ changed: ['gen/new.md'], stale: ['gen/sub/old.md'] });
    expect(readFileSync(join(root, 'gen', 'new.md'), 'utf8')).toBe('new\n');
    expect(existsSync(join(root, 'gen', 'sub', 'old.md'))).toBe(false);
    expect(syncFiles(root, files, ['gen'], true)).toEqual({ changed: [], stale: [] });
  });

  it('refuses to write outside the generated directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'atropyle-gen-'));
    expect(() => syncFiles(root, new Map([['src/x.md', 'x\n']]), ['gen'], true)).toThrow('outside the generated directories');
  });
});

describe('page helpers', () => {
  it('renders frontmatter with JSON-quoted strings and a generated notice', () => {
    expect(renderPage({ title: 'Errors: "all"', description: 'Codes.', order: 8, body: 'Body.' })).toBe(
      '---\ntitle: "Errors: \\"all\\""\ndescription: "Codes."\nsidebar:\n  order: 8\n---\n\n' +
        '<!-- Generated by `npm run docs:gen`. Do not edit by hand. -->\n\nBody.\n',
    );
  });

  it('slugs headings like github-slugger', () => {
    expect(slugOf('NOT_OWNER')).toBe('not_owner');
    expect(slugOf('atropyle plan init')).toBe('atropyle-plan-init');
    expect(slugOf('Exit codes')).toBe('exit-codes');
  });

  it('escapes HTML outside code spans, and pipes in table cells', () => {
    expect(escapeMd('Use `status <vault>` or <b>')).toBe('Use `status <vault>` or &lt;b&gt;');
    expect(escapeMd('a | b `c | d`', true)).toBe('a \\| b `c \\| d`');
  });

  it('merges parts and writes the required anchors', () => {
    const files = mergeParts([
      { files: new Map([['a.md', 'x\r\n']]), anchors: { 'b.html': ['1'] } },
      { files: new Map(), anchors: { 'a.html': ['2'], 'b.html': ['3'] } },
    ]);
    expect(files.get('a.md')).toBe('x\n');
    expect(files.get(REQUIRED_ANCHORS_FILE)).toBe(`${JSON.stringify({ 'a.html': ['2'], 'b.html': ['1', '3'] }, null, 2)}\n`);
    expect(() =>
      mergeParts([
        { files: new Map([['a.md', '1']]), anchors: {} },
        { files: new Map([['a.md', '2']]), anchors: {} },
      ]),
    ).toThrow('two generators');
  });
});

describe('errors page', () => {
  const part = errorsPart();
  const md = part.files.get('apps/docs/src/content/docs/reference/errors.md') ?? '';
  const headings = [...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]);

  it('every ERROR_CODES entry gets an anchor', () => {
    expect(headings.filter((h) => /^[A-Z][A-Z0-9_]*$/.test(h))).toEqual(ERROR_CODES);
    for (const code of ERROR_CODES) {
      expect(errorDocsUrl(code).endsWith(`#${slugOf(code)}`)).toBe(true);
      expect(md).toContain(`[\`${code}\`](#${slugOf(code)})`);
    }
    expect(part.anchors['reference/errors.html']).toEqual(ERROR_CODES.map((c) => c.toLowerCase()));
    expect(new Set(headings.map(slugOf)).size).toBe(headings.length);
  });

  it('maps every Atropyle contract error to its code', () => {
    const byName = new Map(collectContractErrors().map((e) => [e.name, e]));
    expect(byName.get('NotOwner')).toMatchObject({ contract: 'AtropyleVault', code: 'NOT_OWNER', signature: 'NotOwner()' });
    expect(byName.get('UnsupportedFeeToken')).toMatchObject({ contract: 'AtropyleFactory', code: 'UNSUPPORTED_FEE_TOKEN' });
    expect(byName.get('BadPolicyOutput')?.signature).toBe('BadPolicyOutput(uint8)');
    expect(byName.get('ERC20InsufficientAllowance')?.code).toBe('FEE_TRANSFER_FAILED');
    for (const name of [
      'NotOwner', 'NotGuardian', 'AlreadyReleased', 'DrillExpired', 'InvalidHeirs', 'InvalidGuardians', 'InvalidTiming',
      'InvalidAssets', 'InvalidTarget', 'RecoveryDisabled', 'BadPolicyOutput', 'Reentrancy', 'AlreadyInitialized',
      'UnsupportedFeeToken', 'NotVault',
    ]) {
      expect(byName.get(name)?.code, name).toMatch(/^[A-Z_]+$/);
    }
    expect(md).toContain('AtropyleVault: `NotOwner()`');
  });

  it('shows a JSON example with the real docs URL', () => {
    expect(md).toContain(`"docsUrl": "${errorDocsUrl(ERROR_CODES[0])}"`);
  });

  it('labels the five Worker API codes as HTTP API', () => {
    expect([...HTTP_API_CODES]).toEqual(['NOT_FOUND', 'RATE_LIMITED', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_READY']);
    const rows = md.split('\n');
    const kindOfRow = (code: string) => rows.find((r) => r.startsWith(`| [\`${code}\`](#${code.toLowerCase()}) |`))?.split(' | ').at(-1);
    for (const code of HTTP_API_CODES) {
      expect(ERROR_CODES, code).toContain(code);
      expect(kindOfRow(code), code).toBe('HTTP API |');
    }
    expect(kindOfRow('RPC_UNAVAILABLE')).toBe('Network |');
  });
});

describe('CLI page', () => {
  function fixture(withRoot = true): string {
    const root = mkdtempSync(join(tmpdir(), 'atropyle-cli-'));
    const help = join(root, 'packages', 'cli', 'test', 'snapshots', 'help');
    const schemas = join(root, 'packages', 'cli', 'schemas');
    mkdirSync(help, { recursive: true });
    mkdirSync(schemas, { recursive: true });
    if (withRoot) writeFileSync(join(help, 'atropyle.txt'), 'Usage: atropyle [options] [command]\n');
    writeFileSync(join(help, 'zeta.txt'), 'Usage: atropyle zeta\n');
    writeFileSync(join(help, 'plan-init.txt'), 'Usage: atropyle plan init [options]\n');
    writeFileSync(join(help, 'verify.txt'), `${ESC}[1mUsage:${ESC}[22m atropyle verify [options] [vault]\r\n`);
    writeFileSync(join(schemas, 'verify.json'), '{"$id":"x"}\r\n');
    return root;
  }

  it('orders commands, strips colors and links JSON schemas', () => {
    const part = cliPart(fixture());
    const md = part.files.get('apps/docs/src/content/docs/reference/cli.md') ?? '';
    expect([...md.matchAll(/^## `(.+)`$/gm)].map((m) => m[1])).toEqual([
      'atropyle',
      'atropyle verify',
      'atropyle plan init',
      'atropyle zeta',
    ]);
    expect(md).toContain('Usage: atropyle verify [options] [vault]');
    expect(md).not.toContain(ESC);
    expect(md).toContain('[`schemas/verify.json`](../schemas/verify.json)');
    expect(md).not.toContain('schemas/plan-init.json');
    expect(md).toMatch(/^## Exit codes$/m);
    expect(part.files.get('apps/docs/public/schemas/verify.json')).toBe('{"$id":"x"}\n');
    expect(part.anchors['reference/cli.html']).toEqual([
      'atropyle',
      'atropyle-verify',
      'atropyle-plan-init',
      'atropyle-zeta',
      'exit-codes',
    ]);
  });

  it('fails when the root help snapshot is missing', () => {
    expect(() => cliPart(fixture(false))).toThrow('atropyle.txt');
  });

  it('names commands and strips ANSI codes', () => {
    expect(commandTitle('atropyle')).toBe('atropyle');
    expect(commandTitle('plan-check')).toBe('atropyle plan check');
    expect(stripAnsi(`${ESC}[31mred${ESC}[0m`)).toBe('red');
  });
});

describe('postProcessTypedoc', () => {
  it('keeps every link on the same page', () => {
    expect(postProcessTypedoc('\nSee [x](index.md#createatropyle) and [top](index.md).\n')).toBe(
      'See [x](#createatropyle) and [top](#_top).',
    );
  });

  it('fails on a link to another Markdown file', () => {
    expect(() => postProcessTypedoc('[y](other.md#a)')).toThrow('another Markdown file');
  });
});
```

- [ ] **Step 3: Chạy test để thấy thất bại**

Run: `npm run test:scripts -- docs-gen`
Expected: FAIL vì không tìm thấy `../docs-gen/cli`, `../docs-gen/errors`, `../docs-gen/files`, `../docs-gen/sdk`.

- [ ] **Step 4: Viết bộ sinh**

`scripts/docs-gen/files.ts`:

```ts
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const REFERENCE_DIR = 'apps/docs/src/content/docs/reference';
export const SCHEMAS_DIR = 'apps/docs/public/schemas';
export const GENERATED_DIR = 'apps/docs/src/generated';
export const REQUIRED_ANCHORS_FILE = `${GENERATED_DIR}/required-anchors.json`;
export const MANAGED_DIRS: readonly string[] = [REFERENCE_DIR, SCHEMAS_DIR, GENERATED_DIR];

export interface DocsPart {
  /** Repository-relative path with forward slashes → file content. */
  files: Map<string, string>;
  /** Built page path relative to the docs root (for example "reference/errors.html") → ids that must exist. */
  anchors: Record<string, string[]>;
}

export interface PageInput {
  title: string;
  description: string;
  order: number;
  body: string;
}

export const normalizeText = (s: string): string => `${s.replace(/\r\n/g, '\n').trimEnd()}\n`;

export function renderPage(p: PageInput): string {
  return normalizeText(
    [
      '---',
      `title: ${JSON.stringify(p.title)}`,
      `description: ${JSON.stringify(p.description)}`,
      'sidebar:',
      `  order: ${p.order}`,
      '---',
      '',
      '<!-- Generated by `npm run docs:gen`. Do not edit by hand. -->',
      '',
      p.body,
    ].join('\n'),
  );
}

// Matches github-slugger (Astro's heading ids) for the ASCII headings this generator writes.
export function slugOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 _-]/g, '')
    .replace(/ /g, '-');
}

// Escapes HTML outside inline code spans; `cell` also escapes the table separator everywhere.
export function escapeMd(text: string, cell = false): string {
  return text
    .replace(/\s*\n\s*/g, ' ')
    .split(/(`[^`]*`)/)
    .map((part, i) => {
      const piped = cell ? part.replace(/\|/g, '\\|') : part;
      return i % 2 === 1 ? piped : piped.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    })
    .join('');
}

export function mergeParts(parts: readonly DocsPart[]): Map<string, string> {
  const files = new Map<string, string>();
  const anchors: Record<string, string[]> = {};
  for (const part of parts) {
    for (const [path, content] of part.files) {
      if (files.has(path)) throw new Error(`two generators write ${path}`);
      files.set(path, normalizeText(content));
    }
    for (const [page, ids] of Object.entries(part.anchors)) anchors[page] = [...(anchors[page] ?? []), ...ids];
  }
  const sorted = Object.fromEntries(Object.entries(anchors).sort(([a], [b]) => a.localeCompare(b)));
  files.set(REQUIRED_ANCHORS_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
  return files;
}

function listFiles(root: string, dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const name of readdirSync(abs)) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...listFiles(root, rel));
    else out.push(rel);
  }
  return out;
}

// Generated directories belong to this script: files it no longer produces are stale and get removed.
export function syncFiles(
  root: string,
  files: Map<string, string>,
  managedDirs: readonly string[],
  check: boolean,
): { changed: string[]; stale: string[] } {
  const changed: string[] = [];
  for (const [rel, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (!managedDirs.some((d) => rel.startsWith(`${d}/`))) throw new Error(`${rel} is outside the generated directories`);
    const abs = join(root, rel);
    const current = existsSync(abs) ? readFileSync(abs, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current === content.replace(/\r\n/g, '\n')) continue;
    changed.push(rel);
    if (!check) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    }
  }
  const stale = managedDirs
    .flatMap((d) => listFiles(root, d))
    .filter((rel) => !files.has(rel))
    .sort();
  if (!check) for (const rel of stale) rmSync(join(root, rel));
  return { changed, stale };
}
```

`scripts/docs-gen/errors.ts`:

```ts
import { type Abi, type AbiError, type AbiParameter, encodeErrorResult, type Hex, zeroAddress } from 'viem';
import { factoryAbi, ozErc20ErrorsAbi, revertAbi, vaultAbi } from '../../packages/sdk/src/abi/index';
import { decodeRevertData, ERROR_CODES, ERROR_INFO, TRANSPORT_ERROR_CODES } from '../../packages/sdk/src/errors';
import { errorDocsUrl } from '../../packages/sdk/src/links';
import { type DocsPart, escapeMd, REFERENCE_DIR, renderPage, slugOf } from './files';

export interface ContractError {
  /** "AtropyleVault", "AtropyleFactory", "Fee token (ERC-20)" or "Library". */
  contract: string;
  name: string;
  signature: string;
  /** SDK error code, or null when the SDK reports this revert as UNKNOWN. */
  code: string | null;
}

export type ErrorKind = 'contract' | 'network' | 'http' | 'sdk';

// Codes that the Worker API (Plan 5) returns in problem+json bodies. Plan 2 lists them just before UNKNOWN.
export const HTTP_API_CODES: ReadonlySet<string> = new Set(['NOT_FOUND', 'RATE_LIMITED', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_READY']);

export interface ErrorsInput {
  codes: readonly string[];
  info: Readonly<Record<string, { message: string; hint: string }>>;
  transport: ReadonlySet<string>;
  http: ReadonlySet<string>;
  contractErrors: readonly ContractError[];
  docsUrl(code: string): string;
}

const KIND_LABEL: Record<ErrorKind, string> = { contract: 'Contract revert', network: 'Network', http: 'HTTP API', sdk: 'SDK' };

const KIND_TEXT: Record<ErrorKind, string> = {
  contract:
    'Contract revert. The vault or the factory rejects this call. Atropyle tools simulate every transaction first, so you normally see this code before you sign anything.',
  network:
    'Network. The RPC layer failed, so the answer is unknown, not negative. Retry, or use another endpoint. The CLI exits with code 4.',
  http: 'HTTP API. The hosted Atropyle Worker (its `/v1` API, the Telegram bot or the web mirror) answered with this code in a problem+json body. Nothing changed on chain, and the same data can always be read directly from X Layer.',
  sdk: 'SDK. The SDK caught the problem before anything reached the chain.',
};

const errorsOf = (abi: Abi): AbiError[] => abi.filter((i): i is AbiError => i.type === 'error');

// Zero-valued arguments: enough to encode a revert and ask the SDK which code it maps to.
function zeroArg(p: AbiParameter): unknown {
  if (p.type.endsWith(']')) return [];
  if (p.type === 'tuple') return ('components' in p ? p.components : []).map(zeroArg);
  if (p.type === 'address') return zeroAddress;
  if (p.type === 'bool') return false;
  if (p.type === 'string') return '';
  if (p.type === 'bytes') return '0x';
  if (p.type.startsWith('bytes')) return `0x${'00'.repeat(Number(p.type.slice(5)))}`;
  return 0n;
}

export function collectContractErrors(): ContractError[] {
  const vault = new Set(errorsOf(vaultAbi).map((e) => e.name));
  const factory = new Set(errorsOf(factoryAbi).map((e) => e.name));
  const token = new Set(errorsOf(ozErc20ErrorsAbi).map((e) => e.name));
  const seen = new Set<string>();
  const out: ContractError[] = [];
  for (const e of errorsOf(revertAbi)) {
    const signature = `${e.name}(${e.inputs.map((i) => i.type).join(',')})`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    const data = encodeErrorResult({ abi: [e], errorName: e.name, args: e.inputs.map(zeroArg) } as unknown as Parameters<
      typeof encodeErrorResult
    >[0]) as Hex;
    const owners = [vault.has(e.name) ? 'AtropyleVault' : null, factory.has(e.name) ? 'AtropyleFactory' : null].filter(
      (x): x is string => x !== null,
    );
    const contract = owners.length > 0 ? owners.join(', ') : token.has(e.name) ? 'Fee token (ERC-20)' : 'Library';
    out.push({ contract, name: e.name, signature, code: decodeRevertData(data)?.code ?? null });
  }
  return out.sort((a, b) => a.contract.localeCompare(b.contract) || a.name.localeCompare(b.name));
}

function kindOf(code: string, input: ErrorsInput): ErrorKind {
  if (input.contractErrors.some((e) => e.code === code)) return 'contract';
  if (input.transport.has(code)) return 'network';
  return input.http.has(code) ? 'http' : 'sdk';
}

export function renderErrorsPage(input: ErrorsInput): string {
  const first = input.codes[0];
  const example = JSON.stringify(
    { code: first, message: input.info[first].message, hint: input.info[first].hint, docsUrl: input.docsUrl(first) },
    null,
    2,
  );
  const lines = [
    'Every Atropyle tool (SDK, CLI, MCP server, web app and Worker) reports a failure with one of the codes on this page. In JSON an error looks like this:',
    '',
    '```json',
    example,
    '```',
    '',
    '`docsUrl` always links to the matching section below. The CLI also maps errors to [exit codes](cli.html#exit-codes).',
    '',
    'The kind tells you where a failure came from. **Contract revert:** the vault or the factory rejected the call. **Network:** the RPC layer failed, so the answer is unknown. **HTTP API:** the hosted Worker refused or could not answer a request. **SDK:** the SDK caught the problem before anything reached the chain.',
    '',
    '| Code | Meaning | Kind |',
    '|---|---|---|',
    ...input.codes.map(
      (c) => `| [\`${c}\`](#${slugOf(c)}) | ${escapeMd(input.info[c].message, true)} | ${KIND_LABEL[kindOf(c, input)]} |`,
    ),
  ];
  for (const code of input.codes) {
    lines.push('', `## ${code}`, '', escapeMd(input.info[code].message), '', `**How to fix:** ${escapeMd(input.info[code].hint)}`);
    lines.push('', `**Kind:** ${KIND_TEXT[kindOf(code, input)]}`);
    const raised = input.contractErrors.filter((e) => e.code === code);
    if (raised.length > 0) lines.push('', `**Raised by:** ${raised.map((e) => `${e.contract}: \`${e.signature}\``).join(', ')}.`);
  }
  const unmapped = input.contractErrors.filter((e) => e.code === null);
  if (unmapped.length > 0) {
    lines.push(
      '',
      '## Other contract reverts',
      '',
      'These reverts have no dedicated code, and tools report them as [`UNKNOWN`](#unknown). They come from code paths a normal user does not reach, such as deploying the factory.',
      '',
      '| Error | Raised by |',
      '|---|---|',
      ...unmapped.map((e) => `| \`${e.signature}\` | ${e.contract} |`),
    );
  }
  return renderPage({
    title: 'Errors',
    description: 'Every error code of the Atropyle SDK, CLI and MCP server, with its cause and its fix.',
    order: 8,
    body: lines.join('\n'),
  });
}

export function errorsPart(): DocsPart {
  const input: ErrorsInput = {
    codes: ERROR_CODES,
    info: ERROR_INFO,
    transport: TRANSPORT_ERROR_CODES,
    http: HTTP_API_CODES,
    contractErrors: collectContractErrors(),
    docsUrl: errorDocsUrl,
  };
  return {
    files: new Map([[`${REFERENCE_DIR}/errors.md`, renderErrorsPage(input)]]),
    anchors: { 'reference/errors.html': ERROR_CODES.map(slugOf) },
  };
}
```

`scripts/docs-gen/cli.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type DocsPart, normalizeText, REFERENCE_DIR, renderPage, SCHEMAS_DIR, slugOf } from './files';

export const HELP_DIR = 'packages/cli/test/snapshots/help';
export const CLI_SCHEMAS_DIR = 'packages/cli/schemas';

// Reading order on the page; commands not listed here follow in alphabetical order.
export const CLI_ORDER: readonly string[] = [
  'atropyle', 'verify', 'status', 'vaults', 'simulate', 'plan', 'plan-init', 'plan-check', 'prepare', 'doctor', 'mcp',
];

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');

export const stripAnsi = (s: string): string => s.replace(ANSI, '');

/** Snapshot name → command line: "plan-init" → "atropyle plan init". */
export function commandTitle(name: string): string {
  return name === 'atropyle' ? 'atropyle' : `atropyle ${name.split('-').join(' ')}`;
}

const orderOf = (name: string): number => {
  const i = CLI_ORDER.indexOf(name);
  return i < 0 ? CLI_ORDER.length : i;
};

const INTRO = `The \`atropyle\` command line tool reads vaults, checks plans, prepares unsigned transactions and verifies the policy circuit. It never asks for a private key and never sends a transaction: every write ends as a signing link, a QR code or a \`cast\` command that you run with your own wallet.

\`\`\`bash
npx -y atropyle --help
\`\`\`

It needs Node.js 20 or later. Each section below is the exact \`--help\` output of one command, copied from the CLI test snapshots, so it cannot drift from the real tool.

Commands that print data accept \`--json\`. JSON output always has \`schemaVersion: 1\`, and each command links its JSON Schema. Errors use the codes listed on [Errors](errors.html).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. \`verify\` and \`plan check\` passed; \`prepare\` simulated every step without a failure. |
| 1 | Any other error, for example an invalid plan or a step that fails simulation. |
| 2 | Usage error: unknown option, missing argument or invalid address. |
| 3 | Verification failed: \`verify\` found a problem, or \`doctor\` found the integrity check failing. |
| 4 | Network or RPC failure: rate limit, no response, two RPC operators disagree, or the wrong chain. |

Exit code 3 means the check ran and failed. Exit code 4 means the check could not run, so scripts should retry instead of raising an alarm.`;

export function cliPart(root: string): DocsPart {
  const helpDir = join(root, HELP_DIR);
  const names = existsSync(helpDir)
    ? readdirSync(helpDir)
        .filter((f) => f.endsWith('.txt'))
        .map((f) => f.slice(0, -4))
    : [];
  if (!names.includes('atropyle')) throw new Error(`${HELP_DIR}/atropyle.txt is missing: run the CLI tests (Plan 3) first`);
  names.sort((a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b));

  const schemaDir = join(root, CLI_SCHEMAS_DIR);
  const schemas = existsSync(schemaDir) ? readdirSync(schemaDir).filter((f) => f.endsWith('.json')) : [];
  const files = new Map<string, string>();
  for (const s of schemas.sort()) files.set(`${SCHEMAS_DIR}/${s}`, normalizeText(readFileSync(join(schemaDir, s), 'utf8')));

  const sections = names.map((name) => {
    const help = normalizeText(stripAnsi(readFileSync(join(helpDir, `${name}.txt`), 'utf8'))).trimEnd();
    const schema = schemas.includes(`${name}.json`)
      ? `\n\nJSON output (\`--json\`) follows [\`schemas/${name}.json\`](../schemas/${name}.json).`
      : '';
    return `## \`${commandTitle(name)}\`\n\n\`\`\`text\n${help}\n\`\`\`${schema}`;
  });
  files.set(
    `${REFERENCE_DIR}/cli.md`,
    renderPage({
      title: 'CLI',
      description: 'Every command and option of the atropyle command line tool, with exit codes and JSON Schemas.',
      order: 6,
      body: [INTRO, ...sections].join('\n\n'),
    }),
  );
  return {
    files,
    anchors: { 'reference/cli.html': [...names.map((n) => slugOf(commandTitle(n))), 'exit-codes'] },
  };
}
```

`scripts/docs-gen/sdk.ts`:

```ts
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Application, TSConfigReader, type TypeDocOptions } from 'typedoc';
import { type DocsPart, REFERENCE_DIR, renderPage } from './files';

export interface SdkEntry {
  page: string;
  entry: string;
  importPath: string;
  example: string;
  title: string;
  order: number;
  summary: string;
}

export const SDK_ENTRIES: readonly SdkEntry[] = [
  {
    page: 'sdk-core',
    entry: 'packages/sdk/src/index.ts',
    importPath: '@atropyle/sdk',
    example: 'createAtropyle',
    title: 'SDK: @atropyle/sdk',
    order: 2,
    summary: 'The root entry: the client, reads, prepare, send, the keeper, errors and every shared type. It also re-exports the plan entry.',
  },
  {
    page: 'sdk-plan',
    entry: 'packages/sdk/src/plan/index.ts',
    importPath: '@atropyle/sdk/plan',
    example: 'validatePlan',
    title: 'SDK: @atropyle/sdk/plan',
    order: 3,
    summary: 'Pure plan validation, timing presets and templates. Nothing here touches the network.',
  },
  {
    page: 'sdk-handoff',
    entry: 'packages/sdk/src/handoff/index.ts',
    importPath: '@atropyle/sdk/handoff',
    example: 'signLink',
    title: 'SDK: @atropyle/sdk/handoff',
    order: 4,
    summary: 'Pure functions that turn a prepared plan into a signing link, a `cast` command, EIP-5792 calls or an OKX Agentic Wallet command.',
  },
  {
    page: 'sdk-verify',
    entry: 'packages/sdk/src/verify/index.ts',
    importPath: '@atropyle/sdk/verify',
    example: 'quorumTransport',
    title: 'SDK: @atropyle/sdk/verify',
    order: 5,
    summary: 'Quorum reads across independent RPC operators, the exhaustive policy check over all 2^26 inputs, integrity checks and vault verification.',
  },
];

// One TypeDoc run per entry, so each page documents exactly what that import path exports.
export async function runTypedoc(root: string, entry: string): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), 'atropyle-typedoc-'));
  try {
    const options = {
      entryPoints: [join(root, entry)],
      tsconfig: join(root, 'packages', 'sdk', 'tsconfig.json'),
      plugin: ['typedoc-plugin-markdown'],
      out,
      cleanOutputDir: true,
      readme: 'none',
      router: 'module',
      entryFileName: 'index',
      // No "Defined in" lines: they contain paths and commit hashes, which would break --check.
      disableSources: true,
      excludePrivate: true,
      excludeInternal: true,
      excludeExternals: true,
      skipErrorChecking: true,
      validation: { notExported: false },
      hidePageTitle: true,
      hideBreadcrumbs: true,
      hidePageHeader: true,
      useCodeBlocks: true,
      useHTMLAnchors: true,
      useHTMLEncodedBrackets: true,
      expandObjects: false,
      parametersFormat: 'table',
      interfacePropertiesFormat: 'table',
      logLevel: 'Warn',
    };
    const app = await Application.bootstrapWithPlugins(options as Partial<TypeDocOptions>, [new TSConfigReader()]);
    const project = await app.convert();
    if (!project || app.logger.hasErrors()) throw new Error(`TypeDoc could not convert ${entry}`);
    await app.generateOutputs(project);
    if (app.logger.hasErrors()) throw new Error(`TypeDoc could not render ${entry}`);
    const pages = readdirSync(out, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.md'));
    if (pages.length !== 1) throw new Error(`TypeDoc wrote ${pages.length} pages for ${entry}, expected 1: ${pages.join(', ')}`);
    return readFileSync(join(out, pages[0]), 'utf8');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

export function postProcessTypedoc(md: string): string {
  const out = md
    .replace(/\]\(index\.md#([^)]+)\)/g, '](#$1)')
    .replace(/\]\(index\.md\)/g, '](#_top)')
    .trim();
  if (/\]\([^)]*\.md(#[^)]*)?\)/.test(out)) throw new Error('TypeDoc output links to another Markdown file');
  return out;
}

const OVERVIEW = `\`@atropyle/sdk\` is the TypeScript SDK under every Atropyle tool: the web app, the CLI, the MCP server and the Worker. It reads vaults, prepares unsigned transactions, verifies the policy circuit and runs the keeper. It never asks for a private key. Every write comes back as a prepared transaction that your own wallet signs.

\`\`\`bash
npm install @atropyle/sdk viem
\`\`\`

It runs on Node.js 20 or later and in modern browsers. The package ships ESM and CommonJS builds with types.

| Import | Contents | Reference |
|---|---|---|
${SDK_ENTRIES.map((e) => `| \`${e.importPath}\` | ${e.summary.replace(/\|/g, '\\|')} | [${e.importPath}](${e.page}.html) |`).join('\n')}

The verification code (the circuit simulator) loads on demand. \`atro.verifyPolicy()\`, \`atro.integrity()\` and \`vault.verify()\` import \`@atropyle/sdk/verify\` dynamically, so the root entry stays small.

Every error is an \`AtropyleError\` with a \`code\`, a \`hint\` and a \`docsUrl\` that links to [Errors](errors.html).`;

export async function sdkPart(root: string): Promise<DocsPart> {
  const files = new Map<string, string>();
  files.set(
    `${REFERENCE_DIR}/sdk.md`,
    renderPage({
      title: 'SDK overview',
      description: 'What each entry of @atropyle/sdk contains and how to install it.',
      order: 1,
      body: OVERVIEW,
    }),
  );
  for (const e of SDK_ENTRIES) {
    const api = postProcessTypedoc(await runTypedoc(root, e.entry));
    files.set(
      `${REFERENCE_DIR}/${e.page}.md`,
      renderPage({
        title: e.title,
        description: `API reference for ${e.importPath}, generated from the TypeScript source.`,
        order: e.order,
        body: `${e.summary}\n\n\`\`\`ts\nimport { ${e.example} } from '${e.importPath}';\n\`\`\`\n\n${api}`,
      }),
    );
  }
  return { files, anchors: {} };
}
```

`scripts/docs-gen.ts`:

```ts
// npm run docs:gen [-- --check]
// Writes the generated reference pages, the CLI JSON Schemas and the list of anchors the link checker requires.
// --check writes nothing and exits 1 when the committed files differ from the code (CI runs it).
import { join } from 'node:path';
import { cliPart } from './docs-gen/cli';
import { errorsPart } from './docs-gen/errors';
import { MANAGED_DIRS, mergeParts, syncFiles } from './docs-gen/files';
import { sdkPart } from './docs-gen/sdk';

const root = join(import.meta.dirname, '..');
const check = process.argv.includes('--check');

const files = mergeParts([errorsPart(), cliPart(root), await sdkPart(root)]);
const { changed, stale } = syncFiles(root, files, MANAGED_DIRS, check);

if (check && changed.length + stale.length > 0) {
  for (const f of changed) console.error(`out of date: ${f}`);
  for (const f of stale) console.error(`no longer generated: ${f}`);
  console.error('Run `npm run docs:gen` and commit the result.');
  process.exit(1);
}
console.log(
  check
    ? `docs:gen --check: ${files.size} generated files are up to date`
    : `docs:gen: ${files.size} files, ${changed.length} written, ${stale.length} removed`,
);
```

- [ ] **Step 5: Chạy test để thấy qua, rồi typecheck**

Run: `npm run test:scripts -- docs-gen && npm run typecheck:scripts`
Expected: PASS 15 test; `tsc` thoát 0.

- [ ] **Step 6: Sinh trang thật và kiểm chế độ `--check`**

Run: `npm run build -w circuits && npm run docs:gen`
Expected: dòng cuối dạng `docs:gen: <N> files, <N> written, 0 removed`, với N = 7 trang + `required-anchors.json` + một file cho mỗi JSON Schema của Plan 3. TypeDoc có thể in cảnh báo; script chỉ dừng khi TypeDoc báo lỗi.

Nếu script dừng với `TypeDoc wrote N pages … expected 1`: plugin markdown đã tách trang. Đặt thêm `outputFileStrategy: 'modules'` cạnh `router: 'module'` trong `runTypedoc` rồi chạy lại; không ghép nhiều file lại bằng tay.

Run: `npm run docs:gen -- --check`
Expected: `docs:gen --check: <N> generated files are up to date` (cùng N), thoát 0.

Run: `grep -c '^## [A-Z]' apps/docs/src/content/docs/reference/errors.md && head -20 apps/docs/src/content/docs/reference/cli.md`
Expected: số đầu bằng `ERROR_CODES.length` của Plan 2 (37 ngày 18/11, gồm năm mã HTTP API của Worker); trang CLI bắt đầu bằng frontmatter `title: "CLI"` và comment "Generated by".

Sửa thử một ký tự trong `apps/docs/src/content/docs/reference/errors.md`, chạy `npm run docs:gen -- --check`.
Expected: thoát 1, in `out of date: apps/docs/src/content/docs/reference/errors.md`. Chạy `npm run docs:gen` để trả file về như cũ.

- [ ] **Step 7: Thêm nhóm Reference vào sidebar, build và kiểm anchor trên HTML thật**

`apps/docs/src/sidebar.ts`:

```ts
// Sidebar groups. Each group is generated from one directory; pages set their position with `sidebar.order`.
export interface SidebarGroup {
  label: string;
  autogenerate: { directory: string };
}

export const sidebar: SidebarGroup[] = [{ label: 'Reference', autogenerate: { directory: 'reference' } }];
```

Run: `DOCS_BASE=/docs/ npm run build -w apps/docs && DOCS_BASE=/docs/ npm run check:links -w apps/docs`
Expected: `links ok: …apps/docs/dist (base /docs/)`. Bộ kiểm đã đọc `required-anchors.json`, nên dòng này xác nhận mọi anchor mã lỗi (một anchor cho mỗi mục của `ERROR_CODES`) và anchor từng lệnh CLI có trong HTML do Starlight sinh.

Run: `grep -o 'id="not_owner"' apps/docs/dist/reference/errors.html | head -1 && grep -o 'id="atropyle-plan-init"' apps/docs/dist/reference/cli.html | head -1`
Expected: in `id="not_owner"` và `id="atropyle-plan-init"`.

Nếu `check:links` báo `required anchor #… is missing`: `slugOf` đã khác github-slugger ở một heading. Sửa tiêu đề trong bộ sinh cho khớp id thật trong HTML, rồi thêm ca đó vào test `slugs headings like github-slugger`. Không xoá anchor khỏi danh sách bắt buộc.

Run: `DOCS_BASE=/atropyle/docs/ npm run build -w apps/docs && DOCS_BASE=/atropyle/docs/ npm run check:links -w apps/docs && npx biome check --write scripts/docs-gen.ts scripts/docs-gen scripts/test/docs-gen.test.ts apps/docs/src/sidebar.ts && npx biome ci .`
Expected: `links ok: …(base /atropyle/docs/)`; biome thoát 0.

- [ ] **Step 8: Commit**

```bash
git add scripts/docs-gen.ts scripts/docs-gen/files.ts scripts/docs-gen/errors.ts scripts/docs-gen/cli.ts scripts/docs-gen/sdk.ts scripts/test/docs-gen.test.ts apps/docs/src/sidebar.ts apps/docs/src/content/docs/reference apps/docs/public/schemas apps/docs/src/generated/required-anchors.json package.json package-lock.json
git commit -m "feat(docs): generate the Errors, CLI and SDK reference pages with a --check mode" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 4: Bốn trang khái niệm

**Files:**
- Create: `apps/docs/src/content/docs/concepts/how-it-works.md`, `apps/docs/src/content/docs/concepts/policy-circuit.md`, `apps/docs/src/content/docs/concepts/security.md`, `apps/docs/src/content/docs/concepts/verification.md`
- Modify: `apps/docs/src/sidebar.ts`
- Test: `apps/docs/test/pages.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `parsePage` (`apps/docs/src/lib/llms.ts`), bộ kiểm link.
  - Task 3: anchor `reference/errors.html#<code>`, `reference/cli.html#exit-codes`.
- Produces:
  - Bốn trang `concepts/*.html`. Task 5 và 6 link tới chúng.
  - Anchor ổn định: `concepts/security.html#what-atropyle-cannot-protect`, `concepts/policy-circuit.html#use-kofn5-and-ge4-in-your-own-circuit`, `concepts/verification.html#check-one-vault`, `concepts/how-it-works.html#the-five-states`.
  - `apps/docs/test/pages.test.ts` với mảng `PAGES: ExpectedPage[]`, `interface ExpectedPage { path: string; title: string; order: number; mustInclude: string[] }`. Task 5 và 6 thêm dòng vào mảng này.

Nội dung lấy từ spec lõi §3, §4, §5, §13 và spec hệ sinh thái §5.4, §16. Trang khái niệm chỉ link tới nhau, tới `reference/` và tới web app, vì trang người dùng và developer chưa có (link tới trang chưa có làm bộ kiểm link báo lỗi).

- [ ] **Step 1: Viết test thất bại**

`apps/docs/test/pages.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePage } from '../src/lib/llms';

interface ExpectedPage {
  path: string;
  title: string;
  order: number;
  /** Phrases the spec requires on this page. */
  mustInclude: string[];
}

const CONTENT = join(import.meta.dirname, '..', 'src', 'content', 'docs');

const PAGES: ExpectedPage[] = [
  // Concepts (Task 4)
  {
    path: 'concepts/how-it-works.md',
    title: 'How it works',
    order: 1,
    mustInclude: ['## The five states', 'ReleasedInherit', 'ReleasedRecover', '## Drill vaults', 'proof of life'],
  },
  {
    path: 'concepts/policy-circuit.md',
    title: 'The policy circuit',
    order: 2,
    mustInclude: ['TapeOut', 'LATCH', 'NAND', 'REF', '67,108,864', '## Use KofN5 and Ge4 in your own circuit'],
  },
  {
    path: 'concepts/security.md',
    title: 'Security & managing risk',
    order: 3,
    mustInclude: ['Beta, unaudited', '## What Atropyle cannot protect', 'A stolen key', 'Guardians who conspire'],
  },
  {
    path: 'concepts/verification.md',
    title: 'Verification & trust assumptions',
    order: 4,
    mustInclude: ['npx -y atropyle verify', '## Check one vault', 'RPC_DISAGREEMENT', '## What you still trust'],
  },
];

describe.each(PAGES)('$path', (expected) => {
  const page = parsePage(expected.path, readFileSync(join(CONTENT, expected.path), 'utf8'));

  it('has its title, a description and its sidebar order', () => {
    expect(page?.title).toBe(expected.title);
    expect(page?.description.length).toBeGreaterThan(20);
    expect(page?.order).toBe(expected.order);
  });

  it('covers what the spec asks for', () => {
    for (const phrase of expected.mustInclude) expect(page?.body, phrase).toContain(phrase);
  });

  it('links inside the docs with relative .html paths only', () => {
    const targets = [...(page?.body ?? '').matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
    for (const t of targets) {
      if (/^(https?:|mailto:|#)/.test(t)) continue;
      expect(t, t).toMatch(/^(\.\.\/)*[\w./-]+\.(html|json|txt)(#[\w/?=.-]*)?$/);
    }
  });
});
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `npm test -w apps/docs -- pages`
Expected: FAIL với `ENOENT: no such file or directory` cho `concepts/how-it-works.md`.

- [ ] **Step 3: Viết bốn trang**

`apps/docs/src/content/docs/concepts/how-it-works.md`:

````md
---
title: How it works
description: The vault, the policy circuit and the five states, from the first check-in to the release of your assets.
sidebar:
  order: 1
---

Atropyle has three parts, and none of them holds your keys.

| Part | What it does | Who controls it |
|---|---|---|
| Your wallet | Keeps your assets. You approve your vault so that it can move them later. | You |
| Your vault | A small contract that the Atropyle factory creates for you. It stores your heirs, guardians, timing and asset list, and it moves assets only after a release. | Nobody. It has no admin, no pause and no upgrade. |
| The policy circuit | A frozen TapeOut circuit that decides every state change of every vault. | Nobody. It can never change. |

Your assets stay in your wallet until the vault is released. Until then you can use, sell or move them as usual, and the vault can only take what you still hold and still approve.

## The clock

Each vault has three timing settings:

- **Period:** how often you are expected to show a sign of life, for example every 30 days.
- **Threshold:** how many silent periods raise the alarm, from 1 to 15.
- **Window:** how long the alarm lasts before the vault may release, at least 3 days.

The vault counts whole silent periods since your last sign of life, up to 15. Any transaction you sign to your vault is a **proof of life**: a check-in, or a change to your heirs, guardians, timing or assets. A proof of life resets the count, cancels any alarm and clears every guardian vote.

The state of a vault only changes inside a transaction. When a change is due, anyone may call `poke` to record it. The Atropyle keeper does this for every vault within about a minute, and the Telegram bot then tells the people involved.

## The five states

```text
Active ─────────────────── owner silent for T periods ───────────────────▶ Grace
Active ─────────────────── k guardians vote for one new wallet ──────────▶ RecoveryPending
Grace ──────────────────── k guardians vote for one new wallet ──────────▶ RecoveryPending
Grace ──────────────────── window over, and k attest or 15 idle periods ─▶ ReleasedInherit (final)
RecoveryPending ────────── window over, and the k votes still stand ─────▶ ReleasedRecover (final)
RecoveryPending ────────── votes drop below k ───────────────────────────▶ Grace if late, else Active
Grace or RecoveryPending ─ owner proves life ────────────────────────────▶ Active
```

Here T is the threshold and k the guardian quorum you chose.

| State | Meaning | What can happen next |
|---|---|---|
| Active | The owner is around. | Grace when the owner has been silent for T periods. RecoveryPending when k guardians vote for the same new wallet. |
| Grace | The inheritance alarm is on. | Back to Active as soon as the owner proves life. ReleasedInherit when the window is over and k guardians attest that the owner died, or after 15 silent periods even if no guardian answers. With the Simple template (no guardian quorum) the window alone is enough. |
| RecoveryPending | The recovery alarm is on: k guardians chose a new wallet. | Back to Active when the owner proves life, which is the owner's veto. ReleasedRecover when the window is over and the k votes still stand. |
| ReleasedInherit | Final. The heirs receive the assets. | Anyone may call `distribute`, as often as needed. |
| ReleasedRecover | Final. The new wallet receives the assets. | Anyone may call `distribute`, as often as needed. |

A release can never be undone. After it, the vault configuration and state never change again, and owner and guardian actions fail with [`ALREADY_RELEASED`](../reference/errors.html#already_released). This is deliberate: a release that the owner could reverse would not protect heirs. The window exists so that an owner who is alive has days or weeks to cancel.

## Who can do what

| Who | Action | Effect |
|---|---|---|
| Owner | Check in | Proof of life. Cancels any alarm. |
| Owner | Change heirs, guardians, timing or assets | Also a proof of life. |
| Guardian | Attest death, or withdraw the attestation | Counts toward the inheritance quorum. |
| Guardian | Vote for a recovery wallet, or withdraw the vote | Counts toward the recovery quorum, only if the owner turned recovery on. |
| Anyone | Poke | Records a state change that is due. Changes nothing else. |
| Anyone | Distribute | After a release, moves assets to their recipients. Before a release, it only records due changes. |

Guardians cannot vote for the owner, the vault or another guardian as a recovery wallet ([`INVALID_TARGET`](../reference/errors.html#invalid_target)).

## How assets are distributed

- **After an inheritance release,** each ERC-20 token is split by the heirs' shares. The vault takes the smaller of your balance and your approval, gives each heir their share, and gives the rounding remainder to the last heir. Each ERC-721 or ERC-1155 item goes to the heir you assigned it to.
- **After a recovery release,** everything goes to the new wallet.
- The vault moves tokens straight from your wallet to the recipient with `transferFrom`. It never holds them.
- Each transfer is separate. If one fails, for example because a token blocks transfers, the vault records `TransferFailed` and continues with the others.
- `distribute` can run again later. It reads balances afresh each time, so tokens that arrive after the release are distributed too, as long as they are still approved.

## Drill vaults

A Drill is a practice vault. It is free, it uses the same circuit and the same contract code as a real vault, and it expires 7 days after creation. After that, every state change fails with [`DRILL_EXPIRED`](../reference/errors.html#drill_expired). The Drill preset uses a 60-second period, a threshold of 2 and a 120-second window, so a whole cycle, from silence to alarm to release, takes about four minutes. Approve only test amounts to a Drill.

## Timing presets

| Preset | Period | Threshold | Window | Alarm after | Release at the earliest |
|---|---|---|---|---|---|
| Drill | 60 seconds | 2 | 120 seconds | 2 minutes | 4 minutes |
| Six months | 30 days | 6 | 14 days | 180 days | 194 days |
| Twelve months | 30 days | 12 | 30 days | 360 days | 390 days |

Custom timing is allowed within the limits: a period of at least 1 day, a threshold from 1 to 15, and a window of at least 3 days (60 seconds for a Drill).

## Fees

| Vault | Fee |
|---|---|
| Drill | Free |
| Real vault | 1.99 for each of the first 100 paid vaults, then 9.9, paid once in USDT0, USDC or USDG |

The prices are fixed in the factory contract and cannot change. There is no subscription and no fee on your assets.

Next: [The policy circuit](policy-circuit.html), [Security & managing risk](security.html), [Verification & trust assumptions](verification.html).
````

`apps/docs/src/content/docs/concepts/policy-circuit.md`:

````md
---
title: The policy circuit
description: How a frozen TapeOut circuit of NAND and LATCH gates decides every vault state, and how anyone can reuse its parts.
sidebar:
  order: 2
---

Every vault asks the same circuit what to do next. The circuit is called `AtropylePolicy v1`, and it runs on TapeOut, the X Layer platform where circuits built from logic gates are stored on-chain and evaluated by a processor contract.

## TapeOut in short

- A **netlist** is a list of gates. TapeOut circuits use two kinds: **NAND**, from which any logic can be built, and **LATCH**, one bit of memory that keeps its value from one call to the next.
- A **REF** gate calls another circuit that is already on-chain, so circuits can be built from other circuits.
- A **processor** is a contract that stores netlists and evaluates them with `step(id, state, inputs)`. A circuit is **taped out** when its netlist is written to a processor. After that it can never change.

Atropyle created its own processor, `Atropyle` (symbol `ATRO`), and taped out three circuits on it:

| Circuit | Inputs | Outputs | What it computes |
|---|---|---|---|
| `KofN5` | 8: five votes and a 3-bit k | 1 | At least k of the five votes are set |
| `Ge4` | 8: two 4-bit numbers a and b | 1 | a ≥ b |
| `AtropylePolicy v1` | 23 | 3 | The vault state machine. It calls `KofN5` twice and `Ge4` once through REF gates |

The processor's code sits behind a beacon whose owner is the zero address, so nobody can upgrade it. The vault has no admin either. The rules that decide your vault today are the rules that will decide it in ten years.

## State, inputs and outputs

The circuit keeps the vault state in 3 LATCH bits and reads 23 input bits, which the vault computes in every transaction:

| Bits | Input | Meaning |
|---|---|---|
| 0–3 | `idle` | Whole periods since the owner's last proof of life, capped at 15 |
| 4–7 | `T` | The threshold, in periods (1–15) |
| 8–12 | `inhVotes` | One bit per guardian who attests that the owner died |
| 13–17 | `recVotes` | One bit per guardian who votes for the current recovery candidate |
| 18–20 | `k` | The guardian quorum. 0 means the Simple template |
| 21 | `alive` | The owner signed this transaction |
| 22 | `windowDone` | An alarm is on and its window is over |

It returns the next state and three flags, `alarm`, `cancel` and `release`. The vault turns them into the events `AlarmRaised`, `AlarmCancelled` and `Released`.

## Why the circuit can be checked completely

A circuit is a pure function with a fixed number of input bits. Three state bits and 23 input bits make 2^26 = 67,108,864 combinations, few enough for an ordinary computer to try every one of them in well under a minute. The Atropyle verifier does exactly that, and checks eight properties on every combination:

| # | Property |
|---|---|
| P1 | A released vault never changes and never raises a flag. |
| P2 | Whenever the owner proves life before a release, the vault returns to Active. |
| P3 | An inheritance release happens only from Grace, without the owner, after the window, without a recovery quorum, and with the guardian quorum or 15 silent periods. |
| P4 | A recovery release happens only from RecoveryPending, without the owner, after the window, with a recovery quorum, and only when k is at least 1. |
| P5 | From Active, the inheritance alarm needs the owner to be late and the recovery alarm needs a recovery quorum. Neither happens in a transaction the owner signs. |
| P6 | Before a release, the next state is always one of the five valid states. |
| P7 | The three flags mean exactly what the vault expects. |
| P8 | Every result matches an independent reference model written in TypeScript. |

This is a proof by exhaustion, not a test on samples. [Verification & trust assumptions](verification.html) shows how to run it yourself against the circuit on mainnet.

## Use KofN5 and Ge4 in your own circuit

`KofN5` and `Ge4` are public building blocks. Any circuit can call them with a REF gate that names the processor and the circuit ID. Their mainnet IDs are part of the deployment that `@atropyle/sdk` ships.

```bash
npm install @atropyle/circuits @atropyle/sdk viem
```

```ts
import { buildKofN5, compile, Netlist, stepBytes } from '@atropyle/circuits';
import { getDeployment } from '@atropyle/sdk';

const d = getDeployment('xlayer');
if (!d.circuits) throw new Error('No Atropyle circuits on this chain');
const kofn5 = { name: 'KofN5', cpu: d.cpu, id: d.circuits.kofn5, nIn: 8, nOut: 1 };

// A "3 of 5" approval circuit: five input bits, k fixed to 3 (little-endian bits 1, 1, 0).
// Signal 1 is the constant 1 and signal 0 the constant 0.
const net = new Netlist('Approve3of5', 5);
const [approved] = net.ref(kofn5, [...net.inputs(0, 5), 1, 1, 0]);
const circuit = net.finish([approved]);

// Check it locally before you tape it out: resolve the REF to KofN5 built from source.
const program = compile(circuit, () => buildKofN5());
const votes = new Uint8Array([0b00111]); // inputs 0, 1 and 2 are set
console.log(stepBytes(program, new Uint8Array(0), votes).out[0] & 1); // 1
console.log(`${circuit.nand} NAND gates in this layer, ${circuit.bytes.length} bytes`);
```

`circuit.bytes` is the netlist you tape out with TapeOut's own tools. `@atropyle/circuits` also contains the bitsliced simulator, the reference model and the property checker that Atropyle uses for its own proof, so you can prove properties of your circuit the same way.
````

`apps/docs/src/content/docs/concepts/security.md`:

````md
---
title: Security & managing risk
description: What Atropyle protects, what it cannot protect, and how to set up a vault so that the remaining risks stay small.
sidebar:
  order: 3
---

:::caution[Beta, unaudited]
The Atropyle contracts have not had an external audit. Start with a free Drill, and protect only what you could afford to lose while Atropyle is in beta.
:::

## What Atropyle protects

- **Your assets stay in your wallet.** The vault never holds tokens. It can only move what you still hold and still approve, and only after the policy circuit has released it.
- **Assets go only to the right people.** After an inheritance release they go to your heirs, in your shares. After a recovery release they go to the one wallet your guardians chose. Whoever calls the vault, it cannot send them anywhere else.
- **Nobody holds special keys.** The vault and the factory have no admin, no pause, no upgrade and no `selfdestruct`. The policy circuit is frozen. The Atropyle team cannot change your vault.
- **No Atropyle tool touches your keys.** The web app, the CLI, the MCP server and the skills only prepare transactions. Your own wallet signs them.
- **You can check all of this yourself.** See [Verification & trust assumptions](verification.html).

## What Atropyle cannot protect

Know these limits before you rely on a vault.

- **A stolen key.** Atropyle is not a security wallet. Anyone who has your seed phrase or private key can move your assets directly, long before any alarm. Recovery helps when you *lose* a key, not when someone else *has* it.
- **Guardians who conspire.** If k of your guardians agree, they can start a recovery to a wallet they control. You stop it by checking in before the window ends. If you can no longer check in, nobody can stop it. Choose guardians who would not act together against you, or leave recovery off.
- **Missing your own deadline.** If you stay silent for longer than the threshold plus the window, the vault releases to your heirs, and a release can never be undone. Choose a period you will not miss and keep your own reminder; do not rely only on the Telegram bot.
- **Assets you moved or stopped approving.** Heirs receive only what is still in your wallet and still approved for the vault when it distributes. If you revoke an approval or spend the tokens, they receive less. This is deliberate: you stay in control of your assets.
- **Assets the vault does not know.** Only the ERC-20, ERC-721 and ERC-1155 tokens in your asset list are covered, and only on X Layer. Native OKB is not covered; wrap it to WOKB first.
- **Legal matters.** A vault is not a will, and it does not settle any legal claim on your estate.
- **Bugs in the contracts.** The contracts cannot be upgraded. If a bug is found, a new factory would be deployed, and you would have to create a new vault and move your approvals yourself.
- **Heirs that cannot receive.** If an heir is a contract that rejects NFTs, that transfer fails and the rest of the distribution continues. `atropyle plan check` warns about heirs that are contracts.

## Threats Atropyle is designed for

| Threat | What stops it |
|---|---|
| A fake signing link asks you to approve a stranger | The signing page decodes every step itself and accepts only the factory, real Atropyle vaults, the fee approval to the factory, and approvals to your own vault. It simulates every step again before you sign. |
| A token name hides instructions for an AI agent | Token names and symbols are marked untrusted, cut to 64 characters, cleaned of control and invisible characters, and never copied into summaries. |
| Someone talks a guardian into voting for the wrong wallet | Every guardian action carries a warning to confirm the request in person or by phone. The web app asks the guardian to paste the address a second time. The Telegram bot tells the owner about every vote. |
| An RPC endpoint returns false data | Verification reads from two independent RPC operators at the same block and stops if they disagree. |
| A malicious npm package with a similar name | The official packages are `atropyle`, `@atropyle/sdk`, `@atropyle/mcp` and `@atropyle/circuits`, published with npm provenance from the public repository. |
| The Atropyle server is hacked | The server has no power over vaults. Its keeper wallet can only call `poke` and `distribute`, which cannot change who receives assets. The DeWEB version of the web app does not use the server at all. |

## Managing your risk

1. **Start with a Drill.** It is free, it finishes in a few minutes, and it shows you every step with nothing at stake.
2. **Approve exact amounts.** Prefer an exact allowance to an unlimited one, and check the coverage on your vault page.
3. **Choose timing you can keep.** A 30-day period with a threshold of 12 gives you about a year of silence before the alarm, and the window adds 30 more days.
4. **Choose guardians with care.** Pick people who would call you before they act. Two of three is a good default. Turn recovery off if you do not need it.
5. **Tell your heirs.** Send them a link to [Verification & trust assumptions](verification.html), so they know how to check the vault without trusting anyone.
6. **Check in when reminded,** and look at your vault whenever you change wallets or tokens.
7. **Revoke when you are done.** "Revoke all" on your vault page removes every approval in one go.

## Report a vulnerability

Please report security problems privately through [GitHub private vulnerability reporting](https://github.com/duongnq2798/atropyle/security/advisories/new), not in a public issue. The policy is in [SECURITY.md](https://github.com/duongnq2798/atropyle/blob/main/SECURITY.md).
````

`apps/docs/src/content/docs/concepts/verification.md`:

````md
---
title: Verification & trust assumptions
description: What atropyle verify proves, how to check a single vault, and what you still have to trust.
sidebar:
  order: 4
---

"Verify, don't trust" is the core of Atropyle. You do not have to believe this website, the team or any server. You can check the rules of every vault yourself, on your own computer, against the chain.

## Check the policy circuit

```bash
npx -y atropyle verify
```

The command needs Node.js 20 or later and nothing else. It:

1. reads the processor and the policy ID from the Atropyle factory, then downloads the netlists of `AtropylePolicy v1` and of the `KofN5` and `Ge4` circuits it calls;
2. checks their shape: 23 inputs, 3 outputs, 3 LATCH bits, and REF gates that point only at the expected processor and circuit IDs;
3. tries all 67,108,864 combinations of state and input, and checks the properties P1 to P8 described in [The policy circuit](policy-circuit.html);
4. compares the `keccak256` hash of each netlist with the netlist built from the source code in the repository, which proves that the chain runs exactly the published source;
5. checks that the processor still sits behind the frozen beacon, so nobody can change how circuits run.

The output lists each property, the gate count, each netlist hash with "matches source", the beacon, the two RPC operators and the block number. The command exits with code 0 when everything passes, 3 when a check fails, and 4 when it could not finish because of the network ([exit codes](../reference/cli.html#exit-codes)).

The same check runs in your browser on the [Proof page](../../index.html#/proof), and every day in the project's CI, which updates the "policy verified on mainnet" badge in the README.

## Check one vault

```bash
VAULT=0xYourVaultAddress
npx -y atropyle verify --vault "$VAULT"
```

On top of the policy check, this confirms that:

1. the Atropyle factory created this vault;
2. its code is the standard minimal proxy (EIP-1167) of the factory's vault implementation;
3. the vault points at the same factory, processor and policy as the factory;
4. the code hash of the implementation matches the one recorded for this deployment, which CI rebuilds from source;
5. the state, the deadlines and the timeline it prints were all read at the same block.

Heirs can run the same check without a terminal: open `#/v/<vault address>/verify` in the Atropyle web app.

## Two independent RPC operators

Every read during verification goes to two independent operators: OKX (`rpc.xlayer.tech`, with `xlayerrpc.okx.com` as fallback) and dRPC (`xlayer.drpc.org`). Atropyle takes the block number from the first, asks both for the same data at that block, and accepts an answer only when they agree.

- If they disagree, verification stops with [`RPC_DISAGREEMENT`](../reference/errors.html#rpc_disagreement).
- If one operator does not answer, it stops with [`QUORUM_UNAVAILABLE`](../reference/errors.html#quorum_unavailable). You can accept a single operator explicitly with `--single-rpc`, and the output then says so.
- You can use your own node with `--verify-rpc <url>`, once for each operator you want.

## What you still trust

Verification removes most of the trust, not all of it. You still rely on:

- **X Layer itself:** its validators and the blocks they finalize.
- **At least one honest RPC operator.** If both operators lie in the same way, they can fool the check. Your own node with `--verify-rpc` removes this.
- **Your computer and the npm package you run.** The packages are published with npm provenance from the public repository, and you can build the CLI from source instead.
- **The TapeOut processor's evaluation code.** Its source is verified on OKLink and sits behind the frozen beacon, and the Atropyle simulator follows the same rules. The Proof page also compares random on-chain `step` calls with the simulator.
- **The rules themselves.** P1 to P8 prove that the circuit does what the specification says. Whether those rules suit your family is your decision; [How it works](how-it-works.html) explains them in plain words.
- **The vault source and the Solidity compiler.** The vault code is public and verified on OKLink, and CI checks that the deployed implementation matches a build from source. It has not had an external audit yet; see [Security & managing risk](security.html).
````

- [ ] **Step 4: Chạy test để thấy qua**

Run: `npm test -w apps/docs -- pages`
Expected: PASS 12 test (4 trang × 3).

- [ ] **Step 5: Thêm nhóm Concepts vào sidebar, build và kiểm link ở cả hai base**

`apps/docs/src/sidebar.ts`:

```ts
// Sidebar groups. Each group is generated from one directory; pages set their position with `sidebar.order`.
export interface SidebarGroup {
  label: string;
  autogenerate: { directory: string };
}

export const sidebar: SidebarGroup[] = [
  { label: 'Concepts', autogenerate: { directory: 'concepts' } },
  { label: 'Reference', autogenerate: { directory: 'reference' } },
];
```

Run: `for b in /docs/ /atropyle/docs/; do DOCS_BASE=$b npm run build -w apps/docs && DOCS_BASE=$b npm run check:links -w apps/docs || break; done`
Expected: hai dòng `links ok`, một cho mỗi base.

Run: `grep -c '<h2 id="what-atropyle-cannot-protect"' apps/docs/dist/concepts/security.html && grep -o 'concepts/how-it-works.html' apps/docs/dist/llms.txt`
Expected: `1`, rồi `concepts/how-it-works.html`.

Nếu sơ đồ trạng thái bị xuống dòng trên màn hình hẹp: đó là hành vi đúng của khối `text` trong Starlight (cuộn ngang); không đổi sang ảnh.

- [ ] **Step 6: Commit**

```bash
git add apps/docs/src/content/docs/concepts/how-it-works.md apps/docs/src/content/docs/concepts/policy-circuit.md apps/docs/src/content/docs/concepts/security.md apps/docs/src/content/docs/concepts/verification.md apps/docs/src/sidebar.ts apps/docs/test/pages.test.ts
git commit -m "docs(docs): concept pages for the states, the policy circuit, security and verification" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: Sáu trang người dùng

**Files:**
- Create: `apps/docs/src/content/docs/users/what-is-atropyle.md`, `apps/docs/src/content/docs/users/owners.md`, `apps/docs/src/content/docs/users/heirs.md`, `apps/docs/src/content/docs/users/guardians.md`, `apps/docs/src/content/docs/users/recover-a-lost-wallet.md`, `apps/docs/src/content/docs/users/faq.md`
- Modify: `apps/docs/src/sidebar.ts`, `apps/docs/test/pages.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `parsePage`, bộ kiểm link, plugin `rehypeExternalLinksAsCode`.
  - Task 3: `reference/cli.html`, `reference/errors.html`.
  - Task 4: mảng `PAGES` trong `apps/docs/test/pages.test.ts`; anchor `concepts/how-it-works.html#the-five-states`, `concepts/policy-circuit.html#use-kofn5-and-ge4-in-your-own-circuit`, `concepts/security.html#report-a-vulnerability`, `concepts/verification.html`.
  - Plan 3 (snapshot `--help`): lệnh `verify --vault`, `status <vault> --as`, `plan init --template --preset`, `plan check <file> --as`, `simulate --plan <file> --as`, `prepare <action> <target> --as` với action `create-vault`, `check-in`, `poke`, `distribute`, `revoke-all`. Test drift ở Task 6 kiểm mọi lệnh này.
  - Plan 4: route `#/`, `#/create`, `#/v/<vault>`, `#/v/<vault>/verify`. Nhãn nút lấy từ spec lõi §6: "Try a 5-minute Drill", "Check in", "Revoke all", "Raise alarm" (`poke`), "Claim" (`distribute`).
- Produces:
  - Sáu trang `users/*.html`, nhóm sidebar "Start here".
  - Anchor ổn định cho Task 6 và Task 17: `users/owners.html#start-with-a-drill`, `users/heirs.html#check-the-vault-yourself`, `users/heirs.html#claim-manually`, `users/guardians.html#safety-checklist`, `users/recover-a-lost-wallet.html#if-someone-starts-a-recovery-you-did-not-ask-for`, `users/faq.html#which-parts-use-tapeout`.
  - Hai câu mà Task 6 sẽ thay bằng câu có link sang trang developer (chép đúng từng ký tự): trong `users/faq.md` câu `Anyone can run a keeper with the SDK.`; trong `users/guardians.md` câu `Install the skills with \`npx skills add duongnq2798/atropyle\`.`

Nội dung lấy từ spec lõi §4, §6, §7 và spec hệ sinh thái §8, §9.3–9.4, §10.1, §16.3. Mỗi trang người dùng mở đầu bằng khung `:::caution[Beta, unaudited]` (Quyết định 29). Trang người dùng chỉ link tới nhau, tới `concepts/`, `reference/` và web app; trang developer chưa có, nên Task 6 mới nối link sang đó.

Lệnh CLI trong trang chỉ dùng những cờ mà Plan 3 đã chốt (Quyết định 10 và 12 của Plan 3). Hành động có tham số riêng (`attest-death`, `vote-recovery`, `set-*`) được hướng dẫn qua web app, vì giám hộ cần màn dán địa chỉ hai lần.

- [ ] **Step 1: Thêm sáu trang vào test (thất bại)**

Trong `apps/docs/test/pages.test.ts`, chèn khối sau vào đầu mảng `PAGES`, ngay trước dòng `  // Concepts (Task 4)`:

```ts
  // Start here (Task 5)
  {
    path: 'users/what-is-atropyle.md',
    title: 'What is Atropyle',
    order: 1,
    mustInclude: ['Beta, unaudited', 'Your assets stay in your wallet', 'Drill', '## Three roles', '## Ways to use Atropyle'],
  },
  {
    path: 'users/owners.md',
    title: 'For owners: create your vault',
    order: 2,
    mustInclude: [
      'Beta, unaudited',
      '## Start with a Drill',
      '## Choose a template',
      'Guarded',
      '## Check in',
      'npx -y atropyle plan check',
      '## Common mistakes',
      'WOKB',
    ],
  },
  {
    path: 'users/heirs.md',
    title: 'For heirs: you were named an heir',
    order: 3,
    mustInclude: [
      'Beta, unaudited',
      '## Check the vault yourself',
      'npx -y atropyle verify --vault',
      '## Claim manually',
      'Raise alarm',
      '## Beware of scams',
    ],
  },
  {
    path: 'users/guardians.md',
    title: 'For guardians: your role and safety checklist',
    order: 4,
    mustInclude: [
      'Beta, unaudited',
      '## Safety checklist',
      'in person or by phone',
      'paste it twice',
      '## Vote for a recovery wallet',
      'atropyle-guardian',
    ],
  },
  {
    path: 'users/recover-a-lost-wallet.md',
    title: 'Recover a lost wallet',
    order: 5,
    mustInclude: [
      'Beta, unaudited',
      'RecoveryPending',
      'ReleasedRecover',
      '## If someone starts a recovery you did not ask for',
      '## If your key was stolen',
    ],
  },
  {
    path: 'users/faq.md',
    title: 'FAQ',
    order: 6,
    mustInclude: ['Beta, unaudited', '## Which parts use TapeOut?', 'AtropylePolicy v1', 'KofN5', 'DeWEB', '## Is my plan private?'],
  },
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `npm test -w apps/docs -- pages`
Expected: FAIL với `ENOENT: no such file or directory` cho `users/what-is-atropyle.md`.

- [ ] **Step 3: Viết sáu trang**

`apps/docs/src/content/docs/users/what-is-atropyle.md`:

````md
---
title: What is Atropyle
description: An inheritance and recovery vault on X Layer. Your heirs receive your assets if you go silent, and your guardians can recover them if you lose your wallet.
sidebar:
  order: 1
---

:::caution[Beta, unaudited]
Atropyle has not had an external audit. Start with a free Drill, and protect only what you could afford to lose while Atropyle is in beta.
:::

Atropyle answers two questions that every crypto holder should ask:

- **What happens to my assets if I die?** If you stay silent for longer than you chose, your heirs receive your assets, in the shares you set.
- **What happens if I lose my wallet?** If you turned recovery on, your guardians can move your assets to a new wallet of yours.

Your assets stay in your wallet the whole time. You keep using them as usual. The vault can only move what you still hold and still approve, and only after its rules say so.

The rules live in a TapeOut circuit on X Layer that nobody can change, not even the Atropyle team. You can check them yourself with one command. The name comes from Atropos, the Fate who cuts the thread.

## Three roles

| Role | Who | What they do |
|---|---|---|
| Owner | You | Create the vault, choose heirs, guardians, timing and assets, and check in from time to time. |
| Heir | Up to 5 people you choose | Receive your assets after a release. Usually they do nothing at all. |
| Guardian | Up to 5 people you trust | Optional. Confirm that you died, and recover your assets to a new wallet if you lose yours. |

One person can be both an heir and a guardian. Read the page for your role: [For owners](owners.html), [For heirs](heirs.html), [For guardians](guardians.html).

## How it works in one minute

1. You create a vault and approve the assets it covers.
2. Every transaction you sign to your vault is a proof of life. A check-in takes one click.
3. If you stay silent for too long, the vault raises an alarm and gives you a window, days or weeks, to cancel.
4. If the window ends, the vault releases to your heirs, and a keeper sends each heir their share.

The details, including recovery, are in [How it works](../concepts/how-it-works.html).

## What it costs

A Drill, a practice vault that runs the whole cycle in about four minutes, is free. A real vault costs a one-time fee of 1.99 for each of the first 100 paid vaults, then 9.9, in USDT0, USDC or USDG. There is no subscription and no fee on your assets. You pay gas in OKB for your own transactions; heirs pay nothing.

## Ways to use Atropyle

- **The web app.** The [Atropyle app](../../index.html#/) is published on chain with DeWEB, and mirrored at `https://duongnq2798.github.io/atropyle/`.
- **The command line.** `npx -y atropyle` needs only Node.js 20. It prepares transactions and shows a signing link and a QR code for your wallet.
- **AI agents.** An MCP server and two Agent Skills let an assistant plan a vault with you or walk a guardian through the checklist.

None of them ever asks for your private key or seed phrase. Your own wallet signs every transaction.

Ready? [Start with a Drill](owners.html#start-with-a-drill).
````

`apps/docs/src/content/docs/users/owners.md`:

````md
---
title: "For owners: create your vault"
description: Try a free Drill first, then create a real vault with your heirs, guardians, timing and assets, and keep it alive with check-ins.
sidebar:
  order: 2
---

:::caution[Beta, unaudited]
Atropyle has not had an external audit. Start with a free Drill, and protect only what you could afford to lose while Atropyle is in beta.
:::

You need a wallet on X Layer, such as OKX Wallet or any browser wallet, and a little OKB for gas. A real vault also needs the fee in USDT0, USDC or USDG.

## Start with a Drill

A Drill is a free practice vault. It uses the same circuit and the same contract code as a real vault, with a 60-second period, so you see every step in about four minutes.

1. Open the [Atropyle app](../../index.html#/) and choose **Try a 5-minute Drill**.
2. Connect your wallet. The app offers to add X Layer or switch to it.
3. Add one heir. A second wallet of your own works best, because you can watch the assets arrive.
4. Pick a test token and approve a small amount.
5. Sign, then stop checking in. The alarm starts after two minutes, and the vault can release about two minutes later.
6. After the release, the keeper distributes within about a minute. You can also press **Claim** yourself.

A Drill expires 7 days after you create it. Never approve real savings to a Drill.

## Choose a template

| Template | What has to happen before your heirs receive anything | Good for |
|---|---|---|
| Simple | Time alone. The vault releases when the window ends without a check-in. | One or two heirs, and no guardians to coordinate. |
| Guarded | Time and people. After the window, the vault releases when k of your guardians attest that you died, or after 15 silent periods if they never answer. | Larger amounts, or when you want people to confirm before anything moves. Also needed for recovery. |

## Choose your heirs

- Name 1 to 5 heirs. Their shares must add up to 100%. You cannot name yourself.
- Each ERC-20 token is split by the shares. The last heir receives the rounding remainder.
- Each NFT goes to the one heir you pick for it.
- Use addresses that your heirs control and will keep. Avoid exchange deposit addresses.
- The app and `atropyle plan check` warn you when an heir is a contract. A contract that cannot receive NFTs makes those transfers fail.

## Choose your guardians

- Name 0 to 5 guardians, never yourself. A guardian may also be an heir.
- k is how many guardians must agree, from 1 to the number of guardians. Two of three is a good default.
- Recovery is off unless you turn it on, and it needs a k of at least 1. With recovery on, k guardians can move everything to a new wallet of yours, and you can cancel by checking in during the window. See [Recover a lost wallet](recover-a-lost-wallet.html).
- Ask each guardian before you add them, and send them [For guardians](guardians.html).

## Choose your timing

| Preset | Period | Threshold | Window | Alarm after | Release at the earliest |
|---|---|---|---|---|---|
| Six months | 30 days | 6 | 14 days | 180 days | 194 days |
| Twelve months | 30 days | 12 | 30 days | 360 days | 390 days |

With Twelve months, the alarm starts after 360 days without a proof of life, and you then have 30 more days to cancel. Custom timing is allowed: a period of at least 1 day, a threshold from 1 to 15, and a window of at least 3 days. [How it works](../concepts/how-it-works.html#the-clock) explains the clock.

## Choose your assets

- List up to 20 assets: ERC-20, ERC-721 or ERC-1155 tokens on X Layer.
- The app offers USDT0, USDC, USDG, WOKB and BEM. Add an NFT by its collection address and token ID. The **TapeOut circuit** shortcut fills in your circuit NFTs.
- Native OKB is not covered. Wrap it to WOKB first.
- After the vault is created, the app asks you to approve each asset, one by one, with a progress bar. An exact approval is the default; an unlimited one shows a warning.
- The vault page shows the **coverage** of each asset: the part your heirs would receive today, which is the smaller of your balance and your approval. Below 100% is a warning, for example after you buy more of a token.

## Pay the fee

| Vault | Fee |
|---|---|
| Drill | Free |
| Real vault | 1.99 for each of the first 100 paid vaults, then 9.9, once, in USDT0, USDC or USDG |

The app first asks you to approve exactly the fee to the Atropyle factory. The factory takes it when it creates your vault. The prices are fixed in the contract.

## Check in

- Any transaction you sign to your vault is a proof of life: a check-in, or any change to heirs, guardians, timing or assets.
- Press **Check in** on your vault page. It takes one signature.
- On the vault page, open the Telegram link to get reminders at 50%, 80% and 100% of your silence limit (threshold × period), and an urgent message if an alarm starts. Keep your own calendar reminder too; the bot is a convenience.
- If an alarm has started, a check-in before the window ends cancels it and clears every guardian vote.

## Use the command line

The CLI needs Node.js 20 or later. It never asks for your private key: it simulates every transaction, then prints a signing link and a QR code that you open with your wallet.

```bash
npx -y atropyle plan init --template guarded --preset twelveMonths
```

This writes `atropyle.plan.json`. Fill in your heirs, guardians and assets:

```json
{
  "version": 1,
  "heirs": [
    { "account": "0xFirstHeirAddress", "percent": 60 },
    { "account": "0xSecondHeirAddress", "percent": 40 }
  ],
  "guardians": ["0xGuardianOneAddress", "0xGuardianTwoAddress", "0xGuardianThreeAddress"],
  "k": 2,
  "recoveryEnabled": true,
  "timing": "twelveMonths",
  "assets": [
    { "kind": "erc20", "token": "0xTokenContractAddress" },
    { "kind": "erc721", "token": "0xCollectionAddress", "id": "42", "heir": 0 }
  ]
}
```

`timing` is `drill`, `sixMonths`, `twelveMonths`, or an object such as `{ "period": "30d", "threshold": 12, "window": "30d" }`. `heir` is the position of the heir in the list, starting at 0. Then check, preview and prepare:

```bash
ME=0xYourWalletAddress
npx -y atropyle plan check atropyle.plan.json --as "$ME"
npx -y atropyle simulate --plan atropyle.plan.json --as "$ME"
npx -y atropyle prepare create-vault atropyle.plan.json --as "$ME"
```

`plan check` lists every problem at once, checks each token on chain, warns about contract heirs and shows the current fee. `simulate` shows when the alarm and the release would happen. `prepare create-vault` prepares the fee approval, the vault and every asset approval.

Later, to see your vault and check in:

```bash
VAULT=0xYourVaultAddress
npx -y atropyle status "$VAULT" --as "$ME"
npx -y atropyle prepare check-in "$VAULT" --as "$ME"
```

Every command and option is in the [CLI reference](../reference/cli.html).

## Change or stop your vault

- Change heirs, guardians, timing or assets on your vault page at any time before a release. Each change is also a proof of life.
- A vault cannot be deleted. To stop it, press **Revoke all** (or run `npx -y atropyle prepare revoke-all "$VAULT" --as "$ME"`). It removes the vault's approvals, so the vault has nothing left to move.
- To replace a vault, revoke the old one first, then create the new one.

## Common mistakes

1. **Coverage below 100%.** You approved less than you hold, or you bought more later. Check the coverage after every change in your wallet.
2. **Moving your assets to another wallet.** A vault covers one wallet. Assets you move elsewhere are not covered.
3. **Timing you cannot keep.** Choose a period that fits long trips and hospital stays, not only your usual routine.
4. **Real assets in a Drill.** A Drill expires after 7 days and uses minutes, not months.
5. **Guardians who would act together.** k guardians can start a recovery. Choose people who would call you first, from different parts of your life.
6. **Heirs who do not know.** Tell them, and send them [For heirs](heirs.html).
7. **Native OKB.** It is not covered. Wrap it to WOKB.
8. **A contract heir that cannot receive NFTs.** Those transfers fail; the rest of the distribution continues.
````

`apps/docs/src/content/docs/users/heirs.md`:

````md
---
title: "For heirs: you were named an heir"
description: What happens when a vault releases to you, how to check the vault yourself, and how to claim by hand if you ever need to.
sidebar:
  order: 3
---

:::caution[Beta, unaudited]
Atropyle has not had an external audit. The checks on this page let you confirm what a vault does without trusting anyone.
:::

Someone added your wallet address as an heir in their Atropyle vault. You do not need to sign up, pay or install anything.

## What happens

1. While the owner checks in, nothing happens. Their assets stay in their wallet.
2. If the owner stays silent for longer than they chose, the vault raises an alarm, and the owner has a window of days or weeks to cancel it.
3. When the window ends (and, for a Guarded vault, enough guardians confirm), the vault releases to the heirs. A release is final.
4. The Atropyle keeper then calls `distribute`, usually within a minute. Your share arrives in your wallet. You pay nothing.

## What you receive

- Your share of each ERC-20 token in the vault, and any NFT the owner assigned to you.
- Only what is still in the owner's wallet and still approved for the vault. The vault page calls this **coverage**.
- Each transfer is separate. If one fails, the others still go through, and the vault page lists the result of each transfer.
- Tokens that reach the owner's wallet later are sent on the next `distribute`, as long as they are still approved.

## Check the vault yourself

You do not have to trust the owner's description, this website or the Atropyle team.

- **In a browser:** open `#/v/<vault address>/verify` in the Atropyle app. It runs the full check on your own computer.
- **In a terminal,** with Node.js 20 or later:

```bash
VAULT=0xTheVaultAddress
ME=0xYourWalletAddress
npx -y atropyle verify --vault "$VAULT"
npx -y atropyle status "$VAULT" --as "$ME"
```

`verify --vault` proves that the Atropyle factory created the vault and that it runs the published policy circuit. `status` shows the state, the deadlines and your role. [Verification & trust assumptions](../concepts/verification.html) explains each check, and [The five states](../concepts/how-it-works.html#the-five-states) explains what each state means.

## Get notified

On the vault page, open the Telegram link for heirs. The bot tells you when an alarm starts and when the vault releases. It only reads public data and has no power over the vault.

## Claim manually

The keeper is a convenience. If it ever stops, anyone can move the process forward, including you.

1. Open the vault page in the Atropyle app and connect your wallet.
2. If a state change is due, for example the window has ended, press **Raise alarm**. This calls `poke`, which only records a change that is already due.
3. After the release, press **Claim**. This calls `distribute`, which sends every heir their share, not only yours.
4. You pay a little OKB for gas. You can press **Claim** again later; it reads the balances afresh each time.

From a terminal:

```bash
npx -y atropyle prepare poke "$VAULT" --as "$ME"
npx -y atropyle prepare distribute "$VAULT" --as "$ME"
```

Each command simulates the transaction first, then prints a signing link and a QR code for your wallet. If the simulation fails, it gives the reason instead of a link; every reason is explained on the [Errors](../reference/errors.html) page.

## Beware of scams

- Atropyle never asks heirs for a fee, a "release payment" or a seed phrase. A claim costs only gas.
- Nobody can speed up a release for money. The rules are in a circuit that nobody can change.
- Before you believe any message about a vault, check it with `verify --vault`.
- The official packages are `atropyle`, `@atropyle/sdk`, `@atropyle/mcp` and `@atropyle/circuits`. Ignore look-alikes.
- If someone pressures you to act fast, stop, and check the vault yourself.
````

`apps/docs/src/content/docs/users/guardians.md`:

````md
---
title: "For guardians: your role and safety checklist"
description: What a guardian can do, the checklist to follow before every action, and how to attest, vote for a recovery wallet or withdraw.
sidebar:
  order: 4
---

:::caution[Beta, unaudited]
Atropyle has not had an external audit. As a guardian you never put your own assets at risk, but your vote can move the owner's assets, so follow the checklist below every time.
:::

Someone named your wallet as a guardian of their Atropyle vault. A guardian helps in two situations:

- confirming that the owner has died, so the heirs can inherit;
- if the owner turned recovery on, moving the owner's assets to a new wallet after the owner lost theirs.

Being a guardian gives you no share of the assets. You receive something only if the owner also named you as an heir.

## What a guardian can do

| Action | Effect |
|---|---|
| Attest death | Counts toward the inheritance quorum. When k guardians attest and the alarm window is over, the vault releases to the heirs. |
| Withdraw the attestation | Your attestation no longer counts. |
| Vote for a recovery wallet | Only if recovery is on. When k guardians vote for the same new wallet, a recovery alarm starts. After the window, everything goes to that wallet. |
| Withdraw the vote | If fewer than k votes remain, the recovery alarm stops. |

Any check-in or change by the owner clears every attestation and every vote. You cannot vote for the owner, the vault or any guardian, including yourself.

## Safety checklist

Follow it before every attestation and every vote. Scammers target guardians, because a guardian's vote can move money.

1. **Confirm in person or by phone.** Talk to the owner, or to family you know, on a number you already had. Never act on a message, an email or a social media post alone, even one from the owner's account.
2. **Never take a recovery address from a message.** Get the new address from the owner in person or on a call, read it back together, then paste it twice in the app.
3. **Check the vault first.** Open `#/v/<vault address>/verify` in the Atropyle app, or run the commands below.
4. **Look at the timeline.** It shows the state, the deadlines, and how long the owner still has to cancel.
5. **Check the other votes.** The vault page shows each guardian's vote. A vote for an address you do not recognise is a warning sign.
6. **Take your time.** A real emergency leaves days or weeks: the alarm window. Pressure to act within hours is a red flag.
7. **Never share your seed phrase,** and never sign anything other than a vault action you understand. Atropyle never asks for keys.
8. **If you acted by mistake, withdraw** right away.

```bash
VAULT=0xTheVaultAddress
ME=0xYourGuardianWallet
npx -y atropyle verify --vault "$VAULT"
npx -y atropyle status "$VAULT" --as "$ME"
```

## Attest a death

1. Follow the checklist.
2. Open the vault page in the Atropyle app and connect your guardian wallet.
3. Turn on the death attestation and sign. The page shows how many guardians have attested, out of k.
4. To withdraw, turn it off and sign again.

An attestation does nothing while the owner is active. It counts once the inheritance alarm is on.

## Vote for a recovery wallet

1. Follow the checklist. The owner must give you the new address in person or on a call.
2. Open the vault page, connect your guardian wallet, and choose the recovery vote.
3. Paste the new address into both fields. The app refuses the vote when the two do not match, and reminds you to confirm out of band.
4. Sign. When k guardians vote for the same address, a recovery alarm starts and the owner is notified. If the owner still has the old wallet, one check-in cancels it.
5. After the window, the vault releases everything to the new wallet. This is final.

To withdraw your vote, choose withdraw on the vault page and sign. The steps from the owner's side are in [Recover a lost wallet](recover-a-lost-wallet.html).

## Get notified

On the vault page, open the Telegram link for guardians. The bot tells you when an alarm starts and when the vault releases.

## Use an AI agent

The `atropyle-guardian` skill walks you through this checklist, checks the vault with `verify --vault` and prepares a signing link for your wallet. It never holds your keys. Install the skills with `npx skills add duongnq2798/atropyle`.
````

`apps/docs/src/content/docs/users/recover-a-lost-wallet.md`:

````md
---
title: Recover a lost wallet
description: How your guardians move your assets to a new wallet after you lose a key, what you must set up beforehand, and how to stop a recovery you did not ask for.
sidebar:
  order: 5
---

:::caution[Beta, unaudited]
Atropyle has not had an external audit. Practise recovery in a free Drill before you rely on it.
:::

Recovery helps when you lose access to your wallet, for example a lost phone without a seed phrase backup. Your guardians vote for a new wallet of yours, and after a waiting window the vault moves your covered assets there.

## What you need beforehand

Recovery works only if, before you lost the key:

- your vault uses the Guarded template, with a k of at least 1;
- you turned recovery on;
- your guardians know how to reach you, and you know how to reach them.

If recovery was off, nobody can move your assets to a new wallet: not your guardians, not the Atropyle team. Your heirs still inherit after your silence limit.

## Recover in six steps

1. **Create a new wallet** on a device you trust, and back up its seed phrase.
2. **Call each guardian, or meet them.** Give them the new address and read it back together. Do not send it only by message: your guardians are told to refuse that.
3. **Each guardian votes** for the new address on the vault page, pasting it twice.
4. **The recovery alarm starts** once k guardians vote for the same address. The vault is now `RecoveryPending`, and the window starts: 14 days with Six months timing, 30 days with Twelve months.
5. **After the window,** the vault releases to the new wallet (`ReleasedRecover`). The keeper distributes within about a minute; you can also press **Claim** from the new wallet.
6. **Protect the new wallet.** Create a new vault from it, with heirs and guardians.

The new wallet cannot be one of your guardians: the vault rejects that vote with [`INVALID_TARGET`](../reference/errors.html#invalid_target).

## What moves

- Everything in your asset list goes to the new wallet: 100% of each ERC-20 token and every NFT.
- Only what is still in the old wallet, and only up to the approvals you gave the vault. Assets that are not in the list stay in the old wallet.
- Native OKB is not covered.

## If someone starts a recovery you did not ask for

The vault page shows a recovery alarm, and the Telegram bot sends you an urgent message.

1. **Check in now** with your wallet. A check-in cancels the alarm and clears every guardian vote.
2. **Find out who voted.** The vault page shows each guardian's vote.
3. **Replace guardians you no longer trust,** or turn recovery off. Both are changes to your vault, and each also counts as a proof of life.

## If your key was stolen

Recovery does not help against theft. A thief who has your key can move your assets directly, long before any alarm, and can also check in to cancel a recovery. Move what is left to a new wallet right away, then create a new vault for it. [Security & managing risk](../concepts/security.html#what-atropyle-cannot-protect) lists the other limits.

## Practise first

Create a Drill with the Guarded template. Use two other wallets of your own as guardians, set k to 1, and turn recovery on. Vote from one guardian wallet for a fourth wallet, then watch the recovery release about two minutes later.
````

`apps/docs/src/content/docs/users/faq.md`:

````md
---
title: FAQ
description: Short answers about keys, costs, TapeOut, privacy, audits and what happens if the Atropyle team disappears.
sidebar:
  order: 6
---

:::caution[Beta, unaudited]
Atropyle has not had an external audit. Start with a free Drill, and protect only what you could afford to lose while Atropyle is in beta.
:::

## Does Atropyle hold my assets or my keys?

No. Your assets stay in your wallet until a release, and the vault never holds tokens: it moves them straight from your wallet to the recipient. No Atropyle tool asks for your private key or seed phrase; your own wallet signs every transaction.

## What does it cost?

A Drill is free. A real vault costs a one-time 1.99 for each of the first 100 paid vaults, then 9.9, in USDT0, USDC or USDG. You also pay gas in OKB for your own transactions. Heirs pay nothing, because the keeper pays the gas to distribute.

## Which parts use TapeOut?

- **The rules.** `AtropylePolicy v1` is a TapeOut circuit, made of NAND gates and three LATCH bits, on the Atropyle processor. Every state change of every vault is decided by a `step` call to that circuit. The vault contract only stores the state that the circuit returns.
- **Reuse.** The policy calls two small circuits through REF gates: `KofN5`, which counts k-of-n votes, and `Ge4`, which compares two 4-bit numbers. Anyone can use them in their own circuit; see [The policy circuit](../concepts/policy-circuit.html#use-kofn5-and-ge4-in-your-own-circuit).
- **Proof.** Because the circuit has only 26 bits of state and input, `npx -y atropyle verify` tries all 67,108,864 combinations against the netlist on chain.
- **The website.** The web app and these docs are published with DeWEB, TapeOut's on-chain web hosting, in a container on the Atropyle processor.
- **Your circuits.** TapeOut circuits are NFTs, so a vault can leave them to an heir. The asset step of the app has a shortcut for them.

## What happens if the Atropyle team disappears?

Your vault keeps working. The contracts have no owner and no off switch, and the rules live in a frozen circuit. The web app is stored on chain through DeWEB, and the CLI is on npm. The keeper is only a convenience: anyone can call `poke` and `distribute`. Anyone can run a keeper with the SDK.

## What if I miss a check-in?

One missed period does nothing. The alarm starts only after the number of silent periods you chose, for example 12 with Twelve months timing. Even then, a check-in before the window ends cancels the alarm.

## Can a release be undone?

No. A release is final, so that heirs can rely on it. The alarm window exists to give a living owner days or weeks to cancel first.

## Can I change my plan later?

Yes, at any time before a release: heirs, shares, guardians, k, recovery, timing and assets. Each change is also a proof of life.

## Which assets are covered?

ERC-20, ERC-721 and ERC-1155 tokens on X Layer, up to 20 entries per vault. Native OKB is not covered; wrap it to WOKB. Heirs receive only what is still in your wallet and still approved for the vault.

## Is my plan private?

No. Everything about a vault is public on X Layer: the owner, the heirs and their shares, the guardians, the timing, the asset list, and when you last checked in. Tell your heirs and guardians yourself rather than letting them find it on chain. If this matters to you, use heir addresses that are not tied to anyone's name.

## Can I have more than one vault?

Yes. Each vault is separate and needs its own approvals. Do not approve the same tokens to two vaults unless you mean to: both would try to distribute them.

## Do my heirs need to do anything?

Usually not. They need a wallet address that they control. After a release, the keeper sends their share. [For heirs](heirs.html) explains how they can check the vault and claim by hand.

## Has Atropyle been audited?

Not yet. Atropyle is in beta. The policy circuit is checked exhaustively by `atropyle verify`, and the contracts have tests and static analysis, but no external audit. Read [Security & managing risk](../concepts/security.html).

## Which networks does Atropyle support?

X Layer mainnet only (chain ID 196).

## How do I report a security problem?

Privately, as described in [Report a vulnerability](../concepts/security.html#report-a-vulnerability). Please do not open a public issue for a security problem.
````

- [ ] **Step 4: Chạy test để thấy qua**

Run: `npm test -w apps/docs -- pages`
Expected: PASS 30 test (10 trang × 3).

- [ ] **Step 5: Thêm nhóm "Start here" vào sidebar, build và kiểm link ở cả hai base**

`apps/docs/src/sidebar.ts`:

```ts
// Sidebar groups. Each group is generated from one directory; pages set their position with `sidebar.order`.
export interface SidebarGroup {
  label: string;
  autogenerate: { directory: string };
}

export const sidebar: SidebarGroup[] = [
  { label: 'Start here', autogenerate: { directory: 'users' } },
  { label: 'Concepts', autogenerate: { directory: 'concepts' } },
  { label: 'Reference', autogenerate: { directory: 'reference' } },
];
```

Run: `for b in /docs/ /atropyle/docs/; do DOCS_BASE=$b npm run build -w apps/docs && DOCS_BASE=$b npm run check:links -w apps/docs || break; done`
Expected: hai dòng `links ok`, một cho mỗi base.

Run: `grep -c 'id="which-parts-use-tapeout"' apps/docs/dist/users/faq.html && grep -c '\.\./\.\./index\.html#/' apps/docs/dist/users/owners.html && grep -c 'users/' apps/docs/dist/llms.txt`
Expected: `1`, rồi một số ≥ `1`, rồi `6`.

Nếu bộ kiểm báo `anchor not found` cho một link `#…` trong các trang này: so heading với slug của github-slugger (chữ thường, bỏ dấu câu, khoảng trắng thành `-`), rồi sửa link, không sửa heading đã liệt kê trong Interfaces.

- [ ] **Step 6: Commit**

```bash
git add apps/docs/src/content/docs/users/what-is-atropyle.md apps/docs/src/content/docs/users/owners.md apps/docs/src/content/docs/users/heirs.md apps/docs/src/content/docs/users/guardians.md apps/docs/src/content/docs/users/recover-a-lost-wallet.md apps/docs/src/content/docs/users/faq.md apps/docs/src/sidebar.ts apps/docs/test/pages.test.ts
git commit -m "docs(docs): user pages for owners, heirs, guardians, recovery and the FAQ" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 6: Ba trang developer, trang chủ docs và test lệnh CLI trong docs

**Files:**
- Create: `apps/docs/src/content/docs/developers/quickstart.md`, `apps/docs/src/content/docs/developers/ai-agents.md`, `apps/docs/src/content/docs/developers/keeper.md`
- Create: `scripts/ops/doc-commands.ts`
- Modify: `apps/docs/src/content/docs/index.md` (viết lại), `apps/docs/src/content/docs/users/faq.md`, `apps/docs/src/content/docs/users/guardians.md`, `apps/docs/src/sidebar.ts`, `apps/docs/test/pages.test.ts`
- Test: `scripts/test/docs-content.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `PUBLISH_PACKAGES` (`scripts/ops/packages.ts`), `npm run test:scripts`.
  - Task 3: `reference/sdk.html`, `reference/cli.html`, `reference/errors.html`.
  - Task 4–5: mảng `PAGES`; hai câu trong `users/faq.md` và `users/guardians.md` (Task 5, Interfaces).
  - Plan 2: `createAtropyle`, `formatDuration`, `AtropyleError`, `VaultHandle.status()`, `.timeline()`, `.config()`, `.prepare(action, { as })`, `AtropyleClient.handoff.link(plan)`, `AtropyleClient.chain`, `AtropyleClient.deployment.rpcUrls`, `AtropyleClient.scan({ resume, maxBlocks })` (`ScanResult.cursor`, `.truncated`), `keeperTick(atro, vaults, { wallet })` (`KeeperReport.outcomes`, `.stopped`, `.keeper`), `planKeeperActions(status, timeline, now)`, `stringify`, `VAULT_ACTIONS` (`packages/sdk/src/actions.ts`).
  - Plan 3: snapshot `packages/cli/test/snapshots/help/*.txt`; `claude mcp add atropyle -- npx -y @atropyle/mcp`; tên 7 tool, 2 resource, 2 prompt; plugin `atropyle@atropyle`; hai skill.
- Produces:
  - `scripts/ops/doc-commands.ts`:
    - `interface DocCommand { file: string; line: string; words: string[]; flags: string[] }`
    - `extractCommands(file: string, markdown: string): DocCommand[]`. Quét khối code `bash`/`sh`/`shell`/`console`/không tên và inline code.
    - `checkCommand(c: DocCommand, readHelp: (name: string) => string | null): string | null`. Trả lỗi dạng chữ, hoặc `null` khi hợp lệ.
    - `prepareActions(actions: readonly string[]): Set<string>`
  - Test `every atropyle command in the docs exists in the CLI snapshots` (Review Focus 3).
  - Trang chủ docs cuối cùng. Task 15 chèn một dòng ngay **trước** dòng bắt đầu bằng `- [Errors](reference/errors.html)` của `index.md`.
  - Ba trang `developers/*.html`, nhóm sidebar "Developers". Sidebar đủ bốn nhóm.

Lệnh trong docs là thứ người dùng chép nhiều nhất, nên test kiểm từng lệnh với snapshot `--help` thật của Plan 3. Khi test này đỏ vì lệch: **sửa docs, không sửa CLI**. Lệnh `prepare` còn được kiểm với `VAULT_ACTIONS` của SDK (dạng kebab-case, cộng `create-vault`), vì snapshot của `prepare` không bắt buộc liệt kê action.

- [ ] **Step 1: Viết test thất bại**

`scripts/test/docs-content.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VAULT_ACTIONS } from '../../packages/sdk/src/actions';
import { checkCommand, type DocCommand, extractCommands, prepareActions } from '../ops/doc-commands';
import { PUBLISH_PACKAGES } from '../ops/packages';

const ROOT = join(import.meta.dirname, '..', '..');
const CONTENT = join(ROOT, 'apps', 'docs', 'src', 'content', 'docs');
const HELP_DIR = join(ROOT, 'packages', 'cli', 'test', 'snapshots', 'help');

describe('extractCommands', () => {
  it('reads shell blocks and inline code, and ignores other blocks', () => {
    const md = [
      'Run `npx -y atropyle verify --vault "$VAULT"` first.',
      '',
      '```bash',
      'VAULT=0xabc',
      'npx -y atropyle plan check atropyle.plan.json --as "$ME" # check it',
      'cd atropyle-quickstart && atropyle status "$VAULT" --json',
      'claude mcp add atropyle -- npx -y @atropyle/mcp',
      '```',
      '',
      '```json',
      '{ "note": "atropyle verify --nope" }',
      '```',
      '',
      '```text',
      '/plugin install atropyle@atropyle',
      '```',
    ].join('\n');
    expect(extractCommands('users/x.md', md)).toEqual([
      {
        file: 'users/x.md',
        line: 'npx -y atropyle plan check atropyle.plan.json --as "$ME"',
        words: ['plan', 'check'],
        flags: ['--as'],
      },
      { file: 'users/x.md', line: 'atropyle status "$VAULT" --json', words: ['status'], flags: ['--json'] },
      { file: 'users/x.md', line: 'npx -y atropyle verify --vault "$VAULT"', words: ['verify'], flags: ['--vault'] },
    ]);
  });

  it('ignores a bare npx -y atropyle with no command', () => {
    expect(extractCommands('a.md', 'Use `npx -y atropyle` anywhere.')).toEqual([]);
  });
});

describe('checkCommand', () => {
  const HELP: Record<string, string> = {
    atropyle: 'Usage: atropyle [options] [command]\n\nOptions:\n  --json        print one JSON object\n  --rpc <url>   read RPC\n',
    verify: 'Usage: atropyle verify [options]\n\nOptions:\n  --vault-file <f>   unused\n  --vault <address>  also check a vault\n',
    plan: 'Usage: atropyle plan [command]\n',
    'plan-check': 'Usage: atropyle plan check [options] <file>\n\nOptions:\n  --as <address>  owner of the plan\n',
  };
  const readHelp = (name: string) => HELP[name] ?? null;
  const cmd = (words: string[], flags: string[] = []): DocCommand => ({
    file: 'f.md',
    line: ['atropyle', ...words, ...flags].join(' '),
    words,
    flags,
  });

  it('accepts commands and flags from the snapshots, including global flags', () => {
    expect(checkCommand(cmd(['verify'], ['--vault', '--json']), readHelp)).toBeNull();
    expect(checkCommand(cmd(['plan', 'check'], ['--as']), readHelp)).toBeNull();
  });

  it('falls back to the parent command when the next word is an argument', () => {
    expect(checkCommand(cmd(['plan', 'later']), readHelp)).toBeNull();
  });

  it('reports unknown commands and unknown flags', () => {
    expect(checkCommand(cmd(['deploy']), readHelp)).toContain('unknown command "deploy"');
    expect(checkCommand(cmd(['verify'], ['--vaults']), readHelp)).toContain('--vaults');
    expect(checkCommand(cmd(['plan', 'check'], ['--vault']), readHelp)).toContain('--vault');
  });
});

describe('prepareActions', () => {
  it('turns the SDK vault actions into the kebab-case CLI actions', () => {
    const actions = prepareActions(VAULT_ACTIONS);
    for (const a of ['create-vault', 'check-in', 'attest-death', 'vote-recovery', 'revoke-all', 'poke']) {
      expect(actions.has(a), a).toBe(true);
    }
    expect(actions.has('checkIn')).toBe(false);
  });
});

function markdownFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, prefix))) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(join(dir, rel)).isDirectory()) out.push(...markdownFiles(dir, rel));
    else if (/\.mdx?$/.test(name)) out.push(rel);
  }
  return out;
}

describe('docs content', () => {
  // reference/ is generated from the same snapshots, so only hand-written pages are checked.
  const pages = markdownFiles(CONTENT).filter((p) => !p.startsWith('reference/'));
  const commands = pages.flatMap((p) => extractCommands(p, readFileSync(join(CONTENT, p), 'utf8')));
  const readSnapshot = (name: string): string | null => {
    const file = join(HELP_DIR, `${name}.txt`);
    return existsSync(file) ? readFileSync(file, 'utf8') : null;
  };

  it('every atropyle command in the docs exists in the CLI snapshots', () => {
    expect(commands.length).toBeGreaterThanOrEqual(20);
    expect(commands.map((c) => checkCommand(c, readSnapshot)).filter((p) => p !== null)).toEqual([]);
  });

  it('every prepare action in the docs is a vault action of the SDK', () => {
    const known = prepareActions(VAULT_ACTIONS);
    const used = commands.filter((c) => c.words[0] === 'prepare').map((c) => c.words[1] ?? '(none)');
    expect(used.length).toBeGreaterThanOrEqual(5);
    expect(used.filter((a) => !known.has(a))).toEqual([]);
  });

  it('every published package has its npm homepage page in the docs', () => {
    for (const p of PUBLISH_PACKAGES) expect(existsSync(join(CONTENT, `${p.docsPage}.md`)), p.docsPage).toBe(true);
  });
});
```

Trong `apps/docs/test/pages.test.ts`, chèn khối sau ngay trước dòng `];` đóng mảng `PAGES`:

```ts
  // Developers (Task 6)
  {
    path: 'developers/quickstart.md',
    title: 'Quickstart',
    order: 1,
    mustInclude: [
      'npm install @atropyle/sdk viem',
      "createAtropyle({ chain: 'xlayer' })",
      'vault.timeline()',
      "{ type: 'checkIn' }",
      'atro.handoff.link(plan)',
      'npx -y atropyle status',
    ],
  },
  {
    path: 'developers/ai-agents.md',
    title: 'Use with AI agents',
    order: 2,
    mustInclude: [
      'claude mcp add atropyle -- npx -y @atropyle/mcp',
      '.vscode/mcp.json',
      '[mcp_servers.atropyle]',
      '/plugin marketplace add duongnq2798/atropyle',
      'npx skills add duongnq2798/atropyle',
      'atropyle_prepare_create_vault',
      '## Safety',
    ],
  },
  {
    path: 'developers/keeper.md',
    title: 'Run your own keeper',
    order: 3,
    mustInclude: ['## Why it is safe', 'keeperTick', 'planKeeperActions', 'atro.scan', 'KEEPER_KEY', 'dry-run'],
  },
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `npm run test:scripts -- docs-content`
Expected: FAIL vì không tìm thấy `../ops/doc-commands`.

Run: `npm test -w apps/docs -- pages`
Expected: FAIL với `ENOENT` cho `developers/quickstart.md`.

- [ ] **Step 3: Viết `scripts/ops/doc-commands.ts`**

```ts
// Finds every `atropyle` command written in the docs, so a test can compare it with the CLI's --help snapshots.

export interface DocCommand {
  /** Page, relative to the docs content directory. */
  file: string;
  /** The command as written, without a trailing comment. */
  line: string;
  /** The command name, then the next word when it may be a subcommand: ["plan", "check"]. */
  words: string[];
  flags: string[];
}

const FENCE = /^(`{3,}|~{3,})[ \t]*([\w-]*)[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm;
const SHELL_LANGS = new Set(['', 'bash', 'sh', 'shell', 'console']);
const INLINE = /`([^`\n]+)`/g;
const CALL = /(?:^|\s)(?:npx\s+(?:-y\s+)?)?atropyle(?:@[\w.-]+)?\s+([a-z][\w-]*)(.*)$/;
const NEXT_WORD = /^\s+([a-z][\w-]*)/;
const FLAG = /(?:^|\s)(--[a-z][\w-]*)/g;

function callsIn(file: string, text: string): DocCommand[] {
  const out: DocCommand[] = [];
  for (const raw of text.replace(/^\s*\$\s+/, '').split(/&&|\|\||[|;]/)) {
    const segment = raw.replace(/\s#.*$/, '');
    const m = CALL.exec(segment);
    if (!m) continue;
    const next = NEXT_WORD.exec(m[2])?.[1];
    out.push({
      file,
      line: segment.trim(),
      words: next ? [m[1], next] : [m[1]],
      flags: [...m[2].matchAll(FLAG)].map((f) => f[1]),
    });
  }
  return out;
}

export function extractCommands(file: string, markdown: string): DocCommand[] {
  const out: DocCommand[] = [];
  for (const block of markdown.matchAll(FENCE)) {
    if (!SHELL_LANGS.has(block[2])) continue;
    for (const line of block[3].split('\n')) out.push(...callsIn(file, line));
  }
  const prose = markdown.replace(FENCE, '');
  for (const span of prose.matchAll(INLINE)) out.push(...callsIn(file, span[1]));
  return out;
}

const hasFlag = (help: string, flag: string): boolean => new RegExp(`(^|[\\s,])${flag}(?![\\w-])`, 'm').test(help);

export function checkCommand(c: DocCommand, readHelp: (name: string) => string | null): string | null {
  const names = c.words.length > 1 ? [c.words.join('-'), c.words[0]] : [c.words[0]];
  const help = names.map(readHelp).find((h) => h !== null) ?? null;
  if (help === null) return `${c.file}: "${c.line}" uses an unknown command "${c.words[0]}"`;
  const global = readHelp('atropyle') ?? '';
  const missing = c.flags.filter((f) => !hasFlag(help, f) && !hasFlag(global, f));
  return missing.length > 0 ? `${c.file}: "${c.line}" uses ${missing.join(', ')}, which the CLI does not have` : null;
}

const kebab = (name: string): string => name.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);

export function prepareActions(actions: readonly string[]): Set<string> {
  return new Set(['create-vault', ...actions.map(kebab)]);
}
```

Run: `npm run test:scripts -- docs-content -t "extractCommands|checkCommand|prepareActions"`
Expected: PASS 6 test; ba test `docs content` bị `-t` bỏ qua (skipped). Chúng chỉ qua sau Step 4–5.

- [ ] **Step 4: Viết ba trang developer**

`apps/docs/src/content/docs/developers/quickstart.md`:

````md
---
title: Quickstart
description: Read a vault, preview its timeline and prepare a check-in in five minutes, from the command line or from Node.js with the SDK.
sidebar:
  order: 1
---

Everything here is read-only. Nothing is signed or sent: preparing a transaction gives you a signing link that a person opens in their own wallet.

## From the command line

You need Node.js 20 or later.

```bash
npx -y atropyle doctor
npx -y atropyle verify
```

`doctor` checks your Node.js version and the two RPC operators. `verify` proves the policy circuit on mainnet. Then look at a vault, or find the vaults of an account:

```bash
VAULT=0xAnyVaultAddress
ME=0xYourWalletAddress
npx -y atropyle status "$VAULT"
npx -y atropyle vaults "$ME"
npx -y atropyle status "$VAULT" --json
```

With `--json`, every command prints exactly one object with `schemaVersion: 1`. The [CLI reference](../reference/cli.html) lists each command, its options and its JSON Schema.

## From Node.js

```bash
mkdir atropyle-quickstart && cd atropyle-quickstart
npm init -y
npm pkg set type=module
npm install @atropyle/sdk viem
```

`viem` is a peer dependency: the SDK returns viem types and accepts a viem wallet. Create `index.js`:

```js
import { createAtropyle, formatDuration } from '@atropyle/sdk';

const address = process.argv[2];
if (!address) throw new Error('Usage: node index.js <vault address>');

const atro = createAtropyle({ chain: 'xlayer' });
const vault = atro.vault(address);

// 1. Read the vault. Every value comes from the same block.
const status = await vault.status();
console.log(`State: ${status.state}, silent periods: ${status.idle}, block ${status.blockNumber}`);

// 2. Preview what happens if nobody acts. The SDK runs the policy circuit itself.
const timeline = await vault.timeline();
for (const event of timeline.events) {
  const wait = event.at > timeline.now ? event.at - timeline.now : 0n;
  console.log(`in ${formatDuration(wait)}: ${event.from} -> ${event.state} (${event.note})`);
}

// 3. Prepare a check-in for the owner. The SDK simulates it; nothing is signed.
const { owner } = await vault.config();
const plan = await vault.prepare({ type: 'checkIn' }, { as: owner });
console.log(plan.summary);
console.log(`Sign it here: ${atro.handoff.link(plan)}`);
```

```bash
node index.js 0xAnyVaultAddress
```

What each step does:

1. `createAtropyle({ chain: 'xlayer' })` knows the mainnet addresses and RPC endpoints. No API key is needed.
2. `vault.status()` returns the state, the deadlines, the votes and the coverage of every asset.
3. `vault.timeline()` predicts the next alarm and the earliest release by running the same circuit as the chain.
4. `vault.prepare(...)` builds the transaction and simulates it. `atro.handoff.link(plan)` turns it into a link to the signing page of the web app, which checks every step again before the wallet signs.

## Handle errors

Every error the SDK throws is an `AtropyleError` with a stable `code` and a link to its explanation:

```js
import { AtropyleError } from '@atropyle/sdk';

try {
  await atro.vault('0x0000000000000000000000000000000000000001').status();
} catch (e) {
  if (!(e instanceof AtropyleError)) throw e;
  console.error(e.code, e.message, e.docsUrl);
}
```

The [Errors](../reference/errors.html) page explains each code and how to fix it.

## Next steps

- [SDK reference](../reference/sdk.html): every function and type.
- [Use with AI agents](ai-agents.html): the same operations through MCP.
- [Run your own keeper](keeper.html): keep vaults moving without the Atropyle server.
````

`apps/docs/src/content/docs/developers/ai-agents.md`:

````md
---
title: Use with AI agents
description: Connect Atropyle to Claude Code, Claude Desktop, Cursor, VS Code or Codex through MCP, or install the Claude Code plugin and the Agent Skills. No tool ever signs.
sidebar:
  order: 2
---

Atropyle gives AI agents three things:

- an MCP server, `@atropyle/mcp`, with seven read-only tools;
- two Agent Skills: `atropyle-estate-planning` for owners and `atropyle-guardian` for guardians and heirs;
- a Claude Code plugin that installs both.

None of them can sign, send or hold a key. Every write ends as a signing link that a person opens in their own wallet.

## Connect the MCP server

The server needs Node.js 20 or later.

Claude Code:

```bash
claude mcp add atropyle -- npx -y @atropyle/mcp
```

Claude Desktop (`claude_desktop_config.json`) and Cursor (`.cursor/mcp.json`):

```json
{ "mcpServers": { "atropyle": { "command": "npx", "args": ["-y", "@atropyle/mcp"] } } }
```

VS Code (`.vscode/mcp.json`):

```json
{ "servers": { "atropyle": { "type": "stdio", "command": "npx", "args": ["-y", "@atropyle/mcp"] } } }
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.atropyle]
command = "npx"
args = ["-y", "@atropyle/mcp"]
```

On Windows, if your client cannot start `npx`, use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "@atropyle/mcp"]`. The CLI starts the same server with `npx -y atropyle mcp`.

| Option | Environment | Default | Meaning |
|---|---|---|---|
| `--chain <xlayer\|local>` | `ATROPYLE_CHAIN` | `xlayer` | Built-in deployment |
| `--rpc <url>` | `ATROPYLE_RPC` | the deployment's RPCs | Read RPC. It must serve the same chain. |
| `--deployment <file>` | `ATROPYLE_DEPLOYMENT` | | Deployment JSON; wins over `--chain` |

## Tools, resources and prompts

| Tool | What it does |
|---|---|
| `atropyle_get_vault` | State, timing, heirs, guardians, assets and the next deadline of a vault |
| `atropyle_list_vaults` | Vaults where an account is owner, heir or guardian |
| `atropyle_simulate` | What an action would do now or later, or the timeline of a plan |
| `atropyle_check_plan` | Problems in a plan before the vault exists |
| `atropyle_verify` | Proves the policy circuit over all 2^26 inputs, and checks a vault |
| `atropyle_prepare_create_vault` | Simulated, unsigned transactions and a signing link for a new vault |
| `atropyle_prepare_action` | The same for check-ins, guardian votes, claims and every other action |

Resources: `atropyle://deployments/{chain}` (addresses, IDs and hashes) and `atropyle://policy/spec` (the policy and its properties P1 to P8). Prompts: `plan_inheritance` walks an owner from a plan to a signing link; `guardian_briefing` prepares a guardian before an attestation or a vote.

## Install the Claude Code plugin

The plugin bundles the MCP server and both skills. In Claude Code:

```text
/plugin marketplace add duongnq2798/atropyle
/plugin install atropyle@atropyle
```

## Install the Agent Skills in other agents

```bash
npx skills add duongnq2798/atropyle
```

The skills call `npx -y atropyle … --json`, so they also work in agents without MCP.

## Try it

- "Plan an inheritance vault for my wallet 0x… with my two children as heirs, 60/40, and twelve months of timing." The agent checks the plan, shows the timeline, then gives you a signing link.
- "I am a guardian of vault 0x…. The owner's family says he died. What should I do?" The agent verifies the vault, goes through the safety checklist with you and explains how long the owner still has to cancel.

## Safety

- **Read-only tools.** Every tool is marked read-only. No tool sends a transaction, and none accepts a private key.
- **Untrusted text stays data.** Text that comes from the chain, such as token names and revert reasons, is returned only under `untrusted`, cut to 64 characters and cleaned of control and invisible characters. It never appears in summaries.
- **No link for a failing step.** When a step fails simulation, the result has `blocked` and no signing link.
- **Guardian warning.** Guardian actions carry `GUARDIAN_VERIFY_OUT_OF_BAND`: confirm with the owner in person or by phone first.
- **The signing page checks again.** Before the wallet signs, the web app decodes every step, accepts only Atropyle targets and simulates again. See [Security & managing risk](../concepts/security.html#threats-atropyle-is-designed-for).

## Use the server as a library

```ts
import { createAtropyleMcpServer } from '@atropyle/mcp';
import { createMcpHandler } from '@modelcontextprotocol/server';

const handler = createMcpHandler(() => createAtropyleMcpServer({ sdk: { chain: 'xlayer' } }));
```

`@atropyle/mcp/ops` exports the same operations with their zod schemas, which the CLI also uses.
````

`apps/docs/src/content/docs/developers/keeper.md`:

````md
---
title: Run your own keeper
description: Keep vaults moving without the Atropyle server, with the same keeper code that the Atropyle Worker runs.
sidebar:
  order: 3
---

A vault changes state only inside a transaction. The Atropyle keeper calls `poke` and `distribute` for every vault, usually within a minute of a deadline. You can run the same code yourself, for example for your family's vault, so that nothing depends on the Atropyle server.

## Why it is safe

- `poke` and `distribute` are open to anyone. They only record changes that are already due and send assets to the recipients fixed in the vault: the heirs, or the one recovery wallet.
- A keeper wallet pays gas and nothing else. If someone steals its key, they can only spend its OKB.
- Use a fresh wallet with a little OKB, never your main wallet. The keeper stops by itself when the balance falls below 0.005 OKB.

## Set up

```bash
mkdir my-keeper && cd my-keeper
npm init -y
npm pkg set type=module
npm install @atropyle/sdk viem
```

## Keep one vault moving

`keeper.js`:

```js
import { createAtropyle, keeperTick } from '@atropyle/sdk';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const vaults = process.argv.slice(2);
if (vaults.length === 0) throw new Error('Usage: node keeper.js <vault address> [more vault addresses]');

const atro = createAtropyle({ chain: 'xlayer' });

// Without KEEPER_KEY the keeper only plans, and logs what it would send.
const key = process.env.KEEPER_KEY;
const wallet = key
  ? createWalletClient({ account: privateKeyToAccount(key), chain: atro.chain, transport: http(atro.deployment.rpcUrls[0]) })
  : undefined;

for (;;) {
  const report = await keeperTick(atro, vaults, { wallet });
  for (const o of report.outcomes) {
    console.log(new Date().toISOString(), o.vault, o.status, o.decision?.reason ?? '', o.hash ?? '');
  }
  if (report.stopped) {
    console.error(`Keeper stopped (${report.stopped}). Send a little OKB to ${report.keeper}.`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 60_000));
}
```

First run it without a key. Every line then says `dry-run` or `idle`:

```bash
VAULT=0xYourVaultAddress
node keeper.js "$VAULT"
```

When the plan looks right, give it the key of the keeper wallet. `read -rs` keeps the key out of your shell history:

```bash
read -rs KEEPER_KEY && export KEEPER_KEY
node keeper.js "$VAULT"
```

Each tick simulates every transaction before it sends it, sends at most 20 transactions, and caps the gas of each one.

| Status | Meaning |
|---|---|
| `idle` | Nothing is due. |
| `dry-run` | Something is due, but there is no wallet. |
| `sent` | The transaction was sent; the line shows its hash. |
| `simulation-failed` | The simulation failed, so nothing was sent. |
| `gas-cap` | The transaction needs more gas than the cap. |
| `send-failed` | The RPC refused the transaction. |
| `limit` | The tick already sent 20 transactions; the rest wait for the next tick. |
| `read-failed` | The vault could not be read. The next tick tries again. |

## Keep every vault moving

`atro.scan` follows the factory's events, so the keeper also finds vaults created after it started. Save the cursor so that a restart does not read the whole chain again:

```js
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createAtropyle, keeperTick, stringify } from '@atropyle/sdk';

const atro = createAtropyle({ chain: 'xlayer' });
const wallet = undefined; // build it from KEEPER_KEY as in keeper.js

const saved = existsSync('cursor.json') ? JSON.parse(readFileSync('cursor.json', 'utf8')) : null;
let cursor = saved ? { toBlock: BigInt(saved.toBlock), vaults: saved.vaults } : undefined;

for (;;) {
  const scan = await atro.scan({ resume: cursor, maxBlocks: 5_000 });
  cursor = scan.cursor;
  writeFileSync('cursor.json', stringify(cursor));
  if (scan.truncated) continue; // still catching up with the chain

  const report = await keeperTick(atro, cursor.vaults, { wallet });
  console.log(new Date().toISOString(), `${cursor.vaults.length} vaults, ${report.sent} sent`);
  if (report.stopped) process.exit(1);
  await new Promise((resolve) => setTimeout(resolve, 60_000));
}
```

`keeperTick` reads every vault you give it. With many vaults, call it only for vaults whose next deadline has passed, as the Atropyle Worker does.

## Decide for yourself

`planKeeperActions` is the pure function inside `keeperTick`. It needs no wallet and no network:

```js
import { createAtropyle, planKeeperActions } from '@atropyle/sdk';

const atro = createAtropyle({ chain: 'xlayer' });
const vault = atro.vault(process.argv[2]);
const [status, timeline] = await Promise.all([vault.status(), vault.timeline()]);
const decision = planKeeperActions(status, timeline, timeline.now);
console.log(decision.action ?? 'nothing to do', decision.reason, decision.nextCheckAt);
```

| Reason | Action |
|---|---|
| `RELEASE_DUE` | A release is due: `distribute`, or `poke` when nothing is covered. |
| `TRANSITION_DUE` | An alarm or a cancellation is due: `poke`. |
| `DISTRIBUTE_DUE` | Released and assets are still covered: `distribute` again. |
| `DISTRIBUTE_BACKOFF` | Released, and `distribute` ran less than an hour ago. |
| `WAITING` | Nothing is due before `nextCheckAt`. |
| `DONE` | Released and nothing is left to move. Checked again once a day. |
| `EXPIRED` | The Drill expired. Nothing can happen any more. |

Run the keeper on a machine you control, and keep the key out of shared systems such as a public CI service.
````

- [ ] **Step 5: Viết lại trang chủ docs, nối link sang trang developer, sidebar đủ bốn nhóm**

`apps/docs/src/content/docs/index.md` (thay toàn bộ):

````md
---
title: Atropyle documentation
description: Inheritance and wallet recovery on X Layer, with rules that anyone can verify.
template: splash
pagefind: false
hero:
  title: Atropyle
  tagline: If you go silent, your heirs inherit. If you lose your wallet, your guardians recover it. Until then your assets stay in your wallet, and anyone can verify the rules.
  actions:
    - text: Try a 5-minute Drill
      link: ../index.html#/
      icon: right-arrow
    - text: What is Atropyle
      link: users/what-is-atropyle.html
      variant: minimal
---

:::caution[Beta, unaudited]
Atropyle has not had an external audit. Start with a free Drill, and protect only what you could afford to lose while Atropyle is in beta.
:::

## Start here

- [What is Atropyle](users/what-is-atropyle.html): the idea on one page.
- [For owners: create your vault](users/owners.html): the Drill, templates, heirs, guardians, timing, assets and check-ins.
- [For heirs](users/heirs.html): what you receive, how to check a vault, and how to claim by hand.
- [For guardians](users/guardians.html): your role and the safety checklist.
- [Recover a lost wallet](users/recover-a-lost-wallet.html)
- [FAQ](users/faq.html), including [which parts use TapeOut](users/faq.html#which-parts-use-tapeout).

## How it works

- [How it works](concepts/how-it-works.html): the vault, the clock and the five states.
- [The policy circuit](concepts/policy-circuit.html): TapeOut, LATCH, NAND, and reuse through REF.
- [Security & managing risk](concepts/security.html), including [what Atropyle cannot protect](concepts/security.html#what-atropyle-cannot-protect).
- [Verification & trust assumptions](concepts/verification.html)

## Build with Atropyle

- [Quickstart](developers/quickstart.html): read a vault and prepare a check-in in five minutes.
- [Use with AI agents](developers/ai-agents.html): the MCP server, the Claude Code plugin and the Agent Skills.
- [Run your own keeper](developers/keeper.html)
- [SDK reference](reference/sdk.html) and [CLI reference](reference/cli.html)
- [Errors](reference/errors.html): every error code and how to fix it.

## Verify it yourself

```bash
npx -y atropyle verify
```

The command downloads the policy circuit from X Layer, tries every one of its 67,108,864 input combinations and compares it with the published source. [Verification & trust assumptions](concepts/verification.html) explains what this proves.

AI agents can read the whole site as [llms.txt](llms.txt) or [llms-full.txt](llms-full.txt).
````

Trong `apps/docs/src/content/docs/users/faq.md`, thay đúng câu:

```md
Anyone can run a keeper with the SDK.
```

bằng:

```md
Anyone can [run a keeper](../developers/keeper.html) with the SDK.
```

Trong `apps/docs/src/content/docs/users/guardians.md`, thay đúng câu:

```md
Install the skills with `npx skills add duongnq2798/atropyle`.
```

bằng:

```md
Install the skills with `npx skills add duongnq2798/atropyle`, or see [Use with AI agents](../developers/ai-agents.html).
```

`apps/docs/src/sidebar.ts`:

```ts
// Sidebar groups. Each group is generated from one directory; pages set their position with `sidebar.order`.
export interface SidebarGroup {
  label: string;
  autogenerate: { directory: string };
}

export const sidebar: SidebarGroup[] = [
  { label: 'Start here', autogenerate: { directory: 'users' } },
  { label: 'Concepts', autogenerate: { directory: 'concepts' } },
  { label: 'Developers', autogenerate: { directory: 'developers' } },
  { label: 'Reference', autogenerate: { directory: 'reference' } },
];
```

- [ ] **Step 6: Chạy test để thấy qua**

Run: `npm test -w apps/docs -- pages && npm run test:scripts -- docs-content`
Expected: PASS 39 test của `pages` (13 trang × 3) và PASS 9 test của `docs-content`.

Nếu `every atropyle command in the docs exists in the CLI snapshots` đỏ: thông báo nêu trang, dòng lệnh và cờ hay lệnh không có. Sửa trang docs theo snapshot của Plan 3 (ví dụ tên giá trị của `--preset`), không sửa CLI, không sửa snapshot. Nếu `prepare` báo một action lạ, đổi về đúng tên kebab-case trong `VAULT_ACTIONS`.

- [ ] **Step 7: Build, kiểm link ở cả hai base, typecheck, biome**

Run: `for b in /docs/ /atropyle/docs/; do DOCS_BASE=$b npm run build -w apps/docs && DOCS_BASE=$b npm run check:links -w apps/docs || break; done`
Expected: hai dòng `links ok`.

Run: `grep -c 'href="\.\./index\.html#/"' apps/docs/dist/index.html && grep -c 'developers/' apps/docs/dist/llms.txt`
Expected: một số ≥ `1` (nút Drill trỏ đúng web app), rồi `3`.

Nếu Starlight ghép base vào `link` của hero (nút Drill thành `/docs/../index.html#/`), bộ kiểm sẽ báo lỗi. Không đổi sang đường dẫn tuyệt đối, vì sai ở Pages. Thay vào đó, bỏ nút này khỏi `hero.actions` và thêm dòng `[Try a 5-minute Drill](../index.html#/)` ngay đầu nội dung trang.

Run: `npm run typecheck:scripts && npx biome check --write scripts/ops/doc-commands.ts scripts/test/docs-content.test.ts apps/docs/test/pages.test.ts && npx biome ci .`
Expected: thoát 0.

- [ ] **Step 8: Commit**

```bash
git add apps/docs/src/content/docs/developers/quickstart.md apps/docs/src/content/docs/developers/ai-agents.md apps/docs/src/content/docs/developers/keeper.md apps/docs/src/content/docs/index.md apps/docs/src/content/docs/users/faq.md apps/docs/src/content/docs/users/guardians.md apps/docs/src/sidebar.ts apps/docs/test/pages.test.ts scripts/ops/doc-commands.ts scripts/test/docs-content.test.ts
git commit -m "docs(docs): developer guides, the docs home page and a test that keeps CLI commands in sync" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 7: CI cho docs, script và bảo mật; luật chung cho mọi workflow

**Files:**
- Create: `scripts/ops/workflows.ts`, `knip.json`
- Modify: `.github/workflows/ci.yml`, `package.json` (gốc, devDependency `knip`), `package-lock.json`
- Test: `scripts/test/workflows.test.ts`

**Interfaces:**
- Consumes:
  - `yaml` 2.9.1 (đã cài ở Task 2, workspace `apps/docs`; Step 1 cài thêm ở gốc với cùng phiên bản).
  - `ci.yml` hiện có: job `circuits`, `contracts` (Plan 1), `lint`, `sdk`, `sdk-integration` (Plan 2), `cli-mcp` (Plan 3), `web` (Plan 4), `worker` (Plan 5).
  - Lệnh của Task 2–6: `npm run docs:gen -- --check`, `npm test -w apps/docs`, `npm run build -w apps/docs`, `npm run check:links -w apps/docs`, `npm run test:scripts`, `npm run typecheck:scripts`.
- Produces:
  - `scripts/ops/workflows.ts`:
    - `ALLOWED_SECRETS: readonly ['GITHUB_TOKEN', 'NPM_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']`
    - `WRITE_PERMISSIONS: Record<string, Record<string, readonly string[]>>`: file → job → quyền được `write`. Đã chốt trước cho Task 12 và 14: `proof.yml` job `badge` (`contents`); `release.yml` job `version` (`contents`, `pull-requests`), `publish` (`contents`, `id-token`), `pages` (`pages`, `id-token`); `codeql.yml` job `analyze` (`security-events`).
    - `interface WorkflowFile { name: string; text: string; doc: Workflow }`, `interface Workflow`, `interface Job`, `interface Step`
    - `readWorkflows(dir: string): WorkflowFile[]`
    - `secretsUsed(text: string): string[]`
    - `forbiddenUses(text: string): string[]`
    - `permissionProblems(file: WorkflowFile): string[]`
    - `auditWorkflows(files: readonly WorkflowFile[]): string[]`
  - Ba job mới trong `ci.yml`: `docs` (matrix `base: [/docs/, /atropyle/docs/]`), `scripts`, `security`. Task 8, 9, 13 thêm job `contracts-static`, `bench`, `packages`; Task 12 và 14 thêm workflow mới. Test của task này chạy trên **mọi** workflow, nên mọi task sau phải giữ nó xanh.

Luật test ép cho mọi file trong `.github/workflows/`:
- Có `permissions` ở đầu file, mọi quyền là `read` hoặc `none`. Quyền `write` chỉ được cấp ở job, và chỉ khi có trong `WRITE_PERMISSIONS`. Không có `write-all`.
- Chỉ đọc bốn secret của `ALLOWED_SECRETS`. Không truy cập `secrets[...]` động, không `toJSON(secrets)`.
- Không có `cast send`, `--broadcast`, `--private-key`, `PRIVATE_KEY`, `KEEPER_KEY`, `DEWEB_OPERATOR_KEY`, `wrangler secret`, `pull_request_target`. Đây là luật "không workflow nào ký giao dịch, không workflow nào đặt secret".

- [ ] **Step 1: Cài gói**

Run: `npm install -D -E knip@6.45.1 yaml@2.9.1`
Expected: thoát 0; `package.json` gốc có `"knip": "6.45.1"` và `"yaml": "2.9.1"` trong `devDependencies`.

- [ ] **Step 2: Viết test thất bại**

`scripts/test/workflows.test.ts`:

```ts
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  auditWorkflows,
  forbiddenUses,
  permissionProblems,
  readWorkflows,
  secretsUsed,
  type Workflow,
  type WorkflowFile,
} from '../ops/workflows';

const ROOT = join(import.meta.dirname, '..', '..');
const file = (name: string, text: string): WorkflowFile => ({ name, text, doc: parse(text) as Workflow });

describe('workflow rules', () => {
  it('lists the secrets a workflow reads, and flags dynamic access', () => {
    const text = 'env:\n  A: ${{ secrets.GITHUB_TOKEN }}\n  B: ${{ secrets.NPM_TOKEN }}\n  C: ${{ secrets[matrix.name] }}\n';
    expect(secretsUsed(text)).toEqual(['GITHUB_TOKEN', 'NPM_TOKEN', 'secrets[…]']);
  });

  it('flags anything that signs, broadcasts or handles a key', () => {
    expect(forbiddenUses('run: cast send 0xabc "poke()"')).toEqual([expect.stringContaining('cast send')]);
    expect(forbiddenUses('run: forge script X --broadcast --private-key $K')).toHaveLength(2);
    expect(forbiddenUses('env:\n  KEEPER_KEY: x')).toEqual([expect.stringContaining('KEEPER_KEY')]);
    expect(forbiddenUses('on:\n  pull_request_target:')).toEqual([expect.stringContaining('pull_request_target')]);
    expect(forbiddenUses('run: npx wrangler deploy')).toEqual([]);
  });

  it('requires read-only default permissions', () => {
    expect(permissionProblems(file('a.yml', 'on: push\njobs: {}\n'))).toEqual([
      expect.stringContaining('top-level permissions'),
    ]);
    expect(permissionProblems(file('a.yml', 'on: push\npermissions: write-all\njobs: {}\n'))).toEqual([
      expect.stringContaining('top-level permissions'),
    ]);
    expect(permissionProblems(file('a.yml', 'on: push\npermissions:\n  contents: write\njobs: {}\n'))).toEqual([
      expect.stringContaining('contents: write'),
    ]);
  });

  it('accepts job-level write only where the allowlist says so', () => {
    const job = (name: string, perm: string) =>
      `on: push\npermissions:\n  contents: read\njobs:\n  ${name}:\n    runs-on: ubuntu-latest\n    permissions:\n      ${perm}: write\n    steps: []\n`;
    expect(permissionProblems(file('proof.yml', job('badge', 'contents')))).toEqual([]);
    expect(permissionProblems(file('proof.yml', job('verify', 'contents')))).toEqual([
      expect.stringContaining('proof.yml job verify: contents: write'),
    ]);
    expect(permissionProblems(file('ci.yml', job('docs', 'id-token')))).toHaveLength(1);
  });
});

describe('the repository workflows', () => {
  const files = readWorkflows(join(ROOT, '.github', 'workflows'));
  const ci = files.find((f) => f.name === 'ci.yml');

  it('follow every rule: read-only token, four secrets, nothing that signs', () => {
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(auditWorkflows(files)).toEqual([]);
  });

  it('build and check the docs under both deployment bases', () => {
    expect(ci?.doc.jobs?.docs?.strategy?.matrix?.base).toEqual(['/docs/', '/atropyle/docs/']);
    const runs = (ci?.doc.jobs?.docs?.steps ?? []).map((s) => s.run ?? '').join('\n');
    for (const cmd of ['npm run docs:gen -- --check', 'npm run build -w apps/docs', 'npm run check:links -w apps/docs']) {
      expect(runs).toContain(cmd);
    }
  });

  it('run the security checks', () => {
    const steps = ci?.doc.jobs?.security?.steps ?? [];
    expect(steps.some((s) => s.uses?.startsWith('gitleaks/gitleaks-action@'))).toBe(true);
    const runs = steps.map((s) => s.run ?? '').join('\n');
    expect(runs).toContain('npm audit --omit=dev --audit-level=high');
    expect(runs).toContain('npx knip');
  });

  it('never leave the token in the checkout of the Plan 6 jobs', () => {
    for (const name of ['docs', 'scripts', 'security']) {
      const checkout = ci?.doc.jobs?.[name]?.steps?.find((s) => s.uses?.startsWith('actions/checkout@'));
      expect(checkout?.with?.['persist-credentials'], name).toBe(false);
    }
  });
});
```

- [ ] **Step 3: Chạy test để thấy thất bại**

Run: `npm run test:scripts -- workflows`
Expected: FAIL vì không tìm thấy `../ops/workflows`.

- [ ] **Step 4: Viết `scripts/ops/workflows.ts`**

```ts
// Rules that every GitHub workflow of the repository must follow. A test runs them on .github/workflows/.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export const ALLOWED_SECRETS = ['GITHUB_TOKEN', 'NPM_TOKEN', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'] as const;

// The only job-level write permissions a workflow may grant. Everything else stays read-only.
export const WRITE_PERMISSIONS: Record<string, Record<string, readonly string[]>> = {
  'proof.yml': { badge: ['contents'] },
  'release.yml': { version: ['contents', 'pull-requests'], publish: ['contents', 'id-token'], pages: ['pages', 'id-token'] },
  'codeql.yml': { analyze: ['security-events'] },
};

export interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

export interface Job {
  'runs-on'?: unknown;
  permissions?: unknown;
  strategy?: { matrix?: Record<string, unknown> };
  steps?: Step[];
}

export interface Workflow {
  name?: string;
  on?: unknown;
  permissions?: unknown;
  jobs?: Record<string, Job>;
}

export interface WorkflowFile {
  name: string;
  text: string;
  doc: Workflow;
}

export function readWorkflows(dir: string): WorkflowFile[] {
  return readdirSync(dir)
    .filter((n) => /\.ya?ml$/.test(n))
    .sort()
    .map((name) => {
      const text = readFileSync(join(dir, name), 'utf8');
      return { name, text, doc: (parse(text) ?? {}) as Workflow };
    });
}

export function secretsUsed(text: string): string[] {
  const names = [...text.matchAll(/\bsecrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]);
  if (/\bsecrets\s*\[/.test(text) || /toJSON\(\s*secrets\s*\)/.test(text)) names.push('secrets[…]');
  return [...new Set(names)];
}

const FORBIDDEN: readonly [RegExp, string][] = [
  [/\bcast\s+send\b/, '`cast send` signs a transaction'],
  [/--broadcast\b/, '`--broadcast` sends transactions'],
  [/--private-key\b/, '`--private-key` passes a key'],
  [/\bPRIVATE_KEY\b/, '`PRIVATE_KEY` must not exist in the repository'],
  [/\bKEEPER_KEY\b/, '`KEEPER_KEY` belongs to the Worker, set by the user with wrangler'],
  [/\bDEWEB_OPERATOR_KEY\b/, '`DEWEB_OPERATOR_KEY` stays in the user terminal'],
  [/\bwrangler\s+secret\b/, '`wrangler secret` is a user step'],
  [/\bpull_request_target\b/, '`pull_request_target` runs fork code with secrets'],
];

export function forbiddenUses(text: string): string[] {
  return FORBIDDEN.filter(([re]) => re.test(text)).map(([, why]) => why);
}

const isReadOnly = (p: unknown): boolean =>
  typeof p === 'object' && p !== null && Object.values(p).every((v) => v === 'read' || v === 'none');

export function permissionProblems(file: WorkflowFile): string[] {
  const problems: string[] = [];
  const top = file.doc.permissions;
  if (top === undefined || typeof top !== 'object' || top === null) {
    problems.push(`${file.name}: needs top-level permissions, for example "contents: read"`);
  } else if (!isReadOnly(top)) {
    for (const [k, v] of Object.entries(top)) {
      if (v !== 'read' && v !== 'none') problems.push(`${file.name}: top level grants ${k}: ${String(v)}`);
    }
  }
  for (const [jobName, job] of Object.entries(file.doc.jobs ?? {})) {
    const perms = job.permissions;
    if (perms === undefined) continue;
    if (typeof perms !== 'object' || perms === null) {
      problems.push(`${file.name} job ${jobName}: permissions must list each scope, not ${String(perms)}`);
      continue;
    }
    const allowed = WRITE_PERMISSIONS[file.name]?.[jobName] ?? [];
    for (const [k, v] of Object.entries(perms)) {
      if (v === 'write' && !allowed.includes(k)) problems.push(`${file.name} job ${jobName}: ${k}: write is not allowed`);
    }
  }
  return problems;
}

export function auditWorkflows(files: readonly WorkflowFile[]): string[] {
  const problems: string[] = [];
  for (const f of files) {
    problems.push(...permissionProblems(f));
    for (const s of secretsUsed(f.text)) {
      if (!(ALLOWED_SECRETS as readonly string[]).includes(s)) problems.push(`${f.name}: reads secret ${s}`);
    }
    for (const why of forbiddenUses(f.text)) problems.push(`${f.name}: ${why}`);
  }
  return problems;
}
```

Run: `npm run test:scripts -- workflows -t "workflow rules"`
Expected: PASS 4 test.

- [ ] **Step 5: Sửa `ci.yml`**

Trong `.github/workflows/ci.yml`, ngay sau khối `on:` (trước `jobs:`), thêm:

```yaml
permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

Thêm vào cuối khối `jobs:`, giữ nguyên mọi job đang có. Action viết theo major hiện tại (Quyết định 22); Task 16 ghim SHA.

```yaml
  docs:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        base: [/docs/, /atropyle/docs/]
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build -w circuits
      - if: matrix.base == '/docs/'
        run: npm run docs:gen -- --check
      - run: npm test -w apps/docs
      - run: npm run build -w apps/docs
        env:
          DOCS_BASE: ${{ matrix.base }}
      - run: npm run check:links -w apps/docs
        env:
          DOCS_BASE: ${{ matrix.base }}

  scripts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build -w circuits && npm run build -w packages/sdk && npm run build -w packages/mcp && npm run build -w packages/cli
      - run: npm run typecheck
      - run: npm run typecheck:scripts
      - run: npm run test:scripts

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
          persist-credentials: false
      - uses: gitleaks/gitleaks-action@v3
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITLEAKS_ENABLE_COMMENTS: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm audit --omit=dev --audit-level=high
      - run: npx knip
```

Ghi chú cho người thực thi:
- Bốn gói được build theo đúng thứ tự phụ thuộc trước `npm run typecheck`, vì typecheck của web, Worker và ví dụ đọc `.d.ts` của gói đã build. Không dùng `npm run build --workspaces`: npm chạy theo thứ tự thư mục (`packages/cli` trước `packages/sdk`).
- `GITLEAKS_ENABLE_COMMENTS: false` để gitleaks không cần quyền ghi PR. Tài khoản cá nhân không cần `GITLEAKS_LICENSE` (Quyết định 25).
- `npm audit --omit=dev` chỉ xét phụ thuộc runtime: gói publish, Worker, web. Gói docs và công cụ build nằm trong `devDependencies` (Quyết định 1).

- [ ] **Step 6: Viết `knip.json`**

```json
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "rules": {
    "files": "error",
    "dependencies": "error",
    "devDependencies": "error",
    "unlisted": "error",
    "binaries": "error",
    "unresolved": "error",
    "exports": "warn",
    "types": "warn",
    "nsExports": "warn",
    "nsTypes": "warn",
    "enumMembers": "warn",
    "namespaceMembers": "warn",
    "duplicates": "warn"
  },
  "workspaces": {
    ".": {
      "entry": [
        "scripts/*.ts",
        "scripts/ops/*.ts",
        "scripts/bench/run.ts",
        "scripts/bench/browser-entry.ts",
        "scripts/test/**/*.test.ts",
        "scripts/vitest.*.config.ts",
        "vitest.scripts.config.ts"
      ],
      "project": ["scripts/**/*.ts"]
    },
    "apps/docs": {
      "entry": ["astro.config.ts", "src/content.config.ts", "scripts/check-links.ts", "test/**/*.test.ts"],
      "project": ["**/*.ts"]
    },
    "circuits": {},
    "packages/*": {},
    "apps/*": {},
    "examples/*": {}
  }
}
```

Run: `npx knip`
Expected: thoát 0. Có thể có dòng cảnh báo (màu xám) cho `exports`/`types` thừa: SDK cố ý export rộng (Quyết định 15).

Nếu knip báo lỗi `files`, `dependencies` hay `unlisted`:
- Nếu file thật sự là entry mà knip không tự nhận ra (script chạy bằng `tsx` trong `package.json` của workspace khác, file cấu hình lạ), thêm nó vào `entry` của đúng workspace.
- Nếu là phụ thuộc thừa thật, gỡ nó khỏi `package.json` của workspace đó bằng `npm uninstall -w <workspace> <pkg>`.
- Không đổi `rules` sang `warn`, không dùng `ignore`.

- [ ] **Step 7: Chạy các bước của CI trên máy**

Run: `npm run test:scripts -- workflows`
Expected: PASS 8 test.

Run: `npm run build -w circuits && npm run build -w packages/sdk && npm run build -w packages/mcp && npm run build -w packages/cli && npm run typecheck && npm run typecheck:scripts && npm run test:scripts`
Expected: mọi lệnh thoát 0.

Run: `npm audit --omit=dev --audit-level=high`
Expected: thoát 0. Nếu có lỗ hổng mức high trong phụ thuộc runtime: chạy `npm audit --omit=dev` để xem gói; nâng đúng gói đó lên bản đã vá bằng `npm install -E -w <workspace> <pkg>@<bản vá>`, chạy lại test của workspace đó, và ghi lý do vào message commit. Không thêm `--audit-level=critical`.

Run: `npx biome check --write scripts/ops/workflows.ts scripts/test/workflows.test.ts knip.json && npx biome ci .`
Expected: thoát 0.

gitleaks chỉ chạy trên GitHub (action), không có bước trên máy.

- [ ] **Step 8: Commit**

```bash
git add scripts/ops/workflows.ts scripts/test/workflows.test.ts knip.json .github/workflows/ci.yml package.json package-lock.json
git commit -m "ci: docs, scripts and security jobs, with rules that every workflow must follow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: `[USER]` Xem CI chạy trên GitHub**

Sau khi push `main` (Task 1 Step 6 đã đưa repo lên), người dùng chạy:

```bash
gh run list --repo duongnq2798/atropyle --workflow ci.yml --limit 1
gh run watch --repo duongnq2798/atropyle
```

Expected: run mới nhất `completed` với `success`; hai job `docs (/docs/)` và `docs (/atropyle/docs/)` cùng xanh. Nếu `security` đỏ ở bước gitleaks: mở log, xem file và commit chứa phát hiện. Phát hiện thật (một key) thì `[USER]` thu hồi key đó ngay, rồi báo agent; không ghi đè lịch sử git.

### Task 8: Phân tích tĩnh contract (Slither, `forge lint`) và kiểm code hash của vault impl

**Files:**
- Create: `contracts/slither.config.json`, `contracts/STATIC-ANALYSIS.md`, `scripts/ops/check-codehash.ts`
- Modify: `contracts/foundry.toml` (chỉ thêm mục `[lint]` khi cần, không đụng `[profile.*]`), `.github/workflows/ci.yml` (job `contracts-static`), `package.json` (gốc, script `codehash:check`)
- Test: `scripts/test/codehash.test.ts`, `scripts/test/static-analysis.test.ts`

**Interfaces:**
- Consumes:
  - Plan 1: `contracts/` (Foundry 1.9.0, solc 0.8.24), artifact `contracts/out/AtropyleVault.sol/AtropyleVault.json`, invariant `invariant_I1_tokensStayWithOwnerUntilReleased`, `invariant_I2_recipientsMatchMode`.
  - Plan 2 Task 15: `deployments/xlayer.json` (trường `vaultImplCodehash`). Chưa có file thì kiểm code hash được bỏ qua.
  - Task 1: `npm run test:scripts`. Task 7: `scripts/ops/workflows.ts` (`readWorkflows`), luật chung cho workflow.
- Produces:
  - `scripts/ops/check-codehash.ts`:
    - `interface CodehashResult { status: 'match' | 'mismatch' | 'skipped'; message: string }`
    - `compareCodehash(artifact: unknown, deployment: unknown | null): CodehashResult`
    - CLI `npm run codehash:check`: thoát 1 khi `mismatch`, 0 khi `match` hoặc `skipped`.
  - Job `contracts-static` trong `ci.yml`: `forge lint --severity high --deny warnings`, Slither với `fail-on: high`, rồi `npm run codehash:check`.
  - `contracts/STATIC-ANALYSIS.md` (tiếng Anh): mỗi detector hay lint bị loại có một mục `### <tên>`. README (Task 11) và trang Security link tới file này.

**Task này có hai phần chạy ở hai thời điểm:**
- **Phần A (Step 1–4) chạy trước khi deploy mainnet 26/11,** ngay sau Plan 1 Task 11. Phần này chỉ cần Foundry và Python, không cần hạ tầng của Plan 6. Mục đích: phát hiện lỗi high khi còn sửa được contract.
- **Phần B (Step 5–10) chạy theo thứ tự, sau Task 7:** test, script code hash, job CI.

Luật phân loại (dùng ở Step 3):
- **Lỗi thật mức high** (Slither hay `forge lint`): dừng lại, báo người dùng. Trước 26/11, sửa trong Plan 1 rồi chạy lại toàn bộ test của Plan 1. Sau 26/11, contract không sửa được nữa; cách sửa duy nhất là factory v2 (Quyết định 13, spec lõi §13).
- **Đúng thiết kế:** thêm tên detector vào `detectors_to_exclude` của `contracts/slither.config.json` (hoặc tên lint vào `[lint] exclude_lints` của `contracts/foundry.toml`), và viết một mục trong `contracts/STATIC-ANALYSIS.md` theo mẫu ở Step 3. Test ở Phần B bắt mọi mục loại trừ phải có giải thích.
- **Medium, low, informational:** CI không chặn. Toàn bộ nằm trong báo cáo đầy đủ ở cuối `STATIC-ANALYSIS.md`.

- [ ] **Step 1 (Phần A): Cấu hình Slither và build artifact**

`contracts/slither.config.json`:

```json
{
  "filter_paths": "(lib/|test/|script/)",
  "exclude_dependencies": true,
  "detectors_to_exclude": ""
}
```

Run: `cd contracts && forge build --build-info --skip test --skip script`
Expected: thoát 0; có thư mục `contracts/out/build-info/` với ít nhất một file `.json`.

Cài Slither 0.11.6 vào một venv **ngoài repo** (không cài toàn cục):

Run: `python -m venv "$TEMP/slither-venv" && "$TEMP/slither-venv/Scripts/python" -m pip install slither-analyzer==0.11.6 && "$TEMP/slither-venv/Scripts/slither" --version`
Expected: dòng cuối `0.11.6`. Trên Linux/macOS đường dẫn là `bin/` thay cho `Scripts/`.

- [ ] **Step 2 (Phần A): Chạy hai công cụ**

Run: `cd contracts && forge lint --severity high --deny warnings`
Expected: thoát 0 và không in phát hiện nào. Nếu có phát hiện: phân loại ở Step 3.

Run: `cd contracts && "$TEMP/slither-venv/Scripts/slither" . --ignore-compile --config-file slither.config.json --fail-high`
Expected: thoát 0. Slither vẫn in các phát hiện medium/low/informational; chỉ high làm lệnh thoát khác 0. Nếu thoát khác 0: phân loại ở Step 3.

Nếu Slither không chạy được trên Windows (lỗi đường dẫn của crytic-compile): chạy Phần A bằng job CI ở Step 7 trên một nhánh (`git push origin HEAD:static-analysis`), đọc log của job `contracts-static`, rồi quay lại Step 3.

- [ ] **Step 3 (Phần A): Phân loại và ghi `STATIC-ANALYSIS.md`**

Với mỗi phát hiện high, áp luật phân loại ở đầu task. Mỗi mục loại trừ theo đúng mẫu sau. Ví dụ dưới đây chỉ giữ lại **nếu** Slither thật sự báo `arbitrary-send-erc20`:

```md
### arbitrary-send-erc20

- **Tool:** Slither 0.11.6, severity High.
- **Where:** `AtropyleVault._split20` and the ERC-20 branch of `distribute`.
- **What it reports:** `transferFrom(owner, recipient, amount)` where `from` is not `msg.sender`.
- **Why it is safe:** moving the owner's approved tokens is the purpose of the vault, and anyone may call `distribute` after a release. Safety comes from the policy, not from the caller: tokens move only when the state is Released (invariant I1), and only to the heirs or to the recovery target (invariant I2).
- **Covered by:** `invariant_I1_tokensStayWithOwnerUntilReleased`, `invariant_I2_recipientsMatchMode` and the distribution tests in `contracts/test`.
```

Ghi tên detector vào `detectors_to_exclude`, nối bằng dấu phẩy, không có khoảng trắng (ví dụ `"arbitrary-send-erc20"`). Với lint của `forge lint`, thêm vào `contracts/foundry.toml` (mục riêng, ngoài mọi `[profile.*]`):

```toml
[lint]
exclude_lints = ["<tên lint>"]
```

`contracts/STATIC-ANALYSIS.md` có đúng bố cục sau:

````md
# Static analysis

Atropyle's contracts are checked by two tools on every push:

- [Slither](https://github.com/crytic/slither) 0.11.6, through `crytic/slither-action` v0.4.2;
- `forge lint` from Foundry 1.9.0, high-severity lints only.

The CI job `contracts-static` fails on any high-severity finding that is not explained below. Tests, scripts and libraries are filtered out; the scope is `contracts/src`.

The contracts are frozen since the mainnet deployment. A real high-severity issue found later cannot be patched in place; it would need a new factory (see `SECURITY.md`).

## Excluded detectors and lints

<one "### <name>" section per excluded detector or lint, in the format above; or the single line "None.">

## Full Slither report

<the output of the command below, pasted as is>
````

Hai dòng trong ngoặc nhọn ở trên là chỗ người thực thi thay bằng kết quả thật: phần đầu là các mục theo mẫu (hoặc đúng dòng `None.`), phần sau là output của lệnh:

Run: `cd contracts && "$TEMP/slither-venv/Scripts/slither" . --ignore-compile --config-file slither.config.json --checklist 2>/dev/null`
Expected: in ra một checklist Markdown (`**THIS CHECKLIST IS NOT COMPLETE**…` rồi từng detector). Dán nguyên văn dưới `## Full Slither report`.

Chạy lại hai lệnh ở Step 2.
Expected: cả hai thoát 0.

- [ ] **Step 4 (Phần A): Commit**

```bash
git add contracts/slither.config.json contracts/STATIC-ANALYSIS.md contracts/foundry.toml
git commit -m "chore(contracts): Slither and forge lint triage before the mainnet deployment" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Nếu `contracts/foundry.toml` không đổi (không có lint nào bị loại), bỏ nó khỏi `git add`.

- [ ] **Step 5 (Phần B): Viết test thất bại**

`scripts/test/codehash.test.ts`:

```ts
import { keccak256 } from 'viem';
import { describe, expect, it } from 'vitest';
import { compareCodehash } from '../ops/check-codehash';

const CODE = '0x6080604052348015600e575f80fd5b50';
const artifact = { deployedBytecode: { object: CODE } };

describe('compareCodehash', () => {
  it('matches when the build from source has the deployed code hash', () => {
    expect(compareCodehash(artifact, { vaultImplCodehash: keccak256(CODE) })).toEqual({
      status: 'match',
      message: `vault implementation code hash ${keccak256(CODE)} matches deployments/xlayer.json`,
    });
  });

  it('accepts the hash in any letter case', () => {
    expect(compareCodehash(artifact, { vaultImplCodehash: keccak256(CODE).toUpperCase().replace('0X', '0x') }).status).toBe('match');
  });

  it('reports both hashes on a mismatch', () => {
    const r = compareCodehash(artifact, { vaultImplCodehash: `0x${'11'.repeat(32)}` });
    expect(r.status).toBe('mismatch');
    expect(r.message).toContain(keccak256(CODE));
    expect(r.message).toContain(`0x${'11'.repeat(32)}`);
  });

  it('skips when there is no mainnet deployment yet', () => {
    expect(compareCodehash(artifact, null)).toEqual({ status: 'skipped', message: 'deployments/xlayer.json not found; nothing to compare' });
  });

  it('refuses an artifact without runtime code or with unlinked libraries', () => {
    expect(() => compareCodehash({}, { vaultImplCodehash: keccak256(CODE) })).toThrow('no deployedBytecode');
    expect(() =>
      compareCodehash({ deployedBytecode: { object: '0x73__$abcdef$__' } }, { vaultImplCodehash: keccak256(CODE) }),
    ).toThrow('unlinked library');
  });
});
```

`scripts/test/static-analysis.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readWorkflows } from '../ops/workflows';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('static analysis', () => {
  const config = JSON.parse(read('contracts/slither.config.json')) as { filter_paths: string; detectors_to_exclude: string };
  const report = read('contracts/STATIC-ANALYSIS.md');
  const headings = new Set([...report.matchAll(/^### (\S+)\s*$/gm)].map((m) => m[1]));

  it('analyses only the contract sources', () => {
    for (const dir of ['lib/', 'test/', 'script/']) expect(config.filter_paths).toContain(dir);
  });

  it('explains every excluded Slither detector and every excluded lint', () => {
    const detectors = config.detectors_to_exclude.split(',').filter(Boolean);
    const lints = [...read('contracts/foundry.toml').matchAll(/exclude_lints\s*=\s*\[([^\]]*)\]/g)].flatMap((m) =>
      [...m[1].matchAll(/"([^"]+)"/g)].map((q) => q[1]),
    );
    for (const name of [...detectors, ...lints]) expect(headings.has(name), name).toBe(true);
    if (detectors.length + lints.length === 0) expect(report).toMatch(/## Excluded detectors and lints\s+None\./);
  });

  it('runs both tools and the code hash check in CI, failing on high findings', () => {
    const ci = readWorkflows(join(ROOT, '.github', 'workflows')).find((f) => f.name === 'ci.yml');
    const steps = ci?.doc.jobs?.['contracts-static']?.steps ?? [];
    const slither = steps.find((s) => s.uses?.startsWith('crytic/slither-action@'));
    expect(slither?.with).toMatchObject({
      target: 'contracts',
      'ignore-compile': true,
      'slither-version': '0.11.6',
      'slither-config': 'contracts/slither.config.json',
      'fail-on': 'high',
    });
    const runs = steps.map((s) => s.run ?? '').join('\n');
    expect(runs).toContain('forge build --build-info --skip test --skip script');
    expect(runs).toContain('forge lint --severity high --deny warnings');
    expect(runs).toContain('npm run codehash:check');
  });
});
```

- [ ] **Step 6 (Phần B): Chạy test để thấy thất bại**

Run: `npm run test:scripts -- codehash static-analysis`
Expected: FAIL: `codehash` vì không tìm thấy `../ops/check-codehash`; `static-analysis` ở test CI vì `ci.yml` chưa có job `contracts-static`.

- [ ] **Step 7 (Phần B): Viết script, thêm job CI**

`scripts/ops/check-codehash.ts`:

```ts
// Rebuilds the vault implementation's code hash from source and compares it with the mainnet deployment (spec §5.4 step 4).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Hex, keccak256 } from 'viem';

export interface CodehashResult {
  status: 'match' | 'mismatch' | 'skipped';
  message: string;
}

export function compareCodehash(artifact: unknown, deployment: unknown | null): CodehashResult {
  if (deployment === null) return { status: 'skipped', message: 'deployments/xlayer.json not found; nothing to compare' };
  const code = (artifact as { deployedBytecode?: { object?: string } }).deployedBytecode?.object;
  if (typeof code !== 'string' || !/^0x[0-9a-fA-F_$]*$/.test(code) || code.length <= 2) {
    throw new Error('artifact has no deployedBytecode; run forge build first');
  }
  if (code.includes('__$')) throw new Error('deployedBytecode has an unlinked library placeholder');
  const built = keccak256(code as Hex);
  const expected = String((deployment as { vaultImplCodehash?: unknown }).vaultImplCodehash ?? '');
  if (built.toLowerCase() === expected.toLowerCase()) {
    return { status: 'match', message: `vault implementation code hash ${built} matches deployments/xlayer.json` };
  }
  return {
    status: 'mismatch',
    message: `vault implementation code hash ${built} (built from source) differs from ${expected} (deployments/xlayer.json)`,
  };
}

function main(): void {
  const root = process.cwd();
  const artifactPath = join(root, 'contracts', 'out', 'AtropyleVault.sol', 'AtropyleVault.json');
  const deploymentPath = join(root, 'deployments', 'xlayer.json');
  const deployment = existsSync(deploymentPath) ? JSON.parse(readFileSync(deploymentPath, 'utf8')) : null;
  const artifact = deployment === null ? {} : JSON.parse(readFileSync(artifactPath, 'utf8'));
  const result = compareCodehash(artifact, deployment);
  console.log(result.message);
  if (result.status === 'mismatch') process.exitCode = 1;
}

if (process.argv[1]?.endsWith('check-codehash.ts')) main();
```

Thêm vào `scripts` của `package.json` gốc:

```json
"codehash:check": "tsx scripts/ops/check-codehash.ts"
```

Nếu `package.json` gốc chưa có `viem` trong `devDependencies` (script ở gốc import viem), chạy `npm install -D -E viem@2.58.0` (cùng bản Plan 2 đã ghim).

Thêm vào cuối khối `jobs:` của `.github/workflows/ci.yml`:

```yaml
  contracts-static:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          submodules: recursive
          persist-credentials: false
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: v1.9.0
      - run: forge build --build-info --skip test --skip script
        working-directory: contracts
      - run: forge lint --severity high --deny warnings
        working-directory: contracts
      - uses: crytic/slither-action@v0.4.2
        with:
          target: contracts
          ignore-compile: true
          slither-version: 0.11.6
          slither-config: contracts/slither.config.json
          fail-on: high
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run codehash:check
```

- [ ] **Step 8 (Phần B): Chạy test để thấy qua, rồi chạy kiểm code hash thật**

Run: `npm run test:scripts -- codehash static-analysis workflows`
Expected: PASS 5 test của `codehash`, 3 test của `static-analysis`, và 8 test của `workflows` (job mới vẫn theo luật chung).

Run: `cd contracts && forge build --build-info --skip test --skip script && cd .. && npm run codehash:check`
Expected (sau 26/11): `vault implementation code hash 0x… matches deployments/xlayer.json`, thoát 0.

Nếu ra `mismatch`: không sửa `deployments/xlayer.json` và không sửa contract. Xem Plan 1 Task 14 đã deploy bằng profile nào (`FOUNDRY_PROFILE`) và cờ build nào. Nếu deploy dùng profile khác `default`, đặt đúng profile đó cho bước `forge build` của job (`env: FOUNDRY_PROFILE: <tên>`) và chạy lại. Nếu vẫn lệch: dừng, báo người dùng, vì code on-chain không khớp mã nguồn đã công bố.

Run: `npx biome check --write scripts/ops/check-codehash.ts scripts/test/codehash.test.ts scripts/test/static-analysis.test.ts && npx biome ci . && npm run typecheck:scripts`
Expected: thoát 0.

- [ ] **Step 9 (Phần B): Commit**

```bash
git add scripts/ops/check-codehash.ts scripts/test/codehash.test.ts scripts/test/static-analysis.test.ts .github/workflows/ci.yml package.json
git commit -m "ci(contracts): static analysis job and a code hash check against the mainnet deployment" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Nếu Step 7 đã cài `viem` ở gốc, thêm `package-lock.json` vào `git add`.

- [ ] **Step 10 (Phần B): `[USER]` Kiểm job trên GitHub**

```bash
RUN=$(gh run list --repo duongnq2798/atropyle --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$RUN" --repo duongnq2798/atropyle --json conclusion --jq .conclusion
gh run view "$RUN" --repo duongnq2798/atropyle --log | grep 'matches deployments/xlayer.json'
```

Expected: `success`, rồi một dòng log chứa `matches deployments/xlayer.json`.

### Task 9: Benchmark `verifyPolicy` trên Node và Chromium, ngân sách 30%

**Files:**
- Create: `scripts/bench/bundle.ts`, `scripts/bench/calibrate.ts`, `scripts/bench/budget.ts`, `scripts/bench/browser.ts`, `scripts/bench/browser-entry.ts`, `scripts/bench/run.ts`
- Create (sinh bằng `--record`): `bench/verify-policy.budget.json`
- Modify: `package.json` (gốc: script `bench`, devDependency `playwright`, `esbuild`), `package-lock.json`, `.github/workflows/ci.yml` (job `bench`)
- Test: `scripts/test/bench.test.ts`

**Interfaces:**
- Consumes:
  - Plan 1: `buildAll()`, `deployedNetlists(cpu, ids)` của `@atropyle/circuits`.
  - Plan 2: `evaluatePolicyBundle(b: PolicyBundle, o?: VerifyPolicyOptions): Promise<PolicyVerification>`, `PolicyBundle` (`packages/sdk/src/verify/index.ts`). Bundle dựng y như test `verify-policy` của Plan 2.
  - Task 1: `npm run test:scripts`. Task 7: luật chung của workflow.
- Produces:
  - `scripts/bench/bundle.ts`: `sourceBundle(): PolicyBundle`.
  - `scripts/bench/calibrate.ts`: `CALIBRATION_ROUNDS = 400_000_000`, `calibrationWork(rounds: number): number`, `measure(b: PolicyBundle, o?: { blocks?: number; rounds?: number }): Promise<Measurement>`.
  - `scripts/bench/budget.ts`: `interface Measurement { verifyMs: number; calibrationMs: number }`, `type BenchEnv = 'node' | 'chromium'`, `interface EnvResult { ratio: number; verifyMs: number; calibrationMs: number }`, `interface Budget { schemaVersion: 1; tolerance: number; node: EnvResult; chromium: EnvResult; recordedOn: string }`, `TOLERANCE = 0.3`, `summarize(runs)`, `makeBudget(results, recordedOn)`, `parseBudget(text)`, `interface BudgetCheck { env: BenchEnv; ok: boolean; limit: number; message: string }`, `checkBudget(b, env, r)`.
  - `scripts/bench/browser.ts`: `browserBundle(): Promise<string>`, `measureInChromium(code: string, runs: number): Promise<{ version: string; runs: Measurement[] }>`.
  - `npm run bench [-- --record]`; job CI `bench`.

Cách đo (Quyết định 26): mỗi lần đo chạy một vòng hiệu chuẩn cố định (`calibrationWork`, phép bit trên `Uint32Array`, cùng kiểu việc với mô phỏng netlist) rồi chạy `evaluatePolicyBundle` đủ 2^26 tổ hợp. Mỗi môi trường đo 3 lần, lấy giá trị nhỏ nhất của mỗi bên. So **tỉ lệ** `verifyMs / calibrationMs`, nên kết quả gần như không phụ thuộc tốc độ máy. CI báo lỗi khi tỉ lệ lớn hơn ngân sách quá 30%. Bản đo cũng kiểm kết quả: `ok` phải là `true` và `combos` phải là 2^26, nếu không lệnh dừng.

- [ ] **Step 1: Cài gói**

Run: `npm install -D -E playwright@1.65.1 esbuild@0.28.2 && npx playwright install chromium`
Expected: thoát 0; `package.json` gốc có hai gói với phiên bản chính xác; Chromium của Playwright được tải về thư mục cache của Playwright (đây là công cụ phát triển, không phải tài nguyên của web hay docs).

- [ ] **Step 2: Viết test thất bại**

`scripts/test/bench.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { browserBundle } from '../bench/browser';
import { checkBudget, makeBudget, parseBudget, summarize, TOLERANCE } from '../bench/budget';
import { sourceBundle } from '../bench/bundle';
import { CALIBRATION_ROUNDS, calibrationWork, measure } from '../bench/calibrate';

describe('calibration', () => {
  it('does the same work everywhere', () => {
    expect(calibrationWork(1000)).toBe(115878);
    expect(calibrationWork(1_000_000)).toBe(125901705);
    expect(CALIBRATION_ROUNDS).toBe(400_000_000);
  });
});

describe('summarize and budget', () => {
  const runs = [
    { verifyMs: 100, calibrationMs: 10 },
    { verifyMs: 90, calibrationMs: 12 },
    { verifyMs: 95, calibrationMs: 11 },
  ];

  it('takes the fastest run of each side', () => {
    expect(summarize(runs)).toEqual({ ratio: 9, verifyMs: 90, calibrationMs: 10 });
    expect(() => summarize([])).toThrow('no runs');
  });

  it('allows 30% over the recorded ratio, not more', () => {
    const budget = makeBudget({ node: summarize(runs), chromium: summarize(runs) }, 'test machine');
    expect(budget).toMatchObject({ schemaVersion: 1, tolerance: TOLERANCE, recordedOn: 'test machine' });
    expect(checkBudget(budget, 'node', { ratio: 11.7, verifyMs: 117, calibrationMs: 10 })).toMatchObject({ ok: true, limit: 11.7 });
    const over = checkBudget(budget, 'chromium', { ratio: 11.71, verifyMs: 117.1, calibrationMs: 10 });
    expect(over.ok).toBe(false);
    expect(over.message).toContain('chromium');
    expect(over.message).toContain('30%');
  });

  it('rejects a budget file that is incomplete', () => {
    const good = makeBudget({ node: summarize(runs), chromium: summarize(runs) }, 'x');
    expect(parseBudget(JSON.stringify(good))).toEqual(good);
    expect(() => parseBudget(JSON.stringify({ ...good, schemaVersion: 2 }))).toThrow('schemaVersion');
    expect(() => parseBudget(JSON.stringify({ ...good, chromium: { ratio: 0 } }))).toThrow('chromium');
  });
});

describe('the measured work', () => {
  it('verifies the netlists built from source', async () => {
    const m = await measure(sourceBundle(), { blocks: 64, rounds: 1000 });
    expect(m.verifyMs).toBeGreaterThan(0);
    expect(m.calibrationMs).toBeGreaterThanOrEqual(0);
  });

  it('builds one browser script with no Node imports', async () => {
    const code = await browserBundle();
    expect(code).toContain('atropyleBench');
    expect(code).not.toMatch(/require\(["']node:/);
  });
});
```

- [ ] **Step 3: Chạy test để thấy thất bại**

Run: `npm run build -w circuits && npm run test:scripts -- bench`
Expected: FAIL vì không tìm thấy `../bench/browser`.

- [ ] **Step 4: Viết mã**

`scripts/bench/bundle.ts`:

```ts
// The policy bundle built from this repository's source, exactly as Plan 2's verify-policy test builds it.
import { buildAll, deployedNetlists } from '@atropyle/circuits';
import { bytesToHex, getAddress, keccak256 } from 'viem';
import type { PolicyBundle } from '../../packages/sdk/src/verify/index';

const CPU = getAddress('0x1111111111111111111111111111111111111111');
const FACTORY = getAddress('0x3333333333333333333333333333333333333333');
const IDS = [5n, 6n] as const;
const POLICY_ID = 7n;

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
    cpuCheck: null,
  };
}
```

`scripts/bench/calibrate.ts`:

```ts
// A fixed amount of integer and typed-array work, timed next to verifyPolicy so that the budget is a ratio.
import { evaluatePolicyBundle, type PolicyBundle } from '../../packages/sdk/src/verify/index';
import type { Measurement } from './budget';

export const CALIBRATION_ROUNDS = 400_000_000;
const FULL_COMBOS = 2 ** 26;

export function calibrationWork(rounds: number): number {
  const mem = new Uint32Array(4096);
  let x = 0x9e3779b9 | 0;
  let acc = 0;
  for (let i = 0; i < rounds; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    const j = x & 4095;
    mem[j] = (mem[j] ^ x ^ (mem[(j + 1) & 4095] >>> 1)) >>> 0;
    acc = (acc + (mem[j] & 0xff)) | 0;
  }
  return acc >>> 0;
}

export async function measure(b: PolicyBundle, o: { blocks?: number; rounds?: number } = {}): Promise<Measurement> {
  const t0 = performance.now();
  const checksum = calibrationWork(o.rounds ?? CALIBRATION_ROUNDS);
  const calibrationMs = performance.now() - t0;
  const t1 = performance.now();
  const result = await evaluatePolicyBundle(b, { blocks: o.blocks });
  const verifyMs = performance.now() - t1;
  if (!result.ok) throw new Error(`verifyPolicy failed during the benchmark: ${result.issues.join('; ')}`);
  if (o.blocks === undefined && result.combos !== FULL_COMBOS) {
    throw new Error(`verifyPolicy checked ${result.combos} combinations, expected ${FULL_COMBOS}`);
  }
  if (checksum === 0xffffffff) throw new Error('unreachable'); // keeps the calibration result alive
  return { verifyMs, calibrationMs };
}
```

`scripts/bench/budget.ts`:

```ts
// Pure budget logic: the benchmark compares verifyMs / calibrationMs with a recorded ratio.
export interface Measurement {
  verifyMs: number;
  calibrationMs: number;
}

export type BenchEnv = 'node' | 'chromium';

export interface EnvResult {
  ratio: number;
  verifyMs: number;
  calibrationMs: number;
}

export interface Budget {
  schemaVersion: 1;
  tolerance: number;
  node: EnvResult;
  chromium: EnvResult;
  recordedOn: string;
}

export interface BudgetCheck {
  env: BenchEnv;
  ok: boolean;
  limit: number;
  message: string;
}

export const TOLERANCE = 0.3;
const round = (n: number, digits: number) => Number(n.toFixed(digits));

export function summarize(runs: readonly Measurement[]): EnvResult {
  if (runs.length === 0) throw new Error('no runs to summarize');
  const verifyMs = Math.min(...runs.map((r) => r.verifyMs));
  const calibrationMs = Math.min(...runs.map((r) => r.calibrationMs));
  return { ratio: round(verifyMs / calibrationMs, 3), verifyMs: round(verifyMs, 1), calibrationMs: round(calibrationMs, 1) };
}

export function makeBudget(results: Record<BenchEnv, EnvResult>, recordedOn: string): Budget {
  return { schemaVersion: 1, tolerance: TOLERANCE, node: results.node, chromium: results.chromium, recordedOn };
}

export function parseBudget(text: string): Budget {
  const b = JSON.parse(text) as Partial<Budget>;
  if (b.schemaVersion !== 1) throw new Error('bench budget: schemaVersion must be 1');
  if (typeof b.tolerance !== 'number' || b.tolerance <= 0) throw new Error('bench budget: tolerance must be a positive number');
  for (const env of ['node', 'chromium'] as const) {
    const r = b[env];
    if (!r || !(r.ratio > 0) || !(r.verifyMs > 0) || !(r.calibrationMs > 0)) {
      throw new Error(`bench budget: ${env} needs positive ratio, verifyMs and calibrationMs`);
    }
  }
  if (typeof b.recordedOn !== 'string') throw new Error('bench budget: recordedOn must be a string');
  return b as Budget;
}

export function checkBudget(b: Budget, env: BenchEnv, r: EnvResult): BudgetCheck {
  const limit = round(b[env].ratio * (1 + b.tolerance), 3);
  const ok = r.ratio <= limit;
  const pct = Math.round(b.tolerance * 100);
  return {
    env,
    ok,
    limit,
    message:
      `${env}: ratio ${r.ratio} (verify ${r.verifyMs} ms / calibration ${r.calibrationMs} ms), ` +
      `budget ${b[env].ratio} + ${pct}% = ${limit}: ${ok ? 'ok' : 'TOO SLOW'}`,
  };
}
```

`scripts/bench/browser-entry.ts`:

```ts
// Bundled into one IIFE and loaded into Chromium; exposes the same measurement as Node.
import { sourceBundle } from './bundle';
import { measure } from './calibrate';

(globalThis as { atropyleBench?: unknown }).atropyleBench = { run: () => measure(sourceBundle()) };
```

`scripts/bench/browser.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import type { Measurement } from './budget';

export async function browserBundle(): Promise<string> {
  const out = await build({
    entryPoints: [fileURLToPath(new URL('./browser-entry.ts', import.meta.url))],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
    logLevel: 'silent',
  });
  return out.outputFiles[0].text;
}

export async function measureInChromium(code: string, runs: number): Promise<{ version: string; runs: Measurement[] }> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.addScriptTag({ content: code });
    const results: Measurement[] = [];
    for (let i = 0; i < runs; i++) {
      results.push(
        await page.evaluate(() =>
          (globalThis as unknown as { atropyleBench: { run(): Promise<{ verifyMs: number; calibrationMs: number }> } }).atropyleBench.run(),
        ),
      );
    }
    return { version: browser.version(), runs: results };
  } finally {
    await browser.close();
  }
}
```

`scripts/bench/run.ts`:

```ts
// npm run bench [-- --record]: measures verifyPolicy (2^26 combinations) on Node and Chromium.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, platform } from 'node:os';
import { browserBundle, measureInChromium } from './browser';
import { type Measurement, checkBudget, makeBudget, parseBudget, summarize } from './budget';
import { sourceBundle } from './bundle';
import { measure } from './calibrate';

const BUDGET_FILE = 'bench/verify-policy.budget.json';
const RUNS = 3;

async function main(): Promise<void> {
  const record = process.argv.includes('--record');
  const nodeRuns: Measurement[] = [];
  for (let i = 0; i < RUNS; i++) nodeRuns.push(await measure(sourceBundle()));
  const chromium = await measureInChromium(await browserBundle(), RUNS);
  const results = { node: summarize(nodeRuns), chromium: summarize(chromium.runs) };
  const measured = makeBudget(results, `${platform()} ${arch()}, Node ${process.version}, Chromium ${chromium.version}`);

  if (record) {
    writeFileSync(BUDGET_FILE, `${JSON.stringify(measured, null, 2)}\n`);
    console.log(`recorded ${BUDGET_FILE}: node ${results.node.ratio}, chromium ${results.chromium.ratio}`);
    return;
  }
  if (!existsSync(BUDGET_FILE)) {
    console.error(`${BUDGET_FILE} is missing; run npm run bench -- --record once and commit the file`);
    process.exitCode = 1;
    return;
  }
  const budget = parseBudget(readFileSync(BUDGET_FILE, 'utf8'));
  const checks = (['node', 'chromium'] as const).map((env) => checkBudget(budget, env, results[env]));
  for (const c of checks) console.log(c.message);
  console.log(`measured on this machine (to record, use --record):\n${JSON.stringify(measured, null, 2)}`);
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}

await main();
```

Thêm vào `scripts` của `package.json` gốc:

```json
"bench": "tsx scripts/bench/run.ts"
```

- [ ] **Step 5: Chạy test để thấy qua**

Run: `npm run build -w circuits && npm run test:scripts -- bench`
Expected: PASS 6 test.

Nếu `builds one browser script` báo lỗi esbuild không resolve được một module `node:` từ SDK: mã verify của SDK phải chạy được trong trình duyệt (Plan 4 cũng bundle nó vào Web Worker), nên đây là lỗi thật. Báo người điều phối kèm tên module, không thêm `external` để che lỗi.

- [ ] **Step 6: Ghi ngân sách, rồi kiểm lại**

Run: `npm run bench -- --record`
Expected: dòng `recorded bench/verify-policy.budget.json: node <tỉ lệ>, chromium <tỉ lệ>`; file có `schemaVersion: 1`, `tolerance: 0.3`. Lệnh có thể mất vài phút (6 lần đủ 2^26).

Run: `npm run bench`
Expected: hai dòng `node: … : ok` và `chromium: … : ok`, thoát 0.

Ghi vào message commit của bước sau thời gian `verifyMs` của Node và Chromium: đây là số thật cho phần "trong khoảng một phút" ở docs và video (Task 17 dùng lại).

- [ ] **Step 7: Thêm job CI**

Thêm vào cuối khối `jobs:` của `.github/workflows/ci.yml`:

```yaml
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build -w circuits
      - run: npx playwright install --with-deps chromium
      - run: npm run bench
```

Run: `npm run test:scripts -- workflows && npx biome check --write scripts/bench scripts/test/bench.test.ts && npx biome ci . && npm run typecheck:scripts`
Expected: PASS 8 test của `workflows`; biome và `tsc` thoát 0.

- [ ] **Step 8: Commit**

```bash
git add scripts/bench/bundle.ts scripts/bench/calibrate.ts scripts/bench/budget.ts scripts/bench/browser.ts scripts/bench/browser-entry.ts scripts/bench/run.ts scripts/test/bench.test.ts bench/verify-policy.budget.json package.json package-lock.json .github/workflows/ci.yml
git commit -m "perf(bench): verifyPolicy benchmark on Node and Chromium with a 30% ratio budget" -m "Node <verifyMs> ms, Chromium <verifyMs> ms for 2^26 combinations on the recording machine." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Thay hai `<verifyMs>` trong message bằng số `verifyMs` thật trong `bench/verify-policy.budget.json`.

- [ ] **Step 9: Lần chạy CI đầu tiên**

Sau khi push, xem job `bench`. Nếu nó đỏ chỉ vì tỉ lệ trên runner khác máy ghi (cả hai môi trường cùng lệch một chiều, kết quả verify vẫn `ok`): chép khối JSON mà job in sau dòng `measured on this machine` vào `bench/verify-policy.budget.json`, rồi commit **đúng một lần**:

```bash
git add bench/verify-policy.budget.json
git commit -m "perf(bench): record the verifyPolicy budget on the CI runner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Từ đó, mỗi lần job đỏ là một lần chậm thật: tìm commit gây chậm, không ghi lại ngân sách.

### Task 10: `npm run traction` → `TRACTION.md`, đếm từ chain và tự kiểm lại được

**Files:**
- Create: `scripts/traction.ts`, `scripts/traction/render.ts`, `scripts/traction/update.ts`
- Create (sinh bằng lệnh, commit trước khi nộp): `TRACTION.md`, `traction/cursor.json`
- Modify: `package.json` (gốc, script `traction`), `.github/workflows/ci.yml` (job `scripts` cần Foundry cho test trên devnet)
- Test: `scripts/test/traction.test.ts`, `scripts/test/traction.devnet.test.ts`

**Interfaces:**
- Consumes:
  - Plan 2: `createAtropyle`, `parseDeployment`, `stringify`, `sameAddress`, `Stats`, `StatsCursor`, `AtropyleClient` (`deployment`, `publicClient`), và **`AtropyleClient.stats(o?: { fromBlock?: bigint; toBlock?: bigint; resume?: StatsCursor; onProgress?(done: number, total: number): void }): Promise<Stats>`**. Trường `toBlock` là **Plan 2 gap**: `readStats` của Plan 2 đã nhận `toBlock`, nhưng kiểu của `AtropyleClient.stats` chưa khai báo nó (Plan 2, dòng `stats(o?: { fromBlock?: bigint; resume?: StatsCursor; … })`). Chỉ cần thêm `toBlock?: bigint` vào kiểu; phần chạy không đổi.
  - Plan 2 Task 6 và 11: `startAnvil`, `deployLocal` (`scripts/lib/anvil.ts`), `seedDevnet` → `SeededVaults { simple; guarded; grace }` (`scripts/lib/seed.ts`).
  - Task 1: `npm run test:scripts`.
- Produces:
  - `scripts/traction/render.ts`:
    - `interface TractionState { schemaVersion: 1; chainId: number; factory: Address; cursor: StatsCursor }`
    - `stateToJson(s: TractionState): string`, `stateFromJson(text: string): TractionState`
    - `interface RenderOptions { chainId: number; factory: Address; explorerUrl: string | null; blockTime: Date }`
    - `renderTraction(stats: Stats, o: RenderOptions): string`
    - `compareCursors(saved: StatsCursor, fresh: StatsCursor): string[]`
  - `scripts/traction/update.ts`:
    - `interface TractionPaths { cursorFile: string; reportFile: string }`, `DEFAULT_STEP = 50_000n`
    - `updateTraction(atro: AtropyleClient, paths: TractionPaths, o?: { step?: bigint; log?(line: string): void }): Promise<Stats>`
    - `verifyTraction(atro: AtropyleClient, paths: TractionPaths, o?: { log?(line: string): void }): Promise<string[]>`
  - `npm run traction [-- --verify] [-- --deployment <file>] [-- --out <dir>]`. Task 11 (README) và Task 17 (checklist nộp bài) dùng lệnh này.

Cách làm (Quyết định 27):
- Đếm theo từng đoạn `DEFAULT_STEP` block, mỗi đoạn là một lần `atro.stats({ resume, toBlock })`, và ghi `traction/cursor.json` sau **mỗi** đoạn. Trên X Layer `eth_getLogs` chỉ nhận 100 block, nên lần đầu cần hàng nghìn lần gọi; bị ngắt giữa chừng thì lần sau chạy tiếp từ cursor.
- Mốc thời gian trong `TRACTION.md` là timestamp của block cuối, không dùng đồng hồ máy, nên chạy lại ở cùng block cho cùng một file.
- `TRACTION.md` liệt kê địa chỉ vault (link explorer), **không** liệt kê owner. `traction/cursor.json` có địa chỉ owner, vì cần chúng để đếm số owner khác nhau khi chạy tiếp; dữ liệu này vốn công khai trên chain.
- `--verify` đếm lại một lần từ block deploy của factory tới đúng `toBlock` đã lưu, không dùng cursor, rồi so từng con số, danh sách vault, và nội dung `TRACTION.md`.

- [ ] **Step 1: Viết test thất bại cho phần thuần**

`scripts/test/traction.test.ts`:

```ts
import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import type { Stats, StatsCursor } from '../../packages/sdk/src/index';
import { compareCursors, renderTraction, stateFromJson, stateToJson, type TractionState } from '../traction/render';

const V1 = getAddress('0x1000000000000000000000000000000000000001');
const V2 = getAddress('0x1000000000000000000000000000000000000002');
const OWNER = getAddress('0x2000000000000000000000000000000000000002');
const FACTORY = getAddress('0x3000000000000000000000000000000000000003');

const cursor: StatsCursor = {
  toBlock: 1_234_567n,
  vaults: [
    { vault: V1, owner: OWNER, drill: true },
    { vault: V2, owner: OWNER, drill: false },
  ],
  aliveEvents: 7,
  alarms: 1,
  releases: 1,
  distributions: 1,
};
const stats: Stats = {
  fromBlock: 1_000_000n,
  toBlock: 1_234_567n,
  vaults: { total: 2, drill: 1, paid: 1 },
  owners: 1,
  checkIns: 5,
  alarms: 1,
  releases: 1,
  distributions: 1,
  cursor,
};
const opts = { chainId: 196, factory: FACTORY, explorerUrl: 'https://www.oklink.com/xlayer', blockTime: new Date('2026-12-05T10:00:00Z') };

describe('traction state', () => {
  it('round-trips the cursor with bigints as decimal strings', () => {
    const state: TractionState = { schemaVersion: 1, chainId: 196, factory: FACTORY, cursor };
    const text = stateToJson(state);
    expect(text).toContain('"toBlock": "1234567"');
    expect(text.endsWith('\n')).toBe(true);
    expect(stateFromJson(text)).toEqual(state);
  });

  it('rejects a cursor file it does not understand', () => {
    expect(() => stateFromJson('{"schemaVersion":2}')).toThrow('schemaVersion');
    expect(() => stateFromJson('{"schemaVersion":1,"chainId":196,"factory":"0x","cursor":{}}')).toThrow('malformed');
  });
});

describe('renderTraction', () => {
  const md = renderTraction(stats, opts);

  it('shows every count, the block range and the block time', () => {
    for (const line of ['| Vaults created | 2 |', '| Paid vaults | 1 |', '| Drill vaults | 1 |', '| Check-ins and other proofs of life | 5 |']) {
      expect(md).toContain(line);
    }
    expect(md).toContain('from block 1,000,000 to block 1,234,567');
    expect(md).toContain('2026-12-05T10:00:00.000Z');
  });

  it('links each vault to the explorer and never lists owners', () => {
    expect(md).toContain(`| 1 | [\`${V1}\`](https://www.oklink.com/xlayer/address/${V1}) | Drill |`);
    expect(md).toContain(`| 2 | [\`${V2}\`](https://www.oklink.com/xlayer/address/${V2}) | Paid |`);
    expect(md.toLowerCase()).not.toContain(OWNER.toLowerCase());
  });

  it('tells readers how to check the numbers at the same block', () => {
    expect(md).toContain('npm run traction -- --verify');
    expect(md).toContain('.stats({ toBlock: 1234567n })');
  });

  it('is the same text for the same input', () => {
    expect(renderTraction(stats, opts)).toBe(md);
  });
});

describe('compareCursors', () => {
  it('finds no difference between equal counts, in any vault order', () => {
    expect(compareCursors(cursor, { ...cursor, vaults: [...cursor.vaults].reverse() })).toEqual([]);
  });

  it('names each count and each vault that differs', () => {
    const fresh = { ...cursor, alarms: 2, vaults: [cursor.vaults[0]] };
    expect(compareCursors(cursor, fresh)).toEqual(['alarms: saved 1, counted 2', `vault ${V2} is in the saved cursor only`]);
  });
});
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `npm run build -w circuits && npm run test:scripts -- traction.test`
Expected: FAIL vì không tìm thấy `../traction/render`.

- [ ] **Step 3: Viết `scripts/traction/render.ts`**

```ts
// Pure parts of npm run traction: the saved cursor, TRACTION.md, and the comparison used by --verify.
import type { Address } from 'viem';
import { type Stats, type StatsCursor, stringify } from '../../packages/sdk/src/index';

export interface TractionState {
  schemaVersion: 1;
  chainId: number;
  factory: Address;
  cursor: StatsCursor;
}

export interface RenderOptions {
  chainId: number;
  factory: Address;
  explorerUrl: string | null;
  blockTime: Date;
}

export function stateToJson(s: TractionState): string {
  return `${stringify(s, 2)}\n`;
}

export function stateFromJson(text: string): TractionState {
  const raw = JSON.parse(text) as Record<string, unknown>;
  if (raw.schemaVersion !== 1) throw new Error('traction/cursor.json: schemaVersion must be 1');
  const c = raw.cursor as Record<string, unknown> | undefined;
  if (!c || typeof c.toBlock !== 'string' || !Array.isArray(c.vaults)) throw new Error('traction/cursor.json: the cursor is malformed');
  return {
    schemaVersion: 1,
    chainId: Number(raw.chainId),
    factory: raw.factory as Address,
    cursor: {
      toBlock: BigInt(c.toBlock),
      vaults: (c.vaults as { vault: Address; owner: Address; drill: unknown }[]).map((v) => ({
        vault: v.vault,
        owner: v.owner,
        drill: v.drill === true,
      })),
      aliveEvents: Number(c.aliveEvents),
      alarms: Number(c.alarms),
      releases: Number(c.releases),
      distributions: Number(c.distributions),
    },
  };
}

const n = (x: number | bigint): string => x.toLocaleString('en-US');

export function renderTraction(stats: Stats, o: RenderOptions): string {
  const link = (a: string) => (o.explorerUrl ? `[\`${a}\`](${o.explorerUrl}/address/${a})` : `\`${a}\``);
  return [
    '# Traction',
    '',
    '<!-- Generated by `npm run traction`. Do not edit by hand. -->',
    '',
    `Counted from Atropyle events on X Layer (chain ${o.chainId}), from block ${n(stats.fromBlock)} to block ${n(stats.toBlock)}. ` +
      `Block ${n(stats.toBlock)} was produced at ${o.blockTime.toISOString()}.`,
    '',
    '| Metric | Count |',
    '|---|---|',
    `| Vaults created | ${n(stats.vaults.total)} |`,
    `| Paid vaults | ${n(stats.vaults.paid)} |`,
    `| Drill vaults | ${n(stats.vaults.drill)} |`,
    `| Distinct owners | ${n(stats.owners)} |`,
    `| Check-ins and other proofs of life | ${n(stats.checkIns)} |`,
    `| Alarms raised | ${n(stats.alarms)} |`,
    `| Releases | ${n(stats.releases)} |`,
    `| Distribution transactions | ${n(stats.distributions)} |`,
    '',
    `Factory: ${link(o.factory)}`,
    '',
    '## Check these numbers yourself',
    '',
    'Every number comes from events that the factory and its vaults emitted on chain. Nothing comes from a server.',
    '',
    '```bash',
    'npm run traction -- --verify',
    '```',
    '',
    `This counts again from the factory's deployment block to block ${n(stats.toBlock)}, without the saved cursor, ` +
      'and fails if any number or any vault differs. With the SDK:',
    '',
    '```js',
    "import { createAtropyle } from '@atropyle/sdk';",
    '',
    `const stats = await createAtropyle({ chain: 'xlayer' }).stats({ toBlock: ${stats.toBlock}n });`,
    '```',
    '',
    `## Vaults (${n(stats.vaults.total)})`,
    '',
    '| # | Vault | Kind |',
    '|---|---|---|',
    ...stats.cursor.vaults.map((v, i) => `| ${i + 1} | ${link(v.vault)} | ${v.drill ? 'Drill' : 'Paid'} |`),
    '',
  ].join('\n');
}

export function compareCursors(saved: StatsCursor, fresh: StatsCursor): string[] {
  const out: string[] = [];
  if (saved.toBlock !== fresh.toBlock) out.push(`toBlock: saved ${saved.toBlock}, counted ${fresh.toBlock}`);
  for (const k of ['aliveEvents', 'alarms', 'releases', 'distributions'] as const) {
    if (saved[k] !== fresh[k]) out.push(`${k}: saved ${saved[k]}, counted ${fresh[k]}`);
  }
  const key = (v: StatsCursor['vaults'][number]) => `${v.vault.toLowerCase()}|${v.owner.toLowerCase()}|${v.drill}`;
  const freshKeys = new Set(fresh.vaults.map(key));
  const savedKeys = new Set(saved.vaults.map(key));
  for (const v of saved.vaults) if (!freshKeys.has(key(v))) out.push(`vault ${v.vault} is in the saved cursor only`);
  for (const v of fresh.vaults) if (!savedKeys.has(key(v))) out.push(`vault ${v.vault} was found on chain but is not in the saved cursor`);
  return out;
}
```

Run: `npm run test:scripts -- traction.test`
Expected: PASS 8 test.

- [ ] **Step 4: Viết test thất bại trên devnet**

`scripts/test/traction.devnet.test.ts`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type AtropyleClient, createAtropyle, parseDeployment } from '../../packages/sdk/src/index';
import { type Anvil, deployLocal, startAnvil } from '../lib/anvil';
import { type SeededVaults, seedDevnet } from '../lib/seed';
import { stateFromJson, stateToJson } from '../traction/render';
import { type TractionPaths, updateTraction, verifyTraction } from '../traction/update';

let anvil: Anvil;
let atro: AtropyleClient;
let seeded: SeededVaults;
let paths: TractionPaths;

beforeAll(async () => {
  anvil = await startAnvil({ port: 8641 });
  const deployment = parseDeployment(await deployLocal(anvil.url));
  seeded = await seedDevnet(anvil.url, deployment);
  atro = createAtropyle({ chain: deployment });
  const dir = mkdtempSync(join(tmpdir(), 'atropyle-traction-'));
  paths = { cursorFile: join(dir, 'cursor.json'), reportFile: join(dir, 'TRACTION.md') };
});

afterAll(async () => {
  await anvil?.stop();
});

describe('npm run traction on the devnet', () => {
  it('counts in small steps exactly what one full count finds', async () => {
    const stepped = await updateTraction(atro, paths, { step: 7n });
    const full = await atro.stats({ toBlock: stepped.toBlock });
    expect(stepped.cursor).toEqual(full.cursor);
    expect(stepped.vaults.total).toBe(3);
    const md = readFileSync(paths.reportFile, 'utf8');
    for (const v of [seeded.simple, seeded.guarded, seeded.grace]) expect(md).toContain(v);
  });

  it('writes the same files again when there are no new blocks', async () => {
    const before = [readFileSync(paths.cursorFile, 'utf8'), readFileSync(paths.reportFile, 'utf8')];
    await updateTraction(atro, paths, { step: 7n });
    expect([readFileSync(paths.cursorFile, 'utf8'), readFileSync(paths.reportFile, 'utf8')]).toEqual(before);
  });

  it('--verify agrees with the saved files, and catches a tampered cursor', async () => {
    expect(await verifyTraction(atro, paths)).toEqual([]);
    const state = stateFromJson(readFileSync(paths.cursorFile, 'utf8'));
    writeFileSync(paths.cursorFile, stateToJson({ ...state, cursor: { ...state.cursor, alarms: state.cursor.alarms + 1 } }));
    expect(await verifyTraction(atro, paths)).toContain(
      `alarms: saved ${state.cursor.alarms + 1}, counted ${state.cursor.alarms}`,
    );
  });
});
```

Run: `npm run test:scripts -- traction.devnet`
Expected: FAIL vì không tìm thấy `../traction/update`.

- [ ] **Step 5: Viết `scripts/traction/update.ts` và `scripts/traction.ts`**

`scripts/traction/update.ts`:

```ts
// Reads the chain for npm run traction. Counting is done by the SDK's stats(); this file only steps and saves.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { type AtropyleClient, type Stats, sameAddress } from '../../packages/sdk/src/index';
import { compareCursors, renderTraction, stateFromJson, stateToJson, type TractionState } from './render';

export interface TractionPaths {
  cursorFile: string;
  reportFile: string;
}

export const DEFAULT_STEP = 50_000n;

async function renderFor(atro: AtropyleClient, stats: Stats): Promise<string> {
  const block = await atro.publicClient.getBlock({ blockNumber: stats.toBlock });
  return renderTraction(stats, {
    chainId: atro.deployment.chainId,
    factory: atro.deployment.factory,
    explorerUrl: atro.deployment.explorerUrl,
    blockTime: new Date(Number(block.timestamp) * 1000),
  });
}

function readState(atro: AtropyleClient, file: string): TractionState | null {
  if (!existsSync(file)) return null;
  const state = stateFromJson(readFileSync(file, 'utf8'));
  if (state.chainId !== atro.deployment.chainId || !sameAddress(state.factory, atro.deployment.factory)) {
    throw new Error(`${file} belongs to another deployment; delete it to count from the start`);
  }
  return state;
}

export async function updateTraction(
  atro: AtropyleClient,
  paths: TractionPaths,
  o: { step?: bigint; log?(line: string): void } = {},
): Promise<Stats> {
  const step = o.step ?? DEFAULT_STEP;
  const head = await atro.publicClient.getBlockNumber();
  let state = readState(atro, paths.cursorFile);
  let stats: Stats | null = null;
  while (state === null || state.cursor.toBlock < head) {
    const from = state ? state.cursor.toBlock + 1n : atro.deployment.factoryBlock;
    const toBlock = from + step - 1n < head ? from + step - 1n : head;
    stats = await atro.stats({ resume: state?.cursor, toBlock });
    state = { schemaVersion: 1, chainId: atro.deployment.chainId, factory: atro.deployment.factory, cursor: stats.cursor };
    // Saved after every step, so an interrupted run continues from here.
    writeFileSync(paths.cursorFile, stateToJson(state));
    o.log?.(`counted up to block ${toBlock} of ${head}`);
  }
  // With no new block, stats() only derives the numbers from the cursor.
  stats ??= await atro.stats({ resume: state.cursor, toBlock: state.cursor.toBlock });
  writeFileSync(paths.reportFile, await renderFor(atro, stats));
  return stats;
}

export async function verifyTraction(
  atro: AtropyleClient,
  paths: TractionPaths,
  o: { log?(line: string): void } = {},
): Promise<string[]> {
  const saved = readState(atro, paths.cursorFile);
  if (saved === null) return [`${paths.cursorFile} not found; run npm run traction first`];
  let last = 0;
  const fresh = await atro.stats({
    toBlock: saved.cursor.toBlock,
    onProgress: (done, total) => {
      const pct = Math.floor((done / total) * 100);
      if (pct >= last + 10) {
        last = pct;
        o.log?.(`recounting: ${pct}%`);
      }
    },
  });
  const problems = compareCursors(saved.cursor, fresh.cursor);
  const report = existsSync(paths.reportFile) ? readFileSync(paths.reportFile, 'utf8') : '';
  if (report !== (await renderFor(atro, fresh))) problems.push(`${paths.reportFile} differs from a fresh count; run npm run traction`);
  return problems;
}
```

`scripts/traction.ts`:

```ts
// npm run traction [-- --verify] [-- --deployment <file>] [-- --out <dir>]
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAtropyle, parseDeployment } from '../packages/sdk/src/index';
import { updateTraction, verifyTraction } from './traction/update';

const args = process.argv.slice(2);
const valueOf = (flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const deploymentFile = valueOf('--deployment');
const out = valueOf('--out') ?? '.';
const atro = createAtropyle({
  chain: deploymentFile ? parseDeployment(JSON.parse(readFileSync(deploymentFile, 'utf8'))) : 'xlayer',
});
mkdirSync(join(out, 'traction'), { recursive: true });
const paths = { cursorFile: join(out, 'traction', 'cursor.json'), reportFile: join(out, 'TRACTION.md') };

if (args.includes('--verify')) {
  const problems = await verifyTraction(atro, paths, { log: (l) => console.error(l) });
  for (const p of problems) console.error(`traction: ${p}`);
  if (problems.length > 0) process.exitCode = 1;
  else console.log(`${paths.reportFile} matches a fresh count from the chain`);
} else {
  const stats = await updateTraction(atro, paths, { log: (l) => console.error(l) });
  console.log(`${paths.reportFile}: ${stats.vaults.total} vaults, ${stats.checkIns} check-ins, up to block ${stats.toBlock}`);
}
```

Thêm vào `scripts` của `package.json` gốc:

```json
"traction": "tsx scripts/traction.ts"
```

Job `scripts` của `ci.yml` cần anvil và `forge` cho test trên devnet (`deployLocal` chạy `forge script`). Thay cả job `scripts` (Task 7) bằng:

```yaml
  scripts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          submodules: recursive
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: v1.9.0
      - run: npm ci
      - run: forge build
        working-directory: contracts
      - run: npm run build -w circuits && npm run build -w packages/sdk && npm run build -w packages/mcp && npm run build -w packages/cli
      - run: npm run typecheck
      - run: npm run typecheck:scripts
      - run: npm run test:scripts
```

- [ ] **Step 6: Chạy test để thấy qua**

Run: `npm run test:scripts -- traction workflows`
Expected: PASS 8 test của `traction.test`, 3 test của `traction.devnet`, 8 test của `workflows`.

Nếu `tsc` hay vitest báo `toBlock` không có trong kiểu của `stats`: Plan 2 gap chưa được thêm. Báo người điều phối. Trong lúc chờ, **không** đổi chữ ký trong plan này; cách tạm duy nhất được phép là gọi thẳng `readStats(createReadContext(atro.deployment, atro.publicClient), { resume, toBlock })` import từ `packages/sdk/src/read/stats` và `packages/sdk/src/read/context`, kèm comment trỏ về gap.

Run: `npm run typecheck:scripts && npx biome check --write scripts/traction.ts scripts/traction scripts/test/traction.test.ts scripts/test/traction.devnet.test.ts && npx biome ci .`
Expected: thoát 0.

- [ ] **Step 7: Chạy trên mainnet (chỉ đọc) và commit**

Run: `npm run build -w circuits && npm run traction`
Expected: stderr in tiến độ `counted up to block …`; dòng cuối `TRACTION.md: <n> vaults, <m> check-ins, up to block <b>`. Lần đầu có thể mất nhiều phút (giới hạn 100 block mỗi `eth_getLogs`).

Run: `npm run traction -- --verify`
Expected: `TRACTION.md matches a fresh count from the chain`, thoát 0.

Nếu gặp `RPC_RATE_LIMITED`: chạy lại đúng lệnh đó; cursor đã lưu nên chỉ đọc phần còn lại.

```bash
git add scripts/traction.ts scripts/traction/render.ts scripts/traction/update.ts scripts/test/traction.test.ts scripts/test/traction.devnet.test.ts package.json .github/workflows/ci.yml TRACTION.md traction/cursor.json
git commit -m "feat(traction): TRACTION.md counted from chain events, with a --verify recount" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Trước khi nộp (Task 17, checklist), chạy lại `npm run traction && npm run traction -- --verify` rồi commit hai file sinh với message `docs(traction): update to block <b>`.

### Task 11: README, `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE`, và các khối sinh trong README

**Files:**
- Create: `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `LICENSE`, `scripts/ops/readme.ts`
- Modify: `package.json` (gốc, script `readme:sync`)
- Test: `scripts/test/readme.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `REPO`, `DOCS_URL`, `PUBLISH_PACKAGES` (`scripts/ops/packages.ts`).
  - Task 6: `extractCommands(file, markdown)`, `checkCommand(c, readHelp)` (`scripts/ops/doc-commands.ts`); snapshot `packages/cli/test/snapshots/help/*.txt` (Plan 3).
  - Task 10: `TRACTION.md` đã commit.
  - Plan 2: `parseDeployment`, `Deployment` (các trường `chainId`, `explorerUrl`, `factory`, `vaultImpl`, `vaultImplCodehash`, `cpu`, `policyId`, `factoryBlock`, `webUrl`); file `deployments/xlayer.json`.
  - Plan 5 Task 14: `GET /v1/badge/vaults`, `GET /v1/badge/integrity` (định dạng endpoint của shields.io). Worker tên `atropyle-worker`, URL `https://atropyle-worker.<account>.workers.dev`.
  - Task 12 (sau task này): `proof.json` trên nhánh `badges` (Quyết định 19). Trước Task 12, badge proof hiện "invalid"; như vậy là đúng.
- Produces:
  - `scripts/ops/readme.ts`:
    - `type DeploymentFacts = Pick<Deployment, 'chainId' | 'explorerUrl' | 'factory' | 'vaultImpl' | 'vaultImplCodehash' | 'cpu' | 'policyId' | 'factoryBlock' | 'webUrl'>`
    - `PROOF_BADGE_URL: string`
    - `parseWorkerUrl(input: string): string`
    - `badgeLines(workerUrl: string | null): string[]`
    - `deploymentLines(d: DeploymentFacts | null): string[]`
    - `workerUrlIn(readme: string): string | null`
    - `replaceBlock(text: string, name: string, lines: readonly string[]): string`
    - `syncReadme(readme: string, o: { workerUrl: string | null; deployment: DeploymentFacts | null }): string`
  - `npm run readme:sync [-- --worker-url <origin>] [-- --check]`. Không có `--worker-url` thì giữ URL Worker đang có trong README. Task 14 và Task 17 dùng lệnh này.
  - README có hai khối sinh: `<!-- badges:start -->…<!-- badges:end -->` và `<!-- deployment:start -->…<!-- deployment:end -->`. Không sửa tay phần giữa hai marker.

Thiết kế:
- Badge Worker chỉ có khi người dùng đưa URL thật. Plan 5 Task 14 là mục cắt #1; nếu bị cắt, README chỉ có 4 badge.
- Một test kiểm README khớp với `deployments/xlayer.json`, nên đổi deployment mà quên README thì `test:scripts` đỏ.
- Mọi link docs, mọi link tới file trong repo, mọi lệnh `atropyle` và mọi `npm run` trong ba file Markdown đều được test kiểm có thật.

- [ ] **Step 1: Viết test thất bại**

`scripts/test/readme.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { parseDeployment } from '../../packages/sdk/src/index';
import { checkCommand, extractCommands } from '../ops/doc-commands';
import { DOCS_URL, PUBLISH_PACKAGES } from '../ops/packages';
import {
  badgeLines,
  type DeploymentFacts,
  deploymentLines,
  PROOF_BADGE_URL,
  parseWorkerUrl,
  replaceBlock,
  syncReadme,
  workerUrlIn,
} from '../ops/readme';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const WORKER = 'https://atropyle-worker.example.workers.dev';
const FACTS: DeploymentFacts = {
  chainId: 196,
  explorerUrl: 'https://www.oklink.com/xlayer',
  factory: getAddress('0x1000000000000000000000000000000000000001'),
  vaultImpl: getAddress('0x2000000000000000000000000000000000000002'),
  vaultImplCodehash: `0x${'ab'.repeat(32)}`,
  cpu: getAddress('0x3000000000000000000000000000000000000003'),
  policyId: 7n,
  factoryBlock: 123_456n,
  webUrl: null,
};
const SKELETON = ['# Title', '<!-- badges:start -->', 'old', '<!-- badges:end -->', 'Text', '<!-- deployment:start -->', '<!-- deployment:end -->', ''].join('\n');

describe('README blocks', () => {
  it('renders four badges, and two more with a Worker URL', () => {
    expect(badgeLines(null)).toHaveLength(4);
    expect(badgeLines(null).join('\n')).toContain(PROOF_BADGE_URL);
    expect(PROOF_BADGE_URL).toBe(
      'https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fduongnq2798%2Fatropyle%2Fbadges%2Fproof.json',
    );
    const withWorker = badgeLines(WORKER);
    expect(withWorker).toHaveLength(6);
    expect(withWorker.join('\n')).toContain(
      'https://img.shields.io/endpoint?url=https%3A%2F%2Fatropyle-worker.example.workers.dev%2Fv1%2Fbadge%2Fintegrity',
    );
  });

  it('accepts only an https origin as the Worker URL', () => {
    expect(parseWorkerUrl(`${WORKER}/`)).toBe(WORKER);
    for (const bad of ['http://atropyle-worker.example.workers.dev', `${WORKER}/v1`, 'https://atropyle-worker.<account>.workers.dev', 'nope']) {
      expect(() => parseWorkerUrl(bad), bad).toThrow();
    }
  });

  it('reads the Worker URL back from a rendered README', () => {
    expect(workerUrlIn(syncReadme(SKELETON, { workerUrl: WORKER, deployment: null }))).toBe(WORKER);
    expect(workerUrlIn(syncReadme(SKELETON, { workerUrl: null, deployment: null }))).toBeNull();
  });

  it('renders the deployment table with explorer links, or a placeholder', () => {
    const table = deploymentLines(FACTS).join('\n');
    expect(table).toContain(`| Factory | [\`${FACTS.factory}\`](https://www.oklink.com/xlayer/address/${FACTS.factory}) |`);
    expect(table).toContain(`| Vault implementation code hash | \`${FACTS.vaultImplCodehash}\` |`);
    expect(table).toContain('| Policy circuit ID | `7` |');
    expect(table).toContain('| Factory deployment block | 123456 |');
    expect(table).not.toContain('DeWEB');
    expect(deploymentLines({ ...FACTS, webUrl: 'https://atropyle.example.org/' }).join('\n')).toContain('| Web app on DeWEB | https://atropyle.example.org/ |');
    expect(deploymentLines(null)).toEqual(['Not deployed yet. The mainnet addresses appear here after the deployment.']);
  });

  it('replaces only the marked blocks, and fails without markers', () => {
    const out = replaceBlock(SKELETON, 'badges', ['new']);
    expect(out).toContain('<!-- badges:start -->\nnew\n<!-- badges:end -->');
    expect(out).not.toContain('old');
    expect(out.startsWith('# Title\n')).toBe(true);
    expect(() => replaceBlock('# no markers', 'badges', ['x'])).toThrow('<!-- badges:start -->');
    expect(() => replaceBlock(`${SKELETON}${SKELETON}`, 'badges', ['x'])).toThrow('once');
  });

  it('gives the same text when run twice', () => {
    const once = syncReadme(SKELETON, { workerUrl: WORKER, deployment: FACTS });
    expect(syncReadme(once, { workerUrl: WORKER, deployment: FACTS })).toBe(once);
  });
});

describe('README.md, SECURITY.md, CONTRIBUTING.md and LICENSE', () => {
  const FILES = ['README.md', 'SECURITY.md', 'CONTRIBUTING.md'];
  // Read inside each test, so that the README blocks tests above still run before these files exist.
  const text = (f: string): string => read(f);
  const HELP_DIR = join(ROOT, 'packages', 'cli', 'test', 'snapshots', 'help');
  const readSnapshot = (name: string): string | null => {
    const file = join(HELP_DIR, `${name}.txt`);
    return existsSync(file) ? readFileSync(file, 'utf8') : null;
  };

  it('README.md is in sync with deployments/xlayer.json and its own Worker URL', () => {
    const readme = text('README.md');
    const path = join(ROOT, 'deployments', 'xlayer.json');
    const deployment = existsSync(path) ? parseDeployment(JSON.parse(readFileSync(path, 'utf8'))) : null;
    expect(syncReadme(readme, { workerUrl: workerUrlIn(readme), deployment })).toBe(readme);
  });

  it('every link to the docs or to a repository file points at something that exists', () => {
    const problems: string[] = [];
    const docsRe = new RegExp(`${DOCS_URL.replace(/[.]/g, '\\.')}/([\\w/-]*?)(?:\\.html)?(?=[#)\\s]|$)`, 'g');
    for (const f of FILES) {
      for (const m of text(f).matchAll(docsRe)) {
        const page = m[1] === '' ? 'index' : m[1];
        if (!existsSync(join(ROOT, 'apps', 'docs', 'src', 'content', 'docs', `${page}.md`))) problems.push(`${f}: ${m[0]}`);
      }
      for (const m of text(f).matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)/g)) {
        if (!existsSync(join(ROOT, m[1]))) problems.push(`${f}: ${m[1]}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every atropyle command they show exists in the CLI snapshots', () => {
    const commands = FILES.flatMap((f) => extractCommands(f, text(f)));
    expect(commands.length).toBeGreaterThanOrEqual(4);
    expect(commands.map((c) => checkCommand(c, readSnapshot)).filter((p) => p !== null)).toEqual([]);
  });

  it('every npm script they mention exists', () => {
    const problems: string[] = [];
    for (const f of FILES) {
      for (const m of text(f).matchAll(/npm run ([\w:.-]+)(?:\s+(?:-w|--workspace)\s+([\w/.-]+))?/g)) {
        const pkg = JSON.parse(read(join(m[2] ?? '.', 'package.json'))) as { scripts?: Record<string, string> };
        if (!pkg.scripts?.[m[1]]) problems.push(`${f}: ${m[0]}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('README.md names the four official packages and says the project is unaudited', () => {
    for (const p of PUBLISH_PACKAGES) expect(text('README.md')).toContain(`\`${p.name}\``);
    expect(text('README.md')).toContain('Beta, unaudited');
  });

  it('SECURITY.md points at private vulnerability reporting, and LICENSE is MIT like every package', () => {
    expect(text('SECURITY.md')).toContain('https://github.com/duongnq2798/atropyle/security/advisories/new');
    const license = read('LICENSE');
    expect(license.startsWith('MIT License\n')).toBe(true);
    expect(license).toContain('Copyright (c) 2026 Nguyen Quoc Duong');
    for (const p of PUBLISH_PACKAGES) expect(JSON.parse(read(`${p.dir}/package.json`)).license, p.name).toBe('MIT');
  });
});
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `npm run test:scripts -- readme`
Expected: FAIL vì không tìm thấy `../ops/readme`.

- [ ] **Step 3: Viết `scripts/ops/readme.ts`**

```ts
// Keeps the two generated blocks of README.md in sync: the badges, and the mainnet deployment table.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Deployment, parseDeployment } from '../../packages/sdk/src/index';
import { REPO } from './packages';

export type DeploymentFacts = Pick<
  Deployment,
  'chainId' | 'explorerUrl' | 'factory' | 'vaultImpl' | 'vaultImplCodehash' | 'cpu' | 'policyId' | 'factoryBlock' | 'webUrl'
>;

const shields = (endpoint: string): string => `https://img.shields.io/endpoint?url=${encodeURIComponent(endpoint)}`;

// proof.yml (Task 12) force-pushes proof.json to the orphan badges branch.
export const PROOF_BADGE_URL = shields(`https://raw.githubusercontent.com/${REPO.slug}/badges/proof.json`);

export function parseWorkerUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error(`not a URL: ${input}`);
  }
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(`the Worker URL must be an https origin such as https://atropyle-worker.example.workers.dev, got ${input}`);
  }
  return url.origin;
}

export function badgeLines(workerUrl: string | null): string[] {
  const lines = [
    `[![CI](${REPO.url}/actions/workflows/ci.yml/badge.svg?branch=main)](${REPO.url}/actions/workflows/ci.yml)`,
    `[![Policy verified on mainnet](${PROOF_BADGE_URL})](${REPO.url}/actions/workflows/proof.yml)`,
    '[![npm](https://img.shields.io/npm/v/atropyle?label=npm)](https://www.npmjs.com/package/atropyle)',
    '[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)',
  ];
  if (workerUrl) {
    lines.push(
      `[![Vaults on mainnet](${shields(`${workerUrl}/v1/badge/vaults`)})](TRACTION.md)`,
      `[![Integrity](${shields(`${workerUrl}/v1/badge/integrity`)})](${workerUrl}/health)`,
    );
  }
  return lines;
}

export function deploymentLines(d: DeploymentFacts | null): string[] {
  if (d === null) return ['Not deployed yet. The mainnet addresses appear here after the deployment.'];
  const address = (a: string) => (d.explorerUrl ? `[\`${a}\`](${d.explorerUrl}/address/${a})` : `\`${a}\``);
  const rows: [string, string][] = [
    ['Network', `X Layer (chain ${d.chainId})`],
    ['Factory', address(d.factory)],
    ['Vault implementation', address(d.vaultImpl)],
    ['Vault implementation code hash', `\`${d.vaultImplCodehash}\``],
    ['TapeOut processor', address(d.cpu)],
    ['Policy circuit ID', `\`${d.policyId}\``],
    ['Factory deployment block', `${d.factoryBlock}`],
  ];
  if (d.webUrl) rows.push(['Web app on DeWEB', d.webUrl]);
  return ['| Item | Value |', '|---|---|', ...rows.map(([k, v]) => `| ${k} | ${v} |`)];
}

export function workerUrlIn(readme: string): string | null {
  const m = /img\.shields\.io\/endpoint\?url=([^)\s]+?)%2Fv1%2Fbadge%2Fvaults\)/.exec(readme);
  return m ? parseWorkerUrl(decodeURIComponent(m[1])) : null;
}

export function replaceBlock(text: string, name: string, lines: readonly string[]): string {
  const start = `<!-- ${name}:start -->`;
  const end = `<!-- ${name}:end -->`;
  const a = text.indexOf(start);
  const b = text.indexOf(end);
  if (a < 0 || b < a) throw new Error(`README.md needs ${start} followed by ${end}`);
  if (text.indexOf(start, a + 1) >= 0 || text.indexOf(end, b + 1) >= 0) throw new Error(`${start} must appear once`);
  return `${text.slice(0, a)}${start}\n${lines.join('\n')}\n${text.slice(b)}`;
}

export function syncReadme(readme: string, o: { workerUrl: string | null; deployment: DeploymentFacts | null }): string {
  return replaceBlock(replaceBlock(readme, 'badges', badgeLines(o.workerUrl)), 'deployment', deploymentLines(o.deployment));
}

function main(): void {
  const root = process.cwd();
  const args = process.argv.slice(2);
  const file = join(root, 'README.md');
  const readme = readFileSync(file, 'utf8');
  const i = args.indexOf('--worker-url');
  const workerUrl = i >= 0 ? parseWorkerUrl(args[i + 1] ?? '') : workerUrlIn(readme);
  const path = join(root, 'deployments', 'xlayer.json');
  const deployment = existsSync(path) ? parseDeployment(JSON.parse(readFileSync(path, 'utf8'))) : null;
  const next = syncReadme(readme, { workerUrl, deployment });
  if (args.includes('--check')) {
    if (next !== readme) {
      console.error('README.md is out of date; run npm run readme:sync');
      process.exitCode = 1;
    }
    return;
  }
  writeFileSync(file, next);
  console.log(`README.md: ${workerUrl ? 'with' : 'without'} Worker badges; ${deployment ? 'mainnet deployment table' : 'no deployment yet'}`);
}

if (process.argv[1]?.endsWith('readme.ts')) main();
```

Thêm vào `scripts` của `package.json` gốc:

```json
"readme:sync": "tsx scripts/ops/readme.ts"
```

Run: `npm run test:scripts -- readme -t "README blocks"`
Expected: PASS 6 test; 6 test của nhóm sau bị `-t` bỏ qua (skipped).

- [ ] **Step 4: Viết `LICENSE`**

`LICENSE`:

```text
MIT License

Copyright (c) 2026 Nguyen Quoc Duong

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Tên người giữ bản quyền là câu hỏi mở (Quyết định 28). Người dùng muốn tên khác thì sửa dòng `Copyright` và chuỗi tương ứng trong test.

- [ ] **Step 5: Viết `SECURITY.md`**

`SECURITY.md`:

````md
# Security policy

Atropyle is beta software and has not had an external audit. Start with a free Drill, and protect only what you could afford to lose.

## Report a vulnerability

Please report security problems privately, through GitHub private vulnerability reporting:

https://github.com/duongnq2798/atropyle/security/advisories/new

Do not open a public issue, a pull request or a discussion about a vulnerability before it is fixed.

Include, if you can:

- the component and version (for example `@atropyle/sdk@0.1.0`, or the contract address);
- what an attacker can do, and what they need first;
- steps to reproduce, ideally on a local devnet (`npm run devnet`) or with a Drill vault that you own;
- a suggested fix, if you have one.

We aim to acknowledge a report within 3 days and to share a plan within 7 days. We will credit you in the advisory unless you ask us not to. There is no paid bug bounty yet.

## Scope

In scope:

- The contracts in `contracts/src` and the circuits in `circuits/`, as deployed in `deployments/xlayer.json`.
- The npm packages `atropyle`, `@atropyle/sdk`, `@atropyle/mcp` and `@atropyle/circuits`.
- The web app, on DeWEB and on GitHub Pages, and the docs.
- The Worker in `apps/worker`: the Telegram bot, the keeper and the `/v1` API.
- The Agent Skills and the Claude Code plugin in this repository.

Out of scope: X Layer itself, the TapeOut processor code and DeWEB (report those to their own teams), wallets, RPC operators, and attacks that need the victim's private key or seed phrase.

## Contracts cannot be upgraded

The factory and the vaults have no admin, no pause and no upgrade path, and the policy circuit is frozen. A contract bug cannot be patched in place. If one is confirmed, we will:

1. publish an advisory that tells owners to press "Revoke all" on their vault page, which removes every approval the vault relies on;
2. deploy a new factory, and explain how to create a new vault;
3. disclose the details only after owners have had time to revoke.

For that reason, please give us time to warn owners before you publish anything about a contract bug.

## Testing safely

- Use a local devnet or a Drill vault that you own. Never call functions on other people's vaults to test a theory.
- Do not run load tests against the public Worker or the public RPC endpoints.
- Never send us private keys or seed phrases, not even test ones.

## What we already do

- Every mainnet transaction is signed by the user's own wallet. No Atropyle tool accepts a private key.
- The packages are published from GitHub Actions with npm provenance. The official package names are listed above.
- CI runs Slither, `forge lint`, CodeQL, gitleaks, `npm audit` and knip. The results of the static analysis are in [contracts/STATIC-ANALYSIS.md](contracts/STATIC-ANALYSIS.md).
- A daily workflow verifies the policy circuit on mainnet. Anyone can repeat it with `npx -y atropyle verify`.

What Atropyle protects, and what it cannot protect, is explained in [Security & managing risk](https://duongnq2798.github.io/atropyle/docs/concepts/security.html).
````

- [ ] **Step 6: Viết `CONTRIBUTING.md`**

`CONTRIBUTING.md`:

````md
# Contributing to Atropyle

Thank you for helping. Bug reports, docs fixes and pull requests are welcome. For a security problem, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## Ground rules

- **No private keys, ever.** Do not commit keys, seed phrases or `.env` files, and do not add a `PRIVATE_KEY` variable to any script or workflow. On the local devnet, send transactions only through the unlocked anvil accounts.
- **No workflow signs a transaction.** CI may read the chain but never writes to it.
- **The contracts are frozen.** `contracts/src` is deployed on mainnet and cannot be upgraded. Changing even a comment changes the code hash that CI checks. A contract change means a new factory, so open an issue first.
- **No telemetry, no trackers, no CDN** in the web app or the docs.
- **Generated files are not edited by hand:** `apps/docs/src/content/docs/reference/`, `apps/docs/public/schemas/`, `bench/verify-policy.budget.json`, `traction/cursor.json`, `TRACTION.md`, and the marked blocks of `README.md`. Each one names the command that writes it.
- Code, comments, messages and docs are in English.

## Set up

You need Node.js 24, Git, and [Foundry](https://getfoundry.sh) 1.9.0 for the contracts and the local chain. On Windows, use Git Bash.

```bash
git clone --recurse-submodules https://github.com/duongnq2798/atropyle.git
cd atropyle
npm ci
npm run build
```

## Repository layout

| Path | What it is |
|---|---|
| `circuits/` | The policy circuit, its simulator and `verifyPolicy` (`@atropyle/circuits`) |
| `contracts/` | The vault and the factory (Foundry) |
| `deployments/` | Addresses and settings for mainnet and the local devnet |
| `packages/sdk/` | `@atropyle/sdk` |
| `packages/cli/` | The `atropyle` command line |
| `packages/mcp/` | `@atropyle/mcp`, the MCP server |
| `apps/web/` | The web app |
| `apps/worker/` | The Cloudflare Worker: Telegram bot, keeper and API |
| `apps/docs/` | This documentation site (Starlight) |
| `scripts/` | Repository scripts: devnet, docs generation, benchmark, traction, release checks |

## Run the checks

```bash
npm run lint
npm run typecheck
npm test
npm run test:scripts
cd contracts && forge test
```

The SDK integration tests and the script tests start their own anvil, so Foundry must be on your `PATH`:

```bash
npm run test:integration -w packages/sdk
```

## Work with a local chain

```bash
npm run devnet
npm run devnet:seed
```

The first command starts anvil on port 8545, deploys everything and keeps running. The second, in another terminal, creates three demo vaults.

## Work on the docs

```bash
npm run dev -w apps/docs
npm run docs:gen
npm run build -w apps/docs
npm run check:links -w apps/docs
```

`docs:gen` rewrites the reference pages from the code; CI fails when they are out of date. Links between pages are relative and end in `.html`, so that the same build works under `/docs/` and `/atropyle/docs/`. The link checker rejects absolute links to other sites: write an external URL as inline code instead.

## Commits and pull requests

- Use Conventional Commits: `feat(sdk): …`, `fix(cli): …`, `docs(users): …`.
- Keep a pull request to one change, with tests. CI must be green before review.
- Add only the files you mean to change; never `git add -A`.
````

- [ ] **Step 7: Viết `README.md`**

`README.md`:

````md
# Atropyle

<!-- badges:start -->
<!-- badges:end -->

**An inheritance and recovery vault on X Layer.** If you go silent for longer than you chose, your heirs receive your assets. If you lose your wallet, your guardians can move them to a new one. Your tokens stay in your own wallet the whole time.

> **Beta, unaudited.** The contracts have not had an external audit. Start with a free Drill, and protect only what you could afford to lose.

The rules of every vault live in a frozen [TapeOut](https://tapeout.link) circuit. Nobody can change them, not even the Atropyle team, and anyone can check them in one command:

```bash
npx -y atropyle verify
```

## How it works

1. You create a vault, choose up to five heirs and their shares, and approve the assets it covers. Optionally, you add up to five guardians.
2. Every transaction you sign to your vault is a proof of life. A check-in takes one click.
3. If you stay silent for too long, the vault raises an alarm and gives you a window to cancel. Telegram can remind you and your guardians.
4. If the window ends, the vault releases, and a keeper sends each heir their share. Anyone can do that step; it cannot send assets anywhere else.
5. If you lose your wallet, k of your guardians can vote for a new wallet of yours, and the same alarm window protects you from a false vote.

A **Drill** runs the whole cycle in about four minutes, for free, with the same circuit and contracts. Read [What is Atropyle](https://duongnq2798.github.io/atropyle/docs/users/what-is-atropyle.html) for the full picture.

## Use it

| You are | Start here |
|---|---|
| An owner | [Create your vault](https://duongnq2798.github.io/atropyle/docs/users/owners.html), starting with a Drill |
| An heir | [You were named an heir](https://duongnq2798.github.io/atropyle/docs/users/heirs.html) |
| A guardian | [Your role and safety checklist](https://duongnq2798.github.io/atropyle/docs/users/guardians.html) |
| Someone who lost a wallet | [Recover a lost wallet](https://duongnq2798.github.io/atropyle/docs/users/recover-a-lost-wallet.html) |

The web app is published on chain with DeWEB and mirrored at https://duongnq2798.github.io/atropyle/. No Atropyle tool ever asks for your private key or seed phrase: your own wallet signs every transaction.

## Build with it

| Package | What it does |
|---|---|
| `atropyle` | Command line: verify, read vaults, plan, simulate and prepare transactions with a signing link |
| `@atropyle/sdk` | TypeScript SDK for Node.js and browsers |
| `@atropyle/mcp` | MCP server with 7 tools, for Claude, Cursor, VS Code, Codex and other agents |
| `@atropyle/circuits` | The policy circuit, its simulator and the exhaustive `verifyPolicy` check |

Read a vault and its timeline from Node.js 20 or later:

```js
import { createAtropyle } from '@atropyle/sdk';

const atro = createAtropyle({ chain: 'xlayer' });
const vault = atro.vault('0xAnyVaultAddress');

const status = await vault.status();
const timeline = await vault.timeline();
console.log(status.state, timeline.events.map((e) => `${e.state} at ${e.at}`));
```

From the command line:

```bash
npx -y atropyle status 0xAnyVaultAddress
npx -y atropyle vaults 0xYourWalletAddress
npx -y atropyle plan init --template guarded --preset twelveMonths
```

Connect an AI agent:

```bash
claude mcp add atropyle -- npx -y @atropyle/mcp
```

Or install the Claude Code plugin with its two skills:

```text
/plugin marketplace add duongnq2798/atropyle
/plugin install atropyle@atropyle
```

More in the docs: [Quickstart](https://duongnq2798.github.io/atropyle/docs/developers/quickstart.html), [Use with AI agents](https://duongnq2798.github.io/atropyle/docs/developers/ai-agents.html), [Run your own keeper](https://duongnq2798.github.io/atropyle/docs/developers/keeper.html), [SDK reference](https://duongnq2798.github.io/atropyle/docs/reference/sdk.html), [CLI reference](https://duongnq2798.github.io/atropyle/docs/reference/cli.html).

## Built on TapeOut

- **The rules** are `AtropylePolicy v1`, a TapeOut circuit of NAND gates and three LATCH bits on the Atropyle processor. Every state change of every vault is decided by a `step` call to it.
- **Reusable parts:** the policy calls `KofN5` (k-of-n votes) and `Ge4` (4-bit compare) through REF gates. Anyone can use them in their own circuit.
- **Exhaustive proof:** the circuit has 26 bits of state and input, so `atropyle verify` tries all 67,108,864 combinations against the netlist on chain and checks the properties P1 to P8.
- **The web app and the docs** are hosted on chain with DeWEB.

See [The policy circuit](https://duongnq2798.github.io/atropyle/docs/concepts/policy-circuit.html) and [Verification & trust assumptions](https://duongnq2798.github.io/atropyle/docs/concepts/verification.html).

## Mainnet deployment

<!-- deployment:start -->
<!-- deployment:end -->

Contracts, events and errors are documented in the [docs](https://duongnq2798.github.io/atropyle/docs/). The deployment history is in [docs/deployments.md](docs/deployments.md). Usage counted from chain events is in [TRACTION.md](TRACTION.md); check it with `npm run traction -- --verify`.

## Security

What Atropyle protects, and what it cannot, is in [Security & managing risk](https://duongnq2798.github.io/atropyle/docs/concepts/security.html). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Static analysis results are in [contracts/STATIC-ANALYSIS.md](contracts/STATIC-ANALYSIS.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
````

Ghi chú cho người thực thi:
- Link TapeOut `https://tapeout.link` là link README của `@atropyle/circuits` và `@atropyle/sdk` đã dùng (Plan 2).
- Link Contracts trỏ tới trang chủ docs vì trang Contracts chỉ có sau Task 15; Task 15 đổi link này.

Run: `npm run readme:sync`
Expected: `README.md: without Worker badges; mainnet deployment table`. Hai khối giữa các marker đã có nội dung.

- [ ] **Step 8: Chạy test để thấy qua**

Run: `npm run build -w circuits && npm run test:scripts -- readme && npm run readme:sync -- --check`
Expected: PASS 12 test; `--check` thoát 0.

Nếu test "every atropyle command" báo một cờ hay lệnh không có: sửa README theo snapshot `--help`, không sửa snapshot. Nếu test "every link" báo một trang docs không có: sửa link, đối chiếu cây `apps/docs/src/content/docs/`.

Run: `npm run typecheck:scripts && npx biome check --write scripts/ops/readme.ts scripts/test/readme.test.ts && npx biome ci .`
Expected: thoát 0.

- [ ] **Step 9: Commit**

```bash
git add README.md SECURITY.md CONTRIBUTING.md LICENSE scripts/ops/readme.ts scripts/test/readme.test.ts package.json
git commit -m "docs: README, SECURITY, CONTRIBUTING and MIT license, with generated badge and deployment blocks" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 10: `[USER]` Thêm badge Worker khi `/v1/badge` đã chạy trên mainnet**

Chỉ làm khi Plan 5 Task 14 đã deploy. Người dùng lấy origin Worker mà `wrangler deploy` in ra, rồi kiểm:

```bash
WORKER=https://atropyle-worker.<account>.workers.dev
curl -sS "$WORKER/v1/badge/vaults"
```

Expected: một object JSON có `"schemaVersion":1` và `"label":"vaults"`.

Sau đó người dùng đưa origin đó cho agent. Agent chạy:

```bash
npm run readme:sync -- --worker-url "$WORKER"
npm run test:scripts -- readme
git add README.md
git commit -m "docs(readme): add the Worker vaults and integrity badges" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Expected: `README.md: with Worker badges; mainnet deployment table`; PASS 12 test.

### Task 12: `proof.yml`: verify mainnet mỗi ngày, report làm artifact, badge ba trạng thái

**Files:**
- Create: `.github/workflows/proof.yml`, `scripts/ops/proof.ts`, `scripts/ops/proof-report.ts`
- Modify: `package.json` (gốc, script `proof:report`)
- Test: `scripts/test/proof.test.ts`

**Interfaces:**
- Consumes:
  - Plan 3: `atropyle verify --json` in đúng một object `VerifyOutput` (`schemaVersion`, `ok`, `target`, `chainId`, `blockNumber`, `rpcs`, `operators`, `policyStatus: 'verified' | 'unavailable' | 'mismatch' | 'skipped'`, `policy: { combos, … } | null`, `policyError`, `vault`, `summary`, `warnings`). Khi lỗi, in `ErrorOutput` (`schemaVersion`, `error: { code, message, hint, docsUrl }`, `summary`). Mã thoát `EXIT = { ok: 0, error: 1, usage: 2, verification: 3, network: 4 }`. Bin đã build: `packages/cli/dist/bin.js`.
  - Plan 2: `TRANSPORT_ERROR_CODES` (`packages/sdk/src/errors.ts`): `RPC_RATE_LIMITED`, `RPC_UNAVAILABLE`, `RPC_DISAGREEMENT`, `QUORUM_UNAVAILABLE`.
  - Task 7: `readWorkflows`, `auditWorkflows`, `WRITE_PERMISSIONS['proof.yml'] = { badge: ['contents'] }` (`scripts/ops/workflows.ts`).
  - Task 11: `PROOF_BADGE_URL` (README trỏ tới `badges/proof.json`).
- Produces:
  - `scripts/ops/proof.ts`:
    - `type ProofVerdict = 'passing' | 'failing' | 'unknown'`, `type RunLabel = 'published' | 'source'`
    - `interface ProofRun { label: RunLabel; exitCode: number | null; stdout: string }`
    - `interface RunResult { label: RunLabel; verdict: ProofVerdict; reason: string; blockNumber: string | null; combos: number | null }`
    - `interface ShieldsBadge { schemaVersion: 1; label: string; message: string; color: string }`
    - `MAINNET_CHAIN_ID = 196`, `BADGE_LABEL = 'mainnet policy proof'`
    - `classifyRun(run: ProofRun): RunResult`, `combine(results: readonly RunResult[]): ProofVerdict`, `badgeFor(v: ProofVerdict): ShieldsBadge`
    - `renderSummary(results: readonly RunResult[], verdict: ProofVerdict, o: { date: string; runUrl: string | null }): string`
  - `scripts/ops/proof-report.ts`: `readRun(dir: string, label: RunLabel): ProofRun`, `writeReport(root: string, o: { date: string; runUrl: string | null }): ProofVerdict`. `npm run proof:report` đọc `proof/{published,source}.{json,exit}`, ghi `badge/proof.json` và `proof/summary.md`, nối summary vào `$GITHUB_STEP_SUMMARY`, ghi `verdict=<v>` vào `$GITHUB_OUTPUT`, luôn thoát 0.
  - Nhánh mồ côi `badges` chứa đúng một file `proof.json`, mỗi lần chạy force-push một commit duy nhất.

Luật phân loại (Quyết định 20):

| Lần chạy | Kết quả |
|---|---|
| Thoát 0, `ok: true`, `policyStatus: 'verified'`, `chainId` 196 | `passing` |
| Thoát 3, hoặc `ok: false` | `failing` |
| Thoát 4, hoặc `error.code` thuộc `TRANSPORT_ERROR_CODES` | `unknown` (mạng lỗi, policy chưa được kiểm) |
| Không có mã thoát, không có JSON, chain khác 196, mã thoát khác | `unknown` |

Gộp hai lần chạy: có một `failing` thì `failing`; cả hai `passing` thì `passing`; còn lại `unknown`. Trước ngày publish npm (2/12), lần chạy bằng gói đã publish lỗi E404 nên badge là `unknown`. Như vậy là đúng.

- [ ] **Step 1: Viết test thất bại**

`scripts/test/proof.test.ts`:

```ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeReport } from '../ops/proof-report';
import { badgeFor, classifyRun, combine, type ProofRun, type RunResult } from '../ops/proof';
import { auditWorkflows, readWorkflows } from '../ops/workflows';

const ROOT = join(import.meta.dirname, '..', '..');
const COMBOS = 67_108_864;
const verified = {
  schemaVersion: 1,
  ok: true,
  target: 'policy',
  chainId: 196,
  blockNumber: '4567',
  rpcs: 2,
  operators: [['rpc.xlayer.tech', 'xlayerrpc.okx.com'], ['xlayer.drpc.org']],
  policyStatus: 'verified',
  policy: { ok: true, combos: COMBOS },
  policyError: null,
  vault: null,
  summary: 'Policy verified.',
  warnings: [],
};
const networkError = (code: string) => ({
  schemaVersion: 1,
  error: { code, message: 'The RPC endpoint did not answer.', hint: 'Try again later.', docsUrl: 'x' },
  summary: 'The RPC endpoint did not answer.',
});
const run = (exitCode: number | null, out: unknown, label: ProofRun['label'] = 'source'): ProofRun => ({
  label,
  exitCode,
  stdout: typeof out === 'string' ? out : `${JSON.stringify(out)}\n`,
});

describe('classifyRun', () => {
  it('a verified policy on mainnet is passing', () => {
    expect(classifyRun(run(0, verified))).toEqual({
      label: 'source',
      verdict: 'passing',
      reason: `all ${COMBOS} combinations passed`,
      blockNumber: '4567',
      combos: COMBOS,
    });
  });

  it('network errors make the badge unknown, not failing', () => {
    const results: RunResult[] = [
      classifyRun(run(4, networkError('RPC_UNAVAILABLE'), 'published')),
      classifyRun(run(4, '')),
      classifyRun(run(1, networkError('QUORUM_UNAVAILABLE'))),
    ];
    for (const r of results) {
      expect(r.verdict).toBe('unknown');
      expect(r.reason).toContain('network');
    }
    expect(results[0].reason).toContain('RPC_UNAVAILABLE');
    expect(combine([classifyRun(run(0, verified, 'published')), results[0]])).toBe('unknown');
    expect(badgeFor('unknown')).toEqual({ schemaVersion: 1, label: 'mainnet policy proof', message: 'unknown', color: 'lightgrey' });
  });

  it('a failed proof is failing', () => {
    const mismatch = { ...verified, ok: false, policyStatus: 'mismatch', policy: null, policyError: { code: 'POLICY_MISMATCH' } };
    expect(classifyRun(run(3, mismatch))).toMatchObject({ verdict: 'failing', reason: 'POLICY_MISMATCH' });
    expect(classifyRun(run(0, { ...verified, ok: false }))).toMatchObject({ verdict: 'failing' });
  });

  it('a run that never produced a report is unknown', () => {
    expect(classifyRun(run(null, ''))).toMatchObject({ verdict: 'unknown', reason: 'the run did not record an exit code' });
    expect(classifyRun(run(1, 'npm error 404 Not Found - GET https://registry.npmjs.org/atropyle'))).toMatchObject({
      verdict: 'unknown',
      reason: 'exit code 1 without a JSON report',
    });
  });

  it('a report for another chain is unknown', () => {
    expect(classifyRun(run(0, { ...verified, chainId: 31337 }))).toMatchObject({ verdict: 'unknown', reason: 'checked chain 31337, not X Layer mainnet' });
  });
});

describe('combine and badgeFor', () => {
  const pass = classifyRun(run(0, verified));
  const fail = classifyRun(run(3, { ...verified, ok: false, policyStatus: 'mismatch' }));
  const unknown = classifyRun(run(4, ''));

  it('passing needs both runs, and failing wins', () => {
    expect(combine([pass, pass])).toBe('passing');
    expect(combine([pass])).toBe('unknown');
    expect(combine([pass, unknown])).toBe('unknown');
    expect(combine([unknown, fail])).toBe('failing');
    expect(combine([pass, fail])).toBe('failing');
  });

  it('follows the shields.io endpoint format', () => {
    expect(badgeFor('passing')).toEqual({ schemaVersion: 1, label: 'mainnet policy proof', message: 'passing', color: 'brightgreen' });
    expect(badgeFor('failing')).toEqual({ schemaVersion: 1, label: 'mainnet policy proof', message: 'failing', color: 'red' });
  });
});

describe('writeReport', () => {
  it('writes badge/proof.json and proof/summary.md from the files the workflow left', () => {
    const root = mkdtempSync(join(tmpdir(), 'atropyle-proof-'));
    mkdirSync(join(root, 'proof'));
    writeFileSync(join(root, 'proof', 'published.exit'), '0\n');
    writeFileSync(join(root, 'proof', 'published.json'), JSON.stringify(verified));
    writeFileSync(join(root, 'proof', 'source.exit'), '4\n');
    writeFileSync(join(root, 'proof', 'source.json'), JSON.stringify(networkError('RPC_UNAVAILABLE')));
    const verdict = writeReport(root, { date: '2026-12-05T06:17:00.000Z', runUrl: 'https://github.com/duongnq2798/atropyle/actions/runs/1' });
    expect(verdict).toBe('unknown');
    expect(JSON.parse(readFileSync(join(root, 'badge', 'proof.json'), 'utf8'))).toEqual(badgeFor('unknown'));
    const summary = readFileSync(join(root, 'proof', 'summary.md'), 'utf8');
    expect(summary).toContain('# Mainnet policy proof: unknown');
    expect(summary).toContain('| Published package (`npx atropyle@latest`) | passing | 4567 | 67,108,864 |');
    expect(summary).toContain('RPC_UNAVAILABLE');
    expect(summary).toContain('https://github.com/duongnq2798/atropyle/actions/runs/1');
  });
});

describe('proof.yml', () => {
  const file = readWorkflows(join(ROOT, '.github', 'workflows')).find((f) => f.name === 'proof.yml');
  const on = (file?.doc.on ?? {}) as Record<string, unknown>;
  const verify = file?.doc.jobs?.verify;
  const badge = file?.doc.jobs?.badge;

  it('runs every day and by hand, read-only except the badge job', () => {
    expect(file).toBeDefined();
    expect((on.schedule as { cron: string }[])[0].cron).toMatch(/^\d+ \d+ \* \* \*$/);
    expect('workflow_dispatch' in on).toBe(true);
    expect(verify?.permissions).toBeUndefined();
    expect(badge?.permissions).toEqual({ contents: 'write' });
    expect(auditWorkflows(file ? [file] : [])).toEqual([]);
  });

  it('checks the published package outside the repository, then the source', () => {
    const steps = verify?.steps ?? [];
    const runs = steps.map((s) => s.run ?? '');
    const published = runs.findIndex((r) => r.includes('npx -y atropyle@latest verify --json'));
    expect(published).toBeGreaterThanOrEqual(0);
    expect(runs[published]).toContain('cd "$RUNNER_TEMP/published"');
    expect(published).toBeLessThan(runs.indexOf('npm ci'));
    expect(runs.some((r) => r.includes('node packages/cli/dist/bin.js verify --json > proof/source.json'))).toBe(true);
    expect(steps.filter((s) => s.uses?.startsWith('actions/setup-node@')).every((s) => s.with?.cache === undefined)).toBe(true);
  });

  it('uploads the reports, and falls back to an unknown badge', () => {
    expect(verify?.steps?.some((s) => s.uses?.startsWith('actions/upload-artifact@'))).toBe(true);
    const push = (badge?.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(push).toContain(`'${JSON.stringify(badgeFor('unknown'))}'`);
    expect(push).toContain('git push --force');
    expect(push).toContain('HEAD:badges');
  });
});
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `npm run test:scripts -- proof`
Expected: FAIL vì không tìm thấy `../ops/proof-report` và `../ops/proof`.

- [ ] **Step 3: Viết `scripts/ops/proof.ts` và `scripts/ops/proof-report.ts`**

`scripts/ops/proof.ts`:

```ts
// Classifies the two daily `atropyle verify --json` runs of proof.yml and renders the README badge.
// A network failure is "unknown": it must never read as a failed proof, nor keep an old "passing".
import { TRANSPORT_ERROR_CODES } from '../../packages/sdk/src/errors';

export type ProofVerdict = 'passing' | 'failing' | 'unknown';
export type RunLabel = 'published' | 'source';

export interface ProofRun {
  label: RunLabel;
  /** Exit code of `atropyle verify --json`, or null when the step did not record one. */
  exitCode: number | null;
  stdout: string;
}

export interface RunResult {
  label: RunLabel;
  verdict: ProofVerdict;
  reason: string;
  blockNumber: string | null;
  combos: number | null;
}

export interface ShieldsBadge {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

export const MAINNET_CHAIN_ID = 196;
export const BADGE_LABEL = 'mainnet policy proof';

const COLORS: Record<ProofVerdict, string> = { passing: 'brightgreen', failing: 'red', unknown: 'lightgrey' };
const LABELS: Record<RunLabel, string> = {
  published: 'Published package (`npx atropyle@latest`)',
  source: 'Source (`main`)',
};

function parseReport(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text.trim());
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const codeOf = (v: unknown): string | null =>
  v !== null && typeof v === 'object' && typeof (v as { code?: unknown }).code === 'string' ? (v as { code: string }).code : null;

export function classifyRun(run: ProofRun): RunResult {
  const result = (verdict: ProofVerdict, reason: string, blockNumber: string | null = null, combos: number | null = null): RunResult => ({
    label: run.label,
    verdict,
    reason,
    blockNumber,
    combos,
  });
  if (run.exitCode === null) return result('unknown', 'the run did not record an exit code');
  const out = parseReport(run.stdout);
  const errorCode = codeOf(out?.error);
  if (run.exitCode === 4 || (errorCode !== null && (TRANSPORT_ERROR_CODES as ReadonlySet<string>).has(errorCode))) {
    return result('unknown', `network error${errorCode ? ` ${errorCode}` : ''}; the policy was not checked`);
  }
  if (out === null) return result('unknown', `exit code ${run.exitCode} without a JSON report`);
  if (out.chainId !== undefined && out.chainId !== MAINNET_CHAIN_ID) {
    return result('unknown', `checked chain ${String(out.chainId)}, not X Layer mainnet`);
  }
  const blockNumber = typeof out.blockNumber === 'string' ? out.blockNumber : null;
  const combos = (out.policy as { combos?: unknown } | null | undefined)?.combos;
  const combosOrNull = typeof combos === 'number' ? combos : null;
  if (run.exitCode === 3 || out.ok === false) {
    const why = codeOf(out.policyError) ?? errorCode ?? (typeof out.policyStatus === 'string' ? `policy ${out.policyStatus}` : 'a check failed');
    return result('failing', why, blockNumber, combosOrNull);
  }
  if (run.exitCode === 0 && out.ok === true && out.policyStatus === 'verified') {
    return result('passing', `all ${combosOrNull ?? '?'} combinations passed`, blockNumber, combosOrNull);
  }
  return result('unknown', `unexpected result: exit code ${run.exitCode}${errorCode ? ` (${errorCode})` : ''}`, blockNumber, combosOrNull);
}

export function combine(results: readonly RunResult[]): ProofVerdict {
  if (results.some((r) => r.verdict === 'failing')) return 'failing';
  return results.length >= 2 && results.every((r) => r.verdict === 'passing') ? 'passing' : 'unknown';
}

export function badgeFor(v: ProofVerdict): ShieldsBadge {
  return { schemaVersion: 1, label: BADGE_LABEL, message: v, color: COLORS[v] };
}

export function renderSummary(results: readonly RunResult[], verdict: ProofVerdict, o: { date: string; runUrl: string | null }): string {
  const n = (x: number | null) => (x === null ? '–' : x.toLocaleString('en-US'));
  return [
    `# Mainnet policy proof: ${verdict}`,
    '',
    `Checked at ${o.date}.${o.runUrl ? ` Workflow run: ${o.runUrl}` : ''}`,
    '',
    '| Run | Result | Block | Combinations | Details |',
    '|---|---|---|---|---|',
    ...results.map((r) => `| ${LABELS[r.label]} | ${r.verdict} | ${r.blockNumber ?? '–'} | ${n(r.combos)} | ${r.reason} |`),
    '',
    '"unknown" means the network failed or the package could not run. It is not a failed proof.',
    'Repeat the check yourself with `npx -y atropyle verify`.',
    '',
  ].join('\n');
}
```

`scripts/ops/proof-report.ts`:

```ts
// npm run proof:report
// Reads proof/{published,source}.{json,exit} left by proof.yml, writes badge/proof.json and proof/summary.md.
// Always exits 0: the workflow decides what a failing proof does to the run.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { badgeFor, classifyRun, combine, type ProofRun, type ProofVerdict, type RunLabel, renderSummary } from './proof';

export function readRun(dir: string, label: RunLabel): ProofRun {
  const exitFile = join(dir, `${label}.exit`);
  const outFile = join(dir, `${label}.json`);
  const raw = existsSync(exitFile) ? readFileSync(exitFile, 'utf8').trim() : '';
  return {
    label,
    exitCode: /^\d+$/.test(raw) ? Number(raw) : null,
    stdout: existsSync(outFile) ? readFileSync(outFile, 'utf8') : '',
  };
}

export function writeReport(root: string, o: { date: string; runUrl: string | null }): ProofVerdict {
  const dir = join(root, 'proof');
  const results = (['published', 'source'] as const).map((label) => classifyRun(readRun(dir, label)));
  const verdict = combine(results);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(root, 'badge'), { recursive: true });
  writeFileSync(join(root, 'badge', 'proof.json'), `${JSON.stringify(badgeFor(verdict))}\n`);
  writeFileSync(join(dir, 'summary.md'), renderSummary(results, verdict, o));
  return verdict;
}

function main(): void {
  const env = process.env;
  const runUrl =
    env.GITHUB_SERVER_URL && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID
      ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
      : null;
  const root = process.cwd();
  const verdict = writeReport(root, { date: new Date().toISOString(), runUrl });
  const summary = readFileSync(join(root, 'proof', 'summary.md'), 'utf8');
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, summary);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `verdict=${verdict}\n`);
  console.log(summary);
}

if (process.argv[1]?.endsWith('proof-report.ts')) main();
```

Thêm vào `scripts` của `package.json` gốc:

```json
"proof:report": "tsx scripts/ops/proof-report.ts"
```

Run: `npm run test:scripts -- proof -t "classifyRun|combine and badgeFor|writeReport"`
Expected: PASS 8 test; 3 test `proof.yml` bị `-t` bỏ qua.

- [ ] **Step 4: Viết `.github/workflows/proof.yml`**

```yaml
name: proof

# Proves the policy circuit on X Layer mainnet every day, with the published npm package and with the source on main,
# then publishes a shields.io badge to the orphan `badges` branch. Only GITHUB_TOKEN is used; nothing is signed.
on:
  schedule:
    - cron: '17 6 * * *'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: proof
  cancel-in-progress: false

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      # No npm cache in this workflow: its result is published, so it never restores a cache that a PR could have written.
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - name: Verify with the published package
        shell: bash
        run: |
          mkdir -p proof "$RUNNER_TEMP/published"
          cd "$RUNNER_TEMP/published"
          set +e
          npx -y atropyle@latest verify --json > "$GITHUB_WORKSPACE/proof/published.json" 2> "$GITHUB_WORKSPACE/proof/published.log"
          echo $? > "$GITHUB_WORKSPACE/proof/published.exit"
      - run: npm ci
      - run: npm run build -w circuits && npm run build -w packages/sdk && npm run build -w packages/mcp && npm run build -w packages/cli
      - name: Verify with the source on main
        shell: bash
        run: |
          set +e
          node packages/cli/dist/bin.js verify --json > proof/source.json 2> proof/source.log
          echo $? > proof/source.exit
      - id: report
        run: npm run proof:report
      - uses: actions/upload-artifact@v7
        with:
          name: proof-${{ github.run_id }}
          path: |
            proof/
            badge/
          retention-days: 90
      - if: steps.report.outputs.verdict == 'failing'
        run: |
          echo "::error::The mainnet policy proof failed. Read proof/summary.md in the artifact of this run."
          exit 1

  badge:
    needs: verify
    if: always() && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 5
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v7
        continue-on-error: true
        with:
          name: proof-${{ github.run_id }}
          path: artifact
      - name: Publish proof.json to the badges branch
        shell: bash
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          mkdir -p site
          if [ -f artifact/badge/proof.json ]; then
            cp artifact/badge/proof.json site/proof.json
          else
            echo '{"schemaVersion":1,"label":"mainnet policy proof","message":"unknown","color":"lightgrey"}' > site/proof.json
          fi
          cd site
          git init -q -b badges
          git add proof.json
          git -c user.name="github-actions[bot]" -c user.email="41898282+github-actions[bot]@users.noreply.github.com" \
            commit -q -m "proof: $(jq -r .message proof.json) (run ${GITHUB_RUN_ID})"
          git push --force "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:badges
```

Ghi chú cho người thực thi:
- Lần chạy bằng gói đã publish nằm trong `$RUNNER_TEMP`, ngoài repo, và chạy **trước** `npm ci` (Quyết định 21). Không chuyển nó xuống sau `npm ci`.
- Job `verify` đỏ khi và chỉ khi proof `failing`. Mạng lỗi cho badge `unknown` mà job vẫn xanh; summary của run ghi rõ lý do.
- Job `badge` chạy cả khi `verify` đỏ (`always()`). Nếu không tải được artifact, nó đăng badge `unknown`, không bao giờ giữ badge cũ.
- Push bằng `GITHUB_TOKEN` không kích hoạt workflow khác, nên nhánh `badges` không chạy CI. GitHub che token trong log.
- Chuỗi JSON dự phòng phải đúng bằng `JSON.stringify(badgeFor('unknown'))`; test ở Step 1 kiểm điều này.

- [ ] **Step 5: Chạy test để thấy qua**

Run: `npm run test:scripts -- proof workflows`
Expected: PASS 11 test của `proof`, 8 test của `workflows`.

Run: `npm run typecheck:scripts && npx biome check --write scripts/ops/proof.ts scripts/ops/proof-report.ts scripts/test/proof.test.ts && npx biome ci .`
Expected: thoát 0.

- [ ] **Step 6: Chạy report trên máy bằng lệnh verify thật (chỉ đọc)**

Run:

```bash
mkdir -p proof
npm run build -w circuits && npm run build -w packages/sdk && npm run build -w packages/mcp && npm run build -w packages/cli
node packages/cli/dist/bin.js verify --json > proof/source.json; echo $? > proof/source.exit
npm run proof:report
cat badge/proof.json
```

Expected: summary có dòng `Source (\`main\`)` với `passing` và `67,108,864`; dòng `Published package` là `unknown` với lý do `the run did not record an exit code` (chưa chạy phần đó). `badge/proof.json` là `unknown`, vì cần cả hai lần `passing`. `proof/` và `badge/` nằm trong `.gitignore` (Task 2), nên không có gì để commit từ bước này.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/proof.yml scripts/ops/proof.ts scripts/ops/proof-report.ts scripts/test/proof.test.ts package.json
git commit -m "ci(proof): daily mainnet policy proof with the published package and the source, tri-state badge" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: `[USER]` Chạy lần đầu trên GitHub**

Sau khi push, người dùng chạy:

```bash
gh workflow run proof.yml --repo duongnq2798/atropyle --ref main
sleep 10
RUN=$(gh run list --repo duongnq2798/atropyle --workflow proof.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN" --repo duongnq2798/atropyle --exit-status
curl -sS https://raw.githubusercontent.com/duongnq2798/atropyle/badges/proof.json
```

Expected:
- Trước 2/12 (chưa publish npm): job `verify` xanh, summary ghi `Published package … unknown … exit code 1 without a JSON report` (hoặc lý do npm khác); `proof.json` có `"message":"unknown"`.
- Sau khi publish `0.1.0` (Task 14): `"message":"passing"`. Badge trong README chuyển xanh sau vài phút (cache của shields.io và raw.githubusercontent.com).
- Nếu job `badge` lỗi `403` khi push: vào Settings → Rules, kiểm không có ruleset nào chặn tạo hay force-push nhánh `badges`.

### Task 13: `npm run release:check`: publint, attw, và smoke test từ 4 tarball trên devnet

**Files:**
- Create: `scripts/ops/release-check.ts`, `scripts/ops/pack.ts`
- Modify: `package.json` (gốc, script `release:check`), `.github/workflows/ci.yml` (job `packages`)
- Test: `scripts/test/release-check.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `PUBLISH_PACKAGES` (thứ tự circuits → sdk → mcp → cli), `PublishPackage.bin`.
  - Plan 2–3: script `check:pkg` của mỗi gói (`circuits`, `packages/sdk`: `publint && attw --pack . --profile node16`; `packages/mcp`: `publint && attw --pack . --profile esm-only`; `packages/cli`: `publint`). publint và attw đã là devDependency của từng workspace; task này không cài thêm.
  - Plan 3: `startDevnetEnv(o?: { port?: number }): Promise<DevnetEnv>` (`scripts/lib/devnet-env.ts`), với `deploymentFile`, `rpcUrl`, `vaults.simple`, `stop()`. CLI: `--version`, `status <vault> --json`, `verify --vault <v> --no-policy --verify-rpc <url> --single-rpc --json`, cờ chung `--deployment <file>`. MCP: `atropyle-mcp --help` thoát 0.
  - Plan 1–2: `@atropyle/circuits` export `verifyPolicy`, `buildAll`; `@atropyle/sdk` có bản ESM và CJS, export `createAtropyle`, `parseDeployment`.
- Produces:
  - `scripts/ops/pack.ts` (thuần):
    - `interface PackedFile { path: string; size: number }`
    - `interface PackResult { name: string; version: string; filename: string; unpackedSize: number; files: PackedFile[] }`
    - `interface Manifest { name: string; version: string; bin?: string | Record<string, string>; main?: string; types?: string; exports?: unknown; dependencies?: Record<string, string>; peerDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }`
    - `parsePackJson(stdout: string): PackResult[]`
    - `exportTargets(exports: unknown): string[]`
    - `binTargets(m: Manifest): Record<string, string>`
    - `inspectPack(pack: PackResult, manifest: Manifest, versions: ReadonlyMap<string, string>): string[]`
  - `scripts/ops/release-check.ts`: `releaseCheck(root: string, o: { keep: boolean; log(line: string): void }): Promise<string[]>`. `npm run release:check [-- --keep]` thoát 1 khi có vấn đề. Task 14 chạy lệnh này trong job `publish` trước khi publish.
  - Job `packages` trong `ci.yml`.

Lệnh làm gì, theo thứ tự:
1. Build 4 gói theo thứ tự phụ thuộc, rồi `npm run check:pkg -w <dir>` cho từng gói.
2. `npm pack -w <dir> --json --pack-destination <tmp>/tarballs`, rồi `inspectPack`: có `package.json` và `README.md`; mọi file của `bin`, `main`, `types`, `exports` nằm trong tarball; không có `.env*`, file test, `*.tsbuildinfo`; phụ thuộc nội bộ ghim đúng phiên bản đang phát hành; không có `workspace:`, `file:`, `link:`.
3. Thư mục trống `<tmp>/smoke`: `npm init -y`, rồi `npm install` cả 4 tarball **trong một lệnh**. Phụ thuộc nội bộ được thoả bởi chính các tarball đó, nên không có request nào tới registry cho gói `@atropyle/*`. Trước ngày publish, nếu npm vẫn hỏi registry thì lệnh hỏng với E404, đúng là lỗi cần bắt.
4. Trên devnet (anvil, cổng 8651): chạy bin đã cài của `atropyle` và `atropyle-mcp`, import `@atropyle/sdk` bằng ESM và CJS, import `@atropyle/circuits`.

- [ ] **Step 1: Viết test thất bại**

`scripts/test/release-check.test.ts`:

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { binTargets, exportTargets, inspectPack, type Manifest, type PackResult, parsePackJson } from '../ops/pack';
import { readWorkflows } from '../ops/workflows';

const ROOT = join(import.meta.dirname, '..', '..');
const VERSIONS = new Map([
  ['@atropyle/circuits', '0.1.0'],
  ['@atropyle/sdk', '0.1.0'],
  ['@atropyle/mcp', '0.1.0'],
  ['atropyle', '0.1.0'],
]);
const files = (...paths: string[]) => paths.map((path) => ({ path, size: 10 }));
const MCP: Manifest = {
  name: '@atropyle/mcp',
  version: '0.1.0',
  bin: { 'atropyle-mcp': './dist/bin.js' },
  main: './dist/index.js',
  types: './dist/index.d.ts',
  exports: {
    '.': { types: './dist/index.d.ts', default: './dist/index.js' },
    './ops': { types: './dist/ops/index.d.ts', default: './dist/ops/index.js' },
    './package.json': './package.json',
  },
  dependencies: { '@atropyle/sdk': '0.1.0', viem: '^2.45.0' },
};
const pack = (paths: string[]): PackResult => ({
  name: '@atropyle/mcp',
  version: '0.1.0',
  filename: 'atropyle-mcp-0.1.0.tgz',
  unpackedSize: 100,
  files: files(...paths),
});
const GOOD = ['package.json', 'README.md', 'dist/bin.js', 'dist/index.js', 'dist/index.d.ts', 'dist/ops/index.js', 'dist/ops/index.d.ts'];

describe('npm pack output', () => {
  it('parses the JSON that npm pack prints, even after lifecycle output', () => {
    const stdout = `> @atropyle/mcp@0.1.0 prepack\n> true\n\n${JSON.stringify([{ id: '@atropyle/mcp@0.1.0', name: '@atropyle/mcp', version: '0.1.0', size: 50, unpackedSize: 100, shasum: 'x', integrity: 'y', filename: 'atropyle-mcp-0.1.0.tgz', files: [{ path: 'package.json', size: 10, mode: 420 }], entryCount: 1, bundled: [] }], null, 2)}\n`;
    expect(parsePackJson(stdout)).toEqual([
      { name: '@atropyle/mcp', version: '0.1.0', filename: 'atropyle-mcp-0.1.0.tgz', unpackedSize: 100, files: [{ path: 'package.json', size: 10 }] },
    ]);
    expect(() => parsePackJson('npm error code E404')).toThrow('npm pack');
  });

  it('collects every file named by exports, and every bin', () => {
    expect(exportTargets(MCP.exports).sort()).toEqual([
      './dist/index.d.ts',
      './dist/index.js',
      './dist/ops/index.d.ts',
      './dist/ops/index.js',
      './package.json',
    ]);
    expect(exportTargets({ '.': { import: './a.js', require: null } })).toEqual(['./a.js']);
    expect(binTargets(MCP)).toEqual({ 'atropyle-mcp': './dist/bin.js' });
    expect(binTargets({ name: '@scope/tool', version: '1.0.0', bin: './cli.js' })).toEqual({ tool: './cli.js' });
  });
});

describe('inspectPack', () => {
  it('accepts a complete package', () => {
    expect(inspectPack(pack(GOOD), MCP, VERSIONS)).toEqual([]);
  });

  it('flags files that the manifest names but the tarball lacks', () => {
    const problems = inspectPack(pack(GOOD.filter((p) => p !== 'dist/bin.js' && p !== 'dist/ops/index.d.ts' && p !== 'README.md')), MCP, VERSIONS);
    expect(problems).toEqual([
      '@atropyle/mcp: README.md is not in the tarball',
      '@atropyle/mcp: bin atropyle-mcp (./dist/bin.js) is not in the tarball',
      '@atropyle/mcp: exports target ./dist/ops/index.d.ts is not in the tarball',
    ]);
  });

  it('flags internal dependencies that are not the release version, and local protocols', () => {
    const m: Manifest = { ...MCP, dependencies: { '@atropyle/sdk': '^0.0.9', zod: 'workspace:*' }, peerDependencies: { viem: 'file:../viem' } };
    expect(inspectPack(pack(GOOD), m, VERSIONS)).toEqual([
      '@atropyle/mcp: dependency @atropyle/sdk is ^0.0.9, but the release version is 0.1.0',
      '@atropyle/mcp: dependency zod uses a local protocol (workspace:*)',
      '@atropyle/mcp: dependency viem uses a local protocol (file:../viem)',
    ]);
  });

  it('flags files that must never be published', () => {
    const problems = inspectPack(pack([...GOOD, '.env', 'dist/index.test.js', 'test/fixtures/a.json', 'tsconfig.tsbuildinfo']), MCP, VERSIONS);
    expect(problems).toEqual([
      '@atropyle/mcp: .env must not be published',
      '@atropyle/mcp: dist/index.test.js must not be published',
      '@atropyle/mcp: test/fixtures/a.json must not be published',
      '@atropyle/mcp: tsconfig.tsbuildinfo must not be published',
    ]);
  });
});

describe('ci.yml', () => {
  it('runs the release check with Foundry for the devnet', () => {
    const ci = readWorkflows(join(ROOT, '.github', 'workflows')).find((f) => f.name === 'ci.yml');
    const steps = ci?.doc.jobs?.packages?.steps ?? [];
    expect(steps.some((s) => s.uses?.startsWith('foundry-rs/foundry-toolchain@'))).toBe(true);
    expect(steps.map((s) => s.run ?? '')).toContain('npm run release:check');
  });
});
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `npm run test:scripts -- release-check`
Expected: FAIL vì không tìm thấy `../ops/pack`.

- [ ] **Step 3: Viết `scripts/ops/pack.ts`**

```ts
// Pure checks on the output of `npm pack --json` and on the manifest of a package about to be published.

export interface PackedFile {
  path: string;
  size: number;
}

export interface PackResult {
  name: string;
  version: string;
  filename: string;
  unpackedSize: number;
  files: PackedFile[];
}

export interface Manifest {
  name: string;
  version: string;
  bin?: string | Record<string, string>;
  main?: string;
  types?: string;
  exports?: unknown;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

export function parsePackJson(stdout: string): PackResult[] {
  // Lifecycle scripts may print before the JSON array, so start at the first line that opens one.
  const start = stdout.search(/^\[/m);
  if (start < 0) throw new Error(`npm pack did not print JSON: ${stdout.slice(0, 200)}`);
  const raw = JSON.parse(stdout.slice(start)) as {
    name: string;
    version: string;
    filename: string;
    unpackedSize: number;
    files: { path: string; size: number }[];
  }[];
  return raw.map((r) => ({
    name: r.name,
    version: r.version,
    filename: r.filename,
    unpackedSize: r.unpackedSize,
    files: r.files.map((f) => ({ path: f.path, size: f.size })),
  }));
}

export function exportTargets(exports: unknown): string[] {
  if (typeof exports === 'string') return [exports];
  if (exports === null || typeof exports !== 'object') return [];
  return Object.values(exports).flatMap(exportTargets);
}

export function binTargets(m: Manifest): Record<string, string> {
  if (typeof m.bin === 'string') return { [m.name.replace(/^@[^/]+\//, '')]: m.bin };
  return { ...(m.bin ?? {}) };
}

const FORBIDDEN = [/(^|\/)\.env(\.|$)/, /\.test\.[cm]?[jt]sx?$/, /(^|\/)tests?\//, /\.tsbuildinfo$/];
const LOCAL_PROTOCOL = /^(workspace|file|link|portal):/;

export function inspectPack(pack: PackResult, manifest: Manifest, versions: ReadonlyMap<string, string>): string[] {
  const out: string[] = [];
  const has = new Set(pack.files.map((f) => f.path));
  const inTarball = (p: string) => has.has(p.replace(/^\.\//, ''));
  for (const required of ['package.json', 'README.md']) {
    if (!has.has(required)) out.push(`${pack.name}: ${required} is not in the tarball`);
  }
  for (const [name, target] of Object.entries(binTargets(manifest))) {
    if (!inTarball(target)) out.push(`${pack.name}: bin ${name} (${target}) is not in the tarball`);
  }
  for (const field of ['main', 'types'] as const) {
    const target = manifest[field];
    if (target && !inTarball(target)) out.push(`${pack.name}: ${field} (${target}) is not in the tarball`);
  }
  for (const target of new Set(exportTargets(manifest.exports))) {
    if (!inTarball(target)) out.push(`${pack.name}: exports target ${target} is not in the tarball`);
  }
  const deps = { ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies };
  for (const [dep, spec] of Object.entries(deps)) {
    const release = versions.get(dep);
    if (LOCAL_PROTOCOL.test(spec)) out.push(`${pack.name}: dependency ${dep} uses a local protocol (${spec})`);
    else if (release !== undefined && spec !== release) {
      out.push(`${pack.name}: dependency ${dep} is ${spec}, but the release version is ${release}`);
    }
  }
  for (const f of pack.files) {
    if (FORBIDDEN.some((re) => re.test(f.path))) out.push(`${pack.name}: ${f.path} must not be published`);
  }
  return out;
}
```

Run: `npm run test:scripts -- release-check -t "npm pack output|inspectPack"`
Expected: PASS 6 test; test `ci.yml` bị `-t` bỏ qua.

- [ ] **Step 4: Viết `scripts/ops/release-check.ts`**

```ts
// npm run release:check [-- --keep]
// Proves that the four packages work when installed from their tarballs into an empty directory, as a user would.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDevnetEnv } from '../lib/devnet-env';
import { binTargets, inspectPack, type Manifest, parsePackJson } from './pack';
import { PUBLISH_PACKAGES } from './packages';

interface Ran {
  code: number;
  stdout: string;
  stderr: string;
}

const WIN = process.platform === 'win32';

function run(cmd: string, args: readonly string[], cwd: string): Ran {
  // npm is npm.cmd on Windows, which Node only starts through a shell. Arguments here never contain spaces.
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: WIN && cmd === 'npm', env: { ...process.env, NO_COLOR: '1' } });
  return { code: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function installedBin(smoke: string, pkg: string, bin: string): string {
  const dir = join(smoke, 'node_modules', ...pkg.split('/'));
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Manifest;
  const target = binTargets(manifest)[bin];
  if (!target) throw new Error(`${pkg} has no bin ${bin}`);
  const file = join(dir, target);
  if (!existsSync(join(smoke, 'node_modules', '.bin', WIN ? `${bin}.cmd` : bin))) throw new Error(`npm did not link the ${bin} bin`);
  if (!readFileSync(file, 'utf8').startsWith('#!/usr/bin/env node')) throw new Error(`${target} of ${pkg} has no node shebang`);
  return file;
}

const SMOKE_ESM = `import { createAtropyle, parseDeployment } from '@atropyle/sdk';
import { buildAll, verifyPolicy } from '@atropyle/circuits';
import { readFileSync } from 'node:fs';
if (typeof buildAll !== 'function' || typeof verifyPolicy !== 'function') throw new Error('@atropyle/circuits exports are missing');
const [file, vault] = process.argv.slice(2);
const atro = createAtropyle({ chain: parseDeployment(JSON.parse(readFileSync(file, 'utf8'))) });
const status = await atro.vault(vault).status();
console.log(JSON.stringify({ state: status.state }));
`;

const SMOKE_CJS = `const sdk = require('@atropyle/sdk');
if (typeof sdk.createAtropyle !== 'function') throw new Error('require(@atropyle/sdk) has no createAtropyle');
console.log('cjs ok');
`;

export async function releaseCheck(root: string, o: { keep: boolean; log(line: string): void }): Promise<string[]> {
  const problems: string[] = [];
  const versions = new Map(
    PUBLISH_PACKAGES.map((p) => [p.name, (JSON.parse(readFileSync(join(root, p.dir, 'package.json'), 'utf8')) as Manifest).version]),
  );
  const tmp = mkdtempSync(join(tmpdir(), 'atropyle-release-'));
  const tarballs: string[] = [];
  mkdirSync(join(tmp, 'tarballs'));
  try {
    for (const p of PUBLISH_PACKAGES) {
      o.log(`build and lint ${p.name}`);
      for (const script of ['build', 'check:pkg']) {
        const r = run('npm', ['run', script, '-w', p.dir], root);
        if (r.code !== 0) problems.push(`${p.name}: npm run ${script} failed\n${r.stdout}${r.stderr}`);
      }
      const packed = run('npm', ['pack', '-w', p.dir, '--json', '--pack-destination', join(tmp, 'tarballs')], root);
      if (packed.code !== 0) {
        problems.push(`${p.name}: npm pack failed\n${packed.stderr}`);
        continue;
      }
      const [result] = parsePackJson(packed.stdout);
      const manifest = JSON.parse(readFileSync(join(root, p.dir, 'package.json'), 'utf8')) as Manifest;
      problems.push(...inspectPack(result, manifest, versions));
      tarballs.push(join(tmp, 'tarballs', result.filename));
      o.log(`packed ${result.filename}: ${result.files.length} files, ${result.unpackedSize} bytes unpacked`);
    }
    if (problems.length > 0) return problems;

    const smoke = join(tmp, 'smoke');
    mkdirSync(smoke);
    run('npm', ['init', '-y'], smoke);
    o.log('install the four tarballs into an empty directory');
    const installed = run('npm', ['install', '--no-audit', '--no-fund', ...tarballs], smoke);
    if (installed.code !== 0) return [`npm install of the tarballs failed\n${installed.stdout}${installed.stderr}`];
    writeFileSync(join(smoke, 'smoke.mjs'), SMOKE_ESM);
    writeFileSync(join(smoke, 'smoke.cjs'), SMOKE_CJS);

    const cli = installedBin(smoke, 'atropyle', 'atropyle');
    const mcp = installedBin(smoke, '@atropyle/mcp', 'atropyle-mcp');
    const env = await startDevnetEnv({ port: 8651 });
    try {
      const vault = env.vaults.simple;
      const dep = ['--deployment', env.deploymentFile];
      const checks: [string, string[], (r: Ran) => string | null][] = [
        ['atropyle --version', [cli, '--version'], (r) => (r.stdout.trim() === versions.get('atropyle') ? null : `printed ${r.stdout.trim()}`)],
        ['atropyle-mcp --help', [mcp, '--help'], () => null],
        ['atropyle status --json', [cli, 'status', vault, '--json', ...dep], (r) => (JSON.parse(r.stdout).schemaVersion === 1 ? null : 'no schemaVersion 1')],
        [
          'atropyle verify --vault',
          [cli, 'verify', '--vault', vault, '--no-policy', '--verify-rpc', env.rpcUrl, '--single-rpc', '--json', ...dep],
          (r) => (JSON.parse(r.stdout).ok === true ? null : 'ok is not true'),
        ],
        ['ESM import of @atropyle/sdk and @atropyle/circuits', [join(smoke, 'smoke.mjs'), env.deploymentFile, vault], (r) => (JSON.parse(r.stdout).state === 'active' ? null : `state ${r.stdout.trim()}`)],
        ['CJS require of @atropyle/sdk', [join(smoke, 'smoke.cjs')], (r) => (r.stdout.trim() === 'cjs ok' ? null : r.stdout.trim())],
      ];
      for (const [name, args, judge] of checks) {
        const r = run(process.execPath, args, smoke);
        let why: string | null = r.code === 0 ? null : `exit code ${r.code}`;
        if (why === null) {
          try {
            why = judge(r);
          } catch (e) {
            why = `unreadable output: ${(e as Error).message}`;
          }
        }
        o.log(`${why === null ? 'ok  ' : 'FAIL'} ${name}`);
        if (why !== null) problems.push(`${name}: ${why}\n${r.stdout}${r.stderr}`);
      }
    } finally {
      await env.stop();
    }
    return problems;
  } finally {
    if (o.keep) o.log(`kept ${tmp}`);
    else rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1]?.endsWith('release-check.ts')) {
  const problems = await releaseCheck(process.cwd(), { keep: process.argv.includes('--keep'), log: (l) => console.error(l) });
  for (const p of problems) console.error(`release:check: ${p}`);
  if (problems.length > 0) process.exitCode = 1;
  else console.log('release:check: the four packages install from their tarballs and run on the devnet');
}
```

Ghi chú:
- Vault `simple` của devnet là một Drill ở trạng thái `active` (Plan 2 `seedDevnet`), nên `state === 'active'` là kết quả đúng.
- Lệnh chạy bin bằng `process.execPath <file>` sau khi kiểm npm đã tạo link trong `node_modules/.bin` và file có shebang. Cách này giống hệt máy người dùng mà không cần shell, nên chạy được cả trên Windows.
- Không có `--keep` thì thư mục tạm bị xoá cả khi lỗi.

Thêm vào `scripts` của `package.json` gốc:

```json
"release:check": "tsx scripts/ops/release-check.ts"
```

Thêm vào cuối khối `jobs:` của `.github/workflows/ci.yml`:

```yaml
  packages:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v7
        with:
          submodules: recursive
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: v1.9.0
      - run: npm ci
      - run: forge build
        working-directory: contracts
      - run: npm run release:check
```

- [ ] **Step 5: Chạy test, rồi chạy lệnh thật**

Run: `npm run test:scripts -- release-check workflows`
Expected: PASS 7 test của `release-check`, 8 test của `workflows`.

Run: `npm run release:check`
Expected: stderr in `packed atropyle-circuits-0.1.0.tgz: …`, bốn dòng `packed …`, rồi sáu dòng `ok   …`; stdout dòng cuối `release:check: the four packages install from their tarballs and run on the devnet`; thoát 0. Lệnh cần mạng để tải viem, zod, commander… từ registry, và cần `anvil` cùng `forge` trên `PATH`.

Nếu một dòng `FAIL`: chạy lại với `-- --keep`, vào thư mục tạm đã in, chạy tay đúng lệnh hỏng để xem lỗi. Lỗi thường gặp: thiếu thư mục trong `files` của `package.json`, `bin` trỏ sai, hay gói trỏ tới phiên bản `@atropyle/*` khác `0.1.0`. Sửa ở gói tương ứng (Plan 2 hay Plan 3), không nới luật ở `pack.ts`.

Run: `npm run typecheck:scripts && npx biome check --write scripts/ops/pack.ts scripts/ops/release-check.ts scripts/test/release-check.test.ts && npx biome ci .`
Expected: thoát 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/ops/pack.ts scripts/ops/release-check.ts scripts/test/release-check.test.ts package.json .github/workflows/ci.yml
git commit -m "ci(release): release:check packs, lints and installs the four tarballs, then runs them on a devnet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 14: `release.yml` (changesets, npm có provenance, Worker, Pages), CodeQL, Dependabot

**Files:**
- Create: `.github/workflows/release.yml`, `.github/workflows/codeql.yml`, `.github/dependabot.yml`, `.changeset/config.json`, `.changeset/README.md`
- Modify: `package.json` (gốc: devDependency `@changesets/cli`, script `release:version`, `release:publish`), `package-lock.json`, `CONTRIBUTING.md` (mục "Releases")
- Test: `scripts/test/release.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `PUBLISH_PACKAGES`; biến repo `NPM_PUBLISH`, `DEPLOY_WORKER`, `DEPLOY_PAGES` (mặc định `false`).
  - Task 7: `readWorkflows`, `auditWorkflows`, `WRITE_PERMISSIONS['release.yml']` (`version`: `contents`, `pull-requests`; `publish`: `contents`, `id-token`; `pages`: `pages`, `id-token`), `WRITE_PERMISSIONS['codeql.yml']` (`analyze`: `security-events`).
  - Task 13: `npm run release:check`.
  - Plan 4: `npm run site:build -- --target pages` → `site-dist/pages/` (web ở gốc, docs ở `docs/`, có `.nojekyll`); đọc `VITE_WORKER_URL`, `VITE_TELEGRAM_BOT` từ môi trường.
  - Plan 5: `apps/worker` với wrangler `4.164.0`, D1 tên `atropyle`; lệnh `wrangler d1 migrations apply atropyle --remote` rồi `wrangler deploy`. Secret của Worker (`TELEGRAM_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `KEEPER_KEY`) do người dùng đặt bằng `wrangler secret put`; workflow không bao giờ đụng tới.
  - `changesets/action` v2.1.2 (Quyết định 17): `select-mode` (output `mode`: `version`, `publish` hoặc `none`), `version` (input `script`, `commit-message`, `pr-title`; output `pr-number`), `publish` (input `script`, `create-github-releases`; output `published`, `published-packages`).
- Produces:
  - `release.yml` với job `plan`, `version`, `publish`, `worker`, `pages-build`, `pages`.
  - Script gốc `release:version` (`changeset version && npm install --package-lock-only --ignore-scripts`), `release:publish` (`changeset publish`).
  - `codeql.yml` job `analyze`; `.github/dependabot.yml`.

Cách release chạy:
- Mỗi push lên `main`, job `plan` hỏi `select-mode`. Có changeset chưa dùng thì `mode` là `version`: job `version` mở hay cập nhật PR "Version Packages". Không có changeset thì `mode` là `publish`: job `publish` chạy `changeset publish`, lệnh này chỉ publish phiên bản chưa có trên npm.
- Job `publish` chỉ chạy khi `vars.NPM_PUBLISH == 'true'`. Nó chạy `release:check` trước, nên không bao giờ publish gói chưa qua smoke test từ tarball.
- Xác thực npm: có secret `NPM_TOKEN` (chỉ lần đầu) thì ghi `~/.npmrc`; không có thì npm ≥ 11.5.1 dùng OIDC (trusted publishing). Cả hai cách đều có provenance, vì job có `id-token: write` và mỗi gói có `publishConfig.provenance: true`.
- `worker` và `pages-build` chạy ở mỗi push lên `main` khi biến tương ứng là `'true'`, độc lập với npm.
- Workflow này không có cache npm (Quyết định 22).

- [ ] **Step 1: Cài changesets, viết cấu hình**

Run: `npm install -D -E @changesets/cli@3.0.3`
Expected: thoát 0; `package.json` gốc có `"@changesets/cli": "3.0.3"`.

Thêm vào `scripts` của `package.json` gốc:

```json
"release:version": "changeset version && npm install --package-lock-only --ignore-scripts",
"release:publish": "changeset publish"
```

`.changeset/config.json` (viết tay, vì `changeset init` của v3 hỏi tương tác):

```json
{
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [["@atropyle/circuits", "@atropyle/sdk", "@atropyle/mcp", "atropyle"]],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch"
}
```

`.changeset/README.md`:

```md
# Changesets

Every pull request that changes what users of `atropyle`, `@atropyle/sdk`, `@atropyle/mcp` or `@atropyle/circuits` see needs a changeset:

    npx changeset

Pick the packages, the bump (patch, minor or major) and write one sentence for the changelog. The four packages are released together with the same version.

On `main`, the release workflow opens a "Version Packages" pull request. Merging it publishes the new version to npm with provenance. Pull requests opened by that workflow do not start CI on their own: close and reopen the pull request to run CI before merging it.
```

Thêm vào cuối `CONTRIBUTING.md`:

````md

## Releases

The four packages are versioned together with [Changesets](.changeset/README.md). If your change affects users of a package, run `npx changeset` and commit the file it writes. Never publish from your own machine: `.github/workflows/release.yml` publishes from CI with npm provenance, after `npm run release:check` has installed and run every tarball on a devnet.
````

- [ ] **Step 2: Viết test thất bại**

`scripts/test/release.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { PUBLISH_PACKAGES } from '../ops/packages';
import { readWorkflows, type Step } from '../ops/workflows';

const ROOT = join(import.meta.dirname, '..', '..');
const workflows = readWorkflows(join(ROOT, '.github', 'workflows'));
const release = workflows.find((f) => f.name === 'release.yml');
const codeql = workflows.find((f) => f.name === 'codeql.yml');
const jobs = release?.doc.jobs ?? {};
const runs = (steps: Step[] | undefined) => (steps ?? []).map((s) => s.run ?? '');
type JobExtra = { if?: string; needs?: string | string[]; environment?: unknown };
const extra = (name: string) => jobs[name] as unknown as JobExtra | undefined;

describe('release.yml', () => {
  it('publishes, deploys the Worker and deploys Pages only when the user turns each on', () => {
    expect(extra('publish')?.if).toContain("needs.plan.outputs.mode == 'publish'");
    expect(extra('publish')?.if).toContain("vars.NPM_PUBLISH == 'true'");
    expect(extra('version')?.if).toContain("needs.plan.outputs.mode == 'version'");
    expect(extra('worker')?.if).toContain("vars.DEPLOY_WORKER == 'true'");
    expect(extra('pages-build')?.if).toContain("vars.DEPLOY_PAGES == 'true'");
    expect(extra('pages')?.needs).toBe('pages-build');
  });

  it('checks the tarballs and the npm version before it publishes with provenance', () => {
    const publish = jobs.publish;
    expect(publish?.permissions).toEqual({ contents: 'write', 'id-token': 'write' });
    expect(extra('publish')?.environment).toBe('npm');
    const steps = publish?.steps ?? [];
    const r = runs(steps);
    const check = r.indexOf('npm run release:check');
    const npmVersion = r.findIndex((x) => x.includes('11.5.1'));
    const publishStep = steps.findIndex((s) => s.uses?.startsWith('changesets/action/publish@'));
    expect(check).toBeGreaterThan(0);
    expect(npmVersion).toBeGreaterThan(check);
    expect(publishStep).toBeGreaterThan(npmVersion);
    expect(steps[publishStep].with?.script).toBe('npm run release:publish');
    const npmrc = steps.find((s) => (s.run ?? '').includes('.npmrc'));
    expect(npmrc?.run).toContain('if [ -n "$NPM_TOKEN" ]');
    expect(npmrc?.env?.NPM_TOKEN).toBe('${{ secrets.NPM_TOKEN }}');
    for (const s of steps.filter((x) => x.uses?.startsWith('actions/setup-node@'))) expect(s.with?.cache).toBeUndefined();
  });

  it('opens the Version Packages pull request with the lockfile updated', () => {
    const step = jobs.version?.steps?.find((s) => s.uses?.startsWith('changesets/action/version@'));
    expect(step?.with?.script).toBe('npm run release:version');
    expect(jobs.version?.permissions).toEqual({ contents: 'write', 'pull-requests': 'write' });
  });

  it('deploys the Pages build of the site, web and docs', () => {
    const build = jobs['pages-build']?.steps ?? [];
    expect(runs(build)).toContain('npm run site:build -- --target pages');
    expect(build.find((s) => s.uses?.startsWith('actions/upload-pages-artifact@'))?.with?.path).toBe('site-dist/pages');
    expect(jobs.pages?.permissions).toEqual({ pages: 'write', 'id-token': 'write' });
    expect(jobs.pages?.steps?.some((s) => s.uses?.startsWith('actions/deploy-pages@'))).toBe(true);
  });

  it('deploys the Worker from apps/worker, D1 migrations first', () => {
    const step = jobs.worker?.steps?.find((s) => s.uses?.startsWith('cloudflare/wrangler-action@'));
    expect(step?.with?.workingDirectory).toBe('apps/worker');
    expect(step?.with?.apiToken).toBe('${{ secrets.CLOUDFLARE_API_TOKEN }}');
    const command = String(step?.with?.command ?? '');
    expect(command.indexOf('d1 migrations apply atropyle --remote')).toBeGreaterThanOrEqual(0);
    expect(command.indexOf('d1 migrations apply')).toBeLessThan(command.indexOf('\ndeploy'));
  });
});

describe('changesets, CodeQL and Dependabot', () => {
  it('versions the four packages together and publishes them as public', () => {
    const config = JSON.parse(readFileSync(join(ROOT, '.changeset', 'config.json'), 'utf8'));
    expect(config.fixed).toEqual([PUBLISH_PACKAGES.map((p) => p.name)]);
    expect(config).toMatchObject({ access: 'public', baseBranch: 'main', commit: false });
    const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;
    expect(scripts['release:version']).toContain('changeset version');
    expect(scripts['release:publish']).toBe('changeset publish');
  });

  it('CodeQL scans JS/TS and the workflows without a build, every week', () => {
    const analyze = codeql?.doc.jobs?.analyze;
    expect(analyze?.strategy?.matrix?.language).toEqual(['javascript-typescript', 'actions']);
    const init = analyze?.steps?.find((s) => s.uses?.startsWith('github/codeql-action/init@'));
    expect(init?.with?.['build-mode']).toBe('none');
    expect(((codeql?.doc.on ?? {}) as { schedule?: unknown[] }).schedule).toHaveLength(1);
  });

  it('Dependabot opens security updates only', () => {
    const config = parse(readFileSync(join(ROOT, '.github', 'dependabot.yml'), 'utf8')) as {
      updates: { 'package-ecosystem': string; 'open-pull-requests-limit': number }[];
    };
    expect(config.updates.map((u) => u['package-ecosystem']).sort()).toEqual(['github-actions', 'npm']);
    for (const u of config.updates) expect(u['open-pull-requests-limit']).toBe(0);
  });
});
```

- [ ] **Step 3: Chạy test để thấy thất bại**

Run: `npm run test:scripts -- release.test`
Expected: FAIL: `release.yml` và `codeql.yml` chưa có (`jobs.publish` là `undefined`), `.github/dependabot.yml` không tìm thấy.

- [ ] **Step 4: Viết `.github/workflows/release.yml`**

```yaml
name: release

# Publishes the four npm packages with provenance, deploys the Worker and deploys GitHub Pages.
# Every part is off until the user sets the matching repository variable to 'true'. Nothing here signs a transaction.
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  plan:
    runs-on: ubuntu-latest
    outputs:
      mode: ${{ steps.mode.outputs.mode }}
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - id: mode
        uses: changesets/action/select-mode@v2

  version:
    needs: plan
    if: needs.plan.outputs.mode == 'version'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - uses: changesets/action/version@v2
        with:
          script: npm run release:version
          commit-message: 'chore(release): version packages'
          pr-title: 'chore(release): version packages'

  publish:
    needs: plan
    if: needs.plan.outputs.mode == 'publish' && vars.NPM_PUBLISH == 'true'
    runs-on: ubuntu-latest
    environment: npm
    timeout-minutes: 30
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v7
        with:
          submodules: recursive
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: v1.9.0
      - run: npm ci
      - run: forge build
        working-directory: contracts
      - run: npm run release:check
      - name: Require npm 11.5.1 or later for trusted publishing
        run: |
          node -e "const [a,b,c]=process.argv[1].split('.').map(Number); if (a<11||(a===11&&(b<5||(b===5&&c<1)))) { console.error('npm '+process.argv[1]+' is older than 11.5.1'); process.exit(1) }" "$(npm --version)"
      - name: Use NPM_TOKEN for the first publish only
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          if [ -n "$NPM_TOKEN" ]; then
            echo "//registry.npmjs.org/:_authToken=${NPM_TOKEN}" > "$HOME/.npmrc"
            echo "Publishing with NPM_TOKEN. Configure trusted publishing, then delete this secret."
          else
            echo "No NPM_TOKEN: npm uses trusted publishing (OIDC)."
          fi
      - uses: changesets/action/publish@v2
        with:
          script: npm run release:publish
          create-github-releases: true

  worker:
    if: vars.DEPLOY_WORKER == 'true'
    runs-on: ubuntu-latest
    environment: cloudflare
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - run: npm run build -w circuits && npm run build -w packages/sdk
      - uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          wranglerVersion: '4.164.0'
          workingDirectory: apps/worker
          command: |
            d1 migrations apply atropyle --remote
            deploy

  pages-build:
    if: vars.DEPLOY_PAGES == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci
      - run: npm run build -w circuits && npm run build -w packages/sdk
      - run: npm run site:build -- --target pages
        env:
          VITE_WORKER_URL: ${{ vars.WORKER_URL }}
          VITE_TELEGRAM_BOT: ${{ vars.TELEGRAM_BOT }}
      - uses: actions/upload-pages-artifact@v5
        with:
          path: site-dist/pages

  pages:
    needs: pages-build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    permissions:
      pages: write
      id-token: write
    steps:
      - id: deploy
        uses: actions/deploy-pages@v5
```

Ghi chú cho người thực thi:
- `@v2`, `@v4`, `@v5`, `@v7` ở đây là major hiện tại; Task 16 ghim SHA cho cả sub-action (`changesets/action/select-mode`, `github/codeql-action/init`…).
- `wrangler-action` chạy từng dòng của `command` như một lệnh `wrangler` riêng, theo thứ tự. Migration chạy trước `deploy`, nên code mới không bao giờ chạy trên schema cũ.
- `CLOUDFLARE_API_TOKEN` và `CLOUDFLARE_ACCOUNT_ID` là secret của environment `cloudflare`, không phải secret cấp repo. `NPM_TOKEN` là secret của environment `npm`. Workflow khác không đọc được chúng.
- Job `publish` chạy lại `release:check`, kể cả khi CI đã xanh. Mất vài phút, đổi lại không có gói nào lên npm mà chưa được cài thử từ tarball.
- README của `changesets/action/publish` không nói rõ cách nó đẩy tag. Nếu lần chạy thật (Step 9) publish xong mà bước tạo tag hay release báo lỗi xác thực git, đổi `persist-credentials` của checkout **trong job `publish`** thành `true` rồi chạy lại; `changeset publish` bỏ qua phiên bản đã có trên npm, nên chạy lại không publish trùng.

- [ ] **Step 5: Viết `codeql.yml` và `dependabot.yml`**

`.github/workflows/codeql.yml`:

```yaml
name: codeql

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: '23 4 * * 1'

permissions:
  contents: read

jobs:
  analyze:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    permissions:
      actions: read
      contents: read
      security-events: write
    strategy:
      fail-fast: false
      matrix:
        language: [javascript-typescript, actions]
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: github/codeql-action/init@v4
        with:
          languages: ${{ matrix.language }}
          build-mode: none
      - uses: github/codeql-action/analyze@v4
        with:
          category: /language:${{ matrix.language }}
```

Khi một job khai báo `permissions`, mọi quyền không ghi là `none`. Vì vậy `analyze` ghi rõ `contents: read` để checkout được.

`.github/dependabot.yml`:

```yaml
# Security updates only: a limit of 0 turns off version updates but still lets
# Dependabot open pull requests for vulnerable dependencies.
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 0
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 0
```

- [ ] **Step 6: Chạy test để thấy qua**

Run: `npm run test:scripts -- release.test workflows readme`
Expected: PASS 8 test của `release.test`, 8 test của `workflows` (luật chung, giờ chạy trên `release.yml` và `codeql.yml`), 12 test của `readme` (link `.changeset/README.md` trong `CONTRIBUTING.md` có thật).

Run: `npx biome check --write scripts/test/release.test.ts && npx biome ci . && npm run typecheck:scripts`
Expected: thoát 0.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/release.yml .github/workflows/codeql.yml .github/dependabot.yml .changeset/config.json .changeset/README.md scripts/test/release.test.ts package.json package-lock.json CONTRIBUTING.md
git commit -m "ci(release): changesets release with npm provenance, Worker and Pages deploys, CodeQL and Dependabot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: `[USER]` Đặt environment, secret và biến cho Worker và Pages (trước 2/12)**

Người dùng chạy trên máy mình (`gh` đã đăng nhập). Agent không chạy bước này.

```bash
# Environments that hold the deploy secrets.
gh api -X PUT repos/duongnq2798/atropyle/environments/npm
gh api -X PUT repos/duongnq2798/atropyle/environments/cloudflare

# Cloudflare: an API token from the "Edit Cloudflare Workers" template, plus "D1: Edit" on the account.
# gh asks for each value on the terminal; do not pass it on the command line.
gh secret set CLOUDFLARE_API_TOKEN --env cloudflare --repo duongnq2798/atropyle
gh secret set CLOUDFLARE_ACCOUNT_ID --env cloudflare --repo duongnq2798/atropyle

# Values the Pages build of the web app reads. Not secrets.
gh variable set WORKER_URL --repo duongnq2798/atropyle --body "https://atropyle-worker.<account>.workers.dev"
gh variable set TELEGRAM_BOT --repo duongnq2798/atropyle --body "<bot username without @>"

gh variable set DEPLOY_WORKER --repo duongnq2798/atropyle --body true
gh variable set DEPLOY_PAGES --repo duongnq2798/atropyle --body true
gh workflow run release.yml --repo duongnq2798/atropyle --ref main
```

Expected: run mới có job `worker` và `pages` xanh, `publish` bị bỏ qua (`NPM_PUBLISH` vẫn `false`). Mở `https://duongnq2798.github.io/atropyle/` và `https://duongnq2798.github.io/atropyle/docs/`: cả hai tải được, ô tìm kiếm của docs chạy. `curl -sS https://atropyle-worker.<account>.workers.dev/health` trả JSON có `ok` hoặc `degraded`.

Thay `<account>` và `<bot username without @>` bằng giá trị thật. Settings → Environments → `npm` và `cloudflare`: nên giới hạn "Deployment branches" ở `main`.

- [ ] **Step 9: `[USER]` Publish `0.1.0` lần đầu (2/12)**

1. Trên npmjs.com: Access Tokens → Generate New Token → Granular Access Token. Quyền "Read and write" cho packages and scopes `@atropyle` và `atropyle`, bật "Bypass two-factor authentication", hết hạn sau 7 ngày.
2. Trên máy:

```bash
gh secret set NPM_TOKEN --env npm --repo duongnq2798/atropyle
gh variable set NPM_PUBLISH --repo duongnq2798/atropyle --body true
gh workflow run release.yml --repo duongnq2798/atropyle --ref main
sleep 10
RUN=$(gh run list --repo duongnq2798/atropyle --workflow release.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$RUN" --repo duongnq2798/atropyle --exit-status
```

Expected: job `publish` xanh; log in `Publishing with NPM_TOKEN.` và bốn dòng publish của changesets; tab Releases có bốn release `…@0.1.0`.

3. Kiểm provenance từ một thư mục trống:

```bash
cd "$(mktemp -d)" && npm init -y >/dev/null
npm install atropyle@0.1.0 @atropyle/sdk@0.1.0 @atropyle/mcp@0.1.0 @atropyle/circuits@0.1.0
npm audit signatures
npx -y atropyle@0.1.0 verify
```

Expected: `npm audit signatures` báo đủ số gói `have verified registry signatures` và `have verified attestations`; `verify` thoát 0.

- [ ] **Step 10: `[USER]` Chuyển sang trusted publishing ngay sau lần đầu**

1. Trên npmjs.com, với **từng** gói `atropyle`, `@atropyle/sdk`, `@atropyle/mcp`, `@atropyle/circuits`: Settings → Trusted Publisher → GitHub Actions. Owner `duongnq2798`, repository `atropyle`, workflow `release.yml`, environment `npm`.
2. Cũng ở Settings của từng gói: Publishing access → "Require two-factor authentication and disallow tokens".
3. Xoá secret và thu hồi token:

```bash
gh secret delete NPM_TOKEN --env npm --repo duongnq2798/atropyle
```

Rồi vào Access Tokens trên npmjs.com và xoá token đã tạo ở Step 9.

Từ đây, merge PR "chore(release): version packages" là publish: job `publish` in `No NPM_TOKEN: npm uses trusted publishing (OIDC).` Lần chạy `proof.yml` kế tiếp (Task 12) cho badge `passing`.

### Task 15: Trang Contracts & deployments (`reference/contracts.md`, sinh từ ABI, NatSpec và `deployments/xlayer.json`)

**Files:**
- Create: `scripts/docs-gen/contract-notes.ts`, `scripts/docs-gen/contracts.ts`
- Generated (bằng lệnh, commit): `apps/docs/src/content/docs/reference/contracts.md`, `apps/docs/src/generated/required-anchors.json`
- Modify: `scripts/docs-gen.ts`, `.github/workflows/ci.yml` (job `docs`), `apps/docs/src/content/docs/index.md`, `apps/docs/src/content/docs/concepts/verification.md`, `README.md`, `CONTRIBUTING.md`
- Test: `scripts/test/contracts-page.test.ts`; sửa `scripts/test/workflows.test.ts`, `apps/docs/test/pages.test.ts`

**Interfaces:**
- Consumes:
  - Plan 2: `vaultAbi`, `factoryAbi` (`packages/sdk/src/abi/index.ts`, chép nguyên từ artifact Foundry nên có `internalType`); `ERROR_INFO` (`packages/sdk/src/errors.ts`); `parseDeployment`, `type Deployment` (`packages/sdk/src/deployments/types.ts`); file `deployments/xlayer.json` (Plan 2 Task 15).
  - Plan 1: artifact `contracts/out/AtropyleVault.sol/AtropyleVault.json` và `contracts/out/AtropyleFactory.sol/AtropyleFactory.json` của `forge build`, trường `metadata.output.userdoc` / `metadata.output.devdoc` (hoặc `rawMetadata`, chuỗi JSON).
  - Task 3: `DocsPart`, `escapeMd`, `REFERENCE_DIR`, `renderPage`, `slugOf` (`scripts/docs-gen/files.ts`); `collectContractErrors(): ContractError[]` (`scripts/docs-gen/errors.ts`) để biết mã SDK của từng error.
  - Task 4: anchor `concepts/how-it-works.html#the-five-states`, `concepts/verification.html#check-one-vault`.
  - Task 6: `extractCommands(file, markdown)`, `checkCommand(c, readHelp)` (`scripts/ops/doc-commands.ts`).
  - Task 7: `readWorkflows`, kiểu `Step` (`scripts/ops/workflows.ts`); job `docs` của `ci.yml`. Task 10: job `scripts` đã chạy `forge build` trước `test:scripts`.
  - Task 11: câu "Contracts, events and errors are documented in the [docs](…)" của README; câu về `docs:gen` của `CONTRIBUTING.md`.
- Produces:
  - `scripts/docs-gen/contract-notes.ts`:
    - `type ContractName = 'AtropyleVault' | 'AtropyleFactory'`
    - `type Caller = 'owner' | 'guardians' | 'anyone' | 'factory' | 'vaults' | 'deployer'`
    - `interface FunctionNote { caller?: Caller | undefined; text?: string | undefined }`
    - `interface ContractNotes { label: string; summary: string; functions: Readonly<Record<string, FunctionNote>>; events: Readonly<Record<string, string>>; errors: Readonly<Record<string, string>> }`
    - `CONTRACT_NOTES: Readonly<Record<ContractName, ContractNotes>>`, `STRUCT_NOTES: Readonly<Record<string, Readonly<Record<string, string>>>>`, `LIBRARY_ERROR_NOTES: Readonly<Record<string, string>>`
  - `scripts/docs-gen/contracts.ts`:
    - `ARTIFACTS: Record<ContractName, string>`, `CONTRACT_NAMES: readonly ContractName[]`
    - `interface ItemDoc { notice?; details?; params?: Record<string, string>; returns?: Record<string, string> }`, `interface NatSpec { notice?; details?; methods: Map<string, ItemDoc>; events: Map<string, ItemDoc>; errors: Map<string, ItemDoc>; stateVariables: Map<string, ItemDoc> }`, `EMPTY_NATSPEC: NatSpec`
    - `natSpecFromArtifact(artifact: unknown): NatSpec`, `readNatSpec(root: string, name: ContractName): NatSpec`, `readAllNatSpec(root: string): Record<ContractName, NatSpec>`
    - `canonicalType(p: AbiParameter): string`, `signatureOf(name: string, inputs: readonly AbiParameter[]): string`, `displayType(p: AbiParameter): string`, `displayParams(params: readonly AbiParameter[]): string`
    - `type ItemKind = 'function' | 'event' | 'error'`, `interface DocItem { kind; name; display; description; caller: string | null; code: string | null }`, `interface ContractModel { name: ContractName; label: string; summary: string; items: DocItem[] }`, `interface StructModel { name: string; fields: StructField[] }`, `interface ContractsModel { contracts: ContractModel[]; structs: StructModel[]; problems: string[] }`, `interface ContractsInput extends ContractsModel { deployment: Deployment | null }`
    - `buildModel(natspec, notes = CONTRACT_NOTES, structNotes = STRUCT_NOTES): ContractsModel`, `loadDeployment(root: string): Deployment | null`, `renderContractsPage(input: ContractsInput): string`, `contractsAnchors(model: ContractsModel): string[]`, `contractsPart(root: string): DocsPart`
  - Trang `reference/contracts.html` (order 7, nằm giữa CLI và Errors trong sidebar) với anchor bắt buộc `#deployments`, `#atropylevault`, `#atropylefactory`, `#types`, `#asset`, `#config`, `#heir`, `#status`, `#timing`. Task 17 dẫn tới `reference/contracts.html#deployments`.
  - `npm run docs:gen` từ nay cần artifact Foundry: chạy `cd contracts && forge build --skip test --skip script` trước.

Cách trang được dựng:
- Danh sách mục lấy từ ABI của SDK (đúng thứ người dùng SDK nhận), không tự liệt kê tay. Mỗi mục có mô tả theo thứ tự: ghi chú viết tay, rồi NatSpec trong artifact (thêm sau "From the source:" khi cả hai cùng có), rồi với error thì thông điệp `ERROR_INFO` của mã SDK. `@param`/`@return` của NatSpec được nối vào cuối mô tả.
- Ghi chú khoá theo **tên** (contract không có hàm overload; bộ sinh ném lỗi nếu gặp overload). Error có mã SDK không cần ghi chú; error thư viện của OpenZeppelin (nằm trong ABI của factory vì `Clones` và `SafeERC20`) lấy ghi chú từ `LIBRARY_ERROR_NOTES`, bảng này được phép có mục không dùng.
- `buildModel` gom mọi chỗ thiếu vào `problems`: mục không có mô tả nào, hàm đổi state mà ghi chú không nêu ai được gọi, ghi chú không khớp mục ABI nào, trường struct không có ghi chú. `contractsPart` dừng khi `problems` khác rỗng, nên `docs:gen -- --check` trong CI bắt được.
- Địa chỉ hiện dưới dạng inline code, link OKLink cũng là inline code (luật DeWEB của Global Constraints).

- [ ] **Step 1: Viết test thất bại**

`scripts/test/contracts-page.test.ts`:

```ts
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Abi, AbiEvent, AbiFunction, Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import { factoryAbi, vaultAbi } from '../../packages/sdk/src/abi/index';
import type { Deployment } from '../../packages/sdk/src/deployments/types';
import { CONTRACT_NOTES } from '../docs-gen/contract-notes';
import {
  buildModel,
  contractsPart,
  displayParams,
  EMPTY_NATSPEC,
  loadDeployment,
  natSpecFromArtifact,
  readAllNatSpec,
  renderContractsPage,
  signatureOf,
} from '../docs-gen/contracts';
import { slugOf } from '../docs-gen/files';
import { checkCommand, extractCommands } from '../ops/doc-commands';

const ROOT = join(import.meta.dirname, '..', '..');
const HELP_DIR = join(ROOT, 'packages', 'cli', 'test', 'snapshots', 'help');
const VAULT = vaultAbi as Abi;
const fn = (name: string) => VAULT.find((i): i is AbiFunction => i.type === 'function' && i.name === name);
const hash = (byte: string): Hex => `0x${byte.repeat(32)}` as Hex;
const NO_NATSPEC = { AtropyleVault: EMPTY_NATSPEC, AtropyleFactory: EMPTY_NATSPEC };

const ARTIFACT = {
  abi: [],
  metadata: {
    output: {
      userdoc: {
        kind: 'user',
        version: 1,
        notice: 'No admin.',
        methods: { 'coverage()': { notice: 'What the vault could move.' } },
        events: { 'Alive(uint64)': { notice: 'Owner is alive.' } },
        errors: { 'NotOwner()': [{ notice: 'Only the owner.' }] },
      },
      devdoc: {
        kind: 'dev',
        version: 1,
        details: 'Clone of one implementation.',
        methods: {
          constructor: { details: 'Locks the implementation.' },
          'voteRecovery(address)': { params: { target: 'New wallet.' } },
          'distribute()': { returns: { released: 'True when a sweep ran.' } },
        },
        stateVariables: { lastAlive: { details: 'Last proof of life.' } },
      },
    },
  },
};

const DEPLOYMENT: Deployment = {
  name: 'xlayer',
  chainId: 196,
  rpcUrls: ['https://rpc.xlayer.tech'],
  quorumRpcUrls: [['https://rpc.xlayer.tech'], ['https://xlayer.drpc.org']],
  explorerUrl: 'https://www.oklink.com/xlayer',
  factory: '0x1111111111111111111111111111111111111111',
  factoryBlock: 12345678n,
  vaultImpl: '0x2222222222222222222222222222222222222222',
  vaultImplCodehash: hash('ab'),
  cpu: '0x3333333333333333333333333333333333333333',
  policyId: 42n,
  treasury: '0x4444444444444444444444444444444444444444',
  feeTokens: ['0x5555555555555555555555555555555555555555', '0x6666666666666666666666666666666666666666'],
  circuits: { kofn5: 40n, ge4: 41n, netlistKeccak: { kofn5: hash('01'), ge4: hash('02'), policy: hash('03') } },
  tapeout: {
    factory: '0x7777777777777777777777777777777777777777',
    beacon: '0x8888888888888888888888888888888888888888',
    beaconSlot: '0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50',
    name: 'Atropyle',
    symbol: 'ATRO',
  },
  builderCode: null,
  webUrl: null,
  logsBlockRange: 100,
};

describe('ABI helpers', () => {
  it('expands tuples in signatures the way solc keys NatSpec', () => {
    const init = fn('initialize');
    expect(signatureOf('initialize', init?.inputs ?? [])).toBe(
      'initialize(address,bool,((address,uint16)[],address[],uint8,bool,(uint32,uint8,uint32),(uint8,address,uint256,uint8)[]),address,uint256)',
    );
    expect(signatureOf('setHeirs', fn('setHeirs')?.inputs ?? [])).toBe('setHeirs((address,uint16)[])');
  });

  it('shows struct names and indexed event parameters', () => {
    expect(displayParams(fn('initialize')?.inputs ?? [])).toBe(
      'address owner_, bool drill_, Config cfg, address cpu_, uint256 policyId_',
    );
    expect(displayParams(fn('setHeirs')?.inputs ?? [])).toBe('Heir[] h');
    const distributed = VAULT.find((i): i is AbiEvent => i.type === 'event' && i.name === 'Distributed');
    expect(displayParams(distributed?.inputs ?? [])).toBe('uint256 indexed assetIndex, address indexed to, uint256 amountOrId');
  });
});

describe('NatSpec', () => {
  it('reads userdoc and devdoc from the metadata of a Foundry artifact', () => {
    const n = natSpecFromArtifact(ARTIFACT);
    expect(n.notice).toBe('No admin.');
    expect(n.details).toBe('Clone of one implementation.');
    expect(n.methods.get('coverage()')).toEqual({ notice: 'What the vault could move.' });
    expect(n.methods.get('constructor')).toEqual({ details: 'Locks the implementation.' });
    expect(n.methods.get('voteRecovery(address)')).toEqual({ params: { target: 'New wallet.' } });
    expect(n.methods.get('distribute()')).toEqual({ returns: { released: 'True when a sweep ran.' } });
    expect(n.events.get('Alive(uint64)')).toEqual({ notice: 'Owner is alive.' });
    expect(n.errors.get('NotOwner()')).toEqual({ notice: 'Only the owner.' });
    expect(n.stateVariables.get('lastAlive')).toEqual({ details: 'Last proof of life.' });
  });

  it('falls back to rawMetadata, and to an empty NatSpec when there are no docs', () => {
    expect(natSpecFromArtifact({ abi: [], rawMetadata: JSON.stringify(ARTIFACT.metadata) })).toEqual(
      natSpecFromArtifact(ARTIFACT),
    );
    expect(natSpecFromArtifact({ abi: [] })).toEqual(EMPTY_NATSPEC);
  });

  it('reports items with neither NatSpec nor a note, and notes that match nothing', () => {
    expect(buildModel(NO_NATSPEC).problems).toContain('AtropyleVault: function coverage has neither NatSpec nor a note');
    const notes = {
      ...CONTRACT_NOTES,
      AtropyleFactory: {
        ...CONTRACT_NOTES.AtropyleFactory,
        events: { ...CONTRACT_NOTES.AtropyleFactory.events, VaultRemoved: 'Not a real event.' },
      },
    };
    expect(buildModel(NO_NATSPEC, notes).problems).toContain(
      'AtropyleFactory: note for event VaultRemoved matches no ABI item',
    );
    expect(buildModel(NO_NATSPEC, CONTRACT_NOTES, { Heir: { account: 'x' } }).problems).toContain(
      'struct Heir: field bps has no note',
    );
  });
});

describe('deployments section', () => {
  const model = buildModel(NO_NATSPEC);

  it('lists the deployed addresses as code, never as external links', () => {
    const md = renderContractsPage({ ...model, deployment: DEPLOYMENT });
    expect(md).toContain('| AtropyleFactory | `0x1111111111111111111111111111111111111111` | Created at block 12345678.');
    expect(md).toContain('| Policy circuit `AtropylePolicy v1` | ID `42` |');
    expect(md).toContain('| Sub-circuit `KofN5` | ID `40` |');
    expect(md).toContain('| Fee token | `0x5555555555555555555555555555555555555555` |');
    expect(md).toContain('| TapeOut beacon | `0x8888888888888888888888888888888888888888` |');
    expect(md).toContain('`https://www.oklink.com/xlayer/address/<address>`');
    expect(md).not.toMatch(/\]\(https?:/);
    expect(md).not.toContain('not deployed on X Layer mainnet yet');
  });

  it('says so when there is no mainnet deployment yet', () => {
    expect(loadDeployment(mkdtempSync(join(tmpdir(), 'atropyle-contracts-')))).toBeNull();
    expect(renderContractsPage({ ...model, deployment: null })).toContain(
      'Atropyle is not deployed on X Layer mainnet yet.',
    );
  });
});

// These read the real Foundry artifacts: run `cd contracts && forge build --skip test --skip script` first.
describe('the real contracts', () => {
  it('document every function, event, error and struct field', () => {
    const model = buildModel(readAllNatSpec(ROOT));
    expect(model.problems).toEqual([]);
    const documented = new Set(['constructor', 'function', 'event', 'error']);
    const abiItems = [vaultAbi as Abi, factoryAbi as Abi].flatMap((abi) => abi.filter((i) => documented.has(i.type)));
    expect(model.contracts.flatMap((c) => c.items)).toHaveLength(abiItems.length);
    expect(model.structs.map((s) => s.name)).toEqual(['Asset', 'Config', 'Heir', 'Status', 'Timing']);
  });

  it('uses the NatSpec that the verified source carries', () => {
    const model = buildModel(readAllNatSpec(ROOT));
    const vault = model.contracts.find((c) => c.name === 'AtropyleVault');
    const item = (name: string) => vault?.items.find((i) => i.name === name);
    expect(item('coverage')?.description).toContain('What the vault could move right now');
    expect(item('voteRecovery')?.description).toContain('Parameter `target`:');
    expect(item('distribute')?.description).toContain('Returns `released`:');
    expect(item('constructor')?.description).toContain('Locks the implementation');
    expect(vault?.summary).toContain('No admin, pause, upgrade, delegatecall or selfdestruct.');
    expect(model.contracts.find((c) => c.name === 'AtropyleFactory')?.summary).toContain('No admin, no pause, no upgrade.');
  });

  it('links each coded revert to its section on the Errors page', () => {
    const md = renderContractsPage({ ...buildModel(readAllNatSpec(ROOT)), deployment: null });
    expect(md).toContain('| `NotOwner()` | [`NOT_OWNER`](errors.html#not_owner) |');
    expect(md).toContain('| `UnsupportedFeeToken()` | [`UNSUPPORTED_FEE_TOKEN`](errors.html#unsupported_fee_token) |');
    expect(md).toContain('| `checkIn()` | Owner |');
    expect(md).toContain('| `status() returns (Status st)` | Read |');
  });

  it('writes the page with its anchors, and only CLI commands that exist', () => {
    const part = contractsPart(ROOT);
    const md = part.files.get('apps/docs/src/content/docs/reference/contracts.md') ?? '';
    expect(md).toMatch(/^title: "Contracts"$/m);
    expect(md).toMatch(/^ {2}order: 7$/m);
    const anchors = part.anchors['reference/contracts.html'];
    expect(anchors).toEqual(['deployments', 'atropylevault', 'atropylefactory', 'types', 'asset', 'config', 'heir', 'status', 'timing']);
    const headings = new Set([...md.matchAll(/^#{2,3} (.+)$/gm)].map((m) => slugOf(m[1])));
    for (const id of anchors) expect(headings.has(id), id).toBe(true);
    const readHelp = (name: string): string | null => {
      const file = join(HELP_DIR, `${name}.txt`);
      return existsSync(file) ? readFileSync(file, 'utf8') : null;
    };
    const commands = extractCommands('reference/contracts.md', md);
    expect(commands.length).toBeGreaterThanOrEqual(2);
    expect(commands.map((c) => checkCommand(c, readHelp)).filter((p) => p !== null)).toEqual([]);
  });
});
```

Thêm vào cuối khối `describe('the repository workflows', …)` của `scripts/test/workflows.test.ts` (dùng lại biến `ci` đã có):

```ts
  it('build the contracts before generating the docs', () => {
    const steps = ci?.doc.jobs?.docs?.steps ?? [];
    const forge = steps.findIndex((s) => s.run?.startsWith('forge build') === true);
    const gen = steps.findIndex((s) => s.run === 'npm run docs:gen -- --check');
    expect(forge).toBeGreaterThan(-1);
    expect(forge).toBeLessThan(gen);
    expect(steps.find((s) => s.uses?.startsWith('actions/checkout@'))?.with?.submodules).toBe('recursive');
  });
```

Trong `apps/docs/test/pages.test.ts`, ở mục `concepts/verification.md` của mảng `PAGES`, thay đúng dòng:

```ts
    mustInclude: ['npx -y atropyle verify', '## Check one vault', 'RPC_DISAGREEMENT', '## What you still trust'],
```

bằng:

```ts
    mustInclude: [
      'npx -y atropyle verify',
      '## Check one vault',
      'RPC_DISAGREEMENT',
      '## What you still trust',
      '../reference/contracts.html#deployments',
    ],
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `npm run test:scripts -- contracts-page workflows`
Expected: FAIL. `contracts-page` không tìm thấy `../docs-gen/contract-notes`; `workflows` báo test `build the contracts before generating the docs` hỏng (`expected -1 to be greater than -1`), 8 test còn lại vẫn PASS.

Run: `npm test -w apps/docs -- pages`
Expected: FAIL ở `concepts/verification.md > covers what the spec asks for`, phrase `../reference/contracts.html#deployments`.

- [ ] **Step 3: Viết ghi chú viết tay**

Nội dung lấy từ mã nguồn Plan 1 (`AtropyleVault`, `VaultConfig`, `VaultDistribution`, `AtropyleFactory`) và spec lõi §3–§5. Không viết ghi chú cho `coverage()` và constructor của vault: NatSpec trong mã nguồn đã có (`@notice`, `@dev`), và test `uses the NatSpec that the verified source carries` khoá điều đó.

`scripts/docs-gen/contract-notes.ts`:

```ts
// Plain-language notes for the Contracts reference page. The contracts are frozen since mainnet and their NatSpec
// is sparse, so these notes carry most descriptions. buildModel() reports any ABI item with neither NatSpec nor a
// note, any state-changing function without a caller, and any note that matches nothing in the ABI.

export type ContractName = 'AtropyleVault' | 'AtropyleFactory';

/** Who may call a function that changes state. */
export type Caller = 'owner' | 'guardians' | 'anyone' | 'factory' | 'vaults' | 'deployer';

export interface FunctionNote {
  /** Required for every function that changes state, constructors included. */
  caller?: Caller | undefined;
  /** May be left out when the NatSpec in the source already explains the function. */
  text?: string | undefined;
}

export interface ContractNotes {
  /** Prefix of the sub-headings: "Vault functions", "Factory errors". */
  label: string;
  summary: string;
  /** Keyed by name, "constructor" for the constructor. The contracts have no overloaded names. */
  functions: Readonly<Record<string, FunctionNote>>;
  events: Readonly<Record<string, string>>;
  /** Only errors without an SDK code need a note; coded errors use the message from the Errors page. */
  errors: Readonly<Record<string, string>>;
}

const STATE_CODES = '0 Active, 1 Grace, 3 RecoveryPending, 5 ReleasedInherit, 7 ReleasedRecover';

export const CONTRACT_NOTES: Readonly<Record<ContractName, ContractNotes>> = {
  AtropyleVault: {
    label: 'Vault',
    summary:
      "Holds one owner's plan: heirs, guardians, timing and the list of assets. The assets stay in the owner's wallet; the vault moves them with the owner's approvals, and only after the policy circuit releases it.",
    functions: {
      constructor: { caller: 'deployer' },
      initialize: {
        caller: 'factory',
        text: "Sets the owner, the Drill flag, the plan, the processor and the policy, marks the owner alive and adds every role to the factory's index. `AtropyleFactory.createVault` calls it in the same transaction that creates the clone, so nobody else can call it (`AlreadyInitialized`).",
      },
      checkIn: {
        caller: 'owner',
        text: 'Proof of life. Sets `lastAlive` to now, clears every guardian vote and cancels an alarm.',
      },
      setHeirs: {
        caller: 'owner',
        text: 'Replaces the heirs: up to 5 accounts whose shares (`bps`) add up to 10,000. Counts as a check-in.',
      },
      setGuardians: {
        caller: 'owner',
        text: 'Replaces the guardians (up to 5), the threshold `k` (at most the number of guardians; 0 is the Simple template) and whether guardians may recover the assets to a new wallet. Counts as a check-in.',
      },
      setTiming: {
        caller: 'owner',
        text: 'Replaces the period, the threshold and the alarm window (see [`Timing`](#timing)). Counts as a check-in.',
      },
      setAssets: {
        caller: 'owner',
        text: "Replaces the assets the vault may move at release, up to 20. The approvals stay in the owner's wallet, so the vault never takes custody. Counts as a check-in.",
      },
      attestDeath: {
        caller: 'guardians',
        text: "`on = true` records that the calling guardian believes the owner has died; `false` withdraws it. Once the alarm window ends, the vault releases to the heirs when `k` guardians attest, or without attestations after 15 silent periods. Any action by the owner clears every attestation.",
      },
      voteRecovery: {
        caller: 'guardians',
        text: "Only when recovery is enabled. Votes to move the owner's assets to `target`, a new wallet of the owner. When `k` guardians vote for the same target, the vault enters RecoveryPending; if the owner stays silent until the alarm window ends, it releases to that target. The target cannot be the owner, the vault or a guardian.",
      },
      poke: {
        caller: 'anyone',
        text: 'Evaluates the policy at the current time and records what changed: an alarm raised or cancelled, or the release. It never moves tokens and does nothing once the vault is released. Keepers call it on a schedule.',
      },
      distribute: {
        caller: 'anyone',
        text: 'Evaluates the policy like `poke`, then, if the vault is released, moves every asset: to the heirs after ReleasedInherit, or to the recovery target after ReleasedRecover. A failed transfer emits `TransferFailed` and does not stop the others. Anyone can call it again later to move what became available.',
      },
      status: {
        text: 'Everything a client needs in one call, all read at the same block: the stored state, the state a `poke` would record now, the deadlines, the votes and the coverage of each asset. See [`Status`](#status).',
      },
      heirs: { text: 'The heirs and their shares (see [`Heir`](#heir)).' },
      guardians: { text: 'The guardians, in the order the vote bitmaps use.' },
      assets: { text: 'The assets the vault moves at release (see [`Asset`](#asset)).' },
      timing: { text: 'The period, the threshold and the alarm window (see [`Timing`](#timing)).' },
      owner: { text: 'The owner. Only this address can check in or change the plan.' },
      drill: { text: 'True for a Drill vault: free, accepts short timings, and stops working after `DRILL_LIFETIME`.' },
      k: {
        text: 'How many guardians must agree, both to confirm a death and to recover to a new wallet. 0 is the Simple template.',
      },
      recoveryEnabled: { text: "Whether guardians may recover the assets to a new wallet of the owner." },
      DRILL_LIFETIME: { text: 'How long a Drill vault works after it is created: 7 days (604,800 seconds).' },
      factory: { text: 'The factory that created this vault.' },
      cpu: { text: 'The TapeOut processor (ATRO) that runs the policy circuit.' },
      policyId: { text: 'ID of the `AtropylePolicy v1` circuit on that processor.' },
      expiresAt: { text: 'Drill vaults only: the time after which every call reverts with `DrillExpired`. 0 for a real vault.' },
      state: {
        text: `Current state code: ${STATE_CODES}. It changes only when someone calls the vault; \`status().pending\` shows what the next call would record.`,
      },
      lastAlive: { text: "Time of the owner's last check-in, configuration change or vault creation." },
      alarmAt: { text: 'Time the current alarm was raised, or 0 when there is none.' },
      releasedAt: { text: 'Time of the release, or 0.' },
      inhVotes: { text: 'Bitmap of the guardians who attested the death; bit i is `guardians()[i]`.' },
      recoveryTarget: { text: 'The wallet a pending or finished recovery sends the assets to, or `address(0)`.' },
      recVote: { text: 'The recovery target this guardian voted for, or `address(0)`.' },
    },
    events: {
      Alive: 'The owner proved they are alive: a check-in, a configuration change or the creation of the vault. `at` is the block time.',
      ConfigUpdated: 'The owner changed the plan. `what`: 1 heirs, 2 guardians, 3 timing, 4 assets.',
      Attested: "A guardian attested the owner's death (`on = true`) or withdrew the attestation.",
      RecoveryVoted: 'A guardian voted for a recovery target; `address(0)` withdraws the vote.',
      AlarmRaised:
        'The vault entered an alarm state: `state` 1 (Grace) or 3 (RecoveryPending). `target` is the recovery target for RecoveryPending, else `address(0)`.',
      AlarmCancelled:
        "The alarm ended without a release. `byOwner` is true when the owner's action ended it, false when guardians withdrew their recovery votes.",
      Released: 'The policy released the vault: `state` 5 to the heirs, 7 to `target`. Tokens move on `distribute`.',
      StateChanged: `Every state transition, with the old and the new state code (${STATE_CODES}).`,
      Distributed:
        '`distribute` moved asset number `assetIndex` to `to`: an amount for ERC-20 and ERC-1155, a token ID for ERC-721.',
      TransferFailed:
        'A transfer of asset number `assetIndex` to `to` failed, for example because an approval was revoked. The other assets still moved; call `distribute` again once it is fixed.',
    },
    errors: {},
  },
  AtropyleFactory: {
    label: 'Factory',
    summary:
      'Creates every vault as a clone of one implementation, at an address that depends only on the owner and a salt. It charges the creation fee for real vaults and keeps an index of every vault an account has a role in.',
    functions: {
      constructor: {
        caller: 'deployer',
        text: "Fixes the vault implementation, the processor, the policy ID, the treasury and the fee tokens for good. Each fee comes from the token's `decimals()`: 1.99 tokens for the first 100 paid vaults, 9.90 after that.",
      },
      createVault: {
        caller: 'anyone',
        text: 'Creates a vault for the caller and initializes it with `cfg` in the same transaction. The address depends only on the caller and `salt` (see `predictVault`). A Drill (`drill = true`) is free and ignores `feeToken`. Otherwise the factory moves `currentFee(feeToken)` from the caller to the treasury with `transferFrom`, so approve that amount first.',
      },
      index: {
        caller: 'vaults',
        text: 'Records that `account` has a role in the calling vault. Only vaults this factory created may call it (`NotVault`). Vaults call it when they are created and whenever their heirs or guardians change.',
      },
      currentFee: {
        text: 'The fee `createVault` charges right now in this token. Reverts with `UnsupportedFeeToken` for any other token.',
      },
      predictVault: { text: 'The address `createVault` will use for this owner and salt, before the vault exists.' },
      vaultsOf: {
        text: 'Every vault where the account is the owner, an heir or a guardian, in the order they were indexed. Entries stay after a role is removed, so read the vault itself to confirm the role.',
      },
      EARLY_COUNT: { text: 'How many paid vaults get the early fee: 100.' },
      vaultImpl: { text: 'The vault implementation that every vault clones.' },
      cpu: { text: 'The TapeOut processor (ATRO) given to every new vault.' },
      policyId: { text: 'The policy circuit ID given to every new vault.' },
      treasury: { text: 'Receives every creation fee.' },
      earlyFee: { text: 'Fee in this token for the first 100 paid vaults; 0 for an unsupported token.' },
      fullFee: { text: 'Fee in this token after the first 100 paid vaults; 0 for an unsupported token.' },
      paidCount: { text: 'Number of paid (non-Drill) vaults created so far.' },
      isVault: { text: 'True for every vault this factory created. Use it to check that an address is a real Atropyle vault.' },
    },
    events: {
      VaultCreated: 'A vault was created. For a Drill, `feeToken` is `address(0)` and `fee` is 0.',
    },
    errors: {
      BadConstructorArgs:
        'The constructor rejected its arguments: no code at the implementation, the processor or a fee token, a zero treasury, no fee tokens, a duplicate token, or decimals outside 2 to 18. Only seen when deploying the factory.',
    },
  },
};

/** Field notes for the structs in the ABI, keyed by the struct's short name. Every field needs a note. */
export const STRUCT_NOTES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Heir: {
    account: "Wallet that receives this heir's share.",
    bps: 'Share of each ERC-20 asset in basis points. All shares add up to 10,000; the last heir also gets the rounding remainder.',
  },
  Asset: {
    kind: '0 ERC-20, 1 ERC-721, 2 ERC-1155.',
    token: 'Token contract.',
    id: 'Token ID for ERC-721 and ERC-1155. Must be 0 for ERC-20.',
    heir: 'For ERC-721 and ERC-1155: index in `heirs()` of the heir who receives it. ERC-20 assets are split by `bps` instead.',
  },
  Timing: {
    period: 'Length of one period in seconds. At least 1 day; a Drill vault accepts less.',
    threshold: 'Silent periods before the alarm, from 1 to 15.',
    window: 'Alarm window in seconds: the time the owner has to cancel an alarm. At least 3 days; a Drill vault accepts less.',
  },
  Config: {
    heirs: 'The heirs, as in `setHeirs`.',
    guardians: 'The guardians, as in `setGuardians`.',
    k: 'The guardian threshold, as in `setGuardians`.',
    recoveryEnabled: 'Whether guardians may recover to a new wallet, as in `setGuardians`.',
    timing: 'The timing, as in `setTiming`.',
    assets: 'The assets, as in `setAssets`.',
  },
  Status: {
    state: 'The stored state code.',
    pending: 'The state a `poke` would record right now. Equal to `state` when nothing is due.',
    idle: 'Whole periods since `lastAlive`, capped at 15.',
    lastAlive: 'Last proof of life.',
    lateAt: 'When the owner counts as late: `lastAlive` plus threshold times period.',
    alarmAt: 'When the current alarm started, or 0.',
    windowEndsAt: 'When the alarm window ends (`alarmAt` plus window), or 0 without an alarm.',
    releasedAt: 'Time of the release, or 0.',
    expiresAt: 'Drill vaults only: when the vault stops working. 0 for a real vault.',
    inhVotes: 'Bitmap of the guardians who attested the death; bit i is `guardians()[i]`.',
    recoveryTarget: 'Target of a pending or finished recovery, or `address(0)`.',
    recVotes: "Each guardian's recovery vote, in `guardians()` order.",
    coverage: 'What the vault could move right now, per asset, as in `coverage()`.',
  },
};

// Errors that OpenZeppelin libraries add to the factory ABI (Clones, SafeERC20 and Address in v5.0.2, the version
// Plan 1 pins, plus their v5.1+ names). Unlike CONTRACT_NOTES, entries here may match nothing.
export const LIBRARY_ERROR_NOTES: Readonly<Record<string, string>> = {
  ERC1167FailedCreateClone:
    'OpenZeppelin `Clones`: the vault could not be created, because the caller already has a vault with this salt. Use another salt.',
  FailedDeployment:
    'OpenZeppelin `Clones`: the vault could not be created, because the caller already has a vault with this salt. Use another salt.',
  SafeERC20FailedOperation: 'OpenZeppelin `SafeERC20`: the fee token returned `false` from `transferFrom`.',
  AddressEmptyCode: 'OpenZeppelin `Address`: the fee token address has no code.',
  FailedInnerCall:
    'OpenZeppelin `Address`: the fee token reverted without a reason, for example because the allowance is too low.',
  FailedCall:
    'OpenZeppelin `Address`: the fee token reverted without a reason, for example because the allowance is too low.',
  AddressInsufficientBalance:
    'OpenZeppelin `Address`: a call with value lacked the balance. The factory never sends value, so this does not happen.',
  InsufficientBalance:
    'OpenZeppelin `Address`: a call with value lacked the balance. The factory never sends value, so this does not happen.',
};
```

- [ ] **Step 4: Viết bộ sinh trang Contracts**

`scripts/docs-gen/contracts.ts`:

```ts
// The Contracts reference page: every function, event and error of AtropyleVault and AtropyleFactory, built from
// the ABI the SDK ships, the NatSpec in the Foundry artifacts, the notes in contract-notes.ts, and
// deployments/xlayer.json. Run `cd contracts && forge build --skip test --skip script` before docs:gen.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Abi, AbiParameter } from 'viem';
import { factoryAbi, vaultAbi } from '../../packages/sdk/src/abi/index';
import { type Deployment, parseDeployment } from '../../packages/sdk/src/deployments/types';
import { ERROR_INFO } from '../../packages/sdk/src/errors';
import {
  type Caller,
  CONTRACT_NOTES,
  type ContractName,
  type ContractNotes,
  LIBRARY_ERROR_NOTES,
  STRUCT_NOTES,
} from './contract-notes';
import { collectContractErrors } from './errors';
import { type DocsPart, escapeMd, REFERENCE_DIR, renderPage, slugOf } from './files';

export const ARTIFACTS: Record<ContractName, string> = {
  AtropyleVault: 'contracts/out/AtropyleVault.sol/AtropyleVault.json',
  AtropyleFactory: 'contracts/out/AtropyleFactory.sol/AtropyleFactory.json',
};

export const CONTRACT_NAMES: readonly ContractName[] = ['AtropyleVault', 'AtropyleFactory'];

const ABIS: Record<ContractName, Abi> = { AtropyleVault: vaultAbi, AtropyleFactory: factoryAbi };

const INFO: Readonly<Record<string, { message: string }>> = ERROR_INFO;

// ------------------------------------------------------------------ NatSpec

export interface ItemDoc {
  notice?: string | undefined;
  details?: string | undefined;
  params?: Record<string, string> | undefined;
  returns?: Record<string, string> | undefined;
}

export interface NatSpec {
  notice?: string | undefined;
  details?: string | undefined;
  /** Keyed by canonical signature ("setHeirs((address,uint16)[])"), or "constructor". */
  methods: Map<string, ItemDoc>;
  events: Map<string, ItemDoc>;
  errors: Map<string, ItemDoc>;
  /** Public state variables, keyed by name. Only devdoc has this section. */
  stateVariables: Map<string, ItemDoc>;
}

export const EMPTY_NATSPEC: NatSpec = { methods: new Map(), events: new Map(), errors: new Map(), stateVariables: new Map() };

type Json = Record<string, unknown>;

const obj = (v: unknown): Json => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {});
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

function strings(v: unknown): Record<string, string> | undefined {
  const entries = Object.entries(obj(v)).filter((e): e is [string, string] => typeof e[1] === 'string');
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

// solc writes error docs as arrays (one entry per definition with that signature); the first one is enough.
function itemDoc(user: unknown, dev: unknown): ItemDoc {
  const u = obj(Array.isArray(user) ? user[0] : user);
  const d = obj(Array.isArray(dev) ? dev[0] : dev);
  const doc: ItemDoc = {};
  const notice = str(u.notice);
  const details = str(d.details);
  const params = strings(d.params);
  const returns = strings(d.returns);
  if (notice) doc.notice = notice;
  if (details) doc.details = details;
  if (params) doc.params = params;
  if (returns) doc.returns = returns;
  return doc;
}

function docMap(user: unknown, dev: unknown): Map<string, ItemDoc> {
  const u = obj(user);
  const d = obj(dev);
  const keys = [...new Set([...Object.keys(u), ...Object.keys(d)])].sort();
  return new Map(keys.map((k) => [k, itemDoc(u[k], d[k])]));
}

/** Reads userdoc and devdoc from a Foundry artifact: `metadata` (object or string), then `rawMetadata`. */
export function natSpecFromArtifact(artifact: unknown): NatSpec {
  const a = obj(artifact);
  const meta =
    typeof a.metadata === 'string'
      ? JSON.parse(a.metadata)
      : (a.metadata ?? (typeof a.rawMetadata === 'string' ? JSON.parse(a.rawMetadata) : undefined));
  const output = obj(obj(meta).output);
  const user = obj(output.userdoc ?? a.userdoc);
  const dev = obj(output.devdoc ?? a.devdoc);
  return {
    notice: str(user.notice),
    details: str(dev.details),
    methods: docMap(user.methods, dev.methods),
    events: docMap(user.events, dev.events),
    errors: docMap(user.errors, dev.errors),
    stateVariables: docMap(undefined, dev.stateVariables),
  };
}

export function readNatSpec(root: string, name: ContractName): NatSpec {
  const file = join(root, ARTIFACTS[name]);
  if (!existsSync(file)) {
    throw new Error(`${ARTIFACTS[name]} is missing: run "cd contracts && forge build --skip test --skip script" first`);
  }
  return natSpecFromArtifact(JSON.parse(readFileSync(file, 'utf8')));
}

export function readAllNatSpec(root: string): Record<ContractName, NatSpec> {
  return { AtropyleVault: readNatSpec(root, 'AtropyleVault'), AtropyleFactory: readNatSpec(root, 'AtropyleFactory') };
}

// ------------------------------------------------------------------ ABI helpers

/** The type solc uses in NatSpec keys: tuples become "(…)" with their array suffix. */
export function canonicalType(p: AbiParameter): string {
  if (!p.type.startsWith('tuple')) return p.type;
  const parts = 'components' in p ? p.components : [];
  return `(${parts.map(canonicalType).join(',')})${p.type.slice('tuple'.length)}`;
}

export const signatureOf = (name: string, inputs: readonly AbiParameter[]): string =>
  `${name}(${inputs.map(canonicalType).join(',')})`;

const STRUCT = /^struct (?:\w+\.)*(\w+)((?:\[\d*\])*)$/;

/** "struct VaultConfig.Heir[]" → "Heir[]". Enums and contracts show their ABI type (uint8, address). */
export function displayType(p: AbiParameter): string {
  const m = STRUCT.exec(p.internalType ?? '');
  return m ? `${m[1]}${m[2]}` : p.type;
}

export function displayParams(params: readonly AbiParameter[]): string {
  return params
    .map((p) => {
      const indexed = 'indexed' in p && p.indexed === true ? ' indexed' : '';
      return p.name ? `${displayType(p)}${indexed} ${p.name}` : `${displayType(p)}${indexed}`;
    })
    .join(', ');
}

// ------------------------------------------------------------------ model

export type ItemKind = 'function' | 'event' | 'error';

export interface DocItem {
  kind: ItemKind;
  name: string;
  /** What the page shows, for example "currentFee(address token) returns (uint256 fee)". */
  display: string;
  /** Empty when nothing documents the item; buildModel then reports a problem. */
  description: string;
  /** Functions only: who may call it, or "Read" for view and pure functions. */
  caller: string | null;
  /** Errors only: the SDK error code, or null when tools report the revert as UNKNOWN. */
  code: string | null;
}

export interface ContractModel {
  name: ContractName;
  label: string;
  summary: string;
  items: DocItem[];
}

export interface StructField {
  name: string;
  type: string;
  description: string;
}

export interface StructModel {
  name: string;
  fields: StructField[];
}

export interface ContractsModel {
  contracts: ContractModel[];
  structs: StructModel[];
  /** Everything that keeps the page from being complete. contractsPart() refuses to write the page unless empty. */
  problems: string[];
}

export interface ContractsInput extends ContractsModel {
  deployment: Deployment | null;
}

const CALLER_LABEL: Record<Caller, string> = {
  owner: 'Owner',
  guardians: 'Guardians',
  anyone: 'Anyone',
  factory: 'Factory, once',
  vaults: 'Atropyle vaults',
  deployer: 'Deployer, once',
};

const own = <T>(rec: Readonly<Record<string, T>>, key: string): T | undefined =>
  Object.hasOwn(rec, key) ? rec[key] : undefined;

function mergeDocs(a: ItemDoc | undefined, b: ItemDoc | undefined): ItemDoc | undefined {
  if (!a) return b;
  if (!b) return a;
  return { notice: a.notice ?? b.notice, details: a.details ?? b.details, params: a.params, returns: a.returns ?? b.returns };
}

// Note first, then NatSpec ("From the source:" when both exist), then the fallback; @param and @return go last.
function describeItem(note: string | undefined, doc: ItemDoc | undefined, fallback?: string): string {
  const source = [doc?.notice, doc?.details].filter((s): s is string => s !== undefined).join(' ');
  let main = note ?? '';
  if (source !== '') main = main === '' ? source : `${main} From the source: ${source}`;
  if (main === '') main = fallback ?? '';
  if (main === '') return '';
  const params = Object.entries(doc?.params ?? {}).map(([k, v]) => `Parameter \`${k}\`: ${v}`);
  const returns = Object.entries(doc?.returns ?? {}).map(([k, v]) =>
    /^_\d+$/.test(k) ? `Returns: ${v}` : `Returns \`${k}\`: ${v}`,
  );
  return [main, ...params, ...returns].join(' ');
}

const RANK: Record<ItemKind, number> = { function: 0, event: 1, error: 2 };

// Constructor first, then functions that change state, then reads; each group in alphabetical order.
const groupOf = (i: DocItem): number => (i.kind !== 'function' || i.name === 'constructor' ? 0 : i.caller === 'Read' ? 2 : 1);

function sortItems(items: DocItem[]): DocItem[] {
  return items.sort((a, b) => RANK[a.kind] - RANK[b.kind] || groupOf(a) - groupOf(b) || a.name.localeCompare(b.name));
}

function contractModel(
  name: ContractName,
  ns: NatSpec,
  n: ContractNotes,
  codes: ReadonlyMap<string, string | null>,
  problems: string[],
): ContractModel {
  const items: DocItem[] = [];
  const seen: Record<ItemKind, Set<string>> = { function: new Set(), event: new Set(), error: new Set() };
  const mark = (kind: ItemKind, key: string): void => {
    if (seen[kind].has(key)) throw new Error(`${name}: overloaded ${kind} ${key}; the notes are keyed by name`);
    seen[kind].add(key);
  };
  for (const item of ABIS[name]) {
    if (item.type === 'constructor' || item.type === 'function') {
      const fname = item.type === 'constructor' ? 'constructor' : item.name;
      mark('function', fname);
      const sig = item.type === 'constructor' ? 'constructor' : signatureOf(item.name, item.inputs);
      const note = own(n.functions, fname);
      const stateVar = item.type === 'function' ? ns.stateVariables.get(item.name) : undefined;
      const description = describeItem(note?.text, mergeDocs(ns.methods.get(sig), stateVar));
      const write = item.stateMutability !== 'view' && item.stateMutability !== 'pure';
      if (description === '') problems.push(`${name}: function ${fname} has neither NatSpec nor a note`);
      if (write && !note?.caller) problems.push(`${name}: function ${fname} changes state but its note names no caller`);
      const outputs =
        item.type === 'function' && item.outputs.length > 0 ? ` returns (${displayParams(item.outputs)})` : '';
      items.push({
        kind: 'function',
        name: fname,
        display: `${fname}(${displayParams(item.inputs)})${outputs}`,
        description,
        caller: write ? (note?.caller ? CALLER_LABEL[note.caller] : '') : 'Read',
        code: null,
      });
    } else if (item.type === 'event') {
      mark('event', item.name);
      const description = describeItem(own(n.events, item.name), ns.events.get(signatureOf(item.name, item.inputs)));
      if (description === '') problems.push(`${name}: event ${item.name} has neither NatSpec nor a note`);
      items.push({
        kind: 'event',
        name: item.name,
        display: `${item.name}(${displayParams(item.inputs)})`,
        description,
        caller: null,
        code: null,
      });
    } else if (item.type === 'error') {
      mark('error', item.name);
      const sig = signatureOf(item.name, item.inputs);
      const code = codes.get(sig) ?? null;
      const note = own(n.errors, item.name) ?? own(LIBRARY_ERROR_NOTES, item.name);
      const description = describeItem(note, ns.errors.get(sig), code ? own(INFO, code)?.message : undefined);
      if (description === '') problems.push(`${name}: error ${item.name} has neither NatSpec, a note nor an SDK code`);
      items.push({ kind: 'error', name: item.name, display: `${item.name}(${displayParams(item.inputs)})`, description, caller: null, code });
    } else {
      problems.push(`${name}: the generator does not document ABI items of type ${item.type}`);
    }
  }
  const noted: Record<ItemKind, readonly string[]> = {
    function: Object.keys(n.functions),
    event: Object.keys(n.events),
    error: Object.keys(n.errors),
  };
  for (const kind of ['function', 'event', 'error'] as const) {
    for (const key of noted[kind]) {
      if (!seen[kind].has(key)) problems.push(`${name}: note for ${kind} ${key} matches no ABI item`);
    }
  }
  return {
    name,
    label: n.label,
    summary: describeItem(n.summary, { notice: ns.notice, details: ns.details }),
    items: sortItems(items),
  };
}

function collectStructs(abis: readonly Abi[]): Map<string, readonly AbiParameter[]> {
  const out = new Map<string, readonly AbiParameter[]>();
  const walk = (p: AbiParameter): void => {
    if (!p.type.startsWith('tuple') || !('components' in p)) return;
    const m = STRUCT.exec(p.internalType ?? '');
    if (m && !out.has(m[1])) out.set(m[1], p.components);
    for (const c of p.components) walk(c);
  };
  for (const abi of abis) {
    for (const item of abi) {
      if ('inputs' in item) for (const p of item.inputs) walk(p);
      if ('outputs' in item) for (const p of item.outputs) walk(p);
    }
  }
  return out;
}

function structModels(
  structNotes: Readonly<Record<string, Readonly<Record<string, string>>>>,
  problems: string[],
): StructModel[] {
  const found = collectStructs(CONTRACT_NAMES.map((n) => ABIS[n]));
  const models = [...found.keys()].sort().map((name) => {
    const notes = own(structNotes, name);
    if (!notes) problems.push(`struct ${name} has no notes`);
    const fields = (found.get(name) ?? []).map((c) => {
      const field = c.name ?? '';
      const description = notes ? (own(notes, field) ?? '') : '';
      if (notes && description === '') problems.push(`struct ${name}: field ${field} has no note`);
      return { name: field, type: displayType(c), description };
    });
    for (const key of Object.keys(notes ?? {})) {
      if (!fields.some((f) => f.name === key)) problems.push(`struct ${name}: note for field ${key} matches no ABI field`);
    }
    return { name, fields };
  });
  for (const name of Object.keys(structNotes)) {
    if (!found.has(name)) problems.push(`note for struct ${name} matches no ABI struct`);
  }
  return models;
}

export function buildModel(
  natspec: Readonly<Record<ContractName, NatSpec>>,
  notes: Readonly<Record<ContractName, ContractNotes>> = CONTRACT_NOTES,
  structNotes: Readonly<Record<string, Readonly<Record<string, string>>>> = STRUCT_NOTES,
): ContractsModel {
  const problems: string[] = [];
  const codes = new Map(collectContractErrors().map((e) => [e.signature, e.code]));
  const contracts = CONTRACT_NAMES.map((name) => contractModel(name, natspec[name], notes[name], codes, problems));
  return { contracts, structs: structModels(structNotes, problems), problems };
}

export function loadDeployment(root: string): Deployment | null {
  const file = join(root, 'deployments', 'xlayer.json');
  return existsSync(file) ? parseDeployment(JSON.parse(readFileSync(file, 'utf8'))) : null;
}

// ------------------------------------------------------------------ page

const INTRO = `Atropyle has two contracts on X Layer. \`AtropyleFactory\` creates vaults and collects the creation fee. Each \`AtropyleVault\` is a minimal clone that holds one owner's plan: heirs, guardians, timing and the list of assets. Neither contract has an admin, a pause switch or an upgrade path. The vault never holds tokens: the assets stay in the owner's wallet, and the vault moves them with the owner's approvals only after the policy circuit releases it.

This page is generated from the ABI that \`@atropyle/sdk\` ships, the NatSpec comments in the verified source, plain-language notes, and the [deployment record](#deployments), so it cannot drift from the code. A revert that tools report with its own code links to [Errors](errors.html). State codes are explained in [The five states](../concepts/how-it-works.html#the-five-states).

To check that a vault runs exactly this code, run \`npx -y atropyle verify --vault <address>\` ([Check one vault](../concepts/verification.html#check-one-vault)).`;

const TYPES_INTRO =
  'Structs as the ABI encodes them. `Config` is the `cfg` argument of `AtropyleFactory.createVault` and `AtropyleVault.initialize`; `Status` is what `AtropyleVault.status()` returns. Times are Unix timestamps in seconds, and durations are in seconds.';

const cell = (s: string): string => escapeMd(s, true);

function deploymentSection(d: Deployment | null): string[] {
  const out = ['## Deployments', ''];
  if (d === null) {
    out.push(
      'Atropyle is not deployed on X Layer mainnet yet. This section lists every address once `deployments/xlayer.json` exists.',
    );
    return out;
  }
  const lookup = d.explorerUrl ? ` Look up any address on OKLink: \`${d.explorerUrl}/address/<address>\`.` : '';
  const policyHash = d.circuits ? ` Netlist keccak \`${d.circuits.netlistKeccak.policy}\`.` : '';
  out.push(
    `X Layer mainnet, chain ID ${d.chainId}. These values come from \`deployments/xlayer.json\` in the repository, the same record the SDK and the CLI use.${lookup}`,
    '',
    '| Contract | Address or ID | Notes |',
    '|---|---|---|',
    `| AtropyleFactory | \`${d.factory}\` | Created at block ${d.factoryBlock}. Creates every vault and keeps the role index. |`,
    `| AtropyleVault (implementation) | \`${d.vaultImpl}\` | Every vault is an EIP-1167 clone of this contract. Runtime code hash \`${d.vaultImplCodehash}\`, which CI rebuilds from source. |`,
    `| TapeOut processor (ATRO) | \`${d.cpu}\` | Runs the policy circuit for every vault. |`,
    `| Policy circuit \`AtropylePolicy v1\` | ID \`${d.policyId}\` | The rules every vault follows.${policyHash} |`,
  );
  if (d.circuits) {
    out.push(
      `| Sub-circuit \`KofN5\` | ID \`${d.circuits.kofn5}\` | Netlist keccak \`${d.circuits.netlistKeccak.kofn5}\`. Anyone can reuse it through REF. |`,
      `| Sub-circuit \`Ge4\` | ID \`${d.circuits.ge4}\` | Netlist keccak \`${d.circuits.netlistKeccak.ge4}\`. Anyone can reuse it through REF. |`,
    );
  }
  out.push(`| Treasury | \`${d.treasury}\` | Receives the creation fees. |`);
  for (const t of d.feeTokens) out.push(`| Fee token | \`${t}\` | Accepted for the creation fee. |`);
  if (d.tapeout) {
    out.push(
      `| TapeOut factory | \`${d.tapeout.factory}\` | Created the ATRO processor; its \`isCPU\` confirms the processor is genuine. |`,
      `| TapeOut beacon | \`${d.tapeout.beacon}\` | The frozen beacon behind the processor's circuits. \`atropyle verify\` checks that it has not changed. |`,
    );
  }
  out.push(
    '',
    '`atro.fees()` in the SDK returns each fee token with its symbol and the current fee. To check these values against the chain yourself, run `npx -y atropyle verify` ([Verification & trust assumptions](../concepts/verification.html)).',
  );
  return out;
}

function itemTable(c: ContractModel, kind: ItemKind): string[] {
  const rows = c.items.filter((i) => i.kind === kind);
  if (rows.length === 0) return [];
  const title: Record<ItemKind, string> = { function: 'functions', event: 'events', error: 'errors' };
  const out = ['', `### ${c.label} ${title[kind]}`, ''];
  if (kind === 'function') {
    out.push('| Function | Who can call | Description |', '|---|---|---|');
    for (const i of rows) out.push(`| \`${i.display}\` | ${i.caller} | ${cell(i.description)} |`);
  } else if (kind === 'event') {
    out.push('| Event | Description |', '|---|---|');
    for (const i of rows) out.push(`| \`${i.display}\` | ${cell(i.description)} |`);
  } else {
    out.push('| Error | Code | Description |', '|---|---|---|');
    for (const i of rows) {
      const code = i.code ? `[\`${i.code}\`](errors.html#${slugOf(i.code)})` : 'none';
      out.push(`| \`${i.display}\` | ${code} | ${cell(i.description)} |`);
    }
  }
  return out;
}

export function renderContractsPage(input: ContractsInput): string {
  const lines = [INTRO, '', ...deploymentSection(input.deployment)];
  for (const c of input.contracts) {
    lines.push('', `## ${c.name}`, '', escapeMd(c.summary));
    for (const kind of ['function', 'event', 'error'] as const) lines.push(...itemTable(c, kind));
  }
  lines.push('', '## Types', '', TYPES_INTRO);
  for (const s of input.structs) {
    lines.push('', `### ${s.name}`, '', '| Field | Type | Description |', '|---|---|---|');
    for (const f of s.fields) lines.push(`| \`${f.name}\` | \`${f.type}\` | ${cell(f.description)} |`);
  }
  return renderPage({
    title: 'Contracts',
    description: 'AtropyleVault and AtropyleFactory: every function, event and error, and the deployed addresses on X Layer.',
    order: 7,
    body: lines.join('\n'),
  });
}

/** Section ids other pages link to; the link checker requires them in the built HTML. */
export function contractsAnchors(model: ContractsModel): string[] {
  return ['deployments', ...model.contracts.map((c) => slugOf(c.name)), 'types', ...model.structs.map((s) => slugOf(s.name))];
}

export function contractsPart(root: string): DocsPart {
  const model = buildModel(readAllNatSpec(root));
  if (model.problems.length > 0) {
    throw new Error(
      `the Contracts page is incomplete:\n${model.problems.join('\n')}\nAdd the missing notes to scripts/docs-gen/contract-notes.ts`,
    );
  }
  return {
    files: new Map([[`${REFERENCE_DIR}/contracts.md`, renderContractsPage({ ...model, deployment: loadDeployment(root) })]]),
    anchors: { 'reference/contracts.html': contractsAnchors(model) },
  };
}
```

- [ ] **Step 5: Nối vào `docs:gen` và vào CI**

Thay toàn bộ `scripts/docs-gen.ts` bằng:

```ts
// npm run docs:gen [-- --check]
// Writes the generated reference pages, the CLI JSON Schemas and the list of anchors the link checker requires.
// --check writes nothing and exits 1 when the committed files differ from the code (CI runs it).
// The Contracts page reads Foundry artifacts: run `cd contracts && forge build --skip test --skip script` first.
import { join } from 'node:path';
import { cliPart } from './docs-gen/cli';
import { contractsPart } from './docs-gen/contracts';
import { errorsPart } from './docs-gen/errors';
import { MANAGED_DIRS, mergeParts, syncFiles } from './docs-gen/files';
import { sdkPart } from './docs-gen/sdk';

const root = join(import.meta.dirname, '..');
const check = process.argv.includes('--check');

const files = mergeParts([errorsPart(), cliPart(root), await sdkPart(root), contractsPart(root)]);
const { changed, stale } = syncFiles(root, files, MANAGED_DIRS, check);

if (check && changed.length + stale.length > 0) {
  for (const f of changed) console.error(`out of date: ${f}`);
  for (const f of stale) console.error(`no longer generated: ${f}`);
  console.error('Run `npm run docs:gen` and commit the result.');
  process.exit(1);
}
console.log(
  check
    ? `docs:gen --check: ${files.size} generated files are up to date`
    : `docs:gen: ${files.size} files, ${changed.length} written, ${stale.length} removed`,
);
```

Trong `.github/workflows/ci.yml`, thay cả job `docs` (Task 7) bằng bản dưới. Foundry và `forge build` chỉ chạy ở phần matrix có `docs:gen -- --check`.

```yaml
  docs:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        base: [/docs/, /atropyle/docs/]
    steps:
      - uses: actions/checkout@v7
        with:
          submodules: recursive
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm
      - if: matrix.base == '/docs/'
        uses: foundry-rs/foundry-toolchain@v1
        with:
          version: v1.9.0
      - run: npm ci
      - run: npm run build -w circuits
      - if: matrix.base == '/docs/'
        run: forge build --skip test --skip script
        working-directory: contracts
      - if: matrix.base == '/docs/'
        run: npm run docs:gen -- --check
      - run: npm test -w apps/docs
      - run: npm run build -w apps/docs
        env:
          DOCS_BASE: ${{ matrix.base }}
      - run: npm run check:links -w apps/docs
        env:
          DOCS_BASE: ${{ matrix.base }}
```

- [ ] **Step 6: Chạy test để thấy qua**

Run: `cd contracts && forge build --skip test --skip script && cd .. && npm run test:scripts -- contracts-page workflows`
Expected: PASS 11 test của `contracts-page`, 9 test của `workflows`.

Nếu `document every function, event, error and struct field` báo `AtropyleFactory: error <Tên> has neither NatSpec, a note nor an SDK code` cho một error của thư viện OpenZeppelin không có trong `LIBRARY_ERROR_NOTES`: tra error đó trong `contracts/lib/openzeppelin-contracts` (`grep -rn "error <Tên>" contracts/lib/openzeppelin-contracts/contracts`), rồi thêm một dòng vào `LIBRARY_ERROR_NOTES` dạng `'OpenZeppelin \`<Thư viện>\`: <khi nào factory gặp lỗi này>.'`. Không sửa contract, không bỏ mục đó khỏi trang.

Nếu báo `uses the NatSpec…` thiếu `What the vault could move right now`: artifact không có `metadata`. Kiểm `node -e "const a=require('./contracts/out/AtropyleVault.sol/AtropyleVault.json');console.log(Object.keys(a))"`. Nếu không có cả `metadata` lẫn `rawMetadata`: không sửa `[profile.*]` của `contracts/foundry.toml` (Global Constraints). Thêm cờ `--extra-output devdoc userdoc` vào lệnh `forge build` ở Step 6 và ở job `docs`; `natSpecFromArtifact` cũng đọc `devdoc`/`userdoc` ở gốc artifact. Cờ này chỉ thêm trường vào file JSON, không đổi bytecode.

Run: `npm run typecheck:scripts && npx biome check --write scripts/docs-gen.ts scripts/docs-gen/contracts.ts scripts/docs-gen/contract-notes.ts scripts/test/contracts-page.test.ts scripts/test/workflows.test.ts`
Expected: thoát 0.

- [ ] **Step 7: Sinh trang thật và kiểm `--check`**

Run: `npm run build -w circuits && npm run docs:gen`
Expected: `docs:gen: <N+1> files, 2 written, 0 removed`, với N là số file của Task 3; hai file ghi là `reference/contracts.md` và `required-anchors.json`.

Run: `npm run docs:gen -- --check && grep -c '^| `' apps/docs/src/content/docs/reference/contracts.md && grep -n '^## \|^### ' apps/docs/src/content/docs/reference/contracts.md`
Expected:
- `docs:gen --check: <N+1> generated files are up to date`;
- số dòng bảng ít nhất 103 (vault 33 hàm, 10 event, 13 error; factory 15 hàm, 1 event, 3 error; 28 trường struct), cộng các error thư viện của factory;
- heading theo thứ tự: `## Deployments`, `## AtropyleVault`, `### Vault functions`, `### Vault events`, `### Vault errors`, `## AtropyleFactory`, `### Factory functions`, `### Factory events`, `### Factory errors`, `## Types`, `### Asset`, `### Config`, `### Heir`, `### Status`, `### Timing`.

Run: `grep -n 'AtropyleFactory |' apps/docs/src/content/docs/reference/contracts.md | head -1 && node -e "console.log(require('./deployments/xlayer.json').factory)"`
Expected: dòng bảng deployment chứa đúng địa chỉ factory mà lệnh `node` in ra.

Đọc lướt bảng `### Vault functions` một lượt: mỗi hàm ghi đúng người được gọi (Owner, Guardians, Anyone…), các hàm đọc ghi `Read`.

- [ ] **Step 8: Link từ trang chủ docs, trang Verification, README và CONTRIBUTING**

Trong `apps/docs/src/content/docs/index.md`, chèn ngay **trước** dòng `- [Errors](reference/errors.html): every error code and how to fix it.` dòng:

```md
- [Contracts](reference/contracts.html): every function, event and error, and the [deployed addresses](reference/contracts.html#deployments).
```

Trong `apps/docs/src/content/docs/concepts/verification.md`, thay đúng dòng:

```md
4. the code hash of the implementation matches the one recorded for this deployment, which CI rebuilds from source;
```

bằng:

```md
4. the code hash of the implementation matches the one recorded for this deployment ([Contracts](../reference/contracts.html#deployments)), which CI rebuilds from source;
```

Trong `README.md`, thay đúng đoạn:

```md
Contracts, events and errors are documented in the [docs](https://duongnq2798.github.io/atropyle/docs/).
```

bằng:

```md
Every function, event and error of the contracts, and every deployed address, is in the [Contracts reference](https://duongnq2798.github.io/atropyle/docs/reference/contracts.html).
```

Trong `CONTRIBUTING.md`, thay đúng câu:

```md
`docs:gen` rewrites the reference pages from the code; CI fails when they are out of date.
```

bằng:

```md
`docs:gen` rewrites the reference pages from the code; CI fails when they are out of date. The Contracts page reads the Foundry artifacts, so run `cd contracts && forge build` first.
```

Run: `npm test -w apps/docs -- pages && npm run test:scripts -- readme`
Expected: PASS mọi test của `pages` (kể cả `../reference/contracts.html#deployments` cho trang Verification) và 12 test của `readme` (link `reference/contracts.html` trỏ tới `reference/contracts.md` có thật).

- [ ] **Step 9: Build docs ở cả hai base và kiểm anchor trên HTML thật**

Run: `for b in /docs/ /atropyle/docs/; do DOCS_BASE=$b npm run build -w apps/docs && DOCS_BASE=$b npm run check:links -w apps/docs || break; done`
Expected: hai dòng `links ok`. Bộ kiểm đã đọc `required-anchors.json`, nên chín anchor của trang Contracts có trong HTML.

Run: `grep -o 'id="deployments"' apps/docs/dist/reference/contracts.html | head -1 && grep -c 'https://www.oklink.com' apps/docs/dist/reference/contracts.html && grep -o 'reference/contracts.html' apps/docs/dist/llms.txt | head -1`
Expected: `id="deployments"`; số dòng chứa URL OKLink ít nhất 1 (URL nằm trong inline code; `check:links` ở trên đã xác nhận không có `href` nào ra site khác); `reference/contracts.html`.

Run: `npx biome ci .`
Expected: thoát 0.

- [ ] **Step 10: Commit**

```bash
git add scripts/docs-gen.ts scripts/docs-gen/contracts.ts scripts/docs-gen/contract-notes.ts scripts/test/contracts-page.test.ts scripts/test/workflows.test.ts apps/docs/test/pages.test.ts .github/workflows/ci.yml apps/docs/src/content/docs/reference/contracts.md apps/docs/src/generated/required-anchors.json apps/docs/src/content/docs/index.md apps/docs/src/content/docs/concepts/verification.md README.md CONTRIBUTING.md
git commit -m "feat(docs): generate the Contracts reference with every ABI item and the mainnet addresses" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 16: Ghim SHA cho mọi action, nâng Plan 1–5 lên major hiện tại (`npm run pin-actions`)

**Files:**
- Create: `scripts/ops/pins.ts` (hàm thuần và đọc file), `scripts/ops/pin-actions.ts` (CLI)
- Modify: `package.json` (gốc, script `pin-actions`), `.github/workflows/*.yml` (mọi file: chỉ dòng `uses:`), `.github/workflows/ci.yml` (job `security` thêm một bước)
- Test: `scripts/test/pin-actions.test.ts`

**Interfaces:**
- Consumes:
  - Mọi workflow của Plan 1–6 trong `.github/workflows/` (gồm `keeper.yml` của Plan 5 nếu người dùng đã duyệt nó), và action composite trong `.github/actions/*/action.yml` nếu có.
  - Task 7: `readWorkflows(dir)` (`scripts/ops/workflows.ts`).
  - `git ls-remote --tags https://github.com/<owner>/<repo>.git` (chỉ đọc, không cần đăng nhập).
- Produces:
  - `scripts/ops/pins.ts`:
    - `MAJORS: Readonly<Record<string, string>>` (repo → tiền tố tag được dùng, ví dụ `'actions/checkout': 'v7'`, `'crytic/slither-action': 'v0.4'`)
    - `interface UsesRef { prefix: string; action: string; repo: string; ref: string; version: string | null }`, `parseUses(line: string): UsesRef | null`
    - `parseLsRemote(text: string): Map<string, string>` (tag → commit; tag annotated lấy commit `^{}`)
    - `interface Pin { tag: string; sha: string }`, `pickTag(tags: ReadonlyMap<string, string>, prefix: string): Pin | null`, `prefixFor(u: UsesRef, majors?: Readonly<Record<string, string>>): string`
    - `interface WorkflowText { path: string; text: string }`, `readWorkflowFiles(root: string): WorkflowText[]`
    - `interface PinChange { line: number; action: string; from: string; to: string }`, `pinText(text: string, resolve: (u: UsesRef) => Pin): { text: string; changes: PinChange[] }`
    - `auditPins(files: readonly WorkflowText[]): string[]` (offline), `verifyPins(files: readonly WorkflowText[], tagsOf: (repo: string) => ReadonlyMap<string, string>): string[]` (cần mạng)
  - `npm run pin-actions` viết lại mọi `uses:` thành `<action>@<sha 40 ký tự> # <tag>`; `npm run pin-actions -- --check` thoát 1 khi có `uses:` chưa ghim, thiếu comment phiên bản, hoặc SHA không phải commit của tag ghi trong comment. Task 17 dùng lệnh `--check`.

Luật chọn phiên bản:
- Repo có trong `MAJORS`: lấy bản phát hành ổn định mới nhất của tiền tố đó (`v7` → `v7.x.y` lớn nhất). Đây là cách nâng `actions/checkout@v4`, `actions/setup-node@v4`, `actions/setup-python@v5` của Plan 1–5 lên major hiện tại (Quyết định 22).
- Repo không có trong `MAJORS`: giữ major đang viết (`@v3`, `@v3.2.1`, hoặc comment `# v3.2.1` khi đã ghim), và test `every action has a chosen major` báo lỗi, để người thực thi tự quyết major rồi thêm vào `MAJORS`.
- Không có tag `vX.Y.Z` nào trong major (hiếm): dùng chính tag `vX`.
- Tag pre-release (`v7.2.0-beta.1`) không bao giờ được chọn.
- `--check` không báo lỗi khi đã có bản vá mới hơn: đó là việc của Dependabot (Quyết định 23). Nó chỉ bắt SHA không khớp tag, tức một comment phiên bản nói sai.

Tag mới nhất ngày 18/11 (bảng ở Quyết định 22, cộng `actions/setup-python` v7.1.0 = `6d4fd22b20465ccc0f7354476588e8df7c9ca0e0`, tra bằng `git ls-remote`). Khi thực thi, script tra lại.

Thay đổi đáng chú ý khi nâng major cho Plan 1–5 (đối chiếu release notes):

| Action | Từ → tới | Điểm cần kiểm trong workflow cũ |
|---|---|---|
| `actions/checkout` | v4 → v7 | v5 chạy Node 24; v6 lưu credential ra file riêng; v7 chặn checkout code PR từ fork trong `pull_request_target`/`workflow_run`. Repo không dùng hai trigger đó. |
| `actions/setup-node` | v4 → v7 | v5 tự bật cache khi `package.json` có `packageManager` (repo không có); v7 là ESM và bỏ biến giả `NODE_AUTH_TOKEN`. Không workflow nào được dùng `registry-url`/`always-auth`. |
| `actions/setup-python` | v5 → v7 | v6 chạy Node 24 (runner ≥ 2.327.1); v7 là ESM và **bỏ input `pip-install`**. Plan 3 chỉ dùng `python-version`. |
| `foundry-rs/foundry-toolchain` | v1 → v1 | Chỉ ghim SHA. |

- [ ] **Step 1: Viết test thất bại**

`scripts/test/pin-actions.test.ts`:

```ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  auditPins,
  MAJORS,
  parseLsRemote,
  parseUses,
  pickTag,
  pinText,
  prefixFor,
  readWorkflowFiles,
  type UsesRef,
  verifyPins,
} from '../ops/pins';
import { readWorkflows } from '../ops/workflows';

const ROOT = join(import.meta.dirname, '..', '..');
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);
const ref = (line: string): UsesRef => parseUses(line) as UsesRef;

describe('parseUses', () => {
  it('reads step and job uses, with or without quotes and a version comment', () => {
    expect(parseUses('      - uses: actions/checkout@v7')).toEqual({
      prefix: '      - uses: ',
      action: 'actions/checkout',
      repo: 'actions/checkout',
      ref: 'v7',
      version: null,
    });
    expect(parseUses(`        uses: "changesets/action/select-mode@${SHA_A}" # v2.1.2`)).toEqual({
      prefix: '        uses: ',
      action: 'changesets/action/select-mode',
      repo: 'changesets/action',
      ref: SHA_A,
      version: 'v2.1.2',
    });
    expect(parseUses('    uses: duongnq2798/atropyle/.github/workflows/x.yml@v1')?.repo).toBe('duongnq2798/atropyle');
  });

  it('skips local actions, docker images and other lines', () => {
    expect(parseUses('      - uses: ./.github/actions/setup')).toBeNull();
    expect(parseUses('      - uses: docker://alpine:3.20')).toBeNull();
    expect(parseUses('      - run: echo uses: x@y')).toBeNull();
  });
});

describe('tags', () => {
  const LS = [
    `${SHA_A}\trefs/tags/v7`,
    `${SHA_B}\trefs/tags/v7.0.1`,
    `${SHA_C}\trefs/tags/v7.0.1^{}`,
    `${SHA_A}\trefs/tags/v7.1.0`,
    `${SHA_B}\trefs/tags/v7.2.0-beta.1`,
    `${SHA_B}\trefs/tags/v70.0.0`,
    `${SHA_C}\trefs/tags/v0.4.2`,
    `${SHA_A}\trefs/tags/v0.5.0`,
  ].join('\r\n');

  it('prefers the commit of an annotated tag', () => {
    expect(parseLsRemote(LS).get('v7.0.1')).toBe(SHA_C);
  });

  it('picks the newest stable release of a major, then the major tag itself', () => {
    const tags = parseLsRemote(LS);
    expect(pickTag(tags, 'v7')).toEqual({ tag: 'v7.1.0', sha: SHA_A });
    expect(pickTag(tags, 'v0.4')).toEqual({ tag: 'v0.4.2', sha: SHA_C });
    expect(pickTag(parseLsRemote(`${SHA_A}\trefs/tags/v3`), 'v3')).toEqual({ tag: 'v3', sha: SHA_A });
    expect(pickTag(tags, 'v8')).toBeNull();
  });

  it('takes the major from the table, then from the ref or its comment', () => {
    expect(prefixFor(ref('- uses: actions/checkout@v4'))).toBe(MAJORS['actions/checkout']);
    expect(prefixFor(ref('- uses: someone/tool@v3.2.1'))).toBe('v3');
    expect(prefixFor(ref(`- uses: someone/tool@${SHA_A} # v2.0.0`))).toBe('v2');
    expect(prefixFor(ref('- uses: someone/tool@v0.3.1'))).toBe('v0.3');
    expect(() => prefixFor(ref('- uses: someone/tool@main'))).toThrow('cannot tell which version');
  });
});

describe('pinText', () => {
  it('rewrites only uses lines and keeps everything else byte for byte', () => {
    const text =
      'jobs:\n  a:\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          fetch-depth: 0 # full history\n      - run: echo "@v4"\n';
    const out = pinText(text, () => ({ tag: 'v7.0.1', sha: SHA_A }));
    expect(out.text).toBe(text.replace('actions/checkout@v4', `actions/checkout@${SHA_A} # v7.0.1`));
    expect(out.changes).toEqual([{ line: 4, action: 'actions/checkout', from: 'v4', to: `v7.0.1 (${SHA_A})` }]);
    expect(pinText(out.text, () => ({ tag: 'v7.0.1', sha: SHA_A })).changes).toEqual([]);
  });
});

describe('auditPins and verifyPins', () => {
  it('flag uses that are not pinned, have no version comment, or do not match their tag', () => {
    const files = [
      {
        path: '.github/workflows/x.yml',
        text: [
          '      - uses: actions/checkout@v7',
          `      - uses: actions/setup-node@${SHA_A}`,
          `      - uses: actions/upload-artifact@${SHA_B} # v7.0.2`,
          '      - uses: ./.github/actions/local',
        ].join('\n'),
      },
    ];
    expect(auditPins(files)).toEqual([
      '.github/workflows/x.yml:1: actions/checkout@v7 is not pinned to a commit SHA',
      '.github/workflows/x.yml:2: actions/setup-node is pinned without a "# vX.Y.Z" comment',
    ]);
    expect(verifyPins(files, () => parseLsRemote(`${SHA_C}\trefs/tags/v7.0.2`))).toEqual([
      `.github/workflows/x.yml:3: actions/upload-artifact is pinned to ${SHA_B}, but v7.0.2 is ${SHA_C}`,
    ]);
  });
});

describe('the repository', () => {
  const files = readWorkflowFiles(ROOT);
  const used = files.flatMap((f) =>
    f.text
      .split('\n')
      .map(parseUses)
      .filter((u): u is UsesRef => u !== null),
  );

  it('pins every action to a full commit SHA with its version', () => {
    expect(files.map((f) => f.path)).toContain('.github/workflows/ci.yml');
    expect(auditPins(files)).toEqual([]);
  });

  it('every action has a chosen major', () => {
    expect([...new Set(used.map((u) => u.repo))].filter((r) => !Object.hasOwn(MAJORS, r))).toEqual([]);
  });

  it('checks the pins against their tags in CI', () => {
    const ci = readWorkflows(join(ROOT, '.github', 'workflows')).find((f) => f.name === 'ci.yml');
    expect(ci?.doc.jobs?.security?.steps?.map((s) => s.run)).toContain('npm run pin-actions -- --check');
  });
});
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `npm run test:scripts -- pin-actions`
Expected: FAIL vì không tìm thấy `../ops/pins`.

- [ ] **Step 3: Viết `scripts/ops/pins.ts`**

```ts
// Pins every `uses:` of the GitHub workflows to a full commit SHA, with the release tag as a comment:
//   - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
// A tag can be moved; a commit cannot. Dependabot keeps the pins current (security updates only).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The release line each action is pinned to. Choose a major on purpose before adding an action. */
export const MAJORS: Readonly<Record<string, string>> = {
  'actions/checkout': 'v7',
  'actions/setup-node': 'v7',
  'actions/setup-python': 'v7',
  'actions/upload-artifact': 'v7',
  'actions/download-artifact': 'v7',
  'actions/upload-pages-artifact': 'v5',
  'actions/deploy-pages': 'v5',
  'github/codeql-action': 'v4',
  'gitleaks/gitleaks-action': 'v3',
  'crytic/slither-action': 'v0.4',
  'changesets/action': 'v2',
  'foundry-rs/foundry-toolchain': 'v1',
  'cloudflare/wrangler-action': 'v4',
};

export interface UsesRef {
  /** Everything before the action: indentation, "- " and "uses: ". */
  prefix: string;
  /** "changesets/action/select-mode" */
  action: string;
  /** "changesets/action": the repository that `git ls-remote` reads. */
  repo: string;
  ref: string;
  /** Version from a trailing "# v2.1.2" comment, if any. */
  version: string | null;
}

export interface Pin {
  tag: string;
  sha: string;
}

export interface WorkflowText {
  /** Repository-relative path with forward slashes. */
  path: string;
  text: string;
}

export interface PinChange {
  /** 1-based line number. */
  line: number;
  action: string;
  from: string;
  to: string;
}

const USES = /^(\s*(?:-\s+)?uses:\s*)(["']?)([^\s"'#]+)\2([ \t]*#.*)?$/;
const SHA = /^[0-9a-f]{40}$/;
const SEMVER = /^v(\d+)\.(\d+)\.(\d+)$/;

export function parseUses(line: string): UsesRef | null {
  const m = USES.exec(line.replace(/\r$/, ''));
  if (!m) return null;
  const value = m[3];
  if (value.startsWith('./') || value.startsWith('docker://')) return null;
  const at = value.lastIndexOf('@');
  if (at < 0) throw new Error(`"${line.trim()}" has no @ref`);
  const action = value.slice(0, at);
  const [owner, name] = action.split('/');
  const version = /#\s*(v\d+(?:\.\d+){0,2})\b/.exec(m[4] ?? '')?.[1] ?? null;
  return { prefix: m[1], action, repo: `${owner}/${name}`, ref: value.slice(at + 1), version };
}

/** Output of `git ls-remote --tags`: tag → commit. An annotated tag's peeled line (^{}) wins. */
export function parseLsRemote(text: string): Map<string, string> {
  const direct = new Map<string, string>();
  const peeled = new Map<string, string>();
  for (const line of text.split('\n')) {
    const m = /^([0-9a-f]{40})\trefs\/tags\/(.+?)(\^\{\})?$/.exec(line.trim());
    if (m) (m[3] ? peeled : direct).set(m[2], m[1]);
  }
  for (const [tag, sha] of peeled) direct.set(tag, sha);
  return direct;
}

const semver = (tag: string): number[] => (SEMVER.exec(tag) ?? []).slice(1).map(Number);

function newer(a: string, b: string): number {
  const [x, y] = [semver(a), semver(b)];
  return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
}

/** Newest stable vX.Y.Z under the prefix ("v7" or "v0.4"), else the prefix tag itself, else null. */
export function pickTag(tags: ReadonlyMap<string, string>, prefix: string): Pin | null {
  const releases = [...tags.keys()].filter((t) => SEMVER.test(t) && t.startsWith(`${prefix}.`)).sort(newer);
  const tag = releases[0] ?? (tags.has(prefix) ? prefix : undefined);
  const sha = tag === undefined ? undefined : tags.get(tag);
  return tag !== undefined && sha !== undefined ? { tag, sha } : null;
}

export function prefixFor(u: UsesRef, majors: Readonly<Record<string, string>> = MAJORS): string {
  if (Object.hasOwn(majors, u.repo)) return majors[u.repo];
  const version = SHA.test(u.ref) ? u.version : u.ref;
  const m = version === null ? null : /^v(\d+)(?:\.(\d+))?/.exec(version);
  if (!m) throw new Error(`${u.action}@${u.ref}: cannot tell which version to pin; write it as ${u.action}@v<major> first`);
  return m[1] === '0' && m[2] !== undefined ? `v0.${m[2]}` : `v${m[1]}`;
}

export function readWorkflowFiles(root: string): WorkflowText[] {
  const out: WorkflowText[] = [];
  const workflows = join(root, '.github', 'workflows');
  for (const name of readdirSync(workflows).sort()) {
    if (/\.ya?ml$/.test(name)) out.push({ path: `.github/workflows/${name}`, text: readFileSync(join(workflows, name), 'utf8') });
  }
  const actions = join(root, '.github', 'actions');
  if (existsSync(actions)) {
    for (const dir of readdirSync(actions).sort()) {
      for (const file of ['action.yml', 'action.yaml']) {
        const path = join(actions, dir, file);
        if (existsSync(path)) out.push({ path: `.github/actions/${dir}/${file}`, text: readFileSync(path, 'utf8') });
      }
    }
  }
  return out;
}

export function pinText(text: string, resolve: (u: UsesRef) => Pin): { text: string; changes: PinChange[] } {
  const changes: PinChange[] = [];
  const lines = text.split('\n').map((line, i) => {
    const u = parseUses(line);
    if (!u) return line;
    const pin = resolve(u);
    const next = `${u.prefix}${u.action}@${pin.sha} # ${pin.tag}${line.endsWith('\r') ? '\r' : ''}`;
    if (next !== line) changes.push({ line: i + 1, action: u.action, from: u.version ?? u.ref, to: `${pin.tag} (${pin.sha})` });
    return next;
  });
  return { text: lines.join('\n'), changes };
}

function eachUses(files: readonly WorkflowText[], visit: (where: string, u: UsesRef) => void): void {
  for (const f of files) {
    f.text.split('\n').forEach((line, i) => {
      const u = parseUses(line);
      if (u) visit(`${f.path}:${i + 1}`, u);
    });
  }
}

/** Offline check: every action is pinned to a commit SHA and says which version that is. */
export function auditPins(files: readonly WorkflowText[]): string[] {
  const problems: string[] = [];
  eachUses(files, (where, u) => {
    if (!SHA.test(u.ref)) problems.push(`${where}: ${u.action}@${u.ref} is not pinned to a commit SHA`);
    else if (u.version === null) problems.push(`${where}: ${u.action} is pinned without a "# vX.Y.Z" comment`);
  });
  return problems;
}

/** Online check: the pinned commit is the commit of the tag named in the comment. */
export function verifyPins(
  files: readonly WorkflowText[],
  tagsOf: (repo: string) => ReadonlyMap<string, string>,
): string[] {
  const problems: string[] = [];
  eachUses(files, (where, u) => {
    if (!SHA.test(u.ref) || u.version === null) return;
    const actual = tagsOf(u.repo).get(u.version);
    if (actual !== u.ref) {
      problems.push(`${where}: ${u.action} is pinned to ${u.ref}, but ${u.version} is ${actual ?? 'not a tag'}`);
    }
  });
  return problems;
}
```

- [ ] **Step 4: Chạy test để thấy phần thuần qua**

Run: `npm run test:scripts -- pin-actions`
Expected: PASS 7 test thuần (`parseUses`, `tags`, `pinText`, `auditPins and verifyPins`). Trong `the repository`: `pins every action…` FAIL và liệt kê từng dòng `… is not pinned to a commit SHA`; `checks the pins against their tags in CI` FAIL; `every action has a chosen major` PASS.

Nếu `every action has a chosen major` FAIL với một repo (một action Plan 4 hay Plan 5 thêm mà bảng chưa có): tra các tag của nó bằng `git ls-remote --tags https://github.com/<repo>.git | grep -E 'refs/tags/v[0-9]+\.[0-9]+\.[0-9]+$' | sort -t/ -k3 -V | tail -3`, đọc release notes của major mới nhất (`gh api repos/<repo>/releases/latest --jq .body`), rồi thêm một dòng vào `MAJORS`. Nếu major mới có thay đổi phá vỡ input mà workflow đang dùng, sửa workflow đó theo release notes trong cùng commit.

- [ ] **Step 5: Viết CLI và thêm vào CI**

`scripts/ops/pin-actions.ts`:

```ts
// npm run pin-actions [-- --check]
// Without --check: rewrites every `uses:` to the newest release of its line in MAJORS, pinned by commit SHA.
// --check: exits 1 when an action is not pinned, or when a pinned commit is not the commit of its tag.
// Both read tags with `git ls-remote` (read-only, no login).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditPins, parseLsRemote, pickTag, pinText, prefixFor, readWorkflowFiles, verifyPins } from './pins';

const root = join(import.meta.dirname, '..', '..');
const check = process.argv.includes('--check');
const cache = new Map<string, Map<string, string>>();

function tagsOf(repo: string): Map<string, string> {
  let tags = cache.get(repo);
  if (!tags) {
    const out = execFileSync('git', ['ls-remote', '--tags', `https://github.com/${repo}.git`], { encoding: 'utf8' });
    tags = parseLsRemote(out);
    cache.set(repo, tags);
  }
  return tags;
}

const files = readWorkflowFiles(root);

if (check) {
  const problems = [...auditPins(files), ...verifyPins(files, tagsOf)];
  if (problems.length > 0) {
    for (const p of problems) console.error(p);
    console.error('Run `npm run pin-actions` to pin every action again.');
    process.exit(1);
  }
  console.log(`pins ok: ${files.length} files, ${cache.size} action repositories checked against their tags`);
} else {
  let total = 0;
  for (const f of files) {
    const { text, changes } = pinText(f.text, (u) => {
      const prefix = prefixFor(u);
      const pin = pickTag(tagsOf(u.repo), prefix);
      if (!pin) throw new Error(`${u.repo} has no tag ${prefix} or ${prefix}.x.y`);
      return pin;
    });
    for (const c of changes) console.log(`${f.path}:${c.line}  ${c.action}  ${c.from} -> ${c.to}`);
    if (changes.length > 0) writeFileSync(join(root, f.path), text);
    total += changes.length;
  }
  console.log(`pin-actions: ${total} lines changed in ${files.length} files`);
}
```

Thêm vào `scripts` của `package.json` gốc:

```json
"pin-actions": "tsx scripts/ops/pin-actions.ts"
```

Trong job `security` của `.github/workflows/ci.yml`, thêm ngay sau dòng `      - run: npx knip`:

```yaml
      - run: npm run pin-actions -- --check
```

- [ ] **Step 6: Ghim, rồi đọc lại thay đổi**

Run: `npm run pin-actions`
Expected: mỗi dòng đổi in dạng `.github/workflows/ci.yml:12  actions/checkout  v4 -> v7.0.1 (3d3c42e5…)`; dòng cuối `pin-actions: <n> lines changed in <m> files`. Các tag in ra bằng hoặc mới hơn bảng ở Quyết định 22.

Run: `git diff --stat .github && git diff .github | grep '^[-+] ' | grep -v 'uses:'`
Expected: lệnh thứ hai không in gì: ngoài dòng `uses:`, không dòng nào đổi.

Run: `grep -n 'pip-install\|registry-url\|always-auth\|NODE_AUTH_TOKEN\|pull_request_target\|workflow_run' .github/workflows/*.yml`
Expected: không in gì (bảng thay đổi khi nâng major ở trên). Nếu có: sửa workflow đó theo release notes của action tương ứng trong cùng commit; không hạ major.

Run: `npm run pin-actions && npm run pin-actions -- --check`
Expected: lần chạy lại in `pin-actions: 0 lines changed in <m> files`; `--check` in `pins ok: …`, thoát 0.

- [ ] **Step 7: Chạy toàn bộ test script**

Run: `npm run test:scripts && npm run typecheck:scripts && npx biome check --write scripts/ops/pins.ts scripts/ops/pin-actions.ts scripts/test/pin-actions.test.ts && npx biome ci .`
Expected: PASS mọi test, trong đó 10 test của `pin-actions`; luật chung của `workflows` vẫn qua với các dòng đã ghim (YAML bỏ comment, nên `uses?.startsWith('actions/checkout@')` vẫn khớp).

Đổi thử một ký tự trong một SHA đã ghim của `ci.yml`, chạy `npm run pin-actions -- --check`.
Expected: thoát 1, in `….yml:<dòng>: actions/… is pinned to <sha sai>, but v… is <sha đúng>`. Chạy `git checkout -- .github/workflows/ci.yml` để trả lại.

- [ ] **Step 8: Commit**

```bash
git add scripts/ops/pins.ts scripts/ops/pin-actions.ts scripts/test/pin-actions.test.ts package.json .github/workflows
git commit -m "ci: pin every action to a commit SHA and move Plan 1-5 workflows to current majors" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: `[USER]` Xem CI chạy với action đã ghim**

Sau khi push `main`, người dùng chạy:

```bash
gh run list --repo duongnq2798/atropyle --workflow ci.yml --limit 1
gh run watch --repo duongnq2798/atropyle --exit-status
```

Expected: mọi job xanh, kể cả các job của Plan 1–5 vừa nâng major và bước `npm run pin-actions -- --check` của job `security`. Nếu một job của Plan 1–5 đỏ vì input của action mới: mở log, đối chiếu release notes của action đó, sửa đúng input trong workflow, chạy lại Step 6–8. Không quay về tag không ghim.

### Task 17: Hồ sơ nộp bài `docs/submission/`: kịch bản demo ≤ 2:50, checklist E2E mainnet ngày 1/12, checklist nộp bài

**Files:**
- Create: `docs/submission/demo-script.md`, `docs/submission/e2e-mainnet-checklist.md`, `docs/submission/submission-checklist.md`, `scripts/ops/demo-timing.ts`
- Test: `scripts/test/submission.test.ts`

**Interfaces:**
- Consumes:
  - Task 6: `extractCommands(file, markdown): DocCommand[]`, `checkCommand(c, readHelp): string | null` (`scripts/ops/doc-commands.ts`); snapshot `packages/cli/test/snapshots/help/*.txt` của Plan 3.
  - Script của các task trước: `npm run traction` và `-- --verify` (Task 10), `npm run readme:sync` với `--check` / `--worker-url` (Task 11), `npm run release:check` (Task 13), `npm run pin-actions -- --check` (Task 16), `npm run docs:gen -- --check` (Task 3); `proof.yml` (Task 12); `release.yml` và Step 8–10 `[USER]` của Task 14.
  - Plan 3:
    - lệnh `atropyle plan init|plan check|simulate|prepare|status|vaults|verify|doctor|mcp`, đối chiếu cờ với snapshot;
    - tool MCP `atropyle_check_plan`, `atropyle_simulate`, `atropyle_prepare_create_vault`, `atropyle_prepare_action`, `atropyle_get_vault`, `atropyle_list_vaults`, `atropyle_verify`;
    - plugin cài bằng `/plugin marketplace add duongnq2798/atropyle` rồi `/plugin install atropyle@atropyle`, có hai skill (`atropyle-estate-planning`, `atropyle-guardian`), lệnh MCP `npx -y @atropyle/mcp`;
    - `atropyle mcp` chạy cùng server đó trên stdio.
  - Plan 2:
    - preset `drill` = `{ period: 60, threshold: 2, window: 120 }`;
    - allowance mặc định `'exact'` bằng **đúng số dư lúc prepare**;
    - `VaultStatus` (`state` là `StateName`, `lateAt`, `alarmAt`, `windowEndsAt`, `releasedAt`, `recoveryTarget`);
    - `deployment.feeTokens`, `deployment.webUrl`, `deployment.builderCode`.
  - Plan 4: `#/create?drill=1` (Drill mặc định template Simple, ô khôi phục mặc định bật), `#/v/<vault>`, `#/v/<vault>/verify`, `#/sign`.
  - Plan 5:
    - bot Telegram `/help`, `/start <vault>-<role>` qua link trên trang vault;
    - keeper theo cron mỗi phút;
    - `GET /health` trả `{ status: 'ok' | 'degraded', integrity, lastCronAt, keeper: { address, balance, dryRun } }`.
  - Contract (Plan 1): event `AlarmCancelled(bool byOwner)`, `Distributed(uint256 indexed assetIndex, address indexed to, uint256 amountOrId)`.
- Produces:
  - `scripts/ops/demo-timing.ts`:
    - `interface Segment { start: number; end: number; scene: number; narration: string }`;
    - `interface SceneSpec { scene: number; start: number; end: number }`;
    - `SPEC_SCENES`, `MAX_SECONDS = 170`, `MAX_WORDS_PER_SECOND = 2.8`;
    - `countWords(text: string): number`, `formatTime(seconds: number): string`, `parseTimeline(md: string): Segment[]`, `checkTimeline(segments: readonly Segment[]): string[]`.
  - Ba file trong `docs/submission/`. File E2E có bảng kết quả, điền trong ngày 1/12 rồi commit.

Ba điểm cần người duyệt biết:

- **Ngày 1/12, đường agent dùng plugin từ thư mục repo, còn MCP server build từ mã nguồn.**
  - Spec §12.2 ghi "agent cùng plugin". Nhưng lệnh MCP của plugin là `npx -y @atropyle/mcp` (Plan 3 Quyết định 19), mà gói chỉ có trên npm từ 2/12.
  - Vì vậy ngày 1/12 người dùng cài plugin từ marketplace cục bộ (thư mục repo) để có hai skill, và nối thêm server `atropyle-dev` chạy `node packages/cli/dist/bin.js mcp`. Server `atropyle` của plugin báo lỗi cho tới khi publish; đó là dự kiến.
  - Ngày 2/12, ngay sau khi publish, checklist nộp bài chạy lại đường agent bằng plugin cài từ GitHub (run `A-P`).
- **Mỗi vault kéo toàn bộ số dư token của owner lúc tạo.**
  - Allowance mặc định là `exact`, bằng đúng số dư lúc prepare (Plan 2 Quyết định 5). Nên checklist bắt owner giữ đúng 0,10 token trước mỗi run và chạy các run lần lượt.
  - Run nào hỏng thì thu hồi allowance bằng `revoke-all`, để vault đó không kéo tiền của run sau.
- **Keeper có thể làm trước người dùng.** Keeper chạy mỗi phút cho mọi vault, nên nó có thể gửi `poke`/`distribute` trước người dùng. Run vẫn đạt nếu event có thật; bảng kết quả ghi ai đã gửi giao dịch.

- [ ] **Step 1: Viết test thất bại**

`scripts/test/submission.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkTimeline, parseTimeline, type Segment, SPEC_SCENES } from '../ops/demo-timing';
import { checkCommand, extractCommands } from '../ops/doc-commands';

const ROOT = join(import.meta.dirname, '..', '..');
const DIR = join(ROOT, 'docs', 'submission');
const HELP_DIR = join(ROOT, 'packages', 'cli', 'test', 'snapshots', 'help');
const read = (name: string): string => readFileSync(join(DIR, name), 'utf8');
const markdown = (): string[] => readdirSync(DIR).filter((f) => f.endsWith('.md'));

describe('demo timeline', () => {
  it('reads the timed rows of the table', () => {
    const md = [
      '| Thời gian | Cảnh | Hình | Lời thoại (tiếng Anh) |',
      '|---|---|---|---|',
      '| 0:00–0:08 | 1. Vấn đề | Title card | "When someone dies." |',
      '| 1:52–2:00 | 4. Drill | Vault page | "The heir checks." |',
    ].join('\n');
    expect(parseTimeline(md)).toEqual([
      { start: 0, end: 8, scene: 1, narration: 'When someone dies.' },
      { start: 112, end: 120, scene: 4, narration: 'The heir checks.' },
    ]);
  });

  it('flags gaps, overlaps, rushed narration, moved scene limits and a cut longer than 2:50', () => {
    const ok: Segment[] = SPEC_SCENES.map((s) => ({ start: s.start, end: s.end, scene: s.scene, narration: 'Short line.' }));
    expect(checkTimeline(ok)).toEqual([]);
    const at = (i: number, patch: Partial<Segment>): Segment[] => ok.map((s, j) => (j === i ? { ...s, ...patch } : s));
    expect(checkTimeline(at(1, { start: 22 }))).toContain('0:22: starts 2 s after the previous row ends at 0:20');
    expect(checkTimeline(at(1, { start: 18 }))).toContain('0:18: overlaps the previous row, which ends at 0:20');
    expect(checkTimeline(at(0, { narration: 'word '.repeat(60) }))).toContain(
      '0:00–0:20: 60 words in 20 s is faster than 2.8 words per second',
    );
    expect(checkTimeline(at(1, { start: 22 }))).toContain('scene 2 runs 0:22–0:50, but the spec gives 0:20–0:50');
    expect(checkTimeline(at(5, { end: 175 }))).toContain('the cut lasts 2:55, longer than 2:50');
    expect(checkTimeline(ok.slice(0, 5))).toContain('scene 6 is missing');
  });
});

describe('docs/submission', () => {
  it('the demo script fits in 2:50, timed to the second', () => {
    const rows = parseTimeline(read('demo-script.md'));
    expect(rows.length).toBeGreaterThanOrEqual(12);
    expect(checkTimeline(rows)).toEqual([]);
  });

  it('the E2E checklist covers both modes on the web, the CLI and the agent, plus a keeper-only Drill', () => {
    const sections = read('e2e-mainnet-checklist.md').split(/^### /m);
    for (const id of ['W-I', 'W-R', 'C-I', 'C-R', 'A-I', 'A-R', 'K']) {
      const section = sections.find((s) => s.startsWith(`Run ${id} `));
      expect(section, id).toBeDefined();
      expect(section, id).toContain('[USER]');
    }
    expect(read('submission-checklist.md')).toContain('### Run A-P ');
  });

  it('uses only CLI commands, flags and npm scripts that exist', () => {
    const readHelp = (name: string): string | null => {
      const file = join(HELP_DIR, `${name}.txt`);
      return existsSync(file) ? readFileSync(file, 'utf8') : null;
    };
    const commands = markdown().flatMap((f) => extractCommands(f, read(f)));
    expect(commands.length).toBeGreaterThanOrEqual(15);
    expect(commands.map((c) => checkCommand(c, readHelp)).filter((p) => p !== null)).toEqual([]);
    const scripts = (dir: string): string[] =>
      Object.keys(JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8')).scripts ?? {});
    for (const f of markdown()) {
      for (const m of read(f).matchAll(/npm run ([\w:-]+)(?:\s+-w\s+([\w@./-]+))?/g)) {
        expect(scripts(m[2] ?? '.'), `${f}: ${m[0]}`).toContain(m[1]);
      }
    }
  });

  it('never signs: no private keys, no cast send, no broadcast', () => {
    for (const f of markdown()) expect(read(f), f).not.toMatch(/cast send|--private-key|PRIVATE_KEY|--broadcast|KEEPER_KEY=/);
  });
});
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `npm run test:scripts -- submission`
Expected: FAIL vì không tìm thấy `../ops/demo-timing`.

- [ ] **Step 3: Viết `scripts/ops/demo-timing.ts`**

```ts
// Checks the timed table of docs/submission/demo-script.md: rows follow each other to the second, each scene
// keeps the limits of spec §17, the narration can be spoken in its time, and the cut lasts at most 2:50.

export interface Segment {
  /** Seconds from the start of the video. */
  start: number;
  end: number;
  scene: number;
  narration: string;
}

export interface SceneSpec {
  scene: number;
  start: number;
  end: number;
}

/** Spec §17 (ecosystem spec): six scenes, 0:00 to 2:50. */
export const SPEC_SCENES: readonly SceneSpec[] = [
  { scene: 1, start: 0, end: 20 },
  { scene: 2, start: 20, end: 50 },
  { scene: 3, start: 50, end: 90 },
  { scene: 4, start: 90, end: 120 },
  { scene: 5, start: 120, end: 150 },
  { scene: 6, start: 150, end: 170 },
];

export const MAX_SECONDS = 170;

/** About 170 words a minute: brisk but clear for a non-native listener. */
export const MAX_WORDS_PER_SECOND = 2.8;

const ROW = /^\|\s*(\d+):(\d{2})–(\d+):(\d{2})\s*\|\s*(\d+)\.[^|]*\|[^|]*\|\s*(.*?)\s*\|\s*$/;

export const countWords = (text: string): number => text.split(/\s+/).filter((w) => w !== '').length;

export function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function parseTimeline(md: string): Segment[] {
  const out: Segment[] = [];
  for (const line of md.split('\n')) {
    const m = ROW.exec(line.trimEnd());
    if (!m) continue;
    out.push({
      start: Number(m[1]) * 60 + Number(m[2]),
      end: Number(m[3]) * 60 + Number(m[4]),
      scene: Number(m[5]),
      narration: m[6].replace(/^"|"$/g, ''),
    });
  }
  return out;
}

export function checkTimeline(segments: readonly Segment[]): string[] {
  const problems: string[] = [];
  if (segments.length === 0) return ['the table has no timed rows'];
  if (segments[0].start !== 0) problems.push(`the first row starts at ${formatTime(segments[0].start)}, not 0:00`);
  segments.forEach((s, i) => {
    const span = `${formatTime(s.start)}–${formatTime(s.end)}`;
    if (s.end <= s.start) problems.push(`${span}: ends before it starts`);
    const prev = segments[i - 1];
    if (prev && s.start > prev.end) {
      problems.push(`${formatTime(s.start)}: starts ${s.start - prev.end} s after the previous row ends at ${formatTime(prev.end)}`);
    }
    if (prev && s.start < prev.end) {
      problems.push(`${formatTime(s.start)}: overlaps the previous row, which ends at ${formatTime(prev.end)}`);
    }
    const words = countWords(s.narration);
    const seconds = s.end - s.start;
    if (seconds > 0 && words / seconds > MAX_WORDS_PER_SECOND) {
      problems.push(`${span}: ${words} words in ${seconds} s is faster than ${MAX_WORDS_PER_SECOND} words per second`);
    }
  });
  for (const spec of SPEC_SCENES) {
    const rows = segments.filter((s) => s.scene === spec.scene);
    if (rows.length === 0) {
      problems.push(`scene ${spec.scene} is missing`);
      continue;
    }
    const start = Math.min(...rows.map((r) => r.start));
    const end = Math.max(...rows.map((r) => r.end));
    if (start !== spec.start || end !== spec.end) {
      problems.push(
        `scene ${spec.scene} runs ${formatTime(start)}–${formatTime(end)}, but the spec gives ${formatTime(spec.start)}–${formatTime(spec.end)}`,
      );
    }
  }
  const last = segments[segments.length - 1].end;
  if (last > MAX_SECONDS) problems.push(`the cut lasts ${formatTime(last)}, longer than ${formatTime(MAX_SECONDS)}`);
  return problems;
}
```

- [ ] **Step 4: Viết kịch bản demo**

Tổng 170 giây, khớp sáu cảnh của spec §17. Lời thoại đọc khoảng 1,5–2,3 từ mỗi giây; test chặn ở 2,8.

`docs/submission/demo-script.md`:

````md
# Kịch bản video demo Atropyle (≤ 2:50)

Tài liệu nội bộ. Lời thoại và chữ trên màn hình bằng tiếng Anh, vì giám khảo đọc tiếng Anh. `scripts/test/submission.test.ts` kiểm bảng dưới:
- các dòng nối nhau tới từng giây;
- mỗi cảnh giữ đúng mốc của spec §17;
- lời thoại đọc kịp;
- tổng không quá 2:50.

## Quy tắc quay

- Mọi cảnh quay từ hệ thống thật trên X Layer mainnet, không mockup (spec §17). Quay ngày 3–5/12, sau khi publish npm (2/12), để đường agent dùng plugin cài từ GitHub.
- Chỉ dùng ví demo tạo riêng cho video, như trong `e2e-mainnet-checklist.md`. Không bao giờ để lộ seed phrase, private key, hay số dư của ví thật.
- Mỗi vault kéo toàn bộ số dư token của owner lúc tạo (allowance `exact`). Vì vậy, trước mỗi Drill, ví O giữ đúng 0,10 USDT0.
- Đoạn tua nhanh phải có chữ trên màn hình, ví dụ `5 minutes, sped up 10×`. Đoạn cắt bớt thời gian chờ có chữ `about 1 minute later`.
- Khung hình:
  - màn hình 1920×1080;
  - chữ terminal cỡ ≥ 20 px;
  - trình duyệt zoom 125%.
- Không nhạc nền, hoặc nhạc rất nhỏ. Có phụ đề tiếng Anh (file SRT hoặc chữ in thẳng).
- Số trên màn hình phải là số thật lúc quay. `[N]` trong lời thoại cảnh 6 là dòng `Vaults created` của `TRACTION.md` sau lần `npm run traction` cuối cùng trước khi quay.
- Nếu benchmark của Task 9 (`verifyMs` trên Node, ghi trong message commit) lớn hơn 90 giây, sửa chữ `about 1 minute later` ở cảnh 5 cho đúng số đo.

## Chuẩn bị trước khi quay

1. Ví O giữ đúng 0,10 USDT0 và một ít OKB; ví G1, G2, G3, H1, H2 đã có địa chỉ.
2. Một Drill Simple của ví O, heir H1 100%, tạo trước cảnh 4 khoảng 6 phút. O và H1 đã theo dõi vault trên Telegram qua link ở trang vault. Quay toàn bộ quãng chờ rồi tua nhanh. Sau đó nạp lại 0,10 USDT0 cho O để quay cảnh 2.
3. Claude Code có plugin `atropyle@atropyle` cài từ GitHub, và đã quay sẵn phần cài:
   - `/plugin marketplace add duongnq2798/atropyle`;
   - `/plugin install atropyle@atropyle`.
4. Terminal sạch ở thư mục trống, Node.js 24, mạng ổn định. Chạy thử `npx -y atropyle verify` một lần để npm đã tải gói.
5. Mở sẵn các tab trình duyệt:
   - trang chủ DeWEB;
   - Telegram Web;
   - OKLink;
   - trang MCP Registry của `io.github.duongnq2798/atropyle`;
   - docs Quickstart;
   - `TRACTION.md` trên GitHub.

## Bảng thời gian

| Thời gian | Cảnh | Hình | Lời thoại (tiếng Anh) |
|---|---|---|---|
| 0:00–0:08 | 1. Vấn đề | Chữ trắng trên nền đen: `Lost keys. Lost coins.` rồi logo Atropyle | "When someone who holds crypto dies or loses their wallet, the coins are usually gone for good." |
| 0:08–0:20 | 1. Vấn đề | Trang chủ Atropyle trên DeWEB với dòng `Beta, unaudited` và số vault | "A seed phrase has no plan B. Atropyle adds one on X Layer: a vault with no admin that never holds your tokens." |
| 0:20–0:32 | 2. Drill trên web | Bấm `Try a 5-minute Drill`; `#/create?drill=1`: template Guarded, H1 70%, H2 30%, ba giám hộ, k = 2, tắt khôi phục, tài sản USDT0 | "This is a Drill: the whole cycle in about five minutes, for free. I pick two heirs, three guardians and a token." |
| 0:32–0:42 | 2. Drill trên web | Popup OKX Wallet: ký `createVault`, rồi ký `approve` | "OKX Wallet signs the vault, then an allowance for exactly my current balance. The tokens stay in my wallet." |
| 0:42–0:50 | 2. Drill trên web | `#/v/<vault>`: trạng thái Active, đồng hồ đếm ngược, dòng policy trên processor ATRO | "From now on, a LATCH circuit we taped out on our own TapeOut processor decides every state change." |
| 0:50–1:00 | 3. Agent | Claude Code: `/plugin install atropyle@atropyle`, danh sách tool `atropyle_*` | "The same works from an AI agent. Claude Code installs the Atropyle plugin: an MCP server and two skills." |
| 1:00–1:12 | 3. Agent | Gõ: "70% to my wife, 30% to my son; my brother and two friends are guardians" (kèm địa chỉ); agent gọi `atropyle_check_plan`, `atropyle_simulate`, hiện timeline | "I describe the plan in plain words. The agent writes it, checks it on chain and shows the whole timeline." |
| 1:12–1:22 | 3. Agent | Agent gọi `atropyle_prepare_create_vault`, in link ký và mô phỏng từng bước đạt | "Then it prepares the transactions and gives me a signing link. The agent never touches a key." |
| 1:22–1:30 | 3. Agent | Link mở `#/sign`: tóm tắt do trang tự giải mã, OKX Wallet ký | "The signing page decodes every call itself, so I see exactly what I sign." |
| 1:30–1:40 | 4. Drill không ai bấm | Trang vault của Drill Simple, chữ `5 minutes, sped up 10×`; Telegram của H1 nhận tin báo động | "Now a Drill where nobody does anything. The owner misses two check-ins, the keeper raises the alarm, and Telegram tells the heir." |
| 1:40–1:52 | 4. Drill không ai bấm | Trạng thái ReleasedInherit; OKLink: giao dịch `distribute` từ ví keeper, event `Distributed`; số dư H1 tăng | "Nobody cancels, so the vault releases. The keeper pays out, and the tokens land in the heir's wallet." |
| 1:52–2:00 | 4. Drill không ai bấm | H1 mở `#/v/<vault>/verify`: mọi dòng xanh | "The heir does not have to trust us. One page checks this vault against the chain." |
| 2:00–2:10 | 5. Verify | Terminal: gõ `npx -y atropyle verify` | "Anyone can check the rules. One command downloads the policy circuit from X Layer mainnet and tries every input." |
| 2:10–2:22 | 5. Verify | Chữ `about 1 minute later`; output: `67,108,864` tổ hợp, P1–P8 đạt, hai nhà vận hành RPC, block number | "All sixty-seven million input combinations: properties P1 to P8 hold, and two independent RPC operators agree on every read." |
| 2:22–2:30 | 5. Verify | Output: mỗi netlist hash khớp mã nguồn, beacon frozen, exit code 0 | "Every netlist hash matches the published source, and the processor sits behind a frozen beacon." |
| 2:30–2:40 | 6. Hệ sinh thái và traction | Đoạn mã của Quickstart; trang MCP Registry; docs trên DeWEB; mục `KofN5`/`Ge4` của docs | "Builders get an SDK, a CLI and an MCP server on npm, docs on DeWEB, and two circuits anyone can reuse." |
| 2:40–2:50 | 6. Hệ sinh thái và traction | `TRACTION.md` trên GitHub; khung cuối: `npx -y atropyle verify`, URL DeWEB, `github.com/duongnq2798/atropyle` | "So far, [N] Atropyle vaults, counted straight from chain events. Atropyle: verify, don't trust." |

## Sau khi dựng

Run: `ffprobe -v error -show_entries format=duration -of csv=p=0 atropyle-demo.mp4`
Expected: một số ≤ `170.0`.

Xem lại một lượt:
- không lộ seed phrase hay key;
- mọi đoạn tua nhanh có chữ;
- số vault ở cảnh 6 bằng `TRACTION.md` đã commit;
- các URL đọc được.
````

- [ ] **Step 5: Viết checklist E2E mainnet ngày 1/12**

Mỗi Drill dùng preset `drill`:
- chu kỳ 60 giây;
- báo động khi trễ 2 chu kỳ (`lateAt` = lần sống cuối + 120 giây);
- cửa sổ 120 giây;
- hết hạn sau 7 ngày.

Một run mất khoảng 6–8 phút; 7 run chạy lần lượt mất khoảng một giờ.

`docs/submission/e2e-mainnet-checklist.md`:

````md
# Checklist E2E trên mainnet, ngày 1/12

Tài liệu nội bộ. Mục tiêu (spec §12.2 và §18): Drill ở cả hai chế độ (thừa kế, khôi phục) theo ba đường (web, CLI cùng ví, agent cùng plugin), cộng một Drill để keeper tự chạy. Tổng cộng 7 run.

Vai trò trong file này:
- `[USER]`: chỉ người dùng làm, vì cần ký bằng ví hoặc cần tài khoản.
- `[Claude]`: chỉ đọc chain và in link ký. Claude không bao giờ ký, không cầm key, không gửi giao dịch. Claude điền bảng kết quả ở cuối file và commit.

Mọi thời điểm là giờ của block (Unix giây), đọc bằng `atropyle status`.

**Chạy các run lần lượt, không chồng nhau.**
- Mỗi vault được approve đúng số dư token của O lúc tạo (allowance `exact`), và khi release sẽ chuyển toàn bộ phần đó.
- Vì vậy, trước **mỗi** run, O phải giữ đúng 0,10 `TOKEN`.

## 0. Chuẩn bị (sáng 1/12)

- [ ] `[USER]` Tạo 7 tài khoản demo **mới** trong OKX Wallet (extension trên máy tính):
  - O (owner);
  - H1, H2 (heir);
  - G1, G2, G3 (giám hộ);
  - R (ví khôi phục).

  Địa chỉ của chúng sẽ nằm trong repo công khai, nên không dùng ví thật. Ví F là ví nạp, có thể là ví của chính người dùng.
- [ ] `[USER]` Nạp OKB làm gas: O khoảng 0,01 OKB, G1 và G2 mỗi ví khoảng 0,005 OKB. Phí trên X Layer nhỏ hơn nhiều; số này để dư.
- [ ] `[USER]` Ví F giữ ít nhất 0,8 của một token trong `feeTokens` của `deployments/xlayer.json` (USDT0, USDC hoặc USDG). Đây là `TOKEN`; mỗi run dùng 0,10.
- [ ] `[USER]` Mở Telegram, tìm bot Atropyle, gõ `/help`. Expected: bot trả lời chào và danh sách lệnh.
- [ ] `[Claude]` Build từ mã nguồn (npm chỉ có gói từ 2/12), rồi khai báo biến trong Git Bash, ở gốc repo:

```bash
npm run build -w circuits && npm run build -w packages/sdk && npm run build -w packages/mcp && npm run build -w packages/cli
REPO="$PWD"
atropyle() { node "$REPO/packages/cli/dist/bin.js" "$@"; }
node -p "require('./deployments/xlayer.json').feeTokens.join('\n')"
O=0x...; H1=0x...; H2=0x...; G1=0x...; G2=0x...; G3=0x...; R=0x...
TOKEN=0x...
WORKER_URL=https://atropyle-worker.<account>.workers.dev
```

Nguồn của các biến:
- `O`…`R`: người dùng đưa;
- `TOKEN`: địa chỉ token ở bước trên, lấy từ danh sách `node -p` in ra;
- `WORKER_URL`: URL Worker của Task 14 Step 8.

- [ ] `[Claude]` Kiểm môi trường:

```bash
atropyle doctor
atropyle verify
curl -s "$WORKER_URL/health"
```

Expected:
- `doctor` thoát 0.
- `verify` thoát 0: P1–P8 đạt, hai RPC đồng thuận.
- `/health`:
  - `status` là `ok`;
  - `integrity` là `pass`;
  - `keeper.dryRun` là `false`;
  - `keeper.address` khác `null`;
  - `keeper.balance` lớn hơn `"0"`.

Ghi địa chỉ ví keeper vào bảng kết quả, vì run K dùng nó.

- [ ] `[USER]` Mở trang web (`webUrl` trong `deployments/xlayer.json`, bản DeWEB), kết nối ví O. Expected: trang chủ hiện `Beta, unaudited` và số vault.

## 1. Lệnh đọc dùng trong mọi run

Trạng thái:

```bash
atropyle status "$V"
atropyle status "$V" --json
```

Trong output `--json`:
- `status.state` là một trong `active`, `grace`, `recovery`, `releasedInherit`, `releasedRecover`; `status.stateCode` tương ứng là 0, 1, 3, 5, 7.
- Các mốc cần ghi: `status.lateAt`, `status.alarmAt`, `status.windowEndsAt`, `status.releasedAt`.

Số dư token (chỉ đọc):

```bash
cast call "$TOKEN" "balanceOf(address)(uint256)" "$O" --rpc-url https://rpc.xlayer.tech
```

Nếu `deployments/xlayer.json` có `builderCode`, input của giao dịch tạo vault phải kết thúc bằng hậu tố ERC-8021. Thay `<create tx hash>` bằng hash thật:

```bash
cast tx <create tx hash> input --rpc-url https://rpc.xlayer.tech | tail -c 33
```

Expected: `80218021802180218021802180218021`.

**Trước mỗi run:**
1. `[USER]` Chuyển `TOKEN` từ F sang O sao cho O giữ đúng 0,10.
2. `[Claude]` Kiểm số dư O bằng lệnh `cast call` ở trên. Với token 6 chữ số thập phân, kết quả phải là `100000`.

## 2. Bảy run

### Run W-I — Web, thừa kế

- [ ] `[USER]` Trên trang chủ, bấm `Try a 5-minute Drill` với ví O, rồi điền:
  - template Guarded;
  - H1 70%, H2 30%;
  - giám hộ G1, G2, G3, k = 2;
  - **tắt** ô khôi phục (mặc định bật);
  - tài sản `TOKEN`.

  Ký `createVault`, rồi `approve`. Ghi địa chỉ vault (đặt `V=0x...` trong terminal) và hash giao dịch tạo vault.
- [ ] `[Claude]` `atropyle status "$V" --json`:
  - `status.state` là `active`;
  - `config.drill` là `true`;
  - heir, giám hộ và `config.k` đúng như trên;
  - `status.assets[0].coverage` bằng số dư của O.

  Thêm nữa, `atropyle vaults "$H1"` phải có `$V`.
- [ ] `[USER]` Trên trang vault, bấm link Telegram, theo dõi vault với vai trò owner.
- [ ] Đợi qua `lateAt`. Kiểm:
  - `[Claude]` `status.state` là `grace` và `status.alarmAt` khác `null`;
  - `[USER]` Telegram nhận tin báo động.
- [ ] `[USER]` Kết nối ví G1, mở trang vault, xác nhận owner đã mất (attest death), ký. Làm lại với G2.
- [ ] Đợi qua `windowEndsAt`. `[USER]` Kết nối G1, bấm distribute, ký. Nếu keeper đã làm trước thì bỏ qua bước ký và ghi lại.
- [ ] `[Claude]` Kiểm kết quả:
  - `status.state` là `releasedInherit`;
  - trên OKLink có hai event `Distributed`, cho H1 và H2;
  - H1 tăng 0,07 và H2 tăng 0,03 `TOKEN`;
  - số dư O là 0.
- [ ] Kiểm verify:
  - `[Claude]` `atropyle verify --vault "$V"` thoát 0;
  - `[USER]` mở `#/v/<vault>/verify`: mọi dòng xanh.

### Run W-R — Web, khôi phục

- [ ] `[USER]` Trên `#/create?drill=1` với ví O, điền:
  - template Guarded;
  - H1 100%;
  - giám hộ G1, G2, G3, k = 2;
  - **giữ bật** ô khôi phục;
  - tài sản `TOKEN`.

  Ký. Ghi `V`.
- [ ] `[USER]` Kết nối G1, bầu khôi phục về ví `R`, ký. Làm lại với G2.
- [ ] Kiểm ngay sau phiếu thứ hai:
  - `[Claude]` `status.state` là `recovery` và `status.recoveryTarget` bằng `R`;
  - `[USER]` Telegram nhận tin báo động.
- [ ] Owner không làm gì. Đợi qua `windowEndsAt`. `[USER]` Kết nối G1, bấm distribute, ký, hoặc ghi lại nếu keeper làm trước.
- [ ] `[Claude]` Kiểm kết quả:
  - `status.state` là `releasedRecover`;
  - `R` tăng 0,10 `TOKEN`;
  - H1 không nhận gì;
  - `atropyle verify --vault "$V"` thoát 0.

### Run C-I — CLI cùng ví, thừa kế, có lần check-in huỷ báo động

- [ ] `[Claude]` Viết và kiểm plan:

```bash
atropyle plan init --heir "$H1:70" --heir "$H2:30" --guardian "$G1" --guardian "$G2" --guardian "$G3" --k 2 --asset "erc20:$TOKEN" --owner "$O" --drill --out e2e-c-i.plan.json
atropyle plan check e2e-c-i.plan.json --drill
atropyle simulate --plan e2e-c-i.plan.json --drill
atropyle prepare create-vault e2e-c-i.plan.json --drill
```

Expected:
- `plan check` thoát 0;
- `simulate` in timeline: báo động sau 2 phút, release sau thêm 2 phút;
- `prepare` in dòng `Create Drill vault 0x… for …`, link ký, và mọi bước mô phỏng đạt.

Đặt `V` bằng địa chỉ trong dòng `Create Drill vault`.

- [ ] `[USER]` Mở link trong trình duyệt có OKX Wallet, chọn ví O, ký từng bước. `[Claude]` Kiểm `atropyle vaults "$O" --json` có `V` với `drill: true`.
- [ ] Đợi tới khi `status.state` là `grace`. `[Claude]` In link check-in bằng `atropyle prepare check-in "$V" --as "$O"`. `[USER]` Ký bằng ví O.
- [ ] `[Claude]` Kiểm sau check-in:
  - `status.state` là `active`;
  - `status.alarmAt` là `null`;
  - trên OKLink có event `AlarmCancelled` với `byOwner = true`.
- [ ] Đợi tới khi `status.state` là `grace` lần nữa. `[Claude]` In link cho hai giám hộ; `[USER]` ký bằng G1, rồi G2:

```bash
atropyle prepare attest-death "$V" --as "$G1"
atropyle prepare attest-death "$V" --as "$G2"
```

- [ ] Đợi qua `windowEndsAt`. `[Claude]` In link bằng `atropyle prepare distribute "$V" --as "$G1"`. `[USER]` Ký, hoặc ghi lại nếu keeper làm trước.
- [ ] `[Claude]` Kiểm kết quả:
  - `status.state` là `releasedInherit`;
  - H1 tăng 0,07 và H2 tăng 0,03 `TOKEN`;
  - `atropyle verify --vault "$V"` thoát 0.

### Run C-R — CLI cùng ví, khôi phục

- [ ] `[Claude]` Viết plan có khôi phục và in link tạo vault:

```bash
atropyle plan init --heir "$H1:100" --guardian "$G1" --guardian "$G2" --guardian "$G3" --k 2 --recovery --asset "erc20:$TOKEN" --owner "$O" --drill --out e2e-c-r.plan.json
atropyle plan check e2e-c-r.plan.json --drill
atropyle prepare create-vault e2e-c-r.plan.json --drill
```

- [ ] `[USER]` Ký bằng ví O. `[Claude]` Đặt `V` theo dòng `Create Drill vault`; kiểm `atropyle vaults "$O" --json` có `V`.
- [ ] `[Claude]` In link bầu khôi phục; `[USER]` ký bằng G1, rồi G2:

```bash
atropyle prepare vote-recovery "$V" --as "$G1" --target "$R"
atropyle prepare vote-recovery "$V" --as "$G2" --target "$R"
```

- [ ] `[Claude]` Kiểm `status.state` là `recovery` và `status.recoveryTarget` bằng `R`. Đợi qua `windowEndsAt`, rồi in link bằng `atropyle prepare distribute "$V" --as "$G1"`. `[USER]` Ký, hoặc ghi lại nếu keeper làm trước.
- [ ] `[Claude]` Kiểm kết quả:
  - `status.state` là `releasedRecover`;
  - `R` tăng 0,10 `TOKEN`;
  - `atropyle verify --vault "$V"` thoát 0.

### Run A-I — Agent cùng plugin, thừa kế

Gói npm chỉ có từ 2/12. Vì vậy hôm nay:
- skill lấy từ plugin cài từ thư mục repo;
- tool MCP lấy từ server `atropyle-dev` build từ mã nguồn.

- [ ] `[USER]` Tạo một thư mục trống và mở terminal ở đó. Thay `<repo>` bằng đường dẫn tuyệt đối của repo, ví dụ `E:/1Hackathon2026/xlayer-hackathon`:

```bash
claude mcp add --scope local atropyle-dev -- node "<repo>/packages/cli/dist/bin.js" mcp
claude
```

Trong phiên Claude Code:
1. Gõ `/plugin marketplace add <repo>`, rồi `/plugin install atropyle@atropyle`.
2. Khởi động lại phiên.
3. Gõ `/mcp`.

Expected:
- `atropyle-dev` connected, có các tool `atropyle_*`;
- server `atropyle` của plugin báo failed (gói npm chưa có; đúng như dự kiến);
- `/plugin` liệt kê hai skill `atropyle-estate-planning` và `atropyle-guardian`.

- [ ] `[USER]` Gõ (thay địa chỉ thật): "Create an Atropyle Drill for my wallet O: 70% to H1, 30% to H2. G1, G2 and G3 are guardians and two of them must agree. Cover my TOKEN balance."

  Expected:
  - agent gọi `atropyle_check_plan`;
  - gọi `atropyle_simulate` và giải thích timeline;
  - gọi `atropyle_prepare_create_vault`, rồi đưa link ký;
  - agent không hỏi key, không tự ký.
- [ ] `[USER]` Mở link, ký bằng ví O. Hỏi agent "What is the address of the vault I just created?" Expected: agent đọc `atropyle_list_vaults` hoặc `atropyle_get_vault` và trả đúng vault. `[Claude]` đặt `V` theo câu trả lời và kiểm bằng `atropyle status "$V"`.
- [ ] Đợi tới khi `status.state` là `grace`. `[USER]` Hỏi agent "Prepare the death attestation for vault V as guardian G1", ký bằng G1; làm lại với G2. Expected: agent gọi `atropyle_prepare_action`.
- [ ] Đợi qua `windowEndsAt`. `[USER]` Hỏi agent "Is vault V released? If it is, prepare distribute." Ký, hoặc ghi lại nếu keeper làm trước.
- [ ] Kiểm kết quả:
  - `[USER]` hỏi agent "Verify vault V." Expected: agent gọi `atropyle_verify` và báo đạt.
  - `[Claude]` `status.state` là `releasedInherit`; H1 tăng 0,07 và H2 tăng 0,03 `TOKEN`.

### Run A-R — Agent cùng plugin, khôi phục

- [ ] `[USER]` Cùng phiên agent, gõ: "Create another Drill for O: everything to H1, guardians G1, G2 and G3, two must agree, and two guardians may also move everything to my new wallet if I lose this one. Cover my TOKEN balance."

  Expected: plan có `recoveryEnabled: true`, và agent đưa link. `[USER]` Ký bằng O. `[Claude]` Đặt `V` như ở run A-I.
- [ ] `[USER]` Gõ "Prepare a recovery vote for vault V as guardian G1, to the new wallet R." Ký bằng G1; làm lại với G2. Expected: agent gọi `atropyle_prepare_action` với action `voteRecovery`.
- [ ] Đợi qua `windowEndsAt`. `[USER]` Gõ "Prepare distribute for vault V." Ký, hoặc ghi lại nếu keeper làm trước.
- [ ] `[Claude]` Kiểm kết quả:
  - `status.state` là `releasedRecover`;
  - `R` tăng 0,10 `TOKEN`;
  - `atropyle verify --vault "$V"` thoát 0.

### Run K — Drill để keeper tự chạy

Tiêu chí của spec §12.2: keeper bật báo động trong vòng một chu kỳ sau `lateAt`, và `distribute` sau khi cửa sổ kết thúc. Không ai bấm gì sau bước tạo.

- [ ] `[USER]` Trên `#/create?drill=1` với ví O: template Simple (không giám hộ), H1 100%, tài sản `TOKEN`. Ký. Ghi `V` và giờ tạo.
- [ ] `[USER]` Trên trang vault, bấm link Telegram hai lần: một lần chọn vai trò owner, một lần heir (cùng hoặc khác tài khoản Telegram). Rồi đóng trình duyệt, không làm gì nữa.
- [ ] `[Claude]` Mỗi phút chạy `atropyle status "$V" --json` cho tới khi `status.state` là `releasedInherit`. Ghi `lateAt`, `alarmAt`, `windowEndsAt`, `releasedAt`.
- [ ] `[Claude]` Kiểm báo động bằng `alarmAt − lateAt`. Cron chạy mỗi phút và giao dịch cần vài giây để vào block, nên:
  - ≤ 60 giây (một chu kỳ Drill): đạt.
  - 61–90 giây: đạt có ghi chú. Ghi kèm `lastCronAt` của `/health`.
  - Trên 90 giây: không đạt. Đọc log cron của Worker.
- [ ] `[Claude]` Kiểm phần chi trả:
  - giao dịch `distribute` có `from` bằng địa chỉ ví keeper (xem trên OKLink);
  - nó được gửi không quá 120 giây sau `windowEndsAt`;
  - H1 tăng 0,10 `TOKEN`.
- [ ] `[USER]` Telegram nhận đủ hai tin: báo động và release.

## 3. Khi một run không đạt

1. Dừng run đó, không chạy tiếp các bước sau của nó. Ghi lại hash, mốc thời gian và output `--json`.
2. Nếu vault chưa release, thu hồi allowance để nó không kéo token của các run sau. `[Claude]` In link bằng `atropyle prepare revoke-all "$V" --as "$O"`; `[USER]` ký bằng ví O.
3. Contract đã đóng băng, nên lỗi nằm ở SDK, CLI, MCP, web hoặc Worker. Sửa ở plan tương ứng, chạy lại test của nó, rồi chạy lại **cả run** với một Drill mới.
4. Nếu lỗi do keeper hay Telegram (Plan 5), kiểm `/health` và log của Worker trước rồi mới sửa.

## 4. Bảng kết quả (điền trong ngày, rồi commit)

Ví keeper: `<địa chỉ keeper.address từ /health>`

| Run | Vault | Tạo vault (tx) | `lateAt` / `alarmAt` | Release (`releasedAt`) | `distribute` (tx, người gửi) | `verify --vault` | Web verify | Telegram | Kết quả |
|---|---|---|---|---|---|---|---|---|---|
| W-I | | | | | | | | | |
| W-R | | | | | | | | | |
| C-I | | | | | | | | | |
| C-R | | | | | | | | | |
| A-I | | | | | | | | | |
| A-R | | | | | | | | | |
| K | | | | | | | | | |

Khi xong cả 7 run:
1. `[Claude]` Commit file này với message `docs(submission): record the mainnet E2E run of 1/12`.
2. Xoá `e2e-c-i.plan.json` và `e2e-c-r.plan.json` khỏi thư mục làm việc; không commit chúng.
````

- [ ] **Step 6: Viết checklist nộp bài**

`docs/submission/submission-checklist.md`:

````md
# Checklist nộp bài (2/12 → 6/12)

Tài liệu nội bộ. Nộp ngày 6/12, hạn chót 7/12. `[USER]` là việc chỉ người dùng làm được. Đánh dấu từng ô khi xong; ô nào không đạt thì sửa trước khi nộp.

## 0. Trước 2/12: việc của người dùng trong spec §19

Mục nào chưa xong thì làm trước khi publish.

- [ ] `[USER]` Việc 1: dự án đã có trên bảng bình chọn Accelerate, và đã có bài teaser công khai.
- [ ] `[USER]` Việc 7: Builder Code đã nằm trong trường `builderCode` của `deployments/xlayer.json`.
- [ ] `[USER]` Việc 8: site đã đăng lên DeWEB bằng `npm run deweb:publish` của Plan 4 (30/11–2/12), và mở được ở URL DeWEB.
- [ ] `[USER]` Việc 10 (30/11): mở site DeWEB trong OKX App trên điện thoại thật, iOS và Android.
  - Expected: kết nối ví được, tạo Drill được, docs mở được ở `/docs/`.
  - Nếu service worker không cài được, gateway chuyển sang `<label>-open.tapekit.org` (spec §11.2). Ghi lại máy nào rơi vào chế độ này; site vẫn phải chạy đủ ba việc trên ở chế độ đó.
- [ ] `[USER]` Việc 11: nếu phép đo của Plan 5 vượt gói free của Workers, đã chọn Workers Paid hoặc GitHub Actions cho keeper.

## 1. Ngày 2/12: khoá tính năng và publish

- [ ] E2E ngày 1/12 đã đạt cả 7 run, và bảng kết quả trong `docs/submission/e2e-mainnet-checklist.md` đã commit.
- [ ] CI của `main` xanh: `gh run list --repo duongnq2798/atropyle --workflow ci.yml --branch main --limit 1` cho `success`.
- [ ] Các bản sinh khớp mã nguồn:

```bash
npm run docs:gen -- --check
npm run readme:sync -- --check
npm run pin-actions -- --check
npm run release:check
```

Expected: cả bốn lệnh thoát 0.

- [ ] `[USER]` Publish `0.1.0` theo Task 14 Step 9 (token lần đầu, `NPM_PUBLISH`, `release.yml`, `npm audit signatures`), rồi Step 10 (trusted publishing, xoá `NPM_TOKEN`).
- [ ] Bốn gói có trên npm đúng phiên bản. Chạy trong một thư mục tạm, ngoài repo:

```bash
npx -y atropyle@0.1.0 --version
npm view @atropyle/sdk@0.1.0 version
npm view @atropyle/circuits@0.1.0 version
npm view @atropyle/mcp@0.1.0 mcpName
npx -y atropyle@0.1.0 verify
```

Expected:
- ba lệnh đầu in `0.1.0` (lệnh đầu chạy chính bin `atropyle` từ npm);
- lệnh thứ tư in `io.github.duongnq2798/atropyle`;
- `verify` thoát 0.

- [ ] `[USER]` Đăng MCP Registry (spec §19 việc 9). Cài `mcp-publisher` bằng Homebrew hoặc binary release chính thức; gói npm cùng tên không phải công cụ chính thức. Ở gốc repo, chạy `mcp-publisher login github` rồi `mcp-publisher publish`.

  Kiểm: `curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=io.github.duongnq2798/atropyle"` có server `io.github.duongnq2798/atropyle` bản `0.1.0`.
- [ ] Badge: chạy `gh workflow run proof.yml --repo duongnq2798/atropyle --ref main`. Sau khi run xong, badge "mainnet policy proof" trong README hiện `passing`.

### Run A-P — Agent với plugin cài từ GitHub (sau khi publish)

- [ ] `[USER]` Mở terminal ở **cùng** thư mục trống của run A-I ngày 1/12. Gỡ server dev:

```bash
claude mcp remove --scope local atropyle-dev
claude
```

Trong phiên Claude Code, gỡ bản cục bộ rồi cài bản từ GitHub:
1. `/plugin uninstall atropyle@atropyle`
2. `/plugin marketplace remove atropyle`
3. `/plugin marketplace add duongnq2798/atropyle`
4. `/plugin install atropyle@atropyle`
5. Khởi động lại phiên, rồi gõ `/mcp`.

Expected: server `atropyle` của plugin connected (chạy `npx -y @atropyle/mcp`), và hai skill của Atropyle có trong `/plugin`.

- [ ] `[USER]` Gõ "Verify the Atropyle policy on X Layer mainnet." Expected: agent gọi `atropyle_verify` và báo P1–P8 đạt.
- [ ] `[USER]` Chuyển 0,10 `TOKEN` từ F sang O như ngày 1/12. Rồi gõ lại đúng câu tạo Drill của run A-I, với địa chỉ thật.

  Expected: agent theo skill, gọi `atropyle_check_plan`, `atropyle_simulate`, `atropyle_prepare_create_vault` và đưa link ký.

  Sau đó:
  - `[USER]` ký bằng ví O;
  - `[Claude]` chạy `npx -y atropyle@0.1.0 status <vault>`: `status.state` là `active`.

  Drill này để keeper tự chạy tới hết.

## 2. Ngày 3–5/12: Drill, video, số liệu

- [ ] `[USER]` Chiến dịch Drill: đăng bài kèm link `#/create?drill=1` và lệnh `npx -y atropyle verify`; mời người dùng thật thử Drill.
- [ ] `[USER]` Sau lần đăng DeWEB cuối cùng, mở lại site trong OKX App (iOS và Android). Expected: như việc 10 ở mục 0, và badge "100% on-chain" của gateway vẫn hiện.
- [ ] Bản mirror và docs trên GitHub Pages trả `200`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://duongnq2798.github.io/atropyle/
curl -s -o /dev/null -w '%{http_code}\n' https://duongnq2798.github.io/atropyle/docs/index.html
curl -s -o /dev/null -w '%{http_code}\n' https://duongnq2798.github.io/atropyle/docs/reference/contracts.html
```

- [ ] Worker: `curl -s "<WORKER_URL>/health"` có `status` là `ok`; bot Telegram trả lời `/help`.
- [ ] `[USER]` Quay video theo `docs/submission/demo-script.md`. Kiểm độ dài bằng `ffprobe` (≤ 170 giây). Tải lên YouTube ở chế độ Unlisted hoặc Public, rồi ghi link.

## 3. Ngày 6/12: số liệu cuối và nộp

- [ ] Cập nhật traction ngay trước khi nộp:

```bash
npm run build -w circuits
npm run traction
npm run traction -- --verify
```

Expected: `TRACTION.md matches a fresh count from the chain`. Commit `TRACTION.md` và `traction/cursor.json` với message `docs(traction): update to block <b>`, trong đó `<b>` là block cuối ghi trong `TRACTION.md`.

- [ ] Nếu URL Worker đổi so với README: chạy `npm run readme:sync -- --worker-url <WORKER_URL>`, rồi commit `README.md`.
- [ ] Push `main`; CI xanh lần cuối.
- [ ] Đọc lại README trên GitHub:
  - badge hiển thị;
  - bảng deployment đúng địa chỉ của `deployments/xlayer.json`;
  - dòng `Beta, unaudited` có mặt.

### Nội dung cần có sẵn cho form nộp

Đối chiếu với form thật của X Layer TapeOut; form có thể hỏi khác danh sách này.

| Mục | Nội dung |
|---|---|
| Tên dự án | Atropyle (processor TapeOut: `ATRO`) |
| Repo | `https://github.com/duongnq2798/atropyle` |
| Web (DeWEB) | `webUrl` trong `deployments/xlayer.json` |
| Bản mirror | `https://duongnq2798.github.io/atropyle/` |
| Docs | `https://duongnq2798.github.io/atropyle/docs/` |
| Video | link YouTube ở mục 2 |
| Contract | factory, vault implementation, processor, policy ID: trang `reference/contracts.html#deployments` |
| Gói npm | `atropyle`, `@atropyle/sdk`, `@atropyle/mcp`, `@atropyle/circuits` (`0.1.0`) |
| MCP Registry | `io.github.duongnq2798/atropyle` |
| Traction | số trong `TRACTION.md` đã commit hôm nay, kèm lệnh `npm run traction -- --verify` |

Elevator pitch (tiếng Anh, 45 từ):

> Atropyle is a non-custodial inheritance and wallet-recovery vault on X Layer. Your tokens stay in your wallet. A LATCH circuit taped out on TapeOut decides when heirs are paid or guardians recover a lost wallet, and anyone can verify all 67,108,864 cases with one command.

Mô tả ngắn (tiếng Anh):

> When a crypto holder dies or loses their keys, their assets are usually lost for good. Atropyle lets an owner name heirs and guardians, then simply check in from time to time. If the owner goes silent, an alarm starts; if nobody cancels it, the vault pays the heirs. Guardians can also move everything to the owner's new wallet after a lost key. The vault never holds tokens, has no admin and cannot be upgraded. Every state change is decided by the AtropylePolicy circuit on Atropyle's own TapeOut processor, and `npx atropyle verify` checks that circuit over all 67,108,864 inputs from two independent RPC operators. Builders get an SDK, a CLI, an MCP server for AI agents, and two reusable circuits, KofN5 and Ge4. Beta, unaudited: start with a free Drill.

- [ ] `[USER]` Điền form và nộp. Lưu ảnh chụp màn hình xác nhận.
- [ ] `[USER]` Đăng bài công bố có link video, repo và lệnh `npx -y atropyle verify`.
````

- [ ] **Step 7: Chạy test để thấy qua**

Ghi chú cho người viết docs: `extractCommands` (Task 6) coi mọi chữ `atropyle` đứng sau khoảng trắng và theo sau là một từ là một lệnh CLI. Vì vậy, kiểm phiên bản của gói CLI bằng `npx -y atropyle@0.1.0 --version`, không bằng `npm view atropyle@0.1.0 version` (từ `version` sẽ bị coi là lệnh con).

Run: `npm run test:scripts -- submission && npm run typecheck:scripts && npx biome check --write scripts/ops/demo-timing.ts scripts/test/submission.test.ts && npx biome ci .`
Expected: PASS 6 test của `submission`; `tsc` và biome thoát 0.

Nếu một test báo lỗi:
- `uses only CLI commands, flags and npm scripts that exist` báo một cờ không có: sửa file trong `docs/submission/` theo snapshot `--help` của Plan 3, không sửa snapshot.
- `the demo script fits in 2:50` báo một dòng quá nhanh: rút gọn lời thoại của dòng đó, không kéo dài cảnh ra ngoài mốc của spec.

- [ ] **Step 8: Commit**

```bash
git add docs/submission/demo-script.md docs/submission/e2e-mainnet-checklist.md docs/submission/submission-checklist.md scripts/ops/demo-timing.ts scripts/test/submission.test.ts
git commit -m "docs(submission): demo script, mainnet E2E checklist and submission checklist" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: `[USER]` Chạy E2E ngày 1/12**

Người dùng làm theo `docs/submission/e2e-mainnet-checklist.md` từ mục 0. Claude chỉ chạy các bước `[Claude]` (đọc chain, in link) và điền bảng kết quả. Khi cả 7 run đạt, commit:

```bash
git add docs/submission/e2e-mainnet-checklist.md
git commit -m "docs(submission): record the mainnet E2E run of 1/12" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 18 (P1): `npm run doc-test`: chạy ví dụ có nhãn `test` của docs trên devnet

Chỉ làm khi P0 (Task 1–17) xong trước 30/11, theo bảng lịch. Task này không chặn việc nộp bài.

**Files:**
- Create: `scripts/ops/doc-blocks.ts`, `scripts/ops/doc-test.ts`
- Modify:
  - `package.json` (gốc, script `doc-test`);
  - `.gitignore` (`.doc-test/`);
  - `.github/workflows/ci.yml` (job `packages`: hai bước cuối);
  - `apps/docs/src/content/docs/developers/quickstart.md`, `apps/docs/src/content/docs/developers/keeper.md`, `apps/docs/src/content/docs/concepts/policy-circuit.md` (chỉ dòng mở fence);
  - `CONTRIBUTING.md` (một câu).
- Test: `scripts/test/doc-test.test.ts`; sửa `scripts/test/workflows.test.ts`

**Interfaces:**
- Consumes:
  - Plan 3: `startDevnetEnv(o?: { port?: number }): Promise<DevnetEnv>` (`scripts/lib/devnet-env.ts`), với `deployment` (JSON), `vaults.simple|guarded|grace`, `accounts` (chỉ số 1 là owner, 2 là heir), `stop()`.
  - Plan 2: `@atropyle/sdk` có `createAtropyle`, `getDeployment`, `parseDeployment` ở entry `packages/sdk/dist/index.js`; `@atropyle/circuits` ở `circuits/dist/index.js`. Hai file này có sau `npm run build`.
  - Task 6: ba trang có ví dụ chạy được (`developers/quickstart.md`, `developers/keeper.md`, `concepts/policy-circuit.md` của Task 4).
  - Task 7: `readWorkflows`, biến `ci` trong `describe('the repository workflows', …)`.
  - Task 13: job `packages` của `ci.yml`.
- Produces (`scripts/ops/doc-blocks.ts`):
  - `RUNNABLE_LANGS = { js: 'mjs', mjs: 'mjs', ts: 'mts' }`, `type RunnableLang`;
  - `ARG_NAMES = ['simple', 'guarded', 'grace', 'owner', 'heir']`, `type ArgName`;
  - `interface BlockMeta { test: boolean; args: string[] }`, `parseMeta(meta: string): BlockMeta`;
  - `interface DocBlock { file: string; line: number; lang: RunnableLang; args: ArgName[]; code: string }`, `findTestBlocks(file: string, markdown: string): DocBlock[]`;
  - `interface DocTestEnv { deployment: Record<string, unknown>; vaults: Record<'simple' | 'guarded' | 'grace', string>; accounts: readonly string[] }`, `resolveArgs(names: readonly ArgName[], env: DocTestEnv): string[]`;
  - `interface SandboxPackages { sdk: string; circuits: string }`, `WEB_URL_FALLBACK`, `sdkShim(sdkEntry, deployment): string`, `writeSandbox(dir, packages, deployment): void`;
  - `interface BlockRun { code: number; stdout: string; stderr: string; timedOut: boolean }`, `runBlock(dir, block, index, args, timeoutMs?): Promise<BlockRun>`;
  - `runDocTests(o): Promise<{ ran: number; failures: string[] }>`.

Cách đánh dấu một ví dụ chạy được, ngay trên dòng mở fence:
- Chữ `test` là nhãn để chạy. Expressive Code của Starlight bỏ qua từ nó không biết, nên trang hiển thị không đổi.
- `args=` là danh sách tên cách nhau bằng dấu phẩy. Mỗi tên thành một tham số dòng lệnh: `simple`, `guarded`, `grace` là vault seed của devnet, `owner` và `heir` là tài khoản 1 và 2.

Ví dụ trong docs viết cho mainnet (`createAtropyle({ chain: 'xlayer' })`), nên doc-test không sửa mã của ví dụ:
- Ví dụ chạy trong thư mục `.doc-test/` ở gốc repo.
- Ở đó, `node_modules/@atropyle/sdk` là một shim: re-export SDK thật, chỉ đổi `'xlayer'` thành deployment của devnet trong `createAtropyle` và `getDeployment`.
- Các gói khác (viem…) vẫn resolve lên `node_modules` gốc.
- Ví dụ không bao giờ thấy `KEEPER_KEY`.

- [ ] **Step 1: Viết test thất bại**

`scripts/test/doc-test.test.ts`:

```ts
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  type DocBlock,
  findTestBlocks,
  parseMeta,
  resolveArgs,
  runBlock,
  type SandboxPackages,
  WEB_URL_FALLBACK,
  writeSandbox,
} from '../ops/doc-blocks';

const ROOT = join(import.meta.dirname, '..', '..');
const CONTENT = join(ROOT, 'apps', 'docs', 'src', 'content', 'docs');
const temp = mkdtempSync(join(tmpdir(), 'atropyle-doc-test-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

const block = (code: string, lang: DocBlock['lang'] = 'js'): DocBlock => ({ file: 'x.md', line: 1, lang, args: [], code });

/** Stand-ins for the built packages: enough to see what the shim forwards and what it changes. */
function fakePackages(): SandboxPackages {
  const fake = join(temp, 'fake');
  mkdirSync(fake, { recursive: true });
  writeFileSync(
    join(fake, 'sdk.mjs'),
    [
      'export const createAtropyle = (o) => ({ chain: o.chain });',
      'export const getDeployment = (c) => c;',
      'export const parseDeployment = (j) => ({ ...j, parsed: true });',
      "export const version = 'fake';",
    ].join('\n'),
  );
  writeFileSync(join(fake, 'circuits.mjs'), 'export const answer = 42;\n');
  return { sdk: join(fake, 'sdk.mjs'), circuits: join(fake, 'circuits.mjs') };
}

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? markdownFiles(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : [],
  );
}

describe('doc-test blocks', () => {
  it('reads the test tag and the arguments, ignoring quoted titles', () => {
    expect(parseMeta(' test args=simple,owner')).toEqual({ test: true, args: ['simple', 'owner'] });
    expect(parseMeta(' title="a test file"')).toEqual({ test: false, args: [] });
    expect(parseMeta(' testing')).toEqual({ test: false, args: [] });
    expect(parseMeta('')).toEqual({ test: false, args: [] });
  });

  it('finds only the tagged js and ts blocks, with their line', () => {
    const md = [
      '# Page', // 1
      '', // 2
      '```js test args=simple', // 3
      "console.log('a');", // 4
      '```', // 5
      '```bash', // 6
      'echo b', // 7
      '```', // 8
      '```ts', // 9
      'const c = 1;', // 10
      '```', // 11
      '```ts test', // 12
      "console.log('d');", // 13
      '```', // 14
    ].join('\n');
    expect(findTestBlocks('p.md', md)).toEqual([
      { file: 'p.md', line: 3, lang: 'js', args: ['simple'], code: "console.log('a');\n" },
      { file: 'p.md', line: 12, lang: 'ts', args: [], code: "console.log('d');\n" },
    ]);
    expect(() => findTestBlocks('p.md', '```bash test\necho x\n```\n')).toThrow('p.md:1: only js and ts examples can run, not "bash"');
    expect(() => findTestBlocks('p.md', '```js test args=nobody\nx\n```\n')).toThrow('p.md:1: unknown example argument "nobody"');
  });

  it('maps argument names to devnet vaults and accounts', () => {
    const env = { deployment: {}, vaults: { simple: '0x5', guarded: '0x6', grace: '0x7' }, accounts: ['0x0', '0x1', '0x2'] };
    expect(resolveArgs(['simple', 'grace', 'owner', 'heir'], env)).toEqual(['0x5', '0x7', '0x1', '0x2']);
  });

  it('runs a block against the shim: mainnet becomes the devnet, nothing else changes, no key leaks', async () => {
    const sandbox = join(temp, 'sandbox');
    writeSandbox(sandbox, fakePackages(), { name: 'devnet', webUrl: null });
    const code = [
      "import { createAtropyle, getDeployment, version } from '@atropyle/sdk';",
      "import { answer } from '@atropyle/circuits';",
      "const chain = createAtropyle({ chain: 'xlayer' }).chain;",
      "const local = getDeployment('local');",
      'const key = process.env.KEEPER_KEY ?? null;',
      'console.log(JSON.stringify({ chain, local, version, answer, arg: process.argv[2], key }));',
    ].join('\n');
    process.env.KEEPER_KEY = 'must-not-leak';
    try {
      const r = await runBlock(sandbox, block(code), 0, ['0xabc']);
      expect(r.stderr).toBe('');
      expect(r.code).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({
        chain: { name: 'devnet', webUrl: WEB_URL_FALLBACK, parsed: true },
        local: 'local',
        version: 'fake',
        answer: 42,
        arg: '0xabc',
        key: null,
      });
    } finally {
      delete process.env.KEEPER_KEY;
    }
  });

  it('reports the exit code of a failing block and stops a block that hangs', async () => {
    const sandbox = join(temp, 'sandbox-fail');
    writeSandbox(sandbox, fakePackages(), {});
    expect((await runBlock(sandbox, block('process.exit(3);'), 0, [])).code).toBe(3);
    const hung = await runBlock(sandbox, block('setInterval(() => {}, 1000);'), 1, [], 500);
    expect(hung.timedOut).toBe(true);
    expect(hung.code).not.toBe(0);
  });

  it('the docs mark the three runnable examples, and they import only what the sandbox provides', () => {
    const blocks = markdownFiles(CONTENT).flatMap((f) =>
      findTestBlocks(relative(CONTENT, f).split(sep).join('/'), readFileSync(f, 'utf8')),
    );
    expect(blocks.map((b) => b.file).sort()).toEqual(['concepts/policy-circuit.md', 'developers/keeper.md', 'developers/quickstart.md']);
    for (const b of blocks) {
      for (const m of b.code.matchAll(/from '([^']+)'/g)) {
        expect(['@atropyle/sdk', '@atropyle/circuits'].includes(m[1]) || m[1].startsWith('node:'), `${b.file}: ${m[1]}`).toBe(true);
      }
    }
  });
});
```

Thêm vào cuối khối `describe('the repository workflows', …)` của `scripts/test/workflows.test.ts` (dùng lại biến `ci` đã có):

```ts
  it('run the docs examples on a devnet after building the packages', () => {
    const steps = ci?.doc.jobs?.packages?.steps ?? [];
    const build = steps.findIndex((s) => s.run === 'npm run build');
    const docTest = steps.findIndex((s) => s.run === 'npm run doc-test');
    expect(build).toBeGreaterThan(-1);
    expect(build).toBeLessThan(docTest);
  });
```

- [ ] **Step 2: Chạy test để thấy thất bại**

Run: `npm run test:scripts -- doc-test workflows`
Expected: FAIL. `doc-test` không tìm thấy `../ops/doc-blocks`; `workflows` báo test `run the docs examples on a devnet after building the packages` hỏng (`expected -1 to be greater than -1`), 9 test còn lại vẫn PASS.

- [ ] **Step 3: Viết `scripts/ops/doc-blocks.ts`**

```ts
// Finds the docs examples marked to run (a fence such as ```js test args=simple) and runs each one in a sandbox
// where `@atropyle/sdk` is the real SDK with X Layer mainnet swapped for a devnet. The examples stay unchanged.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RUNNABLE_LANGS = { js: 'mjs', mjs: 'mjs', ts: 'mts' } as const;
export type RunnableLang = keyof typeof RUNNABLE_LANGS;

/** Names an example may take as arguments: the seeded devnet vaults, and anvil accounts 1 (owner) and 2 (heir). */
export const ARG_NAMES = ['simple', 'guarded', 'grace', 'owner', 'heir'] as const;
export type ArgName = (typeof ARG_NAMES)[number];

export interface BlockMeta {
  test: boolean;
  args: string[];
}

export interface DocBlock {
  /** Page, relative to the docs content directory. */
  file: string;
  /** Line of the opening fence, from 1. */
  line: number;
  lang: RunnableLang;
  args: ArgName[];
  code: string;
}

export interface DocTestEnv {
  deployment: Record<string, unknown>;
  vaults: Record<'simple' | 'guarded' | 'grace', string>;
  accounts: readonly string[];
}

/** Absolute paths of the built ESM entry of each package. */
export interface SandboxPackages {
  sdk: string;
  circuits: string;
}

export interface BlockRun {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** The devnet deployment has no web app; handoff.link() needs one. */
export const WEB_URL_FALLBACK = 'http://localhost:5173/';

const FENCE = /^(`{3,}|~{3,})[ \t]*([\w-]*)([^\n]*)\n([\s\S]*?)^\1[ \t]*$/gm;

const isRunnable = (lang: string): lang is RunnableLang => Object.hasOwn(RUNNABLE_LANGS, lang);
const isArgName = (name: string): name is ArgName => (ARG_NAMES as readonly string[]).includes(name);

export function parseMeta(meta: string): BlockMeta {
  const words = meta
    .replace(/"[^"]*"|'[^']*'/g, '')
    .split(/\s+/)
    .filter((w) => w !== '');
  const args = words.find((w) => w.startsWith('args='));
  return { test: words.includes('test'), args: args ? args.slice('args='.length).split(',').filter((a) => a !== '') : [] };
}

export function findTestBlocks(file: string, markdown: string): DocBlock[] {
  const out: DocBlock[] = [];
  for (const m of markdown.matchAll(FENCE)) {
    const meta = parseMeta(m[3]);
    if (!meta.test) continue;
    const line = markdown.slice(0, m.index).split('\n').length;
    const lang = m[2];
    if (!isRunnable(lang)) throw new Error(`${file}:${line}: only js and ts examples can run, not "${lang}"`);
    const args: ArgName[] = [];
    for (const a of meta.args) {
      if (!isArgName(a)) throw new Error(`${file}:${line}: unknown example argument "${a}"; use ${ARG_NAMES.join(', ')}`);
      args.push(a);
    }
    out.push({ file, line, lang, args, code: m[4] });
  }
  return out;
}

export function resolveArgs(names: readonly ArgName[], env: DocTestEnv): string[] {
  return names.map((n) => {
    if (n === 'owner') return env.accounts[1];
    if (n === 'heir') return env.accounts[2];
    return env.vaults[n];
  });
}

export function sdkShim(sdkEntry: string, deployment: Record<string, unknown>): string {
  const url = JSON.stringify(pathToFileURL(sdkEntry).href);
  return [
    '// Generated by scripts/ops/doc-blocks.ts: the real SDK, with X Layer mainnet swapped for the devnet.',
    `import * as real from ${url};`,
    `export * from ${url};`,
    `const parsed = real.parseDeployment(${JSON.stringify(deployment)});`,
    `const devnet = { ...parsed, webUrl: parsed.webUrl ?? ${JSON.stringify(WEB_URL_FALLBACK)} };`,
    "const swap = (chain) => (chain === 'xlayer' ? devnet : chain);",
    'export function createAtropyle(options) {',
    '  return real.createAtropyle({ ...options, chain: swap(options.chain) });',
    '}',
    'export function getDeployment(chain) {',
    '  return real.getDeployment(swap(chain));',
    '}',
    '',
  ].join('\n');
}

function writePackage(dir: string, name: string, source: string): void {
  const pkg = join(dir, 'node_modules', ...name.split('/'));
  mkdirSync(pkg, { recursive: true });
  writeFileSync(join(pkg, 'package.json'), `${JSON.stringify({ name, type: 'module', exports: './index.js' })}\n`);
  writeFileSync(join(pkg, 'index.js'), source);
}

/** Recreates `dir`: a module package whose node_modules holds the two shims. Other imports resolve upwards. */
export function writeSandbox(dir: string, packages: SandboxPackages, deployment: Record<string, unknown>): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ private: true, type: 'module' })}\n`);
  writePackage(dir, '@atropyle/sdk', sdkShim(packages.sdk, deployment));
  writePackage(dir, '@atropyle/circuits', `export * from ${JSON.stringify(pathToFileURL(packages.circuits).href)};\n`);
}

export function runBlock(dir: string, block: DocBlock, index: number, args: readonly string[], timeoutMs = 60_000): Promise<BlockRun> {
  const file = `example-${index}.${RUNNABLE_LANGS[block.lang]}`;
  writeFileSync(join(dir, file), block.code);
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' };
  delete env.KEEPER_KEY;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file, ...args], { cwd: dir, env });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: `${stderr}${e.message}`, timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });
  });
}

function markdownFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((e) => (e.isDirectory() ? markdownFiles(join(dir, e.name)) : e.name.endsWith('.md') ? [join(dir, e.name)] : []));
}

export async function runDocTests(o: {
  contentDir: string;
  sandboxDir: string;
  packages: SandboxPackages;
  env: DocTestEnv;
  log: (line: string) => void;
}): Promise<{ ran: number; failures: string[] }> {
  const blocks = markdownFiles(o.contentDir).flatMap((f) =>
    findTestBlocks(relative(o.contentDir, f).split(sep).join('/'), readFileSync(f, 'utf8')),
  );
  if (blocks.length === 0) return { ran: 0, failures: ['no docs example is marked `test`'] };
  writeSandbox(o.sandboxDir, o.packages, o.env.deployment);
  const failures: string[] = [];
  for (const [i, b] of blocks.entries()) {
    const r = await runBlock(o.sandboxDir, b, i, resolveArgs(b.args, o.env));
    const where = `${b.file}:${b.line}`;
    const why = r.timedOut ? 'timed out' : r.code !== 0 ? `exit code ${r.code}` : null;
    o.log(`${why === null ? 'ok  ' : 'FAIL'} ${where}`);
    if (why !== null) failures.push(`${where}: ${why}\n${r.stdout}${r.stderr}`);
  }
  return { ran: blocks.length, failures };
}
```

- [ ] **Step 4: Chạy test để thấy qua phần thư viện**

Run: `npm run test:scripts -- doc-test -t "reads the test tag|finds only|maps argument|runs a block|reports the exit code"`
Expected: PASS 5 test; test `the docs mark the three runnable examples` bị `-t` bỏ qua. Nó chỉ qua sau Step 5.

- [ ] **Step 5: Đánh dấu ba ví dụ trong docs**

Chỉ sửa dòng mở fence; mã của ví dụ giữ nguyên.

1. `apps/docs/src/content/docs/developers/quickstart.md`: dòng mở fence ngay trên dòng `import { createAtropyle, formatDuration } from '@atropyle/sdk';`. Đổi `` ```js `` thành `` ```js test args=simple ``.

2. `apps/docs/src/content/docs/developers/keeper.md`: dòng mở fence ngay trên dòng `import { createAtropyle, planKeeperActions } from '@atropyle/sdk';` (mục `## Decide for yourself`). Đổi `` ```js `` thành `` ```js test args=simple ``.

3. `apps/docs/src/content/docs/concepts/policy-circuit.md`: dòng mở fence ngay trên dòng `import { buildKofN5, compile, Netlist, stepBytes } from '@atropyle/circuits';`. Đổi `` ```ts `` thành `` ```ts test ``. Node 24 tự bỏ kiểu khi chạy file `.mts`; ví dụ này không có cú pháp TypeScript nào cần biên dịch.

Không đánh dấu ba loại ví dụ sau:
- `keeper.js` và ví dụ `atro.scan`: chúng chạy vòng lặp vô hạn.
- Ví dụ `AtropyleError` của Quickstart: nó dùng biến `atro` của ví dụ trước.
- Ví dụ `createMcpHandler`: nó cần `@modelcontextprotocol/server`.

Run: `npm run test:scripts -- doc-test`
Expected: PASS 6 test.

Run: `npm test -w apps/docs -- pages`
Expected: PASS, không đổi so với trước; test `every atropyle command in the docs exists in the CLI snapshots` không đọc block `js`/`ts`.

- [ ] **Step 6: Viết `scripts/ops/doc-test.ts`, script gốc, `.gitignore`, CI và CONTRIBUTING**

`scripts/ops/doc-test.ts`:

```ts
// npm run doc-test: runs every docs example marked `test` against a fresh devnet. Run `npm run build` first.
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startDevnetEnv } from '../lib/devnet-env';
import { runDocTests, type SandboxPackages } from './doc-blocks';

const ROOT = join(import.meta.dirname, '..', '..');

async function main(): Promise<number> {
  const packages: SandboxPackages = {
    sdk: join(ROOT, 'packages', 'sdk', 'dist', 'index.js'),
    circuits: join(ROOT, 'circuits', 'dist', 'index.js'),
  };
  for (const entry of Object.values(packages)) {
    if (!existsSync(entry)) {
      console.error(`doc-test: ${entry} is missing. Run npm run build first.`);
      return 1;
    }
  }
  const sandboxDir = join(ROOT, '.doc-test');
  const devnet = await startDevnetEnv({ port: 8661 });
  try {
    const result = await runDocTests({
      contentDir: join(ROOT, 'apps', 'docs', 'src', 'content', 'docs'),
      sandboxDir,
      packages,
      env: { deployment: devnet.deployment, vaults: devnet.vaults, accounts: devnet.accounts },
      log: (line) => console.error(line),
    });
    for (const f of result.failures) console.error(f);
    if (result.failures.length > 0) return 1;
    console.log(`doc-test: ${result.ran} docs examples ran on the devnet`);
    return 0;
  } finally {
    await devnet.stop();
    rmSync(sandboxDir, { recursive: true, force: true });
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  },
);
```

Thêm vào `scripts` của `package.json` gốc:

```json
"doc-test": "tsx scripts/ops/doc-test.ts"
```

Thêm vào cuối `.gitignore`:

```text
.doc-test/
```

Trong job `packages` của `.github/workflows/ci.yml`, thêm ngay sau dòng `      - run: npm run release:check`:

```yaml
      - run: npm run build
      - run: npm run doc-test
```

Trong `CONTRIBUTING.md`, thay đúng dòng:

```md
`docs:gen` rewrites the reference pages from the code; CI fails when they are out of date. The Contracts page reads the Foundry artifacts, so run `cd contracts && forge build` first.
```

bằng:

```md
`docs:gen` rewrites the reference pages from the code; CI fails when they are out of date. The Contracts page reads the Foundry artifacts, so run `cd contracts && forge build` first. Examples marked `test` in the docs run on a devnet with `npm run build && npm run doc-test`.
```

- [ ] **Step 7: Chạy test, rồi chạy lệnh thật**

Run: `npm run test:scripts -- doc-test workflows`
Expected: PASS 6 test của `doc-test`, 10 test của `workflows`.

Run: `npm run build && npm run doc-test`
Expected:
- stderr có ba dòng `ok   concepts/policy-circuit.md:<dòng>`, `ok   developers/keeper.md:<dòng>`, `ok   developers/quickstart.md:<dòng>`;
- stdout dòng cuối `doc-test: 3 docs examples ran on the devnet`;
- thoát 0;
- thư mục `.doc-test/` không còn.

Lệnh cần `anvil` trên `PATH` và artifact của `forge build`, như `release:check`.

Nếu một dòng `FAIL`, chạy lại đúng ví dụ đó trong `.doc-test/` để xem lỗi. Trước đó, bỏ dòng `rmSync` trong `finally` ở máy mình, và không commit thay đổi này. Rồi sửa theo nguyên nhân:
- Ví dụ sai so với SDK (đổi tên hàm, đổi kiểu trả về): sửa ví dụ trong docs, rồi chạy lại cả `npm test -w apps/docs`.
- SDK sai so với docs: báo ở Plan 2; không sửa shim để che lỗi.

Run: `npm run typecheck:scripts && npx biome check --write scripts/ops/doc-blocks.ts scripts/ops/doc-test.ts scripts/test/doc-test.test.ts && npx biome ci . && npx knip`
Expected: thoát 0.

- [ ] **Step 8: Commit**

```bash
git add scripts/ops/doc-blocks.ts scripts/ops/doc-test.ts scripts/test/doc-test.test.ts scripts/test/workflows.test.ts package.json .gitignore .github/workflows/ci.yml apps/docs/src/content/docs/developers/quickstart.md apps/docs/src/content/docs/developers/keeper.md apps/docs/src/content/docs/concepts/policy-circuit.md CONTRIBUTING.md
git commit -m "test(docs): run the docs examples marked test on a devnet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
