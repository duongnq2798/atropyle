import type { PlanCheck, Warning } from '@atropyle/sdk';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { planTokens } from '../../src/app/create/plan-tokens';
import { CheckResult, CheckWarnings } from '../../src/app/create/review';
import { untrusted } from '../../src/lib/untrusted';
import { renderWithProviders } from '../helpers/render';
import { PEOPLE } from './fixtures';

const FEE_A = '0x5555555555555555555555555555555555555555';
const FEE_B = '0x6666666666666666666666666666666666666666';

const WARNINGS: Warning[] = [
  { code: 'NO_GUARDIANS', message: 'sdk: no guardians' },
  { code: 'DRILL_NOT_FOR_REAL_ASSETS', message: 'sdk: drill' },
  { code: 'HEIR_IS_CONTRACT', message: 'sdk: contract heir' },
  {
    code: 'RECOVERY_POWER',
    message: 'sdk: recovery power',
    params: { k: 2, guardians: 3, window: 1_209_600 },
  },
  { code: 'SOMETHING_NEW', message: 'An SDK sentence the app has no words for' } as unknown as Warning,
  { code: 'TOKEN_NOT_HELD', message: 'sdk: not held' },
];

function check(): PlanCheck {
  return {
    ok: true,
    issues: [],
    warnings: [],
    config: null,
    contractHeirs: [],
    tokens: [
      {
        index: 0,
        token: PEOPLE.token,
        kind: 'erc20',
        isContract: true,
        info: { address: PEOPLE.token, name: untrusted('Tether USD', 32), symbol: untrusted('USDT0', 16), decimals: 6 },
        held: 0n,
      },
      { index: 1, token: PEOPLE.nft, kind: 'erc721', isContract: false, info: null, held: null },
    ],
    fees: {
      blockNumber: 1n,
      paidCount: 0n,
      earlyCount: 100n,
      earlyRemaining: 100n,
      tokens: [
        {
          token: FEE_A,
          symbol: untrusted('USDT0', 16),
          decimals: 6,
          fee: 1_990_000n,
          early: 1_990_000n,
          full: 9_900_000n,
        },
        {
          token: FEE_B,
          symbol: untrusted('USDC', 16),
          decimals: 6,
          fee: 1_990_000n,
          early: 1_990_000n,
          full: 9_900_000n,
        },
      ],
    },
  } as unknown as PlanCheck;
}

describe('the check warnings', () => {
  it('says each in the app words, the token one in its row, and the unknown one in English', () => {
    const { container } = renderWithProviders(<CheckWarnings warnings={WARNINGS} />, { lang: 'vi' });
    for (const code of [
      'NO_GUARDIANS',
      'DRILL_NOT_FOR_REAL_ASSETS',
      'HEIR_IS_CONTRACT',
      'RECOVERY_POWER',
      'SOMETHING_NEW',
    ]) {
      expect(screen.getByTestId(`create-warning-${code}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId('create-warning-TOKEN_NOT_HELD')).toBeNull();
    expect(screen.getByTestId('create-warning-NO_GUARDIANS')).toHaveTextContent('Không có người giám hộ');
    expect(screen.getByTestId('create-warning-DRILL_NOT_FOR_REAL_ASSETS')).toHaveTextContent('Drill là để tập dượt');
    expect(screen.getByTestId('create-warning-HEIR_IS_CONTRACT')).toHaveTextContent('là hợp đồng');
    expect(screen.getByTestId('create-warning-RECOVERY_POWER')).toHaveTextContent('điểm danh');
    expect(screen.getByTestId('create-warning-RECOVERY_POWER')).toHaveTextContent('2 trên 3');
    expect(container.textContent).not.toContain('sdk:');
    expect(screen.getByTestId('create-warning-SOMETHING_NEW').querySelector('[lang="en"]')).toHaveTextContent(
      'An SDK sentence the app has no words for',
    );
  });

  it('says the same warning once', () => {
    renderWithProviders(<CheckWarnings warnings={[WARNINGS[0] as Warning, WARNINGS[0] as Warning]} />);
    expect(screen.getAllByTestId('create-warning-NO_GUARDIANS')).toHaveLength(1);
  });
});

describe('planTokens', () => {
  it('names the plan tokens and the fee tokens once each, symbols still untrusted', () => {
    const c = check();
    c.fees.tokens[0] = {
      ...(c.fees.tokens[0] as PlanCheck['fees']['tokens'][number]),
      token: PEOPLE.token.toLowerCase() as `0x${string}`,
    };
    const out = planTokens(c);
    expect(out.map((t) => t.address)).toEqual([PEOPLE.token, PEOPLE.nft, FEE_B]);
    expect(out[0]).toMatchObject({ kind: 'erc20', decimals: 6 });
    expect(out[0]?.symbol).toEqual(untrusted('USDT0', 16));
    expect(out[1]).toMatchObject({ kind: 'erc721', symbol: null, decimals: null });
    expect(out[2]).toMatchObject({ kind: 'erc20', symbol: untrusted('USDC', 16), decimals: 6 });
  });
});

describe('the check result', () => {
  const render = (onFee = vi.fn()) =>
    renderWithProviders(
      <CheckResult
        check={check()}
        drill={false}
        feeToken={FEE_A}
        locked={false}
        explorer={null}
        showWarnings={false}
        onFee={onFee}
      />,
    );

  it('a click on the amount of a fee card picks that fee', () => {
    const onFee = vi.fn();
    render(onFee);
    const label = screen.getByTestId(`create-fee-${FEE_B}`).closest('label') as HTMLLabelElement;
    fireEvent.click(within(label).getByText('1.99', { exact: false }));
    expect(onFee).toHaveBeenCalledWith(FEE_B);
  });

  it('keeps buttons and links out of the fee cards, so the radio name is only the card text', () => {
    render();
    for (const input of screen.getAllByRole('radio')) {
      const label = input.closest('label') as HTMLLabelElement;
      expect(label.querySelector('button, a')).toBeNull();
    }
    const name = screen.getByRole('radio', { name: /USDC/ }).closest('label')?.textContent ?? '';
    expect(name).not.toMatch(/copy/i);
    expect(screen.getByTestId(`create-fee-${FEE_A}`)).toBeChecked();
  });

  it('says every chain text in the Ledger voice', () => {
    const { container } = render();
    const untrustedParts = container.querySelectorAll('[data-untrusted]');
    expect(untrustedParts.length).toBeGreaterThan(0);
    for (const el of untrustedParts) expect(el.closest('.voice-ledger'), el.textContent ?? '').not.toBeNull();
  });

  it('says a token the wallet holds none of in its row, and a missing contract', () => {
    render();
    expect(screen.getByTestId('create-token-row-0')).toHaveTextContent('You hold none of it today');
    expect(screen.getByTestId('create-token-row-1')).toHaveTextContent('No contract at this address');
  });

  it('a Drill has no fee to pick', () => {
    renderWithProviders(
      <CheckResult
        check={check()}
        drill
        feeToken={null}
        locked={false}
        explorer={null}
        showWarnings={false}
        onFee={vi.fn()}
      />,
    );
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByText('A Drill has no Atropyle fee. You pay only network gas.')).toBeInTheDocument();
  });
});
