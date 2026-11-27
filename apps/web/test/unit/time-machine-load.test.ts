import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadTimeMachine, peekTimeMachine } from '../../src/flows/time-machine/load';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}
/** Any import of the time machine's code except load.ts, which a page may import for a preload or an intent load. */
const TIME_MACHINE =
  /['"](?:@\/|(?:\.\.?\/)+)flows\/(?:time-machine\/(?:scrubber|time-machine|lazy|use-time-machine|use-engine)|impl\/time-machine)(?:\.[cm]?[jt]sx?)?['"]/;

describe('time machine chunk', () => {
  it('loads the scenarios and the Scrubber together, once', async () => {
    expect(peekTimeMachine()).toBeNull();
    const a = await loadTimeMachine();
    expect(typeof a.scenarios).toBe('function');
    expect(typeof a.frameAt).toBe('function');
    expect(typeof a.Scrubber).toBe('function');
    expect(await loadTimeMachine()).toBe(a);
    expect(peekTimeMachine()).toBe(a);
  }, 30_000);

  it('has one loading path: impl/time-machine.ts imports nothing from ./index, and index does not export it', () => {
    const logic = readFileSync(join(SRC, 'flows/impl/time-machine.ts'), 'utf8');
    expect(logic).not.toMatch(/from\s+['"]\.\/(?:index)?['"]/);
    expect(readFileSync(join(SRC, 'flows/impl/index.ts'), 'utf8')).not.toMatch(/time-machine/);
  });

  it('stays off the first paint of /: the home page, the layout and the shell never import it (R18.18)', () => {
    const list = [
      ...['app/page.tsx', 'app/layout.tsx', 'app/not-found.tsx'].map((f) => join(SRC, f)),
      ...files(join(SRC, 'home')),
      ...files(join(SRC, 'shell')),
    ];
    const offenders = list.filter((f) => TIME_MACHINE.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
