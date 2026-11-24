import { AtropyleError, DOCS_BASE_URL, ERROR_INFO } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { errorView, isErrorJson, localDocs } from '../../src/tx/impl/errors-view';

describe('errorView', () => {
  it('uses the SDK message, hint and docs link', () => {
    const v = errorView(new AtropyleError('NOT_OWNER'), null);
    expect(v).toEqual({
      code: 'NOT_OWNER',
      message: ERROR_INFO.NOT_OWNER.message,
      hint: ERROR_INFO.NOT_OWNER.hint,
      docsUrl: `${DOCS_BASE_URL}/reference/errors.html#not_owner`,
    });
    expect(errorView(new AtropyleError('NOT_OWNER'), './docs/').docsUrl).toBe('./docs/reference/errors.html#not_owner');
  });

  it('decodes unknown errors and keeps JSON errors from the worker', () => {
    expect(errorView(new Error('boom'), null).code).toBe('UNKNOWN');
    const json = new AtropyleError('POLICY_UNAVAILABLE').toJSON();
    expect(errorView(json, null)).toMatchObject({ code: 'POLICY_UNAVAILABLE', message: json.message });
  });

  it('never takes the docs link from the message it was given', () => {
    const json = { ...new AtropyleError('NOT_OWNER').toJSON(), docsUrl: 'https://evil.example/x' };
    expect(errorView(json, null).docsUrl).toBe(`${DOCS_BASE_URL}/reference/errors.html#not_owner`);
  });

  it('accepts only own error codes as JSON errors', () => {
    const fake = { code: 'toString', message: 'm', hint: 'h' };
    expect(isErrorJson(fake)).toBe(false);
    expect(errorView(fake, null).code).toBe('UNKNOWN');
  });

  it('rewrites only links under the docs base', () => {
    expect(localDocs('https://example.com/x', './docs/')).toBe('https://example.com/x');
    expect(localDocs(`${DOCS_BASE_URL}/guide/drill.html`, './docs/')).toBe('./docs/guide/drill.html');
  });
});
