import { describe, expect, it } from 'vitest';
import { renderQr } from '../../src/qr';

const widthOf = (qr: string) => Math.max(...qr.split('\n').map((l) => [...l].length));

describe('renderQr', () => {
  it('draws a short link with block characters only', () => {
    const r = renderQr('https://app.atropyle.test/#/sign?p=abc', 80);
    expect(r.note).toBeNull();
    expect(r.qr).toMatch(/^[ ▀▄█\n]+$/u);
    expect(widthOf(r.qr as string)).toBeLessThanOrEqual(80);
  });

  it('renderQr returns no code when the link does not fit, and says why', () => {
    const long = `https://app.atropyle.test/#/sign?p=${'a1'.repeat(750)}`;
    const narrow = renderQr(long, 80);
    expect(narrow.qr).toBeNull();
    expect(narrow.note).toContain('too wide for this terminal');
    expect(renderQr(long, 400).qr).not.toBeNull();
    const huge = renderQr('x'.repeat(5000), 400);
    expect(huge.qr).toBeNull();
    expect(huge.note).toContain('too long for a QR code');
    expect(huge.note).not.toContain('Widen');
  });
});
