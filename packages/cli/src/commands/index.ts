import type { Command } from 'commander';
import type { Ctx } from '../context';
import { registerDoctor } from './doctor';

/** Help lists commands in this order: the order of spec §6. */
export function registerCommands(program: Command, ctx: Ctx): void {
  registerDoctor(program, ctx);
}
