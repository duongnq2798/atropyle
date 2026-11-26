import type { Page } from '@playwright/test';
import { type E2ELang, type E2ETheme, setStoredLang, setStoredTheme, settle } from './helpers.ts';

export interface Shot {
  theme: E2ETheme;
  lang: E2ELang;
  width: number;
}

/** Ruling R18.13: three shots per screen, all in night: English at 1440 and 390 px, Vietnamese at 390 px. */
export const SCREEN_MATRIX: readonly Shot[] = [
  { theme: 'dark', lang: 'en', width: 1440 },
  { theme: 'dark', lang: 'en', width: 390 },
  { theme: 'dark', lang: 'vi', width: 390 },
];

/** The same three in vellum, only for a vellum surface (the heir letter, a printed page). */
export const VELLUM_MATRIX: readonly Shot[] = SCREEN_MATRIX.map((s): Shot => ({ ...s, theme: 'light' }));

/**
 * The matrix of the spec's design gate (§11: 390, 768 and 1440 px, both themes, both languages), twelve shots for a
 * screen whose layout changes at md, such as the header with a wallet. Ordered so the theme and the language each
 * change as seldom as possible: every change is a reload.
 */
export const FULL_MATRIX: readonly Shot[] = (['dark', 'light'] as const).flatMap((theme, t) =>
  (t === 0 ? (['en', 'vi'] as const) : (['vi', 'en'] as const)).flatMap((lang) =>
    [1440, 768, 390].map((width): Shot => ({ theme, lang, width })),
  ),
);

/** Screens are taken only on demand (SCREENS=1) and once, on the desktop project; the 390 px shots stand for phones. */
export function shouldCapture(projectName: string): boolean {
  return process.env.SCREENS === '1' && projectName === 'desktop';
}

/**
 * Full-page screenshots for the design review, into test-results/screens/<name>/<night|vellum>-<lang>-<width>.png
 * (ignored by git, never compared). The theme and the language change through the stored choice and a reload
 * (Ruling R18.17), so the screen must survive a reload: its state lives in the hash or in session storage, or
 * `ready` brings it back. `ready` runs before every shot, after the reload and the resize, so it must be idempotent
 * (open a menu only when it is closed); it also waits for what hydration draws (a canvas), since settle() only waits
 * for animations. `shots` replaces the matrix (and `vellum`) for a screen that needs more widths. Ends in night and
 * English, at the viewport it started with.
 */
export async function captureScreens(
  page: Page,
  name: string,
  o: { vellum?: boolean; shots?: readonly Shot[]; ready?: (page: Page) => Promise<void> } = {},
): Promise<void> {
  const start = page.viewportSize();
  const shots = o.shots ?? (o.vellum ? [...SCREEN_MATRIX, ...VELLUM_MATRIX] : SCREEN_MATRIX);
  let theme: E2ETheme | null = null;
  let lang: E2ELang | null = null;
  for (const shot of shots) {
    if (shot.theme !== theme) {
      await setStoredTheme(page, shot.theme);
      theme = shot.theme;
    }
    if (shot.lang !== lang) {
      await setStoredLang(page, shot.lang);
      lang = shot.lang;
    }
    await page.setViewportSize({ width: shot.width, height: 900 });
    await o.ready?.(page);
    await settle(page);
    const scheme = shot.theme === 'dark' ? 'night' : 'vellum';
    await page.screenshot({
      path: `test-results/screens/${name}/${scheme}-${shot.lang}-${shot.width}.png`,
      fullPage: true,
    });
  }
  await setStoredLang(page, 'en');
  await setStoredTheme(page, 'dark');
  if (start) await page.setViewportSize(start);
}
