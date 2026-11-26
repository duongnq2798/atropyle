import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NotFound from '../../src/app/not-found';
import { XLAYER_EXPLORER } from '../../src/config/env';
import { MAINNET_FACTORY } from '../../src/config/facts';
import { HomeHero } from '../../src/home/hero';
import { DEPTHS } from '../../src/home/netlist-geometry';
import { WeaveArt } from '../../src/home/weave-svg';
import { REPO_URL } from '../../src/lib/links';
import { KEYS } from '../../src/lib/store';
import { messages as home } from '../../src/messages/home.messages';
import { Footer } from '../../src/shell/footer';
import { Frame } from '../../src/shell/frame';
import { Header } from '../../src/shell/header';
import { LangSwitch } from '../../src/shell/lang-switch';
import { MobileMenu } from '../../src/shell/mobile-menu';
import { ThemeSwitch } from '../../src/shell/theme-switch';
import { Wordmark } from '../../src/shell/wordmark';
import { GLYPH_NAMES } from '../../src/thread/glyphs';
import { renderWithProviders } from '../helpers/render';

vi.mock('next/navigation', () => ({
  usePathname: () => '/create/',
  useSelectedLayoutSegment: () => 'create',
  useRouter: () => ({ push: () => undefined }),
}));

const root = document.documentElement;
afterEach(() => root.removeAttribute('data-theme'));

/**
 * Text as a reader hears it. The hero glues words with no-break spaces (glue() in home.messages.ts): text and names
 * are compared with every space read as one, as a screen reader says them and as getByText already reads text.
 */
const spoken = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ');

describe('Frame', () => {
  it('skips to the main content without touching the hash', () => {
    window.history.replaceState(null, '', '/vault/#0xabc');
    renderWithProviders(
      <Frame>
        <p>Body</p>
      </Frame>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Skip to content' }));
    expect(document.activeElement?.tagName).toBe('MAIN');
    expect(window.location.hash).toBe('#0xabc');
    window.history.replaceState(null, '', '/');
  });

  it('marks the current page in the navigation', () => {
    renderWithProviders(
      <Frame>
        <p>Body</p>
      </Frame>,
    );
    const nav = screen.getByRole('navigation', { name: 'Main' });
    const create = nav.querySelector('a[href="/create/"]');
    expect(create?.getAttribute('aria-current')).toBe('page');
    expect(nav.querySelector('a[href="/proof/"]')?.getAttribute('aria-current')).toBeNull();
    expect(screen.getByRole('link', { name: 'Atropyle home' }).getAttribute('href')).toBe('/');
  });

  it('opens with the skip button for the keyboard, then the proof line, then the header', () => {
    renderWithProviders(
      <Frame>
        <p>Body</p>
      </Frame>,
    );
    // Found by role and test id, never by child index: the proof line is the first visible band, right after the skip
    // link, whatever later tasks put around the three.
    const skip = screen.getByRole('button', { name: 'Skip to content' });
    const proof = screen.getByTestId('proof-line');
    const header = screen.getByRole('banner');
    expect(skip.compareDocumentPosition(proof) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(proof.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(proof.contains(screen.getAllByRole('link')[0])).toBe(true);
  });
});

describe('Header', () => {
  it('is solid below 48rem, blurs only from 48rem, and wears the mark', () => {
    renderWithProviders(<Header />);
    const cls = screen.getByRole('banner').className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(['site-header', 'sticky', 'bg-bg/95', 'md:bg-bg/80']));
    expect(cls.filter((c) => c.includes('backdrop-blur'))).toEqual(['md:backdrop-blur-md']);
    const homeLink = screen.getByRole('link', { name: 'Atropyle home' });
    expect(homeLink.querySelector('svg[data-glyph="mark"]')).not.toBeNull();
  });
});

describe('Wordmark', () => {
  it('draws the mark in one stroke, in the thread colour, before the name', () => {
    expect(GLYPH_NAMES).toContain('mark');
    const { container } = renderWithProviders(<Wordmark />);
    const mark = container.querySelector('svg[data-glyph="mark"]');
    expect(mark?.querySelectorAll('path')).toHaveLength(1);
    expect(mark?.getAttribute('class')).toContain('text-thread');
    expect(mark?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).toBe('Atropyle');
  });
});

describe('settings', () => {
  it('switches language with native radios and remembers it', async () => {
    const { kv } = renderWithProviders(<LangSwitch />);
    expect(screen.getByRole('group', { name: 'Language' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Tiếng Việt' }));
    await waitFor(() => expect(document.documentElement.lang).toBe('vi'));
    expect(kv.get(KEYS.lang)).toBe('vi');
    expect((screen.getByRole('radio', { name: 'Tiếng Việt' }) as HTMLInputElement).checked).toBe(true);
  });

  it('opens at night, then switches to vellum, to match device and back to night', async () => {
    const { kv } = renderWithProviders(<ThemeSwitch />);
    const radio = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;
    await waitFor(() => expect(radio('Night').checked).toBe(true));
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('value'))).toEqual(['dark', 'light', 'system']);
    fireEvent.click(radio('Vellum'));
    await waitFor(() => expect(root.getAttribute('data-theme')).toBe('light'));
    expect(kv.get(KEYS.theme)).toBe('light');
    fireEvent.click(radio('Match device'));
    await waitFor(() => expect(root.getAttribute('data-theme')).toBe('system'));
    fireEvent.click(radio('Night'));
    await waitFor(() => expect(root.hasAttribute('data-theme')).toBe(false));
    expect(kv.get(KEYS.theme)).toBe('dark');
    expect(radio('Night').checked).toBe(true);
  });

  it('names the three themes in Vietnamese', async () => {
    renderWithProviders(<ThemeSwitch />, { lang: 'vi' });
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Đêm' })).toBeTruthy());
    expect(screen.getByRole('radio', { name: 'Giấy da' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Theo thiết bị' })).toBeTruthy();
  });

  it('opens the navigation as a sheet on narrow screens', async () => {
    renderWithProviders(<MobileMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const sheet = await screen.findByRole('dialog', { name: 'Menu' });
    expect(sheet.querySelector('a[href="/create/"]')?.getAttribute('aria-current')).toBe('page');
    expect(sheet.querySelector('input[type="radio"]')).not.toBeNull();
  });
});

describe('Footer', () => {
  it('names its limits, the page for heirs and what it never collects, and links out in a new tab', () => {
    renderWithProviders(<Footer />);
    expect(screen.getByRole('contentinfo').classList.contains('site-footer')).toBe(true);
    expect(screen.getByRole('link', { name: 'Known limits' }).getAttribute('href')).toBe('/proof/#limits');
    expect(screen.getByRole('link', { name: 'For heirs and guardians' }).getAttribute('href')).toBe('/verify/');
    expect(screen.getByText('No trackers · No cookies')).toBeTruthy();
    const source = screen.getByRole('link', { name: /Source code/ });
    expect(source.getAttribute('href')).toBe(REPO_URL);
    expect(source.getAttribute('target')).toBe('_blank');
    expect(screen.getByText('Version 0.0.0-test')).toBeTruthy();
    expect(screen.getByText('100% on-chain')).toBeTruthy();
    expect(screen.queryByText(/Beta —/)).toBeNull();
  });
});

describe('pages', () => {
  it('the 404 page shows the missing path as text', () => {
    window.history.replaceState(null, '', '/nope/<img src=x>');
    const { container } = renderWithProviders(<NotFound />);
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('/nope/');
    expect(screen.getByRole('link', { name: 'Go to the home page' }).getAttribute('href')).toBe('/');
    window.history.replaceState(null, '', '/');
  });

  it('the home page asks its question, offers a Drill that says what it costs, the proof, and three facts', () => {
    const { container } = renderWithProviders(<HomeHero art={<WeaveArt />} />);
    const h1 = screen.getByRole('heading', {
      level: 1,
      name: 'What happens to your crypto when you can no longer sign?',
    });
    // No eyebrow: the question opens the hero (spec §18.4.3 Task 4). The weave shows under it, as decoration, but
    // comes last in the column's markup, so gzip finds its copy in Next's payload (ruling R-T5p-1; home.spec.ts
    // checks the order a reader sees).
    expect(h1.previousElementSibling).toBeNull();
    const weave = container.querySelector('.weave');
    expect(h1.parentElement?.lastElementChild).toBe(weave);
    expect(weave?.getAttribute('aria-hidden')).toBe('true');
    expect(weave?.querySelectorAll('.weave-col')).toHaveLength(DEPTHS);
    // R18.4, the markup side (weave-css.test.ts holds the CSS side): in the weave only the thread's glow svg carries
    // an animation class; no path and no group does.
    const animated = [...(weave?.querySelectorAll('[class*="animate-"]') ?? [])].map((e) => e.tagName.toLowerCase());
    expect(animated).toEqual(['svg']);
    expect(weave?.querySelector('path[class*="animate-"], g[class*="animate-"]')).toBeNull();
    const named = container.querySelector<HTMLElement>('[data-weave="thread"]');
    expect(named?.style.viewTransitionName).toBe('atropyle-thread');
    // The number in heroDrill is pinned by drill-minutes.test.ts.
    const drill = screen.getByRole('link', { name: home.en.heroDrill });
    expect(drill.getAttribute('href')).toBe('/create/#drill');
    const note = document.getElementById(drill.getAttribute('aria-describedby') ?? '');
    expect(spoken(note?.textContent)).toBe('No Atropyle fee. You pay only X Layer network gas, in OKB.');
    expect(screen.getByRole('link', { name: 'See the proof' }).getAttribute('href')).toBe('/proof/');
    const lead = screen.getByText(/^Nothing, unless you plan for it\./);
    // True for a vault without guardians too (spec §18.4.1 item 4).
    expect(lead.textContent).toContain('the people you chose receive');
    expect(lead.textContent).not.toContain('guardians confirm');
    // The facts: custody, the mainnet date linked to the factory on OKLink, and the door for heirs.
    const items = within(screen.getByTestId('hero-facts')).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toBe('Your tokens stay in your wallet');
    const live = within(items[1]).getByRole('link');
    expect(spoken(live.textContent)).toContain('Live on X Layer mainnet since 22 Nov 2026');
    expect(live.getAttribute('href')).toBe(`${XLAYER_EXPLORER}/address/${MAINNET_FACTORY}`);
    expect(live.getAttribute('target')).toBe('_blank');
    const door = within(items[2]).getByRole('link', { name: 'Named as an heir or a guardian? Start here' });
    expect(door.getAttribute('href')).toBe('/verify/');
  });

  it('the home page speaks Vietnamese', async () => {
    renderWithProviders(<HomeHero art={<WeaveArt />} />, { lang: 'vi' });
    const named = (text: string) => (name: string) => spoken(name) === text;
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: named('Chuyện gì xảy ra với tài sản crypto của bạn khi bạn không còn ký được nữa?'),
      }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: home.vi.heroDrill }).getAttribute('href')).toBe('/create/#drill');
    expect(screen.getByText('Atropyle không thu phí. Bạn chỉ trả gas của mạng X Layer, bằng OKB.')).toBeTruthy();
    expect(screen.getByText('Token của bạn nằm yên trong ví')).toBeTruthy();
    expect(
      screen.getByRole('link', {
        name: (n) => /^Đang chạy trên mainnet X Layer từ 22\/11\/2026/.test(spoken(n)),
      }),
    ).toBeTruthy();
    const door = screen.getByRole('link', { name: named('Bạn là người thừa kế hay giám hộ? Bắt đầu ở đây') });
    expect(door.getAttribute('href')).toBe('/verify/');
  });

  it('the home page asks the circuit: three native radios, the answer of the checked one, the circuit counted', () => {
    const { container } = renderWithProviders(<HomeHero art={<WeaveArt />} />);
    const section = container.querySelector('section.hero');
    expect(section?.getAttribute('data-ask')).toBe('a');
    const group = screen.getByRole('group', { name: 'Ask the circuit' });
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.map((r) => spoken(r.closest('label')?.textContent))).toEqual([
      'If I keep checking in',
      'If I go silent',
      'If my guardians lie while I keep checking in',
    ]);
    expect(radios.map((r) => r.checked)).toEqual([true, false, false]);
    // Each radio is described by its own answer, so a screen reader hears it on the chip.
    expect(radios.map((r) => document.getElementById(r.getAttribute('aria-describedby') ?? '')?.textContent)).toEqual([
      home.en.answerAlive,
      home.en.answerSilent,
      home.en.answerLiar,
    ]);
    fireEvent.click(radios[1]);
    expect(section?.getAttribute('data-ask')).toBe('s');
    const caption = screen.getByText(/^The real policy circuit, 196 NAND gates and 3 latches in 39 layers/);
    const run = within(caption).getByRole('link', { name: 'Run all 67,108,864 cases yourself' });
    expect(run.getAttribute('href')).toBe('/proof/');
    // The woven title: two copies of one thread inside the H1, out of the accessibility tree; the name stays.
    const h1 = screen.getByRole('heading', {
      level: 1,
      name: 'What happens to your crypto when you can no longer sign?',
    });
    const woven = h1.querySelector('.title-weave');
    expect(woven?.getAttribute('aria-hidden')).toBe('true');
    expect(woven?.querySelectorAll('svg path')).toHaveLength(2);
    // The release pin in the weave turns violet for the questions that open the gate.
    expect(container.querySelector('.weave-pin')?.getAttribute('data-open')).toBe('s');
  });

  it('the home page asks the circuit in Vietnamese', async () => {
    renderWithProviders(<HomeHero art={<WeaveArt />} />, { lang: 'vi' });
    const named = (text: string) => (name: string) => spoken(name) === text;
    expect(await screen.findByRole('group', { name: 'Hỏi circuit' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: named('Nếu tôi im lặng') })).toBeTruthy();
    expect(screen.getByRole('link', { name: named('Tự chạy cả 67.108.864 trường hợp') }).getAttribute('href')).toBe(
      '/proof/',
    );
  });
});
