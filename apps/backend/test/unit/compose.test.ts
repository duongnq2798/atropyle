import { describe, expect, it } from 'vitest';
import {
  SAMPLE_CONFIG,
  SAMPLE_CONFIRM,
  SAMPLE_HEIR,
  SAMPLE_TOKEN,
  SAMPLE_UNSUB,
  SAMPLE_VAULT,
  sampleInput,
} from '../../emails/samples';
import { composeEmail } from '../../src/email/compose';
import { COPY } from '../../src/email/copy';
import { EMAIL_KINDS } from '../../src/email/kinds';
import { TEMPLATES } from '../../src/email/templates.gen';
import { LANGS } from '../../src/types';

const SITE = `${SAMPLE_CONFIG.siteUrl}/`;
const hrefs = (html: string) => [...html.matchAll(/href="([^"]*)"/g)].map((m) => (m[1] ?? '').replace(/&amp;/g, '&'));
const urls = (text: string) => text.match(/https?:\/\/\S+/g) ?? [];

describe('composed emails (spec §9.4, §11 Email row)', () => {
  for (const kind of EMAIL_KINDS) {
    for (const lang of LANGS) {
      describe(`${kind}.${lang}`, () => {
        const mail = composeEmail(SAMPLE_CONFIG, sampleInput(kind, lang));

        it('matches its HTML and text snapshots', async () => {
          await expect(mail.html).toMatchFileSnapshot(`../__snapshots__/emails/${kind}.${lang}.html`);
          await expect(`Subject: ${mail.subject}\n\n${mail.text}`).toMatchFileSnapshot(
            `../__snapshots__/emails/${kind}.${lang}.txt`,
          );
        });

        it('links only to the site, and has no placeholder left', () => {
          const links = [...hrefs(mail.html), ...urls(mail.text)];
          expect(links.length).toBeGreaterThanOrEqual(4);
          for (const l of links) expect(l.startsWith(SITE), l).toBe(true);
          for (const s of [mail.subject, mail.html, mail.text]) expect(s).not.toMatch(/\{\{/);
        });

        it('carries the one-click unsubscribe headers of RFC 8058 and the never-sign line', () => {
          expect(mail.headers).toEqual({
            'List-Unsubscribe': `<${SAMPLE_CONFIG.apiUrl}/unsubscribe?t=${SAMPLE_UNSUB}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          });
          expect(mail.html).toContain(COPY[lang].footer.never);
          expect(mail.text).toContain(COPY[lang].footer.never);
          expect(mail).toMatchObject({ from: SAMPLE_CONFIG.mailFrom, to: 'reader@example.com' });
          expect(mail.tags).toEqual([{ name: 'kind', value: kind }]);
        });
      });
    }
  }

  it('points each kind at the page of spec §9.6', () => {
    const action = (kind: (typeof EMAIL_KINDS)[number]) =>
      hrefs(composeEmail(SAMPLE_CONFIG, sampleInput(kind, 'en')).html).filter((h) => !h.includes('/alerts/unsub'));
    expect(action('confirm')).toEqual([`${SITE}alerts/confirm/#t=${SAMPLE_CONFIRM}`]);
    expect(action('alarm-owner')).toEqual([`${SITE}vault/#${SAMPLE_VAULT}`]);
    // Controller ruling: the drill summary opens the vault page; no email links to /create/.
    expect(action('drill-summary')).toEqual([`${SITE}vault/#${SAMPLE_VAULT}`]);
    expect(hrefs(composeEmail(SAMPLE_CONFIG, sampleInput('welcome', 'vi')).html)).toContain(
      `${SITE}alerts/unsubscribe/#t=${SAMPLE_UNSUB}`,
    );
  });

  it('puts no token in any query string sent to the site', () => {
    for (const kind of EMAIL_KINDS) {
      const mail = composeEmail(SAMPLE_CONFIG, sampleInput(kind, 'en'));
      for (const l of [...hrefs(mail.html), ...urls(mail.text)]) expect(l, l).not.toContain('?');
    }
  });

  it('escapes values in the HTML part, leaves them in subject and text, and inserts only transfersHtml raw', () => {
    const t = {
      subject: '{{siteHost}}',
      html: '<p>{{siteHost}}</p>{{{transfersHtml}}}',
      text: '{{siteHost}} | {{transfersText}}',
    };
    const templates = { ...TEMPLATES, distributed: { en: t, vi: t } };
    const cfg = { ...SAMPLE_CONFIG, siteHost: '<b>&' };
    const mail = composeEmail(cfg, sampleInput('distributed', 'en'), templates);
    expect(mail.subject).toBe('<b>&');
    expect(mail.text.startsWith('<b>& | 10000 of token')).toBe(true);
    expect(mail.html.startsWith('<p>&lt;b&gt;&amp;</p><p class="at-ink"')).toBe(true);
  });

  it('fills the facts: deadline in both time zones, payouts by token address, counts', () => {
    const vi = composeEmail(SAMPLE_CONFIG, sampleInput('checkin-80', 'vi'));
    expect(vi.text).toContain('Hạn chót: 14:05 UTC, 23/11/2026 (21:05, 23/11/2026 giờ Việt Nam)');
    const paid = composeEmail(SAMPLE_CONFIG, sampleInput('distributed', 'en'));
    expect(paid.text).toContain(`10000 of token ${SAMPLE_TOKEN} to ${SAMPLE_HEIR}`);
    expect(paid.html).toContain(`10000 of token ${SAMPLE_TOKEN} to ${SAMPLE_HEIR}`);
    const summary = composeEmail(SAMPLE_CONFIG, sampleInput('drill-summary', 'en'));
    expect(summary.text).toContain('Check-ins: 3');
    expect(summary.text).toContain('Alarms: 1');
    expect(summary.text).toContain(COPY.en.fragments.summaryNotReleased);
  });

  it('refuses to build a confirm email without its token, or an alarm without a deadline', () => {
    expect(() => composeEmail(SAMPLE_CONFIG, { ...sampleInput('confirm', 'en'), confirmToken: undefined })).toThrow(
      /confirm token/,
    );
    expect(() => composeEmail(SAMPLE_CONFIG, { ...sampleInput('alarm-owner', 'en'), facts: {} })).toThrow(
      /\{\{deadline\}\}/,
    );
  });
});
