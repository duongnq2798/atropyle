import { GUARDIAN_WARNING, type Warning } from '@atropyle/sdk';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { durationWords } from '../../src/lib/duration';
import { messages } from '../../src/messages/warnings.messages';
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
      'Wallet recovery is on: 2 of 3 guardians acting together can move 100% of the covered assets to any wallet they choose. The owner can stop it only by checking in before the alarm window of 3 days ends.',
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
    // The window in words of the reader's language, never a unit letter such as "3d".
    expect(screen.getByTestId('w').textContent).toContain('trước khi hết thời gian báo động 3 ngày.');
  });

  it("a Drill's window in minutes, in both languages", () => {
    const drill: Warning = { ...POWER, params: { k: 1, guardians: 1, window: 600 } };
    const { unmount } = renderWithProviders(
      <p data-testid="w">
        <WarningText warning={drill} />
      </p>,
    );
    expect(screen.getByTestId('w').textContent).toContain('before the alarm window of 10 minutes ends.');
    unmount();
    renderWithProviders(
      <p data-testid="w">
        <WarningText warning={drill} />
      </p>,
      { lang: 'vi' },
    );
    expect(screen.getByTestId('w').textContent).toContain('thời gian báo động 10 phút.');
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

describe('durationWords', () => {
  it('names the largest unit the duration is a whole number of, in words of the language', () => {
    expect(durationWords(259_200, 'en')).toBe('3 days');
    expect(durationWords(259_200, 'vi')).toBe('3 ngày');
    expect(durationWords(86_400, 'en')).toBe('1 day');
    // 36 hours is not a whole number of days: it stays exact rather than rounding to "1 day".
    expect(durationWords(129_600, 'en')).toBe('36 hours');
    expect(durationWords(5_400, 'vi')).toBe('90 phút');
    expect(durationWords(45, 'en')).toBe('45 seconds');
    expect(durationWords(0, 'en')).toBe('0 seconds');
  });
  it('says the guardian warning in Vietnamese, as app text, not as untrusted chain text', () => {
    renderWithProviders(<WarningText warning={GUARDIAN_WARNING} />, { lang: 'vi' });
    expect(screen.getByText(/Trước khi ký, hãy xác nhận yêu cầu/)).toBeTruthy();
    expect(document.querySelector('[lang="en"]')).toBeNull();
  });

  it("keeps the English words equal to the SDK's, so a change in the SDK fails here", () => {
    expect(messages.en.guardianOutOfBand).toBe(GUARDIAN_WARNING.message);
  });
});
