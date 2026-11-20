import { describe, expect, it } from 'vitest';
import { main } from '../../src/main';
import { memoryIo } from './memory-io';

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;

/** Every case below fails before the first RPC call, so no chain is needed. */
async function run(args: string[], files: Record<string, string> = {}) {
  const io = memoryIo({ files });
  const code = await main([...args, '--json'], io);
  return { code, out: JSON.parse(io.stdout) as { error?: { code: string; message: string } } };
}

describe('simulate usage errors', () => {
  const cases: [string, string[]][] = [
    ['--plan with a vault and an action', ['simulate', A(9), 'check-in', '--plan', 'p.json', '--as', A(1)]],
    ['--plan with an action flag', ['simulate', '--plan', 'p.json', '--as', A(1), '--heir', A(2)]],
    ['--plan with --at', ['simulate', '--plan', 'p.json', '--as', A(1), '--at', '+3d']],
    ['--drill without --plan', ['simulate', A(9), 'check-in', '--as', A(1), '--drill']],
    ['a missing --as', ['simulate', A(9), 'check-in']],
    ['no vault and no plan', ['simulate', '--as', A(1)]],
  ];
  for (const [name, args] of cases) {
    it(`exits 2 with INVALID_OPTIONS for ${name}`, async () => {
      const r = await run(args, { 'p.json': '{}' });
      expect(r.code).toBe(2);
      expect(r.out.error?.code).toBe('INVALID_OPTIONS');
    });
  }
});

describe('simulate --plan with a bad file', () => {
  it('exits 1 with PLAN_INVALID for a missing file', async () => {
    const r = await run(['simulate', '--plan', 'nope.json', '--as', A(1)]);
    expect(r.code).toBe(1);
    expect(r.out.error?.code).toBe('PLAN_INVALID');
  });

  it('exits 1 with PLAN_INVALID for broken JSON', async () => {
    const r = await run(['simulate', '--plan', 'p.json', '--as', A(1)], { 'p.json': '{ "heirs": [' });
    expect(r.code).toBe(1);
    expect(r.out.error?.code).toBe('PLAN_INVALID');
  });
});
