import type { ChainName } from '@atropyle/sdk';
import { type Command, Option } from 'commander';
import { redactUrl, UsageError } from './exit';
import type { Io } from './io';

export interface Globals {
  chain: ChainName;
  rpc?: string;
  deployment?: string;
  json: boolean;
  color: boolean;
  verbose: boolean;
}

export function addGlobalOptions(program: Command): void {
  program
    .addOption(
      new Option(
        '--chain <name>',
        'chain, default xlayer (env: ATROPYLE_CHAIN); xlayer works after the mainnet deployment, use --deployment <file> until then',
      ).choices(['xlayer', 'local']),
    )
    .option('--rpc <url>', 'read RPC of that chain (env: ATROPYLE_RPC)')
    .option('--deployment <file>', 'deployment JSON; wins over --chain (env: ATROPYLE_DEPLOYMENT)')
    .option('--json', 'print exactly one JSON object (schemaVersion 1)')
    .option('--no-color', 'print without colors')
    .option('--verbose', 'log every RPC request to stderr');
}

/** Flags win over the environment. The environment comes from `io`, so unit tests never see the shell's. */
export function globalsOf(cmd: Command, io: Io): Globals {
  const o = cmd.optsWithGlobals<{
    chain?: string;
    rpc?: string;
    deployment?: string;
    json?: boolean;
    color?: boolean;
    verbose?: boolean;
    format?: string;
  }>();
  const env = (k: string) => io.env[k] || undefined;
  const chain = o.chain ?? env('ATROPYLE_CHAIN') ?? 'xlayer';
  if (chain !== 'xlayer' && chain !== 'local') {
    throw new UsageError(`Unknown chain "${redactUrl(chain)}". Use xlayer or local.`);
  }
  const rpc = o.rpc ?? env('ATROPYLE_RPC');
  // Neither message echoes the value: an RPC URL can carry an API key.
  if (rpc !== undefined && !URL.canParse(rpc))
    throw new UsageError(`${o.rpc === undefined ? 'ATROPYLE_RPC' : '--rpc'} is not a valid URL.`);
  return {
    chain,
    rpc,
    deployment: o.deployment ?? env('ATROPYLE_DEPLOYMENT'),
    json: o.json === true || o.format === 'json',
    color: o.color !== false,
    verbose: o.verbose === true,
  };
}
