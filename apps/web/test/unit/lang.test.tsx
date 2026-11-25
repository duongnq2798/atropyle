import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineMessages } from '../../src/i18n/core';
import { LangProvider, useLang, useT } from '../../src/i18n/provider';
import { KVProvider } from '../../src/lib/kv';
import { KEYS, type KV, memoryKV } from '../../src/lib/store';

const m = defineMessages({ hi: 'Hello {name}' }, { hi: 'Xin chào {name}' });

function wrap(kv: KV) {
  return ({ children }: { children: ReactNode }) => (
    <KVProvider kv={kv}>
      <LangProvider>{children}</LangProvider>
    </KVProvider>
  );
}

function Greeting() {
  const t = useT(m);
  return <p>{t('hi', { name: 'An' })}</p>;
}

/** happy-dom defines `languages` on the Navigator prototype; an own property shadows it until deleted. */
function stubLanguages(list: string[]) {
  Object.defineProperty(navigator, 'languages', { configurable: true, get: () => list });
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'languages');
  document.documentElement.lang = 'en';
});

describe('LangProvider', () => {
  it('renders English first, then the stored language, and updates <html lang>', async () => {
    const kv = memoryKV();
    kv.set(KEYS.lang, 'vi');
    render(<Greeting />, { wrapper: wrap(kv) });
    await waitFor(() => expect(screen.getByText('Xin chào An')).toBeTruthy());
    expect(document.documentElement.lang).toBe('vi');
  });

  it('prerenders English even when another language is stored (the static HTML)', () => {
    const kv = memoryKV();
    kv.set(KEYS.lang, 'vi');
    const Wrapper = wrap(kv);
    const html = renderToString(
      <Wrapper>
        <Greeting />
      </Wrapper>,
    );
    expect(html).toContain('Hello An');
    expect(html).not.toContain('Xin chào');
  });

  it('follows the browser language when nothing is stored', async () => {
    stubLanguages(['vi-VN', 'en']);
    render(<Greeting />, { wrapper: wrap(memoryKV()) });
    await waitFor(() => expect(screen.getByText('Xin chào An')).toBeTruthy());
  });

  it('ignores a garbage stored language', async () => {
    stubLanguages(['en-US']);
    const kv = memoryKV();
    kv.set(KEYS.lang, '<b>fr</b>');
    const { result } = renderHook(() => useLang(), { wrapper: wrap(kv) });
    await waitFor(() => expect(result.current.lang).toBe('en'));
  });

  it('remembers a chosen language', async () => {
    const kv = memoryKV();
    const { result } = renderHook(() => useLang(), { wrapper: wrap(kv) });
    act(() => result.current.setLang('vi'));
    expect(result.current.lang).toBe('vi');
    expect(kv.get(KEYS.lang)).toBe('vi');
    await waitFor(() => expect(document.documentElement.lang).toBe('vi'));
  });

  it('throws a clear error outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useLang())).toThrow(/LangProvider/);
  });
});
