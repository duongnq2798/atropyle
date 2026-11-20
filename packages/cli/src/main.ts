import { Command, CommanderError } from 'commander';
import { registerCommands } from './commands/index';
import type { RunState } from './context';
import { exitCodeFor, UsageError } from './exit';
import { addGlobalOptions } from './globals';
import type { Io } from './io';
import { emitError } from './output';
import { VERSION } from './version';

/** Read before parsing, so even a commander error comes out as JSON. */
function wantsJson(argv: readonly string[]): boolean {
  return argv.some((a, i) => a === '--json' || a === '--format=json' || (a === '--format' && argv[i + 1] === 'json'));
}

export function buildProgram(io: Io, state: RunState): Command {
  const program = new Command('atropyle');
  // Configure the root before adding commands: .command() copies these settings (decision 2).
  program
    .description(
      'Plan, simulate, verify and prepare Atropyle inheritance vaults on X Layer. Never reads a private key.',
    )
    .version(VERSION, '-V, --version')
    .configureHelp({ helpWidth: 80, showGlobalOptions: true })
    .configureOutput({
      writeOut: (s) => io.out(s),
      writeErr: (s) => io.err(s),
      outputError: (s, write) => {
        if (!state.json) write(s);
      },
    })
    .exitOverride();
  addGlobalOptions(program);
  registerCommands(program, { io, state });
  return program;
}

export async function main(argv: readonly string[], io: Io): Promise<number> {
  const state: RunState = { command: '', json: wantsJson(argv), exitCode: 0 };
  const program = buildProgram(io, state);
  try {
    await program.parseAsync([...argv], { from: 'user' });
    return state.exitCode;
  } catch (e) {
    if (e instanceof CommanderError) {
      // --help, --version and `atropyle help` are not errors; commander gives them exitCode 0.
      if (e.exitCode === 0) return 0;
      const message = e.code === 'commander.help' ? 'No command given.' : e.message.replace(/^error: /, '');
      if (state.json) emitError(io, new UsageError(message), true);
      return 2;
    }
    emitError(io, e, state.json);
    return exitCodeFor(e, state.command);
  }
}
