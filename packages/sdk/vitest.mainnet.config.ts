import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@atropyle/circuits': fileURLToPath(new URL('../../circuits/src/index.ts', import.meta.url)) },
  },
  test: { include: ['test/mainnet/**/*.test.ts'], testTimeout: 900_000 },
});
