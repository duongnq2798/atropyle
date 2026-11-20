import {
  type AtropyleClient,
  AtropyleError,
  type ChainName,
  type Deployment,
  deploymentToJson,
  getDeployment,
  stringify,
} from '@atropyle/sdk';
import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { POLICY_SPEC_MD } from './policy-spec';

const POLICY_SPEC_URI = 'atropyle://policy/spec';
const deploymentUri = (key: string): string => `atropyle://deployments/${key}`;

/** `xlayer` and `local` name the built-in deployments; any other chain is named by its chain ID. */
function chainKey(d: Deployment): string {
  if (d.chainId === 196) return 'xlayer';
  if (d.chainId === 31337) return 'local';
  return String(d.chainId);
}

function deploymentFor(atro: AtropyleClient, key: string): Deployment {
  if (key === chainKey(atro.deployment)) return atro.deployment;
  if (key === 'xlayer' || key === 'local') return getDeployment(key as ChainName);
  throw new AtropyleError('DEPLOYMENT_MISSING', {
    message: 'No deployment with this name.',
    hint: 'Use atropyle://deployments/xlayer or atropyle://deployments/local.',
  });
}

/** A --deployment file may carry keyed RPC URLs, and a resource goes into the model's context: keep only the origin. */
const origin = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return '(invalid URL)';
  }
};

function publicJson(d: Deployment): unknown {
  const json = deploymentToJson(d) as { rpcUrls: string[]; quorumRpcUrls: string[][] };
  return { ...json, rpcUrls: json.rpcUrls.map(origin), quorumRpcUrls: json.quorumRpcUrls.map((g) => g.map(origin)) };
}

export function registerResources(server: McpServer, atro: AtropyleClient): void {
  const key = chainKey(atro.deployment);
  server.registerResource(
    'deployment',
    new ResourceTemplate('atropyle://deployments/{chain}', {
      list: async () => ({
        resources: [
          {
            uri: deploymentUri(key),
            name: `deployment-${key}`,
            title: `Atropyle deployment on chain ${atro.deployment.chainId}`,
            mimeType: 'application/json',
          },
        ],
      }),
    }),
    {
      title: 'Atropyle deployment',
      description:
        'Contract addresses, policy and circuit IDs, netlist hashes and RPC endpoints (origin only) of one chain',
      mimeType: 'application/json',
    },
    async (uri, vars) => {
      const name = Array.isArray(vars.chain) ? vars.chain[0] : vars.chain;
      const d = deploymentFor(atro, String(name));
      return {
        contents: [{ uri: uri.href, mimeType: 'application/json', text: `${stringify(publicJson(d), 2)}\n` }],
      };
    },
  );
  server.registerResource(
    'policy-spec',
    POLICY_SPEC_URI,
    {
      title: 'Atropyle policy v1',
      description: 'States, inputs, transitions, outputs and the properties P1-P8 that atropyle verify proves',
      mimeType: 'text/markdown',
    },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'text/markdown', text: POLICY_SPEC_MD }] }),
  );
}
