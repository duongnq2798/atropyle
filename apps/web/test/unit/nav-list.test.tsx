import { act } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LangProvider } from '../../src/i18n/provider';
import { KVProvider } from '../../src/lib/kv';
import { memoryKV } from '../../src/lib/store';
import { NavList } from '../../src/shell/nav-list';

const nav = vi.hoisted(() => ({ pathname: '/', segment: null as string | null }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSelectedLayoutSegment: () => nav.segment,
  useRouter: () => ({ push: () => undefined }),
}));

const mounted: { root: Root; container: HTMLElement }[] = [];
afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

/** Prerenders the bar at the build's pathname, then hydrates it where the browser is, as a static host serves it. */
async function hydrateBar(built: string, served: string): Promise<{ container: HTMLElement; errors: unknown[] }> {
  const tree = (
    <KVProvider kv={memoryKV()}>
      <LangProvider>
        <NavList layout="bar" />
      </LangProvider>
    </KVProvider>
  );
  nav.pathname = built;
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  document.body.append(container);
  nav.pathname = served;
  const errors: unknown[] = [];
  await act(async () => {
    mounted.push({ root: hydrateRoot(container, tree, { onRecoverableError: (e) => errors.push(e) }), container });
  });
  return { container, errors };
}

describe('NavList', () => {
  it('hydrates the 404 page under a missing nav route without a mismatch, and marks no page current', async () => {
    // 404.html is prerendered once, at /_not-found, and served for every missing path: usePathname() then reads the
    // address bar, while the segment comes from the router tree inside the page, which still says /_not-found.
    nav.segment = '/_not-found';
    const { container, errors } = await hydrateBar('/_not-found', '/create/');
    expect(errors).toEqual([]);
    expect(container.querySelector('[aria-current]')).toBeNull();
  });

  it('marks the current page on a real route, from the first paint', async () => {
    nav.segment = 'create';
    const { container, errors } = await hydrateBar('/create/', '/create/');
    expect(errors).toEqual([]);
    expect(container.querySelector('a[aria-current="page"]')?.getAttribute('href')).toBe('/create/');
  });
});
