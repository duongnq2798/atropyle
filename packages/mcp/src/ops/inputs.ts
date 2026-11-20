import { AtropyleError, parseDuration } from '@atropyle/sdk';
import * as z from 'zod/v4';
import { AssetKindSchema } from './schemas';

const addr = (what: string) => z.string().describe(`${what}: a 0x address`);

export const HeirInputSchema = z.object({
  account: addr('Heir'),
  bps: z.number().int().optional().describe('Share in basis points (10000 = 100%)'),
  percent: z.number().optional().describe('Share in percent. Give bps or percent, not both'),
});
export const TimingInputSchema = z.union([
  z.enum(['drill', 'sixMonths', 'twelveMonths']).describe('Timing preset'),
  z.object({
    period: z.union([z.number(), z.string()]).describe('Check-in period: seconds, or 45s, 90m, 12h, 3d, 2w'),
    threshold: z.number().int().describe('Missed periods before the alarm (1 to 15)'),
    window: z.union([z.number(), z.string()]).describe('Time the owner has to cancel an alarm'),
  }),
]);
export const AssetInputSchema = z.object({
  kind: AssetKindSchema,
  token: addr('Token contract'),
  id: z.union([z.string(), z.number()]).optional().describe('Token id, for ERC-721 and ERC-1155'),
  heir: z.number().int().optional().describe('Index of the heir who receives this NFT'),
});
/** Loose on purpose: unknown keys reach validatePlan, which reports them as UNKNOWN_FIELD. */
export const PlanInputSchema = z
  .looseObject({
    version: z.literal(1).optional(),
    owner: addr('Owner').optional(),
    drill: z.boolean().optional(),
    heirs: z.array(HeirInputSchema),
    guardians: z.array(z.string()).optional(),
    k: z.number().int().optional(),
    recoveryEnabled: z.boolean().optional(),
    timing: TimingInputSchema,
    assets: z.array(AssetInputSchema).optional(),
  })
  .describe('An atropyle.plan.json document');

export const VaultActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('checkIn') }),
  z.object({ type: z.literal('setHeirs'), heirs: z.array(HeirInputSchema) }),
  z.object({
    type: z.literal('setGuardians'),
    guardians: z.array(z.string()),
    k: z.number().int(),
    recoveryEnabled: z.boolean(),
  }),
  z.object({ type: z.literal('setTiming'), timing: TimingInputSchema }),
  z.object({ type: z.literal('setAssets'), assets: z.array(AssetInputSchema) }),
  z.object({ type: z.literal('attestDeath'), on: z.boolean().describe('false withdraws an earlier attestation') }),
  z.object({
    type: z.literal('voteRecovery'),
    target: z.string().nullable().describe('New wallet that receives everything; null withdraws the vote'),
  }),
  z.object({ type: z.literal('poke') }),
  z.object({ type: z.literal('distribute') }),
  z.object({ type: z.literal('revokeAll') }),
]);
export const AllowanceSchema = z.enum(['exact', 'unlimited']);
export const AtSchema = z
  .union([z.string(), z.number()])
  .describe('When: unix seconds, ISO 8601, or +<duration> after the latest block, such as +3d');

export const GetVaultInputSchema = z.object({
  vault: addr('Vault'),
  as: addr('Account whose roles to show').optional(),
});
export const ListVaultsInputSchema = z.object({ account: addr('Account') });
export const SimulateInputSchema = z.object({
  vault: addr('Vault, for action mode').optional(),
  action: VaultActionSchema.optional(),
  plan: PlanInputSchema.optional().describe('Plan mode: preview the timeline of a vault that does not exist yet'),
  drill: z.boolean().optional(),
  as: addr('Who acts (action mode) or the owner (plan mode)').optional(),
  at: AtSchema.optional(),
});
export const CheckPlanInputSchema = z.object({
  plan: PlanInputSchema,
  owner: addr('Owner; defaults to plan.owner').optional(),
  drill: z.boolean().optional(),
});
export const VerifyInputSchema = z.object({
  vault: addr('Vault to check as well').optional(),
  policy: z.boolean().optional().describe('false skips the 2^26 policy proof and only checks the vault'),
});
export const PrepareCreateVaultInputSchema = z.object({
  plan: PlanInputSchema,
  owner: addr('Owner, who signs; defaults to plan.owner').optional(),
  drill: z.boolean().optional(),
  feeToken: addr('Fee token').optional(),
  salt: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .optional(),
  allowance: AllowanceSchema.optional(),
  webUrl: z.url().optional().describe('Base URL of the Atropyle web app for the signing link'),
});
export const PrepareActionInputSchema = z.object({
  vault: addr('Vault'),
  action: VaultActionSchema,
  as: addr('Who signs'),
  allowance: AllowanceSchema.optional(),
  at: AtSchema.optional(),
  webUrl: z.url().optional().describe('Base URL of the Atropyle web app for the signing link'),
});

export type VaultActionInput = z.output<typeof VaultActionSchema>;
export type GetVaultInput = z.output<typeof GetVaultInputSchema>;
export type ListVaultsInput = z.output<typeof ListVaultsInputSchema>;
export type SimulateInput = z.output<typeof SimulateInputSchema>;
export type CheckPlanInput = z.output<typeof CheckPlanInputSchema>;
export type VerifyInput = z.output<typeof VerifyInputSchema>;
export type PrepareCreateVaultInput = z.output<typeof PrepareCreateVaultInputSchema>;
export type PrepareActionInput = z.output<typeof PrepareActionInputSchema>;

const badTime = () =>
  new AtropyleError('INVALID_OPTIONS', {
    message: 'Cannot read this time.',
    hint: 'Use unix seconds, an ISO 8601 date such as 2026-12-01T00:00:00Z, or +<duration> such as +3d.',
  });

/** `--at` and the `at` tool argument. `base` is the timestamp of the latest block. */
export function parseAt(input: string | number, base: bigint): bigint {
  if (typeof input === 'number') {
    if (!Number.isSafeInteger(input) || input < 0) throw badTime();
    return BigInt(input);
  }
  const s = input.trim();
  if (/^\d+$/.test(s)) return BigInt(s);
  if (s.startsWith('+')) {
    try {
      return base + BigInt(parseDuration(s.slice(1), 'at'));
    } catch {
      throw badTime();
    }
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const ms = Date.parse(s);
    if (Number.isFinite(ms) && ms >= 0) return BigInt(Math.floor(ms / 1000));
  }
  throw badTime();
}
