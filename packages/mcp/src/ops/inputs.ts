import { AtropyleError, parseDuration } from '@atropyle/sdk';
import * as z from 'zod/v4';
import { AssetKindSchema } from './schemas';

const addr = (what: string) => z.string().describe(`${what}: a 0x address`);

/**
 * Loose at every level: an unknown key reaches the SDK (validatePlan and validateSection report UNKNOWN_FIELD for it, and
 * the action path rejects it with PLAN_INVALID), so a misnamed field is an error and never silently dropped.
 */
export const HeirInputSchema = z.looseObject({
  account: addr('Heir'),
  bps: z.number().int().optional().describe('Share in basis points (10000 = 100%)'),
  percent: z.number().optional().describe('Share in percent. Give bps or percent, not both'),
});
export const TimingInputSchema = z.union([
  z.enum(['drill', 'sixMonths', 'twelveMonths']).describe('Timing preset'),
  z.looseObject({
    period: z.union([z.number(), z.string()]).describe('Check-in period: seconds, or 45s, 90m, 12h, 3d, 2w'),
    threshold: z.number().int().describe('Missed periods before the alarm (1 to 15)'),
    window: z.union([z.number(), z.string()]).describe('Time the owner has to cancel an alarm'),
  }),
]);
export const AssetInputSchema = z.looseObject({
  kind: AssetKindSchema,
  token: addr('Token contract'),
  id: z.union([z.string(), z.number()]).optional().describe('Token id, for ERC-721 and ERC-1155'),
  heir: z.number().int().optional().describe('Index of the heir who receives this NFT'),
});
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
    hint: 'Use unix seconds, a date (2026-12-01, read as UTC midnight), a date-time with its zone (2026-12-01T00:00:00Z or 2026-12-01T09:00:00+07:00), or +<duration> such as +3d.',
  });

const MAX_UNIX_SECONDS = 999_999_999_999n;
// A date, or a date-time that names its zone. A date-time without a zone would depend on the host's local time.
const ISO_AT = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

/** Seconds of an anchored ISO 8601 string, or null when it is malformed, ambiguous or not a real calendar date. */
function isoSeconds(s: string): bigint | null {
  const m = ISO_AT.exec(s);
  if (!m) return null;
  const [y, mo, d, h, mi, sec] = m.slice(1, 7).map((x) => Number(x ?? 0));
  const ms = Date.UTC(y, mo - 1, d, h, mi, sec);
  const back = new Date(ms);
  // Rolled over (2026-02-30) or out of range (hour 24, minute 60).
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  if (h > 23 || mi > 59 || sec > 59) return null;
  let offset = 0;
  const zone = m[7];
  if (zone && zone !== 'Z') {
    const [zh, zm] = zone.slice(1).split(':').map(Number);
    if (zh > 23 || zm > 59) return null;
    offset = (zone[0] === '-' ? -1 : 1) * (zh * 60 + zm) * 60_000;
  }
  const utc = ms - offset;
  return utc >= 0 ? BigInt(Math.floor(utc / 1000)) : null;
}

/** `--at` and the `at` tool argument. `base` is the timestamp of the latest block. */
export function parseAt(input: string | number, base: bigint): bigint {
  if (typeof input === 'number') {
    if (!Number.isSafeInteger(input) || input < 0 || BigInt(input) > MAX_UNIX_SECONDS) throw badTime();
    return BigInt(input);
  }
  const s = input.trim();
  if (/^\d+$/.test(s)) {
    if (BigInt(s) > MAX_UNIX_SECONDS) throw badTime();
    return BigInt(s);
  }
  if (s.startsWith('+')) {
    try {
      return base + BigInt(parseDuration(s.slice(1), 'at'));
    } catch {
      throw badTime();
    }
  }
  const iso = isoSeconds(s);
  if (iso === null) throw badTime();
  return iso;
}
