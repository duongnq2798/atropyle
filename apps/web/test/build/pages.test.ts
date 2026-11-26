import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '@atropyle/sdk';
import { describe, expect, it } from 'vitest';
import { messages as privacy } from '../../src/messages/privacy.messages';
import { messages as status } from '../../src/messages/status.messages';
import { outOf } from './paths';

const XLAYER = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../../deployments/xlayer.json', import.meta.url)), 'utf8'),
) as { factory: string; circuits: { netlistKeccak: { kofn5: string; ge4: string } } };

const textOf = (html: string) => html.replace(/<[^>]*>/g, '');

for (const target of ['vercel', 'deweb'] as const) {
  describe(`${target} pages of 7C T10`, () => {
    const read = (file: string) => readFileSync(join(outOf(target), file), 'utf8');

    it('prerender /developers/ with the pinned commands, the contracts and the reusable circuits', () => {
      const html = read('developers/index.html');
      const text = textOf(html);
      expect(text).toContain(`npx -y atropyle@${VERSION} verify`);
      expect(text).toContain(`npx -y @atropyle/mcp@${VERSION}`);
      expect(text).toContain(`Version ${VERSION} of each package is on npm.`);
      expect(html).toContain(`data-address="${XLAYER.factory}"`);
      expect(text).toContain(XLAYER.circuits.netlistKeccak.kofn5);
      expect(text).toContain(XLAYER.circuits.netlistKeccak.ge4);
    });

    it('prerender /status/ with the counters first and every definition', () => {
      const text = textOf(read('status/index.html'));
      const at = (s: string) => text.indexOf(s);
      expect(at(status.en.countersTitle)).toBeGreaterThan(-1);
      expect(at(status.en.countersTitle)).toBeLessThan(at(status.en.statsTitle));
      expect(at(status.en.statsTitle)).toBeLessThan(at(status.en.integrityTitle));
      for (const k of ['defVaults', 'defDrills', 'defPaid', 'defStablecoins'] as const) {
        expect(text).toContain(status.en[k]);
      }
    });

    it('prerender /privacy/ with every claim', () => {
      const text = textOf(read('privacy/index.html'));
      for (const k of ['email3', 'email4', 'email5', 'me1'] as const) expect(text).toContain(privacy.en[k]);
    });
  });
}
