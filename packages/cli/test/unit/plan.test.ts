import { describe, expect, it } from 'vitest';
import { main } from '../../src/main';
import { memoryIo } from './memory-io';

const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const GUARDED = ['--heir', `${A(2)}:70`, '--heir', `${A(5)}:30`, '--guardian', A(3), '--guardian', A(4), '--k', '2'];

describe('plan init', () => {
  it('writes a valid plan and prints the next steps', async () => {
    const io = memoryIo();
    expect(await main(['plan', 'init', ...GUARDED, '--drill', '--owner', A(1), '--json'], io)).toBe(0);
    const doc = JSON.parse(io.files.get('atropyle.plan.json') ?? 'null');
    expect(doc).toMatchObject({ version: 1, owner: A(1), drill: true, guardians: [A(3), A(4)], k: 2 });
    expect(doc.heirs).toHaveLength(2);
    const out = JSON.parse(io.stdout);
    expect(out).toMatchObject({ schemaVersion: 1, ok: true, written: true, file: 'atropyle.plan.json' });
    expect(out.next[0]).toBe('npx -y atropyle plan check atropyle.plan.json');
  });

  it('keeps recovery off unless --recovery is given', async () => {
    const off = memoryIo();
    expect(await main(['plan', 'init', ...GUARDED, '--json'], off)).toBe(0);
    expect(JSON.parse(off.files.get('atropyle.plan.json') ?? '{}').recoveryEnabled).toBe(false);
    const on = memoryIo();
    expect(await main(['plan', 'init', ...GUARDED, '--recovery', '--json'], on)).toBe(0);
    expect(JSON.parse(on.files.get('atropyle.plan.json') ?? '{}').recoveryEnabled).toBe(true);
  });

  it('refuses to overwrite a file without --force', async () => {
    const io = memoryIo({ files: { 'atropyle.plan.json': '{}' } });
    expect(await main(['plan', 'init', '--heir', A(2), '--json'], io)).toBe(2);
    expect(JSON.parse(io.stdout).error.message).toContain('--force');
    expect(io.files.get('atropyle.plan.json')).toBe('{}');
    const again = memoryIo({ files: { 'atropyle.plan.json': '{}' } });
    expect(await main(['plan', 'init', '--heir', A(2), '--force', '--json'], again)).toBe(0);
    expect(JSON.parse(again.files.get('atropyle.plan.json') ?? '{}').heirs).toHaveLength(1);
  });

  it('needs --heir when it cannot ask', async () => {
    const io = memoryIo();
    expect(await main(['plan', 'init', '--json'], io)).toBe(2);
    expect(JSON.parse(io.stdout).error.code).toBe('INVALID_OPTIONS');
  });

  it('writes nothing for a plan with issues, and exits 1', async () => {
    const io = memoryIo();
    expect(await main(['plan', 'init', '--heir', `${A(2)}:70`, '--heir', `${A(5)}:20`, '--json'], io)).toBe(1);
    const out = JSON.parse(io.stdout);
    expect(out).toMatchObject({ ok: false, written: false });
    expect(out.issues.map((i: { code: string }) => i.code)).toContain('SHARES_SUM');
    expect(io.files.size).toBe(0);
  });

  it('refuses guardians with the simple template', async () => {
    const io = memoryIo();
    expect(await main(['plan', 'init', '--template', 'simple', ...GUARDED, '--json'], io)).toBe(2);
  });

  it('exits 2 for a bad --owner, before writing anything', async () => {
    const io = memoryIo();
    expect(await main(['plan', 'init', '--heir', A(2), '--owner', 'nope', '--json'], io)).toBe(2);
    expect(JSON.parse(io.stdout).error.code).toBe('INVALID_ADDRESS');
    expect(io.files.size).toBe(0);
  });
});

describe('plan check', () => {
  it('exits 2 for a bad --as', async () => {
    const io = memoryIo({ files: { 'p.json': '{}' } });
    expect(await main(['plan', 'check', 'p.json', '--as', 'nope', '--json'], io)).toBe(2);
    expect(JSON.parse(io.stdout).error.code).toBe('INVALID_ADDRESS');
  });
});

describe('plan help', () => {
  it('does not show an empty default for repeatable options', async () => {
    const io = memoryIo();
    expect(await main(['plan', 'init', '--help'], io)).toBe(0);
    expect(io.stdout).not.toContain('(default: [])');
    expect(io.stdout).toContain('counting from 0');
    expect(io.stdout).toContain('(off unless you give this flag)');
  });
});
