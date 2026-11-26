import type { PlanIssue } from '@atropyle/sdk';
import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AddressInput } from '../../src/flows/editors/address-input';
import { effectiveK, type GuardianFields, GuardiansEditor } from '../../src/flows/editors/guardians-editor';
import { HeirsEditor } from '../../src/flows/editors/heirs-editor';
import { IssueList } from '../../src/flows/editors/issue-list';
import { TimingEditor } from '../../src/flows/editors/timing-editor';
import * as flows from '../../src/flows/impl';
import type { HeirRow, TimingForm } from '../../src/flows/impl/create-form';
import { evenSplit } from '../../src/flows/shares';
import { messages as issueMessages } from '../../src/messages/issues.messages';
import { BRANCH_BG } from '../../src/thread/branches';
import { renderWithProviders } from '../helpers/render';
import { PEOPLE } from './fixtures';

const issue = (path: string, code: PlanIssue['code']): PlanIssue => ({ path, code, message: `${path}: sdk` });

function Address(p: { initial: string; duplicate?: boolean; error?: string }) {
  const [v, setV] = useState(p.initial);
  return (
    <AddressInput
      flows={flows}
      label="Heir 1 wallet"
      value={v}
      onChange={setV}
      testId="a"
      duplicate={p.duplicate}
      error={p.error}
    />
  );
}

describe('AddressInput', () => {
  it('names a mistake once the field holds a whole address, and says it in its live region', () => {
    renderWithProviders(<Address initial="" />);
    const live = screen.getByTestId('a-live');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live.textContent).toBe('');
    const field = screen.getByTestId('a');
    fireEvent.change(field, { target: { value: PEOPLE.heirA.slice(0, 20) } });
    expect(field).not.toHaveAttribute('data-issue');
    // One capital lowered: still mixed case, so the checksum breaks.
    fireEvent.change(field, {
      target: { value: `${PEOPLE.heirA.slice(0, 41)}${PEOPLE.heirA.slice(41).toLowerCase()}` },
    });
    expect(field).toHaveAttribute('data-issue', 'addrChecksum');
    expect(live.textContent).toBe(
      'The capital letters do not match this address, so one character may be wrong. Copy it again from the wallet.',
    );
  });

  it('names a short mistake only once the field is left', () => {
    renderWithProviders(<Address initial="" />);
    const field = screen.getByTestId('a');
    fireEvent.change(field, { target: { value: '0x12' } });
    expect(field).not.toHaveAttribute('data-issue');
    fireEvent.blur(field);
    expect(field).toHaveAttribute('data-issue', 'addrInvalid');
  });

  it('shows a valid address checksummed, drawn as every address is: the Ledger voice, in groups of four', () => {
    renderWithProviders(<Address initial={PEOPLE.heirA.toLowerCase()} />);
    const field = screen.getByTestId('a');
    expect(field).not.toHaveAttribute('data-issue');
    // A screen reader hears the lead and the address once, whole: the drawn groups are aria-hidden.
    expect(field).toHaveAccessibleDescription(
      `Compare it group by group with the wallet it belongs to: ${PEOPLE.heirA}`,
    );
    const hint = document.getElementById(field.getAttribute('aria-describedby') ?? '');
    const drawn = hint?.querySelector<HTMLElement>(`[data-address="${PEOPLE.heirA}"]`);
    const groups = drawn?.querySelector<HTMLElement>('[data-part="groups"]');
    expect(groups).toHaveClass('voice-ledger');
    expect(groups).toHaveAttribute('aria-hidden', 'true');
    expect([...(groups?.querySelectorAll(':scope > span') ?? [])].map((s) => s.textContent)).toEqual([
      '0x',
      '3C44',
      'CdDd',
      'B6a9',
      '00fa',
      '2b58',
      '5dd2',
      '99e0',
      '3d12',
      'FA42',
      '93BC',
    ]);
    // A hint, not a card: no copy button and no face.
    expect(drawn?.querySelector('button')).toBeNull();
    expect(drawn?.querySelector('svg')).toBeNull();
  });

  it('leads the address in Vietnamese', () => {
    renderWithProviders(<Address initial={PEOPLE.heirA} />, { lang: 'vi' });
    expect(screen.getByTestId('a')).toHaveAccessibleDescription(
      `Đối chiếu từng cụm với ví của người đó: ${PEOPLE.heirA}`,
    );
  });

  it('lets the plan check win, and keeps its live region quiet then', () => {
    renderWithProviders(<Address initial={PEOPLE.heirA} duplicate error="This is already in the list." />);
    expect(screen.getByTestId('a')).toHaveAttribute('data-issue', 'plan');
    expect(screen.getByText('This is already in the list.')).toBeInTheDocument();
    expect(screen.getByTestId('a-live').textContent).toBe('');
  });
});

describe('IssueList', () => {
  it('is an alert region from the first paint, empty until there is something to say', () => {
    const view = renderWithProviders(<IssueList flows={flows} drill={false} issues={[]} testId="list" />);
    const list = screen.getByTestId('list');
    expect(list).toHaveAttribute('role', 'alert');
    expect(list.textContent).toBe('');
    view.rerender(
      <IssueList flows={flows} drill={false} issues={[issue('heirs[1].account', 'INVALID_ADDRESS')]} testId="list" />,
    );
    expect(screen.getByTestId('list')).toBe(list);
    const li = list.querySelector('li[data-path="heirs[1].account"][data-code="INVALID_ADDRESS"]');
    expect(li?.textContent).toBe('Heir 2 wallet: This is not a valid wallet address.');
  });

  it('says each issue in Vietnamese, with the field it names', () => {
    renderWithProviders(
      <IssueList
        flows={flows}
        drill
        issues={[issue('timing.period', 'PERIOD_MIN'), issue('k', 'K_RANGE')]}
        testId="list"
      />,
      { lang: 'vi' },
    );
    const items = [...screen.getByTestId('list').querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual([
      'Điểm danh mỗi: Hai lần điểm danh phải cách nhau ít nhất 1 phút.',
      'Cần bao nhiêu người giám hộ đồng ý: Hãy chọn một số nguyên, không lớn hơn số người giám hộ.',
    ]);
  });

  it('fills every number from LIMITS, in both languages, for a Drill and for a real vault', () => {
    const codes = Object.keys(issueMessages.en) as PlanIssue['code'][];
    expect(codes).toHaveLength(27);
    for (const lang of ['en', 'vi'] as const)
      for (const drill of [true, false]) {
        const { unmount } = renderWithProviders(
          <IssueList flows={flows} drill={drill} issues={codes.map((c) => issue('version', c))} testId="list" />,
          { lang },
        );
        expect(screen.getByTestId('list').textContent, `${lang} ${drill}`).not.toMatch(/[{}]/);
        unmount();
      }
    renderWithProviders(
      <IssueList
        flows={flows}
        drill={false}
        issues={[issue('heirs', 'HEIRS_COUNT'), issue('timing.window', 'WINDOW_MIN')]}
        testId="list"
      />,
    );
    const items = [...screen.getByTestId('list').querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual([
      `Heirs: List at least one heir and at most ${flows.LIMITS.maxHeirs}.`,
      'Alarm length: The alarm must last at least 3 days.',
    ]);
  });
});

function Heirs(p: { issues?: PlanIssue[]; showIssues?: boolean; onRemove?(i: number): void }) {
  const [rows, setRows] = useState<HeirRow[]>([{ account: PEOPLE.heirA, percent: '' }]);
  return (
    <HeirsEditor
      flows={flows}
      rows={rows}
      issues={p.issues ?? []}
      showIssues={p.showIssues ?? false}
      testId="h"
      onChange={setRows}
      onRemove={p.onRemove ?? (() => {})}
    />
  );
}

describe('HeirsEditor', () => {
  it('adds heirs with an even split up to the limit, each painted with its branch colour', () => {
    renderWithProviders(<Heirs />);
    expect(screen.getByTestId('h-shares-single')).toBeInTheDocument();
    expect(screen.queryByTestId('h-remove-heir-0')).toBeNull();
    const max = flows.LIMITS.maxHeirs;
    for (let n = 2; n <= max; n++) fireEvent.click(screen.getByTestId('h-add-heir'));
    expect(screen.queryByTestId('h-add-heir')).toBeNull();
    const percents = Array.from(
      { length: max },
      (_, i) => (screen.getByTestId(`h-shares-percent-${i}`) as HTMLInputElement).value,
    );
    expect(percents).toEqual(evenSplit(max).map((b) => String(b / 100)));
    const parts = [...screen.getByTestId('h-shares').querySelectorAll<HTMLElement>('[data-part="share"]')];
    expect(parts.map((p) => BRANCH_BG.find((c) => p.className.includes(c)))).toEqual([...BRANCH_BG]);
  });

  it('asks the page to remove a heir, and names plan issues only once the user tried to move on', () => {
    const onRemove = vi.fn();
    const list = [issue('heirs[0].account', 'HEIR_IS_OWNER')];
    const view = renderWithProviders(<Heirs issues={list} onRemove={onRemove} />);
    fireEvent.click(screen.getByTestId('h-add-heir'));
    fireEvent.click(screen.getByTestId('h-remove-heir-1'));
    expect(onRemove).toHaveBeenCalledWith(1);
    expect(screen.queryByText('Your own wallet cannot be an heir.')).toBeNull();
    view.rerender(<Heirs issues={list} showIssues onRemove={onRemove} />);
    expect(screen.getByText('Your own wallet cannot be an heir.')).toBeInTheDocument();
    expect(screen.getByTestId('h-heir-0-account')).toHaveAttribute('data-issue', 'plan');
  });
});

function Guardians(p: { window?: number | null }) {
  const [v, setV] = useState<GuardianFields>({
    guardians: [PEOPLE.g1, PEOPLE.g2, PEOPLE.heirB],
    k: '',
    recoveryEnabled: false,
  });
  return (
    <GuardiansEditor
      flows={flows}
      value={v}
      issues={[]}
      showIssues={false}
      testId="g"
      recoveryWindow={p.window === undefined ? flows.PRESETS.drill.window : p.window}
      onChange={setV}
    />
  );
}

describe('GuardiansEditor', () => {
  it('says what guardians can do once recovery is ticked, in a polite region that was there before', () => {
    renderWithProviders(<Guardians />);
    const power = screen.getByTestId('g-recovery-power');
    expect(power).toHaveAttribute('aria-live', 'polite');
    expect(power.textContent).toBe('');
    expect(screen.getByText('Empty means a majority: 2 of 3.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('g-recovery'));
    expect(power.textContent).toBe(
      'Wallet recovery is on: 2 of 3 guardians acting together can move 100% of the covered assets to any wallet they choose. The owner can stop it only by checking in before the alarm window of 2 minutes ends.',
    );
    fireEvent.change(screen.getByTestId('g-k'), { target: { value: '3' } });
    expect(power.textContent).toContain('3 of 3 guardians');
    fireEvent.change(screen.getByTestId('g-k'), { target: { value: '9' } });
    expect(power.textContent).toMatch(/^Wallet recovery is on: the number of guardians you set above/);
    fireEvent.click(screen.getByTestId('g-recovery'));
    expect(power.textContent).toBe('');
  });

  it('says it in Vietnamese with "điểm danh", and without numbers while the window is unknown', () => {
    const vi1 = renderWithProviders(<Guardians />, { lang: 'vi' });
    fireEvent.click(screen.getByTestId('g-recovery'));
    expect(screen.getByTestId('g-recovery-power').textContent).toBe(
      'Đã bật khôi phục ví: 2 trên 3 người giám hộ cùng hành động thì có thể chuyển 100% tài sản vault đang phủ sang bất kỳ ví nào họ chọn. Chủ vault chỉ có thể ngăn lại bằng cách điểm danh trước khi hết thời gian báo động 2 phút.',
    );
    vi1.unmount();
    renderWithProviders(<Guardians window={null} />);
    fireEvent.click(screen.getByTestId('g-recovery'));
    expect(screen.getByTestId('g-recovery-power').textContent).toMatch(
      /^Wallet recovery is on: the number of guardians/,
    );
  });

  it('keeps recovery a native checkbox, out of sight, and draws the switch beside it', () => {
    renderWithProviders(<Guardians />);
    const box = screen.getByRole('checkbox', { name: /^Let guardians move this vault to a new wallet/ });
    expect(box).toBe(screen.getByTestId('g-recovery'));
    expect(box).not.toBeChecked();
    // Chromium's native box in night is a filled grey square that reads as disabled: the product draws its own.
    expect(box).toHaveClass('peer', 'sr-only');
    const drawn = box.nextElementSibling;
    expect(drawn).toHaveAttribute('aria-hidden', 'true');
    expect(drawn).toHaveAttribute('data-part', 'switch');
    fireEvent.click(box.closest('label') as HTMLElement);
    expect(box).toBeChecked();
  });

  it('reads k as the plan will: a majority when empty, a whole number from 1 to n, else nothing', () => {
    expect(effectiveK('', 3)).toBe(2);
    expect(effectiveK(' 3 ', 3)).toBe(3);
    expect(effectiveK('1', 1)).toBe(1);
    for (const text of ['0', '4', '2.5', 'x']) expect(effectiveK(text, 3), text).toBeNull();
    expect(effectiveK('', 0)).toBeNull();
  });
});

function Timing({ drill }: { drill: boolean }) {
  const [v, setV] = useState<TimingForm>({
    preset: drill ? 'drill' : 'sixMonths',
    period: '',
    threshold: '',
    window: '',
  });
  return (
    <TimingEditor flows={flows} value={v} drill={drill} issues={[]} showIssues={false} testId="t" onChange={setV} />
  );
}

describe('TimingEditor', () => {
  it('offers a Drill only its minute timing, and a custom timing starts from it with minutes as the floor', () => {
    renderWithProviders(<Timing drill />);
    expect(screen.queryByTestId('t-preset-sixMonths')).toBeNull();
    expect(
      screen.getByText(
        'Check in every 1 minute. After 2 missed check-ins the alarm can go off, and your heirs receive 2 minutes later unless you check in.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('t-preset-custom'));
    expect(screen.getByTestId('t-period')).toHaveValue('1m');
    expect(screen.getByTestId('t-threshold')).toHaveValue('2');
    expect(screen.getByTestId('t-window')).toHaveValue('2m');
    expect(screen.getAllByText('At least 1 minute.')).toHaveLength(2);
    expect(screen.getByText(`At most ${flows.LIMITS.maxThreshold}.`)).toBeInTheDocument();
  });

  it('keeps each preset a native radio, out of sight, and draws the radio and the picked card from it', () => {
    renderWithProviders(<Timing drill={false} />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.dataset.testid)).toEqual([
      't-preset-sixMonths',
      't-preset-twelveMonths',
      't-preset-custom',
    ]);
    for (const r of radios) {
      expect(r).toHaveClass('peer', 'sr-only');
      expect(r.nextElementSibling).toHaveAttribute('aria-hidden', 'true');
      expect(r.nextElementSibling).toHaveAttribute('data-part', 'radio');
      // The card follows its input (has-checked), never a branch in the code that could drift from it.
      expect(r.closest('label')).toHaveClass('has-checked:border-thread', 'has-focus-visible:outline-2');
    }
    expect(screen.getByRole('radio', { name: /^About six months/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /^About a year/ }).closest('label') as HTMLElement);
    expect(screen.getByTestId('t-preset-twelveMonths')).toBeChecked();
    expect(screen.getByTestId('t-preset-sixMonths')).not.toBeChecked();
  });

  it('offers a real vault six or twelve months, with floors of a day and three days', () => {
    renderWithProviders(<Timing drill={false} />);
    expect(screen.queryByTestId('t-preset-drill')).toBeNull();
    expect(
      screen.getByText(
        'Check in every 30 days. After 6 missed check-ins the alarm can go off, and your heirs receive 14 days later unless you check in.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('t-preset-custom'));
    expect(screen.getByText('At least 1 day.')).toBeInTheDocument();
    expect(screen.getByText('At least 3 days.')).toBeInTheDocument();
  });
});
