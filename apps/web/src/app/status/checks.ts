/** Ruling T10-R15: a person reads a label, and the raw name stays beneath it in the Ledger voice. */
export const CHECK_KEYS = [
  'chkFactoryCode',
  'chkFactoryCpu',
  'chkFactoryPolicyId',
  'chkFactoryVaultImpl',
  'chkFactoryTreasury',
  'chkFactoryFeeToken',
  'chkVaultImplCodehash',
  'chkCpuTapeout',
  'chkCpuNameSymbol',
  'chkCpuBeacon',
  'chkBeaconFrozen',
  'chkCpuTransistors',
  'chkCpuCodehash',
  'chkCpuImplAddress',
  'chkCpuImplCodehash',
  'chkDeploymentTapeout',
  'chkNetlistPolicy',
  'chkNetlistKofn5',
  'chkNetlistGe4',
  'chkDeploymentCircuits',
] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];

const NAMES: ReadonlyMap<string, CheckKey> = new Map([
  ['factory.code', 'chkFactoryCode'],
  ['factory.cpu', 'chkFactoryCpu'],
  ['factory.policyId', 'chkFactoryPolicyId'],
  ['factory.vaultImpl', 'chkFactoryVaultImpl'],
  ['factory.treasury', 'chkFactoryTreasury'],
  ['vaultImpl.codehash', 'chkVaultImplCodehash'],
  ['cpu.tapeout', 'chkCpuTapeout'],
  ['cpu.nameSymbol', 'chkCpuNameSymbol'],
  ['cpu.beacon', 'chkCpuBeacon'],
  ['beacon.frozen', 'chkBeaconFrozen'],
  ['cpu.transistors', 'chkCpuTransistors'],
  ['cpu.codehash', 'chkCpuCodehash'],
  ['cpuImpl.address', 'chkCpuImplAddress'],
  ['cpuImpl.codehash', 'chkCpuImplCodehash'],
  ['deployment.tapeout', 'chkDeploymentTapeout'],
  ['netlist.policy', 'chkNetlistPolicy'],
  ['netlist.kofn5', 'chkNetlistKofn5'],
  ['netlist.ge4', 'chkNetlistGe4'],
  ['deployment.circuits', 'chkDeploymentCircuits'],
]);

/** The label of an SDK check name; `factory.feeToken <address>` by its prefix; null for a name this page does not know. */
export function checkKey(name: string): CheckKey | null {
  if (name.startsWith('factory.feeToken ')) return 'chkFactoryFeeToken';
  return NAMES.get(name) ?? null;
}

/** What expectedCheckCount reads of a deployment; the SDK's Deployment fits. */
export interface CheckSource {
  chainId: number;
  feeTokens: readonly unknown[];
  tapeout?: unknown;
  circuits?: unknown;
}

/**
 * How many rows the integrity report of this deployment will hold, as packages/sdk/src/verify/integrity.ts builds
 * them, so the loading list has the height of the report (spec §6, §18.2.6). Mainnet (196) is where this SDK pins the
 * processor's code (three more rows) and where a missing TapeOut or circuit record still gives one failed row.
 */
export function expectedCheckCount(d: CheckSource): number {
  const mainnet = d.chainId === 196;
  const factory = 5 + d.feeTokens.length;
  const tapeout = d.tapeout ? 5 + (mainnet ? 3 : 0) : mainnet ? 1 : 0;
  const circuits = d.circuits ? 3 : mainnet ? 1 : 0;
  return factory + 1 + tapeout + circuits;
}
