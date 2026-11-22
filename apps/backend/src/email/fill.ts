const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

const SLOT = /\{\{\{([A-Za-z]+)\}\}\}|\{\{([A-Za-z]+)\}\}/g;

/**
 * Fills {{name}} (escaped in HTML) and {{{name}}} (raw, HTML only) in one pass, so a value is never read again
 * as a template. A missing value throws: an email with a hole in it is never sent.
 */
export function fill(template: string, vars: Readonly<Record<string, string>>, mode: 'html' | 'text'): string {
  return template.replace(SLOT, (_match, raw: string | undefined, name: string | undefined) => {
    const key = raw ?? name ?? '';
    const value = vars[key];
    if (value === undefined) throw new Error(`missing email value {{${key}}}`);
    if (raw !== undefined) {
      if (mode !== 'html') throw new Error(`{{{${key}}}} is HTML-only`);
      return value;
    }
    return mode === 'html' ? escapeHtml(value) : value;
  });
}

export function placeholdersOf(template: string): string[] {
  return [...new Set([...template.matchAll(SLOT)].map((m) => m[1] ?? m[2] ?? ''))];
}
