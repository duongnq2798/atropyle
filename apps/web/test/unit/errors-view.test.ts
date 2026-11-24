import { AtropyleError, DOCS_BASE_URL, ERROR_CODES, ERROR_INFO } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { errorView, isErrorJson, localDocs } from '../../src/tx/impl/errors-view';

describe('errorView', () => {
  it('uses the SDK message, hint and docs link', () => {
    const v = errorView(new AtropyleError('INVALID_HEIRS'), null);
    expect(v).toEqual({
      code: 'INVALID_HEIRS',
      message: ERROR_INFO.INVALID_HEIRS.message,
      hint: ERROR_INFO.INVALID_HEIRS.hint,
      docsUrl: `${DOCS_BASE_URL}/reference/errors.html#invalid_heirs`,
    });
    expect(errorView(new AtropyleError('NOT_OWNER'), './docs/').docsUrl).toBe('./docs/reference/errors.html#not_owner');
  });

  it('words every hint for this site: no CLI command or flag, code name or repo script', () => {
    // The SDK's hints are written for the CLI ("pass another endpoint with --rpc", "`npm run devnet`"); a reader
    // of this site can do none of that. A backtick marks a command or a code name, which the page prints as is.
    const cli = ERROR_CODES.flatMap((code) => {
      const hints = [
        errorView(new AtropyleError(code), null).hint,
        errorView(new AtropyleError(code).toJSON(), null).hint,
      ];
      return hints.filter((h) => /--|npm run|scripts\/|`/u.test(h)).map((h) => `${code}: ${h}`);
    });
    expect(cli, `hints this site cannot follow:\n${cli.join('\n')}`).toEqual([]);
    expect(errorView(new AtropyleError('RPC_RATE_LIMITED'), null).hint).toBe('Wait a moment, then try again.');
    expect(errorView(new AtropyleError('RPC_UNAVAILABLE'), null).hint).toBe('Check your connection, then try again.');
  });

  it('does not call the policy source audited: Atropyle is unaudited (ruling R21)', () => {
    const v = errorView(new AtropyleError('POLICY_MISMATCH'), null);
    expect(v.message).toBe('The on-chain policy does not match the published source.');
    expect(v.message).not.toMatch(/(?<!un)audited/iu);
    // A message that names the mismatch stays as the SDK wrote it.
    const shape = new AtropyleError('POLICY_MISMATCH', {
      message: 'The policy circuit has shape 1/1/1; expected 23/3/3.',
    });
    expect(errorView(shape, null).message).toBe(shape.message);
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
