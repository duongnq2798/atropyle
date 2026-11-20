import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { index: 'src/index.ts', 'ops/index': 'src/ops/index.ts', bin: 'src/bin.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: true,
  fixedExtension: false,
  clean: true,
});
