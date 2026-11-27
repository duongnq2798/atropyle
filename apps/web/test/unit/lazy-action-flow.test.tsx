import type { VaultAction } from '@atropyle/sdk';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LazyActionFlow } from '../../src/app/vault/lazy-action-flow';
import type { Sdk } from '../../src/chain/types';
import * as flows from '../../src/flows/impl';
import { renderWithProviders } from '../helpers/render';
import { PEOPLE } from './fixtures';

// The chunk never arrives: what stands in its place is under test.
vi.mock('../../src/lib/lazy-chunk', () => ({
  lazyChunk: () => ({ peek: () => null, load: () => new Promise(() => {}), preload: () => {} }),
}));

const CHECK_IN: VaultAction = { type: 'checkIn' };
const SDK = { atro: {}, deployment: { explorerUrl: null } } as unknown as Sdk;

function flow(auto: boolean) {
  return renderWithProviders(
    <LazyActionFlow
      flows={flows}
      sdk={SDK}
      vault={PEOPLE.vault}
      drill
      action={CHECK_IN}
      as={PEOPLE.owner}
      label="Check in"
      testId="x"
      auto={auto}
    />,
  );
}

describe('LazyActionFlow before its chunk', () => {
  it('is a button that keeps a press', () => {
    flow(false);
    expect(screen.getByTestId('x').tagName).toBe('BUTTON');
    expect(screen.queryByTestId('x-preparing')).toBeNull();
  });

  it('is a busy skeleton in auto mode, with no button to press', () => {
    flow(true);
    expect(screen.getByTestId('x-preparing').getAttribute('aria-busy')).toBe('true');
    expect(screen.queryByTestId('x')).toBeNull();
  });
});
