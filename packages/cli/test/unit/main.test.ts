import { describe, expect, it } from 'vitest';
import { main } from '../../src/main';
import { VERSION } from '../../src/version';
import { memoryIo } from './memory-io';

describe('main', () => {
  it('prints the version', async () => {
    const io = memoryIo();
    expect(await main(['--version'], io)).toBe(0);
    expect(io.stdout).toBe(`${VERSION}\n`);
  });

  it('prints help with the doctor command', async () => {
    const io = memoryIo();
    expect(await main(['--help'], io)).toBe(0);
    expect(io.stdout).toContain('doctor');
    expect(io.stdout).toContain('--deployment <file>');
  });

  it('exits 0 for the help command', async () => {
    const io = memoryIo();
    expect(await main(['help'], io)).toBe(0);
    expect(io.stdout).toContain('Usage: atropyle');
    expect(io.stderr).toBe('');
  });

  it('answers a usage error with --json as exactly one error object and exit 2', async () => {
    const io = memoryIo();
    expect(await main(['doctor', '--bogus', '--json'], io)).toBe(2);
    const out = JSON.parse(io.stdout);
    expect(out).toMatchObject({ schemaVersion: 1, error: { code: 'INVALID_OPTIONS' } });
    expect(out.error.message).toContain('--bogus');
    expect(io.stderr).toBe('');
  });

  it('prints usage errors on stderr without --json', async () => {
    const io = memoryIo();
    expect(await main(['doctor', 'extra'], io)).toBe(2);
    expect(io.stdout).toBe('');
    expect(io.stderr).toContain('too many arguments');
  });

  it('exits 2 without a command', async () => {
    const io = memoryIo();
    expect(await main([], io)).toBe(2);
    expect(io.stderr).toContain('Usage: atropyle');
  });

  it('rejects an unknown ATROPYLE_CHAIN before touching the network', async () => {
    const io = memoryIo({ env: { ATROPYLE_CHAIN: 'mars' } });
    expect(await main(['doctor', '--json'], io)).toBe(2);
    expect(JSON.parse(io.stdout).error.code).toBe('INVALID_OPTIONS');
  });
});
