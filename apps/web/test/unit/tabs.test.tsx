import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { Tabs } from '../../src/ui/tabs';

function Two() {
  const [value, setValue] = useState('owner');
  return (
    <Tabs
      testId="roles"
      label="Your roles"
      value={value}
      onValueChange={setValue}
      items={[
        { value: 'owner', label: 'Owner', content: <p>owner panel</p> },
        { value: 'heir', label: 'Heir', content: <p>heir panel</p> },
      ]}
    />
  );
}

describe('Tabs', () => {
  it('keeps every panel mounted, so a transaction in one survives a look at another', () => {
    render(<Two />);
    expect(screen.getByRole('tablist', { name: 'Your roles' })).toBeTruthy();
    expect(screen.getByText('heir panel')).toBeTruthy();
    expect(screen.getByTestId('roles-panel-heir').getAttribute('data-state')).toBe('inactive');
    // Radix Tabs selects on mousedown (automatic activation).
    fireEvent.mouseDown(screen.getByTestId('roles-tab-heir'));
    expect(screen.getByTestId('roles-tab-heir').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('roles-panel-heir').getAttribute('data-state')).toBe('active');
    expect(screen.getByText('owner panel')).toBeTruthy();
  });

  it('moves between tabs with the arrow keys, and selects the one it lands on', async () => {
    render(<Two />);
    const owner = screen.getByTestId('roles-tab-owner');
    act(() => owner.focus());
    fireEvent.keyDown(owner, { key: 'ArrowRight' });
    const heir = screen.getByTestId('roles-tab-heir');
    // Radix's roving focus moves focus in a timeout after the key.
    await waitFor(() => expect(document.activeElement).toBe(heir));
    expect(heir.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('roles-panel-heir').getAttribute('data-state')).toBe('active');
  });
});
