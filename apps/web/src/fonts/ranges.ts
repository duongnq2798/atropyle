/** Unicode ranges of the Fontsource 5.3.0 subsets; identical for Fraunces, Inter and JetBrains Mono. */
export const SUBSETS = ['vietnamese', 'latin-ext', 'latin'] as const;
export type Subset = (typeof SUBSETS)[number];

export const RANGES: Record<Subset, string> = {
  vietnamese:
    'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
};

export const FONT_FILES: readonly { file: string; pkg: string }[] = [
  ...SUBSETS.map((s) => ({ file: `fraunces-${s}-standard-normal.woff2`, pkg: 'fraunces' })),
  ...SUBSETS.map((s) => ({ file: `inter-${s}-wght-normal.woff2`, pkg: 'inter' })),
  ...SUBSETS.map((s) => ({ file: `jetbrains-mono-${s}-wght-normal.woff2`, pkg: 'jetbrains-mono' })),
];

/**
 * The Letter voice (spec §18.4.2 T11): Fraunces italic, standard files, Latin and Vietnamese only. A heir letter in
 * a Latin-extended language falls back to the synthesis-free upright face; latin-ext italic would add 50 kB for none
 * of the two languages the app speaks.
 */
export const ITALIC_SUBSETS = ['vietnamese', 'latin'] as const satisfies readonly Subset[];

export const ITALIC_FILES: readonly { file: string; pkg: string }[] = ITALIC_SUBSETS.map((s) => ({
  file: `fraunces-${s}-standard-italic.woff2`,
  pkg: 'fraunces',
}));
