-- Rows written before the fix in apps/backend/src/db/postgres.ts hold a JSON string where the object belongs:
-- postgres.js JSON-encoded the JSON text it was given for $n::jsonb a second time. Unwrap them. No column of this
-- schema stores a JSON string on purpose, so every string value in these columns is such a row. Safe to run again.
update public.meta set value = (value #>> '{}')::jsonb where jsonb_typeof(value) = 'string';
update public.vault_events set args = (args #>> '{}')::jsonb where jsonb_typeof(args) = 'string';
update public.vaults set assets = (assets #>> '{}')::jsonb where jsonb_typeof(assets) = 'string';
update public.integrity_runs set report = (report #>> '{}')::jsonb where jsonb_typeof(report) = 'string';

-- saveView links last_alive_block through args ->> 'at', which read null on those rows. Link it again.
update public.vaults v set last_alive_block = (
    select e.block from public.vault_events e
     where e.vault = v.address and e.name = 'Alive' and e.args ->> 'at' = v.last_alive::text
     order by e.block desc limit 1)
 where v.last_alive_block is null;
