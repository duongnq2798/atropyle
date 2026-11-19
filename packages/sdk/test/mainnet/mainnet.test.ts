import { type Address, http } from 'viem';
import { describe, expect, it } from 'vitest';
import { createAtropyle } from '../../src/index';

// Read only. XLAYER_FORK_RPC (same name as Plan 1's fork tests) gates the suite and serves plain reads;
// verification always uses the two independent operators recorded in deployments/xlayer.json.
const RPC = process.env.XLAYER_FORK_RPC;
const SMOKE = process.env.ATRO_SMOKE_VAULT as Address | undefined;

describe.skipIf(!RPC)('X Layer mainnet (spec §12.2)', () => {
  const atro = () => createAtropyle({ chain: 'xlayer', transport: http(RPC) });

  it('integrity passes with two operators', async () => {
    const r = await atro().integrity();
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.rpcs).toBe(2);
    expect(r.warnings).toEqual([]);
    expect(r.checks.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'cpu.tapeout',
        'cpu.nameSymbol',
        'beacon.frozen',
        'cpu.transistors',
        'netlist.policy',
        'netlist.kofn5',
        'netlist.ge4',
      ]),
    );
  });

  it('verifyPolicy proves P1-P8 over all 2^26 combinations of the deployed netlist', async () => {
    const r = await atro().verifyPolicy();
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.combos).toBe(2 ** 26);
    expect(r.beaconFrozen).toBe(true);
    console.log(`verifyPolicy: ${r.ms} ms at block ${r.blockNumber}`);
  });

  it.skipIf(!SMOKE)('the smoke-test Drill of Plan 1 verifies end to end', async () => {
    const r = await atro()
      .vault(SMOKE as Address)
      .verify();
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.policy).toMatchObject({ status: 'verified', unchanged: true, result: { ok: true } });
    expect(r.timeline.engine).toBe('netlist');
  });
});
