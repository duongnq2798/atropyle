import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { UseMutationResult } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client';
import type { OkResponse, SubscribeRequest } from '../../src/api/types';
import { isEmail } from '../../src/components/subscribe/email';
import { hostedHref } from '../../src/components/subscribe/hosted';
import {
  HostedFormView,
  HostedOnlyNote,
  SubscribeForm,
  subscribeFailKey,
} from '../../src/components/subscribe/SubscribeForm';
import { useLang } from '../../src/i18n/provider';
import { renderWithProviders } from '../helpers/render';
import { PEOPLE } from './fixtures';

const target = vi.hoisted(() => ({ vercel: true }));
vi.mock('../../src/config/env', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/config/env')>();
  return {
    ...real,
    get IS_VERCEL() {
      return target.vercel;
    },
  };
});
const api = vi.hoisted(() => ({ subscribe: vi.fn() }));
vi.mock('../../src/api/instance', () => ({ getApi: () => (target.vercel ? api : null) }));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment } = await import('./fixtures');
  const chain = {
    loadDeployment: () => fixtureDeployment(),
    createSdk: () => ({ deployment: fixtureDeployment(), atro: {}, rpc: { read: [], verify: [] } }),
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }));

const HERE = dirname(fileURLToPath(import.meta.url));
/** A source file as text, with LF line ends whatever the checkout did. */
const source = (rel: string) => readFileSync(join(HERE, rel), 'utf8').replace(/\r\n/g, '\n');

/** The text of `export function isEmail` up to its closing brace. */
function isEmailText(file: string): string {
  const start = file.indexOf('export function isEmail(');
  const end = file.indexOf('\n}\n', start);
  if (start < 0 || end < 0) throw new Error('no isEmail in the file');
  return file.slice(start, end + 2);
}

/** The roles as values: Biome's useValidAriaRole reads a literal `role="heir"` on any element as an ARIA role. */
const ROLE = { owner: 'owner', guardian: 'guardian', heir: 'heir' } as const;

const mode = () => screen.getByTestId('subscribe').getAttribute('data-mode');
const field = () => screen.getByTestId('subscribe-email');
const live = () => screen.getByTestId('subscribe-live');
const press = () => fireEvent.click(screen.getByTestId('subscribe-send'));
const type = (value: string) => fireEvent.change(field(), { target: { value } });

function form(): HTMLFormElement {
  const f = screen.getByTestId('subscribe-send').closest('form');
  if (f === null) throw new Error('the send button is outside a form');
  return f;
}

/** Changes the page's language, as the settings menu does. */
function Flip() {
  const { lang, setLang } = useLang();
  return (
    <button type="button" onClick={() => setLang(lang === 'en' ? 'vi' : 'en')}>
      flip
    </button>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  target.vercel = true;
});

describe('isEmail, the copy of the backend check', () => {
  it('is the backend function, character for character', () => {
    expect(isEmailText(source('../../src/components/subscribe/email.ts'))).toBe(
      isEmailText(source('../../../backend/src/functions/subscribe.ts')),
    );
  });

  it('accepts and refuses the addresses the backend accepts and refuses', () => {
    const yes = [
      'ana@example.com',
      'a@b.co',
      'first.last+tag@sub.example.org',
      'ANA@EXAMPLE.COM',
      'ana@ví-dụ.vn',
      `${'a'.repeat(64)}@example.com`,
    ];
    const no = [
      '',
      'a@b',
      'not-an-email',
      '@example.com',
      'ana@@example.com',
      'ana@exa mple.com',
      'ana@example..com',
      'ana@.example.com',
      'ana@-example.com',
      'ana@example.com.',
      '"ana"@example.com',
      'ana<x>@example.com',
      `${'a'.repeat(65)}@example.com`,
      `a@${'b'.repeat(250)}.com`,
      'ana\u0000@example.com',
      'ana@example.com\n',
    ];
    for (const s of yes) expect(isEmail(s), JSON.stringify(s)).toBe(true);
    for (const s of no) expect(isEmail(s), JSON.stringify(s)).toBe(false);
  });
});

describe('hostedHref', () => {
  it('sends the owner to the vault page and the others to their join link, on the main site', () => {
    const v = PEOPLE.vault;
    expect(hostedHref('https://atropyle.xyz/', v, 'owner')).toEqual({
      href: `https://atropyle.xyz/vault/#${v}`,
      host: 'atropyle.xyz',
    });
    expect(hostedHref('https://atropyle.xyz', v, 'guardian')).toEqual({
      href: `https://atropyle.xyz/join/#${v}.guardian`,
      host: 'atropyle.xyz',
    });
    expect(hostedHref('https://example.test/app', v, 'heir')).toEqual({
      href: `https://example.test/app/join/#${v}.heir`,
      host: 'example.test',
    });
    expect(hostedHref('https://atropyle.xyz/?ref=x#top', v, 'heir')).toEqual({
      href: `https://atropyle.xyz/join/#${v}.heir`,
      host: 'atropyle.xyz',
    });
    expect(hostedHref('http://localhost:5173', v, 'owner')).toEqual({
      href: `http://localhost:5173/vault/#${v}`,
      host: 'localhost:5173',
    });
  });

  it('gives no link for a site that is not an http or https URL', () => {
    for (const bad of ['javascript:alert(1)', 'not a url', '', 'ftp://atropyle.xyz/', 'data:text/html,x']) {
      expect(hostedHref(bad, PEOPLE.vault, 'heir'), bad).toBeNull();
    }
  });
});

describe('subscribeFailKey', () => {
  it('chooses the words by the code alone', () => {
    const cases: [unknown, string][] = [
      [new ApiError('RATE_LIMITED', 429, 'x'), 'errorRateLimited'],
      [new ApiError('INVALID_INPUT', 400, 'x'), 'errorInvalid'],
      [new ApiError('NOT_A_VAULT', 400, 'x'), 'errorNotVault'],
      [new ApiError('TIMEOUT', null, 'x'), 'errorTimeout'],
      [new ApiError('NETWORK', null, 'x'), 'errorUnavailable'],
      [new ApiError('INTERNAL', 500, 'x'), 'errorUnavailable'],
      [new ApiError('BAD_RESPONSE', 404, 'x'), 'errorUnavailable'],
      [new ApiError('UNAVAILABLE', null, 'x'), 'errorUnavailable'],
      [new Error('offline'), 'errorUnavailable'],
      [Object.assign(new Error('look-alike'), { code: 'RATE_LIMITED' }), 'errorUnavailable'],
      ['RATE_LIMITED', 'errorUnavailable'],
    ];
    for (const [e, key] of cases) expect(subscribeFailKey(e), String(e)).toBe(key);
  });
});

describe('SubscribeForm on the hosted build', () => {
  it('sends the trimmed email, the empty trap and the chosen language, then says to check the inbox', async () => {
    api.subscribe.mockResolvedValue({ ok: true });
    renderWithProviders(<SubscribeForm vault={PEOPLE.vault} role={ROLE.heir} />, { lang: 'en' });
    expect(mode()).toBe('form');
    expect(screen.getByLabelText('Email address')).toBe(field());
    expect(live()).toBeEmptyDOMElement();
    type('  ana@example.com ');
    fireEvent.click(screen.getByRole('radio', { name: 'Tiếng Việt' }));
    press();
    await waitFor(() => expect(mode()).toBe('done'));
    expect(api.subscribe).toHaveBeenCalledTimes(1);
    expect(api.subscribe.mock.calls[0]?.[0]).toEqual({
      email: 'ana@example.com',
      vault: PEOPLE.vault,
      role: 'heir',
      lang: 'vi',
      website: '',
    });
    await waitFor(() => expect(screen.getByText('Check your inbox')).toHaveFocus());
    const help =
      'If ana@example.com can get alerts for this vault, a confirmation email is on its way. Nothing else is sent until you open the link in it.';
    await waitFor(() => expect(live().textContent).toBe(help));
    // On screen the address is a node of its own, set apart in the same sentence.
    expect(screen.getByText('ana@example.com').parentElement?.textContent).toBe(help);
  });

  it('mails in the page language until the reader picks one', async () => {
    api.subscribe.mockResolvedValue({ ok: true });
    renderWithProviders(
      <>
        <Flip />
        <SubscribeForm vault={PEOPLE.vault} role={ROLE.owner} />
      </>,
      { lang: 'en' },
    );
    const radio = (name: string) => screen.getByRole<HTMLInputElement>('radio', { name });
    expect(radio('English').checked).toBe(true);
    fireEvent.click(screen.getByText('flip'));
    await waitFor(() => expect(radio('Tiếng Việt').checked).toBe(true));
    expect(screen.getByLabelText('Địa chỉ email')).toBe(field());
    fireEvent.click(radio('English'));
    fireEvent.click(screen.getByText('flip'));
    fireEvent.click(screen.getByText('flip'));
    expect(radio('English').checked).toBe(true);
    type('ana@example.com');
    press();
    await waitFor(() => expect(api.subscribe).toHaveBeenCalledTimes(1));
    expect(api.subscribe.mock.calls[0]?.[0]).toMatchObject({ role: 'owner', lang: 'en' });
  });

  it('refuses an address the backend would refuse, before it asks, and says why', () => {
    renderWithProviders(<SubscribeForm vault={PEOPLE.vault} role={ROLE.owner} compact />, { lang: 'en' });
    type('ana@example');
    // What the field says when the focus lands is what a screen reader reads, so the error must be drawn first. RTL's
    // act flushes a plain setState before any assertion after press(), so only this moment tells the two orders apart.
    let atFocus: string | null = 'never';
    field().addEventListener(
      'focus',
      () => {
        atFocus = field().getAttribute('aria-invalid');
      },
      { once: true },
    );
    press();
    expect(atFocus).toBe('true');
    expect(api.subscribe).not.toHaveBeenCalled();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAccessibleDescription('Enter an email address like name@example.com.');
    expect(field()).toHaveFocus();
    // The focus moved, so a screen reader reads the field with its error: nothing is said twice.
    expect(live()).toBeEmptyDOMElement();
    // Enter in the field leaves the focus where it was, so the error is said aloud.
    fireEvent.submit(form());
    expect(live().textContent).toBe('Enter an email address like name@example.com.');
    type('ana@example.com');
    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(api.subscribe).not.toHaveBeenCalled();
  });

  it('catches a bot that fills the trap without any event', async () => {
    api.subscribe.mockResolvedValue({ ok: true });
    const { container } = renderWithProviders(<SubscribeForm vault={PEOPLE.vault} role={ROLE.guardian} />, {
      lang: 'en',
    });
    const trap = container.querySelector<HTMLInputElement>('input[name="website"]');
    if (trap === null) throw new Error('no trap');
    expect(trap.tabIndex).toBe(-1);
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull();
    trap.value = 'https://spam.example';
    type('ana@example.com');
    press();
    await waitFor(() => expect(api.subscribe).toHaveBeenCalledTimes(1));
    expect(api.subscribe.mock.calls[0]?.[0]).toMatchObject({ website: 'https://spam.example' });
  });

  it('names a rate limit on screen and aloud, ties it to the button, and clears it on the next edit', async () => {
    api.subscribe.mockRejectedValue(new ApiError('RATE_LIMITED', 429, 'Too many requests'));
    renderWithProviders(<SubscribeForm vault={PEOPLE.vault} role={ROLE.guardian} />, { lang: 'en' });
    const words = 'Too many sign-ups in the last hour. Try again later.';
    type('ana@example.com');
    press();
    expect((await screen.findByTestId('subscribe-error')).textContent).toBe(words);
    await waitFor(() => expect(live().textContent).toBe(words));
    expect(screen.getByTestId('subscribe-send')).toHaveAccessibleDescription(words);
    expect(mode()).toBe('form');
    // The same words again are a new node, so a screen reader says them again.
    const first = live().firstElementChild;
    press();
    await waitFor(() => expect(live().firstElementChild).not.toBe(first));
    expect(live().textContent).toBe(words);
    type('ana@example.org');
    // The mutation lives in HostedForm, the parent of the view whose state the edit sets, so the reset reaches the
    // view with TanStack's notify (setTimeout 0, Ruling R27), one macrotask after the edit.
    await waitFor(() => expect(screen.queryByTestId('subscribe-error')).toBeNull());
    expect(screen.getByTestId('subscribe-send')).not.toHaveAttribute('aria-describedby');
  });

  it('"Use another email address" brings the form back with the focus and the address in it', async () => {
    api.subscribe.mockResolvedValue({ ok: true });
    renderWithProviders(<SubscribeForm vault={PEOPLE.vault} role={ROLE.heir} compact />, { lang: 'en' });
    type('ana@example.com');
    press();
    await waitFor(() => expect(mode()).toBe('done'));
    fireEvent.click(screen.getByRole('button', { name: 'Use another email address' }));
    // sub.reset() reaches React through TanStack's notify scheduler (setTimeout 0), after the act of the click.
    await waitFor(() => expect(mode()).toBe('form'));
    await waitFor(() => expect(field()).toHaveFocus());
    expect(field()).toHaveValue('ana@example.com');
    // The first sign-up has settled, so the same form sends again.
    press();
    await waitFor(() => expect(api.subscribe).toHaveBeenCalledTimes(2));
  });

  it('starts over for another vault or role', async () => {
    api.subscribe.mockResolvedValue({ ok: true });
    const { rerender } = renderWithProviders(<SubscribeForm vault={PEOPLE.vault} role={ROLE.heir} />, { lang: 'en' });
    type('ana@example.com');
    press();
    await waitFor(() => expect(mode()).toBe('done'));
    rerender(<SubscribeForm vault={PEOPLE.vault} role={ROLE.guardian} />);
    expect(mode()).toBe('form');
    expect(field()).toHaveValue('');
  });

  it('sends once, however often the button is pressed while it sends', async () => {
    let answer: (v: { ok: true }) => void = () => {};
    api.subscribe.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    renderWithProviders(<SubscribeForm vault={PEOPLE.vault} role={ROLE.owner} />, { lang: 'en' });
    type('ana@example.com');
    press();
    const send = screen.getByTestId('subscribe-send');
    await waitFor(() => expect(send).toHaveAttribute('aria-busy', 'true'));
    press();
    fireEvent.submit(form());
    // A second mutate() reaches the API one microtask late (TanStack awaits onMutate first), so count after a flush.
    await act(async () => {});
    expect(api.subscribe).toHaveBeenCalledTimes(1);
    await act(async () => answer({ ok: true }));
    await waitFor(() => expect(mode()).toBe('done'));
    expect(api.subscribe).toHaveBeenCalledTimes(1);
  });

  it('sends once when the second press comes before the form has redrawn', async () => {
    let answer: (v: { ok: true }) => void = () => {};
    api.subscribe.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    renderWithProviders(<SubscribeForm vault={PEOPLE.vault} role={ROLE.owner} />, { lang: 'en' });
    type('ana@example.com');
    press();
    press();
    fireEvent.submit(form());
    // The premise: TanStack redraws the form with its notify (setTimeout 0), so the presses above, all in one task,
    // met a button that was not loading and a view whose sub.isPending was still false.
    expect(screen.getByTestId('subscribe-send')).not.toHaveAttribute('aria-busy');
    await act(async () => {});
    expect(api.subscribe).toHaveBeenCalledTimes(1);
    await act(async () => answer({ ok: true }));
    await waitFor(() => expect(mode()).toBe('done'));
    expect(api.subscribe).toHaveBeenCalledTimes(1);
  });

  it('sends nothing while the mutation it is given is already sending', () => {
    const mutate = vi.fn();
    const sub = {
      isPending: true,
      isSuccess: false,
      isError: false,
      error: null,
      variables: undefined,
      mutate,
      reset: vi.fn(),
    } as unknown as UseMutationResult<OkResponse, Error, SubscribeRequest>;
    renderWithProviders(<HostedFormView vault={PEOPLE.vault} role={ROLE.owner} sub={sub} />, { lang: 'en' });
    type('ana@example.com');
    press();
    fireEvent.submit(form());
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe('SubscribeForm on the DeWEB build', () => {
  it('points to the sign-up on the main site, in the page language, and asks nothing', async () => {
    target.vercel = false;
    renderWithProviders(<SubscribeForm vault={PEOPLE.vault} role={ROLE.heir} />, { lang: 'vi' });
    expect(mode()).toBe('hosted-only');
    const link = await screen.findByRole('link', { name: /Đăng\u00A0ký trên atropyle\.xyz/ });
    expect(link).toHaveAttribute('href', `https://atropyle.xyz/join/#${PEOPLE.vault}.heir`);
    expect(screen.getByText('Cảnh báo qua email cần một máy chủ, nên chỉ có trên trang chính.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(api.subscribe).not.toHaveBeenCalled();
  });

  it('shows the note without a link when the deployment names no site', () => {
    renderWithProviders(<HostedOnlyNote vault={PEOPLE.vault} role={ROLE.guardian} webUrl={null} />, { lang: 'en' });
    expect(mode()).toBe('hosted-only');
    expect(screen.getByText('Email alerts need a server, so they exist only on the main site.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
