// npm run og:image -w apps/web: renders share/og.png, the share card of src/config/share.ts, with Chromium.
// The card uses the site's own fonts (src/fonts/files), its night colours (globals.css, tokens:dark) and the Thread of
// the home hero, drawn by src/thread/geometry.ts. Nothing is fetched: the fonts go in as data URLs.
// Rendering differs a little between systems, so CI checks the committed file (test/unit/share.test.ts), not a rerun.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { SHARE } from '../src/config/share';
import { MAIN_WIDTH, type Point, threadGeometry, VIEW } from '../src/thread/geometry';

const OUT = fileURLToPath(new URL('../share/og.png', import.meta.url));
const font = (file: string) =>
  `data:font/woff2;base64,${readFileSync(new URL(`../src/fonts/files/${file}`, import.meta.url)).toString('base64')}`;

/** tokens:dark of globals.css. */
const NIGHT = {
  bg: '#0b0d12',
  ink: '#ece7dd',
  muted: '#a59f94',
  thread: '#e8b65a',
  line: '#2a303c',
} as const;

const { width: W, height: H } = SHARE.image;
/** The Thread box: the full width of the card, the view scaled by SX across and SY down. */
const BOX = { top: 404, height: 150 } as const;
const SX = W / VIEW.w;
const SY = BOX.height / VIEW.h;

/** The hero's Thread (src/home/hero.tsx): an active vault, 72% of the period left, three check-ins behind it. */
const g = threadGeometry('active', { remaining: 0.72, knots: [0.16, 0.34, 0.52] });
const px = ([x, y]: Point): Point => [x * SX, y * SY];

function threadSvg(): string {
  const scale = `scale(${SX} ${SY})`;
  const course = (d: string, stroke: string, width: number, extra = '') =>
    `<path d="${d}" transform="${scale}" stroke="${stroke}" stroke-width="${width}" vector-effect="non-scaling-stroke" fill="none" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
  const [litFrom, litTo] = [g.litFrom * SX, g.litTo * SX];
  const knots = g.knots
    .map(px)
    .map(
      ([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="${NIGHT.bg}" stroke="${NIGHT.thread}" stroke-width="2.5"/>`,
    )
    .join('');
  const now = g.now ? px(g.now) : null;
  return `<svg width="${W}" height="${BOX.height}" viewBox="0 0 ${W} ${BOX.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="lit"><rect x="${litFrom}" y="0" width="${litTo - litFrom}" height="${BOX.height}"/></clipPath>
    <radialGradient id="halo"><stop offset="0" stop-color="${NIGHT.thread}" stop-opacity="0.55"/><stop offset="1" stop-color="${NIGHT.thread}" stop-opacity="0"/></radialGradient>
  </defs>
  ${course(g.track, NIGHT.line, 2.5)}
  <g clip-path="url(#lit)">
    ${course(g.lit, NIGHT.thread, 14, ' stroke-opacity="0.22"')}
    ${course(g.lit, NIGHT.thread, MAIN_WIDTH * 1.5)}
  </g>
  ${knots}
  ${now ? `<circle cx="${now[0]}" cy="${now[1]}" r="30" fill="url(#halo)"/><circle cx="${now[0]}" cy="${now[1]}" r="9" fill="${NIGHT.thread}"/>` : ''}
</svg>`;
}

/** The site icon (src/app/icon.svg), larger. */
const MARK = `<svg width="52" height="52" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#161a22"/><path d="M2 18c2.5 0 4.5-1 4.5-4v-3a5.5 5.5 0 0 1 11 0v3c0 3 2 4 4.5 4" fill="none" stroke="${NIGHT.thread}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
@font-face { font-family: 'Atropyle Fraunces'; src: url(${font('fraunces-latin-full-normal.woff2')}) format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Atropyle Inter'; src: url(${font('inter-latin-wght-normal.woff2')}) format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Atropyle Mono'; src: url(${font('jetbrains-mono-latin-wght-normal.woff2')}) format('woff2'); font-weight: 100 800; }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
body {
  position: relative;
  background: radial-gradient(900px 420px at 18% 82%, rgba(232, 182, 90, 0.10), transparent 70%), ${NIGHT.bg};
  color: ${NIGHT.ink};
  font-family: 'Atropyle Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.brand { position: absolute; top: 56px; left: 72px; display: flex; align-items: center; gap: 18px; }
.brand span { font-family: 'Atropyle Fraunces', serif; font-size: 38px; font-weight: 600; letter-spacing: -0.01em; }
.chain { position: absolute; top: 72px; right: 72px; font-family: 'Atropyle Mono', monospace; font-size: 19px; color: ${NIGHT.muted}; letter-spacing: 0.04em; }
.copy { position: absolute; top: 146px; left: 72px; right: 72px; }
.eyebrow { font-size: 19px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: ${NIGHT.thread}; }
h1 { margin-top: 18px; font-family: 'Atropyle Fraunces', serif; font-weight: 500; font-size: 84px; line-height: 1.02; letter-spacing: -0.015em; }
h1 em { font-style: normal; color: ${NIGHT.thread}; }
.lead { margin-top: 22px; max-width: 900px; font-size: 27px; line-height: 1.42; color: ${NIGHT.muted}; }
.thread { position: absolute; left: 0; top: ${BOX.top}px; }
.foot { position: absolute; left: 72px; right: 72px; bottom: 52px; display: flex; justify-content: space-between; align-items: baseline; font-family: 'Atropyle Mono', monospace; font-size: 23px; }
.cmd b { color: ${NIGHT.thread}; font-weight: 500; }
.site { color: ${NIGHT.muted}; }
</style></head><body>
<div class="brand">${MARK}<span>${SHARE.siteName}</span></div>
<div class="chain">X Layer · chain 196</div>
<div class="copy">
  <p class="eyebrow">Inheritance and wallet recovery on X Layer</p>
  <h1>A circuit decides,<br><em>not an admin.</em></h1>
  <p class="lead">Check in now and then. If you stop, your heirs can claim.</p>
</div>
<div class="thread">${threadSvg()}</div>
<div class="foot"><span class="cmd"><b>$</b> npx atropyle verify</span><span class="site">atropyle.xyz</span></div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const faces = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length);
  if (faces < 3) throw new Error(`only ${faces} of the 3 fonts loaded`);
  writeFileSync(OUT, await page.screenshot({ type: 'png' }));
  console.log(`share/og.png: ${W}x${H}`);
} finally {
  await browser.close();
}
