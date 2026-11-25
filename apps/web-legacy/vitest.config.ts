import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  define: { __APP_VERSION__: JSON.stringify('0.0.0-test') },
  test: { include: ['test/unit/**/*.test.{ts,tsx}'], environment: 'node' },
});
