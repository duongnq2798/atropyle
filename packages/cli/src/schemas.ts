import {
  CheckPlanOutputSchema,
  ErrorJsonSchema,
  GetVaultOutputSchema,
  IntegrityReportSchema,
  ListVaultsOutputSchema,
  PlanConfigSchema,
  PlanInputSchema,
  PlanIssueSchema,
  PrepareOutputSchema,
  SchemaVersionSchema,
  SimulateOutputSchema,
  UntrustedBlockSchema,
  VerifyOutputSchema,
  WarningSchema,
} from '@atropyle/mcp/ops';
import * as z from 'zod/v4';

const DoctorRpcSchema = z.object({
  role: z.enum(['read', 'verify']),
  /** 1-based operator of quorumRpcUrls, null for the read RPC. */
  operator: z.number().int().nullable(),
  host: z.string(),
  ok: z.boolean(),
  chainId: z.number().int().nullable(),
  latencyMs: z.number().int().nullable(),
  error: z.enum(['WRONG_CHAIN', 'RPC_UNAVAILABLE', 'RPC_RATE_LIMITED']).nullable(),
});

export const DoctorOutputSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  ok: z.boolean(),
  cli: z.string(),
  node: z.object({ version: z.string(), required: z.literal('>=20'), ok: z.boolean() }),
  deployment: z.string(),
  chainId: z.number().int(),
  rpcs: z.array(DoctorRpcSchema),
  integrity: IntegrityReportSchema.nullable(),
  integrityError: ErrorJsonSchema.nullable(),
  summary: z.string(),
  warnings: z.array(WarningSchema),
  untrusted: UntrustedBlockSchema,
});
export type DoctorOutput = z.output<typeof DoctorOutputSchema>;

export const PlanInitOutputSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  ok: z.boolean(),
  file: z.string(),
  written: z.boolean(),
  plan: PlanInputSchema,
  config: PlanConfigSchema.nullable(),
  issues: z.array(PlanIssueSchema),
  next: z.array(z.string()).describe('Commands to run next'),
  summary: z.string(),
  warnings: z.array(WarningSchema),
  untrusted: UntrustedBlockSchema,
});
export type PlanInitOutput = z.output<typeof PlanInitOutputSchema>;

/** One published JSON Schema per command: packages/cli/schemas/<name>.json, plus error.json (decision 16). */
export const CLI_SCHEMAS: Record<string, z.ZodType> = {
  status: GetVaultOutputSchema,
  vaults: ListVaultsOutputSchema,
  simulate: SimulateOutputSchema,
  'plan-init': PlanInitOutputSchema,
  'plan-check': CheckPlanOutputSchema,
  prepare: PrepareOutputSchema,
  verify: VerifyOutputSchema,
  doctor: DoctorOutputSchema,
};
