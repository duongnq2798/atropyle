import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS_BASE_URL, ERROR_INFO } from '../../packages/sdk/src/index';

/** The CLI's JSON schemas; their $id points at DOCS_BASE_URL/schemas/<name>.json (packages/cli/scripts/gen-schemas.ts). */
export const SCHEMAS_DIR = join(import.meta.dirname, '..', '..', 'packages', 'cli', 'schemas');

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
/** Escaped, with `code` spans as <code>. The texts are the SDK's own, never chain data. */
const inline = (s: string) => escapeHtml(s).replace(/`([^`]+)`/g, '<code>$1</code>');

// Light only, in the Vellum palette of the site (a decision of the maintainer on 26 Nov 2026).
const STYLE = `:root{color-scheme:only light}
body{margin:0 auto;max-width:44rem;padding:2rem 1rem;font:16px/1.55 system-ui,sans-serif;color:#16130f;background:#f6f1e7}
h1{font-size:1.6rem;margin:0 0 .25rem}h2{font:600 1rem/1.4 ui-monospace,monospace;margin:1.75rem 0 .25rem}
p{margin:.25rem 0}code{font:.9em ui-monospace,monospace;background:#e7dfd1;padding:.05em .3em;border-radius:3px}
a{color:#86590e}.hint{color:#5e574c}`;

/** No script, one hashed inline style, nothing from another origin. */
function page(title: string, body: string): string {
  const hash = createHash('sha256').update(STYLE).digest('base64');
  const csp = `default-src 'none'; style-src 'sha256-${hash}'; img-src 'self'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="only light">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/** One section per SDK error code; its id is the anchor that errorDocsUrl() links to (the code in lower case). */
export function errorsPage(info: Readonly<Record<string, { message: string; hint: string }>> = ERROR_INFO): string {
  const sections = Object.entries(info)
    .map(
      ([code, e]) =>
        `<section id="${code.toLowerCase()}">\n<h2>${escapeHtml(code)}</h2>\n<p>${inline(e.message)}</p>\n<p class="hint">${inline(e.hint)}</p>\n</section>`,
    )
    .join('\n');
  return page(
    'Atropyle error codes',
    `<h1>Error codes</h1>
<p>Every error that the Atropyle SDK, CLI and MCP server report has a <code>code</code>, a message and a hint. The JSON output links here with <code>docsUrl</code>.</p>
<p><a href="../../">Open the app</a></p>
${sections}`,
  );
}

function indexPage(schemas: readonly string[]): string {
  const items = schemas.map((f) => `<li><a href="schemas/${escapeHtml(f)}">${escapeHtml(f)}</a></li>`).join('\n');
  return page(
    'Atropyle docs',
    `<h1>Atropyle docs</h1>
<p><a href="../">Open the app</a> · <a href="reference/errors.html">Error codes</a></p>
<h2>JSON schemas of <code>atropyle --json</code></h2>
<ul>
${items}
</ul>`,
  );
}

/**
 * Writes `docs/` of the production site: the error reference and the CLI schemas, so every URL under DOCS_BASE_URL
 * that the SDK, the CLI or a schema $id names resolves. Returns the paths written, relative to `out`.
 */
export function writeSiteDocs(out: string, schemasDir: string = SCHEMAS_DIR): string[] {
  const docs = join(out, 'docs');
  mkdirSync(join(docs, 'reference'), { recursive: true });
  mkdirSync(join(docs, 'schemas'), { recursive: true });
  writeFileSync(join(docs, 'reference', 'errors.html'), errorsPage());
  const schemas = readdirSync(schemasDir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  for (const f of schemas) cpSync(join(schemasDir, f), join(docs, 'schemas', f));
  writeFileSync(join(docs, 'index.html'), indexPage(schemas));
  return ['docs/index.html', 'docs/reference/errors.html', ...schemas.map((f) => `docs/schemas/${f}`)];
}

/** Where DOCS_BASE_URL lives; the vercel target serves it at the root of its domain. */
export const DOCS_ORIGIN = new URL(DOCS_BASE_URL).origin;
