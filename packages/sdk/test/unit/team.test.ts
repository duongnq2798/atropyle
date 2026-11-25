import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getAddress, isAddress } from 'viem';
import { describe, expect, it } from 'vitest';
import { team as generated } from '../../src/deployments/team';
import { parseTeam } from '../../src/deployments/teams';
import { getDeployment, getTeam, TEAM_ROLES } from '../../src/index';

const FILE = fileURLToPath(new URL('../../../../deployments/team.json', import.meta.url));
const raw = JSON.parse(readFileSync(FILE, 'utf8'));

const DEPLOYER = '0xC0a61674Fa1caAd04500073ea94Ec9006D7A2375';
const member = (over: Record<string, unknown> = {}) => ({ address: DEPLOYER, role: 'deployer', source: 'x', ...over });
const file = (members: unknown[]) => ({ chains: { xlayer: { chainId: 196, members } } });

describe('deployments/team.json', () => {
  it('describes itself, defines exactly the known roles and gives every member a source', () => {
    expect(typeof raw.description).toBe('string');
    expect(raw.description.length).toBeGreaterThan(50);
    expect(Object.keys(raw.roles).sort()).toEqual([...TEAM_ROLES].sort());
    for (const text of Object.values(raw.roles)) expect(String(text).trim()).not.toBe('');
    expect(() => parseTeam(raw, true)).not.toThrow();
  });

  it('spells every address with its checksum and gives it a known role', () => {
    for (const [name, chain] of Object.entries(raw.chains as Record<string, { members: unknown[] }>)) {
      for (const m of chain.members as { address: string; role: string; source: string }[]) {
        expect(isAddress(m.address, { strict: true }), `${name} ${m.address}`).toBe(true);
        expect(m.address, name).toBe(getAddress(m.address));
        expect(TEAM_ROLES as readonly string[]).toContain(m.role);
        expect(m.source.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it('lists the X Layer treasury the deployment records, with the chain id of that deployment', () => {
    const x = getDeployment('xlayer');
    expect(raw.chains.xlayer.chainId).toBe(x.chainId);
    const treasury = raw.chains.xlayer.members.find((m: { role: string }) => m.role === 'treasury');
    expect(treasury.address).toBe(x.treasury);
    expect(raw.chains.xlayer.members.map((m: { role: string }) => m.role)).toContain('deployer');
  });

  it('matches the copy in the SDK (addresses and roles only; run npm run deployments:sync)', () => {
    const copy = parseTeam(generated);
    const parsed = parseTeam(raw, true);
    for (const [name, chain] of Object.entries(parsed.chains)) {
      expect(copy.chains[name]).toEqual({
        chainId: chain.chainId,
        members: chain.members.map((m) => ({ address: m.address, role: m.role })),
      });
    }
    expect(Object.keys(copy.chains).sort()).toEqual(Object.keys(parsed.chains).sort());
  });
});

describe('getTeam', () => {
  it('returns the X Layer members, and none for the devnet or for a chain id that does not match', () => {
    expect(getTeam('xlayer').map((m) => m.role)).toEqual(
      raw.chains.xlayer.members.map((m: { role: string }) => m.role),
    );
    expect(getTeam('local')).toEqual([]);
    expect(getTeam({ ...getDeployment('xlayer'), chainId: 31337 })).toEqual([]);
  });
});

describe('parseTeam', () => {
  it('accepts a minimal file', () => {
    expect(parseTeam(file([member()])).chains.xlayer.members).toEqual([member()]);
  });

  it.each([
    ['a lowercase address', [member({ address: DEPLOYER.toLowerCase() })], 'checksummed'],
    ['a wrong checksum', [member({ address: DEPLOYER.replace('C0a6', 'c0A6') })], 'checksummed'],
    ['an unknown role', [member({ role: 'founder' })], 'expected one of'],
    ['an address listed twice', [member(), member({ role: 'treasury' })], 'listed twice'],
    ['an empty source', [member({ source: ' ' })], 'non-empty'],
  ])('rejects %s', (_, members, why) => {
    expect(() => parseTeam(file(members))).toThrow(why);
  });

  it('requires a source only when asked', () => {
    const bare = { address: DEPLOYER, role: 'deployer' };
    expect(() => parseTeam(file([bare]))).not.toThrow();
    expect(() => parseTeam(file([bare]), true)).toThrow('non-empty');
  });

  it('rejects a chain without a valid chain id or member list', () => {
    expect(() => parseTeam({ chains: { xlayer: { chainId: 0, members: [] } } })).toThrow('chainId');
    expect(() => parseTeam({ chains: { xlayer: { chainId: 196 } } })).toThrow('members');
    expect(() => parseTeam({})).toThrow('chains');
  });
});
