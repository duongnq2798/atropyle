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
