import type { Command } from 'commander';
import type { Ctx } from '../context';
import { registerDoctor } from './doctor';
import { registerMcp } from './mcp';
import { registerPlan } from './plan';
import { registerPrepare } from './prepare';
import { registerSimulate } from './simulate';
import { registerStatus } from './status';
import { registerVaults } from './vaults';
import { registerVerify } from './verify';

/** Help lists commands in this order: the order of spec §6. */
export function registerCommands(program: Command, ctx: Ctx): void {
  registerVerify(program, ctx);
  registerStatus(program, ctx);
  registerVaults(program, ctx);
  registerSimulate(program, ctx);
  registerPlan(program, ctx);
  registerPrepare(program, ctx);
  registerDoctor(program, ctx);
  registerMcp(program, ctx);
}
