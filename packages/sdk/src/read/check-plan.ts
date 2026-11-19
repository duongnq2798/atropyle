import type { Address } from 'viem';
import { toAddress } from '../address';
import type { PlanConfig, PlanIssue } from '../plan/types';
import { validatePlan } from '../plan/validate';
import type { AssetKind, Warning } from '../types';
import type { ReadContext } from './context';
import { type FeeQuote, readFees } from './fees';
import { heldBy } from './snapshot';
import type { TokenInfo } from './types';

export interface TokenCheck {
  index: number;
  token: Address;
  kind: AssetKind;
  isContract: boolean;
  info: TokenInfo | null;
  held: bigint | null;
}

export interface PlanCheck {
  ok: boolean;
  issues: PlanIssue[];
  warnings: Warning[];
  config: PlanConfig | null;
  tokens: TokenCheck[];
  fees: FeeQuote;
  contractHeirs: Address[];
}

const hasCode = (code: string | undefined): boolean => !!code && code !== '0x';

interface TokenResult {
  check: TokenCheck;
  issue?: PlanIssue;
  warning?: Warning;
}

/** validatePlan plus the on-chain checks the contract would make or that matter at release (spec §6 `plan check`). */
export async function checkPlan(
  ctx: ReadContext,
  plan: unknown,
  opts: { owner: string; drill?: boolean },
): Promise<PlanCheck> {
  const owner = toAddress(opts.owner, 'owner');
  const c = ctx.client;
  const [r, fees, blockNumber] = await Promise.all([
    Promise.resolve(validatePlan(plan, { owner, drill: opts.drill })),
    readFees(ctx),
    c.getBlockNumber(),
  ]);
  if (!r.ok) return { ok: false, issues: r.issues, warnings: [], config: null, tokens: [], fees, contractHeirs: [] };
  const cfg = r.config;
  const issues: PlanIssue[] = [];
  const warnings: Warning[] = [...r.warnings];
  // Checks run in parallel but are collected in plan order, so issues and warnings are stable.
  const tokenChecks = await Promise.all(
    cfg.assets.map(async (a, index): Promise<TokenResult> => {
      const isContract = hasCode(await c.getCode({ address: a.token, blockNumber }));
      if (!isContract) {
        const issue: PlanIssue = {
          path: `assets[${index}].token`,
          code: 'TOKEN_NOT_CONTRACT',
          message: `assets[${index}].token: ${a.token} has no contract code`,
        };
        return { check: { index, token: a.token, kind: a.kind, isContract, info: null, held: null }, issue };
      }
      const [info, held] = await Promise.all([ctx.token(a.token, blockNumber), heldBy(c, owner, a, blockNumber)]);
      const check: TokenCheck = { index, token: a.token, kind: a.kind, isContract, info, held };
      if (held !== 0n) return { check };
      return {
        check,
        warning: {
          code: 'TOKEN_NOT_HELD',
          message: `Asset #${index} (${a.kind} ${a.token}) is not held by ${owner} right now.`,
        },
      };
    }),
  );
  const heirChecks = await Promise.all(
    cfg.heirs.map(async (h, i) => {
      if (!hasCode(await c.getCode({ address: h.account, blockNumber }))) return null;
      const warning: Warning | undefined = cfg.assets.some((a) => a.kind !== 'erc20' && a.heir === i)
        ? {
            code: 'HEIR_IS_CONTRACT',
            message: `Heir #${i} (${h.account}) is a contract: make sure it can receive ERC-721 and ERC-1155 tokens, or a transfer will fail at release.`,
          }
        : undefined;
      return { account: h.account, warning };
    }),
  );
  const tokens: TokenCheck[] = [];
  for (const t of tokenChecks) {
    tokens.push(t.check);
    if (t.issue) issues.push(t.issue);
    if (t.warning) warnings.push(t.warning);
  }
  const contractHeirs: Address[] = [];
  for (const h of heirChecks) {
    if (!h) continue;
    contractHeirs.push(h.account);
    if (h.warning) warnings.push(h.warning);
  }
  return { ok: issues.length === 0, issues, warnings, config: cfg, tokens, fees, contractHeirs };
}
