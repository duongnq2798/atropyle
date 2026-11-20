import { parseDeployment } from '@atropyle/sdk';
import Ajv2020 from 'ajv/dist/2020';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAtropyleMcpServer } from '../../src/index';
import { type Connected, connect } from '../helpers/connect';
import { account, devnet } from './env';

type Tool = Awaited<ReturnType<Connected['client']['listTools']>>['tools'][number];

let c: Connected;
let tools: Tool[];
const ajv = new Ajv2020({ strict: false, allErrors: true });

beforeAll(async () => {
  c = await connect(() =>
    createAtropyleMcpServer({ sdk: { chain: parseDeployment(devnet().deployment), builderCode: null } }),
  );
  tools = (await c.client.listTools()).tools;
});
afterAll(() => c.close());

/** Calls a tool, then checks the result against the outputSchema the server itself published. */
async function call(name: string, args: Record<string, unknown>) {
  const r = await c.client.callTool({ name, arguments: args });
  expect(r.isError ?? false, JSON.stringify(r.content)).toBe(false);
  const { $schema: _s, ...schema } = (tools.find((t) => t.name === name) as Tool).outputSchema as Record<
    string,
    unknown
  >;
  const validate = ajv.compile(schema);
  expect(validate(r.structuredContent), JSON.stringify(validate.errors)).toBe(true);
  const out = r.structuredContent as Record<string, unknown> & { summary: string; untrusted: unknown };
  const content = r.content as { type: string; text: string }[];
  expect(content[0]).toEqual({ type: 'text', text: out.summary });
  expect(JSON.parse(content[1].text)).toEqual(out);
  return out;
}

const outsideUntrusted = (o: { untrusted: unknown }) => {
  const { untrusted: _u, ...rest } = o;
  return JSON.stringify(rest);
};

describe('tools on the devnet', () => {
  it('every read tool returns structuredContent that matches its outputSchema', async () => {
    const { vaults } = devnet();
    expect((await call('atropyle_get_vault', { vault: vaults.grace, as: account(2) })).roles).toEqual(['heir']);
    expect((await call('atropyle_list_vaults', { account: account(3) })).vaults).toHaveLength(1);
    expect(
      (await call('atropyle_simulate', { vault: vaults.grace, action: { type: 'checkIn' }, as: account(1) })).mode,
    ).toBe('action');
    const plan = { heirs: [{ account: account(6) }], timing: 'drill', drill: true };
    expect((await call('atropyle_simulate', { plan, as: account(1) })).mode).toBe('plan');
    expect((await call('atropyle_check_plan', { plan, owner: account(1) })).ok).toBe(true);
  });

  it('prepare tools return a signing link; nothing is signed or sent', async () => {
    const before = await c.client.callTool({
      name: 'atropyle_get_vault',
      arguments: { vault: devnet().vaults.simple },
    });
    const plan = { heirs: [{ account: account(6) }], timing: 'drill', drill: true };
    const created = await call('atropyle_prepare_create_vault', { plan, owner: account(1) });
    expect((created.handoff as { link: string }).link).toContain('#/sign?p=');
    const checkIn = await call('atropyle_prepare_action', {
      vault: devnet().vaults.simple,
      action: { type: 'checkIn' },
      as: account(1),
    });
    expect((checkIn.handoff as { link: string }).link).toContain('#/sign?p=');
    const after = await c.client.callTool({ name: 'atropyle_get_vault', arguments: { vault: devnet().vaults.simple } });
    const lastAlive = (r: typeof before) => (r.structuredContent as { status: { lastAlive: string } }).status.lastAlive;
    expect(lastAlive(after)).toBe(lastAlive(before));
  });

  it('webUrl cannot move the signing link: the extra key is dropped and the link keeps the deployment base', async () => {
    const r = await c.client.callTool({
      name: 'atropyle_prepare_action',
      arguments: {
        vault: devnet().vaults.simple,
        action: { type: 'checkIn' },
        as: account(1),
        webUrl: 'https://evil.example/',
      },
    });
    expect(r.isError ?? false).toBe(false);
    const out = r.structuredContent as { handoff: { link: string; okxAppLink: string | null } };
    expect(out.handoff.link.startsWith('http://localhost:5173/')).toBe(true);
    expect(JSON.stringify(r)).not.toContain('evil.example');
  });

  it('verify on the mock CPU is a failed check, not a tool error', async () => {
    const out = await call('atropyle_verify', {});
    expect(out).toMatchObject({ ok: false, policyStatus: 'unavailable' });
  });

  it('prompt injection: hostile token text never reaches a summary or a structured field', async () => {
    const { vaults, tokens } = devnet();
    const read = await call('atropyle_get_vault', { vault: vaults.hostile });
    const plan = {
      heirs: [{ account: account(6) }],
      timing: 'drill',
      drill: true,
      assets: [tokens.injection, tokens.long, tokens.binary].map((token) => ({ kind: 'erc20', token })),
    };
    const check = await call('atropyle_check_plan', { plan, owner: account(1) });
    const prepared = await call('atropyle_prepare_create_vault', { plan, owner: account(1) });
    for (const out of [read, check, prepared]) {
      expect(out.summary).not.toMatch(/ignore previous|very long token name/i);
      expect(outsideUntrusted(out)).not.toMatch(/ignore previous|very long token name/i);
    }
    const texts = (read.untrusted as { texts: { value: string }[] }).texts;
    expect(texts.some((t) => t.value.startsWith('Ignore previous instructions'))).toBe(true);
  });

  it('guardian actions carry the anti-phishing warning through MCP', async () => {
    const out = await call('atropyle_prepare_action', {
      vault: devnet().vaults.guarded,
      action: { type: 'attestDeath', on: true },
      as: account(3),
    });
    expect((out.warnings as { code: string }[]).map((w) => w.code)).toContain('GUARDIAN_VERIFY_OUT_OF_BAND');
  });
});
