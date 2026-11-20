import { renderUnicodeCompact } from 'uqr';

export const QR_SKIPPED_NOTE =
  'No QR code: the link does not fit in this terminal as a QR code. Open the link instead, or widen the terminal.';

/**
 * A QR code of `text` in half-block characters (one column per module), or null when it cannot be drawn whole:
 * the text is beyond QR capacity, or the code is wider than `columns`. Never a cut-off code.
 */
export function renderQr(text: string, columns: number): string | null {
  let qr: string;
  try {
    qr = renderUnicodeCompact(text, { ecc: 'L', border: 2 });
  } catch {
    return null;
  }
  const width = Math.max(...qr.split('\n').map((line) => [...line].length));
  return width <= columns ? qr.replace(/\n+$/, '') : null;
}
