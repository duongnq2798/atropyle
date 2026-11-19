import {
  BaseError,
  ChainMismatchError,
  ContractFunctionRevertedError,
  decodeErrorResult,
  type Hex,
  HttpRequestError,
  TimeoutError,
  UserRejectedRequestError,
} from 'viem';
import { revertAbi } from './abi/index';
import { toJson } from './json';
import { errorDocsUrl } from './links';

export const ERROR_INFO = {
  NOT_OWNER: {
    message: 'Only the vault owner can do this.',
    hint: 'Sign with the owner wallet shown by `atropyle status`.',
  },
  NOT_GUARDIAN: {
    message: 'Only a guardian of this vault can do this.',
    hint: 'Check the guardian list with `atropyle status <vault>`.',
  },
  ALREADY_RELEASED: {
    message: 'The vault has already released its assets.',
    hint: 'Only `distribute` still works after release.',
  },
  DRILL_EXPIRED: {
    message: 'This Drill vault has expired.',
    hint: 'Drill vaults live 7 days. Create a new Drill to practise again.',
  },
  INVALID_HEIRS: {
    message: 'The heir list breaks the vault rules.',
    hint: '1 to 5 distinct heirs, none is the owner or the vault itself, each share above 0, shares sum to 10000 bps, every asset points to an existing heir.',
  },
  INVALID_GUARDIANS: {
    message: 'The guardian list breaks the vault rules.',
    hint: 'At most 5 distinct guardians, none is the owner or the vault itself, k at most the number of guardians, and recovery needs k of at least 1.',
  },
  INVALID_TIMING: {
    message: 'The timing breaks the vault rules.',
    hint: 'Period at least 1 day and window at least 3 days (Drill: 60 s each); threshold 1 to 15 periods.',
  },
  INVALID_ASSETS: {
    message: 'The asset list breaks the vault rules.',
    hint: 'At most 20 assets; each token is a contract; ERC-20 entries use id 0; no duplicate (token, id); the heir index exists.',
  },
  INVALID_TARGET: {
    message: 'This recovery target is not allowed.',
    hint: 'The target cannot be the owner, the vault itself or a guardian.',
  },
  RECOVERY_DISABLED: {
    message: 'Wallet recovery is turned off for this vault.',
    hint: 'The owner can turn it on with setGuardians.',
  },
  UNSUPPORTED_FEE_TOKEN: {
    message: 'The factory does not accept this fee token.',
    hint: 'Pay with USDT0, USDC or USDG, or create a free Drill.',
  },
  NOT_VAULT: {
    message: 'This address is not a vault created by the Atropyle factory.',
    hint: 'Check the address. Only factory vaults are trusted.',
  },
  BAD_POLICY_OUTPUT: {
    message: 'The policy circuit returned a non-canonical state.',
    hint: 'This cannot happen with the verified circuit. Run `atropyle verify` and report it.',
  },
  INSUFFICIENT_GAS: {
    message: 'The transaction gas cannot cover the next capped transfer of the sweep.',
    hint: 'Send distribute again with a higher gas limit: before each transfer the vault needs its full cap (up to 500,000 gas) plus a margin.',
  },
  REENTRANCY: {
    message: 'The vault rejected a re-entrant call.',
    hint: 'A token tried to call back into the vault. Remove that asset.',
  },
  ALREADY_INITIALIZED: {
    message: 'This vault is already initialized.',
    hint: 'Vaults are created only through the factory.',
  },
  FEE_TRANSFER_FAILED: {
    message: 'The creation fee could not be transferred.',
    hint: 'Approve the fee token for the factory and keep enough balance, or create a free Drill.',
  },
  WRONG_CHAIN: {
    message: 'The wallet or RPC is on a different chain.',
    hint: 'Switch to X Layer (chain 196), or pass the right --chain.',
  },
  WRONG_ACCOUNT: {
    message: 'The connected wallet is not the account that must sign this step.',
    hint: 'Switch to the account shown in `from`.',
  },
  USER_REJECTED: {
    message: 'The request was rejected in the wallet.',
    hint: 'Nothing was sent. Start again when ready.',
  },
  RPC_RATE_LIMITED: {
    message: 'The RPC endpoint is rate limiting requests.',
    hint: 'Wait a moment, or pass another endpoint with --rpc.',
  },
  RPC_UNAVAILABLE: {
    message: 'The RPC endpoint did not respond.',
    hint: 'Check your connection, or pass another endpoint with --rpc.',
  },
  RPC_DISAGREEMENT: {
    message: 'Two independent RPC operators returned different data for the same block.',
    hint: 'Do not trust either answer. Retry later or compare with another endpoint.',
  },
  QUORUM_UNAVAILABLE: {
    message: 'A second independent RPC operator was not reachable for verification.',
    hint: 'Retry later, or accept a single operator explicitly with --single-rpc.',
  },
  POLICY_MISMATCH: {
    message: 'The on-chain policy does not match the audited source.',
    hint: 'Do not use this deployment. Report it through SECURITY.md.',
  },
  POLICY_UNAVAILABLE: {
    message: 'The policy netlist is not available on this chain.',
    hint: 'The local devnet uses a mock CPU without a netlist. Use `npm run devnet:fork` or mainnet to verify.',
  },
  DEPLOYMENT_MISSING: {
    message: 'There is no Atropyle deployment for this chain yet.',
    hint: 'Use chain "local" with `npm run devnet`, or pass a Deployment object.',
  },
  DEPLOYMENT_INVALID: {
    message: 'The deployment description is malformed.',
    hint: 'Regenerate it with the scripts in scripts/.',
  },
  PLAN_INVALID: { message: 'The plan is invalid.', hint: 'Fix the listed issues; each has a path and a code.' },
  INVALID_ADDRESS: {
    message: 'The value is not a valid address.',
    hint: 'Use a 0x address with 40 hex characters and a correct checksum.',
  },
  INVALID_OPTIONS: {
    message: 'An SDK option is invalid.',
    hint: 'Check the createAtropyle options against the API reference.',
  },
  LINK_INVALID: {
    message: 'The signing link is malformed or targets an unknown contract.',
    hint: 'Only open signing links you created yourself.',
  },
  NOT_FOUND: { message: 'The API has no resource at this path.', hint: 'Check the path against the API reference.' },
  RATE_LIMITED: {
    message: 'The API is rate limiting this client.',
    hint: 'Wait for the time in Retry-After, then try again.',
  },
  UNAUTHORIZED: {
    message: 'The request carried missing or wrong credentials.',
    hint: 'Only the configured caller can use this endpoint.',
  },
  FORBIDDEN: {
    message: 'The API does not accept requests from this origin.',
    hint: 'Call it from a local client or the Atropyle web app.',
  },
  NOT_READY: {
    message: 'The API has no data for this yet.',
    hint: 'The first background run has not finished. Wait for Retry-After.',
  },
  UNKNOWN: { message: 'Something unexpected went wrong.', hint: 'Run again with --verbose and report the output.' },
} as const satisfies Record<string, { message: string; hint: string }>;

export type ErrorCode = keyof typeof ERROR_INFO;
export const ERROR_CODES = Object.keys(ERROR_INFO) as ErrorCode[];

export interface AtropyleErrorJson {
  code: ErrorCode;
  message: string;
  hint: string;
  docsUrl: string;
  details?: Record<string, unknown>;
}

export interface AtropyleErrorOptions {
  message?: string;
  hint?: string;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class AtropyleError extends Error {
  override readonly name = 'AtropyleError';
  readonly code: ErrorCode;
  readonly hint: string;
  readonly docsUrl: string;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, opts: AtropyleErrorOptions = {}) {
    super(opts.message ?? ERROR_INFO[code].message, { cause: opts.cause });
    this.code = code;
    this.hint = opts.hint ?? ERROR_INFO[code].hint;
    this.docsUrl = errorDocsUrl(code);
    if (opts.details) this.details = opts.details;
  }

  toJSON(): AtropyleErrorJson {
    const j: AtropyleErrorJson = { code: this.code, message: this.message, hint: this.hint, docsUrl: this.docsUrl };
    // Details may hold bigint (revert arguments); JSON.stringify throws on those.
    if (this.details) j.details = toJson(this.details) as Record<string, unknown>;
    return j;
  }
}

export function isAtropyleError(e: unknown): e is AtropyleError {
  return e instanceof AtropyleError;
}

/** Failures of the RPC layer: callers rethrow them instead of reading them as an answer from the contract. */
export const TRANSPORT_ERROR_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'RPC_RATE_LIMITED',
  'RPC_UNAVAILABLE',
  'RPC_DISAGREEMENT',
  'QUORUM_UNAVAILABLE',
]);

export function isTransportError(e: AtropyleError): boolean {
  return TRANSPORT_ERROR_CODES.has(e.code);
}

const REVERTS: Record<string, ErrorCode> = {
  NotOwner: 'NOT_OWNER',
  NotGuardian: 'NOT_GUARDIAN',
  AlreadyReleased: 'ALREADY_RELEASED',
  DrillExpired: 'DRILL_EXPIRED',
  InvalidHeirs: 'INVALID_HEIRS',
  InvalidGuardians: 'INVALID_GUARDIANS',
  InvalidTiming: 'INVALID_TIMING',
  InvalidAssets: 'INVALID_ASSETS',
  InvalidTarget: 'INVALID_TARGET',
  RecoveryDisabled: 'RECOVERY_DISABLED',
  UnsupportedFeeToken: 'UNSUPPORTED_FEE_TOKEN',
  NotVault: 'NOT_VAULT',
  BadPolicyOutput: 'BAD_POLICY_OUTPUT',
  Reentrancy: 'REENTRANCY',
  AlreadyInitialized: 'ALREADY_INITIALIZED',
  InsufficientGas: 'INSUFFICIENT_GAS',
  ERC20InsufficientAllowance: 'FEE_TRANSFER_FAILED',
  ERC20InsufficientBalance: 'FEE_TRANSFER_FAILED',
  SafeERC20FailedOperation: 'FEE_TRANSFER_FAILED',
};

function fromRevert(errorName: string, args: readonly unknown[] | undefined, cause?: unknown): AtropyleError | null {
  const code = REVERTS[errorName];
  if (!code) return null;
  return new AtropyleError(code, { cause, details: { error: errorName, args: toJson(args ?? []) } });
}

export function decodeRevertData(data: Hex): AtropyleError | null {
  try {
    const r = decodeErrorResult({ abi: revertAbi, data });
    return fromRevert(r.errorName, r.args as readonly unknown[] | undefined);
  } catch {
    return null;
  }
}

/** JSON-RPC codes that mean the endpoint, not the contract, failed (EIP-1474). */
const RPC_LIMIT_EXCEEDED = -32005;
const RPC_RESOURCE_UNAVAILABLE = -32002;

function hasRpcCode(e: BaseError, code: number): boolean {
  return e.walk((x) => (x as { code?: unknown } | null)?.code === code) !== null;
}

/**
 * First numeric HTTP status in the cause chain. For a non-2xx response whose body is a JSON-RPC error, viem 2.58
 * throws RpcRequestError with the status attached; only a body that is not JSON-RPC gives HttpRequestError.
 */
function httpStatusOf(e: BaseError): number | undefined {
  const hit = e.walk((x) => typeof (x as { status?: unknown } | null)?.status === 'number');
  return (hit as { status: number } | null)?.status;
}

const REVERT_HEX = /^0x[0-9a-fA-F]{8,}$/;

/**
 * Every hex string in the cause chain that could be revert data: the `data` of any error, and the `raw` of
 * viem's ContractFunctionRevertedError. The latter is the only place the bytes survive when the ABI of the call
 * does not know the error (for example a vault error raised through a factory call), because viem then drops the
 * original RPC error from the chain.
 */
function revertCandidates(e: BaseError): Hex[] {
  const out: Hex[] = [];
  e.walk((x) => {
    for (const key of ['data', 'raw'] as const) {
      const v = (x as Record<string, unknown> | null)?.[key];
      if (typeof v === 'string' && REVERT_HEX.test(v)) out.push(v as Hex);
    }
    return false;
  });
  return out;
}

/** A URL can carry an API key (`?dkey=...`), so no URL may reach a message. */
const URL_IN_TEXT = /[a-z][a-z0-9+.-]*:\/\/\S+/gi;

/**
 * Message for an error we cannot classify. viem's own `message` repeats the full RPC URL and the request body, so
 * for viem errors only `shortMessage` and `details` are used; the original stays reachable through `cause`.
 */
function unknownMessage(e: unknown): string {
  let text: string;
  if (e instanceof BaseError) {
    text = e.details && e.details !== e.shortMessage ? `${e.shortMessage} (${e.details})` : e.shortMessage;
  } else {
    text = e instanceof Error ? e.message : String(e);
  }
  return text.replace(URL_IN_TEXT, '<url>').slice(0, 500) || ERROR_INFO.UNKNOWN.message;
}

/** Turns any thrown value (viem, wallet, contract revert) into an AtropyleError. */
export function decodeError(e: unknown): AtropyleError {
  if (e instanceof AtropyleError) return e;
  if (e instanceof BaseError) {
    // viem wraps errors thrown inside a transport (the quorum transport throws AtropyleError).
    const inner = e.walk((x) => x instanceof AtropyleError);
    if (inner instanceof AtropyleError) return inner;
    // A throttled or unavailable endpoint is a transport failure. Check before any revert data is read.
    if (hasRpcCode(e, RPC_LIMIT_EXCEEDED)) return new AtropyleError('RPC_RATE_LIMITED', { cause: e });
    if (hasRpcCode(e, RPC_RESOURCE_UNAVAILABLE)) return new AtropyleError('RPC_UNAVAILABLE', { cause: e });
    const status = httpStatusOf(e);
    if (status === 429) return new AtropyleError('RPC_RATE_LIMITED', { cause: e });
    if (status !== undefined && status >= 500 && status <= 599)
      return new AtropyleError('RPC_UNAVAILABLE', { cause: e });
    const reverted = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName;
      const mapped = name ? fromRevert(name, reverted.data?.args as readonly unknown[] | undefined, e) : null;
      if (mapped) return mapped;
    }
    for (const raw of revertCandidates(e)) {
      const d = decodeRevertData(raw);
      if (d) return new AtropyleError(d.code, { cause: e, details: d.details });
    }
    if (e.walk((x) => x instanceof UserRejectedRequestError)) return new AtropyleError('USER_REJECTED', { cause: e });
    if (e.walk((x) => x instanceof ChainMismatchError)) return new AtropyleError('WRONG_CHAIN', { cause: e });
    if (e.walk((x) => x instanceof HttpRequestError || x instanceof TimeoutError)) {
      return new AtropyleError('RPC_UNAVAILABLE', { cause: e });
    }
  }
  return new AtropyleError('UNKNOWN', { cause: e, message: unknownMessage(e) });
}
