import { describe, expect, it } from 'vitest';
import { errorDocsUrl, VERSION } from '../../src/index';

describe('package skeleton', () => {
  it('exposes the version', () => {
    expect(VERSION).toBe('0.1.0');
  });

  it('builds error docs links from one base url', () => {
    expect(errorDocsUrl('NOT_OWNER')).toBe(
      'https://duongnq2798.github.io/atropyle/docs/reference/errors.html#not_owner',
    );
  });
});
