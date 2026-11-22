import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['test/unit/**/*.test.{ts,tsx}'],
    testTimeout: 30_000,
    // PGlite with citext takes a few seconds to start on a cold Windows machine.
    hookTimeout: 60_000,
  },
});
