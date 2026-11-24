// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

type NextConfigFn = (phase?: string) => { pageExtensions: string[] };

/** next.config.mjs is plain ESM typed by JSDoc (Quyết định 2); a dynamic import keeps tsc out of it. */
const CONFIG = '../../next.config.mjs';
const load = async (): Promise<NextConfigFn> =>
  ((await import(/* @vite-ignore */ CONFIG)) as { default: NextConfigFn }).default;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('next.config.mjs', () => {
  it('has no dev-only pages, not even under next dev (spec §18, C7)', async () => {
    vi.stubEnv('NEXT_PUBLIC_TARGET', 'deweb');
    vi.stubEnv('ATROPYLE_E2E', '');
    const config = await load();
    expect(config('phase-development-server').pageExtensions).toEqual(['tsx', 'ts']);
    expect(config('phase-production-build').pageExtensions).toEqual(['tsx', 'ts']);
  });

  it('adds the e2e pages only when ATROPYLE_E2E=1 (Quyết định 19)', async () => {
    vi.stubEnv('NEXT_PUBLIC_TARGET', 'deweb');
    vi.stubEnv('ATROPYLE_E2E', '1');
    const config = await load();
    expect(config().pageExtensions).toEqual(['e2e.tsx', 'tsx', 'ts']);
  });
});
