import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HoldButton } from '../../src/ui/hold-button';
import { renderWithProviders } from '../helpers/render';

function setup(props: { disabled?: boolean } = {}) {
  const onConfirm = vi.fn();
  renderWithProviders(
    <HoldButton onConfirm={onConfirm} disabled={props.disabled}>
      Check in
    </HoldButton>,
  );
  return { onConfirm, button: screen.getByRole('button', { name: 'Check in' }) };
}

const press = (el: HTMLElement) => fireEvent.pointerDown(el, { button: 0 });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('HoldButton', () => {
  it('confirms once after a 600 ms hold', () => {
    const { onConfirm, button } = setup();
    press(button);
    expect(button.getAttribute('data-phase')).toBe('holding');
    act(() => vi.advanceTimersByTime(599));
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(button.getAttribute('data-phase')).toBe('done');
    fireEvent.pointerUp(button);
    act(() => vi.advanceTimersByTime(2000));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(button.getAttribute('data-phase')).toBe('idle');
  });

  it('cancels when released early and says to keep holding', () => {
    const { onConfirm, button } = setup();
    press(button);
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerUp(button);
    expect(button.getAttribute('data-phase')).toBe('idle');
    expect(screen.getByText('Keep holding')).toBeTruthy();
    act(() => vi.advanceTimersByTime(2000));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText('Hold to confirm, or press Enter')).toBeTruthy();
  });

  it('cancels when the pointer leaves or the browser takes it over', () => {
    const { onConfirm, button } = setup();
    press(button);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerLeave(button);
    press(button);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.pointerCancel(button);
    act(() => vi.advanceTimersByTime(1000));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('ignores the right mouse button, a plain mouse click, and the long-press menu', () => {
    const { onConfirm, button } = setup();
    fireEvent.pointerDown(button, { button: 2 });
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(button, { detail: 1 });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(fireEvent.contextMenu(button)).toBe(false);
  });

  it('HoldButton keyboard and assistive activation', () => {
    const { onConfirm, button } = setup();
    // Enter confirms at once (spec §4.6) and only once, even when pressed again or auto-repeated.
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(button, { key: 'Enter', repeat: true });
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(2000));

    // Space is a hold: released early it cancels, and the click the browser sends after it does not confirm.
    fireEvent.keyDown(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.keyUp(button, { key: ' ' });
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(2000));

    // Held for 600 ms it confirms.
    fireEvent.keyDown(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(600));
    expect(onConfirm).toHaveBeenCalledTimes(2);
    fireEvent.keyUp(button, { key: ' ' });
    act(() => vi.advanceTimersByTime(2000));

    // A click with detail 0 comes from assistive technology (screen reader, switch access): it confirms.
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).toHaveBeenCalledTimes(3);
  });

  it('does nothing while disabled, and a hold in progress stops when it becomes disabled', () => {
    const onConfirm = vi.fn();
    const { rerender } = renderWithProviders(<HoldButton onConfirm={onConfirm}>Release</HoldButton>);
    const button = screen.getByRole('button', { name: 'Release' });
    press(button);
    act(() => vi.advanceTimersByTime(300));
    rerender(
      <HoldButton onConfirm={onConfirm} disabled>
        Release
      </HoldButton>,
    );
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.keyDown(button, { key: 'Enter' });
    fireEvent.click(button, { detail: 0 });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('describes how to use it', () => {
    const { button } = setup();
    const id = button.getAttribute('aria-describedby');
    expect(id).toBeTruthy();
    expect(document.getElementById(id ?? '')?.textContent).toBe('Hold to confirm, or press Enter');
  });
});
