import { existsSync } from 'node:fs';
import type { TestProject } from 'vitest/node';
import { type DevnetInfo, startDevnetEnv } from '../../../../scripts/lib/devnet-env';
import { BIN } from './bin';

declare module 'vitest' {
  export interface ProvidedContext {
    devnet: DevnetInfo;
  }
}

export default async function setup(project: TestProject) {
  if (!existsSync(BIN)) throw new Error('Build first: npm run build -w packages/cli');
  const { anvil: _anvil, stop, ...info } = await startDevnetEnv();
  project.provide('devnet', info);
  return stop;
}
