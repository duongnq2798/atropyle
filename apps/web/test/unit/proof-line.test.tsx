import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import deployment from '../../../../deployments/xlayer.json';
import { ProofLine } from '../../src/shell/proof-line';
import { renderWithProviders } from '../helpers/render';

const nav = vi.hoisted(() => ({ push: vi.fn<(href: string) => void>() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: nav.push }) }));

const KECCAK = deployment.circuits.netlistKeccak.policy;
const SHORT = `${KECCAK.slice(0, 6)}…${KECCAK.slice(-4)}`;

/** Characters as a reader counts them: `…`, `→` and each Vietnamese letter are one. */
const length = (s: string | null) => Array.from((s ?? '').normalize('NFC')).length;

function variants() {
  const line = screen.getByTestId('proof-line');
  const wide = line.querySelector<HTMLElement>('[data-variant="wide"]');
  const narrow = line.querySelector<HTMLElement>('[data-variant="narrow"]');
  if (wide === null || narrow === null) throw new Error('the proof line needs a wide and a narrow variant');
  return { line, wide, narrow };
}

describe('ProofLine', () => {
  it('states the frozen netlist and links it to the proof and its limits', () => {
    renderWithProviders(<ProofLine />);
    const { line, wide, narrow } = variants();
    expect(line.tagName).toBe('P');
    expect(line.className.split(/\s+/)).toEqual(expect.arrayContaining(['h-6', 'font-mono', 'text-caption']));
    expect(wide.textContent).toBe(`Rules frozen in netlist ${SHORT} on X Layer · unaudited · limits →`);
    expect(narrow.textContent).toBe(`Rules ${SHORT} · unaudited →`);
    expect(wide.className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', 'md:inline']));
    expect(narrow.className.split(/\s+/)).toContain('md:hidden');
    for (const v of [wide, narrow]) {
      const links = Array.from(v.querySelectorAll('a'));
      expect(links).toHaveLength(2);
      expect(links[0].textContent).toBe(SHORT);
      expect(links[0].getAttribute('href')).toBe('/proof/');
      expect(links[0].getAttribute('title')).toBe(KECCAK);
      expect(links[1].getAttribute('href')).toBe('/proof/#limits');
    }
  });

  it('speaks Vietnamese in sentence case', async () => {
    renderWithProviders(<ProofLine />, { lang: 'vi' });
    await waitFor(() => expect(variants().narrow.textContent).toBe(`Luật ${SHORT} · chưa kiểm toán →`));
    expect(variants().wide.textContent).toBe(
      `Luật đóng băng trong netlist ${SHORT} trên X Layer · chưa kiểm toán · giới hạn →`,
    );
    expect(screen.getByRole('complementary', { name: 'Bằng chứng về luật' })).toContainElement(variants().line);
  });

  it('is a landmark of its own, so a reader who moves by landmarks reaches it', () => {
    renderWithProviders(<ProofLine />);
    const region = screen.getByRole('complementary', { name: 'Proof of the rules' });
    expect(region).toContainElement(variants().line);
  });

  it('keeps "unaudited" in the muted ink of the line on a phone too (R21); only the netlist link is gold', () => {
    renderWithProviders(<ProofLine />);
    const { wide, narrow } = variants();
    const classes = (a: Element) => (a.getAttribute('class') ?? '').split(/\s+/);
    const [keccak, unaudited] = Array.from(narrow.querySelectorAll('a'));
    expect(unaudited.textContent).toBe('unaudited →');
    expect(classes(unaudited)).toEqual(expect.arrayContaining(['text-ink-muted', 'underline', 'hover:text-ink']));
    expect(classes(unaudited).filter((c) => c.includes('thread'))).toEqual([]);
    for (const a of [keccak, ...Array.from(wide.querySelectorAll('a'))]) expect(classes(a)).toContain('text-thread');
  });

  it('never widens the page: it clips what does not fit, with room for a focus ring, and narrows its gutters', () => {
    renderWithProviders(<ProofLine />);
    expect(variants().line.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['overflow-clip', '[overflow-clip-margin:4px]', 'px-4', 'max-[20rem]:px-2']),
    );
  });

  it('fits one line: 36 characters on a phone, 96 from 48rem', async () => {
    // 12 px mono is about 7.2 px a character: 36 fit a 320 px phone inside 16 px gutters, 96 fit 48rem.
    for (const lang of ['en', 'vi'] as const) {
      const { unmount } = renderWithProviders(<ProofLine />, { lang });
      await waitFor(() => expect(variants().narrow.textContent).toContain(lang === 'vi' ? 'Luật' : 'Rules'));
      const { wide, narrow } = variants();
      expect(length(narrow.textContent), `${lang} narrow`).toBeLessThanOrEqual(36);
      expect(length(wide.textContent), `${lang} wide`).toBeLessThanOrEqual(96);
      unmount();
    }
  });

  it('leaves for /proof/ in a view transition, through NavLink like the footer (Task 15, outcome B)', () => {
    const updates: (() => unknown)[] = [];
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (update: () => unknown) => {
        updates.push(update);
        return {};
      },
    });
    // React handles the click at its root; this listener on window runs after it and stops happy-dom navigating.
    const guard = (e: Event) => e.preventDefault();
    window.addEventListener('click', guard);
    try {
      renderWithProviders(<ProofLine />);
      for (const a of Array.from(variants().line.querySelectorAll('a'))) fireEvent.click(a);
      expect(updates).toHaveLength(4);
      for (const update of updates) void update();
      expect(nav.push.mock.calls.map(([href]) => href)).toEqual([
        '/proof/',
        '/proof/#limits',
        '/proof/',
        '/proof/#limits',
      ]);
    } finally {
      window.removeEventListener('click', guard);
      Reflect.deleteProperty(document, 'startViewTransition');
    }
  });
});
