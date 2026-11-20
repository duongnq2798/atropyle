import type { Command } from 'commander';
import type { Ctx } from '../context';
import { registerDoctor } from './doctor';
import { registerSimulate } from './simulate';
import { registerStatus } from './status';
import { registerVaults } from './vaults';

/** Help lists commands in this order: the order of spec §6. */
export function registerCommands(program: Command, ctx: Ctx): void {
  registerStatus(program, ctx);
  registerVaults(program, ctx);
  registerSimulate(program, ctx);
  registerDoctor(program, ctx);
}
