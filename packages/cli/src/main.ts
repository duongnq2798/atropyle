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

/**
 * commander echoes what the user typed: `--flag=value`, an unknown command, a bad option argument. Any of them can be
 * a URL with an API key, and the text goes to logs. Keep the flag name, drop the value; never echo a URL operand.
 */
function redact(text: string): string {
  const operand = (value: string) => (URL.canParse(value) ? '…' : value);
  return text
    .replace(/'(-{1,2}[^'=s]+)=[^']*'/g, "'$1=…'")
    .replace(/unknown command '([^']*)'/g, (_, v: string) => `unknown command '${operand(v)}'`)
    .replace(/ argument '([^']*)' is invalid/g, (_, v: string) => ` argument '${operand(v)}' is invalid`);
}

function usageMessage(e: CommanderError, argv: readonly string[]): string {
  if (e.code !== 'commander.help') return redact(e.message.replace(/^error: /, ''));
  // `atropyle help bogus` and a bare `atropyle` both end in commander.help with a non-zero exit code.
  const i = argv.indexOf('help');
  const name = i >= 0 ? argv.slice(i + 1).find((a) => !a.startsWith('-')) : undefined;
  if (name === undefined) return 'No command given.';
  return URL.canParse(name) ? 'Unknown command.' : `Unknown command "${name}".`;
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
        if (!state.json) write(redact(s));
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
      if (state.json) emitError(io, new UsageError(usageMessage(e, argv)), true);
      return 2;
    }
    emitError(io, e, state.json);
    return exitCodeFor(e, state.command);
  }
}
