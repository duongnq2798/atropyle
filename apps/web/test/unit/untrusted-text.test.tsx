// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { UntrustedText } from '../../src/ui/components';

afterEach(cleanup);

describe('UntrustedText', () => {
  it('UntrustedText renders markup as text', () => {
    const evil = `<img src=x onerror="window.__pwned=1">${'A'.repeat(10_000)}`;
    const { container } = render(<UntrustedText value={evil} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent?.startsWith('<img src=x onerror=')).toBe(true);
    expect(Array.from(container.textContent ?? '').length).toBe(65);
    expect((globalThis as { __pwned?: number }).__pwned).toBeUndefined();
  });

  it('strips bidi and zero-width characters', () => {
    const { container } = render(<UntrustedText value={'USD\u{202E}evil\u{200B}'} />);
    expect(container.textContent).toBe('USDevil');
  });
});
