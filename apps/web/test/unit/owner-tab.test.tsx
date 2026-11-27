import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActionFlowProps } from '../../src/app/vault/action-flow';
import { OwnerTab } from '../../src/app/vault/owner-tab';
import type { RegisteredVault, Sdk } from '../../src/chain/types';
import * as flows from '../../src/flows/impl';
import { renderWithProviders } from '../helpers/render';
import { fixtureDeployment, fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

vi.mock('../../src/app/vault/lazy-action-flow', () => ({
  actionFlowChunk: { preload: () => {}, peek: () => null, load: async () => ({}) },
  LazyActionFlow: (p: ActionFlowProps) => (
    <button
      type="button"
      data-testid={p.testId}
      data-action={JSON.stringify(p.action, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}
      data-variant={p.variant ?? 'primary'}
      data-tone={p.tone ?? 'thread'}
      data-tokens={String(p.tokens?.length ?? 0)}
    >
      {p.label}
    </button>
  ),
}));
vi.mock('../../src/flows/time-machine/lazy', () => ({
  LazyTimeMachine: (p: { testId?: string; binding: unknown }) => (
    <div data-testid={p.testId} data-bound={String(p.binding !== null)} />
  ),
}));
vi.mock('../../src/chain/load', async () => {
  const { fixtureDeployment: d } = await import('./fixtures');
  const chain = {
    loadDeployment: () => d(),
    createSdk: () => ({ deployment: d(), atro: {}, rpc: { read: [], verify: [] } }),
  };
  return { loadChainImpl: async () => chain, peekChainImpl: () => chain };
});
vi.mock('next/navigation', () => ({ usePathname: () => '/vault/', useRouter: () => ({ push: vi.fn() }) }));

const SDK = { atro: {}, deployment: fixtureDeployment() } as unknown as Sdk;
type Status = RegisteredVault['snap']['status'];

function loadedWith(status: Partial<Status> = {}): RegisteredVault {
  const base = fixtureSnapshot();
  return {
    snap: { ...base, status: { ...base.status, ...status } },
    registered: true,
    timeline: fixtureTimeline(),
    fetchedAtMs: Date.now(),
  };
}

function tab(loaded = loadedWith(), lang: 'en' | 'vi' = 'en') {
  const view = flows.vaultView(loaded.snap, loaded.timeline, PEOPLE.owner);
  return renderWithProviders(
    <OwnerTab flows={flows} sdk={SDK} loaded={loaded} view={view} account={PEOPLE.owner} onChanged={() => {}} />,
    { lang },
  );
}

describe('the owner tab', () => {
  it('opens with the ritual, then coverage, the plan, revoke, the time machine and reminders', () => {
    tab();
    expect(screen.getByTestId('owner-ritual')).toBeTruthy();
    expect(screen.getByTestId('owner-coverage-0').getAttribute('data-percent')).toBe('50');
    expect(JSON.parse(screen.getByTestId('owner-coverage-fix').getAttribute('data-action') ?? '{}').type).toBe(
      'setAssets',
    );
    expect(Number(screen.getByTestId('owner-coverage-fix').getAttribute('data-tokens'))).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { pressed: false }).map((b) => b.getAttribute('data-testid'))).toEqual(
      expect.arrayContaining(['owner-edit-heirs', 'owner-edit-guardians', 'owner-edit-timing', 'owner-edit-assets']),
    );
    const revoke = screen.getByTestId('owner-revoke');
    expect(revoke.getAttribute('data-action')).toBe('{"type":"revokeAll"}');
    expect(revoke.getAttribute('data-variant')).toBe('secondary');
    expect(revoke.getAttribute('data-tone')).toBe('danger');
    expect(screen.getByTestId('owner-time').getAttribute('data-bound')).toBe('true');
    expect(screen.getByTestId('owner-alerts')).toBeTruthy();
    // The time machine and the alerts form stand in their own frames: no second title around either.
    expect(screen.queryByRole('heading', { name: 'What happens next' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Reminders' })).toBeNull();
    expect(screen.queryByTestId('vault-poke')).toBeNull();
  });

  it('loads the editor when a part is picked, and presses that part', async () => {
    tab();
    fireEvent.click(screen.getByTestId('owner-edit-heirs'));
    expect(screen.getByTestId('owner-edit-heirs').getAttribute('aria-pressed')).toBe('true');
    expect((await screen.findByTestId('owner-edit-fields')).getAttribute('data-part')).toBe('heirs');
  });

  it('hides coverage when every held asset is covered', () => {
    const base = fixtureSnapshot().status;
    tab(loadedWith({ assets: base.assets.map((a) => ({ ...a, coverage: a.held })) }));
    expect(screen.queryByTestId('owner-coverage')).toBeNull();
  });

  it('released: no ritual, a title that says what happened, Deliver for anyone, Revoke with its released help', () => {
    tab(loadedWith({ state: 'releasedInherit', stateCode: 5, pending: 'releasedInherit', releasedAt: 1000n }));
    expect(screen.queryByTestId('owner-ritual')).toBeNull();
    expect(screen.getByTestId('owner-closed').getAttribute('data-kind')).toBe('released');
    expect(screen.getByRole('heading', { name: "Your heirs' turn" })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Check in' })).toBeNull();
    expect(document.body.textContent).toContain('What you can still do is below, each with a transaction you sign.');
    expect(document.body.textContent).not.toContain('Check in before each period ends.');
    expect(screen.getByTestId('vault-distribute')).toBeTruthy();
    expect(screen.getByTestId('owner-revoke-card').textContent).toContain('If this is not what you meant, revoking');
    // Each fact once (review fix round 1): "passed on" and "no more check-ins" are said by no block of the tab.
    const text = screen.getByTestId('owner-tab').textContent ?? '';
    expect(text).not.toMatch(/passed on/);
    expect(text).not.toMatch(/no more check-ins/i);
    expect(screen.queryByTestId('owner-edit')).toBeNull();
    expect(screen.queryByTestId('owner-alerts')).toBeNull();
  });

  it('released to the recovery wallet: the title names the recovery wallet, and nothing names the heirs', () => {
    tab(
      loadedWith({
        state: 'releasedRecover',
        stateCode: 7,
        pending: 'releasedRecover',
        releasedAt: 1000n,
        recoveryTarget: PEOPLE.stranger,
      }),
    );
    expect(screen.queryByTestId('owner-ritual')).toBeNull();
    expect(screen.getByTestId('owner-closed').getAttribute('data-kind')).toBe('recovered');
    expect(screen.getByRole('heading', { name: "Your recovery wallet's turn" })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: "Your heirs' turn" })).toBeNull();
    expect(screen.getByTestId('vault-distribute')).toBeTruthy();
    expect(screen.getByTestId('owner-tab').textContent).not.toMatch(/heir/i);
  });

  it('released to the recovery wallet, in Vietnamese: "Đến lượt ví khôi phục"', () => {
    tab(
      loadedWith({
        state: 'releasedRecover',
        stateCode: 7,
        pending: 'releasedRecover',
        releasedAt: 1000n,
        recoveryTarget: PEOPLE.stranger,
      }),
      'vi',
    );
    expect(screen.getByRole('heading', { name: 'Đến lượt ví khôi\u00a0phục' })).toBeTruthy();
    expect(screen.getByTestId('owner-tab').textContent).not.toMatch(/thừa.kế/i);
  });

  it('expired: no empty closing card, and the revoke help does not repeat the button', () => {
    tab(loadedWith({ expired: true }));
    // The header's lead and the hero say the Drill is over: no titled frame with nothing in it.
    expect(screen.queryByTestId('owner-closed')).toBeNull();
    expect(screen.queryByTestId('owner-ritual')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'No more check-ins' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Check in' })).toBeNull();
    const card = screen.getByTestId('owner-revoke-card').textContent ?? '';
    expect(card).toContain('Removes the allowances the vault still holds over your assets.');
    // The title and the button say "Revoke all"; no sentence says it a third time.
    expect(card.match(/Revoke all/g)).toHaveLength(2);
    expect(screen.queryByTestId('vault-distribute')).toBeNull();
  });

  it('keeps Revoke when nothing can move: coverage is not the allowance', () => {
    const base = fixtureSnapshot().status;
    // A balance of 0 under an unlimited allowance reads as coverage 0: the allowance may still stand.
    tab(loadedWith({ assets: base.assets.map((a) => ({ ...a, coverage: 0n, held: 0n })) }));
    expect(screen.getByTestId('owner-revoke').getAttribute('data-action')).toBe('{"type":"revokeAll"}');
    expect(screen.getByTestId('owner-revoke-idle').textContent).toBe(
      'The vault can move nothing you hold right now, but an allowance you gave it may still stand.',
    );
    // The title and the button say "Revoke all"; the help and the idle line never repeat it.
    expect(screen.getByTestId('owner-revoke-card').textContent?.match(/Revoke all/g)).toHaveLength(2);
    expect(screen.queryByTestId('owner-revoke-none')).toBeNull();
    expect(document.body.textContent).not.toContain('holds no allowance');
  });

  it('says there is nothing to revoke only when the plan lists no assets', () => {
    const base = fixtureSnapshot();
    const loaded: RegisteredVault = {
      snap: { ...base, config: { ...base.config, assets: [] }, status: { ...base.status, assets: [] } },
      registered: true,
      timeline: fixtureTimeline(),
      fetchedAtMs: Date.now(),
    };
    tab(loaded);
    expect(screen.getByTestId('owner-revoke-none')).toBeTruthy();
    expect(screen.queryByTestId('owner-revoke')).toBeNull();
  });

  it('a vault with coverage shows Revoke without the idle line', () => {
    tab();
    expect(screen.getByTestId('owner-revoke')).toBeTruthy();
    expect(screen.queryByTestId('owner-revoke-idle')).toBeNull();
  });

  it('in Vietnamese the owner is "bạn", and nothing says "Đã xác nhận"', () => {
    tab(loadedWith(), 'vi');
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Bạn là chủ\u00a0vault này');
    expect(document.body.textContent).not.toContain('Đã xác nhận');
  });
});
