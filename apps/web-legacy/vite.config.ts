import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { buildCsp, rpcOrigins, targetOf, workerOrigin } from './build/csp';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

function cspPlugin(csp: string): Plugin {
  return {
    name: 'atropyle-csp',
    apply: 'build',
    transformIndexHtml: () => [
      { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const target = targetOf(env.VITE_TARGET);
  if (target === 'deweb') {
    // Vite reads process.env again after this function returns; the DeWEB build must never see a Worker URL.
    delete process.env.VITE_WORKER_URL;
    env.VITE_WORKER_URL = '';
  }
  const csp = buildCsp({
    rpcOrigins: rpcOrigins(env.VITE_CHAIN, env.VITE_DEPLOYMENT),
    workerOrigin: workerOrigin(target, env.VITE_WORKER_URL),
  });
  return {
    base: './',
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      'import.meta.env.VITE_WORKER_URL': JSON.stringify(target === 'pages' ? (env.VITE_WORKER_URL ?? '') : ''),
    },
    esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
    worker: { format: 'es' },
    build: {
      outDir: process.env.WEB_OUT_DIR ?? 'dist',
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: false,
      modulePreload: { polyfill: false },
    },
    plugins: [cspPlugin(csp)],
  };
});
