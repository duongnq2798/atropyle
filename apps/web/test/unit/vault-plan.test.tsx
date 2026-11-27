import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VaultPlan } from '../../src/app/vault/vault-header';
import * as flows from '../../src/flows/impl';
import { renderWithProviders } from '../helpers/render';
import { fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

describe('the plan', () => {
  it("warns that k of n guardians can move everything, in the owner's words or another reader's", () => {
    const snap = fixtureSnapshot();
    const r = renderWithProviders(
      <VaultPlan snap={snap} view={flows.vaultView(snap, fixtureTimeline(), PEOPLE.owner)} explorer={null} />,
    );
    const owner = screen.getByTestId('vault-recovery-power').textContent ?? '';
    expect(owner).toContain('2 of 3 guardians');
    expect(owner).toContain('You can stop it');
    expect(owner).toContain('2 minutes');
    r.unmount();
    renderWithProviders(
      <VaultPlan snap={snap} view={flows.vaultView(snap, fixtureTimeline(), PEOPLE.stranger)} explorer={null} />,
    );
    expect(screen.getByTestId('vault-recovery-power').textContent).toContain('The owner can stop it');
  });

  it('says nothing of it once the vault is released', () => {
    const base = fixtureSnapshot();
    const snap = {
      ...base,
      status: { ...base.status, state: 'releasedInherit' as const, pending: 'releasedInherit' as const },
    };
    renderWithProviders(
      <VaultPlan snap={snap} view={flows.vaultView(snap, fixtureTimeline(), null)} explorer={null} />,
    );
    expect(screen.queryByTestId('vault-recovery-power')).toBeNull();
    expect(screen.getByTestId('vault-timing').textContent).toContain('Check in every 1 minute');
  });
});
