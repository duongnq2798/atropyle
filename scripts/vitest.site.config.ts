import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: fileURLToPath(new URL('..', import.meta.url)),
    include: ['scripts/test/site/**/*.test.ts', 'scripts/test/deploy/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
});
