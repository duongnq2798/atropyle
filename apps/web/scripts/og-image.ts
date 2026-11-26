// npm run og:image -w apps/web: renders, in Chromium, the share card of src/config/share.ts into
// share/<SHARE.image.path>, and the app icons of scripts/lib/app-icons.ts from src/app/icon.svg.
// The card is the hero on vellum (spec §18.4.3 Task 11, the woven title on the warp): the site's own fonts
// (src/fonts/files), the colours of tokens:light in globals.css, the real policy circuit and its thread
// (src/home/netlist-geometry.ts, weave-path.ts), and a title thread drawn the way title-weave.tsx draws the hero's.
// Every visible character must have a glyph in the latin files the card loads, or the run fails: a symbol the
// subsets lack is drawn as a lucide icon in SVG, as on the site. Nothing is fetched: the fonts and the icon go in as
// data URLs, and any request fails the run. Rendering differs a
// little between systems, so CI checks the committed files (test/unit/share.test.ts, app-icons.test.ts), not a rerun.
// A changed card needs a new SHARE.image.path first: X keeps a card by its image URL.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from '@playwright/test';
import { SHARE } from '../src/config/share';
import { RANGES } from '../src/fonts/ranges';
import { THREAD, VIEW } from '../src/home/netlist-geometry';
import { dotsPath, threadPath, wirePaths } from '../src/home/weave-path';
import { missingGlyphs } from '../test/helpers/glyphs';
import { APP_ICONS, ICON_SVG } from './lib/app-icons';
import { SHARE_IMAGE_FILE } from './lib/share-image';
import { themeTokens } from './lib/tokens';

const font = (file: string) =>
  `data:font/woff2;base64,${readFileSync(new URL(`../src/fonts/files/${file}`, import.meta.url)).toString('base64')}`;
/** The chain the card names, from the deployment the site reads (deployments/xlayer.json). */
const { chainId } = JSON.parse(readFileSync(new URL('../../../deployments/xlayer.json', import.meta.url), 'utf8')) as {
  chainId: number;
};
const HOST = new URL(SHARE.origin).host;
/**
 * The browser proof as a link that works on both apps: the legacy app (production until the v2 cutover) serves the
 * hash route, and web v2 sends it on to /proof/ (legacyTarget in src/theme/boot.ts).
 */
const PROOF_HASH = '/#/proof';

const VELLUM = themeTokens('light');
const NIGHT = themeTokens('dark');
const { width: W, height: H } = SHARE.image;
/** The circuit at its own proportions, across the card's full width, its bottom 86 px above the card's. */
const WARP = { top: 24, height: Math.round((W * VIEW.h) / VIEW.w) } as const;
/** Where the text column ends: the circuit and its thread stay at 12 % behind it, as in the hero from 64rem. */
const TEXT_END = 700;
/** The release output, where the thread ends: its last node before the right edge (weave-svg.tsx, PIN). */
const PIN = { x: THREAD[THREAD.length - 4], y: THREAD[THREAD.length - 3] };
/**
 * The title's own thread, in a frame from the bottom of line 1 to the bottom of the title, as title-weave.tsx frames
 * the hero's. It rides the leading under line 1, then dives to the right of the shorter line 2: it never crosses a
 * letter of "not an admin.", since at the size of an X card a line through those words reads as a strike-through.
 */
const TITLE_D = 'M0 3C34 3 74 3 88 30S97 86 100 100';
/** The code points of the latin subset, the only files the card loads (src/fonts/ranges.ts). */
const LATIN = RANGES.latin.split(',').map((part) => {
  const [a, b] = part.replace(/^U\+/i, '').split('-');
  return [Number.parseInt(a, 16), Number.parseInt(b ?? a, 16)] as const;
});
/** Lucide ArrowRight: the site draws arrows as icons, never as a character the self-hosted fonts lack. */
const ARROW = `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="${VELLUM.thread}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;

/**
 * Fails the run when a visible character of the page falls outside the latin range, or lacks a glyph in any of the
 * three families (test/helpers/glyphs.ts): Chromium would draw it in a system font, a different one on each machine.
 */
async function assertOwnGlyphs(page: Page): Promise<void> {
  // biome-ignore lint/performance/useDomNodeTextContent: innerText is the text as drawn, after text-transform (the eyebrow is uppercase), which is what needs glyphs.
  const text = await page.evaluate(() => document.body.innerText);
  const outside = [...new Set(Array.from(text))]
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp > 0x20 && !LATIN.some(([a, b]) => cp >= a && cp <= b);
    })
    .map((ch) => `U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')} ${ch} (not latin)`);
  const missing = [...outside, ...missingGlyphs(text)];
  if (missing.length > 0) throw new Error(`the self-hosted fonts cannot draw: ${missing.join(', ')}`);
}

function circuitSvg(): string {
  const wires = wirePaths()
    .map((p) => `<path d="${p.d}"/>`)
    .join('');
  return `<svg viewBox="0 0 ${VIEW.w} ${VIEW.h}" preserveAspectRatio="none" width="${W}" height="${WARP.height}" xmlns="http://www.w3.org/2000/svg">
  <g fill="none" stroke="${VELLUM['line-strong']}" stroke-width="1" stroke-opacity="0.55">${wires}</g>
  <path d="${dotsPath()}" fill="none" stroke="${VELLUM['ink-muted']}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
</svg>`;
}

function threadSvg(): string {
  const d = threadPath();
  return `<svg viewBox="0 0 ${VIEW.w} ${VIEW.h}" preserveAspectRatio="none" width="${W}" height="${WARP.height}" xmlns="http://www.w3.org/2000/svg">
  <path d="${d}" fill="none" stroke="${VELLUM.thread}" stroke-width="9" stroke-linecap="round" opacity="0.18"/>
  <path d="${d}" fill="none" stroke="${VELLUM.thread}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="${PIN.x}" cy="${PIN.y}" r="8" fill="${VELLUM.bg}" stroke="${VELLUM.thread}" stroke-width="2.5"/>
</svg>`;
}

const titleWeave = ['under', 'over']
  .map(
    (copy) =>
      `<svg class="title-weave-${copy}" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${TITLE_D}"/></svg>`,
  )
  .join('');
const icon = readFileSync(ICON_SVG, 'utf8');

const card = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
@font-face { font-family: 'Atropyle Fraunces'; src: url(${font('fraunces-latin-standard-normal.woff2')}) format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Atropyle Inter'; src: url(${font('inter-latin-wght-normal.woff2')}) format('woff2'); font-weight: 100 900; }
@font-face { font-family: 'Atropyle Mono'; src: url(${font('jetbrains-mono-latin-wght-normal.woff2')}) format('woff2'); font-weight: 100 800; }
* { box-sizing: border-box; margin: 0; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; }
body {
  position: relative;
  background: ${VELLUM.bg};
  color: ${VELLUM.ink};
  font-family: 'Atropyle Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
}
.layer {
  position: absolute; left: 0; top: ${WARP.top}px; width: ${W}px; height: ${WARP.height}px;
  mask-image: linear-gradient(to right, rgb(0 0 0 / 0.12) ${TEXT_END}px, #000 ${TEXT_END + 160}px);
}
.layer path { vector-effect: non-scaling-stroke; }
.brand { position: absolute; top: 56px; left: 72px; display: flex; align-items: center; gap: 18px; }
.brand svg { display: block; width: 52px; height: 52px; }
.brand span { font-family: 'Atropyle Fraunces', serif; font-size: 38px; font-weight: 600; letter-spacing: -0.01em; }
.chain { position: absolute; top: 72px; right: 72px; font-family: 'Atropyle Mono', monospace; font-size: 19px; color: ${VELLUM['ink-muted']}; letter-spacing: 0.04em; }
.copy { position: absolute; top: 146px; left: 72px; width: 780px; }
.eyebrow { font-size: 19px; font-weight: 600; letter-spacing: 0.16em; text-transform: uppercase; color: ${VELLUM.thread}; }
h1 {
  position: relative; isolation: isolate; width: fit-content; margin-top: 18px;
  font-family: 'Atropyle Fraunces', serif; font-weight: 500; font-size: 84px; line-height: 1.02; letter-spacing: -0.015em;
}
h1 em { font-style: normal; color: ${VELLUM.thread}; }
/* .title-weave of globals.css, in the card's own frame: the copy behind shows between the letters, the copy in front
   only in the top 0.12em of the frame, the leading under line 1. */
.title-weave { position: absolute; inset-inline: 0; top: 1lh; height: calc(100% - 1lh); pointer-events: none; }
.title-weave svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.title-weave path { fill: none; stroke: ${VELLUM.thread}; stroke-width: 3px; stroke-linecap: round; vector-effect: non-scaling-stroke; }
.title-weave-under { z-index: -1; mask-image: linear-gradient(to bottom, #000 45%, transparent 100%); }
.title-weave-over { z-index: 1; mask-image: linear-gradient(to bottom, #000 0.12em, transparent 0.12em); }
.lead { margin-top: 22px; font-size: 27px; line-height: 1.42; color: ${VELLUM['ink-muted']}; }
.foot { position: absolute; left: 72px; right: 72px; bottom: 52px; display: flex; justify-content: space-between; align-items: baseline; }
.run { font-size: 25px; font-weight: 500; }
.run svg { display: inline-block; vertical-align: middle; margin-left: 10px; }
.where b { color: ${VELLUM.thread}; font-weight: 500; }
.where { padding: 4px 0 4px 12px; background: ${VELLUM.bg}; font-family: 'Atropyle Mono', monospace; font-size: 23px; color: ${VELLUM['ink-muted']}; }
</style></head><body>
<div class="layer">${circuitSvg()}</div>
<div class="layer">${threadSvg()}</div>
<div class="brand">${icon}<span>${SHARE.siteName}</span></div>
<div class="chain">X Layer · chain ${chainId}</div>
<div class="copy">
  <p class="eyebrow">Inheritance and wallet recovery on X Layer</p>
  <h1>A circuit decides,<br><em>not an admin.</em><span class="title-weave" aria-hidden="true">${titleWeave}</span></h1>
  <p class="lead">Check in now and then. If you stop, your heirs can claim.</p>
</div>
<div class="foot"><span class="run">Run the proof in your browser${ARROW}</span><span class="where">${HOST}<b>${PROOF_HASH}</b></span></div>
</body></html>`;

const iconPage = (size: number, opaque: boolean) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>* { margin: 0; } html, body { background: ${opaque ? NIGHT.bg : 'transparent'}; } img { display: block; width: ${size}px; height: ${size}px; }</style></head>` +
  `<body><img alt="" src="data:image/svg+xml;base64,${Buffer.from(icon).toString('base64')}"></body></html>`;

async function shoot(
  page: Page,
  html: string,
  width: number,
  height: number,
  out: string,
  transparent: boolean,
  check?: (page: Page) => Promise<void>,
) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  // Before the screenshot: a failed check leaves the committed file as it was.
  await check?.(page);
  writeFileSync(out, await page.screenshot({ type: 'png', omitBackground: transparent }));
  console.log(`${out.slice(out.lastIndexOf('apps'))}: ${width}x${height}`);
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  // Everything is inline, and data: URLs never reach the router: any request at all is a leak.
  let requests = 0;
  await page.route('**/*', (route) => {
    requests += 1;
    return route.abort();
  });
  await shoot(page, card, W, H, SHARE_IMAGE_FILE, false, assertOwnGlyphs);
  const faces = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length);
  if (faces < 3) throw new Error(`only ${faces} of the 3 fonts loaded`);
  for (const { file, size, opaque } of APP_ICONS) {
    await shoot(
      page,
      iconPage(size, opaque),
      size,
      size,
      fileURLToPath(new URL(`../${file}`, import.meta.url)),
      !opaque,
    );
  }
  if (requests > 0) throw new Error(`${requests} request(s) while drawing: everything must be inline`);
} finally {
  await browser.close();
}
