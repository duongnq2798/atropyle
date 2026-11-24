import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src/', import.meta.url));

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: [{ find: /^@\//, replacement: src }] },
  test: {
    include: ['test/unit/**/*.test.{ts,tsx}'],
    environment: 'happy-dom',
    setupFiles: ['./test/setup.ts'],
    // next build defines __NEXT_TRAILING_SLASH from `trailingSlash: true` (next.config.mjs); without it next/link
    // would print `/proof` for `/proof/` in unit tests.
    env: { NEXT_PUBLIC_APP_VERSION: '0.0.0-test', __NEXT_TRAILING_SLASH: 'true' },
  },
});
