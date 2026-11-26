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
const row = (i: number) => screen.getByTestId(`home-stage-beat-${i}`);
/** The sentence of the row whose stamp is `stamp` (its last child). */
function sayOf(stamp: string): string {
  const b = within(screen.getByTestId('home-stage-beats'))
    .getAllByRole('button')
    .find((x) => spoken(x.firstElementChild) === stamp);
  if (!b) throw new Error(`no row ${stamp}: ${rows().join(' | ')}`);
  return spoken(b.lastElementChild);
}
/** The gate's labels on the thread, as drawn: the Scrubber's or the still thread's, and the story's. */
const gates = () => [...stage().querySelectorAll('[data-part="gate-at"]')].map((e) => spoken(e));
/**
 * The stage's text nodes that hold a hyphenated word ("check-in") outside a span that keeps it on one line:
 * Chromium may break a line after an ASCII hyphen, and a line that ends in "check-" reads as a typo.
 */
function hyphens(): { loose: string[]; kept: number } {
  const loose: string[] = [];
  let kept = 0;
  const walk = document.createTreeWalker(stage(), NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const text = n.textContent ?? '';
    if (!/\S-\S/.test(text)) continue;
    if (n.parentElement?.classList.contains('whitespace-nowrap') && !/\s/.test(text)) kept += 1;
    else loose.push(text);
  }
  return { loose, kept };
}
/**
 * Every story in turn, one control a step, from the default one (as e2e "a chip or a switch retells the story").
 * Under Recovery the confirmation switch is disabled, so the walk first goes back to the default story.
 */
function eachStory(visit: (story: string | undefined) => void): void {
  const confirm = screen.getByTestId('home-stage-confirm') as HTMLInputElement;
  const back = screen.getByTestId('home-stage-back') as HTMLInputElement;
  fireEvent.click(screen.getByRole('radio', { name: 'Inheritance' }));
  if (!confirm.checked) fireEvent.click(confirm);
  if (back.checked) fireEvent.click(back);
  expect(stage().dataset.story).toBe('confirm');
  visit(stage().dataset.story);
  for (const control of [confirm, back, confirm, screen.getByRole('radio', { name: 'Recovery' }), back]) {
    fireEvent.click(control);
    visit(stage().dataset.story);
  }
}
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

  // Fix round 1: the alarm row said one guardian's confirmation was enough, which the recovery vault (k = 2 of 3)
  // does not do: exitTimes' heirs route waits for k confirmations (timeline.ts: the fallback when fewer than k).
  it('says how many guardians must confirm after the alarm: k of n of the story’s vault (Review Focus 8)', () => {
    vi.spyOn(stageChunk, 'peek').mockReturnValue(null);
    renderWithProviders(<HomeStage />);
    expect(sayOf('Day 180 · Silence. The alarm')).toBe(
      'Your guardians are told. With a confirmation from 1 of the 2, the gate can open 14 days after the alarm.',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Recovery' }));
    fireEvent.click(screen.getByTestId('home-stage-back'));
    expect(stage().dataset.story).toBe('recoverBack');
    expect(sayOf('Day 200 · Silence. The alarm')).toBe(
      'Your guardians are told. With a confirmation from 2 of the 3, the gate can open 14 days after the alarm.',
    );
  });

  it('says k of n after the alarm in Vietnamese too', async () => {
    vi.spyOn(stageChunk, 'peek').mockReturnValue(null);
    renderWithProviders(<HomeStage />, { lang: 'vi' });
    await waitFor(() => expect(rows()[2]).toBe('Ngày 180 · Im lặng. Báo động'));
    expect(sayOf('Ngày 180 · Im lặng. Báo động')).toBe(
      'Người giám hộ được báo. Khi 1 trên 2 người giám hộ xác nhận, cổng có thể mở sau báo động 14 ngày.',
    );
    // chipRecover is glue('Khôi~phục ví'): a role query matches the name as it is (R29).
    fireEvent.click(screen.getByRole('radio', { name: 'Khôi phục ví' }));
    fireEvent.click(screen.getByTestId('home-stage-back'));
    expect(sayOf('Ngày 200 · Im lặng. Báo động')).toContain('Khi 2 trên 3 người giám hộ xác nhận');
  });

  it('keeps every hyphenated word of every story on one line', () => {
    vi.spyOn(stageChunk, 'peek').mockReturnValue(null);
    renderWithProviders(<HomeStage />);
    const stories: (string | undefined)[] = [];
    eachStory((story) => {
      stories.push(story);
      const n = within(screen.getByTestId('home-stage-beats')).getAllByRole('button').length;
      for (let i = 0; i < n; i++) {
        fireEvent.click(row(i));
        const { loose, kept } = hyphens();
        expect(loose, `${story}, row ${i}`).toEqual([]);
        // The guard has words to guard: each story's rows say "check-in" (row 0: "Your first check-in").
        expect(kept, `${story}, row ${i}`).toBeGreaterThan(0);
      }
    });
    expect(stories).toEqual(['confirm', 'silent', 'back', 'confirmBack', 'recoverBack', 'recover']);
  });

  // Fix round 1: 7B's gateOf names no gate while the frame's outlook lies past the story's release, so the default
  // story's arch had no name before day 183. A home story is scripted: its gate is its release, which its rows date.
  it('names the story’s own gate on the still thread from day 0, in the release’s words, and never twice', () => {
    vi.spyOn(stageChunk, 'peek').mockReturnValue(null);
    renderWithProviders(<HomeStage />);
    expect(gates()).toEqual(['Heirs · day 194']);
    // Near the playhead the label steps aside, as 7B's does: its pill says the day.
    fireEvent.click(row(2));
    expect(gates()).toEqual([]);
    fireEvent.click(row(0));
    fireEvent.click(screen.getByRole('radio', { name: 'Recovery' }));
    expect(stage().dataset.story).toBe('recover');
    // Days 0 and 10: the story's gate, the chosen wallet's; day 12: 7B's own (gateOf), the same words.
    for (const i of [0, 1, 2]) {
      fireEvent.click(row(i));
      expect(gates(), `recover, row ${i}`).toEqual(['Their wallet · day 26']);
    }
    eachStory((story) => {
      const n = within(screen.getByTestId('home-stage-beats')).getAllByRole('button').length;
      for (let i = 0; i < n; i++) {
        fireEvent.click(row(i));
        expect(gates().length, `${story}, row ${i}`).toBeLessThanOrEqual(1);
      }
    });
  });
});

describe('the stage once its simulator has loaded', () => {
  it('names the story’s gate over the Scrubber as on the still thread, and never twice', () => {
    // The first test loaded the chunk, and lazyChunk keeps it: the stage is live from its first render.
    renderWithProviders(<HomeStage />);
    expect(stage().dataset.ready).toBe('true');
    expect(screen.getByTestId('home-stage-scrubber-thumb-0')).toBeTruthy();
    expect(gates()).toEqual(['Heirs · day 194']);
    fireEvent.click(row(2));
    expect(gates()).toEqual([]);
    fireEvent.click(row(0));
    fireEvent.click(screen.getByRole('radio', { name: 'Recovery' }));
    for (const i of [0, 1, 2]) {
      fireEvent.click(row(i));
      expect(gates(), `recover, row ${i}`).toEqual(['Their wallet · day 26']);
    }
    eachStory((story) => {
      const n = within(screen.getByTestId('home-stage-beats')).getAllByRole('button').length;
      for (let i = 0; i < n; i++) {
        fireEvent.click(row(i));
        expect(gates().length, `${story}, row ${i}`).toBeLessThanOrEqual(1);
      }
    });
  });
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
