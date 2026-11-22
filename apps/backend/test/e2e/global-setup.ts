import type { TestProject } from 'vitest/node';
import { deployLocal, startAnvil } from '../../../../scripts/lib/anvil';

declare module 'vitest' {
  export interface ProvidedContext {
    rpcUrl: string;
    deployment: Record<string, unknown>;
  }
}

/** Its own anvil (chain 31337) with DeployLocal, like the SDK's integration tests. Transactions use unlocked accounts. */
export default async function setup(project: TestProject) {
  const anvil = await startAnvil();
  let deployment: Record<string, unknown>;
  try {
    deployment = await deployLocal(anvil.url);
  } catch (e) {
    await anvil.stop();
    throw e;
  }
  project.provide('rpcUrl', anvil.url);
  project.provide('deployment', deployment);
  return () => anvil.stop();
}
