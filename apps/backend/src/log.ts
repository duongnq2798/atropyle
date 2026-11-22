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

export const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
