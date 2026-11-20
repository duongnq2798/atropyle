import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    globalSetup: ['test/integration/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
