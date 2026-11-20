import type { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../src/main';
import { memoryIo } from './memory-io';

/** [snapshot name, command]: the root is `atropyle`, subcommands are joined with `-` (plan init → plan-init). */
function walk(c: Command, path: string[] = []): [string, Command][] {
  const name = path.length === 0 ? 'atropyle' : path.join('-');
  return [[name, c], ...c.commands.flatMap((s) => walk(s, [...path, s.name()]))];
}

describe('--help', () => {
  const program = buildProgram(memoryIo(), { command: '', json: false, exitCode: 0 });
  for (const [name, cmd] of walk(program)) {
    it(name, async () => {
      await expect(cmd.helpInformation()).toMatchFileSnapshot(`../snapshots/help/${name}.txt`);
    });
  }
});
