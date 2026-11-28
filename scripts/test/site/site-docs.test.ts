import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DOCS_BASE_URL, ERROR_INFO, errorDocsUrl } from '../../../packages/sdk/src/index';
import {
  DOCS_ORIGIN,
  errorAnchors,
  errorsPage,
  referencedDocsPaths,
  SCHEMAS_DIR,
  writeSiteDocs,
} from '../../lib/site-docs';

const out = mkdtempSync(join(tmpdir(), 'atropyle-docs-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));
const written = writeSiteDocs(out);
const html = readFileSync(join(out, 'docs', 'reference', 'errors.html'), 'utf8');

describe('the docs of the production site', () => {
  it('lives on the domain that the root vercel.json serves', () => {
    expect(DOCS_BASE_URL).toBe('https://atropyle.xyz/docs');
    expect(DOCS_ORIGIN).toBe('https://atropyle.xyz');
  });

  it('has a section for the anchor of every docsUrl the SDK prints', () => {
    for (const code of Object.keys(ERROR_INFO)) {
      const url = new URL(errorDocsUrl(code));
      expect(`${url.origin}${url.pathname}`).toBe(`${DOCS_BASE_URL}/reference/errors.html`);
      expect(html, code).toContain(`<section id="${url.hash.slice(1)}">`);
    }
  });

  it('serves every CLI schema at the path of its $id', () => {
    const schemas = readdirSync(SCHEMAS_DIR).filter((f) => f.endsWith('.json'));
    expect(schemas.length).toBeGreaterThan(5);
    for (const f of schemas) {
      const id = (JSON.parse(readFileSync(join(out, 'docs', 'schemas', f), 'utf8')) as { $id: string }).$id;
      expect(id).toBe(`${DOCS_BASE_URL}/schemas/${f}`);
      expect(written).toContain(`docs/schemas/${f}`);
    }
  });

  it('runs no script and loads nothing from another origin; its one style is allowed by hash', () => {
    for (const f of ['docs/index.html', 'docs/reference/errors.html']) {
      const page = readFileSync(join(out, f), 'utf8');
      expect(page, f).not.toMatch(/<script|https?:\/\//);
      const style = /<style>([\s\S]*?)<\/style>/.exec(page)?.[1] ?? '';
      const hash = createHash('sha256').update(style).digest('base64');
      expect(page, f).toContain(`style-src 'sha256-${hash}'`);
      expect(page, f).toContain("default-src 'none'");
    }
  });

  it('escapes the texts and shows `code` spans as code', () => {
    const page = errorsPage({ X_Y: { message: 'a <b> & `c`', hint: '"q"' } });
    expect(page).toContain('<p>a &lt;b&gt; &amp; <code>c</code></p>');
    expect(page).toContain('<p class="hint">&quot;q&quot;</p>');
    expect(page).toContain('<section id="x_y">');
  });

  it('lists every docs path the SDK, the CLI and the schema $ids link to, and writes each one', () => {
    const paths = referencedDocsPaths();
    expect(paths.slice(0, 2)).toEqual(['docs/index.html', 'docs/reference/errors.html']);
    const schemas = readdirSync(SCHEMAS_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();
    expect(paths.slice(2)).toEqual(schemas.map((f) => `docs/schemas/${f}`));
    for (const p of paths) expect(written, p).toContain(p);
    expect(errorAnchors()).toEqual(Object.keys(ERROR_INFO).map((code) => code.toLowerCase()));
  });

  it('refuses a schema whose $id is not under DOCS_BASE_URL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atropyle-schemas-'));
    try {
      writeFileSync(join(dir, 'x.json'), JSON.stringify({ $id: 'https://elsewhere.example/x.json' }));
      expect(() => referencedDocsPaths(dir)).toThrow(`x.json: its $id is not under ${DOCS_BASE_URL}/`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
