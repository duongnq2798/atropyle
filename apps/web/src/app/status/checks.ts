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
