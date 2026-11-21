import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseDeployment } from '@atropyle/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDevnetEnv } from '../../../scripts/lib/devnet-env.ts';
import { quickstart } from '../index.mjs';

const INDEX = fileURLToPath(new URL('../index.mjs', import.meta.url));

describe('node-quickstart on the devnet', () => {
  let env;
  beforeAll(async () => {
    env = await startDevnetEnv();
  });
  afterAll(async () => {
    await env?.stop();
  });

  it('reads the vault, shows its timeline and prepares a check-in that works', async () => {
    const lines = [];
    const owner = env.accounts[1];
    const out = await quickstart({
      vault: env.vaults.simple,
      owner,
      deployment: parseDeployment(env.deployment),
      log: (l) => lines.push(l),
    });

    expect(out.status.state).toBe('active');
    expect(out.timeline.events.length).toBeGreaterThan(0);
    expect(out.tx.steps.map((s) => s.action)).toEqual(['checkIn']);
    expect(out.link).toMatch(/#\/sign\?p=/);
    expect(lines.join('\n')).toContain(out.link);

    // The test plays the wallet with anvil's unlocked account (eth_sendTransaction, no key).
    const [step] = out.tx.steps;
    const rpc = async (method, params) => {
      const res = await fetch(env.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      return (await res.json()).result;
    };
    const hash = await rpc('eth_sendTransaction', [{ from: step.from, to: step.to, data: step.data, value: '0x0' }]);
    // anvil mines the transaction at once, but the receipt can still be null for a moment on a busy runner.
    let receipt = null;
    for (let i = 0; i < 100 && !receipt; i++) {
      receipt = await rpc('eth_getTransactionReceipt', [hash]);
      if (!receipt) await new Promise((done) => setTimeout(done, 100));
    }
    expect(receipt?.status).toBe('0x1');
  });

  it('prints no link and reports failure when a step fails in simulation', async () => {
    const lines = [];
    // Account 5 is nobody in this vault, so the check-in reverts in simulation.
    const out = await quickstart({
      vault: env.vaults.simple,
      owner: env.accounts[5],
      deployment: parseDeployment(env.deployment),
      log: (l) => lines.push(l),
    });

    expect(out.link).toBeNull();
    expect(lines.join('\n')).toContain('Nothing to sign');
    expect(lines.join('\n')).not.toContain('#/sign');
  });

  it('exits 0 with a link and 1 without one, when run as a command', () => {
    const run = (owner) =>
      spawnSync(process.execPath, [INDEX, env.vaults.simple, owner, env.deploymentFile], { encoding: 'utf8' });
    const ok = run(env.accounts[1]);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('#/sign?p=');
    const failed = run(env.accounts[5]);
    expect(failed.status).toBe(1);
    expect(failed.stdout).toContain('Nothing to sign');
    expect(failed.stdout).not.toContain('#/sign');
  });
});
