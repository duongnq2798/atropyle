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
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
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
