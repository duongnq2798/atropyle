// @vitest-environment node
import { readFileSync } from 'node:fs';
import { buildAll, stepBytes } from '@atropyle/circuits';
import { cpuAbi, VERSION } from '@atropyle/sdk';
import { bytesToHex, hexToBytes } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  COMMANDS,
  MCP_PACKAGE,
  NODE_MIN,
  pinnedCommands,
  STEP_EXAMPLE,
  verifyWithSeed,
} from '../../src/content/commands';

const json = (path: string) => JSON.parse(readFileSync(new URL(`../../../../${path}`, import.meta.url), 'utf8'));

interface AbiEntry {
  type: string;
  name?: string;
  inputs?: readonly { type: string }[];
  outputs?: readonly { type: string }[];
}

describe('commands', () => {
  it('name the packages and the plugin this repository ships', () => {
    const plugin = json('.claude-plugin/plugin.json');
    const market = json('.claude-plugin/marketplace.json');
    const mcp = json('packages/mcp/package.json');
    const cli = json('packages/cli/package.json');
    expect(MCP_PACKAGE).toBe(`${mcp.name}@${mcp.version}`);
    expect(plugin.mcpServers.atropyle.args).toEqual(['-y', MCP_PACKAGE]);
    expect(COMMANDS.mcp).toBe(`npx -y ${MCP_PACKAGE}`);
    expect(COMMANDS.verify).toBe(`npx -y ${cli.name} verify`);
    expect(cli.engines.node).toBe(`>=${NODE_MIN}`);
    const repo = String(plugin.repository).replace('https://github.com/', '');
    expect(COMMANDS.plugin).toBe(`/plugin marketplace add ${repo}\n/plugin install ${plugin.name}@${market.name}`);
    expect(COMMANDS.skills).toBe(`npx skills add ${repo}`);
    expect(verifyWithSeed(18_446_744_073_709_551_615n)).toBe('npx -y atropyle verify --p9-seed 18446744073709551615');
  });

  it('asks the X Layer processor for one step of the policy, as the deployment and the ABI name them', () => {
    const xlayer = json('deployments/xlayer.json');
    expect(STEP_EXAMPLE.cpu).toBe(xlayer.cpu);
    expect(String(STEP_EXAMPLE.circuit)).toBe(xlayer.policyId);
    expect(xlayer.rpcUrls).toContain(STEP_EXAMPLE.rpc);
    const step = (cpuAbi as unknown as readonly AbiEntry[]).find((x) => x.type === 'function' && x.name === 'step');
    const types = (ps: readonly { type: string }[] | undefined) => (ps ?? []).map((p) => p.type).join(',');
    expect(types(step?.inputs)).toBe('uint256,bytes,bytes');
    expect(COMMANDS.step).toBe(
      `cast call ${xlayer.cpu} "step(${types(step?.inputs)})(${types(step?.outputs)})" ${xlayer.policyId} 0x00 0x000000 --rpc-url ${STEP_EXAMPLE.rpc}`,
    );
  });

  it('expects the answer the model of this repository gives for that step', () => {
    const r = stepBytes(buildAll().program, hexToBytes(STEP_EXAMPLE.state), hexToBytes(STEP_EXAMPLE.inputs));
    expect({ next: bytesToHex(r.next), out: bytesToHex(r.out) }).toEqual(STEP_EXAMPLE.answer);
  });
});

describe('the pinned commands of /developers/', () => {
  it('pin every package to the SDK version, the version npm has for all four packages', () => {
    for (const pkg of ['packages/sdk', 'packages/cli', 'packages/mcp', 'circuits']) {
      expect(json(`${pkg}/package.json`).version, pkg).toBe(VERSION);
    }
    expect(MCP_PACKAGE).toBe(`@atropyle/mcp@${VERSION}`);
    expect(pinnedCommands(VERSION)).toEqual({
      verify: `npx -y atropyle@${VERSION} verify`,
      mcpClaude: `claude mcp add atropyle -- npx -y @atropyle/mcp@${VERSION}`,
      mcpAny: `npx -y @atropyle/mcp@${VERSION}`,
    });
  });
});
