import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeStage } from '../../src/home/stage';
import { stageChunk } from '../../src/home/use-stage';
import { messages } from '../../src/messages/stage.messages';
import { renderWithProviders } from '../helpers/render';

// impl/stage.ts counts its imports and then loads for real, as in ask-x-layer.test.tsx: a static import of it from
// the stage would count before the first test runs, and a load at mount or at idle would count in it (R18.18).
const chunk = vi.hoisted(() => ({ imports: 0 }));
vi.mock('../../src/home/impl/stage', async (importOriginal) => {
  chunk.imports += 1;
  return importOriginal();
});

const stage = () => screen.getByTestId('home-stage');
const spoken = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
/** Each row's stamp (its first child), as a reader sees it. */
const rows = () =>
  within(screen.getByTestId('home-stage-beats'))
    .getAllByRole('button')
    .map((b) => spoken(b.firstElementChild));
function stubIdle() {
  const idle = vi.fn((cb: IdleRequestCallback, _o?: IdleRequestOptions) =>
    window.setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0),
  );
  vi.stubGlobal('requestIdleCallback', idle);
  vi.stubGlobal('cancelIdleCallback', (id: number) => window.clearTimeout(id));
  return idle;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// First in the file: once loaded, the chunk stays loaded (lazyChunk keeps it) for the tests after it.
describe('the stage chunk loads on intent only (R18.18)', () => {
  it('asks for nothing at mount, then loads on a focus and draws the Scrubber from the netlist', async () => {
    const idle = stubIdle();
    renderWithProviders(<HomeStage />);
    await act(() => new Promise<void>((r) => setTimeout(r, 50)));
    expect(idle).not.toHaveBeenCalled();
    expect(chunk.imports).toBe(0);
    expect(stage().dataset).toMatchObject({
      engine: 'prerender',
      ready: 'false',
      story: 'confirm',
      state: 'active',
      day: '0',
    });
    expect(screen.getByTestId('home-stage-still')).toBeTruthy();
    fireEvent.focusIn(screen.getByRole('radio', { name: 'Inheritance' }));
    await waitFor(() => expect(stage().dataset.ready).toBe('true'), { timeout: 30_000 });
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 2_000 });
    expect(chunk.imports).toBe(1);
    expect(stage().dataset.engine).toBe('netlist');
    expect(screen.getByTestId('home-stage-scrubber-thumb-0')).toBeTruthy();
    expect(screen.queryByTestId('home-stage-still')).toBeNull();
    // Review Focus 7: the thumb says its day and state, points at the hint, and the Scrubber has its live region.
    // valueText is glue('Day~{day}: {state}'), and a role query matches the name and the value as they are (R29).
    const thumb = screen.getByRole('slider', { name: 'Day in the story' });
    expect(thumb).toHaveAttribute('aria-valuetext', 'Day 0: Active');
    const hint = document.getElementById(thumb.getAttribute('aria-describedby') ?? '');
    expect(spoken(hint)).toBe(
      'Drag the thread, or use the arrow keys. Page Up and Page Down jump to the next day that matters.',
    );
    expect(screen.getByTestId('home-stage-scrubber-live')).toHaveAttribute('aria-live', 'polite');
  }, 60_000);
});

describe('the stage before its simulator loads', () => {
  it('tells the default story in dated rows, and a row jumps to its day', () => {
    vi.spyOn(stageChunk, 'peek').mockReturnValue(null);
    renderWithProviders(<HomeStage />);
    expect(rows()).toEqual([
      'Day 0 · Your first check-in',
      'Days 1–179 · No check-in comes',
      'Day 180 · Silence. The alarm',
      'Day 183 · A guardian confirms',
      'Day 194 · Through the gate',
    ]);
    fireEvent.click(screen.getByTestId('home-stage-beat-2'));
    expect(stage().dataset).toMatchObject({ state: 'grace', day: '180', engine: 'prerender' });
    expect(spoken(screen.getByTestId('home-stage-caption'))).toContain('Day 180 · Silence. The alarm');
    expect(screen.getByTestId('home-stage-beat-2').getAttribute('aria-current')).toBe('step');
    expect(screen.getByTestId('home-stage-day').textContent?.replace(/\s/g, ' ')).toBe('Day 180');
  });

  it('follows the chips and the switches through six stories; the confirmation is only for inheritance', () => {
    vi.spyOn(stageChunk, 'peek').mockReturnValue(null);
    renderWithProviders(<HomeStage />);
    const confirm = screen.getByTestId('home-stage-confirm') as HTMLInputElement;
    const back = screen.getByTestId('home-stage-back') as HTMLInputElement;
    fireEvent.click(confirm);
    expect(stage().dataset.story).toBe('silent');
    fireEvent.click(back);
    expect(stage().dataset.story).toBe('back');
    fireEvent.click(confirm);
    expect(stage().dataset.story).toBe('confirmBack');
    fireEvent.click(screen.getByRole('radio', { name: 'Recovery' }));
    expect(stage().dataset.story).toBe('recoverBack');
    expect(confirm.disabled).toBe(true);
    // switchBack is glue('I come back on day~{day}'): the name keeps its no-break space (R29), as in
    // time-machine-ui.test.tsx ('Giám hộ xác nhận').
    expect(screen.getByRole('checkbox', { name: 'I come back on day 20' })).toBe(back);
    fireEvent.click(back);
    expect(stage().dataset.story).toBe('recover');
    expect(rows()).toEqual([
      'Day 0 · Your first check-in',
      'Day 10 · A guardian votes',
      'Day 12 · 2 of 3 agree',
      'Day 26 · To the wallet they chose',
    ]);
    expect(spoken(screen.getByTestId('home-stage-about'))).toBe(
      'Wallet recovery is on: 2 of 3 guardians acting together can move 100% of the covered assets to any wallet they choose. The owner can stop it only by checking in before the alarm window of 14 days ends.',
    );
  });

  it('reads in Vietnamese, with its days glued to their word', async () => {
    vi.spyOn(stageChunk, 'peek').mockReturnValue(null);
    renderWithProviders(<HomeStage />, { lang: 'vi' });
    await waitFor(() => expect(rows()[2]).toBe('Ngày 180 · Im lặng. Báo động'));
    expect(within(screen.getByTestId('home-stage-beats')).getAllByRole('button')[2].textContent).toContain(
      'Ngày\u00A0180',
    );
  });

  it('keeps the prerender and says so when the simulator cannot load; Try again loads it', async () => {
    vi.spyOn(stageChunk, 'peek').mockReturnValue(null);
    const load = vi.spyOn(stageChunk, 'load').mockRejectedValueOnce(new Error('offline'));
    stubIdle();
    renderWithProviders(<HomeStage />);
    fireEvent.pointerDown(screen.getByTestId('home-stage-beat-0'));
    await waitFor(() => expect(stage().dataset.ready).toBe('error'));
    expect(stage().dataset.engine).toBe('prerender');
    expect(rows()).toHaveLength(5);
    // The still thread cannot be dragged: the hint keeps its place and is not shown.
    expect(screen.getByText('Drag the thread, or use the arrow keys.').className).toContain('invisible');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(stage().dataset.ready).toBe('true'), { timeout: 30_000 });
    expect(load).toHaveBeenCalledTimes(2);
  }, 60_000);
});

describe('the words of the stage', () => {
  it('type no number by hand: every day, k, n and duration is a parameter (spec §18.2, 3; Review Focus 4)', () => {
    for (const lang of ['en', 'vi'] as const) {
      for (const [key, text] of Object.entries(messages[lang])) {
        // A placeholder's name has no digit, so what is left is what was typed by hand.
        expect(text.replace(/\{\w+\}/g, ''), `${lang}.${key}`).not.toMatch(/\d/);
      }
    }
  });
});
