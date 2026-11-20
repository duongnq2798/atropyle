import { readFileSync } from 'node:fs';
import { parseDeploymentText } from '@atropyle/mcp/ops';
import { describe, expect, it } from 'vitest';
import { doctorExitCode, doctorTargets } from '../../src/commands/doctor';
import type { Globals } from '../../src/globals';
import { main } from '../../src/main';
import type { DoctorOutput } from '../../src/schemas';
import { memoryIo } from './memory-io';

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

  it('reads the deployment once, exits 4 when an operator fails, skips integrity and never prints the URL', async () => {
    const dep = JSON.stringify({
      ...JSON.parse(readFileSync(new URL('../../../mcp/test/fixtures/deployment.json', import.meta.url), 'utf8')),
      rpcUrls: ['http://ok.test/'],
      quorumRpcUrls: [['http://ok.test/'], ['http://bad.test/KEY?x=SECRET']],
    });
    let reads = 0;
    const requested: string[] = [];
    const io = memoryIo({
      files: { 'dep.json': dep },
      fetch: async (url) => {
        requested.push(String(url));
        if (String(url).includes('KEY')) throw new TypeError('fetch failed');
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x7a69' }));
      },
    });
    const inner = io.readFile;
    io.readFile = (p) => {
      reads++;
      return inner(p);
    };
    expect(await main(['doctor', '--json', '--deployment', 'dep.json'], io)).toBe(4);
    const out = JSON.parse(io.stdout);
    expect(out.integrity).toBeNull();
    expect(out.rpcs.map((r: { ok: boolean }) => r.ok)).toEqual([true, false]);
    expect(reads).toBe(1);
    expect(requested).toHaveLength(2);
    expect(io.stdout + io.stderr).not.toMatch(/KEY|SECRET/);
    expect(out.rpcs[1].host).toBe('bad.test');
  });
});
