import { describe, expect, it } from 'vitest';
import { main } from '../../src/main';
import { VERSION } from '../../src/version';
import { memoryIo } from './memory-io';

const NPX = `npx -y atropyle@${VERSION}`;
const A = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;

/** A prompt that answers from a list and records every question. */
function scripted(answers: (string | null)[]) {
  const asked: string[] = [];
  const prompt = async (q: string): Promise<string | null> => {
    asked.push(q);
    if (answers.length === 0) throw new Error(`no answer left for: ${q}`);
    return answers.shift() as string | null;
  };
  return { asked, prompt };
}
const terminal = (prompt: (q: string) => Promise<string | null>, files: Record<string, string> = {}) =>
  memoryIo({ isTTY: true, stdinTTY: true, env: { NO_COLOR: '1' }, prompt, files });
const written = (io: ReturnType<typeof memoryIo>) => JSON.parse(io.files.get('atropyle.plan.json') ?? 'null');

describe('plan init in a terminal', () => {
  it('asks one question at a time and writes the plan', async () => {
    // owner, 3 heir questions, shares, 3 guardian questions, k, recovery, drill, assets
    const s = scripted([A(1), A(2), A(5), '', '70 30', A(3), A(4), '', '', 'y', '', '']);
    const io = terminal(s.prompt);
    expect(await main(['plan', 'init'], io)).toBe(0);
    expect(s.asked).toHaveLength(12);
    expect(s.asked[0]).toMatch(/^Your wallet address/);
    expect(s.asked[9]).toContain('wallet they choose');
    expect(s.asked[9]).toContain('any 2 of these guardians');
    expect(io.stderr).toContain('never asks for a private key');
    expect(written(io)).toMatchObject({
      owner: A(1),
      drill: true,
      guardians: [A(3), A(4)],
      k: 2,
      recoveryEnabled: true,
    });
    expect(written(io).heirs).toMatchObject([
      { account: A(2), percent: 70 },
      { account: A(5), percent: 30 },
    ]);
    expect(io.stdout).toContain(`${NPX} plan check atropyle.plan.json`);
  });

  it('keeps recovery off when Enter is pressed on that question', async () => {
    // no owner, 1 heir, no more heirs, 1 guardian, no more guardians, k, recovery, drill, assets
    const s = scripted(['', A(2), '', A(3), '', '', '', '', '']);
    const io = terminal(s.prompt);
    expect(await main(['plan', 'init'], io)).toBe(0);
    expect(written(io).recoveryEnabled).toBe(false);
  });

  it('asks again after an answer it cannot use, and says why', async () => {
    // owner skipped, a bad heir, a good heir, no more heirs, no guardians, drill, no assets
    const s = scripted(['', 'not-an-address', A(2), '', '', '', '']);
    const io = terminal(s.prompt);
    expect(await main(['plan', 'init'], io)).toBe(0);
    expect(s.asked[1]).toBe(s.asked[2]);
    expect(io.stderr).toContain('heir 1: not a valid address');
    expect(written(io).heirs).toHaveLength(1);
  });

  it('checks that the shares add up to 100', async () => {
    const s = scripted(['', A(2), A(5), '', '70 20', '60 40', '', '', '']);
    const io = terminal(s.prompt);
    expect(await main(['plan', 'init'], io)).toBe(0);
    expect(io.stderr).toContain('add up to 90');
    expect(written(io).heirs.map((h: { percent: number }) => h.percent)).toEqual([60, 40]);
  });

  it('never asks with --json, without a terminal or with --heir', async () => {
    const cases: [string[], boolean][] = [
      [['plan', 'init', '--json'], true],
      [['plan', 'init'], false],
      [['plan', 'init', '--heir', A(2)], true],
    ];
    for (const [argv, tty] of cases) {
      const s = scripted([]);
      const io = memoryIo({ isTTY: tty, stdinTTY: tty, env: { NO_COLOR: '1' }, prompt: s.prompt });
      await main(argv, io);
      expect(s.asked, argv.join(' ')).toEqual([]);
    }
  });

  it('never asks when only one of stdin and stdout is a terminal, or when there is no prompt', async () => {
    for (const [isTTY, stdinTTY] of [
      [false, true],
      [true, false],
    ]) {
      const s = scripted([]);
      const io = memoryIo({ isTTY, stdinTTY, env: { NO_COLOR: '1' }, prompt: s.prompt });
      expect(await main(['plan', 'init'], io), `stdout ${isTTY}, stdin ${stdinTTY}`).toBe(2);
      expect(s.asked).toEqual([]);
      expect(io.files.size).toBe(0);
    }
    const bare = memoryIo({ isTTY: true, stdinTTY: true, env: { NO_COLOR: '1' } });
    expect(await main(['plan', 'init'], bare)).toBe(2);
    expect(bare.files.size).toBe(0);
  });

  it('rejects a flag that a question would answer before the first question', async () => {
    const s = scripted([]);
    const io = terminal(s.prompt);
    expect(await main(['plan', 'init', '--preset', 'sixMonths'], io)).toBe(2);
    expect(s.asked).toEqual([]);
    expect(io.stderr).toContain('--preset');
    expect(io.files.size).toBe(0);
  });

  it('ends with a usage error after 5 bad answers to one question, and writes nothing', async () => {
    const s = scripted(['', 'x1', 'x2', 'x3', 'x4', 'x5']);
    const io = terminal(s.prompt);
    expect(await main(['plan', 'init'], io)).toBe(2);
    expect(s.asked).toHaveLength(6);
    expect(io.stderr).toContain('5 tries');
    expect(io.files.size).toBe(0);
  });

  it('stops before the first question when the target is not a readable file', async () => {
    const s = scripted([]);
    const io = terminal(s.prompt);
    io.readFile = async () => {
      throw Object.assign(new Error('EISDIR'), { code: 'EISDIR' });
    };
    expect(await main(['plan', 'init'], io)).not.toBe(0);
    expect(s.asked).toEqual([]);
    expect(io.stderr).toContain('EISDIR');
    expect(io.files.size).toBe(0);
  });

  it('words the recovery question for a single guardian', async () => {
    const s = scripted(['', A(2), '', A(3), '', '', 'y', '', '']);
    const io = terminal(s.prompt);
    expect(await main(['plan', 'init'], io)).toBe(0);
    expect(s.asked[6]).toContain('this guardian');
    expect(s.asked[6]).toContain('wallet they choose');
    expect(s.asked[6]).not.toContain('any 1 of');
    expect(written(io).recoveryEnabled).toBe(true);
  });

  it('names the asset that cannot be read', async () => {
    const s = scripted(['', A(2), '', '', '', `erc20:${A(9)}`, 'nonsense', `erc20:${A(8)}`, '']);
    const io = terminal(s.prompt);
    expect(await main(['plan', 'init'], io)).toBe(0);
    expect(io.stderr).toContain('asset 2:');
  });

  it('stops on Ctrl+C or when the file exists, and writes nothing', async () => {
    const s = scripted([null]);
    const io = terminal(s.prompt);
    expect(await main(['plan', 'init'], io)).toBe(2);
    expect(io.stderr).toContain('Cancelled');
    expect(io.files.size).toBe(0);

    const t = scripted([]);
    const existing = terminal(t.prompt, { 'atropyle.plan.json': '{}' });
    expect(await main(['plan', 'init'], existing)).toBe(2);
    expect(t.asked).toEqual([]);
    expect(existing.stderr).toContain('--force');
    expect(existing.files.get('atropyle.plan.json')).toBe('{}');
  });
});
