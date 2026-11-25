import { AtropyleError } from '../errors';
import { local } from './local';
import { team } from './team';
import type { TeamMember } from './teams';
import { type Deployment, parseDeployment } from './types';
import { xlayer } from './xlayer';

export { TEAM_ROLES, type TeamChain, type TeamFile, type TeamMember, type TeamRole } from './teams';
export * from './types';

export type ChainName = 'xlayer' | 'local';

const cache = new Map<ChainName, Deployment>();

export function resolveDeployment(chain: ChainName | Deployment, registry: Record<ChainName, unknown>): Deployment {
  if (typeof chain === 'object') return parseDeployment(chain);
  const raw = registry[chain];
  if (raw === null || raw === undefined) {
    throw new AtropyleError('DEPLOYMENT_MISSING', { message: `There is no Atropyle deployment for "${chain}" yet.` });
  }
  return parseDeployment(raw);
}

export function getDeployment(chain: ChainName | Deployment): Deployment {
  if (typeof chain === 'object') return parseDeployment(chain);
  let d = cache.get(chain);
  if (!d) {
    d = resolveDeployment(chain, { xlayer, local });
    cache.set(chain, d);
  }
  return d;
}

/**
 * Public team addresses of this deployment (same name and chain id) from deployments/team.json, which
 * scripts/deployments-sync.ts validates before it copies them: none for the devnet or another chain.
 */
export function getTeam(chain: ChainName | Deployment): TeamMember[] {
  const d = getDeployment(chain);
  const c = Object.hasOwn(team.chains, d.name) ? team.chains[d.name] : undefined;
  return c && c.chainId === d.chainId ? c.members.map((m) => ({ ...m })) : [];
}
