// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const GLOBALS = readFileSync(fileURLToPath(new URL('../../src/app/globals.css', import.meta.url)), 'utf8');

it("paints ExternalLink's masked arrow as a background that forced colours and printing both keep (7C-F1)", () => {
  const rule = /\.ext-arrow\s*\{([^}]*)\}/.exec(GLOBALS.slice(GLOBALS.indexOf('@layer components')))?.[1] ?? '';
  expect(rule).toMatch(/background-color:\s*currentColor;/);
  expect(rule).toMatch(/forced-color-adjust:\s*none;/);
  expect(rule).toMatch(/print-color-adjust:\s*exact;/);
  // Lucide's ArrowUpRight, stroke 1.5, as the inline SVG drew it.
  expect(rule).toContain("stroke-width='1.5'");
  expect(rule).toContain("d='M7 7h10v10M7 17 17 7'");
});
