import { expect, test } from './fixtures.ts';

interface Manifest {
  icons: { src: string; sizes: string }[];
}

test('the manifest and every icon it names load from the site, and the page links the Apple icon', async ({
  page,
  state,
}) => {
  // Chromium reports a broken manifest or icon in the console, not as a page error.
  const notes: string[] = [];
  page.on('console', (m) => {
    if (/manifest|icon/i.test(m.text())) notes.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto(state.siteUrl);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
  const res = await page.request.get(new URL('manifest.webmanifest', state.siteUrl).href);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/manifest+json');
  const { icons } = (await res.json()) as Manifest;
  const apple = (await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')) ?? '';
  expect(apple).toMatch(/^\/apple-icon\.png/);
  // Loaded the way the page loads images: same origin, under its img-src.
  const sizes = await page.evaluate(
    (srcs) =>
      Promise.all(
        srcs.map(
          (src) =>
            new Promise<string>((done, fail) => {
              const img = new Image();
              img.onload = () => done(`${img.naturalWidth}x${img.naturalHeight}`);
              img.onerror = () => fail(new Error(`${src} did not load`));
              img.src = src;
            }),
        ),
      ),
    [...icons.map((i) => i.src), apple],
  );
  expect(sizes).toEqual([...icons.map((i) => i.sizes), '180x180']);
  expect(notes).toEqual([]);
});
