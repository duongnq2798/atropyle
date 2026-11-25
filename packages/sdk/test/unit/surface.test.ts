import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as handoff from '../../src/handoff/index';
import * as root from '../../src/index';
import * as plan from '../../src/plan/index';
import * as verify from '../../src/verify/index';

const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

describe('public surface', () => {
  it('the root entry has the client, rules, prediction, keeper, handoff and ABIs', () => {
    expect(Object.keys(root)).toEqual(
      expect.arrayContaining([
        'createAtropyle',
        'AtropyleError',
        'decodeError',
        'isTransportError',
        'getDeployment',
        'parseDeployment',
        'getTeam',
        'TEAM_ROLES',
        'createReadContext',
        'readCounters',
        'validatePlan',
        'planTemplate',
        'PRESETS',
        'modelEngine',
        'programEngine',
        'timelineOf',
        'predictAction',
        'planKeeperActions',
        'keeperTick',
        'signLink',
        'parseSignLink',
        'castCommand',
        'sendCallsParams',
        'okxCommand',
        'builderCodeSuffix',
        'parseBuilderCodeSuffix',
        'vaultAbi',
        'factoryAbi',
        'cpuAbi',
        'erc1155Abi',
        'beaconAbi',
        'tapeoutFactoryAbi',
        'tapeoutCircuitsAbi',
        'transistorsAbi',
        'revertAbi',
        'stringify',
        'VERSION',
      ]),
    );
  });

  it('VERSION matches the version in package.json', () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'));
    expect(root.VERSION).toBe(pkg.version);
  });

  it('the verifier stays out of the root entry', () => {
    for (const name of [
      'quorumTransport',
      'readPolicyBundle',
      'evaluatePolicyBundle',
      'readIntegrity',
      'verifyVault',
    ]) {
      expect(Object.keys(root)).not.toContain(name);
    }
    const client = readFileSync(join(SRC, 'client.ts'), 'utf8');
    expect(client).not.toMatch(/^import (?!type )[^;]*from '\.\/verify\//m);
  });

  it('subpaths export what their names promise and nothing of the client', () => {
    expect(Object.keys(plan)).toEqual(
      expect.arrayContaining(['validatePlan', 'planTemplate', 'PRESETS', 'LIMITS', 'sharesToBps']),
    );
    expect(Object.keys(handoff)).toEqual(
      expect.arrayContaining([
        'signLink',
        'parseSignLink',
        'encodePayload',
        'decodePayload',
        'toPayload',
        'castCommand',
        'sendCallsParams',
        'okxCommand',
      ]),
    );
    expect(Object.keys(verify)).toEqual(
      expect.arrayContaining([
        'quorumTransport',
        'readPolicyBundle',
        'evaluatePolicyBundle',
        'readIntegrity',
        'verifyVault',
        'readCpuCheck',
        'SINGLE_RPC_WARNING',
      ]),
    );
    for (const m of [plan, handoff, verify]) expect(Object.keys(m)).not.toContain('createAtropyle');
  });

  it('the source never imports Node built-ins, so it runs in browsers, Workers and Deno', () => {
    const offenders = files(SRC).filter((f) => /from ['"]node:|require\(['"]node:/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
