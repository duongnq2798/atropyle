import { AtropyleError } from '../errors';
import { local } from './local';
import { type Deployment, parseDeployment } from './types';
import { xlayer } from './xlayer';

export * from './types';

export type ChainName = 'xlayer' | 'local';

const cache = new Map<ChainName, Deployment>();

export function resolveDeployment(chain: ChainName | Deployment, registry: Record<ChainName, unknown>): Deployment {
  if (typeof chain === 'object') return chain;
  const raw = registry[chain];
  if (raw === null || raw === undefined) {
    throw new AtropyleError('DEPLOYMENT_MISSING', { message: `There is no Atropyle deployment for "${chain}" yet.` });
  }
  return parseDeployment(raw);
}

export function getDeployment(chain: ChainName | Deployment): Deployment {
  if (typeof chain === 'object') return chain;
  let d = cache.get(chain);
  if (!d) {
    d = resolveDeployment(chain, { xlayer, local });
    cache.set(chain, d);
  }
  return d;
}
