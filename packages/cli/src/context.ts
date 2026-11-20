import type { Command } from 'commander';
import { type Globals, globalsOf } from './globals';
import type { Io } from './io';

export interface RunState {
  /** Name of the running command, for exit codes that depend on it (`verify`). */
  command: string;
  json: boolean;
  exitCode: number;
}

export interface Ctx {
  io: Io;
  state: RunState;
}

/** Wraps a command action: commander passes (...arguments, options, command). */
export function action<A extends unknown[]>(
  ctx: Ctx,
  name: string,
  run: (g: Globals, cmd: Command, ...args: A) => Promise<number>,
) {
  return async (...all: unknown[]): Promise<void> => {
    const cmd = all[all.length - 1] as Command;
    ctx.state.command = name;
    const g = globalsOf(cmd, ctx.io);
    ctx.state.json = g.json;
    ctx.state.exitCode = await run(g, cmd, ...(all.slice(0, -2) as A));
  };
}
