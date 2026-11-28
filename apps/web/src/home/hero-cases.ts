/**
 * The three questions of the hero (spec §18.4.3 Task 5′), in lane order: bit j of a wire's signature (WIRE_V in
 * netlist-geometry.ts) is its value in HERO_CASES[j]. The DOM writes each as one letter: `data-v` on the wires, the
 * radio values and the section's `data-ask`.
 */
export const HERO_CASES = ['alive', 'silent', 'liar'] as const;
export type HeroCase = (typeof HERO_CASES)[number];
export const LETTER = { alive: 'a', silent: 's', liar: 'l' } as const satisfies Record<HeroCase, string>;

/** The question of a radio value; undefined for anything else. */
export function caseOf(letter: string): HeroCase | undefined {
  return HERO_CASES.find((c) => LETTER[c] === letter);
}
