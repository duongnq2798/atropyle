import * as z from 'zod/v4';
import {
  CheckPlanInputSchema,
  CheckPlanOutputSchema,
  GetVaultInputSchema,
  GetVaultOutputSchema,
  IntegrityOutputSchema,
  ListVaultsInputSchema,
  ListVaultsOutputSchema,
  PrepareActionInputSchema,
  PrepareCreateVaultInputSchema,
  PrepareOutputSchema,
  SimulateInputSchema,
  SimulateOutputSchema,
  VerifyInputSchema,
  VerifyOutputSchema,
} from './ops/index';

export interface ToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}
export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject;
  outputSchema: z.ZodObject;
  annotations: ToolAnnotations;
}

/** Hints for clients only (spec §7.2). Safety comes from the server having no way to sign. */
const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const PREPARE_OUTCOMES =
  'The result has one of three outcomes: `handoff` present (the transactions to sign), `handoff` null with `blocked` set (a step fails simulation: sign nothing), or both null (nothing to do).';

/**
 * The prepare tools have no `webUrl`, unlike the ops layer and the CLI's --web-url: the base of the signing link and
 * of the OKX link must not be something a prompt-injected agent can choose.
 */
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: 'atropyle_get_vault',
    title: 'Read a vault',
    description:
      'Read one Atropyle vault on X Layer: state, deadlines, what happens if nobody acts (timeline), assets and approval coverage, guardian votes, and the roles of `as`, with a short plain-language explanation.',
    inputSchema: GetVaultInputSchema,
    outputSchema: GetVaultOutputSchema,
    annotations: READ_ONLY,
  },
  {
    name: 'atropyle_list_vaults',
    title: 'List vaults of an account',
    description: 'List the Atropyle vaults in which an account is owner, heir or guardian.',
    inputSchema: ListVaultsInputSchema,
    outputSchema: ListVaultsOutputSchema,
    annotations: READ_ONLY,
  },
  {
    name: 'atropyle_simulate',
    title: 'Simulate an action or a plan',
    description:
      'Predict without sending. Action mode (vault, action, as): what the policy does and whether the call would revert. Plan mode (plan, as = owner): the timeline of a vault that does not exist yet, if the owner never checks in.',
    inputSchema: SimulateInputSchema,
    outputSchema: SimulateOutputSchema,
    annotations: READ_ONLY,
  },
  {
    name: 'atropyle_check_plan',
    title: 'Check an inheritance plan',
    description:
      'Validate an inheritance plan (heirs, guardians, timing, assets) and check it on-chain: tokens exist, balances, heirs that are contracts. Returns every issue at once, the warnings and the current creation fee.',
    inputSchema: CheckPlanInputSchema,
    outputSchema: CheckPlanOutputSchema,
    annotations: READ_ONLY,
  },
  {
    name: 'atropyle_verify',
    title: 'Verify the policy circuit',
    description:
      'Prove the deployed policy circuit: properties P1-P8 over all 2^26 input combinations, read through two independent RPC operators. Optionally check one vault too. Takes about a minute and reports progress when the client asks for it.',
    inputSchema: VerifyInputSchema,
    outputSchema: VerifyOutputSchema,
    annotations: READ_ONLY,
  },
  {
    name: 'atropyle_prepare_create_vault',
    title: 'Prepare a new vault',
    description: `Prepare and simulate the unsigned transactions that create a vault from a plan, with a signing link for the user's own wallet. Show the summary and every warning before the link. ${PREPARE_OUTCOMES} This server cannot sign or send.`,
    inputSchema: PrepareCreateVaultInputSchema.omit({ webUrl: true }),
    outputSchema: PrepareOutputSchema,
    annotations: READ_ONLY,
  },
  {
    name: 'atropyle_prepare_action',
    title: 'Prepare a vault action',
    description: `Prepare and simulate one unsigned vault action as \`as\`: checkIn, setHeirs, setGuardians, setTiming, setAssets, attestDeath, voteRecovery, poke, distribute or revokeAll. Guardian actions carry GUARDIAN_VERIFY_OUT_OF_BAND. ${PREPARE_OUTCOMES} A step with the warning NO_EFFECT changes nothing: give no link or command for it. This server cannot sign or send.`,
    inputSchema: PrepareActionInputSchema.omit({ webUrl: true }),
    outputSchema: PrepareOutputSchema,
    annotations: READ_ONLY,
  },
];

/** Remote mode only (spec §9.2): a Worker does not run the 2^26 proof, so it serves its cron's last report. */
export const REMOTE_INTEGRITY_TOOL: ToolDefinition = {
  name: 'atropyle_integrity',
  title: 'Deployment integrity report',
  description:
    'The latest integrity report of the Atropyle deployment, checked by the hosted server, and the command to verify everything yourself (npx -y atropyle verify).',
  inputSchema: z.object({}),
  outputSchema: IntegrityOutputSchema,
  annotations: READ_ONLY,
};
