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

  it('released: no ritual, the closing line, Deliver for anyone, Revoke with its released help', () => {
    tab(loadedWith({ state: 'releasedInherit', stateCode: 5, pending: 'releasedInherit', releasedAt: 1000n }));
    expect(screen.queryByTestId('owner-ritual')).toBeNull();
    expect(screen.getByTestId('owner-closed').getAttribute('data-kind')).toBe('released');
    expect(screen.getByRole('heading', { name: 'No more check-ins' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Check in' })).toBeNull();
    expect(screen.getByTestId('vault-distribute')).toBeTruthy();
    expect(screen.getByTestId('owner-revoke-card').textContent).toContain('The vault has passed on.');
    expect(screen.queryByTestId('owner-edit')).toBeNull();
    expect(screen.queryByTestId('owner-alerts')).toBeNull();
  });

  it('expired: the closing line and the expired revoke help', () => {
    tab(loadedWith({ expired: true }));
    expect(screen.getByTestId('owner-closed').getAttribute('data-kind')).toBe('expired');
    expect(screen.getByTestId('owner-revoke-card').textContent).toContain('This Drill has expired.');
    expect(screen.queryByTestId('vault-distribute')).toBeNull();
  });

  it('keeps Revoke when nothing can move: coverage is not the allowance', () => {
    const base = fixtureSnapshot().status;
    // A balance of 0 under an unlimited allowance reads as coverage 0: the allowance may still stand.
    tab(loadedWith({ assets: base.assets.map((a) => ({ ...a, coverage: 0n, held: 0n })) }));
    expect(screen.getByTestId('owner-revoke').getAttribute('data-action')).toBe('{"type":"revokeAll"}');
    expect(screen.getByTestId('owner-revoke-idle').textContent).toBe(
      'The vault can move nothing you hold right now. Revoke all still removes any allowance it keeps.',
    );
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
