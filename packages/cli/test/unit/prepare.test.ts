import { OKX_NOTE, type PrepareOutput, PrepareOutputSchema, UNTRUSTED_NOTICE } from '@atropyle/mcp/ops';
import { describe, expect, it } from 'vitest';
import { handOver, type PrepareFlags } from '../../src/commands/prepare';
import type { Ctx } from '../../src/context';
import { formatPrepare } from '../../src/format';
import type { Globals } from '../../src/globals';
import { PLAIN } from '../../src/style';
import { memoryIo } from './memory-io';

const VAULT = '0x0000000000000000000000000000000000000001';
const LINK = 'https://app.atropyle.test/#/sign?p=abc';
const OKX = 'https://web3.okx.com/download?deeplink=x';
const WARNING = { code: 'WATCH_OUT', message: 'check this first' };
const NOTE = 'Step 2 was not simulated on its own: it depends on step 1.';

type Handoff = NonNullable<PrepareOutput['handoff']>;

const step = {
  chainId: 31337,
  from: VAULT,
  to: VAULT,
  data: '0x',
  value: '0',
  action: 'checkIn',
  summary: 'Check in.',
  warnings: [],
  simulation: { ok: true, gas: '21000' },
};

/** Built through the schema, so a drift in PrepareOutput fails these tests. */
function make(over: Record<string, unknown> = {}): PrepareOutput {
  return PrepareOutputSchema.parse({
    schemaVersion: 1,
    action: 'checkIn',
    chainId: 31337,
    from: VAULT,
    vault: VAULT,
    plan: { chainId: 31337, from: VAULT, vault: VAULT, steps: [], summary: 'Check in.', warnings: [] },
    handoff: null,
    blocked: null,
    summary: 'Check in. There is nothing to sign.',
    warnings: [],
    untrusted: { notice: UNTRUSTED_NOTICE, texts: [] },
    ...over,
  });
}

const handoff = (over: Partial<Handoff> = {}): Handoff => ({
  link: LINK,
  okxAppLink: null,
  cast: ['cast send 0x1 "poke()"'],
  calls: { version: '2.0.0', chainId: '0x7a69', from: VAULT, atomicRequired: false, calls: [] },
  okx: ['onchainos wallet contract-call --chain 31337 --to 0x1 --input-data 0x'],
  notes: [],
  ...over,
});

const blocked = {
  step: 0,
  action: 'checkIn',
  error: { code: 'NOT_OWNER', message: 'm', hint: 'Use the owner.', docsUrl: 'd' },
};

const G: Globals = { chain: 'local', json: false, color: false, verbose: false };

function run(
  flags: Partial<PrepareFlags>,
  out: PrepareOutput,
  o: { io?: Parameters<typeof memoryIo>[0]; json?: boolean } = {},
) {
  const io = memoryIo(o.io);
  const ctx: Ctx = { io, state: { command: 'prepare', json: false, exitCode: 0 } };
  const code = handOver(ctx, { ...G, json: o.json === true }, { format: 'link', ...flags } as PrepareFlags, out);
  return { io, code };
}

describe('handOver', () => {
  it('exits 1 with an empty stdout and the reason on stderr when --format cast has no cast commands', () => {
    const out = make({ handoff: handoff({ cast: [], notes: ['cast commands are omitted: the SDK refused'] }) });
    const r = run({ format: 'cast' }, out);
    expect(r.code).toBe(1);
    expect(r.io.stdout).toBe('');
    expect(r.io.stderr).toContain('cast commands are omitted');
    expect(r.io.stderr).toContain('Check in.');
  });

  it('prints only the onchainos commands on stdout with --format okx', () => {
    const r = run({ format: 'okx' }, make({ handoff: handoff() }));
    expect(r.code).toBe(0);
    expect(r.io.stdout).toBe('onchainos wallet contract-call --chain 31337 --to 0x1 --input-data 0x\n');
    expect(r.io.stderr).toContain('Check in.');
  });

  it('exits 1 with an empty stdout and the reason on stderr when --format okx has no commands', () => {
    const r = run({ format: 'okx' }, make({ handoff: handoff({ okx: null }) }));
    expect(r.code).toBe(1);
    expect(r.io.stdout).toBe('');
    expect(r.io.stderr).toContain('a step sends native value');
    expect(r.io.stderr).toContain('Check in.');
  });

  it('shows the OKX note only under --format okx in human output', () => {
    const out = make({ handoff: handoff({ notes: [OKX_NOTE] }) });
    expect(run({ format: 'link' }, out).io.stdout).not.toContain(OKX_NOTE);
    for (const format of ['cast', 'calls']) expect(run({ format }, out).io.stderr, format).not.toContain(OKX_NOTE);
    expect(run({ format: 'okx' }, out).io.stderr).toContain(OKX_NOTE);
    expect(JSON.parse(run({ format: 'json' }, out, { json: true }).io.stdout).handoff.notes).toContain(OKX_NOTE);
  });

  it('points a plan without a link to cast, calls and okx', () => {
    const out = make({ handoff: handoff({ link: null }) });
    expect(run({ format: 'link' }, out).io.stdout).toContain('Use --format cast, --format calls or --format okx.');
  });

  it('prints calls and exits 0 for a handoff without cast commands in --format calls', () => {
    const r = run({ format: 'calls' }, make({ handoff: handoff({ cast: [] }) }));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.io.stdout)).toMatchObject({ version: '2.0.0' });
  });

  it('prints the summary, no link, and exits 0 when there is nothing to do', () => {
    const link = run({ format: 'link' }, make());
    expect(link.code).toBe(0);
    expect(link.io.stdout).toContain('There is nothing to sign.');
    expect(link.io.stdout).not.toContain('#/sign');
    for (const format of ['cast', 'calls', 'okx']) {
      const r = run({ format }, make());
      expect(r.code).toBe(0);
      expect(r.io.stdout).toBe('');
      expect(r.io.stderr).toContain('There is nothing to sign.');
    }
  });

  it('shows no link, QR or cast command for a blocked plan, even next to a handoff', () => {
    const out = make({ blocked, handoff: handoff() });
    for (const format of ['link', 'cast', 'calls', 'okx']) {
      const r = run({ format, qr: true }, out);
      expect(r.code, format).toBe(1);
      expect(r.io.stdout + r.io.stderr, format).not.toMatch(/#\/sign|cast send|onchainos|[▀▄█]/u);
      if (format !== 'link') expect(r.io.stdout, format).toBe('');
      expect(r.io.stdout + r.io.stderr, format).toContain('Nothing to sign');
    }
    const j = run({ format: 'json' }, out, { json: true });
    expect(j.code).toBe(1);
    expect(JSON.parse(j.io.stdout).handoff).toBeNull();
  });

  it('prints the QR-skipped note, and no blocks, when the code is too wide for the terminal', () => {
    const r = run({ qr: undefined }, make({ handoff: handoff() }), { io: { isTTY: true, columns: 20 } });
    expect(r.code).toBe(0);
    expect(r.io.stdout).toContain('too wide for this terminal');
    expect(r.io.stdout).not.toMatch(/[▀▄█]/u);
  });

  it('draws a QR code on a TTY by default, and not with --no-qr or off a TTY', () => {
    const out = make({ handoff: handoff() });
    expect(run({}, out, { io: { isTTY: true } }).io.stdout).toMatch(/[▀▄█]/u);
    expect(run({ qr: false }, out, { io: { isTTY: true } }).io.stdout).not.toMatch(/[▀▄█]/u);
    expect(run({}, out).io.stdout).not.toMatch(/[▀▄█]/u);
    expect(run({ qr: true }, out).io.stdout).toMatch(/[▀▄█]/u);
  });

  it('prints warnings, notes, link, QR code and the OKX line in that order', () => {
    const out = make({
      plan: { chainId: 31337, from: VAULT, vault: VAULT, steps: [step], summary: 'Check in.', warnings: [] },
      warnings: [WARNING],
      handoff: handoff({ notes: [NOTE], okxAppLink: OKX }),
    });
    const text = run({ qr: true }, out).io.stdout;
    const at = [WARNING.message, NOTE, LINK, '█', OKX].map((s) => text.indexOf(s));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });
});

describe('formatPrepare', () => {
  it('prints the notes in link mode too, before the link', () => {
    const text = formatPrepare(make({ handoff: handoff({ notes: [NOTE] }) }), PLAIN, null, null);
    expect(text).toContain(NOTE);
    expect(text.indexOf(NOTE)).toBeLessThan(text.indexOf(LINK));
  });
});
