import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const TARGETS = ['vercel', 'deweb'];

/**
 * A function, so that the target is checked at load and e2e-only pages (`page.e2e.tsx`) exist only when
 * ATROPYLE_E2E=1. There are no dev-only pages: the design review uses screenshots of the real pages.
 * @returns {import('next').NextConfig}
 */
export default function config() {
  const target = process.env.NEXT_PUBLIC_TARGET || 'deweb';
  if (!TARGETS.includes(target)) throw new Error(`NEXT_PUBLIC_TARGET must be vercel or deweb, got "${target}"`);
  // The deweb build must never carry the backend URL (spec §2); scripts/lib/build-env.ts drops it too.
  if (target !== 'vercel') delete process.env.NEXT_PUBLIC_API_URL;
  const pageExtensions = ['tsx', 'ts'];
  if (process.env.ATROPYLE_E2E === '1') pageExtensions.unshift('e2e.tsx');
  return {
    output: 'export',
    trailingSlash: true,
    images: { unoptimized: true },
    reactStrictMode: true,
    poweredByHeader: false,
    productionBrowserSourceMaps: false,
    // `npm run typecheck` runs tsc on the whole app; the build does not type-check a second time.
    typescript: { ignoreBuildErrors: true },
    pageExtensions,
    // node_modules live at the monorepo root.
    turbopack: { root: fileURLToPath(new URL('../..', import.meta.url)) },
    env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  };
}
