import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src/', import.meta.url));

// Real `next build` runs for both targets (test/build/global-setup.ts), then every file reads the output.
export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: src }] },
  test: {
    include: ['test/build/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['./test/build/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
