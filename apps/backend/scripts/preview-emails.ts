import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SAMPLE_CONFIG, sampleInput } from '../emails/samples';
import { composeEmail } from '../src/email/compose';
import { EMAIL_KINDS } from '../src/email/kinds';
import { LANGS } from '../src/types';

// npm run emails:preview -w apps/backend, then open apps/backend/.preview/index.html in a browser.
// Toggle the browser or OS dark mode to see the dark palette. Nothing is sent and nothing is fetched.
const dir = fileURLToPath(new URL('../.preview/', import.meta.url));
mkdirSync(dir, { recursive: true });
const items: string[] = [];
for (const kind of EMAIL_KINDS) {
  for (const lang of LANGS) {
    const mail = composeEmail(SAMPLE_CONFIG, sampleInput(kind, lang));
    writeFileSync(`${dir}${kind}.${lang}.html`, mail.html);
    writeFileSync(`${dir}${kind}.${lang}.txt`, `Subject: ${mail.subject}\n\n${mail.text}`);
    items.push(
      `<li><a href="${kind}.${lang}.html">${kind} (${lang})</a> - <a href="${kind}.${lang}.txt">text</a></li>`,
    );
  }
}
writeFileSync(
  `${dir}index.html`,
  `<!doctype html><meta charset="utf-8"><title>Atropyle emails</title><ul>${items.join('')}</ul>`,
);
console.log(`wrote ${items.length} previews to ${dir}`);
