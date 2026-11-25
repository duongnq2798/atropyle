import type { Warning } from '@atropyle/sdk';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WarningText } from '../../src/tx/warning-text';
import { renderWithProviders } from '../helpers/render';

const POWER: Warning = {
  code: 'RECOVERY_POWER',
  message: 'Recovery is on.',
  params: { k: 2, guardians: 3, window: 259_200 },
};

describe('WarningText', () => {
  it("says RECOVERY_POWER in the reader's words, from its typed numbers", () => {
    renderWithProviders(
      <p data-testid="w">
        <WarningText warning={POWER} />
      </p>,
    );
    expect(screen.getByTestId('w').textContent).toBe(
      'Wallet recovery is on: 2 of 3 guardians acting together can move 100% of the covered assets to any wallet they choose. The owner can stop it only by checking in before the 3d alarm window ends.',
    );
  });

  it('in Vietnamese, with "điểm danh"', () => {
    renderWithProviders(
      <p data-testid="w">
        <WarningText warning={POWER} />
      </p>,
      { lang: 'vi' },
    );
    expect(screen.getByTestId('w').textContent).toContain('2 trên 3 người giám hộ');
    expect(screen.getByTestId('w').textContent).toContain('điểm danh');
  });

  it("any other warning stays the SDK's English text, as untrusted text", () => {
    renderWithProviders(
      <p data-testid="w">
        <WarningText warning={{ code: 'TOKEN_NOT_HELD', message: '<b>x</b>' }} />
      </p>,
      { lang: 'vi' },
    );
    const el = screen.getByTestId('w');
    expect(el.querySelector('[lang="en"] [data-untrusted]')?.textContent).toBe('<b>x</b>');
    expect(el.querySelector('b')).toBeNull();
  });

  it('a RECOVERY_POWER without whole numbers falls back to the SDK text', () => {
    renderWithProviders(
      <p data-testid="w">
        <WarningText warning={{ ...POWER, params: { k: 1.5, guardians: 3, window: 1 } }} />
      </p>,
    );
    expect(screen.getByTestId('w').textContent).toBe('Recovery is on.');
  });
});
