import { type Deployment, getDeployment, VERSION } from '@atropyle/sdk';
import type { Metadata } from 'next';
import { loadDeployment } from '@/chain/impl/sdk';
import { ENV } from '@/config/env';
import { pinnedCommands } from '@/content/commands';
import { type DevCircuit, type DevContract, DevelopersPage } from './developers-page';

export const metadata: Metadata = {
  title: 'Developers',
  description:
    'The Atropyle SDK, CLI, MCP server, Claude Code plugin and Agent Skills, on npm, with the contracts and circuits this site reads.',
};

function contractsOf(d: Deployment): DevContract[] {
  return [
    { id: 'factory', kind: 'factory', n: null, address: d.factory },
    { id: 'vaultImpl', kind: 'vaultImpl', n: null, address: d.vaultImpl },
    { id: 'cpu', kind: 'cpu', n: null, address: d.cpu },
    { id: 'treasury', kind: 'treasury', n: null, address: d.treasury },
    ...d.feeTokens.map((address, i): DevContract => ({ id: `feeToken-${i}`, kind: 'feeToken', n: i + 1, address })),
    ...(d.tapeout
      ? [{ id: 'tapeoutFactory', kind: 'tapeoutFactory', n: null, address: d.tapeout.factory } as const]
      : []),
  ];
}

/** X Layer mainnet facts on every build (ruling T10-R7): the devnet has no circuits. */
function circuitsOf(x: Deployment): DevCircuit[] {
  const c = x.circuits;
  if (!c) return [];
  return [
    { id: 'policy', circuitId: x.policyId.toString(), keccak: c.netlistKeccak.policy },
    { id: 'kofn5', circuitId: c.kofn5.toString(), keccak: c.netlistKeccak.kofn5 },
    { id: 'ge4', circuitId: c.ge4.toString(), keccak: c.netlistKeccak.ge4 },
  ];
}

/**
 * Ruling T10-R5: the SDK's VERSION and the deployment are read here, at build time, and reach the client page as
 * strings. No SDK code ships to the browser for this page, and a reader without JavaScript sees every address and pin.
 */
export default function Page() {
  const d = loadDeployment(ENV);
  const x = getDeployment('xlayer');
  return (
    <DevelopersPage
      version={VERSION}
      commands={pinnedCommands(VERSION)}
      chainId={d.chainId}
      policyId={d.policyId.toString()}
      contracts={contractsOf(d)}
      circuits={circuitsOf(x)}
      xlayerCpu={x.cpu}
    />
  );
}
