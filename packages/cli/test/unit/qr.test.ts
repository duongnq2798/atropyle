import { describe, expect, it } from 'vitest';
import { renderQr } from '../../src/qr';

const widthOf = (qr: string) => Math.max(...qr.split('\n').map((l) => [...l].length));

describe('renderQr', () => {
  it('draws a short link with block characters only', () => {
    const qr = renderQr('https://app.atropyle.test/#/sign?p=abc', 80);
    expect(qr).not.toBeNull();
    expect(qr).toMatch(/^[ ▀▄█\n]+$/u);
    expect(widthOf(qr as string)).toBeLessThanOrEqual(80);
  });

  it('renderQr returns null when the link does not fit', () => {
    const long = `https://app.atropyle.test/#/sign?p=${'a1'.repeat(750)}`;
    expect(renderQr(long, 80)).toBeNull();
    expect(renderQr(long, 400)).not.toBeNull();
    expect(renderQr('x'.repeat(5000), 400)).toBeNull();
  });
});
