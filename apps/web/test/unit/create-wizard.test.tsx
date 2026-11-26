import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionKV } from '../../src/app/create/use-wizard';
import { Wizard } from '../../src/app/create/wizard';
import * as impl from '../../src/flows/impl';
import { renderWithProviders } from '../helpers/render';
import { PEOPLE } from './fixtures';

// Steps one to five never need the chain: no SDK, so no RPC, and no time machine chunk.
vi.mock('../../src/chain/use-sdk', () => ({
  useSdk: () => ({ data: undefined, error: null, isPending: true }),
}));
vi.mock('../../src/flows/time-machine/lazy', () => ({
  LazyTimeMachine: () => <div data-testid="time-machine" />,
}));
// The frozen session's way on is a NavLink to the vault page, and NavLink needs the app router.
vi.mock('next/navigation', () => ({
  usePathname: () => '/create/',
  useRouter: () => ({ push: () => undefined, replace: () => undefined }),
}));

const step = () => screen.getByTestId('create').getAttribute('data-step');
const next = () => fireEvent.click(screen.getByTestId('create-next'));
const ready = () => waitFor(() => expect(screen.getByTestId('create')).toHaveAttribute('data-ready', 'true'));
const SESSION_KEY = 'atropyle:create';
const saved = () => JSON.parse(window.sessionStorage.getItem(SESSION_KEY) ?? 'null') as { salt: string } | null;
const salt = `0x${'ab'.repeat(32)}` as const;

beforeEach(() => {
  // The module's one sessionKV keeps a memory copy that sessionStorage.clear() does not reach: remove() clears both.
  sessionKV().remove(SESSION_KEY);
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/create/');
});

describe('create wizard', () => {
  it('blocks Next until the step is valid and keeps the step across a reload', async () => {
    const first = renderWithProviders(<Wizard />);
    await ready();
    expect(step()).toBe('kind');
    expect(screen.getByTestId('create-kind-drill')).toBeChecked();
    // The issue region is in the page from the first paint, empty (7A rule 19).
    expect(screen.getByTestId('create-issues')).toHaveAttribute('data-count', '0');
    next();
    expect(step()).toBe('heirs');
    // Keyboard and screen reader users land on the new step's question.
    expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 }));
    next();
    expect(step()).toBe('heirs');
    expect(Number(screen.getByTestId('create-issues').getAttribute('data-count'))).toBeGreaterThan(0);
    fireEvent.change(screen.getByTestId('create-heir-0-account'), { target: { value: PEOPLE.heirA } });
    next();
    expect(step()).toBe('guardians');
    first.unmount();

    renderWithProviders(<Wizard />);
    await waitFor(() => expect(step()).toBe('guardians'));
    fireEvent.click(screen.getByTestId('create-back'));
    expect(screen.getByTestId('create-heir-0-account')).toHaveValue(PEOPLE.heirA);
    expect(screen.getByTestId('create-progress-guardians')).toHaveAttribute('data-state', 'todo');
    expect(screen.getByTestId('create-progress-kind')).toHaveAttribute('data-state', 'done');
  });

  it('names the step in a line above the question', async () => {
    renderWithProviders(<Wizard />);
    await ready();
    next();
    expect(screen.getByText('Step 2 of 7 · Heirs')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Who receives your assets?');
    expect(screen.getByTestId('create-progress-heirs')).toHaveAttribute('data-state', 'current');
  });

  it('a vault without guardians ignores the empty guardian rows', async () => {
    renderWithProviders(<Wizard />);
    await ready();
    fireEvent.click(screen.getByTestId('create-kind-real'));
    next();
    fireEvent.change(screen.getByTestId('create-heir-0-account'), { target: { value: PEOPLE.heirA } });
    next();
    expect(screen.getByTestId('create-guardians-with')).toBeChecked();
    next();
    expect(step()).toBe('guardians');
    fireEvent.click(screen.getByTestId('create-guardians-none'));
    expect(screen.queryByTestId('create-guardian-0')).toBeNull();
    next();
    expect(step()).toBe('timing');
    expect(screen.getByTestId('create-preset-sixMonths')).toBeChecked();
  });

  it('switching the kind keeps the heirs, resets the timing and writes the hash', async () => {
    renderWithProviders(<Wizard />);
    await ready();
    next();
    fireEvent.change(screen.getByTestId('create-heir-0-account'), { target: { value: PEOPLE.heirA } });
    fireEvent.click(screen.getByTestId('create-back'));
    await waitFor(() => expect(saved()?.salt).toMatch(/^0x[0-9a-f]{64}$/));
    const before = saved()?.salt;
    fireEvent.click(screen.getByTestId('create-kind-real'));
    await waitFor(() => expect(window.location.hash).toBe('#real'));
    // One salt per wizard: a new kind never predicts a second vault (Review Focus 1).
    await waitFor(() => expect(saved()?.salt).toBe(before));
    next();
    expect(screen.getByTestId('create-heir-0-account')).toHaveValue(PEOPLE.heirA);
    next();
    next();
    // A real vault starts guarded, so guardians block here; pick none to reach timing.
    fireEvent.click(screen.getByTestId('create-guardians-none'));
    next();
    expect(screen.getByTestId('create-preset-sixMonths')).toBeChecked();
  });

  it('opens on the kind the hash asks for', async () => {
    window.history.replaceState(null, '', '/create/#real');
    renderWithProviders(<Wizard />);
    await ready();
    expect(screen.getByTestId('create-kind-real')).toBeChecked();
  });

  it('the timing step shows the time machine and the preview thread', async () => {
    renderWithProviders(<Wizard />);
    await ready();
    next();
    fireEvent.change(screen.getByTestId('create-heir-0-account'), { target: { value: PEOPLE.heirA } });
    next();
    next();
    expect(step()).toBe('timing');
    expect(screen.getByTestId('time-machine')).toBeInTheDocument();
    expect(screen.getByTestId('create-preview').querySelector('[data-thread]')).not.toBeNull();
  });

  it('the preview weaves in each heir and the guardians as their steps are reached', async () => {
    renderWithProviders(<Wizard />);
    await ready();
    fireEvent.click(screen.getByTestId('create-kind-real'));
    const preview = () => screen.getByTestId('create-preview');
    expect(preview().querySelectorAll('[data-part="branch"]')).toHaveLength(1);
    next();
    fireEvent.change(screen.getByTestId('create-heir-0-account'), { target: { value: PEOPLE.heirA } });
    fireEvent.click(screen.getByTestId('create-add-heir'));
    expect(preview().querySelectorAll('[data-part="branch"]')).toHaveLength(2);
    fireEvent.change(screen.getByTestId('create-heir-1-account'), { target: { value: PEOPLE.heirB } });
    next();
    fireEvent.change(screen.getByTestId('create-guardian-0'), { target: { value: PEOPLE.g1 } });
    fireEvent.click(screen.getByTestId('create-add-guardian'));
    fireEvent.change(screen.getByTestId('create-guardian-1'), { target: { value: PEOPLE.g2 } });
    expect(preview().querySelectorAll('[data-part="post"]')).toHaveLength(2);
    expect(preview().querySelector('[data-part="exit"]')).toBeNull();
    fireEvent.click(screen.getByTestId('create-recovery'));
    expect(preview().querySelector('[data-part="exit"]')).not.toBeNull();
  });

  it('once createVault ran, nothing before can change and the only way on is the vault page', async () => {
    const frozen = {
      v: 1,
      ...impl.freshState({ ...impl.initialForm(true), heirs: [{ account: PEOPLE.heirA, percent: '100' }] }, salt),
      step: 'review',
      payload: 'x',
      vault: PEOPLE.vault,
      createStep: 0,
      offset: 1,
    };
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(frozen));
    renderWithProviders(<Wizard />);
    await ready();
    expect(step()).toBe('review');
    expect(screen.getByTestId('create-back')).toBeDisabled();
    // The review step comes in its own chunk (Ruling 5), whose cold import in Vitest can take seconds.
    const banner = await screen.findByTestId('create-resume-failed', {}, { timeout: 30_000 });
    expect(banner.querySelector('a')).toHaveAttribute(
      'href',
      expect.stringMatching(new RegExp(`/vault/#${PEOPLE.vault}$`)),
    );
    expect(screen.queryByTestId('create-resume-discard')).toBeNull();
    expect(screen.queryByTestId('create-prepare')).toBeNull();
    // The progress buttons are locked too: no way back to an editable step.
    fireEvent.click(screen.getByTestId('create-progress-kind'));
    expect(step()).toBe('review');
    expect(saved()?.salt).toBe(salt);
    // The first import of the finish chunk transforms TxCard and the runner: seconds on a cold, busy worker.
  }, 60_000);

  it('a hash cannot change the kind of a frozen session, and is written back', async () => {
    const frozen = {
      v: 1,
      ...impl.freshState(impl.initialForm(true), salt),
      payload: 'x',
      vault: PEOPLE.vault,
      createStep: 0,
      offset: 1,
    };
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(frozen));
    renderWithProviders(<Wizard />);
    await ready();
    expect(step()).toBe('kind');
    window.location.hash = '#real';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await waitFor(() => expect(window.location.hash).toBe('#drill'));
    expect(screen.getByTestId('create-kind-drill')).toBeChecked();
    expect(saved()).toMatchObject({ payload: 'x', vault: PEOPLE.vault, salt });
  });
});
