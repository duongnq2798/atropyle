import { readFileSync } from 'node:fs';
import type { Deployment, PolicyVerification } from '@atropyle/sdk';
import { parseDeploymentText } from '../../src/ops/index';

/** chainId 31337, every RPC on a closed port: any read fails fast with RPC_UNAVAILABLE. */
export const fixtureDeployment = (): Deployment =>
  parseDeploymentText(readFileSync(new URL('../fixtures/deployment.json', import.meta.url), 'utf8'), 'fixture');

const props = Object.fromEntries(
  ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'].map((p) => [p, { ok: true, violations: 0 }]),
);
export const POLICY = {
  ok: true,
  properties: props,
  combos: 67_108_864,
  ms: 54_200,
  netlists: [],
  cpu: '0x1000000000000000000000000000000000000003',
  policyId: 1n,
  beaconFrozen: true,
  cpuCheck: null,
  chainId: 31337,
  blockNumber: 123n,
  rpcs: 2,
  issues: [],
  firstFailures: [],
  warnings: [],
} as unknown as PolicyVerification; // `properties` comes from Object.fromEntries, which TypeScript types as a plain index signature
