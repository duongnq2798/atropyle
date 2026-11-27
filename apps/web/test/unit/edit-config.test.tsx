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
const TYPED_NFT = getAddress('0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f');

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
    // A window no preset has (5 minutes): the recovery sentence can only have read it from this vault.
    const s = fixtureSnapshot();
    edit('guardians', loaded({ ...s, config: { ...s.config, timing: { ...s.config.timing, window: 300 } } }));
    expect(screen.getByTestId('owner-edit-k')).toBeTruthy();
    expect(action()).toMatchObject({ type: 'setGuardians', k: 2, recoveryEnabled: true });
    expect(screen.getByTestId('owner-edit-recovery-power').textContent).toContain(
      'checking in before the alarm window of 5 minutes ends',
    );
    // min=0: every row has its remove button, the last one too, and a vault with none is a plan of its own.
    for (const _ of s.config.guardians) fireEvent.click(screen.getByTestId('owner-edit-remove-guardian-0'));
    expect(screen.queryByTestId('owner-edit-guardian-0')).toBeNull();
    expect(action()).toEqual({ type: 'setGuardians', guardians: [], k: 0, recoveryEnabled: false });
    expect(save().disabled).toBe(false);
    expect(screen.getByTestId('owner-edit-recovery-power').textContent).toBe('');
  });

  it('edits the timing with the Drill presets', () => {
    edit('timing');
    expect(screen.getByTestId('owner-edit-fields').getAttribute('data-part')).toBe('timing');
    expect(screen.getByTestId('owner-edit-preset-drill')).toBeTruthy();
    expect(screen.queryByTestId('owner-edit-preset-sixMonths')).toBeNull();
    expect(action().type).toBe('setTiming');
  });

  it("edits the assets: Save sets the vault's assets, and the wallet mirror knows a token typed here", () => {
    edit('assets');
    expect(screen.getByTestId('owner-edit-fields').getAttribute('data-part')).toBe('assets');
    // The wizard's editor, one row per asset of the vault.
    expect(screen.getByTestId('owner-edit-asset-0')).toBeTruthy();
    expect(screen.getByTestId('owner-edit-asset-1')).toBeTruthy();
    expect(screen.queryByTestId('owner-edit-asset-2')).toBeNull();
    expect(action()).toEqual({
      type: 'setAssets',
      assets: [
        { kind: 'erc20', token: PEOPLE.token },
        { kind: 'erc721', token: PEOPLE.nft, id: '2', heir: 1 },
      ],
    });
    expect(save().disabled).toBe(true);
    const tokens = () => (flow.last.get('owner-edit-save') as ActionFlowProps).tokens ?? [];
    expect(tokens().map((x) => x.address)).toEqual([PEOPLE.token, PEOPLE.nft]);

    // The NFT goes to heir 1 instead of heir 2.
    fireEvent.change(screen.getByTestId('owner-edit-asset-1-heir'), { target: { value: '0' } });
    expect(save().disabled).toBe(false);
    expect(action().assets[1]).toEqual({ kind: 'erc721', token: PEOPLE.nft, id: '2', heir: 0 });

    // A token typed in a new row joins the mirror's list, unnamed: its symbol is never guessed.
    fireEvent.click(screen.getByTestId('owner-edit-add-nft'));
    type('owner-edit-asset-2-token', TYPED_NFT);
    type('owner-edit-asset-2-id', '7');
    expect(action().assets).toHaveLength(3);
    expect(tokens()).toHaveLength(3);
    expect(tokens()[2]).toEqual({ address: TYPED_NFT, kind: 'erc721', symbol: null, decimals: null });
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
