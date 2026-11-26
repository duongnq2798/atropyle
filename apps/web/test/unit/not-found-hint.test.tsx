import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NotFoundHint from '../../src/shell/not-found-hint';
import { renderWithProviders } from '../helpers/render';

// NavLink reads the app router, which a unit test has no Next.js to mount.
vi.mock('next/navigation', () => ({
  usePathname: () => '/prof/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const V = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

describe('the 404 hint', () => {
  it('links the nearest page', () => {
    renderWithProviders(<NotFoundHint pathname="/prof/" />);
    const box = screen.getByTestId('not-found-suggest');
    expect(box.hasAttribute('data-nf-suggest')).toBe(true);
    expect(box.querySelector('a')?.getAttribute('href')).toBe('/proof/');
  });

  it('offers the vault and its verification for an address', async () => {
    renderWithProviders(<NotFoundHint pathname={`/${V}`} />);
    const hrefs = [...(await screen.findByTestId('not-found-vault')).querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual([`/vault/#${V}`, `/verify/#${V}`]);
  });

  it('shows the address in groups of four, in full, with no copy button', async () => {
    renderWithProviders(<NotFoundHint pathname={`/${V}`} />);
    const box = await screen.findByTestId('not-found-vault');
    expect(box.hasAttribute('data-nf-vault')).toBe(true);
    const addr = box.querySelector(`[data-address="${V}"]`);
    expect(addr).not.toBeNull();
    expect(addr?.querySelector('[data-part="groups"]')?.textContent?.replace(/\s/g, '')).toBe(V);
    expect(box.querySelectorAll('button')).toHaveLength(0);
  });

  it('renders nothing when nothing is close', () => {
    const { container } = renderWithProviders(<NotFoundHint pathname="/wp-admin/" />);
    expect(container.textContent).toBe('');
  });
});
