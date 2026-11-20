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
    const r = await c.client.callTool({
      name: 'atropyle_prepare_action',
      arguments: { vault: VAULT, action: { type: 'checkIn' }, as: VAULT, webUrl: 'https://evil.example/' },
    });
    // Whatever the schema does with the extra key, the link base never comes from it.
    expect(JSON.stringify(r)).not.toContain('evil.example');
  });

  it('a failing tool returns isError with the error envelope, not a protocol error', async () => {
    c = await connect(server());
    const r = await c.client.callTool({ name: 'atropyle_get_vault', arguments: { vault: VAULT } });
    expect(r.isError).toBe(true);
    expect(r.structuredContent).toMatchObject({ schemaVersion: 1, error: { code: 'RPC_UNAVAILABLE' } });
    expect(r.content).toEqual([
      { type: 'text', text: (r.structuredContent as { summary: string }).summary },
      { type: 'text', text: expect.stringContaining('"RPC_UNAVAILABLE"') },
    ]);
  });

  it('rejects arguments that do not match the input schema', async () => {
    c = await connect(server());
    const r = await c.client.callTool({
      name: 'atropyle_prepare_action',
      arguments: { vault: VAULT, action: { type: 'sendAll' }, as: '0x1' },
    });
    expect(r.isError).toBe(true);
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
    } as unknown as IntegrityReport;
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
