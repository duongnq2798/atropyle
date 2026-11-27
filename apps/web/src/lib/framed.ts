/**
 * True when this document is not the top of its tab: a frame inside another page, which could dress the page up and
 * steer the signer's clicks. frame-ancestors cannot be set from a meta tag, so the DeWEB copy is frameable (parked 7A);
 * on Vercel the root vercel.json also sends frame-ancestors 'none'. A parent the browser will not let the page compare
 * counts as a frame.
 */
export function isFramed(win: { readonly top: unknown; readonly self: unknown }): boolean {
  try {
    return win.top !== win.self;
  } catch {
    return true;
  }
}
