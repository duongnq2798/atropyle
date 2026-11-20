import { describe, expect, it } from 'vitest';
import { main, redact } from '../../src/main';
import { VERSION } from '../../src/version';
import { memoryIo } from './memory-io';

describe('redact', () => {
  it('drops a URL operand from every "value/argument is invalid" form and keeps a plain one', () => {
    expect(redact("error: command-argument value 'https://h.test/KEY' is invalid for argument 'vault'.")).toBe(
      "error: command-argument value '…' is invalid for argument 'vault'.",
    );
    expect(redact("error: option '--chain <name>' argument 'https://h.test/KEY' is invalid.")).toBe(
      "error: option '--chain <name>' argument '…' is invalid.",
    );
    expect(redact("error: command-argument value 'mars' is invalid for argument 'vault'.")).toContain("'mars'");
  });
});

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

  describe('commander errors never echo a value that can carry an API key', () => {
    it.each([false, true])('--flag=value, json=%s', async (json) => {
      const io = memoryIo();
      expect(await main(['doctor', '--verify-rpc=https://h.test/KEY', ...(json ? ['--json'] : [])], io)).toBe(2);
      expect(io.stdout + io.stderr).not.toContain('KEY');
      expect(io.stdout + io.stderr).toContain('--verify-rpc');
    });

    it.each([false, true])('an unknown command that is a URL, json=%s', async (json) => {
      const io = memoryIo();
      expect(await main(['https://h.test/KEY', ...(json ? ['--json'] : [])], io)).toBe(2);
      expect(io.stdout + io.stderr).not.toContain('KEY');
    });

    it('an invalid option argument that is a URL', async () => {
      const io = memoryIo();
      expect(await main(['doctor', '--chain', 'https://h.test/KEY'], io)).toBe(2);
      expect(io.stderr).not.toContain('KEY');
    });

    it('still names a plain unknown command and a plain unknown option', async () => {
      const a = memoryIo();
      expect(await main(['bogus'], a)).toBe(2);
      expect(a.stderr).toContain("unknown command 'bogus'");
      const b = memoryIo();
      expect(await main(['doctor', '--bogus=1'], b)).toBe(2);
      expect(b.stderr).toContain('--bogus');
      expect(b.stderr).not.toContain('=1');
    });

    it.each([false, true])('a flag name that contains the letter s, json=%s', async (json) => {
      const io = memoryIo();
      expect(await main(['doctor', '--rpcs=https://h.test/KEY', ...(json ? ['--json'] : [])], io)).toBe(2);
      expect(io.stdout + io.stderr).not.toContain('KEY');
      expect(io.stdout + io.stderr).toContain('--rpcs');
    });

    it('a short option glued to its value keeps only the option letter', async () => {
      const io = memoryIo();
      expect(await main(['doctor', '-xhttps://h.test/KEY'], io)).toBe(2);
      expect(io.stderr).not.toContain('KEY');
      expect(io.stderr).toContain("'-x…'");
    });
  });

  it('exits 2 for `help bogus` without saying no command was given', async () => {
    const io = memoryIo();
    expect(await main(['help', 'bogus', '--json'], io)).toBe(2);
    expect(JSON.parse(io.stdout).error.message).toBe('Unknown command "bogus".');
  });

  it('exits 1 with DEPLOYMENT_MISSING and a hint on the default chain', async () => {
    const io = memoryIo();
    expect(await main(['doctor', '--json'], io)).toBe(1);
    expect(JSON.parse(io.stdout).error).toMatchObject({
      code: 'DEPLOYMENT_MISSING',
      hint: 'X Layer works after the mainnet deployment; use --deployment <file> until then.',
    });
  });

  it('names the variable, not the value, when ATROPYLE_RPC is not a URL', async () => {
    const io = memoryIo({ env: { ATROPYLE_RPC: 'not a url KEY' } });
    expect(await main(['doctor', '--json'], io)).toBe(2);
    const out = JSON.parse(io.stdout);
    expect(out.error.message).toBe('ATROPYLE_RPC is not a valid URL.');
    expect(io.stdout).not.toContain('KEY');
    const flag = memoryIo();
    await main(['doctor', '--json', '--rpc', 'nope KEY'], flag);
    expect(JSON.parse(flag.stdout).error.message).toBe('--rpc is not a valid URL.');
  });
});
