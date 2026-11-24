import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig, m, processFrame } from 'motion/react';
import type { ReactElement } from 'react';
import { encode } from 'uqr';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { untrusted } from '../../src/lib/untrusted';
import { MotionProvider } from '../../src/motion/provider';
import { REDUCED_MS } from '../../src/motion/tokens';
import { Address } from '../../src/ui/address';
import { Amount } from '../../src/ui/amount';
import { Banner } from '../../src/ui/banner';
import { Button, buttonClass } from '../../src/ui/button';
import { CopyButton } from '../../src/ui/copy-button';
import { Countdown } from '../../src/ui/countdown';
import { Dialog } from '../../src/ui/dialog';
import { ExternalLink, safeExternalHref } from '../../src/ui/external-link';
import { identiconOf } from '../../src/ui/identicon';
import { Popover } from '../../src/ui/popover';
import { QrCode, qrPath } from '../../src/ui/qr-code';
import { Skeleton } from '../../src/ui/skeleton';
import { TextField } from '../../src/ui/text-field';
import { UntrustedText } from '../../src/ui/untrusted-text';
import { renderWithProviders } from '../helpers/render';

const A = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

function clipboard(ok = true) {
  const writeText = vi.fn(async () => (ok ? undefined : Promise.reject(new Error('denied'))));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  return writeText;
}

/** Inside the real MotionProvider; `ready` resolves once its lazy features are in. */
function renderInMotion(ui: ReactElement) {
  const r = renderWithProviders(
    <MotionProvider>
      {ui}
      <m.span data-motion-probe="" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
    </MotionProvider>,
  );
  // Animations are skipped in unit tests, so the probe jumps to 1 as soon as an m.* element can animate at all.
  const probe = () => r.container.querySelector<HTMLElement>('[data-motion-probe]')?.style.opacity;
  return { ...r, ready: () => vi.waitFor(() => expect(probe()).toBe('1')) };
}

/**
 * Hand-driven frames (JS animations, no WAAPI): motion's clock moves only with processFrame. Sample the first frame
 * within motion's 40 ms keyframe window, so an animation keeps the time it was started at as its start.
 */
async function withHandFrames(run: (t0: number) => Promise<void>) {
  MotionGlobalConfig.skipAnimations = false;
  MotionGlobalConfig.useManualTiming = true;
  try {
    const t0 = performance.now();
    processFrame(t0);
    await run(t0);
  } finally {
    MotionGlobalConfig.useManualTiming = false;
    MotionGlobalConfig.skipAnimations = true;
  }
}

/** The animated wrapper of a CopyButton's icon. */
function iconOf(button: HTMLElement): HTMLElement {
  const el = button.querySelector<HTMLElement>(':scope > span.inline-flex');
  if (!el) throw new Error('no icon');
  return el;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
});

describe('Button', () => {
  it('is a plain button by default and busy while loading', () => {
    const { rerender } = renderWithProviders(<Button>Save</Button>);
    const b = screen.getByRole('button', { name: 'Save' });
    expect(b.getAttribute('type')).toBe('button');
    rerender(<Button loading>Save</Button>);
    expect(b.getAttribute('aria-busy')).toBe('true');
    expect((b as HTMLButtonElement).disabled).toBe(true);
  });

  it('gives links the same look', () => {
    expect(buttonClass({ variant: 'primary' })).toContain('bg-thread');
    expect(buttonClass({ variant: 'danger', size: 'lg' })).toContain('text-on-danger');
  });
});

describe('UntrustedText', () => {
  it('renders markup as text and truncates', () => {
    const evil = `<img src=x onerror="window.__pwned=1">${'A'.repeat(10_000)}`;
    const { container } = renderWithProviders(<UntrustedText value={evil} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent?.startsWith('<img src=x onerror=')).toBe(true);
    expect(Array.from(container.textContent ?? '').length).toBe(65);
    expect((globalThis as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('strips bidi and zero-width characters and isolates the direction', () => {
    const { container } = renderWithProviders(<UntrustedText value={'USD\u{202E}evil\u{200B}'} />);
    expect(container.textContent).toBe('USDevil');
    expect(container.querySelector('bdi')).not.toBeNull();
  });

  it('accepts an Untrusted value from the SDK and re-cleans it', () => {
    const { container } = renderWithProviders(
      <UntrustedText value={{ ...untrusted('Tether'), value: 'Te\u{200B}ther' }} />,
    );
    expect(container.textContent).toBe('Tether');
  });
});

describe('ExternalLink', () => {
  it('accepts only http and https', () => {
    expect(safeExternalHref('https://www.oklink.com/xlayer')).toBe('https://www.oklink.com/xlayer');
    expect(safeExternalHref('javascript:alert(1)')).toBeNull();
    expect(safeExternalHref('data:text/html,x')).toBeNull();
    expect(safeExternalHref('/relative')).toBeNull();
  });

  it('opens a new tab without an opener once mounted', () => {
    renderWithProviders(<ExternalLink href="https://web3.okx.com/xlayer">X Layer</ExternalLink>);
    const a = screen.getByRole('link', { name: /X Layer/ });
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.textContent).toContain('(opens in a new tab)');
  });

  it('never becomes a link for a refused URL', () => {
    const refused = 'javascript:alert(1)';
    renderWithProviders(<ExternalLink href={refused}>bad</ExternalLink>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('bad').getAttribute('data-external')).toBe('refused');
  });
});

describe('CopyButton', () => {
  it('copies and says so, then resets', async () => {
    // Only the timers the button uses: React's async act needs real microtasks and setImmediate.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    renderWithProviders(<CopyButton text={A} label="Copy address" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy address' }));
    });
    expect(writeText).toHaveBeenCalledWith(A);
    expect(screen.getByText('Copied')).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText('Copied')).toBeNull();
  });

  it('says when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error('denied'))) },
    });
    renderWithProviders(<CopyButton text="x" label="Copy" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(screen.getByText('Could not copy')).toBeTruthy();
  });

  it('shows a refused copy on screen too, in the danger tone', async () => {
    clipboard(false);
    renderWithProviders(
      <>
        <CopyButton text="x" label="Copy" />
        <CopyButton text="x" label="Copy link" showText />
      </>,
    );
    const icon = screen.getByRole('button', { name: 'Copy' });
    const text = screen.getByRole('button', { name: 'Copy link' });
    const copyGlyph = icon.querySelector('svg')?.innerHTML;
    await act(async () => {
      fireEvent.click(icon);
      fireEvent.click(text);
    });
    // A sighted user must not paste whatever was on the clipboard before.
    for (const b of [icon, text]) expect(b).toHaveClass('text-danger');
    expect(icon.querySelector('svg')?.innerHTML).not.toBe(copyGlyph);
    expect(text.textContent).toBe('Could not copy');
  });

  it('confirms a second copy again and restarts its reset', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    clipboard();
    renderWithProviders(<CopyButton text={A} label="Copy address" showText />);
    const button = screen.getByRole('button', { name: 'Copy address' });
    await act(async () => {
      fireEvent.click(button);
    });
    act(() => vi.advanceTimersByTime(1000));
    const first = button.querySelector('svg');
    await act(async () => {
      fireEvent.click(button);
    });
    // The check enters again, and the 1.6 s count starts over from the second copy.
    expect(button.querySelector('svg')).not.toBe(first);
    act(() => vi.advanceTimersByTime(1000));
    expect(button.textContent).toBe('Copied');
    act(() => vi.advanceTimersByTime(700));
    expect(button.textContent).toBe('Copy address');
  });

  it('draws its icon from the first commit, and only a copy makes the new icon enter', async () => {
    clipboard();
    const { ready } = renderInMotion(<CopyButton text={A} label="Copy address" />);
    const button = screen.getByRole('button', { name: 'Copy address' });
    // Spec §18.2, 6: the first paint is the final layout; no icon waits for motion's lazy features.
    expect(iconOf(button).style.opacity).not.toBe('0');
    expect(iconOf(button).style.transform).not.toContain('scale(0.6)');
    await ready();
    await withHandFrames(async (t0) => {
      await act(async () => {
        fireEvent.click(button);
      });
      const icon = iconOf(button);
      expect(icon.style.opacity).toBe('0');
      expect(icon.style.transform).toContain('scale(0.6)');
      processFrame(t0 + 16);
      expect(Number(icon.style.opacity), 'mid-spring').toBeGreaterThan(0);
      expect(Number(icon.style.opacity), 'mid-spring').toBeLessThan(1);
      processFrame(t0 + 1000);
      expect(icon.style.opacity).toBe('1');
      expect(icon.style.transform).toBe('none');
    });
  });

  it('crosses to the new icon in a 120 ms fade with no scale under reduced motion', async () => {
    clipboard();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (q: string) =>
        ({
          matches: q.includes('reduce'),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const { ready } = renderInMotion(<CopyButton text={A} label="Copy address" />);
    const button = screen.getByRole('button', { name: 'Copy address' });
    await ready();
    await withHandFrames(async (t0) => {
      await act(async () => {
        fireEvent.click(button);
      });
      const icon = iconOf(button);
      expect(icon.style.transform).not.toContain('scale(');
      processFrame(t0 + 16);
      expect(Number(icon.style.opacity), 'mid-fade').toBeGreaterThan(0);
      expect(Number(icon.style.opacity), 'mid-fade').toBeLessThan(1);
      processFrame(t0 + REDUCED_MS + 1);
      expect(icon.style.opacity, `in by ${REDUCED_MS} ms`).toBe('1');
      expect(icon.style.transform).not.toContain('scale(');
    });
  });
});

describe('Address', () => {
  it('shows the whole address in groups of four, never shortened', () => {
    const { container } = renderWithProviders(<Address address={A} />);
    const text = container.querySelector('[translate="no"]')?.textContent;
    expect(text).toBe(A);
    expect(container.querySelector('[data-address]')?.getAttribute('data-address')).toBe(A);
    expect(container.querySelectorAll('[translate="no"] > span')).toHaveLength(11);
    expect(screen.getByRole('button', { name: 'Copy address' })).toBeTruthy();
  });

  it('wraps a long address only between its groups', () => {
    const { container } = renderWithProviders(<Address address={A} />);
    const groups = container.querySelector('[translate="no"]');
    // break-all would split a group across lines, which defeats the group-by-group comparison (spec §4.2).
    expect(groups).not.toHaveClass('break-all');
    expect(groups).toHaveClass('wrap-anywhere');
    // A break opportunity before every group after the first, none inside "0x3C44".
    const nodes = Array.from(groups?.childNodes ?? []);
    expect(nodes.filter((n) => n.nodeName === 'WBR')).toHaveLength(9);
    expect(nodes.findIndex((n) => n.nodeName === 'WBR')).toBe(2);
    expect(groups?.textContent).toBe(A);
  });

  it('links to the explorer', () => {
    renderWithProviders(<Address address={A} explorer="https://www.oklink.com/xlayer" />);
    const a = screen.getByRole('link', { name: /View on OKLink/ });
    expect(a.getAttribute('href')).toBe(`https://www.oklink.com/xlayer/address/${A}`);
  });

  it('draws a mirrored identicon that ignores letter case', () => {
    const id = identiconOf(A);
    expect(identiconOf(A.toLowerCase())).toEqual(id);
    expect(id.cells).toHaveLength(25);
    for (let row = 0; row < 5; row++) {
      expect(id.cells[row * 5]).toBe(id.cells[row * 5 + 4]);
      expect(id.cells[row * 5 + 1]).toBe(id.cells[row * 5 + 3]);
    }
    expect(id.hue).toBeGreaterThanOrEqual(0);
    expect(id.hue).toBeLessThan(360);
    expect(identiconOf('0x0000000000000000000000000000000000000001')).not.toEqual(id);
    expect(() => identiconOf('not hex')).not.toThrow();
  });

  it('draws another face when any digit differs, not only the leading ones', () => {
    // Address poisoning: a look-alike shares the leading and trailing digits, so the face must not come from them.
    const face = identiconOf(A);
    expect(identiconOf(`${A.slice(0, 20)}${'0'.repeat(18)}${A.slice(-4)}`)).not.toEqual(face);
    for (let i = 2; i < 42; i++) {
      const other = A[i].toLowerCase() === '0' ? '1' : '0';
      expect(identiconOf(A.slice(0, i) + other + A.slice(i + 1)), `digit ${i - 2}`).not.toEqual(face);
    }
  });
});

describe('Amount', () => {
  it('formats with the token symbol and keeps the raw value', () => {
    renderWithProviders(<Amount raw={1_234_567_890n} decimals={6} symbol={untrusted('USDC')} />);
    const b = screen.getByRole('button', { name: /1,234\.56789/ });
    expect(b.textContent).toContain('USDC');
    expect(b.getAttribute('data-raw')).toBe('1234567890');
    // The figure and the unit are two words to a screen reader, not "1,234.56789USDC".
    expect(screen.getByRole('button', { name: '1,234.56789 USDC' })).toBe(b);
  });

  it('says "base units" when the token has no decimals', () => {
    renderWithProviders(<Amount raw={5n} decimals={null} symbol="NFT" />);
    expect(screen.getByRole('button').textContent).toContain('base units');
  });
});

describe('Countdown', () => {
  it('counts down in chain time and turns into "ago"', () => {
    vi.useFakeTimers();
    const fetchedAtMs = Date.now();
    renderWithProviders(<Countdown target={1090n} blockTimestamp={1000n} fetchedAtMs={fetchedAtMs} />);
    const time = () => document.querySelector('time');
    expect(time()?.textContent).toBe('in 1m 30s');
    act(() => vi.advanceTimersByTime(30_000));
    expect(time()?.textContent).toBe('in 1m');
    act(() => vi.advanceTimersByTime(100_000));
    expect(time()?.textContent).toBe('40s ago');
    expect(time()?.getAttribute('data-past')).toBe('true');
  });

  it('survives a timestamp no date can hold', () => {
    renderWithProviders(<Countdown target={2n ** 200n} blockTimestamp={1n} fetchedAtMs={0} />);
    expect(document.querySelector('time')?.getAttribute('datetime')).toBeNull();
  });
});

describe('Banner', () => {
  it('interrupts only for errors and can be dismissed', () => {
    const onDismiss = vi.fn();
    const { rerender } = renderWithProviders(<Banner tone="info">Note</Banner>);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(
      <Banner tone="error" onDismiss={onDismiss}>
        Broken
      </Banner>,
    );
    expect(screen.getByRole('alert').textContent).toContain('Broken');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe('Dialog', () => {
  it('opens from its trigger with a title, and closes with Escape', async () => {
    renderWithProviders(
      <Dialog trigger={<Button>Open</Button>} title="Choose a wallet" description="Pick one.">
        <p>Body</p>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = await screen.findByRole('dialog', { name: 'Choose a wallet' });
    expect(dialog.textContent).toContain('Body');
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the page behind a phone sheet solid and blurs it only from 48rem', async () => {
    renderWithProviders(
      <Dialog open title="Choose a wallet">
        <p>Body</p>
      </Dialog>,
    );
    await screen.findByRole('dialog', { name: 'Choose a wallet' });
    const overlay = document.querySelector('.atro-overlay');
    // Spec §18.4.1: backdrop-filter on a full-screen layer costs a phone GPU on every frame of the sheet animation.
    expect(overlay).toHaveClass('bg-bg/95', 'md:bg-bg/70', 'md:backdrop-blur-[3px]');
    expect(overlay).not.toHaveClass('bg-bg/70');
    expect(overlay).not.toHaveClass('backdrop-blur-[3px]');
  });
});

describe('Popover', () => {
  it('names its dialog, so the label is required', async () => {
    renderWithProviders(
      <Popover label="Settings" trigger={<Button>Open</Button>}>
        <p>Body</p>
      </Popover>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect((await screen.findByRole('dialog', { name: 'Settings' })).textContent).toContain('Body');
    // An unnamed role="dialog" fails axe's aria-dialog-name rule.
    expectTypeOf<Parameters<typeof Popover>[0]['label']>().toEqualTypeOf<string>();
  });
});

describe('TextField', () => {
  it('labels the input and links its hint and error', () => {
    renderWithProviders(<TextField label="Vault address" hint="0x and 40 characters" error="Not an address" mono />);
    const input = screen.getByLabelText('Vault address');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toHaveLength(2);
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toEqual([
      '0x and 40 characters',
      'Not an address',
    ]);
  });
});

describe('QrCode', () => {
  it('draws one square per dark module, labelled', () => {
    expect(
      qrPath([
        [true, false],
        [false, true],
      ]),
    ).toBe('M0 0h1v1h-1zM1 1h1v1h-1z');
    const value = `https://atropyle.app/vault/#${A}`;
    renderWithProviders(<QrCode value={value} label="this page" />);
    const svg = screen.getByRole('img', { name: 'QR code for this page' });
    const dark = encode(value, { ecc: 'M', border: 2 }).data.flat().filter(Boolean).length;
    expect(svg.querySelector('path')?.getAttribute('d')?.match(/M/g)).toHaveLength(dark);
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive technology and shimmers only with motion allowed', () => {
    const { container } = renderWithProviders(<Skeleton className="h-4 w-24" />);
    const root = container.firstElementChild;
    expect(root?.getAttribute('aria-hidden')).toBe('true');
    expect(container.innerHTML).toContain('motion-safe:animate-shimmer');
  });
});
