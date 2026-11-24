import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { type Browser, chromium } from '@playwright/test';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { revealTransforms } from '../../src/motion/reveal-window';
import { SPRING_EASING } from '../../src/motion/tokens';

/**
 * The boxes of a RevealWindow in a real browser, through moves that cut into each other. This file reads no build
 * output: it sits here because this suite runs where Chromium is installed (CI installs it before test:build). The
 * page loads src/motion/move.ts and tokens.ts as they are, turned into JavaScript by TypeScript, and lays out the
 * DOM of a RevealWindow and of the "now" point on a 1000 px thread.
 */
const ORIGIN = 'http://reveal.check';
const source = (name: string) =>
  ts.transpileModule(readFileSync(fileURLToPath(new URL(`../../src/motion/${name}.ts`, import.meta.url)), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;

const PAGE = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0 }
  #root { position: relative; width: 1000px; height: 200px; overflow: clip }
  .box { position: absolute; inset: 0 }
  .clip { overflow: hidden }
  i { position: absolute; left: 0; top: 0; width: 1px; height: 1px }
</style>
<div id="root">
  <div id="outer" class="box clip"><div id="middle" class="box clip"><div id="inner" class="box"><i id="mark"></i></div></div></div>
  <span id="now" class="box"><i id="dot"></i></span>
</div>
<script type="module">
  import { moveTogether } from '/move';
  window.moveTogether = moveTogether;
  document.body.dataset.ready = '1';
</script>`;

/** One step of a scenario: when (ms after the first move), and the window [from, to] with "now" on its left edge. */
type Step = { at: number; from: number; to: number };
type Mode = 'together' | 'css';
interface Drift {
  /** The worst offset of the content from where it belongs, px: the boxes no longer sum to zero. */
  content: number;
  /** The worst gap between "now" and the left edge of the window, px. */
  now: number;
}

const SCENARIOS: Record<string, { start: Omit<Step, 'at'>; steps: Step[] }> = {
  // Both edges move, and 60 ms later only the left one does.
  'one edge cuts into a move of both': {
    start: { from: 25, to: 75 },
    steps: [
      { at: 0, from: 40, to: 83 },
      { at: 60, from: 45, to: 83 },
    ],
  },
  // Both edges move, and the left one goes back where it came from.
  'a reversal': {
    start: { from: 25, to: 75 },
    steps: [
      { at: 0, from: 40, to: 83 },
      { at: 60, from: 25, to: 83 },
    ],
  },
  // The Scrubber of Plan 7B: one arrow key crosses the alarm (the window's end jumps from 75 % to the gate at
  // 83 %), then three key repeats 33 ms apart move only "now".
  'a key held across the alarm': {
    start: { from: 60, to: 75 },
    steps: [
      { at: 0, from: 76, to: 83 },
      { at: 33, from: 77, to: 83 },
      { at: 66, from: 78, to: 83 },
      { at: 99, from: 79, to: 83 },
    ],
  },
};

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
});

async function measure(mode: Mode, scenario: (typeof SCENARIOS)[string]): Promise<Drift> {
  const page = await browser.newPage();
  try {
    await page.route(`${ORIGIN}/**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: PAGE });
      if (path === '/move' || path === '/tokens') {
        return route.fulfill({ contentType: 'text/javascript', body: source(path.slice(1)) });
      }
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto(`${ORIGIN}/`);
    await page.waitForSelector('body[data-ready="1"]');
    const frames = [scenario.start, ...scenario.steps].map((s) => ({
      box: revealTransforms(s.from, s.to),
      now: `translate(${s.from}%, 50%)`,
    }));
    return await page.evaluate(
      async ({ mode, frames, at, easing }) => {
        type MoveFn = (moves: [HTMLElement, string][], move?: 'spring' | 'instant') => void;
        const moveTogether = (window as unknown as { moveTogether: MoveFn }).moveTogether;
        const el = (id: string) => document.getElementById(id) as HTMLElement;
        const [root, outer, middle, inner, now, mark, dot] = [
          'root',
          'outer',
          'middle',
          'inner',
          'now',
          'mark',
          'dot',
        ].map(el);
        const boxes = [outer, middle, inner];
        const put = (f: (typeof frames)[number], how: 'spring' | 'instant') => {
          if (mode === 'css') {
            boxes.forEach((b, i) => {
              b.style.transform = f.box[i];
            });
            now.style.transform = f.now;
            return;
          }
          // As the Thread does it: the RevealWindow's layout effect, then the "now" point's, in one commit.
          moveTogether(
            boxes.map((b, i): [HTMLElement, string] => [b, f.box[i]]),
            how,
          );
          moveTogether([[now, f.now]], how);
        };
        put(frames[0], 'instant');
        if (mode === 'css') {
          for (const e of [...boxes, now]) e.style.transition = `transform 443ms ${easing}`;
        }
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const left = (e: Element) => e.getBoundingClientRect().left - root.getBoundingClientRect().left;
        const worst = { content: 0, now: 0 };
        const start = performance.now();
        frames.slice(1).forEach((f, i) => {
          if (at[i] === 0) put(f, 'spring');
          else setTimeout(() => put(f, 'spring'), at[i]);
        });
        await new Promise<void>((done) => {
          const sample = () => {
            worst.content = Math.max(worst.content, Math.abs(left(mark)));
            worst.now = Math.max(worst.now, Math.abs(left(dot) - left(outer)));
            if (performance.now() - start < 800) requestAnimationFrame(sample);
            else done();
          };
          requestAnimationFrame(sample);
        });
        return worst;
      },
      { mode, frames, at: scenario.steps.map((s) => s.at), easing: SPRING_EASING },
    );
  } finally {
    await page.close();
  }
}

describe('RevealWindow in Chromium (moveTogether)', () => {
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    it(`keeps the content in place and "now" on the window's edge: ${name}`, async () => {
      const together = await measure('together', scenario);
      expect(together.content).toBeLessThan(0.5);
      expect(together.now).toBeLessThan(0.5);
      // CSS transitions on the same values drift, so the check above can fail.
      const css = await measure('css', scenario);
      expect(css.content).toBeGreaterThan(5);
    });
  }
});
