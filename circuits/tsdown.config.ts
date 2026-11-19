import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm', 'cjs'],
  fixedExtension: false,
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
});
