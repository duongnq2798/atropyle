import { describe, expect, it } from 'vitest';
import { errorDocsUrl } from '../../src/index';

describe('package skeleton', () => {
  it('builds error docs links from one base url', () => {
    expect(errorDocsUrl('NOT_OWNER')).toBe(
      'https://duongnq2798.github.io/atropyle/docs/reference/errors.html#not_owner',
    );
  });
});
