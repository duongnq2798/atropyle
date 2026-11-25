import {
  ASSET_KINDS,
  type AssetKind,
  type AtropyleClient,
  AtropyleError,
  type ConfirmAddress,
  createReadContext,
  factoryAbi,
  GUARDIAN_WARNING,
  type InspectedStep,
  parseBuilderCodeSuffix,
  type ReadContext,
  type SignPayload,
  type SignRequestCheck,
  sameAddress,
  type TokenInfo,
  type TxPlan,
  toPayload,
  vaultAbi,
  type Warning,
} from '@atropyle/sdk';
import { type Address, decodeFunctionData, type Hex } from 'viem';
import type { TxSender } from '@/tx/impl/calls';
import type { MirrorToken } from '@/tx/mirror';
import { confirmTarget } from './guardian';
import { checkToPlan, sendSignRequest, signView } from './sign';

export type TypedReason = 'empty' | 'invalid' | 'mismatch';

/**
 * Why an address the signer typed does not open a gate of the sign page: the new wallet of a vote (spec §16.3), or a
 * Drill recipient the SDK asks to confirm (AddressConfirmation); null when it matches. Mixed case must carry a valid
 * checksum (confirmTarget), so a one-letter typo is refused, never matched without case. `expected` null: a vote
 * whose calldata did not decode, which nothing typed can match.
 */
export function typedReason(typed: string, expected: Address | null): TypedReason | null {
  const c = confirmTarget(typed, typed);
  if (!c.ok) return c.reason === 'empty' ? 'empty' : 'invalid';
  if (expected === null || !sameAddress(c.target, expected)) return 'mismatch';
  return null;
}

const withoutGuardianWarning = (ws: readonly Warning[]): Warning[] =>
  ws.filter((w) => w.code !== GUARDIAN_WARNING.code);

/**
 * The plan the sign page hands to useTxRunner: the payload's own bytes with inspect's summaries. null when nothing
 * may be signed whatever the wallet: a refused step, a simulation that fails, a Drill whose steps were not simulated
 * in order (signView with no wallet answers 'connect' only for a request that passes everything else). A request
 * that waits only for addresses typed again gets its plan too: the sender inspects again with what was typed, and
 * the SDK refuses unless it matches. The guardian warning is left out: the page says it once, in its own words.
 */
export function signPlan(p: SignPayload, c: SignRequestCheck, appChainId: number): TxPlan | null {
  if (signView(c, null, appChainId).verdict !== 'connect') return null;
  try {
    const plan = checkToPlan(p, c.ok ? c : { ...c, ok: true });
    return {
      ...plan,
      warnings: withoutGuardianWarning(plan.warnings),
      steps: plan.steps.map((s) => ({ ...s, warnings: withoutGuardianWarning(s.warnings) })),
    };
  } catch {
    return null;
  }
}

export interface SignGate {
  /** What the signer typed for an address the SDK asks to confirm, by its confirmKey; never read from the link. */
  typed(a: ConfirmAddress): string;
  /** Every gate of the page is open (each vote and each address typed again): the sender refuses otherwise. */
  open(): boolean;
  /** The check that refused the request at send time, for the page to show. */
  refused?(check: SignRequestCheck): void;
}

const notSent = (message: string) => new AtropyleError('LINK_INVALID', { message });

/**
 * The sign page's sender for useTxRunner. Right before the wallet sees anything, the steps still to send are
 * inspected again (spec §5.4), with what the signer typed for every address the SDK asks to confirm, and go through
 * the app's one send path. A closed gate or a refusal sends nothing and throws LINK_INVALID, which the card shows.
 */
export function signSenderWith(gate: SignGate): TxSender {
  return async (d, plan, o) => {
    if (!gate.open()) throw notSent('An address still has to be typed on this page, so nothing was sent.');
    const out = await sendSignRequest(d, toPayload(plan), {
      ...o,
      confirm: (addresses) => addresses.map((a) => gate.typed(a)),
    });
    if (out.kind === 'refused') {
      gate.refused?.(out.check);
      throw notSent('The signing request no longer passes the checks, so nothing was sent.');
    }
    return out;
  };
}

export interface SignAsset {
  token: Address;
  kind: AssetKind;
}

/** approve(address,uint256) and setApprovalForAll(address,bool): the steps whose mirror needs a token's kind. */
const GRANT_SELECTORS = ['0x095ea7b3', '0xa22cb465'] as const;
const grants = (data: Hex) => GRANT_SELECTORS.some((sel) => data.toLowerCase().startsWith(sel));

function kindsOf(list: readonly { kind: number; token: Address }[]): SignAsset[] {
  return list.flatMap((x) => {
    const kind = ASSET_KINDS[x.kind] as AssetKind | undefined;
    return kind ? [{ token: x.token, kind }] : [];
  });
}

function assetsOf(s: InspectedStep, raw: Hex): SignAsset[] {
  const data = s.builderCodes ? (parseBuilderCodeSuffix(raw)?.data ?? raw) : raw;
  try {
    if (s.action === 'createVault') {
      const call = decodeFunctionData({ abi: factoryAbi, data });
      return call.functionName === 'createVault' ? kindsOf(call.args[0].assets) : [];
    }
    if (s.action === 'setAssets') {
      const call = decodeFunctionData({ abi: vaultAbi, data });
      return call.functionName === 'setAssets' ? kindsOf(call.args[0]) : [];
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * The assets a vault of this request will list, decoded from the calldata of its allowed createVault and setAssets
 * steps: the asset list that gives the mirror each token's kind (ruling R18.8), never chain text. First kind wins.
 */
export function signAssets(p: SignPayload, c: SignRequestCheck): SignAsset[] {
  const out: SignAsset[] = [];
  for (const s of c.steps) {
    const raw = p.steps[s.index]?.data;
    if (!s.allowed || !raw) continue;
    for (const a of assetsOf(s, raw)) if (!out.some((o) => sameAddress(o.token, a.token))) out.push(a);
  }
  return out;
}

export type TokenReader = (token: Address) => Promise<TokenInfo>;

/** Reads through the SDK's own client, which follows no OffchainLookup (client.ts). Built on first use. */
function chainReader(atro: AtropyleClient): TokenReader {
  let ctx: ReadContext | null = null;
  return (token) => {
    ctx ??= createReadContext(atro.deployment, atro.publicClient);
    return ctx.token(token);
  };
}

/**
 * The tokens the mirror of this request names (useTxRunner `tokens`): for a vault that exists, its own asset list
 * read from the chain; for what this request lists (createVault, setAssets), the kind from the calldata and the
 * symbol and decimals from the token. Nothing for a request that grants no token. Never throws: a token it cannot
 * read keeps its kind without a symbol, and a vault it cannot read leaves its calls to the mirror's cautious side.
 */
export async function signTokens(
  atro: AtropyleClient,
  p: SignPayload,
  c: SignRequestCheck,
  read: TokenReader = chainReader(atro),
): Promise<MirrorToken[]> {
  if (!p.steps.some((s) => grants(s.data))) return [];
  const out = new Map<string, MirrorToken>();
  if (c.vault && !c.steps.some((s) => s.create !== null)) {
    try {
      const snap = await atro.vault(c.vault).snapshot();
      for (const a of snap.status.assets) {
        const key = a.asset.token.toLowerCase();
        if (!out.has(key))
          out.set(key, {
            address: a.asset.token,
            kind: a.asset.kind,
            symbol: a.token.symbol,
            decimals: a.token.decimals,
          });
      }
    } catch {
      // Unread, the vault's own assets show as calls the mirror cannot read: the cautious side.
    }
  }
  for (const a of signAssets(p, c)) {
    const key = a.token.toLowerCase();
    if (out.has(key)) continue;
    let info: TokenInfo | null = null;
    try {
      info = await read(a.token);
    } catch {
      info = null;
    }
    out.set(key, {
      address: a.token,
      kind: a.kind,
      symbol: info?.symbol ?? null,
      decimals: a.kind === 'erc20' ? (info?.decimals ?? null) : null,
    });
  }
  return [...out.values()];
}
