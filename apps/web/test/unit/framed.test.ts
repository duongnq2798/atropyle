import { describe, expect, it } from 'vitest';
import { isFramed } from '../../src/lib/framed';

describe('isFramed', () => {
  it('is false for the top document of a tab', () => {
    const w: { top: unknown; self: unknown } = { top: null, self: null };
    w.top = w;
    w.self = w;
    expect(isFramed(w)).toBe(false);
  });

  it('is true inside a frame of another page', () => {
    expect(isFramed({ top: {}, self: {} })).toBe(true);
  });

  it('is true when the browser will not let the page compare its parent', () => {
    const w = {
      self: {},
      get top(): unknown {
        throw new Error('SecurityError');
      },
    };
    expect(isFramed(w)).toBe(true);
  });
});
