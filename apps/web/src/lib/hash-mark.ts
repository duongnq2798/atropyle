/**
 * The pages that keep their subject in the fragment (/vault/ and /verify/: an address; /sign/: a request `p=`) read it
 * only after mount, so their static HTML holds both first paints: the empty state and the frame of what loads.
 * This marks <html data-hash="address" | "request"> before the first paint, and a CSS variant shows the one that
 * fits (first-paint.tsx): the footer stands where it will stay, and the empty state is in the HTML (7B-P1).
 *
 * Self-contained on purpose, like boot.ts: its source text runs inside the inline boot script, so it uses no import,
 * no outer variable and nothing a compiler would rewrite into a helper call.
 */
export function markHash(): void {
  try {
    const path = location.pathname;
    const hash = location.hash;
    let mark: string | null = null;
    if (/^\/(vault|verify)(\/|\/index\.html)?$/.test(path) && /^#0x[0-9a-fA-F]{40}$/.test(hash)) mark = 'address';
    if (/^\/sign(\/|\/index\.html)?$/.test(path) && /(^|[#&?])p=/.test(hash)) mark = 'request';
    if (mark !== null) document.documentElement.setAttribute('data-hash', mark);
  } catch {
    // Nothing marked: the page shows its empty state until it mounts, then what the fragment holds.
  }
}
