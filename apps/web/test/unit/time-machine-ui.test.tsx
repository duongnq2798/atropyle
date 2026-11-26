import { DRILL_LIFETIME_SECONDS, evalStateOf, modelEngine, type PolicyEngine, STATE_CODES } from '@atropyle/sdk';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHAIN_ID } from '../../src/chain/hooks';
import { chainKeys } from '../../src/chain/keys';
import type { Sdk } from '../../src/chain/types';
import { shellShape, TimeMachineShell } from '../../src/flows/time-machine/shell';
import { TimeMachine } from '../../src/flows/time-machine/time-machine';
import { renderWithProviders, testQueryClient } from '../helpers/render';
import { fixtureSnapshot } from './fixtures';

const state = evalStateOf(fixtureSnapshot());
const END = 1_000n + BigInt(DRILL_LIFETIME_SECONDS);
const engine = modelEngine();
const ALARM = 'The alarm goes off: you can still stop it by checking in';
const RELEASE = 'The time has come for the vault to pass everything to the heirs';
const NOW = 'Where the vault is today';

function renderMachine(o: { engine?: PolicyEngine; lang?: 'en' | 'vi'; released?: boolean } = {}) {
  const s = o.released ? { ...state, state: STATE_CODES.releasedInherit } : state;
  return renderWithProviders(
    <TimeMachine state={s} now={1_000n} expiresAt={END} drill binding={null} engine={o.engine ?? engine} />,
    { lang: o.lang ?? 'en' },
  );
}

/**
 * The stage, once its chunk and its engine are in. Queried again on every try, never held: TimeMachineShell (while
 * loading) and Stage are two different elements with the same testid, and the shell found first leaves the DOM when
 * the stage replaces it, so it would never get data-engine.
 */
async function loaded(kind = 'model'): Promise<HTMLElement> {
  await waitFor(() => expect(screen.getByTestId('time-machine')).toHaveAttribute('data-engine', kind), {
    timeout: 15_000,
  });
  return screen.getByTestId('time-machine');
}

// The first test to render loads the time machine chunk (the SDK, Radix): a 15 s wait needs a test longer than the
// default 5 s, as in flows-load.test.tsx.
describe('TimeMachine', { timeout: 30_000 }, () => {
  it('Page Up and Page Down jump from moment to moment; the live region says each moment once', async () => {
    renderMachine();
    const box = await loaded();
    const thumb = screen.getByRole('slider', { name: 'Time from now' });
    const live = screen.getByTestId('time-machine-scrubber-live');
    expect(live).toBeEmptyDOMElement();
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(thumb).toHaveAttribute('aria-valuemax', '1068');
    expect(thumb).toHaveAttribute('aria-valuetext', 'Now, 1 January 1970, 00:16 UTC: Active');
    const said: string[] = [];
    new MutationObserver(() => said.push(live.textContent ?? '')).observe(live, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    fireEvent.keyDown(thumb, { key: 'PageUp' });
    await waitFor(() => expect(thumb).toHaveAttribute('aria-valuenow', '110'));
    expect(box).toHaveAttribute('data-state', 'grace');
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    await waitFor(() => expect(thumb).toHaveAttribute('aria-valuenow', '115'));
    fireEvent.keyDown(thumb, { key: 'PageUp' });
    await waitFor(() => expect(thumb).toHaveAttribute('aria-valuenow', '890'));
    expect(box).toHaveAttribute('data-state', 'releasedInherit');
    // Past the last moment Page Up goes to the end; Page Down comes back to the release. Neither is a new moment.
    fireEvent.keyDown(thumb, { key: 'PageUp' });
    await waitFor(() => expect(thumb).toHaveAttribute('aria-valuenow', '1068'));
    fireEvent.keyDown(thumb, { key: 'PageDown' });
    await waitFor(() => expect(thumb).toHaveAttribute('aria-valuenow', '890'));
    fireEvent.keyDown(thumb, { key: 'Home' });
    await waitFor(() => expect(thumb).toHaveAttribute('aria-valuenow', '0'));
    await waitFor(() => expect(said).toEqual([ALARM, RELEASE, NOW]));
    // The caption is not live: only the region speaks.
    expect(screen.getByText(NOW, { selector: 'p:not([aria-live])' })).not.toHaveAttribute('aria-live');
  });

  it("draws each frame's gate and the moments on the scrubber's axis", async () => {
    const { container } = renderMachine();
    await loaded();
    // silent: release 1 890 on [1 000, 2 068] stands at x = 500 of 600; the alarm at 1 110 at x = 61.8.
    expect(container.querySelector<HTMLElement>('[data-part="gate"]')?.style.left).toBe('83.333%');
    expect(container.querySelector<HTMLElement>('[data-moment="1"]')?.style.left).toBe('10.3%');
    fireEvent.click(screen.getByRole('radio', { name: 'Guardians confirm' }));
    // confirm: the story releases at 1 230 on [1 000, 1 290], even in the first frame.
    await waitFor(() => expect(container.querySelector<HTMLElement>('[data-part="gate"]')?.style.left).toBe('79.31%'));
    // The thread's own "now" is hidden: the thumb is "now".
    expect(container.querySelector('[data-thread]')?.className).toContain('[&_[data-part=now-at]]:hidden');
  });

  it('the gate says when it opens, and moves with the outlook; the end of the scale says nothing', async () => {
    const { container } = renderMachine();
    await loaded();
    const gateAt = () => container.querySelector<HTMLElement>('[data-part="gate-at"]');
    // silent: the release at 1 890 stands at x = 500 of 600, on [1 000, 2 068].
    expect(gateAt()).toHaveTextContent('Heirs receive · In 15 minutes');
    expect(gateAt()).toHaveAttribute('aria-hidden', 'true');
    expect(gateAt()?.style.left).toBe('83.333%');
    // Nothing reads the axis's end (1 068 s): it is padding, and no moment happens there.
    expect(container.textContent).not.toContain('In 18 minutes');
    // At the release the playhead's pill says it: the gate's label steps aside.
    const thumb = screen.getByRole('slider', { name: 'Time from now' });
    fireEvent.keyDown(thumb, { key: 'PageUp' });
    fireEvent.keyDown(thumb, { key: 'PageUp' });
    await waitFor(() => expect(thumb).toHaveAttribute('aria-valuenow', '890'));
    expect(gateAt()).toBeNull();
    // After the owner's check-in the gate stands at the story's release: returns, 2 070 on [1 000, 2 284].
    fireEvent.click(screen.getByRole('radio', { name: 'Guardians confirm' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'I check in again' }));
    fireEvent.click(screen.getByRole('button', { name: /You check in: the alarm stops/ }));
    await waitFor(() => expect(gateAt()).toHaveTextContent('Heirs receive · In 18 minutes'));
    expect(gateAt()?.style.left).toBe('83.333%');
  });

  it('a gate the outlook does not reach has no time; the new wallet has its own', async () => {
    const { container } = renderMachine();
    await loaded();
    const gateAt = () => container.querySelector<HTMLElement>('[data-part="gate-at"]');
    fireEvent.click(screen.getByRole('radio', { name: 'Recovery' }));
    // Now, the outlook releases to the heirs at 1 890, past this story's end: the gate drawn at 1 122 is not that.
    await waitFor(() => expect(container.querySelector('[data-part="gate"]')).not.toBeNull());
    expect(gateAt()).toBeNull();
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time from now' }), { key: 'End' });
    await waitFor(() => expect(gateAt()).toHaveTextContent('New wallet · In 2 minutes'));
  });

  it('the gate speaks Vietnamese', async () => {
    const { container } = renderMachine({ lang: 'vi' });
    await loaded();
    expect(container.querySelector('[data-part="gate-at"]')).toHaveTextContent('Người thừa kế nhận · Sau 15 phút');
  });

  it("colours each ring by the state it leads into, ties the check-in's knot, and merges rings that touch", async () => {
    const { container } = renderMachine();
    await loaded();
    const rings = () => [...container.querySelectorAll<HTMLElement>('[data-layer="moments"] > [data-moment]')];
    // silent: the alarm leads into grace, the release into the heirs' colour.
    expect(rings().map((r) => r.dataset.moment)).toEqual(['1', '2']);
    expect(rings()[0].className).toContain('text-grace');
    expect(rings()[1].className).toContain('text-release');
    // recover: the votes at 1 and 2 s are one ring, in the colour of the recovery the second one starts.
    fireEvent.click(screen.getByRole('radio', { name: 'Recovery' }));
    await waitFor(() => expect(rings().map((r) => r.dataset.moments)).toEqual(['1 2', '3']));
    expect(rings()[0].dataset.moment).toBe('2');
    expect(rings()[0].className).toContain('text-recovery');
    // recoverBlocked: the check-in one second later is the knot, never merged into the votes.
    fireEvent.click(screen.getByRole('checkbox', { name: 'I check in again' }));
    await waitFor(() => expect(rings().map((r) => r.dataset.moments)).toEqual(['1 2', '3', '4', '5']));
    const knot = rings()[1];
    expect(knot).toHaveAttribute('data-kind', 'checkIn');
    expect(knot.className).toContain('text-thread');
    // The current moment's ring is marked; a merged ring is current when any of its moments is.
    fireEvent.click(screen.getByRole('button', { name: /Guardian 1 votes for a new wallet/ }));
    await waitFor(() => expect(rings()[0]).toHaveAttribute('data-current', 'true'));
    expect(knot).not.toHaveAttribute('data-current');
  });

  it('a vault that ended says what its rules decided', async () => {
    const recovered = { ...state, state: STATE_CODES.releasedRecover };
    const first = renderWithProviders(
      <TimeMachine state={recovered} now={1_000n} expiresAt={null} drill={false} binding={null} engine={engine} />,
      { lang: 'en' },
    );
    await loaded();
    expect(
      screen.getByText('The rules have decided: everything this vault covers passes to the recovery wallet.'),
    ).toBeVisible();
    first.unmount();
    renderWithProviders(<TimeMachine state={state} now={END} expiresAt={END} drill binding={null} engine={engine} />, {
      lang: 'vi',
    });
    await loaded();
    expect(screen.getByText('Sợi chỉ này không còn gì thay đổi được nữa.')).toBeVisible();
    expect(screen.getByText('Drill (bản diễn tập) này đã kết thúc: luật của nó không còn gì để quyết.')).toBeVisible();
  });

  it('the chips and the switch pick the scenario; a new scenario starts quiet', async () => {
    renderMachine();
    const box = await loaded();
    // Silent has no return: the switch is disabled (dimmed on a phone, out of sight from sm up), never a hole.
    const off = screen.getByRole('checkbox', { name: 'I check in again' });
    expect(off).toBeDisabled();
    expect(off.closest('label')).not.toHaveAttribute('aria-hidden');
    expect(off.closest('label')?.className).toContain('sm:invisible');
    fireEvent.click(screen.getByRole('radio', { name: 'Guardians confirm' }));
    expect(screen.getByRole('checkbox', { name: 'I check in again' })).toBeEnabled();
    expect(box).toHaveAttribute('data-scenario', 'confirm');
    fireEvent.click(screen.getByRole('checkbox', { name: 'I check in again' }));
    expect(box).toHaveAttribute('data-scenario', 'returns');
    expect(screen.getByTestId('time-machine-scrubber-live')).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole('radio', { name: 'Recovery' }));
    expect(box).toHaveAttribute('data-scenario', 'recoverBlocked');
    fireEvent.click(screen.getByRole('checkbox', { name: 'I check in again' }));
    expect(box).toHaveAttribute('data-scenario', 'recover');
    fireEvent.click(screen.getByRole('radio', { name: 'Silent' }));
    expect(box).toHaveAttribute('data-scenario', 'silent');
  });

  it('a moment button moves the time there and marks it current', async () => {
    renderMachine();
    const box = await loaded();
    const release = screen.getByRole('button', { name: new RegExp(RELEASE) });
    fireEvent.click(release);
    expect(box).toHaveAttribute('data-state', 'releasedInherit');
    expect(release).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: new RegExp(NOW) }));
    expect(box).toHaveAttribute('data-state', 'active');
    // A press on a moment is its own announcement: the live region stays quiet.
    expect(screen.getByTestId('time-machine-scrubber-live')).toBeEmptyDOMElement();
  });

  it('names guardians by their place, never by a shortened address, and never shows NEW_WALLET', async () => {
    renderMachine();
    await loaded();
    fireEvent.click(screen.getByRole('radio', { name: 'Recovery' }));
    expect(screen.getByRole('button', { name: /Guardian 1 votes for a new wallet/ })).toBeVisible();
    expect(
      screen.getByRole('button', { name: /Guardian 2 votes for a new wallet, and the recovery starts/ }),
    ).toBeVisible();
    expect(document.body.textContent).not.toMatch(/0x7e7e|0x90F7|…/i);
  });

  it('says which engine computed it', async () => {
    renderMachine({ engine: { kind: 'netlist', step: engine.step } });
    await loaded('netlist');
    expect(screen.getByText('Every moment here is computed by the policy circuit, read from X Layer.')).toBeVisible();
  });

  it('a released vault has one frame and no slider', async () => {
    renderMachine({ released: true });
    const box = await loaded();
    expect(box).toHaveAttribute('data-state', 'releasedInherit');
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByText('Nothing on this thread can change any more.')).toBeVisible();
    // The stage keeps its caption: what the rules decided.
    expect(screen.getByText('The rules have decided: everything this vault covers passes to the heirs.')).toBeVisible();
    // Nothing to drag, no story to tell and no moment computed: no hint, no scenario, no list, no engine line.
    expect(screen.queryByText(/Drag/)).toBeNull();
    expect(screen.queryByText('You stop checking in, and nobody signs anything.')).toBeNull();
    expect(screen.queryByTestId('time-machine-moments')).toBeNull();
    expect(screen.queryByText(/reference model/)).toBeNull();
  });

  it('the playhead over the thumb reads the time from now, and is not read aloud', async () => {
    const { container } = renderMachine();
    await loaded();
    const playhead = () => container.querySelector('[data-part="playhead"]');
    expect(playhead()).toHaveTextContent('Now');
    expect(playhead()).toHaveAttribute('aria-hidden', 'true');
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time from now' }), { key: 'PageUp' });
    await waitFor(() => expect(playhead()).toHaveTextContent('In 110 seconds'));
  });

  it('speaks Vietnamese', async () => {
    renderMachine({ lang: 'vi' });
    await loaded();
    expect(screen.getByRole('slider', { name: 'Thời gian tính từ bây giờ' })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Giám hộ xác nhận' })).toBeInTheDocument();
  });

  it('an engine that fails to load is an error with a Retry, and the Retry works', async () => {
    let calls = 0;
    const queryClient = testQueryClient();
    const sdk = {
      atro: {
        engine: async () => {
          calls += 1;
          if (calls === 1) throw new Error('rpc down');
          return engine;
        },
      },
    } as unknown as Sdk;
    queryClient.setQueryData(chainKeys.sdk(CHAIN_ID, false), sdk);
    renderWithProviders(<TimeMachine state={state} now={1_000n} expiresAt={END} drill binding={null} />, {
      lang: 'en',
      queryClient,
    });
    const error = await screen.findByTestId('time-machine-error', {}, { timeout: 15_000 });
    fireEvent.click(within(error).getByRole('button', { name: 'Retry' }));
    await loaded();
  });
});

describe('shellShape', () => {
  it('predicts the chips and a closed stage from the state alone, so the skeleton takes their shape', () => {
    expect(shellShape(state, 1_000n, END)).toEqual({ picker: true, closed: false });
    expect(shellShape({ ...state, state: STATE_CODES.grace }, 1_000n, END)).toEqual({ picker: true, closed: false });
    // No guardian, or fewer than k: Silent alone, no chips.
    expect(shellShape({ ...state, k: 0, guardians: [] }, 1_000n, END)).toEqual({ picker: false, closed: false });
    expect(shellShape({ ...state, k: 4 }, 1_000n, END)).toEqual({ picker: false, closed: false });
    // A recovery under way offers only silence.
    expect(shellShape({ ...state, state: STATE_CODES.recovery }, 1_000n, END)).toEqual({
      picker: false,
      closed: false,
    });
    expect(shellShape({ ...state, state: STATE_CODES.releasedInherit }, 1_000n, null)).toEqual({
      picker: false,
      closed: true,
    });
    expect(shellShape({ ...state, state: STATE_CODES.releasedRecover }, 1_000n, null)).toEqual({
      picker: false,
      closed: true,
    });
    expect(shellShape(state, END, END)).toEqual({ picker: false, closed: true });
  });

  it('a closed skeleton has no chips, hint, moments or engine line', () => {
    renderWithProviders(
      <TimeMachineShell
        testId="time-machine"
        error={null}
        onRetry={() => {}}
        shape={{ picker: false, closed: true }}
      />,
      { lang: 'en' },
    );
    const box = screen.getByTestId('time-machine');
    expect(box).toHaveAttribute('aria-busy', 'true');
    expect(box.querySelector('[data-part="skeleton-chips"]')).toBeNull();
    expect(box.querySelector('[data-part="skeleton-moments"]')).toBeNull();
    expect(box.querySelector('[data-part="skeleton-stage"]')).not.toBeNull();
  });

  it('an open skeleton has the chips, the stage, three moments and the engine line', () => {
    renderWithProviders(<TimeMachineShell testId="time-machine" error={null} onRetry={() => {}} />, { lang: 'en' });
    const box = screen.getByTestId('time-machine');
    expect(box.querySelectorAll('[data-part="skeleton-chip"]')).toHaveLength(3);
    expect(box.querySelectorAll('[data-part="skeleton-moments"] > *')).toHaveLength(3);
    expect(box.querySelector('[data-part="skeleton-footer"]')).not.toBeNull();
  });
});
