const NAMES: Readonly<Record<number, string>> = {
  1: 'Ethereum',
  10: 'OP Mainnet',
  56: 'BNB Smart Chain',
  137: 'Polygon',
  196: 'X Layer',
  8453: 'Base',
  31337: 'Anvil',
  42161: 'Arbitrum One',
};

/** The name a person knows a chain by; any other chain is shown by its number. */
export function networkName(chainId: number): string {
  return NAMES[chainId] ?? `chain ${chainId}`;
}
