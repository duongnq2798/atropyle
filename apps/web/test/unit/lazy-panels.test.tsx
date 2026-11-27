import { screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LazyPanel } from '../../src/app/vault/lazy-panels';
import type { PanelProps } from '../../src/app/vault/vault-page';
import { lazyChunk } from '../../src/lib/lazy-chunk';
import { renderWithProviders } from '../helpers/render';

const props = {} as PanelProps;

interface Mod {
  P: () => ReactElement;
}

function PanelOne() {
  return <p data-testid="t1-panel">here</p>;
}

function PanelTwo() {
  return <p data-testid="t2-panel">here</p>;
}

const pick = (m: Mod) => m.P;

describe('lazy role panels', () => {
  it('shows a busy skeleton, then the panel', async () => {
    let done: (m: Mod) => void = () => {};
    const chunk = lazyChunk(() => new Promise<Mod>((r) => (done = r)));
    renderWithProviders(<LazyPanel name="t1" chunk={chunk} pick={pick} {...props} />);
    expect(screen.getByTestId('t1-panel-loading').getAttribute('aria-busy')).toBe('true');
    done({ P: PanelOne });
    await waitFor(() => expect(screen.getByTestId('t1-panel')).toBeTruthy());
  });

  it('a chunk that fails is an ErrorBox whose Retry loads it again', async () => {
    const importer = vi
      .fn<() => Promise<Mod>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ P: PanelTwo });
    renderWithProviders(<LazyPanel name="t2" chunk={lazyChunk(importer)} pick={pick} {...props} />);
    const box = await screen.findByTestId('t2-panel-error');
    (box.querySelector('button') as HTMLButtonElement).click();
    await waitFor(() => expect(screen.getByTestId('t2-panel')).toBeTruthy());
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
