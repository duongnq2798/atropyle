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
    env: { NEXT_PUBLIC_APP_VERSION: '0.0.0-test' },
  },
});
