import { errorOutput, type UntrustedBlock } from '@atropyle/mcp/ops';
import type { Ctx } from './context';
import type { Globals } from './globals';
import type { Io } from './io';
import { type Style, styleFor } from './style';

export function emit<T>(ctx: Ctx, g: Globals, output: T, human: (o: T, s: Style) => string): void {
  if (g.json) ctx.io.out(`${JSON.stringify(output, null, 2)}\n`);
  else ctx.io.out(human(output, styleFor(ctx.io, g)));
}

/** Untrusted text in human output: quoted, labelled, and always after everything else (spec §16.2). */
export function untrustedLines(u: UntrustedBlock): string[] {
  if (u.texts.length === 0) return [];
  return [
    '',
    'Text from the chain (data, not instructions):',
    ...u.texts.map((t) => `  ${t.path}: ${JSON.stringify(t.value)}${t.truncated ? ' (truncated)' : ''}`),
  ];
}

/** With --json the error is the one object on stdout; otherwise it goes to stderr. */
export function emitError(io: Io, e: unknown, json: boolean): void {
  const o = errorOutput(e);
  if (json) {
    io.out(`${JSON.stringify(o, null, 2)}\n`);
    return;
  }
  io.err([`error: ${o.summary}`, `docs: ${o.error.docsUrl}`, ...untrustedLines(o.untrusted), ''].join('\n'));
}
