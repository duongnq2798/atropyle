# Atropyle Plan 8 — Backend: Supabase, Resend email and the keeper — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/backend` (`@atropyle/backend`, private): eight Supabase Edge Functions (`subscribe`, `confirm`, `unsubscribe`, `me`, `stats`, `health`, `tick`, `integrity`), the Postgres schema and the cron schedule in `supabase/migrations/`, twelve bilingual email templates rendered with React Email at build time and sent through Resend, and the keeper that pokes and distributes vaults on X Layer.

**Architecture:**
- Every function is a pure Web API handler `(Request, Deps) => Promise<Response>`. `Deps` carries five ports: `Sql` (database), `ChainPort` (the SDK), `Mailer` (Resend), `Clock` and `Log`. Unit tests run the handlers in Node against PGlite, a fake chain and a capturing mailer. Production wires the same handlers to postgres.js, the SDK on X Layer and Resend inside `Deno.serve`.
- `tick` runs once a minute from `pg_cron` through `pg_net`, under a 50 s budget and a lease. It runs three phases. The indexer scans logs from a cursor in steps that each commit atomically. Notices are made idempotent by a `deliveries` claim row. The keeper is the SDK's `keeperTick`, capped at 20 transactions.
- Email templates are React Email components rendered once at build time (`npm run emails`) into a committed module of HTML and text strings with `{{placeholders}}`. At run time the code only fills them in, with HTML escaping, so neither React nor Prettier ships in a function bundle.
- esbuild bundles each function into `supabase/functions/<name>/index.js`, with `@atropyle/sdk` and viem inlined and `postgres` mapped to `npm:postgres@3.4.9`. `supabase/config.toml` points each function at its file and turns JWT verification off. Deploys go through `supabase functions deploy --use-api`, which needs no Docker.

**Tech Stack:** TypeScript 5.9.3, Node 24, Vitest 3.2.7, Biome 2.6.8, `@atropyle/sdk` 0.1.0 (workspace), viem 2.58.0, postgres (postgres.js) 3.4.9, @electric-sql/pglite 0.5.17, @react-email/components 1.0.12, react and react-dom 19.3.1, @types/react 19.3.0, esbuild 0.28.2, tsx 4.20.6, Supabase CLI 3.2.0 (run by the maintainer through `npx`), Foundry v1.9.0 (anvil for the e2e).

**Spec:** `docs/superpowers/specs/2026-11-22-atropyle-web-v2-design.md` (Vietnamese): §9 (all of it; §9.6 is the API contract with Plan 7 and must not change), §10 (Supabase part), §11 (the Backend and Email rows), §12 (Backend), §15 (the maintainer's steps), §16 rulings 2, 9, 10 and 13. Intent and keeper limits come from `docs/superpowers/specs/2026-11-18-atropyle-ecosystem-design.md` §9 (§9.4 keeper). This plan replaces Plan 5 (`docs/superpowers/plans/2026-11-18-atropyle-worker.md`), whose Worker part is dropped (spec §14, ruling 13).

## Global Constraints

- Node.js 24, npm workspaces (`apps/*`, `packages/*`), Biome 2.6.8 (`npx biome ci .`), TypeScript 5.9.3 strict, Vitest 3.2.7. Every dependency is pinned to an exact version (no `^`), like the rest of the repo.
- Zero keys. There is no private key, seed phrase or `PRIVATE_KEY` anywhere, and users sign in their own wallet. **The single exception is the backend keeper:** `apps/backend/src/keeper/signer.ts` is the only file that reads `KEEPER_KEY` or calls `privateKeyToAccount`. A unit test enforces this. `KEEPER_KEY` is a Supabase secret that only the maintainer sets. Tests never use a key: on anvil the keeper sends from an unlocked account with `eth_sendTransaction`.
- Never broadcast to X Layer mainnet from code an agent runs. Integration and e2e tests use a local anvil devnet (chain 31337) through `scripts/lib/anvil.ts`. Agents never run `supabase db push`, `supabase functions deploy` or `supabase secrets set`; those are the maintainer's steps in `apps/backend/README.md`.
- No CI workflow deploys or signs. The new `backend` CI job is read-only and keyless.
- Tokens and keys for Supabase, Resend (`RESEND_API_KEY`), `CRON_SECRET`, `TOKEN_SECRET` and `KEEPER_KEY` belong to the maintainer. Do not set them and do not ask for them.
- No telemetry, trackers, analytics, CDN downloads, or third-party fonts and scripts at build or run time. Emails load no images and no web fonts. Their font stacks fall back to system fonts: Fraunces → Georgia, Inter → the system sans, JetBrains Mono → `ui-monospace`.
- Code, comments, commit messages and user-facing copy are in English. Emails also ship Vietnamese copy (`lang: 'vi'`).
- JSON: `bigint` as decimal strings, addresses checksummed (EIP-55), times as ISO 8601 UTC strings.
- Text read from the chain (token names, revert reasons) is untrusted. Emails never show token names or symbols: they print token addresses and amounts only. Values inserted into HTML are always escaped, and no email links anywhere but `SITE_URL`.
- §9.6 of the spec is the contract with the web (Plan 7). Endpoints, request and response shapes, problem codes and email link formats are copied from it verbatim. Do not change them.
- Stage files by path in every commit (never `git add -A` or `git add .`). Commit messages end with a second `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- Never touch `prompts/`, `reports/`, `research_notes/`, `external_research/`.
- Every task ends green on: its own tests, `npm run typecheck`, `npx biome ci .`. Run `npx biome check --write apps/backend` first to apply Biome's formatting to new files.
- Tests import `@atropyle/sdk` from its built `dist`. If `packages/sdk/dist` is missing, run `npm run build` (circuits, then the SDK) once before the backend tests.
- Windows lockfile trap: npm on Windows drops the `@emnapi/core` and `@emnapi/runtime` entries from `package-lock.json`, and then `npm ci` fails on Linux CI. Task 1 is the only task that runs `npm install`, and it includes the check-and-restore step.

## Verified facts and rulings

Verified read-only on 22 Nov 2026, with `npm view`, `npm pack` into the scratchpad, `gh api` on `supabase/cli` at tag `v3.2.0`, and the official docs.

1. **Versions.**
   - From the brief: @electric-sql/pglite 0.5.17, @react-email/components 1.0.12, react and react-dom 19.3.1, Supabase CLI 3.2.0.
   - Newest that is at least 7 days old: postgres **3.4.9** (2026-04-05), esbuild **0.28.2** (2026-08-08), @types/react **19.3.0** (2026-09-09).
   - postgres 4.1.1 exists but is 11 days old, and Supabase's own Edge Function examples use `npm:postgres@^3`.
   - `@electric-sql/pglite-socket` 0.2.20 was rejected: it is 3 days old and brings peer packages we do not need.
2. **Pre-bundled functions** (Supabase CLI source `apps/cli/src/shared/functions/deploy.ts` and `deploy.command.ts` at v3.2.0, docs "Function configuration").
   - `config.toml` accepts `[functions.<name>]` with `verify_jwt` and `entrypoint`, which can be any `.ts`, `.js`, `.mjs`, `.tsx` or `.jsx` file (CLI ≥ 1.215.0).
   - `supabase functions deploy --use-api` bundles on Supabase's side without Docker. Without Docker running, the CLI prints "WARNING: Docker is not running" and uses the API anyway.
   - **Ruling 1:** bundles are `supabase/functions/<name>/index.js`, not `index.ts` as spec §9.2 says. A minified JS file is not guaranteed to parse as TypeScript, and `entrypoint` makes the file name free. They are build output and gitignored.
3. **Edge Function limits** (docs "Limits").
   - Wall clock 150 s on the free plan and 400 s on paid; request idle timeout 150 s.
   - CPU time 2 s per request, async I/O excluded; memory 256 MB.
   - Bundle ≤ 20 MB when bundled locally or ≤ 5 MB when bundled server-side; this plan caps each bundle at 4 MB. Outgoing ports 25 and 587 are blocked.
   - The 50 s `tick` budget fits the wall clock. The 2 s CPU limit is an open risk (see the end of this plan).
4. **Secrets** (docs "Environment variables").
   - Default secrets: `SUPABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_SERVICE_ROLE_KEY` and others.
   - Custom names cannot start with `SUPABASE_`. They are set with `supabase secrets set NAME=value`, and functions read new values without a redeploy.
5. **Database driver.**
   - Supabase's drizzle and postgres-on-the-edge examples connect with `postgres(Deno.env.get('SUPABASE_DB_URL'), { prepare: false })`, because the transaction pooler does not support prepared statements.
   - **Ruling 2:** postgres.js 3.4.9 through a tiny `Sql` interface, not supabase-js with the service role. The indexer needs real transactions and `insert … on conflict … where`, which PostgREST cannot express in one request.
   - The bundle imports it as `npm:postgres@3.4.9`. Deno resolves `npm:` specifiers natively.
6. **PGlite 0.5.17** (package contents).
   - `PGlite.create({ extensions: { citext } })` with `citext` from `@electric-sql/pglite/contrib/citext`. plpgsql is built in.
   - pg_cron, pg_net and Supabase Vault do not exist in PGlite. **Ruling 3:** the schedule lives in its own migration, which starts with the marker line `-- atropyle:supabase-only` and which the PGlite helper skips.
   - int8 parses to `number` or `bigint`. **Convention:** every query selects bigints as `::text`, counts as `::int`, and timestamps as `timestamptz`, which both drivers return as `Date`.
7. **pg_net and Vault** (docs "pg_net", "Scheduling Edge Functions").
   - `net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds int) returns bigint`. It is asynchronous, and responses are kept 6 h in `net._http_response`.
   - The schedule reads the functions URL and the cron secret from `vault.decrypted_secrets`, as in Supabase's example.
8. **Resend** (API reference).
   - `POST https://api.resend.com/emails`, authenticated with `Authorization: Bearer`.
   - Body fields: `from`, `to` (array), `subject`, `html`, `text`, `headers`, `tags` (`name`/`value`, ASCII letters, digits, `_` and `-`).
   - Header `Idempotency-Key` (≤ 256 characters, kept 24 h). The response is `{ id }`. A rate limit answers 429 with `retry-after`.
   - **Ruling 4:** plain `fetch` instead of the `resend` SDK. That is one less dependency in the bundle and gives full control of 429 and idempotency. Sends are spaced 550 ms apart, below even the older 2 req/s default.
9. **React Email 1.0.12.**
   - It re-exports `render` from `@react-email/render` 2.0.6 (`render(node, { pretty, plainText }) → Promise<string>`), plus `Html`, `Head`, `Preview`, `Body`, `Container`, `Section`, `Row`, `Column`, `Text`, `Heading`, `Button` and `Link`. Peer dependency: react ^18 || ^19.
   - **Ruling 5:** templates are rendered at build time into the committed `src/email/templates.gen.ts`, and a unit test fails when that file is stale. The text version is hand-built, because `html-to-text` uppercases headings.
10. **SDK.**
    - `quorumTransport` (`@atropyle/sdk/verify`) refuses `eth_getLogs`.
    - **Ruling 6:** the indexer calls `atro.scan()` over the default read transport, which already keeps JSON-RPC batches at `MAX_BATCH = 3` and ranges at `deployment.logsBlockRange` (100 on X Layer). Spec §9.3 asks for the consensus transport. Only `integrity` uses the quorum.
    - Keeper defaults are taken unchanged from `keeperTick`: `maxTx` 20, `maxGas` 4,000,000, `minBalance` 0.005 OKB.
    - The SDK and circuits `dist` files contain no `process.` and no `node:` import, so esbuild's `platform: 'browser'` bundles them for Deno.
11. **Ruling 7:** a `TOKEN_SECRET` secret is added beyond spec §15. The unsubscribe token is `base64url(HMAC-SHA256(TOKEN_SECRET, "unsub:" + id))`, so every email can carry it while the database stores only its SHA-256. Rate-limit keys are HMACs too, so IPs and emails are never stored in clear.
12. **Ruling 8:** two additions to the spec §9.1 schema.
    - A `meta` table (key → jsonb) holds the tick lease, the indexer and keeper status for `/health`, and the ops-alert state.
    - Extra columns: `vaults.last_alive`, `last_alive_block`, `late_at`, `window_ends_at`, `recovery_target`, `expired`, `assets`, `updated_at`; `vault_events.notified_at`; `deliveries.claimed_at`; `keeper_log.error`, `chain_at`.
13. **Ruling 9:**
    - Vietnamese emails print deadlines in UTC plus Vietnam time (UTC+7). The backend never knows a subscriber's own time zone.
    - Event emails are sent only for events at most 24 h old in chain time, so a first deploy or a long outage does not mail a backlog.
    - Reminders and the Drill summary wait until the indexer has caught up.
14. **Ruling 10:** the thread motif in emails is built from table cells (`Row`/`Column`), with no images. The palette is the light set of spec §4.3, with the dark set applied through `@media (prefers-color-scheme: dark)`.
15. **Supabase CLI 3.2.0 commands** (source of `functions deploy`, `secrets set` and the telemetry layer at tag `v3.2.0`).
    - `functions deploy` with no name deploys every function found in `supabase/functions/` plus every function declared in `config.toml`.
    - `secrets set --env-file <file>` and `secrets unset <NAME>` exist.
    - `DO_NOT_TRACK=1` or `SUPABASE_TELEMETRY_DISABLED=1` stops the CLI from sending its usage events. The README sets it for the maintainer's commands.
16. **Ruling 11:** no CI workflow deploys the backend, although spec §10 allows a workflow with a `SUPABASE_ACCESS_TOKEN` secret. The brief forbids CI deploys, and a unit test (Task 13) keeps every workflow free of Supabase deploy commands and backend secrets.
17. **Ruling 12:** three choices that spec §9.3 leaves open.
    - `released` also goes to guardians. A recovery release also goes to the owner, and its `distributed` email too, since the owner's new wallet is the one paid. The spec names only the heir, but guardians and a recovering owner act on the same event.
    - The indexer stores each touched vault's view as read at the latest block, not at the event's block. That is one snapshot per vault per step, and reminders and the keeper need the current state anyway.
    - Without `KEEPER_KEY`, the keeper runs dry and rechecks a due vault after the SDK's `RETRY_AFTER` (300 s), not every minute.

## Review Focus

- **Same email, different case or spaces.** ` Alice@Example.COM ` and `alice@example.com` for the same vault and role must be one subscription and one stream of alerts, with no duplicates. The test is in Task 6.
- **Resend failure or 429 in the middle of a tick.** The claim is released, the event stays unnotified, and the next tick sends exactly once. The tests are in Task 6 (`deliver`) and Task 8 (`runNotices`).
- **RPC failure in the middle of indexing.** The cursor stays at the last committed step, and the rerun creates no duplicate events and no duplicate emails. The tests are in Task 7.
- **Overlapping ticks**, when `pg_cron` fires while the previous tick still runs. The second run returns `locked` and touches neither the chain nor the keeper. The test is in Task 9.
- **Check-in after the 80% reminder.** The new `last_alive_block` starts a new cycle, and its 50%, 80% and due reminders fire again. The test is in Task 8.

---

## File Structure

```
apps/backend/
  package.json                 @atropyle/backend (private), scripts and pinned dependencies
  tsconfig.json                extends the base; jsx react-jsx; types node
  vitest.config.ts             unit tests (test/unit)
  vitest.e2e.config.ts         e2e on anvil (test/e2e)
  build.ts                     CLI: bundles every function (calls scripts/build-functions.ts)
  README.md                    what it is, local commands, the maintainer's deploy steps
  emails/                      build-time only (never bundled)
    Email.tsx                  the email layout (React Email)
    Thread.tsx                 the thread motif as table cells
    text.ts                    the plain-text template
    render.tsx                 renderAll() and moduleSource()
    samples.ts                 sample inputs for snapshots and the preview
  scripts/
    emails.ts                  writes or checks src/email/templates.gen.ts
    preview-emails.ts          writes .preview/*.html for a visual review
    build-functions.ts         esbuild per function, 4 MB cap, metafile imports
  src/
    types.ts                   Role, Lang
    config.ts                  loadConfig(env) and ConfigError
    clock.ts log.ts crypto.ts  ports and Web Crypto helpers
    http.ts                    route(), problem+json, CORS, readJson, clientIp
    deps.ts                    the Deps interface
    ops.ts                     opsAlert() to OPS_EMAIL on state change
    integrity.ts               runIntegrity()
    db/sql.ts                  Sql and Db interfaces, toIso()
    db/postgres.ts             postgres.js adapter (production)
    email/theme.ts             spec §4.3 tokens, contrast()
    email/kinds.ts             kinds, thread spec, facts, placeholders
    email/copy.ts              EN and VI copy
    email/template-types.ts    Template and TemplateSet
    email/templates.gen.ts     GENERATED by npm run emails
    email/fill.ts              fill() and escapeHtml()
    email/format.ts            deadline, address and transfer formatting
    email/compose.ts           composeEmail(): Mail with List-Unsubscribe headers
    mail/mailer.ts             Mailer, resendMailer(), captureMailer(), disabledMailer()
    mail/deliver.ts            deliver(): claim, compose, send, complete or release
    chain/port.ts              ChainPort, VaultView, StoredAsset
    chain/view.ts              deriveView(snapshot, timeline)
    chain/sdk.ts               createSdkChain(atro, { wallet })
    keeper/signer.ts           THE ONLY FILE THAT READS KEEPER_KEY
    store/meta.ts              cursors, meta, lease
    store/subscriptions.ts     upsertPending, confirmByHash, deleteByUnsubHash, activeSubscribers
    store/ratelimit.ts         fixed one-hour windows
    store/deliveries.ts        claim, complete, release
    store/vaults.ts            insertCreated, insertEvents, saveView, getVault, knownVaults, reads for /me and /stats
    store/notices.ts           unnotified events, reminder and drill-summary candidates
    store/keeper.ts            dueVaults, setNextCheck, lastDistributes, logKeeper
    store/integrity.ts         saveIntegrity, latestIntegrity
    tick/indexer.ts            runIndexer()
    tick/notices.ts            planEventNotices, dueReminder, runNotices
    tick/keeper.ts             runKeeperPhase()
    tick/run.ts                runTick(): lease, budget, three phases
    functions/*.ts             the eight handlers (+ cron.ts for the secret check)
    entry/*.ts                 one Deno entry per function
    entry/runtime.ts           buildDeps(env) and serve(handler)
    entry/deno.d.ts            the two Deno globals the entries use
  test/
    helpers/db.ts              PGlite test database with the migrations applied
    helpers/fake-chain.ts      FakeChain implements ChainPort
    helpers/fixtures.ts        addresses, views, events, snapshots
    helpers/deps.ts            testConfig(), testEnv()
    helpers/http.ts            request builders and token extraction
    helpers/seed.ts            seedVault(), activeSubscriber()
    unit/*.test.ts(x)          unit tests
    e2e/global-setup.ts        anvil + DeployLocal
    e2e/drill.test.ts          the whole Drill lifecycle through runTick
    __snapshots__/emails/      24 HTML and 24 text snapshots
supabase/
  config.toml                  project id and the eight functions (verify_jwt false, entrypoint)
  migrations/20261123000000_init.sql       schema, RLS, cleanup function
  migrations/20261123000100_schedule.sql   pg_cron + pg_net + Vault (Supabase only)
  functions/<name>/index.js    build output, gitignored
```

Modified elsewhere: `package-lock.json` (Task 1), `biome.json` (Tasks 3, 4, 11), `.gitignore` (Tasks 4, 11), `AGENTS.md`, `.github/workflows/ci.yml` and `docs/superpowers/plans/2026-11-18-atropyle-worker.md` (Task 13).

## Conventions every task relies on

- **Addresses in the database** are stored lowercase (`0x` + 40 hex) and returned checksummed with viem's `getAddress`.
- **Query parameters** are always cast explicitly: `$1::bigint`, `$2::int`, `$3::boolean`, `$4::jsonb`, `$5::timestamptz`.
  - Bigints travel as decimal strings. JSON travels as a string produced by the SDK's `stringify`. Timestamps travel as ISO strings from the injected `Clock`.
  - Lists travel as one comma-joined string and are split with `string_to_array($n::text, ',')`.
- **Inside `sql.begin(async (tx) => …)`** every query uses `tx`, never the outer `sql`. Both PGlite and postgres.js (`max: 1`) have a single connection, so the outer handle deadlocks inside a transaction.
- **Time:**
  - Chain time is a `bigint` of Unix seconds taken from the latest block. It drives reminders, keeper due dates and event age.
  - Wall time is `Clock.now()` in milliseconds. It drives budgets, leases, rate-limit windows and `*_at` columns.
- **Problem responses** follow the spec §9.6 shape exactly: `{ "type": "about:blank", "title", "status", "code" }`.

---
### Task 1: Workspace, Postgres schema and the database port

**Files:**
- Create: `apps/backend/package.json`, `apps/backend/tsconfig.json`, `apps/backend/vitest.config.ts`
- Create: `supabase/migrations/20261123000000_init.sql`, `supabase/migrations/20261123000100_schedule.sql`
- Create: `apps/backend/src/db/sql.ts`, `apps/backend/src/db/postgres.ts`
- Create: `apps/backend/test/helpers/db.ts`
- Test: `apps/backend/test/unit/schema.test.ts`, `apps/backend/test/unit/postgres.test.ts`
- Modify: `package-lock.json` (through `npm install`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type SqlParam = string | number | boolean | null`
  - `interface Sql { query<T extends object = Record<string, unknown>>(text: string, params?: readonly SqlParam[]): Promise<T[]>; begin<T>(fn: (tx: Sql) => Promise<T>): Promise<T> }`
  - `interface Db extends Sql { close(): Promise<void> }`
  - `toIso(v: unknown): string`
  - `connectPostgres(url: string, factory?: PgFactory): Db`; `PG_OPTIONS`; types `PgQueryable`, `PgClient`, `PgFactory`
  - Test helper: `testDb(): Promise<TestDb>` where `TestDb extends Db { pg: PGlite; applied: string[]; skipped: string[]; reset(): Promise<void> }`; `TABLES`; `SUPABASE_ONLY`
  - Tables: `cursors`, `meta`, `vaults`, `vault_roles`, `vault_events`, `subscriptions`, `deliveries`, `rate_limits`, `keeper_log`, `integrity_runs`; function `public.atropyle_cleanup(timestamptz) returns jsonb`

- [ ] **Step 1: Create the workspace files**

`apps/backend/package.json`:

```json
{
  "name": "@atropyle/backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Supabase Edge Functions, email and keeper for Atropyle (spec 2026-11-22 §9).",
  "scripts": {
    "build": "tsx build.ts",
    "emails": "tsx scripts/emails.ts",
    "emails:check": "tsx scripts/emails.ts --check",
    "emails:preview": "tsx scripts/preview-emails.ts",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:e2e": "vitest run -c vitest.e2e.config.ts"
  },
  "dependencies": {
    "@atropyle/sdk": "0.1.0",
    "postgres": "3.4.9",
    "viem": "2.58.0"
  },
  "devDependencies": {
    "@electric-sql/pglite": "0.5.17",
    "@react-email/components": "1.0.12",
    "@types/react": "19.3.0",
    "esbuild": "0.28.2",
    "react": "19.3.1",
    "react-dom": "19.3.1"
  }
}
```

`apps/backend/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": ["node"]
  },
  "include": ["src", "emails", "scripts", "test", "build.ts", "*.config.ts"]
}
```

`apps/backend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['test/unit/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
    // PGlite with citext takes a few seconds to start on a cold Windows machine.
    hookTimeout: 60_000,
  },
});
```

- [ ] **Step 2: Install the dependencies (the only `npm install` of this plan)**

Run from the repository root:

```bash
npm install
```

Expected: npm links `@atropyle/backend` and `@atropyle/sdk` from the workspaces and adds `postgres`, `@electric-sql/pglite`, `@react-email/components`, `react`, `react-dom`, `@types/react` and `esbuild` to `package-lock.json`. Check that the installed versions are exactly the pinned ones:

```bash
node -e "for (const p of ['postgres','@electric-sql/pglite','@react-email/components','react','react-dom','@types/react','esbuild']) console.log(p, require('./node_modules/' + p + '/package.json').version)"
```

Expected: `postgres 3.4.9`, `@electric-sql/pglite 0.5.17`, `@react-email/components 1.0.12`, `react 19.3.1`, `react-dom 19.3.1`, `@types/react 19.3.0`, `esbuild 0.28.2`. If esbuild resolves to another version because another workspace pins one, `apps/backend/node_modules/esbuild/package.json` must show 0.28.2.

- [ ] **Step 3: Check and restore the `@emnapi` lockfile entries (Windows lockfile trap)**

```bash
grep -c '"node_modules/@emnapi/core"\|"node_modules/@emnapi/runtime"' package-lock.json
```

Expected: `2`. If it prints `0` or `1`, restore the missing entries in npm's own key order (nothing else moves):

```bash
node --input-type=module <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const want = {
  'node_modules/@emnapi/core': {
    version: '2.0.0-beta.2',
    resolved: 'https://registry.npmjs.org/@emnapi/core/-/core-2.0.0-beta.2.tgz',
    integrity: 'sha512-MzCVoWtcg4Pm2B3je5mMvYMvj3MmBKw+fU7vbsJc9/iT8ip6/eYIHo/Dsm/mr+wsHB6SEyJDuxB09Yy6r/8+4A==',
    dev: true,
    license: 'MIT',
    optional: true,
    dependencies: { '@emnapi/wasi-threads': '2.2.0', tslib: '^2.4.0' },
  },
  'node_modules/@emnapi/runtime': {
    version: '2.0.0-beta.2',
    resolved: 'https://registry.npmjs.org/@emnapi/runtime/-/runtime-2.0.0-beta.2.tgz',
    integrity: 'sha512-JcrSPzPvZuNZvJqPTF9Fw25LbOJ8avzFVlaf2grmH4Cku0oGP47tRgqPZadcfj3YoZMHkFVnCYFbQM8I+i5QEw==',
    dev: true,
    license: 'MIT',
    optional: true,
    dependencies: { tslib: '^2.4.0' },
  },
};
let entries = Object.entries(lock.packages);
const missing = Object.keys(want).filter((k) => !(k in lock.packages));
for (const key of missing) {
  // npm orders the keys of "packages" with localeCompare('en'); insert before the first key that sorts after this one.
  const at = entries.findIndex(([k]) => k !== '' && k.localeCompare(key, 'en') > 0);
  entries = at === -1 ? [...entries, [key, want[key]]] : [...entries.slice(0, at), [key, want[key]], ...entries.slice(at)];
}
lock.packages = Object.fromEntries(entries);
writeFileSync('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
console.log(missing.length ? `restored ${missing.join(', ')}` : 'both @emnapi entries present');
EOF
grep -c '"node_modules/@emnapi/core"\|"node_modules/@emnapi/runtime"' package-lock.json
```

Expected after the script: `2`. Do not run `npm install --package-lock-only` afterwards, because it strips the entries again.

- [ ] **Step 4: Write the database port**

`apps/backend/src/db/sql.ts`:

```ts
/**
 * The one database interface of the backend. PGlite (tests) and postgres.js (Supabase) both satisfy it.
 *
 * Conventions (plan 8, "Conventions every task relies on"): parameters are cast in the SQL text ($1::bigint,
 * $2::jsonb, ...); bigints are passed and selected as decimal text; addresses are stored lowercase.
 */
export type SqlParam = string | number | boolean | null;

export interface Sql {
  query<T extends object = Record<string, unknown>>(text: string, params?: readonly SqlParam[]): Promise<T[]>;
  /** Runs `fn` in one transaction. A `begin` inside the callback joins the outer transaction. */
  begin<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
}

export interface Db extends Sql {
  close(): Promise<void>;
}

/** A timestamptz column as an ISO 8601 UTC string, whichever driver read it. */
export function toIso(v: unknown): string {
  return v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString();
}
```

- [ ] **Step 5: Write the PGlite test helper**

`apps/backend/test/helpers/db.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { citext } from '@electric-sql/pglite/contrib/citext';
import type { Db, Sql, SqlParam } from '../../src/db/sql';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../../../supabase/migrations/', import.meta.url));
/** First line of a migration that needs pg_cron, pg_net or Vault, which PGlite does not have. */
export const SUPABASE_ONLY = '-- atropyle:supabase-only';
export const TABLES = [
  'cursors',
  'meta',
  'vaults',
  'vault_roles',
  'vault_events',
  'subscriptions',
  'deliveries',
  'rate_limits',
  'keeper_log',
  'integrity_runs',
] as const;

export interface TestDb extends Db {
  pg: PGlite;
  applied: string[];
  skipped: string[];
  /** Empties every table and restarts the identity columns. */
  reset(): Promise<void>;
}

function wrap(q: PGlite | Transaction, inTx: boolean): Sql {
  const self: Sql = {
    async query<T extends object>(text: string, params: readonly SqlParam[] = []): Promise<T[]> {
      const r = await q.query<T>(text, [...params]);
      return r.rows;
    },
    async begin<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
      if (inTx) return fn(self);
      return (q as PGlite).transaction((tx) => fn(wrap(tx, true)));
    },
  };
  return self;
}

/** A fresh in-memory Postgres with every migration of supabase/migrations applied, except the Supabase-only ones. */
export async function testDb(): Promise<TestDb> {
  const pg = await PGlite.create({ extensions: { citext } });
  const applied: string[] = [];
  const skipped: string[] = [];
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    if (text.startsWith(SUPABASE_ONLY)) {
      skipped.push(file);
      continue;
    }
    await pg.exec(text);
    applied.push(file);
  }
  const sql = wrap(pg, false);
  return {
    query: sql.query,
    begin: sql.begin,
    pg,
    applied,
    skipped,
    reset: async () => {
      await pg.exec(`truncate table ${TABLES.map((t) => `public.${t}`).join(', ')} restart identity cascade`);
    },
    close: () => pg.close(),
  };
}
```

- [ ] **Step 6: Write the failing schema test**

`apps/backend/test/unit/schema.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TABLES, type TestDb, testDb } from '../helpers/db';

const VAULT = `0x${'ab'.repeat(20)}`;
const hash = (n: number) => n.toString(16).padStart(64, '0');

let db: TestDb;
beforeAll(async () => {
  db = await testDb();
});
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.reset();
});

const count = async (table: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`))[0].n;

async function addSub(email: string, o: { status?: string; createdAt?: string; role?: string; n?: number } = {}) {
  const [row] = await db.query<{ id: string }>(
    `insert into public.subscriptions (email, vault, role, lang, status, confirm_hash, created_at)
     values ($1, $2, $3, 'en', $4, $5, $6::timestamptz) returning id::text as id`,
    [email, VAULT, o.role ?? 'owner', o.status ?? 'pending', hash(o.n ?? 1), o.createdAt ?? new Date().toISOString()],
  );
  return row.id;
}

describe('the schema on PGlite', () => {
  it('applies the init migration and skips the Supabase-only schedule', () => {
    expect(db.applied).toEqual(['20261123000000_init.sql']);
    expect(db.skipped).toEqual(['20261123000100_schedule.sql']);
  });

  it('turns RLS on for every table and defines no policy', async () => {
    const rows = await db.query<{ relname: string; rls: boolean }>(
      `select c.relname, c.relrowsecurity as rls from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...TABLES].sort());
    expect(rows.every((r) => r.rls)).toBe(true);
    const [p] = await db.query<{ n: number }>(`select count(*)::int as n from pg_policies where schemaname = 'public'`);
    expect(p.n).toBe(0);
  });

  it('keeps one subscription per email, vault and role, whatever the case of the email', async () => {
    await addSub('Alice@Example.com');
    await expect(addSub('alice@EXAMPLE.COM', { n: 2 })).rejects.toThrow(/subscriptions_one_per_role/);
    await addSub('alice@example.com', { role: 'heir', n: 3 });
    expect(await count('subscriptions')).toBe(2);
  });

  it('rejects rows that break the checks', async () => {
    await expect(
      db.query(
        `insert into public.subscriptions (email, vault, role, lang, confirm_hash) values ('a@b.co', $1, 'thief', 'en', $2)`,
        [VAULT, hash(1)],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(
        `insert into public.subscriptions (email, vault, role, lang, confirm_hash) values ('a@b.co', $1, 'owner', 'en', $2)`,
        [`0x${'AB'.repeat(20)}`, hash(1)],
      ),
    ).rejects.toThrow(/check constraint/);
    await expect(
      db.query(
        `insert into public.vaults (address, owner, drill, created_block, updated_block, state)
         values ($1, $1, true, 1, 1, 'lost')`,
        [VAULT],
      ),
    ).rejects.toThrow(/vaults_state/);
  });

  it('deletes deliveries with their subscription and roles with their vault', async () => {
    const id = await addSub('a@b.co');
    await db.query(
      `insert into public.deliveries (subscription_id, kind, period_key) values ($1::bigint, 'welcome', 'once')`,
      [id],
    );
    await db.query('delete from public.subscriptions where id = $1::bigint', [id]);
    expect(await count('deliveries')).toBe(0);
    await db.query(
      'insert into public.vaults (address, owner, drill, created_block, updated_block) values ($1, $1, true, 1, 1)',
      [VAULT],
    );
    await db.query(`insert into public.vault_roles (vault, address, role) values ($1, $1, 'owner')`, [VAULT]);
    await db.query('delete from public.vaults where address = $1', [VAULT]);
    expect(await count('vault_roles')).toBe(0);
  });

  it('cleanup drops pending rows after 48 h and rate limits after 24 h, and keeps active rows', async () => {
    const now = Date.UTC(2026, 10, 30, 12);
    const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
    await addSub('old@b.co', { createdAt: hoursAgo(49), n: 1 });
    await addSub('new@b.co', { createdAt: hoursAgo(47), n: 2 });
    await addSub('kept@b.co', { createdAt: hoursAgo(200), status: 'active', n: 3 });
    await db.query(
      `insert into public.rate_limits (key, window_start, count) values ('ip:a', $1::timestamptz, 1), ('ip:b', $2::timestamptz, 1)`,
      [hoursAgo(25), hoursAgo(1)],
    );
    const [r] = await db.query<{ r: unknown }>('select public.atropyle_cleanup($1::timestamptz) as r', [
      new Date(now).toISOString(),
    ]);
    expect(r.r).toEqual({ pending: 1, rateLimits: 1, integrityRuns: 0 });
    const left = await db.query<{ email: string }>('select email::text as email from public.subscriptions order by 1');
    expect(left.map((x) => x.email)).toEqual(['kept@b.co', 'new@b.co']);
    expect(await count('rate_limits')).toBe(1);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run test/unit/schema.test.ts` (from `apps/backend`)
Expected: FAIL with `ENOENT: no such file or directory, scandir '…/supabase/migrations/'`.

- [ ] **Step 8: Write the init migration**

`supabase/migrations/20261123000000_init.sql`:

```sql
-- Atropyle backend schema (spec 2026-11-22 §9.1; plan 8 ruling 8 adds meta and a few columns).
--
-- Row level security is on for every table and no policy exists, so the anon and authenticated roles of the
-- REST API see nothing. The Edge Functions connect through SUPABASE_DB_URL as the owner of these tables,
-- which RLS does not restrict. Addresses are stored lowercase; bigints are chain values (blocks, seconds).

create schema if not exists extensions;
create extension if not exists citext with schema extensions;

-- Indexer position: the last block whose logs are stored.
create table public.cursors (
  name text primary key,
  block bigint not null check (block >= 0),
  updated_at timestamptz not null default now()
);

-- Small shared state: the tick lease, indexer and keeper status (/health), ops-alert state.
create table public.meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.vaults (
  address text primary key check (address ~ '^0x[0-9a-f]{40}$'),
  owner text not null check (owner ~ '^0x[0-9a-f]{40}$'),
  drill boolean not null,
  created_block bigint not null,
  state text not null default 'active',
  pending_state text not null default 'active',
  last_alive bigint,
  -- Block of the Alive event whose `at` equals last_alive: the period key of check-in reminders.
  last_alive_block bigint,
  late_at bigint,
  window_ends_at bigint,
  recovery_target text check (recovery_target ~ '^0x[0-9a-f]{40}$'),
  -- Chain time at which the keeper looks at this vault again; null when it never needs to.
  next_check_at bigint,
  expires_at bigint,
  expired boolean not null default false,
  released boolean not null default false,
  -- [{ index, kind, token, id, decimals }]: what distribute() pays, for the payout email.
  assets jsonb not null default '[]'::jsonb,
  updated_block bigint not null,
  updated_at timestamptz not null default now(),
  constraint vaults_state check (state in ('active', 'grace', 'recovery', 'releasedInherit', 'releasedRecover')),
  constraint vaults_pending_state check (
    pending_state in ('active', 'grace', 'recovery', 'releasedInherit', 'releasedRecover')
  )
);
create index vaults_due on public.vaults (next_check_at) where next_check_at is not null and not expired;

create table public.vault_roles (
  vault text not null references public.vaults (address) on delete cascade,
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  role text not null check (role in ('owner', 'guardian', 'heir')),
  primary key (vault, address, role)
);
create index vault_roles_address on public.vault_roles (address);

-- Every vault event once (the primary key dedupes re-scanned ranges).
create table public.vault_events (
  tx_hash text not null check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  log_index int not null,
  vault text not null check (vault ~ '^0x[0-9a-f]{40}$'),
  name text not null,
  block bigint not null,
  -- Chain time of the block.
  at bigint not null,
  args jsonb not null,
  notified_at timestamptz,
  primary key (tx_hash, log_index)
);
create index vault_events_unnotified on public.vault_events (block, log_index) where notified_at is null;
create index vault_events_vault on public.vault_events (vault, name);

-- Only hashes of tokens are stored. Unsubscribing deletes the row (spec §9.5).
create table public.subscriptions (
  id bigint generated always as identity primary key,
  email extensions.citext not null check (length(email) between 3 and 254),
  vault text not null check (vault ~ '^0x[0-9a-f]{40}$'),
  role text not null check (role in ('owner', 'guardian', 'heir')),
  lang text not null check (lang in ('en', 'vi')),
  status text not null default 'pending' check (status in ('pending', 'active')),
  confirm_hash text not null check (confirm_hash ~ '^[0-9a-f]{64}$'),
  unsub_hash text unique check (unsub_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  constraint subscriptions_one_per_role unique (email, vault, role)
);
create index subscriptions_vault on public.subscriptions (vault) where status = 'active';
create index subscriptions_confirm on public.subscriptions (confirm_hash);

-- One row per email that was (or is being) sent: the primary key is what makes notices idempotent.
create table public.deliveries (
  subscription_id bigint not null references public.subscriptions (id) on delete cascade,
  kind text not null,
  period_key text not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_id text,
  primary key (subscription_id, kind, period_key)
);

-- Fixed one-hour windows; keys are HMACs of the IP or the email, never the values themselves.
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

create table public.keeper_log (
  id bigint generated always as identity primary key,
  vault text not null check (vault ~ '^0x[0-9a-f]{40}$'),
  action text check (action in ('poke', 'distribute')),
  tx_hash text check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  status text not null,
  error text,
  -- Chain time of the keeper run (KeeperReport.ranAt): the distribute back-off compares chain times.
  chain_at bigint not null,
  at timestamptz not null default now()
);
create index keeper_log_distribute on public.keeper_log (vault, chain_at) where action = 'distribute' and status = 'sent';

create table public.integrity_runs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  block bigint not null,
  ok boolean not null,
  report jsonb not null
);

alter table public.cursors enable row level security;
alter table public.meta enable row level security;
alter table public.vaults enable row level security;
alter table public.vault_roles enable row level security;
alter table public.vault_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.deliveries enable row level security;
alter table public.rate_limits enable row level security;
alter table public.keeper_log enable row level security;
alter table public.integrity_runs enable row level security;

-- Daily job (schedule migration): pending sign-ups older than 48 h, rate-limit windows older than 24 h (spec
-- §9.1, §9.5) and integrity runs older than 30 days.
create function public.atropyle_cleanup(p_now timestamptz default now())
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  pending_count int;
  limit_count int;
  integrity_count int;
begin
  delete from public.subscriptions where status = 'pending' and created_at < p_now - interval '48 hours';
  get diagnostics pending_count = row_count;
  delete from public.rate_limits where window_start < p_now - interval '24 hours';
  get diagnostics limit_count = row_count;
  delete from public.integrity_runs where at < p_now - interval '30 days';
  get diagnostics integrity_count = row_count;
  return jsonb_build_object('pending', pending_count, 'rateLimits', limit_count, 'integrityRuns', integrity_count);
end;
$$;
revoke execute on function public.atropyle_cleanup(timestamptz) from public;

-- Supabase grants the API roles access to new tables by default; take it back. The roles do not exist in PGlite.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema public from %I', r);
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('revoke execute on function public.atropyle_cleanup(timestamptz) from %I', r);
    end if;
  end loop;
end;
$$;
```

- [ ] **Step 9: Write the schedule migration (Supabase only)**

`supabase/migrations/20261123000100_schedule.sql`:

```sql
-- atropyle:supabase-only
-- pg_cron, pg_net and Supabase Vault exist only on Supabase. apps/backend/test/helpers/db.ts skips every
-- migration whose first line is the marker above, so PGlite tests never run this file.
--
-- Before `supabase db push`, the maintainer stores two Vault secrets in the SQL editor (apps/backend/README.md):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'atropyle_functions_url');
--   select vault.create_secret('<the same value as the CRON_SECRET function secret>', 'atropyle_cron_secret');
-- The functions refuse a call without the matching x-cron-secret header.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists atropyle_private;
revoke all on schema atropyle_private from public;

-- POSTs {} to <functions url>/<fn> with the cron secret. pg_net is asynchronous: this returns a request id at
-- once and the response lands in net._http_response (kept 6 h) for debugging.
create or replace function atropyle_private.call_function(fn text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  secret text;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'atropyle_functions_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'atropyle_cron_secret';
  if base is null or secret is null then
    raise exception 'atropyle: set the Vault secrets atropyle_functions_url and atropyle_cron_secret first';
  end if;
  return net.http_post(
    url := base || '/' || fn,
    body := '{}'::jsonb,
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', secret),
    timeout_milliseconds := 55000
  );
end;
$$;
revoke execute on function atropyle_private.call_function(text) from public;

-- cron.schedule with an existing name replaces that job, so this migration can be re-applied.
select cron.schedule('atropyle-tick', '* * * * *', $$select atropyle_private.call_function('tick')$$);
select cron.schedule('atropyle-integrity', '*/10 * * * *', $$select atropyle_private.call_function('integrity')$$);
select cron.schedule('atropyle-cleanup', '17 3 * * *', $$select public.atropyle_cleanup()$$);
```

- [ ] **Step 10: Run the schema test to verify it passes**

Run: `npx vitest run test/unit/schema.test.ts` (from `apps/backend`)
Expected: PASS, 6 tests.

- [ ] **Step 11: Write the failing postgres.js adapter test**

`apps/backend/test/unit/postgres.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { connectPostgres, type PgClient, type PgQueryable } from '../../src/db/postgres';

function fakeClient() {
  const calls: { where: string; text: string; params: unknown[] }[] = [];
  const ends: ({ timeout?: number } | undefined)[] = [];
  const queryable = (where: string): PgQueryable => ({
    unsafe: async (text: string, params: never[] = []) => {
      calls.push({ where, text, params: [...params] });
      return [{ where }];
    },
  });
  const client: PgClient = {
    ...queryable('root'),
    begin: async (fn) => fn(queryable('tx')),
    end: async (o) => {
      ends.push(o);
    },
  };
  return { client, calls, ends };
}

describe('connectPostgres (production driver, spec §9.2)', () => {
  it('connects with the pooler options: no prepared statements, one connection', () => {
    const seen: { url: string; options: Record<string, unknown> }[] = [];
    connectPostgres('postgres://u:p@db.example:6543/postgres', (url, options) => {
      seen.push({ url, options });
      return fakeClient().client;
    });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('postgres://u:p@db.example:6543/postgres');
    expect(seen[0].options).toMatchObject({ prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 });
  });

  it('passes the text and the parameters through and returns a plain array', async () => {
    const f = fakeClient();
    const db = connectPostgres('postgres://x', () => f.client);
    const rows = await db.query<{ where: string }>('select $1::text as a', ['b']);
    expect(rows).toEqual([{ where: 'root' }]);
    expect(Array.isArray(rows)).toBe(true);
    expect(f.calls).toEqual([{ where: 'root', text: 'select $1::text as a', params: ['b'] }]);
  });

  it('runs a transaction on the transaction handle and joins nested begin calls', async () => {
    const f = fakeClient();
    const db = connectPostgres('postgres://x', () => f.client);
    await db.begin(async (tx) => {
      await tx.query('select 1');
      await tx.begin(async (inner) => {
        await inner.query('select 2');
      });
    });
    expect(f.calls.map((c) => `${c.where}:${c.text}`)).toEqual(['tx:select 1', 'tx:select 2']);
  });

  it('closes the pool with a timeout', async () => {
    const f = fakeClient();
    await connectPostgres('postgres://x', () => f.client).close();
    expect(f.ends).toEqual([{ timeout: 5 }]);
  });
});
```

- [ ] **Step 12: Run it to verify it fails**

Run: `npx vitest run test/unit/postgres.test.ts` (from `apps/backend`)
Expected: FAIL with `Failed to load url ../../src/db/postgres`.

- [ ] **Step 13: Write the adapter**

`apps/backend/src/db/postgres.ts`:

```ts
import postgres from 'postgres';
import type { Db, Sql, SqlParam } from './sql';

/** The part of a postgres.js client, and of its transaction handle, that this adapter uses. */
export interface PgQueryable {
  unsafe(text: string, params?: never[]): PromiseLike<Iterable<unknown>>;
}

export interface PgClient extends PgQueryable {
  begin<T>(fn: (tx: PgQueryable) => Promise<T>): Promise<T>;
  end(o?: { timeout?: number }): Promise<void>;
}

export type PgFactory = (url: string, options: Record<string, unknown>) => PgClient;

/**
 * Supabase's pooler in transaction mode does not support prepared statements (Supabase's own Edge Function
 * examples pass prepare: false). One connection per isolate is enough: a function handles one request at a time.
 * idle_timeout and connect_timeout are in seconds.
 */
export const PG_OPTIONS = { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10 } as const;

const defaultFactory: PgFactory = (url, options) =>
  postgres(url, options as Parameters<typeof postgres>[1]) as unknown as PgClient;

function run(q: PgQueryable) {
  return async <T extends object>(text: string, params: readonly SqlParam[] = []): Promise<T[]> =>
    [...(await q.unsafe(text, [...params] as never[]))] as T[];
}

function joined(tx: PgQueryable): Sql {
  const self: Sql = {
    query: run(tx),
    begin: (fn) => fn(self),
  };
  return self;
}

/** The production database: SUPABASE_DB_URL through postgres.js (bundled as npm:postgres@3.4.9). */
export function connectPostgres(url: string, factory: PgFactory = defaultFactory): Db {
  const client = factory(url, { ...PG_OPTIONS, onnotice: () => {} });
  return {
    query: run(client),
    begin: (fn) => client.begin((tx) => fn(joined(tx))),
    close: () => client.end({ timeout: 5 }),
  };
}
```

- [ ] **Step 14: Run both tests to verify they pass**

Run: `npx vitest run test/unit/schema.test.ts test/unit/postgres.test.ts` (from `apps/backend`)
Expected: PASS, 10 tests.

- [ ] **Step 15: Typecheck and lint**

```bash
npx biome check --write apps/backend
npm run typecheck -w apps/backend
npx biome ci .
```

Expected: no errors. (`npm run typecheck` at the root also runs the other workspaces; run it once before committing.)

- [ ] **Step 16: Commit**

```bash
git add apps/backend/package.json apps/backend/tsconfig.json apps/backend/vitest.config.ts \
  apps/backend/src/db/sql.ts apps/backend/src/db/postgres.ts apps/backend/test/helpers/db.ts \
  apps/backend/test/unit/schema.test.ts apps/backend/test/unit/postgres.test.ts \
  supabase/migrations/20261123000000_init.sql supabase/migrations/20261123000100_schedule.sql package-lock.json
git commit -m "feat(backend): workspace, Postgres schema and the database port" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 2: Foundation: config, clock, log, crypto and HTTP

**Files:**
- Create: `apps/backend/src/types.ts`, `apps/backend/src/config.ts`, `apps/backend/src/clock.ts`, `apps/backend/src/log.ts`, `apps/backend/src/crypto.ts`, `apps/backend/src/http.ts`
- Test: `apps/backend/test/unit/config.test.ts`, `apps/backend/test/unit/crypto.test.ts`, `apps/backend/test/unit/http.test.ts`

**Interfaces:**
- Consumes: `stringify` from `@atropyle/sdk` (bigint-safe JSON).
- Produces:
  - `types.ts`: `type Role = 'owner' | 'guardian' | 'heir'`, `ROLES`, `type Lang = 'en' | 'vi'`, `LANGS`, `isRole(v)`, `isLang(v)`
  - `config.ts`: `type Env = (name: string) => string | undefined`, `interface Config` (fields below), `TICK_DEFAULTS`, `class ConfigError { problems: string[] }`, `loadConfig(env: Env): Config`
  - `clock.ts`: `interface Clock { now(): number; sleep(ms: number): Promise<void> }`, `systemClock`, `interface FakeClock extends Clock { advance(ms): void; set(ms): void }`, `fakeClock(startMs?)`, `isoAt(ms): string`
  - `log.ts`: `interface Log { info; warn; error }` (each `(msg: string, data?: Record<string, unknown>) => void`), `jsonLog(write?)`, `interface MemoryLog extends Log { lines }`, `memoryLog()`, `errorText(e): string`
  - `crypto.ts`: `sha256Hex(s)`, `hmacHex(secret, s)`, `hmacB64url(secret, s)`, `b64url(bytes)`, `TOKEN_RE`, `randomToken(random)`, `unsubToken(secret, id)`, `safeEqual(a, b)`
  - `http.ts`: `type ProblemCode`, `class HttpError(status, code, title, headers?)`, `invalid(title)`, `json(body, status?, headers?)`, `problem(status, code, title, headers?)`, `type Cors = 'public' | 'site' | 'none'`, `interface RouteOptions { method: 'GET' | 'POST'; cors: Cors; strictOrigin?: boolean }`, `interface RouteDeps { config: Pick<Config, 'allowedOrigins'>; log: Log }`, `type Handler<D> = (req: Request, d: D) => Promise<Response>`, `route<D extends RouteDeps>(o, fn): Handler<D>`, `readJson(req, maxBytes?)`, `clientIp(req)`

`Config` fields: `siteUrl`, `siteHost`, `allowedOrigins: string[]`, `apiUrl`, `mailFrom`, `tokenSecret`, `cronSecret`, `opsEmail: string | null`, `resendApiKey: string | null`, `rpcUrls: string[] | null`, `headMargin`, `budgetMs`, `maxBlocksPerRun`, `stepBlocks`, `keeperMaxTx` (numbers).

- [ ] **Step 1: Write the failing tests**

`apps/backend/test/unit/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config';

const BASE: Record<string, string> = {
  SITE_URL: 'https://atropyle.test/',
  SUPABASE_URL: 'https://ref.supabase.co',
  MAIL_FROM: 'Atropyle <alerts@atropyle.test>',
  TOKEN_SECRET: 't'.repeat(32),
  CRON_SECRET: 'c'.repeat(32),
};
const envOf = (o: Record<string, string>) => (name: string) => o[name];

function problemsOf(env: Record<string, string>): { problems: string[]; message: string } {
  try {
    loadConfig(envOf(env));
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError);
    return { problems: (e as ConfigError).problems, message: (e as Error).message };
  }
  throw new Error('loadConfig accepted an incomplete environment');
}

describe('loadConfig', () => {
  it('reads the minimal set and derives the API URL from SUPABASE_URL', () => {
    expect(loadConfig(envOf(BASE))).toEqual({
      siteUrl: 'https://atropyle.test',
      siteHost: 'atropyle.test',
      allowedOrigins: ['https://atropyle.test'],
      apiUrl: 'https://ref.supabase.co/functions/v1',
      mailFrom: 'Atropyle <alerts@atropyle.test>',
      tokenSecret: 't'.repeat(32),
      cronSecret: 'c'.repeat(32),
      opsEmail: null,
      resendApiKey: null,
      rpcUrls: null,
      headMargin: 3,
      budgetMs: 50_000,
      maxBlocksPerRun: 2_000,
      stepBlocks: 500,
      keeperMaxTx: 20,
    });
  });

  it('takes the optional settings when they are set', () => {
    const c = loadConfig(
      envOf({
        ...BASE,
        API_URL: 'https://api.atropyle.test/functions/v1/',
        ALLOWED_ORIGINS: 'https://atropyle-git-main.vercel.app, https://preview.atropyle.test',
        RPC_URLS: 'https://rpc.xlayer.tech,https://xlayerrpc.okx.com',
        HEAD_MARGIN: '0',
        OPS_EMAIL: 'ops@atropyle.test',
        RESEND_API_KEY: 're_test_value',
      }),
    );
    expect(c.apiUrl).toBe('https://api.atropyle.test/functions/v1');
    expect(c.allowedOrigins).toEqual([
      'https://atropyle.test',
      'https://atropyle-git-main.vercel.app',
      'https://preview.atropyle.test',
    ]);
    expect(c.rpcUrls).toEqual(['https://rpc.xlayer.tech', 'https://xlayerrpc.okx.com']);
    expect(c).toMatchObject({ headMargin: 0, opsEmail: 'ops@atropyle.test', resendApiKey: 're_test_value' });
  });

  it('lists every problem and never prints a secret', () => {
    const { problems, message } = problemsOf({ SITE_URL: 'http://atropyle.test', TOKEN_SECRET: 'short-secret-value' });
    expect(problems).toEqual([
      'SITE_URL must be an https URL',
      'API_URL is not set',
      'MAIL_FROM is not set',
      'TOKEN_SECRET must be at least 32 characters',
      'CRON_SECRET must be at least 32 characters',
    ]);
    expect(message).not.toContain('short-secret-value');
  });

  it('rejects an allowed origin with a path and a head margin that is not a small whole number', () => {
    const { problems } = problemsOf({ ...BASE, ALLOWED_ORIGINS: 'https://a.test/app', HEAD_MARGIN: '2.5' });
    expect(problems).toEqual([
      'ALLOWED_ORIGINS entry https://a.test/app is not an origin like https://example.com',
      'HEAD_MARGIN must be a whole number from 0 to 100',
    ]);
  });
});
```

`apps/backend/test/unit/crypto.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { b64url, hmacHex, randomToken, safeEqual, sha256Hex, TOKEN_RE, unsubToken } from '../../src/crypto';

describe('crypto helpers (Web Crypto, same in Node and Deno)', () => {
  it('hashes and signs with the standard test vectors', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await hmacHex('key', 'The quick brown fox jumps over the lazy dog')).toBe(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
    );
  });

  it('writes base64url without padding', () => {
    expect(b64url(new Uint8Array([251, 255]))).toBe('-_8');
  });

  it('makes 43-character tokens from the injected randomness', () => {
    const t = randomToken((n) => new Uint8Array(n).fill(7));
    expect(t).toMatch(TOKEN_RE);
    expect(t).toBe(b64url(new Uint8Array(32).fill(7)));
  });

  it('derives one unsubscribe token per subscription and secret', async () => {
    const a = await unsubToken('s'.repeat(32), '1');
    expect(a).toMatch(TOKEN_RE);
    expect(await unsubToken('s'.repeat(32), '1')).toBe(a);
    expect(await unsubToken('s'.repeat(32), '2')).not.toBe(a);
    expect(await unsubToken('x'.repeat(32), '1')).not.toBe(a);
  });

  it('compares secrets without an early exit', () => {
    expect(safeEqual('same-secret', 'same-secret')).toBe(true);
    expect(safeEqual('same-secret', 'same-secreT')).toBe(false);
    expect(safeEqual('short', 'longer-value')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
```

`apps/backend/test/unit/http.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { clientIp, HttpError, json, readJson, route } from '../../src/http';
import { memoryLog } from '../../src/log';

const SITE = 'https://atropyle.test';
const deps = () => ({ config: { allowedOrigins: [SITE] }, log: memoryLog() });
const post = (headers: Record<string, string> = {}, body = '{}') =>
  new Request('https://ref.supabase.co/functions/v1/x', { method: 'POST', headers, body });

describe('route', () => {
  const ok = route({ method: 'POST', cors: 'site' }, async () => json({ ok: true }));

  it('answers a preflight from the site with its origin', async () => {
    const r = await ok(new Request('https://x/f', { method: 'OPTIONS', headers: { origin: SITE } }), deps());
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(r.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
    expect(r.headers.get('access-control-allow-headers')).toBe('content-type');
  });

  it('refuses a POST from another origin with 403 UNAUTHORIZED', async () => {
    const r = await ok(post({ origin: 'https://evil.test' }), deps());
    expect(r.status).toBe(403);
    expect(r.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    expect(await r.json()).toEqual({ type: 'about:blank', title: 'Origin not allowed.', status: 403, code: 'UNAUTHORIZED' });
  });

  it('accepts a POST without an Origin header (mail clients, pg_net, curl)', async () => {
    const r = await ok(post(), deps());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it('lets a foreign origin POST when strictOrigin is false', async () => {
    const open = route({ method: 'POST', cors: 'site', strictOrigin: false }, async () => json({ ok: true }));
    expect((await open(post({ origin: 'https://mail.example' }), deps())).status).toBe(200);
  });

  it('opens a public GET to every origin', async () => {
    const get = route({ method: 'GET', cors: 'public' }, async () => json({ n: 1n }));
    const r = await get(new Request('https://x/f', { headers: { origin: 'https://anyone.test' } }), deps());
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
    expect(await r.text()).toBe('{"n":"1"}');
  });

  it('answers a wrong method with 405 INVALID_INPUT and an Allow header', async () => {
    const r = await ok(new Request('https://x/f'), deps());
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('POST, OPTIONS');
    expect((await r.json()).code).toBe('INVALID_INPUT');
  });

  it('turns an HttpError into problem+json and keeps its headers', async () => {
    const limited = route({ method: 'POST', cors: 'site' }, async () => {
      throw new HttpError(429, 'RATE_LIMITED', 'Too many requests.', { 'retry-after': '60' });
    });
    const r = await limited(post({ origin: SITE }), deps());
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('60');
    expect(r.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(await r.json()).toEqual({ type: 'about:blank', title: 'Too many requests.', status: 429, code: 'RATE_LIMITED' });
  });

  it('hides an unexpected error behind 500 INTERNAL and logs it', async () => {
    const d = deps();
    const boom = route({ method: 'POST', cors: 'none' }, async () => {
      throw new Error('db down');
    });
    const r = await boom(post(), d);
    expect(r.status).toBe(500);
    expect((await r.json()).code).toBe('INTERNAL');
    expect(d.log.lines).toEqual([{ level: 'error', msg: 'handler failed', data: { path: '/functions/v1/x', error: 'db down' } }]);
  });
});

describe('readJson and clientIp', () => {
  it('reads a JSON object and refuses anything else', async () => {
    expect(await readJson(post({}, '{"a":1}'))).toEqual({ a: 1 });
    await expect(readJson(post({}, 'not json'))).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' });
    await expect(readJson(post({}, '[1]'))).rejects.toMatchObject({ status: 400, code: 'INVALID_INPUT' });
    await expect(readJson(post({}, `{"a":"${'x'.repeat(5000)}"}`))).rejects.toMatchObject({ status: 400 });
  });

  it('takes the first x-forwarded-for entry', () => {
    expect(clientIp(post({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(post({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
    expect(clientIp(post())).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/unit/config.test.ts test/unit/crypto.test.ts test/unit/http.test.ts` (from `apps/backend`)
Expected: FAIL. The modules `../../src/config`, `../../src/crypto` and `../../src/http` do not exist.

- [ ] **Step 3: Write `types.ts`, `clock.ts` and `log.ts`**

`apps/backend/src/types.ts`:

```ts
/** Roles a subscriber can hold (spec §9.6). The SDK's Role also has recoveryTarget, which never subscribes. */
export type Role = 'owner' | 'guardian' | 'heir';
export const ROLES: readonly Role[] = ['owner', 'guardian', 'heir'];

export type Lang = 'en' | 'vi';
export const LANGS: readonly Lang[] = ['en', 'vi'];

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);
export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v);
```

`apps/backend/src/clock.ts`:

```ts
/** Wall time in milliseconds (budgets, leases, rate-limit windows, *_at columns). Chain time comes from blocks. */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface FakeClock extends Clock {
  advance(ms: number): void;
  set(ms: number): void;
}

/** A clock for tests: it only moves when told to, and sleep() moves it instead of waiting. */
export function fakeClock(startMs = Date.UTC(2026, 10, 23, 12, 0, 0)): FakeClock {
  let t = startMs;
  return {
    now: () => t,
    sleep: async (ms) => {
      t += ms;
    },
    advance: (ms) => {
      t += ms;
    },
    set: (ms) => {
      t = ms;
    },
  };
}

export const isoAt = (ms: number): string => new Date(ms).toISOString();
```

`apps/backend/src/log.ts`:

```ts
import { stringify } from '@atropyle/sdk';

export type LogLevel = 'info' | 'warn' | 'error';
type LogFn = (msg: string, data?: Record<string, unknown>) => void;

/** Structured logs. Never pass an email address, a token or a secret in `data`. */
export interface Log {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

/** One JSON line per entry (Supabase keeps function logs); bigints are written as decimal strings. */
export function jsonLog(write: (line: string) => void = (line) => console.log(line)): Log {
  const at =
    (level: LogLevel): LogFn =>
    (msg, data = {}) =>
      write(stringify({ level, msg, ...data }));
  return { info: at('info'), warn: at('warn'), error: at('error') };
}

export interface MemoryLog extends Log {
  lines: { level: LogLevel; msg: string; data: Record<string, unknown> }[];
}

export function memoryLog(): MemoryLog {
  const lines: MemoryLog['lines'] = [];
  const at =
    (level: LogLevel): LogFn =>
    (msg, data = {}) => {
      lines.push({ level, msg, data });
    };
  return { lines, info: at('info'), warn: at('warn'), error: at('error') };
}

export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
```

- [ ] **Step 4: Write `config.ts`**

`apps/backend/src/config.ts`:

```ts
export type Env = (name: string) => string | undefined;

export interface Config {
  /** Where the web app lives (no trailing slash). Every link in every email starts with it. */
  siteUrl: string;
  siteHost: string;
  /** Origins allowed to POST: the site's origin plus ALLOWED_ORIGINS. */
  allowedOrigins: string[];
  /** https://<project-ref>.supabase.co/functions/v1: the target of the List-Unsubscribe header. */
  apiUrl: string;
  /** "Atropyle <alerts@<domain>>" on a domain verified at Resend. */
  mailFrom: string;
  /** HMAC key for unsubscribe tokens and rate-limit keys. */
  tokenSecret: string;
  /** Shared with the pg_cron job through Vault; tick and integrity refuse calls without it. */
  cronSecret: string;
  opsEmail: string | null;
  /** Without it the mailer is off: sends fail and are retried once it is set. */
  resendApiKey: string | null;
  /** Override for the deployment's read RPCs. */
  rpcUrls: string[] | null;
  /** The indexer stays this many blocks behind the head (a lagging RPC node may not serve the newest logs). */
  headMargin: number;
  /** Whole tick budget in ms (spec §9.3: 50 s). */
  budgetMs: number;
  /** Blocks one tick indexes at most (spec §9.3: 2,000). */
  maxBlocksPerRun: number;
  /** Blocks per committed indexer step. */
  stepBlocks: number;
  /** Keeper transactions per tick at most (ecosystem spec §9.4: 20). */
  keeperMaxTx: number;
}

export const TICK_DEFAULTS = {
  budgetMs: 50_000,
  maxBlocksPerRun: 2_000,
  stepBlocks: 500,
  keeperMaxTx: 20,
  headMargin: 3,
} as const;

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`The backend is not configured: ${problems.join('; ')}.`);
    this.name = 'ConfigError';
  }
}

const noSlash = (s: string) => s.replace(/\/+$/, '');
const list = (s: string | undefined) =>
  (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x !== '');

/** Reads the function secrets (apps/backend/README.md). Problems name the variable, never its value. */
export function loadConfig(env: Env): Config {
  const problems: string[] = [];
  const get = (name: string): string | undefined => {
    const v = env(name)?.trim();
    return v === undefined || v === '' ? undefined : v;
  };
  const httpsUrl = (name: string, raw: string | undefined): URL | null => {
    if (raw === undefined) {
      problems.push(`${name} is not set`);
      return null;
    }
    try {
      const u = new URL(raw);
      if (u.protocol === 'https:') return u;
      problems.push(`${name} must be an https URL`);
    } catch {
      problems.push(`${name} is not a URL`);
    }
    return null;
  };

  const site = httpsUrl('SITE_URL', get('SITE_URL'));
  const supabase = get('SUPABASE_URL');
  const api = httpsUrl('API_URL', get('API_URL') ?? (supabase ? `${noSlash(supabase)}/functions/v1` : undefined));
  const mailFrom = get('MAIL_FROM');
  if (mailFrom === undefined) problems.push('MAIL_FROM is not set');
  const tokenSecret = get('TOKEN_SECRET') ?? '';
  if (tokenSecret.length < 32) problems.push('TOKEN_SECRET must be at least 32 characters');
  const cronSecret = get('CRON_SECRET') ?? '';
  if (cronSecret.length < 32) problems.push('CRON_SECRET must be at least 32 characters');
  const extra = list(get('ALLOWED_ORIGINS'));
  for (const o of extra) {
    let isOrigin = false;
    try {
      isOrigin = new URL(o).origin === o;
    } catch {
      isOrigin = false;
    }
    if (!isOrigin) problems.push(`ALLOWED_ORIGINS entry ${o} is not an origin like https://example.com`);
  }
  const rpcUrls = list(get('RPC_URLS'));
  const marginRaw = get('HEAD_MARGIN');
  const headMargin = marginRaw === undefined ? TICK_DEFAULTS.headMargin : Number(marginRaw);
  if (!Number.isSafeInteger(headMargin) || headMargin < 0 || headMargin > 100) {
    problems.push('HEAD_MARGIN must be a whole number from 0 to 100');
  }
  if (problems.length > 0 || site === null || api === null || mailFrom === undefined) throw new ConfigError(problems);

  return {
    siteUrl: noSlash(site.href),
    siteHost: site.host,
    allowedOrigins: [site.origin, ...extra],
    apiUrl: noSlash(api.href),
    mailFrom,
    tokenSecret,
    cronSecret,
    opsEmail: get('OPS_EMAIL') ?? null,
    resendApiKey: get('RESEND_API_KEY') ?? null,
    rpcUrls: rpcUrls.length > 0 ? rpcUrls : null,
    headMargin,
    budgetMs: TICK_DEFAULTS.budgetMs,
    maxBlocksPerRun: TICK_DEFAULTS.maxBlocksPerRun,
    stepBlocks: TICK_DEFAULTS.stepBlocks,
    keeperMaxTx: TICK_DEFAULTS.keeperMaxTx,
  };
}
```

- [ ] **Step 5: Write `crypto.ts`**

`apps/backend/src/crypto.ts`:

```ts
// Web Crypto only (globalThis.crypto): identical in Node 24 and in Supabase's Deno runtime.
const enc = new TextEncoder();

const hex = (b: ArrayBuffer | Uint8Array): string =>
  [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sha256Hex(s: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

async function hmac(secret: string, s: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(s)));
}

export async function hmacHex(secret: string, s: string): Promise<string> {
  return hex(await hmac(secret, s));
}

export async function hmacB64url(secret: string, s: string): Promise<string> {
  return b64url(await hmac(secret, s));
}

/** Every token the backend hands out: 32 bytes as base64url, 43 characters. */
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function randomToken(random: (size: number) => Uint8Array): string {
  return b64url(random(32));
}

/**
 * The unsubscribe token of a subscription (plan 8 ruling 7). Derived, so every email can carry it while the
 * database keeps only its SHA-256 (unsub_hash).
 */
export function unsubToken(secret: string, subscriptionId: string): Promise<string> {
  return hmacB64url(secret, `unsub:${subscriptionId}`);
}

/** Constant-time comparison for secrets (the cron header). */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
```

- [ ] **Step 6: Write `http.ts`**

`apps/backend/src/http.ts`:

```ts
import { stringify } from '@atropyle/sdk';
import type { Config } from './config';
import { errorText, type Log } from './log';

/** The problem codes of spec §9.6. */
export type ProblemCode = 'INVALID_INPUT' | 'NOT_A_VAULT' | 'RATE_LIMITED' | 'TOKEN_INVALID' | 'UNAUTHORIZED' | 'INTERNAL';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ProblemCode,
    readonly title: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(title);
    this.name = 'HttpError';
  }
}

export const invalid = (title: string) => new HttpError(400, 'INVALID_INPUT', title);

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

/** application/problem+json with exactly the shape of spec §9.6. */
export function problem(status: number, code: ProblemCode, title: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ type: 'about:blank', title, status, code }), {
    status,
    headers: { 'content-type': 'application/problem+json; charset=utf-8', ...headers },
  });
}

/** public: GET open to every origin. site: only the web app's origins. none: server-to-server (cron). */
export type Cors = 'public' | 'site' | 'none';

export interface RouteOptions {
  method: 'GET' | 'POST';
  cors: Cors;
  /** Refuse a request whose Origin header is not the site's. Default: true for cors 'site'. */
  strictOrigin?: boolean;
}

export interface RouteDeps {
  config: Pick<Config, 'allowedOrigins'>;
  log: Log;
}

export type Handler<D> = (req: Request, d: D) => Promise<Response>;

function corsHeaders(cors: Cors, origin: string | null, allowed: readonly string[]): Record<string, string> {
  if (cors === 'public') return { 'access-control-allow-origin': '*' };
  if (cors === 'site' && origin !== null && allowed.includes(origin)) {
    return { 'access-control-allow-origin': origin, vary: 'Origin' };
  }
  return cors === 'site' ? { vary: 'Origin' } : {};
}

/**
 * Method check, CORS (spec §9.2: GET open, POST only from the site), error mapping to problem+json.
 * A request without an Origin header is not a browser request (mail clients, pg_net, curl) and passes.
 */
export function route<D extends RouteDeps>(o: RouteOptions, fn: Handler<D>): Handler<D> {
  const strict = o.strictOrigin ?? o.cors === 'site';
  return async (req, d) => {
    const origin = req.headers.get('origin');
    const foreign = strict && origin !== null && !d.config.allowedOrigins.includes(origin);
    const cors = corsHeaders(o.cors, origin, d.config.allowedOrigins);
    const withCors = (r: Response): Response => {
      for (const [k, v] of Object.entries(cors)) r.headers.set(k, v);
      return r;
    };
    if (req.method === 'OPTIONS') {
      if (o.cors === 'none') return problem(405, 'INVALID_INPUT', 'Method not allowed.', { allow: o.method });
      if (foreign) return problem(403, 'UNAUTHORIZED', 'Origin not allowed.');
      return withCors(
        new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-methods': `${o.method}, OPTIONS`,
            'access-control-allow-headers': 'content-type',
            'access-control-max-age': '86400',
          },
        }),
      );
    }
    if (req.method !== o.method) {
      return withCors(problem(405, 'INVALID_INPUT', 'Method not allowed.', { allow: `${o.method}, OPTIONS` }));
    }
    if (foreign) return problem(403, 'UNAUTHORIZED', 'Origin not allowed.');
    try {
      return withCors(await fn(req, d));
    } catch (e) {
      if (e instanceof HttpError) return withCors(problem(e.status, e.code, e.title, e.headers));
      d.log.error('handler failed', { path: new URL(req.url).pathname, error: errorText(e) });
      return withCors(problem(500, 'INTERNAL', 'Something went wrong. Try again later.'));
    }
  };
}

/** A small JSON object body, or 400 INVALID_INPUT. */
export async function readJson(req: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) throw invalid('The request body is too large.');
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    throw invalid('The request body is not JSON.');
  }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw invalid('The request body must be a JSON object.');
  return v as Record<string, unknown>;
}

/** The caller's IP as Supabase's edge forwards it. Only ever used through an HMAC (spec §9.5). */
export function clientIp(req: Request): string {
  const first = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (first) return first;
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run test/unit/config.test.ts test/unit/crypto.test.ts test/unit/http.test.ts` (from `apps/backend`)
Expected: PASS, 19 tests.

- [ ] **Step 8: Typecheck and lint**

```bash
npx biome check --write apps/backend
npm run typecheck
npx biome ci .
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/types.ts apps/backend/src/config.ts apps/backend/src/clock.ts apps/backend/src/log.ts \
  apps/backend/src/crypto.ts apps/backend/src/http.ts apps/backend/test/unit/config.test.ts \
  apps/backend/test/unit/crypto.test.ts apps/backend/test/unit/http.test.ts
git commit -m "feat(backend): config, clock, log, Web Crypto helpers and the HTTP route wrapper" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 3: Email design system: tokens, copy and the React Email templates

Emails are one of the spec's signature moments (§4.6, §9.4), so design them to be as polished as the site. Every email has the same anatomy:
- a masthead: the "Atropyle" wordmark in Fraunces (falling back to Georgia) and a small chip: a tone dot plus the eyebrow;
- a card whose top edge is **the thread**, a 4 px line drawn with table cells. It is steady while time runs (50%, 80%), frays into four short pieces when something needs attention (due, alarm, vote), and splits into two strands when the vault is released or pays out;
- the heading, one or two short paragraphs, labelled facts (deadline, guardian, transaction, counts), and exactly one button, in thread gold with ink text;
- a quiet "well" with the vault address in 4-character groups, for comparing by eye, and the reader's role;
- a footer that opens with "Atropyle never asks you to sign anything by email" behind a thread-coloured rule, then explains why the email came, gives the one-click unsubscribe link and the beta note.

The light palette is inline and the dark palette comes through `prefers-color-scheme`. There are no images, no web fonts and no external URLs.

**Files:**
- Create: `apps/backend/src/email/theme.ts`, `apps/backend/src/email/kinds.ts`, `apps/backend/src/email/copy.ts`, `apps/backend/src/email/template-types.ts`
- Create: `apps/backend/emails/Thread.tsx`, `apps/backend/emails/Email.tsx`, `apps/backend/emails/text.ts`, `apps/backend/emails/render.tsx`
- Create: `apps/backend/scripts/emails.ts`
- Create (generated): `apps/backend/src/email/templates.gen.ts`
- Modify: `biome.json` (ignore the generated module)
- Test: `apps/backend/test/unit/email-theme.test.ts`, `apps/backend/test/unit/email-copy.test.ts`, `apps/backend/test/unit/email-templates.test.tsx`

**Interfaces:**
- Consumes: `Lang`, `LANGS`, `Role` (Task 2).
- Produces:
  - `theme.ts`: `TONES`, `type Tone`, `interface Palette`, `LIGHT`, `DARK`, `BUTTON`, `FONTS { serif, sans, mono }`, `contrast(a, b): number`
  - `kinds.ts`:
    - `EMAIL_KINDS`, `type EmailKind`, `type ThreadShape = 'steady' | 'frayed' | 'split'`, `THREAD: Record<EmailKind, { tone; progress; shape }>`
    - `FACT_NAMES`, `type FactName = 'deadline' | 'guardian' | 'target' | 'tx' | 'checkIns' | 'alarms'`, `FACTS: Record<EmailKind, readonly FactName[]>`, `MONO_FACTS`
    - `PLACEHOLDERS`, `type Placeholder`
  - `copy.ts`: `interface KindCopy { subject; preheader; eyebrow; heading; body: readonly string[]; cta; note? }`, `interface Copy { kinds; roles; labels; footer; fragments }`, `COPY: Record<Lang, Copy>`
  - `template-types.ts`: `interface Template { subject: string; html: string; text: string }`, `type TemplateSet = Record<EmailKind, Record<Lang, Template>>`
  - `templates.gen.ts`: `TEMPLATES: TemplateSet`
  - `emails/render.tsx`: `renderTemplate(kind, lang): Promise<Template>`, `renderAll(): Promise<TemplateSet>`, `moduleSource(set): string`
  - `emails/Thread.tsx`: `segments(progress, shape)`, `SECOND_STRAND`, `Thread`
  - `emails/Email.tsx`: `Email`, `darkCss()`
  - `emails/text.ts`: `textTemplate(kind, lang): string`

Template placeholders: `{{name}}` is filled with HTML escaping in the HTML, `{{{transfersHtml}}}` is inserted raw (HTML only), and the names come from `PLACEHOLDERS`. Copy strings contain no `& < > " '`, so React prints them verbatim and tests can compare raw copy against HTML.

- [ ] **Step 1: Write the failing theme and copy tests**

`apps/backend/test/unit/email-theme.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BUTTON, contrast, DARK, LIGHT, TONES } from '../../src/email/theme';

describe('email palette (spec §4.3, §11 contrast row)', () => {
  for (const [name, p] of [
    ['light', LIGHT],
    ['dark', DARK],
  ] as const) {
    it(`${name}: ink and muted text reach WCAG AA (4.5:1) on every surface`, () => {
      for (const fg of ['ink', 'muted'] as const) {
        for (const bg of ['bg', 'surface1', 'surface2'] as const) {
          expect(contrast(p[fg], p[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

    it(`${name}: every tone reaches 3:1 as a graphic (thread, dot) on every surface`, () => {
      for (const tone of TONES) {
        for (const bg of ['bg', 'surface1', 'surface2'] as const) {
          expect(contrast(p[tone], p[bg]), `${tone} on ${bg}`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }

  it('the button text reads at AA in both themes', () => {
    expect(contrast(BUTTON.text, BUTTON.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('computes the WCAG ratio', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrast('#777777', '#777777')).toBe(1);
  });
});
```

`apps/backend/test/unit/email-copy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { COPY } from '../../src/email/copy';
import { EMAIL_KINDS, PLACEHOLDERS } from '../../src/email/kinds';
import { LANGS } from '../../src/types';

const strings = (o: unknown): string[] => {
  if (typeof o === 'string') return [o];
  if (Array.isArray(o)) return o.flatMap(strings);
  if (o !== null && typeof o === 'object') return Object.values(o).flatMap(strings);
  return [];
};
const slots = (s: string) => [...s.matchAll(/\{\{([A-Za-z]+)\}\}/g)].map((m) => m[1]);

describe('email copy (spec §9.4: every template in EN and VI)', () => {
  it('has every kind in both languages, with no empty string', () => {
    for (const lang of LANGS) {
      expect(Object.keys(COPY[lang].kinds).sort()).toEqual([...EMAIL_KINDS].sort());
      for (const s of strings(COPY[lang])) expect(s.trim()).not.toBe('');
    }
  });

  it('has the same shape in both languages', () => {
    for (const kind of EMAIL_KINDS) {
      const en = COPY.en.kinds[kind];
      const vi = COPY.vi.kinds[kind];
      expect(vi.body.length, kind).toBe(en.body.length);
      expect(vi.note === undefined, kind).toBe(en.note === undefined);
      expect(slots(vi.subject).sort(), kind).toEqual(slots(en.subject).sort());
      expect(slots(vi.body.join(' ')).sort(), kind).toEqual(slots(en.body.join(' ')).sort());
    }
    expect(Object.keys(COPY.vi.fragments).sort()).toEqual(Object.keys(COPY.en.fragments).sort());
  });

  it('translates every subject, heading and body', () => {
    for (const kind of EMAIL_KINDS) {
      const en = COPY.en.kinds[kind];
      const vi = COPY.vi.kinds[kind];
      expect(vi.subject, kind).not.toBe(en.subject);
      expect(vi.heading, kind).not.toBe(en.heading);
      expect(vi.body.join(' '), kind).not.toBe(en.body.join(' '));
    }
  });

  it('contains no character that HTML would escape, so templates print it verbatim', () => {
    for (const lang of LANGS) for (const s of strings(COPY[lang])) expect(s).not.toMatch(/[&<>"']/);
  });

  it('uses only known placeholders; fragments use only their own', () => {
    for (const lang of LANGS) {
      const c = COPY[lang];
      for (const s of strings([c.kinds, c.labels, c.footer, c.roles])) {
        for (const name of slots(s)) expect(PLACEHOLDERS as readonly string[]).toContain(name);
      }
      const f = c.fragments;
      for (const s of [
        f.alarmOwnerInheritance,
        f.alarmOwnerRecovery,
        f.alarmGuardianInheritance,
        f.alarmGuardianRecovery,
        f.releasedInheritance,
        f.releasedRecovery,
        f.summaryReleased,
        f.summaryNotReleased,
      ]) {
        expect(slots(s)).toEqual([]);
      }
      for (const s of [f.transferErc20, f.transferErc721, f.transferErc1155, f.transferUnknown]) {
        for (const name of slots(s)) expect(['amount', 'token', 'id', 'to']).toContain(name);
      }
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/unit/email-theme.test.ts test/unit/email-copy.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/email/theme` and `../../src/email/copy` do not exist.

- [ ] **Step 3: Write the tokens and the kinds**

`apps/backend/src/email/theme.ts`:

```ts
export const TONES = ['thread', 'alive', 'grace', 'recovery', 'release', 'danger'] as const;
export type Tone = (typeof TONES)[number];

export interface Palette extends Record<Tone, string> {
  bg: string;
  surface1: string;
  surface2: string;
  surface3: string;
  ink: string;
  muted: string;
}

/** Spec §4.3, dark column. */
export const DARK: Palette = {
  bg: '#0B0D12',
  surface1: '#12151C',
  surface2: '#181C25',
  surface3: '#20252F',
  ink: '#ECE7DD',
  muted: '#A59F94',
  thread: '#E8B65A',
  alive: '#5CC8B0',
  grace: '#F0A23B',
  recovery: '#7FA8FF',
  release: '#B7A6FF',
  danger: '#FF6B5E',
};

/** Spec §4.3, light column: the inline default of every email (clients without dark-mode CSS show this). */
export const LIGHT: Palette = {
  bg: '#F6F1E7',
  surface1: '#FFFDF8',
  surface2: '#F0EADF',
  surface3: '#E7DFD1',
  ink: '#16130F',
  muted: '#5E574C',
  thread: '#A86F12',
  alive: '#127A63',
  grace: '#A35A00',
  recovery: '#2E5BC7',
  release: '#5B44C9',
  danger: '#B42318',
};

/** The one button: dark-theme thread gold with ink text reads the same in both themes (9.9:1). */
export const BUTTON = { background: '#E8B65A', text: '#16130F' } as const;

/**
 * Spec §4.2 faces with system fallbacks: mail clients load no web font (no third-party fetch, spec §8).
 * No quotes in the stacks, so they can sit inside a style attribute and inside <style> unescaped.
 */
export const FONTS = {
  serif: 'Fraunces, Georgia, Times New Roman, serif',
  sans: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  mono: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
} as const;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio of two #RRGGBB colours. */
export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
```

`apps/backend/src/email/kinds.ts`:

```ts
import type { Tone } from './theme';

/** Spec §9.4: the twelve templates. */
export const EMAIL_KINDS = [
  'confirm',
  'welcome',
  'checkin-50',
  'checkin-80',
  'checkin-due',
  'alarm-owner',
  'alarm-guardian',
  'alarm-heir',
  'recovery-vote',
  'released',
  'distributed',
  'drill-summary',
] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

/** The thread at the top of the card: steady while time runs, frayed when action is needed, split once released. */
export type ThreadShape = 'steady' | 'frayed' | 'split';

export const THREAD: Record<EmailKind, { tone: Tone; progress: number; shape: ThreadShape }> = {
  confirm: { tone: 'thread', progress: 12, shape: 'steady' },
  welcome: { tone: 'alive', progress: 100, shape: 'steady' },
  'checkin-50': { tone: 'alive', progress: 50, shape: 'steady' },
  'checkin-80': { tone: 'grace', progress: 80, shape: 'steady' },
  'checkin-due': { tone: 'grace', progress: 100, shape: 'frayed' },
  'alarm-owner': { tone: 'danger', progress: 100, shape: 'frayed' },
  'alarm-guardian': { tone: 'grace', progress: 100, shape: 'frayed' },
  'alarm-heir': { tone: 'grace', progress: 100, shape: 'frayed' },
  'recovery-vote': { tone: 'recovery', progress: 60, shape: 'frayed' },
  released: { tone: 'release', progress: 100, shape: 'split' },
  distributed: { tone: 'release', progress: 100, shape: 'split' },
  'drill-summary': { tone: 'thread', progress: 100, shape: 'steady' },
};

export const FACT_NAMES = ['deadline', 'guardian', 'target', 'tx', 'checkIns', 'alarms'] as const;
export type FactName = (typeof FACT_NAMES)[number];

/** Labelled facts each email shows above its button. */
export const FACTS: Record<EmailKind, readonly FactName[]> = {
  confirm: [],
  welcome: [],
  'checkin-50': ['deadline'],
  'checkin-80': ['deadline'],
  'checkin-due': ['deadline'],
  'alarm-owner': ['deadline'],
  'alarm-guardian': ['deadline'],
  'alarm-heir': ['deadline'],
  'recovery-vote': ['guardian', 'target'],
  released: ['tx'],
  distributed: ['tx'],
  'drill-summary': ['checkIns', 'alarms'],
};

/** Facts printed in the monospace face (addresses and hashes). */
export const MONO_FACTS: ReadonlySet<FactName> = new Set(['guardian', 'target', 'tx']);

/** Every placeholder a template may use. {{name}} is HTML-escaped; {{{transfersHtml}}} is raw and HTML-only. */
export const PLACEHOLDERS = [
  'siteUrl',
  'siteHost',
  'vault',
  'vaultShort',
  'vaultGrouped',
  'roleLabel',
  'unsubscribeUrl',
  'actionUrl',
  'deadline',
  'reason',
  'guardian',
  'target',
  'tx',
  'txShort',
  'transfersHtml',
  'transfersText',
  'checkIns',
  'alarms',
  'outcome',
] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
```

- [ ] **Step 4: Write the copy (EN and VI)**

`apps/backend/src/email/copy.ts`:

```ts
import type { Lang, Role } from '../types';
import type { EmailKind, FactName } from './kinds';

export interface KindCopy {
  subject: string;
  /** Inbox preview line. */
  preheader: string;
  /** Short label in the chip next to the wordmark. */
  eyebrow: string;
  heading: string;
  body: readonly string[];
  cta: string;
  note?: string;
}

export interface Copy {
  kinds: Record<EmailKind, KindCopy>;
  /** Lowercase: used inside sentences ("as its owner") and in the facts well. */
  roles: Record<Role, string>;
  labels: Record<FactName | 'vault' | 'role' | 'compare' | 'transfers', string>;
  footer: { never: string; why: string; unsubscribe: string; beta: string };
  /** Filled into {{reason}} and {{outcome}}, and the payout lines ({{amount}}, {{token}}, {{id}}, {{to}}). */
  fragments: {
    alarmOwnerInheritance: string;
    alarmOwnerRecovery: string;
    alarmGuardianInheritance: string;
    alarmGuardianRecovery: string;
    releasedInheritance: string;
    releasedRecovery: string;
    summaryReleased: string;
    summaryNotReleased: string;
    transferErc20: string;
    transferErc721: string;
    transferErc1155: string;
    transferUnknown: string;
  };
}

const en: Copy = {
  kinds: {
    confirm: {
      subject: 'Confirm alerts for vault {{vaultShort}}',
      preheader: 'One click, and we will tell you when this vault needs you.',
      eyebrow: 'Confirm',
      heading: 'Confirm your alerts',
      body: [
        'Someone, hopefully you, asked for alerts about this Atropyle vault, as its {{roleLabel}}.',
        'Confirm to start. If it was not you, ignore this email: nothing is sent until you confirm, and the request is deleted after 48 hours.',
      ],
      cta: 'Confirm alerts',
    },
    welcome: {
      subject: 'Alerts are on for vault {{vaultShort}}',
      preheader: 'We write when this vault needs you, and only then.',
      eyebrow: 'Subscribed',
      heading: 'You will hear from us when it matters',
      body: [
        'Alerts are on for this vault, for you as its {{roleLabel}}.',
        'We write when a check-in is coming due, when an alarm is raised, when a guardian votes, and when assets are released or paid out. Nothing else.',
      ],
      cta: 'Open the vault',
    },
    'checkin-50': {
      subject: 'Halfway to your next check-in, vault {{vaultShort}}',
      preheader: 'Check in before {{deadline}} and nothing happens.',
      eyebrow: 'Check-in 50%',
      heading: 'Halfway to your next check-in',
      body: [
        'Half of the time before your next check-in has passed.',
        'Check in before {{deadline}}. One transaction from the owner wallet resets the clock.',
      ],
      cta: 'Check in',
    },
    'checkin-80': {
      subject: 'Check in soon, vault {{vaultShort}}',
      preheader: '80% of the time has passed. Deadline {{deadline}}.',
      eyebrow: 'Check-in 80%',
      heading: 'Your check-in is coming due',
      body: [
        '80% of the time before your next check-in has passed.',
        'Check in before {{deadline}}. After that, anyone can raise the alarm on this vault.',
      ],
      cta: 'Check in now',
    },
    'checkin-due': {
      subject: 'Check-in due now, vault {{vaultShort}}',
      preheader: 'The deadline was {{deadline}}. Check in to stop the alarm.',
      eyebrow: 'Check-in due',
      heading: 'Your check-in is due',
      body: [
        'The check-in deadline was {{deadline}}. From now on, anyone can raise the alarm on this vault.',
        'Check in from the owner wallet now. It stops the alarm before it starts.',
      ],
      cta: 'Check in now',
    },
    'alarm-owner': {
      subject: 'Alarm raised on your vault {{vaultShort}}',
      preheader: 'Check in before {{deadline}} to cancel it.',
      eyebrow: 'Alarm',
      heading: 'An alarm was raised on your vault',
      body: [
        '{{reason}}',
        'If you are reading this, check in before {{deadline}}. One check-in from the owner wallet cancels the alarm, and nothing moves.',
      ],
      cta: 'Check in to cancel',
      note: 'If you did not expect this, find out who holds your keys before anything else.',
    },
    'alarm-guardian': {
      subject: 'Alarm on a vault you guard, {{vaultShort}}',
      preheader: 'The window closes at {{deadline}}.',
      eyebrow: 'Alarm',
      heading: 'A vault you guard raised an alarm',
      body: [
        '{{reason}}',
        'The owner can still cancel it by checking in before {{deadline}}. Try to reach them, then open the vault page to see what you can do as a guardian.',
      ],
      cta: 'Open the vault',
    },
    'alarm-heir': {
      subject: 'Vault {{vaultShort}}: the inheritance window has started',
      preheader: 'Nothing to do yet. The window closes at {{deadline}}.',
      eyebrow: 'Alarm',
      heading: 'The inheritance window has started',
      body: [
        'The owner of this vault missed their check-in, so the alarm was raised. If they check in before {{deadline}}, nothing changes.',
        'If they do not, the vault releases its assets to its heirs after that time. You do not need to do anything now, and nobody will ask you to sign or to pay.',
      ],
      cta: 'Open the vault',
    },
    'recovery-vote': {
      subject: 'A guardian voted to recover your vault {{vaultShort}}',
      preheader: 'Check the proposed wallet. If it is not yours, act now.',
      eyebrow: 'Recovery vote',
      heading: 'A guardian voted to recover your vault',
      body: [
        'A guardian voted to move this vault to a new wallet. If enough guardians agree, a recovery window starts.',
        'If you did not ask for this, open the vault page now, while you still hold the owner wallet.',
      ],
      cta: 'Open the vault',
    },
    released: {
      subject: 'Vault {{vaultShort}} was released',
      preheader: '{{outcome}}',
      eyebrow: 'Released',
      heading: 'This vault was released',
      body: [
        '{{outcome}}',
        'Assets are paid out by distribute, which anyone can call, our keeper included. You get another email when a payout lands.',
      ],
      cta: 'Open the vault',
    },
    distributed: {
      subject: 'Assets paid out from vault {{vaultShort}}',
      preheader: 'A payout landed. The details are inside.',
      eyebrow: 'Paid out',
      heading: 'A payout landed',
      body: ['This vault paid out in transaction {{txShort}}.'],
      cta: 'Open the vault',
      note: 'Check the amounts in your wallet. Token names are left out on purpose: compare each token address with the vault page.',
    },
    'drill-summary': {
      subject: 'How your Drill went, vault {{vaultShort}}',
      preheader: 'Your 7-day Drill has ended. Here is what happened.',
      eyebrow: 'Drill complete',
      heading: 'Your Drill has ended',
      body: [
        'Your Drill vault ran its full 7 days and has now expired. {{outcome}}',
        'When you are ready, create a real vault. The rules are the same; only the timing is yours to choose.',
      ],
      cta: 'Create a real vault',
    },
  },
  roles: { owner: 'owner', guardian: 'guardian', heir: 'heir' },
  labels: {
    vault: 'Vault',
    role: 'Your role',
    compare: 'Compare this address with the one on the vault page before you act.',
    deadline: 'Deadline',
    guardian: 'Guardian',
    target: 'Proposed wallet',
    tx: 'Transaction',
    checkIns: 'Check-ins',
    alarms: 'Alarms',
    transfers: 'Paid out',
  },
  footer: {
    never: 'Atropyle never asks you to sign anything by email. Every action happens on the vault page, in your own wallet.',
    why: 'You get this email because this address subscribed to alerts for this vault on {{siteHost}}.',
    unsubscribe: 'Unsubscribe from this vault',
    beta: 'Atropyle is in beta on X Layer. Alerts are best effort: the chain, not this email, is the source of truth.',
  },
  fragments: {
    alarmOwnerInheritance: 'Your vault missed its check-in, so the inheritance window has started.',
    alarmOwnerRecovery: 'Your guardians voted to move this vault to a new wallet, so the recovery window has started.',
    alarmGuardianInheritance: 'The owner missed their check-in, so the inheritance window has started.',
    alarmGuardianRecovery: 'Guardians voted to recover this vault, so the recovery window has started.',
    releasedInheritance: 'The inheritance window closed without a check-in, so the vault now belongs to its heirs.',
    releasedRecovery: 'The recovery window closed, so the vault now pays out to the recovery wallet.',
    summaryReleased: 'It went all the way: the alarm, the window and the release.',
    summaryNotReleased: 'It never reached release: your check-ins kept it alive.',
    transferErc20: '{{amount}} of token {{token}} to {{to}}',
    transferErc721: 'Token #{{id}} of {{token}} to {{to}}',
    transferErc1155: '{{amount}} of token #{{id}} of {{token}} to {{to}}',
    transferUnknown: 'Asset #{{id}} ({{amount}}) to {{to}}',
  },
};

const vi: Copy = {
  kinds: {
    confirm: {
      subject: 'Xác nhận nhận thông báo cho vault {{vaultShort}}',
      preheader: 'Một cú bấm, và chúng tôi sẽ báo khi vault này cần bạn.',
      eyebrow: 'Xác nhận',
      heading: 'Xác nhận nhận thông báo',
      body: [
        'Có người, hy vọng là bạn, đã đăng ký nhận thông báo cho vault Atropyle này với vai trò {{roleLabel}}.',
        'Hãy xác nhận để bắt đầu. Nếu không phải bạn, cứ bỏ qua email này: chúng tôi không gửi gì cho tới khi bạn xác nhận, và yêu cầu sẽ bị xoá sau 48 giờ.',
      ],
      cta: 'Xác nhận',
    },
    welcome: {
      subject: 'Đã bật thông báo cho vault {{vaultShort}}',
      preheader: 'Chúng tôi chỉ viết khi vault này cần bạn.',
      eyebrow: 'Đã đăng ký',
      heading: 'Chúng tôi sẽ báo khi có việc quan trọng',
      body: [
        'Thông báo đã bật cho vault này, với vai trò {{roleLabel}} của bạn.',
        'Chúng tôi viết khi sắp tới hạn check-in, khi có báo động, khi người giám hộ bỏ phiếu, và khi tài sản được giải phóng hoặc chi trả. Ngoài ra không có gì khác.',
      ],
      cta: 'Mở vault',
    },
    'checkin-50': {
      subject: 'Đã qua nửa chặng tới lần check-in kế tiếp, vault {{vaultShort}}',
      preheader: 'Check-in trước {{deadline}} là mọi thứ giữ nguyên.',
      eyebrow: 'Check-in 50%',
      heading: 'Đã qua nửa chặng tới lần check-in',
      body: [
        'Một nửa thời gian trước lần check-in kế tiếp đã trôi qua.',
        'Hãy check-in trước {{deadline}}. Một giao dịch từ ví chủ là đủ để đặt lại đồng hồ.',
      ],
      cta: 'Check-in',
    },
    'checkin-80': {
      subject: 'Sắp tới hạn check-in, vault {{vaultShort}}',
      preheader: 'Đã qua 80% thời gian. Hạn chót {{deadline}}.',
      eyebrow: 'Check-in 80%',
      heading: 'Sắp tới hạn check-in',
      body: [
        '80% thời gian trước lần check-in kế tiếp đã trôi qua.',
        'Hãy check-in trước {{deadline}}. Sau mốc đó, bất kỳ ai cũng có thể bật báo động cho vault này.',
      ],
      cta: 'Check-in ngay',
    },
    'checkin-due': {
      subject: 'Đã tới hạn check-in, vault {{vaultShort}}',
      preheader: 'Hạn chót là {{deadline}}. Check-in để chặn báo động.',
      eyebrow: 'Tới hạn',
      heading: 'Đã tới hạn check-in',
      body: [
        'Hạn check-in là {{deadline}}. Từ giờ, bất kỳ ai cũng có thể bật báo động cho vault này.',
        'Hãy check-in từ ví chủ ngay bây giờ để chặn báo động trước khi nó bắt đầu.',
      ],
      cta: 'Check-in ngay',
    },
    'alarm-owner': {
      subject: 'Vault {{vaultShort}} của bạn đang báo động',
      preheader: 'Check-in trước {{deadline}} để huỷ.',
      eyebrow: 'Báo động',
      heading: 'Vault của bạn đang báo động',
      body: [
        '{{reason}}',
        'Nếu bạn đang đọc thư này, hãy check-in trước {{deadline}}. Một lần check-in từ ví chủ sẽ huỷ báo động, và không tài sản nào bị chuyển đi.',
      ],
      cta: 'Check-in để huỷ',
      note: 'Nếu bạn không lường trước chuyện này, trước hết hãy kiểm tra xem ai đang giữ khoá ví của bạn.',
    },
    'alarm-guardian': {
      subject: 'Vault bạn giám hộ đang báo động, {{vaultShort}}',
      preheader: 'Cửa sổ đóng lúc {{deadline}}.',
      eyebrow: 'Báo động',
      heading: 'Vault bạn giám hộ đang báo động',
      body: [
        '{{reason}}',
        'Chủ ví vẫn có thể huỷ bằng cách check-in trước {{deadline}}. Hãy thử liên lạc với họ, rồi mở trang vault để xem bạn có thể làm gì với vai trò giám hộ.',
      ],
      cta: 'Mở vault',
    },
    'alarm-heir': {
      subject: 'Vault {{vaultShort}}: cửa sổ thừa kế đã bắt đầu',
      preheader: 'Bạn chưa cần làm gì. Cửa sổ đóng lúc {{deadline}}.',
      eyebrow: 'Báo động',
      heading: 'Cửa sổ thừa kế đã bắt đầu',
      body: [
        'Chủ của vault này đã lỡ hạn check-in, nên báo động đã bật. Nếu họ check-in trước {{deadline}}, mọi thứ giữ nguyên.',
        'Nếu không, sau mốc đó vault sẽ giải phóng tài sản cho người thừa kế. Bạn chưa cần làm gì, và sẽ không ai yêu cầu bạn ký hay trả tiền.',
      ],
      cta: 'Mở vault',
    },
    'recovery-vote': {
      subject: 'Một người giám hộ bỏ phiếu khôi phục vault {{vaultShort}} của bạn',
      preheader: 'Hãy kiểm tra ví được đề xuất. Nếu không phải ví của bạn, hãy hành động ngay.',
      eyebrow: 'Phiếu khôi phục',
      heading: 'Một người giám hộ bỏ phiếu khôi phục vault của bạn',
      body: [
        'Một người giám hộ đã bỏ phiếu chuyển vault này sang một ví mới. Nếu đủ số người giám hộ đồng ý, cửa sổ khôi phục sẽ bắt đầu.',
        'Nếu bạn không yêu cầu việc này, hãy mở trang vault ngay, khi bạn vẫn còn giữ ví chủ.',
      ],
      cta: 'Mở vault',
    },
    released: {
      subject: 'Vault {{vaultShort}} đã được giải phóng',
      preheader: '{{outcome}}',
      eyebrow: 'Đã giải phóng',
      heading: 'Vault này đã được giải phóng',
      body: [
        '{{outcome}}',
        'Tài sản được chi trả bằng lệnh distribute, ai cũng gọi được, kể cả keeper của chúng tôi. Bạn sẽ nhận thêm một email khi khoản chi trả về tới.',
      ],
      cta: 'Mở vault',
    },
    distributed: {
      subject: 'Tài sản đã được chi trả từ vault {{vaultShort}}',
      preheader: 'Một khoản chi trả đã về. Chi tiết ở bên trong.',
      eyebrow: 'Đã chi trả',
      heading: 'Một khoản chi trả đã về',
      body: ['Vault này đã chi trả trong giao dịch {{txShort}}.'],
      cta: 'Mở vault',
      note: 'Hãy kiểm tra số dư trong ví. Tên token cố ý không hiển thị ở đây: hãy đối chiếu từng địa chỉ token với trang vault.',
    },
    'drill-summary': {
      subject: 'Drill của bạn đã chạy thế nào, vault {{vaultShort}}',
      preheader: 'Drill 7 ngày đã kết thúc. Đây là những gì đã xảy ra.',
      eyebrow: 'Drill kết thúc',
      heading: 'Drill của bạn đã kết thúc',
      body: [
        'Vault Drill đã chạy đủ 7 ngày và giờ đã hết hạn. {{outcome}}',
        'Khi sẵn sàng, hãy tạo một vault thật. Luật vẫn như cũ; chỉ có nhịp thời gian là do bạn chọn.',
      ],
      cta: 'Tạo vault thật',
    },
  },
  roles: { owner: 'chủ ví', guardian: 'người giám hộ', heir: 'người thừa kế' },
  labels: {
    vault: 'Vault',
    role: 'Vai trò của bạn',
    compare: 'Hãy đối chiếu địa chỉ này với địa chỉ trên trang vault trước khi làm gì.',
    deadline: 'Hạn chót',
    guardian: 'Người giám hộ',
    target: 'Ví được đề xuất',
    tx: 'Giao dịch',
    checkIns: 'Lần check-in',
    alarms: 'Lần báo động',
    transfers: 'Đã chi trả',
  },
  footer: {
    never:
      'Atropyle không bao giờ yêu cầu bạn ký bất cứ thứ gì qua email. Mọi thao tác đều diễn ra trên trang vault, trong ví của chính bạn.',
    why: 'Bạn nhận email này vì địa chỉ này đã đăng ký nhận thông báo cho vault trên {{siteHost}}.',
    unsubscribe: 'Huỷ đăng ký vault này',
    beta: 'Atropyle đang chạy beta trên X Layer. Thông báo chỉ mang tính hỗ trợ: chain mới là nguồn sự thật, không phải email này.',
  },
  fragments: {
    alarmOwnerInheritance: 'Vault của bạn đã lỡ hạn check-in, nên cửa sổ thừa kế đã bắt đầu.',
    alarmOwnerRecovery: 'Các người giám hộ đã bỏ phiếu chuyển vault này sang một ví mới, nên cửa sổ khôi phục đã bắt đầu.',
    alarmGuardianInheritance: 'Chủ ví đã lỡ hạn check-in, nên cửa sổ thừa kế đã bắt đầu.',
    alarmGuardianRecovery: 'Các người giám hộ đã bỏ phiếu khôi phục vault này, nên cửa sổ khôi phục đã bắt đầu.',
    releasedInheritance: 'Cửa sổ thừa kế đã đóng mà không có lần check-in nào, nên vault giờ thuộc về người thừa kế.',
    releasedRecovery: 'Cửa sổ khôi phục đã đóng, nên vault giờ chi trả cho ví khôi phục.',
    summaryReleased: 'Vault đã đi hết hành trình: báo động, cửa sổ chờ và giải phóng.',
    summaryNotReleased: 'Vault chưa từng tới bước giải phóng: các lần check-in đã giữ nó sống.',
    transferErc20: '{{amount}} token {{token}} cho {{to}}',
    transferErc721: 'Token #{{id}} của {{token}} cho {{to}}',
    transferErc1155: '{{amount}} token #{{id}} của {{token}} cho {{to}}',
    transferUnknown: 'Tài sản #{{id}} ({{amount}}) cho {{to}}',
  },
};

export const COPY: Record<Lang, Copy> = { en, vi };
```

- [ ] **Step 5: Run the theme and copy tests to verify they pass**

Run: `npx vitest run test/unit/email-theme.test.ts test/unit/email-copy.test.ts` (from `apps/backend`)
Expected: PASS, 11 tests.

- [ ] **Step 6: Write the failing template test**

`apps/backend/test/unit/email-templates.test.tsx`:

```tsx
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { moduleSource, renderAll } from '../../emails/render';
import { SECOND_STRAND, segments } from '../../emails/Thread';
import { COPY } from '../../src/email/copy';
import { EMAIL_KINDS, PLACEHOLDERS, THREAD } from '../../src/email/kinds';
import { TEMPLATES } from '../../src/email/templates.gen';
import { LANGS } from '../../src/types';

const GEN = fileURLToPath(new URL('../../src/email/templates.gen.ts', import.meta.url));
const SLOT = /\{\{\{([A-Za-z]+)\}\}\}|\{\{([A-Za-z]+)\}\}/g;
const slots = (s: string) => [...s.matchAll(SLOT)].map((m) => ({ raw: m[1] !== undefined, name: m[1] ?? m[2] }));

describe('generated email templates (spec §9.4)', () => {
  it('match the React Email source: run `npm run emails -w apps/backend` after any change', async () => {
    const want = moduleSource(await renderAll());
    expect(readFileSync(GEN, 'utf8').replace(/\r\n/g, '\n')).toBe(want);
  });

  for (const kind of EMAIL_KINDS) {
    for (const lang of LANGS) {
      describe(`${kind}.${lang}`, () => {
        const t = TEMPLATES[kind][lang];

        it('has exactly one button to the action URL and one unsubscribe link', () => {
          const hrefs = [...t.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
          expect(hrefs.sort()).toEqual(['{{actionUrl}}', '{{unsubscribeUrl}}']);
        });

        it('declares its language and the dark palette, and loads nothing', () => {
          expect(t.html).toContain(`lang="${lang}"`);
          expect(t.html).toContain('@media (prefers-color-scheme: dark)');
          expect(t.html).not.toMatch(/<img|\ssrc=|url\(|@import|<link/i);
        });

        it('says that Atropyle never asks for a signature by email', () => {
          expect(t.html).toContain(COPY[lang].footer.never);
          expect(t.text).toContain(COPY[lang].footer.never);
        });

        it('uses only known placeholders, and raw HTML only for the payout list', () => {
          for (const s of [...slots(t.subject), ...slots(t.html), ...slots(t.text)]) {
            expect(PLACEHOLDERS as readonly string[]).toContain(s.name);
          }
          expect(slots(t.subject).some((s) => s.raw)).toBe(false);
          expect(slots(t.text).some((s) => s.raw)).toBe(false);
          expect(slots(t.html).filter((s) => s.raw).map((s) => s.name)).toEqual(
            kind === 'distributed' ? ['transfersHtml'] : [],
          );
        });

        it('prints the vault address and the role for comparison', () => {
          expect(t.html).toContain('{{vaultGrouped}}');
          expect(t.html).toContain('{{roleLabel}}');
          expect(t.text).toContain('{{vault}}');
          expect(t.text).toContain('{{actionUrl}}');
          expect(t.text).toContain('{{unsubscribeUrl}}');
          expect(t.text).not.toMatch(/<[a-z]/i);
        });
      });
    }
  }

  it('draws every thread with cells that add up to 100%', () => {
    for (const kind of EMAIL_KINDS) {
      const { progress, shape } = THREAD[kind];
      for (const cells of [segments(progress, shape), SECOND_STRAND]) {
        expect(cells.reduce((n, s) => n + s.width, 0), kind).toBe(100);
        expect(new Set(cells.map((s) => s.id)).size, kind).toBe(cells.length);
      }
    }
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run test/unit/email-templates.test.tsx` (from `apps/backend`)
Expected: FAIL with `Failed to load url ../../emails/render` (and `../../src/email/templates.gen`).

- [ ] **Step 8: Write the template types, the thread and the layout**

`apps/backend/src/email/template-types.ts`:

```ts
import type { Lang } from '../types';
import type { EmailKind } from './kinds';

/** One rendered template with {{placeholders}} (see kinds.ts PLACEHOLDERS). */
export interface Template {
  subject: string;
  html: string;
  text: string;
}

export type TemplateSet = Record<EmailKind, Record<Lang, Template>>;
```

`apps/backend/emails/Thread.tsx`:

```tsx
import { Column, Row, Section } from '@react-email/components';
import type { ThreadShape } from '../src/email/kinds';
import { LIGHT, type Tone } from '../src/email/theme';

export interface Segment {
  id: string;
  /** Percent of the card width. */
  width: number;
  kind: 'tone' | 'gap' | 'track';
}

/** Cells of one strand: steady (done, then the track), or frayed into four short pieces before its end. */
export function segments(progress: number, shape: ThreadShape): Segment[] {
  const p = Math.max(0, Math.min(100, Math.round(progress)));
  if (shape === 'split') return [{ id: 'whole', width: 100, kind: 'tone' }];
  const out: Segment[] = [];
  if (shape === 'steady') {
    if (p > 0) out.push({ id: 'done', width: p, kind: 'tone' });
    if (p < 100) out.push({ id: 'rest', width: 100 - p, kind: 'track' });
    return out;
  }
  if (p > 16) out.push({ id: 'done', width: p - 16, kind: 'tone' });
  for (const i of [1, 2, 3, 4]) {
    out.push({ id: `fray-${i}`, width: 3, kind: 'tone' }, { id: `gap-${i}`, width: 1, kind: 'gap' });
  }
  if (p < 100) out.push({ id: 'rest', width: 100 - Math.max(p, 16), kind: 'track' });
  return out;
}

/** The second strand of a split thread starts a little to the right, like a thread parting in two. */
export const SECOND_STRAND: readonly Segment[] = [
  { id: 'lead', width: 14, kind: 'gap' },
  { id: 'tail', width: 86, kind: 'tone' },
];

function classOf(kind: Segment['kind'], tone: Tone): string {
  if (kind === 'tone') return `at-fill-${tone}`;
  return kind === 'gap' ? 'at-gap' : 'at-track';
}

function colorOf(kind: Segment['kind'], tone: Tone): string {
  if (kind === 'tone') return LIGHT[tone];
  return kind === 'gap' ? LIGHT.surface1 : LIGHT.surface3;
}

function Strand({ tone, cells }: { tone: Tone; cells: readonly Segment[] }) {
  return (
    <Row>
      {cells.map((s) => (
        <Column
          key={s.id}
          className={classOf(s.kind, tone)}
          style={{
            width: `${s.width}%`,
            height: '4px',
            fontSize: '0',
            lineHeight: '0',
            backgroundColor: colorOf(s.kind, tone),
          }}
        >
          {' '}
        </Column>
      ))}
    </Row>
  );
}

/** The thread motif (spec §4.1) as table cells: no images, so every mail client draws it. */
export function Thread({ tone, progress, shape }: { tone: Tone; progress: number; shape: ThreadShape }) {
  return (
    <Section>
      <Strand tone={tone} cells={segments(progress, shape)} />
      {shape === 'split' ? (
        <>
          <Row>
            <Column style={{ height: '3px', fontSize: '0', lineHeight: '0' }}>{' '}</Column>
          </Row>
          <Strand tone={tone} cells={SECOND_STRAND} />
        </>
      ) : null}
    </Section>
  );
}
```

`apps/backend/emails/Email.tsx`:

```tsx
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components';
import { type CSSProperties, Fragment } from 'react';
import { COPY } from '../src/email/copy';
import { type EmailKind, FACTS, MONO_FACTS, THREAD } from '../src/email/kinds';
import { BUTTON, DARK, FONTS, LIGHT, TONES } from '../src/email/theme';
import type { Lang } from '../src/types';
import { Thread } from './Thread';

const SERIF = FONTS.serif;
const SANS = FONTS.sans;
const MONO = FONTS.mono;

/**
 * The dark set of spec §4.3 for clients that honour prefers-color-scheme (Apple Mail, Outlook on Mac and iOS).
 * Inline styles carry the light set. No quotes or angle brackets here: React may escape them inside <style>.
 */
export function darkCss(): string {
  const tones = TONES.map(
    (t) => `.at-fill-${t}{background-color:${DARK[t]} !important}.at-text-${t}{color:${DARK[t]} !important}`,
  ).join('');
  return [
    ':root{color-scheme:light dark;supported-color-schemes:light dark}',
    '@media (prefers-color-scheme: dark){',
    `.at-bg{background-color:${DARK.bg} !important}`,
    `.at-card{background-color:${DARK.surface1} !important;border-color:${DARK.surface3} !important}`,
    `.at-well{background-color:${DARK.surface2} !important}`,
    `.at-gap{background-color:${DARK.surface1} !important}`,
    `.at-track{background-color:${DARK.surface3} !important}`,
    `.at-ink{color:${DARK.ink} !important}`,
    `.at-muted{color:${DARK.muted} !important}`,
    `.at-never{border-left-color:${DARK.thread} !important}`,
    tones,
    '}',
  ].join('');
}

const st = {
  body: { backgroundColor: LIGHT.bg, color: LIGHT.ink, fontFamily: SANS, margin: '0', padding: '32px 0 40px' },
  container: { maxWidth: '560px', margin: '0 auto', padding: '0 16px' },
  masthead: { padding: '0 4px 18px' },
  wordmark: {
    fontFamily: SERIF,
    fontSize: '22px',
    lineHeight: '28px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: LIGHT.ink,
    margin: '0',
  },
  chip: {
    fontFamily: MONO,
    fontSize: '11px',
    lineHeight: '28px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    textAlign: 'right',
    margin: '0',
  },
  card: {
    backgroundColor: LIGHT.surface1,
    border: `1px solid ${LIGHT.surface3}`,
    borderRadius: '16px',
    overflow: 'hidden',
  },
  inner: { padding: '28px 32px 8px' },
  h1: {
    fontFamily: SERIF,
    fontSize: '28px',
    lineHeight: '34px',
    fontWeight: 600,
    letterSpacing: '-0.015em',
    color: LIGHT.ink,
    margin: '0 0 16px',
  },
  p: { fontSize: '16px', lineHeight: '26px', color: LIGHT.ink, margin: '0 0 14px' },
  facts: { padding: '4px 0 6px' },
  label: {
    fontFamily: MONO,
    fontSize: '11px',
    lineHeight: '16px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: LIGHT.muted,
    margin: '0',
  },
  value: { fontSize: '16px', lineHeight: '24px', color: LIGHT.ink, margin: '2px 0 14px' },
  mono: {
    fontFamily: MONO,
    fontSize: '14px',
    lineHeight: '22px',
    color: LIGHT.ink,
    margin: '2px 0 14px',
    wordBreak: 'break-all',
  },
  cta: { padding: '10px 0 22px' },
  button: {
    backgroundColor: BUTTON.background,
    color: BUTTON.text,
    fontFamily: SANS,
    fontSize: '16px',
    fontWeight: 600,
    lineHeight: '24px',
    textDecoration: 'none',
    borderRadius: '999px',
    padding: '12px 26px',
    display: 'inline-block',
  },
  note: { fontSize: '14px', lineHeight: '22px', color: LIGHT.muted, margin: '0 0 22px' },
  well: { backgroundColor: LIGHT.surface2, padding: '20px 32px 22px' },
  address: {
    fontFamily: MONO,
    fontSize: '15px',
    lineHeight: '24px',
    letterSpacing: '0.02em',
    color: LIGHT.ink,
    margin: '4px 0 6px',
    wordBreak: 'break-all',
  },
  small: { fontSize: '13px', lineHeight: '20px', color: LIGHT.muted, margin: '0 0 10px' },
  footer: { padding: '24px 8px 0' },
  never: {
    fontSize: '14px',
    lineHeight: '22px',
    color: LIGHT.ink,
    margin: '0 0 14px',
    borderLeft: `3px solid ${LIGHT.thread}`,
    paddingLeft: '12px',
  },
  link: { color: LIGHT.muted, textDecoration: 'underline' },
} satisfies Record<string, CSSProperties>;

/** One email, with {{placeholders}} that compose.ts fills in at send time. */
export function Email({ kind, lang }: { kind: EmailKind; lang: Lang }) {
  const c = COPY[lang];
  const k = c.kinds[kind];
  const thread = THREAD[kind];
  const facts = FACTS[kind];
  return (
    <Html lang={lang}>
      <Head>
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <style>{darkCss()}</style>
      </Head>
      <Preview>{k.preheader}</Preview>
      <Body className="at-bg" style={st.body}>
        <Container style={st.container}>
          <Section style={st.masthead}>
            <Row>
              <Column>
                <Text className="at-ink" style={st.wordmark}>
                  Atropyle
                </Text>
              </Column>
              <Column align="right">
                <Text style={st.chip}>
                  <span className={`at-text-${thread.tone}`} style={{ color: LIGHT[thread.tone] }}>
                    {'●'}
                  </span>
                  {'  '}
                  <span className="at-muted" style={{ color: LIGHT.muted }}>
                    {k.eyebrow}
                  </span>
                </Text>
              </Column>
            </Row>
          </Section>

          <Section className="at-card" style={st.card}>
            <Thread tone={thread.tone} progress={thread.progress} shape={thread.shape} />
            <Section style={st.inner}>
              <Heading as="h1" className="at-ink" style={st.h1}>
                {k.heading}
              </Heading>
              {k.body.map((p) => (
                <Text key={p} className="at-ink" style={st.p}>
                  {p}
                </Text>
              ))}
              {facts.length > 0 ? (
                <Section style={st.facts}>
                  {facts.map((f) => (
                    <Fragment key={f}>
                      <Text className="at-muted" style={st.label}>
                        {c.labels[f]}
                      </Text>
                      <Text className="at-ink" style={MONO_FACTS.has(f) ? st.mono : st.value}>
                        {`{{${f}}}`}
                      </Text>
                    </Fragment>
                  ))}
                </Section>
              ) : null}
              {kind === 'distributed' ? (
                <Section style={st.facts}>
                  <Text className="at-muted" style={st.label}>
                    {c.labels.transfers}
                  </Text>
                  {'{{{transfersHtml}}}'}
                </Section>
              ) : null}
              <Section style={st.cta}>
                <Button href="{{actionUrl}}" style={st.button}>
                  {k.cta}
                </Button>
              </Section>
              {k.note ? (
                <Text className="at-muted" style={st.note}>
                  {k.note}
                </Text>
              ) : null}
            </Section>
            <Section className="at-well" style={st.well}>
              <Text className="at-muted" style={st.label}>
                {c.labels.vault}
              </Text>
              <Text className="at-ink" style={st.address}>
                {'{{vaultGrouped}}'}
              </Text>
              <Text className="at-muted" style={st.small}>
                {c.labels.compare}
              </Text>
              <Text className="at-muted" style={st.label}>
                {c.labels.role}
              </Text>
              <Text className="at-ink" style={st.value}>
                {'{{roleLabel}}'}
              </Text>
            </Section>
          </Section>

          <Section style={st.footer}>
            <Text className="at-ink at-never" style={st.never}>
              {c.footer.never}
            </Text>
            <Text className="at-muted" style={st.small}>
              {c.footer.why}
            </Text>
            <Text className="at-muted" style={st.small}>
              <Link href="{{unsubscribeUrl}}" className="at-muted" style={st.link}>
                {c.footer.unsubscribe}
              </Link>
            </Text>
            <Text className="at-muted" style={st.small}>
              {c.footer.beta}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

`apps/backend/emails/text.ts`:

```ts
import { COPY } from '../src/email/copy';
import { type EmailKind, FACTS } from '../src/email/kinds';
import type { Lang } from '../src/types';

/** The plain-text part, written by hand (html-to-text would shout every heading in capitals). */
export function textTemplate(kind: EmailKind, lang: Lang): string {
  const c = COPY[lang];
  const k = c.kinds[kind];
  const lines: string[] = [k.heading, ''];
  for (const p of k.body) lines.push(p, '');
  const facts = FACTS[kind];
  for (const f of facts) lines.push(`${c.labels[f]}: {{${f}}}`);
  if (facts.length > 0) lines.push('');
  if (kind === 'distributed') lines.push(`${c.labels.transfers}:`, '{{transfersText}}', '');
  lines.push(`${k.cta}: {{actionUrl}}`, '');
  if (k.note) lines.push(k.note, '');
  lines.push(`${c.labels.vault}: {{vault}}`, `${c.labels.role}: {{roleLabel}}`, c.labels.compare, '');
  lines.push('--', c.footer.never, c.footer.why, `${c.footer.unsubscribe}: {{unsubscribeUrl}}`, c.footer.beta, '');
  return lines.join('\n');
}
```

`apps/backend/emails/render.tsx`:

```tsx
import { render } from '@react-email/components';
import { COPY } from '../src/email/copy';
import { EMAIL_KINDS, type EmailKind } from '../src/email/kinds';
import type { Template, TemplateSet } from '../src/email/template-types';
import { LANGS, type Lang } from '../src/types';
import { Email } from './Email';
import { textTemplate } from './text';

export async function renderTemplate(kind: EmailKind, lang: Lang): Promise<Template> {
  const html = await render(<Email kind={kind} lang={lang} />, { pretty: false });
  return { subject: COPY[lang].kinds[kind].subject, html, text: textTemplate(kind, lang) };
}

export async function renderAll(): Promise<TemplateSet> {
  const out = {} as Record<EmailKind, Record<Lang, Template>>;
  for (const kind of EMAIL_KINDS) {
    const byLang = {} as Record<Lang, Template>;
    for (const lang of LANGS) byLang[lang] = await renderTemplate(kind, lang);
    out[kind] = byLang;
  }
  return out;
}

// React Email pads the preheader with invisible characters; keep them as escapes so the source stays readable.
const INVISIBLE = /[\u0000-\u001f\u007f- ­​-‏ -‮⁠-⁯﻿]/g;

/** Source of src/email/templates.gen.ts, always with \n line ends. */
export function moduleSource(set: TemplateSet): string {
  const body = JSON.stringify(set, null, 2).replace(
    INVISIBLE,
    (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  return [
    '// GENERATED by `npm run emails -w apps/backend` from apps/backend/emails. Do not edit by hand.',
    "import type { TemplateSet } from './template-types';",
    '',
    `export const TEMPLATES: TemplateSet = ${body};`,
    '',
  ].join('\n');
}
```

> Note for the implementer: JSON.stringify already escapes the characters below U+0020 as `\n`, `\"` and so on, so after it the `INVISIBLE` pattern only matches real invisible characters (U+007F–U+00A0, soft hyphen, zero-width and bidi marks, BOM). It never matches a backslash.

`apps/backend/scripts/emails.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { moduleSource, renderAll } from '../emails/render';

// npm run emails -w apps/backend         writes src/email/templates.gen.ts
// npm run emails:check -w apps/backend   fails when the committed file is stale
const out = fileURLToPath(new URL('../src/email/templates.gen.ts', import.meta.url));
const source = moduleSource(await renderAll());

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(out, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    current = '';
  }
  if (current !== source) {
    console.error('src/email/templates.gen.ts is stale: run `npm run emails -w apps/backend` and commit it.');
    process.exit(1);
  }
  console.log('src/email/templates.gen.ts is up to date');
} else {
  writeFileSync(out, source);
  console.log(`wrote ${out}`);
}
```

- [ ] **Step 9: Generate the templates**

Run: `npm run emails -w apps/backend`
Expected: `wrote …/apps/backend/src/email/templates.gen.ts`. Open the file and check that each of the 12 kinds has `en` and `vi`, and that the HTML contains `{{actionUrl}}` and the Vietnamese copy in clear text.

- [ ] **Step 10: Ignore the generated module in Biome**

In `biome.json`, add one entry to `files.includes`, right after `"!apps/web/test/e2e/.state.json"`:

```json
      "!apps/backend/src/email/templates.gen.ts"
```

Remember the comma after the previous entry.

- [ ] **Step 11: Run all email tests to verify they pass**

Run: `npx vitest run test/unit/email-theme.test.ts test/unit/email-copy.test.ts test/unit/email-templates.test.tsx` (from `apps/backend`)
Expected: PASS, 11 + 122 tests (one up-to-date check, 5 checks × 24 templates, one thread check).

Then: `npm run emails:check -w apps/backend`
Expected: `src/email/templates.gen.ts is up to date`.

- [ ] **Step 12: Typecheck and lint**

```bash
npx biome check --write apps/backend
npm run typecheck
npx biome ci .
```

Expected: no errors. If `biome check --write` reformats anything under `emails/`, run `npm run emails -w apps/backend` again (formatting does not change the rendered HTML, but rerun the up-to-date test to be sure).

- [ ] **Step 13: Commit**

```bash
git add apps/backend/src/email/theme.ts apps/backend/src/email/kinds.ts apps/backend/src/email/copy.ts \
  apps/backend/src/email/template-types.ts apps/backend/src/email/templates.gen.ts \
  apps/backend/emails/Thread.tsx apps/backend/emails/Email.tsx apps/backend/emails/text.ts \
  apps/backend/emails/render.tsx apps/backend/scripts/emails.ts biome.json \
  apps/backend/test/unit/email-theme.test.ts apps/backend/test/unit/email-copy.test.ts \
  apps/backend/test/unit/email-templates.test.tsx
git commit -m "feat(backend): email design system, EN and VI copy, React Email templates rendered at build time" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Filling, formatting, composing and sending email

At run time an email is just the generated template filled in: escape every value, insert the one raw HTML fragment (the payout list, built here from escaped parts), add the `List-Unsubscribe` headers of spec §9.6, and post it to Resend.

**Files:**
- Create: `apps/backend/src/email/fill.ts`, `apps/backend/src/email/format.ts`, `apps/backend/src/email/compose.ts`
- Create: `apps/backend/src/mail/mailer.ts`
- Create: `apps/backend/emails/samples.ts`, `apps/backend/scripts/preview-emails.ts`
- Modify: `biome.json`, `.gitignore`
- Test: `apps/backend/test/unit/fill.test.ts`, `apps/backend/test/unit/format.test.ts`, `apps/backend/test/unit/compose.test.ts`, `apps/backend/test/unit/mailer.test.ts`
- Create (generated by the first test run): `apps/backend/test/__snapshots__/emails/<kind>.<lang>.html` and `.txt` (48 files)

**Interfaces:**
- Consumes: `TEMPLATES`, `TemplateSet`, `EmailKind`, `COPY`, `FONTS`, `LIGHT` (Task 3); `Config`, `Clock`, `Lang`, `Role` (Task 2).
- Produces:
  - `fill.ts`: `escapeHtml(s): string`, `fill(template: string, vars: Readonly<Record<string, string>>, mode: 'html' | 'text'): string`, `placeholdersOf(template): string[]`
  - `format.ts`: `formatDeadline(at: bigint, lang: Lang): string`, `shortHex(h: string, head?: number, tail?: number): string`, `groupAddress(a: string): string`, `interface Transfer { kind: AssetKind | 'unknown'; token: Address | null; to: Address; amount: string | null; id: string | null }`, `transferLines(transfers: readonly Transfer[], lang: Lang): string[]`, `transfersHtml(lines: readonly string[]): string`
  - `compose.ts`:
    - `interface Facts { deadline?: bigint; alarm?: 'inheritance' | 'recovery'; guardian?: Address; target?: Address; tx?: Hex; transfers?: Transfer[]; checkIns?: number; alarms?: number; released?: 'inheritance' | 'recovery' | null }`
    - `interface ComposeInput { kind: EmailKind; lang: Lang; to: string; vault: Address; role: Role; unsubToken: string; confirmToken?: string; facts?: Facts; idempotencyKey: string }`
    - `interface Mail { from; to; subject; html; text; headers: Record<string, string>; tags: { name: string; value: string }[]; idempotencyKey: string }`
    - `type ComposeConfig = Pick<Config, 'siteUrl' | 'siteHost' | 'apiUrl' | 'mailFrom'>`
    - `composeEmail(cfg: ComposeConfig, input: ComposeInput, templates?: TemplateSet): Mail`
    - `actionUrlOf(cfg, input): string`, `unsubscribeUrlOf(cfg, token): string`
  - `mailer.ts`: `interface Mailer { send(mail: Mail): Promise<{ id: string }> }`, `class MailError(message, status: number | null, retryAfterMs: number | null)`, `RESEND_URL`, `resendMailer(o: { apiKey: string; fetch?: typeof fetch; clock?: Clock; minIntervalMs?: number }): Mailer`, `interface CaptureMailer extends Mailer { sent: Mail[]; failNext(n?: number, error?: Error): void; byKind(kind: EmailKind): Mail[] }`, `captureMailer()`, `disabledMailer()`
  - `emails/samples.ts`: `SAMPLE_CONFIG`, `SAMPLE_VAULT`, `SAMPLE_HEIR`, `SAMPLE_TOKEN`, `SAMPLE_UNSUB`, `SAMPLE_CONFIRM`, `sampleInput(kind, lang): ComposeInput`

- [ ] **Step 1: Write the failing fill and format tests**

`apps/backend/test/unit/fill.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { escapeHtml, fill, placeholdersOf } from '../../src/email/fill';

describe('fill', () => {
  it('escapes every value in HTML and leaves text as it is', () => {
    const t = '<p>{{vault}}</p>';
    expect(fill(t, { vault: '<script>alert("x")</script>' }, 'html')).toBe(
      '<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>',
    );
    expect(fill('{{vault}}', { vault: '<b>&</b>' }, 'text')).toBe('<b>&</b>');
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('inserts a triple-brace value raw, in HTML only', () => {
    expect(fill('<div>{{{transfersHtml}}}</div>', { transfersHtml: '<p>x</p>' }, 'html')).toBe('<div><p>x</p></div>');
    expect(() => fill('{{{transfersHtml}}}', { transfersHtml: '<p>x</p>' }, 'text')).toThrow(/HTML-only/);
  });

  it('never re-reads a filled value, so a value cannot inject a placeholder', () => {
    expect(fill('{{a}} {{b}}', { a: '{{b}}', b: 'B' }, 'text')).toBe('{{b}} B');
  });

  it('throws on a missing value instead of sending an email with a hole in it', () => {
    expect(() => fill('Hello {{deadline}}', {}, 'html')).toThrow('missing email value {{deadline}}');
  });

  it('lists the placeholders of a template', () => {
    expect(placeholdersOf('{{a}} {{{b}}} {{a}}')).toEqual(['a', 'b']);
  });
});
```

`apps/backend/test/unit/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatDeadline, groupAddress, shortHex, transferLines, transfersHtml } from '../../src/email/format';

const TOKEN = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
const HEIR = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

describe('email formatting', () => {
  it('prints a deadline in UTC, and in UTC plus Vietnam time for VI (plan ruling 9)', () => {
    expect(formatDeadline(1795442700n, 'en')).toBe('Mon 23 Nov 2026, 14:05 UTC');
    expect(formatDeadline(1795442700n, 'vi')).toBe('14:05 UTC, 23/11/2026 (21:05, 23/11/2026 giờ Việt Nam)');
    // 20:30 UTC is already the next day in Vietnam.
    expect(formatDeadline(1795638600n, 'vi')).toBe('20:30 UTC, 25/11/2026 (03:30, 26/11/2026 giờ Việt Nam)');
  });

  it('shortens hashes and groups an address for comparison by eye', () => {
    expect(shortHex(HEIR)).toBe('0x3C44…93BC');
    expect(shortHex(`0x${'ab12'.repeat(16)}`, 10, 6)).toBe('0xab12ab12…12ab12');
    expect(groupAddress(HEIR)).toBe('0x 3C44 CdDd B6a9 00fa 2b58 5dd2 99e0 3d12 FA42 93BC');
  });

  it('writes one payout line per transfer, with the token address and never its name', () => {
    const lines = transferLines(
      [
        { kind: 'erc20', token: TOKEN, to: HEIR, amount: '10000', id: null },
        { kind: 'erc721', token: TOKEN, to: HEIR, amount: null, id: '42' },
        { kind: 'erc1155', token: TOKEN, to: HEIR, amount: '3', id: '7' },
        { kind: 'unknown', token: null, to: HEIR, amount: '5', id: '2' },
      ],
      'en',
    );
    expect(lines).toEqual([
      `10000 of token ${TOKEN} to ${HEIR}`,
      `Token #42 of ${TOKEN} to ${HEIR}`,
      `3 of token #7 of ${TOKEN} to ${HEIR}`,
      `Asset #2 (5) to ${HEIR}`,
    ]);
    expect(transferLines([{ kind: 'erc20', token: TOKEN, to: HEIR, amount: '1.5', id: null }], 'vi')).toEqual([
      `1.5 token ${TOKEN} cho ${HEIR}`,
    ]);
  });

  it('builds the payout HTML from escaped lines only', () => {
    const html = transfersHtml(['1 of token <b>x</b>']);
    expect(html).toContain('1 of token &lt;b&gt;x&lt;/b&gt;');
    expect(html.startsWith('<p class="at-ink" style="')).toBe(true);
    expect(html).not.toContain('<b>');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/unit/fill.test.ts test/unit/format.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/email/fill` and `../../src/email/format` do not exist.

- [ ] **Step 3: Write `fill.ts` and `format.ts`**

`apps/backend/src/email/fill.ts`:

```ts
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

const SLOT = /\{\{\{([A-Za-z]+)\}\}\}|\{\{([A-Za-z]+)\}\}/g;

/**
 * Fills {{name}} (escaped in HTML) and {{{name}}} (raw, HTML only) in one pass, so a value is never read again
 * as a template. A missing value throws: an email with a hole in it is never sent.
 */
export function fill(template: string, vars: Readonly<Record<string, string>>, mode: 'html' | 'text'): string {
  return template.replace(SLOT, (_match, raw: string | undefined, name: string | undefined) => {
    const key = raw ?? name ?? '';
    const value = vars[key];
    if (value === undefined) throw new Error(`missing email value {{${key}}}`);
    if (raw !== undefined) {
      if (mode !== 'html') throw new Error(`{{{${key}}}} is HTML-only`);
      return value;
    }
    return mode === 'html' ? escapeHtml(value) : value;
  });
}

export function placeholdersOf(template: string): string[] {
  return [...new Set([...template.matchAll(SLOT)].map((m) => m[1] ?? m[2] ?? ''))];
}
```

`apps/backend/src/email/format.ts`:

```ts
import type { AssetKind } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { Lang } from '../types';
import { COPY } from './copy';
import { escapeHtml, fill } from './fill';
import { FONTS, LIGHT } from './theme';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VIETNAM_OFFSET_MS = 7 * 3600 * 1000;
const two = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
const dmy = (d: Date) => `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;

/**
 * A chain time (Unix seconds) for an email. EN: "Mon 23 Nov 2026, 14:05 UTC". VI adds Vietnam time (UTC+7), since
 * the backend never knows a reader's own time zone (plan ruling 9, spec §9.4).
 */
export function formatDeadline(at: bigint, lang: Lang): string {
  const d = new Date(Number(at) * 1000);
  if (lang === 'en') {
    return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hhmm(d)} UTC`;
  }
  const v = new Date(d.getTime() + VIETNAM_OFFSET_MS);
  return `${hhmm(d)} UTC, ${dmy(d)} (${hhmm(v)}, ${dmy(v)} giờ Việt Nam)`;
}

/** 0x3C44…93BC: for subjects and short mentions. The full value is always printed elsewhere in the email. */
export function shortHex(h: string, head = 6, tail = 4): string {
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

/** "0x 3C44 CdDd …": four-character groups, easy to compare with the vault page. */
export function groupAddress(a: string): string {
  return `0x ${(a.slice(2).match(/.{1,4}/g) ?? []).join(' ')}`;
}

/** One payout of a Distributed event. Token names and symbols are never shown: they come from the chain. */
export interface Transfer {
  kind: AssetKind | 'unknown';
  token: Address | null;
  to: Address;
  /** Display amount: ERC-20 in token units (decimals applied when known), ERC-1155 count. */
  amount: string | null;
  /** ERC-721 or ERC-1155 token id; the asset index for an unknown asset. */
  id: string | null;
}

export function transferLines(transfers: readonly Transfer[], lang: Lang): string[] {
  const f = COPY[lang].fragments;
  return transfers.map((t) => {
    const vars = { amount: t.amount ?? '', token: t.token ?? '', id: t.id ?? '', to: t.to };
    if (t.kind === 'erc20') return fill(f.transferErc20, vars, 'text');
    if (t.kind === 'erc721') return fill(f.transferErc721, vars, 'text');
    if (t.kind === 'erc1155') return fill(f.transferErc1155, vars, 'text');
    return fill(f.transferUnknown, vars, 'text');
  });
}

const LINE_STYLE = [
  `font-family:${FONTS.mono}`,
  'font-size:14px',
  'line-height:22px',
  `color:${LIGHT.ink}`,
  'margin:4px 0 10px',
  'word-break:break-all',
].join(';');

/** The only raw HTML an email receives ({{{transfersHtml}}}): fixed markup around escaped lines. */
export function transfersHtml(lines: readonly string[]): string {
  return lines.map((l) => `<p class="at-ink" style="${LINE_STYLE}">${escapeHtml(l)}</p>`).join('');
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run test/unit/fill.test.ts test/unit/format.test.ts` (from `apps/backend`)
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the sample inputs**

`apps/backend/emails/samples.ts`:

```ts
import type { Address, Hex } from 'viem';
import type { ComposeConfig, ComposeInput, Facts } from '../src/email/compose';
import type { EmailKind } from '../src/email/kinds';
import type { Lang, Role } from '../src/types';

/** Sample inputs for the snapshot tests and `npm run emails:preview`. Nothing here is real. */
export const SAMPLE_CONFIG: ComposeConfig = {
  siteUrl: 'https://atropyle.test',
  siteHost: 'atropyle.test',
  apiUrl: 'https://ref.supabase.co/functions/v1',
  mailFrom: 'Atropyle <alerts@atropyle.test>',
};
export const SAMPLE_VAULT: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
export const SAMPLE_HEIR: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
export const SAMPLE_GUARDIAN: Address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
export const SAMPLE_TARGET: Address = '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65';
export const SAMPLE_TOKEN: Address = '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0';
export const SAMPLE_TX: Hex = `0x${'ab12'.repeat(16)}`;
/** 43 characters, the shape of a real token (TOKEN_RE). */
export const SAMPLE_UNSUB = 'sample-token-0123456789-abcdefghijklmnopqrs';
export const SAMPLE_CONFIRM = 'confirm-token-0123456789-abcdefghijklmnopqr';

const ROLE: Record<EmailKind, Role> = {
  confirm: 'owner',
  welcome: 'heir',
  'checkin-50': 'owner',
  'checkin-80': 'owner',
  'checkin-due': 'owner',
  'alarm-owner': 'owner',
  'alarm-guardian': 'guardian',
  'alarm-heir': 'heir',
  'recovery-vote': 'owner',
  released: 'heir',
  distributed: 'heir',
  'drill-summary': 'owner',
};

const FACTS: Record<EmailKind, Facts> = {
  confirm: {},
  welcome: {},
  'checkin-50': { deadline: 1795442700n },
  'checkin-80': { deadline: 1795442700n },
  'checkin-due': { deadline: 1795442700n },
  'alarm-owner': { deadline: 1795599000n, alarm: 'inheritance' },
  'alarm-guardian': { deadline: 1795599000n, alarm: 'inheritance' },
  'alarm-heir': { deadline: 1795599000n, alarm: 'inheritance' },
  'recovery-vote': { guardian: SAMPLE_GUARDIAN, target: SAMPLE_TARGET },
  released: { tx: SAMPLE_TX, released: 'inheritance' },
  distributed: {
    tx: SAMPLE_TX,
    transfers: [
      { kind: 'erc20', token: SAMPLE_TOKEN, to: SAMPLE_HEIR, amount: '10000', id: null },
      { kind: 'erc721', token: SAMPLE_TOKEN, to: SAMPLE_HEIR, amount: null, id: '42' },
    ],
  },
  'drill-summary': { checkIns: 3, alarms: 1, released: null },
};

export function sampleInput(kind: EmailKind, lang: Lang): ComposeInput {
  return {
    kind,
    lang,
    to: 'reader@example.com',
    vault: SAMPLE_VAULT,
    role: ROLE[kind],
    unsubToken: SAMPLE_UNSUB,
    confirmToken: kind === 'confirm' ? SAMPLE_CONFIRM : undefined,
    facts: FACTS[kind],
    idempotencyKey: `sample-${kind}-${lang}`,
  };
}
```

- [ ] **Step 6: Write the failing compose test**

`apps/backend/test/unit/compose.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  SAMPLE_CONFIG,
  SAMPLE_CONFIRM,
  SAMPLE_HEIR,
  SAMPLE_TOKEN,
  SAMPLE_UNSUB,
  SAMPLE_VAULT,
  sampleInput,
} from '../../emails/samples';
import { composeEmail } from '../../src/email/compose';
import { COPY } from '../../src/email/copy';
import { EMAIL_KINDS } from '../../src/email/kinds';
import { LANGS } from '../../src/types';

const SITE = `${SAMPLE_CONFIG.siteUrl}/`;
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const urls = (text: string) => text.match(/https?:\/\/\S+/g) ?? [];

describe('composed emails (spec §9.4, §11 Email row)', () => {
  for (const kind of EMAIL_KINDS) {
    for (const lang of LANGS) {
      describe(`${kind}.${lang}`, () => {
        const mail = composeEmail(SAMPLE_CONFIG, sampleInput(kind, lang));

        it('matches its HTML and text snapshots', async () => {
          await expect(mail.html).toMatchFileSnapshot(`../__snapshots__/emails/${kind}.${lang}.html`);
          await expect(`Subject: ${mail.subject}\n\n${mail.text}`).toMatchFileSnapshot(
            `../__snapshots__/emails/${kind}.${lang}.txt`,
          );
        });

        it('links only to the site, and has no placeholder left', () => {
          const links = [...hrefs(mail.html), ...urls(mail.text)];
          expect(links.length).toBeGreaterThanOrEqual(4);
          for (const l of links) expect(l.startsWith(SITE), l).toBe(true);
          for (const s of [mail.subject, mail.html, mail.text]) expect(s).not.toMatch(/\{\{/);
        });

        it('carries the one-click unsubscribe headers of RFC 8058 and the never-sign line', () => {
          expect(mail.headers).toEqual({
            'List-Unsubscribe': `<${SAMPLE_CONFIG.apiUrl}/unsubscribe?t=${SAMPLE_UNSUB}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          });
          expect(mail.html).toContain(COPY[lang].footer.never);
          expect(mail.text).toContain(COPY[lang].footer.never);
          expect(mail).toMatchObject({ from: SAMPLE_CONFIG.mailFrom, to: 'reader@example.com' });
          expect(mail.tags).toEqual([{ name: 'kind', value: kind }]);
        });
      });
    }
  }

  it('points each kind at the page of spec §9.6', () => {
    const action = (kind: (typeof EMAIL_KINDS)[number]) =>
      hrefs(composeEmail(SAMPLE_CONFIG, sampleInput(kind, 'en')).html).filter((h) => !h.includes('/alerts/unsub'));
    expect(action('confirm')).toEqual([`${SITE}alerts/confirm/#t=${SAMPLE_CONFIRM}`]);
    expect(action('alarm-owner')).toEqual([`${SITE}vault/#${SAMPLE_VAULT}`]);
    expect(action('drill-summary')).toEqual([`${SITE}create/`]);
    expect(hrefs(composeEmail(SAMPLE_CONFIG, sampleInput('welcome', 'vi')).html)).toContain(
      `${SITE}alerts/unsubscribe/#t=${SAMPLE_UNSUB}`,
    );
  });

  it('fills the facts: deadline in both time zones, payouts by token address, counts', () => {
    const vi = composeEmail(SAMPLE_CONFIG, sampleInput('checkin-80', 'vi'));
    expect(vi.text).toContain('Hạn chót: 14:05 UTC, 23/11/2026 (21:05, 23/11/2026 giờ Việt Nam)');
    const paid = composeEmail(SAMPLE_CONFIG, sampleInput('distributed', 'en'));
    expect(paid.text).toContain(`10000 of token ${SAMPLE_TOKEN} to ${SAMPLE_HEIR}`);
    expect(paid.html).toContain(`10000 of token ${SAMPLE_TOKEN} to ${SAMPLE_HEIR}`);
    const summary = composeEmail(SAMPLE_CONFIG, sampleInput('drill-summary', 'en'));
    expect(summary.text).toContain('Check-ins: 3');
    expect(summary.text).toContain('Alarms: 1');
    expect(summary.text).toContain(COPY.en.fragments.summaryNotReleased);
  });

  it('refuses to build a confirm email without its token, or an alarm without a deadline', () => {
    expect(() => composeEmail(SAMPLE_CONFIG, { ...sampleInput('confirm', 'en'), confirmToken: undefined })).toThrow(
      /confirm token/,
    );
    expect(() => composeEmail(SAMPLE_CONFIG, { ...sampleInput('alarm-owner', 'en'), facts: {} })).toThrow(
      /\{\{deadline\}\}/,
    );
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run test/unit/compose.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/email/compose` does not exist.

- [ ] **Step 8: Write `compose.ts`**

`apps/backend/src/email/compose.ts`:

```ts
import { getAddress, type Address, type Hex } from 'viem';
import type { Config } from '../config';
import type { Lang, Role } from '../types';
import { COPY } from './copy';
import { fill } from './fill';
import { formatDeadline, groupAddress, shortHex, type Transfer, transferLines, transfersHtml } from './format';
import type { EmailKind } from './kinds';
import type { TemplateSet } from './template-types';
import { TEMPLATES } from './templates.gen';

/** What an email says beyond the vault and the role. Every value is chain data or a count, never free text. */
export interface Facts {
  /** Chain time: check-in deadline (reminders) or end of the alarm window (alarms). */
  deadline?: bigint;
  alarm?: 'inheritance' | 'recovery';
  guardian?: Address;
  target?: Address;
  tx?: Hex;
  transfers?: Transfer[];
  checkIns?: number;
  alarms?: number;
  /** released: how it was released. drill-summary: whether it ever was (null = never). */
  released?: 'inheritance' | 'recovery' | null;
}

export interface ComposeInput {
  kind: EmailKind;
  lang: Lang;
  to: string;
  vault: Address;
  role: Role;
  /** unsubToken(TOKEN_SECRET, subscription id): in the footer link and the List-Unsubscribe header. */
  unsubToken: string;
  /** The confirm email only: the raw token whose SHA-256 is subscriptions.confirm_hash. */
  confirmToken?: string;
  facts?: Facts;
  /** Resend Idempotency-Key: one per (subscription, kind, period). */
  idempotencyKey: string;
}

export interface Mail {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  tags: { name: string; value: string }[];
  idempotencyKey: string;
}

export type ComposeConfig = Pick<Config, 'siteUrl' | 'siteHost' | 'apiUrl' | 'mailFrom'>;

/** The button of every email (spec §9.6 link formats). */
export function actionUrlOf(cfg: ComposeConfig, input: ComposeInput): string {
  if (input.kind === 'confirm') {
    if (!input.confirmToken) throw new Error('a confirm email needs its confirm token');
    return `${cfg.siteUrl}/alerts/confirm/#t=${input.confirmToken}`;
  }
  if (input.kind === 'drill-summary') return `${cfg.siteUrl}/create/`;
  return `${cfg.siteUrl}/vault/#${getAddress(input.vault)}`;
}

export function unsubscribeUrlOf(cfg: ComposeConfig, token: string): string {
  return `${cfg.siteUrl}/alerts/unsubscribe/#t=${token}`;
}

function reasonOf(input: ComposeInput): string | undefined {
  const f = COPY[input.lang].fragments;
  const recovery = input.facts?.alarm === 'recovery';
  if (input.kind === 'alarm-owner') return recovery ? f.alarmOwnerRecovery : f.alarmOwnerInheritance;
  if (input.kind === 'alarm-guardian') return recovery ? f.alarmGuardianRecovery : f.alarmGuardianInheritance;
  return undefined;
}

function outcomeOf(input: ComposeInput): string | undefined {
  const f = COPY[input.lang].fragments;
  const released = input.facts?.released ?? null;
  if (input.kind === 'released') return released === 'recovery' ? f.releasedRecovery : f.releasedInheritance;
  if (input.kind === 'drill-summary') return released === null ? f.summaryNotReleased : f.summaryReleased;
  return undefined;
}

/** A ready-to-send email: the generated template filled in, plus the RFC 8058 one-click unsubscribe headers. */
export function composeEmail(cfg: ComposeConfig, input: ComposeInput, templates: TemplateSet = TEMPLATES): Mail {
  const t = templates[input.kind][input.lang];
  const f = input.facts ?? {};
  const vault = getAddress(input.vault);
  const vars: Record<string, string> = {
    siteUrl: cfg.siteUrl,
    siteHost: cfg.siteHost,
    vault,
    vaultShort: shortHex(vault),
    vaultGrouped: groupAddress(vault),
    roleLabel: COPY[input.lang].roles[input.role],
    unsubscribeUrl: unsubscribeUrlOf(cfg, input.unsubToken),
    actionUrl: actionUrlOf(cfg, input),
  };
  if (f.deadline !== undefined) vars.deadline = formatDeadline(f.deadline, input.lang);
  if (f.guardian) vars.guardian = getAddress(f.guardian);
  if (f.target) vars.target = getAddress(f.target);
  if (f.tx) {
    vars.tx = f.tx;
    vars.txShort = shortHex(f.tx, 10, 6);
  }
  if (f.transfers) {
    const lines = transferLines(f.transfers, input.lang);
    vars.transfersText = lines.join('\n');
    vars.transfersHtml = transfersHtml(lines);
  }
  if (f.checkIns !== undefined) vars.checkIns = String(f.checkIns);
  if (f.alarms !== undefined) vars.alarms = String(f.alarms);
  const reason = reasonOf(input);
  if (reason !== undefined) vars.reason = reason;
  const outcome = outcomeOf(input);
  if (outcome !== undefined) vars.outcome = outcome;

  return {
    from: cfg.mailFrom,
    to: input.to,
    subject: fill(t.subject, vars, 'text'),
    html: fill(t.html, vars, 'html'),
    text: fill(t.text, vars, 'text'),
    headers: {
      'List-Unsubscribe': `<${cfg.apiUrl}/unsubscribe?t=${input.unsubToken}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [{ name: 'kind', value: input.kind }],
    idempotencyKey: input.idempotencyKey,
  };
}
```

- [ ] **Step 9: Run the compose test to create the snapshots, and read them**

Run: `npx vitest run test/unit/compose.test.ts` (from `apps/backend`)
Expected: PASS, 75 tests (3 × 24 + 3), and Vitest writes 48 new files under `apps/backend/test/__snapshots__/emails/`.

Open `checkin-80.vi.txt`, `alarm-owner.en.txt` and `distributed.en.html`, and read them as a reader would. Check that the subject, the deadline in both time zones, the button, the grouped vault address and the footer are all there, and that nothing says `undefined`. On a second run the test must pass with no snapshot written.

- [ ] **Step 10: Write the failing mailer test**

`apps/backend/test/unit/mailer.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SAMPLE_CONFIG, sampleInput } from '../../emails/samples';
import { fakeClock } from '../../src/clock';
import { composeEmail } from '../../src/email/compose';
import { captureMailer, disabledMailer, MailError, RESEND_URL, resendMailer } from '../../src/mail/mailer';

const mail = composeEmail(SAMPLE_CONFIG, sampleInput('welcome', 'en'));

function fakeFetch(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses.shift();
    if (!r) throw new Error('no more responses');
    return r;
  }) as typeof fetch;
  return { f, calls };
}

describe('resendMailer', () => {
  it('posts the email to Resend with the key, the idempotency key and the unsubscribe headers', async () => {
    const { f, calls } = fakeFetch([Response.json({ id: 'msg_1' })]);
    const r = await resendMailer({ apiKey: 're_test', fetch: f, clock: fakeClock() }).send(mail);
    expect(r).toEqual({ id: 'msg_1' });
    expect(calls[0].url).toBe(RESEND_URL);
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toMatchObject({
      authorization: 'Bearer re_test',
      'content-type': 'application/json',
      'idempotency-key': mail.idempotencyKey,
    });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      from: mail.from,
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: mail.headers,
      tags: mail.tags,
    });
  });

  it('turns a 429 into a MailError with the retry-after delay, and other failures into a MailError', async () => {
    const { f } = fakeFetch([
      new Response('{}', { status: 429, headers: { 'retry-after': '2' } }),
      new Response('{}', { status: 422 }),
      Response.json({}),
    ]);
    const m = resendMailer({ apiKey: 're_test', fetch: f, clock: fakeClock() });
    await expect(m.send(mail)).rejects.toMatchObject({ name: 'MailError', status: 429, retryAfterMs: 2000 });
    await expect(m.send(mail)).rejects.toMatchObject({ status: 422, retryAfterMs: null });
    await expect(m.send(mail)).rejects.toThrow('without an id');
  });

  it('spaces sends at least minIntervalMs apart', async () => {
    const clock = fakeClock();
    const { f } = fakeFetch([Response.json({ id: 'a' }), Response.json({ id: 'b' })]);
    const m = resendMailer({ apiKey: 're_test', fetch: f, clock, minIntervalMs: 550 });
    const t0 = clock.now();
    await m.send(mail);
    await m.send(mail);
    expect(clock.now() - t0).toBeGreaterThanOrEqual(550);
  });
});

describe('test and disabled mailers', () => {
  it('captures, fails on demand and filters by kind', async () => {
    const m = captureMailer();
    m.failNext(1, new MailError('boom', 500, null));
    await expect(m.send(mail)).rejects.toThrow('boom');
    expect(await m.send(mail)).toEqual({ id: 'capture-1' });
    expect(m.byKind('welcome')).toHaveLength(1);
    expect(m.byKind('confirm')).toHaveLength(0);
  });

  it('refuses to send when RESEND_API_KEY is not set', async () => {
    await expect(disabledMailer().send(mail)).rejects.toThrow('RESEND_API_KEY is not set');
  });
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `npx vitest run test/unit/mailer.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/mail/mailer` does not exist.

- [ ] **Step 12: Write `mailer.ts`**

`apps/backend/src/mail/mailer.ts`:

```ts
import { type Clock, systemClock } from '../clock';
import type { Mail } from '../email/compose';
import type { EmailKind } from '../email/kinds';

export interface Mailer {
  send(mail: Mail): Promise<{ id: string }>;
}

export class MailError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** Set on a 429: how long Resend asks us to wait. */
    readonly retryAfterMs: number | null,
  ) {
    super(message);
    this.name = 'MailError';
  }
}

export const RESEND_URL = 'https://api.resend.com/emails';

export interface ResendOptions {
  apiKey: string;
  fetch?: typeof fetch;
  clock?: Clock;
  /** Gap between two sends (plan ruling 4): 550 ms stays under even the older 2 requests/s default. */
  minIntervalMs?: number;
}

/**
 * Resend's REST API with plain fetch (plan ruling 4). The Idempotency-Key makes a retried send after a timeout safe
 * for 24 hours. The error never carries Resend's response body, which can quote the recipient.
 */
export function resendMailer(o: ResendOptions): Mailer {
  const f = o.fetch ?? fetch;
  const clock = o.clock ?? systemClock;
  const gap = o.minIntervalMs ?? 550;
  let last = Number.NEGATIVE_INFINITY;
  return {
    async send(mail) {
      const wait = last + gap - clock.now();
      if (wait > 0) await clock.sleep(wait);
      last = clock.now();
      const res = await f(RESEND_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${o.apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': mail.idempotencyKey,
        },
        body: JSON.stringify({
          from: mail.from,
          to: [mail.to],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          headers: mail.headers,
          tags: mail.tags,
        }),
      });
      if (res.status === 429) {
        const s = Number(res.headers.get('retry-after'));
        throw new MailError('Resend rate limit', 429, Number.isFinite(s) && s > 0 ? s * 1000 : 1000);
      }
      if (!res.ok) throw new MailError(`Resend answered ${res.status}`, res.status, null);
      const body = (await res.json()) as { id?: unknown };
      if (typeof body.id !== 'string') throw new MailError('Resend answered without an id', res.status, null);
      return { id: body.id };
    },
  };
}

export interface CaptureMailer extends Mailer {
  sent: Mail[];
  /** The next `n` sends throw `error` (default: a 500 MailError). */
  failNext(n?: number, error?: Error): void;
  byKind(kind: EmailKind): Mail[];
}

/** Test mailer: keeps every email instead of sending it. */
export function captureMailer(): CaptureMailer {
  const sent: Mail[] = [];
  let failures = 0;
  let failure: Error = new MailError('capture failure', 500, null);
  return {
    sent,
    failNext(n = 1, error = new MailError('capture failure', 500, null)) {
      failures = n;
      failure = error;
    },
    byKind: (kind) => sent.filter((m) => m.tags.some((t) => t.name === 'kind' && t.value === kind)),
    async send(mail) {
      if (failures > 0) {
        failures--;
        throw failure;
      }
      sent.push(mail);
      return { id: `capture-${sent.length}` };
    },
  };
}

/** Without RESEND_API_KEY nothing is sent; deliveries stay unsent and go out once the key is set. */
export function disabledMailer(): Mailer {
  return {
    async send() {
      throw new MailError('RESEND_API_KEY is not set', null, null);
    },
  };
}
```

- [ ] **Step 13: Write the preview script and ignore its output**

`apps/backend/scripts/preview-emails.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SAMPLE_CONFIG, sampleInput } from '../emails/samples';
import { composeEmail } from '../src/email/compose';
import { EMAIL_KINDS } from '../src/email/kinds';
import { LANGS } from '../src/types';

// npm run emails:preview -w apps/backend, then open apps/backend/.preview/index.html in a browser.
// Toggle the browser or OS dark mode to see the dark palette. Nothing is sent and nothing is fetched.
const dir = fileURLToPath(new URL('../.preview/', import.meta.url));
mkdirSync(dir, { recursive: true });
const items: string[] = [];
for (const kind of EMAIL_KINDS) {
  for (const lang of LANGS) {
    const mail = composeEmail(SAMPLE_CONFIG, sampleInput(kind, lang));
    writeFileSync(`${dir}${kind}.${lang}.html`, mail.html);
    writeFileSync(`${dir}${kind}.${lang}.txt`, `Subject: ${mail.subject}\n\n${mail.text}`);
    items.push(`<li><a href="${kind}.${lang}.html">${kind} (${lang})</a> - <a href="${kind}.${lang}.txt">text</a></li>`);
  }
}
writeFileSync(`${dir}index.html`, `<!doctype html><meta charset="utf-8"><title>Atropyle emails</title><ul>${items.join('')}</ul>`);
console.log(`wrote ${items.length} previews to ${dir}`);
```

In `biome.json`, add two more entries to `files.includes`, after `"!apps/backend/src/email/templates.gen.ts"`:

```json
      "!apps/backend/test/__snapshots__",
      "!apps/backend/.preview"
```

In `.gitignore`, add one line at the end:

```
apps/backend/.preview/
```

- [ ] **Step 14: Run every email test to verify they pass**

Run: `npx vitest run test/unit/fill.test.ts test/unit/format.test.ts test/unit/compose.test.ts test/unit/mailer.test.ts` (from `apps/backend`)
Expected: PASS, 9 + 75 + 5 = 89 tests, with no snapshot written.

Then run `npm run emails:preview -w apps/backend` and open `apps/backend/.preview/index.html` in the browser. Look at `alarm-owner.en.html`, `released.vi.html` and `distributed.en.html` in light and dark mode at 390 px and 1440 px wide. The thread must be frayed on the alarm and split on the release, the button must read clearly in both themes, and no line may overflow at 390 px.

- [ ] **Step 15: Typecheck and lint**

```bash
npx biome check --write apps/backend
npm run typecheck
npx biome ci .
```

Expected: no errors.

- [ ] **Step 16: Commit**

```bash
git add apps/backend/src/email/fill.ts apps/backend/src/email/format.ts apps/backend/src/email/compose.ts \
  apps/backend/src/mail/mailer.ts apps/backend/emails/samples.ts apps/backend/scripts/preview-emails.ts \
  apps/backend/test/unit/fill.test.ts apps/backend/test/unit/format.test.ts apps/backend/test/unit/compose.test.ts \
  apps/backend/test/unit/mailer.test.ts apps/backend/test/__snapshots__/emails biome.json .gitignore
git commit -m "feat(backend): fill and compose emails with one-click unsubscribe, the Resend mailer, snapshots" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: The chain port, the keeper signer and the test harness

Everything the backend asks of X Layer goes through one small port, `ChainPort`, so the tick and the handlers can be tested against a fake chain, and only one adapter talks to the SDK. The keeper's signer is the one place in the repository that turns `KEEPER_KEY` into an account, and a test enforces that.

**Files:**
- Create: `apps/backend/src/chain/port.ts`, `apps/backend/src/chain/view.ts`, `apps/backend/src/chain/sdk.ts`
- Create: `apps/backend/src/keeper/signer.ts`, `apps/backend/src/deps.ts`
- Create: `apps/backend/test/helpers/fixtures.ts`, `apps/backend/test/helpers/fake-chain.ts`, `apps/backend/test/helpers/deps.ts`
- Test: `apps/backend/test/unit/view.test.ts`, `apps/backend/test/unit/sdk-chain.test.ts`, `apps/backend/test/unit/signer.test.ts`, `apps/backend/test/unit/zero-key.test.ts`

**Interfaces:**
- Consumes: `Sql` (Task 1); `Config`, `Env`, `Clock`, `fakeClock`, `FakeClock`, `Log`, `memoryLog`, `MemoryLog`, `Role` (Task 2); `Mailer`, `captureMailer`, `CaptureMailer` (Task 4). From `@atropyle/sdk`: `AtropyleClient`, `keeperTick`, `planKeeperActions`, `timelineOf`, `isReleasedState`, `modelEngine`, `untrusted`, and the types `VaultSnapshot`, `VaultStatus`, `VaultConfig`, `Timeline`, `ScanResult`, `CreatedVault`, `VaultEvent`, `KeeperReport`, `IntegrityReport`, `StateName`, `AssetKind`.
- Produces:
  - `port.ts`: `interface StoredAsset { index: number; kind: AssetKind; token: Address; id: string; decimals: number | null }`, `interface VaultView` (fields below), `interface ChainHead { number: bigint; timestamp: bigint }`, `interface ScanRequest { resume: { toBlock: bigint; vaults: Address[] }; toBlock: bigint }`, `interface KeeperRun { vaults: Address[]; maxTx: number; lastDistributeAt: ReadonlyMap<Address, bigint> }`, `interface ChainPort { readonly factoryBlock: bigint; head(); scan(o); blockTime(block); view(vault); isVault(vault); keeper(run); integrity() }`
  - `VaultView`: `vault, owner: Address; drill: boolean; state, pending: StateName; lastAlive, lateAt: bigint; windowEndsAt: bigint | null; recoveryTarget: Address | null; expiresAt: bigint | null; expired, released: boolean; nextCheckAt: bigint | null; roles: { address: Address; role: Role }[]; assets: StoredAsset[]; blockNumber, blockTimestamp: bigint`
  - `view.ts`: `deriveView(snap: VaultSnapshot, timeline: Timeline): VaultView`
  - `sdk.ts`: `createSdkChain(atro: AtropyleClient, o: { wallet: WalletClient | null }): ChainPort`
  - `signer.ts`: `KEEPER_KEY_INVALID`, `type ToAccount = (key: Hex) => LocalAccount`, `interface KeeperSigner { wallet: WalletClient | null; error: string | null }`, `keeperSigner(key, chain, transport, toAccount?)`, `keeperSignerFromEnv(env, chain, transport)`
  - `deps.ts`: `interface Deps { sql: Sql; chain: ChainPort; mailer: Mailer; clock: Clock; log: Log; config: Config; random(size: number): Uint8Array; keeperError: string | null }`
  - Test helpers:
    - `fixtures.ts`: `T0 = 1_800_000_000n`, `addr(n)`, `txh(n)`, `OWNER`, `HEIR`, `GUARDIAN`, `TARGET`, `TOKEN`, `VAULT`, `VAULT2`, `view(over?)`, `created(over?)`, `vaultEvent(name, args, over?)`, `snapshotFixture(over?)`
    - `fake-chain.ts`: `class FakeChain implements ChainPort` with the public fields `factoryBlock`, `headBlock`, `headTime`, `created`, `logs`, `views`, `registered`, `failScan`, `failView`, `keeperImpl`, `integrityImpl`, `calls` and the method `setView(v)`
    - `deps.ts`: `testConfig(over?)`, `interface TestEnv { d; chain; mailer; clock; log }`, `testEnv(sql, o?)`

- [ ] **Step 1: Write the port, `deps.ts` and the test fixtures**

`apps/backend/src/chain/port.ts`:

```ts
import type { AssetKind, IntegrityReport, KeeperReport, ScanResult, StateName } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { Role } from '../types';

/** An asset of the vault as the payout email needs it. `id` is a decimal string (0 for ERC-20). */
export interface StoredAsset {
  index: number;
  kind: AssetKind;
  token: Address;
  id: string;
  decimals: number | null;
}

/** What the database keeps of a vault: one snapshot at the latest block, plus the keeper's next look. */
export interface VaultView {
  vault: Address;
  owner: Address;
  drill: boolean;
  state: StateName;
  pending: StateName;
  lastAlive: bigint;
  lateAt: bigint;
  windowEndsAt: bigint | null;
  recoveryTarget: Address | null;
  expiresAt: bigint | null;
  expired: boolean;
  released: boolean;
  /** Chain time at which the keeper should look again (now when an action is due); null when never. */
  nextCheckAt: bigint | null;
  roles: { address: Address; role: Role }[];
  assets: StoredAsset[];
  blockNumber: bigint;
  blockTimestamp: bigint;
}

export interface ChainHead {
  number: bigint;
  timestamp: bigint;
}

export interface ScanRequest {
  /** The stored cursor and every vault indexed so far. */
  resume: { toBlock: bigint; vaults: Address[] };
  toBlock: bigint;
}

export interface KeeperRun {
  vaults: Address[];
  maxTx: number;
  /** Chain time of the last distribute this keeper sent, per vault (checksummed). */
  lastDistributeAt: ReadonlyMap<Address, bigint>;
}

/** Everything the backend asks of the chain. createSdkChain is the real one; FakeChain backs the unit tests. */
export interface ChainPort {
  readonly factoryBlock: bigint;
  head(): Promise<ChainHead>;
  scan(o: ScanRequest): Promise<ScanResult>;
  blockTime(block: bigint): Promise<bigint>;
  view(vault: Address): Promise<VaultView>;
  /** factory.isVault: only vaults of this deployment can be subscribed to. */
  isVault(vault: Address): Promise<boolean>;
  keeper(run: KeeperRun): Promise<KeeperReport>;
  integrity(): Promise<IntegrityReport>;
}
```

`apps/backend/src/deps.ts`:

```ts
import type { ChainPort } from './chain/port';
import type { Clock } from './clock';
import type { Config } from './config';
import type { Sql } from './db/sql';
import type { Log } from './log';
import type { Mailer } from './mail/mailer';

/** The five ports and the settings every handler and tick phase receives. */
export interface Deps {
  sql: Sql;
  chain: ChainPort;
  mailer: Mailer;
  clock: Clock;
  log: Log;
  config: Config;
  /** Cryptographic randomness (crypto.getRandomValues in production). */
  random(size: number): Uint8Array;
  /** Set when the keeper secret is present but unusable: the keeper then runs dry and ops get one alert. */
  keeperError: string | null;
}
```

`apps/backend/test/helpers/fixtures.ts`:

```ts
import {
  type CreatedVault,
  untrusted,
  type VaultConfig,
  type VaultEvent,
  type VaultSnapshot,
  type VaultStatus,
} from '@atropyle/sdk';
import { type Address, getAddress, type Hex } from 'viem';
import type { VaultView } from '../../src/chain/port';

/** Chain time of the fake chain's head block (FakeChain.headTime). */
export const T0 = 1_800_000_000n;

export const addr = (n: number): Address => getAddress(`0x${n.toString(16).padStart(40, '0')}`);
export const txh = (n: number): Hex => `0x${n.toString(16).padStart(64, '0')}`;

export const OWNER = addr(0x1001);
export const HEIR = addr(0x2002);
export const GUARDIAN = addr(0x3003);
export const TARGET = addr(0x5005);
export const TOKEN = addr(0x4004);
export const VAULT = addr(0xa001);
export const VAULT2 = addr(0xa002);

/** An active Drill vault seen at T0 (period 60 s, threshold 2: late 120 s after the last check-in). */
export function view(over: Partial<VaultView> = {}): VaultView {
  return {
    vault: VAULT,
    owner: OWNER,
    drill: true,
    state: 'active',
    pending: 'active',
    lastAlive: T0 - 10n,
    lateAt: T0 + 110n,
    windowEndsAt: null,
    recoveryTarget: null,
    expiresAt: T0 + 604_790n,
    expired: false,
    released: false,
    nextCheckAt: T0 + 110n,
    roles: [
      { address: OWNER, role: 'owner' },
      { address: HEIR, role: 'heir' },
      { address: GUARDIAN, role: 'guardian' },
    ],
    assets: [{ index: 0, kind: 'erc20', token: TOKEN, id: '0', decimals: 6 }],
    blockNumber: 200n,
    blockTimestamp: T0,
    ...over,
  };
}

export function created(over: Partial<CreatedVault> = {}): CreatedVault {
  return { vault: VAULT, owner: OWNER, drill: true, blockNumber: 150n, transactionHash: txh(1), ...over };
}

export function vaultEvent(name: string, args: Record<string, unknown>, over: Partial<VaultEvent> = {}): VaultEvent {
  return { address: VAULT, name, args, blockNumber: 150n, logIndex: 0, transactionHash: txh(1), ...over };
}

/** A real-shaped SDK snapshot of an active Drill with one ERC-20 asset, at T0. */
export function snapshotFixture(over: { status?: Partial<VaultStatus>; config?: Partial<VaultConfig> } = {}): VaultSnapshot {
  const config: VaultConfig = {
    owner: OWNER,
    drill: true,
    heirs: [{ account: HEIR, bps: 10_000 }],
    guardians: [],
    k: 0,
    recoveryEnabled: false,
    timing: { period: 60, threshold: 2, window: 120 },
    assets: [{ kind: 'erc20', token: TOKEN, id: 0n, heir: 0 }],
    ...over.config,
  };
  const status: VaultStatus = {
    vault: VAULT,
    chainId: 196,
    blockNumber: 200n,
    blockTimestamp: T0,
    state: 'active',
    stateCode: 0,
    pending: 'active',
    pendingCode: 0,
    idle: 0,
    lastAlive: T0,
    lateAt: T0 + 120n,
    alarmAt: null,
    windowEndsAt: null,
    releasedAt: null,
    expiresAt: T0 + 604_800n,
    expired: false,
    inhVotes: 0,
    inhVoters: [],
    recoveryTarget: null,
    recVotes: [],
    assets: [
      {
        index: 0,
        asset: { kind: 'erc20', token: TOKEN, id: 0n, heir: 0 },
        token: { address: TOKEN, symbol: untrusted('USDT0'), name: untrusted('USDT0'), decimals: 6 },
        coverage: 10_000_000_000n,
        held: 10_000_000_000n,
      },
    ],
    ...over.status,
  };
  return { config, status, binding: { factory: addr(0xf00), cpu: addr(0xc00), policyId: 1n } };
}
```

- [ ] **Step 2: Write the failing view and SDK-adapter tests**

`apps/backend/test/unit/view.test.ts`:

```ts
import { modelEngine, timelineOf } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { deriveView } from '../../src/chain/view';
import { GUARDIAN, HEIR, OWNER, snapshotFixture, T0, TOKEN, VAULT } from '../helpers/fixtures';

const derive = (snap: ReturnType<typeof snapshotFixture>) => deriveView(snap, timelineOf(modelEngine(), snap));

describe('deriveView', () => {
  it('keeps what the database needs and schedules the keeper at the next transition', () => {
    const v = derive(snapshotFixture());
    expect(v).toMatchObject({
      vault: VAULT,
      owner: OWNER,
      drill: true,
      state: 'active',
      pending: 'active',
      lastAlive: T0,
      lateAt: T0 + 120n,
      expiresAt: T0 + 604_800n,
      released: false,
      nextCheckAt: T0 + 120n,
      blockNumber: 200n,
      blockTimestamp: T0,
    });
    expect(v.assets).toEqual([{ index: 0, kind: 'erc20', token: TOKEN, id: '0', decimals: 6 }]);
    expect(v.roles).toEqual([
      { address: OWNER, role: 'owner' },
      { address: HEIR, role: 'heir' },
    ]);
  });

  it('lists each address once per role, so an heir who is also a guardian has two roles', () => {
    const v = derive(
      snapshotFixture({
        config: { heirs: [{ account: HEIR, bps: 5000 }, { account: HEIR, bps: 5000 }], guardians: [HEIR, GUARDIAN] },
      }),
    );
    expect(v.roles).toEqual([
      { address: OWNER, role: 'owner' },
      { address: HEIR, role: 'heir' },
      { address: HEIR, role: 'guardian' },
      { address: GUARDIAN, role: 'guardian' },
    ]);
  });

  it('asks the keeper to look now when a transition is due', () => {
    const v = derive(snapshotFixture({ status: { pending: 'grace', pendingCode: 1 } }));
    expect(v.nextCheckAt).toBe(T0);
  });

  it('marks a released vault and an expired Drill', () => {
    const released = derive(snapshotFixture({ status: { state: 'releasedInherit', stateCode: 5, pending: 'releasedInherit', pendingCode: 5 } }));
    expect(released).toMatchObject({ released: true, nextCheckAt: T0 });
    const expired = derive(snapshotFixture({ status: { expired: true } }));
    expect(expired).toMatchObject({ expired: true, nextCheckAt: null });
  });
});
```

`apps/backend/test/unit/sdk-chain.test.ts`:

```ts
import { type AtropyleClient, modelEngine, timelineOf } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { createSdkChain } from '../../src/chain/sdk';
import { snapshotFixture, T0, VAULT, VAULT2 } from '../helpers/fixtures';

const snap = snapshotFixture();

/** Just enough of an AtropyleClient for the adapter: no RPC, no key. */
function stubAtropyle(): AtropyleClient {
  const stub = {
    deployment: { factoryBlock: 100n },
    publicClient: {
      getBlock: async (o?: { blockNumber?: bigint }) =>
        o?.blockNumber === undefined ? { number: 200n, timestamp: T0 } : { number: o.blockNumber, timestamp: 1000n + o.blockNumber },
    },
    engineFor: async () => modelEngine(),
    vault: (a: string) => ({
      snapshot: async () => snap,
      registered: async () => a === VAULT,
    }),
    scan: async (o: { resume: { toBlock: bigint; vaults: string[] }; toBlock: bigint }) => ({
      fromBlock: o.resume.toBlock + 1n,
      toBlock: o.toBlock,
      created: [],
      events: [],
      cursor: { toBlock: o.toBlock, vaults: o.resume.vaults },
      truncated: false,
    }),
    integrity: async () => ({ ok: true }),
  };
  return stub as unknown as AtropyleClient;
}

describe('createSdkChain', () => {
  const chain = createSdkChain(stubAtropyle(), { wallet: null });

  it('reads the head, block times and the factory block', async () => {
    expect(chain.factoryBlock).toBe(100n);
    expect(await chain.head()).toEqual({ number: 200n, timestamp: T0 });
    expect(await chain.blockTime(150n)).toBe(1150n);
  });

  it('builds a view from the snapshot and the timeline of the vault engine', async () => {
    const v = await chain.view(VAULT);
    expect(v.nextCheckAt).toBe(timelineOf(modelEngine(), snap).nextCheckAt);
    expect(v.nextCheckAt).toBe(T0 + 120n);
  });

  it('asks the factory whether an address is a vault', async () => {
    expect(await chain.isVault(VAULT)).toBe(true);
    expect(await chain.isVault(VAULT2)).toBe(false);
  });

  it('passes the cursor to scan', async () => {
    const r = await chain.scan({ resume: { toBlock: 120n, vaults: [VAULT] }, toBlock: 140n });
    expect(r).toMatchObject({ fromBlock: 121n, toBlock: 140n, cursor: { toBlock: 140n, vaults: [VAULT] } });
  });

  it('runs the SDK keeper dry without a wallet', async () => {
    const r = await chain.keeper({ vaults: [], maxTx: 20, lastDistributeAt: new Map() });
    expect(r).toMatchObject({ ranAt: T0, dryRun: true, keeper: null, sent: 0, outcomes: [] });
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run test/unit/view.test.ts test/unit/sdk-chain.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/chain/view` and `../../src/chain/sdk` do not exist.

- [ ] **Step 4: Write `view.ts` and `sdk.ts`**

`apps/backend/src/chain/view.ts`:

```ts
import { isReleasedState, planKeeperActions, type Timeline, type VaultSnapshot } from '@atropyle/sdk';
import { type Address, getAddress } from 'viem';
import type { Role } from '../types';
import type { StoredAsset, VaultView } from './port';

/**
 * The stored view of a vault (spec §9.1, §9.3): the snapshot's state, roles and assets, and next_check_at from the
 * same pure policy the keeper uses (planKeeperActions): now when an action is due, otherwise the next transition.
 */
export function deriveView(snap: VaultSnapshot, timeline: Timeline): VaultView {
  const s = snap.status;
  const c = snap.config;
  const now = s.blockTimestamp;
  const decision = planKeeperActions(s, timeline, now);
  const roles: VaultView['roles'] = [];
  const seen = new Set<string>();
  const add = (address: Address, role: Role) => {
    const a = getAddress(address);
    if (seen.has(`${a}:${role}`)) return;
    seen.add(`${a}:${role}`);
    roles.push({ address: a, role });
  };
  add(c.owner, 'owner');
  for (const h of c.heirs) add(h.account, 'heir');
  for (const g of c.guardians) add(g, 'guardian');
  const assets: StoredAsset[] = s.assets.map((a) => ({
    index: a.index,
    kind: a.asset.kind,
    token: getAddress(a.asset.token),
    id: a.asset.id.toString(),
    decimals: a.token.decimals,
  }));
  return {
    vault: getAddress(s.vault),
    owner: getAddress(c.owner),
    drill: c.drill,
    state: s.state,
    pending: s.pending,
    lastAlive: s.lastAlive,
    lateAt: s.lateAt,
    windowEndsAt: s.windowEndsAt,
    recoveryTarget: s.recoveryTarget,
    expiresAt: s.expiresAt,
    expired: s.expired,
    released: isReleasedState(s.state),
    nextCheckAt: decision.action !== null ? now : decision.nextCheckAt,
    roles,
    assets,
    blockNumber: s.blockNumber,
    blockTimestamp: now,
  };
}
```

`apps/backend/src/chain/sdk.ts`:

```ts
import { type AtropyleClient, keeperTick, timelineOf } from '@atropyle/sdk';
import { getAddress, type WalletClient } from 'viem';
import type { ChainPort } from './port';
import { deriveView } from './view';

/**
 * The real chain: the SDK over the deployment's read transport (plan ruling 6: MAX_BATCH 3, 100-block log ranges)
 * and, for the keeper only, the wallet from keeper/signer.ts (null = dry run).
 */
export function createSdkChain(atro: AtropyleClient, o: { wallet: WalletClient | null }): ChainPort {
  return {
    factoryBlock: atro.deployment.factoryBlock,
    async head() {
      const b = await atro.publicClient.getBlock();
      return { number: b.number, timestamp: b.timestamp };
    },
    scan: (r) => atro.scan({ resume: r.resume, toBlock: r.toBlock }),
    async blockTime(blockNumber) {
      return (await atro.publicClient.getBlock({ blockNumber })).timestamp;
    },
    async view(vault) {
      const snap = await atro.vault(vault).snapshot();
      const engine = await atro.engineFor(snap.binding.cpu, snap.binding.policyId);
      return deriveView(snap, timelineOf(engine, snap));
    },
    isVault: (vault) => atro.vault(vault).registered(),
    keeper: (run) =>
      keeperTick(atro, run.vaults, {
        wallet: o.wallet ?? undefined,
        maxTx: run.maxTx,
        lastDistributeAt: (vault) => run.lastDistributeAt.get(getAddress(vault)) ?? null,
      }),
    integrity: () => atro.integrity(),
  };
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `npx vitest run test/unit/view.test.ts test/unit/sdk-chain.test.ts` (from `apps/backend`)
Expected: PASS, 9 tests.

- [ ] **Step 6: Write the failing signer and zero-key tests**

`apps/backend/test/unit/signer.test.ts`:

```ts
import { http, zeroAddress } from 'viem';
import { toAccount } from 'viem/accounts';
import { xLayer } from 'viem/chains';
import { describe, expect, it } from 'vitest';
import { KEEPER_KEY_INVALID, keeperSigner, keeperSignerFromEnv } from '../../src/keeper/signer';

const transport = http('http://127.0.0.1:1');
// A signer that holds no key: it refuses to sign, which these tests never ask it to do.
const refuse = async (): Promise<never> => {
  throw new Error('test account cannot sign');
};
const fakeAccount = () =>
  toAccount({ address: zeroAddress, signMessage: refuse, signTransaction: refuse, signTypedData: refuse });

describe('keeper signer (the one exception to the zero-key rule)', () => {
  it('runs dry when the secret is absent or blank', () => {
    expect(keeperSigner(undefined, xLayer, transport)).toEqual({ wallet: null, error: null });
    expect(keeperSigner('   ', xLayer, transport)).toEqual({ wallet: null, error: null });
    expect(keeperSignerFromEnv(() => undefined, xLayer, transport)).toEqual({ wallet: null, error: null });
  });

  it('builds a wallet client from the account and passes the value with a 0x prefix', () => {
    const seen: string[] = [];
    const s = keeperSigner('test-keeper', xLayer, transport, (k) => {
      seen.push(k);
      return fakeAccount();
    });
    expect(seen).toEqual(['0xtest-keeper']);
    expect(s.error).toBeNull();
    expect(s.wallet?.account?.address).toBe(zeroAddress);
    expect(s.wallet?.chain?.id).toBe(196);
  });

  it('turns an unusable secret into a dry run with an error that never repeats the value', () => {
    const s = keeperSigner('not-a-key', xLayer, transport);
    expect(s).toEqual({ wallet: null, error: KEEPER_KEY_INVALID });
    expect(KEEPER_KEY_INVALID).not.toContain('not-a-key');
  });
});
```

`apps/backend/test/unit/zero-key.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
/** Everything that ships or builds. build.ts arrives in Task 11; a missing path is simply skipped. */
const SOURCES = ['src', 'emails', 'scripts', 'build.ts'];

function files(p: string): string[] {
  const full = join(ROOT, p);
  if (!existsSync(full)) return [];
  if (statSync(full).isFile()) return [p];
  return readdirSync(full).flatMap((f) => files(join(p, f)));
}

describe('zero keys (AGENTS.md)', () => {
  const all = SOURCES.flatMap(files)
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f) => ({ file: f.replace(/\\/g, '/'), text: readFileSync(join(ROOT, f), 'utf8') }));

  it('reads KEEPER_KEY and builds an account from a key in exactly one file', () => {
    const hits = all.filter((f) => /privateKeyToAccount|mnemonicToAccount|hdKeyToAccount|KEEPER_KEY/.test(f.text));
    expect(hits.map((f) => f.file)).toEqual(['src/keeper/signer.ts']);
  });

  it('has no PRIVATE_KEY variable and never sends a raw transaction itself', () => {
    for (const f of all) {
      expect(f.text, f.file).not.toMatch(/PRIVATE_KEY|sendRawTransaction|eth_sendRawTransaction|seed phrase|mnemonic/i);
    }
  });
});
```

> The string `KEEPER_KEY` must not appear in any other file under `src/`, `emails/` or `scripts/`, comments included. Other files say "the keeper secret".

- [ ] **Step 7: Run them to verify they fail**

Run: `npx vitest run test/unit/signer.test.ts test/unit/zero-key.test.ts` (from `apps/backend`)
Expected: FAIL. `signer.test.ts` cannot import `../../src/keeper/signer`, and the first zero-key test finds no file (`[]` instead of `['src/keeper/signer.ts']`).

- [ ] **Step 8: Write the signer**

`apps/backend/src/keeper/signer.ts`:

```ts
import { type Chain, createWalletClient, type Hex, type Transport, type WalletClient } from 'viem';
import { type LocalAccount, privateKeyToAccount } from 'viem/accounts';
import type { Env } from '../config';

/*
 * THE ONLY FILE OF THE REPOSITORY THAT READS KEEPER_KEY OR BUILDS AN ACCOUNT FROM A KEY (AGENTS.md, zero-key rule).
 *
 * KEEPER_KEY is a Supabase secret that only the maintainer sets (apps/backend/README.md). It funds gas for poke and
 * distribute, which are permissionless and only ever pay heirs or the recovery wallet: a stolen keeper key can burn
 * the keeper's gas, never move a vault's assets. Without it the keeper runs dry. Tests never pass a key: they inject
 * `toAccount`, and on anvil the e2e uses an unlocked account instead.
 */
export const KEEPER_KEY_INVALID =
  'KEEPER_KEY is set but cannot be read as a private key; the keeper runs dry until it is replaced.';

export type ToAccount = (key: Hex) => LocalAccount;

export interface KeeperSigner {
  wallet: WalletClient | null;
  /** Set when the secret exists but is unusable. Never contains the secret. */
  error: string | null;
}

export function keeperSigner(
  key: string | undefined,
  chain: Chain,
  transport: Transport,
  toAccount: ToAccount = privateKeyToAccount,
): KeeperSigner {
  const raw = key?.trim() ?? '';
  if (raw === '') return { wallet: null, error: null };
  const hex = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  try {
    return { wallet: createWalletClient({ account: toAccount(hex), chain, transport }), error: null };
  } catch {
    return { wallet: null, error: KEEPER_KEY_INVALID };
  }
}

export function keeperSignerFromEnv(env: Env, chain: Chain, transport: Transport): KeeperSigner {
  return keeperSigner(env('KEEPER_KEY'), chain, transport);
}
```

- [ ] **Step 9: Run them to verify they pass**

Run: `npx vitest run test/unit/signer.test.ts test/unit/zero-key.test.ts` (from `apps/backend`)
Expected: PASS, 5 tests.

- [ ] **Step 10: Write the fake chain and the test environment**

`apps/backend/test/helpers/fake-chain.ts`:

```ts
import type { CreatedVault, IntegrityReport, KeeperReport, ScanResult, VaultEvent } from '@atropyle/sdk';
import type { Address } from 'viem';
import type { ChainHead, ChainPort, KeeperRun, ScanRequest, VaultView } from '../../src/chain/port';
import { T0 } from './fixtures';

/** An in-memory chain for unit tests. Every field is public so a test can set the scene and read the calls. */
export class FakeChain implements ChainPort {
  factoryBlock = 100n;
  headBlock = 200n;
  headTime = T0;
  created: CreatedVault[] = [];
  logs: VaultEvent[] = [];
  /** Keyed by lowercase address. */
  views = new Map<string, VaultView>();
  registered = new Set<string>();
  /** Return true to make the scan of [from, to] throw (an RPC failure). */
  failScan: ((from: bigint, to: bigint) => boolean) | null = null;
  /** Lowercase addresses whose view() throws. */
  failView = new Set<string>();
  keeperImpl: (run: KeeperRun) => Promise<KeeperReport> = async (run) => ({
    ranAt: this.headTime,
    dryRun: true,
    keeper: null,
    balance: null,
    stopped: null,
    sent: 0,
    outcomes: run.vaults.map((vault) => ({ vault, decision: null, status: 'idle', nextCheckAt: null })),
  });
  integrityImpl: () => Promise<IntegrityReport> = async () => ({
    ok: true,
    chainId: 196,
    blockNumber: this.headBlock,
    blockTimestamp: this.headTime,
    rpcs: 2,
    checks: [{ name: 'factory code', ok: true }],
    warnings: [],
  });
  calls = { scan: [] as ScanRequest[], view: [] as Address[], keeper: [] as KeeperRun[] };

  /** Stores the view and registers the vault with the factory. */
  setView(v: VaultView): void {
    this.views.set(v.vault.toLowerCase(), v);
    this.registered.add(v.vault.toLowerCase());
  }

  async head(): Promise<ChainHead> {
    return { number: this.headBlock, timestamp: this.headTime };
  }

  async scan(o: ScanRequest): Promise<ScanResult> {
    this.calls.scan.push(o);
    const from = o.resume.toBlock + 1n;
    const to = o.toBlock;
    if (from > to) {
      const cursor = { toBlock: from - 1n, vaults: o.resume.vaults };
      return { fromBlock: from, toBlock: from - 1n, created: [], events: [], cursor, truncated: false };
    }
    if (this.failScan?.(from, to)) throw new Error(`scan ${from}-${to} failed`);
    const created = this.created.filter((c) => c.blockNumber >= from && c.blockNumber <= to);
    const vaults = [...o.resume.vaults, ...created.map((c) => c.vault)];
    const known = new Set(vaults.map((v) => v.toLowerCase()));
    const events = this.logs.filter(
      (e) => e.blockNumber >= from && e.blockNumber <= to && known.has(e.address.toLowerCase()),
    );
    return { fromBlock: from, toBlock: to, created, events, cursor: { toBlock: to, vaults }, truncated: false };
  }

  /** One second per block, ending at headTime. */
  async blockTime(block: bigint): Promise<bigint> {
    return this.headTime - (this.headBlock - block);
  }

  async view(vault: Address): Promise<VaultView> {
    this.calls.view.push(vault);
    const key = vault.toLowerCase();
    if (this.failView.has(key)) throw new Error(`view of ${vault} failed`);
    const v = this.views.get(key);
    if (!v) throw new Error(`no view for ${vault}`);
    return v;
  }

  async isVault(vault: Address): Promise<boolean> {
    return this.registered.has(vault.toLowerCase());
  }

  async keeper(run: KeeperRun): Promise<KeeperReport> {
    this.calls.keeper.push(run);
    return this.keeperImpl(run);
  }

  async integrity(): Promise<IntegrityReport> {
    return this.integrityImpl();
  }
}
```

`apps/backend/test/helpers/deps.ts`:

```ts
import { type FakeClock, fakeClock } from '../../src/clock';
import type { Config } from '../../src/config';
import type { Sql } from '../../src/db/sql';
import type { Deps } from '../../src/deps';
import { type MemoryLog, memoryLog } from '../../src/log';
import { type CaptureMailer, captureMailer } from '../../src/mail/mailer';
import { FakeChain } from './fake-chain';

export function testConfig(over: Partial<Config> = {}): Config {
  return {
    siteUrl: 'https://atropyle.test',
    siteHost: 'atropyle.test',
    allowedOrigins: ['https://atropyle.test'],
    apiUrl: 'https://ref.supabase.co/functions/v1',
    mailFrom: 'Atropyle <alerts@atropyle.test>',
    tokenSecret: 't'.repeat(32),
    cronSecret: 'c'.repeat(32),
    opsEmail: 'ops@atropyle.test',
    resendApiKey: null,
    rpcUrls: null,
    headMargin: 3,
    budgetMs: 50_000,
    maxBlocksPerRun: 2_000,
    stepBlocks: 500,
    keeperMaxTx: 20,
    ...over,
  };
}

export interface TestEnv {
  d: Deps;
  chain: FakeChain;
  mailer: CaptureMailer;
  clock: FakeClock;
  log: MemoryLog;
}

/** Deps over a test database with a fake chain, a capturing mailer, a fake clock and a memory log. */
export function testEnv(sql: Sql, o: { config?: Partial<Config>; keeperError?: string | null } = {}): TestEnv {
  const chain = new FakeChain();
  const mailer = captureMailer();
  const clock = fakeClock();
  const log = memoryLog();
  let n = 0;
  // Distinct, deterministic bytes per call: tokens differ and tests stay reproducible.
  const random = (size: number) => {
    n++;
    return new Uint8Array(size).map((_, i) => (n * 31 + i) % 256);
  };
  const d: Deps = {
    sql,
    chain,
    mailer,
    clock,
    log,
    config: testConfig(o.config),
    random,
    keeperError: o.keeperError ?? null,
  };
  return { d, chain, mailer, clock, log };
}
```

- [ ] **Step 11: Typecheck, lint and run the task's tests**

```bash
npx biome check --write apps/backend
npm run typecheck
npx biome ci .
```

Then, from `apps/backend`: `npx vitest run test/unit/view.test.ts test/unit/sdk-chain.test.ts test/unit/signer.test.ts test/unit/zero-key.test.ts`
Expected: no errors; PASS, 14 tests. The helpers compile through the typecheck (they are used from Task 6 on).

- [ ] **Step 12: Commit**

```bash
git add apps/backend/src/chain/port.ts apps/backend/src/chain/view.ts apps/backend/src/chain/sdk.ts \
  apps/backend/src/keeper/signer.ts apps/backend/src/deps.ts apps/backend/test/helpers/fixtures.ts \
  apps/backend/test/helpers/fake-chain.ts apps/backend/test/helpers/deps.ts apps/backend/test/unit/view.test.ts \
  apps/backend/test/unit/sdk-chain.test.ts apps/backend/test/unit/signer.test.ts apps/backend/test/unit/zero-key.test.ts
git commit -m "feat(backend): chain port over the SDK, the keeper signer (the one KEEPER_KEY reader), test harness" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 6: Subscriptions: subscribe, confirm, unsubscribe, rate limits and idempotent delivery

This is the double opt-in of spec §9.2, §9.5 and §9.6. `subscribe` always answers `202 { ok: true }` and never says whether an email is known. Only hashes of tokens are stored, and rate-limit keys are HMACs of the IP or the email. Every email goes through `deliver()`: it claims a `deliveries` row (the primary key makes a notice idempotent), sends, then completes the row, or releases it on failure so the next tick tries again.

**Files:**
- Create: `apps/backend/src/store/subscriptions.ts`, `apps/backend/src/store/ratelimit.ts`, `apps/backend/src/store/deliveries.ts`
- Create: `apps/backend/src/mail/deliver.ts`
- Create: `apps/backend/src/functions/subscribe.ts`, `apps/backend/src/functions/confirm.ts`, `apps/backend/src/functions/unsubscribe.ts`
- Create: `apps/backend/test/helpers/http.ts`, `apps/backend/test/helpers/seed.ts`
- Test: `apps/backend/test/unit/subscriptions.test.ts`, `apps/backend/test/unit/deliver.test.ts`, `apps/backend/test/unit/subscribe.test.ts`

**Interfaces:**
- Consumes: `Sql`, `testDb`, `TestDb` (Task 1); `sha256Hex`, `hmacHex`, `randomToken`, `unsubToken`, `TOKEN_RE`, `route`, `json`, `readJson`, `invalid`, `HttpError`, `clientIp`, `isoAt`, `errorText`, `isRole`, `isLang` (Task 2); `composeEmail`, `Facts`, `EmailKind`, `MailError`, `Mail` (Tasks 3–4); `Deps`, `testEnv`, `VAULT`, `OWNER` (Task 5).
- Produces:
  - `store/subscriptions.ts`: `interface Subscriber { id: string; email: string; lang: Lang; role: Role; vault: Address }`, `type UpsertResult = { status: 'pending'; id: string } | { status: 'active' }`, `upsertPending(sql, o: { email; vault; role; lang; confirmHash; tokenSecret; nowIso }): Promise<UpsertResult>`, `confirmByHash(sql, hash, nowIso): Promise<(Subscriber & { was: 'pending' | 'active' }) | null>`, `deleteByUnsubHash(sql, hash): Promise<number>`, `activeSubscribers(sql, vault): Promise<Subscriber[]>`
  - `store/ratelimit.ts`: `HOUR_MS`, `hit(sql, key, nowMs): Promise<number>`, `retryAfterSeconds(nowMs): number`
  - `store/deliveries.ts`: `interface DeliveryKey { subscriptionId: string; kind: EmailKind; periodKey: string }`, `CLAIM_STALE_MS`, `claimDelivery(sql, key, nowMs): Promise<boolean>`, `completeDelivery(sql, key, providerId, nowMs)`, `releaseDelivery(sql, key)`
  - `mail/deliver.ts`: `interface Outbound { sub: Subscriber; kind: EmailKind; periodKey: string; facts?: Facts; confirmToken?: string }`, `interface DeliveryRun { sent; skipped; failed: number; stopped: boolean }`, `newRun()`, `MAX_FAILURES = 3`, `type DeliverResult = 'sent' | 'skipped' | 'failed'`, `deliver(d: Deps, o: Outbound, run?: DeliveryRun): Promise<DeliverResult>`
  - `functions/subscribe.ts`: `IP_LIMIT = 5`, `EMAIL_LIMIT = 3`, `isEmail(s)`, `parseSubscribe(body)`, `subscribe: Handler<Deps>`
  - `functions/confirm.ts`: `confirm: Handler<Deps>`; `functions/unsubscribe.ts`: `unsubscribe: Handler<Deps>`
  - Test helpers:
    - `http.ts`: `SITE`, `API`, `postJson(path, body, o?: { origin?: string | null; ip?: string })`, `getReq(path, o?)`, `bodyOf<T>(res)`, `tokenFrom(mail, 'confirm' | 'unsubscribe')`
    - `seed.ts`: `activeSubscriber(sql, o: { email; vault; role; lang?; tokenSecret? }): Promise<Subscriber>`

- [ ] **Step 1: Write the test helpers**

`apps/backend/test/helpers/http.ts`:

```ts
import type { Mail } from '../../src/email/compose';

export const SITE = 'https://atropyle.test';
export const API = 'https://ref.supabase.co/functions/v1';

/** A browser POST from the site (origin) or, with origin: null, a server-to-server POST (mail client, pg_net). */
export function postJson(path: string, body: unknown, o: { origin?: string | null; ip?: string } = {}): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-forwarded-for': o.ip ?? '203.0.113.7',
  };
  if (o.origin !== null) headers.origin = o.origin ?? SITE;
  return new Request(`${API}/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
}

export function getReq(path: string, o: { origin?: string } = {}): Request {
  return new Request(`${API}/${path}`, { method: 'GET', headers: o.origin ? { origin: o.origin } : {} });
}

export async function bodyOf<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** The token after #t= in an email's confirm button or unsubscribe link. */
export function tokenFrom(mail: Mail, which: 'confirm' | 'unsubscribe'): string {
  const m = mail.text.match(new RegExp(`/alerts/${which}/#t=([A-Za-z0-9_-]{43})`));
  if (!m) throw new Error(`no ${which} token in the email`);
  return m[1];
}
```

`apps/backend/test/helpers/seed.ts`:

```ts
import type { Address } from 'viem';
import { sha256Hex, unsubToken } from '../../src/crypto';
import type { Sql } from '../../src/db/sql';
import type { Subscriber } from '../../src/store/subscriptions';
import type { Lang, Role } from '../../src/types';

/** An already confirmed subscription, as if the double opt-in had happened. */
export async function activeSubscriber(
  sql: Sql,
  o: { email: string; vault: Address; role: Role; lang?: Lang; tokenSecret?: string },
): Promise<Subscriber> {
  const lang = o.lang ?? 'en';
  const [row] = await sql.query<{ id: string }>(
    `insert into public.subscriptions (email, vault, role, lang, status, confirm_hash, confirmed_at)
     values ($1::text, $2::text, $3::text, $4::text, 'active', $5::text, now())
     returning id::text as id`,
    [o.email, o.vault.toLowerCase(), o.role, lang, await sha256Hex(`seed:${o.email}:${o.role}:${o.vault}`)],
  );
  const hash = await sha256Hex(await unsubToken(o.tokenSecret ?? 't'.repeat(32), row.id));
  await sql.query('update public.subscriptions set unsub_hash = $2::text where id = $1::bigint', [row.id, hash]);
  return { id: row.id, email: o.email, lang, role: o.role, vault: o.vault };
}
```

- [ ] **Step 2: Write the failing store tests**

`apps/backend/test/unit/subscriptions.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex, unsubToken } from '../../src/crypto';
import { claimDelivery, completeDelivery, releaseDelivery } from '../../src/store/deliveries';
import { HOUR_MS, hit, retryAfterSeconds } from '../../src/store/ratelimit';
import {
  activeSubscribers,
  confirmByHash,
  deleteByUnsubHash,
  upsertPending,
} from '../../src/store/subscriptions';
import { type TestDb, testDb } from '../helpers/db';
import { VAULT } from '../helpers/fixtures';
import { activeSubscriber } from '../helpers/seed';

const SECRET = 't'.repeat(32);
const NOW = '2026-11-23T12:00:00.000Z';
const h = (n: number) => String(n).repeat(64).slice(0, 64);

describe('subscription store', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
  });

  const pending = (email: string, confirmHash: string, lang: 'en' | 'vi' = 'en') =>
    upsertPending(db, { email, vault: VAULT, role: 'heir', lang, confirmHash, tokenSecret: SECRET, nowIso: NOW });

  it('keeps one row per (email, vault, role) whatever the case of the email, and refreshes it while pending', async () => {
    const a = await pending('Alice@Example.com', h(1));
    const b = await pending('alice@example.COM', h(2), 'vi');
    expect(a).toMatchObject({ status: 'pending' });
    expect(b).toEqual(a);
    const rows = await db.query<{ n: number; confirm_hash: string; lang: string; unsub_hash: string }>(
      'select count(*) over ()::int as n, confirm_hash, lang, unsub_hash from public.subscriptions',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ n: 1, confirm_hash: h(2), lang: 'vi' });
    if (a.status !== 'pending') throw new Error('unreachable');
    expect(rows[0].unsub_hash).toBe(await sha256Hex(await unsubToken(SECRET, a.id)));
  });

  it('confirms once, stays active, and leaves an active row untouched by a new sign-up', async () => {
    await pending('bob@example.com', h(3));
    const first = await confirmByHash(db, h(3), NOW);
    expect(first).toMatchObject({ email: 'bob@example.com', role: 'heir', vault: VAULT, lang: 'en', was: 'pending' });
    expect(await confirmByHash(db, h(3), NOW)).toMatchObject({ was: 'active' });
    expect(await confirmByHash(db, h(9), NOW)).toBeNull();
    expect(await pending('bob@example.com', h(4))).toEqual({ status: 'active' });
    const [row] = await db.query<{ confirm_hash: string }>('select confirm_hash from public.subscriptions');
    expect(row.confirm_hash).toBe(h(3));
  });

  it('deletes by unsubscribe hash and lists only active subscribers', async () => {
    const sub = await activeSubscriber(db, { email: 'carol@example.com', vault: VAULT, role: 'owner' });
    await pending('dave@example.com', h(5));
    expect((await activeSubscribers(db, VAULT)).map((s) => s.email)).toEqual(['carol@example.com']);
    const token = await unsubToken(SECRET, sub.id);
    expect(await deleteByUnsubHash(db, await sha256Hex(token))).toBe(1);
    expect(await deleteByUnsubHash(db, await sha256Hex(token))).toBe(0);
    expect(await activeSubscribers(db, VAULT)).toEqual([]);
  });

  it('counts hits in fixed one-hour windows', async () => {
    const t = Date.parse('2026-11-23T12:59:00.000Z');
    expect(await hit(db, 'k', t)).toBe(1);
    expect(await hit(db, 'k', t + 30_000)).toBe(2);
    expect(await hit(db, 'k', t + 60_000)).toBe(1);
    expect(retryAfterSeconds(t)).toBe(60);
    expect(retryAfterSeconds(t + HOUR_MS)).toBe(60);
  });

  it('claims a delivery once, lets a stale unsent claim be taken again, and never re-claims a sent one', async () => {
    const sub = await activeSubscriber(db, { email: 'erin@example.com', vault: VAULT, role: 'owner' });
    const key = { subscriptionId: sub.id, kind: 'checkin-50' as const, periodKey: '150' };
    const t = Date.parse(NOW);
    expect(await claimDelivery(db, key, t)).toBe(true);
    expect(await claimDelivery(db, key, t + 60_000)).toBe(false);
    expect(await claimDelivery(db, key, t + 11 * 60_000)).toBe(true);
    await releaseDelivery(db, key);
    expect(await claimDelivery(db, key, t + 12 * 60_000)).toBe(true);
    await completeDelivery(db, key, 'msg_1', t + 12 * 60_000);
    await releaseDelivery(db, key);
    expect(await claimDelivery(db, key, t + 60 * 60_000)).toBe(false);
    const [row] = await db.query<{ provider_id: string }>('select provider_id from public.deliveries');
    expect(row.provider_id).toBe('msg_1');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run test/unit/subscriptions.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/store/deliveries` (and the other stores) do not exist.

- [ ] **Step 4: Write the three stores**

`apps/backend/src/store/subscriptions.ts`:

```ts
import { type Address, getAddress } from 'viem';
import { sha256Hex, unsubToken } from '../crypto';
import type { Sql } from '../db/sql';
import type { Lang, Role } from '../types';

export interface Subscriber {
  id: string;
  email: string;
  lang: Lang;
  role: Role;
  vault: Address;
}

export type UpsertResult = { status: 'pending'; id: string } | { status: 'active' };

interface SubscriberRow {
  id: string;
  email: string;
  lang: Lang;
  role: Role;
  vault: string;
}

const toSubscriber = (r: SubscriberRow): Subscriber => ({
  id: r.id,
  email: r.email,
  lang: r.lang,
  role: r.role,
  vault: getAddress(r.vault),
});

/**
 * Creates or refreshes the pending row of (email, vault, role) with a new confirm hash. An active row is left as it
 * is and the caller sends nothing; the HTTP answer is the same either way (spec §9.6). email is citext, so the
 * unique constraint ignores case; the handler also trims and lowercases it.
 */
export async function upsertPending(
  sql: Sql,
  o: { email: string; vault: Address; role: Role; lang: Lang; confirmHash: string; tokenSecret: string; nowIso: string },
): Promise<UpsertResult> {
  return sql.begin(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `insert into public.subscriptions (email, vault, role, lang, confirm_hash, created_at)
       values ($1::text, $2::text, $3::text, $4::text, $5::text, $6::timestamptz)
       on conflict (email, vault, role) do update
         set confirm_hash = excluded.confirm_hash, lang = excluded.lang, created_at = excluded.created_at
         where public.subscriptions.status = 'pending'
       returning id::text as id`,
      [o.email, o.vault.toLowerCase(), o.role, o.lang, o.confirmHash, o.nowIso],
    );
    if (rows.length === 0) return { status: 'active' };
    const id = rows[0].id;
    const unsubHash = await sha256Hex(await unsubToken(o.tokenSecret, id));
    await tx.query('update public.subscriptions set unsub_hash = $2::text where id = $1::bigint and unsub_hash is null', [
      id,
      unsubHash,
    ]);
    return { status: 'pending', id };
  });
}

/** Activates the row whose confirm hash matches. `was` tells the caller whether this is the first confirmation. */
export async function confirmByHash(
  sql: Sql,
  hash: string,
  nowIso: string,
): Promise<(Subscriber & { was: 'pending' | 'active' }) | null> {
  const rows = await sql.query<SubscriberRow & { was: 'pending' | 'active' }>(
    `with prev as (
       select id, status from public.subscriptions where confirm_hash = $1::text order by id limit 1 for update
     )
     update public.subscriptions s
        set status = 'active', confirmed_at = coalesce(s.confirmed_at, $2::timestamptz)
       from prev
      where s.id = prev.id
     returning s.id::text as id, s.email::text as email, s.lang, s.role, s.vault, prev.status as was`,
    [hash, nowIso],
  );
  return rows.length === 0 ? null : { ...toSubscriber(rows[0]), was: rows[0].was };
}

/** Unsubscribing deletes the row (spec §9.5); its deliveries go with it (on delete cascade). */
export async function deleteByUnsubHash(sql: Sql, hash: string): Promise<number> {
  const rows = await sql.query('delete from public.subscriptions where unsub_hash = $1::text returning id', [hash]);
  return rows.length;
}

export async function activeSubscribers(sql: Sql, vault: Address): Promise<Subscriber[]> {
  const rows = await sql.query<SubscriberRow>(
    `select id::text as id, email::text as email, lang, role, vault from public.subscriptions
      where vault = $1::text and status = 'active' order by id`,
    [vault.toLowerCase()],
  );
  return rows.map(toSubscriber);
}
```

`apps/backend/src/store/ratelimit.ts`:

```ts
import type { Sql } from '../db/sql';

export const HOUR_MS = 3_600_000;

/** Counts one request against `key` in its fixed one-hour window and returns the count so far (spec §9.2). */
export async function hit(sql: Sql, key: string, nowMs: number): Promise<number> {
  const windowStart = new Date(Math.floor(nowMs / HOUR_MS) * HOUR_MS).toISOString();
  const rows = await sql.query<{ count: number }>(
    `insert into public.rate_limits (key, window_start, count) values ($1::text, $2::timestamptz, 1)
     on conflict (key, window_start) do update set count = public.rate_limits.count + 1
     returning count`,
    [key, windowStart],
  );
  return rows[0].count;
}

/** Seconds until the current window ends: the Retry-After of a 429. */
export function retryAfterSeconds(nowMs: number): number {
  return Math.ceil((HOUR_MS - (nowMs % HOUR_MS)) / 1000);
}
```

`apps/backend/src/store/deliveries.ts`:

```ts
import type { Sql } from '../db/sql';
import type { EmailKind } from '../email/kinds';

export interface DeliveryKey {
  subscriptionId: string;
  kind: EmailKind;
  periodKey: string;
}

/** An unsent claim older than this belongs to a run that died; another run may take it. */
export const CLAIM_STALE_MS = 10 * 60_000;

const keyParams = (k: DeliveryKey) => [k.subscriptionId, k.kind, k.periodKey];

/** True when this run may send the email: no row yet, or an unsent claim that went stale. */
export async function claimDelivery(sql: Sql, key: DeliveryKey, nowMs: number): Promise<boolean> {
  const rows = await sql.query(
    `insert into public.deliveries (subscription_id, kind, period_key, claimed_at)
     values ($1::bigint, $2::text, $3::text, $4::timestamptz)
     on conflict (subscription_id, kind, period_key) do update set claimed_at = excluded.claimed_at
       where public.deliveries.sent_at is null and public.deliveries.claimed_at < $5::timestamptz
     returning 1 as claimed`,
    [...keyParams(key), new Date(nowMs).toISOString(), new Date(nowMs - CLAIM_STALE_MS).toISOString()],
  );
  return rows.length > 0;
}

export async function completeDelivery(sql: Sql, key: DeliveryKey, providerId: string, nowMs: number): Promise<void> {
  await sql.query(
    `update public.deliveries set sent_at = $4::timestamptz, provider_id = $5::text
      where subscription_id = $1::bigint and kind = $2::text and period_key = $3::text`,
    [...keyParams(key), new Date(nowMs).toISOString(), providerId],
  );
}

/** Gives an unsent claim back, so the next tick tries again. A sent row is never released. */
export async function releaseDelivery(sql: Sql, key: DeliveryKey): Promise<void> {
  await sql.query(
    `delete from public.deliveries
      where subscription_id = $1::bigint and kind = $2::text and period_key = $3::text and sent_at is null`,
    keyParams(key),
  );
}
```

- [ ] **Step 5: Run the store test to verify it passes**

Run: `npx vitest run test/unit/subscriptions.test.ts` (from `apps/backend`)
Expected: PASS, 5 tests.

- [ ] **Step 6: Write the failing `deliver` test**

`apps/backend/test/unit/deliver.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deliver, MAX_FAILURES, newRun } from '../../src/mail/deliver';
import { MailError } from '../../src/mail/mailer';
import { type TestDb, testDb } from '../helpers/db';
import { testEnv } from '../helpers/deps';
import { VAULT } from '../helpers/fixtures';
import { activeSubscriber } from '../helpers/seed';

describe('deliver', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
  });

  it('sends once per (subscription, kind, period) and records the provider id', async () => {
    const env = testEnv(db);
    const sub = await activeSubscriber(db, { email: 'owner@example.com', vault: VAULT, role: 'owner' });
    const o = { sub, kind: 'checkin-50' as const, periodKey: '150', facts: { deadline: 1795442700n } };
    const run = newRun();
    expect(await deliver(env.d, o, run)).toBe('sent');
    expect(await deliver(env.d, o, run)).toBe('skipped');
    expect(run).toEqual({ sent: 1, skipped: 1, failed: 0, stopped: false });
    expect(env.mailer.sent).toHaveLength(1);
    expect(env.mailer.sent[0].to).toBe('owner@example.com');
    expect(env.mailer.sent[0].idempotencyKey).toMatch(/^[0-9a-f]{64}$/);
    const [row] = await db.query<{ provider_id: string }>('select provider_id from public.deliveries');
    expect(row.provider_id).toBe('capture-1');
  });

  it('releases the claim when the send fails, so the next run sends exactly once (review focus 2)', async () => {
    const env = testEnv(db);
    const sub = await activeSubscriber(db, { email: 'heir@example.com', vault: VAULT, role: 'heir' });
    const o = { sub, kind: 'released' as const, periodKey: `0x${'1'.repeat(64)}`, facts: { tx: `0x${'1'.repeat(64)}` as const, released: 'inheritance' as const } };
    env.mailer.failNext(1, new MailError('Resend answered 500', 500, null));
    const run = newRun();
    expect(await deliver(env.d, o, run)).toBe('failed');
    expect(run).toMatchObject({ failed: 1, stopped: false });
    expect(await db.query('select 1 from public.deliveries')).toEqual([]);
    expect(env.log.lines.some((l) => l.msg === 'email not sent' && !JSON.stringify(l.data).includes('heir@'))).toBe(true);
    expect(await deliver(env.d, o)).toBe('sent');
    expect(await deliver(env.d, o)).toBe('skipped');
    expect(env.mailer.sent).toHaveLength(1);
  });

  it('stops the run on a 429 or after MAX_FAILURES failures', async () => {
    const env = testEnv(db);
    const sub = await activeSubscriber(db, { email: 'owner@example.com', vault: VAULT, role: 'owner' });
    const o = (periodKey: string) => ({ sub, kind: 'checkin-50' as const, periodKey, facts: { deadline: 1795442700n } });
    env.mailer.failNext(1, new MailError('Resend rate limit', 429, 1000));
    const limited = newRun();
    expect(await deliver(env.d, o('1'), limited)).toBe('failed');
    expect(limited.stopped).toBe(true);
    expect(await deliver(env.d, o('2'), limited)).toBe('failed');
    expect(env.mailer.sent).toHaveLength(0);

    env.mailer.failNext(MAX_FAILURES);
    const broken = newRun();
    for (const k of ['3', '4', '5']) await deliver(env.d, o(k), broken);
    expect(broken).toMatchObject({ failed: MAX_FAILURES, stopped: true });
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run test/unit/deliver.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/mail/deliver` does not exist.

- [ ] **Step 8: Write `deliver.ts`**

`apps/backend/src/mail/deliver.ts`:

```ts
import { sha256Hex, unsubToken } from '../crypto';
import type { Deps } from '../deps';
import { composeEmail, type Facts } from '../email/compose';
import type { EmailKind } from '../email/kinds';
import { errorText } from '../log';
import { claimDelivery, completeDelivery, type DeliveryKey, releaseDelivery } from '../store/deliveries';
import type { Subscriber } from '../store/subscriptions';
import { MailError } from './mailer';

export interface Outbound {
  sub: Subscriber;
  kind: EmailKind;
  /** What makes this email unique for the subscriber: a check-in block, a tx hash, 'once', 'expired'. */
  periodKey: string;
  facts?: Facts;
  /** The confirm email only. */
  confirmToken?: string;
}

/** Counters of one run, and the circuit breaker: once stopped, nothing more is sent in this run. */
export interface DeliveryRun {
  sent: number;
  skipped: number;
  failed: number;
  stopped: boolean;
}

export const newRun = (): DeliveryRun => ({ sent: 0, skipped: 0, failed: 0, stopped: false });
export const MAX_FAILURES = 3;
export type DeliverResult = 'sent' | 'skipped' | 'failed';

/**
 * Claim, compose, send, complete. On failure the claim is released and the caller retries next tick. If the send
 * succeeded but completing failed, the claim goes stale after CLAIM_STALE_MS and the retry carries the same Resend
 * Idempotency-Key, so the reader still gets one email. The log never carries the address.
 */
export async function deliver(d: Deps, o: Outbound, run: DeliveryRun = newRun()): Promise<DeliverResult> {
  // The breaker is open: nothing is claimed or sent, and the caller keeps the event for the next run.
  if (run.stopped) return 'failed';
  const key: DeliveryKey = { subscriptionId: o.sub.id, kind: o.kind, periodKey: o.periodKey };
  if (!(await claimDelivery(d.sql, key, d.clock.now()))) {
    run.skipped++;
    return 'skipped';
  }
  try {
    const mail = composeEmail(d.config, {
      kind: o.kind,
      lang: o.sub.lang,
      to: o.sub.email,
      vault: o.sub.vault,
      role: o.sub.role,
      unsubToken: await unsubToken(d.config.tokenSecret, o.sub.id),
      confirmToken: o.confirmToken,
      facts: o.facts,
      idempotencyKey: await sha256Hex(`${o.sub.id}:${o.kind}:${o.periodKey}`),
    });
    const { id } = await d.mailer.send(mail);
    await completeDelivery(d.sql, key, id, d.clock.now());
    run.sent++;
    return 'sent';
  } catch (e) {
    await releaseDelivery(d.sql, key).catch(() => undefined);
    run.failed++;
    if (run.failed >= MAX_FAILURES || (e instanceof MailError && e.status === 429)) run.stopped = true;
    d.log.warn('email not sent', { kind: o.kind, subscription: o.sub.id, error: errorText(e) });
    return 'failed';
  }
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npx vitest run test/unit/deliver.test.ts` (from `apps/backend`)
Expected: PASS, 3 tests.

- [ ] **Step 10: Write the failing handler test**

`apps/backend/test/unit/subscribe.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { unsubToken } from '../../src/crypto';
import { confirm } from '../../src/functions/confirm';
import { isEmail, subscribe } from '../../src/functions/subscribe';
import { unsubscribe } from '../../src/functions/unsubscribe';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { VAULT, VAULT2, view } from '../helpers/fixtures';
import { API, bodyOf, postJson, tokenFrom } from '../helpers/http';
import { activeSubscriber } from '../helpers/seed';

const PROBLEM = 'application/problem+json; charset=utf-8';

describe('subscribe, confirm, unsubscribe (spec §9.6)', () => {
  let db: TestDb;
  let env: TestEnv;
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
    env = testEnv(db);
    env.chain.setView(view());
  });

  const sub = (body: Record<string, unknown>, o: { ip?: string; origin?: string | null } = {}) =>
    subscribe(postJson('subscribe', { vault: VAULT, role: 'heir', lang: 'en', website: '', ...body }, o), env.d);
  const rows = () =>
    db.query<{ email: string; status: string; lang: string }>(
      'select email::text as email, status, lang from public.subscriptions order by id',
    );

  it('answers 202 { ok: true }, stores a pending row and sends one confirm email', async () => {
    const res = await sub({ email: 'heir@example.com' });
    expect(res.status).toBe(202);
    expect(await bodyOf(res)).toEqual({ ok: true });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://atropyle.test');
    expect(await rows()).toEqual([{ email: 'heir@example.com', status: 'pending', lang: 'en' }]);
    expect(env.mailer.byKind('confirm')).toHaveLength(1);
    expect(env.mailer.sent[0].to).toBe('heir@example.com');
  });

  it('treats the same email in another case or with spaces as one subscription (review focus 1)', async () => {
    await sub({ email: ' Heir@Example.COM ' });
    await sub({ email: 'heir@example.com', lang: 'vi' }, { ip: '203.0.113.8' });
    expect(await rows()).toEqual([{ email: 'heir@example.com', status: 'pending', lang: 'vi' }]);
    const [first, second] = env.mailer.byKind('confirm');
    expect(first.to).toBe('heir@example.com');
    // The first link no longer works: the second request replaced its hash.
    const stale = await confirm(postJson('confirm', { token: tokenFrom(first, 'confirm') }), env.d);
    expect(stale.status).toBe(404);
    const ok = await confirm(postJson('confirm', { token: tokenFrom(second, 'confirm') }), env.d);
    expect(await bodyOf(ok)).toEqual({ ok: true, vault: VAULT, role: 'heir' });
    // Active now: the same answer, and no new email.
    const again = await sub({ email: 'HEIR@example.com' }, { ip: '203.0.113.9' });
    expect(again.status).toBe(202);
    expect(await bodyOf(again)).toEqual({ ok: true });
    expect(env.mailer.byKind('confirm')).toHaveLength(2);
    expect(await rows()).toEqual([{ email: 'heir@example.com', status: 'active', lang: 'vi' }]);
  });

  it('confirms once, sends one welcome email, and stays idempotent', async () => {
    await sub({ email: 'heir@example.com' });
    const token = tokenFrom(env.mailer.byKind('confirm')[0], 'confirm');
    expect((await confirm(postJson('confirm', { token }), env.d)).status).toBe(200);
    const twice = await confirm(postJson('confirm', { token }), env.d);
    expect(await bodyOf(twice)).toEqual({ ok: true, vault: VAULT, role: 'heir' });
    expect(env.mailer.byKind('welcome')).toHaveLength(1);
  });

  it('answers 404 TOKEN_INVALID for an unknown or malformed confirm token', async () => {
    for (const token of ['x'.repeat(43), 'short', 42]) {
      const res = await confirm(postJson('confirm', { token }), env.d);
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toBe(PROBLEM);
      expect(await bodyOf(res)).toEqual({ type: 'about:blank', title: expect.any(String), status: 404, code: 'TOKEN_INVALID' });
    }
  });

  it('pretends to accept a bot that fills the honeypot, and stores nothing', async () => {
    const res = await sub({ email: 'bot@example.com', website: 'https://spam.example' });
    expect(res.status).toBe(202);
    expect(await bodyOf(res)).toEqual({ ok: true });
    expect(await rows()).toEqual([]);
    expect(env.mailer.sent).toEqual([]);
  });

  it('rejects bad input with 400 INVALID_INPUT and a non-vault with 400 NOT_A_VAULT', async () => {
    for (const body of [{ email: 'not-an-email' }, { email: 'a@b.co', role: 'admin' }, { email: 'a@b.co', lang: 'fr' }, { email: 'a@b.co', vault: '0x12' }]) {
      const res = await sub(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await bodyOf(res)).code).toBe('INVALID_INPUT');
    }
    const res = await sub({ email: 'a@b.co', vault: VAULT2 });
    expect(res.status).toBe(400);
    expect(await bodyOf(res)).toMatchObject({ code: 'NOT_A_VAULT', status: 400 });
  });

  it('limits 5 requests per hour per IP and 3 per hour per email, with Retry-After', async () => {
    for (let i = 0; i < 5; i++) expect((await sub({ email: `u${i}@example.com` })).status).toBe(202);
    const sixth = await sub({ email: 'u5@example.com' });
    expect(sixth.status).toBe(429);
    expect(await bodyOf(sixth)).toMatchObject({ code: 'RATE_LIMITED' });
    expect(Number(sixth.headers.get('retry-after'))).toBeGreaterThan(0);

    for (let i = 0; i < 3; i++) expect((await sub({ email: 'same@example.com' }, { ip: `198.51.100.${i}` })).status).toBe(202);
    expect((await sub({ email: 'Same@Example.com' }, { ip: '198.51.100.9' })).status).toBe(429);
    const keys = await db.query<{ key: string }>('select key from public.rate_limits');
    for (const k of keys) expect(k.key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses a POST from another origin', async () => {
    const res = await sub({ email: 'heir@example.com' }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(await rows()).toEqual([]);
  });

  it('unsubscribes with the JSON token or the RFC 8058 one-click POST, idempotently', async () => {
    const a = await activeSubscriber(db, { email: 'a@example.com', vault: VAULT, role: 'heir' });
    const b = await activeSubscriber(db, { email: 'b@example.com', vault: VAULT, role: 'owner' });
    const ta = await unsubToken(env.d.config.tokenSecret, a.id);
    const tb = await unsubToken(env.d.config.tokenSecret, b.id);
    const viaPage = await unsubscribe(postJson('unsubscribe', { token: ta }), env.d);
    expect(viaPage.status).toBe(200);
    expect(await bodyOf(viaPage)).toEqual({ ok: true });
    const oneClick = new Request(`${API}/unsubscribe?t=${tb}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    });
    expect((await unsubscribe(oneClick, env.d)).status).toBe(200);
    expect(await rows()).toEqual([]);
    expect(await bodyOf(await unsubscribe(postJson('unsubscribe', { token: ta }), env.d))).toEqual({ ok: true });
    expect(await bodyOf(await unsubscribe(postJson('unsubscribe', { token: 'garbage' }), env.d))).toEqual({ ok: true });
    const missing = await unsubscribe(postJson('unsubscribe', {}), env.d);
    expect(missing.status).toBe(400);
  });

  it('accepts ordinary addresses and refuses broken ones', () => {
    for (const ok of ['a@b.co', 'first.last+tag@sub.example.org', 'x@xn--80ak6aa92e.com']) expect(isEmail(ok), ok).toBe(true);
    for (const bad of ['', 'a@b', '@b.co', 'a@@b.co', 'a b@c.co', 'a@b.co\n', '<a@b.co>', `${'a'.repeat(65)}@b.co`]) {
      expect(isEmail(bad), bad).toBe(false);
    }
  });
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `npx vitest run test/unit/subscribe.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/functions/confirm` (and the other handlers) do not exist.

- [ ] **Step 12: Write the three handlers**

`apps/backend/src/functions/subscribe.ts`:

```ts
import { type Address, getAddress, isAddress } from 'viem';
import { hmacHex, randomToken, sha256Hex } from '../crypto';
import type { Deps } from '../deps';
import { clientIp, HttpError, invalid, json, readJson, route } from '../http';
import { isoAt } from '../clock';
import { deliver } from '../mail/deliver';
import { hit, retryAfterSeconds } from '../store/ratelimit';
import { upsertPending } from '../store/subscriptions';
import { isLang, isRole, type Lang, type Role } from '../types';

/** Spec §9.2: 5 sign-ups per hour per IP, 3 per hour per email. */
export const IP_LIMIT = 5;
export const EMAIL_LIMIT = 3;

/** A practical check: one @, a dotted domain, no spaces, control characters or brackets, RFC 5321 lengths. */
export function isEmail(s: string): boolean {
  if (s.length < 3 || s.length > 254) return false;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c <= 0x20 || c === 0x7f) return false;
  }
  if (/[<>()[\]\\,;:"]/.test(s)) return false;
  const at = s.indexOf('@');
  if (at < 1 || at !== s.lastIndexOf('@') || at > 64) return false;
  const domain = s.slice(at + 1);
  return /^[^.]+(\.[^.]+)+$/.test(domain) && !domain.startsWith('-');
}

export interface SubscribeInput {
  email: string;
  vault: Address;
  role: Role;
  lang: Lang;
  website: string;
}

export function parseSubscribe(body: Record<string, unknown>): SubscribeInput {
  const { vault, role, lang } = body;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const website = body.website ?? '';
  if (!isEmail(email)) throw invalid('email is not a valid email address.');
  if (typeof vault !== 'string' || !isAddress(vault, { strict: false })) throw invalid('vault is not an address.');
  if (!isRole(role)) throw invalid('role must be owner, guardian or heir.');
  if (!isLang(lang)) throw invalid('lang must be en or vi.');
  if (typeof website !== 'string') throw invalid('website must be a string.');
  return { email, vault: getAddress(vault), role, lang, website };
}

const rateLimited = (nowMs: number) =>
  new HttpError(429, 'RATE_LIMITED', 'Too many requests. Try again later.', {
    'retry-after': String(retryAfterSeconds(nowMs)),
  });

/**
 * POST /subscribe (spec §9.6). The answer is 202 { ok: true } whether or not the email is known; only a bad
 * request, an address that is not a vault or a rate limit gets another answer.
 */
export const subscribe = route<Deps>({ method: 'POST', cors: 'site' }, async (req, d) => {
  const input = parseSubscribe(await readJson(req));
  if (input.website.trim() !== '') return json({ ok: true }, 202);
  const now = d.clock.now();
  if ((await hit(d.sql, await hmacHex(d.config.tokenSecret, `ip:${clientIp(req)}`), now)) > IP_LIMIT) {
    throw rateLimited(now);
  }
  if ((await hit(d.sql, await hmacHex(d.config.tokenSecret, `email:${input.email}`), now)) > EMAIL_LIMIT) {
    throw rateLimited(now);
  }
  if (!(await d.chain.isVault(input.vault))) {
    throw new HttpError(400, 'NOT_A_VAULT', 'This address is not an Atropyle vault on X Layer.');
  }
  const token = randomToken((n) => d.random(n));
  const confirmHash = await sha256Hex(token);
  const r = await upsertPending(d.sql, {
    email: input.email,
    vault: input.vault,
    role: input.role,
    lang: input.lang,
    confirmHash,
    tokenSecret: d.config.tokenSecret,
    nowIso: isoAt(now),
  });
  if (r.status === 'pending') {
    const sub = { id: r.id, email: input.email, lang: input.lang, role: input.role, vault: input.vault };
    // A new hash per request, so a repeated sign-up sends a fresh link; the email limit caps how often.
    await deliver(d, { sub, kind: 'confirm', periodKey: confirmHash, confirmToken: token });
  }
  return json({ ok: true }, 202);
});
```

`apps/backend/src/functions/confirm.ts`:

```ts
import { isoAt } from '../clock';
import { sha256Hex, TOKEN_RE } from '../crypto';
import type { Deps } from '../deps';
import { HttpError, json, readJson, route } from '../http';
import { deliver } from '../mail/deliver';
import { confirmByHash } from '../store/subscriptions';

const tokenInvalid = () => new HttpError(404, 'TOKEN_INVALID', 'This link is not valid or has expired.');

/** POST /confirm { token } (spec §9.6): activates the subscription and sends the welcome email once. */
export const confirm = route<Deps>({ method: 'POST', cors: 'site' }, async (req, d) => {
  const { token } = await readJson(req);
  if (typeof token !== 'string' || !TOKEN_RE.test(token)) throw tokenInvalid();
  const sub = await confirmByHash(d.sql, await sha256Hex(token), isoAt(d.clock.now()));
  if (!sub) throw tokenInvalid();
  if (sub.was === 'pending') await deliver(d, { sub, kind: 'welcome', periodKey: 'once' });
  return json({ ok: true, vault: sub.vault, role: sub.role });
});
```

`apps/backend/src/functions/unsubscribe.ts`:

```ts
import { sha256Hex, TOKEN_RE } from '../crypto';
import type { Deps } from '../deps';
import { invalid, json, readJson, route } from '../http';
import { deleteByUnsubHash } from '../store/subscriptions';

/**
 * POST /unsubscribe (spec §9.6): { token } from the web page, or ?t=<token> with the RFC 8058 one-click body that
 * mail clients send without an Origin. Always 200 { ok: true } once a token is given, known or not.
 */
export const unsubscribe = route<Deps>({ method: 'POST', cors: 'site', strictOrigin: false }, async (req, d) => {
  let token = new URL(req.url).searchParams.get('t');
  if (token === null && (req.headers.get('content-type') ?? '').includes('application/json')) {
    const body = await readJson(req);
    token = typeof body.token === 'string' ? body.token : null;
  }
  if (token === null || token === '') throw invalid('token is required.');
  if (TOKEN_RE.test(token)) await deleteByUnsubHash(d.sql, await sha256Hex(token));
  return json({ ok: true });
});
```

- [ ] **Step 13: Run every test of the task to verify they pass**

Run: `npx vitest run test/unit/subscriptions.test.ts test/unit/deliver.test.ts test/unit/subscribe.test.ts` (from `apps/backend`)
Expected: PASS, 5 + 3 + 10 = 18 tests.

- [ ] **Step 14: Typecheck and lint**

```bash
npx biome check --write apps/backend
npm run typecheck
npx biome ci .
```

Expected: no errors.

- [ ] **Step 15: Commit**

```bash
git add apps/backend/src/store/subscriptions.ts apps/backend/src/store/ratelimit.ts apps/backend/src/store/deliveries.ts \
  apps/backend/src/mail/deliver.ts apps/backend/src/functions/subscribe.ts apps/backend/src/functions/confirm.ts \
  apps/backend/src/functions/unsubscribe.ts apps/backend/test/helpers/http.ts apps/backend/test/helpers/seed.ts \
  apps/backend/test/unit/subscriptions.test.ts apps/backend/test/unit/deliver.test.ts apps/backend/test/unit/subscribe.test.ts
git commit -m "feat(backend): double opt-in subscribe, confirm and one-click unsubscribe with idempotent delivery" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 7: The indexer: cursor, events, vault views

`tick` phase 1 (spec §9.3.1). It scans logs from the stored cursor up to `head − HEAD_MARGIN`, at most 2,000 blocks per run, in steps of `stepBlocks` (500). Each step does all of its reads first: the logs, the block times of their blocks, and a fresh view of every vault the step touched. It then writes everything, cursor included, in one transaction. A failed read or write leaves the cursor at the last committed step, and the next run repeats only that step. Because the `vault_events` primary key dedupes, a repeated step never stores an event twice, so it never mails one twice either.

**Files:**
- Create: `apps/backend/src/store/meta.ts`, `apps/backend/src/store/vaults.ts`, `apps/backend/src/tick/indexer.ts`
- Modify: `apps/backend/test/helpers/seed.ts` (add `seedVault`)
- Test: `apps/backend/test/unit/meta.test.ts`, `apps/backend/test/unit/indexer.test.ts`

**Interfaces:**
- Consumes: `Sql`, `toIso` (Task 1); `isoAt`, `errorText` (Task 2); `ChainHead`, `VaultView`, `StoredAsset`, `Deps`, `FakeChain`, fixtures, `testEnv` (Task 5). From `@atropyle/sdk`: `stringify`, `CreatedVault`, `VaultEvent`, `StateName`.
- Produces:
  - `store/meta.ts`: `CURSOR = 'logs'`, `getCursor(sql, name?): Promise<bigint | null>`, `setCursor(sql, block, nowIso, name?)`, `getMeta<T>(sql, key): Promise<{ value: T; updatedAt: string } | null>`, `setMeta(sql, key, value: unknown, nowIso)`, `tryLease(sql, key, nowMs, ttlMs): Promise<boolean>`, `releaseLease(sql, key)`
  - `store/vaults.ts`: `insertCreated(sql, c: CreatedVault, nowIso)`, `insertEvents(sql, events: readonly { event: VaultEvent; at: bigint }[]): Promise<number>`, `saveView(sql, v: VaultView, nowIso)`, `knownVaults(sql): Promise<Address[]>`, `interface VaultRow` (fields below), `getVault(sql, vault): Promise<VaultRow | null>`
  - `VaultRow`: `address, owner: Address; drill: boolean; createdBlock: bigint; state, pendingState: StateName; lastAlive, lastAliveBlock, lateAt, windowEndsAt: bigint | null; recoveryTarget: Address | null; nextCheckAt, expiresAt: bigint | null; expired, released: boolean; assets: StoredAsset[]; updatedBlock: bigint`
  - `tick/indexer.ts`: `interface IndexResult { from: bigint; to: bigint; target: bigint; steps: number; created: number; events: number; caughtUp: boolean; error: string | null }`, `runIndexer(d: Deps, head: ChainHead, deadlineMs: number): Promise<IndexResult>`
  - `meta` key `'indexer'`: `{ block: string; head: string; updatedAt: string }` (bigints as strings)
  - Test helper `seedVault(sql, v: VaultView, o?: { createdBlock?: bigint; aliveBlock?: bigint | null }): Promise<void>`

- [ ] **Step 1: Write the failing meta test**

`apps/backend/test/unit/meta.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getCursor, getMeta, releaseLease, setCursor, setMeta, tryLease } from '../../src/store/meta';
import { type TestDb, testDb } from '../helpers/db';

const T = Date.parse('2026-11-23T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('meta store', () => {
  let db: TestDb;
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
  });

  it('stores the cursor as a bigint', async () => {
    expect(await getCursor(db)).toBeNull();
    await setCursor(db, 76_567_034n, iso(T));
    await setCursor(db, 76_567_134n, iso(T));
    expect(await getCursor(db)).toBe(76_567_134n);
  });

  it('stores JSON values with bigints as strings', async () => {
    expect(await getMeta(db, 'indexer')).toBeNull();
    await setMeta(db, 'indexer', { block: 5n, head: 9n }, iso(T));
    expect(await getMeta(db, 'indexer')).toEqual({ value: { block: '5', head: '9' }, updatedAt: iso(T) });
  });

  it('grants a lease to one holder until it expires or is released', async () => {
    expect(await tryLease(db, 'lease:tick', T, 120_000)).toBe(true);
    expect(await tryLease(db, 'lease:tick', T + 60_000, 120_000)).toBe(false);
    expect(await tryLease(db, 'lease:tick', T + 121_000, 120_000)).toBe(true);
    await releaseLease(db, 'lease:tick');
    expect(await tryLease(db, 'lease:tick', T + 122_000, 120_000)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/unit/meta.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/store/meta` does not exist.

- [ ] **Step 3: Write `meta.ts`**

`apps/backend/src/store/meta.ts`:

```ts
import { stringify } from '@atropyle/sdk';
import { type Sql, toIso } from '../db/sql';

export const CURSOR = 'logs';

export async function getCursor(sql: Sql, name = CURSOR): Promise<bigint | null> {
  const rows = await sql.query<{ block: string }>('select block::text as block from public.cursors where name = $1::text', [
    name,
  ]);
  return rows.length === 0 ? null : BigInt(rows[0].block);
}

export async function setCursor(sql: Sql, block: bigint, nowIso: string, name = CURSOR): Promise<void> {
  await sql.query(
    `insert into public.cursors (name, block, updated_at) values ($1::text, $2::bigint, $3::timestamptz)
     on conflict (name) do update set block = excluded.block, updated_at = excluded.updated_at`,
    [name, block.toString(), nowIso],
  );
}

export async function getMeta<T = unknown>(sql: Sql, key: string): Promise<{ value: T; updatedAt: string } | null> {
  const rows = await sql.query<{ value: T; updated_at: unknown }>(
    'select value, updated_at from public.meta where key = $1::text',
    [key],
  );
  return rows.length === 0 ? null : { value: rows[0].value, updatedAt: toIso(rows[0].updated_at) };
}

/** `value` goes through the SDK's stringify, so bigints are stored as decimal strings. */
export async function setMeta(sql: Sql, key: string, value: unknown, nowIso: string): Promise<void> {
  await sql.query(
    `insert into public.meta (key, value, updated_at) values ($1::text, $2::jsonb, $3::timestamptz)
     on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at`,
    [key, stringify(value), nowIso],
  );
}

/**
 * Takes `key` until nowMs + ttlMs unless another holder's lease is still running. The TTL outlives the tick budget,
 * so a run that died without releasing blocks the next runs for at most ttlMs.
 */
export async function tryLease(sql: Sql, key: string, nowMs: number, ttlMs: number): Promise<boolean> {
  const rows = await sql.query(
    `insert into public.meta (key, value, updated_at)
     values ($1::text, jsonb_build_object('until', $2::text), $3::timestamptz)
     on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at
       where (public.meta.value ->> 'until')::timestamptz <= $3::timestamptz
     returning 1 as taken`,
    [key, new Date(nowMs + ttlMs).toISOString(), new Date(nowMs).toISOString()],
  );
  return rows.length > 0;
}

export async function releaseLease(sql: Sql, key: string): Promise<void> {
  await sql.query('delete from public.meta where key = $1::text', [key]);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/unit/meta.test.ts` (from `apps/backend`)
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the vault store**

`apps/backend/src/store/vaults.ts`:

```ts
import { type CreatedVault, type StateName, stringify, type VaultEvent } from '@atropyle/sdk';
import { type Address, getAddress } from 'viem';
import type { StoredAsset, VaultView } from '../chain/port';
import type { Sql } from '../db/sql';

const big = (s: string | null): bigint | null => (s === null ? null : BigInt(s));
const low = (a: string) => a.toLowerCase();

/** A vault the factory created: the row and its owner role, before the first view is read. Idempotent. */
export async function insertCreated(sql: Sql, c: CreatedVault, nowIso: string): Promise<void> {
  await sql.query(
    `insert into public.vaults (address, owner, drill, created_block, updated_block, updated_at)
     values ($1::text, $2::text, $3::boolean, $4::bigint, $4::bigint, $5::timestamptz)
     on conflict (address) do nothing`,
    [low(c.vault), low(c.owner), c.drill, c.blockNumber.toString(), nowIso],
  );
  await sql.query(
    `insert into public.vault_roles (vault, address, role) values ($1::text, $2::text, 'owner') on conflict do nothing`,
    [low(c.vault), low(c.owner)],
  );
}

/** Stores events once (the primary key dedupes a re-scanned range). Returns how many were new. */
export async function insertEvents(sql: Sql, events: readonly { event: VaultEvent; at: bigint }[]): Promise<number> {
  let inserted = 0;
  for (const { event: e, at } of events) {
    const rows = await sql.query(
      `insert into public.vault_events (tx_hash, log_index, vault, name, block, at, args)
       values ($1::text, $2::int, $3::text, $4::text, $5::bigint, $6::bigint, $7::jsonb)
       on conflict (tx_hash, log_index) do nothing
       returning 1 as inserted`,
      [low(e.transactionHash), e.logIndex, low(e.address), e.name, e.blockNumber.toString(), at.toString(), stringify(e.args)],
    );
    inserted += rows.length;
  }
  return inserted;
}

const opt = (v: bigint | null) => (v === null ? null : v.toString());

/**
 * Upserts the vault from a fresh view, ties last_alive to the block of its Alive event (the period key of check-in
 * reminders, spec §9.3.2) and replaces its roles. last_alive_block stays null until that Alive event is indexed.
 */
export async function saveView(sql: Sql, v: VaultView, nowIso: string): Promise<void> {
  await sql.query(
    `insert into public.vaults (address, owner, drill, created_block, state, pending_state, last_alive, late_at,
       window_ends_at, recovery_target, next_check_at, expires_at, expired, released, assets, updated_block, updated_at)
     values ($1::text, $2::text, $3::boolean, $4::bigint, $5::text, $6::text, $7::bigint, $8::bigint, $9::bigint,
       $10::text, $11::bigint, $12::bigint, $13::boolean, $14::boolean, $15::jsonb, $4::bigint, $16::timestamptz)
     on conflict (address) do update set
       owner = excluded.owner, state = excluded.state, pending_state = excluded.pending_state,
       last_alive = excluded.last_alive, late_at = excluded.late_at, window_ends_at = excluded.window_ends_at,
       recovery_target = excluded.recovery_target, next_check_at = excluded.next_check_at,
       expires_at = excluded.expires_at, expired = excluded.expired, released = excluded.released,
       assets = excluded.assets, updated_block = excluded.updated_block, updated_at = excluded.updated_at`,
    [
      low(v.vault),
      low(v.owner),
      v.drill,
      v.blockNumber.toString(),
      v.state,
      v.pending,
      v.lastAlive.toString(),
      v.lateAt.toString(),
      opt(v.windowEndsAt),
      v.recoveryTarget === null ? null : low(v.recoveryTarget),
      opt(v.nextCheckAt),
      opt(v.expiresAt),
      v.expired,
      v.released,
      stringify(v.assets),
      nowIso,
    ],
  );
  await sql.query(
    `update public.vaults set last_alive_block = (
       select e.block from public.vault_events e
        where e.vault = $1::text and e.name = 'Alive' and e.args ->> 'at' = $2::text
        order by e.block desc limit 1)
      where address = $1::text`,
    [low(v.vault), v.lastAlive.toString()],
  );
  await sql.query('delete from public.vault_roles where vault = $1::text', [low(v.vault)]);
  for (const r of v.roles) {
    await sql.query(
      'insert into public.vault_roles (vault, address, role) values ($1::text, $2::text, $3::text) on conflict do nothing',
      [low(v.vault), low(r.address), r.role],
    );
  }
}

/** Every indexed vault: the scan's resume list. */
export async function knownVaults(sql: Sql): Promise<Address[]> {
  const rows = await sql.query<{ address: string }>(
    'select address from public.vaults order by created_block, address',
  );
  return rows.map((r) => getAddress(r.address));
}

export interface VaultRow {
  address: Address;
  owner: Address;
  drill: boolean;
  createdBlock: bigint;
  state: StateName;
  pendingState: StateName;
  lastAlive: bigint | null;
  lastAliveBlock: bigint | null;
  lateAt: bigint | null;
  windowEndsAt: bigint | null;
  recoveryTarget: Address | null;
  nextCheckAt: bigint | null;
  expiresAt: bigint | null;
  expired: boolean;
  released: boolean;
  assets: StoredAsset[];
  updatedBlock: bigint;
}

interface RawVault {
  address: string;
  owner: string;
  drill: boolean;
  created_block: string;
  state: StateName;
  pending_state: StateName;
  last_alive: string | null;
  last_alive_block: string | null;
  late_at: string | null;
  window_ends_at: string | null;
  recovery_target: string | null;
  next_check_at: string | null;
  expires_at: string | null;
  expired: boolean;
  released: boolean;
  assets: StoredAsset[];
  updated_block: string;
}

export async function getVault(sql: Sql, vault: Address): Promise<VaultRow | null> {
  const rows = await sql.query<RawVault>(
    `select address, owner, drill, created_block::text as created_block, state, pending_state,
            last_alive::text as last_alive, last_alive_block::text as last_alive_block, late_at::text as late_at,
            window_ends_at::text as window_ends_at, recovery_target, next_check_at::text as next_check_at,
            expires_at::text as expires_at, expired, released, assets, updated_block::text as updated_block
       from public.vaults where address = $1::text`,
    [low(vault)],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    address: getAddress(r.address),
    owner: getAddress(r.owner),
    drill: r.drill,
    createdBlock: BigInt(r.created_block),
    state: r.state,
    pendingState: r.pending_state,
    lastAlive: big(r.last_alive),
    lastAliveBlock: big(r.last_alive_block),
    lateAt: big(r.late_at),
    windowEndsAt: big(r.window_ends_at),
    recoveryTarget: r.recovery_target === null ? null : getAddress(r.recovery_target),
    nextCheckAt: big(r.next_check_at),
    expiresAt: big(r.expires_at),
    expired: r.expired,
    released: r.released,
    assets: r.assets,
    updatedBlock: BigInt(r.updated_block),
  };
}
```

- [ ] **Step 6: Add `seedVault` to the seed helper**

Append to `apps/backend/test/helpers/seed.ts` (and add the imports to the top of the file):

```ts
import type { VaultView } from '../../src/chain/port';
import { insertCreated, insertEvents, saveView } from '../../src/store/vaults';
import { txh, vaultEvent } from './fixtures';

let seedTx = 0x5eed00;

/**
 * A vault as the indexer would have stored it: created at createdBlock (default 150), its Alive event at aliveBlock
 * (default createdBlock; null: none), then the view. The Alive event is left unnotified, like a freshly indexed one.
 */
export async function seedVault(
  sql: Sql,
  v: VaultView,
  o: { createdBlock?: bigint; aliveBlock?: bigint | null } = {},
): Promise<void> {
  const createdBlock = o.createdBlock ?? 150n;
  const aliveBlock = o.aliveBlock === undefined ? createdBlock : o.aliveBlock;
  const iso = '2026-11-23T12:00:00.000Z';
  await sql.begin(async (tx) => {
    await insertCreated(
      tx,
      { vault: v.vault, owner: v.owner, drill: v.drill, blockNumber: createdBlock, transactionHash: txh(seedTx++) },
      iso,
    );
    if (aliveBlock !== null) {
      const alive = vaultEvent('Alive', { at: v.lastAlive }, { address: v.vault, blockNumber: aliveBlock, transactionHash: txh(seedTx++) });
      await insertEvents(tx, [{ event: alive, at: v.lastAlive }]);
    }
    await saveView(tx, v, iso);
  });
}
```

- [ ] **Step 7: Write the failing indexer test**

`apps/backend/test/unit/indexer.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getCursor, getMeta } from '../../src/store/meta';
import { getVault, knownVaults } from '../../src/store/vaults';
import { runIndexer } from '../../src/tick/indexer';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { created, HEIR, OWNER, T0, TARGET, txh, VAULT, VAULT2, vaultEvent, view } from '../helpers/fixtures';

const eventsOf = (db: TestDb) =>
  db.query<{ name: string; block: string; at: string; args: Record<string, unknown> }>(
    'select name, block::text as block, at::text as at, args from public.vault_events order by block, log_index',
  );

describe('runIndexer (spec §9.3.1)', () => {
  let db: TestDb;
  let env: TestEnv;
  const far = () => env.clock.now() + 60_000;
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
    env = testEnv(db, { config: { stepBlocks: 50 } });
    // VAULT is created at block 150 and checks in at 190; VAULT2 is created at 120.
    env.chain.created = [created(), created({ vault: VAULT2, blockNumber: 120n, transactionHash: txh(2) })];
    env.chain.logs = [
      vaultEvent('Alive', { at: T0 - 50n }, { blockNumber: 150n, logIndex: 0, transactionHash: txh(1) }),
      vaultEvent('Alive', { at: T0 - 10n }, { blockNumber: 190n, logIndex: 3, transactionHash: txh(3) }),
      vaultEvent('RecoveryVoted', { guardian: HEIR, target: TARGET }, { blockNumber: 199n, transactionHash: txh(4) }),
      vaultEvent('Alive', { at: T0 - 80n }, { address: VAULT2, blockNumber: 120n, transactionHash: txh(2) }),
    ];
    env.chain.setView(view({ lastAlive: T0 - 10n }));
    env.chain.setView(view({ vault: VAULT2, lastAlive: T0 - 80n, nextCheckAt: null }));
  });

  it('indexes from the factory block to head − margin in committed steps', async () => {
    const r = await runIndexer(env.d, await env.chain.head(), far());
    expect(r).toEqual({ from: 100n, to: 197n, target: 197n, steps: 2, created: 2, events: 3, caughtUp: true, error: null });
    expect(env.chain.calls.scan.map((s) => [s.resume.toBlock, s.toBlock])).toEqual([
      [99n, 149n],
      [149n, 197n],
    ]);
    expect(await getCursor(db)).toBe(197n);
    expect(await knownVaults(db)).toEqual([VAULT2, VAULT]);
    // The event at block 199 is above head − 3 and waits for the next run.
    expect((await eventsOf(db)).map((e) => [e.name, e.block])).toEqual([
      ['Alive', '120'],
      ['Alive', '150'],
      ['Alive', '190'],
    ]);
    expect((await eventsOf(db))[2]).toMatchObject({ at: String(T0 - 10n), args: { at: String(T0 - 10n) } });
    expect(await getVault(db, VAULT)).toMatchObject({
      owner: OWNER,
      drill: true,
      state: 'active',
      lastAlive: T0 - 10n,
      lastAliveBlock: 190n,
      lateAt: T0 + 110n,
      nextCheckAt: T0 + 110n,
      assets: [{ index: 0, kind: 'erc20', token: view().assets[0].token, id: '0', decimals: 6 }],
    });
    const roles = await db.query<{ role: string }>(
      'select role from public.vault_roles where vault = $1::text order by role',
      [VAULT.toLowerCase()],
    );
    expect(roles.map((x) => x.role)).toEqual(['guardian', 'heir', 'owner']);
    expect(await getMeta(db, 'indexer')).toMatchObject({ value: { block: '197', head: '200' } });
  });

  it('does at most maxBlocksPerRun blocks per run and resumes from the cursor', async () => {
    env.chain.headBlock = 5_000n;
    env.d.config.stepBlocks = 500;
    const first = await runIndexer(env.d, await env.chain.head(), far());
    expect(first).toMatchObject({ from: 100n, to: 2_099n, steps: 4, caughtUp: false, error: null });
    const second = await runIndexer(env.d, await env.chain.head(), far());
    expect(second).toMatchObject({ from: 2_100n, to: 4_099n, caughtUp: false });
    const third = await runIndexer(env.d, await env.chain.head(), far());
    expect(third).toMatchObject({ from: 4_100n, to: 4_997n, caughtUp: true });
  });

  it('keeps the cursor at the last committed step when a scan fails, and the rerun adds no duplicate (review focus 3)', async () => {
    env.chain.failScan = (from) => from === 150n;
    const failed = await runIndexer(env.d, await env.chain.head(), far());
    expect(failed).toMatchObject({ steps: 1, to: 149n, caughtUp: false, error: 'scan 150-197 failed' });
    expect(await getCursor(db)).toBe(149n);
    expect(await eventsOf(db)).toHaveLength(1);
    expect(env.log.lines.some((l) => l.level === 'warn' && l.msg === 'indexer step failed')).toBe(true);

    env.chain.failScan = null;
    const rerun = await runIndexer(env.d, await env.chain.head(), far());
    expect(rerun).toMatchObject({ from: 150n, to: 197n, caughtUp: true, error: null, events: 2 });
    // Even a full re-scan from scratch stores nothing new.
    await db.query('update public.cursors set block = 99');
    const again = await runIndexer(env.d, await env.chain.head(), far());
    expect(again).toMatchObject({ events: 0, created: 2, caughtUp: true });
    expect(await eventsOf(db)).toHaveLength(3);
  });

  it('aborts the step when a view cannot be read, without moving the cursor', async () => {
    env.chain.failView.add(VAULT.toLowerCase());
    const r = await runIndexer(env.d, await env.chain.head(), far());
    expect(r).toMatchObject({ steps: 1, to: 149n, error: `view of ${VAULT} failed` });
    expect(await getVault(db, VAULT)).toBeNull();
  });

  it('does nothing once the deadline has passed, and nothing when already at head − margin', async () => {
    const late = await runIndexer(env.d, await env.chain.head(), env.clock.now());
    expect(late).toMatchObject({ steps: 0, caughtUp: false });
    expect(await getCursor(db)).toBeNull();
    await runIndexer(env.d, await env.chain.head(), far());
    const idle = await runIndexer(env.d, await env.chain.head(), far());
    expect(idle).toMatchObject({ steps: 0, from: 198n, to: 197n, caughtUp: true });
  });

  it('picks up the next blocks once the head moves on', async () => {
    await runIndexer(env.d, await env.chain.head(), far());
    env.chain.headBlock = 210n;
    env.chain.headTime = T0 + 10n;
    const r = await runIndexer(env.d, await env.chain.head(), far());
    expect(r).toMatchObject({ from: 198n, to: 207n, events: 1 });
    const voted = (await eventsOf(db)).find((e) => e.name === 'RecoveryVoted');
    expect(voted?.args).toEqual({ guardian: HEIR, target: TARGET });
  });
});
```

- [ ] **Step 8: Run it to verify it fails**

Run: `npx vitest run test/unit/indexer.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/tick/indexer` does not exist.

- [ ] **Step 9: Write the indexer**

`apps/backend/src/tick/indexer.ts`:

```ts
import type { Address } from 'viem';
import type { ChainHead, VaultView } from '../chain/port';
import { isoAt } from '../clock';
import type { Deps } from '../deps';
import { errorText } from '../log';
import { getCursor, setCursor, setMeta } from '../store/meta';
import { insertCreated, insertEvents, knownVaults, saveView } from '../store/vaults';

export interface IndexResult {
  /** First block this run looked at. */
  from: bigint;
  /** The cursor after this run. */
  to: bigint;
  /** head − HEAD_MARGIN: how far the indexer may go. */
  target: bigint;
  steps: number;
  created: number;
  /** Events stored for the first time. */
  events: number;
  /** True when the cursor reached the target without an error: reminders may trust the stored views. */
  caughtUp: boolean;
  error: string | null;
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** Spec §9.3.1. One transaction per step; any failure stops the run and keeps the last committed cursor. */
export async function runIndexer(d: Deps, head: ChainHead, deadlineMs: number): Promise<IndexResult> {
  const target = head.number - BigInt(d.config.headMargin);
  const start = (await getCursor(d.sql)) ?? d.chain.factoryBlock - 1n;
  const end = min(target, start + BigInt(d.config.maxBlocksPerRun));
  const r: IndexResult = { from: start + 1n, to: start, target, steps: 0, created: 0, events: 0, caughtUp: false, error: null };
  let vaults: Address[] = await knownVaults(d.sql);
  let cursor = start;
  while (cursor < end && d.clock.now() < deadlineMs) {
    const stepEnd = min(end, cursor + BigInt(d.config.stepBlocks));
    try {
      const scan = await d.chain.scan({ resume: { toBlock: cursor, vaults }, toBlock: stepEnd });
      if (scan.toBlock <= cursor) break;
      const times = new Map<bigint, bigint>();
      for (const e of scan.events) {
        if (!times.has(e.blockNumber)) times.set(e.blockNumber, await d.chain.blockTime(e.blockNumber));
      }
      const touched = new Map<string, Address>();
      for (const a of [...scan.created.map((c) => c.vault), ...scan.events.map((e) => e.address)]) {
        touched.set(a.toLowerCase(), a);
      }
      const views: VaultView[] = [];
      for (const a of touched.values()) views.push(await d.chain.view(a));
      const nowIso = isoAt(d.clock.now());
      const inserted = await d.sql.begin(async (tx) => {
        for (const c of scan.created) await insertCreated(tx, c, nowIso);
        const n = await insertEvents(
          tx,
          scan.events.map((event) => ({ event, at: times.get(event.blockNumber) ?? 0n })),
        );
        for (const v of views) await saveView(tx, v, nowIso);
        await setCursor(tx, scan.toBlock, nowIso);
        return n;
      });
      r.steps++;
      r.created += scan.created.length;
      r.events += inserted;
      cursor = scan.toBlock;
      vaults = scan.cursor.vaults;
    } catch (e) {
      r.error = errorText(e);
      d.log.warn('indexer step failed', { from: cursor + 1n, to: stepEnd, error: r.error });
      break;
    }
  }
  r.to = cursor;
  r.caughtUp = r.error === null && cursor >= target;
  await setMeta(d.sql, 'indexer', { block: cursor, head: head.number }, isoAt(d.clock.now()));
  return r;
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run test/unit/meta.test.ts test/unit/indexer.test.ts` (from `apps/backend`)
Expected: PASS, 3 + 6 = 9 tests.

- [ ] **Step 11: Typecheck and lint**

```bash
npx biome check --write apps/backend
npm run typecheck
npx biome ci .
```

Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add apps/backend/src/store/meta.ts apps/backend/src/store/vaults.ts apps/backend/src/tick/indexer.ts \
  apps/backend/test/helpers/seed.ts apps/backend/test/unit/meta.test.ts apps/backend/test/unit/indexer.test.ts
git commit -m "feat(backend): log indexer with a committed cursor per step, vault views and roles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 8: Notices: event alerts, check-in reminders and the Drill summary

`tick` phase 2 (spec §9.3.2). Event alerts come from `vault_events` rows that are not yet notified, in log order: an alarm, a recovery vote, a release and a payout. Reminders come from the stored vault views: the owner hears at 50%, 80% and 100% of the check-in period, keyed by the block of the last check-in. The Drill summary goes to the owner once the Drill has expired. Every email goes through `deliver()`, so a repeated tick never sends twice. An event is marked notified only when every one of its emails went out, or when it is more than 24 h old in chain time (plan ruling 9).

**Files:**
- Create: `apps/backend/src/store/notices.ts`, `apps/backend/src/tick/notices.ts`
- Test: `apps/backend/test/unit/notices-plan.test.ts`, `apps/backend/test/unit/notices-run.test.ts`

**Interfaces:**
- Consumes: `Sql` (Task 1); `isoAt` (Task 2); `EmailKind`, `Facts`, `Transfer` (Tasks 3–4); `StoredAsset` (Task 5); `Subscriber`, `activeSubscribers`, `deliver`, `newRun`, `DeliveryRun` (Task 6); `getVault`, `VaultRow`, `insertEvents`, `seedVault` (Task 7). From `@atropyle/sdk`: `STATE_CODES`.
- Produces:
  - `store/notices.ts`:
    - `interface StoredEvent { txHash: Hex; logIndex: number; vault: Address; name: string; block: bigint; at: bigint; args: Record<string, unknown> }`
    - `unnotifiedEvents(sql, limit?): Promise<StoredEvent[]>`, `eventsOfTx(sql, vault, txHash, name): Promise<StoredEvent[]>`, `markNotified(sql, events, nowIso)`
    - `interface ReminderRow { sub: Subscriber; lastAlive: bigint; lateAt: bigint; periodKey: string; sent: string[] }`, `reminderRows(sql, now: bigint, limit?): Promise<ReminderRow[]>`
    - `interface SummaryRow { sub: Subscriber; checkIns: number; alarms: number; released: 'inheritance' | 'recovery' | null }`, `drillSummaryRows(sql, now: bigint, limit?): Promise<SummaryRow[]>`
  - `tick/notices.ts`:
    - `MAX_NOTICE_AGE = 86_400n`, `type ReminderKind`, `dueReminder(lastAlive, lateAt, now): ReminderKind | null`
    - `interface PlannedNotice { role: Role; kind: EmailKind; periodKey: string; facts: Facts }`
    - `transferOf(assets, e): Transfer`, `planEventNotices(e, vault: VaultRow | null, group): PlannedNotice[]`
    - `interface NoticeResult extends DeliveryRun { events: number; reminders: number; summaries: number }`, `runNotices(d: Deps, now: bigint, deadlineMs: number, caughtUp: boolean): Promise<NoticeResult>`

Who gets what (spec §9.3.2, extended to guardians where they can act):

| Event or condition | Emails |
|---|---|
| `AlarmRaised` into grace (inheritance) | `alarm-owner`, `alarm-guardian`, `alarm-heir` |
| `AlarmRaised` into recovery | `alarm-owner`, `alarm-guardian` |
| `RecoveryVoted` with a target | `recovery-vote` to the owner |
| `Released` to heirs (state 5) | `released` to heirs and guardians |
| `Released` to the recovery wallet (state 7) | `released` to the owner and guardians |
| `Distributed` (all of one transaction) | one `distributed` to heirs (owner after a recovery), listing every payout |
| 50%, 80% and 100% of the check-in period, while active | `checkin-50`, `checkin-80`, `checkin-due` to the owner, highest due one only |
| Drill expired | `drill-summary` to the owner, once |

An alarm is mailed only while the stored view still shows that alarm (state grace or recovery with a window end), so an alarm the owner already cancelled sends nothing.

- [ ] **Step 1: Write the failing pure-logic test**

`apps/backend/test/unit/notices-plan.test.ts`:

```ts
import { zeroAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import type { StoredEvent } from '../../src/store/notices';
import type { VaultRow } from '../../src/store/vaults';
import { dueReminder, planEventNotices, transferOf } from '../../src/tick/notices';
import { GUARDIAN, HEIR, OWNER, T0, TARGET, TOKEN, txh, VAULT } from '../helpers/fixtures';

const TX = txh(77);

function ev(name: string, args: Record<string, unknown>, logIndex = 0): StoredEvent {
  return { txHash: TX, logIndex, vault: VAULT, name, block: 300n, at: T0 - 5n, args };
}

function row(over: Partial<VaultRow> = {}): VaultRow {
  return {
    address: VAULT,
    owner: OWNER,
    drill: true,
    createdBlock: 150n,
    state: 'grace',
    pendingState: 'grace',
    lastAlive: T0 - 200n,
    lastAliveBlock: 150n,
    lateAt: T0 - 80n,
    windowEndsAt: T0 + 115n,
    recoveryTarget: null,
    nextCheckAt: T0 + 115n,
    expiresAt: T0 + 600_000n,
    expired: false,
    released: false,
    assets: [
      { index: 0, kind: 'erc20', token: TOKEN, id: '0', decimals: 6 },
      { index: 1, kind: 'erc721', token: TOKEN, id: '0', decimals: null },
      { index: 2, kind: 'erc1155', token: TOKEN, id: '7', decimals: null },
    ],
    updatedBlock: 300n,
    ...over,
  };
}

const route = (ns: ReturnType<typeof planEventNotices>) => ns.map((n) => `${n.role}:${n.kind}`);

describe('planEventNotices', () => {
  it('alerts owner, guardians and heirs when the inheritance window opens, with its end as deadline', () => {
    const ns = planEventNotices(ev('AlarmRaised', { state: 1, target: zeroAddress }, 4), row(), []);
    expect(route(ns)).toEqual(['owner:alarm-owner', 'guardian:alarm-guardian', 'heir:alarm-heir']);
    expect(ns[0]).toMatchObject({ periodKey: `${TX}:4`, facts: { deadline: T0 + 115n, alarm: 'inheritance' } });
  });

  it('alerts owner and guardians, not heirs, when the recovery window opens', () => {
    const ns = planEventNotices(ev('AlarmRaised', { state: 3, target: TARGET }), row({ state: 'recovery' }), []);
    expect(route(ns)).toEqual(['owner:alarm-owner', 'guardian:alarm-guardian']);
    expect(ns[0].facts.alarm).toBe('recovery');
  });

  it('sends nothing for an alarm the stored view no longer shows', () => {
    expect(planEventNotices(ev('AlarmRaised', { state: 1, target: zeroAddress }), row({ state: 'active', windowEndsAt: null }), [])).toEqual([]);
  });

  it('tells the owner about a recovery vote with a target, and ignores a withdrawn vote', () => {
    const ns = planEventNotices(ev('RecoveryVoted', { guardian: GUARDIAN, target: TARGET }), row(), []);
    expect(ns).toEqual([
      { role: 'owner', kind: 'recovery-vote', periodKey: `${TX}:0`, facts: { guardian: GUARDIAN, target: TARGET } },
    ]);
    expect(planEventNotices(ev('RecoveryVoted', { guardian: GUARDIAN, target: zeroAddress }), row(), [])).toEqual([]);
  });

  it('routes a release by its state', () => {
    const toHeirs = planEventNotices(ev('Released', { state: 5, target: zeroAddress }), row(), []);
    expect(route(toHeirs)).toEqual(['heir:released', 'guardian:released']);
    expect(toHeirs[0]).toMatchObject({ periodKey: TX, facts: { tx: TX, released: 'inheritance' } });
    const toOwner = planEventNotices(ev('Released', { state: 7, target: TARGET }), row(), []);
    expect(route(toOwner)).toEqual(['owner:released', 'guardian:released']);
    expect(toOwner[0].facts.released).toBe('recovery');
  });

  it('sends one payout email per transaction with every transfer, to the owner after a recovery', () => {
    const group = [
      ev('Distributed', { assetIndex: '0', to: HEIR, amountOrId: '10000000000' }, 1),
      ev('Distributed', { assetIndex: '1', to: HEIR, amountOrId: '42' }, 2),
    ];
    const ns = planEventNotices(group[0], row({ state: 'releasedInherit' }), group);
    expect(ns).toEqual([
      {
        role: 'heir',
        kind: 'distributed',
        periodKey: TX,
        facts: {
          tx: TX,
          transfers: [
            { kind: 'erc20', token: TOKEN, to: HEIR, amount: '10000', id: null },
            { kind: 'erc721', token: TOKEN, to: HEIR, amount: null, id: '42' },
          ],
        },
      },
    ]);
    expect(route(planEventNotices(group[0], row({ state: 'releasedRecover' }), group))).toEqual(['owner:distributed']);
  });

  it('ignores events that need no email', () => {
    for (const name of ['Alive', 'StateChanged', 'AlarmCancelled', 'ConfigUpdated', 'Attested', 'TransferFailed']) {
      expect(planEventNotices(ev(name, {}), row(), []), name).toEqual([]);
    }
  });
});

describe('transferOf', () => {
  it('formats each asset kind and survives an unknown asset index', () => {
    const assets = row().assets;
    expect(transferOf(assets, ev('Distributed', { assetIndex: '2', to: HEIR, amountOrId: '3' }))).toEqual({
      kind: 'erc1155',
      token: TOKEN,
      to: HEIR,
      amount: '3',
      id: '7',
    });
    expect(transferOf(assets, ev('Distributed', { assetIndex: '9', to: HEIR, amountOrId: '5' }))).toEqual({
      kind: 'unknown',
      token: null,
      to: HEIR,
      amount: '5',
      id: '9',
    });
    const noDecimals = [{ index: 0, kind: 'erc20' as const, token: TOKEN, id: '0', decimals: null }];
    expect(transferOf(noDecimals, ev('Distributed', { assetIndex: '0', to: HEIR, amountOrId: '1500' })).amount).toBe('1500');
  });
});

describe('dueReminder', () => {
  // Check-in at 1000, late at 1120 (Drill: 2 periods of 60 s).
  it('fires at 50%, 80% and 100% of the period, the highest that is due', () => {
    expect(dueReminder(1000n, 1120n, 1059n)).toBeNull();
    expect(dueReminder(1000n, 1120n, 1060n)).toBe('checkin-50');
    expect(dueReminder(1000n, 1120n, 1095n)).toBe('checkin-50');
    expect(dueReminder(1000n, 1120n, 1096n)).toBe('checkin-80');
    expect(dueReminder(1000n, 1120n, 1120n)).toBe('checkin-due');
    expect(dueReminder(1000n, 1120n, 9999n)).toBe('checkin-due');
    expect(dueReminder(1000n, 1000n, 1001n)).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing run test**

`apps/backend/test/unit/notices-run.test.ts`:

```ts
import { zeroAddress } from 'viem';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MailError } from '../../src/mail/mailer';
import { insertEvents, saveView } from '../../src/store/vaults';
import { runNotices } from '../../src/tick/notices';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { HEIR, T0, TOKEN, txh, VAULT, vaultEvent, view } from '../helpers/fixtures';
import { activeSubscriber, seedVault } from '../helpers/seed';

const ISO = '2026-11-23T12:00:00.000Z';

describe('runNotices (spec §9.3.2)', () => {
  let db: TestDb;
  let env: TestEnv;
  const far = () => env.clock.now() + 60_000;
  const add = (name: string, args: Record<string, unknown>, o: { block: bigint; at: bigint; tx: number; logIndex?: number }) =>
    insertEvents(db, [
      {
        event: vaultEvent(name, args, { blockNumber: o.block, transactionHash: txh(o.tx), logIndex: o.logIndex ?? 0 }),
        at: o.at,
      },
    ]);
  const unnotified = async () =>
    (await db.query<{ n: number }>('select count(*)::int as n from public.vault_events where notified_at is null'))[0].n;

  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
    env = testEnv(db);
  });

  async function subscribers() {
    return {
      owner: await activeSubscriber(db, { email: 'owner@example.com', vault: VAULT, role: 'owner' }),
      heir: await activeSubscriber(db, { email: 'heir@example.com', vault: VAULT, role: 'heir', lang: 'vi' }),
      guardian: await activeSubscriber(db, { email: 'guardian@example.com', vault: VAULT, role: 'guardian' }),
    };
  }

  it('mails an alarm to owner, guardian and heir once, and marks the event', async () => {
    await seedVault(db, view({ state: 'grace', pending: 'grace', windowEndsAt: T0 + 115n }));
    await subscribers();
    await add('AlarmRaised', { state: 1, target: zeroAddress }, { block: 190n, at: T0 - 5n, tx: 10 });
    const r = await runNotices(env.d, T0, far(), true);
    expect(r).toMatchObject({ sent: 3, failed: 0, stopped: false, events: 2 });
    expect(env.mailer.sent.map((m) => `${m.to}:${m.tags[0].value}`).sort()).toEqual([
      'guardian@example.com:alarm-guardian',
      'heir@example.com:alarm-heir',
      'owner@example.com:alarm-owner',
    ]);
    expect(env.mailer.byKind('alarm-heir')[0].text).toContain('giờ Việt Nam');
    expect(await unnotified()).toBe(0);
    const again = await runNotices(env.d, T0, far(), true);
    expect(again).toMatchObject({ sent: 0, events: 0 });
  });

  it('keeps an event unnotified when an email fails, and sends exactly once on the next run (review focus 2)', async () => {
    await seedVault(db, view({ state: 'releasedInherit', pending: 'releasedInherit', released: true }));
    await subscribers();
    await add('Released', { state: 5, target: zeroAddress }, { block: 190n, at: T0 - 5n, tx: 11 });
    env.mailer.failNext(1, new MailError('Resend rate limit', 429, 1000));
    const first = await runNotices(env.d, T0, far(), true);
    expect(first).toMatchObject({ stopped: true, failed: 1 });
    expect(await unnotified()).toBeGreaterThan(0);
    const second = await runNotices(env.d, T0, far(), true);
    expect(second).toMatchObject({ stopped: false, failed: 0 });
    const third = await runNotices(env.d, T0, far(), true);
    expect(third).toMatchObject({ sent: 0 });
    expect(env.mailer.byKind('released').map((m) => m.to).sort()).toEqual(['guardian@example.com', 'heir@example.com']);
    expect(await unnotified()).toBe(0);
  });

  it('sends one payout email per transaction and skips events older than 24 hours', async () => {
    await seedVault(db, view({ state: 'releasedInherit', pending: 'releasedInherit', released: true }));
    await subscribers();
    await add('Distributed', { assetIndex: '0', to: HEIR, amountOrId: '10000000000' }, { block: 191n, at: T0 - 4n, tx: 12, logIndex: 1 });
    await add('Distributed', { assetIndex: '0', to: HEIR, amountOrId: '5000000' }, { block: 191n, at: T0 - 4n, tx: 12, logIndex: 2 });
    await add('Released', { state: 5, target: zeroAddress }, { block: 10n, at: T0 - 90_000n, tx: 13 });
    const r = await runNotices(env.d, T0, far(), true);
    expect(env.mailer.byKind('released')).toEqual([]);
    const [paid] = env.mailer.byKind('distributed');
    expect(env.mailer.byKind('distributed')).toHaveLength(1);
    expect(paid.to).toBe('heir@example.com');
    expect(paid.text).toContain(`10000 token ${TOKEN} cho ${HEIR}`);
    expect(paid.text).toContain(`5 token ${TOKEN} cho ${HEIR}`);
    expect(r.events).toBe(4);
    expect(await unnotified()).toBe(0);
  });

  it('reminds the owner at 50%, 80% and due, once each per check-in (spec §9.3.2)', async () => {
    // Check-in at T0 - 10 (Alive at block 150), late at T0 + 110: 50% at T0 + 50, 80% at T0 + 86.
    await seedVault(db, view());
    const { owner } = await subscribers();
    await runNotices(env.d, T0 + 49n, far(), true);
    expect(env.mailer.sent.filter((m) => m.to === owner.email)).toEqual([]);
    for (const [t, kind] of [
      [T0 + 50n, 'checkin-50'],
      [T0 + 60n, null],
      [T0 + 86n, 'checkin-80'],
      [T0 + 110n, 'checkin-due'],
      [T0 + 500n, null],
    ] as const) {
      const before = env.mailer.sent.length;
      await runNotices(env.d, t, far(), true);
      const fresh = env.mailer.sent.slice(before).map((m) => m.tags[0].value);
      expect(fresh, String(t)).toEqual(kind === null ? [] : [kind]);
    }
    const due = env.mailer.byKind('checkin-due')[0];
    expect(due.to).toBe('owner@example.com');
    expect(due.text).toContain('Deadline:');
  });

  it('sends only the highest reminder when several are due at once', async () => {
    await seedVault(db, view());
    await subscribers();
    await runNotices(env.d, T0 + 100n, far(), true);
    expect(env.mailer.sent.map((m) => m.tags[0].value)).toEqual(['checkin-80']);
  });

  it('starts a new reminder cycle after a check-in (review focus 5)', async () => {
    await seedVault(db, view());
    await subscribers();
    await runNotices(env.d, T0 + 90n, far(), true);
    expect(env.mailer.sent.map((m) => m.tags[0].value)).toEqual(['checkin-80']);
    // The owner checks in at T0 + 95 (block 240): a new Alive event, a new view, a new period key.
    await add('Alive', { at: T0 + 95n }, { block: 240n, at: T0 + 95n, tx: 20 });
    await saveView(db, view({ lastAlive: T0 + 95n, lateAt: T0 + 215n, nextCheckAt: T0 + 215n }), ISO);
    await runNotices(env.d, T0 + 155n, far(), true);
    expect(env.mailer.sent.map((m) => m.tags[0].value)).toEqual(['checkin-80', 'checkin-50']);
    const keys = await db.query<{ period_key: string }>(
      "select period_key from public.deliveries where kind like 'checkin-%' order by period_key",
    );
    expect(keys.map((k) => k.period_key)).toEqual(['150', '240']);
  });

  it('waits with reminders until the indexer has caught up, and skips vaults without a known check-in block', async () => {
    await seedVault(db, view());
    await subscribers();
    expect(await runNotices(env.d, T0 + 100n, far(), false)).toMatchObject({ reminders: 0, sent: 0 });
    await db.reset();
    await seedVault(db, view(), { aliveBlock: null });
    await subscribers();
    expect(await runNotices(env.d, T0 + 100n, far(), true)).toMatchObject({ reminders: 0, sent: 0 });
  });

  it('sends the owner one Drill summary after expiry, with check-ins and alarms counted', async () => {
    await seedVault(db, view({ state: 'releasedInherit', pending: 'releasedInherit', released: true, expiresAt: T0 + 1000n }));
    await subscribers();
    await add('Alive', { at: T0 + 20n }, { block: 170n, at: T0 + 20n, tx: 30 });
    await add('AlarmRaised', { state: 1, target: zeroAddress }, { block: 180n, at: T0 + 30n, tx: 31 });
    await add('Released', { state: 5, target: zeroAddress }, { block: 185n, at: T0 + 40n, tx: 32 });
    await runNotices(env.d, T0 + 999n, far(), true);
    expect(env.mailer.byKind('drill-summary')).toEqual([]);
    await runNotices(env.d, T0 + 1000n, far(), true);
    await runNotices(env.d, T0 + 1060n, far(), true);
    const summaries = env.mailer.byKind('drill-summary');
    expect(summaries).toHaveLength(1);
    expect(summaries[0].to).toBe('owner@example.com');
    expect(summaries[0].text).toContain('Check-ins: 1');
    expect(summaries[0].text).toContain('Alarms: 1');
    expect(summaries[0].text).toContain('It went all the way');
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `npx vitest run test/unit/notices-plan.test.ts test/unit/notices-run.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/tick/notices` (and `../../src/store/notices`) do not exist.

- [ ] **Step 4: Write the notice store**

`apps/backend/src/store/notices.ts`:

```ts
import { type Address, getAddress, type Hex } from 'viem';
import type { Sql } from '../db/sql';
import type { Lang, Role } from '../types';
import type { Subscriber } from './subscriptions';

export interface StoredEvent {
  txHash: Hex;
  logIndex: number;
  vault: Address;
  name: string;
  block: bigint;
  /** Chain time of the block. */
  at: bigint;
  /** Decoded event arguments; bigints are decimal strings, addresses checksummed (SDK stringify). */
  args: Record<string, unknown>;
}

interface RawEvent {
  tx_hash: string;
  log_index: number;
  vault: string;
  name: string;
  block: string;
  at: string;
  args: Record<string, unknown>;
}

const EVENT_COLUMNS = 'tx_hash, log_index, vault, name, block::text as block, at::text as at, args';

const toEvent = (r: RawEvent): StoredEvent => ({
  txHash: r.tx_hash as Hex,
  logIndex: r.log_index,
  vault: getAddress(r.vault),
  name: r.name,
  block: BigInt(r.block),
  at: BigInt(r.at),
  args: r.args,
});

export async function unnotifiedEvents(sql: Sql, limit = 200): Promise<StoredEvent[]> {
  const rows = await sql.query<RawEvent>(
    `select ${EVENT_COLUMNS} from public.vault_events where notified_at is null order by block, log_index limit $1::int`,
    [limit],
  );
  return rows.map(toEvent);
}

/** Every event of one name in one transaction of one vault: the payouts of a single distribute(). */
export async function eventsOfTx(sql: Sql, vault: Address, txHash: Hex, name: string): Promise<StoredEvent[]> {
  const rows = await sql.query<RawEvent>(
    `select ${EVENT_COLUMNS} from public.vault_events
      where vault = $1::text and tx_hash = $2::text and name = $3::text order by log_index`,
    [vault.toLowerCase(), txHash.toLowerCase(), name],
  );
  return rows.map(toEvent);
}

export async function markNotified(sql: Sql, events: readonly StoredEvent[], nowIso: string): Promise<void> {
  for (const e of events) {
    await sql.query(
      'update public.vault_events set notified_at = $3::timestamptz where tx_hash = $1::text and log_index = $2::int',
      [e.txHash.toLowerCase(), e.logIndex, nowIso],
    );
  }
}

interface RawSubscriber {
  id: string;
  email: string;
  lang: Lang;
  role: Role;
  vault: string;
}

const toSubscriber = (r: RawSubscriber): Subscriber => ({
  id: r.id,
  email: r.email,
  lang: r.lang,
  role: r.role,
  vault: getAddress(r.vault),
});

export interface ReminderRow {
  sub: Subscriber;
  lastAlive: bigint;
  lateAt: bigint;
  /** last_alive_block: one reminder cycle per check-in (spec §9.3.2). */
  periodKey: string;
  /** Reminder kinds already sent in this cycle. */
  sent: string[];
}

/**
 * Owner subscriptions of active vaults at 50% of the period or later whose cycle is not finished (no checkin-due sent
 * yet). The vault must have a known check-in block: until its Alive event is indexed there is no period key.
 */
export async function reminderRows(sql: Sql, now: bigint, limit = 500): Promise<ReminderRow[]> {
  const rows = await sql.query<RawSubscriber & { last_alive: string; late_at: string; period_key: string; sent: string[] }>(
    `select s.id::text as id, s.email::text as email, s.lang, s.role, s.vault,
            v.last_alive::text as last_alive, v.late_at::text as late_at, v.last_alive_block::text as period_key,
            coalesce((select array_agg(d.kind order by d.kind) from public.deliveries d
                       where d.subscription_id = s.id and d.period_key = v.last_alive_block::text
                         and d.kind in ('checkin-50', 'checkin-80', 'checkin-due') and d.sent_at is not null),
                     '{}') as sent
       from public.vaults v
       join public.subscriptions s on s.vault = v.address and s.status = 'active' and s.role = 'owner'
      where v.state = 'active' and not v.expired and (v.expires_at is null or v.expires_at > $1::bigint)
        and v.last_alive_block is not null and v.late_at > v.last_alive
        and ($1::bigint - v.last_alive) * 2 >= v.late_at - v.last_alive
        and not exists (select 1 from public.deliveries d
                         where d.subscription_id = s.id and d.kind = 'checkin-due'
                           and d.period_key = v.last_alive_block::text and d.sent_at is not null)
      order by s.id
      limit $2::int`,
    [now.toString(), limit],
  );
  return rows.map((r) => ({
    sub: toSubscriber(r),
    lastAlive: BigInt(r.last_alive),
    lateAt: BigInt(r.late_at),
    periodKey: r.period_key,
    sent: r.sent,
  }));
}

export interface SummaryRow {
  sub: Subscriber;
  /** Check-ins by the owner: Alive events after the one emitted at creation. */
  checkIns: number;
  alarms: number;
  released: 'inheritance' | 'recovery' | null;
}

/** Owner subscriptions of Drills whose lifetime has ended (chain time) and that got no summary yet. */
export async function drillSummaryRows(sql: Sql, now: bigint, limit = 100): Promise<SummaryRow[]> {
  const rows = await sql.query<RawSubscriber & { alive: number; alarms: number; released_state: string | null }>(
    `select s.id::text as id, s.email::text as email, s.lang, s.role, s.vault,
            (select count(*) from public.vault_events e where e.vault = v.address and e.name = 'Alive')::int as alive,
            (select count(*) from public.vault_events e where e.vault = v.address and e.name = 'AlarmRaised')::int as alarms,
            (select e.args ->> 'state' from public.vault_events e
              where e.vault = v.address and e.name = 'Released' order by e.block limit 1) as released_state
       from public.vaults v
       join public.subscriptions s on s.vault = v.address and s.status = 'active' and s.role = 'owner'
      where v.drill and v.expires_at is not null and v.expires_at <= $1::bigint
        and not exists (select 1 from public.deliveries d
                         where d.subscription_id = s.id and d.kind = 'drill-summary' and d.sent_at is not null)
      order by s.id
      limit $2::int`,
    [now.toString(), limit],
  );
  return rows.map((r) => ({
    sub: toSubscriber(r),
    checkIns: Math.max(0, r.alive - 1),
    alarms: r.alarms,
    released: r.released_state === '7' ? 'recovery' : r.released_state === null ? null : 'inheritance',
  }));
}
```

- [ ] **Step 5: Write the notice phase**

`apps/backend/src/tick/notices.ts`:

```ts
import { STATE_CODES } from '@atropyle/sdk';
import { type Address, formatUnits, getAddress, isAddress, zeroAddress } from 'viem';
import type { StoredAsset } from '../chain/port';
import { isoAt } from '../clock';
import type { Deps } from '../deps';
import type { Facts } from '../email/compose';
import type { Transfer } from '../email/format';
import type { EmailKind } from '../email/kinds';
import { type DeliveryRun, deliver, newRun } from '../mail/deliver';
import {
  drillSummaryRows,
  eventsOfTx,
  markNotified,
  reminderRows,
  type StoredEvent,
  unnotifiedEvents,
} from '../store/notices';
import { activeSubscribers, type Subscriber } from '../store/subscriptions';
import { getVault, type VaultRow } from '../store/vaults';
import type { Role } from '../types';

/** Events older than this in chain time are marked without an email (plan ruling 9: no backlog after an outage). */
export const MAX_NOTICE_AGE = 86_400n;

export type ReminderKind = 'checkin-50' | 'checkin-80' | 'checkin-due';

/** The highest check-in reminder due at `now` for a cycle that started at lastAlive and runs late at lateAt. */
export function dueReminder(lastAlive: bigint, lateAt: bigint, now: bigint): ReminderKind | null {
  const span = lateAt - lastAlive;
  if (span <= 0n) return null;
  const elapsed = now - lastAlive;
  if (elapsed >= span) return 'checkin-due';
  if (elapsed * 10n >= span * 8n) return 'checkin-80';
  if (elapsed * 2n >= span) return 'checkin-50';
  return null;
}

export interface PlannedNotice {
  role: Role;
  kind: EmailKind;
  periodKey: string;
  facts: Facts;
}

/** A payout line from a Distributed event and the vault's stored assets. amountOrId: amount, ERC-721 id or count. */
export function transferOf(assets: readonly StoredAsset[], e: StoredEvent): Transfer {
  const index = Number(e.args.assetIndex);
  const to = getAddress(String(e.args.to));
  const raw = BigInt(String(e.args.amountOrId));
  const asset = assets.find((a) => a.index === index);
  if (!asset) return { kind: 'unknown', token: null, to, amount: raw.toString(), id: String(index) };
  if (asset.kind === 'erc20') {
    const amount = asset.decimals === null ? raw.toString() : formatUnits(raw, asset.decimals);
    return { kind: 'erc20', token: asset.token, to, amount, id: null };
  }
  if (asset.kind === 'erc721') return { kind: 'erc721', token: asset.token, to, amount: null, id: raw.toString() };
  return { kind: 'erc1155', token: asset.token, to, amount: raw.toString(), id: asset.id };
}

const addressArg = (v: unknown): Address | null => {
  const s = String(v ?? '');
  return isAddress(s, { strict: false }) && s.toLowerCase() !== zeroAddress ? getAddress(s) : null;
};

/** Pure routing of one event to (role, email) pairs; `group` holds every Distributed event of the same transaction. */
export function planEventNotices(e: StoredEvent, vault: VaultRow | null, group: readonly StoredEvent[]): PlannedNotice[] {
  const per = `${e.txHash}:${e.logIndex}`;
  if (e.name === 'AlarmRaised') {
    if (!vault || vault.windowEndsAt === null || (vault.state !== 'grace' && vault.state !== 'recovery')) return [];
    const alarm = Number(e.args.state) === STATE_CODES.recovery ? 'recovery' : 'inheritance';
    const facts: Facts = { deadline: vault.windowEndsAt, alarm };
    const out: PlannedNotice[] = [
      { role: 'owner', kind: 'alarm-owner', periodKey: per, facts },
      { role: 'guardian', kind: 'alarm-guardian', periodKey: per, facts },
    ];
    if (alarm === 'inheritance') out.push({ role: 'heir', kind: 'alarm-heir', periodKey: per, facts });
    return out;
  }
  if (e.name === 'RecoveryVoted') {
    const target = addressArg(e.args.target);
    const guardian = addressArg(e.args.guardian);
    if (!target || !guardian) return [];
    return [{ role: 'owner', kind: 'recovery-vote', periodKey: per, facts: { guardian, target } }];
  }
  if (e.name === 'Released') {
    const recovery = Number(e.args.state) === STATE_CODES.releasedRecover;
    const facts: Facts = { tx: e.txHash, released: recovery ? 'recovery' : 'inheritance' };
    const roles: Role[] = recovery ? ['owner', 'guardian'] : ['heir', 'guardian'];
    return roles.map((role) => ({ role, kind: 'released', periodKey: e.txHash, facts }));
  }
  if (e.name === 'Distributed') {
    if (!vault) return [];
    const transfers = group.filter((g) => g.name === 'Distributed').map((g) => transferOf(vault.assets, g));
    const role: Role = vault.state === 'releasedRecover' ? 'owner' : 'heir';
    return [{ role, kind: 'distributed', periodKey: e.txHash, facts: { tx: e.txHash, transfers } }];
  }
  return [];
}

export interface NoticeResult extends DeliveryRun {
  /** Events handled (mailed, skipped as too old, or needing no email) and marked notified. */
  events: number;
  reminders: number;
  summaries: number;
}

/**
 * Spec §9.3.2. Event alerts first, in log order; then, only when the indexer has caught up (the stored views are
 * current), reminders and Drill summaries. Stops at the deadline or when the delivery circuit breaker opens.
 */
export async function runNotices(d: Deps, now: bigint, deadlineMs: number, caughtUp: boolean): Promise<NoticeResult> {
  const run = newRun();
  const res = { events: 0, reminders: 0, summaries: 0 };
  const open = () => !run.stopped && d.clock.now() < deadlineMs;
  const vaults = new Map<string, VaultRow | null>();
  const subs = new Map<string, Subscriber[]>();
  const vaultOf = async (a: Address) => {
    if (!vaults.has(a)) vaults.set(a, await getVault(d.sql, a));
    return vaults.get(a) ?? null;
  };
  const subsOf = async (a: Address) => {
    if (!subs.has(a)) subs.set(a, await activeSubscribers(d.sql, a));
    return subs.get(a) ?? [];
  };

  const handled = new Set<string>();
  for (const e of await unnotifiedEvents(d.sql)) {
    if (!open()) break;
    if (handled.has(`${e.txHash}:${e.logIndex}`)) continue;
    const group = e.name === 'Distributed' ? await eventsOfTx(d.sql, e.vault, e.txHash, 'Distributed') : [e];
    for (const g of group) handled.add(`${g.txHash}:${g.logIndex}`);
    let complete = true;
    if (now - e.at <= MAX_NOTICE_AGE) {
      const notices = planEventNotices(e, await vaultOf(e.vault), group);
      const readers = notices.length > 0 ? await subsOf(e.vault) : [];
      for (const n of notices) {
        for (const sub of readers.filter((s) => s.role === n.role)) {
          const r = await deliver(d, { sub, kind: n.kind, periodKey: n.periodKey, facts: n.facts }, run);
          if (r === 'failed') complete = false;
        }
      }
    }
    if (!complete) continue;
    await markNotified(d.sql, group, isoAt(d.clock.now()));
    res.events += group.length;
  }

  if (caughtUp) {
    for (const r of await reminderRows(d.sql, now)) {
      if (!open()) break;
      const kind = dueReminder(r.lastAlive, r.lateAt, now);
      if (kind === null || r.sent.includes(kind)) continue;
      res.reminders++;
      await deliver(d, { sub: r.sub, kind, periodKey: r.periodKey, facts: { deadline: r.lateAt } }, run);
    }
    for (const s of await drillSummaryRows(d.sql, now)) {
      if (!open()) break;
      res.summaries++;
      const facts: Facts = { checkIns: s.checkIns, alarms: s.alarms, released: s.released };
      await deliver(d, { sub: s.sub, kind: 'drill-summary', periodKey: 'expired', facts }, run);
    }
  }
  return { ...run, ...res };
}
```

- [ ] **Step 6: Run both tests to verify they pass**

Run: `npx vitest run test/unit/notices-plan.test.ts test/unit/notices-run.test.ts` (from `apps/backend`)
Expected: PASS, 9 + 8 = 17 tests. If a reminder case fails, print `await reminderRows(db, t)` in the test to see the `sent` list and the period key; do not loosen the assertions.

- [ ] **Step 7: Typecheck and lint**

```bash
npx biome check --write apps/backend
npm run typecheck
npx biome ci .
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/store/notices.ts apps/backend/src/tick/notices.ts \
  apps/backend/test/unit/notices-plan.test.ts apps/backend/test/unit/notices-run.test.ts
git commit -m "feat(backend): event alerts, check-in reminders and the Drill summary, idempotent per period" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 9: The keeper phase, ops alerts, `runTick`, integrity and the cron functions

`tick` phase 3 (spec §9.3.3) and the orchestration around it (spec §9.3.4). `runTick` takes a lease, so two overlapping cron calls never run together. It reads the head once, then gives the indexer the first half of the 50 s budget, the notices up to 70%, and the keeper the rest. A failing phase is recorded in `errors` while the next one still runs. The keeper runs over the vaults whose `next_check_at` has come and whose Drill has not expired, with at most 20 transactions and fewer when little time is left. It writes every attempt to `keeper_log`. Ops get one email when an alert starts (low keeper balance, unusable keeper secret, failed integrity) and one when it ends, never one per tick.

**Files:**
- Create: `apps/backend/src/store/keeper.ts`, `apps/backend/src/store/integrity.ts`, `apps/backend/src/ops.ts`
- Create: `apps/backend/src/tick/keeper.ts`, `apps/backend/src/tick/run.ts`, `apps/backend/src/integrity.ts`
- Create: `apps/backend/src/functions/cron.ts`, `apps/backend/src/functions/tick.ts`, `apps/backend/src/functions/integrity.ts`
- Test: `apps/backend/test/unit/keeper-phase.test.ts`, `apps/backend/test/unit/tick.test.ts`, `apps/backend/test/unit/integrity.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–8; from `@atropyle/sdk`: `RETRY_AFTER`, `stringify`, the types `KeeperAction`, `KeeperReport`, `IntegrityReport`.
- Produces:
  - `store/keeper.ts`: `dueVaults(sql, now: bigint, limit?): Promise<Address[]>`, `setNextCheck(sql, vault, next: bigint | null)`, `lastDistributes(sql, vaults): Promise<Map<Address, bigint>>`, `interface KeeperLogRow { vault; action: KeeperAction | null; txHash: Hex | null; status: string; error: string | null; chainAt: bigint }`, `logKeeper(sql, rows, nowIso)`
  - `store/integrity.ts`: `saveIntegrity(sql, report, nowIso)`, `latestIntegrity(sql): Promise<{ at: string; block: bigint; ok: boolean } | null>`
  - `ops.ts`: `type OpsAlert = 'keeper-balance' | 'keeper-key' | 'integrity'`, `opsAlert(d, kind, firing, detail): Promise<'fired' | 'resolved' | 'unchanged' | 'failed'>`
  - `tick/keeper.ts`: `KEEPER_TX_MS = 2_500`, `interface KeeperPhaseResult { ran: boolean; dryRun: boolean; due: number; sent: number; stopped: 'LOW_BALANCE' | null }`, `runKeeperPhase(d, now: bigint, deadlineMs): Promise<KeeperPhaseResult>`
  - `meta` key `'keeper'`: `{ lastRunAt: string; balanceWei: string | null; dryRun: boolean; keeper: Address | null; sent: number; stopped: 'LOW_BALANCE' | null }`
  - `tick/run.ts`: `TICK_LEASE = 'lease:tick'`, `LEASE_TTL_MS = 120_000`, `interface TickResult { status: 'ok' | 'partial' | 'locked'; head: bigint | null; indexer; notices; keeper; errors: string[] }`, `runTick(d): Promise<TickResult>`
  - `integrity.ts`: `runIntegrity(d): Promise<{ ok: boolean; block: bigint; failed: string[] }>`
  - `functions/cron.ts`: `requireCron(req, d)`; `functions/tick.ts`: `tick: Handler<Deps>`; `functions/integrity.ts`: `integrity: Handler<Deps>`

- [ ] **Step 1: Write the failing keeper-phase test**

`apps/backend/test/unit/keeper-phase.test.ts`:

```ts
import type { KeeperReport } from '@atropyle/sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getMeta } from '../../src/store/meta';
import { getVault } from '../../src/store/vaults';
import { runKeeperPhase } from '../../src/tick/keeper';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { addr, T0, txh, VAULT, VAULT2, view } from '../helpers/fixtures';
import { seedVault } from '../helpers/seed';

const VAULT3 = addr(0xa003);
const KEEPER = addr(0x7777);
const ops = (env: TestEnv) => env.mailer.sent.filter((m) => m.to === 'ops@atropyle.test');

function report(over: Partial<KeeperReport> = {}): KeeperReport {
  return { ranAt: T0, dryRun: false, keeper: KEEPER, balance: 10n ** 18n, stopped: null, sent: 0, outcomes: [], ...over };
}

describe('runKeeperPhase (spec §9.3.3)', () => {
  let db: TestDb;
  let env: TestEnv;
  const far = () => env.clock.now() + 60_000;
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
    env = testEnv(db);
    await seedVault(db, view({ nextCheckAt: T0 - 1n }));
    await seedVault(db, view({ vault: VAULT2, nextCheckAt: T0 + 500n }));
    await seedVault(db, view({ vault: VAULT3, nextCheckAt: T0 - 5n, expiresAt: T0 - 1n }));
  });

  it('runs the keeper over due, unexpired vaults and records what it sent', async () => {
    await db.query(
      `insert into public.keeper_log (vault, action, tx_hash, status, chain_at)
       values ($1::text, 'distribute', $2::text, 'sent', $3::bigint)`,
      [VAULT.toLowerCase(), txh(50), (T0 - 100n).toString()],
    );
    env.chain.keeperImpl = async (run) =>
      report({
        sent: 1,
        outcomes: [
          {
            vault: run.vaults[0],
            decision: { vault: run.vaults[0], action: 'poke', reason: 'TRANSITION_DUE', nextCheckAt: T0 },
            status: 'sent',
            hash: txh(99),
            nextCheckAt: T0,
          },
        ],
      });
    const r = await runKeeperPhase(env.d, T0, far());
    expect(r).toEqual({ ran: true, dryRun: false, due: 1, sent: 1, stopped: null });
    const [run] = env.chain.calls.keeper;
    expect(run.vaults).toEqual([VAULT]);
    expect(run.maxTx).toBe(20);
    expect(run.lastDistributeAt.get(VAULT)).toBe(T0 - 100n);
    const logs = await db.query<{ action: string; tx_hash: string; status: string; chain_at: string }>(
      'select action, tx_hash, status, chain_at::text as chain_at from public.keeper_log order by id',
    );
    expect(logs[1]).toEqual({ action: 'poke', tx_hash: txh(99), status: 'sent', chain_at: String(T0) });
    expect((await getVault(db, VAULT))?.nextCheckAt).toBe(T0);
    expect((await getMeta(db, 'keeper'))?.value).toEqual({
      lastRunAt: '2026-11-23T12:00:00.000Z',
      balanceWei: '1000000000000000000',
      dryRun: false,
      keeper: KEEPER,
      sent: 1,
      stopped: null,
    });
  });

  it('looks again in five minutes after a dry run, and never logs an idle vault', async () => {
    env.chain.keeperImpl = async (run) =>
      report({
        dryRun: true,
        keeper: null,
        balance: null,
        outcomes: [
          {
            vault: run.vaults[0],
            decision: { vault: run.vaults[0], action: 'poke', reason: 'TRANSITION_DUE', nextCheckAt: T0 },
            status: 'dry-run',
            nextCheckAt: T0,
          },
        ],
      });
    await runKeeperPhase(env.d, T0, far());
    expect((await getVault(db, VAULT))?.nextCheckAt).toBe(T0 + 300n);
    const logs = await db.query<{ status: string; tx_hash: string | null }>('select status, tx_hash from public.keeper_log');
    expect(logs).toEqual([{ status: 'dry-run', tx_hash: null }]);

    env.chain.keeperImpl = async (run) =>
      report({ outcomes: [{ vault: run.vaults[0], decision: null, status: 'idle', nextCheckAt: T0 + 400n }] });
    await db.query('update public.vaults set next_check_at = $1::bigint', [String(T0 - 1n)]);
    await runKeeperPhase(env.d, T0, far());
    expect(await db.query('select 1 from public.keeper_log')).toHaveLength(1);
  });

  it('caps transactions by the time left, and skips the keeper when almost none is left', async () => {
    await runKeeperPhase(env.d, T0, env.clock.now() + 5_000);
    expect(env.chain.calls.keeper[0].maxTx).toBe(2);
    const late = await runKeeperPhase(env.d, T0, env.clock.now() + 1_000);
    expect(late.ran).toBe(false);
    expect(env.chain.calls.keeper).toHaveLength(1);
  });

  it('alerts ops once when the balance runs low, and once when it recovers', async () => {
    env.chain.keeperImpl = async () => report({ stopped: 'LOW_BALANCE', balance: 10n ** 15n });
    await runKeeperPhase(env.d, T0, far());
    await runKeeperPhase(env.d, T0, far());
    expect(ops(env).map((m) => m.subject)).toEqual(['[Atropyle ops] keeper-balance: firing']);
    expect(ops(env)[0].text).toContain('1000000000000000 wei');
    env.chain.keeperImpl = async () => report();
    await runKeeperPhase(env.d, T0, far());
    expect(ops(env).map((m) => m.subject)).toEqual([
      '[Atropyle ops] keeper-balance: firing',
      '[Atropyle ops] keeper-balance: resolved',
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/unit/keeper-phase.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/tick/keeper` does not exist.

- [ ] **Step 3: Write the keeper store, the ops alert and the keeper phase**

`apps/backend/src/store/keeper.ts`:

```ts
import type { KeeperAction } from '@atropyle/sdk';
import { type Address, getAddress, type Hex } from 'viem';
import type { Sql } from '../db/sql';

/** Spec §9.3.3: vaults whose next_check_at has come and whose Drill has not expired, the most overdue first. */
export async function dueVaults(sql: Sql, now: bigint, limit = 50): Promise<Address[]> {
  const rows = await sql.query<{ address: string }>(
    `select address from public.vaults
      where next_check_at is not null and next_check_at <= $1::bigint and not expired
        and (expires_at is null or expires_at > $1::bigint)
      order by next_check_at, address
      limit $2::int`,
    [now.toString(), limit],
  );
  return rows.map((r) => getAddress(r.address));
}

export async function setNextCheck(sql: Sql, vault: Address, next: bigint | null): Promise<void> {
  await sql.query('update public.vaults set next_check_at = $2::bigint where address = $1::text', [
    vault.toLowerCase(),
    next === null ? null : next.toString(),
  ]);
}

/** Chain time of the last distribute this keeper sent, per vault: the SDK's distribute back-off. */
export async function lastDistributes(sql: Sql, vaults: readonly Address[]): Promise<Map<Address, bigint>> {
  const out = new Map<Address, bigint>();
  if (vaults.length === 0) return out;
  const rows = await sql.query<{ vault: string; at: string }>(
    `select vault, max(chain_at)::text as at from public.keeper_log
      where action = 'distribute' and status = 'sent' and vault = any(string_to_array($1::text, ','))
      group by vault`,
    [vaults.map((v) => v.toLowerCase()).join(',')],
  );
  for (const r of rows) out.set(getAddress(r.vault), BigInt(r.at));
  return out;
}

export interface KeeperLogRow {
  vault: Address;
  action: KeeperAction | null;
  txHash: Hex | null;
  status: string;
  /** An SDK error code; never a revert reason (chain text stays out of the database). */
  error: string | null;
  chainAt: bigint;
}

export async function logKeeper(sql: Sql, rows: readonly KeeperLogRow[], nowIso: string): Promise<void> {
  for (const r of rows) {
    await sql.query(
      `insert into public.keeper_log (vault, action, tx_hash, status, error, chain_at, at)
       values ($1::text, $2::text, $3::text, $4::text, $5::text, $6::bigint, $7::timestamptz)`,
      [r.vault.toLowerCase(), r.action, r.txHash?.toLowerCase() ?? null, r.status, r.error, r.chainAt.toString(), nowIso],
    );
  }
}
```

`apps/backend/src/ops.ts`:

```ts
import { isoAt } from './clock';
import { sha256Hex } from './crypto';
import type { Deps } from './deps';
import { escapeHtml } from './email/fill';
import { errorText } from './log';
import { getMeta, setMeta } from './store/meta';

export type OpsAlert = 'keeper-balance' | 'keeper-key' | 'integrity';

/**
 * Mails OPS_EMAIL when an alert starts or ends, never while it stays the same. The new state is stored only after
 * the email went out (or when no OPS_EMAIL is set), so a failed send is retried on the next tick.
 */
export async function opsAlert(
  d: Deps,
  kind: OpsAlert,
  firing: boolean,
  detail: string,
): Promise<'fired' | 'resolved' | 'unchanged' | 'failed'> {
  const key = `alert:${kind}`;
  const prev = await getMeta<{ firing: boolean }>(d.sql, key);
  if ((prev?.value.firing ?? false) === firing) return 'unchanged';
  const state = firing ? 'firing' : 'resolved';
  if (d.config.opsEmail) {
    try {
      await d.mailer.send({
        from: d.config.mailFrom,
        to: d.config.opsEmail,
        subject: `[Atropyle ops] ${kind}: ${state}`,
        html: `<pre>${escapeHtml(detail)}</pre>`,
        text: detail,
        headers: {},
        tags: [{ name: 'kind', value: 'ops' }],
        idempotencyKey: await sha256Hex(`ops:${kind}:${state}:${Math.floor(d.clock.now() / 60_000)}`),
      });
    } catch (e) {
      d.log.error('ops alert not sent', { kind, state, error: errorText(e) });
      return 'failed';
    }
  }
  await setMeta(d.sql, key, { firing, detail }, isoAt(d.clock.now()));
  d.log.warn('ops alert', { kind, state });
  return firing ? 'fired' : 'resolved';
}
```

`apps/backend/src/tick/keeper.ts`:

```ts
import { RETRY_AFTER } from '@atropyle/sdk';
import { isoAt } from '../clock';
import type { Deps } from '../deps';
import { opsAlert } from '../ops';
import { dueVaults, type KeeperLogRow, lastDistributes, logKeeper, setNextCheck } from '../store/keeper';
import { setMeta } from '../store/meta';

/** Wall time one keeper transaction may take (simulate, send, receipt). The budget allows floor(left / this). */
export const KEEPER_TX_MS = 2_500;

export interface KeeperPhaseResult {
  ran: boolean;
  dryRun: boolean;
  due: number;
  sent: number;
  stopped: 'LOW_BALANCE' | null;
}

/**
 * Spec §9.3.3 with the limits of the ecosystem spec §9.4: at most keeperMaxTx (20) attempts, the SDK's gas cap,
 * a stop below 0.005 OKB. Runs even with no vault due, so the balance alert and /health stay current.
 */
export async function runKeeperPhase(d: Deps, now: bigint, deadlineMs: number): Promise<KeeperPhaseResult> {
  const maxTx = Math.min(d.config.keeperMaxTx, Math.floor((deadlineMs - d.clock.now()) / KEEPER_TX_MS));
  const due = await dueVaults(d.sql, now);
  if (maxTx < 1) return { ran: false, dryRun: true, due: due.length, sent: 0, stopped: null };
  const report = await d.chain.keeper({ vaults: due, maxTx, lastDistributeAt: await lastDistributes(d.sql, due) });
  const nowIso = isoAt(d.clock.now());
  const logs: KeeperLogRow[] = [];
  await d.sql.begin(async (tx) => {
    for (const o of report.outcomes) {
      // A dry run would otherwise re-simulate the same vault every minute.
      const next = o.status === 'dry-run' ? report.ranAt + RETRY_AFTER : o.nextCheckAt;
      await setNextCheck(tx, o.vault, next);
      if (o.status === 'idle' || o.status === 'limit') continue;
      logs.push({
        vault: o.vault,
        action: o.decision?.action ?? null,
        txHash: o.hash ?? null,
        status: o.status,
        error: o.error?.code ?? null,
        chainAt: report.ranAt,
      });
    }
    await logKeeper(tx, logs, nowIso);
  });
  for (const l of logs) {
    if (l.error !== null) d.log.warn('keeper attempt failed', { vault: l.vault, status: l.status, code: l.error });
  }
  await setMeta(
    d.sql,
    'keeper',
    {
      lastRunAt: nowIso,
      balanceWei: report.balance,
      dryRun: report.dryRun,
      keeper: report.keeper,
      sent: report.sent,
      stopped: report.stopped,
    },
    nowIso,
  );
  await opsAlert(
    d,
    'keeper-balance',
    report.stopped === 'LOW_BALANCE',
    `Keeper ${report.keeper ?? '(none)'} balance ${report.balance ?? 'unknown'} wei. It stops below 0.005 OKB; top it up.`,
  );
  return { ran: true, dryRun: report.dryRun, due: due.length, sent: report.sent, stopped: report.stopped };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/unit/keeper-phase.test.ts` (from `apps/backend`)
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing tick and integrity tests**

`apps/backend/test/unit/tick.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tick } from '../../src/functions/tick';
import { KEEPER_KEY_INVALID } from '../../src/keeper/signer';
import { getMeta, tryLease } from '../../src/store/meta';
import { runTick, TICK_LEASE } from '../../src/tick/run';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { created, T0, txh, VAULT, vaultEvent, view } from '../helpers/fixtures';
import { API, bodyOf } from '../helpers/http';
import { activeSubscriber } from '../helpers/seed';

describe('runTick (spec §9.3)', () => {
  let db: TestDb;
  let env: TestEnv;
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
    env = testEnv(db);
    env.chain.created = [created()];
    env.chain.logs = [vaultEvent('Alive', { at: T0 - 100n }, { blockNumber: 150n, transactionHash: txh(1) })];
    // Seen at T0: checked in at T0 - 100, late at T0 + 20, so 83% of the period is past (the 80% reminder).
    env.chain.setView(view({ lastAlive: T0 - 100n, lateAt: T0 + 20n, nextCheckAt: T0 + 20n }));
  });

  it('indexes, reminds and runs the keeper in one call, then frees the lease', async () => {
    await activeSubscriber(db, { email: 'owner@example.com', vault: VAULT, role: 'owner' });
    const r = await runTick(env.d);
    expect(r.status).toBe('ok');
    expect(r.errors).toEqual([]);
    expect(r.head).toBe(200n);
    expect(r.indexer).toMatchObject({ caughtUp: true, created: 1, events: 1 });
    expect(r.notices).toMatchObject({ sent: 1, reminders: 1 });
    expect(r.keeper).toMatchObject({ ran: true, due: 0 });
    expect(env.mailer.byKind('checkin-80')).toHaveLength(1);
    expect(await getMeta(db, TICK_LEASE)).toBeNull();
    const again = await runTick(env.d);
    expect(again.notices).toMatchObject({ sent: 0 });
  });

  it('returns locked and touches nothing while another tick holds the lease (review focus 4)', async () => {
    expect(await tryLease(db, TICK_LEASE, env.clock.now(), 120_000)).toBe(true);
    const r = await runTick(env.d);
    expect(r).toEqual({ status: 'locked', head: null, indexer: null, notices: null, keeper: null, errors: [] });
    expect(env.chain.calls.scan).toEqual([]);
    expect(env.chain.calls.keeper).toEqual([]);
    expect(await getMeta(db, TICK_LEASE)).not.toBeNull();
    env.clock.advance(121_000);
    expect((await runTick(env.d)).status).toBe('ok');
  });

  it('reports a failed head read as partial and still frees the lease', async () => {
    env.chain.head = async () => {
      throw new Error('rpc down');
    };
    const r = await runTick(env.d);
    expect(r).toMatchObject({ status: 'partial', errors: ['head: rpc down'] });
    expect(await getMeta(db, TICK_LEASE)).toBeNull();
  });

  it('keeps going when one phase fails', async () => {
    env.chain.keeperImpl = async () => {
      throw new Error('keeper rpc down');
    };
    const r = await runTick(env.d);
    expect(r.status).toBe('partial');
    expect(r.errors).toEqual(['keeper: keeper rpc down']);
    expect(r.indexer).toMatchObject({ caughtUp: true });
  });

  it('alerts ops once about an unusable keeper secret', async () => {
    env = testEnv(db, { keeperError: KEEPER_KEY_INVALID });
    env.chain.setView(view());
    await runTick(env.d);
    await runTick(env.d);
    const alerts = env.mailer.sent.filter((m) => m.to === 'ops@atropyle.test');
    expect(alerts.map((m) => m.subject)).toEqual(['[Atropyle ops] keeper-key: firing']);
  });

  it('is only reachable with the cron secret', async () => {
    const call = (headers: Record<string, string>) =>
      tick(new Request(`${API}/tick`, { method: 'POST', headers }), env.d);
    const denied = await call({});
    expect(denied.status).toBe(401);
    expect(await bodyOf(denied)).toMatchObject({ code: 'UNAUTHORIZED' });
    expect((await call({ 'x-cron-secret': 'wrong' })).status).toBe(401);
    const ok = await call({ 'x-cron-secret': 'c'.repeat(32) });
    expect(ok.status).toBe(200);
    expect(await bodyOf(ok)).toMatchObject({ status: 'ok', head: '200' });
  });
});
```

`apps/backend/test/unit/integrity.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { integrity } from '../../src/functions/integrity';
import { runIntegrity } from '../../src/integrity';
import { latestIntegrity } from '../../src/store/integrity';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { API, bodyOf } from '../helpers/http';

describe('runIntegrity (spec §9.2)', () => {
  let db: TestDb;
  let env: TestEnv;
  const ops = () => env.mailer.sent.filter((m) => m.to === 'ops@atropyle.test').map((m) => m.subject);
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
    env = testEnv(db);
  });

  it('stores each run and mails ops when a check fails, once, then when it passes again', async () => {
    expect(await latestIntegrity(db)).toBeNull();
    expect(await runIntegrity(env.d)).toEqual({ ok: true, block: 200n, failed: [] });
    expect(await latestIntegrity(db)).toEqual({ at: '2026-11-23T12:00:00.000Z', block: 200n, ok: true });
    expect(ops()).toEqual([]);

    env.chain.integrityImpl = async () => ({
      ok: false,
      chainId: 196,
      blockNumber: 201n,
      blockTimestamp: 1n,
      rpcs: 2,
      checks: [
        { name: 'factory code', ok: true },
        { name: 'cpu policy', ok: false, expected: '0x01', actual: '0x02' },
      ],
      warnings: [],
    });
    expect(await runIntegrity(env.d)).toEqual({ ok: false, block: 201n, failed: ['cpu policy'] });
    await runIntegrity(env.d);
    expect(ops()).toEqual(['[Atropyle ops] integrity: firing']);
    expect(env.mailer.sent.at(-1)?.text).toContain('cpu policy');
    expect(await latestIntegrity(db)).toMatchObject({ block: 201n, ok: false });

    env.chain.integrityImpl = async () => ({
      ok: true,
      chainId: 196,
      blockNumber: 202n,
      blockTimestamp: 1n,
      rpcs: 2,
      checks: [],
      warnings: [],
    });
    await runIntegrity(env.d);
    expect(ops()).toEqual(['[Atropyle ops] integrity: firing', '[Atropyle ops] integrity: resolved']);
    const n = await db.query<{ n: number }>('select count(*)::int as n from public.integrity_runs');
    expect(n[0].n).toBe(4);
  });

  it('is only reachable with the cron secret', async () => {
    const call = (headers: Record<string, string>) =>
      integrity(new Request(`${API}/integrity`, { method: 'POST', headers }), env.d);
    expect((await call({})).status).toBe(401);
    const ok = await call({ 'x-cron-secret': 'c'.repeat(32) });
    expect(await bodyOf(ok)).toEqual({ ok: true, block: '200', failed: [] });
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run test/unit/tick.test.ts test/unit/integrity.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/functions/tick` and `../../src/functions/integrity` do not exist.

- [ ] **Step 7: Write `runTick`, `runIntegrity` and the two cron functions**

`apps/backend/src/tick/run.ts`:

```ts
import type { ChainHead } from '../chain/port';
import type { Deps } from '../deps';
import { errorText } from '../log';
import { opsAlert } from '../ops';
import { releaseLease, tryLease } from '../store/meta';
import { type IndexResult, runIndexer } from './indexer';
import { type KeeperPhaseResult, runKeeperPhase } from './keeper';
import { type NoticeResult, runNotices } from './notices';

export const TICK_LEASE = 'lease:tick';
/** Longer than the 50 s budget plus the Edge Function's own limit, so a crashed run frees the lease in time. */
export const LEASE_TTL_MS = 120_000;

export interface TickResult {
  status: 'ok' | 'partial' | 'locked';
  head: bigint | null;
  indexer: IndexResult | null;
  notices: NoticeResult | null;
  keeper: KeeperPhaseResult | null;
  errors: string[];
}

/**
 * Spec §9.3: one minute's work under one lease and a 50 s budget. The indexer may use half of it, the notices run
 * until 70%, the keeper uses the rest. A failing phase is recorded in `errors` and the next phase still runs.
 */
export async function runTick(d: Deps): Promise<TickResult> {
  const start = d.clock.now();
  const result: TickResult = { status: 'locked', head: null, indexer: null, notices: null, keeper: null, errors: [] };
  if (!(await tryLease(d.sql, TICK_LEASE, start, LEASE_TTL_MS))) return result;
  const fail = (phase: string, e: unknown) => {
    result.errors.push(`${phase}: ${errorText(e)}`);
    d.log.error('tick phase failed', { phase, error: errorText(e) });
  };
  try {
    try {
      await opsAlert(d, 'keeper-key', d.keeperError !== null, d.keeperError ?? 'The keeper secret is usable again.');
    } catch (e) {
      fail('ops', e);
    }
    let head: ChainHead;
    try {
      head = await d.chain.head();
    } catch (e) {
      fail('head', e);
      return result;
    }
    result.head = head.number;
    const budget = d.config.budgetMs;
    try {
      result.indexer = await runIndexer(d, head, start + budget * 0.5);
      if (result.indexer.error !== null) result.errors.push(`indexer: ${result.indexer.error}`);
    } catch (e) {
      fail('indexer', e);
    }
    try {
      result.notices = await runNotices(d, head.timestamp, start + budget * 0.7, result.indexer?.caughtUp ?? false);
    } catch (e) {
      fail('notices', e);
    }
    try {
      result.keeper = await runKeeperPhase(d, head.timestamp, start + budget);
    } catch (e) {
      fail('keeper', e);
    }
    return result;
  } finally {
    result.status = result.errors.length === 0 ? 'ok' : 'partial';
    await releaseLease(d.sql, TICK_LEASE).catch((e) => d.log.error('lease not released', { error: errorText(e) }));
  }
}
```

`apps/backend/src/store/integrity.ts`:

```ts
import { type IntegrityReport, stringify } from '@atropyle/sdk';
import { type Sql, toIso } from '../db/sql';

export async function saveIntegrity(sql: Sql, report: IntegrityReport, nowIso: string): Promise<void> {
  await sql.query(
    `insert into public.integrity_runs (at, block, ok, report)
     values ($1::timestamptz, $2::bigint, $3::boolean, $4::jsonb)`,
    [nowIso, report.blockNumber.toString(), report.ok, stringify(report)],
  );
}

export async function latestIntegrity(sql: Sql): Promise<{ at: string; block: bigint; ok: boolean } | null> {
  const rows = await sql.query<{ at: unknown; block: string; ok: boolean }>(
    'select at, block::text as block, ok from public.integrity_runs order by at desc, id desc limit 1',
  );
  return rows.length === 0 ? null : { at: toIso(rows[0].at), block: BigInt(rows[0].block), ok: rows[0].ok };
}
```

`apps/backend/src/integrity.ts`:

```ts
import { isoAt } from './clock';
import type { Deps } from './deps';
import { opsAlert } from './ops';
import { saveIntegrity } from './store/integrity';

/** Spec §9.2: the SDK's integrity() every ten minutes; a failure is stored and mailed to ops once. */
export async function runIntegrity(d: Deps): Promise<{ ok: boolean; block: bigint; failed: string[] }> {
  const report = await d.chain.integrity();
  await saveIntegrity(d.sql, report, isoAt(d.clock.now()));
  const failed = report.checks.filter((c) => !c.ok).map((c) => c.name);
  await opsAlert(
    d,
    'integrity',
    !report.ok,
    report.ok ? 'Every integrity check passes again.' : `Integrity failed at block ${report.blockNumber}: ${failed.join(', ')}.`,
  );
  return { ok: report.ok, block: report.blockNumber, failed };
}
```

`apps/backend/src/functions/cron.ts`:

```ts
import { safeEqual } from '../crypto';
import type { Deps } from '../deps';
import { HttpError } from '../http';

/** tick and integrity answer only the pg_cron job, which sends CRON_SECRET from Vault (spec §9.3). */
export function requireCron(req: Request, d: Pick<Deps, 'config'>): void {
  if (!safeEqual(req.headers.get('x-cron-secret') ?? '', d.config.cronSecret)) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Missing or wrong cron secret.');
  }
}
```

`apps/backend/src/functions/tick.ts`:

```ts
import type { Deps } from '../deps';
import { json, route } from '../http';
import { runTick } from '../tick/run';
import { requireCron } from './cron';

/** POST /tick, every minute from pg_cron (spec §9.3). The body is the TickResult, for net._http_response. */
export const tick = route<Deps>({ method: 'POST', cors: 'none' }, async (req, d) => {
  requireCron(req, d);
  return json(await runTick(d));
});
```

`apps/backend/src/functions/integrity.ts`:

```ts
import type { Deps } from '../deps';
import { json, route } from '../http';
import { runIntegrity } from '../integrity';
import { requireCron } from './cron';

/** POST /integrity, every ten minutes from pg_cron (spec §9.2). */
export const integrity = route<Deps>({ method: 'POST', cors: 'none' }, async (req, d) => {
  requireCron(req, d);
  return json(await runIntegrity(d));
});
```

- [ ] **Step 8: Run every test of the task to verify they pass**

Run: `npx vitest run test/unit/keeper-phase.test.ts test/unit/tick.test.ts test/unit/integrity.test.ts` (from `apps/backend`)
Expected: PASS, 4 + 6 + 2 = 12 tests.

- [ ] **Step 9: Typecheck and lint**

```bash
npx biome check --write apps/backend
npm run typecheck
npx biome ci .
```

Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/store/keeper.ts apps/backend/src/store/integrity.ts apps/backend/src/ops.ts \
  apps/backend/src/tick/keeper.ts apps/backend/src/tick/run.ts apps/backend/src/integrity.ts \
  apps/backend/src/functions/cron.ts apps/backend/src/functions/tick.ts apps/backend/src/functions/integrity.ts \
  apps/backend/test/unit/keeper-phase.test.ts apps/backend/test/unit/tick.test.ts apps/backend/test/unit/integrity.test.ts
git commit -m "feat(backend): keeper phase with limits, ops alerts, runTick under a lease and budget, integrity" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: The public read functions: `me`, `stats` and `health`

These are the three GET endpoints of spec §9.6. They read only the index, never the chain, so they answer fast and cost no RPC. They are open to every origin (`access-control-allow-origin: *`) and cacheable: `me` for 15 s, `stats` for 60 s (spec §9.2), `health` never.

**Files:**
- Modify: `apps/backend/src/store/vaults.ts` (append `vaultsOfAddress` and `vaultStats`)
- Create: `apps/backend/src/functions/me.ts`, `apps/backend/src/functions/stats.ts`, `apps/backend/src/functions/health.ts`
- Test: `apps/backend/test/unit/read-functions.test.ts`

**Interfaces:**
- Consumes: `route`, `json`, `invalid` (Task 2); `Deps`, fixtures, `testEnv` (Task 5); `getCursor`, `setCursor`, `getMeta`, `setMeta`, `seedVault` (Task 7); `latestIntegrity`, `saveIntegrity` (Task 9).
- Produces:
  - `store/vaults.ts`: `interface AddressVault { vault: Address; roles: Role[]; drill: boolean; state: StateName; released: boolean }`, `vaultsOfAddress(sql, address): Promise<AddressVault[]>`, `vaultStats(sql): Promise<{ vaults: string; drills: string; checkIns: string }>`
  - `functions/me.ts`: `me: Handler<Deps>`; `functions/stats.ts`: `stats: Handler<Deps>`; `functions/health.ts`: `health: Handler<Deps>`, `EPOCH`
  - Response bodies exactly as spec §9.6:
    - `/me`: `{ address, block, vaults: [{ vault, roles, drill, state, released }] }`
    - `/stats`: `{ block, vaults, drills, checkIns, updatedAt }`
    - `/health`: `{ indexer: { block, lagBlocks, updatedAt }, integrity: { at, block, ok } | null, keeper: { lastRunAt, balanceWei, dryRun } | null }`

- [ ] **Step 1: Write the failing test**

`apps/backend/test/unit/read-functions.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EPOCH, health } from '../../src/functions/health';
import { me } from '../../src/functions/me';
import { stats } from '../../src/functions/stats';
import { saveIntegrity } from '../../src/store/integrity';
import { setCursor, setMeta } from '../../src/store/meta';
import { insertEvents } from '../../src/store/vaults';
import { type TestDb, testDb } from '../helpers/db';
import { type TestEnv, testEnv } from '../helpers/deps';
import { addr, GUARDIAN, HEIR, OWNER, T0, txh, VAULT, VAULT2, vaultEvent, view } from '../helpers/fixtures';
import { API, bodyOf, getReq } from '../helpers/http';
import { seedVault } from '../helpers/seed';

const ISO = '2026-11-23T12:00:00.000Z';

describe('GET /me, /stats, /health (spec §9.6)', () => {
  let db: TestDb;
  let env: TestEnv;
  beforeAll(async () => {
    db = await testDb();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.reset();
    env = testEnv(db);
    await seedVault(db, view());
    await seedVault(
      db,
      view({
        vault: VAULT2,
        drill: false,
        state: 'releasedInherit',
        pending: 'releasedInherit',
        released: true,
        roles: [
          { address: OWNER, role: 'owner' },
          { address: HEIR, role: 'heir' },
          { address: HEIR, role: 'guardian' },
        ],
      }),
      { createdBlock: 160n },
    );
    await setCursor(db, 197n, ISO);
  });

  it('lists the vaults of an address with its roles, newest first', async () => {
    const res = await me(getReq(`me?address=${HEIR.toLowerCase()}`, { origin: 'https://anywhere.example' }), env.d);
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(res.headers.get('cache-control')).toBe('public, max-age=15');
    expect(await bodyOf(res)).toEqual({
      address: HEIR,
      block: '197',
      vaults: [
        { vault: VAULT2, roles: ['guardian', 'heir'], drill: false, state: 'releasedInherit', released: true },
        { vault: VAULT, roles: ['heir'], drill: true, state: 'active', released: false },
      ],
    });
    const owner = await bodyOf<{ vaults: { roles: string[] }[] }>(await me(getReq(`me?address=${OWNER}`), env.d));
    expect(owner.vaults.map((v) => v.roles)).toEqual([['owner'], ['owner']]);
    const nobody = await bodyOf(await me(getReq(`me?address=${addr(0xdead)}`), env.d));
    expect(nobody).toEqual({ address: addr(0xdead), block: '197', vaults: [] });
  });

  it('refuses a missing or malformed address', async () => {
    for (const q of ['me', 'me?address=0x12', `me?address=${GUARDIAN}x`]) {
      const res = await me(getReq(q), env.d);
      expect(res.status, q).toBe(400);
      expect(await bodyOf(res)).toMatchObject({ code: 'INVALID_INPUT' });
    }
  });

  it('counts vaults, Drills and check-ins as strings, cached for a minute', async () => {
    await insertEvents(db, [
      { event: vaultEvent('Alive', { at: T0 }, { blockNumber: 170n, transactionHash: txh(40) }), at: T0 },
    ]);
    const res = await stats(getReq('stats'), env.d);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(await bodyOf(res)).toEqual({ block: '197', vaults: '2', drills: '1', checkIns: '1', updatedAt: ISO });
    expect((await stats(new Request(`${API}/stats`, { method: 'POST' }), env.d)).status).toBe(405);
  });

  it('reports an empty health before the first tick', async () => {
    await db.reset();
    const res = await health(getReq('health'), env.d);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await bodyOf(res)).toEqual({
      indexer: { block: '0', lagBlocks: 0, updatedAt: EPOCH },
      integrity: null,
      keeper: null,
    });
  });

  it('reports indexer lag, the latest integrity run and the keeper', async () => {
    await setMeta(db, 'indexer', { block: 197n, head: 200n }, ISO);
    await saveIntegrity(
      db,
      { ok: true, chainId: 196, blockNumber: 199n, blockTimestamp: T0, rpcs: 2, checks: [], warnings: [] },
      ISO,
    );
    await setMeta(
      db,
      'keeper',
      { lastRunAt: ISO, balanceWei: 5n * 10n ** 16n, dryRun: false, keeper: addr(0x7777), sent: 0, stopped: null },
      ISO,
    );
    expect(await bodyOf(await health(getReq('health'), env.d))).toEqual({
      indexer: { block: '197', lagBlocks: 3, updatedAt: ISO },
      integrity: { at: ISO, block: '199', ok: true },
      keeper: { lastRunAt: ISO, balanceWei: '50000000000000000', dryRun: false },
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/unit/read-functions.test.ts` (from `apps/backend`)
Expected: FAIL. `../../src/functions/health` (and the other two) do not exist.

- [ ] **Step 3: Append the two reads to the vault store**

Append to `apps/backend/src/store/vaults.ts` (and add `import type { Role } from '../types';` to its imports):

```ts
export interface AddressVault {
  vault: Address;
  roles: Role[];
  drill: boolean;
  state: StateName;
  released: boolean;
}

/** Vaults where `address` holds a role, newest first, roles in the order owner, guardian, heir (spec §9.6 /me). */
export async function vaultsOfAddress(sql: Sql, address: Address): Promise<AddressVault[]> {
  const rows = await sql.query<{ address: string; roles: Role[]; drill: boolean; state: StateName; released: boolean }>(
    `select v.address, v.drill, v.state, v.released,
            array_agg(r.role order by array_position(array['owner', 'guardian', 'heir'], r.role)) as roles
       from public.vault_roles r
       join public.vaults v on v.address = r.vault
      where r.address = $1::text
      group by v.address, v.drill, v.state, v.released, v.created_block
      order by v.created_block desc, v.address
      limit 200`,
    [address.toLowerCase()],
  );
  return rows.map((r) => ({
    vault: getAddress(r.address),
    roles: r.roles,
    drill: r.drill,
    state: r.state,
    released: r.released,
  }));
}

/** Home page counters (spec §9.6 /stats). Every vault emits one Alive when it is created; the rest are check-ins. */
export async function vaultStats(sql: Sql): Promise<{ vaults: string; drills: string; checkIns: string }> {
  const [row] = await sql.query<{ vaults: string; drills: string; check_ins: string }>(
    `select count(*)::text as vaults,
            (count(*) filter (where drill))::text as drills,
            greatest((select count(*) from public.vault_events where name = 'Alive') - count(*), 0)::text as check_ins
       from public.vaults`,
  );
  return { vaults: row.vaults, drills: row.drills, checkIns: row.check_ins };
}
```

- [ ] **Step 4: Write the three handlers**

`apps/backend/src/functions/me.ts`:

```ts
import { getAddress, isAddress } from 'viem';
import type { Deps } from '../deps';
import { invalid, json, route } from '../http';
import { getCursor } from '../store/meta';
import { vaultsOfAddress } from '../store/vaults';

/** GET /me?address= (spec §9.6): public index data, so any origin may read it. */
export const me = route<Deps>({ method: 'GET', cors: 'public' }, async (req, d) => {
  const raw = new URL(req.url).searchParams.get('address') ?? '';
  if (!isAddress(raw, { strict: false })) throw invalid('address must be an address.');
  const address = getAddress(raw);
  const block = (await getCursor(d.sql)) ?? 0n;
  return json({ address, block, vaults: await vaultsOfAddress(d.sql, address) }, 200, {
    'cache-control': 'public, max-age=15',
  });
});
```

`apps/backend/src/functions/stats.ts`:

```ts
import { toIso } from '../db/sql';
import type { Deps } from '../deps';
import { json, route } from '../http';
import { getCursor } from '../store/meta';
import { vaultStats } from '../store/vaults';
import { EPOCH } from './health';

/** GET /stats (spec §9.6), cached for 60 s. */
export const stats = route<Deps>({ method: 'GET', cors: 'public' }, async (_req, d) => {
  const rows = await d.sql.query<{ updated_at: unknown }>("select updated_at from public.cursors where name = 'logs'");
  const updatedAt = rows.length === 0 ? EPOCH : toIso(rows[0].updated_at);
  const block = (await getCursor(d.sql)) ?? 0n;
  return json({ block, ...(await vaultStats(d.sql)), updatedAt }, 200, { 'cache-control': 'public, max-age=60' });
});
```

`apps/backend/src/functions/health.ts`:

```ts
import type { Deps } from '../deps';
import { json, route } from '../http';
import { latestIntegrity } from '../store/integrity';
import { getMeta } from '../store/meta';

/** The updatedAt of a backend that has not run a tick yet: old enough for any monitor to flag. */
export const EPOCH = '1970-01-01T00:00:00.000Z';

interface IndexerMeta {
  block: string;
  head: string;
}

interface KeeperMeta {
  lastRunAt: string;
  balanceWei: string | null;
  dryRun: boolean;
}

/** GET /health (spec §9.6): index lag, the latest integrity run, the keeper. Never cached. */
export const health = route<Deps>({ method: 'GET', cors: 'public' }, async (_req, d) => {
  const idx = await getMeta<IndexerMeta>(d.sql, 'indexer');
  const indexer = idx
    ? {
        block: idx.value.block,
        lagBlocks: Number(BigInt(idx.value.head) - BigInt(idx.value.block)),
        updatedAt: idx.updatedAt,
      }
    : { block: '0', lagBlocks: 0, updatedAt: EPOCH };
  const integrity = await latestIntegrity(d.sql);
  const keeper = await getMeta<KeeperMeta>(d.sql, 'keeper');
  return json(
    {
      indexer,
      integrity,
      keeper: keeper
        ? { lastRunAt: keeper.value.lastRunAt, balanceWei: keeper.value.balanceWei ?? '0', dryRun: keeper.value.dryRun }
        : null,
    },
    200,
    { 'cache-control': 'no-store' },
  );
});
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run test/unit/read-functions.test.ts` (from `apps/backend`)
Expected: PASS, 5 tests.

- [ ] **Step 6: Typecheck and lint**

```bash
npx biome check --write apps/backend
npm run typecheck
npx biome ci .
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/store/vaults.ts apps/backend/src/functions/me.ts apps/backend/src/functions/stats.ts \
  apps/backend/src/functions/health.ts apps/backend/test/unit/read-functions.test.ts
git commit -m "feat(backend): public me, stats and health reads from the index" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 11: Deno entries, production wiring and the function bundles

**Files:**
- Create: `apps/backend/src/entry/deno.d.ts`, `apps/backend/src/entry/runtime.ts`
- Create: `apps/backend/src/entry/subscribe.ts`, `confirm.ts`, `unsubscribe.ts`, `me.ts`, `stats.ts`, `health.ts`, `tick.ts`, `integrity.ts` (all in `apps/backend/src/entry/`)
- Create: `apps/backend/scripts/build-functions.ts`, `apps/backend/build.ts`
- Create: `supabase/config.toml`
- Modify: `.gitignore`, `biome.json`
- Test: `apps/backend/test/unit/runtime.test.ts`, `apps/backend/test/unit/bundle.test.ts`

**Interfaces:**
- Consumes:
  - `loadConfig(env: Env): Config`, `ConfigError(problems)`, `type Env` (Task 2); `problem`, `type Handler<D>` (Task 2); `jsonLog`, `memoryLog`, `errorText`, `type Log` (Task 2); `systemClock` (Task 2)
  - `connectPostgres(url, factory?)`, `type PgFactory`, `type PgQueryable` (Task 1)
  - `resendMailer({ apiKey })`, `disabledMailer()`, `RESEND_URL` (Task 4); `type Mail` (Task 4)
  - `createSdkChain(atro, { wallet })` (Task 5); `keeperSignerFromEnv(env, chain, transport)`, `KEEPER_KEY_INVALID` (Task 5); `type Deps` (Task 5)
  - The handlers `subscribe`, `confirm`, `unsubscribe` (Task 6), `tick`, `integrity` (Task 9), `me`, `stats`, `health` (Task 10), each a `Handler<Deps>`
  - From `@atropyle/sdk`: `createAtropyle`, `readTransport`, `getDeployment`
- Produces:
  - `src/entry/runtime.ts`: `interface BuildOptions { pg?: PgFactory; log?: Log }`, `buildDeps(env: Env, o?: BuildOptions): Deps`, `lazyHandler(handler: Handler<Deps>, env: Env, build?: (env: Env) => Deps, log?: Log): (req: Request) => Promise<Response>`, `serve(handler: Handler<Deps>): void`
  - `scripts/build-functions.ts`: `FUNCTIONS` (the eight names), `type FunctionName`, `POSTGRES_SPECIFIER = 'npm:postgres@3.4.9'`, `MAX_BUNDLE_BYTES = 4 MiB`, `interface BundleReport { name; file; bytes; imports: string[]; inputs: string[] }`, `checkBundles(reports): string[]`, `bundleFunctions(outDir: string): Promise<BundleReport[]>`
  - `npm run build -w apps/backend` writes `supabase/functions/<name>/index.js` (gitignored)
  - `supabase/config.toml`: one `[functions.<name>]` block per function with `verify_jwt = false` and `entrypoint = "./functions/<name>/index.js"`

Two rules from Task 5's zero-key test apply to every file of this task under `src/`, `scripts/` and `build.ts`. Only `src/keeper/signer.ts` may name the keeper secret's variable or build an account. No source may name raw-transaction RPC methods. `runtime.ts` therefore reaches the keeper only through `keeperSignerFromEnv`, and its comments say "keeper secret". The test files under `test/` are not scanned.

- [ ] **Step 1: Write the failing runtime test**

`apps/backend/test/unit/runtime.test.ts`:

```ts
import { getDeployment } from '@atropyle/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigError } from '../../src/config';
import type { PgFactory, PgQueryable } from '../../src/db/postgres';
import type { Deps } from '../../src/deps';
import type { Mail } from '../../src/email/compose';
import { buildDeps, lazyHandler } from '../../src/entry/runtime';
import { KEEPER_KEY_INVALID } from '../../src/keeper/signer';
import { memoryLog } from '../../src/log';
import { RESEND_URL } from '../../src/mail/mailer';

const DB_URL = 'postgres://postgres.ref:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres';
const BASE: Record<string, string> = {
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_DB_URL: DB_URL,
  SITE_URL: 'https://atropyle.test',
  MAIL_FROM: 'Atropyle <alerts@atropyle.test>',
  TOKEN_SECRET: 't'.repeat(32),
  CRON_SECRET: 'c'.repeat(32),
};

const envOf =
  (over: Record<string, string | undefined> = {}) =>
  (name: string): string | undefined =>
    ({ ...BASE, ...over })[name];

/** A postgres.js stand-in: buildDeps must not open a connection, only create the client. */
function fakePg() {
  const urls: string[] = [];
  const q: PgQueryable = { unsafe: async () => [] };
  const factory: PgFactory = (url) => {
    urls.push(url);
    return { ...q, begin: (fn) => fn(q), end: async () => {} };
  };
  return { factory, urls };
}

const MAIL: Mail = {
  from: 'Atropyle <alerts@atropyle.test>',
  to: 'reader@example.com',
  subject: 'Test',
  html: '<p>Test</p>',
  text: 'Test',
  headers: {},
  tags: [{ name: 'kind', value: 'welcome' }],
  idempotencyKey: 'k1',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildDeps (production wiring, spec §9.2)', () => {
  it('wires the database, the X Layer deployment and the settings from the secrets', () => {
    const pg = fakePg();
    const d = buildDeps(envOf(), { pg: pg.factory });
    expect(pg.urls).toEqual([DB_URL]);
    expect(d.chain.factoryBlock).toBe(getDeployment('xlayer').factoryBlock);
    expect(d.config).toMatchObject({
      siteUrl: 'https://atropyle.test',
      apiUrl: 'https://ref.supabase.co/functions/v1',
      rpcUrls: null,
    });
    expect(d.keeperError).toBeNull();
    const a = d.random(32);
    expect(a).toHaveLength(32);
    expect(d.random(32)).not.toEqual(a);
  });

  it('sends through Resend only when RESEND_API_KEY is set', async () => {
    await expect(buildDeps(envOf(), { pg: fakePg().factory }).mailer.send(MAIL)).rejects.toThrow(
      'RESEND_API_KEY is not set',
    );
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get('authorization') });
      return Response.json({ id: 'email-1' });
    });
    const d = buildDeps(envOf({ RESEND_API_KEY: 're_test_only' }), { pg: fakePg().factory });
    expect(await d.mailer.send(MAIL)).toEqual({ id: 'email-1' });
    expect(calls).toEqual([{ url: RESEND_URL, auth: 'Bearer re_test_only' }]);
  });

  it('refuses to start without its secrets and names each missing one', () => {
    let error: unknown;
    try {
      buildDeps(envOf({ SUPABASE_DB_URL: undefined, MAIL_FROM: undefined }), { pg: fakePg().factory });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).problems).toEqual(['MAIL_FROM is not set', 'SUPABASE_DB_URL is not set']);
  });

  it('keeps the keeper dry and records why when the keeper secret is not a key', () => {
    const d = buildDeps(envOf({ KEEPER_KEY: 'not-a-key' }), { pg: fakePg().factory });
    expect(d.keeperError).toBe(KEEPER_KEY_INVALID);
  });
});

describe('lazyHandler', () => {
  const req = () => new Request('https://ref.supabase.co/functions/v1/health');

  it('answers 500 while the secrets are missing, then builds once when they are set', async () => {
    const log = memoryLog();
    const deps = { marker: 'deps' } as unknown as Deps;
    let ready = false;
    let builds = 0;
    const build = () => {
      builds++;
      if (!ready) throw new ConfigError(['SITE_URL is not set']);
      return deps;
    };
    const h = lazyHandler(async (_req, d) => Response.json({ same: d === deps }), envOf(), build, log);

    const first = await h(req());
    expect(first.status).toBe(500);
    expect(first.headers.get('content-type')).toBe('application/problem+json; charset=utf-8');
    expect(await first.json()).toEqual({
      type: 'about:blank',
      title: 'The service is not configured yet.',
      status: 500,
      code: 'INTERNAL',
    });
    expect(log.lines).toEqual([
      {
        level: 'error',
        msg: 'backend not configured',
        data: { error: 'The backend is not configured: SITE_URL is not set.' },
      },
    ]);

    ready = true;
    expect(await (await h(req())).json()).toEqual({ same: true });
    expect(await (await h(req())).json()).toEqual({ same: true });
    expect(builds).toBe(2);
  });

  it('logs which secret is wrong, never its value', async () => {
    const log = memoryLog();
    const pg = fakePg();
    const h = lazyHandler(
      async () => new Response('unreachable'),
      envOf({ TOKEN_SECRET: 'hunter2-short' }),
      (env) => buildDeps(env, { pg: pg.factory }),
      log,
    );
    expect((await h(req())).status).toBe(500);
    const logged = JSON.stringify(log.lines);
    expect(logged).toContain('TOKEN_SECRET must be at least 32 characters');
    expect(logged).not.toContain('hunter2');
    expect(pg.urls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/unit/runtime.test.ts` (from `apps/backend`)
Expected: FAIL with `Failed to load url ../../src/entry/runtime`.

- [ ] **Step 3: Write the Deno declarations and the runtime**

`apps/backend/src/entry/deno.d.ts`:

```ts
/**
 * The two Deno globals the entries use on Supabase's Edge Runtime. Only src/entry/runtime.ts touches them, inside
 * serve(); Node (the tests) never calls serve().
 */
interface AtropyleDenoGlobal {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
}

declare const Deno: AtropyleDenoGlobal;
```

`apps/backend/src/entry/runtime.ts`:

```ts
import { createAtropyle, readTransport } from '@atropyle/sdk';
import { createSdkChain } from '../chain/sdk';
import { systemClock } from '../clock';
import { type Config, ConfigError, type Env, loadConfig } from '../config';
import { connectPostgres, type PgFactory } from '../db/postgres';
import type { Deps } from '../deps';
import { type Handler, problem } from '../http';
import { keeperSignerFromEnv } from '../keeper/signer';
import { errorText, jsonLog, type Log } from '../log';
import { disabledMailer, resendMailer } from '../mail/mailer';

export interface BuildOptions {
  /** postgres.js in production (the default); tests pass a stand-in. */
  pg?: PgFactory;
  log?: Log;
}

/**
 * Production wiring of the five ports from the function secrets (apps/backend/README.md). It opens no connection
 * and makes no request: postgres.js connects on the first query, viem on the first call.
 *
 * - Database: SUPABASE_DB_URL (a Supabase default secret) through postgres.js.
 * - Chain: the X Layer deployment bundled in the SDK, read over RPC_URLS when set, else the deployment's own URLs.
 * - Keeper: the keeper secret, read only by keeperSignerFromEnv. Without it the keeper runs dry.
 * - Mail: Resend when RESEND_API_KEY is set; otherwise every delivery fails and stays unsent until it is.
 */
export function buildDeps(env: Env, o: BuildOptions = {}): Deps {
  const problems: string[] = [];
  let config: Config | null = null;
  try {
    config = loadConfig(env);
  } catch (e) {
    if (!(e instanceof ConfigError)) throw e;
    problems.push(...e.problems);
  }
  const dbUrl = env('SUPABASE_DB_URL')?.trim() ?? '';
  if (dbUrl === '') problems.push('SUPABASE_DB_URL is not set');
  if (config === null || problems.length > 0) throw new ConfigError(problems);

  const atro = createAtropyle({
    chain: 'xlayer',
    transport: config.rpcUrls === null ? undefined : readTransport(config.rpcUrls),
  });
  const signer = keeperSignerFromEnv(env, atro.chain, readTransport(config.rpcUrls ?? atro.deployment.rpcUrls));
  return {
    sql: connectPostgres(dbUrl, o.pg),
    chain: createSdkChain(atro, { wallet: signer.wallet }),
    mailer: config.resendApiKey === null ? disabledMailer() : resendMailer({ apiKey: config.resendApiKey }),
    clock: systemClock,
    log: o.log ?? jsonLog(),
    config,
    random: (size) => crypto.getRandomValues(new Uint8Array(size)),
    keeperError: signer.error,
  };
}

/**
 * Builds the Deps on the first request of an isolate and keeps them for the next ones. While a secret is missing
 * or invalid, every request answers 500 INTERNAL and logs which secret is wrong (ConfigError names variables, never
 * values). The build is retried on the next request, so the function recovers once the secret is set.
 */
export function lazyHandler(
  handler: Handler<Deps>,
  env: Env,
  build: (env: Env) => Deps = buildDeps,
  log: Log = jsonLog(),
): (req: Request) => Promise<Response> {
  let deps: Deps | null = null;
  return async (req) => {
    if (deps === null) {
      try {
        deps = build(env);
      } catch (e) {
        log.error('backend not configured', { error: errorText(e) });
        return problem(500, 'INTERNAL', 'The service is not configured yet.');
      }
    }
    return handler(req, deps);
  };
}

/** The whole body of every entry file: serve one handler with Deno.serve (Supabase Edge Runtime). */
export function serve(handler: Handler<Deps>): void {
  Deno.serve(lazyHandler(handler, (name) => Deno.env.get(name)));
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/unit/runtime.test.ts` (from `apps/backend`)
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing bundle test**

`apps/backend/test/unit/bundle.test.ts`:

```ts
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type BundleReport,
  bundleFunctions,
  checkBundles,
  FUNCTIONS,
  MAX_BUNDLE_BYTES,
  POSTGRES_SPECIFIER,
} from '../../scripts/build-functions';

const BACKEND = fileURLToPath(new URL('../../', import.meta.url));
const CONFIG_TOML = fileURLToPath(new URL('../../../../supabase/config.toml', import.meta.url));

describe('function bundles (spec §9.2, plan ruling 1)', () => {
  let dir: string;
  let reports: BundleReport[];
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'atropyle-functions-'));
    reports = await bundleFunctions(dir);
  }, 120_000);
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('bundles each function with the SDK inlined and only postgres left as an import', () => {
    expect(reports.map((r) => r.name)).toEqual([...FUNCTIONS]);
    for (const r of reports) {
      expect(r.file).toBe(join(dir, r.name, 'index.js'));
      expect(r.imports).toEqual([POSTGRES_SPECIFIER]);
      expect(r.inputs.some((i) => i.includes('sdk/dist/'))).toBe(true);
      expect(r.inputs).toContain(`src/entry/${r.name}.ts`);
      expect(r.inputs).toContain(`src/functions/${r.name}.ts`);
    }
  });

  it('keeps test-only and build-time packages out of every bundle', () => {
    for (const r of reports) {
      const leaked = r.inputs.filter(
        (i) =>
          /node_modules\/(@electric-sql|react|react-dom|@react-email|esbuild)\//.test(i) ||
          i.startsWith('emails/') ||
          i.startsWith('test/'),
      );
      expect(leaked, r.name).toEqual([]);
    }
  });

  it('stays under the 4 MB cap and serves through Deno.serve', () => {
    for (const r of reports) {
      expect(r.bytes, r.name).toBeLessThan(MAX_BUNDLE_BYTES);
      const code = readFileSync(r.file, 'utf8');
      expect(code).toContain('Deno.serve(');
      expect(code).toContain(POSTGRES_SPECIFIER);
    }
    expect(checkBundles(reports)).toEqual([]);
  });

  it('names an oversized bundle and a stray import', () => {
    const base: BundleReport = { name: 'tick', file: 'x', bytes: 10, imports: [POSTGRES_SPECIFIER], inputs: [] };
    expect(
      checkBundles([
        { ...base, bytes: MAX_BUNDLE_BYTES + 1 },
        { ...base, name: 'me', imports: [POSTGRES_SPECIFIER, 'node:fs'] },
      ]),
    ).toEqual([
      `tick is ${MAX_BUNDLE_BYTES + 1} bytes, over the ${MAX_BUNDLE_BYTES} byte cap`,
      'me imports node:fs; only npm:postgres@3.4.9 may stay external',
    ]);
  });
});

describe('function sources and Supabase config', () => {
  it('has one entry file per function and pins the same postgres as package.json', () => {
    const entries = readdirSync(join(BACKEND, 'src/entry'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && f !== 'runtime.ts')
      .map((f) => f.replace(/\.ts$/, ''))
      .sort();
    expect(entries).toEqual([...FUNCTIONS].sort());
    const pkg = JSON.parse(readFileSync(join(BACKEND, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(`npm:postgres@${pkg.dependencies.postgres}`).toBe(POSTGRES_SPECIFIER);
  });

  it('declares every function in supabase/config.toml, public and pointing at its bundle', () => {
    const toml = readFileSync(CONFIG_TOML, 'utf8').replace(/\r\n/g, '\n');
    expect(toml.match(/^\[functions\./gm)).toHaveLength(FUNCTIONS.length);
    for (const name of FUNCTIONS) {
      expect(toml).toContain(
        `[functions.${name}]\nenabled = true\nverify_jwt = false\nentrypoint = "./functions/${name}/index.js"\n`,
      );
    }
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run test/unit/bundle.test.ts` (from `apps/backend`)
Expected: FAIL with `Failed to load url ../../scripts/build-functions`.

- [ ] **Step 7: Write the eight entries**

Each entry is three lines and differs only in the function name. Create all eight.

`apps/backend/src/entry/subscribe.ts`:

```ts
import { subscribe } from '../functions/subscribe';
import { serve } from './runtime';

serve(subscribe);
```

`apps/backend/src/entry/confirm.ts`:

```ts
import { confirm } from '../functions/confirm';
import { serve } from './runtime';

serve(confirm);
```

`apps/backend/src/entry/unsubscribe.ts`:

```ts
import { unsubscribe } from '../functions/unsubscribe';
import { serve } from './runtime';

serve(unsubscribe);
```

`apps/backend/src/entry/me.ts`:

```ts
import { me } from '../functions/me';
import { serve } from './runtime';

serve(me);
```

`apps/backend/src/entry/stats.ts`:

```ts
import { stats } from '../functions/stats';
import { serve } from './runtime';

serve(stats);
```

`apps/backend/src/entry/health.ts`:

```ts
import { health } from '../functions/health';
import { serve } from './runtime';

serve(health);
```

`apps/backend/src/entry/tick.ts`:

```ts
import { tick } from '../functions/tick';
import { serve } from './runtime';

serve(tick);
```

`apps/backend/src/entry/integrity.ts`:

```ts
import { integrity } from '../functions/integrity';
import { serve } from './runtime';

serve(integrity);
```

- [ ] **Step 8: Write the bundler and its CLI**

`apps/backend/scripts/build-functions.ts`:

```ts
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'esbuild';

/** The eight Edge Functions of spec §9.2. Each has src/entry/<name>.ts and a block in supabase/config.toml. */
export const FUNCTIONS = ['subscribe', 'confirm', 'unsubscribe', 'me', 'stats', 'health', 'tick', 'integrity'] as const;
export type FunctionName = (typeof FUNCTIONS)[number];

/** Deno resolves npm: specifiers itself. The version matches apps/backend/package.json (a unit test compares). */
export const POSTGRES_SPECIFIER = 'npm:postgres@3.4.9';
/** Plan ruling 1: well under the 5 MB limit of a bundle that Supabase builds server-side (--use-api). */
export const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;

const BACKEND = fileURLToPath(new URL('../', import.meta.url));

/** postgres.js stays an import of the bundle: Deno loads it from npm, with its Node built-ins. */
const postgresFromNpm: Plugin = {
  name: 'postgres-from-npm',
  setup(b) {
    b.onResolve({ filter: /^postgres$/ }, () => ({ path: POSTGRES_SPECIFIER, external: true }));
  },
};

export interface BundleReport {
  name: FunctionName;
  /** Absolute path of <outDir>/<name>/index.js. */
  file: string;
  bytes: number;
  /** External imports left in the bundle, deduplicated. Only POSTGRES_SPECIFIER is allowed. */
  imports: string[];
  /** Source files inlined into the bundle, relative to apps/backend, with forward slashes. */
  inputs: string[];
}

/** Every reason a set of bundles must not be deployed; empty when they are fine. */
export function checkBundles(reports: readonly BundleReport[]): string[] {
  const problems: string[] = [];
  for (const r of reports) {
    if (r.bytes > MAX_BUNDLE_BYTES) {
      problems.push(`${r.name} is ${r.bytes} bytes, over the ${MAX_BUNDLE_BYTES} byte cap`);
    }
    for (const i of r.imports) {
      if (i !== POSTGRES_SPECIFIER) problems.push(`${r.name} imports ${i}; only ${POSTGRES_SPECIFIER} may stay external`);
    }
  }
  return problems;
}

/**
 * One esbuild run, one self-contained ESM file per function: <outDir>/<name>/index.js, with @atropyle/sdk, its
 * circuits and viem inlined. platform 'browser' keeps Node built-ins out (the SDK and circuits dist import none).
 * Throws when checkBundles finds a problem.
 */
export async function bundleFunctions(outDir: string): Promise<BundleReport[]> {
  mkdirSync(outDir, { recursive: true });
  const result = await build({
    absWorkingDir: BACKEND,
    entryPoints: Object.fromEntries(FUNCTIONS.map((name) => [`${name}/index`, `src/entry/${name}.ts`])),
    outdir: outDir,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    conditions: ['worker', 'browser'],
    minify: true,
    charset: 'utf8',
    legalComments: 'eof',
    metafile: true,
    logLevel: 'silent',
    plugins: [postgresFromNpm],
  });
  const outputs = Object.entries(result.metafile.outputs);
  const reports = FUNCTIONS.map((name): BundleReport => {
    const found = outputs.find(([path]) => path.replace(/\\/g, '/').endsWith(`/${name}/index.js`));
    if (!found) throw new Error(`esbuild wrote no bundle for ${name}`);
    const [, out] = found;
    return {
      name,
      file: join(outDir, name, 'index.js'),
      bytes: out.bytes,
      imports: [...new Set(out.imports.filter((i) => i.external).map((i) => i.path))],
      inputs: Object.keys(out.inputs).map((i) => i.replace(/\\/g, '/')),
    };
  });
  const problems = checkBundles(reports);
  if (problems.length > 0) throw new Error(`The function bundles cannot be deployed:\n${problems.join('\n')}`);
  return reports;
}
```

`apps/backend/build.ts`:

```ts
// npm run build -w apps/backend: bundles the eight Edge Functions into supabase/functions/<name>/index.js.
// Deploying them is the maintainer's step (apps/backend/README.md); this script never deploys.
import { fileURLToPath } from 'node:url';
import { bundleFunctions, MAX_BUNDLE_BYTES } from './scripts/build-functions';

const outDir = fileURLToPath(new URL('../../supabase/functions/', import.meta.url));
const reports = await bundleFunctions(outDir);
const kb = (n: number) => `${(n / 1024).toFixed(0).padStart(5)} kB`;
for (const r of reports) console.log(`${r.name.padEnd(12)} ${kb(r.bytes)}  imports ${r.imports.join(', ')}`);
console.log(`${reports.length} functions in ${outDir} (cap ${kb(MAX_BUNDLE_BYTES).trim()} each)`);
```

- [ ] **Step 9: Write the Supabase config and ignore the build output**

`supabase/config.toml`:

```toml
# Supabase CLI settings for `supabase db push` and `supabase functions deploy --use-api` (apps/backend/README.md).
# The functions are pre-bundled by `npm run build -w apps/backend` into functions/<name>/index.js (gitignored);
# `entrypoint` is relative to this directory. JWT verification is off for all eight: the public endpoints take no
# Supabase session (spec §9.6), and tick and integrity check the x-cron-secret header themselves.
project_id = "atropyle"

[functions.subscribe]
enabled = true
verify_jwt = false
entrypoint = "./functions/subscribe/index.js"

[functions.confirm]
enabled = true
verify_jwt = false
entrypoint = "./functions/confirm/index.js"

[functions.unsubscribe]
enabled = true
verify_jwt = false
entrypoint = "./functions/unsubscribe/index.js"

[functions.me]
enabled = true
verify_jwt = false
entrypoint = "./functions/me/index.js"

[functions.stats]
enabled = true
verify_jwt = false
entrypoint = "./functions/stats/index.js"

[functions.health]
enabled = true
verify_jwt = false
entrypoint = "./functions/health/index.js"

[functions.tick]
enabled = true
verify_jwt = false
entrypoint = "./functions/tick/index.js"

[functions.integrity]
enabled = true
verify_jwt = false
entrypoint = "./functions/integrity/index.js"
```

In `.gitignore`, add at the end:

```
# Supabase: function bundles from `npm run build -w apps/backend`, and the CLI's local state (`supabase link`).
supabase/functions/
supabase/.temp/
supabase/.branches/
```

In `biome.json`, add one more entry to `files.includes`, after `"!apps/backend/.preview"` (remember the comma after the previous entry):

```json
      "!supabase/functions"
```

- [ ] **Step 10: Run the task's tests to verify they pass**

Run: `npx vitest run test/unit/runtime.test.ts test/unit/bundle.test.ts` (from `apps/backend`)
Expected: PASS, 6 + 6 = 12 tests. The bundle test takes a few seconds (one esbuild run for all eight functions). If `sdk/dist/` is missing from the inputs, run `npm run build` at the root first (the SDK is consumed from its `dist`).

- [ ] **Step 11: Build the real bundles once and check what git sees**

```bash
npm run build -w apps/backend
git status --short supabase
```

Expected: eight lines like `tick          1234 kB  imports npm:postgres@3.4.9`, each under 4096 kB, then `8 functions in …/supabase/functions/`. `git status` lists `?? supabase/config.toml` (plus the migrations if Task 1 is not committed yet), and nothing under `supabase/functions/`.

- [ ] **Step 12: Typecheck and lint**

```bash
npx biome check --write apps/backend
npm run typecheck
npx biome ci .
```

Expected: no errors. Task 5's zero-key test still passes (`npx vitest run test/unit/zero-key.test.ts`): `runtime.ts` reaches the keeper only through `keeperSignerFromEnv`.

- [ ] **Step 13: Commit**

```bash
git add apps/backend/src/entry/deno.d.ts apps/backend/src/entry/runtime.ts \
  apps/backend/src/entry/subscribe.ts apps/backend/src/entry/confirm.ts apps/backend/src/entry/unsubscribe.ts \
  apps/backend/src/entry/me.ts apps/backend/src/entry/stats.ts apps/backend/src/entry/health.ts \
  apps/backend/src/entry/tick.ts apps/backend/src/entry/integrity.ts \
  apps/backend/scripts/build-functions.ts apps/backend/build.ts supabase/config.toml .gitignore biome.json \
  apps/backend/test/unit/runtime.test.ts apps/backend/test/unit/bundle.test.ts
git commit -m "feat(backend): Deno entries, production wiring and one esbuild bundle per Edge Function" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 12: End to end on anvil: a whole Drill driven only by `tick`

**Files:**
- Create: `apps/backend/vitest.e2e.config.ts`
- Create: `apps/backend/test/e2e/global-setup.ts`
- Test: `apps/backend/test/e2e/drill.test.ts`

**Interfaces:**
- Consumes:
  - `runTick(d: Deps): Promise<TickResult>` (Task 9); `subscribe`, `confirm`, `unsubscribe` (Task 6)
  - `createSdkChain(atro, { wallet })` (Task 5); `testConfig(over)` (Task 5); `testDb()` (Task 1)
  - `captureMailer()` (Task 4); `formatDeadline(at, lang)` (Task 4); `type Mail` (Task 4)
  - `activeSubscribers(sql, vault)` (Task 6); `getVault(sql, vault)` (Task 7); `memoryLog()`, `systemClock` (Task 2)
  - `postJson`, `bodyOf`, `tokenFrom`, `SITE`, `API` (Task 6 helpers)
  - From the repo: `startAnvil`, `deployLocal`, `increaseTime`, `ANVIL_ACCOUNTS` (`scripts/lib/anvil.ts`, the core of `npm run devnet:warp`)
  - From `@atropyle/sdk`: `createAtropyle`, `parseDeployment`, `type PlanInput`, `type VaultStatus`
- Produces: `npm run test:e2e -w apps/backend` (the script exists since Task 1), run by the CI job of Task 13.

This task adds no production code. The test runs Tasks 1 to 11 together against a real chain:
- the SDK adapter on a local anvil (chain 31337);
- the keeper sending from anvil's unlocked account 7 with `eth_sendTransaction` (no key anywhere);
- PGlite as the database;
- the capturing mailer.

Time moves only through `increaseTime` (`evm_increaseTime` + `evm_mine`), the same call as `npm run devnet:warp`. If a step fails, the bug is in an earlier task. Fix it there, together with a unit test in that task's test file. Do not loosen this test.

The Drill preset is period 60 s, threshold 2 and window 120 s, so `lateAt = lastAlive + 120`:
- the 50% reminder is due from `lastAlive + 60`;
- the 80% reminder from `lastAlive + 96`;
- `checkin-due` and the keeper's `poke` from `lateAt`.

anvil stamps a mined block with wall time plus the accumulated offset, so a warp can only land *later* than its target, by the seconds since the previous block. Each warp therefore aims just past the lower edge of its window, which leaves 20 to 35 s of slack, and asserts that it landed inside.

- [ ] **Step 1: Write the e2e config and the global setup**

`apps/backend/vitest.e2e.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/e2e/**/*.test.ts'],
    globalSetup: ['test/e2e/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 180_000,
  },
});
```

`apps/backend/test/e2e/global-setup.ts`:

```ts
import type { TestProject } from 'vitest/node';
import { deployLocal, startAnvil } from '../../../../scripts/lib/anvil';

declare module 'vitest' {
  export interface ProvidedContext {
    rpcUrl: string;
    deployment: Record<string, unknown>;
  }
}

/** Its own anvil (chain 31337) with DeployLocal, like the SDK's integration tests. Transactions use unlocked accounts. */
export default async function setup(project: TestProject) {
  const anvil = await startAnvil();
  let deployment: Record<string, unknown>;
  try {
    deployment = await deployLocal(anvil.url);
  } catch (e) {
    await anvil.stop();
    throw e;
  }
  project.provide('rpcUrl', anvil.url);
  project.provide('deployment', deployment);
  return () => anvil.stop();
}
```

- [ ] **Step 2: Write the e2e test**

`apps/backend/test/e2e/drill.test.ts`:

```ts
import { createAtropyle, type PlanInput, parseDeployment, type VaultStatus } from '@atropyle/sdk';
import { type Address, createWalletClient, erc20Abi, type Hex, http, type WalletClient } from 'viem';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { ANVIL_ACCOUNTS, increaseTime } from '../../../../scripts/lib/anvil';
import { createSdkChain } from '../../src/chain/sdk';
import { systemClock } from '../../src/clock';
import type { Deps } from '../../src/deps';
import type { Mail } from '../../src/email/compose';
import { formatDeadline } from '../../src/email/format';
import { confirm } from '../../src/functions/confirm';
import { subscribe } from '../../src/functions/subscribe';
import { unsubscribe } from '../../src/functions/unsubscribe';
import { memoryLog } from '../../src/log';
import { captureMailer } from '../../src/mail/mailer';
import { activeSubscribers } from '../../src/store/subscriptions';
import { getVault } from '../../src/store/vaults';
import { runTick, type TickResult } from '../../src/tick/run';
import { type TestDb, testDb } from '../helpers/db';
import { testConfig } from '../helpers/deps';
import { API, bodyOf, postJson, SITE, tokenFrom } from '../helpers/http';

const [, OWNER, HEIR, , , , , KEEPER] = ANVIL_ACCOUNTS;
const OWNER_EMAIL = 'owner@example.com';
const HEIR_EMAIL = 'heir@example.com';

describe('a Drill from creation to its summary, driven only by tick (spec §9.3, §12)', () => {
  const rpcUrl = inject('rpcUrl');
  const atro = createAtropyle({ chain: parseDeployment(inject('deployment')), builderCode: null });
  const usdt0 = atro.deployment.feeTokens[0];
  /** An unlocked anvil account: viem sends eth_sendTransaction and anvil signs. No key exists in this test. */
  const wallet = (account: Address): WalletClient =>
    createWalletClient({ account, chain: atro.chain, transport: http(rpcUrl) });
  const mailer = captureMailer();
  const log = memoryLog();
  let db: TestDb;
  let d: Deps;
  let vault: Address;
  /** Right after creation. */
  let s0: VaultStatus;
  /** Right after the keeper raised the alarm. */
  let s1: VaultStatus;

  /** The devnet warp (evm_increaseTime + evm_mine) to at least `target`; returns the new block's time. */
  async function warpTo(target: bigint): Promise<bigint> {
    const now = (await atro.publicClient.getBlock()).timestamp;
    if (target > now) await increaseTime(rpcUrl, Number(target - now));
    return (await atro.publicClient.getBlock()).timestamp;
  }

  async function tick(): Promise<TickResult> {
    const r = await runTick(d);
    expect(r.errors).toEqual([]);
    expect(r.status).toBe('ok');
    return r;
  }

  const kindOf = (m: Mail) => m.tags.find((t) => t.name === 'kind')?.value;
  /** `<to>:<kind>` of every email captured from index `from` on. */
  const sentSince = (from: number) => mailer.sent.slice(from).map((m) => `${m.to}:${kindOf(m)}`);
  const lastTo = (to: string): Mail => {
    const m = mailer.sent.filter((x) => x.to === to).at(-1);
    if (!m) throw new Error(`no email to ${to}`);
    return m;
  };
  const keeperLog = () =>
    db.query<{ action: string | null; status: string; tx_hash: string | null }>(
      'select action, status, tx_hash from public.keeper_log order by id',
    );
  const heirBalance = () =>
    atro.publicClient.readContract({ address: usdt0, abi: erc20Abi, functionName: 'balanceOf', args: [HEIR] });

  beforeAll(async () => {
    db = await testDb();
    d = {
      sql: db,
      chain: createSdkChain(atro, { wallet: wallet(KEEPER) }),
      mailer,
      clock: systemClock,
      log,
      config: testConfig({ headMargin: 0 }),
      random: (size) => crypto.getRandomValues(new Uint8Array(size)),
      keeperError: null,
    };
  });

  afterAll(async () => {
    await db.close();
  });

  it('indexes a new Drill and subscribes its owner and heir through the double opt-in', async () => {
    const drill: PlanInput = {
      heirs: [{ account: HEIR }],
      timing: 'drill',
      assets: [{ kind: 'erc20', token: usdt0 }],
    };
    const plan = await atro.prepare.createVault(drill, { owner: OWNER, drill: true });
    await atro.send(plan, wallet(OWNER));
    vault = plan.vault;
    s0 = await atro.vault(vault).status();
    expect(s0.lateAt - s0.lastAlive).toBe(120n);

    const first = await tick();
    expect(first.indexer).toMatchObject({ created: 1, caughtUp: true, error: null });
    expect(await getVault(db, vault)).toMatchObject({
      drill: true,
      state: 'active',
      lastAlive: s0.lastAlive,
      lateAt: s0.lateAt,
      nextCheckAt: s0.lateAt,
    });

    const signUp = async (body: Record<string, string>) => {
      const res = await subscribe(postJson('subscribe', { ...body, vault, website: '' }), d);
      expect(res.status).toBe(202);
    };
    await signUp({ email: ' Owner@Example.com ', role: 'owner', lang: 'en' });
    await signUp({ email: HEIR_EMAIL, role: 'heir', lang: 'vi' });
    expect(sentSince(0)).toEqual([`${OWNER_EMAIL}:confirm`, `${HEIR_EMAIL}:confirm`]);

    for (const m of mailer.byKind('confirm')) {
      const res = await confirm(postJson('confirm', { token: tokenFrom(m, 'confirm') }), d);
      expect(await bodyOf(res)).toMatchObject({ ok: true, vault });
    }
    expect(sentSince(2)).toEqual([`${OWNER_EMAIL}:welcome`, `${HEIR_EMAIL}:welcome`]);
    const subs = await activeSubscribers(db, vault);
    expect(subs.map((s) => `${s.email}:${s.role}:${s.lang}`).sort()).toEqual([
      `${HEIR_EMAIL}:heir:vi`,
      `${OWNER_EMAIL}:owner:en`,
    ]);
  });

  it('sends nothing before half the period, then the 50% reminder exactly once', async () => {
    let from = mailer.sent.length;
    await tick();
    expect(sentSince(from)).toEqual([]);

    const at = await warpTo(s0.lastAlive + 61n);
    expect(at - s0.lastAlive).toBeLessThan(96n);
    await tick();
    expect(sentSince(from)).toEqual([`${OWNER_EMAIL}:checkin-50`]);
    expect(lastTo(OWNER_EMAIL).text).toContain(formatDeadline(s0.lateAt, 'en'));

    from = mailer.sent.length;
    await tick();
    expect(sentSince(from)).toEqual([]);
  });

  it('sends the 80% reminder while the keeper still waits for lateAt', async () => {
    const from = mailer.sent.length;
    const at = await warpTo(s0.lastAlive + 97n);
    expect(at).toBeLessThan(s0.lateAt);
    const r = await tick();
    expect(sentSince(from)).toEqual([`${OWNER_EMAIL}:checkin-80`]);
    expect(r.keeper).toMatchObject({ ran: true, dryRun: false, due: 0, sent: 0, stopped: null });
    expect(await keeperLog()).toEqual([]);
  });

  it('at lateAt mails checkin-due, and the keeper raises the alarm with poke', async () => {
    const from = mailer.sent.length;
    await warpTo(s0.lateAt + 1n);
    const r = await tick();
    expect(sentSince(from)).toEqual([`${OWNER_EMAIL}:checkin-due`]);
    expect(r.keeper).toMatchObject({ due: 1, sent: 1 });

    const rows = await keeperLog();
    expect(rows).toMatchObject([{ action: 'poke', status: 'sent' }]);
    const receipt = await atro.publicClient.getTransactionReceipt({ hash: rows[0].tx_hash as Hex });
    expect(receipt.from.toLowerCase()).toBe(KEEPER.toLowerCase());
    const block = await atro.publicClient.getBlock({ blockNumber: receipt.blockNumber });
    expect(block.timestamp >= s0.lateAt).toBe(true);

    s1 = await atro.vault(vault).status();
    expect(s1.state).toBe('grace');
    expect(s1.windowEndsAt).not.toBeNull();
  });

  it('mails the alarm to the owner in English and to the heir in Vietnamese on the next tick', async () => {
    const from = mailer.sent.length;
    const windowEndsAt = s1.windowEndsAt as bigint;
    const r = await tick();
    expect(r.indexer?.events).toBe(2); // AlarmRaised and StateChanged of the poke
    expect(r.keeper?.sent).toBe(0);
    expect(sentSince(from)).toEqual([`${OWNER_EMAIL}:alarm-owner`, `${HEIR_EMAIL}:alarm-heir`]);
    expect(lastTo(OWNER_EMAIL).text).toContain(formatDeadline(windowEndsAt, 'en'));
    expect(lastTo(HEIR_EMAIL).text).toContain(formatDeadline(windowEndsAt, 'vi'));
    expect(await getVault(db, vault)).toMatchObject({ state: 'grace', windowEndsAt });
  });

  it('distributes when the window ends, then mails released and distributed to the heir', async () => {
    const before = await heirBalance();
    let from = mailer.sent.length;
    await warpTo((s1.windowEndsAt as bigint) + 1n);
    const r = await tick();
    expect(sentSince(from)).toEqual([]);
    expect(r.keeper).toMatchObject({ sent: 1 });
    expect((await keeperLog()).map((l) => `${l.action}:${l.status}`)).toEqual(['poke:sent', 'distribute:sent']);
    expect((await heirBalance()) - before).toBe(10_000_000_000n);
    expect((await atro.vault(vault).status()).state).toBe('releasedInherit');

    from = mailer.sent.length;
    await tick();
    expect(sentSince(from)).toEqual([`${HEIR_EMAIL}:released`, `${HEIR_EMAIL}:distributed`]);
    expect(lastTo(HEIR_EMAIL).text).toContain(`10000 token ${usdt0} cho ${HEIR}`);

    from = mailer.sent.length;
    const quiet = await tick();
    expect(sentSince(from)).toEqual([]);
    expect(quiet.keeper?.sent).toBe(0);
  });

  it('sends the Drill summary to the owner once the Drill has expired, and only once', async () => {
    const from = mailer.sent.length;
    await warpTo((s0.expiresAt as bigint) + 1n);
    await tick();
    expect(sentSince(from)).toEqual([`${OWNER_EMAIL}:drill-summary`]);
    const summary = lastTo(OWNER_EMAIL).text;
    expect(summary).toContain('Check-ins: 0');
    expect(summary).toContain('Alarms: 1');

    const again = mailer.sent.length;
    await tick();
    expect(sentSince(again)).toEqual([]);
  });

  it('linked only to the site, carried one-click unsubscribe, and logged no error', async () => {
    expect(sentSince(0)).toEqual([
      `${OWNER_EMAIL}:confirm`,
      `${HEIR_EMAIL}:confirm`,
      `${OWNER_EMAIL}:welcome`,
      `${HEIR_EMAIL}:welcome`,
      `${OWNER_EMAIL}:checkin-50`,
      `${OWNER_EMAIL}:checkin-80`,
      `${OWNER_EMAIL}:checkin-due`,
      `${OWNER_EMAIL}:alarm-owner`,
      `${HEIR_EMAIL}:alarm-heir`,
      `${HEIR_EMAIL}:released`,
      `${HEIR_EMAIL}:distributed`,
      `${OWNER_EMAIL}:drill-summary`,
    ]);
    for (const m of mailer.sent) {
      const links = [
        ...[...m.html.matchAll(/href="([^"]+)"/g)].map((x) => x[1]),
        ...[...m.text.matchAll(/https?:\/\/\S+/g)].map((x) => x[0]),
      ];
      expect(links.length, kindOf(m)).toBeGreaterThan(0);
      for (const l of links) expect(l.startsWith(`${SITE}/`), `${kindOf(m)}: ${l}`).toBe(true);
      expect(m.headers['List-Unsubscribe'].startsWith(`<${API}/unsubscribe?t=`), kindOf(m)).toBe(true);
      expect(m.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    }

    // What a mail client does with the header (RFC 8058): a POST without Origin, form-encoded.
    const token = /\?t=([A-Za-z0-9_-]{43})>$/.exec(lastTo(HEIR_EMAIL).headers['List-Unsubscribe'])?.[1];
    expect(token).toBeDefined();
    const res = await unsubscribe(
      new Request(`${API}/unsubscribe?t=${token}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }),
      d,
    );
    expect(res.status).toBe(200);
    expect((await activeSubscribers(db, vault)).map((s) => s.email)).toEqual([OWNER_EMAIL]);

    expect(log.lines.filter((l) => l.level === 'error')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the e2e**

Prerequisites, once: Foundry v1.9.0 on `PATH` (`anvil --version`), `cd contracts && forge build && cd ..`, `npm run build` (circuits and the SDK `dist`).

Run: `npm run test:e2e -w apps/backend`
Expected: PASS, 8 tests, in about one to two minutes (most of it is `forge script` deploying DeployLocal).

If a test fails, read the first failing assertion:
- `r.errors` not empty: the message names the phase (`indexer: …`, `notices: …`, `keeper: …`). Reproduce it in that phase's unit test (Tasks 7, 8, 9) with the fake chain, then fix it.
- A missing reminder: print `await reminderRows(db, (await atro.publicClient.getBlock()).timestamp)` from `src/store/notices.ts` and compare `periodKey` and `sent` with Task 8's rules.
- A warp assertion such as `at - s0.lastAlive < 96`: the machine spent more than 20 s between two blocks. Re-run it once. If it fails again, profile `runTick`; do not widen the window.

- [ ] **Step 4: Confirm the unit suite does not pick up the e2e**

Run: `npm test -w apps/backend`
Expected: PASS, the unit tests only (`vitest.config.ts` includes `test/unit/**`). No anvil is started.

- [ ] **Step 5: Typecheck and lint**

```bash
npx biome check --write apps/backend
npm run typecheck
npx biome ci .
```

Expected: no errors. `tsconfig.json` already includes `test` and `*.config.ts`, so the e2e and its config are typechecked.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/vitest.e2e.config.ts apps/backend/test/e2e/global-setup.ts apps/backend/test/e2e/drill.test.ts
git commit -m "test(backend): a whole Drill on anvil driven only by tick: reminders, alarm, poke, distribute, summary" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 13: Maintainer README, AGENTS.md, the CI job and the superseded Plan 5

**Files:**
- Create: `apps/backend/README.md`
- Modify: `AGENTS.md` (the table at lines 9 to 20, the Build and Test blocks at lines 35 to 54, a new section before `## Rules`, the rules at lines 88 to 92)
- Modify: `.github/workflows/ci.yml` (a new `backend` job at the end of `jobs:`)
- Modify: `docs/superpowers/plans/2026-11-18-atropyle-worker.md` (a note above its first line)
- Test: `apps/backend/test/unit/docs.test.ts`

**Interfaces:**
- Consumes: `FUNCTIONS` (Task 11); the secret names read by `src/config.ts` (Task 2), `src/entry/runtime.ts` (Task 11) and `src/keeper/signer.ts` (Task 5); the scripts `test`, `test:e2e`, `emails:check` and `build` of `apps/backend/package.json` (Task 1).
- Produces: the maintainer's deploy runbook, the zero-key rule with its one named exception, and a keyless CI job. Nothing later depends on it.

- [ ] **Step 1: Write the failing docs test**

`apps/backend/test/unit/docs.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FUNCTIONS } from '../../scripts/build-functions';

const BACKEND = fileURLToPath(new URL('../../', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const read = (...parts: string[]) => readFileSync(join(...parts), 'utf8');

/** Every secret the backend reads: get('X') in config.ts, env('X') in the runtime and in the keeper signer. */
function secretNames(): string[] {
  const names = new Set<string>();
  for (const file of ['src/config.ts', 'src/entry/runtime.ts', 'src/keeper/signer.ts']) {
    for (const m of read(BACKEND, file).matchAll(/\b(?:get|env)\('([A-Z][A-Z0-9_]+)'\)/g)) names.add(m[1]);
  }
  return [...names].sort();
}

describe('maintainer docs and CI (spec §10, §15)', () => {
  it('documents every secret the backend reads', () => {
    const names = secretNames();
    expect(names).toEqual(
      expect.arrayContaining([
        'CRON_SECRET',
        'KEEPER_KEY',
        'MAIL_FROM',
        'OPS_EMAIL',
        'RESEND_API_KEY',
        'SITE_URL',
        'SUPABASE_DB_URL',
        'TOKEN_SECRET',
      ]),
    );
    const readme = read(BACKEND, 'README.md');
    for (const n of names) expect(readme, n).toContain(`\`${n}\``);
  });

  it('lists the eight functions and the pinned deploy commands', () => {
    const readme = read(BACKEND, 'README.md');
    for (const f of FUNCTIONS) expect(readme, f).toContain(`\`${f}\``);
    expect(readme).toContain('npx -y supabase@3.2.0 db push');
    expect(readme).toContain('npx -y supabase@3.2.0 functions deploy --use-api');
  });

  it('names the single key exception and the backend commands in AGENTS.md', () => {
    const agents = read(ROOT, 'AGENTS.md');
    expect(agents).toContain('`apps/backend/src/keeper/signer.ts`');
    expect(agents).toContain('| `apps/backend/`');
    expect(agents).toContain('npm run test:e2e -w apps/backend');
    expect(agents).toContain('No CI workflow signs a transaction or deploys the backend');
  });

  it('keeps every CI workflow free of Supabase deploys and backend secrets', () => {
    const dir = join(ROOT, '.github/workflows');
    const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = read(dir, f);
      expect(text, f).not.toMatch(/supabase(@[\d.]+)?\s+(db push|functions deploy|secrets set|link)/);
      expect(text, f).not.toMatch(
        /KEEPER_KEY|RESEND_API_KEY|CRON_SECRET|TOKEN_SECRET|SUPABASE_ACCESS_TOKEN|SUPABASE_DB_URL/,
      );
    }
    expect(read(dir, 'ci.yml')).toContain('npm run test:e2e -w apps/backend');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/unit/docs.test.ts` (from `apps/backend`)
Expected: FAIL, 4 tests. `README.md` does not exist (ENOENT), and `AGENTS.md` and `ci.yml` lack the backend.

- [ ] **Step 3: Write the README**

`apps/backend/README.md`:

````markdown
# @atropyle/backend

The Atropyle backend on Supabase (spec 2026-11-22 §9). It has three parts:

- eight Edge Functions, with the Postgres schema and the schedule in [`supabase/`](../../supabase);
- bilingual email (EN and VI) sent through Resend;
- the keeper, which pokes and distributes vaults on X Layer when their time comes.

This workspace is private and never published. The chain stays the source of truth: the backend only indexes it, sends reminders and pays gas for permissionless calls.

## What runs where

| Function      | Called by                         | Does                                                                         |
| ------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| `subscribe`   | the web app (POST)                | Checks the vault, rate-limits, stores a pending sign-up, sends `confirm`      |
| `confirm`     | the web app (POST)                | Activates the sign-up and sends `welcome`                                     |
| `unsubscribe` | the web app, or a mail client         | Deletes the sign-up (also the RFC 8058 one-click POST)                         |
| `me`          | the web app (GET)                 | Vaults of an address by role, from the index                                  |
| `stats`       | the web app (GET)                 | Home page numbers, cached 60 s                                                |
| `health`      | anyone (GET)                      | Index lag, the latest integrity run, the keeper's balance and mode            |
| `tick`        | `pg_cron` every minute            | Indexes new blocks, sends due emails, runs the keeper (50 s budget)           |
| `integrity`   | `pg_cron` every 10 minutes        | The SDK's `integrity()` check; mails `OPS_EMAIL` when it fails                |

`tick` and `integrity` refuse any call without the `x-cron-secret` header. The request and response shapes are the contract in spec §9.6.

## Develop

Prerequisites: Node.js 24, `npm ci` and `npm run build` at the repository root (circuits and the SDK). The e2e also needs Foundry 1.9.0 (`anvil`) and `cd contracts && forge build`.

```bash
npm test -w apps/backend                # unit tests: PGlite, a fake chain, captured email
npm run test:e2e -w apps/backend        # a whole Drill on a local anvil, driven only by tick
npm run emails -w apps/backend          # re-render src/email/templates.gen.ts after changing copy or design
npm run emails:check -w apps/backend    # fails when templates.gen.ts is stale (CI runs it)
npm run emails:preview -w apps/backend  # writes .preview/<kind>.<lang>.html to look at every email
npm run build -w apps/backend           # bundles supabase/functions/<name>/index.js (gitignored)
```

After changing the copy or the design, regenerate the templates and the email snapshots, then commit both:

```bash
npm run emails -w apps/backend
cd apps/backend && npx vitest run -u test/unit/compose.test.ts && cd ../..
```

No test uses a private key, a Resend key or a Supabase project. On anvil, the keeper sends from an unlocked account.

## Deploy (maintainer only)

Agents and CI never run these steps: they need your Supabase login, your Resend key and the keeper's key. The commands pin Supabase CLI 3.2.0. `DO_NOT_TRACK=1` turns off the CLI's own usage events (in PowerShell: `$env:DO_NOT_TRACK = '1'`).

### 1. Supabase project

1. Create a project in the region **Southeast Asia (Singapore)**. Keep the database password in your password manager.
2. Database → Extensions: enable **`pg_cron`** and **`pg_net`**. The schedule migration also runs `create extension if not exists` for both.

### 2. Resend

1. Add your sending domain. Add the DNS records Resend shows (SPF and DKIM), plus a DMARC record such as `v=DMARC1; p=none; rua=mailto:<your ops address>`. Wait until Resend shows the domain as verified.
2. Create an API key with **Sending access** for that domain only.

### 3. Keeper wallet

Create a new wallet that the keeper uses for nothing but gas, and fund it with about **0.02 OKB** on X Layer. The keeper stops below 0.005 OKB and mails `OPS_EMAIL`.

Its key goes only into the `KEEPER_KEY` secret (step 4); nobody else ever sees it, Claude included. `poke` and `distribute` are permissionless and pay only heirs or the recovery wallet. A leaked keeper key can therefore spend the keeper's gas, never a vault's assets.

### 4. Function secrets

| Secret                        | Value                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `SITE_URL`                    | The web app, for example `https://atropyle.xyz`. Every email link starts with it          |
| `MAIL_FROM`                   | `Atropyle <alerts@your-domain>` on the domain verified in Resend                          |
| `RESEND_API_KEY`              | The key from step 2. Without it, emails wait unsent                                       |
| `CRON_SECRET`                 | 64 random hex characters (command below); the same value goes into the Vault in step 6    |
| `TOKEN_SECRET`                | 64 random hex characters; signs unsubscribe links and hashes rate-limit keys             |
| `OPS_EMAIL`                   | Where alerts about the keeper and integrity go                                            |
| `KEEPER_KEY`                  | The keeper wallet's private key. Without it the keeper runs dry (it simulates, never sends) |
| `RPC_URLS` (optional)         | Comma-separated X Layer RPC URLs; default: the URLs of the SDK's X Layer deployment       |
| `ALLOWED_ORIGINS` (optional)  | Extra origins allowed to POST, such as a Vercel preview URL                               |
| `HEAD_MARGIN` (optional)      | Blocks the indexer stays behind the head; default 3                                       |
| `API_URL` (optional)          | Default: `SUPABASE_URL` + `/functions/v1`                                                 |

Supabase sets `SUPABASE_URL` and `SUPABASE_DB_URL` itself. Generate each random secret with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put everything except `KEEPER_KEY` in a file **outside the repository**, for example `~/atropyle-backend.env`, one `NAME=value` per line. Then:

```bash
export DO_NOT_TRACK=1
npx -y supabase@3.2.0 login
npx -y supabase@3.2.0 link --project-ref <project-ref>
npx -y supabase@3.2.0 secrets set --env-file ~/atropyle-backend.env
```

Delete the file afterwards, or keep it only in your password manager. Type `KEEPER_KEY` straight into the dashboard's Edge Function secrets page, so the key never lands in a file or in your shell history. Functions read changed secrets without a redeploy.

### 5. Functions

```bash
npm ci
npm run build
npm run build -w apps/backend
npx -y supabase@3.2.0 functions deploy --use-api
```

This deploys the eight functions declared in `supabase/config.toml`. Each comes from its pre-built `supabase/functions/<name>/index.js` and is bundled on Supabase's side, so no Docker is needed. JWT verification is off: the public endpoints take no Supabase session, and the two cron endpoints check `x-cron-secret`.

### 6. Vault secrets for the schedule

In the SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'atropyle_functions_url');
select vault.create_secret('<the CRON_SECRET value>', 'atropyle_cron_secret');
```

### 7. Schema and schedule

```bash
npx -y supabase@3.2.0 db push
```

This applies `supabase/migrations/` in order:

- the schema, with RLS on and no policy, so nothing is exposed through the REST API;
- the schedule: `tick` every minute, `integrity` every 10 minutes, and the cleanup at 03:17 UTC every day.

The first `tick` runs within a minute.

The schedule migration starts with `-- atropyle:supabase-only`. The PGlite tests skip it because `pg_cron`, `pg_net` and Vault exist only on Supabase.

### 8. Check

```bash
curl -s https://<project-ref>.supabase.co/functions/v1/health
```

After a few minutes, expect:

- `indexer.lagBlocks` in single digits and `indexer.updatedAt` recent;
- `keeper.dryRun: false` and `keeper.balanceWei` matching the keeper wallet;
- `integrity.ok: true` after the first ten minutes.

In the SQL editor:

```sql
select jobname, status, return_message, start_time from cron.job_run_details order by start_time desc limit 10;
select id, status_code, error_msg, created from net._http_response order by created desc limit 10;
```

Then create a Drill from the web app, subscribe as its owner and confirm. Within a few minutes a check-in reminder arrives, then the alarm once the keeper has poked. `tick` runs once a minute, so with the Drill's two-minute period it may send only the highest reminder due.

## Operate

- **Pause everything:** `select cron.unschedule('atropyle-tick'); select cron.unschedule('atropyle-integrity');`. Resume by re-running the two `cron.schedule` lines of `supabase/migrations/20261123000100_schedule.sql`.
- **Stop only the keeper:** `npx -y supabase@3.2.0 secrets unset KEEPER_KEY`. The keeper then runs dry; indexing and email go on.
- **Rotate `CRON_SECRET`:** set the new function secret, then run `select vault.update_secret((select id from vault.secrets where name = 'atropyle_cron_secret'), '<new value>');` within the same minute.
- **Ops emails** (`[Atropyle ops] <alert>: firing` and later `resolved`) are sent for:
  - `keeper-balance`: the keeper is below 0.005 OKB, so top it up;
  - `keeper-key`: `KEEPER_KEY` is set but unusable;
  - `integrity`: a deployment check failed. Read `integrity_runs.report`.
- **Budget:** about 48,000 cron invocations a month: one `tick` a minute and one `integrity` every ten minutes.
- **Privacy** (spec §9.5):
  - The only personal data is the email address.
  - Tokens are stored as hashes, and rate-limit keys are HMACs, never IPs or addresses.
  - The daily cleanup deletes pending sign-ups after 48 h and rate-limit rows after 24 h.
  - Unsubscribing deletes the row.
````

- [ ] **Step 4: Update AGENTS.md**

In the table, insert two rows after the `deployments/` row (line 20). They keep the table's column widths:

```markdown
| `apps/backend/`                                     | `@atropyle/backend` (private): Supabase Edge Functions, email templates (React Email, EN and VI) and the keeper      |
| `supabase/`                                         | Postgres migrations, the `pg_cron` schedule and the CLI config of the eight Edge Functions                           |
```

In the Build block (lines 35 to 41), add one line after `npm run build -w apps/web`:

```bash
npm run build -w apps/backend
```

In the Test block (lines 45 to 54), add one line after `npm test -w apps/web`. `npm test` already runs the backend's unit tests through the workspaces.

```bash
npm run test:e2e -w apps/backend
```

Insert a new section right before `## Rules`:

````markdown
## Backend

`apps/backend` holds the Supabase Edge Functions, the email templates and the keeper. `supabase/` holds the migrations and `config.toml`.

- The unit tests run on PGlite with a fake chain and a capturing mailer.
- The e2e starts its own anvil, so it needs `forge build` and the built SDK.
- `npm run build -w apps/backend` writes one bundle per function to `supabase/functions/<name>/index.js`, which is gitignored.

After changing the email copy or design, regenerate the templates and the snapshots, and commit both:

```bash
npm run emails -w apps/backend
cd apps/backend && npx vitest run -u test/unit/compose.test.ts && cd ../..
```

Deploying is the maintainer's job (`apps/backend/README.md`). Agents never run `supabase db push`, `supabase functions deploy` or `supabase secrets set`.

````

Replace the rule at line 88:

```markdown
- Zero keys. Never ask for, read or store a private key or seed phrase. There is no `PRIVATE_KEY` variable in this repository, and no code path takes a key. The CLI, the MCP server and the skills prepare transactions; the user signs them in their own wallet.
```

with:

```markdown
- Zero keys. Never ask for, read or store a private key or seed phrase. There is no `PRIVATE_KEY` variable in this repository. The CLI, the MCP server and the skills prepare transactions; the user signs them in their own wallet. **One exception, and only one:** the deployed backend keeper. `apps/backend/src/keeper/signer.ts` is the only file that reads `KEEPER_KEY`, a Supabase secret that only the maintainer sets, and it signs `poke` and `distribute` with it. Those calls are permissionless and pay only heirs or the recovery wallet. A unit test (`apps/backend/test/unit/zero-key.test.ts`) fails if any other file reads the key or builds an account. Tests never use a key.
```

Replace the rule at line 89:

```markdown
- Never broadcast to X Layer mainnet: no `cast send` with a key, no `eth_sendRawTransaction`. On anvil, send only from unlocked accounts (`eth_sendTransaction`, `cast send --unlocked`).
```

with:

```markdown
- Never broadcast to X Layer mainnet from anything an agent runs: no `cast send` with a key, no `eth_sendRawTransaction`. On anvil, send only from unlocked accounts (`eth_sendTransaction`, `cast send --unlocked`). The only code that broadcasts to X Layer is the keeper deployed in the maintainer's Supabase project. It never runs on an agent's machine or in CI.
```

Replace the rule at line 91:

```markdown
- No CI workflow signs a transaction.
```

with:

```markdown
- No CI workflow signs a transaction or deploys the backend. A unit test (`apps/backend/test/unit/docs.test.ts`) fails if a workflow runs a Supabase deploy command or names a backend secret.
```

Replace the rule at line 92:

```markdown
- Tokens and keys for npm, Cloudflare, Telegram, `KEEPER_KEY` and the DeWEB operator belong to the maintainer. Do not set them and do not ask for them.
```

with:

```markdown
- Tokens and keys for npm, Cloudflare, Telegram, Supabase, Resend (`RESEND_API_KEY`), `CRON_SECRET`, `TOKEN_SECRET`, `KEEPER_KEY` and the DeWEB operator belong to the maintainer. Do not set them and do not ask for them.
```

Leave the `apps/web/` row alone. Plan 7 rewrites it when the web app moves to Next.js.

- [ ] **Step 5: Add the CI job**

At the end of `.github/workflows/ci.yml`, after the `web` job's last step, add the job below. Indent it two spaces under `jobs:`, like the other jobs.

```yaml
  # Read-only and keyless: unit tests on PGlite with a fake chain and captured email, the function bundles, then a
  # whole Drill on a local anvil with an unlocked keeper account. No step deploys to Supabase, sends an email or
  # reaches X Layer.
  backend:
    runs-on: ubuntu-latest
    timeout-minutes: 30
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
        run: npm run typecheck -w apps/backend && npm test -w apps/backend
      - name: Email templates are up to date
        run: npm run emails:check -w apps/backend
      - name: Function bundles build under the size cap
        run: npm run build -w apps/backend
      - name: E2E on a local anvil, a whole Drill driven by tick
        run: npm run test:e2e -w apps/backend
```

- [ ] **Step 6: Mark Plan 5 as superseded**

Insert these two lines above the first line (`# Atropyle Plan 5 — Worker: …`) of `docs/superpowers/plans/2026-11-18-atropyle-worker.md`:

```markdown
> **Superseded** by [`2026-11-22-atropyle-backend.md`](2026-11-22-atropyle-backend.md) (Plan 8: Supabase, Resend and the keeper), per spec 2026-11-22 §14 and ruling 13. Do not execute this plan.

```

- [ ] **Step 7: Run the docs test to verify it passes**

Run: `npx vitest run test/unit/docs.test.ts` (from `apps/backend`)
Expected: PASS, 4 tests.

- [ ] **Step 8: Run the whole backend gate**

```bash
npm test -w apps/backend
npm run emails:check -w apps/backend
npm run build -w apps/backend
npm run test:e2e -w apps/backend
npm run typecheck
npx biome ci .
```

Expected: every command passes. The unit suite counts 6 (schema) + 4 (postgres) + 19 + 11 + 122 + 89 + 14 + 18 + 9 + 17 + 12 + 5 + 12 + 4 = 342 tests, and the e2e counts 8. If the root `npm test` is run too, the other workspaces must stay green as well.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/README.md apps/backend/test/unit/docs.test.ts AGENTS.md .github/workflows/ci.yml \
  docs/superpowers/plans/2026-11-18-atropyle-worker.md
git commit -m "docs(backend): maintainer runbook, the keeper as the one key exception, a keyless CI job" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
## Spec coverage

| Spec                                                              | Task                       |
| ----------------------------------------------------------------- | -------------------------- |
| §9.1 tables, RLS without policies, 48 h pending cleanup           | 1                          |
| §9.2 Web API handlers, esbuild bundles, CORS, problem+json        | 2, 11 (ruling 1: `index.js`) |
| §9.2 `subscribe`, `confirm`, `unsubscribe` (rate limits, honeypot) | 6                          |
| §9.2 `me`, `stats`, `health`                                      | 10                         |
| §9.2 `tick`, `integrity` with `x-cron-secret`                     | 9                          |
| §9.3.1 indexer: 100-block ranges, 2,000 blocks a run, dedupe      | 7 (ruling 6: default read transport) |
| §9.3.2 reminders 50/80/100%, alarm, recovery vote, release, payout, Drill summary | 8           |
| §9.3.3 keeper: due vaults, 20 tx, gas cap, 0.005 OKB, dry run, `keeper_log` | 5, 9             |
| §9.3.4 50 s budget, clean stop, cursor saved                      | 7, 9                       |
| §9.3 schedule: `pg_cron` + `pg_net`, secrets in Vault             | 1 (Supabase-only migration) |
| §9.4 twelve templates EN and VI, render at build, one button, "never sign by email" | 3, 4      |
| §9.4 tests: snapshots, links only to the site, unsubscribe headers | 4, 12                     |
| §9.5 email the only personal data, HMAC'd IPs kept 24 h, deletion | 1, 6                       |
| §9.6 API contract                                                 | 6, 9, 10 (shapes copied verbatim) |
| §10 Supabase deploy by the maintainer                             | 13 (ruling 11: no CI deploy) |
| §11 Backend and Email rows                                        | 1 to 12                    |
| §12 Backend tests: pure logic, PGlite, Request handlers, anvil e2e with the devnet warp | 1 to 12 |
| §15 the maintainer's Supabase, Resend and keeper wallet steps     | 13                         |
| Brief: AGENTS.md exception, table and commands; Plan 5 superseded | 13                         |

## Open risks

- **The 2 s CPU limit per request.** `tick` evaluates the policy engine and the timeline for every vault an indexer step touches, and once per keeper candidate. Each evaluation is milliseconds on the model engine, but a step that touches hundreds of vaults could exceed the limit. Mitigation in place: one transaction per 500-block step, the cursor saved after each step, and a lease, so an aborted run resumes cleanly. If the function logs show runs stopped for CPU time, lower `stepBlocks` in `TICK_DEFAULTS` (`src/config.ts`).
- **The postgres.js adapter only runs for real after the first deploy.** Unit tests cover it with a fake client, and PGlite covers the SQL. A difference in how the pooler returns types would show up only on Supabase. The queries cast every parameter and every bigint, which narrows that gap.
- **`pg_net` timeout.** The schedule allows 55 s per call. If Supabase's gateway closes the request earlier, the function still finishes its run (the work does not depend on the response). `net._http_response` would show a timeout, but the cursor and `/health` stay correct.
- **Merge order with Plan 7.** Both plans edit `AGENTS.md`, `.github/workflows/ci.yml` and `biome.json`. Whichever merges second rebases its edits onto the other's. The two never touch the same lines, except the `apps/web/` row of the AGENTS.md table, which this plan leaves alone.
- **Resend domain verification and deliverability** depend on the maintainer's DNS (spec §15, §17). Until the domain is verified, `deliver()` fails, the deliveries stay unsent and retry every tick, and `/health` shows nothing wrong. Watch the function logs for `email not sent`.
- **The first deploy on mainnet indexes from the factory block.** Ruling 9 caps event emails at 24 h of chain age, and reminders wait until the index has caught up, so the backlog is never mailed. The catch-up itself takes several minutes: 2,000 blocks a minute.
- **React 19 escaping inside `<style>`.** The CSS and font stacks in the templates are free of quotes and angle brackets on purpose (Task 3). A future edit that adds them breaks the rendered CSS, and the snapshot diff is the only signal.
- **anvil time drift in the e2e.** A warp lands later than its target by the seconds since the previous block. The targets leave 20 to 35 s of slack and assert where they landed. A very slow CI runner could still fail the 80% step; re-run once before investigating.
