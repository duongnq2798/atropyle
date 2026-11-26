import { DRILL_LIFETIME_SECONDS, evalStateOf, modelEngine, type PolicyEngine, STATE_CODES } from '@atropyle/sdk';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHAIN_ID } from '../../src/chain/hooks';
import { chainKeys } from '../../src/chain/keys';
import type { Sdk } from '../../src/chain/types';
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

  it('the chips and the switch pick the scenario; a new scenario starts quiet', async () => {
    renderMachine();
    const box = await loaded();
    // Silent has no return: the switch is out of sight and out of the accessibility tree.
    expect(screen.queryByRole('checkbox')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Guardians confirm' }));
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
    expect(screen.getByText('Nothing more can happen to this vault.')).toBeVisible();
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
