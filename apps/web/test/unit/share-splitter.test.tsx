import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ShareSplitter, TRACK_MAIN } from '../../src/flows/editors/share-splitter';
import { BRANCH_BG } from '../../src/thread/branches';
import { branchWidths } from '../../src/thread/geometry';
import { renderWithProviders } from '../helpers/render';

function Harness({ onChange }: { onChange(shares: number[]): void }) {
  const [shares, setShares] = useState([3_400, 3_300, 3_300]);
  return (
    <ShareSplitter
      shares={shares}
      names={['Heir 1', 'Heir 2', 'Heir 3']}
      testId="split"
      onChange={(s) => {
        setShares(s);
        onChange(s);
      }}
    />
  );
}

describe('ShareSplitter', () => {
  it('moves 1% with an arrow key and stops at 1% with Home', () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    const thumb = screen.getByTestId('split-thumb-0');
    fireEvent.focus(thumb);
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith([3_500, 3_200, 3_300]);
    fireEvent.keyDown(thumb, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith([100, 6_600, 3_300]);
    expect(screen.getByTestId('split-percent-1')).toHaveValue('66');
    expect(thumb).toHaveAttribute('aria-valuetext', 'Heir 1: 1%, Heir 2: 66%');
  });

  it('a typed percent takes from the next heir when the field is left', () => {
    const onChange = vi.fn();
    renderWithProviders(<Harness onChange={onChange} />);
    const field = screen.getByTestId('split-percent-1');
    fireEvent.change(field, { target: { value: '50' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(field);
    expect(onChange).toHaveBeenLastCalledWith([3_400, 5_000, 1_600]);
    expect(screen.getByTestId('split-percent-2')).toHaveValue('16');
  });

  it("paints each part with its heir's branch colour, as thick as that heir's branch", () => {
    renderWithProviders(<Harness onChange={() => {}} />);
    const parts = [...screen.getByTestId('split').querySelectorAll<HTMLElement>('[data-part="share"]')];
    expect(parts.map((p) => p.dataset.branch)).toEqual(['1', '2', '3']);
    for (const [i, p] of parts.entries()) expect(p.className).toContain(BRANCH_BG[i]);
    expect(parts.map((p) => p.style.height)).toEqual(
      branchWidths([3_400, 3_300, 3_300], TRACK_MAIN).map((w) => `${w}px`),
    );
    expect(screen.getByTestId('split-thumb-0')).toHaveAttribute('aria-describedby');
  });

  it('a single heir gets a sentence, not a bar', () => {
    renderWithProviders(<ShareSplitter shares={[10_000]} names={['Heir 1']} testId="one" onChange={() => {}} />);
    expect(screen.getByTestId('one-single')).toHaveTextContent('Heir 1 receives everything.');
    expect(screen.queryByTestId('one')).toBeNull();
  });
});
