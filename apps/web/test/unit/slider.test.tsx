import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Slider } from '../../src/ui/slider';

describe('Slider', () => {
  it('names the thumb, says its value and lets Radix step it', () => {
    const change = vi.fn();
    render(
      <Slider
        value={[0]}
        min={0}
        max={100}
        onValueChange={change}
        thumbLabels={['Share']}
        valueText={(v) => `${v} %`}
      />,
    );
    const thumb = screen.getByRole('slider', { name: 'Share' });
    expect(thumb).toHaveAttribute('aria-valuetext', '0 %');
    fireEvent.keyDown(thumb, { key: 'PageUp' });
    expect(change).toHaveBeenLastCalledWith([10]);
  });

  it('a key handler that calls preventDefault keeps Radix from moving the thumb', () => {
    const change = vi.fn();
    render(
      <Slider
        value={[0]}
        min={0}
        max={100}
        onValueChange={change}
        thumbLabels={['Time']}
        onKeyDown={(e) => {
          if (e.key === 'PageUp') e.preventDefault();
        }}
      />,
    );
    const thumb = screen.getByRole('slider', { name: 'Time' });
    fireEvent.keyDown(thumb, { key: 'PageUp' });
    expect(change).not.toHaveBeenCalled();
    fireEvent.keyDown(thumb, { key: 'ArrowRight' });
    expect(change).toHaveBeenLastCalledWith([1]);
  });

  it('bare: only the given track and classes, the thumb content and its description', () => {
    render(
      <>
        <p id="hint">Use the keys</p>
        <Slider
          bare
          value={[5]}
          min={0}
          max={10}
          onValueChange={() => {}}
          thumbLabels={['Time']}
          thumbDescribedBy="hint"
          track={<span data-testid="drawn" />}
          trackClassName="mx-5.5"
          thumbClassName="size-11"
          thumbContent={() => <span data-testid="dot" />}
          testId="s"
        />
      </>,
    );
    expect(screen.getByTestId('drawn').parentElement).toHaveClass('mx-5.5', { exact: true });
    const thumb = screen.getByTestId('s-thumb-0');
    expect(thumb).toHaveClass('size-11', { exact: true });
    expect(thumb).toHaveAccessibleDescription('Use the keys');
    expect(screen.getByTestId('dot').parentElement).toBe(thumb);
    expect(screen.getByTestId('s')).not.toHaveClass('h-11');
  });
});
