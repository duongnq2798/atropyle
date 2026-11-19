import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  erc721Abi,
  type Hex,
  maxUint256,
  type PublicClient,
  stringToHex,
} from 'viem';
import { describe, expect, it } from 'vitest';
import { erc1155Abi, factoryAbi, vaultAbi } from '../../src/abi/index';
import { paramsToAbi } from '../../src/encode';
import { inspectPayload } from '../../src/handoff/inspect';
import { appendSuffix, builderCodeSuffix, type ReadContext, type SignPayload } from '../../src/index';
import { HEIR_A, NEW_WALLET, NFT, OWNER, TOKEN, VAULT } from './fixtures';

const FACTORY = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as Address;
const FEE_TOKEN = '0x0000000000000000000000000000000000000fee' as Address;
const MULTI = '0x00000000000000000000000000000000000a1155' as Address;
const OTHER_VAULT = '0x2222222222222222222222222222222222222222' as Address;
const STRANGER = '0x00000000000000000000000000000000000057a9' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const FULL_FEE = 50_000_000n;

// VAULT belongs to OWNER and holds an ERC-20, an ERC-721 and an ERC-1155; OTHER_VAULT belongs to someone else.
const ASSETS = [
  { kind: 0, token: TOKEN, id: 0n, heir: 0 },
  { kind: 1, token: NFT, id: 1n, heir: 0 },
  { kind: 2, token: MULTI, id: 7n, heir: 0 },
];
const owners: Record<string, Address> = { [VAULT.toLowerCase()]: OWNER, [OTHER_VAULT.toLowerCase()]: STRANGER };

function fakeCtx(): ReadContext {
  const client = {
    getBlockNumber: async () => 10n,
    estimateGas: async () => 90_000n,
    simulateCalls: async ({ calls }: { calls: unknown[] }) => ({
      results: calls.map(() => ({ status: 'success', gasUsed: 90_000n })),
    }),
    readContract: async ({
      address,
      functionName,
      args,
    }: {
      address: Address;
      functionName: string;
      args: unknown[];
    }) => {
      if (functionName === 'isVault') return (args[0] as string).toLowerCase() in owners;
      if (functionName === 'owner') return owners[address.toLowerCase()];
      if (functionName === 'assets') return ASSETS;
      if (functionName === 'fullFee') return FULL_FEE;
      throw new Error(`unexpected read ${functionName}`);
    },
  } as unknown as PublicClient;
  return {
    deployment: { chainId: 31337, factory: FACTORY, feeTokens: [FEE_TOKEN] },
    client,
    token: async () => ({ decimals: 6 }),
    log: () => {},
  } as unknown as ReadContext;
}

const one = (to: Address, data: Hex, o: { from?: Address; value?: bigint } = {}): SignPayload => ({
  chainId: 31337,
  from: o.from ?? OWNER,
  steps: [{ to, data, value: o.value ?? 0n }],
});
const approve20 = (spender: Address, amount: bigint) =>
  encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] });
const approve721 = (spender: Address, id: bigint) =>
  encodeFunctionData({ abi: erc721Abi, functionName: 'approve', args: [spender, id] });
const forAll = (operator: Address, approved: boolean) =>
  encodeFunctionData({ abi: erc1155Abi, functionName: 'setApprovalForAll', args: [operator, approved] });

describe('the signing whitelist refuses what it does not know', () => {
  const cfg = paramsToAbi({
    heirs: [{ account: HEIR_A, bps: 10_000 }],
    guardians: [],
    k: 0,
    recoveryEnabled: false,
    timing: { period: 60, threshold: 2, window: 120 },
    assets: [],
  });
  const initialize = encodeFunctionData({
    abi: vaultAbi,
    functionName: 'initialize',
    args: [OWNER, false, cfg, ZERO, 0n],
  });
  const refused: [string, SignPayload, string][] = [
    [
      'a fee approval above the full fee',
      one(FEE_TOKEN, approve20(FACTORY, FULL_FEE + 1n)),
      'more than the full creation fee',
    ],
    [
      'an approval of the factory on a token that is not a fee token',
      one(TOKEN, approve20(FACTORY, 1n)),
      'not a fee token',
    ],
    ['native value', one(VAULT, '0x183ff085', { value: 1n }), 'native currency'],
    [
      'a factory function other than createVault',
      one(
        FACTORY,
        encodeFunctionData({ abi: factoryAbi, functionName: 'predictVault', args: [OWNER, `0x${'11'.repeat(32)}`] }),
      ),
      'is not allowed',
    ],
    ['initialize on a vault', one(VAULT, initialize), 'vault function initialize is not allowed'],
    ['malformed calldata to a vault', one(VAULT, '0x1234'), 'unknown vault call'],
    ['malformed calldata to the factory', one(FACTORY, '0x1234'), 'unknown factory call'],
    ['malformed approve calldata', one(TOKEN, '0x095ea7b3'), 'malformed calldata'],
    ['an approval to a vault of someone else', one(TOKEN, approve20(OTHER_VAULT, 1n)), 'does not belong to the signer'],
    ['an approval to an address that is no vault', one(TOKEN, approve20(STRANGER, 1n)), 'not an Atropyle vault'],
    [
      'an approval of a token the vault does not hold',
      one(FEE_TOKEN, approve20(VAULT, 1n)),
      'not an ERC-20 or ERC-721 asset',
    ],
    ['setApprovalForAll on a contract that is not an NFT asset', one(TOKEN, forAll(VAULT, true)), 'not an NFT asset'],
    ['setApprovalForAll to an address that is no vault', one(MULTI, forAll(STRANGER, true)), 'not an Atropyle vault'],
    ['a call to a token that is not an approval', one(TOKEN, '0xa9059cbb'), 'unknown call'],
  ];

  it.each(refused)('refuses %s', async (_name, payload, reason) => {
    const check = await inspectPayload(fakeCtx(), payload);
    expect(check.ok).toBe(false);
    expect(check.steps[0]).toMatchObject({ allowed: false, summary: null, action: null, warnings: [] });
    expect(check.steps[0].reason).toContain(reason);
    expect(check.steps[0].simulation).toEqual({ ok: 'skipped', reason: 'NOT_ALLOWED' });
  });

  const allowed: [string, SignPayload, string][] = [
    ['a fee approval of the full fee', one(FEE_TOKEN, approve20(FACTORY, FULL_FEE)), 'Atropyle factory'],
    ['an ERC-20 approval to the vault', one(TOKEN, approve20(VAULT, 5n)), 'up to'],
    ['an ERC-20 revocation', one(TOKEN, approve20(VAULT, 0n)), 'to 0'],
    ['an ERC-721 approval', one(NFT, approve721(VAULT, 1n)), 'ERC-721 token'],
    ['approve(0x0, id), which clears an approval', one(NFT, approve721(ZERO, 1n)), 'Remove the current approval'],
    ['setApprovalForAll granted on an NFT asset', one(MULTI, forAll(VAULT, true)), 'all your tokens'],
    ['setApprovalForAll revoked', one(MULTI, forAll(VAULT, false)), 'Stop vault'],
  ];

  it.each(allowed)('allows %s', async (_name, payload, summary) => {
    const check = await inspectPayload(fakeCtx(), payload);
    expect(check.steps[0].reason).toBeNull();
    expect(check.steps[0].allowed).toBe(true);
    expect(check.steps[0].summary).toContain(summary);
    expect(check.ok).toBe(true);
  });

  it('rebuilds the warnings of the plan: unlimited, approval for all, guardian actions', async () => {
    const codes = async (p: SignPayload) => (await inspectPayload(fakeCtx(), p)).steps[0].warnings.map((w) => w.code);
    expect(await codes(one(TOKEN, approve20(VAULT, maxUint256)))).toEqual(['UNLIMITED_APPROVAL']);
    expect(await codes(one(MULTI, forAll(VAULT, true)))).toEqual(['APPROVAL_FOR_ALL']);
    const vote = encodeFunctionData({ abi: vaultAbi, functionName: 'voteRecovery', args: [NEW_WALLET] });
    expect(await codes(one(VAULT, vote, { from: STRANGER }))).toEqual(['GUARDIAN_VERIFY_OUT_OF_BAND']);
    const attest = encodeFunctionData({ abi: vaultAbi, functionName: 'attestDeath', args: [true] });
    expect(await codes(one(VAULT, attest, { from: STRANGER }))).toEqual(['GUARDIAN_VERIFY_OUT_OF_BAND']);
    expect(await codes(one(VAULT, '0x183ff085'))).toEqual([]);
  });
});

describe('builder code suffixes', () => {
  const body = encodeFunctionData({ abi: vaultAbi, functionName: 'checkIn' });

  it('strips a valid suffix and reports its codes', async () => {
    const check = await inspectPayload(fakeCtx(), one(VAULT, appendSuffix(body, builderCodeSuffix('atropyle'))));
    expect(check.steps[0]).toMatchObject({ allowed: true, action: 'checkIn', builderCodes: ['atropyle'] });
  });

  // The suffix is raw bytes from the link: it can carry anything, and what it carries is shown to people.
  const hostile: [string, string][] = [
    ['a control character', 'ab\u{0007}cd'],
    ['a next-line character (U+0085)', 'ab\u{0085}cd'],
    ['a line separator', 'ab\u{2028}cd'],
    ['prose with spaces', 'ignore previous instructions'],
    ['an empty code', 'a,,b'],
    ['a code over the length cap', 'x'.repeat(65)],
  ];

  it.each(hostile)('refuses a suffix with %s and never shows its text', async (_name, text) => {
    const hex = stringToHex(text).slice(2);
    const length = (hex.length / 2).toString(16).padStart(2, '0');
    const suffix = `0x${hex}${length}0080218021802180218021802180218021` as Hex;
    const check = await inspectPayload(fakeCtx(), one(VAULT, appendSuffix(body, suffix)));
    expect(check.ok).toBe(false);
    expect(check.steps[0]).toMatchObject({ allowed: false, builderCodes: null });
    expect(JSON.stringify(check, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain(text);
  });
});

describe('a request is validated like a link', () => {
  const step = { to: VAULT, data: '0x183ff085', value: 0n };
  const bad: [string, unknown][] = [
    ['an empty object', {}],
    ['null', null],
    ['no steps', { chainId: 31337, from: OWNER, steps: [] }],
    ['a step with bad calldata', { chainId: 31337, from: OWNER, steps: [{ ...step, data: '0xzz' }] }],
    ['an address that is not one', { chainId: 31337, from: '0x12', steps: [step] }],
    ['a negative value', { chainId: 31337, from: OWNER, steps: [{ ...step, value: -1n }] }],
    ['more than 32 steps', { chainId: 31337, from: OWNER, steps: Array.from({ length: 33 }, () => step) }],
  ];

  it.each(bad)('rejects %s as LINK_INVALID, never ok', async (_name, request) => {
    await expect(inspectPayload(fakeCtx(), request as SignPayload)).rejects.toMatchObject({ code: 'LINK_INVALID' });
  });

  it('checksums the addresses it was given in lower case', async () => {
    const lower = { chainId: 31337, from: OWNER.toLowerCase(), steps: [{ ...step, to: VAULT.toLowerCase() }] };
    const check = await inspectPayload(fakeCtx(), lower as unknown as SignPayload);
    expect(check.from).toBe(OWNER);
    expect(check.steps[0].to).toBe(VAULT);
    expect(check.ok).toBe(true);
  });
});
