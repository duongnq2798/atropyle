import { COPY } from '../src/email/copy';
import { type EmailKind, FACTS } from '../src/email/kinds';
import type { Lang } from '../src/types';

/** The plain-text part, written by hand (html-to-text would shout every heading in capitals). */
export function textTemplate(kind: EmailKind, lang: Lang): string {
  const c = COPY[lang];
  const k = c.kinds[kind];
  const lines: string[] = [k.heading, ''];
  for (const p of k.body) lines.push(p, '');
  const facts = FACTS[kind];
  for (const f of facts) lines.push(`${c.labels[f]}: {{${f}}}`);
  if (facts.length > 0) lines.push('');
  if (kind === 'distributed') lines.push(`${c.labels.transfers}:`, '{{transfersText}}', '');
  lines.push(`${k.cta}: {{actionUrl}}`, '');
  if (k.note) lines.push(k.note, '');
  lines.push(`${c.labels.vault}: {{vault}}`, `${c.labels.role}: {{roleLabel}}`, c.labels.compare, '');
  lines.push('--', c.footer.never, c.footer.why, `${c.footer.unsubscribe}: {{unsubscribeUrl}}`, c.footer.beta, '');
  return lines.join('\n');
}
