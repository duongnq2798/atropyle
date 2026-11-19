import {
  ContractFunctionRevertedError,
  createPublicClient,
  custom,
  encodeErrorResult,
  HttpRequestError,
  LimitExceededRpcError,
  ResourceUnavailableRpcError,
  RpcRequestError,
  UnknownRpcError,
  UserRejectedRequestError,
} from 'viem';
import { describe, expect, it } from 'vitest';
import { revertAbi } from '../../src/abi/index';
import {
  AtropyleError,
  decodeError,
  decodeRevertData,
  ERROR_CODES,
  ERROR_INFO,
  isTransportError,
} from '../../src/index';

const CASES: Array<[string, string, readonly unknown[]]> = [
  ['NotOwner', 'NOT_OWNER', []],
  ['NotGuardian', 'NOT_GUARDIAN', []],
  ['AlreadyReleased', 'ALREADY_RELEASED', []],
  ['DrillExpired', 'DRILL_EXPIRED', []],
  ['InvalidHeirs', 'INVALID_HEIRS', []],
  ['InvalidGuardians', 'INVALID_GUARDIANS', []],
  ['InvalidTiming', 'INVALID_TIMING', []],
  ['InvalidAssets', 'INVALID_ASSETS', []],
  ['InvalidTarget', 'INVALID_TARGET', []],
  ['RecoveryDisabled', 'RECOVERY_DISABLED', []],
  ['UnsupportedFeeToken', 'UNSUPPORTED_FEE_TOKEN', []],
  ['NotVault', 'NOT_VAULT', []],
  ['BadPolicyOutput', 'BAD_POLICY_OUTPUT', [2]],
  ['Reentrancy', 'REENTRANCY', []],
  ['AlreadyInitialized', 'ALREADY_INITIALIZED', []],
  ['InsufficientGas', 'INSUFFICIENT_GAS', []],
  ['ERC20InsufficientAllowance', 'FEE_TRANSFER_FAILED', ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 0n, 1990000n]],
  ['SafeERC20FailedOperation', 'FEE_TRANSFER_FAILED', ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8']],
];

describe('decodeRevertData', () => {
  it.each(CASES)('%s → %s', (errorName, code, args) => {
    // biome-ignore lint/suspicious/noExplicitAny: table-driven test over a union ABI
    const data = encodeErrorResult({ abi: revertAbi, errorName: errorName as any, args: args as any });
    const e = decodeRevertData(data);
    expect(e?.code).toBe(code);
    expect(e?.details?.error).toBe(errorName);
  });

  it('keeps the argument of BadPolicyOutput', () => {
    const data = encodeErrorResult({ abi: revertAbi, errorName: 'BadPolicyOutput', args: [6] });
    expect(decodeRevertData(data)?.details?.args).toEqual([6]);
  });

  it('returns null for unknown selectors', () => {
    expect(decodeRevertData('0xdeadbeef')).toBeNull();
    expect(decodeRevertData('0x')).toBeNull();
  });
});

describe('decodeError', () => {
  it('maps transport and wallet failures', () => {
    expect(decodeError(new HttpRequestError({ url: 'https://rpc.example', status: 429 })).code).toBe(
      'RPC_RATE_LIMITED',
    );
    expect(decodeError(new HttpRequestError({ url: 'https://rpc.example', status: 503 })).code).toBe('RPC_UNAVAILABLE');
    expect(decodeError(new UserRejectedRequestError(new Error('nope'))).code).toBe('USER_REJECTED');
    expect(decodeError(new Error('boom')).code).toBe('UNKNOWN');
    const own = new AtropyleError('NOT_VAULT');
    expect(decodeError(own)).toBe(own);
    const wrapped = new UnknownRpcError(new AtropyleError('RPC_DISAGREEMENT'));
    expect(decodeError(wrapped).code).toBe('RPC_DISAGREEMENT');
    expect(isTransportError(decodeError(wrapped))).toBe(true);
    expect(isTransportError(new AtropyleError('NOT_OWNER'))).toBe(false);
  });

  it('serializes with message, hint and docs link', () => {
    const json = new AtropyleError('DRILL_EXPIRED').toJSON();
    expect(json).toEqual({
      code: 'DRILL_EXPIRED',
      message: ERROR_INFO.DRILL_EXPIRED.message,
      hint: ERROR_INFO.DRILL_EXPIRED.hint,
      docsUrl: 'https://duongnq2798.github.io/atropyle/docs/reference/errors.html#drill_expired',
    });
  });

  it('every code has an English message and hint', () => {
    expect(ERROR_CODES.length).toBe(38);
    for (const c of ERROR_CODES) {
      expect(ERROR_INFO[c].message).toMatch(/\.$/);
      expect(ERROR_INFO[c].hint.length).toBeGreaterThan(10);
    }
  });
});

const NOT_OWNER_DATA = encodeErrorResult({ abi: revertAbi, errorName: 'NotOwner' });
const rpcFailure = (code: number) =>
  new RpcRequestError({
    body: { method: 'eth_call' },
    error: { code, message: 'rpc failure' },
    url: 'https://rpc.example',
  });

describe('decodeError JSON-RPC codes', () => {
  it('maps -32005 to RPC_RATE_LIMITED and -32002 to RPC_UNAVAILABLE, both transport errors', () => {
    const limited = decodeError(new LimitExceededRpcError(rpcFailure(-32005)));
    expect(limited.code).toBe('RPC_RATE_LIMITED');
    expect(isTransportError(limited)).toBe(true);
    const unavailable = decodeError(new ResourceUnavailableRpcError(rpcFailure(-32002)));
    expect(unavailable.code).toBe('RPC_UNAVAILABLE');
    expect(isTransportError(unavailable)).toBe(true);
  });

  it('reads the code from the bare RPC error and from an error nested deeper in the cause chain', () => {
    expect(decodeError(rpcFailure(-32005)).code).toBe('RPC_RATE_LIMITED');
    expect(decodeError(rpcFailure(-32002)).code).toBe('RPC_UNAVAILABLE');
    expect(decodeError(new UnknownRpcError(new LimitExceededRpcError(rpcFailure(-32005)))).code).toBe(
      'RPC_RATE_LIMITED',
    );
  });

  it('never reads such an error as a revert, even when it carries revert data', () => {
    for (const [code, expected] of [
      [-32005, 'RPC_RATE_LIMITED'],
      [-32002, 'RPC_UNAVAILABLE'],
    ] as const) {
      const e = Object.assign(rpcFailure(code), { data: NOT_OWNER_DATA });
      const decoded = decodeError(e);
      expect(decoded.code).toBe(expected);
      expect(isTransportError(decoded)).toBe(true);
    }
  });

  it('keeps ordinary RPC errors out of the transport codes', () => {
    expect(decodeError(rpcFailure(-32000)).code).toBe('UNKNOWN');
    expect(isTransportError(decodeError(rpcFailure(-32000)))).toBe(false);
  });

  it('maps a rate limit thrown through a real client call', async () => {
    const client = createPublicClient({
      transport: custom(
        {
          request: async () => {
            throw Object.assign(new Error('limit exceeded'), { code: -32005 });
          },
        },
        { retryCount: 0 },
      ),
    });
    const err = await client.getBlockNumber().catch((e: unknown) => e);
    expect(decodeError(err).code).toBe('RPC_RATE_LIMITED');
  });
});

describe('decodeError revert data', () => {
  it('decodes a revert through a real client call whose ABI does not know the error', async () => {
    const abiWithoutErrors = [
      { type: 'function', name: 'f', stateMutability: 'view', inputs: [], outputs: [] },
    ] as const;
    const client = createPublicClient({
      transport: custom(
        {
          request: async () => {
            throw Object.assign(new Error('execution reverted'), { code: 3, data: NOT_OWNER_DATA });
          },
        },
        { retryCount: 0 },
      ),
    });
    const err = await client
      .readContract({ abi: abiWithoutErrors, address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', functionName: 'f' })
      .catch((e: unknown) => e);
    const decoded = decodeError(err);
    expect(decoded.code).toBe('NOT_OWNER');
    expect(decoded.details?.error).toBe('NotOwner');
  });

  it('scans the raw revert data when it is the only place the bytes survive', () => {
    // The call ABI lacks NotOwner and viem kept no cause: only ContractFunctionRevertedError.raw holds the data.
    const reverted = new ContractFunctionRevertedError({ abi: [], data: NOT_OWNER_DATA, functionName: 'f' });
    expect(reverted.data).toBeUndefined();
    const decoded = decodeError(reverted);
    expect(decoded.code).toBe('NOT_OWNER');
    expect(decoded.details?.error).toBe('NotOwner');
  });

  it('tries every candidate in the chain and ignores unknown selectors', () => {
    const e = Object.assign(new UnknownRpcError(new Error('x')), { data: '0xdeadbeef' });
    expect(decodeError(e).code).toBe('UNKNOWN');
    const nested = new UnknownRpcError(Object.assign(new Error('inner'), { data: NOT_OWNER_DATA }));
    expect(decodeError(Object.assign(nested, { data: '0xdeadbeef' })).code).toBe('NOT_OWNER');
    const unknownRaw = new ContractFunctionRevertedError({ abi: [], data: '0xdeadbeef', functionName: 'f' });
    expect(decodeError(unknownRaw).code).toBe('UNKNOWN');
  });
});
