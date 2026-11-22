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
