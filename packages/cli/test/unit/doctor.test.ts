import { readFileSync } from 'node:fs';
import { parseDeploymentText } from '@atropyle/mcp/ops';
import { describe, expect, it } from 'vitest';
import { doctorExitCode, doctorTargets } from '../../src/commands/doctor';
import type { Globals } from '../../src/globals';
import type { DoctorOutput } from '../../src/schemas';

const d = parseDeploymentText(
  readFileSync(new URL('../../../mcp/test/fixtures/deployment.json', import.meta.url), 'utf8'),
);
const g: Globals = { chain: 'local', json: true, color: false, verbose: false };

describe('doctor', () => {
  it('probes each URL once, and --rpc replaces the read RPCs', () => {
    expect(doctorTargets(g, d)).toEqual([{ role: 'read', operator: null, url: 'http://127.0.0.1:1' }]);
    expect(doctorTargets({ ...g, rpc: 'http://127.0.0.1:2' }, d)).toEqual([
      { role: 'read', operator: null, url: 'http://127.0.0.1:2' },
      { role: 'verify', operator: 1, url: 'http://127.0.0.1:1' },
    ]);
  });

  it('exits 4 on a failed RPC, 3 on failed integrity, 1 on an old Node.js', () => {
    const base = {
      ok: true,
      node: { version: 'v24.11.0', required: '>=20', ok: true },
      rpcs: [{ role: 'read', operator: null, host: 'a', ok: true, chainId: 1, latencyMs: 5, error: null }],
      integrity: { ok: true },
      integrityError: null,
    } as unknown as DoctorOutput;
    expect(doctorExitCode(base)).toBe(0);
    expect(doctorExitCode({ ...base, rpcs: [{ ...base.rpcs[0], ok: false, error: 'RPC_UNAVAILABLE' }] })).toBe(4);
    expect(doctorExitCode({ ...base, integrity: { ...base.integrity, ok: false } } as DoctorOutput)).toBe(3);
    expect(
      doctorExitCode({
        ...base,
        integrity: null,
        integrityError: { code: 'QUORUM_UNAVAILABLE' },
      } as unknown as DoctorOutput),
    ).toBe(4);
    expect(doctorExitCode({ ...base, node: { ...base.node, ok: false } })).toBe(1);
  });
});
