# @atropyle/backend

The Atropyle backend on Supabase (spec 2026-11-22 §9). It has three parts:

- eight Edge Functions, with the Postgres schema and the schedule in [`supabase/`](../../supabase);
- bilingual email (EN and VI) sent through Resend;
- the keeper, which pokes and distributes vaults on X Layer when their time comes.

This workspace is private and never published. The chain stays the source of truth: the backend only indexes it, sends reminders and pays gas for permissionless calls.

## What runs where

| Function      | Called by                     | Does                                                                     |
| ------------- | ----------------------------- | ------------------------------------------------------------------------ |
| `subscribe`   | the web app (POST)            | Checks the vault, rate-limits, stores a pending sign-up, sends `confirm` |
| `confirm`     | the web app (POST)            | Activates the sign-up and sends `welcome`                                |
| `unsubscribe` | the web app, or a mail client | Deletes the sign-up (also the RFC 8058 one-click POST)                   |
| `me`          | the web app (GET)             | Vaults of an address by role, from the index                             |
| `stats`       | the web app (GET)             | Home page numbers, cached 60 s                                           |
| `health`      | anyone (GET)                  | Index lag, the latest integrity run, the keeper's balance and mode       |
| `tick`        | `pg_cron` every minute        | Indexes new blocks, sends due emails, runs the keeper (50 s budget)      |
| `integrity`   | `pg_cron` every 10 minutes    | The SDK's `integrity()` check; mails `OPS_EMAIL` when it fails           |

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

| Secret                       | Value                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `SITE_URL`                   | The web app, for example `https://atropyle.xyz`. Every email link starts with it            |
| `MAIL_FROM`                  | `Atropyle <alerts@your-domain>` on the domain verified in Resend                            |
| `RESEND_API_KEY`             | The key from step 2. Without it, emails wait unsent                                         |
| `CRON_SECRET`                | 64 random hex characters (command below); the same value goes into the Vault in step 6      |
| `TOKEN_SECRET`               | 64 random hex characters; signs unsubscribe links and hashes rate-limit keys                |
| `OPS_EMAIL`                  | Where alerts about the keeper and integrity go                                              |
| `KEEPER_KEY`                 | The keeper wallet's private key. Without it the keeper runs dry (it simulates, never sends) |
| `RPC_URLS` (optional)        | Comma-separated X Layer RPC URLs; default: the URLs of the SDK's X Layer deployment         |
| `ALLOWED_ORIGINS` (optional) | Extra origins allowed to POST, such as a Vercel preview URL                                 |
| `HEAD_MARGIN` (optional)     | Blocks the indexer stays behind the head; default 3                                         |
| `API_URL` (optional)         | Default: `SUPABASE_URL` + `/functions/v1`                                                   |

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
