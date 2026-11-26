import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from '../../src/ui/empty-state';

describe('EmptyState', () => {
  it('writes its title as a paragraph unless told otherwise', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByText('Nothing here').tagName).toBe('P');
  });

  it('writes its title as the heading `as` names, inside the test id', () => {
    render(<EmptyState as="h2" title="Nothing here" testId="empty" />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Nothing here' });
    expect(screen.getByTestId('empty')).toContainElement(heading);
  });
});
