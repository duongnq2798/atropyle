import { afterEach, describe, expect, it } from 'vitest';
import { createAtropyleMcpServer } from '../../src/index';
import { type Connected, connect } from '../helpers/connect';
import { fixtureDeployment } from '../helpers/fixtures';

const OWNER = '0x1000000000000000000000000000000000000009';
let c: Connected | undefined;
const open = async (chain = fixtureDeployment()) => {
  c = await connect(() => createAtropyleMcpServer({ sdk: { chain } }));
  return c.client;
};
afterEach(async () => {
  await c?.close();
  c = undefined;
});
const textOf = (r: { contents: unknown[] }) => (r.contents[0] as { text: string }).text;

describe('resources', () => {
  it('lists the policy spec and the deployment of the current chain', async () => {
    const client = await open();
    expect(client.getDiscoverResult()?.capabilities).toMatchObject({ resources: {}, prompts: {} });
    const uris = (await client.listResources()).resources.map((r) => r.uri);
    expect(uris).toEqual(expect.arrayContaining(['atropyle://policy/spec', 'atropyle://deployments/local']));
    const templates = (await client.listResourceTemplates()).resourceTemplates.map((t) => t.uriTemplate);
    expect(templates).toContain('atropyle://deployments/{chain}');
  });

  it('serves the deployment as JSON', async () => {
    const client = await open();
    const r = await client.readResource({ uri: 'atropyle://deployments/local' });
    expect(r.contents[0]).toMatchObject({ uri: 'atropyle://deployments/local', mimeType: 'application/json' });
    expect(JSON.parse(textOf(r))).toMatchObject({
      chainId: 31337,
      factory: '0x1000000000000000000000000000000000000001',
    });
  });

  it('reduces every RPC URL to its origin, so a keyed URL never reaches the model', async () => {
    const d = fixtureDeployment();
    const keyed = {
      ...d,
      rpcUrls: ['https://user:pw@rpc.example:8545/v2/SECRETKEY1?apikey=SECRETKEY2#SECRETKEY3'],
      quorumRpcUrls: [['https://a.example/v1/SECRETKEY4'], ['http://b.example:9000/?token=SECRETKEY5']],
    };
    const client = await open(keyed);
    const text = textOf(await client.readResource({ uri: 'atropyle://deployments/local' }));
    expect(text).not.toMatch(/SECRETKEY|apikey|token|user|pw@/);
    expect(JSON.parse(text)).toMatchObject({
      rpcUrls: ['https://rpc.example:8545'],
      quorumRpcUrls: [['https://a.example'], ['http://b.example:9000']],
    });
  });

  it('prints (invalid URL) for an RPC URL that does not parse', async () => {
    const client = await open({ ...fixtureDeployment(), rpcUrls: ['not a url'] });
    const json = JSON.parse(textOf(await client.readResource({ uri: 'atropyle://deployments/local' })));
    expect(json.rpcUrls).toEqual(['(invalid URL)']);
  });

  it('resolves the built-in local deployment while the current chain is another one', async () => {
    const client = await open({ ...fixtureDeployment(), chainId: 196 });
    const uris = (await client.listResources()).resources.map((r) => r.uri);
    expect(uris).toContain('atropyle://deployments/xlayer');
    const local = JSON.parse(textOf(await client.readResource({ uri: 'atropyle://deployments/local' })));
    expect(local.chainId).toBe(31337);
    const here = JSON.parse(textOf(await client.readResource({ uri: 'atropyle://deployments/xlayer' })));
    expect(here.chainId).toBe(196);
  });

  it('serves the policy spec with every state and property', async () => {
    const client = await open();
    const md = textOf(await client.readResource({ uri: 'atropyle://policy/spec' }));
    for (const word of ['releasedInherit', 'releasedRecover', 'windowDone', 'KofN5', 'Ge4']) expect(md).toContain(word);
    for (let i = 1; i <= 8; i++) expect(md).toContain(`| P${i} |`);
    // Transition lines and the spec §3 qualifiers an agent would otherwise repeat as hard guarantees.
    for (const line of [
      '1. Released: the state stays the same and every output is 0.',
      '2. alive: back to active.',
      '3. recovery: recQ and windowDone give releasedRecover; recQ keeps recovery; late gives grace; otherwise active.',
      '4. grace: recQ gives recovery; windowDone and (inhQ or maxed) give releasedInherit; otherwise grace.',
      '5. active: recQ gives recovery; late gives grace; otherwise active.',
    ]) {
      expect(md).toContain(line);
    }
    expect(md).toContain('| P6 | when the old state is not Released,');
    expect(md).toContain('| P3 | when the old state is not Released,');
    expect(md).toContain('| P4 | when the old state is not Released,');
    expect(md).toContain('a recovery candidate is set (not the zero address)');
  });

  it('refuses an unknown chain', async () => {
    const client = await open();
    await expect(client.readResource({ uri: 'atropyle://deployments/mars' })).rejects.toThrow();
  });
});

describe('prompts', () => {
  it('plan_inheritance runs check_plan, then simulate, then prepare_create_vault', async () => {
    const client = await open();
    expect((await client.listPrompts()).prompts.map((p) => p.name).sort()).toEqual([
      'guardian_briefing',
      'plan_inheritance',
    ]);
    const r = await client.getPrompt({ name: 'plan_inheritance', arguments: { owner: OWNER } });
    const text = (r.messages[0].content as { text: string }).text;
    expect(text).toContain(OWNER);
    const order = ['atropyle_check_plan', 'atropyle_simulate', 'atropyle_prepare_create_vault'].map((t) =>
      text.indexOf(t),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain('Never ask for my private key');
    expect(text).toContain('If `handoff` is null, read `blocked`');
  });

  it('guardian_briefing carries the anti-phishing checklist', async () => {
    const client = await open();
    const r = await client.getPrompt({ name: 'guardian_briefing', arguments: { vault: OWNER } });
    const text = (r.messages[0].content as { text: string }).text;
    expect(text).toContain('by phone or in person');
    expect(text).toContain('Never vote for a recovery address that you received by message');
    expect(text).toContain('GUARDIAN_VERIFY_OUT_OF_BAND');
    expect(text).toContain('atropyle_verify');
  });
});
