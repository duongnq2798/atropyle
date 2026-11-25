import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  erc721Abi,
  type Hex,
  maxUint256,
  type PublicClient,
  parseAbi,
  RpcRequestError,
  stringToHex,
} from 'viem';
import { describe, expect, it } from 'vitest';
import { erc1155Abi, factoryAbi, vaultAbi } from '../../src/abi/index';
import { paramsToAbi } from '../../src/encode';
import { inspectPayload, typedAddressMatches } from '../../src/handoff/inspect';
import {
  appendSuffix,
  builderCodeSuffix,
  parseSignLink,
  type ReadContext,
  type SignPayload,
  signLink,
} from '../../src/index';
import { G1, G2, HEIR_A, HEIR_B, NEW_WALLET, NFT, OWNER, TOKEN, VAULT } from './fixtures';

const FACTORY = '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707' as Address;
const FEE_TOKEN = '0x0000000000000000000000000000000000000fee' as Address;
const MULTI = '0x00000000000000000000000000000000000a1155' as Address;
const OTHER_VAULT = '0x2222222222222222222222222222222222222222' as Address;
const DRILL_VAULT = '0x3333333333333333333333333333333333333333' as Address;
const PREDICTED = '0x4444444444444444444444444444444444444444' as Address;
const STRANGER = '0x00000000000000000000000000000000000057a9' as Address;
const ZERO = '0x0000000000000000000000000000000000000000' as Address;
const FULL_FEE = 50_000_000n;
const NOW = 1_800_000_000n;

// VAULT belongs to OWNER and holds an ERC-20, an ERC-721 and an ERC-1155; OTHER_VAULT belongs to someone else.
// DRILL_VAULT is a Drill of OWNER, with recovery on. PREDICTED is where a createVault of OWNER lands.
const ASSETS = [
  { kind: 0, token: TOKEN, id: 0n, heir: 0 },
  { kind: 1, token: NFT, id: 1n, heir: 0 },
  { kind: 2, token: MULTI, id: 7n, heir: 0 },
];
const owners: Record<string, Address> = {
  [VAULT.toLowerCase()]: OWNER,
  [OTHER_VAULT.toLowerCase()]: STRANGER,
  [DRILL_VAULT.toLowerCase()]: OWNER,
};
const SIX_MONTHS = { period: 30 * 86400, threshold: 6, window: 14 * 86400 };
const DRILL_TIMING = { period: 60, threshold: 2, window: 120 };
const people: Record<string, Record<string, unknown>> = {
  [VAULT.toLowerCase()]: {
    drill: false,
    heirs: [{ account: HEIR_A, bps: 10_000 }],
    guardians: [G1, G2],
    k: 1,
    recoveryEnabled: true,
    timing: SIX_MONTHS,
  },
  [DRILL_VAULT.toLowerCase()]: {
    drill: true,
    heirs: [
      { account: HEIR_A, bps: 7000 },
      { account: HEIR_B, bps: 3000 },
    ],
    guardians: [G1],
    k: 1,
    recoveryEnabled: true,
    timing: DRILL_TIMING,
  },
};

interface FakeOptions {
  /**
   * The endpoint has no eth_simulateV1, like the X Layer RPCs of deployments/xlayer.json (OKX answers -32601): each
   * step is estimated alone against the head state, and a later step that fails alone is reported as skipped.
   */
  noSimulateV1?: boolean;
  /** Calldata whose estimate, alone against the head state, reverts. */
  reverts?: readonly Hex[];
  /** More vaults on chain, by address: their owner and their heirs, guardians and timing. */
  vaults?: Record<string, { owner: Address; people: Record<string, unknown> }>;
}

function fakeCtx(o: FakeOptions = {}): ReadContext {
  const extra = Object.fromEntries(Object.entries(o.vaults ?? {}).map(([a, v]) => [a.toLowerCase(), v]));
  const ownerOf = (a: string) => owners[a] ?? extra[a]?.owner;
  const peopleOf = (a: string) => people[a] ?? extra[a]?.people;
  const reverts = new Set((o.reverts ?? []).map((d) => d.toLowerCase()));
  const client = {
    getBlockNumber: async () => 10n,
    getBlock: async () => ({ timestamp: NOW }),
    estimateGas: async ({ data }: { data: Hex }) => {
      if (reverts.has(data.toLowerCase())) {
        throw new RpcRequestError({
          body: { method: 'eth_estimateGas' },
          error: { code: 3, message: 'execution reverted' },
          url: 'https://rpc.example',
        });
      }
      return 90_000n;
    },
    simulateCalls: async ({ calls }: { calls: unknown[] }) => {
      if (o.noSimulateV1) {
        throw new RpcRequestError({
          status: 403,
          body: { method: 'eth_simulateV1' },
          error: { code: -32601, message: 'rpc method is not whitelisted' },
          url: 'https://rpc.example',
        });
      }
      return { results: calls.map(() => ({ status: 'success', gasUsed: 90_000n })) };
    },
    readContract: async ({
      address,
      functionName,
      args,
    }: {
      address: Address;
      functionName: string;
      args: unknown[];
    }) => {
      const key = address.toLowerCase();
      if (functionName === 'isVault') return ownerOf((args[0] as string).toLowerCase()) !== undefined;
      if (functionName === 'owner') return ownerOf(key);
      if (functionName === 'assets') return ASSETS;
      if (functionName === 'fullFee') return FULL_FEE;
      if (functionName === 'currentFee') return FULL_FEE;
      if (functionName === 'predictVault') return PREDICTED;
      const p = peopleOf(key);
      if (p && functionName in p) return p[functionName];
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

const ATTACKER = '0xbadbAdbadBADbaDBADbADbaDBADBaDBADbAdbAd1' as Address;
const SALT = `0x${'5a'.repeat(32)}` as Hex;

type Cfg = Parameters<typeof paramsToAbi>[0];
const cfgOf = (over: Partial<Cfg> = {}): Cfg => ({
  heirs: [{ account: HEIR_A, bps: 10_000 }],
  guardians: [],
  k: 0,
  recoveryEnabled: false,
  timing: DRILL_TIMING,
  assets: [],
  ...over,
});
const createVault = (cfg: Cfg, drill: boolean, feeToken: Address = ZERO) =>
  encodeFunctionData({ abi: factoryAbi, functionName: 'createVault', args: [paramsToAbi(cfg), SALT, drill, feeToken] });
const many = (steps: [Address, Hex][], from: Address = OWNER): SignPayload => ({
  chainId: 31337,
  from,
  steps: steps.map(([to, data]) => ({ to, data, value: 0n })),
});
const suffixed = (data: Hex) => appendSuffix(data, builderCodeSuffix('atropyle'));

describe('createVault steps state who gets what, and how early', () => {
  it('a paid guarded vault: heirs, guardians with k, and the earliest exit is the recovery window', async () => {
    const cfg = cfgOf({
      heirs: [
        { account: HEIR_A, bps: 6000 },
        { account: HEIR_B, bps: 4000 },
      ],
      guardians: [G1, G2],
      k: 2,
      recoveryEnabled: true,
      timing: SIX_MONTHS,
      assets: [{ kind: 'erc20', token: TOKEN, id: 0n, heir: 0 }],
    });
    const check = await inspectPayload(
      fakeCtx(),
      many([
        [FEE_TOKEN, approve20(FACTORY, FULL_FEE)],
        [FACTORY, createVault(cfg, false, FEE_TOKEN)],
        [TOKEN, approve20(PREDICTED, 1_000n)],
      ]),
    );
    expect(check.ok).toBe(true);
    expect(check.confirm).toBeNull();
    const create = check.steps[1].create;
    expect(create).toMatchObject({
      vault: PREDICTED,
      drill: false,
      heirs: cfg.heirs,
      guardians: [G1, G2],
      k: 2,
      recoveryEnabled: true,
      timing: SIX_MONTHS,
      readAt: NOW,
    });
    // Recovery: k votes open a 14-day window. Heirs: 6 missed months + 14 days with 2 confirmations, else 15 months.
    expect(create?.exit.routes).toEqual([
      { route: 'recovery', after: 14 * 86400, guardians: 2 },
      { route: 'heirs', after: 6 * 30 * 86400 + 14 * 86400, guardians: 2 },
      { route: 'heirsFallback', after: 15 * 30 * 86400, guardians: 0 },
    ]);
    expect(create?.earliestAt).toBe(NOW + 14n * 86400n);
    expect(check.steps[1].warnings.map((w) => w.code)).toEqual(['RECOVERY_POWER']);
    for (const i of [0, 2]) expect(check.steps[i].create).toBeNull();
  });

  it('a Drill that cannot release before it expires says so', async () => {
    const slow = cfgOf({ timing: { period: 86400, threshold: 7, window: 60 } });
    const check = await inspectPayload(fakeCtx(), one(FACTORY, createVault(slow, true)));
    expect(check.ok).toBe(true);
    expect(check.steps[0].create?.exit).toEqual({ routes: [], earliest: null, expiresAfter: 604_800 });
    expect(check.steps[0].create?.earliestAt).toBeNull();
    expect(check.steps[0].warnings.map((w) => w.code)).toEqual(['NO_GUARDIANS', 'DRILL_NOT_FOR_REAL_ASSETS']);
  });
});

describe('a Drill with a token allowance is blocked until the signer types the addresses again', () => {
  // What a phishing link looks like: a Drill whose only heir is the attacker, with the fastest timing a Drill takes,
  // and every approval the victim holds, carried with our builder code and encoded as a real #/sign link.
  const phishing = () => {
    const cfg = cfgOf({
      heirs: [{ account: ATTACKER, bps: 10_000 }],
      timing: { period: 60, threshold: 1, window: 60 },
      assets: [
        { kind: 'erc20', token: TOKEN, id: 0n, heir: 0 },
        { kind: 'erc1155', token: MULTI, id: 7n, heir: 0 },
      ],
    });
    const payload = many([
      [FACTORY, suffixed(createVault(cfg, true))],
      [TOKEN, suffixed(approve20(PREDICTED, maxUint256))],
      [MULTI, suffixed(forAll(PREDICTED, true))],
    ]);
    return parseSignLink(signLink(payload, 'https://atropyle.xyz/'));
  };

  it('blocks the phishing link as it arrives and says the heir can take everything 2 minutes after creation', async () => {
    const check = await inspectPayload(fakeCtx(), phishing());
    expect(check.steps.every((s) => s.allowed)).toBe(true);
    expect(check.steps.every((s) => s.simulation.ok === true)).toBe(true);
    expect(check.ok).toBe(false);
    expect(check.confirm).toEqual({
      reason: 'DRILL_WITH_ALLOWANCE',
      addresses: [{ step: 0, vault: PREDICTED, role: 'heir', index: 0, account: ATTACKER, bps: 10_000 }],
      confirmed: false,
    });
    expect(check.steps[0].create?.exit.earliest).toEqual({ route: 'heirs', after: 120, guardians: 0 });
    expect(check.steps[0].create?.earliestAt).toBe(NOW + 120n);
  });

  it('stays blocked for a wrong, empty, malformed or badly checksummed address', async () => {
    // One letter in the wrong case: the checksum catches it, as it catches most typos.
    const broken = `${ATTACKER.slice(0, -2)}D1`;
    expect(typedAddressMatches(ATTACKER, ATTACKER)).toBe(true);
    expect(typedAddressMatches(broken, ATTACKER)).toBe(false);
    for (const confirmed of [[], [HEIR_A], [''], ['0x12'], [broken], [ATTACKER, ATTACKER]]) {
      const check = await inspectPayload(fakeCtx(), phishing(), { confirmed });
      expect(check.ok, JSON.stringify(confirmed)).toBe(false);
      expect(check.confirm?.confirmed).toBe(false);
    }
  });

  it('passes once every address is typed again, in lower or checksum case', async () => {
    for (const typed of [` ${ATTACKER} `, ATTACKER.toLowerCase()]) {
      const check = await inspectPayload(fakeCtx(), phishing(), { confirmed: [typed] });
      expect(check.confirm?.confirmed).toBe(true);
      expect(check.ok).toBe(true);
    }
  });

  it('asks for the guardians too when they can move everything with recovery', async () => {
    const cfg = cfgOf({
      heirs: [{ account: HEIR_A, bps: 10_000 }],
      guardians: [ATTACKER],
      k: 1,
      recoveryEnabled: true,
      timing: { period: 60, threshold: 2, window: 60 },
      assets: [{ kind: 'erc20', token: TOKEN, id: 0n, heir: 0 }],
    });
    const payload = many([
      [FACTORY, createVault(cfg, true)],
      [TOKEN, approve20(PREDICTED, 5n)],
    ]);
    const check = await inspectPayload(fakeCtx(), payload);
    expect(check.confirm?.addresses.map((a) => [a.role, a.account])).toEqual([
      ['heir', HEIR_A],
      ['guardian', ATTACKER],
    ]);
    // One guardian, one vote, a 1-minute window: the fastest way out.
    expect(check.steps[0].create?.exit.earliest).toEqual({ route: 'recovery', after: 60, guardians: 1 });
    expect(check.steps[0].warnings.map((w) => w.code)).toEqual(['RECOVERY_POWER', 'DRILL_NOT_FOR_REAL_ASSETS']);
    expect((await inspectPayload(fakeCtx(), payload, { confirmed: [HEIR_A, ATTACKER] })).ok).toBe(true);
    expect((await inspectPayload(fakeCtx(), payload, { confirmed: [HEIR_A] })).ok).toBe(false);
  });

  it('counts an allowance to any spender, the factory included', async () => {
    const check = await inspectPayload(
      fakeCtx(),
      many([
        [FEE_TOKEN, approve20(FACTORY, 1n)],
        [FACTORY, createVault(cfgOf(), true)],
      ]),
    );
    expect(check.confirm?.addresses.map((a) => a.account)).toEqual([HEIR_A]);
    expect(check.ok).toBe(false);
  });

  it('also guards an allowance to a Drill vault already on chain, with its heirs and guardians from the chain', async () => {
    const check = await inspectPayload(fakeCtx(), one(TOKEN, approve20(DRILL_VAULT, 5n)));
    expect(check.confirm?.addresses).toEqual([
      { step: 0, vault: DRILL_VAULT, role: 'heir', index: 0, account: HEIR_A, bps: 7000 },
      { step: 0, vault: DRILL_VAULT, role: 'heir', index: 1, account: HEIR_B, bps: 3000 },
      { step: 0, vault: DRILL_VAULT, role: 'guardian', index: 0, account: G1, bps: null },
    ]);
    expect(check.ok).toBe(false);
  });

  it('refuses new heirs or guardians for a Drill in the request that gives it an allowance', async () => {
    // Were setGuardians to revert on chain, G1 would keep recovery with the new allowance, and nobody typed G1.
    const setHeirs = encodeFunctionData({
      abi: vaultAbi,
      functionName: 'setHeirs',
      args: [[{ account: ATTACKER, bps: 10_000 }]],
    });
    const off = encodeFunctionData({ abi: vaultAbi, functionName: 'setGuardians', args: [[], 0, false] });
    const check = await inspectPayload(
      fakeCtx(),
      many([
        [TOKEN, approve20(DRILL_VAULT, 5n)],
        [DRILL_VAULT, setHeirs],
        [DRILL_VAULT, off],
      ]),
    );
    expect(check.ok).toBe(false);
    expect(check.steps.map((s) => s.allowed)).toEqual([true, false, false]);
    for (const i of [1, 2]) {
      expect(check.steps[i].reason).toBe(
        `step 1 gives Drill vault ${DRILL_VAULT} an allowance, and a request may not also change who receives from it`,
      );
    }
    // The refused steps changed nothing: what is typed again is what the chain holds.
    expect(check.confirm?.addresses.map((a) => [a.role, a.account])).toEqual([
      ['heir', HEIR_A],
      ['heir', HEIR_B],
      ['guardian', G1],
    ]);
  });

  it('lets revocations, Drills without allowances and paid vaults through', async () => {
    const plain = async (p: SignPayload) => {
      const c = await inspectPayload(fakeCtx(), p);
      return [c.ok, c.confirm];
    };
    expect(await plain(one(TOKEN, approve20(DRILL_VAULT, 0n)))).toEqual([true, null]);
    expect(await plain(one(MULTI, forAll(DRILL_VAULT, false)))).toEqual([true, null]);
    expect(await plain(one(NFT, approve721(ZERO, 1n)))).toEqual([true, null]);
    expect(await plain(one(FACTORY, createVault(cfgOf(), true)))).toEqual([true, null]);
    expect(await plain(one(TOKEN, approve20(VAULT, 5n)))).toEqual([true, null]);
  });

  it.each([
    ['increaseAllowance', 'function increaseAllowance(address,uint256)', [DRILL_VAULT, 1n]],
    [
      'permit (EIP-2612)',
      'function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)',
      [OWNER, DRILL_VAULT, 1n, 1n, 27, `0x${'00'.repeat(32)}`, `0x${'00'.repeat(32)}`],
    ],
  ])('refuses %s by name', async (name, signature, args) => {
    const data = encodeFunctionData({ abi: parseAbi([signature]), args } as never);
    const check = await inspectPayload(fakeCtx(), one(TOKEN, data));
    expect(check.ok).toBe(false);
    expect(check.steps[0].reason).toContain(`${name} is not allowed`);
  });
});

const setHeirsTo = (account: Address) =>
  encodeFunctionData({ abi: vaultAbi, functionName: 'setHeirs', args: [[{ account, bps: 10_000 }]] });
const setTimingTo = (timing: { period: number; threshold: number; window: number }) =>
  encodeFunctionData({ abi: vaultAbi, functionName: 'setTiming', args: [timing] });
const setGuardiansTo = (guardians: Address[], k: number, recoveryEnabled: boolean) =>
  encodeFunctionData({ abi: vaultAbi, functionName: 'setGuardians', args: [guardians, k, recoveryEnabled] });

describe('a request may not call the vault it creates, so the terms of its createVault step are final', () => {
  const TWELVE_MONTHS = { period: 30 * 86400, threshold: 12, window: 30 * 86400 };
  const erc20 = [{ kind: 'erc20' as const, token: TOKEN, id: 0n, heir: 0 }];

  it('refuses a paid vault whose later steps shorten its timing and pay the attacker', async () => {
    const check = await inspectPayload(
      fakeCtx(),
      many([
        [FEE_TOKEN, approve20(FACTORY, FULL_FEE)],
        [FACTORY, createVault(cfgOf({ timing: TWELVE_MONTHS, assets: erc20 }), false, FEE_TOKEN)],
        [PREDICTED, setTimingTo({ period: 86400, threshold: 1, window: 3 * 86400 })],
        [PREDICTED, setHeirsTo(ATTACKER)],
        [TOKEN, approve20(PREDICTED, maxUint256)],
      ]),
    );
    expect(check.ok).toBe(false);
    expect(check.steps.map((s) => s.allowed)).toEqual([true, true, false, false, true]);
    for (const i of [2, 3]) {
      expect(check.steps[i].reason).toBe(
        `step 2 creates vault ${PREDICTED}, and a request may not call the vault it creates`,
      );
    }
    expect(check.steps.every((s) => s.simulation.ok === 'skipped')).toBe(true);
    // What step 2 states is all the vault can ever get from this request: HEIR_A, 12 missed months and 30 days.
    expect(check.steps[1].create?.heirs).toEqual([{ account: HEIR_A, bps: 10_000 }]);
    expect(check.steps[1].create?.exit.earliest).toEqual({ route: 'heirs', after: 390 * 86400, guardians: 0 });
  });

  it('refuses a Drill that says it never releases, then speeds itself up and pays the attacker', async () => {
    const slow = cfgOf({ timing: { period: 7 * 86400, threshold: 1, window: 60 }, assets: erc20 });
    const payload = many([
      [FACTORY, createVault(slow, true)],
      [PREDICTED, setTimingTo({ period: 60, threshold: 1, window: 60 })],
      [PREDICTED, setHeirsTo(ATTACKER)],
      [TOKEN, approve20(PREDICTED, maxUint256)],
    ]);
    const check = await inspectPayload(fakeCtx(), payload);
    expect(check.steps[0].create?.exit.earliest).toBeNull();
    expect(check.steps.map((s) => s.allowed)).toEqual([true, false, false, true]);
    expect(check.ok).toBe(false);
    // The refused steps changed nothing: the address to type again is still the heir of the calldata.
    expect(check.confirm?.addresses.map((a) => a.account)).toEqual([HEIR_A]);
    // And typing it does not unlock a refused step.
    expect((await inspectPayload(fakeCtx(), payload, { confirmed: [HEIR_A] })).ok).toBe(false);
  });

  it('refuses turning recovery on, and any other call, on the vault the request creates', async () => {
    const calls: [string, Hex][] = [
      ['setGuardians', setGuardiansTo([ATTACKER], 1, true)],
      ['setAssets', encodeFunctionData({ abi: vaultAbi, functionName: 'setAssets', args: [[]] })],
      ['checkIn', encodeFunctionData({ abi: vaultAbi, functionName: 'checkIn' })],
    ];
    for (const [name, data] of calls) {
      const check = await inspectPayload(
        fakeCtx(),
        many([
          [FACTORY, createVault(cfgOf(), false, FEE_TOKEN)],
          [PREDICTED, data],
        ]),
      );
      expect(check.steps[0].create?.recoveryEnabled, name).toBe(false);
      expect(check.steps[1], name).toMatchObject({ allowed: false, action: null, warnings: [] });
      expect(check.ok, name).toBe(false);
    }
  });
});

describe('new heirs or recovery guardians for a Drill are typed again too', () => {
  it('holds setHeirs on a Drill already on chain, which may hold allowances from an earlier link', async () => {
    const payload = one(DRILL_VAULT, setHeirsTo(ATTACKER));
    const check = await inspectPayload(fakeCtx(), payload);
    expect(check.steps[0]).toMatchObject({ allowed: true, action: 'setHeirs' });
    expect(check.ok).toBe(false);
    expect(check.confirm).toEqual({
      reason: 'DRILL_RECIPIENTS_CHANGED',
      addresses: [
        { step: 0, vault: DRILL_VAULT, role: 'heir', index: 0, account: ATTACKER, bps: 10_000 },
        { step: 0, vault: DRILL_VAULT, role: 'guardian', index: 0, account: G1, bps: null },
      ],
      confirmed: false,
    });
    expect((await inspectPayload(fakeCtx(), payload, { confirmed: [ATTACKER, G1] })).ok).toBe(true);
  });

  it('holds setGuardians with recovery on for a Drill, and lists the new guardians', async () => {
    const check = await inspectPayload(fakeCtx(), one(DRILL_VAULT, setGuardiansTo([ATTACKER], 1, true)));
    expect(check.ok).toBe(false);
    expect(check.confirm?.reason).toBe('DRILL_RECIPIENTS_CHANGED');
    expect(check.confirm?.addresses.map((a) => [a.role, a.account])).toEqual([
      ['heir', HEIR_A],
      ['heir', HEIR_B],
      ['guardian', ATTACKER],
    ]);
    expect(check.steps[0].warnings.map((w) => w.code)).toEqual(['RECOVERY_POWER']);
  });

  it('counts a fee approval as no allowance to the Drill it repoints', async () => {
    const check = await inspectPayload(
      fakeCtx(),
      many([
        [FEE_TOKEN, approve20(FACTORY, FULL_FEE)],
        [DRILL_VAULT, setHeirsTo(ATTACKER)],
      ]),
    );
    expect(check.confirm?.reason).toBe('DRILL_RECIPIENTS_CHANGED');
    expect(check.confirm?.addresses[0]).toMatchObject({ step: 1, account: ATTACKER });
  });

  it('lets through recovery turned off on a Drill, and new heirs for a paid vault', async () => {
    for (const p of [one(DRILL_VAULT, setGuardiansTo([], 0, false)), one(VAULT, setHeirsTo(HEIR_B))]) {
      const check = await inspectPayload(fakeCtx(), p);
      expect(check.confirm).toBeNull();
      expect(check.ok).toBe(true);
    }
  });
});

describe('RECOVERY_POWER on the signing page', () => {
  it('comes with a setGuardians that turns recovery on, and with a new window on a vault that has it', async () => {
    const on = encodeFunctionData({ abi: vaultAbi, functionName: 'setGuardians', args: [[G1, G2], 2, true] });
    const off = encodeFunctionData({ abi: vaultAbi, functionName: 'setGuardians', args: [[G1, G2], 2, false] });
    const timing = encodeFunctionData({
      abi: vaultAbi,
      functionName: 'setTiming',
      args: [{ period: 86400, threshold: 3, window: 7 * 86400 }],
    });
    const warnings = async (p: SignPayload) => (await inspectPayload(fakeCtx(), p)).steps.map((s) => s.warnings);
    const [w] = await warnings(one(VAULT, on));
    expect(w).toEqual([
      expect.objectContaining({ code: 'RECOVERY_POWER', params: { k: 2, guardians: 2, window: 14 * 86400 } }),
    ]);
    expect(await warnings(one(VAULT, off))).toEqual([[]]);
    const [t] = await warnings(one(VAULT, timing));
    expect(t[0].message).toContain('1 of 2 guardians acting together can move 100% of the covered assets');
    expect(t[0].message).toContain('before the 7d alarm window ends');
    // Off first, then a new window: nothing left to warn about.
    const both = many([
      [VAULT, off],
      [VAULT, timing],
    ]);
    expect((await warnings(both)).flat()).toEqual([]);
  });
});

const checkIn = encodeFunctionData({ abi: vaultAbi, functionName: 'checkIn' });
const ERC20_ONLY = [{ kind: 'erc20' as const, token: TOKEN, id: 0n, heir: 0 }];
/** The fastest Drill there is, paying `account` everything, with an ERC-20 as its asset. */
const fastDrillFor = (account: Address) =>
  createVault(
    cfgOf({ heirs: [{ account, bps: 10_000 }], timing: { period: 60, threshold: 1, window: 60 }, assets: ERC20_ONLY }),
    true,
  );
/**
 * `data` with the 12 high bytes of the word that holds `account` set to ff. viem still reads `account` from it;
 * Solidity's ABI decoder reverts on it.
 */
const dirty = (data: Hex, account: Address): Hex => {
  const at = data.toLowerCase().indexOf(account.slice(2).toLowerCase()) - 24;
  return `${data.slice(0, at)}${'ff'.repeat(12)}${data.slice(at + 24)}` as Hex;
};
const setAssetsTo = (assets: { kind: number; token: Address; id: bigint; heir: number }[]) =>
  encodeFunctionData({ abi: vaultAbi, functionName: 'setAssets', args: [assets] });
// The X Layer RPCs answer eth_simulateV1 with -32601: every step is estimated alone, against the head state.
const xlayer = (o: Omit<FakeOptions, 'noSimulateV1'> = {}) => fakeCtx({ ...o, noSimulateV1: true });

describe('a request creates at most one vault, and only one that does not exist yet', () => {
  it('refuses a second createVault with the same salt, which reverts on chain and leaves the first terms', async () => {
    // Each step estimates fine alone. On chain the third collides with the first (CREATE2) and reverts, so the
    // Drill that lands pays the attacker; the approval still lands with it.
    const payload = many([
      [FACTORY, fastDrillFor(ATTACKER)],
      [TOKEN, approve20(PREDICTED, maxUint256)],
      [FACTORY, fastDrillFor(HEIR_A)],
    ]);
    const check = await inspectPayload(xlayer(), payload, { confirmed: [HEIR_A] });
    expect(check.steps.map((s) => s.allowed)).toEqual([true, true, false]);
    expect(check.steps[2]).toMatchObject({ action: null, create: null });
    expect(check.steps[2].reason).toBe('step 1 already creates a vault, and a request creates at most one');
    expect(check.ok).toBe(false);
    // The heir to type again is the one of the vault that lands.
    expect(check.steps[0].create?.heirs).toEqual([{ account: ATTACKER, bps: 10_000 }]);
    expect(check.confirm?.addresses.map((a) => a.account)).toEqual([ATTACKER]);
  });

  it('refuses a createVault whose vault already exists, and asks for the heirs on chain', async () => {
    // The Drill at PREDICTED came from an earlier link without allowances, so nobody typed its heir.
    const vaults = {
      [PREDICTED]: {
        owner: OWNER,
        people: {
          drill: true,
          heirs: [{ account: ATTACKER, bps: 10_000 }],
          guardians: [],
          k: 0,
          recoveryEnabled: false,
          timing: DRILL_TIMING,
        },
      },
    };
    const create = fastDrillFor(HEIR_A);
    const payload = many([
      [VAULT, checkIn],
      [FACTORY, create],
      [TOKEN, approve20(PREDICTED, maxUint256)],
    ]);
    const check = await inspectPayload(xlayer({ reverts: [create], vaults }), payload, { confirmed: [HEIR_A] });
    expect(check.steps[1]).toMatchObject({ allowed: false, action: null, create: null });
    expect(check.steps[1].reason).toBe(`vault ${PREDICTED} already exists, so this createVault would revert`);
    expect(check.ok).toBe(false);
    expect(check.confirm?.addresses.map((a) => a.account)).toEqual([ATTACKER]);
  });
});

describe('a request changes each setting of a vault at most once', () => {
  const calls: [string, Hex, Hex][] = [
    ['setHeirs', setHeirsTo(HEIR_A), setHeirsTo(HEIR_B)],
    ['setGuardians', setGuardiansTo([G1], 1, true), setGuardiansTo([], 0, false)],
    ['setTiming', setTimingTo(SIX_MONTHS), setTimingTo({ period: 86400, threshold: 3, window: 7 * 86400 })],
    ['setAssets', setAssetsTo([ASSETS[0]]), setAssetsTo([])],
  ];

  it.each(calls)('refuses a second %s on the same vault', async (name, first, second) => {
    const check = await inspectPayload(
      fakeCtx(),
      many([
        [VAULT, first],
        [VAULT, checkIn],
        [VAULT, second],
      ]),
    );
    expect(check.steps.map((s) => s.allowed)).toEqual([true, true, false]);
    expect(check.steps[2].reason).toBe(
      `step 1 already calls ${name} on vault ${VAULT}, and a request changes each setting of a vault at most once`,
    );
    expect(check.ok).toBe(false);
  });

  it('refuses the heirs a step would restore after the attacker, when an earlier step makes it revert', async () => {
    // On chain the last step reverts with InvalidHeirs (the NFT points at heir #2), so the attacker stays an heir of a
    // Drill that holds allowances. Alone, against the head state, every step estimates fine.
    const payload = many([
      [
        DRILL_VAULT,
        encodeFunctionData({
          abi: vaultAbi,
          functionName: 'setHeirs',
          args: [
            [
              { account: ATTACKER, bps: 5000 },
              { account: HEIR_B, bps: 5000 },
            ],
          ],
        }),
      ],
      [DRILL_VAULT, setAssetsTo([ASSETS[0], { kind: 1, token: NFT, id: 1n, heir: 1 }])],
      [DRILL_VAULT, setHeirsTo(HEIR_A)],
    ]);
    const check = await inspectPayload(xlayer(), payload, { confirmed: [HEIR_A, G1] });
    expect(check.steps.map((s) => s.allowed)).toEqual([true, true, false]);
    expect(check.ok).toBe(false);
    expect(check.confirm?.addresses.filter((a) => a.role === 'heir').map((a) => a.account)).toEqual([ATTACKER, HEIR_B]);
  });
});

describe('only calldata in canonical ABI encoding is read', () => {
  const nonCanonical: [string, Address, Hex][] = [
    ['a createVault with a dirty heir address', FACTORY, dirty(createVault(cfgOf(), true), HEIR_A)],
    ['a setHeirs with a dirty heir address', DRILL_VAULT, dirty(setHeirsTo(HEIR_A), HEIR_A)],
    ['an approve with a dirty spender', TOKEN, dirty(approve20(VAULT, 5n), VAULT)],
    ['a setApprovalForAll with a dirty operator', MULTI, dirty(forAll(VAULT, true), VAULT)],
    ['an approve with extra bytes', TOKEN, `${approve20(VAULT, 5n)}00000000`],
    ['a checkIn with extra bytes', VAULT, `${checkIn}deadbeef`],
  ];

  it.each(nonCanonical)('refuses %s', async (_name, to, data) => {
    const check = await inspectPayload(fakeCtx(), one(to, data));
    expect(check.steps[0]).toMatchObject({ allowed: false, action: null, summary: null });
    expect(check.steps[0].reason).toContain('not in canonical ABI encoding');
    expect(check.ok).toBe(false);
  });

  it('refuses a setHeirs that viem reads as the heir the signer types but Solidity reverts on', async () => {
    // Step 2 alone reverts, so without eth_simulateV1 it is "skipped", not failed. Read as HEIR_A, it would hide the
    // attacker that step 1 leaves as the heir.
    const restore = dirty(setHeirsTo(HEIR_A), HEIR_A);
    const payload = many([
      [DRILL_VAULT, setHeirsTo(ATTACKER)],
      [DRILL_VAULT, restore],
    ]);
    const check = await inspectPayload(xlayer({ reverts: [restore] }), payload, { confirmed: [HEIR_A, G1] });
    expect(check.steps.map((s) => s.allowed)).toEqual([true, false]);
    expect(check.ok).toBe(false);
    expect(check.confirm?.addresses.filter((a) => a.role === 'heir').map((a) => a.account)).toEqual([ATTACKER]);
  });

  it('reads calldata with a builder code suffix as canonical', async () => {
    const check = await inspectPayload(fakeCtx(), one(TOKEN, suffixed(approve20(VAULT, 5n))));
    expect(check.steps[0]).toMatchObject({ allowed: true, builderCodes: ['atropyle'] });
  });
});

describe('a request that needs addresses typed again has every step simulated', () => {
  it('stays blocked while a step was skipped, even once every address is typed', async () => {
    // createVault fails alone here; without eth_simulateV1 it is skipped. Were it to revert on chain, the approval
    // would still land on an empty address that a later link could fill with a Drill nobody typed.
    const create = fastDrillFor(HEIR_A);
    const payload = many([
      [VAULT, checkIn],
      [FACTORY, create],
      [TOKEN, approve20(PREDICTED, maxUint256)],
    ]);
    const skipped = await inspectPayload(xlayer({ reverts: [create] }), payload, { confirmed: [HEIR_A] });
    expect(skipped.steps.every((s) => s.allowed)).toBe(true);
    expect(skipped.steps[1].simulation).toEqual({ ok: 'skipped', reason: 'DEPENDS_ON_PREVIOUS_STEP' });
    expect(skipped.confirm?.confirmed).toBe(true);
    expect(skipped.ok).toBe(false);
    // Every step simulated: typing the heir is enough.
    expect((await inspectPayload(xlayer(), payload, { confirmed: [HEIR_A] })).ok).toBe(true);
  });

  it('still lets a paid creation through when its createVault only fails before the fee approval', async () => {
    const create = createVault(cfgOf({ timing: SIX_MONTHS, assets: ERC20_ONLY }), false, FEE_TOKEN);
    const check = await inspectPayload(
      xlayer({ reverts: [create] }),
      many([
        [FEE_TOKEN, approve20(FACTORY, FULL_FEE)],
        [FACTORY, create],
        [TOKEN, approve20(PREDICTED, 5n)],
      ]),
    );
    expect(check.steps[1].simulation.ok).toBe('skipped');
    expect(check.confirm).toBeNull();
    expect(check.ok).toBe(true);
  });
});

describe('a Drill that gets an allowance keeps the heirs and guardians that were typed', () => {
  // An earlier link created this Drill without allowances, so nobody typed its heirs.
  const EARLY_DRILL = '0x5555555555555555555555555555555555555555' as Address;
  const vaults = {
    [EARLY_DRILL]: {
      owner: OWNER,
      people: {
        drill: true,
        heirs: [
          { account: ATTACKER, bps: 5000 },
          { account: HEIR_B, bps: 5000 },
        ],
        guardians: [],
        k: 0,
        recoveryEnabled: false,
        timing: DRILL_TIMING,
      },
    },
  };

  it('refuses an allowance to a Drill whose heirs the same request changes', async () => {
    // On chain setHeirs reverts (the NFT now points at heir #2), so the heirs on chain would get the allowance.
    const payload = many([
      [EARLY_DRILL, setAssetsTo([ASSETS[0], { kind: 1, token: NFT, id: 1n, heir: 1 }])],
      [EARLY_DRILL, setHeirsTo(HEIR_A)],
      [TOKEN, approve20(EARLY_DRILL, maxUint256)],
    ]);
    const check = await inspectPayload(xlayer({ vaults }), payload, { confirmed: [HEIR_A] });
    expect(check.steps.map((s) => s.allowed)).toEqual([true, true, false]);
    expect(check.steps[2].reason).toBe(
      `step 2 changes who receives from Drill vault ${EARLY_DRILL}, and a request may not also give it an allowance`,
    );
    expect(check.ok).toBe(false);
  });

  it('lets an allowance go with new assets for a Drill, and with new heirs for a paid vault', async () => {
    const drill = many([
      [DRILL_VAULT, setAssetsTo([ASSETS[0]])],
      [TOKEN, approve20(DRILL_VAULT, 5n)],
    ]);
    const a = await inspectPayload(xlayer(), drill, { confirmed: [HEIR_A, HEIR_B, G1] });
    expect(a.steps.every((s) => s.allowed)).toBe(true);
    expect(a.confirm?.reason).toBe('DRILL_WITH_ALLOWANCE');
    expect(a.ok).toBe(true);
    const paid = many([
      [VAULT, setHeirsTo(HEIR_B)],
      [TOKEN, approve20(VAULT, 5n)],
    ]);
    const b = await inspectPayload(xlayer(), paid);
    expect(b.confirm).toBeNull();
    expect(b.ok).toBe(true);
  });
});
