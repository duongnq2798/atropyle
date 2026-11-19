import { defineConfig } from 'tsdown';

export default defineConfig({
  // Task 11 adds `handoff`, Task 12 `verify`; package.json already declares all four subpaths.
  entry: { index: 'src/index.ts', plan: 'src/plan/index.ts' },
  format: ['esm', 'cjs'],
  // "type": "module": ESM as .js/.d.ts, CommonJS as .cjs/.d.cts, matching the exports map.
  fixedExtension: false,
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: ['viem', /^viem\//, '@atropyle/circuits'],
});
