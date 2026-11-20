import type { AtropyleClient, IntegrityReport } from '@atropyle/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type AtropyleMcpOptions,
  createAtropyleMcpServer,
  SERVER_INSTRUCTIONS,
  TOOL_DEFINITIONS,
} from '../../src/index';
import { buildMcpServer } from '../../src/server';
import { type Connected, connect } from '../helpers/connect';
import { fixtureDeployment, POLICY } from '../helpers/fixtures';

const STDIO_TOOLS = [
  'atropyle_get_vault',
  'atropyle_list_vaults',
  'atropyle_simulate',
  'atropyle_check_plan',
  'atropyle_verify',
  'atropyle_prepare_create_vault',
  'atropyle_prepare_action',
];
const VAULT = '0x0000000000000000000000000000000000000001';

/** The description of every `recoveryEnabled` property in a JSON Schema, wherever it sits. */
function recoveryDescriptions(schema: unknown): unknown[] {
  if (typeof schema !== 'object' || schema === null) return [];
  const props = (schema as { properties?: Record<string, { description?: unknown }> }).properties;
  const own = props !== undefined && Object.hasOwn(props, 'recoveryEnabled') ? [props.recoveryEnabled.description] : [];
  return [...own, ...Object.values(schema).flatMap(recoveryDescriptions)];
}

const server =
  (extra: Partial<AtropyleMcpOptions> = {}) =>
  () =>
    createAtropyleMcpServer({ sdk: { chain: fixtureDeployment() }, ...extra });

describe('MCP server', () => {
  let c: Connected | undefined;
  afterEach(async () => {
    await c?.close();
    c = undefined;
  });

  it('answers server/discover with its instructions and capabilities', async () => {
    c = await connect(server());
    const d = c.client.getDiscoverResult();
    expect(d?.supportedVersions).toContain('2026-07-28');
    expect(d?.capabilities.tools).toBeDefined();
    expect(c.client.getInstructions()).toBe(SERVER_INSTRUCTIONS);
  });

  it('the instructions state the four rules of spec §7.1', () => {
    expect(SERVER_INSTRUCTIONS).toContain('Never ask for a private key, seed phrase or password');
    expect(SERVER_INSTRUCTIONS).toContain('structured fields');
    expect(SERVER_INSTRUCTIONS).toContain('`untrusted`');
    expect(SERVER_INSTRUCTIONS).toContain('only after the user has seen its `summary` and every warning');
  });

  it('the instructions describe all three outcomes of a prepare tool', () => {
    expect(SERVER_INSTRUCTIONS).toContain('`handoff` is present');
    expect(SERVER_INSTRUCTIONS).toMatch(
      /`handoff` is null and `blocked` is set: a step fails simulation[\s\S]*Sign nothing/,
    );
    expect(SERVER_INSTRUCTIONS).toMatch(/`handoff` and `blocked` are both null[^.]*nothing to do/s);
    expect(SERVER_INSTRUCTIONS).not.toMatch(/null handoff (always|means)/i);
  });

  it('tells the agent to hand over nothing for a step with NO_EFFECT', () => {
    expect(SERVER_INSTRUCTIONS).toContain(
      'If a prepared step carries the warning NO_EFFECT, it would change nothing: do not hand over its link or commands; tell the user when the step can take effect (`timeline.earliestRelease`',
    );
    const d = TOOL_DEFINITIONS.find((t) => t.name === 'atropyle_prepare_action')?.description;
    expect(d).toContain('A step with the warning NO_EFFECT changes nothing: give no link or command for it.');
  });

  it('describes recoveryEnabled as a power wherever a tool takes it', async () => {
    c = await connect(server());
    const { tools } = await c.client.listTools();
    const found = tools
      .map((t) => [t.name, recoveryDescriptions(t.inputSchema)] as const)
      .filter(([, descriptions]) => descriptions.length > 0);
    expect(found.map(([name]) => name).sort()).toEqual([
      'atropyle_check_plan',
      'atropyle_prepare_action',
      'atropyle_prepare_create_vault',
      'atropyle_simulate',
    ]);
    for (const [name, descriptions] of found) {
      for (const d of descriptions) {
        expect(d, name).toContain('Off unless the owner asks for it');
        expect(d, name).toContain('k guardians who agree can move everything in the vault to a wallet they choose');
        expect(d, name).toContain('The owner can stop it only by checking in before the window ends');
        expect(d, name).toContain(
          'Set true only if the owner asked for recovery and would trust any k of the guardians with everything',
        );
      }
    }
  });

  it('lists the 7 tools of the spec, each read-only with an input and an output schema', async () => {
    c = await connect(server());
    const { tools } = await c.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([...STDIO_TOOLS].sort());
    expect(TOOL_DEFINITIONS.map((d) => d.name)).toEqual(STDIO_TOOLS);
    for (const t of tools) {
      expect(t.inputSchema.type).toBe('object');
      expect(t.outputSchema?.type).toBe('object');
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: true });
      expect(t.name).not.toMatch(/send|sign|broadcast|transfer|execute/);
    }
  });

  it('list_vaults is described as owner, heir or guardian, never recovery target', () => {
    const d = TOOL_DEFINITIONS.find((t) => t.name === 'atropyle_list_vaults');
    expect(d?.description).toContain('in which an account is owner, heir or guardian.');
    expect(d?.description).not.toMatch(/recovery target/i);
  });

  it('the prepare tools do not offer webUrl, so an agent cannot redirect the signing link', async () => {
    c = await connect(server());
    const { tools } = await c.client.listTools();
    for (const name of ['atropyle_prepare_create_vault', 'atropyle_prepare_action']) {
      const props = tools.find((t) => t.name === name)?.inputSchema.properties ?? {};
      expect(Object.keys(props)).not.toContain('webUrl');
    }
    // The behavioural check (the link keeps the deployment's base) is in test/integration/tools.test.ts.
  });

  it('a failing tool returns isError with the error envelope, not a protocol error', async () => {
    c = await connect(server());
    const r = await c.client.callTool({ name: 'atropyle_get_vault', arguments: { vault: VAULT } });
    expect(r.isError).toBe(true);
    // v1 clients validate structuredContent even on errors, so an error result has none.
    expect(r.structuredContent).toBeUndefined();
    const text = (r.content as { text: string }[]).map((b) => b.text);
    const envelope = JSON.parse(text[1]);
    expect(envelope).toMatchObject({ schemaVersion: 1, error: { code: 'RPC_UNAVAILABLE' } });
    expect(text[0]).toBe(envelope.summary);
    expect(text).toHaveLength(2);
  });

  it('rejects arguments that do not match the input schema', async () => {
    c = await connect(server());
    for (const action of [{ type: 'sendAll' }, { type: 'checkIn', drill: true }]) {
      const r = await (c as Connected).client.callTool({
        name: 'atropyle_prepare_action',
        arguments: { vault: VAULT, action, as: VAULT },
      });
      expect(r.isError).toBe(true);
      expect(r.structuredContent).toBeUndefined();
      expect((r.content as { text: string }[])[0].text).toMatch(/Input validation error/);
    }
  });

  it('remote mode swaps atropyle_verify for atropyle_integrity', async () => {
    const report = {
      ok: true,
      chainId: 196,
      blockNumber: 9n,
      blockTimestamp: 1n,
      rpcs: 2,
      checks: [],
      warnings: [],
    } satisfies IntegrityReport;
    c = await connect(
      server({ remote: { latestIntegrity: async () => ({ report, checkedAt: '2026-12-01T00:00:00Z' }) } }),
    );
    const names = (await c.client.listTools()).tools.map((t) => t.name);
    expect(names).toHaveLength(7);
    expect(names).not.toContain('atropyle_verify');
    expect(names).toContain('atropyle_integrity');
    const r = await c.client.callTool({ name: 'atropyle_integrity', arguments: {} });
    expect(r.structuredContent).toMatchObject({
      schemaVersion: 1,
      checkedAt: '2026-12-01T00:00:00Z',
      verifyCommand: 'npx -y atropyle verify',
      report: { ok: true, blockNumber: '9' },
    });
    expect(JSON.parse((r.content as { text: string }[])[1].text)).toEqual(r.structuredContent);
  });

  it('reports verify progress to a client that asks for it, about once per percent', async () => {
    const atro = {
      deployment: { chainId: 31337, quorumRpcUrls: [['https://a.test'], ['https://b.test']] },
      verifyPolicy: async (o: { onProgress?: (d: number, t: number) => void }) => {
        for (let i = 1; i <= 1000; i++) o.onProgress?.(i, 1000);
        return POLICY;
      },
    } as unknown as AtropyleClient;
    c = await connect(() => buildMcpServer(atro, { sdk: { chain: fixtureDeployment() } }));
    const seen: number[] = [];
    const r = await c.client.callTool(
      { name: 'atropyle_verify', arguments: {} },
      { onprogress: (p: { progress: number }) => seen.push(p.progress) },
    );
    expect(r.isError ?? false).toBe(false);
    expect(r.structuredContent).toMatchObject({ ok: true, policyStatus: 'verified' });
    await vi.waitFor(() => expect(seen.at(-1)).toBe(1000));
    expect(seen.length).toBeLessThanOrEqual(101);
  });
});

describe('MCP server, remote mode', () => {
  let c: Connected | undefined;
  afterEach(async () => {
    await c?.close();
    c = undefined;
  });
  const remote = (latest: AtropyleMcpOptions['remote']) => () =>
    createAtropyleMcpServer({ sdk: { chain: fixtureDeployment() }, remote: latest });

  it('has its own instructions: no policy verification here, run npx -y atropyle verify yourself', async () => {
    c = await connect(remote({ latestIntegrity: async () => null }));
    const text = c.client.getInstructions() ?? '';
    expect(text).not.toContain('verifies the policy circuit');
    expect(text).toContain('npx -y atropyle verify');
    expect(text).toContain('Never ask for a private key, seed phrase or password');
    expect(text).toContain('`handoff` and `blocked` are both null');
    expect(text).toContain('If a prepared step carries the warning NO_EFFECT, it would change nothing');
  });

  it('the prompts do not send the agent to atropyle_verify, which does not exist here', async () => {
    c = await connect(remote({ latestIntegrity: async () => null }));
    const r = await c.client.getPrompt({ name: 'guardian_briefing', arguments: { vault: VAULT } });
    const text = (r.messages[0].content as { text: string }).text;
    expect(text).not.toContain('atropyle_verify');
    expect(text).toContain('Call atropyle_integrity');
    expect(text).toContain('`npx -y atropyle verify`');
  });

  it('with no report yet, says so and still passes the output schema', async () => {
    c = await connect(remote({ latestIntegrity: async () => null }));
    const r = await c.client.callTool({ name: 'atropyle_integrity', arguments: {} });
    expect(r.isError ?? false).toBe(false);
    expect((r.content as { text: string }[])[0].text).toContain('No integrity report yet');
    expect(r.structuredContent).toMatchObject({ checkedAt: null, report: null });
  });
});
