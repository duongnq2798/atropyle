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
  const out = errorOutput(e);
  // The X Layer mainnet deployment is not published yet, so the default chain cannot start without a file.
  const more =
    out.error.code === 'DEPLOYMENT_MISSING'
      ? ' Until the X Layer mainnet deployment, pass --deployment <file> (or set ATROPYLE_DEPLOYMENT).'
      : '';
  process.stderr.write(`atropyle-mcp: ${out.summary}${more}\n`);
  process.exitCode = 1;
}
