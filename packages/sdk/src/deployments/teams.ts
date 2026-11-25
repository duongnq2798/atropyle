import { type Address, getAddress, isAddress } from 'viem';
import { AtropyleError } from '../errors';

/** Roles a team address may have in deployments/team.json. Add a role here before using it there. */
export const TEAM_ROLES = ['deployer', 'treasury', 'keeper'] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export interface TeamMember {
  address: Address;
  role: TeamRole;
  /** Where anyone can check the address: a transaction, a contract view, a deployment record. */
  source?: string;
}

export interface TeamChain {
  chainId: number;
  members: TeamMember[];
}

/** deployments/team.json, keyed by deployment name. The description and role texts are not kept. */
export interface TeamFile {
  chains: Record<string, TeamChain>;
}

type Obj = Record<string, unknown>;

function fail(path: string, why: string): never {
  throw new AtropyleError('DEPLOYMENT_INVALID', { message: `team.${path}: ${why}`, details: { path } });
}

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'expected an object');
  return v as Obj;
}

/** Only the checksummed spelling is accepted, so the file reads the same everywhere it is copied. */
function checksummed(v: unknown, path: string): Address {
  if (typeof v !== 'string' || !isAddress(v, { strict: false }) || getAddress(v) !== v) {
    fail(path, 'expected a checksummed address');
  }
  return v as Address;
}

/**
 * Validates deployments/team.json (or the copy in the SDK): checksummed addresses, known roles, no address twice on a
 * chain. With `requireSource`, every member also needs a non-empty source. scripts/deployments-sync.ts runs it before
 * it writes the copy, so the SDK bundle carries the data without the validator.
 */
export function parseTeam(input: unknown, requireSource = false): TeamFile {
  const chains = obj(obj(input, '').chains, 'chains');
  const out: TeamFile = { chains: {} };
  for (const [name, raw] of Object.entries(chains)) {
    const c = obj(raw, `chains.${name}`);
    if (typeof c.chainId !== 'number' || !Number.isSafeInteger(c.chainId) || c.chainId < 1) {
      fail(`chains.${name}.chainId`, 'expected an integer ≥ 1');
    }
    if (!Array.isArray(c.members)) fail(`chains.${name}.members`, 'expected an array');
    const seen = new Set<string>();
    const members = c.members.map((m, i): TeamMember => {
      const path = `chains.${name}.members[${i}]`;
      const e = obj(m, path);
      const address = checksummed(e.address, `${path}.address`);
      if (seen.has(address)) fail(`${path}.address`, 'listed twice');
      seen.add(address);
      if (!TEAM_ROLES.includes(e.role as TeamRole)) fail(`${path}.role`, `expected one of ${TEAM_ROLES.join(', ')}`);
      const member: TeamMember = { address, role: e.role as TeamRole };
      if (e.source !== undefined || requireSource) {
        if (typeof e.source !== 'string' || e.source.trim() === '')
          fail(`${path}.source`, 'expected a non-empty string');
        member.source = e.source;
      }
      return member;
    });
    out.chains[name] = { chainId: c.chainId, members };
  }
  return out;
}
