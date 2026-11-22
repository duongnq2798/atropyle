import { stringify } from '@atropyle/sdk';

export type LogLevel = 'info' | 'warn' | 'error';
type LogFn = (msg: string, data?: Record<string, unknown>) => void;

/** Structured logs. Never pass an email address, a token or a secret in `data`. */
export interface Log {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}

/** One JSON line per entry (Supabase keeps function logs); bigints are written as decimal strings. */
export function jsonLog(write: (line: string) => void = (line) => console.log(line)): Log {
  const at =
    (level: LogLevel): LogFn =>
    (msg, data = {}) =>
      write(stringify({ level, msg, ...data }));
  return { info: at('info'), warn: at('warn'), error: at('error') };
}

export interface MemoryLog extends Log {
  lines: { level: LogLevel; msg: string; data: Record<string, unknown> }[];
}

export function memoryLog(): MemoryLog {
  const lines: MemoryLog['lines'] = [];
  const at =
    (level: LogLevel): LogFn =>
    (msg, data = {}) => {
      lines.push({ level, msg, data });
    };
  return { lines, info: at('info'), warn: at('warn'), error: at('error') };
}

/**
 * A URL: a scheme, `://`, then everything up to whitespace, a quote or a bracket. Trailing punctuation stays outside,
 * so "URL: https://x/k." keeps its full stop.
 */
const URL_PATTERN = /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s"'`<>()[\]{}]*[^\s"'`<>()[\]{}.,;:!?]/gi;

/**
 * The message of an error, with every URL replaced by `<url>` (M6). viem puts the RPC URL in its messages, and an RPC
 * URL can hold an API key; this text goes to the function logs and into the `/tick` response, which `pg_net` keeps.
 */
export const errorText = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(URL_PATTERN, '<url>');
