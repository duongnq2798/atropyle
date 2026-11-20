import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDevnetEnv } from '../../../scripts/lib/devnet-env.ts';
import { call, connect, planOf, run, SERVER_PACKAGE } from '../index.mjs';

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
    expect(linkAt).toBeGreaterThan(text.indexOf(out.prepare.summary));
    for (const w of out.prepare.warnings) expect(text.indexOf(w.message)).toBeLessThan(linkAt);

    // The test plays the wallet: anvil's unlocked account sends each prepared step. No key anywhere.
    for (const step of out.prepare.plan.steps) {
      const hash = await rpc('eth_sendTransaction', [
        { from: step.from, to: step.to, data: step.data, value: `0x${BigInt(step.value).toString(16)}` },
      ]);
      expect((await rpc('eth_getTransactionReceipt', [hash])).status).toBe('0x1');
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
      const raw = await client.callTool({ name: 'atropyle_get_vault', arguments: { vault: 'not-an-address' } });
      expect(raw.isError).toBe(true);
      expect(raw.structuredContent).toBeUndefined();
      await expect(call(client, 'atropyle_get_vault', { vault: 'not-an-address' })).rejects.toThrow(
        /^atropyle_get_vault: [A-Z_]+: .+/,
      );
    } finally {
      await client.close();
    }
  });
});
