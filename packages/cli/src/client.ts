import { assertRpcChain } from '@atropyle/mcp/ops';
import {
  type AtropyleClient,
  AtropyleError,
  type AtropyleOptions,
  createAtropyle,
  type Deployment,
  getDeployment,
  httpTransport,
  readTransport,
  stringify,
} from '@atropyle/sdk';
import type { Transport } from 'viem';
import { UsageError } from './exit';
import { readDeployment } from './files';
import type { Globals } from './globals';
import type { Io } from './io';

export interface RpcChoice {
  /** One URL per operator; replaces the deployment's quorumRpcUrls (`verify --verify-rpc`). */
  verifyRpc?: readonly string[];
  /** Only the first operator, with the SINGLE_RPC warning (`verify --single-rpc`). */
  singleRpc?: boolean;
  /** false: do not check eth_chainId first (`doctor` reports it instead). */
  checkRpc?: boolean;
  /** The deployment the caller already read, so the file is not read twice (`doctor`). */
  deployment?: Deployment;
}

export async function deploymentFor(g: Globals, io: Io): Promise<Deployment> {
  if (g.deployment) return readDeployment(io, g.deployment);
  try {
    return getDeployment(g.chain);
  } catch (e) {
    if (e instanceof AtropyleError && e.code === 'DEPLOYMENT_MISSING') {
      throw new AtropyleError('DEPLOYMENT_MISSING', {
        message: e.message,
        hint: 'X Layer works after the mainnet deployment; use --deployment <file> until then.',
      });
    }
    throw e;
  }
}

/** --verbose: method and duration of every request. Never the URL, which can carry an API key. */
function logged(inner: Transport, label: string, io: Io): Transport {
  return (params) => {
    const t = inner(params);
    const request = (async (args: { method: string; params?: unknown }) => {
      const started = Date.now();
      try {
        return await t.request(args as never);
      } finally {
        io.err(`[rpc ${label}] ${args.method} ${Date.now() - started} ms\n`);
      }
    }) as typeof t.request;
    return { ...t, request };
  };
}

/** The URL groups `verify` reads, one per operator: --verify-rpc, else quorumRpcUrls; only the first with --single-rpc. */
export function verifyGroups(d: Deployment, o: RpcChoice = {}): string[][] {
  const groups = o.verifyRpc?.length ? o.verifyRpc.map((u) => [u]) : d.quorumRpcUrls.map((grp) => [...grp]);
  return o.singleRpc ? groups.slice(0, 1) : groups;
}

export async function sdkOptionsFor(g: Globals, io: Io, o: RpcChoice = {}): Promise<AtropyleOptions> {
  const d = o.deployment ?? (await deploymentFor(g, io));
  for (const u of o.verifyRpc ?? []) if (!URL.canParse(u)) throw new UsageError('--verify-rpc is not a valid URL.');
  if (o.checkRpc !== false) {
    for (const u of [...(g.rpc ? [g.rpc] : []), ...(o.verifyRpc ?? [])])
      await assertRpcChain(u, d.chainId, { fetch: io.fetch });
  }
  const wrap = (t: Transport, label: string) => (g.verbose ? logged(t, label, io) : t);
  const read = g.rpc ? httpTransport(g.rpc) : g.verbose ? readTransport([...d.rpcUrls]) : undefined;
  const custom = (o.verifyRpc?.length ?? 0) > 0 || o.singleRpc === true || g.verbose;
  const operators = verifyGroups(d, o);
  return {
    chain: d,
    ...(read ? { transport: wrap(read, 'read') } : {}),
    ...(custom
      ? {
          verifyTransports: operators.map((grp, i) =>
            wrap(grp.length === 1 ? httpTransport(grp[0]) : readTransport(grp), `verify ${i + 1}`),
          ),
        }
      : {}),
    ...(g.verbose ? { logger: (e: unknown) => io.err(`[sdk] ${stringify(e)}\n`) } : {}),
  };
}

export const clientFor = async (g: Globals, io: Io, o?: RpcChoice): Promise<AtropyleClient> =>
  createAtropyle(await sdkOptionsFor(g, io, o));
