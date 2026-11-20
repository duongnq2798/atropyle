import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import {
  AtropyleError,
  type AtropyleOptions,
  type ChainName,
  type Deployment,
  getDeployment,
  httpTransport,
} from '@atropyle/sdk';
import { assertRpcChain, parseDeploymentText } from './ops/index';

export const BIN_HELP = `Usage: atropyle-mcp [options]

Atropyle MCP server on stdio. It reads vaults, simulates, verifies and
prepares unsigned transactions. It never signs and never holds a key.

Options:
  --chain <name>       xlayer (default) or local. Env: ATROPYLE_CHAIN
  --rpc <url>          Read RPC of that chain. Env: ATROPYLE_RPC
  --deployment <file>  Deployment JSON; wins over --chain. Env: ATROPYLE_DEPLOYMENT
  -h, --help           Show this help
  --version            Show the version
`;

export type BinCommand = { kind: 'help' } | { kind: 'version' } | { kind: 'run'; sdk: AtropyleOptions };

const CHAINS: readonly string[] = ['xlayer', 'local'];
const usage = (message: string) => new AtropyleError('INVALID_OPTIONS', { message, hint: 'Run atropyle-mcp --help.' });

async function loadDeployment(file: string): Promise<Deployment> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new AtropyleError('DEPLOYMENT_INVALID', {
      message: `Cannot read the deployment file ${file}.`,
      details: { file },
    });
  }
  return parseDeploymentText(text, file);
}

export async function parseBinArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  deps: { fetch?: typeof fetch; warn?: (line: string) => void } = {},
): Promise<BinCommand> {
  let values: { chain?: string; rpc?: string; deployment?: string; help?: boolean; version?: boolean };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        chain: { type: 'string' },
        rpc: { type: 'string' },
        deployment: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    // Never echo the message of parseArgs: it can contain an option value, such as an --rpc URL with an API key.
    throw usage('Unknown or malformed option.');
  }
  if (values.help) return { kind: 'help' };
  if (values.version) return { kind: 'version' };

  // An empty value counts as unset, as in a shell that exports ATROPYLE_RPC="".
  const file = values.deployment || env.ATROPYLE_DEPLOYMENT || undefined;
  let chain: ChainName | Deployment;
  if (file) {
    chain = await loadDeployment(file);
  } else {
    const name = values.chain || env.ATROPYLE_CHAIN || 'xlayer';
    if (!CHAINS.includes(name)) throw usage('Unknown chain. Use xlayer or local.');
    chain = name as ChainName;
  }

  const rpc = values.rpc || env.ATROPYLE_RPC || undefined;
  if (!rpc) return { kind: 'run', sdk: { chain } };
  if (!URL.canParse(rpc)) throw usage('--rpc is not a valid URL.');
  const chainId = typeof chain === 'string' ? getDeployment(chain).chainId : chain.chainId;
  try {
    await assertRpcChain(rpc, chainId, { fetch: deps.fetch });
  } catch (e) {
    // A wrong chain is fatal. An RPC that is down at start-up is not: the tools report RPC_UNAVAILABLE later.
    if (e instanceof AtropyleError && e.code === 'WRONG_CHAIN') throw e;
    // No URL in this line: it may carry an API key.
    if (e instanceof AtropyleError && (e.code === 'RPC_RATE_LIMITED' || e.code === 'RPC_UNAVAILABLE')) {
      (deps.warn ?? ((line) => process.stderr.write(`${line}\n`)))(
        'atropyle-mcp: the RPC did not answer; starting anyway',
      );
    }
  }
  return { kind: 'run', sdk: { chain, transport: httpTransport(rpc) } };
}
