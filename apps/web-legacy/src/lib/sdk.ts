import {
  type AtropyleClient,
  AtropyleError,
  createAtropyle,
  type Deployment,
  getDeployment,
  parseDeployment,
  readTransport,
} from '@atropyle/sdk';
import type { AppEnv, Target } from '../env';
import { type RpcPlan, rpcPlan } from './rpc';

export interface Sdk {
  atro: AtropyleClient;
  deployment: Deployment;
  rpc: RpcPlan;
}

export function loadDeployment(env: Pick<AppEnv, 'chain' | 'deploymentJson'>): Deployment {
  if (!env.deploymentJson) return getDeployment(env.chain);
  let raw: unknown;
  try {
    raw = JSON.parse(env.deploymentJson);
  } catch (cause) {
    throw new AtropyleError('DEPLOYMENT_INVALID', { message: 'VITE_DEPLOYMENT is not valid JSON.', cause });
  }
  return parseDeployment(raw);
}

/** Every read goes through public RPCs chosen per target (plan decisions 3 and 4); the wallet only signs. */
export function createSdk(d: Deployment, target: Target, crossCheck: boolean): Sdk {
  const rpc = rpcPlan(d, target, crossCheck);
  const atro = createAtropyle({
    chain: { ...d, rpcUrls: rpc.read, quorumRpcUrls: rpc.verify },
    transport: readTransport(rpc.read),
    verifyTransports: rpc.verify.map((group) => readTransport(group)),
  });
  return { atro, deployment: atro.deployment, rpc };
}
