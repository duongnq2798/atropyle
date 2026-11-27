import { act, fireEvent, screen } from '@testing-library/react';
import type { Address } from 'viem';
import { getAddress } from 'viem';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActionFlowProps } from '../../src/app/vault/action-flow';
import { EditConfig } from '../../src/app/vault/edit-config';
import type { EditPart } from '../../src/app/vault/owner-view';
import type { RegisteredVault, Sdk } from '../../src/chain/types';
import * as flows from '../../src/flows/impl';
import { renderWithProviders } from '../helpers/render';
import { fixtureDeployment, fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

const flow = vi.hoisted(() => ({ last: new Map<string, unknown>() }));
vi.mock('../../src/app/vault/lazy-action-flow', () => ({
  actionFlowChunk: { preload: () => {}, peek: () => null, load: async () => ({}) },
  LazyActionFlow: (p: ActionFlowProps) => {
    flow.last.set(p.testId, p);
    return (
      <button
        type="button"
        data-testid={p.testId}
        data-action={JSON.stringify(p.action, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))}
        disabled={p.disabled}
      >
        {p.label}
      </button>
    );
  },
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
const NEW_HEIR = getAddress('0x976EA74026E726554dB657fA54763abd0C3a0aa9');

function loaded(snap = fixtureSnapshot()): RegisteredVault {
  return { snap, registered: true, timeline: fixtureTimeline(), fetchedAtMs: Date.now() };
}

function edit(part: EditPart, l = loaded(), onLocked = vi.fn()) {
  const ui = (x: RegisteredVault) => (
    <EditConfig
      flows={flows}
      sdk={SDK}
      loaded={x}
      view={flows.vaultView(x.snap, x.timeline, PEOPLE.owner)}
      account={PEOPLE.owner as Address}
      onChanged={() => {}}
      part={part}
      onLocked={onLocked}
    />
  );
  const r = renderWithProviders(ui(l));
  return { rerender: (x: RegisteredVault) => r.rerender(ui(x)), onLocked };
}

const save = () => screen.getByTestId('owner-edit-save') as HTMLButtonElement;
const action = () => JSON.parse(save().getAttribute('data-action') ?? 'null');
const type = (id: string, value: string) => fireEvent.change(screen.getByTestId(id), { target: { value } });

beforeEach(() => flow.last.clear());

describe("the owner's editor", () => {
  it('starts from the vault: nothing changed, Save closed', () => {
    edit('heirs');
    expect(screen.getByTestId('owner-edit-fields').getAttribute('data-part')).toBe('heirs');
    expect(screen.getByTestId('owner-edit-unchanged')).toBeTruthy();
    expect(save().disabled).toBe(true);
  });

  it('warns where an NFT would go when an heir changes, and saves only once that is understood', () => {
    edit('heirs');
    type('owner-edit-heir-1-account', NEW_HEIR);
    const remap = screen.getByTestId('owner-edit-remap');
    expect(remap.textContent).toContain('This change gives some NFTs to someone else.');
    expect(screen.getByTestId('owner-edit-remap-1').getAttribute('data-to')).toBe(NEW_HEIR);
    expect(save().disabled).toBe(true);
    fireEvent.click(screen.getByTestId('owner-edit-remap-ack'));
    expect(save().disabled).toBe(false);
    expect(action().type).toBe('setHeirs');
    expect(action().heirs[1].account).toBe(NEW_HEIR);
    // A different change asks again.
    type('owner-edit-heir-1-account', getAddress(PEOPLE.stranger));
    expect(save().disabled).toBe(true);
  });

  it('edits guardians with the vault window and lets every row go', () => {
    edit('guardians');
    expect(screen.getByTestId('owner-edit-k')).toBeTruthy();
    expect(action()).toMatchObject({ type: 'setGuardians', k: 2 });
  });

  it('edits the timing with the Drill presets', () => {
    edit('timing');
    expect(screen.getByTestId('owner-edit-fields').getAttribute('data-part')).toBe('timing');
    expect(action().type).toBe('setTiming');
  });

  it('keeps what was typed while a save is on screen, and starts from the new vault once it is gone', () => {
    const { rerender, onLocked } = edit('heirs');
    type('owner-edit-heir-1-account', NEW_HEIR);
    act(() => (flow.last.get('owner-edit-save') as ActionFlowProps).onPlan?.(true));
    expect(onLocked).toHaveBeenLastCalledWith(true);
    const s = fixtureSnapshot();
    const moved = {
      ...s,
      config: { ...s.config, heirs: s.config.heirs.map((h, i) => (i === 1 ? { ...h, account: NEW_HEIR } : h)) },
    };
    rerender(loaded(moved));
    expect((screen.getByTestId('owner-edit-heir-1-account') as HTMLInputElement).value).toBe(NEW_HEIR);
    act(() => (flow.last.get('owner-edit-save') as ActionFlowProps).onPlan?.(false));
    expect(onLocked).toHaveBeenLastCalledWith(false);
    expect(screen.getByTestId('owner-edit-unchanged')).toBeTruthy();
  });
});
