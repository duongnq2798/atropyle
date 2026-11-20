import { ERROR_INFO, untrusted as sanitize, toJson } from '@atropyle/sdk';
import type * as z from 'zod/v4';
import { SCHEMA_VERSION, UNTRUSTED_NOTICE, type UntrustedBlockSchema, type UntrustedTextSchema } from './schemas';

export type UntrustedText = z.output<typeof UntrustedTextSchema>;
export type UntrustedBlock = z.output<typeof UntrustedBlockSchema>;

type Raw = { untrusted: true; value: string; truncated: boolean };
const isUntrusted = (v: unknown): v is Raw =>
  typeof v === 'object' &&
  v !== null &&
  (v as { untrusted?: unknown }).untrusted === true &&
  typeof (v as { value?: unknown }).value === 'string';
const isUnknownError = (o: Record<string, unknown>) =>
  o.code === 'UNKNOWN' && typeof o.message === 'string' && typeof o.docsUrl === 'string';
/** The SDK's own UNKNOWN revert: a fixed message, with the chain's reason held apart as an Untrusted in details. */
const hasUntrustedReason = (o: Record<string, unknown>) =>
  typeof o.details === 'object' && o.details !== null && isUntrusted((o.details as { reason?: unknown }).reason);
const pointer = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');

/**
 * Spec §16.2. Returns a copy of `value` where every untrusted string is `null`, and the strings themselves,
 * sanitized again, keyed by the JSON pointer they came from. The message of an UNKNOWN error is untrusted too,
 * as defence in depth: a token contract chooses its own revert reasons. The SDK's own UNKNOWN revert is exempt, because
 * its message is fixed and the reason is already an Untrusted in details.reason.
 */
export function isolateUntrusted<T>(value: T): { value: T; untrusted: UntrustedBlock } {
  const texts: UntrustedText[] = [];
  const walk = (v: unknown, path: string): unknown => {
    if (isUntrusted(v)) {
      const clean = sanitize(v.value, 64);
      texts.push({ path, value: clean.value, truncated: v.truncated || clean.truncated });
      return null;
    }
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}/${i}`));
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(o)) out[k] = walk(x, `${path}/${pointer(k)}`);
      if (isUnknownError(o) && !hasUntrustedReason(o)) {
        const clean = sanitize(o.message, 200);
        texts.push({ path: `${path}/message`, value: clean.value, truncated: clean.truncated });
        out.message = ERROR_INFO.UNKNOWN.message;
      }
      return out;
    }
    return v;
  };
  return { value: walk(value, '') as T, untrusted: { notice: UNTRUSTED_NOTICE, texts } };
}

/** Serializes bigints, isolates untrusted text, adds schemaVersion, and parses with the output schema. */
export function finish<S extends z.ZodType>(schema: S, raw: object): z.output<S> {
  const { value, untrusted } = isolateUntrusted(toJson(raw) as Record<string, unknown>);
  return schema.parse({ ...value, schemaVersion: SCHEMA_VERSION, untrusted }) as z.output<S>;
}
