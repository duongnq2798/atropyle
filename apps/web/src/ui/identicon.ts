export interface IdenticonData {
  /** OKLCH hue, 0–359. */
  hue: number;
  /** 5 × 5, row by row, mirrored left to right. */
  cells: boolean[];
}

/** FNV-1a over the digits, then murmur3's finaliser, so a change of any one digit moves every bit. */
function mix(hex: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < hex.length; i++) {
    h ^= hex.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A face for an address, from all 40 of its digits. A look-alike made for address poisoning shares the leading and
 * trailing digits, so a face drawn from those would match too. The full address in groups stays the real check.
 */
export function identiconOf(address: string): IdenticonData {
  const hex = address
    .toLowerCase()
    .replace(/^0x/, '')
    .replace(/[^0-9a-f]/g, '0')
    .padEnd(40, '0');
  const h = mix(hex);
  // Bits 0–14 are the 15 cells of the left half and the middle column, bits 15–31 the hue.
  const hue = (h >>> 15) % 360;
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    const half = [0, 1, 2].map((col) => ((h >>> (row * 3 + col)) & 1) === 1);
    cells.push(half[0], half[1], half[2], half[1], half[0]);
  }
  return { hue, cells };
}
