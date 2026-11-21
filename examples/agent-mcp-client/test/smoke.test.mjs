import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDevnetEnv } from '../../../scripts/lib/devnet-env.ts';
import { call, connect, converse, exitCodeOf, planOf, run, SERVER_PACKAGE } from '../index.mjs';

const BIN = fileURLToPath(new URL('../../../packages/mcp/dist/bin.js', import.meta.url));
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

describe('client configs', () => {
  it('pin the version of @atropyle/mcp in this repository', () => {
    expect(SERVER_PACKAGE).toBe(`@atropyle/mcp@${readJson('../../../packages/mcp/package.json').version}`);
    for (const file of ['claude-code.mcp.json', 'claude-desktop.json', 'cursor.mcp.json']) {
      const server = readJson(`../config/${file}`).mcpServers.atropyle;
      expect(server, file).toMatchObject({ command: 'npx', args: ['-y', SERVER_PACKAGE] });
    }
  });

  it('splits shares equally when no heir has a percent', () => {
    const plan = planOf({
      owner: '0x1111111111111111111111111111111111111111',
      heirs: ['0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333'],
      drill: true,
    });
    expect(plan.heirs.map((h) => h.percent)).toEqual([50, 50]);
    expect(plan.timing).toBe('drill');
  });
});

/** A client that returns canned structuredContent per tool and records which tools were called. */
function stubClient(results) {
  const called = [];
  return {
    called,
    listTools: async () => ({ tools: [{ name: 'stub' }] }),
    callTool: async ({ name }) => {
      called.push(name);
      return { content: [], structuredContent: results[name] };
    },
  };
}
const ACCOUNT = '0x1111111111111111111111111111111111111111';
const LINK = 'https://example.test/#/sign?p=abc';
const prepared = (extra) => ({
  summary: 'PREP-SUMMARY',
  warnings: [{ code: 'W1', message: 'WARNING-ONE' }],
  plan: { steps: [{ summary: 'STEP-ONE' }] },
  handoff: null,
  blocked: null,
  ...extra,
});
const happy = {
  atropyle_check_plan: { ok: true, summary: 'CHECK', issues: [] },
  atropyle_simulate: { summary: 'SIM', timeline: { events: [] } },
};

describe('the conversation, with canned results', () => {
  const converseWith = async (results) => {
    const client = stubClient(results);
    const lines = [];
    const out = await converse(client, { owner: ACCOUNT, heirs: [ACCOUNT], log: (l) => lines.push(l) });
    return { client, lines, text: lines.join('\n'), out };
  };

  it('stops when the check fails: exit 1, prepare is not called', async () => {
    const r = await converseWith({
      atropyle_check_plan: { ok: false, summary: 'CHECK', issues: [{ path: 'heirs', message: 'ISSUE-ONE' }] },
    });
    expect(exitCodeOf(r.out)).toBe(1);
    expect(r.client.called).toEqual(['atropyle_check_plan']);
    expect(r.text).toContain('ISSUE-ONE');
    expect(r.text).not.toMatch(/#\/sign/);
  });

  it('prints why a step is blocked and no link: exit 1', async () => {
    const r = await converseWith({
      ...happy,
      atropyle_prepare_create_vault: prepared({ blocked: { step: 1, error: { code: 'SIM_REVERTED' } } }),
    });
    expect(exitCodeOf(r.out)).toBe(1);
    expect(r.text).toContain('step 2 fails with SIM_REVERTED');
    expect(r.text).not.toContain(LINK);
    expect(r.text).not.toMatch(/#\/sign/);
  });

  it('says there is nothing to do and prints no link: exit 0', async () => {
    const r = await converseWith({ ...happy, atropyle_prepare_create_vault: prepared() });
    expect(exitCodeOf(r.out)).toBe(0);
    expect(r.text).toContain('Nothing to do');
    expect(r.text).not.toMatch(/#\/sign/);
  });

  it('prints the link last, after the summary, steps and warnings: exit 0', async () => {
    const r = await converseWith({
      ...happy,
      atropyle_prepare_create_vault: prepared({ handoff: { link: LINK, notes: ['NOTE-LINK'] } }),
    });
    expect(exitCodeOf(r.out)).toBe(0);
    expect(r.lines.at(-1)).toContain(LINK);
    for (const part of ['PREP-SUMMARY', 'STEP-ONE', 'WARNING-ONE', 'NOTE-LINK']) {
      expect(r.text.indexOf(part), part).toBeGreaterThanOrEqual(0);
      expect(r.text.indexOf(part)).toBeLessThan(r.text.indexOf(LINK));
    }
  });

  it('prints the notes and points to handoff.calls when the handoff has no link: exit 0', async () => {
    const calls = { calls: [{ to: ACCOUNT, data: '0x', value: '0x0' }] };
    const r = await converseWith({
      ...happy,
      atropyle_prepare_create_vault: prepared({ handoff: { link: null, calls, notes: ['NOTE-ONE'] } }),
    });
    expect(exitCodeOf(r.out)).toBe(0);
    expect(r.text).not.toContain('Nothing to do');
    expect(r.text).toContain('NOTE-ONE');
    expect(r.text).toContain('1 transaction to sign is in handoff.calls');
    expect(r.text).not.toMatch(/#\/sign/);
    for (const part of ['PREP-SUMMARY', 'STEP-ONE', 'WARNING-ONE']) {
      expect(r.text.indexOf(part), part).toBeLessThan(r.text.indexOf('NOTE-ONE'));
    }
  });
});

describe('on the devnet', () => {
  let env;
  beforeAll(async () => {
    env = await startDevnetEnv();
  });
  afterAll(async () => {
    await env?.stop();
  });

  async function rpc(method, params) {
    const res = await fetch(env.rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const body = await res.json();
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result;
  }

  // anvil mines the transaction at once, but the receipt can still be null for a moment on a busy runner.
  async function receipt(hash) {
    for (let i = 0; i < 100; i++) {
      const r = await rpc('eth_getTransactionReceipt', [hash]);
      if (r) return r;
      await new Promise((done) => setTimeout(done, 100));
    }
    throw new Error(`no receipt for ${hash} after 10 s`);
  }

  it('plans, simulates and prepares a Drill whose steps create the vault', async () => {
    const owner = env.accounts[8];
    const server = { command: process.execPath, args: [BIN, '--deployment', env.deploymentFile] };
    const lines = [];
    const out = await run({
      ...server,
      owner,
      heirs: [`${env.accounts[2]}:60`, `${env.accounts[5]}:40`],
      drill: true,
      log: (l) => lines.push(l),
    });

    expect(out.check.ok).toBe(true);
    expect(out.simulate.mode).toBe('plan');
    expect(out.simulate.timeline.events.length).toBeGreaterThan(0);
    expect(out.prepare.blocked).toBeNull();
    expect(out.prepare.handoff.link).toMatch(/#\/sign\?p=/);

    // The summary and every warning come before the link.
    const text = lines.join('\n');
    const linkAt = text.indexOf(out.prepare.handoff.link);
    const summaryAt = text.indexOf(out.prepare.summary);
    expect(summaryAt).toBeGreaterThanOrEqual(0);
    expect(linkAt).toBeGreaterThan(summaryAt);
    expect(out.prepare.plan.steps.length).toBeGreaterThan(0);
    for (const s of out.prepare.plan.steps) {
      const at = text.indexOf(s.summary);
      expect(at, s.summary).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(linkAt);
    }
    expect(out.prepare.warnings.length).toBeGreaterThan(0);
    for (const w of out.prepare.warnings) {
      const at = text.indexOf(w.message);
      expect(at, w.code).toBeGreaterThanOrEqual(0);
      expect(at).toBeLessThan(linkAt);
    }

    // The test plays the wallet: anvil's unlocked account sends each prepared step. No key anywhere.
    for (const step of out.prepare.plan.steps) {
      const hash = await rpc('eth_sendTransaction', [
        { from: step.from, to: step.to, data: step.data, value: `0x${BigInt(step.value).toString(16)}` },
      ]);
      expect((await receipt(hash)).status).toBe('0x1');
    }

    const client = await connect(server);
    try {
      const vault = await call(client, 'atropyle_get_vault', { vault: out.prepare.vault, as: owner });
      expect(vault.status.state).toBe('active');
      expect(vault.config.drill).toBe(true);
      expect(vault.roles).toContain('owner');
    } finally {
      await client.close();
    }
  });

  it('stops at check_plan when the plan has an issue', async () => {
    const server = { command: process.execPath, args: [BIN, '--deployment', env.deploymentFile] };
    const lines = [];
    const out = await run({
      ...server,
      owner: env.accounts[8],
      heirs: [env.accounts[8]],
      drill: true,
      log: (l) => lines.push(l),
    });
    expect(out.check.ok).toBe(false);
    expect(out.simulate).toBeNull();
    expect(out.prepare).toBeNull();
    expect(lines.join('\n')).not.toMatch(/#\/sign/);
  });

  it('turns an MCP error result into an exception with the code from the error envelope', async () => {
    const client = await connect({ command: process.execPath, args: [BIN, '--deployment', env.deploymentFile] });
    try {
      // The server sends no structuredContent on isError: the envelope is the second text block.
      // A well-formed address with no contract code: the server's own NOT_VAULT path runs.
      const args = { vault: env.accounts[9] };
      const raw = await client.callTool({ name: 'atropyle_get_vault', arguments: args });
      expect(raw.isError).toBe(true);
      expect(raw.structuredContent).toBeUndefined();
      expect(JSON.parse(raw.content[1].text).error.code).toBe('NOT_VAULT');
      const thrown = await call(client, 'atropyle_get_vault', args).catch((e) => e);
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown.message).toContain('atropyle_get_vault: NOT_VAULT: ');
      expect(thrown.message).not.toContain('ERROR');
    } finally {
      await client.close();
    }
  });
});
