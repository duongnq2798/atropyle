// The guardian quorum as numbers, apart from the editor: the /create/ preview reads it in its first load.

/** planTemplate('guarded') reads an empty k as a majority. */
export function majorityOf(n: number): number {
  return Math.floor(n / 2) + 1;
}

/** The k the plan will hold: a majority for an empty field, a typed whole number from 1 to n, else null. */
export function effectiveK(text: string, n: number): number | null {
  if (n <= 0) return null;
  const s = text.trim();
  if (s === '') return majorityOf(n);
  const k = Number(s);
  return Number.isInteger(k) && k >= 1 && k <= n ? k : null;
}
