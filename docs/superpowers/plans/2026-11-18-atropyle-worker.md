> **Superseded** by [`2026-11-22-atropyle-backend.md`](2026-11-22-atropyle-backend.md) (Plan 8: Supabase, Resend and the keeper), per spec 2026-11-22 §14 and ruling 13. Do not execute this plan.

# Atropyle Plan 5 — Worker: bot, keeper, API và cron — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng `apps/worker`: một Cloudflare Worker duy nhất gồm bot Telegram, keeper tự `poke`/`distribute`, các route `/health` và `/v1`, cron mỗi phút và mỗi 10 phút, lưu trên D1. Worker phải test được đầy đủ khi người dùng chưa đặt bất kỳ token hay khoá nào.

**Architecture:**
- Lõi cron là hàm thuần nhận dependency: `runMinute(deps)` và `runIntegrity(deps)`, với `deps = { store, chain, notifier, clock, log, budget, config }`.
  - `store` là lớp SQL trên một giao diện D1 tối thiểu (`D1Like`). D1 thật, D1 trong miniflare và adapter `node:sqlite` đều khớp giao diện này.
  - `chain` là `ChainPort`. Bản thật bọc SDK của Plan 2 (`scan`, `stats`, `snapshot` + `timelineOf` + `planKeeperActions`, `keeperTick`, `integrity`). Bản giả dùng cho test.
  - `notifier` gửi tin Telegram.
  - Handler `scheduled` và `fetch` chỉ nối các phần lại với nhau.
- Cron idempotent: claim event trong bảng `seen` (cùng batch với cập nhật vault) **trước** khi gửi tin, và ghi cursor **sau cùng**, chỉ khi mọi vault trong khoảng block đã xử lý xong. Một lease trong D1 ngăn hai lần chạy chồng nhau.
- Mỗi lần chạy đếm subrequest và truy vấn D1 (`Budget`), và dừng giữa chừng một cách an toàn khi sắp chạm giới hạn của gói free (50 subrequest, 50 truy vấn D1 mỗi invocation).
- Test chạy ở hai môi trường: workerd qua `@cloudflare/vitest-plugin` (route, D1, cron với chain giả), và Node với anvil (adapter SDK thật, E2E keeper trên devnet).

**Tech Stack:** Cloudflare Workers, Hono 4.13.19, D1, wrangler 4.164.0, `@cloudflare/vitest-plugin` 1.8.4 với vitest 4.1.12 (chỉ trong `apps/worker`), `@cloudflare/workers-types` 5.20261118.1, viem 2.58.0, `@atropyle/sdk` (Plan 2). P1 thêm zod 4.6.7 (Task 16), `@atropyle/mcp` (Plan 3), `@modelcontextprotocol/server` và `@modelcontextprotocol/client` 2.4.0 (Task 17).

**Spec:**
- `docs/superpowers/specs/2026-11-18-atropyle-ecosystem-design.md`: §9 (toàn bộ), §12.1 dòng `worker`, §12.2 (keeper trên devnet), §14 phần Worker, §16.4, §18 (thứ tự cắt), §19 (việc 4, 5, 6, 11), §21 (điểm 1 và 3).
- `docs/superpowers/specs/2026-11-18-atropyle-design.md`: §7 (bot).
- Plan 2 (`docs/superpowers/plans/2026-11-18-atropyle-sdk.md`): Task 9, 12, 13 là nguồn API.

## Global Constraints

Mọi task đều phải tuân theo các ràng buộc sau.

**Ràng buộc cứng (nguyên văn từ brief):**
- **Không khoá, không mainnet:** người dùng tự ký mọi giao dịch mainnet. Claude/agent không bao giờ cầm private key, không `cast send` hay broadcast lên mainnet, không đặt secret. Trên anvil (chain 31337) chỉ gửi giao dịch qua tài khoản unlocked (`eth_sendTransaction`, `--unlocked`). Repo không có biến `PRIVATE_KEY`.
- Token npm, Cloudflare, Telegram, `KEEPER_KEY`, khoá operator DeWEB do **người dùng** đặt. Bước nào cần chúng thì đánh dấu `[USER]`, ghi đúng lệnh người dùng phải chạy, và để plan vẫn test được khi chưa có chúng.
- Không workflow CI nào ký giao dịch on-chain.
- Không có telemetry, không tracker, không tải gì từ CDN ở web/docs.
- `prompts/`, `reports/`, `research_notes/`, `external_research/` luôn untracked; không đụng tới.
- Ví keeper: `KEEPER_KEY` là secret người dùng tự đặt bằng `wrangler secret put` (§19 việc 6). Worker tạo `WalletClient` từ secret đó lúc chạy; không có khoá thì dry-run. Claude không bao giờ thấy, tạo hay đặt khoá; mọi bước deploy, đặt secret, `setWebhook` là `[USER]`, ghi đúng lệnh.
- Không ghi private key vào bất kỳ file nào, kể cả file test (Plan 2). Test của khoá keeper chỉ dùng chuỗi sai dạng (`not-a-key`, `0x1234`) và một hàm `toAccount` giả.

**Ràng buộc của plan này:**
- Mọi giao dịch trong test đi qua tài khoản unlocked của anvil: `createWalletClient({ account: <địa chỉ anvil>, transport: http(rpcUrl) })`, tức JSON-RPC account và `eth_sendTransaction`.
- Mọi bigint trong JSON trả ra là chuỗi thập phân, qua `toJson` của SDK.
- Lỗi HTTP luôn là `application/problem+json` (RFC 9457) với `type = errorDocsUrl(code)`, `title`, `status`, `code`, `detail`.
- Chuỗi gửi cho người dùng (tin Telegram, `detail` của lỗi, README) bằng tiếng Anh, không có chuỗi untrusted nào lấy từ chain (không có tên hay ký hiệu token). Tin Telegram là văn bản thuần, không `parse_mode`.
- Log là JSON một dòng qua `createLogger`. Không bao giờ log token Telegram, secret webhook, `KEEPER_KEY` hay URL chứa token.
- Địa chỉ lưu trong D1 ở dạng chữ thường. Địa chỉ hiện cho người dùng ở dạng checksum (`toAddress`).
- Thời gian trong D1: cột chain (`next_check_at`, `last_alive`, `late_at`, `window_ends_at`, `expires_at`, `keeper_log.at`) tính bằng giây theo giờ chain; cột `created_at`, `updated_at` tính bằng mili giây theo giờ hệ thống.
- Mã trong `src/cron`, `src/store`, `src/chain`, `src/telegram`, `src/bot` không dùng global riêng của Workers, để chạy được cả trên Node (devnet, script đo CPU).
- Phiên bản ghim chính xác (không `^`, không `~`). Biome ở gốc (`npx biome check apps/worker`) phải sạch.
- Không sửa Plan 2 hay mã của `packages/sdk`. API còn thiếu ghi ở mục "Plan 2 gaps" của báo cáo; plan dùng đúng chữ ký đề xuất, và viết mã sao cho vẫn biên dịch được khi gap chưa được vá (Quyết định 10).
- Job CI `worker` chỉ được thêm vào cuối `jobs:` của `.github/workflows/ci.yml`, dùng tag action như các job hiện có, không sửa job khác.

## Quyết định

Các mục "đã xác minh" được kiểm ngày 18/11/2026, chỉ đọc.

1. **Phiên bản (đã xác minh bằng `npm view <pkg> version`):** hono 4.13.19; wrangler 4.164.0 (engines node ≥ 22.12, peer `@cloudflare/workers-types` ^5.20261117.1); `@cloudflare/workers-types` 5.20261118.1; `@cloudflare/vitest-plugin` 1.8.4 (phụ thuộc wrangler 4.164.0 và miniflare 5.20261117.0-beta, peer vitest `^4.1.0 || ^5.0.0`); vitest 4.1.12 (tag `v4`; `latest` là 5.1.1); viem 2.58.0; agents 0.33.0 (đã kiểm, nhưng không dùng; xem Quyết định 23); zod 4.6.7; `@modelcontextprotocol/server` 2.4.0; `@modelcontextprotocol/client` 2.4.0; `@hono/zod-openapi` 1.6.3 (đã kiểm, nhưng không dùng; xem Quyết định 22).
2. **`@cloudflare/vitest-pool-workers` đã bị deprecate** (bản cuối 0.23.0). Gói được đổi tên thành `@cloudflare/vitest-plugin`, API giữ nguyên: `cloudflareTest(...)` dùng làm plugin của Vite, `readD1Migrations` ở cùng gói, `applyD1Migrations`/`createExecutionContext`/`createScheduledController`/`waitOnExecutionContext` từ `cloudflare:test`, `env` từ `cloudflare:workers`, kiểu ở `@cloudflare/vitest-plugin/types`. Nguồn: trang npm của hai gói và fixture D1 trong repo `cloudflare/workers-sdk`. Spec §12.1 ghi tên cũ; plan dùng tên mới.
3. **vitest 4.1.12 chỉ nằm trong `apps/worker`.** Plugin đòi vitest ≥ 4.1, còn gốc repo ghim 3.2.7 (Plan 1–2). Spec §21 cho phép đổi khi pool của Workers đòi bản khác. Ta không nâng vitest ở gốc, để không đụng test của Plan 1–4: `apps/worker` khai báo `vitest` 4.1.12 làm devDependency, npm cài nó lồng trong `apps/worker/node_modules`. Task 1 kiểm điều này bằng `npm ls` và `vitest --version`. Nếu `npm install` báo `ERESOLVE`, **dừng lại**, không dùng `--force` hay `--legacy-peer-deps`, báo người điều phối.
4. **Giới hạn của Workers (đã xác minh, developers.cloudflare.com/workers/platform/limits):**
   - gói Free: 10 ms CPU cho mỗi request HTTP và mỗi lần cron; **50 subrequest mỗi invocation**; 5 cron trigger mỗi tài khoản; 100.000 request mỗi ngày;
   - gói Paid: 30 s CPU cho cron chạy dày hơn mỗi giờ, chỉnh được bằng `limits.cpu_ms` (tới 300.000); 10.000 subrequest, chỉnh được bằng `limits.subrequests`;
   - wall time của cron là 15 phút ở cả hai gói. Trang ghi "built-in flexibility for occasional overruns", tức thỉnh thoảng vượt một chút thì vẫn được chấp nhận.
5. **D1 (đã xác minh, developers.cloudflare.com/d1/platform/limits):**
   - gói Free: 5 triệu dòng đọc mỗi ngày, 100.000 dòng ghi mỗi ngày, 500 MB mỗi database;
   - **50 truy vấn mỗi invocation ở gói Free, 1.000 ở gói Paid; một `batch()` tính là một truy vấn.** `batch()` chạy trong một transaction;
   - migration: `wrangler d1 migrations apply <db> --local|--remote`, ghi vào bảng `d1_migrations`.

   Vì vậy store gom mọi lần ghi của một vault vào một `batch`, và cron có ngân sách truy vấn riêng (Quyết định 12).
6. **Rate Limiting binding (đã xác minh, developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit):**
   - cấu hình `"ratelimits": [{ "name", "namespace_id": "<số nguyên dạng chuỗi>", "simple": { "limit", "period": 10 | 60 } }]`; API `env.X.limit({ key })` trả `{ success }`;
   - cần wrangler ≥ 4.36.0; bộ đếm tính theo từng location của Cloudflare;
   - docs khuyên không dùng IP làm khoá; spec chọn IP vì API không có auth;
   - trang này **không nói** binding có ở gói Free hay không, đây là điểm 3 của §21. Docs có câu về `delta` khi chạy local, nên miniflare có giả lập binding.

   Quyết định: dùng binding khi `env.RATE_LIMITER` tồn tại, nếu không thì dùng bộ đếm trong bộ nhớ của isolate (best effort, cửa sổ cố định 60 s). Binding ném lỗi thì cho request đi qua (fail open) và ghi log. Task 12 có bước `[USER]` xác nhận lúc deploy; nếu gói Free từ chối `ratelimits`, bỏ khối đó khỏi `wrangler.jsonc` và Worker tự rơi về bộ đếm theo isolate.
7. **Cron:** `"triggers": { "crons": ["* * * * *", "*/10 * * * *"] }`. Handler phân biệt hai lịch bằng `controller.cron` (ví dụ "Multiple Cron Triggers" trong docs). Phút chia hết cho 10 có hai invocation riêng, mỗi cái có ngân sách riêng. Thử local: `curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=*+*+*+*+*"` (developers.cloudflare.com/workers/configuration/cron-triggers). Đổi trigger mất tối đa 15 phút để có hiệu lực.
8. **Workers Logs (đã xác minh):** `"observability": { "enabled": true }`. Gói Free có 200.000 log event mỗi ngày, lưu 3 ngày. Trường `$workers.cpuTimeMs` có trong query builder. Event của `wrangler tail --format json` có `cpuTime`, `wallTime`, `outcome` (`exceededCpu` khi vượt CPU) và `event.cron` với lần chạy cron. Giá Observability đổi từ 1/12/2026; ta chỉ dùng phần miễn phí. `send_metrics: false` trong `wrangler.jsonc`, và CI đặt `WRANGLER_SEND_METRICS=false`: wrangler không gửi số liệu sử dụng (ràng buộc không telemetry).
9. **Telegram Bot API (đã xác minh, core.telegram.org/bots/api):**
   - `setWebhook` nhận `secret_token` dài 1–256 ký tự trong `A-Za-z0-9_-`; Telegram gửi lại nó ở header `X-Telegram-Bot-Api-Secret-Token` với mọi request;
   - webhook trả mã khác 2xx thì Telegram gửi lại update;
   - webhook được trả lời bằng chính body của response (`{ "method": "sendMessage", ... }`).

   Quyết định:
   - Bot trả lời lệnh bằng body của response webhook (không tốn subrequest).
   - Lỗi xử lý vẫn trả 200 `{}` và ghi log, để Telegram không gửi lại mãi.
   - Sai secret, hoặc Worker chưa có secret, thì trả 401.
   - Tin chủ động (thông báo từ cron) gọi `sendMessage` với `link_preview_options.is_disabled = true`. Gặp 429 thì chờ `retry_after` (tối đa 3 s) rồi thử lại một lần; gặp 403 (người dùng chặn bot) thì xoá mọi `watch` của chat đó.
10. **Gap G1 của Plan 2 (đã vá trong Plan 2):**
    - Kiểu của `AtropyleClient.stats(o?)` không có `toBlock`, nhưng client chuyển `o` thẳng vào `readStats(ctx, o)`, và `readStats` có xử lý `toBlock` (Plan 2, dòng 5000–5002 và 5182).
    - Cron cần `toBlock = scan.toBlock`, để stats không đọc vượt khoảng `maxBlocks` mà scan vừa đọc.
    - Chữ ký đề xuất: `stats(o?: { fromBlock?: bigint; toBlock?: bigint; resume?: StatsCursor; onProgress?: (done: number, total: number) => void }): Promise<Stats>`.
    - Người điều phối đã thêm `toBlock` vào kiểu `AtropyleClient.stats(o?)` của Plan 2 theo đúng chữ ký trên, nên `src/chain/sdk.ts` gọi thẳng `atro.stats({ resume, toBlock })`, không cần ép kiểu.
11. **Gap G2 (đã vá trong Plan 2):** năm mã lỗi riêng của API là `NOT_FOUND`, `RATE_LIMITED`, `UNAUTHORIZED`, `NOT_READY` và `FORBIDDEN` (403, của Task 17). Người điều phối đã thêm cả năm vào `ERROR_INFO`/`ERROR_CODES` của SDK (Plan 2, Quyết định 8; tổng 38 mã, gồm `INSUFFICIENT_GAS` của contract), nên trang Errors của Plan 6 tự sinh anchor cho chúng. Worker vẫn giữ bảng `API_ERRORS` để biết HTTP status và `title` của từng mã. `ProblemCode = ErrorCode | ApiCode` vẫn đúng, vì `ApiCode` giờ là tập con của `ErrorCode`. `type` là `errorDocsUrl(code)`.
12. **Ngân sách mỗi invocation (`Budget`):**
    - Đếm fetch thật qua `onFetchRequest` của transport `http` của viem, cộng với mỗi lần gọi Telegram và mỗi lần dò RPC.
    - Đếm truy vấn D1 bằng wrapper `metered()`; `batch` tính là một truy vấn.
    - Mặc định 45/45 (biến `SUBREQUEST_BUDGET`, `D1_QUERY_BUDGET`), chừa 5 cho sai số dưới trần 50 của gói Free. Gói Paid đặt 900/900.
    - Chi phí ước lượng (`COST`): đọc một vault 4 fetch; một tin 1 fetch; keeper cố định 2 fetch (`getBlock`, `getBalance`); mỗi vault keeper đọc 4 fetch; mỗi giao dịch keeper 12 fetch (mô phỏng, nonce, phí, gửi, chờ receipt). Task 12 đo lại và chỉnh.
    - Cron kiểm ngân sách **trước** mỗi vault. Hết ngân sách thì dừng giữa các vault và không ghi cursor. Event đã claim sẽ không gửi lại, nên lần sau chạy tiếp từ vault kế tiếp.
13. **Giao hàng thông báo là at-most-once:** claim event trong `seen` rồi mới gửi tin. Isolate chết giữa lúc claim và lúc gửi thì tin đó mất. Ta chấp nhận điều này: bot chỉ là kênh phụ, sản phẩm không phụ thuộc vào nó (spec lõi §7), còn gửi trùng một báo động khẩn thì tệ hơn.
14. **Schema D1 lệch spec ở ba điểm** (spec §9 liệt kê sáu bảng với cột tối thiểu):
    - `vaults` có thêm `state`, `last_alive`, `late_at`, `window_ends_at`, `expires_at`, `recovery_target`, `refreshed_block`. Đây là bản cache view cho `/status` và lời nhắc, cập nhật mỗi khi có event. Cột `reminded` thêm ở migration `0002` (Task 15, mục cắt #5).
    - Bảng thứ bảy `meta(key, value, updated_at)` giữ integrity gần nhất, nhịp cron, lease, trạng thái keeper và trạng thái cảnh báo.
    - `cursor` chỉ có một dòng `name = 'events'`. Scan và stats luôn cùng tiến tới một block trong cùng một batch, nên không cần hai dòng.
15. **`next_check_at`** luôn lấy từ SDK, theo hai đường:
    - Sau mỗi event: `planKeeperActions(status, timelineOf(engine, snap, now), now, { lastDistributeAt }).nextCheckAt`. Giá trị này bằng `timeline.nextCheckAt` khi vault đang chờ, và lo luôn trường hợp đã release hay Drill đã hết hạn.
    - Sau mỗi lần keeper chạy: `KeeperOutcome.nextCheckAt`.

    Adapter đọc `vault(addr).snapshot()` một lần rồi tự dựng timeline bằng `timelineOf`, thay vì gọi `status()` rồi `timeline()` (hai lần snapshot), để tiết kiệm subrequest. Kết quả giống hệt.
16. **Client SDK tạo mới mỗi invocation**, không dùng chung giữa các request. Workers không cho dùng lại promise I/O giữa các request, và mỗi invocation cần bộ đếm ngân sách riêng.
17. **Transport:** `countedHttp(url, budget, fetchFn?)` giữ đúng tham số của `httpTransport` trong Plan 2 (batch 20, `wait: 0`, retry 3, 400 ms, timeout 20 s), và thêm `onFetchRequest` để đếm. Đọc thường dùng `fallback` qua `deployment.rpcUrls`. Kiểm chứng dùng mỗi nhóm `quorumRpcUrls` làm một fallback, truyền vào `verifyTransports`. Dò `/health` hỏi `eth_blockNumber` trên từng URL khác nhau của `rpcUrls ∪ quorumRpcUrls`, timeout 3 s.
18. **Ví keeper:**
    - `keeperWallet(key, chain, transport, toAccount = privateKeyToAccount)` trả `{ wallet, error }`. Thiếu khoá thì `{ null, null }`, tức dry-run. Khoá sai dạng thì `{ null, 'KEEPER_KEY_INVALID' }`: không crash, chạy dry-run, `/health` báo `degraded`, và gửi cảnh báo `keeper-key` tới ops.
    - Hàm không tự kiểm dạng khoá bằng regex, mà để `privateKeyToAccount` quyết.
    - Chỉ cron mới dựng ví. Request HTTP không bao giờ chạm khoá.
    - Địa chỉ và lỗi của keeper được ghi vào nhịp cron (`meta.cron`), để `/health` đọc ra.
19. **Thông báo theo vai trò người theo dõi**, không theo vai trò on-chain (spec lõi §7: "Không cần xác minh vai trò"):

    | Event | owner | guardian | heir |
    |---|---|---|---|
    | `AlarmRaised` state 1 (thừa kế) | khẩn; ghi "raised by the Atropyle keeper at …, check in before … to cancel" nếu tx hash có trong `keeper_log` với `poke` | báo | báo |
    | `AlarmRaised` state 3 (khôi phục) | khẩn | báo | — |
    | `AlarmCancelled` | chỉ khi do guardian | báo | báo |
    | `RecoveryVoted` (target 0 là rút phiếu) | báo | — | — |
    | `Attested` | báo | — | — |
    | `Released` state 5 | — | báo | báo (người nhận) |
    | `Released` state 7 | báo (ví khôi phục là của chủ) | báo | — |

    Một chat theo dõi cùng vault với nhiều vai trò chỉ nhận một tin cho mỗi event, theo thứ tự ưu tiên owner > guardian > heir. Event cũ hơn 600 block so với lúc đọc (cron đang đuổi theo) có tiền tố "Delayed notice from block N."
20. **Lease:** dòng `meta` có khoá `lease:minute`, TTL 240 s, lấy bằng một lệnh upsert có điều kiện `updated_at <= now - ttl`. Lần chạy sau thấy lease còn hạn thì trả `locked` và không làm gì, kể cả keeper. Lease được nhả trong `finally`.
21. **Cảnh báo ops** gửi tới `OPS_CHAT_ID`:
    - sáu loại: `integrity`, `integrity-error`, `cron-stalled` (nhịp `cron:ok` cũ hơn 300 s), `keeper-balance`, `keeper-send`, `keeper-key`;
    - chỉ gửi khi trạng thái đổi (bật hoặc hết), và nhắc lại sau 6 giờ nếu vẫn còn;
    - trạng thái lưu ở `meta.alert:<loại>`;
    - `OPS_CHAT_ID` rỗng thì chỉ ghi log `ops.alert`.

    `OPS_CHAT_ID` là var trong `wrangler.jsonc` theo hợp đồng giữa các plan. ID chat không phải là credential, vì muốn gửi tin vẫn cần token của bot.
22. **OpenAPI (P1, Task 16):**
    - Sinh bằng `z.toJSONSchema()` có sẵn trong zod 4, rồi ghép tay tài liệu OpenAPI 3.1 ở `GET /v1/openapi.json`.
    - Không dùng `@hono/zod-openapi`, vì nó buộc chuyển cả app sang `OpenAPIHono`, trong khi các route P0 đã có test.
    - Test parse từng response thật bằng chính schema zod, nên tài liệu và route không thể lệch nhau.
23. **MCP từ xa (P1, Task 17):**
    - Dùng `createMcpHandler(factory, options?)` của chính `@modelcontextprotocol/server` 2.4.0, như Plan 3 dùng trong test và README. Đã xác minh trong file `.d.mts` của gói: hàm trả `McpHttpHandler { fetch(request): Promise<Response>; close(); notify; bus }`; options không có route, session hay CORS; mặc định `legacy: 'stateless'` vẫn phục vụ client 2025; entry "deliberately validation-free", tức không tự kiểm `Origin`. Gói có điều kiện export `workerd`.
    - Không dùng `agents` 0.33.0, dù gói đó cũng có `createMcpHandler` (`agents/mcp/server`): bớt một dependency lớn, và server ở Worker chạy đúng đường mã mà test của Plan 3 đã kiểm.
    - Server tạo bằng `createAtropyleMcpServer({ sdk, remote: { latestIntegrity } })` của Plan 3, nên không có `atropyle_verify`; thay vào đó có `atropyle_integrity` (spec §9.2, Plan 3 Quyết định 9). Giới hạn 20 lượt/phút/IP qua `MCP_RATE_LIMITER`. Route tự kiểm `Origin` (mã `FORBIDDEN`), vì spec MCP yêu cầu điều đó.
24. **D1 tạo tường minh, không tự cấp phát:**
    - `[USER] npx wrangler d1 create atropyle` rồi dán `database_id` vào `wrangler.jsonc` (ID không phải secret).
    - Trước bước đó, file giữ ID toàn số 0, vẫn đủ cho test và `wrangler deploy --dry-run`.
    - Ta tránh tự cấp phát D1 lúc deploy, vì deploy từ CI (Plan 6) có thể tạo database mới.
25. **Nhánh dự phòng cho CPU (§21 điểm 1):**
    - Task 12 đo trên máy bằng `npm run measure:cron`, rồi `[USER]` đọc `cpuTime` thật từ `wrangler tail` trong một lần chạy có ký giao dịch.
    - Ba nhánh: (0) vừa gói Free, có thể sau khi chỉnh `KEEPER_MAX_TX`/ngân sách; (A) Workers Paid với `limits.cpu_ms`; (B) keeper chạy ngoài Worker mỗi 5 phút (Task 13, có điều kiện), Worker chỉ chia sẻ danh sách vault tới hạn.
    - Nhánh B có hai mức. **B1:** người dùng chạy `npm run keeper:run` bằng crontab trên máy hay server của mình; không workflow CI nào ký, nên không vi phạm ràng buộc cứng. **B2:** chạy cùng script đó bằng GitHub Actions, như spec §9.5 và §21 nêu.
    - **B2 xung đột với ràng buộc "Không workflow CI nào ký giao dịch on-chain".** Người điều phối **không** duyệt trước ngoại lệ này (18/11). Mặc định dừng ở B1. B2 chỉ được làm khi chính người dùng yêu cầu bằng lời trong chat, sau khi đã đo CPU ở Task 12.
    - Audit workflow của Plan 6 (`scripts/ops/workflows.ts`, Task 7) cấm `KEEPER_KEY` trong mọi workflow và chỉ cho phép bốn secret trong `ALLOWED_SECRETS`. Vì vậy B2 còn phải thêm vào audit đó một ngoại lệ có tên, chỉ cho file `.github/workflows/keeper.yml` và chỉ cho secret `KEEPER_KEY`, kèm test chứng minh mọi workflow khác vẫn bị chặn.
26. **Thứ tự cắt (spec §18):** `/v1/badge` (cắt #1) là Task 14; lời nhắc 50/80/100% (cắt #5) là Task 15. Cả hai nằm cuối phần P0 và không task P0 nào khác phụ thuộc chúng. Keeper không bao giờ cắt. P1 (Task 16–17) chỉ bắt đầu khi P0 xong, CI xanh, và chưa quá 30/11.

## Review Focus

1. **Một đợt event vượt ngân sách của một lần chạy** (gói Free chỉ có 50 subrequest và 50 truy vấn D1) → cron phải tiến dần qua nhiều lần chạy: không gửi trùng, không mất tin, và chỉ ghi cursor khi đã xử lý hết. Test: Task 5, "stops between vaults when the budget runs out…".
2. **RPC hỏng giữa chừng** (đọc được vault A, hỏng ở vault B) → cursor đứng yên; lần sau không gửi lại tin của A, và vẫn gửi tin của B. Test: Task 5, "an RPC failure on one vault keeps the cursor…".
3. **Hai lần cron chồng nhau** (lần trước còn chờ receipt quá 60 s) → lần sau không làm gì, không có giao dịch keeper thứ hai. Test: Task 5, "a run that finds the lease held does nothing…".
4. **`KEEPER_KEY` sai dạng** (thiếu ký tự, có khoảng trắng, không phải hex) → không crash, keeper chạy dry-run, ops nhận cảnh báo `keeper-key`, `/health` báo `degraded`. Test: Task 3 (`keeperWallet`), Task 5 (cảnh báo), Task 8 (`/health`).
5. **Biến thể của deep link và lệnh** (`/start@AtropyleBot 0xABC…-Owner`, địa chỉ viết hoa thường lẫn lộn, vai trò lạ, địa chỉ không phải vault, chat đã theo dõi 20 vault, RPC hỏng khi kiểm vault) → chuẩn hoá được thì chuẩn hoá, không thì trả lời rõ ràng. Không bao giờ trả 5xx, vì Telegram sẽ gửi lại mãi. Test: Task 9, "normalises /start@bot with a mixed-case address…" và các test liền sau.

## File Structure

```
apps/worker/
  package.json                 workspace @atropyle/worker (private)
  wrangler.jsonc               Worker, D1, ratelimits, crons, vars
  tsconfig.json                kiểu Workers: src + test/workers
  tsconfig.node.json           kiểu Node: scripts + test/devnet + cấu hình vitest
  vitest.config.ts             test trong workerd (@cloudflare/vitest-plugin)
  vitest.devnet.config.ts      test Node trên anvil
  README.md                    (Task 11, 12)
  migrations/
    0001_init.sql              bảy bảng (Task 1)
    0002_reminders.sql         cột vaults.reminded (Task 15)
  src/
    index.ts                   export default createWorker()
    worker.ts                  createWorker(): fetch + scheduled
    env.ts                     Env, RateLimiterLike
    config.ts                  readConfig(env) → WorkerConfig
    clock.ts                   Clock, nowSeconds, isoAt
    log.ts                     createLogger, errorFields
    budget.ts                  Budget, COST
    types.ts                   kiểu dữ liệu dùng chung (VaultView, VaultRow, Watcher, …)
    runtime.ts                 Runtime, defaultRuntime (Task 6, 7)
    app.ts                     createApp: request id, log, CORS, rate limit, lỗi (Task 7)
    problem.ts                 problem+json, API_ERRORS (Task 7)
    ratelimit.ts               memoryLimiter, FALLBACK_* (Task 7)
    store/d1.ts                D1Like, metered()
    store/store.ts             Store: toàn bộ SQL
    chain/port.ts              ChainPort, RpcProbe, KeeperRunOptions
    chain/wallet.ts            keeperWallet
    chain/sdk.ts               sdkOptions, countedHttp, probeUrl, createSdkChain
    telegram/client.ts         telegramNotifier
    telegram/messages.ts       noticesFor, deliveries, formatTime, vaultLink, showAddress
    cron/alerts.ts             Alerts (cảnh báo ops)
    cron/minute.ts             runMinute
    cron/integrity.ts          runIntegrity
    cron/reminders.ts          dueReminder, sendReminders (Task 15)
    bot/commands.ts            parseCommand, parseStartArg
    bot/webhook.ts             handleUpdate, describeVault
    routes/health.ts           GET /health
    routes/v1.ts               GET /v1/stats, /v1/integrity
    routes/telegram.ts         POST /telegram/webhook, safeEqual
    routes/badge.ts            GET /v1/badge/* (Task 14)
    routes/keeper.ts           GET /v1/keeper/due (Task 13, có điều kiện)
    routes/vaults.ts           GET /v1/vaults/:a, /v1/accounts/:a/vaults (Task 16, P1)
    routes/openapi.ts          schema zod + /v1/openapi.json (Task 16, P1)
    routes/mcp.ts              /mcp (Task 17, P1)
  scripts/
    lib/devnet.ts              createDrill, chainNowMs, tài khoản anvil (Node)
    lib/node-d1.ts             D1Like trên node:sqlite (Node)
    lib/external-keeper.ts     runExternalKeeper (Task 13)
    measure-cron.ts            đo CPU/fetch/truy vấn trên anvil (Task 12)
    keeper-run.ts              một lần chạy keeper bên ngoài, cho crontab (B1) hoặc GitHub Actions (B2) (Task 13)
  test/workers/                chạy trong workerd
    env.d.ts, apply-migrations.ts, helpers.ts, fixtures.ts, fakes.ts
    migrations.test.ts, foundation.test.ts, store.test.ts, chain.test.ts,
    telegram.test.ts, alerts.test.ts, minute.test.ts, integrity.test.ts, app.test.ts,
    routes.test.ts, webhook.test.ts, keeper-route.test.ts, badge.test.ts,
    reminders.test.ts, vaults.test.ts, mcp.test.ts
  test/devnet/                 chạy trên Node + anvil
    global-setup.ts, helpers.ts, chain.test.ts, keeper.test.ts, external-keeper.test.ts, vaults.test.ts
.github/workflows/ci.yml       thêm job `worker` (Task 11)
.github/workflows/keeper.yml   (Task 13, có điều kiện)
.gitignore                     thêm .wrangler/, .dev.vars, apps/worker/dist/
```

Ranh giới:
- `src/cron`, `src/store`, `src/chain`, `src/telegram` và `src/bot` không import `src/env.ts`, `src/runtime.ts` hay Hono. Nhờ vậy script Node (`measure-cron`, E2E trên devnet) dùng lại được đúng mã chạy trên Cloudflare.
- Chỉ `src/runtime.ts`, `src/worker.ts`, `src/app.ts` và `src/routes/*` biết tới `Env`.

---

### Task 1: Khung workspace `apps/worker`, cấu hình wrangler và migration D1

**Files:**
- Create: `apps/worker/package.json`, `apps/worker/wrangler.jsonc`, `apps/worker/tsconfig.json`, `apps/worker/tsconfig.node.json`, `apps/worker/vitest.config.ts`
- Create: `apps/worker/migrations/0001_init.sql`
- Create: `apps/worker/src/env.ts`, `apps/worker/src/index.ts` (tạm, Task 6 thay)
- Create: `apps/worker/test/workers/env.d.ts`, `apps/worker/test/workers/apply-migrations.ts`, `apps/worker/test/workers/helpers.ts`
- Modify: `.gitignore`, `package-lock.json` (do `npm install` sinh ra)
- Test: `apps/worker/test/workers/migrations.test.ts`

**Interfaces:**
- Consumes: workspace `@atropyle/sdk` (Plan 2, đã build ra `dist`).
- Produces:
  - `interface RateLimiterLike { limit(o: { key: string }): Promise<{ success: boolean }> }` (`src/env.ts`)
  - `interface Env` (`src/env.ts`):
    - binding `DB: D1Database`; `RATE_LIMITER?`, `MCP_RATE_LIMITER?: RateLimiterLike`;
    - var dạng chuỗi, tuỳ chọn: `CHAIN`, `OPS_CHAT_ID`, `WEB_URL`, `SCAN_MAX_BLOCKS`, `KEEPER_MODE`, `KEEPER_MAX_TX`, `KEEPER_MAX_VAULTS`, `SUBREQUEST_BUDGET`, `D1_QUERY_BUDGET`;
    - secret, tuỳ chọn: `TELEGRAM_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `KEEPER_KEY`.
  - Bảy bảng D1: `vaults`, `watch`, `cursor`, `seen`, `stats`, `keeper_log`, `meta` (Quyết định 14).
  - Script npm của `apps/worker`: `dev`, `test`, `test:devnet`, `typecheck`, `check:bundle`, `measure:cron`.
  - `resetDb(): Promise<void>` (`test/workers/helpers.ts`): xoá dữ liệu của cả bảy bảng.

- [ ] **Step 1: Tạo `package.json` và cấu hình TypeScript**

`apps/worker/package.json`:

```json
{
  "name": "@atropyle/worker",
  "version": "0.0.0",
  "private": true,
  "description": "Atropyle Cloudflare Worker: Telegram bot, keeper, /v1 API and cron.",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "test": "vitest run",
    "test:devnet": "vitest run -c vitest.devnet.config.ts",
    "typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.node.json",
    "check:bundle": "wrangler deploy --dry-run --outdir dist",
    "measure:cron": "tsx scripts/measure-cron.ts"
  },
  "dependencies": {
    "@atropyle/sdk": "*",
    "hono": "4.13.19",
    "viem": "2.58.0"
  },
  "devDependencies": {
    "@cloudflare/vitest-plugin": "1.8.4",
    "@cloudflare/workers-types": "5.20261118.1",
    "vitest": "4.1.12",
    "wrangler": "4.164.0"
  }
}
```

Dùng `"@atropyle/sdk": "*"` để npm workspaces lấy gói trong `packages/sdk`, không tải từ registry.

`apps/worker/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "@cloudflare/vitest-plugin/types"]
  },
  "include": ["src", "test/workers"]
}
```

`apps/worker/tsconfig.node.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["scripts", "test/devnet", "vitest.config.ts", "vitest.devnet.config.ts"]
}
```

Về `lib`:
- Cấu hình Workers bỏ `DOM`, vì `@cloudflare/workers-types` đã khai báo `fetch`, `Request`, `crypto`, `AbortSignal`.
- Cấu hình Node giữ `lib` của gốc (`ES2022`, `DOM`).
- Mã trong `src` mà script Node import (xem Ranh giới ở File Structure) phải biên dịch được với cả hai.

- [ ] **Step 2: Tạo `wrangler.jsonc`**

```jsonc
{
  // Atropyle Worker (Plan 5): Telegram bot, keeper, /health, /v1 and cron. One Worker, one D1 database.
  "name": "atropyle-worker",
  "main": "src/index.ts",
  "compatibility_date": "2026-11-01",
  "compatibility_flags": ["nodejs_compat"],
  "send_metrics": false,
  "observability": { "enabled": true },
  "triggers": { "crons": ["* * * * *", "*/10 * * * *"] },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "atropyle",
      // Replaced with the id printed by `npx wrangler d1 create atropyle` (Task 12). The id is not a secret.
      "database_id": "00000000-0000-0000-0000-000000000000",
      "migrations_dir": "migrations"
    }
  ],
  "ratelimits": [{ "name": "RATE_LIMITER", "namespace_id": "1201", "simple": { "limit": 120, "period": 60 } }],
  "vars": {
    "CHAIN": "xlayer",
    "OPS_CHAT_ID": "",
    "WEB_URL": "https://duongnq2798.github.io/atropyle/",
    "SCAN_MAX_BLOCKS": "1000",
    "KEEPER_MODE": "worker",
    "KEEPER_MAX_TX": "20",
    "KEEPER_MAX_VAULTS": "20",
    "SUBREQUEST_BUDGET": "45",
    "D1_QUERY_BUDGET": "45"
  }
}
```

Các secret (`TELEGRAM_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `KEEPER_KEY`) không nằm trong file này. Người dùng tự đặt chúng bằng `wrangler secret put` ở Task 12.

- [ ] **Step 3: Viết migration**

`apps/worker/migrations/0001_init.sql`:

```sql
-- Atropyle worker schema (Plan 5).
-- Addresses are lowercase 0x hex. Chain times are seconds of chain time; created_at/updated_at are wall-clock milliseconds.

-- One row per vault created by the factory, with a cached view refreshed after each of its events.
CREATE TABLE vaults (
  address TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  drill INTEGER NOT NULL,
  created_block INTEGER NOT NULL,
  next_check_at INTEGER,
  state TEXT,
  last_alive INTEGER,
  late_at INTEGER,
  window_ends_at INTEGER,
  expires_at INTEGER,
  recovery_target TEXT,
  refreshed_block INTEGER
);
CREATE INDEX vaults_next_check ON vaults (next_check_at) WHERE next_check_at IS NOT NULL;

-- Telegram chats that asked for alerts about a vault, with the role they chose.
CREATE TABLE watch (
  chat_id TEXT NOT NULL,
  vault TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'guardian', 'heir')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (chat_id, vault, role)
);
CREATE INDEX watch_vault ON watch (vault);

-- The last block whose events were fully processed (single row, name = 'events').
CREATE TABLE cursor (
  name TEXT PRIMARY KEY,
  block INTEGER NOT NULL
);

-- Events already claimed for notification: (transactionHash, logIndex).
CREATE TABLE seen (
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
) WITHOUT ROWID;

-- Stats counters for resuming stats(), plus the public summary served by /v1/stats.
CREATE TABLE stats (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Transactions the keeper sent. `at` is the chain time of the keeper run.
CREATE TABLE keeper_log (
  vault TEXT NOT NULL,
  action TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (tx_hash, vault)
);
CREATE INDEX keeper_log_vault ON keeper_log (vault, action, at);

-- Small JSON documents: latest integrity, cron heartbeat, leases, keeper status, ops alert state.
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
```

- [ ] **Step 4: Tạo `env.ts`, entry tạm và cấu hình vitest**

`apps/worker/src/env.ts`:

```ts
// Bindings, vars and secrets of the Worker. Secrets are set by the user with `wrangler secret put`.
export interface RateLimiterLike {
  limit(o: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  RATE_LIMITER?: RateLimiterLike;
  MCP_RATE_LIMITER?: RateLimiterLike;
  CHAIN?: string;
  OPS_CHAT_ID?: string;
  WEB_URL?: string;
  SCAN_MAX_BLOCKS?: string;
  KEEPER_MODE?: string;
  KEEPER_MAX_TX?: string;
  KEEPER_MAX_VAULTS?: string;
  SUBREQUEST_BUDGET?: string;
  D1_QUERY_BUDGET?: string;
  TELEGRAM_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  KEEPER_KEY?: string;
}
```

`apps/worker/src/index.ts` (tạm thời, Task 6 thay bằng `createWorker()`):

```ts
import type { Env } from './env';

export default {
  async fetch(): Promise<Response> {
    return new Response('Atropyle worker', { status: 200 });
  },
} satisfies ExportedHandler<Env>;
```

`apps/worker/vitest.config.ts`:

```ts
import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: {
      include: ['test/workers/**/*.test.ts'],
      setupFiles: ['./test/workers/apply-migrations.ts'],
    },
  };
});
```

`apps/worker/test/workers/env.d.ts`:

```ts
import type { Env as WorkerEnv } from '../../src/env';

declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {
      TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
    }
  }
}

export {};
```

`apps/worker/test/workers/apply-migrations.ts`:

```ts
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
```

`apps/worker/test/workers/helpers.ts`:

```ts
import { env } from 'cloudflare:workers';

export const TABLES = ['vaults', 'watch', 'cursor', 'seen', 'stats', 'keeper_log', 'meta'] as const;

/** Empties every table. Tests call it in beforeEach, so they never depend on storage isolation between tests. */
export async function resetDb(): Promise<void> {
  await env.DB.batch(TABLES.map((t) => env.DB.prepare(`DELETE FROM ${t}`)));
}
```

- [ ] **Step 5: Thêm các mục ignore**

Thêm vào cuối `.gitignore` ở gốc:

```
# Cloudflare Worker (Plan 5)
.wrangler/
.dev.vars
.dev.vars.*
apps/worker/dist/
```

- [ ] **Step 6: Cài đặt, rồi kiểm hai bản vitest cùng tồn tại**

Run: `npm install`
Expected: thoát với mã 0, không có `ERESOLVE`. Nếu có `ERESOLVE`, dừng lại theo Quyết định 3.

Run: `npm ls vitest @cloudflare/vitest-plugin`
Expected:
- cây có `vitest@3.2.7` ở gốc và `vitest@4.1.12` dưới `@atropyle/worker`;
- `@cloudflare/vitest-plugin@1.8.4` dùng `vitest@4.1.12`;
- không có dòng `invalid` hay `ERR`.

Run: `npm exec -w apps/worker -- vitest --version`
Expected: `vitest/4.1.12 …`

- [ ] **Step 7: Viết test migration**

`apps/worker/test/workers/migrations.test.ts`:

```ts
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from './helpers';

describe('D1 migrations', () => {
  beforeEach(resetDb);

  it('creates the seven tables', async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite%' AND substr(name, 1, 1) <> '_' AND name <> 'd1_migrations' ORDER BY name",
    ).all<{ name: string }>();
    expect(results.map((r) => r.name)).toEqual(['cursor', 'keeper_log', 'meta', 'seen', 'stats', 'vaults', 'watch']);
  });

  it('rejects an unknown watch role', async () => {
    await expect(
      env.DB.prepare("INSERT INTO watch (chat_id, vault, role, created_at) VALUES ('1', '0xab', 'boss', 0)").run(),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it('ignores a second claim of the same event', async () => {
    const first = await env.DB.prepare("INSERT OR IGNORE INTO seen (tx_hash, log_index) VALUES ('0x01', 0)").run();
    const again = await env.DB.prepare("INSERT OR IGNORE INTO seen (tx_hash, log_index) VALUES ('0x01', 0)").run();
    expect(first.meta.changes).toBe(1);
    expect(again.meta.changes).toBe(0);
  });
});
```

- [ ] **Step 8: Chạy test, và thấy nó thất bại khi schema sai**

Run: `npm run build -w circuits && npm run build -w packages/sdk && npm test -w apps/worker`
Expected: 3 test PASS trong `migrations.test.ts`.

Kiểm rằng test bắt được lỗi:
1. Tạm thêm `'boss'` vào danh sách `CHECK (role IN (...))` trong migration.
2. Chạy lại: test "rejects an unknown watch role" FAIL.
3. Trả migration về như cũ: cả 3 test PASS.

- [ ] **Step 9: Kiểm typecheck và bundle**

Run: `npm run typecheck -w apps/worker && npm run check:bundle -w apps/worker && npx biome check apps/worker`
Expected:
- `tsc` không lỗi;
- wrangler in `--dry-run: exiting now.` và liệt kê binding `env.DB (atropyle)`, `env.RATE_LIMITER` cùng các var;
- Biome sạch.

Nếu Biome chỉ báo lỗi format hay thứ tự import, chạy `npx biome check --write apps/worker` rồi chạy lại lệnh kiểm. Mọi task sau dùng cùng cách này.

- [ ] **Step 10: Commit**

```bash
git add apps/worker/package.json apps/worker/wrangler.jsonc apps/worker/tsconfig.json apps/worker/tsconfig.node.json apps/worker/vitest.config.ts apps/worker/migrations/0001_init.sql apps/worker/src/env.ts apps/worker/src/index.ts apps/worker/test/workers/env.d.ts apps/worker/test/workers/apply-migrations.ts apps/worker/test/workers/helpers.ts apps/worker/test/workers/migrations.test.ts .gitignore package-lock.json
git commit -m "feat(worker): scaffold the Cloudflare Worker workspace and D1 schema" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Nền tảng — cấu hình, log, đồng hồ, ngân sách, kiểu dữ liệu và `Store` trên D1

**Files:**
- Create: `apps/worker/src/config.ts`, `apps/worker/src/clock.ts`, `apps/worker/src/log.ts`, `apps/worker/src/budget.ts`, `apps/worker/src/types.ts`
- Create: `apps/worker/src/store/d1.ts`, `apps/worker/src/store/store.ts`
- Create: `apps/worker/test/workers/fixtures.ts`
- Test: `apps/worker/test/workers/foundation.test.ts`, `apps/worker/test/workers/store.test.ts`

**Interfaces:**
- Consumes:
  - từ SDK: `stringify`, `decodeError`, kiểu `ChainName`, `StateName`, `KeeperAction`, `KeeperOutcomeStatus`;
  - các bảng của Task 1.
- Produces:
  - **`config.ts`:**
    - `type ConfigSource = Partial<Record<ConfigKey, string>>`, `type KeeperMode = 'worker' | 'external'`, `DEFAULT_WEB_URL`
    - `interface WorkerConfig { chain: ChainName; opsChatId: string; webUrl: string; scanMaxBlocks: number; keeperMode: KeeperMode; keeperMaxTx: number; keeperMaxVaults: number; budget: { fetches: number; queries: number } }`
    - `readConfig(src: ConfigSource): WorkerConfig`. Var sai dạng thì ném `Error`, có tên var trong message.
  - **`clock.ts`:** `interface Clock { nowMs(): number }`, `systemClock`, `nowSeconds(c: Clock): bigint`, `isoAt(ms: number): string`.
  - **`log.ts`:**
    - `type Fields = Record<string, unknown>`
    - `interface Logger { info; warn; error: (msg: string, fields?: Fields) => void; child(fields: Fields): Logger }`
    - `createLogger(base?: Fields, sink?: (line: string) => void): Logger`
    - `errorFields(e: unknown): { code: string; error: string }`
  - **`budget.ts`:**
    - `interface Cost { fetches: number; queries: number }`
    - `class Budget { fetches; queries; limits; countFetch(); countQuery(); left(): Cost; allows(c: Cost): boolean }`
    - `COST` gồm `view`, `notice`, `keeperBase`, `keeperVault`, `keeperTx`, `reserve`.
  - **`types.ts`:** `WatchRole`, `WATCH_ROLES`, `Watcher`, `KnownVault`, `CreatedVaultRow`, `EventKey`, `VaultView`, `VaultRow`, `StatsCounters`, `StatsJson`, `StatsSummary`, `KeeperEntry`, `KeeperStatus`, `KeeperIdentity`, `CronBeat`, `IntegrityCheckJson`, `IntegrityReportJson`, `IntegrityRecord` (định nghĩa đầy đủ ở Step 3).
  - **`store/d1.ts`:** `interface D1RunResult`, `D1PreparedLike`, `D1Like`; `metered(db: D1Like, budget: Budget): D1Like`.
  - **`store/store.ts`:**
    - `MAX_WATCHES_PER_CHAT = 20`; `eventKey(k: EventKey): string`
    - `class Store` với các method:
      - cursor và stats: `getCursor`, `getCounters`, `getSummary`, `commitCursor`;
      - vault: `knownVaults`, `getVault`, `getVaults`, `dueVaults`, `applyVault`;
      - đọc theo lô cho cron: `seenKeys`, `watchersOf`, `lastDistributes`, `keeperPokes`;
      - keeper: `recordKeeper`;
      - watch: `addWatch`, `listWatches`, `removeWatches`;
      - meta: `getMeta`, `getMetas`, `getMetaPrefix`, `setMeta`, `setMetas`;
      - lease: `acquireLease`, `releaseLease`.

      Chữ ký đầy đủ ở Step 5.
  - **`test/workers/fixtures.ts`:** `T0 = 1_800_000_000n`, `addr(n)`, `txHash(n)`, `VAULT_A`, `VAULT_B`, `VAULT_C`, `OWNER`, `HEIR`, `GUARDIAN`, `viewOf(vault, over?)`.

- [ ] **Step 1: Viết test nền tảng (thất bại)**

`apps/worker/test/workers/foundation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Budget, COST } from '../../src/budget';
import { isoAt, nowSeconds } from '../../src/clock';
import { type ConfigSource, DEFAULT_WEB_URL, readConfig } from '../../src/config';
import { createLogger, errorFields } from '../../src/log';

describe('readConfig', () => {
  it('uses the defaults when vars are missing', () => {
    expect(readConfig({})).toEqual({
      chain: 'xlayer',
      opsChatId: '',
      webUrl: DEFAULT_WEB_URL,
      scanMaxBlocks: 1000,
      keeperMode: 'worker',
      keeperMaxTx: 20,
      keeperMaxVaults: 20,
      budget: { fetches: 45, queries: 45 },
    });
  });

  it('parses vars, trims them and adds the trailing slash to WEB_URL', () => {
    const c = readConfig({
      CHAIN: 'local',
      OPS_CHAT_ID: ' -100123 ',
      WEB_URL: 'https://example.org/app',
      SCAN_MAX_BLOCKS: '5000',
      KEEPER_MODE: 'external',
      KEEPER_MAX_TX: '3',
      SUBREQUEST_BUDGET: '900',
      D1_QUERY_BUDGET: '900',
    });
    expect(c).toMatchObject({
      chain: 'local',
      opsChatId: '-100123',
      webUrl: 'https://example.org/app/',
      scanMaxBlocks: 5000,
      keeperMode: 'external',
      keeperMaxTx: 3,
      budget: { fetches: 900, queries: 900 },
    });
  });

  const bad: [ConfigSource, RegExp][] = [
    [{ CHAIN: 'mainnet' }, /CHAIN must be "xlayer" or "local"/],
    [{ KEEPER_MODE: 'cron' }, /KEEPER_MODE/],
    [{ KEEPER_MAX_TX: '21' }, /KEEPER_MAX_TX must be between 0 and 20/],
    [{ SCAN_MAX_BLOCKS: '1e3' }, /SCAN_MAX_BLOCKS must be a whole number/],
    [{ SUBREQUEST_BUDGET: '5' }, /SUBREQUEST_BUDGET must be between 10/],
    [{ WEB_URL: 'ftp://example.org' }, /WEB_URL must start with https?:\/\//],
  ];
  it.each(bad)('rejects %o', (src, message) => {
    expect(() => readConfig(src)).toThrow(message);
  });
});

describe('Budget', () => {
  it('counts fetches and queries and says whether a cost still fits', () => {
    const b = new Budget({ fetches: 10, queries: 5 });
    b.countFetch();
    b.countFetch();
    b.countQuery();
    expect(b.left()).toEqual({ fetches: 8, queries: 4 });
    expect(b.allows({ fetches: 8, queries: 4 })).toBe(true);
    expect(b.allows({ fetches: 9, queries: 0 })).toBe(false);
    expect(b.allows(COST.view)).toBe(true);
    expect(b.allows(COST.keeperTx)).toBe(false);
  });
});

describe('log and clock', () => {
  it('writes one JSON line per call, bigints as strings, child fields merged', () => {
    const lines: string[] = [];
    const log = createLogger({ service: 'w' }, (l) => lines.push(l)).child({ requestId: 'r1' });
    log.info('cron.minute', { cursor: 12n });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}')).toEqual({ level: 'info', msg: 'cron.minute', service: 'w', requestId: 'r1', cursor: '12' });
  });

  it('errorFields keeps the SDK error code and the message', () => {
    expect(errorFields(new Error('boom'))).toEqual({ code: 'UNKNOWN', error: 'boom' });
  });

  it('nowSeconds floors to whole seconds and isoAt prints UTC', () => {
    expect(nowSeconds({ nowMs: () => 1_800_000_000_999 })).toBe(1_800_000_000n);
    expect(isoAt(0)).toBe('1970-01-01T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npm test -w apps/worker -- foundation`
Expected: FAIL, không resolve được `../../src/budget`.

- [ ] **Step 3: Viết `config.ts`, `clock.ts`, `log.ts`, `budget.ts`, `types.ts`**

`apps/worker/src/config.ts`:

```ts
import type { ChainName } from '@atropyle/sdk';

export type ConfigKey =
  | 'CHAIN'
  | 'OPS_CHAT_ID'
  | 'WEB_URL'
  | 'SCAN_MAX_BLOCKS'
  | 'KEEPER_MODE'
  | 'KEEPER_MAX_TX'
  | 'KEEPER_MAX_VAULTS'
  | 'SUBREQUEST_BUDGET'
  | 'D1_QUERY_BUDGET';
export type ConfigSource = Partial<Record<ConfigKey, string>>;
export type KeeperMode = 'worker' | 'external';

export interface WorkerConfig {
  chain: ChainName;
  opsChatId: string;
  webUrl: string;
  scanMaxBlocks: number;
  keeperMode: KeeperMode;
  keeperMaxTx: number;
  keeperMaxVaults: number;
  budget: { fetches: number; queries: number };
}

export const DEFAULT_WEB_URL = 'https://duongnq2798.github.io/atropyle/';

function int(src: ConfigSource, key: ConfigKey, fallback: number, min: number, max: number): number {
  const raw = src[key]?.trim();
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${key} must be a whole number, got "${raw}"`);
  const n = Number(raw);
  if (n < min || n > max) throw new Error(`${key} must be between ${min} and ${max}, got ${n}`);
  return n;
}

/** Reads the Worker vars. A malformed var throws: a misconfigured Worker should fail loudly, not run with guesses. */
export function readConfig(src: ConfigSource): WorkerConfig {
  const chain = src.CHAIN?.trim() || 'xlayer';
  if (chain !== 'xlayer' && chain !== 'local') throw new Error(`CHAIN must be "xlayer" or "local", got "${chain}"`);
  const keeperMode = src.KEEPER_MODE?.trim() || 'worker';
  if (keeperMode !== 'worker' && keeperMode !== 'external') {
    throw new Error(`KEEPER_MODE must be "worker" or "external", got "${keeperMode}"`);
  }
  const web = src.WEB_URL?.trim() || DEFAULT_WEB_URL;
  if (!/^https?:\/\//.test(web)) throw new Error(`WEB_URL must start with https:// or http://, got "${web}"`);
  return {
    chain,
    opsChatId: src.OPS_CHAT_ID?.trim() ?? '',
    webUrl: web.endsWith('/') ? web : `${web}/`,
    scanMaxBlocks: int(src, 'SCAN_MAX_BLOCKS', 1000, 1, 100_000),
    keeperMode,
    keeperMaxTx: int(src, 'KEEPER_MAX_TX', 20, 0, 20),
    keeperMaxVaults: int(src, 'KEEPER_MAX_VAULTS', 20, 0, 200),
    budget: {
      fetches: int(src, 'SUBREQUEST_BUDGET', 45, 10, 10_000),
      queries: int(src, 'D1_QUERY_BUDGET', 45, 10, 1_000),
    },
  };
}
```

`KEEPER_MAX_TX` có trần 20 vì spec §9.4 giới hạn "tối đa 20 giao dịch mỗi lần chạy".

`apps/worker/src/clock.ts`:

```ts
export interface Clock {
  nowMs(): number;
}

export const systemClock: Clock = { nowMs: () => Date.now() };

/** Whole seconds; on X Layer the chain clock follows wall time closely enough for due checks. */
export function nowSeconds(clock: Clock): bigint {
  return BigInt(Math.floor(clock.nowMs() / 1000));
}

export function isoAt(ms: number): string {
  return new Date(ms).toISOString();
}
```

`apps/worker/src/log.ts`:

```ts
import { decodeError, stringify } from '@atropyle/sdk';

export type Fields = Record<string, unknown>;

export interface Logger {
  info(msg: string, fields?: Fields): void;
  warn(msg: string, fields?: Fields): void;
  error(msg: string, fields?: Fields): void;
  child(fields: Fields): Logger;
}

/** One JSON object per line, picked up by Workers Logs. Never pass tokens, secrets or keys in fields. */
export function createLogger(base: Fields = {}, sink: (line: string) => void = (line) => console.log(line)): Logger {
  const write = (level: string, msg: string, fields?: Fields) => sink(stringify({ level, msg, ...base, ...fields }));
  return {
    info: (msg, fields) => write('info', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    error: (msg, fields) => write('error', msg, fields),
    child: (fields) => createLogger({ ...base, ...fields }, sink),
  };
}

export function errorFields(e: unknown): { code: string; error: string } {
  const err = decodeError(e);
  return { code: err.code, error: err.message.slice(0, 300) };
}
```

`apps/worker/src/budget.ts`:

```ts
export interface Cost {
  fetches: number;
  queries: number;
}

/**
 * Estimated cost of each unit of cron work (Quyết định 12). Task 12 measures the real numbers.
 * view: snapshot (block number + batched eth_calls) and the policy engine; keeperTx: simulate, nonce, fees, send, receipt.
 */
export const COST = {
  view: { fetches: 4, queries: 1 },
  notice: { fetches: 1, queries: 0 },
  keeperBase: { fetches: 2, queries: 3 },
  keeperVault: { fetches: 4, queries: 0 },
  keeperTx: { fetches: 12, queries: 0 },
  reserve: { fetches: 0, queries: 4 },
} as const satisfies Record<string, Cost>;

/** Counts subrequests and D1 queries of one invocation, against the plan limits (50/50 on Workers Free). */
export class Budget {
  fetches = 0;
  queries = 0;

  constructor(readonly limits: Cost) {}

  countFetch(): void {
    this.fetches += 1;
  }

  countQuery(): void {
    this.queries += 1;
  }

  left(): Cost {
    return { fetches: this.limits.fetches - this.fetches, queries: this.limits.queries - this.queries };
  }

  allows(cost: Cost): boolean {
    const left = this.left();
    return cost.fetches <= left.fetches && cost.queries <= left.queries;
  }
}
```

`apps/worker/src/types.ts`:

```ts
import type { KeeperAction, KeeperOutcomeStatus, StateName } from '@atropyle/sdk';
import type { Address, Hex } from 'viem';

export type WatchRole = 'owner' | 'guardian' | 'heir';
export const WATCH_ROLES: readonly WatchRole[] = ['owner', 'guardian', 'heir'];

export interface Watcher {
  chatId: string;
  vault: Address;
  role: WatchRole;
}

export interface KnownVault {
  vault: Address;
  owner: Address;
  drill: boolean;
}

export interface CreatedVaultRow extends KnownVault {
  createdBlock: bigint;
}

/** Same field names as VaultEvent, so an event can be passed where a key is expected. */
export interface EventKey {
  transactionHash: Hex;
  logIndex: number;
}

/** What the cron keeps after reading a vault: a subset of VaultStatus plus the next keeper check (chain seconds). */
export interface VaultView {
  vault: Address;
  state: StateName;
  lastAlive: bigint;
  lateAt: bigint;
  alarmAt: bigint | null;
  windowEndsAt: bigint | null;
  expiresAt: bigint | null;
  expired: boolean;
  recoveryTarget: Address | null;
  nextCheckAt: bigint | null;
  blockNumber: bigint;
  blockTimestamp: bigint;
}

/** A row of `vaults`. Addresses come back lowercase. */
export interface VaultRow {
  address: Address;
  owner: Address;
  drill: boolean;
  createdBlock: bigint;
  nextCheckAt: bigint | null;
  state: StateName | null;
  lastAlive: bigint | null;
  lateAt: bigint | null;
  windowEndsAt: bigint | null;
  expiresAt: bigint | null;
  recoveryTarget: Address | null;
  refreshedBlock: bigint | null;
}

export interface StatsCounters {
  aliveEvents: number;
  alarms: number;
  releases: number;
  distributions: number;
}

/** Omit<Stats, 'cursor'> after toJson: block numbers are decimal strings. */
export interface StatsJson {
  fromBlock: string;
  toBlock: string;
  vaults: { total: number; drill: number; paid: number };
  owners: number;
  checkIns: number;
  alarms: number;
  releases: number;
  distributions: number;
}

export interface StatsSummary {
  updatedAt: string;
  stats: StatsJson;
}

export interface KeeperEntry {
  vault: Address;
  action: KeeperAction | null;
  status: KeeperOutcomeStatus;
  hash: Hex | null;
  nextCheckAt: bigint | null;
}

export interface KeeperStatus {
  ranAt: string;
  address: Address | null;
  balance: string | null;
  dryRun: boolean;
  stopped: 'LOW_BALANCE' | null;
  sent: number;
  failed: number;
}

export interface KeeperIdentity {
  address: Address | null;
  error: 'KEEPER_KEY_INVALID' | null;
}

/** Heartbeat written by every minute run (`meta.cron`) and by every run whose event sync did not fail (`meta.cron:ok`). */
export interface CronBeat {
  at: string;
  cursor: string | null;
  status: 'ok' | 'incomplete' | 'failed';
  keeper: KeeperIdentity;
}

export interface IntegrityCheckJson {
  name: string;
  ok: boolean;
  expected?: string;
  actual?: string;
}

/** IntegrityReport after toJson. */
export interface IntegrityReportJson {
  ok: boolean;
  chainId: number;
  blockNumber: string;
  blockTimestamp: string;
  rpcs: number;
  checks: IntegrityCheckJson[];
  warnings: { code: string; message: string }[];
}

export interface IntegrityRecord {
  checkedAt: string;
  blockNumber: string;
  report: IntegrityReportJson;
}
```

- [ ] **Step 4: Chạy test nền tảng**

Run: `npm test -w apps/worker -- foundation`
Expected: 12 test PASS (2 test cấu hình, 6 ca của `it.each`, 1 test `Budget`, 3 test log/clock).

- [ ] **Step 5: Viết test `Store` (thất bại)**

`apps/worker/test/workers/fixtures.ts`:

```ts
import type { Address, Hex } from 'viem';
import type { VaultView } from '../../src/types';

export const T0 = 1_800_000_000n;

export const addr = (n: number): Address => `0x${n.toString(16).padStart(40, '0')}` as Address;
export const txHash = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}` as Hex;

export const VAULT_A = addr(0xa1);
export const VAULT_B = addr(0xb2);
export const VAULT_C = addr(0xc3);
export const OWNER = addr(0x01);
export const HEIR = addr(0x02);
export const GUARDIAN = addr(0x03);

export function viewOf(vault: Address, over: Partial<VaultView> = {}): VaultView {
  return {
    vault,
    state: 'active',
    lastAlive: T0,
    lateAt: T0 + 120n,
    alarmAt: null,
    windowEndsAt: null,
    expiresAt: T0 + 604_800n,
    expired: false,
    recoveryTarget: null,
    nextCheckAt: T0 + 120n,
    blockNumber: 150n,
    blockTimestamp: T0 + 10n,
    ...over,
  };
}
```

`apps/worker/test/workers/store.test.ts`:

```ts
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { Budget } from '../../src/budget';
import { metered } from '../../src/store/d1';
import { eventKey, MAX_WATCHES_PER_CHAT, Store } from '../../src/store/store';
import type { KeeperStatus } from '../../src/types';
import { addr, HEIR, OWNER, T0, txHash, VAULT_A, VAULT_B, VAULT_C, viewOf } from './fixtures';
import { resetDb } from './helpers';

describe('Store', () => {
  let budget: Budget;
  let store: Store;
  beforeEach(async () => {
    await resetDb();
    budget = new Budget({ fetches: 100, queries: 100 });
    store = new Store(metered(env.DB, budget));
  });

  it('claims each event once, in the same batch as the vault insert and its view', async () => {
    const created = { vault: VAULT_A, owner: OWNER, drill: true, createdBlock: 110n };
    const k1 = { transactionHash: txHash(1), logIndex: 0 };
    const k2 = { transactionHash: txHash(1), logIndex: 1 };
    expect(await store.applyVault({ created, view: viewOf(VAULT_A), claims: [k1, k2] })).toEqual([true, true]);
    expect(budget.queries).toBe(1);
    expect(await store.applyVault({ created, view: viewOf(VAULT_A, { state: 'grace' }), claims: [k1, k2] })).toEqual([false, false]);
    const row = await store.getVault(`0x${VAULT_A.slice(2).toUpperCase()}`);
    expect(row).toMatchObject({ address: VAULT_A, owner: OWNER, drill: true, createdBlock: 110n, state: 'grace', nextCheckAt: T0 + 120n, refreshedBlock: 150n });
    expect(await store.seenKeys([k1, k2, { transactionHash: txHash(2), logIndex: 0 }])).toEqual(new Set([eventKey(k1), eventKey(k2)]));
    expect([...(await store.getVaults([VAULT_A, VAULT_B])).keys()]).toEqual([VAULT_A]);
  });

  it('lists known vaults up to a block, and due vaults ordered by next_check_at', async () => {
    await store.applyVault({ created: { vault: VAULT_A, owner: OWNER, drill: true, createdBlock: 110n }, view: viewOf(VAULT_A, { nextCheckAt: T0 + 5n }), claims: [] });
    await store.applyVault({ created: { vault: VAULT_B, owner: OWNER, drill: false, createdBlock: 120n }, view: viewOf(VAULT_B, { nextCheckAt: T0 - 5n }), claims: [] });
    await store.applyVault({ created: { vault: VAULT_C, owner: HEIR, drill: true, createdBlock: 130n }, view: viewOf(VAULT_C, { nextCheckAt: null }), claims: [] });
    expect(await store.knownVaults(120n)).toEqual([
      { vault: VAULT_A, owner: OWNER, drill: true },
      { vault: VAULT_B, owner: OWNER, drill: false },
    ]);
    expect(await store.dueVaults(T0 + 10n, 10)).toEqual([VAULT_B, VAULT_A]);
    expect(await store.dueVaults(T0 + 10n, 1)).toEqual([VAULT_B]);
    expect(await store.dueVaults(T0 + 10n, 0)).toEqual([]);
  });

  it('commits the cursor, the counters and the summary in one batch', async () => {
    expect(await store.getCursor()).toBeNull();
    expect(await store.getCounters()).toEqual({ aliveEvents: 0, alarms: 0, releases: 0, distributions: 0 });
    const summary = {
      updatedAt: '2027-01-15T08:00:00.000Z',
      stats: { fromBlock: '100', toBlock: '200', vaults: { total: 1, drill: 1, paid: 0 }, owners: 1, checkIns: 0, alarms: 0, releases: 0, distributions: 0 },
    };
    await store.commitCursor({ cursor: 200n, counters: { aliveEvents: 1, alarms: 0, releases: 0, distributions: 0 }, summary });
    expect(budget.queries).toBe(3);
    expect(await store.getCursor()).toBe(200n);
    expect((await store.getCounters()).aliveEvents).toBe(1);
    expect(await store.getSummary()).toEqual(summary);
  });

  it('records keeper outcomes: next_check_at for every vault, keeper_log only for sent transactions', async () => {
    await store.applyVault({ created: { vault: VAULT_A, owner: OWNER, drill: true, createdBlock: 110n }, view: viewOf(VAULT_A), claims: [] });
    await store.applyVault({ created: { vault: VAULT_B, owner: OWNER, drill: true, createdBlock: 111n }, view: viewOf(VAULT_B), claims: [] });
    const status: KeeperStatus = { ranAt: '2027-01-15T08:05:00.000Z', address: OWNER, balance: '1', dryRun: false, stopped: null, sent: 1, failed: 0 };
    await store.recordKeeper({
      ranAt: T0 + 300n,
      nowMs: 1,
      status,
      entries: [
        { vault: VAULT_A, action: 'poke', status: 'sent', hash: txHash(7), nextCheckAt: T0 + 300n },
        { vault: VAULT_B, action: 'distribute', status: 'dry-run', hash: null, nextCheckAt: T0 + 400n },
      ],
    });
    expect((await store.getVault(VAULT_A))?.nextCheckAt).toBe(T0 + 300n);
    expect((await store.getVault(VAULT_B))?.nextCheckAt).toBe(T0 + 400n);
    expect(await store.keeperPokes([txHash(7), txHash(8)])).toEqual(new Set([txHash(7)]));
    expect(await store.lastDistributes([VAULT_A, VAULT_B])).toEqual(new Map());
    await store.recordKeeper({
      ranAt: T0 + 900n,
      nowMs: 2,
      status,
      entries: [{ vault: VAULT_B, action: 'distribute', status: 'sent', hash: txHash(9), nextCheckAt: T0 + 4500n }],
    });
    expect(await store.lastDistributes([VAULT_B])).toEqual(new Map([[VAULT_B, T0 + 900n]]));
    expect((await store.getMeta<KeeperStatus>('keeper'))?.value).toEqual(status);
  });

  it('takes a lease once until it expires, and only its owner releases it', async () => {
    expect(await store.acquireLease('lease:minute', 'a', 1_000, 240_000)).toBe(true);
    expect(await store.acquireLease('lease:minute', 'b', 2_000, 240_000)).toBe(false);
    await store.releaseLease('lease:minute', 'b');
    expect(await store.acquireLease('lease:minute', 'b', 3_000, 240_000)).toBe(false);
    expect(await store.acquireLease('lease:minute', 'b', 241_000, 240_000)).toBe(true);
    await store.releaseLease('lease:minute', 'b');
    expect(await store.acquireLease('lease:minute', 'c', 241_001, 240_000)).toBe(true);
  });

  it(`adds watches up to ${MAX_WATCHES_PER_CHAT} per chat, then removes them`, async () => {
    expect(await store.addWatch('c1', VAULT_A, 'owner', 1)).toBe('added');
    expect(await store.addWatch('c1', VAULT_A, 'owner', 2)).toBe('exists');
    expect(await store.addWatch('c1', VAULT_A, 'heir', 3)).toBe('added');
    for (let i = 0; i < MAX_WATCHES_PER_CHAT - 2; i++) {
      expect(await store.addWatch('c1', addr(0x100 + i), 'heir', 10 + i)).toBe('added');
    }
    expect(await store.addWatch('c1', addr(0x200), 'guardian', 99)).toBe('limit');
    expect(await store.addWatch('c1', VAULT_A, 'owner', 100)).toBe('exists');
    expect(await store.addWatch('c2', VAULT_A, 'guardian', 101)).toBe('added');
    const list = await store.listWatches('c1');
    expect(list).toHaveLength(MAX_WATCHES_PER_CHAT);
    expect(list[0]).toEqual({ chatId: 'c1', vault: VAULT_A, role: 'owner' });
    expect((await store.watchersOf([VAULT_A])).map((w) => `${w.chatId}:${w.role}`)).toEqual(['c1:owner', 'c1:heir', 'c2:guardian']);
    expect(await store.removeWatches('c1', VAULT_A)).toBe(2);
    expect(await store.removeWatches('c1')).toBe(MAX_WATCHES_PER_CHAT - 2);
    expect(await store.listWatches('c1')).toEqual([]);
  });

  it('reads and writes meta by key, by several keys and by prefix', async () => {
    await store.setMeta('alert:integrity', { active: true, sentAt: 5 }, 10);
    await store.setMetas(
      [
        ['alert:keeper-key', { active: false, sentAt: 0 }],
        ['cron', { at: 'x' }],
      ],
      12,
    );
    expect(await store.getMeta('cron')).toEqual({ value: { at: 'x' }, updatedAt: 12 });
    expect(await store.getMeta('nope')).toBeNull();
    expect([...(await store.getMetaPrefix('alert:')).keys()].sort()).toEqual(['alert:integrity', 'alert:keeper-key']);
    expect([...(await store.getMetas(['cron', 'alert:integrity', 'nope'])).keys()].sort()).toEqual(['alert:integrity', 'cron']);
  });
});
```

- [ ] **Step 6: Chạy để thấy thất bại**

Run: `npm test -w apps/worker -- store`
Expected: FAIL, không resolve được `../../src/store/d1`.

- [ ] **Step 7: Viết `store/d1.ts`**

`apps/worker/src/store/d1.ts`:

```ts
import type { Budget } from '../budget';

export interface D1RunResult {
  meta: { changes: number };
}

/** The part of D1PreparedStatement the store uses. Real D1, miniflare's D1 and scripts/lib/node-d1.ts all fit it. */
export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<D1RunResult>;
}

export interface D1Like {
  prepare(sql: string): D1PreparedLike;
  batch(statements: D1PreparedLike[]): Promise<D1RunResult[]>;
}

class MeteredStatement implements D1PreparedLike {
  constructor(
    readonly inner: D1PreparedLike,
    private readonly budget: Budget,
  ) {}

  bind(...values: unknown[]): D1PreparedLike {
    return new MeteredStatement(this.inner.bind(...values), this.budget);
  }

  first<T = Record<string, unknown>>(): Promise<T | null> {
    this.budget.countQuery();
    return this.inner.first<T>();
  }

  all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    this.budget.countQuery();
    return this.inner.all<T>();
  }

  run(): Promise<D1RunResult> {
    this.budget.countQuery();
    return this.inner.run();
  }
}

/** Counts every executed statement as one D1 query, and a whole batch as one (D1's own accounting). */
export function metered(db: D1Like, budget: Budget): D1Like {
  return {
    prepare: (sql) => new MeteredStatement(db.prepare(sql), budget),
    batch: (statements) => {
      budget.countQuery();
      return db.batch(statements.map((s) => (s instanceof MeteredStatement ? s.inner : s)));
    },
  };
}
```

- [ ] **Step 8: Viết `store/store.ts`**

`apps/worker/src/store/store.ts`:

```ts
import type { StateName } from '@atropyle/sdk';
import type { Address, Hex } from 'viem';
import type {
  CreatedVaultRow,
  EventKey,
  KeeperEntry,
  KeeperStatus,
  KnownVault,
  StatsCounters,
  StatsSummary,
  VaultRow,
  VaultView,
  Watcher,
  WatchRole,
} from '../types';
import type { D1Like, D1PreparedLike } from './d1';

export const MAX_WATCHES_PER_CHAT = 20;
const CURSOR = 'events';
const COUNTER_KEYS = ['aliveEvents', 'alarms', 'releases', 'distributions'] as const;

const lower = (a: string): string => a.toLowerCase();
const big = (v: number | null): bigint | null => (v === null ? null : BigInt(v));
const num = (v: bigint | null): number | null => (v === null ? null : Number(v));
const json = (values: readonly string[]): string => JSON.stringify([...new Set(values.map(lower))]);

export function eventKey(k: EventKey): string {
  return `${k.transactionHash.toLowerCase()}:${k.logIndex}`;
}

interface VaultDbRow {
  address: string;
  owner: string;
  drill: number;
  created_block: number;
  next_check_at: number | null;
  state: string | null;
  last_alive: number | null;
  late_at: number | null;
  window_ends_at: number | null;
  expires_at: number | null;
  recovery_target: string | null;
  refreshed_block: number | null;
}

function toVaultRow(r: VaultDbRow): VaultRow {
  return {
    address: r.address as Address,
    owner: r.owner as Address,
    drill: r.drill === 1,
    createdBlock: BigInt(r.created_block),
    nextCheckAt: big(r.next_check_at),
    state: r.state as StateName | null,
    lastAlive: big(r.last_alive),
    lateAt: big(r.late_at),
    windowEndsAt: big(r.window_ends_at),
    expiresAt: big(r.expires_at),
    recoveryTarget: r.recovery_target as Address | null,
    refreshedBlock: big(r.refreshed_block),
  };
}

/** Every SQL statement of the Worker. Addresses are stored and returned lowercase. */
export class Store {
  constructor(readonly db: D1Like) {}

  // --- cursor and stats -------------------------------------------------------------------------

  async getCursor(): Promise<bigint | null> {
    const r = await this.db.prepare('SELECT block FROM cursor WHERE name = ?1').bind(CURSOR).first<{ block: number }>();
    return r ? BigInt(r.block) : null;
  }

  async getCounters(): Promise<StatsCounters> {
    const { results } = await this.db
      .prepare("SELECT key, value FROM stats WHERE key IN ('aliveEvents', 'alarms', 'releases', 'distributions')")
      .all<{ key: (typeof COUNTER_KEYS)[number]; value: string }>();
    const counters: StatsCounters = { aliveEvents: 0, alarms: 0, releases: 0, distributions: 0 };
    for (const r of results) counters[r.key] = Number(r.value);
    return counters;
  }

  async getSummary(): Promise<StatsSummary | null> {
    const r = await this.db.prepare("SELECT value FROM stats WHERE key = 'summary'").first<{ value: string }>();
    return r ? (JSON.parse(r.value) as StatsSummary) : null;
  }

  /** Writes the cursor last: one batch with the counters and the public summary. */
  async commitCursor(o: { cursor: bigint; counters: StatsCounters; summary: StatsSummary }): Promise<void> {
    const put = (key: string, value: string) =>
      this.db.prepare('INSERT INTO stats (key, value) VALUES (?1, ?2) ON CONFLICT (key) DO UPDATE SET value = excluded.value').bind(key, value);
    await this.db.batch([
      ...COUNTER_KEYS.map((k) => put(k, String(o.counters[k]))),
      put('summary', JSON.stringify(o.summary)),
      this.db
        .prepare('INSERT INTO cursor (name, block) VALUES (?1, ?2) ON CONFLICT (name) DO UPDATE SET block = excluded.block')
        .bind(CURSOR, Number(o.cursor)),
    ]);
  }

  // --- vaults -----------------------------------------------------------------------------------

  async knownVaults(upTo: bigint): Promise<KnownVault[]> {
    const { results } = await this.db
      .prepare('SELECT address, owner, drill FROM vaults WHERE created_block <= ?1 ORDER BY created_block, address')
      .bind(Number(upTo))
      .all<{ address: string; owner: string; drill: number }>();
    return results.map((r) => ({ vault: r.address as Address, owner: r.owner as Address, drill: r.drill === 1 }));
  }

  async getVault(address: string): Promise<VaultRow | null> {
    const r = await this.db.prepare('SELECT * FROM vaults WHERE address = ?1').bind(lower(address)).first<VaultDbRow>();
    return r ? toVaultRow(r) : null;
  }

  async getVaults(addresses: readonly string[]): Promise<Map<string, VaultRow>> {
    const out = new Map<string, VaultRow>();
    if (addresses.length === 0) return out;
    const { results } = await this.db
      .prepare('SELECT * FROM vaults WHERE address IN (SELECT value FROM json_each(?1))')
      .bind(json(addresses))
      .all<VaultDbRow>();
    for (const r of results) out.set(r.address, toVaultRow(r));
    return out;
  }

  async dueVaults(now: bigint, limit: number): Promise<Address[]> {
    if (limit <= 0) return [];
    const { results } = await this.db
      .prepare('SELECT address FROM vaults WHERE next_check_at IS NOT NULL AND next_check_at <= ?1 ORDER BY next_check_at, address LIMIT ?2')
      .bind(Number(now), limit)
      .all<{ address: string }>();
    return results.map((r) => r.address as Address);
  }

  /**
   * One batch per vault: insert it if new, save its view, and claim its events.
   * Returns one flag per claim: true when this call claimed the event, false when it was already in `seen`.
   */
  async applyVault(o: { created: CreatedVaultRow | null; view: VaultView | null; claims: readonly EventKey[] }): Promise<boolean[]> {
    const statements: D1PreparedLike[] = [];
    if (o.created) {
      statements.push(
        this.db
          .prepare('INSERT OR IGNORE INTO vaults (address, owner, drill, created_block) VALUES (?1, ?2, ?3, ?4)')
          .bind(lower(o.created.vault), lower(o.created.owner), o.created.drill ? 1 : 0, Number(o.created.createdBlock)),
      );
    }
    if (o.view) statements.push(this.saveView(o.view));
    const first = statements.length;
    for (const k of o.claims) {
      statements.push(this.db.prepare('INSERT OR IGNORE INTO seen (tx_hash, log_index) VALUES (?1, ?2)').bind(lower(k.transactionHash), k.logIndex));
    }
    if (statements.length === 0) return [];
    const results = await this.db.batch(statements);
    return results.slice(first).map((r) => r.meta.changes === 1);
  }

  private saveView(v: VaultView): D1PreparedLike {
    return this.db
      .prepare(
        'UPDATE vaults SET state = ?2, last_alive = ?3, late_at = ?4, window_ends_at = ?5, expires_at = ?6, recovery_target = ?7, next_check_at = ?8, refreshed_block = ?9 WHERE address = ?1',
      )
      .bind(
        lower(v.vault),
        v.state,
        Number(v.lastAlive),
        Number(v.lateAt),
        num(v.windowEndsAt),
        num(v.expiresAt),
        v.recoveryTarget ? lower(v.recoveryTarget) : null,
        num(v.nextCheckAt),
        Number(v.blockNumber),
      );
  }

  // --- batched reads for the cron ---------------------------------------------------------------

  async seenKeys(keys: readonly EventKey[]): Promise<Set<string>> {
    if (keys.length === 0) return new Set();
    const { results } = await this.db
      .prepare('SELECT tx_hash, log_index FROM seen WHERE tx_hash IN (SELECT value FROM json_each(?1))')
      .bind(json(keys.map((k) => k.transactionHash)))
      .all<{ tx_hash: string; log_index: number }>();
    return new Set(results.map((r) => eventKey({ transactionHash: r.tx_hash as Hex, logIndex: r.log_index })));
  }

  async watchersOf(vaults: readonly string[]): Promise<Watcher[]> {
    if (vaults.length === 0) return [];
    const { results } = await this.db
      .prepare('SELECT chat_id, vault, role FROM watch WHERE vault IN (SELECT value FROM json_each(?1)) ORDER BY created_at, chat_id, role')
      .bind(json(vaults))
      .all<{ chat_id: string; vault: string; role: WatchRole }>();
    return results.map((r) => ({ chatId: r.chat_id, vault: r.vault as Address, role: r.role }));
  }

  /** Chain time of the last distribute the keeper sent, per vault (lowercase keys). */
  async lastDistributes(vaults: readonly string[]): Promise<Map<string, bigint>> {
    const out = new Map<string, bigint>();
    if (vaults.length === 0) return out;
    const { results } = await this.db
      .prepare("SELECT vault, MAX(at) AS at FROM keeper_log WHERE action = 'distribute' AND vault IN (SELECT value FROM json_each(?1)) GROUP BY vault")
      .bind(json(vaults))
      .all<{ vault: string; at: number }>();
    for (const r of results) out.set(r.vault, BigInt(r.at));
    return out;
  }

  /** Which of these transaction hashes are pokes sent by our keeper (lowercase hashes). */
  async keeperPokes(hashes: readonly string[]): Promise<Set<string>> {
    if (hashes.length === 0) return new Set();
    const { results } = await this.db
      .prepare("SELECT tx_hash FROM keeper_log WHERE action = 'poke' AND tx_hash IN (SELECT value FROM json_each(?1))")
      .bind(json(hashes))
      .all<{ tx_hash: string }>();
    return new Set(results.map((r) => r.tx_hash));
  }

  // --- keeper -----------------------------------------------------------------------------------

  async recordKeeper(o: { ranAt: bigint; entries: readonly KeeperEntry[]; status: KeeperStatus; nowMs: number }): Promise<void> {
    const statements: D1PreparedLike[] = [];
    for (const e of o.entries) {
      statements.push(this.db.prepare('UPDATE vaults SET next_check_at = ?2 WHERE address = ?1').bind(lower(e.vault), num(e.nextCheckAt)));
      if (e.status === 'sent' && e.hash && e.action) {
        statements.push(
          this.db
            .prepare('INSERT OR IGNORE INTO keeper_log (vault, action, tx_hash, at) VALUES (?1, ?2, ?3, ?4)')
            .bind(lower(e.vault), e.action, lower(e.hash), Number(o.ranAt)),
        );
      }
    }
    statements.push(this.metaStatement('keeper', o.status, o.nowMs));
    await this.db.batch(statements);
  }

  // --- watch ------------------------------------------------------------------------------------

  async addWatch(chatId: string, vault: string, role: WatchRole, nowMs: number): Promise<'added' | 'exists' | 'limit'> {
    const r = await this.db
      .prepare(
        'INSERT OR IGNORE INTO watch (chat_id, vault, role, created_at) SELECT ?1, ?2, ?3, ?4 WHERE (SELECT COUNT(*) FROM watch WHERE chat_id = ?1) < ?5',
      )
      .bind(chatId, lower(vault), role, nowMs, MAX_WATCHES_PER_CHAT)
      .run();
    if (r.meta.changes === 1) return 'added';
    const exists = await this.db
      .prepare('SELECT 1 AS found FROM watch WHERE chat_id = ?1 AND vault = ?2 AND role = ?3')
      .bind(chatId, lower(vault), role)
      .first();
    return exists ? 'exists' : 'limit';
  }

  async listWatches(chatId: string): Promise<Watcher[]> {
    const { results } = await this.db
      .prepare('SELECT chat_id, vault, role FROM watch WHERE chat_id = ?1 ORDER BY created_at, vault, role')
      .bind(chatId)
      .all<{ chat_id: string; vault: string; role: WatchRole }>();
    return results.map((r) => ({ chatId: r.chat_id, vault: r.vault as Address, role: r.role }));
  }

  async removeWatches(chatId: string, vault?: string): Promise<number> {
    const r = vault
      ? await this.db.prepare('DELETE FROM watch WHERE chat_id = ?1 AND vault = ?2').bind(chatId, lower(vault)).run()
      : await this.db.prepare('DELETE FROM watch WHERE chat_id = ?1').bind(chatId).run();
    return r.meta.changes;
  }

  // --- meta -------------------------------------------------------------------------------------

  private metaStatement(key: string, value: unknown, nowMs: number): D1PreparedLike {
    return this.db
      .prepare(
        'INSERT INTO meta (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      )
      .bind(key, JSON.stringify(value), nowMs);
  }

  async setMeta(key: string, value: unknown, nowMs: number): Promise<void> {
    await this.metaStatement(key, value, nowMs).run();
  }

  async setMetas(entries: readonly [string, unknown][], nowMs: number): Promise<void> {
    if (entries.length === 0) return;
    await this.db.batch(entries.map(([key, value]) => this.metaStatement(key, value, nowMs)));
  }

  async getMeta<T>(key: string): Promise<{ value: T; updatedAt: number } | null> {
    const r = await this.db.prepare('SELECT value, updated_at FROM meta WHERE key = ?1').bind(key).first<{ value: string; updated_at: number }>();
    return r ? { value: JSON.parse(r.value) as T, updatedAt: r.updated_at } : null;
  }

  async getMetas<T = unknown>(keys: readonly string[]): Promise<Map<string, { value: T; updatedAt: number }>> {
    const { results } = await this.db
      .prepare('SELECT key, value, updated_at FROM meta WHERE key IN (SELECT value FROM json_each(?1))')
      .bind(JSON.stringify(keys))
      .all<{ key: string; value: string; updated_at: number }>();
    return new Map(results.map((r) => [r.key, { value: JSON.parse(r.value) as T, updatedAt: r.updated_at }]));
  }

  async getMetaPrefix<T>(prefix: string): Promise<Map<string, { value: T; updatedAt: number }>> {
    const { results } = await this.db
      .prepare('SELECT key, value, updated_at FROM meta WHERE substr(key, 1, length(?1)) = ?1')
      .bind(prefix)
      .all<{ key: string; value: string; updated_at: number }>();
    return new Map(results.map((r) => [r.key, { value: JSON.parse(r.value) as T, updatedAt: r.updated_at }]));
  }

  // --- lease ------------------------------------------------------------------------------------

  /** Takes the lease when it is free or older than ttlMs. One statement, so two runs cannot both win. */
  async acquireLease(name: string, owner: string, nowMs: number, ttlMs: number): Promise<boolean> {
    const r = await this.db
      .prepare(
        'INSERT INTO meta (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE meta.updated_at <= ?4',
      )
      .bind(name, JSON.stringify(owner), nowMs, nowMs - ttlMs)
      .run();
    return r.meta.changes === 1;
  }

  async releaseLease(name: string, owner: string): Promise<void> {
    await this.db.prepare('DELETE FROM meta WHERE key = ?1 AND value = ?2').bind(name, JSON.stringify(owner)).run();
  }
}
```

Ghi chú cho người thực thi:
- `json_each` có sẵn trong D1 và trong SQLite của Node (JSON1). Mỗi danh sách chỉ bind một tham số, nên không chạm giới hạn 100 tham số của D1.
- `?NNN` là cú pháp tham số có số thứ tự của SQLite, mà D1 và `node:sqlite` đều hỗ trợ. Một tham số dùng được nhiều lần trong câu lệnh.
- `commitCursor` đặt lệnh ghi cursor ở cuối batch. Cả batch là một transaction, nên thứ tự ở đây chỉ để dễ đọc.

- [ ] **Step 9: Chạy test `Store`**

Run: `npm test -w apps/worker -- store`
Expected: 7 test PASS.

- [ ] **Step 10: Kiểm toàn bộ và commit**

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker`
Expected: mọi test PASS (migrations, foundation, store); `tsc` và Biome sạch.

```bash
git add apps/worker/src/config.ts apps/worker/src/clock.ts apps/worker/src/log.ts apps/worker/src/budget.ts apps/worker/src/types.ts apps/worker/src/store/d1.ts apps/worker/src/store/store.ts apps/worker/test/workers/fixtures.ts apps/worker/test/workers/foundation.test.ts apps/worker/test/workers/store.test.ts
git commit -m "feat(worker): config, logging, budget and the D1 store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Adapter chain — `ChainPort`, transport có đếm, ví keeper, và test trên devnet

**Files:**
- Create: `apps/worker/src/chain/port.ts`, `apps/worker/src/chain/wallet.ts`, `apps/worker/src/chain/sdk.ts`
- Create: `apps/worker/scripts/lib/devnet.ts`
- Create: `apps/worker/vitest.devnet.config.ts`, `apps/worker/test/devnet/global-setup.ts`, `apps/worker/test/devnet/helpers.ts`
- Test: `apps/worker/test/workers/chain.test.ts` (workerd), `apps/worker/test/devnet/chain.test.ts` (Node + anvil)

**Interfaces:**
- Consumes:
  - SDK: `createAtropyle`, `getDeployment`, `parseDeployment`, `chainOf`, `planKeeperActions`, `keeperTick`, `timelineOf`, `sameAddress`, `decodeError`; kiểu `AtropyleOptions`, `ChainName`, `Deployment`, `ScanCursor`, `ScanResult`, `Stats`, `StatsCursor`, `KeeperReport`, `IntegrityReport`.
  - Plan 2 Task 6: `scripts/lib/anvil.ts` (`ANVIL_ACCOUNTS`, `rpc`, `startAnvil`, `deployLocal`, `increaseTime`).
  - Task 2: `Budget`, `VaultView`, `KeeperIdentity`.
- Produces:
  - **`chain/port.ts`:**
    - `interface RpcProbe { url: string; ok: boolean; ms: number | null; head: bigint | null }`
    - `interface KeeperRunOptions { maxTx: number; lastDistributeAt(vault: Address): bigint | null }`
    - `interface ChainPort`:
      - `readonly factoryBlock: bigint`, `readonly keeper: KeeperIdentity`
      - `scan(resume: ScanCursor | null, maxBlocks: number): Promise<ScanResult>`
      - `stats(resume: StatsCursor | null, toBlock: bigint): Promise<Stats>`
      - `view(vault: Address, lastDistributeAt: bigint | null): Promise<VaultView>`
      - `keeperTick(vaults: readonly Address[], o: KeeperRunOptions): Promise<KeeperReport>`
      - `integrity(): Promise<IntegrityReport>`
      - `isVault(address: Address): Promise<boolean>`
      - `probe(timeoutMs?: number): Promise<RpcProbe[]>`
  - **`chain/wallet.ts`:**
    - `interface KeeperSigner { wallet: WalletClient | null; error: 'KEEPER_KEY_INVALID' | null }`
    - `keeperWallet(key: string | undefined, chain: Chain, transport: Transport, toAccount?: (key: Hex) => Account): KeeperSigner`
  - **`chain/sdk.ts`:**
    - `countedHttp(url: string, budget: Budget, fetchFn?: typeof fetch): Transport`
    - `interface SdkTransportOptions { chain: ChainName | Deployment; budget: Budget; fetchFn?: typeof fetch }`
    - `sdkOptions(o: SdkTransportOptions): AtropyleOptions & { chain: Deployment; transport: Transport }`
    - `interface SdkChainOptions extends SdkTransportOptions { keeperKey?: string; keeperAccount?: Account | Address }`
    - `createSdkChain(o: SdkChainOptions): ChainPort`
    - `probeUrl(url: string, doFetch: typeof fetch, budget: Budget, timeoutMs: number): Promise<RpcProbe>`
  - **`scripts/lib/devnet.ts`** (chỉ Node): `DEVNET_OWNER`, `DEVNET_HEIR`, `DEVNET_GUARDIAN`, `DEVNET_KEEPER` (anvil 1, 2, 3, 7); `localDeployment(rpcUrl, raw): Deployment`; `createDrill(rpcUrl, deployment, name): Promise<Address>`; `chainNowMs(rpcUrl): Promise<number>`.
  - **`test/devnet/helpers.ts`:** `devnet(): { rpcUrl; deployment }`, `snapshotChain`, `revertChain`.

- [ ] **Step 1: Viết test chạy trong workerd (thất bại)**

`apps/worker/test/workers/chain.test.ts`:

```ts
import { chainOf, getDeployment } from '@atropyle/sdk';
import { createPublicClient, http } from 'viem';
import { describe, expect, it } from 'vitest';
import { Budget } from '../../src/budget';
import { countedHttp, createSdkChain, probeUrl } from '../../src/chain/sdk';
import { keeperWallet } from '../../src/chain/wallet';
import { OWNER } from './fixtures';

type Call = { id: number; method: string };

/** A JSON-RPC endpoint in memory: records each HTTP request (a call or a batch) and answers every call. */
function fakeRpc(seen: Call[][], answer: (method: string) => unknown = () => '0x10'): typeof fetch {
  return async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as Call | Call[];
    const calls = Array.isArray(body) ? body : [body];
    seen.push(calls);
    const out = calls.map((c) => ({ jsonrpc: '2.0', id: c.id, result: answer(c.method) }));
    return new Response(JSON.stringify(Array.isArray(body) ? out : out[0]), { headers: { 'content-type': 'application/json' } });
  };
}

const budget45 = () => new Budget({ fetches: 45, queries: 45 });

describe('keeperWallet', () => {
  const chain = chainOf(getDeployment('local'));
  const transport = http('http://127.0.0.1:1');

  it('runs dry when KEEPER_KEY is missing or blank', () => {
    expect(keeperWallet(undefined, chain, transport)).toEqual({ wallet: null, error: null });
    expect(keeperWallet('   ', chain, transport)).toEqual({ wallet: null, error: null });
  });

  it.each(['not-a-key', '0x1234', ' 0xzz '])('reports KEEPER_KEY_INVALID for %j instead of throwing', (key) => {
    expect(keeperWallet(key, chain, transport)).toEqual({ wallet: null, error: 'KEEPER_KEY_INVALID' });
  });

  it('trims the key, adds 0x, and builds the wallet from the derived account', () => {
    const seen: string[] = [];
    const signer = keeperWallet(' abcd ', chain, transport, (key) => {
      seen.push(key);
      return { address: OWNER, type: 'json-rpc' };
    });
    expect(seen).toEqual(['0xabcd']);
    expect(signer.error).toBeNull();
    expect(signer.wallet?.account?.address).toBe(OWNER);
  });
});

describe('countedHttp', () => {
  it('counts one fetch per HTTP request and batches calls made in the same tick', async () => {
    const seen: Call[][] = [];
    const budget = budget45();
    const client = createPublicClient({ transport: countedHttp('https://rpc.test', budget, fakeRpc(seen)) });
    await Promise.all([client.getBalance({ address: OWNER }), client.getTransactionCount({ address: OWNER })]);
    expect(budget.fetches).toBe(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.map((c) => c.method).sort()).toEqual(['eth_getBalance', 'eth_getTransactionCount']);
  });
});

describe('probeUrl', () => {
  it('reports the head and the latency of a healthy RPC', async () => {
    const budget = budget45();
    const r = await probeUrl('https://rpc.test', fakeRpc([], () => '0x64'), budget, 3000);
    expect(r).toMatchObject({ url: 'https://rpc.test', ok: true, head: 100n });
    expect(r.ms).toBeTypeOf('number');
    expect(budget.fetches).toBe(1);
  });

  it('marks the RPC down on an HTTP error, a JSON-RPC error and a network error', async () => {
    const http500: typeof fetch = async () => new Response('nope', { status: 500 });
    const rpcError: typeof fetch = async () =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'x' } }));
    const offline: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    for (const f of [http500, rpcError, offline]) {
      expect(await probeUrl('https://rpc.test', f, budget45(), 3000)).toEqual({ url: 'https://rpc.test', ok: false, ms: null, head: null });
    }
  });
});

describe('createSdkChain', () => {
  it('exposes the keeper identity without touching the network', () => {
    const budget = budget45();
    const noNetwork: typeof fetch = async () => {
      throw new Error('no network in this test');
    };
    expect(createSdkChain({ chain: 'local', budget, fetchFn: noNetwork }).keeper).toEqual({ address: null, error: null });
    expect(createSdkChain({ chain: 'local', budget, fetchFn: noNetwork, keeperKey: 'not-a-key' }).keeper).toEqual({
      address: null,
      error: 'KEEPER_KEY_INVALID',
    });
    expect(createSdkChain({ chain: 'local', budget, fetchFn: noNetwork, keeperAccount: OWNER }).keeper).toEqual({
      address: OWNER,
      error: null,
    });
    expect(budget.fetches).toBe(0);
  });
});
```

Các khoá trong test (`not-a-key`, `0x1234`, `0xzz`, `abcd`) cố ý sai dạng. Không file nào trong repo chứa private key (Global Constraints).

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npm test -w apps/worker -- chain`
Expected: FAIL, không resolve được `../../src/chain/sdk`.

- [ ] **Step 3: Viết `port.ts` và `wallet.ts`**

`apps/worker/src/chain/port.ts`:

```ts
import type { IntegrityReport, KeeperReport, ScanCursor, ScanResult, Stats, StatsCursor } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { KeeperIdentity, VaultView } from '../types';

export interface RpcProbe {
  url: string;
  ok: boolean;
  ms: number | null;
  head: bigint | null;
}

export interface KeeperRunOptions {
  maxTx: number;
  lastDistributeAt(vault: Address): bigint | null;
}

/** Everything the cron, the bot and the routes need from X Layer. createSdkChain is the real one; tests use a fake. */
export interface ChainPort {
  readonly factoryBlock: bigint;
  readonly keeper: KeeperIdentity;
  scan(resume: ScanCursor | null, maxBlocks: number): Promise<ScanResult>;
  stats(resume: StatsCursor | null, toBlock: bigint): Promise<Stats>;
  view(vault: Address, lastDistributeAt: bigint | null): Promise<VaultView>;
  keeperTick(vaults: readonly Address[], o: KeeperRunOptions): Promise<KeeperReport>;
  integrity(): Promise<IntegrityReport>;
  isVault(address: Address): Promise<boolean>;
  probe(timeoutMs?: number): Promise<RpcProbe[]>;
}
```

`apps/worker/src/chain/wallet.ts`:

```ts
import { type Account, type Chain, createWalletClient, type Hex, type Transport, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export interface KeeperSigner {
  wallet: WalletClient | null;
  error: 'KEEPER_KEY_INVALID' | null;
}

/**
 * Builds the keeper's gas wallet from the KEEPER_KEY secret, which the user sets with `wrangler secret put`.
 * No key means dry-run. A malformed key never throws: the keeper stays in dry-run and ops get an alert.
 * The key never leaves this function and is never logged.
 */
export function keeperWallet(
  key: string | undefined,
  chain: Chain,
  transport: Transport,
  toAccount: (key: Hex) => Account = privateKeyToAccount,
): KeeperSigner {
  const trimmed = key?.trim() ?? '';
  if (trimmed === '') return { wallet: null, error: null };
  const hex = (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as Hex;
  try {
    return { wallet: createWalletClient({ account: toAccount(hex), chain, transport }), error: null };
  } catch {
    return { wallet: null, error: 'KEEPER_KEY_INVALID' };
  }
}
```

- [ ] **Step 4: Viết `sdk.ts`**

`apps/worker/src/chain/sdk.ts`:

```ts
import {
  type AtropyleOptions,
  type ChainName,
  createAtropyle,
  type Deployment,
  decodeError,
  getDeployment,
  keeperTick,
  planKeeperActions,
  sameAddress,
  timelineOf,
} from '@atropyle/sdk';
import { type Account, type Address, createWalletClient, fallback, http, type Transport } from 'viem';
import type { Budget } from '../budget';
import type { KeeperIdentity } from '../types';
import type { ChainPort, RpcProbe } from './port';
import { type KeeperSigner, keeperWallet } from './wallet';

/** Same settings as the SDK's httpTransport (Plan 2), plus a count of every real HTTP request. */
export function countedHttp(url: string, budget: Budget, fetchFn?: typeof fetch): Transport {
  return http(url, {
    batch: { batchSize: 20, wait: 0 },
    retryCount: 3,
    retryDelay: 400,
    timeout: 20_000,
    fetchFn,
    onFetchRequest: () => {
      budget.countFetch();
    },
  });
}

export interface SdkTransportOptions {
  chain: ChainName | Deployment;
  budget: Budget;
  fetchFn?: typeof fetch;
}

/** Options for createAtropyle whose reads and quorum reads are all counted against the budget. */
export function sdkOptions(o: SdkTransportOptions): AtropyleOptions & { chain: Deployment; transport: Transport } {
  const deployment = getDeployment(o.chain);
  return {
    chain: deployment,
    transport: fallback(deployment.rpcUrls.map((url) => countedHttp(url, o.budget, o.fetchFn))),
    verifyTransports: deployment.quorumRpcUrls.map((group) => fallback(group.map((url) => countedHttp(url, o.budget, o.fetchFn)))),
  };
}

export interface SdkChainOptions extends SdkTransportOptions {
  keeperKey?: string;
  /** Tests and local scripts only: an unlocked anvil account, used through eth_sendTransaction. */
  keeperAccount?: Account | Address;
}

export async function probeUrl(url: string, doFetch: typeof fetch, budget: Budget, timeoutMs: number): Promise<RpcProbe> {
  budget.countFetch();
  const started = Date.now();
  try {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = (await res.json()) as { result?: unknown };
    if (!res.ok || typeof body.result !== 'string') return { url, ok: false, ms: null, head: null };
    return { url, ok: true, ms: Date.now() - started, head: BigInt(body.result) };
  } catch {
    return { url, ok: false, ms: null, head: null };
  }
}

/** The real ChainPort: Plan 2's SDK with counted transports. Create one per invocation (Quyết định 16). */
export function createSdkChain(o: SdkChainOptions): ChainPort {
  const options = sdkOptions(o);
  const deployment = options.chain;
  const atro = createAtropyle(options);
  const signer: KeeperSigner = o.keeperAccount
    ? { wallet: createWalletClient({ account: o.keeperAccount, chain: atro.chain, transport: options.transport }), error: null }
    : keeperWallet(o.keeperKey, atro.chain, options.transport);
  const keeper: KeeperIdentity = { address: signer.wallet?.account?.address ?? null, error: signer.error };
  const doFetch: typeof fetch = o.fetchFn ?? ((input, init) => fetch(input, init));
  const urls = [...new Set([...deployment.rpcUrls, ...deployment.quorumRpcUrls.flat()])];

  return {
    factoryBlock: deployment.factoryBlock,
    keeper,
    scan: (resume, maxBlocks) => atro.scan(resume ? { resume, maxBlocks } : { maxBlocks }),
    stats: (resume, toBlock) => atro.stats(resume ? { resume, toBlock } : { toBlock }),
    async view(vault, lastDistributeAt) {
      // One snapshot gives both status() and timeline() (Quyết định 15).
      const snap = await atro.vault(vault).snapshot();
      const engine = await atro.engineFor(snap.binding.cpu, snap.binding.policyId);
      const s = snap.status;
      const decision = planKeeperActions(s, timelineOf(engine, snap, s.blockTimestamp), s.blockTimestamp, { lastDistributeAt });
      return {
        vault,
        state: s.state,
        lastAlive: s.lastAlive,
        lateAt: s.lateAt,
        alarmAt: s.alarmAt,
        windowEndsAt: s.windowEndsAt,
        expiresAt: s.expiresAt,
        expired: s.expired,
        recoveryTarget: s.recoveryTarget,
        nextCheckAt: decision.nextCheckAt,
        blockNumber: s.blockNumber,
        blockTimestamp: s.blockTimestamp,
      };
    },
    keeperTick: (vaults, k) =>
      keeperTick(atro, vaults, {
        wallet: signer.wallet ?? undefined,
        maxTx: k.maxTx,
        lastDistributeAt: (vault) => k.lastDistributeAt(vault),
      }),
    integrity: () => atro.integrity(),
    async isVault(address) {
      try {
        const snap = await atro.vault(address).snapshot();
        return sameAddress(snap.binding.factory, deployment.factory);
      } catch (e) {
        const err = decodeError(e);
        if (err.code === 'NOT_VAULT') return false;
        throw err;
      }
    },
    probe: (timeoutMs = 3000) => Promise.all(urls.map((url) => probeUrl(url, doFetch, o.budget, timeoutMs))),
  };
}
```

Ghi chú cho người thực thi:
- `keeperTick` mặc định của SDK (`maxGas`, `minBalance` 0,005 OKB) giữ nguyên, đúng giới hạn an toàn của spec §9.4.
- `builderCode` không truyền, nên giao dịch của keeper mang Builder Code mặc định của deployment (spec §11.4).
- `isVault` chỉ nhận vault do **chính** factory của deployment tạo. Lỗi transport được ném tiếp, không bị đổi thành `false` (Plan 2: `isTransportError`).

- [ ] **Step 5: Chạy test workerd**

Run: `npm test -w apps/worker -- chain`
Expected: 9 test PASS (5 của `keeperWallet`, gồm 3 ca `it.each`; 1 `countedHttp`; 2 `probeUrl`; 1 `createSdkChain`). Không test nào gọi mạng thật.

- [ ] **Step 6: Viết helper devnet và cấu hình test Node**

`apps/worker/scripts/lib/devnet.ts`:

```ts
// Devnet helpers shared by the worker's Node tests and scripts.
// Every transaction goes through an unlocked anvil account (eth_sendTransaction); no private key is involved.
import { createAtropyle, type Deployment, parseDeployment } from '@atropyle/sdk';
import { type Address, createWalletClient, http, keccak256, toHex } from 'viem';
import { ANVIL_ACCOUNTS, rpc } from '../../../../scripts/lib/anvil';

export const DEVNET_OWNER = ANVIL_ACCOUNTS[1] as Address;
export const DEVNET_HEIR = ANVIL_ACCOUNTS[2] as Address;
export const DEVNET_GUARDIAN = ANVIL_ACCOUNTS[3] as Address;
export const DEVNET_KEEPER = ANVIL_ACCOUNTS[7] as Address;

/** The local deployment pointed at this anvil, with two quorum groups so integrity() sees two "operators". */
export function localDeployment(rpcUrl: string, raw: unknown): Deployment {
  return { ...parseDeployment(raw), rpcUrls: [rpcUrl], quorumRpcUrls: [[rpcUrl], [rpcUrl]] };
}

/** A Drill vault: owner anvil 1, one heir (anvil 2), the mock USDT0 as its only asset, drill timing 60 s × 2 / 120 s. */
export async function createDrill(rpcUrl: string, deployment: Deployment, name: string): Promise<Address> {
  const atro = createAtropyle({ chain: deployment, builderCode: null });
  const [usdt0] = deployment.feeTokens;
  if (!usdt0) throw new Error('the local deployment has no fee tokens');
  const plan = await atro.prepare.createVault(
    atro.plan.template('simple', { heirs: [{ account: DEVNET_HEIR }], drill: true, assets: [{ kind: 'erc20', token: usdt0 }] }),
    { owner: DEVNET_OWNER, drill: true, salt: keccak256(toHex(`worker:${name}`)) },
  );
  await atro.send(plan, createWalletClient({ account: DEVNET_OWNER, chain: atro.chain, transport: http(rpcUrl) }));
  return plan.vault;
}

/** Timestamp of the latest block, in milliseconds: the cron's clock on the devnet follows chain time. */
export async function chainNowMs(rpcUrl: string): Promise<number> {
  const block = (await rpc(rpcUrl, 'eth_getBlockByNumber', ['latest', false])) as { timestamp: string };
  return Number(BigInt(block.timestamp)) * 1000;
}
```

`apps/worker/vitest.devnet.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/devnet/**/*.test.ts'],
    globalSetup: ['test/devnet/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
```

`apps/worker/test/devnet/global-setup.ts`:

```ts
import type { TestProject } from 'vitest/node';
import { deployLocal, startAnvil } from '../../../../scripts/lib/anvil';

declare module 'vitest' {
  export interface ProvidedContext {
    rpcUrl: string;
    deployment: Record<string, unknown>;
  }
}

export default async function setup(project: TestProject) {
  const anvil = await startAnvil();
  const deployment = await deployLocal(anvil.url);
  project.provide('rpcUrl', anvil.url);
  project.provide('deployment', deployment);
  return () => anvil.stop();
}
```

`apps/worker/test/devnet/helpers.ts`:

```ts
import type { Deployment } from '@atropyle/sdk';
import type { Hex } from 'viem';
import { inject } from 'vitest';
import { rpc } from '../../../../scripts/lib/anvil';
import { localDeployment } from '../../scripts/lib/devnet';

export function devnet(): { rpcUrl: string; deployment: Deployment } {
  const rpcUrl = inject('rpcUrl');
  return { rpcUrl, deployment: localDeployment(rpcUrl, inject('deployment')) };
}

export async function snapshotChain(rpcUrl: string): Promise<Hex> {
  return (await rpc(rpcUrl, 'evm_snapshot')) as Hex;
}

export async function revertChain(rpcUrl: string, id: Hex): Promise<void> {
  await rpc(rpcUrl, 'evm_revert', [id]);
}
```

- [ ] **Step 7: Viết test devnet của adapter (thất bại cho tới khi Step 4 xong)**

`apps/worker/test/devnet/chain.test.ts`:

```ts
import { sameAddress } from '@atropyle/sdk';
import type { Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { increaseTime } from '../../../../scripts/lib/anvil';
import { createDrill, DEVNET_OWNER } from '../../scripts/lib/devnet';
import { Budget } from '../../src/budget';
import { createSdkChain } from '../../src/chain/sdk';
import { devnet, revertChain, snapshotChain } from './helpers';

const bigBudget = () => new Budget({ fetches: 10_000, queries: 10_000 });

describe('createSdkChain on the devnet', () => {
  const env = devnet();
  let id: Hex;
  beforeEach(async () => {
    id = await snapshotChain(env.rpcUrl);
  });
  afterEach(async () => {
    await revertChain(env.rpcUrl, id);
  });

  it('scans, counts, views and recognises a new Drill vault, counting every fetch', async () => {
    const vault = await createDrill(env.rpcUrl, env.deployment, 'chain-scan');
    const budget = bigBudget();
    const chain = createSdkChain({ chain: env.deployment, budget });
    const scan = await chain.scan(null, 100_000);
    expect(scan.created.map((c) => c.vault)).toContain(vault);
    expect(scan.events.some((e) => sameAddress(e.address, vault) && e.name === 'Alive')).toBe(true);
    const stats = await chain.stats(null, scan.toBlock);
    expect(stats.toBlock).toBe(scan.toBlock);
    expect(stats.vaults.drill).toBeGreaterThanOrEqual(1);
    const view = await chain.view(vault, null);
    expect(view.state).toBe('active');
    expect(view.nextCheckAt).toBe(view.lateAt);
    expect(await chain.isVault(vault)).toBe(true);
    expect(await chain.isVault(DEVNET_OWNER)).toBe(false);
    expect(budget.fetches).toBeGreaterThan(0);
  });

  it('stops stats at the requested block even when the chain is ahead (gap G1)', async () => {
    const vault = await createDrill(env.rpcUrl, env.deployment, 'chain-g1');
    const chain = createSdkChain({ chain: env.deployment, budget: bigBudget() });
    const scan = await chain.scan(null, 100_000);
    const created = scan.created.find((c) => sameAddress(c.vault, vault));
    expect(created).toBeDefined();
    const at = created?.blockNumber ?? 0n;
    const before = await chain.stats(null, at - 1n);
    const after = await chain.stats(null, at);
    expect(before.toBlock).toBe(at - 1n);
    expect(after.vaults.total).toBe(before.vaults.total + 1);
  });

  it('passes integrity with two quorum groups, and the keeper runs dry without a key', async () => {
    const vault = await createDrill(env.rpcUrl, env.deployment, 'chain-keeper');
    const chain = createSdkChain({ chain: env.deployment, budget: bigBudget() });
    const report = await chain.integrity();
    expect(report.ok).toBe(true);
    expect(report.rpcs).toBe(2);
    const idle = await chain.keeperTick([vault], { maxTx: 1, lastDistributeAt: () => null });
    expect(idle).toMatchObject({ dryRun: true, keeper: null, sent: 0 });
    expect(idle.outcomes[0]).toMatchObject({ status: 'idle', decision: { reason: 'WAITING' } });
    await increaseTime(env.rpcUrl, 125);
    const due = await chain.keeperTick([vault], { maxTx: 1, lastDistributeAt: () => null });
    expect(due.outcomes[0]).toMatchObject({ status: 'dry-run', decision: { action: 'poke', reason: 'TRANSITION_DUE' } });
  });
});
```

- [ ] **Step 8: Chạy test devnet**

Run: `(cd contracts && forge build) && npm run test:devnet -w apps/worker`
Expected: 3 test PASS. `globalSetup` khởi động anvil ở một cổng trống và deploy `DeployLocal.s.sol`.

Muốn thấy test bắt lỗi thì tạm sửa `stats` trong `sdk.ts` thành `atro.stats(resume ? { resume } : {})` (bỏ `toBlock`). Test "stops stats at the requested block…" sẽ FAIL vì `before.toBlock` là block mới nhất. Trả lại như cũ thì test PASS.

- [ ] **Step 9: Kiểm toàn bộ và commit**

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker`
Expected: mọi test PASS; `tsc` (cả hai tsconfig) và Biome sạch.

```bash
git add apps/worker/src/chain/port.ts apps/worker/src/chain/wallet.ts apps/worker/src/chain/sdk.ts apps/worker/scripts/lib/devnet.ts apps/worker/vitest.devnet.config.ts apps/worker/test/devnet/global-setup.ts apps/worker/test/devnet/helpers.ts apps/worker/test/devnet/chain.test.ts apps/worker/test/workers/chain.test.ts
git commit -m "feat(worker): SDK-backed chain port with counted transports and the keeper wallet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Telegram — client gửi tin và mẫu thông báo

**Files:**
- Create: `apps/worker/src/telegram/client.ts`, `apps/worker/src/telegram/messages.ts`
- Modify: `apps/worker/test/workers/fixtures.ts` (thêm `ev`)
- Test: `apps/worker/test/workers/telegram.test.ts`

**Interfaces:**
- Consumes:
  - SDK: `toAddress`, kiểu `VaultEvent`.
  - Task 2: `Budget`, `Logger`, `errorFields`, `VaultView`, `Watcher`, `WatchRole`.
- Produces:
  - **`telegram/client.ts`:**
    - `interface SendOutcome { ok: boolean; blocked: boolean; status: number }`
    - `interface Notifier { send(chatId: string, text: string): Promise<SendOutcome> }`
    - `TELEGRAM_API`, `MAX_TEXT = 4096`, `MAX_RETRY_AFTER_SEC = 3`
    - `interface TelegramOptions { token: string | undefined; budget: Budget; log: Logger; fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void> }`
    - `telegramNotifier(o: TelegramOptions): Notifier`
  - **`telegram/messages.ts`:**
    - `interface Notice { role: WatchRole; text: string }`
    - `interface NoticeContext { webUrl: string; keeperPokes: ReadonlySet<string> }`
    - `interface Delivery { chatId: string; text: string }`
    - `LATE_BLOCKS = 600n`
    - `formatTime(t: bigint | null): string`, ra dạng `YYYY-MM-DD HH:MM UTC`
    - `vaultLink(webUrl, vault): string` → `${webUrl}#/v/<vault chữ thường>`; `verifyLink(webUrl, vault)` → `…/verify`
    - `showAddress(a: unknown): string`, ra dạng checksum
    - `noticesFor(e: VaultEvent, view: VaultView | null, ctx: NoticeContext): Notice[]`
    - `deliveries(notices: readonly Notice[], watchers: readonly Watcher[]): Delivery[]`
  - **`fixtures.ts`:** thêm `ev(vault, name, block, args?, tx?): VaultEvent`.

- [ ] **Step 1: Thêm `ev` vào fixtures**

Thêm vào cuối `apps/worker/test/workers/fixtures.ts`, và thêm `import type { VaultEvent } from '@atropyle/sdk';` vào đầu file:

```ts
let logIndex = 0;

/** A vault event as scan() returns it. Each call gets a fresh logIndex and, unless given, a fresh transaction hash. */
export function ev(vault: Address, name: string, block: bigint, args: Record<string, unknown> = {}, tx?: Hex): VaultEvent {
  logIndex += 1;
  return { address: vault, name, args, blockNumber: block, logIndex, transactionHash: tx ?? txHash(1_000_000 + logIndex) };
}
```

- [ ] **Step 2: Viết test (thất bại)**

`apps/worker/test/workers/telegram.test.ts`:

```ts
import { getAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { Budget } from '../../src/budget';
import { createLogger } from '../../src/log';
import { telegramNotifier } from '../../src/telegram/client';
import { deliveries, formatTime, noticesFor, showAddress, vaultLink } from '../../src/telegram/messages';
import { ev, GUARDIAN, HEIR, OWNER, T0, txHash, VAULT_A, viewOf } from './fixtures';

const WEB = 'https://web.test/';
const ctx = (pokes: string[] = []) => ({ webUrl: WEB, keeperPokes: new Set(pokes) });
const V = showAddress(VAULT_A);
const LINK = vaultLink(WEB, VAULT_A);

describe('formatting', () => {
  it('prints chain time in UTC to the minute, and links to the vault page in lowercase', () => {
    expect(formatTime(T0)).toBe('2027-01-15 08:00 UTC');
    expect(formatTime(null)).toBe('an unknown time');
    expect(LINK).toBe(`https://web.test/#/v/${VAULT_A}`);
    expect(V).toBe(getAddress(VAULT_A));
    expect(showAddress(VAULT_A.toUpperCase().replace('0X', '0x'))).toBe(V);
  });
});

describe('noticesFor', () => {
  const grace = viewOf(VAULT_A, { state: 'grace', alarmAt: T0, windowEndsAt: T0 + 120n, blockNumber: 210n });

  it('tells the owner the keeper raised the alarm, and when to check in', () => {
    const e = ev(VAULT_A, 'AlarmRaised', 200n, { state: 1, target: OWNER }, txHash(42));
    const [owner, guardian, heir] = noticesFor(e, grace, ctx([txHash(42)]));
    expect(owner).toEqual({
      role: 'owner',
      text: `URGENT: the inheritance alarm on vault ${V} was raised by the Atropyle keeper at 2027-01-15 08:00 UTC. Check in before 2027-01-15 08:02 UTC to cancel it.\n${LINK}`,
    });
    expect(guardian?.role).toBe('guardian');
    expect(heir).toEqual({
      role: 'heir',
      text: `The inheritance alarm on vault ${V} was raised by the Atropyle keeper at 2027-01-15 08:00 UTC. If the owner does not check in before 2027-01-15 08:02 UTC, the vault releases to the heirs.\n${LINK}`,
    });
  });

  it('uses the plain wording when someone else raised the alarm', () => {
    const [owner] = noticesFor(ev(VAULT_A, 'AlarmRaised', 200n, { state: 1, target: OWNER }), grace, ctx());
    expect(owner?.text).toContain(`was raised at 2027-01-15 08:00 UTC. Check in before 2027-01-15 08:02 UTC to cancel it.`);
    expect(owner?.text).not.toContain('keeper');
  });

  it('warns the owner and informs guardians about a recovery, not the heirs', () => {
    const target = showAddress(HEIR);
    const n = noticesFor(ev(VAULT_A, 'AlarmRaised', 200n, { state: 3, target: HEIR }), { ...grace, state: 'recovery' }, ctx());
    expect(n.map((x) => x.role)).toEqual(['owner', 'guardian']);
    expect(n[0]?.text).toBe(
      `URGENT: guardians started a recovery of vault ${V} to ${target}. If you did not ask for this, check in before 2027-01-15 08:02 UTC to cancel it.\n${LINK}`,
    );
  });

  it('routes the other events to the right roles', () => {
    const roles = (name: string, args: Record<string, unknown>) => noticesFor(ev(VAULT_A, name, 200n, args), grace, ctx()).map((x) => x.role);
    expect(roles('AlarmCancelled', { byOwner: true })).toEqual(['guardian', 'heir']);
    expect(roles('AlarmCancelled', { byOwner: false })).toEqual(['owner', 'guardian', 'heir']);
    expect(roles('RecoveryVoted', { guardian: GUARDIAN, target: HEIR })).toEqual(['owner']);
    expect(roles('Attested', { guardian: GUARDIAN, on: true })).toEqual(['owner']);
    expect(roles('Released', { state: 5, target: OWNER })).toEqual(['heir', 'guardian']);
    expect(roles('Released', { state: 7, target: HEIR })).toEqual(['owner', 'guardian']);
    expect(roles('Alive', { at: 1n })).toEqual([]);
    expect(roles('Distributed', { assetIndex: 0n, to: HEIR, amountOrId: 1n })).toEqual([]);
  });

  it('says when a guardian withdraws a recovery vote', () => {
    const [n] = noticesFor(ev(VAULT_A, 'RecoveryVoted', 200n, { guardian: GUARDIAN, target: `0x${'0'.repeat(40)}` }), grace, ctx());
    expect(n?.text).toBe(`Guardian ${showAddress(GUARDIAN)} withdrew their recovery vote on vault ${V}.\n${LINK}`);
  });

  it('marks notices about old blocks as delayed', () => {
    const [n] = noticesFor(ev(VAULT_A, 'Released', 100n, { state: 5, target: OWNER }), { ...grace, blockNumber: 701n }, ctx());
    expect(n?.text.startsWith('Delayed notice from block 100. Vault ')).toBe(true);
  });
});

describe('deliveries', () => {
  it('sends one message per chat, choosing owner over guardian over heir', () => {
    const notices = [
      { role: 'owner' as const, text: 'owner text' },
      { role: 'guardian' as const, text: 'guardian text' },
      { role: 'heir' as const, text: 'heir text' },
    ];
    const watchers = [
      { chatId: 'both', vault: VAULT_A, role: 'heir' as const },
      { chatId: 'both', vault: VAULT_A, role: 'owner' as const },
      { chatId: 'h', vault: VAULT_A, role: 'heir' as const },
    ];
    expect(deliveries(notices, watchers)).toEqual([
      { chatId: 'both', text: 'owner text' },
      { chatId: 'h', text: 'heir text' },
    ]);
    expect(deliveries([{ role: 'owner', text: 'x' }], [{ chatId: 'h', vault: VAULT_A, role: 'heir' }])).toEqual([]);
  });
});

describe('telegramNotifier', () => {
  type Sent = { url: string; body: Record<string, unknown> };
  const setup = (responses: Response[], token: string | undefined = 'test-token') => {
    const sent: Sent[] = [];
    const lines: string[] = [];
    const sleeps: number[] = [];
    const budget = new Budget({ fetches: 45, queries: 45 });
    const notifier = telegramNotifier({
      token,
      budget,
      log: createLogger({}, (l) => lines.push(l)),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchFn: async (input, init) => {
        sent.push({ url: String(input), body: JSON.parse(String(init?.body)) });
        const next = responses.shift();
        if (!next) throw new TypeError('network down');
        return next;
      },
    });
    return { notifier, sent, lines, sleeps, budget };
  };
  const ok = () => new Response(JSON.stringify({ ok: true, result: {} }));

  it('posts plain text with link previews off and counts the subrequest', async () => {
    const t = setup([ok()]);
    expect(await t.notifier.send('42', 'hello')).toEqual({ ok: true, blocked: false, status: 200 });
    expect(t.sent).toEqual([
      { url: 'https://api.telegram.org/bottest-token/sendMessage', body: { chat_id: '42', text: 'hello', link_preview_options: { is_disabled: true } } },
    ]);
    expect(t.budget.fetches).toBe(1);
  });

  it('does nothing without a token', async () => {
    const t = setup([], undefined);
    expect(await t.notifier.send('42', 'hello')).toEqual({ ok: false, blocked: false, status: 0 });
    expect(t.sent).toEqual([]);
    expect(t.lines.some((l) => l.includes('telegram.disabled'))).toBe(true);
  });

  it('waits a short retry_after once, but not a long one', async () => {
    const short = setup([new Response(JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 2 } }), { status: 429 }), ok()]);
    expect((await short.notifier.send('42', 'x')).ok).toBe(true);
    expect(short.sleeps).toEqual([2000]);
    expect(short.budget.fetches).toBe(2);
    const long = setup([new Response(JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 30 } }), { status: 429 })]);
    expect(await long.notifier.send('42', 'x')).toEqual({ ok: false, blocked: false, status: 429 });
    expect(long.sleeps).toEqual([]);
  });

  it('reports a chat that blocked the bot, and never logs the token on network errors', async () => {
    const blocked = setup([new Response('{"ok":false,"error_code":403}', { status: 403 })]);
    expect(await blocked.notifier.send('42', 'x')).toEqual({ ok: false, blocked: true, status: 403 });
    const offline = setup([]);
    expect(await offline.notifier.send('42', 'x')).toEqual({ ok: false, blocked: false, status: 0 });
    expect(offline.lines.join('\n')).not.toContain('test-token');
  });
});
```

`test-token` không phải token thật, chỉ dùng để kiểm URL và kiểm rằng log không làm lộ token.

- [ ] **Step 3: Chạy để thấy thất bại**

Run: `npm test -w apps/worker -- telegram`
Expected: FAIL, không resolve được `../../src/telegram/client`.

- [ ] **Step 4: Viết `telegram/client.ts`**

`apps/worker/src/telegram/client.ts`:

```ts
import type { Budget } from '../budget';
import type { Logger } from '../log';

export interface SendOutcome {
  ok: boolean;
  blocked: boolean;
  status: number;
}

export interface Notifier {
  send(chatId: string, text: string): Promise<SendOutcome>;
}

export const TELEGRAM_API = 'https://api.telegram.org';
export const MAX_TEXT = 4096;
export const MAX_RETRY_AFTER_SEC = 3;

export interface TelegramOptions {
  token: string | undefined;
  budget: Budget;
  log: Logger;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Sends plain-text messages through the Bot API. Without TELEGRAM_TOKEN it only logs.
 * The request URL contains the token, so it is never logged; failures log the chat id and status only.
 */
export function telegramNotifier(o: TelegramOptions): Notifier {
  const token = o.token?.trim() ?? '';
  const doFetch: typeof fetch = o.fetchFn ?? ((input, init) => fetch(input, init));
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function post(chatId: string, text: string): Promise<{ status: number; retryAfter: number | null }> {
    o.budget.countFetch();
    const res = await doFetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, MAX_TEXT), link_preview_options: { is_disabled: true } }),
    });
    const body = await res.text();
    if (res.status !== 429) return { status: res.status, retryAfter: null };
    try {
      const after = (JSON.parse(body) as { parameters?: { retry_after?: unknown } }).parameters?.retry_after;
      return { status: 429, retryAfter: typeof after === 'number' ? after : null };
    } catch {
      return { status: 429, retryAfter: null };
    }
  }

  return {
    async send(chatId, text) {
      if (token === '') {
        o.log.warn('telegram.disabled', { chatId });
        return { ok: false, blocked: false, status: 0 };
      }
      try {
        let r = await post(chatId, text);
        if (r.status === 429 && r.retryAfter !== null && r.retryAfter <= MAX_RETRY_AFTER_SEC) {
          await sleep(r.retryAfter * 1000);
          r = await post(chatId, text);
        }
        if (r.status !== 200) o.log.warn('telegram.failed', { chatId, status: r.status });
        return { ok: r.status === 200, blocked: r.status === 403, status: r.status };
      } catch {
        o.log.warn('telegram.failed', { chatId, error: 'network' });
        return { ok: false, blocked: false, status: 0 };
      }
    },
  };
}
```

- [ ] **Step 5: Viết `telegram/messages.ts`**

`apps/worker/src/telegram/messages.ts`:

```ts
import { toAddress, type VaultEvent } from '@atropyle/sdk';
import type { VaultView, Watcher, WatchRole } from '../types';

export interface Notice {
  role: WatchRole;
  text: string;
}

export interface NoticeContext {
  webUrl: string;
  /** Lowercase hashes of transactions our keeper sent as poke (keeper_log). */
  keeperPokes: ReadonlySet<string>;
}

export interface Delivery {
  chatId: string;
  text: string;
}

/** About ten minutes of X Layer blocks: older events are flagged as late (the cron is catching up). */
export const LATE_BLOCKS = 600n;
const ROLE_ORDER: readonly WatchRole[] = ['owner', 'guardian', 'heir'];

export function formatTime(t: bigint | null): string {
  if (t === null) return 'an unknown time';
  return `${new Date(Number(t) * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function vaultLink(webUrl: string, vault: string): string {
  return `${webUrl}#/v/${vault.toLowerCase()}`;
}

export function verifyLink(webUrl: string, vault: string): string {
  return `${vaultLink(webUrl, vault)}/verify`;
}

/** Checksummed address for display. Never throws: a cron run must not stop on one odd event argument. */
export function showAddress(a: unknown): string {
  try {
    return toAddress(typeof a === 'string' ? a.toLowerCase() : a);
  } catch {
    return 'an unknown address';
  }
}

const isZero = (a: unknown): boolean => typeof a === 'string' && /^0x0{40}$/i.test(a);

function baseNotices(e: VaultEvent, view: VaultView | null, ctx: NoticeContext): Notice[] {
  const v = showAddress(e.address);
  const link = vaultLink(ctx.webUrl, e.address);
  const until = view?.windowEndsAt ?? null;
  const deadline = until === null ? 'now' : `before ${formatTime(until)}`;
  switch (e.name) {
    case 'AlarmRaised': {
      if (Number(e.args.state) === 3) {
        const target = showAddress(e.args.target);
        return [
          { role: 'owner', text: `URGENT: guardians started a recovery of vault ${v} to ${target}. If you did not ask for this, check in ${deadline} to cancel it.\n${link}` },
          {
            role: 'guardian',
            text: `A recovery of vault ${v} to ${target} has started. It completes ${until === null ? 'when the window ends' : `after ${formatTime(until)}`} unless the owner checks in.\n${link}`,
          },
        ];
      }
      const alarmAt = view?.alarmAt ?? null;
      const byKeeper = ctx.keeperPokes.has(e.transactionHash.toLowerCase());
      const raised = byKeeper ? ` by the Atropyle keeper at ${formatTime(alarmAt)}` : alarmAt === null ? '' : ` at ${formatTime(alarmAt)}`;
      const info = `The inheritance alarm on vault ${v} was raised${raised}. If the owner does not check in ${until === null ? 'before the window ends' : `before ${formatTime(until)}`}, the vault releases to the heirs.\n${link}`;
      return [
        { role: 'owner', text: `URGENT: the inheritance alarm on vault ${v} was raised${raised}. Check in ${deadline} to cancel it.\n${link}` },
        { role: 'guardian', text: info },
        { role: 'heir', text: info },
      ];
    }
    case 'AlarmCancelled': {
      const byOwner = e.args.byOwner === true;
      const text = `The alarm on vault ${v} was cancelled: ${byOwner ? 'the owner checked in' : 'the guardians withdrew'}. No action is needed.\n${link}`;
      return byOwner
        ? [
            { role: 'guardian', text },
            { role: 'heir', text },
          ]
        : [
            { role: 'owner', text },
            { role: 'guardian', text },
            { role: 'heir', text },
          ];
    }
    case 'RecoveryVoted': {
      const g = showAddress(e.args.guardian);
      if (isZero(e.args.target)) return [{ role: 'owner', text: `Guardian ${g} withdrew their recovery vote on vault ${v}.\n${link}` }];
      return [
        {
          role: 'owner',
          text: `Guardian ${g} voted to recover vault ${v} to ${showAddress(e.args.target)}. If you did not ask for this, check in and talk to your guardians.\n${link}`,
        },
      ];
    }
    case 'Attested': {
      const g = showAddress(e.args.guardian);
      const text =
        e.args.on === true
          ? `Guardian ${g} attested your death on vault ${v}. If you are reading this, check in now.\n${link}`
          : `Guardian ${g} withdrew their death attestation on vault ${v}.\n${link}`;
      return [{ role: 'owner', text }];
    }
    case 'Released': {
      if (Number(e.args.state) === 7) {
        const text = `Vault ${v} was recovered to ${showAddress(e.args.target)}. Assets move there when distribute() runs: the Atropyle keeper calls it, and anyone can call it from the vault page.\n${link}`;
        return [
          { role: 'owner', text },
          { role: 'guardian', text },
        ];
      }
      const text = `Vault ${v} was released to its heirs. Assets move to the heirs when distribute() runs: the Atropyle keeper calls it, and anyone can call it from the vault page.\n${link}`;
      return [
        { role: 'heir', text },
        { role: 'guardian', text },
      ];
    }
    default:
      return [];
  }
}

/** The messages an event produces, one per role (Quyết định 19). Text holds no untrusted on-chain strings. */
export function noticesFor(e: VaultEvent, view: VaultView | null, ctx: NoticeContext): Notice[] {
  const notices = baseNotices(e, view, ctx);
  if (view === null || view.blockNumber - e.blockNumber <= LATE_BLOCKS) return notices;
  return notices.map((n) => ({ role: n.role, text: `Delayed notice from block ${e.blockNumber}. ${n.text}` }));
}

/** One message per chat: the notice of the highest-priority role the chat watches (owner > guardian > heir). */
export function deliveries(notices: readonly Notice[], watchers: readonly Watcher[]): Delivery[] {
  const out = new Map<string, string>();
  for (const role of ROLE_ORDER) {
    const notice = notices.find((n) => n.role === role);
    if (!notice) continue;
    for (const w of watchers) if (w.role === role && !out.has(w.chatId)) out.set(w.chatId, notice.text);
  }
  return [...out].map(([chatId, text]) => ({ chatId, text }));
}
```

- [ ] **Step 6: Chạy test**

Run: `npm test -w apps/worker -- telegram`
Expected: 12 test PASS (1 formatting, 6 `noticesFor`, 1 `deliveries`, 4 `telegramNotifier`).

- [ ] **Step 7: Kiểm toàn bộ và commit**

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker`
Expected: mọi test PASS; `tsc` và Biome sạch.

```bash
git add apps/worker/src/telegram/client.ts apps/worker/src/telegram/messages.ts apps/worker/test/workers/fixtures.ts apps/worker/test/workers/telegram.test.ts
git commit -m "feat(worker): Telegram client and alert messages per watcher role" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Cron mỗi phút — đồng bộ event, thông báo, keeper và cảnh báo ops

**Files:**
- Create: `apps/worker/src/cron/alerts.ts`, `apps/worker/src/cron/minute.ts`
- Create: `apps/worker/test/workers/fakes.ts`
- Test: `apps/worker/test/workers/alerts.test.ts`, `apps/worker/test/workers/minute.test.ts`

**Interfaces:**
- Consumes:
  - SDK: `AtropyleError`, kiểu `CreatedVault`, `ScanCursor`, `ScanResult`, `Stats`, `StatsCursor`, `VaultEvent`, `KeeperReport`, `IntegrityReport`.
  - Task 2: `Budget`, `COST`, `Clock`, `nowSeconds`, `isoAt`, `WorkerConfig`, `readConfig`, `Logger`, `errorFields`, `Store`, `eventKey`, `metered`, cùng các kiểu `CronBeat`, `KeeperEntry`, `KeeperStatus`, `KeeperIdentity`, `StatsJson`, `VaultView`.
  - Task 3: `ChainPort`, `KeeperRunOptions`, `RpcProbe`.
  - Task 4: `Notifier`, `SendOutcome`, `noticesFor`, `deliveries`, và `ev` trong fixtures.
- Produces:
  - **`cron/alerts.ts`:**
    - `type AlertKind = 'integrity' | 'integrity-error' | 'cron-stalled' | 'keeper-balance' | 'keeper-send' | 'keeper-key'`
    - `ALERT_COOLDOWN_MS = 21_600_000` (6 giờ); `interface AlertState { active: boolean; sentAt: number }`
    - `interface AlertDeps { store: Store; notifier: Notifier; opsChatId: string; clock: Clock; log: Logger }`
    - `type AlertOutcome = 'sent' | 'resolved' | 'unchanged'`
    - `class Alerts { static load(d: AlertDeps): Promise<Alerts>; set(kind: AlertKind, active: boolean, text: string): Promise<AlertOutcome> }`
  - **`cron/minute.ts`:**
    - `interface CronDeps { store: Store; chain: ChainPort; notifier: Notifier; clock: Clock; log: Logger; budget: Budget; config: WorkerConfig }`
    - `type MinuteStatus = 'ok' | 'incomplete' | 'failed' | 'locked'`
    - `interface MinuteResult { status: MinuteStatus; cursor: bigint | null; claimed: number; notified: number; keeper: { due: number; sent: number; dryRun: boolean } | null }`
    - `MINUTE_LEASE = 'lease:minute'`, `LEASE_TTL_MS = 240_000`, `NOTIFY_EVENTS`, `MIN_KEEPER_BALANCE = '0.005'`
    - `interface VaultGroup { vault: Address; created: CreatedVault | null; events: VaultEvent[] }`; `groupByVault(scan: ScanResult): VaultGroup[]`
    - `statsJson(s: Stats): StatsJson`
    - `alertDeps(d: CronDeps): AlertDeps`
    - `runMinute(d: CronDeps): Promise<MinuteResult>`
  - **`test/workers/fakes.ts`** (dùng lại ở Task 6, 8, 9, 13, 15):
    - `class FakeChain implements ChainPort`. Các field chỉnh được: `head`, `keeper`, `budget`, `created`, `logs`, `views`, `failViewFor`, `keeperImpl`, `integrityImpl`, `probes`. Ghi lại: `calls`, `keeperCalls`. Thêm `addVault(vault, block, o?)`.
    - `class FakeNotifier implements Notifier` (`sent`, `blocked`, `budget`); `class FakeClock implements Clock` (`ms`, `advance(seconds)`).
    - `okIntegrity(over?)`, `KEEPER = addr(0x77)`, `testStore()`.
    - `interface World { chain; notifier; clock; lines; config }`; `world(vars?: ConfigSource): World`; `deps(w: World, limits?: Cost): CronDeps`.

Luồng của `runMinute`, theo đúng thứ tự:

1. Lấy lease `lease:minute`. Lease đang có người giữ thì trả `locked` và dừng, không đọc chain, không chạy keeper (Quyết định 20).
2. Nạp trạng thái cảnh báo (`meta.alert:*`).
3. Đồng bộ event:
   - đọc cursor, các vault đã biết tới cursor, và bộ đếm;
   - `scan` tối đa `SCAN_MAX_BLOCKS` block; khoảng rỗng thì dừng ở đây;
   - `stats` tới đúng `scan.toBlock` (G1);
   - gom event theo vault, bỏ event đã có trong `seen`;
   - với mỗi vault còn việc: kiểm ngân sách, `view`, rồi `applyVault` (thêm vault, lưu view, claim event trong cùng một batch), rồi gửi tin cho event vừa claim;
   - hết ngân sách hoặc RPC hỏng thì dừng giữa hai vault, trạng thái `incomplete`;
   - xử lý hết thì ghi cursor, bộ đếm và bản tóm tắt trong một batch.
4. Keeper, chỉ khi `KEEPER_MODE=worker`: tính số vault và số giao dịch còn vừa ngân sách, đọc vault tới hạn, chạy `keeperTick`, ghi `next_check_at`, `keeper_log` và `meta.keeper`. Lỗi ở bước này chỉ ghi log.
5. Cảnh báo `keeper-key` khi `KEEPER_KEY` sai dạng.
6. Ghi nhịp `meta.cron`, và `meta.cron:ok` khi bước 3 không `failed`.
7. Trong `finally`: nhả lease, ghi log `cron.minute` có số fetch và số truy vấn đã dùng.

- [ ] **Step 1: Viết các bản giả dùng chung**

`apps/worker/test/workers/fakes.ts`:

```ts
import { env } from 'cloudflare:workers';
import {
  AtropyleError,
  type CreatedVault,
  type IntegrityReport,
  type KeeperReport,
  type ScanCursor,
  type ScanResult,
  type Stats,
  type StatsCursor,
  type VaultEvent,
} from '@atropyle/sdk';
import type { Address } from 'viem';
import { Budget, type Cost } from '../../src/budget';
import type { ChainPort, KeeperRunOptions, RpcProbe } from '../../src/chain/port';
import type { Clock } from '../../src/clock';
import { type ConfigSource, readConfig, type WorkerConfig } from '../../src/config';
import type { CronDeps } from '../../src/cron/minute';
import { createLogger } from '../../src/log';
import { metered } from '../../src/store/d1';
import { Store } from '../../src/store/store';
import type { Notifier, SendOutcome } from '../../src/telegram/client';
import type { KeeperIdentity, VaultView } from '../../src/types';
import { addr, ev, OWNER, T0, txHash, viewOf } from './fixtures';

const lower = (a: string): string => a.toLowerCase();

export const KEEPER = addr(0x77);

export function okIntegrity(over: Partial<IntegrityReport> = {}): IntegrityReport {
  return { ok: true, chainId: 196, blockNumber: 200n, blockTimestamp: T0, rpcs: 2, checks: [{ name: 'factory.code', ok: true }], warnings: [], ...over };
}

/**
 * An in-memory X Layer. scan and stats follow the SDK's rules (empty range, two passes, distributions per transaction),
 * and every call spends from `budget` like the counted transports: scan 1, stats 1, view 4, keeperTick 2 + 4 per vault.
 */
export class FakeChain implements ChainPort {
  factoryBlock = 100n;
  head = 200n;
  keeper: KeeperIdentity = { address: null, error: null };
  budget: Budget | null = null;
  created: CreatedVault[] = [];
  logs: VaultEvent[] = [];
  views = new Map<string, VaultView>();
  failViewFor = new Set<string>();
  calls: string[] = [];
  keeperCalls: { vaults: Address[]; maxTx: number; last: (bigint | null)[] }[] = [];
  probes: RpcProbe[] = [{ url: 'https://rpc.test/a', ok: true, ms: 12, head: 200n }];
  integrityImpl: () => Promise<IntegrityReport> = async () => okIntegrity();
  keeperImpl: (vaults: readonly Address[], o: KeeperRunOptions) => Promise<KeeperReport> = async (vaults) => ({
    ranAt: T0,
    dryRun: this.keeper.address === null,
    keeper: this.keeper.address,
    balance: null,
    stopped: null,
    sent: 0,
    outcomes: vaults.map((vault) => ({ vault, decision: null, status: 'idle', nextCheckAt: this.views.get(lower(vault))?.nextCheckAt ?? null })),
  });

  private spend(n: number): void {
    for (let i = 0; i < n; i++) this.budget?.countFetch();
  }

  /** A factory vault created at `block`: VaultCreated plus the Alive that initialize() emits, in one transaction. */
  addVault(vault: Address, block: bigint, o: { owner?: Address; drill?: boolean; view?: Partial<VaultView> } = {}): void {
    const tx = txHash(Number(block));
    this.created.push({ vault, owner: o.owner ?? OWNER, drill: o.drill ?? true, blockNumber: block, transactionHash: tx });
    this.logs.push(ev(vault, 'Alive', block, { at: T0 }, tx));
    this.views.set(lower(vault), viewOf(vault, o.view));
  }

  async scan(resume: ScanCursor | null, maxBlocks: number): Promise<ScanResult> {
    this.spend(1);
    this.calls.push(`scan:${resume?.toBlock ?? 'null'}`);
    const fromBlock = resume ? resume.toBlock + 1n : this.factoryBlock;
    const capped = fromBlock + BigInt(maxBlocks) - 1n;
    const toBlock = capped < this.head ? capped : this.head;
    const vaults = [...(resume?.vaults ?? [])];
    if (fromBlock > toBlock) return { fromBlock, toBlock: fromBlock - 1n, created: [], events: [], cursor: { toBlock: fromBlock - 1n, vaults }, truncated: false };
    const created = this.created.filter((c) => c.blockNumber >= fromBlock && c.blockNumber <= toBlock);
    vaults.push(...created.map((c) => c.vault));
    const known = new Set(vaults.map(lower));
    const events = this.logs.filter((e) => e.blockNumber >= fromBlock && e.blockNumber <= toBlock && known.has(lower(e.address)));
    return { fromBlock, toBlock, created, events, cursor: { toBlock, vaults }, truncated: toBlock < this.head };
  }

  async stats(resume: StatsCursor | null, toBlock: bigint): Promise<Stats> {
    this.spend(1);
    this.calls.push(`stats:${resume?.toBlock ?? 'null'}->${toBlock}`);
    const start = resume ? resume.toBlock + 1n : this.factoryBlock;
    const cur: StatsCursor = resume
      ? { ...resume, vaults: [...resume.vaults], toBlock }
      : { toBlock, vaults: [], aliveEvents: 0, alarms: 0, releases: 0, distributions: 0 };
    const inRange = (b: bigint) => b >= start && b <= toBlock;
    for (const c of this.created) if (inRange(c.blockNumber)) cur.vaults.push({ vault: c.vault, owner: c.owner, drill: c.drill });
    const known = new Set(cur.vaults.map((v) => lower(v.vault)));
    const distributed = new Set<string>();
    for (const e of this.logs) {
      if (!inRange(e.blockNumber) || !known.has(lower(e.address))) continue;
      if (e.name === 'Alive') cur.aliveEvents++;
      else if (e.name === 'AlarmRaised') cur.alarms++;
      else if (e.name === 'Released') cur.releases++;
      else if (e.name === 'Distributed') distributed.add(`${lower(e.address)}:${e.transactionHash}`);
    }
    cur.distributions += distributed.size;
    const drill = cur.vaults.filter((v) => v.drill).length;
    return {
      fromBlock: this.factoryBlock,
      toBlock,
      vaults: { total: cur.vaults.length, drill, paid: cur.vaults.length - drill },
      owners: new Set(cur.vaults.map((v) => lower(v.owner))).size,
      checkIns: Math.max(0, cur.aliveEvents - cur.vaults.length),
      alarms: cur.alarms,
      releases: cur.releases,
      distributions: cur.distributions,
      cursor: cur,
    };
  }

  async view(vault: Address, _lastDistributeAt: bigint | null): Promise<VaultView> {
    this.spend(4);
    this.calls.push(`view:${lower(vault)}`);
    if (this.failViewFor.has(lower(vault))) throw new AtropyleError('RPC_UNAVAILABLE');
    const v = this.views.get(lower(vault));
    if (!v) throw new AtropyleError('NOT_VAULT');
    return v;
  }

  async keeperTick(vaults: readonly Address[], o: KeeperRunOptions): Promise<KeeperReport> {
    this.spend(2 + 4 * vaults.length);
    this.keeperCalls.push({ vaults: [...vaults], maxTx: o.maxTx, last: vaults.map((v) => o.lastDistributeAt(v)) });
    return this.keeperImpl(vaults, o);
  }

  async integrity(): Promise<IntegrityReport> {
    this.spend(3);
    this.calls.push('integrity');
    return this.integrityImpl();
  }

  async isVault(address: Address): Promise<boolean> {
    this.spend(1);
    this.calls.push(`isVault:${lower(address)}`);
    if (this.failViewFor.has(lower(address))) throw new AtropyleError('RPC_UNAVAILABLE');
    return this.views.has(lower(address));
  }

  async probe(): Promise<RpcProbe[]> {
    this.spend(this.probes.length);
    return this.probes;
  }
}

export class FakeNotifier implements Notifier {
  budget: Budget | null = null;
  sent: { chatId: string; text: string }[] = [];
  blocked = new Set<string>();

  async send(chatId: string, text: string): Promise<SendOutcome> {
    this.budget?.countFetch();
    if (this.blocked.has(chatId)) return { ok: false, blocked: true, status: 403 };
    this.sent.push({ chatId, text });
    return { ok: true, blocked: false, status: 200 };
  }
}

/** Starts at T0 (chain seconds) so that wall time and chain time agree in tests. */
export class FakeClock implements Clock {
  ms = Number(T0) * 1000;

  nowMs(): number {
    return this.ms;
  }

  advance(seconds: number): void {
    this.ms += seconds * 1000;
  }
}

export interface World {
  chain: FakeChain;
  notifier: FakeNotifier;
  clock: FakeClock;
  lines: string[];
  config: WorkerConfig;
}

export function world(vars: ConfigSource = {}): World {
  return {
    chain: new FakeChain(),
    notifier: new FakeNotifier(),
    clock: new FakeClock(),
    lines: [],
    config: readConfig({ WEB_URL: 'https://web.test/', ...vars }),
  };
}

/** Deps of one invocation over a shared fake world: a fresh budget that the fake chain, the notifier and D1 all count against. */
export function deps(w: World, limits: Cost = { fetches: 45, queries: 45 }): CronDeps {
  const budget = new Budget(limits);
  w.chain.budget = budget;
  w.notifier.budget = budget;
  return {
    store: new Store(metered(env.DB, budget)),
    chain: w.chain,
    notifier: w.notifier,
    clock: w.clock,
    log: createLogger({}, (line) => w.lines.push(line)),
    budget,
    config: w.config,
  };
}

/** A store for arranging and asserting, outside any invocation budget. */
export const testStore = (): Store => new Store(metered(env.DB, new Budget({ fetches: 10_000, queries: 10_000 })));
```

`_lastDistributeAt` có dấu gạch dưới để Biome không báo biến không dùng.

- [ ] **Step 2: Viết test cảnh báo (thất bại)**

`apps/worker/test/workers/alerts.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { Alerts } from '../../src/cron/alerts';
import { createLogger } from '../../src/log';
import { FakeClock, FakeNotifier, testStore } from './fakes';
import { resetDb } from './helpers';

describe('Alerts', () => {
  beforeEach(resetDb);

  const setup = (opsChatId: string) => {
    const lines: string[] = [];
    const d = { store: testStore(), notifier: new FakeNotifier(), opsChatId, clock: new FakeClock(), log: createLogger({}, (l) => lines.push(l)) };
    return { d, lines };
  };

  it('sends when a problem starts, repeats only after 6 hours, and says once when it is resolved', async () => {
    const { d } = setup('-100');
    let alerts = await Alerts.load(d);
    expect(await alerts.set('integrity', true, 'Integrity check failed: factory.code.')).toBe('sent');
    expect(await alerts.set('integrity', true, 'Integrity check failed: factory.code.')).toBe('unchanged');
    d.clock.advance(6 * 3600 - 1);
    alerts = await Alerts.load(d);
    expect(await alerts.set('integrity', true, 'Integrity check failed: factory.code.')).toBe('unchanged');
    d.clock.advance(1);
    expect(await alerts.set('integrity', true, 'Integrity check failed: factory.code.')).toBe('sent');
    expect(await alerts.set('integrity', false, '')).toBe('resolved');
    expect(await alerts.set('integrity', false, '')).toBe('unchanged');
    expect(d.notifier.sent).toEqual([
      { chatId: '-100', text: '[Atropyle ops] Integrity check failed: factory.code.' },
      { chatId: '-100', text: '[Atropyle ops] Integrity check failed: factory.code.' },
      { chatId: '-100', text: '[Atropyle ops] Resolved: integrity.' },
    ]);
  });

  it('only logs when OPS_CHAT_ID is empty', async () => {
    const { d, lines } = setup('');
    const alerts = await Alerts.load(d);
    expect(await alerts.set('cron-stalled', true, 'No successful cron run for 10 minutes.')).toBe('sent');
    expect(d.notifier.sent).toEqual([]);
    expect(lines.some((l) => l.includes('"ops.alert"') && l.includes('cron-stalled'))).toBe(true);
  });
});
```

- [ ] **Step 3: Chạy để thấy thất bại**

Run: `npm test -w apps/worker -- alerts`
Expected: FAIL, không resolve được `../../src/cron/alerts`. (`fakes.ts` chỉ import kiểu từ `minute.ts`; esbuild xoá import kiểu, nên file này chưa cần tồn tại.)

- [ ] **Step 4: Viết `cron/alerts.ts`**

`apps/worker/src/cron/alerts.ts`:

```ts
import type { Clock } from '../clock';
import type { Logger } from '../log';
import type { Store } from '../store/store';
import type { Notifier } from '../telegram/client';

export type AlertKind = 'integrity' | 'integrity-error' | 'cron-stalled' | 'keeper-balance' | 'keeper-send' | 'keeper-key';
export const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export interface AlertState {
  active: boolean;
  sentAt: number;
}

export interface AlertDeps {
  store: Store;
  notifier: Notifier;
  opsChatId: string;
  clock: Clock;
  log: Logger;
}

export type AlertOutcome = 'sent' | 'resolved' | 'unchanged';

/**
 * Edge-triggered ops alerts (Quyết định 21): a message when a problem starts, a reminder every 6 hours while it lasts,
 * and one when it ends. The state is written before the message is sent, so a failed send never causes a burst later.
 */
export class Alerts {
  private constructor(
    private readonly d: AlertDeps,
    private readonly state: Map<string, AlertState>,
  ) {}

  static async load(d: AlertDeps): Promise<Alerts> {
    const rows = await d.store.getMetaPrefix<AlertState>('alert:');
    return new Alerts(d, new Map([...rows].map(([key, row]) => [key, row.value])));
  }

  async set(kind: AlertKind, active: boolean, text: string): Promise<AlertOutcome> {
    const key = `alert:${kind}`;
    const prev = this.state.get(key) ?? { active: false, sentAt: 0 };
    const now = this.d.clock.nowMs();
    if (!active && !prev.active) return 'unchanged';
    if (active && prev.active && now - prev.sentAt < ALERT_COOLDOWN_MS) return 'unchanged';
    const next: AlertState = active ? { active: true, sentAt: now } : { active: false, sentAt: prev.sentAt };
    const outcome: AlertOutcome = active ? 'sent' : 'resolved';
    this.state.set(key, next);
    await this.d.store.setMeta(key, next, now);
    this.d.log.warn('ops.alert', active ? { kind, outcome, text } : { kind, outcome });
    if (this.d.opsChatId !== '') {
      await this.d.notifier.send(this.d.opsChatId, active ? `[Atropyle ops] ${text}` : `[Atropyle ops] Resolved: ${kind}.`);
    }
    return outcome;
  }
}
```

- [ ] **Step 5: Viết test cron mỗi phút (thất bại)**

`apps/worker/test/workers/minute.test.ts`:

```ts
import { env } from 'cloudflare:workers';
import { AtropyleError } from '@atropyle/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { LEASE_TTL_MS, MINUTE_LEASE, runMinute } from '../../src/cron/minute';
import type { CronBeat, KeeperStatus } from '../../src/types';
import { deps, KEEPER, testStore, type World, world } from './fakes';
import { addr, ev, OWNER, T0, txHash, VAULT_A, VAULT_B, VAULT_C } from './fixtures';
import { resetDb } from './helpers';

const VAULT_D = addr(0xd4);
const VAULT_E = addr(0xe5);
const GRACE = { state: 'grace' as const, alarmAt: T0, windowEndsAt: T0 + 120n, blockNumber: 200n };
const views = (w: World) => w.chain.calls.filter((c) => c.startsWith('view:'));
const opsTexts = (w: World) => w.notifier.sent.filter((m) => m.chatId === '-100').map((m) => m.text);

describe('runMinute', () => {
  let w: World;
  beforeEach(async () => {
    await resetDb();
    w = world();
  });

  it('indexes new vaults, commits the cursor at the scanned head, then resumes from it', async () => {
    w.chain.addVault(VAULT_A, 110n);
    w.chain.addVault(VAULT_B, 150n, { drill: false });
    const first = await runMinute(deps(w));
    expect(first).toMatchObject({ status: 'ok', cursor: 200n, claimed: 2, notified: 0 });
    const store = testStore();
    expect(await store.getCursor()).toBe(200n);
    expect((await store.getVault(VAULT_B))?.state).toBe('active');
    expect((await store.getSummary())?.stats).toMatchObject({ toBlock: '200', vaults: { total: 2, drill: 1, paid: 1 }, checkIns: 0 });
    expect(await store.getCounters()).toEqual({ aliveEvents: 2, alarms: 0, releases: 0, distributions: 0 });

    w.chain.calls = [];
    expect(await runMinute(deps(w))).toMatchObject({ status: 'ok', cursor: 200n, claimed: 0 });
    expect(w.chain.calls).toEqual(['scan:200']);

    w.chain.head = 260n;
    w.chain.logs.push(ev(VAULT_A, 'Alive', 250n, { at: T0 + 60n }));
    expect(await runMinute(deps(w))).toMatchObject({ status: 'ok', cursor: 260n, claimed: 1 });
    expect(w.chain.calls).toContain('stats:200->260');
    expect(views(w)).toEqual([`view:${VAULT_A}`]);
    expect((await store.getSummary())?.stats.checkIns).toBe(1);
  });

  it('tells each watching chat once about a keeper-raised alarm, and never twice', async () => {
    const store = testStore();
    w.chain.addVault(VAULT_A, 110n, { view: GRACE });
    w.chain.logs.push(ev(VAULT_A, 'AlarmRaised', 180n, { state: 1, target: OWNER }, txHash(42)));
    await store.addWatch('owner-chat', VAULT_A, 'owner', 1);
    await store.addWatch('guardian-chat', VAULT_A, 'guardian', 2);
    await store.addWatch('heir-chat', VAULT_A, 'heir', 3);
    await store.addWatch('both-chat', VAULT_A, 'heir', 4);
    await store.addWatch('both-chat', VAULT_A, 'owner', 5);
    const status: KeeperStatus = { ranAt: 'x', address: KEEPER, balance: '1', dryRun: false, stopped: null, sent: 1, failed: 0 };
    await store.recordKeeper({ ranAt: T0, nowMs: 0, status, entries: [{ vault: VAULT_A, action: 'poke', status: 'sent', hash: txHash(42), nextCheckAt: T0 }] });

    expect(await runMinute(deps(w))).toMatchObject({ status: 'ok', claimed: 2, notified: 4 });
    const byChat = Object.fromEntries(w.notifier.sent.map((m) => [m.chatId, m.text]));
    expect(Object.keys(byChat).sort()).toEqual(['both-chat', 'guardian-chat', 'heir-chat', 'owner-chat']);
    expect(byChat['owner-chat']).toMatch(/^URGENT: the inheritance alarm on vault 0x\S+ was raised by the Atropyle keeper at 2027-01-15 08:00 UTC\./);
    expect(byChat['both-chat']).toBe(byChat['owner-chat']);
    expect(byChat['heir-chat']).toContain('the vault releases to the heirs');

    await env.DB.prepare('DELETE FROM cursor').run();
    expect(await runMinute(deps(w))).toMatchObject({ status: 'ok', claimed: 0, notified: 0 });
    expect(w.notifier.sent).toHaveLength(4);
  });

  it('stops between vaults when the budget runs out, and finishes over later runs without repeats', async () => {
    const store = testStore();
    const all = [VAULT_A, VAULT_B, VAULT_C, VAULT_D, VAULT_E];
    all.forEach((v, i) => {
      w.chain.addVault(v, 110n + BigInt(i) * 10n, { view: GRACE });
      w.chain.logs.push(ev(v, 'AlarmRaised', 115n + BigInt(i) * 10n, { state: 1, target: OWNER }));
    });
    for (const v of all) await store.addWatch(`chat-${v.slice(-2)}`, v, 'owner', 1);
    // 13 fetches: scan 1 + stats 1, then each vault costs view 4 + one message 1.
    const limits = { fetches: 13, queries: 100 };

    expect(await runMinute(deps(w, limits))).toMatchObject({ status: 'incomplete', cursor: null, claimed: 4, notified: 2, keeper: null });
    expect(await store.getCursor()).toBeNull();
    expect(await store.getVault(VAULT_C)).toBeNull();
    expect(w.lines.some((l) => l.includes('"cron.budget"'))).toBe(true);

    expect(await runMinute(deps(w, limits))).toMatchObject({ status: 'incomplete', claimed: 4, notified: 2 });
    expect(await runMinute(deps(w, limits))).toMatchObject({ status: 'ok', cursor: 200n, claimed: 2, notified: 1 });
    expect(views(w)).toHaveLength(5);
    expect(w.notifier.sent.map((m) => m.chatId).sort()).toEqual(['chat-a1', 'chat-b2', 'chat-c3', 'chat-d4', 'chat-e5']);
    expect((await store.getSummary())?.stats.vaults.total).toBe(5);
  });

  it('an RPC failure on one vault keeps the cursor, and the next run sends only what is new', async () => {
    const store = testStore();
    w.chain.addVault(VAULT_A, 110n, { view: GRACE });
    w.chain.logs.push(ev(VAULT_A, 'AlarmRaised', 115n, { state: 1, target: OWNER }));
    w.chain.addVault(VAULT_B, 120n, { view: GRACE });
    w.chain.logs.push(ev(VAULT_B, 'AlarmRaised', 130n, { state: 1, target: OWNER }));
    await store.addWatch('a-chat', VAULT_A, 'owner', 1);
    await store.addWatch('b-chat', VAULT_B, 'owner', 2);
    w.chain.failViewFor.add(VAULT_B);

    expect(await runMinute(deps(w))).toMatchObject({ status: 'incomplete', cursor: null, notified: 1 });
    expect(await store.getCursor()).toBeNull();
    expect(await store.getVault(VAULT_B)).toBeNull();
    expect(w.lines.some((l) => l.includes('"cron.view_failed"') && l.includes('RPC_UNAVAILABLE'))).toBe(true);
    expect((await store.getMeta<CronBeat>('cron'))?.value.status).toBe('incomplete');

    w.chain.failViewFor.clear();
    expect(await runMinute(deps(w))).toMatchObject({ status: 'ok', cursor: 200n, notified: 1 });
    expect(w.notifier.sent.map((m) => m.chatId)).toEqual(['a-chat', 'b-chat']);
  });

  it('a run that finds the lease held does nothing, not even the keeper, until the lease expires', async () => {
    const store = testStore();
    w.chain.addVault(VAULT_A, 110n, { view: { nextCheckAt: T0 - 10n } });
    expect(await store.acquireLease(MINUTE_LEASE, 'other-run', w.clock.nowMs(), LEASE_TTL_MS)).toBe(true);

    expect(await runMinute(deps(w))).toMatchObject({ status: 'locked', keeper: null });
    expect(w.chain.calls).toEqual([]);
    expect(w.chain.keeperCalls).toEqual([]);
    expect(await store.getMeta('cron')).toBeNull();

    w.clock.advance(LEASE_TTL_MS / 1000);
    expect((await runMinute(deps(w))).status).toBe('ok');
    expect(w.chain.keeperCalls).toHaveLength(1);
    expect(await store.getMeta(MINUTE_LEASE)).toBeNull();
  });

  it('runs the keeper on due vaults within the budget, and records what it sent', async () => {
    const store = testStore();
    w.chain.keeper = { address: KEEPER, error: null };
    w.chain.addVault(VAULT_A, 110n, { view: { nextCheckAt: T0 - 10n } });
    w.chain.addVault(VAULT_B, 120n, { view: { nextCheckAt: T0 + 500n } });
    const status: KeeperStatus = { ranAt: 'x', address: KEEPER, balance: '1', dryRun: false, stopped: null, sent: 1, failed: 0 };
    await store.recordKeeper({
      ranAt: T0 - 4000n,
      nowMs: 0,
      status,
      entries: [{ vault: VAULT_A, action: 'distribute', status: 'sent', hash: txHash(5), nextCheckAt: T0 - 10n }],
    });
    w.chain.keeperImpl = async () => ({
      ranAt: T0,
      dryRun: false,
      keeper: KEEPER,
      balance: 10n ** 18n,
      stopped: null,
      sent: 1,
      outcomes: [
        { vault: VAULT_A, decision: { vault: VAULT_A, action: 'poke', reason: 'TRANSITION_DUE', nextCheckAt: T0 }, status: 'sent', hash: txHash(9), nextCheckAt: T0 },
      ],
    });

    expect((await runMinute(deps(w))).keeper).toEqual({ due: 1, sent: 1, dryRun: false });
    // Fetches left after the sync: 45 - (scan 1 + stats 1 + two views 8) = 35, so (35 - 2 - 4) / 12 → 2 transactions.
    expect(w.chain.keeperCalls).toEqual([{ vaults: [VAULT_A], maxTx: 2, last: [T0 - 4000n] }]);
    expect(await store.keeperPokes([txHash(9)])).toEqual(new Set([txHash(9)]));
    expect((await store.getVault(VAULT_A))?.nextCheckAt).toBe(T0);
    expect((await store.getMeta<KeeperStatus>('keeper'))?.value).toEqual({
      ranAt: '2027-01-15T08:00:00.000Z',
      address: KEEPER,
      balance: '1000000000000000000',
      dryRun: false,
      stopped: null,
      sent: 1,
      failed: 0,
    });
  });

  it('alerts ops once when the keeper balance is low, and once when it recovers', async () => {
    w = world({ OPS_CHAT_ID: '-100' });
    w.chain.keeper = { address: KEEPER, error: null };
    w.chain.addVault(VAULT_A, 110n, { view: { nextCheckAt: T0 - 10n } });
    let balance = 10n ** 15n;
    w.chain.keeperImpl = async () => ({
      ranAt: T0,
      dryRun: false,
      keeper: KEEPER,
      balance,
      stopped: balance < 5n * 10n ** 15n ? 'LOW_BALANCE' : null,
      sent: 0,
      outcomes: [],
    });

    await runMinute(deps(w));
    w.clock.advance(60);
    await runMinute(deps(w));
    expect(opsTexts(w)).toEqual([`[Atropyle ops] Keeper ${KEEPER} has 0.001 OKB, below the 0.005 OKB minimum, so it stopped sending. Top it up.`]);
    balance = 10n ** 18n;
    w.clock.advance(60);
    await runMinute(deps(w));
    expect(opsTexts(w)).toHaveLength(2);
    expect(opsTexts(w)[1]).toBe('[Atropyle ops] Resolved: keeper-balance.');
  });

  it('alerts ops when the keeper fails to send, and resolves after a successful send', async () => {
    w = world({ OPS_CHAT_ID: '-100' });
    w.chain.keeper = { address: KEEPER, error: null };
    w.chain.addVault(VAULT_A, 110n, { view: { nextCheckAt: T0 - 10n } });
    const decision = { vault: VAULT_A, action: 'poke' as const, reason: 'TRANSITION_DUE' as const, nextCheckAt: T0 };
    let ok = false;
    w.chain.keeperImpl = async () => ({
      ranAt: T0,
      dryRun: false,
      keeper: KEEPER,
      balance: 10n ** 18n,
      stopped: null,
      sent: ok ? 1 : 0,
      outcomes: [
        ok
          ? { vault: VAULT_A, decision, status: 'sent', hash: txHash(11), nextCheckAt: T0 }
          : { vault: VAULT_A, decision, status: 'send-failed', error: new AtropyleError('RPC_UNAVAILABLE').toJSON(), nextCheckAt: T0 },
      ],
    });

    await runMinute(deps(w));
    expect(opsTexts(w)).toEqual(['[Atropyle ops] The keeper could not send 1 transaction(s) in the last run. See keeper.outcome in Workers Logs.']);
    expect((await testStore().getMeta<KeeperStatus>('keeper'))?.value.failed).toBe(1);
    ok = true;
    w.clock.advance(60);
    await runMinute(deps(w));
    expect(opsTexts(w)[1]).toBe('[Atropyle ops] Resolved: keeper-send.');
  });

  it('a malformed KEEPER_KEY raises the keeper-key alert once, and the keeper stays dry', async () => {
    w = world({ OPS_CHAT_ID: '-100' });
    w.chain.keeper = { address: null, error: 'KEEPER_KEY_INVALID' };
    w.chain.addVault(VAULT_A, 110n, { view: { nextCheckAt: T0 - 10n } });

    expect((await runMinute(deps(w))).keeper).toEqual({ due: 1, sent: 0, dryRun: true });
    w.clock.advance(60);
    await runMinute(deps(w));
    expect(opsTexts(w)).toEqual([
      '[Atropyle ops] KEEPER_KEY is set but is not a valid private key, so the keeper runs in dry-run. Set it again with: npx wrangler secret put KEEPER_KEY',
    ]);
    expect((await testStore().getMeta<CronBeat>('cron:ok'))?.value.keeper).toEqual({ address: null, error: 'KEEPER_KEY_INVALID' });
  });

  it('removes every watch of a chat that blocked the bot', async () => {
    const store = testStore();
    w.chain.addVault(VAULT_A, 110n, { view: GRACE });
    w.chain.logs.push(ev(VAULT_A, 'AlarmRaised', 115n, { state: 1, target: OWNER }));
    await store.addWatch('gone', VAULT_A, 'owner', 1);
    await store.addWatch('gone', VAULT_B, 'heir', 2);
    await store.addWatch('here', VAULT_A, 'heir', 3);
    w.notifier.blocked.add('gone');

    expect((await runMinute(deps(w))).notified).toBe(1);
    expect(await store.listWatches('gone')).toEqual([]);
    expect(await store.listWatches('here')).toHaveLength(1);
    expect(w.lines.some((l) => l.includes('"telegram.blocked"'))).toBe(true);
  });
});
```

Cách tính trong test ngân sách (giới hạn 13 fetch):
- Lần 1: scan và stats tốn 2, còn 11. Vault A tốn 5, còn 6. Vault B tốn 5, còn 1. Vault C cần 5 nên dừng. Kết quả: claim 4 event (Alive và AlarmRaised của A, B), gửi 2 tin.
- Lần 2: event của A, B đã có trong `seen` nên bỏ qua. C và D được xử lý, E thì không.
- Lần 3: chỉ còn E. Xử lý xong thì ghi cursor 200.
- Mỗi vault chỉ được `view` đúng một lần. Mỗi chat nhận đúng một tin.

- [ ] **Step 6: Chạy để thấy thất bại**

Run: `npm test -w apps/worker -- minute`
Expected: FAIL, không resolve được `../../src/cron/minute`.

- [ ] **Step 7: Viết `cron/minute.ts`**

`apps/worker/src/cron/minute.ts`:

```ts
import type { CreatedVault, ScanCursor, ScanResult, Stats, StatsCursor, VaultEvent } from '@atropyle/sdk';
import { type Address, formatEther } from 'viem';
import { type Budget, COST } from '../budget';
import type { ChainPort } from '../chain/port';
import { type Clock, isoAt, nowSeconds } from '../clock';
import type { WorkerConfig } from '../config';
import { errorFields, type Logger } from '../log';
import { eventKey, type Store } from '../store/store';
import type { Notifier } from '../telegram/client';
import { deliveries, noticesFor } from '../telegram/messages';
import type { CronBeat, KeeperEntry, KeeperStatus, StatsJson, VaultView } from '../types';
import { type AlertDeps, Alerts } from './alerts';

export interface CronDeps {
  store: Store;
  chain: ChainPort;
  notifier: Notifier;
  clock: Clock;
  log: Logger;
  budget: Budget;
  config: WorkerConfig;
}

export type MinuteStatus = 'ok' | 'incomplete' | 'failed' | 'locked';

export interface MinuteResult {
  status: MinuteStatus;
  cursor: bigint | null;
  claimed: number;
  notified: number;
  keeper: { due: number; sent: number; dryRun: boolean } | null;
}

export const MINUTE_LEASE = 'lease:minute';
export const LEASE_TTL_MS = 240_000;
/** Events that can produce a message (Quyết định 19). Alive and Distributed only refresh the cached view. */
export const NOTIFY_EVENTS: ReadonlySet<string> = new Set(['AlarmRaised', 'AlarmCancelled', 'RecoveryVoted', 'Attested', 'Released']);
/** KEEPER_DEFAULTS.minBalance of the SDK, in OKB, for the alert text. */
export const MIN_KEEPER_BALANCE = '0.005';

export interface VaultGroup {
  vault: Address;
  created: CreatedVault | null;
  events: VaultEvent[];
}

/** Groups a scan by vault (lowercase), in the order each vault first appears in the logs. */
export function groupByVault(scan: ScanResult): VaultGroup[] {
  const groups = new Map<string, VaultGroup>();
  const group = (vault: Address): VaultGroup => {
    const key = vault.toLowerCase();
    let g = groups.get(key);
    if (!g) {
      g = { vault: key as Address, created: null, events: [] };
      groups.set(key, g);
    }
    return g;
  };
  for (const e of scan.events) group(e.address).events.push(e);
  for (const c of scan.created) group(c.vault).created = c;
  return [...groups.values()];
}

export function statsJson(s: Stats): StatsJson {
  return {
    fromBlock: s.fromBlock.toString(),
    toBlock: s.toBlock.toString(),
    vaults: { total: s.vaults.total, drill: s.vaults.drill, paid: s.vaults.paid },
    owners: s.owners,
    checkIns: s.checkIns,
    alarms: s.alarms,
    releases: s.releases,
    distributions: s.distributions,
  };
}

export function alertDeps(d: CronDeps): AlertDeps {
  return { store: d.store, notifier: d.notifier, opsChatId: d.config.opsChatId, clock: d.clock, log: d.log };
}

interface SyncState {
  status: CronBeat['status'];
  cursor: bigint | null;
  claimed: number;
  notified: number;
}

/** Step 1–2 of spec §9.5. The cursor moves only when every vault of the range is done (Quyết định 13). */
async function syncEvents(d: CronDeps, out: SyncState): Promise<void> {
  const { store, chain, budget, log } = d;
  const cursor = await store.getCursor();
  out.cursor = cursor;
  let scanResume: ScanCursor | null = null;
  let statsResume: StatsCursor | null = null;
  if (cursor !== null) {
    const known = await store.knownVaults(cursor);
    const counters = await store.getCounters();
    scanResume = { toBlock: cursor, vaults: known.map((k) => k.vault) };
    statsResume = { toBlock: cursor, vaults: known, ...counters };
  }
  const scan = await chain.scan(scanResume, d.config.scanMaxBlocks);
  if (scan.toBlock < scan.fromBlock) return;
  const stats = await chain.stats(statsResume, scan.toBlock);

  const seen = await store.seenKeys(scan.events);
  const pending = groupByVault(scan)
    .map((g) => ({ ...g, unseen: g.events.filter((e) => !seen.has(eventKey(e))) }))
    .filter((g) => g.unseen.length > 0 || (g.created !== null && g.events.length === 0));

  if (pending.length > 0) {
    const vaults = pending.map((g) => g.vault);
    const watchers = await store.watchersOf(vaults);
    const lastDistributes = await store.lastDistributes(vaults);
    const raised = pending.flatMap((g) => g.unseen.filter((e) => e.name === 'AlarmRaised').map((e) => e.transactionHash));
    const ctx = { webUrl: d.config.webUrl, keeperPokes: await store.keeperPokes(raised) };
    const blocked = new Set<string>();

    for (const [i, g] of pending.entries()) {
      const mine = watchers.filter((w) => w.vault === g.vault);
      const chats = new Set(mine.map((w) => w.chatId)).size;
      const messages = chats * g.unseen.filter((e) => NOTIFY_EVENTS.has(e.name)).length;
      const need = {
        fetches: COST.view.fetches + messages * COST.notice.fetches,
        queries: COST.view.queries + COST.reserve.queries + 1,
      };
      if (!budget.allows(need)) {
        log.warn('cron.budget', { vault: g.vault, left: budget.left(), need, remaining: pending.length - i });
        out.status = 'incomplete';
        break;
      }
      let view: VaultView | null = null;
      try {
        view = await chain.view(g.vault, lastDistributes.get(g.vault) ?? null);
      } catch (e) {
        const err = errorFields(e);
        if (err.code !== 'NOT_VAULT') {
          log.warn('cron.view_failed', { vault: g.vault, ...err });
          out.status = 'incomplete';
          break;
        }
        log.warn('cron.not_vault', { vault: g.vault });
      }
      const created = g.created
        ? { vault: g.created.vault, owner: g.created.owner, drill: g.created.drill, createdBlock: g.created.blockNumber }
        : null;
      const claims = await store.applyVault({ created, view, claims: g.unseen });
      const fresh = g.unseen.filter((_, j) => claims[j] === true);
      out.claimed += fresh.length;
      // Claimed first, sent after: at most once (Quyết định 13).
      for (const e of fresh) {
        for (const m of deliveries(noticesFor(e, view, ctx), mine)) {
          const sent = await d.notifier.send(m.chatId, m.text);
          if (sent.ok) out.notified += 1;
          if (sent.blocked) blocked.add(m.chatId);
        }
      }
    }

    for (const chatId of blocked) {
      const removed = await store.removeWatches(chatId);
      log.info('telegram.blocked', { chatId, removed });
    }
  }

  if (out.status !== 'ok') return;
  const c = stats.cursor;
  await store.commitCursor({
    cursor: scan.toBlock,
    counters: { aliveEvents: c.aliveEvents, alarms: c.alarms, releases: c.releases, distributions: c.distributions },
    summary: { updatedAt: isoAt(d.clock.nowMs()), stats: statsJson(stats) },
  });
  out.cursor = scan.toBlock;
}

/** Step 3 of spec §9.5, sized to what is left of the budget (Quyết định 12). */
async function runKeeper(d: CronDeps, alerts: Alerts): Promise<MinuteResult['keeper']> {
  if (d.config.keeperMode !== 'worker') return null;
  const left = d.budget.left();
  const reads = left.fetches - COST.keeperBase.fetches - COST.keeperTx.fetches;
  const limit = Math.min(d.config.keeperMaxVaults, Math.floor(reads / COST.keeperVault.fetches));
  if (limit <= 0 || left.queries < COST.keeperBase.queries + COST.reserve.queries) {
    d.log.info('keeper.skipped', { reason: 'budget', left });
    return null;
  }
  const due = await d.store.dueVaults(nowSeconds(d.clock), limit);
  if (due.length === 0) return { due: 0, sent: 0, dryRun: d.chain.keeper.address === null };

  const room = d.budget.left().fetches - COST.keeperBase.fetches - due.length * COST.keeperVault.fetches;
  const maxTx = Math.max(0, Math.min(d.config.keeperMaxTx, Math.floor(room / COST.keeperTx.fetches)));
  const last = await d.store.lastDistributes(due);
  const report = await d.chain.keeperTick(due, { maxTx, lastDistributeAt: (v) => last.get(v.toLowerCase()) ?? null });

  const entries: KeeperEntry[] = report.outcomes.map((o) => ({
    vault: o.vault,
    action: o.decision?.action ?? null,
    status: o.status,
    hash: o.hash ?? null,
    nextCheckAt: o.nextCheckAt,
  }));
  const failed = report.outcomes.filter((o) => o.status === 'send-failed').length;
  const status: KeeperStatus = {
    ranAt: isoAt(d.clock.nowMs()),
    address: report.keeper,
    balance: report.balance === null ? null : report.balance.toString(),
    dryRun: report.dryRun,
    stopped: report.stopped,
    sent: report.sent,
    failed,
  };
  await d.store.recordKeeper({ ranAt: report.ranAt, entries, status, nowMs: d.clock.nowMs() });
  for (const o of report.outcomes) {
    if (o.status === 'idle') continue;
    d.log.info('keeper.outcome', {
      vault: o.vault,
      status: o.status,
      action: o.decision?.action ?? null,
      reason: o.decision?.reason ?? null,
      hash: o.hash ?? null,
      error: o.error?.code ?? null,
    });
  }

  if (!report.dryRun) {
    const balance = formatEther(report.balance ?? 0n);
    await alerts.set(
      'keeper-balance',
      report.stopped === 'LOW_BALANCE',
      `Keeper ${report.keeper} has ${balance} OKB, below the ${MIN_KEEPER_BALANCE} OKB minimum, so it stopped sending. Top it up.`,
    );
  }
  if (report.sent + failed > 0) {
    await alerts.set('keeper-send', failed > 0, `The keeper could not send ${failed} transaction(s) in the last run. See keeper.outcome in Workers Logs.`);
  }
  return { due: due.length, sent: report.sent, dryRun: report.dryRun };
}

/** The `* * * * *` cron (spec §9.5). Never throws: every failure ends up in the result, the log and the heartbeat. */
export async function runMinute(d: CronDeps): Promise<MinuteResult> {
  const owner = crypto.randomUUID();
  const started = Date.now();
  const sync: SyncState = { status: 'ok', cursor: null, claimed: 0, notified: 0 };
  let keeper: MinuteResult['keeper'] = null;
  let locked = false;
  try {
    if (!(await d.store.acquireLease(MINUTE_LEASE, owner, d.clock.nowMs(), LEASE_TTL_MS))) {
      locked = true;
      return { status: 'locked', cursor: null, claimed: 0, notified: 0, keeper: null };
    }
    const alerts = await Alerts.load(alertDeps(d));
    try {
      await syncEvents(d, sync);
    } catch (e) {
      sync.status = 'failed';
      d.log.error('cron.sync_failed', errorFields(e));
    }
    try {
      keeper = await runKeeper(d, alerts);
    } catch (e) {
      d.log.error('keeper.failed', errorFields(e));
    }
    await alerts.set(
      'keeper-key',
      d.chain.keeper.error !== null,
      'KEEPER_KEY is set but is not a valid private key, so the keeper runs in dry-run. Set it again with: npx wrangler secret put KEEPER_KEY',
    );
    const beat: CronBeat = { at: isoAt(d.clock.nowMs()), cursor: sync.cursor === null ? null : sync.cursor.toString(), status: sync.status, keeper: d.chain.keeper };
    await d.store.setMetas(sync.status === 'failed' ? [['cron', beat]] : [['cron', beat], ['cron:ok', beat]], d.clock.nowMs());
  } catch (e) {
    sync.status = 'failed';
    d.log.error('cron.failed', errorFields(e));
  } finally {
    if (!locked) {
      try {
        await d.store.releaseLease(MINUTE_LEASE, owner);
      } catch (e) {
        d.log.error('cron.lease_release_failed', errorFields(e));
      }
    }
    d.log.info('cron.minute', {
      status: locked ? 'locked' : sync.status,
      cursor: sync.cursor,
      claimed: sync.claimed,
      notified: sync.notified,
      keeper,
      fetches: d.budget.fetches,
      queries: d.budget.queries,
      ms: Date.now() - started,
    });
  }
  return { status: sync.status, cursor: sync.cursor, claimed: sync.claimed, notified: sync.notified, keeper };
}
```

Ghi chú cho người thực thi:
- Vault được tạo trong khoảng đang quét mà chưa xử lý (vì hết ngân sách) thì chưa có dòng trong `vaults`. `knownVaults(cursor)` chỉ lấy vault có `created_block <= cursor`, nên lần sau `scan` lại thấy nó trong `created`. Không vault nào bị mất.
- `applyVault` claim event trong cùng batch với lệnh thêm vault và lưu view. Nếu Worker chết giữa batch và lúc gửi tin, tin đó mất, nhưng không bao giờ gửi hai lần (Quyết định 13).
- `crypto.randomUUID()` có sẵn cả trong workerd lẫn Node 24, nên `runMinute` chạy được ở cả hai nơi (Task 10, 12).
- `ms` trong log đo bằng `Date.now()`. Trong workerd, đồng hồ chỉ nhảy sau I/O, nên con số này là thời gian chờ I/O, không phải CPU. CPU thật đọc từ Workers Logs (`cpuTime`, Task 12).

- [ ] **Step 8: Chạy test**

Run: `npm test -w apps/worker -- alerts minute`
Expected: 12 test PASS (2 `Alerts`, 10 `runMinute`).

Muốn thấy test ngân sách bắt lỗi thì tạm đổi `if (out.status !== 'ok') return;` thành `if (false) return;`. Test "stops between vaults…" sẽ FAIL ở `getCursor()` vì cursor bị ghi khi còn vault chưa xử lý. Trả lại như cũ thì test PASS.

- [ ] **Step 9: Kiểm toàn bộ và commit**

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker`
Expected: mọi test PASS; `tsc` và Biome sạch.

```bash
git add apps/worker/src/cron/alerts.ts apps/worker/src/cron/minute.ts apps/worker/test/workers/fakes.ts apps/worker/test/workers/alerts.test.ts apps/worker/test/workers/minute.test.ts
git commit -m "feat(worker): minute cron with event sync, notices, keeper and ops alerts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Cron integrity, `Runtime` và handler `scheduled`

**Files:**
- Create: `apps/worker/src/cron/integrity.ts`, `apps/worker/src/runtime.ts`, `apps/worker/src/worker.ts`
- Modify: `apps/worker/src/index.ts`
- Test: `apps/worker/test/workers/integrity.test.ts`

**Interfaces:**
- Consumes:
  - SDK: `toJson`.
  - Task 2: `readConfig`, `Budget`, `systemClock`, `isoAt`, `createLogger`, `errorFields`, `metered`, `Store`, kiểu `CronBeat`, `IntegrityRecord`, `IntegrityReportJson`.
  - Task 3: `createSdkChain`. Task 4: `telegramNotifier`.
  - Task 5: `CronDeps`, `runMinute`, `Alerts`, `alertDeps`, và các bản giả trong `fakes.ts`.
- Produces:
  - **`cron/integrity.ts`:** `CRON_STALL_SEC = 300`; `type IntegrityStatus = 'pass' | 'fail' | 'error'`; `runIntegrity(d: CronDeps): Promise<{ status: IntegrityStatus }>`.
  - **`runtime.ts`:**
    - `type Scope = 'http' | 'cron'`
    - `interface Runtime extends CronDeps {}`: cùng bảy field `config`, `budget`, `store`, `chain`, `notifier`, `clock`, `log`
    - `type RuntimeFactory = (env: Env, scope: Scope, fields?: Fields) => Runtime`
    - `defaultRuntime: RuntimeFactory`. Chỉ scope `cron` mới nhận `KEEPER_KEY`.
  - **`worker.ts`:** `MINUTE_CRON = '* * * * *'`, `INTEGRITY_CRON = '*/10 * * * *'`; `createWorker(make?: RuntimeFactory)` trả `{ fetch, scheduled }`. Task 7 thay `fetch` bằng app Hono.

- [ ] **Step 1: Viết test (thất bại)**

`apps/worker/test/workers/integrity.test.ts`:

```ts
import { createExecutionContext, createScheduledController } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { AtropyleError } from '@atropyle/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { runIntegrity } from '../../src/cron/integrity';
import { defaultRuntime } from '../../src/runtime';
import type { CronBeat, IntegrityRecord } from '../../src/types';
import { createWorker, INTEGRITY_CRON, MINUTE_CRON } from '../../src/worker';
import { deps, okIntegrity, testStore, type World, world } from './fakes';
import { resetDb } from './helpers';

const opsTexts = (w: World) => w.notifier.sent.filter((m) => m.chatId === '-100').map((m) => m.text);

describe('runIntegrity', () => {
  let w: World;
  beforeEach(async () => {
    await resetDb();
    w = world({ OPS_CHAT_ID: '-100' });
  });

  it('stores the latest report, and alerts ops once when a check fails', async () => {
    w.chain.integrityImpl = async () =>
      okIntegrity({ ok: false, checks: [{ name: 'factory.code', ok: true }, { name: 'cpu.policyHash', ok: false, expected: '0x01', actual: '0x02' }] });
    expect(await runIntegrity(deps(w))).toEqual({ status: 'fail' });
    const saved = await testStore().getMeta<IntegrityRecord>('integrity');
    expect(saved?.value).toMatchObject({ checkedAt: '2027-01-15T08:00:00.000Z', blockNumber: '200', report: { ok: false, blockTimestamp: '1800000000' } });
    await runIntegrity(deps(w));
    expect(opsTexts(w)).toEqual([
      '[Atropyle ops] Integrity check failed at block 200: cpu.policyHash. Do not trust the deployment until this is explained. Details: GET /v1/integrity',
    ]);

    w.chain.integrityImpl = async () => okIntegrity();
    expect(await runIntegrity(deps(w))).toEqual({ status: 'pass' });
    expect(opsTexts(w)[1]).toBe('[Atropyle ops] Resolved: integrity.');
  });

  it('alerts when the check cannot run, and keeps the last good report', async () => {
    await runIntegrity(deps(w));
    w.clock.advance(600);
    w.chain.integrityImpl = async () => {
      throw new AtropyleError('QUORUM_UNAVAILABLE');
    };
    expect(await runIntegrity(deps(w))).toEqual({ status: 'error' });
    expect((await testStore().getMeta<IntegrityRecord>('integrity'))?.value.checkedAt).toBe('2027-01-15T08:00:00.000Z');
    expect(opsTexts(w)).toEqual(['[Atropyle ops] The integrity check could not run: QUORUM_UNAVAILABLE. It retries in 10 minutes.']);
  });

  it('alerts when the minute cron has not succeeded for more than 5 minutes', async () => {
    await runIntegrity(deps(w));
    expect(opsTexts(w)).toEqual([]);
    const beat: CronBeat = { at: '2027-01-15T08:00:00.000Z', cursor: '200', status: 'ok', keeper: { address: null, error: null } };
    await testStore().setMeta('cron:ok', beat, w.clock.nowMs());
    w.clock.advance(300);
    await runIntegrity(deps(w));
    expect(opsTexts(w)).toEqual([]);
    w.clock.advance(1);
    await runIntegrity(deps(w));
    expect(opsTexts(w)).toEqual([
      '[Atropyle ops] No successful minute cron for 5 minutes (last at 2027-01-15T08:00:00.000Z). Check cron.minute in Workers Logs.',
    ]);
  });
});

describe('createWorker and defaultRuntime', () => {
  beforeEach(resetDb);

  it('routes each cron expression to its job', async () => {
    const w = world();
    const worker = createWorker(() => deps(w));
    await worker.scheduled(createScheduledController({ cron: INTEGRITY_CRON }), env, createExecutionContext());
    expect(w.chain.calls).toEqual(['integrity']);
    w.chain.calls = [];
    await worker.scheduled(createScheduledController({ cron: MINUTE_CRON }), env, createExecutionContext());
    expect(w.chain.calls).toEqual(['scan:null', 'stats:null->200']);
  });

  it('gives KEEPER_KEY to the cron only, and refuses malformed vars', () => {
    const vars = { ...env, CHAIN: 'local', KEEPER_KEY: 'not-a-key' };
    expect(defaultRuntime(vars, 'cron').chain.keeper).toEqual({ address: null, error: 'KEEPER_KEY_INVALID' });
    expect(defaultRuntime(vars, 'http').chain.keeper).toEqual({ address: null, error: null });
    expect(defaultRuntime({ ...vars, KEEPER_KEY: undefined }, 'cron').chain.keeper).toEqual({ address: null, error: null });
    expect(() => defaultRuntime({ ...vars, SCAN_MAX_BLOCKS: 'lots' }, 'cron')).toThrow('SCAN_MAX_BLOCKS');
  });
});
```

`not-a-key` không phải khoá, chỉ để `privateKeyToAccount` ném lỗi. Test không tạo hay đọc khoá thật nào.

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npm test -w apps/worker -- integrity`
Expected: FAIL, không resolve được `../../src/cron/integrity`.

- [ ] **Step 3: Viết `cron/integrity.ts`**

`apps/worker/src/cron/integrity.ts`:

```ts
import { toJson } from '@atropyle/sdk';
import { isoAt } from '../clock';
import { errorFields } from '../log';
import type { CronBeat, IntegrityRecord, IntegrityReportJson } from '../types';
import { Alerts } from './alerts';
import { alertDeps, type CronDeps } from './minute';

/** The minute cron counts as stalled when its last successful run is older than this. */
export const CRON_STALL_SEC = 300;
export type IntegrityStatus = 'pass' | 'fail' | 'error';

/** The 10-minute cron (INTEGRITY_CRON): cheap integrity checks (spec §5.2, §9.5) and the watchdog of the minute cron. */
export async function runIntegrity(d: CronDeps): Promise<{ status: IntegrityStatus }> {
  const alerts = await Alerts.load(alertDeps(d));
  const beat = await d.store.getMeta<CronBeat>('cron:ok');
  if (beat) {
    const ageSec = Math.floor((d.clock.nowMs() - beat.updatedAt) / 1000);
    await alerts.set(
      'cron-stalled',
      ageSec > CRON_STALL_SEC,
      `No successful minute cron for ${Math.floor(ageSec / 60)} minutes (last at ${beat.value.at}). Check cron.minute in Workers Logs.`,
    );
  }

  let status: IntegrityStatus;
  try {
    const report = await d.chain.integrity();
    const record: IntegrityRecord = {
      checkedAt: isoAt(d.clock.nowMs()),
      blockNumber: report.blockNumber.toString(),
      report: toJson(report) as IntegrityReportJson,
    };
    await d.store.setMeta('integrity', record, d.clock.nowMs());
    status = report.ok ? 'pass' : 'fail';
    const failing = report.checks.filter((c) => !c.ok).map((c) => c.name);
    await alerts.set('integrity-error', false, '');
    await alerts.set(
      'integrity',
      !report.ok,
      `Integrity check failed at block ${report.blockNumber}: ${failing.join(', ') || 'see the report'}. Do not trust the deployment until this is explained. Details: GET /v1/integrity`,
    );
  } catch (e) {
    status = 'error';
    const err = errorFields(e);
    d.log.warn('integrity.failed', err);
    await alerts.set('integrity-error', true, `The integrity check could not run: ${err.code}. It retries in 10 minutes.`);
  }
  d.log.info('cron.integrity', { status, fetches: d.budget.fetches, queries: d.budget.queries });
  return { status };
}
```

Tên check và mã lỗi là hằng số của SDK, không phải chuỗi đọc từ chain, nên đưa vào tin nhắn được.

- [ ] **Step 4: Viết `runtime.ts`, `worker.ts` và sửa `index.ts`**

`apps/worker/src/runtime.ts`:

```ts
import { Budget } from './budget';
import { createSdkChain } from './chain/sdk';
import { systemClock } from './clock';
import { readConfig } from './config';
import type { CronDeps } from './cron/minute';
import type { Env } from './env';
import { createLogger, type Fields } from './log';
import { metered } from './store/d1';
import { Store } from './store/store';
import { telegramNotifier } from './telegram/client';

export type Scope = 'http' | 'cron';

/** Everything one invocation needs. Built fresh per request and per cron run (Quyết định 16). */
export interface Runtime extends CronDeps {}

export type RuntimeFactory = (env: Env, scope: Scope, fields?: Fields) => Runtime;

/**
 * The production wiring. Only the cron gets KEEPER_KEY: an HTTP request never builds the keeper wallet (Quyết định 18).
 * readConfig throws on a malformed var, so a misconfigured Worker fails loudly instead of guessing.
 */
export const defaultRuntime: RuntimeFactory = (env, scope, fields = {}) => {
  const config = readConfig(env);
  const budget = new Budget(config.budget);
  const log = createLogger({ scope, ...fields });
  return {
    config,
    budget,
    log,
    clock: systemClock,
    store: new Store(metered(env.DB, budget)),
    chain: createSdkChain({ chain: config.chain, budget, keeperKey: scope === 'cron' ? env.KEEPER_KEY : undefined }),
    notifier: telegramNotifier({ token: env.TELEGRAM_TOKEN, budget, log }),
  };
};
```

`interface Runtime extends CronDeps {}` có thể bị Biome báo `noEmptyInterface`. Nếu vậy thì đổi thành `export type Runtime = CronDeps;`. Hai cách viết tương đương với mọi nơi dùng.

`apps/worker/src/worker.ts`:

```ts
import { runIntegrity } from './cron/integrity';
import { runMinute } from './cron/minute';
import type { Env } from './env';
import { defaultRuntime, type RuntimeFactory } from './runtime';

export const MINUTE_CRON = '* * * * *';
export const INTEGRITY_CRON = '*/10 * * * *';

/** The Worker. `make` is replaceable so that tests run the real handlers on fakes. */
export function createWorker(make: RuntimeFactory = defaultRuntime) {
  return {
    async fetch(): Promise<Response> {
      return new Response('Atropyle worker', { status: 200 });
    },
    async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
      const rt = make(env, 'cron', { cron: controller.cron });
      if (controller.cron === INTEGRITY_CRON) await runIntegrity(rt);
      else await runMinute(rt);
    },
  } satisfies ExportedHandler<Env>;
}
```

`apps/worker/src/index.ts` (thay toàn bộ):

```ts
import { createWorker } from './worker';

export default createWorker();
```

Mọi chuỗi cron khác `*/10 * * * *` đều chạy `runMinute`. Nhờ vậy lệnh thử cục bộ `curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=*+*+*+*+*"` (Quyết định 7) chạy đúng cron mỗi phút.

- [ ] **Step 5: Chạy test**

Run: `npm test -w apps/worker -- integrity`
Expected: 5 test PASS (3 `runIntegrity`, 2 `createWorker and defaultRuntime`).

- [ ] **Step 6: Kiểm toàn bộ, bundle và commit**

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker && npm run check:bundle -w apps/worker`
Expected: mọi test PASS; `tsc` và Biome sạch; `wrangler deploy --dry-run` build xong và in danh sách binding (`DB`, `RATE_LIMITER`, các var), không deploy gì.

```bash
git add apps/worker/src/cron/integrity.ts apps/worker/src/runtime.ts apps/worker/src/worker.ts apps/worker/src/index.ts apps/worker/test/workers/integrity.test.ts
git commit -m "feat(worker): integrity cron, per-invocation runtime and scheduled handler" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Nền HTTP — app Hono, problem+json, CORS, rate limit và request id

**Files:**
- Create: `apps/worker/src/problem.ts`, `apps/worker/src/ratelimit.ts`, `apps/worker/src/app.ts`
- Modify: `apps/worker/src/worker.ts` (`fetch` dùng app Hono)
- Test: `apps/worker/test/workers/app.test.ts`

**Interfaces:**
- Consumes:
  - SDK: `decodeError`, `ERROR_INFO`, `errorDocsUrl`, `isTransportError`, kiểu `ErrorCode`.
  - Hono 4.13.19: `Hono`, `cors` (`hono/cors`), kiểu `MiddlewareHandler`.
  - Task 1: `Env`, `RateLimiterLike`. Task 2: `createLogger`, `errorFields`. Task 6: `Runtime`, `RuntimeFactory`, `defaultRuntime`, `createWorker`.
- Produces:
  - **`problem.ts`:**
    - `API_ERRORS` gồm `NOT_FOUND` (404), `RATE_LIMITED` (429), `UNAUTHORIZED` (401), `NOT_READY` (503), mỗi mã có `title` và `status` (gap G2)
    - `type ApiCode = keyof typeof API_ERRORS`; `type ProblemCode = ErrorCode | ApiCode`
    - `interface Problem { type: string; title: string; status: number; code: ProblemCode; detail: string }`
    - `problemOf(code: ProblemCode, detail: string, status?: number): Problem`
    - `problemFromError(e: unknown): Problem`: lỗi transport → 503; `INVALID_ADDRESS` → 400; `NOT_VAULT` → 404; còn lại → 500 `UNKNOWN` với detail `Unexpected error.`
    - `problem(p: Problem, headers?: Record<string, string>): Response`: body JSON, `Content-Type: application/problem+json`, `Cache-Control: no-store`. Route nào cũng trả lỗi qua hàm này. Hàm nằm ở `problem.ts` chứ không ở `app.ts`, để `routes/*` không import vòng qua `app.ts`.
  - **`ratelimit.ts`:** `memoryLimiter(limit: number, periodMs: number, now?: () => number): RateLimiterLike`; `FALLBACK_API` (120/60 s), `FALLBACK_MCP` (20/60 s).
  - **`app.ts`:**
    - `interface AppEnv { Bindings: Env; Variables: { requestId: string; rt: Runtime } }`
    - `CORS_OPTIONS`
    - `rateLimit(kind: 'api' | 'mcp'): MiddlewareHandler<AppEnv>`
    - `createApp(make?: RuntimeFactory): Hono<AppEnv>`. Task 8 trở đi gắn route vào app này.

Thứ tự middleware:
1. Request id: lấy `cf-ray`, không có thì `crypto.randomUUID()`. Dựng `Runtime` cho scope `http` (không có `KEEPER_KEY`). Sau `next()` thì gắn header `X-Request-Id` và ghi một dòng log `http`.
2. CORS cho `/health` và `/v1/*`: origin `*`, method `GET` và `OPTIONS`, expose `Retry-After` và `X-Request-Id`, max-age 86400.
3. Rate limit cho `/health` và `/v1/*`, theo IP (`cf-connecting-ip`):
   - dùng binding `RATE_LIMITER`; thiếu binding thì dùng bộ đếm trong bộ nhớ;
   - vượt ngưỡng thì trả 429 problem+json kèm `Retry-After: 60`;
   - limiter ném lỗi thì cho qua (fail open) và ghi log `ratelimit.failed`.

`/telegram/webhook` không bị rate limit, vì nó đã có secret header và Telegram tự giãn nhịp gửi.

- [ ] **Step 1: Viết test (thất bại)**

`apps/worker/test/workers/app.test.ts`:

```ts
import { createExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { AtropyleError, errorDocsUrl } from '@atropyle/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { memoryLimiter } from '../../src/ratelimit';
import type { RuntimeFactory } from '../../src/runtime';
import { createWorker } from '../../src/worker';
import { deps, type World, world } from './fakes';
import { resetDb } from './helpers';

const allow = { limit: async () => ({ success: true }) };

describe('createApp', () => {
  let w: World;
  // Like defaultRuntime, each request's log carries the fields the app passes in (the request id).
  const make: RuntimeFactory = (_env, _scope, fields = {}) => {
    const d = deps(w);
    return { ...d, log: d.log.child(fields) };
  };
  const app = () => {
    const a = createApp(make);
    a.get('/v1/echo', (c) => c.json({ ok: true }));
    a.get('/v1/boom-rpc', () => {
      throw new AtropyleError('RPC_UNAVAILABLE');
    });
    a.get('/v1/boom', () => {
      throw new Error('internal detail 1234');
    });
    return a;
  };
  beforeEach(async () => {
    await resetDb();
    w = world();
  });

  it('adds a request id, CORS headers and one JSON log line to every response', async () => {
    const res = await app().request('/v1/echo', { headers: { 'cf-ray': 'ray-1', Origin: 'https://example.org' } }, { ...env, RATE_LIMITER: allow });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Request-Id')).toBe('ray-1');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('Retry-After');
    expect(w.lines.some((l) => l.includes('"msg":"http"') && l.includes('"status":200') && l.includes('"requestId":"ray-1"'))).toBe(true);
    const other = await app().request('/v1/echo', {}, { ...env, RATE_LIMITER: allow });
    expect(other.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers a CORS preflight without touching the route', async () => {
    const res = await app().request(
      '/v1/echo',
      { method: 'OPTIONS', headers: { Origin: 'https://example.org', 'Access-Control-Request-Method': 'GET' } },
      { ...env, RATE_LIMITER: allow },
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
  });

  it('rate limits by IP with a 429 problem and Retry-After, and fails open when the limiter breaks', async () => {
    const keys: string[] = [];
    const deny = {
      limit: async ({ key }: { key: string }) => {
        keys.push(key);
        return { success: false };
      },
    };
    const res = await app().request('/v1/echo', { headers: { 'cf-connecting-ip': '203.0.113.7' } }, { ...env, RATE_LIMITER: deny });
    expect(res.status).toBe(429);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(await res.json()).toEqual({
      type: errorDocsUrl('RATE_LIMITED'),
      title: 'Too many requests.',
      status: 429,
      code: 'RATE_LIMITED',
      detail: 'The limit is 120 requests per minute per IP. Try again in a minute.',
    });
    expect(keys).toEqual(['203.0.113.7']);

    const broken = {
      limit: async () => {
        throw new Error('limiter down');
      },
    };
    expect((await app().request('/v1/echo', {}, { ...env, RATE_LIMITER: broken })).status).toBe(200);
    expect(w.lines.some((l) => l.includes('"ratelimit.failed"'))).toBe(true);
  });

  it('maps errors to problem+json without leaking internals', async () => {
    const e = { ...env, RATE_LIMITER: allow };
    const rpc = await app().request('/v1/boom-rpc', {}, e);
    expect(rpc.status).toBe(503);
    expect(await rpc.json()).toMatchObject({ code: 'RPC_UNAVAILABLE', status: 503, type: errorDocsUrl('RPC_UNAVAILABLE') });
    const boom = await app().request('/v1/boom', {}, e);
    expect(boom.status).toBe(500);
    const body = await boom.text();
    expect(JSON.parse(body)).toMatchObject({ code: 'UNKNOWN', detail: 'Unexpected error.' });
    expect(body).not.toContain('internal detail');
    expect(w.lines.some((l) => l.includes('"http.error"'))).toBe(true);
    const missing = await app().request('/nope', {}, e);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: 'NOT_FOUND', type: errorDocsUrl('NOT_FOUND') });
  });

  it('answers 500 problem+json when the Worker is misconfigured, and the Worker serves this app', async () => {
    const broken = createApp(() => {
      throw new Error('SCAN_MAX_BLOCKS must be a whole number, got "lots"');
    });
    const res = await broken.request('/v1/stats', {}, { ...env, RATE_LIMITER: allow });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: 'UNKNOWN' });

    const worker = createWorker(() => deps(w));
    const res404 = await worker.fetch(new Request('https://worker.test/nope'), env, createExecutionContext());
    expect(res404.status).toBe(404);
    expect(res404.headers.get('Content-Type')).toBe('application/problem+json');
  });
});

describe('memoryLimiter', () => {
  it('counts per key in fixed windows', async () => {
    let t = 0;
    const limiter = memoryLimiter(3, 60_000, () => t);
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push((await limiter.limit({ key: 'a' })).success);
    expect(results).toEqual([true, true, true, false]);
    expect((await limiter.limit({ key: 'b' })).success).toBe(true);
    t = 60_000;
    expect((await limiter.limit({ key: 'a' })).success).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npm test -w apps/worker -- app`
Expected: FAIL, không resolve được `../../src/app`.

- [ ] **Step 3: Viết `problem.ts` và `ratelimit.ts`**

`apps/worker/src/problem.ts`:

```ts
import { decodeError, ERROR_INFO, type ErrorCode, errorDocsUrl, isTransportError } from '@atropyle/sdk';

/** API-only error codes (gap G2). Until the SDK adds them to ERROR_INFO, the docs anchors come from this table. */
export const API_ERRORS = {
  NOT_FOUND: { title: 'Not found.', status: 404 },
  RATE_LIMITED: { title: 'Too many requests.', status: 429 },
  UNAUTHORIZED: { title: 'Missing or wrong credentials.', status: 401 },
  NOT_READY: { title: 'The data is not ready yet.', status: 503 },
} as const satisfies Record<string, { title: string; status: number }>;

export type ApiCode = keyof typeof API_ERRORS;
export type ProblemCode = ErrorCode | ApiCode;

/** RFC 9457 problem details, plus the stable `code`. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  code: ProblemCode;
  detail: string;
}

const isApiCode = (code: ProblemCode): code is ApiCode => Object.hasOwn(API_ERRORS, code);

export function problemOf(code: ProblemCode, detail: string, status?: number): Problem {
  if (isApiCode(code)) return { type: errorDocsUrl(code), title: API_ERRORS[code].title, status: status ?? API_ERRORS[code].status, code, detail };
  return { type: errorDocsUrl(code), title: ERROR_INFO[code].message, status: status ?? 500, code, detail };
}

/** Maps a thrown error to a problem. Only fixed texts reach the client: messages of unknown errors stay in the log. */
export function problemFromError(e: unknown): Problem {
  const err = decodeError(e);
  if (isTransportError(err)) return problemOf(err.code, 'Could not read X Layer reliably right now. Try again shortly.', 503);
  if (err.code === 'INVALID_ADDRESS') return problemOf('INVALID_ADDRESS', 'The address is not a valid 0x address.', 400);
  if (err.code === 'NOT_VAULT') return problemOf('NOT_VAULT', 'This address is not a vault created by the Atropyle factory.', 404);
  return problemOf('UNKNOWN', 'Unexpected error.', 500);
}

/** The one way every route answers with an error. Middleware still adds CORS and X-Request-Id to it. */
export function problem(p: Problem, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(p), {
    status: p.status,
    headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store', ...headers },
  });
}
```

`Object.hasOwn` có trong ES2022, khớp `lib` của `tsconfig.json`.

`apps/worker/src/ratelimit.ts`:

```ts
import type { RateLimiterLike } from './env';

/**
 * Fixed-window counter in the isolate's memory. Used only when a rate limit binding is missing
 * (Quyết định 6): one isolate does not see the others, so this is a soft limit, not a guarantee.
 */
export function memoryLimiter(limit: number, periodMs: number, now: () => number = Date.now): RateLimiterLike {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    async limit({ key }) {
      const t = now();
      let w = windows.get(key);
      if (!w || t - w.start >= periodMs) {
        if (windows.size >= 10_000) {
          for (const [k, v] of windows) if (t - v.start >= periodMs) windows.delete(k);
        }
        w = { start: t, count: 0 };
        windows.set(key, w);
      }
      w.count += 1;
      return { success: w.count <= limit };
    },
  };
}

export const FALLBACK_API = memoryLimiter(120, 60_000);
export const FALLBACK_MCP = memoryLimiter(20, 60_000);
```

- [ ] **Step 4: Viết `app.ts`**

`apps/worker/src/app.ts`:

```ts
import { Hono, type MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './env';
import { createLogger, errorFields } from './log';
import { problem, problemFromError, problemOf } from './problem';
import { FALLBACK_API, FALLBACK_MCP } from './ratelimit';
import { defaultRuntime, type Runtime, type RuntimeFactory } from './runtime';

export interface AppEnv {
  Bindings: Env;
  Variables: { requestId: string; rt: Runtime };
}

export const CORS_OPTIONS = {
  origin: '*',
  allowMethods: ['GET', 'OPTIONS'],
  exposeHeaders: ['Retry-After', 'X-Request-Id'],
  maxAge: 86_400,
};

const LIMITS = { api: 120, mcp: 20 } as const;

/** Per-IP limit (Quyết định 6). The binding when present, else the in-memory fallback; fails open if the limiter throws. */
export function rateLimit(kind: 'api' | 'mcp'): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const limiter = kind === 'api' ? (c.env.RATE_LIMITER ?? FALLBACK_API) : (c.env.MCP_RATE_LIMITER ?? FALLBACK_MCP);
    const key = c.req.header('cf-connecting-ip') ?? 'unknown';
    let allowed = true;
    try {
      allowed = (await limiter.limit({ key })).success;
    } catch (e) {
      c.var.rt.log.warn('ratelimit.failed', errorFields(e));
    }
    if (!allowed) {
      const detail = `The limit is ${LIMITS[kind]} requests per minute per IP. Try again in a minute.`;
      return problem(problemOf('RATE_LIMITED', detail), { 'Retry-After': '60' });
    }
    await next();
  };
}

/** The HTTP side of the Worker. Routes are mounted by their own modules (Task 8 onward). */
export function createApp(make: RuntimeFactory = defaultRuntime): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.use('*', async (c, next) => {
    const requestId = c.req.header('cf-ray') ?? crypto.randomUUID();
    c.set('requestId', requestId);
    c.set('rt', make(c.env, 'http', { requestId }));
    const started = Date.now();
    await next();
    c.res.headers.set('X-Request-Id', requestId);
    const rt = c.var.rt;
    rt.log.info('http', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
      fetches: rt.budget.fetches,
      queries: rt.budget.queries,
    });
  });
  app.use('/health', cors(CORS_OPTIONS));
  app.use('/v1/*', cors(CORS_OPTIONS));
  app.use('/health', rateLimit('api'));
  app.use('/v1/*', rateLimit('api'));

  app.notFound(() => problem(problemOf('NOT_FOUND', 'No route matches this request.')));
  app.onError((e, c) => {
    const rt = c.var.rt as Runtime | undefined;
    (rt?.log ?? createLogger({ scope: 'http' })).error('http.error', { path: c.req.path, ...errorFields(e) });
    return problem(problemFromError(e));
  });
  return app;
}
```

Ghi chú cho người thực thi:
- Handler ném lỗi thì Hono gọi `onError` bên trong `compose`, nên `await next()` của middleware đầu tiên không ném. Dòng log `http` vẫn được ghi, với status của problem.
- `make` ném lỗi (var sai dạng) thì `rt` chưa có. `onError` dùng logger tạm và trả 500 `UNKNOWN`. Message có tên var nằm trong log, không nằm trong response.
- Không ghi header, query string hay body vào log, vì webhook Telegram mang secret trong header.

- [ ] **Step 5: Cho Worker phục vụ app**

Sửa `apps/worker/src/worker.ts`: thêm import, rồi thay `fetch` tạm bằng `app.fetch`:

```ts
import { createApp } from './app';
import { runIntegrity } from './cron/integrity';
import { runMinute } from './cron/minute';
import type { Env } from './env';
import { defaultRuntime, type RuntimeFactory } from './runtime';

export const MINUTE_CRON = '* * * * *';
export const INTEGRITY_CRON = '*/10 * * * *';

/** The Worker. `make` is replaceable so that tests run the real handlers on fakes. */
export function createWorker(make: RuntimeFactory = defaultRuntime) {
  const app = createApp(make);
  return {
    fetch: app.fetch,
    async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
      const rt = make(env, 'cron', { cron: controller.cron });
      if (controller.cron === INTEGRITY_CRON) await runIntegrity(rt);
      else await runMinute(rt);
    },
  } satisfies ExportedHandler<Env>;
}
```

- [ ] **Step 6: Chạy test**

Run: `npm test -w apps/worker -- app integrity`
Expected: 11 test PASS (5 `createApp`, 1 `memoryLimiter`, 5 của Task 6).

- [ ] **Step 7: Kiểm toàn bộ và commit**

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker && npm run check:bundle -w apps/worker`
Expected: mọi test PASS; `tsc`, Biome và `wrangler deploy --dry-run` sạch.

```bash
git add apps/worker/src/problem.ts apps/worker/src/ratelimit.ts apps/worker/src/app.ts apps/worker/src/worker.ts apps/worker/test/workers/app.test.ts
git commit -m "feat(worker): Hono app with problem+json, CORS, per-IP rate limit and request ids" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Route `/health`, `/v1/stats` và `/v1/integrity`

**Files:**
- Create: `apps/worker/src/routes/health.ts`, `apps/worker/src/routes/v1.ts`
- Modify: `apps/worker/src/app.ts` (gắn hai nhóm route)
- Test: `apps/worker/test/workers/routes.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `Store.getMetas`, `Store.getCursor`, `Store.getSummary`, `Store.getMeta`, kiểu `CronBeat`, `IntegrityRecord`, `KeeperStatus`.
  - Task 3: `ChainPort.probe`. Task 7: `AppEnv`, `problem`, `problemOf`.
- Produces:
  - **`routes/health.ts`:**
    - `CRON_FRESH_SEC = 300`, `INTEGRITY_FRESH_SEC = 1800`, `MAX_LAG_BLOCKS = 600`, `PROBE_TIMEOUT_MS = 3000`
    - `interface Health { schemaVersion: 1; status: 'ok' | 'degraded'; rpcs: { url: string; ok: boolean; ms: number | null }[]; lastCronAt: string | null; lastCronAgeSec: number | null; cursorLagBlocks: number | null; integrity: 'pass' | 'fail' | 'unknown'; keeper: { address: string | null; balance: string | null; dryRun: boolean } }`. Đúng hình dạng trong hợp đồng giữa các plan; Plan 4 đọc nó.
    - `mountHealth(app: Hono<AppEnv>): void`
  - **`routes/v1.ts`:** `mountV1(app: Hono<AppEnv>): void`, với:
    - `GET /v1/stats` → `{ schemaVersion: 1, updatedAt, stats: StatsJson }`;
    - `GET /v1/integrity` → `{ schemaVersion: 1, checkedAt, blockNumber, report: IntegrityReportJson }`;
    - chưa có dữ liệu thì 503 `NOT_READY` kèm `Retry-After: 60`.

`/health` báo `degraded` khi có ít nhất một điều sau:
- một RPC không trả lời;
- chưa có lần cron thành công nào, hoặc lần gần nhất cũ hơn 300 s;
- integrity gần nhất `fail`;
- `KEEPER_KEY` sai dạng (`keeper.error` trong nhịp cron);
- keeper dừng vì hết gas (`LOW_BALANCE`);
- cursor chậm hơn đầu chain quá 600 block.

Integrity cũ hơn 30 phút thì báo `unknown`. `/health` luôn trả 200 với `Cache-Control: no-store`, kể cả khi `degraded`. Lý do cụ thể chỉ ghi vào log (`health.degraded`), không đưa vào body, để body giữ đúng hợp đồng.

- [ ] **Step 1: Viết test (thất bại)**

`apps/worker/test/workers/routes.test.ts`:

```ts
import { env } from 'cloudflare:workers';
import { errorDocsUrl, toJson } from '@atropyle/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { isoAt } from '../../src/clock';
import type { Store } from '../../src/store/store';
import type { CronBeat, IntegrityRecord, IntegrityReportJson, KeeperStatus } from '../../src/types';
import { deps, KEEPER, okIntegrity, testStore, type World, world } from './fakes';
import { resetDb } from './helpers';

const allow = { limit: async () => ({ success: true }) };
const ONE_OKB = '1000000000000000000';

let w: World;
let store: Store;
let now: number;
const get = async (path: string) => createApp(() => deps(w)).request(path, {}, { ...env, RATE_LIMITER: allow });
const beat = (over: Partial<CronBeat> = {}): CronBeat => ({
  at: isoAt(now - 30_000),
  cursor: '150',
  status: 'ok',
  keeper: { address: KEEPER, error: null },
  ...over,
});
const integrityRecord = (ok: boolean, ageMs = 300_000): IntegrityRecord => ({
  checkedAt: isoAt(now - ageMs),
  blockNumber: '190',
  report: toJson(okIntegrity({ ok, blockNumber: 190n })) as IntegrityReportJson,
});
const keeperStatus = (over: Partial<KeeperStatus> = {}): KeeperStatus => ({
  ranAt: isoAt(now - 30_000),
  address: KEEPER,
  balance: ONE_OKB,
  dryRun: false,
  stopped: null,
  sent: 0,
  failed: 0,
  ...over,
});

/** A Worker whose last minute cron ran 30 s ago at block 150, with a passing integrity check from 5 minutes ago. */
async function seedHealthy(): Promise<void> {
  await store.setMeta('cron', beat(), now - 30_000);
  await store.setMeta('cron:ok', beat(), now - 30_000);
  await store.setMeta('integrity', integrityRecord(true), now - 300_000);
  await store.setMeta('keeper', keeperStatus(), now - 30_000);
  await store.commitCursor({
    cursor: 150n,
    counters: { aliveEvents: 1, alarms: 0, releases: 0, distributions: 0 },
    summary: {
      updatedAt: isoAt(now - 30_000),
      stats: { fromBlock: '100', toBlock: '150', vaults: { total: 1, drill: 1, paid: 0 }, owners: 1, checkIns: 0, alarms: 0, releases: 0, distributions: 0 },
    },
  });
}

beforeEach(async () => {
  await resetDb();
  w = world();
  store = testStore();
  now = w.clock.nowMs();
});

describe('GET /health', () => {
  it('reports ok with the exact contract shape when everything is fine', async () => {
    await seedHealthy();
    const res = await get('/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({
      schemaVersion: 1,
      status: 'ok',
      rpcs: [{ url: 'https://rpc.test/a', ok: true, ms: 12 }],
      lastCronAt: '2027-01-15T07:59:30.000Z',
      lastCronAgeSec: 30,
      cursorLagBlocks: 50,
      integrity: 'pass',
      keeper: { address: KEEPER, balance: ONE_OKB, dryRun: false },
    });
  });

  it.each([
    ['an RPC is down', async () => {
      w.chain.probes = [...w.chain.probes, { url: 'https://rpc.test/b', ok: false, ms: null, head: null }];
    }],
    ['the cron never succeeded', async () => {
      await env.DB.prepare("DELETE FROM meta WHERE key = 'cron:ok'").run();
    }],
    ['the last good cron is over 5 minutes old', async () => {
      w.clock.advance(300);
    }],
    ['the integrity check failed', async () => {
      await store.setMeta('integrity', integrityRecord(false), now);
    }],
    ['KEEPER_KEY is malformed', async () => {
      await store.setMeta('cron', beat({ keeper: { address: null, error: 'KEEPER_KEY_INVALID' } }), now);
    }],
    ['the keeper stopped on low balance', async () => {
      await store.setMeta('keeper', keeperStatus({ balance: '1000', stopped: 'LOW_BALANCE' }), now);
    }],
    ['the cursor lags more than 600 blocks', async () => {
      w.chain.probes = [{ url: 'https://rpc.test/a', ok: true, ms: 12, head: 751n }];
    }],
  ])('is degraded, still with HTTP 200, when %s', async (_name, breakIt) => {
    await seedHealthy();
    await breakIt();
    const res = await get('/health');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('degraded');
    expect(w.lines.some((l) => l.includes('"health.degraded"'))).toBe(true);
  });

  it('shows a malformed KEEPER_KEY as a dry-run keeper without an address or balance', async () => {
    await seedHealthy();
    await store.setMeta('cron', beat({ keeper: { address: null, error: 'KEEPER_KEY_INVALID' } }), now);
    const body = (await (await get('/health')).json()) as { keeper: unknown };
    expect(body.keeper).toEqual({ address: null, balance: null, dryRun: true });
  });

  it('reports integrity as unknown when there is no check, or the last one is over 30 minutes old', async () => {
    const empty = (await (await get('/health')).json()) as Record<string, unknown>;
    expect(empty).toMatchObject({ status: 'degraded', integrity: 'unknown', lastCronAt: null, lastCronAgeSec: null, cursorLagBlocks: null });
    await seedHealthy();
    w.clock.advance(1501);
    expect(((await (await get('/health')).json()) as { integrity: string }).integrity).toBe('unknown');
  });
});

describe('GET /v1/stats and /v1/integrity', () => {
  it('answer 503 NOT_READY before the first runs', async () => {
    for (const path of ['/v1/stats', '/v1/integrity']) {
      const res = await get(path);
      expect(res.status).toBe(503);
      expect(res.headers.get('Retry-After')).toBe('60');
      expect(await res.json()).toMatchObject({ code: 'NOT_READY', type: errorDocsUrl('NOT_READY') });
    }
  });

  it('serve the stored summary and the latest integrity report, cacheable', async () => {
    await seedHealthy();
    const stats = await get('/v1/stats');
    expect(stats.headers.get('Cache-Control')).toBe('public, max-age=30');
    expect(await stats.json()).toEqual({
      schemaVersion: 1,
      updatedAt: '2027-01-15T07:59:30.000Z',
      stats: { fromBlock: '100', toBlock: '150', vaults: { total: 1, drill: 1, paid: 0 }, owners: 1, checkIns: 0, alarms: 0, releases: 0, distributions: 0 },
    });
    const integrity = await get('/v1/integrity');
    expect(integrity.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(await integrity.json()).toEqual({
      schemaVersion: 1,
      checkedAt: '2027-01-15T07:55:00.000Z',
      blockNumber: '190',
      report: { ok: true, chainId: 196, blockNumber: '190', blockTimestamp: '1800000000', rpcs: 2, checks: [{ name: 'factory.code', ok: true }], warnings: [] },
    });
  });
});
```

Biome có thể dàn lại các dòng `it.each`; nếu chỉ báo lỗi format thì chạy `npx biome check --write apps/worker`.

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npm test -w apps/worker -- routes`
Expected: FAIL. Mọi request trả 404 `NOT_FOUND`, vì chưa có route nào.

- [ ] **Step 3: Viết `routes/health.ts`**

`apps/worker/src/routes/health.ts`:

```ts
import type { Hono } from 'hono';
import type { AppEnv } from '../app';
import type { CronBeat, IntegrityRecord, KeeperStatus } from '../types';

export const CRON_FRESH_SEC = 300;
export const INTEGRITY_FRESH_SEC = 1800;
export const MAX_LAG_BLOCKS = 600;
export const PROBE_TIMEOUT_MS = 3000;

export interface Health {
  schemaVersion: 1;
  status: 'ok' | 'degraded';
  rpcs: { url: string; ok: boolean; ms: number | null }[];
  lastCronAt: string | null;
  lastCronAgeSec: number | null;
  cursorLagBlocks: number | null;
  integrity: 'pass' | 'fail' | 'unknown';
  keeper: { address: string | null; balance: string | null; dryRun: boolean };
}

type Row<T> = { value: T; updatedAt: number } | undefined;

export function mountHealth(app: Hono<AppEnv>): void {
  app.get('/health', async (c) => {
    const { store, chain, clock, log } = c.var.rt;
    const [metas, cursor, probes] = await Promise.all([
      store.getMetas(['cron', 'cron:ok', 'integrity', 'keeper']),
      store.getCursor(),
      chain.probe(PROBE_TIMEOUT_MS),
    ]);
    const now = clock.nowMs();
    const lastOk = metas.get('cron:ok') as Row<CronBeat>;
    const lastRun = metas.get('cron') as Row<CronBeat>;
    const integrityRow = metas.get('integrity') as Row<IntegrityRecord>;
    const keeperRow = metas.get('keeper') as Row<KeeperStatus>;

    const lastCronAgeSec = lastOk ? Math.max(0, Math.floor((now - lastOk.updatedAt) / 1000)) : null;
    const heads = probes.flatMap((p) => (p.ok && p.head !== null ? [p.head] : []));
    const head = heads.length > 0 ? heads.reduce((a, b) => (a > b ? a : b)) : null;
    const cursorLagBlocks = head !== null && cursor !== null ? Number(head > cursor ? head - cursor : 0n) : null;
    const integrity: Health['integrity'] =
      !integrityRow || now - integrityRow.updatedAt > INTEGRITY_FRESH_SEC * 1000 ? 'unknown' : integrityRow.value.report.ok ? 'pass' : 'fail';

    // The identity comes from the newest heartbeat: it reflects the KEEPER_KEY the cron saw last.
    const identity = (lastRun ?? lastOk)?.value.keeper ?? { address: null, error: null };
    const status = keeperRow?.value;
    const sameKeeper = !!status?.address && !!identity.address && status.address.toLowerCase() === identity.address.toLowerCase();

    const reasons = [
      probes.some((p) => !p.ok) ? 'rpc' : null,
      lastCronAgeSec === null || lastCronAgeSec > CRON_FRESH_SEC ? 'cron' : null,
      integrity === 'fail' ? 'integrity' : null,
      identity.error !== null ? 'keeper-key' : null,
      sameKeeper && status?.stopped === 'LOW_BALANCE' ? 'keeper-balance' : null,
      cursorLagBlocks !== null && cursorLagBlocks > MAX_LAG_BLOCKS ? 'lag' : null,
    ].filter((r) => r !== null);
    if (reasons.length > 0) log.warn('health.degraded', { reasons });

    const body: Health = {
      schemaVersion: 1,
      status: reasons.length > 0 ? 'degraded' : 'ok',
      rpcs: probes.map((p) => ({ url: p.url, ok: p.ok, ms: p.ms })),
      lastCronAt: lastOk?.value.at ?? null,
      lastCronAgeSec,
      cursorLagBlocks,
      integrity,
      keeper: { address: identity.address, balance: sameKeeper ? (status?.balance ?? null) : null, dryRun: identity.address === null },
    };
    return c.json(body, 200, { 'Cache-Control': 'no-store' });
  });
}
```

- [ ] **Step 4: Viết `routes/v1.ts` và gắn route vào app**

`apps/worker/src/routes/v1.ts`:

```ts
import type { Hono } from 'hono';
import type { AppEnv } from '../app';
import { problem, problemOf } from '../problem';
import type { IntegrityRecord } from '../types';

const RETRY = { 'Retry-After': '60' };

export function mountV1(app: Hono<AppEnv>): void {
  app.get('/v1/stats', async (c) => {
    const summary = await c.var.rt.store.getSummary();
    if (!summary) return problem(problemOf('NOT_READY', 'The first index run has not finished yet.'), RETRY);
    return c.json({ schemaVersion: 1, updatedAt: summary.updatedAt, stats: summary.stats }, 200, { 'Cache-Control': 'public, max-age=30' });
  });

  app.get('/v1/integrity', async (c) => {
    const row = await c.var.rt.store.getMeta<IntegrityRecord>('integrity');
    if (!row) return problem(problemOf('NOT_READY', 'The first integrity check has not run yet.'), RETRY);
    const { checkedAt, blockNumber, report } = row.value;
    return c.json({ schemaVersion: 1, checkedAt, blockNumber, report }, 200, { 'Cache-Control': 'public, max-age=60' });
  });
}
```

Trong `apps/worker/src/app.ts`, thêm hai import (sau dòng import `./ratelimit`):

```ts
import { mountHealth } from './routes/health';
import { mountV1 } from './routes/v1';
```

rồi gắn route ngay trước `app.notFound(...)`:

```ts
  mountHealth(app);
  mountV1(app);
```

Hai file route chỉ import kiểu `AppEnv` từ `app.ts` (esbuild xoá import kiểu), nên không có vòng import lúc chạy.

- [ ] **Step 5: Chạy test**

Run: `npm test -w apps/worker -- routes app`
Expected: 18 test PASS (12 của `routes`: 1 ok, 7 ca degraded, 1 keeper, 1 unknown, 2 `/v1`; và 6 của `app`).

- [ ] **Step 6: Kiểm toàn bộ và commit**

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker`
Expected: mọi test PASS; `tsc` và Biome sạch.

```bash
git add apps/worker/src/routes/health.ts apps/worker/src/routes/v1.ts apps/worker/src/app.ts apps/worker/test/workers/routes.test.ts
git commit -m "feat(worker): /health, /v1/stats and /v1/integrity" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Bot Telegram — lệnh, deep link và webhook

**Files:**
- Create: `apps/worker/src/bot/commands.ts`, `apps/worker/src/bot/webhook.ts`, `apps/worker/src/routes/telegram.ts`
- Modify: `apps/worker/src/app.ts` (gắn route webhook)
- Test: `apps/worker/test/workers/webhook.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `Store` (`getVault`, `getVaults`, `addWatch`, `listWatches`, `removeWatches`, `getMeta`), `MAX_WATCHES_PER_CHAT`, `nowSeconds`, `errorFields`, kiểu `VaultRow`, `WatchRole`, `WATCH_ROLES`, `IntegrityRecord`.
  - Task 3: `ChainPort.isVault`. Task 4: `formatTime`, `showAddress`, `vaultLink`, `verifyLink`, `MAX_TEXT`.
  - Task 7: `AppEnv`, `problem`, `problemOf`.
- Produces:
  - **`bot/commands.ts`:**
    - `interface Command { name: string; arg: string }`; `parseCommand(text: string): Command | null`. Nhận `/cmd`, `/cmd@Bot`, `/cmd arg`; `name` viết thường.
    - `interface StartArg { vault: Address; role: WatchRole }`; `parseStartArg(arg: string): StartArg | null`. Nhận `0x…-role`; không phân biệt hoa thường; dấu nối là `-`, `_` hoặc khoảng trắng; `vault` trả về viết thường.
  - **`bot/webhook.ts`:**
    - `interface TelegramUpdate { update_id?: number; message?: { message_id?: number; chat?: { id?: number | string; type?: string }; text?: string } }`
    - `interface BotDeps { store: Store; chain: ChainPort; clock: Clock; log: Logger; config: WorkerConfig }`. `Runtime` thoả kiểu này.
    - `interface BotReply { chatId: string; text: string }`
    - `HELP`, `DISCLAIMER`
    - `describeVault(vault: string, row: VaultRow | undefined, roles: readonly WatchRole[], now: bigint, webUrl: string): string`
    - `handleUpdate(u: TelegramUpdate, d: BotDeps): Promise<BotReply | null>`
  - **`routes/telegram.ts`:** `safeEqual(a: string, b: string): boolean` (so sánh thời gian hằng); `mountTelegram(app: Hono<AppEnv>): void`.

Hành vi của `POST /telegram/webhook`:
- Header `X-Telegram-Bot-Api-Secret-Token` sai, thiếu, hoặc Worker chưa đặt `TELEGRAM_WEBHOOK_SECRET` → 401 `UNAUTHORIZED`.
- Body không phải JSON, hoặc update không có text → 200 `{}`.
- Có câu trả lời → 200 với chính lệnh `sendMessage` trong body (Telegram cho phép trả lời ngay trong response của webhook), nên không tốn subrequest.
- Lỗi bất ngờ → ghi log `telegram.update_failed` và vẫn trả 200 `{}`. Trả 5xx thì Telegram sẽ gửi lại update đó mãi.

Các lệnh:

| Lệnh | Việc làm |
|---|---|
| `/start` hoặc `/help` | Lời chào và danh sách lệnh |
| `/start <vault>-<role>` | Kiểm vault (D1 trước, rồi `isVault` trên chain), rồi thêm watch. Tối đa 20 watch mỗi chat |
| `/status` | Mỗi vault một đoạn: vai trò, trạng thái trong cache, block, link |
| `/unwatch [vault]` | Bỏ một vault, hoặc bỏ hết |
| `/verify [vault]` | Integrity mới nhất, link `#/v/<vault>/verify`, lệnh `npx atropyle verify --vault <V>` |
| lệnh khác | `Unknown command.` kèm `HELP` |
| chữ thường không phải lệnh | `HELP` trong chat riêng; im lặng trong nhóm |

- [ ] **Step 1: Viết test (thất bại)**

`apps/worker/test/workers/webhook.test.ts`:

```ts
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { parseCommand, parseStartArg } from '../../src/bot/commands';
import type { CronDeps } from '../../src/cron/minute';
import { safeEqual } from '../../src/routes/telegram';
import { MAX_WATCHES_PER_CHAT } from '../../src/store/store';
import { showAddress, vaultLink, verifyLink } from '../../src/telegram/messages';
import type { IntegrityRecord } from '../../src/types';
import { deps, testStore, type World, world } from './fakes';
import { addr, OWNER, T0, VAULT_A, VAULT_B, VAULT_C, viewOf } from './fixtures';
import { resetDb } from './helpers';

const SECRET = 'test_secret';
const WEB = 'https://web.test/';
let w: World;
let make: () => CronDeps;

const msg = (text: string, type = 'private') => ({ update_id: 1, message: { message_id: 1, chat: { id: 42, type }, text } });
const post = (body: unknown, secret: string | null = SECRET, configured: string | undefined = SECRET) =>
  createApp(make).request(
    '/telegram/webhook',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(secret === null ? {} : { 'X-Telegram-Bot-Api-Secret-Token': secret }) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    },
    { ...env, TELEGRAM_WEBHOOK_SECRET: configured },
  );
const say = async (text: string, type = 'private'): Promise<string | null> => {
  const res = await post(msg(text, type));
  expect(res.status).toBe(200);
  const body = (await res.json()) as { text?: string };
  return body.text ?? null;
};

beforeEach(async () => {
  await resetDb();
  w = world();
  make = () => deps(w);
});

describe('parseCommand and parseStartArg', () => {
  it('reads commands with or without the bot name, and forgiving deep-link payloads', () => {
    expect(parseCommand('/Status@AtropyleBot')).toEqual({ name: 'status', arg: '' });
    expect(parseCommand('  /start   0xAb-heir  ')).toEqual({ name: 'start', arg: '0xAb-heir' });
    expect(parseCommand('hello /start')).toBeNull();
    const upper = `0X${VAULT_A.slice(2).toUpperCase()}`;
    for (const arg of [`${VAULT_A}-heir`, `${upper}-HEIR`, `${VAULT_A}_heir`, `${VAULT_A} heir`]) {
      expect(parseStartArg(arg)).toEqual({ vault: VAULT_A, role: 'heir' });
    }
    expect(parseStartArg(`${VAULT_A}-friend`)).toBeNull();
    expect(parseStartArg(`${VAULT_A.slice(0, 41)}-heir`)).toBeNull();
    expect(parseStartArg(VAULT_A)).toBeNull();
  });

  it('compares secrets of any length', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});

describe('POST /telegram/webhook', () => {
  it('answers 401 to a wrong or missing secret, and when no secret is configured', async () => {
    expect((await post(msg('/help'), 'wrong')).status).toBe(401);
    expect((await post(msg('/help'), null)).status).toBe(401);
    const res = await post(msg('/help'), '', undefined);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('answers 200 with an empty body to malformed JSON and to updates without text', async () => {
    const bad = await post('{not json');
    expect(bad.status).toBe(200);
    expect(await bad.json()).toEqual({});
    const edited = await post({ update_id: 2, edited_message: { chat: { id: 42 }, text: '/status' } });
    expect(await edited.json()).toEqual({});
  });

  it('normalises /start@bot with a mixed-case address and role, and replies with sendMessage in the webhook body', async () => {
    w.chain.views.set(VAULT_A, viewOf(VAULT_A));
    const res = await post(msg(`/start@AtropyleBot 0x${VAULT_A.slice(2).toUpperCase()}-Owner`));
    expect(await res.json()).toEqual({
      method: 'sendMessage',
      chat_id: '42',
      text: expect.stringContaining(`Watching vault ${showAddress(VAULT_A)} as owner.`),
      link_preview_options: { is_disabled: true },
    });
    expect(w.chain.calls).toContain(`isVault:${VAULT_A}`);
    expect(await testStore().listWatches('42')).toEqual([{ chatId: '42', vault: VAULT_A, role: 'owner' }]);
    expect(await say(`/start ${VAULT_A}-owner`)).toBe(`You already watch vault ${showAddress(VAULT_A)} as owner.\n${vaultLink(WEB, VAULT_A)}`);
    expect(await say(`/start ${VAULT_A}-guardian`)).toContain('as guardian.');
  });

  it('trusts the index for known vaults, without a chain read', async () => {
    await testStore().applyVault({ created: { vault: VAULT_B, owner: OWNER, drill: true, createdBlock: 110n }, view: viewOf(VAULT_B), claims: [] });
    expect(await say(`/start ${VAULT_B}-heir`)).toContain('as heir.');
    expect(w.chain.calls).toEqual([]);
  });

  it('explains an unreadable link, an unknown role and an address that is not a vault', async () => {
    expect(await say('/start hello')).toContain('I could not read that link.');
    expect(await say(`/start ${VAULT_A}-friend`)).toContain('I could not read that link.');
    expect(await say(`/start ${VAULT_C}-heir`)).toBe(
      `${showAddress(VAULT_C)} is not a vault created by the Atropyle factory, so I cannot watch it. Check the address on the vault page.`,
    );
    expect(await testStore().listWatches('42')).toEqual([]);
  });

  it('says when X Layer is unreachable, and when the chat already watches 20 vaults', async () => {
    w.chain.views.set(VAULT_A, viewOf(VAULT_A));
    w.chain.failViewFor.add(VAULT_A);
    expect(await say(`/start ${VAULT_A}-owner`)).toBe('Could not reach X Layer right now, so I could not check this vault. Try again in a minute.');
    w.chain.failViewFor.clear();
    const store = testStore();
    for (let i = 0; i < MAX_WATCHES_PER_CHAT; i++) await store.addWatch('42', addr(0x100 + i), 'heir', i);
    expect(await say(`/start ${VAULT_A}-owner`)).toBe(`You already watch ${MAX_WATCHES_PER_CHAT} vaults, the limit. Send /unwatch <vault> to free a slot.`);
  });

  it('/status lists each watched vault once, with its roles and cached state', async () => {
    expect(await say('/status')).toBe('You do not watch any vault yet. Open the bot link on a vault page to start.');
    const store = testStore();
    const grace = viewOf(VAULT_A, { state: 'grace', alarmAt: T0, windowEndsAt: T0 + 120n, blockNumber: 200n });
    await store.applyVault({ created: { vault: VAULT_A, owner: OWNER, drill: true, createdBlock: 110n }, view: grace, claims: [] });
    await store.addWatch('42', VAULT_A, 'heir', 1);
    await store.addWatch('42', VAULT_A, 'owner', 2);
    await store.addWatch('42', VAULT_C, 'guardian', 3);
    expect(await say('/status')).toBe(
      [
        `Vault ${showAddress(VAULT_A)} (owner, heir): alarm raised, the owner can cancel it by checking in before 2027-01-15 08:02 UTC.`,
        `As of block 200. ${vaultLink(WEB, VAULT_A)}`,
        '',
        `Vault ${showAddress(VAULT_C)} (guardian): not indexed yet.`,
        vaultLink(WEB, VAULT_C),
      ].join('\n'),
    );
  });

  it('/unwatch stops one vault or all of them', async () => {
    const store = testStore();
    await store.addWatch('42', VAULT_A, 'owner', 1);
    await store.addWatch('42', VAULT_B, 'heir', 2);
    expect(await say('/unwatch nope')).toContain('That is not a vault address.');
    expect(await say(`/unwatch ${VAULT_A.toUpperCase().replace('0X', '0x')}`)).toBe(`Stopped watching vault ${showAddress(VAULT_A)}.`);
    expect(await say(`/unwatch ${VAULT_A}`)).toBe(`You did not watch vault ${showAddress(VAULT_A)}.`);
    expect(await say('/unwatch')).toBe('Stopped watching all your vaults (1 watch).');
    expect(await say('/unwatch')).toBe('You did not watch any vault.');
  });

  it('/verify gives the latest integrity result, the verify page and the CLI command', async () => {
    expect(await say('/verify')).toContain('No integrity check has run yet.');
    const store = testStore();
    const record: IntegrityRecord = {
      checkedAt: '2027-01-15T08:00:00.000Z',
      blockNumber: '190',
      report: { ok: true, chainId: 196, blockNumber: '190', blockTimestamp: '1800000000', rpcs: 2, checks: [{ name: 'factory.code', ok: true }], warnings: [] },
    };
    await store.setMeta('integrity', record, 1);
    await store.addWatch('42', VAULT_A, 'heir', 1);
    expect(await say('/verify')).toBe(
      [
        'Latest integrity check: PASS at block 190 (2027-01-15 08:00 UTC).',
        'Do not take our word for it. Verify it yourself:',
        verifyLink(WEB, VAULT_A),
        `npx atropyle verify --vault ${showAddress(VAULT_A)}`,
      ].join('\n'),
    );
    expect(await say(`/verify ${VAULT_B}`)).toContain(verifyLink(WEB, VAULT_B));
  });

  it('answers unknown commands with help, and plain text only in private chats', async () => {
    expect(await say('/foo')).toMatch(/^Unknown command\.\n\nAtropyle bot/);
    expect(await say('hello')).toMatch(/^Atropyle bot/);
    expect(await say('hello', 'group')).toBeNull();
  });

  it('never answers 5xx: an unexpected error still returns 200', async () => {
    make = () => {
      const d = deps(w);
      d.store.listWatches = async () => {
        throw new Error('D1 is down');
      };
      return d;
    };
    expect(await say('/status')).toBeNull();
    expect(w.lines.some((l) => l.includes('"telegram.update_failed"'))).toBe(true);
  });
});
```

- [ ] **Step 2: Chạy để thấy thất bại**

Run: `npm test -w apps/worker -- webhook`
Expected: FAIL, không resolve được `../../src/bot/commands`.

- [ ] **Step 3: Viết `bot/commands.ts`**

`apps/worker/src/bot/commands.ts`:

```ts
import type { Address } from 'viem';
import type { WatchRole } from '../types';

export interface Command {
  name: string;
  arg: string;
}

/** "/cmd", "/cmd@SomeBot" (Telegram adds the bot name in groups) and "/cmd arguments". */
export function parseCommand(text: string): Command | null {
  const m = /^\/([A-Za-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/.exec(text.trim());
  if (!m) return null;
  return { name: (m[1] ?? '').toLowerCase(), arg: (m[2] ?? '').trim() };
}

export interface StartArg {
  vault: Address;
  role: WatchRole;
}

/** The deep-link payload `<vault>-<role>` that the web app writes in lowercase. Case and separator are forgiven. */
export function parseStartArg(arg: string): StartArg | null {
  const m = /^(0x[0-9a-f]{40})[-_\s]+(owner|guardian|heir)$/i.exec(arg.trim());
  if (!m) return null;
  return { vault: (m[1] ?? '').toLowerCase() as Address, role: (m[2] ?? '').toLowerCase() as WatchRole };
}
```

- [ ] **Step 4: Viết `bot/webhook.ts`**

`apps/worker/src/bot/webhook.ts`:

```ts
import type { ChainPort } from '../chain/port';
import { type Clock, nowSeconds } from '../clock';
import type { WorkerConfig } from '../config';
import { errorFields, type Logger } from '../log';
import { MAX_WATCHES_PER_CHAT, type Store } from '../store/store';
import { formatTime, showAddress, vaultLink, verifyLink } from '../telegram/messages';
import { type IntegrityRecord, type VaultRow, WATCH_ROLES, type WatchRole } from '../types';
import { parseCommand, parseStartArg } from './commands';

export interface TelegramUpdate {
  update_id?: number;
  message?: { message_id?: number; chat?: { id?: number | string; type?: string }; text?: string };
}

export interface BotDeps {
  store: Store;
  chain: ChainPort;
  clock: Clock;
  log: Logger;
  config: WorkerConfig;
}

export interface BotReply {
  chatId: string;
  text: string;
}

export const HELP = [
  'Atropyle bot: notices about Atropyle vaults on X Layer.',
  '/start <vault>-<owner|guardian|heir> - watch a vault (use the link on the vault page)',
  '/status - the vaults you watch and their state',
  '/unwatch [vault] - stop watching one vault, or all of them',
  '/verify [vault] - the latest integrity check, and how to verify it yourself',
  'This bot only sends notices. It cannot sign or move anything.',
].join('\n');

export const DISCLAIMER = 'Anyone can watch any vault, so a notice here is not proof of a role. This bot cannot sign or move anything.';

const BAD_LINK =
  'I could not read that link. It should look like 0x followed by 40 hex characters, then -owner, -guardian or -heir. Open the bot link on the vault page again.';
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const ROLE_NOTE: Record<WatchRole, string> = {
  owner: 'I will warn you when an alarm or a recovery starts, so you can check in in time.',
  guardian: 'I will tell you when an alarm or a recovery starts or ends, and when the vault releases.',
  heir: 'I will tell you when the inheritance alarm is raised or cancelled, and when the vault releases to the heirs.',
};

function stateText(r: VaultRow, now: bigint): string {
  if (r.drill && r.expiresAt !== null && now >= r.expiresAt) return 'expired Drill vault';
  switch (r.state) {
    case 'active':
      return r.lateAt !== null && now >= r.lateAt
        ? `active, but the check-in deadline passed at ${formatTime(r.lateAt)}, so anyone can raise the alarm now`
        : `active, next check-in deadline ${formatTime(r.lateAt)}`;
    case 'grace':
      return `alarm raised, the owner can cancel it by checking in before ${formatTime(r.windowEndsAt)}`;
    case 'recovery':
      return `recovery to ${showAddress(r.recoveryTarget)} in progress, it completes after ${formatTime(r.windowEndsAt)} unless the owner checks in`;
    case 'releasedInherit':
      return 'released to the heirs';
    case 'releasedRecover':
      return `recovered to ${showAddress(r.recoveryTarget)}`;
    default:
      return 'state unknown';
  }
}

/** One paragraph of /status, from the cached view in D1 (updated on every event, not on every block). */
export function describeVault(vault: string, row: VaultRow | undefined, roles: readonly WatchRole[], now: bigint, webUrl: string): string {
  const head = `Vault ${showAddress(vault)} (${roles.join(', ')})`;
  const link = vaultLink(webUrl, vault);
  if (!row || row.state === null) return `${head}: not indexed yet.\n${link}`;
  return `${head}: ${stateText(row, now)}.\nAs of block ${row.refreshedBlock ?? row.createdBlock}. ${link}`;
}

async function start(arg: string, chatId: string, d: BotDeps): Promise<string> {
  const parsed = parseStartArg(arg);
  if (!parsed) return BAD_LINK;
  const { vault, role } = parsed;
  const shown = showAddress(vault);
  if (!(await d.store.getVault(vault))) {
    let known: boolean;
    try {
      known = await d.chain.isVault(vault);
    } catch (e) {
      d.log.warn('bot.is_vault_failed', { vault, ...errorFields(e) });
      return 'Could not reach X Layer right now, so I could not check this vault. Try again in a minute.';
    }
    if (!known) return `${shown} is not a vault created by the Atropyle factory, so I cannot watch it. Check the address on the vault page.`;
  }
  const link = vaultLink(d.config.webUrl, vault);
  const added = await d.store.addWatch(chatId, vault, role, d.clock.nowMs());
  if (added === 'limit') return `You already watch ${MAX_WATCHES_PER_CHAT} vaults, the limit. Send /unwatch <vault> to free a slot.`;
  if (added === 'exists') return `You already watch vault ${shown} as ${role}.\n${link}`;
  return `Watching vault ${shown} as ${role}. ${ROLE_NOTE[role]}\n${DISCLAIMER}\n${link}`;
}

async function status(chatId: string, d: BotDeps): Promise<string> {
  const watches = await d.store.listWatches(chatId);
  if (watches.length === 0) return 'You do not watch any vault yet. Open the bot link on a vault page to start.';
  const roles = new Map<string, WatchRole[]>();
  for (const w of watches) roles.set(w.vault, [...(roles.get(w.vault) ?? []), w.role]);
  const rows = await d.store.getVaults([...roles.keys()]);
  const now = nowSeconds(d.clock);
  return [...roles]
    .map(([vault, r]) => describeVault(vault, rows.get(vault), WATCH_ROLES.filter((x) => r.includes(x)), now, d.config.webUrl))
    .join('\n\n');
}

async function unwatch(arg: string, chatId: string, d: BotDeps): Promise<string> {
  if (arg === '') {
    const n = await d.store.removeWatches(chatId);
    return n === 0 ? 'You did not watch any vault.' : `Stopped watching all your vaults (${n} watch${n === 1 ? '' : 'es'}).`;
  }
  if (!ADDRESS.test(arg)) return 'That is not a vault address. Send /unwatch to stop everything, or /unwatch 0x... for one vault.';
  const n = await d.store.removeWatches(chatId, arg);
  return n === 0 ? `You did not watch vault ${showAddress(arg)}.` : `Stopped watching vault ${showAddress(arg)}.`;
}

async function verify(arg: string, chatId: string, d: BotDeps): Promise<string> {
  let vaults: string[];
  if (arg === '') vaults = [...new Set((await d.store.listWatches(chatId)).map((w) => w.vault))];
  else if (ADDRESS.test(arg)) vaults = [arg.toLowerCase()];
  else return 'That is not a vault address. Send /verify, or /verify 0x... for one vault.';

  const row = await d.store.getMeta<IntegrityRecord>('integrity');
  const lines: string[] = [];
  if (!row) {
    lines.push('No integrity check has run yet. Try again in 10 minutes.');
  } else {
    const r = row.value.report;
    const at = formatTime(BigInt(r.blockTimestamp));
    const failing = r.checks.filter((c) => !c.ok).map((c) => c.name);
    lines.push(
      r.ok
        ? `Latest integrity check: PASS at block ${r.blockNumber} (${at}).`
        : `Latest integrity check: FAIL at block ${r.blockNumber} (${at}). Failing checks: ${failing.join(', ')}.`,
    );
  }
  lines.push('Do not take our word for it. Verify it yourself:');
  if (vaults.length === 0) lines.push(`${d.config.webUrl}#/status`, 'npx atropyle verify');
  for (const v of vaults) lines.push(verifyLink(d.config.webUrl, v), `npx atropyle verify --vault ${showAddress(v)}`);
  return lines.join('\n');
}

/** One Telegram update → at most one reply. Replies use fixed texts and checksummed addresses only (no untrusted strings). */
export async function handleUpdate(u: TelegramUpdate, d: BotDeps): Promise<BotReply | null> {
  const m = u.message;
  const id = m?.chat?.id;
  if (!m || id === undefined || id === null || typeof m.text !== 'string') return null;
  const chatId = String(id);
  const reply = (text: string): BotReply => ({ chatId, text });
  const cmd = parseCommand(m.text);
  if (!cmd) return m.chat?.type === 'private' ? reply(HELP) : null;
  switch (cmd.name) {
    case 'start':
      return reply(cmd.arg === '' ? HELP : await start(cmd.arg, chatId, d));
    case 'help':
      return reply(HELP);
    case 'status':
      return reply(await status(chatId, d));
    case 'unwatch':
      return reply(await unwatch(cmd.arg, chatId, d));
    case 'verify':
      return reply(await verify(cmd.arg, chatId, d));
    default:
      return reply(`Unknown command.\n\n${HELP}`);
  }
}
```

- [ ] **Step 5: Viết `routes/telegram.ts` và gắn route**

`apps/worker/src/routes/telegram.ts`:

```ts
import type { Hono } from 'hono';
import type { AppEnv } from '../app';
import { handleUpdate, type TelegramUpdate } from '../bot/webhook';
import { errorFields } from '../log';
import { problem, problemOf } from '../problem';
import { MAX_TEXT } from '../telegram/client';

/** Constant-time comparison: the time taken does not depend on where the strings differ. */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export function mountTelegram(app: Hono<AppEnv>): void {
  app.post('/telegram/webhook', async (c) => {
    const secret = c.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';
    const given = c.req.header('X-Telegram-Bot-Api-Secret-Token') ?? '';
    if (secret === '' || !safeEqual(given, secret)) return problem(problemOf('UNAUTHORIZED', 'Missing or wrong webhook secret.'));
    let update: TelegramUpdate;
    try {
      update = await c.req.json<TelegramUpdate>();
    } catch {
      return c.json({});
    }
    const rt = c.var.rt;
    try {
      const reply = await handleUpdate(update, rt);
      if (!reply) return c.json({});
      // Answering in the webhook response costs no subrequest (Bot API: "Making requests when getting updates").
      return c.json({ method: 'sendMessage', chat_id: reply.chatId, text: reply.text.slice(0, MAX_TEXT), link_preview_options: { is_disabled: true } });
    } catch (e) {
      rt.log.error('telegram.update_failed', errorFields(e));
      return c.json({});
    }
  });
}
```

Trong `apps/worker/src/app.ts`, thêm `import { mountTelegram } from './routes/telegram';` (sau import `./routes/health`), và gọi `mountTelegram(app);` ngay sau `mountV1(app);`.

- [ ] **Step 6: Chạy test**

Run: `npm test -w apps/worker -- webhook`
Expected: 13 test PASS (2 của parser, 11 của webhook).

- [ ] **Step 7: Kiểm toàn bộ và commit**

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker`
Expected: mọi test PASS; `tsc` và Biome sạch.

```bash
git add apps/worker/src/bot/commands.ts apps/worker/src/bot/webhook.ts apps/worker/src/routes/telegram.ts apps/worker/src/app.ts apps/worker/test/workers/webhook.test.ts
git commit -m "feat(worker): Telegram bot commands, deep links and the webhook" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: E2E trên devnet — cron thật, keeper thật, D1 trên `node:sqlite`

**Files:**
- Create: `apps/worker/scripts/lib/node-d1.ts`
- Modify: `apps/worker/scripts/lib/devnet.ts` (thêm `tokenBalance`)
- Test: `apps/worker/test/devnet/keeper.test.ts`

**Interfaces:**
- Consumes:
  - Plan 2 Task 6: `increaseTime` (`scripts/lib/anvil.ts`).
  - Task 2: `readConfig`, `Budget`, `createLogger`, `metered`, `Store`, kiểu `D1Like`, `D1PreparedLike`, `D1RunResult`.
  - Task 3: `createSdkChain` (với `keeperAccount`), `createDrill`, `chainNowMs`, `DEVNET_HEIR`, `DEVNET_KEEPER`, `devnet`, `snapshotChain`, `revertChain`.
  - Task 4: kiểu `Notifier`. Task 5: `runMinute`, `MinuteResult`.
- Produces:
  - **`scripts/lib/node-d1.ts`** (chỉ Node): `nodeD1(file?: string): D1Like & { close(): void }`. Mặc định là `':memory:'`. Áp mọi file `migrations/*.sql` theo thứ tự tên. `batch` chạy trong `BEGIN`/`COMMIT`, lỗi thì `ROLLBACK`, giống D1.
  - **`scripts/lib/devnet.ts`:** thêm `tokenBalance(rpcUrl: string, token: Address, account: Address): Promise<bigint>`.

Test E2E chạy đúng `runMinute` của Worker trên anvil, với ngân sách của gói Free (45/45) và đồng hồ đi theo giờ chain. Keeper ký bằng tài khoản unlocked anvil 7 qua `eth_sendTransaction`; không có khoá nào.

Sáu nhịp cron:
1. Index Drill mới; `next_check_at` bằng hạn check-in (`lateAt`).
2. Qua hạn 125 s: keeper `poke`, bật báo động.
3. Cron thấy `AlarmRaised` từ chính giao dịch của keeper: chủ ví nhận tin có chữ "raised by the Atropyle keeper", người thừa kế nhận tin báo động; `next_check_at` bằng `windowEndsAt`.
4. Qua cửa sổ 125 s: keeper gọi `distribute()`, vừa release vừa chia trong một giao dịch.
5. Người thừa kế nhận tin `Released`, và có thêm đúng 10.000 USDT0 của chủ ví.
6. Xoá cursor rồi chạy lại toàn bộ khoảng block: không gửi thêm tin nào.

- [ ] **Step 1: Viết `node-d1.ts` và `tokenBalance`**

`apps/worker/scripts/lib/node-d1.ts`:

```ts
// D1Like over node:sqlite, so that Node scripts and devnet tests run the Worker's real Store and migrations.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { D1Like, D1PreparedLike, D1RunResult } from '../../src/store/d1';

const MIGRATIONS = join(import.meta.dirname, '../../migrations');

function toSql(v: unknown): SQLInputValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string') return v;
  throw new TypeError(`nodeD1 cannot bind a ${typeof v}`);
}

class NodeStatement implements D1PreparedLike {
  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
    private readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedLike {
    return new NodeStatement(this.db, this.sql, values.map(toSql));
  }

  async first<T>(): Promise<T | null> {
    return (this.db.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[] }> {
    return { results: this.db.prepare(this.sql).all(...this.values) as T[] };
  }

  async run(): Promise<D1RunResult> {
    return this.runSync();
  }

  runSync(): D1RunResult {
    return { meta: { changes: Number(this.db.prepare(this.sql).run(...this.values).changes) } };
  }
}

export function nodeD1(file = ':memory:'): D1Like & { close(): void } {
  const db = new DatabaseSync(file);
  for (const name of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(MIGRATIONS, name), 'utf8'));
  }
  return {
    prepare: (sql) => new NodeStatement(db, sql),
    async batch(statements) {
      db.exec('BEGIN');
      try {
        const out = statements.map((s) => {
          if (!(s instanceof NodeStatement)) throw new TypeError('nodeD1.batch only takes statements prepared on this database');
          return s.runSync();
        });
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    close: () => db.close(),
  };
}
```

Tham số `?1`, `?2`… của SQLite có chỉ số cố định, nên truyền giá trị theo vị trí (`get(...values)`) là gán đúng chỗ, kể cả khi một tham số xuất hiện hai lần trong câu lệnh.

Trong `apps/worker/scripts/lib/devnet.ts`, đổi dòng import viem thành:

```ts
import { type Address, createPublicClient, createWalletClient, erc20Abi, http, keccak256, toHex } from 'viem';
```

rồi thêm vào cuối file:

```ts
export async function tokenBalance(rpcUrl: string, token: Address, account: Address): Promise<bigint> {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [account] });
}
```

- [ ] **Step 2: Viết test (thất bại)**

`apps/worker/test/devnet/keeper.test.ts`:

```ts
import type { Address, Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { increaseTime } from '../../../../scripts/lib/anvil';
import { chainNowMs, createDrill, DEVNET_HEIR, DEVNET_KEEPER, tokenBalance } from '../../scripts/lib/devnet';
import { nodeD1 } from '../../scripts/lib/node-d1';
import { Budget } from '../../src/budget';
import { createSdkChain } from '../../src/chain/sdk';
import { readConfig } from '../../src/config';
import { type MinuteResult, runMinute } from '../../src/cron/minute';
import { createLogger } from '../../src/log';
import { metered } from '../../src/store/d1';
import { Store } from '../../src/store/store';
import type { Notifier } from '../../src/telegram/client';
import { devnet, revertChain, snapshotChain } from './helpers';

describe('nodeD1', () => {
  it('applies the migrations and reports claims, batches and leases like D1', async () => {
    const db = nodeD1();
    const store = new Store(db);
    const vault: Address = `0x${'a1'.padStart(40, '0')}`;
    const created = { vault, owner: `0x${'1'.padStart(40, '0')}` as Address, drill: true, createdBlock: 110n };
    const k = { transactionHash: `0x${'1'.repeat(64)}` as Hex, logIndex: 0 };
    expect(await store.applyVault({ created, view: null, claims: [k] })).toEqual([true]);
    expect(await store.applyVault({ created, view: null, claims: [k] })).toEqual([false]);
    expect(await store.knownVaults(200n)).toEqual([{ vault, owner: created.owner, drill: true }]);
    expect(await store.acquireLease('lease:minute', 'a', 1_000, 240_000)).toBe(true);
    expect(await store.acquireLease('lease:minute', 'b', 2_000, 240_000)).toBe(false);
    await expect(db.batch([db.prepare('INSERT INTO cursor (name, block) VALUES (?1, ?2)').bind('events', 1), db.prepare('INSERT INTO nope VALUES (1)')])).rejects.toThrow();
    expect(await store.getCursor()).toBeNull();
    db.close();
  });
});

describe('the minute cron on the devnet', () => {
  const { rpcUrl, deployment } = devnet();
  let id: Hex;
  beforeEach(async () => {
    id = await snapshotChain(rpcUrl);
  });
  afterEach(async () => {
    await revertChain(rpcUrl, id);
  });

  it('indexes a Drill, raises the alarm, notifies, releases and pays the heir, all from the cron', async () => {
    const db = nodeD1();
    const store = new Store(db);
    const config = readConfig({ CHAIN: 'local', WEB_URL: 'https://web.test/' });
    const sent: { chatId: string; text: string }[] = [];
    const notifier: Notifier = {
      send: async (chatId, text) => {
        sent.push({ chatId, text });
        return { ok: true, blocked: false, status: 200 };
      },
    };
    const lines: string[] = [];
    let nowMs = 0;
    const tick = async (): Promise<MinuteResult> => {
      nowMs = await chainNowMs(rpcUrl);
      const budget = new Budget(config.budget);
      return runMinute({
        store: new Store(metered(db, budget)),
        chain: createSdkChain({ chain: deployment, budget, keeperAccount: DEVNET_KEEPER }),
        notifier,
        clock: { nowMs: () => nowMs },
        log: createLogger({}, (l) => lines.push(l)),
        budget,
        config,
      });
    };
    const [usdt0] = deployment.feeTokens;
    if (!usdt0) throw new Error('the local deployment has no fee tokens');
    const vault = (await createDrill(rpcUrl, deployment, 'cron-e2e')).toLowerCase();
    await store.addWatch('owner-chat', vault, 'owner', 1);
    await store.addWatch('heir-chat', vault, 'heir', 2);
    const heirBefore = await tokenBalance(rpcUrl, usdt0, DEVNET_HEIR);

    // 1. The new vault is indexed; its next check is the check-in deadline.
    expect(await tick()).toMatchObject({ status: 'ok', keeper: { due: 0, dryRun: false } });
    const indexed = await store.getVault(vault);
    expect(indexed?.state).toBe('active');
    expect(indexed?.nextCheckAt).toBe(indexed?.lateAt);

    // 2. Past the deadline, the keeper raises the alarm.
    await increaseTime(rpcUrl, 125);
    expect((await tick()).keeper).toMatchObject({ due: 1, sent: 1, dryRun: false });

    // 3. The next run sees AlarmRaised from the keeper's own transaction.
    await tick();
    const owner = sent.filter((m) => m.chatId === 'owner-chat');
    expect(owner).toHaveLength(1);
    expect(owner[0]?.text).toMatch(/^URGENT: the inheritance alarm on vault 0x[0-9a-fA-F]{40} was raised by the Atropyle keeper at /);
    expect(sent.find((m) => m.chatId === 'heir-chat')?.text).toContain('the vault releases to the heirs');
    const grace = await store.getVault(vault);
    expect(grace?.state).toBe('grace');
    expect(grace?.nextCheckAt).toBe(grace?.windowEndsAt);

    // 4. After the window, one distribute() both releases the vault and pays out.
    await increaseTime(rpcUrl, 125);
    expect((await tick()).keeper).toMatchObject({ due: 1, sent: 1 });

    // 5. The heir is told, and now holds the owner's 10,000 USDT0.
    await tick();
    const heir = sent.filter((m) => m.chatId === 'heir-chat');
    expect(heir).toHaveLength(2);
    expect(heir[1]?.text).toMatch(/^Vault 0x[0-9a-fA-F]{40} was released to its heirs\./);
    expect(await tokenBalance(rpcUrl, usdt0, DEVNET_HEIR)).toBe(heirBefore + 10_000n * 10n ** 6n);
    expect((await store.getVault(vault))?.state).toBe('releasedInherit');
    expect(lines.some((l) => l.includes('"keeper.outcome"') && l.includes('"sent"'))).toBe(true);

    // 6. Replaying the whole block range sends nothing twice.
    const before = sent.length;
    await db.prepare('DELETE FROM cursor').run();
    expect(await tick()).toMatchObject({ status: 'ok', claimed: 0, notified: 0 });
    expect(sent).toHaveLength(before);
    db.close();
  });
});
```

- [ ] **Step 3: Chạy test devnet**

Run: `npm run build -w circuits && npm run build -w packages/sdk && (cd contracts && forge build) && npm run test:devnet -w apps/worker`
Expected: 5 test PASS (3 của `chain.test.ts`, 2 của `keeper.test.ts`). Node có thể in `ExperimentalWarning` cho `node:sqlite`; đó không phải lỗi.

Nếu nhịp 2 hoặc 4 báo `sent: 0`, xem dòng log `keeper.outcome` trong `lines` (in ra bằng `console.log(lines.join('\n'))`):
- `simulation-failed` thường là thời gian chưa qua đủ hạn;
- `limit` là ngân sách không đủ cho giao dịch.

Sửa dữ kiện của test, đừng nới logic. Task 12 đo lại chi phí thật.

- [ ] **Step 4: Kiểm toàn bộ và commit**

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker`
Expected: mọi test workerd PASS; `tsc` (cả `tsconfig.node.json`) và Biome sạch.

```bash
git add apps/worker/scripts/lib/node-d1.ts apps/worker/scripts/lib/devnet.ts apps/worker/test/devnet/keeper.test.ts
git commit -m "test(worker): end-to-end minute cron and keeper on the devnet" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Job CI `worker` và `apps/worker/README.md`

**Files:**
- Modify: `.github/workflows/ci.yml` (thêm job `worker` vào cuối `jobs:`)
- Create: `apps/worker/README.md`

**Interfaces:**
- Consumes: các script npm của Task 1 (`typecheck`, `test`, `test:devnet`, `check:bundle`); job `lint` của Plan 2 (đã chạy `npx biome ci .` cho cả repo, gồm `apps/worker`).
- Produces: job CI `worker`. Plan 6 sẽ ghim SHA cho các action và thêm bước deploy vào `release.yml`. Job này không có secret, không đăng nhập Cloudflare và không ký giao dịch nào.

- [ ] **Step 1: Thêm job CI**

Thêm vào cuối khối `jobs:` của `.github/workflows/ci.yml`, giữ nguyên các job đã có:

```yaml
  worker:
    runs-on: ubuntu-latest
    env:
      WRANGLER_SEND_METRICS: 'false'
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - uses: foundry-rs/foundry-toolchain@v1
        with:
          version: v1.9.0
      - run: npm ci
      - run: npm run build -w circuits
      - run: npm run build -w packages/sdk
      - run: npm run typecheck -w apps/worker
      - run: npm test -w apps/worker
      - run: forge build
        working-directory: contracts
      - run: npm run test:devnet -w apps/worker
      - run: npm run check:bundle -w apps/worker
```

Ghi chú:
- `check:bundle` là `wrangler deploy --dry-run --outdir dist`. Lệnh này chỉ build, không cần đăng nhập Cloudflare và không deploy gì.
- Test devnet gửi giao dịch tới anvil chạy ngay trong job, qua tài khoản unlocked (`eth_sendTransaction`). Không có khoá, không chạm mạng thật.
- `WRANGLER_SEND_METRICS: 'false'` tắt số liệu sử dụng của wrangler (Quyết định 8).

- [ ] **Step 2: Viết README**

`apps/worker/README.md`:

````markdown
# Atropyle Worker

One Cloudflare Worker that runs the off-chain helpers of Atropyle on X Layer:

- a **keeper** that calls `poke()` and `distribute()` when a vault is due, so the protocol moves on even when nobody presses a button;
- a **Telegram bot** that tells owners, guardians and heirs when an alarm, a recovery or a release happens;
- a small public **API**: `/health`, `/v1/stats`, `/v1/integrity`;
- two **crons**: every minute (events, notices, keeper) and every 10 minutes (integrity checks).

The Worker has no on-chain rights. Everything it does, anyone can do from the vault page or with the CLI. If it goes down, vaults keep working; only the notices and the automatic `poke`/`distribute` stop.

## Endpoints

| Method and path | What it returns |
|---|---|
| `GET /health` | `{ schemaVersion, status, rpcs, lastCronAt, lastCronAgeSec, cursorLagBlocks, integrity, keeper }`. Always HTTP 200; `status` is `ok` or `degraded`. |
| `GET /v1/stats` | Vault counts and activity, updated by the minute cron. |
| `GET /v1/integrity` | The latest integrity report from the 10-minute cron. |
| `POST /telegram/webhook` | Telegram updates. Requires the `X-Telegram-Bot-Api-Secret-Token` header. |

Errors are `application/problem+json` with a stable `code`; `type` links to the error page in the docs. `/health` and `/v1/*` allow any origin (CORS `*`) and are limited to 120 requests per minute per IP.

## Bot commands

| Command | What it does |
|---|---|
| `/start <vault>-<owner\|guardian\|heir>` | Watch a vault. The vault page gives you this link. |
| `/status` | The vaults you watch and their state. |
| `/unwatch [vault]` | Stop watching one vault, or all of them. |
| `/verify [vault]` | The latest integrity check, with the verify page and `npx atropyle verify --vault <vault>`. |

Anyone can watch any vault: a notice is not proof of a role. Each chat can watch up to 20 vaults.

## What it stores

A D1 database with seven tables: indexed vaults (public on-chain data), watches (`chat_id`, vault, role), the event cursor, seen event ids, public counters, keeper transactions, and small state rows (heartbeats, alerts, the cron lease). No names, no messages, no IP addresses. The logs have no tokens, secrets or keys.

## Local development

```bash
npm ci
npm run build -w circuits && npm run build -w packages/sdk
npm test -w apps/worker                                   # unit and route tests in workerd
(cd contracts && forge build) && npm run test:devnet -w apps/worker   # cron + keeper on anvil
npm run measure:cron -w apps/worker                       # cost of a cron run on anvil
```

To run the Worker locally:

```bash
cd apps/worker
npx wrangler d1 migrations apply atropyle --local
npx wrangler dev
curl "http://localhost:8787/health"
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=*+*+*+*+*"       # run the minute cron once
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=*/10+*+*+*+*"    # run the integrity cron once
```

Local secrets go in `apps/worker/.dev.vars`, which git ignores. Without `TELEGRAM_TOKEN` the bot only logs; without `KEEPER_KEY` the keeper runs in dry-run.

## Deploying

The maintainer deploys from their own machine; CI never deploys or holds keys. Every command below runs in `apps/worker`.

```bash
npx wrangler login
npx wrangler d1 create atropyle                 # paste the printed database_id into wrangler.jsonc
npx wrangler d1 migrations apply atropyle --remote
npx wrangler secret put TELEGRAM_TOKEN          # from @BotFather
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET # 1-256 characters of A-Z a-z 0-9 _ -
npx wrangler secret put KEEPER_KEY              # the keeper's own gas wallet, never a wallet that holds funds
npx wrangler deploy
```

Then point Telegram at the Worker. `read -s` keeps the token and the secret out of your shell history; replace `<worker-name>.<account>` with the host that `wrangler deploy` printed:

```bash
read -s TELEGRAM_TOKEN; read -s TELEGRAM_WEBHOOK_SECRET
curl -sS "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook" \
  --data-urlencode "url=https://<worker-name>.<account>.workers.dev/telegram/webhook" \
  --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  --data-urlencode 'allowed_updates=["message"]' \
  --data-urlencode "drop_pending_updates=true"
```

## The keeper

- Reads only vaults whose `next_check_at` has passed, as computed by the SDK's `planKeeperActions`.
- Simulates every transaction before sending it. At most 20 transactions per run (`KEEPER_MAX_TX`), a gas cap per transaction, and a full stop below 0.005 OKB.
- `KEEPER_KEY` is a Worker secret. Without it the keeper runs in dry-run: it decides and simulates, and sends nothing. A malformed key never crashes the Worker: the keeper stays in dry-run, `/health` reports `degraded` and ops get an alert.
- Fund the keeper wallet with a little OKB for gas, and nothing else.

## Configuration

| Var | Default | Meaning |
|---|---|---|
| `CHAIN` | `xlayer` | `xlayer` or `local`. |
| `OPS_CHAT_ID` | empty | Telegram chat for ops alerts. Empty means alerts only go to the log. |
| `WEB_URL` | `https://duongnq2798.github.io/atropyle/` | Base of the links in notices. |
| `SCAN_MAX_BLOCKS` | `1000` | Blocks read per minute run; the cron catches up over several runs after a gap. |
| `KEEPER_MODE` | `worker` | `external` turns the keeper off in the Worker. |
| `KEEPER_MAX_TX` | `20` | Keeper transactions per run (0 to 20). |
| `KEEPER_MAX_VAULTS` | `20` | Due vaults read per run. |
| `SUBREQUEST_BUDGET` | `45` | Subrequests one invocation may use (Workers Free allows 50). |
| `D1_QUERY_BUDGET` | `45` | D1 queries one invocation may use (Workers Free allows 50). |

When a run reaches its budget it stops between two vaults and does not move the cursor; the next run continues. A notice is never sent twice; if the Worker dies between recording an event and sending its notice, that notice is lost.

## Ops alerts

Sent to `OPS_CHAT_ID` once when a problem starts, every 6 hours while it lasts, and once when it ends: `integrity`, `integrity-error`, `cron-stalled`, `keeper-balance`, `keeper-send`, `keeper-key`.
````

- [ ] **Step 3: Kiểm**

Run: `npx biome ci . && npm run typecheck -w apps/worker && npm test -w apps/worker`
Expected: mọi lệnh thoát 0. Biome không kiểm Markdown; kiểm bằng mắt rằng README không có token, khoá hay ID thật nào.

Run: `node -e "const y=require('node:fs').readFileSync('.github/workflows/ci.yml','utf8'); if(!/\n  worker:\n/.test(y)) process.exit(1)"`
Expected: thoát 0, tức job `worker` nằm đúng cấp trong `jobs:`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml apps/worker/README.md
git commit -m "ci(worker): test, devnet E2E and bundle check; add the worker README" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Đo chi phí cron, deploy lần đầu và chọn nhánh CPU

**Files:**
- Create: `apps/worker/scripts/measure-cron.ts`
- Modify: `apps/worker/README.md` (thêm mục "Measured costs")
- Modify (`[USER]`, sau khi tạo D1): `apps/worker/wrangler.jsonc` (`database_id`, và `OPS_CHAT_ID` nếu dùng)
- Modify (chỉ khi số đo lệch xa ước lượng): `apps/worker/src/budget.ts` (`COST`)

**Interfaces:**
- Consumes:
  - Plan 2 Task 6: `startAnvil`, `deployLocal`, `increaseTime`.
  - Task 3: `localDeployment`, `createDrill`, `chainNowMs`, `DEVNET_KEEPER`, `createSdkChain`.
  - Task 5, 6: `runMinute`, `runIntegrity`. Task 10: `nodeD1`.
- Produces:
  - `npm run measure:cron -w apps/worker -- [--vaults N] [--budget B]`. Script in một bảng gồm 5 pha (`index`, `idle`, `poke`, `notify`, `integrity`), mỗi pha có `cpuMs`, `wallMs`, `fetches`, `queries` và kết quả.
  - Quyết định nhánh CPU (0, A hoặc B), ghi vào README.

Task này có hai phần:
- Phần đo chạy được trên máy, không cần tài khoản nào (Step 1–3).
- Phần deploy là việc của người dùng (`[USER]`, Step 4–8). Claude/agent không chạy các lệnh đó, không thấy token hay khoá, và không đặt secret.

- [ ] **Step 1: Viết script đo**

`apps/worker/scripts/measure-cron.ts`:

```ts
// Measures one cron run on anvil: CPU and wall time on this machine, subrequests and D1 queries.
// Signing is not included: anvil signs for the unlocked keeper account. The real cpuTime comes from
// `wrangler tail` on the deployed Worker (README, "Measured costs").
import { parseArgs } from 'node:util';
import { toJson } from '@atropyle/sdk';
import { deployLocal, increaseTime, startAnvil } from '../../../scripts/lib/anvil';
import { Budget } from '../src/budget';
import { createSdkChain } from '../src/chain/sdk';
import { readConfig } from '../src/config';
import { runIntegrity } from '../src/cron/integrity';
import { type CronDeps, runMinute } from '../src/cron/minute';
import { createLogger } from '../src/log';
import { metered } from '../src/store/d1';
import { Store } from '../src/store/store';
import { chainNowMs, createDrill, DEVNET_KEEPER, localDeployment } from './lib/devnet';
import { nodeD1 } from './lib/node-d1';

interface Row {
  phase: string;
  cpuMs: number;
  wallMs: number;
  fetches: number;
  queries: number;
  result: string;
}

const { values } = parseArgs({ options: { vaults: { type: 'string', default: '10' }, budget: { type: 'string', default: '45' } } });
const vaults = Number(values.vaults);
const limit = values.budget;

const anvil = await startAnvil();
try {
  const deployment = localDeployment(anvil.url, await deployLocal(anvil.url));
  const db = nodeD1();
  const store = new Store(db);
  const config = readConfig({ CHAIN: 'local', SUBREQUEST_BUDGET: limit, D1_QUERY_BUDGET: limit });
  const rows: Row[] = [];

  const run = async (phase: string, job: 'minute' | 'integrity') => {
    const nowMs = await chainNowMs(anvil.url);
    const budget = new Budget(config.budget);
    const deps: CronDeps = {
      store: new Store(metered(db, budget)),
      chain: createSdkChain({ chain: deployment, budget, keeperAccount: DEVNET_KEEPER }),
      // Counts one subrequest per message, like telegramNotifier, without calling Telegram.
      notifier: {
        send: async () => {
          budget.countFetch();
          return { ok: true, blocked: false, status: 200 };
        },
      },
      clock: { nowMs: () => nowMs },
      log: createLogger({}, () => {}),
      budget,
      config,
    };
    const cpu = process.cpuUsage();
    const started = performance.now();
    const result = job === 'minute' ? await runMinute(deps) : await runIntegrity(deps);
    const used = process.cpuUsage(cpu);
    rows.push({
      phase,
      cpuMs: Math.round((used.user + used.system) / 1000),
      wallMs: Math.round(performance.now() - started),
      fetches: budget.fetches,
      queries: budget.queries,
      result: JSON.stringify(toJson(result)),
    });
  };

  for (let i = 0; i < vaults; i++) {
    const vault = await createDrill(anvil.url, deployment, `measure-${i}`);
    await store.addWatch(`owner-${i}`, vault, 'owner', i);
    await store.addWatch(`heir-${i}`, vault, 'heir', i);
  }
  await run('index', 'minute');
  await run('idle', 'minute');
  await increaseTime(anvil.url, 125);
  await run('poke', 'minute');
  await run('notify', 'minute');
  await run('integrity', 'integrity');
  console.table(rows);
  console.log(`vaults=${vaults} budget=${limit}/${limit}. CPU is Node on this machine and excludes signing.`);
  db.close();
} finally {
  await anvil.stop();
}
```

Ghi chú:
- `tsx` 4.20.6 là devDependency ở root (Plan 2). `npm run` tìm nó trong `node_modules/.bin` của root, nên không cần thêm vào `apps/worker/package.json`.
- Script dùng `node:sqlite` qua `nodeD1` (Task 10), nên cần Node 24. Node có thể in `ExperimentalWarning`; đó không phải lỗi.

- [ ] **Step 2: Chạy script đo**

Run: `npm run build -w circuits && npm run build -w packages/sdk && (cd contracts && forge build) && npm run measure:cron -w apps/worker -- --vaults 10`
Expected: một bảng 5 dòng; `fetches` và `queries` của mọi dòng ≤ 45.
- `index` có thể là `incomplete`: 10 vault × 4 fetch không vừa một lần chạy. Khi đó `idle` index nốt và ghi cursor.
- `poke` có `keeper.sent` từ 1 tới `maxTx` (giới hạn bởi ngân sách còn lại).
- `notify` gửi tin `AlarmRaised` cho cả chủ ví lẫn người thừa kế của mỗi vault vừa bị poke.

Chạy thêm `npm run measure:cron -w apps/worker -- --vaults 10 --budget 900`. Expected: `index` là `ok` ngay lần đầu, và `poke` gửi được tới 10 giao dịch.

- [ ] **Step 3: So số đo với `COST` và ghi README**

Tính từ bảng của lần chạy `--budget 900`:
- fetch cho mỗi vault ≈ (`fetches` của `index` − `fetches` của `idle`) / 10, so với `COST.view.fetches = 4`;
- fetch cho mỗi giao dịch keeper ≈ (`fetches` của `poke` − `fetches` của `idle` − 2 − 4 × số vault tới hạn) / `keeper.sent`, so với `COST.keeperTx.fetches = 12`.

Số nào lệch quá 50% thì sửa `COST` trong `src/budget.ts` cho bằng số đo (làm tròn lên), rồi chạy lại `npm test -w apps/worker`. Test của Task 5 có tính theo `COST` (ví dụ `maxTx: 2`); sửa số trong test cho khớp và ghi lại phép tính trong comment.

Thêm vào cuối `apps/worker/README.md` một mục, dán đúng bảng mà script in ra:

```markdown
## Measured costs

`npm run measure:cron -w apps/worker -- --vaults 10` on anvil (Node, this machine, signing excluded):

<the table printed by the script, as a Markdown table>

Real CPU per invocation on Cloudflare (from `wrangler tail`, see below): idle run … ms, poke run … ms, distribute run … ms.
Decision: branch … (see "CPU limits").
```

Dòng "Real CPU…" và "Decision…" được điền ở Step 7 và Step 8, sau khi người dùng đo trên Cloudflare.

- [ ] **Step 4: `[USER]` Tạo bot, ví keeper và database**

Người dùng tự làm các việc sau trên máy của mình:

1. Tạo bot: nhắn `/newbot` cho @BotFather, lưu token và username của bot. Username dùng cho `VITE_TELEGRAM_BOT` của web (Plan 4).
2. Tạo một ví **mới** trong ví của mình, chỉ để trả gas cho keeper. Nạp khoảng 0,05 OKB, không để gì khác trong ví đó.
3. Tạo database và áp migration:

```bash
cd apps/worker
npx wrangler login
npx wrangler d1 create atropyle
```

Dán `database_id` mà lệnh in ra vào `d1_databases[0].database_id` trong `wrangler.jsonc`. ID này không phải secret. Rồi chạy:

```bash
npx wrangler d1 migrations apply atropyle --remote
```

4. (Không bắt buộc) Lấy chat id cho cảnh báo ops: nhắn một tin bất kỳ cho bot, rồi **trước khi** đặt webhook chạy:

```bash
read -s TELEGRAM_TOKEN
curl -sS "https://api.telegram.org/bot${TELEGRAM_TOKEN}/getUpdates" | jq '.result[].message.chat.id'
```

Ghi số đó vào `vars.OPS_CHAT_ID` trong `wrangler.jsonc`. `getUpdates` không chạy được khi webhook đang bật.

- [ ] **Step 5: `[USER]` Đặt secret và deploy**

```bash
cd apps/worker
npx wrangler secret put TELEGRAM_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put KEEPER_KEY
npx wrangler deploy
```

- Mỗi lệnh `secret put` hỏi giá trị trên terminal; dán vào đó, đừng truyền qua tham số dòng lệnh.
- `TELEGRAM_WEBHOOK_SECRET` dài 1–256 ký tự trong `A-Za-z0-9_-`. Có thể tạo bằng `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`.
- `KEEPER_KEY` là khoá của ví keeper ở Step 4, không phải ví nào khác.

Nếu `wrangler deploy` từ chối khối `ratelimits` (gói không có Rate Limiting), xoá khối `ratelimits` khỏi `wrangler.jsonc` rồi deploy lại. Worker tự dùng bộ đếm trong bộ nhớ (Quyết định 6).

- [ ] **Step 6: `[USER]` Đặt webhook và kiểm tra**

```bash
read -s TELEGRAM_TOKEN; read -s TELEGRAM_WEBHOOK_SECRET
curl -sS "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook" \
  --data-urlencode "url=https://atropyle-worker.<account>.workers.dev/telegram/webhook" \
  --data-urlencode "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
  --data-urlencode 'allowed_updates=["message"]' \
  --data-urlencode "drop_pending_updates=true"
curl -sS "https://atropyle-worker.<account>.workers.dev/health" | jq
```

Thay `<account>` bằng subdomain mà `wrangler deploy` in ra.

Expected:
- `setWebhook` trả `{"ok":true,"result":true,...}`.
- Ngay sau deploy, `/health` có `status: "degraded"`, vì cron chưa chạy lần nào và integrity là `unknown`. Sau khoảng 2 phút, `lastCronAgeSec` dưới 120 và `keeper.address` đúng là ví keeper, với `dryRun: false`. Sau 10 phút, `integrity` là `pass`.
- Cursor đi từ `factoryBlock`, 1000 block mỗi phút, nên `cursorLagBlocks` giảm dần. Nó có thể lớn trong vài giờ đầu, nếu factory đã deploy từ lâu.
- Mở link bot trên trang một vault (`/start <vault>-owner`): bot trả lời "Watching vault … as owner."

Kiểm rate limit:

```bash
for i in $(seq 1 130); do curl -s -o /dev/null -w '%{http_code}\n' "https://atropyle-worker.<account>.workers.dev/health"; done | sort | uniq -c
```

Expected: phần lớn là `200`, và có `429` sau khoảng 120 lượt. Binding đếm theo từng location của Cloudflare, nên con số có thể lệch một chút.

- [ ] **Step 7: `[USER]` Đo CPU thật trong một Drill**

Ở một terminal:

```bash
cd apps/worker
npx wrangler tail atropyle-worker --format json | jq -c 'select(.event.cron != null) | {cron: .event.cron, outcome, cpuTime, wallTime}'
```

Ở terminal khác, tạo một Drill từ web app, theo dõi nó bằng bot, rồi chờ khoảng 6 phút không check-in. Trong thời gian đó cron lần lượt index vault, poke, gửi tin, rồi distribute.

Ghi lại `cpuTime` của ba loại lần chạy: lần chạy không có việc, lần có `poke`, và lần có `distribute`. Truy vấn `$workers.cpuTimeMs` trong Workers Logs của dashboard cho cùng số liệu.

- [ ] **Step 8: Chọn nhánh CPU (Quyết định 25) và ghi README**

| Số đo | Nhánh | Việc cần làm |
|---|---|---|
| Mọi lần chạy có `outcome: "ok"` và `cpuTime` ≤ 8 ms (chừa 20% của mức 10 ms) | **0** — giữ gói Free | Không sửa gì. Nếu chỉ lần có giao dịch vượt 8 ms, thử `KEEPER_MAX_TX` = `2` trong `wrangler.jsonc`, deploy lại và đo lại |
| Có `exceededCpu`, hoặc `cpuTime` > 8 ms kể cả khi `KEEPER_MAX_TX` = `2`, và người dùng chấp nhận Workers Paid | **A** | Thêm `"limits": { "cpu_ms": 30000 }` vào `wrangler.jsonc`; đặt `SUBREQUEST_BUDGET` và `D1_QUERY_BUDGET` = `"900"`, `SCAN_MAX_BLOCKS` = `"5000"`; rồi `[USER]` chạy `npx wrangler deploy` |
| Như trên, nhưng người dùng không muốn trả phí | **B** | Task 13, chỉ khi người điều phối chấp nhận ngoại lệ "workflow CI ký giao dịch" |

Điền dòng "Real CPU…" và "Decision…" trong mục "Measured costs" của README. Thêm một mục ngắn:

```markdown
## CPU limits

Workers Free allows 10 ms of CPU per invocation. Branch 0 keeps the Worker on Free; branch A adds `limits.cpu_ms`
on Workers Paid; branch B moves the keeper to a scheduled GitHub Actions job (`KEEPER_MODE=external`).
```

- [ ] **Step 9: Commit**

```bash
git add apps/worker/scripts/measure-cron.ts apps/worker/README.md apps/worker/wrangler.jsonc apps/worker/src/budget.ts apps/worker/test/workers/minute.test.ts
git commit -m "chore(worker): measure cron costs, record the deploy and the CPU branch" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Chỉ `add` những file thật sự đổi. `wrangler.jsonc` chỉ chứa `database_id` và các var, không bao giờ chứa token hay khoá.

---

### Task 13 (có điều kiện): Keeper bên ngoài cho nhánh B

**Chỉ làm task này khi Task 12, Step 8 chọn nhánh B.** Nếu chọn nhánh 0 hoặc A, bỏ qua và sang Task 14.

Task này có hai mức:
- **B1** (Step 1–8): keeper chạy bằng Node trên máy hay server **của người dùng**, mỗi 5 phút. Không workflow CI nào ký giao dịch, nên B1 không vi phạm ràng buộc cứng.
- **B2** (Step 9–11): chạy cùng script đó bằng GitHub Actions. Đây đúng là "workflow CI ký giao dịch on-chain", trái ràng buộc cứng. **Chỉ làm B2 khi chính người dùng yêu cầu trong chat; người điều phối không duyệt trước ngoại lệ này.** B2 cũng phải thêm ngoại lệ có tên cho `keeper.yml` vào audit workflow của Plan 6 (Quyết định 25). Không có yêu cầu thì dừng sau B1.

**Files:**
- Create: `apps/worker/src/routes/keeper.ts`
- Create: `apps/worker/scripts/lib/external-keeper.ts`, `apps/worker/scripts/keeper-run.ts`
- Modify: `apps/worker/src/app.ts` (gắn `mountKeeper`), `apps/worker/package.json` (script `keeper:run`), `apps/worker/README.md` (mục "External keeper")
- Modify (`[USER]`): `apps/worker/wrangler.jsonc` (`KEEPER_MODE` = `"external"`)
- Create (chỉ B2): `.github/workflows/keeper.yml`
- Test: `apps/worker/test/workers/keeper-route.test.ts`, `apps/worker/test/devnet/external-keeper.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `readConfig`, `WorkerConfig.keeperMode`, `keeperMaxVaults`, `keeperMaxTx`; `Budget`; `createLogger`, `errorFields`, `Logger`; `nowSeconds`.
  - Task 2 (store): `Store.dueVaults(now: bigint, limit: number): Promise<Address[]>`, `applyVault`, `getMeta`.
  - Task 3: `ChainPort.keeperTick(vaults, { maxTx, lastDistributeAt })`, `ChainPort.keeper`, `createSdkChain`, `DEVNET_KEEPER`, `createDrill`.
  - Task 5: `runMinute`; gate `if (d.config.keeperMode !== 'worker') return null;` trong `runKeeper`.
  - Task 7: `AppEnv`, `problem`, `problemOf`.
  - Plan 2: `toAddress(input, path?)`, `KeeperReport`.
- Produces:
  - `GET /v1/keeper/due` → `{ schemaVersion: 1, now: string, vaults: Address[] }`. Chỉ có khi `KEEPER_MODE=external`; mode `worker` trả 404 `NOT_FOUND`. `now` là giây theo giờ chain, dạng chuỗi thập phân. `vaults` ở dạng checksum, quá hạn lâu nhất trước, tối đa `KEEPER_MAX_VAULTS`. `Cache-Control: no-store`.
  - `scripts/lib/external-keeper.ts`:
    - `interface DueList { schemaVersion: 1; now: string; vaults: Address[] }`
    - `interface ExternalKeeperOptions { workerUrl: string; chain: ChainPort; maxTx: number; log: Logger; fetchFn?: typeof fetch }`
    - `interface ExternalKeeperResult { due: number; report: KeeperReport | null; exitCode: 0 | 1 }`
    - `fetchDue(workerUrl: string, fetchFn?: typeof fetch): Promise<DueList>`
    - `runExternalKeeper(o: ExternalKeeperOptions): Promise<ExternalKeeperResult>`
  - Script npm `keeper:run` (`tsx scripts/keeper-run.ts`). Đọc `WORKER_URL` (bắt buộc), `KEEPER_KEY` (không có thì dry-run), `CHAIN`, `KEEPER_MAX_TX` từ môi trường. Thoát 1 khi khoá sai dạng, ví thiếu gas, hay có giao dịch gửi lỗi; thoát 2 khi thiếu `WORKER_URL`.

Thiết kế:
- Worker vẫn index, gửi tin và giữ `next_check_at` như cũ. Nó chỉ không chạy keeper, và chia sẻ danh sách vault tới hạn. Danh sách này là dữ liệu công khai on-chain, nên route không cần auth.
- Keeper bên ngoài gọi đúng `createSdkChain(...).keeperTick` mà cron dùng. Mọi giới hạn an toàn của spec §9.4 vẫn giữ: mô phỏng trước khi gửi, trần gas, tối đa 20 giao dịch, dừng dưới 0,005 OKB.
- Ở mode này `keeper_log` không được ghi. Sau mỗi event, cron đọc lại vault với `lastDistributeAt = null`. Với vault đã release mà còn tài sản, `planKeeperActions` trả `DISTRIBUTE_DUE` với `nextCheckAt = now + 3600`. Vì vậy `distribute` tự giãn ra mỗi giờ mà không cần `keeper_log`.
- Giao dịch mô phỏng lỗi thì vault vẫn tới hạn trong D1. Lần chạy sau, 5 phút nữa, thử lại; nhịp này bằng `RETRY_AFTER` của SDK.

- [ ] **Step 1: Viết test route và cron (thất bại)**

`apps/worker/test/workers/keeper-route.test.ts`:

```ts
import { env } from 'cloudflare:workers';
import { type Address, getAddress } from 'viem';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { runMinute } from '../../src/cron/minute';
import type { Store } from '../../src/store/store';
import { deps, testStore, type World, world } from './fakes';
import { OWNER, T0, VAULT_A, VAULT_B, VAULT_C, viewOf } from './fixtures';
import { resetDb } from './helpers';

const allow = { limit: async () => ({ success: true }) };

let w: World;
let store: Store;
const get = async (path: string) => createApp(() => deps(w)).request(path, {}, { ...env, RATE_LIMITER: allow });

/** Three indexed vaults at chain time T0: B is 5 s overdue, C is due right now, A is due in a minute. */
async function seedDue(): Promise<void> {
  const vault = (address: Address, block: bigint, nextCheckAt: bigint) =>
    store.applyVault({ created: { vault: address, owner: OWNER, drill: true, createdBlock: block }, view: viewOf(address, { nextCheckAt }), claims: [] });
  await vault(VAULT_A, 110n, T0 + 60n);
  await vault(VAULT_B, 120n, T0 - 5n);
  await vault(VAULT_C, 130n, T0);
}

beforeEach(async () => {
  await resetDb();
  store = testStore();
});

describe('GET /v1/keeper/due', () => {
  it('is not found while the keeper runs inside the Worker', async () => {
    w = world();
    await seedDue();
    const res = await get('/v1/keeper/due');
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    expect(await res.json()).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('lists the due vaults, most overdue first and in checksum form, when KEEPER_MODE=external', async () => {
    w = world({ KEEPER_MODE: 'external' });
    await seedDue();
    const res = await get('/v1/keeper/due');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ schemaVersion: 1, now: T0.toString(), vaults: [getAddress(VAULT_B), getAddress(VAULT_C)] });
  });

  it('returns at most KEEPER_MAX_VAULTS vaults', async () => {
    w = world({ KEEPER_MODE: 'external', KEEPER_MAX_VAULTS: '1' });
    await seedDue();
    const body = (await (await get('/v1/keeper/due')).json()) as { vaults: string[] };
    expect(body.vaults).toEqual([getAddress(VAULT_B)]);
  });
});

describe('the minute cron with KEEPER_MODE=external', () => {
  it('indexes as usual and never runs the keeper', async () => {
    w = world({ KEEPER_MODE: 'external' });
    await seedDue();
    const r = await runMinute(deps(w));
    expect(r).toMatchObject({ status: 'ok', keeper: null });
    expect(w.chain.keeperCalls).toEqual([]);
    expect(await store.getMeta('keeper')).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó thất bại**

Run: `npm test -w apps/worker -- keeper-route`
Expected: 2 FAIL ("expected 404 to be 200") ở hai test của mode `external`, vì route chưa có. 2 test còn lại PASS: test 404 của mode `worker`, và test cron (cổng `keeperMode` đã có từ Task 5; test này ghim nó lại).

- [ ] **Step 3: Viết route và gắn vào app**

`apps/worker/src/routes/keeper.ts`:

```ts
import { toAddress } from '@atropyle/sdk';
import type { Hono } from 'hono';
import type { AppEnv } from '../app';
import { nowSeconds } from '../clock';
import { problem, problemOf } from '../problem';

/**
 * Branch B (Task 13): the vaults an external keeper should look at. Only public on-chain data, so no auth;
 * the Worker signs nothing here. With KEEPER_MODE=worker the route does not exist.
 */
export function mountKeeper(app: Hono<AppEnv>): void {
  app.get('/v1/keeper/due', async (c) => {
    const { clock, config, store } = c.var.rt;
    if (config.keeperMode !== 'external') {
      return problem(problemOf('NOT_FOUND', 'The keeper runs inside the Worker, so there is no due list to share.'));
    }
    const now = nowSeconds(clock);
    const vaults = await store.dueVaults(now, config.keeperMaxVaults);
    return c.json({ schemaVersion: 1, now: now.toString(), vaults: vaults.map((v) => toAddress(v)) }, 200, { 'Cache-Control': 'no-store' });
  });
}
```

Trong `apps/worker/src/app.ts`:
- thêm `import { mountKeeper } from './routes/keeper';` ngay trước dòng import `./routes/telegram`, để Biome giữ thứ tự chữ cái;
- gọi `mountKeeper(app);` ngay sau `mountTelegram(app);`.

Route nằm dưới `/v1/*`, nên tự có CORS và rate limit 120 lượt/phút/IP của Task 7.

- [ ] **Step 4: Chạy test route**

Run: `npm test -w apps/worker -- keeper-route`
Expected: 4 test PASS.

- [ ] **Step 5: Viết test keeper bên ngoài trên devnet (thất bại)**

`apps/worker/test/devnet/external-keeper.test.ts`:

```ts
import type { Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { increaseTime } from '../../../../scripts/lib/anvil';
import { createDrill, DEVNET_KEEPER } from '../../scripts/lib/devnet';
import { fetchDue, runExternalKeeper } from '../../scripts/lib/external-keeper';
import { Budget } from '../../src/budget';
import { createSdkChain } from '../../src/chain/sdk';
import { createLogger } from '../../src/log';
import { devnet, revertChain, snapshotChain } from './helpers';

const WORKER = 'https://worker.test';
const budget = () => new Budget({ fetches: 10_000, queries: 10 });

/** A fake Worker that answers GET /v1/keeper/due with `vaults`. */
function dueList(vaults: string[]): typeof fetch {
  return async (input) => {
    expect(String(input)).toBe(`${WORKER}/v1/keeper/due`);
    return Response.json({ schemaVersion: 1, now: '0', vaults });
  };
}

describe('the external keeper', () => {
  const { rpcUrl, deployment } = devnet();
  let id: Hex;
  beforeEach(async () => {
    id = await snapshotChain(rpcUrl);
  });
  afterEach(async () => {
    await revertChain(rpcUrl, id);
  });

  it('pokes a vault from the due list with the unlocked keeper account', async () => {
    const vault = await createDrill(rpcUrl, deployment, 'external-keeper');
    await increaseTime(rpcUrl, 125);
    const lines: string[] = [];
    const chain = createSdkChain({ chain: deployment, budget: budget(), keeperAccount: DEVNET_KEEPER });
    const result = await runExternalKeeper({
      workerUrl: WORKER,
      chain,
      maxTx: 20,
      fetchFn: dueList([vault.toLowerCase()]),
      log: createLogger({}, (l) => lines.push(l)),
    });
    expect(result).toMatchObject({ due: 1, exitCode: 0, report: { sent: 1, dryRun: false } });
    expect(result.report?.outcomes[0]).toMatchObject({ status: 'sent', decision: { action: 'poke' } });
    expect(lines.some((l) => l.includes('"keeper.outcome"'))).toBe(true);
  });

  it('is a dry run without a key, and does nothing when no vault is due', async () => {
    const vault = await createDrill(rpcUrl, deployment, 'external-dry');
    await increaseTime(rpcUrl, 125);
    const chain = createSdkChain({ chain: deployment, budget: budget() });
    const log = createLogger({}, () => {});
    const dry = await runExternalKeeper({ workerUrl: WORKER, chain, maxTx: 20, fetchFn: dueList([vault]), log });
    expect(dry).toMatchObject({ due: 1, exitCode: 0, report: { sent: 0, dryRun: true } });
    expect(dry.report?.outcomes[0]?.status).toBe('dry-run');
    expect(await runExternalKeeper({ workerUrl: WORKER, chain, maxTx: 20, fetchFn: dueList([]), log })).toEqual({ due: 0, report: null, exitCode: 0 });
  });

  it('fails the run on a malformed key, an HTTP error or an unexpected body, without guessing', async () => {
    let called = false;
    const never: typeof fetch = async () => {
      called = true;
      return Response.json({});
    };
    const badKey = createSdkChain({ chain: deployment, budget: budget(), keeperKey: 'not-a-key' });
    const log = createLogger({}, () => {});
    expect(await runExternalKeeper({ workerUrl: WORKER, chain: badKey, maxTx: 20, fetchFn: never, log })).toEqual({ due: 0, report: null, exitCode: 1 });
    expect(called).toBe(false);
    await expect(fetchDue(WORKER, async () => new Response('down', { status: 503 }))).rejects.toThrow('HTTP 503');
    await expect(fetchDue(WORKER, async () => Response.json({ vaults: 'all' }))).rejects.toThrow('unexpected body');
    await expect(fetchDue(WORKER, async () => Response.json({ schemaVersion: 1, now: '0', vaults: ['0x1234'] }))).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Chạy test để thấy nó thất bại**

Run: `npm run test:devnet -w apps/worker -- external-keeper`
Expected: FAIL với "Failed to load url ../../scripts/lib/external-keeper" (hoặc "Cannot find module"), vì file chưa có.

- [ ] **Step 7: Viết keeper bên ngoài và script chạy**

`apps/worker/scripts/lib/external-keeper.ts`:

```ts
// Branch B (Task 13): reads the due list from the Worker and runs the same keeperTick as the minute cron.
// It runs in Node on a machine the maintainer controls. The Worker only shares public data and signs nothing.
import { type KeeperReport, toAddress } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { ChainPort } from '../../src/chain/port';
import type { Logger } from '../../src/log';

export interface DueList {
  schemaVersion: 1;
  now: string;
  vaults: Address[];
}

export interface ExternalKeeperOptions {
  /** Origin of the Worker, for example https://atropyle-worker.example.workers.dev */
  workerUrl: string;
  chain: ChainPort;
  maxTx: number;
  log: Logger;
  fetchFn?: typeof fetch;
}

export interface ExternalKeeperResult {
  due: number;
  report: KeeperReport | null;
  /** 1 marks the run as failed so the scheduler shows it: a malformed key, a low balance or a failed send. */
  exitCode: 0 | 1;
}

/** GET /v1/keeper/due. Throws on an HTTP error or an unexpected body: a keeper must not guess its work list. */
export async function fetchDue(workerUrl: string, fetchFn: typeof fetch = (input, init) => fetch(input, init)): Promise<DueList> {
  const url = new URL('v1/keeper/due', workerUrl.endsWith('/') ? workerUrl : `${workerUrl}/`).toString();
  const res = await fetchFn(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET /v1/keeper/due returned HTTP ${res.status}`);
  const body = (await res.json()) as { schemaVersion?: unknown; now?: unknown; vaults?: unknown };
  if (body.schemaVersion !== 1 || typeof body.now !== 'string' || !Array.isArray(body.vaults)) {
    throw new Error('GET /v1/keeper/due returned an unexpected body');
  }
  return { schemaVersion: 1, now: body.now, vaults: body.vaults.map((v, i) => toAddress(v, `vaults[${i}]`)) };
}

export async function runExternalKeeper(o: ExternalKeeperOptions): Promise<ExternalKeeperResult> {
  if (o.chain.keeper.error !== null) {
    o.log.error('keeper.key_invalid', { error: o.chain.keeper.error });
    return { due: 0, report: null, exitCode: 1 };
  }
  const due = await fetchDue(o.workerUrl, o.fetchFn);
  if (due.vaults.length === 0) {
    o.log.info('keeper.idle', { due: 0 });
    return { due: 0, report: null, exitCode: 0 };
  }
  // keeper_log stays empty in this mode. The cron re-reads a vault after each of its events, so a released vault
  // gets nextCheckAt = now + 1 h after every distribute, and distribute backs off by itself.
  const report = await o.chain.keeperTick(due.vaults, { maxTx: o.maxTx, lastDistributeAt: () => null });
  const failed = report.outcomes.filter((x) => x.status === 'send-failed').length;
  o.log.info('keeper.outcome', { due: due.vaults.length, report });
  if (report.stopped === 'LOW_BALANCE') o.log.error('keeper.low_balance', { keeper: report.keeper, balance: report.balance });
  return { due: due.vaults.length, report, exitCode: report.stopped === 'LOW_BALANCE' || failed > 0 ? 1 : 0 };
}
```

`apps/worker/scripts/keeper-run.ts`:

```ts
// Branch B (Task 13): one run of the external keeper. Schedule it every 5 minutes on a machine you control.
// Environment: WORKER_URL (required), KEEPER_KEY (optional; without it the run is a dry run), CHAIN, KEEPER_MAX_TX.
// KEEPER_KEY is read from the environment only and is never printed.
import { Budget } from '../src/budget';
import { createSdkChain } from '../src/chain/sdk';
import { readConfig } from '../src/config';
import { createLogger, errorFields } from '../src/log';
import { runExternalKeeper } from './lib/external-keeper';

const log = createLogger({ scope: 'external-keeper' });
const workerUrl = process.env.WORKER_URL?.trim() ?? '';
if (!/^https?:\/\//.test(workerUrl)) {
  log.error('keeper.config', { error: 'Set WORKER_URL to the Worker origin, for example https://atropyle-worker.<account>.workers.dev' });
  process.exit(2);
}

try {
  const config = readConfig({ CHAIN: process.env.CHAIN, KEEPER_MAX_TX: process.env.KEEPER_MAX_TX });
  // No subrequest limit outside Workers; the Budget only exists because the transports count every fetch.
  const budget = new Budget({ fetches: 10_000, queries: 10 });
  const chain = createSdkChain({ chain: config.chain, budget, keeperKey: process.env.KEEPER_KEY });
  const result = await runExternalKeeper({ workerUrl, chain, maxTx: config.keeperMaxTx, log });
  process.exitCode = result.exitCode;
} catch (e) {
  log.error('keeper.failed', errorFields(e));
  process.exitCode = 1;
}
```

Trong `apps/worker/package.json`, thêm vào `scripts`, ngay sau `measure:cron`:

```json
    "keeper:run": "tsx scripts/keeper-run.ts"
```

(nhớ thêm dấu phẩy sau dòng `measure:cron`).

- [ ] **Step 8: Chạy test, kiểm toàn bộ, ghi README và commit**

Run: `npm run test:devnet -w apps/worker`
Expected: 8 test PASS (3 `chain`, 2 `keeper`, 3 `external-keeper`).

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker`
Expected: mọi test workerd PASS; `tsc` và Biome sạch.

Thêm vào `apps/worker/README.md`, ngay sau mục "The keeper":

````markdown
## External keeper (branch B)

Only for when the Worker cannot sign within its CPU limit (see "CPU limits"). The Worker keeps indexing and
sending notices, stops running the keeper, and publishes the due list at `GET /v1/keeper/due` (public on-chain
data). A Node process on a machine you control signs `poke` and `distribute` with the same code and limits.

1. Set `"KEEPER_MODE": "external"` in `wrangler.jsonc`, run `npx wrangler deploy`, then remove the key from the
   Worker with `npx wrangler secret delete KEEPER_KEY`.
2. Create `~/.atropyle-keeper.env` with two lines, `WORKER_URL=https://atropyle-worker.<account>.workers.dev`
   and `KEEPER_KEY=<the keeper wallet's key>`, then `chmod 600 ~/.atropyle-keeper.env`.
3. Run it every 5 minutes, for example with `crontab -e`:

   ```
   */5 * * * * cd /path/to/atropyle && set -a && . "$HOME/.atropyle-keeper.env" && set +a && npm run keeper:run -w apps/worker >> "$HOME/atropyle-keeper.log" 2>&1
   ```

A run exits 1 on a malformed key, a balance below 0.005 OKB or a failed send, and 2 when `WORKER_URL` is missing.
In this mode `/health` reports the Worker's own keeper, which is off (`dryRun: true`); check the keeper log instead.
````

```bash
git add apps/worker/src/routes/keeper.ts apps/worker/src/app.ts apps/worker/scripts/lib/external-keeper.ts apps/worker/scripts/keeper-run.ts apps/worker/package.json apps/worker/README.md apps/worker/test/workers/keeper-route.test.ts apps/worker/test/devnet/external-keeper.test.ts
git commit -m "feat(worker): external keeper mode with /v1/keeper/due and keeper:run" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Sau commit, việc của người dùng (`[USER]`) là ba bước trong mục README vừa viết: deploy với `KEEPER_MODE=external`, tạo file env của mình, và đặt crontab. Claude/agent không tạo file env, không thấy khoá và không chạy `keeper:run` với khoá thật.

- [ ] **Step 9 (chỉ B2): Viết workflow GitHub Actions**

**Dừng ở đây** nếu người dùng chưa tự yêu cầu B2 trong chat (Quyết định 25). Nếu có, việc đầu tiên là thêm ngoại lệ có tên cho `keeper.yml` vào audit `scripts/ops/workflows.ts` của Plan 6 (xem Quyết định 25), vì nếu không thì CI đỏ.

Các điểm đã xác minh trong docs GitHub ("Events that trigger workflows", mục `schedule`):
- khoảng ngắn nhất là 5 phút;
- lịch có thể bị trễ khi GitHub Actions tải cao, và một số job xếp hàng có thể bị bỏ;
- ở repo public, workflow theo lịch tự tắt sau 60 ngày không có hoạt động;
- workflow theo lịch chỉ chạy trên nhánh mặc định.

Vì vậy B2 chỉ là best effort. Ai cũng gọi được `poke` và `distribute` từ trang vault hay CLI, nên một lần trễ không làm hỏng vault.

`.github/workflows/keeper.yml`:

```yaml
name: keeper

# Branch B2 of Plan 5 (Task 13). This is the only workflow that signs transactions, as an exception approved
# for this branch. poke() and distribute() are permissionless and only pay heirs or the recovery wallet, so the
# key can burn gas but cannot move assets. Fund the keeper wallet with a little OKB and nothing else.
on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: keeper
  cancel-in-progress: false

jobs:
  keeper:
    if: vars.KEEPER_MODE == 'external'
    runs-on: ubuntu-latest
    environment: keeper
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run build -w circuits
      - run: npm run build -w packages/sdk
      - run: npm run keeper:run -w apps/worker
        env:
          WORKER_URL: ${{ vars.WORKER_URL }}
          KEEPER_KEY: ${{ secrets.KEEPER_KEY }}
          CHAIN: xlayer
```

Ghi chú:
- `concurrency` với `cancel-in-progress: false` giữ mỗi lúc chỉ một lần chạy, nên hai lần chạy không tranh nonce.
- Secret nằm trong environment `keeper`, không ở cấp repo. Workflow khác không đọc được nó.
- Plan 6 ghim SHA cho các action ở đây, giống các workflow khác.

Run: `node -e "const y=require('node:fs').readFileSync('.github/workflows/keeper.yml','utf8'); for (const s of ['environment: keeper','cancel-in-progress: false','contents: read',\"vars.KEEPER_MODE == 'external'\"]) if(!y.includes(s)) { console.error('missing', s); process.exit(1); }"`
Expected: thoát 0.

- [ ] **Step 10 (chỉ B2): `[USER]` Đặt environment, secret và biến trên GitHub**

Người dùng chạy trên máy mình, với `gh` đã đăng nhập:

```bash
gh api -X PUT repos/duongnq2798/atropyle/environments/keeper
gh secret set KEEPER_KEY --env keeper --repo duongnq2798/atropyle
gh variable set WORKER_URL --repo duongnq2798/atropyle --body "https://atropyle-worker.<account>.workers.dev"
gh variable set KEEPER_MODE --repo duongnq2798/atropyle --body external
gh workflow run keeper.yml --repo duongnq2798/atropyle
```

- `gh secret set` không có `--body` thì hỏi giá trị trên terminal; dán khoá ở đó.
- Trong Settings → Environments → `keeper`, nên giới hạn "Deployment branches" ở nhánh mặc định.
- Mở tab Actions và xem lần chạy `workflow_dispatch`. Expected: job xanh, log có `keeper.idle` hoặc `keeper.outcome`, và không có khoá trong log (GitHub che secret).
- Muốn tắt B2: `gh variable set KEEPER_MODE --repo duongnq2798/atropyle --body worker`. Job sẽ bị bỏ qua nhờ điều kiện `if`.

- [ ] **Step 11 (chỉ B2): Commit**

```bash
git add .github/workflows/keeper.yml
git commit -m "ci(worker): scheduled external keeper (branch B2, approved exception)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Badge cho README (`/v1/badge/vaults`, `/v1/badge/integrity`)

Mục cắt #1 (spec §18). Không task P0 nào phụ thuộc task này. Hết giờ thì bỏ cả task; README của Plan 6 chỉ mất hai badge.

**Files:**
- Create: `apps/worker/src/routes/badge.ts`
- Modify: `apps/worker/src/app.ts` (gắn `mountBadge`), `apps/worker/README.md` (dòng trong bảng Endpoints)
- Test: `apps/worker/test/workers/badge.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `Store.getSummary(): Promise<StatsSummary | null>`, `Store.getMeta<T>(key): Promise<{ value: T; updatedAt: number } | null>`, kiểu `IntegrityRecord`.
  - Task 7: `AppEnv`. Task 8: `INTEGRITY_FRESH_SEC` (`routes/health.ts`).
- Produces:
  - `interface ShieldsBadge { schemaVersion: 1; label: string; message: string; color: string }`, đúng định dạng endpoint của shields.io theo hợp đồng giữa các plan.
  - `GET /v1/badge/vaults`: `label: 'vaults'`. `message` là tổng số vault (`stats.vaults.total`), màu `blue`. Chưa có lần index nào thì `message: 'pending'`, màu `lightgrey`.
  - `GET /v1/badge/integrity`: `label: 'integrity'`. `pass` màu `brightgreen`, `fail` màu `red`. Chưa có bản ghi, hoặc bản ghi cũ hơn 30 phút, thì `unknown` màu `lightgrey`.
  - Cả hai luôn trả 200 với `Cache-Control: public, max-age=300`. Badge không bao giờ là problem+json, vì shields hiện lỗi đó thành badge "invalid".
  - Plan 6 dùng: `https://img.shields.io/endpoint?url=https%3A%2F%2Fatropyle-worker.<account>.workers.dev%2Fv1%2Fbadge%2Fvaults` (và `integrity`).

Mức độ tươi của integrity dùng đúng ngưỡng của `/health` (`INTEGRITY_FRESH_SEC`), để badge và `/health` không bao giờ nói hai điều khác nhau.

- [ ] **Step 1: Viết test (thất bại)**

`apps/worker/test/workers/badge.test.ts`:

```ts
import { env } from 'cloudflare:workers';
import { toJson } from '@atropyle/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { isoAt } from '../../src/clock';
import type { Store } from '../../src/store/store';
import type { IntegrityRecord, IntegrityReportJson } from '../../src/types';
import { deps, okIntegrity, testStore, type World, world } from './fakes';
import { resetDb } from './helpers';

const allow = { limit: async () => ({ success: true }) };
const MIN = 60_000;

let w: World;
let store: Store;
let now: number;
const get = async (path: string) => createApp(() => deps(w)).request(path, {}, { ...env, RATE_LIMITER: allow });
const json = async (path: string) => {
  const res = await get(path);
  expect(res.status).toBe(200);
  expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  return res.json();
};

async function seedIntegrity(ok: boolean, ageMs: number): Promise<void> {
  const record: IntegrityRecord = {
    checkedAt: isoAt(now - ageMs),
    blockNumber: '190',
    report: toJson(okIntegrity({ ok, blockNumber: 190n })) as IntegrityReportJson,
  };
  await store.setMeta('integrity', record, now - ageMs);
}

beforeEach(async () => {
  await resetDb();
  w = world();
  store = testStore();
  now = w.clock.nowMs();
});

describe('GET /v1/badge/vaults', () => {
  it('says pending before the first index run', async () => {
    expect(await json('/v1/badge/vaults')).toEqual({ schemaVersion: 1, label: 'vaults', message: 'pending', color: 'lightgrey' });
  });

  it('shows the total number of vaults', async () => {
    await store.commitCursor({
      cursor: 150n,
      counters: { aliveEvents: 3, alarms: 0, releases: 0, distributions: 0 },
      summary: {
        updatedAt: isoAt(now),
        stats: { fromBlock: '100', toBlock: '150', vaults: { total: 3, drill: 2, paid: 1 }, owners: 2, checkIns: 0, alarms: 0, releases: 0, distributions: 0 },
      },
    });
    expect(await json('/v1/badge/vaults')).toEqual({ schemaVersion: 1, label: 'vaults', message: '3', color: 'blue' });
  });
});

describe('GET /v1/badge/integrity', () => {
  it.each([
    ['no check has run yet', null, 'unknown', 'lightgrey'],
    ['the last check passed 5 minutes ago', { ok: true, ageMs: 5 * MIN }, 'pass', 'brightgreen'],
    ['the last check failed 5 minutes ago', { ok: false, ageMs: 5 * MIN }, 'fail', 'red'],
    ['the last pass is 31 minutes old', { ok: true, ageMs: 31 * MIN }, 'unknown', 'lightgrey'],
    ['the last failure is 31 minutes old', { ok: false, ageMs: 31 * MIN }, 'unknown', 'lightgrey'],
  ] as const)('when %s, says %s', async (_name, seed, message, color) => {
    if (seed) await seedIntegrity(seed.ok, seed.ageMs);
    expect(await json('/v1/badge/integrity')).toEqual({ schemaVersion: 1, label: 'integrity', message, color });
  });

  it('is a problem+json 404 for any other badge', async () => {
    const res = await get('/v1/badge/owners');
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó thất bại**

Run: `npm test -w apps/worker -- badge`
Expected: 7 FAIL với "expected 404 to be 200", vì route chưa có. Test 404 cuối cùng PASS ngay, vì `notFound` của Task 7 đã lo.

- [ ] **Step 3: Viết route và gắn vào app**

`apps/worker/src/routes/badge.ts`:

```ts
import type { Hono } from 'hono';
import type { AppEnv } from '../app';
import type { IntegrityRecord } from '../types';
import { INTEGRITY_FRESH_SEC } from './health';

/** The shields.io endpoint format: https://shields.io/badges/endpoint-badge */
export interface ShieldsBadge {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

const CACHE = { 'Cache-Control': 'public, max-age=300' };

export function mountBadge(app: Hono<AppEnv>): void {
  app.get('/v1/badge/vaults', async (c) => {
    const summary = await c.var.rt.store.getSummary();
    const badge: ShieldsBadge = summary
      ? { schemaVersion: 1, label: 'vaults', message: String(summary.stats.vaults.total), color: 'blue' }
      : { schemaVersion: 1, label: 'vaults', message: 'pending', color: 'lightgrey' };
    return c.json(badge, 200, CACHE);
  });

  app.get('/v1/badge/integrity', async (c) => {
    const { clock, store } = c.var.rt;
    const row = await store.getMeta<IntegrityRecord>('integrity');
    // Same freshness rule as /health, so the badge and /health never disagree.
    const fresh = row !== null && clock.nowMs() - row.updatedAt <= INTEGRITY_FRESH_SEC * 1000;
    const badge: ShieldsBadge = !fresh
      ? { schemaVersion: 1, label: 'integrity', message: 'unknown', color: 'lightgrey' }
      : row.value.report.ok
        ? { schemaVersion: 1, label: 'integrity', message: 'pass', color: 'brightgreen' }
        : { schemaVersion: 1, label: 'integrity', message: 'fail', color: 'red' };
    return c.json(badge, 200, CACHE);
  });
}
```

Nếu `tsc` báo `row` có thể `null` ở nhánh `row.value` (TypeScript không thu hẹp kiểu qua biến `fresh`), viết lại điều kiện thành `row === null || !fresh ? … : row.value.report.ok ? … : …`.

Trong `apps/worker/src/app.ts`:
- thêm `import { mountBadge } from './routes/badge';` ngay trước dòng import `./routes/health`;
- gọi `mountBadge(app);` ngay sau `mountV1(app);`.

`/health` trong Task 8 dùng `>` cho "cũ hơn 30 phút", còn badge dùng `<=` cho "còn tươi". Hai điều kiện là phủ định của nhau, nên ở đúng mốc 30 phút cả hai cùng coi bản ghi là còn tươi.

Thêm một dòng vào bảng "Endpoints" của `apps/worker/README.md`, ngay sau dòng `GET /v1/integrity`:

```markdown
| `GET /v1/badge/vaults`, `GET /v1/badge/integrity` | [shields.io endpoint](https://shields.io/badges/endpoint-badge) JSON for README badges. Always HTTP 200, cached for 5 minutes. |
```

- [ ] **Step 4: Chạy test**

Run: `npm test -w apps/worker -- badge`
Expected: 8 test PASS (2 `vaults`, 5 ca `it.each` của `integrity`, 1 test 404).

- [ ] **Step 5: Kiểm toàn bộ và commit**

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker`
Expected: mọi test PASS; `tsc` và Biome sạch.

```bash
git add apps/worker/src/routes/badge.ts apps/worker/src/app.ts apps/worker/README.md apps/worker/test/workers/badge.test.ts
git commit -m "feat(worker): shields.io badges for vaults and integrity" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Lời nhắc check-in ở mốc 50%, 80% và 100%

Mục cắt #5 (spec §18). Spec lõi §7: "Chủ ví được nhắc ở các mốc 50%, 80% và 100% của T×P", tức của khoảng từ `lastAlive` tới `lateAt`. Không task P0 nào phụ thuộc task này. Hết giờ thì bỏ cả task; báo động và báo release vẫn còn nguyên.

**Files:**
- Create: `apps/worker/migrations/0002_reminders.sql`
- Create: `apps/worker/src/cron/reminders.ts`
- Modify: `apps/worker/src/types.ts` (thêm `ReminderCandidate`), `apps/worker/src/store/store.ts` (`saveView` reset `reminded`; thêm `reminderCandidates`, `claimReminder`), `apps/worker/src/cron/minute.ts` (gọi `sendReminders`), `apps/worker/README.md`
- Test: `apps/worker/test/workers/reminders.test.ts`

**Interfaces:**
- Consumes:
  - Task 2: `Store.watchersOf`, `Store.removeWatches`, `Store.applyVault`, `Store.addWatch`, `Store.recordKeeper`; `COST`; `nowSeconds`; `errorFields`.
  - Task 4: `formatTime`, `showAddress`, `vaultLink` (`telegram/messages.ts`).
  - Task 5: `CronDeps`, `runMinute`, `MinuteResult`; `FakeChain`, `world`, `deps`, `testStore`, `KEEPER`.
- Produces:
  - Cột `vaults.reminded INTEGER NOT NULL DEFAULT 0`: mốc cao nhất đã nhắc cho `last_alive` hiện tại. Lưu view có `last_alive` mới thì cột về 0.
  - `types.ts`: `interface ReminderCandidate { vault: Address; lastAlive: bigint; lateAt: bigint; reminded: number }`.
  - `Store.reminderCandidates(now: bigint, limit: number): Promise<ReminderCandidate[]>`.
  - `Store.claimReminder(vault: string, from: number, step: number): Promise<boolean>`.
  - `cron/reminders.ts`:
    - `REMINDER_STEPS = [50, 80, 100] as const`, `type ReminderStep = 50 | 80 | 100`, `MAX_REMINDERS = 10`;
    - `dueReminder(lastAlive: bigint, lateAt: bigint, reminded: number, now: bigint): ReminderStep | null`;
    - `reminderText(step: ReminderStep, vault: string, lateAt: bigint, webUrl: string): string`;
    - `interface ReminderResult { candidates: number; claimed: number; sent: number }`;
    - `sendReminders(d: CronDeps): Promise<ReminderResult>`.
  - `MinuteResult` có thêm `reminded: number` (số lời nhắc đã claim trong lần chạy).

Quy tắc:
- Chỉ nhắc chat theo dõi với vai trò `owner`, chỉ cho vault đang `active` và chưa hết hạn Drill.
- Mỗi mốc gửi một lần cho mỗi lần check-in. Cron trễ qua nhiều mốc thì chỉ gửi mốc cao nhất.
- Claim (đổi `reminded`) trước, gửi sau: at-most-once, như thông báo event (Quyết định 13).
- Không nhắc mốc nào nếu keeper đã gửi `poke` cho vault đó kể từ `last_alive`. Báo động khẩn của `AlarmRaised` sẽ tới ngay lần chạy sau, nên lời nhắc 100% lúc đó chỉ là tin thừa. Nhờ vậy E2E của Task 10 vẫn đúng: chủ ví nhận đúng một tin.
- Chỉ chạy khi lần đồng bộ `ok` và đã đuổi kịp đầu chain. Nếu cron còn đang đuổi theo, D1 có thể chưa thấy lần check-in mới nhất, và sẽ nhắc nhầm một chủ ví vừa check-in.
- Chạy sau keeper, bằng phần ngân sách còn lại, và luôn chừa `COST.reserve`.

- [ ] **Step 1: Viết test (thất bại)**

`apps/worker/test/workers/reminders.test.ts`:

```ts
import type { Address } from 'viem';
import { beforeEach, describe, expect, it } from 'vitest';
import { isoAt } from '../../src/clock';
import { runMinute } from '../../src/cron/minute';
import { dueReminder, reminderText, sendReminders } from '../../src/cron/reminders';
import type { Store } from '../../src/store/store';
import type { KeeperStatus, VaultView } from '../../src/types';
import { deps, KEEPER, testStore, type World, world } from './fakes';
import { ev, OWNER, T0, txHash, VAULT_A, VAULT_B, VAULT_C, viewOf } from './fixtures';
import { resetDb } from './helpers';

const WEB = 'https://web.test/';
const KEEPER_STATUS: KeeperStatus = { ranAt: isoAt(0), address: KEEPER, balance: '1', dryRun: false, stopped: null, sent: 1, failed: 0 };

let w: World;
let store: Store;

/** An indexed vault whose check-in deadline is exactly now (T0): 100 % of its period has passed. */
async function seedLate(vault: Address, block: bigint, over: Partial<VaultView> = {}): Promise<void> {
  await store.applyVault({
    created: { vault, owner: OWNER, drill: true, createdBlock: block },
    view: viewOf(vault, { lastAlive: T0 - 120n, lateAt: T0, nextCheckAt: T0, ...over }),
    claims: [],
  });
}

beforeEach(async () => {
  await resetDb();
  w = world();
  store = testStore();
});

describe('dueReminder', () => {
  it.each([
    ['before the halfway mark', 1049n, 0, null],
    ['at 50 %', 1050n, 0, 50],
    ['between 50 and 80 %, already reminded at 50', 1079n, 50, null],
    ['at 80 %', 1080n, 50, 80],
    ['past 80 % when the cron missed 50 %', 1085n, 0, 80],
    ['at the deadline', 1100n, 80, 100],
    ['long after the deadline, already reminded', 1500n, 100, null],
    ['before the last check-in', 900n, 0, null],
  ] as const)('%s', (_name, now, reminded, expected) => {
    expect(dueReminder(1000n, 1100n, reminded, now)).toBe(expected);
  });

  it('never reminds on an empty period', () => {
    expect(dueReminder(1000n, 1000n, 0, 2000n)).toBeNull();
  });
});

describe('owner reminders in the minute cron', () => {
  it('reminds the owner at 50, 80 and 100 % once each, and starts over after a check-in', async () => {
    w.chain.addVault(VAULT_A, 150n, { view: { lastAlive: T0 - 60n, lateAt: T0 + 60n, nextCheckAt: T0 + 60n } });
    await store.addWatch('owner-chat', VAULT_A, 'owner', 1);
    await store.addWatch('heir-chat', VAULT_A, 'heir', 2);
    const owner = () => w.notifier.sent.filter((m) => m.chatId === 'owner-chat').map((m) => m.text);

    // T0 is halfway between the check-in (T0 - 60) and the deadline (T0 + 60).
    expect(await runMinute(deps(w))).toMatchObject({ status: 'ok', reminded: 1 });
    expect(owner()).toEqual([reminderText(50, VAULT_A, T0 + 60n, WEB)]);
    expect(owner()[0]).toMatch(/^Reminder: vault 0x[0-9a-fA-F]{40} is halfway to its check-in deadline\. Check in before .+ UTC\.\n/);
    expect(await runMinute(deps(w))).toMatchObject({ status: 'ok', reminded: 0 });

    w.clock.advance(36);
    expect(await runMinute(deps(w))).toMatchObject({ reminded: 1 });
    expect(owner()[1]).toMatch(/reaches its check-in deadline on .+ UTC\. Check in soon\./);

    w.clock.advance(24);
    expect(await runMinute(deps(w))).toMatchObject({ reminded: 1 });
    expect(owner()[2]).toMatch(/^Check-in deadline passed for vault 0x[0-9a-fA-F]{40} at .+ UTC\. Anyone can now raise the inheritance alarm\./);
    expect(w.notifier.sent.some((m) => m.chatId === 'heir-chat')).toBe(false);

    // The owner checks in at T0 + 60: the new period restarts the steps.
    w.chain.head = 220n;
    w.chain.logs.push(ev(VAULT_A, 'Alive', 210n, { at: T0 + 60n }));
    w.chain.views.set(VAULT_A, viewOf(VAULT_A, { lastAlive: T0 + 60n, lateAt: T0 + 180n, nextCheckAt: T0 + 180n }));
    expect(await runMinute(deps(w))).toMatchObject({ status: 'ok', reminded: 0 });
    w.clock.advance(60);
    expect(await runMinute(deps(w))).toMatchObject({ reminded: 1 });
    expect(owner()).toHaveLength(4);
    expect(owner()[3]).toBe(reminderText(50, VAULT_A, T0 + 180n, WEB));
  });

  it('sends no reminder while the cron is still catching up with the chain', async () => {
    w = world({ SCAN_MAX_BLOCKS: '50' });
    w.chain.addVault(VAULT_A, 120n, { view: { lastAlive: T0 - 60n, lateAt: T0 + 60n, nextCheckAt: T0 + 60n } });
    await store.addWatch('owner-chat', VAULT_A, 'owner', 1);
    // 100..149 out of 100..200: the vault is indexed, but a later check-in could still be unseen.
    expect(await runMinute(deps(w))).toMatchObject({ status: 'ok', cursor: 149n, reminded: 0 });
    expect(await runMinute(deps(w))).toMatchObject({ status: 'ok', cursor: 199n, reminded: 0 });
    expect(await runMinute(deps(w))).toMatchObject({ status: 'ok', cursor: 200n, reminded: 1 });
  });
});

describe('sendReminders', () => {
  it('stays quiet once the keeper has poked the vault since its last check-in', async () => {
    await seedLate(VAULT_A, 110n);
    await seedLate(VAULT_B, 120n);
    await store.addWatch('a-owner', VAULT_A, 'owner', 1);
    await store.addWatch('b-owner', VAULT_B, 'owner', 2);
    await store.recordKeeper({
      ranAt: T0 - 10n,
      nowMs: 0,
      status: KEEPER_STATUS,
      entries: [{ vault: VAULT_A, action: 'poke', status: 'sent', hash: txHash(9), nextCheckAt: T0 }],
    });
    expect(await sendReminders(deps(w))).toEqual({ candidates: 1, claimed: 1, sent: 1 });
    expect(w.notifier.sent.map((m) => m.chatId)).toEqual(['b-owner']);
  });

  it('skips vaults that are not active, have expired, or that no owner watches', async () => {
    await seedLate(VAULT_A, 110n, { state: 'grace' });
    await seedLate(VAULT_B, 120n, { expiresAt: T0 - 1n, expired: true });
    await seedLate(VAULT_C, 130n);
    await store.addWatch('a', VAULT_A, 'owner', 1);
    await store.addWatch('b', VAULT_B, 'owner', 2);
    await store.addWatch('c', VAULT_C, 'heir', 3);
    expect(await sendReminders(deps(w))).toEqual({ candidates: 0, claimed: 0, sent: 0 });
    expect(w.notifier.sent).toEqual([]);
  });

  it('leaves reminders for a later run when the budget is short', async () => {
    await seedLate(VAULT_A, 110n);
    await store.addWatch('a-owner', VAULT_A, 'owner', 1);
    expect(await sendReminders(deps(w, { fetches: 45, queries: 5 }))).toEqual({ candidates: 0, claimed: 0, sent: 0 });
    expect(w.lines.some((l) => l.includes('"reminders.skipped"'))).toBe(true);
    expect(await sendReminders(deps(w))).toEqual({ candidates: 1, claimed: 1, sent: 1 });
    expect(await sendReminders(deps(w))).toEqual({ candidates: 0, claimed: 0, sent: 0 });
  });
});
```

Test "still catching up" dựa vào `FakeChain.scan`: `SCAN_MAX_BLOCKS` = 50 chia khoảng 100..200 thành ba lần chạy, và `truncated` là `true` ở hai lần đầu.

- [ ] **Step 2: Chạy test để thấy nó thất bại**

Run: `npm test -w apps/worker -- reminders`
Expected: FAIL, không resolve được `../../src/cron/reminders`.

- [ ] **Step 3: Viết migration**

`apps/worker/migrations/0002_reminders.sql`:

```sql
-- Owner reminders at 50, 80 and 100 % of the check-in period (Plan 5, Task 15).
-- `reminded` is the highest step already sent for the current last_alive; saving a view with a new last_alive resets it.
ALTER TABLE vaults ADD COLUMN reminded INTEGER NOT NULL DEFAULT 0;
```

`readD1Migrations` (Task 1, cấu hình vitest) và `nodeD1` (Task 10) đọc mọi file `.sql` trong `migrations/` theo thứ tự tên, nên test tự có cột mới. Danh sách bảng không đổi, nên `TABLES`, `resetDb` và `migrations.test.ts` giữ nguyên.

- [ ] **Step 4: Thêm kiểu và hai method của `Store`**

Thêm vào cuối `apps/worker/src/types.ts`:

```ts
/** A vault that may owe its owner a check-in reminder (Task 15). */
export interface ReminderCandidate {
  vault: Address;
  lastAlive: bigint;
  lateAt: bigint;
  /** Highest step already sent for this lastAlive: 0, 50, 80 or 100. */
  reminded: number;
}
```

Trong `apps/worker/src/store/store.ts`, thêm `ReminderCandidate,` vào khối `import type { … } from '../types';`, ngay sau dòng `KnownVault,`.

Trong `saveView` của `apps/worker/src/store/store.ts`, thay chuỗi SQL:

```ts
        'UPDATE vaults SET state = ?2, last_alive = ?3, late_at = ?4, window_ends_at = ?5, expires_at = ?6, recovery_target = ?7, next_check_at = ?8, refreshed_block = ?9 WHERE address = ?1',
```

bằng:

```ts
        'UPDATE vaults SET state = ?2, last_alive = ?3, late_at = ?4, window_ends_at = ?5, expires_at = ?6, recovery_target = ?7, next_check_at = ?8, refreshed_block = ?9, reminded = CASE WHEN last_alive = ?3 THEN reminded ELSE 0 END WHERE address = ?1',
```

Trong một lệnh `UPDATE` của SQLite, vế phải của mọi phép gán đọc giá trị **cũ** của dòng. Vì vậy `last_alive = ?3` trong `CASE` so sánh `last_alive` cũ với giá trị mới, dù phép gán `last_alive = ?3` đứng trước nó.

Thêm hai method ngay sau method `dueVaults` của `Store`:

```ts
  /**
   * Active, unexpired vaults that an owner watches and whose next reminder step is reached (Task 15).
   * A vault the keeper has poked since its last check-in is left out: the alarm notice follows anyway.
   */
  async reminderCandidates(now: bigint, limit: number): Promise<ReminderCandidate[]> {
    if (limit <= 0) return [];
    const { results } = await this.db
      .prepare(
        [
          'SELECT v.address, v.last_alive, v.late_at, v.reminded FROM vaults v',
          "WHERE v.state = 'active' AND v.late_at > v.last_alive AND v.reminded < 100",
          'AND (v.expires_at IS NULL OR v.expires_at > ?1)',
          'AND (CASE',
          'WHEN (?1 - v.last_alive) * 100 >= (v.late_at - v.last_alive) * 100 THEN 100',
          'WHEN (?1 - v.last_alive) * 100 >= (v.late_at - v.last_alive) * 80 THEN 80',
          'WHEN (?1 - v.last_alive) * 100 >= (v.late_at - v.last_alive) * 50 THEN 50',
          'ELSE 0 END) > v.reminded',
          "AND EXISTS (SELECT 1 FROM watch w WHERE w.vault = v.address AND w.role = 'owner')",
          "AND NOT EXISTS (SELECT 1 FROM keeper_log k WHERE k.vault = v.address AND k.action = 'poke' AND k.at >= v.last_alive)",
          'ORDER BY v.late_at, v.address LIMIT ?2',
        ].join(' '),
      )
      .bind(Number(now), limit)
      .all<{ address: string; last_alive: number; late_at: number; reminded: number }>();
    return results.map((r) => ({ vault: r.address as Address, lastAlive: BigInt(r.last_alive), lateAt: BigInt(r.late_at), reminded: r.reminded }));
  }

  /** Moves `reminded` from `from` to `step`. False when a new view or another run changed it first. */
  async claimReminder(vault: string, from: number, step: number): Promise<boolean> {
    const r = await this.db.prepare('UPDATE vaults SET reminded = ?3 WHERE address = ?1 AND reminded = ?2').bind(lower(vault), from, step).run();
    return r.meta.changes === 1;
  }
```

`CASE` trong SQL và `dueReminder` trong TypeScript tính cùng một mốc. SQL lọc để `LIMIT` không tốn chỗ cho vault chưa tới mốc; `dueReminder` là bản thuần, có test riêng, và quyết định cuối cùng.

- [ ] **Step 5: Viết `cron/reminders.ts`**

`apps/worker/src/cron/reminders.ts`:

```ts
import { COST } from '../budget';
import { nowSeconds } from '../clock';
import { formatTime, showAddress, vaultLink } from '../telegram/messages';
import type { CronDeps } from './minute';

export const REMINDER_STEPS = [50, 80, 100] as const;
export type ReminderStep = (typeof REMINDER_STEPS)[number];
/** Vaults read per run. Each one costs a claim query and one message per owner chat. */
export const MAX_REMINDERS = 10;

/** The highest step of the check-in period reached at `now` that was not sent yet (spec lõi §7: 50, 80, 100 %). */
export function dueReminder(lastAlive: bigint, lateAt: bigint, reminded: number, now: bigint): ReminderStep | null {
  const span = lateAt - lastAlive;
  if (span <= 0n || now <= lastAlive) return null;
  let due: ReminderStep | null = null;
  for (const step of REMINDER_STEPS) {
    if (step > reminded && (now - lastAlive) * 100n >= span * BigInt(step)) due = step;
  }
  return due;
}

const TEXT: Record<ReminderStep, (vault: string, deadline: string) => string> = {
  50: (v, at) => `Reminder: vault ${v} is halfway to its check-in deadline. Check in before ${at}.`,
  80: (v, at) => `Reminder: vault ${v} reaches its check-in deadline on ${at}. Check in soon.`,
  100: (v, at) => `Check-in deadline passed for vault ${v} at ${at}. Anyone can now raise the inheritance alarm. Check in now.`,
};

export function reminderText(step: ReminderStep, vault: string, lateAt: bigint, webUrl: string): string {
  return `${TEXT[step](showAddress(vault), formatTime(lateAt))}\n${vaultLink(webUrl, vault)}`;
}

export interface ReminderResult {
  candidates: number;
  claimed: number;
  sent: number;
}

/** Owner reminders (Task 15). Runs after the keeper on what is left of the budget; claims before it sends. */
export async function sendReminders(d: CronDeps): Promise<ReminderResult> {
  const { store, budget, log } = d;
  const out: ReminderResult = { candidates: 0, claimed: 0, sent: 0 };
  const base = { fetches: 0, queries: 2 + COST.reserve.queries };
  if (!budget.allows(base)) {
    log.info('reminders.skipped', { reason: 'budget', left: budget.left() });
    return out;
  }
  const now = nowSeconds(d.clock);
  const candidates = await store.reminderCandidates(now, Math.min(MAX_REMINDERS, budget.left().queries - base.queries));
  out.candidates = candidates.length;
  if (candidates.length === 0) return out;

  const owners = (await store.watchersOf(candidates.map((c) => c.vault))).filter((w) => w.role === 'owner');
  const blocked = new Set<string>();
  for (const c of candidates) {
    const step = dueReminder(c.lastAlive, c.lateAt, c.reminded, now);
    if (step === null) continue;
    const chats = [...new Set(owners.filter((w) => w.vault === c.vault).map((w) => w.chatId))];
    const need = { fetches: chats.length * COST.notice.fetches, queries: 1 + COST.reserve.queries };
    if (!budget.allows(need)) {
      log.warn('cron.budget', { phase: 'reminders', vault: c.vault, left: budget.left(), need });
      break;
    }
    if (!(await store.claimReminder(c.vault, c.reminded, step))) continue;
    out.claimed += 1;
    const text = reminderText(step, c.vault, c.lateAt, d.config.webUrl);
    for (const chatId of chats) {
      const sent = await d.notifier.send(chatId, text);
      if (sent.ok) out.sent += 1;
      if (sent.blocked) blocked.add(chatId);
    }
    log.info('reminder.sent', { vault: c.vault, step, chats: chats.length });
  }
  for (const chatId of blocked) {
    const removed = await store.removeWatches(chatId);
    log.info('telegram.blocked', { chatId, removed });
  }
  return out;
}
```

`reminders.ts` chỉ import **kiểu** `CronDeps` từ `minute.ts`, nên khi `minute.ts` import `sendReminders` thì không có vòng import lúc chạy.

- [ ] **Step 6: Gọi lời nhắc từ cron mỗi phút**

Sửa `apps/worker/src/cron/minute.ts` như sau.

(a) Thêm import ngay sau dòng `import { type AlertDeps, Alerts } from './alerts';`:

```ts
import { sendReminders } from './reminders';
```

(b) Trong `interface MinuteResult`, thêm ngay sau `notified: number;`:

```ts
  /** Owner reminders claimed in this run (Task 15). */
  reminded: number;
```

(c) Trong `interface SyncState`, thêm ngay sau `notified: number;`:

```ts
  /** True when this run read up to the chain head, so D1 has every check-in. */
  caughtUp: boolean;
```

(d) Trong `syncEvents`, thay:

```ts
  if (scan.toBlock < scan.fromBlock) return;
```

bằng:

```ts
  if (scan.toBlock < scan.fromBlock) {
    out.caughtUp = true;
    return;
  }
```

và thay dòng cuối của hàm:

```ts
  out.cursor = scan.toBlock;
}
```

bằng:

```ts
  out.cursor = scan.toBlock;
  out.caughtUp = !scan.truncated;
}
```

(e) Trong `runMinute`, thay:

```ts
  const sync: SyncState = { status: 'ok', cursor: null, claimed: 0, notified: 0 };
  let keeper: MinuteResult['keeper'] = null;
```

bằng:

```ts
  const sync: SyncState = { status: 'ok', cursor: null, claimed: 0, notified: 0, caughtUp: false };
  let keeper: MinuteResult['keeper'] = null;
  let reminded = 0;
```

thay:

```ts
      return { status: 'locked', cursor: null, claimed: 0, notified: 0, keeper: null };
```

bằng:

```ts
      return { status: 'locked', cursor: null, claimed: 0, notified: 0, keeper: null, reminded: 0 };
```

thêm ngay sau khối `try { keeper = await runKeeper(d, alerts); } catch (e) { … }`:

```ts
    // Only on a complete, current view of the chain: a stale last_alive would remind an owner who already checked in.
    if (sync.status === 'ok' && sync.caughtUp) {
      try {
        reminded = (await sendReminders(d)).claimed;
      } catch (e) {
        d.log.error('reminders.failed', errorFields(e));
      }
    }
```

trong dòng log `cron.minute`, thêm `reminded,` ngay sau `keeper,`; và thay dòng `return` cuối hàm:

```ts
  return { status: sync.status, cursor: sync.cursor, claimed: sync.claimed, notified: sync.notified, keeper };
```

bằng:

```ts
  return { status: sync.status, cursor: sync.cursor, claimed: sync.claimed, notified: sync.notified, keeper, reminded };
```

Mọi test cũ của `runMinute` dùng `toMatchObject` hoặc đọc từng trường, nên trường `reminded` mới không làm chúng hỏng.

- [ ] **Step 7: Chạy test**

Run: `npm test -w apps/worker -- reminders minute store`
Expected: mọi test PASS. `reminders` có 14 test: 9 của `dueReminder` (8 ca `it.each` và 1 test kỳ hạn rỗng), 2 của cron, 3 của `sendReminders`.

Run: `(cd contracts && forge build) && npm run test:devnet -w apps/worker`
Expected: mọi test devnet vẫn PASS. Ở nhịp 2 của E2E (Task 10), keeper `poke` trước khi lời nhắc chạy, nên vault bị loại khỏi lời nhắc, và chủ ví vẫn chỉ nhận đúng một tin.

- [ ] **Step 8: README, kiểm toàn bộ và commit**

Trong `apps/worker/README.md`, thay dòng:

```markdown
Anyone can watch any vault: a notice is not proof of a role. Each chat can watch up to 20 vaults.
```

bằng:

```markdown
Anyone can watch any vault: a notice is not proof of a role. Each chat can watch up to 20 vaults.

Chats that watch as `owner` also get a check-in reminder at 50 %, 80 % and 100 % of the check-in period, once each per check-in. There is no reminder once the keeper has raised the alarm: the alarm notice says the same thing, louder.
```

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker`
Expected: mọi test PASS; `tsc` và Biome sạch. Nếu Biome chỉ báo định dạng hay thứ tự import, chạy `npx biome check --write apps/worker` rồi kiểm lại.

```bash
git add apps/worker/migrations/0002_reminders.sql apps/worker/src/cron/reminders.ts apps/worker/src/types.ts apps/worker/src/store/store.ts apps/worker/src/cron/minute.ts apps/worker/README.md apps/worker/test/workers/reminders.test.ts
git commit -m "feat(worker): owner check-in reminders at 50, 80 and 100 percent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: `[USER]` Áp migration trước khi deploy**

Thứ tự này bắt buộc. Mã mới ghi cột `reminded`, nên deploy trước khi có cột thì `saveView` lỗi và cron hỏng. Ngược lại, mã cũ chạy bình thường trên bảng đã có cột mới.

```bash
cd apps/worker
npx wrangler d1 migrations apply atropyle --remote
npx wrangler deploy
```

Expected: lệnh đầu liệt kê `0002_reminders.sql` là migration mới và báo áp thành công; `/health` vẫn `ok` sau 2 phút.

---

### Task 16 (P1): Route đọc vault và OpenAPI

**Chỉ bắt đầu P1 khi P0 (Task 1–15, trừ các mục đã cắt) đã xong, CI xanh, và chưa quá 30/11** (Quyết định 26).

**Files:**
- Create: `apps/worker/src/routes/openapi.ts`, `apps/worker/src/routes/vaults.ts`
- Modify: `apps/worker/src/chain/port.ts`, `apps/worker/src/chain/sdk.ts` (thêm `vaultStatus`, `vaultsOf`)
- Modify: `apps/worker/test/workers/fakes.ts`, `apps/worker/test/workers/fixtures.ts` (`statusOf`)
- Modify: `apps/worker/src/app.ts`, `apps/worker/package.json` (zod), `package-lock.json`, `apps/worker/README.md`
- Test: `apps/worker/test/workers/vaults.test.ts`, `apps/worker/test/devnet/vaults.test.ts`

**Interfaces:**
- Consumes:
  - Plan 2: `vault(a).snapshot(): Promise<VaultSnapshot>`, `vaultsOf(account: string, o?: { limit?: number }): Promise<VaultRef[]>` (mặc định 100 vault mới nhất), kiểu `VaultStatus`, `VaultRef`, `toAddress`, `toJson`, `sameAddress`, `AtropyleError`.
  - Task 7: `problemFromError` (đã map `INVALID_ADDRESS` → 400, `NOT_VAULT` → 404, lỗi transport → 503).
  - Task 8: kiểu `Health`. Task 14: `/v1/badge/*` (nếu Task 14 bị cắt, xem Step 5).
- Produces:
  - `ChainPort.vaultStatus(vault: Address): Promise<VaultStatus>`: ném `NOT_VAULT` khi địa chỉ không phải vault do factory của deployment tạo.
  - `ChainPort.vaultsOf(account: Address): Promise<VaultRef[]>`.
  - `GET /v1/vaults/{address}` → `{ schemaVersion: 1, status: VaultStatusJson }`, `Cache-Control: public, max-age=15`.
  - `GET /v1/accounts/{address}/vaults` → `{ schemaVersion: 1, account: Address, vaults: VaultRefJson[] }`, cùng cache.
  - `GET /v1/openapi.json` → tài liệu OpenAPI 3.1, `Cache-Control: public, max-age=3600`.
  - `routes/openapi.ts`: các schema zod `ProblemSchema`, `HealthSchema`, `StatsResponseSchema`, `IntegrityResponseSchema`, `BadgeSchema`, `VaultStatusSchema`, `VaultResponseSchema`, `VaultRefSchema`, `AccountVaultsSchema`; kiểu `VaultStatusJson`, `VaultRefJson`; hàm `jsonSchema(s)`, `openApiDocument()`.

Quyết định riêng của task:
- `VaultStatusJson` bỏ `token.symbol` và `token.name`. Đó là chuỗi untrusted lấy từ chain (ràng buộc của plan), còn API chỉ trả dữ liệu có cấu trúc. Mỗi tài sản giữ `kind`, `token`, `id`, `heir`, `decimals`, `coverage`, `held`.
- Route đọc chain trực tiếp mỗi lần gọi, không qua D1, nên luôn là giá trị ở block mới nhất. Cache 15 s đủ chặn việc gọi dồn dập.
- `vaultsOf` của SDK không gọi `vaultsOf` của factory (không giới hạn độ dài, ai cũng làm phình được bằng Drill miễn phí). Nó đọc `vaultsOfLength`, rồi một trang `vaultsOfPage` gồm tối đa 100 vault mới nhất, rồi 5 giá trị cho mỗi vault và lọc theo vai trò hiện tại. Transport gom 20 lệnh JSON-RPC vào một request, nên kể cả tài khoản bị spam cũng chỉ tốn khoảng 27 subrequest, vẫn dưới trần 50 của gói Free.

- [ ] **Step 1: Cài zod**

Run: `npm install zod@4.6.7 -w apps/worker --save-exact`
Expected: `apps/worker/package.json` có `"zod": "4.6.7"` trong `dependencies`; `npm ls zod -w apps/worker` in `zod@4.6.7`. Nếu `npm install` báo `ERESOLVE`, dừng lại và báo người điều phối (Quyết định 3).

- [ ] **Step 2: Mở rộng `ChainPort`, bản thật và bản giả**

Trong `apps/worker/src/chain/port.ts`:
- đổi dòng import SDK thành:

```ts
import type { IntegrityReport, KeeperReport, ScanCursor, ScanResult, Stats, StatsCursor, VaultRef, VaultStatus } from '@atropyle/sdk';
```

- thêm vào cuối `interface ChainPort`, ngay sau `probe(...)`:

```ts
  /** P1 (Task 16): the public status of a factory vault at the latest block. Throws NOT_VAULT otherwise. */
  vaultStatus(vault: Address): Promise<VaultStatus>;
  /** P1 (Task 16): vaults where `account` is owner, heir or guardian right now. */
  vaultsOf(account: Address): Promise<VaultRef[]>;
```

Trong `apps/worker/src/chain/sdk.ts`:
- thêm `AtropyleError,` vào khối import của `@atropyle/sdk`, ngay trước `type AtropyleOptions,`;
- thêm vào object mà `createSdkChain` trả về, ngay sau `probe: …`:

```ts
    async vaultStatus(vault) {
      const snap = await atro.vault(vault).snapshot();
      if (!sameAddress(snap.binding.factory, deployment.factory)) throw new AtropyleError('NOT_VAULT');
      return snap.status;
    },
    vaultsOf: (account) => atro.vaultsOf(account),
```

Kiểm `binding.factory` như `isVault`, để API không trả trạng thái của một contract giả dạng vault.

Trong `apps/worker/test/workers/fixtures.ts`:
- thêm `import type { VaultStatus } from '@atropyle/sdk';` làm dòng import đầu tiên;
- thêm vào cuối file:

```ts
/** A Paid vault status at block 150, holding 10 USDT0. Token texts are hostile on purpose: the API must drop them. */
export function statusOf(vault: Address, over: Partial<VaultStatus> = {}): VaultStatus {
  const token = addr(0x55);
  return {
    vault,
    chainId: 196,
    blockNumber: 150n,
    blockTimestamp: T0 + 10n,
    state: 'active',
    stateCode: 0,
    pending: 'active',
    pendingCode: 0,
    idle: 10,
    lastAlive: T0,
    lateAt: T0 + 120n,
    alarmAt: null,
    windowEndsAt: null,
    releasedAt: null,
    expiresAt: null,
    expired: false,
    inhVotes: 0,
    inhVoters: [],
    recoveryTarget: null,
    recVotes: [],
    assets: [
      {
        index: 0,
        asset: { kind: 'erc20', token, id: 0n, heir: 0 },
        token: {
          address: token,
          symbol: { untrusted: true, value: 'EVIL<b>', truncated: false },
          name: { untrusted: true, value: 'EVIL token', truncated: false },
          decimals: 6,
        },
        coverage: 10_000_000n,
        held: 10_000_000n,
      },
    ],
    ...over,
  };
}
```

Trong `apps/worker/test/workers/fakes.ts`:
- thêm `type VaultRef,` và `type VaultStatus,` vào khối import của `@atropyle/sdk` (sau `type StatsCursor,`, giữ thứ tự chữ cái: `type VaultEvent,`, `type VaultRef,`, `type VaultStatus,`);
- trong `class FakeChain`, thêm hai field ngay sau `failViewFor = new Set<string>();`:

```ts
  statuses = new Map<string, VaultStatus>();
  accounts = new Map<string, VaultRef[]>();
```

- và thêm hai method ngay sau `probe()`:

```ts
  async vaultStatus(vault: Address): Promise<VaultStatus> {
    this.spend(4);
    this.calls.push(`vaultStatus:${lower(vault)}`);
    if (this.failViewFor.has(lower(vault))) throw new AtropyleError('RPC_UNAVAILABLE');
    const s = this.statuses.get(lower(vault));
    if (!s) throw new AtropyleError('NOT_VAULT');
    return s;
  }

  async vaultsOf(account: Address): Promise<VaultRef[]> {
    this.spend(2);
    this.calls.push(`vaultsOf:${lower(account)}`);
    return this.accounts.get(lower(account)) ?? [];
  }
```

Run: `npm run typecheck -w apps/worker`
Expected: thoát 0. Đây là kiểm tra trung gian: `FakeChain` và `createSdkChain` đều khớp `ChainPort` mới.

- [ ] **Step 3: Viết test route (thất bại)**

`apps/worker/test/workers/vaults.test.ts`:

```ts
import { env } from 'cloudflare:workers';
import { toJson } from '@atropyle/sdk';
import { getAddress } from 'viem';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { isoAt } from '../../src/clock';
import {
  AccountVaultsSchema,
  BadgeSchema,
  HealthSchema,
  IntegrityResponseSchema,
  openApiDocument,
  ProblemSchema,
  StatsResponseSchema,
  VaultResponseSchema,
} from '../../src/routes/openapi';
import type { Store } from '../../src/store/store';
import type { CronBeat, IntegrityReportJson } from '../../src/types';
import { deps, KEEPER, okIntegrity, testStore, type World, world } from './fakes';
import { HEIR, OWNER, statusOf, T0, VAULT_A, VAULT_B } from './fixtures';
import { resetDb } from './helpers';

const allow = { limit: async () => ({ success: true }) };

let w: World;
let store: Store;
const get = async (path: string) => createApp(() => deps(w)).request(path, {}, { ...env, RATE_LIMITER: allow });
const upper = (a: string) => a.toUpperCase().replace('0X', '0x');

beforeEach(async () => {
  await resetDb();
  w = world();
  store = testStore();
});

describe('GET /v1/vaults/{address}', () => {
  it('returns the live status with bigints as strings and without token texts', async () => {
    w.chain.statuses.set(VAULT_A, statusOf(VAULT_A, { state: 'grace', alarmAt: T0 + 5n }));
    const res = await get(`/v1/vaults/${upper(VAULT_A)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=15');
    const json = await res.json();
    const body = VaultResponseSchema.parse(json);
    expect(body.status).toMatchObject({ vault: getAddress(VAULT_A), state: 'grace', alarmAt: (T0 + 5n).toString(), blockNumber: '150', expiresAt: null });
    expect(body.status.assets).toEqual([
      { index: 0, kind: 'erc20', token: getAddress(`0x${'55'.padStart(40, '0')}`), id: '0', heir: 0, decimals: 6, coverage: '10000000', held: '10000000' },
    ]);
    expect(JSON.stringify(json)).not.toContain('EVIL');
    expect(w.chain.calls).toEqual([`vaultStatus:${VAULT_A}`]);
  });

  it.each([
    ['a malformed address', '/v1/vaults/0x1234', 400, 'INVALID_ADDRESS'],
    ['an address that is not a vault', `/v1/vaults/${VAULT_B}`, 404, 'NOT_VAULT'],
    ['an RPC failure', `/v1/vaults/${VAULT_A}`, 503, 'RPC_UNAVAILABLE'],
  ] as const)('answers %s with a problem', async (_name, path, status, code) => {
    w.chain.statuses.set(VAULT_A, statusOf(VAULT_A));
    w.chain.failViewFor.add(VAULT_A);
    const res = await get(path);
    expect(res.status).toBe(status);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    expect(ProblemSchema.parse(await res.json())).toMatchObject({ status, code });
  });
});

describe('GET /v1/accounts/{address}/vaults', () => {
  it('lists the vaults of an account with its roles, and an empty list for a stranger', async () => {
    w.chain.accounts.set(HEIR, [{ vault: getAddress(VAULT_A), owner: getAddress(OWNER), drill: true, state: 'active', roles: ['heir', 'guardian'] }]);
    const res = await get(`/v1/accounts/${upper(HEIR)}/vaults`);
    expect(res.status).toBe(200);
    expect(AccountVaultsSchema.parse(await res.json())).toEqual({
      schemaVersion: 1,
      account: getAddress(HEIR),
      vaults: [{ vault: getAddress(VAULT_A), owner: getAddress(OWNER), drill: true, state: 'active', roles: ['heir', 'guardian'] }],
    });
    expect(await (await get(`/v1/accounts/${VAULT_B}/vaults`)).json()).toEqual({ schemaVersion: 1, account: getAddress(VAULT_B), vaults: [] });
    expect((await get('/v1/accounts/nope/vaults')).status).toBe(400);
  });
});

describe('GET /v1/openapi.json', () => {
  it('documents every public route as OpenAPI 3.1', async () => {
    const res = await get('/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    const doc = (await res.json()) as { openapi: string; paths: Record<string, { get: { responses: Record<string, unknown> } }> };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/health',
      '/v1/accounts/{address}/vaults',
      '/v1/badge/integrity',
      '/v1/badge/vaults',
      '/v1/integrity',
      '/v1/openapi.json',
      '/v1/stats',
      '/v1/vaults/{address}',
    ]);
    for (const path of Object.values(doc.paths)) expect(path.get.responses['200']).toBeDefined();
    expect(JSON.stringify(doc)).not.toContain('$schema');
    expect(doc).toEqual(JSON.parse(JSON.stringify(openApiDocument())));
  });

  it('describes what the routes really return', async () => {
    const now = w.clock.nowMs();
    const beat: CronBeat = { at: isoAt(now - 30_000), cursor: '150', status: 'ok', keeper: { address: KEEPER, error: null } };
    await store.setMetas([['cron', beat], ['cron:ok', beat]], now - 30_000);
    await store.setMeta(
      'integrity',
      { checkedAt: isoAt(now - 60_000), blockNumber: '190', report: toJson(okIntegrity({ blockNumber: 190n })) as IntegrityReportJson },
      now - 60_000,
    );
    await store.commitCursor({
      cursor: 150n,
      counters: { aliveEvents: 1, alarms: 0, releases: 0, distributions: 0 },
      summary: {
        updatedAt: isoAt(now - 30_000),
        stats: { fromBlock: '100', toBlock: '150', vaults: { total: 1, drill: 1, paid: 0 }, owners: 1, checkIns: 0, alarms: 0, releases: 0, distributions: 0 },
      },
    });
    HealthSchema.parse(await (await get('/health')).json());
    StatsResponseSchema.parse(await (await get('/v1/stats')).json());
    IntegrityResponseSchema.parse(await (await get('/v1/integrity')).json());
    BadgeSchema.parse(await (await get('/v1/badge/vaults')).json());
    BadgeSchema.parse(await (await get('/v1/badge/integrity')).json());
  });
});
```

`setMetas(entries, nowMs)` là method của Task 2 mà `runMinute` dùng để ghi hai nhịp cùng lúc.

- [ ] **Step 4: Chạy test để thấy nó thất bại**

Run: `npm test -w apps/worker -- vaults`
Expected: FAIL, không resolve được `../../src/routes/openapi`.

- [ ] **Step 5: Viết schema và tài liệu OpenAPI**

`apps/worker/src/routes/openapi.ts`:

```ts
import type { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';

// Response schemas of the public API. Tests parse real responses with them, so the document cannot drift.
const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).meta({ description: 'A 0x address' });
const Uint = z.string().regex(/^\d+$/).meta({ description: 'An unsigned integer as a decimal string' });
const StateName = z.enum(['active', 'grace', 'recovery', 'releasedInherit', 'releasedRecover']);

export const ProblemSchema = z.object({
  type: z.string().meta({ description: 'Link to the error page in the docs' }),
  title: z.string(),
  status: z.number().int(),
  code: z.string().meta({ description: 'Stable error code' }),
  detail: z.string(),
});

export const HealthSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.enum(['ok', 'degraded']),
  rpcs: z.array(z.object({ url: z.string(), ok: z.boolean(), ms: z.number().nullable() })),
  lastCronAt: z.string().nullable(),
  lastCronAgeSec: z.number().int().nullable(),
  cursorLagBlocks: z.number().int().nullable(),
  integrity: z.enum(['pass', 'fail', 'unknown']),
  keeper: z.object({ address: Address.nullable(), balance: Uint.nullable(), dryRun: z.boolean() }),
});

export const StatsResponseSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.string(),
  stats: z.object({
    fromBlock: Uint,
    toBlock: Uint,
    vaults: z.object({ total: z.number().int(), drill: z.number().int(), paid: z.number().int() }),
    owners: z.number().int(),
    checkIns: z.number().int(),
    alarms: z.number().int(),
    releases: z.number().int(),
    distributions: z.number().int(),
  }),
});

export const IntegrityResponseSchema = z.object({
  schemaVersion: z.literal(1),
  checkedAt: z.string(),
  blockNumber: Uint,
  report: z.object({
    ok: z.boolean(),
    chainId: z.number().int(),
    blockNumber: Uint,
    blockTimestamp: Uint,
    rpcs: z.number().int(),
    checks: z.array(z.object({ name: z.string(), ok: z.boolean(), expected: z.string().optional(), actual: z.string().optional() })),
    warnings: z.array(z.object({ code: z.string(), message: z.string() })),
  }),
});

export const BadgeSchema = z.object({ schemaVersion: z.literal(1), label: z.string(), message: z.string(), color: z.string() });

export const VaultStatusSchema = z.object({
  vault: Address,
  chainId: z.number().int(),
  blockNumber: Uint,
  blockTimestamp: Uint,
  state: StateName,
  pending: StateName.meta({
    description: 'The state a poke() from anyone but the owner would produce at this block; equals state once released or after a Drill expired',
  }),
  lastAlive: Uint,
  lateAt: Uint,
  alarmAt: Uint.nullable(),
  windowEndsAt: Uint.nullable(),
  releasedAt: Uint.nullable(),
  expiresAt: Uint.nullable(),
  expired: z.boolean(),
  inhVotes: z.number().int(),
  inhVoters: z.array(Address),
  recoveryTarget: Address.nullable(),
  recVotes: z.array(z.object({ guardian: Address, target: Address.nullable() })),
  assets: z.array(
    z.object({
      index: z.number().int(),
      kind: z.enum(['erc20', 'erc721', 'erc1155']),
      token: Address,
      id: Uint,
      heir: z.number().int(),
      decimals: z.number().int().nullable(),
      coverage: Uint.meta({ description: 'What distribute() could move right now' }),
      held: Uint,
    }),
  ),
});
export type VaultStatusJson = z.infer<typeof VaultStatusSchema>;

export const VaultResponseSchema = z.object({ schemaVersion: z.literal(1), status: VaultStatusSchema });

export const VaultRefSchema = z.object({
  vault: Address,
  owner: Address,
  drill: z.boolean(),
  state: StateName,
  roles: z.array(z.enum(['owner', 'heir', 'guardian', 'recoveryTarget'])),
});
export type VaultRefJson = z.infer<typeof VaultRefSchema>;

export const AccountVaultsSchema = z.object({ schemaVersion: z.literal(1), account: Address, vaults: z.array(VaultRefSchema) });

/** JSON Schema 2020-12, the dialect of OpenAPI 3.1, without the `$schema` key. */
export function jsonSchema(s: z.ZodType): Record<string, unknown> {
  return Object.fromEntries(Object.entries(z.toJSONSchema(s) as Record<string, unknown>).filter(([k]) => k !== '$schema'));
}

const json = (schema: z.ZodType, description: string) => ({ description, content: { 'application/json': { schema: jsonSchema(schema) } } });
const problems = (...codes: string[]) =>
  Object.fromEntries(
    codes.map((status) => [status, { description: 'Problem details (RFC 9457)', content: { 'application/problem+json': { schema: jsonSchema(ProblemSchema) } } }]),
  );
const addressParam = { name: 'address', in: 'path', required: true, schema: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' } };
const get = (summary: string, responses: Record<string, unknown>, parameters?: unknown[]) => ({
  get: { summary, ...(parameters ? { parameters } : {}), responses },
});

export function openApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Atropyle Worker API',
      version: '1',
      description: 'Public, read-only data about Atropyle vaults on X Layer. No auth; 120 requests per minute per IP.',
      license: { name: 'MIT', identifier: 'MIT' },
    },
    paths: {
      '/health': get('Worker health', { '200': json(HealthSchema, 'Always 200; see `status`'), ...problems('429') }),
      '/v1/stats': get('Vault counts and activity', { '200': json(StatsResponseSchema, 'Latest stats'), ...problems('429', '503') }),
      '/v1/integrity': get('Latest integrity check', { '200': json(IntegrityResponseSchema, 'Latest report'), ...problems('429', '503') }),
      '/v1/badge/vaults': get('shields.io badge: vault count', { '200': json(BadgeSchema, 'Badge'), ...problems('429') }),
      '/v1/badge/integrity': get('shields.io badge: integrity', { '200': json(BadgeSchema, 'Badge'), ...problems('429') }),
      '/v1/vaults/{address}': get('Live status of one vault', { '200': json(VaultResponseSchema, 'Status'), ...problems('400', '404', '429', '503') }, [
        addressParam,
      ]),
      '/v1/accounts/{address}/vaults': get(
        'Vaults where an account is owner, heir or guardian',
        { '200': json(AccountVaultsSchema, 'Vaults'), ...problems('400', '429', '503') },
        [addressParam],
      ),
      '/v1/openapi.json': get('This document', { '200': { description: 'OpenAPI 3.1' }, ...problems('429') }),
    },
  };
}

let cached: Record<string, unknown> | null = null;

export function mountOpenApi(app: Hono<AppEnv>): void {
  app.get('/v1/openapi.json', (c) => {
    cached ??= openApiDocument();
    return c.json(cached, 200, { 'Cache-Control': 'public, max-age=3600' });
  });
}
```

Nếu Task 14 đã bị cắt: xoá hai dòng `/v1/badge/*` trong `paths`, hai dòng `BadgeSchema.parse(...)` và hai đường dẫn badge trong danh sách mong đợi của test.

Nếu `tsc` báo `c.json(cached, …)` không nhận `Record<string, unknown>`, khai báo kiểu `cached` là `JSONValue` (import kiểu từ `hono/utils/types`) và ép `openApiDocument() as JSONValue`.

- [ ] **Step 6: Viết route vault và gắn vào app**

`apps/worker/src/routes/vaults.ts`:

```ts
import { toAddress, toJson, type VaultStatus } from '@atropyle/sdk';
import type { Hono } from 'hono';
import type { Address } from 'viem';
import type { AppEnv } from '../app';
import type { VaultRefJson, VaultStatusJson } from './openapi';

const CACHE = { 'Cache-Control': 'public, max-age=15' };

const show = (a: Address | null): Address | null => (a === null ? null : toAddress(a));

/**
 * The API view of a status. Token symbol and name are untrusted chain strings, so they are left out.
 * Addresses are checksummed again, so the output does not depend on how the reader formatted them.
 */
export function vaultStatusJson(s: VaultStatus): VaultStatusJson {
  return toJson({
    vault: toAddress(s.vault),
    chainId: s.chainId,
    blockNumber: s.blockNumber,
    blockTimestamp: s.blockTimestamp,
    state: s.state,
    pending: s.pending,
    lastAlive: s.lastAlive,
    lateAt: s.lateAt,
    alarmAt: s.alarmAt,
    windowEndsAt: s.windowEndsAt,
    releasedAt: s.releasedAt,
    expiresAt: s.expiresAt,
    expired: s.expired,
    inhVotes: s.inhVotes,
    inhVoters: s.inhVoters.map((a) => toAddress(a)),
    recoveryTarget: show(s.recoveryTarget),
    recVotes: s.recVotes.map((v) => ({ guardian: toAddress(v.guardian), target: show(v.target) })),
    assets: s.assets.map((a) => ({
      index: a.index,
      kind: a.asset.kind,
      token: toAddress(a.asset.token),
      id: a.asset.id,
      heir: a.asset.heir,
      decimals: a.token.decimals,
      coverage: a.coverage,
      held: a.held,
    })),
  }) as VaultStatusJson;
}

export function mountVaults(app: Hono<AppEnv>): void {
  app.get('/v1/vaults/:address', async (c) => {
    const vault = toAddress(c.req.param('address'));
    const status = await c.var.rt.chain.vaultStatus(vault);
    return c.json({ schemaVersion: 1, status: vaultStatusJson(status) }, 200, CACHE);
  });

  app.get('/v1/accounts/:address/vaults', async (c) => {
    const account = toAddress(c.req.param('address'));
    const vaults = (await c.var.rt.chain.vaultsOf(account)).map(
      (v): VaultRefJson => ({ vault: toAddress(v.vault), owner: toAddress(v.owner), drill: v.drill, state: v.state, roles: v.roles }),
    );
    return c.json({ schemaVersion: 1, account, vaults }, 200, CACHE);
  });
}
```

`toAddress` ném `INVALID_ADDRESS`, còn `vaultStatus` ném `NOT_VAULT` hoặc lỗi transport. `onError` của Task 7 đổi chúng thành 400, 404 và 503, nên route không cần `try`.

Trong `apps/worker/src/app.ts`:
- thêm `import { mountOpenApi } from './routes/openapi';` ngay sau dòng import `./routes/health`, và `import { mountVaults } from './routes/vaults';` ngay sau dòng import `./routes/v1`;
- gọi `mountVaults(app);` và `mountOpenApi(app);` ngay trước `app.notFound(...)`.

Thêm vào bảng "Endpoints" của `apps/worker/README.md`, ngay sau dòng `POST /telegram/webhook`:

```markdown
| `GET /v1/vaults/{address}` | Live status of one vault, read from X Layer. Token names and symbols are left out on purpose. |
| `GET /v1/accounts/{address}/vaults` | Vaults where the account is owner, heir or guardian, with its roles. |
| `GET /v1/openapi.json` | OpenAPI 3.1 description of every route above. |
```

- [ ] **Step 7: Chạy test route**

Run: `npm test -w apps/worker -- vaults`
Expected: 7 test PASS (1 status, 3 ca problem, 1 account, 2 OpenAPI).

- [ ] **Step 8: Test adapter thật trên devnet**

`apps/worker/test/devnet/vaults.test.ts`:

```ts
import type { Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDrill, DEVNET_HEIR, DEVNET_OWNER } from '../../scripts/lib/devnet';
import { Budget } from '../../src/budget';
import { createSdkChain } from '../../src/chain/sdk';
import { devnet, revertChain, snapshotChain } from './helpers';

describe('vault reads for the P1 routes', () => {
  const { rpcUrl, deployment } = devnet();
  const chain = () => createSdkChain({ chain: deployment, budget: new Budget({ fetches: 1_000, queries: 10 }) });
  // Revert after each test: a leftover Drill would be indexed and poked by the keeper E2E in keeper.test.ts.
  let id: Hex;
  beforeEach(async () => {
    id = await snapshotChain(rpcUrl);
  });
  afterEach(async () => {
    await revertChain(rpcUrl, id);
  });

  it('reads a Drill status and finds it among the heir vaults', async () => {
    const vault = await createDrill(rpcUrl, deployment, 'p1-routes');
    const status = await chain().vaultStatus(vault);
    expect(status).toMatchObject({ vault, state: 'active', expired: false });
    expect(status.assets).toHaveLength(1);
    const mine = (await chain().vaultsOf(DEVNET_HEIR)).find((v) => v.vault === vault);
    expect(mine?.roles).toEqual(['heir']);
  });

  it('refuses an address that is not a vault', async () => {
    await expect(chain().vaultStatus(DEVNET_OWNER)).rejects.toMatchObject({ code: 'NOT_VAULT' });
  });
});
```

Run: `(cd contracts && forge build) && npm run test:devnet -w apps/worker -- vaults`
Expected: 2 test PASS.

Nếu test thứ hai nhận lỗi khác `NOT_VAULT` (ví dụ lỗi decode của viem khi gọi vào một EOA), đừng nới test. Ghi lại mã lỗi thật vào báo cáo cho người điều phối, vì đó là hành vi của `snapshot()` trong Plan 2.

- [ ] **Step 9: Kiểm toàn bộ và commit**

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker && npm run check:bundle -w apps/worker`
Expected: mọi test PASS; `tsc`, Biome sạch; `wrangler deploy --dry-run` build được bundle có zod.

```bash
git add apps/worker/src/routes/openapi.ts apps/worker/src/routes/vaults.ts apps/worker/src/chain/port.ts apps/worker/src/chain/sdk.ts apps/worker/src/app.ts apps/worker/test/workers/fakes.ts apps/worker/test/workers/fixtures.ts apps/worker/test/workers/vaults.test.ts apps/worker/test/devnet/vaults.test.ts apps/worker/package.json apps/worker/README.md package-lock.json
git commit -m "feat(worker): P1 vault routes and an OpenAPI 3.1 document from zod" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17 (P1): MCP từ xa ở `/mcp`

**Chỉ làm sau Task 16**, và khi Plan 3 đã có `@atropyle/mcp` build được (`npm run build -w packages/mcp`).

**Files:**
- Create: `apps/worker/src/routes/mcp.ts`
- Modify: `apps/worker/src/problem.ts` (thêm mã `FORBIDDEN`), `apps/worker/src/app.ts`, `apps/worker/wrangler.jsonc` (binding `MCP_RATE_LIMITER`), `apps/worker/package.json`, `package-lock.json`, `.github/workflows/ci.yml` (job `worker`), `apps/worker/README.md`
- Test: `apps/worker/test/workers/mcp.test.ts`

**Interfaces:**
- Consumes:
  - Plan 3: `createAtropyleMcpServer(o: AtropyleMcpOptions): McpServer`, với `AtropyleMcpOptions { sdk: AtropyleOptions; remote?: { latestIntegrity(): Promise<{ report: IntegrityReport; checkedAt: string } | null> } }`. Ở chế độ `remote`, server có 7 tool: không có `atropyle_verify`, có `atropyle_integrity` (Plan 3, Quyết định 9). `atropyle_integrity` trả `{ schemaVersion: 1, checkedAt, report, verifyCommand: 'npx -y atropyle verify', summary, warnings }`.
  - `@modelcontextprotocol/server` 2.4.0: `createMcpHandler(factory, options?): McpHttpHandler`, với `fetch(request: Request): Promise<Response>`. Factory được gọi lại cho mỗi request.
  - Task 3: `sdkOptions({ chain, budget })`. Task 7: `rateLimit('mcp')`, `problem`, `problemOf`, `API_ERRORS`. Task 2: `Store.getMeta`, kiểu `IntegrityRecord`, `IntegrityReportJson`.
- Produces:
  - `ALL /mcp`: Streamable HTTP của MCP, cả giao thức 2026-07-28 lẫn 2025 (mặc định `legacy: 'stateless'` của `createMcpHandler`).
  - `reviveIntegrity(r: IntegrityReportJson): IntegrityReport`, `latestIntegrity(store: Store): Promise<{ report: IntegrityReport; checkedAt: string } | null>`, `mountMcp(app)`.
  - Mã lỗi API mới `FORBIDDEN` (403). Gap G2 giờ có năm mã.

Quyết định riêng của task (thay cho Quyết định 23):
- Dùng `createMcpHandler` của chính `@modelcontextprotocol/server` 2.4.0, như Plan 3 dùng trong test và README. Không dùng `agents`.
  - Handler có `fetch(request)` chuẩn web, cắm thẳng vào một route Hono.
  - Bớt được một dependency lớn.
  - Server ở Worker chạy đúng đường mã mà test của Plan 3 đã kiểm.
  - Gói có điều kiện export `workerd` cho phần shim (đã xem bằng `npm view @modelcontextprotocol/server@2.4.0 exports`).
- Handler tạo mới cho mỗi request, vì factory cần `budget` của chính request đó. Không gọi `handler.close()` sau `fetch`: response SSE có thể còn đang stream.
- `createMcpHandler` không tự kiểm `Origin` (type definitions ghi rõ "the entry itself is deliberately validation-free"). Spec MCP yêu cầu server kiểm `Origin` để chống DNS rebinding. Route chấp nhận request không có `Origin` (client không phải trình duyệt), hoặc có `Origin` đúng bằng origin của `WEB_URL`. Mọi origin khác bị trả 403 `FORBIDDEN`.
- Không bật CORS cho `/mcp`: không trang web nào ngoài web app cần gọi nó.
- Giới hạn 20 lượt/phút/IP qua `MCP_RATE_LIMITER` (namespace `1202`), rơi về `FALLBACK_MCP` khi không có binding.

- [ ] **Step 1: Cài dependency**

Run: `npm install "@atropyle/mcp@*" @modelcontextprotocol/server@2.4.0 -w apps/worker --save-exact && npm install @modelcontextprotocol/client@2.4.0 -w apps/worker --save-dev --save-exact`
Expected: `apps/worker/package.json` có `"@atropyle/mcp": "*"` và `"@modelcontextprotocol/server": "2.4.0"` trong `dependencies`, `"@modelcontextprotocol/client": "2.4.0"` trong `devDependencies`. `npm ls @atropyle/mcp -w apps/worker` trỏ vào workspace `packages/mcp` (`-> ./packages/mcp`), không tải từ registry.

Nếu npm ghi `"@atropyle/mcp": "^0.1.0"` thay cho `*`, sửa tay lại thành `"*"` rồi chạy `npm install`, giống `@atropyle/sdk` ở Task 1. Nếu gặp `ERESOLVE`, dừng lại và báo người điều phối (Quyết định 3).

Run: `npm run build -w circuits && npm run build -w packages/sdk && npm run build -w packages/mcp`
Expected: thoát 0; có `packages/mcp/dist/index.js`.

- [ ] **Step 2: Thêm mã `FORBIDDEN` và binding**

Trong `apps/worker/src/problem.ts`, thêm vào `API_ERRORS`, ngay sau dòng `UNAUTHORIZED`:

```ts
  FORBIDDEN: { title: 'Not allowed from this origin.', status: 403 },
```

Trong `apps/worker/wrangler.jsonc`, thay dòng `"ratelimits"` bằng:

```jsonc
  "ratelimits": [
    { "name": "RATE_LIMITER", "namespace_id": "1201", "simple": { "limit": 120, "period": 60 } },
    { "name": "MCP_RATE_LIMITER", "namespace_id": "1202", "simple": { "limit": 20, "period": 60 } }
  ],
```

Nếu Task 12 đã phải xoá khối `ratelimits` (gói không có Rate Limiting), bỏ qua phần `wrangler.jsonc`. `/mcp` khi đó dùng `FALLBACK_MCP`.

- [ ] **Step 3: Viết test (thất bại)**

`apps/worker/test/workers/mcp.test.ts`:

```ts
import { env } from 'cloudflare:workers';
import { toJson } from '@atropyle/sdk';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { isoAt } from '../../src/clock';
import type { Store } from '../../src/store/store';
import type { IntegrityReportJson } from '../../src/types';
import { deps, okIntegrity, testStore, type World, world } from './fakes';
import { resetDb } from './helpers';

const allow = { limit: async () => ({ success: true }) };
const deny = { limit: async () => ({ success: false }) };

let w: World;
let store: Store;
let client: Client | undefined;

/** The Worker as a fetch function, optionally as seen from a browser page at `origin`. */
function workerFetch(mcpLimiter = allow, origin?: string) {
  const app = createApp(() => deps(w));
  return (url: string | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    if (origin) headers.set('Origin', origin);
    return app.request(String(url), { ...init, headers }, { ...env, RATE_LIMITER: allow, MCP_RATE_LIMITER: mcpLimiter });
  };
}

async function connect(origin?: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL('http://worker.test/mcp'), { fetch: workerFetch(allow, origin) });
  const c = new Client({ name: 'atropyle-worker-test', version: '1.0.0' }, { versionNegotiation: { mode: { pin: '2026-07-28' } } });
  await c.connect(transport);
  return c;
}

beforeEach(async () => {
  await resetDb();
  w = world();
  store = testStore();
});

afterEach(async () => {
  await client?.close();
  client = undefined;
});

describe('/mcp', () => {
  it('serves the remote tool set: atropyle_integrity instead of atropyle_verify', async () => {
    client = await connect();
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toHaveLength(7);
    expect(names).toContain('atropyle_integrity');
    expect(names).not.toContain('atropyle_verify');
  });

  it('atropyle_integrity returns the cron report from D1, or says there is none yet', async () => {
    client = await connect();
    const empty = await client.callTool({ name: 'atropyle_integrity', arguments: {} });
    expect(empty.structuredContent).toMatchObject({ schemaVersion: 1, checkedAt: null, report: null, verifyCommand: 'npx -y atropyle verify' });

    const now = w.clock.nowMs();
    const report = toJson(okIntegrity({ blockNumber: 190n })) as IntegrityReportJson;
    await store.setMeta('integrity', { checkedAt: isoAt(now - 60_000), blockNumber: '190', report }, now - 60_000);
    const r = await client.callTool({ name: 'atropyle_integrity', arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({
      schemaVersion: 1,
      checkedAt: isoAt(now - 60_000),
      verifyCommand: 'npx -y atropyle verify',
      report: { ok: true, blockNumber: '190' },
    });
  });

  it('accepts the web app origin and refuses any other browser origin', async () => {
    client = await connect('https://web.test');
    expect((await client.listTools()).tools).toHaveLength(7);

    const res = await workerFetch(allow, 'https://evil.test')('http://worker.test/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('Content-Type')).toBe('application/problem+json');
    expect(await res.json()).toMatchObject({ status: 403, code: 'FORBIDDEN' });
  });

  it('is limited to 20 requests per minute per IP', async () => {
    const res = await workerFetch(deny)('http://worker.test/mcp', { method: 'POST', body: '{}' });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(await res.json()).toMatchObject({ code: 'RATE_LIMITED', detail: 'The limit is 20 requests per minute per IP. Try again in a minute.' });
  });
});
```

`world()` đặt `WEB_URL` = `https://web.test/`, nên origin hợp lệ là `https://web.test`.

- [ ] **Step 4: Chạy test để thấy nó thất bại**

Run: `npm test -w apps/worker -- mcp`
Expected: 4 FAIL. Ba test đầu lỗi khi client kết nối hoặc gọi tool, vì `/mcp` chưa có route nên app trả 404 problem+json. Test cuối nhận 404 thay vì 429, vì `rateLimit('mcp')` chưa được gắn vào `/mcp`.

- [ ] **Step 5: Viết route**

`apps/worker/src/routes/mcp.ts`:

```ts
import { createAtropyleMcpServer } from '@atropyle/mcp';
import type { IntegrityReport } from '@atropyle/sdk';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Hono } from 'hono';
import type { AppEnv } from '../app';
import { sdkOptions } from '../chain/sdk';
import { problem, problemOf } from '../problem';
import type { Store } from '../store/store';
import type { IntegrityRecord, IntegrityReportJson } from '../types';

/** The record in D1 holds toJson(report); the MCP tool wants the SDK type back, with bigints. */
export function reviveIntegrity(r: IntegrityReportJson): IntegrityReport {
  return { ...r, blockNumber: BigInt(r.blockNumber), blockTimestamp: BigInt(r.blockTimestamp) } as IntegrityReport;
}

export async function latestIntegrity(store: Store): Promise<{ report: IntegrityReport; checkedAt: string } | null> {
  const row = await store.getMeta<IntegrityRecord>('integrity');
  return row ? { checkedAt: row.value.checkedAt, report: reviveIntegrity(row.value.report) } : null;
}

/**
 * Remote MCP (spec §9.2): the same factory as the stdio server, in remote mode, so there is no atropyle_verify.
 * createMcpHandler does no Origin check, and the MCP spec asks servers to check it against DNS rebinding:
 * requests without Origin (non-browser clients) and from the web app pass; other browser origins get 403.
 * The 20-per-minute limit is applied in createApp, next to the other limits.
 */
export function mountMcp(app: Hono<AppEnv>): void {
  app.use('/mcp', async (c, next) => {
    const origin = c.req.header('origin');
    if (origin !== undefined && origin !== new URL(c.var.rt.config.webUrl).origin) {
      return problem(problemOf('FORBIDDEN', 'Browser pages cannot call /mcp, except the Atropyle web app.'));
    }
    await next();
  });
  app.all('/mcp', (c) => {
    const { budget, config, store } = c.var.rt;
    // A new handler per request: the factory needs this request's budget, and one handler must not outlive it.
    const handler = createMcpHandler(() =>
      createAtropyleMcpServer({ sdk: sdkOptions({ chain: config.chain, budget }), remote: { latestIntegrity: () => latestIntegrity(store) } }),
    );
    return handler.fetch(c.req.raw);
  });
}
```

`routes/mcp.ts` chỉ import **kiểu** `AppEnv` từ `app.ts`, như các route khác, nên không có vòng import lúc chạy.

Trong `apps/worker/src/app.ts`:
- thêm `import { mountMcp } from './routes/mcp';` ngay sau dòng import `./routes/keeper` (hoặc ngay sau `./routes/health` nếu không có Task 13);
- thêm `app.use('/mcp', rateLimit('mcp'));` ngay sau dòng `app.use('/v1/*', rateLimit('api'));`;
- gọi `mountMcp(app);` ngay trước `app.notFound(...)`.

Giới hạn chạy trước kiểm `Origin`, nên một trang lạ gửi dồn dập cũng chỉ tốn tối đa 20 lượt mỗi phút.

`/mcp` không nằm dưới `/v1/*`, nên không nhận CORS và không dùng chung giới hạn 120 lượt/phút của API.

- [ ] **Step 6: Chạy test**

Run: `npm test -w apps/worker -- mcp`
Expected: 4 test PASS.

Nếu client báo lỗi phiên bản giao thức, kiểm lại rằng `createMcpHandler` được import từ `@modelcontextprotocol/server` (không phải `agents`), và client ghim `2026-07-28` như test của Plan 3.

- [ ] **Step 7: CI, README, kiểm toàn bộ và commit**

Trong `.github/workflows/ci.yml`, ở job `worker`, thêm ngay sau bước `- run: npm run build -w packages/sdk` **của job đó**:

```yaml
      - run: npm run build -w packages/mcp
```

Thêm vào bảng "Endpoints" của `apps/worker/README.md`, ngay sau dòng `GET /v1/openapi.json`:

```markdown
| `POST /mcp` | Remote MCP server (Streamable HTTP). Same tools as `npx -y @atropyle/mcp`, except that `atropyle_verify` is replaced by `atropyle_integrity`: run `npx -y atropyle verify` to check the deployment yourself. 20 requests per minute per IP; browser pages other than the web app are refused. |
```

Run: `npm test -w apps/worker && npm run typecheck -w apps/worker && npx biome check apps/worker && npm run check:bundle -w apps/worker`
Expected: mọi test PASS; `tsc`, Biome sạch; `wrangler deploy --dry-run` build được bundle có MCP. Trang limits của Workers ghi kích thước Worker tối đa 64 MiB chưa nén ở cả hai gói, và "There is no compressed size limit", nên bundle lớn hơn không phải vấn đề.

```bash
git add apps/worker/src/routes/mcp.ts apps/worker/src/problem.ts apps/worker/src/app.ts apps/worker/wrangler.jsonc apps/worker/package.json apps/worker/README.md apps/worker/test/workers/mcp.test.ts .github/workflows/ci.yml package-lock.json
git commit -m "feat(worker): remote MCP at /mcp with the cron's integrity report" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 8: `[USER]` Deploy và thử từ một client MCP**

```bash
cd apps/worker
npx wrangler deploy
claude mcp add --transport http atropyle-remote https://atropyle-worker.<account>.workers.dev/mcp
```

Rồi mở Claude Code, gõ `/mcp` và xem server `atropyle-remote`.

Expected: server kết nối được, có 7 tool, trong đó có `atropyle_integrity` và không có `atropyle_verify`. Client chạy trên máy người dùng không gửi `Origin`, nên không bị chặn. Gỡ server thử bằng `claude mcp remove atropyle-remote`.
