import * as util from 'node:util';
import type { Io } from './io';

export interface Style {
  bold(s: string): string;
  dim(s: string): string;
  red(s: string): string;
  green(s: string): string;
  yellow(s: string): string;
}

const plain = (s: string) => s;
export const PLAIN: Style = { bold: plain, dim: plain, red: plain, green: plain, yellow: plain };

/** Colors only on a terminal, never with --no-color, NO_COLOR or TERM=dumb. util.styleText needs Node.js 20.12. */
export function styleFor(io: Io, g: { color: boolean }): Style {
  const styleText = (util as { styleText?: typeof util.styleText }).styleText;
  if (!g.color || !io.isTTY || io.env.NO_COLOR || io.env.TERM === 'dumb' || !styleText) return PLAIN;
  const s = (f: Parameters<typeof util.styleText>[0]) => (t: string) => styleText(f, t, { validateStream: false });
  return { bold: s('bold'), dim: s('dim'), red: s('red'), green: s('green'), yellow: s('yellow') };
}
