import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Global Constraints of Plan 7A and spec §11: first-load JS of `/` and of every other route, and all JS of the site.
// Ruling R23 set `/` to 200 kB and other routes to 240 kB: Next 16 + React 19 alone measure about 130 kB.
const HOME_LIMIT = '200 kB';
const ROUTE_LIMIT = '240 kB';
const TOTAL_LIMIT = '900 kB';

/**
 * The build to measure, relative to apps/web: out/ by default. CI also measures the vercel build of
 * `npm run test:build` with SIZE_OUT=test/build/.out/vercel, since only that bundle carries the backend client.
 */
const DIR = process.env.SIZE_OUT?.trim() || 'out';
const OUT = resolve(fileURLToPath(new URL('./', import.meta.url)), DIR);
/** size-limit globs every path; staged copies get plain names, whatever characters the bundler put in its own. */
const STAGE = fileURLToPath(new URL('./.size/', import.meta.url));

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const REBUILD =
  DIR === 'out' ? '`npm run build -w apps/web`' : '`npm run test:build -w apps/web` or the build of SIZE_OUT';
if (!existsSync(join(OUT, 'index.html'))) {
  throw new Error(`apps/web/${DIR} holds no build: run ${REBUILD} first.`);
}
if (existsSync(join(OUT, 'e2e'))) {
  throw new Error(`apps/web/${DIR} holds the e2e build: run ${REBUILD} first.`);
}

/** `/` for out/index.html, `/x/` for out/x/index.html, `/404` for out/404.html. */
function routeOf(file) {
  const rel = relative(OUT, file).split(sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel.slice(0, -'.html'.length)}`;
}

/** The script files a page loads before it is interactive: every <script src>, except the nomodule fallback. */
function scriptsOf(file) {
  const files = [];
  for (const [tag] of readFileSync(file, 'utf8').matchAll(/<script\b[^>]*>/gi)) {
    const src = /\ssrc="([^"]+)"/i.exec(tag)?.[1];
    if (!src || /\snomodule\b/i.test(tag)) continue;
    if (!src.startsWith('/_next/')) throw new Error(`${routeOf(file)} loads a script from outside /_next/: ${src}`);
    const path = join(OUT, ...decodeURIComponent(src.split('?')[0]).split('/'));
    if (!existsSync(path)) throw new Error(`${routeOf(file)} loads ${src}, which is not in out/`);
    files.push(path);
  }
  if (files.length === 0) throw new Error(`${routeOf(file)} loads no script: the HTML of Next changed shape`);
  return files;
}

function stage(name, files) {
  const dir = join(STAGE, name);
  mkdirSync(dir, { recursive: true });
  return files.map((file, i) => {
    copyFileSync(file, join(dir, `${i}.js`));
    return `.size/${name}/${i}.js`;
  });
}

rmSync(STAGE, { recursive: true, force: true });
const pages = walk(OUT)
  .filter((f) => f.endsWith('.html'))
  .sort();

export default [
  ...pages.map((file, i) => ({
    name: `first load of ${routeOf(file)}`,
    path: stage(`route-${i}`, scriptsOf(file)),
    limit: routeOf(file) === '/' ? HOME_LIMIT : ROUTE_LIMIT,
    gzip: true,
  })),
  {
    name: 'all JavaScript of the site',
    path: stage(
      'all',
      walk(join(OUT, '_next', 'static')).filter((f) => f.endsWith('.js')),
    ),
    limit: TOTAL_LIMIT,
    gzip: true,
  },
];
