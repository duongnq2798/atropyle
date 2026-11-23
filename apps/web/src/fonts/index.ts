import localFont from 'next/font/local';

// Decision 8: three subsets per family share one family name, each with its own unicode-range, so a page loads
// only the files it needs. next/font reads options statically, so every value is a literal; test/unit/fonts.test.ts
// compares the ranges with src/fonts/ranges.ts. Only the Latin subsets of Fraunces and Inter preload.
// Turbopack names next/font families after the JS identifier, not after `declarations`, so its generated family and
// fallback stacks would name no face that exists. globals.css therefore names the families ('Atropyle Fraunces', ...)
// and owns the metric-adjusted fallback faces, and every call sets adjustFontFallback: false and no fallback array.

const frauncesVi = localFont({
  src: './files/fraunces-vietnamese-full-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-fraunces-vi',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Fraunces'" },
    {
      prop: 'unicode-range',
      value:
        'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
    },
  ],
});

const frauncesExt = localFont({
  src: './files/fraunces-latin-ext-full-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-fraunces-ext',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Fraunces'" },
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    },
  ],
});

const fraunces = localFont({
  src: './files/fraunces-latin-full-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: true,
  adjustFontFallback: false,
  variable: '--font-fraunces',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Fraunces'" },
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    },
  ],
});

const interVi = localFont({
  src: './files/inter-vietnamese-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-inter-vi',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Inter'" },
    {
      prop: 'unicode-range',
      value:
        'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
    },
  ],
});

const interExt = localFont({
  src: './files/inter-latin-ext-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-inter-ext',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Inter'" },
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    },
  ],
});

const inter = localFont({
  src: './files/inter-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  preload: true,
  adjustFontFallback: false,
  variable: '--font-inter',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Inter'" },
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    },
  ],
});

const monoVi = localFont({
  src: './files/jetbrains-mono-vietnamese-wght-normal.woff2',
  weight: '100 800',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-jetbrains-vi',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Mono'" },
    {
      prop: 'unicode-range',
      value:
        'U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB',
    },
  ],
});

const monoExt = localFont({
  src: './files/jetbrains-mono-latin-ext-wght-normal.woff2',
  weight: '100 800',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-jetbrains-ext',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Mono'" },
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
    },
  ],
});

const mono = localFont({
  src: './files/jetbrains-mono-latin-wght-normal.woff2',
  weight: '100 800',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  variable: '--font-jetbrains',
  declarations: [
    { prop: 'font-family', value: "'Atropyle Mono'" },
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
    },
  ],
});

/** Every call's variable class goes on <html>, so each subset's @font-face ships and the three tokens resolve. */
export const fontVariables = [frauncesVi, frauncesExt, fraunces, interVi, interExt, inter, monoVi, monoExt, mono]
  .map((f) => f.variable)
  .join(' ');
