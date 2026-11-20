#!/usr/bin/env node
import { BIN_HELP, parseBinArgs } from './bin-args';
import { errorOutput } from './ops/index';
import { runStdio } from './stdio';
import { VERSION } from './version';

try {
  const cmd = await parseBinArgs(process.argv.slice(2), process.env);
  if (cmd.kind === 'help') process.stdout.write(BIN_HELP);
  else if (cmd.kind === 'version') process.stdout.write(`${VERSION}\n`);
  else await runStdio({ sdk: cmd.sdk });
} catch (e) {
  // stdout belongs to JSON-RPC: errors go to stderr only.
  process.stderr.write(`atropyle-mcp: ${errorOutput(e).summary}\n`);
  process.exitCode = 1;
}
