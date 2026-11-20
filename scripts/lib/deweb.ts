// DeWEB publishing: plan the writes to a SiteRegistry container, resume a partial upload, estimate the fee, and hand
// the calls to a signer. Nothing here takes a key: --emit writes the calls for forge script and the user's keystore,
// and --unlocked sends through eth_sendTransaction to a local anvil only.
import { posix } from 'node:path';
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  type Hex,
  hexToBytes,
  isAddress,
  keccak256,
  type PublicClient,
  parseAbi,
  parseAbiParameters,
  stringToBytes,
  toHex,
  type WalletClient,
} from 'viem';
import { CHUNK_MAX, type SiteFile } from './site-files';

/**
 * DeWEB on X Layer, read-only checks of 18/11/2026 (Plan 4, decision 11). The impls match the gateway's expectedImpl.
 * contracts/script/lib/DewebCalls.sol pins the same registry and binding.
 */
export const DEWEB = {
  chainId: 196,
  registry: '0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6',
  binding: '0x68809Fd2fb343aA57D0aeB7f33Defe477c9666f9',
  opener: '0x536adD8F30f03b69f6fbF29d425A816A0dC50106',
  tapeoutFactory: '0x1f09DAeFA827f02CBb40967cc91b259763760761',
} as const;

/** The circuit NFT holder is the container's editor, so no operator functions are needed (Plan 4, decision 14). */
export const registryAbi = parseAbi([
  'function putFile(address container, string path, string contentType, bytes32 sha256Hash, bytes firstChunk)',
  'function appendChunk(address container, string path, uint256 expectIndex, bytes data)',
  'function removeFile(address container, string path)',
  'function setFallback(address container, string path)',
  'function fileInfo(address container, string path) view returns (uint32 size, string contentType, bytes32 sha256Hash, uint40 updatedAt, uint256 chunkCount)',
  'function read(address container, string path) view returns (bytes)',
  'function readRange(address container, string path, uint256 offset, uint256 length) view returns (bytes)',
  'function pathCount(address container) view returns (uint256)',
  'function pathsRange(address container, uint256 start, uint256 count) view returns (string[])',
  'function fallbackPath(address container) view returns (string)',
  'function isOpenedContainer(address container) view returns (bool)',
  'function CHUNK_MAX() view returns (uint256)',
]);

export const bindingAbi = parseAbi([
  'function bind(string name, address container, uint256 months) payable',
  'function monthlyFee() view returns (uint256)',
  'function isLive(string name, address container) view returns (bool)',
  'function isContainerLive(address container) view returns (bool)',
  'function containerPaidUntil(address container) view returns (uint256)',
]);

export const openerAbi = parseAbi([
  'function open(address circuits, uint256 tokenId) payable returns (address)',
  'function accountOf(address circuits, uint256 tokenId) view returns (address)',
  'function isOpened(address circuits, uint256 tokenId) view returns (bool)',
  'function FEE() view returns (uint256)',
]);

/**
 * The processor list of the TapeOut factory, as declared in contracts/script/lib/ITapeOut.sol. Not the SDK's
 * tapeoutFactoryAbi, which only has isCPU.
 */
export const tapeoutCpuListAbi = parseAbi([
  'function cpuCount() view returns (uint256)',
  'function cpuAt(uint256 index) view returns (address)',
]);

export interface RemoteFile {
  size: number;
  contentType: string;
  sha256: Hex;
  chunkCount: number;
}

export interface RegistryReader {
  fileInfo(path: string): Promise<RemoteFile | null>;
  readRange(path: string, offset: number, length: number): Promise<Uint8Array>;
  paths(): Promise<string[]>;
  fallbackPath(): Promise<string>;
}

function isRevert(e: unknown): boolean {
  return e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError) !== null;
}

export function registryReader(
  client: PublicClient,
  container: Address,
  registry: Address = DEWEB.registry,
): RegistryReader {
  return {
    async fileInfo(path) {
      const r = await client
        .readContract({ address: registry, abi: registryAbi, functionName: 'fileInfo', args: [container, path] })
        .catch((e: unknown) => {
          if (isRevert(e)) return null;
          throw e;
        });
      if (r === null) return null;
      const [size, contentType, sha256, , chunkCount] = r;
      if (chunkCount === 0n) return null;
      return { size: Number(size), contentType, sha256, chunkCount: Number(chunkCount) };
    },
    async readRange(path, offset, length) {
      const data = await client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: 'readRange',
        args: [container, path, BigInt(offset), BigInt(length)],
      });
      return hexToBytes(data);
    },
    async paths() {
      const count = await client.readContract({
        address: registry,
        abi: registryAbi,
        functionName: 'pathCount',
        args: [container],
      });
      const out: string[] = [];
      for (let start = 0n; start < count; start += 200n) {
        const n = count - start < 200n ? count - start : 200n;
        const page = await client.readContract({
          address: registry,
          abi: registryAbi,
          functionName: 'pathsRange',
          args: [container, start, n],
        });
        out.push(...page);
      }
      return out;
    },
    fallbackPath: () =>
      client.readContract({ address: registry, abi: registryAbi, functionName: 'fallbackPath', args: [container] }),
  };
}

export type Op =
  | {
      kind: 'putFile';
      path: string;
      contentType: string;
      sha256: Hex;
      data: Uint8Array;
      replace: boolean;
      total: number;
    }
  | { kind: 'appendChunk'; path: string; index: number; data: Uint8Array; total: number }
  | { kind: 'removeFile'; path: string }
  | { kind: 'setFallback'; path: string };

export type FileStatus = 'unchanged' | 'new' | 'changed' | 'resume';

export interface FilePlan {
  path: string;
  status: FileStatus;
  bytes: number;
  ops: Op[];
}

export interface PublishPlan {
  files: FilePlan[];
  removals: string[];
  fallback: string | null;
  ops: Op[];
}

export interface PlanOptions {
  prune: boolean;
  fallback: string;
}

/** Assets first, other HTML next, index.html last: the entry page never points at files that are not there yet. */
export function uploadRank(path: string): number {
  if (path === 'index.html') return 2;
  return /\.html?$/i.test(path) ? 1 : 0;
}

export function uploadOrder<T extends { path: string }>(files: readonly T[]): T[] {
  return [...files].sort(
    (a, b) => uploadRank(a.path) - uploadRank(b.path) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  );
}

function writeOps(f: SiteFile, from: number, replace: boolean): Op[] {
  const total = f.chunks.length;
  const ops: Op[] = [];
  if (from === 0) {
    ops.push({
      kind: 'putFile',
      path: f.path,
      contentType: f.contentType,
      sha256: f.sha256,
      data: f.chunks[0],
      replace,
      total,
    });
  }
  for (let i = Math.max(from, 1); i < total; i++) {
    ops.push({ kind: 'appendChunk', path: f.path, index: i, data: f.chunks[i], total });
  }
  return ops;
}

/** readRange in segments of four chunks. */
const SEGMENT = 4 * CHUNK_MAX;

async function storedPrefixMatches(reader: RegistryReader, f: SiteFile, size: number): Promise<boolean> {
  for (let off = 0; off < size; off += SEGMENT) {
    const len = Math.min(SEGMENT, size - off);
    const got = await reader.readRange(f.path, off, len);
    const want = f.bytes.subarray(off, off + len);
    if (got.length !== want.length || got.some((b, i) => b !== want[i])) return false;
  }
  return true;
}

export async function planFile(
  f: SiteFile,
  remote: RemoteFile | null,
  reader: RegistryReader | null,
): Promise<FilePlan> {
  const base = { path: f.path, bytes: f.bytes.length };
  if (!remote) return { ...base, status: 'new', ops: writeOps(f, 0, false) };
  const n = f.chunks.length;
  const same = remote.sha256.toLowerCase() === f.sha256 && remote.contentType === f.contentType;
  if (same && remote.chunkCount === n && remote.size === f.bytes.length)
    return { ...base, status: 'unchanged', ops: [] };
  const partial =
    same && remote.chunkCount > 0 && remote.chunkCount < n && remote.size === remote.chunkCount * CHUNK_MAX;
  if (partial && reader && (await storedPrefixMatches(reader, f, remote.size))) {
    return { ...base, status: 'resume', ops: writeOps(f, remote.chunkCount, true) };
  }
  return { ...base, status: 'changed', ops: writeOps(f, 0, true) };
}

export async function planPublish(
  local: readonly SiteFile[],
  reader: RegistryReader | null,
  o: PlanOptions,
): Promise<PublishPlan> {
  const keep = new Set(local.map((f) => f.path));
  if (!keep.has(o.fallback)) throw new Error(`fallback ${o.fallback} is not part of the site`);
  const files: FilePlan[] = [];
  for (const f of uploadOrder(local)) {
    files.push(await planFile(f, reader ? await reader.fileInfo(f.path) : null, reader));
  }
  const removals = o.prune && reader ? (await reader.paths()).filter((p) => !keep.has(p)).sort() : [];
  const current = reader ? await reader.fallbackPath() : '';
  const fallback = current === o.fallback ? null : o.fallback;
  const ops: Op[] = [
    ...files.flatMap((p) => p.ops),
    ...removals.map((path): Op => ({ kind: 'removeFile', path })),
    ...(fallback ? [{ kind: 'setFallback', path: fallback } as Op] : []),
  ];
  return { files, removals, fallback, ops };
}

/** Gas model measured on BSC with the community deweb-cli (Plan 4, decision 14). */
export const GAS = {
  create: 300_000n,
  replace: 170_000n,
  append: 90_000n,
  perByte: 222n,
  remove: 60_000n,
  fallback: 60_000n,
} as const;

export function opGas(op: Op): bigint {
  switch (op.kind) {
    case 'putFile':
      return (op.replace ? GAS.replace : GAS.create) + GAS.perByte * BigInt(op.data.length);
    case 'appendChunk':
      return GAS.append + GAS.perByte * BigInt(op.data.length);
    case 'removeFile':
      return GAS.remove;
    case 'setFallback':
      return GAS.fallback;
  }
}

export interface Estimate {
  txs: number;
  bytes: number;
  gas: bigint;
  fee: bigint;
}

export function estimate(ops: readonly Op[], gasPrice: bigint): Estimate {
  let gas = 0n;
  let bytes = 0;
  for (const op of ops) {
    gas += opGas(op);
    if (op.kind === 'putFile' || op.kind === 'appendChunk') bytes += op.data.length;
  }
  return { txs: ops.length, bytes, gas, fee: gas * gasPrice };
}

export function encodeOp(container: Address, op: Op): Hex {
  switch (op.kind) {
    case 'putFile':
      return encodeFunctionData({
        abi: registryAbi,
        functionName: 'putFile',
        args: [container, op.path, op.contentType, op.sha256, toHex(op.data)],
      });
    case 'appendChunk':
      return encodeFunctionData({
        abi: registryAbi,
        functionName: 'appendChunk',
        args: [container, op.path, BigInt(op.index), toHex(op.data)],
      });
    case 'removeFile':
      return encodeFunctionData({ abi: registryAbi, functionName: 'removeFile', args: [container, op.path] });
    case 'setFallback':
      return encodeFunctionData({ abi: registryAbi, functionName: 'setFallback', args: [container, op.path] });
  }
}

export function describeOp(op: Op): string {
  switch (op.kind) {
    case 'putFile':
      return `putFile ${op.path} chunk 1/${op.total} (${op.data.length} B${op.replace ? ', replaces the file' : ''})`;
    case 'appendChunk':
      return `appendChunk ${op.path} chunk ${op.index + 1}/${op.total} (${op.data.length} B)`;
    case 'removeFile':
      return `removeFile ${op.path}`;
    case 'setFallback':
      return `setFallback ${op.path}`;
  }
}

export interface TxSender {
  send(tx: { to: Address; data: Hex }): Promise<Hex>;
  wait(hash: Hex): Promise<'success' | 'reverted'>;
}

/**
 * The node signs: viem sends eth_sendTransaction for an address, so this works only with an unlocked or impersonated
 * anvil account. It takes an Address and never an Account, because a local account would make viem sign here and
 * send eth_sendRawTransaction.
 */
export function walletSender(wallet: WalletClient, account: Address, client: PublicClient): TxSender {
  return {
    send: (tx) => wallet.sendTransaction({ account, chain: null, to: tx.to, data: tx.data }),
    wait: async (hash) => (await client.waitForTransactionReceipt({ hash })).status,
  };
}

/** One transaction at a time: appendChunk needs the previous chunk on chain. */
export async function executePlan(
  ops: readonly Op[],
  container: Address,
  sender: TxSender,
  onOp?: (i: number, op: Op, hash: Hex) => void,
  registry: Address = DEWEB.registry,
): Promise<number> {
  for (const [i, op] of ops.entries()) {
    const hash = await sender.send({ to: registry, data: encodeOp(container, op) });
    const status = await sender.wait(hash);
    onOp?.(i, op, hash);
    if (status !== 'success') {
      throw new Error(
        `transaction ${i + 1}/${ops.length} reverted: ${describeOp(op)}. Run the dry run again: it resumes from the chain.`,
      );
    }
  }
  return ops.length;
}

/** `(address to, uint256 value, bytes data)[]`, the `calls` of an --emit file (DewebCalls.Call[] in Solidity). */
export const callsParams = parseAbiParameters('(address to, uint256 value, bytes data)[]');

/** What --emit writes and contracts/script/07_DewebPublish.s.sol reads, byte for byte (see emitJson). */
export interface CallsFile {
  chainId: number;
  registry: Address;
  binding: Address;
  container: Address;
  calls: Hex;
}

/**
 * forge script's gas_limit (foundry's default, 2^30). One run of 07_DewebPublish.s.sol executes every call of one
 * --emit file inside it, so a file must fit, and EMIT_GAS_BUDGET keeps it within half.
 */
export const SCRIPT_GAS_LIMIT = 1_073_741_824;
export const EMIT_GAS_BUDGET = SCRIPT_GAS_LIMIT / 2;

/**
 * Gas per data byte of a SiteRegistry write, from receipts (intrinsic gas included) of 24,000-byte chunks. On the
 * real registry (an X Layer fork, 21/11/2026): 228.8 for a new file's first chunk (putFile) and 223.6 for an
 * appendChunk; on MockSiteRegistry, 220.5 for an appendChunk. Rounded up; the fork test checks the real registry
 * against it.
 */
export const REGISTRY_GAS_PER_BYTE = 240;

/**
 * The script's own gas for a full --emit file, on top of the registry calls: reading and checking the file, the
 * per-call lines and the calls themselves. Measured for a 984,000-byte file of 41 calls: 108.0M (run 308.5M, calls
 * 200.5M) on MockSiteRegistry and 108.1M (run 311.6M, calls 203.5M) on the real registry. Rounded up; the anvil
 * test checks it.
 */
export const EMIT_OVERHEAD_GAS = 130_000_000;

/**
 * Data bytes in one --emit file. A bigger plan goes out in parts, and each --emit after the last broadcast resumes
 * from the chain. EMIT_OVERHEAD_GAS + EMIT_MAX_BYTES x REGISTRY_GAS_PER_BYTE = 370M, within EMIT_GAS_BUDGET (537M);
 * the full measured run is 311.6M on the real registry, 29% of SCRIPT_GAS_LIMIT.
 */
export const EMIT_MAX_BYTES = 1_000_000;

/** The first ops whose data fits in `maxBytes`, in order; never empty when there is an op. */
export function emitBatch(ops: readonly Op[], maxBytes = EMIT_MAX_BYTES): Op[] {
  const out: Op[] = [];
  let bytes = 0;
  for (const op of ops) {
    const n = op.kind === 'putFile' || op.kind === 'appendChunk' ? op.data.length : 0;
    if (out.length > 0 && bytes + n > maxBytes) break;
    out.push(op);
    bytes += n;
  }
  return out;
}

export function emitCalls(ops: readonly Op[], container: Address, chainId: number): CallsFile {
  if (ops.length === 0) throw new Error('nothing to emit: the plan is empty');
  const calls = ops.map((op) => ({ to: DEWEB.registry, value: 0n, data: encodeOp(container, op) }));
  return {
    chainId,
    registry: DEWEB.registry,
    binding: DEWEB.binding,
    container: getAddress(container),
    calls: encodeAbiParameters(callsParams, [calls]),
  };
}

/** The forge script refuses any file that is not exactly this text, so keep the key order and the layout. */
export function emitJson(f: CallsFile): string {
  const { chainId, registry, binding, container, calls } = f;
  return `${JSON.stringify({ chainId, registry, binding, container, calls }, null, 2)}\n`;
}

/** keccak256 of the file's bytes. 07_DewebPublish.s.sol prints the same value ("file keccak256") before it sends. */
export function fileKeccak(text: string): Hex {
  return keccak256(stringToBytes(text));
}

/** One argument for Git Bash, in single quotes. */
export function shQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Run from contracts/ first: it needs no key, sends nothing, and prints the file's keccak256 and every call. */
export function checkCommand(file: string, rpcUrl: string): string {
  const rel = file.slice('contracts/'.length);
  return `DEWEB_CALLS=${rel} forge script script/07_DewebPublish.s.sol --sig 'show()' --rpc-url ${shQuote(rpcUrl)}`;
}

/**
 * The broadcast, run from contracts/ in Git Bash: forge asks for the keystore password before it prints anything.
 * DEWEB_KECCAK pins the file the user checked: the script sends nothing if the file changed since.
 */
export function publishCommand(file: string, rpcUrl: string, hash: Hex): string {
  const rel = file.slice('contracts/'.length);
  return `DEWEB_CALLS=${rel} DEWEB_KECCAK=${hash} forge script script/07_DewebPublish.s.sol --rpc-url ${shQuote(rpcUrl)} --account atropyle-deployer --broadcast --slow`;
}

export type PublishMode = { kind: 'dry-run' } | { kind: 'unlocked'; from: Address } | { kind: 'emit'; file: string };

export interface PublishArgs {
  mode: PublishMode;
  dir: string;
  rpcUrl: string;
  site: string;
  container: Address | null;
  prune: boolean;
  fallback: string;
}

/**
 * The only chain --unlocked sends to: a local anvil. To rehearse a publish there, put MockSiteRegistry's code at the
 * registry address, as scripts/test/site/deweb-local.test.ts does. A fork of X Layer must keep chain 196 (the opener
 * derives container addresses from block.chainid), so --unlocked refuses it: on a fork, use --emit and a forge
 * script simulation without --broadcast.
 */
export const UNLOCKED_CHAIN_ID = 31337;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const KEY_FLAGS = ['--yes', '--key', '--private-key'] as const;

/** The key flag `arg` is, alone or as `--flag=value`. Messages name the flag only, never the value. */
export function keyFlagOf(arg: string): string | null {
  return KEY_FLAGS.find((f) => arg === f || arg.startsWith(`${f}=`)) ?? null;
}

const HEX64 = /(?:0[xX])?[0-9a-fA-F]{64,}/g;
export const HIDDEN_HEX = '<64-hex value, not shown>';

/** Hides every run of 64 or more hex digits (a private key looks like that), with or without 0x. */
export function redactHex(text: string): string {
  return text.replace(HEX64, HIDDEN_HEX);
}

const NO_KEY =
  'there is no key mode. Run --emit contracts/deweb-calls/<name>.json, then broadcast it with forge script (see docs/deployments.md)';
/** Git-ignored, and the only folder foundry.toml lets forge read for DeWEB. Subfolders hold committed fixtures. */
const CALLS_FILE = /^contracts\/deweb-calls\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;

function emitFileOf(value: string): string {
  const p = posix.normalize(value.replaceAll('\\', '/'));
  if (!CALLS_FILE.test(p) || p.includes('..')) {
    throw new Error('--emit must be contracts/deweb-calls/<name>.json (a git-ignored folder that forge may read)');
  }
  return p;
}

function isLoopback(u: URL): boolean {
  return (
    (u.protocol === 'http:' || u.protocol === 'https:') &&
    u.username === '' &&
    u.password === '' &&
    LOOPBACK.has(u.hostname)
  );
}

export function parsePublishArgs(argv: readonly string[]): PublishArgs {
  let dry = false;
  let unlocked: string | undefined;
  let emit: string | undefined;
  let container: string | undefined;
  const out = {
    dir: 'site-dist/deweb',
    rpcUrl: 'https://rpc.xlayer.tech',
    site: 'deployments/deweb.json',
    prune: false,
    fallback: 'index.html',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    const key = keyFlagOf(a);
    if (key) throw new Error(`${key}: ${NO_KEY}`);
    if (a === '--dry-run') dry = true;
    else if (a === '--unlocked') unlocked = value();
    else if (a === '--emit') emit = emitFileOf(value());
    else if (a === '--dir') out.dir = value();
    else if (a === '--rpc') out.rpcUrl = value();
    else if (a === '--site') out.site = value();
    else if (a === '--container') container = value();
    else if (a === '--prune') out.prune = true;
    else if (a === '--fallback') out.fallback = value();
    else throw new Error(`unknown argument: ${redactHex(a)}`);
  }
  if ([dry, unlocked !== undefined, emit !== undefined].filter(Boolean).length > 1) {
    throw new Error('choose one of --dry-run, --unlocked, --emit');
  }
  let url: URL;
  try {
    url = new URL(out.rpcUrl);
  } catch {
    throw new Error(`--rpc is not a URL: ${redactHex(out.rpcUrl)}`);
  }
  if (container !== undefined && !isAddress(container, { strict: false })) {
    throw new Error(`--container is not an address: ${redactHex(container)}`);
  }

  let mode: PublishMode = { kind: 'dry-run' };
  if (unlocked !== undefined) {
    if (!isAddress(unlocked, { strict: false })) {
      throw new Error(`--unlocked is not an address: ${redactHex(unlocked)}`);
    }
    if (!isLoopback(url)) {
      throw new Error(
        '--unlocked only sends to a local anvil: --rpc must be http://127.0.0.1, http://localhost or http://[::1]',
      );
    }
    mode = { kind: 'unlocked', from: getAddress(unlocked.toLowerCase()) };
  } else if (emit !== undefined) {
    mode = { kind: 'emit', file: emit };
  }
  return { mode, ...out, container: container ? getAddress(container.toLowerCase()) : null };
}

/** The second half of the --unlocked guard, after eth_chainId. Echoes the URL with 64-hex runs hidden. */
export function unlockedChainProblem(rpcUrl: string, chainId: number): string | null {
  if (chainId === UNLOCKED_CHAIN_ID) return null;
  return `refusing --unlocked: ${redactHex(rpcUrl)} is chain ${chainId}; --unlocked sends only to a local anvil on chain ${UNLOCKED_CHAIN_ID}. To rehearse, run anvil with MockSiteRegistry at the registry address (see scripts/test/site/deweb-local.test.ts), or on a chain-196 fork run --emit and a forge script simulation without --broadcast`;
}

/** The processor number in `<#ID>.2.<n>.tape` is the factory index; a new processor sits near the end. */
export async function findCpuIndex(
  client: PublicClient,
  cpu: Address,
  factory: Address = DEWEB.tapeoutFactory,
): Promise<number> {
  const n = await client.readContract({ address: factory, abi: tapeoutCpuListAbi, functionName: 'cpuCount' });
  for (let i = n; i > 0n; i--) {
    const c = await client.readContract({
      address: factory,
      abi: tapeoutCpuListAbi,
      functionName: 'cpuAt',
      args: [i - 1n],
    });
    if (c.toLowerCase() === cpu.toLowerCase()) return Number(i - 1n);
  }
  throw new Error(`${cpu} is not a TapeOut processor`);
}
