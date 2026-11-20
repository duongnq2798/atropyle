import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { bin: 'src/bin.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  dts: false,
  fixedExtension: false,
  clean: true,
});
