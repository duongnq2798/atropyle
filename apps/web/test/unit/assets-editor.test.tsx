import { LIMITS } from '@atropyle/sdk';
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { AssetsEditor } from '../../src/flows/editors/assets-editor';
import * as flows from '../../src/flows/impl';
import type { TokenBalance } from '../../src/flows/impl/balances';
import type { AssetRow, TokenChoice } from '../../src/flows/impl/create-form';
import { renderWithProviders } from '../helpers/render';
import { PEOPLE } from './fixtures';

const DEVNET: TokenChoice[] = [{ symbol: null, address: PEOPLE.token }];

function Editor(p: {
  initial?: AssetRow[];
  heirs?: number;
  balances?: TokenBalance[] | null;
  choices?: TokenChoice[];
  hideLegend?: boolean;
}) {
  const [rows, setRows] = useState<AssetRow[]>(p.initial ?? []);
  return (
    <AssetsEditor
      flows={flows}
      rows={rows}
      heirs={p.heirs ?? 1}
      choices={p.choices ?? DEVNET}
      circuit={null}
      balances={p.balances ?? null}
      issues={[]}
      showIssues={false}
      testId="create"
      hideLegend={p.hideLegend}
      onChange={setRows}
    />
  );
}

describe('AssetsEditor', () => {
  it('a token button adds an ERC-20 row, and takes it away again', () => {
    renderWithProviders(<Editor />);
    const token = screen.getByTestId('create-token-0');
    expect(token).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(token);
    expect(token).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('create-asset-0-token')).toHaveValue(PEOPLE.token);
    expect(screen.getByTestId('create-asset-0-kind-erc20')).toBeChecked();
    fireEvent.click(token);
    expect(screen.queryByTestId('create-asset-0')).toBeNull();
  });

  it('names a devnet token by its place, never by what its contract says', () => {
    renderWithProviders(<Editor />);
    expect(screen.getByTestId('create-token-0')).toHaveTextContent('Test token 1');
  });

  it('an NFT asks for its ID, and for its heir once there are two heirs', () => {
    const { unmount } = renderWithProviders(<Editor initial={[{ kind: 'erc20', token: '', id: '', heir: '0' }]} />);
    expect(screen.queryByTestId('create-asset-0-id')).toBeNull();
    fireEvent.click(screen.getByTestId('create-asset-0-kind-erc721'));
    expect(screen.getByTestId('create-asset-0-kind-erc721')).toBeChecked();
    expect(screen.getByTestId('create-asset-0-id')).toBeInTheDocument();
    expect(screen.queryByTestId('create-asset-0-heir')).toBeNull();
    unmount();
    renderWithProviders(<Editor heirs={2} initial={[{ kind: 'erc721', token: '', id: '', heir: '0' }]} />);
    const heir = screen.getByTestId('create-asset-0-heir');
    fireEvent.change(heir, { target: { value: '1' } });
    expect(heir).toHaveValue('1');
  });

  it('keeps each kind a native radio, out of sight, with the product drawn beside it', () => {
    renderWithProviders(<Editor initial={[{ kind: 'erc20', token: '', id: '', heir: '0' }]} />);
    for (const k of ['erc20', 'erc721', 'erc1155']) {
      const input = screen.getByTestId(`create-asset-0-kind-${k}`);
      expect(input).toHaveAttribute('type', 'radio');
      expect(input.getAttribute('class')).toContain('sr-only');
      expect(input.closest('label')?.querySelector('[data-part="radio"]')).not.toBeNull();
    }
  });

  it('removes a row', () => {
    renderWithProviders(<Editor initial={[{ kind: 'erc20', token: PEOPLE.token, id: '', heir: '0' }]} />);
    fireEvent.click(screen.getByTestId('create-remove-asset-0'));
    expect(screen.queryByTestId('create-asset-0')).toBeNull();
  });

  it('says what the wallet holds of a listed token on its own line', () => {
    renderWithProviders(
      <Editor
        initial={[{ kind: 'erc20', token: PEOPLE.token, id: '', heir: '0' }]}
        balances={[{ token: PEOPLE.token, balance: 1_500_000n, decimals: 6 }]}
      />,
    );
    expect(screen.getByTestId('create-asset-0-held')).toHaveTextContent('You hold 1.5 Test token 1');
  });

  it('turns the add buttons off at the asset limit', () => {
    const full = Array.from({ length: LIMITS.maxAssets }, () => ({
      kind: 'erc721' as const,
      token: PEOPLE.nft,
      id: '1',
      heir: '0',
    }));
    renderWithProviders(<Editor initial={full} />);
    expect(screen.getByTestId('create-add-nft')).toBeDisabled();
    expect(screen.getByTestId('create-token-0')).toBeDisabled();
  });

  it('keeps the legend for screen readers only when the page heading names the step', () => {
    renderWithProviders(<Editor hideLegend />);
    const legend = screen.getByText('What the vault watches');
    expect(legend.tagName).toBe('LEGEND');
    expect(legend).toHaveClass('sr-only');
  });
});
