import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    plan: 'src/plan/index.ts',
    handoff: 'src/handoff/index.ts',
    verify: 'src/verify/index.ts',
  },
  format: ['esm', 'cjs'],
  // "type": "module": ESM as .js/.d.ts, CommonJS as .cjs/.d.cts, matching the exports map.
  fixedExtension: false,
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
});
