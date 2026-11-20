import { renderUnicodeCompact } from 'uqr';

export type QrResult = { qr: string; note: null } | { qr: null; note: string };

/**
 * A QR code of `text` in half-block characters (one column per module), or null with the reason when it cannot be
 * drawn whole: the text is beyond QR capacity, or the code is wider than `columns`. Never a cut-off code.
 */
export function renderQr(text: string, columns: number): QrResult {
  let qr: string;
  try {
    qr = renderUnicodeCompact(text, { ecc: 'L', border: 2 });
  } catch (e) {
    // uqr throws a RangeError when the data exceeds the capacity of the largest QR code.
    if (!(e instanceof RangeError)) throw e;
    return { qr: null, note: 'No QR code: the link is too long for a QR code. Open the link instead.' };
  }
  const width = Math.max(...qr.split('\n').map((line) => [...line].length));
  if (width > columns) {
    return {
      qr: null,
      note: 'No QR code: it is too wide for this terminal. Widen the terminal, or open the link instead.',
    };
  }
  return { qr: qr.replace(/\n+$/, ''), note: null };
}
