import type { TestProject } from 'vitest/node';
import { type DevnetInfo, startDevnetEnv } from '../../../../scripts/lib/devnet-env';

declare module 'vitest' {
  export interface ProvidedContext {
    devnet: DevnetInfo;
  }
}

export default async function setup(project: TestProject) {
  const { anvil: _anvil, stop, ...info } = await startDevnetEnv();
  project.provide('devnet', info);
  return stop;
}
