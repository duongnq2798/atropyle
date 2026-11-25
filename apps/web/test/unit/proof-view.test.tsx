import { AtropyleError } from '@atropyle/sdk';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POLICY_NETLIST_KECCAK } from '../../src/config/facts';
import { messages } from '../../src/messages/proof.messages';
import { PROOF_BLOCKS } from '../../src/proof/paint';
import { ProofView, verdictOf } from '../../src/proof/proof-view';
import type { ProofRun } from '../../src/proof/use-proof-run';
import type { PolicyVerification } from '../../src/verify/types';
import { FakeObserver, stubIntersection } from '../helpers/intersection';
import { renderWithProviders } from '../helpers/render';
import { okResult, P9_OK } from './proof-result';

vi.mock('next/navigation', () => ({
  usePathname: () => '/proof/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
// ErrorBox words an error through the tx chunk; here it loads at once.
vi.mock('../../src/tx/load', async () => {
  const impl = await import('../../src/tx/impl');
  return { loadTxImpl: async () => impl, peekTxImpl: () => null };
});

const ROWS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'];

function runOf(over: Partial<ProofRun> = {}): ProofRun {
  return {
    status: 'idle',
    doneBlocks: 0,
    result: undefined,
    error: undefined,
    runs: 0,
    start: vi.fn(),
    again: vi.fn(),
    retry: vi.fn(),
    warm: vi.fn(),
    ...over,
  };
}
const done = (result: PolicyVerification = okResult(), over: Partial<ProofRun> = {}) =>
  runOf({ status: 'done', doneBlocks: Math.floor(result.combos / 32), result, ...over });
const rowState = (row: string) => screen.getByTestId(`proof-prop-${row}`).getAttribute('data-state');
/** The <ol> of P1 to P9, which the stagger waits to see on screen. */
function rowsList(): HTMLOListElement {
  const list = screen.getByTestId('proof-prop-P1').closest('ol');
  if (!list) throw new Error('the rows are not in a list');
  return list;
}
/** Text as a reader hears it: a no-break space (glue() in proof.messages.ts) is a space. */
const words = (text: string | null | undefined) => (text ?? '').replaceAll('\u00A0', ' ');
const live = () => words(screen.getByTestId('proof-live').textContent);
const VERDICT_OK =
  'P1 to P8 hold in all 67,108,864 cases, and the processor answered 64 random cases exactly like the model.';

/** prefers-reduced-motion: reduce, as motion.test.tsx stubs it; afterEach restores matchMedia. */
function stubReducedMotion() {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) =>
      ({
        matches: q.includes('reduce'),
        media: q,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ProofView', () => {
  it('prerenders the whole page before a run: rows waiting, the source row of the seal, the command and #limits', () => {
    const { container } = renderWithProviders(<ProofView run={runOf()} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(messages.en.title);
    for (const row of ROWS) expect(rowState(row)).toBe('pending');
    const seal = screen.getByTestId('proof-seal');
    expect(seal.getAttribute('data-match')).toBe('pending');
    expect(seal.querySelectorAll('[data-group]')).toHaveLength(16);
    const source = [...seal.querySelectorAll('[data-row="source"]')].map((e) => e.textContent).join('');
    expect(`0x${source}`).toBe(POLICY_NETLIST_KECCAK);
    const limits = container.querySelector('#limits');
    if (!(limits instanceof HTMLElement)) throw new Error('/proof/ has no #limits');
    expect(within(limits).getAllByTestId('proof-limit')).toHaveLength(6);
    expect(within(limits).getByText(/^cast call 0x523db7bacD35a6EFc384367D66AEC1CBA07a4A05 /)).toBeTruthy();
    expect(screen.getByTestId('proof-limits-close').textContent).toBe(
      'Start with a Drill; approve only what you mean to leave.',
    );
    expect(within(screen.getByTestId('proof-cli')).getByText('npx -y atropyle verify')).toBeTruthy();
    expect(screen.queryByTestId('proof-verdict')).toBeNull();
    expect(screen.queryByTestId('proof-certificate')).toBeNull();
    // R18.10: no italic on the first paint of /proof/.
    expect(container.querySelector('[class*="italic"]')).toBeNull();
  });

  it('starts on a press, and warms the proof code when the reader points at Run or reaches it by keyboard', () => {
    const run = runOf();
    renderWithProviders(<ProofView run={run} />);
    const button = screen.getByTestId('proof-start');
    fireEvent.pointerEnter(button);
    fireEvent.focus(button);
    expect(run.warm).toHaveBeenCalledTimes(2);
    fireEvent.click(button);
    expect(run.start).toHaveBeenCalledTimes(1);
  });

  it('counts the cases while the worker runs, and keeps the button busy', () => {
    renderWithProviders(<ProofView run={runOf({ status: 'running', doneBlocks: 4096 })} />);
    expect(screen.getByTestId('proof-run').getAttribute('data-status')).toBe('running');
    expect(within(screen.getByTestId('proof-run')).getByText('131,072 of 67,108,864 cases checked')).toBeTruthy();
    expect(screen.getByTestId('proof-map-progress').textContent).toBe('131,072 of 67,108,864 cases checked');
    expect(screen.getByRole('progressbar', { name: 'Proof progress' }).getAttribute('max')).toBe(String(PROOF_BLOCKS));
    expect(screen.getByTestId('proof-start').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByTestId('proof-canvas').getAttribute('data-done')).toBe('4096');
    expect(screen.getByRole('img', { name: /131,072 of 67,108,864 cases checked/ })).toBeTruthy();
  });

  it('lights every row of a passed proof, seals it and offers the certificate', () => {
    // A result the page already had when it mounted: every row at once, wherever the list is.
    stubIntersection();
    renderWithProviders(<ProofView run={done()} />);
    for (const row of ROWS) {
      expect(rowState(row)).toBe('holds');
      // Not only a colour: each lit row says it in words too (its icon is aria-hidden).
      expect(screen.getByTestId(`proof-prop-${row}`).textContent).toContain(messages.en.propHolds);
    }
    expect(screen.getByTestId('proof-verdict').getAttribute('data-ok')).toBe('true');
    expect(words(screen.getByTestId('proof-verdict').textContent)).toContain(VERDICT_OK);
    const seal = screen.getByTestId('proof-seal');
    expect(seal.getAttribute('data-match')).toBe('equal');
    expect(seal.querySelectorAll('[data-sign="equal"]')).toHaveLength(16);
    expect(screen.getByTestId('proof-code').getAttribute('data-pinned')).toBe('true');
    expect(screen.getAllByTestId('proof-netlist').map((e) => e.getAttribute('data-role'))).toEqual([
      'policy',
      'kofn5',
      'ge4',
    ]);
    const p9 = screen.getByTestId('proof-prop-P9').textContent ?? '';
    expect(p9).toContain('Seed 20261125, drawn on this device');
    expect(p9).toContain('Operator 1: 64 of 64 match, at block 76600000, in 4 calls through Multicall3');
    expect(p9).toContain('Operator 2: 64 of 64 match, at block 76600000, in 64 calls one by one');
    const pre = screen.getByTestId('proof-certificate').querySelector('pre');
    const lines = pre?.textContent?.split('\n');
    expect(lines).toHaveLength(8);
    // One numbered row per line (the numbers are CSS counters), so a wrapped line never reads as a ninth one.
    const rows = [...(pre?.querySelectorAll('[data-line]') ?? [])];
    expect(rows.map((r) => r.getAttribute('data-line'))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(rows.map((r) => r.textContent)).toEqual(lines);
    // A flag of the command never breaks after its own hyphen ("npx -" / "y" would read as another command).
    expect([...rows[6].querySelectorAll('[data-flag]')].map((f) => f.textContent)).toEqual(['-y', '--p9-seed']);
    expect(screen.getByRole('button', { name: 'Copy certificate' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('proof-again'));
  });

  it('lights the rows one by one only once the reader has the list on screen, and finishes if they scroll on', () => {
    const show = stubIntersection();
    vi.useFakeTimers();
    const { rerender } = renderWithProviders(
      <ProofView run={runOf({ status: 'running', doneBlocks: PROOF_BLOCKS })} />,
    );
    rerender(<ProofView run={done()} />);
    // The run finished while the list was off screen (a phone: under the map and its key): the rows wait for the reader.
    act(() => {
      vi.advanceTimersByTime(140 * 12);
    });
    for (const row of ROWS) expect(rowState(row)).toBe('pending');
    const list = rowsList();
    expect(FakeObserver.all.some((o) => o.targets.has(list) && o.options.rootMargin === '0px 0px -25% 0px')).toBe(true);
    show(list, true);
    expect(rowState('P1')).toBe('pending');
    act(() => {
      vi.advanceTimersByTime(140);
    });
    expect(rowState('P1')).toBe('holds');
    expect(rowState('P2')).toBe('pending');
    // Seen once is enough: a reader who scrolls on still gets every row.
    show(list, false);
    act(() => {
      vi.advanceTimersByTime(140 * 8);
    });
    for (const row of ROWS) expect(rowState(row)).toBe('holds');
  });

  it('starts the stagger as the run ends when the list is on screen already, then waits again for a new run', () => {
    const show = stubIntersection();
    vi.useFakeTimers();
    const { rerender } = renderWithProviders(
      <ProofView run={runOf({ status: 'running', doneBlocks: PROOF_BLOCKS })} />,
    );
    // A laptop: the press brought the map up, and the rows beside it are on screen before the result comes.
    show(rowsList(), true);
    rerender(<ProofView run={done()} />);
    act(() => {
      vi.advanceTimersByTime(140);
    });
    expect(rowState('P1')).toBe('holds');
    expect(rowState('P2')).toBe('pending');
    act(() => {
      vi.advanceTimersByTime(140 * 8);
    });
    for (const row of ROWS) expect(rowState(row)).toBe('holds');
    // Run again, with the list scrolled away: the next result waits for the reader.
    show(rowsList(), false);
    rerender(<ProofView run={runOf({ status: 'running', doneBlocks: 4096, runs: 1 })} />);
    rerender(<ProofView run={done(okResult(), { runs: 1 })} />);
    act(() => {
      vi.advanceTimersByTime(140 * 9);
    });
    for (const row of ROWS) expect(rowState(row)).toBe('pending');
  });

  it('lights every row at once for a reader who prefers reduced motion, wherever the list is', () => {
    stubReducedMotion();
    stubIntersection();
    vi.useFakeTimers();
    const { rerender } = renderWithProviders(
      <ProofView run={runOf({ status: 'running', doneBlocks: PROOF_BLOCKS })} />,
    );
    rerender(<ProofView run={done()} />);
    // No timer advanced and the list never on screen: the stagger is off, and the live region has said the verdict.
    for (const row of ROWS) expect(rowState(row)).toBe('holds');
  });

  it('tells a screen reader each quarter of the run, then the verdict, beside a named progress bar', () => {
    const { rerender } = renderWithProviders(<ProofView run={runOf({ status: 'loading' })} />);
    expect(live()).toBe('Reading the circuit from X Layer.');
    rerender(<ProofView run={runOf({ status: 'running', doneBlocks: 4096 })} />);
    expect(live()).toBe('Checking every case.');
    for (const quarter of [1, 2, 3]) {
      rerender(<ProofView run={runOf({ status: 'running', doneBlocks: (PROOF_BLOCKS * quarter) / 4 })} />);
      expect(live()).toBe(`${quarter * 25}% of the cases checked.`);
      // Between two quarters the words stay, so a reader hears four updates, not one per tick.
      rerender(<ProofView run={runOf({ status: 'running', doneBlocks: (PROOF_BLOCKS * quarter) / 4 + 4096 })} />);
      expect(live()).toBe(`${quarter * 25}% of the cases checked.`);
    }
    expect(screen.getByRole('progressbar', { name: 'Proof progress' })).toBeTruthy();
    rerender(<ProofView run={done()} />);
    expect(live()).toBe(`Proof finished. ${VERDICT_OK}`);
    rerender(<ProofView run={runOf({ status: 'error', error: new Error('rpc down') })} />);
    expect(live()).toBe('The proof stopped with an error.');
  });

  it('words each kind of result: full with P9, full without it, partial, failed', () => {
    const partial = okResult({ combos: 4096 * 32 });
    expect(verdictOf(okResult())).toBe('verdictOk');
    expect(verdictOf(okResult({ p9: null }))).toBe('verdictOkNoP9');
    expect(verdictOf(partial)).toBe('verdictPartial');
    expect(verdictOf(okResult({ ok: false }))).toBe('verdictBroken');
    // A failed partial run is a failure, not a partial pass.
    expect(verdictOf({ ...partial, ok: false })).toBe('verdictBroken');
    renderWithProviders(<ProofView run={done(partial)} />);
    const verdict = screen.getByTestId('proof-verdict');
    expect(verdict.getAttribute('data-ok')).toBe('true');
    expect(verdict.getAttribute('data-full')).toBe('false');
    expect(words(verdict.textContent)).toContain('P1 to P8 hold in the 131,072 of 67,108,864 cases this run checked.');
    expect(screen.queryByTestId('proof-certificate')).toBeNull();
  });

  it('names what broke: the rule, its cases, P9 and the reasons, the reasons as untrusted text', () => {
    const hostile = 'netlist 3 (policy) does not match\u202e the source';
    const r = okResult({
      ok: false,
      properties: { ...okResult().properties, P3: { ok: false, violations: 12 } },
      p9: {
        ...P9_OK,
        ok: false,
        operators: [P9_OK.operators[0], { ...P9_OK.operators[1], matched: 63 }],
        mismatches: [
          {
            operator: 2,
            index: 0,
            state: 0,
            inputs: 5,
            expectNext: '0x01',
            expectOut: '0x01',
            next: '0x00',
            out: '0x01',
            error: null,
          },
        ],
      },
      issues: [hostile],
    });
    renderWithProviders(<ProofView run={done(r)} />);
    expect(rowState('P3')).toBe('broken');
    expect(screen.getByTestId('proof-prop-P3').textContent).toContain('12 cases break it');
    expect(rowState('P9')).toBe('broken');
    expect(screen.getByTestId('proof-prop-P9').textContent).toContain('Operator 2: 63 of 64 match');
    const verdict = screen.getByTestId('proof-verdict');
    expect(verdict.getAttribute('data-ok')).toBe('false');
    expect(verdict.textContent).toContain(messages.en.verdictBroken);
    expect(verdict.textContent).toContain('does not match');
    expect(verdict.textContent).not.toContain('\u202e');
    expect(screen.queryByTestId('proof-certificate')).toBeNull();
  });

  it('says P9 was not run, and still certifies a full proof without it', () => {
    renderWithProviders(<ProofView run={done(okResult({ p9: null }))} />);
    expect(rowState('P9')).toBe('not-run');
    expect(words(screen.getByTestId('proof-verdict').textContent)).toContain(
      'P1 to P8 hold in all 67,108,864 cases. The processor itself was not asked this time.',
    );
    expect(screen.getByTestId('proof-certificate').textContent).toContain('P9 was not run');
  });

  it('shows the groups that differ, and says how many', () => {
    const other = `0xffff${POLICY_NETLIST_KECCAK.slice(6, 62)}0000` as const;
    const netlists = okResult().netlists.map((n) =>
      n.role === 'policy' ? { ...n, keccak: other, matchesSource: false, matchesDeployment: false } : n,
    );
    renderWithProviders(<ProofView run={done(okResult({ ok: false, netlists }))} />);
    const seal = screen.getByTestId('proof-seal');
    expect(seal.getAttribute('data-match')).toBe('differs');
    expect(seal.querySelectorAll('[data-sign="differs"]')).toHaveLength(2);
    expect(seal.textContent).toContain('The two hashes differ in 2 of 16 groups.');
  });

  it('says when one operator was asked, once, in its own words', () => {
    const r = okResult({ rpcs: 1, warnings: [{ code: 'SINGLE_RPC', message: 'Only one RPC operator was used' }] });
    renderWithProviders(<ProofView run={done(r)} />);
    const verdict = screen.getByTestId('proof-verdict');
    expect(verdict.textContent).toContain(messages.en.rpcsOne);
    expect(verdict.textContent).not.toContain('Only one RPC operator was used');
  });

  it('shows a failed run with its typed error and a retry', async () => {
    const run = runOf({ status: 'error', error: new AtropyleError('POLICY_UNAVAILABLE') });
    renderWithProviders(<ProofView run={run} />);
    expect(screen.getByTestId('proof-run').getAttribute('data-status')).toBe('error');
    const box = await screen.findByTestId('error');
    expect(box.getAttribute('data-code')).toBe('POLICY_UNAVAILABLE');
    fireEvent.click(within(box).getByRole('button', { name: 'Retry' }));
    expect(run.retry).toHaveBeenCalledTimes(1);
  });

  it('reads in Vietnamese, with the state names of the whole site and its own number format', () => {
    renderWithProviders(<ProofView run={runOf({ status: 'running', doneBlocks: 4096 })} />, { lang: 'vi' });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(messages.vi.title);
    expect(
      within(screen.getByTestId('proof-run')).getByText('Đã kiểm 131.072 trên 67.108.864 trường hợp'),
    ).toBeTruthy();
    expect(screen.getByText('Thuộc về người thừa kế')).toBeTruthy();
    expect(screen.getByText('Thuộc về ví khôi phục')).toBeTruthy();
  });
});

/**
 * Puts the map's plate between `top` and `bottom` (shares of the window's height) and records where the page scrolls
 * the map. The plate is the map's role="img": the 7C-T3 review (round 2) measured it running past a laptop's fold.
 */
function plateAt(top: number, bottom: number) {
  const map = screen.getByTestId('proof-map');
  const plate = within(map).getByRole('img', { name: /cases checked/ });
  const h = window.innerHeight;
  vi.spyOn(plate, 'getBoundingClientRect').mockReturnValue({ top: h * top, bottom: h * bottom } as DOMRect);
  const scroll = vi.fn();
  map.scrollIntoView = scroll;
  return scroll;
}

describe('ProofView brings the whole map on screen when a run starts', () => {
  it('scrolls the map up on a press of Run when its plate runs past the bottom of the screen, phone or laptop', () => {
    const run = runOf();
    const { unmount } = renderWithProviders(<ProofView run={run} />);
    // A phone: the map sits under the run card, below the first screen.
    const phone = plateAt(1.04, 1.5);
    fireEvent.click(screen.getByTestId('proof-start'));
    expect(run.start).toHaveBeenCalledTimes(1);
    expect(phone).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'smooth' });
    unmount();
    // A laptop (1440 x 900): the map is beside the button, but its plate runs from 592 to 1092.
    const laptop = runOf();
    renderWithProviders(<ProofView run={laptop} />);
    const beside = plateAt(592 / 900, 1092 / 900);
    fireEvent.click(screen.getByTestId('proof-start'));
    expect(laptop.start).toHaveBeenCalledTimes(1);
    expect(beside).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'smooth' });
  });

  it('jumps for a reader who prefers reduced motion, and Run again and Retry bring it up too', async () => {
    stubReducedMotion();
    const finished = done();
    const { unmount } = renderWithProviders(<ProofView run={finished} />);
    const again = plateAt(0.8, 1.3);
    fireEvent.click(screen.getByTestId('proof-again'));
    expect(finished.again).toHaveBeenCalledTimes(1);
    expect(again).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'auto' });
    unmount();
    const failed = runOf({ status: 'error', error: new AtropyleError('POLICY_UNAVAILABLE') });
    renderWithProviders(<ProofView run={failed} />);
    const retry = plateAt(0.8, 1.3);
    fireEvent.click(within(await screen.findByTestId('error')).getByRole('button', { name: 'Retry' }));
    expect(failed.retry).toHaveBeenCalledTimes(1);
    expect(retry).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'auto' });
  });

  it('leaves the page where it is when the whole plate is on screen, and brings it back when its top is cut off', () => {
    const run = runOf();
    renderWithProviders(<ProofView run={run} />);
    const whole = plateAt(0.15, 0.7);
    fireEvent.click(screen.getByTestId('proof-start'));
    expect(run.start).toHaveBeenCalledTimes(1);
    expect(whole).not.toHaveBeenCalled();
    const cut = plateAt(-0.1, 0.5);
    fireEvent.click(screen.getByTestId('proof-start'));
    expect(cut).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'smooth' });
  });

  it('keeps the count under the map heading, below lg only, and leaves it to the map label for a screen reader', () => {
    renderWithProviders(<ProofView run={runOf()} />);
    const count = screen.getByTestId('proof-map-progress');
    expect(count.textContent).toBe('0 of 67,108,864 cases checked');
    expect(count.getAttribute('aria-hidden')).toBe('true');
    expect(count.className).toContain('lg:hidden');
  });
});
