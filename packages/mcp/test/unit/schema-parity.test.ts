import type {
  Asset,
  AssetStatus,
  FeeOption,
  FeeQuote,
  Heir,
  IntegrityCheck,
  IntegrityReport,
  NetlistReport,
  PlanConfig,
  PlanIssue,
  PolicyInputs,
  PolicyVerification,
  PreparedTx,
  Recipient,
  SendCallsParams,
  Timeline,
  TimelineEvent,
  Timing,
  TokenCheck,
  TokenInfo,
  TxPlan,
  VaultBinding,
  VaultConfig,
  VaultRef,
  VaultStatus,
  Warning,
  WhatIfResult,
} from '@atropyle/sdk';
import type { CodeCheck, CpuCheck, P9Mismatch, P9OperatorResult, P9Result } from '@atropyle/sdk/verify';
import { describe, expectTypeOf, it } from 'vitest';
import type * as z from 'zod/v4';
import type * as S from '../../src/ops/schemas';

/**
 * Compile-time parity. `z.object` drops keys it does not list, so a field the SDK adds to one of these types would
 * vanish from every output without a single failing test. Each assertion below compares the keys of the schema's
 * output with the keys of the SDK type; `npm run typecheck` (tsc over `test/`) fails the moment they differ.
 * The vitest run only executes the empty bodies: the check is made by the compiler.
 */
type Keys<T> = keyof T;
type SameKeys<Schema extends z.ZodType, Sdk> = [Keys<z.output<Schema>>] extends [Keys<Sdk>]
  ? [Keys<Sdk>] extends [Keys<z.output<Schema>>]
    ? true
    : { missingFromSchema: Exclude<Keys<Sdk>, Keys<z.output<Schema>>> }
  : { extraInSchema: Exclude<Keys<z.output<Schema>>, Keys<Sdk>> };

type Elem<T> = T extends readonly (infer E)[] ? E : never;

describe('schemas mirror the SDK types field for field', () => {
  it('has the same keys', () => {
    expectTypeOf<SameKeys<typeof S.TimingSchema, Timing>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.HeirSchema, Heir>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.AssetSchema, Asset>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.VaultConfigSchema, VaultConfig>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.PlanConfigSchema, PlanConfig>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.WarningSchema, Warning>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.TokenInfoSchema, TokenInfo>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.AssetStatusSchema, AssetStatus>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.VaultStatusSchema, VaultStatus>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.VaultBindingSchema, VaultBinding>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.TimelineEventSchema, TimelineEvent>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.TimelineSchema, Timeline>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.PolicyInputsSchema, PolicyInputs>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.RecipientSchema, Recipient>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.WhatIfResultSchema, WhatIfResult>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.PreparedTxSchema, PreparedTx>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.TxPlanSchema, TxPlan>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.SendCallsSchema, SendCallsParams>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.PlanIssueSchema, PlanIssue>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.FeeOptionSchema, FeeOption>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.FeeQuoteSchema, FeeQuote>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.TokenCheckSchema, TokenCheck>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.VaultRefSchema, VaultRef>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.IntegrityCheckSchema, IntegrityCheck>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.IntegrityReportSchema, IntegrityReport>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.CpuCheckSchema, CpuCheck>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.CodeCheckSchema, CodeCheck>>().toEqualTypeOf<true>();
    expectTypeOf<
      SameKeys<ReturnType<typeof S.CodeCheckSchema.shape.expected.unwrap>, NonNullable<CodeCheck['expected']>>
    >().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.P9Schema, P9Result>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.P9Schema.shape.operators.element, P9OperatorResult>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.P9MismatchSchema, P9Mismatch>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.NetlistReportSchema, NetlistReport>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.PolicyVerificationSchema, PolicyVerification>>().toEqualTypeOf<true>();
    expectTypeOf<SameKeys<typeof S.FailureSchema, Elem<PolicyVerification['firstFailures']>>>().toEqualTypeOf<true>();
  });
});
