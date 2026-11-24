export interface IdenticonData {
  /** OKLCH hue, 0–359. */
  hue: number;
  /** 5 × 5, row by row, mirrored left to right. */
  cells: boolean[];
}

/** A face for an address, from its own hex digits (no hashing needed: an address already is one). */
export function identiconOf(address: string): IdenticonData {
  const hex = address
    .toLowerCase()
    .replace(/^0x/, '')
    .replace(/[^0-9a-f]/g, '0')
    .padEnd(40, '0');
  const digit = (i: number) => Number.parseInt(hex[i % hex.length], 16);
  const hue = Number.parseInt(hex.slice(0, 3), 16) % 360;
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row++) {
    const half = [0, 1, 2].map((col) => digit(3 + row * 3 + col) % 2 === 0);
    cells.push(half[0], half[1], half[2], half[1], half[0]);
  }
  return { hue, cells };
}
