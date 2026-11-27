import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AssetsList } from '../../src/app/vault/assets-list';
import * as flows from '../../src/flows/impl';
import { renderWithProviders } from '../helpers/render';
import { fixtureSnapshot, fixtureTimeline, PEOPLE } from './fixtures';

describe('the assets list', () => {
  it('sets token names and symbols in the Ledger voice: chain text looks like chain text (§18.2 rule 7)', () => {
    const view = flows.vaultView(fixtureSnapshot(), fixtureTimeline(), PEOPLE.stranger);
    renderWithProviders(<AssetsList view={view} explorer={null} />);
    for (const part of ['name', 'symbol']) {
      const cell = screen.getByTestId(`asset-0-${part}`);
      expect(cell.closest('.voice-ledger'), part).not.toBeNull();
    }
    // The name reads as ink, the symbol beside it as muted.
    expect(screen.getByTestId('asset-0-name').closest('p')).toHaveClass('text-ink');
    expect(screen.getByTestId('asset-0-symbol')).toHaveClass('text-ink-muted');
  });
});
