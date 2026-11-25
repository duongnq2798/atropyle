// @vitest-environment node
import { readFileSync } from 'node:fs';
import { evaluatePolicyBundle } from '@atropyle/sdk/verify';
import { describe, expect, it } from 'vitest';
import { BLOCK, harnessBundle, MAINNET, SEED } from '../../src/app/e2e/proof/bundle';

const xlayer = JSON.parse(readFileSync(new URL('../../../../deployments/xlayer.json', import.meta.url), 'utf8'));

describe('the bundle of /e2e/proof/', () => {
  it('is X Layer mainnet as deployments/xlayer.json records it', () => {
    expect(MAINNET.factory).toBe(xlayer.factory);
    expect(MAINNET.beacon).toBe(xlayer.tapeout.beacon);
    expect(String(MAINNET.policyId)).toBe(xlayer.policyId);
    expect(String(MAINNET.kofn5)).toBe(xlayer.circuits.kofn5);
    expect(String(MAINNET.ge4)).toBe(xlayer.circuits.ge4);
    expect(MAINNET.keccak).toEqual(xlayer.circuits.netlistKeccak);
    expect(harnessBundle().cpu).toBe(xlayer.cpu);
    expect(BLOCK > BigInt(xlayer.factoryBlock)).toBe(true);
  });

  it('passes every check of the SDK, P9 and the code pins included, as the chain itself does', async () => {
    const r = await evaluatePolicyBundle(harnessBundle(), { blocks: 64 });
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.p9).toMatchObject({ ok: true, seed: SEED, vectors: 64 });
    expect(r.p9?.operators.map((o) => o.matched)).toEqual([64, 64]);
    expect(r.netlists.map((n) => [n.role, n.matchesSource, n.matchesDeployment])).toEqual([
      ['policy', true, true],
      ['kofn5', true, true],
      ['ge4', true, true],
    ]);
  });

  it('breaks P9 with lie, leaves it out with noP9, and asks one operator with rpcs 1', async () => {
    const lie = await evaluatePolicyBundle(harnessBundle({ lie: true }), { blocks: 64 });
    expect(lie.ok).toBe(false);
    expect(lie.p9?.mismatches).toHaveLength(1);
    expect(lie.issues).toEqual(['P9: 1 of 64 vectors differ between the simulator and step() on RPC operator #2']);
    const none = await evaluatePolicyBundle(harnessBundle({ noP9: true }), { blocks: 64 });
    expect(none.p9).toBeNull();
    expect(none.ok).toBe(true);
    const one = await evaluatePolicyBundle(harnessBundle({ rpcs: 1 }), { blocks: 64 });
    expect(one.rpcs).toBe(1);
    expect(one.p9?.operators).toHaveLength(1);
    expect(one.warnings.map((w) => w.code)).toEqual(['SINGLE_RPC']);
  });
});
