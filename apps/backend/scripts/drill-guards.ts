// Guards of `npm run rehearse:drills` (rehearse-drills.ts). The rehearsal sends transactions, so it may only ever
// write to the anvil fork it has just started on this machine: never to X Layer mainnet, never to a node someone
// else runs. Every check is pure or takes its fetch as an argument, so test/unit/drill-guards.test.ts covers it
// without a network.

/** Host names that reach this machine only. */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** The only chain the rehearsal forks: X Layer mainnet, kept at its own chain id (see rehearse-drills.ts). */
export const XLAYER_CHAIN_ID = 196;

/** JSON-RPC methods that only read. Anything else (eth_sendTransaction, anvil_*, evm_*) needs a verified fork. */
export const READ_METHODS: ReadonlySet<string> = new Set([
  'eth_blockNumber',
  'eth_call',
  'eth_chainId',
  'eth_createAccessList',
  'eth_estimateGas',
  'eth_feeHistory',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_getLogs',
  'eth_getStorageAt',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_maxPriorityFeePerGas',
  'eth_simulateV1',
  'net_version',
  'web3_clientVersion',
  'anvil_nodeInfo',
]);

/**
 * Methods the rehearsal never sends, whatever the node: every signing method (eth_sign*, personal_*, wallet_*) and
 * every method that carries raw, already signed bytes (any name with "Raw"). The rehearsal holds no key, so it has
 * nothing to sign, and a signed raw transaction is the one thing that could also be valid on mainnet.
 */
export function isNeverMethod(method: string): boolean {
  return /^(eth_sign|personal_|wallet_)/.test(method) || method.includes('Raw');
}

export class RehearsalGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RehearsalGuardError';
  }
}

function refuse(why: string): never {
  throw new RehearsalGuardError(`rehearse:drills refuses to send: ${why}`);
}

function parseUrl(raw: string, what: string): URL {
  try {
    return new URL(raw);
  } catch {
    return refuse(`${what} ${raw} is not a URL`);
  }
}

/**
 * The URL of the node the rehearsal writes to: plain http on a loopback host with an explicit port, no user info,
 * no path. Returns it normalized (`http://127.0.0.1:8545`).
 */
export function assertLoopbackRpc(raw: string): string {
  const u = parseUrl(raw, 'the RPC');
  if (u.protocol !== 'http:') refuse(`${raw} is not a plain http URL on this machine`);
  if (!LOOPBACK.has(u.hostname)) refuse(`${raw} is not on localhost (127.0.0.1, localhost or [::1])`);
  if (u.username !== '' || u.password !== '') refuse(`${raw} carries user info`);
  if (u.port === '') refuse(`${raw} names no port`);
  if (u.pathname !== '/' || u.search !== '' || u.hash !== '') refuse(`${raw} has a path or a query`);
  return `${u.protocol}//${u.host}`;
}

/** The node the rehearsal forks from: an https RPC of X Layer, which only anvil and a few read-only calls use. */
export function assertUpstream(raw: string): string {
  const u = parseUrl(raw, '--fork-url');
  if (u.protocol !== 'https:') refuse(`--fork-url ${raw} must be an https RPC of X Layer mainnet`);
  if (LOOPBACK.has(u.hostname)) refuse(`--fork-url ${raw} is a local node, not X Layer mainnet`);
  return u.href;
}

/** What the node answered to web3_clientVersion, anvil_nodeInfo, eth_chainId and eth_blockNumber. */
export interface NodeAnswers {
  clientVersion: unknown;
  nodeInfo: unknown;
  chainId: unknown;
  blockNumber: unknown;
}

export interface ForkInfo {
  forkUrl: string;
  forkBlock: bigint;
}

function sameUrl(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href;
  } catch {
    return false;
  }
}

function toBig(v: unknown): bigint | null {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === 'string' && /^(0x[0-9a-fA-F]+|[0-9]+)$/.test(v)) return BigInt(v);
  return null;
}

/**
 * The node is an anvil fork of `upstream` on chain 196 that nobody has used yet: its head is still the fork block,
 * so no transaction and no mined block came before the rehearsal's own. rehearse-drills.ts runs this right after it
 * spawned anvil itself on a free loopback port, which is what "a fork this script started" means.
 */
export function assertFreshAnvilFork(a: NodeAnswers, upstream: string): ForkInfo {
  if (typeof a.clientVersion !== 'string' || !a.clientVersion.startsWith('anvil/')) {
    refuse(`the node is not anvil (web3_clientVersion ${JSON.stringify(a.clientVersion)})`);
  }
  const info = (typeof a.nodeInfo === 'object' && a.nodeInfo !== null ? a.nodeInfo : {}) as {
    forkConfig?: { forkUrl?: unknown; forkBlockNumber?: unknown } | null;
  };
  const forkUrl = info.forkConfig?.forkUrl;
  if (typeof forkUrl !== 'string' || forkUrl === '') refuse('the anvil node is not a fork');
  if (!sameUrl(forkUrl, upstream)) refuse(`the anvil node forks ${forkUrl}, not ${upstream}`);
  const forkBlock = toBig(info.forkConfig?.forkBlockNumber);
  if (forkBlock === null) refuse('anvil_nodeInfo names no fork block');
  if (toBig(a.chainId) !== BigInt(XLAYER_CHAIN_ID)) {
    refuse(`the fork reports chain ${String(a.chainId)}, not ${XLAYER_CHAIN_ID}`);
  }
  if (toBig(a.blockNumber) !== forkBlock) {
    refuse(`the fork is not fresh: head ${String(a.blockNumber)}, fork block ${forkBlock}`);
  }
  return { forkUrl, forkBlock };
}

/** Set by rehearse-drills.ts once assertLoopbackRpc and assertFreshAnvilFork passed for `url`. */
export interface Gate {
  url: string;
  verified: boolean;
}

/** Throws unless `method` may go to `url` now: reads always, writes only to the verified fork, never-methods never. */
export function checkCall(gate: Gate, url: string, method: unknown): void {
  if (typeof method !== 'string') refuse('a JSON-RPC call without a method');
  if (isNeverMethod(method)) refuse(`${method} is never sent: the rehearsal signs nothing`);
  if (READ_METHODS.has(method)) return;
  if (!gate.verified) refuse(`${method} before the anvil fork was verified`);
  if (!sameUrl(url, gate.url)) refuse(`${method} to ${url}, which is not the verified fork ${gate.url}`);
}

export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/**
 * The fetch of every client and every direct call of the rehearsal. It reads the JSON-RPC body (a single call or a
 * batch) and runs checkCall on each method before anything leaves this process.
 */
export function guardFetch(gate: Gate, inner: Fetch = fetch): Fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const body = init?.body;
    if (typeof body !== 'string') refuse(`a request to ${url} without a JSON body`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return refuse(`a request to ${url} whose body is not JSON`);
    }
    const calls = Array.isArray(parsed) ? parsed : [parsed];
    if (calls.length === 0) refuse(`an empty batch to ${url}`);
    for (const c of calls) checkCall(gate, url, (c as { method?: unknown } | null)?.method);
    return inner(input, init);
  };
}
