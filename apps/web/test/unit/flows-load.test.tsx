import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { onlineManager } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { flowsChunk, peekFlowsImpl } from '../../src/flows/load';
import { FLOWS_KEY, useFlows } from '../../src/flows/use-flows';
import { makeWrapper } from '../helpers/render';

// Not `new URL('../../src/', import.meta.url)`: under happy-dom, Vite rewrites that literal pattern into a served
// asset URL (http://localhost:3000/src), which fileURLToPath refuses.
const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

/**
 * An import of the hook or of the logic itself, with or without an extension; src/flows/load.ts stays allowed, for a
 * preload on hover or focus. A deep import of one module (`@/flows/impl/<module>`) passes here: lazy-boundary.test.ts
 * guards every static import of impl/, so the two tests together cover it.
 */
const FLOWS = /['"](?:@\/|(?:\.\.?\/)+)flows\/(?:use-flows|impl(?:\/index)?)(?:\.[cm]?[jt]sx?)?['"]/;

describe('flow logic chunk', () => {
  it('loads once, offline too, then every component gets it synchronously', async () => {
    expect(peekFlowsImpl()).toBeNull();
    // TanStack's default networkMode 'online' would pause this load while the browser says it is offline, and the
    // page would wait for ever; 'always' gives the chunk, or its error with a Retry.
    onlineManager.setOnline(false);
    try {
      const { wrapper, queryClient } = makeWrapper();
      const first = renderHook(() => useFlows(), { wrapper });
      await waitFor(() => expect(first.result.current.data).toBeDefined(), { timeout: 15_000 });
      expect(typeof first.result.current.data?.confirmTarget).toBe('function');
      expect(typeof first.result.current.data?.validatePlan).toBe('function');
      expect(peekFlowsImpl()).toBe(first.result.current.data);
      expect(flowsChunk.peek()).toBe(first.result.current.data);
      expect(queryClient.getQueryCache().find({ queryKey: FLOWS_KEY })?.options.networkMode).toBe('always');

      const second = renderHook(() => useFlows(), { wrapper: makeWrapper().wrapper });
      expect(second.result.current.data).toBe(first.result.current.data);
    } finally {
      onlineManager.setOnline(true);
    }
  }, 30_000);

  it('stays off the first paint of /: the home page, the layout and the shell never import it (R18.18)', () => {
    const list = [
      ...['app/page.tsx', 'app/layout.tsx', 'app/not-found.tsx'].map((f) => join(SRC, f)),
      ...files(join(SRC, 'home')),
      ...files(join(SRC, 'shell')),
    ];
    expect(list.length).toBeGreaterThan(10);
    const offenders = list.filter((f) => FLOWS.test(readFileSync(f, 'utf8'))).map((f) => relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it('the guard sees each way of writing the import', () => {
    for (const spec of [
      '@/flows/use-flows',
      '@/flows/impl',
      '@/flows/impl/index',
      '../flows/use-flows',
      '../../flows/impl',
      '@/flows/use-flows.ts',
      '../flows/impl/index.tsx',
      '@/flows/impl.js',
    ])
      expect(FLOWS.test(`import { x } from '${spec}';`), spec).toBe(true);
    for (const spec of ['@/flows/load', '@/flows/impl/time-machine', '@/flows/time-machine/load'])
      expect(FLOWS.test(`import { x } from '${spec}';`), spec).toBe(false);
  });
});
