import type { PrepareOutput } from '@atropyle/mcp/ops';
import { describe, expect, it } from 'vitest';
import { handOver, type PrepareFlags } from '../../src/commands/prepare';
import type { Ctx } from '../../src/context';
import { formatPrepare } from '../../src/format';
import type { Globals } from '../../src/globals';
import { PLAIN } from '../../src/style';
import { memoryIo } from './memory-io';

const VAULT = '0x0000000000000000000000000000000000000001';
const LINK = 'https://app.atropyle.test/#/sign?p=abc';

function stub(over: Partial<PrepareOutput>): PrepareOutput {
  return {
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
    untrusted: { notice: '', texts: [] },
    ...over,
  } as unknown as PrepareOutput;
}

type Handoff = NonNullable<PrepareOutput['handoff']>;

const handoff = (over: Partial<Handoff>): Handoff => ({
  link: LINK,
  okxAppLink: null,
  cast: ['cast send 0x1 "poke()"'],
  calls: { version: '2.0.0', chainId: '0x7a69', from: VAULT, atomicRequired: false, calls: [] },
  notes: [],
  ...over,
});

const G: Globals = { chain: 'local', json: false, color: false, verbose: false };

function run(format: string, out: PrepareOutput) {
  const io = memoryIo();
  const ctx: Ctx = { io, state: { command: 'prepare', json: false, exitCode: 0 } };
  handOver(ctx, G, { format } as PrepareFlags, out);
  return io;
}

describe('handOver', () => {
  it('exits with an empty stdout and the reason on stderr when --format cast has no cast commands', () => {
    const out = stub({ handoff: handoff({ cast: [], notes: ['cast commands are omitted: the SDK refused'] }) });
    const io = run('cast', out);
    expect(io.stdout).toBe('');
    expect(io.stderr).toContain('cast commands are omitted');
    expect(io.stderr).toContain('Check in.');
  });

  it('exits 1 for an empty cast handoff, a blocked plan and nothing else', () => {
    const io = memoryIo();
    const ctx: Ctx = { io, state: { command: 'prepare', json: false, exitCode: 0 } };
    const flags = { format: 'cast' } as PrepareFlags;
    expect(handOver(ctx, G, flags, stub({ handoff: handoff({ cast: [] }) }))).toBe(1);
    expect(handOver(ctx, G, flags, stub({ handoff: handoff({}) }))).toBe(0);
    expect(handOver(ctx, G, flags, stub({}))).toBe(0);
    const blocked = { step: 0, action: 'checkIn', error: { code: 'NOT_OWNER', message: 'm', hint: 'h', docsUrl: 'd' } };
    expect(handOver(ctx, G, flags, stub({ blocked } as Partial<PrepareOutput>))).toBe(1);
  });

  it('prints the summary and no link when there is nothing to do', () => {
    const link = run('link', stub({}));
    expect(link.stdout).toContain('There is nothing to sign.');
    expect(link.stdout).not.toContain('#/sign');
    for (const format of ['cast', 'calls']) {
      const io = run(format, stub({}));
      expect(io.stdout).toBe('');
      expect(io.stderr).toContain('There is nothing to sign.');
    }
  });
});

describe('formatPrepare', () => {
  it('prints the notes in link mode too, before the link', () => {
    const o = stub({ handoff: handoff({ notes: ['Step 2 was not simulated on its own: it depends on step 1.'] }) });
    const text = formatPrepare(o, PLAIN, null, null);
    expect(text).toContain('Step 2 was not simulated on its own');
    expect(text.indexOf('Step 2 was not simulated')).toBeLessThan(text.indexOf(LINK));
  });
});
