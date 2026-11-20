import {
  type AtropyleClient,
  type AtropyleOptions,
  createAtropyle,
  type IntegrityReport,
  stringify,
} from '@atropyle/sdk';
import { type CallToolResult, McpServer } from '@modelcontextprotocol/server';
import { REMOTE_INSTRUCTIONS, SERVER_INSTRUCTIONS } from './instructions';
import {
  type CheckPlanInput,
  checkPlan,
  errorOutput,
  type GetVaultInput,
  getVault,
  integrityOutput,
  type ListVaultsInput,
  listVaults,
  type PrepareActionInput,
  type PrepareCreateVaultInput,
  type ProgressFn,
  prepareAction,
  prepareCreateVault,
  type SimulateInput,
  simulate,
  throttleProgress,
  type VerifyInput,
  verify,
} from './ops/index';
import { registerPrompts } from './prompts';
import { registerResources } from './resources';
import { REMOTE_INTEGRITY_TOOL, TOOL_DEFINITIONS, type ToolDefinition } from './tools';
import { VERSION } from './version';

export interface AtropyleMcpOptions {
  sdk: AtropyleOptions;
  /** Hosted /mcp (spec §9.2): no 2^26 proof on the server; serve the cron's latest integrity report instead. */
  remote?: { latestIntegrity(): Promise<{ report: IntegrityReport; checkedAt: string } | null> };
}

type Run = (args: Record<string, unknown>, ctx: unknown) => Promise<{ summary: string }>;

/** The parts of the SDK's request context that progress needs. Checked by the progress test. */
interface ProgressContext {
  mcpReq?: {
    _meta?: { progressToken?: string | number };
    notify(n: {
      method: 'notifications/progress';
      params: { progressToken: string | number; progress: number; total: number; message: string };
    }): Promise<void>;
  };
}

function progressOf(ctx: unknown): ProgressFn | undefined {
  const req = (ctx as ProgressContext | undefined)?.mcpReq;
  const token = req?._meta?.progressToken;
  if (!req || token === undefined) return undefined;
  return throttleProgress((progress, total) => {
    req
      .notify({
        method: 'notifications/progress',
        params: { progressToken: token, progress, total, message: 'Checking policy combinations' },
      })
      // Progress is best effort: a client that went away must not fail the proof.
      .catch(() => {});
  });
}

function textResult(out: { summary: string }, isError: boolean): CallToolResult {
  const content: CallToolResult['content'] = [
    { type: 'text', text: out.summary },
    { type: 'text', text: stringify(out, 2) },
  ];
  // An error result has no structuredContent: MCP TypeScript SDK v1 clients validate it against the outputSchema even
  // when isError is set, and the error envelope matches no success schema. The error JSON is in the second text block.
  return isError ? { isError: true, content } : { content, structuredContent: out as Record<string, unknown> };
}

/** One server over one SDK client. runStdio shares the client so the verifyPolicy cache survives. */
export function buildMcpServer(atro: AtropyleClient, o: AtropyleMcpOptions): McpServer {
  const server = new McpServer(
    { name: 'atropyle', version: VERSION },
    { instructions: o.remote ? REMOTE_INSTRUCTIONS : SERVER_INSTRUCTIONS },
  );
  const runs: Record<string, Run> = {
    atropyle_get_vault: (a) => getVault(atro, a as GetVaultInput),
    atropyle_list_vaults: (a) => listVaults(atro, a as ListVaultsInput),
    atropyle_simulate: (a) => simulate(atro, a as SimulateInput),
    atropyle_check_plan: (a) => checkPlan(atro, a as CheckPlanInput),
    atropyle_verify: (a, ctx) => verify(atro, a as VerifyInput, { onProgress: progressOf(ctx) }),
    // webUrl is not in the tool schemas; passing undefined keeps it out even if a schema change lets it through.
    atropyle_prepare_create_vault: (a) =>
      prepareCreateVault(atro, { ...(a as PrepareCreateVaultInput), webUrl: undefined }),
    atropyle_prepare_action: (a) => prepareAction(atro, { ...(a as PrepareActionInput), webUrl: undefined }),
  };
  const remote = o.remote;
  const tools: { def: ToolDefinition; run: Run }[] = TOOL_DEFINITIONS.filter(
    (d) => !(remote && d.name === 'atropyle_verify'),
  ).map((def) => {
    const run = runs[def.name];
    if (!run) throw new Error(`No runner for tool ${def.name}`);
    return { def, run };
  });
  if (remote)
    tools.push({ def: REMOTE_INTEGRITY_TOOL, run: async () => integrityOutput(await remote.latestIntegrity()) });

  for (const { def, run } of tools) {
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.inputSchema,
        outputSchema: def.outputSchema,
        annotations: def.annotations,
      },
      async (args, ctx) => {
        try {
          // The SDK has already parsed `args` with def.inputSchema.
          return textResult(await run(args as Record<string, unknown>, ctx), false);
        } catch (e) {
          return textResult(errorOutput(e), true);
        }
      },
    );
  }
  registerResources(server, atro);
  registerPrompts(server, o.remote !== undefined);
  return server;
}

/** Spec §7.1: a factory, called again for every request. Each call gets its own server and SDK client. */
export function createAtropyleMcpServer(o: AtropyleMcpOptions): McpServer {
  return buildMcpServer(createAtropyle(o.sdk), o);
}
