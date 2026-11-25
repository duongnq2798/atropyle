/** Query keys: strings and numbers only, addresses lowercased, so equal requests share one cache entry. */
export const chainKeys = {
  all: (chainId: number) => ['atropyle', chainId] as const,
  sdk: (chainId: number, crossCheck: boolean) => ['atropyle', chainId, 'sdk', crossCheck ? 'cross' : 'own'] as const,
  vault: (chainId: number, vault: string) => ['atropyle', chainId, 'vault', vault.toLowerCase()] as const,
  vaultsOf: (chainId: number, account: string) => ['atropyle', chainId, 'vaultsOf', account.toLowerCase()] as const,
  stats: (chainId: number, source: 'api' | 'chain') => ['atropyle', chainId, 'stats', source] as const,
  me: (chainId: number, account: string) => ['atropyle', chainId, 'me', account.toLowerCase()] as const,
  health: (chainId: number) => ['atropyle', chainId, 'health'] as const,
  history: (chainId: number, vault: string) => ['atropyle', chainId, 'history', vault.toLowerCase()] as const,
  /** A signing link, by its fragment: what inspect said about it, and the tokens its mirror names. */
  sign: (chainId: number, hash: string) => ['atropyle', chainId, 'sign', hash] as const,
  signTokens: (chainId: number, hash: string) => ['atropyle', chainId, 'sign', hash, 'tokens'] as const,
};
