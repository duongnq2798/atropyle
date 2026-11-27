import type { PreparedTx, TxPlan, VaultAction } from '@atropyle/sdk';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionFlow, type ActionFlowProps } from '../../src/app/vault/action-flow';
import { LazyActionFlow } from '../../src/app/vault/lazy-action-flow';
import type { Sdk } from '../../src/chain/types';
import * as flows from '../../src/flows/impl';
import { TxCard } from '../../src/tx/tx-card';
import { txView } from '../../src/tx/tx-view';
import type { TxRunner } from '../../src/tx/use-tx-runner';
import { renderWithProviders } from '../helpers/render';
import { PEOPLE } from './fixtures';

// LazyActionFlow's chunk never arrives: what stands in its place is under test.
vi.mock('../../src/lib/lazy-chunk', () => ({
  lazyChunk: () => ({ peek: () => null, load: () => new Promise(() => {}), preload: () => {} }),
}));

const CHECK_IN: VaultAction = { type: 'checkIn' };
const STEP: PreparedTx = {
  chainId: 31337,
  from: PEOPLE.owner,
  to: PEOPLE.vault,
  data: '0x',
  value: 0n,
  action: 'checkIn',
  summary: 'Check in',
  warnings: [],
  simulation: { ok: true, gas: 50_000n },
};
const PLAN: TxPlan = {
  chainId: 31337,
  from: PEOPLE.owner,
  vault: PEOPLE.vault,
  steps: [STEP],
  summary: 'Check in',
  warnings: [],
};
/** An SDK whose prepare never answers: the flow stays on its preparing state. */
const PREPARING = {
  atro: { vault: () => ({ prepare: () => new Promise(() => {}) }) },
  deployment: { explorerUrl: null },
} as unknown as Sdk;

const HINT = 'Hold for a moment, or press Enter';

/** The ritual's flow, as ritual.tsx passes it: the hold up front, with its face. */
function ritualProps(over: Partial<ActionFlowProps> = {}): ActionFlowProps {
  return {
    flows,
    sdk: PREPARING,
    vault: PEOPLE.vault,
    drill: true,
    action: CHECK_IN,
    as: PEOPLE.owner,
    label: 'Check in',
    title: 'Your check-in',
    nested: true,
    testId: 'x',
    confirm: 'hold',
    holdPlacement: 'top',
    auto: true,
    hold: { face: <span data-testid="face" />, hint: HINT, showKnot: false },
    ...over,
  };
}

/** TxCard while its runner reads what the wallet will show: its hold up front, disabled, saying "Preparing…". */
function loadingCard() {
  const runner = {
    plan: PLAN,
    view: txView(PLAN),
    busy: false,
    error: null,
    result: null,
    offset: 0,
    confirmed: 0,
    committed: false,
    blocker: 'loading',
    switchFirst: false,
    handoffLink: null,
    explorer: null,
    mode: null,
    mirror: null,
    unsettled: null,
    bundle: null,
    rechecking: false,
    loadFailed: false,
    receipt: null,
    receiptReading: false,
    stale: false,
    send: () => undefined,
    connect: () => undefined,
    reload: () => undefined,
    recheck: () => undefined,
    adopt: () => undefined,
  } as unknown as TxRunner;
  return renderWithProviders(
    <TxCard
      runner={runner}
      label="Check in"
      title="Your check-in"
      nested
      confirm="hold"
      holdPlacement="top"
      hold={{ face: <span data-testid="face" />, hint: HINT, showKnot: false }}
      testId="tx"
    />,
  );
}

const tokens = (el: Element | null | undefined) => (el?.className ?? '').split(/\s+/).filter(Boolean).sort();

/**
 * The path from a card down to its hold: the card, its header and heading, the area under the heading, the area that
 * centres the hold, the hold's column, the hold itself, the face's box, the bar, and the hint under the hold.
 */
function holdPath(section: Element) {
  const action = section.children[1];
  const area = action?.firstElementChild;
  const column = area?.firstElementChild;
  const hold = column?.firstElementChild;
  return {
    card: section,
    header: section.querySelector('header'),
    heading: section.querySelector('h3'),
    action,
    area,
    column,
    hold,
    face: hold?.querySelector('[data-part="face"]'),
    bar: hold?.querySelector('[data-part="bar"]'),
    hint: column?.lastElementChild,
  };
}

/** The silhouette under a preparing flow: the card the hold will stand on, the face in a disabled hold. */
function expectShape() {
  const preparing = screen.getByTestId('x-preparing');
  expect(preparing.getAttribute('aria-busy')).toBe('true');
  const section = preparing.querySelector('section');
  if (!section) throw new Error('no card shape');
  const p = holdPath(section);
  expect(p.heading?.textContent).toBe('Your check-in');
  expect(p.hold?.tagName).toBe('BUTTON');
  expect((p.hold as HTMLButtonElement).disabled).toBe(true);
  expect(p.face?.contains(screen.getByTestId('face'))).toBe(true);
  expect(p.bar?.textContent).toBe('Preparing…');
  expect(p.hint?.textContent).toBe(HINT);
  // No text skeleton: the object stands where it will be, and only the steps and the mirror come in under it.
  expect(preparing.querySelector('.animate-shimmer, [class*="animate-shimmer"]')).toBeNull();
  expect(screen.queryByTestId('x')).toBeNull();
  return p;
}

describe('the hold up front while its plan is prepared (spec §6, §18.2.6)', () => {
  it('before its chunk, LazyActionFlow draws the card with the hold where it will stand', () => {
    renderWithProviders(<LazyActionFlow {...ritualProps()} />);
    expectShape();
  });

  it('while the SDK prepares, ActionFlow draws the same card', () => {
    renderWithProviders(<ActionFlow {...ritualProps()} />);
    expectShape();
  });

  it('is TxCard to the pixel down to the hold: the same boxes, in the same order, with the same classes', () => {
    const shape = renderWithProviders(<LazyActionFlow {...ritualProps()} />);
    const silhouette = holdPath(expectShape().card);
    const was = Object.fromEntries(Object.entries(silhouette).map(([k, el]) => [k, tokens(el)]));
    shape.unmount();
    loadingCard();
    const card = holdPath(screen.getByTestId('tx'));
    expect(screen.getByTestId('tx-action')).toBe(card.action);
    expect(card.bar?.textContent).toBe('Preparing…');
    for (const [k, el] of Object.entries(card)) expect(was[k], k).toEqual(tokens(el));
  });

  it('keeps the text skeleton for every other auto flow', () => {
    renderWithProviders(<LazyActionFlow {...ritualProps({ holdPlacement: 'end' })} />);
    const preparing = screen.getByTestId('x-preparing');
    expect(preparing.querySelector('section')).toBeNull();
    expect(screen.queryByTestId('face')).toBeNull();
  });
});
