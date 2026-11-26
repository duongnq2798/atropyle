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

  it('offers the vault and its verification for an address', () => {
    renderWithProviders(<NotFoundHint pathname={`/${V}`} />);
    const hrefs = [...screen.getByTestId('not-found-vault').querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual([`/vault/#${V}`, `/verify/#${V}`]);
  });

  it('renders nothing when nothing is close', () => {
    const { container } = renderWithProviders(<NotFoundHint pathname="/wp-admin/" />);
    expect(container.textContent).toBe('');
  });
});
