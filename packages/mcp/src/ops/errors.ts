import { type AtropyleErrorJson, decodeError, toJson } from '@atropyle/sdk';
import type * as z from 'zod/v4';
import { ErrorOutputSchema } from './schemas';
import { finish } from './untrusted';

export type ErrorOutput = z.output<typeof ErrorOutputSchema>;

export function errorJson(e: unknown): AtropyleErrorJson {
  return toJson(decodeError(e).toJSON()) as AtropyleErrorJson;
}

/** The one shape of every failure: CLI `--json` errors and MCP `isError` results. */
export function errorOutput(e: unknown): ErrorOutput {
  const out = finish(ErrorOutputSchema, { error: errorJson(e), summary: '' });
  // Built after isolation, so an UNKNOWN error contributes only its fixed message.
  return { ...out, summary: `${out.error.code}: ${out.error.message} ${out.error.hint}` };
}
